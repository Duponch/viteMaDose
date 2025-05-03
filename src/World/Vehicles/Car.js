import * as THREE from 'three';

// --- Début Fonctions Ramer-Douglas-Peucker ---

// Calcule la distance perpendiculaire d'un point à une ligne définie par start et end
function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dz = lineEnd.z - lineStart.z; // Utiliser Z car on est en vue de dessus (XZ plane)
    const lineLengthSq = dx * dx + dz * dz;

    if (lineLengthSq === 0) { // Start et End sont le même point
        const pointDx = point.x - lineStart.x;
        const pointDz = point.z - lineStart.z;
        return Math.sqrt(pointDx * pointDx + pointDz * pointDz);
    }

    const t = ((point.x - lineStart.x) * dx + (point.z - lineStart.z) * dz) / lineLengthSq;
    const clampedT = Math.max(0, Math.min(1, t)); // Clamp t pour rester sur le segment

    const closestPointX = lineStart.x + clampedT * dx;
    const closestPointZ = lineStart.z + clampedT * dz;

    const distanceDx = point.x - closestPointX;
    const distanceDz = point.z - closestPointZ;
    return Math.sqrt(distanceDx * distanceDx + distanceDz * distanceDz);
}

// Fonction récursive Ramer-Douglas-Peucker
function ramerDouglasPeuckerRecursive(points, startIndex, endIndex, epsilon, result) {
    let maxDistance = 0;
    let index = startIndex;

    for (let i = startIndex + 1; i < endIndex; i++) {
        const distance = perpendicularDistance(points[i], points[startIndex], points[endIndex]);
        if (distance > maxDistance) {
            maxDistance = distance;
            index = i;
        }
    }

    if (maxDistance > epsilon) {
        // Le point est significatif, on divise et on récursive
        ramerDouglasPeuckerRecursive(points, startIndex, index, epsilon, result);
        result.push(points[index]); // Ajouter le point pivot
        ramerDouglasPeuckerRecursive(points, index, endIndex, epsilon, result);
    }
    // Sinon (maxDistance <= epsilon), les points intermédiaires ne sont pas ajoutés,
    // seul le point de fin sera ajouté lors du retour de la récursion ou à la fin.
}

// Fonction principale pour lancer la simplification
function simplifyPath(points, epsilon) {
    if (points.length < 3) {
        return points; // Pas besoin de simplifier
    }
    const result = [points[0]]; // Toujours garder le premier point
    ramerDouglasPeuckerRecursive(points, 0, points.length - 1, epsilon, result);
    result.push(points[points.length - 1]); // Toujours garder le dernier point
    return result;
}

// --- Fin Fonctions Ramer-Douglas-Peucker ---

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

        // Facteur d'échelle global pour la voiture (réduction de 10%)
        this.globalScale = 0.8;

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

        // NOUVEAU: Stockage de l'ID de l'agent conducteur
        this.agentId = null;
    }

    // ... reste du fichier Car.js (setPath, updateMatrix, update) ...

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

        // --- Étape 1: Simplifier le chemin A* brut ---
        // L'epsilon détermine à quel point un point doit s'écarter pour être conservé.
        // Une petite valeur conserve plus de points. À ajuster selon l'échelle de la grille/monde.
        const epsilon = 0.5; // (Valeur à ajuster potentiellement)
        const simplifiedPathPoints = simplifyPath(pathPoints, epsilon);

        // --- Étape 2: Ajuster le chemin simplifié pour suivre la voie de droite ---
        let adjustedPathPoints = simplifiedPathPoints; // Commence avec le chemin simplifié

        // Récupérer le graphe de navigation routier
        let roadNavigationGraph = this.experience.world?.navigationManager?.getNavigationGraph?.(true);
        if (!roadNavigationGraph && this.experience.world?.roadNavigationGraph) {
            roadNavigationGraph = this.experience.world.roadNavigationGraph;
        }

        if (!roadNavigationGraph) {
            console.error(`Car ${this.instanceId}: Impossible de récupérer le graphe routier pour ajuster le chemin.`);
            // Conserver le chemin simplifié comme chemin final si le graphe est absent
        } else if (typeof roadNavigationGraph.adjustPathToRightLane !== 'function') {
            console.warn(`Car ${this.instanceId}: Le graphe routier ne possède pas adjustPathToRightLane. Utilisation du chemin simplifié.`);
            // Conserver le chemin simplifié si la fonction manque
        } else {
             // Ajuster le chemin simplifié pour suivre la voie de droite
             // On passe maintenant simplifiedPathPoints au lieu de pathPoints
            adjustedPathPoints = roadNavigationGraph.adjustPathToRightLane(simplifiedPathPoints);
        }

        // --- Étape 3: Utiliser le chemin final (simplifié ET ajusté) ---
        this.path = adjustedPathPoints;

        // Vérifier si le chemin final est valide après toutes les opérations
        if (!this.path || this.path.length === 0) {
            console.warn(`Car ${this.instanceId}: Chemin final invalide après simplification/ajustement.`);
            this.isActive = false;
            return;
        }

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

    updateMatrix() {
        // Met à jour la matrice de transformation de la voiture
        this.matrix.identity();
        this.matrix.makeRotationFromQuaternion(this.quaternion);
        this.matrix.setPosition(this.position.x, this.position.y + this.carHeight, this.position.z);
        // Appliquer l'échelle globale (réduction de 10%)
        this.matrix.scale(new THREE.Vector3(this.globalScale, this.globalScale, this.globalScale));
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
            let distanceToTargetSq = direction.lengthSq();

            // --- Vérification si cible déjà atteinte (pour boucle suivante) ---
            if (distanceToTargetSq <= this.reachTolerance * this.reachTolerance) {
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
            const moveDistanceThisStep = Math.min(this.speed * timeStep, Math.sqrt(distanceToTargetSq));

            if (distanceToTargetSq > 0.001) { // Éviter mouvements infimes
                direction.normalize();
                this.position.addScaledVector(direction, moveDistanceThisStep);

                // Orientation (inchangée, mais appliquée à chaque pas)
                const forwardVector = new THREE.Vector3(0, 0, 1);
                this._lookDirection.copy(direction);
                this._tempQuaternion.setFromUnitVectors(forwardVector, this._lookDirection);
                
                // Calculer un facteur de slerp basé sur le temps et la vitesse
                const baseRotationSpeed = 20; // Vitesse de rotation de base
                const speedFactor = Math.min(1.0, this.speed / 20.0); // Facteur basé sur la vitesse (normalisé)
                const timeBasedFactor = 1.0 - Math.exp(-baseRotationSpeed * timeStep * (1.0 + speedFactor));
                
                // Appliquer une courbe d'accélération/décélération pour plus de fluidité
                const smoothFactor = Math.pow(timeBasedFactor, 1.5); // Courbe quadratique pour plus de douceur
                
                // Appliquer la rotation avec le nouveau facteur
                this.quaternion.slerp(this._tempQuaternion, smoothFactor);
            }

            // Vérifier si on a atteint la cible APRES ce petit mouvement
            distanceToTargetSq = this.position.distanceToSquared(targetPoint); // Recalculer la distance
            if (distanceToTargetSq <= this.reachTolerance * this.reachTolerance) {
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

    // NOUVELLES METHODES
    assignAgent(agentId) {
        this.agentId = agentId;
        // Autres initialisations si nécessaire quand un agent prend la voiture
    }

    releaseAgent() {
        this.agentId = null;
        // Nettoyage si nécessaire quand l'agent quitte la voiture
    }
}