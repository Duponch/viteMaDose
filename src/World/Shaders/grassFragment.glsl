varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec4 vWorldPosition_forShadows;

// Lumières et ombres
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientLight;
uniform vec3 grassColor;
uniform float receiveShadow;
uniform sampler2D shadowMap;
uniform vec2 shadowMapSize;
uniform float shadowBias;
uniform float shadowDarkness;
uniform mat4 shadowMatrix;

// Fonction pour vérifier si un point est dans l'ombre
float getShadow(sampler2D shadowMap, vec2 shadowMapSize, vec4 shadowCoord, float shadowBias) {
  // Normaliser les coordonnées de la shadow map
  vec3 shadowCoord_norm = shadowCoord.xyz / shadowCoord.w;
  shadowCoord_norm = shadowCoord_norm * 0.5 + 0.5;
  
  // Sortir si le point est hors de la shadow map
  if (shadowCoord_norm.x < 0.0 || shadowCoord_norm.x > 1.0 || 
      shadowCoord_norm.y < 0.0 || shadowCoord_norm.y > 1.0)
    return 1.0;
    
  // PCF (Percentage Closer Filtering) pour adoucir les ombres
  float shadow = 0.0;
  float texelSize = 1.0 / shadowMapSize.x;
  
  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 offset = vec2(x, y) * texelSize;
      float depth = texture2D(shadowMap, shadowCoord_norm.xy + offset).r;
      shadow += step(shadowCoord_norm.z - shadowBias, depth);
    }
  }
  
  shadow /= 9.0; // Moyenne des 9 échantillons
  return shadow;
}

void main() {
  // Couleur de base de l'herbe
  vec3 baseColor = grassColor;
  
  // Nuances plus sombres à la base de l'herbe, plus claires aux extrémités
  float clarity = (vUv.y * 0.5) + 0.5;
  
  // Calcul de l'ombrage
  float shadow = 1.0;
  if (receiveShadow > 0.0) {
    shadow = getShadow(shadowMap, shadowMapSize, vWorldPosition_forShadows, shadowBias);
  }
  
  // Calcul de l'éclairage avec ombre
  float directionalLightIntensity = max(0.0, dot(vNormal, normalize(sunDirection)));
  vec3 directionalLight = sunColor * directionalLightIntensity * shadow * receiveShadow;
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