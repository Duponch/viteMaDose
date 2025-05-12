// src/World/InstancedMeshManager.js
import * as THREE from 'three';

/**
 * @typedef {import('../CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Buildings/HouseRenderer.js').default} HouseRenderer
 * @typedef {import('../Buildings/BuildingRenderer.js').default} BuildingRenderer
 * @typedef {import('../Buildings/SkyscraperRenderer.js').default} SkyscraperRenderer
 * @typedef {import('../../Experience.js').default} Experience
 */

/**
 * Crée et gère les objets THREE.InstancedMesh à partir des données d'instance collectées.
 * Gère également la mise à jour des éléments spécifiques comme les fenêtres.
 */
export default class InstancedMeshManager {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Collection de matériaux partagés (ex: crosswalkMaterial).
     * @param {CityAssetLoader} assetLoader - Pour accéder aux données des assets chargés.
     * @param {object} specificRenderers - Contient les instances des renderers spécialisés { houseRenderer, buildingRenderer, skyscraperRenderer, commercialRenderer }.
     * @param {THREE.Group} parentGroup - Le groupe de scène auquel ajouter les InstancedMesh créés.
     * @param {Experience} experience - Référence à l'instance Experience (pour envMap, etc.).
     */
    constructor(config, materials, assetLoader, specificRenderers, parentGroup, experience) {
        this.config = config;
        this.materials = materials;
        this.assetLoader = assetLoader;
        this.renderers = specificRenderers; // { houseRenderer, buildingRenderer, skyscraperRenderer, commercialRenderer }
        this.parentGroup = parentGroup;
        this.experience = experience;

        /** @type {Object.<string, THREE.InstancedMesh>} */
        this.instancedMeshes = {}; // Stocke les meshes créés, clé = type_idOrKey
        /** @type {Array<THREE.InstancedMesh>} */
        this.windowMeshes = []; // Références spécifiques aux meshes de fenêtres pour l'update

        // Géométrie de base pour les passages piétons (si applicable)
        this.stripeBaseGeometry = null;
        if (this.config.crosswalkStripeWidth > 0 && this.config.crosswalkHeight > 0) {
            // Utiliser une profondeur arbitraire (ex: 1.0) car elle sera mise à l'échelle par la matrice
            this.stripeBaseGeometry = new THREE.BoxGeometry(
                this.config.crosswalkStripeWidth,
                this.config.crosswalkHeight,
                1.0 // Profondeur de base, sera écrasée par la matrice
            );
        }

        // On n'initialise plus de géométrie et matériau basiques pour les commerces
        // puisque ceux-ci utiliseront désormais le renderer procédural

        console.log("InstancedMeshManager initialized.");
    }

    /**
     * Crée tous les InstancedMesh basés sur les données fournies.
     * @param {Object.<string, Object.<string, Array<THREE.Matrix4>>>} instanceData - Données provenant de InstanceDataManager.
     */
    createMeshes(instanceData) {
        console.log("InstancedMeshManager: Creating InstancedMeshes (Corrected)...");
        this.reset(); // Nettoyer les anciens meshes avant d'en créer de nouveaux

        let totalMeshesCreated = 0;
        let totalInstancesCreated = 0;

        for (const type in instanceData) {
            if (!instanceData.hasOwnProperty(type)) continue;

            for (const idOrKey in instanceData[type]) {
                if (!instanceData[type].hasOwnProperty(idOrKey)) continue;

                const matrices = instanceData[type][idOrKey];
                if (!matrices || matrices.length === 0) {
                    continue; // Pas d'instances pour cette clé
                }

                let geometry = null;
                let material = null; // Sera déterminé dans le switch
                let isHouseWindowPart = false; // Flag spécifique pour les fenêtres de maison (pour clonage/envmap)
                let castShadow = true;
                let receiveShadow = true; // Sera ajusté pour les fenêtres plus tard
                const meshKey = `${type}_${idOrKey}`; // Clé unique pour stocker le mesh

                try {
                    // --- Déterminer Géométrie et Matériau (sans déterminer isWindow ici) ---
                    switch (type) {
                        case 'commercial': {
                            // Au lieu d'utiliser un cube simple, on génère un bâtiment commercial procédural
                            if (!this.renderers.commercialRenderer) {
                                console.warn(`[IMM] Commercial renderer not found, falling back to basic cube`);
                                // Fallback au cube de base si le renderer n'est pas disponible
                                geometry = new THREE.BoxGeometry(1, 1, 1);
                                material = new THREE.MeshStandardMaterial({
                                    color: 0x80d0ff,  // Bleu clair
                                    emissive: 0x2080c0, // Émission bleutée
                                    emissiveIntensity: 0.5,
                                    name: "CommercialBuildingFallbackMat"
                                });
                                break;
                            }
                            
                            // Utiliser un identifiant de clé pour le commerce
                            const commercialKey = 'commercial_proc_0';
                            // Vérifier si l'asset existe déjà dans l'assetLoader
                            let assetData = this.assetLoader.getAssetDataById(commercialKey);
                            
                            if (!assetData) {
                                // Générer l'asset commercial s'il n'existe pas encore
                                const commercialAsset = this.renderers.commercialRenderer.generateProceduralBuilding(1, 1, 1);
                                if (commercialAsset) {
                                    // Enregistrer l'asset généré
                                    this.assetLoader.registerAssetData(commercialKey, commercialAsset);
                                    assetData = commercialAsset;
                                } else {
                                    console.error(`[IMM] Failed to generate commercial building asset`);
                                    continue;
                                }
                            }
                            
                            // Gérer les parties (comme pour les autres assets procéduraux)
                            if (assetData.parts && assetData.parts.length > 0) {
                                assetData.parts.forEach((part, index) => {
                                    if (!part.geometry || !part.material) {
                                        console.warn(`[IMM] Invalid part data for commercial asset, part index: ${index}`);
                                        return;
                                    }

                                    // Déterminer si cette partie est une fenêtre
                                    const isPartWindow = (
                                        part.material.name === "CommercialWindowMat" || 
                                        part.material.name === "CommercialBalconyWindowMat" 
                                    );

                                    const count = matrices.length;
                                    // Cloner le matériau pour éviter les modifications partagées
                                    const partMaterialClone = part.material.clone();
                                    partMaterialClone.name = `Inst_${commercialKey}_part${index}`;

                                    const instancedMesh = new THREE.InstancedMesh(part.geometry, partMaterialClone, count);
                                    instancedMesh.castShadow = castShadow;
                                    instancedMesh.receiveShadow = !isPartWindow;
                                    instancedMesh.name = `${commercialKey}_part${index}`;

                                    matrices.forEach((matrix, mIndex) => {
                                        instancedMesh.setMatrixAt(mIndex, matrix);
                                    });
                                    instancedMesh.instanceMatrix.needsUpdate = true;

                                    this.parentGroup.add(instancedMesh);
                                    this.instancedMeshes[`commercial_${commercialKey}_part${index}`] = instancedMesh;
                                    totalMeshesCreated++;
                                    totalInstancesCreated += count;

                                    // Ajouter aux fenêtres si applicable
                                    if (isPartWindow) {
                                        this.windowMeshes.push(instancedMesh);
                                        // Appliquer envMap si nécessaire
                                        if (this.experience?.scene?.environment) {
                                            if (!partMaterialClone.envMap) partMaterialClone.envMap = this.experience.scene.environment;
                                        }
                                    }
                                });
                                // Important : continuer à la prochaine clé car les meshes ont déjà été créés
                                continue; // Passe à l'itération suivante de la boucle idOrKey
                            } else {
                                console.warn(`[IMM] Commercial asset has no parts, unexpected state`);
                                continue;
                            }
                        }
                        
                        case 'house': {
                            const partName = idOrKey; // Pour 'house', idOrKey est le partName
                            geometry = this.renderers.houseRenderer?.baseHouseGeometries[partName];
                            material = this.renderers.houseRenderer?.baseHouseMaterials[partName];

                            if (!geometry) {
                                console.warn(`[IMM] Missing geometry for house part: ${partName}`);
                                continue;
                            }
                            if (!material) {
                                // Tenter de récupérer le matériau 'window' si c'est une partie fenêtre nommée
                                if (partName === 'windowXY' || partName === 'windowYZ') {
                                    material = this.renderers.houseRenderer?.baseHouseMaterials?.window;
                                    if (material) {
                                        isHouseWindowPart = true; // Marquer comme fenêtre de maison
                                        // Le clonage et la configuration se feront APRES la vérification isWindowFinal
                                    } else {
                                        console.warn(`[IMM] Missing specific material and base window material for house part: ${partName}`);
                                        continue;
                                    }
                                } else {
                                    console.warn(`[IMM] Missing material for non-window house part: ${partName}`);
                                    continue;
                                }
                            } else if (material.name === "HouseWindowMat") { // Vérifier aussi le nom du matériau récupéré
                                isHouseWindowPart = true;
                                // Le clonage et la configuration se feront APRES la vérification isWindowFinal
                            }
                            break;
                        } // Fin case 'house'

                        case 'building':
                        case 'skyscraper': {
                             // Clé est assetId_partName (ex: 'building_proc_0_part0') OU assetId si modèle standard
                             let assetId = idOrKey;
                             let partName = 'default'; // Pour assets standards

                             // Gérer le cas des assets procéduraux avec parties
                             if (idOrKey.includes('_part')) {
                                 const parts = idOrKey.split('_');
                                 partName = parts.pop(); // 'part0', 'part1', etc.
                                 assetId = parts.join('_'); // 'building_proc_0', 'skyscraper_newModel_X', etc.
                             }

                             const assetData = this.assetLoader.getAssetDataById(assetId);
                             if (!assetData) {
                                console.warn(`[IMM] Asset data not found for ${type} ID: ${assetId} (from key ${idOrKey})`);
                                continue;
                             }

                             if (assetData.parts && assetData.parts.length > 0 && partName !== 'default') {
                                 // Asset procédural avec parties
                                 let partIndex = -1;
                                 if (partName.startsWith('part')) {
                                     partIndex = parseInt(partName.substring(4), 10);
                                 }
                                 const part = (partIndex !== -1 && assetData.parts[partIndex]) ? assetData.parts[partIndex] : null;

                                 if (!part || !part.geometry || !part.material) {
                                     console.warn(`[IMM] Invalid part data for ${type} asset ${assetId}, part key: ${partName}`);
                                     continue;
                                 }
                                 geometry = part.geometry;
                                 material = part.material; // Utiliser le matériau de la partie directement
                             } else if (!assetData.parts && partName === 'default') {
                                 // Asset standard (non procédural avec 'parts')
                                 if (!assetData.geometry || !assetData.material) {
                                    console.warn(`[IMM] Asset data invalid for standard ${type} ID: ${assetId}`);
                                    continue;
                                 }
                                 geometry = assetData.geometry;
                                 material = assetData.material;
                             } else {
                                 console.warn(`[IMM] Discrepancy in asset structure for ${type} ID: ${assetId}, key: ${idOrKey}. Expected parts? ${!!assetData.parts}`);
                                 continue;
                             }
                             break;
                        } // Fin case 'building'/'skyscraper'

                        case 'industrial':
                        case 'park':
                        case 'tree': {
                            // Logique existante pour ces types (avec gestion des parts si applicable)
                            const assetId = idOrKey;
                            const assetData = this.assetLoader.getAssetDataById(assetId);
                            if (!assetData) {
                                console.warn(`[IMM] Asset data not found for ${type} ID: ${assetId}`);
                                continue;
                            }

                            if (assetData.parts && assetData.parts.length > 0) {
                                // Gérer les parties séparément (chaque partie devient un InstancedMesh)
                                // Note : Cette logique crée plusieurs InstancedMesh par asset à parts,
                                // elle doit rester ici et ne pas passer par la création unique plus bas.
                                assetData.parts.forEach((part, index) => {
                                    if (!part.geometry || !part.material) {
                                        console.warn(`[IMM] Invalid part data for ${type} asset ${assetId}, part index: ${index}`);
                                        return;
                                    }

                                    // Déterminer si CETTE partie est une fenêtre
                                    const isPartWindow = (
                                        part.material.name === "BuildingWindowMat" || // Noms génériques
                                        part.material.name === "SkyscraperWindowMat_Standard" ||
                                        part.material.name === "NewBuildingWindow" ||
                                        part.material.name === "NewBuildingBalconyWindow" ||
                                        part.material.name?.startsWith("Inst_HouseWindow_") ||
                                        part.material.name === "HouseWindowMat" ||
                                        part.material.name === "IndustrialWindowPaneMat" // Ajouter noms spécifiques si besoin
                                    );

                                    const count = matrices.length;
                                    // Utiliser le matériau cloné pour éviter les modifications partagées
                                    const partMaterialClone = part.material.clone();
                                    partMaterialClone.name = `Inst_${meshKey}_part${index}`; // Donner un nom unique à l'instance clonée

                                    const instancedMesh = new THREE.InstancedMesh(part.geometry, partMaterialClone, count);
                                    instancedMesh.castShadow = castShadow;
                                    instancedMesh.receiveShadow = !isPartWindow; // Ombre si ce n'est pas une fenêtre
                                    instancedMesh.name = `${meshKey}_part${index}`;

                                    matrices.forEach((matrix, mIndex) => {
                                        instancedMesh.setMatrixAt(mIndex, matrix);
                                    });
                                    instancedMesh.instanceMatrix.needsUpdate = true;

                                    this.parentGroup.add(instancedMesh);
                                    this.instancedMeshes[`${meshKey}_part${index}`] = instancedMesh;
                                    totalMeshesCreated++;
                                    totalInstancesCreated += count;

                                    // Ajouter aux fenêtres si applicable
                                    if (isPartWindow) {
                                        this.windowMeshes.push(instancedMesh);
                                        // Appliquer envMap ici si nécessaire
                                        if (this.experience?.scene?.environment) {
                                            if (!partMaterialClone.envMap) partMaterialClone.envMap = this.experience.scene.environment;
                                        }
                                    }
                                });
                                // Important : continuer à la prochaine clé car les meshes ont déjà été créés
                                continue; // Passe à l'itération suivante de la boucle idOrKey
                            }

                            // Si l'asset n'a pas de parts (cas standard pour ces types)
                            if (!assetData.geometry || !assetData.material) {
                                console.warn(`[IMM] Asset data invalid for standard ${type} ID: ${assetId}`);
                                continue;
                            }
                            geometry = assetData.geometry;
                            material = assetData.material; // Utiliser le matériau de l'asset directement
                            break;
                        } // Fin case industrial/park/tree

                        case 'crosswalk': {
                            // Logique existante
                            if (!this.stripeBaseGeometry || !this.materials.crosswalkMaterial) {
                                console.warn(`[IMM] Crosswalk geometry or material not available.`);
                                continue;
                            }
                            geometry = this.stripeBaseGeometry;
                            material = this.materials.crosswalkMaterial;
                            castShadow = false;
                            receiveShadow = true;
                            break;
                        } // Fin case crosswalk

                        default:
                            console.warn(`[IMM] Unhandled asset type for instancing: ${type}`);
                            continue; // Passe à la clé suivante
                    } // Fin switch(type)

                    // --- Vérification centralisée isWindow et ajustement receiveShadow ---
                    let isWindowFinal = false; // Utiliser une nouvelle variable
                    if (material) {
                        // Liste exhaustive des noms de matériaux de fenêtre
                        const windowMaterialNames = [
                            "BuildingWindowMat",
                            "SkyscraperWindowMat_Standard",
                            "NewBuildingWindow",
                            "NewBuildingBalconyWindow",
                            "HouseWindowMat",
                            "IndustrialWindowPaneMat",
							"NewSkyscraperWindowMat"
                        ];
                        isWindowFinal = windowMaterialNames.includes(material.name) || material.name?.startsWith("Inst_HouseWindow_");

                        if (isWindowFinal) {
                            receiveShadow = false; // Les fenêtres ne reçoivent pas d'ombre
                        }
                    }
                     // --- FIN Vérification centralisée ---

                    // --- Création de l'InstancedMesh unique (sauf pour assets à parts gérés plus haut) ---
                    if (geometry && material) {
                        // Gérer le clonage spécifique pour les fenêtres de maison avant de créer le mesh
                        let finalMaterial = material;
                        if (isHouseWindowPart && material.name === "HouseWindowMat") {
                            finalMaterial = material.clone(); // Cloner seulement ici si c'est une fenêtre de maison
                            finalMaterial.name = `Inst_HouseWindow_${idOrKey}`; // Donner le nom spécifique pour l'update
                            // Configurer le matériau cloné (émissivité etc.)
                            finalMaterial.emissive = new THREE.Color(0xFFFF99);
                            finalMaterial.emissiveIntensity = 0.0;
                            if (this.experience?.scene?.environment) {
                                finalMaterial.envMap = this.experience.scene.environment;
                                finalMaterial.roughness = 0.05; // Rendre les fenêtres maison plus réflectives
                                finalMaterial.metalness = 0.9;
                            }
                        } else if (material.name === "NewBuildingWindow" || material.name === "NewBuildingBalconyWindow") {
                             // Cloner aussi pour les nouvelles fenêtres pour être sûr que l'update ne modifie pas l'original
                            finalMaterial = material.clone();
                            // Le nom est déjà correct sur le clone
                        }
                        // Pour les autres matériaux (murs, toit, assets standards), on utilise l'original (ou celui de la part)


                        const count = matrices.length;
                        const instancedMesh = new THREE.InstancedMesh(geometry, finalMaterial, count); // Utiliser finalMaterial
                        instancedMesh.castShadow = castShadow;
                        instancedMesh.receiveShadow = receiveShadow; // Utilise la valeur potentiellement ajustée
                        instancedMesh.name = meshKey;

                        matrices.forEach((matrix, index) => {
                            instancedMesh.setMatrixAt(index, matrix);
                        });
                        instancedMesh.instanceMatrix.needsUpdate = true;

                        this.parentGroup.add(instancedMesh);
                        this.instancedMeshes[meshKey] = instancedMesh;
                        totalMeshesCreated++;
                        totalInstancesCreated += count;

                        // Ajouter aux fenêtres si applicable (utilise maintenant isWindowFinal)
                        if (isWindowFinal) {
                            this.windowMeshes.push(instancedMesh);
                            // Optionnel : Appliquer envMap ici si besoin pour *toutes* les fenêtres identifiées
                             if (this.experience?.scene?.environment && finalMaterial.name !== "IndustrialWindowPaneMat") { // Exemple : pas pour les industrielles
                                 if (!finalMaterial.envMap) finalMaterial.envMap = this.experience.scene.environment;
                                 // Ajuster roughness/metalness pour la réflectivité
                                 // finalMaterial.roughness = 0.1;
                                 // finalMaterial.metalness = 0.9;
                             }
                        }
                    } else {
                        // Ce log est atteint si geometry ou material sont null APRES le switch
                        // (ne devrait pas arriver si la logique du switch est correcte)
                        console.warn(`[IMM] Skipped mesh creation for ${meshKey} due to missing geometry or material after central window check.`);
                    }

                } catch (error) {
                     console.error(`[IMM] Error processing instance data for type '${type}', key '${idOrKey}':`, error);
                }

            } // Fin boucle idOrKey
        } // Fin boucle type

        if (totalMeshesCreated > 0) {
            console.log(`InstancedMeshManager: ${totalMeshesCreated} InstancedMesh(es) created (${totalInstancesCreated} total instances). ${this.windowMeshes.length} window mesh(es) tracked.`);
        } else {
            console.log("InstancedMeshManager: No InstancedMesh created.");
        }
    }

    /**
     * Met à jour l'apparence des fenêtres en fonction de l'heure.
     * @param {number} currentHour - L'heure actuelle (0-23).
     */
    updateWindows(currentHour) {
        if (this.windowMeshes.length === 0) return;

        // Les lumières sont allumées entre 18h inclus et 6h exclus
        const lightsOn = (currentHour >= 18 || currentHour < 6);
        
        // Suivi de l'état jour/nuit précédent pour détecter les transitions
        if (this.previousLightsOn === undefined) {
            this.previousLightsOn = lightsOn;
        }
        
        // Si on passe du jour à la nuit, réinitialiser l'état pour un nouveau cycle
        const dayToNightTransition = !this.previousLightsOn && lightsOn;
        if (dayToNightTransition) {
            console.log("Transition jour -> nuit détectée, réinitialisation des états des fenêtres");
            this.windowLitState = null; // Force une nouvelle génération des états
        }
        
        // Sauvegarder l'état actuel pour la prochaine mise à jour
        this.previousLightsOn = lightsOn;

        // Initialiser les états aléatoires pour les fenêtres si ce n'est pas déjà fait
        if (!this.windowLitState) {
            this.windowLitState = new Map();
            
            // 1. Regrouper les fenêtres par bâtiment RÉEL
            const buildingGroups = new Map();
            
            this.windowMeshes.forEach(mesh => {
                // Le format du nom est typiquement "typeID_buildingID_partN"
                // Extraire un ID stable pour le bâtiment réel
                const nameParts = mesh.name.split('_');
                let buildingId;
                
                // Pour les types avec suffixe _proc_ (bâtiments procéduraux)
                if (nameParts.length >= 3 && mesh.name.includes('_proc_')) {
                    const baseNameEndIndex = mesh.name.indexOf('_part');
                    if (baseNameEndIndex !== -1) {
                        // Prendre tout jusqu'à _part pour les procéduraux
                        buildingId = mesh.name.substring(0, baseNameEndIndex);
                    } else {
                        // Fallback: utiliser les 3 premiers segments
                        buildingId = `${nameParts[0]}_${nameParts[1]}_${nameParts[2]}`;
                    }
                }
                // Cas des maisons (house_XXXX)
                else if (nameParts[0] === 'house' && nameParts.length >= 2) {
                    buildingId = `${nameParts[0]}_${nameParts[1]}`;
                }
                // Autres types (commerciaux, skyscrapers, etc.)
                else if (nameParts.length >= 2) {
                    buildingId = `${nameParts[0]}_${nameParts[1]}`;
                }
                // Fallback si aucun modèle ne correspond
                else {
                    buildingId = `unknown_${mesh.uuid.substring(0, 8)}`;
                }
                
                // Ajouter ce mesh au groupe du bâtiment
                if (!buildingGroups.has(buildingId)) {
                    buildingGroups.set(buildingId, []);
                }
                buildingGroups.get(buildingId).push(mesh);
            });
            
            // 2. Pour chaque bâtiment, décider quelles fenêtres seront allumées
            buildingGroups.forEach((meshes, buildingId) => {
                // Compter le nombre total de fenêtres (instances) dans ce bâtiment
                let totalWindowCount = 0;
                
                meshes.forEach(mesh => {
                    if (mesh.isInstancedMesh) {
                        totalWindowCount += mesh.count;
                    } else {
                        totalWindowCount += 1;
                    }
                });
                
                // Créer un tableau pour suivre chaque fenêtre
                const windowIndices = [];
                
                // Ajouter des indices pour chaque instance de chaque mesh
                meshes.forEach(mesh => {
                    if (mesh.isInstancedMesh) {
                        for (let i = 0; i < mesh.count; i++) {
                            windowIndices.push({ meshId: mesh.uuid, instanceIndex: i });
                        }
                    } else {
                        windowIndices.push({ meshId: mesh.uuid });
                    }
                });
                
                // Mélanger le tableau pour une sélection aléatoire
                for (let i = windowIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [windowIndices[i], windowIndices[j]] = [windowIndices[j], windowIndices[i]];
                }
                
                // Sélectionner environ 50% des fenêtres à allumer
                const numToLight = Math.floor(totalWindowCount * 0.5);
                
                // Marquer les fenêtres sélectionnées comme "allumées"
                for (let i = 0; i < numToLight; i++) {
                    const window = windowIndices[i];
                    if (!this.windowLitState.has(window.meshId)) {
                        this.windowLitState.set(window.meshId, new Set());
                    }
                    
                    if (window.instanceIndex !== undefined) {
                        this.windowLitState.get(window.meshId).add(window.instanceIndex);
                    } else {
                        this.windowLitState.get(window.meshId).add("single");
                    }
                }
            });
            
            // Créer des références aux échelles originales pour tous les meshes instanciés
            this.windowMeshes.forEach(mesh => {
                if (mesh.isInstancedMesh && mesh.count > 1 && !mesh.userData.originalScalesStored) {
                    mesh.userData.originalScales = [];
                    
                    for (let i = 0; i < mesh.count; i++) {
                        const matrix = new THREE.Matrix4();
                        mesh.getMatrixAt(i, matrix);
                        
                        const position = new THREE.Vector3();
                        const quaternion = new THREE.Quaternion();
                        const scale = new THREE.Vector3();
                        matrix.decompose(position, quaternion, scale);
                        
                        mesh.userData.originalScales[i] = scale.clone();
                    }
                    
                    mesh.userData.originalScalesStored = true;
                }
            });
        }
        
        // 3. Mettre à jour l'apparence des fenêtres selon l'heure et leur état
        this.windowMeshes.forEach(mesh => {
            if (!mesh.material || typeof mesh.material.dispose !== 'function') return;
            
            const material = mesh.material;
            let needsMaterialUpdate = false;
            
            // Récupérer l'état des fenêtres de ce mesh
            const litWindows = this.windowLitState.get(mesh.uuid) || new Set();
            
            // Identifier le type de fenêtre pour appliquer les paramètres visuels appropriés
            const isSkyscraperWindow = material.name === "SkyscraperWindowMat_Standard";
            const isNewSkyscraperWindow = material.name === "NewSkyscraperWindowMat";
            const isHouseWindow = material.name.startsWith("Inst_HouseWindow_");
            const isBuildingWindow = material.name === "BuildingWindowMat";
            const isNewBuildingWindow = material.name === "NewBuildingWindow" || material.name === "NewBuildingBalconyWindow";
            
            // Décider de l'intensité émissive selon le type de fenêtre
            let maxEmissiveIntensity = 0.0;
            if (isSkyscraperWindow) maxEmissiveIntensity = 1.0;
            else if (isHouseWindow) maxEmissiveIntensity = 1.23;
            else if (isBuildingWindow) maxEmissiveIntensity = 0.8;
            else if (isNewBuildingWindow) maxEmissiveIntensity = 0.9;
            else if (isNewSkyscraperWindow) maxEmissiveIntensity = 0.9;
            
            // Cas 1: InstancedMesh (plusieurs fenêtres dans un même mesh)
            if (mesh.isInstancedMesh && mesh.count > 1) {
                if (lightsOn) {
                    // La nuit - Configurer le matériau pour l'émission
                    if (isSkyscraperWindow) {
                        if (material.transmission !== 0.0) {
                            material.transmission = 0.0;
                            needsMaterialUpdate = true;
                        }
                        if (material.roughness !== 0.8) {
                            material.roughness = 0.8;
                            needsMaterialUpdate = true;
                        }
                    }
                    
                    // Activer l'émission
                    if (material.emissiveIntensity !== maxEmissiveIntensity) {
                        material.emissiveIntensity = maxEmissiveIntensity;
                        needsMaterialUpdate = true;
                    }
                    
                    // Mettre à jour les échelles pour masquer/montrer chaque instance
                    let needMatrixUpdate = false;
                    
                    for (let i = 0; i < mesh.count; i++) {
                        const isLit = litWindows.has(i);
                        
                        // Si les échelles originales n'ont pas été stockées, le faire maintenant
                        if (!mesh.userData.originalScales || !mesh.userData.originalScales[i]) {
                            if (!mesh.userData.originalScales) {
                                mesh.userData.originalScales = [];
                            }
                            
                            const matrix = new THREE.Matrix4();
                            mesh.getMatrixAt(i, matrix);
                            
                            const position = new THREE.Vector3();
                            const quaternion = new THREE.Quaternion();
                            const scale = new THREE.Vector3();
                            matrix.decompose(position, quaternion, scale);
                            
                            // Ne remplacer que si l'échelle est "normale" (non miniaturisée)
                            if (Math.abs(scale.x) > 0.1 && Math.abs(scale.y) > 0.1 && Math.abs(scale.z) > 0.1) {
                                mesh.userData.originalScales[i] = scale.clone();
                            }
                        }
                        
                        // Obtenir la matrice actuelle
                        const matrix = new THREE.Matrix4();
                        mesh.getMatrixAt(i, matrix);
                        
                        // Décomposer la matrice actuelle
                        const position = new THREE.Vector3();
                        const quaternion = new THREE.Quaternion();
                        const scale = new THREE.Vector3();
                        matrix.decompose(position, quaternion, scale);
                        
                        // Vérifier si l'instance est déjà dans l'état souhaité
                        const isCurrentlyHidden = Math.abs(scale.x) < 0.05 || Math.abs(scale.y) < 0.05 || Math.abs(scale.z) < 0.05;
                        
                        if ((isLit && isCurrentlyHidden) || (!isLit && !isCurrentlyHidden)) {
                            const newMatrix = new THREE.Matrix4();
                            
                            if (isLit) {
                                // Restaurer l'échelle originale pour les fenêtres allumées
                                if (mesh.userData.originalScales && mesh.userData.originalScales[i]) {
                                    newMatrix.compose(
                                        position,
                                        quaternion,
                                        mesh.userData.originalScales[i]
                                    );
                                    mesh.setMatrixAt(i, newMatrix);
                                    needMatrixUpdate = true;
                                }
                            } else {
                                // Réduire l'échelle pour les fenêtres éteintes
                                const scaleX = 0.01;
                                const scaleY = 0.01;
                                const scaleZ = 0.01;
                                
                                newMatrix.compose(
                                    position,
                                    quaternion,
                                    new THREE.Vector3(scaleX, scaleY, scaleZ)
                                );
                                mesh.setMatrixAt(i, newMatrix);
                                needMatrixUpdate = true;
                            }
                        }
                    }
                    
                    // Mettre à jour la matrice d'instance si nécessaire
                    if (needMatrixUpdate) {
                        mesh.instanceMatrix.needsUpdate = true;
                    }
                } else {
                    // Le jour - Restaurer toutes les matrices et désactiver l'émission
                    
                    // Désactiver l'émission
                    if (material.emissiveIntensity !== 0.0) {
                        material.emissiveIntensity = 0.0;
                        needsMaterialUpdate = true;
                    }
                    
                    // Restaurer toutes les échelles originales
                    let needMatrixUpdate = false;
                    
                    for (let i = 0; i < mesh.count; i++) {
                        if (mesh.userData.originalScales && mesh.userData.originalScales[i]) {
                            const matrix = new THREE.Matrix4();
                            mesh.getMatrixAt(i, matrix);
                            
                            const position = new THREE.Vector3();
                            const quaternion = new THREE.Quaternion();
                            const scale = new THREE.Vector3();
                            matrix.decompose(position, quaternion, scale);
                            
                            // Vérifier si l'échelle actuelle est réduite
                            const isCurrentlyHidden = Math.abs(scale.x) < 0.05 || Math.abs(scale.y) < 0.05 || Math.abs(scale.z) < 0.05;
                            
                            if (isCurrentlyHidden) {
                                // Restaurer l'échelle originale
                                const newMatrix = new THREE.Matrix4();
                                newMatrix.compose(
                                    position,
                                    quaternion,
                                    mesh.userData.originalScales[i]
                                );
                                
                                mesh.setMatrixAt(i, newMatrix);
                                needMatrixUpdate = true;
                            }
                        }
                    }
                    
                    if (needMatrixUpdate) {
                        mesh.instanceMatrix.needsUpdate = true;
                    }
                    
                    // Réinitialiser les propriétés spécifiques pour le jour
                    if (isSkyscraperWindow) {
                        if (material.transmission !== 0.0) {
                            material.transmission = 0.0;
                            needsMaterialUpdate = true;
                        }
                        if (material.roughness !== 0.1) {
                            material.roughness = 0.1;
                            needsMaterialUpdate = true;
                        }
                    }
                }
            } 
            // Cas 2: Mesh standard (une seule fenêtre)
            else {
                const isLit = litWindows.has("single");
                
                if (lightsOn && isLit) {
                    // La nuit et cette fenêtre est allumée
                    if (material.emissiveIntensity !== maxEmissiveIntensity) {
                        material.emissiveIntensity = maxEmissiveIntensity;
                        needsMaterialUpdate = true;
                    }
                    
                    // Paramètres spécifiques aux fenêtres de gratte-ciel
                    if (isSkyscraperWindow) {
                        if (material.transmission !== 0.0) {
                            material.transmission = 0.0;
                            needsMaterialUpdate = true;
                        }
                        if (material.roughness !== 0.8) {
                            material.roughness = 0.8;
                            needsMaterialUpdate = true;
                        }
                    }
                    
                    // Rendre visible si nécessaire
                    if (!mesh.visible) {
                        mesh.visible = true;
                    }
                } else if (lightsOn && !isLit) {
                    // Nuit, mais cette fenêtre est éteinte
                    if (material.emissiveIntensity !== 0.0) {
                        material.emissiveIntensity = 0.0;
                        needsMaterialUpdate = true;
                    }
                    
                    // Masquer la fenêtre éteinte
                    if (mesh.visible) {
                        mesh.visible = false;
                    }
                } else {
                    // Jour - Toutes les fenêtres visibles mais sans émission
                    if (material.emissiveIntensity !== 0.0) {
                        material.emissiveIntensity = 0.0;
                        needsMaterialUpdate = true;
                    }
                    
                    // Paramètres spécifiques pour le jour
                    if (isSkyscraperWindow) {
                        if (material.transmission !== 0.0) {
                            material.transmission = 0.0;
                            needsMaterialUpdate = true;
                        }
                        if (material.roughness !== 0.1) {
                            material.roughness = 0.1;
                            needsMaterialUpdate = true;
                        }
                    }
                    
                    // S'assurer que toutes les fenêtres sont visibles le jour
                    if (!mesh.visible) {
                        mesh.visible = true;
                    }
                }
            }
            
            // Appliquer les changements si nécessaire
            if (needsMaterialUpdate) {
                material.needsUpdate = true;
            }
        });
    }

    /**
     * Mélange aléatoirement un tableau (algorithme de Fisher-Yates)
     * @param {Array} array - Le tableau à mélanger
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Nettoie les InstancedMesh créés et réinitialise l'état interne.
     */
    reset() {
        // Nettoyer les états aléatoires des fenêtres
        this.windowLitState = null;
        this.previousLightsOn = undefined;

        // Restaurer les meshes de fenêtres
        this.windowMeshes.forEach(mesh => {
            // Restaurer les attributs géométriques
            if (mesh.geometry && mesh.geometry.hasAttribute('color')) {
                mesh.geometry.deleteAttribute('color');
            }
            
            // Restaurer les échelles originales
            if (mesh.isInstancedMesh && mesh.count > 1 && mesh.userData.originalScales) {
                let needsUpdate = false;
                
                for (let i = 0; i < mesh.count; i++) {
                    if (mesh.userData.originalScales[i]) {
                        const matrix = new THREE.Matrix4();
                        mesh.getMatrixAt(i, matrix);
                        
                        // Décomposer la matrice actuelle
                        const position = new THREE.Vector3();
                        const quaternion = new THREE.Quaternion();
                        matrix.decompose(position, quaternion, new THREE.Vector3());
                        
                        // Restaurer l'échelle originale
                        const newMatrix = new THREE.Matrix4();
                        newMatrix.compose(
                            position, 
                            quaternion,
                            mesh.userData.originalScales[i]
                        );
                        
                        mesh.setMatrixAt(i, newMatrix);
                        needsUpdate = true;
                    }
                }
                
                if (needsUpdate) {
                    mesh.instanceMatrix.needsUpdate = true;
                }
                
                mesh.userData.originalScales = null;
                mesh.userData.originalScalesStored = false;
                mesh.userData.dummyMatrices = null;
            }
            
            // Réinitialiser le matériau
            if (mesh.material) {
                mesh.material.vertexColors = false;
                mesh.material.emissiveIntensity = 0.0;
                mesh.material.needsUpdate = true;
            }
            
            // Nettoyer les autres propriétés
            mesh.userData.hasCustomColor = false;
            
            // S'assurer que toutes les fenêtres sont visibles
            if (!mesh.visible) {
                mesh.visible = true;
            }
        });

        // Nettoyer les meshes de fenêtres (références)
        this.windowMeshes = [];

        // Nettoyer les InstancedMesh du parentGroup
        Object.keys(this.instancedMeshes).forEach(key => {
            const mesh = this.instancedMeshes[key];
            if (mesh) {
                // Retirer de la scène
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                }
                // Nettoyer la géométrie ? NON, elle est partagée (vient de AssetLoader ou Renderer)
                // mesh.geometry?.dispose();

                // Nettoyer le matériau ? SEULEMENT s'il a été CLONE (ex: fenêtres)
                if (mesh.material && mesh.material.name.startsWith('Inst_HouseWindow_')) {
                    mesh.material.dispose();
                }
                // Pour les autres matériaux (procéduraux partagés, assets standards),
                // leur nettoyage est géré par AssetLoader ou les Renderers.
            }
        });

        // Réinitialiser le conteneur
        this.instancedMeshes = {};

        // Nettoyer la géométrie de base des passages piétons si elle existe
        if (this.stripeBaseGeometry) {
             this.stripeBaseGeometry.dispose();
             this.stripeBaseGeometry = null;
             // Recréer si nécessaire (ou passer en argument lors de la création)
             if (this.config.crosswalkStripeWidth > 0 && this.config.crosswalkHeight > 0) {
                 this.stripeBaseGeometry = new THREE.BoxGeometry(
                     this.config.crosswalkStripeWidth,
                     this.config.crosswalkHeight,
                     1.0
                 );
             }
        }
    }

    /**
     * Crée des matériaux individuels pour chaque instance d'un InstancedMesh
     * @param {THREE.InstancedMesh} mesh - Le mesh instancié
     */
    createInstanceMaterials(mesh) {
        if (!mesh || !mesh.isInstancedMesh || !mesh.material) return;
        
        const baseMaterial = mesh.material;
        
        // Créer un nouveau matériau pour chaque instance
        const instanceMaterials = new Array(mesh.count);
        for (let i = 0; i < mesh.count; i++) {
            instanceMaterials[i] = baseMaterial.clone();
            instanceMaterials[i].name = `${baseMaterial.name}_Instance${i}`;
        }
        
        // Stocker les matériaux dans le mesh
        mesh.userData.instanceMaterials = instanceMaterials;
        mesh.userData.hasInstanceMaterials = true;
        mesh.userData.originalMaterial = baseMaterial;
        
        // Conserver le matériau d'origine pour le rendu standard
        // Le rendu personnalisé utilisera les matériaux individuels
        
        // Écraser la méthode onBeforeRender pour utiliser les matériaux personnalisés
        mesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
            if (this.userData.instanceMaterials) {
                // Sauvegarder l'état actuel du renderer
                const currentRenderState = renderer.getRenderTarget();
                
                // Pour chaque instance
                for (let i = 0; i < this.count; i++) {
                    // Récupérer la matrice de l'instance
                    const matrix = new THREE.Matrix4();
                    this.getMatrixAt(i, matrix);
                    
                    // Extraire position, rotation et échelle
                    const position = new THREE.Vector3();
                    const quaternion = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    matrix.decompose(position, quaternion, scale);
                    
                    // Créer un mesh temporaire avec le matériau individuel
                    const tempMesh = new THREE.Mesh(this.geometry, this.userData.instanceMaterials[i]);
                    tempMesh.position.copy(position);
                    tempMesh.quaternion.copy(quaternion);
                    tempMesh.scale.copy(scale);
                    
                    // Rendre ce mesh spécifique
                    tempMesh.updateMatrixWorld();
                    renderer.renderBufferDirect(camera, scene, geometry, this.userData.instanceMaterials[i], tempMesh, group);
                }
                
                // Restaurer l'état du renderer
                renderer.setRenderTarget(currentRenderState);
                
                // Indiquer que le rendu a déjà été effectué
                this._rendered = true;
            }
        };
        
        // Écraser la méthode dispose pour nettoyer correctement
        const originalDispose = mesh.dispose;
        mesh.dispose = function() {
            if (this.userData.instanceMaterials) {
                this.userData.instanceMaterials.forEach(mat => {
                    if (mat) mat.dispose();
                });
                this.userData.instanceMaterials = null;
            }
            if (originalDispose) originalDispose.call(this);
        };
    }

    /**
     * Méthode de destruction complète (appelée lorsque le World est détruit).
     */
    destroy() {
        console.log("Destroying InstancedMeshManager...");
        this.reset(); // Effectue le nettoyage principal
        // Libérer les références
        this.config = null;
        this.materials = null;
        this.assetLoader = null;
        this.renderers = null;
        this.parentGroup = null;
        this.experience = null;
        if (this.stripeBaseGeometry) { // Double vérification
             this.stripeBaseGeometry.dispose();
             this.stripeBaseGeometry = null;
        }
        console.log("InstancedMeshManager destroyed.");
    }
}