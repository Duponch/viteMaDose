uniform float uFlatRadius;
uniform float uTransitionWidth;
uniform float uHillAmplitude;
uniform float uTerrainVisibleRadius;
uniform float uRockHeight;
uniform float uSnowHeight;

// Variables pour le noise
uniform float uNoiseScale1;
uniform float uNoiseScale2;
uniform float uOctave1Weight;
uniform float uOctave2Weight;

// Variables à passer au fragment shader
varying vec3 vPosition;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vColor;

// Couleurs du terrain
uniform vec3 uGrassColor;
uniform vec3 uRockColor;
uniform vec3 uSnowColor;

void main() {
    vec3 pos = position;
    
    // Calculer la distance depuis le centre
    float dist = length(position.xz);
    
    // Calculer la hauteur (vient déjà du modèle)
    
    // Déterminer la couleur en fonction de la hauteur
    vec3 terrainColor;
    
    // Couleur herbe par défaut
    terrainColor = uGrassColor;
    
    // Transition vers la roche
    if (pos.y >= uRockHeight) {
        terrainColor = uRockColor;
    }
    
    // Transition vers la neige
    if (pos.y >= uSnowHeight) {
        terrainColor = uSnowColor;
    }
    
    // Ajout de variation par facette pour un effet low poly
    // On utilise la normale pour ajouter une légère variation par facette
    float variation = (vNormal.x + vNormal.z) * 0.1;
    terrainColor = terrainColor * (1.0 + variation);
    
    // Passer les valeurs nécessaires au fragment shader
    vPosition = pos;
    vNormal = normal;
    vHeight = pos.y;
    vColor = terrainColor;
    
    // Position finale
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
} 