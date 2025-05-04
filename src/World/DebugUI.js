import * as dat from 'lil-gui';

export default class DebugUI {
    constructor(experience) {
        this.experience = experience;
        this.active = window.location.hash === '#debug';
        
        if (!this.active) return;
        
        this.ui = new dat.GUI({width: 310});
        
        this.addMiscFolder();
    }
    
    addMiscFolder() {
        const miscFolder = this.ui.addFolder('Divers');
        miscFolder.add(this.experience.world.environment.sky.sun, 'intensity').min(0).max(2).step(0.001).name('Soleil');
        
        // Ajouter le dossier météo
        this.addWeatherFolder();
    }
    
    addWeatherFolder() {
        const weatherFolder = this.ui.addFolder('Météo');
        
        // Ajouter un sous-dossier pour les tests de performance
        const perfFolder = weatherFolder.addFolder('Tests de Performance');
        perfFolder.add({ runTest: () => this.runPerformanceTest() }, 'runTest').name('Tester FPS Pluie');
        
        // Contrôles de météo
        const weatherSystem = this.experience.world.weatherSystem;
        if (weatherSystem) {
            weatherFolder.add(weatherSystem, 'cloudDensity').min(0).max(1).step(0.01).name('Densité nuages');
            weatherFolder.add(weatherSystem, 'cloudOpacity').min(0).max(1).step(0.01).name('Opacité nuages');
            weatherFolder.add(weatherSystem, 'rainIntensity').min(0).max(1).step(0.01).name('Intensité pluie');
            weatherFolder.add(weatherSystem, 'fogDensity').min(0).max(1).step(0.01).name('Densité brouillard');
            
            // Préréglages de météo
            const presetOptions = {};
            Object.keys(weatherSystem.weatherPresets).forEach(key => {
                presetOptions[weatherSystem.weatherPresets[key].name] = key;
            });
            
            weatherFolder.add({ preset: 'clear' }, 'preset', presetOptions)
                .name('Préréglages')
                .onChange(value => weatherSystem.applyWeatherPreset(value));
        }
    }
    
    /**
     * Lance un test de performance pour la pluie
     */
    runPerformanceTest() {
        if (!this.experience.world.weatherSystem) return;
        
        const weatherSystem = this.experience.world.weatherSystem;
        
        // Vérifier si une mesure est déjà en cours
        if (weatherSystem.perfMeasures.isMeasuring) {
            console.log("⚠️ Un test de performance est déjà en cours...");
            return;
        }
        
        // Lancer la mesure
        weatherSystem.startPerformanceMeasurement("Test de performance de la pluie avec instancing");
        
        // Afficher un message à l'utilisateur
        console.log("🌧️ Test en cours... Veuillez patienter 10 secondes.");
        alert("Test de performance en cours (10 secondes). Les résultats seront affichés dans la console (F12).");
    }
} 