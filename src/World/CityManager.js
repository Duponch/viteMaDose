// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
import DistrictManager from './DistrictManager.js';
import LampPostManager from './LampPostManager.js';
import NavMeshManager from './NavMeshManager.js';
import AgentManager from './AgentManager.js';
import CitizenManager from './CitizenManager.js';
import DebugVisualManager from './DebugVisualManager.js';
// Renderers spécialisés
import HouseRenderer from './HouseRenderer.js';
import BuildingRenderer from './BuildingRenderer.js';
import SkyscraperRenderer from './SkyscraperRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Imports des Stratégies (déjà ajoutés)
import HousePlacementStrategy from './Strategies/HousePlacementStrategy.js';
import BuildingPlacementStrategy from './Strategies/BuildingPlacementStrategy.js';
import IndustrialPlacementStrategy from './Strategies/IndustrialPlacementStrategy.js';
import SkyscraperPlacementStrategy from './Strategies/SkyscraperPlacementStrategy.js';
import ParkPlacementStrategy from './Strategies/ParkPlacementStrategy.js';
import TreePlacementStrategy from './Strategies/TreePlacementStrategy.js';

// --- AJOUTER CET IMPORT ---
import InstancedMeshManager from './InstancedMeshManager.js';

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration initiale (INCHANGÉ) ---
        // Toute la configuration existante est conservée.
        // S'assurer que les paramètres nécessaires à la génération du NavMesh
        // (ex: agent radius, height, max climb, etc.) sont présents ici ou passés autrement.
        this.config = { /* ...la longue liste de config ... */
             // Map & Layout
            mapSize: 400,
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
            plotGroundY: 0.005,
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
            gridParkBaseScale: 1.0,
            // Assets (Simplifié)
            houseModelDir: "Public/Assets/Models/Houses/",
            houseModelFiles: [ { file: "House1.fbx", scale: 1.3 }, { file: "House24.fbx", scale: 1.3 } ],
            houseBaseWidth: 5, houseBaseHeight: 6, houseBaseDepth: 5,
            buildingModelDir: "Public/Assets/Models/Buildings/",
            buildingModelFiles: [ { file: "Building1.fbx", scale: 0.8 }, { file: "Building10.glb", scale: 0.8 } ],
            buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: [ { file: "Factory1_glb.glb", scale: 1 }, { file: "Factory2_glb.glb", scale: 1 }, { file: "Factory3_glb.glb", scale: 1 } ],
            industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
            parkModelDir: "Public/Assets/Models/Parks/",
            parkModelFiles: [ { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 }, { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 } ],
            parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,
            minParkElements: 1, maxParkElements: 5,
            treeModelDir: "Public/Assets/Models/Trees/",
            treeModelFiles: [{ file: "Tree2.glb", scale: 0.9 }, { file: "Tree3.glb", scale: 0.9 }, { file: "Tree4.glb", scale: 0.9 }, { file: "Tree5.glb", scale: 0.9 }, { file: "Tree6.glb", scale: 0.9 } ],
            treeBaseWidth: 4, treeBaseHeight: 8, treeBaseDepth: 4,
            skyscraperModelDir: "Public/Assets/Models/Skyscrapers/",
            skyscraperModelFiles: [ { file: "Skyscraper1.glb", scale: 0.8 }, { file: "Skyscraper2.glb", scale: 1 }, { file: "Skyscraper3.glb", scale: 1 } ],
            skyscraperBaseWidth: 15, skyscraperBaseHeight: 80, skyscraperBaseDepth: 15,
            // Placement d'arbres
            treePlacementProbabilitySidewalk: 0.3,
            treePlacementProbabilityPark: 0.04,
            // Debug
            debug: {
                showDistrictBoundaries: false,
                houseScaleReduction: 0.4,
                buildingScaleReduction: 0.8,
                industrialScaleReduction: 0.4,
                skyscraperScaleReduction: 1.01
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
            maxAgents: 5,
            // Capacités par défaut
            maxCitizensPerHouse: 5,
            maxCitizensPerBuilding: 10,
            maxWorkersPerSkyscraper: 100,
            maxWorkersPerIndustrial: 50,
            // Lampadaires
            lampPostSpacing: 20,
            lampPostLightConeRadiusBottom: 5.0,
            lampPostLightConeOpacity: 0.0023,
            lampPostLightConeColor: 0xFFFF99,
             // --- AJOUT POTENTIEL : Paramètres NavMesh ---
             navMesh: {
				// Valeurs TRES permissives pour tester
				agentRadius: 0.6,      // Agent un peu plus "épais"
				agentHeight: 2.0,      // Agent plus grand
				agentMaxClimb: 1.0,    // Peut grimper 1 unité ! Très permissif
				agentMaxSlope: 60.0,   // Pente max élevée
				cellSize: 0.5,         // Cellules plus GROSSES (moins de détails)
				cellHeight: 0.3,       // Cellules plus HAUTES
				// --- Laisser les autres paramètres par défaut ---
				// edgeMaxLen: 12.0,
				// edgeMaxError: 1.3,
				// regionMinSize: 8,
				// regionMergeSize: 20,
				// vertsPerPoly: 6,
				// detailSampleDist: 6.0,
				// detailSampleMaxError: 1.0,
			}
             // ------------------------------------------
         };

        // Fusion de configuration externe (INCHANGÉ)
        const deepMerge = (target, source) => { /* ... */
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

        // --- Matériaux (INCHANGÉ) ---
        this.materials = { /* ... matériaux existants ... */
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
            debugParkOutlineMaterial: new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2, depthTest: false }),
            lampLightConeMaterial: new THREE.MeshBasicMaterial({
                color: this.config.lampPostLightConeColor,
                transparent: true,
                opacity: this.config.lampPostLightConeOpacity,
                side: THREE.DoubleSide,
                depthWrite: false
            })
         };

        // --- Composants (INCHANGÉ, sauf Navigation) ---
        this.assetLoader = new CityAssetLoader(this.config);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials, this.experience);

        // --- Renderers Spécialisés (INCHANGÉ) ---
        this.houseRenderer = new HouseRenderer(this.config, this.materials);
        this.buildingRenderer = new BuildingRenderer(this.config, this.materials);
        this.skyscraperRenderer = new SkyscraperRenderer(this.config, this.materials);
        this.renderers = {
            houseRenderer: this.houseRenderer,
            buildingRenderer: this.buildingRenderer,
            skyscraperRenderer: this.skyscraperRenderer
        };

        // --- MODIFICATION : Navigation via NavMeshManager ---
        // this.navigationManager = new NavigationManager(this.config); // Ancien
        this.navMeshManager = new NavMeshManager(this.config, this.experience); // <-- NOUVEAU
        // Plus besoin de stocker navigationGraph ou pathfinder ici
        // -------------------------------------------------

        this.districts = [];
        this.leafPlots = [];

        // --- Groupes de scène (INCHANGÉ) ---
        this.cityContainer = new THREE.Group();
        this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = this.contentGenerator.sidewalkGroup;
        this.contentGroup = this.contentGenerator.buildingGroup;
        this.groundGroup = this.contentGenerator.groundGroup;
        this.cityContainer.add(this.sidewalkGroup, this.contentGroup, this.groundGroup);

        // --- DebugVisualManager (INCHANGÉ) ---
		this.debugVisualManager = new DebugVisualManager(
            null, this.materials, this.experience.sizes, this.config
        );
        if (this.experience.isDebugMode || this.config.debug?.showDistrictBoundaries) { // Utiliser config.debug
            this.cityContainer.add(this.debugVisualManager.parentGroup);
        }

        // --- CitizenManager (INCHANGÉ) ---
        this.citizenManager = new CitizenManager(this.config);

        // --- LampPostManager (INCHANGÉ) ---
        this.lampPostManager = new LampPostManager(this.config, this.materials, this.cityContainer);

        // Ajout du conteneur principal à la scène (INCHANGÉ)
        this.scene.add(this.cityContainer);

        console.log("CityManager initialized (NavMesh ready).");
    }

    // --- Délégation vers CitizenManager (INCHANGÉ) ---
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
    
	async generateCity() {
        console.time("CityGeneration");
        this.clearCity();
        try {
            // ... (Étapes 1 à 4: Load Assets, Layout, Districts, Roads - inchangées) ...
             console.log("--- Starting city generation (NavMesh version) ---");
             this.createGlobalGround();
             console.time("AssetLoading"); await this.assetLoader.loadAssets(); console.timeEnd("AssetLoading"); this.logLoadedAssets();
             console.time("LayoutGeneration"); this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize); console.timeEnd("LayoutGeneration"); console.log(`Layout generated with ${this.leafPlots.length} plots.`); this.logInitialZoneTypes(); if (!this.leafPlots || this.leafPlots.length === 0) throw new Error("Layout produced no plots.");
             console.time("DistrictFormationAndValidation"); try { const districtManager = new DistrictManager(this.config, this.leafPlots, this.debugVisualManager.parentGroup); districtManager.generateAndValidateDistricts(); this.districts = districtManager.getDistricts(); } catch (error) { console.error("Error during district formation:", error); throw error; } console.timeEnd("DistrictFormationAndValidation");
             console.time("RoadAndCrosswalkInfoGeneration"); const { roadGroup, crosswalkInfos } = this.roadGenerator.generateRoads(this.leafPlots); this.roadGroup = roadGroup; this.cityContainer.add(this.roadGroup); console.timeEnd("RoadAndCrosswalkInfoGeneration"); console.log(`Road network generated and ${crosswalkInfos.length} crosswalk locations identified.`);

            // --- 5. Plot Content Preparation ---
            console.time("PlotContentPrep");
             // Initialize Strategies & InstancedMeshManager
             // ... (initialisation stratégies et instancedMeshManager inchangée)...
              if (!this.renderers /*...vérif...*/ ) throw new Error("Renderers not initialized...");
              this.contentGenerator.zoneStrategies = { /* ... stratégies ... */
                'house': new HousePlacementStrategy(this.config, this.assetLoader, this.renderers, this.experience),
                'building': new BuildingPlacementStrategy(this.config, this.assetLoader, this.renderers, this.experience),
                'industrial': new IndustrialPlacementStrategy(this.config, this.assetLoader, this.renderers, this.experience),
                'skyscraper': new SkyscraperPlacementStrategy(this.config, this.assetLoader, this.renderers, this.experience),
                'park': new ParkPlacementStrategy(this.config, this.assetLoader, this.renderers, this.experience)
              };
              this.contentGenerator.treePlacementStrategy = new TreePlacementStrategy(this.config, this.assetLoader, this.renderers, this.experience);
              if (!this.contentGenerator.instancedMeshManager) { this.contentGenerator.instancedMeshManager = new InstancedMeshManager( this.config, this.materials, this.assetLoader, this.renderers, this.contentGroup, this.experience ); console.log("InstancedMeshManager initialized early for NavMesh prep."); }
              console.log("Placement strategies initialized.");

             // Generate Ground & Sidewalk Meshes
             // ... (inchangé) ...
             const generatedGroundGroup = this.contentGenerator.plotGroundGenerator.generateGrounds(this.leafPlots);
             if (generatedGroundGroup) this.groundGroup.add(generatedGroundGroup);
             const generatedSidewalkMesh = this.contentGenerator.sidewalkGenerator.generateSidewalks(this.leafPlots);
             if (generatedSidewalkMesh) this.sidewalkGroup.add(generatedSidewalkMesh);

             // Generate Instance DATA
             // ... (inchangé) ...
              const plotGroundY = this.config.plotGroundY ?? 0.005;
              this.leafPlots.forEach((plot) => { /* ... populatePlot ... */
                plot.buildingInstances = [];
                const strategy = this.contentGenerator.zoneStrategies[plot.zoneType];
                if (strategy) { try { strategy.populatePlot(plot, this.contentGenerator.instanceDataManager, this, plotGroundY); } catch (strategyError) { console.error(`Error executing placement strategy '${plot.zoneType}' for plot ${plot.id}:`, strategyError); } }
                else if (plot.zoneType !== 'unbuildable') { console.warn(`No placement strategy found for zone type: ${plot.zoneType} on plot ${plot.id}`); }
              });
              if (this.contentGenerator.treePlacementStrategy) { /* ... placeTrees ... */ this.contentGenerator.treePlacementStrategy.placeTrees(this.leafPlots, this.assetLoader, this.contentGenerator.instanceDataManager); } else { console.error("treePlacementStrategy is null!"); }
              this.contentGenerator.crosswalkInstancer.generateCrosswalkInstances(crosswalkInfos, this.contentGenerator.instanceDataManager);
            console.timeEnd("PlotContentPrep");


            // --- 6. Prepare Walkable Mesh for NavMesh (CORRECTED SOLID CROSSWALKS) ---
            console.time("WalkableMeshPreparation");

            // --- 6a. Generate SOLID Crosswalk Geometries ---
            let mergedSolidCrosswalkGeometry = null;
            let tempSolidCrosswalkMesh = null;
            const solidCrosswalkGeomsToMerge = [];

            if (crosswalkInfos && crosswalkInfos.length > 0) {
                const stripeCount = this.config.crosswalkStripeCount ?? 5;
                const stripeWidth = this.config.crosswalkStripeWidth ?? 0.6;
                const stripeGap = this.config.crosswalkStripeGap ?? 0.5;
                const totalCrosswalkVisualWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap;
                const crosswalkY = this.config.sidewalkHeight ?? 0.2;

                console.log(`NavMesh Prep: Calculated totalCrosswalkVisualWidth: ${totalCrosswalkVisualWidth.toFixed(2)}`);

                if (totalCrosswalkVisualWidth > 0.01) {
                    const matrix = new THREE.Matrix4();
                    const position = new THREE.Vector3();
                    const quaternion = new THREE.Quaternion();
                    // NOTE: L'échelle n'est plus nécessaire car on définit les dimensions dans PlaneGeometry
                    // const scale = new THREE.Vector3(1, 1, 1); // Echelle par défaut

                    crosswalkInfos.forEach(info => {
                        if (!info || !info.position || info.angle === undefined || info.length === undefined || info.length <= 0) {
                             console.warn("NavMesh Prep: Invalid crosswalk info skipped:", info);
                             return;
                        }

                        // --- CORRECTION DIMENSIONS PlaneGeometry ---
                        // Largeur = largeur visuelle totale, Hauteur = longueur du passage
                        const solidPlaneGeom = new THREE.PlaneGeometry(
                            totalCrosswalkVisualWidth, // Dimension X du plan = largeur totale
                            info.length                // Dimension Y du plan = longueur
                        );
                        // -------------------------------------------

                        // Position: Centre du passage piéton, à la hauteur du trottoir
                        position.copy(info.position).setY(crosswalkY);

                        // Rotation: D'abord horizontal (-PI/2 sur X), puis rotation Y selon l'angle
                        // 'YXZ' est un bon ordre pour ce type de rotation (plan puis autour de Y)
                        quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, info.angle, 0, 'YXZ'));

                        // Composer la matrice SANS échelle (les dimensions sont dans la géométrie)
                        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1)); // Utilise scale 1

                        // Appliquer la matrice directement à la géométrie créée
                        solidPlaneGeom.applyMatrix4(matrix);
                        solidCrosswalkGeomsToMerge.push(solidPlaneGeom); // Ajouter la géométrie transformée
                    });

                    // Fusionner toutes les géométries solides des passages piétons
                    if (solidCrosswalkGeomsToMerge.length > 0) {
                        mergedSolidCrosswalkGeometry = mergeGeometries(solidCrosswalkGeomsToMerge, false);
                        // Pas besoin de disposer les solidPlaneGeom ici car ils sont directement utilisés puis mis hors de portée
                        if (mergedSolidCrosswalkGeometry) {
                            tempSolidCrosswalkMesh = new THREE.Mesh(mergedSolidCrosswalkGeometry); // Mesh temporaire
                            console.log(`NavMesh Prep: Merged SOLID crosswalk geometry created (${solidCrosswalkGeomsToMerge.length} areas).`);
                        } else {
                            console.error("NavMesh Prep: Failed to merge SOLID crosswalk geometries.");
                            solidCrosswalkGeomsToMerge.forEach(g => g.dispose()); // Nettoyer en cas d'échec
                        }
                    }
                } // fin if totalCrosswalkVisualWidth > 0.01
            } // fin if crosswalkInfos
            // --- Fin 6a ---

            // --- 6b. Merge Sidewalks and Solid Crosswalks ---
            const walkableMeshSources = [];
            if (generatedSidewalkMesh) walkableMeshSources.push(generatedSidewalkMesh);
            if (tempSolidCrosswalkMesh) walkableMeshSources.push(tempSolidCrosswalkMesh);

            let finalWalkableMesh = null;
            let mergedGeometryForNavMesh = null;
            if (walkableMeshSources.length > 0) {
                 // ... (logique de fusion inchangée) ...
                 const geometriesToMergeForNavMesh = [];
                walkableMeshSources.forEach(mesh => {
                    if (mesh.geometry && mesh.isMesh) {
                        const clonedGeometry = mesh.geometry.clone();
                        mesh.updateMatrixWorld(true);
                        clonedGeometry.applyMatrix4(mesh.matrixWorld);
                        geometriesToMergeForNavMesh.push(clonedGeometry);
                    }
                });
                if (geometriesToMergeForNavMesh.length > 0) {
                    mergedGeometryForNavMesh = mergeGeometries(geometriesToMergeForNavMesh, false);
                    geometriesToMergeForNavMesh.forEach(geom => geom.dispose());
                    if (mergedGeometryForNavMesh) {
                        finalWalkableMesh = new THREE.Mesh(mergedGeometryForNavMesh);
                        finalWalkableMesh.name = "MergedWalkableSurface_SidewalksAndSOLIDCrosswalks";
                        console.log("NavMesh Generation: Sidewalks and SOLID crosswalks merged successfully.");
                    } else { console.error("NavMesh Generation: Failed to merge final walkable geometries."); }
                } else { console.warn("NavMesh Generation: No valid geometries found to merge for NavMesh."); }
            } else { console.warn("NavMesh Generation: No walkable mesh sources found."); }
            console.timeEnd("WalkableMeshPreparation");
            // --- Fin 6b ---


            // --- 7. Generate NavMesh ---
            console.time("NavMeshGeneration");
            // ... (buildNavMesh inchangé) ...
             if (!this.navMeshManager) { this.navMeshManager = new NavMeshManager(this.config, this.experience); }
            let navMeshInstanceData = null;
            if (finalWalkableMesh) { navMeshInstanceData = await this.navMeshManager.buildNavMesh(finalWalkableMesh); }
            else { console.error("NavMesh Generation: Cannot build NavMesh, no final walkable mesh was created."); }
            finalWalkableMesh?.geometry?.dispose(); finalWalkableMesh = null;
            tempSolidCrosswalkMesh?.geometry?.dispose(); tempSolidCrosswalkMesh = null; // Nettoyage
            if (!navMeshInstanceData) throw new Error("Failed to build NavMesh or get its instance data.");
            console.timeEnd("NavMeshGeneration");
            console.log("NavMesh generated and processed successfully.");

            // --- 8. Create Final Visual Instanced Meshes ---
            console.time("InstancedMeshCreation");
            // ... (createMeshes inchangé - crée les bandes visuelles) ...
             if (!this.contentGenerator.instancedMeshManager) { /* ... init tardive ... */ this.contentGenerator.instancedMeshManager = new InstancedMeshManager( this.config, this.materials, this.assetLoader, this.renderers, this.contentGroup, this.experience ); console.log("InstancedMeshManager late initialization in generateCity."); }
             this.contentGenerator.instancedMeshManager.createMeshes( this.contentGenerator.instanceDataManager.getData() );
            console.timeEnd("InstancedMeshCreation");
            console.log(`Total Building Instances Registered: ${this.citizenManager.buildingInstances.size}`);

            // --- 9. Initialize Agent Manager ---
            console.time("AgentManagerInitialization");
            // ... (init Agent Manager inchangé) ...
             const maxAgents = this.config.maxAgents ?? 300;
            this.experience.world?.agentManager?.destroy();
            this.experience.world.agentManager = new AgentManager(this.scene, this.experience, this.config, maxAgents);
            this.agentManager = this.experience.world.agentManager;
            if (this.agentManager && navMeshInstanceData) { this.agentManager.initializePathfindingWorker(navMeshInstanceData); console.log("AgentManager initialized and Pathfinding Worker initialization requested."); }
            else { console.error("World: Failed to initialize AgentManager or its worker - NavMesh data invalid?"); throw new Error("AgentManager could not be initialized."); }
            console.timeEnd("AgentManagerInitialization");

            // --- 10. Create Agents ---
            console.time("AgentCreation");
            // ... (createAgents inchangé) ...
             this.experience.world.createAgents(maxAgents);
            console.timeEnd("AgentCreation");

            // --- 11. Lamp Posts ---
            console.time("LampPostGeneration");
            // ... (addLampPosts inchangé) ...
             this.lampPostManager.addLampPosts(this.leafPlots);
            console.timeEnd("LampPostGeneration");

            // --- 12. Debug Visuals ---
            // ... (debug visuals inchangé) ...
            if (this.experience.isDebugMode) { /* ... */ console.time("DebugVisualsUpdate"); if (!this.debugVisualManager.parentGroup.parent) this.cityContainer.add(this.debugVisualManager.parentGroup); this.experience.world.setDebugMode(true); console.timeEnd("DebugVisualsUpdate"); }
            else { /* ... */ if (this.debugVisualManager.parentGroup.parent) this.cityContainer.remove(this.debugVisualManager.parentGroup); }

            console.log("--- City generation finished (NavMesh version with solid crosswalks - corrected orientation) ---");
        } catch (error) {
            console.error("Major error during city generation:", error);
            this.clearCity();
        } finally {
            console.timeEnd("CityGeneration");
        }
    } // Fin generateCity

    // --- createGlobalGround (INCHANGÉ) ---
    createGlobalGround() { /* ... code inchangé ... */
        if (this.groundMesh && this.groundMesh.parent) return;
        if (this.groundMesh && !this.groundMesh.parent) { this.scene.add(this.groundMesh); return; }
        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2; this.groundMesh.position.y = -0.01;
        this.groundMesh.receiveShadow = true; this.groundMesh.name = "CityGround";
        this.scene.add(this.groundMesh);
     }

    // --- clearCity (Adapté pour NavMeshManager) ---
    clearCity() {
        console.log("Clearing the existing city (NavMesh version)...");
        this.debugVisualManager?.clearAllAndDisposeMaterials(); // Nettoie cache et géométries partagées DVM
        if (this.roadGroup && this.roadGroup.parent) this.cityContainer.remove(this.roadGroup);
        // this.lampPostManager?.reset(); // Si une méthode reset existe
        this.contentGenerator?.resetManagers();
        if (this.groundMesh && this.groundMesh.parent) this.scene.remove(this.groundMesh);
        this.groundMesh?.geometry?.dispose();
        this.groundMesh = null;
        this.roadGenerator?.reset();
        this.layoutGenerator?.reset();
        this.navMeshManager?.destroy(); // Appel correct
        this.navMeshManager = null;
        this.citizenManager?.reset();
        this.districtManager = null;
        this.leafPlots = [];
        this.districts = [];
        this.roadGroup = null;
        console.log("City cleared (NavMesh version).");
    }

    // --- destroy (Adapté pour NavMeshManager) ---
    destroy() {
        console.log("Destroying CityManager (NavMesh version)...");
        this.clearCity();
        Object.values(this.materials).forEach(material => material?.dispose?.());
        this.materials = {};
        this.houseRenderer?.reset(); this.buildingRenderer?.reset(); this.skyscraperRenderer?.reset();
        // this.lampPostManager?.destroy(); // Si une méthode destroy existe
        this.assetLoader?.disposeAssets();
        // this.debugVisualManager?.destroy(); // Est détruit par clearCity via clearAllAndDisposeMaterials
        if (this.cityContainer?.parent) this.cityContainer.parent.remove(this.cityContainer);
        this.cityContainer = null; this.experience = null; this.scene = null;
        this.assetLoader = null; this.layoutGenerator = null; this.roadGenerator = null;
        this.contentGenerator = null;
        this.navMeshManager = null; // Déjà null via clearCity
        this.citizenManager = null; this.lampPostManager = null; this.debugVisualManager = null;
        this.houseRenderer = null; this.buildingRenderer = null; this.skyscraperRenderer = null;
        this.renderers = null;
        console.log("CityManager destroyed (NavMesh version).");
    }

    // --- Getters (Adaptés) ---
    getPlots() { return this.leafPlots || []; }
    getDistricts() { return this.districts || []; }
    // --- MODIFICATION ---
    // Retourne le manager NavMesh ou une interface spécifique si nécessaire
    getNavigationSystem() { return this.navMeshManager; }
    // getNavigationGraph() et getPathfinder() sont obsolètes
    // -------------------
    getBuildingInstances() { return this.citizenManager.buildingInstances; }
    getCitizens() { return this.citizenManager.citizens; }

    // Logging (INCHANGÉ)
    logLoadedAssets() { /* ... */
         if (!this.assetLoader || !this.assetLoader.assets) return;
        const counts = Object.entries(this.assetLoader.assets)
            .map(([type, list]) => `${type}: ${list.length}`)
            .join(', ');
        console.log(`Assets loaded - ${counts}`);
     }
    logInitialZoneTypes() { /* ... */
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Initial zone types (from LayoutGenerator):", counts);
     }
    // logAdjustedZoneTypes() { /* Géré par DistrictManager */ }
    // assignDefaultTypeToUnassigned() { /* Géré par DistrictManager */ }

    // update() est appelé par World.js et délègue aux composants si nécessaire (INCHANGÉ)
    update() {
        // La mise à jour des fenêtres, lampadaires, agents est gérée par World.js
    }
}