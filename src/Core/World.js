// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import AgentManager from '../World/AgentManager.js';
import DebugVisualManager from '../World/DebugVisualManager.js'; // Assurez-vous qu'il est importé
// Import nécessaire pour Agent Path Debugging
import { CatmullRomCurve3, TubeGeometry, MeshBasicMaterial, Mesh } from 'three';


export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Managers ---
        // CityManager gère maintenant NavMeshManager en interne
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        // AgentManager sera créé dans initializeWorld après la génération de la ville/navmesh
        this.agentManager = null;

        // --- Groupes de Debug par Catégorie ---
        this.debugGroups = {
            district: new THREE.Group(),
            plot: new THREE.Group(),
            buildingOutline: new THREE.Group(),
            // --- MODIFICATION : Renommé navGrid en navMesh ---
            navMesh: new THREE.Group(), // <-- Renommé
            // --------------------------------------------
            agentPath: new THREE.Group()
        };
        this.debugGroups.district.name = "DebugDistrictGrounds";
        this.debugGroups.plot.name = "DebugPlotGrounds";
        this.debugGroups.buildingOutline.name = "DebugBuildingOutlines";
        // --- MODIFICATION : Nom du groupe ---
        this.debugGroups.navMesh.name = "DebugNavMesh"; // <-- Renommé
        // -----------------------------------
        this.debugGroups.agentPath.name = "DebugAgentPaths";

        // Ajouter tous les groupes à la scène (INCHANGÉ)
        Object.values(this.debugGroups).forEach(group => this.scene.add(group));

        // --- Debug Visual Manager (référence) (INCHANGÉ) ---
        this.debugVisualManager = this.cityManager.debugVisualManager;
        if (!this.debugVisualManager) {
            console.warn("World: DebugVisualManager non trouvé dans CityManager.");
        }

        // Hauteurs (INCHANGÉ - mais la clé navGrid devient navMesh)
        this.debugHeights = {
            districtGround: 0.005,
            plotGround: 0.015,
            buildingOutline: 0.05,
            navMesh: 0.06, // <-- Renommé
            agentPath: 0.07
        };

        // Visibilité initiale des groupes (INCHANGÉ)
        this.setAllDebugGroupsVisibility(false);

        // Lancement de l'initialisation asynchrone
        this.initializeWorld();
    }

    /**
     * Définit la visibilité de tous les groupes de debug principaux. (INCHANGÉ)
     * @param {boolean} visible
     */
    setAllDebugGroupsVisibility(visible) {
        for (const categoryName in this.debugGroups) {
             if (this.debugGroups.hasOwnProperty(categoryName)) {
                 this.debugGroups[categoryName].visible = visible;
             }
        }
    }

	/**
     * Vide tous les enfants d'un groupe donné et dispose leurs géométries/matériaux si nécessaire. (INCHANGÉ)
     * @param {THREE.Group} group
     * @param {boolean} disposeSharedGeom - Si true, dispose même les géométries partagées.
     */
    clearGroupChildren(group, disposeSharedGeom = false) {
         if (!group) return;
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            // Nettoyage Géométrie
            if (child.geometry) {
                 const isSharedGround = child.geometry === this.debugVisualManager?.sharedGroundBoxGeometry;
                 const isSharedBuilding = child.geometry === this.debugVisualManager?.sharedBuildingBoxGeometry;
                 // --- AJOUT POTENTIEL : Vérifier si c'est la géométrie partagée du NavMesh debug ---
                 const isSharedNavMeshDebug = child.geometry === this.cityManager?.navMeshManager?.debugMeshGeometry; // Supposant que NavMeshManager expose sa géométrie debug
                 // --------------------------------------------------------------------------------
                 if (disposeSharedGeom || (!isSharedGround && !isSharedBuilding && !isSharedNavMeshDebug)) {
                    child.geometry.dispose();
                 }
            }
            // Nettoyage Matériau
            if (child.material) {
                const matKey = Object.keys(this.debugVisualManager?.cachedMaterials || {}).find(
                    key => this.debugVisualManager.cachedMaterials[key] === child.material
                );
                const isCached = !!matKey;
                 // --- AJOUT POTENTIEL : Vérifier si c'est le matériau partagé du NavMesh debug ---
                const isSharedNavMeshMat = child.material === this.cityManager?.navMeshManager?.debugMeshMaterial;
                // ----------------------------------------------------------------------------
                 if (!isCached && !isSharedNavMeshMat && child.name?.startsWith('AgentPath_')) { // Dispose seulement AgentPath ou matériaux non cachés/partagés
                      if (Array.isArray(child.material)) {
                           child.material.forEach(m => m.dispose());
                      } else {
                           child.material.dispose?.();
                      }
                 }
            }
        }
    }

    /**
     * Active ou désactive le mode debug global. Crée ou nettoie les visuels.
     * Applique la visibilité des groupes principaux basée sur l'état de Experience.
     * @param {boolean} enabled - True pour activer, false pour désactiver.
     */
    setDebugMode(enabled) {
        if (enabled) {
            console.log("  [World Debug] Enabling Debug Mode - Creating visuals...");

            if (!this.debugVisualManager) { console.error("World: DVM manquant!"); return; }

            // Nettoyage préalable des groupes (INCHANGÉ)
            this.clearGroupChildren(this.debugGroups.district);
            this.clearGroupChildren(this.debugGroups.plot);
            this.clearGroupChildren(this.debugGroups.buildingOutline);
            // --- MODIFICATION ---
            this.clearGroupChildren(this.debugGroups.navMesh); // Nettoie ancien contenu NavMesh
            // -------------------
            this.clearGroupChildren(this.debugGroups.agentPath);

            if (this.cityManager) {
                const plots = this.cityManager.getPlots();
                const districts = this.cityManager.getDistricts();
                const buildingInstances = this.cityManager.getBuildingInstances();

                // 1. Sols Districts (par type) (INCHANGÉ)
                const districtMeshesByType = this.debugVisualManager.createDistrictGroundVisuals(districts, 0);
                for (const type in districtMeshesByType) {
                    this.debugGroups.district.add(districtMeshesByType[type]);
                     districtMeshesByType[type].visible = this.experience.debugLayerVisibility.district[type] ?? true;
                }
                this.debugGroups.district.position.y = this.debugHeights.districtGround;

                // 2. Sols Parcelles (par type) (INCHANGÉ)
                const plotMeshesByType = this.debugVisualManager.createPlotGroundVisuals(plots, 0);
                for (const type in plotMeshesByType) {
                     this.debugGroups.plot.add(plotMeshesByType[type]);
                     plotMeshesByType[type].visible = this.experience.debugLayerVisibility.plot[type] ?? true;
                }
                this.debugGroups.plot.position.y = this.debugHeights.plotGround;

                // 3. Outlines Bâtiments (par type) (INCHANGÉ)
                const outlineMeshesByType = this.debugVisualManager.createBuildingOutlines(buildingInstances, this.cityManager.config, 0);
                for (const type in outlineMeshesByType) {
                    this.debugGroups.buildingOutline.add(outlineMeshesByType[type]);
                    outlineMeshesByType[type].visible = this.experience.debugLayerVisibility.buildingOutline[type] ?? true;
                }
                this.debugGroups.buildingOutline.position.y = this.debugHeights.buildingOutline;

                // --- MODIFICATION : Visualisation NavMesh ---
                // 4. NavMesh
                if (this.cityManager.navMeshManager) {
                    // Demander au NavMeshManager de créer sa visualisation et de l'ajouter au groupe fourni
                    this.cityManager.navMeshManager.createDebugVisualization(this.debugGroups.navMesh);
                    // Le NavMeshManager gère lui-même la visibilité de ses composants internes si besoin.
                }
                this.debugGroups.navMesh.position.y = this.debugHeights.navMesh; // Appliquer hauteur globale
                // -------------------------------------------

                // 5. Chemins Agents (groupe prêt, contenu ajouté dynamiquement) (INCHANGÉ)
                this.debugGroups.agentPath.position.y = this.debugHeights.agentPath;

            } // fin if (this.cityManager)

            // --- Appliquer la Visibilité Initiale des Catégories ---
            this.setGroupVisibility('district', this.experience.debugLayerVisibility.district._visible);
            this.setGroupVisibility('plot', this.experience.debugLayerVisibility.plot._visible);
            this.setGroupVisibility('buildingOutline', this.experience.debugLayerVisibility.buildingOutline._visible);
            // --- MODIFICATION ---
            this.setGroupVisibility('navMesh', this.experience.debugLayerVisibility.navMesh._visible); // Utilise la nouvelle clé
            // -------------------
            this.setGroupVisibility('agentPath', this.experience.debugLayerVisibility.agentPath._visible);

        } else {
            console.log("  [World Debug] Disabling Debug Mode - Clearing visuals...");
            // Nettoyer les groupes (INCHANGÉ - clearGroupChildren gère les géométries spécifiques)
            this.clearGroupChildren(this.debugGroups.district);
            this.clearGroupChildren(this.debugGroups.plot);
            this.clearGroupChildren(this.debugGroups.buildingOutline);
            // --- MODIFICATION ---
            this.clearGroupChildren(this.debugGroups.navMesh); // Nettoie NavMesh debug
            // -------------------
            this.clearGroupChildren(this.debugGroups.agentPath, true); // Dispose AgentPath specifics

            // Cacher tous les groupes principaux (INCHANGÉ)
            this.setAllDebugGroupsVisibility(false);
        }
    }

	/**
     * Définit la visibilité d'un groupe de catégorie principal. (Adapté pour navMesh)
     * @param {string} categoryName - Nom de la catégorie ('district', 'plot', 'navMesh', etc.).
     * @param {boolean} isVisible - True pour afficher, false pour masquer.
     */
    setGroupVisibility(categoryName, isVisible) {
		const targetGroup = this.debugGroups[categoryName];
		if (targetGroup) {
			targetGroup.visible = isVisible;
		} else {
			console.warn(`World.setGroupVisibility: Unknown category group '${categoryName}'`);
		}
    }

	/**
     * Définit la visibilité d'un mesh de sous-type spécifique dans un groupe. (INCHANGÉ)
     * @param {string} categoryName - Nom de la catégorie (ex: 'plot').
     * @param {string} subTypeName - Nom du sous-type (ex: 'house').
     * @param {boolean} isVisible - True pour afficher, false pour masquer.
     */
    setSubLayerMeshVisibility(categoryName, subTypeName, isVisible) {
		const targetGroup = this.debugGroups[categoryName];
		if (!targetGroup) {
			console.warn(`World.setSubLayerMeshVisibility: Group for category '${categoryName}' not found.`);
			return;
		}
		const targetMesh = targetGroup.children.find(child => child.userData?.subType === subTypeName || child.name.endsWith(`_${subTypeName}`));
		if (targetMesh) {
			targetMesh.visible = isVisible;
		} else {
			// C'est normal de ne pas trouver si aucun objet de ce sous-type n'a été généré
            // console.warn(`World.setSubLayerMeshVisibility: Mesh for subType '${subTypeName}' not found in category '${categoryName}'.`);
		}
    }

    // --- setLayerVisibility (OBSOLETE) ---
    // Cette méthode n'est plus utilisée car la visibilité est gérée par setGroupVisibility et setSubLayerMeshVisibility
    // setLayerVisibility(layerName, isVisible) { ... }

    // --- clearDebugAgentPaths (INCHANGÉ) ---
    clearDebugAgentPaths() {
        this.clearGroupChildren(this.debugGroups.agentPath, true); // Dispose les tubes
    }

    // --- clearDebugNavGrid -> clearDebugNavMesh ---
    /**
     * Vide le contenu du groupe de visualisation du NavMesh.
     */
    clearDebugNavMesh() {
        // Le NavMeshManager pourrait avoir sa propre méthode de nettoyage si la géométrie est complexe
        this.cityManager?.navMeshManager?.clearDebugVisualization(this.debugGroups.navMesh);
        // Ou nettoyage générique si le DVM a tout créé :
        // this.clearGroupChildren(this.debugGroups.navMesh);
    }
    // -----------------------------------------

    // --- setAgentPathForAgent (INCHANGÉ - fonctionne avec Vector3) ---
	setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
        const agentPathGroup = this.debugGroups.agentPath;
        const agentId = agentLogic?.id || 'unknown';
        const agentPathName = `AgentPath_${agentId}`;

        // Retirer l'ancien chemin s'il existe
        const existingPath = agentPathGroup?.getObjectByName(agentPathName);
        if (existingPath) {
             agentPathGroup.remove(existingPath);
             if (existingPath.geometry) existingPath.geometry.dispose();
             if (existingPath.material) { // Matériau est spécifique, on le dispose
                 if (Array.isArray(existingPath.material)) {
                      existingPath.material.forEach(m => m.dispose());
                 } else {
                      existingPath.material.dispose();
                 }
             }
        }

        // Ne rien ajouter si le groupe est caché ou si pas de chemin
        if (!agentPathGroup || !agentPathGroup.visible || !pathPoints || pathPoints.length < 2) {
             return;
        }

        // Créer le nouveau chemin (tube)
         try {
             const curve = new THREE.CatmullRomCurve3(pathPoints);
             const tubeSegments = Math.min(64, pathPoints.length * 4);
             const tubeRadius = 0.1;
             const radialSegments = 4;
             const closed = false;
             const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, radialSegments, closed);
             // Utiliser le matériau spécifique du DVM pour les lignes si possible, sinon MeshBasic
             const tubeMaterial = this.debugVisualManager?._getOrCreateMaterial(`agent_path_${pathColor.toString(16)}`, new THREE.Color(pathColor), 'line', 1.0, 1.0)
                               || new THREE.MeshBasicMaterial({ color: pathColor });
             tubeMaterial.depthTest = false; // Assurer qu'il est visible

             // Utiliser Line2 si le matériau est LineMaterial, sinon Mesh
             let tubeMesh;
             if (tubeMaterial instanceof THREE.LineMaterial) { // Attention: Importer LineMaterial si utilisé
                 // La géométrie pour Line2 doit être LineGeometry
                 console.warn("TubeGeometry n'est pas compatible avec LineMaterial/Line2 pour AgentPath. Utilisation de MeshBasicMaterial.");
                 tubeMaterial.dispose(); // Dispose le LineMaterial créé
                 const fallbackMaterial = new THREE.MeshBasicMaterial({ color: pathColor, depthTest: false });
                 tubeMesh = new THREE.Mesh(tubeGeometry, fallbackMaterial);
             } else {
                  tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
             }

             tubeMesh.name = agentPathName;
             tubeMesh.renderOrder = this.debugVisualManager?.renderOrders?.debugLine + 1 || 1000; // Au-dessus
             agentPathGroup.add(tubeMesh);
         } catch (error) {
             console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
         }
   }

    // --- destroy (Adapté pour NavMeshManager) ---
    destroy() {
        console.log("Destroying World...");
        this.agentManager?.destroy(); // AgentManager gère son worker
        this.agentManager = null;

        // Nettoyer les groupes de debug (INCHANGÉ)
        Object.values(this.debugGroups).forEach(group => {
            this.clearGroupChildren(group, true);
            if(group.parent) group.parent.remove(group);
        });
        this.debugGroups = {};

        // CityManager gère son propre NavMeshManager dans son destroy
        this.cityManager?.destroy();
        this.cityManager = null;
        this.debugVisualManager = null; // DVM est détruit par CityManager

        this.environment?.destroy();
        this.environment = null;

        console.log("World destroyed.");
    }

    // --- initializeWorld (Adapté pour AgentManager init) ---
    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // CityManager gère maintenant la génération NavMesh dans son generateCity
            await this.cityManager.generateCity();
            console.log("World: Ville & NavMesh générés par CityManager.");

            // AgentManager est maintenant créé et initialisé DANS generateCity
            // après la création du NavMesh. Récupérer la référence.
            this.agentManager = this.experience.world.agentManager;
            if (!this.agentManager) {
                 console.error("World: AgentManager n'a pas été initialisé par CityManager.generateCity() !");
            }

            // La création des agents est également gérée dans generateCity maintenant

            // Initialisation des visuels debug (INCHANGÉ)
            if (this.experience.isDebugMode) {
                this.setDebugMode(true);
            } else {
                this.setAllDebugGroupsVisibility(false);
            }

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    // --- createAgents (Maintenant appelé par CityManager.generateCity) ---
    createAgents(numberOfAgents) {
		if (!this.agentManager) { console.error("World: AgentManager non initialisé, impossible de créer des agents."); return; }
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

    // --- update (INCHANGÉ) ---
    update() {
	    const deltaTime = this.experience.time.delta;
	    this.environment?.update(deltaTime); // Anime ciel, nuages...
	    const currentHour = this.environment?.getCurrentHour() ?? 12;

	    // CityManager gère la mise à jour de ses composants (fenêtres, lampes)
	    this.cityManager?.update(); // Peut être vide si rien à faire

        // AgentManager gère la mise à jour de la logique et des visuels des agents
	    this.agentManager?.update(deltaTime);
    }
}