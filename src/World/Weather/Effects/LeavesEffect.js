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
        this.leafCount = 100000;         // Nombre de feuilles augmenté pour un meilleur effet
        this.windSpeed = 12;             // Vitesse de base du vent (encore réduite pour moins de verticalité)
        this.worldBounds = 2000;         // Taille du monde où les feuilles peuvent apparaître
        this.worldBoundsHalf = this.worldBounds / 2;
        this.leafHeight = 180;           // Hauteur maximale des feuilles (légèrement réduite)
        this.leafMinHeight = 0;          // Hauteur minimale des feuilles (au sol)
        this.speedIntensityFactor = 0.4; // Facteur de proportionnalité entre l'intensité et la vitesse (encore réduit)
        this.minLeafSize = 0.9;          // Taille minimale des feuilles
        this.maxLeafSize = 1.8;          // Taille maximale des feuilles
        this.rotationFactor = 2.5;       // Facteur de rotation des feuilles
        this.leafOpacity = 1.0;          // Opacité des feuilles (1.0 = complètement opaque)
        this.verticalWindEffect = 0.12;  // Effet vertical du vent (fortement réduit pour favoriser le mouvement horizontal)
        this.respawnInterval = 8000;     // Intervalle de réapparition des feuilles
        this.lastRespawnTime = 0;        // Temps de la dernière réapparition
        
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
                depthWrite: true,       // Activer l'écriture de profondeur pour les parties opaques
                depthTest: true,
                alphaTest: 0.5,         // Utiliser un test alpha pour déterminer ce qui est opaque
                side: THREE.DoubleSide  // Rendre les deux côtés des feuilles
            });
            
            // Générer la géométrie des feuilles
            this.createLeaves();
            
            // Ajouter à la scène seulement si l'objet existe
            if (this.leavesObject) {
                this.scene.add(this.leavesObject);
            } else {
                console.error("Impossible d'ajouter les feuilles à la scène: this.leavesObject est undefined");
            }
            
            // Mise à jour des vecteurs pour le mouvement
            this.updateVectors();
            
        } catch (error) {
            console.error("Erreur lors de l'initialisation de l'effet de feuilles:", error);
        }
    }
    
    /**
     * Crée une texture améliorée pour les feuilles
     * @returns {THREE.Texture} - Texture de feuille
     */
    createLeafTexture() {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        
        const context = canvas.getContext('2d');
        
        // Fond complètement transparent
        context.clearRect(0, 0, size, size);
        
        // Types de feuilles avec différentes couleurs
        const leafColors = [
            'rgba(139, 69, 19, 1.0)', // Marron - opacité à 1.0
            'rgba(205, 133, 63, 1.0)', // Peru - opacité à 1.0
            'rgba(160, 82, 45, 1.0)', // Sienna - opacité à 1.0
            'rgba(210, 105, 30, 1.0)', // Chocolat - opacité à 1.0
            'rgba(165, 42, 42, 1.0)', // Marron foncé - opacité à 1.0
            'rgba(233, 116, 81, 1.0)', // Corail clair - opacité à 1.0
            'rgba(250, 128, 114, 1.0)', // Saumon - opacité à 1.0
            'rgba(255, 160, 122, 1.0)', // Saumon clair - opacité à 1.0
            'rgba(255, 127, 80, 1.0)', // Corail - opacité à 1.0
            'rgba(255, 69, 0, 1.0)' // Orange rouge - opacité à 1.0
        ];
        
        // Choisir une couleur aléatoire
        context.fillStyle = leafColors[Math.floor(Math.random() * leafColors.length)];
        
        // Dessiner une forme de feuille avec des contours plus nets
        context.beginPath();
        context.moveTo(size/2, 10);
        context.bezierCurveTo(size/4, size/3, 10, size/2, size/2, size-10);
        context.bezierCurveTo(size-10, size/2, size*3/4, size/3, size/2, 10);
        context.fill();
        
        // Dessiner la nervure centrale avec un trait plus épais
        context.strokeStyle = 'rgba(100, 50, 0, 1.0)'; // Opacité à 1.0
        context.lineWidth = 2; // Trait plus épais
        context.beginPath();
        context.moveTo(size/2, 10);
        context.lineTo(size/2, size-10);
        context.stroke();
        
        // Quelques nervures secondaires plus prononcées
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
        
        // Ajouter un léger contour à la feuille pour un meilleur rendu
        context.strokeStyle = 'rgba(80, 40, 0, 1.0)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(size/2, 10);
        context.bezierCurveTo(size/4, size/3, 10, size/2, size/2, size-10);
        context.bezierCurveTo(size-10, size/2, size*3/4, size/3, size/2, 10);
        context.stroke();
        
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
        
        // Nombre de feuilles à afficher en fonction de l'intensité actuelle
        const visibleLeafCount = Math.floor(this.leafCount * this._intensity);
        
        for (let i = 0; i < this.leafCount; i++) {
            // Répartir les feuilles dans tout le monde avec une distribution plus naturelle
            // Utiliser une distribution qui favorise légèrement les bords du monde
            // pour éviter une concentration excessive au centre
            const angle = Math.random() * Math.PI * 2;
            const radiusFactor = Math.pow(Math.random(), 0.7); // Distribution non linéaire
            const radius = this.worldBoundsHalf * radiusFactor;
            
            const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 200; // Ajouter une petite variation
            const z = Math.sin(angle) * radius + (Math.random() - 0.5) * 200;
            
            // Position x, z dans le monde avec distribution améliorée
            positions[i * 3] = x;
            
            // Si l'indice est supérieur au nombre de feuilles visibles, cacher la feuille
            if (i >= visibleLeafCount) {
                positions[i * 3 + 1] = -10000; // Cacher sous le terrain
            } else {
                // Distribution de hauteur non uniforme pour plus de réalisme
                // Favoriser les hauteurs plus basses pour simuler des feuilles qui volent près du sol
                const heightDistribution = Math.pow(Math.random(), 1.5);
                positions[i * 3 + 1] = this.leafMinHeight + heightDistribution * this.leafHeight;
            }
            
            positions[i * 3 + 2] = z;
            
            // Taille aléatoire avec distribution plus variée
            sizes[i] = this.minLeafSize + Math.pow(Math.random(), 0.8) * (this.maxLeafSize - this.minLeafSize);
            
            // Vitesse aléatoire avec distribution naturelle
            velocities[i] = 0.7 + Math.pow(Math.random(), 0.9) * 0.6;
            
            // Angle aléatoire pour la direction du mouvement
            angles[i] = Math.random() * Math.PI * 2;
            
            // Décalage aléatoire pour différencier le mouvement
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
        this.leavesObject.renderOrder = 10; // Priorité de rendu élevée pour s'assurer que les feuilles sont rendues correctement
    }
    
    /**
     * Respawn les feuilles qui sont sorties des limites définies
     */
    respawnLeaves() {
        if (!this.leavesObject) return;
        
        const positions = this.leavesObject.geometry.attributes.position;
        const rotations = this.leavesObject.geometry.attributes.rotation;
        const velocities = this.leavesObject.geometry.attributes.velocity;
        const angles = this.leavesObject.geometry.attributes.angle;
        
        // Nombre de feuilles à afficher en fonction de l'intensité actuelle
        const visibleLeafCount = Math.floor(this.leafCount * this._intensity);
        
        // Hauteur du sol (pour vérifier si les feuilles sont tombées au sol)
        const groundHeight = this.leafMinHeight;
        
        // Hauteur à laquelle les feuilles réapparaissent
        const respawnHeight = this.leafHeight;
        
        let needsUpdate = false;
        
        for (let i = 0; i < visibleLeafCount; i++) {
            const idx = i * 3;
            
            // Si la feuille est sous le sol ou a dépassé les limites du monde
            if (positions.array[idx + 1] <= groundHeight ||
                Math.abs(positions.array[idx]) > this.worldBoundsHalf ||
                Math.abs(positions.array[idx + 2]) > this.worldBoundsHalf) {
                
                // Repositionner la feuille avec une distribution naturelle améliorée
                // Placement similaire à la méthode createLeaves
                const angle = Math.random() * Math.PI * 2;
                const radiusFactor = Math.pow(Math.random(), 0.7);
                const radius = this.worldBoundsHalf * radiusFactor;
                
                const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 200;
                const z = Math.sin(angle) * radius + (Math.random() - 0.5) * 200;
                
                positions.array[idx] = x;
                
                // Distribution de hauteur non uniforme, favorisant les hauteurs supérieures
                // pour simuler des feuilles qui commencent à tomber
                const heightVariation = Math.pow(Math.random(), 0.7);
                positions.array[idx + 1] = respawnHeight - heightVariation * (respawnHeight * 0.3);
                
                positions.array[idx + 2] = z;
                
                // Réinitialiser la rotation et la vitesse avec des variations naturelles
                rotations.array[i] = Math.random() * Math.PI * 2;
                velocities.array[i] = 0.7 + Math.pow(Math.random(), 0.9) * 0.6;
                
                // Nouvel angle de direction aléatoire
                angles.array[i] = Math.random() * Math.PI * 2;
                
                needsUpdate = true;
            }
        }
        
        // Gérer les feuilles cachées (non visibles)
        for (let i = visibleLeafCount; i < this.leafCount; i++) {
            if (positions.array[i * 3 + 1] > -10000) {
                positions.array[i * 3 + 1] = -10000; // Cacher sous le terrain
                needsUpdate = true;
            }
        }
        
        // Mettre à jour les attributs seulement si nécessaire
        if (needsUpdate) {
            positions.needsUpdate = true;
            rotations.needsUpdate = true;
            velocities.needsUpdate = true;
            angles.needsUpdate = true;
        }
        
        this.lastRespawnTime = this.weatherSystem.time.elapsed;
    }
    
    /**
     * Met à jour les vecteurs pour le mouvement des feuilles
     */
    updateVectors() {
        if (!this.camera) return;
        
        // Obtenir la direction de la caméra
        this._tempVector1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        
        // Accentuer la composante horizontale et réduire la composante verticale
        // pour favoriser un mouvement plus latéral que vertical
        this._tempVector1.y *= this.verticalWindEffect; // Réduire fortement la composante verticale
        
        // Amplifier légèrement les composantes horizontales
        this._tempVector1.x *= 1.5;
        this._tempVector1.z *= 1.5;
        
        // Normaliser le vecteur pour maintenir une force constante
        this._tempVector1.normalize();
        
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
        
        // Mettre à jour la variable de temps pour les deux shaders (vertex et fragment)
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
        
        // Mettre à jour le vecteur direction du vent
        // En favorisant les mouvements horizontaux
        if (this.camera) {
            // Obtenir la direction mais réduire l'effet vertical pour un mouvement plus horizontal
            this._tempVector1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this._tempVector1.y *= this.verticalWindEffect; // Réduire fortement la composante verticale
            
            // Amplifier les composantes horizontales
            this._tempVector1.x *= 1.5;
            this._tempVector1.z *= 1.5;
            
            // Normaliser le vecteur
            this._tempVector1.normalize();
            
            // Appliquer au shader
            this.leavesMaterial.uniforms.cameraForward.value.copy(this._tempVector1);
        }
        
        // Vérifier périodiquement si des feuilles doivent réapparaître
        const currentTime = this.weatherSystem.time.elapsed;
        if (currentTime - this.lastRespawnTime > this.respawnInterval) {
            this.respawnLeaves();
        }
        
        // Mise à jour des uniforms de brouillard
        try {
            if (this.scene.fog) {
                // Mise à jour directe de la couleur du brouillard
                this.leavesMaterial.uniforms.fogColor.value.copy(this.scene.fog.color);
                
                // Gestion des différents types de brouillard
                if (this.scene.fog.isFogExp2) {
                    // Utiliser la même densité que le brouillard de la scène
                    this.leavesMaterial.uniforms.fogDensity.value = this.scene.fog.density;
                    this.leavesMaterial.uniforms.fogNear.value = 5;
                    this.leavesMaterial.uniforms.fogFar.value = 15;
                    
                    if (!this.leavesMaterial.defines?.USE_FOG_EXP2) {
                        this.leavesMaterial.defines = { USE_FOG_EXP2: '' };
                        this.leavesMaterial.needsUpdate = true;
                    }
                } else {
                    // Pour le brouillard linéaire, synchroniser les paramètres
                    this.leavesMaterial.uniforms.fogNear.value = this.scene.fog.near;
                    this.leavesMaterial.uniforms.fogFar.value = this.scene.fog.far;
                    
                    // Convertir le brouillard linéaire en densité pour notre shader
                    // Plus le far est petit, plus la densité est élevée
                    const normalizedDensity = 1.0 - (this.scene.fog.far / 1000); // Normaliser far (0-1)
                    this.leavesMaterial.uniforms.fogDensity.value = normalizedDensity * 0.05;
                    
                    if (this.leavesMaterial.defines?.USE_FOG_EXP2) {
                        delete this.leavesMaterial.defines.USE_FOG_EXP2;
                        this.leavesMaterial.needsUpdate = true;
                    }
                }
                
                // Accéder au FogEffect si disponible pour obtenir la densité normalisée
                if (this.weatherSystem && this.weatherSystem.fogEffect) {
                    // La densité dans FogEffect est normalisée (0-1)
                    const normalizedDensity = this.weatherSystem.fogEffect.fogDensity;
                    
                    // Amplifier l'effet du brouillard sur les feuilles pour une meilleure correspondance visuelle
                    // Cela rend les feuilles plus sensibles aux changements de brouillard
                    const amplifiedFactor = Math.pow(normalizedDensity, 0.8) * 1.5;
                    
                    // Appliquer un facteur de pondération plus fort pour les feuilles lointaines
                    if (this.leavesMaterial.uniforms.fogDensity) {
                        // Accentuer la densité tout en préservant la valeur de base
                        this.leavesMaterial.uniforms.fogDensity.value *= (1.0 + amplifiedFactor);
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
            
            // Ajuster le nombre de feuilles visibles en fonction de l'intensité
            if (this.leavesObject.geometry) {
                const positions = this.leavesObject.geometry.attributes.position;
                
                // Nombre de feuilles à afficher en fonction de l'intensité
                const visibleLeafCount = Math.floor(this.leafCount * this._intensity);
                
                for (let i = 0; i < this.leafCount; i++) {
                    // Si l'indice est supérieur au nombre de feuilles visibles, cacher la feuille
                    // en la déplaçant très loin sous le terrain
                    if (i >= visibleLeafCount) {
                        positions.array[i * 3 + 1] = -10000; // Déplacer loin sous le terrain
                    } else if (positions.array[i * 3 + 1] === -10000) {
                        // Si la feuille était cachée et doit maintenant être visible,
                        // réinitialiser sa position Y à une valeur aléatoire dans la plage de hauteur
                        positions.array[i * 3 + 1] = this.leafMinHeight + Math.random() * this.leafHeight;
                        
                        // Repositionner aléatoirement en X et Z pour une meilleure distribution
                        positions.array[i * 3] = Math.random() * this.worldBounds - this.worldBoundsHalf;
                        positions.array[i * 3 + 2] = Math.random() * this.worldBounds - this.worldBoundsHalf;
                    }
                }
                
                // Marquer les attributs comme nécessitant une mise à jour
                positions.needsUpdate = true;
            }
        }
        
        if (this.leavesMaterial) {
            this.leavesMaterial.uniforms.intensity.value = this._intensity;
        }
        
        // Respawn immédiatement si l'intensité a augmenté
        if (this._intensity > oldIntensity) {
            this.respawnLeaves();
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