/*
 * Fichier: src/Core/World.js
 * Ajouts/Modifications:
 * - Ajout de la méthode `setDebugMode` pour contrôler la visibilité de `debugAgentPathGroup`.
 * - Décommentage du code de création de `TubeGeometry` dans `setAgentPathForAgent`.
 * - La création de `TubeGeometry` est maintenant conditionnelle à `this.debugAgentPathGroup.visible`.
 */
// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import AgentManager from '../World/AgentManager.js'; // Déjà importé

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Managers ---
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agentManager = null;

        // --- Groupes Debug ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);

        // La visibilité sera contrôlée par setDebugMode
        this.debugNavGridGroup.visible = false; // Caché par défaut
        this.debugAgentPathGroup.visible = false; // Caché par défaut (activé par debug mode)

        // Lancer l'initialisation asynchrone
        this.initializeWorld();
    }

    // --- NOUVELLE MÉTHODE ---
    /**
     * Active ou désactive l'affichage des éléments de debug gérés par World.
     * @param {boolean} enabled - True pour activer, false pour désactiver.
     */
    setDebugMode(enabled) {
        this.debugAgentPathGroup.visible = enabled;
        // Potentiellement aussi contrôler this.debugNavGridGroup.visible ici si besoin
        // this.debugNavGridGroup.visible = enabled;

        // Si on désactive, on peut aussi vider le groupe pour libérer les ressources
        if (!enabled) {
            this.clearDebugAgentPaths();
        }
        console.log(`World Debug Mode: ${enabled ? 'Enabled' : 'Disabled'} (AgentPathGroup Visible: ${this.debugAgentPathGroup.visible})`);
    }

    /**
     * Supprime tous les chemins de debug actuellement affichés.
     */
    clearDebugAgentPaths() {
        while(this.debugAgentPathGroup.children.length > 0){
            const obj = this.debugAgentPathGroup.children[0];
            this.debugAgentPathGroup.remove(obj);
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
        }
         console.log("Debug agent paths cleared.");
    }
    // --- FIN NOUVELLE MÉTHODE ---

    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // 1. Init Environnement
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // 2. Générer Ville (plots, routes, nav graph, registres)
            await this.cityManager.generateCity();
            console.log("World: Ville générée.");

            // 3. Init AgentManager
            const maxAgents = this.cityManager.config.maxAgents ?? 300;
            this.agentManager = new AgentManager(
                this.scene,
                this.experience, // Passe l'instance Experience complète
                this.cityManager.config,
                maxAgents
            );
            console.log("World: AgentManager initialisé.");

            // 4. Créer Agents logiques
            this.createAgents(maxAgents);

            // 5. Visualisation Debug NavGrid (Optionnel, si `debugNavGridGroup.visible` est true)
            if (this.cityManager.navigationGraph && this.debugNavGridGroup.visible) {
                console.log("World: Génération visualisation NavGrid...");
                this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
            }

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    createAgents(numberOfAgents) {
         if (!this.agentManager) {
             console.error("World: AgentManager non initialisé.");
             return;
         }
         if (!this.cityManager?.buildingInstances || this.cityManager.buildingInstances.size === 0) {
             console.error("World: Aucun bâtiment enregistré par CityManager.");
             return;
         }

        console.log(`World: Demande de création de ${numberOfAgents} agents...`);
        let createdCount = 0;
        for (let i = 0; i < numberOfAgents; i++) {
             const agent = this.agentManager.createAgent(); // Gère enregistrement et assignation
             if (agent) {
                 createdCount++;
             } else {
                 console.warn(`World: Echec création agent (max atteint?).`);
                 break;
             }
        }
        console.log(`World: ${this.agentManager.agents.length} agents logiques créés (demandé: ${numberOfAgents}).`);
    }

    /**
     * Affiche le chemin d'un agent pour le débogage SI le mode debug est actif.
     * @param {Agent} agentLogic - L'instance de l'agent logique.
     * @param {THREE.Vector3[]} pathPoints - Les points du chemin (doit être le chemin final stocké dans l'agent).
     * @param {number|THREE.Color} pathColor - La couleur du chemin.
     */
    setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
		// --- VÉRIFICATION INITIALE ---
		// Ne rien faire si :
		// - l'agent est invalide
		// - le groupe de debug n'existe pas
		// - le groupe de debug N'EST PAS VISIBLE (mode debug désactivé via setDebugMode)
		if (!agentLogic || !this.debugAgentPathGroup || !this.debugAgentPathGroup.visible) {
			return;
		}

		const agentId = agentLogic.id;
		const agentPathName = `AgentPath_${agentId}`;

		// --- Recherche/suppression ancien chemin debug ---
		const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
		if (existingPath) {
			 // Retirer l'ancien mesh du groupe
			 this.debugAgentPathGroup.remove(existingPath);
			 // Disposer la géométrie et le matériau pour libérer la mémoire GPU
			 if (existingPath.geometry) existingPath.geometry.dispose();
			 if (existingPath.material) existingPath.material.dispose();
		}

		// --- Création visualisation tube chemin debug ---
		// Vérifier si on a un chemin valide avec au moins 2 points pour former une courbe
		if (pathPoints && pathPoints.length > 1) {
			 try {
				 // Créer une courbe passant par les points du chemin
				 const curve = new THREE.CatmullRomCurve3(pathPoints);

				 // Définir les paramètres du tube
				 const tubeSegments = Math.min(64, pathPoints.length * 4); // Nombre de segments le long du tube
				 const tubeRadius = 0.1; // Rayon du tube (assez fin)
				 const radialSegments = 4; // Nombre de segments autour du tube (simple)
				 const closed = false; // Le chemin n'est pas fermé

				 // Créer la géométrie du tube
				 const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, radialSegments, closed);

				 // Créer un matériau simple pour le tube
				 const tubeMaterial = new THREE.MeshBasicMaterial({ color: pathColor });

				 // Créer le mesh du tube
				 const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
				 tubeMesh.name = agentPathName; // Nommer pour pouvoir le retrouver et le supprimer plus tard

				 // --- Positionner légèrement au-dessus du sol ---
				 // Essayer de récupérer la hauteur du trottoir depuis la config via cityManager
				 const sidewalkHeight = this.cityManager?.config?.sidewalkHeight ?? 0.2;
				 tubeMesh.position.y = sidewalkHeight + 0.05; // Ajuster ce décalage si nécessaire

				 // Ajouter le tube au groupe de debug des chemins d'agents
				 this.debugAgentPathGroup.add(tubeMesh);

			 } catch (error) {
				 console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
				 // Afficher les points du chemin en cas d'erreur peut aider au debug
				 // console.error("Path points:", pathPoints);
			 }
		}
		// Si pathPoints est null ou a moins de 2 points, on ne crée pas de tube (l'ancien a déjà été retiré).
   }
    // --- FIN MODIFIÉ ---

    update() {
        const deltaTime = this.experience.time.delta;

        // Mettre à jour l'Environnement
        this.environment?.update(deltaTime);

        // Mettre à jour l'AgentManager (qui met à jour les agents logiques ET les visuals)
        this.agentManager?.update(deltaTime);
    }

    destroy() {
        console.log("Destruction du World...");

        // 1. Détruire AgentManager
        this.agentManager?.destroy();
        this.agentManager = null;

        // 2. Nettoyer les groupes de débogage
        const cleanGroup = (group) => {
             if (!group) return;
             if (group.parent) group.parent.remove(group);
             while(group.children.length > 0){
                 const obj = group.children[0];
                 group.remove(obj);
                 if(obj.geometry) obj.geometry.dispose();
                 // Utiliser Material.dispose() pour les matériaux Basic/Standard
                 if(obj.material) {
                     // Gérer les matériaux multiples potentiels
                     if(Array.isArray(obj.material)) {
                         obj.material.forEach(m => m.dispose());
                     } else {
                         obj.material.dispose();
                     }
                 }
             }
        };
        cleanGroup(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup); // Nettoie aussi les tubes
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;

        // 3. Détruire CityManager
        this.cityManager?.destroy();
        this.cityManager = null;

        // 4. Détruire l'Environnement
        this.environment?.destroy();
        this.environment = null;

        console.log("World détruit.");
    }
}