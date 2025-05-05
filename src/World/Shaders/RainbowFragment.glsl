precision mediump float;

// Position UV venant du vertex shader
varying vec2 vUv;

// Paramètres configurables 
uniform float uOpacity;        // Opacité globale de l'arc-en-ciel
uniform float uInnerRadius;    // Rayon intérieur de l'arc-en-ciel
uniform float uOuterRadius;    // Rayon extérieur de l'arc-en-ciel
uniform float uArcSpan;        // Étendue de l'arc (en degrés normalisés 0-1)
uniform vec3 uPosition;        // Position du centre de l'arc

vec3 hsvToRgb(vec3 hsv) {
    // Conversion HSV vers RGB
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
    return hsv.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsv.y);
}

void main() {
    // Transformer les UV pour avoir (0,0) au centre
    vec2 centeredUv = vUv * 2.0 - 1.0;
    
    // Distance du pixel au centre
    float dist = length(centeredUv);
    
    // Si la distance est hors des rayons définis, transparence totale
    if (dist < uInnerRadius || dist > uOuterRadius) {
        discard;
    }
    
    // Angle du pixel (en radians)
    float angle = atan(centeredUv.y, centeredUv.x);
    // Normaliser l'angle entre 0 et 1
    float normalizedAngle = (angle + 3.14159) / (2.0 * 3.14159);
    
    // Limiter à la portée de l'arc
    if (normalizedAngle > uArcSpan) {
        discard;
    }
    
    // Normaliser la position dans l'arc-en-ciel (0 = rayon intérieur, 1 = rayon extérieur)
    float rainbowPos = (dist - uInnerRadius) / (uOuterRadius - uInnerRadius);
    
    // Créer des couleurs d'arc-en-ciel (du rouge au violet)
    // Inverser la position pour avoir rouge à l'extérieur
    float hue = 1.0 - rainbowPos;
    vec3 hsv = vec3(hue, 1.0, 1.0);
    vec3 rgb = hsvToRgb(hsv);
    
    // Atténuer les bords pour un rendu plus doux
    float edgeFeather = 0.05;
    float innerEdge = smoothstep(0.0, edgeFeather, rainbowPos);
    float outerEdge = smoothstep(0.0, edgeFeather, 1.0 - rainbowPos);
    float opacity = innerEdge * outerEdge * uOpacity;
    
    // Couleur finale
    gl_FragColor = vec4(rgb, opacity);
} 