// src/World/Agent.js
import * as THREE from 'three';

let nextAgentId = 0;

const AgentState = {
    AT_HOME: 'AT_HOME',
    // PREPARING_TO_LEAVE_FOR_WORK: 'PREPARING_TO_LEAVE_FOR_WORK', // Simplifié pour l'instant
    REQUESTING_ABSTRACT_PATH: 'REQUESTING_ABSTRACT_PATH', // Nouvelle étape HPA
    REQUESTING_DETAIL_PATH: 'REQUESTING_DETAIL_PATH',     // Nouvelle étape HPA (remplace WAITING/REQUESTING)
    // READY_TO_LEAVE_FOR_WORK: 'READY_TO_LEAVE_FOR_WORK', // Fusionné dans la logique post-réception de chemin
    IN_TRANSIT_TO_WORK: 'IN_TRANSIT_TO_WORK',
    AT_WORK: 'AT_WORK',
    // PREPARING_TO_LEAVE_FOR_HOME: 'PREPARING_TO_LEAVE_FOR_HOME', // Simplifié
    // READY_TO_LEAVE_FOR_HOME: 'READY_TO_LEAVE_FOR_HOME', // Fusionné
    IN_TRANSIT_TO_HOME: 'IN_TRANSIT_TO_HOME',
    IDLE: 'IDLE', // Pour les agents non initialisés ou en erreur
};

export default class Agent {
    constructor(config, instanceId, experience) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) { throw new Error(`Agent ${this.id}: Experience instance is required!`); }
        this.experience = experience;

        // --- Propriétés Configuration & Base (inchangées) ---
        this.scale = config.scale ?? 0.1;
        this.agentBaseSpeed = (config.speed ?? 1.5);
        this.visualSpeed = this.agentBaseSpeed * (0.9 + Math.random() * 0.2);
        this.rotationSpeed = config.rotationSpeed ?? 8.0;
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.5;
        this.reachToleranceSq = this.reachTolerance * this.reachTolerance;

        // --- Position & Orientation (Visuel - inchangées) ---
        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false;

        // --- État & Planification (inchangées) ---
        this.currentState = AgentState.IDLE;
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        this.homeZoneId = -1; // <- AJOUT HPA : ID de la zone HPA (District ID) du domicile
        this.workZoneId = -1; // <- AJOUT HPA : ID de la zone HPA (District ID) du travail

        // --- Trajet Actuel (MODIFIÉ pour HPA) ---
        /** @type {Array<{id: number, zoneId: number, x: number, y: number}> | null} */
        this.abstractPathGates = null;          // Séquence de portes HPA pour le trajet actuel
        this.currentAbstractPathIndex = -1;     // Index de la PROCHAINE porte à atteindre dans abstractPathGates
        /** @type {Array<THREE.Vector3> | null} */
        this.currentDetailPathPoints = null;    // Chemin détaillé ACTUEL (segment start->g1, g1->g2, etc.)
        this.currentDetailPathIndexVisual = 0;  // Index dans le chemin détaillé actuel pour le visuel
        this.currentDetailPathLengthWorld = 0;  // Longueur du segment détaillé actuel
        // Propriétés pour le calcul de la durée du segment actuel
        this.calculatedSegmentDurationGame = 0; // Durée estimée pour le segment détaillé actuel
        this.segmentDepartureTimeGame = -1;     // Heure de départ pour le segment détaillé actuel
        this.segmentArrivalTimeGame = -1;       // Heure d'arrivée estimée pour le segment détaillé actuel
        this.visualInterpolationProgress = 0;   // Progression visuelle sur le segment actuel (0-1)
        // --- FIN MODIFICATION HPA ---

        // --- Heures & Délais (inchangées) ---
        this.departureWorkHour = 8;
        this.departureHomeHour = 19;
        this.anticipationMinutes = 5;
        this.prepareWorkDepartureTimeGame = -1;
        this.prepareHomeDepartureTimeGame = -1;
        this.exactWorkDepartureTimeGame = -1;
        this.exactHomeDepartureTimeGame = -1;
        this.lastArrivalTimeHome = 0;
        this.lastArrivalTimeWork = -1;
        this.requestedPathForDepartureTime = -1;

        // --- Animation Visuelle (inchangée) ---
        this.currentAnimationMatrix = { /* ... */ };

        // --- Variables temporaires (inchangées) ---
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempMatrix = new THREE.Matrix4();

        this._calculateScheduledTimes();
    }

	_calculateScheduledTimes() {
        const environment = this.experience.world?.environment;
        if (!environment || !environment.isInitialized || environment.dayDurationMs <= 0) {
             console.warn(`Agent ${this.id}: Impossible de calculer les heures planifiées (env non prêt).`);
             return;
        }
        const dayDurationMs = environment.dayDurationMs;
        const msPerHour = dayDurationMs / 24;
        const msPerMinute = msPerHour / 60;

        // Heure exacte de départ travail (ex: 8h00)
        this.exactWorkDepartureTimeGame = this.departureWorkHour * msPerHour;
        // Heure d'anticipation pour demander le chemin (ex: 7h55)
        this.prepareWorkDepartureTimeGame = this.exactWorkDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
         // Gérer le cas où l'anticipation passe au jour précédent (modulo)
         if (this.prepareWorkDepartureTimeGame < 0) {
             this.prepareWorkDepartureTimeGame += dayDurationMs;
         }

        // Heure exacte de départ maison (ex: 19h00)
        this.exactHomeDepartureTimeGame = this.departureHomeHour * msPerHour;
        // Heure d'anticipation pour demander le chemin (ex: 18h55)
        this.prepareHomeDepartureTimeGame = this.exactHomeDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
         // Gérer le modulo
         if (this.prepareHomeDepartureTimeGame < 0) {
             this.prepareHomeDepartureTimeGame += dayDurationMs;
         }

         // console.log(`Agent <span class="math-inline">\{this\.id\} Scheduled Times \(ms\)\: PrepareWork\=</span>{this.prepareWorkDepartureTimeGame.toFixed(0)}, DepartWork=<span class="math-inline">\{this\.exactWorkDepartureTimeGame\.toFixed\(0\)\}, PrepareHome\=</span>{this.prepareHomeDepartureTimeGame.toFixed(0)}, DepartHome=${this.exactHomeDepartureTimeGame.toFixed(0)}`);
    }

	/**
     * Initialise les informations vitales de l'agent (domicile, travail)
     * et le place à son domicile. Récupère aussi les IDs des zones HPA.
     * @param {string} homeId - ID de l'instance du bâtiment domicile.
     * @param {string} workId - ID de l'instance du bâtiment travail.
     */
    initializeLifecycle(homeId, workId) {
        this.homeBuildingId = homeId;
        this.workBuildingId = workId;
        const cityManager = this.experience.world?.cityManager;
        const navGraph = cityManager?.getNavigationGraph();
        const districtManager = cityManager?.districtManager; // Besoin pour trouver le district d'une plot
        const sidewalkHeight = navGraph?.sidewalkHeight ?? cityManager?.config?.sidewalkHeight ?? 0.2;

        // Reset état et chemins
        this.currentState = AgentState.IDLE;
        this.abstractPathGates = null;
        this.currentDetailPathPoints = null;
        this.isVisible = false;

        // Trouver infos Domicile, Nœud Grille et Zone ID
        const homeInfo = cityManager?.getBuildingInfo(this.homeBuildingId);
        if (homeInfo && navGraph) {
            let baseHomePos = homeInfo.position.clone();
            baseHomePos.y = sidewalkHeight; // Utiliser la hauteur du trottoir pour le pathfinding
            this.homeGridNode = navGraph.getClosestWalkableNode(baseHomePos); // Peut être null

            if (this.homeGridNode) {
                 this.homePosition = navGraph.gridToWorld(this.homeGridNode.x, this.homeGridNode.y);
                 // Trouver le District ID (Zone ID)
                 const homePlot = cityManager.getPlots().find(p => p.id === homeInfo.plotId);
                 this.homeZoneId = homePlot?.districtId ?? -1; // Stocker l'ID du district
                 if (this.homeZoneId === -1 || this.homeZoneId === null) { // Vérifier null aussi
                     console.warn(`Agent ${this.id}: Impossible de trouver le district pour le domicile (Plot ${homeInfo.plotId}).`);
                 }
            } else {
                 console.warn(`Agent ${this.id}: Pas de nœud grille marchable trouvé près du domicile ${this.homeBuildingId}. Utilisation position brute.`);
                 this.homePosition = baseHomePos; // Fallback à la position du bâtiment
                 this.homeZoneId = -1; // Marquer comme zone inconnue
            }

            // Position initiale visuelle
            this.position.copy(this.homePosition);
            this.position.y += this.yOffset; // Appliquer l'offset Y pour le visuel
            this.currentState = AgentState.AT_HOME; // Mettre à jour l'état initial
            this.isVisible = false; // Reste caché au début

        } else {
            console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} ou NavGraph non trouvées lors de l'initialisation.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            // Ne pas continuer si le domicile est invalide
            return;
        }

        // Trouver infos Travail, Nœud Grille et Zone ID
        const workInfo = cityManager?.getBuildingInfo(this.workBuildingId);
        if (workInfo && navGraph) {
            let baseWorkPos = workInfo.position.clone();
            baseWorkPos.y = sidewalkHeight;
            this.workGridNode = navGraph.getClosestWalkableNode(baseWorkPos); // Peut être null

            if (this.workGridNode) {
                 this.workPosition = navGraph.gridToWorld(this.workGridNode.x, this.workGridNode.y);
                  // Trouver le District ID (Zone ID)
                 const workPlot = cityManager.getPlots().find(p => p.id === workInfo.plotId);
                 this.workZoneId = workPlot?.districtId ?? -1;
                  if (this.workZoneId === -1 || this.workZoneId === null) {
                     console.warn(`Agent ${this.id}: Impossible de trouver le district pour le travail (Plot ${workInfo.plotId}).`);
                 }
            } else {
                console.warn(`Agent ${this.id}: Pas de nœud grille marchable trouvé près du travail ${this.workBuildingId}. Utilisation position brute.`);
                this.workPosition = baseWorkPos;
                this.workZoneId = -1;
            }
        } else {
            console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} ou NavGraph non trouvées.`);
            this.workPosition = null;
            this.workGridNode = null;
            this.workZoneId = -1;
        }

        // (Ré)Calculer les temps planifiés
        this._calculateScheduledTimes();

        // console.log(`Agent ${this.id}: Initialized. HomeZone: ${this.homeZoneId}, WorkZone: ${this.workZoneId}`);
    }

    /**
     * Demande un chemin HPA (abstrait puis détaillé, ou directement détaillé si intra-zone).
     * @param {THREE.Vector3} startPosWorld - Position de départ actuelle dans le monde.
     * @param {THREE.Vector3} endPosWorld - Position de destination finale dans le monde.
     * @param {number} startZoneId - ID de la zone HPA de départ.
     * @param {number} endZoneId - ID de la zone HPA de destination.
     * @param {{x: number, y: number} | null} startGridNode - Nœud grille de départ (peut être null).
     * @param {{x: number, y: number} | null} endGridNode - Nœud grille de destination (peut être null).
     * @param {boolean} isGoingToWork - True si le trajet est vers le travail, false si vers la maison.
     */
    requestPathHPA(startPosWorld, endPosWorld, startZoneId, endZoneId, startGridNode, endGridNode, isGoingToWork) {
        // Réinitialiser les chemins précédents
        this._resetPathData();

        const agentManager = this.experience.world?.agentManager;
        const navGraph = this.experience.world?.cityManager?.getNavigationGraph();
        const abstractGraph = this.experience.world?.cityManager?.getAbstractGraph(); // Récupérer le graphe HPA

        // Vérifications préliminaires
        if (!agentManager || !navGraph || !abstractGraph || !startPosWorld || !endPosWorld || startZoneId < 0 || endZoneId < 0) {
            console.error(`Agent ${this.id}: Dépendances manquantes ou IDs de zone invalides pour requestPathHPA. ` +
                          `AgentMgr: ${!!agentManager}, NavGraph: ${!!navGraph}, AbstractGraph: ${!!abstractGraph}, ` +
                          `StartZone: ${startZoneId}, EndZone: ${endZoneId}`);
            this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Retour état stable
            this.isVisible = false;
            return;
        }

        // --- CAS 1: Départ et Arrivée dans la MÊME Zone ---
        if (startZoneId === endZoneId) {
            console.log(`Agent ${this.id}: Trajet intra-zone (Zone ${startZoneId}). Demande de chemin détaillé direct.`);
            const finalStartNode = startGridNode ?? navGraph.getClosestWalkableNode(startPosWorld);
            const finalEndNode = endGridNode ?? navGraph.getClosestWalkableNode(endPosWorld);

            if (finalStartNode && finalEndNode) {
                this.currentState = AgentState.REQUESTING_DETAIL_PATH; // Nouvel état d'attente unique
                this.isVisible = false; // Cacher pendant l'attente
                agentManager.requestPathFromWorker(this.id, 'findDetailPath', {
                    startNode: finalStartNode,
                    endNode: finalEndNode
                });
            } else {
                console.error(`Agent ${this.id}: Nœuds grille invalides pour trajet intra-zone. Start:`, finalStartNode, "End:", finalEndNode);
                this.currentState = isGoingToWork ? AgentState.AT_HOME : AgentState.AT_WORK; // Retour état précédent
                this.isVisible = false;
            }
            return; // Fin du traitement pour intra-zone
        }

        // --- CAS 2: Départ et Arrivée dans des Zones DIFFÉRENTES ---
        console.log(`Agent ${this.id}: Trajet inter-zones (${startZoneId} -> ${endZoneId}). Recherche des portes et chemin abstrait.`);
        this.currentState = AgentState.REQUESTING_ABSTRACT_PATH; // Attente du chemin HPA
        this.isVisible = false; // Cacher pendant l'attente

        // 2a. Trouver la porte la plus proche dans la zone de départ
        const startGate = this._findNearestGate(startPosWorld, startZoneId, abstractGraph, navGraph);
        // 2b. Trouver la porte la plus proche dans la zone d'arrivée
        const endGate = this._findNearestGate(endPosWorld, endZoneId, abstractGraph, navGraph);

        if (startGate && endGate) {
             // console.log(`Agent ${this.id}: Portes trouvées: StartGate ${startGate.id} (Zone ${startZoneId}), EndGate ${endGate.id} (Zone ${endZoneId})`);
            // 2c. Demander le chemin abstrait entre ces portes au worker
            agentManager.requestPathFromWorker(this.id, 'findAbstractPath', {
                startGateNodeId: startGate.id, // L'ID de HPANode (qui est gate.nodeId)
                endGateNodeId: endGate.id
            });
        } else {
            console.error(`Agent ${this.id}: Impossible de trouver les portes HPA de départ ou d'arrivée. StartGate:`, startGate, "EndGate:", endGate);
            this.currentState = isGoingToWork ? AgentState.AT_HOME : AgentState.AT_WORK; // Retour état précédent
            this.isVisible = false;
            this._resetPathData(); // Assurer le nettoyage
        }
    }

	/** Helper pour réinitialiser toutes les données de chemin */
    _resetPathData() {
        this.abstractPathGates = null;
        this.currentAbstractPathIndex = -1;
        this.currentDetailPathPoints = null;
        this.currentDetailPathIndexVisual = 0;
        this.currentDetailPathLengthWorld = 0;
        this.calculatedSegmentDurationGame = 0;
        this.segmentDepartureTimeGame = -1;
        this.segmentArrivalTimeGame = -1;
        this.visualInterpolationProgress = 0;
        // Ne pas réinitialiser requestedPathForDepartureTime ici, géré dans la machine d'état
    }

	/**
     * Définit le chemin abstrait (séquence de portes HPA) reçu du worker.
     * Déclenche immédiatement la requête pour le premier segment détaillé.
     * @param {Array<{id: number, zoneId: number, x: number, y: number}> | null} gateSequence - La séquence de portes ou null si échec.
     */
    setAbstractPath(gateSequence) {
        // Vérifier si on attendait bien un chemin abstrait
        if (this.currentState !== AgentState.REQUESTING_ABSTRACT_PATH) {
            console.warn(`Agent ${this.id}: Reçu un chemin abstrait alors qu'en état ${this.currentState}. Ignoré.`);
            return;
        }

        if (gateSequence && Array.isArray(gateSequence) && gateSequence.length > 0) {
            // console.log(`Agent ${this.id}: Chemin abstrait reçu avec ${gateSequence.length} portes.`);
            this.abstractPathGates = gateSequence;
            this.currentAbstractPathIndex = 0; // Commencer au premier segment (index 0 -> index 1)

            // --- Demander le premier segment détaillé ---
            // Le départ est la position *actuelle* de l'agent (qui devrait être home ou work)
            // L'arrivée est la position de la *première* porte du chemin abstrait.
            const firstGate = this.abstractPathGates[0];
            const startNode = this.experience.world?.cityManager?.getNavigationGraph()?.getClosestWalkableNode(this.position); // Position actuelle sur la grille
            const endNode = { x: firstGate.x, y: firstGate.y }; // Position grille de la première porte

            if (startNode && endNode) {
                this.currentState = AgentState.REQUESTING_DETAIL_PATH; // Attendre le premier segment
                this.experience.world?.agentManager?.requestPathFromWorker(this.id, 'findDetailPath', { startNode, endNode });
            } else {
                console.error(`Agent ${this.id}: Nœuds invalides pour demander le premier segment détaillé. Start:`, startNode, "End:", endNode);
                this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE; // Retour état stable
                this._resetPathData();
            }

        } else {
            // Échec de la recherche de chemin abstrait
            console.error(`Agent ${this.id}: Échec de la réception du chemin abstrait (path: ${gateSequence}). Retour à l'état stable.`);
            // Retourner à l'état d'où la requête est partie
            // (Difficile à savoir ici, peut-être stocker l'état précédent ?)
            // Pour l'instant, retour simple à AT_HOME / AT_WORK
             const isGoingToWork = !this.homePosition; // Approximation: si homePos est null, on devait aller au travail ? Non fiable.
             // Utilisons la position actuelle pour une meilleure approximation
             const distToHomeSq = this.homePosition ? this.position.distanceToSquared(this.homePosition) : Infinity;
             const distToWorkSq = this.workPosition ? this.position.distanceToSquared(this.workPosition) : Infinity;

            if (distToHomeSq < distToWorkSq && this.homePosition) {
                 this.currentState = AgentState.AT_HOME;
            } else if (this.workPosition) {
                 this.currentState = AgentState.AT_WORK;
            } else {
                 this.currentState = AgentState.IDLE;
            }
            this.isVisible = false;
            this._resetPathData(); // Nettoyer
        }
    }

	/**
     * Définit le chemin détaillé (segment HPA ou chemin intra-zone) reçu du worker.
     * Calcule la durée et prépare l'agent pour le transit.
     * @param {Array<THREE.Vector3> | null} pathPoints - Les points du chemin ou null si échec.
     * @param {number} pathLengthWorld - La longueur calculée du chemin détaillé.
     */
    setDetailPath(pathPoints, pathLengthWorld) {
		// Vérifier si on attendait bien un chemin détaillé
	   if (this.currentState !== AgentState.REQUESTING_DETAIL_PATH) {
		   // Cas particulier: si on était AT_HOME/AT_WORK et on reçoit un chemin direct (intra-zone)
		   if (!((this.currentState === AgentState.AT_HOME || this.currentState === AgentState.AT_WORK) && this.abstractPathGates === null)) {
				console.warn(`Agent ${this.id}: Reçu un chemin détaillé alors qu'en état ${this.currentState}. Ignoré.`);
				return;
		   }
			// Sinon (AT_HOME/AT_WORK et pas de chemin abstrait), c'est un chemin intra-zone, on continue
	   }

	   // --- Cas 1: Chemin Détaillé Valide Reçu ---
	   if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && pathLengthWorld > 0.01) { // Tolérance pour longueur
			// console.log(`Agent ${this.id}: Segment détaillé reçu (longueur: ${pathLengthWorld.toFixed(1)}). Préparation pour transit.`);
		   this.currentDetailPathPoints = pathPoints.map(p => p.clone());
		   this.currentDetailPathLengthWorld = pathLengthWorld;
		   this.currentDetailPathIndexVisual = 0; // Réinitialiser l'index visuel pour le nouveau segment
		   this.visualInterpolationProgress = 0; // Réinitialiser la progression visuelle

		   // Calculer la durée du segment en temps de jeu
		   const travelSecondsGame = pathLengthWorld / this.agentBaseSpeed;
		   const dayDurationMs = this.experience.world?.environment?.dayDurationMs;

		   if (dayDurationMs > 0) {
			   const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
			   this.calculatedSegmentDurationGame = travelRatioOfDay * dayDurationMs;
		   } else {
			   console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}). Utilisation fallback durée segment.`);
			   this.calculatedSegmentDurationGame = 1 * 60 * 1000; // Fallback 1 min jeu
			   this.currentDetailPathLengthWorld = 0; // Invalider longueur si fallback
		   }

		   // Déterminer l'heure de départ pour CE segment
		   // Utiliser le temps actuel comme départ pour le premier segment ou après une attente
		   this.segmentDepartureTimeGame = this.experience.time.elapsed;
		   this.segmentArrivalTimeGame = this.segmentDepartureTimeGame + this.calculatedSegmentDurationGame;


		   // Transitionner vers l'état de transit approprié
		   // On détermine la destination FINALE du trajet HPA global
		   const finalDestinationIsWork = (this.abstractPathGates && this.abstractPathGates.length > 0)
			   ? (this.abstractPathGates[this.abstractPathGates.length - 1].zoneId === this.workZoneId) // Trajet HPA vers travail?
			   : (this.workPosition && pathPoints[pathPoints.length - 1].distanceToSquared(this.workPosition) < this.reachToleranceSq); // Trajet intra-zone vers travail?

		   this.currentState = finalDestinationIsWork ? AgentState.IN_TRANSIT_TO_WORK : AgentState.IN_TRANSIT_TO_HOME;
		   this.isVisible = true; // Devenir visible pour commencer le transit

		   // Incrémenter stats si c'est le PREMIER segment du trajet global
			if (this.currentAbstractPathIndex <= 0) { // currentAbstractPathIndex est à -1 ou 0
				const departHour = Math.floor((this.segmentDepartureTimeGame % dayDurationMs) / (dayDurationMs / 24));
				const agentManager = this.experience.world?.agentManager;
				if (agentManager?.stats) {
					 if (finalDestinationIsWork && agentManager.stats.pathsToWorkByHour) {
						  agentManager.stats.pathsToWorkByHour[departHour] = (agentManager.stats.pathsToWorkByHour[departHour] || 0) + 1;
					 } else if (!finalDestinationIsWork && agentManager.stats.pathsToHomeByHour) {
						  agentManager.stats.pathsToHomeByHour[departHour] = (agentManager.stats.pathsToHomeByHour[departHour] || 0) + 1;
					 }
				}
			}


	   }
	   // --- Cas 2: Chemin Détaillé Invalide ou Échec ---
	   else {
		   console.error(`Agent ${this.id}: Échec réception chemin détaillé (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}, length: ${pathLengthWorld}). Retour à l'état stable.`);

		   // Déterminer l'état stable où retourner
			let stableState = AgentState.IDLE;
			const distToHomeSq = this.homePosition ? this.position.distanceToSquared(this.homePosition) : Infinity;
			const distToWorkSq = this.workPosition ? this.position.distanceToSquared(this.workPosition) : Infinity;

			if (this.abstractPathGates) { // Si on suivait un chemin HPA
			   // On était probablement en route vers la prochaine porte
			   // Retourner à l'état où on était AVANT de demander ce segment ? Difficile.
			   // Solution simple : retourner à l'état majeur précédent (home/work)
				stableState = (distToHomeSq < distToWorkSq && this.homePosition) ? AgentState.AT_HOME : AgentState.AT_WORK;
				console.warn(` -> Échec segment HPA, retour à ${stableState}`);
			} else { // Si c'était un chemin intra-zone direct
				 stableState = (distToHomeSq < distToWorkSq && this.homePosition) ? AgentState.AT_HOME : AgentState.AT_WORK;
				 console.warn(` -> Échec chemin intra-zone, retour à ${stableState}`);
			}
			// Gérer cas où ni home ni work n'est défini
			if (!this.homePosition && stableState === AgentState.AT_HOME) stableState = AgentState.IDLE;
			if (!this.workPosition && stableState === AgentState.AT_WORK) stableState = AgentState.IDLE;


		   this.currentState = stableState;
		   this.isVisible = false;
		   this._resetPathData(); // Nettoyer toutes les données de chemin
	   }
   }

	/**
     * Helper pour trouver la porte HPA la plus proche d'une position monde dans une zone donnée.
     * @param {THREE.Vector3} worldPos - La position de référence.
     * @param {number} zoneId - L'ID de la zone où chercher.
     * @param {AbstractGraph} abstractGraph - Le graphe HPA.
     * @param {NavigationGraph} navGraph - Le graphe de navigation (pour conversion).
     * @returns {import('./HPA/AbstractGraph.js').HPANode | null} La porte trouvée ou null.
     */
    _findNearestGate(worldPos, zoneId, abstractGraph, navGraph) {
        const gatesInZone = abstractGraph.getNodesInZone(zoneId);
        if (!gatesInZone || gatesInZone.length === 0) {
            console.warn(`Agent ${this.id}: Aucune porte HPA trouvée dans la zone ${zoneId}.`);
            return null;
        }

        let nearestGate = null;
        let minDistanceSq = Infinity;
        const targetGridPos = navGraph.worldToGrid(worldPos.x, worldPos.z); // Position cible sur la grille

        gatesInZone.forEach(gate => {
            // Calculer distance au carré sur la grille (plus rapide)
            const dx = gate.x - targetGridPos.x;
            const dy = gate.y - targetGridPos.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                nearestGate = gate;
            }
        });

        // Optionnel : Vérifier si la porte trouvée est réellement accessible depuis worldPos ?
        // Pourrait nécessiter un petit pathfinding local, mais ajoutons cela plus tard si besoin.

        return nearestGate;
    }

	setPath(pathPoints, pathLengthWorld) {
        // Détermine l'état dans lequel l'agent se trouvait LORSQU'IL A DEMANDÉ le chemin
        const wasRequestingWork = this.currentState === AgentState.REQUESTING_PATH_FOR_WORK;
        const wasRequestingHome = this.currentState === AgentState.REQUESTING_PATH_FOR_HOME;

        // --- Cas 1: Chemin Valide Reçu ---
        // Vérifie si le chemin existe, est un tableau non vide, et a une longueur significative.
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && pathLengthWorld > 0.1) {

            this.currentPathPoints = pathPoints.map(p => p.clone()); // Stocker une copie
            this.currentPathLengthWorld = pathLengthWorld;           // Stocker la longueur

            // Calculer la durée du trajet en temps de jeu basé sur la longueur et la vitesse de base
            const travelSecondsGame = pathLengthWorld / this.agentBaseSpeed;
            const dayDurationMs = this.experience.world?.environment?.dayDurationMs;

            if (dayDurationMs > 0) {
                // Convertir les secondes de jeu en millisecondes de jeu
                const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000); // Ratio du trajet par rapport à une journée en secondes
                this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs; // Durée en ms de jeu
            } else {
                // Fallback si la durée du jour est invalide (ne devrait pas arriver si l'env est prêt)
                console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}) lors du calcul de la durée du trajet. Utilisation d'un fallback.`);
                this.calculatedTravelDurationGame = 10 * 60 * 1000; // Fallback (ex: 10 minutes jeu)
                this.currentPathLengthWorld = 0; // Considérer longueur comme invalide si durée fallback
            }

            // Transitionner vers l'état "Prêt à partir" correspondant
            if (wasRequestingWork) {
                this.currentState = AgentState.READY_TO_LEAVE_FOR_WORK;
            } else if (wasRequestingHome) {
                this.currentState = AgentState.READY_TO_LEAVE_FOR_HOME;
            } else {
                // Cas étrange : on reçoit un chemin sans l'avoir demandé récemment
                console.warn(`Agent ${this.id}: Reçu path alors qu'en état ${this.currentState}. Path stocké, mais état inchangé.`);
                // On garde le chemin mais on ne change pas l'état immédiatement
            }
            // console.log(`Agent ${this.id}: Path reçu et traité. Length=${this.currentPathLengthWorld.toFixed(1)}, Duration=${(this.calculatedTravelDurationGame / 1000).toFixed(1)}s game. Nouvel état: ${this.currentState}`);

        }
        // --- Cas 2: Chemin Invalide ou Échec Pathfinding ---
        else {
            console.warn(`Agent ${this.id}: setPath reçu avec chemin invalide (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}) ou longueur ${pathLengthWorld}.`);

            // Réinitialiser toutes les variables liées au chemin
            this.currentPathPoints = null;
            this.calculatedTravelDurationGame = 0;
            this.currentPathLengthWorld = 0;
            this.departureTimeGame = -1;
            this.arrivalTmeGame = -1;

            // --- **CORRECTION LOGIQUE D'ÉTAT D'ÉCHEC** ---
            if (wasRequestingHome) {
                // Si la demande de chemin pour RENTRER échoue, l'agent doit revenir à l'état AT_WORK.
                this.currentState = AgentState.AT_WORK;
                console.warn(`Agent ${this.id}: Pathfinding HOME failed, returning to AT_WORK.`);
                this.isVisible = false; // Agent est de retour à l'intérieur du travail
            } else if (wasRequestingWork) {
                // Si la demande de chemin pour ALLER AU TRAVAIL échoue, l'agent revient à AT_HOME (ou IDLE).
                this.currentState = this.homePosition ? AgentState.AT_HOME : AgentState.IDLE;
                console.warn(`Agent ${this.id}: Pathfinding TO WORK failed, returning to ${this.currentState}.`);
                this.isVisible = false; // Agent est de retour à l'intérieur de la maison ou disparaît
            }
            // Si on reçoit un chemin invalide sans être en état REQUESTING, on logue l'avertissement
            // mais on ne change pas l'état actuel de l'agent.
             else {
                  console.warn(`Agent ${this.id}: Reçu path invalide alors qu'en état ${this.currentState}. État inchangé.`);
             }
            // --- **FIN CORRECTION** ---
        }
    } // Fin setPath

	/**
     * Met à jour l'état logique de l'agent (décision de déplacement, demande de chemin).
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentHour - Heure actuelle du jeu (0-23).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
    updateState(deltaTime, currentHour, currentGameTime) {
        const environment = this.experience.world?.environment;
        if (!environment || !environment.isInitialized || environment.dayDurationMs <= 0) {
            if (this.currentState !== AgentState.IDLE) { this.currentState = AgentState.IDLE; this.isVisible = false; }
            return; // Attendre que l'environnement soit prêt
        }

        const dayDurationMs = environment.dayDurationMs;
        const departWorkTime = this.exactWorkDepartureTimeGame;
        const departHomeTime = this.exactHomeDepartureTimeGame;

        // Vérification validité des temps (sécurité)
        if (departWorkTime < 0 || departHomeTime < 0) {
             this._calculateScheduledTimes(); // Tenter de recalculer
             if (this.exactWorkDepartureTimeGame < 0 || this.exactHomeDepartureTimeGame < 0) {
                  if (this.currentState !== AgentState.IDLE) { this.currentState = AgentState.IDLE; this.isVisible = false; }
                  return; // Toujours invalide, on arrête
             }
        }

        // --- Machine d'état HPA ---
        switch (this.currentState) {
            case AgentState.AT_HOME:
                this.isVisible = false;
                // Trouver la prochaine heure de départ travail pertinente
                let nextScheduledDepartureWork = departWorkTime;
                while (nextScheduledDepartureWork <= this.lastArrivalTimeHome) {
                    nextScheduledDepartureWork += dayDurationMs;
                }
                // Vérifier s'il est temps de demander le chemin (un peu avant l'heure H)
                const timeToRequestWorkPath = nextScheduledDepartureWork - (this.anticipationMinutes * 60 * 1000 / 24 * (environment.config?.dayDurationMinutes ?? 20) / 20); // Calcul anticipation en ms jeu
                if (currentGameTime >= timeToRequestWorkPath && this.requestedPathForDepartureTime < nextScheduledDepartureWork) {
                    if (this.workPosition && this.homeZoneId >= 0 && this.workZoneId >= 0) {
                        // console.log(`Agent ${this.id}: Anticipating work departure ${nextScheduledDepartureWork.toFixed(0)}. Requesting HPA path.`);
                        this.requestedPathForDepartureTime = nextScheduledDepartureWork; // Marquer la demande
                        this.requestPathHPA(this.homePosition, this.workPosition, this.homeZoneId, this.workZoneId, this.homeGridNode, this.workGridNode, true);
                    } else {
                        if (this.requestedPathForDepartureTime < nextScheduledDepartureWork) { // Log une seule fois par cycle manqué
                            console.warn(`Agent ${this.id}: Cannot request work path for departure ${nextScheduledDepartureWork.toFixed(0)} (missing info).`);
                            this.requestedPathForDepartureTime = nextScheduledDepartureWork; // Marquer comme manqué pour ce cycle
                        }
                    }
                }
                break;

            case AgentState.AT_WORK:
                this.isVisible = false;
                if (this.lastArrivalTimeWork < 0) this.lastArrivalTimeWork = currentGameTime; // Init si besoin
                // Trouver la prochaine heure de départ maison pertinente
                let nextScheduledDepartureHome = departHomeTime;
                while (nextScheduledDepartureHome <= this.lastArrivalTimeWork) {
                    nextScheduledDepartureHome += dayDurationMs;
                }
                 // Vérifier s'il est temps de demander le chemin
                 const timeToRequestHomePath = nextScheduledDepartureHome - (this.anticipationMinutes * 60 * 1000 / 24 * (environment.config?.dayDurationMinutes ?? 20) / 20);
                 if (currentGameTime >= timeToRequestHomePath && this.requestedPathForDepartureTime < nextScheduledDepartureHome) {
                     if (this.homePosition && this.workZoneId >= 0 && this.homeZoneId >= 0) {
                        // console.log(`Agent ${this.id}: Anticipating home departure ${nextScheduledDepartureHome.toFixed(0)}. Requesting HPA path.`);
                        this.requestedPathForDepartureTime = nextScheduledDepartureHome;
                        this.requestPathHPA(this.workPosition, this.homePosition, this.workZoneId, this.homeZoneId, this.workGridNode, this.homeGridNode, false);
                    } else {
                         if (this.requestedPathForDepartureTime < nextScheduledDepartureHome) {
                            console.warn(`Agent ${this.id}: Cannot request home path for departure ${nextScheduledDepartureHome.toFixed(0)} (missing info).`);
                             this.requestedPathForDepartureTime = nextScheduledDepartureHome;
                         }
                    }
                }
                break;

            case AgentState.REQUESTING_ABSTRACT_PATH:
            case AgentState.REQUESTING_DETAIL_PATH:
                this.isVisible = false; // Rester caché pendant l'attente
                // Attend passivement l'appel à setAbstractPath ou setDetailPath
                break;

            case AgentState.IN_TRANSIT_TO_WORK:
            case AgentState.IN_TRANSIT_TO_HOME:
                this.isVisible = true; // Assurer visibilité
                // La logique de fin de segment et demande du suivant est gérée dans updateVisuals
                break;

            case AgentState.IDLE:
                this.isVisible = false;
                // Essayer de s'initialiser si possible ? Pourrait être fait une fois au démarrage.
                break;
        }
    }

	/**
     * Met à jour la position et l'orientation visuelle de l'agent le long du chemin détaillé actuel.
     * Gère la transition vers le segment HPA suivant à la fin d'un segment.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentGameTime - Temps total écoulé dans le jeu (ms).
     */
    updateVisuals(deltaTime, currentGameTime) {
        // Ne rien faire si pas en transit
        if (this.currentState !== AgentState.IN_TRANSIT_TO_WORK && this.currentState !== AgentState.IN_TRANSIT_TO_HOME) {
            // S'assurer que la position est correcte si à la maison ou au travail
            if (this.currentState === AgentState.AT_HOME && this.homePosition) {
                if (!this.position.equals(this.homePosition)) { // Vérifier avant de copier inutilement
                    this.position.copy(this.homePosition).setY(this.yOffset);
                }
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                 if (!this.position.equals(this.workPosition)) {
                    this.position.copy(this.workPosition).setY(this.yOffset);
                 }
            }
            return;
        }

        // Vérifier si on a un chemin détaillé valide à suivre
        if (!this.currentDetailPathPoints || this.currentDetailPathPoints.length === 0 || this.currentDetailPathLengthWorld <= 0) {
            console.warn(`Agent ${this.id}: Tentative d'update visuel en transit (${this.currentState}) sans chemin détaillé valide.`);
            // Tenter un retour à un état stable
            this.currentState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK && this.workPosition) ? AgentState.AT_WORK : (this.homePosition ? AgentState.AT_HOME : AgentState.IDLE);
            this.isVisible = false;
            this._resetPathData();
            return;
        }

        // --- Calcul de la Progression sur le Segment Actuel ---
        // Utiliser le temps de départ/arrivée calculé pour ce segment
        let progress = 0;
        if (this.calculatedSegmentDurationGame > 0 && this.segmentDepartureTimeGame >= 0) {
            const elapsedTimeSinceSegmentStart = currentGameTime - this.segmentDepartureTimeGame;
            progress = Math.max(0, Math.min(1, elapsedTimeSinceSegmentStart / this.calculatedSegmentDurationGame));
        } else if (this.currentDetailPathLengthWorld > 0) {
            // Fallback si durée invalide : progression basée sur distance parcourue (moins précis pour timing)
             const distanceToCover = this.currentDetailPathLengthWorld;
             const distanceMoved = this.visualSpeed * (deltaTime / 1000.0); // Mouvement basé sur vitesse visuelle
             this.visualInterpolationProgress += distanceMoved / distanceToCover;
             progress = Math.max(0, Math.min(1, this.visualInterpolationProgress));
             // console.warn(`Agent ${this.id}: Utilisation fallback progression visuelle.`);
        } else {
             progress = 1.0; // Forcer la fin si longueur invalide aussi
        }
        this.visualInterpolationProgress = progress; // Stocker pour référence

        // --- Interpolation de la Position sur le Segment ---
        const totalSegmentLength = this.currentDetailPathLengthWorld;
        const targetDistanceOnSegment = progress * totalSegmentLength;
        let cumulativeLength = 0;
        let targetPosition = this.currentDetailPathPoints[this.currentDetailPathPoints.length - 1]; // Default à la fin

        for (let i = 0; i < this.currentDetailPathPoints.length - 1; i++) {
            const p1 = this.currentDetailPathPoints[i];
            const p2 = this.currentDetailPathPoints[i + 1];
            const segmentVector = this._tempV3_1.copy(p2).sub(p1);
            const segmentLength = segmentVector.length();

            if (segmentLength < 0.001) continue; // Ignorer segments de longueur nulle

            if (cumulativeLength + segmentLength >= targetDistanceOnSegment || i === this.currentDetailPathPoints.length - 2) {
                const lengthOnThisSegment = Math.max(0, targetDistanceOnSegment - cumulativeLength);
                const segmentProgress = Math.max(0, Math.min(1, lengthOnThisSegment / segmentLength));
                targetPosition = this._tempV3_2.copy(p1).addScaledVector(segmentVector, segmentProgress);
                this.currentDetailPathIndexVisual = i; // Mémoriser l'index du segment courant
                break;
            }
            cumulativeLength += segmentLength;
        }
        // Appliquer la position visuelle
        this.position.copy(targetPosition);
        this.position.y += this.yOffset;

        // --- Calcul de l'Orientation (regarder point suivant) ---
        let lookAtIndex = Math.min(this.currentDetailPathIndexVisual + 1, this.currentDetailPathPoints.length - 1);
        // Si très proche de la fin du segment, regarder la VRAIE destination du segment
        if (progress > 0.98) {
             lookAtIndex = this.currentDetailPathPoints.length - 1;
        }
        const lookTargetPoint = this.currentDetailPathPoints[lookAtIndex];
        this._tempV3_1.copy(lookTargetPoint).setY(this.position.y); // Garder la hauteur Y de l'agent

        if (this.position.distanceToSquared(this._tempV3_1) > 0.01) {
            this._tempMatrix.lookAt(this.position, this._tempV3_1, THREE.Object3D.DEFAULT_UP);
            this._tempQuat.setFromRotationMatrix(this._tempMatrix);
            const deltaSeconds = deltaTime / 1000.0;
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
            this.orientation.slerp(this._tempQuat, slerpAlpha);
        }

        // --- Animation de Marche ---
        // Utiliser la progression visuelle ou le temps de jeu pour animer
        const walkTime = currentGameTime / 1000; // Temps global pour l'animation
        this._updateWalkAnimation(walkTime); // Appel inchangé

        // --- Gestion de la Fin du Segment Détaillé ---
        if (progress >= 1.0) {
            // console.log(`Agent ${this.id}: Fin du segment détaillé ${this.currentAbstractPathIndex}/${this.abstractPathGates ? this.abstractPathGates.length -1 : 'N/A'}.`);

            // CAS 1: C'était un chemin intra-zone direct (pas de HPA)
            if (!this.abstractPathGates) {
                // console.log(` -> Fin trajet intra-zone.`);
                const finalState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME;
                this.currentState = finalState;
                this.lastArrivalTimeWork = (finalState === AgentState.AT_WORK) ? this.segmentArrivalTimeGame : this.lastArrivalTimeWork;
                this.lastArrivalTimeHome = (finalState === AgentState.AT_HOME) ? this.segmentArrivalTimeGame : this.lastArrivalTimeHome;
                this.isVisible = false;
                if (finalState === AgentState.AT_HOME && this.homePosition) this.position.copy(this.homePosition).setY(this.yOffset);
                if (finalState === AgentState.AT_WORK && this.workPosition) this.position.copy(this.workPosition).setY(this.yOffset);
                this._resetPathData();
                this.requestedPathForDepartureTime = -1; // Prêt pour la prochaine demande
            }
            // CAS 2: C'était un segment d'un chemin HPA
            else {
                // Vérifier si c'était le DERNIER segment HPA
                const isLastSegment = (this.currentAbstractPathIndex >= this.abstractPathGates.length - 1);

                if (isLastSegment) {
                    // console.log(` -> Fin du DERNIER segment HPA.`);
                    const finalState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK) ? AgentState.AT_WORK : AgentState.AT_HOME;
                    this.currentState = finalState;
                    this.lastArrivalTimeWork = (finalState === AgentState.AT_WORK) ? this.segmentArrivalTimeGame : this.lastArrivalTimeWork;
                    this.lastArrivalTimeHome = (finalState === AgentState.AT_HOME) ? this.segmentArrivalTimeGame : this.lastArrivalTimeHome;
                    this.isVisible = false;
                    if (finalState === AgentState.AT_HOME && this.homePosition) this.position.copy(this.homePosition).setY(this.yOffset);
                    if (finalState === AgentState.AT_WORK && this.workPosition) this.position.copy(this.workPosition).setY(this.yOffset);
                    this._resetPathData(); // Nettoyer chemin HPA aussi
                    this.requestedPathForDepartureTime = -1;
                } else {
                    // Ce n'était PAS le dernier segment, demander le suivant
                    this.currentAbstractPathIndex++; // Passer à la porte/segment suivant
                    const nextGateIndex = this.currentAbstractPathIndex; // Index de la porte destination de ce nouveau segment
                    const currentGateIndex = nextGateIndex - 1; // Index de la porte où on se trouve

                    if (nextGateIndex < this.abstractPathGates.length && currentGateIndex >= 0) {
                        const currentGate = this.abstractPathGates[currentGateIndex];
                        const nextGate = this.abstractPathGates[nextGateIndex];

                        // console.log(` -> Demande du prochain segment HPA: Gate ${currentGate.id} -> Gate ${nextGate.id}`);
                        this.currentState = AgentState.REQUESTING_DETAIL_PATH; // Attendre le prochain segment
                        this.isVisible = true; // Rester visible à la porte en attendant

                        this.experience.world?.agentManager?.requestPathFromWorker(this.id, 'findDetailPath', {
                            startNode: { x: currentGate.x, y: currentGate.y }, // Départ = porte actuelle
                            endNode: { x: nextGate.x, y: nextGate.y }      // Arrivée = porte suivante
                        });
                    } else {
                        // Problème d'index, ne devrait pas arriver
                        console.error(`Agent ${this.id}: Erreur d'index HPA. Index: ${this.currentAbstractPathIndex}, Longeur: ${this.abstractPathGates.length}. Retour à l'état stable.`);
                         this.currentState = (this.currentState === AgentState.IN_TRANSIT_TO_WORK && this.workPosition) ? AgentState.AT_WORK : (this.homePosition ? AgentState.AT_HOME : AgentState.IDLE);
                        this.isVisible = false;
                        this._resetPathData();
                    }
                }
            }
        } // Fin if (progress >= 1.0)
    } // Fin updateVisuals

	_updateWalkAnimation(walkTime) {
        // Accéder à la config via cityManager
        const config = this.experience.world?.cityManager?.config;
        if (!config) {
             console.warn(`Agent ${this.id}: Impossible d'accéder à la config dans _updateWalkAnimation.`);
             // Utiliser des valeurs par défaut ou arrêter ? Utilisons des défauts pour l'instant.
             config = { // Fournir un objet config de secours
                agentBobAmplitude: 0.15, agentStepLength: 1.5, agentStepHeight: 0.7,
                agentSwingAmplitude: 1.2, agentAnkleRotationAmplitude: Math.PI / 8,
                agentHandTiltAmplitude: 0.2, agentHeadBobAmplitude: 0.06,
                agentAnimationSpeedFactor: 1.0 // Valeur par défaut
             };
        }

        // Récupérer les valeurs de la config (avec fallback au cas où)
        const agentBobAmplitude = config.agentBobAmplitude ?? 0.15;
        const agentStepLength = config.agentStepLength ?? 1.5;
        const agentStepHeight = config.agentStepHeight ?? 0.7;
        const agentSwingAmplitude = config.agentSwingAmplitude ?? 1.2;
        const agentAnkleRotationAmplitude = config.agentAnkleRotationAmplitude ?? (Math.PI / 8);
        const agentHandTiltAmplitude = config.agentHandTiltAmplitude ?? 0.2;
        const agentHeadBobAmplitude = config.agentHeadBobAmplitude ?? 0.06;
        // Utiliser la valeur de config corrigée ici
        const agentAnimationSpeedFactor = config.agentAnimationSpeedFactor ?? 1.0;

        // Calcul de la vitesse effective (utilise this.visualSpeed qui est propre à l'agent)
        const effectiveAnimationSpeed = this.visualSpeed * agentAnimationSpeedFactor;

        // Le reste de la logique d'animation reste inchangé
        let pos = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 };
        const torsoBobY = Math.sin(walkTime * 2) * agentBobAmplitude;

        // Torso
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = 0;
        this.currentAnimationMatrix.torso.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.identity(), this._tempV3_2.set(1, 1, 1));
        // Head
        pos.y = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * agentHeadBobAmplitude);
        this.currentAnimationMatrix.head.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.identity(), this._tempV3_2.set(1, 1, 1));
        // Left Foot
        pos.z = Math.sin(walkTime) * agentStepLength;
        pos.y = Math.max(0, Math.cos(walkTime)) * agentStepHeight;
        rot.x = Math.sin(walkTime) * agentAnkleRotationAmplitude; rot.y = 0; rot.z = 0;
        this.currentAnimationMatrix.leftFoot.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
        // Right Foot
        pos.z = Math.sin(walkTime + Math.PI) * agentStepLength;
        pos.y = Math.max(0, Math.cos(walkTime + Math.PI)) * agentStepHeight;
        rot.x = Math.sin(walkTime + Math.PI) * agentAnkleRotationAmplitude; rot.y = 0; rot.z = 0;
        this.currentAnimationMatrix.rightFoot.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
        // Left Hand
        pos.z = Math.sin(walkTime + Math.PI) * agentSwingAmplitude;
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = Math.sin(walkTime * 1.8) * agentHandTiltAmplitude;
        this.currentAnimationMatrix.leftHand.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
        // Right Hand
        pos.z = Math.sin(walkTime) * agentSwingAmplitude;
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = Math.cos(walkTime * 1.8 + 0.5) * agentHandTiltAmplitude;
        this.currentAnimationMatrix.rightHand.compose(this._tempV3_1.set(pos.x, pos.y, pos.z), this._tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), this._tempV3_2.set(1, 1, 1));
    }

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