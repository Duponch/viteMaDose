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
                    leavesCount: 8,       // Valeur par défaut: 8
                    leavesSpeed: 0.53,    // Valeur par défaut: 0.53 (53%)
                    cloudDensity: 0.3,    // Valeur par défaut dans CloudSystem
                    cloudColor: 0,        // Valeur 0 = blanc (défaut), 1 = noir
                    cloudOpacity: 0.5,    // Valeur par défaut dans CloudSystem
                    fogDensity: 0.03,     // Valeur par défaut du brouillard
                    
                    // Nouveaux paramètres simplifiés
                    grassAnimationSpeed: 1.0,     // Vitesse d'animation (1.0 = normale)
                    grassTorsionAmplitude: 1.0,   // Amplitude de torsion/plis (1.0 = normale)
                    grassInclinationAmplitude: 1.0, // Amplitude d'inclinaison (1.0 = normale)
                    
                    lightningIntensity: 0, // Pas d'éclairs par défaut
                    rainbowOpacity: 0,      // Pas d'arc-en-ciel par défaut
                    
                    // Nouveau paramètre pour l'orage
                    stormIntensity: 0,      // Pas d'orage par défaut
                };
                
                // Valeurs maximales pour l'orage
                this.stormMaxValues = {
                    rainIntensity: 1.0,        // 100% de 1.0
                    cloudDensity: 1.0,         // 100% de 1.0
                    cloudColor: 1.0,           // 100% de 1.0
                    cloudOpacity: 0.83,        // 83% de 1.0
                    fogDensity: 0.15,          // 15% de 1.0
                    grassAnimationSpeed: 700,  // 100% de la valeur max du curseur
                    grassTorsionAmplitude: 500,// 100% de la valeur max du curseur
                    grassInclinationAmplitude: 600, // 100% de la valeur max du curseur
                    lightningIntensity: 0.2,   // 70% de 1.0
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
        
        // Créer le nouveau curseur d'orage en premier
        this.createSlider('Orage', 'storm', 0, 100, 1, 0);
        
        // Séparateur après le curseur d'orage
        const separator = document.createElement('div');
        separator.className = 'slider-separator';
        separator.style.margin = '10px 0';
        separator.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        this.container.appendChild(separator);
        
        // Créer les curseurs pour chaque paramètre
        this.createSlider('Pluie', 'rain', 0, 1, 0.01, this.weatherSystem.rainEffect.intensity);
        this.createSlider('Nombre de feuilles', 'leaves-count', 0, 100, 1, this.defaultValues.leavesCount);
        this.createSlider('Vitesse des feuilles', 'leaves-speed', 0, 100, 1, this.defaultValues.leavesSpeed * 100); // Convertir en pourcentage
        this.createSlider('Nombre de nuages', 'cloud-density', 0, 1, 0.01, this.weatherSystem.cloudSystem.cloudDensity);
        this.createSlider('Couleur des nuages', 'cloud-color', 0, 1, 0.01, 0); // 0 = blanc, 1 = noir
        this.createSlider('Opacité des nuages', 'cloud-opacity', 0, 1, 0.01, this.weatherSystem.cloudSystem.cloudOpacity);
        this.createSlider('Brouillard', 'fog', 0, 1, 0.01, this.weatherSystem.fogEffect.fogDensity);
        
        // Nouveaux curseurs simplifiés pour l'animation de l'herbe
        this.createSlider('Vitesse animation herbe', 'grass-animation-speed', 0, 700, 1, 100); // 0-800% (100% = vitesse normale)
        this.createSlider('Torsion/plis herbe', 'grass-torsion-amplitude', 0, 500, 1, 100); // 0-800% (100% = amplitude normale)
        this.createSlider('Inclinaison herbe', 'grass-inclination-amplitude', 0, 600, 1, 100); // 0-800% (100% = amplitude normale)
        
        this.createSlider('Éclairs', 'lightning', 0, 1, 0.01, this.weatherSystem.lightningEffect.intensity);
        this.createSlider('Arc-en-ciel', 'rainbow', 0, 1, 0.01, this.weatherSystem.rainbowEffect.opacity);
        
        // S'assurer que l'herbe est bien droite dès l'initialisation
        if (this.experience.world) {
            // Réinitialiser tous les paramètres d'herbe
            this.experience.world.resetGrass();
            
            // Appliquer les valeurs initiales des nouveaux paramètres simplifiés
            this.experience.world.setGrassAnimationSpeed(1.0);
            this.experience.world.setGrassTorsionAmplitude(1.0);
            this.experience.world.setGrassInclinationAmplitude(1.0);
        }
        
        // Appliquer directement les valeurs par défaut des feuilles au rendu
        this.weatherSystem.leavesEffect.setLeavesPercentage(this.defaultValues.leavesCount);
        this.weatherSystem.leavesEffect.setSpeedFactor(this.defaultValues.leavesSpeed);
        
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
            storm: this.container.querySelector('#slider-storm'),
            rain: this.container.querySelector('#slider-rain'),
            leavesCount: this.container.querySelector('#slider-leaves-count'),
            leavesSpeed: this.container.querySelector('#slider-leaves-speed'),
            cloudDensity: this.container.querySelector('#slider-cloud-density'),
            cloudColor: this.container.querySelector('#slider-cloud-color'),
            cloudOpacity: this.container.querySelector('#slider-cloud-opacity'),
            fog: this.container.querySelector('#slider-fog'),
            
            // Nouveaux sliders simplifiés
            grassAnimationSpeed: this.container.querySelector('#slider-grass-animation-speed'),
            grassTorsionAmplitude: this.container.querySelector('#slider-grass-torsion-amplitude'),
            grassInclinationAmplitude: this.container.querySelector('#slider-grass-inclination-amplitude'),
            
            lightning: this.container.querySelector('#slider-lightning'),
            rainbow: this.container.querySelector('#slider-rainbow')
        };
        
        this.valueDisplays = {
            storm: this.container.querySelector('#value-storm'),
            rain: this.container.querySelector('#value-rain'),
            leavesCount: this.container.querySelector('#value-leaves-count'),
            leavesSpeed: this.container.querySelector('#value-leaves-speed'),
            cloudDensity: this.container.querySelector('#value-cloud-density'),
            cloudColor: this.container.querySelector('#value-cloud-color'),
            cloudOpacity: this.container.querySelector('#value-cloud-opacity'),
            fog: this.container.querySelector('#value-fog'),
            
            // Nouveaux value displays simplifiés
            grassAnimationSpeed: this.container.querySelector('#value-grass-animation-speed'),
            grassTorsionAmplitude: this.container.querySelector('#value-grass-torsion-amplitude'),
            grassInclinationAmplitude: this.container.querySelector('#value-grass-inclination-amplitude'),
            
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
        valueEl.textContent = initialValue !== null && initialValue !== undefined ? initialValue.toFixed(2) : "0.00";
        
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
            valueEl.textContent = value !== null && value !== undefined ? value.toFixed(2) : "0.00";
            slider.style.setProperty('--value', `${(value - min) / (max - min) * 100}%`);
            
            // Gérer spécialement le curseur d'orage
            if (id === 'storm') {
                this.updateStormParameter(value / 100); // Normaliser à 0-1
            } else {
                // Mettre à jour le paramètre correspondant dans le système météo
                this.updateWeatherParameter(id, value);
            }
        });
        
        // Initialiser la valeur CSS
        slider.style.setProperty('--value', `${(initialValue - min) / (max - min) * 100}%`);
        
        sliderContainer.appendChild(slider);
        this.container.appendChild(sliderContainer);
    }
    
    /**
     * Met à jour tous les paramètres météo en fonction de l'intensité de l'orage
     * @param {number} intensity - Intensité de l'orage (0-1)
     */
    updateStormParameter(intensity) {
        if (!this.weatherSystem) return;
        
        // Récupérer les valeurs maximales des curseurs d'herbe
        const grassSpeedMax = this.sliders.grassAnimationSpeed.max;
        const grassTorsionMax = this.sliders.grassTorsionAmplitude.max;
        const grassInclinationMax = this.sliders.grassInclinationAmplitude.max;
        
        // Mettre à jour tous les paramètres proportionnellement
        const parameters = [
            { name: 'rain', defaultValue: this.defaultValues.rainIntensity, maxValue: this.stormMaxValues.rainIntensity },
            { name: 'leaves-count', defaultValue: this.defaultValues.leavesCount, maxValue: 80 },
            { name: 'leaves-speed', defaultValue: this.defaultValues.leavesSpeed * 100, maxValue: 180 },
            { name: 'cloud-density', defaultValue: this.defaultValues.cloudDensity, maxValue: this.stormMaxValues.cloudDensity },
            { name: 'cloud-color', defaultValue: this.defaultValues.cloudColor, maxValue: this.stormMaxValues.cloudColor },
            { name: 'cloud-opacity', defaultValue: this.defaultValues.cloudOpacity, maxValue: this.stormMaxValues.cloudOpacity },
            { name: 'fog', defaultValue: this.defaultValues.fogDensity, maxValue: this.stormMaxValues.fogDensity },
            { name: 'grass-animation-speed', defaultValue: 100, maxValue: grassSpeedMax }, // Utilise la valeur max du curseur
            { name: 'grass-torsion-amplitude', defaultValue: 100, maxValue: grassTorsionMax }, // Utilise la valeur max du curseur
            { name: 'grass-inclination-amplitude', defaultValue: 100, maxValue: grassInclinationMax }, // Utilise la valeur max du curseur
            { name: 'lightning', defaultValue: this.defaultValues.lightningIntensity, maxValue: this.stormMaxValues.lightningIntensity }
        ];
        
        // Mettre à jour chaque paramètre
        parameters.forEach(param => {
            // Calculer la nouvelle valeur interpolée entre la valeur par défaut et la valeur max
            const newValue = param.defaultValue + (param.maxValue - param.defaultValue) * intensity;
            
            // Mettre à jour le slider et le texte d'affichage
            const slider = this.sliders[this.paramNameToSliderKey(param.name)];
            const valueDisplay = this.valueDisplays[this.paramNameToSliderKey(param.name)];
            
            if (slider && valueDisplay) {
                slider.value = newValue;
                valueDisplay.textContent = newValue.toFixed(2);
                slider.style.setProperty('--value', `${(newValue - slider.min) / (slider.max - slider.min) * 100}%`);
                
                // Mettre à jour le paramètre dans le système météo
                this.updateWeatherParameter(param.name, newValue);
            }
        });
    }
    
    /**
     * Convertit un nom de paramètre en clé de slider
     * @param {string} paramName - Nom du paramètre (ex: 'rain', 'cloud-density')
     * @returns {string} - Clé de slider correspondante (ex: 'rain', 'cloudDensity')
     */
    paramNameToSliderKey(paramName) {
        switch(paramName) {
            case 'leaves-count': return 'leavesCount';
            case 'leaves-speed': return 'leavesSpeed';
            case 'cloud-density': return 'cloudDensity';
            case 'cloud-color': return 'cloudColor';
            case 'cloud-opacity': return 'cloudOpacity';
            case 'grass-animation-speed': return 'grassAnimationSpeed';
            case 'grass-torsion-amplitude': return 'grassTorsionAmplitude';
            case 'grass-inclination-amplitude': return 'grassInclinationAmplitude';
            default: return paramName;
        }
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
                
            case 'leaves-count':
                this.sliders.leavesCount.value = value;
                this.valueDisplays.leavesCount.textContent = value.toFixed(2);
                this.sliders.leavesCount.style.setProperty('--value', `${value}%`);
                this.weatherSystem.leavesEffect.setLeavesPercentage(value);
                break;
                
            case 'leaves-speed':
                // Convertir la valeur 0-100 en facteur de vitesse (0.1-2.0)
                const speed = (value / 100) * 1.9 + 0.1; // 0.1 à 2.0
                this.weatherSystem.leavesEffect.setSpeedFactor(speed);
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
                
            case 'grass-animation-speed':
                if (this.experience.world) {
                    // Conversion de 0-400 à 0.1-2.0 pour la vitesse d'animation
                    const speed = value / 100;
                    this.experience.world.setGrassAnimationSpeed(speed);
                }
                break;
                
            case 'grass-torsion-amplitude':
                if (this.experience.world) {
                    // Conversion de 0-400 à 0.1-2.0 pour l'amplitude de torsion
                    const amplitude = value / 100;
                    this.experience.world.setGrassTorsionAmplitude(amplitude);
                }
                break;
                
            case 'grass-inclination-amplitude':
                if (this.experience.world) {
                    // Conversion de 0-400 à 0.1-2.0 pour l'amplitude d'inclinaison
                    const amplitude = value / 100;
                    this.experience.world.setGrassInclinationAmplitude(amplitude);
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
        
        // Réinitialiser d'abord le curseur d'orage
        this.sliders.storm.value = 0;
        this.valueDisplays.storm.textContent = "0.00";
        this.sliders.storm.style.setProperty('--value', '0%');
        
        // Mettre à jour les curseurs et les valeurs affichées
        for (const [key, value] of Object.entries(this.defaultValues)) {
            switch (key) {
                case 'rainIntensity':
                    this.sliders.rain.value = value;
                    this.valueDisplays.rain.textContent = value.toFixed(2);
                    this.sliders.rain.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.rainEffect.intensity = value;
                    break;
                    
                case 'leavesCount':
                    this.sliders.leavesCount.value = value;
                    this.valueDisplays.leavesCount.textContent = value.toFixed(2);
                    this.sliders.leavesCount.style.setProperty('--value', `${value}%`);
                    this.weatherSystem.leavesEffect.setLeavesPercentage(value);
                    break;
                    
                case 'leavesSpeed':
                    this.sliders.leavesSpeed.value = value * 100; // Convertir en pourcentage
                    this.valueDisplays.leavesSpeed.textContent = (value * 100).toFixed(0);
                    this.sliders.leavesSpeed.style.setProperty('--value', `${value * 100}%`);
                    this.weatherSystem.leavesEffect.setSpeedFactor(value);
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
                
                case 'grassAnimationSpeed':
                    this.sliders.grassAnimationSpeed.value = value * 100; // Convertir en pourcentage
                    this.valueDisplays.grassAnimationSpeed.textContent = (value * 100).toFixed(0);
                    this.sliders.grassAnimationSpeed.style.setProperty('--value', `${value * 100}%`);
                    this.experience.world.setGrassAnimationSpeed(value);
                    break;
                    
                case 'grassTorsionAmplitude':
                    this.sliders.grassTorsionAmplitude.value = value * 100; // Convertir en pourcentage
                    this.valueDisplays.grassTorsionAmplitude.textContent = (value * 100).toFixed(0);
                    this.sliders.grassTorsionAmplitude.style.setProperty('--value', `${value * 100}%`);
                    this.experience.world.setGrassTorsionAmplitude(value);
                    break;
                    
                case 'grassInclinationAmplitude':
                    this.sliders.grassInclinationAmplitude.value = value * 100; // Convertir en pourcentage
                    this.valueDisplays.grassInclinationAmplitude.textContent = (value * 100).toFixed(0);
                    this.sliders.grassInclinationAmplitude.style.setProperty('--value', `${value * 100}%`);
                    this.experience.world.setGrassInclinationAmplitude(value);
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