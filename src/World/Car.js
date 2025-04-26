import * as THREE from 'three';

export default class Car {
    constructor(instanceId, experience, startPosition, targetPosition) {
        this.instanceId = instanceId;
        this.experience = experience;
        
        // Position et orientation
        this.position = startPosition.clone();
        this.rotation = new THREE.Euler();
        this.quaternion = new THREE.Quaternion();
        
        // La matrice de transformation pour le rendu
        this.matrix = new THREE.Matrix4();
        
        // La vitesse et la hauteur de la voiture
        this.speed = 0.05; // Unités par seconde
        this.carHeight = 0.25; // Hauteur depuis le sol
        
        // État d'activité
        this.isActive = true;
        
        // Chemin à suivre (points du monde)
        this.path = null;
        this.currentPathIndex = 0;
        this.targetPosition = targetPosition.clone();
        this.reachTolerance = 1.0; // Distance considérée comme "atteinte"
        
        // Variables temporaires pour les calculs
        this._tempVector = new THREE.Vector3();
        this._tempQuaternion = new THREE.Quaternion();
        this._lookDirection = new THREE.Vector3();
        
        // Initialisation de la matrice
        this.updateMatrix();
    }
    
    /**
     * Définit le chemin que la voiture doit suivre
     * @param {Array<THREE.Vector3>} pathPoints - Points du chemin dans le monde
     */
    setPath(pathPoints) {
        // Vérifier que le chemin est valide
        if (!pathPoints || !Array.isArray(pathPoints) || pathPoints.length === 0) {
            console.warn(`Car ${this.instanceId}: Chemin invalide fourni.`);
            this.path = null;
            this.currentPathIndex = 0;
            return;
        }
        
        // Copier les points du chemin
        this.path = pathPoints.map(p => p.clone());
        
        // Réinitialiser l'index du chemin
        this.currentPathIndex = 0;
        
        // Assurer que la voiture est active
        this.isActive = true;
        
        // Placer la voiture au début du chemin
        if (this.path.length > 0) {
            this.position.copy(this.path[0]);
            this.position.y += this.carHeight; // Élever légèrement au-dessus de la route
            
            // Orienter vers le prochain point si disponible
            if (this.path.length > 1) {
                this._lookDirection.subVectors(this.path[1], this.path[0]).normalize();
                if (this._lookDirection.lengthSq() > 0.001) {
                    this._tempQuaternion.setFromUnitVectors(
                        new THREE.Vector3(0, 0, 1), // Direction par défaut de la voiture (Z+)
                        this._lookDirection
                    );
                    this.quaternion.copy(this._tempQuaternion);
                }
            }
            
            this.updateMatrix();
        }
    }
    
    /**
     * Met à jour la matrice de transformation
     */
    updateMatrix() {
        this.matrix.compose(this.position, this.quaternion, new THREE.Vector3(1, 1, 1));
    }
    
    /**
     * Met à jour la position et l'orientation de la voiture
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame
     */
    update(deltaTime) {
        if (!this.isActive) return;
        
        // Si nous avons un chemin à suivre
        if (this.path && this.path.length > 0) {
            // Si nous n'avons pas atteint la fin du chemin
            if (this.currentPathIndex < this.path.length) {
                // Point cible actuel
                const targetPoint = this.path[this.currentPathIndex];
                
                // Calculer la direction vers le point cible
                this._tempVector.subVectors(targetPoint, this.position);
                const distanceToTarget = this._tempVector.length();
                
                // Si nous sommes suffisamment près du point cible
                if (distanceToTarget <= this.reachTolerance) {
                    // Passer au point suivant
                    this.currentPathIndex++;
                    
                    // Si nous avons atteint la fin du chemin
                    if (this.currentPathIndex >= this.path.length) {
                        // Nous sommes arrivés à destination
                        console.log(`Car ${this.instanceId}: Arrivée à destination`);
                        this.isActive = false;
                        return;
                    }
                }
                
                // Normaliser la direction et calculer le déplacement
                if (distanceToTarget > 0) {
                    this._tempVector.divideScalar(distanceToTarget);
                    
                    // Déplacer la voiture
                    const moveDistance = Math.min(this.speed * deltaTime, distanceToTarget);
                    this._tempVector.multiplyScalar(moveDistance);
                    this.position.add(this._tempVector);
                    
                    // Orienter la voiture vers la direction du mouvement
                    if (this._tempVector.lengthSq() > 0.001) {
                        this._lookDirection.copy(this._tempVector).normalize();
                        this._tempQuaternion.setFromUnitVectors(
                            new THREE.Vector3(0, 0, 1), // Direction par défaut (Z+)
                            this._lookDirection
                        );
                        this.quaternion.slerp(this._tempQuaternion, 0.1);
                    }
                }
                
                // Mettre à jour la matrice de transformation
                this.updateMatrix();
                
                // Log de débogage périodique (toutes les 5 secondes)
                if (Math.random() < 0.01) { // ~1% de chance par frame
                    console.log(`Car ${this.instanceId}: Position [${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)}], Index: ${this.currentPathIndex}/${this.path.length}`);
                }
            }
        } else if (this.targetPosition) {
            // Mode simple: se diriger directement vers la cible finale
            this._tempVector.subVectors(this.targetPosition, this.position);
            const distanceToTarget = this._tempVector.length();
            
            // Si nous sommes suffisamment près de la cible
            if (distanceToTarget <= this.reachTolerance) {
                // Nous sommes arrivés à destination
                console.log(`Car ${this.instanceId}: Arrivée à destination (mode direct)`);
                this.isActive = false;
                return;
            }
            
            // Normaliser la direction et calculer le déplacement
            if (distanceToTarget > 0) {
                this._tempVector.divideScalar(distanceToTarget);
                
                // Déplacer la voiture
                const moveDistance = Math.min(this.speed * deltaTime, distanceToTarget);
                this._tempVector.multiplyScalar(moveDistance);
                this.position.add(this._tempVector);
                
                // Orienter la voiture vers la direction du mouvement
                if (this._tempVector.lengthSq() > 0.001) {
                    this._lookDirection.copy(this._tempVector).normalize();
                    this._tempQuaternion.setFromUnitVectors(
                        new THREE.Vector3(0, 0, 1), // Direction par défaut (Z+)
                        this._lookDirection
                    );
                    this.quaternion.slerp(this._tempQuaternion, 0.1);
                }
            }
            
            // Mettre à jour la matrice de transformation
            this.updateMatrix();
        }
    }
} 