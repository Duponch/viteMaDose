/**
 * Effet de pluie pour le système météorologique
 * Utilise un système de particules pour simuler la pluie
 */
import * as THREE from 'three';

export default class RainEffect {
    /**
     * @param {Object} weatherSystem - Référence au système météo principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.scene = weatherSystem.scene;
        this.camera = weatherSystem.camera;
        
        // Configuration
        this.rainCount = 15000;         // Nombre de gouttes de pluie
        this.rainSize = 0.1;            // Taille de base des gouttes
        this.rainFallSpeed = 10;        // Vitesse de chute de base
        this.rainArea = 1000;           // Zone de pluie autour de la caméra
        this.rainHeight = 300;          // Hauteur à laquelle la pluie apparaît
        this._intensity = 0;            // Intensité (0-1), modifie la visibilité et la quantité
        
        // Système de particules
        this.rainParticles = null;      // Points THREE.js
        this.rainGeometry = null;       // BufferGeometry
        this.rainMaterial = null;       // PointsMaterial
        
        // Initialisation
        this.initialize();
    }
    
    /**
     * Initialise l'effet de pluie
     */
    initialize() {
        // Créer la géométrie des particules
        this.rainGeometry = new THREE.BufferGeometry();
        
        // Tableaux pour les positions et les vitesses
        const positions = new Float32Array(this.rainCount * 3);
        const velocities = new Float32Array(this.rainCount);
        const sizes = new Float32Array(this.rainCount);
        
        // Générer les positions aléatoires
        for (let i = 0; i < this.rainCount; i++) {
            // Position aléatoire dans un cube
            const x = (Math.random() * 2 - 1) * this.rainArea;
            const y = (Math.random()) * this.rainHeight;
            const z = (Math.random() * 2 - 1) * this.rainArea;
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            // Vitesse aléatoire (pour variation)
            velocities[i] = this.rainFallSpeed * (0.8 + Math.random() * 0.4);
            
            // Taille aléatoire
            sizes[i] = this.rainSize * (0.5 + Math.random() * 0.5);
        }
        
        // Ajouter les attributs à la géométrie
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        this.rainGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Créer le matériau de la pluie
        this.rainMaterial = new THREE.PointsMaterial({
            color: 0xccccff,
            size: this.rainSize,
            transparent: true,
            opacity: 0.6,
            vertexColors: false,
            sizeAttenuation: true
        });
        
        // Créer un sprite pour les gouttes
        const rainDropTexture = this.createRainDropTexture();
        this.rainMaterial.map = rainDropTexture;
        
        // Créer le système de particules
        this.rainParticles = new THREE.Points(this.rainGeometry, this.rainMaterial);
        this.rainParticles.frustumCulled = false;  // Éviter la désactivation hors champ de vision
        this.rainParticles.name = "RainParticles";
        
        // Cacher au départ
        this.rainParticles.visible = false;
        
        // Ajouter à la scène
        this.scene.add(this.rainParticles);
        
        console.log("Effet de pluie initialisé");
    }
    
    /**
     * Crée une texture pour les gouttes de pluie
     * @returns {THREE.Texture} - La texture des gouttes
     */
    createRainDropTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        
        // Forme allongée pour les gouttes
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.2, 'rgba(200, 200, 255, 0.9)');
        gradient.addColorStop(0.4, 'rgba(150, 150, 255, 0.6)');
        gradient.addColorStop(0.6, 'rgba(120, 120, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(100, 100, 255, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
        
        // Étirer pour créer une forme de goutte
        context.fillRect(12, 0, 8, 32);
        
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        return texture;
    }
    
    /**
     * Met à jour l'effet de pluie en fonction de l'intensité
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.rainParticles || this.intensity <= 0.01) {
            // Rien à faire si l'effet est désactivé ou presque invisible
            return;
        }
        
        // Rendre visible si nécessaire
        if (!this.rainParticles.visible && this.intensity > 0.01) {
            this.rainParticles.visible = true;
        }
        
        // Calculer le delta en secondes
        const deltaSeconds = deltaTime / 1000;
        
        // Accéder aux attributs pour la mise à jour
        const positions = this.rainGeometry.attributes.position.array;
        const velocities = this.rainGeometry.attributes.velocity.array;
        
        // Position de la caméra pour centrer la pluie autour d'elle
        const cameraPosition = this.camera.instance.position.clone();
        
        // Mettre à jour chaque goutte de pluie
        for (let i = 0; i < this.rainCount; i++) {
            // Faire tomber la pluie
            positions[i * 3 + 1] -= velocities[i] * deltaSeconds;
            
            // Si la goutte est trop basse, la replacer en haut (avec un décalage aléatoire)
            if (positions[i * 3 + 1] < -10) {
                // Repositionner autour de la caméra avec un décalage aléatoire
                positions[i * 3] = cameraPosition.x + (Math.random() * 2 - 1) * this.rainArea;
                positions[i * 3 + 1] = cameraPosition.y + this.rainHeight;
                positions[i * 3 + 2] = cameraPosition.z + (Math.random() * 2 - 1) * this.rainArea;
            }
        }
        
        // Marquer les positions comme nécessitant une mise à jour
        this.rainGeometry.attributes.position.needsUpdate = true;
    }
    
    /**
     * Définit l'intensité de la pluie
     * @param {number} value - Intensité de la pluie (0-1)
     */
    set intensity(value) {
        this._intensity = THREE.MathUtils.clamp(value, 0, 1);
        
        if (this.rainParticles) {
            // Visibilité des particules
            this.rainParticles.visible = this._intensity > 0.01;
            
            // Opacité du matériau
            if (this.rainMaterial) {
                this.rainMaterial.opacity = 0.6 * this._intensity;
            }
        }
    }
    
    /**
     * Obtient l'intensité actuelle de la pluie
     * @returns {number} - Intensité (0-1)
     */
    get intensity() {
        return this._intensity;
    }
    
    /**
     * Nettoie les ressources de l'effet de pluie
     */
    destroy() {
        if (this.rainParticles) {
            this.scene.remove(this.rainParticles);
        }
        
        if (this.rainGeometry) {
            this.rainGeometry.dispose();
        }
        
        if (this.rainMaterial) {
            if (this.rainMaterial.map) {
                this.rainMaterial.map.dispose();
            }
            this.rainMaterial.dispose();
        }
        
        this.rainParticles = null;
        this.rainGeometry = null;
        this.rainMaterial = null;
    }
} 