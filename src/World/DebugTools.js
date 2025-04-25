import * as THREE from 'three';

/**
 * Fonction de debug: crée une sphère jaune sur un trottoir de parc choisi aléatoirement
 * @returns {Object} Un objet avec la sphère créée et sa position
 */
export function createDebugSphereOnParkSidewalk() {
    // Récupération des références nécessaires
    const experience = window.experience;
    if (!experience) {
        console.error("Debug: impossible de trouver l'instance d'Experience");
        return null;
    }
    
    const cityManager = experience.world?.cityManager;
    const navGraph = cityManager?.getNavigationGraph();
    
    if (!cityManager || !navGraph) {
        console.error("Debug: CityManager ou NavGraph non disponible");
        return null;
    }
    
    // Trouver tous les parcs
    const parks = cityManager.getBuildingsByType && cityManager.getBuildingsByType(['park']);
    if (!parks || parks.length === 0) {
        console.error("Debug: Aucun parc trouvé");
        return null;
    }
    
    console.log(`Debug: ${parks.length} parcs trouvés dans la ville`);
    
    // Choisir un parc aléatoire
    const randomPark = parks[Math.floor(Math.random() * parks.length)];
    if (!randomPark || !randomPark.position) {
        console.error("Debug: Parc sans position valide");
        return null;
    }
    
    console.log(`Debug: Parc sélectionné à [${randomPark.position.x.toFixed(2)}, ${randomPark.position.y.toFixed(2)}, ${randomPark.position.z.toFixed(2)}]`);
    
    // Obtenir le nœud sur le trottoir du parc
    const parkPos = randomPark.position.clone();
    const sidewalkHeight = navGraph.sidewalkHeight ?? 0.2;
    parkPos.y = sidewalkHeight;
    
    // Créer la sphère à cette position
    const geometry = new THREE.SphereGeometry(3, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const sphere = new THREE.Mesh(geometry, material);
    
    // Placer la sphère sur le trottoir du parc
    sphere.position.copy(parkPos);
    sphere.position.y += 5; // Élever légèrement pour bien voir
    
    // Ajouter à la scène
    experience.scene.add(sphere);
    
    console.log(`Debug: Sphère jaune créée à la position [${parkPos.x.toFixed(2)}, ${parkPos.y.toFixed(2)}, ${parkPos.z.toFixed(2)}] sur un trottoir de parc`);
    
    // Essayer d'obtenir le nœud marchable le plus proche
    const node = navGraph.getClosestWalkableNode(parkPos);
    if (node) {
        console.log(`Debug: Nœud marchable le plus proche: [${node.x}, ${node.y}]`);
        
        // Créer une deuxième sphère verte au point du nœud marchable
        const worldPos = navGraph.gridToWorld(node.x, node.y);
        const greenSphere = new THREE.Mesh(
            new THREE.SphereGeometry(2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        greenSphere.position.copy(worldPos);
        greenSphere.position.y += 5;
        experience.scene.add(greenSphere);
        
        console.log(`Debug: Sphère verte créée à la position du nœud marchable [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}]`);
        
        return { yellowSphere: sphere, greenSphere, parkPosition: parkPos, nodePosition: worldPos };
    }
    
    return { sphere, position: parkPos };
}

// Exposer la fonction de debug globalement pour un accès facile depuis la console
window.createDebugSphereOnParkSidewalk = createDebugSphereOnParkSidewalk;

// Exposer d'autres fonctions de debug au besoin
export function listAllParks() {
    const experience = window.experience;
    if (!experience) {
        console.error("Debug: impossible de trouver l'instance d'Experience");
        return;
    }
    
    const cityManager = experience.world?.cityManager;
    if (!cityManager) {
        console.error("Debug: CityManager non disponible");
        return;
    }
    
    const parks = cityManager.getBuildingsByType && cityManager.getBuildingsByType(['park']);
    if (!parks || parks.length === 0) {
        console.log("Debug: Aucun parc trouvé dans la ville");
        return;
    }
    
    console.log(`Debug: ${parks.length} parcs trouvés dans la ville:`);
    parks.forEach((park, index) => {
        if (park && park.position) {
            console.log(`Parc #${index}: Position [${park.position.x.toFixed(2)}, ${park.position.y.toFixed(2)}, ${park.position.z.toFixed(2)}]`);
        } else {
            console.log(`Parc #${index}: Données invalides`);
        }
    });
    
    return parks;
}

window.listAllParks = listAllParks; 