import NavigationGraph from './NavigationGraph.js';
import * as THREE from 'three';

const WALKABLE = 0;
const NON_WALKABLE = 1;

export default class RoadNavigationGraph extends NavigationGraph {
    constructor(config) {
        super(config);
        this.debugMaterialWalkable = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }); // Rouge pour les routes
    }

    buildGraph(plots, crosswalkInfos) {
        // Appeler la méthode parent pour initialiser la grille
        super.buildGraph(plots, crosswalkInfos);

        // Marquer les routes comme zones de navigation pour les voitures
        this.markRoadsArea(plots, crosswalkInfos);
    }

    markRoadsArea(plots, crosswalkInfos) {
        console.log("RoadNavigationGraph: Marquage des zones de routes...");
        let markedCells = 0;
        const cellSizeWorld = 1.0 / this.gridScale;
        const roadWidth = this.config.roadWidth || 4.0; // Largeur de la route
        const sidewalkWidth = this.config.sidewalkWidth || 2.0; // Largeur du trottoir

        // Pour chaque parcelle, marquer la route qui la borde
        plots.forEach(plot => {
            const plotX = plot.x;
            const plotZ = plot.z;
            const plotWidth = plot.width;
            const plotDepth = plot.depth;

            // Définir les limites de la route en coordonnées MONDE
            // La route est entre le trottoir et la parcelle
            const roadMinX = plotX - roadWidth;
            const roadMaxX = plotX + plotWidth + roadWidth;
            const roadMinZ = plotZ - roadWidth;
            const roadMaxZ = plotZ + plotDepth + roadWidth;

            // Convertir en coordonnées de grille
            const startGrid = this.worldToGrid(roadMinX, roadMinZ);
            const endGrid = this.worldToGrid(roadMaxX, roadMaxZ);

            // Marquer les cellules de la route
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Obtenir la position mondiale du centre de la cellule
                    const cellCenterWorld = this.gridToWorld(gx, gy);
                    const cx = cellCenterWorld.x;
                    const cz = cellCenterWorld.z;

                    // Vérifier si la cellule est sur la route (et non sur le trottoir)
                    // La route est entre le trottoir et la parcelle
                    const isOnRoad = 
                        // Route à gauche de la parcelle
                        (cx >= plotX - roadWidth && cx < plotX - sidewalkWidth) ||
                        // Route à droite de la parcelle
                        (cx > plotX + plotWidth + sidewalkWidth && cx <= plotX + plotWidth + roadWidth) ||
                        // Route en bas de la parcelle
                        (cz >= plotZ - roadWidth && cz < plotZ - sidewalkWidth) ||
                        // Route en haut de la parcelle
                        (cz > plotZ + plotDepth + sidewalkWidth && cz <= plotZ + plotDepth + roadWidth);

                    if (isOnRoad) {
                        if (this.markCell(gx, gy)) {
                            markedCells++;
                        }
                    }
                }
            }
        });

        console.log(`RoadNavigationGraph: ${markedCells} cellules de route marquées.`);
    }

    // Surcharger gridToWorld pour retourner une position au niveau de la route
    gridToWorld(gridX, gridY) {
        const worldPos = super.gridToWorld(gridX, gridY);
        worldPos.y = 0.1; // Légèrement au-dessus de la route
        return worldPos;
    }
} 