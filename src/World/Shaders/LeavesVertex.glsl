precision mediump float;

uniform float time;
uniform float intensity;
uniform float windSpeed;
uniform float leaveHeight;
uniform vec3 cameraForward;
uniform float rotationFactor;

attribute float size;
attribute float velocity;
attribute float angle;
attribute float offset;
attribute float rotation;

varying float vSize;
varying float vDistance;
varying float vRotation;
varying vec2 vUv;

void main() {
    // Paramètres de la feuille
    vSize = size;
    vRotation = rotation + time * rotationFactor * velocity;
    
    // Position de base
    vec3 basePos = position;
    
    // Animation de mouvement
    float windEffect = windSpeed * velocity * (1.0 + intensity * 0.5);
    // Ajout d'un décalage aléatoire à la vitesse et direction pour plus de réalisme
    windEffect *= (0.8 + 0.4 * fract(sin(dot(vec2(basePos.x, basePos.z), vec2(12.9898, 78.233))) * 43758.5453));
    
    // Mouvement sinusoïdal pour simuler des feuilles qui volent
    float xOffset = sin(time * 0.5 + offset * 6.28) * 2.0 * intensity;
    float zOffset = cos(time * 0.7 + offset * 6.28) * 2.0 * intensity;
    float yPos = mod(basePos.y + time * windEffect * 0.5 + offset, leaveHeight) - leaveHeight * 0.5;
    
    // Position finale avec mouvements en spirale
    vec3 finalPos = vec3(
        basePos.x + xOffset * intensity,
        yPos,
        basePos.z + zOffset * intensity
    );
    
    // Si intensité est 0, cacher les feuilles
    if (intensity < 0.01) {
        finalPos.y = -1000.0;
    }
    
    // Position et taille dans l'espace caméra
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    
    // Calculer la distance à la caméra pour l'effet de brouillard
    // Utiliser la distance euclidienne complète pour un brouillard plus réaliste
    vDistance = length(mvPosition.xyz);
    
    // Appliquer la taille en fonction de la distance et de l'intensité
    float sizeBoost = 1.0 + intensity * 0.5;
    float pointSize = size * sizeBoost * (300.0 / vDistance); // Adapter taille à la distance
    
    // Coordonnées UV pour orienter la texture
    vUv = vec2(0.5, 0.5);
    
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
} 