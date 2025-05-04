/**
 * Interface utilisateur pour contrôler le système météorologique
 * Version améliorée avec curseurs indépendants
 */
export default class WeatherControlUI {
    /**
     * @param {Object} experience - Référence à l'instance principale
     */
    constructor(experience) {
        this.experience = experience;
        this.environment = this.experience.world.environment;
        
        // Attendre que l'environnement soit initialisé et que le système météo soit disponible
        this.checkWeatherSystemInterval = setInterval(() => {
            if (this.environment && this.environment.weatherSystem) {
                clearInterval(this.checkWeatherSystemInterval);
                this.weatherSystem = this.environment.weatherSystem;
                
                // Désactiver les changements aléatoires de météo
                this.weatherSystem.autoWeatherChangeProbability = 0;
                
                // Sauvegarder les valeurs initiales du système (avant la fonctionnalité météo)
                this.defaultValues = {
                    rainIntensity: 0,
                    cloudDensity: 0.3, // Valeur par défaut dans CloudSystem
                    cloudOpacity: 0.5, // Valeur par défaut dans CloudSystem
                    fogDensity: 0      // Pas de brouillard par défaut
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
        this.container.className = 'weather-control-ui';
        
        // Style de l'interface
        this.container.style.position = 'absolute';
        this.container.style.top = '10px';
        this.container.style.right = '10px';
        this.container.style.zIndex = '1000';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.container.style.padding = '15px';
        this.container.style.borderRadius = '5px';
        this.container.style.color = 'white';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.fontSize = '14px';
        this.container.style.width = '250px';
        
        // Titre
        const title = document.createElement('h3');
        title.textContent = 'Contrôle Météo';
        title.style.margin = '0 0 15px 0';
        title.style.textAlign = 'center';
        title.style.fontWeight = 'bold';
        this.container.appendChild(title);
        
        // Créer les curseurs pour chaque paramètre
        this.createSlider('Pluie', 'rain', 0, 1, 0.01, this.weatherSystem.rainEffect.intensity);
        this.createSlider('Nuages', 'cloud-density', 0, 1, 0.01, this.weatherSystem.cloudSystem.cloudDensity);
        this.createSlider('Opacité Nuages', 'cloud-opacity', 0, 1, 0.01, this.weatherSystem.cloudSystem.cloudOpacity);
        this.createSlider('Brouillard', 'fog', 0, 1, 0.01, this.weatherSystem.fogEffect.fogDensity);
        
        // Bouton pour réinitialiser les valeurs par défaut
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Réinitialiser aux valeurs par défaut';
        resetButton.style.width = '100%';
        resetButton.style.padding = '8px';
        resetButton.style.marginTop = '15px';
        resetButton.style.backgroundColor = '#555';
        resetButton.style.color = 'white';
        resetButton.style.border = '1px solid #777';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        
        resetButton.addEventListener('click', () => {
            this.resetToDefaults();
        });
        
        this.container.appendChild(resetButton);
        
        // Ajouter l'interface au document
        document.body.appendChild(this.container);
        
        // Sauvegarder les références des sliders pour y accéder plus tard
        this.sliders = {
            rain: this.container.querySelector('#slider-rain'),
            cloudDensity: this.container.querySelector('#slider-cloud-density'),
            cloudOpacity: this.container.querySelector('#slider-cloud-opacity'),
            fog: this.container.querySelector('#slider-fog')
        };
        
        this.valueDisplays = {
            rain: this.container.querySelector('#value-rain'),
            cloudDensity: this.container.querySelector('#value-cloud-density'),
            cloudOpacity: this.container.querySelector('#value-cloud-opacity'),
            fog: this.container.querySelector('#value-fog')
        };
        
        console.log("Interface de contrôle météo avec curseurs initialisée");
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
        sliderContainer.style.marginBottom = '15px';
        
        // Ligne d'étiquette et valeur
        const labelRow = document.createElement('div');
        labelRow.style.display = 'flex';
        labelRow.style.justifyContent = 'space-between';
        labelRow.style.marginBottom = '5px';
        
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.fontWeight = 'bold';
        
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
        slider.style.width = '100%';
        slider.style.accentColor = '#4a90e2';
        slider.style.height = '8px';
        slider.style.borderRadius = '4px';
        
        // Événement de changement en temps réel
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueEl.textContent = value.toFixed(2);
            
            // Mettre à jour le paramètre correspondant dans le système météo
            this.updateWeatherParameter(id, value);
        });
        
        sliderContainer.appendChild(slider);
        this.container.appendChild(sliderContainer);
    }
    
    /**
     * Met à jour un paramètre spécifique dans le système météo
     * @param {string} param - Nom du paramètre (rain, cloud-density, cloud-opacity, fog)
     * @param {number} value - Nouvelle valeur (0-1)
     */
    updateWeatherParameter(param, value) {
        if (!this.weatherSystem) return;
        
        switch (param) {
            case 'rain':
                this.weatherSystem.rainEffect.intensity = value;
                break;
                
            case 'cloud-density':
                this.weatherSystem.cloudSystem.cloudDensity = value;
                break;
                
            case 'cloud-opacity':
                this.weatherSystem.cloudSystem.cloudOpacity = value;
                break;
                
            case 'fog':
                this.weatherSystem.fogEffect.fogDensity = value;
                break;
        }
    }
    
    /**
     * Réinitialise tous les paramètres aux valeurs par défaut
     */
    resetToDefaults() {
        if (!this.weatherSystem) return;
        
        // Mettre à jour les curseurs et les valeurs affichées
        for (const [key, value] of Object.entries(this.defaultValues)) {
            switch (key) {
                case 'rainIntensity':
                    this.sliders.rain.value = value;
                    this.valueDisplays.rain.textContent = value.toFixed(2);
                    this.weatherSystem.rainEffect.intensity = value;
                    break;
                    
                case 'cloudDensity':
                    this.sliders.cloudDensity.value = value;
                    this.valueDisplays.cloudDensity.textContent = value.toFixed(2);
                    this.weatherSystem.cloudSystem.cloudDensity = value;
                    break;
                    
                case 'cloudOpacity':
                    this.sliders.cloudOpacity.value = value;
                    this.valueDisplays.cloudOpacity.textContent = value.toFixed(2);
                    this.weatherSystem.cloudSystem.cloudOpacity = value;
                    break;
                    
                case 'fogDensity':
                    this.sliders.fog.value = value;
                    this.valueDisplays.fog.textContent = value.toFixed(2);
                    this.weatherSystem.fogEffect.fogDensity = value;
                    break;
            }
        }
    }
    
    /**
     * Nettoie les ressources de l'interface
     */
    destroy() {
        if (this.checkWeatherSystemInterval) {
            clearInterval(this.checkWeatherSystemInterval);
        }
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.sliders = null;
        this.valueDisplays = null;
    }
} 