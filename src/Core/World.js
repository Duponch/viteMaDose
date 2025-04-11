// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import Agent from '../World/Agent.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'; // <-- Ajouter FBXLoader
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'; // <-- Ajouter SkeletonUtils

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        // REMOVED: this.resources n'est pas utilisé directement ici pour le modèle agent
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agents = [];

        // --- Groupes pour les visualisations de débogage ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);

        // --- NOUVEAU: Pour le modèle agent ---
        this.fbxLoader = new FBXLoader();
        this.agentModelAsset = null; // Stockera le modèle chargé
        this.agentModelPath = 'Public/Assets/Models/Cityzen/Man_Walking.fbx'; // Chemin vers votre modèle
        // ------------------------------------

        this.initializeWorld(); // Appel initial
    }

    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // --- NOUVEAU: Chargement du modèle Agent ---
            console.time("AgentModelLoading");
            try {
                this.agentModelAsset = await this.fbxLoader.loadAsync(this.agentModelPath);
                // Parcourir pour activer les ombres sur le modèle chargé (si nécessaire)
                this.agentModelAsset.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        // child.receiveShadow = true; // Optionnel
                    }
                });
                console.log(`World: Modèle agent '${this.agentModelPath}' chargé.`);
                // Log des animations disponibles
                 if (this.agentModelAsset.animations && this.agentModelAsset.animations.length > 0) {
                    console.log(` -> Animations trouvées: ${this.agentModelAsset.animations.map(a => a.name || '[sans nom]').join(', ')}`);
                 } else {
                    console.warn(" -> Aucune animation trouvée dans le modèle agent.");
                 }
            } catch (loadError) {
                console.error(`World: Erreur critique chargement modèle agent '${this.agentModelPath}':`, loadError);
                throw loadError; // Stoppe l'initialisation si le modèle agent ne charge pas
            }
            console.timeEnd("AgentModelLoading");
            // -----------------------------------------

            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            await this.cityManager.generateCity();
            console.log("World: Ville générée (incluant nav graph).");

            if (this.cityManager.navigationGraph) {
                console.log("World: Génération de la visualisation de la grille de navigation...");
                this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
            } else {
                console.warn("World: navigationGraph non trouvé dans cityManager après generateCity.");
            }

            // Créer les agents (utilisera le modèle chargé et cloné)
            this.createAgents();

            // Lancer le pathfinding initial (qui a besoin des agents créés avec le modèle)
            this.cityManager.initiateAgentPathfinding();

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
            // Gérer l'erreur (ex: afficher un message à l'utilisateur)
        }
    }

    createAgents() {
		// Vérifier si le modèle est chargé (inchangé)
		if (!this.agentModelAsset) {
			console.error("World: Tentative de créer des agents mais le modèle FBX n'est pas chargé.");
			return;
		}
		 // Vérifier si navGraph est prêt (inchangé)
		 if (!this.cityManager?.navigationGraph) {
			 console.error("World: Tentative de créer des agents mais le NavigationGraph n'est pas prêt.");
			 return;
		}

		// Si des agents existaient déjà, les supprimer (inchangé)
		if (this.agents && this.agents.length > 0) {
			this.agents.forEach(agent => agent.destroy());
			this.agents = [];
		}

		const numAgents = 50;
		const sidewalkHeight = this.cityManager.navigationGraph.sidewalkHeight;

		// --- NOUVEAU : Définir le facteur d'échelle ici ---
		const desiredScale = 0.004; // <-- AJUSTEZ CETTE VALEUR ! Essayez 0.1, 0.05, 0.02 etc.
		// ----------------------------------------------------

		for (let i = 0; i < numAgents; i++) {
			const startPos = new THREE.Vector3(0, sidewalkHeight, 0);
			const agentColor = new THREE.Color(Math.random(), Math.random(), Math.random());
			const hexColor = agentColor.getHex();

			// Cloner le modèle chargé (inchangé)
			const modelClone = SkeletonUtils.clone(this.agentModelAsset);

			// --- NOUVEAU : Appliquer l'échelle au clone ---
			modelClone.scale.set(desiredScale, desiredScale, desiredScale);
			// ----------------------------------------------

			// Positionner le clone (inchangé)
			modelClone.position.copy(startPos);

			// Créer l'agent avec le modèle cloné ET mis à l'échelle (inchangé)
			const agent = new Agent(this.scene, modelClone, hexColor);
			agent.id = i;
			this.agents.push(agent);
		}
		console.log(`World: ${this.agents.length} agents créés (utilisant le modèle FBX cloné et mis à l'échelle ${desiredScale}x).`);
	}

    setAgentPathForAgent(agent, pathPoints, pathColor) {
        // Recherche/suppression ancien chemin debug (inchangé)
        const agentPathName = `AgentPath_${agent.id}`;
        const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
        if (existingPath) { /* ... suppression ... */
            this.debugAgentPathGroup.remove(existingPath);
            if (existingPath.geometry) existingPath.geometry.dispose();
            if (existingPath.material) existingPath.material.dispose();
        }

        // Création visualisation tube chemin (inchangé)
        if (pathPoints && pathPoints.length > 1) { /* ... création tube ... */
             const curve = new THREE.CatmullRomCurve3(pathPoints);
             const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.1, 8, false); // Rayon plus fin
             const tubeMaterial = new THREE.MeshBasicMaterial({ color: pathColor });
             const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
             tubeMesh.name = agentPathName;
             tubeMesh.position.y = this.cityManager.navigationGraph.sidewalkHeight + 0.02; // Légèrement au-dessus trottoir
             this.debugAgentPathGroup.add(tubeMesh);
             // console.log(`World: Chemin de l'agent ${agent.id} visualisé.`);
        }

        // Donner le chemin à l'agent et positionner le MODÈLE sur le premier point
        // Remplacer agent.mesh par agent.model
        if (agent && agent.model) { // Vérifier l'existence de agent.model
            if (pathPoints && pathPoints.length > 0) {
                // Positionner le modèle au début du chemin
                // La hauteur Y est déjà correcte car pathPoints vient du NavigationGraph
                agent.model.position.copy(pathPoints[0]);
                // agent.model.position.y = pathPoints[0].y; // Normalement déjà correct

                // Appeler setPath de l'agent
                agent.setPath(pathPoints);
            } else {
                 // Si pas de chemin, on pourrait arrêter l'agent (fait dans setPath(null))
                 agent.setPath(null);
            }
        } else {
            console.warn(`World: Tentative de définir un chemin mais l'agent ${agent?.id} ou son modèle n'existe pas.`);
        }
    }

    update() {
        const deltaTime = this.experience.time.delta;
        const normalizedHealth = 0.8; // Exemple, si utilisé par l'environnement
        this.cityManager?.update();
        this.environment?.update(deltaTime, normalizedHealth);
        // Mettre à jour chaque agent (qui mettra à jour son animation mixer)
        this.agents.forEach(agent => agent.update(deltaTime));
    }

    destroy() {
        console.log("Destruction du World...");

        // --- Nettoyage spécifique au modèle agent chargé ---
        if (this.agentModelAsset) {
            console.log(" -> Nettoyage du modèle agent original chargé...");
            // Si le modèle contient des textures, matériaux, géométries uniques,
            // il faut les disposer ici. S'ils sont partagés, attention.
            // Une approche simple est de parcourir et disposer.
            this.agentModelAsset.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    // Attention aux matériaux, ne pas disposer s'ils sont partagés ailleurs
                    // S'ils sont uniques au modèle, les disposer.
                     if (Array.isArray(child.material)) {
                         child.material.forEach(material => material?.dispose());
                     } else {
                         child.material?.dispose();
                     }
                }
            });
            this.agentModelAsset = null;
            console.log(" -> Modèle agent original nettoyé.");
        }
        // -------------------------------------------------

        const cleanGroup = (group) => {
            if (!group) return;
            while (group.children.length > 0) {
                const child = group.children[0];
                group.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        };
        cleanGroup(this.debugNavGridGroup); this.scene.remove(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup); this.scene.remove(this.debugAgentPathGroup);
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;

        this.cityManager?.destroy();
        this.environment?.destroy();

        // Important : Détruire les agents *avant* de nullifier les références
        this.agents.forEach(agent => agent.destroy());
        this.agents = [];

        console.log("World détruit.");
    }
}