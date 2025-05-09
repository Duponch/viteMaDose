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
            agent.currentState === AgentState.WAITING_FOR_PATH || agent.currentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK ||
            // Ajouter les nouveaux états à vérifier
            agent.currentState === AgentState.IN_TRANSIT_TO_COMMERCIAL || agent.currentState === AgentState.REQUESTING_PATH_FOR_COMMERCIAL;

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

        // --- NOUVEAU: Délégation Comportement Médicament ---
        // Ce comportement est appelé AVANT d'autres comportements pour permettre l'achat
        // de médicaments en priorité s'il y a besoin
        if (agent.currentState === AgentState.AT_HOME || agent.currentState === AgentState.AT_COMMERCIAL) {
            if (agent.medicationBehavior) {
                agent.medicationBehavior.update(calendarDate, currentHour, currentGameTime);
                // Si medicationBehavior a changé l'état, nous sortons de cette méthode pour ce cycle
                if (agent.currentState !== previousStateForTimer) {
                    if (agent.currentState.startsWith('REQUESTING_')) {
                        agent._stateStartTime = currentGameTime;
                    }
                    return;
                }
            } else {
                console.warn(`Agent ${agent.id}: Comportement Médicament demandé mais medicationBehavior non défini.`);
            }
        }

        // --- Délégation Weekend ---
        const isWeekendNow = ["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine);
        const isWeekendState = agent.currentState.startsWith('WEEKEND_');

        if ((isWeekendNow && agent.currentState === AgentState.AT_HOME) || isWeekendState) {
            if (agent.weekendBehavior) {
                agent.weekendBehavior.update(calendarDate, currentHour, currentGameTime);
                const stateAfterWeekendUpdate = agent.currentState;
                if (!stateAfterWeekendUpdate.startsWith('WEEKEND_') || stateAfterWeekendUpdate.startsWith('REQUESTING_')) {
                    if (stateAfterWeekendUpdate.startsWith('REQUESTING_') && previousStateForTimer !== stateAfterWeekendUpdate) {
                        agent._stateStartTime = currentGameTime;
                    }
                    return; 
                }
            } else {
                console.warn(`Agent ${agent.id}: Comportement Weekend demandé mais weekendBehavior non défini.`);
            }
        }


        // --- Machine d'état (Logique travail/maison semaine) ---
        const currentState = agent.currentState; // Ré-évaluer au cas où un comportement l'aurait changé

        switch (currentState) {
            case AgentState.AT_HOME:
                agent.isVisible = false;
                // La logique de départ au travail ne doit s'exécuter que si l'agent n'a pas décidé de faire autre chose (ex: acheter des médicaments)
                // et que ce n'est pas le weekend (déjà géré plus haut)
                if (!isWeekendNow && agent.currentState === AgentState.AT_HOME) { // Re-vérifier l'état
                    const shouldWorkToday = agent.workScheduleStrategy?.shouldWorkToday(calendarDate) ?? false;
                    const workCheckCondition = (
                        agent.workPosition && shouldWorkToday &&
                        (currentDayNumber > agent.lastDepartureDayWork || agent.lastDepartureDayWork === -1) &&
                        timeWithinCurrentDayCycle >= agent.prepareWorkDepartureTimeGame &&
                        currentHour < agent.departureHomeHour && 
                        agent.requestedPathForDepartureTime !== currentGameTime 
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
                // Ajout d'une vérification spécifique pour le vendredi
                const isCurrentlyFriday = calendarDate?.jourSemaine === "Vendredi";
                const isFridayDepartureTime = isCurrentlyFriday && currentHour >= agent.departureHomeHour;
                
                // Pour le vendredi soir, on ignore la vérification lastDepartureDayHome pour assurer le retour à la maison
                const homeCheckCondition = (
                    agent.homePosition &&
                    (isFridayDepartureTime || (currentDayNumber > agent.lastDepartureDayHome &&
                    timeWithinCurrentDayCycle >= agent.prepareHomeDepartureTimeGame)) &&
                    agent.requestedPathForDepartureTime !== currentGameTime
                );
                
                if (homeCheckCondition) {
                    console.log(`Agent ${agent.id}: Préparation départ maison. [${calendarDate?.jourSemaine}] [isFridayDepartureTime: ${isFridayDepartureTime}] [Heure: ${currentHour}]`);
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
                            agent.vehicleBehavior.enterVehicle(); 
                            car.setPath(agent.currentPathPoints);
                            agent.currentState = AgentState.DRIVING_TO_WORK;
                            agent.isVisible = false; 
                            agent.departureTimeGame = currentGameTime;
                            const carSpeed = car.speed;
                            agent.calculatedTravelDurationGame = (carSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / carSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { 
                            console.warn(`Agent ${agent.id}: Problème départ voiture (voiture ou chemin manquant). Tentative départ piéton.`);
                            agent.vehicleBehavior.exitVehicle(); 
                            if (agent.currentPathPoints) { 
                                agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            } else { 
                                agent.currentState = AgentState.AT_HOME; agent.isVisible = false;
                            }
                        }
                    } else { 
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_WORK; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { 
                            agent.currentState = AgentState.AT_HOME; agent.isVisible = false;
                        }
                        if(agent.vehicleBehavior) agent.vehicleBehavior.isUsingVehicle = false; 
                    }
                    if (departureSuccessful && previousStateForTimer !== agent.currentState) {
                        agent.lastDepartureDayWork = currentDayNumber;
                    }
                    agent._pathRequestTimeout = null;
                }
                break;

            case AgentState.READY_TO_LEAVE_FOR_HOME:
                 // Permettre le départ immédiat si l'agent vient du bâtiment commercial
                 const isReturningFromCommercial = agent._currentPathRequestGoal === 'HOME' && agent.currentState === AgentState.READY_TO_LEAVE_FOR_HOME;
                 
                 // Si c'est vendredi (dernier jour de travail de la semaine), assurons-nous que l'agent rentre à la maison à l'heure prévue
                 const isFridayForHome = calendarDate?.jourSemaine === "Vendredi";
                 const isFridayEveningForHome = isFridayForHome && currentHour >= agent.departureHomeHour;
                 
                 if (isReturningFromCommercial || isFridayEveningForHome || timeWithinCurrentDayCycle >= agent.exactHomeDepartureTimeGame) {
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
                        } else { 
                             console.warn(`Agent ${agent.id}: Problème départ voiture pour retour (voiture ou chemin manquant). Tentative départ piéton.`);
                             agent.vehicleBehavior.exitVehicle();
                             if (agent.currentPathPoints) { 
                                 agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                                 agent.departureTimeGame = currentGameTime;
                                 agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                 agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                 departureSuccessful = true;
                             } else { 
                                 agent.currentState = AgentState.AT_WORK; agent.isVisible = false;
                             }
                        }
                    } else { 
                        if (agent.currentPathPoints) {
                            agent.currentState = AgentState.IN_TRANSIT_TO_HOME; agent.isVisible = true;
                            agent.departureTimeGame = currentGameTime;
                            agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { 
                            agent.currentState = AgentState.AT_WORK; agent.isVisible = false;
                        }
                         if(agent.vehicleBehavior) agent.vehicleBehavior.isUsingVehicle = false;
                    }
                    if (departureSuccessful && previousStateForTimer !== agent.currentState) {
                         agent.lastDepartureDayHome = currentDayNumber;
                    }
                    agent._pathRequestTimeout = null;
                 }
                break;
            
            case AgentState.READY_TO_LEAVE_FOR_COMMERCIAL:
                let departureCommSuccessful = false;
                if (agent.currentPathPoints) {
                    agent.currentState = AgentState.IN_TRANSIT_TO_COMMERCIAL;
                    agent.isVisible = true;
                    agent.departureTimeGame = currentGameTime;
                    agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                        (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                    agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                    departureCommSuccessful = true;
                    console.log(`Agent ${agent.id}: Départ vers le bâtiment commercial.`);
                } else {
                    agent.currentState = AgentState.AT_HOME;
                    agent.isVisible = false;
                    console.warn(`Agent ${agent.id}: Impossible d'aller au bâtiment commercial (chemin invalide). Retour à la maison.`);
                }
                if (departureCommSuccessful && previousStateForTimer !== agent.currentState) {
                    // Pas besoin de lastDepartureDay pour le commercial
                }
                agent._pathRequestTimeout = null;
                break;

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
                
            case AgentState.IN_TRANSIT_TO_COMMERCIAL:
                agent.isVisible = true;
                const arrivedCommercialPed = agent.hasReachedDestination || 
                    (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || 
                    (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                    
                if (arrivedCommercialPed) {
                    agent.currentState = AgentState.AT_COMMERCIAL;
                    agent.isVisible = false; 
                    agent.currentPathPoints = null;
                    agent.currentPathLengthWorld = 0;
                    agent.hasReachedDestination = false;
                    agent.arrivalTmeGame = -1;
                    console.log(`Agent ${agent.id}: Arrivé au bâtiment commercial.`);
                }
                break;

            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.REQUESTING_PATH_FOR_COMMERCIAL: 
            case AgentState.WAITING_FOR_PATH:
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WEEKEND_WALK_READY:
            case AgentState.WEEKEND_WALKING:
            case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
            // AT_COMMERCIAL est maintenant géré plus haut par medicationBehavior
            // Pas de logique active ici pour ces états, géré par setPath ou autres behaviors
                break;
            
            case AgentState.AT_COMMERCIAL: // Cet état est le point d'arrivée, la logique d'action se fait dans medicationBehavior
                // Assurer que l'agent est caché et réinitialiser les timers s'il reste bloqué ici par erreur
                agent.isVisible = false;
                break;

            case AgentState.IDLE:
            default:
                agent.isVisible = false;
                if (!agent.homeBuildingId && this.experience.world?.cityManager) {
                    const cityManager = this.experience.world.cityManager;
                    const citizenInfo = cityManager.registerCitizen(agent.id, agent); 
                    const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);
                    const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);
                    if (homeAssigned) {
                        agent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId);
                    }
                }
                break;
        } 

        const newState = agent.currentState;
        const justEnteredTransitOrRequestState =
            (newState.startsWith('IN_TRANSIT_') || newState.startsWith('DRIVING_') ||
             newState.startsWith('REQUESTING_') || newState.startsWith('WEEKEND_WALK_') || 
             newState === AgentState.WAITING_FOR_PATH) &&
            newState !== previousStateForTimer; 

        const justEnteredStableState =
            (newState === AgentState.AT_HOME || newState === AgentState.AT_WORK || 
             newState === AgentState.AT_COMMERCIAL || newState === AgentState.IDLE) &&
            newState !== previousStateForTimer; 

        if (justEnteredTransitOrRequestState) {
            agent._stateStartTime = currentGameTime;
        } else if (justEnteredStableState) {
            agent._stateStartTime = null;
        }

        // Mécanisme de secours spécifique pour le vendredi soir
        // Si l'agent est encore au travail après 20h le vendredi, forcer le retour à la maison
        const isCurrentlyFridayLate = calendarDate?.jourSemaine === "Vendredi" && currentHour >= agent.departureHomeHour + 1;
        if (isCurrentlyFridayLate && agent.currentState === AgentState.AT_WORK) {
            console.warn(`Agent ${agent.id}: Toujours au travail le vendredi à ${currentHour}h. Forçage retour maison.`);
            agent.forceReturnHome(currentGameTime);
        }
    }
}