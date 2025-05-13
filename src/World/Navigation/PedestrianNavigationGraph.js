import NavigationGraph from './NavigationGraph.js';

export default class PedestrianNavigationGraph extends NavigationGraph {
    constructor(config) {
        super(config);
        this.gridScale = config.gridScale || 1.0;
    }

    buildGraph(plots, crosswalkInfos) {
        // Appeler la méthode parent pour initialiser la grille
        super.buildGraph(plots, crosswalkInfos);

        // Marquer les trottoirs et passages piétons
        this.markSidewalksAndCrosswalks(plots, crosswalkInfos);
        this.updatePFGrid();
    }

    markSidewalksAndCrosswalks(plots, crosswalkInfos) {
        //console.log("PedestrianNavigationGraph: Marquage des trottoirs et passages piétons...");
        let markedCells = 0;
        const cellSizeWorld = 1.0 / this.gridScale;
        const sidewalkWidth = this.config.sidewalkWidth || 2.0; // Largeur du trottoir

        // Pour chaque parcelle, marquer les trottoirs qui la bordent
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

            // Définir les limites des trottoirs en coordonnées MONDE
            const outerMinWorldX = pX - sidewalkWidth;
            const outerMaxWorldX = pX + pW + sidewalkWidth;
            const outerMinWorldZ = pZ - sidewalkWidth;
            const outerMaxWorldZ = pZ + pD + sidewalkWidth;

            // Limites internes du plot
            const innerMinWorldX = pX;
            const innerMaxWorldX = pX + pW;
            const innerMinWorldZ = pZ;
            const innerMaxWorldZ = pZ + pD;

            // Convertir en coordonnées de grille
            const startGrid = this.worldToGrid(outerMinWorldX, outerMinWorldZ);
            const endGrid = this.worldToGrid(outerMaxWorldX, outerMaxWorldZ);

            // Marquer les cellules des trottoirs
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Obtenir le centre de la cellule en coordonnées MONDE
                    const cellCenter = this.gridToWorld(gx, gy);
                    const cx = cellCenter.x;
                    const cz = cellCenter.z;

                    // Vérifier si le centre de la cellule est sur le trottoir
                    // Exclure les coins pour éviter le dépassement
                    const isOnSidewalk = 
                        // Trottoir gauche (exclure les coins)
                        (cx >= outerMinWorldX && cx < innerMinWorldX && 
                         cz >= innerMinWorldZ && cz <= innerMaxWorldZ) ||
                        // Trottoir droit (exclure les coins)
                        (cx > innerMaxWorldX && cx <= outerMaxWorldX && 
                         cz >= innerMinWorldZ && cz <= innerMaxWorldZ) ||
                        // Trottoir bas (exclure les coins)
                        (cz >= outerMinWorldZ && cz < innerMinWorldZ && 
                         cx >= innerMinWorldX && cx <= innerMaxWorldX) ||
                        // Trottoir haut (exclure les coins)
                        (cz > innerMaxWorldZ && cz <= outerMaxWorldZ && 
                         cx >= innerMinWorldX && cx <= innerMaxWorldX);

                    if (isOnSidewalk) {
                        // Vérifier si la cellule est déjà marchable (pour éviter les chevauchements)
                        if (!this.isWalkableAt(gx, gy)) {
                            if (this.markCell(gx, gy)) {
                                markedCells++;
                            }
                        }
                    }
                }
            }
        });

        // Marquer les passages piétons
        crosswalkInfos.forEach(crosswalk => {
            // Vérifier que les coordonnées du passage piéton sont valides
            if (!crosswalk.position || 
                (typeof crosswalk.position.x === 'undefined' && typeof crosswalk.position.getX === 'undefined') || 
                (typeof crosswalk.position.z === 'undefined' && typeof crosswalk.position.getZ === 'undefined')) {
                console.error("PedestrianNavigationGraph: Coordonnées invalides pour un passage piéton:", crosswalk);
                return; // Ignorer ce passage piéton
            }
            
            // Extraire les coordonnées x et z de l'objet position
            const startX = typeof crosswalk.position.x !== 'undefined' ? crosswalk.position.x : crosswalk.position.getX();
            const startZ = typeof crosswalk.position.z !== 'undefined' ? crosswalk.position.z : crosswalk.position.getZ();
            const endX = typeof crosswalk.endX !== 'undefined' ? crosswalk.endX : startX;
            const endZ = typeof crosswalk.endZ !== 'undefined' ? crosswalk.endZ : startZ;
            
            // Snapper les coordonnées des passages piétons
            const snappedStartX = Math.round(startX / cellSizeWorld) * cellSizeWorld;
            const snappedStartZ = Math.round(startZ / cellSizeWorld) * cellSizeWorld;
            const snappedEndX = Math.round(endX / cellSizeWorld) * cellSizeWorld;
            const snappedEndZ = Math.round(endZ / cellSizeWorld) * cellSizeWorld;
            
            const startGrid = this.worldToGrid(snappedStartX, snappedStartZ);
            const endGrid = this.worldToGrid(snappedEndX, snappedEndZ);

            // Marquer les cellules du passage piéton
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Vérifier si la cellule est déjà marchable (pour éviter les chevauchements)
                    if (!this.isWalkableAt(gx, gy)) {
                        if (this.markCell(gx, gy)) {
                            markedCells++;
                        }
                    }
                }
            }
        });

        //console.log(`PedestrianNavigationGraph: ${markedCells} cellules de trottoirs et passages piétons marquées.`);
    }
} 