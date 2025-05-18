varying vec2 vUv;

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
  
  // Calcul simple d'éclairage
  vec3 normal = vec3(0.0, 1.0, 0.0); // Normale simplifiée pointant vers le haut
  float lightIntensity = max(0.0, dot(normal, normalize(sunDirection)));
  
  // Mélanger la lumière ambiante et directionnelle
  vec3 lighting = ambientLight + (sunColor * lightIntensity * receiveShadow);
  
  // Couleur finale
  vec3 finalColor = baseColor * clarity * lighting;
  
  // Ajout d'une légère variation aléatoire basée sur la position UV pour éviter l'uniformité
  float randomVariation = fract(sin(vUv.x * 100.0) * 10000.0) * 0.05 + 0.95;
  finalColor *= randomVariation;
  
  gl_FragColor = vec4(finalColor, 1.0);
} 