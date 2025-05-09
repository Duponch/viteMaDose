// --- src/World/PathfindingWorker.js ---

// Supprimé: import * as PF from 'pathfinding';

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

// --- Cache de chemins ---
const pathCache = {
    cache: new Map(),
    cacheKeys: [],
    maxSize: 2000, // Taille maximale du cache
    expirationTime: 5 * 60 * 1000, // 5 minutes
    nearbyThreshold: 3, // Seuil pour les correspondances approximatives
    stats: {
        hits: 0,
        misses: 0,
        nearHits: 0,
        lastCleaned: Date.now()
    },
    
    // Générer une clé de cache
    generateKey: function(startNode, endNode, isVehicle) {
        return `${startNode.x},${startNode.y}-${endNode.x},${endNode.y}-${isVehicle ? 'v' : 'p'}`;
    },
    
    // Chercher un chemin dans le cache
    findPath: function(startNode, endNode, isVehicle) {
        // 1. Chercher dans le cache exact
        const key = this.generateKey(startNode, endNode, isVehicle);
        const cachedEntry = this.cache.get(key);
        
        if (cachedEntry && !this.isExpired(cachedEntry)) {
            this.stats.hits++;
            cachedEntry.uses++;
            cachedEntry.lastAccess = Date.now();
            this.refreshKey(key);
            return cachedEntry;
        }
        
        // 2. Chercher un chemin similaire
        const nearbyEntry = this.findNearbyPath(startNode, endNode, isVehicle);
        if (nearbyEntry) {
            this.stats.nearHits++;
            return nearbyEntry;
        }
        
        this.stats.misses++;
        return null;
    },
    
    // Chercher un chemin proche
    findNearbyPath: function(startNode, endNode, isVehicle) {
        let bestMatch = null;
        let bestScore = Number.MAX_VALUE;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.isVehicle !== isVehicle || this.isExpired(entry)) {
                continue;
            }
            
            const startDist = Math.abs(startNode.x - entry.startNode.x) + Math.abs(startNode.y - entry.startNode.y);
            const endDist = Math.abs(endNode.x - entry.endNode.x) + Math.abs(endNode.y - entry.endNode.y);
            const score = startDist + endDist;
            
            if (score < bestScore && startDist <= this.nearbyThreshold && endDist <= this.nearbyThreshold) {
                bestMatch = entry;
                bestScore = score;
            }
        }
        
        if (bestMatch) {
            bestMatch.uses++;
            bestMatch.lastAccess = Date.now();
        }
        
        return bestMatch;
    },
    
    // Stocker un chemin
    storePath: function(startNode, endNode, isVehicle, path, pathLengthWorld) {
        // Nettoyer le cache si nécessaire
        if (Date.now() - this.stats.lastCleaned > 60000) { // 1 minute
            this.cleanCache();
        }
        
        const key = this.generateKey(startNode, endNode, isVehicle);
        
        // Mettre à jour si la clé existe déjà
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            entry.path = path;
            entry.pathLengthWorld = pathLengthWorld;
            entry.timestamp = Date.now();
            entry.uses++;
            this.refreshKey(key);
            return;
        }
        
        // Éviction si le cache est plein
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        
        // Créer une nouvelle entrée
        const entry = {
            path: path,
            pathLengthWorld: pathLengthWorld,
            timestamp: Date.now(),
            lastAccess: Date.now(),
            startNode: { x: startNode.x, y: startNode.y },
            endNode: { x: endNode.x, y: endNode.y },
            isVehicle: isVehicle,
            uses: 1
        };
        
        this.cache.set(key, entry);
        this.cacheKeys.push(key);
    },
    
    // Vérifier si une entrée est expirée
    isExpired: function(entry) {
        return Date.now() - entry.timestamp > this.expirationTime;
    },
    
    // Nettoyer le cache
    cleanCache: function() {
        const keysToRemove = [];
        
        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => {
            this.cache.delete(key);
            const index = this.cacheKeys.indexOf(key);
            if (index !== -1) {
                this.cacheKeys.splice(index, 1);
            }
        });
        
        this.stats.lastCleaned = Date.now();
    },
    
    // Supprimer l'entrée la plus ancienne
    evictOldest: function() {
        if (this.cacheKeys.length === 0) {
            return;
        }
        
        const oldestKey = this.cacheKeys.shift();
        this.cache.delete(oldestKey);
    },
    
    // Rafraîchir l'ordre d'une clé
    refreshKey: function(key) {
        const index = this.cacheKeys.indexOf(key);
        if (index !== -1) {
            this.cacheKeys.splice(index, 1);
            this.cacheKeys.push(key);
        }
    },
    
    // Obtenir les statistiques du cache
    getStats: function() {
        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            nearHits: this.stats.nearHits,
            hitRate: this.stats.hits + this.stats.nearHits > 0 
                ? ((this.stats.hits + this.stats.nearHits) / (this.stats.hits + this.stats.nearHits + this.stats.misses) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
};

// --- Fonction helper pour calculer la distance (inchangée) ---
function calculateWorldDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dz * dz);
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
            console.log('[Worker] Initialisation reçue (mode SharedArrayBuffer + A* interne double grille).');
            // --- MODIFICATION: Accepter les données combinées ---
            if (data && data.pedestrian && data.road && 
                data.pedestrian.gridBuffer && data.road.gridBuffer &&
                data.gridWidth && data.gridHeight && data.gridScale !== undefined && 
                data.offsetX !== undefined && data.offsetZ !== undefined &&
                data.pedestrian.graphHeight !== undefined && data.road.graphHeight !== undefined)
            {
                gridWidth = data.gridWidth;
                gridHeight = data.gridHeight;
                gridScale = data.gridScale;
                offsetX = data.offsetX;
                offsetZ = data.offsetZ;
                pedestrianGraphHeight = data.pedestrian.graphHeight;
                roadGraphHeight = data.road.graphHeight;

                // Vérifier les buffers
                if (!(data.pedestrian.gridBuffer instanceof SharedArrayBuffer) || !(data.road.gridBuffer instanceof SharedArrayBuffer)) {
                    throw new Error("Un ou les deux objets reçus ne sont pas des SharedArrayBuffers.");
                }
                
                // Créer les vues sur les buffers partagés
                pedestrianGridWalkableMap = new Uint8Array(data.pedestrian.gridBuffer);
                roadGridWalkableMap = new Uint8Array(data.road.gridBuffer);
                console.log(`[Worker] Vues Uint8Array créées sur SharedArrayBuffers (${gridWidth}x${gridHeight}).`);
                console.log(`[Worker] Hauteurs: Piéton=${pedestrianGraphHeight.toFixed(2)}, Route=${roadGraphHeight.toFixed(2)}`);

                console.log('[Worker] Prêt pour les requêtes A* (double grille avec cache).');
                self.postMessage({ type: 'initComplete' });
            } else {
                 throw new Error("Données manquantes ou invalides pour l'initialisation combinée.");
            }
            // --- FIN MODIFICATION --- 

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
            
            // --- AJOUT: Vérifier le cache avant de calculer ---
            const startTime = performance.now();
            const cachedResult = pathCache.findPath(startNode, endNode, isVehicle);
            
            if (cachedResult) {
                const endTime = performance.now();
                console.log(`[Worker] Cache HIT pour Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'}) en ${(endTime - startTime).toFixed(2)}ms`);
                
                self.postMessage({
                    type: 'pathResult',
                    data: { 
                        agentId, 
                        path: cachedResult.path, 
                        pathLengthWorld: cachedResult.pathLengthWorld,
                        fromCache: true
                    }
                });
                return;
            }
            // --- FIN AJOUT ---

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
                        
                        // --- AJOUT: Stocker dans le cache ---
                        pathCache.storePath(startNode, endNode, isVehicle, worldPathData, pathLengthWorld);
                        // --- FIN AJOUT ---
                    } else {
                         pathLengthWorld = 0;
                    }
                } else {
                    worldPathData = null;
                    pathLengthWorld = 0;
                    console.warn(`[Worker A*] Chemin non trouvé ou vide pour Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
                }

            } catch (e) {
                console.error(`[Worker] Erreur dans findPathAStar pour Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'}) (${startNode.x},${startNode.y})->(${endNode.x},${endNode.y}):`, e);
                worldPathData = null;
                pathLengthWorld = 0;
            }

            // Envoyer le résultat
            self.postMessage({
                type: 'pathResult',
                data: { 
                    agentId, 
                    path: worldPathData, 
                    pathLengthWorld: pathLengthWorld,
                    fromCache: false
                }
            });

        } 
        // --- AJOUT: Demander les statistiques du cache ---
        else if (type === 'getCacheStats') {
            self.postMessage({
                type: 'cacheStats',
                data: pathCache.getStats()
            });
        }
        // --- FIN AJOUT ---
        else if (type === 'clearCache') {
            pathCache.cache.clear();
            pathCache.cacheKeys = [];
            pathCache.stats.lastCleaned = Date.now();
            self.postMessage({
                type: 'cacheCleared'
            });
        }
        else {
            console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        console.error('[Worker] Erreur générale dans onmessage:', error);
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