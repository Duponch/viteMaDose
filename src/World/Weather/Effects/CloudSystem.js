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
        this.numberOfCloudBaseShapes = 6;
        this.totalNumberOfClouds = 200;
        this.cloudAnimationSpeed = 0.004;
        this._cloudOpacity = 0.5; // Opacité de base des nuages
        this._cloudDensity = 0.5; // Densité (nombre) de nuages
        this._cloudColor = new THREE.Color(0xffffff); // Couleur de base des nuages
        this.updateThreshold = 0.01;
        this.lastDensity = this._cloudDensity;
        this.pendingFullUpdate = false;
        this.lastFullUpdateTime = 0;
        this.updateDebounceTime = 100;
        this.lastUpdateTime = 0;
        
        // Configuration de la zone de couverture
        this.mapSize = this.weatherSystem.experience.world.cityManager.config.mapSize;
        this.cloudCoverageWidth = this.mapSize * 2; // Largeur de la zone de couverture
        this.cloudCoverageHeight = 100; // Hauteur de la zone de couverture
        
        // Groupes et références
        this.cloudGroup = new THREE.Group();
        this.cloudGroup.name = "WeatherCloudSystem";
        this.cloudMaterial = null;
        this.cloudBaseGeometries = [];
        this.cloudInstancedMeshes = [];
        this.activeClouds = new Set();
        
        // Initialisation
        this.initialize();
    }
    
    /**
     * Initialise le système de nuages
     */
    initialize() {
        // Créer le matériau des nuages
        this.cloudMaterial = new THREE.MeshStandardMaterial({
            color: this.weatherSystem.cloudColor,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true,
            transparent: true,
            opacity: this._cloudOpacity,
            depthWrite: true,
            depthTest: true,
            alphaTest: 0.1,
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
            instancedMesh.renderOrder = 1; // Nuages rendus après les oiseaux (renderOrder = 0)
            
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
        const spreadRadius = this.cloudCoverageWidth / 2;
        const scaleMin = 0.8;
        const scaleMax = 15.0;
        
        // Calculer le nombre de nuages à placer
        const actualCloudCount = Math.floor(this.totalNumberOfClouds * this._cloudDensity);
        
        // Réinitialiser les nuages actifs
        this.activeClouds.clear();
        
        // Placer les nuages
        let currentInstanceIndex = 0;
        const instanceCounters = new Array(this.numberOfCloudBaseShapes).fill(0);
        
        // Calculer la distribution des nuages
        const cloudSpacing = this.cloudCoverageWidth / actualCloudCount;
        let currentX = -this.cloudCoverageWidth / 2;
        
        while (currentInstanceIndex < this.totalNumberOfClouds) {
            const meshIndex = currentInstanceIndex % this.numberOfCloudBaseShapes;
            const targetInstancedMesh = this.cloudInstancedMeshes[meshIndex];
            const indexInMesh = instanceCounters[meshIndex];
            
            if (indexInMesh < targetInstancedMesh.count) {
                const isVisible = currentInstanceIndex < actualCloudCount;
                
                if (isVisible) {
                    // Position avec espacement uniforme
                    const x = currentX;
                    const z = (Math.random() - 0.5) * this.cloudCoverageWidth;
                    const y = skyHeight + (Math.random() - 0.5) * this.cloudCoverageHeight;
                    const randomYRotation = Math.random() * Math.PI * 2;
                    
                    // Échelle variable selon la position
                    const distanceFromCenter = Math.sqrt(x * x + z * z) / spreadRadius;
                    const sizeFactor = 1.0 - distanceFromCenter * 0.3;
                    const finalScaleMax = scaleMax * sizeFactor;
                    const randomScale = THREE.MathUtils.randFloat(scaleMin, finalScaleMax);
                    
                    // Composer la matrice de transformation
                    _tempPosition.set(x, y, z);
                    _tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomYRotation);
                    _tempScale.set(randomScale, randomScale, randomScale);
                    _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                    
                    // Ajouter aux nuages actifs
                    this.activeClouds.add(currentInstanceIndex);
                    
                    // Avancer pour le prochain nuage
                    currentX += cloudSpacing;
                } else {
                    // Placer les nuages invisibles sous le terrain
                    _tempPosition.set(0, -1000, 0);
                    _tempQuaternion.identity();
                    _tempScale.set(0.001, 0.001, 0.001);
                    _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                }
                
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
        this.lastDensity = this._cloudDensity;
        this.lastFullUpdateTime = this.weatherSystem.time.elapsed;
        this.pendingFullUpdate = false;
    }
    
    /**
     * Met à jour l'opacité des nuages en fonction de la densité
     */
    updateCloudOpacity() {
        if (!this.cloudMaterial) return;
        
        // Ajuster l'opacité en fonction de la densité pour un effet plus réaliste
        const baseOpacity = this._cloudOpacity;
        const densityFactor = 1.0 + (this._cloudDensity - 0.5) * 0.4;
        
        const finalOpacity = baseOpacity * densityFactor;
        this.cloudMaterial.opacity = finalOpacity;
        
        // IMPORTANT: Gérer dynamiquement les paramètres de rendu en fonction de l'opacité
        // - Pour les nuages très opaques (>0.85), activer l'écriture de profondeur pour masquer les objets derrière
        // - Pour les nuages semi-transparents, désactiver l'écriture de profondeur pour voir à travers
        this.cloudMaterial.depthWrite = finalOpacity > 0.85;
        
        // Ajuster l'alphaTest en fonction de l'opacité - cela permet d'avoir des bords plus nets
        // quand l'opacité est élevée, et des bords plus doux quand l'opacité est basse
        this.cloudMaterial.alphaTest = 0.05 + (finalOpacity > 0.85 ? 0.05 : 0);
        
        // Définir le mode de mélange en fonction de l'opacité
        if (finalOpacity > 0.9) {
            // Pour les nuages très denses, utiliser un mélange standard
            this.cloudMaterial.blending = THREE.NormalBlending;
        } else {
            // Pour les nuages légers, utiliser un mélange additif pour un effet plus aérien
            this.cloudMaterial.blending = THREE.NormalBlending;
        }
        
        // Remarque: Nous ne modifions plus la couleur ici
        // car elle est maintenant controlée par le curseur de couleur
        // Cette section a été retirée pour permettre au curseur de couleur de fonctionner correctement
    }
    
    /**
     * Met à jour la couleur des nuages
     */
    updateCloudColor() {
        if (this.cloudMaterial) {
            // Utiliser la couleur interne stockée dans this._cloudColor
            this.cloudMaterial.color.copy(this._cloudColor);
        }
    }
    
    /**
     * Met à jour l'animation des nuages
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.cloudInstancedMeshes || this.cloudInstancedMeshes.length === 0) return;

        // Vérifier si une mise à jour complète est nécessaire
        if (this.pendingFullUpdate) {
            this.updateCloudSystem();
        }

        // Calculer la vitesse de déplacement
        const speed = this.cloudAnimationSpeed * deltaTime;
        
        // Mettre à jour chaque mesh instancié
        this.cloudInstancedMeshes.forEach(instancedMesh => {
            let needsMatrixUpdate = false;
            
            // Utiliser uniquement les nuages actifs pour l'animation
            for (const index of this.activeClouds) {
                if (index >= instancedMesh.count) continue;
                
                instancedMesh.getMatrixAt(index, _tempMatrix);
                _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale);
                
                // Déplacer le nuage
                _tempPosition.x += speed;
                
                // Vérifier les limites et réinitialiser si nécessaire
                if (_tempPosition.x > this.cloudCoverageWidth / 2) {
                    _tempPosition.x = -this.cloudCoverageWidth / 2;
                    _tempPosition.z = (Math.random() - 0.5) * this.cloudCoverageWidth;
                }
                
                // Recomposer la matrice
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                instancedMesh.setMatrixAt(index, _tempMatrix);
                needsMatrixUpdate = true;
            }
            
            if (needsMatrixUpdate) {
                instancedMesh.instanceMatrix.needsUpdate = true;
            }
        });

        // Mettre à jour la couleur des nuages
        this.updateCloudColor();
        
        // Mettre à jour l'opacité des nuages
        this.updateCloudOpacity();
    }
    
    /**
     * Met à jour le système de nuages en fonction des changements de densité/opacité
     * Cette méthode est appelée par les setters lorsque les propriétés changent
     */
    updateCloudSystem() {
        const currentTime = performance.now();
        
        // Vérifier si on doit attendre avant la prochaine mise à jour
        if (currentTime - this.lastUpdateTime < this.updateDebounceTime) {
            this.pendingFullUpdate = true;
            return;
        }
        
        this.lastUpdateTime = currentTime;
        this.pendingFullUpdate = false;
        
        // Calculer le nombre de nuages à afficher
        const targetCount = Math.floor(this.totalNumberOfClouds * this._cloudDensity);
        
        // Mettre à jour les nuages existants
        this.cloudInstancedMeshes.forEach(mesh => {
            const count = mesh.count;
            const visibleCount = Math.min(count, targetCount);
            
            // Mettre à jour la visibilité des instances
            for (let i = 0; i < count; i++) {
                const visible = i < visibleCount;
                if (visible) {
                    this.activeClouds.add(i);
                } else {
                    this.activeClouds.delete(i);
                }
            }
        });
    }
    
    /**
     * Définit la densité des nuages et mise à jour du système
     * @param {number} density - Densité des nuages (0-1)
     */
    set cloudDensity(density) {
        if (density < 0) density = 0;
        if (density > 1) density = 1;
        
        this._cloudDensity = density;
        
        // Déclencher une mise à jour complète du système
        this.placeClouds();
    }
    
    /**
     * Obtient la densité actuelle des nuages
     * @returns {number} Densité des nuages (0-1)
     */
    get cloudDensity() {
        return this._cloudDensity;
    }
    
    /**
     * Définit l'opacité des nuages
     * @param {number} opacity - Opacité des nuages (0-1)
     */
    set cloudOpacity(opacity) {
        if (opacity < 0) opacity = 0;
        if (opacity > 1) opacity = 1;
        
        this._cloudOpacity = opacity;
        
        // Mettre à jour l'opacité du matériau
        if (this.cloudMaterial) {
            this.cloudMaterial.opacity = opacity;
            
            // Ajuster les paramètres de rendu en fonction de l'opacité
            if (opacity > 0.9) {
                // Pour les nuages très opaques
                this.cloudMaterial.depthWrite = true;
                this.cloudMaterial.alphaTest = 0.1;
                this.cloudMaterial.blending = THREE.NormalBlending;
            } else if (opacity > 0.5) {
                // Pour les nuages semi-opaques
                this.cloudMaterial.depthWrite = true;
                this.cloudMaterial.alphaTest = 0.05;
                this.cloudMaterial.blending = THREE.NormalBlending;
            } else {
                // Pour les nuages très transparents
                this.cloudMaterial.depthWrite = false;
                this.cloudMaterial.alphaTest = 0.01;
                this.cloudMaterial.blending = THREE.NormalBlending;
            }
        }
    }
    
    /**
     * Obtient l'opacité actuelle des nuages
     * @returns {number} Opacité des nuages (0-1)
     */
    get cloudOpacity() {
        return this._cloudOpacity;
    }
    
    /**
     * Définit la couleur des nuages
     * @param {THREE.Color} color - La nouvelle couleur des nuages
     */
    set cloudColor(color) {
        this._cloudColor.copy(color);
        if (this.cloudMaterial) {
            this.cloudMaterial.color.copy(color);
        }
    }

    /**
     * Obtient la couleur actuelle des nuages
     * @returns {THREE.Color} La couleur des nuages
     */
    get cloudColor() {
        return this._cloudColor;
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