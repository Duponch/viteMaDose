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
        const isWeekendState = agent.currentState.startsWith('WEEKEND_');

        // Si c'est le weekend ET que l'agent est à la maison, OU si l'agent est déjà dans un état weekend
        if ((isWeekendNow && agent.currentState === AgentState.AT_HOME) || isWeekendState) {
            if (agent.weekendBehavior) {
                agent.weekendBehavior.update(calendarDate, currentHour, currentGameTime);
                // Si weekendBehavior a changé l'état vers un état NON-weekend ou un état de REQUETE,
                // on arrête ici pour ce tick. La machine principale reprendra au prochain tick.
                if (!agent.currentState.startsWith('WEEKEND_') || agent.currentState.startsWith('REQUESTING_')) {
                   // Mettre à jour _stateStartTime si on vient d'entrer dans un état de requête (initié par weekendBehavior)
                   if(agent.currentState.startsWith('REQUESTING_') && previousStateForTimer !== agent.currentState) {
                       agent._stateStartTime = currentGameTime;
                   }
                   return;
                }
            } else {
                console.warn(`Agent ${agent.id}: Comportement Weekend demandé mais weekendBehavior non défini.`);
            }
        }
        // --- *** FIN MODIFICATION Weekend *** ---


        // --- Machine d'état (Logique travail/maison semaine uniquement) ---
        // Récupérer l'état après l'éventuelle mise à jour par weekendBehavior
        const currentState = agent.currentState;
        const previousStateForTimer = agent.currentState; // Utiliser l'état ACTUEL pour comparaison future

        switch (currentState) { // Utiliser la variable locale 'currentState'
            // --- CAS AT_HOME (Semaine) ---
            case AgentState.AT_HOME:
                agent.isVisible = false;
                // Si ce n'est pas le weekend (déjà géré au-dessus), vérifier départ travail
                if (!isWeekendNow) {
                    const shouldWorkToday = agent.workScheduleStrategy ? agent.workScheduleStrategy.shouldWorkToday(calendarDate) : false;
                    const workCheckCondition = (
                        agent.workPosition && shouldWorkToday &&
                        currentDayNumber > agent.lastDepartureDayWork &&
                        timeWithinCurrentDayCycle >= agent.prepareWorkDepartureTimeGame &&
                        currentHour < agent.departureHomeHour &&
                        agent.requestedPathForDepartureTime !== currentGameTime
                    );

                    if (workCheckCondition) {
                        agent.requestedPathForDepartureTime = currentGameTime;
                        // --- Utilisation de vehicleBehavior ---
                        const shouldUseCar = agent.vehicleBehavior?.shouldUseVehicle() ?? false;
                        if (shouldUseCar) {
                             // Tenter de demander une voiture
                             const carRequested = agent.vehicleBehavior.requestCar(
                                 agent.vehicleBehavior.vehicleHomePosition || agent.homePosition.clone().setY(0.25), // Pos départ voiture
                                 agent.workPosition // Cible finale
                             );
                             if (!carRequested) {
                                 console.warn(`Agent ${agent.id}: Échec requête voiture (Fallback piéton).`);
                                 // Pas besoin de changer agent.isInVehicle ici, requestCar le fait
                             }
                        }
                        // ---------------------------------------
                         if (agent.homePosition && agent.workPosition) {
                               agent._currentPathRequestGoal = 'WORK';
                               // La demande de chemin se fait maintenant dans requestPath,
                               // qui prend en compte agent.vehicleBehavior.isDriving()
                               agent.requestPath(
                                   agent.homePosition, // Départ logique de l'agent
                                   agent.workPosition, // Arrivée logique de l'agent
                                   null, null, // Nœuds de grille (calculés dans requestPath)
                                   AgentState.READY_TO_LEAVE_FOR_WORK, // Prochain état si succès
                                   currentGameTime
                               );
                         } else { agent.requestedPathForDepartureTime = -1; }
                    }
                }
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
                     // --- Utilisation de vehicleBehavior ---
                     const shouldUseCar = agent.vehicleBehavior?.shouldUseVehicle() ?? false;
                     if (shouldUseCar) {
                         const carRequested = agent.vehicleBehavior.requestCar(
                             agent.workPosition.clone().setY(0.25), // Pos départ voiture (au travail)
                             agent.vehicleBehavior.vehicleHomePosition || agent.homePosition.clone().setY(0.25) // Cible voiture (garage)
                         );
                         if (!carRequested) {
                              console.warn(`Agent ${agent.id}: Échec requête voiture pour retour (Fallback piéton).`);
                         }
                     }
                     // ---------------------------------------
                     if (agent.workPosition && agent.homePosition) {
                          agent._currentPathRequestGoal = 'HOME';
                          agent.requestPath(
                              agent.workPosition, agent.homePosition,
                              null, null,
                              AgentState.READY_TO_LEAVE_FOR_HOME,
                              currentGameTime
                          );
                     } else { agent.requestedPathForDepartureTime = -1; }
                 }
                 break;

            // --- CAS READY_TO_LEAVE_* ---
            case AgentState.READY_TO_LEAVE_FOR_WORK:
                 if (timeWithinCurrentDayCycle >= agent.exactWorkDepartureTimeGame) {
                    const previousState = agent.currentState;
                    let departureSuccessful = false;
                    // --- Utilisation de vehicleBehavior ---
                    const isDriving = agent.vehicleBehavior?.isDriving() ?? false;
                    // ---------------------------------------
                    if (isDriving) {
                        const car = agent.vehicleBehavior.currentVehicle; // Obtenir la voiture via behavior
                        if (car && agent.currentPathPoints) {
                                // agent.enterVehicle(); // Géré par vehicleBehavior.requestCar
                                car.setPath(agent.currentPathPoints);
                                agent.currentState = AgentState.DRIVING_TO_WORK;
                                agent.isVisible = false;
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
                                agent.vehicleBehavior?.exitVehicle(); // Utiliser vehicleBehavior
                        }
                    } else { // Départ Piéton
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000; }
                            else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                        } else { agent.currentState = AgentState.AT_HOME; agent.isVisible = false; }
                        // Assurer que l'agent n'est pas marqué comme conduisant
                        if(agent.vehicleBehavior) agent.vehicleBehavior.isUsingVehicle = false;
                    }
                    if (departureSuccessful && previousState !== agent.currentState) { agent.lastDepartureDayWork = currentDayNumber; }
                    agent._pathRequestTimeout = null;
                 }
                break;
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                 if (timeWithinCurrentDayCycle >= agent.exactHomeDepartureTimeGame) {
                     const previousState = agent.currentState;
                     let departureSuccessful = false;
                     // --- Utilisation de vehicleBehavior ---
                     const isDriving = agent.vehicleBehavior?.isDriving() ?? false;
                     // ---------------------------------------
                     if (isDriving) {
                        const car = agent.vehicleBehavior.currentVehicle;
                        if (car && agent.currentPathPoints) {
                            // agent.enterVehicle(); // Géré par vehicleBehavior.requestCar
                            car.setPath(agent.currentPathPoints);
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
                            agent.vehicleBehavior?.exitVehicle(); // Utiliser vehicleBehavior
                        }
                     } else { // Départ Piéton
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) { agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000; }
                            else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame; departureSuccessful = true;
                        } else { agent.currentState = AgentState.AT_WORK; agent.isVisible = false; }
                         // Assurer que l'agent n'est pas marqué comme conduisant
                         if(agent.vehicleBehavior) agent.vehicleBehavior.isUsingVehicle = false;
                     }
                     if (departureSuccessful && previousState !== agent.currentState) { agent.lastDepartureDayHome = currentDayNumber; }
                     agent._pathRequestTimeout = null;
                 }
                break;

            // --- CAS DRIVING_* ---
            case AgentState.DRIVING_TO_WORK:
                 agent.isVisible = false; // L'agent logique est caché
                 const carRefWork = agent.vehicleBehavior?.currentVehicle;
                 const hasArrivedWorkCar = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                 const isCarInactiveWork = carRefWork ? !carRefWork.isActive : true; // Considérer inactive si pas de réf

                 if (hasArrivedWorkCar || isCarInactiveWork) {
                     if (!hasArrivedWorkCar && isCarInactiveWork) { /* console.warn(...) */ }
                     agent.currentState = AgentState.AT_WORK;
                     agent.lastArrivalTimeWork = currentGameTime;
                     agent.requestedPathForDepartureTime = -1;
                     agent.vehicleBehavior?.exitVehicle(); // Utiliser vehicleBehavior pour sortir et libérer
                     agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                     agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                 }
                break;
            case AgentState.DRIVING_HOME:
                 agent.isVisible = false; // L'agent logique est caché
                 const carRefHome = agent.vehicleBehavior?.currentVehicle;
                 const hasArrivedHomeCar = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                 const isCarInactiveHome = carRefHome ? !carRefHome.isActive : true;

                 if (hasArrivedHomeCar || isCarInactiveHome) {
                     if (!hasArrivedHomeCar && isCarInactiveHome) { /* console.warn(...) */ }
                     agent.currentState = AgentState.AT_HOME;
                     agent.lastArrivalTimeHome = currentGameTime;
                     agent.requestedPathForDepartureTime = -1;
                     agent.vehicleBehavior?.exitVehicle(); // Utiliser vehicleBehavior pour sortir et libérer
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

            // --- CAS ÉTATS D'ATTENTE (inchangés) ---
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.WAITING_FOR_PATH:
                // Passif
                break;

            // --- CAS ÉTATS WEEKEND (gérés au début) ---
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WEEKEND_WALK_READY:
            case AgentState.WEEKEND_WALKING:
            case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                // Logique maintenant dans AgentWeekendBehavior
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
        // ... [logique identique pour mettre à jour _stateStartTime] ...
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