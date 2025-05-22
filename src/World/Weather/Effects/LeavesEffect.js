/**
 * Effet de feuilles pour le système météorologique
 * Utilise des particules et des shaders pour simuler des feuilles qui s'envolent
 */
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import ShaderLoader from '../../../Utils/ShaderLoader.js';

export default class LeavesEffect {
    /**
     * @param {Object} weatherSystem - Référence au système météo principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.scene = weatherSystem.scene;
        this.camera = weatherSystem.camera.instance;
        
        // Configuration
        this._intensity = 0;             // Intensité (0-1), modifie la visibilité et la quantité
        this.leafCount = 10000;          // Nombre de feuilles
        this.windSpeed = 20;             // Vitesse de base du vent
        this.leafArea = 100;             // Zone des feuilles - rayon autour de la caméra (augmenté)
        this.leafHeight = 60;            // Hauteur maximale des feuilles
        this.speedIntensityFactor = 0.7; // Facteur de proportionnalité entre l'intensité et la vitesse (0-1)
        this.minLeafSize = 0.6;          // Taille minimale des feuilles
        this.maxLeafSize = 1.5;          // Taille maximale des feuilles
        this.rotationFactor = 2.0;       // Facteur de rotation des feuilles
        this.leafOpacity = 0.9;          // Opacité des feuilles (0-1)
        this.cameraFollowFactor = 0.98;  // Facteur de suivi de la caméra (augmenté pour meilleur suivi)
        this.verticalFollowFactor = 0.8; // Facteur de suivi vertical de la caméra (augmenté)
        this.inertiaFactor = 0.92;
        this.lastCameraPosition = null;
        this.repositionThreshold = 60;   // Distance à partir de laquelle on repositionne les feuilles
        this.repositionCheckInterval = 500; // Vérifier tous les 500ms si on doit repositionner
        this.lastRepositionTime = 0;     // Dernière fois qu'on a repositionné les feuilles
        
        // Vecteurs temporaires pour les calculs
        this._tempVector1 = new THREE.Vector3();
        this._tempVector2 = new THREE.Vector3();
        this._tempVector3 = new THREE.Vector3();
        this._tempVector4 = new THREE.Vector3();
        this.windVelocity = new THREE.Vector3();
        
        // Initialisation
        this.initialize();
    }
    
    /**
     * Initialise l'effet de feuilles avec les shaders
     */
    async initialize() {
        try {
            // Charger les shaders
            const vertexShader = await ShaderLoader.loadShader('LeavesVertex.glsl');
            const fragmentShader = await ShaderLoader.loadShader('LeavesFragment.glsl');
            
            // Créer une texture de feuille (texture temporaire en attendant une texture réelle)
            const leafTexture = this.createLeafTexture();
            
            // Récupérer les informations sur l'éclairage global de la scène
            let ambientColor = new THREE.Color(0x404040); // Couleur ambiante par défaut
            let ambientIntensity = 0.5; // Intensité ambiante par défaut
            let dayFactor = 1.0; // Facteur jour/nuit par défaut (1.0 = jour complet)
            
            // Récupérer les paramètres d'éclairage de l'environnement si disponible
            if (this.weatherSystem.environment) {
                const env = this.weatherSystem.environment;
                
                // Facteur jour/nuit (0-1)
                if (env.skyUniforms && env.skyUniforms.uDayFactor) {
                    dayFactor = env.skyUniforms.uDayFactor.value;
                }
                
                // Lumière ambiante
                if (env.ambientLight) {
                    ambientColor.copy(env.ambientLight.color);
                    ambientIntensity = env.ambientLight.intensity;
                }
            }
            
            // Créer le matériau
            this.leavesMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    leavesTexture: { value: leafTexture },
                    time: { value: 0 },
                    intensity: { value: this._intensity },
                    windSpeed: { value: this.windSpeed },
                    leaveHeight: { value: this.leafHeight },
                    cameraForward: { value: new THREE.Vector3() },
                    rotationFactor: { value: this.rotationFactor },
                    // Paramètres de brouillard
                    fogColor: { value: new THREE.Color(0xffffff) },
                    fogNear: { value: 50 },
                    fogFar: { value: 300 },
                    fogDensity: { value: 0.01 },
                    // Paramètres d'éclairage
                    leafOpacity: { value: this.leafOpacity },
                    ambientColor: { value: ambientColor },
                    ambientIntensity: { value: ambientIntensity },
                    dayFactor: { value: dayFactor }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                transparent: true,
                blending: THREE.NormalBlending,
                depthWrite: false,
                depthTest: true
            });
            
            // Générer la géométrie des feuilles
            this.createLeaves();
            
            // Ajouter à la scène
            this.scene.add(this.leavesObject);
            
            // Position initiale
            if (this.camera) {
                this.lastCameraPosition = this.camera.position.clone();
            }
            
            // Mise à jour des vecteurs pour le mouvement
            this.updateVectors();
            
        } catch (error) {
            console.error("Erreur lors de l'initialisation de l'effet de feuilles:", error);
        }
    }
    
    /**
     * Crée une texture temporaire pour les feuilles
     * @returns {THREE.Texture} - Texture de feuille
     */
    createLeafTexture() {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        
        const context = canvas.getContext('2d');
        
        // Dessiner une feuille simple
        context.fillStyle = 'rgba(0, 0, 0, 0)';
        context.fillRect(0, 0, size, size);
        
        // Types de feuilles avec différentes couleurs
        const leafColors = [
            'rgba(139, 69, 19, 0.9)', // Marron
            'rgba(205, 133, 63, 0.9)', // Peru
            'rgba(160, 82, 45, 0.9)', // Sienna
            'rgba(210, 105, 30, 0.9)', // Chocolat
            'rgba(165, 42, 42, 0.9)', // Marron foncé
            'rgba(233, 116, 81, 0.9)', // Corail clair
            'rgba(250, 128, 114, 0.9)', // Saumon
            'rgba(255, 160, 122, 0.9)', // Saumon clair
            'rgba(255, 127, 80, 0.9)', // Corail
            'rgba(255, 69, 0, 0.9)' // Orange rouge
        ];
        
        // Choisir une couleur aléatoire
        context.fillStyle = leafColors[Math.floor(Math.random() * leafColors.length)];
        
        // Dessiner une forme de feuille simple
        context.beginPath();
        context.moveTo(size/2, 10);
        context.bezierCurveTo(size/4, size/3, 10, size/2, size/2, size-10);
        context.bezierCurveTo(size-10, size/2, size*3/4, size/3, size/2, 10);
        context.fill();
        
        // Dessiner la nervure centrale
        context.strokeStyle = 'rgba(100, 50, 0, 0.7)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(size/2, 10);
        context.lineTo(size/2, size-10);
        context.stroke();
        
        // Quelques nervures secondaires
        for (let i = 1; i < 5; i++) {
            const y = 10 + i * (size-20) / 5;
            context.beginPath();
            context.moveTo(size/2, y);
            context.lineTo(size/4, y + size/20);
            context.stroke();
            
            context.beginPath();
            context.moveTo(size/2, y);
            context.lineTo(size*3/4, y + size/20);
            context.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        return texture;
    }
    
    /**
     * Crée la géométrie et les attributs pour les feuilles
     */
    createLeaves() {
        // Créer la géométrie des points
        const geometry = new THREE.BufferGeometry();
        
        // Générer les positions aléatoires des feuilles
        const positions = new Float32Array(this.leafCount * 3);
        const sizes = new Float32Array(this.leafCount);
        const velocities = new Float32Array(this.leafCount);
        const angles = new Float32Array(this.leafCount);
        const offsets = new Float32Array(this.leafCount);
        const rotations = new Float32Array(this.leafCount);
        
        const simplex = new SimplexNoise();
        
        // Position centrale (position de la caméra si disponible)
        const center = new THREE.Vector3();
        if (this.camera) {
            center.copy(this.camera.position);
        }
        
        for (let i = 0; i < this.leafCount; i++) {
            // Position aléatoire dans un cercle autour de la caméra
            const radius = Math.random() * this.leafArea;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI; // Pour une distribution 3D sphérique
            
            // Position x, y, z (distribution sphérique autour de la caméra)
            positions[i * 3] = center.x + Math.sin(phi) * Math.cos(theta) * radius;
            positions[i * 3 + 1] = center.y + Math.cos(phi) * radius * 0.5 + Math.random() * this.leafHeight - this.leafHeight * 0.5;
            positions[i * 3 + 2] = center.z + Math.sin(phi) * Math.sin(theta) * radius;
            
            // Taille aléatoire
            sizes[i] = this.minLeafSize + Math.random() * (this.maxLeafSize - this.minLeafSize);
            
            // Vitesse aléatoire
            velocities[i] = 0.8 + Math.random() * 0.4;
            
            // Angle aléatoire
            angles[i] = Math.random() * Math.PI * 2;
            
            // Décalage aléatoire
            offsets[i] = Math.random();
            
            // Rotation initiale aléatoire
            rotations[i] = Math.random() * Math.PI * 2;
        }
        
        // Ajouter les attributs à la géométrie
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        geometry.setAttribute('angle', new THREE.BufferAttribute(angles, 1));
        geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        geometry.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
        
        // Créer le maillage de feuilles
        this.leavesObject = new THREE.Points(geometry, this.leavesMaterial);
        this.leavesObject.frustumCulled = false; // Désactiver le culling pour s'assurer que les feuilles sont toujours visibles
        this.leavesObject.visible = this._intensity > 0.01;
        
        // Position initiale
        if (this.camera) {
            this.leavesObject.position.copy(this.camera.position);
            this.leavesObject.position.y -= 10; // Légèrement en dessous de la caméra
        }
    }
    
    /**
     * Repositionne les feuilles autour de la caméra
     */
    repositionLeaves() {
        if (!this.camera || !this.leavesObject) return;
        
        const positions = this.leavesObject.geometry.attributes.position;
        const rotations = this.leavesObject.geometry.attributes.rotation;
        const velocities = this.leavesObject.geometry.attributes.velocity;
        
        // Position centrale (position de la caméra)
        const center = this.camera.position;
        
        for (let i = 0; i < this.leafCount; i++) {
            // Position aléatoire dans un cercle autour de la caméra
            const radius = Math.random() * this.leafArea;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI; // Pour une distribution 3D sphérique
            
            // Position x, y, z (distribution sphérique autour de la caméra)
            positions.array[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
            positions.array[i * 3 + 1] = Math.cos(phi) * radius * 0.5 + Math.random() * this.leafHeight - this.leafHeight * 0.5;
            positions.array[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
            
            // Réinitialiser la rotation et la vitesse
            rotations.array[i] = Math.random() * Math.PI * 2;
            velocities.array[i] = 0.8 + Math.random() * 0.4;
        }
        
        // Marquer les attributs comme nécessitant une mise à jour
        positions.needsUpdate = true;
        rotations.needsUpdate = true;
        velocities.needsUpdate = true;
        
        // Réinitialiser la position de l'objet des feuilles à la position de la caméra
        this.leavesObject.position.copy(center);
        this.leavesObject.position.y -= 10; // Légèrement en dessous de la caméra
        
        this.lastRepositionTime = this.weatherSystem.time.elapsed;
    }
    
    /**
     * Met à jour les vecteurs pour le mouvement des feuilles
     */
    updateVectors() {
        if (!this.camera) return;
        
        // Obtenir la direction de la caméra
        this._tempVector1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        
        // Calculer le vecteur de mouvement des feuilles (similaire au vent)
        this.windVelocity.lerp(this._tempVector1, 0.1);
    }
    
    /**
     * Met à jour l'effet de feuilles
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.leavesObject || !this.leavesMaterial) return;
        
        this.leavesObject.visible = this._intensity > 0.01;
        
        if (this._intensity <= 0.01) return;
        
        this.leavesMaterial.uniforms.time.value += deltaTime / 1000;
        this.leavesMaterial.uniforms.intensity.value = this._intensity;
        
        // Mettre à jour les paramètres d'éclairage
        if (this.weatherSystem.environment) {
            const env = this.weatherSystem.environment;
            
            // Mettre à jour le facteur jour/nuit
            if (env.skyUniforms && env.skyUniforms.uDayFactor) {
                this.leavesMaterial.uniforms.dayFactor.value = env.skyUniforms.uDayFactor.value;
            }
            
            // Mettre à jour la lumière ambiante
            if (env.ambientLight) {
                this.leavesMaterial.uniforms.ambientColor.value.copy(env.ambientLight.color);
                this.leavesMaterial.uniforms.ambientIntensity.value = env.ambientLight.intensity;
            }
        }
        
        // Mettre à jour la position des feuilles en fonction de la caméra
        if (this.camera && this.lastCameraPosition) {
            const currentPos = this.camera.position;
            
            // Vérifier la distance entre la caméra et le centre des feuilles
            const cameraToLeaves = this._tempVector4.copy(currentPos).sub(this.leavesObject.position);
            const distanceToLeaves = cameraToLeaves.length();
            
            // Si la caméra s'est trop éloignée des feuilles et qu'assez de temps s'est écoulé depuis la dernière fois
            const currentTime = this.weatherSystem.time.elapsed;
            if (distanceToLeaves > this.repositionThreshold && 
                currentTime - this.lastRepositionTime > this.repositionCheckInterval) {
                this.repositionLeaves();
            } else {
                // Sinon, déplacer les feuilles en douceur vers la caméra
                const movement = this._tempVector3.copy(currentPos).sub(this.lastCameraPosition);
                
                // Suivre la caméra en x et z, et en y avec un facteur différent
                movement.y *= this.verticalFollowFactor;
                
                // Appliquer le mouvement à l'objet des feuilles avec un facteur de suivi élevé
                this.leavesObject.position.add(movement.multiplyScalar(this.cameraFollowFactor));
                
                // Faire dériver les feuilles vers la caméra pour éviter qu'elles ne s'éloignent trop
                const driftVector = this._tempVector2.copy(currentPos).sub(this.leavesObject.position);
                driftVector.y *= 0.2; // Réduire l'effet vertical
                driftVector.multiplyScalar(0.01); // Facteur de dérive faible pour un mouvement subtil
                this.leavesObject.position.add(driftVector);
            }
            
            // Mémoriser la position actuelle de la caméra pour le prochain frame
            this.lastCameraPosition.copy(currentPos);
        } else if (this.camera) {
            // Initialisation lors du premier frame
            this.lastCameraPosition = this.camera.position.clone();
            this.repositionLeaves();
        }
        
        // Mise à jour des uniforms de brouillard
        try {
            if (this.scene.fog) {
                // Mise à jour directe de la couleur du brouillard
                this.leavesMaterial.uniforms.fogColor.value.copy(this.scene.fog.color);
                
                // Gestion des différents types de brouillard
                if (this.scene.fog.isFogExp2) {
                    this.leavesMaterial.uniforms.fogDensity.value = this.scene.fog.density;
                    this.leavesMaterial.uniforms.fogNear.value = 5;
                    this.leavesMaterial.uniforms.fogFar.value = 15;
                    
                    if (!this.leavesMaterial.defines?.USE_FOG_EXP2) {
                        this.leavesMaterial.defines = { USE_FOG_EXP2: '' };
                        this.leavesMaterial.needsUpdate = true;
                    }
                } else {
                    this.leavesMaterial.uniforms.fogNear.value = this.scene.fog.near;
                    this.leavesMaterial.uniforms.fogFar.value = this.scene.fog.far;
                    this.leavesMaterial.uniforms.fogDensity.value = 0.1;
                    
                    if (this.leavesMaterial.defines?.USE_FOG_EXP2) {
                        delete this.leavesMaterial.defines.USE_FOG_EXP2;
                        this.leavesMaterial.needsUpdate = true;
                    }
                }
            }
        } catch (error) {
            console.warn("Erreur lors de la mise à jour du brouillard pour les feuilles:", error);
        }
    }
    
    /**
     * Définit l'intensité de l'effet de feuilles
     * @param {number} value - Intensité (0-1)
     */
    set intensity(value) {
        const oldIntensity = this._intensity;
        this._intensity = THREE.MathUtils.clamp(value, 0, 1);
        
        // Mettre à jour la visibilité et l'uniforme si le matériau existe
        if (this.leavesObject) {
            this.leavesObject.visible = this._intensity > 0.01;
        }
        
        if (this.leavesMaterial) {
            this.leavesMaterial.uniforms.intensity.value = this._intensity;
        }
    }
    
    /**
     * Obtient l'intensité actuelle de l'effet de feuilles
     * @returns {number} - Intensité (0-1)
     */
    get intensity() {
        return this._intensity;
    }
} 