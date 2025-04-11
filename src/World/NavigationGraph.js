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

        // Calcul taille grille et offsets (inchangé)
        const worldMinX = -mapSize / 2 - sidewalkWidth;
        const worldMaxX = mapSize / 2 + sidewalkWidth;
        const worldMinZ = -mapSize / 2 - sidewalkWidth;
        const worldMaxZ = mapSize / 2 + sidewalkWidth;
        this.gridWidth = Math.ceil((worldMaxX - worldMinX) * this.gridScale);
        this.gridHeight = Math.ceil((worldMaxZ - worldMinZ) * this.gridScale);
        this.offsetX = -worldMinX * this.gridScale;
        this.offsetZ = -worldMinZ * this.gridScale;

        // 1. Créer la grille PF.Grid
        this.grid = new PF.Grid(this.gridWidth, this.gridHeight);
        console.log(`NavigationGraph: Grille créée (${this.gridWidth}x${this.gridHeight})`);

        // 2. Initialiser TOUTE la grille comme NON MARCHABLE
        console.log("NavigationGraph: Initialisation de la grille comme non marchable...");
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                this.grid.setWalkableAt(x, y, false);
            }
        }
        console.log("NavigationGraph: Initialisation non marchable terminée.");

        // 3. Marquer les trottoirs comme marchables (true)
        this.markSidewalksArea(plots, sidewalkWidth); // <--- Utilisation de la nouvelle méthode

        // 4. Marquer les passages piétons comme marchables (true)
        this.markCrosswalksCorrected(crosswalkInfos); // <--- Utilisation de la nouvelle méthode

        console.log("NavigationGraph: Grille construite (avec zones marchables définies).");
    }

	markCrosswalksCorrected(crosswalkInfos) {
        console.log("NavigationGraph: Marquage des passages piétons (largeur corrigée)...");
        let markedCells = 0;

        // Calculer la largeur visuelle réelle basée sur la config
        const stripeCount = this.config.crosswalkStripeCount || 5;
        const stripeWidth = this.config.crosswalkStripeWidth || 0.6;
        const stripeGap = this.config.crosswalkStripeGap || 0.5;
        const crosswalkVisualWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap; // Largeur monde (ex: 5.0)

        // Convertir cette largeur monde en épaisseur de grille
        const crosswalkGridThickness = Math.max(1, Math.round(crosswalkVisualWidth * this.gridScale)); // Utiliser round pour un meilleur arrondi
        console.log(` -> Largeur passage piéton calculée: ${crosswalkVisualWidth.toFixed(1)} unités monde -> ${crosswalkGridThickness} cellules grille.`);

       crosswalkInfos.forEach(info => {
           const pos = info.position;
           const angle = info.angle;
           const length = info.length; // Longueur monde (ex: 9.0)

           const halfLength = length / 2;
           let dx = 0, dz = 0;
           if (Math.abs(angle) < 0.1) { dz = halfLength; } else { dx = halfLength; }

           const startWorld = new THREE.Vector3(pos.x - dx, this.sidewalkHeight, pos.z - dz);
           const endWorld = new THREE.Vector3(pos.x + dx, this.sidewalkHeight, pos.z + dz);

           const startGrid = this.worldToGrid(startWorld.x, startWorld.z);
           const endGrid = this.worldToGrid(endWorld.x, endWorld.z);

           // Utiliser l'épaisseur calculée (ex: 5 ou 6 cellules si scale=1)
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

            // Limites du monde pour le trottoir EXTERIEUR
            const outerMinWorldX = pX - sidewalkW;
            const outerMaxWorldX = pX + pW + sidewalkW;
            const outerMinWorldZ = pZ - sidewalkW;
            const outerMaxWorldZ = pZ + pD + sidewalkW;

            // Limites du monde pour la parcelle INTERIEURE
            const innerMinWorldX = pX;
            const innerMaxWorldX = pX + pW;
            const innerMinWorldZ = pZ;
            const innerMaxWorldZ = pZ + pD;

            // Convertir les limites du monde en limites de GRILLE (indices de cellules)
            // Pour les minimums, on prend le worldToGrid direct (floor)
            // Pour les maximums, on prend le worldToGrid pour s'assurer d'inclure la dernière cellule
            const outerMinGridX = this.worldToGrid(outerMinWorldX, 0).x; // Z non pertinent pour worldToGrid
            const outerMaxGridX = this.worldToGrid(outerMaxWorldX, 0).x;
            const outerMinGridY = this.worldToGrid(0, outerMinWorldZ).y; // X non pertinent
            const outerMaxGridY = this.worldToGrid(0, outerMaxWorldZ).y;

            const innerMinGridX = this.worldToGrid(innerMinWorldX, 0).x;
            const innerMaxGridX = this.worldToGrid(innerMaxWorldX, 0).x;
            const innerMinGridY = this.worldToGrid(0, innerMinWorldZ).y;
            const innerMaxGridY = this.worldToGrid(0, innerMaxWorldZ).y;

            // Parcourir toutes les cellules de la grille potentiellement concernées par ce trottoir
            for (let gx = outerMinGridX; gx < outerMaxGridX; gx++) {
                for (let gy = outerMinGridY; gy < outerMaxGridY; gy++) {
                    // Vérifier si la cellule est DANS la zone extérieure mais HORS de la zone intérieure
                    const isOutsideInner = (gx < innerMinGridX || gx >= innerMaxGridX || gy < innerMinGridY || gy >= innerMaxGridY);

                    if (isOutsideInner) {
                        // Marquer comme marchable (la fonction markCell gère les doublons et les limites)
                        if (this.markCell(gx, gy)) {
                            markedCells++;
                        }
                    }
                }
            }
        });
        console.log(`NavigationGraph: ${markedCells} cellules de ZONE de trottoir marquées.`);
    }

    // ... worldToGrid, gridToWorld (inchangés) ...
    worldToGrid(worldX, worldZ) {
        const gridX = Math.floor(worldX * this.gridScale + this.offsetX);
        const gridY = Math.floor(worldZ * this.gridScale + this.offsetZ);
        return { x: gridX, y: gridY };
    }

    gridToWorld(gridX, gridY) {
        const worldX = (gridX + 0.5 - this.offsetX) / this.gridScale; // Centre cellule X
        const worldZ = (gridY + 0.5 - this.offsetZ) / this.gridScale; // Centre cellule Z
        // Retourner la position légèrement AU-DESSUS du sol/trottoir pour la visibilité des points du chemin
        return new THREE.Vector3(worldX, this.sidewalkHeight + 0.05, worldZ);
    }


    // --- Les fonctions de marquage (markSidewalks, markCrosswalks, drawLineOnGrid, fillCorner, markCell)
    // --- restent logiquement les mêmes : elles doivent maintenant appeler setWalkableAt(x, y, true)
    // --- sur une grille initialement non marchable.
    markSidewalks(plots, sidewalkW) { /* ... code précédent inchangé ... */
        console.log("NavigationGraph: Marquage des trottoirs (méthode des bords)...");
        let markedCells = 0;
        const sidewalkGridThickness = Math.max(1, Math.floor(sidewalkW * this.gridScale));
        plots.forEach(plot => {
            const pX = plot.x; const pZ = plot.z;
            const pW = plot.width; const pD = plot.depth;
            const cornersWorld = [
                { x: pX - sidewalkW,     z: pZ - sidewalkW },
                { x: pX + pW + sidewalkW, z: pZ - sidewalkW },
                { x: pX + pW + sidewalkW, z: pZ + pD + sidewalkW },
                { x: pX - sidewalkW,     z: pZ + pD + sidewalkW },
            ];
            const cornersGrid = cornersWorld.map(c => this.worldToGrid(c.x, c.z));
            markedCells += this.drawLineOnGrid(cornersGrid[0], cornersGrid[1], sidewalkGridThickness);
            markedCells += this.drawLineOnGrid(cornersGrid[1], cornersGrid[2], sidewalkGridThickness);
            markedCells += this.drawLineOnGrid(cornersGrid[2], cornersGrid[3], sidewalkGridThickness);
            markedCells += this.drawLineOnGrid(cornersGrid[3], cornersGrid[0], sidewalkGridThickness);
            this.fillCorner(cornersGrid[0], sidewalkGridThickness);
            this.fillCorner(cornersGrid[1], sidewalkGridThickness);
            this.fillCorner(cornersGrid[2], sidewalkGridThickness);
            this.fillCorner(cornersGrid[3], sidewalkGridThickness);
        });
        console.log(`NavigationGraph: ${markedCells} cellules de trottoir marquées (via bords).`);
    }

    markCrosswalks(crosswalkInfos) { /* ... code précédent inchangé ... */
        console.log("NavigationGraph: Marquage des passages piétons...");
        let markedCells = 0;
        const crosswalkGridWidth = Math.max(1, Math.floor(this.config.roadWidth * this.gridScale));
       crosswalkInfos.forEach(info => {
           const pos = info.position; const angle = info.angle; const length = info.length;
           const halfLength = length / 2;
           let dx = 0, dz = 0;
           if (Math.abs(angle) < 0.1) { dz = halfLength; } else { dx = halfLength; }
           const startWorld = new THREE.Vector3(pos.x - dx, this.sidewalkHeight, pos.z - dz);
           const endWorld = new THREE.Vector3(pos.x + dx, this.sidewalkHeight, pos.z + dz);
           const startGrid = this.worldToGrid(startWorld.x, startWorld.z);
           const endGrid = this.worldToGrid(endWorld.x, endWorld.z);
           markedCells += this.drawLineOnGrid(startGrid, endGrid, crosswalkGridWidth);
       });
        console.log(`NavigationGraph: ${markedCells} cellules de passage piéton marquées.`);
    }

    drawLineOnGrid(start, end, thickness) {
        let markedCount = 0;
        let x0 = Math.floor(start.x); let y0 = Math.floor(start.y);
        let x1 = Math.floor(end.x); let y1 = Math.floor(end.y);
        let dx = Math.abs(x1 - x0); let sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0); let sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        // Recalcul de halfThickness pour centrer la ligne (important si thickness est impaire)
        let halfThicknessFloor = Math.max(0, Math.floor((thickness - 1) / 2));
        let halfThicknessCeil = Math.max(0, Math.ceil((thickness - 1) / 2));

        while (true) {
             // Appliquer l'épaisseur perpendiculairement
             if (dx > -dy) { // Pente < 1 (plus horizontal)
                 // Boucle de -floor à +ceil pour bien gérer épaisseurs paires/impaires
                 for (let i = -halfThicknessFloor; i <= halfThicknessCeil; i++) {
                     if (this.markCell(x0, y0 + i)) markedCount++;
                 }
             } else { // Pente >= 1 (plus vertical)
                 for (let i = -halfThicknessFloor; i <= halfThicknessCeil; i++) {
                    if (this.markCell(x0 + i, y0)) markedCount++;
                }
            }

            if (x0 == x1 && y0 == y1) break;
            let e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
        return markedCount;
    }

    fillCorner(center, thickness) { /* ... code précédent inchangé ... */
        let markedCount = 0; let x0 = Math.floor(center.x); let y0 = Math.floor(center.y);
        let halfThickness = Math.max(0, Math.floor((thickness -1) / 2));
        for (let i = -halfThickness; i <= halfThickness; i++) {
           for (let j = -halfThickness; j <= halfThickness; j++) { if (this.markCell(x0 + i, y0 + j)) markedCount++; }
        } return markedCount;
    }

	markCell(x, y) {
        if (this.isValidGridCoord(x, y)) {
             // Si on ne l'a pas déjà marqué, on le fait
            if (!this.grid.isWalkableAt(x,y)){
                 this.grid.setWalkableAt(x, y, true);
                 return true;
             }
        }
        return false;
    }

	isValidGridCoord(x, y) {
        return this.grid && x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    getClosestWalkableNode(worldPos) { /* ... code précédent inchangé ... */
        if (!this.grid) return null;
        const startGrid = this.worldToGrid(worldPos.x, worldPos.z);
        let bestNode = null; let minDstSq = Infinity;
        // Vérifier point exact d'abord
        if (this.isValidGridCoord(startGrid.x, startGrid.y) && this.grid.isWalkableAt(startGrid.x, startGrid.y)) {
            bestNode = startGrid; minDstSq = 0;
        }
        // Recherche spirale si besoin
        const maxSearchRadius = Math.max(15, Math.ceil(this.config.sidewalkWidth * 2 * this.gridScale));
        let foundInSpiral = false;
        for (let r = 1; r <= maxSearchRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const cx = startGrid.x + dx; const cy = startGrid.y + dy;
                    if (this.isValidGridCoord(cx, cy) && this.grid.isWalkableAt(cx, cy)) { // Cherche les cellules marquées TRUE
                        const worldCandidate = this.gridToWorld(cx, cy); const dstSq = worldPos.distanceToSquared(worldCandidate);
                        if (dstSq < minDstSq) { minDstSq = dstSq; bestNode = { x: cx, y: cy }; foundInSpiral = true; }
                    }
                }
            } if (foundInSpiral && bestNode) break; // Arrêter si trouvé dans ce rayon
        } if (!bestNode) { console.warn("NavigationGraph: Aucun nœud marchable trouvé près de", worldPos); }
        return bestNode;
    }

    // --- Modification de la visualisation pour voir la grille ---
    createDebugVisualization(targetGroup) {
        if (!this.grid || !targetGroup) return;
        console.log("NavigationGraph: Création de la visualisation de la grille...");
        while(targetGroup.children.length > 0) {
             const child = targetGroup.children[0]; targetGroup.remove(child);
             if (child.geometry) child.geometry.dispose();
         }

        // Ajuster la taille pour voir les espaces entre cellules
        const cellSizeInWorld = 1.0 / this.gridScale;
        const visualCellSize = cellSizeInWorld * 0.85; // Légèrement plus petit que la cellule réelle
        const planeGeom = new THREE.PlaneGeometry(visualCellSize, visualCellSize);
        const geometries = [];

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.grid.isWalkableAt(x, y)) { // Afficher seulement les marchables
                    const worldPos = this.gridToWorld(x, y); // Centre de la cellule
                    const matrix = new THREE.Matrix4();
                    matrix.makeRotationX(-Math.PI / 2);
                    // Positionner au centre de la cellule, légèrement décalé en Y pour visibilité
                    matrix.setPosition(worldPos.x, worldPos.y - 0.03, worldPos.z); // Encore plus bas pour passer sous la ligne de chemin
                    const clonedGeom = planeGeom.clone().applyMatrix4(matrix);
                    geometries.push(clonedGeom);
                }
            }
        }
        planeGeom.dispose();

        if (geometries.length > 0) {
             const mergedWalkableGeometry = mergeGeometries(geometries, false);
             if (mergedWalkableGeometry) {
                 // Utiliser le matériau wireframe défini dans le constructeur
                 const walkableMesh = new THREE.Mesh(mergedWalkableGeometry, this.debugMaterialWalkable);
                 walkableMesh.name = "Debug_NavGrid_Walkable";
                 targetGroup.add(walkableMesh);
                 console.log(`NavigationGraph: Visualisation grille ajoutée (${geometries.length} cellules).`);
             } else { console.warn("NavigationGraph: Échec fusion géométries debug grille."); }
             geometries.forEach(g => g.dispose());
        } else { console.log("NavigationGraph: Aucune cellule marchable à visualiser."); }
    }
    // --- Fin Modification Visualisation ---

    destroy() {
        this.grid = null;
        if (this.debugMaterialWalkable) this.debugMaterialWalkable.dispose();
        if (this.debugMaterialPath) this.debugMaterialPath.dispose();
        console.log("NavigationGraph: Détruit.");
     }
}