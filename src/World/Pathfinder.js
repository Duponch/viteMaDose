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
        this.finder = new PF.AStarFinder({
            allowDiagonal: true,    // Permettre mouvements en diagonale
            dontCrossCorners: true, // Éviter de couper les coins des obstacles
            heuristic: PF.Heuristic.manhattan, // Heuristique (manhattan, euclidean, chebyshev)
            weight: 1               // Poids de l'heuristique (1 = équilibré)
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
         if (startNode.x < 0 || startNode.x >= this.pfGrid.width || startNode.y < 0 || startNode.y >= this.pfGrid.height ||
             endNode.x < 0 || endNode.x >= this.pfGrid.width || endNode.y < 0 || endNode.y >= this.pfGrid.height) {
              console.error(`Pathfinder.findPathRaw: StartNode (${startNode.x},${startNode.y}) ou EndNode (${endNode.x},${endNode.y}) hors limites grille (${this.pfGrid.width}x${this.pfGrid.height}).`);
              return null;
         }

        // Vérifier si départ et arrivée sont identiques
        if (startNode.x === endNode.x && startNode.y === endNode.y) {
             return [this.navigationGraph.gridToWorld(startNode.x, startNode.y)];
         }

        // Cloner la grille pour la recherche A*
        const gridClone = this.pfGrid.clone();

        // Lancer la recherche A*
        let gridPath = []; // Format: [ [x1, y1], [x2, y2], ... ]
        try {
             gridPath = this.finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, gridClone);
        } catch (e) {
             console.error(`Pathfinder: Erreur A* de (${startNode.x},${startNode.y}) vers (${endNode.x},${endNode.y}):`, e);
              if (!gridClone.isWalkableAt(startNode.x, startNode.y)) { console.error(` -> Le nœud de départ (${startNode.x},${startNode.y}) n'est pas marchable.`); }
              if (!gridClone.isWalkableAt(endNode.x, endNode.y)) { console.error(` -> Le nœud d'arrivée (${endNode.x},${endNode.y}) n'est pas marchable.`); }
             return null;
        }

        // Traiter le résultat
        if (!gridPath || gridPath.length === 0) {
            // console.warn(`Pathfinder: Aucun chemin A* trouvé entre (${startNode.x},${startNode.y}) et (${endNode.x},${endNode.y}).`);
            return null;
        }

        // ==============================================================
        // RETRAIT DE L'APPEL À PF.Util.smoothenPath à cause du bug
        // On utilisera directement gridPath (le chemin A* brut)
        //
        // const smoothedGridPath = PF.Util.smoothenPath(gridClone, gridPath); // <-- LIGNE RETIRÉE/COMMENTÉE
        // const finalGridPath = smoothedGridPath.length > 0 ? smoothedGridPath : gridPath; // <-- LIGNE INUTILE MAINTENANT
        // ==============================================================

        // Convertir le chemin grille A* brut en chemin monde
        // Utilise directement gridPath au lieu de finalGridPath
        const worldPath = gridPath.map(node => this.navigationGraph.gridToWorld(node[0], node[1]));

        // console.log(`Pathfinder: Chemin A* trouvé et converti (${worldPath.length} points). Lissage désactivé.`);
        return worldPath;
    }
}