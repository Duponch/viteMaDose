precision mediump float;

uniform sampler2D rainTexture;
uniform float intensity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform float dropOpacity;

varying float vSize;
varying float vDistance;
varying vec2 vUv;

void main() {
    // Orienter les coordonnées UV pour que la pointe de la goutte pointe vers le bas
    vec2 rotatedUv = gl_PointCoord;
    
    // Échantillonner la texture de goutte
    vec4 texColor = texture2D(rainTexture, rotatedUv);
    
    // Transparence de base ajustée par l'intensité et l'opacité configurée
    float alpha = texColor.a * intensity * dropOpacity;
    
    // Traitement du brouillard
    float fogFactor = 0.0;
    
    // Choix du type de brouillard (exponentiel ou linéaire)
    #ifdef USE_FOG_EXP2
        fogFactor = 1.0 - exp(-fogDensity * vDistance);
    #else
        fogFactor = smoothstep(fogNear, fogFar, vDistance);
    #endif
    
    // Limiter l'effet de brouillard sur les gouttes pour qu'elles restent plus visibles
    fogFactor = min(fogFactor * 0.8, 0.6);
    
    // Appliquer le brouillard
    vec3 finalColor = texColor.rgb;
    if (fogFactor > 0.001) {
        // Mélanger avec le brouillard mais préserver plus de luminosité
        finalColor = mix(finalColor, fogColor * 1.2, fogFactor);
        
        // Augmenter légèrement l'opacité pour compenser le brouillard
        alpha = alpha * (1.0 + fogFactor * 0.3);
    }
    
    // Couleur finale
    gl_FragColor = vec4(finalColor, alpha);
    
    // Rejeter les pixels trop transparents
    if (gl_FragColor.a < 0.01) discard;
} 