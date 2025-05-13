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

        //console.log("InstancedMeshManager initialized.");
    }

    /**
     * Crée tous les InstancedMesh basés sur les données fournies.
     * @param {Object.<string, Object.<string, Array<THREE.Matrix4>>>} instanceData - Données provenant de InstanceDataManager.
     */
    createMeshes(instanceData) {
        //console.log("InstancedMeshManager: Creating InstancedMeshes (Corrected)...");
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
            //console.log(`InstancedMeshManager: ${totalMeshesCreated} InstancedMesh(es) created (${totalInstancesCreated} total instances). ${this.windowMeshes.length} window mesh(es) tracked.`);
        } else {
            //console.log("InstancedMeshManager: No InstancedMesh created.");
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

        this.windowMeshes.forEach(mesh => {
            // Le matériau peut être un tableau si l'objet d'origine en avait plusieurs,
            // mais pour les InstancedMesh, c'est généralement un seul matériau.
            if (!mesh.material || typeof mesh.material.dispose !== 'function') return;

            const material = mesh.material;
            let needsMaterialUpdate = false;

            // Identifier le type de fenêtre basé sur le nom du matériau (convention établie)
            const isSkyscraperWindow = material.name === "SkyscraperWindowMat_Standard";
			const isNewSkyscraperWindow = material.name === "NewSkyscraperWindowMat"; // <-- AJOUTER CETTE VÉRIFICATION
            const isHouseWindow = material.name.startsWith("Inst_HouseWindow_");
            const isBuildingWindow = material.name === "BuildingWindowMat";
            const isNewBuildingWindow = material.name === "NewBuildingWindow" || material.name === "NewBuildingBalconyWindow";

            let targetIntensity = 0.0;

            if (isSkyscraperWindow) {
                targetIntensity = lightsOn ? 1 : 0.0; // Valeur spécifique gratte-ciel
                // Logique additionnelle spécifique (ex: transmission, roughness)
                const targetTransmission = lightsOn ? 0.0 : 0.0; // Exemple
                const targetRoughness = lightsOn ? 0.8 : 0.1; // Exemple
                if (material.transmission !== targetTransmission) {
                    material.transmission = targetTransmission;
                    needsMaterialUpdate = true;
                }
                if (material.roughness !== targetRoughness) {
                    material.roughness = targetRoughness;
                    needsMaterialUpdate = true;
                }
            } else if (isHouseWindow) {
                targetIntensity = lightsOn ? 1.23 : 0.0; // Valeur spécifique maison
            } else if (isBuildingWindow) {
                targetIntensity = lightsOn ? 0.8 : 0.0; // Valeur spécifique immeuble
            } else if (isNewBuildingWindow) {
                targetIntensity = lightsOn ? 0.9 : 0.0; // Même valeur que BuildingWindow
            } else if (isNewSkyscraperWindow) { // <-- AJOUTER CE BLOC
                targetIntensity = lightsOn ? 0.9 : 0.0; // Choisissez une intensité (ex: 1.1)
                // Ajoutez ici toute autre logique spécifique si nécessaire (transmission, roughness, etc.)
                // Exemple:
                // const targetRoughness = lightsOn ? 0.5 : 0.2;
                // if (material.roughness !== targetRoughness) {
                //     material.roughness = targetRoughness;
                //     needsMaterialUpdate = true;
                // }
            } else {
                // Fenêtre non reconnue ou type non géré
                return;
            }

            // Appliquer l'intensité émissive si elle a changé
            if (material.emissiveIntensity !== targetIntensity) {
                material.emissiveIntensity = targetIntensity;
                 needsMaterialUpdate = true; // Indiquer que le matériau doit être mis à jour si l'intensité change
            }

            // Marquer le matériau pour mise à jour si nécessaire
            // Note: même si seul emissiveIntensity change, needsUpdate=true est souvent requis.
            if (needsMaterialUpdate) {
                material.needsUpdate = true;
            }
        });
    }

    /**
     * Nettoie les InstancedMesh créés et réinitialise l'état interne.
     */
    reset() {
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

        // //console.log("InstancedMeshManager reset complete.");
    }

    /**
     * Méthode de destruction complète (appelée lorsque le World est détruit).
     */
    destroy() {
        //console.log("Destroying InstancedMeshManager...");
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
        //console.log("InstancedMeshManager destroyed.");
    }
}