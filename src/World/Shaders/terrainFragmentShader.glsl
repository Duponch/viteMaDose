varying vec3 vPosition;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vColor;

void main() {
    // Pour un effet low poly, on utilise simplement la couleur calculée dans le vertex shader
    // sans aucun mélange ou texture
    
    // Ajouter un léger effet d'assombrissement basé sur l'altitude pour la profondeur
    float depthFactor = 1.0 - (vHeight / 300.0) * 0.3; // Assombrir légèrement les zones basses
    depthFactor = clamp(depthFactor, 0.7, 1.0);
    
    vec3 finalColor = vColor * depthFactor;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 