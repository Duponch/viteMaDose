// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
// Supprimez Floor.js si CityManager gère le sol global
// import Floor from '../World/Floor.js';
import CityManager from '../World/CityManager.js'; // <- Changer l'import
import Agent from '../World/Agent.js'; // Importer la classe Agent

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;
        this.cityManager = new CityManager(this.experience);

        // Instancier Environment (le constructeur est maintenant synchrone)
        this.environment = new Environment(this.experience, this);
        this.agent = null; // Ajouter une propriété pour l'agent

        // Appeler l'initialisation asynchrone du monde
        this.initializeWorld();
    }

    // NOUVELLE méthode pour gérer l'initialisation asynchrone
    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // Démarrer l'initialisation asynchrone de l'environnement ET attendre qu'elle soit finie
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // Démarrer la génération de la ville (peut aussi être fait en parallèle si besoin)
            await this.generateCityAsync();
			this.createAgent();
            this.cityManager.initiateAgentPathfinding();

            console.log("World: Initialisation complète.");
            // Vous pouvez émettre un événement ou définir un flag si d'autres parties doivent savoir que le monde est prêt

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

	createAgent() {
        if (this.agent) {
            this.agent.destroy();
        }
        // Position de départ temporaire (sera écrasée par initiateAgentPathfinding)
        const startPos = new THREE.Vector3(0, 1, 0); // Hauteur 1 pour être visible au début
        this.agent = new Agent(this.scene, startPos, 0xffff00, 2); // Agent jaune, taille 2
        console.log("Agent créé dans le monde.");
    }

	setAgentPath(pathPoints) {
        if (this.agent) {
            // S'assurer que le premier point du chemin est la position actuelle (ou très proche)
             if (pathPoints && pathPoints.length > 0 && this.agent.mesh) {
                 // Optionnel : Forcer la position de départ de l'agent au premier point du chemin
                 // this.agent.mesh.position.copy(pathPoints[0]);

                 // S'assurer que la hauteur est correcte (celle du pathfinding)
                  this.agent.mesh.position.y = pathPoints[0].y;
             }

            this.agent.setPath(pathPoints);
        } else {
            console.warn("Tentative de définir un chemin mais l'agent n'existe pas.");
        }
    }

	async generateCityAsync() {
        try {
            // CityManager.generateCity() contient maintenant le code pour
            // générer la ville, le graphe, le pathfinder ET lancer
            // le premier pathfinding (initiateAgentPathfinding)
            await this.cityManager.generateCity();
            console.log("Ville chargée dans le monde (et pathfinding initial lancé).");
        } catch (error) {
            console.error("Impossible de générer la ville dans World:", error);
        }
    }

	update() {
        const deltaTime = this.experience.time.delta; // Delta en ms
        const normalizedHealth = 0.8; // Exemple

        this.cityManager?.update();
        this.environment?.update(deltaTime, normalizedHealth);

        // Mettre à jour l'agent
        this.agent?.update(deltaTime); // Agent.update prend deltaTime en ms
    }

    // --- Ajouter une méthode destroy pour nettoyer ---
	destroy() {
        console.log("Destruction du World...");
        this.cityManager?.destroy();
        this.environment?.destroy();
        this.agent?.destroy(); // Détruire l'agent aussi
        this.agent = null;
        console.log("World détruit.");
    }
}