/**
 * Effet de pluie pour le système météorologique
 * Utilise des lignes et des shaders pour simuler la pluie
 * Version refaite basée sur le système de codepen.io
 */
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import ShaderLoader from '../../../Utils/ShaderLoader.js';

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
        this.dropCount = 120000;        // Nombre de fils d'eau - augmenté pour plus de densité
        this.rainSpeed = 80;            // Vitesse de base de la pluie - augmentée pour plus de dynamisme
        this.rainArea = 70;             // Zone de pluie - rayon autour de la caméra - augmentée
        this.rainHeight = 45;           // Hauteur maximale de la pluie - augmentée
        this.speedIntensityFactor = 0.6; // Facteur de proportionnalité entre l'intensité et la vitesse (0-1)
        this.minDropSize = 0.1;         // Taille minimale des fils - augmentée pour mieux voir la forme
        this.maxDropSize = 0.5;         // Taille maximale des fils - augmentée pour mieux voir la forme
        this.stretchFactor = 0.8;       // Facteur d'étirement des fils - augmenté pour l'effet filaire
        this.dropOpacity = 0.8;         // Opacité des fils (0-1)
        this.cameraFollowFactor = 0.15; // Facteur de suivi de la caméra (entre 0 et 1) - réduit pour moins d'attraction
        this.verticalFollowFactor = 0.3; // Facteur de suivi vertical de la caméra (plus élevé pour mieux suivre les mouvements verticaux)
        this.inertiaFactor = 0.92;      // Facteur d'inertie (entre 0 et 1) - plus proche de 1 = plus d'inertie
        this.lastCameraPosition = null;
        
        // Vecteurs temporaires pour les calculs
        this._tempVector1 = new THREE.Vector3();
        this._tempVector2 = new THREE.Vector3();
        this._tempVector3 = new THREE.Vector3();
        this._tempVector4 = new THREE.Vector3();
        this.rainVelocity = new THREE.Vector3();
        
        // Configuration des impacts
        this.enableSplashes = true;
        this.maxSplashes = 2000;
        this.splashRate = 2000;
        this.timeToNextSplash = 0;
        this.splashAreaSize = 50;       // Zone un peu plus concentrée pour mieux voir les impacts
        this.splashSize = { min: 0.8, max: 2.2 }; // Taille des impacts (augmentée)
        this.splashDuration = { min: 0.05, max: 0.1 }; // Durée de vie plus courte pour plus de rafraîchissement
        
        // Initialisation
        this.initialize();
        
        //console.log("Effet de pluie initialisé avec système de particules");
    }
    
    /**
     * Initialise l'effet de pluie de manière asynchrone
     */
    async initialize() {
        try {
            await this.initializeRain();
            if (this.enableSplashes) {
                await this.initializeSplashes();
            }
        } catch (error) {
            console.error("Erreur lors de l'initialisation de l'effet de pluie:", error);
        }
    }
    
    /**
     * Initialise l'effet de pluie avec un système de particules
     */
    async initializeRain() {
        // Chargement des shaders avec la nouvelle méthode
        const vertexShader = await ShaderLoader.loadShader('RainVertex.glsl');
        const fragmentShader = await ShaderLoader.loadShader('RainFragment.glsl');
        
        // Créer la géométrie - maintenant avec des quads au lieu de points
        this.rainGeometry = new THREE.BufferGeometry();
        
        // Chaque goutte = 1 quad = 4 vertices = 6 indices (2 triangles)
        const verticesPerDrop = 4;
        const indicesPerDrop = 6;
        const totalVertices = this.dropCount * verticesPerDrop;
        const totalIndices = this.dropCount * indicesPerDrop;
        
        // Tableaux pour les attributs (4 fois plus d'éléments car 4 vertices par goutte)
        const positions = new Float32Array(totalVertices * 3);      // xyz
        const initialPositions = new Float32Array(totalVertices * 3); // positions initiales xyz
        const sizes = new Float32Array(totalVertices);              // taille
        const velocities = new Float32Array(totalVertices);         // vitesse
        const angles = new Float32Array(totalVertices);             // angle
        const offsets = new Float32Array(totalVertices);            // décalage
        const uvs = new Float32Array(totalVertices * 2);            // coordonnées UV
        const indices = new Uint32Array(totalIndices);              // indices pour les triangles
        
        // Générer les positions et attributs initiaux
        for (let i = 0; i < this.dropCount; i++) {
            // Distribution circulaire autour du centre
            const angle = Math.random() * Math.PI * 2;
            // Distribution uniforme de la surface avec sqrt
            const radius = Math.sqrt(Math.random()) * this.rainArea;
            
            // Position XZ
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // Position Y avec distribution exponentielle (plus de gouttes en haut)
            const heightFactor = Math.pow(Math.random(), 0.5);
            const y = heightFactor * this.rainHeight - this.rainHeight * 0.5;
            
            // Taille de la goutte - relation avec la vitesse
            const velocity = THREE.MathUtils.randFloat(0.8, 1.2);
            
            // Taille basée sur la vitesse (gouttes plus rapides = plus grosses)
            const size = THREE.MathUtils.lerp(
                this.minDropSize,
                this.maxDropSize,
                (velocity - 0.8) / 0.4  // Normaliser entre 0-1
            );
            
            // Angle aléatoire de la goutte (rotation dans le plan XZ)
            const dropAngle = angle;
            
            // Décalage aléatoire pour éviter synchronisation
            const offset = Math.random() * this.rainHeight;
            
            // Hauteur du fil d'eau (proportionnelle à la vitesse)
            const dropHeight = size * this.stretchFactor * 3.0; // Plus long pour l'effet fil
            const dropWidth = size * 0.3; // Plus fin pour l'effet fil
            
            // Créer les 4 vertices du quad pour cette goutte
            const baseIndex = i * verticesPerDrop;
            
            // Vertex 0: en haut à gauche
            positions[baseIndex * 3] = x - dropWidth * 0.5;
            positions[baseIndex * 3 + 1] = y + dropHeight * 0.5;
            positions[baseIndex * 3 + 2] = z;
            uvs[baseIndex * 2] = 0.0;
            uvs[baseIndex * 2 + 1] = 0.0;
            
            // Vertex 1: en haut à droite
            positions[(baseIndex + 1) * 3] = x + dropWidth * 0.5;
            positions[(baseIndex + 1) * 3 + 1] = y + dropHeight * 0.5;
            positions[(baseIndex + 1) * 3 + 2] = z;
            uvs[(baseIndex + 1) * 2] = 1.0;
            uvs[(baseIndex + 1) * 2 + 1] = 0.0;
            
            // Vertex 2: en bas à droite
            positions[(baseIndex + 2) * 3] = x + dropWidth * 0.5;
            positions[(baseIndex + 2) * 3 + 1] = y - dropHeight * 0.5;
            positions[(baseIndex + 2) * 3 + 2] = z;
            uvs[(baseIndex + 2) * 2] = 1.0;
            uvs[(baseIndex + 2) * 2 + 1] = 1.0;
            
            // Vertex 3: en bas à gauche
            positions[(baseIndex + 3) * 3] = x - dropWidth * 0.5;
            positions[(baseIndex + 3) * 3 + 1] = y - dropHeight * 0.5;
            positions[(baseIndex + 3) * 3 + 2] = z;
            uvs[(baseIndex + 3) * 2] = 0.0;
            uvs[(baseIndex + 3) * 2 + 1] = 1.0;
            
            // Dupliquer les propriétés pour les 4 vertices
            for (let v = 0; v < verticesPerDrop; v++) {
                const vertIndex = baseIndex + v;
                
                // Stocker également la position initiale dans l'espace monde
                initialPositions[vertIndex * 3] = positions[vertIndex * 3];
                initialPositions[vertIndex * 3 + 1] = positions[vertIndex * 3 + 1];
                initialPositions[vertIndex * 3 + 2] = positions[vertIndex * 3 + 2];
                
                velocities[vertIndex] = velocity;
                sizes[vertIndex] = size;
                angles[vertIndex] = dropAngle;
                offsets[vertIndex] = offset;
            }
            
            // Créer les indices pour les 2 triangles du quad
            const indexBase = i * indicesPerDrop;
            const vertBase = baseIndex;
            
            // Premier triangle (0, 1, 2)
            indices[indexBase] = vertBase;
            indices[indexBase + 1] = vertBase + 1;
            indices[indexBase + 2] = vertBase + 2;
            
            // Deuxième triangle (0, 2, 3)
            indices[indexBase + 3] = vertBase;
            indices[indexBase + 4] = vertBase + 2;
            indices[indexBase + 5] = vertBase + 3;
        }
        
        // Assigner les attributs à la géométrie
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeometry.setAttribute('initialPosition', new THREE.BufferAttribute(initialPositions, 3));
        this.rainGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        this.rainGeometry.setAttribute('angle', new THREE.BufferAttribute(angles, 1));
        this.rainGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        this.rainGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.rainGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        
        // Initialiser la position de la caméra
        if (this.camera) {
            this.lastCameraPosition = this.camera.position.clone();
        }
        
        // Créer la texture de fils d'eau
        const rainTexture = this.createRainStreamTexture();
        
        // Créer le matériau avec un shader personnalisé
        this.rainMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                intensity: { value: this._intensity },
                rainSpeed: { value: this.rainSpeed },
                rainHeight: { value: this.rainHeight },
                cameraForward: { value: new THREE.Vector3(0, 0, -1) },
                stretchFactor: { value: this.stretchFactor },
                rainTexture: { value: rainTexture },
                fogColor: { value: new THREE.Color(0x000000) },
                fogNear: { value: 1.0 },
                fogFar: { value: 30.0 },
                fogDensity: { value: 0.1 },
                speedIntensityFactor: { value: this.speedIntensityFactor },
                dropOpacity: { value: this.dropOpacity },
                // Nouveaux uniformes pour l'éclairage
                ambientLightColor: { value: new THREE.Color(0x404040) },
                ambientLightIntensity: { value: 0.5 },
                directionalLightColor: { value: new THREE.Color(0xffffff) },
                directionalLightDirection: { value: new THREE.Vector3(0, -1, 0) },
                directionalLightIntensity: { value: 1.0 },
                dayFactor: { value: 1.0 }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
            side: THREE.DoubleSide
        });
        
        // Créer le système de particules - maintenant avec des Mesh au lieu de Points
        this.rainObject = new THREE.Mesh(this.rainGeometry, this.rainMaterial);
        this.rainObject.frustumCulled = false; // Toujours visible même hors du champ de vision
        this.rainObject.name = "RainStreams";
        
        // Visible uniquement si l'intensité > 0
        this.rainObject.visible = this._intensity > 0;
        
        // Ajouter à la scène
        this.scene.add(this.rainObject);
    }
    
    /**
     * Initialise le système d'impacts de gouttes de pluie
     */
    async initializeSplashes() {
        // Chargement des shaders avec la nouvelle méthode
        const vertexShader = await ShaderLoader.loadShader('RainSplashVertex.glsl');
        const fragmentShader = await ShaderLoader.loadShader('RainSplashFragment.glsl');
        
        // Créer la texture des impacts
        const splashTexture = this.createSplashTexture();
        
        // Créer le matériau pour les impacts
        this.splashesMaterial = new THREE.ShaderMaterial({
            uniforms: {
                splashTexture: { value: splashTexture },
                time: { value: 0 },
                intensity: { value: this._intensity },
                // Nouveaux uniformes pour l'éclairage
                ambientLightColor: { value: new THREE.Color(0x404040) },
                ambientLightIntensity: { value: 0.5 },
                directionalLightColor: { value: new THREE.Color(0xffffff) },
                directionalLightDirection: { value: new THREE.Vector3(0, -1, 0) },
                directionalLightIntensity: { value: 1.0 },
                dayFactor: { value: 1.0 }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        // Créer la géométrie pour les impacts
        this.splashesGeometry = new THREE.BufferGeometry();
        
        // Tableaux pour les attributs des impacts
        const positions = new Float32Array(this.maxSplashes * 3);
        const sizes = new Float32Array(this.maxSplashes);
        const lives = new Float32Array(this.maxSplashes);
        const maxLives = new Float32Array(this.maxSplashes);
        const rotations = new Float32Array(this.maxSplashes);
        
        // Initialiser les attributs
        for (let i = 0; i < this.maxSplashes; i++) {
            // Position (hors écran initialement)
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -1000; // Sous la scène
            positions[i * 3 + 2] = 0;
            
            // Taille, vie et rotation aléatoires
            sizes[i] = 0;
            lives[i] = 0;
            maxLives[i] = 0;
            rotations[i] = Math.random() * Math.PI * 2;
        }
        
        // Assigner les attributs à la géométrie
        this.splashesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.splashesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.splashesGeometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        this.splashesGeometry.setAttribute('maxLife', new THREE.BufferAttribute(maxLives, 1));
        this.splashesGeometry.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
        
        // Créer le système de particules
        this.splashesObject = new THREE.Points(this.splashesGeometry, this.splashesMaterial);
        this.splashesObject.frustumCulled = false;
        this.splashesObject.name = "RainSplashes";
        
        // Ajouter à la scène
        this.scene.add(this.splashesObject);
        
        // Initialiser les arrays pour la gestion des impacts
        this.splashesPool = Array.from({ length: this.maxSplashes }, (_, i) => i);
        this.activeSplashes = [];
    }
    
    /**
     * Crée une texture pour les impacts de gouttes
     */
    createSplashTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Centre du canvas
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = canvas.width * 0.3;
        
        // Créer un dégradé radial pour l'impact principal
        const mainGradient = context.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius
        );
        
        // Dégradé principal plus réaliste avec des variations de couleur
        mainGradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        mainGradient.addColorStop(0.1, 'rgba(240, 250, 255, 0.85)');
        mainGradient.addColorStop(0.3, 'rgba(220, 240, 255, 0.7)');
        mainGradient.addColorStop(0.5, 'rgba(200, 230, 255, 0.4)');
        mainGradient.addColorStop(0.7, 'rgba(180, 220, 255, 0.2)');
        mainGradient.addColorStop(1, 'rgba(160, 210, 255, 0)');
        
        // Dessiner le cercle principal avec une légère distorsion
        context.fillStyle = mainGradient;
        context.beginPath();
        context.ellipse(
            centerX, centerY,
            radius * (0.3 + Math.random() * 0.2),
            radius * (0.1 + Math.random() * 0.2),
            0, 0, Math.PI * 2
        );
        context.fill();
        
        // Ajouter des éclaboussures secondaires
        const secondarySplashes = 12;
        const maxSplashDistance = radius * 1.5;
        
        for (let i = 0; i < secondarySplashes; i++) {
            const angle = (i / secondarySplashes) * Math.PI * 2;
            const distance = maxSplashDistance * (0.3 + Math.random() * 0.7);
            const splashX = centerX + Math.cos(angle) * distance;
            const splashY = centerY + Math.sin(angle) * distance;
            
            // Taille et forme variables pour chaque éclaboussure
            const splashSize = radius * (0.15 + Math.random() * 0.25);
            const splashWidth = splashSize * (0.7 + Math.random() * 0.6);
            const splashHeight = splashSize * (0.5 + Math.random() * 0.4);
            
            // Rotation aléatoire pour plus de naturel
            const rotation = Math.random() * Math.PI * 2;
            
            // Dégradé pour chaque éclaboussure
            const splashGradient = context.createRadialGradient(
                splashX, splashY, 0,
                splashX, splashY, splashSize
            );
            
            splashGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            splashGradient.addColorStop(0.5, 'rgba(220, 240, 255, 0.4)');
            splashGradient.addColorStop(1, 'rgba(200, 230, 255, 0)');
            
            context.save();
            context.translate(splashX, splashY);
            context.rotate(rotation);
            context.fillStyle = splashGradient;
            context.beginPath();
            context.ellipse(0, 0, splashWidth, splashHeight, 0, 0, Math.PI * 2);
            context.fill();
            context.restore();
        }
        
        // Ajouter des petites gouttelettes éparpillées
        const droplets = 20;
        for (let i = 0; i < droplets; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = maxSplashDistance * (0.5 + Math.random() * 0.5);
            const dropletX = centerX + Math.cos(angle) * distance;
            const dropletY = centerY + Math.sin(angle) * distance;
            const dropletSize = radius * (0.04 + Math.random() * 0.06);
            
            context.fillStyle = 'rgba(255, 255, 255, 0.6)';
            context.beginPath();
            context.arc(dropletX, dropletY, dropletSize, 0, Math.PI * 2);
            context.fill();
        }
        
        // Ajouter un point lumineux central avec halo
        const centerGradient = context.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius * 0.3
        );
        
        centerGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        centerGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        centerGradient.addColorStop(0.6, 'rgba(240, 250, 255, 0.4)');
        centerGradient.addColorStop(1, 'rgba(220, 240, 255, 0)');
        
        context.fillStyle = centerGradient;
        context.beginPath();
        context.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
        context.fill();
        
        // Ajouter un effet de "wetness" autour de l'impact
        const wetnessGradient = context.createRadialGradient(
            centerX, centerY, radius * 0.3,
            centerX, centerY, radius * 0.9
        );
        
        wetnessGradient.addColorStop(0, 'rgba(200, 230, 255, 0.1)');
        wetnessGradient.addColorStop(0.5, 'rgba(180, 220, 255, 0.05)');
        wetnessGradient.addColorStop(1, 'rgba(160, 210, 255, 0)');
        
        context.fillStyle = wetnessGradient;
        context.beginPath();
        context.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2);
        context.fill();
        
        // Ajouter un effet de volume avec un dégradé radial
        const volumeGradient = context.createRadialGradient(70, 50, 5, 70, 50, 40);
        volumeGradient.addColorStop(0, 'rgba(200, 220, 255, 0.15)');
        volumeGradient.addColorStop(0.5, 'rgba(190, 210, 255, 0.05)');
        volumeGradient.addColorStop(1, 'rgba(180, 200, 255, 0)');
        
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = volumeGradient;
        context.fillRect(25, 25, 80, 70);
        
        // Ajouter un reflet brillant en haut à gauche (comme la lumière réfléchie)
        const refletGradient = context.createRadialGradient(60, 35, 0, 60, 35, 15);
        refletGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        refletGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
        refletGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        
        context.globalCompositeOperation = 'lighter';
        context.fillStyle = refletGradient;
        context.beginPath();
        context.arc(60, 35, 15, 0, Math.PI * 2);
        context.fill();
        
        // Ajouter un petit reflet secondaire
        const refletSecondaire = context.createRadialGradient(70, 45, 0, 70, 45, 8);
        refletSecondaire.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        refletSecondaire.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        
        context.fillStyle = refletSecondaire;
        context.beginPath();
        context.arc(70, 45, 8, 0, Math.PI * 2);
        context.fill();
        
        // Créer la texture
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        return texture;
    }
    
    /**
     * Met à jour les informations d'éclairage pour la pluie
     */
    updateLighting() {
        if (!this.rainMaterial || !this.rainMaterial.uniforms) return;
        
        // Valeurs par défaut
        let ambientColor = new THREE.Color(0x404040);
        let ambientIntensity = 0.5;
        let directionalColor = new THREE.Color(0xffffff);
        let directionalDirection = new THREE.Vector3(0, -1, 0);
        let directionalIntensity = 1.0;
        let dayFactor = 1.0;
        
        // Récupérer les informations depuis le système météorologique si disponible
        if (this.weatherSystem.environment) {
            const env = this.weatherSystem.environment;
            
            // Facteur jour/nuit depuis les uniformes du ciel
            if (env.skyUniforms && env.skyUniforms.uDayFactor) {
                dayFactor = env.skyUniforms.uDayFactor.value;
            }
            
            // Lumière ambiante
            if (env.ambientLight) {
                ambientColor.copy(env.ambientLight.color);
                ambientIntensity = env.ambientLight.intensity;
            }
            
            // Lumière directionnelle (soleil)
            if (env.sunLight) {
                directionalColor.copy(env.sunLight.color);
                directionalDirection.copy(env.sunLight.position).normalize();
                directionalIntensity = env.sunLight.intensity;
            }
        }
        
        // Parcourir la scène pour trouver d'autres lumières si l'environnement n'est pas disponible
        if (!this.weatherSystem.environment) {
            this.scene.traverse((object) => {
                if (object.isLight && object.visible) {
                    if (object.isAmbientLight) {
                        ambientColor.copy(object.color);
                        ambientIntensity = object.intensity;
                    } else if (object.isDirectionalLight) {
                        directionalColor.copy(object.color);
                        directionalDirection.copy(object.position).normalize();
                        directionalIntensity = object.intensity;
                    }
                }
            });
        }
        
        // Mettre à jour les uniformes
        this.rainMaterial.uniforms.ambientLightColor.value.copy(ambientColor);
        this.rainMaterial.uniforms.ambientLightIntensity.value = ambientIntensity;
        this.rainMaterial.uniforms.directionalLightColor.value.copy(directionalColor);
        this.rainMaterial.uniforms.directionalLightDirection.value.copy(directionalDirection);
        this.rainMaterial.uniforms.directionalLightIntensity.value = directionalIntensity;
        this.rainMaterial.uniforms.dayFactor.value = dayFactor;
    }
    
    /**
     * Met à jour l'effet de pluie
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.rainObject || !this.rainMaterial) return;
        
        this.rainObject.visible = this._intensity > 0.01;
        
        if (this._intensity <= 0.01) return;
        
        this.rainMaterial.uniforms.time.value += deltaTime / 1000;
        this.rainMaterial.uniforms.intensity.value = this._intensity;
        
        // Mettre à jour l'éclairage
        this.updateLighting();
        
        if (this.enableSplashes && this.splashesObject) {
            this.updateSplashes(deltaTime);
        }
        
        try {
            if (this.scene.fog) {
                this.rainMaterial.uniforms.fogColor.value.copy(this.scene.fog.color);
                
                if (this.scene.fog.isFogExp2) {
                    this.rainMaterial.uniforms.fogDensity.value = this.scene.fog.density;
                    this.rainMaterial.uniforms.fogNear.value = 5;
                    this.rainMaterial.uniforms.fogFar.value = 15;
                    
                    if (!this.rainMaterial.defines?.USE_FOG_EXP2) {
                        this.rainMaterial.defines = { USE_FOG_EXP2: '' };
                        this.rainMaterial.needsUpdate = true;
                    }
                } else {
                    this.rainMaterial.uniforms.fogNear.value = this.scene.fog.near;
                    this.rainMaterial.uniforms.fogFar.value = this.scene.fog.far;
                    this.rainMaterial.uniforms.fogDensity.value = 0.1;
                    
                    if (this.rainMaterial.defines?.USE_FOG_EXP2) {
                        delete this.rainMaterial.defines.USE_FOG_EXP2;
                        this.rainMaterial.needsUpdate = true;
                    }
                }
            }
        } catch (error) {
            console.warn("Erreur lors de la mise à jour du brouillard dans la pluie:", error);
        }
        
        if (this.camera) {
            // Copier la position de la caméra dans un vecteur temporaire
            const cameraPosition = this._tempVector1.copy(this.camera.position);
            
            if (!this.lastCameraPosition) {
                this.lastCameraPosition = cameraPosition.clone();
                this.rainObject.position.copy(cameraPosition);
                this.rainVelocity.set(0, 0, 0);
            } else {
                // Calculer le déplacement en utilisant des vecteurs temporaires
                const displacement = this._tempVector2.copy(cameraPosition).sub(this.lastCameraPosition);
                
                const adjustedDisplacement = this._tempVector3.set(
                    displacement.x * this.cameraFollowFactor,
                    displacement.y * this.verticalFollowFactor,
                    displacement.z * this.cameraFollowFactor
                );
                
                const targetPosition = this._tempVector4.copy(this.rainObject.position).add(adjustedDisplacement);
                const targetVelocity = targetPosition.sub(this.rainObject.position);
                
                const yInertiaFactor = Math.min(this.inertiaFactor, 0.85);
                this.rainVelocity.x = this.rainVelocity.x * this.inertiaFactor + targetVelocity.x * (1 - this.inertiaFactor);
                this.rainVelocity.y = this.rainVelocity.y * yInertiaFactor + targetVelocity.y * (1 - yInertiaFactor);
                this.rainVelocity.z = this.rainVelocity.z * this.inertiaFactor + targetVelocity.z * (1 - this.inertiaFactor);
                
                const distanceToCamera = this.rainObject.position.distanceToSquared(cameraPosition);
                const recenterForce = this._tempVector2.copy(cameraPosition).sub(this.rainObject.position).normalize().multiplyScalar(
                    Math.max(0, Math.sqrt(distanceToCamera) - this.rainArea * 0.25) * 0.01
                );
                this.rainVelocity.add(recenterForce);
                
                this.rainObject.position.add(this.rainVelocity);
                
                const maxDistance = this.rainArea * 0.5;
                const maxDistanceSquared = maxDistance * maxDistance;
                
                if (distanceToCamera > maxDistanceSquared) {
                    const direction = this._tempVector2.copy(this.rainObject.position).sub(cameraPosition).normalize();
                    this.rainObject.position.copy(cameraPosition).add(direction.multiplyScalar(maxDistance));
                    this.rainVelocity.multiplyScalar(0.5);
                }
                
                const heightDifference = Math.abs(this.rainObject.position.y - cameraPosition.y);
                const maxHeightDifference = this.rainHeight * 0.3;
                
                if (heightDifference > maxHeightDifference) {
                    if (this.rainObject.position.y > cameraPosition.y) {
                        this.rainObject.position.y = cameraPosition.y + maxHeightDifference;
                    } else {
                        this.rainObject.position.y = cameraPosition.y - maxHeightDifference;
                    }
                    this.rainVelocity.y *= 0.5;
                }
            }
            
            this.lastCameraPosition.copy(cameraPosition);
            
            const cameraDirection = this._tempVector1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this.rainMaterial.uniforms.cameraForward.value.copy(cameraDirection);
            
            this.rainObject.rotation.set(0, 0, 0);
        }
    }
    
    /**
     * Met à jour les informations d'éclairage pour les impacts de pluie
     */
    updateSplashesLighting() {
        if (!this.splashesMaterial || !this.splashesMaterial.uniforms) return;
        
        // Utiliser les mêmes valeurs que pour les gouttes de pluie
        if (this.rainMaterial && this.rainMaterial.uniforms) {
            const rainUniforms = this.rainMaterial.uniforms;
            const splashUniforms = this.splashesMaterial.uniforms;
            
            splashUniforms.ambientLightColor.value.copy(rainUniforms.ambientLightColor.value);
            splashUniforms.ambientLightIntensity.value = rainUniforms.ambientLightIntensity.value;
            splashUniforms.directionalLightColor.value.copy(rainUniforms.directionalLightColor.value);
            splashUniforms.directionalLightDirection.value.copy(rainUniforms.directionalLightDirection.value);
            splashUniforms.directionalLightIntensity.value = rainUniforms.directionalLightIntensity.value;
            splashUniforms.dayFactor.value = rainUniforms.dayFactor.value;
        }
    }
    
    /**
     * Met à jour les impacts de gouttes
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    updateSplashes(deltaTime) {
        // Convertir deltaTime en secondes
        const deltaSeconds = deltaTime / 1000;
        
        // Mettre à jour le temps dans le shader
        this.splashesMaterial.uniforms.time.value += deltaSeconds;
        this.splashesMaterial.uniforms.intensity.value = this._intensity;
        
        // Mettre à jour l'éclairage des impacts
        this.updateSplashesLighting();
        
        // Ne pas générer d'impacts si l'intensité est trop faible
        if (this._intensity < 0.1) {
            // Juste mettre à jour les impacts existants
            this.updateActiveSplashes(deltaSeconds);
            return;
        }
        
        // Limiter le nombre d'impacts actifs en fonction de l'intensité
        const maxActiveBasedOnIntensity = Math.floor(this.maxSplashes * this._intensity);
        
        // Si nous avons déjà beaucoup d'impacts actifs, mettre à jour sans en créer de nouveaux
        if (this.activeSplashes.length > maxActiveBasedOnIntensity) {
            this.updateActiveSplashes(deltaSeconds);
            return;
        }
        
        // Mettre à jour le compteur pour la prochaine génération d'impact
        this.timeToNextSplash -= deltaSeconds;
        
        // Taux de génération adaptés à l'intensité
        const adjustedRate = this.splashRate * this._intensity;
        const timeBetweenSplashes = 1 / adjustedRate;
        
        // Générer de nouveaux impacts de gouttes
        // Créer plusieurs gouttes par frame pour atteindre plus rapidement un état stable
        const maxSplashesPerFrame = 5;
        let splashesCreated = 0;
        
        while (this.timeToNextSplash <= 0 && 
               this.activeSplashes.length < maxActiveBasedOnIntensity && 
               splashesCreated < maxSplashesPerFrame) {
            this.createNewSplash();
            this.timeToNextSplash += timeBetweenSplashes;
            splashesCreated++;
        }
        
        // Mettre à jour les impacts existants
        this.updateActiveSplashes(deltaSeconds);
    }
    
    /**
     * Crée un nouvel impact de goutte
     */
    createNewSplash() {
        // Vérifier si nous avons des impacts disponibles dans le pool
        if (this.splashesPool.length === 0) return;
        
        // Obtenir un index d'impact du pool
        const splashIndex = this.splashesPool.pop();
        
        // Position de la caméra
        const cameraPosition = this.camera.position.clone();
        
        // Générer une position aléatoire autour de la caméra
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.pow(Math.random(), 0.5) * this.splashAreaSize; // Distribution plus uniforme
        const x = cameraPosition.x + Math.cos(angle) * distance;
        const z = cameraPosition.z + Math.sin(angle) * distance;
        
        // Position Y adaptée au sol
        // Note importante: pour un placement plus précis, il faudrait faire un raycasting
        // vers le bas pour trouver la hauteur exacte du sol à cette position x,z
        const y = 0.05; // Légèrement au-dessus du sol pour être toujours visible
        
        // Durée de vie aléatoire
        const life = 0;
        const maxLife = THREE.MathUtils.randFloat(
            this.splashDuration.min, 
            this.splashDuration.max
        );
        
        // Taille aléatoire, mais avec tendance vers les plus grosses tailles
        const sizeRandom = Math.pow(Math.random(), 0.7); // Favorise les tailles plus grandes
        const size = THREE.MathUtils.lerp(
            this.splashSize.min,
            this.splashSize.max,
            sizeRandom
        );
        
        // Mettre à jour les attributs
        const positions = this.splashesGeometry.getAttribute('position');
        const sizes = this.splashesGeometry.getAttribute('size');
        const lives = this.splashesGeometry.getAttribute('life');
        const maxLives = this.splashesGeometry.getAttribute('maxLife');
        
        positions.array[splashIndex * 3] = x;
        positions.array[splashIndex * 3 + 1] = y;
        positions.array[splashIndex * 3 + 2] = z;
        
        sizes.array[splashIndex] = size;
        lives.array[splashIndex] = life;
        maxLives.array[splashIndex] = maxLife;
        
        // Marquer les attributs comme nécessitant une mise à jour
        positions.needsUpdate = true;
        sizes.needsUpdate = true;
        lives.needsUpdate = true;
        maxLives.needsUpdate = true;
        
        // Ajouter à la liste des impacts actifs
        this.activeSplashes.push({
            index: splashIndex,
            life: life,
            maxLife: maxLife
        });
    }
    
    /**
     * Met à jour les impacts actifs et supprime ceux qui ont expiré
     * @param {number} deltaSeconds - Temps écoulé en secondes
     */
    updateActiveSplashes(deltaSeconds) {
        if (this.activeSplashes.length === 0) return;
        
        const lives = this.splashesGeometry.getAttribute('life');
        
        // Mettre à jour chaque impact actif
        for (let i = this.activeSplashes.length - 1; i >= 0; i--) {
            const splash = this.activeSplashes[i];
            
            // Incrémenter la vie
            splash.life += deltaSeconds;
            lives.array[splash.index] = splash.life;
            
            // Si la vie a dépassé la durée maximale, recycler l'impact
            if (splash.life >= splash.maxLife) {
                // Mettre la position hors écran
                const positions = this.splashesGeometry.getAttribute('position');
                positions.array[splash.index * 3 + 1] = -1000;
                positions.needsUpdate = true;
                
                // Remettre dans le pool et retirer des actifs
                this.splashesPool.push(splash.index);
                this.activeSplashes.splice(i, 1);
            }
        }
        
        lives.needsUpdate = true;
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
            //console.log(`Pluie ${this._intensity > 0.01 ? 'activée' : 'désactivée'} avec intensité: ${this._intensity.toFixed(2)}`);
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
            // Nettoyer la texture
            if (this.rainMaterial.uniforms.rainTexture) {
                this.rainMaterial.uniforms.rainTexture.value.dispose();
            }
            this.rainMaterial.dispose();
        }
        
        // Nettoyage des impacts de gouttes
        if (this.splashesObject) {
            this.scene.remove(this.splashesObject);
        }
        
        if (this.splashesGeometry) {
            this.splashesGeometry.dispose();
        }
        
        if (this.splashesMaterial) {
            if (this.splashesMaterial.uniforms.splashTexture) {
                this.splashesMaterial.uniforms.splashTexture.value.dispose();
            }
            this.splashesMaterial.dispose();
        }
        
        this.rainObject = null;
        this.rainGeometry = null;
        this.rainMaterial = null;
        this.splashesObject = null;
        this.splashesGeometry = null;
        this.splashesMaterial = null;
    }

    /**
     * Crée une texture pour les fils d'eau verticaux
     * @returns {THREE.Texture}
     */
    createRainStreamTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;  // Plus étroit car les fils sont fins
        canvas.height = 256; // Plus haut pour l'effet d'étirement vertical
        
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Créer un dégradé vertical pour simuler un fil d'eau
        const centerX = canvas.width / 2;
        
        // Dégradé principal vertical avec effet de transparence
        const streamGradient = context.createLinearGradient(0, 0, 0, canvas.height);
        
        // Effet de fade-in/fade-out pour simuler le mouvement
        streamGradient.addColorStop(0, 'rgba(200, 220, 255, 0.0)');    // Transparent en haut
        streamGradient.addColorStop(0.05, 'rgba(210, 230, 255, 0.3)'); // Fade-in rapide
        streamGradient.addColorStop(0.15, 'rgba(220, 240, 255, 0.8)'); // Corps principal
        streamGradient.addColorStop(0.85, 'rgba(200, 230, 255, 0.8)'); // Corps principal
        streamGradient.addColorStop(0.95, 'rgba(180, 210, 255, 0.3)'); // Fade-out
        streamGradient.addColorStop(1.0, 'rgba(160, 200, 255, 0.0)');  // Transparent en bas
        
        // Créer le fil principal (forme étirée verticalement)
        const streamWidth = canvas.width * 0.6;
        const streamLeft = centerX - streamWidth / 2;
        const streamRight = centerX + streamWidth / 2;
        
        // Dessiner le fil principal
        context.fillStyle = streamGradient;
        context.fillRect(streamLeft, 0, streamWidth, canvas.height);
        
        // Ajouter un dégradé horizontal pour donner du volume au fil
        const volumeGradient = context.createRadialGradient(
            centerX, canvas.height / 2, 0,
            centerX, canvas.height / 2, streamWidth / 2
        );
        
        volumeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        volumeGradient.addColorStop(0.3, 'rgba(240, 250, 255, 0.2)');
        volumeGradient.addColorStop(0.7, 'rgba(220, 235, 255, 0.1)');
        volumeGradient.addColorStop(1, 'rgba(200, 220, 255, 0.0)');
        
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = volumeGradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter des reflets brillants sur les côtés pour simuler la réflexion de la lumière
        context.globalCompositeOperation = 'lighter';
        
        // Reflet gauche
        const leftHighlight = context.createLinearGradient(
            streamLeft, 0, 
            streamLeft + streamWidth * 0.3, 0
        );
        leftHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        leftHighlight.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        
        context.fillStyle = leftHighlight;
        context.fillRect(streamLeft, canvas.height * 0.1, streamWidth * 0.3, canvas.height * 0.8);
        
        // Reflet droit (plus subtil)
        const rightHighlight = context.createLinearGradient(
            streamRight - streamWidth * 0.2, 0,
            streamRight, 0
        );
        rightHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
        rightHighlight.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
        
        context.fillStyle = rightHighlight;
        context.fillRect(streamRight - streamWidth * 0.2, canvas.height * 0.1, streamWidth * 0.2, canvas.height * 0.8);
        
        // Ajouter un effet de "scintillement" au centre pour simuler les reflets dynamiques
        context.globalCompositeOperation = 'lighter';
        
        // Plusieurs petites zones brillantes réparties verticalement
        for (let i = 0; i < 5; i++) {
            const y = canvas.height * (0.2 + i * 0.15);
            const intensity = 0.15 + Math.random() * 0.1;
            
            const sparkleGradient = context.createRadialGradient(
                centerX, y, 0,
                centerX, y, streamWidth * 0.4
            );
            
            sparkleGradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
            sparkleGradient.addColorStop(0.5, `rgba(240, 250, 255, ${intensity * 0.5})`);
            sparkleGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
            
            context.fillStyle = sparkleGradient;
            context.beginPath();
            context.arc(centerX, y, streamWidth * 0.4, 0, Math.PI * 2);
            context.fill();
        }
        
        // Ajouter un léger effet de "turbulence" sur les bords
        context.globalCompositeOperation = 'source-atop';
        
        // Créer des variations subtiles sur les bords pour simuler la turbulence de l'eau
        for (let y = 0; y < canvas.height; y += 4) {
            const leftVariation = Math.sin(y * 0.1) * 2;
            const rightVariation = Math.cos(y * 0.1) * 2;
            
            const turbulenceGradient = context.createLinearGradient(0, y, canvas.width, y);
            turbulenceGradient.addColorStop(0, 'rgba(180, 200, 240, 0.1)');
            turbulenceGradient.addColorStop(0.5, 'rgba(200, 220, 255, 0.0)');
            turbulenceGradient.addColorStop(1, 'rgba(180, 200, 240, 0.1)');
            
            context.fillStyle = turbulenceGradient;
            context.fillRect(
                streamLeft + leftVariation, y, 
                streamWidth + rightVariation - leftVariation, 2
            );
        }
        
        // Créer la texture
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        texture.wrapS = THREE.ClampToEdgeWrap;
        texture.wrapT = THREE.ClampToEdgeWrap;
        
        return texture;
    }
}