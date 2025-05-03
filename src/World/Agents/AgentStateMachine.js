// src/World/AgentStateMachine.js
import AgentState from './AgentState.js';
// AgentWeekendBehavior is accessed via agent instance

export default class AgentStateMachine {
    /**
     * Gère la logique des états et transitions pour un Agent.
     * @param {Agent} agent - L'instance Agent à contrôler.
     */
    constructor(agent) {
        this.agent = agent;
        this.experience = agent.experience; // Raccourci vers experience
    }

    /**
     * Met à jour l'état logique de l'agent en fonction des conditions actuelles.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (non utilisé directement ici).
     * @param {number} currentHour - Heure actuelle du jeu (0-23).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
    update(deltaTime, currentHour, currentGameTime) {
        const agent = this.agent; // Raccourci

        // --- CORRECTION: Capturer l'état AU DÉBUT de l'update ---
        const previousStateForTimer = agent.currentState;
        // -------------------------------------------------------

        // --- Informations Environnement / Calendrier ---
        const environment = this.experience.world?.environment;
        const calendarDate = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;
        const dayDurationMs = environment?.dayDurationMs;

        // --- Vérification initiale essentielle ---
        if (!dayDurationMs || dayDurationMs <= 0 || !calendarDate) {
            if (agent.currentState !== AgentState.IDLE) {
                agent.currentState = AgentState.IDLE;
                agent.isVisible = false;
                // Mettre à jour _stateStartTime si on entre dans IDLE
                if (previousStateForTimer !== AgentState.IDLE) agent._stateStartTime = null;
            }
            return;
        }

        // --- Temps dans le cycle et Numéro du Jour ---
        const timeWithinCurrentDayCycle = currentGameTime % dayDurationMs;
        const currentDayNumber = calendarDate.annee * 10000 + (calendarDate.mois) * 100 + calendarDate.jour;

        // --- VÉRIFICATION SÉCURITÉ ÉTAT BLOQUÉ ---
        const MAX_TRANSIT_DURATION_FACTOR = 2.0;
        const maxTransitTime = dayDurationMs * MAX_TRANSIT_DURATION_FACTOR;
        const isStuckCheckState =
            agent.currentState === AgentState.IN_TRANSIT_TO_WORK || agent.currentState === AgentState.DRIVING_TO_WORK ||
            agent.currentState === AgentState.IN_TRANSIT_TO_HOME || agent.currentState === AgentState.DRIVING_HOME ||
            agent.currentState === AgentState.REQUESTING_PATH_FOR_WORK || agent.currentState === AgentState.REQUESTING_PATH_FOR_HOME ||
            agent.currentState === AgentState.WEEKEND_WALK_REQUESTING_PATH || agent.currentState === AgentState.WEEKEND_WALKING ||
            agent.currentState === AgentState.WAITING_FOR_PATH || agent.currentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK;

        if (isStuckCheckState && agent._stateStartTime && currentGameTime - agent._stateStartTime > maxTransitTime) {
            console.warn(`[AGENT ${agent.id} SAFETY] Bloqué en état ${agent.currentState} pendant > ${MAX_TRANSIT_DURATION_FACTOR} jours. Forçage récupération.`);
            agent.forceRecoverFromTimeout(currentGameTime);
            // Après récupération, on ne continue pas l'update de la state machine pour ce tick
            return;
        }

        // --- Vérification Timeout Path Request ---
        const PATH_REQUEST_TIMEOUT_MS = 100000; // 100 secondes
        if (agent._pathRequestTimeout && (agent.currentState.startsWith('REQUESTING_') || agent.currentState === AgentState.WAITING_FOR_PATH) && (currentGameTime - agent._pathRequestTimeout > PATH_REQUEST_TIMEOUT_MS)) {
            console.warn(`Agent ${agent.id}: Path request timed out in state ${agent.currentState}. Forcing recovery.`);
            agent.forceRecoverFromTimeout(currentGameTime);
            // Après récupération, on ne continue pas l'update
            return;
        }

        // --- Heures Planifiées ---
        const departWorkTime = agent.exactWorkDepartureTimeGame;
        const departHomeTime = agent.exactHomeDepartureTimeGame;
        if (departWorkTime < 0 || departHomeTime < 0) {
            if (agent.currentState !== AgentState.IDLE) {
                agent.currentState = AgentState.IDLE;
                agent.isVisible = false;
                 // Mettre à jour _stateStartTime si on entre dans IDLE
                if (previousStateForTimer !== AgentState.IDLE) agent._stateStartTime = null;
            }
            return;
        }

        // --- Délégation Weekend ---
        const isWeekendNow = ["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine);
        const isWeekendState = agent.currentState.startsWith('WEEKEND_');

        if ((isWeekendNow && agent.currentState === AgentState.AT_HOME) || isWeekendState) {
            if (agent.weekendBehavior) {
                agent.weekendBehavior.update(calendarDate, currentHour, currentGameTime);
                // Si weekendBehavior a changé l'état vers un état NON-weekend ou un état de REQUETE,
                // on arrête ici pour ce tick.
                const stateAfterWeekendUpdate = agent.currentState; // Lire l'état *après* l'appel à weekendBehavior.update
                if (!stateAfterWeekendUpdate.startsWith('WEEKEND_') || stateAfterWeekendUpdate.startsWith('REQUESTING_')) {
                    // --- CORRECTION: Comparer à l'état CAPTURÉ AU DÉBUT ---
                    // Mettre à jour _stateStartTime si on vient d'entrer dans un état de requête (initié par weekendBehavior)
                    if (stateAfterWeekendUpdate.startsWith('REQUESTING_') && previousStateForTimer !== stateAfterWeekendUpdate) {
                        agent._stateStartTime = currentGameTime;
                    }
                    // ----------------------------------------------------
                    return; // La machine principale reprendra au prochain tick
                }
            } else {
                console.warn(`Agent ${agent.id}: Comportement Weekend demandé mais weekendBehavior non défini.`);
            }
        }

        // --- Machine d'état (Logique travail/maison semaine) ---
        // Utiliser l'état actuel de l'agent, qui peut avoir été modifié par weekendBehavior
        const currentState = agent.currentState;

        switch (currentState) {
            case AgentState.AT_HOME:
                agent.isVisible = false;
                if (!isWeekendNow) { // Si c'est le weekend, la logique est déjà gérée au-dessus
                    const shouldWorkToday = agent.workScheduleStrategy?.shouldWorkToday(calendarDate) ?? false;
                    const workCheckCondition = (
                        agent.workPosition && shouldWorkToday &&
                        currentDayNumber > agent.lastDepartureDayWork &&
                        timeWithinCurrentDayCycle >= agent.prepareWorkDepartureTimeGame &&
                        currentHour < agent.departureHomeHour && // Sécurité pour éviter départ tardif
                        agent.requestedPathForDepartureTime !== currentGameTime // Éviter double requête
                    );

                    if (workCheckCondition) {
                        agent.requestedPathForDepartureTime = currentGameTime;
                        const shouldUseCar = agent.vehicleBehavior?.shouldUseVehicle() ?? false;
                        if (shouldUseCar) {
                            const startCarPos = agent.vehicleBehavior.vehicleHomePosition || agent.homePosition.clone().setY(0.25);
                            const carRequested = agent.vehicleBehavior.requestCar(startCarPos, agent.workPosition);
                            if (!carRequested) console.warn(`Agent ${agent.id}: Échec requête voiture (Fallback piéton).`);
                        }
                        if (agent.homePosition && agent.workPosition) {
                            agent._currentPathRequestGoal = 'WORK';
                            agent.requestPath(agent.homePosition, agent.workPosition, null, null, AgentState.READY_TO_LEAVE_FOR_WORK, currentGameTime);
                        } else {
                            console.error(`Agent ${this.agent.id}: homePosition ou workPosition manquant pour demande travail.`);
                            agent.requestedPathForDepartureTime = -1;
                        }
                    }
                }
                break;

            case AgentState.AT_WORK:
                agent.isVisible = false;
                const homeCheckCondition = (
                    agent.homePosition &&
                    currentDayNumber > agent.lastDepartureDayHome &&
                    timeWithinCurrentDayCycle >= agent.prepareHomeDepartureTimeGame &&
                    agent.requestedPathForDepartureTime !== currentGameTime
                );
                if (homeCheckCondition) {
                    agent.requestedPathForDepartureTime = currentGameTime;
                    const shouldUseCar = agent.vehicleBehavior?.shouldUseVehicle() ?? false;
                    if (shouldUseCar) {
                        const startCarPos = agent.workPosition.clone().setY(0.25);
                        const endCarPos = agent.vehicleBehavior.vehicleHomePosition || agent.homePosition.clone().setY(0.25);
                        const carRequested = agent.vehicleBehavior.requestCar(startCarPos, endCarPos);
                        if (!carRequested) console.warn(`Agent ${agent.id}: Échec requête voiture pour retour (Fallback piéton).`);
                    }
                    if (agent.workPosition && agent.homePosition) {
                        agent._currentPathRequestGoal = 'HOME';
                        agent.requestPath(agent.workPosition, agent.homePosition, null, null, AgentState.READY_TO_LEAVE_FOR_HOME, currentGameTime);
                    } else {
                        console.error(`Agent ${this.agent.id}: workPosition ou homePosition manquant pour demande retour.`);
                        agent.requestedPathForDepartureTime = -1;
                    }
                }
                break;

            case AgentState.READY_TO_LEAVE_FOR_WORK:
                if (timeWithinCurrentDayCycle >= agent.exactWorkDepartureTimeGame) {
                    let departureSuccessful = false;
                    const isDriving = agent.vehicleBehavior?.isDriving() ?? false;

                    if (isDriving) {
                        const car = agent.vehicleBehavior.currentVehicle;
                        if (car && agent.currentPathPoints) {
                            agent.vehicleBehavior.enterVehicle(); // Confirme que l'agent est bien dans la voiture
                            car.setPath(agent.currentPathPoints);
                            agent.currentState = AgentState.DRIVING_TO_WORK;
                            agent.isVisible = false; // Agent logique caché
                            agent.departureTimeGame = currentGameTime;
                            const carSpeed = car.speed;
                            agent.calculatedTravelDurationGame = (carSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / carSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { // Problème voiture/chemin -> fallback piéton
                            console.warn(`Agent ${agent.id}: Problème départ voiture (voiture ou chemin manquant). Tentative départ piéton.`);
                            agent.vehicleBehavior.exitVehicle(); // Libère la voiture demandée mais non utilisée
                            if (agent.currentPathPoints) { // Tente départ piéton
                                agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            } else { // Pas de chemin non plus -> retour maison
                                agent.currentState = AgentState.AT_HOME; agent.isVisible = false;
                            }
                        }
                    } else { // Départ Piéton
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { // Pas de chemin -> retour maison
                            agent.currentState = AgentState.AT_HOME; agent.isVisible = false;
                        }
                        if(agent.vehicleBehavior) agent.vehicleBehavior.isUsingVehicle = false; // Assurer état correct
                    }
                    // --- CORRECTION : Comparer à l'état CAPTURÉ AU DÉBUT ---
                    if (departureSuccessful && previousStateForTimer !== agent.currentState) {
                        agent.lastDepartureDayWork = currentDayNumber;
                    }
                    // --------------------------------------------------
                    agent._pathRequestTimeout = null;
                }
                break;

            case AgentState.READY_TO_LEAVE_FOR_HOME:
                 if (timeWithinCurrentDayCycle >= agent.exactHomeDepartureTimeGame) {
                    let departureSuccessful = false;
                    const isDriving = agent.vehicleBehavior?.isDriving() ?? false;
                    if (isDriving) {
                        const car = agent.vehicleBehavior.currentVehicle;
                        if (car && agent.currentPathPoints) {
                            agent.vehicleBehavior.enterVehicle();
                            car.setPath(agent.currentPathPoints);
                            agent.currentState = AgentState.DRIVING_HOME; agent.isVisible = false;
                            agent.departureTimeGame = currentGameTime;
                            const carSpeed = car.speed;
                            agent.calculatedTravelDurationGame = (carSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / carSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { // Problème voiture/chemin -> fallback piéton
                             console.warn(`Agent ${agent.id}: Problème départ voiture pour retour (voiture ou chemin manquant). Tentative départ piéton.`);
                             agent.vehicleBehavior.exitVehicle();
                             if (agent.currentPathPoints) { // Tente départ piéton
                                 agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                                 agent.departureTimeGame = currentGameTime;
                                 agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                 agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                 departureSuccessful = true;
                             } else { // Pas de chemin non plus -> retour travail
                                 agent.currentState = AgentState.AT_WORK; agent.isVisible = false;
                             }
                        }
                    } else { // Départ Piéton
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { // Pas de chemin -> retour travail
                            agent.currentState = AgentState.AT_WORK; agent.isVisible = false;
                        }
                         if(agent.vehicleBehavior) agent.vehicleBehavior.isUsingVehicle = false;
                    }
                     // --- CORRECTION : Comparer à l'état CAPTURÉ AU DÉBUT ---
                    if (departureSuccessful && previousStateForTimer !== agent.currentState) {
                         agent.lastDepartureDayHome = currentDayNumber;
                    }
                    // --------------------------------------------------
                    agent._pathRequestTimeout = null;
                 }
                break;

            // --- CAS DRIVING_* ---
            case AgentState.DRIVING_TO_WORK:
                agent.isVisible = false;
                const carRefWork = agent.vehicleBehavior?.currentVehicle;
                const hasArrivedWorkCar = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                const isCarInactiveWork = carRefWork ? !carRefWork.isActive : true;
                if (hasArrivedWorkCar || isCarInactiveWork) {
                    if (!hasArrivedWorkCar && isCarInactiveWork) console.warn(`Agent ${agent.id}: Voiture devenue inactive avant arrivée travail.`);
                    agent.currentState = AgentState.AT_WORK;
                    agent.lastArrivalTimeWork = currentGameTime;
                    agent.requestedPathForDepartureTime = -1;
                    agent.vehicleBehavior?.exitVehicle();
                    agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                    agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                }
                break;
            case AgentState.DRIVING_HOME:
                agent.isVisible = false;
                const carRefHome = agent.vehicleBehavior?.currentVehicle;
                const hasArrivedHomeCar = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                const isCarInactiveHome = carRefHome ? !carRefHome.isActive : true;
                if (hasArrivedHomeCar || isCarInactiveHome) {
                    if (!hasArrivedHomeCar && isCarInactiveHome) console.warn(`Agent ${agent.id}: Voiture devenue inactive avant arrivée maison.`);
                    agent.currentState = AgentState.AT_HOME;
                    agent.lastArrivalTimeHome = currentGameTime;
                    agent.requestedPathForDepartureTime = -1;
                    agent.vehicleBehavior?.exitVehicle();
                    agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                    agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                }
                break;

            // --- CAS IN_TRANSIT_* (Piéton) ---
            case AgentState.IN_TRANSIT_TO_WORK:
                agent.isVisible = true;
                const arrivedWorkPed = agent.hasReachedDestination || (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                if (arrivedWorkPed) {
                    agent.currentState = AgentState.AT_WORK; agent.lastArrivalTimeWork = currentGameTime;
                    agent.requestedPathForDepartureTime = -1; agent.isVisible = false;
                    agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                    agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                }
                break;
            case AgentState.IN_TRANSIT_TO_HOME:
                agent.isVisible = true;
                const arrivedHomePed = agent.hasReachedDestination || (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                if (arrivedHomePed) {
                    agent.currentState = AgentState.AT_HOME; agent.lastArrivalTimeHome = currentGameTime;
                    agent.requestedPathForDepartureTime = -1; agent.isVisible = false;
                    agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                    agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                }
                break;

            // --- États d'attente et Weekend (passifs ici ou gérés avant) ---
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.WAITING_FOR_PATH:
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WEEKEND_WALK_READY:
            case AgentState.WEEKEND_WALKING:
            case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                // Pas de logique active ici, géré par setPath ou weekendBehavior
                break;

            // --- CAS IDLE et DEFAULT ---
            case AgentState.IDLE:
            default:
                agent.isVisible = false;
                // Tenter d'initialiser si pas encore fait
                if (!agent.homeBuildingId && this.experience.world?.cityManager) {
                    const cityManager = this.experience.world.cityManager;
                    const citizenInfo = cityManager.registerCitizen(agent.id, agent); // Assurer enregistrement
                    const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);
                    const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);
                    if (homeAssigned) {
                        agent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId);
                    }
                }
                break;
        } // Fin Switch

        // --- Gestion finale du _stateStartTime ---
        // Comparer l'état actuel à l'état capturé au début de l'update
        const newState = agent.currentState;
        const justEnteredTransitOrRequestState =
            (newState.startsWith('IN_TRANSIT_') || newState.startsWith('DRIVING_') ||
             newState.startsWith('REQUESTING_') || newState.startsWith('WEEKEND_WALK_') || // Inclut tous les états weekend actifs/requête
             newState === AgentState.WAITING_FOR_PATH) &&
            newState !== previousStateForTimer; // <<< Utiliser l'état capturé au début

        const justEnteredStableState =
            (newState === AgentState.AT_HOME || newState === AgentState.AT_WORK || newState === AgentState.IDLE) &&
            newState !== previousStateForTimer; // <<< Utiliser l'état capturé au début

        if (justEnteredTransitOrRequestState) {
            agent._stateStartTime = currentGameTime;
        } else if (justEnteredStableState) {
            agent._stateStartTime = null;
        }
    }
}