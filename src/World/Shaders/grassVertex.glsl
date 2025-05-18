varying vec2 vUv;
uniform float time;
uniform float windStrength;

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
  
  vec4 modelViewPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * modelViewPosition;
} 