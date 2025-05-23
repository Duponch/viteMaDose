precision mediump float;

uniform sampler2D rainTexture;
uniform float intensity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform float dropOpacity;

// Nouveaux uniformes pour l'éclairage
uniform vec3 ambientLightColor;
uniform float ambientLightIntensity;
uniform vec3 directionalLightColor;
uniform vec3 directionalLightDirection;
uniform float directionalLightIntensity;
uniform float dayFactor; // Facteur jour/nuit (0 = nuit, 1 = jour)

varying float vSize;
varying float vDistance;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;

void main() {
    // Orienter les coordonnées UV pour que la pointe de la goutte pointe vers le bas
    vec2 rotatedUv = gl_PointCoord;
    
    // Échantillonner la texture de goutte
    vec4 texColor = texture2D(rainTexture, rotatedUv);
    
    // Calculer l'éclairage
    float lightingFactor = 1.0;
    
    // Éclairage ambiant de base (toujours présent mais variable selon le jour/nuit)
    float baseAmbient = 0.15; // Minimum de lumière pour que la pluie reste légèrement visible
    float ambientContribution = baseAmbient + ambientLightIntensity * ambientLightColor.r * 0.8;
    
    // Éclairage directionnel (soleil/lune)
    float directionalContribution = 0.0;
    if (directionalLightIntensity > 0.01) {
        // Calculer l'angle entre la direction de la lumière et la normale (approximée)
        vec3 lightDir = normalize(-directionalLightDirection);
        // Pour les gouttes de pluie, on simule une normale vers le haut avec une légère variation
        vec3 dropNormal = normalize(vec3(0.1, 1.0, 0.1));
        
        // Calcul de Lambert simple
        float lambertian = max(dot(dropNormal, lightDir), 0.0);
        directionalContribution = lambertian * directionalLightIntensity * directionalLightColor.r * 0.6;
    }
    
    // Combiner l'éclairage avec pondération jour/nuit
    lightingFactor = ambientContribution + directionalContribution * dayFactor;
    
    // Limiter l'éclairage pour éviter la surexposition mais permettre l'obscurité
    lightingFactor = clamp(lightingFactor, 0.05, 2.0);
    
    // Appliquer l'éclairage à la couleur de base
    vec3 litColor = texColor.rgb * lightingFactor;
    
    // Transparence de base ajustée par l'intensité et l'opacité configurée
    float alpha = texColor.a * intensity * dropOpacity;
    
    // Réduire l'opacité dans l'obscurité pour simuler la difficulté à voir la pluie la nuit
    alpha *= (0.3 + 0.7 * lightingFactor);
    
    // Traitement du brouillard (corrigé pour permettre masquage complet)
    float fogFactor = 0.0;
    
    // Choix du type de brouillard (exponentiel ou linéaire)
    #ifdef USE_FOG_EXP2
        fogFactor = 1.0 - exp(-fogDensity * vDistance);
    #else
        fogFactor = smoothstep(fogNear, fogFar, vDistance);
    #endif
    
    // Ne plus limiter l'effet de brouillard pour permettre le masquage complet
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    
    // Appliquer le brouillard
    vec3 finalColor = litColor;
    if (fogFactor > 0.001) {
        // Mélanger avec le brouillard
        finalColor = mix(litColor, fogColor, fogFactor);
        
        // Réduire l'opacité avec le brouillard pour faire disparaître la pluie dans le brouillard dense
        alpha = alpha * (1.0 - fogFactor * 0.8);
    }
    
    // Couleur finale
    gl_FragColor = vec4(finalColor, alpha);
    
    // Rejeter les pixels trop transparents
    if (gl_FragColor.a < 0.01) discard;
} 