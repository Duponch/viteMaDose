precision mediump float;

// Position UV pour le fragment shader
varying vec2 vUv;

// Uniforme pour la hauteur du sol
uniform float groundHeight;

void main() {
    // Passer les coordonnées UV au fragment shader
    vUv = uv;
    
    // Calculer la matrice de billboarding
    vec3 cameraRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 cameraUp = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    
    // Appliquer la rotation pour faire face à la caméra et inverser l'orientation
    vec3 billboardedPosition = position.x * cameraRight + (-position.y) * cameraUp;
    
    // Ajuster la position verticale pour ancrer l'arc-en-ciel au sol
    billboardedPosition.y += groundHeight;
    
    // Position finale avec billboarding
    gl_Position = projectionMatrix * modelViewMatrix * vec4(billboardedPosition, 1.0);
} 