// Pas besoin de grand chose ici pour une simple sphère
// On passe juste la position pour calculer la direction dans le fragment shader

varying vec3 vWorldDirection; // Direction du pixel vue depuis le centre

void main() {
    // La position du vertex sur la sphère EST la direction depuis le centre (0,0,0)
    // On la passe au fragment shader après transformation par la caméra
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldDirection = worldPosition.xyz - cameraPosition; // Vecteur de la caméra au point sur la sphère

    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}