// src/World/Agent.js
import * as THREE from 'three';
import WorkScheduleStrategy from '../Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from '../Strategies/WeekendWalkStrategy.js';
import AgentState from './AgentState.js';
import AgentAnimation from './AgentAnimation.js';
import AgentStateMachine from './AgentStateMachine.js';
import AgentWeekendBehavior from './AgentWeekendBehavior.js';
import AgentVehicleBehavior from './AgentVehicleBehavior.js';
import AgentMovement from './AgentMovement.js';

let nextAgentId = 0;

export default class Agent {
    constructor(config, instanceId, experience, workScheduleStrategy = null, weekendWalkStrategy = null) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) { throw new Error(`Agent ${this.id}: Experience instance is required!`); }
        this.experience = experience;

        // --- Propriétés Configuration & Base ---
        this.config = config;
        this.scale = config.scale ?? 0.1;
        this.agentBaseSpeed = (config.speed ?? 1.5);
        this.visualSpeed = this.agentBaseSpeed * 7;
        this.rotationSpeed = config.rotationSpeed ?? 8.0; // Conservé ici mais utilisé par AgentMovement
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.5;
        this.reachToleranceSq = this.reachTolerance * this.reachTolerance;
        this.lodDistance = 50;
        this.isLodActive = false;

        // --- Position & Orientation (Visuel) ---
        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false;

        // --- État & Planification ---
        this.currentState = AgentState.IDLE;
        this.stateMachine = new AgentStateMachine(this);
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        this.hasReachedDestination = false;

        // --- Trajet Actuel ---
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathLengthWorld = 0;
        this.currentPathIndexVisual = 0; // Index pour le suivi visuel du chemin
        this.visualInterpolationProgress = 0; // Progression (0-1) pour le visuel

        // --- Heures & Délais ---
        this.departureWorkHour = 8;
        this.departureHomeHour = 19;
        this.anticipationMinutes = 5;
        this.prepareWorkDepartureTimeGame = -1;
        this.prepareHomeDepartureTimeGame = -1;
        this.exactWorkDepartureTimeGame = -1;
        this.exactHomeDepartureTimeGame = -1;

        this.lastArrivalTimeHome = 0;
        this.lastArrivalTimeWork = -1;
        this.requestedPathForDepartureTime = -1;

        this.lastDepartureDayWork = -1;
        this.lastDepartureDayHome = -1;

        this._currentPathRequestGoal = null;

        // --- Comportements & Handlers ---
        this.animationHandler = new AgentAnimation(this.config, this.experience);
        this.movementHandler = new AgentMovement(this);

        this.workScheduleStrategy = workScheduleStrategy || new WorkScheduleStrategy();
        const effectiveWeekendWalkStrategy = weekendWalkStrategy || new WeekendWalkStrategy();
        this.weekendBehavior = new AgentWeekendBehavior(this, effectiveWeekendWalkStrategy);
        this.vehicleBehavior = new AgentVehicleBehavior(this);

        // --- Animation Visuelle (Matrices) ---
        this.currentAnimationMatrix = {
            head: new THREE.Matrix4(), torso: new THREE.Matrix4(),
            leftHand: new THREE.Matrix4(), rightHand: new THREE.Matrix4(),
            leftFoot: new THREE.Matrix4(), rightFoot: new THREE.Matrix4(),
        };

        // --- Variables temporaires (peut-être moins utilisées ici maintenant) ---
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempMatrix = new THREE.Matrix4();
        // _targetOrientation, _lookTarget, _targetPosition, _direction sont maintenant gérés dans AgentMovement

        // Matrice de transformation pour le rendu (toujours utile pour AgentManager)
        this.matrix = new THREE.Matrix4();

        this._calculateScheduledTimes();

        this.sidewalkHeight = experience.world?.cityManager?.getNavigationGraph(false)?.sidewalkHeight || 0.2;

        this._lastPositionCheck = null;

        // Propriétés pour les mécanismes de secours
        this._pathRequestTimeout = null;
        this._stateStartTime = null;

        this._nextStateCheckTime = -1;
    }

	_calculateScheduledTimes() {
        const environment = this.experience.world?.environment;
        if (!environment || !environment.isInitialized || environment.dayDurationMs <= 0) {
            // console.warn(`Agent ${this.id}: Impossible de calculer les heures planifiées (env non prêt).`); // Moins verbeux
            return;
        }
        const dayDurationMs = environment.dayDurationMs;
        const msPerHour = dayDurationMs / 24;
        const msPerMinute = msPerHour / 60;

        this.exactWorkDepartureTimeGame = this.departureWorkHour * msPerHour;
        this.prepareWorkDepartureTimeGame = this.exactWorkDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
        if (this.prepareWorkDepartureTimeGame < 0) {
            this.prepareWorkDepartureTimeGame += dayDurationMs;
        }

        this.exactHomeDepartureTimeGame = this.departureHomeHour * msPerHour;
        this.prepareHomeDepartureTimeGame = this.exactHomeDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
        if (this.prepareHomeDepartureTimeGame < 0) {
            this.prepareHomeDepartureTimeGame += dayDurationMs;
        }
    }

	initializeLifecycle(homeId, workId) {
        this.homeBuildingId = homeId;
        this.workBuildingId = workId;
        const cityManager = this.experience.world?.cityManager;
        const navManager = cityManager?.navigationManager; // Utiliser NavManager
        const pedestrianNavGraph = navManager?.getNavigationGraph(false); // Obtenir graphe piéton
        const sidewalkHeight = pedestrianNavGraph?.sidewalkHeight ?? this.config?.sidewalkHeight ?? 0.2;

        const homeInfo = cityManager?.getBuildingInfo(this.homeBuildingId);
        if (homeInfo && pedestrianNavGraph) { // Vérifier aussi navGraph
            let baseHomePos = homeInfo.position.clone();
            baseHomePos.y = sidewalkHeight;
            this.homeGridNode = pedestrianNavGraph.getClosestWalkableNode(baseHomePos);
            this.homePosition = this.homeGridNode ? pedestrianNavGraph.gridToWorld(this.homeGridNode.x, this.homeGridNode.y) : baseHomePos;
            this.position.copy(this.homePosition); // Position initiale visuelle
            this.position.y = this.homePosition.y + this.yOffset; // Appliquer l'offset Y par rapport au sol du chemin

            // --- MODIFICATION: Utilisation de vehicleBehavior ---
            // Initialiser la position de garage via vehicleBehavior
            this.vehicleBehavior?._initializeVehicleHomePosition();
            // ----------------------------------------------------

            this.currentState = AgentState.AT_HOME;
            this.isVisible = false;
        } else {
            console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} ou NavGraph piéton non trouvées.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return;
        }

        const workInfo = cityManager?.getBuildingInfo(this.workBuildingId);
        if (workInfo && pedestrianNavGraph) { // Vérifier aussi navGraph
            let baseWorkPos = workInfo.position.clone();
            baseWorkPos.y = sidewalkHeight;
            this.workGridNode = pedestrianNavGraph.getClosestWalkableNode(baseWorkPos);
            this.workPosition = this.workGridNode ? pedestrianNavGraph.gridToWorld(this.workGridNode.x, this.workGridNode.y) : baseWorkPos;
        } else {
            // Ne plus logguer si workId est null (c'est normal)
            if (workId) {
                console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} ou NavGraph piéton non trouvées.`);
            }
            this.workPosition = null; this.workGridNode = null;
        }

        this._calculateScheduledTimes();
    }

    checkNavigationManager() {
        // Vérifier d'abord si le NavigationManager est déjà initialisé
        if (!this.navigationManager) {
            // Essayer d'obtenir le NavigationManager via le CityManager
            const cityManager = this.experience?.world?.cityManager;
            if (!cityManager) {
                console.error(`Agent ${this.id}: CityManager non disponible. Vérifiez que l'expérience et le monde sont correctement initialisés.`);
                return false;
            }

            this.navigationManager = cityManager.navigationManager;
            if (!this.navigationManager) {
                console.error(`Agent ${this.id}: NavigationManager non disponible dans le CityManager. La ville n'est peut-être pas encore générée.`);
                return false;
            }

            // Vérifier que les graphes de navigation sont initialisés
            const isVehicle = this.isInVehicle || this.hasVehicle;
            const graph = this.navigationManager.getNavigationGraph(isVehicle);
            if (!graph) {
                console.error(`Agent ${this.id}: Graphe de navigation ${isVehicle ? 'véhicule' : 'piéton'} non disponible.`);
                return false;
            }

            console.log(`Agent ${this.id}: NavigationManager initialisé avec succès. Mode: ${isVehicle ? 'véhicule' : 'piéton'}`);
        }

        return true;
    }

    /**
     * Demande un chemin entre deux points via le worker.
     * Calcule les nœuds de grille appropriés en fonction du mode de transport (via vehicleBehavior).
     * @param {THREE.Vector3 | null} startPosWorld - Position de départ mondiale. Null si startNodeOverride est fourni.
     * @param {THREE.Vector3 | null} endPosWorld - Position d'arrivée mondiale. Null si endNodeOverride est fourni.
     * @param {{x: number, y: number} | null} startNodeOverride - Nœud de grille de départ explicite (optionnel).
     * @param {{x: number, y: number} | null} endNodeOverride - Nœud de grille d'arrivée explicite (optionnel).
     * @param {string} nextStateIfSuccess - L'état vers lequel passer si le chemin est trouvé.
     * @param {number} currentGameTimeForStats - Temps de jeu actuel pour les statistiques.
     */
    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null, nextStateIfSuccess, currentGameTimeForStats) {
        // ... (Le début de cette méthode reste globalement inchangé, y compris les logs et la gestion du timeout) ...
        // ... (On récupère agentManager, cityManager, navigationManager comme avant) ...
        // ... (On détermine isVehicle en utilisant this.vehicleBehavior.isDriving() comme avant) ...
        // ... (On détermine requestingState comme avant) ...
        // ... (Vérifications préliminaires des managers comme avant) ...

        const agentManager = this.experience.world?.agentManager;
        const cityManager = this.experience.world?.cityManager;
        const navigationManager = cityManager?.navigationManager;

        // --- MODIFICATION: Utilisation de vehicleBehavior ---
        let isVehicle = this.vehicleBehavior?.isDriving() ?? false;
        // --------------------------------------------------

        if (this.currentState === AgentState.WEEKEND_WALK_REQUESTING_PATH) {
            if (isVehicle) console.warn(`Agent ${this.id}: Forçage mode PIÉTON pour requête WEEKEND_WALK (était ${isVehicle}).`);
            isVehicle = false;
        }

        // --- Partie inchangée ---
        this.targetStateFromWeekendWalk = nextStateIfSuccess; // Pour le retour de promenade

        this.currentPathPoints = null; this.calculatedTravelDurationGame = 0; this.departureTimeGame = -1; this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0; this.visualInterpolationProgress = 0; this.currentPathLengthWorld = 0;

        let requestingState = AgentState.WAITING_FOR_PATH;
        if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_WORK) requestingState = AgentState.REQUESTING_PATH_FOR_WORK;
        else if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_HOME) requestingState = AgentState.REQUESTING_PATH_FOR_HOME;
        else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_READY) requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
        else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
        this.currentState = requestingState;
        this.isVisible = false; // Cache l'agent pendant la requête
        this._pathRequestTimeout = this.experience.time.elapsed;
        this._currentPathRequestGoal = (requestingState === AgentState.REQUESTING_PATH_FOR_WORK) ? 'WORK' : (requestingState === AgentState.REQUESTING_PATH_FOR_HOME ? 'HOME' : 'WALK');

        if (agentManager?.stats) {
            const dayDurationMs = this.experience.world?.environment?.dayDurationMs || (24 * 60 * 60 * 1000);
            const currentHour = Math.floor((currentGameTimeForStats % dayDurationMs) / (dayDurationMs / 24));
            if (requestingState === AgentState.REQUESTING_PATH_FOR_WORK) agentManager.stats.requestingPathForWorkByHour[currentHour]++;
            else if (requestingState === AgentState.REQUESTING_PATH_FOR_HOME) agentManager.stats.requestingPathForHomeByHour[currentHour]++;
        }

        if (!navigationManager || !agentManager || !agentManager.isWorkerInitialized) {
            console.error(`Agent ${this.id}: Managers non prêts pour requête path.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats); // Utiliser récupération
            return;
        }

        const navigationGraph = navigationManager.getNavigationGraph(isVehicle);

        if (!navigationGraph) {
            console.error(`Agent ${this.id}: NavigationGraph non disponible pour mode ${isVehicle ? 'véhicule' : 'piéton'}.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats);
            return;
        }

        // --- Calcul des Nœuds de Départ et d'Arrivée (INCHANGÉ - utilise le bon graphe récupéré au-dessus) ---
        let startNode = null; let endNode = null;
        if (startNodeOverride && typeof startNodeOverride.x === 'number' && typeof startNodeOverride.y === 'number') startNode = startNodeOverride;
        if (endNodeOverride && typeof endNodeOverride.x === 'number' && typeof endNodeOverride.y === 'number') endNode = endNodeOverride;
        if (!startNode && startPosWorld instanceof THREE.Vector3) startNode = navigationGraph.getClosestWalkableNode(startPosWorld);
        if (!endNode && endPosWorld instanceof THREE.Vector3) endNode = navigationGraph.getClosestWalkableNode(endPosWorld);

        // --- Vérification Finale des Nœuds Calculés (INCHANGÉ) ---
        if (!startNode || !endNode || typeof startNode.x !== 'number' || typeof startNode.y !== 'number' || typeof endNode.x !== 'number' || typeof endNode.y !== 'number') {
            console.error(`Agent ${this.id} (${isVehicle ? 'véhicule' : 'piéton'}): Nœud départ ou arrivée MANQUANT/INVALID après calcul. Start: ${JSON.stringify(startNode)}, End: ${JSON.stringify(endNode)}. Forcing recovery.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats);
            return;
        }
        // --- Visualisation Debug (INCHANGÉ) ---
        // ... (logique showStartNodeDebugSphere / showEndNodeDebugSphere) ...
        if (this.experience.isDebugMode && this.experience.world && startNode && endNode) {
            const vizNavGraph = navigationManager.getNavigationGraph(isVehicle);
            if (vizNavGraph) {
                const startWorldPosViz = vizNavGraph.gridToWorld(startNode.x, startNode.y);
                const endWorldPosViz = vizNavGraph.gridToWorld(endNode.x, endNode.y);
                this.experience.world.showStartNodeDebugSphere(startWorldPosViz);
                this.experience.world.showEndNodeDebugSphere(endWorldPosViz);
            }
       }

        // --- Vérification Format Nœuds avant Envoi (INCHANGÉ) ---
        // ... (vérification Number.isInteger etc.) ...
        if (!Number.isInteger(startNode.x) || startNode.x < 0 || !Number.isInteger(startNode.y) || startNode.y < 0 ||
            !Number.isInteger(endNode.x) || endNode.x < 0 || !Number.isInteger(endNode.y) || endNode.y < 0) {
             console.error(`Agent ${this.id}: FORMAT NOEUDS INVALIDE (non-entier ou négatif) AVANT ENVOI WORKER! Start:`, startNode, "End:", endNode);
             this.forceRecoverFromTimeout(currentGameTimeForStats);
             return;
         }

        // --- LOG AVANT WORKER (INCHANGÉ) ---
        // ... (log des positions/nœuds) ...
         console.log(`[AGENT ${this.id} PATH_REQ] Mode: ${isVehicle ? 'Veh' : 'Ped'}, StartW: (${startPosWorld?.x.toFixed(1)}, ${startPosWorld?.z.toFixed(1)}), EndW: (${endPosWorld?.x.toFixed(1)}, ${endPosWorld?.z.toFixed(1)}), StartN: (${startNode.x},${startNode.y}), EndN: (${endNode.x},${endNode.y}), NextState: ${nextStateIfSuccess}`);

        // --- Envoi de la Requête au Worker (INCHANGÉ - passe bien isVehicle) ---
        agentManager.requestPathFromWorker(this.id, startNode, endNode, isVehicle);
    }

	/**
     * Définit le chemin à suivre pour l'agent et met à jour son état.
     * Appelée par AgentManager lorsque le worker renvoie un résultat de pathfinding.
     * @param {Array<THREE.Vector3> | null} pathPoints - Tableau de points du chemin en coordonnées monde, ou null si échec.
     * @param {number} pathLengthWorld - Longueur calculée du chemin en unités monde.
     */
    setPath(pathPoints, pathLengthWorld) {
        console.log(`[Agent ${this.id} DEBUG] Entrée dans setPath. État actuel: ${this.currentState}. Longueur reçue: ${pathLengthWorld}`);

        const currentStateAtCall = this.currentState;
        const wasRequestingWork = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_WORK;
        const wasRequestingHome = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME;
        const wasRequestingWeekendWalk = currentStateAtCall === AgentState.WEEKEND_WALK_REQUESTING_PATH;
        const targetStateFromWeekendWalk = this.targetStateFromWeekendWalk;

        const environment = this.experience.world?.environment;
        const calendarInfo = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;
        const isCurrentlyWeekend = calendarInfo ? ["Samedi", "Dimanche"].includes(calendarInfo.jourSemaine) : false;

        // --- Cas 1: Chemin Valide Reçu ---
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && (pathPoints.length === 1 || pathLengthWorld > 0.1)) {
            const isInstantArrival = pathLengthWorld < 0.01 || pathPoints.length === 1;
            if (isInstantArrival) {
                if (wasRequestingWork) { this.currentState = AgentState.AT_WORK; this.lastArrivalTimeWork = this.experience.time.elapsed; }
                else if (wasRequestingHome) { this.currentState = AgentState.AT_HOME; this.lastArrivalTimeHome = this.experience.time.elapsed; }
                else if (wasRequestingWeekendWalk) { this.currentState = AgentState.AT_HOME; this.weekendBehavior.resetWeekendState(); }
                this.currentPathPoints = null; this.currentPathLengthWorld = 0; this.calculatedTravelDurationGame = 0;
                this.departureTimeGame = -1; this.arrivalTmeGame = -1; this.hasReachedDestination = false;
                this.isVisible = false; this._pathRequestTimeout = null;
                console.log(`[Agent ${this.id} DEBUG] Arrivée instantanée détectée. État final : ${this.currentState}`);
                return;
            }
            console.log(`[Agent ${this.id} DEBUG] setPath: Chemin VALIDE reçu (${pathPoints.length} points, longueur ${pathLengthWorld.toFixed(2)}).`);

            if (currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME && this.weekendBehavior.weekendWalkEndTime > 0 && pathPoints.length > 0) {
                const startPoint = pathPoints[0]; const distanceToStart = this.position.distanceTo(startPoint);
                if (distanceToStart > 5.0) {
                    console.warn(`Agent ${this.id}: Correction téléportation! Distance chemin retour maison: ${distanceToStart.toFixed(2)}m.`);
                    pathPoints[0] = this.position.clone();
                }
            }

            this.currentPathPoints = pathPoints.map(p => p.clone());
            this.currentPathLengthWorld = pathLengthWorld;

            // --- Calcul durée trajet (utilise vehicleBehavior) ---
            const isDriving = this.vehicleBehavior?.isDriving() ?? false;
            const car = isDriving ? this.vehicleBehavior.currentVehicle : null;
            // Utilise la vitesse de la voiture si elle conduit, sinon la vitesse de base de l'agent
            const speed = isDriving ? (car?.speed ?? this.config.carSpeed) : this.agentBaseSpeed;
            // --------------------------------------------------
            if (speed > 0 && pathLengthWorld > 0) {
                const travelSecondsGame = pathLengthWorld / speed;
                const dayDurationMs = this.experience.world?.environment?.dayDurationMs;
                if (dayDurationMs > 0) {
                    const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
                    this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
                } else {
                    console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}) pour calcul durée trajet. Fallback.`);
                    this.calculatedTravelDurationGame = 10 * 60 * 1000; // 10 mins jeu
                    this.currentPathLengthWorld = 0; // Longueur invalide dans ce cas
                }
            } else {
                 this.calculatedTravelDurationGame = 10 * 60 * 1000; // Fallback
                 this.currentPathLengthWorld = 0; // Longueur invalide
            }

            // --- Transition d'état ---
            let nextState = this.currentState;
            if (wasRequestingWork) {
                // L'état READY est commun, que ce soit en voiture ou à pied.
                // AgentStateMachine gérera la transition vers DRIVING ou IN_TRANSIT.
                nextState = AgentState.READY_TO_LEAVE_FOR_WORK;
            } else if (wasRequestingHome) {
                nextState = AgentState.READY_TO_LEAVE_FOR_HOME;
            } else if (wasRequestingWeekendWalk) {
                if (isCurrentlyWeekend) {
                     nextState = (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK)
                                 ? AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK
                                 : AgentState.WEEKEND_WALK_READY;
                } else {
                    console.warn(`[Agent ${this.id} WARN] setPath: Chemin promenade reçu mais weekend terminé. Annulation.`);
                    this.currentPathPoints = null; this.currentPathLengthWorld = 0; this.calculatedTravelDurationGame = 0;
                    nextState = AgentState.AT_HOME; this.weekendBehavior.resetWeekendState();
                }
            } else {
                console.warn(`[Agent ${this.id} WARN] setPath: Chemin valide reçu mais état initial (${currentStateAtCall}) non géré.`);
                nextState = this.currentState; // Garder l'état actuel
            }
            console.log(`[Agent ${this.id} DEBUG] setPath: Changement d'état de ${currentStateAtCall} vers ${nextState}`);
            this.currentState = nextState;

            console.log(`[Agent ${this.id} DEBUG] setPath (succès): Annulation du _pathRequestTimeout.`);
            this._pathRequestTimeout = null; // Annuler le timer car le chemin est reçu

        }
        // --- Cas 2: Chemin Invalide ou Échec Pathfinding ---
        else {
            console.warn(`[Agent ${this.id} DEBUG] setPath: Chemin INVALIDE reçu (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}, length: ${pathLengthWorld}). État au moment de l'appel: ${currentStateAtCall}`);

            this.currentPathPoints = null; this.calculatedTravelDurationGame = 0; this.currentPathLengthWorld = 0;
            this.departureTimeGame = -1; this.arrivalTmeGame = -1; this.currentPathIndexVisual = 0; this.visualInterpolationProgress = 0;

            // --- Logique de Fallback : Synchro vers état cible ---
            let fallbackState = this.currentState; let teleportPosition = null; let forceVisibilityFalse = true;

            if (wasRequestingWork) {
                console.warn(`[Agent ${this.id} SYNC] Pathfinding WORK échoué. Forçage état AT_WORK et téléportation.`);
                fallbackState = AgentState.AT_WORK; teleportPosition = this.workPosition;
                this.lastArrivalTimeWork = this.experience.time.elapsed; this.requestedPathForDepartureTime = -1;
                // --- Sortir du véhicule si nécessaire ---
                this.vehicleBehavior?.exitVehicle();
                // ---------------------------------------
            } else if (wasRequestingHome) {
                console.warn(`[Agent ${this.id} SYNC] Pathfinding HOME échoué. Forçage état AT_HOME et téléportation.`);
                fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                this.lastArrivalTimeHome = this.experience.time.elapsed; this.requestedPathForDepartureTime = -1;
                 // --- Sortir du véhicule si nécessaire ---
                 this.vehicleBehavior?.exitVehicle();
                 // ---------------------------------------
            } else if (wasRequestingWeekendWalk) {
                 // --- Sortir du véhicule (même si improbable) ---
                 this.vehicleBehavior?.exitVehicle();
                 // --------------------------------------------
                 console.warn(`[Agent ${this.id} WARN] Pathfinding WEEKEND WALK échoué (état cible: ${targetStateFromWeekendWalk}).`);
                if (isCurrentlyWeekend) {
                    if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
                         console.warn(`[Agent ${this.id}] Échec retour trottoir.`);
                         if (this.weekendBehavior.parkSidewalkPosition) {
                             this.position.copy(this.weekendBehavior.parkSidewalkPosition).setY(this.yOffset);
                             this.weekendBehavior.isInsidePark = false; forceVisibilityFalse = false;
                             console.log(`[Agent ${this.id}] Téléporté au trottoir. Redemande chemin maison.`);
                             fallbackState = AgentState.REQUESTING_PATH_FOR_HOME; this._pathRequestTimeout = this.experience.time.elapsed;
                             const currentGridNode = this.experience.world?.cityManager?.navigationManager?.getNavigationGraph(false)?.getClosestWalkableNode(this.position);
                             this.requestPath(this.position, this.homePosition, currentGridNode, this.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, this.experience.time.elapsed);
                             console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après requête retour maison.`); return;
                         } else {
                             console.warn(`[Agent ${this.id}] Position trottoir inconnue. Forçage maison.`); this.forceReturnHome(this.experience.time.elapsed);
                             fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                         }
                    } else { // Échec requête initiale promenade
                         console.warn(`[Agent ${this.id}] Échec pathfinding promenade initiale.`);
                         const foundNew = this.weekendBehavior._findRandomWalkDestination(this.experience.time.elapsed);
                         if (!foundNew) {
                             console.warn(`[Agent ${this.id}] Impossible de trouver une autre destination. Retour AT_HOME.`);
                             fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                         } else { console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après nouvelle requête promenade.`); return; }
                    }
                } else { // Weekend terminé
                     console.warn(`[Agent ${this.id} SYNC] Pathfinding promenade échoué ET weekend terminé.`); fallbackState = AgentState.AT_HOME;
                     teleportPosition = this.homePosition; this.weekendBehavior.resetWeekendState();
                }
            } else { // Cas inattendu
                console.warn(`[Agent ${this.id} WARN] setPath: Chemin invalide reçu mais état initial (${currentStateAtCall}) non géré.`);
                if (this.workPosition && Math.abs(this.experience.time.elapsed - this.lastArrivalTimeWork) < Math.abs(this.experience.time.elapsed - this.lastArrivalTimeHome)) {
                    fallbackState = AgentState.AT_WORK; teleportPosition = this.workPosition;
                } else { fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition; }
            }

            // --- Appliquer l'état et la téléportation ---
            console.log(`[Agent ${this.id} DEBUG] setPath (échec): Changement d'état vers ${fallbackState}.`); this.currentState = fallbackState;
            if (teleportPosition) { console.log(`[Agent ${this.id} DEBUG] Téléportation vers ${fallbackState}.`); this.position.copy(teleportPosition).setY(this.yOffset); }
            if (forceVisibilityFalse) { this.isVisible = false; }

            console.log(`[Agent ${this.id} DEBUG] setPath (échec): Annulation du _pathRequestTimeout.`); this._pathRequestTimeout = null;
        }
        console.log(`[Agent ${this.id} DEBUG] Sortie de setPath. État final: ${this.currentState}`);
    }

    /**
     * Met à jour l'état logique de l'agent en déléguant à AgentStateMachine.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentHour - Heure actuelle du jeu (0-23).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
    updateState(deltaTime, currentHour, currentGameTime) {
        if (this.stateMachine) {
            this.stateMachine.update(deltaTime, currentHour, currentGameTime);
        } else {
            if (this.currentState !== AgentState.IDLE) {
                this.currentState = AgentState.IDLE;
                this.isVisible = false;
            }
            console.error(`Agent ${this.id}: StateMachine non initialisée.`);
        }
    }

    /**
     * Récupération après un timeout de requête de chemin ou un état bloqué.
     * Force l'agent vers un état stable basé sur le but de la requête échouée.
     * @param {number} currentGameTime - Temps de jeu actuel.
     */
    forceRecoverFromTimeout(currentGameTime) {
        const failedGoal = this._currentPathRequestGoal;
        const previousState = this.currentState;
        console.warn(`Agent ${this.id}: Forcing recovery from path request timeout or stuck state (Goal: ${failedGoal || 'Unknown'}, State: ${previousState}) at game time ${currentGameTime.toFixed(0)}. Cleaning up request.`);

        // Reset des propriétés communes liées au chemin et au weekend (via weekendBehavior)
        this.weekendBehavior?.resetWeekendState(); // Utiliser la méthode de weekendBehavior
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        this.currentPathLengthWorld = 0;
        this.hasReachedDestination = false;
        this._stateStartTime = null;
        this._pathRequestTimeout = null;
        this._currentPathRequestGoal = null;

        // --- MODIFICATION: Utilisation de vehicleBehavior ---
        // Libérer la voiture via le behavior. S'il n'y en avait pas, ne fait rien.
        this.vehicleBehavior?.exitVehicle();
        console.log(` -> Utilisation de vehicleBehavior.exitVehicle() pour nettoyage voiture (si existante).`);
        // ----------------------------------------------------

        // Choisir l'état de repli basé sur le but échoué
        let targetPosition = null;

        if (failedGoal === 'WORK') {
            console.log(` -> Forcing state to AT_WORK.`);
            this.currentState = AgentState.AT_WORK;
            targetPosition = this.workPosition;
            this.lastArrivalTimeWork = currentGameTime;
            this.requestedPathForDepartureTime = -1; // Prêt pour le prochain cycle de retour
        } else if (failedGoal === 'HOME' || failedGoal === 'WALK') {
             // Pour un échec de chemin de maison OU de promenade, on retourne à la maison
             console.log(` -> Forcing state to AT_HOME.`);
             this.currentState = AgentState.AT_HOME;
             targetPosition = this.homePosition;
             this.lastArrivalTimeHome = currentGameTime;
             this.requestedPathForDepartureTime = -1; // Prêt pour le prochain cycle de travail
             // Nettoyage spécifique au weekend (déjà fait par resetWeekendState plus haut)
        } else {
             // Si le but est inconnu ou null (ex: état bloqué sans requête active)
             console.warn(` -> Unknown or null goal '${failedGoal}', forcing AT_HOME as generic fallback.`);
             this.currentState = AgentState.AT_HOME;
             targetPosition = this.homePosition; // Le plus sûr est de renvoyer à la maison
             this.lastArrivalTimeHome = currentGameTime;
             this.requestedPathForDepartureTime = -1;
        }

        // Téléporter visuellement si une position cible est définie
        if (targetPosition) {
            console.log(` -> Téléportation vers ${this.currentState} à (${targetPosition.x.toFixed(1)}, ${targetPosition.y.toFixed(1)}, ${targetPosition.z.toFixed(1)})`);
            this.position.copy(targetPosition).setY(this.yOffset); // Appliquer la position + offset Y
            // Pas besoin de updateMatrix ici, AgentManager s'en chargera
        } else {
            console.warn(` -> Aucune position cible définie pour téléportation (état: ${this.currentState}). L'agent pourrait être à une position incorrecte.`);
            // Si homePosition n'est pas défini non plus, l'agent reste où il est.
            if(this.homePosition) {
                 this.position.copy(this.homePosition).setY(this.yOffset);
                 console.log(` -> Fallback téléportation vers homePosition.`);
            }
        }

        this.isVisible = false; // Cacher l'agent après récupération
    }

	/**
     * Met à jour la position et l'orientation VISUELLE de l'agent.
     * Délègue le mouvement piéton à AgentMovement.
     * Gère la synchronisation avec la voiture via AgentVehicleBehavior.
     * Calcule l'animation via AgentAnimation.
     *
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentGameTime - Temps de jeu total (ms).
     */
    updateVisuals(deltaTime, currentGameTime) {
        const isDriving = this.vehicleBehavior?.isDriving() ?? false;
        const isVisuallyMoving = this.currentState === AgentState.IN_TRANSIT_TO_WORK ||
                                 this.currentState === AgentState.IN_TRANSIT_TO_HOME ||
                                 this.currentState === AgentState.WEEKEND_WALKING ||
                                 isDriving; // << Utilise l'état du vehicleBehavior

        // --- Réinitialisation si pas en mouvement visuel ---
        if (!isVisuallyMoving) {
            // Positionner à l'emplacement logique (maison ou travail)
            if (this.currentState === AgentState.AT_HOME && this.homePosition) {
                this.position.copy(this.homePosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                this.position.copy(this.workPosition).setY(this.yOffset);
            }
            // Réinitialiser animation
            if (this.animationHandler) this.animationHandler.resetMatrices();
            this.currentAnimationMatrix = this.animationHandler?.animationMatrices; // Assurer synchro matrice
            return;
        }

        // --- Si l'agent CONDUIT ---
        if (isDriving) {
            const carPosition = this.vehicleBehavior.getVehiclePosition();
            const carOrientation = this.vehicleBehavior.getVehicleOrientation();
            if (carPosition && carOrientation) {
                this.position.copy(carPosition); // L'agent logique suit la voiture
                // L'agent est CACHÉ, donc son orientation n'est pas cruciale visuellement
                // this.orientation.copy(carOrientation); // Optionnel: synchroniser ori logique
                // Calculer animation (état repos/assis)
                if (this.animationHandler) this.animationHandler.update(0, false); // walkTime=0 -> repos
                this.currentAnimationMatrix = this.animationHandler?.animationMatrices;
            } else {
                 console.warn(`Agent ${this.id}: isDriving=true mais voiture non trouvée dans vehicleBehavior.`);
                 this.isVisible = false; // Cacher par sécurité
                 if (this.animationHandler) this.animationHandler.resetMatrices();
                 this.currentAnimationMatrix = this.animationHandler?.animationMatrices;
            }
            return; // Sortir car position/orientation dictée par voiture (et agent caché)
        }

        // --- Si l'agent est PIÉTON et en mouvement ---
        if (!this.currentPathPoints || this.currentPathPoints.length === 0 || this.calculatedTravelDurationGame <= 0 || this.departureTimeGame < 0) {
            this.isVisible = false;
            if (this.animationHandler) this.animationHandler.resetMatrices();
            this.currentAnimationMatrix = this.animationHandler?.animationMatrices;
            return;
        }

        // Calcul LOD (reste ici)
        const cameraPosition = this.experience.camera.instance.position;
        const distanceToCameraSq = this.position.distanceToSquared(cameraPosition);
        this.isLodActive = distanceToCameraSq > (this.lodDistance * this.lodDistance);

        // Calcul progression visuelle (reste ici)
        const elapsedTimeSinceDeparture = currentGameTime - this.departureTimeGame;
        let progress = Math.max(0, Math.min(1, this.calculatedTravelDurationGame > 0 ? elapsedTimeSinceDeparture / this.calculatedTravelDurationGame : 0));
        this.visualInterpolationProgress = progress;

        // Forcer arrivée visuelle si état weekend (reste ici)
        if ((this.currentState === AgentState.WEEKEND_WALKING || this.currentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) && progress > 0.9) {
            progress = 1.0;
            this.visualInterpolationProgress = 1.0;
        }

        // Marquer arrivé pour la logique d'état (reste ici)
        if (progress >= 1.0 && !this.hasReachedDestination) {
            this.hasReachedDestination = true;
        }
        progress = Math.max(0, progress);

        // --- DÉLÉGATION DU DÉPLACEMENT VISUEL ---
        if (this.movementHandler) {
            // Appelle la méthode qui met à jour this.position et this.orientation
            this.currentPathIndexVisual = this.movementHandler.updatePedestrianMovement(
                deltaTime,
                this.currentPathPoints,
                this.currentPathLengthWorld,
                this.visualInterpolationProgress,
                this.currentPathIndexVisual // Passe l'index actuel
            );
        } else {
            console.error(`Agent ${this.id}: movementHandler non défini.`);
            // Fallback: se placer sur le dernier point si pas de handler
            if (this.currentPathPoints && this.currentPathPoints.length > 0) {
                this.position.copy(this.currentPathPoints[this.currentPathPoints.length - 1]).setY(this.yOffset);
            }
        }
        // -----------------------------------------

        // --- Calcul de l'animation (reste ici) ---
        if (this.animationHandler) {
            const effectiveAnimationSpeed = this.visualSpeed * (this.config?.agentAnimationSpeedFactor ?? 1.0);
            const walkTime = currentGameTime / 1000 * effectiveAnimationSpeed;
            this.animationHandler.update(walkTime, this.isLodActive); // Met à jour les matrices internes
            this.currentAnimationMatrix = this.animationHandler.animationMatrices; // Récupère les matrices à jour
        } else {
            this._resetAnimationMatrices(); // Fallback
        }
        // ----------------------------------------
    }

	update(deltaTime, currentHour) {
        // États inactifs ou en attente (WAITING_FOR_PATH est maintenant géré passivement, l'agent attend setPath)
        if (this.currentState === AgentState.IDLE || this.currentState === AgentState.WAITING_FOR_PATH) { // <-- Utilisation de l'import (x2)
            // this.isVisible = (this.currentState === 'WAITING_FOR_PATH'); // Optionnel: le rendre visible en attendant ?
            return;
        }

        // --- 1. Logique de changement d'état basée sur l'heure (Appelle requestPath si besoin) ---
        const previousState = this.currentState;
        switch (this.currentState) {
            case AgentState.AT_HOME: // <-- Utilisation de l'import (x2)
                this.isVisible = false;
                if (currentHour >= 8 && currentHour < 19 && this.workPosition && this.homeGridNode && this.workGridNode) {
                   // console.log(`Agent ${this.id} leaving home for work.`);
                   this.requestPath(this.position, this.workPosition, this.homeGridNode, this.workGridNode, currentHour);
                }
                break;
            case AgentState.AT_WORK: // <-- Utilisation de l'import (x2)
                this.isVisible = false;
                if ((currentHour >= 19 || currentHour < 8) && this.homePosition && this.workGridNode && this.homeGridNode) {
                    // console.log(`Agent ${this.id} leaving work for home.`);
                    this.requestPath(this.position, this.homePosition, this.workGridNode, this.homeGridNode, currentHour);
                }
                break;
        }
         // Si l'état a changé suite à requestPath (vers WAITING_FOR_PATH), on arrête l'update ici pour cette frame.
         if(this.currentState === AgentState.WAITING_FOR_PATH) { // <-- Utilisation de l'import
             return;
         }


        // --- 2. Logique de déplacement (si en mouvement : GOING_TO_WORK ou GOING_HOME) ---
        if (this.currentState === AgentState.IN_TRANSIT_TO_WORK || this.currentState === AgentState.IN_TRANSIT_TO_HOME) { // <-- Utilisation de l'import (x2)

            // Vérification si le chemin est valide (pourrait devenir null entre-temps?)
            if (!this.path || this.currentPathIndex >= this.path.length) {
                 // console.warn(`Agent ${this.id}: In moving state ${this.currentState} but no valid path.`);
                 // Tenter de revenir à un état stable basé sur la destination prévue
                 this.currentState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK && this.workPosition) ? AgentState.AT_WORK : (this.homePosition ? AgentState.AT_HOME : AgentState.IDLE); // <-- Utilisation de l'import (x4)
                 this.isVisible = false;
                 this.path = null; // Assurer que le chemin est bien null
                 return;
            }

            this.isVisible = true;

            // --- Déplacement & Orientation (Mouvement Continu) ---
            const targetPathPoint = this.path[this.currentPathIndex];
            this._targetPosition.copy(targetPathPoint);

            const distanceToTargetSq = this.position.distanceToSquared(this._targetPosition);
            const distanceToTarget = Math.sqrt(distanceToTargetSq);
            const moveThisFrame = this.speed * (deltaTime / 1000);

            let hasArrivedAtPathPoint = false;

            // --- Mouvement ---
            if (distanceToTarget > 0.001) {
                this._direction.copy(this._targetPosition).sub(this.position).normalize();
                const actualMove = Math.min(moveThisFrame, distanceToTarget);
                this.position.addScaledVector(this._direction, actualMove);

                // Mettre à jour la cible d'orientation vers le point actuel
                this._lookTarget.copy(targetPathPoint);
                if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                   const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                   this._targetOrientation.setFromRotationMatrix(lookMatrix);
                }

                // Vérifier si on a atteint la cible (ou presque)
                // Utiliser distance AVANT mouvement + tolerance
                if (distanceToTarget <= actualMove + this.reachTolerance) {
                    hasArrivedAtPathPoint = true;
                }
            } else {
                 hasArrivedAtPathPoint = true; // Déjà sur la cible
            }

            // --- Logique d'Arrivée au point de chemin ---
            if (hasArrivedAtPathPoint) {
                this.currentPathIndex++;

                // Vérifier si fin du chemin COMPLET
                if (this.currentPathIndex >= this.path.length) {
                    this.position.copy(targetPathPoint); // Snap final
                    const finalState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME; // <-- Utilisation de l'import (x3)
                    // console.log(`Agent ${this.id} reached destination. Transition to ${finalState}`);
                    this.currentState = finalState;
                    this.isVisible = false;
                    this.path = null;
                    this.currentPathIndex = 0; // Réinitialiser
                    return; // Fin de l'update
                } else {
                    // Pas la fin : viser le PROCHAIN point pour la rotation
                    const nextTargetPathPoint = this.path[this.currentPathIndex];
                    this._lookTarget.copy(nextTargetPathPoint);
                    if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                        const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                        this._targetOrientation.setFromRotationMatrix(lookMatrix);
                    }
                }
            }
            // Si pas arrivé, _targetOrientation vise toujours le point courant

            // --- Interpolation d'Orientation (Slerp) ---
            if(this.isVisible) { // Appliquer seulement si visible et en mouvement
                const deltaSeconds = deltaTime / 1000;
                // Utiliser une constante pour le taux de Slerp pour une rotation plus fluide
                // ou la formule basée sur l'exponentielle si vous préférez frame-rate independent
                const slerpAlpha = Math.min(this.rotationSpeed * deltaSeconds, 1.0); // Simple, dépend du framerate
                // const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds); // Indépendant du framerate
                this.orientation.slerp(this._targetOrientation, slerpAlpha);
            }
            // ------------------------------------------

        } // Fin if (en déplacement)
    }

	destroy() {
        this.path = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        this.experience = null; // Libérer la référence à Experience
    }

    // Ajouter une méthode de secours pour forcer le retour à la maison
    forceReturnHome(currentGameTime) {
        console.warn(`Agent ${this.id}: Forçage du retour à la maison par téléportation directe`);
        
        // Forcer la position de l'agent à son domicile
        if (this.homePosition) {
            this.position.copy(this.homePosition);
            this.position.y += this.yOffset;
        }
        
        // Réinitialiser tous les drapeaux et états
        this.isInsidePark = false;
        this.parkSidewalkPosition = null;
        this.parkSidewalkGridNode = null;
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;
        this.weekendWalkEndTime = -1;
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        this.hasReachedDestination = false; // Assurer que ce flag est aussi réinitialisé
        this._stateStartTime = null; // Réinitialiser le timer de blocage
        this._pathRequestTimeout = null; // Annuler un éventuel timeout de path request
        
        // Définir l'état à AT_HOME et cacher l'agent
        this.currentState = AgentState.AT_HOME;
        this.isVisible = false;
        
        // Enregistrer l'heure d'arrivée
        this.lastArrivalTimeHome = currentGameTime;
        this.requestedPathForDepartureTime = -1;

        // --- OPTIMISATION: Calculer le prochain check ---
        this._calculateAndSetNextCheckTime(currentGameTime);
        // --- FIN OPTIMISATION ---
    }

    // Nouvelle méthode pour réinitialiser les matrices d'animation
    _resetAnimationMatrices() {
        // Réinitialiser toutes les matrices d'animation à l'identité
        Object.keys(this.currentAnimationMatrix).forEach(key => {
            this.currentAnimationMatrix[key].identity();
        });
    }

    // Ajouter une méthode pour calculer et définir le prochain contrôle d'état nécessaire
    _calculateAndSetNextCheckTime(currentGameTime, recalculate = false) {
        // Calculer le prochain contrôle d'état nécessaire
        const nextCheckTime = currentGameTime + 10000; // 10 secondes à partir de maintenant
        this._nextStateCheckTime = nextCheckTime;
        if (recalculate) {
            this._nextStateCheckTime = currentGameTime + 10000; // 10 secondes à partir de maintenant
        }
    }
}

// Export de l'enum pour usage externe
Agent.prototype.constructor.AgentState = AgentState;

// --- AJOUT pour stocker l'état précédent pour le timer --- 
Agent.prototype._previousStateForStartTime = null; 
// --- FIN AJOUT --- 