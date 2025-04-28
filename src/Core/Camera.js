// src/Core/Camera.js
import * as THREE from 'three';

export default class Camera {
    constructor(experience) {
        this.experience = experience;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        // --- État et cibles de suivi (EXISTANT) ---
        this.isFollowing = false;
        this.targetAgent = null;
        this.followSpeed = 4.0; // Vitesse de LERP pour le suivi

        // --- Contrôle Souris Pendant Suivi (EXISTANT) ---
        this.isMouseLookingActive = false;
        this.mouseYaw = 0;
        this.mousePitch = 0.3; // Angle initial (un peu au-dessus)
        this.mouseSensitivityX = 0.005;
        this.mouseSensitivityY = 0.005;
        this.followDistance = 8;
        this.minFollowDistance = 3;
        this.maxFollowDistance = 50;
        this.minPitch = -Math.PI / 2 + 0.1; // Limite basse (presque verticale vers le bas)
        this.maxPitch = Math.PI / 2 - 0.1; // Limite haute (presque verticale vers le haut)
        this.isLeftMouseDown = false;

        // --- Positions et cibles de travail (EXISTANT) ---
        this.currentPosition = new THREE.Vector3(); // Position actuelle (interpolée)
        this.desiredCameraPosition = new THREE.Vector3(); // Position cible idéale pour le suivi
        this.worldAgentPosition = new THREE.Vector3(); // Copie de la position de l'agent
        this.targetLookAtPosition = new THREE.Vector3(); // Point regardé (légèrement au-dessus de l'agent)

        // --- Animation moveToTarget (EXISTANT) ---
        this.isMovingToTarget = false;
        this.moveStartTime = 0; // Reste utile pour référence, mais pas pour le calcul de progression
        this.moveElapsedTimeUnscaled = 0; // NOUVEAU: Accumulateur de temps non-échelonné
        this.moveDuration = 1000; // Durée par défaut
        this.moveStartCamPos = new THREE.Vector3();
        this.moveStartLookAt = new THREE.Vector3();
        this.moveToTargetPosition = new THREE.Vector3();
        this.moveLookAtTargetPosition = new THREE.Vector3();
        this.agentToFollowAfterMove = null; // Agent à suivre APRÈS l'animation

        // --- Vecteurs temporaires pour calculs (EXISTANT) ---
        this._tempV3 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();

        this.setInstance();

        // Lier les méthodes pour les listeners
        this._boundHandleMouseMove = this._handleMouseMove.bind(this);
        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this);
        this._boundHandleMouseWheel = this._handleMouseWheel.bind(this);
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
        this.targetLookAtPosition.set(0, 0, 0);
        this.instance.lookAt(this.targetLookAtPosition);
        this.moveStartLookAt.copy(this.targetLookAtPosition);
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }

    moveToTarget(targetCamPos, targetLookAt, duration = 1000, agentToFollow = null) {
        this.isMovingToTarget = true;
        this.moveStartTime = this.experience.time.current; // Temps de départ (pour référence)
        this.moveElapsedTimeUnscaled = 0; // Réinitialiser l'accumulateur de temps
        this.moveDuration = duration;
        this.agentToFollowAfterMove = agentToFollow;
        this.isFollowing = false;
        this.targetAgent = null;
        this._removeEventListeners();

        this.moveStartCamPos.copy(this.instance.position);

        if (this.targetLookAtPosition && this.isFollowing) {
            this.moveStartLookAt.copy(this.targetLookAtPosition);
        } else {
            const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.instance.quaternion);
            // S'assurer que moveStartLookAt est bien défini, sinon utiliser une projection
            if (this.moveStartLookAt) {
                 this.moveStartLookAt.copy(this.instance.position).add(lookDirection.multiplyScalar(10));
            } else {
                 this.moveStartLookAt = this.instance.position.clone().add(lookDirection.multiplyScalar(10));
            }
        }

        this.moveToTargetPosition.copy(targetCamPos);
        this.moveLookAtTargetPosition.copy(targetLookAt);

        if (this.experience.controls) {
            this.experience.controls.enabled = false;
        }
    }

    _easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    update(deltaTime) {
        // Priorité 1: Animation moveToTarget
        if (this.isMovingToTarget) {
            // --- MODIFIÉ : Utilisation du temps non-échelonné --- 
            // Accumuler le temps réel écoulé depuis la dernière frame
            this.moveElapsedTimeUnscaled += this.experience.time.unscaledDelta; // Utilise unscaledDelta
            // Calculer la progression basée sur le temps accumulé et la durée
            let progress = Math.min(1.0, this.moveElapsedTimeUnscaled / this.moveDuration);
            // --- FIN MODIFICATION ---

            // Utiliser une fonction d'easing pour une transition plus naturelle
            progress = this._easeInOutCubic(progress);

            // Interpoler la position et le point regardé
            const newCamPos = this._tempV3.lerpVectors(this.moveStartCamPos, this.moveToTargetPosition, progress);
            const newLookAt = this._tempV3_2.lerpVectors(this.moveStartLookAt, this.moveLookAtTargetPosition, progress);

            this.instance.position.copy(newCamPos);
            this.instance.lookAt(newLookAt);
            this.currentPosition.copy(newCamPos); // Garder currentPosition synchronisé
            this.targetLookAtPosition.copy(newLookAt); // Garder targetLookAtPosition synchronisé

            // Si l'animation est terminée
            if (progress >= 1.0) {
                this.isMovingToTarget = false;
                this.moveElapsedTimeUnscaled = 0; // Nettoyer l'accumulateur
                console.log(`Camera: Move finished. ${this.agentToFollowAfterMove ? 'Starting follow for ' + this.agentToFollowAfterMove.id : 'Move complete, no follow.'}`);

                // --- Transition directe vers le suivi (code précédent) --- 
                if (this.agentToFollowAfterMove) {
                    this.targetAgent = this.agentToFollowAfterMove;
                    this.agentToFollowAfterMove = null;
                    this.isFollowing = true;
                    this.isMouseLookingActive = true;
                    // --- AJOUT : Assurer que le clic souris est considéré comme relâché --- 
                    this.isLeftMouseDown = false; 
                    // --- FIN AJOUT ---
                    this._addEventListeners();

                    const agentPos = this.targetAgent.position;
                    const camOffset = this._tempV3.copy(this.instance.position).sub(agentPos);
                    
                    this.followDistance = camOffset.length();
                    camOffset.normalize();

                    this.mousePitch = Math.asin(camOffset.y);
                    this.mousePitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.mousePitch));

                    this.mouseYaw = Math.atan2(-camOffset.x, -camOffset.z);

                    console.log(`Camera: Follow initialized from transition end. Yaw: ${this.mouseYaw.toFixed(2)}, Pitch: ${this.mousePitch.toFixed(2)}, Dist: ${this.followDistance.toFixed(2)}`);

                } else {
                    if (this.experience.controls) {
                        this.experience.controls.enabled = true;
                        this.experience.controls.target.copy(this.moveLookAtTargetPosition);
                        console.log("Camera: OrbitControls re-enabled.");
                    }
                }
            }
        }
        // Priorité 2: Suivi d'agent (si pas en animation moveToTarget)
        else if (this.isFollowing && this.targetAgent) {
            // --- MODIFIÉ : Utilisation du temps non-échelonné pour le LERP --- 
            // Le LERP doit aussi être fluide même en pause/ralenti
            const unscaledDeltaTimeSeconds = this.experience.time.unscaledDelta / 1000.0;
            this.updateFollowLogic(unscaledDeltaTimeSeconds);
            // --- FIN MODIFICATION ---
        }
    }

    // --- Logique de suivi d'agent (utilise maintenant le delta non-échelonné) ---
    updateFollowLogic(unscaledDeltaTimeSeconds) {
        if (!this.targetAgent) return;

        this.worldAgentPosition.copy(this.targetAgent.position);

        const lookAtHeightOffset = this.targetAgent.isDriving ? 1.5 : 1.0;
        this.targetLookAtPosition.copy(this.worldAgentPosition).add(new THREE.Vector3(0, lookAtHeightOffset, 0));

        const desiredOffset = new THREE.Vector3();
        desiredOffset.x = Math.sin(this.mouseYaw) * Math.cos(this.mousePitch);
        desiredOffset.y = Math.sin(this.mousePitch);
        desiredOffset.z = Math.cos(this.mouseYaw) * Math.cos(this.mousePitch);
        desiredOffset.multiplyScalar(this.followDistance);

        this.desiredCameraPosition.copy(this.worldAgentPosition).add(desiredOffset);

        // Interpolation LISSE vers la position désirée en utilisant le temps non-échelonné
        // Évite que le suivi ralentisse ou s'arrête avec la vitesse du jeu
        if (unscaledDeltaTimeSeconds > 0) {
            const lerpFactor = 1.0 - Math.exp(-this.followSpeed * unscaledDeltaTimeSeconds);
            this.currentPosition.lerp(this.desiredCameraPosition, lerpFactor);
        } else {
            // Si le temps n'avance pas (cas extrême), on peut snapper ou ne rien faire
            this.currentPosition.copy(this.desiredCameraPosition); // Snap pour éviter de rester bloqué
        }

        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.targetLookAtPosition);

        if (this.experience.controls) {
            this.experience.controls.target.copy(this.targetLookAtPosition);
        }
    }

    followAgent(agent) {
        if (!agent) return;

        if (this.isFollowing && this.targetAgent === agent) {
            console.log(`Camera: Already following agent ${agent.id}. No changes.`);
            return;
        }

        console.log(`Camera: Initializing INSTANT follow for agent ${agent.id}.`);
        this.targetAgent = agent;
        this.isFollowing = true;
        this.isMovingToTarget = false;
        this.moveElapsedTimeUnscaled = 0; // Nettoyer au cas où
        this.agentToFollowAfterMove = null;
        this.isMouseLookingActive = true;
        this.isLeftMouseDown = false;

        if (this.experience.controls) {
            this.experience.controls.enabled = false;
        }

        this.worldAgentPosition.copy(this.targetAgent.position);

        const lookAtHeightOffset = this.targetAgent.isDriving ? 1.5 : 1.0;
        this.targetLookAtPosition.copy(this.worldAgentPosition).add(new THREE.Vector3(0, lookAtHeightOffset, 0));

        const initialOffset = new THREE.Vector3();
        initialOffset.x = Math.sin(this.mouseYaw) * Math.cos(this.mousePitch);
        initialOffset.y = Math.sin(this.mousePitch);
        initialOffset.z = Math.cos(this.mouseYaw) * Math.cos(this.mousePitch);
        initialOffset.multiplyScalar(this.followDistance);

        this.desiredCameraPosition.copy(this.worldAgentPosition).add(initialOffset);

        this.currentPosition.copy(this.desiredCameraPosition);
        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.targetLookAtPosition);

        if (this.experience.controls) {
            this.experience.controls.target.copy(this.targetLookAtPosition);
        }

        this._addEventListeners();
        console.log(`Camera: Now INSTANTLY following agent ${agent.id}.`);
    }

    stopFollowing() {
        const wasFollowing = this.isFollowing;
        const wasMoving = this.isMovingToTarget;

        if (!wasFollowing && !wasMoving) {
            if (this.experience.controls && !this.experience.controls.enabled) {
                this.experience.controls.enabled = true;
            }
            return;
        }

        this.targetAgent = null;
        this.isFollowing = false;
        this.isMovingToTarget = false;
        this.moveElapsedTimeUnscaled = 0; // Nettoyer
        this.isMouseLookingActive = false;
        this.agentToFollowAfterMove = null;
        this._removeEventListeners();

        if (wasFollowing || (wasMoving && !this.agentToFollowAfterMove)) {
            if (this.experience.controls) {
                this.experience.controls.enabled = true;
            }
        }
    }

    _addEventListeners() {
        document.addEventListener('mousemove', this._boundHandleMouseMove, false);
        document.addEventListener('mousedown', this._boundHandleMouseDown, false);
        document.addEventListener('mouseup', this._boundHandleMouseUp, false);
        window.addEventListener('wheel', this._boundHandleMouseWheel, { passive: false });
    }

    _removeEventListeners() {
        document.removeEventListener('mousemove', this._boundHandleMouseMove, false);
        document.removeEventListener('mousedown', this._boundHandleMouseDown, false);
        document.removeEventListener('mouseup', this._boundHandleMouseUp, false);
        window.removeEventListener('wheel', this._boundHandleMouseWheel);
    }

    _handleMouseDown(event) {
        const targetElement = event.target;
        const isUIInteraction = targetElement.closest('[data-ui-interactive="true"]');

        if (this.isFollowing && event.button === 0 && !isUIInteraction) { // Bouton gauche
            this.isLeftMouseDown = true;
            event.stopPropagation();
        }
    }

    _handleMouseUp(event) {
        if (event.button === 0) { // Bouton gauche
            this.isLeftMouseDown = false;
        }
    }

    _handleMouseMove(event) {
        if (this.isFollowing && this.isLeftMouseDown) {
            this.mouseYaw -= event.movementX * this.mouseSensitivityX;
            this.mousePitch -= event.movementY * this.mouseSensitivityY;
            this.mousePitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.mousePitch));
        }
    }

    _handleMouseWheel(event) {
        const targetElement = event.target;
        const isUIInteraction = targetElement.closest('[data-ui-interactive="true"]');

        if (this.isFollowing && !isUIInteraction) {
            event.preventDefault();

            const zoomFactor = 0.1;
            this.followDistance += event.deltaY * zoomFactor;
            this.followDistance = Math.max(this.minFollowDistance, Math.min(this.maxFollowDistance, this.followDistance));
        }
    }
}