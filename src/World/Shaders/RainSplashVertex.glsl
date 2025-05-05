precision mediump float;

attribute float size;
attribute float life;
attribute float maxLife;
attribute float rotation;

varying vec2 vUv;
varying float vLife;

void main() {
    // Position dans l'espace caméra
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Calculer la taille en fonction de la distance
    float pointSize = size * (300.0 / -mvPosition.z);
    
    // Ratio de vie restante (entre 0 et 1)
    vLife = life / maxLife;
    
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
} 