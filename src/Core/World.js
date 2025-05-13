// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment/Environment.js';
import CityManager from '../World/City/CityManager.js';
import AgentManager from '../World/Agents/AgentManager.js';
import CarManager from '../World/Vehicles/CarManager.js';
// ... autres imports ...
import DebugVisualManager from '../World/Rendering/DebugVisualManager.js'; // Assurez-vous qu'il est importé

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Managers ---
        this.cityManager = new CityManager(this.experience);
        this.environment = new Environment(this.experience, this);
        this.agentManager = null;
        this.carManager = null; // Gestionnaire de voitures

        // --- Daily Update Tracker ---
        this.lastUpdatedDay = -1; // Initialize with a value indicating no update has occurred

        // --- AJOUT: Sphères de débogage Start/End Node ---
        this.startNodeDebugSphere = null;
        this.endNodeDebugSphere = null;
        // --- FIN AJOUT ---

        // --- NOUVEAU : Groupes de Debug par Catégorie ---
        // Ces groupes contiendront les InstancedMesh *par sous-type*.
        this.debugGroups = {
            district: new THREE.Group(),
            plot: new THREE.Group(),
            buildingOutline: new THREE.Group(),
            navGridPedestrian: new THREE.Group(),
            navGridVehicle: new THREE.Group(),
            agentPath: new THREE.Group(),
            vehiclePath: new THREE.Group()
        };
        this.debugGroups.district.name = "DebugDistrictGrounds";
        this.debugGroups.plot.name = "DebugPlotGrounds";
        this.debugGroups.buildingOutline.name = "DebugBuildingOutlines";
        this.debugGroups.navGridPedestrian.name = "DebugNavGridPedestrian";
        this.debugGroups.navGridVehicle.name = "DebugNavGridVehicle";
        this.debugGroups.agentPath.name = "DebugAgentPaths";
        this.debugGroups.vehiclePath.name = "DebugVehiclePaths";

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
            agentPath: 0.07,
            vehiclePath: 0.08
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
     * OPTIMISÉ : Active ou désactive le mode debug global avec une approche paresseuse (lazy).
     * Les visuels ne sont créés que lorsqu'ils sont nécessaires, réduisant ainsi la charge initiale.
     * @param {boolean} enabled - True pour activer, false pour désactiver.
     */
    setDebugMode(enabled) {
        // Cache pour stocker les visuels déjà créés (lazy initialization)
        if (!this._debugVisualsCache) {
            this._debugVisualsCache = {
                district: null,
                plot: null,
                buildingOutline: null,
                navGridPedestrian: null,
                navGridVehicle: null
            };
        }

        if (!enabled) {
            // Désactivation du mode debug - simple et rapide
            this.setAllDebugGroupsVisibility(false);
            return;
        }
        
        // --- Activation du mode debug ---
        //console.log("  [World Debug] Enabling Debug Mode with lazy loading...");

        if (!this.debugVisualManager) { /* ... erreur DVM manquant ... */ return; }

        // --- Nettoyage des groupes si nécessaire ---
        for (const category in this._debugVisualsCache) {
            this._debugVisualsCache[category] = null; // Marquer comme non généré
            this.clearGroupChildren(this.debugGroups[category]);
        }
        this.clearGroupChildren(this.debugGroups.agentPath);
        this.clearGroupChildren(this.debugGroups.vehiclePath);
        // ---------------------------------------------

        // Activer immédiatement les groupes de debug pour montrer une réponse à l'utilisateur
        this.setAllDebugGroupsVisibility(true);

        // Initialiser les positions des groupes
        this.debugGroups.district.position.y = this.debugHeights.districtGround;
        this.debugGroups.plot.position.y = this.debugHeights.plotGround;
        this.debugGroups.buildingOutline.position.y = this.debugHeights.buildingOutline;
        this.debugGroups.navGridPedestrian.position.y = this.debugHeights.navGrid - 0.01;
        this.debugGroups.navGridVehicle.position.y = this.debugHeights.navGrid + 0.01;
        this.debugGroups.agentPath.position.y = this.debugHeights.agentPath;
        this.debugGroups.vehiclePath.position.y = this.debugHeights.vehiclePath;

        // On n'initialise aucun visuel pour les catégories lourdes
        // Ils seront créés à la demande lorsque l'utilisateur activera chaque catégorie
    }

    /**
     * Génère les visuels de district optimisés (appelé à la demande)
     * @private
     */
    _generateDistrictVisuals() {
        if (!this.cityManager) return;
        
        // Appliquer une limite au nombre de districts pour une performance optimale
        const districts = this.cityManager.getDistricts();
        const maxDistricts = Math.min(districts.length, 200); // Limiter le nombre de districts pour de meilleures performances
        const districtSubset = districts.slice(0, maxDistricts);
        
        // Créer les visuels optimisés pour les districts
        const districtMeshesByType = this.debugVisualManager.createDistrictGroundVisuals(districtSubset, 0);
        for (const type in districtMeshesByType) {
            this.debugGroups.district.add(districtMeshesByType[type]);
            districtMeshesByType[type].visible = this.experience.debugLayerVisibility.district[type] ?? true;
        }
    }
    
    /**
     * Génère les visuels de parcelles optimisés (appelé à la demande)
     * @private
     */
    _generatePlotVisuals() {
        if (!this.cityManager) return;
        
        // Appliquer une limite au nombre de parcelles pour une performance optimale
        const plots = this.cityManager.getPlots();
        const maxPlots = Math.min(plots.length, 500); // Limiter le nombre de parcelles 
        const plotSubset = plots.slice(0, maxPlots);
        
        // Optimisation: minimiser le nombre de passes de rendu en regroupant par type
        const plotsByType = {};
        for (const plot of plotSubset) {
            if (!plotsByType[plot.zoneType]) {
                plotsByType[plot.zoneType] = [];
            }
            plotsByType[plot.zoneType].push(plot);
        }
        
        // Créer les visuels optimisés par type (optimisation par batching)
        const plotMeshesByType = this.debugVisualManager.createPlotGroundVisuals(plotSubset, 0);
        for (const type in plotMeshesByType) {
            this.debugGroups.plot.add(plotMeshesByType[type]);
            plotMeshesByType[type].visible = this.experience.debugLayerVisibility.plot[type] ?? true;
        }
    }
    
    /**
     * Génère les visuels de contours de bâtiments optimisés (appelé à la demande)
     * @private
     */
    _generateBuildingOutlineVisuals() {
        if (!this.cityManager) return;
        
        const buildingInstances = this.cityManager.getBuildingInstances();
        if (!buildingInstances || buildingInstances.size === 0) return;
        
        // Réduire la taille si nécessaire pour les performances
        const maxBuildings = 1000; // Limite pour de meilleures performances
        let limitedInstances = buildingInstances;
        
        if (buildingInstances.size > maxBuildings) {
            // Créer une version limitée de la map pour réduire la charge
            limitedInstances = new Map();
            let count = 0;
            for (const [key, value] of buildingInstances.entries()) {
                if (count >= maxBuildings) break;
                limitedInstances.set(key, value);
                count++;
            }
            //console.log(`[World Debug] Bâtiments limités à ${maxBuildings} sur ${buildingInstances.size} total`);
        }
        
        // Générer les contours de bâtiments avec la map limitée
        const outlineMeshesByType = this.debugVisualManager.createBuildingOutlines(limitedInstances, this.cityManager.config, 0);
        for (const type in outlineMeshesByType) {
            this.debugGroups.buildingOutline.add(outlineMeshesByType[type]);
            outlineMeshesByType[type].visible = this.experience.debugLayerVisibility.buildingOutline[type] ?? true;
        }
    }
    
    /**
     * Génère les visuels de grille de navigation pour piétons (appelé à la demande)
     * @private
     */
    _generateNavGridPedestrianVisuals() {
        if (!this.cityManager || !this.cityManager.navigationManager) return;
        
        // Optimisation: réduire la densité de la grille pour de meilleures performances
        const navGraph = this.cityManager.navigationManager.getNavigationGraph(false);
        if (navGraph) {
            // Définir un mode d'affichage simplifié pour la grille (si implémenté)
            navGraph.debugDisplayDensity = 2; // 1 = normal, 2 = afficher un noeud sur deux, etc.
            navGraph.createDebugVisualization(this.debugGroups.navGridPedestrian);
        }
    }
    
    /**
     * Génère les visuels de grille de navigation pour véhicules (appelé à la demande)
     * @private
     */
    _generateNavGridVehicleVisuals() {
        if (!this.cityManager || !this.cityManager.navigationManager) return;
        
        // Optimisation: réduire la densité de la grille pour de meilleures performances
        const roadGraph = this.cityManager.navigationManager.getNavigationGraph(true);
        if (roadGraph) {
            // Définir un mode d'affichage simplifié pour la grille (si implémenté)
            roadGraph.debugDisplayDensity = 2; // 1 = normal, 2 = afficher un noeud sur deux, etc.
            roadGraph.createDebugVisualization(this.debugGroups.navGridVehicle);
        }
    }

    /**
     * OPTIMISÉ : Définit la visibilité d'un groupe de catégorie principal avec lazy loading.
     * Les visuels sont créés uniquement quand la catégorie est activée pour la première fois.
     * @param {string} categoryName - Nom de la catégorie ('district', 'plot', etc.).
     * @param {boolean} isVisible - True pour afficher, false pour masquer.
     */
    setGroupVisibility(categoryName, isVisible) {
		const targetGroup = this.debugGroups[categoryName];
		if (!targetGroup) {
			console.warn(`World.setGroupVisibility: Unknown category group '${categoryName}'`);
			return;
		}

		// Si on active une catégorie et que ses visuels n'ont pas été générés, les créer maintenant
		if (isVisible && this._debugVisualsCache && this._debugVisualsCache[categoryName] === null) {
			//console.log(`[World Debug] Génération des visuels ${categoryName} à la demande`);
			
			// Générer les visuels appropriés selon la catégorie
			const t0 = performance.now(); // Mesurer le temps de génération
			
			try {
				switch(categoryName) {
					case 'district':
						this._generateDistrictVisuals();
						break;
					case 'plot':
						this._generatePlotVisuals();
						break;
					case 'buildingOutline':
						this._generateBuildingOutlineVisuals();
						break;
					case 'navGridPedestrian':
						this._generateNavGridPedestrianVisuals();
						break;
					case 'navGridVehicle':
						this._generateNavGridVehicleVisuals();
						break;
				}
				
				// Marquer cette catégorie comme générée
				this._debugVisualsCache[categoryName] = true;
				
				// Logs de performance
				const t1 = performance.now();
				//console.log(`[World Debug] Génération de ${categoryName} terminée en ${(t1-t0).toFixed(1)}ms`);
			} catch (error) {
				console.error(`[World Debug] Erreur lors de la génération de ${categoryName}:`, error);
			}
		}
		
		// Appliquer la visibilité
		targetGroup.visible = isVisible;
		
		// Cas spéciaux pour les chemins dynamiques
		if (categoryName === 'agentPath' && isVisible && this.agentManager) {
			// Nettoyer d'abord les anciens chemins
			this.clearDebugAgentPaths();
			
			// Optimisation: limiter le nombre de chemins à afficher si trop d'agents
			const maxPathsToShow = 50; // Limiter le nombre de chemins pour éviter les performances lentes
			const agents = this.agentManager.agents;
			const numAgents = Math.min(agents.length, maxPathsToShow);
			
			for (let i = 0; i < numAgents; i++) {
				const agent = agents[i];
				if (agent?.currentPathPoints?.length > 1) {
					this.setAgentPathForAgent(agent, agent.currentPathPoints, 0xff00ff);
				}
			}
			//console.log(`[World Debug] ${numAgents} chemins de piétons rafraîchis`);
		}
		
		if (categoryName === 'vehiclePath' && isVisible && this.carManager) {
			// Nettoyer d'abord les anciens chemins
			this.clearDebugVehiclePaths();
			
			// Optimisation: limiter le nombre de chemins à afficher
			const maxPathsToShow = 30;
			const cars = this.carManager.cars;
			const numCars = Math.min(cars.length, maxPathsToShow);
			
			let pathsCreated = 0;
			for (let i = 0; i < numCars; i++) {
				const car = cars[i];
				if (car?.isActive && car?.path?.length > 1) {
					this.setVehiclePathForCar(car, car.path, 0x00ffff);
					pathsCreated++;
				}
			}
			//console.log(`[World Debug] ${pathsCreated} chemins de véhicules rafraîchis`);
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
            console.warn(`[World] setSubLayerMeshVisibility: Group for category '${categoryName}' not found.`);
            return;
        }
        const targetMesh = targetGroup.children.find(child => child.userData?.subType === subTypeName || child.name.endsWith(`_${subTypeName}`));

        if (targetMesh) {
            //console.log(`[World] Setting visibility for ${categoryName}.${subTypeName} (Mesh: ${targetMesh.name}) to ${isVisible}`);
            targetMesh.visible = isVisible;
        } else {
            console.warn(`[World] setSubLayerMeshVisibility: Mesh for subType '${subTypeName}' not found in category '${categoryName}'.`);
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
            case 'vehiclePath':     targetGroup = this.debugVehiclePathGroup; break;
            default:
                console.warn(`World.setLayerVisibility: Unknown layer name '${layerName}'`);
                return;
        }
        if (targetGroup) {
            targetGroup.visible = isVisible;
            // //console.log(`  [World Debug] Layer '${layerName}' visibility set to ${isVisible}`);
        }
    }

    clearDebugAgentPaths() {
        this.clearGroupChildren(this.debugGroups.agentPath);
    }

    clearDebugVehiclePaths() {
        this.clearGroupChildren(this.debugGroups.vehiclePath);
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

   setVehiclePathForCar(car, pathPoints, pathColor = 0x00ffff) {
        if (!this.debugVisualManager || !pathPoints || !Array.isArray(pathPoints) || pathPoints.length < 2) {
            console.warn("SetVehiclePath: Données invalides ou DebugVisualManager absent.", pathPoints);
            return;
        }

        try {
            // Préparer les points et couleurs pour la ligne
            const points = [];
            for (let i = 0; i < pathPoints.length; i++) {
                const point = pathPoints[i].clone();
                // Légèrement au-dessus du sol pour éviter le z-fighting, ajuster selon besoin
                point.y = this.debugHeights.vehiclePath || 0.1;
                points.push(point);
            }

            // Convertir la couleur hexadécimale en THREE.Color
            let color = new THREE.Color(pathColor);

            // Créer la ligne de debug
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: color,
                linewidth: 5.0, // Largeur ligne (ne fonctionne pas bien sur tous les navigateurs)
                // Configurer pour rendre visible par dessus tout (pas d'occultation)
                depthTest: false,
                transparent: true,
                opacity: 0.9 // Légère transparence pour moins gêner la vue
            });

            // Créer la ligne et l'ajouter au groupe vehiclePath
            const line = new THREE.Line(geometry, material);
            line.renderOrder = 10; // Assurer qu'elle est rendue après le reste

            // Ajouter un identifiant unique à partir de l'ID du véhicule
            if (car && car.instanceId) {
                line.name = `VehiclePath_${car.instanceId}`;
                // Enregistrer l'ID du véhicule sur la ligne
                line.userData.carId = car.instanceId;
            }

            // Ajouter au groupe approprié
            this.debugGroups.vehiclePath.add(line);
        } catch (error) {
            console.error("SetVehiclePath: Erreur lors de la création du chemin:", error);
        }
    }

   destroy() {
        //console.log("Destroying World...");
        this.agentManager?.destroy();
        this.agentManager = null;
        
        // Détruire le gestionnaire de voitures
        this.carManager?.destroy();
        this.carManager = null;

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

        //console.log("World destroyed.");
    }

    async initializeWorld() {
        //console.log("World: Initialisation asynchrone...");
        try {
            await this.environment.initialize();
            //console.log("World: Environnement initialisé.");

            await this.cityManager.generateCity();
            //console.log("World: Ville générée.");

            const maxAgents = this.cityManager.config.maxAgents ?? 300;
            this.agentManager = new AgentManager(
                this.scene,
                this.experience,
                this.cityManager.config,
                maxAgents
            );
            //console.log("World: AgentManager instancié.");
            
            // Initialisation du gestionnaire de voitures
            this.carManager = new CarManager(
                this.scene,
                this.experience
            );
            //console.log("World: CarManager instancié.");

            // --- MODIFICATION: Initialiser le worker avec le NavigationManager ---
            // const navGraph = this.cityManager.getNavigationGraph(); // Ancienne méthode
            if (this.agentManager && this.cityManager.navigationManager) {
                this.agentManager.initializePathfindingWorker(this.cityManager.navigationManager);
                //console.log("World: Initialisation du Pathfinding Worker (double grille) demandée.");
            } else {
                 console.error("World: Echec initialisation Worker - AgentManager ou NavigationManager manquant.");
            }
            // --- FIN MODIFICATION ---

            this.createAgents(maxAgents);

            // Préchauffer le cache de chemins pour les trajets fréquents
            const preheatEnabled = this.cityManager.config.preheatPathCache !== false;
            const preheatCount = this.cityManager.config.preheatPathCount || 150; // Augmenté à 150 agents pour préchauffage
            
            if (preheatEnabled && this.agentManager) {
                //console.log(`World: Démarrage du préchauffage du cache pour ${preheatCount} agents...`);
                // Attendre un peu que le worker se stabilise avant de démarrer le préchauffage
                setTimeout(async () => {
                    try {
                        const result = await this.agentManager.preheatCommonPaths(preheatCount);
                        //console.log(`World: Préchauffage du cache terminé. ${result.processedCount} chemins calculés.`);
                        
                        // Afficher les statistiques du cache
                        try {
                            const stats = await this.agentManager.requestCacheStats();
                            //console.log("World: Statistiques du cache après préchauffage:", stats);
                            
                            // Analyse approfondie des performances du cache
                            //console.log("World: Analyse approfondie des performances du cache...");
                            await this.agentManager.analyzePathCachePerformance();
                        } catch (statsError) {
                            console.warn("World: Impossible de récupérer les statistiques du cache:", statsError);
                        }
                    } catch (preheatError) {
                        console.warn("World: Erreur lors du préchauffage du cache:", preheatError);
                    }
                }, 1000);
            }

            // Si le mode debug est actif AU DEMARRAGE, générer les visuels
            if (this.experience.isDebugMode) {
                this.setDebugMode(true); // Applique les visibilités initiales des catégories/sous-types
            } else {
                this.setAllDebugGroupsVisibility(false); // Assurer qu'ils sont cachés
            }

            //console.log("World: Initialisation complète.");

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
	   //console.log(`World: Demande de création de ${numberOfAgents} agents...`);
	   for (let i = 0; i < numberOfAgents; i++) {
			const agent = this.agentManager.createAgent(); // createAgent gère l'enregistrement via CityManager
			if (!agent) {
				console.warn(`World: Echec création agent (max ${this.agentManager.maxAgents} atteint?).`);
				break;
			}
	   }
	   //console.log(`World: ${this.agentManager.agents.length} agents logiques créés (demandé: ${numberOfAgents}).`);
   }

   update() {
		const deltaTime = this.experience.time.delta;
		this.environment?.update(deltaTime);
		const currentHour = this.environment?.getCurrentHour() ?? 12;
		const currentDay = this.environment?.getCurrentCalendarDate()?.jour ?? -1; // Get current day

		// --- Daily Citizen Stats Update ---
		// Check if it's noon (hour 12) and a new day
		if (currentHour === 12 && currentDay !== this.lastUpdatedDay && currentDay !== -1) {
			//console.log(`World: Performing daily citizen stats update for day ${currentDay}`);
			this.cityManager?.citizenManager?.citizens.forEach(citizen => {
				// Calculate happiness based on health and salary (clamped between 0 and 100)
				citizen.happiness = Math.max(0, Math.min(100, (citizen.health + citizen.salary) / 2));

				// Increase health by 1 (max maxHealth)
				citizen.health = Math.min(citizen.maxHealth, citizen.health + 1);

				// Increase money by their salary
				citizen.money += citizen.salary;
			});
			this.lastUpdatedDay = currentDay; // Update the last updated day
			
			// --- AJOUT: Vérification des statistiques du cache chaque jour ---
			if (this.agentManager) {
			    this.agentManager.requestCacheStats()
			        .then(stats => {
			            //console.log(`Cache de chemins - Jour ${currentDay} - Statistiques:`, stats);
			            //console.log(`Taux de succès cache: ${stats.hitRate} (${stats.hits} hits, ${stats.nearHits} nearHits sur ${stats.size} chemins stockés)`);
			        })
			        .catch(err => console.warn("Impossible de récupérer les stats du cache:", err));
			}
			// --- FIN AJOUT ---
		}

		// Mise à jour du cityManager avec deltaTime pour la gestion de la santé des citoyens
		if (this.cityManager) {
			this.cityManager.update(deltaTime);
		}

		// PlotContentGenerator.update (fenêtres) est géré par CityManager ou ici si besoin
		if (this.cityManager?.contentGenerator) {
				this.cityManager.contentGenerator.update(currentHour); // Appel via CityManager
		}
		if(this.cityManager?.lampPostManager) {
			this.cityManager.lampPostManager.updateLampPostLights(currentHour); // Appel via CityManager
		}
		if(this.carManager) {
			this.carManager.updateCarLights(currentHour); // Mise à jour des phares des voitures
		}
		this.carManager?.update(deltaTime); // Mettre à jour les voitures
		this.agentManager?.update(deltaTime);
	}

    // --- AJOUT: Méthodes pour afficher les sphères de débogage ---
    showStartNodeDebugSphere(position) {
        if (!this.startNodeDebugSphere) {
            const geometry = new THREE.SphereGeometry(7, 16, 8); // Sphère plus grosse
            const material = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true });
            this.startNodeDebugSphere = new THREE.Mesh(geometry, material);
            this.startNodeDebugSphere.name = "Debug_StartNodeSphere";
            this.scene.add(this.startNodeDebugSphere);
        }
        this.startNodeDebugSphere.position.copy(position);
        this.startNodeDebugSphere.position.y += 0.5; // Légèrement surélevée
        this.startNodeDebugSphere.visible = true;
        //console.log(`[World Debug] Affichage Sphère Start Node Bleue à: ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`);
    }

    showEndNodeDebugSphere(position) {
        if (!this.endNodeDebugSphere) {
            const geometry = new THREE.SphereGeometry(7, 16, 8); // Sphère plus grosse
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
            this.endNodeDebugSphere = new THREE.Mesh(geometry, material);
            this.endNodeDebugSphere.name = "Debug_EndNodeSphere";
            this.scene.add(this.endNodeDebugSphere);
        }
        this.endNodeDebugSphere.position.copy(position);
        this.endNodeDebugSphere.position.y += 0.5; // Légèrement surélevée
        this.endNodeDebugSphere.visible = true;
        //console.log(`[World Debug] Affichage Sphère End Node Verte à: ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`);
    }
    // --- FIN AJOUT ---

    /**
     * Expose NavigationManager for Cars to adjust path
     */
    get navigationManager() {
        return this.cityManager.navigationManager;
    }
    /**
     * Expose roadNavigationGraph for Cars fallback
     */
    get roadNavigationGraph() {
        return this.cityManager.navigationManager?.roadNavigationGraph;
    }
}