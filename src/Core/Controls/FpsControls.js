import * as THREE from 'three';

export default class FpsControls {
    constructor(experience) {
        this.experience = experience;
        this.camera = this.experience.camera;
        this.canvas = this.experience.canvas;
        this.time = this.experience.time;
        this.scene = this.experience.scene;
        
        // État
        this.isActive = false;
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isSprinting = false;
        this.isJetpackActive = false;
        this.isGrounded = false;
        this.isGravityEnabled = true;
        this.isDescending = false;
        
        // État des touches
        this.pressedKeys = new Set();
        
        // Configuration
        this.moveSpeed = 200; // vitesse de déplacement
        this.sprintMultiplier = 5.0; // multiplicateur de vitesse en sprint
        this.lookSpeed = 0.0015; // sensibilité de la souris
        
        // Configuration du jetpack
        this.gravity = 150.81; // gravité en m/s²
        this.jetpackForce = 300.0; // force de poussée du jetpack
        this.descendSpeed = 200.0; // vitesse de descente
        this.maxVerticalSpeed = 20.0; // vitesse verticale maximale
        this.verticalVelocity = 0.0; // vélocité verticale actuelle
        this.jetpackVelocity = 0.0; // vélocité du jetpack
        this.jetpackAcceleration = 0.1; // accélération du jetpack
        this.jetpackDamping = 0.3; // amortissement du jetpack
        this.gravityDamping = 0.95; // amortissement de la gravité
        
        // Configuration du sol
        this.groundOffset = 1.8; // hauteur du joueur
        this.groundY = 0; // hauteur du sol
        
        // Propriétés pour le mouvement de la caméra
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        // Position initiale de la souris
        this.mousePosition = {
            x: 0,
            y: 0
        };
        
        // Point de vue (peut être modifié pour pointer vers un endroit spécifique)
        this.lookAt = new THREE.Vector3(0, 0, 0);
        
        // Créer les écouteurs d'événements
        this._boundKeyDown = this._onKeyDown.bind(this);
        this._boundKeyUp = this._onKeyUp.bind(this);
        this._boundMouseMove = this._onMouseMove.bind(this);
        this._boundPointerLockChange = this._onPointerLockChange.bind(this);
        this._boundPreventShortcuts = this._preventShortcuts.bind(this);
        
        console.log("FpsControls initialisés");
    }
    
    enable() {
        if (!this.isActive) {
            // Ajouter les écouteurs d'événements au document
            document.addEventListener('keydown', this._boundKeyDown, true);
            document.addEventListener('keyup', this._boundKeyUp, true);
            document.addEventListener('mousemove', this._boundMouseMove);
            document.addEventListener('pointerlockchange', this._boundPointerLockChange);
            document.addEventListener('keydown', this._boundPreventShortcuts, true);
            
            // Capturer le pointeur lors de l'activation
            this.canvas.requestPointerLock();
            
            this.isActive = true;
            console.log("FpsControls activés");
        }
    }
    
    disable() {
        if (this.isActive) {
            // Retirer les écouteurs d'événements du document
            document.removeEventListener('keydown', this._boundKeyDown, true);
            document.removeEventListener('keyup', this._boundKeyUp, true);
            document.removeEventListener('mousemove', this._boundMouseMove);
            document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
            document.removeEventListener('keydown', this._boundPreventShortcuts, true);
            
            // Libérer le pointeur
            if (document.pointerLockElement === this.canvas) {
                document.exitPointerLock();
            }
            
            // Réinitialiser les états
            this.moveForward = false;
            this.moveBackward = false;
            this.moveLeft = false;
            this.moveRight = false;
            this.isSprinting = false;
            this.isJetpackActive = false;
            this.isDescending = false;
            this.pressedKeys.clear();
            
            this.isActive = false;
            console.log("FpsControls désactivés");
        }
    }
    
    update() {
        if (!this.isActive || !this.camera || !this.time) return;
        
        const delta = this.time.unscaledDelta / 1000;
        
        // Vérifier si on est au sol
        this._checkGround();
        
        // Ralentir le mouvement avec le temps
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;
        
        // Déterminer la direction du mouvement
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();
        
        // Calculer la vitesse actuelle (avec sprint si nécessaire)
        const currentSpeed = this.moveSpeed * (this.isSprinting ? this.sprintMultiplier : 1.0);
        
        // Appliquer le mouvement dans la direction de la caméra
        if (this.moveForward || this.moveBackward) {
            this.velocity.z += this.direction.z * currentSpeed * delta;
        }
        
        if (this.moveLeft || this.moveRight) {
            this.velocity.x += this.direction.x * currentSpeed * delta;
        }
        
        // Gestion de la gravité
        if (this.isGravityEnabled && !this.isGrounded) {
            this.verticalVelocity -= this.gravity * delta;
            this.verticalVelocity *= this.gravityDamping;
        }
        
        // Gestion du jetpack avec accélération progressive
        if (this.isJetpackActive) {
            // Accélération progressive
            this.jetpackVelocity += this.jetpackAcceleration;
            // Limiter la vitesse du jetpack
            this.jetpackVelocity = Math.min(this.jetpackVelocity, 1.0);
            
            // Augmenter la force du jetpack si on sprint
            const jetpackForce = this.jetpackForce * (this.isSprinting ? 1.5 : 1.0);
            this.verticalVelocity += jetpackForce * this.jetpackVelocity * delta;
        } else {
            // Décélération progressive
            this.jetpackVelocity *= this.jetpackDamping;
        }
        
        // Appliquer la descente si CTRL est pressé
        if (this.isDescending) {
            this.verticalVelocity -= this.descendSpeed * delta;
        }
        
        // Si la gravité est désactivée, réinitialiser la vélocité verticale quand aucune touche n'est pressée
        if (!this.isGravityEnabled && !this.isJetpackActive && !this.isDescending) {
            this.verticalVelocity = 0;
        }
        
        // Limiter la vitesse verticale
        this.verticalVelocity = Math.max(-this.maxVerticalSpeed, Math.min(this.maxVerticalSpeed, this.verticalVelocity));
        
        // Appliquer la vélocité à la position de la caméra
        const cameraDirection = this.camera.instance.getWorldDirection(new THREE.Vector3());
        const right = new THREE.Vector3().crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
        
        this.camera.instance.position.addScaledVector(cameraDirection, this.velocity.z * delta);
        this.camera.instance.position.addScaledVector(right, this.velocity.x * delta);
        
        // Appliquer le mouvement vertical
        const newY = this.camera.instance.position.y + this.verticalVelocity * delta;
        
        // Empêcher de passer sous le sol seulement si la gravité est activée
        if (this.isGravityEnabled && newY < this.groundY + this.groundOffset) {
            this.camera.instance.position.y = this.groundY + this.groundOffset;
            this.verticalVelocity = 0;
            this.isGrounded = true;
        } else {
            this.camera.instance.position.y = newY;
        }
    }
    
    _checkGround() {
        // Vérification simple de la hauteur
        this.isGrounded = this.camera.instance.position.y <= this.groundY + this.groundOffset;
        
        // Si on est au sol, réinitialiser la vélocité verticale
        if (this.isGrounded && this.verticalVelocity < 0) {
            this.verticalVelocity = 0;
        }
    }
    
    _onKeyDown(event) {
        if (!this.isActive) return;
        
        // Gérer la touche F pour play/pause en premier
        if (event.code === 'KeyF') {
            event.preventDefault();
            event.stopPropagation();
            this.experience.time.togglePause();
            return;
        }
        
        // Empêcher le comportement par défaut pour les touches de contrôle
        if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyZ', 'KeyQ', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Ajouter la touche à l'ensemble des touches pressées
        this.pressedKeys.add(event.code);
        
        // Mettre à jour les états de mouvement
        this.moveForward = this.pressedKeys.has('KeyW'); // Z en AZERTY
        this.moveBackward = this.pressedKeys.has('KeyS');
        this.moveLeft = this.pressedKeys.has('KeyA'); // Q en AZERTY
        this.moveRight = this.pressedKeys.has('KeyD');
        this.isSprinting = this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight');
        this.isJetpackActive = this.pressedKeys.has('Space');
        this.isDescending = this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight');
        
        // Gérer les touches spéciales
        if (event.code === 'KeyQ') { // A en AZERTY
            this.isGravityEnabled = !this.isGravityEnabled;
            if (!this.isGravityEnabled) {
                this.verticalVelocity = 0;
                this.jetpackVelocity = 0;
            }
        } else if (event.code === 'Escape') {
            if (this.experience.controlManager) {
                this.experience.controlManager.setMode('classic');
            }
        }
    }
    
    _onKeyUp(event) {
        if (!this.isActive) return;
        
        // Empêcher le comportement par défaut pour les touches de contrôle
        if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyZ', 'KeyQ', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Retirer la touche de l'ensemble des touches pressées
        this.pressedKeys.delete(event.code);
        
        // Mettre à jour les états de mouvement
        this.moveForward = this.pressedKeys.has('KeyW'); // Z en AZERTY
        this.moveBackward = this.pressedKeys.has('KeyS');
        this.moveLeft = this.pressedKeys.has('KeyA'); // Q en AZERTY
        this.moveRight = this.pressedKeys.has('KeyD');
        this.isSprinting = this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight');
        this.isJetpackActive = this.pressedKeys.has('Space');
        this.isDescending = this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight');
    }
    
    _onMouseMove(event) {
        if (!this.isActive || document.pointerLockElement !== this.canvas) return;
        
        // Calculer la rotation de la caméra basée sur le mouvement de la souris
        this.euler.setFromQuaternion(this.camera.instance.quaternion);
        
        // Appliquer le mouvement vertical (pitch) et horizontal (yaw)
        this.euler.y -= event.movementX * this.lookSpeed;
        this.euler.x -= event.movementY * this.lookSpeed;
        
        // Limiter l'angle de vision vertical pour éviter de regarder trop haut ou trop bas
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
        
        // Appliquer la rotation à la caméra
        this.camera.instance.quaternion.setFromEuler(this.euler);
    }
    
    _onPointerLockChange() {
        if (document.pointerLockElement !== this.canvas && this.isActive) {
            // Si le pointeur est libéré et que nous sommes en mode FPS actif,
            // basculer vers le mode classique
            if (this.experience.controlManager) {
                this.experience.controlManager.setMode('classic');
            }
        }
    }
    
    _preventShortcuts(event) {
        // Liste des touches à bloquer
        const blockedKeys = [
            'KeyS', // Ctrl + S
            'KeyD', // Ctrl + D
            'KeyP', // Ctrl + P
            'KeyR', // Ctrl + R
            'KeyU', // Ctrl + U
            'KeyI', // Ctrl + I
            'KeyJ', // Ctrl + J
            'KeyK', // Ctrl + K
            'KeyL', // Ctrl + L
            'KeyO', // Ctrl + O
            'KeyF', // Ctrl + F
            'KeyH', // Ctrl + H
            'KeyG', // Ctrl + G
            'KeyB', // Ctrl + B
            'KeyN', // Ctrl + N
            'KeyM', // Ctrl + M
            'KeyW', // Ctrl + W
            'KeyQ', // Ctrl + Q
            'KeyE', // Ctrl + E
            'KeyT', // Ctrl + T
            'KeyY', // Ctrl + Y
            'KeyX', // Ctrl + X
            'KeyC', // Ctrl + C
            'KeyV', // Ctrl + V
            'KeyZ', // Ctrl + Z
            'KeyA', // Ctrl + A
            'Digit1', // Ctrl + 1
            'Digit2', // Ctrl + 2
            'Digit3', // Ctrl + 3
            'Digit4', // Ctrl + 4
            'Digit5', // Ctrl + 5
            'Digit6', // Ctrl + 6
            'Digit7', // Ctrl + 7
            'Digit8', // Ctrl + 8
            'Digit9', // Ctrl + 9
            'Digit0', // Ctrl + 0
            'Minus', // Ctrl + -
            'Equal', // Ctrl + =
            'BracketLeft', // Ctrl + [
            'BracketRight', // Ctrl + ]
            'Backslash', // Ctrl + \
            'Semicolon', // Ctrl + ;
            'Quote', // Ctrl + '
            'Comma', // Ctrl + ,
            'Period', // Ctrl + .
            'Slash', // Ctrl + /
            'Space', // Ctrl + Space
            'Tab', // Ctrl + Tab
            'Backspace', // Ctrl + Backspace
            'Delete', // Ctrl + Delete
            'Insert', // Ctrl + Insert
            'Home', // Ctrl + Home
            'End', // Ctrl + End
            'PageUp', // Ctrl + PageUp
            'PageDown', // Ctrl + PageDown
            'ArrowUp', // Ctrl + ↑
            'ArrowDown', // Ctrl + ↓
            'ArrowLeft', // Ctrl + ←
            'ArrowRight', // Ctrl + →
            'F1', // Ctrl + F1
            'F2', // Ctrl + F2
            'F3', // Ctrl + F3
            'F4', // Ctrl + F4
            'F5', // Ctrl + F5
            'F6', // Ctrl + F6
            'F7', // Ctrl + F7
            'F8', // Ctrl + F8
            'F9', // Ctrl + F9
            'F10', // Ctrl + F10
            'F11', // Ctrl + F11
            'F12', // Ctrl + F12
        ];

        // Bloquer les raccourcis Ctrl + touche
        if (event.ctrlKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Bloquer les raccourcis Alt + touche
        if (event.altKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Bloquer les raccourcis Shift + touche
        if (event.shiftKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Bloquer les raccourcis Ctrl + Alt + touche
        if (event.ctrlKey && event.altKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Bloquer les raccourcis Ctrl + Shift + touche
        if (event.ctrlKey && event.shiftKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Bloquer les raccourcis Alt + Shift + touche
        if (event.altKey && event.shiftKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Bloquer les raccourcis Ctrl + Alt + Shift + touche
        if (event.ctrlKey && event.altKey && event.shiftKey && blockedKeys.includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
    
    destroy() {
        this.disable();
        this.experience = null;
        this.camera = null;
        this.canvas = null;
        this.time = null;
    }
    
    // Méthodes pour la compatibilité avec le code existant
    get target() {
        // En mode FPS, le target est toujours un point devant la caméra
        return this.camera.instance.position.clone().add(
            this.camera.instance.getWorldDirection(new THREE.Vector3()).multiplyScalar(10)
        );
    }
    
    set target(newTarget) {
        // En mode FPS, changer la cible n'a pas d'effet immédiat
        // On pourrait tourner la caméra pour qu'elle regarde cette position,
        // mais ce n'est généralement pas le comportement souhaité en FPS
        console.log("FpsControls: Setting target not supported directly");
    }
    
    lookAt(position) {
        if (position instanceof THREE.Vector3) {
            // Calculer la direction de la caméra vers la position
            const direction = new THREE.Vector3().subVectors(position, this.camera.instance.position).normalize();
            
            // Calculer le yaw et le pitch en fonction de la direction
            this.euler.y = Math.atan2(-direction.x, -direction.z);
            this.euler.x = Math.asin(Math.max(-1, Math.min(1, direction.y)));
            
            // Appliquer la rotation à la caméra
            this.camera.instance.quaternion.setFromEuler(this.euler);
        }
    }
} 