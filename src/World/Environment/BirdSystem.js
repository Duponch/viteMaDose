/**
 * Système d'oiseaux pour l'environnement
 * Basé sur l'exemple de Wakana Y.K. (https://codepen.io/wakana-k/pen/dyLGQEv)
 * Utilise la technique GPGPU pour des animations fluides et efficaces
 */
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// Constantes
const WIDTH = 32;
const BIRDS_COUNT_RATIO = 0.3;
const BIRDS_COUNT = Math.round(WIDTH * WIDTH * BIRDS_COUNT_RATIO);
const BOUNDS = 800;
const BOUNDS_HALF = BOUNDS / 2;

// Shaders
const positionShader = `
uniform float time;
uniform float delta;

void main() {

  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 tmpPos = texture2D(texturePosition, uv);
  vec3 position = tmpPos.xyz;
  vec3 velocity = texture2D(textureVelocity, uv).xyz;

  float phase = tmpPos.w;

  phase = mod((phase + delta +
    length(velocity.xz) * delta * 3. +
    max(velocity.y, 0.0) * delta * 6.), 62.83);

  gl_FragColor = vec4(position + velocity * delta * 15. , phase);

}`;

const velocityShader = `
uniform float time;
uniform float testing;
uniform float delta; // about 0.016
uniform float separationDistance; // 20
uniform float alignmentDistance; // 40
uniform float cohesionDistance;
uniform float speedLimit;
uniform float freedomFactor;
uniform vec3 predator;

const float width = resolution.x;
const float height = resolution.y;

const float PI = 3.141592653589793;
const float PI_2 = PI * 2.0;

float zoneRadius = 40.0;
float zoneRadiusSquared = 1600.0;

float separationThresh = 0.45;
float alignmentThresh = 0.65;

const float UPPER_BOUNDS = BOUNDS;
const float LOWER_BOUNDS = -UPPER_BOUNDS;

float rand(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {

  zoneRadius = separationDistance + alignmentDistance + cohesionDistance;
  separationThresh = separationDistance / zoneRadius;
  alignmentThresh = (separationDistance + alignmentDistance) / zoneRadius;
  zoneRadiusSquared = zoneRadius * zoneRadius;

  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 birdPosition, birdVelocity;

  vec3 selfPosition = texture2D(texturePosition, uv).xyz;
  vec3 selfVelocity = texture2D(textureVelocity, uv).xyz;

  float dist;
  vec3 dir; // direction
  float distSquared;

  float separationSquared = separationDistance * separationDistance;
  float cohesionSquared = cohesionDistance * cohesionDistance;

  float f;
  float percent;

  vec3 velocity = selfVelocity;

  float limit = speedLimit;
  
  dir = predator * UPPER_BOUNDS - selfPosition;
  dir.z = 0.;
  dist = length(dir);
  distSquared = dist * dist;

  float preyRadius = 150.0;
  float preyRadiusSq = preyRadius * preyRadius;

  // move birds away from predator
  if (dist < preyRadius) {
    f = (distSquared / preyRadiusSq - 1.0) * delta * 100.;
    velocity += normalize(dir) * f;
    limit += 5.0;
  }

  // Attract flocks to the center
  vec3 central = vec3(0., 0., 0.);
  dir = selfPosition - central;
  dist = length(dir);

  dir.y *= 2.5;
  velocity -= normalize(dir) * delta * 5.;

  for (float y=0.0;y<height;y++) {
    for (float x=0.0;x<width;x++) {

      vec2 ref = vec2(x + 0.5, y + 0.5) / resolution.xy;
      birdPosition = texture2D(texturePosition, ref).xyz;

      dir = birdPosition - selfPosition;
      dist = length(dir);

      if (dist < 0.0001) continue;

      distSquared = dist * dist;

      if (distSquared > zoneRadiusSquared) continue;

      percent = distSquared / zoneRadiusSquared;

      if (percent < separationThresh) { // low
        // Separation - Move apart for comfort
        f = (separationThresh / percent - 1.0) * delta;
        velocity -= normalize(dir) * f;
      } else if (percent < alignmentThresh) { // high
        // Alignment - fly the same direction
        float threshDelta = alignmentThresh - separationThresh;
        float adjustedPercent = (percent - separationThresh) / threshDelta;

        birdVelocity = texture2D(textureVelocity, ref).xyz;

        f = (0.5 - cos(adjustedPercent * PI_2) * 0.5 + 0.5) * delta;
        velocity += normalize(birdVelocity) * f;
      } else {
        // Attraction / Cohesion - move closer
        float threshDelta = 1.0 - alignmentThresh;
        float adjustedPercent = (percent - alignmentThresh) / threshDelta;

        f = (0.5 - (cos(adjustedPercent * PI_2) * -0.5 + 0.5)) * delta;

        velocity += normalize(dir) * f;
      }
    }
  }

  // Speed Limits
  if (length(velocity) > limit) {
    velocity = normalize(velocity) * limit;
  }

  gl_FragColor = vec4(velocity, 1.0);
}`;

const birdVS = `
attribute vec2 reference;
attribute float birdVertex;

attribute vec3 birdColor;

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;

varying vec4 vColor;
varying float z;

uniform float time;
uniform float birdSize;

void main() {
  vec4 tmpPos = texture2D(texturePosition, reference);
  vec3 pos = tmpPos.xyz;
  vec3 velocity = normalize(texture2D(textureVelocity, reference).xyz);

  vec3 newPosition = position;

  if (birdVertex == 4.0 || birdVertex == 7.0) {
    // flap wings
    newPosition.y = sin(tmpPos.w) * 5. * birdSize;
  }

  newPosition = mat3(modelMatrix) * newPosition;

  velocity.z *= -1.;
  float xz = length(velocity.xz);
  float xyz = 1.;
  float x = sqrt(1. - velocity.y * velocity.y);

  float cosry = velocity.x / xz;
  float sinry = velocity.z / xz;

  float cosrz = x / xyz;
  float sinrz = velocity.y / xyz;

  mat3 maty = mat3(
    cosry, 0, -sinry,
    0, 1, 0,
    sinry, 0, cosry
  );

  mat3 matz = mat3(
    cosrz, sinrz, 0,
    -sinrz, cosrz, 0,
    0, 0, 1
  );
  
  newPosition = maty * matz * newPosition;
  newPosition += pos;
  z = newPosition.z;

  vColor = vec4(birdColor, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(newPosition, 1.0);
}`;

const birdFS = `
varying vec4 vColor;
varying float z;
uniform vec3 color;

void main() {
  gl_FragColor = vec4(vColor.rgb, 1.0);
}`;

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
            color1: "paleturquoise",
            color2: "royalblue",
            colorMode: "lerpGradient",
            separation: 21,
            alignment: 20,
            cohesion: 20,
            freedom: 0.75,
            speedLimit: 10,
            birdSize: 1,
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
    initialize() {
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
        this.initBirds();
        
        // Ajouter le groupe à la scène
        this.scene.add(this.birdGroup);
        
        console.log(`Système d'oiseaux GPgPU initialisé avec ${BIRDS_COUNT} oiseaux potentiels`);
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
    initBirds() {
        const geometry = this.createBirdGeometry();
        
        // Matériel avec les shaders
        const material = new THREE.ShaderMaterial({
            uniforms: {
                birdSize: { value: this.config.birdSize },
                texturePosition: { value: null },
                textureVelocity: { value: null },
                time: { value: 1.0 },
                delta: { value: 0.0 }
            },
            vertexShader: birdVS,
            fragmentShader: birdFS,
            side: THREE.DoubleSide
        });
        
        // Créer le mesh
        this.birdMesh = new THREE.Mesh(geometry, material);
        this.birdMesh.rotation.y = Math.PI / 2;
        this.birdMesh.matrixAutoUpdate = false;
        this.birdMesh.updateMatrix();
        
        // Ajouter au groupe
        this.birdGroup.add(this.birdMesh);
    }
    
    /**
     * Crée la géométrie de l'oiseau
     */
    createBirdGeometry() {
        const geometry = new THREE.BufferGeometry();
        
        // Positions pour les triangles
        const verticesCount = 3 * 3 * BIRDS_COUNT;
        const positions = new Float32Array(verticesCount * 3);
        
        // Attributs pour la référence et le vertex
        const references = new Float32Array(verticesCount * 2);
        const birdColors = new Float32Array(verticesCount * 3);
        const birdVertex = new Float32Array(verticesCount);
        
        let v = 0;
        
        const birdSize = this.config.birdSize;
        const wingSpan = this.config.wingSpan;
        
        // Créer chaque oiseau
        for (let f = 0; f < BIRDS_COUNT; f++) {
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
            const colorRatio = birdIndex / BIRDS_COUNT;
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
        if (this.birdMesh) {
            this.birdMesh.material.uniforms.texturePosition.value = 
                this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
            this.birdMesh.material.uniforms.textureVelocity.value = 
                this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
            this.birdMesh.material.uniforms.time.value = performance.now() / 1000;
            this.birdMesh.material.uniforms.delta.value = delta;
        }
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
            // Ici, nous utilisons l'échelle pour simuler la densité
            // Une autre approche pourrait être de modifier le BIRDS_COUNT_RATIO
            const scale = this._birdDensity;
            this.birdMesh.scale.set(scale, scale, scale);
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