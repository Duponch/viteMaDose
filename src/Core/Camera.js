// src/Core/Camera.js
import * as THREE from 'three';

// IMPORTANT: Pas de 'let instance = null;' ici, le singleton est géré dans Experience.js

export default class Camera {
    constructor(experience) { // Le constructeur reçoit l'instance 'experience'
        // PAS d'appel à super() ici car Camera n'hérite de rien nativement
        // PAS de logique de singleton ici

        // --- Initialisation des propriétés spécifiques à Camera ---
        this.experience = experience;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        // --- État et cibles de suivi ---
        this.isFollowing = false;
        this.targetAgent = null;
        this.followSpeed = 4.0;

        // --- Contrôle Souris Pendant Suivi ---
        this.isMouseLookingActive = false;
        this.mouseYaw = 0;
        this.mousePitch = 0.3;
        this.mouseSensitivityX = 0.005;
        this.mouseSensitivityY = 0.005;
        this.followDistance = 8;
        this.minPitch = -Math.PI / 2 + 0.1;
        this.maxPitch = Math.PI / 2 - 0.1;
        this.isLeftMouseDown = false; // Pour le clic maintenu

        // --- Vecteurs temporaires ---
        this.currentPosition = new THREE.Vector3();
        this.targetLookAtPosition = new THREE.Vector3();
        this.worldAgentPosition = new THREE.Vector3();
        this.desiredCameraPosition = new THREE.Vector3();

        // --- Initialisation de l'instance de caméra THREE.js ---
        this.setInstance();

        // --- Binding des méthodes pour les listeners ---
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
        // Position initiale de la caméra
        this.instance.position.set(80, 80, 80);
        this.scene.add(this.instance);

        // Initialiser currentPosition avec la position initiale
        this.currentPosition.copy(this.instance.position);
        // Initialiser targetLookAtPosition (la cible sera mise à jour dans update)
        this.targetLookAtPosition.set(0, 0, 0);
        this.instance.lookAt(this.targetLookAtPosition);
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }

    followAgent(agent) {
        if (!agent) return;
        this.targetAgent = agent;
        this.isFollowing = true;
        this.isMouseLookingActive = true;
        this.isLeftMouseDown = false; // Réinitialiser

        // Initialiser Yaw/Pitch basé sur la position actuelle
        const direction = new THREE.Vector3().subVectors(this.instance.position, agent.position).normalize();
        this.mouseYaw = Math.atan2(direction.x, direction.z);
        this.mousePitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        this.mousePitch = THREE.MathUtils.clamp(this.mousePitch, this.minPitch, this.maxPitch);

        // Snap initial
        this.updateFollowLogic(1.0); // Appeler une fois avec un grand delta
        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.targetLookAtPosition);

        this._addEventListeners();
    }

    stopFollowing() {
        this.targetAgent = null;
        this.isFollowing = false;
        this.isMouseLookingActive = false;
        this.isLeftMouseDown = false; // Assurer la réinitialisation
        this._removeEventListeners();
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
        if (this.isMouseLookingActive && this.isFollowing && event.button === 0) {
            this.isLeftMouseDown = true;
        }
    }

    _handleMouseUp(event) {
        if (this.isMouseLookingActive && this.isFollowing && event.button === 0) {
            this.isLeftMouseDown = false;
        }
    }

    _handleMouseMove(event) {
        if (!this.isMouseLookingActive || !this.isFollowing || !this.isLeftMouseDown) {
            return;
        }

        const deltaX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const deltaY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        this.mouseYaw -= deltaX * this.mouseSensitivityX;
        this.mousePitch -= deltaY * this.mouseSensitivityY;
        this.mousePitch = THREE.MathUtils.clamp(this.mousePitch, this.minPitch, this.maxPitch);
    }

    updateFollowLogic(deltaTimeSeconds) {
        if (!this.targetAgent) return;

        this.worldAgentPosition.copy(this.targetAgent.position);
        this.targetLookAtPosition.copy(this.worldAgentPosition).add(new THREE.Vector3(0, 1.0, 0));

        const offsetX = this.followDistance * Math.sin(this.mouseYaw) * Math.cos(this.mousePitch);
        const offsetY = this.followDistance * Math.sin(this.mousePitch);
        const offsetZ = this.followDistance * Math.cos(this.mouseYaw) * Math.cos(this.mousePitch);

        this.desiredCameraPosition.copy(this.targetLookAtPosition).add(new THREE.Vector3(offsetX, offsetY, offsetZ));

        const lerpAlpha = 1.0 - Math.exp(-this.followSpeed * deltaTimeSeconds);
        this.currentPosition.lerp(this.desiredCameraPosition, lerpAlpha);

        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.targetLookAtPosition);
    }

    update(deltaTime) {
        if (this.isFollowing && this.targetAgent) {
             const deltaTimeSeconds = deltaTime / 1000.0;
             this.updateFollowLogic(deltaTimeSeconds);
        }
    }

     destroy() {
         this._removeEventListeners();
         console.log("Camera listeners removed.");
     }
}