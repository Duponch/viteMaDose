/**
 * Commandes de test pour le système LOD des bâtiments
 * À utiliser dans la console du navigateur pour tester le système
 */

// Exposer les commandes globalement pour faciliter les tests
window.buildingLODTest = {
    
    /**
     * Active ou désactive le LOD des bâtiments
     * @param {boolean} enabled - True pour activer, false pour désactiver
     */
    setLOD: (enabled) => {
        const imm = window.experience?.world?.cityManager?.contentGenerator?.instancedMeshManager;
        if (imm) {
            imm.setBuildingLOD(enabled);
            console.log(`LOD des bâtiments ${enabled ? 'activé' : 'désactivé'}`);
        } else {
            console.error('InstancedMeshManager non trouvé');
        }
    },

    /**
     * Définit la distance LOD
     * @param {number} distance - Distance en unités de monde
     */
    setDistance: (distance) => {
        const imm = window.experience?.world?.cityManager?.contentGenerator?.instancedMeshManager;
        if (imm) {
            imm.setBuildingLODDistance(distance);
            console.log(`Distance LOD définie à ${distance}`);
        } else {
            console.error('InstancedMeshManager non trouvé');
        }
    },

    /**
     * Force la mise à jour de la visibilité LOD
     */
    updateVisibility: () => {
        const imm = window.experience?.world?.cityManager?.contentGenerator?.instancedMeshManager;
        if (imm) {
            imm.updateLODVisibility();
            console.log('Visibilité LOD mise à jour');
        } else {
            console.error('InstancedMeshManager non trouvé');
        }
    },

    /**
     * Affiche les statistiques des meshes LOD
     */
    showStats: () => {
        const imm = window.experience?.world?.cityManager?.contentGenerator?.instancedMeshManager;
        if (imm) {
            console.log('=== Statistiques LOD des bâtiments ===');
            console.log('LOD activé:', imm.enableBuildingLOD);
            console.log('Distance LOD:', imm.buildingLODDistance);
            console.log('Meshes haute qualité:', Object.keys(imm.instancedMeshes).length);
            console.log('Meshes LOD:', Object.keys(imm.lodInstancedMeshes).length);
            
            // Afficher la visibilité de chaque type
            Object.entries(imm.lodInstancedMeshes).forEach(([type, mesh]) => {
                console.log(`${type} LOD: visible=${mesh.visible}, instances=${mesh.count}`);
            });
        } else {
            console.error('InstancedMeshManager non trouvé');
        }
    },

    /**
     * Teste le basculement automatique en déplaçant la caméra
     * @param {number} distance - Distance à laquelle déplacer la caméra
     */
    testCameraDistance: (distance) => {
        const camera = window.experience?.camera?.instance;
        if (camera) {
            camera.position.set(0, distance * 0.5, distance);
            camera.lookAt(0, 0, 0);
            console.log(`Caméra déplacée à distance ${distance}`);
            
            // Forcer la mise à jour
            window.buildingLODTest.updateVisibility();
        } else {
            console.error('Caméra non trouvée');
        }
    },

    /**
     * Affiche les couleurs des différents types de bâtiments
     */
    showColors: () => {
        const lodRenderer = window.experience?.world?.cityManager?.contentGenerator?.instancedMeshManager?.buildingLODRenderer;
        if (lodRenderer) {
            console.log('=== Couleurs des bâtiments LOD ===');
            Object.entries(lodRenderer.buildingColors).forEach(([type, color]) => {
                console.log(`${type}: #${color.toString(16).padStart(6, '0')}`);
            });
        } else {
            console.error('BuildingLODRenderer non trouvé');
        }
    },

    /**
     * Commandes d'aide
     */
    help: () => {
        console.log(`
=== Commandes de test LOD des bâtiments ===

buildingLODTest.setLOD(true/false)     - Active/désactive le LOD
buildingLODTest.setDistance(100)       - Définit la distance LOD
buildingLODTest.updateVisibility()     - Force la mise à jour
buildingLODTest.showStats()            - Affiche les statistiques
buildingLODTest.testCameraDistance(200) - Teste en déplaçant la caméra
buildingLODTest.showColors()           - Affiche les couleurs des types
buildingLODTest.help()                 - Affiche cette aide

Exemples d'utilisation:
- buildingLODTest.setLOD(true)         // Active le LOD
- buildingLODTest.setDistance(150)     // Distance LOD à 150 unités
- buildingLODTest.testCameraDistance(200) // Teste avec caméra éloignée
        `);
    }
};

// Afficher l'aide au chargement
console.log('Commandes de test LOD des bâtiments chargées. Tapez buildingLODTest.help() pour l\'aide.'); 