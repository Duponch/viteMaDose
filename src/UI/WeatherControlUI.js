/**
 * Interface utilisateur pour contrôler le système météorologique
 * Version améliorée avec curseurs indépendants
 */
import * as THREE from 'three';
import { defaultUIStates } from '../config/uiConfig.js';

export default class WeatherControlUI {
    /**
     * @param {Object} experience - Référence à l'instance principale
     */
    constructor(experience) {
        this.experience = experience;
        this.environment = this.experience.world.environment;
        this.isVisible = this.experience.uiStates?.weather ?? false;
        
        // Émettre l'événement de visibilité initial
        this.experience.dispatchEvent(new CustomEvent('weatheruichanged', {
            detail: { isVisible: this.isVisible }
        }));
        
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
                    cloudColor: 0, // Valeur 0 = blanc (défaut), 1 = noir
                    cloudOpacity: 0.5, // Valeur par défaut dans CloudSystem
                    fogDensity: 0.03,     // Valeur par défaut du brouillard
                    windStrength: 0,      // Valeur par défaut du vent (0-100)
                    grassBendStrength: 0, // Valeur par défaut des plis (0-100)
                    grassInclinationStrength: 0, // Valeur par défaut de l'inclinaison (0-100)
                    lightningIntensity: 0, // Pas d'éclairs par défaut
                    rainbowOpacity: 0      // Pas d'arc-en-ciel par défaut
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
        this.container.dataset.uiInteractive = 'true';
        this.container.style.display = this.isVisible ? 'block' : 'none';

        // Mettre à jour l'état du bouton toggle dans TimeControlUI
        const weatherButton = document.querySelector('#weather-toggle');
        if (weatherButton) {
            weatherButton.classList.toggle('active', this.isVisible);
        }

		// Titre de la section
        const title = document.createElement('h3');
        title.textContent = 'Météo';
        this.container.appendChild(title);
        
        // Créer les curseurs pour chaque paramètre
        this.createSlider('Pluie', 'rain', 0, 1, 0.01, this.weatherSystem.rainEffect.intensity);
        this.createSlider('Nombre de nuages', 'cloud-density', 0, 1, 0.01, this.weatherSystem.cloudSystem.cloudDensity);
        this.createSlider('Couleur des nuages', 'cloud-color', 0, 1, 0.01, 0); // 0 = blanc, 1 = noir
        this.createSlider('Opacité des nuages', 'cloud-opacity', 0, 1, 0.01, this.weatherSystem.cloudSystem.cloudOpacity);
        this.createSlider('Brouillard', 'fog', 0, 1, 0.01, this.weatherSystem.fogEffect.fogDensity);
        this.createSlider('Vent', 'wind', 0, 100, 1, 0); // Nouveau curseur pour le vent (0-100)
        this.createSlider('Plis de l\'herbe', 'grass-bend', 0, 100, 1, 0); // Curseur pour les plis de l'herbe
        this.createSlider('Inclinaison de l\'herbe', 'grass-inclination', 0, 100, 1, 0); // Nouveau curseur pour l'inclinaison de l'herbe
        this.createSlider('Éclairs', 'lightning', 0, 1, 0.01, this.weatherSystem.lightningEffect.intensity);
        this.createSlider('Arc-en-ciel', 'rainbow', 0, 1, 0.01, this.weatherSystem.rainbowEffect.opacity);
        
        // S'assurer que l'herbe est bien droite dès l'initialisation en définissant la force du vent à 0
        if (this.experience.world) {
            this.experience.world.setWindStrength(0);
            this.experience.world.setGrassBendStrength(0);
            this.experience.world.setGrassInclinationStrength(0);
        }
        
        // Bouton pour réinitialiser les valeurs par défaut
        const resetButton = document.createElement('button');
        resetButton.textContent = '↻ Défaut';
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
            cloudColor: this.container.querySelector('#slider-cloud-color'),
            cloudOpacity: this.container.querySelector('#slider-cloud-opacity'),
            fog: this.container.querySelector('#slider-fog'),
            wind: this.container.querySelector('#slider-wind'),
            grassBend: this.container.querySelector('#slider-grass-bend'),
            grassInclination: this.container.querySelector('#slider-grass-inclination'),
            lightning: this.container.querySelector('#slider-lightning'),
            rainbow: this.container.querySelector('#slider-rainbow')
        };
        
        this.valueDisplays = {
            rain: this.container.querySelector('#value-rain'),
            cloudDensity: this.container.querySelector('#value-cloud-density'),
            cloudColor: this.container.querySelector('#value-cloud-color'),
            cloudOpacity: this.container.querySelector('#value-cloud-opacity'),
            fog: this.container.querySelector('#value-fog'),
            wind: this.container.querySelector('#value-wind'),
            grassBend: this.container.querySelector('#value-grass-bend'),
            grassInclination: this.container.querySelector('#value-grass-inclination'),
            lightning: this.container.querySelector('#value-lightning'),
            rainbow: this.container.querySelector('#value-rainbow')
        };
        
        //console.log("Interface de contrôle météo avec curseurs initialisée");
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
            
            // Mettre à jour le paramètre correspondant dans le système météo
            this.updateWeatherParameter(id, value);
        });
        
        // Initialiser la valeur CSS
        slider.style.setProperty('--value', `${(initialValue - min) / (max - min) * 100}%`);
        
        sliderContainer.appendChild(slider);
        this.container.appendChild(sliderContainer);
    }
    
    /**
     * Met à jour un paramètre spécifique dans le système météo
     * @param {string} param - Nom du paramètre (rain, cloud-density, cloud-color, cloud-opacity, fog, lightning, rainbow)
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
                
            case 'cloud-color':
                // Interpoler entre blanc (0xffffff) et noir (0x000000) en fonction de la valeur
                const r = 1 - value;  // Blanc (1) vers noir (0)
                const g = 1 - value;
                const b = 1 - value;
                const color = new THREE.Color(r, g, b);
                //console.log(`Mise à jour de la couleur des nuages: ${r}, ${g}, ${b}`);
                this.weatherSystem.cloudSystem.cloudColor = color;
                break;
                
            case 'cloud-opacity':
                this.weatherSystem.cloudSystem.cloudOpacity = value;
                break;
                
            case 'fog':
                this.weatherSystem.fogEffect.fogDensity = value;
                break;
                
            case 'wind':
                // Mettre à jour la force du vent dans toutes les instances d'herbe
                if (this.experience.world) {
                    // Conversion de 0-100 à 0-5 pour le windStrength (5 étant une valeur très forte)
                    const windStrength = (value / 100) * 5;
                    this.experience.world.setWindStrength(windStrength);
                }
                break;
                
            case 'grass-bend':
                // Mettre à jour les plis de l'herbe
                if (this.experience.world) {
                    // Conversion de 0-100 à 0-1.5 pour les plis (1.5 étant presque horizontale)
                    const bendStrength = (value / 100) * 1.5;
                    this.experience.world.setGrassBendStrength(bendStrength);
                }
                break;
                
            case 'grass-inclination':
                // Mettre à jour l'inclinaison de l'herbe (rotation sans courbure)
                if (this.experience.world) {
                    // Conversion de 0-100 à 0-1.0 pour l'inclinaison (1.0 = inclinaison à 90 degrés)
                    const inclinationStrength = (value / 100);
                    this.experience.world.setGrassInclinationStrength(inclinationStrength);
                }
                break;
                
            case 'lightning':
                this.weatherSystem.lightningEffect.intensity = value;
                break;
                
            case 'rainbow':
                this.weatherSystem.rainbowEffect.setOpacity(value);
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
                    this.sliders.rain.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.rainEffect.intensity = value;
                    break;
                    
                case 'cloudDensity':
                    this.sliders.cloudDensity.value = value;
                    this.valueDisplays.cloudDensity.textContent = value.toFixed(2);
                    this.sliders.cloudDensity.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.cloudSystem.cloudDensity = value;
                    break;
                    
                case 'cloudColor':
                    this.sliders.cloudColor.value = value;
                    this.valueDisplays.cloudColor.textContent = value.toFixed(2);
                    this.sliders.cloudColor.style.setProperty('--value', `${value * 100}%`);
                    const r = 1 - value;
                    const g = 1 - value;
                    const b = 1 - value;
                    const color = new THREE.Color(r, g, b);
                    this.weatherSystem.cloudSystem.cloudColor = color;
                    break;
                    
                case 'cloudOpacity':
                    this.sliders.cloudOpacity.value = value;
                    this.valueDisplays.cloudOpacity.textContent = value.toFixed(2);
                    this.sliders.cloudOpacity.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.cloudSystem.cloudOpacity = value;
                    break;
                    
                case 'fogDensity':
                    this.sliders.fog.value = value;
                    this.valueDisplays.fog.textContent = value.toFixed(2);
                    this.sliders.fog.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.fogEffect.fogDensity = value;
                    break;
                    
                case 'windStrength':
                    this.sliders.wind.value = value;
                    this.valueDisplays.wind.textContent = value.toFixed(2);
                    this.sliders.wind.style.setProperty('--value', `${value}%`);
                    // Conversion de 0-100 à 0-5 pour le windStrength
                    const windStrength = (value / 100) * 5;
                    this.experience.world.setWindStrength(windStrength);
                    break;
                    
                case 'grassBendStrength':
                    this.sliders.grassBend.value = value;
                    this.valueDisplays.grassBend.textContent = value.toFixed(2);
                    this.sliders.grassBend.style.setProperty('--value', `${value}%`);
                    // Conversion de 0-100 à 0-1.5 pour l'inclinaison
                    const bendStrength = (value / 100) * 1.5;
                    this.experience.world.setGrassBendStrength(bendStrength);
                    break;
                    
                case 'grassInclinationStrength':
                    this.sliders.grassInclination.value = value;
                    this.valueDisplays.grassInclination.textContent = value.toFixed(2);
                    this.sliders.grassInclination.style.setProperty('--value', `${value}%`);
                    // Conversion de 0-100 à 0-1.0 pour l'inclinaison
                    const inclinationStrength = (value / 100);
                    this.experience.world.setGrassInclinationStrength(inclinationStrength);
                    break;
                    
                case 'lightningIntensity':
                    this.sliders.lightning.value = value;
                    this.valueDisplays.lightning.textContent = value.toFixed(2);
                    this.sliders.lightning.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.lightningEffect.intensity = value;
                    break;
                    
                case 'rainbowOpacity':
                    this.sliders.rainbow.value = value;
                    this.valueDisplays.rainbow.textContent = value.toFixed(2);
                    this.sliders.rainbow.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.rainbowEffect.setOpacity(value);
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

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.container.style.display = 'block';
        
        // Mettre à jour l'état du bouton
        const weatherButton = document.querySelector('#weather-toggle');
        if (weatherButton) {
            weatherButton.classList.add('active');
        }
        
        // Mettre à jour l'état dans Experience
        this.experience.updateUIState('weather', true);
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.container.style.display = 'none';
        
        // Mettre à jour l'état du bouton
        const weatherButton = document.querySelector('#weather-toggle');
        if (weatherButton) {
            weatherButton.classList.remove('active');
        }
        
        // Mettre à jour l'état dans Experience
        this.experience.updateUIState('weather', false);
    }

    toggleVisibility() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
} 