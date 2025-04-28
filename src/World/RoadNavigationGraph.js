import NavigationGraph from './NavigationGraph.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WALKABLE = 0;
const NON_WALKABLE = 1;

// Constantes pour l'identification des voies
const LANE_NONE = 0;
const LANE_LEFT = 1;
const LANE_RIGHT = 2;

export default class RoadNavigationGraph extends NavigationGraph {
    constructor(config) {
        super(config);
        // Définir explicitement la largeur de la route à 6 cellules
        this.config.roadWidth = 6.0;
        this.config.sidewalkWidth = 2.0;
        this.debugMaterialWalkable = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }); // Rouge pour les routes
        this.graphHeight = 0.1;
        
        // Ajout d'une grille pour identifier les voies (gauche/droite)
        this.roadLanes = null;
        this.debugMaterialRightLane = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true }); // Vert pour voie droite
        this.debugMaterialLeftLane = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true }); // Bleu pour voie gauche
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
        
        // Créer la grille des voies avec la même taille que la grille principale
        this.roadLanes = new Uint8Array(this.gridWidth * this.gridHeight);
        this.roadLanes.fill(LANE_NONE);
        
        // Marquer les routes comme zones MARCHABLES
        console.log("RoadNavigationGraph: Marquage des routes comme marchables...");
        const cellSizeWorld = 1.0 / this.gridScale;
        let markedWalkable = 0;
        let markedRightLane = 0;
        let markedLeftLane = 0;
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
                    
                    // Déterminer si cette cellule appartient à la voie de droite ou de gauche
                    // On utilise un système de coordonnées où l'axe Z est aligné avec la route
                    // Pour les routes horizontales (le long de l'axe X)
                    if (gx % this.config.roadWidth < this.config.roadWidth / 2) {
                        this.roadLanes[index] = LANE_RIGHT; // Première moitié voie droite
                        markedRightLane++;
                    } else {
                        this.roadLanes[index] = LANE_LEFT; // Seconde moitié voie gauche
                        markedLeftLane++;
                    }
                }
            }
        }
        
        console.log(`RoadNavigationGraph: ${markedWalkable} cellules marquées comme marchables (routes).`);
        console.log(`RoadNavigationGraph: ${markedRightLane} cellules marquées comme voie droite, ${markedLeftLane} cellules marquées comme voie gauche.`);

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
     * Vérifie si une cellule de la grille est sur la voie de droite
     * @param {number} gridX - Coordonnée X de la grille
     * @param {number} gridY - Coordonnée Y de la grille
     * @returns {boolean} - true si la cellule est sur la voie de droite
     */
    isRightLane(gridX, gridY) {
        if (!this.isValidGridCoord(gridX, gridY)) return false;
        const index = gridY * this.gridWidth + gridX;
        return this.roadLanes[index] === LANE_RIGHT;
    }
    
    /**
     * Trouve le point de la voie de droite le plus proche d'un point donné
     * @param {THREE.Vector3} worldPos - Position dans le monde
     * @returns {{x: number, y: number}} - Point de la grille sur la voie de droite
     */
    getClosestRightLaneNode(worldPos) {
        const initialNode = this.getClosestWalkableNode(worldPos);
        if (!initialNode) return null;
        
        // Si déjà sur la voie de droite, retourner directement
        if (this.isRightLane(initialNode.x, initialNode.y)) {
            return initialNode;
        }
        
        // Sinon, rechercher le point le plus proche sur la voie de droite
        // en utilisant une recherche en spirale
        const maxSearchRadius = Math.max(this.gridWidth, this.gridHeight) / 4; // Limite raisonnable
        
        for (let r = 1; r <= maxSearchRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    // Ne considérer que les cellules sur le périmètre du rayon actuel
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    
                    const nx = initialNode.x + dx;
                    const ny = initialNode.y + dy;
                    
                    if (this.isValidGridCoord(nx, ny) && this.isWalkableAt(nx, ny) && this.isRightLane(nx, ny)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        
        // Si aucun point de voie droite n'a été trouvé, retourner le point initial
        return initialNode;
    }
    
    /**
     * Détermine quel côté de la route correspond à la voie de droite en fonction de la direction
     * @param {THREE.Vector3} directionVector - Vecteur de direction normalisé
     * @returns {THREE.Vector3} - Vecteur perpendiculaire orienté vers la droite par rapport à la direction
     */
    getRightSideVector(directionVector) {
        // Créer un vecteur perpendiculaire pointant vers la droite (inversé)
        // Pour une direction (dx, 0, dz), le vecteur perpendiculaire à droite est (-dz, 0, dx)
        return new THREE.Vector3(-directionVector.z, 0, directionVector.x).normalize();
    }
    
    /**
     * Trouve la position sur la voie de droite relative à une position et une direction
     * @param {THREE.Vector3} position - Position actuelle
     * @param {THREE.Vector3} direction - Direction de déplacement (normalisée)
     * @param {number} laneWidth - Largeur de voie (par défaut: 4 unités)
     * @returns {THREE.Vector3} - Position sur la voie de droite
     */
    findRightLanePosition(position, direction, laneWidth = 4) {
        if (!position || !direction || direction.lengthSq() < 0.001) {
            return position.clone();
        }
        
        // Obtenir le vecteur perpendiculaire pointant vers la droite
        const rightVector = this.getRightSideVector(direction);
        
        // Commencer par un déplacement modéré vers la voie de droite
        const targetPosition = position.clone().addScaledVector(rightVector, laneWidth);
        
        // Vérifier si la position cible est marchable (sur la route)
        const targetGridPos = this.worldToGrid(targetPosition.x, targetPosition.z);
        if (this.isWalkableAt(targetGridPos.x, targetGridPos.y)) {
            return targetPosition;
        }
        
        // Si ce n'est pas marchable, rechercher graduellement une position valide
        for (let offset = laneWidth * 0.75; offset > 0; offset *= 0.5) {
            const alternativePos = position.clone().addScaledVector(rightVector, offset);
            const altGridPos = this.worldToGrid(alternativePos.x, alternativePos.z);
            const rightOffset = position.clone().addScaledVector(rightVector, offset - 1.5);
            if (this.isWalkableAt(altGridPos.x, altGridPos.y)) {
                return rightOffset;
            }
        }
        
        // Si tous les essais échouent, retourner la position originale
        return position.clone();
    }

    /**
     * Ajuste un chemin pour qu'il suive la voie de droite relativement à la direction de déplacement
     * @param {Array<THREE.Vector3>} path - Chemin original
     * @returns {Array<THREE.Vector3>} - Chemin ajusté pour suivre la voie de droite
     */
    adjustPathToRightLane(path) {
        if (!path || path.length < 2) return path;
        
        const adjustedPath = [];
        
        // Traiter le premier point
        adjustedPath.push(path[0].clone());
        
        // Traiter tous les points intermédiaires
        for (let i = 1; i < path.length - 1; i++) {
            const prevPoint = path[i-1];
            const currentPoint = path[i];
            const nextPoint = path[i+1];
            
            // Calculer la direction d'arrivée
            const inDirection = new THREE.Vector3().subVectors(currentPoint, prevPoint).normalize();
            
            // Calculer la direction de sortie
            const outDirection = new THREE.Vector3().subVectors(nextPoint, currentPoint).normalize();
            
            // Utiliser la moyenne des deux directions pour les intersections où la direction change
            const avgDirection = new THREE.Vector3().addVectors(inDirection, outDirection).normalize();
            
            // Trouver la position ajustée sur la voie de droite
            const adjustedPosition = this.findRightLanePosition(currentPoint, avgDirection);

            adjustedPath.push(adjustedPosition);
        }
        
        // Traiter le dernier point
        if (path.length > 1) {
            const lastIndex = path.length - 1;
            const secondLastIndex = lastIndex - 1;
            
            // Direction du dernier segment
            const finalDirection = new THREE.Vector3().subVectors(
                path[lastIndex], path[secondLastIndex]
            ).normalize();
            
            // Ajuster le dernier point
            const adjustedFinalPosition = this.findRightLanePosition(path[lastIndex], finalDirection);
            adjustedPath.push(adjustedFinalPosition);
        }
        
        return adjustedPath;
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