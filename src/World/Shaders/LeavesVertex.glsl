precision mediump float;

uniform float time;
uniform float intensity;
uniform float windSpeed;
uniform float leaveHeight;
uniform float leafMinHeight;
uniform vec3 cameraForward;
uniform float rotationFactor;

// Nouveaux uniforms pour paramétrer l'animation
uniform float xMovementAmplitude;
uniform float zMovementAmplitude;
uniform float spiralFactor;
uniform float verticalSpeedFactor;
uniform float yOffsetAmplitude;
uniform float gustEffectAmplitude;
uniform float windStrengthFactor;

attribute float size;
attribute float velocity;
attribute float angle;
attribute float offset;
attribute float rotation;

varying float vSize;
varying float vDistance;
varying float vRotation;
varying vec2 vUv;

// Fonction d'interpolation pour créer des mouvements plus organiques
float easeInOutSine(float x) {
    return -(cos(3.14159 * x) - 1.0) / 2.0;
}

void main() {
    // Paramètres de la feuille
    vSize = size;
    vRotation = rotation + time * rotationFactor * velocity;
    
    // Position de base
    vec3 basePos = position;
    
    // Animation de mouvement avec effet de vent variable
    float windEffect = windSpeed * velocity * (1.0 + intensity * 0.5);
    // Ajout d'un décalage aléatoire à la vitesse et direction pour plus de réalisme
    float randomFactor = fract(sin(dot(vec2(basePos.x, basePos.z), vec2(12.9898, 78.233))) * 43758.5453);
    windEffect *= (0.8 + 0.4 * randomFactor);
    
    // Temps personnalisé pour chaque feuille
    float customTime = time + offset * 10.0;
    
    // Création de trajectoires chaotiques avec différentes fréquences et amplitudes
    // Mouvement horizontal beaucoup plus important (X et Z) - Amplitudes paramétrables
    float xMovement = sin(customTime * 0.5) * xMovementAmplitude + cos(customTime * 0.33) * (xMovementAmplitude * 0.7) + sin(customTime * 0.17) * (xMovementAmplitude * 0.4);
    float zMovement = cos(customTime * 0.4) * zMovementAmplitude + sin(customTime * 0.28) * (zMovementAmplitude * 0.9) + cos(customTime * 0.22) * (zMovementAmplitude * 0.6);
    
    // Ajout de mouvements en spirale horizontaux plus prononcés
    float spiralFactorValue = sin(customTime * 0.15) * spiralFactor + (spiralFactor * 0.5);
    float spiralX = sin(customTime * 0.4) * spiralFactorValue * 6.0;
    float spiralZ = cos(customTime * 0.4) * spiralFactorValue * 6.0;
    
    // Mouvement vertical réduit et moins dominant
    float verticalSpeed = windEffect * (verticalSpeedFactor + 0.1 * sin(customTime * 0.1));
    float yOffset = sin(customTime * 0.3) * yOffsetAmplitude;
    
    // Position verticale avec mouvement naturel autour de la position de base
    float baseY = position.y;
    // Si la feuille est cachée (position Y très négative), utiliser une position aléatoire
    // avec une forte préférence pour les positions basses
    if (baseY < -1000.0) {
        float heightFactor = pow(randomFactor, 3.0); // Utiliser le cube pour concentrer près du sol
        baseY = leafMinHeight + heightFactor * (leaveHeight - leafMinHeight);
    }
    // Réduire l'amplitude du mouvement vertical près du sol
    float heightRatio = (baseY - leafMinHeight) / (leaveHeight - leafMinHeight);
    float verticalAmplitude = mix(0.5, 1.0, heightRatio); // Moins de mouvement près du sol
    float verticalMovement = sin(customTime * 0.2) * verticalSpeed * 2.0 * verticalAmplitude;
    float yPos = baseY + verticalMovement + yOffset * verticalAmplitude;
    
    // Assurer une forte tendance à rester près du sol
    float groundAttraction = 1.0 - pow(heightRatio, 2.0); // Force qui tire vers le sol
    yPos = mix(yPos, leafMinHeight, groundAttraction * 0.1); // Légère attraction vers le sol
    
    // Limiter la hauteur des feuilles en prenant en compte la hauteur minimale
    yPos = clamp(yPos, leafMinHeight, leaveHeight);
    
    // Ajouter un effet de rafale de vent aléatoire plus fort horizontalement
    float gustEffect = smoothstep(0.0, 1.0, sin(customTime * 0.05 + randomFactor * 6.28) * 0.5 + 0.5);
    float gustX = cos(angle) * gustEffect * gustEffectAmplitude * intensity;
    float gustZ = sin(angle) * gustEffect * gustEffectAmplitude * intensity;
    
    // Ajouter un déplacement latéral plus prononcé basé sur la direction du vent
    vec2 windDirection = vec2(cameraForward.x, cameraForward.z);
    float windStrength = length(windDirection) * windStrengthFactor;
    vec2 normalizedWind = length(windDirection) > 0.01 ? normalize(windDirection) : vec2(1.0, 0.0);
    float windX = normalizedWind.x * windStrength * (0.5 + 0.5 * sin(customTime * 0.12));
    float windZ = normalizedWind.y * windStrength * (0.5 + 0.5 * cos(customTime * 0.14));
    
    // Position finale combinant tous les mouvements avec priorité à l'horizontal
    vec3 finalPos = vec3(
        basePos.x + (xMovement + spiralX + gustX + windX) * intensity,
        yPos,
        basePos.z + (zMovement + spiralZ + gustZ + windZ) * intensity
    );
    
    // Position et taille dans l'espace caméra
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    
    // Calculer la distance à la caméra pour l'effet de brouillard
    vDistance = length(mvPosition.xyz);
    
    // Appliquer la taille en fonction de la distance et de l'intensité
    float sizeBoost = 1.0 + intensity * 0.5;
    float pointSize = size * sizeBoost * (300.0 / vDistance);
    
    // Coordonnées UV pour orienter la texture
    vUv = vec2(0.5, 0.5);
    
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
} 