precision mediump float;

uniform sampler2D splashTexture;
uniform float intensity;

varying float vLife;

void main() {
    // Échantillonner la texture d'impact
    vec4 texColor = texture2D(splashTexture, gl_PointCoord);
    
    // Ajuster l'opacité en fonction du temps de vie et de l'intensité
    // Fade-in rapide suivi d'un fade-out plus lent
    float fadeIn = smoothstep(0.0, 0.1, vLife);
    float fadeOut = smoothstep(0.0, 1.0, vLife);
    float alpha = texColor.a * fadeIn * (1.0 - fadeOut) * intensity;
    
    // Couleur finale
    gl_FragColor = vec4(texColor.rgb, alpha);
    
    // Rejeter les pixels trop transparents
    if (gl_FragColor.a < 0.01) discard;
} 