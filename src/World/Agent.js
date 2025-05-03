// src/World/Agent.js
import * as THREE from 'three';
import WorkScheduleStrategy from './Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from './Strategies/WeekendWalkStrategy.js';
import AgentState from './AgentState.js';
import AgentAnimation from './AgentAnimation.js';
import AgentStateMachine from './AgentStateMachine.js';
import AgentWeekendBehavior from './AgentWeekendBehavior.js'; // <-- NOUVELLE LIGNE: Import du comportement Weekend

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
        this.visualSpeed = this.agentBaseSpeed * (0.9 + Math.random() * 0.2);
        this.rotationSpeed = config.rotationSpeed ?? 8.0;
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.5;
        this.reachToleranceSq = this.reachTolerance * this.reachTolerance;
        this.lodDistance = 50;
        this.isLodActive = false;

        // --- Propriétés pour les voitures ---
        this.hasVehicle = Math.random() < 0.1;
        this.isUsingVehicle = false;
        this.vehicleHomePosition = null;

        // --- Position & Orientation (Visuel) ---
        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false;

        // --- État & Planification ---
        this.currentState = AgentState.IDLE;
        this.stateMachine = new AgentStateMachine(this); // Machine à états
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        // --- SUPPRIMÉES: Propriétés Weekend déplacées vers AgentWeekendBehavior ---
        // this.weekendWalkDestination = null;
        // this.weekendWalkGridNode = null;
        // this.weekendWalkEndTime = -1;
        // -----------------------------------------------------------------------
        this.hasReachedDestination = false;

        // --- Trajet Actuel ---
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathLengthWorld = 0;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;

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

        // --- Animation Visuelle ---
        this.currentAnimationMatrix = {
            head: new THREE.Matrix4(), torso: new THREE.Matrix4(),
            leftHand: new THREE.Matrix4(), rightHand: new THREE.Matrix4(),
            leftFoot: new THREE.Matrix4(), rightFoot: new THREE.Matrix4(),
        };
        this.animationHandler = new AgentAnimation(this.config, this.experience);

        // --- Stratégies ---
        this.workScheduleStrategy = workScheduleStrategy || new WorkScheduleStrategy();
        // --- NOUVEAU: Passer la stratégie Weekend au Comportement ---
        const effectiveWeekendWalkStrategy = weekendWalkStrategy || new WeekendWalkStrategy();
        this.weekendBehavior = new AgentWeekendBehavior(this, effectiveWeekendWalkStrategy);
        // ----------------------------------------------------------
        // --- SUPPRIMÉ: Stockage direct de weekendWalkStrategy ---
        // this.weekendWalkStrategy = weekendWalkStrategy || new WeekendWalkStrategy();
        // ------------------------------------------------------

        // --- Variables temporaires ---
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempMatrix = new THREE.Matrix4();
        this._targetOrientation = new THREE.Quaternion();
        this._lookTarget = new THREE.Vector3();
        this._targetPosition = new THREE.Vector3();
        this._direction = new THREE.Vector3();

        // Matrice de transformation pour le rendu
        this.matrix = new THREE.Matrix4();

        this._calculateScheduledTimes();

        // --- SUPPRIMÉES: Propriétés Parc déplacées vers AgentWeekendBehavior ---
        // this.isInsidePark = false;
        // this.parkSidewalkPosition = null;
        // this.parkSidewalkGridNode = null;
        // this.nextParkMovementTime = 0;
        // -----------------------------------------------------------------
        this.sidewalkHeight = experience.world?.cityManager?.getNavigationGraph(false)?.sidewalkHeight || 0.2;

		this.currentVehicle = null;
        this._lastPositionCheck = null;

        // Propriétés pour les mécanismes de secours
        this._pathRequestTimeout = null;
        this._stateStartTime = null;

        // --- OPTIMISATION ---
        this._nextStateCheckTime = -1;
        // --- FIN OPTIMISATION ---

        this.isInVehicle = false;
    }

	_calculateScheduledTimes() {
        const environment = this.experience.world?.environment;
        if (!environment || !environment.isInitialized || environment.dayDurationMs <= 0) {
             console.warn(`Agent ${this.id}: Impossible de calculer les heures planifiées (env non prêt).`);
             return;
        }
        const dayDurationMs = environment.dayDurationMs;
        const msPerHour = dayDurationMs / 24;
        const msPerMinute = msPerHour / 60;

        // Heure exacte de départ travail (ex: 8h00)
        this.exactWorkDepartureTimeGame = this.departureWorkHour * msPerHour;
        // Heure d'anticipation pour demander le chemin (ex: 7h55)
        this.prepareWorkDepartureTimeGame = this.exactWorkDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
         // Gérer le cas où l'anticipation passe au jour précédent (modulo)
         if (this.prepareWorkDepartureTimeGame < 0) {
             this.prepareWorkDepartureTimeGame += dayDurationMs;
         }

        // Heure exacte de départ maison (ex: 19h00)
        this.exactHomeDepartureTimeGame = this.departureHomeHour * msPerHour;
        // Heure d'anticipation pour demander le chemin (ex: 18h55)
        this.prepareHomeDepartureTimeGame = this.exactHomeDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
         // Gérer le modulo
         if (this.prepareHomeDepartureTimeGame < 0) {
             this.prepareHomeDepartureTimeGame += dayDurationMs;
         }

         // console.log(`Agent <span class="math-inline">\{this\.id\} Scheduled Times \(ms\)\: PrepareWork\=</span>{this.prepareWorkDepartureTimeGame.toFixed(0)}, DepartWork=<span class="math-inline">\{this\.exactWorkDepartureTimeGame\.toFixed\(0\)\}, PrepareHome\=</span>{this.prepareHomeDepartureTimeGame.toFixed(0)}, DepartHome=${this.exactHomeDepartureTimeGame.toFixed(0)}`);
    }

	initializeLifecycle(homeId, workId) {
		this.homeBuildingId = homeId;
		this.workBuildingId = workId;
		const cityManager = this.experience.world?.cityManager;
		const navGraph = cityManager?.getNavigationGraph();
		const sidewalkHeight = navGraph?.sidewalkHeight ?? cityManager?.config?.sidewalkHeight ?? 0.2;

		const homeInfo = cityManager?.getBuildingInfo(this.homeBuildingId);
		if (homeInfo) {
			let baseHomePos = homeInfo.position.clone();
			baseHomePos.y = sidewalkHeight;
			this.homeGridNode = navGraph?.getClosestWalkableNode(baseHomePos) || null;
			this.homePosition = this.homeGridNode ? navGraph.gridToWorld(this.homeGridNode.x, this.homeGridNode.y) : baseHomePos;
			this.position.copy(this.homePosition); // Position initiale visuelle
			this.position.y += this.yOffset;       // Appliquer l'offset Y

            // Initialiser la position de garage de la voiture (à côté de la maison)
            if (this.hasVehicle) {
                // Créer une position légèrement décalée pour la voiture
                this.vehicleHomePosition = this.homePosition.clone();
                this.vehicleHomePosition.x += (Math.random() - 0.5) * 2; // Petit décalage aléatoire
                this.vehicleHomePosition.z += (Math.random() - 0.5) * 2;
                this.vehicleHomePosition.y = 0.25; // Hauteur de la voiture
            }

			this.currentState = AgentState.AT_HOME; // <-- Utilisation de l'import
			this.isVisible = false;
		} else {
			console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} non trouvées.`);
			this.currentState = AgentState.IDLE; // <-- Utilisation de l'import
			this.isVisible = false;
			return; // Sortir si pas de domicile
		}

		const workInfo = cityManager?.getBuildingInfo(this.workBuildingId);
		if (workInfo) {
			let baseWorkPos = workInfo.position.clone();
			baseWorkPos.y = sidewalkHeight;
			this.workGridNode = navGraph?.getClosestWalkableNode(baseWorkPos) || null;
			this.workPosition = this.workGridNode ? navGraph.gridToWorld(this.workGridNode.x, this.workGridNode.y) : baseWorkPos;
		} else {
			console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} non trouvées.`);
			this.workPosition = null; this.workGridNode = null;
		}

		// (Ré)Calculer les temps planifiés car l'environnement est peut-être prêt maintenant
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
     * Calcule les nœuds de grille appropriés en fonction du mode de transport (isVehicle).
     * @param {THREE.Vector3 | null} startPosWorld - Position de départ mondiale. Null si startNodeOverride est fourni.
     * @param {THREE.Vector3 | null} endPosWorld - Position d'arrivée mondiale. Null si endNodeOverride est fourni.
     * @param {{x: number, y: number} | null} startNodeOverride - Nœud de grille de départ explicite (optionnel, pour cas spécifiques).
     * @param {{x: number, y: number} | null} endNodeOverride - Nœud de grille d'arrivée explicite (optionnel, pour cas spécifiques).
     * @param {string} nextStateIfSuccess - L'état vers lequel passer si le chemin est trouvé.
     * @param {number} currentGameTimeForStats - Temps de jeu actuel pour les statistiques.
     */
    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null, nextStateIfSuccess, currentGameTimeForStats) {
        // Stocker l'état cible (utile pour retour de promenade weekend)
        this.targetStateFromWeekendWalk = nextStateIfSuccess;

        // Réinitialiser les données du chemin précédent
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        this.currentPathLengthWorld = 0;

        // Déterminer l'état d'attente approprié
        let requestingState = AgentState.WAITING_FOR_PATH; // État générique par défaut // <-- Utilisation de l'import
        if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_WORK || nextStateIfSuccess === AgentState.DRIVING_TO_WORK) {
             requestingState = AgentState.REQUESTING_PATH_FOR_WORK; // <-- Utilisation de l'import
        } else if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_HOME || nextStateIfSuccess === AgentState.DRIVING_HOME) {
             requestingState = AgentState.REQUESTING_PATH_FOR_HOME; // <-- Utilisation de l'import
        } else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_READY) {
             requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH; // <-- Utilisation de l'import
        } else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
             requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH; // Même état d'attente // <-- Utilisation de l'import
        }
        this.currentState = requestingState;
        this.isVisible = false; // Cacher l'agent pendant la requête

        // Démarrer le timer de timeout pour la requête
        this._pathRequestTimeout = this.experience.time.elapsed;

        // Récupérer les managers nécessaires
        const agentManager = this.experience.world?.agentManager;
        const cityManager = this.experience.world?.cityManager;
        const navigationManager = cityManager?.navigationManager;

        // Déterminer le mode de transport basé sur l'état interne de l'agent
        let isVehicle = this.isInVehicle;

        // *** AJOUT : Forcer le mode piéton pour les requêtes de promenade weekend ***
        if (requestingState === AgentState.WEEKEND_WALK_REQUESTING_PATH) { // <-- Utilisation de l'import
            if (isVehicle) {
                console.warn(`Agent ${this.id}: Forçage mode PIÉTON pour requête WEEKEND_WALK (était ${isVehicle}).`);
            }
            isVehicle = false;
        }
        // *** FIN AJOUT ***

        // --- Statistiques (si agentManager existe) ---
        if (agentManager?.stats) {
             const dayDurationMs = this.experience.world?.environment?.dayDurationMs || (24*60*60*1000);
             const currentHour = Math.floor((currentGameTimeForStats % dayDurationMs) / (dayDurationMs/24));
             if (requestingState === AgentState.REQUESTING_PATH_FOR_WORK) { // <-- Utilisation de l'import
                  agentManager.stats.requestingPathForWorkByHour[currentHour] = (agentManager.stats.requestingPathForWorkByHour[currentHour] || 0) + 1;
             } else if (requestingState === AgentState.REQUESTING_PATH_FOR_HOME) { // <-- Utilisation de l'import
                 agentManager.stats.requestingPathForHomeByHour[currentHour] = (agentManager.stats.requestingPathForHomeByHour[currentHour] || 0) + 1;
             }
             // Ajouter stats pour weekend si besoin
         }
        // --- Fin Statistiques ---

        // --- Vérifications Préliminaires ---
        if (!navigationManager || !agentManager || !agentManager.isWorkerInitialized) {
            console.error(`Agent ${this.id}: Managers non prêts pour requête path (Nav: ${!!navigationManager}, AgentMgr: ${!!agentManager}, WorkerInit: ${agentManager?.isWorkerInitialized}).`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Fallback état stable // <-- Utilisation de l'import
            this.isVisible = false;
            this._pathRequestTimeout = null; // Annuler timeout
            return;
        }

        // --- Obtenir le Graphe de Navigation Correct ---
        const navigationGraph = navigationManager.getNavigationGraph(isVehicle); // <<< Utilise isVehicle
        // ----------------------------------------------

        if (!navigationGraph) {
            console.error(`Agent ${this.id}: NavigationGraph non disponible pour mode ${isVehicle ? 'véhicule' : 'piéton'}.`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // <-- Utilisation de l'import
            this.isVisible = false;
            this._pathRequestTimeout = null; // Annuler timeout
            return;
        }

        // --- Calcul des Nœuds de Départ et d'Arrivée ---
        let startNode = null;
        let endNode = null;

        // Priorité aux overrides s'ils sont fournis et valides
        if (startNodeOverride && typeof startNodeOverride.x === 'number' && typeof startNodeOverride.y === 'number') {
             startNode = startNodeOverride;
        }
        if (endNodeOverride && typeof endNodeOverride.x === 'number' && typeof endNodeOverride.y === 'number') {
             endNode = endNodeOverride;
        }

        // Si les nœuds ne sont pas (ou pas valides) via override, les calculer depuis les positions monde
        // en utilisant le **bon** graphe de navigation (routier ou piéton).
        if (!startNode && startPosWorld) {
            // Vérifier que startPosWorld est bien un Vector3 avant de l'utiliser
            if (startPosWorld instanceof THREE.Vector3) {
                startNode = navigationGraph.getClosestWalkableNode(startPosWorld); // <<< Utilise le bon graphe
            } else {
                console.error(`Agent ${this.id}: startPosWorld fourni mais n'est pas un Vector3.`);
            }
        }
        if (!endNode && endPosWorld) {
             // Vérifier que endPosWorld est bien un Vector3
             if (endPosWorld instanceof THREE.Vector3) {
                endNode = navigationGraph.getClosestWalkableNode(endPosWorld); // <<< Utilise le bon graphe
             } else {
                 console.error(`Agent ${this.id}: endPosWorld fourni mais n'est pas un Vector3.`);
             }
        }
        // --- Fin Calcul des Nœuds ---

        // --- Vérification Finale des Nœuds Calculés ---
        if (!startNode || !endNode || typeof startNode.x !== 'number' || typeof startNode.y !== 'number' || typeof endNode.x !== 'number' || typeof endNode.y !== 'number') {
            console.error(`Agent ${this.id} (${isVehicle ? 'véhicule' : 'piéton'}): Nœud départ ou arrivée MANQUANT/INVALID après calcul final. StartNode: ${JSON.stringify(startNode)}, EndNode: ${JSON.stringify(endNode)}. Fallback état stable.`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Ou AT_WORK si plus pertinent // <-- Utilisation de l'import
            this.isVisible = false;
            this._pathRequestTimeout = null; // Annuler timeout
            return;
        }

        // --- Visualisation Debug (Optionnel) ---
        if (this.experience.world && startNode && endNode) {
             const vizNavGraph = navigationManager.getNavigationGraph(isVehicle); // Utiliser le bon graph pour la visualisation
             if (vizNavGraph) {
                 const startWorldPosViz = vizNavGraph.gridToWorld(startNode.x, startNode.y);
                 const endWorldPosViz = vizNavGraph.gridToWorld(endNode.x, endNode.y);
                 this.experience.world.showStartNodeDebugSphere(startWorldPosViz);
                 this.experience.world.showEndNodeDebugSphere(endWorldPosViz);
             }
        }
        // --- Fin Visualisation ---

        // --- Vérification Format Nœuds avant Envoi (Sécurité) ---
        // (On garde cette vérification même si la logique précédente devrait garantir des entiers positifs)
        if (!Number.isInteger(startNode.x) || startNode.x < 0 ||
            !Number.isInteger(startNode.y) || startNode.y < 0 ||
            !Number.isInteger(endNode.x) || endNode.x < 0 ||
            !Number.isInteger(endNode.y) || endNode.y < 0)
        {
            console.error(`Agent ${this.id}: FORMAT NOEUDS INVALIDE (non-entier ou négatif) AVANT ENVOI WORKER! Start:`, startNode, "End:", endNode);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // <-- Utilisation de l'import
            this.isVisible = false;
             this._pathRequestTimeout = null; // Annuler timeout
            return;
        }
        // --- Fin Vérification Format ---

        // --- LOG AVANT WORKER ---
        console.log(`[AGENT ${this.id} PATH_REQ] Mode: ${isVehicle ? 'Veh' : 'Ped'}, StartW: (${startPosWorld?.x.toFixed(1)}, ${startPosWorld?.z.toFixed(1)}), EndW: (${endPosWorld?.x.toFixed(1)}, ${endPosWorld?.z.toFixed(1)}), StartN: (${startNode.x},${startNode.y}), EndN: (${endNode.x},${endNode.y}), NextState: ${nextStateIfSuccess}`);
        // --- FIN LOG ---

        // --- Envoi de la Requête au Worker ---
        // console.log(`Agent ${this.id}: Envoi requête path au worker. Mode: ${isVehicle ? 'Véhicule' : 'Piéton'}. StartNode: (${startNode.x},${startNode.y}), EndNode: (${endNode.x},${endNode.y}). NextState: ${nextStateIfSuccess}`);
        agentManager.requestPathFromWorker(this.id, startNode, endNode, isVehicle); // <<< isVehicle est bien passé ici
    }

	/**
	 * Définit le chemin à suivre pour l'agent et met à jour son état.
	 * Appelée par AgentManager lorsque le worker renvoie un résultat de pathfinding.
	 * @param {Array<THREE.Vector3> | null} pathPoints - Tableau de points du chemin en coordonnées monde, ou null si échec.
	 * @param {number} pathLengthWorld - Longueur calculée du chemin en unités monde.
	 */
	setPath(pathPoints, pathLengthWorld) {
		// LOG A: Entrée dans la fonction
		console.log(`[Agent ${this.id} DEBUG] Entrée dans setPath. État actuel: ${this.currentState}. Longueur reçue: ${pathLengthWorld}`);

		const currentStateAtCall = this.currentState;
		const wasRequestingWork = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_WORK; // <-- Utilisation de l'import
		const wasRequestingHome = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME; // <-- Utilisation de l'import
		const wasRequestingWeekendWalk = currentStateAtCall === AgentState.WEEKEND_WALK_REQUESTING_PATH; // <-- Utilisation de l'import
		const targetStateFromWeekendWalk = this.targetStateFromWeekendWalk; // Récupérer l'état cible mémorisé

		// *** AJOUT : Récupérer les informations du calendrier pour vérifier si c'est toujours le weekend ***
		const environment = this.experience.world?.environment;
		const calendarInfo = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;
		const isCurrentlyWeekend = calendarInfo ? ["Samedi", "Dimanche"].includes(calendarInfo.jourSemaine) : false;
		// *** FIN AJOUT ***

		// --- Cas 1: Chemin Valide Reçu ---
		// Condition modifiée pour accepter longueur 0 si le chemin a 1 seul point (départ=arrivée)
		if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && (pathPoints.length === 1 || pathLengthWorld > 0.1)) {
			// Si la longueur est négligeable, considérer l'arrivée immédiate et éviter l'état IN_TRANSIT_* bloqué
			const isInstantArrival = pathLengthWorld < 0.01 || pathPoints.length === 1;
			if (isInstantArrival) {
				// Déterminer directement l'état cible sans passer par un état de transit
				if (wasRequestingWork) {
					this.currentState = AgentState.AT_WORK; // <-- Utilisation de l'import
					this.lastArrivalTimeWork = this.experience.time.elapsed;
				} else if (wasRequestingHome) {
					this.currentState = AgentState.AT_HOME; // <-- Utilisation de l'import
					this.lastArrivalTimeHome = this.experience.time.elapsed;
				} else if (wasRequestingWeekendWalk) {
					// Pour une promenade de week-end on considère qu'elle s'est terminée instantanément
					this.currentState = AgentState.AT_HOME; // <-- Utilisation de l'import
					this.weekendWalkEndTime = -1;
				}
				// Nettoyage des données de chemin pour éviter tout traitement visuel inutile
				this.currentPathPoints = null;
				this.currentPathLengthWorld = 0;
				this.calculatedTravelDurationGame = 0;
				this.departureTimeGame = -1;
				this.arrivalTmeGame = -1;
				this.hasReachedDestination = false;
				this.isVisible = false;
				this._pathRequestTimeout = null;
				console.log(`[Agent ${this.id} DEBUG] Arrivée instantanée détectée (pathLength=${pathLengthWorld}). État final : ${this.currentState}`);
				return; // Sortir de setPath car tout est réglé
			}
			// LOG B: Chemin considéré comme valide
			console.log(`[Agent ${this.id} DEBUG] setPath: Chemin VALIDE reçu (${pathPoints.length} points, longueur ${pathLengthWorld.toFixed(2)}).`);

			// Vérification anti-téléportation (spécifique au retour de promenade)
			if (currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME && this.weekendWalkEndTime > 0 && pathPoints.length > 0) { // <-- Utilisation de l'import
				const startPoint = pathPoints[0];
				const distanceToStart = this.position.distanceTo(startPoint);
				if (distanceToStart > 5.0) {
					console.warn(`Agent ${this.id}: Correction téléportation! Distance au début chemin retour maison: ${distanceToStart.toFixed(2)}m. Remplacement par position actuelle.`);
					pathPoints[0] = this.position.clone();
					// Recalculer la longueur pourrait être nécessaire si la correction est significative,
					// mais pour l'instant on garde la longueur calculée par le worker.
				}
			}

			// --- Assignation des données du chemin ---
			this.currentPathPoints = pathPoints.map(p => p.clone());
			this.currentPathLengthWorld = pathLengthWorld;

			// --- Calcul durée trajet ---
			const travelSecondsGame = pathLengthWorld / this.agentBaseSpeed;
			const dayDurationMs = this.experience.world?.environment?.dayDurationMs;
			if (dayDurationMs > 0) {
				const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
				this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
			} else {
				console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}) pour calcul durée trajet. Fallback.`);
				this.calculatedTravelDurationGame = 10 * 60 * 1000; // 10 mins jeu
				this.currentPathLengthWorld = 0; // Longueur invalide dans ce cas
			}

			// --- Transition d'état ---
			let nextState = this.currentState; // Pour logger l'état final
			if (wasRequestingWork) {
				// Si on était en requête pour le travail, on est prêt à partir (en voiture ou à pied)
				nextState = this.isInVehicle ? AgentState.READY_TO_LEAVE_FOR_WORK : AgentState.READY_TO_LEAVE_FOR_WORK; // Dans les 2 cas, on est prêt // <-- Utilisation de l'import
			} else if (wasRequestingHome) {
				// Si on était en requête pour la maison, on est prêt à partir (en voiture ou à pied)
				nextState = this.isInVehicle ? AgentState.READY_TO_LEAVE_FOR_HOME : AgentState.READY_TO_LEAVE_FOR_HOME; // Dans les 2 cas, on est prêt // <-- Utilisation de l'import
			} else if (wasRequestingWeekendWalk) {
				// *** MODIFICATION : Vérifier si c'est TOUJOURS le weekend ***
				if (isCurrentlyWeekend) {
					// C'est toujours le weekend, procéder normalement
					if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) { // <-- Utilisation de l'import
						nextState = AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK; // <-- Utilisation de l'import
					} else {
						nextState = AgentState.WEEKEND_WALK_READY; // <-- Utilisation de l'import
					}
				} else {
					// Le weekend est terminé pendant l'attente du chemin ! Annuler la promenade.
					console.warn(`[Agent ${this.id} WARN] setPath: Chemin promenade reçu mais weekend terminé. Annulation promenade, retour AT_HOME.`);
					this.currentPathPoints = null; // Invalider le chemin reçu
					this.currentPathLengthWorld = 0;
					this.calculatedTravelDurationGame = 0;
					nextState = AgentState.AT_HOME; // Passer à un état stable de semaine // <-- Utilisation de l'import
					this.weekendWalkDestination = null; // Nettoyer les infos de weekend
					this.weekendWalkGridNode = null;
					this.weekendWalkEndTime = -1;
				}
				// *** FIN MODIFICATION ***
			} else {
				console.warn(`[Agent ${this.id} WARN] setPath: Chemin valide reçu mais état initial (${currentStateAtCall}) n'était pas REQUESTING_... Pas de changement d'état forcé.`);
				nextState = this.currentState; // Garder l'état actuel
			}
			// LOG C: Log du changement d'état
			console.log(`[Agent ${this.id} DEBUG] setPath: Changement d'état de ${currentStateAtCall} vers ${nextState}`);
			this.currentState = nextState;

			// --- Annulation du Timeout ---
			// LOG D: Log avant annulation
			console.log(`[Agent ${this.id} DEBUG] setPath (succès): Annulation du _pathRequestTimeout (était ${this._pathRequestTimeout}).`);
			this._pathRequestTimeout = null; // Annuler le timer car le chemin est reçu

		}
		// --- Cas 2: Chemin Invalide ou Échec Pathfinding ---
		else {
			// LOG E: Log chemin invalide
			console.warn(`[Agent ${this.id} DEBUG] setPath: Chemin INVALIDE reçu (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}, length: ${pathLengthWorld}). État au moment de l'appel: ${currentStateAtCall}`);

			// --- Réinitialisation des données de chemin ---
			this.currentPathPoints = null;
			this.calculatedTravelDurationGame = 0;
			this.currentPathLengthWorld = 0;
			this.departureTimeGame = -1;
			this.arrivalTmeGame = -1;
			this.currentPathIndexVisual = 0;
			this.visualInterpolationProgress = 0;

			// --- *** NOUVELLE LOGIQUE DE FALLBACK : SYNCHRONISATION VERS L'ÉTAT CIBLE *** ---
			let fallbackState = this.currentState; // Par défaut, on garde l'état si aucun cas ne correspond
			let teleportPosition = null;
			let forceVisibilityFalse = true; // Par défaut, cacher l'agent après téléportation

			if (wasRequestingWork) {
				console.warn(`[Agent ${this.id} SYNC] Pathfinding WORK échoué. Forçage état AT_WORK et téléportation.`);
				fallbackState = AgentState.AT_WORK; // <-- Utilisation de l'import
				teleportPosition = this.workPosition;
				// Mettre à jour l'heure d'arrivée pour cohérence (même si instantané)
				this.lastArrivalTimeWork = this.experience.time.elapsed;
				this.requestedPathForDepartureTime = -1; // Prêt pour le retour
			} else if (wasRequestingHome) {
				console.warn(`[Agent ${this.id} SYNC] Pathfinding HOME échoué. Forçage état AT_HOME et téléportation.`);
				fallbackState = AgentState.AT_HOME; // <-- Utilisation de l'import
				teleportPosition = this.homePosition;
				// Mettre à jour l'heure d'arrivée
				this.lastArrivalTimeHome = this.experience.time.elapsed;
				this.requestedPathForDepartureTime = -1; // Prêt pour le départ travail
			} else if (wasRequestingWeekendWalk) {
				// Pour le weekend, la logique précédente de fallback (annuler ou réessayer) est conservée car une téléportation n'a pas de sens logique fort.
				console.warn(`[Agent ${this.id} WARN] Pathfinding WEEKEND WALK échoué (état ${targetStateFromWeekendWalk}).`);
				if (isCurrentlyWeekend) {
					if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) { // <-- Utilisation de l'import
						console.warn(`[Agent ${this.id}] Échec retour trottoir. Tentative téléportation trottoir puis requête retour maison.`);
						if (this.parkSidewalkPosition) {
							this.position.copy(this.parkSidewalkPosition).setY(this.yOffset);
							this.isInsidePark = false;
							forceVisibilityFalse = false; // Peut rester visible sur trottoir
							console.log(`[Agent ${this.id}] Téléporté au trottoir. Redemande chemin maison.`);
							// Redemander chemin maison immédiatement
							fallbackState = AgentState.REQUESTING_PATH_FOR_HOME; // Nouvel état d'attente // <-- Utilisation de l'import
							this._pathRequestTimeout = this.experience.time.elapsed; // Relancer timeout
							const currentGridNode = this.experience.world?.cityManager?.navigationManager?.getNavigationGraph(false)?.getClosestWalkableNode(this.position);
							this.requestPath(this.position, this.homePosition, currentGridNode, this.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, this.experience.time.elapsed); // <-- Utilisation de l'import
							// IMPORTANT: On sort de setPath ici car une nouvelle requête est lancée
							console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après requête retour maison depuis trottoir.`);
							return;
						} else {
							console.warn(`[Agent ${this.id}] Position trottoir inconnue. Forçage maison.`);
							this.forceReturnHome(this.experience.time.elapsed);
							fallbackState = AgentState.AT_HOME; // État après forceReturnHome // <-- Utilisation de l'import
							teleportPosition = this.homePosition; // Assurer téléportation visuelle aussi
						}
					} else { // Échec requête initiale promenade
						console.warn(`[Agent ${this.id}] Échec pathfinding promenade initiale. Tentative nouvelle destination.`);
						// Tenter de trouver une autre destination UNIQUEMENT si on est toujours le weekend
						const foundNew = this._findRandomWalkDestination(this.experience.time.elapsed); // Cherche une autre destination
						if (!foundNew) {
						    console.warn(`[Agent ${this.id}] Impossible de trouver une autre destination de promenade. Retour AT_HOME.`);
						    fallbackState = AgentState.AT_HOME; // <-- Utilisation de l'import
						    teleportPosition = this.homePosition;
						} else {
						    // Si une nouvelle destination est trouvée, requestPath a été appelée. On sort.
						     console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après nouvelle requête promenade.`);
						    return;
						}
					}
				} else { // Le weekend est terminé pendant l'attente/échec
					console.warn(`[Agent ${this.id} SYNC] Pathfinding promenade échoué ET weekend terminé. Forçage état AT_HOME.`);
					fallbackState = AgentState.AT_HOME; // <-- Utilisation de l'import
					teleportPosition = this.homePosition;
					this.weekendWalkDestination = null; // Nettoyer
					this.weekendWalkGridNode = null;
					this.weekendWalkEndTime = -1;
				}
			} else { // Cas inattendu: état n'était pas un état de requête ?
				console.warn(`[Agent ${this.id} WARN] setPath: Chemin invalide reçu mais état initial (${currentStateAtCall}) n'était pas REQUESTING_... Tentative de retour état stable.`);
				// Essayer de deviner où l'agent devrait être logiquement
				if (this.workPosition && Math.abs(this.experience.time.elapsed - this.lastArrivalTimeWork) < Math.abs(this.experience.time.elapsed - this.lastArrivalTimeHome)) {
				    fallbackState = AgentState.AT_WORK; // <-- Utilisation de l'import
				    teleportPosition = this.workPosition;
				} else {
				    fallbackState = AgentState.AT_HOME; // <-- Utilisation de l'import
				    teleportPosition = this.homePosition;
				}
			}

			// --- Appliquer l'état et la téléportation ---
			console.log(`[Agent ${this.id} DEBUG] setPath (échec): Changement d'état vers ${fallbackState}.`);
			this.currentState = fallbackState;
			if (teleportPosition) {
				console.log(`[Agent ${this.id} DEBUG] Téléportation vers ${fallbackState} à (${teleportPosition.x.toFixed(1)}, ${teleportPosition.y.toFixed(1)}, ${teleportPosition.z.toFixed(1)})`);
				this.position.copy(teleportPosition).setY(this.yOffset); // Appliquer la position + offset Y
			}
			if (forceVisibilityFalse) {
				this.isVisible = false; // Cacher l'agent par défaut après téléportation
			}

			// --- Annulation du Timeout ---
			console.log(`[Agent ${this.id} DEBUG] setPath (échec): Annulation du _pathRequestTimeout (était ${this._pathRequestTimeout}).`);
			this._pathRequestTimeout = null; // Annuler le timer même en cas d'échec
		}

		// LOG G: Sortie de fonction
		console.log(`[Agent ${this.id} DEBUG] Sortie de setPath. État final: ${this.currentState}`);
	}

    // --- MÉTHODE updateState (MODIFIÉE pour déléguer à la State Machine) ---
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
     * Récupération après un timeout de requête de chemin.
     * Force l'agent vers un état stable basé sur le but de la requête échouée.
     * @param {number} currentGameTime - Temps de jeu actuel.
     */
    forceRecoverFromTimeout(currentGameTime) {
        const failedGoal = this._currentPathRequestGoal;
        const previousState = this.currentState;
        console.warn(`Agent ${this.id}: Forcing recovery from path request timeout (Goal: ${failedGoal || 'Unknown'}, State: ${previousState}) at game time ${currentGameTime.toFixed(0)}. Cleaning up request.`);

        // Reset des propriétés communes liées au chemin et à la destination
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
        this.currentPathLengthWorld = 0; // Ajout reset longueur chemin
        this.hasReachedDestination = false;
        this._stateStartTime = null;
        this._pathRequestTimeout = null;
        this._currentPathRequestGoal = null;

        // Libérer la voiture si elle existe et sortir logiquement du véhicule
        const carManager = this.experience.world?.carManager;
        if (this.currentVehicle && carManager) {
            carManager.releaseCarForAgent(this.id);
            console.log(` -> Associated vehicle ${this.currentVehicle.instanceId} released (timeout recovery).`);
        }
        this.exitVehicle(); // Assure sortie logique et reset currentVehicle

        // Choisir l'état de repli basé sur le but échoué
        let targetPosition = null;

        if (failedGoal === 'WORK') {
            console.log(` -> Forcing state to AT_WORK.`);
            this.currentState = AgentState.AT_WORK;
            targetPosition = this.workPosition;
            this.lastArrivalTimeWork = currentGameTime;
            this.requestedPathForDepartureTime = -1;
        } else if (failedGoal === 'HOME' || failedGoal === 'WALK') {
             console.log(` -> Forcing state to AT_HOME.`);
             this.currentState = AgentState.AT_HOME;
             targetPosition = this.homePosition;
             this.lastArrivalTimeHome = currentGameTime;
             this.requestedPathForDepartureTime = -1;
             if (failedGoal === 'WALK') {
                 this.weekendWalkDestination = null;
                 this.weekendWalkGridNode = null;
                 this.weekendWalkEndTime = -1;
             }
        } else {
             console.warn(` -> Unknown goal '${failedGoal}', forcing AT_HOME as fallback.`);
             this.currentState = AgentState.AT_HOME;
             targetPosition = this.homePosition;
             this.lastArrivalTimeHome = currentGameTime;
             this.requestedPathForDepartureTime = -1;
        }

        // Téléporter visuellement si une position cible est définie
        if (targetPosition) {
            console.log(` -> Téléportation vers ${this.currentState} à (${targetPosition.x.toFixed(1)}, ${targetPosition.y.toFixed(1)}, ${targetPosition.z.toFixed(1)})`);
            this.position.copy(targetPosition).setY(this.yOffset); // Appliquer la position + offset Y
            // <<< SUPPRESSION DE L'APPEL INCORRECT >>>
            // this.updateMatrix();
            // <<< FIN SUPPRESSION >>>
        } else {
            console.warn(` -> Aucune position cible pour téléportation (état: ${this.currentState}).`);
        }

        this.isVisible = false; // Cacher l'agent après récupération
    }

	updateVisuals(deltaTime, currentGameTime) {
        const isVisuallyMoving = this.currentState === AgentState.IN_TRANSIT_TO_WORK ||
                                 this.currentState === AgentState.IN_TRANSIT_TO_HOME ||
                                 this.currentState === AgentState.WEEKEND_WALKING ||
                                 this.currentState === AgentState.DRIVING_TO_WORK ||
                                 this.currentState === AgentState.DRIVING_HOME;

        if (!isVisuallyMoving) {
            // ... [Logique pour positionner l'agent à la maison/travail si non visible - inchangée] ...
            if (this.currentState === AgentState.AT_HOME && this.homePosition) {
                this.position.copy(this.homePosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                this.position.copy(this.workPosition).setY(this.yOffset);
            }
             // --- AJOUT : Réinitialiser l'animation si pas en mouvement ---
            if (this.animationHandler) {
                 this.currentAnimationMatrix = this.animationHandler.resetMatrices();
            }
             // ------------------------------------------------------------
            return;
        }

        // Si l'agent est en train de conduire, suivre la position de la voiture
        if ((this.currentState === AgentState.DRIVING_TO_WORK || this.currentState === AgentState.DRIVING_HOME) &&
            this.isUsingVehicle && this.experience.world?.carManager) {
            // ... [Logique pour suivre la voiture - inchangée] ...
             const car = this.experience.world.carManager.getCarForAgent(this.id);
             if (car && car.isActive) {
                 this.position.copy(car.position);
                 this.position.y += this.yOffset;
                 this.orientation.copy(car.quaternion);
                 this._tempMatrix.compose(this.position, this.orientation, new THREE.Vector3(1, 1, 1));
                 this.matrix.copy(this._tempMatrix);

                 // --- MODIFIÉ : Appel à AgentAnimation pour la voiture aussi ---
                 // Même si l'agent est dans la voiture, on peut calculer l'animation
                 // (qui pourrait être une animation assise à l'avenir, ou juste l'identité)
                 if (this.animationHandler) {
                    // Pour l'instant, on passe 0 pour walkTime et isLodActive false pour avoir l'état repos
                    // Ou on pourrait avoir une méthode spécifique animationHandler.updateSeated()
                    this.currentAnimationMatrix = this.animationHandler.update(0, false);
                 }
                 // --- FIN MODIFICATION ---

                 return;
             }
        }

        // --- Code pour les agents piétons ---
        if (!this.currentPathPoints || this.currentPathPoints.length === 0 || this.calculatedTravelDurationGame <= 0 || this.departureTimeGame < 0 || this.currentPathLengthWorld <= 0) {
            this.isVisible = false;
            // --- AJOUT : Réinitialiser l'animation si pas de chemin ---
            if (this.animationHandler) {
                 this.currentAnimationMatrix = this.animationHandler.resetMatrices();
            }
            // ------------------------------------------------------
            return;
        }

        // ... [Calcul de distanceToCamera et isLodActive - inchangé] ...
        const cameraPosition = this.experience.camera.instance.position;
        const distanceToCameraSq = this.position.distanceToSquared(cameraPosition);
        const distanceToCamera = Math.sqrt(distanceToCameraSq);
        this.isLodActive = distanceToCamera > this.lodDistance;

        // ... [Calcul de progress, targetPosition, orientation - inchangé] ...
        const elapsedTimeSinceDeparture = currentGameTime - this.departureTimeGame;
        let progress = Math.max(0, Math.min(1, elapsedTimeSinceDeparture / this.calculatedTravelDurationGame));
        this.visualInterpolationProgress = progress;

        if (this.currentState === AgentState.WEEKEND_WALKING && progress > 0.9) {
            progress = 1.0;
            this.visualInterpolationProgress = 1.0;
        }

        if (progress >= 1.0 && !this.hasReachedDestination) {
            this.hasReachedDestination = true;
        }
        progress = Math.max(0, progress);
        this.visualInterpolationProgress = progress;

        if (this.currentPathPoints.length === 1) {
            this.position.copy(this.currentPathPoints[0]);
        } else {
            const totalPathLength = this.currentPathLengthWorld;
            const targetDistance = progress * totalPathLength;
            let cumulativeLength = 0;
            let targetPosition = this.currentPathPoints[this.currentPathPoints.length - 1];

            for (let i = 0; i < this.currentPathPoints.length - 1; i++) {
                const p1 = this.currentPathPoints[i];
                const p2 = this.currentPathPoints[i+1];
                const segmentVector = this._tempV3_1.copy(p2).sub(p1);
                const segmentLength = segmentVector.length();

                if (segmentLength < 0.001) continue;

                if (cumulativeLength + segmentLength >= targetDistance || i === this.currentPathPoints.length - 2) {
                    const lengthOnSegment = Math.max(0, targetDistance - cumulativeLength);
                    const segmentProgress = Math.max(0, Math.min(1, lengthOnSegment / segmentLength));
                    targetPosition = this._tempV3_2.copy(p1).addScaledVector(segmentVector, segmentProgress);
                    this.currentPathIndexVisual = i;
                    break;
                }
                cumulativeLength += segmentLength;
            }
            this.position.copy(targetPosition);
        }
        this.position.y += this.yOffset;

        let lookAtIndex = Math.min(this.currentPathIndexVisual + 1, this.currentPathPoints.length - 1);
         if (progress > 0.98) lookAtIndex = this.currentPathPoints.length -1;
        const lookTargetPoint = this.currentPathPoints[lookAtIndex];
        this._tempV3_1.copy(lookTargetPoint).setY(this.position.y);

        if (this.position.distanceToSquared(this._tempV3_1) > 0.01) {
            this._tempMatrix.lookAt(this.position, this._tempV3_1, THREE.Object3D.DEFAULT_UP);
            this._tempQuat.setFromRotationMatrix(this._tempMatrix);
            this._tempQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
            const deltaSeconds = deltaTime / 1000.0;
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
            this.orientation.slerp(this._tempQuat, slerpAlpha);
        }

        // --- MODIFIÉ : Calculer l'animation de marche via AgentAnimation ---
        if (this.animationHandler) {
            // Calculer le temps de marche effectif
            const effectiveAnimationSpeed = this.visualSpeed * (this.config?.agentAnimationSpeedFactor ?? 1.0);
            const walkTime = currentGameTime / 1000 * effectiveAnimationSpeed;
            // Mettre à jour les matrices via le handler
            this.currentAnimationMatrix = this.animationHandler.update(walkTime, this.isLodActive);
        } else {
            // Fallback si animationHandler n'existe pas (ne devrait pas arriver)
            this._resetAnimationMatrices();
        }
        // ------------------------------------------------------------------
    }

	_updateWalkAnimation(walkTime) {
        // Accéder à la config via cityManager
        let config = this.experience.world?.cityManager?.config;
        if (!config) {
             console.warn(`Agent ${this.id}: Impossible d'accéder à la config dans _updateWalkAnimation.`);
             // Utiliser des valeurs par défaut ou arrêter ? Utilisons des défauts pour l'instant.
             config = { // Fournir un objet config de secours
                agentBobAmplitude: 0.15, agentStepLength: 1.5, agentStepHeight: 0.7,
                agentSwingAmplitude: 1.2, agentAnkleRotationAmplitude: Math.PI / 8,
                agentHandTiltAmplitude: 0.2, agentHeadBobAmplitude: 0.06,
                agentAnimationSpeedFactor: 1.0 // Valeur par défaut
             };
        }

        // Récupérer les valeurs de la config (avec fallback au cas où)
        const agentBobAmplitude = config.agentBobAmplitude ?? 0.15;
        const agentStepLength = config.agentStepLength ?? 1.5;
        const agentStepHeight = config.agentStepHeight ?? 0.7;
        const agentSwingAmplitude = config.agentSwingAmplitude ?? 1.2;
        const agentAnkleRotationAmplitude = config.agentAnkleRotationAmplitude ?? (Math.PI / 8);
        const agentHandTiltAmplitude = config.agentHandTiltAmplitude ?? 0.2;
        const agentHeadBobAmplitude = config.agentHeadBobAmplitude ?? 0.06;
        // Utiliser la valeur de config corrigée ici
        const agentAnimationSpeedFactor = config.agentAnimationSpeedFactor ?? 1.0;

        // Calcul de la vitesse effective (utilise this.visualSpeed qui est propre à l'agent)
        const effectiveAnimationSpeed = this.visualSpeed * agentAnimationSpeedFactor;

        // Le reste de la logique d'animation reste inchangé
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
    } // Fin update

	destroy() {
        this.path = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        this.experience = null; // Libérer la référence à Experience
    }

    /**
     * Trouve une destination aléatoire pour la promenade du weekend
     * @param {number} currentGameTime - Temps de jeu actuel pour les requêtes de chemin
     * @private
     * @returns {boolean} - true si une destination a été trouvée, false sinon
     */
    _findRandomWalkDestination(currentGameTime) {
        const cityManager = this.experience.world?.cityManager;
        const navGraph = cityManager?.getNavigationGraph();
        
        if (!cityManager || !navGraph) {
            console.warn(`Agent ${this.id}: Impossible de trouver une destination de promenade - CityManager ou NavigationGraph manquant.`);
            return false;
        }
        
        // 1) Essayer de trouver un parc existant dans la ville
        const parks = cityManager.getBuildingsByType && cityManager.getBuildingsByType(['park']);
        
        // Vérifier si on a trouvé des parcs
        if (parks && parks.length > 0) {
            console.log(`Agent ${this.id}: ${parks.length} parcs trouvés pour la promenade`);
            
            // Mélanger les parcs pour éviter que tous les agents n'aillent au même parc
            const shuffledParks = [...parks].sort(() => Math.random() - 0.5);
            
            // Essayer chaque parc jusqu'à trouver un nœud valide
            for (const park of shuffledParks) {
                if (park && park.position) {
                    // Créer plusieurs points autour du parc pour augmenter les chances de trouver un nœud valide
                    const parkPosOriginal = park.position.clone();
                    const sidewalkHeight = navGraph.sidewalkHeight ?? 0.2;
                    parkPosOriginal.y = sidewalkHeight;

                    // --- AJOUT: Snapping de la position du parc ---
                    let parkPosSnapped = parkPosOriginal.clone(); // Cloner pour ne pas modifier l'original
                    if (navGraph.gridScale && navGraph.gridScale > 0) {
                        const cellSizeWorld = 1.0 / navGraph.gridScale;
                        parkPosSnapped.x = Math.round(parkPosOriginal.x / cellSizeWorld) * cellSizeWorld;
                        parkPosSnapped.z = Math.round(parkPosOriginal.z / cellSizeWorld) * cellSizeWorld;
                        // Laisser parkPosSnapped.y = sidewalkHeight
                    }
                    // Utiliser parkPosSnapped pour la recherche initiale
                    // --- FIN AJOUT ---

                    // Obtenir directement le nœud le plus proche du parc (avec la position snappée)
                    const parkNode = navGraph.getClosestWalkableNode(parkPosSnapped);

                    if (parkNode && typeof parkNode.x === 'number' && typeof parkNode.y === 'number') {
                        // Convertir en position mondiale (s'assurer que gridToWorld renvoie une position valide)
                        const worldPos = navGraph.gridToWorld(parkNode.x, parkNode.y);
                        
                        if (worldPos && worldPos instanceof THREE.Vector3) {
                            this.weekendWalkDestination = worldPos;
                            this.weekendWalkGridNode = parkNode;
                            console.log(`Agent ${this.id}: Destination de promenade trouvée près d'un parc à [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}], nœud [${parkNode.x}, ${parkNode.y}]`);
                            
                            // Demander immédiatement le chemin pour cette destination
                            if (this.homePosition && this.homeGridNode) {
                                console.log(`Agent ${this.id}: Demande de chemin immédiate pour promenade (parc)`);
                                this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                                this.requestPath(
                                    this.homePosition,
                                    this.weekendWalkDestination,
                                    this.homeGridNode,
                                    this.weekendWalkGridNode,
                                    AgentState.WEEKEND_WALK_READY,
                                    currentGameTime || this.experience.time.elapsed
                                );
                            }
                            return true;
                        }
                    }
                    
                    // Si le nœud principal échoue, essayer des points autour du parc
                    for (let offset = 1; offset <= 5; offset++) {
                        const offsets = [
                            { x: offset, y: 0 }, { x: -offset, y: 0 },
                            { x: 0, y: offset }, { x: 0, y: -offset },
                            { x: offset, y: offset }, { x: -offset, y: -offset },
                            { x: offset, y: -offset }, { x: -offset, y: offset }
                        ];
                        
                        for (const o of offsets) {
                            const offsetPosOriginal = parkPosOriginal.clone().add(new THREE.Vector3(o.x, 0, o.y)); // Utiliser la position originale comme base pour l'offset

                            // --- AJOUT: Snapping de la position offset ---
                            let offsetPosSnapped = offsetPosOriginal.clone();
                            if (navGraph.gridScale && navGraph.gridScale > 0) {
                                const cellSizeWorld = 1.0 / navGraph.gridScale;
                                offsetPosSnapped.x = Math.round(offsetPosOriginal.x / cellSizeWorld) * cellSizeWorld;
                                offsetPosSnapped.z = Math.round(offsetPosOriginal.z / cellSizeWorld) * cellSizeWorld;
                                // Laisser offsetPosSnapped.y = sidewalkHeight (implicite car basé sur parkPosOriginal cloné)
                            }
                            // --- FIN AJOUT ---

                            // Utiliser la position offset snappée pour la recherche
                            const offsetNode = navGraph.getClosestWalkableNode(offsetPosSnapped);

                            if (offsetNode && typeof offsetNode.x === 'number' && typeof offsetNode.y === 'number') {
                                const worldPos = navGraph.gridToWorld(offsetNode.x, offsetNode.y);
                                
                                if (worldPos && worldPos instanceof THREE.Vector3) {
                                    this.weekendWalkDestination = worldPos;
                                    this.weekendWalkGridNode = offsetNode;
                                    console.log(`Agent ${this.id}: Destination de promenade trouvée près d'un parc (offset) à [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}]`);
                                    
                                    // Demander immédiatement le chemin pour cette destination
                                    if (this.homePosition && this.homeGridNode) {
                                        console.log(`Agent ${this.id}: Demande de chemin immédiate pour promenade (parc offset)`);
                                        this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                                        this.requestPath(
                                            this.homePosition,
                                            this.weekendWalkDestination,
                                            this.homeGridNode,
                                            this.weekendWalkGridNode,
                                            AgentState.WEEKEND_WALK_READY,
                                            currentGameTime || this.experience.time.elapsed
                                        );
                                    }
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        } else {
            console.log(`Agent ${this.id}: Aucun parc trouvé pour la promenade, recherche d'un nœud aléatoire...`);
        }

        return this._findWalkDestinationFallback(cityManager, navGraph, currentGameTime);
    }
    
    /**
     * Méthode de secours pour trouver une destination de promenade si la méthode principale échoue
     * @param {Object} cityManager - Le gestionnaire de ville
     * @param {Object} navGraph - Le graphe de navigation
     * @param {number} currentGameTime - Temps de jeu actuel pour les requêtes de chemin
     * @private
     */
    _findWalkDestinationFallback(cityManager, navGraph, currentGameTime) {
        // Essayer d'abord avec les bâtiments publics (commerciaux)
        const publicBuildings = cityManager.getBuildingsByType && cityManager.getBuildingsByType(['commercial']);
        
        if (publicBuildings && publicBuildings.length > 0) {
            console.log(`Agent ${this.id}: ${publicBuildings.length} bâtiments commerciaux trouvés comme alternative`);
            
            // Mélanger pour éviter que tous les agents n'aillent au même endroit
            const shuffledBuildings = [...publicBuildings].sort(() => Math.random() - 0.5);
            
            // Essayer chaque bâtiment jusqu'à en trouver un valide
            for (const building of shuffledBuildings) {
                if (building && building.position) {
                    const buildingPosition = building.position.clone();
                    const sidewalkHeight = navGraph.sidewalkHeight ?? 0.2;
                    buildingPosition.y = sidewalkHeight;
                    
                    // Obtenir le nœud le plus proche
                    const node = navGraph.getClosestWalkableNode(buildingPosition);
                    
                    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
                        const worldPos = navGraph.gridToWorld(node.x, node.y);
                        
                        if (worldPos && worldPos instanceof THREE.Vector3) {
                            this.weekendWalkDestination = worldPos;
                            this.weekendWalkGridNode = node;
                            console.log(`Agent ${this.id}: Destination alternative trouvée près d'un commerce à [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}]`);
                            
                            // Demander immédiatement le chemin pour cette destination
                            if (this.homePosition && this.homeGridNode) {
                                console.log(`Agent ${this.id}: Demande de chemin immédiate pour promenade (commerce)`);
                                this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                                this.requestPath(
                                    this.homePosition,
                                    this.weekendWalkDestination,
                                    this.homeGridNode,
                                    this.weekendWalkGridNode,
                                    AgentState.WEEKEND_WALK_READY,
                                    currentGameTime || this.experience.time.elapsed
                                );
                            }
                            return true;
                        }
                    }
                }
            }
        }
        
        // Fallback : utiliser la grille pour trouver un nœud aléatoire marchable
        const gridSize = navGraph.gridSize || { width: 100, height: 100 };
        if (gridSize && typeof gridSize.width === 'number' && typeof gridSize.height === 'number') {
            console.log(`Agent ${this.id}: Tentative de trouver un nœud aléatoire dans la grille ${gridSize.width}x${gridSize.height}`);
            
            let attempts = 0;
            const maxAttempts = 30; // Augmenter le nombre d'essais
            
            while (attempts < maxAttempts) {
                attempts++;
                
                // Générer des coordonnées aléatoires, mais éviter les bords de la grille
                const margin = Math.min(20, Math.floor(gridSize.width * 0.2));
                const randomX = margin + Math.floor(Math.random() * (gridSize.width - 2 * margin));
                const randomY = margin + Math.floor(Math.random() * (gridSize.height - 2 * margin));
                
                // Vérifier si navGraph.getNodeAt existe avant de l'appeler
                if (typeof navGraph.getNodeAt === 'function') {
                    const gridNode = navGraph.getNodeAt(randomX, randomY);
                    
                    if (gridNode && gridNode.walkable) {
                        const worldPos = navGraph.gridToWorld(gridNode.x, gridNode.y);
                        
                        if (worldPos && worldPos instanceof THREE.Vector3) {
                            this.weekendWalkDestination = worldPos;
                            this.weekendWalkGridNode = gridNode;
                            console.log(`Agent ${this.id}: Nœud aléatoire trouvé dans la grille à [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}]`);
                            
                            // Demander immédiatement le chemin pour cette destination
                            if (this.homePosition && this.homeGridNode) {
                                console.log(`Agent ${this.id}: Demande de chemin immédiate pour promenade (aléatoire)`);
                                this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                                this.requestPath(
                                    this.homePosition,
                                    this.weekendWalkDestination,
                                    this.homeGridNode,
                                    this.weekendWalkGridNode,
                                    AgentState.WEEKEND_WALK_READY,
                                    currentGameTime || this.experience.time.elapsed
                                );
                            }
                            return true;
                        }
                    }
                }
            }
            
            console.warn(`Agent ${this.id}: Impossible de trouver un nœud aléatoire après ${maxAttempts} tentatives`);
        }
        
        // Dernier recours : utiliser un point près du domicile
        if (!this.homePosition) {
            console.error(`Agent ${this.id}: Aucune position de domicile disponible pour destination de secours.`);
            return false;
        }
        
        console.warn(`Agent ${this.id}: Utilisation d'un point proche du domicile comme dernière solution.`);
        // Générer un cercle de points autour du domicile et essayer chacun d'eux
        const radius = 20;
        const numPoints = 12;
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const offsetX = Math.cos(angle) * radius;
            const offsetZ = Math.sin(angle) * radius;
            
            const nearHomePosition = this.homePosition.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));
            const node = navGraph.getClosestWalkableNode(nearHomePosition);
            
            if (node && typeof node.x === 'number' && typeof node.y === 'number') {
                const worldPos = navGraph.gridToWorld(node.x, node.y);
                
                if (worldPos && worldPos instanceof THREE.Vector3) {
                    this.weekendWalkDestination = worldPos;
                    this.weekendWalkGridNode = node;
                    console.log(`Agent ${this.id}: Point trouvé autour du domicile à [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}]`);
                    
                    // Demander immédiatement le chemin pour cette destination
                    if (this.homePosition && this.homeGridNode) {
                        console.log(`Agent ${this.id}: Demande de chemin immédiate pour promenade (domicile)`);
                        this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                        this.requestPath(
                            this.homePosition,
                            this.weekendWalkDestination,
                            this.homeGridNode,
                            this.weekendWalkGridNode,
                            AgentState.WEEKEND_WALK_READY,
                            currentGameTime || this.experience.time.elapsed
                        );
                    }
                    return true;
                }
            }
        }
        
        // Si tout échoue, utiliser le nœud du domicile lui-même
        console.log(`Agent ${this.id}: Utilisation du nœud du domicile comme dernier recours`);
        
        // Dans ce cas extrême, on ne peut pas se promener, donc on reste à la maison
        this.currentState = AgentState.AT_HOME;
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;
        return false;
    }

    /**
     * Déplace l'agent à l'intérieur du parc
     * @param {THREE.Vector3} targetPos - Position cible à l'intérieur du parc
     * @param {number} currentGameTime - Temps de jeu actuel
     * @private
     */
    _moveInsidePark(targetPos, currentGameTime) {
        // Marquer que l'agent est maintenant à l'intérieur du parc
        this.isInsidePark = true;
        
        // S'assurer que la position du trottoir est enregistrée avant d'entrer dans le parc
        if (!this.parkSidewalkPosition) {
            console.warn(`Agent ${this.id}: Position du trottoir non définie avant d'entrer dans le parc, utilisant position actuelle`);
            this.parkSidewalkPosition = this.position.clone();
        }
        
        // Créer un chemin direct (ligne droite) entre position actuelle et cible
        const startPos = this.position.clone();
        const endPos = targetPos.clone();
        
        // Calculer la distance
        const distanceSq = startPos.distanceToSquared(endPos);
        const distance = Math.sqrt(distanceSq);
        
        // Définir une vitesse de déplacement (peut être ajustée)
        const speed = 1.2; // mètres par seconde
        
        // Calculer le temps de déplacement en millisecondes
        const travelTime = (distance / speed) * 1000;
        
        // Créer un chemin artificiel avec seulement le point de départ et d'arrivée
        const pathPoints = [startPos, endPos];
        
        // Configurer le mouvement
        this.currentPathPoints = pathPoints;
        this.departureTimeGame = currentGameTime;
        this.arrivalTmeGame = currentGameTime + travelTime;
        this.calculatedTravelDurationGame = travelTime;
        this.currentPathLengthWorld = distance;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        
        // Définir un temps de séjour dans le parc avant de chercher un nouveau point
        this.nextParkMovementTime = currentGameTime + travelTime + (Math.random() * 10000 + 5000); // 5-15 secondes de pause
        
        console.log(`Agent ${this.id}: Mouvement dans le parc configuré - durée: ${travelTime.toFixed(0)}ms, distance: ${distance.toFixed(2)}m, position trottoir sauvegardée: [${this.parkSidewalkPosition.x.toFixed(2)}, ${this.parkSidewalkPosition.z.toFixed(2)}]`);
    }

    /**
     * Trouve une nouvelle position à l'intérieur du parc
     * @param {number} currentGameTime - Temps de jeu actuel
     * @private
     */
    _findNewPositionInsidePark(currentGameTime) {
        // Vérifier si c'est le moment de bouger ou s'il faut attendre
        if (currentGameTime < this.nextParkMovementTime) {
            return;
        }
        
        const cityManager = this.experience.world?.cityManager;
        const parks = cityManager?.getBuildingsByType && cityManager?.getBuildingsByType(['park']);
        
        if (parks && parks.length > 0) {
            // Trouver le parc le plus proche de notre position actuelle
            let closestPark = null;
            let minDistance = Infinity;
            
            for (const park of parks) {
                if (park && park.position) {
                    const distanceSq = this.position.distanceToSquared(park.position);
                    const distance = Math.sqrt(distanceSq);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPark = park;
                    }
                }
            }
            
            if (closestPark && closestPark.position) {
                // Générer une position aléatoire à l'intérieur du parc
                const parkPos = closestPark.position.clone();
                
                // Rayon aléatoire dans le parc (ajuster selon la taille des parcs dans votre environnement)
                const radius = Math.random() * 4 + 1; // 1-5 mètres
                const angle = Math.random() * Math.PI * 2; // Angle aléatoire
                
                // Appliquer le décalage polaire
                parkPos.x += Math.cos(angle) * radius;
                parkPos.z += Math.sin(angle) * radius;
                parkPos.y = (this.sidewalkHeight || 0.2) + 0.05;
                
                // Déplacer l'agent vers cette nouvelle position
                this._moveInsidePark(parkPos, currentGameTime);
            }
        } else if (this.parkSidewalkPosition && this.parkSidewalkGridNode) {
            // Si on ne peut pas trouver de parc, retourner au trottoir
            const currentPosition = this.position.clone();
            this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
            this.requestPath(
                currentPosition,
                this.parkSidewalkPosition,
                null,
                this.parkSidewalkGridNode,
                AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK,
                currentGameTime
            );
            this.isInsidePark = false;
        }
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

    // Nouvelle méthode pour entrer dans une voiture
    enterVehicle() {
        if (!this.isInVehicle) {
            this.isInVehicle = true;
        }
        this.isUsingVehicle = true; // Assurer le suivi visuel
        console.log(`Agent ${this.id}: Est entré dans une voiture`);
    }

    // Nouvelle méthode pour sortir d'une voiture
    exitVehicle() {
        if (this.isInVehicle) {
            this.isInVehicle = false;
        }
        this.isUsingVehicle = false;
        this.currentVehicle = null;
        console.log(`Agent ${this.id}: Est sorti de la voiture (currentVehicle cleared).`);
    }
}

// Export de l'enum pour usage externe
Agent.prototype.constructor.AgentState = AgentState;

// --- AJOUT pour stocker l'état précédent pour le timer --- 
Agent.prototype._previousStateForStartTime = null; 
// --- FIN AJOUT --- 