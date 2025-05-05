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
        this.birdAnimationSpeed = 0.07;  // Vitesse de base de l'animation (augmentée)
        this.birdDensity = 0.5;          // Densité initiale des oiseaux (0-1)
        this.updateThreshold = 0.05;     // Seuil pour déclenchement d'une mise à jour complète
        this.lastDensity = this.birdDensity; // Mémoriser la dernière densité appliquée
        this.pendingFullUpdate = false;   // Drapeau pour mise à jour complète différée
        this.lastFullUpdateTime = 0;      // Éviter les mises à jour trop fréquentes
        this.wingFlapSpeed = 0.02;        // Vitesse de battement des ailes
        this.wingRotationMax = 0.4;       // Rotation maximale des ailes (en radians)
        this.bobAmplitude = 7;          // Amplitude du mouvement de rebond
        this.bobFrequency = 0.001;        // Fréquence du mouvement de rebond
        this.currentWingRotation = 0;     // Rotation actuelle des ailes
        this.wingDirection = 1;           // Direction du battement des ailes
        
        // Nouveaux paramètres pour le mouvement directionnel et le comportement de groupe
        this.globalDirection = new THREE.Vector3(1, 0, 0); // Direction générale de vol
        this.directionChangeInterval = 5000; // Changement de direction toutes les 10 secondes
        this.lastDirectionChange = 0;
        this.directionVariation = 0.1; // Variation maximale autour de la direction globale
        this.groupInfluenceRadius = 30; // Rayon d'influence pour le comportement de groupe
        this.groupAlignmentFactor = 0.1; // Force d'alignement avec les voisins
        this.groupCohesionFactor = 0.05; // Force de cohésion avec les voisins
        this.groupSeparationFactor = 0.2; // Force de séparation avec les voisins
        
        // Nouveaux paramètres de vitesse
        this.speedVariation = 0.3;        // Variation de vitesse (0-1)
        this.speedChangeInterval = 2000;  // Intervalle de changement de vitesse (ms)
        this.lastSpeedChange = 0;         // Dernier changement de vitesse
        this.baseSpeed = this.birdAnimationSpeed; // Vitesse de base
        
        // Pool d'oiseaux actifs
        this.activeBirds = [];
        this.birdStates = new Array(this.totalNumberOfBirds).fill(null).map(() => ({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            targetDirection: new THREE.Vector3(),
            currentSpeed: this.baseSpeed,
            targetSpeed: this.baseSpeed,
            isActive: false,
            spawnTime: 0,
            lifeTime: 0
        }));
        
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
            const birdState = this.birdStates[i];
            const isVisible = i < actualBirdCount;
            
            if (isVisible) {
                // Paramètres aléatoires pour cet oiseau
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * spreadRadius;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const y = skyHeight + (Math.random() - 0.5) * heightVariation;
                
                // Initialiser l'état de l'oiseau
                birdState.position.set(x, y, z);
                birdState.velocity.copy(this.globalDirection).normalize()
                    .multiplyScalar(this.birdAnimationSpeed);
                birdState.targetDirection.copy(birdState.velocity);
                birdState.isActive = true;
                
                // Taille aléatoire
                const randomScale = THREE.MathUtils.randFloat(scaleMin, scaleMax);
                _tempScale.set(randomScale, randomScale, randomScale);
                
                // Créer une rotation pour que l'oiseau regarde dans la direction de vol
                const birdRotation = new THREE.Quaternion();
                const upVector = new THREE.Vector3(0, 1, 0);
                const rotationAxis = new THREE.Vector3().crossVectors(upVector, birdState.velocity).normalize();
                const rotationAngle = Math.acos(upVector.dot(birdState.velocity));
                birdRotation.setFromAxisAngle(rotationAxis, rotationAngle);
                
                // Rotation supplémentaire pour orienter l'oiseau horizontalement
                const horizontalRotation = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    Math.atan2(birdState.velocity.x, birdState.velocity.z) + Math.PI / 2
                );
                birdRotation.multiply(horizontalRotation);
                
                // Appliquer au corps
                _tempMatrix.compose(birdState.position, birdRotation, _tempScale);
                this.birdInstancedMeshes.body.setMatrixAt(i, _tempMatrix);
                
                // Positionner l'aile gauche
                const leftWingMatrix = new THREE.Matrix4()
                    .makeTranslation(-0.7, 0, 0)
                    .multiply(new THREE.Matrix4().makeRotationZ(0))
                    .premultiply(_tempMatrix);
                this.birdInstancedMeshes.leftWing.setMatrixAt(i, leftWingMatrix);
                
                // Positionner l'aile droite (miroir de la gauche)
                const rightWingMatrix = new THREE.Matrix4()
                    .makeTranslation(0.7, 0, 0)
                    .multiply(new THREE.Matrix4().makeRotationZ(0))
                    .multiply(new THREE.Matrix4().makeScale(-1, 1, 1))
                    .premultiply(_tempMatrix);
                this.birdInstancedMeshes.rightWing.setMatrixAt(i, rightWingMatrix);
            } else {
                // Désactiver les oiseaux non visibles
                birdState.isActive = false;
                
                // Les placer sous le terrain
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
            if (currentTime - this.lastFullUpdateTime > 1000) {
                this.placeBirds();
            }
        }
        
        // Mettre à jour la direction globale périodiquement
        const currentTime = this.environmentSystem.experience.time.elapsed;
        if (currentTime - this.lastDirectionChange > this.directionChangeInterval) {
            this.updateGlobalDirection();
            this.lastDirectionChange = currentTime;
        }
        
        // Mettre à jour les vitesses périodiquement
        if (currentTime - this.lastSpeedChange > this.speedChangeInterval) {
            this.updateBirdSpeeds();
            this.lastSpeedChange = currentTime;
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
        
        // Mettre à jour chaque oiseau
        for (let i = 0; i < this.totalNumberOfBirds; i++) {
            const birdState = this.birdStates[i];
            
            // Ignorer les oiseaux inactifs
            if (!birdState.isActive) continue;
            
            // Mettre à jour la direction cible en fonction du comportement de groupe
            this.updateBirdDirection(i, actualBirdCount);
            
            // Mettre à jour la vitesse actuelle vers la vitesse cible
            birdState.currentSpeed = THREE.MathUtils.lerp(
                birdState.currentSpeed,
                birdState.targetSpeed,
                0.01
            );
            
            // Mettre à jour la vitesse et la position
            const speed = birdState.currentSpeed * deltaTime;
            birdState.velocity.lerp(birdState.targetDirection, 0.1).normalize().multiplyScalar(speed);
            birdState.position.add(birdState.velocity);
            
            // Ajouter un effet de rebond pour plus de naturel
            const bobOffset = Math.sin(currentTime * this.bobFrequency + i) * this.bobAmplitude;
            birdState.position.y += bobOffset * deltaTime * 0.01;
            
            // Vérifier si l'oiseau est sorti des limites
            if (Math.abs(birdState.position.x) > limit || 
                Math.abs(birdState.position.z) > limit ||
                birdState.position.y < skyHeight - heightVariation ||
                birdState.position.y > skyHeight + heightVariation) {
                
                // Réinitialiser l'oiseau de l'autre côté
                this.resetBird(i);
                continue;
            }
            
            // Mettre à jour la rotation pour suivre la direction
            const birdRotation = new THREE.Quaternion();
            const upVector = new THREE.Vector3(0, 1, 0);
            const rotationAxis = new THREE.Vector3().crossVectors(upVector, birdState.velocity).normalize();
            const rotationAngle = Math.acos(upVector.dot(birdState.velocity));
            birdRotation.setFromAxisAngle(rotationAxis, rotationAngle);
            
            // Rotation supplémentaire pour orienter l'oiseau horizontalement
            const horizontalRotation = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                Math.atan2(birdState.velocity.x, birdState.velocity.z) + Math.PI / 2
            );
            birdRotation.multiply(horizontalRotation);
            
            // Mettre à jour la matrice du corps
            _tempMatrix.compose(birdState.position, birdRotation, _tempScale);
            this.birdInstancedMeshes.body.setMatrixAt(i, _tempMatrix);
            
            // Mettre à jour les matrices des ailes
            const leftWingMatrix = new THREE.Matrix4()
                .makeTranslation(-0.7, 0, 0)
                .multiply(new THREE.Matrix4().makeRotationZ(this.currentWingRotation))
                .premultiply(_tempMatrix);
            this.birdInstancedMeshes.leftWing.setMatrixAt(i, leftWingMatrix);
            
            const rightWingMatrix = new THREE.Matrix4()
                .makeTranslation(0.7, 0, 0)
                .multiply(new THREE.Matrix4().makeRotationZ(-this.currentWingRotation))
                .multiply(new THREE.Matrix4().makeScale(-1, 1, 1))
                .premultiply(_tempMatrix);
            this.birdInstancedMeshes.rightWing.setMatrixAt(i, rightWingMatrix);
        }
        
        // Mettre à jour les matrices
        this.birdInstancedMeshes.body.instanceMatrix.needsUpdate = true;
        this.birdInstancedMeshes.leftWing.instanceMatrix.needsUpdate = true;
        this.birdInstancedMeshes.rightWing.instanceMatrix.needsUpdate = true;
    }
    
    /**
     * Met à jour la direction globale des oiseaux
     */
    updateGlobalDirection() {
        // Choisir une nouvelle direction globale avec une variation aléatoire
        const angle = Math.random() * Math.PI * 2;
        const variation = (Math.random() - 0.5) * this.directionVariation;
        this.globalDirection.set(
            Math.cos(angle + variation),
            0,
            Math.sin(angle + variation)
        ).normalize();
    }
    
    /**
     * Met à jour la direction d'un oiseau en fonction du comportement de groupe
     * @param {number} birdIndex - Index de l'oiseau
     * @param {number} totalBirds - Nombre total d'oiseaux actifs
     */
    updateBirdDirection(birdIndex, totalBirds) {
        const birdState = this.birdStates[birdIndex];
        const neighbors = [];
        
        // Trouver les voisins proches
        for (let i = 0; i < totalBirds; i++) {
            if (i === birdIndex) continue;
            const otherState = this.birdStates[i];
            if (!otherState.isActive) continue;
            
            const distance = birdState.position.distanceTo(otherState.position);
            if (distance < this.groupInfluenceRadius) {
                neighbors.push(otherState);
            }
        }
        
        // Calculer les forces de groupe
        const alignment = new THREE.Vector3();
        const cohesion = new THREE.Vector3();
        const separation = new THREE.Vector3();
        
        if (neighbors.length > 0) {
            // Alignement : moyenne des directions des voisins
            neighbors.forEach(neighbor => {
                alignment.add(neighbor.velocity);
            });
            alignment.divideScalar(neighbors.length).normalize();
            
            // Cohésion : direction vers le centre du groupe
            const center = new THREE.Vector3();
            neighbors.forEach(neighbor => {
                center.add(neighbor.position);
            });
            center.divideScalar(neighbors.length);
            cohesion.subVectors(center, birdState.position).normalize();
            
            // Séparation : éviter les collisions
            neighbors.forEach(neighbor => {
                const diff = new THREE.Vector3().subVectors(birdState.position, neighbor.position);
                const distance = diff.length();
                diff.normalize().divideScalar(distance);
                separation.add(diff);
            });
            separation.divideScalar(neighbors.length).normalize();
        }
        
        // Combiner les forces avec la direction globale
        const targetDirection = new THREE.Vector3()
            .add(this.globalDirection.clone().multiplyScalar(0.5))
            .add(alignment.multiplyScalar(this.groupAlignmentFactor))
            .add(cohesion.multiplyScalar(this.groupCohesionFactor))
            .add(separation.multiplyScalar(this.groupSeparationFactor))
            .normalize();
        
        // Ajouter une petite variation aléatoire
        targetDirection.add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
        )).normalize();
        
        birdState.targetDirection.copy(targetDirection);
    }
    
    /**
     * Réinitialise un oiseau qui est sorti des limites
     * @param {number} birdIndex - Index de l'oiseau à réinitialiser
     */
    resetBird(birdIndex) {
        const birdState = this.birdStates[birdIndex];
        const mapSize = this.environmentSystem.experience.world.cityManager.config.mapSize;
        const skyHeight = 200;
        const heightVariation = 80;
        
        // Choisir un bord aléatoire pour réapparition
        const side = Math.floor(Math.random() * 4);
        let x, z;
        
        switch (side) {
            case 0: // Bord gauche
                x = -mapSize * 0.8;
                z = (Math.random() - 0.5) * mapSize * 1.6;
                break;
            case 1: // Bord droit
                x = mapSize * 0.8;
                z = (Math.random() - 0.5) * mapSize * 1.6;
                break;
            case 2: // Bord avant
                x = (Math.random() - 0.5) * mapSize * 1.6;
                z = -mapSize * 0.8;
                break;
            case 3: // Bord arrière
                x = (Math.random() - 0.5) * mapSize * 1.6;
                z = mapSize * 0.8;
                break;
        }
        
        // Positionner l'oiseau
        birdState.position.set(
            x,
            skyHeight + (Math.random() - 0.5) * heightVariation,
            z
        );
        
        // Initialiser la vitesse dans la direction globale
        birdState.velocity.copy(this.globalDirection).normalize()
            .multiplyScalar(this.birdAnimationSpeed);
        birdState.targetDirection.copy(birdState.velocity);
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
     * Met à jour les vitesses des oiseaux
     */
    updateBirdSpeeds() {
        const actualBirdCount = Math.floor(this.totalNumberOfBirds * this.birdDensity);
        
        for (let i = 0; i < actualBirdCount; i++) {
            const birdState = this.birdStates[i];
            if (!birdState.isActive) continue;
            
            // Calculer une nouvelle vitesse cible avec variation
            const variation = (Math.random() - 0.5) * this.speedVariation;
            birdState.targetSpeed = this.baseSpeed * (1 + variation);
        }
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