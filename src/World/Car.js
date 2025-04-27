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

        // Debug : afficher références pour débogage avant récupération du graphe
        console.log(`[Car Debug] this.experience:`, this.experience);
        console.log(`[Car Debug] this.experience.world:`, this.experience.world);
        console.log(`[Car Debug] this.experience.world.navigationManager:`, this.experience.world.navigationManager);
        console.log(`[Car Debug] getNavigationGraph(true):`, this.experience.world.navigationManager?.getNavigationGraph?.(true));
        console.log(`[Car Debug] this.experience.world.roadNavigationGraph:`, this.experience.world.roadNavigationGraph);

        // Récupérer le graphe de navigation des routes
        let roadNavigationGraph = this.experience.world?.navigationManager?.getNavigationGraph?.(true);
        if (!roadNavigationGraph && this.experience.world?.roadNavigationGraph) {
            roadNavigationGraph = this.experience.world.roadNavigationGraph;
        }
        
        // Debug : afficher les infos sur le graphe trouvé
        if (!roadNavigationGraph) {
            console.warn(`Car ${this.instanceId}: Aucun graphe routier trouvé (ni via navigationManager, ni via world.roadNavigationGraph)`);
        } else if (typeof roadNavigationGraph.adjustPathToRightLane !== 'function') {
            console.warn(`Car ${this.instanceId}: Le graphe routier ne possède pas adjustPathToRightLane. Propriétés:`, Object.keys(roadNavigationGraph));
        }
        
        // Copier les points du chemin et les ajuster pour qu'ils suivent la voie de droite si possible
        let adjustedPathPoints = pathPoints;
        if (roadNavigationGraph && typeof roadNavigationGraph.adjustPathToRightLane === 'function') {
            // Ajuster le chemin pour rester sur la voie de droite
            adjustedPathPoints = roadNavigationGraph.adjustPathToRightLane(pathPoints);
            console.log(`Car ${this.instanceId}: Chemin ajusté pour suivre la voie de droite.`);
        } else {
            console.warn(`Car ${this.instanceId}: Impossible d'ajuster le chemin pour la voie de droite. Utilisation du chemin standard.`);
            adjustedPathPoints = pathPoints.map(p => p.clone());
        }

        // Définir le chemin ajusté
        this.path = adjustedPathPoints;

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
            
            // Afficher le chemin en mode debug si le calque vehiclePath est visible
            if (this.experience.isDebugMode && this.experience.debugLayerVisibility.vehiclePath._visible) {
                this.experience.world.setVehiclePathForCar(this, this.path, 0x00ff00); // Couleur verte pour indiquer que c'est un chemin sur la voie de droite
            }
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
     * avec une simulation par pas de temps fixes pour robustesse.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (en ms)
     */
	update(deltaTime) {
        if (!this.isActive || !this.path || this.path.length === 0 || this.currentPathIndex >= this.path.length) {
            // ... (logique existante pour voiture inactive ou sans chemin) ...
            return;
        }

        // --- NOUVEAU: Simulation par pas de temps fixes ---
        const fixedTimeStepSeconds = 1 / 60; // Simuler à ~60 FPS fixes (environ 16.67 ms)
        let remainingDeltaTimeSeconds = deltaTime / 1000.0; // Convertir deltaTime en secondes

        while (remainingDeltaTimeSeconds > 0 && this.isActive) {
            const timeStep = Math.min(remainingDeltaTimeSeconds, fixedTimeStepSeconds);
            const targetPoint = this.path[this.currentPathIndex];

            const direction = this._tempVector.subVectors(targetPoint, this.position);
            let distanceToTarget = direction.length();

            // --- Vérification si cible déjà atteinte (pour boucle suivante) ---
            if (distanceToTarget <= this.reachTolerance) {
                this.currentPathIndex++;
                if (this.currentPathIndex >= this.path.length) {
                    // Fin du chemin ATTEINTE DANS CETTE BOUCLE
                    this.position.copy(targetPoint); // Snap à la dernière position
                    console.log(`Car ${this.instanceId}: Arrivée à destination (fin du chemin, boucle interne).`);
                    this.isActive = false;
                    this.path = null;
                    this.currentPathIndex = 0;
                    remainingDeltaTimeSeconds = 0; // Sortir de la boucle while
                    break; // Sortir de la boucle while explicitement
                }
                // Si pas la fin, on reprendra au prochain tour de boucle avec le nouveau targetPoint
                continue; // Passer à la prochaine itération du while
            }

            // --- Calcul du mouvement pour CE pas de temps fixe ---
            const moveDistanceThisStep = Math.min(this.speed * timeStep, distanceToTarget);

            if (distanceToTarget > 0.001) { // Éviter mouvements infimes
                direction.normalize();
                this.position.addScaledVector(direction, moveDistanceThisStep);

                // Orientation (inchangée, mais appliquée à chaque pas)
                const forwardVector = new THREE.Vector3(0, 0, 1);
                this._lookDirection.copy(direction);
                this._tempQuaternion.setFromUnitVectors(forwardVector, this._lookDirection);
                // Utiliser une interpolation plus rapide car les pas sont petits
                this.quaternion.slerp(this._tempQuaternion, 0.3); // Facteur plus grand pour petits pas
            }

            // Vérifier si on a atteint la cible APRES ce petit mouvement
            distanceToTarget = this.position.distanceTo(targetPoint); // Recalculer la distance
            if (distanceToTarget <= this.reachTolerance) {
                this.currentPathIndex++;
                if (this.currentPathIndex >= this.path.length) {
                    // Fin du chemin ATTEINTE A LA FIN DE CE PAS
                    this.position.copy(targetPoint); // Snap
                    console.log(`Car ${this.instanceId}: Arrivée à destination (fin du chemin, fin de pas).`);
                    this.isActive = false;
                    this.path = null;
                    this.currentPathIndex = 0;
                    remainingDeltaTimeSeconds = 0; // Sortir de la boucle while
                    break; // Sortir de la boucle while
                }
                // Sinon, on continue la boucle avec le prochain point cible
            }

            // Décrémenter le temps restant pour cette frame
            remainingDeltaTimeSeconds -= timeStep;

        } // Fin boucle while (remainingDeltaTimeSeconds > 0)

        // --- Mise à jour finale de la matrice (une seule fois après la boucle) ---
        this.updateMatrix();
    }
}