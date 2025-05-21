varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec4 vWorldPosition_forShadows;

uniform float time;
uniform float windStrength;
uniform mat4 shadowMatrix;
uniform vec2 windDirection; // Direction du vent normalisée (x, z)
uniform float inclinationStrength; // Nouvelle uniform pour l'inclinaison globale
uniform vec2 inclinationDirection; // Direction de l'inclinaison

// Activation des lumières
#define USE_LIGHTS

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
  
  // VERTEX POSITION
  vec4 mvPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  
  // Calcul des facteurs de hauteur
  float heightFactor = uv.y; // 0 à la base, 1 au sommet
  float tiltPower = tiltCurve(heightFactor); // Pour l'inclinaison
  float bendPower = bendCurve(heightFactor); // Pour la courbure
  
  // Bruit de vent avec plusieurs fréquences
  float windTime = time * 1.2; // Vitesse du vent plus lente pour un effet plus constant
  float windNoiseValue = windNoise(windTime + mvPosition.x * 0.1 + mvPosition.z * 0.1);
  
  // Nouveau: Appliquer l'inclinaison globale (qui couche progressivement l'herbe sur le sol)
  if (inclinationStrength > 0.0 && heightFactor > 0.0) {
    // Normaliser la direction d'inclinaison
    vec2 normalizedInclinationDir = normalize(inclinationDirection);
    
    // Hauteur initiale du point (avant inclinaison)
    float originalHeight = mvPosition.y;
    
    // Calculer l'angle d'inclinaison basé sur la force (0 à 90 degrés)
    // 0 = vertical, 1 = couché sur le sol (90 degrés)
    float maxAngle = 1.5707; // 90 degrés en radians
    float inclinationAngle = inclinationStrength * maxAngle;
    
    // La longueur du brin d'herbe depuis sa base jusqu'à ce point
    float distanceFromBase = heightFactor * 1.5; // 1.5 est la hauteur maximale du brin
    
    // Calcul du déplacement horizontal (plus le brin s'incline, plus le déplacement est important)
    float horizontalDisplacement = sin(inclinationAngle) * distanceFromBase;
    
    // Nouvelle hauteur après inclinaison (préserve la longueur du brin)
    float newHeight = cos(inclinationAngle) * distanceFromBase;
    
    // Appliquer le déplacement horizontal dans la direction d'inclinaison
    // et ajuster la hauteur pour ne pas traverser le sol
    if (heightFactor > 0.01) { // Ne pas modifier la base du brin
      // Déplacement horizontal dans la direction d'inclinaison
      mvPosition.x += normalizedInclinationDir.x * horizontalDisplacement;
      mvPosition.z += normalizedInclinationDir.y * horizontalDisplacement;
      
      // Ajuster la hauteur (Y) en préservant la longueur du brin
      // et en empêchant qu'il descende sous le niveau du sol
      float baseHeight = mvPosition.y - originalHeight; // Hauteur de la base du brin
      mvPosition.y = max(baseHeight, baseHeight + newHeight); // Empêche de descendre sous le sol
    }
  }
  
  // 1. Effet d'inclinaison constant (le brin reste incliné)
  vec2 baseTilt = windDirection * 2.0; // Inclinaison de base constante
  vec2 tiltEffect = baseTilt + (windDirection * windNoiseValue * tiltPower * windStrength * 2.0);
  
  // 2. Effet de courbure (le brin se courbe sous son propre poids)
  float bendAmount = length(tiltEffect) * bendPower;
  vec2 bendEffect = windDirection * bendAmount * windStrength;
  
  // Combiner les effets avec une pondération différente
  vec2 totalDisplacement = tiltEffect * 1.5 + bendEffect * 1.0;
  
  // Appliquer l'inclinaison et la courbure
  mvPosition.x += totalDisplacement.x;
  mvPosition.z += totalDisplacement.y;
  
  // Effet de compression très prononcé
  float compressionFactor = 1.0 - (windNoiseValue * 0.6 * heightFactor * windStrength);
  mvPosition.y *= compressionFactor;
  
  // Calculer la normale en fonction de la direction du vent et de la courbure
  vec3 windNormal = normalize(vec3(
    windDirection.x * (1.0 + bendAmount * 2.0),
    1.0 - (bendAmount * 0.8),
    windDirection.y * (1.0 + bendAmount * 2.0)
  ));
  
  // Mélanger la normale verticale avec la normale du vent
  vNormal = mix(vec3(0.0, 1.0, 0.0), windNormal, heightFactor * windStrength * 1.5);
  
  // Ajuster la normale en fonction de l'inclinaison globale
  if (inclinationStrength > 0.0) {
    vec2 normalizedInclinationDir = normalize(inclinationDirection);
    
    // Angle d'inclinaison (0 à 90 degrés)
    float maxAngle = 1.5707; // 90 degrés en radians
    float inclinationAngle = inclinationStrength * maxAngle;
    
    // Calculer la normale en fonction de l'angle d'inclinaison
    // Plus l'angle est grand, plus la normale s'incline vers l'horizontale
    vec3 inclinationNormal = normalize(vec3(
      normalizedInclinationDir.x * sin(inclinationAngle),
      cos(inclinationAngle), // Composante verticale diminue avec l'inclinaison
      normalizedInclinationDir.y * sin(inclinationAngle)
    ));
    
    // Mélanger avec la normale actuelle
    vNormal = mix(vNormal, inclinationNormal, inclinationStrength);
  }
  
  // Position dans l'espace monde pour les calculs d'éclairage
  vec4 worldPosition = modelMatrix * mvPosition;
  vWorldPosition = worldPosition.xyz;
  
  // Coordonnées pour les shadow maps
  vWorldPosition_forShadows = shadowMatrix * worldPosition;
  
  // Position finale
  vec4 modelViewPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * modelViewPosition;
} 