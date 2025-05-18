varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// Lumières et ombres
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientLight;
uniform vec3 grassColor;
uniform float receiveShadow;

void main() {
  // Couleur de base de l'herbe
  vec3 baseColor = grassColor;
  
  // Nuances plus sombres à la base de l'herbe, plus claires aux extrémités
  float clarity = (vUv.y * 0.5) + 0.5;
  
  // Calcul simple de l'éclairage
  float directionalLightIntensity = max(0.0, dot(vNormal, normalize(sunDirection)));
  vec3 directionalLight = sunColor * directionalLightIntensity * receiveShadow;
  vec3 lighting = ambientLight + directionalLight;
  
  // Couleur finale avec éclairage
  vec3 finalColor = baseColor * clarity * lighting;
  
  // Ajout d'une légère variation aléatoire basée sur la position UV
  float randomVariation = fract(sin(vUv.x * 100.0) * 10000.0) * 0.05 + 0.95;
  finalColor *= randomVariation;
  
  // En nocturne, ajouter une légère teinte bleue pour simuler le clair de lune
  float dayFactor = max(0.0, min(1.0, sunDirection.y * 2.0 + 0.5));
  vec3 nightTint = vec3(0.7, 0.8, 1.0);
  finalColor = mix(finalColor * nightTint * 0.4, finalColor, dayFactor);
  
  gl_FragColor = vec4(finalColor, 1.0);
} 