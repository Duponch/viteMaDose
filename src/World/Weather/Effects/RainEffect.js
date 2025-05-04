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
        this.dropCount = 250000;         // Nombre de gouttes de pluie - augmenté pour plus de densité
        this.rainSpeed = 18;            // Vitesse de base de la pluie - augmentée légèrement
        this.rainArea = 70;             // Zone de pluie - rayon autour de la caméra - augmentée
        this.rainHeight = 45;           // Hauteur maximale de la pluie - augmentée
        this.speedIntensityFactor = 0.5; // Facteur de proportionnalité entre l'intensité et la vitesse (0-1)
        this.minDropSize = 0.1;         // Taille minimale des gouttes - augmentée pour mieux voir la forme
        this.maxDropSize = 0.5;         // Taille maximale des gouttes - augmentée pour mieux voir la forme
        this.stretchFactor = 0.5;       // Facteur d'étirement des gouttes - augmenté
        this.dropOpacity = 0.8;         // Opacité des gouttes (0-1)
        this.cameraFollowFactor = 0.15; // Facteur de suivi de la caméra (entre 0 et 1) - réduit pour moins d'attraction
        this.verticalFollowFactor = 0.3; // Facteur de suivi vertical de la caméra (plus élevé pour mieux suivre les mouvements verticaux)
        this.inertiaFactor = 0.92;      // Facteur d'inertie (entre 0 et 1) - plus proche de 1 = plus d'inertie
        this.lastCameraPosition = null; // Dernière position de la caméra pour l'inertie
        this.rainVelocity = new THREE.Vector3(0, 0, 0); // Vélocité actuelle du système de pluie
        
        // Configuration des impacts de gouttes
        this.enableSplashes = true;     // Activer/désactiver les impacts de gouttes
        this.maxSplashes = 300;         // Nombre maximum d'impacts affichés simultanément (augmenté de 100 à 300)
        this.splashSize = { min: 0.8, max: 2.2 }; // Taille des impacts (augmentée)
        this.splashDuration = { min: 0.2, max: 0.5 }; // Durée de vie plus courte pour plus de rafraîchissement
        this.splashRate = 120;          // Taux de génération d'impacts par seconde (considérablement augmenté)
        this.splashAreaSize = 25;       // Zone un peu plus concentrée pour mieux voir les impacts
        
        // Objets Three.js
        this.rainObject = null;
        this.rainGeometry = null;
        this.rainMaterial = null;
        
        // Objets pour les impacts de gouttes
        this.splashesObject = null;
        this.splashesGeometry = null;
        this.splashesMaterial = null;
        this.splashesPool = [];         // Pool d'impacts de gouttes
        this.activeSplashes = [];       // Impacts actuellement visibles
        this.timeToNextSplash = 0;      // Temps avant le prochain impact
        
        // Initialisation
        this.initialize();
        
        console.log("Effet de pluie initialisé avec système de particules");
    }
    
    /**
     * Initialise l'effet de pluie avec un système de particules
     */
    initialize() {
        // Initialiser la pluie
        this.initializeRain();
        
        // Initialiser les impacts de gouttes si activés
        if (this.enableSplashes) {
            this.initializeSplashes();
        }
    }
    
    /**
     * Initialise l'effet de pluie avec un système de particules
     */
    initializeRain() {
        // Créer la géométrie
        this.rainGeometry = new THREE.BufferGeometry();
        
        // Tableaux pour les attributs
        const positions = new Float32Array(this.dropCount * 3);      // xyz
        const initialPositions = new Float32Array(this.dropCount * 3); // positions initiales xyz
        const sizes = new Float32Array(this.dropCount);              // taille
        const velocities = new Float32Array(this.dropCount);         // vitesse
        const angles = new Float32Array(this.dropCount);             // angle
        const offsets = new Float32Array(this.dropCount);            // décalage
        
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
            
            // Stocker la position
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            // Stocker également la position initiale dans l'espace monde
            // (utilisée pour l'effet d'inertie)
            initialPositions[i * 3] = x;
            initialPositions[i * 3 + 1] = y;
            initialPositions[i * 3 + 2] = z;
            
            // Taille de la goutte - relation avec la vitesse
            const velocity = THREE.MathUtils.randFloat(0.8, 1.2); 
            velocities[i] = velocity;
            
            // Taille basée sur la vitesse (gouttes plus rapides = plus grosses)
            sizes[i] = THREE.MathUtils.lerp(
                this.minDropSize,
                this.maxDropSize,
                (velocity - 0.8) / 0.4  // Normaliser entre 0-1
            );
            
            // Angle aléatoire de la goutte (rotation dans le plan XZ)
            angles[i] = angle;
            
            // Décalage aléatoire pour éviter synchronisation
            offsets[i] = Math.random() * this.rainHeight;
        }
        
        // Assigner les attributs à la géométrie
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeometry.setAttribute('initialPosition', new THREE.BufferAttribute(initialPositions, 3));
        this.rainGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        this.rainGeometry.setAttribute('angle', new THREE.BufferAttribute(angles, 1));
        this.rainGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        
        // Initialiser la position de la caméra
        if (this.camera) {
            this.lastCameraPosition = this.camera.position.clone();
        }
        
        // Créer la texture de goutte
        const rainTexture = this.createRainDropTexture();
        
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
                dropOpacity: { value: this.dropOpacity }
            },
            vertexShader: `
                uniform float time;
                uniform float intensity;
                uniform float rainSpeed;
                uniform float rainHeight;
                uniform vec3 cameraForward;
                uniform float stretchFactor;
                uniform float speedIntensityFactor;
                
                attribute float size;
                attribute float velocity;
                attribute float angle;
                attribute float offset;
                
                varying float vSize;
                varying float vDistance;
                varying vec2 vUv;
                
                void main() {
                    // Paramètres de la goutte
                    vSize = size;
                    
                    // Position de base
                    vec3 basePos = position;
                    
                    // Animation de chute
                    float fallSpeed = rainSpeed * velocity * (1.0 + (intensity - 1.0) * speedIntensityFactor);
                    // Ajout d'un léger décalage aléatoire à la vitesse pour plus de réalisme
                    fallSpeed *= (0.9 + 0.2 * fract(sin(dot(vec2(basePos.x, basePos.z), vec2(12.9898, 78.233))) * 43758.5453));
                    float yPos = mod(basePos.y - time * fallSpeed + offset, rainHeight) - rainHeight * 0.5;
                    
                    // Position finale
                    vec3 finalPos = vec3(
                        basePos.x,
                        yPos,
                        basePos.z
                    );
                    
                    // Si intensité est 0, cacher les gouttes
                    if (intensity < 0.01) {
                        finalPos.y = -1000.0;
                    }
                    
                    // Position et taille dans l'espace caméra
                    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
                    vDistance = -mvPosition.z;
                    
                    // Appliquer la taille en fonction de la distance et de l'intensité
                    float sizeBoost = 1.0 + intensity * 0.5;
                    float pointSize = size * sizeBoost * (300.0 / vDistance); // Adapter taille à la distance
                    
                    // Coordonnées UV pour orienter la texture
                    vUv = vec2(0.5, 0.5);
                    
                    gl_PointSize = pointSize;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D rainTexture;
                uniform float intensity;
                uniform vec3 fogColor;
                uniform float fogNear;
                uniform float fogFar;
                uniform float fogDensity;
                uniform float dropOpacity;
                
                varying float vSize;
                varying float vDistance;
                varying vec2 vUv;
                
                void main() {
                    // Orienter les coordonnées UV pour que la pointe de la goutte pointe vers le bas
                    vec2 rotatedUv = gl_PointCoord;
                    
                    // Échantillonner la texture de goutte
                    vec4 texColor = texture2D(rainTexture, rotatedUv);
                    
                    // Transparence de base ajustée par l'intensité et l'opacité configurée
                    float alpha = texColor.a * intensity * dropOpacity;
                    
                    // Traitement du brouillard
                    float fogFactor = 0.0;
                    
                    // Choix du type de brouillard (exponentiel ou linéaire)
                    #ifdef USE_FOG_EXP2
                        fogFactor = 1.0 - exp(-fogDensity * vDistance);
                    #else
                        fogFactor = smoothstep(fogNear, fogFar, vDistance);
                    #endif
                    
                    // Limiter l'effet de brouillard sur les gouttes pour qu'elles restent plus visibles
                    fogFactor = min(fogFactor * 0.8, 0.6);
                    
                    // Appliquer le brouillard
                    vec3 finalColor = texColor.rgb;
                    if (fogFactor > 0.001) {
                        // Mélanger avec le brouillard mais préserver plus de luminosité
                        finalColor = mix(finalColor, fogColor * 1.2, fogFactor);
                        
                        // Augmenter légèrement l'opacité pour compenser le brouillard
                        alpha = alpha * (1.0 + fogFactor * 0.3);
                    }
                    
                    // Couleur finale
                    gl_FragColor = vec4(finalColor, alpha);
                    
                    // Rejeter les pixels trop transparents
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        });
        
        // Créer le système de particules
        this.rainObject = new THREE.Points(this.rainGeometry, this.rainMaterial);
        this.rainObject.frustumCulled = false; // Toujours visible même hors du champ de vision
        this.rainObject.name = "RainParticles";
        
        // Visible uniquement si l'intensité > 0
        this.rainObject.visible = this._intensity > 0;
        
        // Ajouter à la scène
        this.scene.add(this.rainObject);
    }
    
    /**
     * Initialise le système d'impacts de gouttes de pluie
     */
    initializeSplashes() {
        // Créer la texture des impacts
        const splashTexture = this.createSplashTexture();
        
        // Créer le matériau pour les impacts
        this.splashesMaterial = new THREE.ShaderMaterial({
            uniforms: {
                splashTexture: { value: splashTexture },
                time: { value: 0 },
                intensity: { value: this._intensity }
            },
            vertexShader: `
                attribute float size;
                attribute float life;
                attribute float maxLife;
                attribute float rotation;
                
                varying vec2 vUv;
                varying float vLife;
                
                void main() {
                    // Position dans l'espace caméra
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Calculer la taille en fonction de la distance
                    float pointSize = size * (300.0 / -mvPosition.z);
                    
                    // Ratio de vie restante (entre 0 et 1)
                    vLife = life / maxLife;
                    
                    gl_PointSize = pointSize;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D splashTexture;
                uniform float intensity;
                
                varying float vLife;
                
                void main() {
                    // Échantillonner la texture d'impact
                    vec4 texColor = texture2D(splashTexture, gl_PointCoord);
                    
                    // Ajuster l'opacité en fonction du temps de vie et de l'intensité
                    // Fade-in rapide suivi d'un fade-out plus lent
                    float fadeIn = smoothstep(0.0, 0.1, vLife);
                    float fadeOut = smoothstep(0.0, 1.0, vLife);
                    float alpha = texColor.a * fadeIn * (1.0 - fadeOut) * intensity;
                    
                    // Couleur finale
                    gl_FragColor = vec4(texColor.rgb, alpha);
                    
                    // Rejeter les pixels trop transparents
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
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
        canvas.width = 128;
        canvas.height = 128;
        
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Centre du canvas
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = canvas.width * 0.4;
        
        // Créer un dégradé radial pour l'impact principal
        const gradient = context.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius
        );
        
        // Dégradé pour l'impact d'eau - plus lumineux pour mieux voir
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.2, 'rgba(230, 245, 255, 0.7)');
        gradient.addColorStop(0.5, 'rgba(210, 235, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(200, 230, 255, 0)');
        
        // Dessiner le cercle central de l'impact
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
        
        // Ajouter de petits cercles pour simuler les éclaboussures
        const splashCount = 8; // Augmenter le nombre d'éclaboussures
        const maxSplashDistance = radius * 0.9;
        
        for (let i = 0; i < splashCount; i++) {
            const angle = (i / splashCount) * Math.PI * 2;
            const distance = maxSplashDistance * (0.4 + Math.random() * 0.6);
            const splashX = centerX + Math.cos(angle) * distance;
            const splashY = centerY + Math.sin(angle) * distance;
            const splashSize = radius * (0.15 + Math.random() * 0.2); // Augmenter la taille
            
            // Dégradé pour chaque éclaboussure - plus lumineux
            const splashGradient = context.createRadialGradient(
                splashX, splashY, 0,
                splashX, splashY, splashSize
            );
            
            splashGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
            splashGradient.addColorStop(1, 'rgba(220, 240, 255, 0)');
            
            context.fillStyle = splashGradient;
            context.beginPath();
            context.arc(splashX, splashY, splashSize, 0, Math.PI * 2);
            context.fill();
        }
        
        // Ajouter un petit cercle central plus lumineux
        const centerGradient = context.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius * 0.3
        );
        
        centerGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        centerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        context.fillStyle = centerGradient;
        context.beginPath();
        context.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
        context.fill();
        
        // Créer la texture
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        return texture;
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
        
        // Mise à jour des impacts de gouttes si activés
        if (this.enableSplashes && this.splashesObject) {
            this.updateSplashes(deltaTime);
        }
        
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
                    if (!this.rainMaterial.defines?.USE_FOG_EXP2) {
                        this.rainMaterial.defines = {
                            USE_FOG_EXP2: ''
                        };
                        this.rainMaterial.needsUpdate = true;
                    }
                } else {
                    // Fog linéaire
                    this.rainMaterial.uniforms.fogNear.value = this.scene.fog.near;
                    this.rainMaterial.uniforms.fogFar.value = this.scene.fog.far;
                    // Valeur fictive pour fogDensity (non utilisée dans ce cas)
                    this.rainMaterial.uniforms.fogDensity.value = 0.1;
                    
                    // S'assurer que le shader utilise le brouillard linéaire
                    if (this.rainMaterial.defines?.USE_FOG_EXP2) {
                        delete this.rainMaterial.defines.USE_FOG_EXP2;
                        this.rainMaterial.needsUpdate = true;
                    }
                }
            }
        } catch (error) {
            console.warn("Erreur lors de la mise à jour du brouillard dans la pluie:", error);
        }
        
        // Système d'inertie amélioré pour le déplacement de la pluie
        if (this.camera) {
            // Obtenir la position actuelle de la caméra
            const cameraPosition = this.camera.position.clone();
            
            // Si c'est la première mise à jour, initialiser la dernière position
            if (!this.lastCameraPosition) {
                this.lastCameraPosition = cameraPosition.clone();
                this.rainObject.position.copy(cameraPosition);
                this.rainVelocity.set(0, 0, 0);
            } else {
                // Calculer le déplacement de la caméra depuis la dernière frame
                const displacement = cameraPosition.clone().sub(this.lastCameraPosition);
                
                // Appliquer un facteur de suivi différent pour le mouvement vertical
                // Cela permettra une meilleure réponse aux mouvements verticaux de caméra
                const adjustedDisplacement = new THREE.Vector3(
                    displacement.x * this.cameraFollowFactor,
                    displacement.y * this.verticalFollowFactor, // Facteur plus élevé pour les mouvements verticaux
                    displacement.z * this.cameraFollowFactor
                );
                
                // Calculer le mouvement souhaité de la pluie avec facteurs ajustés
                const targetPosition = this.rainObject.position.clone().add(adjustedDisplacement);
                
                // Calculer une vélocité cible vers cette position avec inertie
                const targetVelocity = targetPosition.clone().sub(this.rainObject.position);
                
                // Appliquer un facteur d'inertie pour lisser le mouvement
                // Réduire légèrement l'inertie pour les mouvements verticaux
                const yInertiaFactor = Math.min(this.inertiaFactor, 0.85);
                this.rainVelocity.x = this.rainVelocity.x * this.inertiaFactor + targetVelocity.x * (1 - this.inertiaFactor);
                this.rainVelocity.y = this.rainVelocity.y * yInertiaFactor + targetVelocity.y * (1 - yInertiaFactor);
                this.rainVelocity.z = this.rainVelocity.z * this.inertiaFactor + targetVelocity.z * (1 - this.inertiaFactor);
                
                // Force de "recentrage" pour ramener la pluie vers la caméra graduellement
                // Particulièrement importante pour éviter que la pluie ne s'éloigne trop verticalement
                const distanceToCamera = this.rainObject.position.distanceTo(cameraPosition);
                const recenterForce = cameraPosition.clone().sub(this.rainObject.position).normalize().multiplyScalar(
                    Math.max(0, distanceToCamera - this.rainArea * 0.25) * 0.01
                );
                this.rainVelocity.add(recenterForce);
                
                // Appliquer la vélocité à la position actuelle
                this.rainObject.position.add(this.rainVelocity);
                
                // Limiter la distance maximale à la caméra pour éviter que la pluie ne s'éloigne trop
                const maxDistance = this.rainArea * 0.5;
                
                if (distanceToCamera > maxDistance) {
                    const direction = this.rainObject.position.clone().sub(cameraPosition).normalize();
                    this.rainObject.position.copy(
                        cameraPosition.clone().add(direction.multiplyScalar(maxDistance))
                    );
                    
                    // Réinitialiser la vélocité pour éviter l'accumulation d'élan
                    this.rainVelocity.multiplyScalar(0.5);
                }
                
                // Garantir que la différence de hauteur entre la pluie et la caméra ne soit pas trop grande
                const heightDifference = Math.abs(this.rainObject.position.y - cameraPosition.y);
                const maxHeightDifference = this.rainHeight * 0.3;
                
                if (heightDifference > maxHeightDifference) {
                    if (this.rainObject.position.y > cameraPosition.y) {
                        this.rainObject.position.y = cameraPosition.y + maxHeightDifference;
                    } else {
                        this.rainObject.position.y = cameraPosition.y - maxHeightDifference;
                    }
                    // Réduire la vélocité verticale lorsqu'une limite est atteinte
                    this.rainVelocity.y *= 0.5;
                }
            }
            
            // Enregistrer la position actuelle de la caméra pour la prochaine frame
            this.lastCameraPosition.copy(cameraPosition);
            
            // Calculer la direction de vue de la caméra (pour le shader)
            const cameraDirection = new THREE.Vector3(0, 0, -1);
            cameraDirection.applyQuaternion(this.camera.quaternion);
            
            // Mettre à jour les uniforms pour la caméra
            this.rainMaterial.uniforms.cameraForward.value.copy(cameraDirection);
            
            // Garder la rotation à zéro pour que la pluie tombe toujours verticalement
            this.rainObject.rotation.set(0, 0, 0);
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
     * Crée une texture pour les gouttes de pluie
     * @returns {THREE.Texture}
     */
    createRainDropTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Créer une forme de goutte en forme de larme réaliste
        // Utiliser un dégradé vertical avec plus de détails
        const larmeGradient = context.createLinearGradient(64, 20, 64, 100);
        larmeGradient.addColorStop(0, 'rgba(230, 245, 255, 1.0)');
        larmeGradient.addColorStop(0.2, 'rgba(220, 240, 255, 0.95)');
        larmeGradient.addColorStop(0.5, 'rgba(210, 235, 255, 0.9)');
        larmeGradient.addColorStop(0.8, 'rgba(200, 230, 255, 0.6)');
        larmeGradient.addColorStop(1.0, 'rgba(190, 225, 255, 0.0)');
        
        // Dessiner la forme de goutte d'eau classique
        context.fillStyle = larmeGradient;
        context.beginPath();
        
        // Utiliser une forme de goutte avec une tête arrondie et une queue en pointe
        // Commencer par le haut de la goutte
        context.moveTo(64, 30);
        
        // Créer la forme de larme à l'aide de courbes de Bézier
        // Partie supérieure arrondie
        context.bezierCurveTo(
            74, 30, // point de contrôle 1
            82, 38, // point de contrôle 2
            82, 48  // point d'arrivée
        );
        
        // Partie intermédiaire
        context.bezierCurveTo(
            82, 65, // point de contrôle 1
            75, 80, // point de contrôle 2
            64, 95  // point d'arrivée (pointe)
        );
        
        // Partie inférieure (symétrique)
        context.bezierCurveTo(
            53, 80, // point de contrôle 1
            46, 65, // point de contrôle 2
            46, 48  // point d'arrivée
        );
        
        // Fermer la forme
        context.bezierCurveTo(
            46, 38, // point de contrôle 1
            54, 30, // point de contrôle 2
            64, 30  // point de départ/fin
        );
        
        context.fill();
        
        // Ajouter un effet de volume avec un dégradé radial
        const volumeGradient = context.createRadialGradient(58, 45, 5, 64, 55, 35);
        volumeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        volumeGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        volumeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = volumeGradient;
        context.fillRect(25, 25, 80, 70);
        
        // Ajouter un reflet brillant en haut à gauche (comme la lumière réfléchie)
        const refletGradient = context.createRadialGradient(55, 40, 0, 55, 40, 15);
        refletGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        refletGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        refletGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        
        context.globalCompositeOperation = 'lighter';
        context.fillStyle = refletGradient;
        context.beginPath();
        context.arc(55, 40, 15, 0, Math.PI * 2);
        context.fill();
        
        // Ajouter un petit reflet secondaire
        const refletSecondaire = context.createRadialGradient(72, 50, 0, 72, 50, 8);
        refletSecondaire.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        refletSecondaire.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        
        context.fillStyle = refletSecondaire;
        context.beginPath();
        context.arc(72, 50, 8, 0, Math.PI * 2);
        context.fill();
        
        // Créer la texture
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        return texture;
    }
}