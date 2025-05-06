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
        this.verticalDamping = 0.95; // amortissement de la vélocité verticale
        
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
        
        console.log("FpsControls initialisés");
    }
    
    enable() {
        if (!this.isActive) {
            document.addEventListener('keydown', this._boundKeyDown);
            document.addEventListener('keyup', this._boundKeyUp);
            document.addEventListener('mousemove', this._boundMouseMove);
            document.addEventListener('pointerlockchange', this._boundPointerLockChange);
            
            // Capturer le pointeur lors de l'activation
            this.canvas.requestPointerLock();
            
            this.isActive = true;
            console.log("FpsControls activés");
        }
    }
    
    disable() {
        if (this.isActive) {
            document.removeEventListener('keydown', this._boundKeyDown);
            document.removeEventListener('keyup', this._boundKeyUp);
            document.removeEventListener('mousemove', this._boundMouseMove);
            document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
            
            // Libérer le pointeur
            if (document.pointerLockElement === this.canvas) {
                document.exitPointerLock();
            }
            
            // Réinitialiser les états
            this.moveForward = false;
            this.moveBackward = false;
            this.moveLeft = false;
            this.moveRight = false;
            
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
        
        // Gestion du jetpack et de la gravité
        if (this.isGravityEnabled && !this.isGrounded) {
            this.verticalVelocity -= this.gravity * delta;
        }
        
        // Appliquer la poussée du jetpack si actif
        if (this.isJetpackActive) {
            this.verticalVelocity += this.jetpackForce * delta;
        }
        
        // Appliquer la descente si CTRL est pressé
        if (this.isDescending) {
            this.verticalVelocity -= this.descendSpeed * delta;
        }
        
        // Limiter la vitesse verticale
        this.verticalVelocity = Math.max(-this.maxVerticalSpeed, Math.min(this.maxVerticalSpeed, this.verticalVelocity));
        
        // Appliquer l'amortissement
        this.verticalVelocity *= this.verticalDamping;
        
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
        
        switch (event.code) {
            case 'KeyW': // Z en AZERTY
                this.moveForward = true;
                break;
            case 'KeyS': // S en AZERTY
                this.moveBackward = true;
                break;
            case 'KeyA': // Q en AZERTY
                this.moveLeft = true;
                break;
            case 'KeyD': // D en AZERTY
                this.moveRight = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.isSprinting = true;
                break;
            case 'Space':
                this.isJetpackActive = true;
                break;
            case 'ControlLeft':
            case 'ControlRight':
                this.isDescending = true;
                break;
            case 'KeyQ': // A en AZERTY
                this.isGravityEnabled = !this.isGravityEnabled;
                if (!this.isGravityEnabled) {
                    this.verticalVelocity = 0;
                }
                break;
            case 'Escape':
                if (this.experience.controlManager) {
                    this.experience.controlManager.setMode('classic');
                }
                break;
        }
    }
    
    _onKeyUp(event) {
        if (!this.isActive) return;
        
        switch (event.code) {
            case 'KeyW': // Z en AZERTY
                this.moveForward = false;
                break;
            case 'KeyS': // S en AZERTY
                this.moveBackward = false;
                break;
            case 'KeyA': // Q en AZERTY
                this.moveLeft = false;
                break;
            case 'KeyD': // D en AZERTY
                this.moveRight = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.isSprinting = false;
                break;
            case 'Space':
                this.isJetpackActive = false;
                break;
            case 'ControlLeft':
            case 'ControlRight':
                this.isDescending = false;
                break;
        }
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