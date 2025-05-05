/**
 * Système d'oiseaux pour l'environnement
 * Gère l'apparition, l'animation et le mouvement des oiseaux dans le ciel
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Objets temporaires pour l'update (performance)
const _tempMatrix = new THREE.Matrix4();
const _tempPosition = new THREE.Vector3();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();

export default class BirdSystem {
    /**
     * @param {Object} environmentSystem - Référence au système d'environnement principal
     */
    constructor(environmentSystem) {
        this.environmentSystem = environmentSystem;
        this.scene = environmentSystem.scene;
        this.environment = environmentSystem.environment;
        
        // Configuration
        this.totalNumberOfBirds = 80;    // Nombre maximum d'oiseaux
        this.birdAnimationSpeed = 0.0003; // Vitesse de base de l'animation
        this.birdDensity = 0.5;          // Densité initiale des oiseaux (0-1)
        this.updateThreshold = 0.05;     // Seuil pour déclenchement d'une mise à jour complète
        this.lastDensity = this.birdDensity; // Mémoriser la dernière densité appliquée
        this.pendingFullUpdate = false;   // Drapeau pour mise à jour complète différée
        this.lastFullUpdateTime = 0;      // Éviter les mises à jour trop fréquentes
        this.wingFlapSpeed = 0.02;        // Vitesse de battement des ailes
        this.wingRotationMax = 0.4;       // Rotation maximale des ailes (en radians)
        this.bobAmplitude = 0.2;          // Amplitude du mouvement de rebond
        this.bobFrequency = 0.005;        // Fréquence du mouvement de rebond
        this.currentWingRotation = 0;     // Rotation actuelle des ailes
        this.wingDirection = 1;           // Direction du battement des ailes
        
        // Groupes et références
        this.birdGroup = new THREE.Group();
        this.birdGroup.name = "EnvironmentBirdSystem";
        this.birdMaterial = null;
        this.birdInstancedMeshes = {
            body: null,
            leftWing: null,
            rightWing: null
        };
        
        // Initialisation
        this.initialize();
    }
    
    /**
     * Initialise le système d'oiseaux
     */
    initialize() {
        // Créer le matériau des oiseaux
        this.birdMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.7,
            metalness: 0.2,
            flatShading: true
        });
        
        // Créer les géométries des oiseaux
        const bodyGeometry = this.createBirdBodyGeometry();
        const wingGeometry = this.createBirdWingGeometry();
        
        // Créer les meshes instanciés
        this.birdInstancedMeshes.body = new THREE.InstancedMesh(
            bodyGeometry,
            this.birdMaterial,
            this.totalNumberOfBirds
        );
        
        this.birdInstancedMeshes.leftWing = new THREE.InstancedMesh(
            wingGeometry,
            this.birdMaterial,
            this.totalNumberOfBirds
        );
        
        this.birdInstancedMeshes.rightWing = new THREE.InstancedMesh(
            wingGeometry.clone(),
            this.birdMaterial,
            this.totalNumberOfBirds
        );
        
        // Initialiser toutes les instances sous le terrain
        for (let i = 0; i < this.totalNumberOfBirds; i++) {
            _tempPosition.set(0, -1000, 0);
            _tempQuaternion.identity();
            _tempScale.set(0.001, 0.001, 0.001);
            _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
            
            this.birdInstancedMeshes.body.setMatrixAt(i, _tempMatrix);
            this.birdInstancedMeshes.leftWing.setMatrixAt(i, _tempMatrix);
            this.birdInstancedMeshes.rightWing.setMatrixAt(i, _tempMatrix);
        }
        
        // Mettre à jour les matrices
        this.birdInstancedMeshes.body.instanceMatrix.needsUpdate = true;
        this.birdInstancedMeshes.leftWing.instanceMatrix.needsUpdate = true;
        this.birdInstancedMeshes.rightWing.instanceMatrix.needsUpdate = true;
        
        // Ajouter les meshes au groupe d'oiseaux
        this.birdGroup.add(this.birdInstancedMeshes.body);
        this.birdGroup.add(this.birdInstancedMeshes.leftWing);
        this.birdGroup.add(this.birdInstancedMeshes.rightWing);
        
        // Ajouter le groupe à la scène
        this.scene.add(this.birdGroup);
        
        // Placer les oiseaux
        this.placeBirds();
        
        console.log(`Système d'oiseaux initialisé avec ${this.totalNumberOfBirds} oiseaux potentiels`);
    }
    
    /**
     * Crée une géométrie simple de corps d'oiseau (cube légèrement modifié)
     * @returns {THREE.BufferGeometry} La géométrie du corps d'oiseau
     */
    createBirdBodyGeometry() {
        const bodyGeometry = new THREE.BoxGeometry(1, 0.7, 1.5);
        
        // Modifier légèrement la géométrie pour donner une forme d'oiseau
        const positions = bodyGeometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            // Affiner l'avant du corps (tête)
            if (positions[i + 2] > 0) {
                positions[i] *= 0.7; // Rétrécir en largeur
                positions[i + 1] *= 0.8; // Rétrécir en hauteur
            }
        }
        
        bodyGeometry.computeVertexNormals();
        return bodyGeometry;
    }
    
    /**
     * Crée une géométrie simple d'aile d'oiseau
     * @returns {THREE.BufferGeometry} La géométrie de l'aile d'oiseau
     */
    createBirdWingGeometry() {
        // Créer une aile simple à partir d'un plan
        const wingGeometry = new THREE.PlaneGeometry(1.5, 1, 2, 1);
        
        // Positionner l'aile sur le côté du corps
        const positions = wingGeometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            // Déplacer le point de pivot de l'aile vers le corps
            positions[i] += 0.7;
            
            // Donner une forme plus naturelle à l'aile
            const distFromPivot = Math.abs(positions[i] - 0.7);
            positions[i + 1] -= distFromPivot * 0.2;
        }
        
        wingGeometry.computeVertexNormals();
        return wingGeometry;
    }
    
    /**
     * Place les oiseaux dans le ciel en fonction de la densité
     */
    placeBirds() {
        // Configuration du placement
        const skyHeight = 200;
        const heightVariation = 80;
        const mapSize = this.environmentSystem.experience.world.cityManager.config.mapSize;
        const spreadRadius = mapSize * 0.8;
        const scaleMin = 0.7;
        const scaleMax = 1.5;
        
        // Déterminer combien d'oiseaux placer en fonction de la densité
        const actualBirdCount = Math.floor(this.totalNumberOfBirds * this.birdDensity);
        
        // Générer des positions et rotations aléatoires pour chaque oiseau
        for (let i = 0; i < this.totalNumberOfBirds; i++) {
            // Déterminer si cet oiseau doit être visible ou caché
            const isVisible = i < actualBirdCount;
            
            if (isVisible) {
                // Paramètres aléatoires pour cet oiseau
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * spreadRadius;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const y = skyHeight + (Math.random() - 0.5) * heightVariation;
                
                // Direction de vol (angle aléatoire)
                const flightAngle = Math.random() * Math.PI * 2;
                const flightDirection = new THREE.Vector3(
                    Math.cos(flightAngle),
                    0,
                    Math.sin(flightAngle)
                ).normalize();
                
                // Créer une rotation pour que l'oiseau regarde dans la direction de vol
                const birdRotation = new THREE.Quaternion();
                const upVector = new THREE.Vector3(0, 1, 0);
                const rotationAxis = new THREE.Vector3().crossVectors(upVector, flightDirection).normalize();
                const rotationAngle = Math.acos(upVector.dot(flightDirection));
                birdRotation.setFromAxisAngle(rotationAxis, rotationAngle);
                
                // Rotation supplémentaire pour orienter l'oiseau horizontalement
                const horizontalRotation = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    flightAngle + Math.PI / 2
                );
                birdRotation.multiply(horizontalRotation);
                
                // Taille aléatoire
                const randomScale = THREE.MathUtils.randFloat(scaleMin, scaleMax);
                const scaleVector = new THREE.Vector3(randomScale, randomScale, randomScale);
                
                // Appliquer au corps
                _tempPosition.set(x, y, z);
                _tempQuaternion.copy(birdRotation);
                _tempScale.copy(scaleVector);
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                this.birdInstancedMeshes.body.setMatrixAt(i, _tempMatrix);
                
                // Positionner l'aile gauche
                _tempPosition.set(x, y, z);
                _tempQuaternion.copy(birdRotation);
                _tempScale.copy(scaleVector);
                // Décaler l'aile sur la gauche du corps et appliquer une rotation initiale
                const leftWingMatrix = new THREE.Matrix4()
                    .makeTranslation(-0.7, 0, 0)
                    .multiply(new THREE.Matrix4().makeRotationZ(0))
                    .premultiply(_tempMatrix);
                this.birdInstancedMeshes.leftWing.setMatrixAt(i, leftWingMatrix);
                
                // Positionner l'aile droite (miroir de la gauche)
                _tempPosition.set(x, y, z);
                _tempQuaternion.copy(birdRotation);
                _tempScale.copy(scaleVector);
                // Décaler l'aile sur la droite du corps et appliquer une rotation initiale
                const rightWingMatrix = new THREE.Matrix4()
                    .makeTranslation(0.7, 0, 0)
                    .multiply(new THREE.Matrix4().makeRotationZ(0))
                    .multiply(new THREE.Matrix4().makeScale(-1, 1, 1)) // Inverser en X pour le miroir
                    .premultiply(_tempMatrix);
                this.birdInstancedMeshes.rightWing.setMatrixAt(i, rightWingMatrix);
            } else {
                // Pour les oiseaux invisibles, les placer sous le terrain
                _tempPosition.set(0, -1000, 0);
                _tempQuaternion.identity();
                _tempScale.set(0.001, 0.001, 0.001);
                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                
                this.birdInstancedMeshes.body.setMatrixAt(i, _tempMatrix);
                this.birdInstancedMeshes.leftWing.setMatrixAt(i, _tempMatrix);
                this.birdInstancedMeshes.rightWing.setMatrixAt(i, _tempMatrix);
            }
        }
        
        // Mettre à jour les matrices
        this.birdInstancedMeshes.body.instanceMatrix.needsUpdate = true;
        this.birdInstancedMeshes.leftWing.instanceMatrix.needsUpdate = true;
        this.birdInstancedMeshes.rightWing.instanceMatrix.needsUpdate = true;
        
        // Mémoriser la densité qui vient d'être appliquée
        this.lastDensity = this.birdDensity;
        this.lastFullUpdateTime = this.environmentSystem.experience.time.elapsed;
        this.pendingFullUpdate = false;
    }
    
    /**
     * Met à jour le système d'oiseaux
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        // Vérifier si on doit effectuer une mise à jour complète du placement
        if (this.pendingFullUpdate) {
            const currentTime = this.environmentSystem.experience.time.elapsed;
            // Éviter les mises à jour trop fréquentes (max 1x par seconde)
            if (currentTime - this.lastFullUpdateTime > 1000) {
                this.placeBirds();
            }
        }
        
        // Si pas de meshes, rien à faire
        if (!this.birdInstancedMeshes.body) return;
        
        // Calculer la rotation des ailes pour ce frame
        this.currentWingRotation += this.wingFlapSpeed * deltaTime * this.wingDirection;
        if (Math.abs(this.currentWingRotation) > this.wingRotationMax) {
            this.wingDirection *= -1; // Inverser la direction
        }
        
        // Calculer les limites de la zone de vol
        const mapSize = this.environmentSystem.experience.world.cityManager.config.mapSize;
        const limit = mapSize * 1.5 * 1.1;
        const skyHeight = 200;
        const heightVariation = 80;
        
        // Obtenir le nombre actuel d'oiseaux visibles
        const actualBirdCount = Math.floor(this.totalNumberOfBirds * this.birdDensity);
        
        // Matrice temporaire pour décomposer/recomposer
        let needsMatrixUpdate = false;
        
        // Mettre à jour chaque oiseau
        for (let i = 0; i < this.totalNumberOfBirds; i++) {
            // Ignorer les oiseaux hors densité actuelle
            if (i >= actualBirdCount) {
                continue;
            }
            
            // Récupérer la matrice du corps
            this.birdInstancedMeshes.body.getMatrixAt(i, _tempMatrix);
            _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale);
            
            // Ignorer les oiseaux "cachés" (sous le terrain)
            if (_tempPosition.y < -500) {
                continue;
            }
            
            // Calculer l'angle de vol actuel (direction de l'oiseau)
            const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(_tempQuaternion).normalize();
            
            // Vitesse adaptée à la taille de l'oiseau
            const speed = this.birdAnimationSpeed * deltaTime * (1.0 + _tempScale.x * 0.5);
            
            // Déplacer l'oiseau dans sa direction
            _tempPosition.add(direction.multiplyScalar(speed));
            
            // Ajouter un effet de rebond pour plus de naturel
            const bobOffset = Math.sin(this.environmentSystem.experience.time.elapsed * this.bobFrequency + i) * this.bobAmplitude;
            _tempPosition.y += bobOffset * deltaTime * 0.01;
            
            // Si l'oiseau sort des limites, le replacer de l'autre côté
            if (_tempPosition.x > limit || _tempPosition.x < -limit || 
                _tempPosition.z > limit || _tempPosition.z < -limit) {
                
                // Paramètres aléatoires pour repositionner l'oiseau
                const angle = Math.random() * Math.PI * 2;
                const radius = mapSize * 0.8 * Math.random();
                _tempPosition.x = Math.cos(angle) * radius;
                _tempPosition.z = Math.sin(angle) * radius;
                _tempPosition.y = skyHeight + (Math.random() - 0.5) * heightVariation;
                
                // Nouvelle direction de vol
                const flightAngle = Math.random() * Math.PI * 2;
                const flightDirection = new THREE.Vector3(
                    Math.cos(flightAngle),
                    0,
                    Math.sin(flightAngle)
                ).normalize();
                
                // Créer une rotation pour que l'oiseau regarde dans la direction de vol
                const upVector = new THREE.Vector3(0, 1, 0);
                const rotationAxis = new THREE.Vector3().crossVectors(upVector, flightDirection).normalize();
                const rotationAngle = Math.acos(upVector.dot(flightDirection));
                _tempQuaternion.setFromAxisAngle(rotationAxis, rotationAngle);
                
                // Rotation supplémentaire pour orienter l'oiseau horizontalement
                const horizontalRotation = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    flightAngle + Math.PI / 2
                );
                _tempQuaternion.multiply(horizontalRotation);
            }
            
            // Recomposer et appliquer la matrice pour le corps
            _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
            this.birdInstancedMeshes.body.setMatrixAt(i, _tempMatrix);
            needsMatrixUpdate = true;
            
            // Mettre à jour les ailes avec battement
            
            // Aile gauche
            const leftWingMatrix = new THREE.Matrix4()
                .makeTranslation(-0.7, 0, 0)
                .multiply(new THREE.Matrix4().makeRotationZ(this.currentWingRotation))
                .premultiply(_tempMatrix);
            this.birdInstancedMeshes.leftWing.setMatrixAt(i, leftWingMatrix);
            
            // Aile droite (miroir)
            const rightWingMatrix = new THREE.Matrix4()
                .makeTranslation(0.7, 0, 0)
                .multiply(new THREE.Matrix4().makeRotationZ(-this.currentWingRotation))
                .multiply(new THREE.Matrix4().makeScale(-1, 1, 1)) // Inverser en X pour le miroir
                .premultiply(_tempMatrix);
            this.birdInstancedMeshes.rightWing.setMatrixAt(i, rightWingMatrix);
        }
        
        // Mettre à jour les matrices si nécessaire
        if (needsMatrixUpdate) {
            this.birdInstancedMeshes.body.instanceMatrix.needsUpdate = true;
            this.birdInstancedMeshes.leftWing.instanceMatrix.needsUpdate = true;
            this.birdInstancedMeshes.rightWing.instanceMatrix.needsUpdate = true;
        }
    }
    
    /**
     * Met à jour le système d'oiseaux en fonction des changements de densité
     * Cette méthode est appelée par le setter lorsque la densité change
     */
    updateBirdSystem() {
        // Si le changement de densité est significatif, planifier une mise à jour complète
        const densityDifference = Math.abs(this.birdDensity - this.lastDensity);
        
        if (densityDifference > this.updateThreshold) {
            // Marquer pour mise à jour complète (différée pour éviter trop de recalculs)
            this.pendingFullUpdate = true;
        }
    }
    
    /**
     * Définit la densité des oiseaux et lance une mise à jour du système
     * @param {number} density - Densité des oiseaux (0-1)
     */
    set birdDensity(density) {
        const oldDensity = this._birdDensity;
        this._birdDensity = THREE.MathUtils.clamp(density, 0, 1);
        
        if (oldDensity !== this._birdDensity) {
            this.updateBirdSystem();
        }
    }
    
    /**
     * Obtient la densité actuelle des oiseaux
     * @returns {number} Densité des oiseaux (0-1)
     */
    get birdDensity() {
        return this._birdDensity ?? 0.5;
    }
    
    /**
     * Nettoie les ressources du système d'oiseaux
     */
    destroy() {
        // Supprimer les meshes instanciés
        if (this.birdInstancedMeshes.body) {
            this.birdGroup.remove(this.birdInstancedMeshes.body);
            this.birdInstancedMeshes.body.dispose();
        }
        
        if (this.birdInstancedMeshes.leftWing) {
            this.birdGroup.remove(this.birdInstancedMeshes.leftWing);
            this.birdInstancedMeshes.leftWing.dispose();
        }
        
        if (this.birdInstancedMeshes.rightWing) {
            this.birdGroup.remove(this.birdInstancedMeshes.rightWing);
            this.birdInstancedMeshes.rightWing.dispose();
        }
        
        // Supprimer le groupe de la scène
        if (this.birdGroup.parent) {
            this.birdGroup.parent.remove(this.birdGroup);
        }
        
        // Nettoyer le matériau
        if (this.birdMaterial) {
            this.birdMaterial.dispose();
        }
        
        // Réinitialiser les références
        this.birdInstancedMeshes = {
            body: null,
            leftWing: null,
            rightWing: null
        };
        this.birdMaterial = null;
        this.birdGroup = null;
    }
} 