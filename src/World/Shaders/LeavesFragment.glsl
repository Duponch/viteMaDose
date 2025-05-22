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
uniform float time;

varying float vSize;
varying float vDistance;
varying float vRotation;
varying vec2 vUv;

// Fonction pour créer une ombre subtile sur les bords des feuilles
float edgeShadow(vec2 uv) {
    float distFromCenter = length(uv - vec2(0.5, 0.5));
    return smoothstep(0.0, 0.5, 1.0 - distFromCenter * 1.2);
}

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
    
    // Ajouter un léger flottement de couleur basé sur le temps pour simuler le mouvement de la lumière
    float colorShift = sin(time * 0.2) * 0.05 + 0.95;
    
    // Effet d'ombrage aux bords pour plus de réalisme
    float shadow = edgeShadow(rotatedUv);
    
    // Effet de translucidité subtile quand la feuille est exposée à la lumière
    float translucency = dayFactor * 0.3 * shadow;
    
    // Appliquer l'éclairage ambiant en fonction du cycle jour/nuit
    // Facteur de luminosité combinant l'intensité ambiante et le facteur jour/nuit
    float lightFactor = ambientIntensity * mix(0.3, 1.0, dayFactor);
    
    // Modifier légèrement la couleur en fonction de la rotation et du temps
    // pour simuler les différentes faces de la feuille sous différents angles de lumière
    vec3 baseColor = texColor.rgb * colorShift;
    
    // Ajouter une légère variation de teinte en fonction de la position
    // pour simuler différents types de feuilles
    float hueVariation = fract(sin(gl_FragCoord.x * 0.01 + gl_FragCoord.y * 0.02) * 4325.5453);
    float hueShift = mix(0.9, 1.1, hueVariation);
    
    // Couleur avec éclairage ambiant et effets appliqués
    vec3 litColor = baseColor * ambientColor * lightFactor * shadow;
    
    // Ajouter un effet de translucidité (brightening) quand la lumière passe à travers la feuille
    litColor += baseColor * translucency * vec3(1.0, 0.9, 0.7);
    
    // Appliquer la variation de teinte
    litColor.r *= hueShift;
    litColor.g *= mix(0.9, 1.1, fract(hueVariation * 3.7));
    
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
} 