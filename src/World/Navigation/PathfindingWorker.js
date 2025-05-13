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
let pathfinder = null;
let isInitialized = false;

// --- Cache de chemins ---
const pathCache = {
    cache: new Map(),
    cacheKeys: [],
    maxSize: 10000, // Augmenté de 5000 à 10000
    expirationTime: 60 * 60 * 1000, // Augmenté à 60 minutes
    nearbyThreshold: 10, // Augmenté de 5 à 10 pour beaucoup plus de tolérance
    stats: {
        hits: 0,
        misses: 0,
        nearHits: 0,
        lastCleaned: Date.now()
    },
    
    // Générer une clé de cache avec quantification des coordonnées
    generateKey: function(startNode, endNode, isVehicle) {
        // Quantification plus agressive des coordonnées (arrondir à l'unité près)
        // Cela augmente les chances de hit en regroupant des positions voisines
        const sx = Math.floor(startNode.x);
        const sy = Math.floor(startNode.y);
        const ex = Math.floor(endNode.x);
        const ey = Math.floor(endNode.y);
        return `${sx},${sy}-${ex},${ey}-${isVehicle ? 'v' : 'p'}`;
    },
    
    // Chercher un chemin dans le cache avec stratégie plus agressive
    findPath: function(startNode, endNode, isVehicle) {
        // 1. Chercher dans le cache exact (chemin direct)
        const key = this.generateKey(startNode, endNode, isVehicle);
        const cachedEntry = this.cache.get(key);
        
        if (cachedEntry && !this.isExpired(cachedEntry)) {
            this.stats.hits++;
            cachedEntry.uses++;
            cachedEntry.lastAccess = Date.now();
            this.refreshKey(key);
            return this.adjustPathToMatchRequest(cachedEntry, startNode, endNode, isVehicle);
        }
        
        // 2. Chercher le chemin inverse (les agents font souvent l'aller-retour)
        const reverseKey = this.generateKey(endNode, startNode, isVehicle);
        const reverseCachedEntry = this.cache.get(reverseKey);
        
        if (reverseCachedEntry && !this.isExpired(reverseCachedEntry)) {
            this.stats.nearHits++;
            reverseCachedEntry.uses++;
            reverseCachedEntry.lastAccess = Date.now();
            
            // Inverser le chemin et l'adapter à la demande actuelle
            const reversedPath = [...reverseCachedEntry.path].reverse();
            return {
                path: reversedPath,
                pathLengthWorld: reverseCachedEntry.pathLengthWorld,
                startNode: { x: startNode.x, y: startNode.y },
                endNode: { x: endNode.x, y: endNode.y },
                isVehicle: isVehicle,
                timestamp: Date.now(),
                uses: 1
            };
        }
        
        // 3. Chercher un chemin similaire avec une tolérance élevée
        const nearbyEntry = this.findNearbyPath(startNode, endNode, isVehicle);
        if (nearbyEntry) {
            this.stats.nearHits++;
            return nearbyEntry;
        }
        
        this.stats.misses++;
        return null;
    },
    
    // Ajuster un chemin trouvé pour qu'il corresponde exactement à la demande
    adjustPathToMatchRequest: function(entry, startNode, endNode, isVehicle) {
        if (!entry || !entry.path || entry.path.length < 2) return entry;
        
        // Créer une copie pour ne pas modifier l'original
        const adjustedPath = [...entry.path];
        
        // Ajuster le premier point pour correspondre exactement au point de départ demandé
        const startWorld = gridToWorld(startNode.x, startNode.y, 
            isVehicle ? roadGraphHeight : pedestrianGraphHeight);
        adjustedPath[0] = startWorld;
        
        // Ajuster aussi le dernier point si possible
        if (adjustedPath.length > 1) {
            const endWorld = gridToWorld(endNode.x, endNode.y,
                isVehicle ? roadGraphHeight : pedestrianGraphHeight);
            adjustedPath[adjustedPath.length - 1] = endWorld;
        }
        
        // Retourner l'entrée avec le chemin ajusté
        return {
            ...entry,
            path: adjustedPath,
            startNode: { x: startNode.x, y: startNode.y },
            endNode: { x: endNode.x, y: endNode.y }
        };
    },
    
    // Chercher un chemin proche avec tolérance améliorée
    findNearbyPath: function(startNode, endNode, isVehicle) {
        let bestMatch = null;
        let bestScore = Number.MAX_VALUE;
        
        // Essayer de trouver des chemins proches
        for (const [key, entry] of this.cache.entries()) {
            if (entry.isVehicle !== isVehicle || this.isExpired(entry)) {
                continue;
            }
            
            // Calculer les distances Manhattan entre les points
            const startDist = Math.abs(startNode.x - entry.startNode.x) + Math.abs(startNode.y - entry.startNode.y);
            const endDist = Math.abs(endNode.x - entry.endNode.x) + Math.abs(endNode.y - entry.endNode.y);
            
            // Considérer aussi la distance entre start-end (longueur du chemin)
            // plus les chemins sont similaires en longueur, plus ils sont compatibles
            const startToEndDist = Math.abs(
                Math.abs(startNode.x - endNode.x) + Math.abs(startNode.y - endNode.y) -
                Math.abs(entry.startNode.x - entry.endNode.x) - Math.abs(entry.startNode.y - entry.endNode.y)
            );
            
            // Score pondéré: la précision du point de départ est la plus importante
            const score = startDist * 2 + endDist + startToEndDist * 0.5;
            
            // Accepter seulement si les deux points sont dans le seuil de tolérance
            if (score < bestScore && startDist <= this.nearbyThreshold && endDist <= this.nearbyThreshold) {
                bestMatch = entry;
                bestScore = score;
            }
        }
        
        if (bestMatch) {
            bestMatch.uses++;
            bestMatch.lastAccess = Date.now();
            
            // Toujours adapter le chemin trouvé pour correspondre à la demande actuelle
            return this.adjustPathToMatchRequest(bestMatch, startNode, endNode, isVehicle);
        }
        
        return null;
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
            startNode: { x: Math.round(startNode.x), y: Math.round(startNode.y) },
            endNode: { x: Math.round(endNode.x), y: Math.round(endNode.y) },
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

// Fonction pour vérifier la disponibilité de SharedArrayBuffer
function isSharedArrayBufferAvailable() {
    return typeof SharedArrayBuffer !== 'undefined';
}

// --- Gestionnaire onmessage (MODIFIÉ) ---
self.onmessage = function(event) {
    const { type, data } = event.data;

    try {
        if (type === 'init') {
            //console.log('[Worker] Initialisation reçue (mode SharedArrayBuffer + A* interne double grille).');
            // --- MODIFICATION: Vérifier la disponibilité de SharedArrayBuffer ---
            const useSharedMemory = isSharedArrayBufferAvailable();
            
            if (!useSharedMemory) {
                console.warn('[Worker] SharedArrayBuffer n\'est pas disponible. Passage au mode standard.');
                // Informer l'application principale
                self.postMessage({ 
                    type: 'warning', 
                    message: 'SharedArrayBuffer n\'est pas disponible. Fonctionnalités de navigation limitées.' 
                });
            }
            
            // --- Accepter les données combinées ---
            if (data && data.pedestrian && data.road && 
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

                // Créer les vues sur les buffers - adapter en fonction de la disponibilité de SharedArrayBuffer
                if (useSharedMemory && data.pedestrian.gridBuffer instanceof SharedArrayBuffer && data.road.gridBuffer instanceof SharedArrayBuffer) {
                    pedestrianGridWalkableMap = new Uint8Array(data.pedestrian.gridBuffer);
                    roadGridWalkableMap = new Uint8Array(data.road.gridBuffer);
                    console.log(`[Worker] Vues Uint8Array créées sur SharedArrayBuffers (${gridWidth}x${gridHeight}).`);
                } else {
                    // Utiliser des copies locales dans le worker si les SharedArrayBuffer ne sont pas disponibles
                    // ou si les données transmises ne sont pas des SharedArrayBuffers
                    if (data.pedestrian.gridBuffer) {
                        pedestrianGridWalkableMap = new Uint8Array(data.pedestrian.gridBuffer.byteLength);
                        pedestrianGridWalkableMap.set(new Uint8Array(data.pedestrian.gridBuffer));
                    }
                    if (data.road.gridBuffer) {
                        roadGridWalkableMap = new Uint8Array(data.road.gridBuffer.byteLength);
                        roadGridWalkableMap.set(new Uint8Array(data.road.gridBuffer));
                    }
                    console.log(`[Worker] Copies locales des grilles créées (${gridWidth}x${gridHeight}).`);
                }

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
            
            // --- AMÉLIORÉ: Vérification du cache plus précise ---
            const startTime = performance.now();
            
            // Normaliser les coordonnées des nœuds pour les clés de cache (assurer la consistance)
            const normalizedStartNode = {
                x: Math.round(startNode.x),
                y: Math.round(startNode.y)
            };
            
            const normalizedEndNode = {
                x: Math.round(endNode.x),
                y: Math.round(endNode.y)
            };
            
            // Vérifier le cache avec les nœuds normalisés
            const cachedResult = pathCache.findPath(normalizedStartNode, normalizedEndNode, isVehicle);
            // --- FIN AMÉLIORATION ---
            
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
            const startWalkable = isWalkable(normalizedStartNode.x, normalizedStartNode.y, activeGridMap);
            const endWalkable = isWalkable(normalizedEndNode.x, normalizedEndNode.y, activeGridMap);
            //console.log(`[Worker Check] Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'}). Start (${normalizedStartNode.x},${normalizedStartNode.y}) walkable: ${startWalkable}. End (${normalizedEndNode.x},${normalizedEndNode.y}) walkable: ${endWalkable}.`);

            // MODIFICATION: Rechercher des nœuds marchables proches si nécessaire
            let finalStartNode = normalizedStartNode;
            let finalEndNode = normalizedEndNode;
            let nodesAdjusted = false;

            if (!startWalkable) {
                const nearestStartNode = findNearestWalkableNode(normalizedStartNode, activeGridMap, 10);
                if (nearestStartNode) {
                    finalStartNode = nearestStartNode;
                    nodesAdjusted = true;
                    console.log(`[Worker] Nœud de départ ajusté pour Agent ${agentId}: (${normalizedStartNode.x},${normalizedStartNode.y}) → (${nearestStartNode.x},${nearestStartNode.y})`);
                } else {
                    console.error(`[Worker Error] Start node not walkable and no nearby walkable node found for Agent ${agentId}.`);
                    self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                    return;
                }
            }

            if (!endWalkable) {
                const nearestEndNode = findNearestWalkableNode(normalizedEndNode, activeGridMap, 10);
                if (nearestEndNode) {
                    finalEndNode = nearestEndNode;
                    nodesAdjusted = true;
                    console.log(`[Worker] Nœud d'arrivée ajusté pour Agent ${agentId}: (${normalizedEndNode.x},${normalizedEndNode.y}) → (${nearestEndNode.x},${nearestEndNode.y})`);
                } else {
                    console.error(`[Worker Error] End node not walkable and no nearby walkable node found for Agent ${agentId}.`);
                    self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                    return;
                }
            }

            // Vérification des bornes (inchangée, utilise gridWidth/gridHeight globaux)
            const isValidCoord = (node) => node && node.x >= 0 && node.x < gridWidth && node.y >= 0 && node.y < gridHeight;
            if (!isValidCoord(finalStartNode) || !isValidCoord(finalEndNode)) {
                 console.error(`[Worker] Coordonnées invalides pour Agent ${agentId} - Start: (${finalStartNode.x}, ${finalStartNode.y}), End: (${finalEndNode.x}, ${finalEndNode.y}). Limites grille: ${gridWidth}x${gridHeight}`);
                 self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                 return;
            }

            // Gérer le cas départ = arrivée
            if (finalStartNode.x === finalEndNode.x && finalStartNode.y === finalEndNode.y) {
                 // --- Utiliser la hauteur correcte --- 
                 const worldPathData = [gridToWorld(finalStartNode.x, finalStartNode.y, activeGraphHeight)];
                 self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData, pathLengthWorld: 0 } });
                 return;
            }

            let gridPath = null;
            let worldPathData = null;
            let pathLengthWorld = 0;

            try {
                // --- Appel A* avec la bonne grille --- 
                //console.time(`[Worker] A* Path ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
                gridPath = findPathAStar(finalStartNode, finalEndNode, activeGridMap); // <-- Passer la grille active et les nœuds normalisés
                //console.timeEnd(`[Worker] A* Path ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'})`);
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
                        pathCache.storePath(finalStartNode, finalEndNode, isVehicle, worldPathData, pathLengthWorld);
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
                console.error(`[Worker] Erreur dans findPathAStar pour Agent ${agentId} (${isVehicle ? 'Véhicule' : 'Piéton'}) (${finalStartNode.x},${finalStartNode.y})->(${finalEndNode.x},${finalEndNode.y}):`, e);
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

// --- Ajout: findNearestWalkableNode pour chercher un nœud walkable proche ---
function findNearestWalkableNode(node, gridMap, maxRadius = 10) { // Augmenté de 5 à 10
    if (isWalkable(node.x, node.y, gridMap)) {
        return { x: node.x, y: node.y };
    }
    
    // Recherche en spirale
    for (let r = 1; r <= maxRadius; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                // Ne vérifier que les nœuds sur le périmètre du carré
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                
                const nx = Math.round(node.x + dx);
                const ny = Math.round(node.y + dy);
                
                if (isWalkable(nx, ny, gridMap)) {
                    return { x: nx, y: ny };
                }
            }
        }
    }
    
    return null; // Aucun nœud walkable trouvé
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