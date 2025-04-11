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

        // Configurer le Finder A* (peut être ajusté)
        this.finder = new PF.AStarFinder({
            allowDiagonal: true,    // Permettre mouvements en diagonale
            dontCrossCorners: true, // Éviter de couper les coins des obstacles
            heuristic: PF.Heuristic.manhattan, // Heuristique (manhattan, euclidean, chebyshev)
            weight: 1               // Poids de l'heuristique (1 = équilibré)
        });

        console.log("Pathfinder: Initialisé avec PF.AStarFinder.");
    }

    /**
     * Trouve un chemin entre deux positions du monde en utilisant la grille de navigation.
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
            console.warn("Pathfinder.findPath: Impossible de trouver des nœuds de départ/arrivée marchables sur la grille.");
            return null;
        }

         if (startNode.x === endNode.x && startNode.y === endNode.y) {
             console.log("Pathfinder: Nœuds de départ et d'arrivée identiques sur la grille.");
             // Retourner un chemin simple avec juste le point de départ (converti)
             return [this.navigationGraph.gridToWorld(startNode.x, startNode.y)];
         }

        // 2. Cloner la grille pour cette recherche (IMPORTANT pour multi-agents)
        const gridClone = this.pfGrid.clone();

        // 3. Lancer la recherche A* de pathfinding-js
        console.log(`Pathfinder: Recherche chemin de ${startNode.x},${startNode.y} vers ${endNode.x},${endNode.y}`);
        let gridPath = [];
        try {
             gridPath = this.finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, gridClone);
        } catch (e) {
             console.error("Pathfinder: Erreur durant findPath de pathfinding-js:", e);
             return null;
        }


        // 4. Traiter le résultat
        if (!gridPath || gridPath.length === 0) {
            console.warn(`Pathfinder: Aucun chemin trouvé par A* entre (${startNode.x},${startNode.y}) et (${endNode.x},${endNode.y}).`);
            return null;
        }

        // 5. Convertir le chemin grille [x, y] en chemin monde [Vector3]
        // On peut simplifier le chemin avant conversion si besoin (PF.Util.smoothenPath),
        // mais pour trottoirs/routes, le chemin A* est souvent déjà assez direct.
        // const smoothedPath = PF.Util.smoothenPath(gridClone, gridPath);
        const worldPath = gridPath.map(node => this.navigationGraph.gridToWorld(node[0], node[1]));


        console.log(`Pathfinder: Chemin trouvé (${worldPath.length} points).`);
        return worldPath;
    }

     // La méthode reconstructPath n'est plus nécessaire car A* la gère en interne.
}