/*
 * Fichier: src/Core/World.js
 * Modifications:
 * - Ajout appel `this.agentManager.initializePathfindingWorker(this.navigationGraph)`
 * après la création du NavigationGraph.
 */
// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import AgentManager from '../World/AgentManager.js';
import NavigationGraph from '../World/NavigationGraph.js'; // Assurez-vous d'importer NavigationGraph si ce n'est pas déjà fait

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Managers ---
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agentManager = null; // Will be initialized in initializeWorld

        // --- Debug Groups ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        // NEW: Group for visualizing the house placement grid
        this.debugPlotGridGroup = new THREE.Group();
        this.debugPlotGridGroup.name = "DebugPlotGrid";
        this.scene.add(this.debugPlotGridGroup);
        // END NEW

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);

        // Initial visibility
        this.debugNavGridGroup.visible = false;
        this.debugPlotGridGroup.visible = false; // NEW: Hide by default
        this.debugAgentPathGroup.visible = false;

        // Start asynchronous initialization
        this.initializeWorld();
    }

    setDebugMode(enabled) {
        this.debugAgentPathGroup.visible = enabled;
        this.debugNavGridGroup.visible = enabled;
        this.debugPlotGridGroup.visible = enabled; // NEW: Control visibility of the plot grid group

        // Recreate NAV grid visualization if it doesn't exist and debug is enabled
        if (enabled && this.cityManager?.navigationGraph && this.debugNavGridGroup.children.length === 0) {
             console.log("World: Debug enabled - Generating NavGrid visualization...");
             // this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup); // Optional to recreate
        } else if (!enabled) {
            // Clear ALL groups when disabling
             this.clearDebugAgentPaths();
             this.clearDebugNavGrid();
             this.clearDebugPlotGrid(); // NEW: Clear the plot grid group
        }
        console.log(`World Debug Mode: ${enabled ? 'Enabled' : 'Disabled'} (PlotGrid visible: ${enabled})`);
    }

	clearDebugPlotGrid() {
        while(this.debugPlotGridGroup.children.length > 0){
            const obj = this.debugPlotGridGroup.children[0];
            this.debugPlotGridGroup.remove(obj);
            if(obj.geometry) obj.geometry.dispose();
            // The material is shared (debugPlotGridMaterial), DO NOT dispose it here,
            // do it in CityManager.destroy
            // if(obj.material && obj.material.dispose) obj.material.dispose();
        }
        // console.log("Debug plot grid cleared.");
    }

    clearDebugAgentPaths() {
        while(this.debugAgentPathGroup.children.length > 0){
            const obj = this.debugAgentPathGroup.children[0];
            this.debugAgentPathGroup.remove(obj);
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
        }
         // console.log("Debug agent paths cleared.");
    }

    clearDebugNavGrid() {
		while(this.debugNavGridGroup.children.length > 0){
			const obj = this.debugNavGridGroup.children[0];
			this.debugNavGridGroup.remove(obj);
			if(obj.geometry) obj.geometry.dispose();
			if(obj.material) { // Handle multiple or single materials
				if (Array.isArray(obj.material)) { obj.material.forEach(m => m.dispose()); }
				else if (obj.material.dispose) { obj.material.dispose(); }
			}
		}
		// console.log("Debug nav grid cleared.");
   }

    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // 1. Init Environnement
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // 2. Générer Ville (plots, routes, etc. DANS CityManager)
            await this.cityManager.generateCity(); // CityManager crée maintenant son propre NavGraph
            console.log("World: Ville générée.");

            // === Initialisation AgentManager APRÈS génération ville ===
            const maxAgents = this.cityManager.config.maxAgents ?? 300;
            this.agentManager = new AgentManager(
                this.scene,
                this.experience,
                this.cityManager.config,
                maxAgents
            );
            console.log("World: AgentManager instancié.");

            // === NOUVEAU : Initialiser le Worker APRÈS que NavGraph existe ===
            const navGraph = this.cityManager.getNavigationGraph();
            if (this.agentManager && navGraph) {
                this.agentManager.initializePathfindingWorker(navGraph); // Passe le NavGraph pour extraire les données
                console.log("World: Initialisation du Pathfinding Worker demandée.");
            } else {
                 console.error("World: Echec initialisation Worker - AgentManager ou NavGraph manquant après génération ville.");
            }
            // =============================================================

            // 4. Créer Agents logiques (inchangé)
            this.createAgents(maxAgents);

            // 5. Visualisation Debug NavGrid (Condition inchangée, mais se base sur le NavGraph de CityManager)
            if (navGraph && this.debugNavGridGroup.visible) {
                console.log("World: Génération visualisation NavGrid (depuis CityManager)...");
                navGraph.createDebugVisualization(this.debugNavGridGroup);
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
         // Vérification inchangée
         if (!this.cityManager?.buildingInstances || this.cityManager.buildingInstances.size === 0) {
             console.warn("World: Aucun bâtiment enregistré par CityManager. Impossible de créer des agents avec domicile/travail initial.");
             // On pourrait quand même créer des agents en mode IDLE si nécessaire
             // return;
         }

        console.log(`World: Demande de création de ${numberOfAgents} agents...`);
        let createdCount = 0;
        for (let i = 0; i < numberOfAgents; i++) {
             const agent = this.agentManager.createAgent();
             if (agent) {
                 createdCount++;
             } else {
                 console.warn(`World: Echec création agent (max ${this.agentManager.maxAgents} atteint?).`);
                 break;
             }
        }
        console.log(`World: ${this.agentManager.agents.length} agents logiques créés (demandé: ${numberOfAgents}).`);
    }

    // --- Méthode setAgentPathForAgent (Utilisée par AgentManager lors du retour du worker) ---
    /**
     * Affiche le chemin d'un agent pour le débogage SI le mode debug est actif.
     * @param {Agent} agentLogic - L'instance de l'agent logique.
     * @param {THREE.Vector3[] | null} pathPoints - Les points du chemin (monde) ou null.
     * @param {number|THREE.Color} pathColor - La couleur du chemin.
     */
    setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
		// Vérifier si le mode debug est actif via la visibilité du groupe
		if (!agentLogic || !this.debugAgentPathGroup || !this.debugAgentPathGroup.visible) {
			return;
		}

		const agentId = agentLogic.id;
		const agentPathName = `AgentPath_${agentId}`;

		// Recherche/suppression ancien chemin debug (inchangé)
		const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
		if (existingPath) {
			 this.debugAgentPathGroup.remove(existingPath);
			 if (existingPath.geometry) existingPath.geometry.dispose();
			 if (existingPath.material) existingPath.material.dispose();
		}

		// Création visualisation tube chemin debug (inchangé)
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
                 // Position Y ajustée (peut être retiré si les points sont déjà à la bonne hauteur)
				 const sidewalkHeight = this.cityManager?.config?.sidewalkHeight ?? 0.2;
				 tubeMesh.position.y = sidewalkHeight + 0.05; // Ajuster si gridToWorld donne déjà la bonne hauteur
				 this.debugAgentPathGroup.add(tubeMesh);
			 } catch (error) {
				 console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
			 }
		}
   }

   update() {
		const deltaTime = this.experience.time.delta;

		// Mettre à jour l'environnement (pour obtenir l'heure)
		this.environment?.update(deltaTime);

		const currentHour = this.environment?.getCurrentHour() ?? 12; // Heure par défaut si env non prêt

		// --- NOUVEAU: Mettre à jour le PlotContentGenerator (via CityManager) ---
		if (this.environment?.isInitialized && this.cityManager?.contentGenerator) {
			// L'update des fenêtres se fait DANS PlotContentGenerator maintenant
			this.cityManager.contentGenerator.update(currentHour);
		}
		// --- NOUVEAU: Mettre à jour les lumières des lampadaires (via CityManager) ---
		if(this.cityManager) {
			this.cityManager.lampPostManager.updateLampPostLights(currentHour);
		}
		// --------------------------------------------------------------------

		// Mettre à jour les agents
		this.agentManager?.update(deltaTime);
	}

    destroy() {
        console.log("Destroying World...");

        // 1. Destroy AgentManager (which terminates its worker)
        this.agentManager?.destroy();
        this.agentManager = null;

        // 2. Clean up debug groups
        const cleanGroup = (group) => {
             if (!group) return;
             if (group.parent) group.parent.remove(group);
             while(group.children.length > 0){
                 const obj = group.children[0];
                 group.remove(obj);
                 if(obj.geometry) obj.geometry.dispose();
                 // Clean material(s) ONLY if they are not shared globally
                 // For debug groups, assume materials are specific or okay to dispose here
                 if(obj.material) {
                     if(Array.isArray(obj.material)) { obj.material.forEach(m => m.dispose()); }
                     else if (obj.material.dispose) { obj.material.dispose(); }
                 }
             }
        };
        cleanGroup(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup);
        cleanGroup(this.debugPlotGridGroup); // NEW: Clean the plot grid group
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;
        this.debugPlotGridGroup = null; // NEW

        // 3. Destroy CityManager (which cleans its own elements, NavGraph included)
        this.cityManager?.destroy();
        this.cityManager = null;

        // 4. Destroy Environment
        this.environment?.destroy();
        this.environment = null;

        console.log("World destroyed.");
    }
}