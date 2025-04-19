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

    // --- SUPPRESSION : requestPath n'est plus appelé directement ---
    // requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null, nextStateIfSuccess) { ... }
    // --- SUPPRESSION : setPath est remplacé par la gestion de la Promise dans updateState ---
    // setPath(pathPoints, pathLengthWorld) { ... }

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
                                        this.currentPathPoints = path.map(p => p.clone());
                                        this.currentPathLengthWorld = pathLength;
                                        const travelSecondsGame = pathLength / this.agentBaseSpeed;
                                        const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
                                        this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
                                        this.currentState = AgentState.READY_TO_LEAVE_FOR_WORK;
                                        // console.log(`Agent ${this.id}: Path TO WORK received. Length=${pathLength.toFixed(1)}, Duration=${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s. State -> READY_TO_LEAVE`);
                                    } else {
                                        console.warn(`Agent ${this.id}: Path TO WORK received but invalid (path: ${path ? 'Array['+path.length+']' : 'null'}, length: ${pathLength}). Reverting to AT_HOME.`);
                                        this.currentState = AgentState.AT_HOME;
                                    }
                                } else { /* ... état a changé ... */ console.warn(`Agent ${this.id}: Path TO WORK received, but state is now ${this.currentState}. Ignoring path.`); }
                            })
                            .catch(error => {
                                if (this.currentState === AgentState.REQUESTING_PATH_FOR_WORK) {
                                     console.error(`Agent ${this.id}: Pathfinding TO WORK failed: ${error.message}. Reverting to AT_HOME.`);
                                     this.currentState = AgentState.AT_HOME;
                                } else { /* ... état a changé ... */ console.warn(`Agent ${this.id}: Pathfinding TO WORK failed, but state is now ${this.currentState}. Ignoring error.`); }
                            });
                    } else { /* ... positions manquantes ... */
                         if (currentGameTime >= this.lastPathRequestTimeGame + this.MIN_RETRY_DELAY_MS) {
                             console.warn(`Agent ${this.id}: Cannot request work path at ${currentGameTime.toFixed(0)} due to missing entry points (home or work).`);
                             this.lastPathRequestTimeGame = currentGameTime; // Évite spam de logs
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
                     // --- Utilise maintenant this.homePosition et this.workPosition (points d'entrée) ---
                     if (this.homePosition && this.workPosition) {
                         this.lastPathRequestTimeGame = currentGameTime;
                         this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;

                         this.agentManager.requestPath(this.id, this.workPosition, this.homePosition) // Utilise les points d'entrée
                             .then(({ path, pathLength }) => {
                                 if (this.currentState === AgentState.REQUESTING_PATH_FOR_HOME) {
                                     if (path && pathLength > 0.1) {
                                         this.currentPathPoints = path.map(p => p.clone());
                                         this.currentPathLengthWorld = pathLength;
                                         const travelSecondsGame = pathLength / this.agentBaseSpeed;
                                         const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
                                         this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
                                         this.currentState = AgentState.READY_TO_LEAVE_FOR_HOME;
                                         // console.log(`Agent ${this.id}: Path TO HOME received. Length=${pathLength.toFixed(1)}, Duration=${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s. State -> READY_TO_LEAVE`);
                                     } else {
                                         console.warn(`Agent ${this.id}: Path TO HOME received but invalid. Reverting to AT_WORK.`);
                                         this.currentState = AgentState.AT_WORK;
                                     }
                                 } else { /* ... état a changé ... */ console.warn(`Agent ${this.id}: Path TO HOME received, but state is now ${this.currentState}. Ignoring path.`); }
                             })
                             .catch(error => {
                                 if (this.currentState === AgentState.REQUESTING_PATH_FOR_HOME) {
                                      console.error(`Agent ${this.id}: Pathfinding TO HOME failed: ${error.message}. Reverting to AT_WORK.`);
                                      this.currentState = AgentState.AT_WORK;
                                 } else { /* ... état a changé ... */ console.warn(`Agent ${this.id}: Pathfinding TO HOME failed, but state is now ${this.currentState}. Ignoring error.`); }
                             });
                     } else { /* ... positions manquantes ... */
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
                 if (!this.currentPathPoints || this.currentPathLengthWorld <= 0) { /* ... gestion erreur ... */ console.warn(`Agent ${this.id}: In READY_TO_LEAVE_FOR_WORK but path invalid. Reverting to AT_HOME.`); this.currentState = AgentState.AT_HOME; this.lastArrivalTimeHome = currentGameTime; this.lastPathRequestTimeGame = -1; break; }
                 let effectiveDepTimeW = this.exactWorkDepartureTimeGame;
                  while (effectiveDepTimeW + dayDurationMs <= currentGameTime) { effectiveDepTimeW += dayDurationMs; }
                 if (currentGameTime >= effectiveDepTimeW) { /* ... départ ... */
                     this.departureTimeGame = effectiveDepTimeW; this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame; this.currentState = AgentState.IN_TRANSIT_TO_WORK; this.isVisible = true; this.currentPathIndexVisual = 0;
                     const departHourW = Math.floor((this.departureTimeGame % dayDurationMs) / (dayDurationMs / 24)); const agentManagerW = this.agentManager; if (agentManagerW?.stats?.pathsToWorkByHour) { agentManagerW.stats.pathsToWorkByHour[departHourW] = (agentManagerW.stats.pathsToWorkByHour[departHourW] || 0) + 1; }
                 }
                 break;
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                 this.isVisible = false;
                 if (!this.currentPathPoints || this.currentPathLengthWorld <= 0) { /* ... gestion erreur ... */ console.warn(`Agent ${this.id}: In READY_TO_LEAVE_FOR_HOME but path invalid. Reverting to AT_WORK.`); this.currentState = AgentState.AT_WORK; this.lastArrivalTimeWork = currentGameTime; this.lastPathRequestTimeGame = -1; break; }
                 let effectiveDepTimeH = this.exactHomeDepartureTimeGame;
                  while (effectiveDepTimeH + dayDurationMs <= currentGameTime) { effectiveDepTimeH += dayDurationMs; }
                 if (currentGameTime >= effectiveDepTimeH) { /* ... départ ... */
                     this.departureTimeGame = effectiveDepTimeH; this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame; this.currentState = AgentState.IN_TRANSIT_TO_HOME; this.isVisible = true; this.currentPathIndexVisual = 0;
                     const departHourH = Math.floor((this.departureTimeGame % dayDurationMs) / (dayDurationMs / 24)); const agentManagerH = this.agentManager; if (agentManagerH?.stats?.pathsToHomeByHour) { agentManagerH.stats.pathsToHomeByHour[departHourH] = (agentManagerH.stats.pathsToHomeByHour[departHourH] || 0) + 1; }
                 }
                 break;
            case AgentState.IN_TRANSIT_TO_WORK:
            case AgentState.IN_TRANSIT_TO_HOME:
                 this.isVisible = true;
                 if (this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame) { /* ... arrivée ... */
                    const destinationState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME;
                    this.currentState = destinationState;
                    if (destinationState === AgentState.AT_WORK) { this.lastArrivalTimeWork = this.arrivalTmeGame; if (this.workPosition) { this.position.copy(this.workPosition); this.position.y += this.yOffset; } }
                    else { this.lastArrivalTimeHome = this.arrivalTmeGame; if (this.homePosition) { this.position.copy(this.homePosition); this.position.y += this.yOffset; } }
                    this.isVisible = false; this.lastPathRequestTimeGame = -1; this.currentPathPoints = null; this.departureTimeGame = -1; this.arrivalTmeGame = -1; this.calculatedTravelDurationGame = 0; this.currentPathLengthWorld = 0;
                 }
                 break;
            case AgentState.IDLE:
                 this.isVisible = false;
                 if (!this.homePosition && this.homeBuildingId && this.experience.world?.cityManager) { this.initializeLifecycle(this.homeBuildingId, this.workBuildingId); }
                 break;

        } // Fin switch
    } // Fin updateState

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
             // console.warn(`Agent ${this.id}: updateVisuals called in transit state without valid path data.`);
            return;
        }

        // Calculer la progression sur le chemin total [0, 1]
        const elapsedTimeSinceDeparture = Math.max(0, currentGameTime - this.departureTimeGame); // Assurer non négatif
        let progress = Math.min(1, elapsedTimeSinceDeparture / this.calculatedTravelDurationGame); // Clamp [0, 1]

        // --- Logique de Déplacement Linéaire le long des Segments ---
        if (this.currentPathPoints.length === 1) {
            // Cas spécial : chemin d'un seul point (devrait être rare)
            this.position.copy(this.currentPathPoints[0]);
        } else {
            // Calculer la distance cible à parcourir depuis le début du chemin
            const targetDistance = progress * this.currentPathLengthWorld;
            let cumulativeLength = 0;
            let targetPosition = this.currentPathPoints[this.currentPathPoints.length - 1]; // Défaut: fin du chemin

            // Trouver le segment actuel et la position sur ce segment
            for (let i = 0; i < this.currentPathPoints.length - 1; i++) {
                const p1 = this.currentPathPoints[i];
                const p2 = this.currentPathPoints[i+1];
                const segmentVector = this._tempV3_1.copy(p2).sub(p1);
                const segmentLength = segmentVector.length();

                if (segmentLength < 0.001) continue; // Ignorer segments de longueur nulle

                // Si la distance cible est sur ou avant la fin de ce segment
                if (cumulativeLength + segmentLength >= targetDistance || i === this.currentPathPoints.length - 2) {
                    const lengthOnSegment = Math.max(0, targetDistance - cumulativeLength); // Distance à parcourir sur ce segment
                    const segmentProgress = Math.min(1, lengthOnSegment / segmentLength); // Progrès [0,1] sur ce segment
                    targetPosition = this._tempV3_2.copy(p1).addScaledVector(segmentVector, segmentProgress);
                    this.currentPathIndexVisual = i; // Mémoriser l'index du segment actuel
                    break;
                }
                cumulativeLength += segmentLength;
            }
            // Appliquer la position cible calculée
            this.position.copy(targetPosition);
        }
        // Appliquer l'offset vertical
        this.position.y += this.yOffset;

        // --- Calcul de l'Orientation ---
        // Regarder vers le point suivant du chemin, ou le dernier point si on est proche de la fin.
        let lookAtIndex = this.currentPathIndexVisual + 1;
        // Si on est très proche de la fin (ex: > 98%), regarder le dernier point pour éviter oscillation finale
        if (progress > 0.98 || lookAtIndex >= this.currentPathPoints.length) {
             lookAtIndex = this.currentPathPoints.length - 1;
        }
        const lookTargetPoint = this.currentPathPoints[lookAtIndex];
        this._tempV3_1.copy(lookTargetPoint).setY(this.position.y); // Garder la même hauteur Y pour lookAt

        // Orienter l'agent seulement s'il y a une distance significative à la cible pour éviter NaN/Infinity
        if (this.position.distanceToSquared(this._tempV3_1) > 0.01) {
            this._tempMatrix.lookAt(this.position, this._tempV3_1, THREE.Object3D.DEFAULT_UP);
            this._tempQuat.setFromRotationMatrix(this._tempMatrix);
            // Interpolation douce (Slerp) vers l'orientation cible
            const deltaSeconds = deltaTime / 1000.0;
            // Ajuster le facteur de rotation pour une rotation plus rapide/lente
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds); // Indépendant du framerate
            this.orientation.slerp(this._tempQuat, slerpAlpha);
        }

        // --- Mise à jour de l'Animation de Marche (INCHANGÉ) ---
        // Utiliser currentGameTime pour l'animation pour qu'elle soit continue
        this._updateWalkAnimation(currentGameTime / 1000); // Passe le temps en secondes
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