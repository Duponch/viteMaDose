// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import InstanceDataManager from './InstanceDataManager.js';
import InstancedMeshManager from './InstancedMeshManager.js';
import SidewalkGenerator from './SidewalkGenerator.js'; // Placeholder import
import PlotGroundGenerator from './PlotGroundGenerator.js'; // Placeholder import
import CrosswalkInstancer from './CrosswalkInstancer.js'; // Placeholder import

// Stratégies de placement
import HousePlacementStrategy from './Strategies/HousePlacementStrategy.js';
import BuildingPlacementStrategy from './Strategies/BuildingPlacementStrategy.js';
import IndustrialPlacementStrategy from './Strategies/IndustrialPlacementStrategy.js';
import SkyscraperPlacementStrategy from './Strategies/SkyscraperPlacementStrategy.js';
import ParkPlacementStrategy from './Strategies/ParkPlacementStrategy.js';
import TreePlacementStrategy from './Strategies/TreePlacementStrategy.js'; // Placeholder import

/**
 * @typedef {import('./Plot.js').default} Plot
 * @typedef {import('./CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('./CityManager.js').default} CityManager
 * @typedef {import('./HouseRenderer.js').default} HouseRenderer
 * @typedef {import('./BuildingRenderer.js').default} BuildingRenderer
 * @typedef {import('./SkyscraperRenderer.js').default} SkyscraperRenderer
 * @typedef {import('../../Experience.js').default} Experience
 */

/**
 * Orchestre la génération du contenu des parcelles (bâtiments, arbres, etc.)
 * en déléguant la logique spécifique à des stratégies et des managers dédiés.
 */
export default class PlotContentGenerator {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Matériaux partagés.
     * @param {Experience} experience - Instance de l'Experience.
     */
    constructor(config, materials, experience) {
        this.config = config;
        this.materials = materials;
        this.experience = experience; // Stocker l'expérience pour la passer

        // --- Managers Internes ---
        this.instanceDataManager = new InstanceDataManager();
        // InstancedMeshManager a besoin de beaucoup de dépendances
        this.instancedMeshManager = null; // Sera créé dans generateContent une fois les renderers disponibles

        // --- Générateurs Spécifiques ---
        this.sidewalkGenerator = new SidewalkGenerator(config, materials);
        this.plotGroundGenerator = new PlotGroundGenerator(config, materials);
        this.crosswalkInstancer = new CrosswalkInstancer(config, materials);

        // --- Stratégies (seront créées dans generateContent) ---
        this.zoneStrategies = {};
        this.treePlacementStrategy = null; // Sera créé dans generateContent

        // --- Groupes de Scène ---
        this.sidewalkGroup = new THREE.Group();
        this.sidewalkGroup.name = "Sidewalks";
        this.buildingGroup = new THREE.Group(); // Géré par InstancedMeshManager
        this.buildingGroup.name = "PlotContents";
        this.groundGroup = new THREE.Group();
        this.groundGroup.name = "PlotGrounds";

        console.log("PlotContentGenerator initialized (refactored).");
    }

    /**
     * Génère le contenu pour l'ensemble des parcelles en utilisant les stratégies et managers.
     * @param {Array<Plot>} leafPlots - Les parcelles finales à peupler.
     * @param {CityAssetLoader} assetLoader - Le chargeur d'assets.
     * @param {Array<object>} crosswalkInfos - Informations sur les passages piétons.
     * @param {CityManager} cityManager - Le gestionnaire de la ville.
     * @param {{houseRenderer: HouseRenderer, buildingRenderer: BuildingRenderer, skyscraperRenderer: SkyscraperRenderer}} renderers - Les renderers spécialisés.
     */
    generateContent(leafPlots, assetLoader, crosswalkInfos, cityManager, renderers) {
        console.log("PlotContentGenerator: Starting content generation (refactored)...");

        // --- Réinitialisation ---
        this.resetManagers(); // Réinitialise les managers internes

        // --- Initialisation des Composants Dépendants ---
        // Crée InstancedMeshManager maintenant qu'on a les renderers
         this.instancedMeshManager = new InstancedMeshManager(
            this.config,
            this.materials,
            assetLoader,
            renderers, // Passe les renderers ici
            this.buildingGroup, // Le groupe cible
            this.experience
        );

        // Crée les stratégies maintenant qu'on a assetLoader et renderers
        this.zoneStrategies = {
            'house': new HousePlacementStrategy(this.config, assetLoader, renderers, this.experience),
            'building': new BuildingPlacementStrategy(this.config, assetLoader, renderers, this.experience),
            'industrial': new IndustrialPlacementStrategy(this.config, assetLoader, renderers, this.experience),
            'skyscraper': new SkyscraperPlacementStrategy(this.config, assetLoader, renderers, this.experience),
            'park': new ParkPlacementStrategy(this.config, assetLoader, renderers, this.experience)
            // Ajouter 'unbuildable' ou une stratégie par défaut si nécessaire
        };
        this.treePlacementStrategy = new TreePlacementStrategy(this.config, assetLoader, renderers, this.experience);

        // --- Génération du Sol et des Trottoirs ---
        const generatedGroundGroup = this.plotGroundGenerator.generateGrounds(leafPlots);
        if (generatedGroundGroup) {
             this.groundGroup.add(generatedGroundGroup); // Ajouter le groupe retourné
        }
        const generatedSidewalkMesh = this.sidewalkGenerator.generateSidewalks(leafPlots);
         if (generatedSidewalkMesh) {
             this.sidewalkGroup.add(generatedSidewalkMesh); // Ajouter le mesh retourné
         }

        // --- Placement du Contenu Principal (via Stratégies) ---
        const plotGroundY = this.config.plotGroundY ?? 0.005; // Hauteur du sol des parcelles
        leafPlots.forEach((plot) => {
            // Réinitialiser les données spécifiques à la parcelle si nécessaire
             plot.buildingInstances = [];
            // plot.placedGridCells = []; // Si cette logique est réintroduite

            const strategy = this.zoneStrategies[plot.zoneType];
            if (strategy) {
                try {
                    strategy.populatePlot(plot, this.instanceDataManager, cityManager, plotGroundY);
                } catch (error) {
                     console.error(`Error executing placement strategy '${plot.zoneType}' for plot ${plot.id}:`, error);
                }
            } else if(plot.zoneType !== 'unbuildable') { // Ignorer silencieusement 'unbuildable'
                console.warn(`No placement strategy found for zone type: ${plot.zoneType} on plot ${plot.id}`);
            }
        });

        // --- Placement des Arbres ---
         try {
             this.treePlacementStrategy.placeTrees(leafPlots, assetLoader, this.instanceDataManager);
         } catch (error) {
              console.error(`Error executing TreePlacementStrategy:`, error);
         }


        // --- Ajout des Passages Piétons ---
        try {
            this.crosswalkInstancer.generateCrosswalkInstances(crosswalkInfos, this.instanceDataManager);
        } catch (error) {
             console.error(`Error executing CrosswalkInstancer:`, error);
        }

        // --- Création Finale des InstancedMesh ---
        try {
            this.instancedMeshManager.createMeshes(this.instanceDataManager.getData());
        } catch (error) {
             console.error(`Error during InstancedMesh creation:`, error);
        }

        console.log("PlotContentGenerator: Content generation finished.");
        return this.getGroups();
    }

    /**
     * Retourne les groupes de scène contenant le contenu généré.
     * @returns {{sidewalkGroup: THREE.Group, buildingGroup: THREE.Group, groundGroup: THREE.Group}}
     */
    getGroups() {
        return {
            sidewalkGroup: this.sidewalkGroup,
            buildingGroup: this.buildingGroup, // Géré par InstancedMeshManager
            groundGroup: this.groundGroup
        };
    }

    /**
     * Réinitialise les managers internes et vide les groupes de scène.
     */
    resetManagers() {
        // Réinitialiser les managers qui ont un état interne
        this.instanceDataManager?.reset();
        this.instancedMeshManager?.reset(); // InstancedMeshManager nettoie buildingGroup
        this.sidewalkGenerator?.reset();
        this.plotGroundGenerator?.reset();
        this.crosswalkInstancer?.reset();
        // Les stratégies elles-mêmes sont généralement sans état, mais on réinitialise la map
        this.zoneStrategies = {};
        this.treePlacementStrategy = null;


        // Vider les groupes (InstancedMeshManager gère buildingGroup)
        const clearGroup = (group) => {
            if (!group) return;
            while (group.children.length > 0) {
                 const child = group.children[0];
                 group.remove(child);
                 // Le nettoyage des géométries/matériaux est géré par les générateurs/managers respectifs
            }
        };
        clearGroup(this.sidewalkGroup);
        clearGroup(this.groundGroup);
        // buildingGroup est vidé par instancedMeshManager.reset()

        console.log("PlotContentGenerator reset complete.");
    }

    /**
     * Méthode de mise à jour pour les éléments gérés (ex: fenêtres).
     * Déléguée à InstancedMeshManager.
     * @param {number} currentHour - L'heure actuelle.
     */
    update(currentHour) {
        // La logique de mise à jour est maintenant dans InstancedMeshManager
        this.instancedMeshManager?.updateWindows(currentHour);
    }

    // --- Les anciennes méthodes spécifiques (generatePlotPrimaryContent, placeTreesForPlot, etc.) sont supprimées ---
}