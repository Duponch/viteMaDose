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
                this.waterSystem = this.environment.waterSystem; // Référence au système d'eau
                
                // Sauvegarder les valeurs initiales du système
                this.defaultValues = {
                    birdDensity: 0.5,
                    waterVisible: true,
                    waterPositionX: 0,
                    waterPositionY: 0.5,
                    waterPositionZ: 0,
                    waterWidth: 350,
                    waterHeight: 250
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
        this.container.dataset.uiInteractive = 'true';
        
        // Titre de la section
        const title = document.createElement('h3');
        title.textContent = 'Environnement';
        this.container.appendChild(title);
        
        // Créer les curseurs pour chaque paramètre
        this.createSlider('Nombre d\'oiseaux', 'birds', 0, 1, 0.01, this.environmentSystem.getBirdDensity());
        
        // Séparateur pour section eau
        const waterSeparator = document.createElement('div');
        waterSeparator.className = 'ui-separator';
        this.container.appendChild(waterSeparator);
        
        // Checkbox pour activer/désactiver l'eau
        this.createCheckbox('Visible', 'waterVisible', this.defaultValues.waterVisible);
        
        // Curseurs pour la position de l'eau (seulement la hauteur est visible)
        this.createSlider('Position X', 'waterPosX', -500, 500, 5, this.defaultValues.waterPositionX);
        this.createSlider('Position Z', 'waterPosZ', -500, 500, 5, this.defaultValues.waterPositionZ);
        this.createSlider('Hauteur de l\'eau', 'waterPosY', -50, 50, 0.1, this.defaultValues.waterPositionY);
        
        // Curseurs pour les dimensions de l'eau (masqués)
        this.createSlider('Largeur', 'waterWidth', 50, 1000, 10, this.defaultValues.waterWidth);
        this.createSlider('Longueur', 'waterHeight', 50, 1000, 10, this.defaultValues.waterHeight);
        
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
            birds: this.container.querySelector('#slider-birds'),
            waterPosX: this.container.querySelector('#slider-waterPosX'),
            waterPosY: this.container.querySelector('#slider-waterPosY'),
            waterPosZ: this.container.querySelector('#slider-waterPosZ'),
            waterWidth: this.container.querySelector('#slider-waterWidth'),
            waterHeight: this.container.querySelector('#slider-waterHeight')
        };
        
        this.valueDisplays = {
            birds: this.container.querySelector('#value-birds'),
            waterPosX: this.container.querySelector('#value-waterPosX'),
            waterPosY: this.container.querySelector('#value-waterPosY'),
            waterPosZ: this.container.querySelector('#value-waterPosZ'),
            waterWidth: this.container.querySelector('#value-waterWidth'),
            waterHeight: this.container.querySelector('#value-waterHeight')
        };
        
        this.checkboxes = {
            waterVisible: this.container.querySelector('#checkbox-waterVisible')
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
        sliderContainer.dataset.uiInteractive = 'true';
        
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
     * Crée une case à cocher avec étiquette
     * @param {string} label - Étiquette de la case à cocher
     * @param {string} id - Identifiant unique
     * @param {boolean} initialValue - État initial (coché/non coché)
     */
    createCheckbox(label, id, initialValue) {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'checkbox-container';
        checkboxContainer.dataset.uiInteractive = 'true';
        
        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `checkbox-${id}`;
        checkbox.checked = initialValue;
        
        // Étiquette
        const labelEl = document.createElement('label');
        labelEl.htmlFor = `checkbox-${id}`;
        labelEl.textContent = label;
        
        checkbox.addEventListener('change', (e) => {
            this.updateEnvironmentParameter(id, e.target.checked);
        });
        
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(labelEl);
        this.container.appendChild(checkboxContainer);
    }
    
    /**
     * Met à jour un paramètre spécifique dans le système d'environnement
     * @param {string} param - Nom du paramètre
     * @param {any} value - Nouvelle valeur
     */
    updateEnvironmentParameter(param, value) {
        if (!this.environmentSystem || !this.waterSystem) return;
        
        switch (param) {
            case 'birds':
                this.environment.setBirdDensity(value);
                break;
            case 'waterVisible':
                if (this.waterSystem.waterMesh) {
                    this.waterSystem.waterMesh.visible = value;
                }
                break;
            case 'waterPosX':
                this.environment.setWaterPosition({ x: value });
                break;
            case 'waterPosY':
                this.environment.setWaterPosition({ y: value });
                break;
            case 'waterPosZ':
                this.environment.setWaterPosition({ z: value });
                break;
            case 'waterWidth':
                this.environment.setWaterDimensions(value, this.sliders.waterHeight.value);
                break;
            case 'waterHeight':
                this.environment.setWaterDimensions(this.sliders.waterWidth.value, value);
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
                case 'waterVisible':
                    this.checkboxes.waterVisible.checked = value;
                    if (this.waterSystem && this.waterSystem.waterMesh) {
                        this.waterSystem.waterMesh.visible = value;
                    }
                    break;
                case 'waterPositionX':
                    this.sliders.waterPosX.value = value;
                    this.valueDisplays.waterPosX.textContent = value.toFixed(2);
                    this.sliders.waterPosX.style.setProperty('--value', `${(value - -500) / (500 - -500) * 100}%`);
                    break;
                case 'waterPositionY':
                    this.sliders.waterPosY.value = value;
                    this.valueDisplays.waterPosY.textContent = value.toFixed(2);
                    this.sliders.waterPosY.style.setProperty('--value', `${(value - -50) / (50 - -50) * 100}%`);
                    break;
                case 'waterPositionZ':
                    this.sliders.waterPosZ.value = value;
                    this.valueDisplays.waterPosZ.textContent = value.toFixed(2);
                    this.sliders.waterPosZ.style.setProperty('--value', `${(value - -500) / (500 - -500) * 100}%`);
                    break;
                case 'waterWidth':
                    this.sliders.waterWidth.value = value;
                    this.valueDisplays.waterWidth.textContent = value.toFixed(2);
                    this.sliders.waterWidth.style.setProperty('--value', `${(value - 50) / (1000 - 50) * 100}%`);
                    break;
                case 'waterHeight':
                    this.sliders.waterHeight.value = value;
                    this.valueDisplays.waterHeight.textContent = value.toFixed(2);
                    this.sliders.waterHeight.style.setProperty('--value', `${(value - 50) / (1000 - 50) * 100}%`);
                    break;
            }
        }
        
        // Mettre à jour la position et les dimensions de l'eau
        this.environment.setWaterPosition({
            x: this.defaultValues.waterPositionX,
            y: this.defaultValues.waterPositionY,
            z: this.defaultValues.waterPositionZ
        });
        
        this.environment.setWaterDimensions(
            this.defaultValues.waterWidth,
            this.defaultValues.waterHeight
        );
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
        this.checkboxes = null;
    }
} 