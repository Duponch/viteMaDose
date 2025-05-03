import BuildingRenderer from '../Buildings/BuildingRenderer.js';
import NewBuildingRenderer from '../Buildings/NewBuildingRenderer.js';
import SkyscraperRenderer from '../Buildings/SkyscraperRenderer.js';

        // --- Initialisation des Composants Dépendants ---
        // Crée InstancedMeshManager maintenant qu'on a les renderers
        const allRenderers = {
            ...renderers,
            newBuildingRenderer: new NewBuildingRenderer(this.config, this.materials)
        };
        
        this.instancedMeshManager = new InstancedMeshManager(
            this.config,
            this.materials,
            assetLoader,
            allRenderers, // Passe les renderers ici
            this.buildingGroup, // Le groupe cible
            this.experience
        );

        // --- Initialisation des Stratégies de Placement ---
        this.zoneStrategies = {
            'house': new HousePlacementStrategy(this.config, assetLoader, allRenderers, this.experience),
            'building': new BuildingPlacementStrategy(this.config, assetLoader, allRenderers, this.experience),
            'industrial': new IndustrialPlacementStrategy(this.config, assetLoader, allRenderers, this.experience),
            'skyscraper': new SkyscraperPlacementStrategy(this.config, assetLoader, allRenderers, this.experience),
            'park': new ParkPlacementStrategy(this.config, assetLoader, allRenderers, this.experience)
        }; 