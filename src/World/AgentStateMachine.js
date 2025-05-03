// src/World/AgentStateMachine.js
import AgentState from './AgentState.js';
// Pas besoin d'importer AgentWeekendBehavior ici, car on y accède via l'instance agent

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

        // --- Informations Environnement / Calendrier ---
        const environment = this.experience.world?.environment;
        const calendarDate = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;
        const dayDurationMs = environment?.dayDurationMs;

        // --- Vérification initiale essentielle ---
        if (!dayDurationMs || dayDurationMs <= 0 || !calendarDate) {
            if (agent.currentState !== AgentState.IDLE) {
                agent.currentState = AgentState.IDLE;
                agent.isVisible = false;
            }
            return;
        }

        // --- Temps dans le cycle et Numéro du Jour ---
        const timeWithinCurrentDayCycle = currentGameTime % dayDurationMs;
        const currentDayNumber = calendarDate.annee * 10000 + (calendarDate.mois) * 100 + calendarDate.jour;

        const carManager = this.experience.world?.carManager;

        // --- VÉRIFICATION SÉCURITÉ ÉTAT BLOQUÉ (inchangée) ---
        const MAX_TRANSIT_DURATION_FACTOR = 2.0;
        const maxTransitTime = dayDurationMs * MAX_TRANSIT_DURATION_FACTOR;
        const isStuckCheckState = /* ... mêmes états ... */
            agent.currentState === AgentState.IN_TRANSIT_TO_WORK || agent.currentState === AgentState.DRIVING_TO_WORK ||
            agent.currentState === AgentState.IN_TRANSIT_TO_HOME || agent.currentState === AgentState.DRIVING_HOME ||
            agent.currentState === AgentState.REQUESTING_PATH_FOR_WORK || agent.currentState === AgentState.REQUESTING_PATH_FOR_HOME ||
            agent.currentState === AgentState.WEEKEND_WALK_REQUESTING_PATH || agent.currentState === AgentState.WEEKEND_WALKING ||
            agent.currentState === AgentState.WAITING_FOR_PATH || agent.currentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK;

        if (isStuckCheckState && agent._stateStartTime && currentGameTime - agent._stateStartTime > maxTransitTime) {
            console.warn(`[AGENT ${agent.id} SAFETY] Bloqué en état ${agent.currentState} pendant > ${MAX_TRANSIT_DURATION_FACTOR} jours. Forçage récupération.`);
            agent.forceRecoverFromTimeout(currentGameTime);
            return;
        }

        // --- Vérification Timeout Path Request (inchangée) ---
        const PATH_REQUEST_TIMEOUT_MS = 100000;
        if (agent._pathRequestTimeout && (agent.currentState.startsWith('REQUESTING_') || agent.currentState === AgentState.WAITING_FOR_PATH) && (currentGameTime - agent._pathRequestTimeout > PATH_REQUEST_TIMEOUT_MS)) {
            console.warn(`Agent ${agent.id}: Path request timed out in state ${agent.currentState}. Forcing recovery.`);
            agent.forceRecoverFromTimeout(currentGameTime);
            return;
        }

        // --- Heures Planifiées (inchangé) ---
        const departWorkTime = agent.exactWorkDepartureTimeGame;
        const departHomeTime = agent.exactHomeDepartureTimeGame;
        if (departWorkTime < 0 || departHomeTime < 0 ) {
             if (agent.currentState !== AgentState.IDLE) {
                agent.currentState = AgentState.IDLE;
                agent.isVisible = false;
             }
            return;
        }

        // --- *** MODIFICATION : Délégation Weekend *** ---
        const isWeekendNow = ["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine);
        const isWeekendState = agent.currentState.startsWith('WEEKEND_'); // Vérifie si l'état actuel est lié au weekend

        // Si c'est le weekend OU si l'agent est déjà dans un état lié au weekend,
        // on laisse AgentWeekendBehavior gérer la logique.
        if ((isWeekendNow && agent.currentState === AgentState.AT_HOME) || isWeekendState) {
            if (agent.weekendBehavior) {
                agent.weekendBehavior.update(calendarDate, currentHour, currentGameTime);
                // Après l'appel à weekendBehavior.update, l'état de l'agent a peut-être changé.
                // Si l'agent est maintenant dans un état non-weekend (ex: AT_HOME après retour),
                // la machine d'état principale reprendra au prochain tick.
                // Si l'état est toujours un état weekend, weekendBehavior sera rappelé.
                // Si l'état est devenu REQUESTING_PATH_FOR_HOME, la logique ci-dessous ne fera rien ce tick.
                if (agent.currentState.startsWith('WEEKEND_') || agent.currentState.startsWith('REQUESTING_')) {
                   return; // La logique weekend/requête a pris le contrôle pour ce tick.
                }
            } else {
                console.warn(`Agent ${agent.id}: Comportement Weekend demandé mais weekendBehavior non défini.`);
            }
        }
        // --- *** FIN MODIFICATION Weekend *** ---


        // --- Machine d'état (Logique travail/maison semaine uniquement) ---
        const previousStateForTimer = agent.currentState; // Récupérer état potentiellement modifié par weekend

        switch (agent.currentState) {
            // --- CAS AT_HOME (Semaine) ---
            case AgentState.AT_HOME:
                agent.isVisible = false;
                const shouldWorkToday = agent.workScheduleStrategy ? agent.workScheduleStrategy.shouldWorkToday(calendarDate) : false;

                // --- Vérifier Départ Travail (Logique inchangée) ---
                const workCheckCondition = (
                    agent.workPosition && shouldWorkToday &&
                    currentDayNumber > agent.lastDepartureDayWork &&
                    timeWithinCurrentDayCycle >= agent.prepareWorkDepartureTimeGame &&
                    currentHour < agent.departureHomeHour &&
                    agent.requestedPathForDepartureTime !== currentGameTime
                );

                if (workCheckCondition) {
                    agent.requestedPathForDepartureTime = currentGameTime;
                    agent.isInVehicle = agent.hasVehicle;
                    if (agent.isInVehicle && carManager) { /* ... logique voiture ... */
                        if (!carManager.hasCarForAgent(agent.id)) {
                            const startCarPos = agent.vehicleHomePosition || agent.homePosition.clone().setY(0.25);
                            const car = carManager.createCarForAgent(agent, startCarPos, agent.workPosition);
                            if (!car) { agent.isInVehicle = false; }
                        }
                    }
                     if (agent.homePosition && agent.workPosition) {
                           agent._currentPathRequestGoal = 'WORK';
                           agent.requestPath(agent.homePosition, agent.workPosition, null, null, AgentState.READY_TO_LEAVE_FOR_WORK, currentGameTime);
                     } else { agent.requestedPathForDepartureTime = -1; }
                }
                // Pas besoin de vérifier shouldStartWeekendWalk ici, c'est géré au-dessus.
                break;

            // --- CAS AT_WORK (Semaine) ---
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
                     agent.isInVehicle = agent.hasVehicle;
                     if (agent.isInVehicle && carManager) { /* ... logique voiture ... */
                         const startCarPos = agent.workPosition.clone().setY(0.25);
                         const targetCarPos = agent.vehicleHomePosition || agent.homePosition.clone().setY(0.25);
                         const car = carManager.createCarForAgent(agent, startCarPos, targetCarPos);
                         if (!car) { agent.isInVehicle = false; }
                     }
                     if (agent.workPosition && agent.homePosition) {
                          agent._currentPathRequestGoal = 'HOME';
                          agent.requestPath(agent.workPosition, agent.homePosition, null, null, AgentState.READY_TO_LEAVE_FOR_HOME, currentGameTime);
                     } else { agent.requestedPathForDepartureTime = -1; }
                 }
                 break;

            // --- CAS READY_TO_LEAVE_* (inchangés) ---
            case AgentState.READY_TO_LEAVE_FOR_WORK:
                 if (timeWithinCurrentDayCycle >= agent.exactWorkDepartureTimeGame) {
                    const previousState = agent.currentState;
                    let departureSuccessful = false;
                     if (agent.isInVehicle) { /* ... logique départ voiture travail ... */
                        const car = carManager?.getCarForAgent(agent.id);
                        if (car && agent.currentPathPoints) {
                            agent.currentVehicle = car; agent.enterVehicle(); car.setPath(agent.currentPathPoints);
                            agent.currentState = AgentState.DRIVING_TO_WORK; agent.isVisible = false;
                            agent.departureTimeGame = currentGameTime;
                            const carSpeed = car.speed;
                            if (carSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / carSpeed) * 1000; }
                            else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                        } else {
                            if (agent.currentPathPoints) {
                                agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000; }
                                else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                            } else { agent.currentState = AgentState.AT_HOME; agent.isVisible = false; }
                            agent.isInVehicle = false; agent.currentVehicle = null; agent.exitVehicle();
                        }
                     } else { /* ... logique départ piéton travail ... */
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000; }
                            else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                        } else { agent.currentState = AgentState.AT_HOME; agent.isVisible = false; }
                        agent.isInVehicle = false; agent.currentVehicle = null;
                     }
                     if (departureSuccessful && previousState !== agent.currentState) { agent.lastDepartureDayWork = currentDayNumber; }
                     agent._pathRequestTimeout = null;
                 }
                break;
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                 if (timeWithinCurrentDayCycle >= agent.exactHomeDepartureTimeGame) {
                     const previousState = agent.currentState;
                     let departureSuccessful = false;
                     if (agent.isInVehicle) { /* ... logique départ voiture maison ... */
                        const car = carManager?.getCarForAgent(agent.id);
                        if (car && agent.currentPathPoints) {
                            agent.currentVehicle = car; agent.enterVehicle(); car.setPath(agent.currentPathPoints);
                            agent.currentState = AgentState.DRIVING_HOME; agent.isVisible = false;
                            agent.departureTimeGame = currentGameTime;
                            const carSpeed = car.speed;
                            if (carSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / carSpeed) * 1000; }
                            else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                        } else {
                            if (agent.currentPathPoints) {
                                agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000; }
                                else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                            } else { agent.currentState = AgentState.AT_WORK; agent.isVisible = false; }
                            agent.isInVehicle = false; agent.currentVehicle = null; agent.exitVehicle();
                        }
                     } else { /* ... logique départ piéton maison ... */
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000; }
                            else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                        } else { agent.currentState = AgentState.AT_WORK; agent.isVisible = false; }
                        agent.isInVehicle = false; agent.currentVehicle = null;
                     }
                     if (departureSuccessful && previousState !== agent.currentState) { agent.lastDepartureDayHome = currentDayNumber; }
                     agent._pathRequestTimeout = null;
                 }
                break;

            // --- CAS IN_TRANSIT_* et DRIVING_* (inchangés) ---
            case AgentState.DRIVING_TO_WORK:
                 agent.isVisible = false;
                 const hasAgentArrivedAtWork = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                 const carRefAtWork = agent.currentVehicle;
                 const isCarInactiveAtWork = carRefAtWork ? !carRefAtWork.isActive : true;
                 if (hasAgentArrivedAtWork || isCarInactiveAtWork) {
                     agent.currentState = AgentState.AT_WORK; agent.lastArrivalTimeWork = currentGameTime;
                     agent.requestedPathForDepartureTime = -1; agent.exitVehicle();
                     if (carManager && carRefAtWork) { carManager.releaseCarForAgent(agent.id); }
                     agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                     agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                 }
                break;
            case AgentState.DRIVING_HOME:
                 agent.isVisible = false;
                 const hasAgentArrivedHome = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                 const carRefAtHome = agent.currentVehicle;
                 const isCarInactiveAtHome = carRefAtHome ? !carRefAtHome.isActive : true;
                 if (hasAgentArrivedHome || isCarInactiveAtHome) {
                     agent.currentState = AgentState.AT_HOME; agent.lastArrivalTimeHome = currentGameTime;
                     agent.requestedPathForDepartureTime = -1; agent.exitVehicle();
                     if (carManager && carRefAtHome) { carManager.releaseCarForAgent(agent.id); }
                     agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                     agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                 }
                break;
            case AgentState.IN_TRANSIT_TO_WORK:
                 agent.isVisible = true;
                 const arrivedToWorkPed = agent.hasReachedDestination || (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                 if (arrivedToWorkPed) {
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

            // --- CAS ÉTATS D'ATTENTE (inchangés, gérés passivement ou par timeout) ---
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.WAITING_FOR_PATH:
                // États passifs, attendent setPath ou timeout (géré au début de l'update)
                break;

            // --- CAS ÉTATS WEEKEND (gérés au début de l'update par weekendBehavior) ---
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WEEKEND_WALK_READY:
            case AgentState.WEEKEND_WALKING:
            case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                // Logique déléguée à AgentWeekendBehavior
                break;

            // --- CAS IDLE et DEFAULT (inchangés) ---
            case AgentState.IDLE:
            default:
                agent.isVisible = false;
                if (!agent.homeBuildingId && this.experience.world?.cityManager) {
                    const cityManager = this.experience.world.cityManager;
                     const homeAssigned = cityManager.assignHomeToCitizen(agent.id);
                     const workAssigned = cityManager.assignWorkplaceToCitizen(agent.id);
                     if (homeAssigned) {
                         agent.initializeLifecycle(agent.homeBuildingId, agent.workBuildingId);
                     }
                 }
                break;
        } // Fin Switch

        // --- Gestion du _stateStartTime (inchangée) ---
        const newState = agent.currentState;
        const justEnteredTransitOrRequestState =
            (newState === AgentState.IN_TRANSIT_TO_WORK || newState === AgentState.DRIVING_TO_WORK ||
             newState === AgentState.IN_TRANSIT_TO_HOME || newState === AgentState.DRIVING_HOME ||
             newState === AgentState.REQUESTING_PATH_FOR_WORK || newState === AgentState.REQUESTING_PATH_FOR_HOME ||
             newState === AgentState.WEEKEND_WALK_REQUESTING_PATH || newState === AgentState.WEEKEND_WALKING ||
             newState === AgentState.WAITING_FOR_PATH || newState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) &&
            newState !== previousStateForTimer;
        const justEnteredStableState =
            (newState === AgentState.AT_HOME || newState === AgentState.AT_WORK || newState === AgentState.IDLE) &&
            newState !== previousStateForTimer;
        if (justEnteredTransitOrRequestState) { agent._stateStartTime = currentGameTime; }
        else if (justEnteredStableState) { agent._stateStartTime = null; }
    }
}