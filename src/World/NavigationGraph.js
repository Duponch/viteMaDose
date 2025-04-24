// src/World/NavigationGraph.js
import * as THREE from 'three';
import * as PF from 'pathfinding';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WALKABLE = 0;
const NON_WALKABLE = 1;

export default class NavigationGraph {
	constructor(config) {
        this.config = config; // Assure-toi que config contient bien sidewalkWidth, crosswalkStripe*, roadWidth etc.
        this.gridBuffer = null;         // SharedArrayBuffer
        this.gridWalkableMap = null;    // Uint8Array view on gridBuffer
        this.gridScale = config.gridScale ?? 1.0; // Utiliser la valeur de config ou 1.0 par défaut
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
        console.log("NavigationGraph: Construction de la grille avec SharedArrayBuffer...");
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

        const bufferSize = this.gridWidth * this.gridHeight;
        if (bufferSize <= 0) {
             console.error(`NavigationGraph: Dimensions de grille invalides (${this.gridWidth}x${this.gridHeight}). Impossible de créer le buffer.`);
             return;
        }
        try {
            this.gridBuffer = new SharedArrayBuffer(bufferSize);
            this.gridWalkableMap = new Uint8Array(this.gridBuffer);
            console.log(`NavigationGraph: SharedArrayBuffer créé (taille: ${bufferSize} octets).`);
        } catch (e) {
            console.error("NavigationGraph: Erreur lors de la création du SharedArrayBuffer. Vérifiez que le contexte est sécurisé (crossOriginIsolated).", e);
            // Tenter de continuer sans SharedArrayBuffer? Ou lever une erreur?
            // Pour l'instant, on arrête ici.
            this.gridBuffer = null;
            this.gridWalkableMap = null;
             alert("SharedArrayBuffer n'est pas disponible. L'application nécessite un contexte sécurisé (HTTPS avec en-têtes COOP/COEP). Voir la console pour les détails.");
             throw new Error("SharedArrayBuffer creation failed. Ensure secure context.");

        }

        console.log(`NavigationGraph: Grille logique créée (${this.gridWidth}x${this.gridHeight})`);
        console.log("NavigationGraph: Initialisation de la grille comme non marchable...");
        this.gridWalkableMap.fill(NON_WALKABLE); // Initialise tout à non marchable

        console.log("NavigationGraph: Initialisation non marchable terminée.");
        this.markSidewalksArea(plots, sidewalkWidth);
        this.markCrosswalksCorrected(crosswalkInfos); // Utiliser la version corrigée
        console.log("NavigationGraph: Grille construite (avec zones marchables définies).");
    }

	markCrosswalksCorrected(crosswalkInfos) {
        console.log("NavigationGraph: Marquage des passages piétons (centre snappé, dimensions snappées)...");
        let markedCells = 0;
        const cellSizeWorld = 1.0 / this.gridScale;

        crosswalkInfos.forEach(info => {
            const originalPos = info.position; // Centre de la ligne du passage piéton
            const angle = info.angle;
            const originalLength = info.length; // Longueur le long de la direction de la route
            const stripeCount = this.config.crosswalkStripeCount || 5;
            const stripeWidth = this.config.crosswalkStripeWidth || 0.6;
            const stripeGap = this.config.crosswalkStripeGap || 0.5;
            const originalCrosswalkVisualWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap;

            // Snapper la position centrale
            const pos = {
                x: Math.round(originalPos.x / cellSizeWorld) * cellSizeWorld,
                z: Math.round(originalPos.z / cellSizeWorld) * cellSizeWorld
            };

            // Snapper les dimensions aux multiples de la taille de cellule
            const length = Math.round(originalLength / cellSizeWorld) * cellSizeWorld;
            const crosswalkVisualWidth = Math.round(originalCrosswalkVisualWidth / cellSizeWorld) * cellSizeWorld;

            const halfLength = length / 2;
            const halfVisualWidth = crosswalkVisualWidth / 2;

            let minWorldX, maxWorldX, minWorldZ, maxWorldZ;

            // Déterminer les limites MONDE exactes du rectangle du passage piéton
            if (Math.abs(Math.sin(angle)) < 0.1) { // Passage horizontal (le long de l'axe Z)
                // Route E-O, Passage N-S
                minWorldX = pos.x - halfVisualWidth;
                maxWorldX = pos.x + halfVisualWidth;
                minWorldZ = pos.z - halfLength;
                maxWorldZ = pos.z + halfLength;
            } else { // Passage vertical (le long de l'axe X)
                // Route N-S, Passage E-O
                minWorldX = pos.x - halfLength;
                maxWorldX = pos.x + halfLength;
                minWorldZ = pos.z - halfVisualWidth;
                maxWorldZ = pos.z + halfVisualWidth;
            }

            // Déterminer la zone de GRILLE à vérifier (avec une marge)
            const startGrid = this.worldToGrid(minWorldX - 1, minWorldZ - 1);
            const endGrid = this.worldToGrid(maxWorldX + 1, maxWorldZ + 1);

            // Itérer sur les cellules de la grille dans cette zone
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Obtenir le centre de la cellule courante en coordonnées MONDE
                    const cellCenterWorld = this.gridToWorld(gx, gy);
                    const cx = cellCenterWorld.x;
                    const cz = cellCenterWorld.z;

                    // Vérifier si le centre de la cellule est dans les limites MONDE du rectangle
                    // Utiliser <= pour les bornes max pour plus de robustesse
                    if (cx >= minWorldX && cx <= maxWorldX && cz >= minWorldZ && cz <= maxWorldZ) {
                        // Marquer la cellule si elle est dans les limites
                        if (this.markCell(gx, gy)) {
                            markedCells++;
                        }
                    }
                }
            }
            // L'appel à drawLineOnGrid n'est plus nécessaire avec cette méthode
            // markedCells += this.drawLineOnGrid(startGrid, endGrid, crosswalkGridThickness);
       });
        console.log(`NavigationGraph: ${markedCells} cellules de passage piéton marquées (méthode centre).`);
    }

	markSidewalksArea(plots, sidewalkW) {
        console.log("NavigationGraph: Marquage de la ZONE des trottoirs (origine snappée, dimensions snappées)...");
        let markedCells = 0;
        const cellSizeWorld = 1.0 / this.gridScale;

        // Snapper la largeur du trottoir
        const snappedSidewalkW = Math.round(sidewalkW / cellSizeWorld) * cellSizeWorld;
        if (snappedSidewalkW <= 0) {
             console.warn(`Largeur de trottoir snappée est <= 0 (${snappedSidewalkW}).`);
             return; // Ne rien marquer si la largeur snappée est nulle.
        }

        plots.forEach(plot => {
            const originalPX = plot.x; const originalPZ = plot.z;
            const originalPW = plot.width; const originalPD = plot.depth;

            // Snapper l'origine de la parcelle (au multiple le plus proche)
            const pX = Math.round(originalPX / cellSizeWorld) * cellSizeWorld;
            const pZ = Math.round(originalPZ / cellSizeWorld) * cellSizeWorld;

            // Snapper les dimensions de la parcelle (au multiple le plus proche)
            const pW = Math.round(originalPW / cellSizeWorld) * cellSizeWorld;
            const pD = Math.round(originalPD / cellSizeWorld) * cellSizeWorld;

            // Définir les limites du trottoir en coordonnées MONDE en utilisant les dimensions snappées
            const outerMinWorldX = pX - snappedSidewalkW;
            const outerMaxWorldX = pX + pW + snappedSidewalkW;
            const outerMinWorldZ = pZ - snappedSidewalkW;
            const outerMaxWorldZ = pZ + pD + snappedSidewalkW;

            // Limites internes du plot (où il NE FAUT PAS marquer) - utiliser aussi dimensions snappées
            const innerMinWorldX = pX;
            const innerMaxWorldX = pX + pW;
            const innerMinWorldZ = pZ;
            const innerMaxWorldZ = pZ + pD;

            // Déterminer une zone de GRILLE à vérifier (un peu plus large pour être sûr)
            // Convertir les coins externes monde en grille pour obtenir une estimation des boucles
            const startGrid = this.worldToGrid(outerMinWorldX - 1, outerMinWorldZ - 1); // Marge de sécurité
            const endGrid = this.worldToGrid(outerMaxWorldX + 1, outerMaxWorldZ + 1); // Marge de sécurité

            // Itérer sur les cellules de la grille dans cette zone étendue
            for (let gy = startGrid.y; gy <= endGrid.y; gy++) {
                for (let gx = startGrid.x; gx <= endGrid.x; gx++) {
                    // Calculer les limites mondiales de la cellule (gx, gy)
                    const cellMinX = (gx - this.offsetX) / this.gridScale;
                    const cellMinZ = (gy - this.offsetZ) / this.gridScale;
                    const cellMaxX = (gx + 1 - this.offsetX) / this.gridScale;
                    const cellMaxZ = (gy + 1 - this.offsetZ) / this.gridScale;

                    // Vérifier si la cellule chevauche la zone du trottoir
                    // 1. La cellule doit chevaucher les limites EXTERNES
                    const overlapsOuterX = cellMinX < outerMaxWorldX && cellMaxX > outerMinWorldX;
                    const overlapsOuterZ = cellMinZ < outerMaxWorldZ && cellMaxZ > outerMinWorldZ;
                    const overlapsOuterBounds = overlapsOuterX && overlapsOuterZ;

                    // 2. La cellule ne doit PAS être entièrement DANS les limites INTERNES (elle peut les toucher/chevaucher partiellement)
                    //    On vérifie si la cellule est complètement à l'intérieur
                    const isFullyInsideInnerX = cellMinX >= innerMinWorldX && cellMaxX <= innerMaxWorldX;
                    const isFullyInsideInnerZ = cellMinZ >= innerMinWorldZ && cellMaxZ <= innerMaxWorldZ;
                    const isFullyInsideInnerBounds = isFullyInsideInnerX && isFullyInsideInnerZ;

                    // Si la cellule chevauche la zone externe ET n'est pas entièrement contenue dans la zone interne, elle appartient au trottoir
                    if (overlapsOuterBounds && !isFullyInsideInnerBounds) {
                        if (this.markCell(gx, gy)) {
                            markedCells++;
                        }
                    }
                }
            }
        });
        console.log(`NavigationGraph: ${markedCells} cellules de ZONE de trottoir marquées (méthode chevauchement).`);
    }

	worldToGrid(worldX, worldZ) {
        // Utiliser Math.floor au lieu de Math.round pour un alignement précis avec les bords des éléments
        const gridX = Math.floor(worldX * this.gridScale + this.offsetX);
        const gridY = Math.floor(worldZ * this.gridScale + this.offsetZ); // world Z -> grid Y

        // Il faut s'assurer que le résultat est DANS les limites de la grille après l'arrondi
        const clampedX = Math.max(0, Math.min(this.gridWidth - 1, gridX));
        const clampedY = Math.max(0, Math.min(this.gridHeight - 1, gridY));

        return { x: clampedX, y: clampedY };
    }

    gridToWorld(gridX, gridY) {
        // Le +0.5 assure qu'on est au centre de la cellule de la grille
        // Restaurer le +0.5 pour aligner correctement sur le centre de la cellule
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
            const index = y * this.gridWidth + x;
            // Marquer comme marchable (0) seulement s'il est non marchable (1)
             //if (!this.grid.isWalkableAt(x,y)){
             if (this.gridWalkableMap[index] === NON_WALKABLE) {
                 //this.grid.setWalkableAt(x, y, true);
                 this.gridWalkableMap[index] = WALKABLE;
                 return true; // Indique qu'une cellule a été marquée
             }
        }
        return false; // Indique qu'aucune cellule n'a été marquée (hors limites ou déjà marchable)
    }

	isValidGridCoord(x, y) {
        // Vérifie si les coordonnées sont dans les limites de la grille
        // return this.grid && x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
        return this.gridWalkableMap !== null && x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    isWalkableAt(x, y) {
        if (!this.isValidGridCoord(x, y)) {
            return false;
        }
        const index = y * this.gridWidth + x;
        return this.gridWalkableMap[index] === WALKABLE;
    }

    // ==============================================================
    // Fonction getClosestWalkableNode adaptée pour gridWalkableMap
    // ==============================================================
    getClosestWalkableNode(worldPos) {
		if (!this.gridWalkableMap) return null;
	
		// 1) Position « brute » en grille
		const startGrid = this.worldToGrid(worldPos.x, worldPos.z);
	
		// Si cette cellule est déjà marchable on la renvoie tout de suite
		if (this.isWalkableAt(startGrid.x, startGrid.y)) { // isWalkableAt inclut la validation des coords
			return startGrid;
		}
	
		// 2) Recherche en spirale
		const maxSearchRadius = Math.max(this.gridWidth, this.gridHeight);
	
		let bestNode = null;
		let minGridDistSq = Infinity;
	
		for (let r = 1; r <= maxSearchRadius; r++) {
			for (let dx = -r; dx <= r; dx++) {
				for (let dy = -r; dy <= r; dy++) {
					if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
	
					const x = startGrid.x + dx, y = startGrid.y + dy;
					if (!this.isWalkableAt(x, y)) continue; // Utiliser la nouvelle méthode
	
					const d2 = dx*dx + dy*dy;
					if (d2 < minGridDistSq) {
						minGridDistSq = d2;
						bestNode     = { x, y };
					}
				}
			}
			// **optionnel** : si on a trouvé au moins un nœud à ce rayon, on peut break
			if (bestNode) break;
		}
	
		if (!bestNode) {
			// Aucune cellule marchable trouvée sur toute la grille :  
			// on la remplace par le point d'origine en grille pour éviter le null
			console.warn(
			  `NavigationGraph: Aucun nœud marchable trouvé près de`, 
			  worldPos, `(Grille: ${startGrid.x},${startGrid.y})`
			);
			return startGrid;
		}
	
		return bestNode;
	}	
    // ==============================================================
    // FIN Fonction getClosestWalkableNode
    // ==============================================================

    // --- Nouvelle méthode pour fournir les données au Worker ---
    getGridDataForWorker() {
        if (!this.gridBuffer) {
            console.error("NavigationGraph: SharedArrayBuffer non initialisé. Impossible de fournir les données au worker.");
            return null;
        }
        return {
            gridBuffer: this.gridBuffer, // Le SharedArrayBuffer lui-même
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            conversionParams: { // Paramètres nécessaires au worker pour gridToWorld etc.
                gridScale: this.gridScale,
                offsetX: this.offsetX,
                offsetZ: this.offsetZ,
                sidewalkHeight: this.sidewalkHeight
            }
        };
    }

    // --- Fonctions de Debug adaptées ---
    createDebugVisualization(targetGroup) {
         if (!this.gridWalkableMap || !targetGroup) return;
        console.log("NavigationGraph: Création de la visualisation de la grille...");
        while(targetGroup.children.length > 0) {
             const child = targetGroup.children[0]; targetGroup.remove(child);
             if (child.geometry) child.geometry.dispose();
         }
        const cellSizeInWorld = 1.0 / this.gridScale;
        const visualCellSize = cellSizeInWorld * 0.95; // Ajuster la taille visuelle si besoin
        const planeGeom = new THREE.PlaneGeometry(visualCellSize, visualCellSize);
        const geometries = [];
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.isWalkableAt(x, y)) {
                    // Calculer la position du COIN de la cellule dans le monde
                    const cornerWorldX = (x - this.offsetX) / this.gridScale;
                    const cornerWorldZ = (y - this.offsetZ) / this.gridScale;
                    // Positionner le centre du plan au milieu de la cellule, basé sur le coin
                    const planeCenterX = cornerWorldX + cellSizeInWorld / 2;
                    const planeCenterZ = cornerWorldZ + cellSizeInWorld / 2;

                    const cellGeom = planeGeom.clone();
                    const matrix = new THREE.Matrix4();
                    matrix.makeRotationX(-Math.PI / 2);
                    // Utiliser la position calculée du centre du plan
                    matrix.setPosition(planeCenterX, this.sidewalkHeight, planeCenterZ); // Positionner au niveau du trottoir
                    cellGeom.applyMatrix4(matrix);
                    geometries.push(cellGeom);
                }
            }
        }
        planeGeom.dispose(); // Disposer la géométrie de base

        if (geometries.length > 0) {
             const mergedGeometry = mergeGeometries(geometries);
             if (mergedGeometry) {
                 const mesh = new THREE.Mesh(mergedGeometry, this.debugMaterialWalkable);
                 mesh.name = "Debug_NavGrid_Walkable";
                 targetGroup.add(mesh);
                 console.log(`NavigationGraph: Visualisation grille ajoutée (${geometries.length} cellules).`);
             } else { console.warn("NavigationGraph: Échec fusion géométries debug grille."); }
        } else { console.log("NavigationGraph: Aucune cellule marchable à visualiser."); }
    }

    // Méthode pour visualiser un chemin (inchangée conceptuellement, utilise gridToWorld)
    visualizePath(path, targetGroup) {
        if (!path || path.length < 2 || !targetGroup) return;
        // Supprimer l'ancienne visualisation de chemin s'il y en a une
        const existingPathViz = targetGroup.getObjectByName("pathVisualization");
        if (existingPathViz) {
            targetGroup.remove(existingPathViz);
             if (existingPathViz.geometry) existingPathViz.geometry.dispose();
        }

        const points = path.map(p => new THREE.Vector3(p.x, p.y + 0.02, p.z)); // Légèrement au-dessus
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, this.debugMaterialPath);
        line.name = "pathVisualization";
        targetGroup.add(line);
    }

    destroy() {
        console.log("NavigationGraph: Destruction...");
        // Rien à faire pour le SharedArrayBuffer explicitement ici,
        // mais assurez-vous qu'aucune référence n'est conservée ailleurs.
        this.gridBuffer = null;
        this.gridWalkableMap = null;
        if (this.debugMaterialWalkable) this.debugMaterialWalkable.dispose();
        if (this.debugMaterialPath) this.debugMaterialPath.dispose();
    }
}