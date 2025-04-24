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

        // --- NOUVEAU : Paramètres de zoom ---
        this.minFollowDistance = 4;
        this.maxFollowDistance = 150;
        this.zoomSpeed = 0.1;
        // --- FIN NOUVEAU ---

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
        // --- NOUVEAU : Lier la méthode de la molette ---
        this._boundHandleMouseWheel = this._handleMouseWheel.bind(this);
        // --- FIN NOUVEAU ---
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
   moveToTarget(targetCamPos, targetLookAt, duration = 1000, agentToFollow = null) {
        console.log(`Camera: Starting move to target. Follow after: ${agentToFollow ? agentToFollow.id : 'None'}`);
        this.isMovingToTarget = true;
        this.isFollowing = false;
        this.targetAgent = null;
        this.agentToFollowAfterMove = agentToFollow;
        this._removeEventListeners();

        this.moveStartTime = this.experience.time.current;
        this.moveDuration = duration > 0 ? duration : 1;

        // Sauvegarder la position et orientation actuelles
        this.moveStartPosition.copy(this.instance.position);
        
        // Calculer le point de départ du regard
        if (this.experience.controls && this.experience.controls.enabled) {
            this.moveStartLookAt.copy(this.experience.controls.target);
        } else {
            const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.instance.quaternion);
            if (this.targetLookAtPosition) {
                this.moveStartLookAt.copy(this.targetLookAtPosition);
            } else {
                this.moveStartLookAt.copy(this.instance.position).add(lookDirection.multiplyScalar(10));
            }
        }

        // Sauvegarder les positions cibles
        this.moveToTargetPosition.copy(targetCamPos);
        this.moveLookAtTargetPosition.copy(targetLookAt);

        // Désactiver les contrôles pendant la transition
        if (this.experience.controls) {
            this.experience.controls.enabled = false;
        }
    }

    followAgent(agent) {
        if (!agent) return;

        console.log(`Camera: Initializing follow for agent ${agent.id}.`);
        this.targetAgent = agent;
        this.isFollowing = true;
        this.isMovingToTarget = false;
        this.agentToFollowAfterMove = null;
        this.isMouseLookingActive = true;
        this.isLeftMouseDown = false;

        // Désactiver OrbitControls explicitement
        if (this.experience.controls) {
            this.experience.controls.enabled = false;
        }

        // --- NOUVEAU : Position initiale standardisée ---
        // 1. Obtenir la position de l'agent
        this.worldAgentPosition.copy(this.targetAgent.position);

        // 2. Calculer la cible du regard (légèrement au-dessus de l'agent)
        this.targetLookAtPosition.copy(this.worldAgentPosition).add(new THREE.Vector3(0, 1.0, 0));

        // 3. Définir une position initiale standardisée (derrière l'agent)
        // Utiliser l'orientation de l'agent pour positionner la caméra derrière lui
        const agentOrientation = this.targetAgent.orientation;
        const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(agentOrientation);
        
        // Position initiale standardisée
        this.followDistance = 8; // Distance initiale standard
        this.mousePitch = 0.3; // Angle de vue initial standard
        this.mouseYaw = Math.atan2(backward.x, backward.z); // Aligné avec l'orientation de l'agent

        // 4. Calculer la position initiale de la caméra
        const offsetX = this.followDistance * Math.sin(this.mouseYaw) * Math.cos(this.mousePitch);
        const offsetY = this.followDistance * Math.sin(this.mousePitch);
        const offsetZ = this.followDistance * Math.cos(this.mouseYaw) * Math.cos(this.mousePitch);
        
        this.desiredCameraPosition.copy(this.targetLookAtPosition).add(new THREE.Vector3(offsetX, offsetY, offsetZ));
        this.currentPosition.copy(this.desiredCameraPosition);
        this.instance.position.copy(this.desiredCameraPosition);
        this.instance.lookAt(this.targetLookAtPosition);

        // 5. Mettre à jour la cible des OrbitControls
        if (this.experience.controls) {
            this.experience.controls.target.copy(this.targetLookAtPosition);
        }
        // --- FIN NOUVEAU ---

        // Ajouter les listeners pour le contrôle souris
        this._addEventListeners();
        console.log(`Camera: Now following agent ${agent.id} from standardized position.`);
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
        // --- NOUVEAU : Ajouter l'écouteur de la molette ---
        window.addEventListener('wheel', this._boundHandleMouseWheel);
        // --- FIN NOUVEAU ---
    }

    _removeEventListeners() {
        document.removeEventListener('mousemove', this._boundHandleMouseMove, false);
        document.removeEventListener('mousedown', this._boundHandleMouseDown, false);
        document.removeEventListener('mouseup', this._boundHandleMouseUp, false);
        // --- NOUVEAU : Retirer l'écouteur de la molette ---
        window.removeEventListener('wheel', this._boundHandleMouseWheel);
        // --- FIN NOUVEAU ---
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

    _handleMouseWheel(event) {
        if (!this.isFollowing || !this.targetAgent) return;
        
        // Ajuster la distance de suivi en fonction de la molette
        const delta = event.deltaY * this.zoomSpeed;
        this.followDistance = THREE.MathUtils.clamp(
            this.followDistance + delta,
            this.minFollowDistance,
            this.maxFollowDistance
        );
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

        // Utiliser le temps réel pour l'interpolation, indépendamment de la vitesse du jeu
        const realDeltaTime = this.experience.time.delta / 1000.0;
        const lerpAlpha = 1.0 - Math.exp(-this.followSpeed * realDeltaTime);
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

            // Utiliser une fonction d'easing pour une transition plus naturelle
            progress = this._easeInOutCubic(progress);

            // Interpolation position et lookAt
            this.instance.position.lerpVectors(this.moveStartPosition, this.moveToTargetPosition, progress);
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
                    this.experience.controls.target.copy(this.moveLookAtTargetPosition);
                }

                // Démarrer le suivi si un agent est spécifié
                if (this.agentToFollowAfterMove) {
                    console.log(`Camera: Transition finished, starting follow for agent ${this.agentToFollowAfterMove.id}`);
                    const agentToFollow = this.agentToFollowAfterMove;
                    this.agentToFollowAfterMove = null;
                    this.followAgent(agentToFollow);
                } else {
                    // Si aucun agent n'est à suivre, réactiver OrbitControls
                    console.log("Camera: Transition finished, no agent to follow, enabling OrbitControls.");
                    if (this.experience.controls) {
                        this.experience.controls.enabled = true;
                        this.experience.controls.target.copy(this.moveLookAtTargetPosition);
                    }
                }
            }
        }
        // Priorité 2: Suivi d'agent
        else if (this.isFollowing && this.targetAgent) {
            const deltaTimeSeconds = deltaTime / 1000.0;
            this.updateFollowLogic(deltaTimeSeconds);
        }
    }

    _easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    destroy() {
        this._removeEventListeners();
        console.log("Camera listeners removed.");
    }
}