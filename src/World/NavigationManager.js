// src/World/NavigationManager.js
import NavigationGraph from './NavigationGraph.js';
import RoadNavigationGraph from './RoadNavigationGraph.js';
import Pathfinder from './Pathfinder.js';

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
    }

    /**
     * Construit et met à jour le graphe de navigation.
     * @param {Array<Object>} plots - La liste des parcelles (plots) générées par le CityLayoutGenerator.
     * @param {Array<Object>} crosswalkInfos - Les informations relatives aux passages piétons.
     */
    buildGraph(plots, crosswalkInfos) {
        console.time("NavigationGraphBuilding");
        
        // Créer les deux grilles de navigation
        this.pedestrianNavigationGraph = new NavigationGraph(this.config);
        this.roadNavigationGraph = new RoadNavigationGraph(this.config);
        
        // Construire les grilles
        this.pedestrianNavigationGraph.buildGraph(plots, crosswalkInfos);
        this.roadNavigationGraph.buildGraph(plots, crosswalkInfos);
        
        console.timeEnd("NavigationGraphBuilding");
    }

    /**
     * Initialise le service de pathfinding en créant une instance de Pathfinder basée sur le graphe de navigation actuel.
     */
    initializePathfinder() {
        // Initialiser les pathfinders pour les piétons et les voitures
        this.pedestrianPathfinder = new Pathfinder(this.pedestrianNavigationGraph);
        this.roadPathfinder = new Pathfinder(this.roadNavigationGraph);
    }

    /**
     * Retourne l'instance actuelle du graphe de navigation.
     * @param {boolean} isVehicle - Indique si la navigation est pour une voiture (true) ou pour un piéton (false).
     * @returns {NavigationGraph} Le graphe de navigation.
     */
    getNavigationGraph(isVehicle = false) {
        return isVehicle ? this.roadNavigationGraph : this.pedestrianNavigationGraph;
    }

    /**
     * Retourne le service de pathfinding.
     * @param {boolean} isVehicle - Indique si le pathfinding est pour une voiture (true) ou pour un piéton (false).
     * @returns {Pathfinder} L'instance de Pathfinder.
     */
    getPathfinder(isVehicle = false) {
        return isVehicle ? this.roadPathfinder : this.pedestrianPathfinder;
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
    }
}
