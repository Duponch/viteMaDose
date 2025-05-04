/**
 * Système de météo pour le jeu
 * Gère les différents effets météorologiques (pluie, brouillard, nuages, etc.)
 * et les transitions entre eux.
 */
import * as THREE from 'three';
import RainEffect from './Effects/RainEffect.js';
import FogEffect from './Effects/FogEffect.js';
import CloudSystem from './Effects/CloudSystem.js';
import WeatherState from './WeatherState.js';

export default class WeatherSystem {
    /**
     * @param {Object} experience - L'instance principale du jeu
     * @param {Object} environment - L'instance de l'environnement du jeu
     */
    constructor(experience, environment) {
        this.experience = experience;
        this.environment = environment;
        this.scene = this.experience.scene;
        this.time = this.experience.time;
        this.camera = this.experience.camera;
        
        // Configuration
        this.debug = this.experience.debug;
        this.enabled = true;
        this.transitionDuration = 10000; // Durée de transition en ms
        this.autoWeatherChangeProbability = 0.001; // Chance à chaque update de changer la météo
        this.minWeatherDuration = 60000; // Durée minimale d'une météo (1 minute)
        
        // État météorologique actuel et cible (pour transitions)
        this.currentWeatherState = new WeatherState('clear');
        this.targetWeatherState = this.currentWeatherState.clone();
        this.transitionProgress = 1.0; // 1.0 = transition terminée
        this.lastWeatherChangeTime = 0;
        
        // Créer les sous-systèmes
        this.rainEffect = new RainEffect(this);
        this.fogEffect = new FogEffect(this);
        this.cloudSystem = new CloudSystem(this);
        
        // Liste de tous les effets pour itération facile
        this.effects = [
            this.rainEffect,
            this.fogEffect,
            this.cloudSystem
        ];
        
        // Préréglages de météo
        this.weatherPresets = {
            clear: {
                name: 'Ciel dégagé',
                cloudDensity: 0.1,
                cloudOpacity: 0.3,
                rainIntensity: 0,
                fogDensity: 0,
                sunBrightness: 1.0
            },
            partlyCloudy: {
                name: 'Partiellement nuageux',
                cloudDensity: 0.4,
                cloudOpacity: 0.6,
                rainIntensity: 0,
                fogDensity: 0,
                sunBrightness: 0.8
            },
            cloudy: {
                name: 'Nuageux',
                cloudDensity: 0.7,
                cloudOpacity: 0.9,
                rainIntensity: 0,
                fogDensity: 0.1,
                sunBrightness: 0.6
            },
            lightRain: {
                name: 'Pluie légère',
                cloudDensity: 0.8,
                cloudOpacity: 0.9,
                rainIntensity: 0.3,
                fogDensity: 0.2,
                sunBrightness: 0.5
            },
            heavyRain: {
                name: 'Fortes pluies',
                cloudDensity: 1.0,
                cloudOpacity: 1.0,
                rainIntensity: 0.8,
                fogDensity: 0.3,
                sunBrightness: 0.3
            },
            foggy: {
                name: 'Brouillard',
                cloudDensity: 0.4,
                cloudOpacity: 0.5,
                rainIntensity: 0,
                fogDensity: 0.8,
                sunBrightness: 0.4
            }
        };
        
        // Initialiser avec météo par défaut
        this.setWeather('clear');
        
        console.log("Système météorologique initialisé");
    }
    
    /**
     * Définit la météo actuelle avec transition
     * @param {string} presetName - Nom du préréglage météo à appliquer
     * @param {boolean} instantTransition - Si vrai, la transition est instantanée
     */
    setWeather(presetName, instantTransition = false) {
        if (!this.weatherPresets[presetName]) {
            console.warn(`Préréglage météo inconnu: ${presetName}`);
            return;
        }
        
        const now = this.time.elapsed;
        
        // Vérifier si on peut changer la météo (durée minimale)
        if (now - this.lastWeatherChangeTime < this.minWeatherDuration && !instantTransition) {
            console.log("Trop tôt pour changer la météo");
            return;
        }
        
        // Enregistrer l'état actuel comme point de départ pour la transition
        this.currentWeatherState = new WeatherState(
            this.targetWeatherState.type,
            this.cloudSystem.cloudDensity,
            this.cloudSystem.cloudOpacity,
            this.rainEffect.intensity,
            this.fogEffect.fogDensity,
            this.environment.sunLight.intensity / 3.0 // Normaliser par rapport à l'intensité max (3.0)
        );
        
        // Configurer l'état cible avec le nouveau préréglage
        const preset = this.weatherPresets[presetName];
        this.targetWeatherState = new WeatherState(
            presetName,
            preset.cloudDensity,
            preset.cloudOpacity,
            preset.rainIntensity, 
            preset.fogDensity,
            preset.sunBrightness
        );
        
        // Démarrer la transition
        this.transitionProgress = instantTransition ? 1.0 : 0.0;
        this.lastWeatherChangeTime = now;
        
        console.log(`Changement météo vers: ${preset.name}${instantTransition ? ' (instantané)' : ' (avec transition)'}`);
    }
    
    /**
     * Considère un changement météo aléatoire en fonction de la probabilité
     */
    considerRandomWeatherChange() {
        if (Math.random() < this.autoWeatherChangeProbability) {
            // Sélectionner un préréglage aléatoire différent du préréglage actuel
            const presetNames = Object.keys(this.weatherPresets);
            const currentType = this.targetWeatherState.type;
            const availablePresets = presetNames.filter(name => name !== currentType);
            
            if (availablePresets.length > 0) {
                const randomPreset = availablePresets[Math.floor(Math.random() * availablePresets.length)];
                this.setWeather(randomPreset);
            }
        }
    }
    
    /**
     * Met à jour les transitions et tous les effets météorologiques
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.enabled) return;
        
        // Mettre à jour la progression de la transition
        if (this.transitionProgress < 1.0) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            this.transitionProgress = Math.min(this.transitionProgress, 1.0);
            
            // Interpoler entre les états météorologiques actuels et cibles
            const t = this.transitionProgress;
            
            // Transition des nuages
            this.cloudSystem.cloudDensity = THREE.MathUtils.lerp(
                this.currentWeatherState.cloudDensity, 
                this.targetWeatherState.cloudDensity, 
                t
            );
            this.cloudSystem.cloudOpacity = THREE.MathUtils.lerp(
                this.currentWeatherState.cloudOpacity, 
                this.targetWeatherState.cloudOpacity, 
                t
            );
            
            // Transition de la pluie
            this.rainEffect.intensity = THREE.MathUtils.lerp(
                this.currentWeatherState.rainIntensity, 
                this.targetWeatherState.rainIntensity, 
                t
            );
            
            // Transition du brouillard
            this.fogEffect.fogDensity = THREE.MathUtils.lerp(
                this.currentWeatherState.fogDensity, 
                this.targetWeatherState.fogDensity, 
                t
            );
            
            // Transition de la luminosité du soleil
            // Multiplier par 3.0 car c'est l'intensité max du soleil dans Environment
            const targetSunIntensity = this.targetWeatherState.sunBrightness * 3.0;
            const currentSunIntensity = this.currentWeatherState.sunBrightness * 3.0;
            const interpolatedIntensity = THREE.MathUtils.lerp(currentSunIntensity, targetSunIntensity, t);
            
            // Appliquer la nouvelle intensité (mais préserver variation jour/nuit)
            if (this.environment.sunLight) {
                const dayFactor = this.environment.skyUniforms.uDayFactor.value;
                const nightIntensity = this.environment.sunIntensity.night;
                const maxDayIntensity = interpolatedIntensity;
                this.environment.sunLight.intensity = THREE.MathUtils.lerp(nightIntensity, maxDayIntensity, dayFactor);
                
                // Mettre à jour la configuration de l'environnement pour que le cycle jour/nuit l'utilise
                this.environment.sunIntensity.day = maxDayIntensity;
            }
        }
        
        // Considérer un changement météo aléatoire
        this.considerRandomWeatherChange();
        
        // Mettre à jour tous les effets
        for (const effect of this.effects) {
            if (effect.update) {
                effect.update(deltaTime);
            }
        }
    }
    
    /**
     * Nettoie toutes les ressources utilisées par le système météo
     */
    destroy() {
        // Détruire tous les effets
        for (const effect of this.effects) {
            if (effect.destroy) {
                effect.destroy();
            }
        }
        
        // Nettoyer les références
        this.effects = [];
        this.rainEffect = null;
        this.fogEffect = null;
        this.cloudSystem = null;
        
        console.log("Système météorologique nettoyé");
    }
} 