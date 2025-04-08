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
            parkProbability: 0.10,
            industrialZoneProbability: 0.15,
            houseZoneProbability: 0.40,
            // Roads/Sidewalks
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            // Plot Content & SubZones
            minHouseSubZoneSize: 7,
            minBuildingSubZoneSize: 10,
            minIndustrialSubZoneSize: 13,
            minParkSubZoneSize: 10,
            buildingSubZoneMargin: 1.5,

            // --- Configuration Assets (MODIFIÉ) ---
            // Houses
            houseModelDir: "Public/Assets/Models/Houses/",
            houseModelFiles: [
                { file: "House1.fbx" }, // scale par défaut (1)
                { file: "House2.fbx", scale: 1.1 }, // Légèrement plus grand
                { file: "House3.fbx" },
                { file: "House4.fbx", scale: 0.9 }, // Légèrement plus petit
                { file: "House5.fbx" },
                { file: "House6.fbx" },
                { file: "House7.fbx" },
                { file: "House8.fbx" },
                { file: "House9.fbx" },
                { file: "House10.fbx", scale: 1.5 }, // Beaucoup plus grand
                { file: "House11.fbx" },
                { file: "House12.fbx" },
                { file: "House13.fbx" },
                { file: "House14.fbx" },
                { file: "House15.fbx" },
                { file: "House16.fbx" },
                { file: "House17.fbx" },
                { file: "House18.fbx" },
                { file: "House19.fbx" },
                { file: "House20.fbx" },
                { file: "House21.fbx" },
                { file: "House22.fbx" },
                { file: "House23.fbx" },
                { file: "House24.fbx" },
            ],
            houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,
            // Buildings
            buildingModelDir: "Public/Assets/Models/Buildings/",
            buildingModelFiles: [
				{ file: "Building1.fbx", scale: 1.0 },
                { file: "Building2.fbx" }, // Défaut 1
                { file: "Building3.fbx", scale: 1 },
                { file: "Building4.fbx" },
                { file: "Building5.fbx", scale: 0.95 },
                { file: "Building6.fbx" },
                { file: "Building7.fbx" },
                { file: "Building8.fbx" },
			],
            buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
            // Industrials
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: [
                { file: "Factory1_glb.glb", scale: 1 }, // Plus grand
                { file: "Factory2_glb.glb" },            // Défaut 1
                { file: "Factory3_glb.glb" }             // Défaut 1
            ],
            industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
            // Parks
            parkModelDir: "Public/Assets/Models/Parks/",
            parkModelFiles: [
                { file: "Bench.glb", scale: 0.5 },   // Banc plus grand
                { file: "Fountain.glb", scale: 1.0 }, // Fontaine taille normale
                { file: "Gazebo.glb", scale: 2 },             // Kiosque taille défaut (1)
                { file: "Table.glb", scale: 0.5 }     // Table plus grande
            ],
            parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,

			treeModelDir: "Public/Assets/Models/Trees/",
            treeModelFiles: [
                { file: "Tree.glb", scale: 0.9 },
                { file: "Tree2.glb", scale: 0.9 },
                { file: "Tree3.glb", scale: 0.9 },
				{ file: "Tree4.glb", scale: 0.9 },
                { file: "Tree5.glb", scale: 0.9 },
                { file: "Tree6.glb", scale: 0.9 },
                { file: "Tree7.glb", scale: 0.9 },
                // Ajoutez autant de modèles d'arbres que vous voulez
            ],

			/* houseModelDir: "Public/Assets/Models/Houses/",
            houseModelFiles: [
                { file: "HouseLOD.glb" }, // scale par défaut (1)
                { file: "HouseLOD.glb", scale: 1.1 }, // Légèrement plus grand
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb", scale: 0.9 }, // Légèrement plus petit
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb", scale: 1.5 }, // Beaucoup plus grand
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
            ],
            houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,
            // Buildings
            buildingModelDir: "Public/Assets/Models/Buildings/",
            buildingModelFiles: [
				{ file: "HouseLOD.glb", scale: 1.0 },
                { file: "HouseLOD.glb" }, // Défaut 1
                { file: "HouseLOD.glb", scale: 1 },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb", scale: 0.95 },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
                { file: "HouseLOD.glb" },
			],
            buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
            // Industrials
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: [
                { file: "HouseLOD.glb", scale: 1 }, // Plus grand
                { file: "HouseLOD.glb" },            // Défaut 1
                { file: "HouseLOD.glb" }             // Défaut 1
            ],
            industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
            // Parks
            parkModelDir: "Public/Assets/Models/Parks/",
            parkModelFiles: [
                { file: "HouseLOD.glb", scale: 0.5 },   // Banc plus grand
                { file: "HouseLOD.glb", scale: 1.0 }, // Fontaine taille normale
                { file: "HouseLOD.glb", scale: 2 },             // Kiosque taille défaut (1)
                { file: "HouseLOD.glb", scale: 0.5 }     // Table plus grande
            ],
            parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,

			treeModelDir: "Public/Assets/Models/Trees/",
            treeModelFiles: [
                { file: "HouseLOD.glb", scale: 0.9 },
                { file: "HouseLOD.glb", scale: 0.9 },
                { file: "HouseLOD.glb", scale: 0.9 },
				{ file: "HouseLOD.glb", scale: 0.9 },
                { file: "HouseLOD.glb", scale: 0.9 },
                { file: "HouseLOD.glb", scale: 0.9 },
                { file: "HouseLOD.glb", scale: 0.9 },
                // Ajoutez autant de modèles d'arbres que vous voulez
            ], */

            // Dimensions de base pour le calcul du fittingScaleFactor
            // Mettez des dimensions moyennes pour vos arbres
            treeBaseWidth: 4, treeBaseHeight: 8, treeBaseDepth: 4,
            // *** Fin Configuration Arbres ***

            // --- Paramètres de Densité des Arbres (NOUVEAU) ---
            // Probabilité (0 à 1) de placer un arbre à un emplacement potentiel
            treePlacementProbabilitySidewalk: 0, // 30% de chance sur les coins/bords des trottoirs
            treePlacementProbabilityPark: 0.04,    // Densité dans les parcs (par m² par exemple, ou par point testé)
            treePlacementProbabilityMargin: 0.008,   // Densité dans les marges des autres parcelles

            // --- Fusion avec config fournie ---
            ...config
        };

        // --- Matériaux Partagés ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }),
        };

        // --- Instanciation des Composants ---
        // Passe la config directement, CityAssetLoader lira les listes modifiées
        this.assetLoader = new CityAssetLoader(this.config); // MODIFIÉ: Passe toute la config

        this.layoutGenerator = new CityLayoutGenerator({
            roadWidth: this.config.roadWidth, minPlotSize: this.config.minPlotSize,
            maxPlotSize: this.config.maxPlotSize, maxRecursionDepth: this.config.maxRecursionDepth,
            parkProbability: this.config.parkProbability,
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
                minParkSubZoneSize: this.config.minParkSubZoneSize,
				treePlacementProbabilitySidewalk: this.config.treePlacementProbabilitySidewalk,
                treePlacementProbabilityPark: this.config.treePlacementProbabilityPark,
                treePlacementProbabilityMargin: this.config.treePlacementProbabilityMargin,
                 // Passer aussi les dimensions du trottoir pour le placement
                sidewalkWidth: this.config.sidewalkWidth,
            },
            this.materials
        );

        // --- Groupes pour Organisation Scène ---
        this.cityContainer = new THREE.Group();
        this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.buildingGroup = null;
        this.groundMesh = null;

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
            // assetLoader utilise maintenant la config passée au constructeur
            const loadedAssets = await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");

             const hasHouses = loadedAssets.house && loadedAssets.house.length > 0;
             const hasBuildings = loadedAssets.building && loadedAssets.building.length > 0;
             const hasFactories = loadedAssets.industrial && loadedAssets.industrial.length > 0;
             const hasParks = loadedAssets.park && loadedAssets.park.length > 0;

             if (!hasHouses && !hasBuildings && !hasFactories && !hasParks) {
                 console.warn("Aucun asset (maison, immeuble, usine ou parc) n'a pu être chargé.");
             } else {
                 console.log(`Assets chargés: ${loadedAssets.house?.length || 0} maisons, ${loadedAssets.building?.length || 0} immeubles, ${loadedAssets.industrial?.length || 0} usines, ${loadedAssets.park?.length || 0} parcs.`);
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
                 this.assetLoader // Passe l'instance du loader
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
        return []; // A implémenter
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