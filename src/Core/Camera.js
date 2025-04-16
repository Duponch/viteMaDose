// src/Core/Camera.js
import * as THREE from 'three';

// IMPORTANT: Pas de 'let instance = null;' ici, le singleton est géré dans Experience.js

export default class Camera {
    constructor(experience) {
        this.experience = experience;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        // --- État et cibles de suivi (EXISTANT) ---
        this.isFollowing = false;
        this.targetAgent = null;
        this.followSpeed = 4.0;

        // --- Contrôle Souris Pendant Suivi (EXISTANT) ---
        this.isMouseLookingActive = false;
        this.mouseYaw = 0;
        this.mousePitch = 0.3;
        this.mouseSensitivityX = 0.005;
        this.mouseSensitivityY = 0.005;
        this.followDistance = 8;
        this.minPitch = -Math.PI / 2 + 0.1;
        this.maxPitch = Math.PI / 2 - 0.1;
        this.isLeftMouseDown = false;

        // --- Vecteurs temporaires (EXISTANT) ---
        this.currentPosition = new THREE.Vector3();
        this.targetLookAtPosition = new THREE.Vector3();
        this.worldAgentPosition = new THREE.Vector3();
        this.desiredCameraPosition = new THREE.Vector3();

        // --- NOUVEAU : État et cibles pour l'animation "moveToTarget" ---
        this.isMovingToTarget = false;
        this.moveStartTime = 0;
        this.moveDuration = 1000; // Durée par défaut
        this.moveStartPosition = new THREE.Vector3();
        this.moveStartLookAt = new THREE.Vector3();
        this.moveToTargetPosition = new THREE.Vector3();
        this.moveLookAtTargetPosition = new THREE.Vector3();
        this.agentToFollowAfterMove = null; // <-- NOUVELLE PROPRIÉTÉ
        // --- FIN NOUVEAU ---

        this.setInstance();

        this._boundHandleMouseMove = this._handleMouseMove.bind(this);
        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this);
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            45,
            this.sizes.width / this.sizes.height,
            0.1,
            3000
        );
        this.instance.position.set(80, 80, 80);
        this.scene.add(this.instance);

        this.currentPosition.copy(this.instance.position);
        // Calcul initial du point regardé basé sur la position initiale
        // Regarde vers l'origine par défaut
        this.targetLookAtPosition.set(0, 0, 0);
        this.instance.lookAt(this.targetLookAtPosition);
        // Stocker la cible initiale pour l'animation
        this.moveStartLookAt.copy(this.targetLookAtPosition);
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }

   /**
     * Démarre une animation pour déplacer la caméra vers une cible.
     * @param {THREE.Vector3} targetCamPos Position cible de la caméra.
     * @param {THREE.Vector3} targetLookAt Point cible que la caméra doit regarder.
     * @param {number} [duration=1000] Durée de l'animation en millisecondes.
     * @param {object | null} [agentToFollow=null] L'agent à suivre après la fin de l'animation.
     */
   moveToTarget(targetCamPos, targetLookAt, duration = 1000, agentToFollow = null) { // <-- AJOUT agentToFollow
		console.log(`Camera: Starting move to target. Follow after: ${agentToFollow ? agentToFollow.id : 'None'}`);
		this.isMovingToTarget = true;
		this.isFollowing = false; // Arrêter le suivi d'agent si actif
		this.targetAgent = null; // Désélectionner l'agent suivi actuel
		this.agentToFollowAfterMove = agentToFollow; // <-- STOCKER l'agent à suivre
		this._removeEventListeners(); // Arrêter la rotation souris pendant l'anim

		this.moveStartTime = this.experience.time.current;
		this.moveDuration = duration > 0 ? duration : 1; // Éviter durée 0

		this.moveStartPosition.copy(this.instance.position);

		// Calcul point de départ LookAt (inchangé)
		if (this.experience.controls && this.experience.controls.enabled) {
			this.moveStartLookAt.copy(this.experience.controls.target);
		} else {
			const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.instance.quaternion);
			// Calculer un point plus précis si possible
			if (this.targetLookAtPosition) { // Si on avait une cible précédente (ex: suivi agent)
				this.moveStartLookAt.copy(this.targetLookAtPosition);
			} else { // Sinon, un point devant
				this.moveStartLookAt.copy(this.instance.position).add(lookDirection.multiplyScalar(10));
			}
		}

		this.moveToTargetPosition.copy(targetCamPos);
		this.moveLookAtTargetPosition.copy(targetLookAt);

		// Ne PAS réactiver OrbitControls ici, on le fera seulement si on ne suit pas après
		// if (this.experience.controls) {
		//      this.experience.controls.enabled = true; // <- Supprimé ici
		// }
	}
    // --- FIN NOUVELLE MÉTHODE ---

    followAgent(agent) {
        if (!agent) return;
        // Si on est déjà en train de suivre cet agent, ne rien faire (peut être retiré si moveToTarget désactive toujours le suivi avant)
        // if (this.isFollowing && this.targetAgent === agent) return;

        console.log(`Camera: Initializing follow for agent ${agent.id}.`);
        this.targetAgent = agent;
        this.isFollowing = true;
        this.isMovingToTarget = false; // S'assurer que l'autre mode est arrêté
        this.agentToFollowAfterMove = null; // Nettoyer au cas où
        this.isMouseLookingActive = true;
        this.isLeftMouseDown = false;

        // Désactiver OrbitControls explicitement
        if (this.experience.controls) {
             this.experience.controls.enabled = false;
        }

        // --- CORRECTION START ---
        // 1. Obtenir la position ACTUELLE de l'agent
        this.worldAgentPosition.copy(this.targetAgent.position);

        // 2. Calculer la cible du regard (légèrement au-dessus de l'agent)
        this.targetLookAtPosition.copy(this.worldAgentPosition).add(new THREE.Vector3(0, 1.0, 0)); // 1.0 est un offset arbitraire

        // 3. Calculer le yaw/pitch initial basé sur la position FINALE de la caméra
        //    (là où moveToTarget vient de se terminer) et la position ACTUELLE de l'agent.
        const direction = new THREE.Vector3().subVectors(this.instance.position, this.targetLookAtPosition).normalize();
        this.mouseYaw = Math.atan2(direction.x, direction.z);
        // Clamp pitch initial pour éviter problèmes aux pôles
        this.mousePitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        this.mousePitch = THREE.MathUtils.clamp(this.mousePitch, this.minPitch, this.maxPitch);

        // 4. Calculer IMMÉDIATEMENT la position désirée de la caméra pour le suivi
        //    en utilisant la logique de updateFollowLogic mais sans LERP.
        const offsetX = this.followDistance * Math.sin(this.mouseYaw) * Math.cos(this.mousePitch);
        const offsetY = this.followDistance * Math.sin(this.mousePitch);
        const offsetZ = this.followDistance * Math.cos(this.mouseYaw) * Math.cos(this.mousePitch);
        // La position désirée est relative à la CIBLE du REGARD (targetLookAtPosition)
        this.desiredCameraPosition.copy(this.targetLookAtPosition).add(new THREE.Vector3(offsetX, offsetY, offsetZ));

        // 5. Appliquer DIRECTEMENT cette position à la caméra et à l'état interne currentPosition
        //    Cela évite le LERP initial dans la première frame de updateFollowLogic.
        this.instance.position.copy(this.desiredCameraPosition);
        this.currentPosition.copy(this.desiredCameraPosition); // Synchroniser l'état interne

        // 6. Faire regarder la caméra immédiatement vers la cible
        this.instance.lookAt(this.targetLookAtPosition);

        // 7. Mettre à jour la cible OrbitControls pour une transition douce si on arrête le suivi
        if (this.experience.controls) {
           this.experience.controls.target.copy(this.targetLookAtPosition);
        }
        // --- CORRECTION END ---

        // Ajouter les listeners pour le contrôle souris pendant le suivi
        this._addEventListeners();
        console.log(`Camera: Now following agent ${agent.id} from calculated position.`);
    }

    stopFollowing() {
        // Se déclenche si on désélectionne l'agent ou si l'on sélectionne autre chose
        if (!this.isFollowing && !this.isMovingToTarget) {
            // Si ni en suivi, ni en transition, vérifier quand même l'état des contrôles
            if (this.experience.controls && !this.experience.controls.enabled) {
                console.log("Camera.stopFollowing: Controls were disabled, re-enabling.");
                 this.experience.controls.enabled = true;
            }
            return; // Rien à arrêter
        }

        console.log("Camera: Stopping follow/move sequence.");
        this.targetAgent = null;
        this.isFollowing = false;
        this.isMouseLookingActive = false;
        this.isLeftMouseDown = false;
        this.isMovingToTarget = false; // Assurer que l'animation moveToTarget est aussi arrêtée
        this.agentToFollowAfterMove = null; // Nettoyer l'agent potentiel
        this._removeEventListeners(); // Retirer les listeners souris

        // Réactiver OrbitControls
        if (this.experience.controls) {
             this.experience.controls.enabled = true;
             console.log("Camera.stopFollowing: OrbitControls enabled.");
             // Peut-être recentrer la cible des contrôles ?
             // this.experience.controls.target.copy(this.instance.position).add(this.instance.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
             // this.experience.controls.update(); // Forcer MAJ si besoin
        }
    }

    _addEventListeners() {
        document.addEventListener('mousemove', this._boundHandleMouseMove, false);
        document.addEventListener('mousedown', this._boundHandleMouseDown, false);
        document.addEventListener('mouseup', this._boundHandleMouseUp, false);
    }

    _removeEventListeners() {
        document.removeEventListener('mousemove', this._boundHandleMouseMove, false);
        document.removeEventListener('mousedown', this._boundHandleMouseDown, false);
        document.removeEventListener('mouseup', this._boundHandleMouseUp, false);
    }

    _handleMouseDown(event) {
        // Modifié : Ne s'active que si on suit activement (pas pendant moveToTarget)
        if (this.isMouseLookingActive && this.isFollowing && event.button === 0) {
            this.isLeftMouseDown = true;
        }
    }

    _handleMouseUp(event) {
       // Modifié : Ne s'active que si on suit activement
        if (this.isMouseLookingActive && this.isFollowing && event.button === 0) {
            this.isLeftMouseDown = false;
        }
    }

    _handleMouseMove(event) {
        // Modifié : Ne s'active que si on suit activement ET clic enfoncé
        if (!this.isMouseLookingActive || !this.isFollowing || !this.isLeftMouseDown) {
            return;
        }
        // ... (calcul yaw/pitch existant) ...
        const deltaX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const deltaY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        this.mouseYaw -= deltaX * this.mouseSensitivityX;
        this.mousePitch -= deltaY * this.mouseSensitivityY;
        this.mousePitch = THREE.MathUtils.clamp(this.mousePitch, this.minPitch, this.maxPitch);
    }

    // --- MODIFIÉ : Logique de suivi d'agent ---
    updateFollowLogic(deltaTimeSeconds) {
        if (!this.targetAgent) return;

        this.worldAgentPosition.copy(this.targetAgent.position);
        // La cible du regard est légèrement au-dessus de l'agent
        this.targetLookAtPosition.copy(this.worldAgentPosition).add(new THREE.Vector3(0, 1.0, 0));

        // Calcul de la position désirée basée sur yaw/pitch/distance souris
        const offsetX = this.followDistance * Math.sin(this.mouseYaw) * Math.cos(this.mousePitch);
        const offsetY = this.followDistance * Math.sin(this.mousePitch);
        const offsetZ = this.followDistance * Math.cos(this.mouseYaw) * Math.cos(this.mousePitch);
        this.desiredCameraPosition.copy(this.targetLookAtPosition).add(new THREE.Vector3(offsetX, offsetY, offsetZ));

        // Interpolation LERP pour la position de la caméra
        const lerpAlpha = 1.0 - Math.exp(-this.followSpeed * deltaTimeSeconds);
        this.currentPosition.lerp(this.desiredCameraPosition, lerpAlpha);

        // Appliquer la position et regarder la cible
        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.targetLookAtPosition);

         // Mettre à jour la cible des OrbitControls pour une transition douce si l'utilisateur reprend la main
         if (this.experience.controls) {
            this.experience.controls.target.copy(this.targetLookAtPosition);
         }
    }
    // --- FIN MODIFICATION ---

    // --- MODIFIÉ : Boucle de mise à jour principale ---
    update(deltaTime) {
        // Priorité 1: Animation moveToTarget
        if (this.isMovingToTarget) {
            const currentTime = this.experience.time.current;
            const elapsedTime = currentTime - this.moveStartTime;
            let progress = Math.min(1.0, elapsedTime / this.moveDuration);

            // --- Optionnel: Easing (inchangé) ---
            // progress = 1 - Math.pow(1 - progress, 4);

            // Interpolation position et lookAt (inchangé)
            this.instance.position.lerpVectors(this.moveStartPosition, this.moveToTargetPosition, progress);
            const currentLookAt = new THREE.Vector3().lerpVectors(this.moveStartLookAt, this.moveLookAtTargetPosition, progress);
            this.instance.lookAt(currentLookAt);

            // Mettre à jour la cible des OrbitControls PENDANT l'animation (inchangé)
            if (this.experience.controls) {
                this.experience.controls.target.copy(currentLookAt);
             }

            // Fin de l'animation
            if (progress >= 1.0) {
                this.isMovingToTarget = false;
                console.log("Camera: Move to target finished.");

                // Assurer la position et la cible finales (inchangé)
                this.instance.position.copy(this.moveToTargetPosition);
                this.instance.lookAt(this.moveLookAtTargetPosition);
                if (this.experience.controls) {
                    this.experience.controls.target.copy(this.moveLookAtTargetPosition);
                }

                // --- NOUVEAU : Démarrer le suivi si un agent est spécifié ---
                if (this.agentToFollowAfterMove) {
                    console.log(`Camera: Transition finished, starting follow for agent ${this.agentToFollowAfterMove.id}`);
                    const agentToFollow = this.agentToFollowAfterMove;
                    this.agentToFollowAfterMove = null; // Réinitialiser

                    // Appeler followAgent pour configurer le mode suivi
                    // (followAgent désactive les controls et active les listeners)
                    this.followAgent(agentToFollow);

                } else {
                    // Si aucun agent n'est à suivre, réactiver OrbitControls
                    console.log("Camera: Transition finished, no agent to follow, enabling OrbitControls.");
                    if (this.experience.controls) {
                        this.experience.controls.enabled = true;
                         // Assurer que la cible des contrôles est correcte
                         this.experience.controls.target.copy(this.moveLookAtTargetPosition);
                    }
                }
                // --- FIN NOUVEAU ---
            }
        }
        // Priorité 2: Suivi d'agent (si pas en animation `moveToTarget`)
        else if (this.isFollowing && this.targetAgent) {
            const deltaTimeSeconds = deltaTime / 1000.0;
            this.updateFollowLogic(deltaTimeSeconds);
            // OrbitControls est désactivé pendant le suivi par followAgent()
        }
        // Priorité 3: OrbitControls (géré dans Experience.js)
    }
    // --- FIN MODIFICATION ---

    destroy() {
        this._removeEventListeners();
        console.log("Camera listeners removed.");
    }
}