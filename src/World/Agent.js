// src/World/Agent.js
import * as THREE from 'three';

export default class Agent {
    /**
     * Crée un agent avec un modèle simple (type Rayman).
     * @param {THREE.Scene} scene La scène Three.js.
     * @param {Experience} experience L'instance de l'expérience (pour l'accès au temps).
     * @param {number} agentId L'identifiant unique de l'agent.
     * @param {number} bodyColor Couleur hexadécimale pour le corps.
     */
	constructor(scene, experience, agentId, bodyColor = 0xff0000, agentScale = 1.0) {
        this.scene = scene;
        this.experience = experience;
        this.id = agentId;
        this.bodyColor = bodyColor;
        this.scale = agentScale;

        // --- CORRECTION : Vitesse et Tolérance ---
        this.speed = 1.5; // Remettre une vitesse normale (unités/seconde)
        this.reachTolerance = 0.15; // Petite tolérance FIXE, indépendante de l'échelle
        // -----------------------------------------

        this.path = null;
        this.currentPathIndex = 0;
        this.debugPathColor = bodyColor;

        // --- Création du modèle Rayman ---
        this.model = this.createRaymanModel();

        // --- Appliquer l'échelle globale ---
        this.model.scale.set(this.scale, this.scale, this.scale);
        // ----------------------------------

        this.scene.add(this.model);
    }

    /**
     * Crée la géométrie et les materials pour le modèle simple.
     * @returns {THREE.Group} Le groupe contenant toutes les parties du modèle.
     */
    createRaymanModel() {
        const agentGroup = new THREE.Group();
        agentGroup.name = `Agent_${this.id}`;

        // --- Matériaux ---
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.bodyColor,
            roughness: 0.6,
            metalness: 0.2
        });
        const limbMaterial = new THREE.MeshStandardMaterial({ // Mains et pieds
            color: 0xffffff, // Blanc
            roughness: 0.7,
            metalness: 0.1
        });
        const headMaterial = new THREE.MeshStandardMaterial({ // Tête
             color: 0xffdbac, // Couleur peau simple
             roughness: 0.7,
             metalness: 0.1
         });

        // --- Géométries ---
        const bodyRadius = 0.5;
        const headRadius = 0.3;
        const limbRadius = 0.2;

        const bodyGeom = new THREE.SphereGeometry(bodyRadius, 16, 12);
        const headGeom = new THREE.SphereGeometry(headRadius, 12, 10);
        const limbGeom = new THREE.SphereGeometry(limbRadius, 8, 6);

        // --- Meshes ---
        // Corps (au centre du groupe)
        this.bodyMesh = new THREE.Mesh(bodyGeom, bodyMaterial);
        this.bodyMesh.castShadow = true;
        this.bodyMesh.receiveShadow = false;
        this.bodyMesh.position.y = bodyRadius; // Repose sur le sol (y=0)
        agentGroup.add(this.bodyMesh);

        // Tête (au-dessus du corps)
        this.headMesh = new THREE.Mesh(headGeom, headMaterial);
        this.headMesh.castShadow = true;
        this.headMesh.position.y = bodyRadius * 2 + headRadius * 0.9; // Au dessus du corps
        agentGroup.add(this.headMesh);

        // Main Gauche
        this.leftHandMesh = new THREE.Mesh(limbGeom.clone(), limbMaterial);
        this.leftHandMesh.castShadow = true;
        this.leftHandMesh.position.set(-(bodyRadius + limbRadius * 1.5), bodyRadius * 1.2, 0);
        agentGroup.add(this.leftHandMesh);

        // Main Droite
        this.rightHandMesh = new THREE.Mesh(limbGeom.clone(), limbMaterial);
        this.rightHandMesh.castShadow = true;
        this.rightHandMesh.position.set(bodyRadius + limbRadius * 1.5, bodyRadius * 1.2, 0);
        agentGroup.add(this.rightHandMesh);

        // Pied Gauche (Optionnel)
        this.leftFootMesh = new THREE.Mesh(limbGeom.clone(), limbMaterial);
        this.leftFootMesh.castShadow = true;
        this.leftFootMesh.position.set(-bodyRadius * 0.6, limbRadius, bodyRadius * 0.2); // Légèrement en avant
        agentGroup.add(this.leftFootMesh);

        // Pied Droit (Optionnel)
        this.rightFootMesh = new THREE.Mesh(limbGeom.clone(), limbMaterial);
        this.rightFootMesh.castShadow = true;
        this.rightFootMesh.position.set(bodyRadius * 0.6, limbRadius, bodyRadius * 0.2); // Légèrement en avant
        agentGroup.add(this.rightFootMesh);

        // Stocker les références pour animation et destruction
        this.limbs = [this.leftHandMesh, this.rightHandMesh, this.leftFootMesh, this.rightFootMesh];
        this.geometries = [bodyGeom, headGeom, limbGeom]; // Garder une réf à la géométrie non clonée des limbs
        this.materials = [bodyMaterial, limbMaterial, headMaterial];

        return agentGroup;
    }

    setPath(pathPoints) {
        if (pathPoints && pathPoints.length > 0) {
            this.path = pathPoints;
            this.currentPathIndex = 0;

            // Positionner le modèle au début du chemin
            this.model.position.copy(this.path[0]);
            // La hauteur Y devrait déjà être correcte (définie par NavigationGraph),
            // mais on s'assure que le bas du corps est à la bonne hauteur.
            this.model.position.y = this.path[0].y; // Le groupe est à la hauteur du sol

            if (this.path.length > 1) {
                // Orienter vers le premier waypoint
                const nextPoint = this.path[1].clone();
                // Regarder à la hauteur du centre du corps pour éviter de pencher
                nextPoint.y = this.model.position.y + this.bodyMesh.position.y;
                const lookAtTarget = new THREE.Vector3();
                this.model.getWorldPosition(lookAtTarget); // Point de départ du regard
                lookAtTarget.y += this.bodyMesh.position.y; // Hauteur du centre du corps
                this.model.lookAt(nextPoint);

            } else {
                 // Si chemin d'un seul point, juste s'y mettre et considérer terminé.
                 this.model.position.copy(this.path[0]);
                 this.model.position.y = this.path[0].y;
                 this.path = null; // Chemin terminé
            }
        } else {
            // Pas de chemin ou chemin terminé
            this.path = null;
            this.currentPathIndex = 0;
        }
    }

    /**
     * Applique une animation simple de flottement aux membres.
     * @param {number} timeElapsed Temps total écoulé en millisecondes.
     */
    animateFloatingLimbs(timeElapsed) {
        const bobbleSpeed = 3; // Vitesse du flottement
        const bobbleAmount = 0.1; // Amplitude du flottement

        const timeInSeconds = timeElapsed / 1000;

        // Flottement vertical simple pour les mains et pieds
        this.limbs.forEach((limb, index) => {
            if (limb) {
                // Décalage de phase pour ne pas qu'ils bougent tous en même temps
                const phaseOffset = index * (Math.PI / 4);
                limb.position.y = limb.userData.initialY + Math.sin(timeInSeconds * bobbleSpeed + phaseOffset) * bobbleAmount;
            }
        });
         // Flottement pour la tête
         if (this.headMesh) {
            this.headMesh.position.y = this.headMesh.userData.initialY + Math.sin(timeInSeconds * bobbleSpeed * 0.8) * bobbleAmount * 0.5; // Moins ample/rapide
        }
    }

    update(deltaTime) {
        // --- Animation procédurale simple ---
        if (!this.headMesh.userData.initialY) { // Initialiser les positions Y de base une seule fois
            this.headMesh.userData.initialY = this.headMesh.position.y;
            this.limbs.forEach(limb => { if(limb) limb.userData.initialY = limb.position.y; });
        }
        this.animateFloatingLimbs(this.experience.time.elapsed);
        // ------------------------------------

        // Logique de déplacement (si un chemin est défini)
        if (!this.path || this.currentPathIndex >= this.path.length) {
            return; // Pas de chemin ou chemin terminé
        }

        const targetPosition = this.path[this.currentPathIndex];
        const currentPosition = this.model.position;

        // Comparaison sur XZ pour la distance
        const distanceToTargetXZ = Math.sqrt(
            Math.pow(targetPosition.x - currentPosition.x, 2) +
            Math.pow(targetPosition.z - currentPosition.z, 2)
        );

        // Distance à parcourir ce frame
        const moveDistance = this.speed * (deltaTime / 1000);

        if (distanceToTargetXZ <= this.reachTolerance || distanceToTargetXZ < moveDistance) {
            // Atteint la cible : se positionner exactement et passer au point suivant
            // Copier X et Z, garder Y courant (ou celui de la target, qui doit être le même)
            currentPosition.x = targetPosition.x;
            currentPosition.z = targetPosition.z;
            currentPosition.y = targetPosition.y; // Assurer la hauteur exacte
            this.currentPathIndex++;

            if (this.currentPathIndex < this.path.length) {
                // Regarder vers le point suivant
                const nextPoint = this.path[this.currentPathIndex].clone();
                 // Regarder à la hauteur du centre du corps
                nextPoint.y = this.model.position.y + this.bodyMesh.position.y;
                this.model.lookAt(nextPoint);

            } else {
                // Chemin terminé
                this.path = null; // Réinitialiser
            }
        } else {
            // Se déplacer vers la cible
            const direction = targetPosition.clone().sub(currentPosition);
            direction.y = 0; // Mouvement uniquement sur XZ
            direction.normalize();
            this.model.position.addScaledVector(direction, moveDistance);

            // S'assurer que Y reste constant (hauteur du trottoir/chemin)
            this.model.position.y = targetPosition.y;

            // Orientation gérée lors du changement de point cible pour éviter saccades
        }
    }

    destroy() {
        // Retirer le groupe modèle de la scène
        if (this.model && this.model.parent) {
            this.scene.remove(this.model);
        }

        // Disposer les géométries uniques créées
        this.geometries.forEach(geom => geom.dispose());

        // Disposer les matériaux uniques créés
        this.materials.forEach(mat => mat.dispose());

        // Nullifier les références
        this.model = null;
        this.scene = null;
        this.experience = null;
        this.path = null;
        this.bodyMesh = null;
        this.headMesh = null;
        this.leftHandMesh = null;
        this.rightHandMesh = null;
        this.leftFootMesh = null;
        this.rightFootMesh = null;
        this.limbs = [];
        this.geometries = [];
        this.materials = [];
        // console.log(`Agent ${this.id} (Rayman) détruit.`);
    }
}