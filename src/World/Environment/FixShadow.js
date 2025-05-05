// Script pour corriger le sol qui ne ru00e9agit pas aux lumiu00e8res et aux ombres
import * as THREE from 'three';

/**
 * Cette fonction remplace le sol actuel par un nouveau sol qui ru00e9agit aux lumiu00e8res et aux ombres
 * @param {Environment} environment - L'instance de l'environnement contenant le sol
 */
export function fixGroundLighting(environment) {
    console.log("Correction du sol pour qu'il ru00e9agisse aux lumiu00e8res et aux ombres...");
    
    // Supprimer l'ancien sol s'il existe
    if (environment.outerGroundMesh) {
        environment.scene.remove(environment.outerGroundMesh);
        environment.outerGroundMesh.geometry?.dispose();
        environment.outerGroundMesh.material?.dispose();
    }
    
    // Coefficients pour la texture et le terrain
    const width = environment.outerGroundDisplayRadius * 2.5;
    const depth = environment.outerGroundDisplayRadius * 2.5;
    const segments = 150;
    const flatRadius = environment.mapSize * 0.4;
    const transitionWidth = environment.mapSize * 0.4;
    const terrainVisibleRadius = environment.outerGroundDisplayRadius;
    
    // Cru00e9er une nouvelle gu00e9omu00e9trie de sol
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    
    // Appliquer le bruit pour cru00e9er des collines
    const simplex = new THREE.SimplexNoise ? new THREE.SimplexNoise() : new SimplexNoise();
    const positions = geometry.attributes.position.array;
    
    // Facteurs de bruit
    const noiseScale1 = 0.002;
    const noiseScale2 = 0.005;
    const octave1Weight = 0.6;
    const octave2Weight = 0.4;
    const hillAmplitude = 150;
    
    // Fonction utilitaire smooth step
    function smoothStep(edge0, edge1, x) { 
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); 
        return t * t * (3 - 2 * t); 
    }
    
    // Appliquer les variations de hauteur
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]; 
        const z = positions[i + 2]; 
        const dist = Math.sqrt(x * x + z * z);
        
        // Calcul de la hauteur
        let height = 0;
        if (dist >= flatRadius) {
            const noise1 = simplex.noise(x * noiseScale1, z * noiseScale1);
            const noise2 = simplex.noise(x * noiseScale2, z * noiseScale2);
            const combinedNoise = octave1Weight * noise1 + octave2Weight * noise2;
            const factor = smoothStep(flatRadius, flatRadius + transitionWidth, dist);
            height = hillAmplitude * combinedNoise * factor;
        }
        
        // Appliquer la hauteur
        positions[i + 1] = height;
    }
    
    // Ajuster les points hors du rayon visible
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]; 
        const z = positions[i + 2]; 
        const dist = Math.sqrt(x * x + z * z);
        
        if (dist > terrainVisibleRadius) {
            const factor = terrainVisibleRadius / dist;
            positions[i] = x * factor; 
            positions[i + 2] = z * factor;
        }
    }
    
    // Mettre u00e0 jour la gu00e9omu00e9trie
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    // Cru00e9er un matu00e9riau qui ru00e9agit aux lumiu00e8res et aux ombres
    // Utiliser un matu00e9riau standard au lieu d'un shader personnalisu00e9
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x4c7f33),  // Vert d'herbe 
        roughness: 0.8,                   // Surface un peu rugueuse
        metalness: 0.1,                   // Lu00e9gu00e8rement mu00e9tallique pour les reflets
        side: THREE.DoubleSide,
        flatShading: false,
        // Doit recevoir les ombres pour u00eatre visibles dans l'obscuritu00e9
        receiveShadow: true
    });
    
    // Cru00e9er la nouvelle mesh
    const newGroundMesh = new THREE.Mesh(geometry, material);
    newGroundMesh.position.y = -0.1;
    newGroundMesh.receiveShadow = true;
    newGroundMesh.name = "OuterGround_StandardMaterial";
    
    // Ajouter u00e0 la scu00e8ne et mettre u00e0 jour la ru00e9fu00e9rence
    environment.scene.add(newGroundMesh);
    environment.outerGroundMesh = newGroundMesh;
    
    console.log("Sol remplaci00e9 avec succu00e8s. Le nouveau sol ru00e9agit aux lumiu00e8res et aux ombres.");
    
    return newGroundMesh;
}
