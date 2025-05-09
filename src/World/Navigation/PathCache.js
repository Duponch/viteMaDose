/**
 * Classe gérant le cache des chemins de navigation
 * Stocke les chemins calculés pour éviter de refaire les mêmes calculs
 */
export default class PathCache {
    /**
     * Constructeur du cache de pathfinding
     * @param {Object} options - Options de configuration
     * @param {number} options.maxEntries - Nombre maximal d'entrées dans le cache (défaut: 1000)
     * @param {number} options.expirationTime - Temps d'expiration des entrées en ms (défaut: 5 minutes)
     * @param {number} options.nearbyThreshold - Seuil pour considérer deux points comme proches (défaut: 3)
     * @param {boolean} options.enableStats - Activer les statistiques de performance (défaut: true)
     */
    constructor(options = {}) {
        // Configuration
        this.maxEntries = options.maxEntries || 3000;
        this.expirationTime = options.expirationTime || 5 * 60 * 1000; // 5 minutes par défaut
        this.nearbyThreshold = options.nearbyThreshold || 3; // Seuil de proximité en unités de grille
        this.enableStats = options.enableStats !== undefined ? options.enableStats : true;
        
        // Stockage de cache
        this.cache = new Map();
        this.cacheKeys = []; // Pour stocker l'ordre d'insertion
        
        // Statistiques
        this.stats = {
            hits: 0,
            misses: 0,
            nearHits: 0,
            expired: 0,
            evicted: 0,
            totalPathsStored: 0,
            totalRetrievals: 0,
            savedComputations: 0,
            averageCacheLookupTime: 0,
            lastCleaned: Date.now()
        };

        console.log(`PathCache: Initialisé avec maxEntries=${this.maxEntries}, expirationTime=${this.expirationTime}ms, nearbyThreshold=${this.nearbyThreshold}`);
    }

    /**
     * Génère une clé de cache à partir des paramètres de chemin
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Mode véhicule (true) ou piéton (false)
     * @returns {string} Clé de cache unique
     */
    generateKey(startNode, endNode, isVehicle) {
        return `${startNode.x},${startNode.y}-${endNode.x},${endNode.y}-${isVehicle ? 'v' : 'p'}`;
    }

    /**
     * Stocke un chemin dans le cache
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Mode véhicule (true) ou piéton (false)
     * @param {Array} path - Tableau de points du chemin
     * @param {number} pathLengthWorld - Longueur du chemin en unités monde
     * @returns {boolean} - true si le chemin a été stocké avec succès
     */
    storePath(startNode, endNode, isVehicle, path, pathLengthWorld) {
        if (!startNode || !endNode || !path) {
            return false;
        }

        // Nettoyer le cache si nécessaire
        this._cleanCache();

        // Générer la clé de cache
        const key = this.generateKey(startNode, endNode, isVehicle);

        // Vérifier si la clé existe déjà
        if (this.cache.has(key)) {
            // Mettre à jour l'entrée existante
            const entry = this.cache.get(key);
            entry.path = path.map(p => ({x: p.x, y: p.y, z: p.z})); // Copie profonde pour éviter les références
            entry.pathLengthWorld = pathLengthWorld;
            entry.timestamp = Date.now();
            entry.uses++;

            // Déplacer la clé à la fin de la liste (la plus récente)
            this._refreshKeyOrder(key);
        } else {
            // Vérifier si le cache est plein
            if (this.cache.size >= this.maxEntries) {
                this._evictOldest();
            }

            // Créer une nouvelle entrée
            const entry = {
                path: path.map(p => ({x: p.x, y: p.y, z: p.z})), // Copie profonde
                pathLengthWorld: pathLengthWorld,
                timestamp: Date.now(),
                startNode: {x: startNode.x, y: startNode.y},
                endNode: {x: endNode.x, y: endNode.y},
                isVehicle: isVehicle,
                uses: 1
            };

            // Stocker l'entrée et la clé
            this.cache.set(key, entry);
            this.cacheKeys.push(key);

            // Mettre à jour les statistiques
            if (this.enableStats) {
                this.stats.totalPathsStored++;
            }
        }

        return true;
    }

    /**
     * Recherche un chemin dans le cache
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Mode véhicule (true) ou piéton (false)
     * @param {boolean} allowNearbyMatch - Autoriser les correspondances approximatives
     * @returns {Object|null} - Entrée de cache ou null si non trouvée
     */
    findPath(startNode, endNode, isVehicle, allowNearbyMatch = true) {
        if (!startNode || !endNode) {
            return null;
        }

        const startTime = this.enableStats ? performance.now() : 0;
        let result = null;

        // Recherche exacte
        const exactKey = this.generateKey(startNode, endNode, isVehicle);
        const exactEntry = this.cache.get(exactKey);

        if (exactEntry && !this._isExpired(exactEntry)) {
            // Hit exact
            result = exactEntry;
            exactEntry.uses++;
            exactEntry.lastAccess = Date.now();
            this._refreshKeyOrder(exactKey);

            if (this.enableStats) {
                this.stats.hits++;
                this.stats.savedComputations++;
            }
        } 
        // Recherche approximative si autorisée et pas de correspondance exacte
        else if (allowNearbyMatch) {
            result = this._findNearbyPath(startNode, endNode, isVehicle);
            
            if (result) {
                if (this.enableStats) {
                    this.stats.nearHits++;
                    this.stats.savedComputations++;
                }
            } else if (this.enableStats) {
                this.stats.misses++;
            }
        } else if (this.enableStats) {
            this.stats.misses++;
        }

        // Mettre à jour les statistiques
        if (this.enableStats) {
            this.stats.totalRetrievals++;
            
            const endTime = performance.now();
            const lookupTime = endTime - startTime;
            this.stats.averageCacheLookupTime = 
                (this.stats.averageCacheLookupTime * (this.stats.totalRetrievals - 1) + lookupTime) / 
                this.stats.totalRetrievals;
        }

        // Retourner le résultat (null si rien trouvé)
        return result;
    }

    /**
     * Recherche un chemin proche dans le cache
     * @private
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Mode véhicule (true) ou piéton (false)
     * @returns {Object|null} - Entrée de cache ou null si non trouvée
     */
    _findNearbyPath(startNode, endNode, isVehicle) {
        let bestMatch = null;
        let bestScore = Number.MAX_VALUE;

        // Parcourir toutes les entrées du cache
        for (const [key, entry] of this.cache.entries()) {
            // Vérifier uniquement les entrées du même type (véhicule/piéton)
            if (entry.isVehicle !== isVehicle || this._isExpired(entry)) {
                continue;
            }

            // Calculer la distance entre les nœuds
            const startDist = this._gridDistance(startNode, entry.startNode);
            const endDist = this._gridDistance(endNode, entry.endNode);
            
            // Score total (distance combinée)
            const score = startDist + endDist;
            
            // Vérifier si ce chemin est le meilleur jusqu'à présent
            if (score < bestScore && startDist <= this.nearbyThreshold && endDist <= this.nearbyThreshold) {
                bestMatch = entry;
                bestScore = score;
            }
        }

        if (bestMatch) {
            bestMatch.uses++;
            bestMatch.lastAccess = Date.now();
            // Ne pas rafraîchir l'ordre des clés pour éviter trop de réorganisations
        }

        return bestMatch;
    }

    /**
     * Calcule la distance Manhattan entre deux nœuds de grille
     * @private
     * @param {Object} node1 - Premier nœud {x, y}
     * @param {Object} node2 - Second nœud {x, y}
     * @returns {number} - Distance entre les nœuds
     */
    _gridDistance(node1, node2) {
        return Math.abs(node1.x - node2.x) + Math.abs(node1.y - node2.y);
    }

    /**
     * Vérifie si une entrée de cache est expirée
     * @private
     * @param {Object} entry - Entrée de cache
     * @returns {boolean} - true si l'entrée est expirée
     */
    _isExpired(entry) {
        return Date.now() - entry.timestamp > this.expirationTime;
    }

    /**
     * Nettoie le cache des entrées expirées
     * @private
     */
    _cleanCache() {
        // Ne nettoyer que si au moins 1 minute s'est écoulée depuis le dernier nettoyage
        const now = Date.now();
        if (now - this.stats.lastCleaned < 60000) {
            return;
        }

        const oldSize = this.cache.size;
        const keysToRemove = [];

        // Identifier les clés expirées
        for (const [key, entry] of this.cache.entries()) {
            if (this._isExpired(entry)) {
                keysToRemove.push(key);
            }
        }

        // Supprimer les entrées expirées
        keysToRemove.forEach(key => {
            this.cache.delete(key);
            const keyIndex = this.cacheKeys.indexOf(key);
            if (keyIndex !== -1) {
                this.cacheKeys.splice(keyIndex, 1);
            }
        });

        // Mettre à jour les statistiques
        if (this.enableStats) {
            this.stats.expired += keysToRemove.length;
            this.stats.lastCleaned = now;
        }

        if (keysToRemove.length > 0) {
            console.log(`PathCache: ${keysToRemove.length} entrées expirées supprimées (taille: ${oldSize} -> ${this.cache.size})`);
        }
    }

    /**
     * Supprime l'entrée la plus ancienne du cache
     * @private
     */
    _evictOldest() {
        if (this.cacheKeys.length === 0) {
            return;
        }

        // Supprimer la première clé (la plus ancienne)
        const oldestKey = this.cacheKeys.shift();
        this.cache.delete(oldestKey);

        // Mettre à jour les statistiques
        if (this.enableStats) {
            this.stats.evicted++;
        }
    }

    /**
     * Rafraîchit l'ordre d'une clé dans la liste des clés
     * @private
     * @param {string} key - Clé à rafraîchir
     */
    _refreshKeyOrder(key) {
        const keyIndex = this.cacheKeys.indexOf(key);
        if (keyIndex !== -1) {
            this.cacheKeys.splice(keyIndex, 1);
            this.cacheKeys.push(key);
        }
    }

    /**
     * Récupère les statistiques du cache
     * @returns {Object} - Statistiques du cache
     */
    getStats() {
        if (!this.enableStats) {
            return {enabled: false};
        }

        const hitRate = this.stats.totalRetrievals > 0 
            ? (this.stats.hits + this.stats.nearHits) / this.stats.totalRetrievals * 100 
            : 0;

        return {
            ...this.stats,
            cacheSize: this.cache.size,
            hitRate: hitRate.toFixed(2) + '%',
            nearHitRate: this.stats.totalRetrievals > 0 
                ? (this.stats.nearHits / this.stats.totalRetrievals * 100).toFixed(2) + '%' 
                : '0%',
            avgLookupTimeMs: this.stats.averageCacheLookupTime.toFixed(3) + 'ms'
        };
    }

    /**
     * Vide complètement le cache
     */
    clear() {
        this.cache.clear();
        this.cacheKeys = [];
        
        if (this.enableStats) {
            const savedStats = {
                hits: this.stats.hits,
                misses: this.stats.misses,
                nearHits: this.stats.nearHits,
                totalRetrievals: this.stats.totalRetrievals,
                savedComputations: this.stats.savedComputations
            };
            
            // Réinitialiser les statistiques mais garder les compteurs cumulatifs
            this.stats = {
                ...savedStats,
                expired: 0,
                evicted: 0,
                totalPathsStored: 0,
                averageCacheLookupTime: 0,
                lastCleaned: Date.now()
            };
        }
        
        console.log("PathCache: Cache vidé");
    }

    /**
     * Préchauffe le cache avec des chemins connus
     * @param {Array} paths - Tableau de chemins à mettre en cache
     * @returns {number} - Nombre de chemins ajoutés au cache
     */
    preloadPaths(paths) {
        if (!Array.isArray(paths)) {
            return 0;
        }

        let count = 0;
        for (const pathInfo of paths) {
            const {startNode, endNode, isVehicle, path, pathLengthWorld} = pathInfo;
            if (startNode && endNode && path && path.length > 0) {
                if (this.storePath(startNode, endNode, isVehicle, path, pathLengthWorld)) {
                    count++;
                }
            }
        }

        console.log(`PathCache: ${count} chemins préchargés`);
        return count;
    }

    /**
     * Convertit un chemin mis en cache en un format utilisable
     * @param {Object} cacheEntry - Entrée de cache
     * @returns {Object} - Données formatées pour l'utilisation
     */
    formatCachedPath(cacheEntry) {
        if (!cacheEntry) return null;

        // Créer des copies pour éviter de modifier les objets en cache
        return {
            path: cacheEntry.path.map(p => ({x: p.x, y: p.y, z: p.z})),
            pathLengthWorld: cacheEntry.pathLengthWorld,
            fromCache: true
        };
    }
} 