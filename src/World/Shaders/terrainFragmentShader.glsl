varying vec3 vPosition;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vColor;

// Lumière
uniform vec3 uSunPosition;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;

// Brouillard
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform bool uFogEnabled;
uniform float uFogDensity;

// Textures procédurales
uniform sampler2D uGrassTexture;
uniform sampler2D uRockTexture;
uniform sampler2D uSnowTexture;

// Hauteurs de transition
uniform float uRockHeight;
uniform float uSnowHeight;
uniform float uMinSnowHeight; // Hauteur minimale absolue pour la neige

// Nouveaux paramètres pour transitions non-linéaires
uniform float uTransitionNoiseScale;
uniform float uTransitionNoiseStrength;

// Fonction pour générer du bruit simplex 2D
// Source: https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    // Calculer les coordonnées UV pour le mapping de texture
    // Utiliser la position pour créer des coordonnées de texture cohérentes
    vec2 uv = vPosition.xz * 0.01;
    
    // Récupérer les textures
    vec3 grassColor = texture2D(uGrassTexture, uv).rgb;
    vec3 rockColor = texture2D(uRockTexture, uv).rgb;
    vec3 snowColor = texture2D(uSnowTexture, uv).rgb;
    
    // Générer du bruit pour les transitions
    float noise1 = snoise(vPosition.xz * uTransitionNoiseScale) * uTransitionNoiseStrength;
    float noise2 = snoise(vPosition.xz * uTransitionNoiseScale * 2.5) * (uTransitionNoiseStrength * 0.5);
    float noise = noise1 + noise2;
    
    // Facteur supplémentaire basé sur la pente pour les transitions
    float slope = 1.0 - dot(normalize(vNormal), vec3(0.0, 1.0, 0.0));
    
    // Les pentes fortes augmentent la présence de roche et diminuent la neige
    float slopeNoiseFactor = slope * 40.0;
    
    // Facteurs de mélange basés sur la hauteur avec bruit
    float rockThreshold = uRockHeight + noise - slopeNoiseFactor;
    float snowThreshold = uSnowHeight + noise * 1.5 - slopeNoiseFactor * 2.0;
    
    // Zones de transition plus larges pour un mélange plus progressif
    float rockTransitionWidth = 20.0 + noise * 0.5;
    float snowTransitionWidth = 25.0 + noise * 0.7;
    
    float rockFactor = smoothstep(rockThreshold - rockTransitionWidth, rockThreshold + rockTransitionWidth, vHeight);
    float snowFactor = smoothstep(snowThreshold - snowTransitionWidth, snowThreshold + snowTransitionWidth, vHeight);
    
    // Ajouter un facteur basé sur la pente (normale)
    // Les surfaces plus verticales (falaises) seront plus rocheuses
    float slopeRockFactor = slope * 0.9; // Amplifier l'effet de pente
    rockFactor = max(rockFactor, slopeRockFactor);
    
    // Réduire la neige sur les pentes raides
    snowFactor *= (1.0 - slope * 0.8);
    
    // Éliminer complètement la neige sur les pentes très raides (> 80 degrés)
    if (slope > 0.8) {
        snowFactor = 0.0;
    }
    
    // Garantir qu'aucune neige n'apparaisse en dessous d'une hauteur minimale absolue
    float minHeightFactor = smoothstep(uMinSnowHeight - 5.0, uMinSnowHeight + 15.0, vHeight);
    
    // Contrainte absolue - aucune neige en dessous de minSnowHeight*0.7
    float absoluteMinHeight = uMinSnowHeight * 0.7;
    minHeightFactor *= step(absoluteMinHeight, vHeight);
    
    // Appliquer le facteur de hauteur minimale à la neige
    snowFactor *= minHeightFactor;
    
    // Garantir que les zones basses (< 10 unités) n'ont aucune neige
    if (vHeight < 10.0) {
        snowFactor = 0.0;
    }
    
    // Combiner les textures en fonction de la hauteur et de la pente
    vec3 baseColor = grassColor;
    baseColor = mix(baseColor, rockColor, rockFactor);
    baseColor = mix(baseColor, snowColor, snowFactor);
    
    // Calcul de l'éclairage (modèle Lambert standard)
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uSunPosition);
    
    // Calcul du facteur diffus (Lambert)
    float NdotL = max(dot(normal, lightDir), 0.0);
    
    // Réduire l'intensité globale de l'éclairage (atténuation)
    // Réduire la contribution de la lumière diffuse
    float diffuseScale = 0.03; // Réduire l'intensité diffuse
    
    // Lumière ambiante (toujours présente mais réduite)
    vec3 ambient = uAmbientColor * (uAmbientIntensity * 0.03); // Réduire l'intensité ambiante
    
    // Lumière diffuse (dépend de l'angle avec la source lumineuse)
    vec3 diffuse = uSunColor * (uSunIntensity * diffuseScale) * NdotL;
    
    // Combiner les composantes d'éclairage
    vec3 lighting = ambient + diffuse;
    
    // Application de l'éclairage à la couleur de base
    vec3 finalColor = baseColor * lighting;
    
    // Application du brouillard (exactement comme dans birdFragment.glsl)
    if (uFogEnabled) {
        // Calculer la profondeur pour le brouillard (distance de la caméra)
        // Utiliser gl_FragCoord.z / gl_FragCoord.w pour obtenir la profondeur en espace vue
        float depth = gl_FragCoord.z / gl_FragCoord.w;
        
        // Formule identique à celle des oiseaux, sans coefficient supplémentaire
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
        
        // Appliquer le facteur de brouillard (limité entre 0 et 1)
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        
        // Mélanger avec la couleur du brouillard
        finalColor = mix(finalColor, uFogColor, fogFactor);
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
} 