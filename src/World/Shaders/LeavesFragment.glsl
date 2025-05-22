precision mediump float;

uniform sampler2D leavesTexture;
uniform float intensity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform float leafOpacity;

varying float vSize;
varying float vDistance;
varying float vRotation;
varying vec2 vUv;

void main() {
    // Calculer les coordonnées UV rotatives pour simuler la rotation des feuilles
    vec2 centeredUv = gl_PointCoord - vec2(0.5, 0.5);
    float s = sin(vRotation);
    float c = cos(vRotation);
    vec2 rotatedUv = vec2(
        centeredUv.x * c - centeredUv.y * s,
        centeredUv.x * s + centeredUv.y * c
    ) + vec2(0.5, 0.5);
    
    // Échantillonner la texture de feuille
    vec4 texColor = texture2D(leavesTexture, rotatedUv);
    
    // Transparence de base ajustée par l'intensité et l'opacité configurée
    float alpha = texColor.a * intensity * leafOpacity;
    
    // Traitement du brouillard
    float fogFactor = 0.0;
    
    // Choix du type de brouillard (exponentiel ou linéaire)
    #ifdef USE_FOG_EXP2
        fogFactor = 1.0 - exp(-fogDensity * vDistance);
    #else
        fogFactor = smoothstep(fogNear, fogFar, vDistance);
    #endif
    
    // Limiter l'effet de brouillard
    fogFactor = min(fogFactor * 0.8, 0.6);
    
    // Appliquer le brouillard
    vec3 finalColor = texColor.rgb;
    if (fogFactor > 0.001) {
        // Mélanger avec le brouillard mais préserver plus de luminosité
        finalColor = mix(finalColor, fogColor * 1.2, fogFactor);
        
        // Ajuster légèrement l'opacité pour compenser le brouillard
        alpha = alpha * (1.0 + fogFactor * 0.3);
    }
    
    // Couleur finale
    gl_FragColor = vec4(finalColor, alpha);
    
    // Rejeter les pixels trop transparents
    if (gl_FragColor.a < 0.01) discard;
} 