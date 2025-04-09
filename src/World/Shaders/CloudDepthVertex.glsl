// src/World/Shaders/cloudDepthVertex.glsl

// Les déclarations uniform mat4... ont déjà été supprimées.

// --- SUPPRIMER CETTE LIGNE AUSSI ---
// attribute vec3 position; // Redondant, fourni par Three.js
// ----------------------------------

void main() {
    // Utiliser directement les matrices et attributs fournis par Three.js
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}