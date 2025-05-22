precision mediump float;

uniform sampler2D leavesTexture;
uniform float intensity;
// Paramètres de brouillard
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform float leafOpacity;
// Paramètres d'éclairage
uniform vec3 ambientColor;
uniform float ambientIntensity;
uniform float dayFactor;

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
    
    // Appliquer l'éclairage ambiant en fonction du cycle jour/nuit
    // Facteur de luminosité combinant l'intensité ambiante et le facteur jour/nuit
    float lightFactor = ambientIntensity * mix(0.3, 1.0, dayFactor);
    
    // Couleur avec éclairage ambiant
    vec3 litColor = texColor.rgb * ambientColor * lightFactor;
    
    // Assombrir davantage la nuit
    if (dayFactor < 0.3) {
        // Assombrissement supplémentaire la nuit pour éviter les feuilles trop lumineuses
        litColor *= mix(0.4, 1.0, dayFactor / 0.3);
    }
    
    // Traitement du brouillard
    float fogFactor = 0.0;
    
    // Choix du type de brouillard (exponentiel ou linéaire)
    #ifdef USE_FOG_EXP2
        // Brouillard exponentiel - plus réaliste et progressif
        fogFactor = 1.0 - exp(-fogDensity * fogDensity * vDistance * vDistance);
    #else
        // Brouillard linéaire - simple et efficace
        fogFactor = smoothstep(fogNear, fogFar, vDistance);
    #endif
    
    // S'assurer que le brouillard est correctement appliqué
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    
    // Appliquer le brouillard en fonction de la densité du brouillard
    vec3 finalColor = mix(litColor, fogColor, fogFactor);
    
    // Réduire l'opacité en fonction de la distance dans le brouillard
    // Plus l'objet est loin, plus il devient transparent dans le brouillard
    alpha *= mix(1.0, 0.7, fogFactor);
    
    // Couleur finale
    gl_FragColor = vec4(finalColor, alpha);
    
    // Rejeter les pixels trop transparents
    if (gl_FragColor.a < 0.01) discard;
} 