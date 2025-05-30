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
        this._intensity = 0.08;             // Intensité (0-1), modifie la visibilité et la quantité (0.08 = 8%)
        this._leavesPercentage = 8;      // Pourcentage de feuilles visibles (0-100)
        this._speedFactor = 0.53;         // Facteur de vitesse des feuilles (0.1-2.0)
        this.leafCount = 100000;         // Nombre de feuilles augmenté pour un meilleur effet
        this.windSpeed = 12;             // Vitesse de base du vent (encore réduite pour moins de verticalité)
        this.worldBounds = 2000;         // Taille du monde où les feuilles peuvent apparaître
        this.worldBoundsHalf = this.worldBounds / 2;
        this.leafHeight = 30;           // Hauteur maximale des feuilles (légèrement réduite)
        this.leafMinHeight = 0;          // Hauteur minimale des feuilles (au sol)
        this.speedIntensityFactor = 0.4; // Facteur de proportionnalité entre l'intensité et la vitesse (encore réduit)
        this.minLeafSize = 0.9;          // Taille minimale des feuilles
        this.maxLeafSize = 1.8;          // Taille maximale des feuilles
        this.rotationFactor = 2.5;       // Facteur de rotation des feuilles
        this.leafOpacity = 1.0;          // Opacité des feuilles (1.0 = complètement opaque)
        this.verticalWindEffect = 0.08;  // Effet vertical du vent (encore plus réduit pour diminuer les mouvements verticaux)
        this.respawnInterval = 8000;     // Intervalle de réapparition des feuilles
        this.lastRespawnTime = 0;        // Temps de la dernière réapparition
        this.initialPositions = null;    // Pour stocker les positions initiales des feuilles
        
        // Paramètres d'animation pour le shader
        this.xMovementAmplitude = 4.5;   // Amplitude du mouvement horizontal X
        this.zMovementAmplitude = 4.0;   // Amplitude du mouvement horizontal Z
        this.spiralFactor = 0.8;         // Facteur de mouvement en spirale
        this.verticalSpeedFactor = 0.15; // Facteur de vitesse verticale
        this.yOffsetAmplitude = 1.0;     // Amplitude de l'ondulation verticale
        this.gustEffectAmplitude = 7.0;  // Amplitude de l'effet de rafale
        this.windStrengthFactor = 3.0;   // Facteur de force du vent
        
        // Facteur de vitesse initial (peut être modifié via setSpeedFactor)
        this._speedFactor = 1.0;
        
        // Vecteurs temporaires pour les calculs
        this._tempVector1 = new THREE.Vector3();
        this._tempVector2 = new THREE.Vector3();
        this._tempVector3 = new THREE.Vector3();
        this._tempVector4 = new THREE.Vector3();
        this.windVelocity = new THREE.Vector3();
        
        // Variables pour le suivi des modifications de hauteur
        this.lastLeafHeight = this.leafHeight;
        this.lastLeafMinHeight = this.leafMinHeight;
        
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
            
            // Calculer la vitesse effective du vent avec le facteur de vitesse
            const effectiveWindSpeed = this.windSpeed * Math.pow(this._speedFactor, 15);
            
            // Créer le matériau
            this.leavesMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    leavesTexture: { value: leafTexture },
                    time: { value: 0 },
                    intensity: { value: this._intensity },
                    windSpeed: { value: effectiveWindSpeed },
                    leaveHeight: { value: this.leafHeight },
                    leafMinHeight: { value: this.leafMinHeight },
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
                    dayFactor: { value: dayFactor },
                    // Paramètres d'animation
                    xMovementAmplitude: { value: this.xMovementAmplitude },
                    zMovementAmplitude: { value: this.zMovementAmplitude },
                    spiralFactor: { value: this.spiralFactor },
                    verticalSpeedFactor: { value: this.verticalSpeedFactor },
                    yOffsetAmplitude: { value: this.yOffsetAmplitude },
                    gustEffectAmplitude: { value: this.gustEffectAmplitude },
                    windStrengthFactor: { value: this.windStrengthFactor }
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
            
            // Forcer la mise à jour initiale des valeurs dans le shader et la géométrie
            this.forceUpdateInitialValues();
            
            // Forcer la réinitialisation des positions des feuilles
            this.resetLeavesPositions();
            
        } catch (error) {
            console.error("Erreur lors de l'initialisation de l'effet de feuilles:", error);
        }
    }
    
    /**
     * Force la mise à jour des valeurs initiales dans le shader et la géométrie
     * Cette méthode est appelée après l'initialisation pour s'assurer
     * que les valeurs par défaut sont correctement appliquées
     */
    forceUpdateInitialValues() {
        if (!this.leavesMaterial || !this.leavesObject) return;
        
        // Forcer la mise à jour du pourcentage de feuilles visible
        const visibleLeafCount = Math.floor(this.leafCount * (this._leavesPercentage / 100));
        console.log(`Mise à jour forcée: ${this._leavesPercentage}% de feuilles visibles (${visibleLeafCount} sur ${this.leafCount})`);
        
        // Forcer la mise à jour des uniforms du shader
        this.leavesMaterial.uniforms.intensity.value = this._intensity;
        
        // Forcer la mise à jour de la vitesse dans le shader
        const effectiveWindSpeed = this.windSpeed * Math.pow(this._speedFactor, 15);
        this.leavesMaterial.uniforms.windSpeed.value = effectiveWindSpeed;
        
        // CRITIQUE: Forcer la mise à jour du shader lui-même pour qu'il prenne en compte les nouvelles valeurs
        // Cela est particulièrement important pour la vitesse qui peut ne pas être immédiatement appliquée
        this.leavesMaterial.needsUpdate = true;
        
        console.log(`Mise à jour forcée: facteur de vitesse=${this._speedFactor}, vitesse effective=${effectiveWindSpeed}`);
        
        // Mettre à jour la visibilité de l'objet feuilles
        this.leavesObject.visible = this._leavesPercentage > 0.01;
        
        // Mettre à jour les positions et attributs des feuilles visibles
        if (this.leavesObject.geometry) {
            const positions = this.leavesObject.geometry.attributes.position;
            const sizes = this.leavesObject.geometry.attributes.size;
            const velocities = this.leavesObject.geometry.attributes.velocity;
            const angles = this.leavesObject.geometry.attributes.angle;
            const rotations = this.leavesObject.geometry.attributes.rotation;
            
            for (let i = 0; i < this.leafCount; i++) {
                const idx = i * 3;
                
                // Mise à jour de la visibilité des feuilles
                if (i < visibleLeafCount) {
                    // Si la feuille était cachée (position Y très négative), la repositionner
                    if (positions.array[idx + 1] < -1000.0) {
                        // Distribution de hauteur non uniforme, favorisant les hauteurs plus basses
                        const heightDistribution = Math.pow(Math.random(), 3.0);
                        positions.array[idx + 1] = this.leafMinHeight + heightDistribution * (this.leafHeight - this.leafMinHeight);
                    }
                    
                    // Assurer une taille visible
                    if (sizes.array[i] === 0) {
                        sizes.array[i] = this.minLeafSize + Math.pow(Math.random(), 0.8) * (this.maxLeafSize - this.minLeafSize);
                    }
                    
                    // NOUVEAU: Ajuster les vélocités pour refléter la vitesse actuelle
                    velocities.array[i] = 0.7 + Math.pow(Math.random(), 0.9) * 0.6 * this._speedFactor;
                    
                    // Ajuster les angles et rotations pour une meilleure distribution
                    angles.array[i] = Math.random() * Math.PI * 2;
                    rotations.array[i] = Math.random() * Math.PI * 2;
                } else {
                    // Cacher les feuilles qui ne devraient pas être visibles
                    positions.array[idx + 1] = -10000; // Cacher sous le terrain
                    sizes.array[i] = 0;
                }
            }
            
            // Indiquer que tous les attributs ont été modifiés
            positions.needsUpdate = true;
            sizes.needsUpdate = true;
            velocities.needsUpdate = true;
            angles.needsUpdate = true;
            rotations.needsUpdate = true;
        }
        
        // Forcer une mise à jour immédiate pour appliquer les changements
        if (this.weatherSystem && this.weatherSystem.time) {
            this.update(16); // Simuler une frame à ~60fps
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
        
        // Fonction pour calculer approximativement la largeur de la feuille à une hauteur donnée
        const getLeafWidthAtHeight = (height) => {
            // Calculer la distance relative par rapport au centre de la feuille (0 = centre, 1 = extrémité)
            const normalizedHeight = Math.abs((height - (size/2)) / (size/2 - 10));
            
            // Forme parabolique: plus étroit aux extrémités, plus large au milieu
            // La largeur maximale est environ 40% de la taille de la feuille au milieu
            const maxWidthRatio = 0.4;
            
            // Calculer la largeur avec une courbe parabolique (1-x²)
            return (size * maxWidthRatio) * (1 - normalizedHeight * normalizedHeight * 0.9);
        };
        
        // Dessiner seulement 3 nervures secondaires au lieu de 4, et éviter les extrémités
        for (let i = 1; i <= 3; i++) {
            // Répartir les nervures de manière plus centrée, en évitant les extrémités
            const y = size/4 + i * (size/2) / 4;
            
            // Obtenir la largeur approximative de la feuille à cette hauteur
            const halfWidth = getLeafWidthAtHeight(y) / 2;
            
            // Calculer la longueur des nervures (plus courtes que la largeur totale)
            const nervureLength = halfWidth * 0.85; // 85% de la demi-largeur
            
            // Angle des nervures (plus horizontal près des extrémités)
            const angleOffset = Math.min(15, 5 + 10 * Math.abs(y - size/2) / (size/2));
            
            // Nervure gauche
            context.beginPath();
            context.moveTo(size/2, y);
            // Calcul du point final avec une inclinaison qui dépend de la position
            const leftEndX = size/2 - nervureLength;
            const leftEndY = y + Math.sin(angleOffset * Math.PI / 180) * nervureLength * 0.4;
            context.lineTo(leftEndX, leftEndY);
            context.stroke();
            
            // Nervure droite
            context.beginPath();
            context.moveTo(size/2, y);
            // Calcul du point final avec une inclinaison qui dépend de la position
            const rightEndX = size/2 + nervureLength;
            const rightEndY = y + Math.sin(angleOffset * Math.PI / 180) * nervureLength * 0.4;
            context.lineTo(rightEndX, rightEndY);
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
        
        // Calculer le nombre de feuilles visibles en fonction du pourcentage
        const visibleLeafCount = Math.floor(this.leafCount * (this._leavesPercentage / 100));
        
        // Distribuer toutes les feuilles dans l'espace
        const positions = new Float32Array(this.leafCount * 3);
        const sizes = new Float32Array(this.leafCount);
        const velocities = new Float32Array(this.leafCount);
        const angles = new Float32Array(this.leafCount);
        const offsets = new Float32Array(this.leafCount);
        const rotations = new Float32Array(this.leafCount);
        
        const simplex = new SimplexNoise();
        
        for (let i = 0; i < this.leafCount; i++) {
            // Répartir les feuilles dans tout le monde avec une distribution plus naturelle
            const angle = Math.random() * Math.PI * 2;
            const radiusFactor = Math.pow(Math.random(), 0.7);
            const radius = this.worldBoundsHalf * radiusFactor;
            
            const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 200;
            const z = Math.sin(angle) * radius + (Math.random() - 0.5) * 200;
            
            // Position x, z dans le monde avec distribution améliorée
            positions[i * 3] = x;
            
            // Distribution de hauteur non uniforme pour plus de réalisme
            // Commencer à la hauteur minimale avec une forte préférence pour les positions basses
            const heightDistribution = Math.pow(Math.random(), 3.0); // Puissance 3 = concentration près du sol
            const y = this.leafMinHeight + heightDistribution * (this.leafHeight - this.leafMinHeight);
            
            // Positionner les feuilles visibles à leur hauteur réelle, cacher les autres
            if (i < visibleLeafCount) {
                positions[i * 3 + 1] = y; // Position réelle
            } else {
                positions[i * 3 + 1] = -10000; // Cacher sous le terrain
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
        
        // Stocker les positions initiales pour pouvoir les réutiliser
        this.initialPositions = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i += 3) {
            this.initialPositions[i] = positions[i]; // x
            this.initialPositions[i + 1] = this.leafMinHeight + Math.pow(Math.random(), 1.5) * this.leafHeight; // y réel (pas caché)
            this.initialPositions[i + 2] = positions[i + 2]; // z
        }
        
        // Créer le maillage de feuilles
        this.leavesObject = new THREE.Points(geometry, this.leavesMaterial);
        this.leavesObject.frustumCulled = false; // Désactiver le culling pour s'assurer que les feuilles sont toujours visibles
        this.leavesObject.visible = this._leavesPercentage > 0.01; // Visibilité basée sur le pourcentage actuel
        this.leavesObject.renderOrder = 10; // Priorité de rendu élevée pour s'assurer que les feuilles sont rendues correctement
        
        // Afficher les informations de débogage
        console.log(`Feuilles créées: ${this._leavesPercentage}% visibles (${visibleLeafCount} sur ${this.leafCount})`);
        console.log(`Facteur de vitesse: ${this._speedFactor}, vitesse effective: ${this.windSpeed * Math.pow(this._speedFactor, 15)}`);
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
        
        // Nombre de feuilles à afficher en fonction du pourcentage
        const visibleLeafCount = Math.floor(this.leafCount * (this._leavesPercentage / 100));
        
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
                positions.array[idx + 1] = this.leafMinHeight + heightVariation * (this.leafHeight - this.leafMinHeight);
                
                positions.array[idx + 2] = z;
                
                // Réinitialiser la rotation et la vitesse avec des variations naturelles
                rotations.array[i] = Math.random() * Math.PI * 2;
                velocities.array[i] = 0.7 + Math.pow(Math.random(), 0.9) * 0.6;
                
                // Nouvel angle de direction aléatoire
                angles.array[i] = Math.random() * Math.PI * 2;
                
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
        
        this.leavesObject.visible = this._leavesPercentage > 0.01;
        
        if (this._leavesPercentage <= 0.01) return;
        
        // Mettre à jour la variable de temps pour les deux shaders (vertex et fragment)
        this.leavesMaterial.uniforms.time.value += deltaTime / 1000;
        this.leavesMaterial.uniforms.intensity.value = this._intensity;
        
        // Mettre à jour la vitesse du vent dans le shader
        const scaledSpeed = this.windSpeed * Math.pow(this._speedFactor, 15);
        this.leavesMaterial.uniforms.windSpeed.value = scaledSpeed;
        
        // Log pour vérifier les valeurs (à enlever après débogage)
        //console.log(`Speed update: factor=${this._speedFactor}, speed=${scaledSpeed}`);
        
        // Mettre à jour les valeurs de hauteur
        this.leavesMaterial.uniforms.leaveHeight.value = this.leafHeight;
        this.leavesMaterial.uniforms.leafMinHeight.value = this.leafMinHeight;
        
        // Vérifier si nous devons réinitialiser les positions (si les valeurs ont changé)
        if (!this.lastLeafHeight) this.lastLeafHeight = this.leafHeight;
        if (!this.lastLeafMinHeight) this.lastLeafMinHeight = this.leafMinHeight;
        
        if (this.leafHeight !== this.lastLeafHeight || this.leafMinHeight !== this.lastLeafMinHeight) {
            this.lastLeafHeight = this.leafHeight;
            this.lastLeafMinHeight = this.leafMinHeight;
            this.resetLeavesPositions();
        }
        
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
     * Réinitialise la position des feuilles en fonction des hauteurs définies
     */
    resetLeavesPositions() {
        if (!this.leavesObject) return;
        
        const positions = this.leavesObject.geometry.attributes.position;
        
        // Nombre de feuilles à afficher en fonction du pourcentage
        const visibleLeafCount = Math.floor(this.leafCount * (this._leavesPercentage / 100));
        
        for (let i = 0; i < visibleLeafCount; i++) {
            const idx = i * 3;
            
            // Repositionner les feuilles principalement près du sol
            // Favoriser fortement les positions basses
            const heightFactor = Math.pow(Math.random(), 3.0); // Exposant plus élevé = plus de feuilles près du sol
            positions.array[idx + 1] = this.leafMinHeight + heightFactor * (this.leafHeight - this.leafMinHeight);
        }
        
        // Marquer l'attribut comme nécessitant une mise à jour
        positions.needsUpdate = true;
        
        console.log(`Feuilles réinitialisées avec hauteur min: ${this.leafMinHeight}, max: ${this.leafHeight}`);
    }
    
    /**
     * Définit le pourcentage de feuilles visibles
     * @param {number} percentage - Pourcentage de feuilles (0-100)
     */
    setLeavesPercentage(percentage) {
        const clampedPercentage = THREE.MathUtils.clamp(percentage, 0, 100);
        
        // Si aucun changement, sortir
        if (this._leavesPercentage === clampedPercentage) return;
        
        const oldPercentage = this._leavesPercentage;
        this._leavesPercentage = clampedPercentage;
        
        // Mettre à jour l'intensité pour le shader
        this._intensity = clampedPercentage / 100;
        
        if (this.leavesMaterial) {
            this.leavesMaterial.uniforms.intensity.value = this._intensity;
        }
        
        // Mettre à jour la visibilité des feuilles
        if (this.leavesObject && this.leavesObject.geometry) {
            this.leavesObject.visible = this._leavesPercentage > 0.01;
            
            // Calculer le nombre de feuilles visibles
            const visibleLeafCount = Math.floor(this.leafCount * (clampedPercentage / 100));
            
            // Obtenir l'attribut de taille
            const sizes = this.leavesObject.geometry.attributes.size;
            const originalSizes = this.leavesObject.geometry.attributes.size.array.slice();
            
            // Mettre à jour les tailles (0 = invisible, >0 = visible)
            for (let i = 0; i < this.leafCount; i++) {
                if (i < visibleLeafCount) {
                    // Si l'oiseau doit être visible, on utilise sa taille normale
                    if (sizes.array[i] === 0) {
                        // Si la feuille était cachée, lui donner une taille aléatoire
                        sizes.array[i] = this.minLeafSize + Math.pow(Math.random(), 0.8) * (this.maxLeafSize - this.minLeafSize);
                    }
                } else {
                    // Si l'oiseau doit être caché, on met sa taille à 0
                    sizes.array[i] = 0;
                }
            }
            
            // Marquer l'attribut comme nécessitant une mise à jour
            sizes.needsUpdate = true;
            
            // Si on a augmenté le pourcentage, réinitialiser certaines feuilles qui étaient cachées
            if (clampedPercentage > oldPercentage) {
                const oldVisibleCount = Math.floor(this.leafCount * (oldPercentage / 100));
                
                // Mettre à jour les positions des nouvelles feuilles visibles pour qu'elles
                // apparaissent à des positions aléatoires et pas toutes au même endroit
                const positions = this.leavesObject.geometry.attributes.position;
                
                for (let i = oldVisibleCount; i < visibleLeafCount; i++) {
                    const idx = i * 3;
                    
                    // Repositionner à un endroit aléatoire du ciel
                    const angle = Math.random() * Math.PI * 2;
                    const radiusFactor = Math.pow(Math.random(), 0.7);
                    const radius = this.worldBoundsHalf * radiusFactor;
                    
                    positions.array[idx] = Math.cos(angle) * radius + (Math.random() - 0.5) * 200;
                    
                    // Favoriser les positions près du sol
                    const heightFactor = Math.pow(Math.random(), 3.0);
                    positions.array[idx + 1] = this.leafMinHeight + heightFactor * (this.leafHeight - this.leafMinHeight);
                    
                    positions.array[idx + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 200;
                    
                    // Réinitialiser les autres attributs pour ces feuilles
                    const rotations = this.leavesObject.geometry.attributes.rotation;
                    const velocities = this.leavesObject.geometry.attributes.velocity;
                    const angles = this.leavesObject.geometry.attributes.angle;
                    
                    rotations.array[i] = Math.random() * Math.PI * 2;
                    velocities.array[i] = 0.7 + Math.pow(Math.random(), 0.9) * 0.6;
                    angles.array[i] = Math.random() * Math.PI * 2;
                }
                
                // Marquer les attributs comme nécessitant une mise à jour
                positions.needsUpdate = true;
                this.leavesObject.geometry.attributes.rotation.needsUpdate = true;
                this.leavesObject.geometry.attributes.velocity.needsUpdate = true;
                this.leavesObject.geometry.attributes.angle.needsUpdate = true;
            }
        }
        
        // Forcer une mise à jour immédiate du rendu pour appliquer les changements
        if (this.weatherSystem && this.weatherSystem.time) {
            // Simuler une mise à jour avec un deltaTime typique
            this.update(16); // 16ms ≈ 60fps
        }
        
        console.log(`Pourcentage de feuilles mis à jour: ${this._leavesPercentage}%, intensité: ${this._intensity}`);
    }
    
    /**
     * Définit le facteur de vitesse des feuilles
     * @param {number} factor - Facteur de vitesse (0.1-4.0)
     */
    setSpeedFactor(factor) {
        // Étendre la plage de vitesse de 0.1 à 4.0 (au lieu de 0.1-2.0)
        const clampedFactor = THREE.MathUtils.clamp(factor, 0.1, 4.0);
        
        // Si aucun changement, sortir
        if (this._speedFactor === clampedFactor) return;
        
        this._speedFactor = clampedFactor;
        
        // Mettre à jour la vitesse du vent dans le shader
        if (this.leavesMaterial && this.leavesMaterial.uniforms.windSpeed) {
            // Utiliser une fonction exponentielle pour accentuer les différences
            // Cela donne un effet plus prononcé aux valeurs extrêmes
            const scaledSpeed = this.windSpeed * Math.pow(this._speedFactor, 15);
            this.leavesMaterial.uniforms.windSpeed.value = scaledSpeed;
            
            // IMPORTANT: Indiquer au shader qu'il doit se recompiler
            this.leavesMaterial.needsUpdate = true;
            
            console.log(`Facteur de vitesse des feuilles mis à jour: ${this._speedFactor}, vitesse réelle: ${scaledSpeed}`);
        }
        
        // Utiliser la méthode forceUpdateInitialValues pour garantir une mise à jour complète
        this.forceUpdateInitialValues();
    }
    
    /**
     * Définit l'intensité de l'effet de feuilles (pour compatibilité)
     * @param {number} value - Intensité (0-1)
     */
    set intensity(value) {
        // Convertir l'intensité (0-1) en pourcentage (0-100)
        this.setLeavesPercentage(value * 100);
    }
    
    /**
     * Obtient l'intensité actuelle de l'effet de feuilles (pour compatibilité)
     * @returns {number} - Intensité (0-1)
     */
    get intensity() {
        return this._intensity;
    }
    
    /**
     * Définit la hauteur maximale des feuilles
     * @param {number} height - Hauteur maximale des feuilles
     */
    setLeafHeight(height) {
        if (height === this.leafHeight) return;
        this.leafHeight = height;
        
        // Mettre à jour la hauteur dans le shader
        if (this.leavesMaterial && this.leavesMaterial.uniforms.leaveHeight) {
            this.leavesMaterial.uniforms.leaveHeight.value = height;
            this.resetLeavesPositions();
        }
    }
    
    /**
     * Définit la hauteur minimale des feuilles
     * @param {number} height - Hauteur minimale des feuilles
     */
    setLeafMinHeight(height) {
        if (height === this.leafMinHeight) return;
        this.leafMinHeight = height;
        
        // Mettre à jour la hauteur minimale dans le shader
        if (this.leavesMaterial && this.leavesMaterial.uniforms.leafMinHeight) {
            this.leavesMaterial.uniforms.leafMinHeight.value = height;
            this.resetLeavesPositions();
        }
    }
} 