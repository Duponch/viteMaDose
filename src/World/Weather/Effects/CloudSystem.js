/**
 * Système de nuages amélioré pour le système météorologique
 * Gère la densité, l'opacité et l'animation des nuages
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Objets temporaires pour l'update (performance)
const _tempMatrix = new THREE.Matrix4();
const _tempPosition = new THREE.Vector3();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();

export default class CloudSystem {
    /**
     * @param {Object} weatherSystem - Référence au système météo principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.scene = weatherSystem.scene;
        this.environment = weatherSystem.environment;
        
        // Configuration
        this.numberOfCloudBaseShapes = 5; // Nombre de formes de base différentes
        this.totalNumberOfClouds = 40;    // Nombre total de nuages (augmenté)
        this.cloudAnimationSpeed = 0.00005; // Vitesse de base de l'animation
        this.cloudOpacity = 0.5;         // Opacité initiale des nuages (0-1)
        this.cloudDensity = 0.3;         // Densité initiale des nuages (0-1)
        
        // Groupes et références
        this.cloudGroup = new THREE.Group();
        this.cloudGroup.name = "WeatherCloudSystem";
        this.cloudMaterial = null;
        this.cloudBaseGeometries = [];
        this.cloudInstancedMeshes = [];
        
        // Initialisation
        this.initialize();
    }
    
    /**
     * Initialise le système de nuages
     */
    initialize() {
        // Créer le matériau des nuages
        this.cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true,
            transparent: true,
            opacity: this.cloudOpacity
        });
        
        // Créer les formes de base des nuages
        for (let i = 0; i < this.numberOfCloudBaseShapes; i++) {
            this.cloudBaseGeometries.push(this.createLowPolyCloudGeometry());
        }
        
        // Créer les nuages instances
        this.createCloudInstances();
        
        // Ajouter le groupe de nuages à la scène
        this.scene.add(this.cloudGroup);
        
        console.log(`Système de nuages initialisé avec ${this.totalNumberOfClouds} nuages`);
    }
    
    /**
     * Crée une géométrie de nuage low-poly aléatoire
     * @returns {THREE.BufferGeometry} La géométrie du nuage
     */
    createLowPolyCloudGeometry() {
        const cloudPartGeometries = [];
        const baseGeometry = new THREE.IcosahedronGeometry(5, 0);

        const numParts = THREE.MathUtils.randInt(6, 12); // Plus de parties pour plus de variation
        const maxOffset = 6;
        const minPartScale = 0.3;
        const maxPartScale = 0.8; // Légèrement plus grand

        for (let i = 0; i < numParts; i++) {
            const randomPosition = new THREE.Vector3(
                (Math.random() - 0.5) * 2 * maxOffset,
                (Math.random() - 0.5) * 2 * maxOffset * 0.5,
                (Math.random() - 0.5) * 2 * maxOffset
            );
            const randomScale = THREE.MathUtils.randFloat(minPartScale, maxPartScale);
            const scaleVector = new THREE.Vector3(randomScale, randomScale, randomScale);
            const matrix = new THREE.Matrix4();
            matrix.compose(randomPosition, new THREE.Quaternion(), scaleVector);

            const clonedGeom = baseGeometry.clone();
            clonedGeom.applyMatrix4(matrix);
            cloudPartGeometries.push(clonedGeom);
        }

        const mergedGeometry = mergeGeometries(cloudPartGeometries, false);
        cloudPartGeometries.forEach(geom => geom.dispose());
        baseGeometry.dispose();

        if (mergedGeometry) {
            mergedGeometry.center();
            return mergedGeometry;
        } else {
            console.warn("Échec de la fusion de la géométrie du nuage");
            return new THREE.IcosahedronGeometry(8, 0);
        }
    }
    
    /**
     * Crée les instances de nuages
     */
    createCloudInstances() {
        if (this.cloudInstancedMeshes.length > 0) {
            // Nettoyer les instances existantes
            this.cloudInstancedMeshes.forEach(mesh => {
                this.cloudGroup.remove(mesh);
            });
            this.cloudInstancedMeshes = [];
        }
        
        // Calculer le nombre d'instances par forme
        const instancesPerMesh = Math.ceil(this.totalNumberOfClouds / this.numberOfCloudBaseShapes);
        
        // Créer les meshes instanciés
        this.cloudBaseGeometries.forEach((baseGeom, index) => {
            const instancedMesh = new THREE.InstancedMesh(
                baseGeom,
                this.cloudMaterial,
                instancesPerMesh
            );
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = false;
            instancedMesh.name = `CloudMesh_${index}`;
            
            this.cloudInstancedMeshes.push(instancedMesh);
            this.cloudGroup.add(instancedMesh);
        });
        
        // Placer les instances
        this.placeClouds();
    }
    
    /**
     * Place toutes les instances de nuages dans le ciel
     */
    placeClouds() {
        // Configuration du placement
        const skyHeight = 230;
        const spreadRadius = this.weatherSystem.experience.world.cityManager.config.mapSize * 0.8;
        const scaleMin = 0.8;
        const scaleMax = 15.0; // Plus grand pour une meilleure couverture
        
        // Compteurs pour chaque mesh instancié
        let currentInstanceIndex = 0;
        const instanceCounters = new Array(this.numberOfCloudBaseShapes).fill(0);
        
        // Déterminer combien de nuages placer en fonction de la densité
        const actualCloudCount = Math.floor(this.totalNumberOfClouds * this.cloudDensity);
        
        while (currentInstanceIndex < actualCloudCount) {
            const meshIndex = currentInstanceIndex % this.numberOfCloudBaseShapes;
            const targetInstancedMesh = this.cloudInstancedMeshes[meshIndex];
            const indexInMesh = instanceCounters[meshIndex];
            
            if (indexInMesh < targetInstancedMesh.count) {
                // Paramètres aléatoires pour cette instance
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * spreadRadius;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const y = skyHeight + (Math.random() - 0.5) * 90;
                const randomYRotation = Math.random() * Math.PI * 2;
                
                // Échelle variable pour simuler différentes tailles de nuages
                const randomScale = THREE.MathUtils.randFloat(scaleMin, scaleMax);
                
                // Composer la matrice de transformation
                _tempPosition.set(x, y, z);
                _tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomYRotation);
                _tempScale.set(randomScale, randomScale, randomScale);
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                
                // Appliquer à l'instance
                targetInstancedMesh.setMatrixAt(indexInMesh, _tempMatrix);
                instanceCounters[meshIndex]++;
            }
            
            currentInstanceIndex++;
        }
        
        // Cacher les instances inutilisées en les déplaçant sous le monde
        for (let meshIndex = 0; meshIndex < this.cloudInstancedMeshes.length; meshIndex++) {
            const mesh = this.cloudInstancedMeshes[meshIndex];
            const usedInstances = instanceCounters[meshIndex];
            
            // Pour chaque instance inutilisée, placer une matrice "invisible"
            for (let i = usedInstances; i < mesh.count; i++) {
                _tempPosition.set(0, -1000, 0); // Loin sous le terrain
                _tempQuaternion.identity();
                _tempScale.set(0.001, 0.001, 0.001); // Très petit
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                mesh.setMatrixAt(i, _tempMatrix);
            }
        }
        
        // Mettre à jour les matrices
        this.cloudInstancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });
        
        // Mettre à jour l'opacité
        this.updateCloudOpacity();
    }
    
    /**
     * Met à jour l'opacité des nuages en fonction de la densité
     */
    updateCloudOpacity() {
        if (!this.cloudMaterial) return;
        
        // Ajuster l'opacité en fonction de la densité pour un effet plus réaliste
        // Rendons les nuages plus denses également plus sombres
        const baseOpacity = this.cloudOpacity;
        const densityFactor = 1.0 + (this.cloudDensity - 0.5) * 0.4; // 0.8 - 1.2 suivant densité
        
        this.cloudMaterial.opacity = baseOpacity * densityFactor;
        
        // Si très dense, assombrir légèrement la couleur
        if (this.cloudDensity > 0.7) {
            const darknessFactor = 1.0 - (this.cloudDensity - 0.7) * 0.5; // 1.0 -> 0.85
            this.cloudMaterial.color.setRGB(darknessFactor, darknessFactor, darknessFactor);
        } else {
            this.cloudMaterial.color.setRGB(1, 1, 1); // Blanc pur
        }
    }
    
    /**
     * Met à jour l'animation des nuages
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        // Vérifier si les matrices d'instances existent
        if (!this.cloudInstancedMeshes || this.cloudInstancedMeshes.length === 0) return;
        
        // Calculer la vitesse de déplacement, ajustée selon densité
        // Plus c'est dense, plus ça se déplace lentement
        const speedMultiplier = 1.0 - this.cloudDensity * 0.3; // 1.0 -> 0.7
        const actualCloudSpeed = this.cloudAnimationSpeed * deltaTime * speedMultiplier;
        
        // Obtenir la limite de disparition des nuages
        const limit = (this.weatherSystem.experience.world.cityManager.config.mapSize * 1.5) * 1.1;
        
        // Mettre à jour chaque mesh instancié
        this.cloudInstancedMeshes.forEach(instancedMesh => {
            let needsMatrixUpdate = false;
            
            // Mise à jour de chaque instance
            for (let i = 0; i < instancedMesh.count; i++) {
                instancedMesh.getMatrixAt(i, _tempMatrix);
                _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale);
                
                // Ignorer les instances "cachées" (sous le terrain)
                if (_tempPosition.y < -500) continue;
                
                // Déplacer le nuage (vitesse variable selon la taille)
                const speed = actualCloudSpeed * (1.0 + (_tempScale.x - 5.0) * 0.02);
                _tempPosition.x += speed;
                
                // Si le nuage sort des limites, le replacer de l'autre côté
                if (_tempPosition.x > limit) {
                    _tempPosition.x = -limit;
                    _tempPosition.z = (Math.random() - 0.5) * limit * 1.5;
                    _tempPosition.y = 230 + (Math.random() - 0.5) * 90;
                }
                
                // Recomposer la matrice
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                instancedMesh.setMatrixAt(i, _tempMatrix);
                needsMatrixUpdate = true;
            }
            
            // Mettre à jour la matrice si nécessaire
            if (needsMatrixUpdate) {
                instancedMesh.instanceMatrix.needsUpdate = true;
            }
        });
    }
    
    /**
     * Met à jour le système de nuages en fonction des changements de densité/opacité
     */
    updateCloudSystem() {
        // Mettre à jour le placement si la densité a changé de manière significative
        // (évite de recalculer pour de petits changements)
        this.placeClouds();
        
        // Mettre à jour l'opacité
        this.updateCloudOpacity();
    }
    
    /**
     * Définit la densité des nuages et mise à jour du système
     * @param {number} density - Densité des nuages (0-1)
     */
    set cloudDensity(density) {
        const oldDensity = this._cloudDensity;
        this._cloudDensity = THREE.MathUtils.clamp(density, 0, 1);
        
        // Mise à jour seulement si le changement est significatif
        if (Math.abs(oldDensity - this._cloudDensity) > 0.05) {
            this.updateCloudSystem();
        }
    }
    
    /**
     * Obtient la densité actuelle des nuages
     * @returns {number} Densité des nuages (0-1)
     */
    get cloudDensity() {
        return this._cloudDensity ?? 0.3;
    }
    
    /**
     * Définit l'opacité des nuages
     * @param {number} opacity - Opacité des nuages (0-1)
     */
    set cloudOpacity(opacity) {
        this._cloudOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
        this.updateCloudOpacity();
    }
    
    /**
     * Obtient l'opacité actuelle des nuages
     * @returns {number} Opacité des nuages (0-1)
     */
    get cloudOpacity() {
        return this._cloudOpacity ?? 0.5;
    }
    
    /**
     * Nettoie les ressources du système de nuages
     */
    destroy() {
        // Supprimer les meshes instanciés
        this.cloudInstancedMeshes.forEach(mesh => {
            this.cloudGroup.remove(mesh);
            mesh.dispose();
        });
        
        // Supprimer le groupe de la scène
        if (this.cloudGroup.parent) {
            this.cloudGroup.parent.remove(this.cloudGroup);
        }
        
        // Nettoyer les géométries
        this.cloudBaseGeometries.forEach(geom => {
            geom.dispose();
        });
        
        // Nettoyer le matériau
        if (this.cloudMaterial) {
            this.cloudMaterial.dispose();
        }
        
        // Réinitialiser les références
        this.cloudInstancedMeshes = [];
        this.cloudBaseGeometries = [];
        this.cloudMaterial = null;
        this.cloudGroup = null;
    }
} 