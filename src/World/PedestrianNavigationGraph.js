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
        console.log("PedestrianNavigationGraph: Marquage des trottoirs et passages piétons...");
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
            const startGrid = this.worldToGrid(outerMinWorldX - 1, outerMinWorldZ - 1);
            const endGrid = this.worldToGrid(outerMaxWorldX + 1, outerMaxWorldZ + 1);

            // Marquer les cellules des trottoirs
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Obtenir le centre de la cellule en coordonnées MONDE
                    const cellCenter = this.gridToWorld(gx, gy);
                    const cx = cellCenter.x;
                    const cz = cellCenter.z;

                    // Vérifier si le centre de la cellule est sur le trottoir
                    const isOnSidewalk = 
                        // Trottoir gauche
                        (cx >= outerMinWorldX && cx < innerMinWorldX) ||
                        // Trottoir droit
                        (cx > innerMaxWorldX && cx <= outerMaxWorldX) ||
                        // Trottoir bas
                        (cz >= outerMinWorldZ && cz < innerMinWorldZ) ||
                        // Trottoir haut
                        (cz > innerMaxWorldZ && cz <= outerMaxWorldZ);

                    if (isOnSidewalk) {
                        if (this.markCell(gx, gy)) {
                            markedCells++;
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
            
            const startGrid = this.worldToGrid(startX, startZ);
            const endGrid = this.worldToGrid(endX, endZ);

            // Marquer les cellules du passage piéton
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    if (this.markCell(gx, gy)) {
                        markedCells++;
                    }
                }
            }
        });

        console.log(`PedestrianNavigationGraph: ${markedCells} cellules de trottoirs et passages piétons marquées.`);
    }
} 