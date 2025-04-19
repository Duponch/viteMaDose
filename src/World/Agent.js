// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

// Les états restent les mêmes logiquement
const AgentState = {
    AT_HOME: 'AT_HOME',
    PREPARING_TO_LEAVE_FOR_WORK: 'PREPARING_TO_LEAVE_FOR_WORK', // État optionnel, non utilisé ici
    REQUESTING_PATH_FOR_WORK: 'REQUESTING_PATH_FOR_WORK', // En attente du résultat du worker
    READY_TO_LEAVE_FOR_WORK: 'READY_TO_LEAVE_FOR_WORK', // Path reçu, attend l'heure de départ
    IN_TRANSIT_TO_WORK: 'IN_TRANSIT_TO_WORK',
    AT_WORK: 'AT_WORK',
    PREPARING_TO_LEAVE_FOR_HOME: 'PREPARING_TO_LEAVE_FOR_HOME', // État optionnel, non utilisé ici
    REQUESTING_PATH_FOR_HOME: 'REQUESTING_PATH_FOR_HOME', // En attente du résultat du worker
    READY_TO_LEAVE_FOR_HOME: 'READY_TO_LEAVE_FOR_HOME', // Path reçu, attend l'heure de départ
    IN_TRANSIT_TO_HOME: 'IN_TRANSIT_TO_HOME',
    IDLE: 'IDLE', // État initial ou si domicile/travail non trouvé
};

export default class Agent {
    // --- MODIFICATION : Ajout de agentManager dans le constructeur ---
    constructor(config, instanceId, experience) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) { throw new Error(`Agent ${this.id}: Experience instance is required!`); }
        this.experience = experience;
        // --- MODIFICATION : Stocker la référence à AgentManager ---
        this.agentManager = config.agentManager; // Récupérer depuis config
        if (!this.agentManager) { throw new Error(`Agent ${this.id}: AgentManager instance is required in config!`); }
        // -------------------------------------------------------

        // --- Propriétés Configuration & Base ---
        this.scale = config.scale ?? 0.1;
        this.agentBaseSpeed = (config.speed ?? 1.5);
        // La vitesse visuelle peut varier légèrement pour chaque agent
        this.visualSpeed = this.agentBaseSpeed * (0.9 + Math.random() * 0.2);
        this.rotationSpeed = config.rotationSpeed ?? 8.0;
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.5; // Tolérance pour atteindre un point du chemin
        this.reachToleranceSq = this.reachTolerance * this.reachTolerance;

        // --- Position & Orientation (Visuel) ---
        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false; // Caché initialement

        // --- État & Planification ---
        this.currentState = AgentState.IDLE;
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null; // Position MONDE du domicile
        this.workPosition = null; // Position MONDE du travail
        // --- SUPPRESSION : homeGridNode et workGridNode ne sont plus nécessaires ---
        // this.homeGridNode = null;
        // this.workGridNode = null;
        // -----------------------------------------------------------------------

        // --- Trajet Actuel ---
        this.currentPathPoints = null;        // Sera un Array<THREE.Vector3>
        this.calculatedTravelDurationGame = 0;// Durée calculée en ms JEU
        this.departureTimeGame = -1;          // Heure de départ effective en ms JEU
        this.arrivalTmeGame = -1;             // Heure d'arrivée prévue en ms JEU
        this.currentPathLengthWorld = 0;      // Longueur réelle du chemin en unités monde
        this.currentPathIndexVisual = 0;      // Index dans currentPathPoints pour le déplacement
        this.visualInterpolationProgress = 0; // Progrès [0,1] sur le segment actuel (non utilisé avec la nouvelle logique)

        // --- Heures & Délais (Planification) ---
        // Heures fixes (pourraient être rendues variables par agent)
        this.departureWorkHour = 8;
        this.departureHomeHour = 19;
        // --- SUPPRESSION : anticipationMinutes n'est plus utilisé directement ici ---
        // this.anticipationMinutes = 5;
        // Temps calculés en ms Jeu (initialisés par _calculateScheduledTimes)
        // --- MODIFICATION : renommé prepare... en request... pour clarifier ---
        this.requestWorkPathTimeGame = -1;
        this.requestHomePathTimeGame = -1;
        // ---------------------------------------------------------------
        this.exactWorkDepartureTimeGame = -1;
        this.exactHomeDepartureTimeGame = -1;

        // Temps de référence pour éviter les boucles de requêtes
		this.lastArrivalTimeHome = 0;
		this.lastArrivalTimeWork = -1;
		this.lastPathRequestTimeGame = -1; // Pour éviter spam de requêtes si échec rapide
        this.MIN_RETRY_DELAY_MS = 5000; // Attendre 5s (jeu) avant nouvelle requête si échec

        // --- Animation Visuelle (INCHANGÉ) ---
        this.currentAnimationMatrix = {
            head: new THREE.Matrix4(), torso: new THREE.Matrix4(),
            leftHand: new THREE.Matrix4(), rightHand: new THREE.Matrix4(),
            leftFoot: new THREE.Matrix4(), rightFoot: new THREE.Matrix4(),
        };

        // --- Variables temporaires (INCHANGÉ) ---
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempMatrix = new THREE.Matrix4();

        // Calcul initial des heures planifiées
        this._calculateScheduledTimes();
    }

    _calculateScheduledTimes() {
        const environment = this.experience.world?.environment;
        if (!environment || !environment.isInitialized || environment.dayDurationMs <= 0) {
             console.warn(`Agent ${this.id}: Impossible de calculer les heures planifiées (env non prêt).`);
             this.requestWorkPathTimeGame = -1;
             this.requestHomePathTimeGame = -1;
             this.exactWorkDepartureTimeGame = -1;
             this.exactHomeDepartureTimeGame = -1;
             return;
        }
        const dayDurationMs = environment.dayDurationMs;
        const msPerHour = dayDurationMs / 24;
        // Pas besoin de msPerMinute ici

        // Heure exacte de départ travail (ex: 8h00)
        this.exactWorkDepartureTimeGame = this.departureWorkHour * msPerHour;
        // Heure exacte de départ maison (ex: 19h00)
        this.exactHomeDepartureTimeGame = this.departureHomeHour * msPerHour;

        // --- MODIFICATION : Heure de DEMANDE de chemin (peut être la même que départ ou un peu avant) ---
        // Ici, on demande au moment du départ prévu pour simplifier. On pourrait ajouter une anticipation.
        this.requestWorkPathTimeGame = this.exactWorkDepartureTimeGame;
        this.requestHomePathTimeGame = this.exactHomeDepartureTimeGame;
        // -----------------------------------------------------------------------------------------

        // console.log(`Agent ${this.id} Scheduled Times (ms): RequestWork=${this.requestWorkPathTimeGame.toFixed(0)}, DepartWork=${this.exactWorkDepartureTimeGame.toFixed(0)}, RequestHome=${this.requestHomePathTimeGame.toFixed(0)}, DepartHome=${this.exactHomeDepartureTimeGame.toFixed(0)}`);
    }

    /**
     * Initialise la position et l'état de l'agent basé sur son domicile et travail.
     * Snappe les positions au NavMesh le plus proche.
     */
    initializeLifecycle(homeId, workId) {
        this.homeBuildingId = homeId;
        this.workBuildingId = workId;
        const cityManager = this.experience.world?.cityManager;
        const navMeshManager = cityManager?.navMeshManager;
        const plots = cityManager?.getPlots() || [];
        const config = cityManager?.config; // Récupérer la config

        if (!navMeshManager || !config) {
             console.error(`Agent ${this.id}: NavMeshManager or Config not found during init.`);
             this.currentState = AgentState.IDLE; this.isVisible = false; return;
        }

        const homeInfo = cityManager?.getBuildingInfo(this.homeBuildingId);
        const homePlot = homeInfo ? plots.find(p => p.id === homeInfo.plotId) : null;

        if (homeInfo && homePlot) {
            // --- Utiliser la NOUVELLE méthode pour trouver le point d'entrée ---
            const entryPoint = this.findEntryPointOnSidewalk(homeInfo, homePlot, navMeshManager, config);
            if (entryPoint) {
                 this.homePosition = entryPoint;
            } else {
                 // Si même la nouvelle méthode échoue, on a un gros souci. Utiliser le centre comme dernier recours.
                 console.error(`Agent ${this.id}: CRITICAL FAILURE obtaining home entry point even after sampling. Setting to plot center.`);
                 this.homePosition = homePlot.center.clone();
                 this.homePosition.y = config.sidewalkHeight ?? 0.2;
            }
            // -----------------------------------------------------------------

            this.position.copy(this.homePosition);
            this.position.y += this.yOffset;
            this.currentState = AgentState.AT_HOME;
            this.isVisible = false;
            this.lastArrivalTimeHome = 0;

        } else { /* ... gestion erreur domicile ... */
            console.error(`Agent ${this.id}: Home building info (${this.homeBuildingId}) or its plot not found.`);
            this.currentState = AgentState.IDLE; this.isVisible = false; return;
         }

        const workInfo = cityManager?.getBuildingInfo(this.workBuildingId);
        const workPlot = workInfo ? plots.find(p => p.id === workInfo.plotId) : null;

        if (workInfo && workPlot) {
             // --- Utiliser la NOUVELLE méthode pour trouver le point d'entrée ---
             const entryPoint = this.findEntryPointOnSidewalk(workInfo, workPlot, navMeshManager, config);
             if (entryPoint) {
                  this.workPosition = entryPoint;
             } else {
                  console.error(`Agent ${this.id}: CRITICAL FAILURE obtaining work entry point even after sampling. Setting to plot center.`);
                  this.workPosition = workPlot.center.clone();
                  this.workPosition.y = config.sidewalkHeight ?? 0.2;
             }
             // -----------------------------------------------------------------
        } else { /* ... gestion erreur travail ... */
             console.warn(`Agent ${this.id}: Work building info (${this.workBuildingId}) or its plot not found.`);
             this.workPosition = null;
         }

        this._calculateScheduledTimes();
    }

    /**
     * Met à jour la machine d'état de l'agent en fonction de l'heure et demande des chemins si nécessaire.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentHour - Heure actuelle du jeu (0-23).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
	updateState(deltaTime, currentHour, currentGameTime) {
        const departWorkTime = this.requestWorkPathTimeGame; // Utiliser l'heure de requête
        const departHomeTime = this.requestHomePathTimeGame;
        const dayDurationMs = this.experience.world?.environment?.dayDurationMs;

        if (!dayDurationMs || dayDurationMs <= 0 || departWorkTime < 0 || departHomeTime < 0 ) {
            if (this.currentState !== AgentState.IDLE) {
                this.currentState = AgentState.IDLE;
                this.isVisible = false;
            }
            return;
        }

        // Initialisation paresseuse
        if (this.lastArrivalTimeHome === undefined) this.lastArrivalTimeHome = 0;
        if (this.lastArrivalTimeWork === undefined) this.lastArrivalTimeWork = -1;
        if (this.lastPathRequestTimeGame === undefined) this.lastPathRequestTimeGame = -1;

        // --- Machine d'état ---
        switch (this.currentState) {
            case AgentState.AT_HOME:
                this.isVisible = false;
                let nextScheduledRequestWork = departWorkTime;
                while (nextScheduledRequestWork <= this.lastArrivalTimeHome) {
                    nextScheduledRequestWork += dayDurationMs;
                }

                // Vérifier s'il est temps de demander le chemin ET si on n'a pas fait de requête récemment
                if (currentGameTime >= nextScheduledRequestWork && currentGameTime >= this.lastPathRequestTimeGame + this.MIN_RETRY_DELAY_MS) {
                    // --- Utilise maintenant this.homePosition et this.workPosition (points d'entrée) ---
                    if (this.workPosition && this.homePosition) {
                        this.lastPathRequestTimeGame = currentGameTime;
                        this.currentState = AgentState.REQUESTING_PATH_FOR_WORK;

                        this.agentManager.requestPath(this.id, this.homePosition, this.workPosition) // Utilise les points d'entrée
                            .then(({ path, pathLength }) => {
                                if (this.currentState === AgentState.REQUESTING_PATH_FOR_WORK) {
                                    if (path && pathLength > 0.1) {
                                        // Stocker le chemin reçu tel quel, sans modification
                                        this.currentPathPoints = path;
                                        this.currentPathLengthWorld = pathLength;
                                        
                                        // Nettoyer tout visualiseur de debug précédent
                                        this._clearDebugVisualizer();
                                        this._debugPathVisualized = false;
                                        
                                        // Recalculer la durée totale du trajet basée sur la longueur du chemin
                                        const travelSecondsGame = pathLength / this.agentBaseSpeed;
                                        const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
                                        this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
                                        this.currentState = AgentState.READY_TO_LEAVE_FOR_WORK;
                                        console.log(`Agent ${this.id}: Path TO WORK received with ${path.length} points. Length=${pathLength.toFixed(1)}, Duration=${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                                    } else {
                                        console.warn(`Agent ${this.id}: Path TO WORK received but invalid (path: ${path ? 'Array['+path.length+']' : 'null'}, length: ${pathLength}). Reverting to AT_HOME.`);
                                        this.currentState = AgentState.AT_HOME;
                                    }
                                } else { console.warn(`Agent ${this.id}: Path TO WORK received, but state is now ${this.currentState}. Ignoring path.`); }
                            })
                            .catch(error => {
                                if (this.currentState === AgentState.REQUESTING_PATH_FOR_WORK) {
                                     console.error(`Agent ${this.id}: Pathfinding TO WORK failed: ${error.message}. Reverting to AT_HOME.`);
                                     this.currentState = AgentState.AT_HOME;
                                } else { console.warn(`Agent ${this.id}: Pathfinding TO WORK failed, but state is now ${this.currentState}. Ignoring error.`); }
                            });
                    } else { 
                         if (currentGameTime >= this.lastPathRequestTimeGame + this.MIN_RETRY_DELAY_MS) {
                             console.warn(`Agent ${this.id}: Cannot request work path at ${currentGameTime.toFixed(0)} due to missing entry points (home or work).`);
                             this.lastPathRequestTimeGame = currentGameTime; 
                         }
                    }
                }
                break;

            case AgentState.AT_WORK:
                 this.isVisible = false;
                 if (this.lastArrivalTimeWork < 0) this.lastArrivalTimeWork = currentGameTime;

                let nextScheduledRequestHome = departHomeTime;
                while (nextScheduledRequestHome <= this.lastArrivalTimeWork) {
                    nextScheduledRequestHome += dayDurationMs;
                }

                if (currentGameTime >= nextScheduledRequestHome && currentGameTime >= this.lastPathRequestTimeGame + this.MIN_RETRY_DELAY_MS) {
                     if (this.homePosition && this.workPosition) {
                         this.lastPathRequestTimeGame = currentGameTime;
                         this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;

                         this.agentManager.requestPath(this.id, this.workPosition, this.homePosition)
                             .then(({ path, pathLength }) => {
                                 if (this.currentState === AgentState.REQUESTING_PATH_FOR_HOME) {
                                     if (path && pathLength > 0.1) {
                                         // Stocker le chemin reçu tel quel, sans modification
                                         this.currentPathPoints = path;
                                         this.currentPathLengthWorld = pathLength;
                                         
                                         // Nettoyer tout visualiseur de debug précédent
                                         this._clearDebugVisualizer();
                                         this._debugPathVisualized = false;
                                         
                                         // Recalculer la durée totale du trajet basée sur la longueur du chemin
                                         const travelSecondsGame = pathLength / this.agentBaseSpeed;
                                         const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
                                         this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
                                         this.currentState = AgentState.READY_TO_LEAVE_FOR_HOME;
                                         console.log(`Agent ${this.id}: Path TO HOME received with ${path.length} points. Length=${pathLength.toFixed(1)}, Duration=${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                                     } else {
                                         console.warn(`Agent ${this.id}: Path TO HOME received but invalid. Reverting to AT_WORK.`);
                                         this.currentState = AgentState.AT_WORK;
                                     }
                                 } else { console.warn(`Agent ${this.id}: Path TO HOME received, but state is now ${this.currentState}. Ignoring path.`); }
                             })
                             .catch(error => {
                                 if (this.currentState === AgentState.REQUESTING_PATH_FOR_HOME) {
                                      console.error(`Agent ${this.id}: Pathfinding TO HOME failed: ${error.message}. Reverting to AT_WORK.`);
                                      this.currentState = AgentState.AT_WORK;
                                 } else { console.warn(`Agent ${this.id}: Pathfinding TO HOME failed, but state is now ${this.currentState}. Ignoring error.`); }
                             });
                     } else { 
                           if (currentGameTime >= this.lastPathRequestTimeGame + this.MIN_RETRY_DELAY_MS) {
                             console.warn(`Agent ${this.id}: Cannot request home path at ${currentGameTime.toFixed(0)} due to missing entry points (home or work).`);
                             this.lastPathRequestTimeGame = currentGameTime;
                           }
                     }
                }
                break;

            // ... (autres états: REQUESTING, READY_TO_LEAVE, IN_TRANSIT, IDLE inchangés) ...
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
                this.isVisible = false; // Reste caché pendant l'attente
                break;
            case AgentState.READY_TO_LEAVE_FOR_WORK:
                 this.isVisible = false;
                 if (!this.currentPathPoints || this.currentPathLengthWorld <= 0) { console.warn(`Agent ${this.id}: In READY_TO_LEAVE_FOR_WORK but path invalid. Reverting to AT_HOME.`); this.currentState = AgentState.AT_HOME; this.lastArrivalTimeHome = currentGameTime; this.lastPathRequestTimeGame = -1; break; }
                 let effectiveDepTimeW = this.exactWorkDepartureTimeGame;
                  while (effectiveDepTimeW + dayDurationMs <= currentGameTime) { effectiveDepTimeW += dayDurationMs; }
                 if (currentGameTime >= effectiveDepTimeW) { 
                     this.departureTimeGame = effectiveDepTimeW; 
                     this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame; 
                     this.currentState = AgentState.IN_TRANSIT_TO_WORK; 
                     this.isVisible = true; 
                     this.currentPathIndexVisual = 0;
                     const departHourW = Math.floor((this.departureTimeGame % dayDurationMs) / (dayDurationMs / 24)); 
                     const agentManagerW = this.agentManager; 
                     if (agentManagerW?.stats?.pathsToWorkByHour) { 
                         agentManagerW.stats.pathsToWorkByHour[departHourW] = (agentManagerW.stats.pathsToWorkByHour[departHourW] || 0) + 1; 
                     }
                 }
                 break;
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                 this.isVisible = false;
                 if (!this.currentPathPoints || this.currentPathLengthWorld <= 0) { console.warn(`Agent ${this.id}: In READY_TO_LEAVE_FOR_HOME but path invalid. Reverting to AT_WORK.`); this.currentState = AgentState.AT_WORK; this.lastArrivalTimeWork = currentGameTime; this.lastPathRequestTimeGame = -1; break; }
                 let effectiveDepTimeH = this.exactHomeDepartureTimeGame;
                  while (effectiveDepTimeH + dayDurationMs <= currentGameTime) { effectiveDepTimeH += dayDurationMs; }
                 if (currentGameTime >= effectiveDepTimeH) { 
                     this.departureTimeGame = effectiveDepTimeH; 
                     this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame; 
                     this.currentState = AgentState.IN_TRANSIT_TO_HOME; 
                     this.isVisible = true; 
                     this.currentPathIndexVisual = 0;
                     const departHourH = Math.floor((this.departureTimeGame % dayDurationMs) / (dayDurationMs / 24)); 
                     const agentManagerH = this.agentManager; 
                     if (agentManagerH?.stats?.pathsToHomeByHour) { 
                         agentManagerH.stats.pathsToHomeByHour[departHourH] = (agentManagerH.stats.pathsToHomeByHour[departHourH] || 0) + 1; 
                     }
                 }
                 break;
            case AgentState.IN_TRANSIT_TO_WORK:
            case AgentState.IN_TRANSIT_TO_HOME:
                 this.isVisible = true;
                 if (this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame) { 
                    const destinationState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME;
                    this.currentState = destinationState;
                    if (destinationState === AgentState.AT_WORK) { 
                        this.lastArrivalTimeWork = this.arrivalTmeGame; 
                        if (this.workPosition) { 
                            this.position.copy(this.workPosition); 
                            this.position.y += this.yOffset; 
                        }
                    } else { 
                        this.lastArrivalTimeHome = this.arrivalTmeGame; 
                        if (this.homePosition) { 
                            this.position.copy(this.homePosition); 
                            this.position.y += this.yOffset; 
                        }
                    }
                    
                    // Nettoyer les visualisations de debug à l'arrivée
                    this._clearDebugVisualizer();
                    
                    this.isVisible = false; 
                    this.lastPathRequestTimeGame = -1; 
                    this.currentPathPoints = null; 
                    this.departureTimeGame = -1; 
                    this.arrivalTmeGame = -1; 
                    this.calculatedTravelDurationGame = 0; 
                    this.currentPathLengthWorld = 0;
                 }
                 break;
            case AgentState.IDLE:
                 this.isVisible = false;
                 if (!this.homePosition && this.homeBuildingId && this.experience.world?.cityManager) { 
                     this.initializeLifecycle(this.homeBuildingId, this.workBuildingId); 
                 }
                 break;

        } // Fin switch
    } // Fin updateState

    /**
     * Nettoie les visualiseurs de debug du chemin
     * @private
     */
    _clearDebugVisualizer() {
        if (this._debugPathLine) {
            this._debugPathLine.geometry.dispose();
            this._debugPathLine.material.dispose();
            this.experience.scene.remove(this._debugPathLine);
            this._debugPathLine = null;
        }
        
        if (this._debugPathPoints && this._debugPathPoints.length > 0) {
            this._debugPathPoints.forEach(sphere => {
                sphere.geometry.dispose();
                sphere.material.dispose();
                this.experience.scene.remove(sphere);
            });
            this._debugPathPoints = [];
        }
        
        this._debugPathVisualized = false;
    }

	/**
     * Trouve le point d'entrée le plus probable sur le NavMesh (trottoir)
     * pour un bâtiment donné sur une parcelle, en testant plusieurs points.
     * @param {object} buildingInfo - Informations sur le bâtiment (nécessite au moins position).
     * @param {object} plot - La parcelle contenant le bâtiment (Plot instance).
     * @param {object} navMeshManager - L'instance de NavMeshManager.
     * @param {object} config - La configuration globale (pour sidewalkWidth, sidewalkHeight).
     * @returns {THREE.Vector3 | null} La position snappée sur le NavMesh ou null si échec.
     */
    findEntryPointOnSidewalk(buildingInfo, plot, navMeshManager, config) {
        if (!buildingInfo || !plot || !navMeshManager || !config) { 
            console.warn(`Agent ${this.id}: Arguments invalides pour findEntryPointOnSidewalk`);
            return null; 
        }

        const buildingPos = buildingInfo.position;
        const sidewalkWidth = config.sidewalkWidth ?? 2.0;
        const sidewalkHeight = config.sidewalkHeight ?? 0.2;
        const halfSidewalk = sidewalkWidth / 2;

        // SOLUTION TEMPORAIRE: Ignorer la recherche NavMesh et retourner toujours un point valide
        
        // 1. Trouver le bord le plus proche (comme avant)
        const distToTop = Math.abs(buildingPos.z - plot.z);
        const distToBottom = Math.abs(buildingPos.z - (plot.z + plot.depth));
        const distToLeft = Math.abs(buildingPos.x - plot.x);
        const distToRight = Math.abs(buildingPos.x - (plot.x + plot.width));
        const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

        // 2. Calculer le point sur le trottoir adjacent
        const entryPoint = new THREE.Vector3();
        
        if (minDist === distToTop) {
            // Point sur le trottoir du haut
            entryPoint.x = buildingPos.x;
            entryPoint.z = plot.z - halfSidewalk;
        } else if (minDist === distToBottom) {
            // Point sur le trottoir du bas
            entryPoint.x = buildingPos.x;
            entryPoint.z = plot.z + plot.depth + halfSidewalk;
        } else if (minDist === distToLeft) {
            // Point sur le trottoir de gauche
            entryPoint.x = plot.x - halfSidewalk;
            entryPoint.z = buildingPos.z;
        } else { // distToRight is min
            // Point sur le trottoir de droite
            entryPoint.x = plot.x + plot.width + halfSidewalk;
            entryPoint.z = buildingPos.z;
        }
        
        // Fixer la hauteur à celle du trottoir
        entryPoint.y = sidewalkHeight;
        
        // Créer un marqueur visible pour le point d'entrée (pour debug)
        const markerGeom = new THREE.SphereGeometry(0.5, 8, 8);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
        const markerMesh = new THREE.Mesh(markerGeom, markerMat);
        markerMesh.position.copy(entryPoint);
        markerMesh.renderOrder = 999;
        this.experience.scene.add(markerMesh);
        
        // Retourner directement le point calculé sans faire de snapping NavMesh
        return entryPoint;
    } // Fin findEntryPointOnSidewalk

    /**
     * Met à jour la position et l'orientation visuelle de l'agent le long du chemin.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
	updateVisuals(deltaTime, currentGameTime) {
        // Ne rien faire si pas en transit ou si le chemin est invalide
        if (this.currentState !== AgentState.IN_TRANSIT_TO_WORK && this.currentState !== AgentState.IN_TRANSIT_TO_HOME) {
            // Si AT_HOME ou AT_WORK, s'assurer que la position est correcte (même si invisible)
            if (this.currentState === AgentState.AT_HOME && this.homePosition) {
                this.position.copy(this.homePosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                 this.position.copy(this.workPosition).setY(this.yOffset);
            }
            return;
        }
        
        if (!this.currentPathPoints || this.currentPathPoints.length === 0 || this.calculatedTravelDurationGame <= 0 || this.departureTimeGame < 0 || this.currentPathLengthWorld <= 0) {
            // Sécurité : si on est en transit mais sans chemin valide, on ne bouge pas. L'état devrait se corriger.
            return;
        }

        // Calculer la progression sur le chemin total [0, 1]
        const elapsedTimeSinceDeparture = Math.max(0, currentGameTime - this.departureTimeGame); // Assurer non négatif
        let progress = Math.min(1, elapsedTimeSinceDeparture / this.calculatedTravelDurationGame); // Clamp [0, 1]

        // Identifier le segment actuel du chemin et la position sur ce segment
        if (this.currentPathPoints.length <= 1) {
            // Cas spécial : chemin d'un seul point (devrait être rare)
            this.position.copy(this.currentPathPoints[0]);
            this.currentPathIndexVisual = 0;
        } else {
            // Calculer la longueur totale du chemin
            let totalPathLength = 0;
            const segmentLengths = [];
            
            // Pré-calculer les longueurs de segments
            for (let i = 0; i < this.currentPathPoints.length - 1; i++) {
                const length = this.currentPathPoints[i].distanceTo(this.currentPathPoints[i+1]);
                segmentLengths.push(length);
                totalPathLength += length;
            }
            
            // Déterminer la distance parcourue basée sur le progrès
            const targetDistance = progress * totalPathLength;
            
            // Trouver le segment actuel
            let distanceTraveled = 0;
            let segmentIndex = 0;
            let segmentProgress = 0;
            
            for (let i = 0; i < segmentLengths.length; i++) {
                if (distanceTraveled + segmentLengths[i] >= targetDistance) {
                    // Ce segment contient le point cible
                    segmentIndex = i;
                    segmentProgress = (targetDistance - distanceTraveled) / segmentLengths[i];
                    break;
                }
                distanceTraveled += segmentLengths[i];
                // Si on arrive à la fin et qu'on n'a pas encore dépassé targetDistance
                if (i === segmentLengths.length - 1) {
                    segmentIndex = i;
                    segmentProgress = 1.0; // Fin du dernier segment
                }
            }
            
            // Interpoler la position entre les points du segment
            const p1 = this.currentPathPoints[segmentIndex];
            const p2 = this.currentPathPoints[segmentIndex + 1];
            
            // Interpolation linéaire entre p1 et p2 selon segmentProgress
            this.position.copy(p1).lerp(p2, segmentProgress);
            
            // Garder trace du segment actuel pour l'orientation
            this.currentPathIndexVisual = segmentIndex;
            
            // DEBUG: Visualiser le chemin si en mode debug
            if (this.experience.isDebugMode && !this._debugPathVisualized) {
                this._visualizePathForDebug();
                this._debugPathVisualized = true;
            }
        }

        // Appliquer l'offset vertical
        this.position.y += this.yOffset;

        // --- Calcul de l'Orientation ---
        // Regarder vers le point suivant du chemin
        let lookAtIndex = this.currentPathIndexVisual + 1;
        // Si on est au dernier segment, regarder le dernier point
        if (lookAtIndex >= this.currentPathPoints.length) {
            lookAtIndex = this.currentPathPoints.length - 1;
        }
        
        const lookTargetPoint = this.currentPathPoints[lookAtIndex];
        this._tempV3_1.copy(lookTargetPoint).setY(this.position.y); // Garder la même hauteur Y pour lookAt

        // Orienter l'agent seulement s'il y a une distance significative à la cible
        if (this.position.distanceToSquared(this._tempV3_1) > 0.01) {
            this._tempMatrix.lookAt(this.position, this._tempV3_1, THREE.Object3D.DEFAULT_UP);
            this._tempQuat.setFromRotationMatrix(this._tempMatrix);
            
            // Interpolation douce (Slerp) vers l'orientation cible
            const deltaSeconds = deltaTime / 1000.0;
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds); // Indépendant du framerate
            this.orientation.slerp(this._tempQuat, slerpAlpha);
        }

        // Mise à jour de l'animation de marche
        this._updateWalkAnimation(currentGameTime / 1000);
    }
    
    /**
     * Visualise le chemin pour le debug
     * @private
     */
    _visualizePathForDebug() {
        if (!this.currentPathPoints || this.currentPathPoints.length < 2) return;
        
        // Créer une ligne pour visualiser le chemin
        const pathGeometry = new THREE.BufferGeometry();
        const points = [];
        
        // Extraire tous les points du chemin
        this.currentPathPoints.forEach(point => {
            points.push(point.x, point.y + 0.1, point.z); // Légèrement au-dessus du sol
        });
        
        // Définir les attributs de la géométrie
        pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        
        // Créer un matériau pour la ligne (utiliser la couleur de l'agent)
        const pathMaterial = new THREE.LineBasicMaterial({ 
            color: this.torsoColor.getHex(),
            linewidth: 3,
            depthTest: false,
            opacity: 0.7,
            transparent: true
        });
        
        // Créer l'objet ligne
        const pathLine = new THREE.Line(pathGeometry, pathMaterial);
        pathLine.renderOrder = 100; // Pour s'assurer qu'il est visible au-dessus du terrain
        
        // Ajouter à la scène
        this.experience.scene.add(pathLine);
        
        // Stocker une référence pour pouvoir nettoyer plus tard
        this._debugPathLine = pathLine;
        
        // Créer des sphères aux points d'inflexion du chemin
        this._debugPathPoints = [];
        this.currentPathPoints.forEach((point, index) => {
            // Ne pas créer de sphere pour tous les points (seulement pour les points clés)
            if (index === 0 || index === this.currentPathPoints.length - 1 || index % 2 === 0) {
                const sphereGeom = new THREE.SphereGeometry(0.3, 8, 8);
                const sphereMat = new THREE.MeshBasicMaterial({ 
                    color: index === 0 ? 0x00ff00 : (index === this.currentPathPoints.length - 1 ? 0xff0000 : 0xffff00),
                    depthTest: false
                });
                const sphere = new THREE.Mesh(sphereGeom, sphereMat);
                sphere.position.copy(point);
                sphere.position.y += 0.1; // Légèrement au-dessus du sol
                this.experience.scene.add(sphere);
                this._debugPathPoints.push(sphere);
            }
        });
    }

    // --- _updateWalkAnimation (INCHANGÉ) ---
    // Copier la méthode _updateWalkAnimation de l'itération précédente ici.
    // Elle utilise les paramètres de config et `this.visualSpeed`.
	_updateWalkAnimation(gameTimeSeconds) {
        const config = this.experience.world?.cityManager?.config;
        if (!config) return; // Ne pas animer si config non trouvée

        const agentBobAmplitude = config.agentBobAmplitude ?? 0.15;
        const agentStepLength = config.agentStepLength ?? 1.5;
        const agentStepHeight = config.agentStepHeight ?? 0.7;
        const agentSwingAmplitude = config.agentSwingAmplitude ?? 1.2;
        const agentAnkleRotationAmplitude = config.agentAnkleRotationAmplitude ?? (Math.PI / 8);
        const agentHandTiltAmplitude = config.agentHandTiltAmplitude ?? 0.2;
        const agentHeadBobAmplitude = config.agentHeadBobAmplitude ?? 0.06;
        const agentAnimationSpeedFactor = config.agentAnimationSpeedFactor ?? 1.0;

        // Utiliser this.visualSpeed qui est propre à l'agent
        const effectiveAnimationSpeed = this.visualSpeed * agentAnimationSpeedFactor;
        const walkTime = gameTimeSeconds * effectiveAnimationSpeed; // Temps * vitesse

        let pos = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 };
        const torsoBobY = Math.sin(walkTime * 2) * agentBobAmplitude;

        // Torso
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = 0;
        this.currentAnimationMatrix.torso.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.identity(), this._tempV3_2.set(1, 1, 1));
        // Head
        pos.y = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * agentHeadBobAmplitude);
        this.currentAnimationMatrix.head.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.identity(), this._tempV3_2.set(1, 1, 1));
        // Left Foot
        pos.z = Math.sin(walkTime) * agentStepLength;
        pos.y = Math.max(0, Math.cos(walkTime)) * agentStepHeight;
        rot.x = Math.sin(walkTime) * agentAnkleRotationAmplitude; rot.y = 0; rot.z = 0;
        this.currentAnimationMatrix.leftFoot.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
        // Right Foot
        pos.z = Math.sin(walkTime + Math.PI) * agentStepLength;
        pos.y = Math.max(0, Math.cos(walkTime + Math.PI)) * agentStepHeight;
        rot.x = Math.sin(walkTime + Math.PI) * agentAnkleRotationAmplitude; rot.y = 0; rot.z = 0;
        this.currentAnimationMatrix.rightFoot.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
        // Left Hand
        pos.z = Math.sin(walkTime + Math.PI) * agentSwingAmplitude;
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = Math.sin(walkTime * 1.8) * agentHandTiltAmplitude;
        this.currentAnimationMatrix.leftHand.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
        // Right Hand
        pos.z = Math.sin(walkTime) * agentSwingAmplitude;
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = Math.cos(walkTime * 1.8 + 0.5) * agentHandTiltAmplitude;
        this.currentAnimationMatrix.rightHand.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
    }

    // --- update (Obsolète ou simplifié) ---
    // L'essentiel de la logique est maintenant dans updateState et updateVisuals,
    // qui sont appelés par AgentManager.update().
    // Garder une méthode update vide ou la supprimer si non nécessaire.
    // update(deltaTime, currentHour) {
    //     // La logique est maintenant dans updateState / updateVisuals
    // }

	destroy() {
        // Libérer les références pour aider le garbage collector
        
        // Nettoyer les visuels de debug du chemin
        if (this._debugPathLine) {
            this._debugPathLine.geometry.dispose();
            this._debugPathLine.material.dispose();
            this.experience.scene.remove(this._debugPathLine);
            this._debugPathLine = null;
        }
        
        if (this._debugPathPoints && this._debugPathPoints.length > 0) {
            this._debugPathPoints.forEach(sphere => {
                sphere.geometry.dispose();
                sphere.material.dispose();
                this.experience.scene.remove(sphere);
            });
            this._debugPathPoints = [];
        }
        
        this.currentPathPoints = null;
        this.homePosition = null;
        this.workPosition = null;
        this.experience = null;
        this.agentManager = null; // Important: Libérer la référence à AgentManager
        this.torsoColor = null;
        this.currentAnimationMatrix = {}; // Vider l'objet
    }
}

// Exporter l'enum pour AgentManager si nécessaire
// export { AgentState }; // Alternativement, définir directement dans AgentManager ou importer