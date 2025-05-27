// src/World/InstancedMeshManager.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import BuildingLODRenderer from '../Buildings/BuildingLODRenderer.js';

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
        /** @type {Object.<string, THREE.InstancedMesh>} */
        this.lodInstancedMeshes = {}; // Stocke les meshes LOD créés, clé = type_idOrKey
        /** @type {Array<THREE.InstancedMesh>} */
        this.windowMeshes = []; // Références spécifiques aux meshes de fenêtres pour l'update

        // Optimisation des draw calls pour les bâtiments
        this.enableBuildingOptimization = true; // Flag pour activer/désactiver l'optimisation
        
        // Système LOD pour les bâtiments
        this.buildingLODRenderer = new BuildingLODRenderer();
        this.buildingLODDistance = config.buildingLodDistance || 100; // Distance à laquelle activer le LOD
        this.enableBuildingLOD = true; // Flag pour activer/désactiver le LOD des bâtiments

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
     * Optimise les parties de bâtiments en fusionnant les géométries par matériau
     * @param {Array} parts - Les parties du bâtiment
     * @param {Array<THREE.Matrix4>} matrices - Les matrices de transformation
     * @param {string} buildingType - Le type de bâtiment (house, building, etc.)
     * @param {string} assetId - L'ID de l'asset
     * @returns {Array} Les meshes optimisés
     */
    optimizeBuildingParts(parts, matrices, buildingType, assetId) {
        if (!this.enableBuildingOptimization || !parts || parts.length === 0) {
            return null;
        }

        // Grouper les parties par matériau avec optimisation agressive
        const materialGroups = new Map();
        const materialCompatibilityMap = new Map(); // Pour fusionner des matériaux compatibles
        
        parts.forEach((part, index) => {
            if (!part.geometry || !part.material) return;
            
            const materialKey = this.getMaterialKey(part.material);
            
            if (!materialGroups.has(materialKey)) {
                materialGroups.set(materialKey, {
                    material: part.material,
                    geometries: [],
                    isWindow: this.isWindowMaterial(part.material),
                    partIndices: [],
                    materials: [part.material] // Stocker tous les matériaux du groupe
                });
            }
            
            materialGroups.get(materialKey).geometries.push(part.geometry);
            materialGroups.get(materialKey).partIndices.push(index);
            materialGroups.get(materialKey).materials.push(part.material);
        });

        // Optimisation supplémentaire : fusionner les groupes très similaires
        this.mergeCompatibleGroups(materialGroups);

        const optimizedMeshes = [];
        let groupIndex = 0;

        console.log(`[IMM] Optimizing ${buildingType} ${assetId}: ${parts.length} parts → ${materialGroups.size} material groups`);

        // Créer un mesh optimisé pour chaque groupe de matériau
        materialGroups.forEach((group, materialKey) => {
            try {
                // Fusionner les géométries du même matériau
                const mergedGeometry = mergeGeometries(group.geometries, false);
                
                if (!mergedGeometry) {
                    console.warn(`[IMM] Failed to merge geometries for material ${materialKey}`);
                    return;
                }

                const count = matrices.length;
                const materialClone = group.material.clone();
                materialClone.name = `Optimized_${buildingType}_${assetId}_${materialKey}_${groupIndex}`;

                const instancedMesh = new THREE.InstancedMesh(mergedGeometry, materialClone, count);
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = !group.isWindow;
                instancedMesh.name = `${buildingType}_${assetId}_optimized_${groupIndex}`;

                matrices.forEach((matrix, mIndex) => {
                    instancedMesh.setMatrixAt(mIndex, matrix);
                });
                instancedMesh.instanceMatrix.needsUpdate = true;

                // Gestion spéciale pour les fenêtres
                if (group.isWindow) {
                    this.windowMeshes.push(instancedMesh);
                    if (this.experience?.scene?.environment) {
                        if (!materialClone.envMap) materialClone.envMap = this.experience.scene.environment;
                    }
                }

                optimizedMeshes.push({
                    mesh: instancedMesh,
                    key: `${buildingType}_${assetId}_optimized_${groupIndex}`,
                    isWindow: group.isWindow
                });

                groupIndex++;
            } catch (error) {
                console.error(`[IMM] Error merging geometries for material ${materialKey}:`, error);
            }
        });

        console.log(`[IMM] ${buildingType} ${assetId} optimization result: ${parts.length} parts → ${optimizedMeshes.length} meshes (${Math.round((1 - optimizedMeshes.length / parts.length) * 100)}% reduction)`);
        
        return optimizedMeshes;
    }

    /**
     * Génère une clé unique pour un matériau (optimisée pour plus de fusion)
     * @param {THREE.Material} material - Le matériau
     * @returns {string} La clé du matériau
     */
    getMaterialKey(material) {
        // Stratégie plus agressive pour fusionner les matériaux similaires
        const type = material.type;
        const color = material.color ? material.color.getHexString() : 'nocolor';
        
        // Grouper par type de matériau et couleur principale, ignorer les noms spécifiques
        let category = 'other';
        
        // Catégoriser les matériaux par fonction plutôt que par nom exact
        if (this.isWindowMaterial(material)) {
            category = 'window';
        } else if (material.name && (
            material.name.includes('Wall') || 
            material.name.includes('wall') ||
            material.name.includes('Ground') ||
            material.name.includes('Floor')
        )) {
            category = 'wall';
        } else if (material.name && (
            material.name.includes('Roof') || 
            material.name.includes('roof')
        )) {
            category = 'roof';
        } else if (material.name && (
            material.name.includes('Door') || 
            material.name.includes('door')
        )) {
            category = 'door';
        } else if (material.name && (
            material.name.includes('Frame') || 
            material.name.includes('frame') ||
            material.name.includes('Trim') ||
            material.name.includes('trim')
        )) {
            category = 'frame';
        }
        
        // Simplifier les couleurs similaires
        const simplifiedColor = this.simplifyColor(color);
        
        return `${type}_${category}_${simplifiedColor}`;
    }

    /**
     * Simplifie une couleur pour permettre plus de regroupements
     * @param {string} hexColor - Couleur en hexadécimal
     * @returns {string} Couleur simplifiée
     */
    simplifyColor(hexColor) {
        if (hexColor === 'nocolor') return 'nocolor';
        
        // Convertir en RGB et simplifier
        const r = parseInt(hexColor.substr(0, 2), 16);
        const g = parseInt(hexColor.substr(2, 2), 16);
        const b = parseInt(hexColor.substr(4, 2), 16);
        
        // Regrouper les couleurs similaires (tolérance de 32 sur chaque canal)
        const tolerance = 32;
        const simplifiedR = Math.floor(r / tolerance) * tolerance;
        const simplifiedG = Math.floor(g / tolerance) * tolerance;
        const simplifiedB = Math.floor(b / tolerance) * tolerance;
        
        return `${simplifiedR.toString(16).padStart(2, '0')}${simplifiedG.toString(16).padStart(2, '0')}${simplifiedB.toString(16).padStart(2, '0')}`;
    }

    /**
     * Fusionne les groupes de matériaux compatibles pour réduire encore plus les draw calls
     * @param {Map} materialGroups - Les groupes de matériaux
     */
    mergeCompatibleGroups(materialGroups) {
        const groupsToMerge = [];
        const groupKeys = Array.from(materialGroups.keys());
        
        // Chercher des groupes qui peuvent être fusionnés
        for (let i = 0; i < groupKeys.length; i++) {
            for (let j = i + 1; j < groupKeys.length; j++) {
                const key1 = groupKeys[i];
                const key2 = groupKeys[j];
                const group1 = materialGroups.get(key1);
                const group2 = materialGroups.get(key2);
                
                if (this.areGroupsCompatible(group1, group2, key1, key2)) {
                    groupsToMerge.push([key1, key2]);
                }
            }
        }
        
        // Fusionner les groupes compatibles
        groupsToMerge.forEach(([key1, key2]) => {
            if (materialGroups.has(key1) && materialGroups.has(key2)) {
                const group1 = materialGroups.get(key1);
                const group2 = materialGroups.get(key2);
                
                // Fusionner group2 dans group1
                group1.geometries.push(...group2.geometries);
                group1.partIndices.push(...group2.partIndices);
                group1.materials.push(...group2.materials);
                
                // Supprimer group2
                materialGroups.delete(key2);
                
                console.log(`[IMM] Merged compatible groups: ${key1} + ${key2}`);
            }
        });
    }

    /**
     * Vérifie si deux groupes de matériaux peuvent être fusionnés
     * @param {Object} group1 - Premier groupe
     * @param {Object} group2 - Deuxième groupe
     * @param {string} key1 - Clé du premier groupe
     * @param {string} key2 - Clé du deuxième groupe
     * @returns {boolean} True si les groupes peuvent être fusionnés
     */
    areGroupsCompatible(group1, group2, key1, key2) {
        // Ne pas fusionner les fenêtres avec les non-fenêtres
        if (group1.isWindow !== group2.isWindow) {
            return false;
        }
        
        // Vérifier si les clés sont dans la même catégorie
        const category1 = key1.split('_')[1]; // ex: 'wall', 'roof', etc.
        const category2 = key2.split('_')[1];
        
        if (category1 !== category2) {
            return false;
        }
        
        // Vérifier si les couleurs sont suffisamment proches
        const color1 = key1.split('_')[2];
        const color2 = key2.split('_')[2];
        
        return this.areColorsCompatible(color1, color2);
    }

    /**
     * Vérifie si deux couleurs sont suffisamment proches pour être fusionnées
     * @param {string} color1 - Première couleur (hex)
     * @param {string} color2 - Deuxième couleur (hex)
     * @returns {boolean} True si les couleurs peuvent être fusionnées
     */
    areColorsCompatible(color1, color2) {
        if (color1 === color2) return true;
        if (color1 === 'nocolor' || color2 === 'nocolor') return false;
        
        // Calculer la distance entre les couleurs
        const r1 = parseInt(color1.substr(0, 2), 16);
        const g1 = parseInt(color1.substr(2, 2), 16);
        const b1 = parseInt(color1.substr(4, 2), 16);
        
        const r2 = parseInt(color2.substr(0, 2), 16);
        const g2 = parseInt(color2.substr(2, 2), 16);
        const b2 = parseInt(color2.substr(4, 2), 16);
        
        const distance = Math.sqrt(
            Math.pow(r1 - r2, 2) + 
            Math.pow(g1 - g2, 2) + 
            Math.pow(b1 - b2, 2)
        );
        
        // Fusionner si la distance est inférieure à 64 (sur une échelle de 0-441)
        return distance < 64;
    }

    /**
     * Vérifie si un matériau est un matériau de fenêtre
     * @param {THREE.Material} material - Le matériau à vérifier
     * @returns {boolean} True si c'est un matériau de fenêtre
     */
    isWindowMaterial(material) {
        const windowMaterialNames = [
            "BuildingWindowMat",
            "SkyscraperWindowMat_Standard",
            "NewBuildingWindow",
            "NewBuildingBalconyWindow",
            "HouseWindowMat",
            "HouseWindowPaneMat",
            "HouseWindowFrameMat",
            "IndustrialWindowPaneMat",
            "NewSkyscraperWindowMat",
            "CommercialWindowMat",
            "CommercialBalconyWindowMat"
        ];
        
        return windowMaterialNames.includes(material.name) || 
               material.name?.startsWith("Inst_HouseWindow_") ||
               material.name?.startsWith("HouseWindow");
    }

    /**
     * Active ou désactive l'optimisation des bâtiments
     * @param {boolean} enabled - True pour activer l'optimisation
     */
    setBuildingOptimization(enabled) {
        this.enableBuildingOptimization = enabled;
        console.log(`Building optimization ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Active ou désactive le système LOD des bâtiments
     * @param {boolean} enabled - True pour activer le LOD
     */
    setBuildingLOD(enabled) {
        this.enableBuildingLOD = enabled;
        console.log(`Building LOD ${enabled ? 'enabled' : 'disabled'}`);
        
        if (!enabled) {
            // Si désactivé, masquer tous les meshes LOD et afficher les haute qualité
            Object.values(this.lodInstancedMeshes).forEach(mesh => {
                if (mesh) mesh.visible = false;
            });
            Object.values(this.instancedMeshes).forEach(mesh => {
                if (mesh) mesh.visible = true;
            });
        }
    }

    /**
     * Définit la distance LOD pour les bâtiments
     * @param {number} distance - Distance en unités de monde
     */
    setBuildingLODDistance(distance) {
        this.buildingLODDistance = distance;
        console.log(`Building LOD distance set to ${distance}`);
    }

    /**
     * Crée les meshes LOD pour les bâtiments
     * @param {Object.<string, Object.<string, Array<THREE.Matrix4>>>} instanceData - Données d'instance
     */
    createLODMeshes(instanceData) {
        if (!this.enableBuildingLOD) return;

        const buildingTypes = ['house', 'building', 'skyscraper', 'industrial', 'commercial', 'movietheater', 'newhouse', 'newbuilding', 'newskyscraper'];
        const lodMaterial = this.buildingLODRenderer.getLODMaterial();

        buildingTypes.forEach(buildingType => {
            if (!instanceData[buildingType]) return;

            // Collecter toutes les matrices pour ce type de bâtiment
            const allMatrices = [];
            Object.values(instanceData[buildingType]).forEach(matrices => {
                allMatrices.push(...matrices);
            });

            if (allMatrices.length === 0) return;

            // Créer la géométrie LOD pour ce type
            const lodGeometry = this.buildingLODRenderer.createLODGeometry(buildingType);
            
            // Créer l'InstancedMesh LOD
            const lodMesh = new THREE.InstancedMesh(lodGeometry, lodMaterial.clone(), allMatrices.length);
            lodMesh.castShadow = true;
            lodMesh.receiveShadow = true;
            lodMesh.name = `${buildingType}_LOD`;
            lodMesh.visible = false; // Initialement invisible

            // Appliquer les matrices
            allMatrices.forEach((matrix, index) => {
                lodMesh.setMatrixAt(index, matrix);
            });
            lodMesh.instanceMatrix.needsUpdate = true;

            // Ajouter à la scène et stocker
            this.parentGroup.add(lodMesh);
            this.lodInstancedMeshes[buildingType] = lodMesh;

            console.log(`[IMM] Created LOD mesh for ${buildingType}: ${allMatrices.length} instances`);
        });
    }

    /**
     * Met à jour la visibilité des meshes en fonction de la distance à la caméra
     */
    updateLODVisibility() {
        if (!this.enableBuildingLOD || !this.experience?.camera?.instance) return;

        const camera = this.experience.camera.instance;
        const cameraPosition = camera.position;

        // Pour chaque type de bâtiment, déterminer s'il faut utiliser le LOD
        Object.keys(this.lodInstancedMeshes).forEach(buildingType => {
            const lodMesh = this.lodInstancedMeshes[buildingType];
            if (!lodMesh) return;

            // Calculer la distance moyenne des bâtiments à la caméra
            // Pour simplifier, on utilise la distance au centre de la ville
            const cityCenter = new THREE.Vector3(0, 0, 0); // Ajuster selon votre ville
            const distanceToCity = cameraPosition.distanceTo(cityCenter);

            const shouldUseLOD = distanceToCity > this.buildingLODDistance;

            // Basculer la visibilité
            lodMesh.visible = shouldUseLOD;

            // Masquer/afficher les meshes haute qualité correspondants
            Object.keys(this.instancedMeshes).forEach(meshKey => {
                if (meshKey.startsWith(buildingType + '_')) {
                    const highDetailMesh = this.instancedMeshes[meshKey];
                    if (highDetailMesh) {
                        highDetailMesh.visible = !shouldUseLOD;
                    }
                }
            });
        });
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

        // Créer d'abord les meshes LOD
        this.createLODMeshes(instanceData);

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
                            
                            // Gérer les parties avec optimisation pour les bâtiments commerciaux
                            if (assetData.parts && assetData.parts.length > 0) {
                                // Essayer d'optimiser les parties
                                const optimizedMeshes = this.optimizeBuildingParts(assetData.parts, matrices, 'commercial', commercialKey);
                                
                                if (optimizedMeshes && optimizedMeshes.length > 0) {
                                    // Utiliser les meshes optimisés
                                    optimizedMeshes.forEach((optimizedMesh) => {
                                        this.parentGroup.add(optimizedMesh.mesh);
                                        this.instancedMeshes[`commercial_${optimizedMesh.key}`] = optimizedMesh.mesh;
                                        totalMeshesCreated++;
                                        totalInstancesCreated += optimizedMesh.mesh.count;
                                    });
                                } else {
                                    // Fallback à l'ancienne méthode si l'optimisation échoue
                                    assetData.parts.forEach((part, index) => {
                                        if (!part.geometry || !part.material) {
                                            console.warn(`[IMM] Invalid part data for commercial asset, part index: ${index}`);
                                            return;
                                        }

                                        const isPartWindow = this.isWindowMaterial(part.material);
                                        const count = matrices.length;
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

                                        if (isPartWindow) {
                                            this.windowMeshes.push(instancedMesh);
                                            if (this.experience?.scene?.environment) {
                                                if (!partMaterialClone.envMap) partMaterialClone.envMap = this.experience.scene.environment;
                                            }
                                        }
                                    });
                                }
                                continue;
                            } else {
                                console.warn(`[IMM] Commercial asset has no parts, unexpected state`);
                                continue;
                            }
                        }
                        
                        case 'movietheater': {
                            // Génération d'un bâtiment cinéma procédural
                            if (!this.renderers.movieTheaterRenderer) {
                                console.warn(`[IMM] MovieTheater renderer not found, falling back to basic cube`);
                                // Fallback au cube de base si le renderer n'est pas disponible
                                geometry = new THREE.BoxGeometry(1, 1, 1);
                                material = new THREE.MeshStandardMaterial({
                                    color: 0xff0000,  // Rouge
                                    emissive: 0x440000, // Émission rouge
                                    emissiveIntensity: 0.3,
                                    name: "MovieTheaterBuildingFallbackMat"
                                });
                                break;
                            }
                            
                            // Utiliser un identifiant de clé pour le cinéma
                            const movieTheaterKey = 'movietheater_proc_0';
                            // Vérifier si l'asset existe déjà dans l'assetLoader
                            let assetData = this.assetLoader.getAssetDataById(movieTheaterKey);
                            
                            if (!assetData) {
                                // Générer l'asset cinéma s'il n'existe pas encore
                                const movieTheaterAsset = this.renderers.movieTheaterRenderer.generateProceduralBuilding(1, 1, 1);
                                if (movieTheaterAsset) {
                                    // Enregistrer l'asset généré
                                    this.assetLoader.registerAssetData(movieTheaterKey, movieTheaterAsset);
                                    assetData = movieTheaterAsset;
                                } else {
                                    console.error(`[IMM] Failed to generate movietheater building asset`);
                                    continue;
                                }
                            }
                            
                            // Gérer les parties (comme pour les autres assets procéduraux)
                            if (assetData.parts && assetData.parts.length > 0) {
                                assetData.parts.forEach((part, index) => {
                                    if (!part.geometry || !part.material) {
                                        console.warn(`[IMM] Invalid part data for movietheater asset, part index: ${index}`);
                                        return;
                                    }

                                    // Aucune fenêtre dans les cinémas pour l'instant (cube simple)
                                    const isPartWindow = false;

                                    const count = matrices.length;
                                    // Cloner le matériau pour éviter les modifications partagées
                                    const partMaterialClone = part.material.clone();
                                    partMaterialClone.name = `Inst_${movieTheaterKey}_part${index}`;

                                    const instancedMesh = new THREE.InstancedMesh(part.geometry, partMaterialClone, count);
                                    instancedMesh.castShadow = castShadow;
                                    instancedMesh.receiveShadow = !isPartWindow;
                                    instancedMesh.name = `${movieTheaterKey}_part${index}`;

                                    matrices.forEach((matrix, mIndex) => {
                                        instancedMesh.setMatrixAt(mIndex, matrix);
                                    });
                                    instancedMesh.instanceMatrix.needsUpdate = true;

                                    this.parentGroup.add(instancedMesh);
                                    this.instancedMeshes[`movietheater_${movieTheaterKey}_part${index}`] = instancedMesh;
                                    totalMeshesCreated++;
                                    totalInstancesCreated += count;
                                });
                                // Important : continuer à la prochaine clé car les meshes ont déjà été créés
                                continue; // Passe à l'itération suivante de la boucle idOrKey
                            } else {
                                console.warn(`[IMM] MovieTheater asset has no parts, unexpected state`);
                                continue;
                            }
                        }
                        
                        case 'house': {
                            // 0) Vérifier d'abord si c'est une partie legacy de HouseRenderer
                            const legacyParts = ['base_part1', 'base_part2', 'roof', 'door', 'garageDoor', 'windowXY', 'windowYZ'];
                            // Ajouter les nouvelles parties de fenêtres détaillées
                            const newWindowParts = ['windowFrameSide', 'windowFrameTopBot', 'windowFrameVerticalCenter', 'windowFrameHorizontalCenter', 'windowPane'];
                            
                            if (legacyParts.includes(idOrKey) || newWindowParts.includes(idOrKey)) {
                                // Fallback legacy : partie fixe de HouseRenderer
                                const partName = idOrKey;
                                geometry = this.renderers.houseRenderer?.baseHouseGeometries[partName];
                                
                                // Gestion des matériaux pour les nouvelles parties de fenêtres
                                if (newWindowParts.includes(partName)) {
                                    if (partName === 'windowPane') {
                                        material = this.renderers.houseRenderer?.baseHouseMaterials?.windowPane;
                                        if (material) isHouseWindowPart = true;
                                    } else if (partName.startsWith('windowFrame')) {
                                        material = this.renderers.houseRenderer?.baseHouseMaterials?.windowFrame;
                                    }
                                } else {
                                    // Parties legacy existantes
                                    material = this.renderers.houseRenderer?.baseHouseMaterials[partName];
                                }
                                
                                if (!geometry) {
                                    console.warn(`[IMM] Géométrie manquante pour partie house: ${partName}`);
                                    continue;
                                }
                                if (!material) {
                                    // Si parties fenêtre legacy
                                    if (partName === 'windowXY' || partName === 'windowYZ') {
                                        material = this.renderers.houseRenderer?.baseHouseMaterials?.window;
                                        if (material) isHouseWindowPart = true;
                                        else { console.warn(`[IMM] Matériau fenêtre manquant pour house part: ${partName}`); continue; }
                                    } else {
                                        console.warn(`[IMM] Matériau manquant pour house part: ${partName}`);
                                        continue;
                                    }
                                } else if (material.name === "HouseWindowMat" || material.name === "HouseWindowPaneMat") {
                                    isHouseWindowPart = true;
                                }
                                break;
                            }
                            // 1) Clé assetId seul : créer un mesh par partie de l'asset procédural avec optimisation
                            else if (!idOrKey.includes('_part')) {
                                const assetData = this.assetLoader.getAssetDataById(idOrKey);
                                if (assetData?.parts && assetData.parts.length > 0) {
                                    // Essayer d'optimiser les parties
                                    const optimizedMeshes = this.optimizeBuildingParts(assetData.parts, matrices, 'house', idOrKey);
                                    
                                    if (optimizedMeshes && optimizedMeshes.length > 0) {
                                        // Utiliser les meshes optimisés
                                        optimizedMeshes.forEach((optimizedMesh) => {
                                            this.parentGroup.add(optimizedMesh.mesh);
                                            this.instancedMeshes[`house_${optimizedMesh.key}`] = optimizedMesh.mesh;
                                            totalMeshesCreated++;
                                            totalInstancesCreated += optimizedMesh.mesh.count;
                                        });
                                    } else {
                                        // Fallback à l'ancienne méthode si l'optimisation échoue
                                        const count = matrices.length;
                                        assetData.parts.forEach((part, idx) => {
                                            if (!part.geometry || !part.material) return;
                                            
                                            const isPartWindow = this.isWindowMaterial(part.material);
                                            const matClone = part.material.clone();
                                            const meshName = `${idOrKey}_part${idx}`;
                                            
                                            if (isPartWindow) {
                                                matClone.name = part.material.name;
                                                matClone.userData = matClone.userData || {};
                                                matClone.userData.isNewHouseWindow = true;
                                            } else {
                                                matClone.name = `Inst_${meshName}`;
                                            }
                                            
                                            const instMesh = new THREE.InstancedMesh(part.geometry, matClone, count);
                                            instMesh.castShadow = true;
                                            instMesh.receiveShadow = !isPartWindow;
                                            instMesh.name = `house_${meshName}`;
                                            matrices.forEach((m, i) => instMesh.setMatrixAt(i, m));
                                            instMesh.instanceMatrix.needsUpdate = true;
                                            this.parentGroup.add(instMesh);
                                            this.instancedMeshes[`house_${meshName}`] = instMesh;
                                            
                                            if (isPartWindow) {
                                                this.windowMeshes.push(instMesh);
                                                if (this.experience?.scene?.environment) {
                                                    if (!matClone.envMap) matClone.envMap = this.experience.scene.environment;
                                                }
                                            }
                                            
                                            totalMeshesCreated++;
                                            totalInstancesCreated += count;
                                        });
                                    }
                                    continue;
                                }
                            }
                            // 2) Clé assetId_partN : mesh d'une seule partie
                            else if (idOrKey.includes('_part')) {
                                const [assetId, partKey] = idOrKey.split(/_(?=part\d+$)/);
                                const assetData = this.assetLoader.getAssetDataById(assetId);
                                if (assetData?.parts && assetData.parts.length > 0) {
                                    const idx = parseInt(partKey.replace('part',''), 10);
                                    const part = assetData.parts[idx];
                                    if (part && part.geometry && part.material) {
                                        // Vérifier si cette partie est une fenêtre AVANT de changer le nom
                                        const isPartWindow = (
                                            part.material.name === "HouseWindowPaneMat" ||
                                            part.material.name === "HouseWindowFrameMat" ||
                                            part.material.name?.startsWith("HouseWindow")
                                        );
                                        
                                        const matClone = part.material.clone();
                                        
                                        // Si c'est une fenêtre, préserver des informations pour l'identification
                                        if (isPartWindow) {
                                            matClone.name = part.material.name; // Préserver le nom original pour les fenêtres
                                            matClone.userData = matClone.userData || {};
                                            matClone.userData.isNewHouseWindow = true;
                                        } else {
                                            matClone.name = `Inst_${assetId}_${partKey}`; // Nom habituel pour les non-fenêtres
                                        }
                                        
                                        const instMesh = new THREE.InstancedMesh(part.geometry, matClone, matrices.length);
                                        instMesh.castShadow = true;
                                        instMesh.receiveShadow = !isPartWindow; // Les fenêtres ne reçoivent pas d'ombres
                                        instMesh.name = `house_${assetId}_${partKey}`;
                                        matrices.forEach((m, i) => instMesh.setMatrixAt(i, m));
                                        instMesh.instanceMatrix.needsUpdate = true;
                                        this.parentGroup.add(instMesh);
                                        this.instancedMeshes[`house_${assetId}_${partKey}`] = instMesh;
                                        
                                        // IMPORTANT: Ajouter les fenêtres à la liste de surveillance
                                        if (isPartWindow) {
                                            this.windowMeshes.push(instMesh);
                                            // Appliquer envMap si nécessaire
                                            if (this.experience?.scene?.environment) {
                                                if (!matClone.envMap) matClone.envMap = this.experience.scene.environment;
                                            }
                                        }
                                        
                                        continue;
                                    }
                                }
                                console.warn(`[IMM] Asset data house introuvable ou sans parts pour ID: ${assetId}`);
                                continue;
                            }
                            // 3) Cas non géré
                            else {
                                console.warn(`[IMM] Clé house non reconnue: ${idOrKey}`);
                                continue;
                            }
                        }

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

                             // Si c'est un asset avec parties et qu'on traite l'asset complet (pas une partie spécifique)
                             if (assetData.parts && assetData.parts.length > 0 && partName === 'default') {
                                 // Essayer d'optimiser toutes les parties ensemble
                                 const optimizedMeshes = this.optimizeBuildingParts(assetData.parts, matrices, type, assetId);
                                 
                                 if (optimizedMeshes && optimizedMeshes.length > 0) {
                                     // Utiliser les meshes optimisés
                                     optimizedMeshes.forEach((optimizedMesh) => {
                                         this.parentGroup.add(optimizedMesh.mesh);
                                         this.instancedMeshes[`${type}_${optimizedMesh.key}`] = optimizedMesh.mesh;
                                         totalMeshesCreated++;
                                         totalInstancesCreated += optimizedMesh.mesh.count;
                                     });
                                     continue; // Passer au prochain élément
                                 }
                             }

                             if (assetData.parts && assetData.parts.length > 0 && partName !== 'default') {
                                 // Asset procédural avec parties - traitement d'une partie spécifique
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
                                // Pour les bâtiments (industrial), essayer l'optimisation
                                if (type === 'industrial') {
                                    const optimizedMeshes = this.optimizeBuildingParts(assetData.parts, matrices, type, assetId);
                                    
                                    if (optimizedMeshes && optimizedMeshes.length > 0) {
                                        // Utiliser les meshes optimisés
                                        optimizedMeshes.forEach((optimizedMesh) => {
                                            this.parentGroup.add(optimizedMesh.mesh);
                                            this.instancedMeshes[`${type}_${optimizedMesh.key}`] = optimizedMesh.mesh;
                                            totalMeshesCreated++;
                                            totalInstancesCreated += optimizedMesh.mesh.count;
                                        });
                                        continue;
                                    }
                                }
                                
                                // Logique existante pour les arbres et fallback pour les bâtiments
                                let treeSwayPhases;
                                if (type === 'tree') {
                                    const count = matrices.length;
                                    treeSwayPhases = new Float32Array(count);
                                    for (let i = 0; i < count; i++) {
                                        treeSwayPhases[i] = Math.random() * Math.PI * 2;
                                    }
                                }
                                assetData.parts.forEach((part, index) => {
                                    if (!part.geometry || !part.material) {
                                        console.warn(`[IMM] Invalid part data for ${type} asset ${assetId}, part index: ${index}`);
                                        return;
                                    }

                                    const isPartWindow = this.isWindowMaterial(part.material);
                                    const count = matrices.length;
                                    const partMaterialClone = part.material.clone();
                                    partMaterialClone.name = `Inst_${meshKey}_part${index}`;

                                    const instancedMesh = new THREE.InstancedMesh(part.geometry, partMaterialClone, count);
                                    instancedMesh.castShadow = castShadow;
                                    instancedMesh.receiveShadow = !isPartWindow;
                                    instancedMesh.name = `${meshKey}_part${index}`;

                                    matrices.forEach((matrix, mIndex) => {
                                        instancedMesh.setMatrixAt(mIndex, matrix);
                                    });
                                    instancedMesh.instanceMatrix.needsUpdate = true;

                                    // Calculer un facteur d'amplitude pour le tronc vs feuillage
                                    const partFactor = part.material.name.includes('TreeTrunkMat') ? 0.7 : 1.0;

                                    // Ajout: animation de balancement pour les arbres
                                    if (type === 'tree') {
                                        const phases = new Float32Array(count);
                                        for (let i = 0; i < count; i++) {
                                            phases[i] = treeSwayPhases[i];
                                        }
                                        instancedMesh.geometry.setAttribute('instanceSwayPhase', new THREE.InstancedBufferAttribute(phases, 1));
                                        instancedMesh.material.onBeforeCompile = (shader) => {
                                            shader.uniforms.uTime = { value: 0 };
                                            shader.uniforms.uSwayAmplitude = { value: 0.05 };
                                            shader.uniforms.uSwayFrequency = { value: 1.0 };
                                            shader.uniforms.uPartFactor = { value: partFactor };
                                            shader.vertexShader = 'attribute float instanceSwayPhase;\nuniform float uTime;\nuniform float uSwayAmplitude;\nuniform float uSwayFrequency;\nuniform float uPartFactor;\n' + shader.vertexShader;
                                            shader.vertexShader = shader.vertexShader.replace(
                                                '#include <begin_vertex>',
                                                `#include <begin_vertex>
                                                float sway = sin(uTime * uSwayFrequency + instanceSwayPhase) * uSwayAmplitude * uPartFactor;
                                                transformed.z += sway * transformed.y;`
                                            );
                                            instancedMesh.userData.shader = shader;
                                        };
                                    }
                                    this.parentGroup.add(instancedMesh);
                                    this.instancedMeshes[`${meshKey}_part${index}`] = instancedMesh;
                                    totalMeshesCreated++;
                                    totalInstancesCreated += count;

                                    // Ajouter aux fenêtres si applicable
                                    if (isPartWindow) {
                                        this.windowMeshes.push(instancedMesh);
                                        if (this.experience?.scene?.environment) {
                                            if (!partMaterialClone.envMap) partMaterialClone.envMap = this.experience.scene.environment;
                                        }
                                    }
                                });
                                continue;
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
                            "HouseWindowPaneMat",
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

                        // Ajout: animation de balancement pour les arbres
                        if (type === 'tree') {
                            const phases = new Float32Array(count);
                            for (let i = 0; i < count; i++) {
                                phases[i] = treeSwayPhases[i];
                            }
                            instancedMesh.geometry.setAttribute('instanceSwayPhase', new THREE.InstancedBufferAttribute(phases, 1));
                            instancedMesh.material.onBeforeCompile = (shader) => {
                                shader.uniforms.uTime = { value: 0 };
                                shader.uniforms.uSwayAmplitude = { value: 0.05 };
                                shader.uniforms.uSwayFrequency = { value: 1.0 };
                                shader.uniforms.uPartFactor = { value: partFactor };
                                shader.vertexShader = 'attribute float instanceSwayPhase;\nuniform float uTime;\nuniform float uSwayAmplitude;\nuniform float uSwayFrequency;\nuniform float uPartFactor;\n' + shader.vertexShader;
                                shader.vertexShader = shader.vertexShader.replace(
                                    '#include <begin_vertex>',
                                    `#include <begin_vertex>
                                    float sway = sin(uTime * uSwayFrequency + instanceSwayPhase) * uSwayAmplitude * uPartFactor;
                                    transformed.z += sway * transformed.y;`
                                );
                                instancedMesh.userData.shader = shader;
                            };
                        }
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
            if (this.enableBuildingOptimization) {
                console.log(`Building optimization enabled - draw calls reduced by geometry merging.`);
            }
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
            const isNewHouseWindow = material.name === "HouseWindowPaneMat"; // <-- AJOUTER CETTE NOUVELLE VÉRIFICATION
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
            } else if (isNewHouseWindow) { // <-- AJOUTER CE BLOC POUR LES NOUVELLES MAISONS
                targetIntensity = lightsOn ? 1.2 : 0.0; // Intensité similaire aux maisons classiques
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

        // Nettoyer les InstancedMesh LOD
        Object.keys(this.lodInstancedMeshes).forEach(key => {
            const mesh = this.lodInstancedMeshes[key];
            if (mesh) {
                // Retirer de la scène
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                }
                // Nettoyer le matériau cloné
                if (mesh.material) {
                    mesh.material.dispose();
                }
            }
        });

        // Réinitialiser les conteneurs
        this.instancedMeshes = {};
        this.lodInstancedMeshes = {};

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
        
        // Nettoyer le BuildingLODRenderer
        if (this.buildingLODRenderer) {
            this.buildingLODRenderer.dispose();
            this.buildingLODRenderer = null;
        }
        
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