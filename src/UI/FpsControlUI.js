export default class FpsControlUI {
    constructor(experience) {
        this.experience = experience;
        
        // Créer le bouton
        this.button = document.createElement('button');
        this.button.id = 'fps-control-button';
        this.button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 76 76" fill="currentColor">
            <path d="M 38,28.5C 41.1667,28.5 50.2708,20.5833 55.0208,30.0833C 59.7708,39.5833 58.5833,52.25 55.4167,52.25C 47.5,52.25 52.25,44.3333 38,44.3333C 23.75,44.3333 28.5,52.25 20.5833,52.25C 17.4167,52.25 16.2292,39.5833 20.9792,30.0833C 25.7292,20.5834 34.8333,28.5 38,28.5 Z M 26.9167,32.0625L 26.9167,34.8334L 24.1458,34.8334L 24.1458,38L 26.9167,38L 26.9167,40.7709L 30.0833,40.7709L 30.0833,38L 32.8542,38L 32.8542,34.8334L 30.0833,34.8334L 30.0833,32.0625L 26.9167,32.0625 Z M 45.125,34.0417C 44.2505,34.0417 43.5416,34.7506 43.5416,35.625C 43.5416,36.4995 44.2505,37.2084 45.125,37.2084C 45.9994,37.2084 46.7083,36.4995 46.7083,35.625C 46.7083,34.7506 45.9994,34.0417 45.125,34.0417 Z M 48.2917,31.2708C 47.4172,31.2708 46.7083,31.9797 46.7083,32.8542C 46.7083,33.7286 47.4172,34.4375 48.2917,34.4375C 49.1661,34.4375 49.875,33.7286 49.875,32.8542C 49.875,31.9797 49.1661,31.2708 48.2917,31.2708 Z M 48.2917,37.2083C 47.4172,37.2083 46.7083,37.9172 46.7083,38.7917C 46.7083,39.6661 47.4172,40.375 48.2917,40.375C 49.1661,40.375 49.875,39.6661 49.875,38.7917C 49.875,37.9172 49.1661,37.2083 48.2917,37.2083 Z M 51.4583,34.0417C 50.5839,34.0417 49.875,34.7505 49.875,35.625C 49.875,36.4995 50.5839,37.2083 51.4583,37.2083C 52.3328,37.2083 53.0417,36.4995 53.0417,35.625C 53.0417,34.7505 52.3328,34.0417 51.4583,34.0417 Z"/>
        </svg>`;
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
        } else {
            this.button.classList.remove('active');
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