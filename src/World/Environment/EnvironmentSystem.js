/**
 * Système d'environnement pour le jeu
 * Gère les différents éléments environnementaux (oiseaux, etc.)
 */
import * as THREE from 'three';
import EnvironmentState from './EnvironmentState.js';
import BirdSystem from './BirdSystem.js';

export default class EnvironmentSystem {
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
        this.transitionDuration = 2000; // Durée de transition en ms
        
        // État d'environnement actuel et cible (pour transitions)
        this.currentEnvironmentState = new EnvironmentState();
        this.targetEnvironmentState = this.currentEnvironmentState.clone();
        this.transitionProgress = 1.0; // 1.0 = transition terminée
        
        // Créer les sous-systèmes
        this.birdSystem = new BirdSystem(this);
        
        // Liste de tous les effets pour itération facile
        this.effects = [
            this.birdSystem
        ];
        
        //console.log("Système d'environnement initialisé");
    }
    
    /**
     * Définit directement la densité des oiseaux
     * @param {number} density - Densité des oiseaux (0-1)
     */
    setBirdDensity(density) {
        if (this.birdSystem) {
            // Appliquer directement au système d'oiseaux
            this.birdSystem.birdDensity = density;
            
            // Mettre également à jour l'état cible pour les transitions futures
            this.targetEnvironmentState.birdDensity = density;
            this.currentEnvironmentState.birdDensity = density;
        }
    }
    
    /**
     * Obtient la densité actuelle des oiseaux
     * @returns {number} Densité des oiseaux (0-1)
     */
    getBirdDensity() {
        return this.birdSystem ? this.birdSystem.birdDensity : 0;
    }
    
    /**
     * Met à jour tous les effets environnementaux
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.enabled) return;
        
        // Mettre à jour la progression de la transition
        if (this.transitionProgress < 1.0) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            this.transitionProgress = Math.min(this.transitionProgress, 1.0);
            
            // Interpoler entre les états d'environnement actuels et cibles
            const t = this.transitionProgress;
            
            // Transition de la densité des oiseaux
            this.birdSystem.birdDensity = THREE.MathUtils.lerp(
                this.currentEnvironmentState.birdDensity, 
                this.targetEnvironmentState.birdDensity, 
                t
            );
        }
        
        // Mettre à jour tous les effets d'environnement
        for (const effect of this.effects) {
            if (effect.update) {
                effect.update(deltaTime);
            }
        }
        
        // Sauvegarde de l'état actuel pour les transitions futures
        if (this.transitionProgress >= 1.0) {
            this.currentEnvironmentState.birdDensity = this.birdSystem.birdDensity;
            
            // Copier les valeurs actuelles aux valeurs cibles pour éviter les transitions involontaires
            this.targetEnvironmentState = this.currentEnvironmentState.clone();
        }
    }
    
    /**
     * Nettoie toutes les ressources utilisées par le système d'environnement
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
        this.birdSystem = null;
        
        //console.log("Système d'environnement nettoyé");
    }
    
    /**
     * Calcule l'intensité de la lumière ambiante en fonction des lumières présentes dans la scène
     * @returns {number} Intensité de la lumière ambiante (0-1)
     */
    getAmbientLightIntensity() {
        let totalIntensity = 0;
        let lightCount = 0;

        // Parcourir tous les objets de la scène
        this.scene.traverse((object) => {
            if (object.isLight && object.visible) { // Vérifier si la lumière est visible
                if (object.isAmbientLight) {
                    totalIntensity += object.intensity;
                } else if (object.isDirectionalLight || object.isPointLight || object.isSpotLight) {
                    totalIntensity += object.intensity * 0.5;
                }
                lightCount++;
            }
        });

        // Si aucune lumière n'est présente ou visible, retourner 0
        if (lightCount === 0) return 0;

        // Normaliser l'intensité entre 0 et 1
        return Math.min(totalIntensity / lightCount, 1.0);
    }
    
    /**
     * Récupère la lumière directionnelle du soleil
     * @returns {THREE.DirectionalLight|null} La lumière du soleil ou null si non trouvée
     */
    getSunLight() {
        let sunLight = null;
        this.scene.traverse((object) => {
            if (object.isDirectionalLight && object.name === 'sunLight') {
                sunLight = object;
            }
        });
        return sunLight;
    }
    
    /**
     * Récupère les paramètres du brouillard
     * @returns {Object|null} Les paramètres du brouillard ou null si non trouvé
     */
    getFog() {
        // Vérifier si la scène a un brouillard
        if (this.scene.fog) {
            if (this.scene.fog instanceof THREE.FogExp2) {
                return {
                    color: this.scene.fog.color,
                    density: this.scene.fog.density
                };
            }
        }
        return null;
    }
} 