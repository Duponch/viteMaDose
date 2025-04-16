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
        this.moveDuration = 200; // Durée par défaut de l'animation (ms)
        this.moveStartPosition = new THREE.Vector3();
        this.moveStartLookAt = new THREE.Vector3(); // Pour interpoler le lookAt aussi
        this.moveToTargetPosition = new THREE.Vector3();
        this.moveLookAtTargetPosition = new THREE.Vector3();
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

    // --- NOUVELLE MÉTHODE ---
    /**
     * Démarre une animation pour déplacer la caméra vers une cible.
     * @param {THREE.Vector3} targetCamPos Position cible de la caméra.
     * @param {THREE.Vector3} targetLookAt Point cible que la caméra doit regarder.
     * @param {number} [duration=1000] Durée de l'animation en millisecondes.
     */
    moveToTarget(targetCamPos, targetLookAt, duration = 1000) {
        console.log("Camera: Starting move to target.");
        this.isMovingToTarget = true;
        this.isFollowing = false; // Arrêter le suivi d'agent si actif
        this.targetAgent = null; // Désélectionner l'agent suivi
        this._removeEventListeners(); // Arrêter la rotation souris pendant l'anim

        this.moveStartTime = this.experience.time.current; // Utilise le temps de Experience
        this.moveDuration = duration;

        this.moveStartPosition.copy(this.instance.position); // Position de départ actuelle
        // Pour le point de départ du lookAt, on prend la cible actuelle des OrbitControls
        // ou le point que la caméra regarde si les contrôles ne sont pas actifs
        if (this.experience.controls && this.experience.controls.enabled) {
             this.moveStartLookAt.copy(this.experience.controls.target);
        } else {
             // Calculer le point regardé actuel si pas d'OrbitControls target
             const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.instance.quaternion);
             this.moveStartLookAt.copy(this.instance.position).add(lookDirection.multiplyScalar(10)); // Point arbitraire devant
        }


        this.moveToTargetPosition.copy(targetCamPos);
        this.moveLookAtTargetPosition.copy(targetLookAt);

        // Réactiver OrbitControls pour que l'utilisateur puisse reprendre la main après
        if (this.experience.controls) {
             this.experience.controls.enabled = true;
             // Optionnel : Désactiver le damping temporairement ?
             // this.experience.controls.enableDamping = false;
        }
    }
    // --- FIN NOUVELLE MÉTHODE ---

    followAgent(agent) {
        if (!agent) return;
        console.log("Camera: Starting follow agent.");
        this.targetAgent = agent;
        this.isFollowing = true;
        this.isMovingToTarget = false; // Arrêter l'animation si active
        this.isMouseLookingActive = true;
        this.isLeftMouseDown = false;

        // ... (reste du code followAgent existant) ...
        const direction = new THREE.Vector3().subVectors(this.instance.position, agent.position).normalize();
        this.mouseYaw = Math.atan2(direction.x, direction.z);
        this.mousePitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        this.mousePitch = THREE.MathUtils.clamp(this.mousePitch, this.minPitch, this.maxPitch);

        this.updateFollowLogic(1.0); // Snap initial
        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.targetLookAtPosition);

        this._addEventListeners();
    }

    stopFollowing() {
        console.log("Camera: Stopping follow.");
        this.targetAgent = null;
        this.isFollowing = false;
        this.isMouseLookingActive = false;
        this.isLeftMouseDown = false;
        this.isMovingToTarget = false; // Assurer que l'animation est aussi arrêtée
        this._removeEventListeners();
        // Réactiver OrbitControls quand on arrête de suivre
        if (this.experience.controls) {
             this.experience.controls.enabled = true;
             // this.experience.controls.enableDamping = true; // Réactiver si désactivé
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

            // --- Optionnel: Ajouter un easing (ex: easeOutQuart) ---
            // progress = 1 - Math.pow(1 - progress, 4);

            // Interpolation linéaire (LERP) pour la position
            this.instance.position.lerpVectors(this.moveStartPosition, this.moveToTargetPosition, progress);

            // Interpolation linéaire (LERP) pour le point regardé
            const currentLookAt = new THREE.Vector3().lerpVectors(this.moveStartLookAt, this.moveLookAtTargetPosition, progress);
            this.instance.lookAt(currentLookAt);

             // Mettre à jour la cible des OrbitControls pendant l'animation
             if (this.experience.controls) {
                this.experience.controls.target.copy(currentLookAt);
             }

            // Fin de l'animation
            if (progress >= 1.0) {
                this.isMovingToTarget = false;
                console.log("Camera: Move to target finished.");
                // Assurer la position et la cible finales
                this.instance.position.copy(this.moveToTargetPosition);
                this.instance.lookAt(this.moveLookAtTargetPosition);
                if (this.experience.controls) {
                    this.experience.controls.target.copy(this.moveLookAtTargetPosition); // Cible finale pour controls
                    // this.experience.controls.enableDamping = true; // Réactiver damping si désactivé
                }
            }
        }
        // Priorité 2: Suivi d'agent (si pas en animation)
        else if (this.isFollowing && this.targetAgent) {
            const deltaTimeSeconds = deltaTime / 1000.0;
            this.updateFollowLogic(deltaTimeSeconds);
             // OrbitControls est désactivé pendant le suivi
        }
        // Priorité 3: OrbitControls (si ni animation, ni suivi)
        // Note: OrbitControls.update() est appelé dans Experience.js pour ne pas interférer ici
    }
    // --- FIN MODIFICATION ---

    destroy() {
        this._removeEventListeners();
        console.log("Camera listeners removed.");
    }
}