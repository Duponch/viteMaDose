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
        this.graphHeight = 0.1;
    }

    buildGraph(plots, crosswalkInfos) {
        // Appeler la méthode parent pour initialiser la grille
        super.buildGraph(plots, crosswalkInfos);

        // Réinitialiser complètement la grille pour les routes
        this.rebuildRoadGrid(plots, crosswalkInfos);
        this.updatePFGrid();
    }

    rebuildRoadGrid(plots, crosswalkInfos) {
        console.log("RoadNavigationGraph: Reconstruction grille routière (Trottoirs NON marchables)...");
        
        // Initialiser la grille à NON MARCHABLE
        this.gridWalkableMap.fill(NON_WALKABLE);
        
        // Marquer les routes comme zones MARCHABLES
        console.log("RoadNavigationGraph: Marquage des routes comme marchables...");
        const cellSizeWorld = 1.0 / this.gridScale;
        let markedWalkable = 0;
        const sidewalkWidth = this.config.sidewalkWidth || 0;

        // Itérer sur toutes les cellules de la grille
        for (let gy = 0; gy < this.gridHeight; gy++) {
            for (let gx = 0; gx < this.gridWidth; gx++) {
                const index = gy * this.gridWidth + gx;
                // Obtenir le centre de la cellule en coordonnées monde
                const cellCenterWorld = this.gridToWorld(gx, gy); // Utilise la hauteur route (0.1)
                const cx = cellCenterWorld.x;
                const cz = cellCenterWorld.z;
                
                let isOverPlotOrSidewalk = false;
                
                // Vérifier si la cellule est sur une parcelle ou un trottoir
                for (const plot of plots) {
                    const plotMinX = plot.x;
                    const plotMaxX = plot.x + plot.width;
                    const plotMinZ = plot.z;
                    const plotMaxZ = plot.z + plot.depth;

                    // Calculer les limites étendues INCLUANT le trottoir
                    const extendedMinX = plotMinX - sidewalkWidth;
                    const extendedMaxX = plotMaxX + sidewalkWidth;
                    const extendedMinZ = plotMinZ - sidewalkWidth;
                    const extendedMaxZ = plotMaxZ + sidewalkWidth;

                    // Si le centre de la cellule est dans la zone étendue, c'est non-marchable pour les voitures
                    // Utiliser une tolérance pour les bords
                    const tolerance = 0.01;
                    if (cx > extendedMinX - tolerance && cx < extendedMaxX + tolerance && 
                        cz > extendedMinZ - tolerance && cz < extendedMaxZ + tolerance) {
                        isOverPlotOrSidewalk = true;
                        break; // Pas besoin de vérifier les autres parcelles
                    }
                }

                // Si la cellule n'est PAS sur une parcelle ou un trottoir, elle est considérée comme une route marchable
                if (!isOverPlotOrSidewalk) {
                    this.gridWalkableMap[index] = WALKABLE;
                    markedWalkable++;
                }
            }
        }
        
        console.log(`RoadNavigationGraph: ${markedWalkable} cellules marquées comme marchables (routes).`);

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

    // --- Surcharge de getClosestWalkableNode pour les routes ---
    // Recherche le nœud de route marchable le plus proche, en étendant la recherche
    // si la position initiale tombe sur un trottoir ou une parcelle (non marchable ici).
    getClosestWalkableNode(worldPos) {
		if (!this.gridWalkableMap) {
            console.error("RoadNavigationGraph.getClosestWalkableNode: gridWalkableMap non initialisé.");
            return null;
        }
	
		// 1) Position « brute » en grille
		const startGrid = this.worldToGrid(worldPos.x, worldPos.z);
	
		// 2) Vérifier si cette cellule est DIRECTEMENT marchable (sur une route)
		if (this.isWalkableAt(startGrid.x, startGrid.y)) {
			return startGrid; // Le point est déjà sur une route valide
		}
        
        // 3) Si non marchable (sur trottoir/parcelle), lancer la recherche en spirale ÉLARGIE
        console.log(`RoadNavigationGraph: Node initial (${startGrid.x},${startGrid.y}) non marchable (route). Recherche étendue...`);
		const maxSearchRadius = Math.max(this.gridWidth, this.gridHeight); // Rayon max
		let bestNode = null;
		let minGridDistSq = Infinity;
	
		for (let r = 1; r <= maxSearchRadius; r++) {
			for (let dx = -r; dx <= r; dx++) {
				for (let dy = -r; dy <= r; dy++) {
                    // Ne considérer que les cellules sur le périmètre du rayon actuel
					if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
	
					const x = startGrid.x + dx;
                    const y = startGrid.y + dy;
                    
                    // Vérifier si la cellule voisine est marchable SUR LA ROUTE
					if (this.isWalkableAt(x, y)) { // isWalkableAt de RoadNavigationGraph
                        const d2 = dx*dx + dy*dy;
                        if (d2 < minGridDistSq) {
                            minGridDistSq = d2;
                            bestNode = { x, y };
                        }
                    }
				}
			}
			// Si on a trouvé un nœud à ce rayon, c'est le plus proche, on arrête
			if (bestNode) {
                const bestNodeIndex = bestNode.y * this.gridWidth + bestNode.x;
                const bestNodeValue = this.gridWalkableMap[bestNodeIndex];
                console.log(`RoadNavigationGraph: Nœud routier le plus proche trouvé à (${bestNode.x},${bestNode.y}), Valeur Map: ${bestNodeValue} (0=Walkable). Distance grille^2 = ${minGridDistSq.toFixed(1)}`);
                return bestNode;
            }
		}
	
		// 4) Si aucun nœud routier trouvé (très improbable sauf grille vide)
		console.error(
		  `RoadNavigationGraph: Aucun nœud de ROUTE marchable trouvé près de`, 
		  worldPos, `(Grille origine: ${startGrid.x},${startGrid.y})`
		);
        // Renvoyer null ou le point d'origine comme fallback?
        // Renvoyer null est peut-être plus sûr pour indiquer l'échec.
		return null; 
	}	
    // --- FIN Surcharge ---

    // Surcharger gridToWorld pour retourner une position au niveau de la route
    gridToWorld(gridX, gridY) {
        const worldPos = super.gridToWorld(gridX, gridY);
        worldPos.y = 0.1; // Légèrement au-dessus de la route
        return worldPos;
    }

	/**
	 * Trouve un nœud de grille aléatoire qui est marchable sur cette grille routière.
	 * @param {number} maxAttempts - Nombre maximum de tentatives pour trouver un nœud marchable.
	 * @returns {{x: number, y: number} | null} Un nœud marchable ou null si aucun n'est trouvé.
	 */
	getRandomWalkableNode(maxAttempts = 500) {
		if (!this.gridWalkableMap || this.gridWidth <= 0 || this.gridHeight <= 0) {
			console.error("RoadNavigationGraph: Grille non initialisée ou invalide pour getRandomWalkableNode.");
			return null;
		}

		let attempts = 0;
		while (attempts < maxAttempts) {
			const randomX = Math.floor(Math.random() * this.gridWidth);
			const randomY = Math.floor(Math.random() * this.gridHeight);

			if (this.isWalkableAt(randomX, randomY)) { // isWalkableAt vérifie déjà les limites
				// console.log(`[Debug] Random Walkable Node Found (Road): (${randomX}, ${randomY})`);
				return { x: randomX, y: randomY };
			}
			attempts++;
		}

		console.warn(`RoadNavigationGraph: Impossible de trouver un nœud routier marchable aléatoire après ${maxAttempts} tentatives.`);
		return null; // Retourne null si aucun nœud n'est trouvé
	}
} 