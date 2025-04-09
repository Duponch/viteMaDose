// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
// FBXLoader est importé dans CityAssetLoader.js

export default class CityManager {
    // ----- CONSTRUCTEUR MODIFIÉ -----
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration Principale ---
        this.config = {
            // Layout
            mapSize: 500,
            roadWidth: 10,
            minPlotSize: 13,
            maxPlotSize: 40, // Pour les zones de base
            maxRecursionDepth: 7,
            // --- Probabilités des Zones ---
            parkProbability: 0.10,
            industrialZoneProbability: 0.15,
            houseZoneProbability: 0.35, // Réduit légèrement
            skyscraperZoneProbability: 0.10, // Ajout de la probabilité pour les gratte-ciels
            // La probabilité 'building' devient le reste (implicite dans CityLayoutGenerator)

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
            minSkyscraperSubZoneSize: 13, // Taille minimale pour un gratte-ciel
            buildingSubZoneMargin: 1.5, // Marge générale

            // --- Configuration Assets ---
            // Houses
            houseModelDir: "Public/Assets/Models/Houses/",
            houseModelFiles: [
                { file: "House1.fbx" }, { file: "House2.fbx", scale: 1.1 }, { file: "House3.fbx" },
                { file: "House4.fbx", scale: 0.9 }, { file: "House5.fbx" }, { file: "House6.fbx" },
                { file: "House7.fbx" }, { file: "House8.fbx" }, { file: "House9.fbx" },
                { file: "House10.fbx", scale: 1.5 }, { file: "House11.fbx" }, { file: "House12.fbx" },
                { file: "House13.fbx" }, { file: "House14.fbx" }, { file: "House15.fbx" },
                { file: "House16.fbx" }, { file: "House17.fbx" }, { file: "House18.fbx" },
                { file: "House19.fbx" }, { file: "House20.fbx" }, { file: "House21.fbx" },
                { file: "House22.fbx" }, { file: "House23.fbx" }, { file: "House24.fbx" },
            ],
            houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,
            // Buildings (non-skyscraper)
            buildingModelDir: "Public/Assets/Models/Buildings/",
            buildingModelFiles: [
				{ file: "Building1.fbx", scale: 1.0 }, { file: "Building2.fbx" }, { file: "Building3.fbx", scale: 1 },
                { file: "Building4.fbx" }, { file: "Building5.fbx", scale: 0.95 }, { file: "Building6.fbx" },
                { file: "Building7.fbx" }, { file: "Building8.fbx" }, { file: "Building9.glb", scale: 1.2 }, { file: "Building10.glb", scale: 1 },
			],
            buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
            // Industrials
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: [
                { file: "Factory1_glb.glb", scale: 1 }, { file: "Factory2_glb.glb" }, { file: "Factory3_glb.glb" }
            ],
            industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
            // Parks
            parkModelDir: "Public/Assets/Models/Parks/",
            parkModelFiles: [
                { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 },
                { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 }
            ],
            parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,
            // Trees
            treeModelDir: "Public/Assets/Models/Trees/",
            treeModelFiles: [
                { file: "Tree.glb", scale: 0.9 }, { file: "Tree2.glb", scale: 0.9 }, { file: "Tree3.glb", scale: 0.9 },
				{ file: "Tree4.glb", scale: 0.9 }, { file: "Tree5.glb", scale: 0.9 }, { file: "Tree6.glb", scale: 0.9 },
                { file: "Tree7.glb", scale: 0.9 },
            ],
            treeBaseWidth: 4, treeBaseHeight: 8, treeBaseDepth: 4,

            // --- NOUVEAU: Skyscraper Assets ---
            skyscraperModelDir: "Public/Assets/Models/Skyscrapers/",
            skyscraperModelFiles: [
                { file: "Skyscraper1.glb", scale: 0.8 }, // Assurez-vous que ces fichiers existent
                { file: "Skyscraper2.glb", scale: 1 },
				{ file: "Skyscraper3.glb", scale: 1 },
                // Ajoutez d'autres fichiers .glb ici
                // { file: "Skyscraper3.glb", scale: 1.1 }, // Exemple avec scale
            ],
            // Définissez des dimensions de base appropriées pour les gratte-ciels
            skyscraperBaseWidth: 15,
            skyscraperBaseHeight: 80, // Beaucoup plus haut
            skyscraperBaseDepth: 15,
            // --- FIN Skyscraper Assets ---

            // --- Paramètres de Densité des Arbres ---
            treePlacementProbabilitySidewalk: 0.3,
            treePlacementProbabilityPark: 0.04,
            treePlacementProbabilityMargin: 0.008,

            // --- Fusion avec config fournie ---
            ...config
        };

        // --- Matériaux Partagés ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }), // Utilisé pour building ET skyscraper
        };

        // --- Instanciation des Composants ---
        // Passe la config complète qui inclut maintenant 'skyscraper'
        this.assetLoader = new CityAssetLoader(this.config); // MODIFIÉ implicitement

        this.layoutGenerator = new CityLayoutGenerator({
            roadWidth: this.config.roadWidth, minPlotSize: this.config.minPlotSize,
            maxPlotSize: this.config.maxPlotSize, maxRecursionDepth: this.config.maxRecursionDepth,
            // Passer toutes les probabilités nécessaires
            parkProbability: this.config.parkProbability,
            industrialZoneProbability: this.config.industrialZoneProbability,
            houseZoneProbability: this.config.houseZoneProbability,
            skyscraperZoneProbability: this.config.skyscraperZoneProbability, // <- Ajouté
        });

        this.roadGenerator = new RoadNetworkGenerator(
            { roadWidth: this.config.roadWidth, centerlineWidth: this.config.centerlineWidth, centerlineHeight: this.config.centerlineHeight },
            { centerlineMaterial: this.materials.centerlineMaterial }
        );

        this.contentGenerator = new PlotContentGenerator(
            {
                // Passer toutes les tailles min et marges
                sidewalkWidth: this.config.sidewalkWidth, sidewalkHeight: this.config.sidewalkHeight,
                buildingSubZoneMargin: this.config.buildingSubZoneMargin,
                minHouseSubZoneSize: this.config.minHouseSubZoneSize,
                minBuildingSubZoneSize: this.config.minBuildingSubZoneSize,
                minIndustrialSubZoneSize: this.config.minIndustrialSubZoneSize,
                minParkSubZoneSize: this.config.minParkSubZoneSize,
                minSkyscraperSubZoneSize: this.config.minSkyscraperSubZoneSize, // <- Ajouté
				treePlacementProbabilitySidewalk: this.config.treePlacementProbabilitySidewalk,
                treePlacementProbabilityPark: this.config.treePlacementProbabilityPark,
                treePlacementProbabilityMargin: this.config.treePlacementProbabilityMargin,
            },
            this.materials
        );

        // --- Groupes pour Organisation Scène ---
        this.cityContainer = new THREE.Group();
        this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.buildingGroup = null; // Contiendra buildings, houses, industrials, parks, skyscrapers ET trees
        this.groundMesh = null;

        this.scene.add(this.cityContainer);
        console.log("CityManager initialisé (avec support skyscraper).");
    }

    // ----- generateCity MODIFIÉ (pour log) -----
    async generateCity() {
        console.time("CityGeneration");
        this.clearCity();

        try {
            console.log("--- Démarrage génération ville ---");
            this.createGlobalGround();

            console.time("AssetLoading");
            const loadedAssets = await this.assetLoader.loadAssets(); // Charge maintenant aussi les skyscrapers
            console.timeEnd("AssetLoading");

             // Log amélioré pour inclure les gratte-ciels
             const hasHouses = loadedAssets.house && loadedAssets.house.length > 0;
             const hasBuildings = loadedAssets.building && loadedAssets.building.length > 0;
             const hasFactories = loadedAssets.industrial && loadedAssets.industrial.length > 0;
             const hasParks = loadedAssets.park && loadedAssets.park.length > 0;
             const hasSkyscrapers = loadedAssets.skyscraper && loadedAssets.skyscraper.length > 0; // <- Vérification ajoutée
             const hasTrees = loadedAssets.tree && loadedAssets.tree.length > 0;

             if (!hasHouses && !hasBuildings && !hasFactories && !hasParks && !hasSkyscrapers) {
                 console.warn("Aucun asset de contenu principal (maison, immeuble, usine, parc, gratte-ciel) n'a pu être chargé.");
             } else {
                 console.log(`Assets chargés: ${loadedAssets.house?.length || 0} maisons, ${loadedAssets.building?.length || 0} immeubles, ${loadedAssets.industrial?.length || 0} usines, ${loadedAssets.park?.length || 0} parcs, ${loadedAssets.skyscraper?.length || 0} gratte-ciels, ${loadedAssets.tree?.length || 0} arbres.`); // <- Log modifié
             }

            console.time("LayoutGeneration");
            const leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize); // Assigne maintenant aussi le type 'skyscraper'
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
            // Place maintenant aussi les gratte-ciels et les arbres
            const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(
                 leafPlots,
                 this.assetLoader
             );
            this.sidewalkGroup = sidewalkGroup;
            this.buildingGroup = buildingGroup; // Contient maintenant tous les types de bâtiments + arbres
            this.sidewalkGroup.name = "Sidewalks";
            this.buildingGroup.name = "PlotContents"; // Renommé pour clarté
            this.cityContainer.add(this.sidewalkGroup);
            this.cityContainer.add(this.buildingGroup);
            console.timeEnd("ContentGeneration");

            console.log("--- Génération ville terminée ---");

        } catch (error) {
            console.error("Erreur majeure durant la génération de la ville:", error);
            this.clearCity(); // Nettoie même en cas d'erreur
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    // ----- clearCity MODIFIÉ -----
    clearCity() {
        console.log("Nettoyage de la ville existante...");
        this.layoutGenerator?.reset();
        this.roadGenerator?.reset();
        this.contentGenerator?.reset(); // Réinitialise maintenant aussi les données skyscraper
        this.assetLoader?.disposeAssets(); // Dispose maintenant aussi les assets skyscraper

        // Vider le conteneur principal
        while (this.cityContainer.children.length > 0) {
            this.cityContainer.remove(this.cityContainer.children[0]);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.buildingGroup = null; // Réinitialiser la référence

        // Supprimer le sol global s'il existe
        if (this.groundMesh) {
            if (this.groundMesh.parent) {
                 this.groundMesh.parent.remove(this.groundMesh);
            }
            this.groundMesh.geometry.dispose();
            // Note: le matériau est partagé et sera disposé dans destroy()
            this.groundMesh = null;
        }
         console.log("Nettoyage terminé.");
    }

    // ----- createGlobalGround (Inchangé mais fourni pour contexte) -----
    createGlobalGround() {
        if (this.groundMesh) {
             // Si le sol existe déjà (peut arriver si generateCity est appelé plusieurs fois sans destroy)
             // Assurez-vous qu'il est dans la scène
             if (!this.groundMesh.parent) this.scene.add(this.groundMesh);
             return;
        }
        // Création initiale
        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        // Utilise le matériau partagé
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = 0; // Au niveau du sol
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "GlobalGround";
        this.scene.add(this.groundMesh);
        console.log("Sol global créé.");
    }

    // ----- destroy MODIFIÉ (pour s'assurer que les matériaux partagés sont bien gérés) -----
    destroy() {
        console.log("Destruction du CityManager...");
        this.clearCity(); // Appelle le nettoyage complet d'abord

        // Disposer les matériaux partagés explicitement ici
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        this.materials = {}; // Vider l'objet
        console.log("  - Matériaux partagés disposés.");

        // Retirer le conteneur principal de la scène s'il y est toujours
        if (this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        // Mettre les composants à null pour aider le GC
        this.assetLoader = null;
        this.layoutGenerator = null;
        this.roadGenerator = null;
        this.contentGenerator = null;
        this.experience = null;
        this.scene = null;

        console.log("CityManager détruit.");
    }

    // --- Méthodes utilitaires (inchangées mais fournies) ---
    getPlots() {
       return this.layoutGenerator?.leafPlots || [];
    }

    getRoadNetworkData() {
        // À implémenter si nécessaire pour récupérer des infos sur les routes
        return null;
    }

    getBuildings() {
        // Pourrait être étendu pour retourner des infos sur TOUS les bâtiments/structures
        return []; // À implémenter
    }

    update() {
        // Logique de mise à jour future (ex: animation, simulation)
        this.cityManager?.update(); // Si CityManager avait une logique d'update
    }
}