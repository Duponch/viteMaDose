import NavigationGraph from './NavigationGraph.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WALKABLE = 0;
const NON_WALKABLE = 1;

export default class RoadNavigationGraph extends NavigationGraph {
    constructor(config) {
        super(config);
        // Définir explicitement la largeur de la route à 6 cellules
        this.config.roadWidth = 6.0;
        this.config.sidewalkWidth = 2.0;
        this.debugMaterialWalkable = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }); // Rouge pour les routes
    }

    buildGraph(plots, crosswalkInfos) {
        // Appeler la méthode parent pour initialiser la grille
        super.buildGraph(plots, crosswalkInfos);

        // Réinitialiser complètement la grille pour les routes
        this.rebuildRoadGrid(plots, crosswalkInfos);
        this.updatePFGrid();
    }

    rebuildRoadGrid(plots, crosswalkInfos) {
        console.log("RoadNavigationGraph: Reconstruction complète de la grille routière...");
        
        // Réinitialiser la grille à non marchable
        this.gridWalkableMap.fill(NON_WALKABLE);
        
        // Marquer les routes comme zones de navigation pour les voitures
        this.markRoadsArea(plots, crosswalkInfos);
    }

    markRoadsArea(plots, crosswalkInfos) {
        console.log("RoadNavigationGraph: Marquage des zones de routes...");
        let markedCells = 0;
        const cellSizeWorld = 1.0 / this.gridScale;
        const roadWidth = this.config.roadWidth; // Utiliser la largeur définie dans la configuration
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
            // La route est entre le trottoir et la parcelle, avec une largeur exacte de 6 cellules
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
                        // Route à gauche de la parcelle (exactement 6 cellules)
                        (cx >= pX - roadWidth && cx < pX) ||
                        // Route à droite de la parcelle (exactement 6 cellules)
                        (cx > pX + pW && cx <= pX + pW + roadWidth) ||
                        // Route en bas de la parcelle (exactement 6 cellules)
                        (cz >= pZ - roadWidth && cz < pZ) ||
                        // Route en haut de la parcelle (exactement 6 cellules)
                        (cz > pZ + pD && cz <= pZ + pD + roadWidth);

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
                        // Vérifier si la cellule est déjà marchable
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

    updatePFGrid() {
        super.updatePFGrid();
        this.debugGridInfo();
    }

    debugGridInfo() {
        if (!this.gridWalkableMap) return;
        
        let walkableCount = 0;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const index = y * this.gridWidth + x;
                if (this.gridWalkableMap[index] === WALKABLE) {
                    walkableCount++;
                }
            }
        }
        
        console.log(`RoadNavigationGraph: Grille de ${this.gridWidth}x${this.gridHeight} cellules, ${walkableCount} cellules marchables (${(walkableCount / (this.gridWidth * this.gridHeight) * 100).toFixed(2)}%)`);
    }

    createDebugVisualization(targetGroup) {
        if (!this.gridWalkableMap || !targetGroup) return;
        console.log("RoadNavigationGraph: Création de la visualisation de la grille routière...");
        
        // Nettoyer le groupe cible
        while(targetGroup.children.length > 0) {
            const child = targetGroup.children[0];
            targetGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
        }
        
        const cellSizeInWorld = 1.0 / this.gridScale;
        const visualCellSize = cellSizeInWorld * 0.95; // Ajuster la taille visuelle si besoin
        const planeGeom = new THREE.PlaneGeometry(visualCellSize, visualCellSize);
        const geometries = [];
        let walkableCount = 0;
        
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.isWalkableAt(x, y)) {
                    walkableCount++;
                    // Utiliser gridToWorld pour obtenir le centre exact de la cellule
                    const cellCenter = this.gridToWorld(x, y);
                    const planeCenterX = cellCenter.x;
                    const planeCenterZ = cellCenter.z;

                    const cellGeom = planeGeom.clone();
                    const matrix = new THREE.Matrix4();
                    matrix.makeRotationX(-Math.PI / 2);
                    // Utiliser la position calculée du centre du plan
                    matrix.setPosition(planeCenterX, 0.1, planeCenterZ); // Positionner au niveau de la route
                    cellGeom.applyMatrix4(matrix);
                    geometries.push(cellGeom);
                }
            }
        }
        planeGeom.dispose();

        if (geometries.length > 0) {
            const mergedGeometry = mergeGeometries(geometries);
            if (mergedGeometry) {
                const mesh = new THREE.Mesh(mergedGeometry, this.debugMaterialWalkable);
                mesh.name = "Debug_RoadNavGrid_Walkable";
                targetGroup.add(mesh);
                console.log(`RoadNavigationGraph: Visualisation grille routière ajoutée (${walkableCount} cellules marchables).`);
            } else {
                console.warn("RoadNavigationGraph: Échec fusion géométries debug grille routière.");
            }
        } else {
            console.log("RoadNavigationGraph: Aucune cellule marchable à visualiser dans la grille routière.");
        }
    }
} 