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
        this.windStrength = config.grassWindStrength || 0.0; // Force du vent initialisée à 0 par défaut
        
        // Nouveau: Direction du vent
        this.windDirection = new THREE.Vector2(1.0, 0.0).normalize(); // Vent par défaut vers l'est
        
        // Pour la réception des ombres
        this.shadowDensity = config.grassShadowDensity || 0.6;
        
        // Géométrie de base pour un brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.2, 1.5, 1, 4);
        this.geometry.translate(0, 0.75, 0); // Ajustement de la translation pour la nouvelle hauteur
        
        // Nouveau: Système de frustum culling
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._tempBoundingSphere = new THREE.Sphere();
        
        // Stockage des parcelles et leurs données
        this.plotData = [];
        
        // Distance maximale de visibilité (en unités)
        this.maxVisibilityDistance = 300;
        this.maxVisibilityDistanceSquared = this.maxVisibilityDistance * this.maxVisibilityDistance;
        
        // Paramètres de mise à jour
        this.updateFrequency = 2; // Mettre à jour tous les 2 frames
        this.frameCount = 0;
        this.updateInterval = 1000; // Mettre à jour toutes les secondes
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
    
    async initShaderMaterial() {
        try {
            // Essayer de charger le shader depuis le fichier externe
            // Passer uniquement le nom du fichier et non le chemin complet
            const vertexShader = await ShaderLoader.loadShader('grassVertex.glsl');
            
            if (vertexShader) {
                // Créer un matériau avec le shader externe
                this.leavesMaterial = new THREE.ShaderMaterial({
                    vertexShader: vertexShader,
                    fragmentShader: `
                        varying vec2 vUv;
                        varying vec3 vNormal;
                        varying vec3 vWorldPosition;
                        
                        uniform vec3 diffuse;
                        uniform float opacity;
                        
                        void main() {
                            // Nuances plus sombres à la base de l'herbe, plus claires aux extrémités
                            float clarity = (vUv.y * 0.5) + 0.5;
                            vec3 color = diffuse * clarity;
                            
                            // Ajout d'une légère variation aléatoire
                            float randomVariation = fract(sin(vUv.x * 100.0) * 10000.0) * 0.05 + 0.95;
                            color *= randomVariation;
                            
                            gl_FragColor = vec4(color, opacity);
                        }
                    `,
                    uniforms: {
                        time: { value: 0 },
                        windStrength: { value: this.windStrength },
                        windDirection: { value: this.windDirection },
                        shadowMatrix: { value: new THREE.Matrix4() },
                        diffuse: { value: this.grassColor },
                        opacity: { value: 1.0 }
                    },
                    side: THREE.DoubleSide,
                    transparent: true
                });
                
                this.materialShader = this.leavesMaterial;
                console.log("Matériau d'herbe initialisé avec succès en utilisant le shader externe");
            } else {
                // Fallback à l'ancien matériau si le shader n'est pas chargé
                fallbackMaterial();
            }
        } catch (error) {
            console.error("Erreur lors du chargement du shader externe:", error);
            fallbackMaterial();
        }
        
        // Fonction interne pour créer un matériau de fallback
        const fallbackMaterial = () => {
            console.log("Utilisation du matériau de fallback pour l'herbe");
            // Préparer le matériau de Three.js avec support des ombres
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
            
            // Ajouter des uniformes personnalisés au shader standard de Three.js
            this.leavesMaterial.onBeforeCompile = (shader) => {
                // Ajouter nos uniformes personnalisés
                shader.uniforms.time = { value: 0 };
                shader.uniforms.windStrength = { value: this.windStrength };
                shader.uniforms.windDirection = { value: this.windDirection }; // Nouveau: Direction du vent
                
                // Stocker une référence au shader pour la mise à jour
                this.materialShader = shader;
                
                // 1. D'abord déclarer les uniformes dans le vertex shader
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `
                    uniform float time;
                    uniform float windStrength;
                    uniform vec2 windDirection;
                    varying vec2 vUv;
                    
                    // Fonction pour créer un bruit de vent plus naturel
                    float windNoise(float t) {
                        return sin(t) * 0.5 + sin(t * 2.1) * 0.25 + sin(t * 4.2) * 0.125;
                    }
                    
                    // Fonction pour l'effet d'inclinaison
                    float tiltCurve(float height) {
                        // Inclinaison constante et très prononcée
                        return pow(height, 0.4) * 4.0;
                    }
                    
                    // Fonction pour l'effet de courbure
                    float bendCurve(float height) {
                        // Courbure extrême en haut du brin
                        return pow(height, 1.5) * 6.0;
                    }
                    
                    void main() {
                        vUv = uv;
                    `
                );
                
                // 2. Ensuite ajouter le code d'animation amélioré
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    
                    // Courbure naturelle du brin d'herbe (indépendant du vent)
                    float bendStrength = 0.2; // Force de la courbure naturelle
                    float heightFactor = pow(uv.y, 4.0); // Facteur de hauteur
                    
                    // Appliquer une courbure naturelle dans une direction aléatoire mais constante
                    float bendAngle = fract(sin(instanceMatrix[3][0] * 100.0 + instanceMatrix[3][2] * 100.0) * 43758.5453) * 6.28; // Angle aléatoire entre 0 et 2π
                    float bendX = cos(bendAngle) * bendStrength * heightFactor;
                    float bendZ = sin(bendAngle) * bendStrength * heightFactor;
                    transformed.x += bendX;
                    transformed.z += bendZ;
                    
                    // Calcul des facteurs pour l'animation de vent
                    float windTime = time * 1.2; // Vitesse du vent plus lente pour un effet plus constant
                    float windNoiseValue = windNoise(windTime + instanceMatrix[3][0] * 0.1 + instanceMatrix[3][2] * 0.1);
                    
                    // 1. Effet d'inclinaison constant (le brin reste incliné)
                    vec2 baseTilt = windDirection * 2.0; // Inclinaison de base constante 
                    vec2 tiltEffect = baseTilt + (windDirection * windNoiseValue * tiltCurve(heightFactor) * windStrength * 2.0);
                    
                    // 2. Effet de courbure (le brin se courbe sous son propre poids)
                    float bendAmount = length(tiltEffect) * bendCurve(heightFactor);
                    vec2 bendEffect = windDirection * bendAmount * windStrength;
                    
                    // Combiner les effets avec une pondération différente
                    vec2 totalDisplacement = tiltEffect * 1.5 + bendEffect * 1.0;
                    
                    // Appliquer l'inclinaison et la courbure
                    transformed.x += totalDisplacement.x;
                    transformed.z += totalDisplacement.y;
                    
                    // Effet de compression très prononcé
                    float compressionFactor = 1.0 - (windNoiseValue * 0.6 * heightFactor * windStrength);
                    transformed.y *= compressionFactor;
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
        };
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
            boundingSphere: boundingSphere,
            plot: plot
        };
        this.plotData.push(plotInfo);
        
        // Déterminer la densité d'herbe en fonction du type de zone
        let density = 1.0;
        if (plot.zoneType === 'park') {
            density = 1.2; // Plus dense dans les parcs
        } else if (plot.zoneType === 'house') {
            density = 0.7; // Moins dense dans les zones résidentielles
        }
        
        // Stocker les matrices originales et les informations de visibilité
        instancedMesh.userData = {
            positions: [],
            originalMatrices: [],
            visible: new Array(this.instanceNumber).fill(true)
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
            this.dummy.position.set(adjustedX, 0, adjustedZ);
            
            // Variation de taille avec une échelle plus grande
            const scale = (0.5 + Math.random() * 0.8) * density; // Augmentation de l'échelle de base et de la variation
            this.dummy.scale.setScalar(scale);
            
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
        // Mettre à jour l'uniform de temps pour l'animation si le shader est compilé
        if (this.materialShader) {
            // Vérifier si c'est un ShaderMaterial ou un matériau compilé
            if (this.materialShader.uniforms) {
                // ShaderMaterial
                this.materialShader.uniforms.time.value = this.clock.getElapsedTime();
                this.materialShader.uniforms.windStrength.value = this.windStrength;
                this.materialShader.uniforms.windDirection.value = this.windDirection;
                
                // Mettre à jour la matrice d'ombre si nécessaire
                if (this.experience.scene && this.experience.scene.directionalLight) {
                    const light = this.experience.scene.directionalLight;
                    this.materialShader.uniforms.shadowMatrix.value.copy(light.shadow.matrix);
                }
            } else {
                // Matériau compilé (via onBeforeCompile)
                this.materialShader.uniforms.time.value = this.clock.getElapsedTime();
                this.materialShader.uniforms.windStrength.value = this.windStrength;
                this.materialShader.uniforms.windDirection.value = this.windDirection;
            }
        }
        
        // Mise à jour du frustum culling
        if (!this.camera) return;
        
        // Optimisation: Ne mettre à jour que tous les X frames
        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) return;

        const currentTime = Date.now();
        
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
            
            // Appliquer la visibilité
            if (plotInfo.isVisible !== isVisible) {
                plotInfo.isVisible = isVisible;
                this._applyPlotVisibility(plotInfo);
            }
        });
    }
    
    // Appliquer la visibilité à une parcelle
    _applyPlotVisibility(plotInfo) {
        const mesh = plotInfo.mesh;
        if (!mesh || !mesh.userData) return;
        
        const matrix = new THREE.Matrix4();
        
        if (!plotInfo.isVisible) {
            // Déplacer toutes les instances hors du champ de vision
            for (let i = 0; i < this.instanceNumber; i++) {
                mesh.getMatrixAt(i, matrix);
                matrix.elements[12] = -10000; // X
                matrix.elements[13] = -10000; // Y
                matrix.elements[14] = -10000; // Z
                mesh.setMatrixAt(i, matrix);
                mesh.userData.visible[i] = false;
            }
        } else {
            // Restaurer toutes les instances à leur position d'origine
            for (let i = 0; i < this.instanceNumber; i++) {
                if (!mesh.userData.visible[i]) {
                    mesh.setMatrixAt(i, mesh.userData.originalMatrices[i]);
                    mesh.userData.visible[i] = true;
                }
            }
        }
        
        mesh.instanceMatrix.needsUpdate = true;
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
    
    // Fonction pour ajuster le paramètre de force du vent
    setWindStrength(strength) {
        this.windStrength = strength;
        // Sera mis à jour dans la méthode update
    }
    
    // Nouvelle méthode pour créer un vent fort
    setStrongWind() {
        this.windStrength = 4.0; // Force du vent très élevée
        // Sera mis à jour dans la méthode update
    }
    
    // Nouvelle méthode pour définir la direction du vent
    setWindDirection(direction) {
        if (direction instanceof THREE.Vector2) {
            this.windDirection.copy(direction).normalize();
        } else if (Array.isArray(direction) && direction.length >= 2) {
            this.windDirection.set(direction[0], direction[1]).normalize();
        } else if (typeof direction === 'number') {
            // Si on passe un angle en radians
            this.windDirection.set(Math.cos(direction), Math.sin(direction));
        }
        
        // Mettre à jour le shader si disponible
        if (this.materialShader) {
            this.materialShader.uniforms.windDirection.value = this.windDirection;
        }
    }
    
    setCamera(camera) {
        this.camera = camera;
    }
} 