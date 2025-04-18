// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
import DistrictManager from './DistrictManager.js';
import LampPostManager from './LampPostManager.js';
import NavigationManager from './NavigationManager.js';
import AbstractGraph from './HPA/AbstractGraph.js';
import HPAPrecalculator from './HPA/HPAPrecalculator.js';
import CitizenManager from './CitizenManager.js';
import DebugVisualManager from './DebugVisualManager.js';
// Renderer spécialisés sont nécessaires pour PlotContentGenerator via Experience/World
import HouseRenderer from './HouseRenderer.js';
import BuildingRenderer from './BuildingRenderer.js';
import SkyscraperRenderer from './SkyscraperRenderer.js';


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
            // Crosswalks
            crosswalkWidth: 0.1,
            crosswalkHeight: 0.03,
            crosswalkStripeCount: 5,
            crosswalkStripeWidth: 0.6,
            crosswalkStripeGap: 0.5,
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
            plotGroundY: 0.005, // Ajout pour uniformiser
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
            // Assets (Simplifié - les détails restent dans la config passée)
            houseModelDir: "Public/Assets/Models/Houses/",
            houseModelFiles: [ { file: "House1.fbx", scale: 1.3 }, { file: "House24.fbx", scale: 1.3 } ],
            houseBaseWidth: 5,
            houseBaseHeight: 6,
            houseBaseDepth: 5,
            buildingModelDir: "Public/Assets/Models/Buildings/",
            buildingModelFiles: [ { file: "Building1.fbx", scale: 0.8 }, { file: "Building10.glb", scale: 0.8 } ],
            buildingBaseWidth: 10,
            buildingBaseHeight: 20,
            buildingBaseDepth: 10,
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: [ { file: "Factory1_glb.glb", scale: 1 }, { file: "Factory2_glb.glb", scale: 1 }, { file: "Factory3_glb.glb", scale: 1 } ],
            industrialBaseWidth: 18,
            industrialBaseHeight: 12,
            industrialBaseDepth: 25,
            parkModelDir: "Public/Assets/Models/Parks/",
            parkModelFiles: [ { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 }, { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 } ],
            parkBaseWidth: 15, // Utilisé pour le calcul de grille
            parkBaseHeight: 3,
            parkBaseDepth: 15, // Utilisé pour le calcul de grille
            minParkElements: 1, // Ajout config parc
            maxParkElements: 5, // Ajout config parc
            treeModelDir: "Public/Assets/Models/Trees/",
            treeModelFiles: [{ file: "Tree2.glb", scale: 0.9 }, { file: "Tree3.glb", scale: 0.9 }, { file: "Tree4.glb", scale: 0.9 }, { file: "Tree5.glb", scale: 0.9 }, { file: "Tree6.glb", scale: 0.9 } ],
            treeBaseWidth: 4,
            treeBaseHeight: 8,
            treeBaseDepth: 4,
            skyscraperModelDir: "Public/Assets/Models/Skyscrapers/",
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
            agentWalkSpeed: 10,
            agentBobAmplitude: 0.15,
            agentStepLength: 1.5,
            agentStepHeight: 0.7,
            agentSwingAmplitude: 1.2,
            agentAnkleRotationAmplitude: Math.PI / 8,
            agentHandTiltAmplitude: 0.2,
            agentHeadNodAmplitude: 0.05,
            agentHeadYawAmplitude: 0.1,
            agentHeadTiltAmplitude: 0.08,
            agentHeadBobAmplitude: 0.06,
            agentAnimationSpeedFactor: 8,
            maxAgents: 2000,
            // Capacités par défaut
            maxCitizensPerHouse: 5,
            maxCitizensPerBuilding: 10,
            maxWorkersPerSkyscraper: 100,
            maxWorkersPerIndustrial: 50,
            // Lampadaires
            lampPostSpacing: 20, // Ajout config lampadaire
            lampPostLightConeRadiusBottom: 5.0,
            lampPostLightConeOpacity: 0.0023,
            lampPostLightConeColor: 0xFFFF99
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
        this.assetLoader = new CityAssetLoader(this.config);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        // Instanciation du PlotContentGenerator refactoré
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials, this.experience);

        // --- Renderers Spécialisés ---
        // Créés ici pour être passés à PlotContentGenerator lors de la génération
        this.houseRenderer = new HouseRenderer(this.config, this.materials);
        this.buildingRenderer = new BuildingRenderer(this.config, this.materials);
        this.skyscraperRenderer = new SkyscraperRenderer(this.config, this.materials);
        this.renderers = {
            houseRenderer: this.houseRenderer,
            buildingRenderer: this.buildingRenderer,
            skyscraperRenderer: this.skyscraperRenderer
        };

		// --- Gestion de la Navigation (incluant HPA) ---
        this.navigationManager = new NavigationManager(this.config); // Créé ici
        this.navigationGraph = null; // Sera défini après buildGraph
        this.pathfinder = null; // Pour l'ancien système ou pathfinding détaillé
        this.abstractGraph = new AbstractGraph(); // Initialiser le graphe HPA
        this.hpaPrecalculator = null; // Sera créé lors de la génération
		
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

        // --- LampPostManager ---
        // Passe le cityContainer où ajouter les lampadaires
        this.lampPostManager = new LampPostManager(this.config, this.materials, this.cityContainer);

        // Ajout du conteneur principal à la scène
        this.scene.add(this.cityContainer);

        console.log("CityManager initialized.");
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
    // --- Fin délégation ---

    async generateCity() {
        console.time("CityGeneration");
        this.clearCity(); // Efface la ville précédente
        try {
            console.log("--- Starting city generation ---");
            this.createGlobalGround(); // Crée le sol global

            console.time("AssetLoading");
            await this.assetLoader.loadAssets(); // Charge tous les modèles 3D
            console.timeEnd("AssetLoading");
            this.logLoadedAssets();

            console.time("LayoutGeneration");
            this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize); // Génère les parcelles
            console.timeEnd("LayoutGeneration");
            console.log(`Layout generated with ${this.leafPlots.length} plots.`);
            this.logInitialZoneTypes(); // Log les types initiaux des parcelles
            if (!this.leafPlots || this.leafPlots.length === 0)
                throw new Error("Layout produced no plots.");

            // === Étape 1: Routes & Graphe de Navigation BAS NIVEAU ===
            console.time("RoadAndNavGraphGeneration");
            const { roadGroup, crosswalkInfos } = this.roadGenerator.generateRoads(this.leafPlots);
            this.roadGroup = roadGroup;
            this.cityContainer.add(this.roadGroup);

            // Assurer que navigationManager existe
            if (!this.navigationManager) {
                this.navigationManager = new NavigationManager(this.config);
            }
            this.navigationManager.buildGraph(this.leafPlots, crosswalkInfos); // Construit le graphe bas niveau
            this.navigationGraph = this.navigationManager.getNavigationGraph(); // Stocker la référence
            console.timeEnd("RoadAndNavGraphGeneration");

            if (!this.navigationGraph || !this.navigationGraph.grid) {
                throw new Error("NavigationGraph failed to build after road generation.");
            }
            console.log(`Road network & NavigationGraph generated (${crosswalkInfos.length} crosswalks).`);


            // === Étape 2: Districts & Identification des Portes HPA ===
            console.time("DistrictFormationAndHPAGates");
            try {
                // DistrictManager a maintenant besoin du NavigationManager pour accéder au graphe construit
                const districtManager = new DistrictManager(
                    this.config,
                    this.leafPlots,
                    this.debugVisualManager.parentGroup,
                    this.navigationManager // Passer le manager
                );
                // Cette méthode interne appelle maintenant identifyAndAddHPAGates après validation
                districtManager.generateAndValidateDistricts();
                this.districts = districtManager.getDistricts(); // Récupère les districts formés (avec les portes HPA identifiées)
            } catch (error) {
                console.error("Error during district formation and HPA gate identification:", error);
                throw error; // Arrête si les districts sont invalides ou l'identification échoue
            }
            console.timeEnd("DistrictFormationAndHPAGates");


            // === Étape 3: Précalcul HPA ===
            console.time("HPAPrecomputation");
            // Vérifier que tout est prêt pour le précalcul
            if (this.districts.length > 0 && this.navigationGraph && this.abstractGraph) {
                 this.hpaPrecalculator = new HPAPrecalculator(
                     this.districts,
                     this.navigationGraph,
                     this.abstractGraph
                 );
                 this.hpaPrecalculator.precomputePaths(); // Lance le calcul des chemins abstraits
            } else {
                 console.error(`CityManager: Cannot start HPA precomputation - Missing dependencies. Districts: ${this.districts.length}, NavGraph: ${!!this.navigationGraph}, AbstractGraph: ${!!this.abstractGraph}.`);
                 // Peut-être lancer une exception ici ? Ou continuer sans HPA ?
                 // throw new Error("Failed HPA precomputation due to missing dependencies.");
            }
            console.timeEnd("HPAPrecomputation");


            // === Étape 4: Initialisation du Pathfinder (pour l'ancien système ou détails) ===
            console.time("PathfinderInitialization");
            this.navigationManager.initializePathfinder(); // Initialise le service pathfinding bas niveau
            this.pathfinder = this.navigationManager.getPathfinder();
            console.timeEnd("PathfinderInitialization");


            // === Étape 5: Génération du Contenu des Parcelles ===
            console.time("ContentGeneration");
            const { sidewalkGroup, buildingGroup, groundGroup } = this.contentGenerator.generateContent(
                this.leafPlots,
                this.assetLoader,
                crosswalkInfos, // Toujours utiles pour les passages piétons réels
                this, // Passe CityManager pour enregistrement bâtiments
                this.renderers // Passe les renderers spécialisés
            );
            // Note: Les groupes retournés sont déjà gérés par this.contentGenerator
            console.timeEnd("ContentGeneration");
            console.log(`Total Building Instances Registered: ${this.citizenManager.buildingInstances.size}`);


            // === Étape 6: Génération des Lampadaires ===
            console.time("LampPostGeneration");
            this.lampPostManager.addLampPosts(this.leafPlots);
            console.timeEnd("LampPostGeneration");


            // === Étape 7: Mise à jour des Visuels Debug ===
            if (this.experience.isDebugMode) {
                console.time("DebugVisualsUpdate");
                if (this.debugVisualManager && !this.debugVisualManager.parentGroup.parent) {
                    this.cityContainer.add(this.debugVisualManager.parentGroup);
                }
                this.debugVisualManager?.createParkOutlines(this.leafPlots, 0.3);
                 if(this.config.debug?.showDistrictBoundaries) { // Utiliser optional chaining
                    this.debugVisualManager?.createDistrictBoundaries(this.districts);
                }
                console.timeEnd("DebugVisualsUpdate");
            } else {
                this.debugVisualManager?.clearDebugVisuals();
                if (this.debugVisualManager?.parentGroup.parent) {
                    this.cityContainer.remove(this.debugVisualManager.parentGroup);
                }
            }

            console.log("--- City generation finished ---");

        } catch (error) {
            console.error("Major error during city generation:", error);
            this.clearCity(); // Tente de nettoyer en cas d'erreur majeure
        } finally {
            console.timeEnd("CityGeneration"); // Fin du chronomètre global
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
        // console.log(`CityGround created: ${this.config.mapSize}x${this.config.mapSize}`);
    }

    clearCity() {
        console.log("Clearing the existing city...");
        // Nettoyage Debug
        if (this.debugVisualManager) {
            // Note: clearDebugVisuals est maintenant dans Experience/World,
            // mais si DVM est spécifique à CityManager, gardez-le ici.
            // Sinon, assurez-vous que World.setDebugMode(false) est appelé.
            this.debugVisualManager.clearDebugVisuals(); // Assumons qu'il nettoie ses propres objets
        }

        // Nettoyage HPA
        if (this.abstractGraph) {
            // Pas de méthode dispose standard, juste réinitialiser les maps internes
            this.abstractGraph.nodes.clear();
            this.abstractGraph.nodesByZone.clear();
            // On ne réassigne pas this.abstractGraph à null ici, on le vide juste.
            // Il sera rempli à nouveau lors de la prochaine génération.
        }
        this.hpaPrecalculator = null; // Libérer la référence au précalculateur

        // Nettoyage Groupes de Scène Directs
        if (this.roadGroup && this.roadGroup.parent) this.cityContainer.remove(this.roadGroup);
        // Les groupes sidewalk, content, ground sont vidés via contentGenerator.resetManagers()

        // Nettoyage Lampadaires via leur Manager
        if (this.lampPostManager && this.lampPostManager.lampPostMeshes) {
            // Retrait des meshes de la scène (géré dans LampPostManager idéalement ou ici)
            if (this.lampPostManager.lampPostMeshes.grey?.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.grey);
            if (this.lampPostManager.lampPostMeshes.light?.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.light);
            if (this.lampPostManager.lampPostMeshes.lightCone?.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.lightCone);
            // Réinitialiser les références
            this.lampPostManager.lampPostMeshes = { grey: null, light: null, lightCone: null };
            // Idéalement, ajouter une méthode LampPostManager.reset() ou destroy()
        }

        // Nettoyage Sol Global
        if (this.groundMesh && this.groundMesh.parent) this.scene.remove(this.groundMesh);
        this.groundMesh?.geometry?.dispose(); // Dispose seulement si elle existe
        this.groundMesh = null;

        // Réinitialisation des Générateurs et Managers
        this.roadGenerator?.reset();
        this.contentGenerator?.resetManagers(); // Utilise la méthode correcte
        this.layoutGenerator?.reset();
        this.navigationManager?.destroy(); // NavigationManager gère son propre nettoyage
        this.navigationManager = null; // Important de le remettre à null
        this.navigationGraph = null;
        this.pathfinder = null;
        this.citizenManager?.reset();

        // Réinitialisation des données internes
        this.leafPlots = [];
        this.districts = [];
        this.roadGroup = null;

        console.log("City cleared.");
    }

    // Reset ajouté à CitizenManager pour nettoyer les données
    // (doit être implémenté dans CitizenManager.js)
    // CitizenManager.prototype.reset = function() {
    //     this.buildingInstances.clear();
    //     this.citizens.clear();
    //     this.nextBuildingInstanceId = 0;
    //     console.log("CitizenManager reset.");
    // };

    destroy() {
        console.log("Destroying CityManager...");
        this.clearCity(); // Appelle le nettoyage

        // Dispose Materials (ceux créés DANS CityManager)
        Object.values(this.materials).forEach(material => {
            material?.dispose?.();
        });
        this.materials = {};

        // Dispose Renderers spécialisés (appeler leur reset/destroy)
        this.houseRenderer?.reset();
        this.buildingRenderer?.reset();
        this.skyscraperRenderer?.reset();

        // Dispose LampPostManager (nettoyage interne si implémenté)
        // this.lampPostManager?.destroy();

        // Dispose Asset Loader
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
        this.contentGenerator = null;
        this.navigationManager = null;
        this.navigationGraph = null;
        this.abstractGraph = null; // Nullifier HPA
        this.hpaPrecalculator = null; // Nullifier HPA
        this.pathfinder = null;
        this.citizenManager = null;
        this.lampPostManager = null;
        this.debugVisualManager = null;
        this.houseRenderer = null;
        this.buildingRenderer = null;
        this.skyscraperRenderer = null;
        this.renderers = null;

        console.log("CityManager destroyed.");
    }

    // Getters (inchangés ou ajustés pour pointer vers les bons managers)
    getPlots() { return this.leafPlots || []; }
    getDistricts() { return this.districts || []; }
    getNavigationGraph() { return this.navigationManager?.getNavigationGraph(); } // Via NavManager
	getAbstractGraph() {return this.abstractGraph;}
    getPathfinder() { return this.navigationManager?.getPathfinder(); }         // Via NavManager
    getBuildingInstances() { return this.citizenManager.buildingInstances; }
    getCitizens() { return this.citizenManager.citizens; }

    // Logging (inchangé)
    logLoadedAssets() {
        if (!this.assetLoader || !this.assetLoader.assets) return;
        const counts = Object.entries(this.assetLoader.assets)
            .map(([type, list]) => `${type}: ${list.length}`)
            .join(', ');
        console.log(`Assets loaded - ${counts}`);
    }

    logInitialZoneTypes() {
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Initial zone types (from LayoutGenerator):", counts);
    }

    logAdjustedZoneTypes() {
        // Cette info est maintenant logguée par DistrictManager
        // console.log("Final zone types (after adjustment & fallback):", counts);
    }

    assignDefaultTypeToUnassigned() {
        // Cette logique est maintenant gérée dans DistrictManager
    }

    update() {
        // L'appel à contentGenerator.update est maintenant dans World.js
        // L'appel à lampPostManager.update est aussi dans World.js
    }
}