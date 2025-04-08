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
            minPlotSize: 15,
            maxPlotSize: 40, // Légèrement augmenté
            maxRecursionDepth: 7,
            // --- Probabilités des Zones ---
            parkProbability: 0.10,
            industrialZoneProbability: 0.15, // Zone industrielle
            houseZoneProbability: 0.40,
            // Le reste sera 'building' implicitement
            // --- Fin Probabilités ---
            // Roads/Sidewalks
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            // Plot Content & SubZones
            minHouseSubZoneSize: 7,
            minBuildingSubZoneSize: 10,
            minIndustrialSubZoneSize: 10, // Pour les usines
            buildingSubZoneMargin: 1.5,

            // --- Configuration Assets FBX ---
            // Houses
            houseModelDir: "Public/Assets/Models/Houses/",
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
            houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,
            // Buildings
            buildingModelDir: "Public/Assets/Models/Buildings/",
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
            buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
            // Factories (Nouveau)
            industrialModelDir: "Public/Assets/Models/Industrials/",
            industrialModelFiles: [ /* LISTEZ VOS FICHIERS USINES ICI */ "Factory1_glb.glb", "Factory2_glb.glb", "Factory3_glb.glb" ],
            industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
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
            // roadSurfaceMaterial: new THREE.MeshStandardMaterial({ color: 0x444444 }),
        };

        // --- Instanciation des Composants ---
        this.assetLoader = new CityAssetLoader({
            houseModelDir: this.config.houseModelDir, houseModelFiles: this.config.houseModelFiles,
            houseBaseWidth: this.config.houseBaseWidth, houseBaseHeight: this.config.houseBaseHeight, houseBaseDepth: this.config.houseBaseDepth,
            buildingModelDir: this.config.buildingModelDir, buildingModelFiles: this.config.buildingModelFiles,
            buildingBaseWidth: this.config.buildingBaseWidth, buildingBaseHeight: this.config.buildingBaseHeight, buildingBaseDepth: this.config.buildingBaseDepth,
            industrialModelDir: this.config.industrialModelDir, industrialModelFiles: this.config.industrialModelFiles,
            industrialBaseWidth: this.config.industrialBaseWidth, industrialBaseHeight: this.config.industrialBaseHeight, industrialBaseDepth: this.config.industrialBaseDepth,
        });

        this.layoutGenerator = new CityLayoutGenerator({
            roadWidth: this.config.roadWidth, minPlotSize: this.config.minPlotSize,
            maxPlotSize: this.config.maxPlotSize, maxRecursionDepth: this.config.maxRecursionDepth,
            parkProbability: this.config.parkProbability, industrialZoneProbability: this.config.industrialZoneProbability,
            houseZoneProbability: this.config.houseZoneProbability,
        });

        this.roadGenerator = new RoadNetworkGenerator(
            { roadWidth: this.config.roadWidth, centerlineWidth: this.config.centerlineWidth, centerlineHeight: this.config.centerlineHeight },
            { centerlineMaterial: this.materials.centerlineMaterial /*, roadSurfaceMaterial: this.materials.roadSurfaceMaterial */ }
        );

        this.contentGenerator = new PlotContentGenerator(
            {
                sidewalkWidth: this.config.sidewalkWidth, sidewalkHeight: this.config.sidewalkHeight,
                buildingSubZoneMargin: this.config.buildingSubZoneMargin, minHouseSubZoneSize: this.config.minHouseSubZoneSize,
                minBuildingSubZoneSize: this.config.minBuildingSubZoneSize, minIndustrialSubZoneSize: this.config.minIndustrialSubZoneSize,
            },
            {
                sidewalkMaterial: this.materials.sidewalkMaterial, parkMaterial: this.materials.parkMaterial,
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

    /**
     * Génère l'ensemble de la ville en orchestrant les différents générateurs.
     */
    async generateCity() {
        console.time("CityGeneration");
        this.clearCity(); // Nettoyer avant de générer

        try {
            console.log("--- Démarrage génération ville ---");
            // 1. Créer le sol global
            this.createGlobalGround();

            // 2. Charger les assets (asynchrone)
            console.time("AssetLoading");
            const loadedAssets = await this.assetLoader.loadAssets();
            console.timeEnd("AssetLoading");

             // Vérification si des assets ont été chargés
             const hasHouses = loadedAssets.house && loadedAssets.house.length > 0;
             const hasBuildings = loadedAssets.building && loadedAssets.building.length > 0;
             const hasFactories = loadedAssets.industrial && loadedAssets.industrial.length > 0;
             if (!hasHouses && !hasBuildings && !hasFactories) {
                 console.warn("Aucun asset (maison, immeuble ou usine) n'a pu être chargé.");
             } else {
                 console.log(`Assets chargés: ${loadedAssets.house?.length || 0} maisons, ${loadedAssets.building?.length || 0} immeubles, ${loadedAssets.industrial?.length || 0} usines.`);
             }

            // 3. Générer le layout (parcelles et types de zones)
            console.time("LayoutGeneration");
            const leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");

             if (!leafPlots || leafPlots.length === 0) {
                 throw new Error("La génération du layout n'a produit aucune parcelle utilisable.");
             }

            // 4. Générer le réseau routier
            console.time("RoadGeneration");
            this.roadGroup = this.roadGenerator.generateRoads(leafPlots);
            this.roadGroup.name = "RoadNetwork";
            this.cityContainer.add(this.roadGroup);
            console.timeEnd("RoadGeneration");

            // 5. Générer le contenu des parcelles (trottoirs, bâtiments, parcs, usines)
            console.time("ContentGeneration");
            const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(
                 leafPlots,
                 this.assetLoader // Passer le loader pour accès aux modèles
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
            this.clearCity(); // Nettoyer en cas d'échec partiel
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    /**
     * Nettoie la ville existante de la scène et réinitialise les composants.
     */
    clearCity() {
        console.log("Nettoyage de la ville existante...");
        // Réinitialiser les générateurs
        this.layoutGenerator?.reset();
        this.roadGenerator?.reset();
        this.contentGenerator?.reset();
        // Disposer les assets chargés (libère mémoire GPU/CPU)
         this.assetLoader?.disposeAssets();

        // Vider le conteneur principal et les références aux groupes
        while (this.cityContainer.children.length > 0) {
            // Les groupes internes (road, sidewalk, building) sont vidés par les reset()
            // On retire juste les groupes (maintenant vides) du conteneur.
            this.cityContainer.remove(this.cityContainer.children[0]);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.buildingGroup = null;

        // Supprimer le sol global s'il existe
        if (this.groundMesh) {
            if (this.groundMesh.parent) { // Vérifier s'il est attaché à la scène
                 this.groundMesh.parent.remove(this.groundMesh);
            }
            this.groundMesh.geometry.dispose();
            // Le matériau `groundMaterial` est partagé, ne pas le disposer ici.
            this.groundMesh = null;
        }
         console.log("Nettoyage terminé.");
    }

    /**
     * Crée le plan de sol global pour la ville s'il n'existe pas.
     */
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

    /**
     * Retourne la liste des parcelles finales générées.
     * @returns {Array<Plot>}
     */
    getPlots() {
       return this.layoutGenerator?.leafPlots || [];
    }

    /**
     * Placeholder pour récupérer les données du réseau routier (pour IA par exemple).
     * @returns {null} - A implémenter
     */
    getRoadNetworkData() {
        // return this.roadGenerator?.getNetworkGraph(); // A implémenter
        return null;
    }

    /**
     * Placeholder pour récupérer des informations sur les bâtiments placés.
     * @returns {Array} - A implémenter
     */
    getBuildings() {
        // return this.contentGenerator?.getBuildingInfo(); // A implémenter
        return [];
    }

    /**
     * Méthode appelée à chaque frame pour les mises à jour (non utilisée pour l'instant).
     */
    update() {
        // Logique de mise à jour si la ville devient dynamique
    }

    /**
     * Nettoie toutes les ressources créées par le CityManager lors de sa destruction.
     */
    destroy() {
        console.log("Destruction du CityManager...");
        this.clearCity(); // Nettoie les composants, assets, et objets de la scène

        // Disposer les matériaux créés spécifiquement par ce manager
        Object.values(this.materials).forEach(material => {
            if (material && material.dispose) {
                material.dispose();
            }
        });
        this.materials = {};

        // Supprimer le conteneur principal de la scène s'il est encore attaché
        if (this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        console.log("CityManager détruit.");
    }
}