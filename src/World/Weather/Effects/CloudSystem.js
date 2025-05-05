/**
 * Système de nuages amélioré pour le système météorologique
 * Gère la densité, l'opacité et l'animation des nuages
 * Version optimisée pour une meilleure réactivité avec l'interface à curseurs
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
        this.numberOfCloudBaseShapes = 6; // Plus de formes de base pour plus de variété
        this.totalNumberOfClouds = 60;    // Plus de nuages pour une meilleure couverture
        this.cloudAnimationSpeed = 0.00005; // Vitesse de base de l'animation
        this.cloudOpacity = 0.5;         // Opacité initiale des nuages (0-1)
        this.cloudDensity = 0.5;         // Densité initiale des nuages (0-1)
        this.updateThreshold = 0.05;     // Seuil pour déclenchement d'une mise à jour complète
        this.lastDensity = this.cloudDensity; // Mémoriser la dernière densité appliquée
        this.pendingFullUpdate = false;   // Drapeau pour mise à jour complète différée
        this.lastFullUpdateTime = 0;      // Éviter les mises à jour trop fréquentes
        
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
            opacity: this.cloudOpacity,
            depthWrite: false, // Désactivé pour permettre de voir à travers les nuages transparents
            depthTest: true,
            alphaTest: 0.01,
            blending: THREE.NormalBlending
        });
        
        // Créer les formes de base des nuages
        for (let i = 0; i < this.numberOfCloudBaseShapes; i++) {
            this.cloudBaseGeometries.push(this.createLowPolyCloudGeometry());
        }
        
        // Créer les nuages instances
        this.createCloudInstances();
        
        // Ajouter le groupe de nuages à la scène
        this.scene.add(this.cloudGroup);
        
        console.log(`Système de nuages initialisé avec ${this.totalNumberOfClouds} nuages potentiels`);
    }
    
    /**
     * Crée une géométrie de nuage low-poly aléatoire
     * @returns {THREE.BufferGeometry} La géométrie du nuage
     */
    createLowPolyCloudGeometry() {
        const cloudPartGeometries = [];
        const baseGeometry = new THREE.IcosahedronGeometry(5, 0);

        // Plus de parties et de variété dans les nuages
        const numParts = THREE.MathUtils.randInt(7, 14);
        const maxOffset = 6;
        const minPartScale = 0.3;
        const maxPartScale = 0.8;

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
                mesh.dispose();
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
            
            // Initialiser toutes les instances sous le terrain
            for (let i = 0; i < instancesPerMesh; i++) {
                _tempPosition.set(0, -1000, 0);
                _tempQuaternion.identity();
                _tempScale.set(0.001, 0.001, 0.001);
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                instancedMesh.setMatrixAt(i, _tempMatrix);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            
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
        const mapSize = this.weatherSystem.experience.world.cityManager.config.mapSize;
        const spreadRadius = mapSize * 0.9; // Étendu légèrement
        const scaleMin = 0.8;
        const scaleMax = 15.0;
        
        // Compteurs pour chaque mesh instancié
        let currentInstanceIndex = 0;
        const instanceCounters = new Array(this.numberOfCloudBaseShapes).fill(0);
        
        // Déterminer combien de nuages placer en fonction de la densité
        const actualCloudCount = Math.floor(this.totalNumberOfClouds * this.cloudDensity);
        
        while (currentInstanceIndex < this.totalNumberOfClouds) {
            const meshIndex = currentInstanceIndex % this.numberOfCloudBaseShapes;
            const targetInstancedMesh = this.cloudInstancedMeshes[meshIndex];
            const indexInMesh = instanceCounters[meshIndex];
            
            if (indexInMesh < targetInstancedMesh.count) {
                // Déterminer si ce nuage doit être visible ou caché
                const isVisible = currentInstanceIndex < actualCloudCount;
                
                if (isVisible) {
                    // Paramètres aléatoires pour cette instance
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * spreadRadius;
                    const x = Math.cos(angle) * radius;
                    const z = Math.sin(angle) * radius;
                    const y = skyHeight + (Math.random() - 0.5) * 100; // Plus de variation en hauteur
                    const randomYRotation = Math.random() * Math.PI * 2;
                    
                    // Échelle variable selon la position (plus grands au centre)
                    const distanceFromCenter = Math.sqrt(x * x + z * z) / spreadRadius;
                    const sizeFactor = 1.0 - distanceFromCenter * 0.3; // Plus grand au centre
                    const finalScaleMax = scaleMax * sizeFactor;
                    const randomScale = THREE.MathUtils.randFloat(scaleMin, finalScaleMax);
                    
                    // Composer la matrice de transformation
                    _tempPosition.set(x, y, z);
                    _tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomYRotation);
                    _tempScale.set(randomScale, randomScale, randomScale);
                    _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                } else {
                    // Pour les nuages invisibles, les placer sous le terrain (hors vue)
                    _tempPosition.set(0, -1000, 0);
                    _tempQuaternion.identity();
                    _tempScale.set(0.001, 0.001, 0.001);
                    _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                }
                
                // Appliquer à l'instance
                targetInstancedMesh.setMatrixAt(indexInMesh, _tempMatrix);
                instanceCounters[meshIndex]++;
            }
            
            currentInstanceIndex++;
        }
        
        // Mettre à jour les matrices
        this.cloudInstancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });
        
        // Mettre à jour l'opacité
        this.updateCloudOpacity();
        
        // Mémoriser la densité qui vient d'être appliquée
        this.lastDensity = this.cloudDensity;
        this.lastFullUpdateTime = this.weatherSystem.time.elapsed;
        this.pendingFullUpdate = false;
    }
    
    /**
     * Met à jour l'opacité des nuages en fonction de la densité
     */
    updateCloudOpacity() {
        if (!this.cloudMaterial) return;
        
        // Ajuster l'opacité en fonction de la densité pour un effet plus réaliste
        const baseOpacity = this.cloudOpacity;
        const densityFactor = 1.0 + (this.cloudDensity - 0.5) * 0.4;
        
        this.cloudMaterial.opacity = baseOpacity * densityFactor;
        
        // Ajuster la couleur selon la densité
        if (this.cloudDensity > 0.7) {
            // Nuages denses = plus gris/sombres
            const darknessFactor = 1.0 - (this.cloudDensity - 0.7) * 0.5;
            this.cloudMaterial.color = new THREE.Color(darknessFactor, darknessFactor, darknessFactor);
        } else {
            // Nuages légers = plus blancs
            this.cloudMaterial.color = new THREE.Color(1, 1, 1);
        }
    }
    
    /**
     * Met à jour l'animation des nuages
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.cloudInstancedMeshes || this.cloudInstancedMeshes.length === 0) return;

        // Obtenir la position de la caméra
        const cameraPosition = this.weatherSystem.camera.instance.position;
        
        // Calculer la vitesse de déplacement
        const speed = this.cloudAnimationSpeed * deltaTime;
        
        // Mettre à jour chaque mesh instancié
        this.cloudInstancedMeshes.forEach(instancedMesh => {
            let needsMatrixUpdate = false;
            
            // Tableau pour stocker les distances et indices
            const distances = [];
            
            // Calculer les distances à la caméra pour chaque instance
            for (let i = 0; i < instancedMesh.count; i++) {
                instancedMesh.getMatrixAt(i, _tempMatrix);
                _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale);
                
                // Calculer la distance à la caméra
                const distance = _tempPosition.distanceTo(cameraPosition);
                distances.push({ index: i, distance: distance });
            }
            
            // Trier les instances par distance (du plus éloigné au plus proche)
            distances.sort((a, b) => b.distance - a.distance);
            
            // Mettre à jour les positions dans l'ordre trié
            distances.forEach(({ index }) => {
                instancedMesh.getMatrixAt(index, _tempMatrix);
                _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale);
                
                // Déplacer le nuage
                _tempPosition.x += speed;
                
                // Vérifier les limites et réinitialiser si nécessaire
                if (_tempPosition.x > 1000) {
                    _tempPosition.x = -1000;
                    _tempPosition.z = (Math.random() - 0.5) * 2000;
                }
                
                // Recomposer la matrice
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                instancedMesh.setMatrixAt(index, _tempMatrix);
                needsMatrixUpdate = true;
            });
            
            if (needsMatrixUpdate) {
                instancedMesh.instanceMatrix.needsUpdate = true;
            }
        });
    }
    
    /**
     * Met à jour le système de nuages en fonction des changements de densité/opacité
     * Cette méthode est appelée par les setters lorsque les propriétés changent
     */
    updateCloudSystem() {
        // Si le changement de densité est significatif, planifier une mise à jour complète
        const densityDifference = Math.abs(this.cloudDensity - this.lastDensity);
        
        if (densityDifference > this.updateThreshold) {
            // Marquer pour mise à jour complète (différée pour éviter trop de recalculs)
            this.pendingFullUpdate = true;
        } else {
            // Sinon, juste mettre à jour l'opacité
            this.updateCloudOpacity();
        }
    }
    
    /**
     * Définit la densité des nuages et mise à jour du système
     * @param {number} density - Densité des nuages (0-1)
     */
    set cloudDensity(density) {
        const oldDensity = this._cloudDensity;
        this._cloudDensity = THREE.MathUtils.clamp(density, 0, 1);
        
        if (oldDensity !== this._cloudDensity) {
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