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
        this.updatePFGrid();
    }

    markRoadsArea(plots, crosswalkInfos) {
        console.log("RoadNavigationGraph: Marquage des zones de routes...");
        let markedCells = 0;
        const cellSizeWorld = 1.0 / this.gridScale;
        const roadWidth = 6.0; // Largeur fixe de 6 cellules pour la route
        const sidewalkWidth = this.config.sidewalkWidth || 2.0; // Largeur du trottoir

        // Pour chaque parcelle, marquer la route qui la borde
        plots.forEach(plot => {
            const plotX = plot.x;
            const plotZ = plot.z;
            const plotWidth = plot.width;
            const plotDepth = plot.depth;

            // Snapper les coordonnées et dimensions
            const pX = Math.round(plotX / cellSizeWorld) * cellSizeWorld;
            const pZ = Math.round(plotZ / cellSizeWorld) * cellSizeWorld;
            const pW = Math.round(plotWidth / cellSizeWorld) * cellSizeWorld;
            const pD = Math.round(plotDepth / cellSizeWorld) * cellSizeWorld;

            // Définir les limites de la route en coordonnées MONDE
            // La route est entre le trottoir et la parcelle
            const roadMinX = pX - roadWidth;
            const roadMaxX = pX + pW + roadWidth;
            const roadMinZ = pZ - roadWidth;
            const roadMaxZ = pZ + pD + roadWidth;

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
                    const isOnRoad = 
                        // Route à gauche de la parcelle
                        (cx >= pX - roadWidth && cx < pX - sidewalkWidth) ||
                        // Route à droite de la parcelle
                        (cx > pX + pW + sidewalkWidth && cx <= pX + pW + roadWidth) ||
                        // Route en bas de la parcelle
                        (cz >= pZ - roadWidth && cz < pZ - sidewalkWidth) ||
                        // Route en haut de la parcelle
                        (cz > pZ + pD + sidewalkWidth && cz <= pZ + pD + roadWidth);

                    if (isOnRoad) {
                        // Vérifier si la cellule est déjà marchable
                        if (!this.isWalkableAt(gx, gy)) {
                            if (this.markCell(gx, gy)) {
                                markedCells++;
                                if (markedCells % 100 === 0) {
                                    console.log(`RoadNavigationGraph: ${markedCells} cellules de route marquées...`);
                                }
                            }
                        }
                    }
                }
            }
        });

        // Marquer les intersections (zones où les routes se croisent)
        crosswalkInfos.forEach(crosswalk => {
            // Vérifier que les coordonnées du passage piéton sont valides
            if (!crosswalk.position || 
                (typeof crosswalk.position.x === 'undefined' && typeof crosswalk.position.getX === 'undefined') || 
                (typeof crosswalk.position.z === 'undefined' && typeof crosswalk.position.getZ === 'undefined')) {
                console.error("RoadNavigationGraph: Coordonnées invalides pour un passage piéton:", crosswalk);
                return; // Ignorer ce passage piéton
            }
            
            // Extraire les coordonnées x et z de l'objet position
            const posX = typeof crosswalk.position.x !== 'undefined' ? crosswalk.position.x : crosswalk.position.getX();
            const posZ = typeof crosswalk.position.z !== 'undefined' ? crosswalk.position.z : crosswalk.position.getZ();
            
            // Snapper les coordonnées des passages piétons
            const snappedPosX = Math.round(posX / cellSizeWorld) * cellSizeWorld;
            const snappedPosZ = Math.round(posZ / cellSizeWorld) * cellSizeWorld;
            
            const crosswalkGrid = this.worldToGrid(snappedPosX, snappedPosZ);
            
            // Marquer une zone carrée autour du passage piéton pour l'intersection
            // Utiliser la même largeur que la route (6 cellules)
            const intersectionSize = Math.ceil(roadWidth * this.gridScale);
            for (let dy = -intersectionSize; dy <= intersectionSize; dy++) {
                for (let dx = -intersectionSize; dx <= intersectionSize; dx++) {
                    const gx = crosswalkGrid.x + dx;
                    const gy = crosswalkGrid.y + dy;
                    
                    // Vérifier si la cellule est dans la zone de l'intersection
                    const cellCenter = this.gridToWorld(gx, gy);
                    const distanceToCenter = Math.sqrt(
                        Math.pow(cellCenter.x - snappedPosX, 2) + 
                        Math.pow(cellCenter.z - snappedPosZ, 2)
                    );
                    
                    // Ne marquer que les cellules dans un rayon de 6 cellules
                    if (distanceToCenter <= roadWidth) {
                        if (!this.isWalkableAt(gx, gy)) {
                            if (this.markCell(gx, gy)) {
                                markedCells++;
                            }
                        }
                    }
                }
            }
        });

        console.log(`RoadNavigationGraph: ${markedCells} cellules de route marquées au total.`);
        this.updatePFGrid();
    }

    // Surcharger gridToWorld pour retourner une position au niveau de la route
    gridToWorld(gridX, gridY) {
        const worldPos = super.gridToWorld(gridX, gridY);
        worldPos.y = 0.1; // Légèrement au-dessus de la route
        return worldPos;
    }
} 