/**
 * Effet de pluie pour le système météorologique
 * Utilise un système de particules pour simuler la pluie
 * Version améliorée pour répondre aux changements d'intensité en temps réel
 */
import * as THREE from 'three';

export default class RainEffect {
    /**
     * @param {Object} weatherSystem - Référence au système météo principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.scene = weatherSystem.scene;
        this.camera = weatherSystem.camera.instance;
        
        // Configuration
        this.rainCount = 20000;         // Nombre maximum de gouttes de pluie (augmenté)
        this.rainSize = 0.15;           // Taille de base des gouttes (augmentée)
        this.rainFallSpeed = 15;        // Vitesse de chute de base (augmentée)
        this.rainArea = 1500;           // Zone de pluie autour de la caméra (augmentée)
        this.rainHeight = 350;          // Hauteur à laquelle la pluie apparaît (augmentée)
        this._intensity = 0;            // Intensité (0-1), modifie la visibilité et la quantité
        this._visibleDroplets = 0;      // Nombre actuel de gouttes visibles
        
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
        const opacities = new Float32Array(this.rainCount); // Nouvel attribut pour l'opacité individuelle
        
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
            sizes[i] = this.rainSize * (0.7 + Math.random() * 0.6);
            
            // Opacité initiale (toutes à 0)
            opacities[i] = 0;
        }
        
        // Ajouter les attributs à la géométrie
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        this.rainGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.rainGeometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
        
        // Créer un shader matériau personnalisé qui utilise l'attribut d'opacité
        const vertexShader = `
            attribute float velocity;
            attribute float size;
            attribute float opacity;
            
            varying float vOpacity;
            
            void main() {
                vOpacity = opacity;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
        
        const fragmentShader = `
            uniform sampler2D rainTexture;
            varying float vOpacity;
            
            void main() {
                vec4 texColor = texture2D(rainTexture, gl_PointCoord);
                gl_FragColor = vec4(texColor.rgb, texColor.a * vOpacity);
                if (gl_FragColor.a < 0.01) discard;
            }
        `;
        
        // Créer le matériau de la pluie avec shader personnalisé
        this.rainMaterial = new THREE.ShaderMaterial({
            uniforms: {
                rainTexture: { value: this.createRainDropTexture() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        // Créer le système de particules
        this.rainParticles = new THREE.Points(this.rainGeometry, this.rainMaterial);
        this.rainParticles.frustumCulled = false;  // Éviter la désactivation hors champ de vision
        this.rainParticles.name = "RainParticles";
        
        // Visible par défaut, l'opacité contrôlera la visibilité
        this.rainParticles.visible = true;
        
        // Ajouter à la scène
        this.scene.add(this.rainParticles);
        
        console.log("Effet de pluie initialisé avec shader personnalisé");
    }
    
    /**
     * Crée une texture pour les gouttes de pluie
     * @returns {THREE.Texture} - La texture des gouttes
     */
    createRainDropTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;  // Augmenté pour plus de détails
        canvas.height = 64; // Augmenté pour plus de détails
        
        const context = canvas.getContext('2d');
        
        // Créer un dégradé plus complexe
        const gradient = context.createLinearGradient(32, 0, 32, 64);
        gradient.addColorStop(0, 'rgba(200, 200, 255, 0.1)');
        gradient.addColorStop(0.2, 'rgba(200, 200, 255, 0.7)');
        gradient.addColorStop(0.4, 'rgba(230, 230, 255, 0.9)');
        gradient.addColorStop(0.6, 'rgba(200, 200, 255, 0.7)');
        gradient.addColorStop(1, 'rgba(200, 200, 255, 0.1)');
        
        // Dessiner une forme de goutte allongée
        context.fillStyle = gradient;
        context.fillRect(28, 0, 8, 64); // Forme centrale allongée
        
        // Adoucir les bords
        const horizontalGradient = context.createRadialGradient(32, 32, 0, 32, 32, 16);
        horizontalGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        horizontalGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        context.globalCompositeOperation = 'lighten';
        context.fillStyle = horizontalGradient;
        context.fillRect(24, 24, 16, 16);
        
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        return texture;
    }
    
    /**
     * Met à jour l'effet de pluie en fonction de l'intensité
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.rainParticles) return;
        
        // Calculer le delta en secondes
        const deltaSeconds = deltaTime / 1000;
        
        // Accéder aux attributs pour la mise à jour
        const positions = this.rainGeometry.attributes.position.array;
        const velocities = this.rainGeometry.attributes.velocity.array;
        const opacities = this.rainGeometry.attributes.opacity.array;
        
        // Position de la caméra pour centrer la pluie autour d'elle
        const cameraPosition = this.camera.position.clone();
        
        // Calculer combien de gouttes devraient être visibles en fonction de l'intensité
        const targetVisibleDroplets = Math.floor(this.rainCount * this.intensity);
        
        // Limiter le nombre de gouttes à traiter (performance)
        const dropletCountToProcess = Math.max(this._visibleDroplets, targetVisibleDroplets);
        let updatedVisibleCount = 0;
        
        // Mettre à jour chaque goutte de pluie
        for (let i = 0; i < this.rainCount; i++) {
            const baseIndex = i * 3;
            const shouldBeVisible = i < targetVisibleDroplets;
            
            // Si la goutte doit être visible ou est déjà visible
            if (shouldBeVisible || opacities[i] > 0) {
                // Si la goutte doit apparaître
                if (shouldBeVisible && opacities[i] < 1.0) {
                    opacities[i] = Math.min(opacities[i] + deltaSeconds * 5, 1.0); // Apparition progressive
                } 
                // Si la goutte doit disparaître
                else if (!shouldBeVisible && opacities[i] > 0) {
                    opacities[i] = Math.max(opacities[i] - deltaSeconds * 5, 0.0); // Disparition progressive
                }
                
                // Faire tomber la pluie
                positions[baseIndex + 1] -= velocities[i] * deltaSeconds * (0.5 + this.intensity * 1.5); // Vitesse modulée par intensité
                
                // Si la goutte est trop basse, la replacer en haut
                if (positions[baseIndex + 1] < -10) {
                    // Repositionner autour de la caméra
                    positions[baseIndex] = cameraPosition.x + (Math.random() * 2 - 1) * this.rainArea * this.intensity;
                    positions[baseIndex + 1] = cameraPosition.y + this.rainHeight + Math.random() * 50; // Variation légère en hauteur
                    positions[baseIndex + 2] = cameraPosition.z + (Math.random() * 2 - 1) * this.rainArea * this.intensity;
                }
                
                if (opacities[i] > 0) updatedVisibleCount++;
            }
        }
        
        // Mettre à jour le nombre de gouttes visibles
        this._visibleDroplets = updatedVisibleCount;
        
        // Marquer les attributs comme nécessitant une mise à jour
        this.rainGeometry.attributes.position.needsUpdate = true;
        this.rainGeometry.attributes.opacity.needsUpdate = true;
    }
    
    /**
     * Définit l'intensité de la pluie
     * @param {number} value - Intensité de la pluie (0-1)
     */
    set intensity(value) {
        this._intensity = THREE.MathUtils.clamp(value, 0, 1);
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
            if (this.rainMaterial.uniforms && this.rainMaterial.uniforms.rainTexture) {
                this.rainMaterial.uniforms.rainTexture.value.dispose();
            }
            this.rainMaterial.dispose();
        }
        
        this.rainParticles = null;
        this.rainGeometry = null;
        this.rainMaterial = null;
    }
} 