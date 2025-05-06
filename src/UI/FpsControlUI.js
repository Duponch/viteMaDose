export default class FpsControlUI {
    constructor(experience) {
        this.experience = experience;
        
        // Créer le bouton
        this.button = document.createElement('button');
        this.button.id = 'fps-control-button';
        this.button.textContent = '👁️';
        this.button.title = 'Basculer en mode FPS (ZQSD + Souris)';
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
        
        // Écouter les changements de mode de contrôle
        this._boundModeChangeHandler = this._handleModeChange.bind(this);
        if (this.experience.controlManager) {
            this.experience.controlManager.addEventListener('modechanged', this._boundModeChangeHandler);
        }
    }
    
    // Gérer le clic sur le bouton
    _handleClick() {
        if (this.experience.controlManager) {
            this.experience.controlManager.toggleMode();
            // Enlever le focus du bouton
            this.button.blur();
        }
    }
    
    // Gérer les changements de mode
    _handleModeChange(event) {
        const isFpsMode = event.detail.mode === 'fps';
        this.updateButtonAppearance(isFpsMode);
    }
    
    // Mettre à jour l'apparence du bouton
    updateButtonAppearance(isFpsMode) {
        if (isFpsMode) {
            this.button.classList.add('active');
            this.button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
        } else {
            this.button.classList.remove('active');
            this.button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        }
    }
    
    destroy() {
        // Supprimer les écouteurs d'événements
        this.button.removeEventListener('click', this._boundClickHandler);
        if (this.experience.controlManager) {
            this.experience.controlManager.removeEventListener('modechanged', this._boundModeChangeHandler);
        }
        
        // Supprimer le bouton du DOM
        this.button.remove();
        
        // Nettoyer les références
        this.experience = null;
        this.button = null;
    }
} 