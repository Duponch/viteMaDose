import * as THREE from 'three';

/**
 * Classe de cache pour les chemins calculés par le pathfinding.
 * Stocke et récupère les chemins en utilisant des clés générées à partir des nœuds de départ et d'arrivée.
 */
export default class PathCache {
    constructor(config = {}) {
        // Configuration du cache
        this.maxEntries = config.maxEntries || 5000;
        this.expirationTime = config.expirationTime || 30000; // Temps en ms avant expiration d'une entrée
        this.gridChangeTolerance = config.gridChangeTolerance || 0;
        
        // Structures de stockage
        this.cache = new Map();
        this.keyToTimestamp = new Map();
        this.keyToUsageCount = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            entries: 0
        };

        // Pour la compression des chemins
        this.pathSimplificationTolerance = config.pathSimplificationTolerance || 0.1;
        this.compressionEnabled = config.compressionEnabled !== false;

        console.log(`PathCache: Initialisé avec ${this.maxEntries} entrées max, expiration: ${this.expirationTime}ms, compression: ${this.compressionEnabled}`);
    }

    /**
     * Génère une clé unique pour identifier un chemin dans le cache.
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Si le chemin est pour un véhicule
     * @returns {string} Clé unique
     */
    generateKey(startNode, endNode, isVehicle) {
        return `${isVehicle ? 'v' : 'p'}_${startNode.x},${startNode.y}_${endNode.x},${endNode.y}`;
    }

    /**
     * Récupère un chemin du cache, s'il existe et n'est pas expiré.
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Si le chemin est pour un véhicule
     * @returns {Object|null} - Le résultat du chemin ou null si non trouvé
     */
    getPath(startNode, endNode, isVehicle) {
        const key = this.generateKey(startNode, endNode, isVehicle);
        const now = Date.now();

        // Vérifier si l'entrée existe
        if (!this.cache.has(key)) {
            this.stats.misses++;
            return null;
        }

        // Vérifier l'expiration
        const timestamp = this.keyToTimestamp.get(key);
        if (now - timestamp > this.expirationTime) {
            // Expirer l'entrée
            this.cache.delete(key);
            this.keyToTimestamp.delete(key);
            this.keyToUsageCount.delete(key);
            this.stats.entries--;
            this.stats.evictions++;
            this.stats.misses++;
            return null;
        }

        // Entrée valide - mettre à jour les stats
        this.stats.hits++;
        const usageCount = this.keyToUsageCount.get(key) || 0;
        this.keyToUsageCount.set(key, usageCount + 1);
        
        // Mettre à jour le timestamp pour faire un sliding window
        this.keyToTimestamp.set(key, now);

        // Retourner une copie profonde de l'entrée pour éviter les modifications accidentelles
        const cachedEntry = this.cache.get(key);
        return {
            path: cachedEntry.path.map(point => 
                new THREE.Vector3(point.x, point.y, point.z)
            ),
            pathLengthWorld: cachedEntry.pathLengthWorld
        };
    }

    /**
     * Stocke un chemin dans le cache.
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {Array<THREE.Vector3>} path - Le chemin calculé
     * @param {number} pathLengthWorld - Longueur du chemin en unités monde
     * @param {boolean} isVehicle - Si le chemin est pour un véhicule
     */
    setPath(startNode, endNode, path, pathLengthWorld, isVehicle) {
        if (!path || path.length === 0) {
            return; // Ne pas cacher les chemins vides
        }

        const key = this.generateKey(startNode, endNode, isVehicle);
        const now = Date.now();

        // Si le cache est plein, faire de la place
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            this._evictLeastUsed();
        }

        // Compresser le chemin si activé
        let pathToStore = path;
        if (this.compressionEnabled && path.length > 2) {
            pathToStore = this._simplifyPath(path);
        }

        // Stocker une version sérialisable du chemin (objet simple au lieu de Vector3)
        const serializablePath = pathToStore.map(point => ({
            x: point.x,
            y: point.y,
            z: point.z
        }));

        // Stocker le chemin avec ses métadonnées
        this.cache.set(key, {
            path: serializablePath,
            pathLengthWorld: pathLengthWorld
        });
        
        this.keyToTimestamp.set(key, now);
        this.keyToUsageCount.set(key, 1);

        if (!this.cache.has(key)) {
            this.stats.entries++;
        }
    }

    /**
     * Évince l'entrée la moins utilisée du cache.
     * @private
     */
    _evictLeastUsed() {
        let leastUsedKey = null;
        let leastUsedCount = Infinity;
        let leastUsedTimestamp = Infinity;

        // Trouver l'entrée la moins utilisée et la plus ancienne en cas d'égalité
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
            this.stats.entries--;
            this.stats.evictions++;
        }
    }

    /**
     * Simplifie un chemin en supprimant les points redondants.
     * Utilise l'algorithme de simplification de Ramer-Douglas-Peucker.
     * @param {Array<THREE.Vector3>} path - Le chemin à simplifier
     * @returns {Array<THREE.Vector3>} Le chemin simplifié
     * @private
     */
    _simplifyPath(path) {
        if (path.length <= 2) return path; // Impossible de simplifier

        const tolerance = this.pathSimplificationTolerance;
        const rdp = (points, start, end) => {
            let maxDistance = 0;
            let index = 0;
            
            // Ligne de référence entre le premier et le dernier point
            const line = new THREE.Line3(points[start], points[end]);
            
            // Trouver le point le plus éloigné de la ligne
            for (let i = start + 1; i < end; i++) {
                const closestPoint = new THREE.Vector3();
                line.closestPointToPoint(points[i], true, closestPoint);
                const distance = points[i].distanceTo(closestPoint);
                
                if (distance > maxDistance) {
                    maxDistance = distance;
                    index = i;
                }
            }
            
            // Si la distance max est supérieure à la tolérance, diviser et continuer
            if (maxDistance > tolerance) {
                const leftPart = rdp(points, start, index);
                const rightPart = rdp(points, index, end);
                
                // Combiner les résultats (sans dupliquer le point commun)
                return [...leftPart.slice(0, -1), ...rightPart];
            } else {
                // Sinon, retourner juste les points extrêmes
                return [points[start], points[end]];
            }
        };
        
        return rdp(path, 0, path.length - 1);
    }

    /**
     * Invalide toutes les entrées du cache.
     */
    invalidateAll() {
        this.cache.clear();
        this.keyToTimestamp.clear();
        this.keyToUsageCount.clear();
        this.stats.entries = 0;
        this.stats.evictions += this.stats.entries;
        console.log("PathCache: Cache complètement vidé.");
    }

    /**
     * Invalide les entrées du cache correspondant à une zone spécifique.
     * @param {number} minX - X minimum de la zone à invalider
     * @param {number} minY - Y minimum de la zone à invalider
     * @param {number} maxX - X maximum de la zone à invalider
     * @param {number} maxY - Y maximum de la zone à invalider
     */
    invalidateArea(minX, minY, maxX, maxY) {
        const keysToRemove = [];
        
        this.cache.forEach((value, key) => {
            // Extraire les coordonnées de la clé
            const parts = key.split('_');
            if (parts.length >= 3) {
                const startCoords = parts[1].split(',').map(Number);
                const endCoords = parts[2].split(',').map(Number);
                
                // Vérifier si le chemin passe par la zone à invalider
                if ((startCoords[0] >= minX && startCoords[0] <= maxX && 
                     startCoords[1] >= minY && startCoords[1] <= maxY) ||
                    (endCoords[0] >= minX && endCoords[0] <= maxX && 
                     endCoords[1] >= minY && endCoords[1] <= maxY)) {
                    keysToRemove.push(key);
                }
            }
        });
        
        // Supprimer les entrées
        let removedCount = 0;
        keysToRemove.forEach(key => {
            this.cache.delete(key);
            this.keyToTimestamp.delete(key);
            this.keyToUsageCount.delete(key);
            removedCount++;
        });
        
        this.stats.entries -= removedCount;
        this.stats.evictions += removedCount;
        console.log(`PathCache: ${removedCount} entrées invalidées pour la zone (${minX},${minY})-(${maxX},${maxY}).`);
    }

    /**
     * Trier et vider une partie du cache si nécessaire.
     * @param {number} targetSize - Taille cible du cache après nettoyage
     */
    trim(targetSize = null) {
        if (targetSize === null) {
            targetSize = Math.floor(this.maxEntries * 0.8); // Par défaut, viser 80% de la capacité max
        }
        
        if (this.cache.size <= targetSize) {
            return; // Pas besoin de nettoyer
        }
        
        // Créer une liste triée des entrées par usage et date
        const entries = Array.from(this.keyToUsageCount.entries())
            .map(([key, count]) => ({
                key,
                count,
                timestamp: this.keyToTimestamp.get(key)
            }))
            .sort((a, b) => {
                // Trier par nombre d'utilisations (ascendant), puis par timestamp (ascendant)
                if (a.count !== b.count) return a.count - b.count;
                return a.timestamp - b.timestamp;
            });
        
        // Déterminer combien d'entrées doivent être supprimées
        const removeCount = this.cache.size - targetSize;
        
        // Supprimer les entrées les moins utilisées et les plus anciennes
        for (let i = 0; i < removeCount && i < entries.length; i++) {
            const key = entries[i].key;
            this.cache.delete(key);
            this.keyToTimestamp.delete(key);
            this.keyToUsageCount.delete(key);
            this.stats.evictions++;
        }
        
        this.stats.entries = this.cache.size;
        console.log(`PathCache: Cache nettoyé, ${removeCount} entrées supprimées. Nouvelle taille: ${this.cache.size}`);
    }

    /**
     * Obtient les statistiques du cache.
     * @returns {Object} Statistiques du cache
     */
    getStats() {
        const hitRatio = this.stats.hits + this.stats.misses > 0
            ? this.stats.hits / (this.stats.hits + this.stats.misses)
            : 0;
            
        return {
            ...this.stats,
            hitRatio: hitRatio,
            utilization: this.stats.entries / this.maxEntries,
            memoryEstimate: this._estimateMemoryUsage()
        };
    }

    /**
     * Estime approximativement la mémoire utilisée par le cache.
     * @returns {number} Estimation de la mémoire en octets
     * @private
     */
    _estimateMemoryUsage() {
        let totalSize = 0;
        
        // Estimer la taille des structures de Map
        totalSize += this.cache.size * 80; // Clés + références aux objets
        totalSize += this.keyToTimestamp.size * 40; // Clés + timestamps (nombre)
        totalSize += this.keyToUsageCount.size * 40; // Clés + compteurs (nombre)
        
        // Estimer la taille des objets de chemin stockés
        this.cache.forEach(entry => {
            // Chaque point est environ ~24 octets (x, y, z en nombres flottants)
            totalSize += entry.path.length * 24;
            // Ajouter une surcharge pour l'objet contenant le chemin
            totalSize += 50;
        });
        
        return totalSize;
    }
} 