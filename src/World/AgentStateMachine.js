// src/World/AgentStateMachine.js
import AgentState from './AgentState.js';

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
                // console.warn(`Agent ${agent.id}: Environnement/Calendrier non prêt ou durée jour invalide. Passage IDLE.`);
                agent.currentState = AgentState.IDLE;
                agent.isVisible = false;
            }
            return;
        }

        // --- Temps dans le cycle et Numéro du Jour ---
        const timeWithinCurrentDayCycle = currentGameTime % dayDurationMs;
        const currentDayNumber = calendarDate.annee * 10000 + (calendarDate.mois) * 100 + calendarDate.jour;

        const carManager = this.experience.world?.carManager;

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
            agent.forceRecoverFromTimeout(currentGameTime); // Appel de la méthode sur l'agent
            return; // Sortir de l'update après récupération
        }

        // --- Vérification Timeout Path Request ---
        const PATH_REQUEST_TIMEOUT_MS = 100000; // 100 secondes de jeu
        if (agent._pathRequestTimeout && (agent.currentState.startsWith('REQUESTING_') || agent.currentState === AgentState.WAITING_FOR_PATH) && (currentGameTime - agent._pathRequestTimeout > PATH_REQUEST_TIMEOUT_MS)) {
            console.warn(`Agent ${agent.id}: Path request timed out (${(currentGameTime - agent._pathRequestTimeout).toFixed(0)}ms) in state ${agent.currentState}. Forcing recovery.`);
            agent.forceRecoverFromTimeout(currentGameTime); // Appel de la méthode sur l'agent
            return; // Sortir de l'update après récupération
        }

        // --- Heures Planifiées (vérifier si valides) ---
        const departWorkTime = agent.exactWorkDepartureTimeGame;
        const departHomeTime = agent.exactHomeDepartureTimeGame;
        if (departWorkTime < 0 || departHomeTime < 0 ) {
             if (agent.currentState !== AgentState.IDLE) {
                agent.currentState = AgentState.IDLE;
                agent.isVisible = false;
             }
            return;
        }

        // --- Vérification Promenade Weekend ---
        let shouldStartWeekendWalk = false;
        const isWeekendNow = ["Samedi", "Dimanche"].includes(calendarDate.jourSemaine);
        if (isWeekendNow && agent.weekendWalkStrategy && agent.currentState === AgentState.AT_HOME) {
            agent.weekendWalkStrategy.registerAgent(agent.id, calendarDate);
            shouldStartWeekendWalk = agent.weekendWalkStrategy.shouldWalkNow(agent.id, calendarDate, currentHour);
        }

        // --- Machine d'état (Logique déplacée ici) ---
        const previousStateForTimer = agent.currentState;

        switch (agent.currentState) {
            case AgentState.AT_HOME:
                agent.isVisible = false;
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
                    agent.isInVehicle = agent.hasVehicle;

                    if (agent.isInVehicle && carManager) {
                        if (!carManager.hasCarForAgent(agent.id)) {
                            const startCarPos = agent.vehicleHomePosition || agent.homePosition.clone().setY(0.25);
                            const car = carManager.createCarForAgent(agent, startCarPos, agent.workPosition);
                            if (!car) {
                                console.warn(`Agent ${agent.id}: Échec création voiture, passage en mode piéton.`);
                                agent.isInVehicle = false;
                            }
                        }
                    }

                     if (agent.homePosition && agent.workPosition) {
                           agent._currentPathRequestGoal = 'WORK';
                           // NOTE: Le changement d'état vers REQUESTING_* se fait dans requestPath
                           // this.currentState = AgentState.REQUESTING_PATH_FOR_WORK; // Déplacé
                           // agent._pathRequestTimeout = currentGameTime; // Défini dans requestPath
                           agent.requestPath(agent.homePosition, agent.workPosition, null, null, AgentState.READY_TO_LEAVE_FOR_WORK, currentGameTime);
                     } else {
                          console.error(`Agent ${agent.id}: Positions domicile/travail invalides pour requête départ.`);
                          agent.requestedPathForDepartureTime = -1;
                     }
                }
                else if (shouldStartWeekendWalk) {
                    const walkDestinationFound = agent._findRandomWalkDestination(currentGameTime); // Appel méthode agent
                    if (!walkDestinationFound) {
                        // console.warn(`Agent ${agent.id}: Impossible de trouver une destination de promenade.`);
                    }
                }
                break;

            case AgentState.READY_TO_LEAVE_FOR_WORK:
                if (timeWithinCurrentDayCycle >= agent.exactWorkDepartureTimeGame) {
                    const previousState = agent.currentState;
                    let departureSuccessful = false;

                    if (agent.isInVehicle) {
                        const car = carManager?.getCarForAgent(agent.id);
                        if (car && agent.currentPathPoints) {
                                agent.currentVehicle = car;
                                agent.enterVehicle();
                                car.setPath(agent.currentPathPoints);
                                agent.currentState = AgentState.DRIVING_TO_WORK;
                                agent.isVisible = false;
                                agent.departureTimeGame = currentGameTime;

                                const carSpeed = car.speed;
                                if (carSpeed > 0 && agent.currentPathLengthWorld > 0) {
                                    agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / carSpeed) * 1000;
                                } else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                        } else {
                                if (agent.currentPathPoints) {
                                    agent.currentState = AgentState.IN_TRANSIT_TO_WORK;
                                    agent.isVisible = true;
                                    agent.departureTimeGame = currentGameTime;
                                    if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                                        agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                                    } else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                    agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                    departureSuccessful = true;
                                } else {
                                    console.error(`Agent ${agent.id}: Voiture ET chemin manquants. Retour AT_HOME.`);
                                    agent.currentState = AgentState.AT_HOME;
                                    agent.isVisible = false;
                                }
                                agent.isInVehicle = false; agent.currentVehicle = null; agent.exitVehicle();
                        }
                    } else { // Départ Piéton
                            if (agent.currentPathPoints) {
                                agent.currentState = AgentState.IN_TRANSIT_TO_WORK;
                                agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                                    agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                                } else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            } else {
                                console.error(`Agent ${agent.id}: Mode piéton mais chemin manquant pour départ travail. Retour AT_HOME.`);
                                agent.currentState = AgentState.AT_HOME;
                                agent.isVisible = false;
                            }
                            agent.isInVehicle = false; agent.currentVehicle = null;
                    }
                    if (departureSuccessful && previousState !== agent.currentState) {
                            agent.lastDepartureDayWork = currentDayNumber;
                    }
                    agent._pathRequestTimeout = null;
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
                     agent.isInVehicle = agent.hasVehicle;

                     if (agent.isInVehicle && carManager) {
                         const startCarPos = agent.workPosition.clone().setY(0.25);
                         const targetCarPos = agent.vehicleHomePosition || agent.homePosition.clone().setY(0.25);
                         const car = carManager.createCarForAgent(agent, startCarPos, targetCarPos);
                         if (!car) { agent.isInVehicle = false; }
                     }

                     if (agent.workPosition && agent.homePosition) {
                          agent._currentPathRequestGoal = 'HOME';
                          // this.currentState = AgentState.REQUESTING_PATH_FOR_HOME; // Déplacé
                          // agent._pathRequestTimeout = currentGameTime; // Défini dans requestPath
                          agent.requestPath(agent.workPosition, agent.homePosition, null, null, AgentState.READY_TO_LEAVE_FOR_HOME, currentGameTime);
                     } else {
                          console.error(`Agent ${agent.id}: Positions travail/domicile invalides pour requête retour.`);
                          agent.requestedPathForDepartureTime = -1;
                     }
                 }
                 break;

            case AgentState.READY_TO_LEAVE_FOR_HOME:
                if (timeWithinCurrentDayCycle >= agent.exactHomeDepartureTimeGame) {
                    const previousState = agent.currentState;
                    let departureSuccessful = false;

                    if (agent.isInVehicle) {
                        const car = carManager?.getCarForAgent(agent.id);
                        if (car && agent.currentPathPoints) {
                                agent.currentVehicle = car;
                                agent.enterVehicle();
                                car.setPath(agent.currentPathPoints);
                                agent.currentState = AgentState.DRIVING_HOME;
                                agent.isVisible = false;
                                agent.departureTimeGame = currentGameTime;
                                const carSpeed = car.speed;
                                if (carSpeed > 0 && agent.currentPathLengthWorld > 0) {
                                    agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / carSpeed) * 1000;
                                } else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                        } else {
                                if (agent.currentPathPoints) {
                                    agent.currentState = AgentState.IN_TRANSIT_TO_HOME;
                                    agent.isVisible = true;
                                    agent.departureTimeGame = currentGameTime;
                                    if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                                        agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                                    } else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                    agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                    departureSuccessful = true;
                                } else {
                                    console.error(`Agent ${agent.id}: Chemin manquant pour retour maison (Voiture Fallback). Retour AT_WORK.`);
                                    agent.currentState = AgentState.AT_WORK;
                                    agent.isVisible = false;
                                }
                                agent.isInVehicle = false; agent.currentVehicle = null; agent.exitVehicle();
                        }
                    } else { // Départ Piéton
                            if (agent.currentPathPoints) {
                                agent.currentState = AgentState.IN_TRANSIT_TO_HOME;
                                agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                                    agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                                } else { agent.calculatedTravelDurationGame = 10 * 60 * 1000; }
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            } else {
                                console.error(`Agent ${agent.id}: Mode piéton mais chemin manquant pour retour maison. Retour AT_WORK.`);
                                agent.currentState = AgentState.AT_WORK;
                                agent.isVisible = false;
                            }
                            agent.isInVehicle = false; agent.currentVehicle = null;
                    }
                    if (departureSuccessful && previousState !== agent.currentState) {
                        agent.lastDepartureDayHome = currentDayNumber;
                    }
                    agent._pathRequestTimeout = null;
                }
                break;

            case AgentState.DRIVING_TO_WORK:
                agent.isVisible = false;
                const hasAgentArrivedAtWork = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame);
                const carRefAtWork = agent.currentVehicle;
                const isCarInactiveAtWork = carRefAtWork ? !carRefAtWork.isActive : true;

                if (hasAgentArrivedAtWork || isCarInactiveAtWork) {
                    if (!hasAgentArrivedAtWork && isCarInactiveAtWork) { /* console.warn(...) */ }
                    agent.currentState = AgentState.AT_WORK;
                    agent.lastArrivalTimeWork = currentGameTime;
                    agent.requestedPathForDepartureTime = -1;
                    agent.exitVehicle();
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
                     if (!hasAgentArrivedHome && isCarInactiveAtHome) { /* console.warn(...) */ }
                     agent.currentState = AgentState.AT_HOME;
                     agent.lastArrivalTimeHome = currentGameTime;
                     agent.requestedPathForDepartureTime = -1;
                     agent.exitVehicle();
                     if (carManager && carRefAtHome) { carManager.releaseCarForAgent(agent.id); }
                     agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                     agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                 }
                break;

            case AgentState.IN_TRANSIT_TO_WORK:
                 agent.isVisible = true;
                 const arrivedToWorkPed = agent.hasReachedDestination ||
                                      (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) ||
                                      (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                 if (arrivedToWorkPed) {
                      agent.currentState = AgentState.AT_WORK;
                      agent.lastArrivalTimeWork = currentGameTime;
                      agent.requestedPathForDepartureTime = -1;
                      agent.isVisible = false;
                      agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                      agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                  }
                break;

            case AgentState.IN_TRANSIT_TO_HOME:
                 agent.isVisible = true;
                 const arrivedHomePed = agent.hasReachedDestination ||
                                    (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) ||
                                    (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                 if (arrivedHomePed) {
                      agent.currentState = AgentState.AT_HOME;
                      agent.lastArrivalTimeHome = currentGameTime;
                      agent.requestedPathForDepartureTime = -1;
                      agent.isVisible = false;
                      agent.currentPathPoints = null; agent.currentPathLengthWorld = 0;
                      agent.hasReachedDestination = false; agent.arrivalTmeGame = -1;
                  }
                break;

            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WAITING_FOR_PATH:
                // État passif, attend setPath ou timeout
                break;

             case AgentState.WEEKEND_WALK_READY:
                 if (agent.currentPathPoints) {
                    agent.currentState = AgentState.WEEKEND_WALKING;
                    agent.isVisible = true;
                    agent.departureTimeGame = currentGameTime;
                    if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                        agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                    } else { agent.calculatedTravelDurationGame = 15 * 60 * 1000; }
                    agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                    const msPerHour = dayDurationMs / 24;
                    let walkDurationMs = msPerHour;
                    if (agent.weekendWalkStrategy && calendarDate) {
                         const dayKey = agent.weekendWalkStrategy._getDayKey(calendarDate);
                         const walkInfo = agent.weekendWalkStrategy.agentWalkMap?.get(dayKey)?.get(agent.id);
                         if (walkInfo && msPerHour > 0) { walkDurationMs = walkInfo.duration * msPerHour; }
                    }
                    agent.weekendWalkEndTime = currentGameTime + walkDurationMs;
                    agent._pathRequestTimeout = null;
                 } else {
                    agent.currentState = AgentState.AT_HOME; agent.weekendWalkEndTime = -1; agent._pathRequestTimeout = null;
                    agent.weekendWalkDestination = null; agent.weekendWalkGridNode = null;
                 }
                break;

             case AgentState.WEEKEND_WALKING:
                 agent.isVisible = true;
                 const destinationReachedWk = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || agent.hasReachedDestination;
                 const walkTimeOver = agent.weekendWalkEndTime > 0 && currentGameTime >= agent.weekendWalkEndTime;
                 if (destinationReachedWk || walkTimeOver) {
                     agent.weekendWalkDestination = null; agent.weekendWalkGridNode = null; agent.weekendWalkEndTime = -1;
                     agent.hasReachedDestination = false;
                     if (agent.homePosition && agent.homeGridNode) {
                          agent._currentPathRequestGoal = 'HOME';
                          // agent.currentState = AgentState.REQUESTING_PATH_FOR_HOME; // Déplacé
                          // agent._pathRequestTimeout = currentGameTime; // Défini dans requestPath
                          const navigationManager = this.experience.world?.cityManager?.navigationManager;
                          const currentNavGraph = navigationManager?.getNavigationGraph(false);
                          const currentGridNode = currentNavGraph?.getClosestWalkableNode(agent.position);
                          agent.requestPath( agent.position, agent.homePosition, currentGridNode, agent.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, currentGameTime );
                      } else {
                          console.error(`Agent ${agent.id}: Impossible rentrer (infos domicile manquantes). Forçage récupération.`);
                          agent.forceRecoverFromTimeout(currentGameTime);
                      }
                 }
                 break;

             case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                 // État passif, attend setPath ou timeout
                 break;

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

        // --- Gestion du _stateStartTime ---
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
        // agent._previousStateForStartTime = newState; // Plus besoin de stocker l'état précédent ici
    }
}