precision mediump float;

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
varying vec3 vWorldPosition;
varying vec3 vViewPosition;

void main() {
    // Paramètres de la goutte
    vSize = size;
    
    // Position de base du vertex
    vec3 basePos = position;
    
    // Animation de chute - appliquer le même déplacement à tous les vertices d'un quad
    float fallSpeed = rainSpeed * velocity * (1.0 + (intensity - 1.0) * speedIntensityFactor);
    // Ajout d'un léger décalage aléatoire à la vitesse pour plus de réalisme
    fallSpeed *= (0.9 + 0.2 * fract(sin(dot(vec2(basePos.x, basePos.z), vec2(12.9898, 78.233))) * 43758.5453));
    
    // Calculer le déplacement Y pour l'animation de chute
    float yDisplacement = mod(-time * fallSpeed + offset, rainHeight);
    
    // Appliquer le déplacement Y à la position du vertex
    vec3 finalPos = vec3(
        basePos.x,
        basePos.y + yDisplacement,
        basePos.z
    );
    
    // Si intensité est 0, cacher les fils d'eau
    if (intensity < 0.01) {
        finalPos.y = -1000.0;
    }
    
    // Position dans l'espace monde (nécessaire pour l'éclairage)
    vec4 worldPosition = modelMatrix * vec4(finalPos, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // Position et taille dans l'espace caméra
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    vViewPosition = mvPosition.xyz;
    vDistance = -mvPosition.z;
    
    // Passer les coordonnées UV du mesh (définies lors de la création du quad)
    vUv = uv;
    
    gl_Position = projectionMatrix * mvPosition;
} 