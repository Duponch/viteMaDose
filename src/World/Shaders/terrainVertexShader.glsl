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

// Couleurs du terrain
uniform vec3 uGrassColor;
uniform vec3 uRockColor;
uniform vec3 uSnowColor;

// Variables à passer au fragment shader
varying vec3 vPosition;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vColor;

void main() {
    // Nous utilisons directement la position calculée par Three.js
    vec3 pos = position;
    
    // Passer la position et normale au fragment shader
    vPosition = pos;
    vNormal = normal;
    vHeight = pos.y;
    
    // Assignation de couleur plus directe pour le diagnostic
    // Utiliser des couleurs vives par défaut au cas où les uniforms ne sont pas définis
    vec3 grassColor = uGrassColor;
    vec3 rockColor = uRockColor;
    vec3 snowColor = uSnowColor;
    
    // Valeurs de secours au cas où les uniformes ne sont pas définis
    if (length(grassColor) < 0.1) grassColor = vec3(0.0, 0.8, 0.0);
    if (length(rockColor) < 0.1) rockColor = vec3(0.5, 0.3, 0.2);
    if (length(snowColor) < 0.1) snowColor = vec3(1.0, 1.0, 1.0);
    
    // Déterminer la couleur en fonction de la hauteur
    vec3 terrainColor = grassColor;  // Couleur par défaut
    
    // Transition vers la roche
    if (pos.y >= uRockHeight) {
        terrainColor = rockColor;
    }
    
    // Transition vers la neige
    if (pos.y >= uSnowHeight) {
        terrainColor = snowColor;
    }
    
    // Légère variation par facette pour un effet low poly
    float variation = (normal.x + normal.z) * 0.1;
    terrainColor = terrainColor * (1.0 + variation);
    
    vColor = terrainColor;
    
    // Position finale calculée par Three.js
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
} 