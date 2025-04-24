// --- src/World/PathfindingWorker.js ---

// Supprimé: import * as PF from 'pathfinding';

// --- Constantes partagées (doivent correspondre à NavigationGraph.js) ---
const WALKABLE = 0;
const NON_WALKABLE = 1;

// --- Variables globales du worker ---
// Supprimé: let pfGrid = null;
let workerGridWalkableMap = null; // Uint8Array view on the SharedArrayBuffer
let gridWidth = 0;
let gridHeight = 0;
// Supprimé: let finder = null;
let gridScale = 0.5;
let offsetX = 0;
let offsetZ = 0;
let sidewalkHeight = 0.2;

// --- Fonction helper pour calculer la distance (inchangée) ---
function calculateWorldDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dz * dz);
}

// --- Fonction gridToWorld (inchangée) ---
function gridToWorld(gridX, gridY) {
    if (gridScale === undefined || offsetX === undefined || offsetZ === undefined || sidewalkHeight === undefined) {
        console.error("[Worker] Variables de conversion non définies dans gridToWorld!");
        gridScale = gridScale ?? 1.0;
        offsetX = offsetX ?? 0;
        offsetZ = offsetZ ?? 0;
        sidewalkHeight = sidewalkHeight ?? 0.2;
    }
    const worldX = (gridX + 0.5 - offsetX) / gridScale;
    const worldZ = (gridY + 0.5 - offsetZ) / gridScale;
    return { x: worldX, y: sidewalkHeight + 0.05, z: worldZ };
}

// --- CORRIGÉ : Fonction onmessage complète ---
self.onmessage = function(event) {
    // 'data' contient l'objet envoyé depuis le thread principal (event.data)
    const { type, data } = event.data;

    try {
        if (type === 'init') {
            console.log('[Worker] Initialisation reçue (mode SharedArrayBuffer + A* interne).');
            // Modifier pour accepter gridBuffer au lieu de gridData
            // if (data && data.gridData && data.conversionParams) {
            if (data && data.gridBuffer && data.gridWidth && data.gridHeight && data.conversionParams) {
                // const { width, height, nodesWalkable } = data.gridData;
                const params = data.conversionParams;
                const receivedBuffer = data.gridBuffer;
                gridWidth = data.gridWidth;
                gridHeight = data.gridHeight;

                // Vérifier si on a bien reçu un SharedArrayBuffer
                if (!(receivedBuffer instanceof SharedArrayBuffer)) {
                    throw new Error("L'objet reçu n'est pas un SharedArrayBuffer.");
                }

                // Stocker les paramètres de conversion
                gridScale = params.gridScale ?? 1.0;
                offsetX = params.offsetX ?? 0;
                offsetZ = params.offsetZ ?? 0;
                sidewalkHeight = params.sidewalkHeight ?? 0.2;

                // Créer la vue sur le buffer partagé
                workerGridWalkableMap = new Uint8Array(receivedBuffer);
                console.log(`[Worker] Vue Uint8Array créée sur SharedArrayBuffer (${gridWidth}x${gridHeight}).`);

                // Supprimer la création de pfGrid ici
                // if (width > 0 && height > 0 && nodesWalkable && nodesWalkable.length === height && nodesWalkable[0]?.length === width) {
                //     const matrix = nodesWalkable.map(row => row.map(walkable => walkable ? 0 : 1));
                //     pfGrid = new PF.Grid(width, height, matrix);

                // Supprimer l'initialisation du finder
                /* finder = new PF.JumpPointFinder({ // Ou PF.AStarFinder
                    allowDiagonal: true,
                    dontCrossCorners: true,
                    heuristic: PF.Heuristic.manhattan
                }); */

                // console.log(`[Worker] Finder initialisé.`);
                console.log('[Worker] Prêt pour les requêtes A*.');
                self.postMessage({ type: 'initComplete' });
                // } else {
                //     console.error("[Worker] Données de grille invalides ou dimensions incohérentes reçues.", { width, height, nodesWalkable_height: nodesWalkable?.length, nodesWalkable_width: nodesWalkable?.[0]?.length });
                //     throw new Error("Données de grille invalides ou dimensions incohérentes pour l'initialisation.");
                // }
            } else {
                 // throw new Error("Données manquantes pour l'initialisation (gridData ou conversionParams).");
                 throw new Error("Données manquantes pour l'initialisation (gridBuffer, gridWidth, gridHeight ou conversionParams).");
            }

        } else if (type === 'findPath') {
            // --- Vérifications initiales adaptées ---
            // if (!pfGrid || !finder) {
            if (!workerGridWalkableMap) { // On vérifie juste la map maintenant
                console.error(`[Worker] Tentative findPath Agent ${data?.agentId} mais worker non initialisé ou buffer manquant.`);
                 if(data?.agentId) {
                     self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0 } });
                 }
                return;
            }
            // Vérifie si data et les propriétés nécessaires existent
            if (!data || !data.agentId || !data.startNode || !data.endNode) {
                 console.error("[Worker] Données manquantes pour requête findPath:", data);
                  if(data?.agentId) {
                     self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0 } });
                 }
                 return;
            }
            // --- FIN Vérifications initiales ---

            // *** Déclaration des variables DANS la portée du bloc 'findPath' ***
            const { agentId, startNode, endNode } = data;

            // Vérification supplémentaire des bornes (utilise gridWidth/gridHeight globaux)
            const isValidCoord = (node) => node && node.x >= 0 && node.x < gridWidth && node.y >= 0 && node.y < gridHeight;
            if (!isValidCoord(startNode) || !isValidCoord(endNode)) {
                 console.error(`[Worker] Coordonnées invalides pour Agent ${agentId} - Start: (${startNode?.x}, ${startNode?.y}), End: (${endNode?.x}, ${endNode?.y}). Limites grille: ${gridWidth}x${gridHeight}`);
                 self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                 return;
            }

            // Gérer le cas départ = arrivée
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                 const worldPathData = [gridToWorld(startNode.x, startNode.y)];
                 self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData, pathLengthWorld: 0 } });
                 return;
            }

            let gridPath = null;
            let worldPathData = null;
            let pathLengthWorld = 0;

            // !!! Début de la zone à remplacer par l'implémentation A* !!!
            try {
                // --- Supprimer toute l'ancienne logique de PF.Grid et finder.findPath --- 
                /* 
                const matrix = [];
                // ... remplissage matrix ... 
                const currentSearchGrid = new PF.Grid(gridWidth, gridHeight, matrix);
                currentSearchGrid.setWalkableAt(startNode.x, startNode.y, true);
                currentSearchGrid.setWalkableAt(endNode.x, endNode.y, true);
                gridPath = finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, currentSearchGrid);
                */

                // +++ Placeholder pour l'implémentation A* +++
                console.time(`[Worker] A* Path ${agentId}`); // Timer pour mesurer A*
                gridPath = findPathAStar(startNode, endNode);
                console.timeEnd(`[Worker] A* Path ${agentId}`);
                // --- Fin Placeholder ---

                // Traitement du chemin trouvé (inchangé pour l'instant)
                if (gridPath && gridPath.length > 0) {
                    worldPathData = gridPath.map(node => gridToWorld(node.x, node.y));
                    if (worldPathData.length > 1) {
                        pathLengthWorld = 0; // Réinitialiser ici pour être sûr
                        for (let i = 0; i < worldPathData.length - 1; i++) {
                            pathLengthWorld += calculateWorldDistance(worldPathData[i], worldPathData[i+1]);
                        }
                    } else {
                         pathLengthWorld = 0; // Chemin d'un seul point
                    }
                } else {
                    worldPathData = null;
                    pathLengthWorld = 0;
                }

            } catch (e) {
                // Log erreur pathfinding (inchangé)
                console.error(`[Worker] Erreur DANS finder.findPath pour Agent ${agentId} (${startNode.x},${startNode.y})->(${endNode.x},${endNode.y}):`, e);
                 try {
                     // Vérifier la marchabilité sur la grille locale (currentSearchGrid) si elle existe
                     if (currentSearchGrid && !currentSearchGrid.isWalkableAt(startNode.x, startNode.y)) console.error(` -> Start node (${startNode.x}, ${startNode.y}) non marchable sur grille locale.`);
                     if (currentSearchGrid && !currentSearchGrid.isWalkableAt(endNode.x, endNode.y)) console.error(` -> End node (${endNode.x}, ${endNode.y}) non marchable sur grille locale.`);
                 } catch (walkError) { console.error(" -> Erreur lors de la vérification isWalkableAt:", walkError); }

                worldPathData = null;
                pathLengthWorld = 0;
            }
            // !!! Fin de la zone à remplacer par l'implémentation A* !!!

            // Envoyer le résultat (succès ou échec après tentative)
            self.postMessage({
                type: 'pathResult',
                data: { agentId, path: worldPathData, pathLengthWorld: pathLengthWorld }
            });

        } else {
            console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        // --- CORRECTION DANS LE CATCH ---
        // Erreur générale dans le handler onmessage
        console.error('[Worker] Erreur générale dans onmessage:', error);
         // Tenter de renvoyer une erreur spécifique si possible
         // Accéder à agentId via 'data' (qui est event.data)
         const agentIdOnError = data?.agentId; // <<< CORRIGÉ ICI
         if (agentIdOnError) {
             // Renvoyer un résultat d'échec pour cet agent
             self.postMessage({ type: 'pathResult', data: { agentId: agentIdOnError, path: null, pathLengthWorld: 0 } });
         } else {
             // Si on ne peut pas identifier l'agent, envoyer une erreur générique
             self.postMessage({ type: 'workerError', error: error.message, data: event.data }); // event.data contient l'intégralité du message reçu
         }
         // --- FIN CORRECTION DANS LE CATCH ---
    }
};

// --- Nouvelle section pour l'implémentation A* ---

// --- Implémentation Min-Heap (File de Priorité) ---
class MinHeap {
    constructor() {
        this.heap = []; // Tableau pour stocker les éléments du tas [{item, priority}]
    }

    // Insère un élément avec sa priorité
    insert(item, priority) {
        this.heap.push({ item, priority });
        this._siftUp(this.heap.length - 1);
    }

    // Extrait l'élément avec la priorité la plus faible (minimum)
    extractMin() {
        if (this.isEmpty()) {
            return null;
        }
        this._swap(0, this.heap.length - 1);
        const minItem = this.heap.pop();
        if (!this.isEmpty()) {
            this._siftDown(0);
        }
        return minItem; // Retourne {item, priority}
    }

    // Vérifie si le tas est vide
    isEmpty() {
        return this.heap.length === 0;
    }

    // Fait "remonter" un élément pour maintenir la propriété du tas
    _siftUp(index) {
        if (index === 0) return;
        const parentIndex = this._getParentIndex(index);
        if (this.heap[parentIndex].priority > this.heap[index].priority) {
            this._swap(parentIndex, index);
            this._siftUp(parentIndex);
        }
    }

    // Fait "descendre" un élément pour maintenir la propriété du tas
    _siftDown(index) {
        const leftChildIndex = this._getLeftChildIndex(index);
        const rightChildIndex = this._getRightChildIndex(index);
        let smallestIndex = index;

        if (leftChildIndex < this.heap.length && this.heap[leftChildIndex].priority < this.heap[smallestIndex].priority) {
            smallestIndex = leftChildIndex;
        }
        if (rightChildIndex < this.heap.length && this.heap[rightChildIndex].priority < this.heap[smallestIndex].priority) {
            smallestIndex = rightChildIndex;
        }

        if (smallestIndex !== index) {
            this._swap(index, smallestIndex);
            this._siftDown(smallestIndex);
        }
    }

    // Fonctions utilitaires pour les indices
    _getParentIndex(index) { return Math.floor((index - 1) / 2); }
    _getLeftChildIndex(index) { return 2 * index + 1; }
    _getRightChildIndex(index) { return 2 * index + 2; }
    _swap(i, j) { [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]]; }
}
// --- Fin Min-Heap ---

// Fonction Heuristique (Manhattan distance)
function heuristic(nodeA, nodeB) {
    const dx = Math.abs(nodeA.x - nodeB.x);
    const dy = Math.abs(nodeA.y - nodeB.y);
    return dx + dy;
}

// Vérifie si une coordonnée est dans la grille
function isValid(x, y) {
    return x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
}

// Vérifie si une cellule est marchable (utilise la map partagée)
function isWalkable(x, y) {
    if (!isValid(x, y)) return false;
    const index = y * gridWidth + x;
    return workerGridWalkableMap[index] === WALKABLE;
}

// Obtient les voisins marchables d'un nœud
// TODO: Ajouter l'option dontCrossCorners si nécessaire
function getNeighbors(node) {
    const neighbors = [];
    const x = node.x;
    const y = node.y;
    const allowDiagonal = true; // Option A*

    // Voisins directs (haut, bas, gauche, droite)
    const directNeighbors = [
        { x: x, y: y + 1 }, { x: x, y: y - 1 },
        { x: x + 1, y: y }, { x: x - 1, y: y }
    ];
    for (const neighbor of directNeighbors) {
        if (isWalkable(neighbor.x, neighbor.y)) {
            neighbors.push(neighbor);
        }
    }

    if (allowDiagonal) {
        // Voisins diagonaux
        const diagonalNeighbors = [
            { x: x + 1, y: y + 1 }, { x: x + 1, y: y - 1 },
            { x: x - 1, y: y + 1 }, { x: x - 1, y: y - 1 }
        ];
        for (const neighbor of diagonalNeighbors) {
            // Vérification simple pour l'instant (pas de dontCrossCorners)
            if (isWalkable(neighbor.x, neighbor.y)) {
                 // Vérifier les coins (si dontCrossCorners est activé) 
                 // Exemple simple : si on va en diag (+1,+1), il faut que (+1,0) OU (0,+1) soit marchable
                 // A adapter / raffiner selon la règle exacte souhaitée.
                 /*
                 if (dontCrossCorners) {
                     const dx = neighbor.x - x;
                     const dy = neighbor.y - y;
                     if (!isWalkable(x + dx, y) && !isWalkable(x, y + dy)) {
                         continue; // Bloqué par les coins
                     }
                 }*/
                neighbors.push(neighbor);
            }
        }
    }

    return neighbors;
}

// Reconstruit le chemin à partir de la map cameFrom
function reconstructPath(cameFrom, current) {
    const path = [current];
    let currentKey = `${current.x},${current.y}`;
    while (cameFrom.has(currentKey)) {
        const previousKey = cameFrom.get(currentKey);
        const [px, py] = previousKey.split(',').map(Number);
        const previousNode = { x: px, y: py };
        path.unshift(previousNode); // Ajoute au début
        currentKey = previousKey;
    }
    return path; // Le chemin est de start vers end
}

/**
 * Fonction principale pour trouver un chemin avec A*.
 * @param {{x: number, y: number}} start Coordonnées de départ.
 * @param {{x: number, y: number}} end Coordonnées d'arrivée.
 * @returns {Array<{x: number, y: number}> | null} Le chemin trouvé (liste de points grille) ou null.
 */
function findPathAStar(start, end) {
    // Initialisation avec MinHeap
    const openSet = new MinHeap(); // Utilise MinHeap
    const closedSet = new Set();   // Garde trace des nœuds déjà traités
    const cameFrom = new Map();    // { "x,y": "px,py" }
    const gScore = new Map();      // { "x,y": number }

    const startKey = `${start.x},${start.y}`;
    const endKey = `${end.x},${end.y}`;

    // Initialisation pour le nœud de départ
    gScore.set(startKey, 0);
    const startHeuristic = heuristic(start, end);
    // Insérer dans le MinHeap: { item: {key, node}, priority: fScore }
    openSet.insert({ key: startKey, node: start }, startHeuristic);

    // while (openSet.size > 0) { // Ancienne condition
    while (!openSet.isEmpty()) { // Nouvelle condition avec MinHeap
        
        // 1. Extraire le nœud avec le plus petit fScore du MinHeap
        const currentHeapNode = openSet.extractMin();
        if (!currentHeapNode) break; // Tas vide
        
        const { item: currentItem, priority: currentFScore } = currentHeapNode;
        const { key: currentKey, node: currentNode } = currentItem;

        // Ignorer si déjà traité (utile car on peut insérer des doublons dans le tas)
        if (closedSet.has(currentKey)) {
            continue;
        }

        // 2. Vérifier si on a atteint la destination
        if (currentKey === endKey) {
            return reconstructPath(cameFrom, currentNode); // Chemin trouvé
        }

        // 3. Marquer le nœud courant comme traité
        closedSet.add(currentKey);

        // 4. Explorer les voisins
        const neighbors = getNeighbors(currentNode);
        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;

            // Ignorer si voisin déjà traité
            if (closedSet.has(neighborKey)) {
                continue;
            }

            const moveCost = 1; // Coût simple
            const tentativeGScore = (gScore.get(currentKey) ?? 0) + moveCost;

            // Vérifier si ce chemin vers le voisin est meilleur
            if (tentativeGScore < (gScore.get(neighborKey) ?? Infinity)) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeGScore);
                const neighborFScore = tentativeGScore + heuristic(neighbor, end);
                
                // Insérer dans le MinHeap (même s'il y est déjà avec un score plus élevé)
                openSet.insert({ key: neighborKey, node: neighbor }, neighborFScore);
            }
        }
    }

    // Tas vide mais destination non atteinte
    console.log(`[Worker A*] Open set (MinHeap) vide, pas de chemin trouvé de ${startKey} vers ${endKey}`);
    return null;
}

// --- Gestionnaire onerror global (inchangé) ---
self.onerror = function(error) {
    console.error('[Worker] Erreur non capturée:', error);
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + error.message });
};