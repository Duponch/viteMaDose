// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
// import Agent from '../World/Agent.js'; // Agent logique est utilisé par AgentManager
import AgentManager from '../World/AgentManager.js'; // <-- IMPORTER AgentManager

// FBXLoader et SkeletonUtils ne sont plus nécessaires

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);

        // --- NOUVEAU: AgentManager gère les agents ---
        this.agentManager = null; // Sera initialisé dans initializeWorld
        this.agents = null; // La référence directe aux agents logiques est maintenant dans agentManager
        // --------------------------------------------

        // --- Groupes pour les visualisations de débogage ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);

        this.initializeWorld(); // Appel initial
    }

    async initializeWorld() {
        console.log("World: Initialisation asynchrone (avec AgentManager)...");
        try {
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            await this.cityManager.generateCity();
            console.log("World: Ville générée (incluant nav graph).");

            if (this.cityManager.navigationGraph) {
                console.log("World: Génération de la visualisation de la grille de navigation...");
                //this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
            } else {
                console.warn("World: navigationGraph non trouvé dans cityManager après generateCity.");
            }

            // --- NOUVEAU: Initialiser AgentManager ---
            const maxAgents = 500; // Définir le nombre maximum
            this.agentManager = new AgentManager(
                this.scene,
                this.experience,
                this.cityManager.config, // Passer la config (contient agentScale etc.)
                maxAgents
            );
            console.log("World: AgentManager initialisé.");
            // -----------------------------------------

            // Créer les agents logiques via AgentManager
            this.createAgents(maxAgents); // Passer le nombre désiré

            // Lancer le pathfinding initial (utilise maintenant les agents logiques)
            this.cityManager.initiateAgentPathfinding(); // Cette méthode doit être adaptée ci-dessous

            console.log("World: Initialisation complète (avec agents instanciés).");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    // Modifié: Crée des agents logiques via AgentManager
    createAgents(numberOfAgents) {
         if (!this.agentManager) {
             console.error("World: AgentManager non initialisé, impossible de créer des agents.");
             return;
         }
          if (!this.cityManager?.navigationGraph) {
             console.error("World: Tentative de créer des agents mais le NavigationGraph n'est pas prêt.");
             return;
         }

         // Nettoyer les anciens agents logiques si nécessaire (dans AgentManager?)
         // Pour l'instant, on suppose une création unique à l'initialisation

        console.log(`World: Création de ${numberOfAgents} agents logiques via AgentManager...`);
        const sidewalkHeight = this.cityManager.navigationGraph.sidewalkHeight;

        for (let i = 0; i < numberOfAgents; i++) {
            // Position de départ aléatoire simple pour l'exemple
             const startPos = this.cityManager.navigationGraph.gridToWorld(
                 Math.floor(Math.random() * this.cityManager.navigationGraph.gridWidth),
                 Math.floor(Math.random() * this.cityManager.navigationGraph.gridHeight)
             );
             // S'assurer qu'elle est marchable ? Pour l'instant non, pathfinding corrigera.
             if (startPos) {
                 startPos.y = sidewalkHeight; // Assurer la bonne hauteur
                 this.agentManager.createAgent(startPos); // Demander la création au manager
             } else {
                 this.agentManager.createAgent(new THREE.Vector3(0, sidewalkHeight, 0)); // Fallback
             }
        }
        console.log(`World: ${this.agentManager.agents.length} agents logiques créés.`);
    }

    // Modifié: Met à jour le chemin de l'agent logique
    setAgentPathForAgent(agentLogic, pathPoints, pathColor) {
        // NOTE: 'agentLogic' ici est maintenant l'objet état retourné par AgentManager,
        // ou l'objet état trouvé via agentManager.getAgentById(...)
        if (!agentLogic) {
            console.warn("World: Tentative de définir un chemin pour un agent logique invalide.");
            return;
        }

        const agentId = agentLogic.id; // Utiliser l'ID stocké
        const agentPathName = `AgentPath_${agentId}`;

        // Recherche/suppression ancien chemin debug (INCHANGÉ)
        const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
        if (existingPath) {
             this.debugAgentPathGroup.remove(existingPath);
             if (existingPath.geometry) existingPath.geometry.dispose();
             if (existingPath.material) existingPath.material.dispose();
        }

        // Création visualisation tube chemin (INCHANGÉ)
        /* if (pathPoints && pathPoints.length > 1 && this.cityManager.navigationGraph) { // Ajout check navgraph
             const curve = new THREE.CatmullRomCurve3(pathPoints);
             const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.1, 8, false);
             const tubeMaterial = new THREE.MeshBasicMaterial({ color: pathColor });
             const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
             tubeMesh.name = agentPathName;
             // Positionner le tube légèrement au-dessus du sol
             tubeMesh.position.y = this.cityManager.navigationGraph.sidewalkHeight + 0.02;
             this.debugAgentPathGroup.add(tubeMesh);
        } */

        // Donner le chemin à l'agent logique via sa méthode setPath
        agentLogic.setPath(pathPoints);

        // !! IMPORTANT: Ne plus toucher à agent.model.position ici !!
        // La position initiale est gérée par agentLogic.setPath,
        // et la position visuelle est gérée par AgentManager.update
    }

    update() {
        const deltaTime = this.experience.time.delta;
        this.cityManager?.update();
        this.environment?.update(deltaTime);

        // --- NOUVEAU: Mettre à jour AgentManager ---
        // C'est lui qui mettra à jour les agents logiques ET les InstancedMesh
        this.agentManager?.update(deltaTime);
        // -----------------------------------------

        // L'ancienne boucle forEach(agent => agent.update()) est supprimée
    }

    destroy() {
        console.log("Destruction du World (avec AgentManager)...");

        // --- NOUVEAU: Détruire AgentManager ---
        this.agentManager?.destroy();
        this.agentManager = null;
        // ------------------------------------

        // Le reste du nettoyage (groupes debug, cityManager, environment)
        const cleanGroup = (group) => { /* ... */ }; // Fonction utilitaire inchangée
        cleanGroup(this.debugNavGridGroup); if (this.debugNavGridGroup) this.scene.remove(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup); if (this.debugAgentPathGroup) this.scene.remove(this.debugAgentPathGroup);
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;

        this.cityManager?.destroy();
        this.environment?.destroy();

        // La liste this.agents n'existe plus ici, elle est dans agentManager

        console.log("World détruit.");
    }
} // Fin classe World