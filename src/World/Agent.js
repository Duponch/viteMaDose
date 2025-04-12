// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

const AgentState = {
    AT_HOME: 'AT_HOME',
    GOING_TO_WORK: 'GOING_TO_WORK',
    AT_WORK: 'AT_WORK',
    GOING_HOME: 'GOING_HOME',
    IDLE: 'IDLE', // État initial ou si pas de domicile/travail
    WAITING_FOR_PATH: 'WAITING_FOR_PATH', // Nouvel état pour la file d'attente
};

export default class Agent {
    constructor(config, instanceId, experience) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) {
             throw new Error(`Agent ${this.id}: Experience instance is required!`);
        }
        this.experience = experience;
        this.scale = config.scale ?? 0.1; // Correction: Utiliser config.scale
        this.speed = config.speed ?? 1.5;
        this.rotationSpeed = config.rotationSpeed ?? 8.0;
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.2;

        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false;

        this.currentState = AgentState.IDLE;
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null;
        this.workPosition = null;

        // --- NOUVEAU : Cache pour les nœuds grille ---
        this.homeGridNode = null; // {x, y}
        this.workGridNode = null; // {x, y}
        // -------------------------------------------

        this.path = null;
        this.currentPathIndex = 0;

        this._targetPosition = new THREE.Vector3();
        this._direction = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3();
        this._targetOrientation = new THREE.Quaternion();
    }

	initializeLifecycle(homeId, workId) {
        this.homeBuildingId = homeId;
        this.workBuildingId = workId;

        const cityManager = this.experience.world?.cityManager;
        if (!cityManager || !this.experience.world) {
            console.error(`Agent ${this.id}: CityManager ou World non trouvé pour initialiser positions.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return;
        }

        const navGraph = cityManager.getNavigationGraph();
        const sidewalkHeight = navGraph ? navGraph.sidewalkHeight : (this.config?.sidewalkHeight ?? 0.2);

        // --- Récupérer position domicile et NŒUD GRILLE ---
        const homeInfo = cityManager.getBuildingInfo(this.homeBuildingId);
        if (homeInfo) {
             const homePlot = cityManager.getPlots().find(p => p.id === homeInfo.plotId);
             let baseHomePos = homePlot ? homePlot.getEntryPoint(sidewalkHeight) : homeInfo.position.clone();
             baseHomePos.y = sidewalkHeight; // Assurer la hauteur

             if (navGraph) {
                 // Calculer le nœud grille UNE FOIS
                 this.homeGridNode = navGraph.getClosestWalkableNode(baseHomePos);
                 if (this.homeGridNode) {
                    this.homePosition = navGraph.gridToWorld(this.homeGridNode.x, this.homeGridNode.y);
                    console.log(`Agent ${this.id}: Domicile ${this.homeBuildingId} -> Node (${this.homeGridNode.x},${this.homeGridNode.y}) Pos:`, this.homePosition.toArray().map(n=>n.toFixed(1)).join(','));
                 } else {
                     console.warn(`Agent ${this.id}: Pas de nœud NavGraph proche trouvé pour domicile ${this.homeBuildingId}. Utilisation position plot/brute.`);
                     this.homePosition = baseHomePos; // Garder la position de base
                     this.homeGridNode = null; // Indiquer qu'on n'a pas de nœud précalculé
                 }
             } else {
                 this.homePosition = baseHomePos; // Pas de NavGraph, utiliser pos de base
                 this.homeGridNode = null;
             }
             this.position.copy(this.homePosition);
             this.currentState = AgentState.AT_HOME;
             this.isVisible = false;

        } else {
            console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} non trouvées. Agent reste IDLE.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return;
        }

        // --- Récupérer position travail et NŒUD GRILLE ---
         const workInfo = cityManager.getBuildingInfo(this.workBuildingId);
         if (workInfo) {
             const workPlot = cityManager.getPlots().find(p => p.id === workInfo.plotId);
             let baseWorkPos = workPlot ? workPlot.getEntryPoint(sidewalkHeight) : workInfo.position.clone();
             baseWorkPos.y = sidewalkHeight;

              if (navGraph) {
                  // Calculer le nœud grille UNE FOIS
                  this.workGridNode = navGraph.getClosestWalkableNode(baseWorkPos);
                  if (this.workGridNode) {
                     this.workPosition = navGraph.gridToWorld(this.workGridNode.x, this.workGridNode.y);
                     console.log(`Agent ${this.id}: Travail ${this.workBuildingId} -> Node (${this.workGridNode.x},${this.workGridNode.y}) Pos:`, this.workPosition?.toArray().map(n=>n.toFixed(1)).join(','));
                  } else {
                      console.warn(`Agent ${this.id}: Pas de nœud NavGraph proche trouvé pour travail ${this.workBuildingId}.`);
                      this.workPosition = baseWorkPos;
                      this.workGridNode = null;
                  }
              } else {
                  this.workPosition = baseWorkPos;
                  this.workGridNode = null;
              }
         } else {
            console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} non trouvées.`);
            this.workPosition = null;
            this.workGridNode = null;
         }
    }

    // ==============================================================
    // Méthode requestPath MODIFIÉE pour utiliser la file d'attente
    // ==============================================================
    /**
     * Demande à l'AgentManager de calculer un chemin pour cet agent.
     * Utilise les nœuds de grille pré-calculés si disponibles.
     * @param {THREE.Vector3} startPosWorld - Position de départ dans le monde (généralement this.position).
     * @param {THREE.Vector3} endPosWorld - Position d'arrivée cible dans le monde.
     * @param {{x: number, y: number} | null} startNodeOverride - Nœud de départ pré-calculé (optionnel).
     * @param {{x: number, y: number} | null} endNodeOverride - Nœud d'arrivée pré-calculé (optionnel).
     */
    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null) {
        this.path = null; // Chemin actuel invalidé
        this.currentPathIndex = 0;
        this.currentState = AgentState.WAITING_FOR_PATH; // Indiquer qu'on attend
        this.isVisible = true; // Devient visible en attendant/partant

        const agentManager = this.experience.world?.agentManager;
        const navGraph = this.experience.world?.cityManager?.navigationGraph;

        if (!agentManager || !navGraph) {
            console.error(`Agent ${this.id}: AgentManager ou NavGraph manquant pour la requête de chemin.`);
            this.currentState = AgentState.IDLE; // Erreur critique, retour à IDLE
            this.isVisible = false;
            return;
        }

        // Déterminer les nœuds de départ et d'arrivée
        const startNode = startNodeOverride || navGraph.getClosestWalkableNode(startPosWorld);
        const endNode = endNodeOverride || navGraph.getClosestWalkableNode(endPosWorld);

        if (startNode && endNode) {
            // Ajouter la requête à la file d'attente de l'AgentManager
            agentManager.queuePathRequest(this.id, startNode, endNode);
            // console.log(`Agent ${this.id}: Path request queued from node (${startNode.x},${startNode.y}) to node (${endNode.x},${endNode.y}). State: WAITING_FOR_PATH`);
        } else {
            console.error(`Agent ${this.id}: Impossible de trouver les nœuds de départ/arrivée pour la requête de chemin. Start: ${!!startNode}, End: ${!!endNode}. Abandon.`);
            // Gérer l'échec de la requête AVANT la mise en file d'attente
             this.currentState = AgentState.IDLE; // Ou retourner à l'état précédent? IDLE est plus sûr.
             this.isVisible = false;
        }
    }
    // ==============================================================
    // FIN Méthode requestPath MODIFIÉE
    // ==============================================================


    // ==============================================================
    // Méthode setPath (appelée par AgentManager lorsque le chemin est prêt)
    // ==============================================================
    /**
     * Définit le chemin à suivre par l'agent. Appelé par AgentManager.
     * @param {Array<THREE.Vector3> | null} pathPoints - Liste des points du chemin ou null si échec.
     */
    setPath(pathPoints) {
        // Si le chemin reçu est valide
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0) {
            // Si on était en attente, on passe à l'état de déplacement approprié
            // (On déduit l'état cible basé sur la destination du chemin, si possible)
            // Note: Cette logique pourrait être affinée. On suppose que si on reçoit un chemin,
            // c'est qu'on avait demandé à aller quelque part.
            if (this.currentState === AgentState.WAITING_FOR_PATH) {
                 // On regarde si la destination du chemin est proche de la maison ou du travail
                 const destination = pathPoints[pathPoints.length - 1];
                 let goingToWork = false;
                 if (this.workPosition && destination.distanceToSquared(this.workPosition) < this.reachTolerance * this.reachTolerance * 4) {
                     goingToWork = true;
                 }
                 this.currentState = goingToWork ? AgentState.GOING_TO_WORK : AgentState.GOING_HOME;
                 console.log(`Agent ${this.id}: Path received. State transition -> ${this.currentState}`);
            } else {
                // Si on reçoit un chemin alors qu'on n'était pas en WAITING_FOR_PATH,
                // c'est peut-être une mise à jour de chemin? Log pour investigation.
                console.warn(`Agent ${this.id}: Received path while in state ${this.currentState}.`);
                // On pourrait décider de l'état basé sur la destination ici aussi.
            }

            this.path = pathPoints.map(p => p.clone()); // Cloner pour sécurité
            this.currentPathIndex = 0;

            // Orienter vers le premier segment du chemin (si possible)
            if (this.path.length > 1) {
                this._lookTarget.copy(this.path[1]);
                if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                    const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                    this.orientation.setFromRotationMatrix(lookMatrix);
                    this._targetOrientation.copy(this.orientation);
                }
            } else {
                // Chemin très court, on le termine presque immédiatement
                 if (this.path.length === 1) {
                    this.position.copy(this.path[0]);
                 }
                 this.path = null;
                 this.currentPathIndex = 0;
                 this.currentState = (this.currentState === AgentState.GOING_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME;
                 this.isVisible = false;
                 console.log(`Agent ${this.id}: Path was too short, transition to ${this.currentState}`);
            }
             this.isVisible = true; // Assurer la visibilité si on a un chemin à suivre

        } else {
            // Chemin invalide ou échec du pathfinding
            console.warn(`Agent ${this.id}: setPath received null or empty path.`);
            this.path = null;
            this.currentPathIndex = 0;
            // Si on attendait un chemin et qu'on reçoit null, retourner à l'état stable précédent.
            if (this.currentState === AgentState.WAITING_FOR_PATH) {
                // On ne sait pas où il voulait aller, on retourne à IDLE? Ou AT_HOME?
                // Retourner à l'état stable d'où il venait est plus logique.
                // Difficile à déterminer sans stocker l'état *avant* WAITING_FOR_PATH.
                // Pour l'instant, retour à IDLE pour la sécurité.
                this.currentState = AgentState.IDLE;
                console.warn(`Agent ${this.id}: Pathfinding failed, returning to IDLE state.`);
            }
            this.isVisible = false; // Cacher l'agent
        }
    }
    // ==============================================================
    // FIN Méthode setPath
    // ==============================================================
	update(deltaTime, currentHour) {
        // États inactifs ou en attente
        if (this.currentState === 'IDLE' || this.currentState === 'WAITING_FOR_PATH') {
            this.isVisible = (this.currentState === 'WAITING_FOR_PATH'); // Peut être utile de le voir s'il attend
            return;
        }

        // --- 1. Logique de changement d'état basée sur l'heure ---
        const previousState = this.currentState;
        switch (this.currentState) {
            case 'AT_HOME':
                this.isVisible = false;
                if (currentHour >= 8 && currentHour < 19 && this.workPosition && this.homeGridNode && this.workGridNode) {
                   this.requestPath(this.position, this.workPosition, this.homeGridNode, this.workGridNode);
                }
                break;
            case 'AT_WORK':
                this.isVisible = false;
                if ((currentHour >= 19 || currentHour < 8) && this.homePosition && this.workGridNode && this.homeGridNode) {
                    this.requestPath(this.position, this.homePosition, this.workGridNode, this.homeGridNode);
                }
                break;
        }

        // --- 2. Logique de déplacement (si en mouvement) ---
        if (this.currentState === 'GOING_TO_WORK' || this.currentState === 'GOING_HOME') {

            if (!this.path || this.currentPathIndex >= this.path.length) {
                 console.warn(`Agent ${this.id}: In moving state ${this.currentState} but no valid path.`);
                 this.currentState = (this.currentState === 'GOING_TO_WORK' && this.workPosition) ? 'AT_WORK' : 'AT_HOME';
                 this.isVisible = false;
                 this.path = null;
                 return;
            }

            this.isVisible = true;

            // --- Déplacement & Orientation (Mouvement Continu Sans Snap) ---
            const targetPathPoint = this.path[this.currentPathIndex];
            this._targetPosition.copy(targetPathPoint); // Cible pour CETTE frame

            const distanceToTargetSq = this.position.distanceToSquared(this._targetPosition);
            const distanceToTarget = Math.sqrt(distanceToTargetSq);
            const moveThisFrame = this.speed * (deltaTime / 1000);

            let hasArrived = false;

            // --- Mouvement ---
            if (distanceToTarget > 0.001) { // Se déplacer seulement si on n'est pas déjà exactement dessus
                this._direction.copy(this._targetPosition).sub(this.position).normalize();

                // Calculer le déplacement réel : ne pas dépasser la cible
                const actualMove = Math.min(moveThisFrame, distanceToTarget);
                this.position.addScaledVector(this._direction, actualMove);

                 // Mettre à jour la cible d'orientation vers la cible ACTUELLE
                 // pendant qu'on se déplace vers elle.
                this._lookTarget.copy(targetPathPoint);
                 if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                    const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                    this._targetOrientation.setFromRotationMatrix(lookMatrix);
                 }

                 // Vérifier si ce mouvement nous a fait arriver (ou presque)
                 // On utilise la distance *avant* le mouvement pour voir si on allait l'atteindre
                 if (distanceToTarget <= actualMove + this.reachTolerance) {
                     hasArrived = true;
                 }

            } else {
                 // Si on était déjà sur la cible (ou très proche), on considère qu'on est arrivé.
                 hasArrived = true;
            }
            // --- Fin Mouvement ---


            // --- Logique d'Arrivée et de Transition ---
            if (hasArrived) {
                // On est arrivé au point de chemin courant.
                this.currentPathIndex++; // Passer au point suivant

                // Vérifier si fin du chemin
                if (this.currentPathIndex >= this.path.length) {
                    // --- Chemin Terminé ---
                    // Placer exactement sur le dernier point pour la précision finale
                    this.position.copy(targetPathPoint);
                    const finalState = (this.currentState === 'GOING_TO_WORK') ? 'AT_WORK' : 'AT_HOME';
                    this.currentState = finalState;
                    this.isVisible = false;
                    this.path = null;
                    return; // Fin de l'update pour cet agent
                } else {
                    // --- Pas la fin : Mettre à jour la cible d'orientation pour viser le PROCHAIN point ---
                    // La position de l'agent est maintenant très proche de targetPathPoint.
                    const nextTargetPathPoint = this.path[this.currentPathIndex];
                    this._lookTarget.copy(nextTargetPathPoint);
                    if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                        const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                        this._targetOrientation.setFromRotationMatrix(lookMatrix);
                    }
                    // La rotation se fera progressivement via slerp dans les prochaines frames.
                }
            }
            // Si on n'est pas arrivé (hasArrived = false), _targetOrientation vise toujours
            // le point courant (défini pendant la phase Mouvement).


            // --- Interpolation d'Orientation (Slerp) ---
            // Toujours appliquée si l'agent est visible et en mouvement.
            if(this.isVisible) {
                const deltaSeconds = deltaTime / 1000;
                const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
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
        this.experience = null;
    }
}