precision mediump float;

// Position UV pour le fragment shader
varying vec2 vUv;

void main() {
    // Passer les coordonnées UV au fragment shader
    vUv = uv;
    
    // Position standard
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 