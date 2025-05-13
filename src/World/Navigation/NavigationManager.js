// src/World/NavigationManager.js
import NavigationGraph from './NavigationGraph.js';
import RoadNavigationGraph from './RoadNavigationGraph.js';
import PedestrianNavigationGraph from './PedestrianNavigationGraph.js';
import Pathfinder from './Pathfinder.js';
import PathCache from './PathCache.js';

/**
 * NavigationManager centralise la gestion des graphes de navigation et des services de pathfinding.
 * Il gère à la fois la navigation des piétons sur les trottoirs et celle des voitures sur les routes.
 */
export default class NavigationManager {
    /**
     * Crée une instance de NavigationManager.
     * @param {Object} config - Configuration générale du projet (incluant notamment les paramètres de taille, trottoir, etc.).
     */
    constructor(config) {
        this.config = config;
        this.pedestrianNavigationGraph = null;
        this.roadNavigationGraph = null;
        this.pedestrianPathfinder = null;
        this.roadPathfinder = null;
        
        // Initialisation du cache de chemins
        this.pathCache = new PathCache({
            maxEntries: config.pathCacheMaxEntries || 8000,
            expirationTime: config.pathCacheExpirationTime || 30 * 60 * 1000,
            nearbyThreshold: config.pathCacheNearbyThreshold || 6,
            enableStats: true
        });
    }

    /**
     * Construit et met à jour le graphe de navigation.
     * @param {Array<Object>} plots - La liste des parcelles (plots) générées par le CityLayoutGenerator.
     * @param {Array<Object>} crosswalkInfos - Les informations relatives aux passages piétons.
     */
    buildGraph(plots, crosswalkInfos) {
        //console.time("NavigationGraphBuilding");
        
        //console.log("NavigationManager: Début de la construction des graphes de navigation");
        //console.log(`NavigationManager: Nombre de parcelles: ${plots.length}`);
        //console.log(`NavigationManager: Nombre de passages piétons: ${crosswalkInfos.length}`);
        
        // Créer les deux grilles de navigation
        this.pedestrianNavigationGraph = new PedestrianNavigationGraph(this.config);
        this.roadNavigationGraph = new RoadNavigationGraph(this.config);
        
        // Construire les grilles
        //console.log("NavigationManager: Construction du graphe piéton...");
        this.pedestrianNavigationGraph.buildGraph(plots, crosswalkInfos);
        
        //console.log("NavigationManager: Construction du graphe routier...");
        this.roadNavigationGraph.buildGraph(plots, crosswalkInfos);
        
        // Vérifier que les graphes ont été correctement construits
        if (!this.pedestrianNavigationGraph || !this.roadNavigationGraph) {
            console.error("NavigationManager: Erreur - Un ou plusieurs graphes n'ont pas été créés");
            return;
        }
        
        //console.log("NavigationManager: Construction des graphes terminée");
        //console.timeEnd("NavigationGraphBuilding");
    }

    /**
     * Initialise le service de pathfinding en créant une instance de Pathfinder basée sur le graphe de navigation actuel.
     */
    initializePathfinder() {
        // Initialiser les pathfinders pour les piétons et les voitures
        this.pedestrianPathfinder = new Pathfinder(this.pedestrianNavigationGraph);
        this.roadPathfinder = new Pathfinder(this.roadNavigationGraph);
        
        // Vérifier que les pathfinders ont été correctement initialisés
        if (!this.pedestrianPathfinder || !this.roadPathfinder) {
            console.error("NavigationManager: Erreur - Un ou plusieurs pathfinders n'ont pas été créés");
            return;
        }
        
        //console.log("NavigationManager: Pathfinders initialisés avec succès");
    }

    /**
     * Retourne l'instance actuelle du graphe de navigation.
     * @param {boolean} isVehicle - Indique si la navigation est pour une voiture (true) ou pour un piéton (false).
     * @returns {NavigationGraph} Le graphe de navigation.
     */
    getNavigationGraph(isVehicle = false) {
        const graph = isVehicle ? this.roadNavigationGraph : this.pedestrianNavigationGraph;
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
        const pathfinder = isVehicle ? this.roadPathfinder : this.pedestrianPathfinder;
        if (!pathfinder) {
            console.error(`NavigationManager: Le pathfinder ${isVehicle ? 'routier' : 'piéton'} n'est pas disponible`);
            return null;
        }
        return pathfinder;
    }

    /**
     * Recherche un chemin dans le cache ou le calcule si nécessaire
     * @param {Object} startNode - Nœud de départ {x, y}
     * @param {Object} endNode - Nœud d'arrivée {x, y}
     * @param {boolean} isVehicle - Indique si le pathfinding est pour une voiture (true) ou pour un piéton (false)
     * @param {boolean} useCache - Utiliser le cache (true par défaut)
     * @returns {Object|null} Résultat contenant le chemin et sa longueur, ou null si échec
     */
    findPath(startNode, endNode, isVehicle = false, useCache = true) {
        if (!startNode || !endNode) {
            console.error("NavigationManager: Nœuds de départ ou d'arrivée invalides dans findPath");
            return null;
        }

        // 1. Vérifier le cache si autorisé
        if (useCache) {
            const cachedResult = this.pathCache.findPath(startNode, endNode, isVehicle);
            if (cachedResult) {
                // Formater le résultat du cache pour l'API externe
                return this.pathCache.formatCachedPath(cachedResult);
            }
        }

        // 2. Si pas dans le cache, calculer le chemin
        const pathfinder = this.getPathfinder(isVehicle);
        if (!pathfinder) {
            return null;
        }

        // Obtenir le graphe correct
        const graph = this.getNavigationGraph(isVehicle);
        if (!graph) {
            return null;
        }

        // Calculer le chemin
        const path = pathfinder.findPath(startNode, endNode);
        if (!path || path.length === 0) {
            return null;
        }

        // Convertir le chemin en coordonnées monde
        const worldPath = path.map(node => graph.gridToWorld(node.x, node.y));
        
        // Calculer la longueur du chemin
        let pathLengthWorldSquared = 0;
        for (let i = 0; i < worldPath.length - 1; i++) {
            pathLengthWorldSquared += worldPath[i].distanceToSquared(worldPath[i + 1]);
        }
        const pathLengthWorld = Math.sqrt(pathLengthWorldSquared);

        // 3. Stocker dans le cache si autorisé
        if (useCache) {
            this.pathCache.storePath(startNode, endNode, isVehicle, worldPath, pathLengthWorld);
        }

        return {
            path: worldPath,
            pathLengthWorld,
            fromCache: false
        };
    }

    /**
     * Préchauffe le cache de chemins avec des trajets communs
     * @param {Array} commonRoutes - Liste des trajets communs au format [{startNode, endNode, isVehicle}]
     */
    preheatPathCache(commonRoutes) {
        if (!Array.isArray(commonRoutes) || commonRoutes.length === 0) {
            return;
        }

        //console.log(`NavigationManager: Préchauffage du cache avec ${commonRoutes.length} trajets communs...`);
        const preloadData = [];

        for (const route of commonRoutes) {
            const { startNode, endNode, isVehicle } = route;
            const pathResult = this.findPath(startNode, endNode, isVehicle, false); // Calculer sans utiliser le cache
            
            if (pathResult) {
                preloadData.push({
                    startNode,
                    endNode,
                    isVehicle,
                    path: pathResult.path,
                    pathLengthWorld: pathResult.pathLengthWorld
                });
            }
        }

        this.pathCache.preloadPaths(preloadData);
        //console.log(`NavigationManager: Cache préchauffé avec ${preloadData.length} trajets`);
    }

    /**
     * Retourne les statistiques du cache de chemins
     * @returns {Object} Statistiques du cache
     */
    getPathCacheStats() {
        return this.pathCache.getStats();
    }

    // --- AJOUT: Méthode pour obtenir les données des DEUX grilles pour le worker ---
    getAllGridDataForWorker() {
        const pedestrianData = this.pedestrianNavigationGraph?.getGridDataForWorker();
        const roadData = this.roadNavigationGraph?.getGridDataForWorker();

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

        return {
            pedestrian: {
                gridBuffer: pedestrianData.gridBuffer,
                graphHeight: pedestrianData.conversionParams.graphHeight
            },
            road: {
                gridBuffer: roadData.gridBuffer,
                graphHeight: roadData.conversionParams.graphHeight
            },
            // Paramètres communs
            gridWidth: pedestrianData.gridWidth,
            gridHeight: pedestrianData.gridHeight,
            gridScale: pedestrianData.conversionParams.gridScale,
            offsetX: pedestrianData.conversionParams.offsetX,
            offsetZ: pedestrianData.conversionParams.offsetZ
        };
    }
    // --- FIN AJOUT ---

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
        if (this.pedestrianNavigationGraph) {
            this.pedestrianNavigationGraph.destroy();
        }
        if (this.roadNavigationGraph) {
            this.roadNavigationGraph.destroy();
        }
        this.pedestrianNavigationGraph = null;
        this.roadNavigationGraph = null;
        this.pedestrianPathfinder = null;
        this.roadPathfinder = null;
        
        // Vider le cache de chemins
        this.pathCache.clear();
        this.pathCache = null;
    }
}
