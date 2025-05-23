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
    
    // Position de base
    vec3 basePos = position;
    
    // Animation de chute
    float fallSpeed = rainSpeed * velocity * (1.0 + (intensity - 1.0) * speedIntensityFactor);
    // Ajout d'un léger décalage aléatoire à la vitesse pour plus de réalisme
    fallSpeed *= (0.9 + 0.2 * fract(sin(dot(vec2(basePos.x, basePos.z), vec2(12.9898, 78.233))) * 43758.5453));
    float yPos = mod(basePos.y - time * fallSpeed + offset, rainHeight) - rainHeight * 0.5;
    
    // Position finale
    vec3 finalPos = vec3(
        basePos.x,
        yPos,
        basePos.z
    );
    
    // Si intensité est 0, cacher les gouttes
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
    
    // Appliquer la taille en fonction de la distance et de l'intensité
    float sizeBoost = 1.0 + intensity * 0.5;
    float pointSize = size * sizeBoost * (300.0 / vDistance); // Adapter taille à la distance
    
    // Coordonnées UV pour orienter la texture
    vUv = vec2(0.5, 0.5);
    
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
} 