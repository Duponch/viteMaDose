/**
 * Effet de brouillard pour le système météorologique
 * Gère la densité et la couleur du brouillard dans la scène
 * Version corrigée pour éviter le clignotement
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
        this._fogDensity = 0.03;        // Densité du brouillard (0-1)
        this.minFogExp = 0;     // Densité minimale du brouillard exponentiel
        this.maxFogExp = 0.02;       // Densité maximale du brouillard exponentiel
        this.isUpdating = false;     // Verrou pour éviter les mises à jour concurrentes
        this.needsUpdate = false;    // Drapeau pour indiquer qu'une mise à jour est nécessaire
        
        // Sauvegarder le brouillard original
        this.originalFog = this.scene.fog ? this.scene.fog.clone() : null;
        this.originalFogType = this.originalFog ? 
            (this.originalFog instanceof THREE.FogExp2 ? 'exp2' : 'linear') : null;
        this.originalFogParams = this.saveFogParams();
        
        // Créer notre propre instance de brouillard que nous gérerons exclusivement
        this.weatherFog = null;
        
        // Couleurs du brouillard pour différentes conditions
        this.fogColors = {
            clear: new THREE.Color(0x8cb6de),
            cloudy: new THREE.Color(0x94a3b8),
            rainy: new THREE.Color(0x64748b),
            heavyRain: new THREE.Color(0x475569),
            foggy: new THREE.Color(0xd1d5db)
        };
        
        // Initialiser notre brouillard si nécessaire
        this.initWeatherFog();
        
        console.log(`Effet de brouillard initialisé, type original: ${this.originalFogType || 'aucun'}`);
    }
    
    /**
     * Initialise le brouillard spécifique au système météo
     */
    initWeatherFog() {
        // Sauvegarder le brouillard original pour le restaurer à la fin
        if (this.scene.fog) {
            this.originalFog = this.scene.fog.clone();
            this.originalFogType = this.scene.fog instanceof THREE.FogExp2 ? 'exp2' : 'linear';
            this.originalFogParams = this.saveFogParams();
        }
        
        // Créer notre propre brouillard exponentiel avec la densité initiale
        const fogColor = this.calculateFogColor();
        const initialDensity = this._fogDensity * (this.maxFogExp - this.minFogExp) + this.minFogExp;
        this.weatherFog = new THREE.FogExp2(fogColor, initialDensity);
        
        // Remplacer le brouillard de la scène par le nôtre
        this.scene.fog = this.weatherFog;
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
     * Calcule la couleur du brouillard en fonction des conditions météo actuelles
     * @returns {THREE.Color} Couleur du brouillard adaptée
     */
    calculateFogColor() {
        // Obtenir la couleur du ciel en temps réel
        const skyColor = this.weatherSystem.environment.skyUniforms?.uCurrentHorizonColor?.value;
        
        if (skyColor) {
            // Utiliser directement la couleur du ciel
            return new THREE.Color(skyColor);
        }
        
        // Fallback si la couleur du ciel n'est pas disponible
        return this.fogColors.clear;
    }
    
    /**
     * Met à jour l'effet de brouillard
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.weatherFog || !this.enabled) return;
        
        // Mettre à jour la couleur du brouillard uniquement si nécessaire
        const newFogColor = this.calculateFogColor();
        if (!this.weatherFog.color.equals(newFogColor)) {
            this.weatherFog.color.copy(newFogColor);
        }
    }
    
    /**
     * Restaure le brouillard original de la scène
     */
    restoreOriginalFog() {
        if (this.originalFog && this.originalFogType) {
            // Recréer le brouillard original pour éviter les références partagées
            if (this.originalFogType === 'exp2') {
                this.scene.fog = new THREE.FogExp2(
                    this.originalFogParams.color.clone(),
                    this.originalFogParams.density
                );
            } else {
                this.scene.fog = new THREE.Fog(
                    this.originalFogParams.color.clone(),
                    this.originalFogParams.near,
                    this.originalFogParams.far
                );
            }
        } else {
            // S'il n'y avait pas de brouillard à l'origine
            this.scene.fog = null;
        }
        
        // Libérer les références
        this.weatherFog = null;
    }
    
    /**
     * Définit la densité du brouillard et met à jour immédiatement
     * @param {number} density - Densité du brouillard (0-1)
     */
    set fogDensity(density) {
        this._fogDensity = THREE.MathUtils.clamp(density, 0, 1);
        // Forcer la mise à jour immédiate
        if (this.weatherFog) {
            const targetDensity = this._fogDensity * (this.maxFogExp - this.minFogExp) + this.minFogExp;
            this.weatherFog.density = targetDensity;
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
        this.weatherFog = null;
    }
} 