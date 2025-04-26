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

            // Définir les limites des trottoirs en coordonnées MONDE
            const sidewalkMinX = plotX - sidewalkWidth;
            const sidewalkMaxX = plotX + plotWidth + sidewalkWidth;
            const sidewalkMinZ = plotZ - sidewalkWidth;
            const sidewalkMaxZ = plotZ + plotDepth + sidewalkWidth;

            // Convertir en coordonnées de grille
            const startGrid = this.worldToGrid(sidewalkMinX, sidewalkMinZ);
            const endGrid = this.worldToGrid(sidewalkMaxX, sidewalkMaxZ);

            // Marquer les cellules des trottoirs
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Vérifier si la cellule est sur le trottoir
                    const isOnSidewalk = 
                        (gx >= startGrid.x && gx <= startGrid.x + 1) || // Trottoir gauche
                        (gx >= endGrid.x - 1 && gx <= endGrid.x) || // Trottoir droit
                        (gy >= startGrid.y && gy <= startGrid.y + 1) || // Trottoir bas
                        (gy >= endGrid.y - 1 && gy <= endGrid.y); // Trottoir haut

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
            // Si position est un objet Vector3, on doit accéder à ses propriétés x, y, z
            if (!crosswalk.position || 
                (typeof crosswalk.position.x === 'undefined' && typeof crosswalk.position.getX === 'undefined') || 
                (typeof crosswalk.position.z === 'undefined' && typeof crosswalk.position.getZ === 'undefined')) {
                console.error("PedestrianNavigationGraph: Coordonnées invalides pour un passage piéton:", crosswalk);
                return; // Ignorer ce passage piéton
            }
            
            // Extraire les coordonnées x et z de l'objet position (qu'il s'agisse d'un objet simple ou d'un Vector3)
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