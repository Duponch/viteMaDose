import * as THREE from 'three';

export default class Car {
    constructor(instanceId, experience, startPosition, targetPosition) {
        this.instanceId = instanceId;
        this.experience = experience;

        // --- *** CORRECTION VITESSE *** ---
        // Récupérer la config depuis experience
        this.config = experience.config;
        // Utiliser la vitesse de la config ou une valeur par défaut raisonnable
        this.speed = this.config?.carSpeed ?? 20.0; // Exemple: 20 unités/sec
        // --- *** FIN CORRECTION VITESSE *** ---

        // Position et orientation
        this.position = startPosition.clone();
        this.rotation = new THREE.Euler();
        this.quaternion = new THREE.Quaternion();

        // La matrice de transformation pour le rendu
        this.matrix = new THREE.Matrix4();

        // La hauteur de la voiture (inchangée)
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

    // ... reste du fichier Car.js (setPath, updateMatrix, update) ...
    // (Le reste des méthodes setPath, updateMatrix, update reste identique à votre code actuel)

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
            this.isActive = false; // Mettre inactif si pas de chemin valide
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
            this.position.y = this.experience.world?.roadNavigationGraph?.graphHeight ?? 0.1 + this.carHeight; // Utiliser la hauteur de la route + hauteur voiture

            // Orienter vers le prochain point si disponible
            if (this.path.length > 1) {
                this._lookDirection.subVectors(this.path[1], this.path[0]).normalize();
                if (this._lookDirection.lengthSq() > 0.001) {
                    // Utiliser une direction de base correcte pour les voitures (ex: X+ ou Z+)
                    // Ici on suppose que le modèle de voiture pointe vers Z+ par défaut
                    const forwardVector = new THREE.Vector3(0, 0, 1);
                    this._tempQuaternion.setFromUnitVectors(forwardVector, this._lookDirection);
                    this.quaternion.copy(this._tempQuaternion);
                }
            } else {
                 // Si un seul point, pas d'orientation spécifique nécessaire initialement
                 this.quaternion.identity();
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
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (en ms)
     */
     update(deltaTime) {
        if (!this.isActive || !this.path || this.path.length === 0 || this.currentPathIndex >= this.path.length) {
            if(this.isActive && (!this.path || this.path.length === 0)) {
                // Si actif mais pas de chemin, désactiver
                //console.warn(`Car ${this.instanceId}: Active but no path, deactivating.`);
                //this.isActive = false; // Désactiver ici peut causer des problèmes si l'agent attend l'arrivée
            }
            return;
        }

         const targetPoint = this.path[this.currentPathIndex];

         // Utiliser un Vector3 temporaire
         const direction = this._tempVector.subVectors(targetPoint, this.position);
         const distanceToTarget = direction.length();

         // Avancer vers le point cible
         // Convertir deltaTime (ms) en secondes pour la vitesse
         const moveDistance = Math.min(this.speed * (deltaTime / 1000.0), distanceToTarget);

         if (distanceToTarget > 0.01) { // Éviter division par zéro et mouvements infimes
             direction.normalize(); // Obtenir la direction normalisée
             this.position.addScaledVector(direction, moveDistance); // Déplacer

             // Orientation : Slerp vers la direction
             if (direction.lengthSq() > 0.001) {
                 const forwardVector = new THREE.Vector3(0, 0, 1); // Direction avant du modèle
                 this._lookDirection.copy(direction); // Direction actuelle du mouvement
                 this._tempQuaternion.setFromUnitVectors(forwardVector, this._lookDirection);
                 // Interpolation douce (Slerp) vers la nouvelle orientation
                 this.quaternion.slerp(this._tempQuaternion, 0.15); // Ajuster le facteur 0.15 si besoin
             }
         }

         // Vérifier si le point cible est atteint (ou très proche)
         // Recalculer la distance après le mouvement pour plus de précision
         const remainingDistance = this.position.distanceTo(targetPoint);

         if (remainingDistance <= this.reachTolerance) {
             this.currentPathIndex++; // Passer au point suivant

             // Si c'est la fin du chemin
             if (this.currentPathIndex >= this.path.length) {
                 console.log(`Car ${this.instanceId}: Arrivée à destination (fin du chemin).`);
                 this.isActive = false; // La voiture a terminé son trajet
                 this.path = null;      // Nettoyer le chemin
                 this.currentPathIndex = 0;
                 // Ne pas retourner ici, mettre à jour la matrice une dernière fois
             }
             // Si ce n'est pas la fin, l'orientation sera gérée au prochain update vers le nouveau targetPoint
         }

         // Mettre à jour la matrice de transformation à chaque frame où la voiture est active
         this.updateMatrix();
     }
}