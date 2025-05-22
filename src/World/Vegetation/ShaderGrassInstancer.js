import * as THREE from 'three';
import ShaderLoader from '../../Utils/ShaderLoader.js';

export default class ShaderGrassInstancer {
    constructor(config, experience) {
        this.config = config;
        this.experience = experience;
        this.scene = experience.scene;
        this.instanceNumber = config.grassInstanceCount;
        this.dummy = new THREE.Object3D();
        this.clock = new THREE.Clock();
        this.instancedMeshes = [];
        this.camera = null;
        
        // Paramètres de la végétation
        this.grassColor = new THREE.Color(0x485e3c); // Même couleur que dans l'ancien GrassInstancer
        
        // Paramètres d'animation simplifiés
        this.animationEnabled = false; // Animation désactivée par défaut
        this.animationSpeed = 1.0;    // Vitesse normale de l'animation
        this.torsionAmplitude = 1.0;  // Amplitude normale de torsion/plis
        this.inclinationAmplitude = 1.0; // Amplitude normale d'inclinaison
        
        // Paramètres hérités (pour compatibilité)
        this.windStrength = config.grassWindStrength || 0.0; // Force du vent initialisée à 0 par défaut
        this.windDirection = new THREE.Vector2(1.0, 0.0).normalize(); // Vent par défaut vers l'est
        this.bendStrength = 0.0; // 0 = vertical, 1.5 = presque horizontal
        this.inclinationStrength = 0.0; // 0 = vertical, 1.0 = complètement incliné (90 degrés)
        this.inclinationDirection = new THREE.Vector2(1.0, 0.0).normalize();
        
        // Pour la réception des ombres
        this.shadowDensity = config.grassShadowDensity || 0.6;
        
        // Géométrie de base pour un brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.2, 1.0, 1, 4);
        this.geometry.translate(0, 0.5, 0); // Ajustement de la translation pour la nouvelle hauteur (moitié de 1.0)
        
        // Nouveau: Système de frustum culling
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._tempBoundingSphere = new THREE.Sphere();
        
        // Stockage des parcelles et leurs données
        this.plotData = [];
        
        // Distance maximale de visibilité (en unités)
        this.maxVisibilityDistance = 400;
        this.maxVisibilityDistanceSquared = this.maxVisibilityDistance * this.maxVisibilityDistance;
        
        // Distance maximale d'animation (en unités) - pour optimisation des performances
        this.maxAnimationDistance = 50;
        this.maxAnimationDistanceSquared = this.maxAnimationDistance * this.maxAnimationDistance;
        
        // Nouvelles distances pour le LOD progressif
        this.fullDetailDistance = 150; // Distance pour le détail complet
        this.fullDetailDistanceSquared = this.fullDetailDistance * this.fullDetailDistance;
        this.mediumDetailDistance = 250; // Distance pour le détail moyen
        this.mediumDetailDistanceSquared = this.mediumDetailDistance * this.mediumDetailDistance;
        this.lowDetailDistance = 350; // Distance pour le détail faible
        this.lowDetailDistanceSquared = this.lowDetailDistance * this.lowDetailDistance;
        
        // Paramètres de mise à jour
        this.updateFrequency = 5; // Réduction de la fréquence de mise à jour (était 2)
        this.frameCount = 0;
        this.updateInterval = 1500; // Augmentation de l'intervalle (était 1000ms)
        this.lastUpdateTime = 0;
        
        // Stockage caméra
        this._lastCameraPosition = null;
        this._lastCameraQuaternion = new THREE.Quaternion();
        this.cameraMovementThreshold = 5; // Seuil de mouvement de la caméra (au carré)
        
        // Vecteurs temporaires pour les calculs
        this._tempVector = new THREE.Vector3();
        this._directionVector = new THREE.Vector3();
        
        // Initialiser les shaders et le matériau
        this.initShaderMaterial();
    }
    
    /**
     * Définit la caméra utilisée pour le frustum culling
     * @param {THREE.Camera} camera - La caméra
     */
    setCamera(camera) {
        this.camera = camera;
    }
    
    async initShaderMaterial() {
        try {
            // Créer le matériau de base qui supporte l'éclairage et les ombres
            const grassTexture = this._createGrassTexture();
            
            // Créer un matériau MeshPhongMaterial standard qui supporte les ombres
            this.leavesMaterial = new THREE.MeshPhongMaterial({
                color: this.grassColor,
                side: THREE.DoubleSide,
                map: grassTexture,
                transparent: true,
                alphaTest: 0.1, // Augmentation du seuil alpha pour éviter la transparence
                depthWrite: true, // Réactivation de l'écriture en profondeur
                // Les propriétés importantes pour les ombres
                shadowSide: THREE.DoubleSide,
                receiveShadow: true
            });
            
            // Modifier le shader standard de Three.js via onBeforeCompile
            this.leavesMaterial.onBeforeCompile = (shader) => {
                // Ajouter nos uniformes personnalisés
                shader.uniforms.time = { value: 0 };
                
                // Paramètres d'animation simplifiés
                shader.uniforms.animationEnabled = { value: this.animationEnabled ? 1.0 : 0.0 };
                shader.uniforms.animationSpeed = { value: this.animationSpeed };
                shader.uniforms.torsionAmplitude = { value: this.torsionAmplitude };
                shader.uniforms.inclinationAmplitude = { value: this.inclinationAmplitude };
                
                // Direction du vent et de l'inclinaison
                shader.uniforms.windDirection = { value: this.windDirection };
                shader.uniforms.inclinationDirection = { value: this.inclinationDirection };
                
                // Nouvel uniform pour la distance max d'animation (cameraPosition est déjà fourni par Three.js)
                shader.uniforms.maxAnimationDistanceSquared = { value: this.maxAnimationDistanceSquared };
                
                // Stocker une référence au shader pour la mise à jour
                this.materialShader = shader;
                
                // 1. D'abord déclarer les uniformes dans le vertex shader
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `
                    uniform float time;
                    
                    // Paramètres d'animation simplifiés
                    uniform float animationEnabled; // 0.0 = désactivé, 1.0 = activé
                    uniform float animationSpeed;   // Vitesse de l'animation
                    uniform float torsionAmplitude; // Amplitude de torsion/plis
                    uniform float inclinationAmplitude; // Amplitude d'inclinaison
                    
                    // Directions
                    uniform vec2 windDirection;    // Direction du vent
                    uniform vec2 inclinationDirection; // Direction d'inclinaison
                    
                    // Nouveaux uniformes pour le calcul de distance
                    // Note: cameraPosition est déjà fourni par Three.js, pas besoin de le déclarer
                    uniform float maxAnimationDistanceSquared; // Distance max d'animation au carré
                    
                    varying vec2 vUv;
                    
                    // Fonction pour créer un mouvement d'herbe réaliste et continu
                    float grassAnimation(float t, vec3 pos) {
                        // Variation spatiale - chaque brin bouge différemment
                        float spatialOffset = pos.x * 0.1 + pos.z * 0.1;
                        
                        // Ajuster le temps selon la vitesse d'animation
                        t = t * animationSpeed;
                        
                        // Variations de fréquences pour créer un effet plus naturel
                        // Ondulation principale
                        float wave1 = sin(t * 1.0 + spatialOffset) * 0.3;
                        // Oscillation secondaire plus rapide
                        float wave2 = sin(t * 2.3 + spatialOffset * 1.5) * 0.15;
                        // Micro-variations à haute fréquence
                        float wave3 = sin(t * 4.7 + spatialOffset * 2.0) * 0.05;
                        // Mouvement très lent pour un effet de "respiration"
                        float wave4 = sin(t * 0.3 + spatialOffset * 0.7) * 0.1;
                        
                        return (wave1 + wave2 + wave3 + wave4);
                    }
                    
                    void main() {
                        vUv = uv;
                    `
                );
                
                // 2. Modifier le code d'animation pour utiliser la distance à la caméra
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    
                    // Calcul des facteurs de hauteur
                    float heightFactor = uv.y; // 0 à la base, 1 au sommet
                    
                    // Effet seulement proportionnel à la hauteur (pas d'effet à la base)
                    float effectIntensity = heightFactor * heightFactor; // Effet quadratique
                    
                    // Calculer la distance au carré entre l'instance et la caméra
                    #ifdef USE_INSTANCING
                    vec3 instPosition = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                    vec3 toCameraVector = instPosition - cameraPosition;
                    float distanceToCamera = dot(toCameraVector, toCameraVector); // équivalent à length(toCameraVector)^2
                    
                    // Vérifier si l'animation est activée et si l'instance est dans la plage d'animation
                    bool shouldAnimateInstance = animationEnabled > 0.5 && distanceToCamera <= maxAnimationDistanceSquared && effectIntensity > 0.0;
                    #else
                    // Si pas d'instancing, position simple
                    vec3 toCameraVector = position - cameraPosition;
                    float distanceToCamera = dot(toCameraVector, toCameraVector);
                    bool shouldAnimateInstance = animationEnabled > 0.5 && distanceToCamera <= maxAnimationDistanceSquared && effectIntensity > 0.0;
                    #endif
                    
                    // Si l'animation est activée et qu'on n'est pas à la base du brin
                    if (shouldAnimateInstance) {
                        // Temps actuel pour l'animation
                        float currentTime = time;
                        
                        // Calculer la valeur d'animation de base
                        #ifdef USE_INSTANCING
                        float animValue = grassAnimation(currentTime, instPosition);
                        #else
                        float animValue = grassAnimation(currentTime, position);
                        #endif
                        
                        // Direction du vent (normalisée) - utilisée pour l'inclinaison et la torsion
                        vec2 normalizedWindDir = normalize(windDirection);
                        vec3 worldWindDir = vec3(normalizedWindDir.x, 0.0, normalizedWindDir.y);
                        
                        // 1. Appliquer l'inclinaison (mouvement d'oscillation)
                        if (inclinationAmplitude > 0.1 && effectIntensity > 0.0) {
                            // Direction d'inclinaison (utiliser windDirection par défaut)
                            vec2 normalizedInclinationDir = normalize(inclinationDirection);
                            vec3 inclinationDir = vec3(normalizedInclinationDir.x, 0.0, normalizedInclinationDir.y);
                            
                            // Axe de rotation perpendiculaire à la direction d'inclinaison
                            vec3 rotationAxis = vec3(-normalizedInclinationDir.y, 0.0, normalizedInclinationDir.x);
                            
                            // Angle d'inclinaison basé sur la hauteur et l'animation
                            float inclinationAngle = animValue * inclinationAmplitude * effectIntensity * 0.3;
                            
                            // Si on est suffisamment haut sur le brin
                            if (heightFactor > 0.0) {
                                // Vecteur de déplacement vers le haut (à rotationner)
                                vec3 upVector = vec3(0.0, heightFactor * 1.5, 0.0);
                                
                                // Appliquer la rotation de Rodrigues
                                float cosA = cos(inclinationAngle);
                                float sinA = sin(inclinationAngle);
                                
                                vec3 rotatedVector = upVector * cosA + 
                                                  cross(rotationAxis, upVector) * sinA + 
                                                  rotationAxis * dot(rotationAxis, upVector) * (1.0 - cosA);
                                
                                // Appliquer le déplacement
                                transformed += rotatedVector - upVector;
                            }
                        }
                        
                        // 2. Appliquer la torsion/plis (courbure des brins)
                        if (torsionAmplitude > 0.1 && effectIntensity > 0.0) {
                            // Direction fixe pour la torsion (utiliser windDirection)
                            vec3 torsionDir = worldWindDir;
                            
                            // Axe perpendiculaire à la direction du vent
                            vec3 torsionAxis = vec3(-normalizedWindDir.y, 0.0, normalizedWindDir.x);
                            
                            // Angle de torsion basé sur la hauteur et l'animation
                            float torsionAngle = animValue * torsionAmplitude * pow(effectIntensity, 1.2) * 0.4;
                            
                            // Si on est suffisamment haut sur le brin
                            if (heightFactor > 0.3) { // Effet plus prononcé vers le haut
                                // Vecteur de déplacement vers le haut
                                vec3 upVector = vec3(0.0, heightFactor * 1.5, 0.0);
                                
                                // Appliquer la rotation de Rodrigues
                                float cosA = cos(torsionAngle);
                                float sinA = sin(torsionAngle);
                                
                                vec3 rotatedVector = upVector * cosA + 
                                                  cross(torsionAxis, upVector) * sinA + 
                                                  torsionAxis * dot(torsionAxis, upVector) * (1.0 - cosA);
                                
                                // Appliquer le déplacement
                                transformed += rotatedVector - upVector;
                                
                                // Ajouter un léger tremblement latéral
                                float trembleAmount = animValue * 0.05 * torsionAmplitude * heightFactor * heightFactor;
                                transformed.x += trembleAmount * torsionDir.x;
                                transformed.z += trembleAmount * torsionDir.z;
                            }
                        }
                    }
                    `
                );
                
                // 3. Déclarer la varying dans le fragment shader
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `
                    varying vec2 vUv;
                    
                    void main() {
                    `
                );
                
                // 4. Améliorer le calcul de la couleur
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    `
                    #include <color_fragment>
                    
                    // Nuances plus sombres à la base de l'herbe, plus claires aux extrémités
                    float clarity = (vUv.y * 0.5) + 0.5;
                    diffuseColor.rgb *= clarity;
                    
                    // Ajout d'une légère variation aléatoire
                    float randomVariation = fract(sin(vUv.x * 100.0) * 10000.0) * 0.05 + 0.95;
                    diffuseColor.rgb *= randomVariation;
                    `
                );
            };
            
            console.log("Matériau d'herbe initialisé avec succès en mode compatible ombres");
        } catch (error) {
            console.error("Erreur lors de l'initialisation du matériau d'herbe:", error);
        }
    }
    
    /**
     * Crée une texture procédurale pour l'herbe
     * @returns {THREE.Texture} La texture générée
     * @private
     */
    _createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Fond transparent
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dessiner un brin d'herbe avec un dégradé plus doux
        /* const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, 'rgba(72, 94, 60, 1)'); // Couleur de base à la racine
        gradient.addColorStop(0.5, 'rgba(82, 104, 65, 1)'); // Légèrement plus clair
        gradient.addColorStop(0.8, 'rgba(97, 117, 75, 1)'); // Plus clair
        gradient.addColorStop(1, 'rgba(97, 117, 75, 1)'); // Plus clair aux pointes, mais opaque */

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
gradient.addColorStop(0, '#FFFFFF'); // Couleur de base à la racine (#7DC257)
gradient.addColorStop(0.5, '#FFFFFF'); // Légèrement plus clair
gradient.addColorStop(0.8, '#FFFFFF'); // Plus clair
gradient.addColorStop(1, '#FFFFFF'); // Plus clair aux pointes, mais opaque
        
        // Forme du brin avec un léger flou aux bords
        ctx.fillStyle = gradient;
        
        // Dessiner la forme de base (triangle arrondi)
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.5, canvas.height); // Base au milieu
        
        // Créer une forme plus ovale avec des bords plus doux
        ctx.bezierCurveTo(
            canvas.width * 0.2, canvas.height * 0.8, // Point de contrôle gauche bas
            canvas.width * 0.1, canvas.height * 0.4, // Point de contrôle gauche haut
            canvas.width * 0.5, 0                    // Sommet du brin
        );
        ctx.bezierCurveTo(
            canvas.width * 0.9, canvas.height * 0.4, // Point de contrôle droit haut
            canvas.width * 0.8, canvas.height * 0.8, // Point de contrôle droit bas
            canvas.width * 0.5, canvas.height        // Retour à la base
        );
        ctx.fill();
        
        // Créer un masque pour les bords
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        
        // Copier le contenu du canvas principal
        maskCtx.drawImage(canvas, 0, 0);
        
        // Appliquer un flou sur le masque
        maskCtx.filter = 'blur(2px)';
        maskCtx.drawImage(maskCanvas, 0, 0);
        
        // Réappliquer le masque flouté sur le canvas original
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        
        // Créer la texture Three.js à partir du canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        
        return texture;
    }
    
    createGrassInstances(plot) {
        // Vérifier si le matériau est initialisé
        if (!this.leavesMaterial) {
            console.warn("Le matériau d'herbe n'est pas encore initialisé");
            return new THREE.Group(); // Retourner un groupe vide
        }
        
        // Créer le mesh instancié
        const instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.leavesMaterial,
            this.instanceNumber
        );
        
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = false; // L'herbe ne projette pas d'ombre (pour des raisons de performance)
        instancedMesh.receiveShadow = true; // L'herbe reçoit des ombres
        
        // Position du centre de la parcelle
        const centerX = plot.x + plot.width / 2;
        const centerZ = plot.z + plot.depth / 2;
        const plotCenter = new THREE.Vector3(centerX, 0, centerZ);
        
        // Calculer la sphère englobante pour le frustum culling
        const boundingSphere = new THREE.Sphere(
            plotCenter.clone(),
            Math.sqrt((plot.width / 2) * (plot.width / 2) + (plot.depth / 2) * (plot.depth / 2))
        );
        
        // Stocker les données de la parcelle
        const plotInfo = {
            mesh: instancedMesh,
            center: plotCenter,
            distanceSquared: 0,
            lastUpdate: 0,
            id: plot.id || Math.random().toString(36).substr(2, 9),
            isVisible: true,
            isAnimated: false,  // Par défaut, pas animé jusqu'à ce que la distance soit vérifiée
            lastAnimatedState: false,
            boundingSphere: boundingSphere,
            plot: plot,
            lodLevel: 0, // 0 = détail complet, 1 = moyen, 2 = faible, 3 = très faible
            lastLodLevel: -1, // Pour détecter les changements
            instancesVisible: 0 // Nombre d'instances actuellement visibles
        };
        this.plotData.push(plotInfo);
        
        // Déterminer la densité d'herbe en fonction du type de zone
        let density = 1.0;
        let heightMultiplier = 1.0; // Multiplicateur de hauteur par défaut
        
        if (plot.zoneType === 'park') {
            density = 1.2; // Plus dense dans les parcs
            heightMultiplier = 0.55; // Plus haute dans les parcs
        } else if (plot.zoneType === 'house') {
            density = 1.2; // Moins dense dans les zones résidentielles
            heightMultiplier = 0.5; // Plus courte dans les zones résidentielles
        }
        
        // Stocker les matrices originales et les informations de visibilité
        instancedMesh.userData = {
            positions: [],
            originalMatrices: [],
            visible: new Array(this.instanceNumber).fill(true),
            animated: false, // État d'animation pour toute la parcelle
            originalVisibilityState: new Array(this.instanceNumber).fill(true) // Pour le LOD
        };
        
        // Positionner et échelonner les instances d'herbe aléatoirement dans la parcelle
        for (let i = 0; i < this.instanceNumber; i++) {
            // Position aléatoire dans la parcelle
            const x = plot.x + (Math.random() * plot.width);
            const z = plot.z + (Math.random() * plot.depth);
            
            // Éviter de placer l'herbe près des bords de parcelle
            const margin = 0.1;
            const adjustedX = Math.max(plot.x + margin, Math.min(plot.x + plot.width - margin, x));
            const adjustedZ = Math.max(plot.z + margin, Math.min(plot.z + plot.depth - margin, z));
            
            // Positionner, échelonner et orienter le dummy
            this.dummy.position.set(adjustedX, 0.15, adjustedZ);
            
            // Variation de taille avec une échelle plus grande
            const scale = (0.5 + Math.random() * 0.8) * density; // Augmentation de l'échelle de base et de la variation
            this.dummy.scale.set(scale, scale * heightMultiplier, scale); // Appliquer le multiplicateur de hauteur
            
            // Rotation aléatoire
            this.dummy.rotation.y = Math.random() * Math.PI * 2;
            
            // Mettre à jour la matrice et l'appliquer à l'instance
            this.dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this.dummy.matrix);
            
            // Stocker la position et la matrice
            instancedMesh.userData.positions.push(new THREE.Vector3(adjustedX, 0, adjustedZ));
            instancedMesh.userData.originalMatrices.push(new THREE.Matrix4().copy(this.dummy.matrix));
        }
        
        // Indiquer que la matrice d'instance a été modifiée
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Stocker le mesh dans le tableau des meshes
        this.instancedMeshes.push(instancedMesh);
        
        return instancedMesh;
    }
    
    update() {
        // S'assurer que la caméra est définie
        if (!this.camera) return;
        
        // Optimisation: Ne mettre à jour que tous les X frames
        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) {
            // Mettre à jour l'uniform de temps pour l'animation si le shader est compilé
            // même si on ne fait pas la mise à jour complète
            if (this.materialShader && this.animationEnabled) {
                this.materialShader.uniforms.time.value = this.clock.getElapsedTime();
                // Three.js met à jour automatiquement cameraPosition
            }
            return; // Sortir pour économiser du CPU
        }

        // Mise à jour complète du système
        const currentTime = Date.now();
        
        // Mettre à jour les shaders uniquement si nécessaire
        if (this.materialShader) {
            // Mettre à jour l'uniform de temps pour l'animation
            this.materialShader.uniforms.time.value = this.clock.getElapsedTime();
            
            // Three.js met à jour automatiquement cameraPosition, pas besoin de le faire
            
            // Mettre à jour les paramètres d'animation simplifiés seulement s'ils ont changé
            // (Utilisation de variables temporaires pour éviter d'accéder aux uniforms si pas nécessaire)
            const animEnabled = this.animationEnabled ? 1.0 : 0.0;
            if (this.materialShader.uniforms.animationEnabled.value !== animEnabled) {
                this.materialShader.uniforms.animationEnabled.value = animEnabled;
            }
            
            // Mettre à jour seulement les paramètres qui ont changé
            if (this.materialShader.uniforms.animationSpeed.value !== this.animationSpeed) {
                this.materialShader.uniforms.animationSpeed.value = this.animationSpeed;
            }
            
            if (this.materialShader.uniforms.torsionAmplitude.value !== this.torsionAmplitude) {
                this.materialShader.uniforms.torsionAmplitude.value = this.torsionAmplitude;
            }
            
            if (this.materialShader.uniforms.inclinationAmplitude.value !== this.inclinationAmplitude) {
                this.materialShader.uniforms.inclinationAmplitude.value = this.inclinationAmplitude;
            }
            
            // Mettre à jour la distance maximale d'animation si elle a changé
            if (this.materialShader.uniforms.maxAnimationDistanceSquared.value !== this.maxAnimationDistanceSquared) {
                this.materialShader.uniforms.maxAnimationDistanceSquared.value = this.maxAnimationDistanceSquared;
            }
            
            // Mettre à jour les directions seulement si elles ont changé
            const windDirX = this.windDirection.x;
            const windDirY = this.windDirection.y;
            if (this.materialShader.uniforms.windDirection.value.x !== windDirX || 
                this.materialShader.uniforms.windDirection.value.y !== windDirY) {
                this.materialShader.uniforms.windDirection.value = this.windDirection;
            }
            
            const inclDirX = this.inclinationDirection.x;
            const inclDirY = this.inclinationDirection.y;
            if (this.materialShader.uniforms.inclinationDirection.value.x !== inclDirX || 
                this.materialShader.uniforms.inclinationDirection.value.y !== inclDirY) {
                this.materialShader.uniforms.inclinationDirection.value = this.inclinationDirection;
            }
        }
        
        // Optimisation: Vérifier si suffisamment de temps s'est écoulé depuis la dernière mise à jour
        if (currentTime - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = currentTime;
        
        // Vérifier si la caméra a bougé significativement
        if (!this._checkCameraMovement()) return;
        
        // Mettre à jour le frustum et la visibilité des parcelles
        this._updateCameraFrustum();
        this._updatePlotVisibility();
    }
    
    // Vérifier si la caméra a bougé suffisamment pour justifier une mise à jour
    _checkCameraMovement() {
        if (!this.camera) return false;
        
        const cameraPosition = this.camera.position;
        let shouldUpdate = false;
        
        // Vérifier le mouvement de position
        if (!this._lastCameraPosition) {
            this._lastCameraPosition = cameraPosition.clone();
            shouldUpdate = true;
        } else {
            const tempVector = new THREE.Vector3().subVectors(cameraPosition, this._lastCameraPosition);
            const distanceSquared = tempVector.lengthSq();
            if (distanceSquared > this.cameraMovementThreshold) {
                shouldUpdate = true;
            }
            this._lastCameraPosition.copy(cameraPosition);
        }
        
        // Vérifier le changement d'orientation
        if (this.camera) {
            const currentQuaternion = this.camera.quaternion;
            const angle = this._lastCameraQuaternion.angleTo(currentQuaternion);
            // Mettre à jour si l'angle de rotation est significatif (plus de 5 degrés)
            if (angle > 0.087) { // ~5 degrés en radians
                shouldUpdate = true;
                this._lastCameraQuaternion.copy(currentQuaternion);
            }
        }
        
        return shouldUpdate;
    }
    
    // Mettre à jour le frustum de la caméra
    _updateCameraFrustum() {
        if (!this.camera) return;
        
        // Calculer la matrice de projection * vue
        this._projScreenMatrix.multiplyMatrices(
            this.camera.projectionMatrix, 
            this.camera.matrixWorldInverse
        );
        
        // Mettre à jour le frustum
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    }
    
    // Mettre à jour la visibilité des parcelles en fonction du frustum
    _updatePlotVisibility() {
        if (!this.camera || this.plotData.length === 0) return;
        
        const cameraPosition = this.camera.position;
        
        // Parcourir toutes les parcelles
        this.plotData.forEach(plotInfo => {
            // Calculer la distance au carré
            this._tempVector.copy(plotInfo.center).sub(cameraPosition);
            plotInfo.distanceSquared = this._tempVector.lengthSq();
            
            // Par défaut, considérer comme non visible
            let isVisible = false;
            
            // Vérifier d'abord la distance
            if (plotInfo.distanceSquared <= this.maxVisibilityDistanceSquared) {
                // Ensuite vérifier le frustum
                this._tempBoundingSphere.copy(plotInfo.boundingSphere);
                isVisible = this._frustum.intersectsSphere(this._tempBoundingSphere);
            }
            
            // Déterminer le niveau de LOD en fonction de la distance
            let newLodLevel = 0; // Par défaut, détail complet
            
            if (isVisible) {
                if (plotInfo.distanceSquared > this.lowDetailDistanceSquared) {
                    newLodLevel = 3; // Très faible détail (seulement ~10% des instances)
                } else if (plotInfo.distanceSquared > this.mediumDetailDistanceSquared) {
                    newLodLevel = 2; // Faible détail (seulement ~30% des instances)
                } else if (plotInfo.distanceSquared > this.fullDetailDistanceSquared) {
                    newLodLevel = 1; // Détail moyen (seulement ~60% des instances)
                }
            }
            
            // Appliquer la visibilité et le LOD seulement si un changement est nécessaire
            const visibilityChanged = plotInfo.isVisible !== isVisible;
            const lodChanged = plotInfo.lodLevel !== newLodLevel;
            
            if (visibilityChanged || lodChanged) {
                plotInfo.isVisible = isVisible;
                plotInfo.lodLevel = newLodLevel;
                this._applyPlotVisibility(plotInfo);
            }
        });
    }
    
    // Appliquer la visibilité à une parcelle
    _applyPlotVisibility(plotInfo) {
        const mesh = plotInfo.mesh;
        if (!mesh || !mesh.userData) return;
        
        // Optimisation majeure: Utiliser mesh.visible pour désactiver complètement le rendu
        // au lieu de déplacer les instances hors champ
        if (!plotInfo.isVisible) {
            // Si la parcelle n'est pas visible, désactiver complètement le mesh
            if (mesh.visible) {
                mesh.visible = false;
            }
            return; // Sortir immédiatement pour économiser des calculs
        } else if (!mesh.visible) {
            // Si la parcelle devient visible, réactiver le mesh
            mesh.visible = true;
        }
        
        // Si le niveau de LOD a changé, ajuster le nombre d'instances visibles
        if (plotInfo.lodLevel !== plotInfo.lastLodLevel) {
            const matrix = new THREE.Matrix4();
            let instanceCount = this.instanceNumber;
            
            // Déterminer combien d'instances doivent être visibles selon le LOD
            switch(plotInfo.lodLevel) {
                case 1: // Détail moyen
                    instanceCount = Math.floor(this.instanceNumber * 0.6);
                    break;
                case 2: // Faible détail
                    instanceCount = Math.floor(this.instanceNumber * 0.3);
                    break;
                case 3: // Très faible détail
                    instanceCount = Math.floor(this.instanceNumber * 0.1);
                    break;
                default: // Détail complet
                    instanceCount = this.instanceNumber;
            }
            
            // Mettre à jour la visibilité des instances
            let needsUpdate = false;
            
            for (let i = 0; i < this.instanceNumber; i++) {
                const shouldBeVisible = i < instanceCount;
                
                // Si l'état de visibilité a changé
                if (mesh.userData.visible[i] !== shouldBeVisible) {
                    if (shouldBeVisible) {
                        // Restaurer la position d'origine
                        mesh.setMatrixAt(i, mesh.userData.originalMatrices[i]);
                    } else {
                        // Déplacer l'instance hors du champ
                        mesh.getMatrixAt(i, matrix);
                        matrix.elements[12] = -10000; // X
                        matrix.elements[13] = -10000; // Y
                        matrix.elements[14] = -10000; // Z
                        mesh.setMatrixAt(i, matrix);
                    }
                    
                    mesh.userData.visible[i] = shouldBeVisible;
                    needsUpdate = true;
                }
            }
            
            // Mettre à jour la matrice seulement si nécessaire
            if (needsUpdate) {
                mesh.instanceMatrix.needsUpdate = true;
            }
            
            // Sauvegarder le nouveau niveau de LOD
            plotInfo.lastLodLevel = plotInfo.lodLevel;
            plotInfo.instancesVisible = instanceCount;
        }
    }
    
    reset() {
        // Supprimer tous les meshes instanciés de la scène
        this.instancedMeshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            
            // Libérer les ressources
            mesh.dispose();
        });
        
        // Réinitialiser le tableau
        this.instancedMeshes = [];
        this.plotData = [];
    }
    
    /**
     * Réinitialise tous les paramètres d'herbe à leurs valeurs par défaut
     */
    resetGrass() {
        // Réinitialiser les paramètres d'animation
        this.animationEnabled = false;
        this.animationSpeed = 1.0;
        this.torsionAmplitude = 1.0;
        this.inclinationAmplitude = 1.0;
        
        // Réinitialiser les anciens paramètres pour compatibilité
        this.windStrength = 0.0;
        this.bendStrength = 0.0;
        this.inclinationStrength = 0.0;
    }
    
    /**
     * Active ou désactive l'animation de l'herbe
     * @param {boolean} enabled - true pour activer, false pour désactiver
     */
    setAnimationEnabled(enabled) {
        this.animationEnabled = enabled;
    }
    
    /**
     * Définit la vitesse de l'animation de l'herbe
     * @param {number} speed - Vitesse de l'animation (0.1-2.0)
     */
    setAnimationSpeed(speed) {
        this.animationSpeed = Math.max(0.1, Math.min(2.0, speed));
    }
    
    /**
     * Définit l'amplitude de l'animation de l'herbe
     * @param {number} amplitude - Amplitude de l'animation (0.1-2.0)
     */
    setAnimationAmplitude(amplitude) {
        // Pour simplifier, on applique la même amplitude aux deux effets
        this.torsionAmplitude = Math.max(0.1, Math.min(2.0, amplitude));
        this.inclinationAmplitude = Math.max(0.1, Math.min(2.0, amplitude));
    }
    
    /**
     * Définit l'amplitude de torsion/plis des brins d'herbe
     * @param {number} amplitude - Amplitude de torsion (0.1-2.0)
     */
    setTorsionAmplitude(amplitude) {
        this.torsionAmplitude = Math.max(0.1, Math.min(2.0, amplitude));
    }
    
    /**
     * Définit l'amplitude d'inclinaison des brins d'herbe
     * @param {number} amplitude - Amplitude d'inclinaison (0.1-2.0)
     */
    setInclinationAmplitude(amplitude) {
        this.inclinationAmplitude = Math.max(0.1, Math.min(2.0, amplitude));
    }
    
    // --- Anciennes méthodes conservées pour compatibilité ---
    
    /**
     * @deprecated Utiliser les nouvelles méthodes setTorsionAmplitude et setInclinationAmplitude
     */
    setWindStrength(strength) {
        this.windStrength = strength;
        
        // Convertir en paramètres d'animation
        if (strength > 0.01) {
            this.animationEnabled = true;
            const normalizedStrength = Math.min(5.0, Math.max(0.0, strength));
            this.torsionAmplitude = normalizedStrength / 5.0 * 2.0;
            this.inclinationAmplitude = normalizedStrength / 5.0 * 2.0;
        } else {
            this.animationEnabled = false;
        }
    }
    
    /**
     * @deprecated Utiliser setTorsionAmplitude à la place
     */
    setGrassBendStrength(strength) {
        this.bendStrength = strength;
        
        // Convertir en amplitude de torsion
        if (strength > 0.01) {
            this.animationEnabled = true;
            this.torsionAmplitude = strength / 1.5 * 2.0;
        }
    }
    
    /**
     * @deprecated Utiliser setInclinationAmplitude à la place
     */
    setGrassInclinationStrength(strength) {
        this.inclinationStrength = strength;
        
        // Convertir en amplitude d'inclinaison
        if (strength > 0.01) {
            this.animationEnabled = true;
            this.inclinationAmplitude = strength * 2.0;
        }
    }
    
    /**
     * @deprecated Utiliser setTorsionAmplitude à la place
     */
    setTwistFactor(factor) {
        // Convertir en amplitude de torsion
        this.torsionAmplitude = factor;
    }
    
    /**
     * @deprecated Utiliser setInclinationAmplitude à la place
     */
    setInclinationFactor(factor) {
        // Convertir en amplitude d'inclinaison
        this.inclinationAmplitude = factor;
    }
} 