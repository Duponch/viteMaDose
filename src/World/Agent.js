// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

const AgentState = {
    AT_HOME: 'AT_HOME',
    GOING_TO_WORK: 'GOING_TO_WORK',
    AT_WORK: 'AT_WORK',
    GOING_HOME: 'GOING_HOME',
    IDLE: 'IDLE',
    WAITING_FOR_PATH: 'WAITING_FOR_PATH',
};

export default class Agent {
    constructor(config, instanceId, experience) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) {
             throw new Error(`Agent ${this.id}: Experience instance is required!`);
        }
        this.experience = experience;
        this.scale = config.scale ?? 0.1;
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

        this.homeGridNode = null; // {x, y}
        this.workGridNode = null; // {x, y}

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
        // Utiliser la hauteur du trottoir depuis la config CityManager si navGraph n'est pas dispo (sécurité)
        const sidewalkHeight = navGraph ? navGraph.sidewalkHeight : (cityManager.config?.sidewalkHeight ?? 0.2);

        // --- Récupérer position domicile et NŒUD GRILLE ---
        const homeInfo = cityManager.getBuildingInfo(this.homeBuildingId);
        if (homeInfo) {
             // *** CORRECTION : Utiliser homeInfo.position directement ***
             // C'est la position enregistrée lors de la création du bâtiment,
             // qui est plus susceptible d'être près de l'entrée réelle.
             let baseHomePos = homeInfo.position.clone();
             baseHomePos.y = sidewalkHeight; // S'assurer qu'on est à la bonne hauteur

             if (navGraph) {
                 // Chercher le noeud marchable le plus proche de cette position
                 this.homeGridNode = navGraph.getClosestWalkableNode(baseHomePos);
                 if (this.homeGridNode) {
                    // Convertir le noeud trouvé en position monde pour le positionnement initial
                    this.homePosition = navGraph.gridToWorld(this.homeGridNode.x, this.homeGridNode.y);
                    // console.log(`Agent ${this.id}: Domicile ${this.homeBuildingId} -> Node (${this.homeGridNode.x},${this.homeGridNode.y}) Pos:`, this.homePosition.toArray().map(n=>n.toFixed(1)).join(','));
                 } else {
                     console.warn(`Agent ${this.id}: Pas de nœud NavGraph proche trouvé pour domicile ${this.homeBuildingId} à la position ${baseHomePos.x.toFixed(1)},${baseHomePos.z.toFixed(1)}. Utilisation position brute (peut causer problèmes).`);
                     // Utiliser la position brute comme fallback, mais l'agent risque de ne pas pouvoir bouger
                     this.homePosition = baseHomePos;
                     this.homeGridNode = null;
                 }
             } else {
                 // Fallback si pas de NavGraph (devrait pas arriver normalement)
                 this.homePosition = baseHomePos;
                 this.homeGridNode = null;
             }
             // Positionner l'agent à la position trouvée sur le NavGraph (ou la position brute en fallback)
             this.position.copy(this.homePosition);
             this.currentState = AgentState.AT_HOME;
             this.isVisible = false; // Commence caché à la maison

        } else {
            console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} non trouvées. Agent reste IDLE.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return; // Important de retourner ici si pas de domicile
        }

        // --- Récupérer position travail et NŒUD GRILLE ---
         const workInfo = cityManager.getBuildingInfo(this.workBuildingId);
         if (workInfo) {
             // *** CORRECTION : Utiliser workInfo.position directement ***
             let baseWorkPos = workInfo.position.clone();
             baseWorkPos.y = sidewalkHeight; // S'assurer qu'on est à la bonne hauteur

              if (navGraph) {
                  // Chercher le noeud marchable le plus proche
                  this.workGridNode = navGraph.getClosestWalkableNode(baseWorkPos);
                  if (this.workGridNode) {
                     // Convertir le noeud trouvé en position monde
                     this.workPosition = navGraph.gridToWorld(this.workGridNode.x, this.workGridNode.y);
                    //  console.log(`Agent ${this.id}: Travail ${this.workBuildingId} -> Node (${this.workGridNode.x},${this.workGridNode.y}) Pos:`, this.workPosition?.toArray().map(n=>n.toFixed(1)).join(','));
                  } else {
                      console.warn(`Agent ${this.id}: Pas de nœud NavGraph proche trouvé pour travail ${this.workBuildingId} à la position ${baseWorkPos.x.toFixed(1)},${baseWorkPos.z.toFixed(1)}.`);
                      this.workPosition = baseWorkPos; // Fallback
                      this.workGridNode = null;
                  }
              } else {
                  // Fallback si pas de NavGraph
                  this.workPosition = baseWorkPos;
                  this.workGridNode = null;
              }
         } else {
            console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} non trouvées.`);
            this.workPosition = null;
            this.workGridNode = null;
         }
         // Note: La position initiale de l'agent est déjà définie sur homePosition.
    }

    // ==============================================================
    // Méthode requestPath MODIFIÉE pour appeler le Worker via AgentManager
    // ==============================================================
    /**
     * Demande à l'AgentManager d'envoyer une requête de pathfinding au Worker.
     * Utilise les nœuds de grille pré-calculés si disponibles.
     * @param {THREE.Vector3} startPosWorld - Position de départ dans le monde.
     * @param {THREE.Vector3} endPosWorld - Position d'arrivée cible dans le monde.
     * @param {{x: number, y: number} | null} startNodeOverride - Nœud de départ pré-calculé (optionnel).
     * @param {{x: number, y: number} | null} endNodeOverride - Nœud d'arrivée pré-calculé (optionnel).
     */
    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null) {
        this.path = null;
        this.currentPathIndex = 0;
        this.currentState = AgentState.WAITING_FOR_PATH;
        this.isVisible = true; // Devient visible en attendant/partant

        const agentManager = this.experience.world?.agentManager;
        const navGraph = this.experience.world?.cityManager?.navigationGraph;

        if (!agentManager) {
            console.error(`Agent ${this.id}: AgentManager manquant pour la requête de chemin worker.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return;
        }
        if (!navGraph) {
            console.error(`Agent ${this.id}: NavigationGraph manquant pour déterminer les nœuds.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
             // Prévenir l'agent manager que le chemin a échoué ? Non, géré dans setPath(null)
            return;
        }

        // Déterminer les nœuds de départ et d'arrivée (inchangé)
        const startNode = startNodeOverride || navGraph.getClosestWalkableNode(startPosWorld);
        const endNode = endNodeOverride || navGraph.getClosestWalkableNode(endPosWorld);

        if (startNode && endNode) {
            // --- MODIFIÉ : Appeler la méthode de AgentManager pour envoyer au Worker ---
            agentManager.requestPathFromWorker(this.id, startNode, endNode);
            // console.log(`Agent ${this.id}: Path request sent to worker from node (${startNode.x},${startNode.y}) to node (${endNode.x},${endNode.y}). State: WAITING_FOR_PATH`);
            // -----------------------------------------------------------------------
        } else {
            console.error(`Agent ${this.id}: Impossible de trouver les nœuds de départ/arrivée pour la requête de chemin worker. Start: ${!!startNode}, End: ${!!endNode}. Abandon.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            // Pas besoin d'appeler setPath(null) ici, car la requête n'a jamais été envoyée au worker
        }
    }
    // ==============================================================
    // FIN Méthode requestPath MODIFIÉE
    // ==============================================================


    // ==============================================================
    // Méthode setPath (INCHANGÉE - appelée par AgentManager lorsque le worker répond)
    // ==============================================================
    /**
     * Définit le chemin à suivre par l'agent. Appelé par AgentManager.
     * @param {Array<THREE.Vector3> | null} pathPoints - Liste des points du chemin (en coordonnées monde) ou null si échec.
     */
    setPath(pathPoints) {
        // Si le chemin reçu est valide
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0) {
            // Logique de transition d'état (inchangée)
             if (this.currentState === AgentState.WAITING_FOR_PATH) {
                 const destination = pathPoints[pathPoints.length - 1];
                 let goingToWork = false;
                 // Utiliser une tolérance plus grande pour la comparaison de fin de chemin
                 if (this.workPosition && destination.distanceToSquared(this.workPosition) < this.reachTolerance * this.reachTolerance * 9) { // x9 = 3x tolerance
                     goingToWork = true;
                 } else if (!this.homePosition || destination.distanceToSquared(this.homePosition) >= this.reachTolerance * this.reachTolerance * 9) {
                     // Si ce n'est pas proche du travail ET pas proche de la maison (ou si maison inconnue)
                     // console.warn(`Agent ${this.id}: Path destination doesn't match known home/work. Destination:`, destination.toArray(), "Work:", this.workPosition?.toArray(), "Home:", this.homePosition?.toArray());
                 }
                 this.currentState = goingToWork ? AgentState.GOING_TO_WORK : AgentState.GOING_HOME;
                 // console.log(`Agent ${this.id}: Path received. State transition -> ${this.currentState}`);
            } else {
                console.warn(`Agent ${this.id}: Received path while in state ${this.currentState}. Overwriting path.`);
            }

            this.path = pathPoints.map(p => p.clone());
            this.currentPathIndex = 0;
            this.isVisible = true; // Assurer la visibilité

            // Orienter vers le premier segment (inchangé)
            if (this.path.length > 1) {
                this._lookTarget.copy(this.path[1]);
                // Vérifier distance avant lookAt pour éviter NaN si position == lookTarget
                 if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                     // Utiliser lookAt pour obtenir la matrice, puis extraire la quaternion
                     const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                     // Définir directement l'orientation actuelle et cible
                     this.orientation.setFromRotationMatrix(lookMatrix);
                     this._targetOrientation.copy(this.orientation);
                 }
            } else {
                // Chemin trop court (inchangé)
                 if (this.path.length === 1) { this.position.copy(this.path[0]); }
                 this.path = null;
                 this.currentPathIndex = 0;
                 this.currentState = (this.currentState === AgentState.GOING_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME;
                 this.isVisible = false;
                 // console.log(`Agent ${this.id}: Path was too short, transition to ${this.currentState}`);
            }

        } else {
            // Chemin invalide ou échec du pathfinding
            console.warn(`Agent ${this.id}: setPath received null or empty path.`);
            this.path = null;
            this.currentPathIndex = 0;

            // Si on attendait un chemin et qu'on reçoit null, retourner à un état stable
            if (this.currentState === AgentState.WAITING_FOR_PATH) {
                // Retourner à la maison semble le plus sûr s'il en a une, sinon IDLE
                 this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
                 console.warn(`Agent ${this.id}: Pathfinding failed or path invalid, returning to ${this.currentState} state.`);
                 this.isVisible = (this.currentState !== AgentState.AT_HOME && this.currentState !== AgentState.AT_WORK); // Cacher si AT_HOME/AT_WORK
            } else {
                 // Si on reçoit null alors qu'on n'attendait pas, c'est étrange
                 console.warn(`Agent ${this.id}: Received null path while not waiting. Current state: ${this.currentState}`);
                 // Ne pas changer l'état ici, car il était peut-être déjà en IDLE ou autre
            }
             this.isVisible = (this.currentState !== AgentState.AT_HOME && this.currentState !== AgentState.AT_WORK); // Cacher si AT_HOME/AT_WORK
        }
    }
    // ==============================================================
    // FIN Méthode setPath
    // ==============================================================

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