// src/World/Agent.js
import * as THREE from 'three';
import WorkScheduleStrategy from './Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from './Strategies/WeekendWalkStrategy.js';

let nextAgentId = 0;

const AgentState = {
    IDLE: 'IDLE',
    AT_HOME: 'AT_HOME',
    AT_WORK: 'AT_WORK',
    READY_TO_LEAVE_FOR_WORK: 'READY_TO_LEAVE_FOR_WORK',
    REQUESTING_PATH_FOR_WORK: 'REQUESTING_PATH_FOR_WORK',
    WAITING_FOR_PATH: 'WAITING_FOR_PATH',
    IN_TRANSIT_TO_WORK: 'IN_TRANSIT_TO_WORK',
    READY_TO_LEAVE_FOR_HOME: 'READY_TO_LEAVE_FOR_HOME',
    REQUESTING_PATH_FOR_HOME: 'REQUESTING_PATH_FOR_HOME',
    IN_TRANSIT_TO_HOME: 'IN_TRANSIT_TO_HOME',
    WEEKEND_WALKING: 'WEEKEND_WALKING',
    WEEKEND_WALK_REQUESTING_PATH: 'WEEKEND_WALK_REQUESTING_PATH',
    WEEKEND_WALK_READY: 'WEEKEND_WALK_READY',
    WEEKEND_WALK_RETURNING_TO_SIDEWALK: 'WEEKEND_WALK_RETURNING_TO_SIDEWALK',
    // États pour la gestion des voitures
    DRIVING_TO_WORK: 'DRIVING_TO_WORK',
    DRIVING_HOME: 'DRIVING_HOME',
};

export default class Agent {
    constructor(config, instanceId, experience, workScheduleStrategy = null, weekendWalkStrategy = null) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) { throw new Error(`Agent ${this.id}: Experience instance is required!`); }
        this.experience = experience;

        // --- Propriétés Configuration & Base ---
        this.scale = config.scale ?? 0.1;
        this.agentBaseSpeed = (config.speed ?? 1.5);
        this.visualSpeed = this.agentBaseSpeed * (0.9 + Math.random() * 0.2);
        this.rotationSpeed = config.rotationSpeed ?? 8.0;
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.5;
        this.reachToleranceSq = this.reachTolerance * this.reachTolerance;
        this.lodDistance = 50; // Distance en unités pour le LOD
        this.isLodActive = false; // État du LOD

        // --- Propriétés pour les voitures ---
        this.hasVehicle = Math.random() < 0.5; // 40% de chance d'avoir une voiture (ajuster selon besoin)
        this.isUsingVehicle = false; // Indique si l'agent utilise actuellement sa voiture
        this.vehicleHomePosition = null; // Position où la voiture est "garée" à la maison

        // --- Position & Orientation (Visuel) ---
        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false;

        // --- État & Planification ---
        this.currentState = AgentState.IDLE;
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;

        // --- Trajet Actuel ---
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathLengthWorld = 0; // <- NOUVELLE PROPRIÉTÉ pour stocker la longueur
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

		this.lastArrivalTimeHome = 0; // Temps de jeu (ms) de la dernière arrivée AT_HOME (0 initialement)
		this.lastArrivalTimeWork = -1; // Temps de jeu (ms) de la dernière arrivée AT_WORK
		this.requestedPathForDepartureTime = -1; // Pour éviter requêtes multiples pour le même départ
        this.weekendWalkEndTime = -1; // Temps de jeu (ms) de la fin de la promenade du weekend

        // --- Animation Visuelle ---
        this.currentAnimationMatrix = {
            head: new THREE.Matrix4(), torso: new THREE.Matrix4(),
            leftHand: new THREE.Matrix4(), rightHand: new THREE.Matrix4(),
            leftFoot: new THREE.Matrix4(), rightFoot: new THREE.Matrix4(),
        };

        // --- Variables temporaires ---
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempMatrix = new THREE.Matrix4();
        
        // Matrice de transformation pour le rendu
        this.matrix = new THREE.Matrix4();

        this.workScheduleStrategy = workScheduleStrategy || new WorkScheduleStrategy();
        this.weekendWalkStrategy = weekendWalkStrategy || new WeekendWalkStrategy();

        this._calculateScheduledTimes();

        // Propriétés pour la gestion des parcs
        this.isInsidePark = false;
        this.parkSidewalkPosition = null;
        this.parkSidewalkGridNode = null;
        this.nextParkMovementTime = 0;
        this.sidewalkHeight = experience.world?.cityManager?.getNavigationGraph()?.sidewalkHeight || 0.2;
        
		this.currentVehicle = null; // Ajouter cette ligne pour stocker la référence à la voiture
        // Ajout pour la détection d'immobilité
        this._lastPositionCheck = null;
        
        // Propriétés pour les mécanismes de secours
        this._pathRequestTimeout = null;
        this._stateStartTime = null;

        // --- OPTIMISATION ---
        this._nextStateCheckTime = -1; // Heure du prochain contrôle d'état nécessaire (optimisation)
        // --- FIN OPTIMISATION ---

        this.isInVehicle = false; // Nouvelle propriété pour suivre si l'agent est en voiture
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
            
			this.currentState = AgentState.AT_HOME;
			this.isVisible = false;
		} else {
			console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} non trouvées.`);
			this.currentState = AgentState.IDLE;
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
        let requestingState = AgentState.WAITING_FOR_PATH; // État générique par défaut
        if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_WORK || nextStateIfSuccess === AgentState.DRIVING_TO_WORK) {
             requestingState = AgentState.REQUESTING_PATH_FOR_WORK;
        } else if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_HOME || nextStateIfSuccess === AgentState.DRIVING_HOME) {
             requestingState = AgentState.REQUESTING_PATH_FOR_HOME;
        } else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_READY) {
             requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
        } else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
             requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH; // Même état d'attente
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
        const isVehicle = this.isInVehicle;

        // --- Statistiques (si agentManager existe) ---
        if (agentManager?.stats) {
             const dayDurationMs = this.experience.world?.environment?.dayDurationMs || (24*60*60*1000);
             const currentHour = Math.floor((currentGameTimeForStats % dayDurationMs) / (dayDurationMs/24));
             if (requestingState === AgentState.REQUESTING_PATH_FOR_WORK) {
                  agentManager.stats.requestingPathForWorkByHour[currentHour] = (agentManager.stats.requestingPathForWorkByHour[currentHour] || 0) + 1;
             } else if (requestingState === AgentState.REQUESTING_PATH_FOR_HOME) {
                 agentManager.stats.requestingPathForHomeByHour[currentHour] = (agentManager.stats.requestingPathForHomeByHour[currentHour] || 0) + 1;
             }
             // Ajouter stats pour weekend si besoin
         }
        // --- Fin Statistiques ---

        // --- Vérifications Préliminaires ---
        if (!navigationManager || !agentManager || !agentManager.isWorkerInitialized) {
            console.error(`Agent ${this.id}: Managers non prêts pour requête path (Nav: ${!!navigationManager}, AgentMgr: ${!!agentManager}, WorkerInit: ${agentManager?.isWorkerInitialized}).`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Fallback état stable
            this.isVisible = false;
            this._pathRequestTimeout = null; // Annuler timeout
            return;
        }

        // --- Obtenir le Graphe de Navigation Correct ---
        const navigationGraph = navigationManager.getNavigationGraph(isVehicle); // <<< Utilise isVehicle
        // ----------------------------------------------

        if (!navigationGraph) {
            console.error(`Agent ${this.id}: NavigationGraph non disponible pour mode ${isVehicle ? 'véhicule' : 'piéton'}.`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
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
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Ou AT_WORK si plus pertinent
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
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
            this.isVisible = false;
             this._pathRequestTimeout = null; // Annuler timeout
            return;
        }
        // --- Fin Vérification Format ---

        // --- Envoi de la Requête au Worker ---
        console.log(`Agent ${this.id}: Envoi requête path au worker. Mode: ${isVehicle ? 'Véhicule' : 'Piéton'}. StartNode: (${startNode.x},${startNode.y}), EndNode: (${endNode.x},${endNode.y}). NextState: ${nextStateIfSuccess}`);
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
		const wasRequestingWork = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_WORK;
		const wasRequestingHome = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME;
		const wasRequestingWeekendWalk = currentStateAtCall === AgentState.WEEKEND_WALK_REQUESTING_PATH;
		const targetStateFromWeekendWalk = this.targetStateFromWeekendWalk; // Récupérer l'état cible mémorisé

		// --- Cas 1: Chemin Valide Reçu ---
		// Condition modifiée pour accepter longueur 0 si le chemin a 1 seul point (départ=arrivée)
		if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && (pathPoints.length === 1 || pathLengthWorld > 0.1)) {
			// LOG B: Chemin considéré comme valide
			console.log(`[Agent ${this.id} DEBUG] setPath: Chemin VALIDE reçu (${pathPoints.length} points, longueur ${pathLengthWorld.toFixed(2)}).`);

			// Vérification anti-téléportation (spécifique au retour de promenade)
			if (currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME && this.weekendWalkEndTime > 0 && pathPoints.length > 0) {
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
				nextState = this.isInVehicle ? AgentState.READY_TO_LEAVE_FOR_WORK : AgentState.READY_TO_LEAVE_FOR_WORK; // Dans les 2 cas, on est prêt
			} else if (wasRequestingHome) {
				// Si on était en requête pour la maison, on est prêt à partir (en voiture ou à pied)
				nextState = this.isInVehicle ? AgentState.READY_TO_LEAVE_FOR_HOME : AgentState.READY_TO_LEAVE_FOR_HOME; // Dans les 2 cas, on est prêt
			} else if (wasRequestingWeekendWalk) {
				// Gérer le cas spécifique du retour du parc
				if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
					nextState = AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK;
				} else {
					nextState = AgentState.WEEKEND_WALK_READY;
				}
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
			console.warn(`[Agent ${this.id} DEBUG] setPath: Chemin INVALIDE reçu (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}, length: ${pathLengthWorld}).`);

			// --- Réinitialisation des données de chemin ---
			this.currentPathPoints = null;
			this.calculatedTravelDurationGame = 0;
			this.currentPathLengthWorld = 0;
			this.departureTimeGame = -1;
			this.arrivalTmeGame = -1;
			this.currentPathIndexVisual = 0;
			this.visualInterpolationProgress = 0;

			// --- Détermination de l'état de repli ---
			let fallbackState = this.currentState; // Pour logger l'état final
			if (wasRequestingWork) {
				fallbackState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
				console.warn(`[Agent ${this.id} WARN] setPath: Pathfinding WORK échoué, retour à ${fallbackState}.`);
			} else if (wasRequestingHome) {
				fallbackState = this.workPosition ? AgentState.AT_WORK : AgentState.IDLE;
				console.warn(`[Agent ${this.id} WARN] setPath: Pathfinding HOME échoué, retour à ${fallbackState}.`);
			} else if (wasRequestingWeekendWalk) {
				if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
					console.warn(`[Agent ${this.id} WARN] setPath: Pathfinding RETOUR TROTTOIR échoué. Tentative téléportation...`);
					if (this.parkSidewalkPosition) {
						this.position.copy(this.parkSidewalkPosition).setY(this.yOffset);
						this.isInsidePark = false;
						console.log(`[Agent ${this.id}] Téléporté au trottoir. Redemande chemin maison.`);
						// Redemander chemin maison immédiatement
						fallbackState = AgentState.REQUESTING_PATH_FOR_HOME; // Nouvel état
						this._pathRequestTimeout = this.experience.time.elapsed; // Relancer timeout
						const currentGridNode = this.experience.world?.cityManager?.navigationManager?.getNavigationGraph(false)?.getClosestWalkableNode(this.position);
						this.requestPath(this.position, this.homePosition, currentGridNode, this.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, this.experience.time.elapsed);
						// IMPORTANT: On sort de setPath ici car une nouvelle requête est lancée
						console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après requête retour maison depuis trottoir.`);
						return;
					} else {
						console.warn(`[Agent ${this.id} WARN] setPath: Position trottoir inconnue pour fallback retour. Forçage maison.`);
						this.forceReturnHome(this.experience.time.elapsed); // Forcer retour direct
						fallbackState = AgentState.AT_HOME; // État final après forceReturnHome
					}
				} else {
					console.warn(`[Agent ${this.id} WARN] setPath: Pathfinding PROMENADE échoué. Tentative nouvelle destination...`);
					this._findRandomWalkDestination(this.experience.time.elapsed); // Cherche une autre destination
					// L'état sera changé par _findRandomWalkDestination si elle réussit
					fallbackState = this.currentState; // Garder l'état actuel en attendant
				}
			} else {
				console.warn(`[Agent ${this.id} WARN] setPath: Chemin invalide reçu mais état initial (${currentStateAtCall}) n'était pas REQUESTING_... Pas de changement d'état forcé.`);
				fallbackState = this.currentState;
			}
			this.currentState = fallbackState;
			this.isVisible = false; // Cacher l'agent en cas d'échec pour éviter qu'il reste bloqué visiblement

			// --- Annulation du Timeout ---
			// LOG F: Log annulation sur échec
			console.log(`[Agent ${this.id} DEBUG] setPath (échec): Annulation du _pathRequestTimeout (était ${this._pathRequestTimeout}).`);
			this._pathRequestTimeout = null; // Annuler le timer même en cas d'échec
		}

		// LOG G: Sortie de fonction
		console.log(`[Agent ${this.id} DEBUG] Sortie de setPath. État final: ${this.currentState}`);
	}

	/**
     * Met à jour l'état logique de l'agent (décisions, demandes de chemin).
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (non utilisé ici, mais potentiellement utile).
     * @param {number} currentHour - Heure actuelle du jeu (0-23).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
    updateState(deltaTime, currentHour, currentGameTime) {

        // --- Informations Environnement / Calendrier ---
        const environment = this.experience.world?.environment;
        const calendarDate = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;
        const dayDurationMs = environment?.dayDurationMs;

        // --- Vérification initiale essentielle ---
        if (!dayDurationMs || dayDurationMs <= 0) {
            if (this.currentState !== AgentState.IDLE) {
                this.currentState = AgentState.IDLE;
                this.isVisible = false;
            }
            return; // Impossible de continuer sans durée de jour valide
        }

        // --- *** CORRECTION PRINCIPALE : Utiliser le temps dans le cycle du jour *** ---
        const timeWithinCurrentDayCycle = currentGameTime % dayDurationMs;
        // --- *** FIN CORRECTION PRINCIPALE *** ---

        const carManager = this.experience.world?.carManager;

        // --- Vérification Timeout ---
        if (this._pathRequestTimeout && currentGameTime - this._pathRequestTimeout > 100000) { // Délai 100 sec jeu
            console.warn(`Agent ${this.id}: Path request timed out (${(currentGameTime - this._pathRequestTimeout).toFixed(0)}ms), forcing return home`);
            this.forceReturnHome(currentGameTime); // Méthode de fallback
            this._pathRequestTimeout = null;
            return;
        }

        // --- Vérification Horaire / Planification (Utilise les temps pré-calculés) ---
        const departWorkTime = this.exactWorkDepartureTimeGame;
        const departHomeTime = this.exactHomeDepartureTimeGame;
        if (departWorkTime < 0 || departHomeTime < 0 ) {
             if (this.currentState !== AgentState.IDLE) {
                this.currentState = AgentState.IDLE;
                this.isVisible = false;
             }
            return;
        }

        // --- Vérification Promenade Weekend ---
        let shouldStartWeekendWalk = false;
        if (calendarDate && ["Samedi", "Dimanche"].includes(calendarDate.jourSemaine) && this.weekendWalkStrategy) {
            this.weekendWalkStrategy.registerAgent(this.id, calendarDate);
            shouldStartWeekendWalk = this.weekendWalkStrategy.shouldWalkNow(this.id, calendarDate, currentHour);
        }

        // --- Machine d'état ---
        switch (this.currentState) {
            case AgentState.AT_HOME:
                this.isVisible = false;
                const shouldWorkToday = this.workScheduleStrategy ? this.workScheduleStrategy.shouldWorkToday(calendarDate) : false;

                // --- Utiliser timeWithinCurrentDayCycle pour la comparaison horaire ---
                if (this.workPosition && shouldWorkToday &&
                    timeWithinCurrentDayCycle >= this.prepareWorkDepartureTimeGame &&
                    // Optionnel: garder la sécurité pour éviter déclenchement le soir même si le modulo corrige déjà beaucoup
                    currentHour < this.departureHomeHour &&
                    // Utiliser currentGameTime total pour requestedPathForDepartureTime pour éviter requêtes multiples dans la même frame
                    this.requestedPathForDepartureTime !== currentGameTime)
                {
                    this.requestedPathForDepartureTime = currentGameTime; // Stocke le temps global de la requête
                    this.isInVehicle = this.hasVehicle; // Détermine le mode

                    console.log(`Agent ${this.id}: Préparation départ travail (Modulo Time Check). Mode: ${this.isInVehicle ? 'Voiture' : 'Pied'}. Heure: ${currentHour}`);

                    // Gestion voiture (si nécessaire)
                    if (this.isInVehicle && carManager) {
                        if (!carManager.hasCarForAgent(this.id)) {
                            const car = carManager.createCarForAgent(this, this.vehicleHomePosition || this.homePosition, this.workPosition);
                            if (!car) {
                                console.warn(`Agent ${this.id}: Échec création voiture, passage en mode piéton.`);
                                this.isInVehicle = false;
                            }
                        }
                    }

                    // Demander le chemin
                     if (this.homePosition && this.workPosition) {
                           this.currentState = AgentState.REQUESTING_PATH_FOR_WORK;
                           this._pathRequestTimeout = currentGameTime; // Démarrer le timeout
                           this.requestPath(
                                this.homePosition,
                                this.workPosition,
                                null, // Pas d'override node
                                null, // Pas d'override node
                                AgentState.READY_TO_LEAVE_FOR_WORK, // État cible
                                currentGameTime
                           );
                     } else {
                          console.error(`Agent ${this.id}: Positions domicile/travail invalides pour requête départ.`);
                          this.requestedPathForDepartureTime = -1; // Permet nouvelle tentative
                     }
                }
                // Gestion promenade weekend (inchangée)
                else if (shouldStartWeekendWalk) {
                    console.log(`Agent ${this.id}: Déclenchement promenade weekend depuis AT_HOME.`);
                    this._findRandomWalkDestination(currentGameTime);
                }
                break;

             case AgentState.READY_TO_LEAVE_FOR_WORK:
                  // --- Utiliser timeWithinCurrentDayCycle pour la comparaison horaire ---
                  if (timeWithinCurrentDayCycle >= this.exactWorkDepartureTimeGame) {
                      if (this.isInVehicle) {
                          const car = carManager?.getCarForAgent(this.id);
                          if (car && this.currentPathPoints) {
                              this.currentVehicle = car;
                              car.setPath(this.currentPathPoints);
                              this.currentState = AgentState.DRIVING_TO_WORK;
                              this.isVisible = false;
                              this.departureTimeGame = currentGameTime;
                              const carSpeed = car.speed;
                              if (carSpeed > 0 && this.currentPathLengthWorld > 0) {
                                   this.calculatedTravelDurationGame = (this.currentPathLengthWorld / carSpeed) * 1000;
                              } else { this.calculatedTravelDurationGame = 10*60*1000; } // Fallback durée
                              this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                              console.log(`Agent ${this.id}: Départ travail en voiture. Durée: ${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                          } else {
                              console.warn(`Agent ${this.id} (Voiture): Échec départ travail (voiture/chemin manquant). Tentative fallback piéton.`);
                              if (this.currentPathPoints) {
                                  this.currentState = AgentState.IN_TRANSIT_TO_WORK;
                                  this.isVisible = true;
                                  this.departureTimeGame = currentGameTime;
                                  // Garder durée calculée même si c'était pour voiture (approximation)
                                  this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                                  console.log(`Agent ${this.id}: Départ travail à pied (Fallback Voiture). Durée: ${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                              } else {
                                   console.error(`Agent ${this.id}: Voiture ET chemin manquants. Retour AT_HOME.`);
                                   this.currentState = AgentState.AT_HOME;
                              }
                              this.isInVehicle = false;
                              this.currentVehicle = null;
                          }
                      } else { // Départ Piéton
                          if (this.currentPathPoints) {
                              this.currentState = AgentState.IN_TRANSIT_TO_WORK;
                              this.isVisible = true;
                              this.departureTimeGame = currentGameTime;
                              this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                              console.log(`Agent ${this.id}: Départ travail à pied. Durée: ${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                          } else {
                              console.error(`Agent ${this.id}: Mode piéton mais chemin manquant. Retour AT_HOME.`);
                              this.currentState = AgentState.AT_HOME;
                          }
                          this.isInVehicle = false;
                          this.currentVehicle = null;
                      }
                      this._pathRequestTimeout = null; // Annuler timeout car départ effectué
                  }
                  break;

            case AgentState.AT_WORK:
                this.isVisible = false;
                 // --- Utiliser timeWithinCurrentDayCycle pour la comparaison horaire ---
                if (this.homePosition &&
                    timeWithinCurrentDayCycle >= this.prepareHomeDepartureTimeGame &&
                    // Utiliser currentGameTime total pour requestedPathForDepartureTime
                    this.requestedPathForDepartureTime !== currentGameTime)
                {
                    this.requestedPathForDepartureTime = currentGameTime; // Stocke le temps global
                    this.isInVehicle = this.hasVehicle; // Détermine le mode

                    console.log(`Agent ${this.id}: Préparation départ maison (Modulo Time Check). Mode: ${this.isInVehicle ? 'Voiture' : 'Pied'}. Heure: ${currentHour}`);

                    // Gestion voiture (recréation/récupération près du travail)
                    if (this.isInVehicle && carManager) {
                        const car = carManager.createCarForAgent(this, this.workPosition, this.vehicleHomePosition || this.homePosition);
                        if (!car) {
                             console.warn(`Agent ${this.id}: Échec création/récup voiture pour retour. Fallback piéton.`);
                             this.isInVehicle = false;
                        }
                    }

                    // Demander le chemin
                     if (this.workPosition && this.homePosition) {
                         this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;
                         this._pathRequestTimeout = currentGameTime; // Démarrer timeout
                         this.requestPath(
                              this.workPosition,
                              this.homePosition,
                              null, // Pas d'override node
                              null, // Pas d'override node
                              AgentState.READY_TO_LEAVE_FOR_HOME, // État cible
                              currentGameTime
                         );
                     } else {
                         console.error(`Agent ${this.id}: Positions travail/domicile invalides pour requête retour.`);
                         this.requestedPathForDepartureTime = -1; // Permet nouvelle tentative
                     }
                }
                break;

             case AgentState.READY_TO_LEAVE_FOR_HOME:
                  // --- Utiliser timeWithinCurrentDayCycle pour la comparaison horaire ---
                  if (timeWithinCurrentDayCycle >= this.exactHomeDepartureTimeGame) {
                      if (this.isInVehicle) {
                          const car = carManager?.getCarForAgent(this.id); // Récupérer la voiture potentiellement créée
                          if (car && this.currentPathPoints) {
                               this.currentVehicle = car;
                               car.setPath(this.currentPathPoints);
                               this.currentState = AgentState.DRIVING_HOME;
                               this.isVisible = false;
                               this.departureTimeGame = currentGameTime;
                               const carSpeed = car.speed;
                               if (carSpeed > 0 && this.currentPathLengthWorld > 0) {
                                    this.calculatedTravelDurationGame = (this.currentPathLengthWorld / carSpeed) * 1000;
                               } else { this.calculatedTravelDurationGame = 10*60*1000; } // Fallback
                               this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                               console.log(`Agent ${this.id}: Départ maison en voiture. Durée: ${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                          } else {
                              console.warn(`Agent ${this.id} (Voiture): Échec départ maison (voiture/chemin manquant).`);
                              if (this.currentPathPoints) { // Fallback piéton si chemin existe
                                   console.warn(`Agent ${this.id}: Voiture manquante, départ maison à pied (Fallback).`);
                                   this.currentState = AgentState.IN_TRANSIT_TO_HOME;
                                   this.isVisible = true;
                                   this.departureTimeGame = currentGameTime;
                                   this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                              } else { this.currentState = AgentState.AT_WORK; } // Rester au travail
                              this.isInVehicle = false; this.currentVehicle = null;
                          }
                      } else { // Départ Piéton
                          if (this.currentPathPoints) {
                               this.currentState = AgentState.IN_TRANSIT_TO_HOME;
                               this.isVisible = true;
                               this.departureTimeGame = currentGameTime;
                               this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                               console.log(`Agent ${this.id}: Départ maison à pied. Durée: ${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s`);
                          } else {
                               console.error(`Agent ${this.id}: Mode piéton mais chemin manquant. Retour AT_WORK.`);
                               this.currentState = AgentState.AT_WORK;
                          }
                          this.isInVehicle = false; this.currentVehicle = null;
                      }
                      this._pathRequestTimeout = null; // Annuler timeout car départ effectué
                  }
                  break;

            // Les états de transit et d'arrivée utilisent toujours currentGameTime global
             case AgentState.IN_TRANSIT_TO_WORK:
                 this.isVisible = true;
                 if(currentGameTime >= this.arrivalTmeGame) {
                     this.currentState = AgentState.AT_WORK;
                     this.lastArrivalTimeWork = currentGameTime;
                     this.requestedPathForDepartureTime = -1; // Prêt pour la prochaine requête (retour maison)
                     this.isVisible = false;
                     this.currentPathPoints = null;
                     this.currentPathLengthWorld = 0;
                     console.log(`Agent ${this.id}: Arrivé au travail (à pied).`);
                 }
                 break;

            case AgentState.DRIVING_TO_WORK:
                this.isVisible = false;
                const carToWork = this.currentVehicle;
                if (carToWork) {
                    if (!carToWork.isActive) {
                         const previousState = this.currentState;
                         this.currentState = AgentState.AT_WORK;
                         this.lastArrivalTimeWork = currentGameTime;
                         this.requestedPathForDepartureTime = -1; // Prêt pour retour
                         this.exitVehicle();
                         if (carManager) { carManager.releaseCarForAgent(this.id); console.log(`Agent ${this.id}: Voiture libérée à l'arrivée travail.`); }
                         else { console.warn(`Agent ${this.id}: carManager indispo pour release voiture travail.`); }
                         console.log(`Agent ${this.id}: État changé de ${previousState} à AT_WORK (voiture).`);
                         this.currentPathPoints = null;
                         this.currentPathLengthWorld = 0;
                    }
                } else { // Fallback
                    if (this.currentState === AgentState.DRIVING_TO_WORK) {
                        console.warn(`Agent ${this.id}: currentVehicle NULLE pendant DRIVING_TO_WORK. Forçage AT_WORK.`);
                        this.currentState = AgentState.AT_WORK; this.lastArrivalTimeWork = currentGameTime; this.requestedPathForDepartureTime = -1; this.isVisible = false; this.exitVehicle(); this.currentPathPoints = null; this.currentPathLengthWorld = 0;
                    }
                }
                break;

            case AgentState.IN_TRANSIT_TO_HOME:
                 this.isVisible = true;
                 if(currentGameTime >= this.arrivalTmeGame) {
                     this.currentState = AgentState.AT_HOME;
                     this.lastArrivalTimeHome = currentGameTime;
                     this.requestedPathForDepartureTime = -1; // Prêt pour prochaine requête (travail lendemain)
                     this.isVisible = false;
                     this.currentPathPoints = null;
                     this.currentPathLengthWorld = 0;
                     console.log(`Agent ${this.id}: Arrivé à la maison (à pied).`);
                 }
                 break;

            case AgentState.DRIVING_HOME:
                 this.isVisible = false;
                 const carToHome = this.currentVehicle;
                 if (carToHome) {
                      if (!carToHome.isActive) {
                         const previousState = this.currentState;
                         this.currentState = AgentState.AT_HOME;
                         this.lastArrivalTimeHome = currentGameTime;
                         this.requestedPathForDepartureTime = -1; // Prêt pour travail lendemain
                         this.exitVehicle();
                         if (carManager) { carManager.releaseCarForAgent(this.id); console.log(`Agent ${this.id}: Voiture libérée à l'arrivée maison.`); }
                         else { console.warn(`Agent ${this.id}: carManager indispo pour release voiture maison.`); }
                         console.log(`Agent ${this.id}: État changé de ${previousState} à AT_HOME (voiture).`);
                         this.currentPathPoints = null;
                         this.currentPathLengthWorld = 0;
                      }
                 } else { // Fallback
                     if (this.currentState === AgentState.DRIVING_HOME) {
                         console.warn(`Agent ${this.id}: currentVehicle NULLE pendant DRIVING_HOME. Forçage AT_HOME.`);
                         this.currentState = AgentState.AT_HOME; this.lastArrivalTimeHome = currentGameTime; this.requestedPathForDepartureTime = -1; this.isVisible = false; this.exitVehicle(); this.currentPathPoints = null; this.currentPathLengthWorld = 0;
                     }
                 }
                break;

            // États d'attente passifs (le timeout est géré au début)
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WAITING_FOR_PATH: // Garder cet état générique si besoin
                // Rien à faire activement ici, on attend setPath ou le timeout
                break;

            // États Weekend (la logique interne reste globalement la même, utilise currentGameTime pour les durées)
             case AgentState.WEEKEND_WALK_READY:
                  if (this.currentPathPoints) {
                     this.currentState = AgentState.WEEKEND_WALKING;
                     this.isVisible = true;
                     this.departureTimeGame = currentGameTime;
                     this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                     const msPerHour = dayDurationMs / 24;
                     const walkInfo = this.weekendWalkStrategy?.agentWalkMap.get(this.weekendWalkStrategy._getDayKey(calendarDate))?.get(this.id);
                      if (walkInfo && msPerHour > 0) { this.weekendWalkEndTime = currentGameTime + (walkInfo.duration * msPerHour); }
                      else { this.weekendWalkEndTime = currentGameTime + msPerHour; } // Fallback 1h
                     console.log(`Agent ${this.id}: Début promenade weekend. Durée trajet: ${(this.calculatedTravelDurationGame/1000).toFixed(1)}s. Fin promenade: ${this.weekendWalkEndTime.toFixed(0)}ms`);
                     this._pathRequestTimeout = null;
                  } else {
                     console.warn(`Agent ${this.id}: Prêt promenade mais pas de chemin. Retour AT_HOME.`);
                     this.currentState = AgentState.AT_HOME; this.weekendWalkEndTime = -1; this._pathRequestTimeout = null;
                  }
                 break;
             case AgentState.WEEKEND_WALKING:
                  this.isVisible = true;
                  const destinationReached = currentGameTime >= this.arrivalTmeGame;
                  const walkTimeOver = this.weekendWalkEndTime > 0 && currentGameTime >= this.weekendWalkEndTime;
                  if (destinationReached || walkTimeOver) {
                      console.log(`Agent ${this.id}: Fin promenade weekend (Atteint: ${destinationReached}, Temps Fini: ${walkTimeOver}). Retour maison.`);
                      this.weekendWalkDestination = null; this.weekendWalkGridNode = null; this.weekendWalkEndTime = -1;
                      if (this.homePosition && this.homeGridNode) {
                           this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;
                           this._pathRequestTimeout = currentGameTime;
                            const navigationManager = this.experience.world?.cityManager?.navigationManager;
                            const currentNavGraph = navigationManager?.getNavigationGraph(false);
                            const currentGridNode = currentNavGraph?.getClosestWalkableNode(this.position);
                           this.requestPath( this.position, this.homePosition, currentGridNode, this.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, currentGameTime );
                       } else {
                           console.error(`Agent ${this.id}: Impossible rentrer (infos domicile manquantes). IDLE.`);
                            this.currentState = AgentState.IDLE; this.isVisible = false;
                       }
                  }
                  break;
             case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                 // Attente passive de setPath ou timeout
                 break;

            case AgentState.IDLE: // État initial ou d'erreur
            default:
                this.isVisible = false;
                // Tenter de réinitialiser si possible
                if (!this.homeBuildingId && this.experience.world?.cityManager) {
                    const cityManager = this.experience.world.cityManager;
                     const homeAssigned = cityManager.assignHomeToCitizen(this.id);
                     const workAssigned = cityManager.assignWorkplaceToCitizen(this.id);
                     if (homeAssigned) {
                         console.log(`Agent ${this.id}: Réinitialisation depuis IDLE...`);
                         this.initializeLifecycle(this.homeBuildingId, this.workBuildingId);
                         // L'état passera à AT_HOME dans initializeLifecycle
                     }
                 }
                break;
        } // Fin Switch
    } // Fin updateState

	updateVisuals(deltaTime, currentGameTime) {
        // --- MODIFICATION : Inclure les états de conduite dans les états où l'agent se déplace --- 
        const isVisuallyMoving = this.currentState === AgentState.IN_TRANSIT_TO_WORK || 
                                 this.currentState === AgentState.IN_TRANSIT_TO_HOME ||
                                 this.currentState === AgentState.WEEKEND_WALKING ||
                                 this.currentState === AgentState.DRIVING_TO_WORK ||
                                 this.currentState === AgentState.DRIVING_HOME;
                                 
        if (!isVisuallyMoving) {
            if(this.currentState === AgentState.AT_HOME && this.homePosition) {
                this.position.copy(this.homePosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                this.position.copy(this.workPosition).setY(this.yOffset);
            }
            return;
        }

        // Si l'agent est en train de conduire, suivre la position de la voiture
        if ((this.currentState === AgentState.DRIVING_TO_WORK || this.currentState === AgentState.DRIVING_HOME) && 
            this.isUsingVehicle && this.experience.world?.carManager) {
            
            const car = this.experience.world.carManager.getCarForAgent(this.id);
            if (car && car.isActive) {
                // Copier la position de la voiture pour l'agent
                this.position.copy(car.position);
                this.position.y += this.yOffset; // Appliquer l'offset Y pour l'agent
                
                // Copier l'orientation de la voiture
                this.orientation.copy(car.quaternion);
                
                // Mettre à jour la matrice de transformation
                this._tempMatrix.compose(this.position, this.orientation, new THREE.Vector3(1, 1, 1));
                this.matrix.copy(this._tempMatrix);
                
                // Mettre à jour l'animation de marche
                if (!this.isLodActive) {
                    const effectiveAnimationSpeed = this.visualSpeed * (this.experience.world.cityManager.config.agentAnimationSpeedFactor ?? 1.0);
                    const walkTime = currentGameTime / 1000 * effectiveAnimationSpeed;
                    this._updateWalkAnimation(walkTime);
                } else {
                    this._resetAnimationMatrices();
                }
                
                return; // Sortir de la méthode car nous avons géré le cas de la voiture
            }
        }

        // Code existant pour les agents qui se déplacent à pied
        if (!this.currentPathPoints || this.currentPathPoints.length === 0 || this.calculatedTravelDurationGame <= 0 || this.departureTimeGame < 0 || this.currentPathLengthWorld <= 0) {
            this.isVisible = false;
            return;
        }

        // Calculer la distance à la caméra
        const cameraPosition = this.experience.camera.instance.position;
        const distanceToCameraSq = this.position.distanceToSquared(cameraPosition);
        const distanceToCamera = Math.sqrt(distanceToCameraSq);
        
        // Mettre à jour l'état du LOD
        this.isLodActive = distanceToCamera > this.lodDistance;

        const elapsedTimeSinceDeparture = currentGameTime - this.departureTimeGame;
        let progress = Math.max(0, Math.min(1, elapsedTimeSinceDeparture / this.calculatedTravelDurationGame));
        this.visualInterpolationProgress = progress;

        // Pour les agents en promenade, considérer le trajet terminé plus tôt
        if (this.currentState === AgentState.WEEKEND_WALKING && progress > 0.9) {
            progress = 1.0;
            this.visualInterpolationProgress = 1.0;
        }

        // Ajouter cette vérification pour forcer la fin du trajet quand on est très proche
        if (progress > 0.98) {
            progress = 1.0;
            this.visualInterpolationProgress = 1.0;
        }

        if (this.currentPathPoints.length === 1) {
            this.position.copy(this.currentPathPoints[0]);
        } else {
            // Utiliser la longueur stockée
            const totalPathLength = this.currentPathLengthWorld; // <- UTILISER LA VALEUR STOCKÉE
            const targetDistance = progress * totalPathLength;
            let cumulativeLength = 0;
            let targetPosition = this.currentPathPoints[this.currentPathPoints.length - 1]; // Default

            for (let i = 0; i < this.currentPathPoints.length - 1; i++) {
                const p1 = this.currentPathPoints[i];
                const p2 = this.currentPathPoints[i+1];
                const segmentVector = this._tempV3_1.copy(p2).sub(p1);
                const segmentLength = segmentVector.length(); // Recalculer segment length est ok

                // Gérer le cas segmentLength = 0 (points dupliqués dans le chemin?)
                if (segmentLength < 0.001) continue;

                if (cumulativeLength + segmentLength >= targetDistance || i === this.currentPathPoints.length - 2) {
                    const lengthOnSegment = Math.max(0, targetDistance - cumulativeLength); // Assurer non négatif
                    const segmentProgress = Math.max(0, Math.min(1, lengthOnSegment / segmentLength));
                    targetPosition = this._tempV3_2.copy(p1).addScaledVector(segmentVector, segmentProgress);
                    this.currentPathIndexVisual = i;
                    break;
                }
                cumulativeLength += segmentLength;
            }
            // Appliquer la position cible trouvée
            this.position.copy(targetPosition);
        }
        this.position.y += this.yOffset; // Appliquer offset Y

        // Calculer orientation (inchangé)
        let lookAtIndex = Math.min(this.currentPathIndexVisual + 1, this.currentPathPoints.length - 1);
         if (progress > 0.98) lookAtIndex = this.currentPathPoints.length -1;
        const lookTargetPoint = this.currentPathPoints[lookAtIndex];
        this._tempV3_1.copy(lookTargetPoint).setY(this.position.y);

        if (this.position.distanceToSquared(this._tempV3_1) > 0.01) {
            this._tempMatrix.lookAt(this.position, this._tempV3_1, THREE.Object3D.DEFAULT_UP);
            this._tempQuat.setFromRotationMatrix(this._tempMatrix);
            // Ajouter une rotation de 180 degrés autour de l'axe Y
            this._tempQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
            const deltaSeconds = deltaTime / 1000.0;
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
            this.orientation.slerp(this._tempQuat, slerpAlpha);
        }

        // Calculer animation de marche (modifié pour le LOD)
        if (!this.isLodActive) {
            const effectiveAnimationSpeed = this.visualSpeed * (this.experience.world.cityManager.config.agentAnimationSpeedFactor ?? 1.0);
            const walkTime = currentGameTime / 1000 * effectiveAnimationSpeed;
            this._updateWalkAnimation(walkTime);
        } else {
            // Si LOD actif, pas d'animation de marche
            this._resetAnimationMatrices();
        }
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
        if (this.currentState === 'IDLE' || this.currentState === 'WAITING_FOR_PATH') {
            // this.isVisible = (this.currentState === 'WAITING_FOR_PATH'); // Optionnel: le rendre visible en attendant ?
            return;
        }

        // --- 1. Logique de changement d'état basée sur l'heure (Appelle requestPath si besoin) ---
        const previousState = this.currentState;
        switch (this.currentState) {
            case 'AT_HOME':
                this.isVisible = false;
                if (currentHour >= 8 && currentHour < 19 && this.workPosition && this.homeGridNode && this.workGridNode) {
                   // console.log(`Agent ${this.id} leaving home for work.`);
                   this.requestPath(this.position, this.workPosition, this.homeGridNode, this.workGridNode, currentHour);
                }
                break;
            case 'AT_WORK':
                this.isVisible = false;
                if ((currentHour >= 19 || currentHour < 8) && this.homePosition && this.workGridNode && this.homeGridNode) {
                    // console.log(`Agent ${this.id} leaving work for home.`);
                    this.requestPath(this.position, this.homePosition, this.workGridNode, this.homeGridNode, currentHour);
                }
                break;
        }
         // Si l'état a changé suite à requestPath (vers WAITING_FOR_PATH), on arrête l'update ici pour cette frame.
         if(this.currentState === AgentState.WAITING_FOR_PATH) {
             return;
         }


        // --- 2. Logique de déplacement (si en mouvement : GOING_TO_WORK ou GOING_HOME) ---
        if (this.currentState === 'GOING_TO_WORK' || this.currentState === 'GOING_HOME') {

            // Vérification si le chemin est valide (pourrait devenir null entre-temps?)
            if (!this.path || this.currentPathIndex >= this.path.length) {
                 // console.warn(`Agent ${this.id}: In moving state ${this.currentState} but no valid path.`);
                 // Tenter de revenir à un état stable basé sur la destination prévue
                 this.currentState = (this.currentState === 'GOING_TO_WORK' && this.workPosition) ? 'AT_WORK' : (this.homePosition ? 'AT_HOME' : 'IDLE');
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
                    const finalState = (this.currentState === 'GOING_TO_WORK') ? 'AT_WORK' : 'AT_HOME';
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
            console.log(`Agent ${this.id}: Est entré dans une voiture`);
        }
    }

    // Nouvelle méthode pour sortir d'une voiture
    exitVehicle() {
		if (this.isInVehicle) {
			this.isInVehicle = false;
			this.currentVehicle = null; // <<< AJOUTER : Nettoyer la référence stockée
			console.log(`Agent ${this.id}: Est sorti de la voiture (currentVehicle cleared).`);
		}
	}
}

// Export de l'enum pour usage externe
Agent.prototype.constructor.AgentState = AgentState;