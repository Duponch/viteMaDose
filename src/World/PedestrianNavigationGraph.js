class PedestrianNavigationGraph {
    constructor(config) {
        this.config = config;
        this.gridScale = config.gridScale || 1.0;
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
            const startGrid = this.worldToGrid(crosswalk.startX, crosswalk.startZ);
            const endGrid = this.worldToGrid(crosswalk.endX, crosswalk.endZ);

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
    };
} 