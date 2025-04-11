// src/World/NavigationGraph.js
import * as THREE from 'three';
import * as PF from 'pathfinding';

export default class NavigationGraph {
    constructor(config) {
        this.config = config;
        this.grid = null;
        this.gridScale = 1.0; // Ajustez si nécessaire pour plus de précision (ex: 2 pour 2 noeuds par mètre)
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.offsetX = 0; // Pour convertir world X -> grid X
        this.offsetZ = 0; // Pour convertir world Z -> grid Y (Z devient Y dans la grille 2D)
        this.sidewalkHeight = config.sidewalkHeight || 0.2; // Hauteur des points du chemin
        console.log("NavigationGraph: Initialisé.");
    }

    /**
     * Construit la grille de navigation à partir des parcelles et des passages piétons.
     * @param {Array<Plot>} plots - Liste des parcelles finales (leafPlots).
     * @param {Array<object>} crosswalkInfos - Informations sur les passages piétons.
     */
    buildGraph(plots, crosswalkInfos) {
        console.log("NavigationGraph: Construction de la grille...");
        const mapSize = this.config.mapSize;
        const sidewalkWidth = this.config.sidewalkWidth;

        // Déterminer la taille de la grille et les offsets
        // La grille doit couvrir toute la map + les trottoirs qui dépassent
        const worldMinX = -mapSize / 2 - sidewalkWidth;
        const worldMaxX = mapSize / 2 + sidewalkWidth;
        const worldMinZ = -mapSize / 2 - sidewalkWidth;
        const worldMaxZ = mapSize / 2 + sidewalkWidth;

        this.gridWidth = Math.ceil((worldMaxX - worldMinX) * this.gridScale);
        this.gridHeight = Math.ceil((worldMaxZ - worldMinZ) * this.gridScale); // Z devient la hauteur de la grille
        this.offsetX = -worldMinX * this.gridScale;
        this.offsetZ = -worldMinZ * this.gridScale;

        // Créer la grille PF.Grid, initialement tout est non marchable
        this.grid = new PF.Grid(this.gridWidth, this.gridHeight);
        console.log(`NavigationGraph: Grille créée (${this.gridWidth}x${this.gridHeight})`);

        // Marquer les trottoirs comme marchables
        this.markSidewalks(plots, sidewalkWidth);

        // Marquer les passages piétons comme marchables
        this.markCrosswalks(crosswalkInfos);

        console.log("NavigationGraph: Grille construite.");
    }

    /** Convertit les coordonnées World (X, Z) en coordonnées Grid (X, Y) */
    worldToGrid(worldX, worldZ) {
        const gridX = Math.floor(worldX * this.gridScale + this.offsetX);
        const gridY = Math.floor(worldZ * this.gridScale + this.offsetZ); // world Z -> grid Y
        return { x: gridX, y: gridY };
    }

    /** Convertit les coordonnées Grid (X, Y) en coordonnées World (X, Y, Z) */
    gridToWorld(gridX, gridY) {
        const worldX = (gridX - this.offsetX) / this.gridScale;
        const worldZ = (gridY - this.offsetZ) / this.gridScale; // grid Y -> world Z
        return new THREE.Vector3(worldX, this.sidewalkHeight, worldZ); // Positionner à la hauteur du trottoir
    }

    /** Marque les cellules de la grille correspondant aux trottoirs */
    markSidewalks(plots, sidewalkW) {
        console.log("NavigationGraph: Marquage des trottoirs...");
        let markedCells = 0;
        plots.forEach(plot => {
            const pX = plot.x; const pZ = plot.z;
            const pW = plot.width; const pD = plot.depth;

            // Définir les 8 points d'angle du trottoir entourant la parcelle
            const cornersWorld = [
                { x: pX - sidewalkW, z: pZ - sidewalkW },         // Coin extérieur HG
                { x: pX + pW + sidewalkW, z: pZ - sidewalkW },     // Coin extérieur HD
                { x: pX + pW + sidewalkW, z: pZ + pD + sidewalkW }, // Coin extérieur BD
                { x: pX - sidewalkW, z: pZ + pD + sidewalkW },     // Coin extérieur BG
                { x: pX, z: pZ },                                 // Coin intérieur HG
                { x: pX + pW, z: pZ },                             // Coin intérieur HD
                { x: pX + pW, z: pZ + pD },                         // Coin intérieur BD
                { x: pX, z: pZ + pD }                              // Coin intérieur BG
            ];

            // Convertir les coins en coordonnées de grille
            const cornersGrid = cornersWorld.map(c => this.worldToGrid(c.x, c.z));

            // --- Remplir la zone du trottoir ---
            // Méthode simple : Parcourir le rectangle englobant et marquer si c'est dans le trottoir

            // Trouver les min/max de la grille pour la zone du trottoir
            const minGridX = Math.min(cornersGrid[0].x, cornersGrid[3].x);
            const maxGridX = Math.max(cornersGrid[1].x, cornersGrid[2].x);
            const minGridY = Math.min(cornersGrid[0].y, cornersGrid[1].y); // Z -> Y
            const maxGridY = Math.max(cornersGrid[2].y, cornersGrid[3].y); // Z -> Y

            // Trouver les min/max de la grille pour la zone INTERIEURE (la parcelle elle-même)
            const innerMinGridX = cornersGrid[4].x;
            const innerMaxGridX = cornersGrid[5].x;
            const innerMinGridY = cornersGrid[4].y; // Z -> Y
            const innerMaxGridY = cornersGrid[7].y; // Z -> Y


            for (let gx = minGridX; gx <= maxGridX; gx++) {
                for (let gy = minGridY; gy <= maxGridY; gy++) {
                    // Est-ce DANS le rectangle extérieur MAIS HORS du rectangle intérieur ?
                    const isOutsideInner = (gx < innerMinGridX || gx >= innerMaxGridX || gy < innerMinGridY || gy >= innerMaxGridY);

                    if (isOutsideInner) {
                        if (this.isValidGridCoord(gx, gy) && this.grid.isWalkableAt(gx, gy) === false) {
                             this.grid.setWalkableAt(gx, gy, true);
                             markedCells++;
                        }
                    }
                }
            }
            // Alternative plus précise : tracer des lignes épaisses entre les coins extérieurs
            // this.drawLineOnGrid(cornersGrid[0], cornersGrid[1], sidewalkW * this.gridScale); // Haut
            // this.drawLineOnGrid(cornersGrid[1], cornersGrid[2], sidewalkW * this.gridScale); // Droite
            // this.drawLineOnGrid(cornersGrid[2], cornersGrid[3], sidewalkW * this.gridScale); // Bas
            // this.drawLineOnGrid(cornersGrid[3], cornersGrid[0], sidewalkW * this.gridScale); // Gauche
        });
         console.log(`NavigationGraph: ${markedCells} cellules de trottoir marquées.`);
    }

     /** Marque les cellules de la grille correspondant aux passages piétons */
    markCrosswalks(crosswalkInfos) {
        console.log("NavigationGraph: Marquage des passages piétons...");
         let markedCells = 0;
         const crosswalkWidthOnGrid = Math.max(1, Math.floor(this.config.roadWidth * 0.9 * this.gridScale)); // Largeur du passage piéton sur la grille

        crosswalkInfos.forEach(info => {
            const pos = info.position;
            const angle = info.angle;
            const length = info.length; // Longueur réelle du passage

            // Calculer les points de départ et d'arrivée du passage piéton dans le monde
            const halfLength = length / 2;
            let dx = 0, dz = 0;

            // Le passage piéton est parallèle à l'axe X (route Verticale) ou Z (route Horizontale)
             // L'info.angle est 0 pour route H (passage vertical), PI/2 pour route V (passage horizontal)
             if (Math.abs(angle) < 0.1) { // Angle ~0 (route H) => passage vertical (sur Z)
                dz = halfLength;
            } else { // Angle ~PI/2 (route V) => passage horizontal (sur X)
                 dx = halfLength;
             }

            const startWorld = new THREE.Vector3(pos.x - dx, this.sidewalkHeight, pos.z - dz);
            const endWorld = new THREE.Vector3(pos.x + dx, this.sidewalkHeight, pos.z + dz);

            // Convertir en coordonnées de grille
            const startGrid = this.worldToGrid(startWorld.x, startWorld.z);
            const endGrid = this.worldToGrid(endWorld.x, endWorld.z);

            // Tracer une ligne épaisse sur la grille
            markedCells += this.drawLineOnGrid(startGrid, endGrid, crosswalkWidthOnGrid);
        });
         console.log(`NavigationGraph: ${markedCells} cellules de passage piéton marquées.`);
    }

     /**
      * Trace une ligne épaisse entre deux points sur la grille (Algo de Bresenham modifié).
      * Retourne le nombre de cellules marquées.
      */
     drawLineOnGrid(start, end, thickness) {
        let markedCount = 0;
        let x0 = Math.floor(start.x); let y0 = Math.floor(start.y);
        let x1 = Math.floor(end.x); let y1 = Math.floor(end.y);
        let dx = Math.abs(x1 - x0); let sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0); let sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        let halfThickness = Math.floor(thickness / 2);

        while (true) {
            // Marquer le point central et ses voisins selon l'épaisseur
            for (let i = -halfThickness; i <= halfThickness; i++) {
                for (let j = -halfThickness; j <= halfThickness; j++) {
                    // Optionnel: Pour une ligne droite, marquer seulement perpendiculairement
                    // Exemple simple: marquer un carré autour
                     let curX = x0 + i;
                     let curY = y0 + j;
                     if (this.isValidGridCoord(curX, curY) && !this.grid.isWalkableAt(curX, curY)) {
                         this.grid.setWalkableAt(curX, curY, true);
                         markedCount++;
                     }
                }
            }

            if (x0 == x1 && y0 == y1) break;
            let e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
        return markedCount;
     }


    /** Vérifie si les coordonnées de la grille sont valides */
    isValidGridCoord(x, y) {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

     /** Trouve le nœud marchable le plus proche d'une position monde */
    getClosestWalkableNode(worldPos) {
         if (!this.grid) return null;

        const startGrid = this.worldToGrid(worldPos.x, worldPos.z);
        let bestNode = null;
        let minDstSq = Infinity;

        // 1. Vérifier le point exact
        if (this.isValidGridCoord(startGrid.x, startGrid.y) && this.grid.isWalkableAt(startGrid.x, startGrid.y)) {
            bestNode = startGrid;
            minDstSq = 0;
        }

        // 2. Recherche en spirale si le point exact n'est pas marchable ou si on veut le plus proche
        // Recherche plus large pour garantir de trouver un point trottoir
        const maxSearchRadius = Math.max(15, Math.ceil(this.config.sidewalkWidth * 2 * this.gridScale)); // Rayon de recherche en cellules de grille
        let foundInSpiral = false;

        for (let r = 1; r <= maxSearchRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    // Considérer seulement le périmètre du carré pour la recherche spirale
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

                    const cx = startGrid.x + dx;
                    const cy = startGrid.y + dy;

                    if (this.isValidGridCoord(cx, cy) && this.grid.isWalkableAt(cx, cy)) {
                         // Calculer la distance dans le monde réel pour la précision
                         const worldCandidate = this.gridToWorld(cx, cy);
                         const dstSq = worldPos.distanceToSquared(worldCandidate);

                        if (dstSq < minDstSq) {
                             minDstSq = dstSq;
                             bestNode = { x: cx, y: cy };
                             foundInSpiral = true; // Marquer qu'on a trouvé via spirale
                        }
                    }
                }
            }
             // Si on a trouvé un point plus proche dans ce rayon de la spirale, on peut arrêter la recherche plus tôt
            if (foundInSpiral && bestNode) break;
        }

        if (!bestNode) {
             console.warn("NavigationGraph: Aucun nœud marchable trouvé près de", worldPos);
         }
         // else {
         //     console.log("Closest node found:", bestNode, "for world pos:", worldPos);
         // }

        return bestNode; // {x, y} ou null
    }

    destroy() {
         this.grid = null; // Libère la référence à la grille
         console.log("NavigationGraph: Détruit.");
     }
}