precision mediump float;

uniform sampler2D splashTexture;
uniform float intensity;

// Nouveaux uniformes pour l'éclairage
uniform vec3 ambientLightColor;
uniform float ambientLightIntensity;
uniform vec3 directionalLightColor;
uniform vec3 directionalLightDirection;
uniform float directionalLightIntensity;
uniform float dayFactor;

varying float vLife;
varying vec3 vWorldPosition;

void main() {
    // Échantillonner la texture d'impact
    vec4 texColor = texture2D(splashTexture, gl_PointCoord);
    
    // Calculer l'éclairage
    float lightingFactor = 1.0;
    
    // Éclairage ambiant de base
    float baseAmbient = 0.2; // Les impacts au sol reçoivent plus de lumière ambiante
    float ambientContribution = baseAmbient + ambientLightIntensity * ambientLightColor.r * 0.9;
    
    // Éclairage directionnel (pour les impacts, on simule une surface horizontale)
    float directionalContribution = 0.0;
    if (directionalLightIntensity > 0.01) {
        vec3 lightDir = normalize(-directionalLightDirection);
        vec3 splashNormal = vec3(0.0, 1.0, 0.0); // Surface horizontale
        
        float lambertian = max(dot(splashNormal, lightDir), 0.0);
        directionalContribution = lambertian * directionalLightIntensity * directionalLightColor.r * 0.8;
    }
    
    // Combiner l'éclairage avec pondération jour/nuit
    lightingFactor = ambientContribution + directionalContribution * dayFactor;
    
    // Limiter l'éclairage
    lightingFactor = clamp(lightingFactor, 0.1, 2.0);
    
    // Appliquer l'éclairage à la couleur
    vec3 litColor = texColor.rgb * lightingFactor;
    
    // Ajuster l'opacité en fonction du temps de vie et de l'intensité
    // Fade-in rapide suivi d'un fade-out plus lent
    float fadeIn = smoothstep(0.0, 0.1, vLife);
    float fadeOut = smoothstep(0.0, 1.0, vLife);
    float alpha = texColor.a * fadeIn * (1.0 - fadeOut) * intensity;
    
    // Réduire l'opacité dans l'obscurité
    alpha *= (0.4 + 0.6 * lightingFactor);
    
    // Couleur finale
    gl_FragColor = vec4(litColor, alpha);
    
    // Rejeter les pixels trop transparents
    if (gl_FragColor.a < 0.01) discard;
} 