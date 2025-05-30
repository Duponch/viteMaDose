import * as THREE from 'three';

/**
 * Gestionnaire LOD optimisé qui reconstruit dynamiquement les InstancedMesh
 * pour ne rendre que les instances vraiment nécessaires
 */
export default class OptimizedBuildingLODManager {
    constructor(config = {}) {
        this.config = {
            // Distances de transition LOD
            highDetailDistance: 50,
            mediumDetailDistance: 150,
            lowDetailDistance: 300,
            cullDistance: 500,
            
            // LOD levels
            lodLevels: {
                HIGH: 0,
                MEDIUM: 1,
                LOW: 2,
                CULLED: 3
            },
            
            // Couleurs par type pour cubes LOD
            lodColors: {
                house: 0x8fbc8f,
                building: 0x708090,
                skyscraper: 0x696969,
                industrial: 0xcd853f,
                commercial: 0x9370db,
                default: 0xcccccc
            },
            
            // Facteurs de réduction pour cubes LOD
            lodBoxScale: {
                house: 0.8,
                building: 0.9,
                skyscraper: 0.95,
                industrial: 0.85,
                commercial: 0.8,
                default: 0.8
            },
            
            // Fréquence de reconstruction (en ms)
            rebuildInterval: 200,
            
            ...config
        };

        // Stockage des bâtiments
        this.buildings = new Map(); // instanceId -> buildingData
        
        // Stockage des InstancedMesh originaux par type
        this.originalMeshes = new Map(); // meshType -> { mesh, originalMatrices, buildingType }
        
        // InstancedMesh optimisés (reconstruits dynamiquement)
        this.optimizedMeshes = new Map(); // meshType -> optimizedInstancedMesh
        
        // InstancedMesh pour cubes LOD
        this.lodCubeMeshes = new Map(); // buildingType -> InstancedMesh
        
        // Timing
        this.lastRebuildTime = 0;
        this.needsRebuild = false;
        
        // Scene reference
        this.scene = null;
        
        this.initializeLODAssets();
    }

    /**
     * Initialise les assets LOD
     */
    initializeLODAssets() {
        // Géométrie cube partagée
        this.cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
        
        // Matériaux pour cubes LOD
        this.cubeMaterials = new Map();
        Object.entries(this.config.lodColors).forEach(([type, color]) => {
            const material = new THREE.MeshLambertMaterial({
                color: color,
                transparent: true,
                opacity: 0.8
            });
            this.cubeMaterials.set(type, material);
        });
    }

    /**
     * Enregistre un InstancedMesh original et ses bâtiments
     */
    registerInstancedMesh(mesh, buildingType, scene) {
        if (!mesh.isInstancedMesh) return;
        
        this.scene = scene;
        const meshType = mesh.name || `${buildingType}_mesh`;
        
        // Sauvegarder toutes les matrices originales
        const originalMatrices = [];
        for (let i = 0; i < mesh.count; i++) {
            const matrix = new THREE.Matrix4();
            mesh.getMatrixAt(i, matrix);
            originalMatrices.push(matrix);
            
            // Enregistrer le bâtiment
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(matrix);
            
            const buildingId = `${meshType}_${i}`;
            this.buildings.set(buildingId, {
                meshType: meshType,
                buildingType: buildingType,
                instanceIndex: i,
                position: position,
                originalMatrix: matrix.clone(),
                currentLOD: this.config.lodLevels.HIGH,
                distance: 0
            });
        }
        
        // Sauvegarder le mesh original
        this.originalMeshes.set(meshType, {
            mesh: mesh,
            originalMatrices: originalMatrices,
            buildingType: buildingType
        });
        
        // Créer un mesh optimisé initialement identique
        this.createOptimizedMesh(meshType, mesh, originalMatrices);
        
        // Créer le mesh pour cubes LOD si pas déjà fait
        if (!this.lodCubeMeshes.has(buildingType)) {
            this.createLODCubeMesh(buildingType);
        }
        
        console.log(`OptimizedBuildingLODManager: Registered ${mesh.count} buildings of type ${buildingType}`);
    }

    /**
     * Crée un InstancedMesh optimisé
     */
    createOptimizedMesh(meshType, originalMesh, matrices) {
        const optimizedMesh = new THREE.InstancedMesh(
            originalMesh.geometry,
            originalMesh.material,
            matrices.length
        );
        
        // Copier les propriétés
        optimizedMesh.name = `Optimized_${originalMesh.name}`;
        optimizedMesh.castShadow = originalMesh.castShadow;
        optimizedMesh.receiveShadow = originalMesh.receiveShadow;
        optimizedMesh.frustumCulled = originalMesh.frustumCulled;
        
        // Définir les matrices
        matrices.forEach((matrix, index) => {
            optimizedMesh.setMatrixAt(index, matrix);
        });
        optimizedMesh.count = matrices.length;
        optimizedMesh.instanceMatrix.needsUpdate = true;
        
        // Remplacer dans la scène
        if (originalMesh.parent) {
            originalMesh.parent.add(optimizedMesh);
            originalMesh.parent.remove(originalMesh);
        }
        
        this.optimizedMeshes.set(meshType, optimizedMesh);
    }

    /**
     * Crée un InstancedMesh pour les cubes LOD
     */
    createLODCubeMesh(buildingType) {
        const material = this.cubeMaterials.get(buildingType) || this.cubeMaterials.get('default');
        const cubeMesh = new THREE.InstancedMesh(
            this.cubeGeometry,
            material,
            1000 // Capacité maximale
        );
        
        cubeMesh.name = `LOD_Cubes_${buildingType}`;
        cubeMesh.castShadow = true;
        cubeMesh.receiveShadow = true;
        cubeMesh.count = 0;
        
        this.lodCubeMeshes.set(buildingType, cubeMesh);
        
        if (this.scene) {
            this.scene.add(cubeMesh);
        }
    }

    /**
     * Met à jour le système LOD
     */
    update(camera, deltaTime) {
        const currentTime = performance.now();
        
        // Calculer les distances et LOD pour tous les bâtiments
        let needsRebuild = false;
        this.buildings.forEach((building) => {
            const distance = building.position.distanceTo(camera.position);
            building.distance = distance;
            
            const newLOD = this.calculateLOD(distance);
            if (building.currentLOD !== newLOD) {
                building.currentLOD = newLOD;
                needsRebuild = true;
            }
        });
        
        // Reconstruire les meshes si nécessaire
        if (needsRebuild && (currentTime - this.lastRebuildTime) > this.config.rebuildInterval) {
            this.rebuildMeshes();
            this.lastRebuildTime = currentTime;
        }
    }

    /**
     * Calcule le niveau LOD selon la distance
     */
    calculateLOD(distance) {
        if (distance <= this.config.highDetailDistance) {
            return this.config.lodLevels.HIGH;
        } else if (distance <= this.config.mediumDetailDistance) {
            return this.config.lodLevels.MEDIUM;
        } else if (distance <= this.config.lowDetailDistance) {
            return this.config.lodLevels.LOW;
        } else if (distance <= this.config.cullDistance) {
            return this.config.lodLevels.LOW; // Garder cubes pour très loin
        } else {
            return this.config.lodLevels.CULLED;
        }
    }

    /**
     * Reconstruit tous les meshes selon les LOD actuels
     */
    rebuildMeshes() {
        // Regrouper les bâtiments par mesh type et LOD
        const meshGroups = new Map();
        const lodGroups = new Map();
        
        this.buildings.forEach((building) => {
            const { meshType, buildingType, currentLOD, originalMatrix } = building;
            
            if (currentLOD === this.config.lodLevels.HIGH || currentLOD === this.config.lodLevels.MEDIUM) {
                // Bâtiment en haute/moyenne qualité
                if (!meshGroups.has(meshType)) {
                    meshGroups.set(meshType, []);
                }
                meshGroups.get(meshType).push(originalMatrix);
                
            } else if (currentLOD === this.config.lodLevels.LOW) {
                // Cube LOD
                if (!lodGroups.has(buildingType)) {
                    lodGroups.set(buildingType, []);
                }
                lodGroups.get(buildingType).push(this.createLODMatrix(building));
            }
            // CULLED = pas rendu du tout
        });
        
        // Reconstruire les meshes optimisés
        this.originalMeshes.forEach((originalData, meshType) => {
            const optimizedMesh = this.optimizedMeshes.get(meshType);
            const newMatrices = meshGroups.get(meshType) || [];
            
            // Mettre à jour le count
            optimizedMesh.count = newMatrices.length;
            
            // Mettre à jour les matrices
            newMatrices.forEach((matrix, index) => {
                optimizedMesh.setMatrixAt(index, matrix);
            });
            
            if (newMatrices.length > 0) {
                optimizedMesh.instanceMatrix.needsUpdate = true;
                optimizedMesh.visible = true;
            } else {
                optimizedMesh.visible = false;
            }
        });
        
        // Reconstruire les cubes LOD
        this.lodCubeMeshes.forEach((cubeMesh, buildingType) => {
            const lodMatrices = lodGroups.get(buildingType) || [];
            
            cubeMesh.count = lodMatrices.length;
            
            lodMatrices.forEach((matrix, index) => {
                cubeMesh.setMatrixAt(index, matrix);
            });
            
            if (lodMatrices.length > 0) {
                cubeMesh.instanceMatrix.needsUpdate = true;
                cubeMesh.visible = true;
            } else {
                cubeMesh.visible = false;
            }
        });
        
        // Log des stats
        const stats = this.getStats();
        console.log(`LOD Rebuild: HIGH=${stats.lodDistribution[0]}, MED=${stats.lodDistribution[1]}, LOW=${stats.lodDistribution[2]}, CULLED=${stats.lodDistribution[3]}`);
    }

    /**
     * Crée une matrice pour un cube LOD
     */
    createLODMatrix(building) {
        const { position, buildingType } = building;
        const scaleFactor = this.config.lodBoxScale[buildingType] || this.config.lodBoxScale.default;
        
        // Taille du cube basée sur la distance (plus petit = plus loin)
        const baseSize = 8; // Taille de base
        const size = baseSize * scaleFactor;
        
        const matrix = new THREE.Matrix4();
        matrix.compose(
            position,
            new THREE.Quaternion(),
            new THREE.Vector3(size, size, size)
        );
        
        return matrix;
    }

    /**
     * Obtient les statistiques
     */
    getStats() {
        const stats = {
            totalBuildings: this.buildings.size,
            lodDistribution: [0, 0, 0, 0]
        };
        
        this.buildings.forEach(building => {
            stats.lodDistribution[building.currentLOD]++;
        });
        
        return stats;
    }

    /**
     * Configure les distances LOD
     */
    setLODDistances(distances) {
        Object.assign(this.config, distances);
        this.needsRebuild = true;
    }

    /**
     * Nettoie les ressources
     */
    dispose() {
        // Nettoyer les meshes optimisés
        this.optimizedMeshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
        });
        
        // Nettoyer les cubes LOD
        this.lodCubeMeshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
        });
        
        // Disposer géométries et matériaux
        this.cubeGeometry?.dispose();
        this.cubeMaterials.forEach(material => material.dispose());
        
        // Nettoyer les maps
        this.buildings.clear();
        this.originalMeshes.clear();
        this.optimizedMeshes.clear();
        this.lodCubeMeshes.clear();
        this.cubeMaterials.clear();
    }
}