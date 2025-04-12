// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

// --- NOUVEAU : États possibles ---
const AgentState = {
    AT_HOME: 'AT_HOME',
    GOING_TO_WORK: 'GOING_TO_WORK',
    AT_WORK: 'AT_WORK',
    GOING_HOME: 'GOING_HOME',
    IDLE: 'IDLE', // État initial ou si pas de domicile/travail
};

export default class Agent {
    /**
     * Représente l'état logique d'un agent. Ne contient pas d'objets Three.js.
     * Géré par AgentManager pour le rendu instancié.
     * @param {object} config - Contient les paramètres initiaux (speed, scale, torsoColor).
     * @param {number} instanceId - L'index de cet agent dans les InstancedMesh.
     */
	constructor(config, instanceId, experience) { // <-- Ajout experience
        this.id = `citizen_${nextAgentId++}`; // ID unique du citoyen
        this.instanceId = instanceId; // ID pour InstancedMesh

        // --- Références & Config ---
        if (!experience) {
             throw new Error(`Agent ${this.id}: Experience instance is required!`);
        }
        this.experience = experience; // Pour accéder au temps, pathfinder etc.
        this.scale = 2; // Utiliser config.agentScale si possible
        this.speed = config.speed ?? 1.5;
        this.rotationSpeed = config.rotationSpeed ?? 8.0;
        this.yOffset = config.yOffset ?? 0.3; // Stocker l'offset vertical
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.2; // Tolérance pour atteindre un point

        // --- État de l'agent ---
        // La position initiale sera définie dans initializeLifecycle
        this.position = new THREE.Vector3(0, this.yOffset, 0); // Position logique initiale (sera écrasée)
        this.orientation = new THREE.Quaternion();
        this.isVisible = false; // Devient visible seulement en déplacement

        // --- NOUVEAU : Cycle de vie ---
        this.currentState = AgentState.IDLE; // Commence en IDLE
        this.homeBuildingId = null; // Sera défini par AgentManager/World
        this.workBuildingId = null; // Sera défini par AgentManager/World
        this.homePosition = null;   // Sera récupéré du CityManager
        this.workPosition = null;   // Sera récupéré du CityManager
        // ------------------------------

        // --- État du chemin ---
        this.path = null;
        this.currentPathIndex = 0;

        // --- Cibles internes (inchangé) ---
        this._targetPosition = new THREE.Vector3();
        this._direction = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3();
        this._targetOrientation = new THREE.Quaternion(); // Pour le slerp
    }

	initializeLifecycle(homeId, workId) {
        this.homeBuildingId = homeId;
        this.workBuildingId = workId;

        const cityManager = this.experience.world?.cityManager;
        if (!cityManager || !this.experience.world) { // Vérifier aussi world
            console.error(`Agent ${this.id}: CityManager ou World non trouvé pour initialiser positions.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return;
        }

        const navGraph = cityManager.getNavigationGraph();
        const sidewalkHeight = navGraph ? navGraph.sidewalkHeight : (this.config?.sidewalkHeight ?? 0.2); // Hauteur du trottoir

        // --- Récupérer position domicile ---
        const homeInfo = cityManager.getBuildingInfo(this.homeBuildingId);
        if (homeInfo) {
             const homePlot = cityManager.getPlots().find(p => p.id === homeInfo.plotId);
             if (homePlot) {
                 // Utiliser getEntryPoint pour obtenir une position de base sur le trottoir
                 this.homePosition = homePlot.getEntryPoint(sidewalkHeight);
                 // Optionnel : trouver le nœud le plus proche sur le navGraph
                 if (navGraph) {
                     const closestNode = navGraph.getClosestWalkableNode(this.homePosition);
                     if (closestNode) {
                        this.homePosition = navGraph.gridToWorld(closestNode.x, closestNode.y);
                     } else {
                         console.warn(`Agent ${this.id}: Pas de nœud NavGraph proche trouvé pour domicile ${this.homeBuildingId} à ${this.homePosition.toArray().map(n=>n.toFixed(1)).join(',')}. Utilisation position plot.`);
                     }
                 }
             } else {
                 this.homePosition = homeInfo.position.clone(); // Fallback position enregistrée
                 this.homePosition.y = sidewalkHeight; // Assurer hauteur
                 console.warn(`Agent ${this.id}: Plot ${homeInfo.plotId} non trouvé pour domicile. Utilisation position brute.`);
             }
             this.position.copy(this.homePosition); // Placer l'agent à son domicile
             this.currentState = AgentState.AT_HOME; // Prêt à commencer le cycle
             this.isVisible = false; // Commence caché à la maison
             console.log(`Agent ${this.id} initialisé à la maison ${this.homeBuildingId} Pos:`, this.homePosition.toArray().map(n=>n.toFixed(1)).join(','));

        } else {
            console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} non trouvées. Agent reste IDLE.`);
            this.currentState = AgentState.IDLE; // Reste inactif si pas de maison
            this.isVisible = false;
            return; // Sortir si pas de domicile
        }

        // --- Récupérer position travail ---
         const workInfo = cityManager.getBuildingInfo(this.workBuildingId);
         if (workInfo) {
             const workPlot = cityManager.getPlots().find(p => p.id === workInfo.plotId);
              if (workPlot) {
                  this.workPosition = workPlot.getEntryPoint(sidewalkHeight);
                  if (navGraph) {
                      const closestNode = navGraph.getClosestWalkableNode(this.workPosition);
                      if (closestNode) {
                         this.workPosition = navGraph.gridToWorld(closestNode.x, closestNode.y);
                      } else {
                          console.warn(`Agent ${this.id}: Pas de nœud NavGraph proche trouvé pour travail ${this.workBuildingId} à ${this.workPosition.toArray().map(n=>n.toFixed(1)).join(',')}. Utilisation position plot.`);
                      }
                  }
              } else {
                  this.workPosition = workInfo.position.clone(); // Fallback
                  this.workPosition.y = sidewalkHeight; // Assurer hauteur
                  console.warn(`Agent ${this.id}: Plot ${workInfo.plotId} non trouvé pour travail. Utilisation position brute.`);
              }
              console.log(`Agent ${this.id}: Lieu de travail ${this.workBuildingId} Pos:`, this.workPosition?.toArray().map(n=>n.toFixed(1)).join(','));
         } else {
            console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} non trouvées. Routine potentiellement limitée.`);
            // L'agent a une maison mais pas de travail assigné, il restera AT_HOME.
         }
    }

    setPath(pathPoints) {
        // Vérifier si pathPoints est valide et contient au moins un point
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0) {
            this.path = pathPoints.map(p => p.clone()); // Cloner pour éviter modifs externes
            this.currentPathIndex = 0; // Toujours commencer au début du nouveau chemin

            // La position actuelle de l'agent (this.position) est déjà correcte
            // (soit homePosition soit workPosition avant l'appel à requestPath).
            // On n'a PAS besoin de faire this.position.copy(this.path[0]);

            // Orienter vers le *premier segment* du chemin (point 1 si existe)
            if (this.path.length > 1) {
                this._lookTarget.copy(this.path[1]);
                // S'assurer qu'on ne regarde pas exactement la position actuelle
                if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                    const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                    this.orientation.setFromRotationMatrix(lookMatrix);
                    this._targetOrientation.copy(this.orientation); // Initialiser la cible slerp
                } else {
                    // Si le premier segment est très court, regarder vers le point 2 ?
                    // Pour l'instant, on garde l'orientation précédente.
                }
            } else {
                // Chemin d'un seul point (ne devrait pas arriver avec requestPath A->B)
                // Considérer le chemin comme terminé immédiatement.
                this.position.copy(this.path[0]); // Aller au point unique
                this.path = null;
                this.currentPathIndex = 0;
                 // L'état (AT_HOME / AT_WORK) sera mis à jour dans le prochain appel à update()
            }
        } else {
            // Chemin invalide fourni
            console.warn(`Agent ${this.id}: setPath a reçu un chemin invalide.`);
            this.path = null;
            this.currentPathIndex = 0;
        }
    }

    update(deltaTime, currentHour) { // Prend l'heure actuelle (0-23)

        // Ne rien faire si l'agent est inactif
        if (this.currentState === AgentState.IDLE) {
            this.isVisible = false;
            return;
        }

        // --- 1. Logique de changement d'état basée sur l'heure ---
        const previousState = this.currentState; // Pour détecter les transitions

        switch (this.currentState) {
            case AgentState.AT_HOME:
                this.isVisible = false; // Assurer qu'il est caché
                // Condition pour partir : être entre 8h et 18h (inclus) ET avoir un lieu de travail
                if (currentHour >= 8 && currentHour < 19 && this.workPosition) {
                   console.log(`Agent ${this.id}: [AT_HOME -> GOING_TO_WORK] (Heure: ${currentHour})`);
                   this.currentState = AgentState.GOING_TO_WORK;
                   this.isVisible = true; // Devient visible en partant
                   this.requestPath(this.position, this.workPosition); // Demande le chemin
                }
                break;

            case AgentState.GOING_TO_WORK:
                this.isVisible = true; // Est visible pendant le trajet
                // La logique de déplacement (section 2) s'applique
                // Pas de changement d'état basé sur l'heure ici
                break;

            case AgentState.AT_WORK:
                this.isVisible = false; // Caché au travail
                // Condition pour rentrer : être 19h ou plus OU avant 8h ET avoir un domicile
                if ((currentHour >= 19 || currentHour < 8) && this.homePosition) {
                    console.log(`Agent ${this.id}: [AT_WORK -> GOING_HOME] (Heure: ${currentHour})`);
                    this.currentState = AgentState.GOING_HOME;
                    this.isVisible = true; // Devient visible en partant
                    this.requestPath(this.position, this.homePosition); // Demande le chemin
                }
                break;

            case AgentState.GOING_HOME:
                this.isVisible = true; // Visible pendant le trajet
                // La logique de déplacement (section 2) s'applique
                // Pas de changement d'état basé sur l'heure ici
                break;

            // L'état IDLE est géré au début
        }

        // --- 2. Logique de déplacement (uniquement si en mouvement) ---
        if (this.currentState === AgentState.GOING_TO_WORK || this.currentState === AgentState.GOING_HOME) {

            // Si pas de chemin (calcul échoué ou terminé prématurément)
            if (!this.path || this.currentPathIndex >= this.path.length) {
                 // Si on était censé bouger mais qu'on n'a pas/plus de chemin,
                 // on retourne à l'état précédent (caché)
                 console.warn(`Agent ${this.id}: En état ${this.currentState} mais sans chemin valide. Retour à l'état stable.`);
                 if (this.currentState === AgentState.GOING_TO_WORK) {
                     this.currentState = AgentState.AT_WORK; // Supposer arrivé si près? Non, retour maison? AT_WORK est plus logique.
                     if(this.workPosition) this.position.copy(this.workPosition); // Aller à la destination
                 } else { // GOING_HOME
                     this.currentState = AgentState.AT_HOME;
                      if(this.homePosition) this.position.copy(this.homePosition);
                 }
                 this.isVisible = false;
                 this.path = null;
                 return; // Fin de l'update pour cet agent
            }

            // --- Déplacement & Orientation ---
            const targetPathPoint = this.path[this.currentPathIndex];
            this._targetPosition.copy(targetPathPoint); // La cible est le point actuel du chemin

            const distanceToTarget = this.position.distanceTo(this._targetPosition);
            const moveThisFrame = this.speed * (deltaTime / 1000); // Calcul du déplacement pour ce frame

            // Vérifier si on atteint ou dépasse la cible dans ce frame
            if (distanceToTarget <= moveThisFrame + this.reachTolerance) { // Utiliser la tolérance ici
                // Atteint (ou très proche) du point courant
                this.position.copy(targetPathPoint); // Aller exactement au point
                this.currentPathIndex++; // Passer au point suivant

                // Vérifier si c'était le dernier point du chemin
                if (this.currentPathIndex >= this.path.length) {
                    // --- Chemin Terminé ---
                    if (this.currentState === AgentState.GOING_TO_WORK) {
                         console.log(`Agent ${this.id}: [GOING_TO_WORK -> AT_WORK] Chemin terminé.`);
                         this.currentState = AgentState.AT_WORK;
                         this.isVisible = false; // Disparaît en arrivant
                    } else if (this.currentState === AgentState.GOING_HOME) {
                         console.log(`Agent ${this.id}: [GOING_HOME -> AT_HOME] Chemin terminé.`);
                         this.currentState = AgentState.AT_HOME;
                         this.isVisible = false; // Disparaît en arrivant
                    }
                    this.path = null; // Nettoyer le chemin
                    return; // Fin de l'update pour cet agent
                    // --- Fin Chemin Terminé ---
                } else {
                     // Ce n'était pas le dernier point, orienter vers le NOUVEAU point suivant
                     const nextTargetPathPoint = this.path[this.currentPathIndex];
                     this._lookTarget.copy(nextTargetPathPoint);
                     if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                        const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                        this._targetOrientation.setFromRotationMatrix(lookMatrix); // Définir la NOUVELLE orientation cible
                     }
                      // Si trop proche, on garde l'orientation précédente (gérée par slerp)
                }
            } else {
                // Pas encore atteint : Déplacement normal vers le point courant
                this._direction.copy(this._targetPosition).sub(this.position).normalize();
                this.position.addScaledVector(this._direction, moveThisFrame);

                // Orienter vers le point courant pendant le déplacement
                this._lookTarget.copy(targetPathPoint);
                 if (this.position.distanceToSquared(this._lookTarget) > 0.0001) {
                    const lookMatrix = new THREE.Matrix4().lookAt(this.position, this._lookTarget, new THREE.Vector3(0, 1, 0));
                    this._targetOrientation.setFromRotationMatrix(lookMatrix); // Mettre à jour l'orientation cible
                 }
                  // Si trop proche, on garde l'orientation précédente (gérée par slerp)
            }

            // Appliquer l'interpolation Slerp pour une rotation fluide (toujours appliqué si en mouvement)
            const deltaSeconds = deltaTime / 1000;
            // Ajuster alpha pour que la rotation soit plus rapide ou plus lente (1.0 = instantané, ~0.1 = lent)
            // Un alpha basé sur le temps assure une vitesse constante quel que soit le framerate
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
            this.orientation.slerp(this._targetOrientation, slerpAlpha);
            // --------------------------------------------------------------------

        } // Fin if (en déplacement)

    } // Fin de la méthode update

	requestPath(startPos, endPos) {
		// Vérifier si start et end sont valides
		if (!startPos || !endPos) {
			console.error(`Agent ${this.id}: Demande de chemin avec position de départ ou d'arrivée invalide.`);
			this.path = null; this.isVisible = false; // Sécurité: cacher l'agent
			if (this.currentState === AgentState.GOING_TO_WORK) this.currentState = AgentState.AT_HOME;
			if (this.currentState === AgentState.GOING_HOME) this.currentState = AgentState.AT_WORK;
			return;
		}

		// Accéder au pathfinder via l'expérience
		const pathfinder = this.experience.world?.cityManager?.getPathfinder();
		if (pathfinder) {
			console.log(`Agent ${this.id}: Demande chemin: ${startPos.toArray().map(n=>n.toFixed(1)).join(',')} -> ${endPos.toArray().map(n=>n.toFixed(1)).join(',')}`);
			console.time(`Pathfinding_Agent_${this.id}`); // Mesurer le temps
			// Cloner les positions pour éviter de modifier les originales
			const path = pathfinder.findPath(startPos.clone(), endPos.clone());
			console.timeEnd(`Pathfinding_Agent_${this.id}`);

			if (path && path.length > 0) {
				console.log(`Agent ${this.id}: Chemin trouvé (${path.length} points).`);

				// --- Correction : Le chemin de pathfinding-js inclut déjà le startNode (point le plus proche)
				// mais pas nécessairement le startPos *exact*. On préfixe avec le startPos exact pour démarrer en douceur.
				// Si le premier point du chemin trouvé est très proche du startPos, on peut l'ignorer.
				let finalPath = path;
				if (startPos.distanceToSquared(path[0]) > 0.01) { // Si le premier point est différent
					finalPath = [startPos.clone(), ...path]; // Ajouter le point de départ exact au début
				}
				// --- Fin Correction ---

				this.setPath(finalPath); // Donner le chemin à l'agent

				// --- Visualisation Debug Optionnelle (via World) ---
				const world = this.experience.world;
				if (world && world.setAgentPathForAgent) {
					 //world.setAgentPathForAgent(this, finalPath, this.debugPathColor);
				}
				// -------------------------------------------------

			} else {
				console.warn(`Agent ${this.id}: Aucun chemin trouvé vers la destination.`);
				this.path = null;
				// Retourner à l'état stable et se cacher
				if (this.currentState === AgentState.GOING_TO_WORK) this.currentState = AgentState.AT_HOME;
				if (this.currentState === AgentState.GOING_HOME) this.currentState = AgentState.AT_WORK;
				this.isVisible = false;
			}
		} else {
			console.error(`Agent ${this.id}: Pathfinder non disponible.`);
			this.path = null;
			this.isVisible = false; // Sécurité
			if (this.currentState === AgentState.GOING_TO_WORK) this.currentState = AgentState.AT_HOME;
			if (this.currentState === AgentState.GOING_HOME) this.currentState = AgentState.AT_WORK;
		}
   }

    // Pas de méthode destroy complexe nécessaire, c'est juste un objet de données
	destroy() {
        this.path = null;
        this.homePosition = null;
        this.workPosition = null;
        this.experience = null; // Libérer la référence à l'expérience
        // console.log(`Agent logique ${this.id} détruit.`);
    }
}