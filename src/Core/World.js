// src/Core/World.js
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
        this.agent = null;

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
            if (this.cityManager.navigationGraph) { // Vérifier si navGraph existe bien
                 console.log("World: Génération de la visualisation de la grille de navigation...");
                 // Appel de la méthode sur l'instance correcte
                 this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
            } else {
                 console.warn("World: navigationGraph non trouvé dans cityManager après generateCity.");
            }

            // Créer l'agent après la génération de la ville et du graphe
            this.createAgent();

            // Lancer le pathfinding initial (qui a besoin de l'agent)
            this.cityManager.initiateAgentPathfinding();

            console.log("World: Initialisation complète.");

        } catch (error) {
            // Afficher l'erreur spécifique qui a causé le problème
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    createAgent() {
        if (this.agent) { this.agent.destroy(); }
        const startPos = new THREE.Vector3(0, 1, 0); // Position temporaire
        this.agent = new Agent(this.scene, startPos, 0xffff00, 5); // Cube jaune taille 2
        console.log("Agent créé dans le monde.");
    }

	setAgentPath(pathPoints) {
		// Nettoyer l'ancien chemin visualisé
		while(this.debugAgentPathGroup.children.length > 0) {
			 const child = this.debugAgentPathGroup.children[0];
			 this.debugAgentPathGroup.remove(child);
			 if (child.geometry) child.geometry.dispose();
			 if (child.material) child.material.dispose();
		}
	
		if (pathPoints && pathPoints.length > 1) {
			 // Créer une courbe passant par les points du chemin
			 const curve = new THREE.CatmullRomCurve3(pathPoints);
			 
			 // Paramètres de TubeGeometry :
			 // - tubularSegments : nombre de segments le long du tube
			 // - radius : rayon du tube (épaisseur)
			 // - radialSegments : nombre de segments autour du tube
			 // - closed : si le tube forme une boucle (false dans notre cas)
			 const tubularSegments = 64;
			 const radius = 1; // Ajustez cette valeur pour obtenir l'épaisseur désirée
			 const radialSegments = 8;
			 const closed = false;
			 
			 const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
			 
			 // Création d'un matériau simple
			 const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
			 
			 // Création du maillage du tube
			 const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
			 tubeMesh.name = "AgentPathTube";
			 tubeMesh.position.y = 0.02; // Légèrement au-dessus de la grille debug
			 
			 // Ajouter le tube dans le groupe de visualisation de chemin
			 this.debugAgentPathGroup.add(tubeMesh);
			 console.log("World: Chemin de l'agent visualisé (TubeGeometry).");
		}
	
		// Donner le chemin à l'agent
		if (this.agent) {
			 if (pathPoints && pathPoints.length > 0 && this.agent.mesh) {
				  // Positionner l'agent au premier point du chemin trouvé
				  this.agent.mesh.position.copy(pathPoints[0]);
				  // Mettre le cube légèrement au-dessus pour être sûr qu'il est visible
				  this.agent.mesh.position.y = pathPoints[0].y + ((this.agent.mesh.geometry.parameters.height) || 1.0);
			 }
			 this.agent.setPath(pathPoints);
		} else {
			 console.warn("Tentative de définir un chemin mais l'agent n'existe pas.");
		}
	}	

    // generateCityAsync a été intégré dans initializeWorld via cityManager.generateCity
    // async generateCityAsync() { ... }

    update() {
        const deltaTime = this.experience.time.delta;
        const normalizedHealth = 0.8;
        this.cityManager?.update();
        this.environment?.update(deltaTime, normalizedHealth);
        this.agent?.update(deltaTime);
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
        this.agent?.destroy();
        this.agent = null;
        console.log("World détruit.");
    }
}