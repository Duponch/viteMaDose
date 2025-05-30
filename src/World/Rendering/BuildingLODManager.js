import * as THREE from 'three';

/**
 * Gestionnaire de niveau de détail (LOD) pour les bâtiments
 * Optimise les performances en ajustant la qualité des rendus selon la distance à la caméra
 */
export default class BuildingLODManager {
    constructor(config = {}) {
        this.config = {
            // Distances de transition LOD (en unités Three.js)
            highDetailDistance: 50,    // Distance pour le détail max
            mediumDetailDistance: 150, // Distance pour le détail moyen
            lowDetailDistance: 300,    // Distance pour le détail bas (cubes)
            cullDistance: 500,         // Distance de culling complet
            
            // Configuration des LOD
            lodLevels: {
                HIGH: 0,    // Modèle complet avec tous les détails
                MEDIUM: 1,  // Modèle simplifié
                LOW: 2,     // Cube coloré simple
                CULLED: 3   // Invisible
            },
            
            // Couleurs par type de bâtiment pour les cubes LOD bas
            lodColors: {
                house: 0x8fbc8f,      // Vert maison
                building: 0x708090,   // Gris bleu immeuble
                skyscraper: 0x696969, // Gris foncé gratte-ciel
                industrial: 0xcd853f, // Brun industriel
                commercial: 0x9370db, // Violet commercial
                default: 0xcccccc     // Gris par défaut
            },
            
            // Facteurs de réduction pour les cubes LOD
            lodBoxScale: {
                house: 0.8,
                building: 0.9,
                skyscraper: 0.95,
                industrial: 0.85,
                commercial: 0.8,
                default: 0.8
            },
            
            // Fréquence de mise à jour (en ms)
            updateInterval: 100,
            
            ...config
        };

        // Cache des distances calculées
        this.distanceCache = new Map();
        this.lastUpdateTime = 0;
        
        // Stockage des instances de bâtiments avec leur LOD
        this.buildingInstances = new Map(); // key: instanceId, value: { mesh, type, originalMesh, lodMesh, currentLOD }
        
        // Géométries et matériaux partagés pour les cubes LOD
        this.lodGeometries = new Map();
        this.lodMaterials = new Map();
        
        // InstancedMesh pour les cubes LOD par type de bâtiment
        this.lodInstancedMeshes = new Map(); // key: buildingType, value: { mesh, instances, matrices }
        this.lodInstanceCount = 1000; // Nombre maximum d'instances par type
        
        this.initializeLODAssets();
    }

    /**
     * Initialise les géométries et matériaux partagés pour les cubes LOD
     */
    initializeLODAssets() {
        // Géométrie cube de base
        this.baseCubeGeometry = new THREE.BoxGeometry(1, 1, 1);
        
        // Matériaux pour chaque type de bâtiment
        Object.entries(this.config.lodColors).forEach(([type, color]) => {
            const material = new THREE.MeshLambertMaterial({
                color: color,
                transparent: true,
                opacity: 0.8
            });
            this.lodMaterials.set(type, material);
        });
        
        // Initialiser les InstancedMesh pour les cubes LOD
        this.initializeLODInstancedMeshes();
    }

    /**
     * Initialise les InstancedMesh pour les cubes LOD
     */
    initializeLODInstancedMeshes() {
        Object.keys(this.config.lodColors).forEach(type => {
            const material = this.lodMaterials.get(type);
            const instancedMesh = new THREE.InstancedMesh(
                this.baseCubeGeometry,
                material,
                this.lodInstanceCount
            );
            instancedMesh.name = `LOD_Cubes_${type}`;
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            instancedMesh.count = 0; // Aucune instance visible au début
            
            this.lodInstancedMeshes.set(type, {
                mesh: instancedMesh,
                instances: [], // Array des instance IDs utilisant ce mesh
                matrices: []   // Array des matrices correspondantes
            });
        });
    }

    /**
     * Enregistre une instance de bâtiment pour le système LOD
     * @param {string} instanceId - Identifiant unique de l'instance
     * @param {THREE.Mesh|THREE.InstancedMesh} mesh - Mesh du bâtiment
     * @param {string} type - Type de bâtiment (house, building, skyscraper, etc.)
     * @param {THREE.Vector3} position - Position du bâtiment
     * @param {number} instanceIndex - Index de l'instance dans l'InstancedMesh (optionnel)
     */
    registerBuilding(instanceId, mesh, type, position, instanceIndex = null) {
        if (this.buildingInstances.has(instanceId)) {
            console.warn(`BuildingLODManager: Instance ${instanceId} already registered`);
            return;
        }

        // Calculer les dimensions du bâtiment pour le cube LOD
        const lodMatrix = this.calculateLODMatrix(type, position, mesh);
        
        this.buildingInstances.set(instanceId, {
            originalMesh: mesh,
            type: type,
            position: position.clone(),
            currentLOD: this.config.lodLevels.HIGH,
            lastDistance: 0,
            instanceIndex: instanceIndex,
            lodMatrix: lodMatrix,
            lodInstanceIndex: -1 // Index dans l'InstancedMesh LOD (-1 = pas affiché)
        });
    }

    /**
     * Calcule la matrice de transformation pour le cube LOD
     * @param {string} type - Type de bâtiment
     * @param {THREE.Vector3} position - Position du bâtiment
     * @param {THREE.Mesh} originalMesh - Mesh original pour obtenir les dimensions
     * @returns {THREE.Matrix4} - Matrice de transformation pour le cube LOD
     */
    calculateLODMatrix(type, position, originalMesh) {
        // Calculer les dimensions approximatives du bâtiment original
        let boundingBox;
        if (originalMesh.geometry) {
            if (!originalMesh.geometry.boundingBox) {
                originalMesh.geometry.computeBoundingBox();
            }
            boundingBox = originalMesh.geometry.boundingBox;
        } else {
            // Fallback pour les dimensions par défaut
            boundingBox = new THREE.Box3(
                new THREE.Vector3(-5, 0, -5),
                new THREE.Vector3(5, 10, 5)
            );
        }

        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        
        // Appliquer le facteur de réduction
        const scaleFactor = this.config.lodBoxScale[type] || this.config.lodBoxScale.default;
        size.multiplyScalar(scaleFactor);

        // Créer la matrice de transformation
        const matrix = new THREE.Matrix4();
        matrix.compose(
            position,
            new THREE.Quaternion(), // Pas de rotation
            size // Utiliser les dimensions comme échelle
        );
        
        return matrix;
    }

    /**
     * Met à jour le système LOD en fonction de la position de la caméra
     * @param {THREE.Camera} camera - Caméra de référence
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame
     */
    update(camera, deltaTime) {
        const currentTime = performance.now();
        
        // Limiter la fréquence de mise à jour pour les performances
        if (currentTime - this.lastUpdateTime < this.config.updateInterval) {
            return;
        }
        
        this.lastUpdateTime = currentTime;
        
        const cameraPosition = camera.position;
        
        // Mettre à jour chaque instance de bâtiment
        this.buildingInstances.forEach((instance, instanceId) => {
            this.updateInstanceLOD(instance, cameraPosition);
        });
    }

    /**
     * Met à jour le LOD d'une instance spécifique
     * @param {Object} instance - Instance de bâtiment
     * @param {THREE.Vector3} cameraPosition - Position de la caméra
     */
    updateInstanceLOD(instance, cameraPosition) {
        // Calculer la distance à la caméra
        const distance = instance.position.distanceTo(cameraPosition);
        instance.lastDistance = distance;
        
        // Déterminer le niveau LOD approprié
        let targetLOD;
        if (distance <= this.config.highDetailDistance) {
            targetLOD = this.config.lodLevels.HIGH;
        } else if (distance <= this.config.mediumDetailDistance) {
            targetLOD = this.config.lodLevels.MEDIUM;
        } else if (distance <= this.config.lowDetailDistance) {
            targetLOD = this.config.lodLevels.LOW;
        } else {
            targetLOD = this.config.lodLevels.CULLED;
        }
        
        // Appliquer le changement de LOD si nécessaire
        if (instance.currentLOD !== targetLOD) {
            this.applyLODLevel(instance, targetLOD);
            instance.currentLOD = targetLOD;
        }
    }

    /**
     * Applique le niveau LOD à une instance
     * @param {Object} instance - Instance de bâtiment
     * @param {number} lodLevel - Niveau LOD à appliquer
     */
    applyLODLevel(instance, lodLevel) {
        const { originalMesh, instanceIndex, type } = instance;
        const previousLOD = instance.currentLOD;
        
        // Si le LOD n'a pas changé, ne rien faire
        if (previousLOD === lodLevel) return;
        
        switch (lodLevel) {
            case this.config.lodLevels.HIGH:
            case this.config.lodLevels.MEDIUM:
                // Afficher le modèle complet
                if (originalMesh && originalMesh.isInstancedMesh && instanceIndex !== null) {
                    this.setInstanceVisible(originalMesh, instanceIndex, true);
                }
                // Retirer du système de cube LOD si nécessaire
                this.removeBuildingFromLODMesh(instance);
                break;
                
            case this.config.lodLevels.LOW:
                // Cube simple - masquer l'instance originale et afficher le cube LOD
                if (originalMesh && originalMesh.isInstancedMesh && instanceIndex !== null) {
                    this.setInstanceVisible(originalMesh, instanceIndex, false);
                }
                // Ajouter au système de cube LOD
                this.addBuildingToLODMesh(instance);
                break;
                
            case this.config.lodLevels.CULLED:
                // Invisible - masquer tout
                if (originalMesh && originalMesh.isInstancedMesh && instanceIndex !== null) {
                    this.setInstanceVisible(originalMesh, instanceIndex, false);
                }
                // Retirer du système de cube LOD
                this.removeBuildingFromLODMesh(instance);
                break;
        }
    }

    /**
     * Contrôle la visibilité d'une instance spécifique dans un InstancedMesh
     * @param {THREE.InstancedMesh} instancedMesh - Mesh instancié
     * @param {number} instanceIndex - Index de l'instance
     * @param {boolean} visible - Visibilité souhaitée
     */
    setInstanceVisible(instancedMesh, instanceIndex, visible) {
        if (!instancedMesh || !instancedMesh.isInstancedMesh || instanceIndex < 0 || instanceIndex >= instancedMesh.count) {
            return;
        }

        const matrix = new THREE.Matrix4();
        instancedMesh.getMatrixAt(instanceIndex, matrix);

        if (visible) {
            // Restaurer la matrice originale si elle était sauvegardée
            if (instancedMesh.userData.hiddenMatrices && instancedMesh.userData.hiddenMatrices[instanceIndex]) {
                instancedMesh.setMatrixAt(instanceIndex, instancedMesh.userData.hiddenMatrices[instanceIndex]);
                delete instancedMesh.userData.hiddenMatrices[instanceIndex];
            }
        } else {
            // Sauvegarder la matrice originale avant de la masquer
            if (!instancedMesh.userData.hiddenMatrices) {
                instancedMesh.userData.hiddenMatrices = {};
            }
            instancedMesh.userData.hiddenMatrices[instanceIndex] = matrix.clone();
            
            // Créer une matrice d'échelle zéro pour masquer l'instance
            const hiddenMatrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            
            matrix.decompose(position, quaternion, scale);
            hiddenMatrix.compose(position, quaternion, new THREE.Vector3(0, 0, 0)); // Échelle zéro
            
            instancedMesh.setMatrixAt(instanceIndex, hiddenMatrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Ajoute un bâtiment au système de cube LOD instancié
     * @param {Object} instance - Instance de bâtiment
     */
    addBuildingToLODMesh(instance) {
        if (instance.lodInstanceIndex !== -1) {
            return; // Déjà ajouté
        }
        
        const lodData = this.lodInstancedMeshes.get(instance.type);
        if (!lodData) {
            console.warn(`No LOD mesh found for building type: ${instance.type}`);
            return;
        }
        
        const { mesh, instances, matrices } = lodData;
        
        // Vérifier si on a encore de la place
        if (instances.length >= this.lodInstanceCount) {
            console.warn(`LOD mesh for ${instance.type} is full`);
            return;
        }
        
        // Ajouter l'instance
        const lodIndex = instances.length;
        instances.push(instance);
        matrices.push(instance.lodMatrix);
        
        // Mettre à jour l'InstancedMesh
        mesh.setMatrixAt(lodIndex, instance.lodMatrix);
        mesh.count = instances.length;
        mesh.instanceMatrix.needsUpdate = true;
        
        // Sauvegarder l'index dans l'instance
        instance.lodInstanceIndex = lodIndex;
    }

    /**
     * Retire un bâtiment du système de cube LOD instancié
     * @param {Object} instance - Instance de bâtiment
     */
    removeBuildingFromLODMesh(instance) {
        if (instance.lodInstanceIndex === -1) {
            return; // Pas dans le système LOD
        }
        
        const lodData = this.lodInstancedMeshes.get(instance.type);
        if (!lodData) {
            return;
        }
        
        const { mesh, instances, matrices } = lodData;
        const indexToRemove = instance.lodInstanceIndex;
        
        // Enlever l'instance et sa matrice
        instances.splice(indexToRemove, 1);
        matrices.splice(indexToRemove, 1);
        
        // Mettre à jour tous les indices des instances qui suivent
        for (let i = indexToRemove; i < instances.length; i++) {
            instances[i].lodInstanceIndex = i;
            mesh.setMatrixAt(i, matrices[i]);
        }
        
        // Mettre à jour le count et marquer pour update
        mesh.count = instances.length;
        mesh.instanceMatrix.needsUpdate = true;
        
        // Réinitialiser l'index de l'instance
        instance.lodInstanceIndex = -1;
    }

    /**
     * Gère le LOD pour les InstancedMesh (simplification future)
     * @param {THREE.InstancedMesh} instancedMesh - Mesh instancié
     * @param {string} level - Niveau de détail
     */
    setInstancedMeshLOD(instancedMesh, level) {
        // Pour l'instant, on ne fait rien de spécial
        // Dans le futur, on pourrait réduire le nombre d'instances visibles
        // ou utiliser des géométries simplifiées
    }

    /**
     * Ajoute les meshes LOD à la scène
     * @param {THREE.Scene} scene - Scène Three.js
     */
    addLODMeshesToScene(scene) {
        this.lodInstancedMeshes.forEach((lodData, type) => {
            if (!lodData.mesh.parent) {
                scene.add(lodData.mesh);
            }
        });
    }

    /**
     * Retire les meshes LOD de la scène
     * @param {THREE.Scene} scene - Scène Three.js
     */
    removeLODMeshesFromScene(scene) {
        this.lodInstancedMeshes.forEach((lodData, type) => {
            if (lodData.mesh.parent) {
                scene.remove(lodData.mesh);
            }
        });
    }

    /**
     * Supprime une instance du système LOD
     * @param {string} instanceId - Identifiant de l'instance
     */
    unregisterBuilding(instanceId) {
        const instance = this.buildingInstances.get(instanceId);
        if (instance) {
            // Retirer du système de cube LOD
            this.removeBuildingFromLODMesh(instance);
            
            this.buildingInstances.delete(instanceId);
        }
    }

    /**
     * Obtient les statistiques du système LOD
     * @returns {Object} - Statistiques
     */
    getStats() {
        const stats = {
            totalBuildings: this.buildingInstances.size,
            lodDistribution: {
                [this.config.lodLevels.HIGH]: 0,
                [this.config.lodLevels.MEDIUM]: 0,
                [this.config.lodLevels.LOW]: 0,
                [this.config.lodLevels.CULLED]: 0
            }
        };
        
        this.buildingInstances.forEach(instance => {
            stats.lodDistribution[instance.currentLOD]++;
        });
        
        return stats;
    }

    /**
     * Configure les distances de transition LOD
     * @param {Object} distances - Nouvelles distances
     */
    setLODDistances(distances) {
        Object.assign(this.config, distances);
    }

    /**
     * Nettoie toutes les ressources
     */
    dispose() {
        // Nettoyer toutes les instances
        this.buildingInstances.forEach((instance, instanceId) => {
            this.unregisterBuilding(instanceId);
        });
        
        // Disposer les InstancedMesh LOD
        this.lodInstancedMeshes.forEach((lodData, type) => {
            if (lodData.mesh.parent) {
                lodData.mesh.parent.remove(lodData.mesh);
            }
            // Les géométries et matériaux sont partagés, donc pas de dispose ici
        });
        
        // Disposer les géométries partagées
        this.baseCubeGeometry?.dispose();
        
        // Disposer les matériaux partagés
        this.lodMaterials.forEach(material => {
            material.dispose();
        });
        
        // Nettoyer les maps
        this.buildingInstances.clear();
        this.distanceCache.clear();
        this.lodGeometries.clear();
        this.lodMaterials.clear();
        this.lodInstancedMeshes.clear();
    }
}