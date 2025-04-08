// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
// FBXLoader est importé dans CityAssetLoader.js

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration Principale ---
        this.config = {
            // Layout
            mapSize: 500,
            roadWidth: 10,
            minPlotSize: 13,
            maxPlotSize: 40,
            maxRecursionDepth: 7,
            // --- Probabilités des Zones ---
            parkProbability: 0.10, // Probabilité qu'une parcelle devienne un parc
            industrialZoneProbability: 0.15,
            houseZoneProbability: 0.40,
            // Le reste sera 'building'
            // Roads/Sidewalks
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            // Plot Content & SubZones
            minHouseSubZoneSize: 7,
            minBuildingSubZoneSize: 10,
            minIndustrialSubZoneSize: 10,
            minParkSubZoneSize: 20, // *** NOUVEAU: Taille min pour subdivision parc (ou grande pour 1 modèle)
            buildingSubZoneMargin: 1.5,

            // --- Configuration Assets ---
            // Houses
            houseModelDir: "Public/Assets/Models/Houses/",
            houseModelFiles: [
				"House1.fbx", "House2.fbx", "House3.fbx", "House4.fbx", "House5.fbx",
                "House6.fbx", "House7.fbx", "House8.fbx", "House9.fbx", "House10.fbx",
                "House11.fbx", "House12.fbx", "House13.fbx", "House14.fbx", "House15.fbx",
                "House16.fbx", "House17.fbx", "House18.fbx", "House19.fbx", "House20.fbx",
                "House21.fbx", "House22.fbx", "House23.fbx", "House24.fbx",
			],
            houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,
            // Buildings
            buildingModelDir: "Public/Assets/Models/Buildings/",
            buildingModelFiles: [
				"Building1.fbx", "Building2.fbx", "Building3.fbx", "Building4.fbx",
                "Building5.fbx", "Building6.fbx", "Building7.fbx", "Building8.fbx",
			],
            buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
            // Industrials
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: ["Factory1_glb.glb", "Factory2_glb.glb", "Factory3_glb.glb"],
            industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
            // *** NOUVEAU: Parks ***
            parkModelDir: "Public/Assets/Models/Parks/",
            parkModelFiles: [
                "Bench.glb", "Fountain.glb", "Gazebo.glb", "Table.glb" // Ajoutez ici tous vos fichiers de parcs
                // "Park3.fbx", ...
            ],
            parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15, // Ajustez ces dimensions
            // --- Fin Configuration Assets ---

            // --- Fusion avec config fournie ---
            ...config
        };

        // --- Matériaux Partagés ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            // parkMaterial n'est plus forcément utile si on charge des modèles, mais on le garde pour le sol des parcelles
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x55aa55 }), // Vert pour le sol sous les parcs
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }),
        };

        // --- Instanciation des Composants ---
        this.assetLoader = new CityAssetLoader({
            // Passez toutes les configurations d'assets, y compris les parcs
            houseModelDir: this.config.houseModelDir, houseModelFiles: this.config.houseModelFiles,
            houseBaseWidth: this.config.houseBaseWidth, houseBaseHeight: this.config.houseBaseHeight, houseBaseDepth: this.config.houseBaseDepth,
            buildingModelDir: this.config.buildingModelDir, buildingModelFiles: this.config.buildingModelFiles,
            buildingBaseWidth: this.config.buildingBaseWidth, buildingBaseHeight: this.config.buildingBaseHeight, buildingBaseDepth: this.config.buildingBaseDepth,
            industrialModelDir: this.config.industrialModelDir, industrialModelFiles: this.config.industrialModelFiles,
            industrialBaseWidth: this.config.industrialBaseWidth, industrialBaseHeight: this.config.industrialBaseHeight, industrialBaseDepth: this.config.industrialBaseDepth,
            // *** NOUVEAU: Passer la config des parcs ***
            parkModelDir: this.config.parkModelDir, parkModelFiles: this.config.parkModelFiles,
            parkBaseWidth: this.config.parkBaseWidth, parkBaseHeight: this.config.parkBaseHeight, parkBaseDepth: this.config.parkBaseDepth,
        });

        this.layoutGenerator = new CityLayoutGenerator({
            roadWidth: this.config.roadWidth, minPlotSize: this.config.minPlotSize,
            maxPlotSize: this.config.maxPlotSize, maxRecursionDepth: this.config.maxRecursionDepth,
            parkProbability: this.config.parkProbability, // La probabilité est déjà gérée ici
            industrialZoneProbability: this.config.industrialZoneProbability,
            houseZoneProbability: this.config.houseZoneProbability,
        });

        this.roadGenerator = new RoadNetworkGenerator(
            { roadWidth: this.config.roadWidth, centerlineWidth: this.config.centerlineWidth, centerlineHeight: this.config.centerlineHeight },
            { centerlineMaterial: this.materials.centerlineMaterial }
        );

        this.contentGenerator = new PlotContentGenerator(
            {
                sidewalkWidth: this.config.sidewalkWidth, sidewalkHeight: this.config.sidewalkHeight,
                buildingSubZoneMargin: this.config.buildingSubZoneMargin,
                minHouseSubZoneSize: this.config.minHouseSubZoneSize,
                minBuildingSubZoneSize: this.config.minBuildingSubZoneSize,
                minIndustrialSubZoneSize: this.config.minIndustrialSubZoneSize,
                minParkSubZoneSize: this.config.minParkSubZoneSize, // *** NOUVEAU: Passer la config de subdivision parc ***
            },
            {
                sidewalkMaterial: this.materials.sidewalkMaterial,
                // Passer le matériau pour le SOL des parcelles (pas le modèle 3D lui-même)
                parkMaterial: this.materials.parkMaterial, // Utilisé par createPlotGround si zoneType='park'
                buildingGroundMaterial: this.materials.buildingGroundMaterial,
            }
        );

        // --- Groupes pour Organisation Scène ---
        this.cityContainer = new THREE.Group();
        this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.buildingGroup = null;
        this.groundMesh = null; // Sol global

        this.scene.add(this.cityContainer);
        console.log("CityManager initialisé.");
    }

    async generateCity() {
        console.time("CityGeneration");
        this.clearCity();

        try {
            console.log("--- Démarrage génération ville ---");
            this.createGlobalGround();

            console.time("AssetLoading");
            const loadedAssets = await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");

             const hasHouses = loadedAssets.house && loadedAssets.house.length > 0;
             const hasBuildings = loadedAssets.building && loadedAssets.building.length > 0;
             const hasFactories = loadedAssets.industrial && loadedAssets.industrial.length > 0;
             const hasParks = loadedAssets.park && loadedAssets.park.length > 0; // *** NOUVEAU: Vérifier parcs ***

             if (!hasHouses && !hasBuildings && !hasFactories && !hasParks) { // *** MODIFIÉ: Inclure parcs ***
                 console.warn("Aucun asset (maison, immeuble, usine ou parc) n'a pu être chargé.");
             } else {
                 console.log(`Assets chargés: ${loadedAssets.house?.length || 0} maisons, ${loadedAssets.building?.length || 0} immeubles, ${loadedAssets.industrial?.length || 0} usines, ${loadedAssets.park?.length || 0} parcs.`); // *** MODIFIÉ: Log parcs ***
             }

            console.time("LayoutGeneration");
            const leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");

             if (!leafPlots || leafPlots.length === 0) {
                 throw new Error("La génération du layout n'a produit aucune parcelle utilisable.");
             }

            console.time("RoadGeneration");
            this.roadGroup = this.roadGenerator.generateRoads(leafPlots);
            this.roadGroup.name = "RoadNetwork";
            this.cityContainer.add(this.roadGroup);
            console.timeEnd("RoadGeneration");

            console.time("ContentGeneration");
            const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(
                 leafPlots,
                 this.assetLoader
             );
            this.sidewalkGroup = sidewalkGroup;
            this.buildingGroup = buildingGroup;
            this.sidewalkGroup.name = "Sidewalks";
            this.buildingGroup.name = "PlotContents";
            this.cityContainer.add(this.sidewalkGroup);
            this.cityContainer.add(this.buildingGroup);
            console.timeEnd("ContentGeneration");

            console.log("--- Génération ville terminée ---");

        } catch (error) {
            console.error("Erreur majeure durant la génération de la ville:", error);
            this.clearCity();
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    clearCity() {
        console.log("Nettoyage de la ville existante...");
        this.layoutGenerator?.reset();
        this.roadGenerator?.reset();
        this.contentGenerator?.reset();
        this.assetLoader?.disposeAssets(); // Inclut maintenant les parcs

        while (this.cityContainer.children.length > 0) {
            this.cityContainer.remove(this.cityContainer.children[0]);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.buildingGroup = null;

        if (this.groundMesh) {
            if (this.groundMesh.parent) {
                 this.groundMesh.parent.remove(this.groundMesh);
            }
            this.groundMesh.geometry.dispose();
            this.groundMesh = null;
        }
         console.log("Nettoyage terminé.");
    }

    createGlobalGround() {
        if (this.groundMesh) {
             if (!this.groundMesh.parent) this.scene.add(this.groundMesh);
             return;
        }
        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = 0;
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "GlobalGround";
        this.scene.add(this.groundMesh);
        console.log("Sol global créé.");
    }

    getPlots() {
       return this.layoutGenerator?.leafPlots || [];
    }

    getRoadNetworkData() {
        return null; // A implémenter
    }

    getBuildings() {
        return []; // A implémenter (devrait inclure parcs ?)
    }

    update() {
        // Logique de mise à jour future
    }

    destroy() {
        console.log("Destruction du CityManager...");
        this.clearCity();

        Object.values(this.materials).forEach(material => {
            if (material && material.dispose) {
                material.dispose();
            }
        });
        this.materials = {};

        if (this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        console.log("CityManager détruit.");
    }
}