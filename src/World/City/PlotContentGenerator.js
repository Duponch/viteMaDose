// src/World/City/PlotContentGenerator.js
import * as THREE from 'three';
import InstanceDataManager from '../Rendering/InstanceDataManager.js';
import InstancedMeshManager from '../Rendering/InstancedMeshManager.js';
import SidewalkGenerator from './SidewalkGenerator.js'; // Placeholder import
import PlotGroundGenerator from './PlotGroundGenerator.js'; // Placeholder import
import CrosswalkInstancer from './CrosswalkInstancer.js'; // Placeholder import
import ShaderGrassInstancer from '../Vegetation/ShaderGrassInstancer.js'; // Nouvelle implémentation d'herbe
import CommercialManager from './CommercialManager.js'; // Import du nouveau gestionnaire
import MovieTheaterManager from './MovieTheaterManager.js'; // Import du gestionnaire de cinémas

// Stratégies de placement
import HousePlacementStrategy from '../Strategies/HousePlacementStrategy.js';
import BuildingPlacementStrategy from '../Strategies/BuildingPlacementStrategy.js';
import IndustrialPlacementStrategy from '../Strategies/IndustrialPlacementStrategy.js';
import SkyscraperPlacementStrategy from '../Strategies/SkyscraperPlacementStrategy.js';
import ParkPlacementStrategy from '../Strategies/ParkPlacementStrategy.js';
import TreePlacementStrategy from '../Strategies/TreePlacementStrategy.js'; // Placeholder import
import CommercialPlacementStrategy from '../Strategies/CommercialPlacementStrategy.js'; // Nouvelle stratégie
import MovieTheaterPlacementStrategy from '../Strategies/MovieTheaterPlacementStrategy.js'; // Stratégie de cinéma

/**
 * @typedef {import('./Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('./CityManager.js').default} CityManager
 * @typedef {import('../Buildings/HouseRenderer.js').default} HouseRenderer
 * @typedef {import('../Buildings/BuildingRenderer.js').default} BuildingRenderer
 * @typedef {import('../Buildings/SkyscraperRenderer.js').default} SkyscraperRenderer
 * @typedef {import('../Buildings/CommercialRenderer.js').default} CommercialRenderer
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
        this.commercialManager = new CommercialManager(config); // Nouveau gestionnaire de commerces
        this.movieTheaterManager = new MovieTheaterManager(config); // Gestionnaire de cinémas

        // --- Générateurs Spécifiques ---
        this.sidewalkGenerator = new SidewalkGenerator(config, materials);
        this.plotGroundGenerator = new PlotGroundGenerator(config, materials);
        this.crosswalkInstancer = new CrosswalkInstancer(config, materials);
        this.grassInstancer = new ShaderGrassInstancer(config, experience);
        this.grassInstancer.setCamera(this.experience.camera.instance);

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
        this.grassGroup = new THREE.Group();
        this.grassGroup.name = "GrassInstances";

        ////console.log("PlotContentGenerator initialized (refactored).");
    }

    /**
     * Génère le contenu pour l'ensemble des parcelles en utilisant les stratégies et managers.
     * @param {Array<Plot>} leafPlots - Les parcelles finales à peupler.
     * @param {CityAssetLoader} assetLoader - Le chargeur d'assets.
     * @param {Array<object>} crosswalkInfos - Informations sur les passages piétons.
     * @param {CityManager} cityManager - Le gestionnaire de la ville.
     * @param {{houseRenderer: HouseRenderer, buildingRenderer: BuildingRenderer, skyscraperRenderer: SkyscraperRenderer, commercialRenderer: CommercialRenderer}} renderers - Les renderers spécialisés.
     */
    generateContent(leafPlots, assetLoader, crosswalkInfos, cityManager, renderers) {
        ////console.log("PlotContentGenerator: Starting content generation (refactored)...");

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
            'park': new ParkPlacementStrategy(this.config, assetLoader, renderers, this.experience),
            'commercial': new CommercialPlacementStrategy(this.config, assetLoader, renderers, this.experience),
            'movietheater': new MovieTheaterPlacementStrategy(this.config, assetLoader, renderers, this.experience)
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
         
        // --- Sélection des parcelles qui auront des commerces (1 par quartier) ---
        try {
            const districts = cityManager.getDistricts();
            this.commercialManager.selectPlotsForCommercial(districts);
        } catch (error) {
            console.error(`Error during commercial plots selection:`, error);
        }

        // --- Sélection des parcelles qui auront des cinémas (1 par quartier) ---
        try {
            const districts = cityManager.getDistricts();
            this.movieTheaterManager.selectPlotsForMovieTheater(districts);
        } catch (error) {
            console.error(`Error during movietheater plots selection:`, error);
        }

        // --- Placement du Contenu Principal (via Stratégies) ---
        const plotGroundY = this.config.plotGroundY ?? 0.005; // Hauteur du sol des parcelles
        const commercialPositions = new Map(); // Pour stocker les positions commerciales par parcelle
        const movieTheaterPositions = new Map(); // Pour stocker les positions de cinémas par parcelle
        
        leafPlots.forEach((plot) => {
            // Réinitialiser les données spécifiques à la parcelle si nécessaire
             plot.buildingInstances = [];
            // plot.placedGridCells = []; // Si cette logique est réintroduite

            const strategy = this.zoneStrategies[plot.zoneType];
            if (strategy) {
                try {
                    // Vérifier si cette parcelle doit avoir un commerce
                    const shouldHaveCommercial = this.commercialManager.shouldPlotHaveCommercial(plot);
                    
                    if (shouldHaveCommercial && (plot.zoneType === 'house' || plot.zoneType === 'building')) {
                        // Calculer la grille de disposition selon le type de parcelle
                        const gridPlacement = this._calculateGridForPlotType(plot, strategy);
                        
                        if (gridPlacement) {
                            // Placer les commerces selon la grille
                            const commercialPositionsOnPlot = this._placeCommercialsOnPlot(
                                plot, 
                                strategy, 
                                gridPlacement, 
                                this.instanceDataManager, 
                                cityManager, 
                                plotGroundY
                            );
                            
                            // Stocker les positions commerciales pour éviter la duplication
                            commercialPositions.set(plot.id, commercialPositionsOnPlot);
                        }
                    }

                    // Vérifier si cette parcelle doit avoir un cinéma
                    const shouldHaveMovieTheater = this.movieTheaterManager.shouldPlotHaveMovieTheater(plot);
                    
                    if (shouldHaveMovieTheater && (plot.zoneType === 'house' || plot.zoneType === 'building')) {
                        // Calculer la grille de disposition selon le type de parcelle
                        const gridPlacement = this._calculateGridForPlotType(plot, strategy);
                        
                        if (gridPlacement) {
                            // Placer les cinémas selon la grille
                            const movieTheaterPositionsOnPlot = this._placeMovieTheatersOnPlot(
                                plot, 
                                strategy, 
                                gridPlacement, 
                                this.instanceDataManager, 
                                cityManager, 
                                plotGroundY
                            );
                            
                            // Stocker les positions des cinémas pour éviter la duplication
                            movieTheaterPositions.set(plot.id, movieTheaterPositionsOnPlot);
                        }
                    }
                    
                    // Utiliser la stratégie normale pour placer le reste des bâtiments
                    // Si c'est une parcelle avec des commerces/cinémas, on les ignorera aux positions déjà occupées
                    this._populatePlotWithStrategy(
                        plot, 
                        strategy, 
                        [...(commercialPositions.get(plot.id) || []), ...(movieTheaterPositions.get(plot.id) || [])], 
                        this.instanceDataManager, 
                        cityManager, 
                        plotGroundY
                    );
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

        // --- Placement de l'herbe instanciée ---
        leafPlots.forEach((plot) => {
            if (plot.zoneType === 'park' || plot.zoneType === 'house') {
                const grassInstances = this.grassInstancer.createGrassInstances(plot);
                this.grassGroup.add(grassInstances);
            }
        });

        // --- Création Finale des InstancedMesh ---
        try {
            this.instancedMeshManager.createMeshes(this.instanceDataManager.getData());
        } catch (error) {
             console.error(`Error during InstancedMesh creation:`, error);
        }

        // Ajouter le groupe d'herbe à la scène
        this.experience.scene.add(this.grassGroup);

        ////console.log("PlotContentGenerator: Content generation finished.");
        return this.getGroups();
    }
    
    /**
     * Calcule la grille de disposition pour un type de parcelle donné.
     * @param {Plot} plot - La parcelle.
     * @param {IZonePlacementStrategy} strategy - La stratégie de placement.
     * @returns {object} Informations sur la grille (numItemsX, numItemsY, gapX, gapZ).
     * @private
     */
    _calculateGridForPlotType(plot, strategy) {
        let targetWidth, targetDepth, minSpacing;
        
        if (plot.zoneType === 'house') {
            const baseScaleFactor = this.config.gridHouseBaseScale ?? 1.5;
            targetWidth = 2.0 * baseScaleFactor;
            targetDepth = 2.0 * baseScaleFactor;
            minSpacing = this.config.minHouseSpacing ?? 0;
        } else if (plot.zoneType === 'building') {
            const baseScaleFactor = this.config.gridBuildingBaseScale ?? 1.0;
            // Utiliser un asset représentatif pour la taille
            const assetLoader = strategy.assetLoader;
            const representativeAsset = assetLoader.getAssetDataById(assetLoader.assets.building[0]?.id);
            if (!representativeAsset || !representativeAsset.sizeAfterFitting) {
                return null;
            }
            targetWidth = representativeAsset.sizeAfterFitting.x * baseScaleFactor;
            targetDepth = representativeAsset.sizeAfterFitting.z * baseScaleFactor;
            minSpacing = this.config.minBuildingSpacing ?? 0;
        } else {
            return null; // Type non pris en charge
        }
        
        // Calculer la grille en utilisant la méthode de la stratégie
        return strategy.calculateGridPlacement(plot, targetWidth, targetDepth, minSpacing);
    }
    
    /**
     * Place des commerces sur une parcelle selon la grille.
     * @param {Plot} plot - La parcelle.
     * @param {IZonePlacementStrategy} strategy - La stratégie de placement.
     * @param {object} gridPlacement - Informations sur la grille.
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des données d'instance.
     * @param {CityManager} cityManager - Gestionnaire de la ville.
     * @param {number} groundLevel - Hauteur du sol.
     * @returns {Array<{x: number, y: number}>} - Positions des commerces placés.
     * @private
     */
    _placeCommercialsOnPlot(plot, strategy, gridPlacement, instanceDataManager, cityManager, groundLevel) {
        // Déterminer la taille des bâtiments selon le type de parcelle
        let targetWidth, targetDepth, minSpacing;
        
        if (plot.zoneType === 'house') {
            const baseScaleFactor = this.config.gridHouseBaseScale ?? 1.5;
            targetWidth = 2.0 * baseScaleFactor;
            targetDepth = 2.0 * baseScaleFactor;
            minSpacing = this.config.minHouseSpacing ?? 0;
        } else if (plot.zoneType === 'building') {
            const baseScaleFactor = this.config.gridBuildingBaseScale ?? 1.0;
            const assetLoader = strategy.assetLoader;
            const representativeAsset = assetLoader.getAssetDataById(assetLoader.assets.building[0]?.id);
            if (!representativeAsset || !representativeAsset.sizeAfterFitting) {
                return [];
            }
            targetWidth = representativeAsset.sizeAfterFitting.x * baseScaleFactor;
            targetDepth = representativeAsset.sizeAfterFitting.z * baseScaleFactor;
            minSpacing = this.config.minBuildingSpacing ?? 0;
        } else {
            return []; // Type non pris en charge
        }
        
        // Récupérer la stratégie commerciale pour l'orientation et les flèches
        const commercialStrategy = this.zoneStrategies['commercial'];
        
        // Utiliser CommercialManager pour placer les commerces
        return this.commercialManager.placeCommercialsOnGrid(
            plot,
            gridPlacement,
            targetWidth,
            targetDepth,
            minSpacing,
            instanceDataManager,
            cityManager,
            groundLevel,
            commercialStrategy // Passer la stratégie commerciale
        );
    }

    /**
     * Place des cinémas sur une parcelle selon la grille.
     * @param {Plot} plot - La parcelle.
     * @param {IZonePlacementStrategy} strategy - La stratégie de placement.
     * @param {object} gridPlacement - Informations sur la grille.
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des données d'instance.
     * @param {CityManager} cityManager - Gestionnaire de la ville.
     * @param {number} groundLevel - Hauteur du sol.
     * @returns {Array<{x: number, y: number}>} - Positions des cinémas placés.
     * @private
     */
    _placeMovieTheatersOnPlot(plot, strategy, gridPlacement, instanceDataManager, cityManager, groundLevel) {
        // Déterminer la taille des bâtiments selon le type de parcelle
        let targetWidth, targetDepth, minSpacing;
        
        if (plot.zoneType === 'house') {
            const baseScaleFactor = this.config.gridHouseBaseScale ?? 1.5;
            targetWidth = 2.5 * baseScaleFactor; // Légèrement plus grand que les commerces
            targetDepth = 2.5 * baseScaleFactor;
            minSpacing = this.config.minHouseSpacing ?? 0;
        } else if (plot.zoneType === 'building') {
            const baseScaleFactor = this.config.gridBuildingBaseScale ?? 1.0;
            const assetLoader = strategy.assetLoader;
            const representativeAsset = assetLoader.getAssetDataById(assetLoader.assets.building[0]?.id);
            if (!representativeAsset || !representativeAsset.sizeAfterFitting) {
                return [];
            }
            targetWidth = representativeAsset.sizeAfterFitting.x * baseScaleFactor * 1.2; // Légèrement plus grand
            targetDepth = representativeAsset.sizeAfterFitting.z * baseScaleFactor * 1.2;
            minSpacing = this.config.minBuildingSpacing ?? 0;
        } else {
            return []; // Type non pris en charge
        }
        
        // Récupérer la stratégie de cinéma pour l'orientation et les flèches
        const movieTheaterStrategy = this.zoneStrategies['movietheater'];
        
        // Utiliser MovieTheaterManager pour placer les cinémas
        return this.movieTheaterManager.placeMovieTheaterOnGrid(
            plot,
            gridPlacement,
            targetWidth,
            targetDepth,
            minSpacing,
            instanceDataManager,
            cityManager,
            groundLevel,
            movieTheaterStrategy // Passer la stratégie de cinéma
        );
    }

    /**
     * Peuple une parcelle en utilisant une stratégie, en évitant les positions occupées par des commerces.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {IZonePlacementStrategy} strategy - La stratégie de placement.
     * @param {Array<{x: number, y: number}>} commercialPositions - Positions occupées par des commerces.
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des données d'instance.
     * @param {CityManager} cityManager - Gestionnaire de la ville.
     * @param {number} groundLevel - Hauteur du sol.
     * @private
     */
    _populatePlotWithStrategy(plot, strategy, commercialPositions, instanceDataManager, cityManager, groundLevel) {
        // Si aucun commerce n'a été placé, utiliser la stratégie normalement
        if (commercialPositions.length === 0) {
            strategy.populatePlot(plot, instanceDataManager, cityManager, groundLevel);
            return;
        }
        
        // On simule le comportement de la stratégie originale, mais en évitant les positions occupées
        // Note: Cette implémentation utilise une approche différente qui dépend du type de la stratégie
        // On pourrait avoir une implémentation plus générique si nécessaire
        
        // Pour l'instant, on passe les positions commerciales à la stratégie (qui les ignorera)
        // Cette partie devrait être adaptée selon les besoins exacts
        plot.commercialPositions = commercialPositions;
        strategy.populatePlot(plot, instanceDataManager, cityManager, groundLevel);
        delete plot.commercialPositions;
    }

    /**
     * Active ou désactive les helpers visuels pour les façades des bâtiments.
     * Si aucun paramètre n'est fourni, bascule l'état de visibilité actuel.
     * @param {boolean} [isVisible=null] - État de visibilité souhaité (null pour basculer)
     */
    toggleBuildingFacadeHelpers(isVisible = null) {
        // Si la stratégie de placement des bâtiments a un helper de façade, l'utiliser
        if (this.zoneStrategies && this.zoneStrategies['building'] && this.zoneStrategies['building'].facadeHelper) {
            this.zoneStrategies['building'].facadeHelper.toggleVisibility(isVisible);
        }
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
        this.grassInstancer?.reset();
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

        ////console.log("PlotContentGenerator reset complete.");
    }

    /**
     * Méthode de mise à jour pour les éléments gérés (ex: fenêtres).
     * Déléguée à InstancedMeshManager.
     * @param {number} currentHour - L'heure actuelle.
     */
    update(currentHour) {
        // Mise à jour des fenêtres
        this.instancedMeshManager?.updateWindows(currentHour);
        // Mise à jour de l'animation de balancement des arbres
        const meshes = this.instancedMeshManager?.instancedMeshes;
        if (meshes) {
            const timeSec = this.experience.time.elapsed * 0.001;
            Object.values(meshes).forEach(mesh => {
                const shader = mesh.userData.shader;
                if (shader?.uniforms?.uTime) {
                    shader.uniforms.uTime.value = timeSec;
                }
            });
        }
        // Mettre à jour l'animation de l'herbe
        this.grassInstancer?.update();
    }

    /**
     * Définit la force du vent pour l'animation de l'herbe
     * @param {number} strength - Force du vent (0-5, 0 étant pas de vent, 5 étant un vent très fort)
     */
    setWindStrength(strength) {
        if (this.grassInstancer) {
            this.grassInstancer.setWindStrength(strength);
        }
    }

    /**
     * Définit la direction du vent pour l'animation de l'herbe
     * @param {THREE.Vector2|Array|number} direction - Direction du vent (Vector2, tableau [x,y] ou angle en radians)
     */
    setWindDirection(direction) {
        if (this.grassInstancer) {
            this.grassInstancer.setWindDirection(direction);
        }
    }
    
    /**
     * Définit la force d'inclinaison statique de l'herbe
     * @param {number} strength - Force d'inclinaison (0-1.5)
     */
    setGrassBendStrength(strength) {
        if (this.grassInstancer) {
            this.grassInstancer.setGrassBendStrength(strength);
        }
    }
    
    /**
     * Définit la force d'inclinaison globale de l'herbe (rotation sans courbure)
     * @param {number} strength - Force d'inclinaison globale (0-1)
     */
    setGrassInclinationStrength(strength) {
        if (this.grassInstancer) {
            this.grassInstancer.setGrassInclinationStrength(strength);
        }
    }
    
    /**
     * Définit la direction de l'inclinaison globale de l'herbe
     * @param {THREE.Vector2|Array|number} direction - Direction d'inclinaison (Vector2, tableau [x,y] ou angle en radians)
     */
    setGrassInclinationDirection(direction) {
        if (this.grassInstancer) {
            this.grassInstancer.setGrassInclinationDirection(direction);
        }
    }
    
    /**
     * Définit le facteur de torsion du brin d'herbe
     * @param {number} factor - Facteur de torsion (0.1-2.0)
     */
    setGrassTwistFactor(factor) {
        if (this.grassInstancer) {
            this.grassInstancer.setTwistFactor(factor);
        }
    }
    
    /**
     * Définit le facteur d'inclinaison du brin d'herbe
     * @param {number} factor - Facteur d'inclinaison (0.1-2.0)
     */
    setGrassInclinationFactor(factor) {
        if (this.grassInstancer) {
            this.grassInstancer.setInclinationFactor(factor);
        }
    }
    
    /**
     * Définit la vitesse d'animation de l'herbe sous l'effet du vent
     * @param {number} speed - Vitesse de l'animation (0.1-2.0)
     */
    setGrassAnimationSpeed(speed) {
        if (this.grassInstancer) {
            this.grassInstancer.setAnimationSpeed(speed);
        }
    }
    
    /**
     * Définit l'amplitude de l'animation de l'herbe sous l'effet du vent
     * @param {number} amplitude - Amplitude de l'animation (0.1-2.0)
     */
    setGrassAnimationAmplitude(amplitude) {
        if (this.grassInstancer) {
            this.grassInstancer.setAnimationAmplitude(amplitude);
        }
    }

    // --- Les anciennes méthodes spécifiques (generatePlotPrimaryContent, placeTreesForPlot, etc.) sont supprimées ---
}