import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
// FBXLoader sera importé dans CityAssetLoader.js

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration Principale ---
        this.config = {
            // Layout
            mapSize: 500,
            roadWidth: 10,
            minPlotSize: 15,
            maxPlotSize: 30,
            maxRecursionDepth: 7,
            parkProbability: 0.15,
            houseZoneProbability: 0.5,
            // Roads/Sidewalks
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            // Plot Content
            minHouseSubZoneSize: 7,
            minBuildingSubZoneSize: 10,
            buildingSubZoneMargin: 1,

            // --- Configuration Assets FBX ---
            houseModelDir: "Public/Assets/Models/Houses/", // <- Chemin vers le dossier des maisons
            houseModelFiles: [
				"House1.fbx",
				"House2.fbx",
				"House3.fbx",
				"House4.fbx",
				"House5.fbx",
				"House6.fbx",
				"House7.fbx",
				"House8.fbx",
				"House9.fbx",
				"House10.fbx",
				"House11.fbx",
				"House12.fbx",
				"House13.fbx",
				"House14.fbx",
				"House15.fbx",
				"House16.fbx",
				"House17.fbx",
				"House18.fbx",
				"House19.fbx",
				"House20.fbx",
				"House21.fbx",
				"House22.fbx",
				"House23.fbx",
				"House24.fbx",
			],
            houseBaseWidth: 6, // Taille cible commune pour le scaling
            houseBaseHeight: 6,
            houseBaseDepth: 6,

            buildingModelDir: "Public/Assets/Models/Buildings/", // <- Chemin vers le dossier des immeubles
            buildingModelFiles: [
				"Building1.fbx",
				"Building2.fbx",
				"Building3.fbx",
				"Building4.fbx",
				"Building5.fbx",
				"Building6.fbx",
				"Building7.fbx",
				"Building8.fbx",
			],
            buildingBaseWidth: 10, // Taille cible commune pour le scaling
            buildingBaseHeight: 20,
            buildingBaseDepth: 10,
            // --- Fin Configuration Assets ---

            // --- Fusion avec config fournie par l'utilisateur ---
            ...config
        };

        // --- Matériaux Partagés ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x55aa55 }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }),
            // roadSurfaceMaterial: new THREE.MeshStandardMaterial({ color: 0x444444 }), // Pour plus tard
        };

        // --- Instanciation des Composants ---
        this.assetLoader = new CityAssetLoader({
            houseModelDir: this.config.houseModelDir,
            houseModelFiles: this.config.houseModelFiles,
            houseBaseWidth: this.config.houseBaseWidth,
            houseBaseHeight: this.config.houseBaseHeight,
            houseBaseDepth: this.config.houseBaseDepth,
            buildingModelDir: this.config.buildingModelDir,
            buildingModelFiles: this.config.buildingModelFiles,
            buildingBaseWidth: this.config.buildingBaseWidth,
            buildingBaseHeight: this.config.buildingBaseHeight,
            buildingBaseDepth: this.config.buildingBaseDepth,
        });

        this.layoutGenerator = new CityLayoutGenerator({
            roadWidth: this.config.roadWidth,
            minPlotSize: this.config.minPlotSize,
            maxPlotSize: this.config.maxPlotSize,
            maxRecursionDepth: this.config.maxRecursionDepth,
            parkProbability: this.config.parkProbability,
            houseZoneProbability: this.config.houseZoneProbability,
        });

        this.roadGenerator = new RoadNetworkGenerator(
            {
                roadWidth: this.config.roadWidth,
                centerlineWidth: this.config.centerlineWidth,
                centerlineHeight: this.config.centerlineHeight,
            },
            { // Matériaux pour les routes
                centerlineMaterial: this.materials.centerlineMaterial,
                // roadSurfaceMaterial: this.materials.roadSurfaceMaterial,
            }
        );

        this.contentGenerator = new PlotContentGenerator(
            { // Configuration pour le contenu
                sidewalkWidth: this.config.sidewalkWidth,
                sidewalkHeight: this.config.sidewalkHeight,
                buildingSubZoneMargin: this.config.buildingSubZoneMargin,
                minHouseSubZoneSize: this.config.minHouseSubZoneSize,
                minBuildingSubZoneSize: this.config.minBuildingSubZoneSize,
            },
            { // Matériaux pour le contenu
                sidewalkMaterial: this.materials.sidewalkMaterial,
                parkMaterial: this.materials.parkMaterial,
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
    }

    async generateCity() {
        console.time("CityGeneration");
        this.clearCity(); // Nettoyer avant de générer

        try {
            console.log("--- Démarrage génération ville ---");
            // 1. Créer le sol global
            this.createGlobalGround();

            // 2. Charger les assets (asynchrone) - TOUS les modèles FBX listés
            console.time("AssetLoading");
            const loadedAssets = await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");

             // Vérification si des assets ont été chargés
             const hasHouses = loadedAssets.house && loadedAssets.house.length > 0;
             const hasBuildings = loadedAssets.building && loadedAssets.building.length > 0;
             if (!hasHouses && !hasBuildings) {
                 console.warn("Aucun asset (maison ou immeuble) n'a pu être chargé. La ville n'aura pas de bâtiments.");
                 // Option : arrêter ici si c'est critique
                 // throw new Error("Assets essentiels non chargés.");
             } else {
                 console.log(`Assets chargés: ${loadedAssets.house?.length || 0} modèles maisons, ${loadedAssets.building?.length || 0} modèles immeubles.`);
             }

            // 3. Générer le layout (parcelles)
            console.time("LayoutGeneration");
            const leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");

             if (!leafPlots || leafPlots.length === 0) {
                 throw new Error("La génération du layout n'a produit aucune parcelle.");
             }

            // 4. Générer le réseau routier
            console.time("RoadGeneration");
            this.roadGroup = this.roadGenerator.generateRoads(leafPlots);
            this.roadGroup.name = "RoadNetwork";
            this.cityContainer.add(this.roadGroup);
            console.timeEnd("RoadGeneration");

            // 5. Générer le contenu des parcelles (trottoirs, bâtiments, parcs)
            console.time("ContentGeneration");
             // Passe l'instance de l'assetLoader pour accès aux méthodes getRandom/getById
            const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(
                 leafPlots,
                 this.assetLoader // Passer le loader
             );
            this.sidewalkGroup = sidewalkGroup;
            this.buildingGroup = buildingGroup;
             this.sidewalkGroup.name = "Sidewalks";
             this.buildingGroup.name = "PlotContents"; // Contient bâtiments, parcs, sols
            this.cityContainer.add(this.sidewalkGroup);
            this.cityContainer.add(this.buildingGroup);
            console.timeEnd("ContentGeneration");

            console.log("--- Génération ville terminée ---");

        } catch (error) {
            console.error("Erreur majeure durant la génération de la ville:", error);
            this.clearCity(); // Nettoyer en cas d'échec partiel
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    clearCity() {
        console.log("Nettoyage de la ville existante...");
        // Demander à chaque composant de se nettoyer
        this.layoutGenerator?.reset();
        this.roadGenerator?.reset();
        this.contentGenerator?.reset();
        // Disposer les assets chargés (important pour libérer la mémoire GPU)
         this.assetLoader?.disposeAssets();


        // Vider le conteneur principal et les références aux groupes
        while (this.cityContainer.children.length > 0) {
            this.cityContainer.remove(this.cityContainer.children[0]);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.buildingGroup = null;


        // Supprimer le sol global s'il existe
        if (this.groundMesh) {
            if (this.groundMesh.parent) {
                 this.groundMesh.parent.remove(this.groundMesh);
            }
            this.groundMesh.geometry.dispose();
            // Ne pas disposer le matériau global partagé
            this.groundMesh = null;
        }
         console.log("Nettoyage terminé.");
    }

    createGlobalGround() {
        if (this.groundMesh) { // Éviter recréation
             if (!this.groundMesh.parent) { // S'assurer qu'il est dans la scène
                 this.scene.add(this.groundMesh);
             }
             return;
        }

        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = 0; // Niveau 0
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "GlobalGround";
        this.scene.add(this.groundMesh); // Ajouté directement à la scène, pas dans cityContainer
        console.log("Sol global créé.");
    }

    // --- Méthodes potentielles pour l'avenir ---
    getPlots() {
       return this.layoutGenerator?.leafPlots || [];
    }

    getRoadNetworkData() {
        // Pourrait retourner une structure de données plus abstraite
        // return this.roadGenerator?.getNetworkGraph(); // A implémenter
        return null;
    }

    getBuildings() {
        // Retourner des infos sur les bâtiments placés
        // return this.contentGenerator?.getBuildingInfo(); // A implémenter
        return [];
    }

    update() {
        // Logique de mise à jour si la ville devient dynamique
        // this.pedestrianManager?.update(this.experience.time.delta);
    }

    destroy() {
        console.log("Destruction du CityManager...");
        this.clearCity(); // Assure le nettoyage des composants et assets

        // Disposer les matériaux créés par ce manager
        Object.values(this.materials).forEach(material => {
            if (material && material.dispose) {
                material.dispose();
            }
        });
        this.materials = {};

        // Supprimer le conteneur principal de la scène
        if (this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        console.log("CityManager détruit.");
    }
}