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
        this.agentManager = null;

        // --- Debug Groups ---
        // Groupes existants
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);

        // NOUVEAUX groupes pour les calques
        this.debugPlotGroundGroup = new THREE.Group();
        this.debugPlotGroundGroup.name = "DebugPlotGround";
        this.scene.add(this.debugPlotGroundGroup);

        this.debugDistrictGroundGroup = new THREE.Group();
        this.debugDistrictGroundGroup.name = "DebugDistrictGround";
        this.scene.add(this.debugDistrictGroundGroup);

        this.debugBuildingOutlineGroup = new THREE.Group();
        this.debugBuildingOutlineGroup.name = "DebugBuildingOutline";
        this.scene.add(this.debugBuildingOutlineGroup);
        // --- FIN NOUVEAU ---

        // Manager central (peut être moins utilisé maintenant)
        this.debugVisualManager = this.cityManager.debugVisualManager;
        if (!this.debugVisualManager) {
            console.warn("World: DebugVisualManager non trouvé dans CityManager.");
            // Alternative: créer un ici si nécessaire pour les matériaux partagés, etc.
            // this.debugVisualManager = new DebugVisualManager(...);
        }

        // Hauteurs (utilisées pour positionner les groupes)
        this.debugHeights = {
            districtGround: 0.005,
            plotGround: 0.015,
            buildingOutline: 0.05, // Y offset pour la *base* des outlines
            navGrid: 0.06,
            agentPath: 0.07
        };

        // Render Orders (peuvent être définis ici ou dans DVM)
        this.debugRenderOrders = {
            districtGround: 0,
            plotGround: 1,
            buildingOutline: 2,
            navGrid: 3,
            agentPath: 4
        };

        // Initial visibility for all debug groups
        this.setAllDebugGroupsVisibility(false);

        this.initializeWorld();
    }

    /**
     * Définit la visibilité de tous les groupes de debug.
     * @param {boolean} visible
     */
    setAllDebugGroupsVisibility(visible) {
        this.debugNavGridGroup.visible = visible;
        this.debugAgentPathGroup.visible = visible;
        this.debugPlotGroundGroup.visible = visible;
        this.debugDistrictGroundGroup.visible = visible;
        this.debugBuildingOutlineGroup.visible = visible;
    }

	/**
     * Vide tous les enfants d'un groupe donné et dispose leurs géométries/matériaux si nécessaire.
     * @param {THREE.Group} group
     * @param {boolean} disposeSharedGeom - Si true, dispose même les géométries partagées (DANGEREUX).
     */
    clearGroupChildren(group, disposeSharedGeom = false) {
        if (!group) return;
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            if (child.geometry) {
                 // Ne dispose pas les géométries partagées sauf si explicitement demandé
                 const isSharedGround = child.geometry === this.debugVisualManager?.sharedGroundBoxGeometry;
                 const isSharedBuilding = child.geometry === this.debugVisualManager?.sharedBuildingBoxGeometry;
                 if (disposeSharedGeom || (!isSharedGround && !isSharedBuilding)) {
                    child.geometry.dispose();
                 }
            }
            // Les matériaux sont partagés via DebugVisualManager et ne doivent pas être disposés ici.
            // Sauf cas spécifiques comme les chemins d'agents.
            if (child.material && child.name?.startsWith('AgentPath_')) {
                 if (Array.isArray(child.material)) {
                      child.material.forEach(m => m.dispose());
                 } else {
                      child.material.dispose?.();
                 }
            }
        }
    }

    /**
     * Active ou désactive le mode debug global. Crée ou nettoie les visuels.
     * Applique la visibilité des calques individuels si le mode est activé.
     * @param {boolean} enabled - True pour activer, false pour désactiver.
     */
    setDebugMode(enabled) {
        if (enabled) {
            console.log("  [World Debug] Enabling Debug Mode - Creating visuals...");

            // S'assurer que DVM existe
            if (!this.debugVisualManager) {
                console.error("World: DebugVisualManager is missing, cannot create debug visuals.");
                return;
            }

            // Vider les groupes existants avant de recréer
            this.clearGroupChildren(this.debugPlotGroundGroup);
            this.clearGroupChildren(this.debugDistrictGroundGroup);
            this.clearGroupChildren(this.debugBuildingOutlineGroup);
            this.clearGroupChildren(this.debugNavGridGroup);
            this.clearGroupChildren(this.debugAgentPathGroup);

            // --- Création et Ajout aux Groupes ---
            if (this.cityManager) {
                const plots = this.cityManager.getPlots();
                const districts = this.cityManager.getDistricts();
                const buildingInstances = this.cityManager.getBuildingInstances();

                // 1. Sols Districts
                const districtMeshes = this.debugVisualManager.createDistrictGroundVisuals(districts, 0); // Y pos est géré par le groupe
                districtMeshes.forEach(mesh => this.debugDistrictGroundGroup.add(mesh));
                this.debugDistrictGroundGroup.position.y = this.debugHeights.districtGround;
                this.debugDistrictGroundGroup.renderOrder = this.debugRenderOrders.districtGround;

                // 2. Sols Parcelles
                const plotMeshes = this.debugVisualManager.createPlotGroundVisuals(plots, 0);
                plotMeshes.forEach(mesh => this.debugPlotGroundGroup.add(mesh));
                this.debugPlotGroundGroup.position.y = this.debugHeights.plotGround;
                this.debugPlotGroundGroup.renderOrder = this.debugRenderOrders.plotGround;

                // 3. Outlines Bâtiments
                const outlineMeshes = this.debugVisualManager.createBuildingOutlines(buildingInstances, this.cityManager.config, 0);
                outlineMeshes.forEach(mesh => this.debugBuildingOutlineGroup.add(mesh));
                this.debugBuildingOutlineGroup.position.y = this.debugHeights.buildingOutline; // Offset Y global
                this.debugBuildingOutlineGroup.renderOrder = this.debugRenderOrders.buildingOutline;

                // 4. NavGrid (méthode existante, ajoute directement au groupe)
                if (this.cityManager.navigationGraph) {
                    this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
                }
                this.debugNavGridGroup.position.y = this.debugHeights.navGrid;
                this.debugNavGridGroup.renderOrder = this.debugRenderOrders.navGrid;

                // 5. Chemins Agents (restent gérés dynamiquement par setAgentPathForAgent)
                this.debugAgentPathGroup.position.y = this.debugHeights.agentPath;
                this.debugAgentPathGroup.renderOrder = this.debugRenderOrders.agentPath;

            } // fin if (this.cityManager)

            // --- Appliquer la Visibilité Initiale des Calques ---
            console.log("  [World Debug] Applying layer visibility state...");
            this.setLayerVisibility('districtGround', this.experience.debugLayerVisibility.districtGround);
            this.setLayerVisibility('plotGround', this.experience.debugLayerVisibility.plotGround);
            this.setLayerVisibility('buildingOutline', this.experience.debugLayerVisibility.buildingOutline);
            this.setLayerVisibility('navGrid', this.experience.debugLayerVisibility.navGrid);
            this.setLayerVisibility('agentPath', this.experience.debugLayerVisibility.agentPath);

        } else {
            console.log("  [World Debug] Disabling Debug Mode - Clearing visuals...");
            // Nettoyer les visuels créés par DebugVisualManager (sauf matériaux)
            this.debugVisualManager?.clearDebugVisuals('PlotGroundVisuals');
            this.debugVisualManager?.clearDebugVisuals('DistrictGroundVisuals');
            this.debugVisualManager?.clearDebugVisuals('BuildingOutlines');
            // ... autres types gérés par DVM si nécessaire ...

            // Vider tous les groupes de debug
            this.clearGroupChildren(this.debugPlotGroundGroup);
            this.clearGroupChildren(this.debugDistrictGroundGroup);
            this.clearGroupChildren(this.debugBuildingOutlineGroup);
            this.clearGroupChildren(this.debugNavGridGroup);
            this.clearGroupChildren(this.debugAgentPathGroup);

            // Cacher tous les groupes
            this.setAllDebugGroupsVisibility(false);
        }
    }

	/**
     * Définit la visibilité d'un calque de debug spécifique.
     * @param {string} layerName - Nom du calque ('districtGround', 'plotGround', 'buildingOutline', 'navGrid', 'agentPath').
     * @param {boolean} isVisible - True pour afficher, false pour masquer.
     */
    setLayerVisibility(layerName, isVisible) {
        let targetGroup = null;
        switch (layerName) {
            case 'districtGround':  targetGroup = this.debugDistrictGroundGroup; break;
            case 'plotGround':      targetGroup = this.debugPlotGroundGroup; break;
            case 'buildingOutline': targetGroup = this.debugBuildingOutlineGroup; break;
            case 'navGrid':         targetGroup = this.debugNavGridGroup; break;
            case 'agentPath':       targetGroup = this.debugAgentPathGroup; break;
            default:
                console.warn(`World.setLayerVisibility: Unknown layer name '${layerName}'`);
                return;
        }
        if (targetGroup) {
            targetGroup.visible = isVisible;
            // console.log(`  [World Debug] Layer '${layerName}' visibility set to ${isVisible}`);
        }
    }

    clearDebugAgentPaths() {
		this.clearGroupChildren(this.debugAgentPathGroup); // Utiliser la nouvelle méthode
	}

    clearDebugNavGrid() {
		this.clearGroupChildren(this.debugNavGridGroup); // Utiliser la nouvelle méthode
  	}

	  setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
		// S'assurer que le groupe est visible pour que le chemin le soit
		if (!agentLogic || !this.debugAgentPathGroup || !this.debugAgentPathGroup.visible) {
			// Optionnel: supprimer l'ancien chemin même si le groupe est caché
			const agentId = agentLogic.id;
			const agentPathName = `AgentPath_${agentId}`;
			const existingPath = this.debugAgentPathGroup?.getObjectByName(agentPathName); // Safe access
			if (existingPath) {
				this.debugAgentPathGroup.remove(existingPath);
				if (existingPath.geometry) existingPath.geometry.dispose();
				if (existingPath.material) existingPath.material.dispose();
			}
			return;
		}
		// Le reste de la logique pour créer/mettre à jour le tube reste identique...
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
				 // La position Y est maintenant gérée par le groupe parent this.debugAgentPathGroup
				 // tubeMesh.position.y = sidewalkHeight + 0.05; <-- RETIRÉ
				 tubeMesh.renderOrder = 1000; // Garder pour être sûr qu'il est visible
				 this.debugAgentPathGroup.add(tubeMesh);
			 } catch (error) {
				 console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
			 }
		}
   }

   destroy() {
		console.log("Destroying World...");
		this.agentManager?.destroy();
		this.agentManager = null;

		// Nettoyer tous les groupes de debug
		this.clearGroupChildren(this.debugNavGridGroup, true); this.scene.remove(this.debugNavGridGroup); this.debugNavGridGroup = null;
		this.clearGroupChildren(this.debugAgentPathGroup, true); this.scene.remove(this.debugAgentPathGroup); this.debugAgentPathGroup = null;
		this.clearGroupChildren(this.debugPlotGroundGroup, true); this.scene.remove(this.debugPlotGroundGroup); this.debugPlotGroundGroup = null;
		this.clearGroupChildren(this.debugDistrictGroundGroup, true); this.scene.remove(this.debugDistrictGroundGroup); this.debugDistrictGroundGroup = null;
		this.clearGroupChildren(this.debugBuildingOutlineGroup, true); this.scene.remove(this.debugBuildingOutlineGroup); this.debugBuildingOutlineGroup = null;

		// Le groupe parent de DVM est retiré dans CityManager.destroy
		this.cityManager?.destroy();
		this.cityManager = null;
		this.debugVisualManager = null;

		this.environment?.destroy();
		this.environment = null;

		console.log("World destroyed.");
	}

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

			// Si le mode debug est actif AU DEMARRAGE, générer les visuels
			if (this.experience.isDebugMode) {
				this.setDebugMode(true);
			} else {
				this.setAllDebugGroupsVisibility(false); // Assurer qu'ils sont cachés
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
			this.cityManager.contentGenerator.update(currentHour);
		}
		if(this.cityManager) {
			this.cityManager.lampPostManager.updateLampPostLights(currentHour);
		}
		this.agentManager?.update(deltaTime);
	}
}