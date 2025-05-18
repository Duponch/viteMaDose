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
        this.windStrength = config.grassWindStrength || 1.0;
        
        // Pour la réception des ombres
        this.shadowDensity = config.grassShadowDensity || 0.6;
        
        // Géométrie de base pour un brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.1, 1, 1, 4);
        this.geometry.translate(0, 0.5, 0); // Déplacer le point le plus bas à 0
        
        // Initialiser les shaders et le matériau
        this.initShaderMaterial();
    }
    
    async initShaderMaterial() {
        try {
            // Charger les shaders
            let vertexShader, fragmentShader;
            
            try {
                vertexShader = await ShaderLoader.loadShader('grassVertex.glsl');
                fragmentShader = await ShaderLoader.loadShader('grassFragment.glsl');
                console.log("Shaders d'herbe chargés depuis les fichiers");
            } catch (loadError) {
                console.warn("Impossible de charger les shaders depuis les fichiers, utilisation des shaders par défaut:", loadError);
                
                // Shaders par défaut en cas d'échec du chargement
                vertexShader = `
                varying vec2 vUv;
                uniform float time;
                uniform float windStrength;
                
                void main() {
                  vUv = uv;
                  
                  // VERTEX POSITION
                  vec4 mvPosition = vec4(position, 1.0);
                  #ifdef USE_INSTANCING
                    mvPosition = instanceMatrix * mvPosition;
                  #endif
                  
                  // DISPLACEMENT
                  // L'effet est plus fort au bout des brins d'herbe
                  float dispPower = 1.0 - cos(uv.y * 3.1416 / 2.0);
                  
                  float displacement = sin(mvPosition.z + time * 5.0) * (0.1 * dispPower * windStrength);
                  mvPosition.x += displacement;
                  
                  // Légère variation sur l'axe z pour plus de naturalité
                  float displacementZ = cos(mvPosition.x + time * 7.0) * (0.05 * dispPower * windStrength);
                  mvPosition.z += displacementZ;
                  
                  vec4 modelViewPosition = modelViewMatrix * mvPosition;
                  gl_Position = projectionMatrix * modelViewPosition;
                }`;
                
                fragmentShader = `
                varying vec2 vUv;
                
                // Lumières et ombres
                uniform vec3 sunDirection;
                uniform vec3 sunColor;
                uniform vec3 ambientLight;
                uniform vec3 grassColor;
                uniform float receiveShadow;
                
                void main() {
                  // Couleur de base de l'herbe
                  vec3 baseColor = grassColor;
                  
                  // Nuances plus sombres à la base de l'herbe, plus claires aux extrémités
                  float clarity = (vUv.y * 0.5) + 0.5;
                  
                  // Calcul simple d'éclairage
                  vec3 normal = vec3(0.0, 1.0, 0.0); // Normale simplifiée pointant vers le haut
                  float lightIntensity = max(0.0, dot(normal, normalize(sunDirection)));
                  
                  // Mélanger la lumière ambiante et directionnelle
                  vec3 lighting = ambientLight + (sunColor * lightIntensity * receiveShadow);
                  
                  // Couleur finale
                  vec3 finalColor = baseColor * clarity * lighting;
                  
                  // Ajout d'une légère variation aléatoire basée sur la position UV pour éviter l'uniformité
                  float randomVariation = fract(sin(vUv.x * 100.0) * 10000.0) * 0.05 + 0.95;
                  finalColor *= randomVariation;
                  
                  gl_FragColor = vec4(finalColor, 1.0);
                }`;
            }
            
            // Créer les uniformes pour le shader
            this.uniforms = {
                time: { value: 0 },
                windStrength: { value: this.windStrength },
                sunDirection: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
                sunColor: { value: new THREE.Color(1, 1, 0.9) },
                ambientLight: { value: new THREE.Color(0.3, 0.3, 0.3) },
                grassColor: { value: this.grassColor },
                receiveShadow: { value: 1.0 }
            };
            
            // Créer le matériau avec les shaders
            this.leavesMaterial = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                uniforms: this.uniforms,
                side: THREE.DoubleSide
            });
            
            console.log("Shaders d'herbe initialisés avec succès");
        } catch (error) {
            console.error("Erreur lors de l'initialisation des shaders d'herbe:", error);
        }
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
        
        // Déterminer la densité d'herbe en fonction du type de zone
        let density = 1.0;
        if (plot.zoneType === 'park') {
            density = 1.2; // Plus dense dans les parcs
        } else if (plot.zoneType === 'house') {
            density = 0.7; // Moins dense dans les zones résidentielles
        }
        
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
            
            // Variation de taille
            const scale = (0.3 + Math.random() * 0.5) * density;
            this.dummy.scale.setScalar(scale);
            
            // Rotation aléatoire
            this.dummy.rotation.y = Math.random() * Math.PI * 2;
            
            // Mettre à jour la matrice et l'appliquer à l'instance
            this.dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }
        
        // Indiquer que la matrice d'instance a été modifiée
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Stocker le mesh dans le tableau des meshes
        this.instancedMeshes.push(instancedMesh);
        
        return instancedMesh;
    }
    
    update() {
        // Mettre à jour l'uniform de temps pour l'animation
        if (this.leavesMaterial && this.leavesMaterial.uniforms) {
            this.leavesMaterial.uniforms.time.value = this.clock.getElapsedTime();
            
            // Récupérer directement la lumière directionnelle principale (soleil) et la lumière ambiante
            const directionalLight = this._getMainDirectionalLight();
            const ambientLight = this._getAmbientLight();
            
            // DEBUG: afficher des infos sur les lumières récupérées (à enlever après débogage)
            if (!this._debugLogShown) {
                if (directionalLight) {
                    console.log("ShaderGrassInstancer: Lumière directionnelle trouvée:", 
                        directionalLight.name, 
                        "position:", directionalLight.position.toArray().map(v => v.toFixed(2)),
                        "couleur:", directionalLight.color.getHexString(),
                        "intensité:", directionalLight.intensity
                    );
                } else {
                    console.warn("ShaderGrassInstancer: Aucune lumière directionnelle trouvée!");
                }
                
                if (ambientLight) {
                    console.log("ShaderGrassInstancer: Lumière ambiante trouvée:",
                        ambientLight.name,
                        "couleur:", ambientLight.color.getHexString(),
                        "intensité:", ambientLight.intensity
                    );
                } else {
                    console.warn("ShaderGrassInstancer: Aucune lumière ambiante trouvée!");
                }
                
                this._debugLogShown = true; // N'afficher qu'une fois pour éviter de spammer la console
            }
            
            if (directionalLight) {
                // Synchroniser avec la position du soleil/lune réelle
                const sunDirection = new THREE.Vector3();
                directionalLight.getWorldDirection(sunDirection).multiplyScalar(-1); // Inverser car la direction de la lumière est OPPOSÉe à sa position
                this.leavesMaterial.uniforms.sunDirection.value.copy(sunDirection);
                
                // Synchroniser avec la couleur et l'intensité exactes de la lumière directionnelle
                const sunColorWithIntensity = new THREE.Color()
                    .copy(directionalLight.color)
                    .multiplyScalar(directionalLight.intensity);
                
                this.leavesMaterial.uniforms.sunColor.value.copy(sunColorWithIntensity);
                
                // Calculer l'intensité des ombres proportionnellement à l'intensité de la lumière directionnelle
                const shadowIntensity = Math.max(0.1, Math.min(1.0, directionalLight.intensity));
                this.leavesMaterial.uniforms.receiveShadow.value = shadowIntensity;
            }
            
            if (ambientLight) {
                // Synchroniser avec la couleur et l'intensité exactes de la lumière ambiante
                const ambientColorWithIntensity = new THREE.Color()
                    .copy(ambientLight.color)
                    .multiplyScalar(ambientLight.intensity);
                
                this.leavesMaterial.uniforms.ambientLight.value.copy(ambientColorWithIntensity);
            }
        }
    }
    
    /**
     * Récupère la lumière directionnelle principale (soleil/lune) de la scène
     * @returns {THREE.DirectionalLight|null} La lumière directionnelle ou null si non trouvée
     * @private
     */
    _getMainDirectionalLight() {
        // Méthode 1: Utiliser la référence directe si disponible dans environment
        if (this.experience?.world?.environment) {
            // Essayer toutes les méthodes possibles
            const sunLight = this.experience.world.environment.getSunLight?.();
            if (sunLight) return sunLight;
            
            // Recherche par attributs directs
            if (this.experience.world.environment.sunLight) return this.experience.world.environment.sunLight;
            if (this.experience.world.environment.directionalLight) return this.experience.world.environment.directionalLight;
            if (this.experience.world.environment.moonLight) return this.experience.world.environment.moonLight;
            
            // Rechercher dans dayNightCycle s'il existe
            if (this.experience.world.environment.dayNightCycle) {
                if (typeof this.experience.world.environment.dayNightCycle.getSunLight === 'function') {
                    const dnCycleSunLight = this.experience.world.environment.dayNightCycle.getSunLight();
                    if (dnCycleSunLight) return dnCycleSunLight;
                }
                
                // Accès direct aux propriétés
                if (this.experience.world.environment.dayNightCycle.sunLight) {
                    return this.experience.world.environment.dayNightCycle.sunLight;
                }
                if (this.experience.world.environment.dayNightCycle.moonLight) {
                    return this.experience.world.environment.dayNightCycle.moonLight;
                }
                if (this.experience.world.environment.dayNightCycle.directionalLight) {
                    return this.experience.world.environment.dayNightCycle.directionalLight;
                }
            }
        }
        
        // Méthode 2: Chercher dans la scène entière
        if (this.experience?.scene) {
            let mainLight = null;
            let bestMatch = null;
            
            this.experience.scene.traverse((object) => {
                // Chercher une lumière directionnelle
                if (object.type === 'DirectionalLight') {
                    // Sauvegarder la première lumière trouvée comme fallback
                    if (!mainLight) mainLight = object;
                    
                    // Priorité aux lumières avec un nom significatif
                    const lowerName = object.name.toLowerCase();
                    if (lowerName.includes('sun') || lowerName.includes('directional')) {
                        bestMatch = object;
                    } else if (lowerName.includes('moon') && !bestMatch) {
                        bestMatch = object; // Priorité moindre pour la lune
                    }
                }
            });
            
            // Retourner la meilleure correspondance ou la première lumière trouvée
            return bestMatch || mainLight;
        }
        
        // Méthode 3: Créer une lumière par défaut si rien n'est trouvé
        console.warn("ShaderGrassInstancer: Aucune lumière directionnelle trouvée dans la scène, création d'une lumière par défaut");
        const defaultLight = new THREE.DirectionalLight(0xffffff, 1.0);
        defaultLight.position.set(0.5, 1, 0.5).normalize();
        defaultLight.name = "DefaultDirectionalLight";
        this.scene.add(defaultLight);
        return defaultLight;
    }
    
    /**
     * Récupère la lumière ambiante de la scène
     * @returns {THREE.AmbientLight|null} La lumière ambiante ou null si non trouvée
     * @private
     */
    _getAmbientLight() {
        // Méthode 1: Utiliser la référence directe si disponible dans environment
        if (this.experience?.world?.environment) {
            // Essayer toutes les méthodes possibles
            const ambientLight = this.experience.world.environment.getAmbientLight?.();
            if (ambientLight) return ambientLight;
            
            // Recherche par attributs directs
            if (this.experience.world.environment.ambientLight) return this.experience.world.environment.ambientLight;
            
            // Rechercher dans dayNightCycle s'il existe
            if (this.experience.world.environment.dayNightCycle) {
                if (typeof this.experience.world.environment.dayNightCycle.getAmbientLight === 'function') {
                    const dnCycleAmbLight = this.experience.world.environment.dayNightCycle.getAmbientLight();
                    if (dnCycleAmbLight) return dnCycleAmbLight;
                }
                
                // Accès direct aux propriétés
                if (this.experience.world.environment.dayNightCycle.ambientLight) {
                    return this.experience.world.environment.dayNightCycle.ambientLight;
                }
            }
        }
        
        // Méthode 2: Chercher dans la scène entière
        if (this.experience?.scene) {
            let ambientLight = null;
            
            this.experience.scene.traverse((object) => {
                if (object.type === 'AmbientLight') {
                    ambientLight = object;
                    return; // Sortir au premier AmbientLight trouvé
                }
            });
            
            if (ambientLight) return ambientLight;
        }
        
        // Méthode 3: Créer une lumière par défaut si rien n'est trouvé
        console.warn("ShaderGrassInstancer: Aucune lumière ambiante trouvée dans la scène, création d'une lumière par défaut");
        const defaultAmbient = new THREE.AmbientLight(0x303030, 0.3);
        defaultAmbient.name = "DefaultAmbientLight";
        this.scene.add(defaultAmbient);
        return defaultAmbient;
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
    }
    
    // Fonction pour ajuster le paramètre de force du vent
    setWindStrength(strength) {
        this.windStrength = strength;
        if (this.leavesMaterial && this.leavesMaterial.uniforms) {
            this.leavesMaterial.uniforms.windStrength.value = strength;
        }
    }
    
    /**
     * Définit la caméra pour l'instance
     * @param {THREE.Camera} camera - La caméra à utiliser
     */
    setCamera(camera) {
        this.camera = camera;
    }
} 