// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
import District from './District.js';
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
            minPlotSize: 30, // <- Augmenté un peu par rapport à la version précédente pour test
            maxPlotSize: 60,
            maxRecursionDepth: 7,
            // --- AJOUT DE LA PROBABILITÉ MANQUANTE ---
            parkProbability: 0.05, // Par exemple, 5% de chance qu'une parcelle devienne un parc
            // -----------------------------------------
            industrialZoneProbability: 0.15, // Probabilités existantes
            houseZoneProbability: 0.40,      // Ajustées pour faire de la place à Park/Skyscraper
            skyscraperZoneProbability: 0.10, // (Le reste sera 'building' par défaut dans collectLeafPlots)

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

            // --- Espacements Minimum ---
            minHouseSpacing: 5.0,
            minBuildingSpacing: 3.0,
            minIndustrialSpacing: 3.0,
            minSkyscraperSpacing: 4.0,
            minParkSpacing: 2.0,

            // --- Échelles de Base ---
            gridHouseBaseScale: 6.5,
            gridBuildingBaseScale: 1,
            gridIndustrialBaseScale: 1.2,
            gridSkyscraperBaseScale: 1.7,

             // Assets (Chemins et dimensions de base)
             houseModelDir: "Public/Assets/Models/Houses/", houseModelFiles: [ { file: "House1.fbx", scale: 1.3 }, { file: "House24.fbx", scale: 1.3 }, ],
             houseBaseWidth: 5, houseBaseHeight: 6, houseBaseDepth: 5,
             buildingModelDir: "Public/Assets/Models/Buildings/", buildingModelFiles: [ { file: "Building1.fbx", scale: 0.8 }, { file: "Building10.glb", scale: 0.8 }, ],
             buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
             industrialModelDir: "Public/Assets/Models/Industrials/", industrialModelFiles: [ { file: "Factory1_glb.glb", scale: 1 }, { file: "Factory2_glb.glb", scale: 1 }, { file: "Factory3_glb.glb", scale: 1 } ],
             industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
             parkModelDir: "Public/Assets/Models/Parks/", parkModelFiles: [ { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 }, { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 } ],
             parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,
             treeModelDir: "Public/Assets/Models/Trees/", treeModelFiles: [{ file: "Tree2.glb", scale: 0.9 }, { file: "Tree3.glb", scale: 0.9 }, { file: "Tree4.glb", scale: 0.9 }, { file: "Tree5.glb", scale: 0.9 }, { file: "Tree6.glb", scale: 0.9 } ],
             treeBaseWidth: 4, treeBaseHeight: 8, treeBaseDepth: 4,
             skyscraperModelDir: "Public/Assets/Models/Skyscrapers/", skyscraperModelFiles: [ { file: "Skyscraper1.glb", scale: 0.8 }, { file: "Skyscraper2.glb", scale: 1 }, { file: "Skyscraper3.glb", scale: 1 }, ],
             skyscraperBaseWidth: 15, skyscraperBaseHeight: 80, skyscraperBaseDepth: 15,
             // Tree Placement
             treePlacementProbabilitySidewalk: 0.3,
             treePlacementProbabilityPark: 0.04,
             // Debug
             showDistrictBoundaries: false, // Mettre à true pour voir les districts
             // Time
             dayNightCycleEnabled: true, dayDurationMinutes: 1, startTimeOfDay: 0.25,
             // Agents
             agentScale: 0.1, agentYOffset: 0.35, agentRotationSpeed: 20, agentWalkSpeed: 10,
             agentBobAmplitude: 0.15, agentStepLength: 1.5, agentStepHeight: 0.7, agentSwingAmplitude: 1.2,
             agentAnkleRotationAmplitude: Math.PI / 8, agentHandTiltAmplitude: 0.2, agentHeadNodAmplitude: 0.05,
             agentHeadYawAmplitude: 0.1, agentHeadTiltAmplitude: 0.08, agentHeadBobAmplitude: 0.06,
             agentAnimationSpeedFactor: 8,
             maxAgents: 500,
              // Default Capacities
              maxCitizensPerHouse: 5,
              maxCitizensPerBuilding: 10,
              maxWorkersPerSkyscraper: 100,
              maxWorkersPerIndustrial: 50,

			 lampPostLightConeRadiusBottom: 5.0, // Rayon du cône au sol
             lampPostLightConeOpacity: 0.0023,      // Opacité du cône

             lampPostLightConeColor: 0xFFFF99      // Couleur du cône (jaune pâle)
        };

        // --- External Config Merge ---
        const deepMerge = (target, source) => {
             for (const key in source) {
                 if (source.hasOwnProperty(key)) {
                     if (source[key] instanceof Object && !(source[key] instanceof THREE.Color) && !(source[key] instanceof THREE.Vector3) && key in target && target[key] instanceof Object && !(target[key] instanceof THREE.Color) && !(target[key] instanceof THREE.Vector3)) {
                         deepMerge(target[key], source[key]);
                     } else {
                         target[key] = source[key];
                     }
                 }
             }
             return target;
         };
         deepMerge(this.config, config);


        // --- Materials ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x272442, metalness: 0.1, roughness: 0.8 }), // Sol extérieur
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.8 }),
            crosswalkMaterial: new THREE.MeshStandardMaterial({ color: 0xE0E0E0, roughness: 0.7, metalness: 0.1 }),

            // --- Couleurs des sols des parcelles ---
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }), // Vert pour les parcs
            houseGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }), // Terre de Sienne pour résidentiel 'house'
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x676d70 }), // Gris pour 'building' générique
            industrialGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x676d70 }), // Bleu acier pour industriel
            skyscraperGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x708090 }), // Gris ardoise pour gratte-ciel ('business')

            // --- Matériaux Debug (existants) ---
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
                side: THREE.DoubleSide, // Important pour voir l'intérieur et l'extérieur
                depthWrite: false      // Important pour le rendu correct de la transparence
            })
        };

        // --- Components ---
        this.navigationGraph = null;
        this.pathfinder = null;
        this.assetLoader = new CityAssetLoader(this.config);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials, this.materials.debugPlotGridMaterial);
        this.districts = [];
        this.leafPlots = [];

        // --- Scene Groups ---
        this.cityContainer = new THREE.Group(); this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.contentGroup = null;
        this.groundMesh = null;
        this.debugGroup = new THREE.Group(); this.debugGroup.name = "DebugVisuals";

        // --- Registers ---
        this.buildingInstances = new Map();
        this.citizens = new Map();
        this.nextBuildingInstanceId = 0;

		this.lampPostConeGeometry = null;
		this.lampPostMeshes = {
            grey: null,
            light: null,
            lightCone: null // Pour stocker l'InstancedMesh des cônes
        };

        this.scene.add(this.cityContainer);
        if (this.experience.isDebugMode || this.config.showDistrictBoundaries) { // Ajusté pour prendre en compte la config aussi
             this.cityContainer.add(this.debugGroup);
        }
        console.log("CityManager initialized (with park probability).");
    }
	
	registerBuildingInstance(plotId, assetType, position, capacityOverride = null) {
        const id = `bldg_${this.nextBuildingInstanceId++}`;
        let capacity = 0;
        let isWorkplace = false; // Pour déterminer si c'est un lieu de travail potentiel

        switch (assetType) {
            case 'house':
                capacity = capacityOverride ?? this.config.maxCitizensPerHouse ?? 5;
                break;
            case 'building': // Supposons que 'building' soit résidentiel ici
                capacity = capacityOverride ?? this.config.maxCitizensPerBuilding ?? 10;
                break;
            case 'skyscraper':
                capacity = capacityOverride ?? this.config.maxWorkersPerSkyscraper ?? 100; // Capacité pour les travailleurs
                isWorkplace = true;
                break;
             // Les autres types (industrial, park, tree) ont une capacité de 0 par défaut
             case 'industrial':
                 capacity = capacityOverride ?? this.config.maxWorkersPerIndustrial ?? 50; // Potentiellement lieu de travail
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
            position: position.clone(), // Position de référence (entrée/centre)
            capacity: capacity,
            isWorkplace: isWorkplace,   // Indique si c'est un lieu de travail
            occupants: [], // IDs des citoyens (résidents OU travailleurs)
        };
        this.buildingInstances.set(id, buildingInfo);
        // console.log(`Building registered: ${id} (Type: ${assetType}, Plot: ${plotId}, Capacity: ${capacity}, Workplace: ${isWorkplace}) at`, position);
        return buildingInfo; // Retourne l'info enregistrée, y compris l'ID généré
    }

	registerCitizen(citizenId, agentLogic) {
        if (this.citizens.has(citizenId)) {
            console.warn(`Citizen ${citizenId} déjà enregistré.`);
            return this.citizens.get(citizenId);
        }
        const citizenInfo = {
            id: citizenId,
            agentLogic: agentLogic, // Référence à l'instance Agent logique
            homeBuildingId: null,
            workBuildingId: null,
        };
        this.citizens.set(citizenId, citizenInfo);
        return citizenInfo;
    }

    assignHomeToCitizen(citizenId) {
        const citizenInfo = this.citizens.get(citizenId);
        if (!citizenInfo || citizenInfo.homeBuildingId) return false; // Déjà un domicile

        // Trouver des maisons/immeubles résidentiels ('building') avec de la place
        const potentialHomes = Array.from(this.buildingInstances.values()).filter(b =>
            (b.type === 'house' || b.type === 'building') && // Uniquement maisons et immeubles (résidentiels)
            b.occupants.length < b.capacity
        );

        if (potentialHomes.length === 0) {
            console.warn(`Aucun domicile (maison/immeuble) disponible pour le citoyen ${citizenId}`);
            return false;
        }

        // Choisir un domicile aléatoire parmi ceux disponibles
        const home = potentialHomes[Math.floor(Math.random() * potentialHomes.length)];
        home.occupants.push(citizenId); // Ajouter le citoyen aux occupants
        citizenInfo.homeBuildingId = home.id; // Stocker l'ID du domicile

        // Mettre à jour l'agent logique directement (meilleure pratique que de dépendre d'un autre appel)
        if (citizenInfo.agentLogic) {
            citizenInfo.agentLogic.homeBuildingId = home.id;
        } else {
             console.warn(`Agent logique manquant pour citoyen ${citizenId} lors de l'assignation du domicile.`);
        }

        console.log(`Citoyen ${citizenId} assigné au domicile ${home.id} (Type: ${home.type})`);
        return true;
    }

	assignWorkplaceToCitizen(citizenId) {
        const citizenInfo = this.citizens.get(citizenId);
        if (!citizenInfo || citizenInfo.workBuildingId) return false; // Déjà un travail

        // Trouver des bâtiments marqués comme 'isWorkplace' avec de la place
        const potentialWorkplaces = Array.from(this.buildingInstances.values()).filter(b =>
            b.isWorkplace && b.occupants.length < b.capacity
        );

        if (potentialWorkplaces.length === 0) {
            console.warn(`Aucun lieu de travail (skyscraper/industrial) disponible pour le citoyen ${citizenId}`);
            return false;
        }

        // Choisir un lieu de travail aléatoire
        const workplace = potentialWorkplaces[Math.floor(Math.random() * potentialWorkplaces.length)];
        workplace.occupants.push(citizenId); // Ajouter le citoyen aux 'occupants' (travailleurs)
        citizenInfo.workBuildingId = workplace.id; // Stocker l'ID

        // Mettre à jour l'agent logique directement
        if (citizenInfo.agentLogic) {
            citizenInfo.agentLogic.workBuildingId = workplace.id;
        } else {
             console.warn(`Agent logique manquant pour citoyen ${citizenId} lors de l'assignation du travail.`);
        }

        console.log(`Citoyen ${citizenId} assigné au lieu de travail ${workplace.id} (Type: ${workplace.type})`);
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
		this.clearCity(); // Appelle maintenant aussi clearDebugVisuals
	
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
	
			// --- District Logic ---
			let districtLayoutValid = false;
			let attempts = 0;
			console.time("DistrictFormationAndValidation");
			while (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
				attempts++;
				console.log(`\nAttempting district formation/validation #${attempts}...`);
				this.districts = [];
				this.leafPlots.forEach(p => {
					p.districtId = null;
					p.buildingInstances = [];
				});
				this.createDistricts_V2(); // Fonction interne de création/assignation
				this.logDistrictStats();
				districtLayoutValid = this.validateDistrictLayout();
				if (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
					console.log(`Invalid layout, retrying...`);
				} else if (!districtLayoutValid) {
					console.error(`ERROR: Could not get a valid district layout after ${attempts} attempts.`);
				}
			}
			console.timeEnd("DistrictFormationAndValidation");
			if (!districtLayoutValid)
				throw new Error(`Critical failure: Invalid district layout after ${attempts} attempts.`);
			console.log("District layout validated...");
	
			console.time("PlotTypeAdjustment");
			this.adjustPlotTypesWithinDistricts();
			console.timeEnd("PlotTypeAdjustment");
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
	
			// ------ Nouvelle étape : Ajout des lampadaires sur les trottoirs ------
			this.addLampPosts();
	
			// --- Debug Visuals ---
			if (this.experience.isDebugMode) {
				console.time("DebugVisualsGeneration");
				if (!this.debugGroup.parent) {
					this.cityContainer.add(this.debugGroup);
				}
				this.createDistrictDebugVisuals();
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

	buildLampPostGeometries() {
        console.warn("--- UTILISATION GÉOMÉTRIE LAMPADAIRE SIMPLIFIÉE (SANS COURBE) ---");
        const poleSegments = 16;
        const baseRadiusTop = 0.4; const baseRadiusBottom = 0.5; const baseHeight = 0.8;
        const poleRadius = 0.2; const poleLowerHeight = 5;
        const poleTopY = baseHeight + poleLowerHeight; // Coordonnée Y du sommet du poteau
        const armLength = 2.5;
        const lampHeadWidth = 1.2; const lampHeadHeight = 0.4; const lampHeadDepth = 0.6;
        const lightSourceWidth = lampHeadWidth * 0.8; const lightSourceHeight = 0.35; const lightSourceDepth = lampHeadDepth * 0.8;

        // --- Calculs pour le cône ---
        const lightSourceCenterY = poleTopY - lampHeadHeight - lightSourceHeight / 2; // Y approx. de l'ampoule
        const coneHeight = lightSourceCenterY - (this.config.sidewalkHeight ?? 0.2) + 1; // Hauteur du cône jusqu'au trottoir
        const coneRadiusBottom = this.config.lampPostLightConeRadiusBottom ?? 5.0;
        const coneRadiusTop = 0.1; // Petit rayon en haut
        const coneRadialSegments = 16;

        // --- Création géométrie Cône (et stockage) ---
        if (coneHeight > 0) {
            this.lampPostConeGeometry = new THREE.ConeGeometry(
                coneRadiusBottom, coneHeight, coneRadialSegments, 1, true
            );
            this.lampPostConeGeometry.translate(0, coneHeight / 2 - 2.5, 0); // Centre le cône verticalement
            // !!! CORRECTION : Ajouter computeBoundingBox aussi pour le cône !!!
            this.lampPostConeGeometry.computeBoundingBox();
            console.log(`Géométrie cône lumière créée (H: ${coneHeight.toFixed(1)}, R_bas: ${coneRadiusBottom})`);
        } else {
            console.error("Hauteur du cône calculée négative ou nulle. Impossible de créer la géométrie du cône.");
            this.lampPostConeGeometry = null;
        }

        // --- Construction des autres parties du lampadaire ---
        const baseGeo = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, baseHeight, poleSegments);
        baseGeo.translate(0, baseHeight / 2, 0);
        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleLowerHeight, poleSegments);
        poleGeo.translate(0, baseHeight + poleLowerHeight / 2, 0);
        const armGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, armLength, poleSegments);
        armGeo.rotateZ(Math.PI / 2); armGeo.translate(armLength / 2, poleTopY, 0);
        const lampHeadGeo = new THREE.BoxGeometry(lampHeadWidth, lampHeadHeight, lampHeadDepth);
        lampHeadGeo.translate(armLength, poleTopY - lampHeadHeight / 2, 0);
        const lightGeo = new THREE.BoxGeometry(lightSourceWidth, lightSourceHeight, lightSourceDepth);
        lightGeo.translate(armLength, lightSourceCenterY, 0);
        // !!! CORRECTION : Ajouter computeBoundingBox pour lightGeo !!!
        lightGeo.computeBoundingBox();


        const greyGeos = [baseGeo, poleGeo, armGeo, lampHeadGeo];
        const mergedGreyGeo = mergeGeometries(greyGeos, false);

        if (!mergedGreyGeo) {
            console.error("Échec critique de la fusion des géométries du lampadaire (parties grises).");
            greyGeos.forEach(g => g.dispose());
             // Nettoyer lightGeo aussi si la fusion échoue
             lightGeo.dispose();
             // Retourner un objet vide ou gérer l'erreur autrement
             return { greyGeometry: null, lightGeometry: null, greyMaterial: null, lightMaterial: null };
        }

        // !!! CORRECTION : Calculer la bounding box APRÈS la fusion !!!
        mergedGreyGeo.computeBoundingBox();
        // ----------------------------------------------------------

        greyGeos.forEach(g => g.dispose()); // Nettoyer les géométries intermédiaires

        const greyMaterial = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.6, metalness: 0.9, name: "LampPostGreyMat_Simplified" });
        const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffdd, emissiveIntensity: 0.0, name: "LampPostLightMat_Simplified" });

        return {
            greyGeometry: mergedGreyGeo, // Maintenant avec une boundingBox calculée
            lightGeometry: lightGeo,     // A maintenant une boundingBox calculée
            greyMaterial,
            lightMaterial
        };
    }
	
	addLampPosts() {
        const spacing = this.config.lampPostSpacing || 20;
        const lampData = []; // Stocke des objets { position: Vector3, angleY: number }
        const sidewalkH = this.config.sidewalkHeight || 0.2;
        // Message mis à jour pour refléter la nouvelle orientation (corrigée)
        console.log(`Ajout des lampadaires avec espacement ${spacing} et orientation parallèle au trottoir (corrigée)...`);

        const positionMap = new Map(); // Utiliser une Map pour stocker { positionKey: angleY }

        const addLampData = (x, z, angleY) => {
            const key = `${x.toFixed(1)},${z.toFixed(1)}`; // Clé basée sur position arrondie
            // Ajouter seulement si la position n'existe pas déjà (évite doublons aux coins)
            if (!positionMap.has(key)) {
                 positionMap.set(key, angleY); // Stocker l'angle associé
                 lampData.push({
                    position: new THREE.Vector3(x, sidewalkH, z),
                    // --- Correction : Normaliser l'angle pour être dans [-PI, PI] ou [0, 2PI] ---
                    // Math.atan2(Math.sin(angleY), Math.cos(angleY)) fait cela proprement.
                    angleY: Math.atan2(Math.sin(angleY), Math.cos(angleY))
                 });
            }
            // Si la clé existe déjà, on garde l'angle du premier lampadaire ajouté à cet emplacement.
        };

        this.leafPlots.forEach(plot => {
            if (plot.zoneType === 'park' || plot.zoneType === 'unbuildable') return;

            const plotX = plot.x;
            const plotZ = plot.z;
            const plotW = plot.width;
            const plotD = plot.depth;
            const sidewalkOffset = (this.config.sidewalkWidth || 0) / 2;

            // --- Placement et calcul de l'angle pour chaque bord (ANGLES CORRIGÉS) ---

            // Bord Supérieur (Z constant = plot.z - offset)
            // Pointe vers +X (supposé correct)
            const angleTop = Math.PI / 2; // INCHANGÉ par rapport à la version précédente
            for (let x = plotX; x <= plotX + plotW; x += spacing) {
                addLampData(x, plotZ - sidewalkOffset, angleTop);
            }

            // Bord Inférieur (Z constant = plot.z + plotD + offset)
            // Pointe vers -X dans la version précédente (-PI/2). Doit pointer vers +X.
            // Rotation de 180° (PI) -> -PI/2 + PI = PI/2
            const angleBottom = -Math.PI / 2; // <- MODIFIÉ (était -Math.PI / 2)
             for (let x = plotX; x <= plotX + plotW; x += spacing) {
                addLampData(x, plotZ + plotD + sidewalkOffset, angleBottom);
            }

            // Bord Gauche (X constant = plot.x - offset)
            // Pointe vers -Z (supposé correct)
            const angleLeft = Math.PI; // INCHANGÉ par rapport à la version précédente
             // Exclure les coins déjà potentiellement faits par les bords haut/bas
            for (let z = plotZ + spacing / 2; z < plotZ + plotD; z += spacing) { // Léger décalage pour éviter coin exact
                addLampData(plotX - sidewalkOffset, z, angleLeft);
            }

            // Bord Droit (X constant = plot.x + plotW + offset)
            // Pointe vers +Z dans la version précédente (PI). Doit pointer vers -Z.
            // Rotation de 180° (PI) -> PI + PI = 2*PI (équivalent à 0)
            const angleRight = Math.PI * 2; // <- MODIFIÉ (était Math.PI)
            // Exclure les coins déjà potentiellement faits
             for (let z = plotZ + spacing / 2; z < plotZ + plotD; z += spacing) {
                addLampData(plotX + plotW + sidewalkOffset, z, angleRight);
            }
        });

        if (lampData.length === 0) {
            console.log("Aucune position de lampadaire générée.");
            return;
        }

        console.log(`${lampData.length} lampadaires uniques à créer (avec orientation parallèle corrigée).`);
        this.createLampPostInstancedMeshes(lampData); // Passer les données complètes
    }

	createLampPostInstancedMeshes(lampData) { // Paramètre renommé
        const { greyGeometry, lightGeometry, greyMaterial, lightMaterial } = this.buildLampPostGeometries();

        const coneGeometry = this.lampPostConeGeometry;
        const coneMaterial = this.materials.lampLightConeMaterial;

        if (!greyGeometry || !lightGeometry || !greyGeometry.boundingBox || !lightGeometry.boundingBox) {
            console.error("Échec création InstancedMesh: géométrie(s) grise/lumière invalide(s) ou boundingBox manquante.");
            return;
        }
         // coneGeometry peut être null, géré plus bas

        const count = lampData.length; // Utiliser lampData
        if (count === 0) return;
        console.log(`Création des InstancedMesh pour ${count} lampadaires (orientation plot + cônes corrigés)...`);

        // Création des InstancedMesh (inchangé)
        const greyInstancedMesh = new THREE.InstancedMesh(greyGeometry, greyMaterial, count);
        greyInstancedMesh.name = "LampPosts_GreyParts_Instanced";
        const lightInstancedMesh = new THREE.InstancedMesh(lightGeometry, lightMaterial, count);
        lightInstancedMesh.name = "LampPosts_LightParts_Instanced";

        let coneInstancedMesh = null;
        let coneHeight = 0;
        if (coneGeometry && coneMaterial) {
            coneInstancedMesh = new THREE.InstancedMesh(coneGeometry, coneMaterial, count);
            coneInstancedMesh.name = "LampPosts_LightCones_Instanced";
            coneInstancedMesh.visible = false;
            coneHeight = coneGeometry.parameters.height;
            if (!coneGeometry.boundingBox) coneGeometry.computeBoundingBox(); // Assurer BBox pour le cône
        }

        const dummy = new THREE.Object3D();
        const coneMatrix = new THREE.Matrix4();
        const armLength = 2.5;

        // Calcul précis Y ampoule (inchangé)
        const baseHeight = 0.8; const poleLowerHeight = 5; const lampHeadHeight = 0.4; const lightSourceHeight = 0.35;
        const poleTopY = baseHeight + poleLowerHeight;
        const calculatedLightSourceCenterY = poleTopY - lampHeadHeight - lightSourceHeight / 2;

        // --- Objets temporaires pour calcul cône ---
        const lampRotation = new THREE.Quaternion();
        const coneUpVector = new THREE.Vector3(0, 1, 0); // Vecteur Y local du cône
        const positionOffset = new THREE.Vector3();
        const coneScale = new THREE.Vector3(1, 1, 1);
        // ----------------------------------------


        for (let i = 0; i < count; i++) {
            const data = lampData[i]; // Récupérer les données pour cette instance

            // --- Position et Orientation du Lampadaire ---
            dummy.position.copy(data.position);
            dummy.rotation.set(0, data.angleY, 0); // Utiliser l'angle calculé
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            // ------------------------------------------

            greyInstancedMesh.setMatrixAt(i, dummy.matrix);
            lightInstancedMesh.setMatrixAt(i, dummy.matrix);

            // --- Matrice pour le cône (si existant) ---
            if (coneInstancedMesh && coneHeight > 0) {
                 // 1. Position monde de l'ampoule (inchangé)
                 const localBulbPos = new THREE.Vector3(armLength, calculatedLightSourceCenterY, 0);
                 const worldBulbPos = localBulbPos.applyMatrix4(dummy.matrix);

                 // 2. Rotation du lampadaire/cône (identique au dummy)
                 lampRotation.setFromRotationMatrix(dummy.matrix);

                 // 3. Position finale du *centre* du cône
                 // On veut que le sommet (apex) du cône (local Y = +coneHeight/2) soit à worldBulbPos.
                 // Le centre de la géométrie du cône (local Y = 0) doit donc être décalé vers le bas
                 // depuis worldBulbPos, le long de l'axe Y *local* du cône (qui est maintenant orienté comme le lampadaire),
                 // d'une distance de coneHeight / 2.
                 positionOffset.copy(coneUpVector)          // Prend le vecteur Y (0,1,0)
                               .applyQuaternion(lampRotation) // Oriente ce vecteur comme le lampadaire
                               .multiplyScalar(-coneHeight / 2); // Le multiplie par -hauteur/2 pour obtenir le décalage vers le bas

                 const coneCenterPos = worldBulbPos.clone().add(positionOffset); // Applique le décalage

                 // 4. Composer la matrice SANS rotation additionnelle (la géométrie pointe déjà vers +Y)
                 coneMatrix.compose(coneCenterPos, lampRotation, coneScale);
                 coneInstancedMesh.setMatrixAt(i, coneMatrix);
            }
        }

        // Mises à jour GPU, ombres, ajout scène (inchangé)
        greyInstancedMesh.instanceMatrix.needsUpdate = true;
        lightInstancedMesh.instanceMatrix.needsUpdate = true;
        if (coneInstancedMesh) coneInstancedMesh.instanceMatrix.needsUpdate = true;

        greyInstancedMesh.castShadow = true; greyInstancedMesh.receiveShadow = true;
        lightInstancedMesh.castShadow = false; lightInstancedMesh.receiveShadow = false;
        if (coneInstancedMesh) { coneInstancedMesh.castShadow = false; coneInstancedMesh.receiveShadow = false; }

        if (this.cityContainer) {
            this.cityContainer.add(greyInstancedMesh);
            this.cityContainer.add(lightInstancedMesh);
            if (coneInstancedMesh) this.cityContainer.add(coneInstancedMesh);
            console.log("InstancedMesh des lampadaires (orientés plot, cônes corrigés) ajoutés.");
        } else { /* ... erreur ... */ }

        this.lampPostMeshes.grey = greyInstancedMesh;
        this.lampPostMeshes.light = lightInstancedMesh;
        this.lampPostMeshes.lightCone = coneInstancedMesh;

        if(this.experience?.world?.environment) {
            this.updateLampPostLights(this.experience.world.environment.getCurrentHour());
        } else {
            this.updateLampPostLights(12);
        }
    }

	updateLampPostLights(currentHour) {
        if (!this.lampPostMeshes || (!this.lampPostMeshes.light && !this.lampPostMeshes.lightCone)) {
            return;
        }
        const lightsOn = (currentHour >= 18 || currentHour < 6);
        const lightMesh = this.lampPostMeshes.light;
        if (lightMesh && lightMesh.material) {
            const targetIntensity = lightsOn ? 1.8 : 0.0;
            if (lightMesh.material.emissiveIntensity !== targetIntensity) {
                lightMesh.material.emissiveIntensity = targetIntensity;
            }
        }
        const coneMesh = this.lampPostMeshes.lightCone;
        if (coneMesh) {
            if (coneMesh.visible !== lightsOn) {
                coneMesh.visible = lightsOn;
            }
        }
    }

	clearDebugVisuals(visualType = null) {
        const objectsToRemove = [];
        for (let i = this.debugGroup.children.length - 1; i >= 0; i--) {
            const child = this.debugGroup.children[i];
            // Si on cible un type et que l'enfant correspond OU si on ne cible pas de type (tout nettoyer)
            if ((visualType && child.userData.visualType === visualType) || !visualType) {
                 objectsToRemove.push(child);
            }
        }

        objectsToRemove.forEach(child => {
             this.debugGroup.remove(child);
             if (child.geometry) child.geometry.dispose();
             // Ne pas disposer les matériaux ici s'ils sont partagés (comme debugParkOutlineMaterial)
             // Sauf si c'est un matériau unique créé dynamiquement (pas le cas ici)
        });
         // console.log(`Debug visuals of type '${visualType || 'ALL'}' cleared.`);
    }

	createParkDebugVisuals() {
        const visualType = 'ParkOutlines';
        this.clearDebugVisuals(visualType); // Nettoyer seulement les outlines de parc existants

        if (!this.experience.isDebugMode) return; // Ne rien faire si le mode debug n'est pas actif

        const debugHeight = 15.0; // Hauteur au-dessus du sol pour la visibilité
        let parkCount = 0;

        this.leafPlots.forEach(plot => {
            if (plot.zoneType === 'park') {
                parkCount++;
                const points = [
                    new THREE.Vector3(plot.x, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z) // Fermer la boucle
                ];
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                // Utilise le matériau défini dans le constructeur
                const lineLoop = new THREE.Line(lineGeometry, this.materials.debugParkOutlineMaterial);
                lineLoop.name = `ParkOutline_Plot_${plot.id}`;
                lineLoop.userData.visualType = visualType; // Marqueur pour le nettoyage
                lineLoop.renderOrder = 999; // Rendu au-dessus des autres éléments debug
                this.debugGroup.add(lineLoop);
            }
        });
        console.log(`Debug visuals (Park Outlines) updated: ${parkCount} parks visualized.`);
    }

	createGlobalGround() {
        if (this.groundMesh && this.groundMesh.parent) return;
        if (this.groundMesh && !this.groundMesh.parent) { this.scene.add(this.groundMesh); return; }

        // Utiliser mapSize directement, sans le * 1.2
        const groundGeometry = new THREE.PlaneGeometry(
            this.config.mapSize, // <-- MODIFIÉ
            this.config.mapSize  // <-- MODIFIÉ
        );
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        // Garder légèrement en dessous de 0
        this.groundMesh.position.y = -0.01;
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "CityGround"; // Renommé pour clarté
        this.scene.add(this.groundMesh);
        console.log(`Sol intérieur (CityGround) créé : ${this.config.mapSize}x${this.config.mapSize}`);
    }
	
    // ----- createDistricts_V2 (MODIFIÉ avec Phase 2) -----
    createDistricts_V2() {
        if (!this.leafPlots || this.leafPlots.length === 0) {
            console.warn("createDistricts_V2: Aucune parcelle disponible pour former des districts.");
            return;
        }

        const allPlots = [...this.leafPlots];
        const assignedPlotIds = new Set(); // Suit les parcelles assignées PENDANT cette tentative

        // Filtrer les non constructibles initialement
        let availablePlotsForPhase1 = allPlots.filter(p => p.zoneType !== 'unbuildable');

        const mapRadius = this.config.mapSize / 2;
        if (mapRadius <= 0) {
            console.error("createDistricts_V2: mapRadius invalide.");
            return;
        }

        // --- PHASE 1: Seed and Grow Districts ---
        console.log("District Formation - Phase 1: Seed & Grow");

        while (availablePlotsForPhase1.length >= this.config.minDistrictSize) {
            const seedIndex = Math.floor(Math.random() * availablePlotsForPhase1.length);
            const seedPlot = availablePlotsForPhase1[seedIndex];

            // Vérif de sécurité (ne devrait pas arriver avec la logique actuelle)
            if (assignedPlotIds.has(seedPlot.id)) {
                availablePlotsForPhase1.splice(seedIndex, 1); // Retirer si déjà assigné
                continue;
            }

            const distToCenter = seedPlot.center.length();
            const normalizedDistance = Math.max(0, Math.min(1, distToCenter / mapRadius));
            let districtType;

            if (normalizedDistance < this.config.forceBusinessMaxDistance) {
                districtType = 'business';
            } else {
                const probabilities = this.getDistrictTypeProbabilities(distToCenter);
                districtType = this.chooseDistrictType(probabilities);
            }

            const newDistrict = new District(districtType);
            const queue = [seedPlot];
            const currentDistrictAssigned = new Set(); // Suit les parcelles ajoutées à ce district spécifique

            // Ajouter la parcelle de départ
            newDistrict.addPlot(seedPlot); // addPlot met à jour plot.districtId
            assignedPlotIds.add(seedPlot.id);
            currentDistrictAssigned.add(seedPlot.id);
            // Retirer la parcelle de départ de la liste dispo pour Phase 1
            availablePlotsForPhase1.splice(seedIndex, 1);

            let head = 0;
            while (head < queue.length && newDistrict.plots.length < this.config.maxDistrictSize) {
                const currentPlot = queue[head++];
                // Trouver les voisins parmi TOUTES les parcelles
                const neighbors = this.findNeighbors(currentPlot, allPlots);

                for (const neighbor of neighbors) {
                    // Vérifier si voisin valide, pas assigné globalement, et pas déjà dans ce district
                    if (neighbor.zoneType !== 'unbuildable' &&
                        !assignedPlotIds.has(neighbor.id) &&
                        !currentDistrictAssigned.has(neighbor.id))
                    {
                        let canAddNeighbor = true;
                        const neighborDistToCenter = neighbor.center.length();
                        const neighborNormalizedDistance = Math.max(0, Math.min(1, neighborDistToCenter / mapRadius));

                        // Appliquer règles strictes basées sur le TYPE DU DISTRICT EN COURS DE FORMATION
                        if (newDistrict.type === 'industrial') {
                            if (neighborNormalizedDistance < this.config.strictMinIndustrialDist) {
                                canAddNeighbor = false;
                            }
                        } else if (newDistrict.type === 'business') {
                            if (neighborNormalizedDistance > this.config.strictMaxBusinessDist) {
                                canAddNeighbor = false;
                            }
                        }

                        if (newDistrict.plots.length < this.config.maxDistrictSize && canAddNeighbor) {
                            newDistrict.addPlot(neighbor);
                            assignedPlotIds.add(neighbor.id);
                            currentDistrictAssigned.add(neighbor.id);
                            queue.push(neighbor);
                            // Retirer le voisin ajouté de la liste dispo pour Phase 1
                            const neighborIndexInAvailable = availablePlotsForPhase1.findIndex(p => p.id === neighbor.id);
                            if (neighborIndexInAvailable > -1) {
                                availablePlotsForPhase1.splice(neighborIndexInAvailable, 1);
                            }
                        } else {
                            if (newDistrict.plots.length >= this.config.maxDistrictSize) {
                                break; // Taille max atteinte pour ce district
                            }
                            // Sinon: canAddNeighbor est false, continuer à vérifier les autres voisins
                        }
                    }
                } // Fin boucle voisins
            } // Fin boucle BFS

            // Vérifier si le district a atteint la taille minimale
            if (newDistrict.plots.length >= this.config.minDistrictSize) {
                this.districts.push(newDistrict);
            } else {
                // District trop petit: Libérer ses parcelles pour Phase 2
                console.warn(`District (type ${districtType}, seed ${seedPlot.id}) trop petit (${newDistrict.plots.length}/${this.config.minDistrictSize}). Libération des parcelles.`);
                newDistrict.plots.forEach(p => {
                    assignedPlotIds.delete(p.id); // Retirer de l'ensemble global d'assignation
                    p.districtId = null; // Annuler l'ID district sur la parcelle
                    // Pas besoin de les remettre dans availablePlotsForPhase1, Phase 2 les retrouvera
                });
            }
        } // Fin de la boucle while (Phase 1)

        console.log(`Formation districts - Phase 1 terminée. ${this.districts.length} districts créés.`);

        // --- PHASE 2: Assign Remaining Plots ---
        console.log("District Formation - Phase 2: Assignation des restes");
        // Récupérer les parcelles constructibles non assignées en Phase 1
        let remainingPlots = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id));
        let assignedInPhase2 = 0;

        if (remainingPlots.length > 0 && this.districts.length > 0) {
            console.log(` -> Tentative d'assignation de ${remainingPlots.length} parcelles restantes.`);
            remainingPlots.forEach(plot => {
                let bestDistrict = null;
                let minDistanceSq = Infinity;

                // Trouver le centre de district le plus proche
                this.districts.forEach(district => {
                    const distSq = plot.center.distanceToSquared(district.center);
                    if (distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        bestDistrict = district;
                    }
                });

                // Vérifier la validité de l'assignation à ce district
                if (bestDistrict) {
                    let canAssign = true;
                    const plotDistToCenter = plot.center.length();
                    const plotNormalizedDistance = Math.max(0, Math.min(1, plotDistToCenter / mapRadius));

                    // Appliquer règles strictes basées sur le TYPE DU DISTRICT CIBLE
                    if (bestDistrict.type === 'industrial') {
                        if (plotNormalizedDistance < this.config.strictMinIndustrialDist) {
                            canAssign = false;
                        }
                    } else if (bestDistrict.type === 'business') {
                        if (plotNormalizedDistance > this.config.strictMaxBusinessDist) {
                            canAssign = false;
                        }
                    }
                    // Ajouter d'autres règles si nécessaire (ex: taille max du district cible ?)

                    if (canAssign) {
                        bestDistrict.addPlot(plot); // addPlot met à jour plot.districtId
                        assignedPlotIds.add(plot.id); // Marquer comme assigné globalement
                        assignedInPhase2++;
                    } else {
                        console.warn(`(Phase 2) Parcelle ${plot.id} (type initial ${plot.zoneType}) ne peut être assignée au district le plus proche ${bestDistrict.id} (${bestDistrict.type}) à cause des règles de placement.`);
                    }
                } else {
                    // Ne devrait pas arriver si this.districts.length > 0
                    console.warn(`(Phase 2) Parcelle ${plot.id} n'a trouvé aucun district proche.`);
                }
            });
            console.log(` -> Assigné ${assignedInPhase2} parcelles en Phase 2.`);
        } else if (remainingPlots.length > 0) {
            console.warn(` -> ${remainingPlots.length} parcelles restent non assignées, mais aucun district n'a été créé en Phase 1.`);
        } else {
            console.log(" -> Aucune parcelle restante à assigner en Phase 2.");
        }

        // Log final pour cette tentative
        const finalUnassignedCount = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id)).length;
        console.log(`Formation districts (tentative actuelle) terminée. ${this.districts.length} districts formés. ${finalUnassignedCount} parcelles constructibles non assignées.`);
    }

    // ----- Nouvelle fonction Fallback (Option 2 modifiée) -----
    assignDefaultTypeToUnassigned() {
        console.log("Vérification et fallback pour les parcelles encore non assignées...");
        let unassignedCorrected = 0;
        this.leafPlots.forEach(plot => {
            // Si la parcelle n'a pas d'ID de district *après* la Phase 2,
            // et qu'elle est constructible et n'est pas un parc
            if (plot.districtId === null && plot.zoneType !== 'unbuildable' && plot.zoneType !== 'park') {
                const originalType = plot.zoneType;
                // Appliquer un type résidentiel par défaut simple
                plot.zoneType = 'building'; // Ou 'house' si vous préférez
                plot.isPark = false;
                console.warn(`  -> Parcelle ${plot.id} (type initial: ${originalType}) sans district assigné. Type forcé à '${plot.zoneType}'.`);
                unassignedCorrected++;
            }
        });
        if (unassignedCorrected > 0) {
             console.log(` -> ${unassignedCorrected} parcelles non assignées ont reçu un type par défaut.`);
        } else {
             console.log(" -> Toutes les parcelles constructibles ont été assignées à un district.");
        }
    }


    // ----- findNeighbors (INCHANGÉ) -----
    findNeighbors(plot, allPlots) {
        const neighbors = [];
        const roadW = this.config.roadWidth;
        const tolerance = 0.1; // Garder une tolérance serrée

        const p1Bounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth };

        for (const p2 of allPlots) {
            if (p2.id === plot.id) continue;

            const p2Bounds = { minX: p2.x, maxX: p2.x + p2.width, minZ: p2.z, maxZ: p2.z + p2.depth };

            // Calcul des gaps (distance entre les bords les plus proches)
            const zDist = (p2Bounds.minZ >= p1Bounds.maxZ) ? (p2Bounds.minZ - p1Bounds.maxZ) : (p1Bounds.minZ - p2Bounds.maxZ);
            const xDist = (p2Bounds.minX >= p1Bounds.maxX) ? (p2Bounds.minX - p1Bounds.maxX) : (p1Bounds.minX - p2Bounds.maxX);

            // Calcul des chevauchements
            const xOverlap = Math.max(0, Math.min(p1Bounds.maxX, p2Bounds.maxX) - Math.max(p1Bounds.minX, p2Bounds.minX));
            const zOverlap = Math.max(0, Math.min(p1Bounds.maxZ, p2Bounds.maxZ) - Math.max(p1Bounds.minZ, p2Bounds.minZ));

            // Conditions pour être voisin :
            // 1. Se touchent directement (gap proche de 0) avec chevauchement sur l'autre axe
            const touchesVertically = Math.abs(xDist) < tolerance && zOverlap > tolerance;
            const touchesHorizontally = Math.abs(zDist) < tolerance && xOverlap > tolerance;
            // 2. Séparés par exactement la largeur d'une route avec chevauchement sur l'autre axe
            const separatedByVerticalRoad = Math.abs(xDist - roadW) < tolerance && zOverlap > tolerance;
            const separatedByHorizontalRoad = Math.abs(zDist - roadW) < tolerance && xOverlap > tolerance;

            if (touchesHorizontally || touchesVertically || separatedByHorizontalRoad || separatedByVerticalRoad) {
                neighbors.push(p2);
            }
        }
        return neighbors;
    }


    // ----- adjustPlotTypesWithinDistricts (INCHANGÉ) -----
    // Cette fonction traite correctement les parcelles qui SONT dans des districts.
    // Elle n'a pas besoin d'être modifiée pour l'approche 1.
    adjustPlotTypesWithinDistricts() {
        console.log("Ajustement des types de parcelles (0/1 parc par district, Alternance résidentiel)...");
        const stats = {
            forcedToSkyscraper: 0,
            forcedToIndustrial: 0,
            assignedHouse: 0,
            assignedBuilding: 0,
            assignedPark: 0,
            parkRemoved: 0, // Nouveau: Compte les parcs convertis
            changedResidentialType: 0,
            alreadyCorrectResidential: 0,
            alreadyCorrectOther: 0,
            unbuildableSkipped: 0
        };

        this.districts.forEach(district => {
            let assignHouse = true; // Pour alterner dans le résidentiel
            let parkAssignedInDistrict = false; // NOUVEAU: Drapeau pour ce district

            district.plots.forEach(plot => {
                // Ignorer non-constructibles
                if (plot.zoneType === 'unbuildable') {
                    stats.unbuildableSkipped++;
                    return;
                }

                const initialType = plot.zoneType;
                let targetType = null;
                let isInitiallyPark = (initialType === 'park');

                switch (district.type) {
                    case 'business':
                        targetType = 'skyscraper';
                        if (isInitiallyPark) { // Si c'était un parc dans un quartier d'affaires
                            if (!parkAssignedInDistrict) {
                                targetType = 'park'; // Le premier parc est gardé
                                stats.assignedPark++;
                                parkAssignedInDistrict = true;
                            } else {
                                // C'est un parc supplémentaire, on le convertit
                                targetType = 'skyscraper'; // Type par défaut du district
                                stats.parkRemoved++;
                                stats.forcedToSkyscraper++; // Compter comme forcé au type du district
                            }
                        } else { // Si ce n'était pas un parc initialement
                            if (initialType !== targetType) stats.forcedToSkyscraper++; else stats.alreadyCorrectOther++;
                        }
                        break;

                    case 'industrial':
                        targetType = 'industrial';
                         if (isInitiallyPark) {
                            if (!parkAssignedInDistrict) {
                                targetType = 'park'; stats.assignedPark++; parkAssignedInDistrict = true;
                            } else {
                                targetType = 'industrial'; stats.parkRemoved++; stats.forcedToIndustrial++;
                            }
                        } else {
                             if (initialType !== targetType) stats.forcedToIndustrial++; else stats.alreadyCorrectOther++;
                        }
                        break;

                    case 'residential':
                        // Gérer d'abord les parcs
                        if (isInitiallyPark) {
                             if (!parkAssignedInDistrict) {
                                 targetType = 'park'; stats.assignedPark++; parkAssignedInDistrict = true;
                             } else {
                                 // Convertir le parc supplémentaire en maison/immeuble (alterné)
                                 targetType = assignHouse ? 'house' : 'building';
                                 stats.parkRemoved++;
                                 if (targetType === 'house') stats.assignedHouse++; else stats.assignedBuilding++;
                                 assignHouse = !assignHouse; // Important d'alterner même si on convertit un parc
                             }
                        } else {
                            // Si ce n'est pas un parc, appliquer l'alternance résidentielle
                            targetType = assignHouse ? 'house' : 'building';
                            if (targetType === 'house') {
                                stats.assignedHouse++;
                                if (initialType !== 'house') stats.changedResidentialType++; else stats.alreadyCorrectResidential++;
                            } else { // targetType === 'building'
                                stats.assignedBuilding++;
                                if (initialType !== 'building') stats.changedResidentialType++; else stats.alreadyCorrectResidential++;
                            }
                            assignHouse = !assignHouse; // Alterner pour la prochaine parcelle non-parc
                        }
                        break;

                    default:
                        targetType = initialType; // Ne rien changer si type de district inconnu
                        console.warn(`District ${district.id} a un type inconnu: ${district.type}. Parcelle ${plot.id} inchangée.`);
                        stats.alreadyCorrectOther++;
                        break;
                }

                // Appliquer le type cible
                if (targetType !== null) {
                    plot.zoneType = targetType;
                    plot.isPark = (targetType === 'park'); // Mettre à jour isPark aussi
                }
            }); // Fin boucle parcelles du district
        }); // Fin boucle districts

        console.log(`Ajustement (0/1 parc, Alternance résidentiel) terminé:`);
        console.log(`  - Forcés Gratte-ciel: ${stats.forcedToSkyscraper}`);
        console.log(`  - Forcés Industriel: ${stats.forcedToIndustrial}`);
        console.log(`  - Assignés Maison: ${stats.assignedHouse}`);
        console.log(`  - Assignés Immeuble: ${stats.assignedBuilding}`);
        console.log(`  - Assignés/Gardés Parc: ${stats.assignedPark}`);
        console.log(`  - Parcs Convertis: ${stats.parkRemoved}`); // Log du nouveau compteur
        console.log(`  - Changements type résidentiel: ${stats.changedResidentialType}`);
        console.log(`  - Déjà Corrects (Résidentiel): ${stats.alreadyCorrectResidential}`);
        console.log(`  - Déjà Corrects (Autres types): ${stats.alreadyCorrectOther}`);
        console.log(`  - Non-constructibles Ignorés: ${stats.unbuildableSkipped}`);
    }

    // ... (Coller ici le reste des fonctions de CityManager.js :
    // validateDistrictLayout, getDistrictTypeProbabilities, chooseDistrictType,
    // createDistrictDebugVisuals, clearCity, createGlobalGround, destroy,
    // getPlots, getDistricts, logLoadedAssets, logInitialZoneTypes,
    // logAdjustedZoneTypes, logDistrictStats, update)
    // ...

    // Copie des fonctions restantes pour la complétude
    validateDistrictLayout() {
		console.log("Validation de la disposition des districts (avec règles strictes et comptes min/max)...");
		if (!this.districts || this.districts.length === 0) {
			console.warn("Validation échouée: Aucun district à valider.");
			return false;
		}

		const mapRadius = this.config.mapSize / 2;
		if (mapRadius <= 0) {
			console.error("Validation échouée: mapRadius invalide.");
			return false;
		}

		let businessInCoreCenterCount = 0;
		let industrialInCoreEdgeCount = 0;
		let strictlyMisplacedIndustrial = 0;
		let strictlyMisplacedBusiness = 0;
		let totalIndustrialCount = 0;
		let totalBusinessCount = 0;

		this.districts.forEach(district => {
			const distToCenter = district.center.length();
			const normalizedDistance = Math.max(0, Math.min(1, distToCenter / mapRadius));

			if (district.type === 'industrial') {
				totalIndustrialCount++;
			} else if (district.type === 'business') {
				totalBusinessCount++;
			}

			if (district.type === 'business' && normalizedDistance <= this.config.validationZoneCenterMaxDist) {
				businessInCoreCenterCount++;
			}
			if (district.type === 'industrial' && normalizedDistance >= this.config.validationZoneEdgeMinDist) {
				industrialInCoreEdgeCount++;
			}

			if (district.type === 'industrial' && normalizedDistance < this.config.strictMinIndustrialDist) {
				strictlyMisplacedIndustrial++;
				console.warn(`District industriel ${district.id} trouvé à une distance ${normalizedDistance.toFixed(2)} (strictement interdit < ${this.config.strictMinIndustrialDist})`);
			}
			if (district.type === 'business' && normalizedDistance > this.config.strictMaxBusinessDist) {
				strictlyMisplacedBusiness++;
				 console.warn(`District business ${district.id} trouvé à une distance ${normalizedDistance.toFixed(2)} (strictement interdit > ${this.config.strictMaxBusinessDist})`);
			}
		});

		const hasEnoughBusinessInCoreZone = businessInCoreCenterCount >= this.config.minBusinessInCenter;
		const hasEnoughIndustrialInEdgeZone = industrialInCoreEdgeCount >= this.config.minIndustrialInEdge;
		const noStrictlyMisplaced = strictlyMisplacedIndustrial === 0 && strictlyMisplacedBusiness === 0;
		const meetsMinTotalIndustrial = totalIndustrialCount >= this.config.minTotalIndustrialDistricts;
		const meetsMaxTotalIndustrial = totalIndustrialCount <= this.config.maxTotalIndustrialDistricts;
		const meetsMinTotalBusiness = totalBusinessCount >= this.config.minTotalBusinessDistricts;
		const meetsMaxTotalBusiness = totalBusinessCount <= this.config.maxTotalBusinessDistricts;

		console.log(`RESULTATS VALIDATION:`);
		console.log(` - Placement Strict: Industriel (<${this.config.strictMinIndustrialDist}): ${strictlyMisplacedIndustrial} (OK si 0) -> ${strictlyMisplacedIndustrial === 0}`);
		console.log(` - Placement Strict: Business (>${this.config.strictMaxBusinessDist}): ${strictlyMisplacedBusiness} (OK si 0) -> ${strictlyMisplacedBusiness === 0}`);
		console.log(` - Minimum Zone Centre: Business (<${this.config.validationZoneCenterMaxDist}): ${businessInCoreCenterCount} (requis min ${this.config.minBusinessInCenter}) -> ${hasEnoughBusinessInCoreZone}`);
		console.log(` - Minimum Zone Périphérie: Industriel (>${this.config.validationZoneEdgeMinDist}): ${industrialInCoreEdgeCount} (requis min ${this.config.minIndustrialInEdge}) -> ${hasEnoughIndustrialInEdgeZone}`);
		console.log(` - Compte Total Industriel: ${totalIndustrialCount} (Min: ${this.config.minTotalIndustrialDistricts}, Max: ${this.config.maxTotalIndustrialDistricts}) -> Min OK: ${meetsMinTotalIndustrial}, Max OK: ${meetsMaxTotalIndustrial}`);
		console.log(` - Compte Total Business: ${totalBusinessCount} (Min: ${this.config.minTotalBusinessDistricts}, Max: ${this.config.maxTotalBusinessDistricts}) -> Min OK: ${meetsMinTotalBusiness}, Max OK: ${meetsMaxTotalBusiness}`);

		if (!noStrictlyMisplaced) {
			console.warn("Validation échouée: Au moins un district est strictement mal placé.");
			return false;
		}
		// Mettre en commentaire si les minimums de zone ne sont plus critiques
		/*
		if (!hasEnoughBusinessInCoreZone) {
			console.warn(`Validation échouée: Pas assez de districts business DANS LA ZONE centrale.`);
			return false;
		}
		if (!hasEnoughIndustrialInEdgeZone) {
			console.warn(`Validation échouée: Pas assez de districts industriels DANS LA ZONE périphérique.`);
			return false;
		}
		*/
		if (!meetsMinTotalIndustrial) {
			console.warn(`Validation échouée: Nombre total de districts industriels (${totalIndustrialCount}) est inférieur au minimum requis (${this.config.minTotalIndustrialDistricts}).`);
			return false;
		}
		if (!meetsMaxTotalIndustrial) {
			console.warn(`Validation échouée: Nombre total de districts industriels (${totalIndustrialCount}) est supérieur au maximum autorisé (${this.config.maxTotalIndustrialDistricts}).`);
			return false;
		}
		if (!meetsMinTotalBusiness) {
			console.warn(`Validation échouée: Nombre total de districts d'affaires (${totalBusinessCount}) est inférieur au minimum requis (${this.config.minTotalBusinessDistricts}).`);
			return false;
		}
		if (!meetsMaxTotalBusiness) {
			console.warn(`Validation échouée: Nombre total de districts d'affaires (${totalBusinessCount}) est supérieur au maximum autorisé (${this.config.maxTotalBusinessDistricts}).`);
			return false;
		}

		console.log("Validation Réussie: Toutes les règles de placement et de comptage sont respectées.");
		return true;
	}

    getDistrictTypeProbabilities(distanceToCenter) {
        const mapRadius = this.config.mapSize / 2;
        const bizConf = this.config.districtProbabilities.business;
        const indConf = this.config.districtProbabilities.industrial;
        const resConf = this.config.districtProbabilities.residential;
        const defaultProbs = { business: 0.1, industrial: 0.1, residential: 0.8 };

        if (!bizConf || !indConf || !resConf || mapRadius <= 0) {
            console.warn("Config districtProbabilities incomplète ou mapRadius nul, utilisation des probabilités par défaut.");
            return defaultProbs;
        }

        const normalizedDistance = Math.max(0, Math.min(1, distanceToCenter / mapRadius));
        const d = normalizedDistance;

        const rawPBusiness = Math.exp(-d * (bizConf.decay || 10)) * (bizConf.max !== undefined ? bizConf.max : 0.15);
        let rawPIndustrial;
        if (d > (indConf.threshold !== undefined ? indConf.threshold : 0.85)) {
            rawPIndustrial = (1 - Math.exp(-(d - (indConf.threshold !== undefined ? indConf.threshold : 0.85)) * (indConf.factor || 5))) * (indConf.multiplier !== undefined ? indConf.multiplier : 0.2);
        } else {
            rawPIndustrial = (indConf.base !== undefined ? indConf.base : 0.01);
        }
        const residentialPeakTerm = Math.exp(-((d - (resConf.peakCenter !== undefined ? resConf.peakCenter : 0.5))**2) / (2 * (resConf.peakWidth || 0.2)));
        const rawPResidential = residentialPeakTerm + (resConf.base !== undefined ? resConf.base : 0.8);

        const totalRawP = rawPBusiness + rawPIndustrial + rawPResidential;
        if (totalRawP <= 0) {
             console.warn("Somme des probabilités brutes nulle ou négative, utilisation des probabilités par défaut.");
             return defaultProbs;
        }

        return {
            business: rawPBusiness / totalRawP,
            industrial: rawPIndustrial / totalRawP,
            residential: rawPResidential / totalRawP
        };
    }

    chooseDistrictType(probabilities) {
        const rand = Math.random();
        let cumulative = 0;
        if (rand < (cumulative += probabilities.business)) return 'business';
        if (rand < (cumulative += probabilities.industrial)) return 'industrial';
        return 'residential';
    }

    createDistrictDebugVisuals() {
		const visualType = 'DistrictBoundaries';
        this.clearDebugVisuals(visualType); // Nettoyer seulement les visuels de districts existants

        if (!this.experience.isDebugMode) return; // Ne rien faire si le mode debug n'est pas actif

		this.districts.forEach(district => {
			if (district.plots.length === 0) return;
			const bounds = district.bounds; // Utilise le getter bounds de District
			const size = new THREE.Vector3();
			bounds.getSize(size);
			const center = new THREE.Vector3();
			bounds.getCenter(center);

			if (size.x <= 0 || size.z <= 0) return;

			const planeGeom = new THREE.PlaneGeometry(size.x, size.z);
			let material;
			switch(district.type) {
				case 'residential': material = this.materials.debugResidentialMat; break;
				case 'industrial': material = this.materials.debugIndustrialMat; break;
				case 'business': material = this.materials.debugBusinessMat; break;
				default: material = this.materials.debugDefaultMat;
			}
			const planeMesh = new THREE.Mesh(planeGeom, material);
			planeMesh.position.set(center.x, 0.15, center.z); // Légèrement plus haut que les parcs debug
			planeMesh.rotation.x = -Math.PI / 2;
			planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
            planeMesh.userData.visualType = visualType; // Marqueur pour le nettoyage
			planeMesh.renderOrder = 998; // Juste en dessous des outlines de parc
			this.debugGroup.add(planeMesh);
		});
		 console.log(`Debug visuals (District Planes) updated: ${this.debugGroup.children.filter(c => c.userData.visualType === visualType).length} districts visualized.`);
	}

	clearCity() {
        console.log("Nettoyage de la ville existante (incluant cônes lumineux)...");
        this.clearDebugVisuals();

        const disposeGroupContents = (group) => {
            if (!group) return;
            while(group.children.length > 0){
                const obj = group.children[0];
                group.remove(obj);
                if(obj.geometry) obj.geometry.dispose();
                // Ne pas disposer les matériaux partagés
            }
        };

        if (this.roadGroup && this.roadGroup.parent) this.cityContainer.remove(this.roadGroup);
        disposeGroupContents(this.roadGroup); this.roadGroup = null;
        if (this.sidewalkGroup && this.sidewalkGroup.parent) this.cityContainer.remove(this.sidewalkGroup);
        disposeGroupContents(this.sidewalkGroup); this.sidewalkGroup = null;
        if (this.contentGroup && this.contentGroup.parent) this.cityContainer.remove(this.contentGroup);
        disposeGroupContents(this.contentGroup); this.contentGroup = null;
        // Nettoyage groundGroup qui a été ajouté
        if (this.groundGroup && this.groundGroup.parent) this.cityContainer.remove(this.groundGroup);
        disposeGroupContents(this.groundGroup); this.groundGroup = null; // Ne pas oublier de nullifier

        // Nettoyage lampadaires/cônes
        if (this.lampPostMeshes.grey && this.lampPostMeshes.grey.parent) this.cityContainer.remove(this.lampPostMeshes.grey);
        if (this.lampPostMeshes.light && this.lampPostMeshes.light.parent) this.cityContainer.remove(this.lampPostMeshes.light);
        if (this.lampPostMeshes.lightCone && this.lampPostMeshes.lightCone.parent) this.cityContainer.remove(this.lampPostMeshes.lightCone);
        this.lampPostMeshes = { grey: null, light: null, lightCone: null };

        // Nettoyage sol global (maintenant CityGround)
        if (this.groundMesh && this.groundMesh.parent) this.scene.remove(this.groundMesh);
        if (this.groundMesh?.geometry) this.groundMesh.geometry.dispose();
        this.groundMesh = null;


        // Reste du nettoyage
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

        console.log("Nettoyage terminé.");
    }

    createGlobalGround() {
		// Vérifie si le sol existe déjà
		if (this.groundMesh && this.groundMesh.parent) return;
		if (this.groundMesh && !this.groundMesh.parent) { this.scene.add(this.groundMesh); return; }
	
		// Récupérer la largeur du trottoir depuis la config
		const sidewalkWidth = this.config.sidewalkWidth || 0; // Mettre 0 si non défini
	
		// === POINT CLÉ : Calcul de la nouvelle taille ===
		const groundWidth = this.config.mapSize + (2 * sidewalkWidth);
		const groundDepth = this.config.mapSize + (2 * sidewalkWidth);
		// ==============================================
	
		console.log(`Création CityGround avec marge trottoir : ${groundWidth.toFixed(1)}x${groundDepth.toFixed(1)} (mapSize=${this.config.mapSize}, sidewalkWidth=${sidewalkWidth})`);
	
		const groundGeometry = new THREE.PlaneGeometry(
			groundWidth, // Nouvelle largeur calculée
			groundDepth  // Nouvelle profondeur calculée
		);
	
		this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
		this.groundMesh.rotation.x = -Math.PI / 2;
		this.groundMesh.position.y = -0.01; // Garder légèrement en dessous de y=0
		this.groundMesh.receiveShadow = true;
		this.groundMesh.name = "CityGround";
		this.scene.add(this.groundMesh);
	
		// Optionnel : Garder le helper pour vérifier la nouvelle taille pendant le développement
		// const helper = new THREE.BoxHelper(this.groundMesh, 0xffff00);
		// this.scene.add(helper);
	}

    destroy() {
        console.log("Destroying CityManager (incluant cônes lumineux)...");
        this.clearCity(); // Nettoie déjà beaucoup, y compris les lampPostMeshes

        // Dispose des matériaux centraux (inclut lampLightConeMaterial maintenant)
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        this.materials = {};

        // --- NOUVEAU : Dispose géométrie du cône ---
        if (this.lampPostConeGeometry) {
            this.lampPostConeGeometry.dispose();
            this.lampPostConeGeometry = null;
        }
        // ------------------------------------------

        // Détruit AssetLoader (inchangé)
        this.assetLoader?.disposeAssets();
        this.assetLoader = null;

        // Retirer le conteneur principal (inchangé)
        if (this.cityContainer && this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }
        this.cityContainer = null;

        // Nullifier les références (inchangé)
        this.experience = null;
        this.scene = null;
        // ... autres nullifications ...
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

	getNavigationGraph() {
        return this.navigationGraph; // Doit retourner la propriété 'navigationGraph'
    }
    // ---------------------------------

    getPathfinder() {
        return this.pathfinder;
    }

    /** @returns {Map<string, object>} Map des instances de bâtiments enregistrées. */
    getBuildingInstances() {
        return this.buildingInstances;
    }

     /** @returns {Map<string, object>} Map des citoyens enregistrés. */
    getCitizens() {
        return this.citizens;
    }

    logLoadedAssets() { /* ... inchangé ... */
       if (!this.assetLoader || !this.assetLoader.assets) return;
       const counts = Object.entries(this.assetLoader.assets).map(([type, list]) => `${type}: ${list.length}`).join(', ');
       console.log(`Assets chargés - ${counts}`);
    }
    logInitialZoneTypes() { /* ... inchangé ... */
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Répartition initiale des types (par LayoutGenerator):", counts);
    }
    logAdjustedZoneTypes() { /* ... inchangé ... */
         if (!this.leafPlots) return;
         const counts = {};
         this.leafPlots.forEach(p => {
             counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
         });
         // Modifié pour refléter le moment de l'appel
         console.log("Répartition finale des types (après ajustement & fallback):", counts);
    }
    logDistrictStats() { /* ... inchangé ... */
        if (!this.districts || this.districts.length === 0) return;
        const stats = { residential: 0, industrial: 0, business: 0 };
        let totalPlotsInDistricts = 0;
        this.districts.forEach(d => {
            if (stats[d.type] !== undefined) stats[d.type]++;
            totalPlotsInDistricts += d.plots.length;
        });
        console.log(`Stats Districts -> Total: ${this.districts.length} (R: ${stats.residential}, I: ${stats.industrial}, B: ${stats.business}). Parcelles dans districts: ${totalPlotsInDistricts}/${this.leafPlots?.length || 0}`);
        this.districts.forEach(d => {
            const plotCounts = {};
            d.plots.forEach(p => { plotCounts[p.zoneType] = (plotCounts[p.zoneType] || 0) + 1; });
            const plotCountsString = Object.entries(plotCounts).map(([k, v]) => `${k}:${v}`).join(', ');
            const centerX = d.center ? d.center.x.toFixed(1) : 'N/A';
            const centerZ = d.center ? d.center.z.toFixed(1) : 'N/A';
            console.log(` - District ${d.id} (${d.type}): ${d.plots.length} parcelles [${plotCountsString}]. Centre: (${centerX}, ${centerZ})`);
        });
    }
    update() { /* ... inchangé ... */ }

} // Fin de la classe CityManager

function disposeGroup(group) {
    // ... (code inchangé) ...
	if (!group) return;
	while(group.children.length > 0){
		const obj = group.children[0];
		group.remove(obj);
		if(obj.geometry) obj.geometry.dispose();
		// Ne pas disposer les matériaux ici s'ils sont partagés via CityManager.materials
	}
}