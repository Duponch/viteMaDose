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
     * @param {Date} calendarDate - Date actuelle du jeu.
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
    update(deltaTime, currentHour, calendarDate, currentGameTime) {
        const agent = this.agent; // Raccourci

        // --- CORRECTION: S'assurer que currentGameTime est un nombre ---
        if (typeof currentGameTime !== 'number') {
            console.warn(`Agent ${agent.id}: currentGameTime n'est pas un nombre:`, currentGameTime);
            currentGameTime = this.experience.time.elapsed;
            console.log(`Agent ${agent.id}: Correction avec this.experience.time.elapsed =`, currentGameTime);
        }
        // -------------------------------------------------------

        // --- CORRECTION: Capturer l'état AU DÉBUT de l'update ---
        const previousStateForTimer = agent.currentState;
        // -------------------------------------------------------

        // --- Informations Environnement / Calendrier ---
        const environment = this.experience.world?.environment;
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
                        currentDayNumber > agent.lastDepartureDayWork &&
                        timeWithinCurrentDayCycle >= agent.prepareWorkDepartureTimeGame &&
                        currentHour < agent.departureHomeHour && 
                        agent.requestedPathForDepartureTime !== currentGameTime 
                    );

                    // Log pour déboguer la condition
                    if (currentHour === 8) {
                        console.log(`Agent ${agent.id} - Analyse départ travail:
                            - a workPosition: ${!!agent.workPosition}
                            - shouldWorkToday: ${shouldWorkToday}
                            - currentDayNumber (${currentDayNumber}) > lastDepartureDayWork (${agent.lastDepartureDayWork}): ${currentDayNumber > agent.lastDepartureDayWork}
                            - timeWithinCurrentDayCycle (${timeWithinCurrentDayCycle}) >= prepareWorkDepartureTimeGame (${agent.prepareWorkDepartureTimeGame}): ${timeWithinCurrentDayCycle >= agent.prepareWorkDepartureTimeGame}
                            - currentHour (${currentHour}) < departureHomeHour (${agent.departureHomeHour}): ${currentHour < agent.departureHomeHour}
                            - requestedPathForDepartureTime (${agent.requestedPathForDepartureTime}) != currentGameTime (${currentGameTime}): ${agent.requestedPathForDepartureTime !== currentGameTime}
                            => workCheckCondition: ${workCheckCondition}
                        `);
                    }

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
                    //console.log(`Agent ${agent.id}: Préparation départ maison. [${calendarDate?.jourSemaine}] [isFridayDepartureTime: ${isFridayDepartureTime}] [Heure: ${currentHour}]`);
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
                                // Démarrer la transition du bâtiment vers le point de départ du chemin
                                if (agent.startTransitionFromBuildingToPath(currentGameTime, 'WORK')) {
                                    agent.departureTimeGame = currentGameTime;
                                    agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                        (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                    agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                    departureSuccessful = true;
                                } else {
                                    agent.currentState = AgentState.AT_HOME; 
                                    agent.isVisible = false;
                                }
                            } else { 
                                agent.currentState = AgentState.AT_HOME; 
                                agent.isVisible = false;
                            }
                        }
                    } else { 
                        // L'agent est en mode piéton
                        if (agent.currentPathPoints) {
                            // Démarrer la transition du bâtiment vers le point de départ du chemin
                            if (agent.startTransitionFromBuildingToPath(currentGameTime, 'WORK')) {
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                    (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            } else {
                                // Fallback au comportement original si la transition échoue
                                agent.currentState = AgentState.IN_TRANSIT_TO_WORK; 
                                agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                    (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            }
                        } else {
                            console.warn(`Agent ${agent.id}: READY_TO_LEAVE_FOR_WORK sans chemin valide.`);
                            agent.currentState = AgentState.AT_HOME; 
                            agent.isVisible = false;
                        }
                    }

                    if (departureSuccessful) {
                        // Mise à jour des dates pour éviter trajets multiples
                        agent.lastDepartureDayWork = calendarDate?.jour ?? 0;
                        const currentHourMs = timeWithinCurrentDayCycle;
                        //console.log(`Agent ${agent.id}: Départ travail à ${new Date(currentHourMs).toISOString().substr(11, 8)}`);
                    }
                } else {
                    // Ajout de log pour déboguer - si l'heure actuelle est 8h00 ou plus mais la condition n'est pas remplie
                    if (currentHour >= 8) {
                        console.log(`Agent ${agent.id} bloqué en READY_TO_LEAVE_FOR_WORK:
                            - timeWithinCurrentDayCycle: ${timeWithinCurrentDayCycle}
                            - exactWorkDepartureTimeGame: ${agent.exactWorkDepartureTimeGame}
                            - currentHour: ${currentHour}
                            - currentGameTime: ${currentGameTime}`);
                        
                        // Forcer le départ si l'heure est bonne mais la condition numérique échoue
                        if (currentHour >= agent.departureWorkHour) {
                            console.log(`Agent ${agent.id}: Forçage du départ (heure correcte)`);
                            // Déclencher la transition du bâtiment au chemin
                            if (agent.currentPathPoints && agent.startTransitionFromBuildingToPath(currentGameTime, 'WORK')) {
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                    (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                agent.lastDepartureDayWork = calendarDate?.jour ?? 0;
                            }
                        }
                    }
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
                            agent.currentState = AgentState.DRIVING_HOME;
                            agent.isVisible = false; 
                            agent.departureTimeGame = currentGameTime;
                            const carSpeed = car.speed;
                            agent.calculatedTravelDurationGame = (carSpeed > 0 && agent.currentPathLengthWorld > 0) ? (agent.currentPathLengthWorld / carSpeed) * 1000 : 10 * 60 * 1000;
                            agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                            departureSuccessful = true;
                        } else { 
                            console.warn(`Agent ${agent.id}: Problème départ voiture pour retour (voiture ou chemin manquant). Tentative départ piéton.`);
                            agent.vehicleBehavior.exitVehicle();
                            if (agent.currentPathPoints) { 
                                // Démarrer la transition du bâtiment vers le point de départ du chemin
                                if (agent.startTransitionFromBuildingToPath(currentGameTime, 'HOME')) {
                                    agent.departureTimeGame = currentGameTime;
                                    agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                        (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                    agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                    departureSuccessful = true;
                                } else {
                                    agent.currentState = AgentState.AT_WORK; 
                                    agent.isVisible = false;
                                }
                            } else { 
                                agent.currentState = AgentState.AT_WORK; 
                                agent.isVisible = false;
                            }
                        }
                    } else { 
                        // L'agent est en mode piéton
                        if (agent.currentPathPoints) {
                            // Démarrer la transition du bâtiment vers le point de départ du chemin
                            if (agent.startTransitionFromBuildingToPath(currentGameTime, 'HOME')) {
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                    (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            } else {
                                // Fallback au comportement original si la transition échoue
                                agent.currentState = AgentState.IN_TRANSIT_TO_HOME; 
                                agent.isVisible = true;
                                agent.departureTimeGame = currentGameTime;
                                agent.calculatedTravelDurationGame = (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) ? 
                                    (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000 : 10 * 60 * 1000;
                                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;
                                departureSuccessful = true;
                            }
                        } else {
                            console.warn(`Agent ${agent.id}: READY_TO_LEAVE_FOR_HOME sans chemin valide.`);
                            agent.currentState = AgentState.AT_WORK; 
                            agent.isVisible = false;
                        }
                    }

                    if (departureSuccessful) {
                        // Mise à jour des dates pour éviter trajets multiples
                        agent.lastDepartureDayHome = calendarDate?.jour ?? 0;
                        const currentHourMs = timeWithinCurrentDayCycle;
                        //console.log(`Agent ${agent.id}: Départ maison à ${new Date(currentHourMs).toISOString().substr(11, 8)}`);
                    }
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
                    //console.log(`Agent ${agent.id}: Départ vers le bâtiment commercial.`);
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
                // Prendre en compte les deux conditions: hasReachedDestination et/ou temps écoulé
                const arrivedWorkPed = 
                    (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || 
                    (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                
                if (arrivedWorkPed && !agent.isMovingFromPathToBuilding) {
                    agent.hasReachedDestination = true;
                }
                
                // Ne pas traiter l'arrivée si une transition vers le bâtiment est déjà en cours
                if (!agent.isMovingFromPathToBuilding && agent.hasReachedDestination) {
                    // À ce stade, l'agent a atteint le point final du chemin
                    // La transition vers le bâtiment doit être initiée par updateVisual
                }
                break;
            case AgentState.IN_TRANSIT_TO_HOME:
                // Prendre en compte les deux conditions: hasReachedDestination et/ou temps écoulé
                const arrivedHomePed = 
                    (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || 
                    (!agent.currentPathPoints || agent.currentPathPoints.length === 0);
                
                if (arrivedHomePed && !agent.isMovingFromPathToBuilding) {
                    agent.hasReachedDestination = true;
                }
                
                // Ne pas traiter l'arrivée si une transition vers le bâtiment est déjà en cours
                if (!agent.isMovingFromPathToBuilding && agent.hasReachedDestination) {
                    // À ce stade, l'agent a atteint le point final du chemin
                    // La transition vers le bâtiment doit être initiée par updateVisual
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
                    //console.log(`Agent ${agent.id}: Arrivé au bâtiment commercial.`);
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