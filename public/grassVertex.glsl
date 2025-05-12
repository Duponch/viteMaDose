varying vec2 vUv;
varying float vDisplacement;

uniform float uTime;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform vec3 uWindDirection;

void main() {
    vUv = uv;
    
    // Calculer un déplacement basé sur la position et le temps
    float windNoise = sin(position.x * 0.5 + uTime * uWindSpeed) * 
                     cos(position.z * 0.5 + uTime * uWindSpeed);
    
    // Appliquer le déplacement uniquement au sommet de l'herbe
    float heightFactor = position.y;
    vDisplacement = windNoise * uWindStrength * heightFactor;
    
    // Calculer la nouvelle position
    vec3 newPosition = position;
    newPosition.x += vDisplacement * uWindDirection.x;
    newPosition.z += vDisplacement * uWindDirection.z;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
} 