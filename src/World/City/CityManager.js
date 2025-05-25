// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
// Import du PlotContentGenerator refactoré
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from '../Rendering/CityAssetLoader.js';
import DistrictManager from './DistrictManager.js';
import LampPostManager from './LampPostManager.js';
import NavigationManager from '../Navigation/NavigationManager.js'; // Utilisation de NavigationManager
import CitizenManager from './CitizenManager.js';
import DebugVisualManager from '../Rendering/DebugVisualManager.js';
// Renderer spécialisés sont nécessaires pour PlotContentGenerator via Experience/World
import HouseRenderer from '../Buildings/HouseRenderer.js';
import BuildingRenderer from '../Buildings/BuildingRenderer.js';
import SkyscraperRenderer from '../Buildings/SkyscraperRenderer.js';
import CommercialRenderer from '../Buildings/CommercialRenderer.js';
import NewHouseRenderer from '../Buildings/NewHouseRenderer.js';
import CityMapVisualizer from '../Rendering/CityMapVisualizer.js';
import MayorMoney from './MayorMoney.js';


export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration initiale ---
        this.config = {
            // Map & Layout
            mapSize: 800,
            roadWidth: 10,
            minPlotSize: 30,
            maxPlotSize: 60,
            maxRecursionDepth: 7,
            parkProbability: 0.05,
            industrialZoneProbability: 0.15,
            houseZoneProbability: 0.40,
            skyscraperZoneProbability: 0.10,
            // Grid
            gridScale: 1,
            // Crosswalks
            crosswalkWidth: 0.1,
            crosswalkHeight: 0.03,
            crosswalkStripeCount: 6,
            crosswalkStripeWidth: 0.4,
            crosswalkStripeGap: 0.4,
            // Districts
            minDistrictSize: 5,
            maxDistrictSize: 10,
            forceBusinessMaxDistance: 0.15,
            districtProbabilities: {
                business: { max: 0.15, decay: 10 },
                industrial: { base: 0.01, threshold: 0.85, factor: 5, multiplier: 0.2 },
                residential: { base: 0.8, peakCenter: 0.5, peakWidth: 0.2 }
            },
            validationZoneCenterMaxDist: 0.20,
            validationZoneEdgeMinDist: 0.80,
            minBusinessInCenter: 1,
            minIndustrialInEdge: 1,
            strictMinIndustrialDist: 0.35,
            strictMaxBusinessDist: 0.60,
            minTotalIndustrialDistricts: 1,
            maxTotalIndustrialDistricts: 5,
            minTotalBusinessDistricts: 1,
            maxTotalBusinessDistricts: 4,
            maxDistrictRegenAttempts: 15,
            // Plot Content
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            plotGroundY: 0.2, // Ajout pour uniformiser
            // Espacements Minimum
            minHouseSpacing: 5.0,
            minBuildingSpacing: 3.0,
            minIndustrialSpacing: 3.0,
            minSkyscraperSpacing: 4.0,
            minParkSpacing: 2.0,
            // Échelles de Base
            gridHouseBaseScale: 6.5,
            gridBuildingBaseScale: 1,
            gridIndustrialBaseScale: 1.2,
            gridSkyscraperBaseScale: 1.7,
            gridParkBaseScale: 1.0, // Ajout pour parcs
            movieTheaterBaseScale: 1.8, // Ajout pour cinémas
            // Assets (Simplifié - les détails restent dans la config passée)
            houseModelDir: "Assets/Models/Houses/",
            houseModelFiles: [ { file: "House1.fbx", scale: 1.3 }, { file: "House24.fbx", scale: 1.3 } ],
            houseBaseWidth: 8,
            houseBaseHeight: 7,
            houseBaseDepth: 8,
            buildingModelDir: "Assets/Models/Buildings/",
            buildingModelFiles: [ { file: "Building1.fbx", scale: 0.8 }, { file: "Building10.glb", scale: 0.8 } ],
            buildingBaseWidth: 10,
            buildingBaseHeight: 20,
            buildingBaseDepth: 10,
            industrialModelDir: "Assets/Models/Industrials/",
            industrialModelFiles: [ { file: "Factory1_glb.glb", scale: 1 }, { file: "Factory2_glb.glb", scale: 1 }, { file: "Factory3_glb.glb", scale: 1 } ],
            industrialBaseWidth: 18,
            industrialBaseHeight: 12,
            industrialBaseDepth: 25,
            parkModelDir: "Assets/Models/Parks/",
            parkModelFiles: [ { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 }, { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 } ],
            parkBaseWidth: 15, // Utilisé pour le calcul de grille
            parkBaseHeight: 3,
            parkBaseDepth: 15, // Utilisé pour le calcul de grille
            minParkElements: 1, // Ajout config parc
            maxParkElements: 5, // Ajout config parc
            treeModelDir: "Assets/Models/Trees/",
            treeModelFiles: [{ file: "Tree2.glb", scale: 0.9 }, { file: "Tree3.glb", scale: 0.9 }, { file: "Tree4.glb", scale: 0.9 }, { file: "Tree5.glb", scale: 0.9 }, { file: "Tree6.glb", scale: 0.9 } ],
            treeBaseWidth: 4,
            treeBaseHeight: 8,
            treeBaseDepth: 4,
            skyscraperModelDir: "Assets/Models/Skyscrapers/",
            skyscraperModelFiles: [ { file: "Skyscraper1.glb", scale: 0.8 }, { file: "Skyscraper2.glb", scale: 1 }, { file: "Skyscraper3.glb", scale: 1 } ],
            skyscraperBaseWidth: 15,
            skyscraperBaseHeight: 80,
            skyscraperBaseDepth: 15,
            // Placement d'arbres
            treePlacementProbabilitySidewalk: 0.3,
            treePlacementProbabilityPark: 0.04,
            // Debug
            debug: {
                showDistrictBoundaries: false, // Gardé de l'ancienne config
                // Facteurs de réduction pour la taille des cubes de debug des bâtiments
                houseScaleReduction: 0.4,       // Maison debug = 80% de la taille calculée
                buildingScaleReduction: 0.8,    // Immeuble debug = 70%
                industrialScaleReduction: 0.4,  // Industriel debug = 60%
                skyscraperScaleReduction: 1.01   // Gratte-ciel debug = 50%
            },
            // Time
            dayNightCycleEnabled: true,
            dayDurationMinutes: 20,
            startTimeOfDay: 0.25,
            // Agents
            agentScale: 0.1,
            agentYOffset: 0.35,
            agentRotationSpeed: 20,
            agentWalkSpeed: 8,
			carSpeed: 20.0,
            agentBobAmplitude: 0.25,
            agentStepLength: 1.5,
            agentStepHeight: 0.9,
            agentSwingAmplitude: 1.5,
            agentAnkleRotationAmplitude: Math.PI / 6,
            agentHandTiltAmplitude: 0.3,
            agentHeadNodAmplitude: 0.08,
            agentHeadYawAmplitude: 0.15,
            agentHeadTiltAmplitude: 0.12,
            agentHeadBobAmplitude: 0.1,
            agentAnimationSpeedFactor: 6,
            agentLodDistance: 50, // Augmenter la distance à laquelle le LOD est activé pour les agents
            maxAgents: 500,
            // Capacités par défaut
            maxCitizensPerHouse: 5,
            maxCitizensPerBuilding: 10,
            maxWorkersPerSkyscraper: 100,
            maxWorkersPerIndustrial: 50,
            // Lampadaires
            lampPostSpacing: 20, // Ajout config lampadaire
            lampPostLightConeRadiusBottom: 5.0,
            lampPostLightConeOpacity: 0.0023,
            lampPostLightConeColor: 0xFFFF99,
            // Herbe avec shader
            grassInstanceCount: 50000, // Nombre d'instances d'herbe par parcelle
            grassWindStrength: 0.8,   // Force du vent dans l'animation de l'herbe
            grassShadowDensity: 0.7   // Densité des ombres sur l'herbe
        };

        // Fusion de configuration externe
        const deepMerge = (target, source) => {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (source[key] instanceof Object && !(source[key] instanceof THREE.Color) && !(source[key] instanceof THREE.Vector3) &&
                        key in target && target[key] instanceof Object && !(target[key] instanceof THREE.Color) && !(target[key] instanceof THREE.Vector3)) {
                        deepMerge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
            return target;
        };
        deepMerge(this.config, config);

        // --- Matériaux ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x272442, metalness: 0.1, roughness: 0.8 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.8 }),
            crosswalkMaterial: new THREE.MeshStandardMaterial({ color: 0xE0E0E0, roughness: 0.7, metalness: 0.1 }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            houseGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x676d70 }),
            industrialGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x676d70 }),
            skyscraperGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x708090 }),
            debugResidentialMat: new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugIndustrialMat: new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugBusinessMat: new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugDefaultMat: new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
            // debugPlotGridMaterial: new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, side: THREE.DoubleSide }), // Déplacé potentiellement
            debugParkOutlineMaterial: new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 2, // Note: linewidth > 1 non garanti sur toutes les plateformes
                depthTest: false
            }),
            lampLightConeMaterial: new THREE.MeshBasicMaterial({
                color: this.config.lampPostLightConeColor,
                transparent: true,
                opacity: this.config.lampPostLightConeOpacity,
                side: THREE.DoubleSide,
                depthWrite: false // Important pour le rendu correct des cônes transparents
            })
        };

        // --- Composants ---
        this.assetLoader = new CityAssetLoader(this.config, this.materials, this.experience);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        // Instanciation du PlotContentGenerator refactoré
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials, this.experience);

        // --- Renderers Spécialisés ---
        // Créés ici pour être passés à PlotContentGenerator lors de la génération
        this.houseRenderer = new HouseRenderer(this.config, this.materials);
        this.newHouseRenderer = new NewHouseRenderer(this.config, this.materials, this.experience.renderer.instance);
        this.buildingRenderer = new BuildingRenderer(this.config, this.materials);
        this.skyscraperRenderer = new SkyscraperRenderer(this.config, this.materials);
        this.commercialRenderer = new CommercialRenderer(this.config, this.materials);
        this.movieTheaterRenderer = this.assetLoader.movieTheaterRenderer; // Utiliser celui du CityAssetLoader
        this.renderers = {
            houseRenderer: this.houseRenderer,
            newHouseRenderer: this.newHouseRenderer,
            buildingRenderer: this.buildingRenderer,
            skyscraperRenderer: this.skyscraperRenderer,
            commercialRenderer: this.commercialRenderer,
            movieTheaterRenderer: this.movieTheaterRenderer
        };

        // --- Navigation via NavigationManager ---
        this.navigationManager = new NavigationManager(this.config);
        this.navigationGraph = null; // Sera initialisé via NavigationManager
        this.pathfinder = null;       // Sera initialisé via NavigationManager

        this.districts = [];
        this.leafPlots = [];

        // --- Groupes de scène ---
        this.cityContainer = new THREE.Group();
        this.cityContainer.name = "CityContainer";
        // Les groupes spécifiques (road, sidewalk, content, ground) seront ajoutés par les managers/générateurs
        this.roadGroup = null;      // Géré par RoadNetworkGenerator
        this.sidewalkGroup = this.contentGenerator.sidewalkGroup; // Accès au groupe de PlotContentGenerator
        this.contentGroup = this.contentGenerator.buildingGroup; // Accès au groupe de PlotContentGenerator
        this.groundGroup = this.contentGenerator.groundGroup;   // Accès au groupe de PlotContentGenerator
        this.cityContainer.add(this.sidewalkGroup, this.contentGroup, this.groundGroup);

        // --- Instance de DebugVisualManager ---
        // Créé ici pour pouvoir être utilisé par DistrictManager
		this.debugVisualManager = new DebugVisualManager(
            null,
            this.materials,
            this.experience.sizes,
            this.config
        );
        if (this.experience.isDebugMode || this.config.showDistrictBoundaries) {
            this.cityContainer.add(this.debugVisualManager.parentGroup);
        }

        // --- CitizenManager ---
        // Passe la config pour les capacités des bâtiments
        this.citizenManager = new CitizenManager(this.config);

        // Passage de experience à CitizenManager pour initialiser le système de santé
        this.citizenManager.initializeHealthSystem(experience);

        // --- Gestionnaire des règles de placement spéciales ---
        this.specialPlacementRules = {
            movietheater: {
                maxTotal: 3,
                maxPerDistrict: 1,
                allowedZoneTypes: ['building'],
                selectedPlots: new Set()
            }
        };

        // --- LampPostManager ---
        // Passe le cityContainer où ajouter les lampadaires
        this.lampPostManager = new LampPostManager(this.config, this.materials, this.cityContainer);

        // Ajout du conteneur principal à la scène
        this.scene.add(this.cityContainer);

        this.cityMapVisualizer = null;

        this.mayorMoney = new MayorMoney();

        ////////console.log("CityManager initialized.");
    }

    // --- Délégation vers CitizenManager ---
    registerBuildingInstance(plotId, assetType, position, capacityOverride = null) {
        return this.citizenManager.registerBuildingInstance(plotId, assetType, position, capacityOverride);
    }

    registerCitizen(citizenId, agentLogic) {
        return this.citizenManager.registerCitizen(citizenId, agentLogic);
    }

    assignHomeToCitizen(citizenId) {
        return this.citizenManager.assignHomeToCitizen(citizenId);
    }

    assignWorkplaceToCitizen(citizenId) {
        return this.citizenManager.assignWorkplaceToCitizen(citizenId);
    }

    getBuildingInfo(buildingInstanceId) {
        return this.citizenManager.getBuildingInfo(buildingInstanceId);
    }

    getCitizenInfo(citizenId) {
        return this.citizenManager.getCitizenInfo(citizenId);
    }

    /**
     * Récupère toutes les instances de bâtiments correspondant aux types spécifiés.
     * @param {Array<string>} types - Un tableau de types de bâtiments à rechercher.
     * @returns {Array<object>} Un tableau contenant les objets d'information des bâtiments correspondants.
     */
    getBuildingsByType(types) {
        return this.citizenManager.getBuildingsByType(types);
    }
    // --- Fin délégation ---

    async generateCity() {
        //console.time("CityGeneration");
        this.clearCity(); // Efface la ville précédente
        try {
            //console.log("--- Starting city generation ---");
            this.createGlobalGround(); // Crée le sol global

            //console.time("AssetLoading");
            await this.assetLoader.loadAssets(); // Charge tous les modèles 3D
            //console.timeEnd("AssetLoading");
            this.logLoadedAssets();

            //console.time("LayoutGeneration");
            this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize); // Génère les parcelles
            //console.timeEnd("LayoutGeneration");
            //console.log(`Layout generated with ${this.leafPlots.length} plots.`);
            this.logInitialZoneTypes(); // Log les types initiaux des parcelles
            if (!this.leafPlots || this.leafPlots.length === 0)
                throw new Error("Layout produced no plots.");

            // --- District Logic via DistrictManager ---
            //console.time("DistrictFormationAndValidation");
            try {
                // Crée et utilise DistrictManager pour former et valider les quartiers
                const districtManager = new DistrictManager(this.config, this.leafPlots, this.debugVisualManager.parentGroup);
                districtManager.generateAndValidateDistricts(); // Génère, valide et ajuste les types de parcelles
                this.districts = districtManager.getDistricts(); // Récupère les districts formés
            } catch (error) {
                console.error("Error during district formation:", error);
                throw error; // Arrête la génération si les districts sont invalides
            }
            //console.timeEnd("DistrictFormationAndValidation");

            // assignDefaultTypeToUnassigned est maintenant appelé DANS generateAndValidateDistricts
            // this.assignDefaultTypeToUnassigned(); // S'assure que toutes les parcelles ont un type
            // this.logAdjustedZoneTypes(); // Déjà loggué par DistrictManager
            
            // Initialiser le visualiseur de carte APRÈS la génération des districts
            this.cityMapVisualizer = new CityMapVisualizer(this.config, this.leafPlots);
            this.cityMapVisualizer.setContainer(document.body);
            this.cityMapVisualizer.setExperience(this.experience);

            //console.time("RoadAndCrosswalkInfoGeneration");
            // Génère le réseau routier et les infos pour les passages piétons
            const { roadGroup, crosswalkInfos } = this.roadGenerator.generateRoads(this.leafPlots);
            this.roadGroup = roadGroup; // Stocke le groupe contenant les routes
            this.cityContainer.add(this.roadGroup); // Ajoute les routes à la scène
            //console.timeEnd("RoadAndCrosswalkInfoGeneration");
            //console.log(`Road network generated and ${crosswalkInfos.length} crosswalk locations identified.`);

            // --- NavigationManager ---
            if (!this.navigationManager) {
                this.navigationManager = new NavigationManager(this.config);
            }
            //console.time("NavigationGraphBuilding");
            this.navigationManager.buildGraph(this.leafPlots, crosswalkInfos); // Construit le graphe de navigation
            //console.timeEnd("NavigationGraphBuilding");

            //console.time("PathfinderInitialization");
            this.navigationManager.initializePathfinder(); // Initialise le service de pathfinding
            //console.timeEnd("PathfinderInitialization");

            // Vérifier que les deux types de navigation sont disponibles
            const pedestrianGraph = this.navigationManager.getNavigationGraph(false);
            const vehicleGraph = this.navigationManager.getNavigationGraph(true);
            const pedestrianPathfinder = this.navigationManager.getPathfinder(false);
            const vehiclePathfinder = this.navigationManager.getPathfinder(true);

            if (!pedestrianGraph || !vehicleGraph || !pedestrianPathfinder || !vehiclePathfinder) {
                console.error("CityManager: Échec de l'initialisation des graphes de navigation ou des pathfinders.");
                return;
            }

            //console.log("CityManager: NavigationManager initialisé avec succès (piéton et véhicule)");
            this.navigationGraph = pedestrianGraph; // Pour compatibilité avec le code existant
            this.pathfinder = pedestrianPathfinder; // Pour compatibilité avec le code existant

            // --- POINT D'EXTENSION VOITURES ---
            // Toute activation/configuration de voitures DOIT se faire après cette étape !
            if (!vehicleGraph) {
                console.error("[CityManager] Le graphe routier n'est pas prêt : impossible d'activer/configurer les voitures.");
            } else {
                //console.log("[CityManager] Placez ici la logique d'activation/configuration des voitures. Le graphe routier est prêt.");
                // Exemple :
                // if (this.carManager) this.carManager.activateAllCars();
                // ou toute autre logique de spawn/configuration de voitures
            }

            // --- Sélection des parcelles pour les bâtiments spéciaux ---
            this.selectPlotsForSpecialBuilding('movietheater');

            //console.time("ContentGeneration");
            // Appel à PlotContentGenerator refactoré
            const { sidewalkGroup, buildingGroup, groundGroup } = this.contentGenerator.generateContent(
                this.leafPlots,
                this.assetLoader,
                crosswalkInfos,
                this, // Passe CityManager (pour enregistrement bâtiments)
                this.renderers // Passe les renderers spécialisés
            );
            // Les groupes sont déjà gérés par PlotContentGenerator ou ajoutés ici
            //console.timeEnd("ContentGeneration");

            //console.log(`Total Building Instances Registered: ${this.citizenManager.buildingInstances.size}`);

            // --- Lamp Post Generation via LampPostManager ---
            //console.time("LampPostGeneration");
            this.lampPostManager.addLampPosts(this.leafPlots); // Ajoute les lampadaires
            //console.timeEnd("LampPostGeneration");

            // --- Debug Visuals via DebugVisualManager ---
            if (this.experience.isDebugMode) {
                //console.time("DebugVisualsUpdate");
                if (!this.debugVisualManager.parentGroup.parent) {
                    this.cityContainer.add(this.debugVisualManager.parentGroup);
                }
                this.debugVisualManager.createParkOutlines(this.leafPlots, 0.3); // Ajuster la hauteur si besoin
                 if(this.config.showDistrictBoundaries) {
                    this.debugVisualManager.createDistrictBoundaries(this.districts);
                }
                //console.timeEnd("DebugVisualsUpdate");
            } else {
                this.debugVisualManager.clearDebugVisuals(); // Nettoie tous les visuels de debug
                if (this.debugVisualManager.parentGroup.parent) {
                    this.cityContainer.remove(this.debugVisualManager.parentGroup); // Retire le groupe de debug
                }
            }
            //console.log("--- City generation finished ---");
        } catch (error) {
            console.error("Major error during city generation:", error);
            this.clearCity(); // Tente de nettoyer en cas d'erreur majeure
        } finally {
            //console.timeEnd("CityGeneration"); // Fin du chronomètre global
        }
    }

    createGlobalGround() {
        if (this.groundMesh && this.groundMesh.parent) return;
        if (this.groundMesh && !this.groundMesh.parent) {
            this.scene.add(this.groundMesh);
            return;
        }
        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = -0.01;
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "CityGround";
        this.scene.add(this.groundMesh);
        //console.log(`CityGround created: ${this.config.mapSize}x${this.config.mapSize}`);
    }

    clearCity() {
        //console.log("Clearing the existing city...");
        // Nettoyage Debug
        if (this.debugVisualManager) {
            this.debugVisualManager.clearDebugVisuals();
        }

        // Nettoyage Groupes de Scène Directs
        if (this.roadGroup && this.roadGroup.parent) this.cityContainer.remove(this.roadGroup);
        // Les autres groupes (sidewalk, content, ground) sont gérés par contentGenerator

        // Nettoyage Lampadaires via leur Manager
        if (this.lampPostManager && this.lampPostManager.lampPostMeshes) {
            if (this.lampPostManager.lampPostMeshes.grey?.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.grey);
            if (this.lampPostManager.lampPostMeshes.light?.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.light);
            if (this.lampPostManager.lampPostMeshes.lightCone?.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.lightCone);
            // On ne dispose pas les géométries/matériaux ici, LampPostManager s'en chargera si nécessaire
            this.lampPostManager.lampPostMeshes = { grey: null, light: null, lightCone: null };
        }

        // Nettoyage Sol Global
        if (this.groundMesh && this.groundMesh.parent) this.scene.remove(this.groundMesh);
        this.groundMesh?.geometry?.dispose(); // Dispose seulement si elle existe
        this.groundMesh = null;

        // Réinitialisation des Générateurs et Managers
        this.roadGenerator?.reset();
        // --- MODIFICATION ICI ---
        // Appel de la méthode correcte pour PlotContentGenerator
        this.contentGenerator?.resetManagers(); // Utilise resetManagers au lieu de reset
        // ------------------------
        this.layoutGenerator?.reset();
        this.navigationManager?.destroy(); // NavigationManager gère son propre nettoyage
        this.navigationManager = null;     // Recréé au besoin
        this.navigationGraph = null;
        this.pathfinder = null;
        this.citizenManager?.reset(); // Assumer ou ajouter une méthode reset à CitizenManager

        // Réinitialisation des données internes
        this.leafPlots = [];
        this.districts = [];
        this.roadGroup = null;
        // Les autres groupes sont réinitialisés via contentGenerator.resetManagers()
        
        if (this.cityMapVisualizer) {
            this.cityMapVisualizer.hide();
            this.cityMapVisualizer = null;
        }

        //console.log("City cleared.");
    }

    // Reset ajouté à CitizenManager pour nettoyer les données
    // (doit être implémenté dans CitizenManager.js)
    // CitizenManager.prototype.reset = function() {
    //     this.buildingInstances.clear();
    //     this.citizens.clear();
    //     this.nextBuildingInstanceId = 0;
    //     //console.log("CitizenManager reset.");
    // };


    destroy() {
        ////////console.log("Destroying CityManager...");
        this.clearCity(); // Appelle le nettoyage

        // Dispose Materials (ceux créés DANS CityManager)
        Object.values(this.materials).forEach(material => {
            material?.dispose?.();
        });
        this.materials = {};

        // Dispose Renderers spécialisés
        this.houseRenderer?.reset(); // Utiliser reset ou une méthode destroy si ajoutée
        this.newHouseRenderer?.reset();
        this.buildingRenderer?.reset();
        this.skyscraperRenderer?.reset();
        this.commercialRenderer?.reset();
        this.movieTheaterRenderer?.destroy?.(); // Dispose du MovieTheaterRenderer
        // Idéalement, les renderers devraient avoir une méthode destroy qui dispose leurs géométries/matériaux de base

         // Dispose LampPostManager (qui devrait disposer ses propres géométries)
        if (this.lampPostManager?.lampPostConeGeometry) {
             this.lampPostManager.lampPostConeGeometry.dispose();
        }
        // Ajouter une méthode destroy à LampPostManager si nécessaire pour plus de propreté

        // Dispose Asset Loader (qui dispose les assets chargés)
        this.assetLoader?.disposeAssets();

        // Retire le conteneur principal
        if (this.cityContainer?.parent) {
            this.cityContainer.parent.remove(this.cityContainer);
        }

        // Nullifie les références
        this.cityContainer = null;
        this.experience = null;
        this.scene = null;
        this.assetLoader = null;
        this.layoutGenerator = null;
        this.roadGenerator = null;
        this.contentGenerator = null; // Contient les références aux groupes internes
        this.navigationManager = null;
        this.navigationGraph = null;
        this.pathfinder = null;
        this.citizenManager = null;
        this.lampPostManager = null;
        this.debugVisualManager = null; // Supposant qu'il n'a pas de ressources lourdes à libérer autres que ses enfants nettoyés dans clearCity
        this.houseRenderer = null;
        this.newHouseRenderer = null;
        this.buildingRenderer = null;
        this.skyscraperRenderer = null;
        this.commercialRenderer = null;
        this.movieTheaterRenderer = null;
        this.renderers = null;


        //console.log("CityManager destroyed.");
    }

    // Getters (inchangés ou ajustés pour pointer vers les bons managers)
    getPlots() { return this.leafPlots || []; }
    getDistricts() { return this.districts || []; }
    getNavigationGraph() { return this.navigationManager?.getNavigationGraph(); } // Via NavManager
    getPathfinder() { return this.navigationManager?.getPathfinder(); }         // Via NavManager
    getBuildingInstances() { return this.citizenManager.buildingInstances; }
    getCitizens() { return this.citizenManager.citizens; }

    // Logging (inchangé)
    logLoadedAssets() {
        if (!this.assetLoader || !this.assetLoader.assets) return;
        const counts = Object.entries(this.assetLoader.assets)
            .map(([type, list]) => `${type}: ${list.length}`)
            .join(', ');
        //console.log(`Assets loaded - ${counts}`);
    }

    logInitialZoneTypes() {
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        //console.log("Initial zone types (from LayoutGenerator):", counts);
    }

    logAdjustedZoneTypes() {
        // Cette info est maintenant logguée par DistrictManager
        //console.log("Final zone types (after adjustment & fallback):", counts);
    }

    assignDefaultTypeToUnassigned() {
        // Cette logique est maintenant gérée dans DistrictManager
    }

    update(deltaTime) {

        // L'appel à contentGenerator.update est maintenant dans World.js
        // L'appel à lampPostManager.update est aussi dans World.js
        
        // Ajouter mise à jour du gestionnaire de citoyens pour la santé/maladies
        if (this.citizenManager) {
            this.citizenManager.update(deltaTime);
        }
    }
    toggleCityMap() {
        if (this.cityMapVisualizer) {
            this.cityMapVisualizer.toggle();
        }
    }

    /**
     * Sélectionne les parcelles qui auront des bâtiments avec des règles de placement spéciales.
     * @param {string} buildingType - Type de bâtiment (ex: 'movietheater')
     */
    selectPlotsForSpecialBuilding(buildingType) {
        const rules = this.specialPlacementRules[buildingType];
        if (!rules) {
            console.warn(`CityManager: Aucune règle de placement spéciale trouvée pour ${buildingType}`);
            return;
        }

        // Réinitialiser les sélections précédentes
        rules.selectedPlots.clear();

        // Filtrer les quartiers éligibles selon les règles
        const eligibleDistricts = this.districts.filter(district => 
            district.type !== 'industrial' // Les cinémas ne vont pas dans les zones industrielles
        );

        if (eligibleDistricts.length === 0) {
            console.log(`CityManager: Aucun quartier éligible pour ${buildingType}`);
            return;
        }

        // Calculer le centre de chaque quartier éligible
        const districtsWithCenters = eligibleDistricts.map(district => {
            let totalX = 0, totalZ = 0, plotCount = 0;
            
            district.plots.forEach(plot => {
                totalX += plot.x + plot.width / 2;
                totalZ += plot.z + plot.depth / 2;
                plotCount++;
            });
            
            return {
                district: district,
                center: {
                    x: totalX / plotCount,
                    z: totalZ / plotCount
                }
            };
        });

        // Sélectionner les quartiers en s'assurant qu'ils soient bien espacés
        const selectedDistricts = this._selectWellSpacedDistricts(districtsWithCenters, rules.maxTotal);
        
        // Pour chaque quartier sélectionné, choisir une parcelle éligible
        selectedDistricts.forEach(districtWithCenter => {
            const district = districtWithCenter.district;
            
            // Filtrer les parcelles éligibles selon les règles
            const eligiblePlots = district.plots.filter(plot => 
                rules.allowedZoneTypes.includes(plot.zoneType)
            );

            if (eligiblePlots.length === 0) {
                console.warn(`CityManager: Aucune parcelle éligible pour ${buildingType} dans le quartier ${district.id}`);
                return;
            }

            // Sélectionner une parcelle aléatoire parmi les éligibles
            const selectedPlotIndex = Math.floor(Math.random() * eligiblePlots.length);
            const selectedPlot = eligiblePlots[selectedPlotIndex];
            
            // Marquer cette parcelle comme devant avoir ce type de bâtiment spécial
            rules.selectedPlots.add(selectedPlot.id);
        });

        console.log(`CityManager: ${rules.selectedPlots.size} parcelles sélectionnées pour ${buildingType} (${selectedDistricts.length} quartiers sur ${eligibleDistricts.length} éligibles)`);
    }

    /**
     * Sélectionne des quartiers bien espacés pour placer des bâtiments spéciaux.
     * @param {Array} districtsWithCenters - Quartiers avec leurs centres calculés.
     * @param {number} maxCount - Nombre maximum de quartiers à sélectionner.
     * @returns {Array} - Quartiers sélectionnés.
     * @private
     */
    _selectWellSpacedDistricts(districtsWithCenters, maxCount) {
        if (districtsWithCenters.length === 0) return [];
        
        // Nombre cible : environ 1 quartier sur 4, minimum 1, maximum selon les règles
        const rawTargetCount = Math.max(1, Math.floor(districtsWithCenters.length / 4));
        const targetCount = Math.min(maxCount, rawTargetCount);
        
        // Distance minimale entre les bâtiments spéciaux
        const minDistanceBetween = 150;
        
        const selectedDistricts = [];
        const remainingDistricts = [...districtsWithCenters];
        
        // Sélectionner le premier quartier aléatoirement
        const firstIndex = Math.floor(Math.random() * remainingDistricts.length);
        selectedDistricts.push(remainingDistricts[firstIndex]);
        remainingDistricts.splice(firstIndex, 1);
        
        // Sélectionner les quartiers suivants en s'assurant qu'ils soient suffisamment éloignés
        while (selectedDistricts.length < targetCount && remainingDistricts.length > 0) {
            let bestCandidate = null;
            let bestMinDistance = 0;
            let bestIndex = -1;
            
            for (let i = 0; i < remainingDistricts.length; i++) {
                const candidate = remainingDistricts[i];
                
                let minDistanceToSelected = Infinity;
                for (const selected of selectedDistricts) {
                    const distance = this._calculateDistance(candidate.center, selected.center);
                    minDistanceToSelected = Math.min(minDistanceToSelected, distance);
                }
                
                if (minDistanceToSelected > bestMinDistance) {
                    bestMinDistance = minDistanceToSelected;
                    bestCandidate = candidate;
                    bestIndex = i;
                }
            }
            
            if (bestCandidate && bestMinDistance >= minDistanceBetween) {
                selectedDistricts.push(bestCandidate);
                remainingDistricts.splice(bestIndex, 1);
            } else {
                if (bestCandidate) {
                    selectedDistricts.push(bestCandidate);
                    remainingDistricts.splice(bestIndex, 1);
                } else {
                    break;
                }
            }
        }
        
        return selectedDistricts;
    }

    /**
     * Calcule la distance euclidienne entre deux points.
     * @param {{x: number, z: number}} point1 - Premier point.
     * @param {{x: number, z: number}} point2 - Deuxième point.
     * @returns {number} - Distance entre les deux points.
     * @private
     */
    _calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dz = point1.z - point2.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Vérifie si une parcelle doit avoir un bâtiment spécial.
     * @param {string} buildingType - Type de bâtiment (ex: 'movietheater')
     * @param {Plot} plot - La parcelle à vérifier.
     * @returns {boolean} - True si la parcelle doit avoir ce type de bâtiment.
     */
    shouldPlotHaveSpecialBuilding(buildingType, plot) {
        const rules = this.specialPlacementRules[buildingType];
        return rules ? rules.selectedPlots.has(plot.id) : false;
    }
}