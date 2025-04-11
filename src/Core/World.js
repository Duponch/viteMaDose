import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import Agent from '../World/Agent.js';

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agents = []; // Passage de l'agent unique à un tableau d'agents

        // --- Groupes pour les visualisations de débogage ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);
        // -------------------------------------------------------

        this.initializeWorld();
    }

    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // generateCity crée le navigationGraph dans cityManager
            await this.cityManager.generateCity();
            console.log("World: Ville générée (incluant nav graph).");

            // Créer la visualisation de la grille APRES sa construction
            if (this.cityManager.navigationGraph) {
                 console.log("World: Génération de la visualisation de la grille de navigation...");
                 this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
            } else {
                 console.warn("World: navigationGraph non trouvé dans cityManager après generateCity.");
            }

            // Créer les agents après la génération de la ville et du graphe
            this.createAgents();

            // Lancer le pathfinding initial (qui a besoin des agents)
            this.cityManager.initiateAgentPathfinding();

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    // --- Création d'un tableau de 10 agents, chacun avec une couleur aléatoire
    createAgents() {
        // Si des agents existaient déjà, les supprimer
        if (this.agents && this.agents.length > 0) {
            this.agents.forEach(agent => agent.destroy());
            this.agents = [];
        }
        const numAgents = 10;
        for (let i = 0; i < numAgents; i++) {
            const startPos = new THREE.Vector3(0, 1, 0); // Position temporaire
            // Générer une couleur aléatoire pour cet agent
            const agentColor = new THREE.Color(Math.random(), Math.random(), Math.random());
            const hexColor = agentColor.getHex();
            const size = 5; // Taille de l'agent (modifiable)
            const agent = new Agent(this.scene, startPos, hexColor, size);
            agent.id = i; // Affecter un identifiant unique
            this.agents.push(agent);
        }
        console.log(`World: ${this.agents.length} agents créés.`);
    }

    // --- Définition du chemin pour un agent donné et visualisation avec sa couleur propre ---
    setAgentPathForAgent(agent, pathPoints, pathColor) {
        // Rechercher et supprimer l'ancien chemin visualisé de cet agent, s'il existe
        const agentPathName = `AgentPath_${agent.id}`;
        const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
        if (existingPath) {
            this.debugAgentPathGroup.remove(existingPath);
            if (existingPath.geometry) existingPath.geometry.dispose();
            if (existingPath.material) existingPath.material.dispose();
        }
        if (pathPoints && pathPoints.length > 1) {
            // Créer une courbe passant par les points du chemin
            const curve = new THREE.CatmullRomCurve3(pathPoints);
            const tubularSegments = 64;
            const radius = 1; // Épaisseur du tube
            const radialSegments = 8;
            const closed = false;
            const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
            // Utiliser le paramètre color pour le matériau
            const tubeMaterial = new THREE.MeshBasicMaterial({ color: pathColor });
            const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
            tubeMesh.name = agentPathName;
            tubeMesh.position.y = 0.02; // Légèrement au-dessus de la grille debug
            this.debugAgentPathGroup.add(tubeMesh);
            console.log(`World: Chemin de l'agent ${agent.id} visualisé.`);
        }
        // Donner le chemin à l'agent et positionner le cube sur le premier point
        if (agent && agent.mesh) {
            if (pathPoints && pathPoints.length > 0) {
                agent.mesh.position.copy(pathPoints[0]);
                agent.mesh.position.y = pathPoints[0].y + ((agent.mesh.geometry.parameters.height) || 1.0);
            }
            agent.setPath(pathPoints);
        } else {
            console.warn(`World: Tentative de définir un chemin mais l'agent ${agent.id} n'existe pas.`);
        }
    }

    // --- Mise à jour du monde : on met à jour chacun des agents ---
    update() {
        const deltaTime = this.experience.time.delta;
        const normalizedHealth = 0.8;
        this.cityManager?.update();
        this.environment?.update(deltaTime, normalizedHealth);
        this.agents.forEach(agent => agent.update(deltaTime));
    }

    destroy() {
        console.log("Destruction du World...");
        const cleanGroup = (group) => { /* ... (code de nettoyage du groupe) ... */ };
        cleanGroup(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup);
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;
        this.cityManager?.destroy();
        this.environment?.destroy();
        this.agents.forEach(agent => agent.destroy());
        this.agents = [];
        console.log("World détruit.");
    }
}
