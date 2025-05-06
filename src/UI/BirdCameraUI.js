import * as THREE from 'three';

// Constante pour la taille de la grille d'oiseaux
const WIDTH = 32;

export default class BirdCameraUI {
    constructor(experience) {
        this.experience = experience;
        
        // Créer le bouton
        this.button = document.createElement('button');
        this.button.id = 'bird-camera-button';
        this.button.textContent = '🐦';
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
                    
                    // Activer le suivi de l'oiseau
                    this.experience.camera.followAgent(birdAgent);
                    this.updateButtonAppearance(true);
                }
            }
        }
        
        // Enlever le focus du bouton
        this.button.blur();
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
    }
} 