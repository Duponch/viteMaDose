// --- src/World/PathfindingWorker.js ---

import * as PF from 'pathfinding';

// --- Constantes partagées (doivent correspondre à NavigationGraph.js) ---
const WALKABLE = 0;
const NON_WALKABLE = 1;

// --- Variables globales du worker (MODIFIÉ) ---
let pedestrianGridWalkableMap = null; // Vue pour la grille piétonne
let roadGridWalkableMap = null;     // Vue pour la grille routière
let gridWidth = 0;
let gridHeight = 0;
let gridScale = 1.0;
let offsetX = 0;
let offsetZ = 0;
let pedestrianGraphHeight = 0.2; // Hauteur par défaut pour piétons
let roadGraphHeight = 0.1;       // Hauteur par défaut pour routes

// Cache des chemins calculés
const pathCache = {
    cache: new Map(),
    keyToTimestamp: new Map(),
    keyToUsageCount: new Map(),
    maxEntries: 5000,
    expirationTimeMs: 30000, // 30 secondes
    stats: {
        hits: 0,
        misses: 0,
        stored: 0,
        evictions: 0
    },
    
    // Créer une clé unique pour le cache
    generateKey(startNode, endNode, isVehicle) {
        return `${isVehicle ? 'v' : 'p'}_${startNode.x},${startNode.y}_${endNode.x},${endNode.y}`;
    },
    
    // Récupérer un chemin du cache
    getPath(startNode, endNode, isVehicle) {
        const key = this.generateKey(startNode, endNode, isVehicle);
        const now = Date.now();
        
        if (!this.cache.has(key)) {
            this.stats.misses++;
            return null;
        }
        
        const entry = this.cache.get(key);
        const timestamp = this.keyToTimestamp.get(key);
        
        // Vérifier l'expiration
        if (now - timestamp > this.expirationTimeMs) {
            this.cache.delete(key);
            this.keyToTimestamp.delete(key);
            this.keyToUsageCount.delete(key);
            this.stats.evictions++;
            this.stats.misses++;
            return null;
        }
        
        // Mettre à jour les statistiques et l'activité
        this.stats.hits++;
        const usageCount = this.keyToUsageCount.get(key) || 0;
        this.keyToUsageCount.set(key, usageCount + 1);
        this.keyToTimestamp.set(key, now);
        
        return {
            gridPath: entry.gridPath.map(node => ({ x: node.x, y: node.y })),
            worldPath: entry.worldPath.map(pos => ({ x: pos.x, y: pos.y, z: pos.z })),
            pathLengthWorld: entry.pathLengthWorld
        };
    },
    
    // Stocker un chemin dans le cache
    setPath(startNode, endNode, gridPath, worldPath, pathLengthWorld, isVehicle) {
        if (!gridPath || !worldPath || gridPath.length === 0 || worldPath.length === 0) {
            return;
        }
        
        const key = this.generateKey(startNode, endNode, isVehicle);
        const now = Date.now();
        
        // Si le cache est plein, supprimer l'entrée la moins utilisée
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            this._evictLeastUsed();
        }
        
        // Stocker le chemin
        this.cache.set(key, {
            gridPath: gridPath.map(node => ({ x: node.x, y: node.y })), // Copie profonde
            worldPath: worldPath,
            pathLengthWorld: pathLengthWorld
        });
        
        this.keyToTimestamp.set(key, now);
        this.keyToUsageCount.set(key, 1);
        
        if (!this.cache.has(key)) {
            this.stats.stored++;
        }
    },
    
    // Supprimer l'entrée la moins utilisée
    _evictLeastUsed() {
        let leastUsedKey = null;
        let leastUsedCount = Infinity;
        let leastUsedTimestamp = Infinity;
        
        for (const [key, count] of this.keyToUsageCount.entries()) {
            const timestamp = this.keyToTimestamp.get(key);
            if (count < leastUsedCount || (count === leastUsedCount && timestamp < leastUsedTimestamp)) {
                leastUsedKey = key;
                leastUsedCount = count;
                leastUsedTimestamp = timestamp;
            }
        }
        
        if (leastUsedKey) {
            this.cache.delete(leastUsedKey);
            this.keyToTimestamp.delete(leastUsedKey);
            this.keyToUsageCount.delete(leastUsedKey);
            this.stats.evictions++;
        }
    },
    
    // Vider entièrement le cache
    clear() {
        this.cache.clear();
        this.keyToTimestamp.clear();
        this.keyToUsageCount.clear();
        this.stats.evictions = 0;
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.stored = 0;
    }
};

// --- Fonction helper pour calculer la distance (inchangée) ---
function calculateWorldDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// --- Fonction gridToWorld (MODIFIÉ pour accepter la hauteur) ---
function gridToWorld(gridX, gridY, graphHeight) { // <-- Accepte graphHeight
    if (gridScale === undefined || offsetX === undefined || offsetZ === undefined || graphHeight === undefined) {
        console.error("[Worker] Variables de conversion non définies dans gridToWorld!");
        // Utiliser des valeurs par défaut robustes si nécessaire
        gridScale = gridScale ?? 1.0;
        offsetX = offsetX ?? 0;
        offsetZ = offsetZ ?? 0;
        graphHeight = graphHeight ?? 0.2; // Fallback hauteur piéton
    }
    const worldX = (gridX + 0.5 - offsetX) / gridScale;
    const worldZ = (gridY + 0.5 - offsetZ) / gridScale;
    // Utiliser la hauteur fournie
    return { x: worldX, y: graphHeight + 0.01, z: worldZ }; // Léger offset Y pour visibilité
}

// --- Gestionnaire onmessage (MODIFIÉ) ---
self.onmessage = function(event) {
    const { type, data } = event.data;

    try {
        if (type === 'init') {
            console.log('[Worker] Initialisation reçue. Adaptation au format de données...');
            
            // Version plus robuste pour accepter différents formats de données
            // Ancien format: {gridWidth, gridHeight, gridScale, ...}
            // Nouveau format: {pedestrian: {...}, road: {...}}
            
            if (data) {
                if (data.pedestrian && data.road) {
                    // Nouveau format (après modifications)
                    if (data.pedestrian.gridBuffer && data.road.gridBuffer) {
                        // Récupération des paramètres communs
                        gridWidth = data.pedestrian.gridWidth || data.gridWidth;
                        gridHeight = data.pedestrian.gridHeight || data.gridHeight;
                        gridScale = data.pedestrian.conversionParams?.gridScale || data.gridScale;
                        offsetX = data.pedestrian.conversionParams?.offsetX || data.offsetX;
                        offsetZ = data.pedestrian.conversionParams?.offsetZ || data.offsetZ;
                        
                        // Hauteurs spécifiques
                        pedestrianGraphHeight = data.pedestrian.conversionParams?.graphHeight || 0.2;
                        roadGraphHeight = data.road.conversionParams?.graphHeight || 0.1;
                        
                        // Créer les vues sur les SharedArrayBuffers
                        pedestrianGridWalkableMap = new Uint8Array(data.pedestrian.gridBuffer);
                        roadGridWalkableMap = new Uint8Array(data.road.gridBuffer);
                        
                        console.log(`[Worker] Vues Uint8Array créées sur SharedArrayBuffers (${gridWidth}x${gridHeight}).`);
                        console.log(`[Worker] Hauteurs: Piéton=${pedestrianGraphHeight.toFixed(2)}, Route=${roadGraphHeight.toFixed(2)}`);
                    } else {
                        throw new Error("Les buffers SharedArrayBuffer sont manquants dans les données pedestrian/road.");
                    }
                } else if (data.gridBuffer) {
                    // Format intermédiaire: un seul buffer avec gridWidth, gridHeight, etc.
                    gridWidth = data.gridWidth;
                    gridHeight = data.gridHeight;
                    gridScale = data.gridScale;
                    offsetX = data.offsetX;
                    offsetZ = data.offsetZ;
                    pedestrianGraphHeight = data.graphHeight || 0.2;
                    roadGraphHeight = data.graphHeight || 0.1;
                    
                    // Créer les vues sur un seul SharedArrayBuffer (pour compatibilité)
                    pedestrianGridWalkableMap = new Uint8Array(data.gridBuffer);
                    roadGridWalkableMap = pedestrianGridWalkableMap; // Les deux pointent vers le même buffer
                    
                    console.log(`[Worker] (Compatibilité) Vue Uint8Array créée sur SharedArrayBuffer unique (${gridWidth}x${gridHeight}).`);
                } else if (data.pedestrian?.gridBuffer) {
                    // Format mixte: pedestrian existe mais pas road, ou vice versa
                    gridWidth = data.gridWidth || data.pedestrian.gridWidth;
                    gridHeight = data.gridHeight || data.pedestrian.gridHeight;
                    gridScale = data.gridScale || data.pedestrian.conversionParams?.gridScale;
                    offsetX = data.offsetX || data.pedestrian.conversionParams?.offsetX;
                    offsetZ = data.offsetZ || data.pedestrian.conversionParams?.offsetZ;
                    pedestrianGraphHeight = data.pedestrian.conversionParams?.graphHeight || 0.2;
                    
                    // Créer les vues
                    pedestrianGridWalkableMap = new Uint8Array(data.pedestrian.gridBuffer);
                    roadGridWalkableMap = pedestrianGridWalkableMap; // Fallback temporaire
                    
                    console.log(`[Worker] (Format hybride) Vue Uint8Array créée pour piétons seulement (${gridWidth}x${gridHeight}).`);
                } else {
                    throw new Error("Format de données non reconnu pour l'initialisation.");
                }
                
                // Vérification finale des paramètres essentiels
                if (!gridWidth || !gridHeight || !gridScale || offsetX === undefined || offsetZ === undefined) {
                    throw new Error("Paramètres de grille incomplets après adaptation.");
                }
                
                console.log('[Worker] Prêt pour les requêtes A*.');
                self.postMessage({ type: 'initComplete' });
            } else {
                throw new Error("Objet data manquant dans le message d'initialisation.");
            }
        } else if (type === 'findPath') {
            // --- MODIFICATION: Vérifier l'initialisation des DEUX maps ---
            if (!pedestrianGridWalkableMap || !roadGridWalkableMap) { 
                console.error(`[Worker] Tentative findPath Agent ${data?.agentId} mais worker non initialisé ou buffers manquants.`);
                 if(data?.agentId) {
                     self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0 } });
                 }
                return;
            }
            // --- FIN MODIFICATION ---
            
            // --- MODIFICATION: Vérifier présence de isVehicle --- 
            if (!data || !data.agentId || !data.startNode || !data.endNode || data.isVehicle === undefined) { 
                 console.error("[Worker] Données manquantes pour requête findPath (agentId, startNode, endNode, isVehicle):", data);
                  if(data?.agentId) {
                     self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0 } });
                 }
                 return;
            }
            // --- FIN MODIFICATION ---

            const { agentId, startNode, endNode, isVehicle } = data;

            // --- Sélection de la grille et hauteur correctes --- 
            const activeGridMap = isVehicle ? roadGridWalkableMap : pedestrianGridWalkableMap;
            const activeGraphHeight = isVehicle ? roadGraphHeight : pedestrianGraphHeight;
            // --- FIN Sélection --- 

            // ---- AJOUT LOG: Vérifier marchabilité dans le worker ----
            const startWalkable = isWalkable(startNode.x, startNode.y, activeGridMap);
            const endWalkable = isWalkable(endNode.x, endNode.y, activeGridMap);
            console.log(`[Worker Check] Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'}). Start (${startNode.x},${startNode.y}) walkable: ${startWalkable}. End (${endNode.x},${endNode.y}) walkable: ${endWalkable}.`);
            if (!startWalkable || !endWalkable) {
                 console.error(`[Worker Error] Start or End node not walkable on the selected grid map for Agent ${agentId}.`);
                 // Optionnel : renvoyer échec immédiatement si non marchable
                 self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                 return;
            }
            // ---- FIN LOG ----

            // Vérification des bornes (inchangée, utilise gridWidth/gridHeight globaux)
            const isValidCoord = (node) => node && node.x >= 0 && node.x < gridWidth && node.y >= 0 && node.y < gridHeight;
            if (!isValidCoord(startNode) || !isValidCoord(endNode)) {
                 console.error(`[Worker] Coordonnées invalides pour Agent ${agentId} - Start: (${startNode?.x}, ${startNode?.y}), End: (${endNode?.x}, ${endNode?.y}). Limites grille: ${gridWidth}x${gridHeight}`);
                 self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                 return;
            }

            // Gérer le cas départ = arrivée
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                 // --- Utiliser la hauteur correcte --- 
                 const worldPathData = [gridToWorld(startNode.x, startNode.y, activeGraphHeight)];
                 self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData, pathLengthWorld: 0 } });
                 return;
            }

            // Vérifier si le chemin est dans le cache
            const cachedResult = pathCache.getPath(startNode, endNode, isVehicle);
            
            if (cachedResult) {
                console.log(`[Worker] Cache HIT for Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
                self.postMessage({ 
                    type: 'pathResult', 
                    data: { 
                        agentId, 
                        path: cachedResult.worldPath, 
                        pathLengthWorld: cachedResult.pathLengthWorld,
                        fromCache: true
                    } 
                });
                return;
            }

            let gridPath = null;
            let worldPathData = null;
            let pathLengthWorld = 0;

            try {
                // --- Appel A* avec la bonne grille --- 
                console.time(`[Worker] A* Path ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
                gridPath = findPathAStar(startNode, endNode, activeGridMap); // <-- Passer la grille active
                console.timeEnd(`[Worker] A* Path ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
                // --- FIN Appel A* --- 

                if (gridPath && gridPath.length > 0) {
                    // --- Conversion avec la bonne hauteur --- 
                    worldPathData = gridPath.map(node => gridToWorld(node.x, node.y, activeGraphHeight));
                    // --- FIN Conversion --- 
                    
                    // Calcul longueur (inchangé)
                    if (worldPathData.length > 1) {
                        pathLengthWorld = 0;
                        for (let i = 0; i < worldPathData.length - 1; i++) {
                            pathLengthWorld += calculateWorldDistance(worldPathData[i], worldPathData[i+1]);
                        }
                    } else {
                         pathLengthWorld = 0;
                    }
                } else {
                    worldPathData = null;
                    pathLengthWorld = 0;
                    console.warn(`[Worker A*] Chemin non trouvé ou vide pour Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
                }

                // Stocker dans le cache
                pathCache.setPath(startNode, endNode, gridPath, worldPathData, pathLengthWorld, isVehicle);

            } catch (e) {
                console.error(`[Worker] Erreur dans findPathAStar pour Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'}) (${startNode.x},${startNode.y})->(${endNode.x},${endNode.y}):`, e);
                worldPathData = null;
                pathLengthWorld = 0;
            }

            // Envoyer le résultat (inchangé)
            self.postMessage({
                type: 'pathResult',
                data: { 
                    agentId, 
                    path: worldPathData, 
                    pathLengthWorld: pathLengthWorld,
                    fromCache: false
                }
            });

        } else if (type === 'clearCache') {
            // Effacer le cache
            pathCache.clear();
            self.postMessage({ type: 'cacheCleared' });
            
        } else if (type === 'getCacheStats') {
            // Renvoyer les stats du cache
            self.postMessage({ 
                type: 'cacheStats', 
                stats: { 
                    hits: pathCache.stats.hits,
                    misses: pathCache.stats.misses,
                    stored: pathCache.stats.stored,
                    evictions: pathCache.stats.evictions,
                    hitRatio: pathCache.stats.hits / (pathCache.stats.hits + pathCache.stats.misses || 1),
                    size: pathCache.cache.size,
                    maxSize: pathCache.maxEntries
                } 
            });
            
        } else {
            console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        console.error('[Worker] Erreur dans onmessage:', error);
        const agentIdOnError = data?.agentId;
        if (agentIdOnError) {
            self.postMessage({ type: 'pathResult', data: { agentId: agentIdOnError, path: null, pathLengthWorld: 0 } });
        } else {
            self.postMessage({ type: 'workerError', error: error.message, data: event.data });
        }
    }
};

// --- Section A* (MODIFIÉE pour utiliser la grille passée en argument) ---

// MinHeap (inchangé)
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

// Heuristique (inchangé)
function heuristic(nodeA, nodeB) {
    const dx = Math.abs(nodeA.x - nodeB.x);
    const dy = Math.abs(nodeA.y - nodeB.y);
    return dx + dy;
}

// isValid (inchangé)
function isValid(x, y) {
    return x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
}

// --- isWalkable (MODIFIÉ pour accepter la grille) ---
function isWalkable(x, y, gridMap) { // <-- Accepte gridMap
    if (!isValid(x, y)) return false;
    const index = y * gridWidth + x;
    return gridMap[index] === WALKABLE;
}

// --- getNeighbors (MODIFIÉ pour accepter la grille) ---
function getNeighbors(node, gridMap) { // <-- Accepte gridMap
    const neighbors = [];
    const x = node.x;
    const y = node.y;
    const allowDiagonal = true;

    const directNeighbors = [
        { x: x, y: y + 1 }, { x: x, y: y - 1 },
        { x: x + 1, y: y }, { x: x - 1, y: y }
    ];
    for (const neighbor of directNeighbors) {
        // --- Passer gridMap --- 
        if (isWalkable(neighbor.x, neighbor.y, gridMap)) {
            neighbors.push(neighbor);
        }
    }

    if (allowDiagonal) {
        const diagonalNeighbors = [
            { x: x + 1, y: y + 1 }, { x: x + 1, y: y - 1 },
            { x: x - 1, y: y + 1 }, { x: x - 1, y: y - 1 }
        ];
        for (const neighbor of diagonalNeighbors) {
            // --- Passer gridMap --- 
            if (isWalkable(neighbor.x, neighbor.y, gridMap)) {
                 // TODO: Ajouter la logique dontCrossCorners si nécessaire, 
                 // en passant gridMap à isWalkable pour les vérifications.
                neighbors.push(neighbor);
            }
        }
    }
    return neighbors;
}

// reconstructPath (inchangé)
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

// --- findPathAStar (MODIFIÉ pour accepter la grille et coût diagonal) ---
function findPathAStar(start, end, gridMap) { // <-- Accepte gridMap
    const openSet = new MinHeap();
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const startKey = `${start.x},${start.y}`;
    const endKey = `${end.x},${end.y}`;

    gScore.set(startKey, 0);
    const startHeuristic = heuristic(start, end);
    openSet.insert({ key: startKey, node: start }, startHeuristic);

    while (!openSet.isEmpty()) {
        const currentHeapNode = openSet.extractMin();
        if (!currentHeapNode) break;
        const { item: currentItem } = currentHeapNode;
        const { key: currentKey, node: currentNode } = currentItem;

        if (closedSet.has(currentKey)) continue;
        if (currentKey === endKey) return reconstructPath(cameFrom, currentNode);

        closedSet.add(currentKey);

        // --- Passer gridMap ---
        const neighbors = getNeighbors(currentNode, gridMap);
        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            if (closedSet.has(neighborKey)) continue;

            // --- MODIFICATION: Calculer le coût basé sur le type de mouvement ---
            const dx = Math.abs(neighbor.x - currentNode.x);
            const dy = Math.abs(neighbor.y - currentNode.y);
            // Si dx=1 et dy=1, c'est diagonal. Sinon (dx=1,dy=0 ou dx=0,dy=1), c'est orthogonal.
            const moveCost = (dx === 1 && dy === 1) ? Math.SQRT2 : 1;
            // --- FIN MODIFICATION ---

            const tentativeGScore = (gScore.get(currentKey) ?? 0) + moveCost;

            if (tentativeGScore < (gScore.get(neighborKey) ?? Infinity)) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeGScore);
                const neighborFScore = tentativeGScore + heuristic(neighbor, end);
                openSet.insert({ key: neighborKey, node: neighbor }, neighborFScore);
            }
        }
    }
    return null; // Chemin non trouvé
}

// Gestionnaire onerror global (inchangé)
self.onerror = function(error) {
    console.error('[Worker] Erreur non capturée:', error);
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + error.message });
};