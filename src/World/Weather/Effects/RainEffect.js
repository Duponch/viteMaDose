/**
 * Effet de pluie pour le système météorologique
 * Utilise des lignes et des shaders pour simuler la pluie
 * Version refaite basée sur le système de codepen.io
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
        this._intensity = 0;            // Intensité (0-1), modifie la visibilité et la quantité
        this.dropCount = 10000;         // Nombre de gouttes de pluie
        this.rainSpeed = 10;            // Vitesse de base de la pluie
        this.rainArea = 40;             // Zone de pluie
        this.rainHeight = 30;           // Hauteur maximale de la pluie
        this.minDropLength = 0.3;       // Longueur minimale des gouttes
        this.maxDropLength = 0.7;       // Longueur maximale des gouttes
        
        // Objets Three.js
        this.rainObject = null;
        this.rainGeometry = null;
        this.rainMaterial = null;
        
        // Initialisation
        this.initialize();
        
        console.log("Effet de pluie initialisé avec système de lignes");
    }
    
    /**
     * Initialise l'effet de pluie avec un système de lignes
     */
    initialize() {
        // Créer les positions et attributs des gouttes
        const positions = [];
        const dropEnds = [];
        const dropParams = [];
        
        const halfRainArea = this.rainArea / 2;
        
        for (let i = 0; i < this.dropCount; i++) {
            // Position XZ aléatoire dans la zone
            const x = THREE.MathUtils.randFloatSpread(this.rainArea);
            const z = THREE.MathUtils.randFloatSpread(this.rainArea);
            // Position Y aléatoire pour distribuer la hauteur
            const y = THREE.MathUtils.randFloat(0, this.rainHeight);
            // Longueur de la goutte
            const length = THREE.MathUtils.randFloat(this.minDropLength, this.maxDropLength);
            // Vitesse de la goutte (variation)
            const speed = THREE.MathUtils.randFloat(0.8, 1.2);
            
            // Chaque goutte de pluie est une ligne avec deux points
            positions.push(
                x, y, z,     // Point de départ de la ligne
                x, y - length, z  // Point de fin de la ligne (vers le bas)
            );
            
            // Paramètres pour les deux points (utilisés dans le shader)
            // 0 = point de départ, 1 = point de fin
            dropEnds.push(0, 1);
            
            // Paramètres supplémentaires (vitesse et décalage)
            dropParams.push(
                speed, 
                THREE.MathUtils.randFloat(0, this.rainHeight), // Décalage initial pour éviter un pattern visible
                length
            );
        }
        
        // Créer la géométrie
        this.rainGeometry = new THREE.BufferGeometry();
        this.rainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.rainGeometry.setAttribute('dropEnd', new THREE.Float32BufferAttribute(dropEnds, 1));
        this.rainGeometry.setAttribute('dropParams', new THREE.Float32BufferAttribute(dropParams, 3));
        
        // Créer le matériau avec un shader personnalisé
        this.rainMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                intensity: { value: this._intensity },
                rainSpeed: { value: this.rainSpeed },
                rainHeight: { value: this.rainHeight },
                fogColor: { value: new THREE.Color(0x000000) },
                fogNear: { value: 1.0 },
                fogFar: { value: 30.0 },
                fogDensity: { value: 0.1 }
            },
            vertexShader: `
                uniform float time;
                uniform float intensity;
                uniform float rainSpeed;
                uniform float rainHeight;
                
                attribute float dropEnd;
                attribute vec3 dropParams;
                
                varying float vDropEnd;
                varying float vDistance;
                
                void main() {
                    vDropEnd = dropEnd;
                    
                    // Récupérer les paramètres de la goutte
                    float dropSpeed = dropParams.x;
                    float dropOffset = dropParams.y;
                    float dropLength = dropParams.z;
                    
                    // Ajuster la position Y de la goutte en fonction du temps
                    vec3 pos = position;
                    float fallSpeed = rainSpeed * dropSpeed * intensity;
                    float yPos = mod(pos.y - time * fallSpeed + dropOffset, rainHeight);
                    
                    // Si l'intensité est 0, déplacer les gouttes très loin (invisibles)
                    if (intensity < 0.01) {
                        yPos = -1000.0;
                    }
                    
                    // Point de départ ou de fin
                    pos.y = yPos - dropEnd * dropLength;
                    
                    // Position dans l'espace caméra
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    vDistance = -mvPosition.z;
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float intensity;
                uniform vec3 fogColor;
                uniform float fogNear;
                uniform float fogFar;
                uniform float fogDensity;
                
                varying float vDropEnd;
                varying float vDistance;
                
                void main() {
                    // Couleur bleu-blanche pour les gouttes de pluie
                    vec3 color = mix(vec3(0.7, 0.8, 1.0), vec3(1.0), vDropEnd);
                    
                    // Opacité basée sur l'extrémité de la goutte (plus transparent à la fin)
                    float alpha = mix(0.5, 0.1, vDropEnd) * intensity;
                    
                    // Appliquer le brouillard - support pour les deux types
                    float fogFactor = 0.0;
                    
                    #ifdef USE_FOG_EXP2
                        // Brouillard exponentiel (comme FogExp2)
                        fogFactor = 1.0 - exp(-fogDensity * vDistance);
                    #else
                        // Brouillard linéaire (comme Fog)
                        fogFactor = smoothstep(fogNear, fogFar, vDistance);
                    #endif
                    
                    // Appliquer le brouillard
                    if (fogFactor > 0.001) {
                        color = mix(color, fogColor, min(fogFactor, 0.8)); // Limiter à 0.8 pour préserver un peu la couleur de la pluie
                    }
                    
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        });
        
        // Créer l'objet
        this.rainObject = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
        this.rainObject.frustumCulled = false;
        this.rainObject.name = "RainLines";
        
        // Rendre visible uniquement si l'intensité > 0
        this.rainObject.visible = this._intensity > 0;
        
        // Ajouter à la scène
        this.scene.add(this.rainObject);
    }
    
    /**
     * Met à jour l'effet de pluie
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.rainObject || !this.rainMaterial) return;
        
        // Visible uniquement si l'intensité est supérieure à 0
        this.rainObject.visible = this._intensity > 0.01;
        
        if (this._intensity <= 0.01) return;
        
        // Mise à jour du temps uniforme pour l'animation
        this.rainMaterial.uniforms.time.value += deltaTime / 1000;
        this.rainMaterial.uniforms.intensity.value = this._intensity;
        
        // Mise à jour des paramètres de brouillard
        try {
            if (this.scene.fog) {
                this.rainMaterial.uniforms.fogColor.value.copy(this.scene.fog.color);
                
                if (this.scene.fog.isFogExp2) {
                    // FogExp2
                    this.rainMaterial.uniforms.fogDensity.value = this.scene.fog.density;
                    // Conversion approximative pour le near/far
                    this.rainMaterial.uniforms.fogNear.value = 5;
                    this.rainMaterial.uniforms.fogFar.value = 15;
                    
                    // Mettre à jour le shader pour utiliser fogExp2
                    this.rainMaterial.defines = {
                        USE_FOG_EXP2: ''
                    };
                    this.rainMaterial.needsUpdate = true;
                } else {
                    // Fog linéaire
                    this.rainMaterial.uniforms.fogNear.value = this.scene.fog.near;
                    this.rainMaterial.uniforms.fogFar.value = this.scene.fog.far;
                    // Valeur fictive pour fogDensity (non utilisée dans ce cas)
                    this.rainMaterial.uniforms.fogDensity.value = 0.1;
                    
                    // S'assurer que le shader utilise le brouillard linéaire
                    delete this.rainMaterial.defines.USE_FOG_EXP2;
                    this.rainMaterial.needsUpdate = true;
                }
            }
        } catch (error) {
            console.warn("Erreur lors de la mise à jour du brouillard dans la pluie:", error);
        }
        
        // Déplacer la pluie pour qu'elle suive la caméra
        if (this.camera) {
            const cameraPosition = this.camera.position;
            this.rainObject.position.set(
                cameraPosition.x,
                0,
                cameraPosition.z
            );
        }
    }
    
    /**
     * Définit l'intensité de la pluie
     * @param {number} value - Intensité de la pluie (0-1)
     */
    set intensity(value) {
        const oldIntensity = this._intensity;
        this._intensity = THREE.MathUtils.clamp(value, 0, 1);
        
        // Mettre à jour la visibilité et l'uniforme si le matériau existe
        if (this.rainObject) {
            this.rainObject.visible = this._intensity > 0.01;
        }
        
        if (this.rainMaterial) {
            this.rainMaterial.uniforms.intensity.value = this._intensity;
        }
        
        // Log pour débogage
        if ((oldIntensity <= 0.01 && this._intensity > 0.01) || 
            (oldIntensity > 0.01 && this._intensity <= 0.01)) {
            console.log(`Pluie ${this._intensity > 0.01 ? 'activée' : 'désactivée'} avec intensité: ${this._intensity.toFixed(2)}`);
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
        if (this.rainObject) {
            this.scene.remove(this.rainObject);
        }
        
        if (this.rainGeometry) {
            this.rainGeometry.dispose();
        }
        
        if (this.rainMaterial) {
            this.rainMaterial.dispose();
        }
        
        this.rainObject = null;
        this.rainGeometry = null;
        this.rainMaterial = null;
    }
} 