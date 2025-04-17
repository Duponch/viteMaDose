// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

const AgentState = {
    AT_HOME: 'AT_HOME',
    PREPARING_TO_LEAVE_FOR_WORK: 'PREPARING_TO_LEAVE_FOR_WORK',
    REQUESTING_PATH_FOR_WORK: 'REQUESTING_PATH_FOR_WORK',
    READY_TO_LEAVE_FOR_WORK: 'READY_TO_LEAVE_FOR_WORK',
    IN_TRANSIT_TO_WORK: 'IN_TRANSIT_TO_WORK',
    AT_WORK: 'AT_WORK',
    PREPARING_TO_LEAVE_FOR_HOME: 'PREPARING_TO_LEAVE_FOR_HOME',
    REQUESTING_PATH_FOR_HOME: 'REQUESTING_PATH_FOR_HOME',
    READY_TO_LEAVE_FOR_HOME: 'READY_TO_LEAVE_FOR_HOME',
    IN_TRANSIT_TO_HOME: 'IN_TRANSIT_TO_HOME',
    IDLE: 'IDLE',
};

export default class Agent {
    constructor(config, instanceId, experience) {
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

        this._calculateScheduledTimes();
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

    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null, nextStateIfSuccess) {
        // nextStateIfSuccess sera par exemple READY_TO_LEAVE_FOR_WORK ou READY_TO_LEAVE_FOR_HOME

        // Réinitialiser les données du trajet précédent
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;

        // Déterminer l'état d'attente pendant la requête
        this.currentState = (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_WORK)
                          ? AgentState.REQUESTING_PATH_FOR_WORK
                          : AgentState.REQUESTING_PATH_FOR_HOME;
        this.isVisible = false; // Reste caché pendant la demande initiale

        const agentManager = this.experience.world?.agentManager;
        const navGraph = this.experience.world?.cityManager?.getNavigationGraph(); // Accéder via cityManager

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
        const wasRequestingWork = this.currentState === AgentState.REQUESTING_PATH_FOR_WORK;
        const wasRequestingHome = this.currentState === AgentState.REQUESTING_PATH_FOR_HOME;

       if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && pathLengthWorld > 0.1) {
           this.currentPathPoints = pathPoints.map(p => p.clone());
           this.currentPathLengthWorld = pathLengthWorld; // <- STOCKER LA LONGUEUR

           const travelSecondsGame = pathLengthWorld / this.agentBaseSpeed;
           const dayDurationMs = this.experience.world?.environment?.dayDurationMs;
           if (dayDurationMs > 0) {
               const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
               this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
           } else {
               console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}), impossible de calculer la durée du trajet.`);
               this.calculatedTravelDurationGame = 10 * 60 * 1000; // Fallback
               this.currentPathLengthWorld = 0; // Invalider longueur si durée fallback
           }

           if (wasRequestingWork) {
               this.currentState = AgentState.READY_TO_LEAVE_FOR_WORK;
           } else if (wasRequestingHome) {
               this.currentState = AgentState.READY_TO_LEAVE_FOR_HOME;
           } else {
                console.warn(`Agent ${this.id}: Reçu path alors qu'en état ${this.currentState}. Path stocké.`);
           }
            // console.log(`Agent ${this.id}: Path processed. Length=${this.currentPathLengthWorld.toFixed(1)}, Duration=${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s game. State: ${this.currentState}`);

       } else {
           console.warn(`Agent ${this.id}: setPath reçu avec chemin invalide ou longueur ${pathLengthWorld}.`);
           this.currentPathPoints = null;
           this.calculatedTravelDurationGame = 0;
           this.currentPathLengthWorld = 0; // Réinitialiser longueur
           this.departureTimeGame = -1;
           this.arrivalTmeGame = -1;

           if (wasRequestingWork || wasRequestingHome) {
               this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
               console.warn(`Agent ${this.id}: Pathfinding failed or invalid path, returning to ${this.currentState}.`);
           }
            this.isVisible = (this.currentState !== AgentState.AT_HOME && this.currentState !== AgentState.AT_WORK);
       }
   }

   updateState(deltaTime, currentHour, currentGameTime) {
		// deltaTime n'est pas directement utilisé ici, tout est basé sur currentGameTime

		// Récupérer les heures planifiées (au cas où elles auraient été recalculées)
		const prepareWorkTime = this.prepareWorkDepartureTimeGame;
		const departWorkTime = this.exactWorkDepartureTimeGame;
		const prepareHomeTime = this.prepareHomeDepartureTimeGame;
		const departHomeTime = this.exactHomeDepartureTimeGame;
		const dayDurationMs = this.experience.world?.environment?.dayDurationMs;

		// Gérer le cas où les temps ne sont pas valides
		if (prepareWorkTime < 0 || departWorkTime < 0 || prepareHomeTime < 0 || departHomeTime < 0 || !dayDurationMs) {
			if (this.currentState !== AgentState.IDLE) {
				// console.warn(`Agent ${this.id}: Temps planifiés invalides, passage en IDLE.`);
				this.currentState = AgentState.IDLE;
			}
			return; // Ne peut rien faire sans planification
		}

		// Logique de la machine d'état basée sur currentGameTime modulo la durée du jour
		const timeInCurrentDayCycle = currentGameTime % dayDurationMs;

		switch (this.currentState) {
			case AgentState.AT_HOME:
				// Vérifier s'il est temps de se préparer à partir travailler
				// Gérer le cas où l'heure de préparation est le jour précédent (ex: préparer à 23:55 pour partir à 00:00)
				let effectivePrepareWorkTime = prepareWorkTime;
				// Si l'heure actuelle est "avant" l'heure de départ mais "après" l'heure de prépa qui était la veille
				if (timeInCurrentDayCycle < departWorkTime && prepareWorkTime > departWorkTime) {
				effectivePrepareWorkTime = prepareWorkTime - dayDurationMs; // Temps de prépa ramené au début du cycle actuel
				}
				// Si l'heure actuelle est entre l'heure de prépa et l'heure de départ
				if (this.workPosition && this.homeGridNode && this.workGridNode &&
					timeInCurrentDayCycle >= effectivePrepareWorkTime && timeInCurrentDayCycle < departWorkTime)
				{
					// console.log(`Agent ${this.id}: Time to prepare for work (Current: ${timeInCurrentDayCycle.toFixed(0)}, Prepare: ${prepareWorkTime.toFixed(0)})`);
					this.requestPath(this.homePosition, this.workPosition, this.homeGridNode, this.workGridNode, AgentState.READY_TO_LEAVE_FOR_WORK);
					// L'état passe à REQUESTING_PATH_FOR_WORK dans requestPath
				}
				break;

			case AgentState.READY_TO_LEAVE_FOR_WORK:
				// Le chemin est prêt, on attend l'heure H pour partir
				// Gérer le passage de minuit entre la préparation et le départ
				let effectiveDepartWorkTime = departWorkTime;
				// Si l'heure de départ est "tôt" (ex: 0h) et que l'heure actuelle est "tard" (ex: 23h59)
				if (departWorkTime < timeInCurrentDayCycle && departWorkTime < prepareWorkTime) {
					// Ce cas est complexe, mais signifie qu'on a déjà dépassé l'heure de départ pour ce cycle
					// On devrait peut-être forcer le départ si on est dans cet état ?
					// Ou considérer l'heure de départ du *prochain* cycle.
					// Simplifions: Si on est prêt et qu'on dépasse l'heure, on part.
					// effectiveDepartWorkTime += dayDurationMs; // Non, on compare au temps modulo dayDurationMs
				}

				if (timeInCurrentDayCycle >= departWorkTime) {
					// console.log(`Agent ${this.id}: Departing for work at ${currentGameTime.toFixed(0)} (Target: ${departWorkTime.toFixed(0)})`);
					this.departureTimeGame = currentGameTime; // Enregistrer l'heure de départ réelle (ou departWorkTime?)
					this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
					this.currentState = AgentState.IN_TRANSIT_TO_WORK;
					this.isVisible = true; // Devient visible en partant
					this.currentPathIndexVisual = 0; // Prêt pour l'interpolation visuelle
					this.visualInterpolationProgress = 0;
				}
				break;

			case AgentState.IN_TRANSIT_TO_WORK:
				// Vérifier si l'heure d'arrivée est atteinte
				if (this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame) {
					// console.log(`Agent ${this.id}: Arrived at work at ${currentGameTime.toFixed(0)} (Scheduled: ${this.arrivalTmeGame.toFixed(0)})`);
					this.currentState = AgentState.AT_WORK;
					this.isVisible = false; // Disparaît en arrivant
					this.position.copy(this.workPosition); // Snap visuel final
					this.position.y += this.yOffset;
					// Réinitialiser les infos de trajet
					this.currentPathPoints = null;
					this.departureTimeGame = -1;
					this.arrivalTmeGame = -1;
					this.calculatedTravelDurationGame = 0;
					// TODO: Notifier CitizenManager ou autre système de l'arrivée pour stats
				}
				break;

			case AgentState.AT_WORK:
				// Vérifier s'il est temps de se préparer à rentrer
				let effectivePrepareHomeTime = prepareHomeTime;
				if (timeInCurrentDayCycle < departHomeTime && prepareHomeTime > departHomeTime) {
					effectivePrepareHomeTime = prepareHomeTime - dayDurationMs;
				}

				if (this.homePosition && this.workGridNode && this.homeGridNode &&
					timeInCurrentDayCycle >= effectivePrepareHomeTime && timeInCurrentDayCycle < departHomeTime)
				{
					// console.log(`Agent ${this.id}: Time to prepare for home (Current: ${timeInCurrentDayCycle.toFixed(0)}, Prepare: ${prepareHomeTime.toFixed(0)})`);
					this.requestPath(this.workPosition, this.homePosition, this.workGridNode, this.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME);
				}
				break;

			case AgentState.READY_TO_LEAVE_FOR_HOME:
				// Attendre l'heure H pour partir de travail
				let effectiveDepartHomeTime = departHomeTime;
				// ... (gestion passage minuit si nécessaire, similaire à work) ...

				if (timeInCurrentDayCycle >= departHomeTime) {
					// console.log(`Agent ${this.id}: Departing for home at ${currentGameTime.toFixed(0)} (Target: ${departHomeTime.toFixed(0)})`);
					this.departureTimeGame = currentGameTime;
					this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
					this.currentState = AgentState.IN_TRANSIT_TO_HOME;
					this.isVisible = true;
					this.currentPathIndexVisual = 0;
					this.visualInterpolationProgress = 0;
				}
				break;

			case AgentState.IN_TRANSIT_TO_HOME:
				// Vérifier si l'heure d'arrivée est atteinte
				if (this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame) {
					// console.log(`Agent ${this.id}: Arrived home at ${currentGameTime.toFixed(0)} (Scheduled: ${this.arrivalTmeGame.toFixed(0)})`);
					this.currentState = AgentState.AT_HOME;
					this.isVisible = false;
					this.position.copy(this.homePosition); // Snap visuel final
					this.position.y += this.yOffset;
					// Réinitialiser
					this.currentPathPoints = null;
					this.departureTimeGame = -1;
					this.arrivalTmeGame = -1;
					this.calculatedTravelDurationGame = 0;
					// TODO: Notifier CitizenManager ou autre système
				}
				break;

			// Cas IDLE, REQUESTING_PATH... : ne font rien dans la boucle de state principale
			case AgentState.IDLE:
			case AgentState.PREPARING_TO_LEAVE_FOR_WORK: // Ces états sont transitoires ou gérés par d'autres logiques
			case AgentState.REQUESTING_PATH_FOR_WORK:
			case AgentState.PREPARING_TO_LEAVE_FOR_HOME:
			case AgentState.REQUESTING_PATH_FOR_HOME:
				break;
		}
	}

	updateVisuals(deltaTime, currentGameTime) {
        if (this.currentState !== AgentState.IN_TRANSIT_TO_WORK && this.currentState !== AgentState.IN_TRANSIT_TO_HOME) {
             if(this.currentState === AgentState.AT_HOME && this.homePosition) {
                 this.position.copy(this.homePosition).setY(this.yOffset);
             } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                  this.position.copy(this.workPosition).setY(this.yOffset);
             }
            return;
        }

        if (!this.currentPathPoints || this.currentPathPoints.length === 0 || this.calculatedTravelDurationGame <= 0 || this.departureTimeGame < 0 || this.currentPathLengthWorld <= 0) { // Vérifier aussi la longueur stockée
            // console.warn(`Agent ${this.id}: Tentative d'update visuel en transit sans données valides (length: ${this.currentPathLengthWorld}).`);
            this.isVisible = false;
            return;
        }

        const elapsedTimeSinceDeparture = currentGameTime - this.departureTimeGame;
        let progress = Math.max(0, Math.min(1, elapsedTimeSinceDeparture / this.calculatedTravelDurationGame));
        this.visualInterpolationProgress = progress;

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
            const deltaSeconds = deltaTime / 1000.0;
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
            this.orientation.slerp(this._tempQuat, slerpAlpha);
        }

        // Calculer animation de marche (inchangé)
		console.log("AAAAAAAAAAA");

		console.log(this.experience.world);
        const effectiveAnimationSpeed = this.visualSpeed * (this.experience.world.cityManager.config.agentAnimationSpeedFactor ?? 1.0);
        const walkTime = currentGameTime / 1000 * effectiveAnimationSpeed;
        this._updateWalkAnimation(walkTime);
    }

	_updateWalkAnimation(walkTime) {
        // Accéder à la config via cityManager
        const config = this.experience.world?.cityManager?.config;
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
                   this.requestPath(this.position, this.workPosition, this.homeGridNode, this.workGridNode);
                }
                break;
            case 'AT_WORK':
                this.isVisible = false;
                if ((currentHour >= 19 || currentHour < 8) && this.homePosition && this.workGridNode && this.homeGridNode) {
                    // console.log(`Agent ${this.id} leaving work for home.`);
                    this.requestPath(this.position, this.homePosition, this.workGridNode, this.homeGridNode);
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
}