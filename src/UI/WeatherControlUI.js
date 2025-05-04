/**
 * Interface utilisateur pour contrôler le système météorologique
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
                this.init();
            }
        }, 1000);
    }
    
    /**
     * Initialise l'interface utilisateur
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
        this.container.style.padding = '10px';
        this.container.style.borderRadius = '5px';
        this.container.style.color = 'white';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.fontSize = '14px';
        
        // Titre
        const title = document.createElement('h3');
        title.textContent = 'Contrôle Météo';
        title.style.margin = '0 0 10px 0';
        title.style.textAlign = 'center';
        this.container.appendChild(title);
        
        // Liste des préréglages météo disponibles
        const presets = this.weatherSystem.weatherPresets;
        this.presetSelect = document.createElement('select');
        this.presetSelect.style.width = '100%';
        this.presetSelect.style.padding = '5px';
        this.presetSelect.style.marginBottom = '10px';
        this.presetSelect.style.backgroundColor = '#333';
        this.presetSelect.style.color = 'white';
        this.presetSelect.style.border = '1px solid #666';
        
        // Ajouter les options
        for (const key in presets) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = presets[key].name;
            this.presetSelect.appendChild(option);
        }
        
        // Événement de changement de météo
        this.presetSelect.addEventListener('change', () => {
            const selectedPreset = this.presetSelect.value;
            this.weatherSystem.setWeather(selectedPreset);
        });
        
        this.container.appendChild(this.presetSelect);
        
        // Option de changement météo aléatoire
        const randomDiv = document.createElement('div');
        randomDiv.style.display = 'flex';
        randomDiv.style.alignItems = 'center';
        randomDiv.style.marginBottom = '10px';
        
        const randomCheckbox = document.createElement('input');
        randomCheckbox.type = 'checkbox';
        randomCheckbox.id = 'weather-random';
        randomCheckbox.checked = false;
        
        const randomLabel = document.createElement('label');
        randomLabel.htmlFor = 'weather-random';
        randomLabel.textContent = 'Changement aléatoire';
        randomLabel.style.marginLeft = '5px';
        
        randomDiv.appendChild(randomCheckbox);
        randomDiv.appendChild(randomLabel);
        
        // Événement de changement de l'option aléatoire
        randomCheckbox.addEventListener('change', () => {
            const isRandom = randomCheckbox.checked;
            this.weatherSystem.autoWeatherChangeProbability = isRandom ? 0.001 : 0;
            this.presetSelect.disabled = isRandom;
        });
        
        this.container.appendChild(randomDiv);
        
        // Bouton pour météo instantanée (sans transition)
        const instantButton = document.createElement('button');
        instantButton.textContent = 'Appliquer instantanément';
        instantButton.style.width = '100%';
        instantButton.style.padding = '5px';
        instantButton.style.backgroundColor = '#555';
        instantButton.style.color = 'white';
        instantButton.style.border = '1px solid #777';
        instantButton.style.cursor = 'pointer';
        
        instantButton.addEventListener('click', () => {
            const selectedPreset = this.presetSelect.value;
            this.weatherSystem.setWeather(selectedPreset, true); // transition instantanée
        });
        
        this.container.appendChild(instantButton);
        
        // Ajouter l'interface au document
        document.body.appendChild(this.container);
        
        console.log("Interface de contrôle météo initialisée");
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
    }
} 