// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

export default class Agent {
    /**
     * Représente l'état logique d'un agent. Ne contient pas d'objets Three.js.
     * Géré par AgentManager pour le rendu instancié.
     * @param {object} config - Contient les paramètres initiaux (speed, scale, torsoColor).
     * @param {number} instanceId - L'index de cet agent dans les InstancedMesh.
     */
	constructor(config, instanceId) {
        this.id = nextAgentId++;
        this.instanceId = instanceId;

        // --- État de l'agent ---
        this.position = new THREE.Vector3(0, 0, 0);
        this.orientation = new THREE.Quaternion();
        this.scale = config.scale !== undefined ? config.scale : 1.0;
        this.speed = config.speed !== undefined ? config.speed : 1.5;
        // --- NOUVEAU: Stocker la vitesse de rotation ---
        this.rotationSpeed = config.rotationSpeed !== undefined ? config.rotationSpeed : 8.0;
        // ---------------------------------------------
        this.torsoColor = config.torsoColor !== undefined ? new THREE.Color(config.torsoColor) : new THREE.Color(0x800080);
        this.debugPathColor = config.debugPathColor !== undefined ? config.debugPathColor : this.torsoColor.getHex();

        // --- État du chemin ---
        this.path = null;
        this.currentPathIndex = 0;
        this.reachTolerance = 0.15;

        // --- Cible de déplacement interne ---
        this._targetPosition = new THREE.Vector3();
        this._direction = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3();
        // Ajouter une cible pour le slerp
        this._targetOrientation = new THREE.Quaternion(); // Quaternion cible pour slerp
    }

    setPath(pathPoints) {
        if (pathPoints && pathPoints.length > 0) {
            this.path = pathPoints;
            this.currentPathIndex = 0;

            // Définir la position initiale logique
            this.position.copy(this.path[0]);

            if (this.path.length > 1) {
                // Orienter vers le premier waypoint logique
                this._lookTarget.copy(this.path[1]);
                // this._lookTarget.y = this.position.y; // Regarder horizontalement <-- LIGNE A SUPPRIMER/COMMENTER SI ON VEUT VISER LE Y DU POINT
                this.orientation.setFromRotationMatrix(
                    new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0))
                );
                 // Initialiser aussi la target orientation pour le slerp dès le départ
                 this._targetOrientation.copy(this.orientation);
            } else {
                // Chemin d'un seul point, considéré comme terminé
                this.position.copy(this.path[0]);
                this.path = null;
            }
        } else {
            // Pas de chemin ou chemin terminé
            this.path = null;
            this.currentPathIndex = 0;
        }
    }

    update(deltaTime) {
        // Ne fait rien si pas de chemin
        if (!this.path || this.currentPathIndex >= this.path.length) {
            return;
        }

        // Cible actuelle du chemin
        const targetPathPoint = this.path[this.currentPathIndex];

        // --- Mise à jour de la position ---
        this._targetPosition.copy(targetPathPoint);
        // Ligne supprimée/commentée:
        // this._targetPosition.y = this.position.y; // <-- SUPPRIMER/COMMENTER CETTE LIGNE (déjà fait dans votre code actuel)

        // --- Calculs de distance et mouvement ---
        const distanceToTargetSq = this.position.distanceToSquared(this._targetPosition);
        const distanceToTarget = Math.sqrt(distanceToTargetSq); // <-- Besoin de la distance réelle
        const moveThisFrame = this.speed * (deltaTime / 1000);
        const reachTolerance = this.reachTolerance; // Utiliser la tolérance directement

        let targetReachedThisFrame = false;

        // --- NOUVELLE LOGIQUE D'ARRIVEE ---
        if (distanceToTarget <= moveThisFrame || distanceToTarget <= reachTolerance) {
            // On peut/doit atteindre la cible DANS cette frame
            targetReachedThisFrame = true;

            // Se déplacer EXACTEMENT de la distance restante (si > 0)
            if (distanceToTarget > 0.001) { // Eviter division par zéro ou mouvement infime
                 this._direction.copy(this._targetPosition).sub(this.position).normalize();
                 // IMPORTANT: Ne pas dépasser la distance restante
                 const moveAmount = Math.min(moveThisFrame, distanceToTarget);
                 this.position.addScaledVector(this._direction, moveAmount);
                 // Optionnel: Forcer la position exacte après le petit mouvement pour corriger erreurs flottantes
                 // this.position.copy(targetPathPoint); // Dé-commenter si nécessaire, mais le addScaledVector devrait suffire.
            } else {
                 // Si déjà très proche, juste copier pour être sûr
                 this.position.copy(targetPathPoint);
            }


            // Passer au point suivant
            this.currentPathIndex++;
            if (this.currentPathIndex >= this.path.length) {
                this.path = null; // Chemin terminé
            }
        } else {
            // Pas encore atteint : se déplacer normalement vers la cible
            this._direction.copy(this._targetPosition).sub(this.position).normalize();
            this.position.addScaledVector(this._direction, moveThisFrame);
        }
        // --- FIN NOUVELLE LOGIQUE ---


        // --- Mise à jour de l'orientation cible (_targetOrientation) ---
        // (Votre logique d'orientation existante avec slerp semble correcte et peut rester inchangée)
        if (this.path) { // Si on a toujours un chemin (ou vient juste d'arriver au dernier point)
             // On utilise l'index *potentiellement* incrémenté si on a atteint la cible ce frame
            const lookAtIndex = this.currentPathIndex; // L'index vers lequel regarder
            if (lookAtIndex < this.path.length) {
                 this._lookTarget.copy(this.path[lookAtIndex]);
                 // Ligne supprimée/commentée:
                 // this._lookTarget.y = this.position.y; // <-- SUPPRIMER/COMMENTER CETTE LIGNE

                 // Vérifier si la position actuelle et la cible sont (presque) identiques pour éviter lookAt(0,0,0)
                 if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                    const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                    this._targetOrientation.setFromRotationMatrix(lookMatrix);
                 }
                 // Si trop proches, on garde la _targetOrientation précédente
            }
        }
        // Si le chemin est null (terminé), on ne met plus à jour _targetOrientation.

        // --- Appliquer l'interpolation Slerp (indépendante du framerate) ---
        // (Votre logique slerp existante reste inchangée)
        const deltaSeconds = deltaTime / 1000;
        const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
        this.orientation.slerp(this._targetOrientation, slerpAlpha);

    } // Fin de la méthode update

    // Pas de méthode destroy complexe nécessaire, c'est juste un objet de données
    destroy() {
        this.path = null;
        // console.log(`Agent logique ${this.id} détruit.`);
    }
}