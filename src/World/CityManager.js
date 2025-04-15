// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
import DistrictManager from './DistrictManager.js';
import LampPostManager from './LampPostManager.js';
import NavigationGraph from './NavigationGraph.js';
import Pathfinder from './Pathfinder.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration Initiale ---
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
            crosswalkWidth: 0.1, crosswalkHeight: 0.03, crosswalkStripeCount: 5, crosswalkStripeWidth: 0.6, crosswalkStripeGap: 0.5,
            // Districts
            minDistrictSize: 5, maxDistrictSize: 10, forceBusinessMaxDistance: 0.15,
            districtProbabilities: {
                business: { max: 0.15, decay: 10 },
                industrial: { base: 0.01, threshold: 0.85, factor: 5, multiplier: 0.2 },
                residential: { base: 0.8, peakCenter: 0.5, peakWidth: 0.2 }
            },
            validationZoneCenterMaxDist: 0.20, validationZoneEdgeMinDist: 0.80,
            minBusinessInCenter: 1, minIndustrialInEdge: 1,
            strictMinIndustrialDist: 0.35, strictMaxBusinessDist: 0.60,
            minTotalIndustrialDistricts: 1, maxTotalIndustrialDistricts: 5,
            minTotalBusinessDistricts: 1, maxTotalBusinessDistricts: 4,
            maxDistrictRegenAttempts: 15,
            // Plot Content
            sidewalkWidth: 2, sidewalkHeight: 0.2, centerlineWidth: 0.15, centerlineHeight: 0.02,
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
            // Assets
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
            showDistrictBoundaries: false,
            // Time
            dayNightCycleEnabled: true, dayDurationMinutes: 1, startTimeOfDay: 0.25,
            // Agents
            agentScale: 0.1, agentYOffset: 0.35, agentRotationSpeed: 20, agentWalkSpeed: 10,
            agentBobAmplitude: 0.15, agentStepLength: 1.5, agentStepHeight: 0.7, agentSwingAmplitude: 1.2,
            agentAnkleRotationAmplitude: Math.PI / 8, agentHandTiltAmplitude: 0.2, agentHeadNodAmplitude: 0.05,
            agentHeadYawAmplitude: 0.1, agentHeadTiltAmplitude: 0.08, agentHeadBobAmplitude: 0.06,
            agentAnimationSpeedFactor: 8,
            maxAgents: 500,
            // Capacités par défaut
            maxCitizensPerHouse: 5,
            maxCitizensPerBuilding: 10,
            maxWorkersPerSkyscraper: 100,
            maxWorkersPerIndustrial: 50,
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
            debugPlotGridMaterial: new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, side: THREE.DoubleSide }),
            debugParkOutlineMaterial: new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 2,
                depthTest: false
            }),
            lampLightConeMaterial: new THREE.MeshBasicMaterial({
                color: this.config.lampPostLightConeColor,
                transparent: true,
                opacity: this.config.lampPostLightConeOpacity,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        };

        // --- Composants ---
        this.assetLoader = new CityAssetLoader(this.config);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials, this.materials.debugPlotGridMaterial);
        this.navigationGraph = null;
        this.pathfinder = null;
        this.districts = [];
        this.leafPlots = [];

        // --- Groupes de scène ---
        this.cityContainer = new THREE.Group();
        this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.contentGroup = null;
        this.groundGroup = null;
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = "DebugVisuals";

        // --- Registres ---
        this.buildingInstances = new Map();
        this.citizens = new Map();
        this.nextBuildingInstanceId = 0;

        // --- Lampadaires via LampPostManager ---
        this.lampPostManager = new LampPostManager(this.config, this.materials, this.cityContainer);

        // Ajout des groupes dans la scène
        this.scene.add(this.cityContainer);
        if (this.experience.isDebugMode || this.config.showDistrictBoundaries) {
            this.cityContainer.add(this.debugGroup);
        }
        console.log("CityManager initialized (with park probability).");
    }

    registerBuildingInstance(plotId, assetType, position, capacityOverride = null) {
        const id = `bldg_${this.nextBuildingInstanceId++}`;
        let capacity = 0;
        let isWorkplace = false;
        switch (assetType) {
            case 'house':
                capacity = capacityOverride ?? this.config.maxCitizensPerHouse ?? 5;
                break;
            case 'building':
                capacity = capacityOverride ?? this.config.maxCitizensPerBuilding ?? 10;
                break;
            case 'skyscraper':
                capacity = capacityOverride ?? this.config.maxWorkersPerSkyscraper ?? 100;
                isWorkplace = true;
                break;
            case 'industrial':
                capacity = capacityOverride ?? this.config.maxWorkersPerIndustrial ?? 50;
                isWorkplace = true;
                break;
            case 'park':
            default:
                capacity = 0;
                break;
        }
        const buildingInfo = {
            id: id,
            plotId: plotId,
            type: assetType,
            position: position.clone(),
            capacity: capacity,
            isWorkplace: isWorkplace,
            occupants: []
        };
        this.buildingInstances.set(id, buildingInfo);
        return buildingInfo;
    }

    registerCitizen(citizenId, agentLogic) {
        if (this.citizens.has(citizenId)) {
            console.warn(`Citizen ${citizenId} already registered.`);
            return this.citizens.get(citizenId);
        }
        const citizenInfo = {
            id: citizenId,
            agentLogic: agentLogic,
            homeBuildingId: null,
            workBuildingId: null,
        };
        this.citizens.set(citizenId, citizenInfo);
        return citizenInfo;
    }

    assignHomeToCitizen(citizenId) {
        const citizenInfo = this.citizens.get(citizenId);
        if (!citizenInfo || citizenInfo.homeBuildingId) return false;
        const potentialHomes = Array.from(this.buildingInstances.values()).filter(b =>
            (b.type === 'house' || b.type === 'building') &&
            b.occupants.length < b.capacity
        );
        if (potentialHomes.length === 0) {
            console.warn(`No available home for citizen ${citizenId}`);
            return false;
        }
        const home = potentialHomes[Math.floor(Math.random() * potentialHomes.length)];
        home.occupants.push(citizenId);
        citizenInfo.homeBuildingId = home.id;
        if (citizenInfo.agentLogic) {
            citizenInfo.agentLogic.homeBuildingId = home.id;
        } else {
            console.warn(`Missing agent logic for citizen ${citizenId} during home assignment.`);
        }
        console.log(`Citizen ${citizenId} assigned home ${home.id} (Type: ${home.type})`);
        return true;
    }

    assignWorkplaceToCitizen(citizenId) {
        const citizenInfo = this.citizens.get(citizenId);
        if (!citizenInfo || citizenInfo.workBuildingId) return false;
        const potentialWorkplaces = Array.from(this.buildingInstances.values()).filter(b =>
            b.isWorkplace && b.occupants.length < b.capacity
        );
        if (potentialWorkplaces.length === 0) {
            console.warn(`No available workplace for citizen ${citizenId}`);
            return false;
        }
        const workplace = potentialWorkplaces[Math.floor(Math.random() * potentialWorkplaces.length)];
        workplace.occupants.push(citizenId);
        citizenInfo.workBuildingId = workplace.id;
        if (citizenInfo.agentLogic) {
            citizenInfo.agentLogic.workBuildingId = workplace.id;
        } else {
            console.warn(`Missing agent logic for citizen ${citizenId} during work assignment.`);
        }
        console.log(`Citizen ${citizenId} assigned workplace ${workplace.id} (Type: ${workplace.type})`);
        return true;
    }

    getBuildingInfo(buildingInstanceId) {
        return this.buildingInstances.get(buildingInstanceId);
    }

    getCitizenInfo(citizenId) {
        return this.citizens.get(citizenId);
    }

    async generateCity() {
        console.time("CityGeneration");
        this.clearCity();
        try {
            console.log("--- Starting city generation ---");
            this.createGlobalGround();
            console.time("AssetLoading");
            await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");
            this.logLoadedAssets();
            console.time("LayoutGeneration");
            this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");
            console.log(`Layout generated with ${this.leafPlots.length} plots.`);
            this.logInitialZoneTypes();
            if (!this.leafPlots || this.leafPlots.length === 0)
                throw new Error("Layout produced no plots.");

            // --- District Logic via DistrictManager ---
            console.time("DistrictFormationAndValidation");
            try {
                const districtManager = new DistrictManager(this.config, this.leafPlots, this.debugGroup);
                districtManager.generateAndValidateDistricts();
                this.districts = districtManager.getDistricts();
            } catch (error) {
                console.error("Error during district formation:", error);
                throw error;
            }
            console.timeEnd("DistrictFormationAndValidation");

            this.assignDefaultTypeToUnassigned();
            this.logAdjustedZoneTypes();

            console.time("RoadAndCrosswalkInfoGeneration");
            const { roadGroup, crosswalkInfos } = this.roadGenerator.generateRoads(this.leafPlots);
            this.roadGroup = roadGroup;
            this.cityContainer.add(this.roadGroup);
            console.timeEnd("RoadAndCrosswalkInfoGeneration");
            console.log(`Road network generated and ${crosswalkInfos.length} crosswalk locations identified.`);

            console.time("NavigationGraphBuilding");
            this.navigationGraph = new NavigationGraph(this.config);
            this.navigationGraph.buildGraph(this.leafPlots, crosswalkInfos);
            console.timeEnd("NavigationGraphBuilding");

            console.time("PathfinderInitialization");
            this.pathfinder = new Pathfinder(this.navigationGraph);
            console.timeEnd("PathfinderInitialization");

            console.time("ContentGeneration");
            const debugPlotGridGroup = this.experience.world ? this.experience.world.debugPlotGridGroup : null;
            const { sidewalkGroup, buildingGroup, groundGroup } = this.contentGenerator.generateContent(
                this.leafPlots,
                this.assetLoader,
                crosswalkInfos,
                this,
                debugPlotGridGroup
            );
            this.sidewalkGroup = sidewalkGroup;
            this.contentGroup = buildingGroup;
            this.groundGroup = groundGroup;
            this.cityContainer.add(this.sidewalkGroup);
            this.cityContainer.add(this.contentGroup);
            this.cityContainer.add(this.groundGroup);
            console.timeEnd("ContentGeneration");

            console.log(`Total Building Instances Registered: ${this.buildingInstances.size}`);

            // --- Lamp Post Generation via LampPostManager ---
            this.lampPostManager.addLampPosts(this.leafPlots);

            if (this.experience.isDebugMode) {
                console.time("DebugVisualsGeneration");
                if (!this.debugGroup.parent) {
                    this.cityContainer.add(this.debugGroup);
                }
                this.createParkDebugVisuals();
                console.timeEnd("DebugVisualsGeneration");
            } else {
                this.clearDebugVisuals();
                if (this.debugGroup.parent) {
                    this.cityContainer.remove(this.debugGroup);
                }
            }
            console.log("--- City generation finished ---");
        } catch (error) {
            console.error("Major error during generation:", error);
            this.clearCity();
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    clearDebugVisuals(visualType = null) {
        const objectsToRemove = [];
        for (let i = this.debugGroup.children.length - 1; i >= 0; i--) {
            const child = this.debugGroup.children[i];
            if ((visualType && child.userData.visualType === visualType) || !visualType) {
                objectsToRemove.push(child);
            }
        }
        objectsToRemove.forEach(child => {
            this.debugGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
        });
    }

    createParkDebugVisuals() {
        const visualType = 'ParkOutlines';
        this.clearDebugVisuals(visualType);
        if (!this.experience.isDebugMode) return;
        const debugHeight = 15.0;
        let parkCount = 0;
        this.leafPlots.forEach(plot => {
            if (plot.zoneType === 'park') {
                parkCount++;
                const points = [
                    new THREE.Vector3(plot.x, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z)
                ];
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                const lineLoop = new THREE.Line(lineGeometry, this.materials.debugParkOutlineMaterial);
                lineLoop.name = `ParkOutline_Plot_${plot.id}`;
                lineLoop.userData.visualType = visualType;
                lineLoop.renderOrder = 999;
                this.debugGroup.add(lineLoop);
            }
        });
        console.log(`Park debug visuals updated: ${parkCount} parks visualized.`);
    }

    createGlobalGround() {
        if (this.groundMesh && this.groundMesh.parent) return;
        if (this.groundMesh && !this.groundMesh.parent) { this.scene.add(this.groundMesh); return; }
        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = -0.01;
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "CityGround";
        this.scene.add(this.groundMesh);
        console.log(`CityGround created: ${this.config.mapSize}x${this.config.mapSize}`);
    }

    clearCity() {
        console.log("Clearing the existing city (including lamp posts)...");
        this.clearDebugVisuals();
        const disposeGroupContents = (group) => {
            if (!group) return;
            while (group.children.length > 0) {
                const obj = group.children[0];
                group.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
            }
        };
        if (this.roadGroup && this.roadGroup.parent) this.cityContainer.remove(this.roadGroup);
        disposeGroupContents(this.roadGroup); this.roadGroup = null;
        if (this.sidewalkGroup && this.sidewalkGroup.parent) this.cityContainer.remove(this.sidewalkGroup);
        disposeGroupContents(this.sidewalkGroup); this.sidewalkGroup = null;
        if (this.contentGroup && this.contentGroup.parent) this.cityContainer.remove(this.contentGroup);
        disposeGroupContents(this.contentGroup); this.contentGroup = null;
        if (this.groundGroup && this.groundGroup.parent) this.cityContainer.remove(this.groundGroup);
        disposeGroupContents(this.groundGroup); this.groundGroup = null;
        // Nettoyage des lampadaires via LampPostManager
        if (this.lampPostManager && this.lampPostManager.lampPostMeshes) {
            if (this.lampPostManager.lampPostMeshes.grey && this.lampPostManager.lampPostMeshes.grey.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.grey);
            if (this.lampPostManager.lampPostMeshes.light && this.lampPostManager.lampPostMeshes.light.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.light);
            if (this.lampPostManager.lampPostMeshes.lightCone && this.lampPostManager.lampPostMeshes.lightCone.parent) this.cityContainer.remove(this.lampPostManager.lampPostMeshes.lightCone);
            this.lampPostManager.lampPostMeshes = { grey: null, light: null, lightCone: null };
        }
        if (this.groundMesh && this.groundMesh.parent) this.scene.remove(this.groundMesh);
        if (this.groundMesh?.geometry) this.groundMesh.geometry.dispose();
        this.groundMesh = null;
        this.roadGenerator?.reset();
        this.contentGenerator?.reset(this.assetLoader);
        this.layoutGenerator?.reset();
        this.navigationGraph?.destroy(); this.navigationGraph = null;
        this.pathfinder = null;
        this.leafPlots = [];
        this.districts = [];
        this.buildingInstances.clear();
        this.citizens.clear();
        this.nextBuildingInstanceId = 0;
        console.log("City cleared.");
    }

    destroy() {
        console.log("Destroying CityManager (including lamp posts)...");
        this.clearCity();
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        this.materials = {};
        if (this.lampPostManager && this.lampPostManager.lampPostConeGeometry) {
            this.lampPostManager.lampPostConeGeometry.dispose();
            this.lampPostManager.lampPostConeGeometry = null;
        }
        this.assetLoader?.disposeAssets();
        this.assetLoader = null;
        if (this.cityContainer && this.cityContainer.parent) {
            this.cityContainer.parent.remove(this.cityContainer);
        }
        this.cityContainer = null;
        this.experience = null;
        this.scene = null;
        this.layoutGenerator = null;
        this.roadGenerator = null;
        this.contentGenerator = null;
        this.navigationGraph = null;
        this.pathfinder = null;
        this.districts = null;
        this.leafPlots = null;
        this.debugGroup = null;
        this.buildingInstances = null;
        this.citizens = null;
        console.log("CityManager destroyed.");
    }

    getPlots() { return this.leafPlots || []; }
    getDistricts() { return this.districts || []; }
    getNavigationGraph() { return this.navigationGraph; }
    getPathfinder() { return this.pathfinder; }
    getBuildingInstances() { return this.buildingInstances; }
    getCitizens() { return this.citizens; }

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
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Final zone types (after adjustment & fallback):", counts);
    }

    assignDefaultTypeToUnassigned() {
        console.log("Checking and assigning default type for unassigned plots...");
        let unassignedCorrected = 0;
        this.leafPlots.forEach(plot => {
            if (plot.districtId === null && plot.zoneType !== 'unbuildable' && plot.zoneType !== 'park') {
                const originalType = plot.zoneType;
                plot.zoneType = 'building';
                plot.isPark = false;
                console.warn(` -> Plot ${plot.id} (initial: ${originalType}) had no district. Forced to 'building'.`);
                unassignedCorrected++;
            }
        });
        if (unassignedCorrected > 0) {
            console.log(` -> ${unassignedCorrected} plots updated.`);
        } else {
            console.log(" -> All buildable plots have been assigned to a district.");
        }
    }

    update() {
        if (!this.lampPostManager || (!this.lampPostManager.lampPostMeshes.light && !this.lampPostManager.lampPostMeshes.lightCone)) return;
        const currentHour = (this.experience?.world?.environment)
            ? this.experience.world.environment.getCurrentHour()
            : 12;
        this.lampPostManager.updateLampPostLights(currentHour);
    }
}
