// src/World/NavigationManager.js
import NavigationGraph from './NavigationGraph.js';
import Pathfinder from './Pathfinder.js';

/**
 * NavigationManager centralise la gestion du graphe de navigation et du service de pathfinding.
 * Il expose notamment la construction et la mise à jour de la grille de navigation à partir des plots générés
 * et la distribution d’un service de pathfinding aux modules nécessitant des calculs de chemin (ex. les agents).
 */
export default class NavigationManager {
    /**
     * Crée une instance de NavigationManager.
     * @param {Object} config - Configuration générale du projet (incluant notamment les paramètres de taille, trottoir, etc.).
     */
    constructor(config) {
        this.config = config;
        this.navigationGraph = null;
        this.pathfinder = null;
    }

    /**
     * Construit et met à jour le graphe de navigation.
     * @param {Array<Object>} plots - La liste des parcelles (plots) générées par le CityLayoutGenerator.
     * @param {Array<Object>} crosswalkInfos - Les informations relatives aux passages piétons.
     */
    buildGraph(plots, crosswalkInfos) {
        console.time("NavigationGraphBuilding");
        // Crée une nouvelle instance de NavigationGraph avec la configuration
        this.navigationGraph = new NavigationGraph(this.config);
        // Construit la grille de navigation à partir des plots et des informations sur les passages piétons
        this.navigationGraph.buildGraph(plots, crosswalkInfos);
        console.timeEnd("NavigationGraphBuilding");
    }

    /**
     * Initialise le service de pathfinding en créant une instance de Pathfinder basée sur le graphe de navigation actuel.
     */
    initializePathfinder() {
        if (!this.navigationGraph) {
            console.error("NavigationManager: Graphe de navigation non construit. Impossible d'initialiser le pathfinder.");
            return;
        }
        console.time("PathfinderInitialization");
        this.pathfinder = new Pathfinder(this.navigationGraph);
        console.timeEnd("PathfinderInitialization");
    }

    /**
     * Retourne l'instance actuelle du graphe de navigation.
     * @returns {NavigationGraph} Le graphe de navigation.
     */
    getNavigationGraph() {
        return this.navigationGraph;
    }

    /**
     * Retourne le service de pathfinding.
     * @returns {Pathfinder} L'instance de Pathfinder.
     */
    getPathfinder() {
        return this.pathfinder;
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
        if (this.navigationGraph) {
            this.navigationGraph.destroy();
            this.navigationGraph = null;
        }
        this.pathfinder = null;
    }
}
