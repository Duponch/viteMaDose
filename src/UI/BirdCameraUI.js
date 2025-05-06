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
        
        // Ajouter l'écouteur d'événement
        this._boundClickHandler = this._handleClick.bind(this);
        this.button.addEventListener('click', this._boundClickHandler);
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
    }
} 