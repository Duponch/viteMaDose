// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
import District from './District.js';
import NavigationGraph from './NavigationGraph.js';
import Pathfinder from './Pathfinder.js';

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration Initiale ---
        // Mettez ici votre objet config *complet* par défaut
        this.config = {
            // Map & Layout
            mapSize: 400, roadWidth: 10, minPlotSize: 13, maxPlotSize: 40, maxRecursionDepth: 7,
            // Crosswalks
            crosswalkWidth: 0.1, crosswalkHeight: 0.03, crosswalkStripeCount: 5, crosswalkStripeWidth: 0.6, crosswalkStripeGap: 0.5,
            // Districts
            minDistrictSize: 5, maxDistrictSize: 10, forceBusinessMaxDistance: 0.15,
            districtProbabilities: { /* ... vos probas ... */ },
            validationZoneCenterMaxDist: 0.20, validationZoneEdgeMinDist: 0.80,
            minBusinessInCenter: 1, minIndustrialInEdge: 1,
            strictMinIndustrialDist: 0.35, strictMaxBusinessDist: 0.60,
            minTotalIndustrialDistricts: 1, maxTotalIndustrialDistricts: 5,
            minTotalBusinessDistricts: 1, maxTotalBusinessDistricts: 4,
            maxDistrictRegenAttempts: 15,
            // Plot Content
            sidewalkWidth: 2, sidewalkHeight: 0.2, centerlineWidth: 0.15, centerlineHeight: 0.02,
            minHouseSubZoneSize: 7, minBuildingSubZoneSize: 10, minIndustrialSubZoneSize: 13,
            minParkSubZoneSize: 10, minSkyscraperSubZoneSize: 13, buildingSubZoneMargin: 1.5,
            // Assets (Chemins et configs - assurez-vous qu'ils sont corrects)
            houseModelDir: "Public/Assets/Models/Houses/", houseModelFiles: [
				{ file: "House1.fbx", scale: 1.3 },
				{ file: "House2.fbx", scale: 1.3 },
				{ file: "House3.fbx", scale: 1.3 },
				{ file: "House4.fbx", scale: 1.3 },
				{ file: "House5.fbx", scale: 1.3 },
				{ file: "House6.fbx", scale: 1.3 },
				{ file: "House7.fbx", scale: 1.3 },
				{ file: "House8.fbx", scale: 1.3 },
				{ file: "House9.fbx", scale: 1.3 },
				{ file: "House10.fbx", scale: 1.3 },
				{ file: "House11.fbx", scale: 1.3 },
				{ file: "House12.fbx", scale: 1.3 },
				{ file: "House13.fbx", scale: 1.3 },
				{ file: "House14.fbx", scale: 1.3 },
				{ file: "House15.fbx", scale: 1.3 },
				{ file: "House16.fbx", scale: 1.3 },
				{ file: "House17.fbx", scale: 1.3 },
				{ file: "House18.fbx", scale: 1.3 },
				{ file: "House19.fbx", scale: 1.3 },
				{ file: "House20.fbx", scale: 1.3 },
				{ file: "House21.fbx", scale: 1.3 },
				{ file: "House22.fbx", scale: 1.3 },
				{ file: "House23.fbx", scale: 1.3 },
				{ file: "House24.fbx", scale: 1.3 },
			],
            houseBaseWidth: 5, houseBaseHeight: 6, houseBaseDepth: 5,
            buildingModelDir: "Public/Assets/Models/Buildings/", buildingModelFiles: [
				{ file: "Building1.fbx", scale: 0.8 },
				{ file: "Building2.fbx", scale: 0.8 },
				{ file: "Building3.fbx", scale: 0.8 },
				{ file: "Building4.fbx", scale: 0.8 },
				{ file: "Building5.fbx", scale: 0.8 },
				{ file: "Building6.fbx", scale: 0.8 },
				{ file: "Building7.fbx", scale: 0.8 },
				{ file: "Building8.fbx", scale: 0.8 },
				{ file: "Building10.glb", scale: 0.8 },
			],
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
            treePlacementProbabilitySidewalk: 0.3, treePlacementProbabilityPark: 0.04, treePlacementProbabilityMargin: 0.008,
            // Debug
            showDistrictBoundaries: false,
            // Time
            dayNightCycleEnabled: true, dayDurationMinutes: 1, startTimeOfDay: 0.25,
            // Agents
            agentScale: 0.1, agentYOffset: 0.3, agentRotationSpeed: 8.0, agentWalkSpeed: 25,
            agentBobAmplitude: 0.15, agentStepLength: 1.5, agentStepHeight: 0.7, agentSwingAmplitude: 1.2,
            agentAnkleRotationAmplitude: Math.PI / 8, agentHandTiltAmplitude: 0.2, agentHeadNodAmplitude: 0.05,
            agentHeadYawAmplitude: 0.1, agentHeadTiltAmplitude: 0.08, agentHeadBobAmplitude: 0.06,
        };

        // --- Fusion Config Externe ---
        // Utiliser une fusion profonde si nécessaire pour les objets imbriqués comme districtProbabilities
        // Pour une simple fusion de premier niveau : Object.assign(this.config, config);
        // Pour une fusion plus robuste (exemple simple, pourrait nécessiter une lib ou fonction récursive):
        const deepMerge = (target, source) => {
             for (const key in source) {
                 if (source.hasOwnProperty(key)) {
                     if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
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
        // Assurez-vous que tous vos matériaux sont définis ici
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x404040, metalness: 0.1, roughness: 0.8 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.8 }),
            crosswalkMaterial: new THREE.MeshStandardMaterial({ color: 0xE0E0E0, roughness: 0.7, metalness: 0.1 }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }),
            debugResidentialMat: new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugIndustrialMat: new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugBusinessMat: new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugDefaultMat: new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
        };

        // --- Composants ---
        this.navigationGraph = null;
        this.pathfinder = null;
        this.assetLoader = new CityAssetLoader(this.config);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials);
        this.districts = [];
        this.leafPlots = [];

        // --- Groupes Scène ---
        this.cityContainer = new THREE.Group(); this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.contentGroup = null;
        this.groundMesh = null;
        this.debugGroup = new THREE.Group(); this.debugGroup.name = "DebugVisuals";

        // --- NOUVEAU: Registres ---
        this.buildingInstances = new Map(); // Map<buildingInstanceId, BuildingInstanceInfo>
        this.citizens = new Map();         // Map<citizenId, CitizenInfo>
        this.nextBuildingInstanceId = 0;
        // --------------------------

        this.scene.add(this.cityContainer);
        if (this.config.showDistrictBoundaries) { this.cityContainer.add(this.debugGroup); }
        console.log("CityManager initialisé (avec registres Bâtiments & Citoyens).");
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
        this.clearCity(); // Nettoie aussi les registres (voir clearCity modifié)

        try {
            console.log("--- Démarrage génération ville ---");
            this.createGlobalGround();

            console.time("AssetLoading");
            await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");
            this.logLoadedAssets();

            console.time("LayoutGeneration");
            this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");
            console.log(`Layout généré avec ${this.leafPlots.length} parcelles.`);
            this.logInitialZoneTypes();

            if (!this.leafPlots || this.leafPlots.length === 0) throw new Error("Layout n'a produit aucune parcelle.");

            // --- Logique Districts (inchangée en termes d'appel) ---
            let districtLayoutValid = false;
            let attempts = 0;
            console.time("DistrictFormationAndValidation");
            while (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
                attempts++;
                console.log(`\nTentative de formation/validation des districts #${attempts}...`);
                this.districts = []; this.leafPlots.forEach(p => { p.districtId = null; p.buildingInstances = []; }); // Réinit aussi buildingInstances sur les plots
                this.createDistricts_V2(); // Fonction interne de création/assignation
                this.logDistrictStats();
                districtLayoutValid = this.validateDistrictLayout(); // Fonction interne de validation
                if (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) { console.log(`Disposition invalide, nouvelle tentative...`); }
                else if (!districtLayoutValid) { console.error(`ERREUR: Impossible d'obtenir une disposition de districts valide après ${attempts} tentatives.`); }
            }
            console.timeEnd("DistrictFormationAndValidation");
            if (!districtLayoutValid) { throw new Error(`Échec critique: Disposition des districts invalide après ${attempts} tentatives.`); }
            console.log("Disposition des districts validée...");
            // --- Fin Logique Districts ---

            console.time("PlotTypeAdjustment");
            this.adjustPlotTypesWithinDistricts(); // Fonction interne
            console.timeEnd("PlotTypeAdjustment");
            this.assignDefaultTypeToUnassigned(); // Fonction interne
            this.logAdjustedZoneTypes();

            console.time("RoadAndCrosswalkInfoGeneration");
            const { roadGroup, crosswalkInfos } = this.roadGenerator.generateRoads(this.leafPlots);
            this.roadGroup = roadGroup;
            this.cityContainer.add(this.roadGroup);
            console.timeEnd("RoadAndCrosswalkInfoGeneration");
            console.log(`Réseau routier généré et ${crosswalkInfos.length} emplacements de passages piétons identifiés.`);

            console.time("NavigationGraphBuilding");
            this.navigationGraph = new NavigationGraph(this.config);
            this.navigationGraph.buildGraph(this.leafPlots, crosswalkInfos);
            console.timeEnd("NavigationGraphBuilding");

            console.time("PathfinderInitialization");
            this.pathfinder = new Pathfinder(this.navigationGraph);
            console.timeEnd("PathfinderInitialization");

            console.time("ContentGeneration");
            // --- MODIFIE : Passer CityManager à PlotContentGenerator ---
            const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(
                this.leafPlots,
                this.assetLoader,
                crosswalkInfos,
                this // <-- Passer la référence à CityManager
            );
            // ----------------------------------------------------------
            this.sidewalkGroup = sidewalkGroup;
            this.contentGroup = buildingGroup;
            this.cityContainer.add(this.sidewalkGroup);
            this.cityContainer.add(this.contentGroup);
            console.timeEnd("ContentGeneration");

            // --- Vérification après génération de contenu ---
            console.log(`Total Building Instances Registered: ${this.buildingInstances.size}`);
            // -----------------------------------------------

            if (this.config.showDistrictBoundaries) {
                console.time("DebugVisualsGeneration");
                this.createDistrictDebugVisuals(); // Fonction interne
                console.timeEnd("DebugVisualsGeneration");
            }

            // L'appel à initiateAgentPathfinding a été supprimé ici.

            console.log("--- Génération ville terminée ---");

        } catch (error) {
            console.error("Erreur majeure pendant la génération:", error);
            this.clearCity(); // Assurer le nettoyage en cas d'erreur
        } finally {
            console.timeEnd("CityGeneration");
        }
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
		console.log("Ajustement STRICT des types de parcelles pour correspondre au type du district...");
		const stats = {
			forcedToSkyscraper: 0,
			forcedToIndustrial: 0,
			forcedToResidential: 0,
			parksProtected: 0,
			alreadyCorrect: 0,
			unbuildableSkipped: 0
		};

		this.districts.forEach(district => {
			district.plots.forEach(plot => {
				// Optionnel: Vérification de cohérence
				// if (plot.districtId !== district.id) {
				//     console.warn(`Incohérence: Parcelle ${plot.id} (districtId=${plot.districtId}) trouvée dans la liste du district ${district.id}.`);
				// }

				if (plot.zoneType === 'park') {
					stats.parksProtected++;
					plot.isPark = true;
					return;
				}
				if (plot.zoneType === 'unbuildable') {
					stats.unbuildableSkipped++;
					return;
				}

				const initialType = plot.zoneType;
				let targetType = null;

				switch (district.type) {
					case 'business':
						targetType = 'skyscraper';
						if (initialType !== targetType) stats.forcedToSkyscraper++; else stats.alreadyCorrect++;
						break;

					case 'industrial':
						targetType = 'industrial';
						if (initialType !== targetType) stats.forcedToIndustrial++; else stats.alreadyCorrect++;
						break;

					case 'residential':
						const plotArea = plot.width * plot.depth;
						targetType = (plotArea > 550) ? 'building' : 'house';
						if (initialType !== targetType) stats.forcedToResidential++; else stats.alreadyCorrect++;
						break;

					default:
						targetType = initialType;
						stats.alreadyCorrect++;
						break;
				}

				if (targetType !== null) {
					 plot.zoneType = targetType;
					 plot.isPark = (targetType === 'park');
				}
			});
		});

		console.log(`Ajustement STRICT terminé:`);
		console.log(`  - Forcés Gratte-ciel: ${stats.forcedToSkyscraper}`);
		console.log(`  - Forcés Industriel: ${stats.forcedToIndustrial}`);
		console.log(`  - Forcés Résidentiel (maison/immeuble): ${stats.forcedToResidential}`);
		console.log(`  - Parcs Protégés: ${stats.parksProtected}`);
		console.log(`  - Déjà Corrects / Inchangés: ${stats.alreadyCorrect}`);
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
		while (this.debugGroup.children.length > 0) {
			const child = this.debugGroup.children[0];
			this.debugGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
		}

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
			planeMesh.position.set(center.x, 0.1, center.z); // Utilise center.z
			planeMesh.rotation.x = -Math.PI / 2;
			planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
			this.debugGroup.add(planeMesh);
		});
		 console.log(`Visuels de débogage (Plans) pour ${this.debugGroup.children.length} districts créés.`);
	}

	clearCity() {
        console.log("Nettoyage de la ville existante...");
        // Retirer les groupes de la scène et nettoyer leur contenu
        if(this.roadGroup && this.roadGroup.parent) this.cityContainer.remove(this.roadGroup);
        disposeGroup(this.roadGroup);
        if(this.sidewalkGroup && this.sidewalkGroup.parent) this.cityContainer.remove(this.sidewalkGroup);
        disposeGroup(this.sidewalkGroup);
        if(this.contentGroup && this.contentGroup.parent) this.cityContainer.remove(this.contentGroup);
        disposeGroup(this.contentGroup); // Dispose InstancedMesh géométries/matériaux internes si non partagés
        if(this.debugGroup && this.debugGroup.parent) this.cityContainer.remove(this.debugGroup);
        disposeGroup(this.debugGroup);

        // Nettoyer le sol global
        if (this.groundMesh) {
            if (this.groundMesh.parent) this.scene.remove(this.groundMesh); // Retirer de la scène globale
            if (this.groundMesh.geometry) this.groundMesh.geometry.dispose();
            // Le matériau groundMaterial sera disposé dans destroy()
            this.groundMesh = null;
        }

        // Réinitialiser les générateurs et composants
        this.roadGenerator?.reset();
        // Reset de contentGenerator doit être fait AVANT disposeAssets si les assets sont utilisés dedans
        this.contentGenerator?.reset(this.assetLoader);
        this.layoutGenerator?.reset();

        // --- NOUVEAU: Nettoyer Graphe et Pathfinder ---
        this.navigationGraph?.destroy();
        this.navigationGraph = null;
        this.pathfinder = null; // Pas de méthode destroy, juste libérer la référence
        // --------------------------------------------

        // Vider les listes
        this.leafPlots = [];
        this.districts = [];
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.contentGroup = null;

        // --- NOUVEAU : Nettoyer les registres ---
        // Pas besoin de boucler pour disposer, car les infos sont juste des données JS
        // et les références aux agents/bâtiments seront gérées par leurs managers respectifs.
        this.buildingInstances.clear();
        this.citizens.clear();
        this.nextBuildingInstanceId = 0; // Réinitialiser le compteur d'ID
        // ---------------------------------------

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
        console.log("Destruction du CityManager...");
        this.clearCity(); // Nettoie déjà la plupart des éléments et les registres

        // Dispose des matériaux centraux (ceux créés dans le constructeur de CityManager)
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        this.materials = {};

         // Détruire AssetLoader (qui dispose ses propres assets chargés)
        this.assetLoader?.disposeAssets();


        // Retirer le conteneur principal s'il est encore attaché (normalement fait dans clearCity)
        if (this.cityContainer && this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        // Nullifier toutes les références pour aider le garbage collector
        this.experience = null;
        this.scene = null;
        this.assetLoader = null;
        this.layoutGenerator = null;
        this.roadGenerator = null;
        this.contentGenerator = null;
        this.navigationGraph = null; // Déjà nullifié dans clearCity mais répété pour sûreté
        this.pathfinder = null;      // Déjà nullifié dans clearCity mais répété pour sûreté
        this.districts = null;
        this.leafPlots = null;
        this.cityContainer = null;
        this.debugGroup = null;
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.contentGroup = null;
        this.groundMesh = null;

        // --- NOUVEAU : Nullifier les registres ---
        this.buildingInstances = null; // Assurer la nullification
        this.citizens = null;
        // ----------------------------------------

        console.log("CityManager détruit.");
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
	if (!group) return;
	while(group.children.length > 0){
		const obj = group.children[0];
		group.remove(obj);
		if(obj.geometry) obj.geometry.dispose();
		// Ne pas disposer les matériaux ici s'ils sont partagés via CityManager.materials
	}
  }