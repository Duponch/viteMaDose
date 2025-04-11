// src/World/Agent.js
import * as THREE from 'three';

export default class Agent {
    constructor(scene, startPosition, color = 0x0000ff, size = 2) { // Taille réduite
        this.scene = scene;
        this.speed = 5.0; // Unités par seconde (relativement rapide pour une ville)
        this.path = null;
        this.currentPathIndex = 0;
        this.reachTolerance = 0.2; // Tolérance pour atteindre un point

        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({ color: color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(startPosition);
         this.mesh.position.y = size / 2; // Assurer qu'il est posé au sol (si startPosition est à y=0)
        this.mesh.castShadow = true;
        this.mesh.name = "pathfindingAgent";
        this.scene.add(this.mesh);
    }

    setPath(pathPoints) {
        if (pathPoints && pathPoints.length > 0) {
            this.path = pathPoints;
            this.currentPathIndex = 0;
            // Orienter vers le premier waypoint (si chemin a plus d'un point)
             if (this.path.length > 1) {
                 const nextPoint = this.path[1].clone();
                 nextPoint.y = this.mesh.position.y; // Regarder à la même hauteur
                 this.mesh.lookAt(nextPoint);
             } else {
                 // Si chemin d'un seul point, juste s'y mettre ? Ou ne rien faire.
                  this.mesh.position.copy(this.path[0]);
                  this.path = null; // Chemin terminé
             }
        } else {
            this.path = null;
            this.currentPathIndex = 0;
        }
    }

    update(deltaTime) {
        // Retrait du console.log("BBBBBBBBBBBBBBBBBBBBBBBB");
        if (!this.path || this.currentPathIndex >= this.path.length) {
            return; // Pas de chemin ou chemin terminé
        }

        const targetPosition = this.path[this.currentPathIndex];
        const currentPosition = this.mesh.position;

         // On ne compare que sur X et Z pour la distance, car Y est fixe (hauteur trottoir)
         const distanceToTargetXZ = Math.sqrt(
            Math.pow(targetPosition.x - currentPosition.x, 2) +
            Math.pow(targetPosition.z - currentPosition.z, 2)
         );


        // Distance à parcourir ce frame
        const moveDistance = this.speed * (deltaTime / 1000); // deltaTime est en ms

        if (distanceToTargetXZ <= this.reachTolerance || distanceToTargetXZ <= moveDistance) {
            // Atteint (ou dépassé) la cible : se positionner exactement et passer au point suivant
            currentPosition.copy(targetPosition); // Assure la position exacte
            this.currentPathIndex++;

            if (this.currentPathIndex < this.path.length) {
                 // Regarder vers le point suivant (en gardant Y constant)
                 const nextPoint = this.path[this.currentPathIndex].clone();
                 nextPoint.y = this.mesh.position.y;
                 this.mesh.lookAt(nextPoint);
            } else {
                console.log("Agent: Chemin terminé !");
                this.path = null; // Réinitialiser pour arrêter le mouvement
            }
        } else {
            // Se déplacer vers la cible
            const direction = targetPosition.clone().sub(currentPosition);
            direction.y = 0; // Mouvement uniquement sur XZ
            direction.normalize();
            this.mesh.position.addScaledVector(direction, moveDistance);

            // S'assurer que Y reste constant (hauteur du trottoir)
             this.mesh.position.y = targetPosition.y; // Ou this.navigationGraph.sidewalkHeight

             // Optionnel: garder l'orientation (déjà fait quand on change de point)
             // const lookTarget = targetPosition.clone();
             // lookTarget.y = this.mesh.position.y;
             // this.mesh.lookAt(lookTarget);
        }
    }

    destroy() {
         if (this.mesh && this.mesh.parent) {
            this.scene.remove(this.mesh);
         }
         if(this.mesh.geometry) this.mesh.geometry.dispose();
         if(this.mesh.material) this.mesh.material.dispose();
         this.mesh = null;
         this.scene = null;
         this.path = null;
    }
}