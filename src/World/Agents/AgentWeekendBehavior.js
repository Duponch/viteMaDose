// src/World/AgentWeekendBehavior.js
import * as THREE from 'three';
import AgentState from './AgentState.js';

export default class AgentWeekendBehavior {
    /**
     * Gère la logique spécifique aux promenades du weekend pour un agent.
     * @param {Agent} agent - L'instance Agent associée.
     * @param {WeekendWalkStrategy} weekendWalkStrategy - La stratégie partagée pour le planning du weekend.
     */
    constructor(agent, weekendWalkStrategy) {
        this.agent = agent;
        this.experience = agent.experience; // Stocker la référence à experience
        this.weekendWalkStrategy = weekendWalkStrategy;

        // Propriétés spécifiques au comportement du weekend
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;
        this.weekendWalkEndTime = -1;
        this.isInsidePark = false;
        this.parkSidewalkPosition = null;
        this.parkSidewalkGridNode = null;
        this.nextParkMovementTime = 0;
        
        // Propriété pour gérer la coordination avec l'achat de médicaments
        this.medicationPurchaseInProgress = false;

        // Récupération de la hauteur du trottoir (peut être utile)
        // Utilisation de l'accès via experience
        this.sidewalkHeight = this.experience.world?.cityManager?.navigationManager?.getNavigationGraph(false)?.sidewalkHeight || 0.2;
    }

    /**
     * Met à jour la logique du comportement du weekend.
     * Détermine s'il faut commencer une promenade, la continuer, ou rentrer.
     * @param {object} calendarDate - Informations du calendrier actuel.
     * @param {number} currentHour - Heure actuelle (0-23).
     * @param {number} currentGameTime - Temps de jeu actuel (ms).
     */
    update(calendarDate, currentHour, currentGameTime) {
        const agent = this.agent;
        const agentState = agent.currentState;
        const isWeekendNow = ["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine);

        // --- ACCÈS À L'ENVIRONNEMENT CORRIGÉ ---
        const environment = this.experience.world?.environment; // Accéder via experience
        // ---------------------------------------
        
        // Si l'agent est en train d'acheter des médicaments, ne pas interférer
        if (agentState === AgentState.IN_TRANSIT_TO_COMMERCIAL || 
            agentState === AgentState.AT_COMMERCIAL || 
            agentState === AgentState.REQUESTING_PATH_FOR_COMMERCIAL ||
            agentState === AgentState.READY_TO_LEAVE_FOR_COMMERCIAL) {
            this.medicationPurchaseInProgress = true;
            return; // Laisser le comportement d'achat de médicament gérer cette situation
        } else if (this.medicationPurchaseInProgress && agentState === AgentState.AT_HOME) {
            // L'agent est revenu à la maison après avoir acheté des médicaments
            this.medicationPurchaseInProgress = false;
        }

        // --- Logique de DÉCLENCHEMENT (si AT_HOME et c'est le weekend) ---
        if (agentState === AgentState.AT_HOME && isWeekendNow) {
            // Si l'agent n'est pas en train d'acheter des médicaments, permettre l'achat de médicaments
            if (!this.medicationPurchaseInProgress && agent.medicationBehavior) {
                // Appeler le comportement d'achat de médicaments pour vérifier s'il a besoin d'en acheter
                agent.medicationBehavior.update(calendarDate, currentHour, currentGameTime);
                
                // Si l'agent a commencé à aller acheter des médicaments, sortir de cette méthode
                if (agent.currentState !== AgentState.AT_HOME) {
                    this.medicationPurchaseInProgress = true;
                    return;
                }
            }
            
            // Uniquement après avoir vérifié si l'agent a besoin de médicaments et qu'il est toujours à la maison
            if (agent.currentState === AgentState.AT_HOME) {
                // Enregistrer l'agent auprès de la stratégie (si ce n'est déjà fait pour ce jour)
                this.weekendWalkStrategy.registerAgent(agent.id, calendarDate);
                // Vérifier s'il est temps de partir selon la stratégie
                const shouldStartWalk = this.weekendWalkStrategy.shouldWalkNow(agent.id, calendarDate, currentHour);

                if (shouldStartWalk) {
                    console.log(`Agent ${agent.id}: Déclenchement promenade weekend (Stratégie). Recherche destination...`);
                    const destinationFound = this._findRandomWalkDestination(currentGameTime);
                    if (!destinationFound) {
                        console.warn(`Agent ${agent.id}: Impossible de trouver une destination de promenade après déclenchement.`);
                        // L'agent restera AT_HOME, la stratégie ne le redéclenchera pas pour cette heure.
                    }
                    // Si destinationFound, requestPath a déjà été appelé et l'état a changé dans Agent.js.
                    return; // Sortir car l'état a changé ou la recherche a échoué.
                }
            }
        }

        // --- Logique PENDANT la promenade (état WEEKEND_WALKING) ---
        if (agentState === AgentState.WEEKEND_WALKING) {
            agent.isVisible = true; // Assurer visibilité
            // Vérifier si la destination est atteinte (basé sur le temps d'arrivée calculé ou le flag)
            const destinationReached = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || agent.hasReachedDestination;
            // Vérifier si le temps alloué à la promenade est écoulé
            const walkTimeOver = this.weekendWalkEndTime > 0 && currentGameTime >= this.weekendWalkEndTime;

            if (destinationReached || walkTimeOver) {
                console.log(`Agent ${agent.id}: Fin promenade weekend (Atteint: ${destinationReached}, Temps Fini: ${walkTimeOver}). Demande retour maison.`);
                this.resetWeekendState(); // Nettoyer l'état du weekend
                agent.hasReachedDestination = false; // Important de reset ce flag

                // Demander le chemin du retour à la maison
                if (agent.homePosition && agent.homeGridNode) {
                    agent._currentPathRequestGoal = 'HOME'; // But retour maison
                    // La demande de chemin gère le changement d'état vers REQUESTING_* ou WAITING_FOR_PATH
                    agent.requestPath(
                        agent.position, // Partir de la position actuelle
                        agent.homePosition,
                        null, // Laisser requestPath trouver le nœud courant
                        agent.homeGridNode,
                        AgentState.READY_TO_LEAVE_FOR_HOME, // État cible si chemin trouvé
                        currentGameTime
                    );
                } else {
                    console.error(`Agent ${agent.id}: Impossible de rentrer (infos domicile manquantes). Forçage récupération.`);
                    agent.forceRecoverFromTimeout(currentGameTime); // Utiliser récupération
                }
            }
            // Note: La logique _moveInsidePark/_findNewPositionInsidePark n'est pas active actuellement
            // else if (this.isInsidePark) {
            //     this._findNewPositionInsidePark(currentGameTime);
            // }
        }

        // --- Logique pour l'état WEEKEND_WALK_READY ---
        // (Juste après que le chemin ait été trouvé, avant de commencer à marcher)
        if (agentState === AgentState.WEEKEND_WALK_READY) {
            if (agent.currentPathPoints) {
                agent.currentState = AgentState.WEEKEND_WALKING; // Démarrer la marche effective
                agent.isVisible = true;
                agent.departureTimeGame = currentGameTime;

                // Recalculer durée/arrivée basée sur vitesse PIETON (agentBaseSpeed)
                if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                    agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                } else {
                    agent.calculatedTravelDurationGame = 15 * 60 * 1000; // Fallback 15min jeu
                }
                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;

                // --- CALCUL TEMPS FIN PROMENADE CORRIGÉ ---
                // Utiliser la référence correcte à environment
                const dayDurationMs = environment?.dayDurationMs || 0;
                const msPerHour = dayDurationMs > 0 ? dayDurationMs / 24 : 3600000; // Fallback 1h en ms
                let walkDurationMs = msPerHour; // Durée par défaut (1h)

                if (this.weekendWalkStrategy && calendarDate) {
                    const dayKey = this.weekendWalkStrategy._getDayKey(calendarDate);
                    const walkInfo = this.weekendWalkStrategy.agentWalkMap?.get(dayKey)?.get(agent.id);
                    if (walkInfo?.duration) { // Vérifier que duration existe
                        walkDurationMs = walkInfo.duration * msPerHour;
                    }
                }
                this.weekendWalkEndTime = currentGameTime + walkDurationMs; // Heure de fin absolue
                // --------------------------------------------

                console.log(`Agent ${agent.id}: Début promenade weekend. Durée trajet: ${(agent.calculatedTravelDurationGame / 1000).toFixed(1)}s. Fin promenade prévue dans: ${(walkDurationMs / 1000).toFixed(1)}s`);
                agent._pathRequestTimeout = null; // Nettoyer le timeout de requête
            } else {
                console.warn(`Agent ${agent.id}: Prêt promenade mais pas de chemin. Retour AT_HOME.`);
                this.resetWeekendState();
                agent.currentState = AgentState.AT_HOME;
                agent._pathRequestTimeout = null;
            }
        }

        // --- Logique pour WEEKEND_WALK_REQUESTING_PATH ou WEEKEND_WALK_RETURNING_TO_SIDEWALK ---
        if ((agentState === AgentState.WEEKEND_WALK_REQUESTING_PATH || agentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) && !isWeekendNow) {
            console.warn(`Agent ${agent.id}: Weekend terminé pendant l'attente du chemin de promenade/retour. Annulation, retour AT_HOME.`);
            this.resetWeekendState();
            agent.forceReturnHome(currentGameTime); // Force le retour à la maison
        }
    }

    /**
     * Trouve une destination aléatoire pour la promenade du weekend.
     * @param {number} currentGameTime - Temps de jeu actuel pour les requêtes de chemin
     * @private
     * @returns {boolean} - true si une destination a été trouvée et une requête de chemin lancée, false sinon.
     */
    _findRandomWalkDestination(currentGameTime) {
        const agent = this.agent;
        const cityManager = this.experience.world?.cityManager;
        const navManager = cityManager?.navigationManager;
        const navGraph = navManager?.getNavigationGraph(false); // Toujours piéton

        if (!cityManager || !navManager || !navGraph) {
            console.warn(`Agent ${agent.id}: Impossible de trouver une destination de promenade - CityManager, NavManager ou NavGraph piéton manquant.`);
            return false;
        }

        // 1) Essayer de trouver un parc
        const parks = cityManager.getBuildingsByType(['park']);
        if (parks && parks.length > 0) {
            const shuffledParks = [...parks].sort(() => Math.random() - 0.5);
            for (const park of shuffledParks) {
                if (park?.position) {
                    const parkPos = park.position.clone();
                    parkPos.y = this.sidewalkHeight; // Utiliser hauteur trottoir

                    const parkNode = navGraph.getClosestWalkableNode(parkPos);
                    if (parkNode) {
                        const worldPos = navGraph.gridToWorld(parkNode.x, parkNode.y);
                        if (worldPos) {
                            this.weekendWalkDestination = worldPos;
                            this.weekendWalkGridNode = parkNode;
                            console.log(`Agent ${agent.id}: Destination promenade (Parc) trouvée: Noeud(${parkNode.x},${parkNode.y})`);
                            if (agent.homePosition && agent.homeGridNode) {
                                // --- Mettre à jour l'état avant de demander le chemin ---
                                agent.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                                // ------------------------------------------------------
                                agent.requestPath(
                                    agent.homePosition, this.weekendWalkDestination,
                                    agent.homeGridNode, this.weekendWalkGridNode,
                                    AgentState.WEEKEND_WALK_READY,
                                    currentGameTime
                                );
                                return true;
                            } else {
                                console.error(`Agent ${agent.id}: Infos domicile manquantes pour lancer requête chemin promenade.`);
                                this.resetWeekendState();
                                return false;
                            }
                        }
                    }
                }
            }
        }

        // 2) Fallback : Nœud aléatoire sur le graphe piéton
        console.log(`Agent ${agent.id}: Aucun parc valide trouvé, recherche nœud aléatoire...`);
        const randomNode = navGraph.getRandomWalkableNode?.(50);
        if (randomNode) {
            const worldPos = navGraph.gridToWorld(randomNode.x, randomNode.y);
            if (worldPos) {
                this.weekendWalkDestination = worldPos;
                this.weekendWalkGridNode = { x: randomNode.x, y: randomNode.y };
                console.log(`Agent ${agent.id}: Destination promenade (Aléatoire) trouvée: Noeud(${randomNode.x},${randomNode.y})`);
                if (agent.homePosition && agent.homeGridNode) {
                    // --- Mettre à jour l'état avant de demander le chemin ---
                    agent.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
                    // ------------------------------------------------------
                    agent.requestPath(
                        agent.homePosition, this.weekendWalkDestination,
                        agent.homeGridNode, this.weekendWalkGridNode,
                        AgentState.WEEKEND_WALK_READY,
                        currentGameTime
                    );
                    return true;
                } else {
                    console.error(`Agent ${agent.id}: Infos domicile manquantes pour lancer requête chemin promenade aléatoire.`);
                    this.resetWeekendState();
                    return false;
                }
            }
        }

        console.warn(`Agent ${agent.id}: Impossible de trouver une destination valide pour la promenade (ni parc, ni aléatoire).`);
        this.resetWeekendState();
        return false;
    }

    // --- Méthodes _moveInsidePark et _findNewPositionInsidePark (conservées mais non utilisées activement) ---
    _moveInsidePark(targetPos, currentGameTime) {
        // ... (logique existante) ...
         this.isInsidePark = true;
         if (!this.parkSidewalkPosition) { this.parkSidewalkPosition = this.agent.position.clone(); }
         const startPos = this.agent.position.clone();
         const endPos = targetPos.clone();
         const distanceToTargetSq = startPos.distanceToSquared(endPos);
         const speed = 1.2;
         const travelTime = distanceToTargetSq > 0 ? (Math.sqrt(distanceToTargetSq) / speed) * 1000 : 0;
         this.agent.currentPathPoints = [startPos, endPos];
         this.agent.departureTimeGame = currentGameTime;
         this.agent.arrivalTmeGame = currentGameTime + travelTime;
         this.agent.calculatedTravelDurationGame = travelTime;
         this.agent.currentPathLengthWorld = Math.sqrt(distanceToTargetSq);
         this.agent.currentPathIndexVisual = 0;
         this.agent.visualInterpolationProgress = 0;
         this.nextParkMovementTime = currentGameTime + travelTime + (Math.random() * 10000 + 5000);
         console.log(`Agent ${this.agent.id}: Mouvement DANS parc vers (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)}).`);
    }

    _findNewPositionInsidePark(currentGameTime) {
        // ... (logique existante) ...
         if (currentGameTime < this.nextParkMovementTime) { return; } // Attendre avant de bouger
         // Tenter de trouver une nouvelle position aléatoire dans le parc le plus proche
         // Si réussi, appeler _moveInsidePark(newTarget, currentGameTime);
         // Si échoue, ou si weekendWalkEndTime est dépassé :
         const navGraph = this.experience.world?.cityManager?.navigationManager?.getNavigationGraph(false);
         if(this.parkSidewalkPosition && this.parkSidewalkGridNode && navGraph) {
             // Demander chemin pour retourner au point du trottoir sauvegardé
             // Changement d'état avant la requête
             this.agent.currentState = AgentState.WEEKEND_WALK_REQUESTING_PATH; // Utiliser l'état de requête
             this.agent.requestPath(
                 this.agent.position, // Partir de la position actuelle DANS le parc
                 this.parkSidewalkPosition,
                 null, // Laisser requestPath trouver le nœud de départ
                 this.parkSidewalkGridNode,
                 AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK, // État cible spécifique
                 currentGameTime
             );
             this.isInsidePark = false; // Marquer comme n'étant plus dans le parc
             console.log(`Agent ${this.agent.id}: Quitte le parc, demande chemin retour vers trottoir.`);
         } else {
             console.error(`Agent ${this.agent.id}: Impossible de retourner au trottoir (infos manquantes). Forçage récupération.`);
             this.agent.forceRecoverFromTimeout(currentGameTime);
         }
    }
    // --- Fin méthodes parc ---


    /**
     * Réinitialise les propriétés liées à l'état de promenade du weekend.
     */
    resetWeekendState() {
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;
        this.weekendWalkEndTime = -1;
        this.isInsidePark = false;
        this.parkSidewalkPosition = null;
        this.parkSidewalkGridNode = null;
        this.nextParkMovementTime = 0;
        // Réinitialiser aussi le targetState de l'agent si pertinent
        if(this.agent) this.agent.targetStateFromWeekendWalk = null;
    }
}