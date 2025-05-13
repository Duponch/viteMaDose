import * as THREE from 'three';

// Constante pour la taille de la grille d'oiseaux
const WIDTH = 32;

export default class BirdCameraUI {
    constructor(experience) {
        this.experience = experience;
        
        // Créer le bouton
        this.button = document.createElement('button');
        this.button.id = 'bird-camera-button';
        // Remplacer l'icône SVG par celle fournie
        this.button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 240 240" fill="currentColor">
            <path d="M236.4375,73.34375,213.207,57.85547A60.00943,60.00943,0,0,0,96,76V93.19385L1.75293,211.00244A7.99963,7.99963,0,0,0,8,224H112A104.11791,104.11791,0,0,0,216,120V100.28125l20.4375-13.625a7.99959,7.99959,0,0,0,0-13.3125Zm-126.292,67.77783-40,48a7.99987,7.99987,0,0,1-12.291-10.24316l40-48a7.99987,7.99987,0,0,1,12.291,10.24316ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z"/>
        </svg>`;
        this.button.title = 'Suivre un oiseau aléatoire';
        this.button.classList.add('control-button');
        this.button.dataset.uiInteractive = 'true';
        
        // Créer ou récupérer le container des contrôles
        let controlsContainer = document.querySelector('.control-buttons');
        if (!controlsContainer) {
            controlsContainer = document.createElement('div');
            controlsContainer.className = 'control-buttons';
            document.body.appendChild(controlsContainer);
        }
        
        // Ajouter le bouton au container
        controlsContainer.appendChild(this.button);
        
        // Mettre à jour l'apparence initiale
        this.updateButtonAppearance(false);
        
        // Ajouter l'écouteur d'événement pour le clic
        this._boundClickHandler = this._handleClick.bind(this);
        this.button.addEventListener('click', this._boundClickHandler);

        // Ajouter l'écouteur d'événement pour la touche Échap
        this._boundKeyDownHandler = this._handleKeyDown.bind(this);
        document.addEventListener('keydown', this._boundKeyDownHandler);

        this.isFollowing = false;
        this.lastPosition = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();
    }
    
    // Gérer le clic sur le bouton
    _handleClick() {
        if (this.experience.world && this.experience.world.environment && this.experience.world.environment.environmentSystem) {
            const birdSystem = this.experience.world.environment.environmentSystem.birdSystem;
            if (birdSystem) {
                // Sélectionner un oiseau aléatoire
                const birdCount = Math.round(WIDTH * WIDTH * birdSystem.birdDensity);
                const randomBirdIndex = Math.floor(Math.random() * birdCount);
                
                // Créer un objet agent temporaire pour l'oiseau
                const birdAgent = {
                    id: `bird_${randomBirdIndex}`,
                    position: new THREE.Vector3(),
                    isDriving: false
                };
                
                // Mettre à jour la position de l'oiseau
                const birdPos = birdSystem.getBirdPosition(randomBirdIndex);
                if (birdPos) {
                    birdAgent.position.copy(birdPos);
                    this.lastPosition.copy(birdPos);
                    this.targetPosition.copy(birdPos);
                    
                    // Activer le suivi de l'oiseau
                    this.experience.camera.followAgent(birdAgent);
                    this.updateButtonAppearance(true);
                    this.isFollowing = true;

                    // Ajouter l'écouteur pour la mise à jour de la position
                    this._boundUpdateHandler = this._updatePosition.bind(this);
                    this.experience.time.addEventListener('tick', this._boundUpdateHandler);
                }
            }
        }
        
        // Enlever le focus du bouton
        this.button.blur();
    }

    // Mettre à jour la position
    _updatePosition() {
        if (!this.isFollowing) return;

        const birdSystem = this.experience.world.environment.environmentSystem.birdSystem;
        if (!birdSystem) return;

        const currentAgent = this.experience.camera.targetAgent;
        if (!currentAgent || !currentAgent.id.startsWith('bird_')) return;

        const birdIndex = parseInt(currentAgent.id.split('_')[1]);
        const newPosition = birdSystem.getBirdPosition(birdIndex);
        
        if (newPosition) {
            // Calculer la direction du mouvement
            const direction = new THREE.Vector3().subVectors(newPosition, this.lastPosition);
            
            // Si la direction est significative, mettre à jour la position cible
            if (direction.lengthSq() > 0.0001) {
                this.targetPosition.copy(newPosition);
                
                // Mettre à jour la position de l'agent avec interpolation
                const deltaTime = this.experience.time.delta / 1000;
                const lerpFactor = Math.min(1, deltaTime * 10); // Ajuster la vitesse de lissage
                currentAgent.position.lerp(this.targetPosition, lerpFactor);
                
                // Mettre à jour la dernière position
                this.lastPosition.copy(newPosition);
            }
        }
    }

    // Gérer la touche Échap
    _handleKeyDown(event) {
        if (event.key === 'Escape' && this.button.classList.contains('active')) {
            // Arrêter le suivi de l'oiseau
            this.experience.camera.stopFollowing();
            // Réactiver les contrôles classiques
            if (this.experience.controlManager) {
                this.experience.controlManager.setMode('classic');
                this.experience.controlManager.classicControls.enable();
            }
            // Mettre à jour l'apparence du bouton
            this.updateButtonAppearance(false);
            this.isFollowing = false;
            
            // Retirer l'écouteur de mise à jour
            if (this._boundUpdateHandler) {
                this.experience.time.removeEventListener('tick', this._boundUpdateHandler);
            }
        }
    }
    
    // Mettre à jour l'apparence du bouton
    updateButtonAppearance(isFollowing) {
        if (isFollowing) {
            this.button.classList.add('active');
        } else {
            this.button.classList.remove('active');
        }
    }
    
    destroy() {
        if (this.button) {
            this.button.removeEventListener('click', this._boundClickHandler);
            this.button.remove();
        }
        // Retirer l'écouteur de la touche Échap
        document.removeEventListener('keydown', this._boundKeyDownHandler);
        // Retirer l'écouteur de mise à jour
        if (this._boundUpdateHandler) {
            this.experience.time.removeEventListener('tick', this._boundUpdateHandler);
        }
    }
} 