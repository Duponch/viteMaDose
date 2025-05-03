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
        this.experience = agent.experience;
        this.weekendWalkStrategy = weekendWalkStrategy;

        // Propriétés spécifiques au comportement du weekend
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;
        this.weekendWalkEndTime = -1;
        this.isInsidePark = false; // Actuellement non utilisé, mais conservé pour logique future
        this.parkSidewalkPosition = null; // Position sur le trottoir avant d'entrer dans un parc (non utilisé actuellement)
        this.parkSidewalkGridNode = null; // Nœud correspondant (non utilisé actuellement)
        this.nextParkMovementTime = 0; // Temps pour le prochain déplacement dans un parc (non utilisé actuellement)

        // Récupération de la hauteur du trottoir (peut être utile)
        this.sidewalkHeight = this.experience.world?.cityManager?.getNavigationGraph(false)?.sidewalkHeight || 0.2;
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

        // --- Logique de DÉCLENCHEMENT (si AT_HOME et c'est le weekend) ---
        if (agentState === AgentState.AT_HOME && isWeekendNow) {
            this.weekendWalkStrategy.registerAgent(agent.id, calendarDate);
            const shouldStartWalk = this.weekendWalkStrategy.shouldWalkNow(agent.id, calendarDate, currentHour);

            if (shouldStartWalk) {
                console.log(`Agent ${agent.id}: Déclenchement promenade weekend (Stratégie). Recherche destination...`);
                const destinationFound = this._findRandomWalkDestination(currentGameTime);
                if (!destinationFound) {
                    console.warn(`Agent ${agent.id}: Impossible de trouver une destination de promenade après déclenchement.`);
                    // L'agent restera AT_HOME, la stratégie ne le redéclenchera pas pour cette heure.
                }
                // Si destinationFound, requestPath a déjà été appelé et l'état a changé.
                return; // Sortir car l'état a changé ou la recherche a échoué.
            }
        }

        // --- Logique PENDANT la promenade (état WEEKEND_WALKING) ---
        if (agentState === AgentState.WEEKEND_WALKING) {
            agent.isVisible = true; // Assurer visibilité
            const destinationReached = (agent.arrivalTmeGame > 0 && currentGameTime >= agent.arrivalTmeGame) || agent.hasReachedDestination;
            const walkTimeOver = this.weekendWalkEndTime > 0 && currentGameTime >= this.weekendWalkEndTime;

            if (destinationReached || walkTimeOver) {
                console.log(`Agent ${agent.id}: Fin promenade weekend (Atteint: ${destinationReached}, Temps Fini: ${walkTimeOver}). Demande retour maison.`);
                this.resetWeekendState(); // Nettoyer l'état du weekend
                agent.hasReachedDestination = false; // Important de reset ce flag

                if (agent.homePosition && agent.homeGridNode) {
                    agent._currentPathRequestGoal = 'HOME'; // But retour maison
                    // Changement d'état et requête gérés DANS requestPath
                    const navigationManager = this.experience.world?.cityManager?.navigationManager;
                    const currentNavGraph = navigationManager?.getNavigationGraph(false); // Toujours piéton pour retour
                    const currentGridNode = currentNavGraph?.getClosestWalkableNode(agent.position);
                    agent.requestPath(agent.position, agent.homePosition, currentGridNode, agent.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, currentGameTime);
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
        // (Juste avant de commencer à marcher effectivement)
        if (agentState === AgentState.WEEKEND_WALK_READY) {
            if (agent.currentPathPoints) {
                agent.currentState = AgentState.WEEKEND_WALKING; // Démarrer la marche
                agent.isVisible = true;
                agent.departureTimeGame = currentGameTime;

                // Recalculer durée/arrivée basée sur vitesse PIETON
                if (agent.agentBaseSpeed > 0 && agent.currentPathLengthWorld > 0) {
                    agent.calculatedTravelDurationGame = (agent.currentPathLengthWorld / agent.agentBaseSpeed) * 1000;
                } else { agent.calculatedTravelDurationGame = 15 * 60 * 1000; } // Fallback 15min
                agent.arrivalTmeGame = currentGameTime + agent.calculatedTravelDurationGame;

                // Calculer le temps de fin de la promenade globale
                const dayDurationMs = environment?.dayDurationMs || 0;
                const msPerHour = dayDurationMs > 0 ? dayDurationMs / 24 : 3600000; // Fallback 1h en ms
                let walkDurationMs = msPerHour; // Durée par défaut
                if (this.weekendWalkStrategy && calendarDate) {
                     const dayKey = this.weekendWalkStrategy._getDayKey(calendarDate);
                     const walkInfo = this.weekendWalkStrategy.agentWalkMap?.get(dayKey)?.get(agent.id);
                     if (walkInfo) { walkDurationMs = walkInfo.duration * msPerHour; }
                }
                this.weekendWalkEndTime = currentGameTime + walkDurationMs; // Heure de fin absolue

                console.log(`Agent ${agent.id}: Début promenade weekend. Durée trajet: ${(agent.calculatedTravelDurationGame/1000).toFixed(1)}s. Fin promenade prévue dans: ${(walkDurationMs/1000).toFixed(1)}s`);
                agent._pathRequestTimeout = null; // Nettoyer le timeout de requête
            } else {
                console.warn(`Agent ${agent.id}: Prêt promenade mais pas de chemin. Retour AT_HOME.`);
                this.resetWeekendState();
                agent.currentState = AgentState.AT_HOME;
                agent._pathRequestTimeout = null;
            }
        }

        // --- Logique pour WEEKEND_WALK_REQUESTING_PATH ou WEEKEND_WALK_RETURNING_TO_SIDEWALK ---
        // Ces états sont passifs, ils attendent que setPath soit appelé par le worker.
        // On pourrait ajouter une vérification ici si le weekend se termine pendant l'attente.
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
        const navGraph = cityManager?.getNavigationGraph(false); // Toujours piéton pour la promenade

        if (!cityManager || !navGraph) {
            console.warn(`Agent ${agent.id}: Impossible de trouver une destination de promenade - CityManager ou NavGraph piéton manquant.`);
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

                    // --- Logique pour trouver un nœud proche et valide ---
                    const parkNode = navGraph.getClosestWalkableNode(parkPos);
                    if (parkNode) {
                        const worldPos = navGraph.gridToWorld(parkNode.x, parkNode.y);
                        if (worldPos) {
                            this.weekendWalkDestination = worldPos;
                            this.weekendWalkGridNode = parkNode;
                            console.log(`Agent ${agent.id}: Destination promenade (Parc) trouvée: Noeud(${parkNode.x},${parkNode.y})`);
                            // --- Demander le chemin ---
                             if (agent.homePosition && agent.homeGridNode) {
                                agent.requestPath(
                                    agent.homePosition, this.weekendWalkDestination,
                                    agent.homeGridNode, this.weekendWalkGridNode,
                                    AgentState.WEEKEND_WALK_READY, // État cible si chemin trouvé
                                    currentGameTime
                                );
                                return true; // Succès, requête lancée
                            } else {
                                console.error(`Agent ${agent.id}: Infos domicile manquantes pour lancer requête chemin promenade.`);
                                this.resetWeekendState(); // Nettoyer état weekend
                                return false; // Échec
                            }
                        }
                    }
                }
            }
        }

        // 2) Fallback : Nœud aléatoire sur le graphe piéton
        console.log(`Agent ${agent.id}: Aucun parc valide trouvé, recherche nœud aléatoire...`);
        const randomNode = navGraph.getRandomWalkableNode?.(50); // Tente 50 fois
        if (randomNode) {
            const worldPos = navGraph.gridToWorld(randomNode.x, randomNode.y);
            if (worldPos) {
                this.weekendWalkDestination = worldPos;
                this.weekendWalkGridNode = { x: randomNode.x, y: randomNode.y };
                console.log(`Agent ${agent.id}: Destination promenade (Aléatoire) trouvée: Noeud(${randomNode.x},${randomNode.y})`);
                // --- Demander le chemin ---
                 if (agent.homePosition && agent.homeGridNode) {
                     agent.requestPath(
                         agent.homePosition, this.weekendWalkDestination,
                         agent.homeGridNode, this.weekendWalkGridNode,
                         AgentState.WEEKEND_WALK_READY,
                         currentGameTime
                     );
                     return true; // Succès
                 } else {
                    console.error(`Agent ${agent.id}: Infos domicile manquantes pour lancer requête chemin promenade aléatoire.`);
                    this.resetWeekendState();
                    return false; // Échec
                 }
            }
        }

        console.warn(`Agent ${agent.id}: Impossible de trouver une destination valide pour la promenade (ni parc, ni aléatoire).`);
        this.resetWeekendState();
        return false; // Échec final
    }

     // --- Méthodes _moveInsidePark et _findNewPositionInsidePark (conservées mais non utilisées activement) ---
     _moveInsidePark(targetPos, currentGameTime) {
         this.isInsidePark = true;
         if (!this.parkSidewalkPosition) { this.parkSidewalkPosition = this.agent.position.clone(); }
         const startPos = this.agent.position.clone();
         const endPos = targetPos.clone();
         const distance = startPos.distanceTo(endPos);
         const speed = 1.2;
         const travelTime = distance > 0 ? (distance / speed) * 1000 : 0;
         // Simule un chemin direct
         this.agent.currentPathPoints = [startPos, endPos];
         this.agent.departureTimeGame = currentGameTime;
         this.agent.arrivalTmeGame = currentGameTime + travelTime;
         this.agent.calculatedTravelDurationGame = travelTime;
         this.agent.currentPathLengthWorld = distance;
         this.agent.currentPathIndexVisual = 0;
         this.agent.visualInterpolationProgress = 0;
         this.nextParkMovementTime = currentGameTime + travelTime + (Math.random() * 10000 + 5000);
         console.log(`Agent ${this.agent.id}: Mouvement DANS parc vers (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)}).`);
     }

     _findNewPositionInsidePark(currentGameTime) {
        // ... [Logique pour trouver un point aléatoire dans le parc le plus proche] ...
        // Si trouvé, appeler this._moveInsidePark(newTarget, currentGameTime);
        // Si non trouvé ou temps de retourner, initier retour au trottoir:
        // const navGraph = this.experience.world?.cityManager?.getNavigationGraph(false);
        // if(this.parkSidewalkPosition && this.parkSidewalkGridNode && navGraph) {
        //      this.agent.requestPath(this.agent.position, this.parkSidewalkPosition, null, this.parkSidewalkGridNode, AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK, currentGameTime);
        //      this.isInsidePark = false;
        // } else { /* Gérer erreur */ }
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
    }
}