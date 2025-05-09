// src/World/NavigationManager.js
import NavigationGraph from './NavigationGraph.js';
import RoadNavigationGraph from './RoadNavigationGraph.js';
import PedestrianNavigationGraph from './PedestrianNavigationGraph.js';
import Pathfinder from './Pathfinder.js';
import PathCache from './PathCache.js';
import * as THREE from 'three';

/**
 * NavigationManager centralise la gestion des graphes de navigation et des services de pathfinding.
 * Il gère à la fois la navigation des piétons sur les trottoirs et celle des voitures sur les routes.
 */
export default class NavigationManager {
    /**
     * Crée une instance de NavigationManager.
     * @param {Object} config - Configuration générale du projet (incluant notamment les paramètres de taille, trottoir, etc.).
     */
    constructor(experience, config = {}) {
        this.experience = experience;
        this.config = config;
        
        // Graphes de navigation (piéton et véhicule)
        this.navigationGraphs = {
            pedestrian: null,
            road: null
        };
        
        // Pathfinders (utilisant les graphes respectifs)
        this.pathfinders = {
            pedestrian: null,
            road: null
        };
        
        // Système de cache
        this.cacheConfig = {
            maxEntries: config.cacheMaxEntries || 5000,
            expirationTime: config.cacheExpirationTime || 30000, // 30 secondes par défaut
            pathSimplificationTolerance: config.pathSimplificationTolerance || 0.1,
            compressionEnabled: config.compressionEnabled !== false
        };
        
        this.pathCache = new PathCache(this.cacheConfig);
        
        // Paramètres de performances et de debugging
        this.useCache = config.useCache !== false;
        this.cacheHitColor = new THREE.Color(0x00ff00); // vert pour les hits de cache
        this.cacheMissColor = new THREE.Color(0xff0000); // rouge pour les calculs de chemin
        
        this.cacheMetricsInterval = null;
        this.debugPathLines = new Map(); // Pour visualiser les chemins
        
        console.log(`NavigationManager: Initialisé avec cache ${this.useCache ? 'activé' : 'désactivé'}`);
    }

    /**
     * Construit et met à jour le graphe de navigation.
     * @param {Array<Object>} plots - La liste des parcelles (plots) générées par le CityLayoutGenerator.
     * @param {Array<Object>} crosswalkInfos - Les informations relatives aux passages piétons.
     */
    buildGraph(plots, crosswalkInfos) {
        console.time("NavigationGraphBuilding");
        
        console.log("NavigationManager: Début de la construction des graphes de navigation");
        console.log(`NavigationManager: Nombre de parcelles: ${plots.length}`);
        console.log(`NavigationManager: Nombre de passages piétons: ${crosswalkInfos.length}`);
        
        // Créer les deux grilles de navigation
        this.navigationGraphs.pedestrian = new PedestrianNavigationGraph(this.config);
        this.navigationGraphs.road = new RoadNavigationGraph(this.config);
        
        // Construire les grilles
        console.log("NavigationManager: Construction du graphe piéton...");
        this.navigationGraphs.pedestrian.buildGraph(plots, crosswalkInfos);
        
        console.log("NavigationManager: Construction du graphe routier...");
        this.navigationGraphs.road.buildGraph(plots, crosswalkInfos);
        
        // Vérifier que les graphes ont été correctement construits
        if (!this.navigationGraphs.pedestrian || !this.navigationGraphs.road) {
            console.error("NavigationManager: Erreur - Un ou plusieurs graphes n'ont pas été créés");
            return;
        }
        
        console.log("NavigationManager: Construction des graphes terminée");
        console.timeEnd("NavigationGraphBuilding");
    }

    /**
     * Initialise le service de pathfinding en créant une instance de Pathfinder basée sur le graphe de navigation actuel.
     */
    initializePathfinder() {
        // Initialiser les pathfinders pour les piétons et les voitures
        this.pathfinders.pedestrian = new Pathfinder(this.navigationGraphs.pedestrian);
        this.pathfinders.road = new Pathfinder(this.navigationGraphs.road);
        
        // Vérifier que les pathfinders ont été correctement initialisés
        if (!this.pathfinders.pedestrian || !this.pathfinders.road) {
            console.error("NavigationManager: Erreur - Un ou plusieurs pathfinders n'ont pas été créés");
            return;
        }
        
        console.log("NavigationManager: Pathfinders initialisés avec succès");
    }

    /**
     * Retourne l'instance actuelle du graphe de navigation.
     * @param {boolean} isVehicle - Indique si la navigation est pour une voiture (true) ou pour un piéton (false).
     * @returns {NavigationGraph} Le graphe de navigation.
     */
    getNavigationGraph(isVehicle = false) {
        const graph = isVehicle ? this.navigationGraphs.road : this.navigationGraphs.pedestrian;
        if (!graph) {
            console.error(`NavigationManager: Le graphe ${isVehicle ? 'routier' : 'piéton'} n'est pas disponible`);
            return null;
        }
        return graph;
    }

    /**
     * Retourne le service de pathfinding.
     * @param {boolean} isVehicle - Indique si le pathfinding est pour une voiture (true) ou pour un piéton (false).
     * @returns {Pathfinder} L'instance de Pathfinder.
     */
    getPathfinder(isVehicle = false) {
        const pathfinder = isVehicle ? this.pathfinders.road : this.pathfinders.pedestrian;
        if (!pathfinder) {
            console.error(`NavigationManager: Le pathfinder ${isVehicle ? 'routier' : 'piéton'} n'est pas disponible`);
            return null;
        }
        return pathfinder;
    }

    /**
     * Récupère toutes les données de grille pour le worker.
     * Inclut les paramètres communs et les données spécifiques aux graphes.
     * @returns {Object} Les données des grilles piéton et véhicule avec paramètres communs
     */
    getAllGridDataForWorker() {
        const pedestrianData = this.navigationGraphs.pedestrian?.getGridDataForWorker() || null;
        const roadData = this.navigationGraphs.road?.getGridDataForWorker() || null;
        
        if (!pedestrianData || !roadData) {
            console.error("NavigationManager: Impossible d'obtenir les données de grille pour le worker - un ou les deux graphes ne sont pas prêts ou n'ont pas de buffer.");
            return null;
        }

        // Vérifier que les dimensions et l'échelle sont cohérentes (important !)
        if (pedestrianData.gridWidth !== roadData.gridWidth || 
            pedestrianData.gridHeight !== roadData.gridHeight ||
            pedestrianData.conversionParams.gridScale !== roadData.conversionParams.gridScale ||
            pedestrianData.conversionParams.offsetX !== roadData.conversionParams.offsetX ||
            pedestrianData.conversionParams.offsetZ !== roadData.conversionParams.offsetZ) {
            console.error("NavigationManager: Incohérence dans les dimensions ou paramètres de conversion entre les grilles piétonne et routière!");
            return null;
        }
        
        // Préparer un objet bien structuré avec toutes les données nécessaires
        return {
            // Données communes au niveau racine
            gridWidth: pedestrianData.gridWidth,
            gridHeight: pedestrianData.gridHeight,
            gridScale: pedestrianData.conversionParams.gridScale,
            offsetX: pedestrianData.conversionParams.offsetX,
            offsetZ: pedestrianData.conversionParams.offsetZ,
            
            // Données spécifiques aux graphes
            pedestrian: {
                gridBuffer: pedestrianData.gridBuffer,
                gridWidth: pedestrianData.gridWidth,
                gridHeight: pedestrianData.gridHeight,
                conversionParams: pedestrianData.conversionParams
            },
            road: {
                gridBuffer: roadData.gridBuffer,
                gridWidth: roadData.gridWidth,
                gridHeight: roadData.gridHeight,
                conversionParams: roadData.conversionParams
            }
        };
    }

    /**
     * Méthode d'update, à utiliser si vous souhaitez intégrer une logique de mise à jour
     * (par exemple pour une navigation dynamique ou lors de mise à jour du layout).
     */
    update() {
        // Pour l'instant, la logique de mise à jour n'est pas nécessaire,
        // mais cette méthode peut être étendue en fonction des évolutions.
    }

    /**
     * Détruit le NavigationManager et libère les ressources utilisées par le graphe de navigation.
     */
    destroy() {
        if (this.navigationGraphs.pedestrian) {
            this.navigationGraphs.pedestrian.destroy();
        }
        if (this.navigationGraphs.road) {
            this.navigationGraphs.road.destroy();
        }
        this.navigationGraphs.pedestrian = null;
        this.navigationGraphs.road = null;
        this.pathfinders.pedestrian = null;
        this.pathfinders.road = null;

        this.stopCacheMetricsReporting();
        
        // Nettoyer les lignes de debug
        this.debugPathLines.forEach(line => {
            if (line.parent) line.parent.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        this.debugPathLines.clear();
        
        // Vider le cache
        this.pathCache.invalidateAll();
        
        console.log("NavigationManager: Détruit");
    }

    /**
     * Trouve un chemin entre deux positions.
     * Utilise le cache si activé, sinon calcule directement.
     * @param {THREE.Vector3} startPos - Position de départ
     * @param {THREE.Vector3} endPos - Position d'arrivée
     * @param {Object} startNodeOverride - Nœud de départ précalculé (optionnel)
     * @param {Object} endNodeOverride - Nœud d'arrivée précalculé (optionnel)
     * @param {boolean} isVehicle - Si le chemin est pour un véhicule
     * @param {string} requesterId - ID de l'entité demandant le chemin (pour debug)
     * @returns {Object} Résultat contenant le chemin et sa longueur
     */
    findPath(startPos, endPos, startNodeOverride = null, endNodeOverride = null, isVehicle = false, requesterId = 'unknown') {
        const graph = this.getNavigationGraph(isVehicle);
        const pathfinder = this.getPathfinder(isVehicle);
        
        if (!graph || !pathfinder) {
            console.error(`NavigationManager: Graphe ou pathfinder manquant pour mode ${isVehicle ? 'véhicule' : 'piéton'}`);
            return { path: null, pathLengthWorld: 0 };
        }
        
        // Obtenir les nœuds du graphe si non fournis
        let startNode = startNodeOverride;
        let endNode = endNodeOverride;
        
        if (!startNode && startPos) {
            startNode = graph.getClosestWalkableNode(startPos);
        }
        
        if (!endNode && endPos) {
            endNode = graph.getClosestWalkableNode(endPos);
        }
        
        if (!startNode || !endNode) {
            console.error(`NavigationManager: Impossible de trouver des nœuds valides pour ${isVehicle ? 'véhicule' : 'piéton'}`);
            return { path: null, pathLengthWorld: 0 };
        }
        
        // Cas simple: départ = arrivée
        if (startNode.x === endNode.x && startNode.y === endNode.y) {
            const singlePoint = graph.gridToWorld(startNode.x, startNode.y);
            return { 
                path: [singlePoint],
                pathLengthWorld: 0 
            };
        }
        
        // Vérifier le cache si activé
        if (this.useCache) {
            const cachedResult = this.pathCache.getPath(startNode, endNode, isVehicle);
            if (cachedResult) {
                // Si debug, colorer le chemin en vert (hit de cache)
                this._updateDebugPath(requesterId, cachedResult.path, this.cacheHitColor);
                return cachedResult;
            }
        }
        
        // Pas de résultat en cache, calculer le chemin
        const result = pathfinder.findPathRaw(startNode, endNode);
        
        let finalResult = { 
            path: result, 
            pathLengthWorld: 0 
        };
        
        // Calculer la longueur du chemin si un chemin a été trouvé
        if (result && result.length > 1) {
            let pathLength = 0;
            for (let i = 0; i < result.length - 1; i++) {
                pathLength += result[i].distanceTo(result[i+1]);
            }
            finalResult.pathLengthWorld = pathLength;
            
            // Si debug, colorer le chemin en rouge (calcul frais)
            this._updateDebugPath(requesterId, result, this.cacheMissColor);
            
            // Stocker dans le cache si activé
            if (this.useCache) {
                this.pathCache.setPath(startNode, endNode, result, pathLength, isVehicle);
            }
        }
        
        return finalResult;
    }
    
    /**
     * Met à jour la visualisation de debug du chemin.
     * @param {string} id - Identifiant du chemin
     * @param {Array<THREE.Vector3>} path - Le chemin à visualiser
     * @param {THREE.Color} color - Couleur du chemin
     * @private
     */
    _updateDebugPath(id, path, color) {
        if (!this.experience.isDebugMode || !this.experience.world) return;
        
        // Supprimer l'ancien chemin s'il existe
        if (this.debugPathLines.has(id)) {
            const oldLine = this.debugPathLines.get(id);
            this.experience.world.scene.remove(oldLine);
            oldLine.geometry.dispose();
            oldLine.material.dispose();
        }
        
        if (path && path.length > 1) {
            // Créer un matériau avec la couleur spécifiée
            const material = new THREE.LineBasicMaterial({ 
                color: color,
                linewidth: 2
            });
            
            // Copier les points et les élever légèrement pour visibilité
            const elevatedPoints = path.map(p => new THREE.Vector3(p.x, p.y + 0.1, p.z));
            
            // Créer la géométrie et la ligne
            const geometry = new THREE.BufferGeometry().setFromPoints(elevatedPoints);
            const line = new THREE.Line(geometry, material);
            line.name = `Debug_Path_${id}`;
            
            // Ajouter à la scène et stocker la référence
            this.experience.world.scene.add(line);
            this.debugPathLines.set(id, line);
        }
    }
    
    /**
     * Démarre l'affichage périodique des métriques du cache.
     * @param {number} intervalMs - Intervalle en millisecondes
     */
    startCacheMetricsReporting(intervalMs = 10000) {
        if (this.cacheMetricsInterval) {
            clearInterval(this.cacheMetricsInterval);
        }
        
        this.cacheMetricsInterval = setInterval(() => {
            if (this.useCache) {
                const stats = this.pathCache.getStats();
                console.log(`PathCache Stats: Hits: ${stats.hits}, Misses: ${stats.misses}, Ratio: ${(stats.hitRatio * 100).toFixed(1)}%, Entries: ${stats.entries}/${this.cacheConfig.maxEntries}`);
            }
        }, intervalMs);
    }
    
    /**
     * Arrête l'affichage des métriques du cache.
     */
    stopCacheMetricsReporting() {
        if (this.cacheMetricsInterval) {
            clearInterval(this.cacheMetricsInterval);
            this.cacheMetricsInterval = null;
        }
    }
    
    /**
     * Modifie l'état du cache (activé/désactivé).
     * @param {boolean} enabled - Si le cache doit être activé
     */
    setCacheEnabled(enabled) {
        this.useCache = enabled;
        console.log(`NavigationManager: Cache ${enabled ? 'activé' : 'désactivé'}`);
        
        if (!enabled) {
            // Optionnel: vider le cache lors de la désactivation
            this.pathCache.invalidateAll();
        }
    }
    
    /**
     * Nettoie le cache pour libérer de la mémoire.
     * @param {number} targetSize - Taille cible (en nombre d'entrées)
     */
    trimCache(targetSize = null) {
        if (this.useCache) {
            this.pathCache.trim(targetSize);
        }
    }
    
    /**
     * Invalide les chemins dans une zone spécifique.
     * Utile lors de modifications du monde (ex: construction).
     * @param {number} minX - X minimum de la zone à invalider
     * @param {number} minY - Y minimum de la zone à invalider
     * @param {number} maxX - X maximum de la zone à invalider
     * @param {number} maxY - Y maximum de la zone à invalider
     */
    invalidateAreaCache(minX, minY, maxX, maxY) {
        if (this.useCache) {
            this.pathCache.invalidateArea(minX, minY, maxX, maxY);
        }
    }
    
    /**
     * Invalide tout le cache.
     * Utile lors de changements majeurs dans le monde.
     */
    invalidateAllCache() {
        if (this.useCache) {
            this.pathCache.invalidateAll();
        }
    }
}
