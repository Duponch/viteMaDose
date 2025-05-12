varying vec2 vUv;
varying float vDisplacement;

uniform vec3 uColor;
uniform float uDisplacementStrength;

void main() {
    // Variation de couleur basée sur le déplacement
    vec3 finalColor = uColor;
    finalColor *= 1.0 + vDisplacement * uDisplacementStrength;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 