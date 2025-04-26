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
        this.hasVehicle = Math.random() < 0.4; // 40% de chance d'avoir une voiture (ajuster selon besoin)
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
        
        // Ajout pour la détection d'immobilité
        this._lastPositionCheck = null;
        
        // Propriétés pour les mécanismes de secours
        this._pathRequestTimeout = null;
        this._stateStartTime = null;

        // --- OPTIMISATION ---
        this._nextStateCheckTime = -1; // Heure du prochain contrôle d'état nécessaire (optimisation)
        // --- FIN OPTIMISATION ---
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

    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null, nextStateIfSuccess, currentGameTimeForStats) {
        // nextStateIfSuccess sera par exemple READY_TO_LEAVE_FOR_WORK ou READY_TO_LEAVE_FOR_HOME

        // IMPORTANT : Stocker l'état cible pour que setPath puisse l'utiliser
        this.targetStateFromWeekendWalk = nextStateIfSuccess;

        // Réinitialiser les données du trajet précédent
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;

        // Déterminer l'état d'attente pendant la requête
        if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_WORK) {
            this.currentState = AgentState.REQUESTING_PATH_FOR_WORK;
        }
        else if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_HOME) {
            this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;
        }
        else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_READY) {
            this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
            console.log(`Agent ${this.id}: Requête de chemin pour PROMENADE WEEKEND.`);
        }
        else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
            // CORRECTION : Ajouter la gestion explicite de l'état WEEKEND_WALK_RETURNING_TO_SIDEWALK
            this.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
            console.log(`Agent ${this.id}: Requête de chemin pour RETOUR AU TROTTOIR depuis le parc.`);
        }
        else {
            // Cas par défaut (ne devrait pas arriver)
            this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;
            console.warn(`Agent ${this.id}: État nextStateIfSuccess inconnu: ${nextStateIfSuccess}, fallback sur REQUESTING_PATH_FOR_HOME`);
        }
        this.isVisible = false; // Reste caché pendant la demande initiale

        const agentManager = this.experience.world?.agentManager;
        const navGraph = this.experience.world?.cityManager?.getNavigationGraph(); // Accéder via cityManager

        // Mettre à jour les statistiques pour les agents en attente de chemin
        if (agentManager?.stats) {
            const dayDurationMs = this.experience.world?.environment?.dayDurationMs || (24 * 60 * 60 * 1000);
            const currentHour = Math.floor((currentGameTimeForStats % dayDurationMs) / (dayDurationMs / 24));

            // --- DEBUG LOG (using parameter now) ---
            console.log(`Agent ${this.id} requesting path. State: ${this.currentState}. TimeForStats: ${currentGameTimeForStats.toFixed(0)}, DayDur: ${dayDurationMs}, Calculated Hour: ${currentHour}`);
            // --- FIN DEBUG LOG ---
            
            if (this.currentState === AgentState.REQUESTING_PATH_FOR_WORK) {
                agentManager.stats.requestingPathForWorkByHour[currentHour] = (agentManager.stats.requestingPathForWorkByHour[currentHour] || 0) + 1;
            } else if (this.currentState === AgentState.REQUESTING_PATH_FOR_HOME) {
                agentManager.stats.requestingPathForHomeByHour[currentHour] = (agentManager.stats.requestingPathForHomeByHour[currentHour] || 0) + 1;
            }
        }

        // Vérifier si les managers nécessaires sont prêts
        if (!agentManager || !agentManager.isWorkerInitialized) {
            console.error(`Agent ${this.id}: AgentManager ou Worker non prêt pour requête path.`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Retour état stable
            this.isVisible = false;
            return; // Échec
        }
        if (!navGraph) {
            console.error(`Agent ${this.id}: NavigationGraph non trouvé pour requête path.`);
             this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Retour état stable
             this.isVisible = false;
            return; // Échec
        }

        // Déterminer les noeuds de grille de départ et d'arrivée
        // Utilise l'override (pré-calculé) si disponible, sinon calcule le plus proche
        const startNode = startNodeOverride !== null ? startNodeOverride : navGraph.getClosestWalkableNode(startPosWorld);
        const endNode = endNodeOverride !== null ? endNodeOverride : navGraph.getClosestWalkableNode(endPosWorld);

        // Vérifier si les noeuds ont été trouvés
        if (startNode && endNode) {
            // --- AJOUT DU CONSOLE LOG CRUCIAL ---
            console.log(`Agent ${this.id}: Préparation envoi Worker. StartNode:`, JSON.stringify(startNode), `EndNode:`, JSON.stringify(endNode));
            // Vérification supplémentaire du format (devrait être {x: int, y: int})
            if (typeof startNode.x !== 'number' || !Number.isInteger(startNode.x) || startNode.x < 0 ||
                typeof startNode.y !== 'number' || !Number.isInteger(startNode.y) || startNode.y < 0 ||
                typeof endNode.x !== 'number' || !Number.isInteger(endNode.x) || endNode.x < 0 ||
                typeof endNode.y !== 'number' || !Number.isInteger(endNode.y) || endNode.y < 0)
            {
                 console.error(`Agent ${this.id}: ERREUR FORMAT NOEUDS AVANT ENVOI! Start:`, startNode, "End:", endNode);
                  this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
                  this.isVisible = false;
                 return; // Ne pas envoyer si le format est incorrect
            }
            // --- FIN AJOUT CONSOLE LOG ---

            // Envoyer la requête au worker via AgentManager
            agentManager.requestPathFromWorker(this.id, startNode, endNode);

        } else {
            // Échec de la détermination des noeuds
            console.error(`Agent ${this.id}: Noeuds de départ/arrivée non trouvés ou invalides pour requête path. StartNode:`, startNode, "EndNode:", endNode);
             this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Retour état stable
             this.isVisible = false;
        }
    }

	setPath(pathPoints, pathLengthWorld) {
        // --- MODIFICATION: Mémoriser l'état au début de l'appel --- 
        const currentStateAtCall = this.currentState;
        const wasRequestingWork = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_WORK;
        const wasRequestingHome = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME;
        const wasRequestingWeekendWalk = currentStateAtCall === AgentState.WEEKEND_WALK_REQUESTING_PATH;
        
        // Mémoriser l'état suivant visé pour le cas de retour au trottoir
        const targetStateFromWeekendWalk = this.targetStateFromWeekendWalk;
        // --- FIN MODIFICATION ---

        // --- Cas 1: Chemin Valide Reçu ---
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && pathLengthWorld > 0.1) {
            // Si nous étions en train de retourner à la maison depuis le trottoir après une promenade,
            // spécifiquement vérifier que nous commençons depuis la position actuelle
            if (wasRequestingHome && this.currentState === AgentState.REQUESTING_PATH_FOR_HOME 
                && this.weekendWalkEndTime > 0) {
                
                // Vérifier les points du chemin pour éviter la téléportation
                if (pathPoints.length > 0) {
                    const startPoint = pathPoints[0];
                    const distanceToStartSq = this.position.distanceToSquared(startPoint);
                    const distanceToStart = Math.sqrt(distanceToStartSq);
                    
                    // Si le point de départ du chemin est trop loin de la position actuelle
                    if (distanceToStart > 5.0) {
                        console.warn(`Agent ${this.id}: Téléportation détectée! Distance au début du chemin: ${distanceToStart.toFixed(2)}m. Position actuelle: [${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)}], début du chemin: [${startPoint.x.toFixed(2)}, ${startPoint.z.toFixed(2)}]`);
                        
                        // Correction: remplacer le premier point du chemin par la position actuelle
                        pathPoints[0] = this.position.clone();
                        console.log(`Agent ${this.id}: Premier point du chemin corrigé pour éviter la téléportation`);
                    } else {
                        console.log(`Agent ${this.id}: Chemin pour rentrer à la maison commence correctement à partir de la position actuelle, distance = ${distanceToStart.toFixed(2)}m`);
                    }
                }
            }

            this.currentPathPoints = pathPoints.map(p => p.clone()); 
            this.currentPathLengthWorld = pathLengthWorld;           

            // Calculer la durée du trajet en temps de jeu basé sur la longueur et la vitesse de base
            const travelSecondsGame = pathLengthWorld / this.agentBaseSpeed;
            const dayDurationMs = this.experience.world?.environment?.dayDurationMs;

            if (dayDurationMs > 0) {
                // Convertir les secondes de jeu en millisecondes de jeu
                const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000); // Ratio du trajet par rapport à une journée en secondes
                this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs; // Durée en ms de jeu
            } else {
                // Fallback si la durée du jour est invalide (ne devrait pas arriver si l'env est prêt)
                console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}) lors du calcul de la durée du trajet. Utilisation d'un fallback.`);
                this.calculatedTravelDurationGame = 10 * 60 * 1000; // Fallback (ex: 10 minutes jeu)
                this.currentPathLengthWorld = 0; // Considérer longueur comme invalide si durée fallback
            }

            // --- MODIFICATION: Gérer correctement le retour au trottoir ---
            if (wasRequestingWork) {
                this.currentState = AgentState.READY_TO_LEAVE_FOR_WORK;
            } else if (wasRequestingHome) {
                this.currentState = AgentState.READY_TO_LEAVE_FOR_HOME;
            } else if (wasRequestingWeekendWalk) {
                // Si nous sommes en train de retourner au trottoir depuis le parc
                if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
                    console.log(`Agent ${this.id}: Chemin reçu pour retourner au trottoir depuis le parc, longueur = ${pathLengthWorld.toFixed(2)}m`);
                    this.currentState = AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK;
                } else {
                    this.currentState = AgentState.WEEKEND_WALK_READY;
                }
            } else {
                // Path reçu alors qu'on n'était pas en REQUESTING 
                // C'est normal à cause du timing. On a mis à jour les données du chemin,
                // mais on ne change pas l'état actuel.
            }
            // --- FIN MODIFICATION ---

        }
        // --- Cas 2: Chemin Invalide ou Échec Pathfinding ---
        else {
            console.warn(`Agent ${this.id}: setPath reçu avec chemin invalide (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}) ou longueur ${pathLengthWorld}.`);

            this.currentPathPoints = null;
            this.calculatedTravelDurationGame = 0;
            this.currentPathLengthWorld = 0;
            this.departureTimeGame = -1;
            this.arrivalTmeGame = -1;

            // --- MODIFICATION: Utiliser les états mémorisés pour gérer l'échec --- 
            if (wasRequestingHome) { 
                this.currentState = AgentState.AT_WORK;
                console.warn(`Agent ${this.id}: Pathfinding HOME failed, returning to AT_WORK.`);
                this.isVisible = false; 
            } else if (wasRequestingWork) { 
                this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
                console.warn(`Agent ${this.id}: Pathfinding TO WORK failed, returning to ${this.currentState}.`);
                this.isVisible = false; 
            } 
            else if (wasRequestingWeekendWalk) { 
                if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
                    // En cas d'échec du retour au trottoir, essayer une téléportation propre au trottoir
                    console.warn(`Agent ${this.id}: Échec du chemin pour retourner au trottoir, téléportation directe`);
                    if (this.parkSidewalkPosition) {
                        // Placer directement l'agent sur le trottoir
                        this.position.copy(this.parkSidewalkPosition);
                        this.position.y += this.yOffset;
                        this.isInsidePark = false;
                        
                        // Maintenant demander un chemin vers la maison depuis cette position
                        const navGraph = this.experience.world?.cityManager?.getNavigationGraph();
                        const currentGridNode = navGraph?.getClosestWalkableNode(this.position);
                        
                        console.log(`Agent ${this.id}: Téléporté au trottoir, demande de chemin vers la maison`);
                        this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;
                        
                        // Marquer l'heure de début de la demande de chemin pour le mécanisme de sécurité
                        this._pathRequestTimeout = this.experience.time.elapsed;
                        
                        // Demander directement le chemin sans setTimeout
                        if (this.homePosition && this.homeGridNode) {
                            this.requestPath(
                                this.position.clone(),
                                this.homePosition,
                                currentGridNode,
                                this.homeGridNode,
                                AgentState.READY_TO_LEAVE_FOR_HOME,
                                this.experience.time.elapsed
                            );
                        } else {
                            // Si on n'a pas de position de maison valide, forcer le retour
                            this.forceReturnHome(this.experience.time.elapsed);
                        }
                    } else {
                        // Si on n'a pas de position du trottoir, aller directement à la maison
                        console.warn(`Agent ${this.id}: Position du trottoir inconnue, retour direct à la maison`);
                        this.forceReturnHome(this.experience.time.elapsed);
                    }
                } else {
                    console.warn(`Agent ${this.id}: Pathfinding WEEKEND WALK failed, finding a new destination...`);
                    this._findRandomWalkDestination(); // Tenter de trouver une nouvelle destination
                }
            } else { 
                 console.warn(`Agent ${this.id}: Invalid path received while in state ${currentStateAtCall}. Ignored.`);
            }
            // --- FIN MODIFICATION ---
        }
    } // Fin setPath

	updateState(deltaTime, currentHour, currentGameTime) {
        // Avant d'entrer dans le switch, vérifier si un agent est bloqué
        if (this._pathRequestTimeout && currentGameTime - this._pathRequestTimeout > 10000) {
            // Si plus de 10 secondes se sont écoulées depuis la demande de chemin, forcer le retour
            console.warn(`Agent ${this.id}: Délai dépassé pour la demande de chemin (${(currentGameTime - this._pathRequestTimeout).toFixed(0)}ms), forçage du retour à la maison`);
            this.forceReturnHome(currentGameTime);
            this._pathRequestTimeout = null;
            return;
        }
        
        // Si l'agent est dans l'état WEEKEND_WALK_RETURNING_TO_SIDEWALK depuis trop longtemps
        if (this.currentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
            if (!this._stateStartTime) {
                this._stateStartTime = currentGameTime;
            } else if (currentGameTime - this._stateStartTime > 30000) { // 30 secondes max dans cet état
                console.warn(`Agent ${this.id}: Bloqué dans l'état WEEKEND_WALK_RETURNING_TO_SIDEWALK pendant ${(currentGameTime - this._stateStartTime).toFixed(0)}ms, forçage du retour à la maison`);
                this.forceReturnHome(currentGameTime);
                this._stateStartTime = null;
                return;
            }
        } else {
            this._stateStartTime = null; // Réinitialiser le timer si l'état change
        }
        
        // Récupérer les heures de départ planifiées et la durée du jour
        const departWorkTime = this.exactWorkDepartureTimeGame;
        const departHomeTime = this.exactHomeDepartureTimeGame;
        const dayDurationMs = this.experience.world?.environment?.dayDurationMs;

        // Vérification initiale de la validité des temps planifiés et de l'environnement
        if (!dayDurationMs || dayDurationMs <= 0 || departWorkTime < 0 || departHomeTime < 0 ) {
            if (this.currentState !== AgentState.IDLE) {
                // console.warn(`Agent ${this.id}: Temps planifiés invalides (${departWorkTime}, ${departHomeTime}) ou environnement non prêt (dayDur: ${dayDurationMs}), passage en IDLE.`);
                this.currentState = AgentState.IDLE;
                this.isVisible = false;
            }
            return; // Impossible de continuer sans planification valide
        }

        // Initialisation paresseuse des temps d'arrivée si nécessaire (pour le premier cycle)
        if (this.lastArrivalTimeHome === undefined) this.lastArrivalTimeHome = 0;
        if (this.lastArrivalTimeWork === undefined) this.lastArrivalTimeWork = -1; // Pas encore arrivé au travail initialement
        if (this.requestedPathForDepartureTime === undefined) this.requestedPathForDepartureTime = -1;

        // Récupérer la date courante du jeu
        const environment = this.experience.world?.environment;
        const calendarDate = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;

        // Enregistrer cet agent dans la stratégie de promenade du weekend si nécessaire
        if (calendarDate && ["Samedi", "Dimanche"].includes(calendarDate.jourSemaine) && 
            this.weekendWalkStrategy) {
            this.weekendWalkStrategy.registerAgent(this.id, calendarDate);
        }
        
        // Référence au CarManager
        const carManager = this.experience.world?.carManager;

        // --- Machine d'état ---
        switch (this.currentState) {
            case AgentState.AT_HOME:
                this.isVisible = false; // Assurer invisibilité

                // --- Code existant pour quitter la maison pour le travail ---
                // Vérifier si c'est l'heure de demander un chemin vers le travail
                if (this.workPosition && 
                    currentGameTime >= this.prepareWorkDepartureTimeGame && 
                    this.requestedPathForDepartureTime !== currentGameTime && 
                    calendarDate && !["Samedi", "Dimanche"].includes(calendarDate.jourSemaine)) {
                    
                    // Code de transition vers le travail, modifié pour gérer la voiture
                    
                    // Si l'agent utilise sa voiture pour aller au travail
                    if (this.hasVehicle && carManager) {
                        console.log(`Agent ${this.id}: Préparation départ pour le travail avec voiture`);
                        
                        // Créer une voiture pour cet agent
                        if (!carManager.hasCarForAgent(this.id)) {
                            // La voiture apparaît au début du chemin
                            const car = carManager.createCarForAgent(
                                this,
                                this.vehicleHomePosition || this.homePosition,
                                this.workPosition
                            );
                            
                            if (car) {
                                // L'agent devient visible brièvement pour sortir de la maison
                                this.isVisible = true;
                                
                                // Demander un chemin pour la voiture
                                this.requestedPathForDepartureTime = currentGameTime;
                                this.currentState = AgentState.REQUESTING_PATH_FOR_WORK;
                                
                                // Demander le même chemin que ce que l'agent aurait pris, mais pour la voiture
                                this.requestPath(
                                    this.homePosition, 
                                    this.workPosition,
                                    this.homeGridNode,
                                    this.workGridNode, 
                                    AgentState.READY_TO_LEAVE_FOR_WORK,
                                    currentGameTime
                                );
                            } else {
                                // Si création de voiture échoue, utiliser le comportement normal de l'agent
                                console.warn(`Agent ${this.id}: Échec création voiture, utilisation comportement piéton`);
                                this.hasVehicle = false; // Désactiver la voiture pour cet agent
                                
                                // Code standard pour demander un chemin à pied
                                this.requestedPathForDepartureTime = currentGameTime;
                                this.requestPath(
                                    this.homePosition, 
                                    this.workPosition,
                                    this.homeGridNode,
                                    this.workGridNode, 
                                    AgentState.READY_TO_LEAVE_FOR_WORK,
                                    currentGameTime
                                );
                            }
                        }
                    } else {
                        // Code standard pour demander un chemin à pied (inchangé)
                        console.log(`Agent ${this.id}: Préparation départ pour le travail à pied`);
                        this.requestedPathForDepartureTime = currentGameTime;
                        this.requestPath(
                            this.homePosition, 
                            this.workPosition,
                            this.homeGridNode,
                            this.workGridNode, 
                            AgentState.READY_TO_LEAVE_FOR_WORK,
                            currentGameTime
                        );
                    }
                }
                // --- Fin code départ pour travail ---

                // Code pour promenade weekend (inchangé)
                else if (calendarDate && ["Samedi", "Dimanche"].includes(calendarDate.jourSemaine) &&
                        this.weekendWalkStrategy && this.weekendWalkStrategy.shouldStartWalk(this.id, currentGameTime)) {
                    
                    this._findRandomWalkDestination(currentGameTime);
                }
                break;
                
            case AgentState.READY_TO_LEAVE_FOR_WORK:
                // Modifié pour gérer le départ en voiture
                if (currentGameTime >= this.exactWorkDepartureTimeGame) {
                    if (this.hasVehicle && carManager && carManager.hasCarForAgent(this.id)) {
                        // Transition vers l'état de conduite
                        this.currentState = AgentState.DRIVING_TO_WORK;
                        this.isVisible = false; // L'agent devient invisible, la voiture prend le relais
                        this.isUsingVehicle = true;
                        
                        // Envoyer le chemin à la voiture
                        const car = carManager.getCarForAgent(this.id);
                        if (car && this.currentPathPoints) {
                            car.setPath(this.currentPathPoints);
                            // Calculer le temps de trajet pour la voiture
                            const carSpeed = car.speed;
                            const pathLength = this.currentPathLengthWorld;
                            this.calculatedTravelDurationGame = (pathLength / carSpeed) * 1000; // Convertir en ms
                            this.departureTimeGame = currentGameTime;
                            this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                            console.log(`Agent ${this.id}: Commence à conduire vers le travail, durée estimée: ${this.calculatedTravelDurationGame/1000}s`);
                        }
                    } else {
                        // Transition standard vers le trajet à pied (inchangé)
                        console.log(`Agent ${this.id}: Départ pour le travail à pied depuis READY_TO_LEAVE_FOR_WORK`);
                        this.currentState = AgentState.IN_TRANSIT_TO_WORK;
                        this.isVisible = true;
                        this.departureTimeGame = currentGameTime;
                        this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                    }
                }
                break;
            
            case AgentState.DRIVING_TO_WORK:
                // Nouvel état - l'agent est en train de conduire vers le travail
                this.isVisible = false; // L'agent est invisible pendant qu'il conduit
                
                // Vérifier si la voiture est arrivée à destination
                if (carManager) {
                    const car = carManager.getCarForAgent(this.id);
                    if (car && !car.isActive) {
                        // La voiture est arrivée, l'agent arrive au travail
                        console.log(`Agent ${this.id}: Voiture arrivée au travail`);
                        this.currentState = AgentState.AT_WORK;
                        this.isUsingVehicle = false;
                        this.isVisible = false;
                        this.lastArrivalTimeWork = currentGameTime;
                        
                        // Libérer la voiture
                        carManager.releaseCarForAgent(this.id);
                    } else if (car && currentGameTime >= this.arrivalTmeGame) {
                        // Si le temps de trajet est dépassé, vérifier si la voiture est proche de la destination
                        const distanceToWork = car.position.distanceTo(this.workPosition);
                        if (distanceToWork < 5.0) { // Si la voiture est à moins de 5 unités du travail
                            console.log(`Agent ${this.id}: Voiture proche du travail (${distanceToWork.toFixed(2)}m), forçage de l'arrivée`);
                            this.currentState = AgentState.AT_WORK;
                            this.isUsingVehicle = false;
                            this.isVisible = false;
                            this.lastArrivalTimeWork = currentGameTime;
                            car.isActive = false; // Désactiver la voiture
                            carManager.releaseCarForAgent(this.id);
                        } else {
                            // La voiture n'est pas encore proche, continuer à attendre
                            console.log(`Agent ${this.id}: Temps de trajet dépassé mais voiture encore loin (${distanceToWork.toFixed(2)}m), attente...`);
                        }
                    }
                } else {
                    // Si le carManager n'est pas disponible, revenir à l'état à pied
                    console.warn(`Agent ${this.id}: CarManager non disponible pendant le trajet, passage en mode piéton`);
                    this.currentState = AgentState.IN_TRANSIT_TO_WORK;
                    this.isVisible = true;
                    this.isUsingVehicle = false;
                }
                break;

            case AgentState.AT_WORK:
                this.isVisible = false; // Assurer invisibilité

                // Vérifier si c'est l'heure de demander un chemin vers la maison
                if (this.homePosition && 
                    currentGameTime >= this.prepareHomeDepartureTimeGame && 
                    this.requestedPathForDepartureTime !== currentGameTime) {
                    
                    // Si l'agent utilise sa voiture pour rentrer à la maison
                    if (this.hasVehicle && carManager) {
                        console.log(`Agent ${this.id}: Préparation départ pour la maison avec voiture`);
                        
                        // Créer une voiture pour cet agent
                        if (!carManager.hasCarForAgent(this.id)) {
                            // La voiture apparaît au début du chemin
                            const car = carManager.createCarForAgent(
                                this,
                                this.workPosition,
                                this.vehicleHomePosition || this.homePosition
                            );
                            
                            if (car) {
                                // L'agent devient visible brièvement pour sortir du travail
                                this.isVisible = true;
                                
                                // Demander un chemin pour la voiture
                                this.requestedPathForDepartureTime = currentGameTime;
                                this.currentState = AgentState.REQUESTING_PATH_FOR_HOME;
                                
                                // Demander le même chemin que ce que l'agent aurait pris, mais pour la voiture
                                this.requestPath(
                                    this.workPosition, 
                                    this.homePosition,
                                    this.workGridNode,
                                    this.homeGridNode, 
                                    AgentState.READY_TO_LEAVE_FOR_HOME,
                                    currentGameTime
                                );
                            } else {
                                // Si création de voiture échoue, utiliser le comportement normal de l'agent
                                console.warn(`Agent ${this.id}: Échec création voiture, utilisation comportement piéton`);
                                this.hasVehicle = false; // Désactiver la voiture pour cet agent
                                
                                // Code standard pour demander un chemin à pied
                                this.requestedPathForDepartureTime = currentGameTime;
                                this.requestPath(
                                    this.workPosition, 
                                    this.homePosition,
                                    this.workGridNode,
                                    this.homeGridNode, 
                                    AgentState.READY_TO_LEAVE_FOR_HOME,
                                    currentGameTime
                                );
                            }
                        }
                    } else {
                        // Code standard pour demander un chemin à pied (inchangé)
                        console.log(`Agent ${this.id}: Préparation départ pour la maison à pied`);
                        this.requestedPathForDepartureTime = currentGameTime;
                        this.requestPath(
                            this.workPosition, 
                            this.homePosition,
                            this.workGridNode,
                            this.homeGridNode, 
                            AgentState.READY_TO_LEAVE_FOR_HOME,
                            currentGameTime
                        );
                    }
                }
                break;
                
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                // Modifié pour gérer le départ en voiture
                if (currentGameTime >= this.exactHomeDepartureTimeGame) {
                    if (this.hasVehicle && carManager && carManager.hasCarForAgent(this.id)) {
                        // Transition vers l'état de conduite
                        this.currentState = AgentState.DRIVING_HOME;
                        this.isVisible = false; // L'agent devient invisible, la voiture prend le relais
                        this.isUsingVehicle = true;
                        
                        // Envoyer le chemin à la voiture
                        const car = carManager.getCarForAgent(this.id);
                        if (car && this.currentPathPoints) {
                            car.setPath(this.currentPathPoints);
                            console.log(`Agent ${this.id}: Commence à conduire vers la maison`);
                        }
                    } else {
                        // Transition standard vers le trajet à pied (inchangé)
                        console.log(`Agent ${this.id}: Départ pour la maison à pied depuis READY_TO_LEAVE_FOR_HOME`);
                        this.currentState = AgentState.IN_TRANSIT_TO_HOME;
                        this.isVisible = true;
                        this.departureTimeGame = currentGameTime;
                        this.arrivalTmeGame = currentGameTime + this.calculatedTravelDurationGame;
                    }
                }
                break;
                
            case AgentState.DRIVING_HOME:
                // Nouvel état - l'agent est en train de conduire vers la maison
                this.isVisible = false; // L'agent est invisible pendant qu'il conduit
                
                // Vérifier si la voiture est arrivée à destination
                if (carManager) {
                    const car = carManager.getCarForAgent(this.id);
                    if (car && !car.isActive) {
                        // La voiture est arrivée, l'agent arrive à la maison
                        console.log(`Agent ${this.id}: Voiture arrivée à la maison`);
                        this.currentState = AgentState.AT_HOME;
                        this.isUsingVehicle = false;
                        this.isVisible = false;
                        this.lastArrivalTimeHome = currentGameTime;
                        
                        // Libérer la voiture
                        carManager.releaseCarForAgent(this.id);
                    }
                } else {
                    // Si le carManager n'est pas disponible, revenir à l'état à pied
                    console.warn(`Agent ${this.id}: CarManager non disponible pendant le trajet, passage en mode piéton`);
                    this.currentState = AgentState.IN_TRANSIT_TO_HOME;
                    this.isVisible = true;
                    this.isUsingVehicle = false;
                }
                break;

            // --- Les autres états restent inchangés ---
            
            // ... Autres cas du switch ...
        }
    }

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
}

// Export de l'enum pour usage externe
Agent.prototype.constructor.AgentState = AgentState;