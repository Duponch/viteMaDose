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

void main() {
    // Récupérer la couleur de base
    vec3 baseColor = vColor;
    
    // Calcul de l'éclairage (modèle Lambert standard)
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uSunPosition);
    
    // Calcul du facteur diffus (Lambert)
    float NdotL = max(dot(normal, lightDir), 0.0);
    
    // Réduire l'intensité globale de l'éclairage (atténuation)
    // Réduire la contribution de la lumière diffuse
    float diffuseScale = 0.6; // Réduire l'intensité diffuse
    
    // Lumière ambiante (toujours présente mais réduite)
    vec3 ambient = uAmbientColor * (uAmbientIntensity * 0.5); // Réduire l'intensité ambiante
    
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