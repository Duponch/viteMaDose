/**
 * Système d'oiseaux pour l'environnement
 * Basé sur l'exemple de Wakana Y.K. (https://codepen.io/wakana-k/pen/dyLGQEv)
 * Utilise la technique GPGPU pour des animations fluides et efficaces
 */
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// Constantes
const WIDTH = 32;
const MAX_BIRDS_COUNT_RATIO = 1.0; // Ratio maximum pour le calcul du nombre d'oiseaux (100%)
const MIN_BIRDS_COUNT_RATIO = 0.0; // Ratio minimum pour le calcul du nombre d'oiseaux (0%)
const MAX_BIRDS_COUNT = Math.round(WIDTH * WIDTH * MAX_BIRDS_COUNT_RATIO);
const BOUNDS = 800;
const BOUNDS_HALF = BOUNDS / 2;

export default class BirdSystem {
    /**
     * @param {Object} environmentSystem - Référence au système d'environnement principal
     */
    constructor(environmentSystem) {
        this.environmentSystem = environmentSystem;
        this.scene = environmentSystem.scene;
        this.renderer = environmentSystem.experience.renderer.instance;
        
        // Configuration
        this._birdDensity = 0.5; // Densité initiale des oiseaux (0-1)
        
        // Paramètres de configuration des oiseaux
        this.config = {
            color1: "#333333",
            color2: "#111111",
            colorMode: "lerpGradient",
            separation: 21,
            alignment: 20,
            cohesion: 20,
            freedom: 0.75,
            speedLimit: 10,
            birdSize: 0.4,
            wingSpan: 20
        };
        
        // Variables pour le mouvement
        this.predatorPosition = new THREE.Vector3();
        this.mouseX = 0;
        this.mouseY = 0;
        
        // Groupe pour les oiseaux
        this.birdGroup = new THREE.Group();
        this.birdGroup.name = "EnvironmentBirdSystem";
        
        // Initialisation
        this.initialize();
    }
    
    /**
     * Initialise le système d'oiseaux
     */
    async initialize() {
        try {
            // Chargement des shaders
            const [vertexResponse, fragmentResponse, positionResponse, velocityResponse] = await Promise.all([
                fetch('src/World/Shaders/birdVertex.glsl'),
                fetch('src/World/Shaders/birdFragment.glsl'),
                fetch('src/World/Shaders/birdPositionShader.glsl'),
                fetch('src/World/Shaders/birdVelocityShader.glsl')
            ]);
            
            if (!vertexResponse.ok || !fragmentResponse.ok || !positionResponse.ok || !velocityResponse.ok) {
                throw new Error(`Erreur chargement shaders: VS=${vertexResponse.status}, FS=${fragmentResponse.status}, PS=${positionResponse.status}, VS=${velocityResponse.status}`);
            }
            
            const vertexShader = await vertexResponse.text();
            const fragmentShader = await fragmentResponse.text();
            const positionShader = await positionResponse.text();
            const velocityShader = await velocityResponse.text();
            
            // Créer le rendu GPU
            this.gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, this.renderer);
            
            if (!this.renderer.capabilities.isWebGL2) {
                this.gpuCompute.setDataType(THREE.HalfFloatType);
            }
            
            // Textures pour les positions et vitesses
            const dtPosition = this.gpuCompute.createTexture();
            const dtVelocity = this.gpuCompute.createTexture();
            
            // Initialiser les textures
            this.initPositionTexture(dtPosition);
            this.initVelocityTexture(dtVelocity);
            
            // Variables pour le rendu GPU
            this.velocityVariable = this.gpuCompute.addVariable("textureVelocity", velocityShader, dtVelocity);
            this.positionVariable = this.gpuCompute.addVariable("texturePosition", positionShader, dtPosition);
            
            // Définir les dépendances
            this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
            this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
            
            // Uniforms pour les variables
            this.positionUniforms = this.positionVariable.material.uniforms;
            this.velocityUniforms = this.velocityVariable.material.uniforms;
            
            this.positionUniforms["time"] = { value: 0.0 };
            this.positionUniforms["delta"] = { value: 0.0 };
            this.velocityUniforms["time"] = { value: 1.0 };
            this.velocityUniforms["delta"] = { value: 0.0 };
            this.velocityUniforms["testing"] = { value: 1.0 };
            this.velocityUniforms["separationDistance"] = { value: this.config.separation };
            this.velocityUniforms["alignmentDistance"] = { value: this.config.alignment };
            this.velocityUniforms["cohesionDistance"] = { value: this.config.cohesion };
            this.velocityUniforms["freedomFactor"] = { value: this.config.freedom };
            this.velocityUniforms["speedLimit"] = { value: this.config.speedLimit };
            this.velocityUniforms["predator"] = { value: this.predatorPosition };
            
            // Définir les limites
            this.velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed(2);
            
            // Initialiser le calcul GPU
            this.gpuCompute.init();
            
            // Créer la géométrie des oiseaux
            this.initBirds(vertexShader, fragmentShader);
            
            // Ajouter le groupe à la scène
            this.scene.add(this.birdGroup);
            
            console.log(`Système d'oiseaux GPgPU initialisé avec ${MAX_BIRDS_COUNT} oiseaux potentiels`);
        } catch (error) {
            console.error("Erreur lors de l'initialisation du système d'oiseaux:", error);
        }
    }
    
    /**
     * Initialise la texture des positions
     */
    initPositionTexture(texture) {
        const textureArray = texture.image.data;
        
        for (let i = 0; i < textureArray.length; i += 4) {
            const x = Math.random() * BOUNDS - BOUNDS_HALF;
            const y = Math.random() * BOUNDS - BOUNDS_HALF;
            const z = Math.random() * BOUNDS - BOUNDS_HALF;
            
            textureArray[i + 0] = x;
            textureArray[i + 1] = y;
            textureArray[i + 2] = z;
            textureArray[i + 3] = 1; // Phase
        }
    }
    
    /**
     * Initialise la texture des vitesses
     */
    initVelocityTexture(texture) {
        const textureArray = texture.image.data;
        
        for (let i = 0; i < textureArray.length; i += 4) {
            const x = Math.random() - 0.5;
            const y = Math.random() - 0.5;
            const z = Math.random() - 0.5;
            
            textureArray[i + 0] = x * 10;
            textureArray[i + 1] = y * 10;
            textureArray[i + 2] = z * 10;
            textureArray[i + 3] = 1;
        }
    }
    
    /**
     * Initialise les oiseaux
     */
    initBirds(vertexShader, fragmentShader) {
        const geometry = this.createBirdGeometry();
        
        // Matériel avec les shaders
        const material = new THREE.ShaderMaterial({
            uniforms: {
                birdSize: { value: this.config.birdSize },
                texturePosition: { value: null },
                textureVelocity: { value: null },
                time: { value: 1.0 },
                delta: { value: 0.0 },
                ambientLightIntensity: { value: 0.5 },
                sunDirection: { value: new THREE.Vector3(0, 1, 0) },
                sunIntensity: { value: 0.0 },
                fogColor: { value: new THREE.Color(0, 0, 0) },
                fogDensity: { value: 0.0 },
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
            depthTest: true,
            alphaTest: 0.5,
            fog: true
        });
        
        // Créer le mesh
        this.birdMesh = new THREE.Mesh(geometry, material);
        this.birdMesh.rotation.y = Math.PI / 2;
        this.birdMesh.matrixAutoUpdate = false;
        this.birdMesh.updateMatrix();
        
        // Désactiver le culling et ajuster les paramètres de rendu
        this.birdMesh.frustumCulled = false;
        this.birdMesh.renderOrder = 0; // Rendre les oiseaux avant les nuages 
        
        // Ajouter au groupe
        this.birdGroup.add(this.birdMesh);
    }
    
    /**
     * Crée la géométrie de l'oiseau
     */
    createBirdGeometry() {
        const geometry = new THREE.BufferGeometry();
        
        // Positions pour les triangles
        const verticesCount = 3 * 3 * MAX_BIRDS_COUNT;
        const positions = new Float32Array(verticesCount * 3);
        
        // Attributs pour la référence et le vertex
        const references = new Float32Array(verticesCount * 2);
        const birdColors = new Float32Array(verticesCount * 3);
        const birdVertex = new Float32Array(verticesCount);
        
        let v = 0;
        
        const birdSize = this.config.birdSize;
        const wingSpan = this.config.wingSpan;
        
        // Créer chaque oiseau
        for (let f = 0; f < MAX_BIRDS_COUNT; f++) {
            // Corps
            positions[v * 3 + 0] = 0;
            positions[v * 3 + 1] = -0;
            positions[v * 3 + 2] = -20 * birdSize;
            
            positions[v * 3 + 3] = 0;
            positions[v * 3 + 4] = 4 * birdSize;
            positions[v * 3 + 5] = -20 * birdSize;
            
            positions[v * 3 + 6] = 0;
            positions[v * 3 + 7] = 0;
            positions[v * 3 + 8] = 30 * birdSize;
            
            // Aile gauche
            positions[v * 3 + 9] = 0;
            positions[v * 3 + 10] = 0;
            positions[v * 3 + 11] = -15 * birdSize;
            
            positions[v * 3 + 12] = -wingSpan * birdSize;
            positions[v * 3 + 13] = 0;
            positions[v * 3 + 14] = 0;
            
            positions[v * 3 + 15] = 0;
            positions[v * 3 + 16] = 0;
            positions[v * 3 + 17] = 15 * birdSize;
            
            // Aile droite
            positions[v * 3 + 18] = 0;
            positions[v * 3 + 19] = 0;
            positions[v * 3 + 20] = 15 * birdSize;
            
            positions[v * 3 + 21] = wingSpan * birdSize;
            positions[v * 3 + 22] = 0;
            positions[v * 3 + 23] = 0;
            
            positions[v * 3 + 24] = 0;
            positions[v * 3 + 25] = 0;
            positions[v * 3 + 26] = -15 * birdSize;
            
            v += 9;
        }
        
        // Remplir les références, couleurs et indices des vertex
        const colorsMap = {};
        
        for (let i = 0; i < verticesCount; i++) {
            const birdIndex = Math.floor(i / 9);
            const x = (birdIndex % WIDTH) / WIDTH;
            const y = Math.floor(birdIndex / WIDTH) / WIDTH;
            
            // Référence pour la texture
            references[i * 2] = x;
            references[i * 2 + 1] = y;
            
            // Indice du sommet (0-8 en boucle)
            birdVertex[i] = i % 9;
            
            // Couleur de l'oiseau (basée sur l'index)
            const colorRatio = birdIndex / MAX_BIRDS_COUNT;
            const color = this.getBirdColor(colorRatio, colorsMap);
            
            birdColors[i * 3 + 0] = color.r;
            birdColors[i * 3 + 1] = color.g;
            birdColors[i * 3 + 2] = color.b;
        }
        
        // Définir les attributs du buffer
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('birdColor', new THREE.BufferAttribute(birdColors, 3));
        geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));
        geometry.setAttribute('birdVertex', new THREE.BufferAttribute(birdVertex, 1));
        
        // Mise à l'échelle
        geometry.scale(0.2, 0.2, 0.2);
        
        return geometry;
    }
    
    /**
     * Obtient la couleur d'un oiseau en fonction de son index
     */
    getBirdColor(colorRatio, colorsMap) {
        const colorMode = this.config.colorMode;
        const color1 = new THREE.Color(this.config.color1);
        const color2 = new THREE.Color(this.config.color2);
        
        // Différents modes pour générer les couleurs
        let sampleValue, color;
        
        sampleValue = colorMode.indexOf("Gradient") !== -1 ? Math.random() : colorRatio;
        
        if (colorMode.indexOf("variance") === 0) {
            // Mode variance: couleurs aléatoires basées sur la palette
            const r = THREE.MathUtils.clamp(0, color1.r + Math.random() * color2.r, 1);
            const g = THREE.MathUtils.clamp(0, color1.g + Math.random() * color2.g, 1);
            const b = THREE.MathUtils.clamp(0, color1.b + Math.random() * color2.b, 1);
            color = new THREE.Color(r, g, b);
        } else if (colorMode.indexOf("mix") === 0) {
            // Mode mix: mélange des couleurs
            color = new THREE.Color().set(this.config.color1).lerp(new THREE.Color().set(this.config.color2), sampleValue);
        } else {
            // Mode par défaut: interpolation
            color = color1.clone().lerp(color2, sampleValue);
        }
        
        // Stocker la couleur en cache pour la réutiliser si ce n'est pas un dégradé
        if (colorMode.indexOf("Gradient") === -1) {
            const key = colorRatio.toString();
            if (!colorsMap[key]) {
                colorsMap[key] = color;
            } else {
                color = colorsMap[key];
            }
        }
        
        return color;
    }
    
    /**
     * Met à jour le système d'oiseaux
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.birdMesh) return;

        // Mise à jour de l'intensité de la lumière ambiante
        const ambientLightIntensity = this.environmentSystem.getAmbientLightIntensity();
        this.birdMesh.material.uniforms.ambientLightIntensity.value = ambientLightIntensity;

        // Mise à jour de la lumière du soleil
        const sunLight = this.environmentSystem.getSunLight();
        if (sunLight) {
            this.birdMesh.material.uniforms.sunDirection.value.copy(sunLight.position).normalize();
            this.birdMesh.material.uniforms.sunIntensity.value = sunLight.visible ? sunLight.intensity : 0.0;
        }

        // Mise à jour des paramètres du brouillard
        const fog = this.environmentSystem.getFog();
        if (fog) {
            this.birdMesh.material.uniforms.fogColor.value.copy(fog.color);
            this.birdMesh.material.uniforms.fogDensity.value = fog.density;
        } else {
            // Si pas de brouillard, désactiver l'effet
            this.birdMesh.material.uniforms.fogDensity.value = 0;
        }

        // Convertir deltaTime en secondes
        const delta = deltaTime / 1000;
        
        // Mettre à jour le prédateur (position de la souris)
        this.velocityUniforms["predator"].value.set(
            this.predatorPosition.x,
            this.predatorPosition.y,
            this.predatorPosition.z
        );
        
        // Mettre à jour les paramètres de temps
        this.positionUniforms["time"].value = performance.now() / 1000;
        this.positionUniforms["delta"].value = delta;
        this.velocityUniforms["time"].value = performance.now() / 1000;
        this.velocityUniforms["delta"].value = delta;
        
        // Exécuter le calcul GPU
        this.gpuCompute.compute();
        
        // Mettre à jour les textures dans le matériau
        this.birdMesh.material.uniforms.texturePosition.value = 
            this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
        this.birdMesh.material.uniforms.textureVelocity.value = 
            this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
    }
    
    /**
     * Met à jour les paramètres du prédateur en fonction des coordonnées de la souris
     * @param {number} x - Coordonnée X de la souris
     * @param {number} y - Coordonnée Y de la souris
     */
    updatePredator(x, y) {
        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;
        this.predatorPosition.set((0.5 * x) / halfWidth, (-0.5 * y) / halfHeight, 0);
    }
    
    /**
     * Définit la densité des oiseaux
     * @param {number} density - Densité des oiseaux (0-1)
     */
    set birdDensity(density) {
        this._birdDensity = THREE.MathUtils.clamp(density, 0, 1);
        
        // Ajuster la visibilité en fonction de la densité
        if (this.birdMesh) {
            // Calculer le nombre d'oiseaux basé sur la densité
            const actualRatio = MIN_BIRDS_COUNT_RATIO + this._birdDensity * (MAX_BIRDS_COUNT_RATIO - MIN_BIRDS_COUNT_RATIO);
            const visibleBirdsCount = Math.round(WIDTH * WIDTH * actualRatio);
            
            // Mettre à jour l'attribut d'instance pour contrôler les oiseaux visibles
            const geometry = this.birdMesh.geometry;
            const vertices = geometry.attributes.position.count;
            const indices = new Uint16Array(vertices);
            
            // Calculer le nombre de triangles visibles basés sur la densité
            const totalBirdVertices = 9; // 3 triangles par oiseau avec 3 sommets par triangle
            const totalVisibleVertices = visibleBirdsCount * totalBirdVertices;
            
            // Rendre visible seulement les oiseaux que nous voulons afficher
            for (let i = 0; i < vertices; i++) {
                if (i < totalVisibleVertices) {
                    indices[i] = i;
                } else {
                    // Masquer les autres oiseaux en utilisant un indice hors limites (0)
                    indices[i] = 0;
                }
            }
            
            // Mettre à jour la géométrie
            if (!geometry.index) {
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));
            } else {
                geometry.index.set(indices);
                geometry.index.needsUpdate = true;
            }
            
            console.log(`Densité d'oiseaux mise à jour: ${this._birdDensity.toFixed(2)}, ${visibleBirdsCount} oiseaux visibles`);
        }
    }
    
    /**
     * Obtient la densité actuelle des oiseaux
     * @returns {number} Densité des oiseaux (0-1)
     */
    get birdDensity() {
        return this._birdDensity ?? 0.5;
    }
    
    /**
     * Nettoie les ressources du système d'oiseaux
     */
    destroy() {
        if (this.birdMesh) {
            this.birdGroup.remove(this.birdMesh);
            this.birdMesh.geometry.dispose();
            this.birdMesh.material.dispose();
            this.birdMesh = null;
        }
        
        // Supprimer le groupe de la scène
        if (this.birdGroup.parent) {
            this.birdGroup.parent.remove(this.birdGroup);
        }
        
        // Nettoyer le GPU Compute
        if (this.gpuCompute) {
            this.gpuCompute = null;
        }
    }
} 