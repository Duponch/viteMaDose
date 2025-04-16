// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import CityManager from '../World/CityManager.js';
import AgentManager from '../World/AgentManager.js';
// ... autres imports ...
import DebugVisualManager from '../World/DebugVisualManager.js'; // Assurez-vous qu'il est importé

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Managers ---
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agentManager = null;

        // --- NOUVEAU : Groupes de Debug par Catégorie ---
        // Ces groupes contiendront les InstancedMesh *par sous-type*.
        this.debugGroups = {
            district: new THREE.Group(),
            plot: new THREE.Group(),
            buildingOutline: new THREE.Group(),
            navGrid: new THREE.Group(),
            agentPath: new THREE.Group()
        };
        this.debugGroups.district.name = "DebugDistrictGrounds";
        this.debugGroups.plot.name = "DebugPlotGrounds";
        this.debugGroups.buildingOutline.name = "DebugBuildingOutlines";
        this.debugGroups.navGrid.name = "DebugNavGrid";
        this.debugGroups.agentPath.name = "DebugAgentPaths";

        // Ajouter tous les groupes à la scène
        Object.values(this.debugGroups).forEach(group => this.scene.add(group));
        // --------------------------------------------------

        // --- Debug Visual Manager (référence) ---
        // DVM est maintenant principalement utilisé pour créer les géométries/matériaux,
        // mais moins pour gérer directement les objets dans la scène.
        this.debugVisualManager = this.cityManager.debugVisualManager;
        if (!this.debugVisualManager) {
            console.warn("World: DebugVisualManager non trouvé dans CityManager.");
        }

        // Hauteurs (peuvent être gérées ici ou dans DVM)
        this.debugHeights = { /* ... hauteurs existantes ... */
            districtGround: 0.005,
            plotGround: 0.015,
            buildingOutline: 0.05,
            navGrid: 0.06,
            agentPath: 0.07
        };
        // Render Orders sont gérés dans DVM maintenant.

        // Visibilité initiale des groupes
        this.setAllDebugGroupsVisibility(false);

        this.initializeWorld();
    }

    /**
     * Définit la visibilité de tous les groupes de debug principaux.
     * @param {boolean} visible
     */
    setAllDebugGroupsVisibility(visible) {
        // Appliquer la visibilité à chaque groupe stocké dans this.debugGroups
        for (const categoryName in this.debugGroups) {
             if (this.debugGroups.hasOwnProperty(categoryName)) {
                 this.debugGroups[categoryName].visible = visible;
             }
        }
    }

	/**
     * Vide tous les enfants d'un groupe donné et dispose leurs géométries/matériaux si nécessaire.
     * @param {THREE.Group} group
     * @param {boolean} disposeSharedGeom - Si true, dispose même les géométries partagées.
     */
    clearGroupChildren(group, disposeSharedGeom = false) {
        if (!group) return;
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            // Nettoyage Géométrie (ne pas toucher aux partagées sauf demandé)
            if (child.geometry) {
                 const isSharedGround = child.geometry === this.debugVisualManager?.sharedGroundBoxGeometry;
                 const isSharedBuilding = child.geometry === this.debugVisualManager?.sharedBuildingBoxGeometry;
                 if (disposeSharedGeom || (!isSharedGround && !isSharedBuilding)) {
                    child.geometry.dispose();
                 }
            }
            // Nettoyage Matériau (seulement si non partagé ou spécifique comme AgentPath)
            if (child.material) {
                const matKey = Object.keys(this.debugVisualManager?.cachedMaterials || {}).find(
                    key => this.debugVisualManager.cachedMaterials[key] === child.material
                );
                const isCached = !!matKey;
                 // Ne dispose pas les matériaux mis en cache par DVM, sauf cas spécifiques
                 if (!isCached && child.name?.startsWith('AgentPath_')) {
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
     * MODIFIÉ : Active ou désactive le mode debug global. Crée ou nettoie les visuels.
     * Applique la visibilité des groupes principaux basée sur l'état de Experience.
     * @param {boolean} enabled - True pour activer, false pour désactiver.
     */
    setDebugMode(enabled) {
        if (enabled) {
            console.log("  [World Debug] Enabling Debug Mode - Creating visuals...");

            if (!this.debugVisualManager) { /* ... erreur DVM manquant ... */ return; }

            // --- Nettoyage des groupes AVANT recréation ---
            this.clearGroupChildren(this.debugGroups.district);
            this.clearGroupChildren(this.debugGroups.plot);
            this.clearGroupChildren(this.debugGroups.buildingOutline);
            this.clearGroupChildren(this.debugGroups.navGrid);
            this.clearGroupChildren(this.debugGroups.agentPath);
            // ---------------------------------------------

            if (this.cityManager) {
                const plots = this.cityManager.getPlots();
                const districts = this.cityManager.getDistricts();
                const buildingInstances = this.cityManager.getBuildingInstances();

                // --- Création et Ajout aux Groupes (MAJ) ---

                // 1. Sols Districts (par type)
                const districtMeshesByType = this.debugVisualManager.createDistrictGroundVisuals(districts, 0); // Y pos géré par groupe
                for (const type in districtMeshesByType) {
                    this.debugGroups.district.add(districtMeshesByType[type]);
                    // Appliquer la visibilité initiale du sous-type
                     districtMeshesByType[type].visible = this.experience.debugLayerVisibility.district[type] ?? true;
                }
                this.debugGroups.district.position.y = this.debugHeights.districtGround;

                // 2. Sols Parcelles (par type)
                const plotMeshesByType = this.debugVisualManager.createPlotGroundVisuals(plots, 0);
                for (const type in plotMeshesByType) {
                     this.debugGroups.plot.add(plotMeshesByType[type]);
                     plotMeshesByType[type].visible = this.experience.debugLayerVisibility.plot[type] ?? true;
                }
                this.debugGroups.plot.position.y = this.debugHeights.plotGround;

                // 3. Outlines Bâtiments (par type)
                const outlineMeshesByType = this.debugVisualManager.createBuildingOutlines(buildingInstances, this.cityManager.config, 0);
                for (const type in outlineMeshesByType) {
                    this.debugGroups.buildingOutline.add(outlineMeshesByType[type]);
                    outlineMeshesByType[type].visible = this.experience.debugLayerVisibility.buildingOutline[type] ?? true;
                }
                this.debugGroups.buildingOutline.position.y = this.debugHeights.buildingOutline;

                // 4. NavGrid (reste simple, pas de sous-types)
                if (this.cityManager.navigationGraph) {
                    this.cityManager.navigationGraph.createDebugVisualization(this.debugGroups.navGrid);
                }
                this.debugGroups.navGrid.position.y = this.debugHeights.navGrid;

                // 5. Chemins Agents (reste dynamique)
                this.debugGroups.agentPath.position.y = this.debugHeights.agentPath;

            } // fin if (this.cityManager)

            // --- Appliquer la Visibilité Initiale des Catégories (Groupes) ---
            this.setGroupVisibility('district', this.experience.debugLayerVisibility.district._visible);
            this.setGroupVisibility('plot', this.experience.debugLayerVisibility.plot._visible);
            this.setGroupVisibility('buildingOutline', this.experience.debugLayerVisibility.buildingOutline._visible);
            this.setGroupVisibility('navGrid', this.experience.debugLayerVisibility.navGrid._visible);
            this.setGroupVisibility('agentPath', this.experience.debugLayerVisibility.agentPath._visible);
            // La visibilité des sous-types a été appliquée lors de l'ajout des meshes.

        } else {
            console.log("  [World Debug] Disabling Debug Mode - Clearing visuals...");
            // Nettoyer les groupes (dispose la géométrie/matériaux spécifiques comme AgentPath)
            this.clearGroupChildren(this.debugGroups.district);
            this.clearGroupChildren(this.debugGroups.plot);
            this.clearGroupChildren(this.debugGroups.buildingOutline);
            this.clearGroupChildren(this.debugGroups.navGrid);
            this.clearGroupChildren(this.debugGroups.agentPath, true); // Dispose AgentPath specifics

            // Cacher tous les groupes principaux
            this.setAllDebugGroupsVisibility(false);

             // Optionnel: Nettoyer aussi les matériaux cachés dans DVM
             // this.debugVisualManager?.clearAllAndDisposeMaterials(); // Attention si DVM est partagé
        }
    }

	/**
     * NOUVEAU : Définit la visibilité d'un groupe de catégorie principal.
     * @param {string} categoryName - Nom de la catégorie ('district', 'plot', etc.).
     * @param {boolean} isVisible - True pour afficher, false pour masquer.
     */
    setGroupVisibility(categoryName, isVisible) {
		const targetGroup = this.debugGroups[categoryName];
		if (targetGroup) {
			targetGroup.visible = isVisible;
			// console.log(`  [World Debug] Group '${categoryName}' visibility set to ${isVisible}`);
		} else {
			console.warn(`World.setGroupVisibility: Unknown category group '${categoryName}'`);
		}
    }
   
	/**
     * NOUVEAU : Définit la visibilité d'un mesh de sous-type spécifique dans un groupe.
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

		// Trouver le mesh correspondant dans le groupe (basé sur userData.subType ou le nom)
		const targetMesh = targetGroup.children.find(child => child.userData?.subType === subTypeName || child.name.endsWith(`_${subTypeName}`));

		if (targetMesh) {
			targetMesh.visible = isVisible;
			// console.log(`  [World Debug] SubLayer Mesh '${categoryName}.${subTypeName}' visibility set to ${isVisible}`);
		} else {
			console.warn(`World.setSubLayerMeshVisibility: Mesh for subType '${subTypeName}' not found in category '${categoryName}'.`);
		}
    }

	/**
     * Définit la visibilité d'un calque de debug spécifique.
     * @param {string} layerName - Nom du calque ('districtGround', 'plotGround', 'buildingOutline', 'navGrid', 'agentPath').
     * @param {boolean} isVisible - True pour afficher, false pour masquer.
     */
    setLayerVisibility(layerName, isVisible) {
        let targetGroup = null;
        switch (layerName) {
            case 'districtGround':  targetGroup = this.debugDistrictGroundGroup; break;
            case 'plotGround':      targetGroup = this.debugPlotGroundGroup; break;
            case 'buildingOutline': targetGroup = this.debugBuildingOutlineGroup; break;
            case 'navGrid':         targetGroup = this.debugNavGridGroup; break;
            case 'agentPath':       targetGroup = this.debugAgentPathGroup; break;
            default:
                console.warn(`World.setLayerVisibility: Unknown layer name '${layerName}'`);
                return;
        }
        if (targetGroup) {
            targetGroup.visible = isVisible;
            // console.log(`  [World Debug] Layer '${layerName}' visibility set to ${isVisible}`);
        }
    }

    clearDebugAgentPaths() {
        this.clearGroupChildren(this.debugGroups.agentPath);
    }

    clearDebugNavGrid() {
        this.clearGroupChildren(this.debugGroups.navGrid);
    }

	setAgentPathForAgent(agentLogic, pathPoints, pathColor = 0xff00ff) {
        const agentPathGroup = this.debugGroups.agentPath;
        if (!agentLogic || !agentPathGroup || !agentPathGroup.visible) {
             const agentId = agentLogic?.id || 'unknown'; // Gérer cas où agentLogic est null
             const agentPathName = `AgentPath_${agentId}`;
             const existingPath = agentPathGroup?.getObjectByName(agentPathName);
             if (existingPath) {
                 agentPathGroup.remove(existingPath);
                 if (existingPath.geometry) existingPath.geometry.dispose();
                 if (existingPath.material) existingPath.material.dispose();
             }
             return;
        }
        // Le reste de la logique pour créer/mettre à jour le tube reste identique...
        const agentId = agentLogic.id;
        const agentPathName = `AgentPath_${agentId}`;
        const existingPath = agentPathGroup.getObjectByName(agentPathName);
        if (existingPath) {
             agentPathGroup.remove(existingPath);
             if (existingPath.geometry) existingPath.geometry.dispose();
             if (existingPath.material) existingPath.material.dispose();
        }
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
                 // La position Y est gérée par le groupe parent this.debugGroups.agentPath
                 tubeMesh.renderOrder = this.debugVisualManager.renderOrders.debugLine + 1; // Au-dessus des autres lignes debug
                 agentPathGroup.add(tubeMesh);
             } catch (error) {
                 console.error(`World: Erreur création tube debug pour Agent ${agentId}:`, error);
             }
        }
   }

   destroy() {
        console.log("Destroying World...");
        this.agentManager?.destroy();
        this.agentManager = null;

        // Nettoyer tous les groupes de debug et leurs enfants
        Object.values(this.debugGroups).forEach(group => {
            this.clearGroupChildren(group, true); // Dispose all geometries including specific ones like paths
            if(group.parent) group.parent.remove(group);
        });
        this.debugGroups = {};

        // Le groupe parent de DVM (s'il existe et est différent)
        // est retiré dans CityManager.destroy ou ici s'il est géré séparément
        // this.debugVisualManager?.parentGroup?.removeFromParent(); // Si DVM a son propre groupe parent

        this.cityManager?.destroy(); // CityManager nettoie son propre contenu
        this.cityManager = null;
        this.debugVisualManager = null; // Référence nulle

        this.environment?.destroy();
        this.environment = null;

        console.log("World destroyed.");
    }

    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            await this.cityManager.generateCity();
            console.log("World: Ville générée.");

            const maxAgents = this.cityManager.config.maxAgents ?? 300;
            this.agentManager = new AgentManager(
                this.scene,
                this.experience,
                this.cityManager.config,
                maxAgents
            );
            console.log("World: AgentManager instancié.");

            const navGraph = this.cityManager.getNavigationGraph();
            if (this.agentManager && navGraph) {
                this.agentManager.initializePathfindingWorker(navGraph);
                console.log("World: Initialisation du Pathfinding Worker demandée.");
            } else {
                 console.error("World: Echec initialisation Worker - AgentManager ou NavGraph manquant.");
            }

            this.createAgents(maxAgents);

            // Si le mode debug est actif AU DEMARRAGE, générer les visuels
            if (this.experience.isDebugMode) {
                this.setDebugMode(true); // Applique les visibilités initiales des catégories/sous-types
            } else {
                this.setAllDebugGroupsVisibility(false); // Assurer qu'ils sont cachés
            }

            console.log("World: Initialisation complète.");

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    createAgents(numberOfAgents) {
		if (!this.agentManager) { /* ... erreur ... */ return; }
		if (!this.cityManager?.citizenManager?.buildingInstances || this.cityManager.citizenManager.buildingInstances.size === 0) {
			console.warn("World: Aucun bâtiment enregistré via CitizenManager. Impossible de créer agents avec domicile/travail.");
			// return; // Peut-être créer des agents sans domicile/travail ?
		}
	   console.log(`World: Demande de création de ${numberOfAgents} agents...`);
	   for (let i = 0; i < numberOfAgents; i++) {
			const agent = this.agentManager.createAgent(); // createAgent gère l'enregistrement via CityManager
			if (!agent) {
				console.warn(`World: Echec création agent (max ${this.agentManager.maxAgents} atteint?).`);
				break;
			}
	   }
	   console.log(`World: ${this.agentManager.agents.length} agents logiques créés (demandé: ${numberOfAgents}).`);
   }

   update() {
	   const deltaTime = this.experience.time.delta;
	   this.environment?.update(deltaTime);
	   const currentHour = this.environment?.getCurrentHour() ?? 12;

	   // PlotContentGenerator.update (fenêtres) est géré par CityManager ou ici si besoin
	   if (this.cityManager?.contentGenerator) {
			this.cityManager.contentGenerator.update(currentHour); // Appel via CityManager
	   }
	   if(this.cityManager?.lampPostManager) {
		   this.cityManager.lampPostManager.updateLampPostLights(currentHour); // Appel via CityManager
	   }
	   this.agentManager?.update(deltaTime);
   }
}