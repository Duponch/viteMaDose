varying vec4 vColor;
varying float z;
varying vec3 vNormal;

uniform vec3 color;
uniform float ambientLightIntensity;
uniform vec3 sunDirection;
uniform float sunIntensity;
uniform vec3 fogColor;
uniform float fogDensity;

void main() {
  // Si l'intensité de la lumière est 0, rendre l'oiseau complètement noir
  if (ambientLightIntensity <= 0.0 && sunIntensity <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    // Calculer l'éclairage directionnel du soleil
    float sunLight = max(dot(normalize(vNormal), normalize(sunDirection)), 0.0) * sunIntensity;
    
    // Combiner l'éclairage ambiant et directionnel
    float totalLight = ambientLightIntensity + sunLight;
    
    vec3 finalColor = vColor.rgb * totalLight;

    // Calculer le facteur de brouillard exponentiel
    float depth = -z;
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
    
    // Mélanger la couleur finale avec le brouillard
    vec3 colorWithFog = mix(finalColor, fogColor, fogFactor);
    
    gl_FragColor = vec4(colorWithFog, 1.0);
  }
} 