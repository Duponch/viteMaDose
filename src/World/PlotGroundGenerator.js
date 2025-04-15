// src/World/PlotGroundGenerator.js
import * as THREE from 'three';

/**
 * @typedef {import('./Plot.js').default} Plot
 */

/**
 * Génère les meshes représentant le sol pour chaque parcelle individuelle.
 */
export default class PlotGroundGenerator {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale (peut contenir plotGroundY).
     * @param {object} materials - Matériaux partagés (contient les matériaux de sol par type: parkMaterial, houseGroundMaterial, etc.).
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;

        // Vérifier si les matériaux nécessaires existent (optionnel mais recommandé)
        const requiredMaterials = [
            'parkMaterial', 'houseGroundMaterial', 'buildingGroundMaterial',
            'industrialGroundMaterial', 'skyscraperGroundMaterial'
        ];
        requiredMaterials.forEach(matName => {
            if (!this.materials[matName]) {
                console.warn(`PlotGroundGenerator: Material '${matName}' not found in provided materials. Fallback or errors might occur.`);
                // Ajouter un fallback si nécessaire, ex:
                // this.materials[matName] = new THREE.MeshStandardMaterial({ color: 0x888888 });
            }
        });
    }

    /**
     * Crée et retourne un groupe contenant les meshes de sol pour toutes les parcelles.
     * @param {Array<Plot>} plots - Tableau des parcelles finales (feuilles).
     * @returns {THREE.Group | null} Le groupe contenant les meshes de sol ou null si pas de parcelles.
     */
    generateGrounds(plots) {
        if (!plots || plots.length === 0) {
            console.log("PlotGroundGenerator: No plots provided, skipping ground generation.");
            return null;
        }

        console.log("PlotGroundGenerator: Generating plot ground meshes...");
        const groundGroup = new THREE.Group();
        groundGroup.name = "PlotGrounds"; // Nom du groupe pour débogage

        // Récupérer la hauteur Y du sol depuis la config (avec fallback)
        const groundY = this.config.plotGroundY ?? 0.005;
        let groundsCreated = 0;

        plots.forEach(plot => {
            // Créer la géométrie du plan
            const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);

            // Sélectionner le matériau en fonction du type de zone
            let groundMaterial;
            switch (plot.zoneType) {
                case 'park':
                    groundMaterial = this.materials.parkMaterial;
                    break;
                case 'house':
                    groundMaterial = this.materials.houseGroundMaterial;
                    break;
                case 'building':
                    groundMaterial = this.materials.buildingGroundMaterial;
                    break;
                case 'industrial':
                    groundMaterial = this.materials.industrialGroundMaterial;
                    break;
                case 'skyscraper':
                    groundMaterial = this.materials.skyscraperGroundMaterial;
                    break;
                case 'unbuildable':
                     // Pas de sol visible pour les zones non constructibles (ou un matériau différent)
                     groundGeom.dispose(); // Libérer la géométrie si non utilisée
                     return; // Passer à la parcelle suivante
                default:
                    console.warn(`PlotGroundGenerator: Plot ${plot.id} has unhandled zoneType ('${plot.zoneType}') for ground color. Using 'buildingGroundMaterial'.`);
                    groundMaterial = this.materials.buildingGroundMaterial;
            }

            // Vérifier si le matériau a été trouvé (au cas où le fallback n'est pas défini)
            if (!groundMaterial) {
                console.error(`PlotGroundGenerator: Material not found for zoneType '${plot.zoneType}' in plot ${plot.id}. Skipping ground mesh.`);
                groundGeom.dispose();
                return; // Passer à la parcelle suivante
            }

            // Créer le mesh
            const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);

            // Positionner et orienter le mesh
            groundMesh.rotation.x = -Math.PI / 2; // Orienter horizontalement
            // Utiliser le centre de la parcelle pour la position
            const plotCenter = plot.center; // Utilise le getter de Plot.js
            groundMesh.position.set(plotCenter.x, groundY, plotCenter.z);

            // Propriétés d'ombre et nom
            groundMesh.receiveShadow = true; // Le sol reçoit les ombres
            groundMesh.castShadow = false;   // Le sol ne projette pas d'ombres
            groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;

            // Ajouter au groupe
            groundGroup.add(groundMesh);
            groundsCreated++;
        }); // Fin boucle plots

        console.log(`PlotGroundGenerator: ${groundsCreated} ground meshes created and added to group.`);
        return groundGroup;
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}