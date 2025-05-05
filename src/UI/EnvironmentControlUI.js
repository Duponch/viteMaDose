/**
 * Interface utilisateur pour contrôler le système d'environnement
 */
export default class EnvironmentControlUI {
    /**
     * @param {Object} experience - Référence à l'instance principale
     */
    constructor(experience) {
        this.experience = experience;
        this.environment = this.experience.world.environment;
        
        // Attendre que l'environnement soit initialisé et que le système d'environnement soit disponible
        this.checkEnvironmentSystemInterval = setInterval(() => {
            if (this.environment && this.environment.environmentSystem) {
                clearInterval(this.checkEnvironmentSystemInterval);
                this.environmentSystem = this.environment.environmentSystem;
                
                // Sauvegarder les valeurs initiales du système
                this.defaultValues = {
                    birdDensity: 0.5
                };
                
                this.init();
            }
        }, 1000);
    }
    
    /**
     * Initialise l'interface utilisateur avec des curseurs
     */
    init() {
        // Créer les éléments de l'interface
        this.container = document.createElement('div');
        this.container.className = 'environment-control-ui';
        
        // Titre de la section
        const title = document.createElement('h3');
        title.textContent = 'Environnement';
        this.container.appendChild(title);
        
        // Créer les curseurs pour chaque paramètre
        this.createSlider('Oiseaux', 'birds', 0, 1, 0.01, this.environmentSystem.getBirdDensity());
        
        // Bouton pour réinitialiser les valeurs par défaut
        const resetButton = document.createElement('button');
        resetButton.textContent = '↻ Défaut';
        resetButton.addEventListener('click', () => {
            this.resetToDefaults();
        });
        
        this.container.appendChild(resetButton);
        
        // Ajouter l'interface au document après la météo
        const weatherUI = document.querySelector('.weather-control-ui');
        if (weatherUI) {
            // Positionner en dessous de l'UI météo
            this.container.style.top = 'calc(' + weatherUI.offsetHeight + 'px + 20px)';
            document.body.appendChild(this.container);
        } else {
            // Positionner à un endroit par défaut si l'UI météo n'est pas trouvée
            document.body.appendChild(this.container);
        }
        
        // Sauvegarder les références des sliders pour y accéder plus tard
        this.sliders = {
            birds: this.container.querySelector('#slider-birds')
        };
        
        this.valueDisplays = {
            birds: this.container.querySelector('#value-birds')
        };
        
        console.log("Interface de contrôle d'environnement initialisée");
    }
    
    /**
     * Crée un curseur avec étiquette et valeur affichée
     * @param {string} label - Étiquette du curseur
     * @param {string} id - Identifiant unique du curseur
     * @param {number} min - Valeur minimale
     * @param {number} max - Valeur maximale
     * @param {number} step - Pas d'incrémentation
     * @param {number} initialValue - Valeur initiale
     */
    createSlider(label, id, min, max, step, initialValue) {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';
        
        // Ligne d'étiquette et valeur
        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        
        const valueEl = document.createElement('span');
        valueEl.id = `value-${id}`;
        valueEl.textContent = initialValue.toFixed(2);
        
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueEl);
        sliderContainer.appendChild(labelRow);
        
        // Curseur
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = `slider-${id}`;
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = initialValue;
        
        // Mettre à jour la valeur CSS lors du changement
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueEl.textContent = value.toFixed(2);
            slider.style.setProperty('--value', `${(value - min) / (max - min) * 100}%`);
            
            // Mettre à jour le paramètre correspondant dans le système d'environnement
            this.updateEnvironmentParameter(id, value);
        });
        
        // Initialiser la valeur CSS
        slider.style.setProperty('--value', `${(initialValue - min) / (max - min) * 100}%`);
        
        sliderContainer.appendChild(slider);
        this.container.appendChild(sliderContainer);
    }
    
    /**
     * Met à jour un paramètre spécifique dans le système d'environnement
     * @param {string} param - Nom du paramètre (birds)
     * @param {number} value - Nouvelle valeur (0-1)
     */
    updateEnvironmentParameter(param, value) {
        if (!this.environmentSystem) return;
        
        switch (param) {
            case 'birds':
                this.environment.setBirdDensity(value);
                break;
        }
    }
    
    /**
     * Réinitialise tous les paramètres aux valeurs par défaut
     */
    resetToDefaults() {
        if (!this.environmentSystem) return;
        
        // Mettre à jour les curseurs et les valeurs affichées
        for (const [key, value] of Object.entries(this.defaultValues)) {
            switch (key) {
                case 'birdDensity':
                    this.sliders.birds.value = value;
                    this.valueDisplays.birds.textContent = value.toFixed(2);
                    this.environment.setBirdDensity(value);
                    this.sliders.birds.style.setProperty('--value', `${(value - 0) / (1 - 0) * 100}%`);
                    break;
            }
        }
    }
    
    /**
     * Nettoie les ressources de l'interface
     */
    destroy() {
        if (this.checkEnvironmentSystemInterval) {
            clearInterval(this.checkEnvironmentSystemInterval);
        }
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.sliders = null;
        this.valueDisplays = null;
    }
} 