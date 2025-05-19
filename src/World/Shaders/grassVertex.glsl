varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec4 vWorldPosition_forShadows;

uniform float time;
uniform float windStrength;
uniform mat4 shadowMatrix;

// Activation des lumières
#define USE_LIGHTS

void main() {
  vUv = uv;
  
  // VERTEX POSITION
  vec4 mvPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  
  // DISPLACEMENT
  // L'effet est plus fort au bout des brins d'herbe
  float dispPower = 1.0 - cos(uv.y * 3.1416 / 2.0);
  
  float displacement = sin(mvPosition.z + time * 5.0) * (0.1 * dispPower * windStrength);
  mvPosition.x += displacement;
  
  // Légère variation sur l'axe z pour plus de naturalité
  float displacementZ = cos(mvPosition.x + time * 7.0) * (0.05 * dispPower * windStrength);
  mvPosition.z += displacementZ;
  
  // Calculer la normale (simplifiée pour l'herbe - pointe principalement vers le haut)
  vNormal = normalize(vec3(0.0, 1.0, 0.0));
  
  // Position dans l'espace monde pour les calculs d'éclairage
  vec4 worldPosition = modelMatrix * mvPosition;
  vWorldPosition = worldPosition.xyz;
  
  // Coordonnées pour les shadow maps
  vWorldPosition_forShadows = shadowMatrix * worldPosition;
  
  // Position finale
  vec4 modelViewPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * modelViewPosition;
} 