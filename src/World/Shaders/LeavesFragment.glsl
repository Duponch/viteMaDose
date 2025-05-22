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
    
    // Transparence binaire stricte pour créer une séparation nette
    // Seuil plus élevé pour garantir que seules les parties vraiment opaques sont rendues
    float alpha = texColor.a > 0.3 ? 1.0 : 0.0;
    
    // Si le pixel n'est pas opaque, le rejeter immédiatement
    // Cela permet au test de profondeur de fonctionner correctement
    if (alpha < 0.5) {
        discard;
    }
    
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
        // Utilisation d'une formule plus sensible pour les feuilles
        fogFactor = 1.0 - exp(-fogDensity * fogDensity * vDistance * vDistance * 1.5);
    #else
        // Augmenter la sensibilité du brouillard linéaire
        float fogStart = fogNear * 0.8; // Commencer le brouillard plus tôt
        float fogEnd = fogFar * 0.9;    // Terminer le brouillard plus tôt
        fogFactor = smoothstep(fogStart, fogEnd, vDistance);
    #endif
    
    // S'assurer que le brouillard est correctement appliqué
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    
    // Le brouillard n'affecte que la couleur, pas l'opacité
    vec3 finalColor = mix(litColor, fogColor, fogFactor);
    
    // Couleur finale avec alpha fixe à 1.0 pour les pixels visibles
    gl_FragColor = vec4(finalColor, 1.0);
    
    // Nous n'avons plus besoin de rejeter les pixels ici car nous l'avons fait plus tôt
} 