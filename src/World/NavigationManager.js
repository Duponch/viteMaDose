// src/World/NavigationManager.js
import NavigationGraph from './NavigationGraph.js';
import RoadNavigationGraph from './RoadNavigationGraph.js';
import PedestrianNavigationGraph from './PedestrianNavigationGraph.js';
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
        
        console.log("NavigationManager: Début de la construction des graphes de navigation");
        console.log(`NavigationManager: Nombre de parcelles: ${plots.length}`);
        console.log(`NavigationManager: Nombre de passages piétons: ${crosswalkInfos.length}`);
        
        // Créer les deux grilles de navigation
        this.pedestrianNavigationGraph = new PedestrianNavigationGraph(this.config);
        this.roadNavigationGraph = new RoadNavigationGraph(this.config);
        
        // Construire les grilles
        console.log("NavigationManager: Construction du graphe piéton...");
        this.pedestrianNavigationGraph.buildGraph(plots, crosswalkInfos);
        
        console.log("NavigationManager: Construction du graphe routier...");
        this.roadNavigationGraph.buildGraph(plots, crosswalkInfos);
        
        // Vérifier que les graphes ont été correctement construits
        if (!this.pedestrianNavigationGraph || !this.roadNavigationGraph) {
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
        this.pedestrianPathfinder = new Pathfinder(this.pedestrianNavigationGraph);
        this.roadPathfinder = new Pathfinder(this.roadNavigationGraph);
        
        // Vérifier que les pathfinders ont été correctement initialisés
        if (!this.pedestrianPathfinder || !this.roadPathfinder) {
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
