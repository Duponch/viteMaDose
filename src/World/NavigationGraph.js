// src/World/NavigationGraph.js
import * as THREE from 'three';
import * as PF from 'pathfinding';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class NavigationGraph {
	constructor(config) {
        this.config = config; // Assure-toi que config contient bien sidewalkWidth, crosswalkStripe*, roadWidth etc.
        this.grid = null;
        this.gridScale = 1.0;
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.offsetX = 0;
        this.offsetZ = 0;
        this.sidewalkHeight = config.sidewalkHeight !== undefined ? config.sidewalkHeight : 0.2;
        this.debugMaterialWalkable = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        this.debugMaterialPath = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
        console.log("NavigationGraph: Initialisé.");
    }

    buildGraph(plots, crosswalkInfos) {
        console.log("NavigationGraph: Construction de la grille...");
        const mapSize = this.config.mapSize;
        const sidewalkWidth = this.config.sidewalkWidth;
        const worldMinX = -mapSize / 2 - sidewalkWidth;
        const worldMaxX = mapSize / 2 + sidewalkWidth;
        const worldMinZ = -mapSize / 2 - sidewalkWidth;
        const worldMaxZ = mapSize / 2 + sidewalkWidth;

        this.gridWidth = Math.ceil((worldMaxX - worldMinX) * this.gridScale);
        this.gridHeight = Math.ceil((worldMaxZ - worldMinZ) * this.gridScale);
        this.offsetX = -worldMinX * this.gridScale;
        this.offsetZ = -worldMinZ * this.gridScale;

        this.grid = new PF.Grid(this.gridWidth, this.gridHeight);
        console.log(`NavigationGraph: Grille créée (${this.gridWidth}x${this.gridHeight})`);
        console.log("NavigationGraph: Initialisation de la grille comme non marchable...");
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                this.grid.setWalkableAt(x, y, false);
            }
        }
        console.log("NavigationGraph: Initialisation non marchable terminée.");
        this.markSidewalksArea(plots, sidewalkWidth);
        this.markCrosswalksCorrected(crosswalkInfos); // Utiliser la version corrigée
        console.log("NavigationGraph: Grille construite (avec zones marchables définies).");
    }

	markCrosswalksCorrected(crosswalkInfos) {
        console.log("NavigationGraph: Marquage des passages piétons (largeur corrigée)...");
        let markedCells = 0;
        const stripeCount = this.config.crosswalkStripeCount || 5;
        const stripeWidth = this.config.crosswalkStripeWidth || 0.6;
        const stripeGap = this.config.crosswalkStripeGap || 0.5;
        const crosswalkVisualWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap;
        const crosswalkGridThickness = Math.max(1, Math.round(crosswalkVisualWidth * this.gridScale));
        // console.log(` -> Largeur passage piéton calculée: ${crosswalkVisualWidth.toFixed(1)} unités monde -> ${crosswalkGridThickness} cellules grille.`);
        crosswalkInfos.forEach(info => {
           const pos = info.position; const angle = info.angle; const length = info.length;
           const halfLength = length / 2; let dx = 0, dz = 0;
           // Déterminer direction du passage piéton basé sur son angle (0 ou PI/2)
           if (Math.abs(Math.sin(angle)) < 0.1) { // Angle proche de 0 ou PI -> passage Horizontal (direction Z)
               dz = halfLength; // Extension le long de Z
           } else { // Angle proche de PI/2 ou -PI/2 -> passage Vertical (direction X)
               dx = halfLength; // Extension le long de X
           }
           const startWorld = new THREE.Vector3(pos.x - dx, this.sidewalkHeight, pos.z - dz);
           const endWorld = new THREE.Vector3(pos.x + dx, this.sidewalkHeight, pos.z + dz);
           const startGrid = this.worldToGrid(startWorld.x, startWorld.z);
           const endGrid = this.worldToGrid(endWorld.x, endWorld.z);
           markedCells += this.drawLineOnGrid(startGrid, endGrid, crosswalkGridThickness);
       });
        console.log(`NavigationGraph: ${markedCells} cellules de passage piéton marquées.`);
    }

	markSidewalksArea(plots, sidewalkW) {
        console.log("NavigationGraph: Marquage de la ZONE des trottoirs...");
        let markedCells = 0;
        plots.forEach(plot => {
            const pX = plot.x; const pZ = plot.z;
            const pW = plot.width; const pD = plot.depth;
            const outerMinWorldX = pX - sidewalkW; const outerMaxWorldX = pX + pW + sidewalkW;
            const outerMinWorldZ = pZ - sidewalkW; const outerMaxWorldZ = pZ + pD + sidewalkW;
            const innerMinWorldX = pX; const innerMaxWorldX = pX + pW;
            const innerMinWorldZ = pZ; const innerMaxWorldZ = pZ + pD;

            // Utiliser worldToGrid (qui utilise maintenant round)
            const outerMinGridX = this.worldToGrid(outerMinWorldX, 0).x;
            const outerMaxGridX = this.worldToGrid(outerMaxWorldX, 0).x;
            const outerMinGridY = this.worldToGrid(0, outerMinWorldZ).y;
            const outerMaxGridY = this.worldToGrid(0, outerMaxWorldZ).y;
            const innerMinGridX = this.worldToGrid(innerMinWorldX, 0).x;
            const innerMaxGridX = this.worldToGrid(innerMaxWorldX, 0).x;
            const innerMinGridY = this.worldToGrid(0, innerMinWorldZ).y;
            const innerMaxGridY = this.worldToGrid(0, innerMaxWorldZ).y;

            // Itérer sur les cellules de grille.
            // Attention: worldToGrid(outerMax...) peut donner un index inclusif à cause de round.
            // La boucle doit aller jusqu'à `< outerMaxGridX + 1` pour inclure la dernière cellule potentielle.
            for (let gx = outerMinGridX; gx <= outerMaxGridX; gx++) {
                for (let gy = outerMinGridY; gy <= outerMaxGridY; gy++) {
                     // Vérifier si DANS les limites externes ET HORS des limites internes
                     const isOutsideInner = (gx < innerMinGridX || gx > innerMaxGridX || gy < innerMinGridY || gy > innerMaxGridY);

                    if (isOutsideInner) {
                        if (this.markCell(gx, gy)) { markedCells++; }
                    }
                }
            }
        });
        console.log(`NavigationGraph: ${markedCells} cellules de ZONE de trottoir marquées.`);
    }

	worldToGrid(worldX, worldZ) {
        // Utiliser Math.round au lieu de Math.floor
        const gridX = Math.round(worldX * this.gridScale + this.offsetX);
        const gridY = Math.round(worldZ * this.gridScale + this.offsetZ); // world Z -> grid Y

        // Il faut s'assurer que le résultat est DANS les limites de la grille après l'arrondi
        const clampedX = Math.max(0, Math.min(this.gridWidth - 1, gridX));
        const clampedY = Math.max(0, Math.min(this.gridHeight - 1, gridY));

        return { x: clampedX, y: clampedY };
    }

    gridToWorld(gridX, gridY) {
        // Le +0.5 assure qu'on est au centre de la cellule de la grille
        const worldX = (gridX + 0.5 - this.offsetX) / this.gridScale;
        const worldZ = (gridY + 0.5 - this.offsetZ) / this.gridScale;
        // Retourner une position légèrement au-dessus de la hauteur définie du trottoir
        return new THREE.Vector3(worldX, this.sidewalkHeight + 0.05, worldZ);
    }

	drawLineOnGrid(start, end, thickness) {
        let markedCount = 0;
        let x0 = Math.floor(start.x); let y0 = Math.floor(start.y); // Utiliser floor ici pour l'algo Bresenham
        let x1 = Math.floor(end.x); let y1 = Math.floor(end.y);
        let dx = Math.abs(x1 - x0); let sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0); let sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        let halfThicknessFloor = Math.max(0, Math.floor((thickness - 1) / 2));
        let halfThicknessCeil = Math.max(0, Math.ceil((thickness - 1) / 2));

        // Bresenham line algorithm pour tracer la ligne centrale
        while (true) {
            // Marquer une zone épaisse autour du point courant (x0, y0)
             // Déterminer la direction principale pour l'épaisseur (axe perpendiculaire)
            if (dx > -dy) { // Pente < 1 (plus horizontal) -> épaisseur verticale
                 for (let i = -halfThicknessFloor; i <= halfThicknessCeil; i++) {
                     if (this.markCell(x0, y0 + i)) markedCount++;
                 }
             } else { // Pente >= 1 (plus vertical) -> épaisseur horizontale
                 for (let i = -halfThicknessFloor; i <= halfThicknessCeil; i++) {
                     if (this.markCell(x0 + i, y0)) markedCount++;
                 }
            }

            if (x0 === x1 && y0 === y1) break; // Fin de la ligne
            let e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; } // Erreur > seuil -> pas en X
            if (e2 <= dx) { err += dx; y0 += sy; } // Erreur < seuil -> pas en Y
        }
        return markedCount;
    }

    markCell(x, y) {
        if (this.isValidGridCoord(x, y)) {
             // Marquer comme marchable seulement s'il ne l'est pas déjà
             if (!this.grid.isWalkableAt(x,y)){
                 this.grid.setWalkableAt(x, y, true);
                 return true; // Indique qu'une cellule a été marquée
             }
        }
        return false; // Indique qu'aucune cellule n'a été marquée (hors limites ou déjà marchable)
    }

	isValidGridCoord(x, y) {
        // Vérifie si les coordonnées sont dans les limites de la grille
        return this.grid && x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    // ==============================================================
    // Fonction getClosestWalkableNode OPTIMISÉE
    // ==============================================================
    getClosestWalkableNode(worldPos) {
        if (!this.grid) return null;

        // Convertir la position monde en coordonnées grille initiales
        const startGrid = this.worldToGrid(worldPos.x, worldPos.z);
        let bestNode = null;
        let minGridDistSq = Infinity; // Distance au carré EN GRILLE

        // 1. Vérifier le point de départ exact
        if (this.isValidGridCoord(startGrid.x, startGrid.y) && this.grid.isWalkableAt(startGrid.x, startGrid.y)) {
            // Si la cellule de départ est directement marchable, c'est la meilleure.
            return startGrid; // Retourne {x, y}
        }

        // 2. Recherche en spirale si le point de départ n'est pas marchable
        // Rayon de recherche max (en cellules de grille)
        const maxSearchRadius = Math.max(15, Math.ceil(this.config.sidewalkWidth * 2 * this.gridScale));

        for (let r = 1; r <= maxSearchRadius; r++) {
            let foundInRadius = false; // Optimisation: arrêter si on trouve dans un rayon
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    // Considérer seulement le périmètre extérieur du carré de recherche
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

                    const cx = startGrid.x + dx; // Coordonnée X candidate
                    const cy = startGrid.y + dy; // Coordonnée Y candidate

                    // Vérifier si la cellule candidate est valide et marchable
                    if (this.isValidGridCoord(cx, cy) && this.grid.isWalkableAt(cx, cy)) {

                        // *** OPTIMISATION: Calcul de distance en grille ***
                        // Calcule la distance au carré entre la grille de départ (startGrid)
                        // et la grille candidate (cx, cy).
                        const gridDistSq = dx * dx + dy * dy;
                        // ***********************************************

                        // Si cette cellule est plus proche que la meilleure trouvée jusqu'à présent
                        if (gridDistSq < minGridDistSq) {
                            minGridDistSq = gridDistSq; // Mettre à jour la distance min
                            bestNode = { x: cx, y: cy }; // Stocker les coordonnées grille
                            foundInRadius = true;
                        }
                    }
                }
            }
            // OPTIMISATION POSSIBLE (agressive): Si on a trouvé un nœud dans ce rayon,
            // on peut considérer que c'est un bon candidat et arrêter la recherche.
            // Cela ne garantit pas le *plus* proche au sens strict Euclidien monde,
            // mais trouve un nœud marchable proche rapidement.
            // if (foundInRadius) break;
            // Pour l'instant, on continue jusqu'au rayon max pour trouver le plus proche dans ce rayon.
        }

        // Si aucun nœud n'a été trouvé dans le rayon de recherche
        if (!bestNode) {
            console.warn("NavigationGraph: Aucun nœud marchable trouvé près de", worldPos, `(Grille: ${startGrid.x},${startGrid.y}) dans le rayon ${maxSearchRadius}.`);
        }

        // Retourne les coordonnées {x, y} du meilleur nœud trouvé, ou null.
        return bestNode;
    }
    // ==============================================================
    // FIN Fonction getClosestWalkableNode OPTIMISÉE
    // ==============================================================


    // --- Fonctions de Debug (inchangées, mais utilisent la logique optimisée) ---
    createDebugVisualization(targetGroup) {
         if (!this.grid || !targetGroup) return;
        console.log("NavigationGraph: Création de la visualisation de la grille...");
        while(targetGroup.children.length > 0) {
             const child = targetGroup.children[0]; targetGroup.remove(child);
             if (child.geometry) child.geometry.dispose();
         }
        const cellSizeInWorld = 1.0 / this.gridScale;
        const visualCellSize = cellSizeInWorld * 0.85; // Réduire pour voir les espaces
        const planeGeom = new THREE.PlaneGeometry(visualCellSize, visualCellSize);
        const geometries = [];
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.grid.isWalkableAt(x, y)) {
                    const worldPos = this.gridToWorld(x, y); // Centre de la cellule
                    const matrix = new THREE.Matrix4();
                    // Placer le plan horizontalement à la bonne position
                    matrix.makeRotationX(-Math.PI / 2);
                    matrix.setPosition(worldPos.x, worldPos.y - 0.03, worldPos.z); // Légèrement décalé en Y pour visibilité
                    const clonedGeom = planeGeom.clone().applyMatrix4(matrix);
                    geometries.push(clonedGeom);
                }
            }
        }
        planeGeom.dispose(); // Disposer la géométrie de base

        if (geometries.length > 0) {
             const mergedWalkableGeometry = mergeGeometries(geometries, false);
             if (mergedWalkableGeometry) {
                 const walkableMesh = new THREE.Mesh(mergedWalkableGeometry, this.debugMaterialWalkable);
                 walkableMesh.name = "Debug_NavGrid_Walkable";
                 targetGroup.add(walkableMesh);
                 console.log(`NavigationGraph: Visualisation grille ajoutée (${geometries.length} cellules).`);
             } else { console.warn("NavigationGraph: Échec fusion géométries debug grille."); }
             geometries.forEach(g => g.dispose()); // Nettoyer les géométries clonées après fusion
        } else { console.log("NavigationGraph: Aucune cellule marchable à visualiser."); }
    }

    destroy() {
        this.grid = null; // Libère la grille pathfinding-js
        if (this.debugMaterialWalkable) this.debugMaterialWalkable.dispose();
        if (this.debugMaterialPath) this.debugMaterialPath.dispose();
        // Aucune autre géométrie à disposer ici car elles sont gérées dans createDebugVisualization
        console.log("NavigationGraph: Détruit.");
     }
}