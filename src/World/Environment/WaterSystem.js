import * as THREE from 'three';

/**
 * Système gérant l'eau dans l'environnement
 */
export default class WaterSystem {
    /**
     * @param {Object} experience - L'instance principale de l'expérience
     * @param {Object} environment - L'instance de l'environnement
     */
    constructor(experience, environment) {
        this.experience = experience;
        this.environment = environment;
        this.scene = this.experience.scene;
        this.time = this.experience.time;
        
        // Configuration de l'eau
        this.waterWidth = this.environment.mapSize * 2;
        this.waterHeight = this.environment.mapSize * 2;
        this.waterSegments = 500;
        this.waterColor = 0x68c3c0;
        this.waterOpacity = 0.1;
        this.waterPosition = {
            x: 0,
            y: -10,
            z: 0
        };
        
        // Paramètres d'optimisation
        this.maxWaveHeight = 6;
        this.waveSpeed = 3;
        this.waveVariation = 30;
        
        // Paramètres LOD
        this.lodLevels = [
            { segments: 10, distance: 100 },
            { segments: 20, distance: 50 },
            { segments: 500, distance: 0 }
        ];
        this.currentLodLevel = 0;
        
        // Paramètres d'animation de la texture
        this.textureOffset = 0;
        this.textureSpeed = 0.001;
        
        // Initialiser les shaders
        this.initShaders();
        
        // Initialiser le système d'eau
        this.initWater();
    }
    
    /**
     * Initialise les shaders pour l'eau
     */
    initShaders() {
        // Vertex Shader
        this.vertexShader = `
            uniform float time;
            uniform float maxWaveHeight;
            uniform float waveSpeed;
            uniform float waveVariation;
            
            varying vec2 vUv;
            varying float vWave;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                vUv = uv;
                
                // Calcul de la position de base
                vec3 pos = position;
                
                // Calcul de la distance du centre
                float distanceFromCenter = length(pos.xz);
                float normalizedDistance = distanceFromCenter / (${this.waterWidth / 2}.0);
                
                // Ajustement de la hauteur des vagues en fonction de la distance
                float waveHeight = maxWaveHeight * (1.0 - normalizedDistance * 0.3);
                
                // Calcul de la hauteur de la vague avec plusieurs fréquences pour éviter la répétition
                float wave = 0.0;
                wave += sin(pos.x * 0.1 + time * waveSpeed) * cos(pos.z * 0.1 + time * waveSpeed);
                wave += sin(pos.x * 0.05 + time * waveSpeed * 0.7) * cos(pos.z * 0.05 + time * waveSpeed * 0.7) * 0.5;
                wave += sin(pos.x * 0.02 + time * waveSpeed * 0.3) * cos(pos.z * 0.02 + time * waveSpeed * 0.3) * 0.25;
                wave *= waveHeight;
                
                // Calcul de la normale pour les réflexions
                float dx = cos(pos.x * 0.1 + time * waveSpeed) * sin(pos.z * 0.1 + time * waveSpeed) * 0.2;
                float dz = sin(pos.x * 0.1 + time * waveSpeed) * cos(pos.z * 0.1 + time * waveSpeed) * 0.2;
                vNormal = normalize(vec3(-dx, 1.0, -dz));
                
                // Application de la hauteur de la vague
                pos.y += wave;
                
                vWave = wave;
                vViewPosition = (modelViewMatrix * vec4(pos, 1.0)).xyz;
                vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
        
        // Fragment Shader
        this.fragmentShader = `
            uniform vec3 waterColor;
            uniform float waterOpacity;
            uniform float time;
            uniform vec3 ambientLightColor;
            uniform vec3 directionalLightColor;
            uniform vec3 directionalLightDirection;
            
            varying vec2 vUv;
            varying float vWave;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                // Couleur de base
                vec3 color = waterColor;
                
                // Calcul de la réflexion
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                vec3 reflectDir = reflect(viewDir, normal);
                
                // Effet de Fresnel pour la transparence
                float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
                
                // Calcul de l'éclairage
                vec3 lighting = ambientLightColor;
                
                // Éclairage directionnel
                float diffuse = max(dot(normal, directionalLightDirection), 0.0);
                lighting += directionalLightColor * diffuse;
                
                // Combinaison des effets
                color = mix(color, vec3(1.0), fresnel * 0.3);
                color *= lighting;
                
                // Ajout d'un effet de profondeur
                float depth = 1.0 - smoothstep(0.0, 1.0, length(vViewPosition) / 100.0);
                color = mix(color, waterColor * 0.5, depth);
                
                // Ajustement de l'opacité en fonction de l'éclairage et de la profondeur
                float finalOpacity = waterOpacity * (0.5 + fresnel * 0.2) * max(lighting.r, max(lighting.g, lighting.b)) * (0.7 + depth * 0.3);
                
                gl_FragColor = vec4(color, finalOpacity);
            }
        `;
    }
    
    /**
     * Initialise le système d'eau
     */
    initWater() {
        // Créer la géométrie de l'eau
        let geom = new THREE.PlaneGeometry(
            this.waterWidth, 
            this.waterHeight, 
            this.waterSegments, 
            this.waterSegments
        );
        
        // Appliquer une rotation pour que l'eau soit horizontale
        geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        
        // Créer le matériau avec les shaders
        let mat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                maxWaveHeight: { value: this.maxWaveHeight },
                waveSpeed: { value: this.waveSpeed },
                waveVariation: { value: this.waveVariation },
                waterColor: { value: new THREE.Color(this.waterColor) },
                waterOpacity: { value: this.waterOpacity },
                ambientLightColor: { value: new THREE.Color(0x111111) },
                directionalLightColor: { value: new THREE.Color(0xffffff) },
                directionalLightDirection: { value: new THREE.Vector3(0, 1, 0) }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
        
        // Créer le mesh final
        this.waterMesh = new THREE.Mesh(geom, mat);
        
        // Activer les ombres
        this.waterMesh.receiveShadow = true;
        
        // Définir la position
        this.waterMesh.position.set(
            this.waterPosition.x,
            this.waterPosition.y,
            this.waterPosition.z
        );
        
        // Ajouter à la scène
        this.scene.add(this.waterMesh);
    }
    
    /**
     * Déplace les vagues en fonction du temps
     */
    moveWaves() {
        if (!this.waterMesh) return;
        
        // Si le jeu est en pause, ne pas animer les vagues
        if (this.time.isPaused) return;
        
        const positions = this.waterMesh.geometry.attributes.position;
        
        // Pour chaque vertex, mettre à jour sa position
        for (let i = 0; i < this.verticesCount; i++) {
            const vprops = this.waves[i];
            
            // Calculer les nouvelles coordonnées avec un mouvement sinusoïdal
            const x = vprops.x + Math.cos(vprops.ang);
            const y = vprops.y + Math.sin(vprops.ang) * vprops.height;
            
            // Mettre à jour la position du vertex
            positions.setXYZ(i, x, y, vprops.z);
            
            // Mettre à jour l'angle pour la prochaine frame en tenant compte de la vitesse du jeu
            vprops.ang += vprops.speed * this.time.timeScale;
        }
        
        // Indiquer que les positions ont changé
        positions.needsUpdate = true;
    }
    
    /**
     * Met à jour la position de l'eau
     * @param {Object} position - Nouvelle position {x, y, z}
     */
    setPosition(position) {
        if (!this.waterMesh) return;
        
        this.waterPosition = { ...this.waterPosition, ...position };
        this.waterMesh.position.set(
            this.waterPosition.x,
            this.waterPosition.y,
            this.waterPosition.z
        );
    }
    
    /**
     * Définit les dimensions de l'eau
     * @param {number} width - Largeur
     * @param {number} height - Profondeur
     */
    setDimensions(width, height) {
        if (!this.waterMesh) return;
        
        // Stocker les nouvelles dimensions
        this.waterWidth = width;
        this.waterHeight = height;
        
        // Recréer l'eau avec les nouvelles dimensions
        this.scene.remove(this.waterMesh);
        this.initWater();
    }
    
    /**
     * Met à jour le niveau de détail en fonction de la distance
     */
    updateLod() {
        if (!this.waterMesh) return;
        
        const camera = this.experience.camera.instance;
        const distance = camera.position.distanceTo(this.waterMesh.position);

        // Trouver le niveau LOD approprié
        let newLodLevel = this.lodLevels.length - 1;
        for (let i = 0; i < this.lodLevels.length; i++) {
            if (distance > this.lodLevels[i].distance) {
                newLodLevel = i;
                break;
            }
        }
        
        // Si le niveau LOD a changé, recréer la géométrie
        if (newLodLevel !== this.currentLodLevel) {
            this.currentLodLevel = newLodLevel;
            this.waterSegments = this.lodLevels[newLodLevel].segments;
            
            // Sauvegarder la position actuelle
            const currentPosition = this.waterMesh.position.clone();
            
            // Recréer l'eau avec le nouveau niveau de détail
            this.scene.remove(this.waterMesh);
            this.initWater();
            
            // Restaurer la position
            this.waterMesh.position.copy(currentPosition);
        }
    }
    
    /**
     * Mise à jour du système d'eau
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        this.updateLod();
        
        if (this.waterMesh && this.waterMesh.material.uniforms) {
            // Mettre à jour le temps dans le shader
            this.waterMesh.material.uniforms.time.value += deltaTime * 0.001;
            
            // Mettre à jour les lumières
            const scene = this.experience.scene;
            const ambientLight = scene.children.find(child => child instanceof THREE.AmbientLight);
            const directionalLight = scene.children.find(child => child instanceof THREE.DirectionalLight);
            
            if (ambientLight) {
                this.waterMesh.material.uniforms.ambientLightColor.value.copy(ambientLight.color);
            }
            
            if (directionalLight) {
                this.waterMesh.material.uniforms.directionalLightColor.value.copy(directionalLight.color);
                this.waterMesh.material.uniforms.directionalLightDirection.value.copy(directionalLight.position).normalize();
            }
        }
        
        this.animateTexture(deltaTime);
    }
    
    /**
     * Anime la texture de l'eau
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    animateTexture(deltaTime) {
        if (this.waterMesh && this.waterMesh.material.map) {
            if (this.time.isPaused) return;
            
            this.textureOffset += this.textureSpeed * deltaTime * this.time.timeScale;
            this.waterMesh.material.map.offset.set(
                this.textureOffset,
                this.textureOffset * 0.5
            );
        }
    }
    
    /**
     * Nettoie les ressources utilisées par le système d'eau
     */
    destroy() {
        if (this.waterMesh) {
            this.scene.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh.material.dispose();
            this.waterMesh = null;
        }
        
        this.waves = [];
    }
    
    /**
     * Crée une texture procédurale pour l'eau
     * @returns {THREE.Texture} La texture générée
     */
    createWaterTexture() {
        const canvas = document.createElement('canvas');
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Fond bleu transparent
        ctx.fillStyle = 'rgba(104, 195, 192, 0.8)';
        ctx.fillRect(0, 0, size, size);

        // Ajouter des motifs de vagues
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;

        // Dessiner des cercles concentriques pour les vagues
        for (let i = 0; i < 5; i++) {
            const radius = (i + 1) * size / 6;
            ctx.beginPath();
            ctx.arc(size/2, size/2, radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Ajouter des motifs de lumière
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        return texture;
    }
} 