// src/World/Agent.js
import * as THREE from 'three';
import WorkScheduleStrategy from '../Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from '../Strategies/WeekendWalkStrategy.js';
import AgentState from './AgentState.js';
import AgentAnimation from './AgentAnimation.js';
import AgentStateMachine from './AgentStateMachine.js';
import AgentWeekendBehavior from './AgentWeekendBehavior.js';
import AgentVehicleBehavior from './AgentVehicleBehavior.js';
import AgentMedicationBehavior from './AgentMedicationBehavior.js';
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
        this.medicationBehavior = new AgentMedicationBehavior(this);

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
        // Récupérer les managers nécessaires
        const agentManager = this.experience.world?.agentManager;
        const navigationManager = this.experience.world?.cityManager?.navigationManager;
        
        // Debug info - plus d'informations sur l'objectif du chemin
        console.log(`[Agent ${this.id} DEBUG] requestPath: État actuel=${this.currentState}, but=${this._currentPathRequestGoal}, nextState=${nextStateIfSuccess}`);
        
        // Vérifier l'état actuel pour déterminer le mode de déplacement (piéton ou véhicule)
        const isVehicle = this.currentState === AgentState.REQUESTING_PATH_FOR_WORK_VEHICLE || 
                          this.currentState === AgentState.REQUESTING_PATH_FOR_HOME_VEHICLE;
        
        // Déterminer l'état pour les statistiques
        let requestingState = this.currentState;
        
        // Vérifications préliminaires
        if (!agentManager) {
            console.error(`Agent ${this.id}: AgentManager non disponible pour requête path.`);
            return;
        }
        
        if (!navigationManager) {
            console.error(`Agent ${this.id}: NavigationManager non disponible pour requête path.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats);
            return;
        }
        
        // Mettre à jour les flags d'état
        this.isVisible = false; // Cache l'agent pendant la requête
        this._pathRequestTimeout = this.experience.time.elapsed;
        
        // Mise à jour des statistiques
        if (agentManager?.stats) {
            const dayDurationMs = this.experience.world?.environment?.dayDurationMs || (24 * 60 * 60 * 1000);
            const currentHour = Math.floor((currentGameTimeForStats % dayDurationMs) / (dayDurationMs / 24));
            if (requestingState === AgentState.REQUESTING_PATH_FOR_WORK) agentManager.stats.requestingPathForWorkByHour[currentHour]++;
            else if (requestingState === AgentState.REQUESTING_PATH_FOR_HOME) agentManager.stats.requestingPathForHomeByHour[currentHour]++;
        }
        
        // Demander le chemin via NavigationManager qui gère le cache
        try {
            const pathResult = navigationManager.findPath(
                startPosWorld, 
                endPosWorld, 
                startNodeOverride, 
                endNodeOverride, 
                isVehicle,
                this.id // Pour le debug/tracking
            );
            
            if (pathResult && pathResult.path) {
                // Le chemin a été trouvé, mettre à jour l'agent
                this.setPath(pathResult.path, pathResult.pathLengthWorld);
            } else {
                // Aucun chemin trouvé, gérer l'échec
                console.warn(`Agent ${this.id}: Aucun chemin trouvé entre ${startPosWorld?.toArray()} et ${endPosWorld?.toArray()}`);
                this.forceRecoverFromTimeout(currentGameTimeForStats);
            }
        } catch (error) {
            console.error(`Agent ${this.id}: Erreur lors de la demande de chemin:`, error);
            this.forceRecoverFromTimeout(currentGameTimeForStats);
        }
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
        const wasRequestingCommercial = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_COMMERCIAL;
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
                else if (wasRequestingCommercial) { this.currentState = AgentState.AT_COMMERCIAL; }
                this.currentPathPoints = null; this.currentPathLengthWorld = 0; this.calculatedTravelDurationGame = 0;
                this.departureTimeGame = -1; this.arrivalTmeGame = -1; this.hasReachedDestination = false;
                this.isVisible = false; this._pathRequestTimeout = null;
                console.log(`[Agent ${this.id} DEBUG] Arrivée instantanée détectée. État final : ${this.currentState}`);
                return;
            }
            console.log(`[Agent ${this.id} DEBUG] setPath: Chemin VALIDE reçu (${pathPoints.length} points, longueur ${pathLengthWorld.toFixed(2)}).`);

            if (currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME && this.weekendBehavior.weekendWalkEndTime > 0 && pathPoints.length > 0) {
                const startPoint = pathPoints[0]; const distanceToStartSq = this.position.distanceToSquared(startPoint);
                if (distanceToStartSq > 25.0) {
                    console.warn(`Agent ${this.id}: Correction téléportation! Distance chemin retour maison: ${Math.sqrt(distanceToStartSq).toFixed(2)}m.`);
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
            } else if (wasRequestingCommercial) {
                nextState = AgentState.READY_TO_LEAVE_FOR_COMMERCIAL;
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
            } else if (currentStateAtCall === AgentState.AT_HOME && this._currentPathRequestGoal === 'WORK') {
                // Cas spécial : l'agent est AT_HOME mais a demandé un chemin pour le travail
                // Cela se produit quand nextStateIfSuccess dans requestPath est READY_TO_LEAVE_FOR_WORK
                console.log(`[Agent ${this.id} INFO] setPath: Chemin pour le travail reçu alors qu'en état AT_HOME. Passage à READY_TO_LEAVE_FOR_WORK.`);
                nextState = AgentState.READY_TO_LEAVE_FOR_WORK;
            } else if (currentStateAtCall === AgentState.AT_HOME) {
                // Cas général où l'agent est AT_HOME mais a reçu un chemin non associé à un but spécifique
                console.log(`[Agent ${this.id} INFO] setPath: Chemin reçu alors que déjà AT_HOME sans but spécifique. Ignoré.`);
                this.currentPathPoints = null;
                this.currentPathLengthWorld = 0;
                this.calculatedTravelDurationGame = 0;
                nextState = AgentState.AT_HOME;
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
            } else if (wasRequestingCommercial) {
                console.warn(`[Agent ${this.id} SYNC] Pathfinding COMMERCIAL échoué. Forçage état AT_HOME et téléportation.`);
                fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
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
     * Force la récupération depuis un état bloqué.
     * @param {number} currentGameTime - Le temps de jeu actuel en ms.
     */
    forceRecoverFromTimeout(currentGameTime) {
        console.warn(`Agent ${this.id}: forceRecoverFromTimeout appelé (état=${this.currentState}).`);
        
        // Nettoyer les données de chemin
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.currentPathLengthWorld = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        this.hasReachedDestination = false;
        this._pathRequestTimeout = null;

        // --- Tentative de déterminer le meilleur état cible ---
        let targetState = AgentState.AT_HOME; // État par défaut
        let teleportPosition = this.homePosition;

        switch (this.currentState) {
            case AgentState.IN_TRANSIT_TO_WORK:
            case AgentState.DRIVING_TO_WORK:
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.READY_TO_LEAVE_FOR_WORK:
                // En route vers le travail : récupération vers AT_WORK
                if (this.workPosition) {
                    targetState = AgentState.AT_WORK;
                    teleportPosition = this.workPosition;
                    this.lastArrivalTimeWork = currentGameTime;
                    console.log(`Agent ${this.id}: Récupération -> ${targetState}`);
                }
                break;
            
            case AgentState.IN_TRANSIT_TO_HOME:
            case AgentState.DRIVING_HOME:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                // En route vers la maison : récupération vers AT_HOME
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    this.lastArrivalTimeHome = currentGameTime;
                    console.log(`Agent ${this.id}: Récupération -> ${targetState}`);
                }
                break;

            case AgentState.IN_TRANSIT_TO_COMMERCIAL:
            case AgentState.REQUESTING_PATH_FOR_COMMERCIAL:
            case AgentState.READY_TO_LEAVE_FOR_COMMERCIAL:
            case AgentState.AT_COMMERCIAL: // Ajout de AT_COMMERCIAL pour la récupération
                // En route vers un commercial ou bloqué au commercial : récupération vers AT_HOME
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    console.log(`Agent ${this.id}: Récupération (échec/blocage achat) -> ${targetState}`);
                }
                break;
                
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WEEKEND_WALK_READY:
            case AgentState.WEEKEND_WALKING:
            case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                // Promenade weekend : récupération vers AT_HOME et nettoyage
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    // Réinitialiser l'état de weekend
                    this.weekendBehavior?.resetWeekendState();
                    console.log(`Agent ${this.id}: Récupération (état weekend) -> ${targetState}`);
                }
                break;
                
            default:
                // Autres cas : récupération par défaut vers AT_HOME
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    console.log(`Agent ${this.id}: Récupération (état autre) -> ${targetState}`);
                } else if (this.workPosition) {
                    // Fallback si pas de homePosition
                    targetState = AgentState.AT_WORK;
                    teleportPosition = this.workPosition;
                    console.log(`Agent ${this.id}: Récupération (sans maison) -> ${targetState}`);
                } else {
                    // Cas catastrophique: ni domicile ni travail. Laisser en IDLE.
                    targetState = AgentState.IDLE;
                    teleportPosition = null;
                    console.warn(`Agent ${this.id}: Récupération GRAVE (ni maison ni travail).`);
                }
                break;
        }

        // Sortir du véhicule si nécessaire
        this.vehicleBehavior?.exitVehicle();
        
        // Appliquer l'état cible
        this.currentState = targetState;
        this.isVisible = false; // Cacher l'agent
        
        // Téléporter vers la position cible si disponible
        if (teleportPosition) {
            this.position.copy(teleportPosition).setY(teleportPosition.y + this.yOffset);
        }
        
        // Réinitialiser le timer d'état
        this._stateStartTime = null;
        
        console.log(`Agent ${this.id}: forceRecoverFromTimeout TERMINÉ (nouvel état=${this.currentState}).`);
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
        const isVisuallyMoving = 
            this.currentState === AgentState.IN_TRANSIT_TO_WORK ||
            this.currentState === AgentState.IN_TRANSIT_TO_HOME ||
            this.currentState === AgentState.WEEKEND_WALKING ||
            this.currentState === AgentState.IN_TRANSIT_TO_COMMERCIAL || // Ajout état IN_TRANSIT_TO_COMMERCIAL
            isDriving;

        // --- Réinitialisation si pas en mouvement visuel --- 
        // Ou si l'état est AT_COMMERCIAL (logiquement caché dans le magasin)
        if (!isVisuallyMoving || this.currentState === AgentState.AT_COMMERCIAL) {
            // Positionner à l'emplacement logique (maison ou travail)
            if (this.currentState === AgentState.AT_HOME && this.homePosition) {
                this.position.copy(this.homePosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                this.position.copy(this.workPosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_COMMERCIAL && this.medicationBehavior?.commercialPosition) {
                // Si AT_COMMERCIAL, positionner à la position du magasin (même s'il est invisible)
                this.position.copy(this.medicationBehavior.commercialPosition).setY(this.yOffset);
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
                this.position.copy(carPosition); 
                if (this.animationHandler) this.animationHandler.update(0, false); 
                this.currentAnimationMatrix = this.animationHandler?.animationMatrices;
            } else {
                 console.warn(`Agent ${this.id}: isDriving=true mais voiture non trouvée dans vehicleBehavior.`);
                 this.isVisible = false; 
                 if (this.animationHandler) this.animationHandler.resetMatrices();
                 this.currentAnimationMatrix = this.animationHandler?.animationMatrices;
            }
            return; 
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
        const tempVector = new THREE.Vector3().subVectors(this.position, cameraPosition);
        const distanceToCameraSq = tempVector.lengthSq();
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