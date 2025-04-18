// src/World/HPA/AbstractGraph.js
import * as PF from 'pathfinding'; // Pour utiliser PF.Node si besoin

/**
 * Représente un nœud dans le graphe abstrait HPA. Typiquement une "porte".
 */
class HPANode {
    /**
     * @param {number} id - ID unique du nœud/porte sur toute la carte.
     * @param {number} zoneId - ID de la zone (District) à laquelle appartient principalement cette porte.
     * @param {number} x - Coordonnée X sur la grille fine.
     * @param {number} y - Coordonnée Y sur la grille fine.
     */
    constructor(id, zoneId, x, y) {
        this.id = id;         // Unique ID for the gate/node
        this.zoneId = zoneId; // ID of the zone this gate belongs to
        this.x = x;           // Grid X coordinate
        this.y = y;           // Grid Y coordinate

        // Pathfinding properties (similar to PF.Node, can be used by A* on this abstract graph)
        this.f = 0;
        this.g = 0;
        this.h = 0;
        this.cost = 1; // Default cost, might be adjusted
        this.visited = false;
        this.closed = false;
        this.parent = null;
        this.heapIndex = -1; // For binary heap optimization in A*

         /** @type {Array<HPAEdge>} */
        this.edges = []; // Liens vers les nœuds voisins
    }

    /**
     * Ajoute une connexion (arête) vers un autre nœud HPA.
     * @param {HPANode} neighborNode - Le nœud voisin.
     * @param {number} cost - Le coût (distance/temps) pour atteindre ce voisin.
     * @param {Array<{x: number, y: number}>} [pathNodes=null] - (Optionnel) Chemin détaillé sur la grille fine.
     */
    addEdge(neighborNode, cost, pathNodes = null) {
        const edge = new HPAEdge(this, neighborNode, cost, pathNodes);
        this.edges.push(edge);
    }
}

/**
 * Représente une arête (connexion) dans le graphe abstrait HPA.
 */
class HPAEdge {
    /**
     * @param {HPANode} fromNode - Le nœud de départ.
     * @param {HPANode} toNode - Le nœud d'arrivée.
     * @param {number} cost - Le coût pour traverser cette arête.
     * @param {Array<{x: number, y: number}>} [detailPath=null] - (Optionnel) Chemin détaillé sur la grille fine.
     */
    constructor(fromNode, toNode, cost, detailPath = null) {
        this.from = fromNode;
        this.to = toNode;
        this.cost = cost;
        this.detailPath = detailPath; // Store the detailed low-level path if available/needed
    }
}


/**
 * Représente le graphe abstrait HPA complet.
 * Contient les zones, les nœuds (portes) et les arêtes (connexions précalculées).
 */
export default class AbstractGraph {
    constructor() {
        /** @type {Map<number, HPANode>} */
        this.nodes = new Map(); // Map<nodeId, HPANode>
        /** @type {Map<number, Array<HPANode>>} */
        this.nodesByZone = new Map(); // Map<zoneId, Array<HPANode>>
        // AStar finder pour le graphe abstrait lui-même
        this.finder = new PF.AStarFinder({
            allowDiagonal: false, // Généralement false pour les graphes abstraits
            dontCrossCorners: true,
             heuristic: (nodeA, nodeB) => { // Heuristique basée sur la distance grille
                const dx = Math.abs(nodeA.x - nodeB.x);
                const dy = Math.abs(nodeA.y - nodeB.y);
                return dx + dy; // Manhattan distance
            }
        });
        console.log("AbstractGraph HPA initialisé.");
    }

    addNode(node) {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node);
            if (!this.nodesByZone.has(node.zoneId)) {
                this.nodesByZone.set(node.zoneId, []);
            }
            this.nodesByZone.get(node.zoneId).push(node);
        }
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    getNodesInZone(zoneId) {
        return this.nodesByZone.get(zoneId) || [];
    }

    addEdge(fromNodeId, toNodeId, cost, detailPath = null) {
        const fromNode = this.getNode(fromNodeId);
        const toNode = this.getNode(toNodeId);
        if (fromNode && toNode) {
            // Ajoute l'arête dans les deux sens si ce n'est pas déjà fait
            if (!fromNode.edges.some(edge => edge.to === toNode)) {
                fromNode.addEdge(toNode, cost, detailPath);
            }
            if (!toNode.edges.some(edge => edge.to === fromNode)) {
                toNode.addEdge(fromNode, cost, detailPath ? [...detailPath].reverse() : null); // Inverse le chemin détaillé pour le retour
            }
        } else {
             console.warn(`AbstractGraph: Impossible d'ajouter l'arête, nœud(s) non trouvé(s): ${fromNodeId} -> ${toNodeId}`);
        }
    }

    /**
     * Trouve un chemin abstrait entre deux nœuds du graphe HPA.
     * @param {number} startNodeId - ID du nœud de départ HPA.
     * @param {number} endNodeId - ID du nœud d'arrivée HPA.
     * @returns {Array<HPANode>|null} Le chemin trouvé sous forme de liste de HPANodes, ou null.
     */
    findAbstractPath(startNodeId, endNodeId) {
        const startNode = this.getNode(startNodeId);
        const endNode = this.getNode(endNodeId);

        if (!startNode || !endNode) {
            console.error(`AbstractGraph: Nœuds de départ ou d'arrivée invalides pour findAbstractPath (${startNodeId}, ${endNodeId})`);
            return null;
        }

        // --- Préparation pour A* ---
        // Réinitialiser les propriétés des nœuds (visited, closed, parent, f, g, h)
        this.nodes.forEach(node => {
            node.f = 0;
            node.g = 0;
            node.h = 0;
            node.visited = false;
            node.closed = false;
            node.parent = null;
            node.heapIndex = -1; // Important si on utilise un tas binaire
        });

        // --- Utilisation de l'algorithme A* interne de pathfinding-js ---
        // Note: pathfinding-js A* travaille sur une grille (matrix) par défaut.
        // Pour l'appliquer à notre graphe de nœuds/arêtes, on doit adapter l'approche.
        // Option 1: Utiliser une bibliothèque A* générique pour graphes.
        // Option 2: Simuler la grille ou adapter l'A* de pathfinding-js.

        // --- Option 2 Simplifiée (Implémentation A* Manuelle Basique) ---
        // Utilise un BinaryHeap pour la liste ouverte (plus performant)
        const openHeap = new PF.Heap((nodeA, nodeB) => nodeA.f - nodeB.f);

        startNode.g = 0;
        startNode.h = this.finder.heuristic(startNode, endNode);
        startNode.f = startNode.g + startNode.h;
        openHeap.push(startNode);
        startNode.visited = true; // Marquer comme ajouté à la liste ouverte

        while (!openHeap.empty()) {
            // Récupérer le nœud avec le plus petit f
            const currentNode = openHeap.pop();
            currentNode.closed = true; // Marquer comme traité

            // Si on a atteint la destination
            if (currentNode === endNode) {
                // Reconstruire le chemin
                const path = [];
                let curr = currentNode;
                while (curr) {
                    path.push(curr);
                    curr = curr.parent;
                }
                return path.reverse(); // Renvoyer le chemin dans le bon ordre
            }

            // Parcourir les voisins (arêtes)
            for (const edge of currentNode.edges) {
                const neighbor = edge.to;

                // Ignorer si déjà fermé ou non accessible (pas de notion de walkable ici)
                if (neighbor.closed) {
                    continue;
                }

                // Calculer le coût g pour atteindre ce voisin via le nœud courant
                const gScore = currentNode.g + edge.cost;

                // Si le voisin n'a pas été visité ou si ce chemin est meilleur
                if (!neighbor.visited || gScore < neighbor.g) {
                    neighbor.parent = currentNode;
                    neighbor.g = gScore;
                    neighbor.h = neighbor.h || this.finder.heuristic(neighbor, endNode); // Calculer h si pas déjà fait
                    neighbor.f = neighbor.g + neighbor.h;

                    if (!neighbor.visited) {
                         openHeap.push(neighbor);
                         neighbor.visited = true; // Marquer comme ajouté
                    } else {
                        // Le nœud est déjà dans le tas, mettre à jour sa position
                        openHeap.updateItem(neighbor);
                    }
                }
            }
        }

        // Aucun chemin trouvé
        return null;
    }

    // --- Optionnel : Méthode pour sérialiser/désérialiser le graphe pour le worker ---
    serialize() {
        const nodesData = [];
        this.nodes.forEach(node => {
            nodesData.push({
                id: node.id,
                zoneId: node.zoneId,
                x: node.x,
                y: node.y,
                edges: node.edges.map(edge => ({
                    toId: edge.to.id,
                    cost: edge.cost
                    // On ne sérialise PAS le detailPath pour garder le message léger
                }))
            });
        });
        return JSON.stringify({ nodes: nodesData });
        // Note: Pour de très grands graphes, un format binaire (ArrayBuffer) serait plus efficace.
    }

    static deserialize(jsonData) {
        const data = JSON.parse(jsonData);
        const graph = new AbstractGraph();

        // 1. Créer tous les nœuds
        data.nodes.forEach(nodeData => {
            const node = new HPANode(nodeData.id, nodeData.zoneId, nodeData.x, nodeData.y);
            graph.addNode(node);
        });

        // 2. Ajouter les arêtes
        data.nodes.forEach(nodeData => {
            const fromNode = graph.getNode(nodeData.id);
            if (fromNode && nodeData.edges) {
                 nodeData.edges.forEach(edgeData => {
                    const toNode = graph.getNode(edgeData.toId);
                    if (toNode) {
                        // Ajouter l'arête dans un seul sens suffit car on l'ajoutera
                        // aussi en traitant le nœud 'toNode' dans la boucle externe.
                         // Éviter doublons en vérifiant avant d'ajouter.
                        if (!fromNode.edges.some(e => e.to === toNode)) {
                            fromNode.addEdge(toNode, edgeData.cost);
                        }
                    }
                });
            }
        });
        console.log(`AbstractGraph désérialisé avec ${graph.nodes.size} nœuds.`);
        return graph;
    }
}
// Export HPANode et HPAEdge si nécessaire pour d'autres modules
export { HPANode, HPAEdge };