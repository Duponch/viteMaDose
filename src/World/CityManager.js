import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.config = {
            // --- Valeurs par défaut (fusionnées avec celles fournies) ---
            // Layout
            mapSize: 500,
            roadWidth: 10,
            minPlotSize: 15,
            maxPlotSize: 30,
            maxRecursionDepth: 7,
            parkProbability: 0.15,
            houseZoneProbability: 0.5,
             // Roads
             sidewalkWidth: 2, // Note: utilisé par PlotContentGenerator mais lié à roadWidth
             sidewalkHeight: 0.2,
             centerlineWidth: 0.15,
             centerlineHeight: 0.02,
             // Content
             buildingMinHeight: 5, // Pas directement utilisé avec les modèles scale factor ?
             buildingMaxHeight: 25, // Idem
             minHouseSubZoneSize: 7,
             minBuildingSubZoneSize: 10,
             buildingSubZoneMargin: 1,
             // Assets
             houseModelPath: "Public/Assets/Models/House4.glb", // MAJ chemin si besoin
             houseBaseWidth: 6,
             houseBaseHeight: 6,
             houseBaseDepth: 6,
             buildingModelPath: "Public/Assets/Models/Building5fix.glb", // MAJ chemin si besoin
             // buildingMaterialPath: "Public/Assets/Models/Building4.mtl", // Non utilisé avec GLB
             buildingBaseWidth: 10,
             buildingBaseHeight: 20,
             buildingBaseDepth: 10,
             // --- Fusion avec config fournie ---
            ...config
        };

        // --- Définition des matériaux centraux ---
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }), // Sol global
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x55aa55 }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }), // Sol des parcelles
            // Ajoutez d'autres matériaux ici (surface route, etc.)
             // roadSurfaceMaterial: new THREE.MeshStandardMaterial({ color: 0x444444 }),
        };

        // --- Instanciation des composants ---
        // Note: Passez seulement les parties nécessaires de config et materials
        this.assetLoader = new CityAssetLoader({
            houseModelPath: this.config.houseModelPath,
            houseBaseWidth: this.config.houseBaseWidth,
            houseBaseHeight: this.config.houseBaseHeight,
            houseBaseDepth: this.config.houseBaseDepth,
            buildingModelPath: this.config.buildingModelPath,
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
            {
                 centerlineMaterial: this.materials.centerlineMaterial,
                 // roadSurfaceMaterial: this.materials.roadSurfaceMaterial,
            }
        );
        this.contentGenerator = new PlotContentGenerator(
             {
                 sidewalkWidth: this.config.sidewalkWidth,
                 sidewalkHeight: this.config.sidewalkHeight,
                 buildingSubZoneMargin: this.config.buildingSubZoneMargin,
                 minHouseSubZoneSize: this.config.minHouseSubZoneSize,
                 minBuildingSubZoneSize: this.config.minBuildingSubZoneSize,
                 // Ajoutez d'autres configs nécessaires (park details...)
             },
             {
                 sidewalkMaterial: this.materials.sidewalkMaterial,
                 parkMaterial: this.materials.parkMaterial,
                 buildingGroundMaterial: this.materials.buildingGroundMaterial,
             }
        );

        // --- Groupes pour organiser la scène ---
        this.cityContainer = new THREE.Group(); // Conteneur principal pour toute la ville
        this.roadGroup = null; // Sera assigné par roadGenerator
        this.sidewalkGroup = null; // Sera assigné par contentGenerator
        this.buildingGroup = null; // Sera assigné par contentGenerator
        this.groundMesh = null; // Sol global

        this.scene.add(this.cityContainer);
    }

    async generateCity() {
        console.time("CityGeneration"); // Mesurer le temps total
        this.clearCity(); // Nettoyer avant de générer

        try {
             console.log("--- Démarrage génération ville ---");
            // 1. Créer le sol global
            this.createGlobalGround();

            // 2. Charger les assets (asynchrone)
            console.time("AssetLoading");
            const loadedAssets = await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");

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
            this.cityContainer.add(this.roadGroup);
            console.timeEnd("RoadGeneration");

            // 5. Générer le contenu des parcelles (trottoirs, bâtiments, parcs)
            console.time("ContentGeneration");
            const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(leafPlots, loadedAssets);
            this.sidewalkGroup = sidewalkGroup;
            this.buildingGroup = buildingGroup;
            this.cityContainer.add(this.sidewalkGroup);
            this.cityContainer.add(this.buildingGroup);
            console.timeEnd("ContentGeneration");

            console.log("--- Génération ville terminée ---");

        } catch (error) {
            console.error("Erreur majeure durant la génération de la ville:", error);
            // Peut-être afficher un message à l'utilisateur ou revenir à un état stable
            this.clearCity(); // Nettoyer en cas d'échec partiel
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    clearCity() {
        console.log("Nettoyage de la ville existante...");
        // Demander à chaque composant de se nettoyer
        this.layoutGenerator?.reset(); // Le '?' est une sécurité si l'init échoue
        this.roadGenerator?.reset();
        this.contentGenerator?.reset();
        // Disposer les assets chargés (important pour libérer la mémoire GPU)
         this.assetLoader?.disposeAssets();


        // Vider le conteneur principal
        while (this.cityContainer.children.length > 0) {
            // Les groupes internes (road, sidewalk, building) ont déjà été vidés
            // par les reset() des générateurs, on retire juste les groupes vides.
            this.cityContainer.remove(this.cityContainer.children[0]);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.buildingGroup = null;


        // Supprimer le sol global s'il existe
        if (this.groundMesh) {
            this.scene.remove(this.groundMesh);
            this.groundMesh.geometry.dispose();
            // Ne pas disposer le matériau global partagé
            this.groundMesh = null;
        }
         console.log("Nettoyage terminé.");
    }

    createGlobalGround() {
        if (this.groundMesh) return; // Ne pas recréer si déjà existant

        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = 0; // Niveau 0
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "GlobalGround"; // Nom pour débogage
        this.scene.add(this.groundMesh); // Ajouté directement à la scène, pas dans cityContainer
    }

     // --- Méthodes potentielles pour l'avenir ---
     getPlots() {
        return this.layoutGenerator?.leafPlots || [];
     }

     getRoadNetworkData() {
         // Pourrait retourner une structure de données plus abstraite du réseau
         // pour le pathfinding, plutôt que juste le THREE.Group
         return this.roadGenerator?.getNetworkGraph(); // Méthode à implémenter dans RoadNetworkGenerator
     }

     getBuildings() {
         // Retourner des infos sur les bâtiments placés
         return this.contentGenerator?.getBuildingInfo(); // Méthode à implémenter
     }

     update() {
         // Logique de mise à jour si la ville devient dynamique
         // this.pedestrianManager?.update(this.experience.time.delta);
     }

     destroy() {
         console.log("Destruction du CityManager...");
         this.clearCity();
         // Disposer les matériaux créés par ce manager
         Object.values(this.materials).forEach(material => {
             if (material && material.dispose) {
                 material.dispose();
             }
         });
         this.materials = {};
         // Supprimer le conteneur de la scène
         if (this.cityContainer.parent) {
            this.cityContainer.parent.remove(this.cityContainer);
         }
         // Autres nettoyages si nécessaire
     }
}