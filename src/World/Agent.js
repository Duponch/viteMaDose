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
        this.instanceId = instanceId; // Index pour les InstancedMesh

        // --- État de l'agent ---
        this.position = new THREE.Vector3(0, 0, 0); // Position logique (au sol)
        this.orientation = new THREE.Quaternion(); // Orientation logique
        this.scale = config.scale !== undefined ? config.scale : 1.0;
        this.speed = config.speed !== undefined ? config.speed : 1.5;
        this.torsoColor = config.torsoColor !== undefined ? new THREE.Color(config.torsoColor) : new THREE.Color(0x800080);
        this.debugPathColor = config.debugPathColor !== undefined ? config.debugPathColor : this.torsoColor.getHex(); // Utiliser couleur torse par défaut

        // --- État du chemin ---
        this.path = null;
        this.currentPathIndex = 0;
        this.reachTolerance = 0.15; // Tolérance fixe

        // --- Cible de déplacement interne ---
        this._targetPosition = new THREE.Vector3(); // Prochain point du chemin
        this._direction = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3(); // Pour l'orientation
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
                this._lookTarget.y = this.position.y; // Regarder horizontalement
                this.orientation.setFromRotationMatrix(
                    new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0))
                );
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

        this._targetPosition.copy(this.path[this.currentPathIndex]);
        const distanceToTargetXZ = this.position.distanceTo(this._targetPosition); // Utilise distance 3D maintenant, Y devrait être le même

        // Distance à parcourir ce frame
        const moveDistance = this.speed * (deltaTime / 1000);

        if (distanceToTargetXZ <= this.reachTolerance || distanceToTargetXZ < moveDistance) {
            // Atteint la cible : se positionner exactement et passer au point suivant
            this.position.copy(this._targetPosition);
            this.currentPathIndex++;

            if (this.currentPathIndex < this.path.length) {
                // S'orienter vers le nouveau point suivant
                this._lookTarget.copy(this.path[this.currentPathIndex]);
                this._lookTarget.y = this.position.y; // Regarder horizontalement

                // --- Utilisation de Quaternion pour une rotation plus douce ---
                const targetQuaternion = new THREE.Quaternion();
                const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                targetQuaternion.setFromRotationMatrix(lookMatrix);

                // Interpolation Slerp pour une rotation fluide (ajuster le facteur alpha)
                this.orientation.slerp(targetQuaternion, 0.1); // 0.1 = vitesse de rotation

            } else {
                // Chemin terminé
                this.path = null; // Réinitialiser
            }
        } else {
            // Se déplacer vers la cible
            this._direction.copy(this._targetPosition).sub(this.position);
            this._direction.y = 0; // Mouvement uniquement sur XZ (la hauteur est gérée par le chemin)
            this._direction.normalize();
            this.position.addScaledVector(this._direction, moveDistance);

            // S'assurer que Y reste constant (hauteur du sol du chemin)
            this.position.y = this._targetPosition.y;

            // Orientation gérée lors du changement de cible ou par slerp continu
             const targetQuaternion = new THREE.Quaternion();
             const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
             targetQuaternion.setFromRotationMatrix(lookMatrix);
             this.orientation.slerp(targetQuaternion, 0.1);
        }
    }

    // Pas de méthode destroy complexe nécessaire, c'est juste un objet de données
    destroy() {
        this.path = null;
        // console.log(`Agent logique ${this.id} détruit.`);
    }
}