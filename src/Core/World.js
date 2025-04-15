// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import AgentManager from '../World/AgentManager.js';
// ... autres imports ...
import DebugVisualManager from '../World/DebugVisualManager.js'; // Assurez-vous qu'il est importé

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Managers ---
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agentManager = null; // Will be initialized in initializeWorld

        // --- Debug Groups (existants) ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        // REMOVED : debugPlotGridGroup (maintenant géré par DebugVisualManager)
        // REMOVED : debugAgentPathGroup (maintenant géré par DebugVisualManager ?)
        // Ou garder debugAgentPathGroup séparé si on veut un contrôle différent

        // --- NOUVEAU : Centralisation via DebugVisualManager ---
        // Utiliser le DebugVisualManager du CityManager si possible, ou en créer un
        this.debugVisualManager = this.cityManager.debugVisualManager; // Accès au manager centralisé
        if (!this.debugVisualManager) {
            console.warn("World: DebugVisualManager non trouvé dans CityManager, création locale.");
            // Créez un DebugVisualManager local si nécessaire, mais l'approche centralisée est meilleure.
            // this.debugVisualManager = new DebugVisualManager(null, this.cityManager.materials);
            // this.scene.add(this.debugVisualManager.parentGroup); // Ajouter son groupe à la scène
        }
        // On garde un groupe séparé pour les chemins des agents pour le moment
        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);
        // --- FIN NOUVEAU ---


        // Initial visibility
        this.debugNavGridGroup.visible = false;
        if (this.debugVisualManager) this.debugVisualManager.parentGroup.visible = false;
        this.debugAgentPathGroup.visible = false;

		const districtH = this.debugVisualManager.districtGroundHeight || 0.005;
        const plotH = this.debugVisualManager.plotGroundHeight || 0.01;

        this.debugHeights = {
            districtGround: 0.005,                 // Centre Y du sol district
            plotGround: 0.015,                   // Centre Y du sol parcelle (au dessus district)
            // plotOutline: 0.03,                // Si vous gardez les outlines
            navGrid: 0.04,                     // NavGrid au dessus
            agentPath: 0.05                    // Chemins au dessus
        };

        this.initializeWorld();
    }

    setDebugMode(enabled) {
        // Visibilité des groupes existants
        this.debugAgentPathGroup.visible = enabled;
        this.debugNavGridGroup.visible = enabled;

        // Gérer le groupe central de debugVisualManager
        if (this.debugVisualManager && this.debugVisualManager.parentGroup) { // Ajout vérification parentGroup
            this.debugVisualManager.parentGroup.visible = enabled;

            // --- CORRECTION ICI : Utiliser this.scene ---
            const isInScene = this.debugVisualManager.parentGroup.parent === this.scene; // Vérifier si attaché à this.scene
            if (enabled && !isInScene) {
                this.scene.add(this.debugVisualManager.parentGroup); // Ajouter à this.scene
                console.log("  [World Debug] Added debugVisualManager.parentGroup to scene.");
            } else if (!enabled && isInScene) {
                this.scene.remove(this.debugVisualManager.parentGroup); // Retirer de this.scene
                 console.log("  [World Debug] Removed debugVisualManager.parentGroup from scene.");
            }
            // --- FIN CORRECTION ---

            if (enabled) {
				console.log("  [World Debug] Creating/Updating visuals...");
				if (this.cityManager) {
					const plots = this.cityManager.getPlots();
					const districts = this.cityManager.getDistricts();
					const buildingInstances = this.cityManager.getBuildingInstances();

					// Création sols districts (le plus bas)
					if (districts && districts.length > 0) {
						this.debugVisualManager.createDistrictGroundVisuals(districts, this.debugHeights.districtGround);
					} else { this.debugVisualManager.clearDebugVisuals('DistrictGroundVisuals'); }

					// Création sols parcelles (au-dessus)
					if (plots && plots.length > 0) {
						this.debugVisualManager.createPlotGroundVisuals(plots, this.debugHeights.plotGround);
					} else { this.debugVisualManager.clearDebugVisuals('PlotGroundVisuals'); }

					// Création outlines bâtiments (cubes opaques)
					if (buildingInstances && buildingInstances.size > 0) {
						 // On passe un offset Y pour que la base des cubes soit légèrement au-dessus des sols debug
						this.debugVisualManager.createBuildingOutlines(buildingInstances, this.cityManager.config, 0.05);
					} else { this.debugVisualManager.clearDebugVisuals('BuildingOutlines'); }

					// NavGrid
					if (this.cityManager.navigationGraph) {
						 this.clearDebugNavGrid();
						 this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
					} else { this.clearDebugNavGrid(); }
					this.debugNavGridGroup.position.y = this.debugHeights.navGrid; // Positionner le groupe NavGrid

					// --- Optionnel: Nettoyer les outlines si redondants ---
					this.debugVisualManager.clearDebugVisuals('PlotOutlines');
					// this.debugVisualManager.clearDebugVisuals('ParkOutlines');
					// this.debugVisualManager.clearDebugVisuals('DistrictBoundaries');

				} // fin if (this.cityManager)
			} else { // Debug désactivé
				console.log("  [World Debug] Clearing visuals...");
				this.debugVisualManager.clearDebugVisuals('DistrictGroundVisuals');
				this.debugVisualManager.clearDebugVisuals('PlotGroundVisuals');
				this.debugVisualManager.clearDebugVisuals('BuildingOutlines');
				this.debugVisualManager.clearDebugVisuals('PlotOutlines'); // Nettoyer au cas où
				this.clearDebugNavGrid();
				this.clearDebugAgentPaths();
			}
        } else {
             console.warn("World: Cannot manage debug visuals - DebugVisualManager or its parentGroup missing.");
        }

		this.debugAgentPathGroup.position.y = this.debugHeights.agentPath; // Positionner groupe chemins agents
    }

    // --- Les méthodes clearDebugPlotGrid, clearDebugAgentPaths, clearDebugNavGrid restent similaires ---
    // clearDebugPlotGrid n'est plus nécessaire car géré par DebugVisualManager
    clearDebugAgentPaths() {
        while(this.debugAgentPathGroup.children.length > 0){
            const obj = this.debugAgentPathGroup.children[0];
            this.debugAgentPathGroup.remove(obj);
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose(); // Les chemins agents ont des matériaux uniques
        }
         // console.log("Debug agent paths cleared.");
    }

    clearDebugNavGrid() {
		while(this.debugNavGridGroup.children.length > 0){
			const obj = this.debugNavGridGroup.children[0];
			this.debugNavGridGroup.remove(obj);
			if(obj.geometry) obj.geometry.dispose();
            // NavGrid utilise un matériau partagé (debugMaterialWalkable), NE PAS le disposer ici.
            // La géométrie est fusionnée, donc on la dispose.
		}
		// console.log("Debug nav grid cleared.");
   }

    // --- setAgentPathForAgent reste inchangée ---
    setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
		if (!agentLogic || !this.debugAgentPathGroup || !this.debugAgentPathGroup.visible) { return; }
		const agentId = agentLogic.id;
		const agentPathName = `AgentPath_${agentId}`;
		const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
		if (existingPath) {
			 this.debugAgentPathGroup.remove(existingPath);
			 if (existingPath.geometry) existingPath.geometry.dispose();
			 if (existingPath.material) existingPath.material.dispose();
		}
		if (pathPoints && pathPoints.length > 1) {
			 try {
				 const curve = new THREE.CatmullRomCurve3(pathPoints);
				 const tubeSegments = Math.min(64, pathPoints.length * 4);
				 const tubeRadius = 0.1;
				 const radialSegments = 4;
				 const closed = false;
				 const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, radialSegments, closed);
				 const tubeMaterial = new THREE.MeshBasicMaterial({ color: pathColor });
				 const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
				 tubeMesh.name = agentPathName;
                 const sidewalkHeight = this.cityManager?.config?.sidewalkHeight ?? 0.2;
				 tubeMesh.position.y = sidewalkHeight + 0.05;
                 tubeMesh.renderOrder = 1000; // Pour être sûr qu'il est visible
				 this.debugAgentPathGroup.add(tubeMesh);
			 } catch (error) {
				 console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
			 }
		}
   }


    // --- destroy() ---
    destroy() {
        console.log("Destroying World...");

        // 1. Destroy AgentManager
        this.agentManager?.destroy();
        this.agentManager = null;

        // 2. Clean up debug groups
        const cleanGroup = (group) => {
             // ... (code existant pour nettoyer les enfants, géométries, matériaux NON PARTAGES)
             // Attention à ne pas disposer les matériaux partagés (comme ceux de DebugVisualManager)
             if (!group) return;
             if (group.parent) group.parent.remove(group);
             while(group.children.length > 0){
                 const obj = group.children[0];
                 group.remove(obj);
                 if(obj.geometry) obj.geometry.dispose();
                 // Dispose material only if it's not likely shared (e.g., agent path materials)
                 if(obj.material && obj.name.startsWith('AgentPath_')) {
                      if (obj.material.dispose) obj.material.dispose();
                 } else if (obj.material && obj.name.startsWith('Debug_NavGrid_')) {
                     // Don't dispose shared NavGrid material
                 }
             }
        };
        cleanGroup(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup);
        // Le groupe de DebugVisualManager est géré par CityManager/World
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;

        // 3. Destroy CityManager (qui devrait appeler clearAllAndDisposeMaterials sur son DebugVisualManager)
        this.cityManager?.destroy(); // S'assurer que CityManager.destroy appelle debugVisualManager.clearAll...
        this.cityManager = null;
        this.debugVisualManager = null; // La référence locale est maintenant nulle

        // 4. Destroy Environment
        this.environment?.destroy();
        this.environment = null;

        console.log("World destroyed.");
    }

     // --- Reste de World.js (initializeWorld, createAgents, update) ---
     // ... (code existant)
    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            await this.cityManager.generateCity();
            console.log("World: Ville générée.");

            const maxAgents = this.cityManager.config.maxAgents ?? 300;
            this.agentManager = new AgentManager(
                this.scene,
                this.experience,
                this.cityManager.config,
                maxAgents
            );
            console.log("World: AgentManager instancié.");

            const navGraph = this.cityManager.getNavigationGraph();
            if (this.agentManager && navGraph) {
                this.agentManager.initializePathfindingWorker(navGraph);
                console.log("World: Initialisation du Pathfinding Worker demandée.");
            } else {
                 console.error("World: Echec initialisation Worker - AgentManager ou NavGraph manquant.");
            }

            this.createAgents(maxAgents);

            // Visualisation Debug initiale si activée au démarrage
            if (this.experience.isDebugMode) {
                this.setDebugMode(true); // Appeler la méthode pour créer tous les visuels
            }

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    createAgents(numberOfAgents) {
         if (!this.agentManager) {
             console.error("World: AgentManager non initialisé lors de createAgents.");
             return;
         }
         if (!this.cityManager?.buildingInstances || this.cityManager.buildingInstances.size === 0) {
             console.warn("World: Aucun bâtiment enregistré. Impossible de créer agents avec domicile/travail.");
             // return;
         }
        console.log(`World: Demande de création de ${numberOfAgents} agents...`);
        for (let i = 0; i < numberOfAgents; i++) {
             const agent = this.agentManager.createAgent();
             if (!agent) {
                 console.warn(`World: Echec création agent (max ${this.agentManager.maxAgents} atteint?).`);
                 break;
             }
        }
        console.log(`World: ${this.agentManager.agents.length} agents logiques créés (demandé: ${numberOfAgents}).`);
    }

    update() {
		const deltaTime = this.experience.time.delta;
		this.environment?.update(deltaTime);
		const currentHour = this.environment?.getCurrentHour() ?? 12;

		if (this.environment?.isInitialized && this.cityManager?.contentGenerator) {
			this.cityManager.contentGenerator.update(currentHour); // Délégué à PlotContentGenerator
		}
		if(this.cityManager) {
			this.cityManager.lampPostManager.updateLampPostLights(currentHour);
		}
		this.agentManager?.update(deltaTime);
	}

}