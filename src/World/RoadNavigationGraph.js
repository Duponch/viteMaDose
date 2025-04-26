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
        
        // Initialiser la grille à MARCHABLE
        this.gridWalkableMap.fill(WALKABLE);
        
        // Marquer les parcelles comme zones NON marchables
        console.log("RoadNavigationGraph: Marquage des parcelles comme non marchables...");
        const cellSizeWorld = 1.0 / this.gridScale;
        let markedNonWalkable = 0;
        const sidewalkWidth = this.config.sidewalkWidth || 0; // Récupérer la largeur du trottoir (0 par défaut)

        plots.forEach(plot => {
            // Obtenir les limites de la parcelle SANS le trottoir
            const plotMinX = plot.x;
            const plotMaxX = plot.x + plot.width;
            const plotMinZ = plot.z;
            const plotMaxZ = plot.z + plot.depth;

            // Calculer les limites étendues INCLUANT le trottoir
            const extendedMinX = plotMinX - sidewalkWidth;
            const extendedMaxX = plotMaxX + sidewalkWidth;
            const extendedMinZ = plotMinZ - sidewalkWidth;
            const extendedMaxZ = plotMaxZ + sidewalkWidth;

            // Convertir les coins étendus en coordonnées de grille pour définir une zone de recherche
            // (Pas besoin d'élargir davantage ici car les limites étendues le font déjà)
            const startGrid = this.worldToGrid(extendedMinX, extendedMinZ);
            const endGrid = this.worldToGrid(extendedMaxX, extendedMaxZ);

            // Itérer sur les cellules potentiellement affectées
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Vérifier si les coordonnées de la grille sont valides
                    if (this.isValidGridCoord(gx, gy)) {
                        // Obtenir le centre de la cellule en coordonnées monde
                        const cellCenterWorld = this.gridToWorld(gx, gy);
                        const cx = cellCenterWorld.x;
                        const cz = cellCenterWorld.z;

                        // Vérifier si le centre de la cellule est à l'intérieur de la zone étendue (parcelle + trottoir)
                        if (cx >= extendedMinX && cx < extendedMaxX && cz >= extendedMinZ && cz < extendedMaxZ) {
                            // Vérifier si elle était marchable avant de la marquer non marchable
                            const index = gy * this.gridWidth + gx;
                            if (this.gridWalkableMap[index] === WALKABLE) {
                                this.gridWalkableMap[index] = NON_WALKABLE;
                                markedNonWalkable++;
                            }
                        }
                    }
                }
            }
        });
        console.log(`RoadNavigationGraph: ${markedNonWalkable} cellules marquées comme non marchables (parcelles).`);

        // Mettre à jour la grille pathfinding après les modifications
        this.updatePFGrid();
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

    // Surcharger gridToWorld pour retourner une position au niveau de la route
    gridToWorld(gridX, gridY) {
        const worldPos = super.gridToWorld(gridX, gridY);
        worldPos.y = 0.1; // Légèrement au-dessus de la route
        return worldPos;
    }
} 