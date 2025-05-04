/**
 * Effet de brouillard pour le système météorologique
 * Gère la densité et la couleur du brouillard dans la scène
 * Version améliorée pour réagir plus rapidement aux changements de densité
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
        this.maxFogExp = 0.03;       // Densité maximale du brouillard exponentiel (légèrement réduite)
        this.updateFrequency = 30;   // Mise à jour du brouillard tous les 30ms maximum
        this.lastUpdateTime = 0;     // Temps de la dernière mise à jour du brouillard
        
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
     * Calcule la couleur du brouillard en fonction des conditions météo actuelles
     * @returns {THREE.Color} Couleur du brouillard adaptée
     */
    calculateFogColor() {
        // Obtenir la couleur du ciel pour adapter le brouillard
        const skyColor = this.weatherSystem.environment.skyUniforms?.uCurrentHorizonColor?.value;
        const rainIntensity = this.weatherSystem.rainEffect.intensity;
        const cloudDensity = this.weatherSystem.cloudSystem.cloudDensity;
        
        // Déterminer la couleur de base en fonction des conditions
        let baseColor;
        if (rainIntensity > 0.5) {
            // Pluie forte
            baseColor = this.fogColors.heavyRain;
        } else if (rainIntensity > 0.1) {
            // Pluie légère
            baseColor = this.fogColors.rainy;
        } else if (cloudDensity > 0.7) {
            // Nuageux
            baseColor = this.fogColors.cloudy;
        } else if (this._fogDensity > 0.6) {
            // Brouillard dense
            baseColor = this.fogColors.foggy;
        } else {
            // Temps clair
            baseColor = this.fogColors.clear;
        }
        
        // Mélanger avec la couleur du ciel si disponible
        if (skyColor) {
            const result = new THREE.Color();
            // Plus de couleur du ciel quand la densité est faible
            const skyInfluence = Math.max(0.3, 1.0 - this._fogDensity * 0.8);
            return result.lerpColors(baseColor, skyColor, skyInfluence);
        }
        
        return baseColor;
    }
    
    /**
     * Met à jour l'effet de brouillard
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        // Limiter les mises à jour du brouillard pour de meilleures performances
        const currentTime = this.weatherSystem.time.elapsed;
        if (currentTime - this.lastUpdateTime < this.updateFrequency) {
            return;
        }
        this.lastUpdateTime = currentTime;
        
        // Si la densité est nulle et qu'il n'y a pas de brouillard, rien à faire
        if (this._fogDensity <= 0.001 && !this.scene.fog) return;
        
        // Si la densité est presque nulle, essayer de restaurer le brouillard original
        if (this._fogDensity <= 0.001) {
            this.restoreOriginalFog();
            return;
        }
        
        // Calculer la couleur adaptée à la météo actuelle
        const fogColor = this.calculateFogColor();
        
        // Calculer la densité entre min et max selon l'intensité
        // Appliquer une courbe non linéaire pour un résultat plus intéressant
        const fogDensityPower = Math.pow(this._fogDensity, 1.5); // Courbe non linéaire
        const fogDensity = THREE.MathUtils.lerp(
            this.minFogExp, 
            this.maxFogExp, 
            fogDensityPower
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
     * Définit la densité du brouillard et met à jour immédiatement
     * @param {number} density - Densité du brouillard (0-1)
     */
    set fogDensity(density) {
        const oldDensity = this._fogDensity;
        this._fogDensity = THREE.MathUtils.clamp(density, 0, 1);
        
        // Mise à jour immédiate si changement significatif ou forcer la mise à jour
        if (Math.abs(oldDensity - this._fogDensity) > 0.005) {
            // Forcer la mise à jour immédiate en réinitialisant le timer
            this.lastUpdateTime = 0;
            this.update(0);
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