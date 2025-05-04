/**
 * Effet de brouillard pour le système météorologique
 * Gère la densité et la couleur du brouillard dans la scène
 */
import * as THREE from 'three';

export default class FogEffect {
    /**
     * @param {Object} weatherSystem - Référence au système météo principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.scene = weatherSystem.scene;
        this.experience = weatherSystem.experience;
        
        // Configuration
        this._fogDensity = 0;        // Densité du brouillard (0-1)
        this.minFogExp = 0.0005;     // Densité minimale du brouillard exponentiel
        this.maxFogExp = 0.035;      // Densité maximale du brouillard exponentiel
        
        // Sauvegarder le brouillard original
        this.originalFog = this.scene.fog ? this.scene.fog.clone() : null;
        this.originalFogType = this.originalFog ? 
            (this.originalFog instanceof THREE.FogExp2 ? 'exp2' : 'linear') : null;
        this.originalFogParams = this.saveFogParams();
        
        // Couleurs du brouillard pour différentes conditions
        this.fogColors = {
            clear: new THREE.Color(0x8cb6de),
            cloudy: new THREE.Color(0x94a3b8),
            rainy: new THREE.Color(0x64748b),
            heavyRain: new THREE.Color(0x475569),
            foggy: new THREE.Color(0xd1d5db)
        };
        
        console.log(`Effet de brouillard initialisé, type original: ${this.originalFogType || 'aucun'}`);
    }
    
    /**
     * Enregistre les paramètres du brouillard d'origine
     * @returns {Object} Paramètres sauvegardés
     */
    saveFogParams() {
        if (!this.scene.fog) return null;
        
        if (this.scene.fog instanceof THREE.FogExp2) {
            return {
                density: this.scene.fog.density,
                color: this.scene.fog.color.clone()
            };
        } else if (this.scene.fog instanceof THREE.Fog) {
            return {
                near: this.scene.fog.near,
                far: this.scene.fog.far,
                color: this.scene.fog.color.clone()
            };
        }
        
        return null;
    }
    
    /**
     * Calcule la couleur du brouillard en fonction des conditions météo
     * @returns {THREE.Color} Couleur du brouillard adaptée
     */
    calculateFogColor() {
        // Par défaut, utiliser la couleur du ciel
        const skyColor = this.weatherSystem.environment.skyUniforms?.uCurrentHorizonColor?.value;
        const currentWeather = this.weatherSystem.targetWeatherState?.type || 'clear';
        
        // Couleur de base selon la météo
        let baseColor;
        if (currentWeather.includes('rain')) {
            baseColor = this.fogColors.rainy;
            if (currentWeather === 'heavyRain') {
                baseColor = this.fogColors.heavyRain;
            }
        } else if (currentWeather === 'foggy') {
            baseColor = this.fogColors.foggy;
        } else if (currentWeather === 'cloudy') {
            baseColor = this.fogColors.cloudy;
        } else {
            baseColor = this.fogColors.clear;
        }
        
        // Mélanger avec la couleur du ciel si disponible
        if (skyColor) {
            const result = new THREE.Color();
            return result.lerpColors(baseColor, skyColor, 0.3); // 70% couleur météo, 30% couleur ciel
        }
        
        return baseColor;
    }
    
    /**
     * Met à jour l'effet de brouillard
     */
    update() {
        // Si la densité est nulle et qu'il n'y a pas de brouillard, rien à faire
        if (this._fogDensity <= 0.001 && !this.scene.fog) return;
        
        // Si la densité est presque nulle, essayer de restaurer le brouillard original
        if (this._fogDensity <= 0.001) {
            this.restoreOriginalFog();
            return;
        }
        
        // Calculer la couleur adaptée à la météo
        const fogColor = this.calculateFogColor();
        
        // Calculer la densité entre min et max selon l'intensité
        const fogDensity = THREE.MathUtils.lerp(
            this.minFogExp, 
            this.maxFogExp, 
            this._fogDensity
        );
        
        // Si le brouillard n'existe pas, en créer un nouveau
        if (!this.scene.fog) {
            this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
            return;
        }
        
        // Mettre à jour le brouillard existant
        this.scene.fog.color.copy(fogColor);
        
        // Adapter selon le type de brouillard
        if (this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.density = fogDensity;
        } else if (this.scene.fog instanceof THREE.Fog) {
            // Convertir la densité exponentielle en valeurs near/far pour Fog linéaire
            // Plus la densité est élevée, plus 'far' est petit
            const baseFar = 2000;
            const near = 10;
            const far = baseFar / (1 + fogDensity * 100);
            
            this.scene.fog.near = near;
            this.scene.fog.far = far;
        }
    }
    
    /**
     * Restaure le brouillard original de la scène
     */
    restoreOriginalFog() {
        if (!this.originalFogType) {
            // S'il n'y avait pas de brouillard à l'origine, supprimer celui actuel
            this.scene.fog = null;
            return;
        }
        
        // Restaurer le type et les paramètres du brouillard d'origine
        if (this.originalFogType === 'exp2') {
            this.scene.fog = new THREE.FogExp2(
                this.originalFogParams.color,
                this.originalFogParams.density
            );
        } else {
            this.scene.fog = new THREE.Fog(
                this.originalFogParams.color,
                this.originalFogParams.near,
                this.originalFogParams.far
            );
        }
    }
    
    /**
     * Définit la densité du brouillard
     * @param {number} density - Densité du brouillard (0-1)
     */
    set fogDensity(density) {
        const oldDensity = this._fogDensity;
        this._fogDensity = THREE.MathUtils.clamp(density, 0, 1);
        
        // Mettre à jour immédiatement si le changement est significatif
        if (Math.abs(oldDensity - this._fogDensity) > 0.01) {
            this.update();
        }
    }
    
    /**
     * Obtient la densité actuelle du brouillard
     * @returns {number} - Densité (0-1)
     */
    get fogDensity() {
        return this._fogDensity;
    }
    
    /**
     * Nettoie les ressources et restaure l'état d'origine
     */
    destroy() {
        this.restoreOriginalFog();
    }
} 