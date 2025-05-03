// src/World/Pathfinder.js
import * as PF from 'pathfinding'; // Importer la bibliothèque
import * as THREE from 'three';

export default class Pathfinder {
    constructor(navigationGraph) {
        this.navigationGraph = navigationGraph; // Instance de NavigationGraph
        this.pfGrid = navigationGraph ? navigationGraph.grid : null; // Accès direct à la grille PF.Grid

        if (!this.pfGrid) {
            console.warn("Pathfinder: Grille de navigation (PF.Grid) non fournie ou invalide.");
        }

        // Configurer le Finder A*
        /* this.finder = new PF.AStarFinder({
            allowDiagonal: true,    // Permettre mouvements en diagonale
            dontCrossCorners: true, // Éviter de couper les coins des obstacles
            heuristic: PF.Heuristic.manhattan, // Heuristique (manhattan, euclidean, chebyshev)
            weight: 1               // Poids de l'heuristique (1 = équilibré)
        }); */
		this.finder = new PF.JumpPointFinder({ // NOUVELLE LIGNE
			allowDiagonal: true,
			dontCrossCorners: true,
			heuristic: PF.Heuristic.manhattan // Ou une autre heuristique, JPS fonctionne bien avec plusieurs
			// Ajoutez d'autres options si disponibles pour JPS
		});

        console.log("Pathfinder: Initialisé avec PF.AStarFinder.");
    }

    /**
     * Trouve un chemin entre deux positions du monde.
     * Utilise getClosestWalkableNode pour trouver les points de départ/arrivée sur la grille.
     * Méthode conservée pour la compatibilité ou usages spécifiques.
     * @param {THREE.Vector3} startWorldPos La position de départ dans le monde.
     * @param {THREE.Vector3} endWorldPos La position d'arrivée dans le monde.
     * @returns {Array<THREE.Vector3> | null} Une liste de positions (Vector3) ou null si aucun chemin.
     */
    findPath(startWorldPos, endWorldPos) {
        if (!this.pfGrid || !this.navigationGraph) {
            console.error("Pathfinder.findPath: Grille ou NavigationGraph manquant.");
            return null;
        }

        // 1. Trouver les nœuds de grille les plus proches et marchables
        const startNode = this.navigationGraph.getClosestWalkableNode(startWorldPos);
        const endNode = this.navigationGraph.getClosestWalkableNode(endWorldPos);

        if (!startNode || !endNode) {
            console.warn("Pathfinder.findPath: Impossible de trouver nœuds départ/arrivée marchables sur grille.");
            return null;
        }

        // 2. Appeler la méthode interne qui prend les nœuds grille
        return this.findPathRaw(startNode, endNode);
    }

    /**
     * Trouve un chemin entre deux nœuds de la grille.
     * C'est la fonction principale appelée par AgentManager.
     * @param {{x: number, y: number}} startNode Coordonnées grille de départ.
     * @param {{x: number, y: number}} endNode Coordonnées grille d'arrivée.
     * @returns {Array<THREE.Vector3> | null} Une liste de positions monde (Vector3) ou null.
     */
	findPathRaw(startNode, endNode) {
		// Vérifications des prérequis
		if (!this.pfGrid || !this.navigationGraph || !startNode || !endNode) {
			console.error("Pathfinder.findPathRaw: Prérequis manquants (Grid, NavGraph, startNode, endNode).");
			return null;
		}
		if (!this.pfGrid.nodes || this.pfGrid.width <= 0 || this.pfGrid.height <= 0) {
			console.error("Pathfinder.findPathRaw: La grille PF.Grid semble invalide ou vide.");
			return null;
		}
		if (
			startNode.x < 0 || startNode.x >= this.pfGrid.width ||
			startNode.y < 0 || startNode.y >= this.pfGrid.height ||
			endNode.x   < 0 || endNode.x   >= this.pfGrid.width ||
			endNode.y   < 0 || endNode.y   >= this.pfGrid.height
		) {
			console.error(
				`Pathfinder.findPathRaw: StartNode (${startNode.x},${startNode.y}) ou ` +
				`EndNode (${endNode.x},${endNode.y}) hors limites grille ` +
				`(${this.pfGrid.width}x${this.pfGrid.height}).`
			);
			return null;
		}

		// Si départ = arrivée, on renvoie directement un point
		if (startNode.x === endNode.x && startNode.y === endNode.y) {
			return [ this.navigationGraph.gridToWorld(startNode.x, startNode.y) ];
		}

		// Cloner la grille pour la recherche
		const gridClone = this.pfGrid.clone();

		// --- CORRECTION : assurer que start et end sont marchables ---
		gridClone.setWalkableAt(startNode.x, startNode.y, true);
		gridClone.setWalkableAt(endNode.x,   endNode.y,   true);

		// Lancer la recherche A*
		let gridPath;
		try {
			gridPath = this.finder.findPath(
				startNode.x, startNode.y,
				endNode.x,   endNode.y,
				gridClone
			);
		} catch (e) {
			console.error(
				`Pathfinder.findPathRaw: Erreur A* de ` +
				`(${startNode.x},${startNode.y}) vers ` +
				`(${endNode.x},${endNode.y}):`, e
			);
			return null;
		}

		// Aucun chemin trouvé
		if (!gridPath || gridPath.length === 0) {
			return null;
		}

		// Conversion du chemin grille en chemin monde
		const worldPath = gridPath.map(([gx, gy]) =>
			this.navigationGraph.gridToWorld(gx, gy)
		);

		return worldPath;
	}
}