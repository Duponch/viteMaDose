varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec4 vWorldPosition_forShadows;

uniform float time;
uniform float windStrength;
uniform mat4 shadowMatrix;
uniform vec2 windDirection; // Direction du vent normalisée (x, z)

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
  
  // Position dans l'espace monde pour les calculs d'éclairage
  vec4 worldPosition = modelMatrix * mvPosition;
  vWorldPosition = worldPosition.xyz;
  
  // Coordonnées pour les shadow maps
  vWorldPosition_forShadows = shadowMatrix * worldPosition;
  
  // Position finale
  vec4 modelViewPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * modelViewPosition;
} 