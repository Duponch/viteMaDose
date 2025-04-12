// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import Agent from '../World/Agent.js';
// FBXLoader et SkeletonUtils ont été retirés des imports

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
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

        // --- Suppression de la logique FBX ---
        // this.fbxLoader = new FBXLoader();
        // this.agentModelAsset = null;
        // this.agentModelPath = 'Public/Assets/Models/Cityzen/Man_Walking.fbx';
        // ------------------------------------

        this.initializeWorld(); // Appel initial
    }

    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // --- Suppression du chargement modèle Agent FBX ---
            // console.time("AgentModelLoading");
            // ... (code de chargement FBX supprimé) ...
            // console.timeEnd("AgentModelLoading");
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

            // Créer les agents (utiliseront maintenant leur propre géométrie simple)
            this.createAgents();

            // Lancer le pathfinding initial (qui a besoin des agents créés)
            this.cityManager.initiateAgentPathfinding();

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    createAgents() {
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

        const numAgents = 5; // Ou lire depuis config si besoin
        // const sidewalkHeight = this.cityManager.navigationGraph.sidewalkHeight; // Pas directement nécessaire ici

        // --- NOUVEAU: Lire l'échelle depuis la config ---
        // Fournir une valeur par défaut (ex: 1.0) si non définie dans la config
        const agentScale = this.cityManager.config.agentScale !== undefined ? this.cityManager.config.agentScale : 1.0;
        console.log(`World: Utilisation de l'échelle ${agentScale} pour les agents.`);
        // -----------------------------------------------

        for (let i = 0; i < numAgents; i++) {
            // Couleur aléatoire pour le corps
            const agentColor = new THREE.Color(Math.random(), Math.random(), Math.random());
            const hexColor = agentColor.getHex();

            // Créer l'agent en passant la scène, l'expérience, l'ID, la couleur ET l'échelle.
            const agent = new Agent(this.scene, this.experience, i, hexColor, agentScale); // <-- MODIFIÉ
            this.agents.push(agent);
        }
        // Message de log mis à jour
        console.log(`World: ${this.agents.length} agents (Rayman-style, scale=${agentScale}) créés.`);
    }

    setAgentPathForAgent(agent, pathPoints, pathColor) {
        // Recherche/suppression ancien chemin debug (inchangé)
        const agentPathName = `AgentPath_${agent.id}`;
        const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
        if (existingPath) {
             this.debugAgentPathGroup.remove(existingPath);
             if (existingPath.geometry) existingPath.geometry.dispose();
             if (existingPath.material) existingPath.material.dispose();
        }

        // Création visualisation tube chemin (inchangé)
        if (pathPoints && pathPoints.length > 1) {
             const curve = new THREE.CatmullRomCurve3(pathPoints);
             const tubeGeometry = new THREE.TubeGeometry(curve, 64, 1, 8, false); // Rayon plus fin
             const tubeMaterial = new THREE.MeshBasicMaterial({ color: pathColor });
             const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
             tubeMesh.name = agentPathName;
             tubeMesh.position.y = this.cityManager.navigationGraph.sidewalkHeight + 0.02; // Légèrement au-dessus trottoir
             this.debugAgentPathGroup.add(tubeMesh);
        }

        // Donner le chemin à l'agent.
        // La méthode agent.setPath s'occupe maintenant de positionner le this.model (le groupe Rayman)
        if (agent && agent.model) { // On vérifie toujours que l'agent et son modèle (groupe) existent
            if (pathPoints && pathPoints.length > 0) {
                // Appeler setPath de l'agent, qui gère la position initiale
                agent.setPath(pathPoints);
            } else {
                 // Si pas de chemin, on arrête l'agent
                 agent.setPath(null);
            }
        } else {
            console.warn(`World: Tentative de définir un chemin mais l'agent ${agent?.id} ou son modèle n'existe pas.`);
        }
    }

    update() {
        const deltaTime = this.experience.time.delta;
        // const normalizedHealth = 0.8; // Exemple, si utilisé par l'environnement
        this.cityManager?.update();
        // Mettre à jour l'environnement (gère cycle jour/nuit, etc.)
        this.environment?.update(deltaTime); // Ne passe plus normalizedHealth ici
        // Mettre à jour chaque agent (qui mettra à jour sa position et son animation procédurale)
        this.agents.forEach(agent => agent.update(deltaTime));
    }

    destroy() {
        console.log("Destruction du World...");

        // --- Suppression du Nettoyage spécifique au modèle agent FBX chargé ---
        // if (this.agentModelAsset) { ... }
        // -------------------------------------------------

        const cleanGroup = (group) => { // Fonction utilitaire inchangée
            if (!group) return;
            while (group.children.length > 0) { /* ... */ }
        };
        cleanGroup(this.debugNavGridGroup); if (this.debugNavGridGroup) this.scene.remove(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup); if (this.debugAgentPathGroup) this.scene.remove(this.debugAgentPathGroup);
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;

        this.cityManager?.destroy();
        this.environment?.destroy();

        // Important : Détruire les agents *avant* de nullifier les références (inchangé)
        this.agents.forEach(agent => agent.destroy());
        this.agents = [];

        console.log("World détruit.");
    }
}