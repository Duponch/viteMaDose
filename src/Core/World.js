// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import AgentManager from '../World/AgentManager.js'; // Déjà importé

export default class World {
    // --- MODIFIÉ : Ordre création managers ---
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- CityManager est créé en PREMIER ---
        // Pour que sa config soit disponible pour les autres
        this.cityManager = new CityManager(this.experience); // Passe l'instance experience

        // Environment est créé APRÈS CityManager
        this.environment = new Environment(this.experience, this); // Passe experience et world

        // AgentManager sera initialisé dans initializeWorld APRES CityManager
        this.agentManager = null;
        // this.agents = null; // La référence directe n'est plus ici

        // --- Groupes pour les visualisations de débogage (inchangé) ---
        this.debugNavGridGroup = new THREE.Group();
        this.debugNavGridGroup.name = "DebugNavGrid";
        this.scene.add(this.debugNavGridGroup);

        this.debugAgentPathGroup = new THREE.Group();
        this.debugAgentPathGroup.name = "DebugAgentPath";
        this.scene.add(this.debugAgentPathGroup);
        // Mettre à jour la visibilité selon un flag de config ?
        this.debugNavGridGroup.visible = false; // Caché par défaut
        this.debugAgentPathGroup.visible = true; // Visible par défaut

        // Lancer l'initialisation asynchrone
        this.initializeWorld();
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Ordre init, suppression pathfinding ---
    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // 1. Initialiser l'environnement visuel
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // 2. Générer la structure de la ville (plots, routes, contenu, navGraph)
            // Ceci remplit aussi le registre des bâtiments dans cityManager
            await this.cityManager.generateCity();
            console.log("World: Ville générée (incluant nav graph et enregistrement bâtiments).");

            // 3. Initialiser AgentManager (qui a besoin de la config de cityManager)
            const maxAgents = this.cityManager.config.maxAgents ?? 300; // Utiliser config ou défaut
            this.agentManager = new AgentManager(
                this.scene,
                this.experience,
                this.cityManager.config, // Passer la config chargée/fusionnée
                maxAgents
            );
            console.log("World: AgentManager initialisé.");

            // 4. Créer les agents logiques via AgentManager
            // createAgents appelle maintenant AgentManager.createAgent qui gère l'enregistrement et l'assignation
            this.createAgents(maxAgents); // Créer le nombre maximum défini

            // 5. Visualisation Debug NavGrid (Optionnel)
            if (this.cityManager.navigationGraph && this.debugNavGridGroup.visible) {
                console.log("World: Génération visualisation NavGrid...");
                this.cityManager.navigationGraph.createDebugVisualization(this.debugNavGridGroup);
            }

            // L'appel à initiateAgentPathfinding a été supprimé, la routine démarre via Agent.update

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
            // Peut-être afficher un message à l'utilisateur ou tenter de recharger ?
        }
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Appel simplifié à AgentManager ---
    createAgents(numberOfAgents) {
         // Vérifications préliminaires
         if (!this.agentManager) {
             console.error("World: AgentManager non initialisé, impossible de créer des agents.");
             return;
         }
         // Vérifier si des bâtiments existent pour l'assignation
         if (!this.cityManager?.buildingInstances || this.cityManager.buildingInstances.size === 0) {
             console.error("World: Tentative de créer des agents mais aucun bâtiment n'a été enregistré par CityManager.");
             // Ne pas créer d'agents s'il n'y a aucun bâtiment potentiel.
             return;
         }

        console.log(`World: Demande de création de ${numberOfAgents} agents via AgentManager...`);
        let createdCount = 0;
        for (let i = 0; i < numberOfAgents; i++) {
             // AgentManager.createAgent gère maintenant l'enregistrement et l'assignation domicile/travail.
             // Il retourne l'agent logique créé, ou null en cas d'échec interne (ex: max atteint).
             const agent = this.agentManager.createAgent();
             if (agent) {
                 createdCount++;
             } else {
                 console.warn(`World: AgentManager.createAgent a échoué (peut-être max atteint ou autre erreur).`);
                 break; // Arrêter si on ne peut plus en créer
             }
        }
        // Log final basé sur le nombre réellement dans la liste de l'AgentManager
        console.log(`World: ${this.agentManager.agents.length} agents logiques créés et initialisés (demandé: ${numberOfAgents}).`);
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Signature changée, corps commenté (pour debug) ---
    /**
     * Affiche le chemin d'un agent pour le débogage.
     * @param {Agent} agentLogic - L'instance de l'agent logique.
     * @param {THREE.Vector3[]} pathPoints - Les points du chemin.
     * @param {number|THREE.Color} pathColor - La couleur du chemin.
     */
    setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
         // Vérifications
         if (!agentLogic || !this.debugAgentPathGroup || !this.debugAgentPathGroup.visible) {
             return; // Ne rien faire si l'agent est invalide ou le groupe debug caché
         }

         // --- Début Code Commenté (Activer pour Debug) ---
         /*
         const agentId = agentLogic.id;
         const agentPathName = `AgentPath_${agentId}`;

         // Recherche/suppression ancien chemin debug
         const existingPath = this.debugAgentPathGroup.getObjectByName(agentPathName);
         if (existingPath) {
              // Retirer de la scène et disposer les ressources
              this.debugAgentPathGroup.remove(existingPath);
              if (existingPath.geometry) existingPath.geometry.dispose();
              if (existingPath.material) existingPath.material.dispose();
         }

         // Création visualisation tube chemin debug
         // Vérifier si le chemin a au moins 2 points pour former un tube
         if (pathPoints && pathPoints.length > 1) {
              try {
                  const curve = new THREE.CatmullRomCurve3(pathPoints);
                  // Ajuster les paramètres pour performance/visuel
                  const tubeSegments = Math.min(64, pathPoints.length * 4); // Plus de segments si chemin long
                  const tubeRadius = 0.1;
                  const radialSegments = 4; // Moins de segments radiaux pour un tube simple
                  const closed = false;

                  const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, radialSegments, closed);
                  // Utiliser un matériau simple, peut-être transparent
                  const tubeMaterial = new THREE.MeshBasicMaterial({
                      color: pathColor,
                      // transparent: true,
                      // opacity: 0.7
                  });
                  const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
                  tubeMesh.name = agentPathName; // Donner un nom pour le retrouver

                  // Positionner le tube légèrement au-dessus du sol (utiliser la hauteur de trottoir si disponible)
                  const sidewalkHeight = this.cityManager?.config?.sidewalkHeight ?? 0.2;
                  tubeMesh.position.y = sidewalkHeight + 0.05; // Ajuster si nécessaire

                  this.debugAgentPathGroup.add(tubeMesh); // Ajouter au groupe debug

              } catch (error) {
                  console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
              }
         }
         */
         // --- Fin Code Commenté ---

         // Note: La logique métier de définition du chemin est dans agentLogic.setPath()
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Appel AgentManager.update ---
    update() {
        // Obtenir le delta time depuis l'instance Time de l'Experience
        const deltaTime = this.experience.time.delta;

        // Mettre à jour le CityManager (si nécessaire - peu probable pour l'instant)
        // this.cityManager?.update();

        // Mettre à jour l'Environnement (cycle jour/nuit, météo, etc.)
        // Environment.update utilise deltaTime pour ses calculs internes
        this.environment?.update(deltaTime);

        // Mettre à jour l'AgentManager
        // AgentManager.update utilise deltaTime et récupère l'heure de l'Environment
        // Il met à jour les agents logiques (état, position) ET les InstancedMesh (visuel)
        this.agentManager?.update(deltaTime);
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Appel AgentManager.destroy ---
    destroy() {
        console.log("Destruction du World...");

        // 1. Détruire AgentManager (qui nettoie ses agents logiques et meshes)
        this.agentManager?.destroy();
        this.agentManager = null;

        // 2. Nettoyer les groupes de débogage
        const cleanGroup = (group) => {
             if (!group) return;
             if (group.parent) group.parent.remove(group); // Retirer de la scène
             while(group.children.length > 0){
                 const obj = group.children[0];
                 group.remove(obj);
                 if(obj.geometry) obj.geometry.dispose();
                 if(obj.material) obj.material.dispose(); // OK pour les matériaux Basic des debugs
             }
        };
        cleanGroup(this.debugNavGridGroup);
        cleanGroup(this.debugAgentPathGroup);
        this.debugNavGridGroup = null;
        this.debugAgentPathGroup = null;

        // 3. Détruire CityManager (qui nettoie ses composants et registres)
        this.cityManager?.destroy();
        this.cityManager = null;

        // 4. Détruire l'Environnement
        this.environment?.destroy();
        this.environment = null;

        // La liste this.agents n'existe plus directement ici

        console.log("World détruit.");
    }
    // --- FIN MODIFIÉ ---
} // Fin classe World