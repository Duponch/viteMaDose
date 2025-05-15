// src/World/Agent.js
import * as THREE from 'three';
import WorkScheduleStrategy from '../Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from '../Strategies/WeekendWalkStrategy.js';
import AgentState from './AgentState.js';
import AgentAnimation from './AgentAnimation.js';
import AgentStateMachine from './AgentStateMachine.js';
import AgentWeekendBehavior from './AgentWeekendBehavior.js';
import AgentVehicleBehavior from './AgentVehicleBehavior.js';
import AgentMedicationBehavior from './AgentMedicationBehavior.js';
import AgentMovement from './AgentMovement.js';

let nextAgentId = 0;

export default class Agent {
    constructor(config, instanceId, experience, workScheduleStrategy = null, weekendWalkStrategy = null) {
        this.id = `citizen_${nextAgentId++}`;
        this.instanceId = instanceId;

        if (!experience) { throw new Error(`Agent ${this.id}: Experience instance is required!`); }
        this.experience = experience;

        // --- Propriétés Configuration & Base ---
        this.config = config;
        this.scale = config.scale ?? 0.1;
        this.agentBaseSpeed = (config.speed ?? 1.5);
        this.visualSpeed = this.agentBaseSpeed * 7;
        this.rotationSpeed = config.rotationSpeed ?? 8.0; // Conservé ici mais utilisé par AgentMovement
        this.yOffset = config.yOffset ?? 0.3;
        this.torsoColor = new THREE.Color(config.torsoColor ?? 0x800080);
        this.debugPathColor = config.debugPathColor ?? this.torsoColor.getHex();
        this.reachTolerance = 0.5;
        this.reachToleranceSq = this.reachTolerance * this.reachTolerance;
        this.lodDistance = config.lodDistance ?? 50; // Distance du niveau de détail (LOD) configurable
        this.isLodActive = false;

        // --- Position & Orientation (Visuel) ---
        this.position = new THREE.Vector3(0, this.yOffset, 0);
        this.orientation = new THREE.Quaternion();
        this.isVisible = false;

        // --- État & Planification ---
        this.currentState = AgentState.IDLE;
        this.stateMachine = new AgentStateMachine(this);
        this.homeBuildingId = null;
        this.workBuildingId = null;
        this.homePosition = null;       // Position du point de départ/arrivée sur le trottoir
        this.workPosition = null;       // Position du point de départ/arrivée sur le trottoir
        this.homeBuildingPosition = null; // Position du bâtiment (cube bleu)
        this.workBuildingPosition = null; // Position du bâtiment (cube bleu)
        this.homeGridNode = null;
        this.workGridNode = null;
        this.hasReachedDestination = false;

        // --- Trajet Actuel ---
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathLengthWorld = 0;
        this.currentPathIndexVisual = 0; // Index pour le suivi visuel du chemin
        this.visualInterpolationProgress = 0; // Progression (0-1) pour le visuel

        // --- États pour les transitions entre bâtiment et trottoir ---
        this.isMovingFromBuildingToPath = false;
        this.isMovingFromPathToBuilding = false;
        this.buildingTransitionProgress = 0;
        this.buildingTransitionPathPoints = null;
        this.buildingTransitionStartTime = -1;
        this.buildingTransitionDuration = 0;

        // --- Heures & Délais ---
        this.departureWorkHour = 8;
        this.departureHomeHour = 18;
        this.anticipationMinutes = 5;
        this.prepareWorkDepartureTimeGame = -1;
        this.prepareHomeDepartureTimeGame = -1;
        this.exactWorkDepartureTimeGame = -1;
        this.exactHomeDepartureTimeGame = -1;

        this.lastArrivalTimeHome = 0;
        this.lastArrivalTimeWork = -1;
        this.requestedPathForDepartureTime = -1;

        // Initialiser ces valeurs à -1 pour s'assurer que la condition currentDayNumber > lastDepartureDayWork soit true
        this.lastDepartureDayWork = -1;
        this.lastDepartureDayHome = -1;

        this._currentPathRequestGoal = null;

        // --- Comportements & Handlers ---
        this.animationHandler = new AgentAnimation(this.config, this.experience);
        this.movementHandler = new AgentMovement(this);

        this.workScheduleStrategy = workScheduleStrategy || new WorkScheduleStrategy();
        const effectiveWeekendWalkStrategy = weekendWalkStrategy || new WeekendWalkStrategy();
        this.weekendBehavior = new AgentWeekendBehavior(this, effectiveWeekendWalkStrategy);
        this.vehicleBehavior = new AgentVehicleBehavior(this);
        this.medicationBehavior = new AgentMedicationBehavior(this);

        // --- Animation Visuelle (Matrices) ---
        this.currentAnimationMatrix = {
            head: new THREE.Matrix4(), torso: new THREE.Matrix4(),
            leftHand: new THREE.Matrix4(), rightHand: new THREE.Matrix4(),
            leftFoot: new THREE.Matrix4(), rightFoot: new THREE.Matrix4(),
        };

        // --- Variables temporaires (peut-être moins utilisées ici maintenant) ---
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempMatrix = new THREE.Matrix4();
        // _targetOrientation, _lookTarget, _targetPosition, _direction sont maintenant gérés dans AgentMovement

        // Matrice de transformation pour le rendu (toujours utile pour AgentManager)
        this.matrix = new THREE.Matrix4();

        // --- Événements planifiés --- (Déplacé avant _calculateScheduledTimes pour assurer l'initialisation avant utilisation)
        this.scheduledEvents = {
            prepareForWork: null,
            departForWork: null,
            prepareForHome: null,
            departForHome: null
        };

        this._calculateScheduledTimes();

        this.sidewalkHeight = experience.world?.cityManager?.getNavigationGraph(false)?.sidewalkHeight || 0.2;

        this._lastPositionCheck = null;

        // Propriétés pour les mécanismes de secours
        this._pathRequestTimeout = null;
        this._stateStartTime = null;

        this._nextStateCheckTime = -1;
        
        // Écouter les événements de changement de vitesse de temps pour synchroniser dynamiquement
        this._setupTimeEventListeners();
    }

    /**
     * Configure les écouteurs d'événements liés au temps
     * @private
     */
    _setupTimeEventListeners() {
        // Écouter les événements de changement de vitesse du jeu
        if (this.experience && this.experience.time) {
            // Changement de vitesse - vérifier la synchronisation si vitesse élevée
            this._speedChangeHandler = (event) => {
                const newSpeed = event.detail.scale;
                // Si la vitesse est très élevée (>= 256x), synchroniser immédiatement
                if (newSpeed >= 256 && this.experience.time.elapsed > 0) {
                    this._synchronizeWithGameTime(this.experience.time.elapsed);
                }
            };
            
            // Reprise après pause - vérifier la synchronisation
            this._playedHandler = () => {
                if (this.experience.time.elapsed > 0) {
                    this._synchronizeWithGameTime(this.experience.time.elapsed);
                }
            };
            
            // Ajouter les écouteurs avec les références stockées
            this.experience.time.addEventListener('speedchange', this._speedChangeHandler);
            this.experience.time.addEventListener('played', this._playedHandler);
        }
    }

    /**
     * Synchronise l'état de l'agent avec l'heure de jeu actuelle
     * @param {number} currentGameTime - Temps de jeu actuel
     * @private
     */
    _synchronizeWithGameTime(currentGameTime) {
        if (!this.experience || !this.experience.world?.environment) return;
        
        const environment = this.experience.world.environment;
        const dayDurationMs = environment.dayDurationMs;
        const timeWithinCurrentDayCycle = currentGameTime % dayDurationMs;
        const currentHour = environment.getCurrentHour ? environment.getCurrentHour() : Math.floor((timeWithinCurrentDayCycle / dayDurationMs) * 24);
        
        // Vérifier et corriger les états incohérents
        this._correctStateBasedOnTime(currentGameTime, currentHour, timeWithinCurrentDayCycle);
    }

    /**
     * Corrige l'état de l'agent en fonction de l'heure actuelle
     * @param {number} currentGameTime - Temps de jeu actuel
     * @param {number} currentHour - Heure actuelle (0-23)
     * @param {number} timeWithinDay - Temps dans le cycle journalier actuel
     * @private
     */
    _correctStateBasedOnTime(currentGameTime, currentHour, timeWithinDay) {
        // READY_TO_LEAVE_FOR_WORK mais après l'heure de départ
        if (this.currentState === AgentState.READY_TO_LEAVE_FOR_WORK && 
            currentHour >= this.departureWorkHour && 
            timeWithinDay >= this.exactWorkDepartureTimeGame) {
            
            console.log(`Agent ${this.id}: Correction d'état - En retard pour le travail, synchronisation`);
            
            // Si l'agent doit déjà être arrivé au travail (après 9h par exemple)
            if (currentHour >= 9) {
                this.currentState = AgentState.AT_WORK;
                this.isVisible = false;
                if (this.workBuildingPosition) {
                    this.position.copy(this.workBuildingPosition).setY(this.yOffset);
                }
                this.lastArrivalTimeWork = currentGameTime;
                this.currentPathPoints = null;
            } 
            // Sinon, il doit être sur le chemin vers le travail
            else if (this.currentPathPoints && this.currentPathPoints.length > 0) {
                const timeElapsedSinceDeparture = timeWithinDay - this.exactWorkDepartureTimeGame;
                
                // Calculer la progression attendue
                if (this.calculatedTravelDurationGame <= 0) {
                    this.calculatedTravelDurationGame = (this.currentPathLengthWorld / this.agentBaseSpeed) * 1000;
                }
                
                const progressRatio = Math.min(1.0, timeElapsedSinceDeparture / this.calculatedTravelDurationGame);
                
                this.departureTimeGame = currentGameTime - timeElapsedSinceDeparture;
                this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
                
                // Mettre l'agent en transit
                this.currentState = AgentState.IN_TRANSIT_TO_WORK;
                this.isVisible = true;
                
                // Synchroniser la position visuelle
                this.syncVisualPositionWithProgress(progressRatio);
            }
        }
        
        // READY_TO_LEAVE_FOR_HOME mais après l'heure de départ
        else if (this.currentState === AgentState.READY_TO_LEAVE_FOR_HOME && 
                currentHour >= this.departureHomeHour && 
                timeWithinDay >= this.exactHomeDepartureTimeGame) {
            
            console.log(`Agent ${this.id}: Correction d'état - En retard pour rentrer, synchronisation`);
            
            // Si l'agent doit déjà être arrivé à la maison (après 19h par exemple)
            if (currentHour >= 19) {
                this.currentState = AgentState.AT_HOME;
                this.isVisible = false;
                if (this.homeBuildingPosition) {
                    this.position.copy(this.homeBuildingPosition).setY(this.yOffset);
                }
                this.lastArrivalTimeHome = currentGameTime;
                this.currentPathPoints = null;
            } 
            // Sinon, il doit être sur le chemin vers la maison
            else if (this.currentPathPoints && this.currentPathPoints.length > 0) {
                const timeElapsedSinceDeparture = timeWithinDay - this.exactHomeDepartureTimeGame;
                
                // Calculer la progression attendue
                if (this.calculatedTravelDurationGame <= 0) {
                    this.calculatedTravelDurationGame = (this.currentPathLengthWorld / this.agentBaseSpeed) * 1000;
                }
                
                const progressRatio = Math.min(1.0, timeElapsedSinceDeparture / this.calculatedTravelDurationGame);
                
                this.departureTimeGame = currentGameTime - timeElapsedSinceDeparture;
                this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
                
                // Mettre l'agent en transit
                this.currentState = AgentState.IN_TRANSIT_TO_HOME;
                this.isVisible = true;
                
                // Synchroniser la position visuelle
                this.syncVisualPositionWithProgress(progressRatio);
            }
        }
        
        // Agent en transit avec temps d'arrivée dépassé
        else if ((this.currentState === AgentState.IN_TRANSIT_TO_WORK || 
                 this.currentState === AgentState.DRIVING_TO_WORK ||
                 this.currentState === AgentState.IN_TRANSIT_TO_HOME || 
                 this.currentState === AgentState.DRIVING_HOME) && 
                this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame) {
            
            console.log(`Agent ${this.id}: Correction d'état - Temps d'arrivée dépassé, synchronisation`);
            
            // Placer l'agent directement à destination
            if (this.currentState === AgentState.IN_TRANSIT_TO_WORK || 
                this.currentState === AgentState.DRIVING_TO_WORK) {
                this.currentState = AgentState.AT_WORK;
                this.isVisible = false;
                if (this.workBuildingPosition) {
                    this.position.copy(this.workBuildingPosition).setY(this.yOffset);
                }
                this.lastArrivalTimeWork = currentGameTime;
            } else {
                this.currentState = AgentState.AT_HOME;
                this.isVisible = false;
                if (this.homeBuildingPosition) {
                    this.position.copy(this.homeBuildingPosition).setY(this.yOffset);
                }
                this.lastArrivalTimeHome = currentGameTime;
            }
            
            // Nettoyer les données de chemin
            this.currentPathPoints = null;
            this.vehicleBehavior?.exitVehicle();
        }
        
        // État AT_HOME ou AT_WORK incohérent avec l'heure
        else if (this.currentState === AgentState.AT_HOME && 
                currentHour >= 9 && currentHour < this.departureHomeHour &&
                this.workPosition && this.shouldBeAtWork(currentHour)) {
            
            console.log(`Agent ${this.id}: Correction d'état - Devrait être au travail à ${currentHour}h`);
            
            this.currentState = AgentState.AT_WORK;
            this.isVisible = false;
            if (this.workBuildingPosition) {
                this.position.copy(this.workBuildingPosition).setY(this.yOffset);
            }
        }
        else if (this.currentState === AgentState.AT_WORK && 
                ((currentHour >= 19) || (currentHour < 7))) {
            
            console.log(`Agent ${this.id}: Correction d'état - Devrait être à la maison à ${currentHour}h`);
            
            this.currentState = AgentState.AT_HOME;
            this.isVisible = false;
            if (this.homeBuildingPosition) {
                this.position.copy(this.homeBuildingPosition).setY(this.yOffset);
            }
        }
    }

    /**
     * Détermine si l'agent devrait être au travail à l'heure donnée
     * en fonction de sa stratégie de travail
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {boolean} Vrai si l'agent devrait être au travail
     */
    shouldBeAtWork(currentHour) {
        // Vérifier d'abord si c'est un jour ouvrable selon la stratégie
        const environment = this.experience.world?.environment;
        if (!environment || !environment.calendarDate) return false;
        
        const calendarDate = environment.calendarDate;
        const isWeekend = ["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine);
        
        // Si weekend, ne devrait pas être au travail
        if (isWeekend) return false;
        
        // Vérifier si l'heure est dans les heures de travail
        return currentHour >= this.departureWorkHour && currentHour < this.departureHomeHour;
    }

	_calculateScheduledTimes() {
        const environment = this.experience?.world?.environment;
        if (!environment || !environment.isInitialized || environment.dayDurationMs <= 0) {
            console.warn(`Agent ${this.id}: Impossible de calculer les heures planifiées (environnement non prêt).`);
            return;
        }
        
        try {
            const dayDurationMs = environment.dayDurationMs;
            const msPerHour = dayDurationMs / 24;
            const msPerMinute = msPerHour / 60;
    
            this.exactWorkDepartureTimeGame = this.departureWorkHour * msPerHour;
            this.prepareWorkDepartureTimeGame = this.exactWorkDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
            if (this.prepareWorkDepartureTimeGame < 0) {
                this.prepareWorkDepartureTimeGame += dayDurationMs;
            }
    
            this.exactHomeDepartureTimeGame = this.departureHomeHour * msPerHour;
            this.prepareHomeDepartureTimeGame = this.exactHomeDepartureTimeGame - (this.anticipationMinutes * msPerMinute);
            if (this.prepareHomeDepartureTimeGame < 0) {
                this.prepareHomeDepartureTimeGame += dayDurationMs;
            }
            
            // Planifier les événements quotidiens
            if (this.experience?.timeScheduler?.isInitialized) {
                this._scheduleAgentDailyEvents();
            } else {
                console.log(`Agent ${this.id}: TimeScheduler pas encore initialisé, report de la planification.`);
                // On pourrait programmer un retry plus tard si nécessaire
            }
        } catch (error) {
            console.error(`Agent ${this.id}: Erreur lors du calcul des heures planifiées:`, error);
        }
    }

    /**
     * Planifie les événements quotidiens pour cet agent
     * @private
     */
    _scheduleAgentDailyEvents() {
        // Vérifier que le scheduler existe
        const scheduler = this.experience?.timeScheduler;
        if (!scheduler) {
            console.warn(`Agent ${this.id}: Impossible de planifier les événements - scheduler non disponible`);
            return;
        }

        // S'assurer que this.scheduledEvents est initialisé
        if (!this.scheduledEvents || typeof this.scheduledEvents !== 'object') {
            this.scheduledEvents = {
                prepareForWork: null,
                departForWork: null,
                prepareForHome: null,
                departForHome: null
            };
        } else {
            // Annuler les événements existants seulement si this.scheduledEvents existe
            this._cancelScheduledEvents();
        }

        try {
            // Planifier l'événement de préparation au départ pour le travail
            this.scheduledEvents.prepareForWork = scheduler.scheduleDailyEvent(
                this.departureWorkHour - 1, // Une heure avant l'heure de départ
                60 - this.anticipationMinutes, // Minutes avant l'heure pleine
                this._handlePrepareForWork,
                this,
                { agentId: this.id },
                `agent_${this.id}_prepare_work`
            );
    
            // Planifier l'événement de départ pour le travail
            this.scheduledEvents.departForWork = scheduler.scheduleDailyEvent(
                this.departureWorkHour,
                0,
                this._handleDepartForWork,
                this,
                { agentId: this.id },
                `agent_${this.id}_depart_work`
            );
    
            // Planifier l'événement de préparation au départ pour la maison
            this.scheduledEvents.prepareForHome = scheduler.scheduleDailyEvent(
                this.departureHomeHour - 1, // Une heure avant l'heure de départ
                60 - this.anticipationMinutes, // Minutes avant l'heure pleine
                this._handlePrepareForHome,
                this,
                { agentId: this.id },
                `agent_${this.id}_prepare_home`
            );
    
            // Planifier l'événement de départ pour la maison
            this.scheduledEvents.departForHome = scheduler.scheduleDailyEvent(
                this.departureHomeHour,
                0,
                this._handleDepartForHome,
                this,
                { agentId: this.id },
                `agent_${this.id}_depart_home`
            );
        } catch (error) {
            console.error(`Agent ${this.id}: Erreur lors de la planification des événements:`, error);
            // Assurer que scheduledEvents est toujours dans un état valide
            this.scheduledEvents = {
                prepareForWork: null,
                departForWork: null,
                prepareForHome: null,
                departForHome: null
            };
        }
    }

    /**
     * Annule tous les événements planifiés
     * @private
     */
    _cancelScheduledEvents() {
        const scheduler = this.experience.timeScheduler;
        if (!scheduler) return;

        // Vérifier que scheduledEvents est défini et est un objet
        if (!this.scheduledEvents || typeof this.scheduledEvents !== 'object') {
            console.warn(`Agent ${this.id}: scheduledEvents n'est pas défini ou n'est pas un objet`);
            // Initialiser l'objet s'il n'existe pas
            this.scheduledEvents = {
                prepareForWork: null,
                departForWork: null,
                prepareForHome: null,
                departForHome: null
            };
            return;
        }

        // Annuler chaque événement s'il existe
        Object.keys(this.scheduledEvents).forEach(key => {
            const eventId = this.scheduledEvents[key];
            if (eventId) {
                scheduler.cancelEvent(eventId);
            }
        });

        // Réinitialiser les identifiants
        this.scheduledEvents = {
            prepareForWork: null,
            departForWork: null,
            prepareForHome: null,
            departForHome: null
        };
    }

    /**
     * Gestionnaire d'événement pour la préparation au départ pour le travail
     * @param {Object} eventData - Données de l'événement
     * @private
     */
    _handlePrepareForWork(eventData) {
        console.log(`Agent ${this.id}: Préparation au départ pour le travail`);
        
        // Vérifier que l'agent est à la maison
        if (this.currentState !== AgentState.AT_HOME) {
            console.log(`Agent ${this.id}: Ne peut pas se préparer pour le travail - n'est pas à la maison (état actuel: ${this.currentState})`);
            return;
        }

        // Changer l'état pour indiquer que l'agent se prépare
        this.currentState = AgentState.PREPARING_FOR_WORK;
        
        // Vérifier si un trajet vers le travail est possible
        if (!this.workPosition || !this.homePosition) {
            console.warn(`Agent ${this.id}: Impossible de préparer le trajet vers le travail - positions manquantes`);
            return;
        }

        // Initialiser la demande de chemin
        this.requestPath(
            this.homePosition,
            this.workPosition,
            this.homeGridNode,
            this.workGridNode,
            AgentState.READY_TO_LEAVE_FOR_WORK,
            eventData.currentGameTime
        );
    }

    /**
     * Gestionnaire d'événement pour le départ vers le travail
     * @param {Object} eventData - Données de l'événement
     * @private
     */
    _handleDepartForWork(eventData) {
        console.log(`Agent ${this.id}: Départ pour le travail`);
        
        // Vérifier que l'agent est prêt à partir
        if (this.currentState !== AgentState.READY_TO_LEAVE_FOR_WORK && 
            this.currentState !== AgentState.PREPARING_FOR_WORK) {
            console.log(`Agent ${this.id}: Ne peut pas partir pour le travail - n'est pas prêt (état actuel: ${this.currentState})`);
            return;
        }

        // Si l'agent est en attente d'un chemin, on force le départ quand même
        if (this.currentState === AgentState.PREPARING_FOR_WORK) {
            console.log(`Agent ${this.id}: Forçage du départ pour le travail (était encore en préparation)`);
            
            // Si le chemin n'a pas été reçu, on en demande un nouveau
            if (!this.currentPathPoints || this.currentPathPoints.length === 0) {
                this.requestPath(
                    this.homePosition,
                    this.workPosition,
                    this.homeGridNode,
                    this.workGridNode,
                    AgentState.READY_TO_LEAVE_FOR_WORK,
                    eventData.currentGameTime
                );
                
                // On attendra la prochaine mise à jour pour partir
                return;
            }
        }

        // Démarrer la transition du bâtiment vers le chemin
        const transitionStarted = this.startTransitionFromBuildingToPath(eventData.currentGameTime, 'WORK');
        
        if (transitionStarted) {
            // Définir les temps de départ et d'arrivée
            this.departureTimeGame = eventData.currentGameTime;
            this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
            
            console.log(`Agent ${this.id}: Départ pour le travail à ${new Date(this.departureTimeGame).toISOString()}, arrivée prévue à ${new Date(this.arrivalTmeGame).toISOString()}`);
            
            // Cette transition déclenchera automatiquement le changement d'état vers IN_TRANSIT_TO_WORK
            // une fois terminée (via updateBuildingTransition)
        } else {
            console.warn(`Agent ${this.id}: Impossible de démarrer la transition pour le travail`);
            
            // Forcer le changement d'état sans transition visuelle
            this.currentState = AgentState.IN_TRANSIT_TO_WORK;
            this.isVisible = true;
            this.departureTimeGame = eventData.currentGameTime;
            this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
        }

        // Enregistrer le jour de départ
        const environment = this.experience.world?.environment;
        if (environment) {
            const currentDayNumber = Math.floor(eventData.currentGameTime / environment.dayDurationMs);
            this.lastDepartureDayWork = currentDayNumber;
        }
    }

    /**
     * Gestionnaire d'événement pour la préparation au départ pour la maison
     * @param {Object} eventData - Données de l'événement
     * @private
     */
    _handlePrepareForHome(eventData) {
        console.log(`Agent ${this.id}: Préparation au départ pour la maison`);
        
        // Vérifier que l'agent est au travail
        if (this.currentState !== AgentState.AT_WORK) {
            console.log(`Agent ${this.id}: Ne peut pas se préparer pour la maison - n'est pas au travail (état actuel: ${this.currentState})`);
            return;
        }

        // Changer l'état pour indiquer que l'agent se prépare
        this.currentState = AgentState.PREPARING_FOR_HOME;
        
        // Vérifier si un trajet vers la maison est possible
        if (!this.workPosition || !this.homePosition) {
            console.warn(`Agent ${this.id}: Impossible de préparer le trajet vers la maison - positions manquantes`);
            return;
        }

        // Initialiser la demande de chemin
        this.requestPath(
            this.workPosition,
            this.homePosition,
            this.workGridNode,
            this.homeGridNode,
            AgentState.READY_TO_LEAVE_FOR_HOME,
            eventData.currentGameTime
        );
    }

    /**
     * Gestionnaire d'événement pour le départ vers la maison
     * @param {Object} eventData - Données de l'événement
     * @private
     */
    _handleDepartForHome(eventData) {
        console.log(`Agent ${this.id}: Départ pour la maison`);
        
        // Vérifier que l'agent est prêt à partir
        if (this.currentState !== AgentState.READY_TO_LEAVE_FOR_HOME && 
            this.currentState !== AgentState.PREPARING_FOR_HOME) {
            console.log(`Agent ${this.id}: Ne peut pas partir pour la maison - n'est pas prêt (état actuel: ${this.currentState})`);
            return;
        }

        // Si l'agent est en attente d'un chemin, on force le départ quand même
        if (this.currentState === AgentState.PREPARING_FOR_HOME) {
            console.log(`Agent ${this.id}: Forçage du départ pour la maison (était encore en préparation)`);
            
            // Si le chemin n'a pas été reçu, on en demande un nouveau
            if (!this.currentPathPoints || this.currentPathPoints.length === 0) {
                this.requestPath(
                    this.workPosition,
                    this.homePosition,
                    this.workGridNode,
                    this.homeGridNode,
                    AgentState.READY_TO_LEAVE_FOR_HOME,
                    eventData.currentGameTime
                );
                
                // On attendra la prochaine mise à jour pour partir
                return;
            }
        }

        // Démarrer la transition du bâtiment vers le chemin
        const transitionStarted = this.startTransitionFromBuildingToPath(eventData.currentGameTime, 'HOME');
        
        if (transitionStarted) {
            // Définir les temps de départ et d'arrivée
            this.departureTimeGame = eventData.currentGameTime;
            this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
            
            console.log(`Agent ${this.id}: Départ pour la maison à ${new Date(this.departureTimeGame).toISOString()}, arrivée prévue à ${new Date(this.arrivalTmeGame).toISOString()}`);
            
            // Cette transition déclenchera automatiquement le changement d'état vers IN_TRANSIT_TO_HOME
            // une fois terminée (via updateBuildingTransition)
        } else {
            console.warn(`Agent ${this.id}: Impossible de démarrer la transition pour la maison`);
            
            // Forcer le changement d'état sans transition visuelle
            this.currentState = AgentState.IN_TRANSIT_TO_HOME;
            this.isVisible = true;
            this.departureTimeGame = eventData.currentGameTime;
            this.arrivalTmeGame = this.departureTimeGame + this.calculatedTravelDurationGame;
        }

        // Enregistrer le jour de départ
        const environment = this.experience.world?.environment;
        if (environment) {
            const currentDayNumber = Math.floor(eventData.currentGameTime / environment.dayDurationMs);
            this.lastDepartureDayHome = currentDayNumber;
        }
    }

	initializeLifecycle(homeId, workId) {
        this.homeBuildingId = homeId;
        this.workBuildingId = workId;
        const cityManager = this.experience.world?.cityManager;
        const navManager = cityManager?.navigationManager; // Utiliser NavManager
        const pedestrianNavGraph = navManager?.getNavigationGraph(false); // Obtenir graphe piéton
        const sidewalkHeight = pedestrianNavGraph?.sidewalkHeight ?? this.config?.sidewalkHeight ?? 0.2;

        const homeInfo = cityManager?.getBuildingInfo(this.homeBuildingId);
        if (homeInfo && pedestrianNavGraph) { // Vérifier aussi navGraph
            // Stocker la position du bâtiment lui-même (cube bleu)
            this.homeBuildingPosition = homeInfo.position.clone();
            
            // Trouver le point sur le trottoir le plus proche
            let baseHomePos = homeInfo.position.clone();
            baseHomePos.y = sidewalkHeight;
            this.homeGridNode = pedestrianNavGraph.getClosestWalkableNode(baseHomePos);
            this.homePosition = this.homeGridNode ? pedestrianNavGraph.gridToWorld(this.homeGridNode.x, this.homeGridNode.y) : baseHomePos;
            
            // Position initiale sur le bâtiment, et non sur le trottoir
            this.position.copy(this.homeBuildingPosition);
            this.position.y += this.yOffset; // Appliquer l'offset Y par rapport au sol

            // --- MODIFICATION: Utilisation de vehicleBehavior ---
            // Initialiser la position de garage via vehicleBehavior
            this.vehicleBehavior?._initializeVehicleHomePosition();
            // ----------------------------------------------------

            this.currentState = AgentState.AT_HOME;
            this.isVisible = false;
        } else {
            console.error(`Agent ${this.id}: Infos domicile ${this.homeBuildingId} ou NavGraph piéton non trouvées.`);
            this.currentState = AgentState.IDLE;
            this.isVisible = false;
            return;
        }

        const workInfo = cityManager?.getBuildingInfo(this.workBuildingId);
        if (workInfo && pedestrianNavGraph) { // Vérifier aussi navGraph
            // Stocker la position du bâtiment lui-même (cube bleu)
            this.workBuildingPosition = workInfo.position.clone();
            
            let baseWorkPos = workInfo.position.clone();
            baseWorkPos.y = sidewalkHeight;
            this.workGridNode = pedestrianNavGraph.getClosestWalkableNode(baseWorkPos);
            this.workPosition = this.workGridNode ? pedestrianNavGraph.gridToWorld(this.workGridNode.x, this.workGridNode.y) : baseWorkPos;
        } else {
            // Ne plus logguer si workId est null (c'est normal)
            if (workId) {
                console.warn(`Agent ${this.id}: Infos travail ${this.workBuildingId} ou NavGraph piéton non trouvées.`);
            }
            this.workPosition = null; this.workGridNode = null;
            this.workBuildingPosition = null;
        }

        // Calculer les heures programmées et planifier les événements
        this._calculateScheduledTimes();
    }

    checkNavigationManager() {
        // Vérifier d'abord si le NavigationManager est déjà initialisé
        if (!this.navigationManager) {
            // Essayer d'obtenir le NavigationManager via le CityManager
            const cityManager = this.experience?.world?.cityManager;
            if (!cityManager) {
                console.error(`Agent ${this.id}: CityManager non disponible. Vérifiez que l'expérience et le monde sont correctement initialisés.`);
                return false;
            }

            this.navigationManager = cityManager.navigationManager;
            if (!this.navigationManager) {
                console.error(`Agent ${this.id}: NavigationManager non disponible dans le CityManager. La ville n'est peut-être pas encore générée.`);
                return false;
            }

            // Vérifier que les graphes de navigation sont initialisés
            const isVehicle = this.isInVehicle || this.hasVehicle;
            const graph = this.navigationManager.getNavigationGraph(isVehicle);
            if (!graph) {
                console.error(`Agent ${this.id}: Graphe de navigation ${isVehicle ? 'véhicule' : 'piéton'} non disponible.`);
                return false;
            }

            //console.log(`Agent ${this.id}: NavigationManager initialisé avec succès. Mode: ${isVehicle ? 'véhicule' : 'piéton'}`);
        }

        return true;
    }

    /**
     * Demande un chemin entre deux points via le worker.
     * Calcule les nœuds de grille appropriés en fonction du mode de transport (via vehicleBehavior).
     * @param {THREE.Vector3 | null} startPosWorld - Position de départ mondiale. Null si startNodeOverride est fourni.
     * @param {THREE.Vector3 | null} endPosWorld - Position d'arrivée mondiale. Null si endNodeOverride est fourni.
     * @param {{x: number, y: number} | null} startNodeOverride - Nœud de grille de départ explicite (optionnel).
     * @param {{x: number, y: number} | null} endNodeOverride - Nœud de grille d'arrivée explicite (optionnel).
     * @param {string} nextStateIfSuccess - L'état vers lequel passer si le chemin est trouvé.
     * @param {number} currentGameTimeForStats - Temps de jeu actuel pour les statistiques.
     */
    requestPath(startPosWorld, endPosWorld, startNodeOverride = null, endNodeOverride = null, nextStateIfSuccess, currentGameTimeForStats) {
        // ... (Le début de cette méthode reste globalement inchangé, y compris les logs et la gestion du timeout) ...
        // ... (On récupère agentManager, cityManager, navigationManager comme avant) ...
        // ... (On détermine isVehicle en utilisant this.vehicleBehavior.isDriving() comme avant) ...
        // ... (On détermine requestingState comme avant) ...
        // ... (Vérifications préliminaires des managers comme avant) ...

        const agentManager = this.experience.world?.agentManager;
        const cityManager = this.experience.world?.cityManager;
        const navigationManager = cityManager?.navigationManager;

        // --- MODIFICATION: Utilisation de vehicleBehavior ---
        let isVehicle = this.vehicleBehavior?.isDriving() ?? false;
        // --------------------------------------------------

        if (this.currentState === AgentState.WEEKEND_WALK_REQUESTING_PATH || nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_COMMERCIAL) {
            if (isVehicle) console.warn(`Agent ${this.id}: Forçage mode PIÉTON pour requête WEEKEND_WALK ou COMMERCIAL (était ${isVehicle}).`);
            isVehicle = false; // Toujours piéton pour promenade et achat médicament
        }

        // --- Partie inchangée ---
        this.targetStateFromWeekendWalk = nextStateIfSuccess; // Pour le retour de promenade

        this.currentPathPoints = null; this.calculatedTravelDurationGame = 0; this.departureTimeGame = -1; this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0; this.visualInterpolationProgress = 0; this.currentPathLengthWorld = 0;

        let requestingState = AgentState.WAITING_FOR_PATH;
        if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_WORK) {
            requestingState = AgentState.REQUESTING_PATH_FOR_WORK;
            this._currentPathRequestGoal = 'WORK';
        } else if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_HOME) {
            requestingState = AgentState.REQUESTING_PATH_FOR_HOME;
            this._currentPathRequestGoal = 'HOME';
        } else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_READY) {
            requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
            this._currentPathRequestGoal = 'WALK';
        } else if (nextStateIfSuccess === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
            requestingState = AgentState.WEEKEND_WALK_REQUESTING_PATH;
            this._currentPathRequestGoal = 'WALK_RETURN_SIDEWALK';
        } else if (nextStateIfSuccess === AgentState.READY_TO_LEAVE_FOR_COMMERCIAL) {
            requestingState = AgentState.REQUESTING_PATH_FOR_COMMERCIAL;
            this._currentPathRequestGoal = 'COMMERCIAL';
        }
        
        this.currentState = requestingState;
        this.isVisible = false; // Cache l'agent pendant la requête
        this._pathRequestTimeout = this.experience.time.elapsed;
        

        if (agentManager?.stats) {
            const dayDurationMs = this.experience.world?.environment?.dayDurationMs || (24 * 60 * 60 * 1000);
            const currentHour = Math.floor((currentGameTimeForStats % dayDurationMs) / (dayDurationMs / 24));
            if (requestingState === AgentState.REQUESTING_PATH_FOR_WORK) agentManager.stats.requestingPathForWorkByHour[currentHour]++;
            else if (requestingState === AgentState.REQUESTING_PATH_FOR_HOME) agentManager.stats.requestingPathForHomeByHour[currentHour]++;
        }

        if (!navigationManager || !agentManager || !agentManager.isWorkerInitialized) {
            console.error(`Agent ${this.id}: Managers non prêts pour requête path.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats); // Utiliser récupération
            return;
        }

        const navigationGraph = navigationManager.getNavigationGraph(isVehicle);

        if (!navigationGraph) {
            console.error(`Agent ${this.id}: NavigationGraph non disponible pour mode ${isVehicle ? 'véhicule' : 'piéton'}.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats);
            return;
        }

        // --- Calcul des Nœuds de Départ et d'Arrivée (INCHANGÉ - utilise le bon graphe récupéré au-dessus) ---
        let startNode = null; let endNode = null;
        if (startNodeOverride && typeof startNodeOverride.x === 'number' && typeof startNodeOverride.y === 'number') startNode = startNodeOverride;
        if (endNodeOverride && typeof endNodeOverride.x === 'number' && typeof endNodeOverride.y === 'number') endNode = endNodeOverride;
        if (!startNode && startPosWorld instanceof THREE.Vector3) startNode = navigationGraph.getClosestWalkableNode(startPosWorld);
        if (!endNode && endPosWorld instanceof THREE.Vector3) endNode = navigationGraph.getClosestWalkableNode(endPosWorld);

        // --- Vérification Finale des Nœuds Calculés (INCHANGÉ) ---
        if (!startNode || !endNode || typeof startNode.x !== 'number' || typeof startNode.y !== 'number' || typeof endNode.x !== 'number' || typeof endNode.y !== 'number') {
            console.error(`Agent ${this.id} (${isVehicle ? 'véhicule' : 'piéton'}): Nœud départ ou arrivée MANQUANT/INVALID après calcul. Start: ${JSON.stringify(startNode)}, End: ${JSON.stringify(endNode)}. Forcing recovery.`);
            this.forceRecoverFromTimeout(currentGameTimeForStats);
            return;
        }
        // --- Visualisation Debug (INCHANGÉ) ---
        // ... (logique showStartNodeDebugSphere / showEndNodeDebugSphere) ...
        if (this.experience.isDebugMode && this.experience.world && startNode && endNode) {
            const vizNavGraph = navigationManager.getNavigationGraph(isVehicle);
            if (vizNavGraph) {
                const startWorldPosViz = vizNavGraph.gridToWorld(startNode.x, startNode.y);
                const endWorldPosViz = vizNavGraph.gridToWorld(endNode.x, endNode.y);
                this.experience.world.showStartNodeDebugSphere(startWorldPosViz);
                this.experience.world.showEndNodeDebugSphere(endWorldPosViz);
            }
       }

        // --- Vérification Format Nœuds avant Envoi (INCHANGÉ) ---
        // ... (vérification Number.isInteger etc.) ...
        if (!Number.isInteger(startNode.x) || startNode.x < 0 || !Number.isInteger(startNode.y) || startNode.y < 0 ||
            !Number.isInteger(endNode.x) || endNode.x < 0 || !Number.isInteger(endNode.y) || endNode.y < 0) {
             console.error(`Agent ${this.id}: FORMAT NOEUDS INVALIDE (non-entier ou négatif) AVANT ENVOI WORKER! Start:`, startNode, "End:", endNode);
             this.forceRecoverFromTimeout(currentGameTimeForStats);
             return;
         }

        // --- LOG AVANT WORKER (INCHANGÉ) ---
        // ... (log des positions/nœuds) ...
         //console.log(`[AGENT ${this.id} PATH_REQ] Mode: ${isVehicle ? 'Veh' : 'Ped'}, StartW: (${startPosWorld?.x.toFixed(1)}, ${startPosWorld?.z.toFixed(1)}), EndW: (${endPosWorld?.x.toFixed(1)}, ${endPosWorld?.z.toFixed(1)}), StartN: (${startNode.x},${startNode.y}), EndN: (${endNode.x},${endNode.y}), NextState: ${nextStateIfSuccess}`);

        // --- Envoi de la Requête au Worker (INCHANGÉ - passe bien isVehicle) ---
        agentManager.requestPathFromWorker(this.id, startNode, endNode, isVehicle);
    }

	/**
     * Définit le chemin à suivre pour l'agent et met à jour son état.
     * Appelée par AgentManager lorsque le worker renvoie un résultat de pathfinding.
     * @param {Array<THREE.Vector3> | null} pathPoints - Tableau de points du chemin en coordonnées monde, ou null si échec.
     * @param {number} pathLengthWorld - Longueur calculée du chemin en unités monde.
     */
    setPath(pathPoints, pathLengthWorld) {
        //console.log(`[Agent ${this.id} DEBUG] Entrée dans setPath. État actuel: ${this.currentState}. Longueur reçue: ${pathLengthWorld}`);

        const currentStateAtCall = this.currentState;
        const wasRequestingWork = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_WORK;
        const wasRequestingHome = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME;
        const wasRequestingWeekendWalk = currentStateAtCall === AgentState.WEEKEND_WALK_REQUESTING_PATH;
        const wasRequestingCommercial = currentStateAtCall === AgentState.REQUESTING_PATH_FOR_COMMERCIAL;
        const targetStateFromWeekendWalk = this.targetStateFromWeekendWalk;

        const environment = this.experience.world?.environment;
        const calendarInfo = environment?.getCurrentCalendarDate ? environment.getCurrentCalendarDate() : null;
        const isCurrentlyWeekend = calendarInfo ? ["Samedi", "Dimanche"].includes(calendarInfo.jourSemaine) : false;

        // --- Cas 1: Chemin Valide Reçu ---
        if (pathPoints && Array.isArray(pathPoints) && pathPoints.length > 0 && (pathPoints.length === 1 || pathLengthWorld > 0.1)) {
            const isInstantArrival = pathLengthWorld < 0.01 || pathPoints.length === 1;
            if (isInstantArrival) {
                if (wasRequestingWork) { this.currentState = AgentState.AT_WORK; this.lastArrivalTimeWork = this.experience.time.elapsed; }
                else if (wasRequestingHome) { this.currentState = AgentState.AT_HOME; this.lastArrivalTimeHome = this.experience.time.elapsed; }
                else if (wasRequestingWeekendWalk) { this.currentState = AgentState.AT_HOME; this.weekendBehavior.resetWeekendState(); }
                else if (wasRequestingCommercial) { this.currentState = AgentState.AT_COMMERCIAL; }
                this.currentPathPoints = null; this.currentPathLengthWorld = 0; this.calculatedTravelDurationGame = 0;
                this.departureTimeGame = -1; this.arrivalTmeGame = -1; this.hasReachedDestination = false;
                this.isVisible = false; this._pathRequestTimeout = null;
                //console.log(`[Agent ${this.id} DEBUG] Arrivée instantanée détectée. État final : ${this.currentState}`);
                return;
            }
            //console.log(`[Agent ${this.id} DEBUG] setPath: Chemin VALIDE reçu (${pathPoints.length} points, longueur ${pathLengthWorld.toFixed(2)}).`);

            if (currentStateAtCall === AgentState.REQUESTING_PATH_FOR_HOME && this.weekendBehavior.weekendWalkEndTime > 0 && pathPoints.length > 0) {
                const startPoint = pathPoints[0]; const distanceToStartSq = this.position.distanceToSquared(startPoint);
                if (distanceToStartSq > 25.0) {
                    console.warn(`Agent ${this.id}: Correction téléportation! Distance chemin retour maison: ${Math.sqrt(distanceToStartSq).toFixed(2)}m.`);
                    pathPoints[0] = this.position.clone();
                }
            }

            this.currentPathPoints = pathPoints.map(p => p.clone());
            this.currentPathLengthWorld = pathLengthWorld;

            // --- CORRECTION: Estimer les distances de transition ---
            // Estimer la distance de transition du bâtiment au début du chemin
            let startTransitionDistance = 0;
            let endTransitionDistance = 0;
            
            if (wasRequestingWork && this.homeBuildingPosition && this.homePosition) {
                startTransitionDistance = this.homeBuildingPosition.distanceTo(this.homePosition);
            } else if (wasRequestingHome && this.workBuildingPosition && this.workPosition) {
                startTransitionDistance = this.workBuildingPosition.distanceTo(this.workPosition);
            }
            
            if (wasRequestingWork && this.workBuildingPosition && this.workPosition) {
                endTransitionDistance = this.workPosition.distanceTo(this.workBuildingPosition);
            } else if (wasRequestingHome && this.homeBuildingPosition && this.homePosition) {
                endTransitionDistance = this.homePosition.distanceTo(this.homeBuildingPosition);
            }
            
            // Ajouter les distances de transition au chemin total
            const totalPathLengthWithTransitions = pathLengthWorld + startTransitionDistance + endTransitionDistance;
            // ------------------------------------------------------

            // --- Calcul durée trajet (utilise vehicleBehavior) ---
            const isDriving = this.vehicleBehavior?.isDriving() ?? false;
            const car = isDriving ? this.vehicleBehavior.currentVehicle : null;
            // Utilise la vitesse de la voiture si elle conduit, sinon la vitesse de base de l'agent
            const speed = isDriving ? (car?.speed ?? this.config.carSpeed) : this.agentBaseSpeed;
            // --------------------------------------------------
            if (speed > 0 && totalPathLengthWithTransitions > 0) {
                const travelSecondsGame = totalPathLengthWithTransitions / speed;
                const dayDurationMs = this.experience.world?.environment?.dayDurationMs;
                if (dayDurationMs > 0) {
                    const travelRatioOfDay = travelSecondsGame / (dayDurationMs / 1000);
                    this.calculatedTravelDurationGame = travelRatioOfDay * dayDurationMs;
                } else {
                    console.error(`Agent ${this.id}: dayDurationMs invalide (${dayDurationMs}) pour calcul durée trajet. Fallback.`);
                    this.calculatedTravelDurationGame = 10 * 60 * 1000; // 10 mins jeu
                    this.currentPathLengthWorld = 0; // Longueur invalide dans ce cas
                }
            } else {
                 this.calculatedTravelDurationGame = 10 * 60 * 1000; // Fallback
                 this.currentPathLengthWorld = 0; // Longueur invalide
            }

            // --- Transition d'état ---
            let nextState = this.currentState;
            if (wasRequestingWork) {
                // L'état READY est commun, que ce soit en voiture ou à pied.
                // AgentStateMachine gérera la transition vers DRIVING ou IN_TRANSIT.
                nextState = AgentState.READY_TO_LEAVE_FOR_WORK;
            } else if (wasRequestingHome) {
                nextState = AgentState.READY_TO_LEAVE_FOR_HOME;
            } else if (wasRequestingCommercial) {
                nextState = AgentState.READY_TO_LEAVE_FOR_COMMERCIAL;
            } else if (wasRequestingWeekendWalk) {
                if (isCurrentlyWeekend) {
                     nextState = (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK)
                                 ? AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK
                                 : AgentState.WEEKEND_WALK_READY;
                } else {
                    console.warn(`[Agent ${this.id} WARN] setPath: Chemin promenade reçu mais weekend terminé. Annulation.`);
                    this.currentPathPoints = null; this.currentPathLengthWorld = 0; this.calculatedTravelDurationGame = 0;
                    nextState = AgentState.AT_HOME; this.weekendBehavior.resetWeekendState();
                }
            } else {
                console.warn(`[Agent ${this.id} WARN] setPath: Chemin valide reçu mais état initial (${currentStateAtCall}) non géré.`);
                nextState = this.currentState; // Garder l'état actuel
            }
            //console.log(`[Agent ${this.id} DEBUG] setPath: Changement d'état de ${currentStateAtCall} vers ${nextState}`);
            this.currentState = nextState;

            //console.log(`[Agent ${this.id} DEBUG] setPath (succès): Annulation du _pathRequestTimeout.`);
            this._pathRequestTimeout = null; // Annuler le timer car le chemin est reçu

        }
        // --- Cas 2: Chemin Invalide ou Échec Pathfinding ---
        else {
            console.warn(`[Agent ${this.id} DEBUG] setPath: Chemin INVALIDE reçu (path: ${pathPoints ? 'Array['+pathPoints.length+']' : 'null'}, length: ${pathLengthWorld}). État au moment de l'appel: ${currentStateAtCall}`);

            this.currentPathPoints = null; this.calculatedTravelDurationGame = 0; this.currentPathLengthWorld = 0;
            this.departureTimeGame = -1; this.arrivalTmeGame = -1; this.currentPathIndexVisual = 0; this.visualInterpolationProgress = 0;

            // --- Logique de Fallback : Synchro vers état cible ---
            let fallbackState = this.currentState; let teleportPosition = null; let forceVisibilityFalse = true;

            if (wasRequestingWork) {
                console.warn(`[Agent ${this.id} SYNC] Pathfinding WORK échoué. Forçage état AT_WORK et téléportation.`);
                fallbackState = AgentState.AT_WORK; teleportPosition = this.workPosition;
                this.lastArrivalTimeWork = this.experience.time.elapsed; this.requestedPathForDepartureTime = -1;
                // --- Sortir du véhicule si nécessaire ---
                this.vehicleBehavior?.exitVehicle();
                // ---------------------------------------
            } else if (wasRequestingHome) {
                console.warn(`[Agent ${this.id} SYNC] Pathfinding HOME échoué. Forçage état AT_HOME et téléportation.`);
                fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                this.lastArrivalTimeHome = this.experience.time.elapsed; this.requestedPathForDepartureTime = -1;
                 // --- Sortir du véhicule si nécessaire ---
                 this.vehicleBehavior?.exitVehicle();
                 // ---------------------------------------
            } else if (wasRequestingCommercial) {
                console.warn(`[Agent ${this.id} SYNC] Pathfinding COMMERCIAL échoué. Forçage état AT_HOME et téléportation.`);
                fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                // ---------------------------------------
            } else if (wasRequestingWeekendWalk) {
                 // --- Sortir du véhicule (même si improbable) ---
                 this.vehicleBehavior?.exitVehicle();
                 // --------------------------------------------
                 console.warn(`[Agent ${this.id} WARN] Pathfinding WEEKEND WALK échoué (état cible: ${targetStateFromWeekendWalk}).`);
                if (isCurrentlyWeekend) {
                    if (targetStateFromWeekendWalk === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK) {
                         console.warn(`[Agent ${this.id}] Échec retour trottoir.`);
                         if (this.weekendBehavior.parkSidewalkPosition) {
                             this.position.copy(this.weekendBehavior.parkSidewalkPosition).setY(this.yOffset);
                             this.weekendBehavior.isInsidePark = false; forceVisibilityFalse = false;
                             //console.log(`[Agent ${this.id}] Téléporté au trottoir. Redemande chemin maison.`);
                             fallbackState = AgentState.REQUESTING_PATH_FOR_HOME; this._pathRequestTimeout = this.experience.time.elapsed;
                             const currentGridNode = this.experience.world?.cityManager?.navigationManager?.getNavigationGraph(false)?.getClosestWalkableNode(this.position);
                             this.requestPath(this.position, this.homePosition, currentGridNode, this.homeGridNode, AgentState.READY_TO_LEAVE_FOR_HOME, this.experience.time.elapsed);
                             //console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après requête retour maison.`); return;
                         } else {
                             console.warn(`[Agent ${this.id}] Position trottoir inconnue. Forçage maison.`); this.forceReturnHome(this.experience.time.elapsed);
                             fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                         }
                    } else { // Échec requête initiale promenade
                         console.warn(`[Agent ${this.id}] Échec pathfinding promenade initiale.`);
                         const foundNew = this.weekendBehavior._findRandomWalkDestination(this.experience.time.elapsed);
                         if (!foundNew) {
                             console.warn(`[Agent ${this.id}] Impossible de trouver une autre destination. Retour AT_HOME.`);
                             fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition;
                         } else { 
							//console.log(`[Agent ${this.id} DEBUG] Sortie anticipée de setPath après nouvelle requête promenade.`);
							return; 
						}
                    }
                } else { // Weekend terminé
                     console.warn(`[Agent ${this.id} SYNC] Pathfinding promenade échoué ET weekend terminé.`); fallbackState = AgentState.AT_HOME;
                     teleportPosition = this.homePosition; this.weekendBehavior.resetWeekendState();
                }
            } else { // Cas inattendu
                console.warn(`[Agent ${this.id} WARN] setPath: Chemin invalide reçu mais état initial (${currentStateAtCall}) non géré.`);
                if (this.workPosition && Math.abs(this.experience.time.elapsed - this.lastArrivalTimeWork) < Math.abs(this.experience.time.elapsed - this.lastArrivalTimeHome)) {
                    fallbackState = AgentState.AT_WORK; teleportPosition = this.workPosition;
                } else { fallbackState = AgentState.AT_HOME; teleportPosition = this.homePosition; }
            }

            // --- Appliquer l'état et la téléportation ---
            //console.log(`[Agent ${this.id} DEBUG] setPath (échec): Changement d'état vers ${fallbackState}.`); this.currentState = fallbackState;
            if (teleportPosition) { console.log(`[Agent ${this.id} DEBUG] Téléportation vers ${fallbackState}.`); this.position.copy(teleportPosition).setY(this.yOffset); }
            if (forceVisibilityFalse) { this.isVisible = false; }

            //console.log(`[Agent ${this.id} DEBUG] setPath (échec): Annulation du _pathRequestTimeout.`); this._pathRequestTimeout = null;
        }
        //console.log(`[Agent ${this.id} DEBUG] Sortie de setPath. État final: ${this.currentState}`);
    }

    /**
     * Met à jour l'état logique de l'agent en déléguant à AgentStateMachine.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentHour - Heure actuelle du jeu (0-23).
     * @param {CalendarDate|null} calendarDate - Date du jeu.
     * @param {number} currentGameTime - Temps actuel du jeu (ms).
     */
    update(deltaTime, currentHour, calendarDate, currentGameTime) {
        // Vérifier que currentGameTime est un nombre
        if (typeof currentGameTime !== 'number') {
            console.warn(`Agent ${this.id}: currentGameTime n'est pas un nombre dans Agent.update:`, currentGameTime);
            currentGameTime = this.experience.time.elapsed;
        }
        
        // Mise à jour de la state machine (mise à jour d'état logique)
        if (this.stateMachine) {
            this.stateMachine.update(deltaTime, currentHour, calendarDate, currentGameTime);
        }

        // --- Distance Camera Handling & LOD ---
        // Obtenez la caméra via Experience
        const camera = this.experience.camera?.instance;
        
        if (camera) {
            const cameraDistance = camera.position.distanceTo(this.position);
            this.isLodActive = cameraDistance > this.lodDistance;
        } else {
            this.isLodActive = false;
        }
        // ---------------------------------------

        // Si le timeScale est très élevé (> 128), synchroniser immédiatement l'état et la position
        if (this.experience?.time?.timeScale > 128) {
            this._correctStateBasedOnTime(currentGameTime, currentHour, currentGameTime % (this.experience.world?.environment?.dayDurationMs || 86400000));
        }
        // Vérifier uniquement lors de transitions critiques, basées sur l'heure
        else if (currentHour === this.departureWorkHour || 
                 currentHour === this.departureHomeHour || 
                 currentHour === 9 || 
                 currentHour === 19) {
            
            // Vérifier si l'état actuel est cohérent avec l'heure
            if ((currentHour === this.departureWorkHour && this.currentState === AgentState.READY_TO_LEAVE_FOR_WORK) ||
                (currentHour === this.departureHomeHour && this.currentState === AgentState.READY_TO_LEAVE_FOR_HOME) ||
                (currentHour === 9 && this.currentState === AgentState.IN_TRANSIT_TO_WORK) ||
                (currentHour === 19 && this.currentState === AgentState.IN_TRANSIT_TO_HOME)) {
                
                const timeWithinCurrentDayCycle = currentGameTime % (this.experience.world?.environment?.dayDurationMs || 86400000);
                this._correctStateBasedOnTime(currentGameTime, currentHour, timeWithinCurrentDayCycle);
            }
        }

        // Vérifier si le temps d'arrivée est dépassé 
        if ((this.currentState === AgentState.IN_TRANSIT_TO_WORK || 
             this.currentState === AgentState.IN_TRANSIT_TO_HOME) && 
            this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame &&
            !this.isMovingFromPathToBuilding) {
            
            // Démarrer la transition vers le bâtiment plutôt que téléporter directement
            if (this.currentState === AgentState.IN_TRANSIT_TO_WORK) {
                this._enterBuilding(currentGameTime, 'WORK');
            } else if (this.currentState === AgentState.IN_TRANSIT_TO_HOME) {
                this._enterBuilding(currentGameTime, 'HOME');
            }
        }

        // Utiliser la méthode updateVisual pour gérer le déplacement et l'animation
        this.updateVisual(deltaTime, currentGameTime);
    }

    /**
     * Force la récupération depuis un état bloqué.
     * @param {number} currentGameTime - Le temps de jeu actuel en ms.
     */
    forceRecoverFromTimeout(currentGameTime) {
        console.warn(`Agent ${this.id}: forceRecoverFromTimeout appelé (état=${this.currentState}).`);
        
        // Nettoyer les données de chemin
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.currentPathLengthWorld = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        this.hasReachedDestination = false;
        this._pathRequestTimeout = null;

        // --- Tentative de déterminer le meilleur état cible ---
        let targetState = AgentState.AT_HOME; // État par défaut
        let teleportPosition = this.homePosition;

        switch (this.currentState) {
            case AgentState.IN_TRANSIT_TO_WORK:
            case AgentState.DRIVING_TO_WORK:
            case AgentState.REQUESTING_PATH_FOR_WORK:
            case AgentState.READY_TO_LEAVE_FOR_WORK:
                // En route vers le travail : récupération vers AT_WORK
                if (this.workPosition) {
                    targetState = AgentState.AT_WORK;
                    teleportPosition = this.workPosition;
                    this.lastArrivalTimeWork = currentGameTime;
                    //console.log(`Agent ${this.id}: Récupération -> ${targetState}`);
                }
                break;
            
            case AgentState.IN_TRANSIT_TO_HOME:
            case AgentState.DRIVING_HOME:
            case AgentState.REQUESTING_PATH_FOR_HOME:
            case AgentState.READY_TO_LEAVE_FOR_HOME:
                // En route vers la maison : récupération vers AT_HOME
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    this.lastArrivalTimeHome = currentGameTime;
                    //console.log(`Agent ${this.id}: Récupération -> ${targetState}`);
                }
                break;

            case AgentState.IN_TRANSIT_TO_COMMERCIAL:
            case AgentState.REQUESTING_PATH_FOR_COMMERCIAL:
            case AgentState.READY_TO_LEAVE_FOR_COMMERCIAL:
            case AgentState.AT_COMMERCIAL: // Ajout de AT_COMMERCIAL pour la récupération
                // En route vers un commercial ou bloqué au commercial : récupération vers AT_HOME
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    //console.log(`Agent ${this.id}: Récupération (échec/blocage achat) -> ${targetState}`);
                }
                break;
                
            case AgentState.WEEKEND_WALK_REQUESTING_PATH:
            case AgentState.WEEKEND_WALK_READY:
            case AgentState.WEEKEND_WALKING:
            case AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK:
                // Promenade weekend : récupération vers AT_HOME et nettoyage
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    // Réinitialiser l'état de weekend
                    this.weekendBehavior?.resetWeekendState();
                    //console.log(`Agent ${this.id}: Récupération (état weekend) -> ${targetState}`);
                }
                break;
                
            default:
                // Autres cas : récupération par défaut vers AT_HOME
                if (this.homePosition) {
                    targetState = AgentState.AT_HOME;
                    teleportPosition = this.homePosition;
                    //console.log(`Agent ${this.id}: Récupération (état autre) -> ${targetState}`);
                } else if (this.workPosition) {
                    // Fallback si pas de homePosition
                    targetState = AgentState.AT_WORK;
                    teleportPosition = this.workPosition;
                    //console.log(`Agent ${this.id}: Récupération (sans maison) -> ${targetState}`);
                } else {
                    // Cas catastrophique: ni domicile ni travail. Laisser en IDLE.
                    targetState = AgentState.IDLE;
                    teleportPosition = null;
                    console.warn(`Agent ${this.id}: Récupération GRAVE (ni maison ni travail).`);
                }
                break;
        }

        // Sortir du véhicule si nécessaire
        this.vehicleBehavior?.exitVehicle();
        
        // Appliquer l'état cible
        this.currentState = targetState;
        this.isVisible = false; // Cacher l'agent
        
        // Téléporter vers la position cible si disponible
        if (teleportPosition) {
            this.position.copy(teleportPosition).setY(teleportPosition.y + this.yOffset);
        }
        
        // Réinitialiser le timer d'état
        this._stateStartTime = null;
        
        //console.log(`Agent ${this.id}: forceRecoverFromTimeout TERMINÉ (nouvel état=${this.currentState}).`);
    }

	/**
     * Met à jour la position et l'orientation VISUELLE de l'agent.
     * Délègue le mouvement piéton à AgentMovement.
     * Gère la synchronisation avec la voiture via AgentVehicleBehavior.
     * Calcule l'animation via AgentAnimation.
     *
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {number} currentGameTime - Temps de jeu total (ms).
     */
    updateVisual(deltaTime, currentGameTime) {
        // Gestion des transitions bâtiment<->chemin
        if (this.isMovingFromBuildingToPath || this.isMovingFromPathToBuilding) {
            const transitionCompleted = this.updateBuildingTransition(currentGameTime);
            // Log pour le débogage
            if (transitionCompleted) {
                console.log(`Agent ${this.id}: Transition complétée. isMovingFromBuildingToPath=${this.isMovingFromBuildingToPath}, isMovingFromPathToBuilding=${this.isMovingFromPathToBuilding}`);
            }
            return;
        }
        
        // Vérifier si l'agent est dans un état de déplacement
        const isDriving = this.vehicleBehavior?.isDriving() ?? false;
        const isMoving = 
            this.currentState === AgentState.IN_TRANSIT_TO_WORK ||
            this.currentState === AgentState.IN_TRANSIT_TO_HOME ||
            this.currentState === AgentState.WEEKEND_WALKING ||
            this.currentState === AgentState.WEEKEND_WALK_RETURNING_TO_SIDEWALK || 
            this.currentState === AgentState.IN_TRANSIT_TO_COMMERCIAL || // Ajout état IN_TRANSIT_TO_COMMERCIAL
            isDriving;

        if (!isMoving) {
            // Agent immobile - Positions "fixes" par état
            if (this.currentState === AgentState.AT_HOME && this.homePosition) {
                this.position.copy(this.homeBuildingPosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_WORK && this.workPosition) {
                this.position.copy(this.workBuildingPosition).setY(this.yOffset);
            } else if (this.currentState === AgentState.AT_COMMERCIAL && this.medicationBehavior?.commercialPosition) {
                // Si AT_COMMERCIAL, positionner à la position du magasin (même s'il est invisible)
                this.position.copy(this.medicationBehavior.commercialPosition).setY(this.yOffset);
            }
            // Réinitialiser animation
            if (this.animationHandler) this.animationHandler.resetMatrices();
            this.currentAnimationMatrix = this.animationHandler?.animationMatrices; // Assurer synchro matrice
            return;
        }

        // --- Si l'agent CONDUIT --- 
        if (isDriving) {
            const carPosition = this.vehicleBehavior.getVehiclePosition();
            const carOrientation = this.vehicleBehavior.getVehicleOrientation();
            this.position.copy(carPosition); 
            this.orientation.copy(carOrientation);
            
            // Met à jour les matrices d'animation
            if (this.animationHandler) {
                this.animationHandler.updateCar(this.isLodActive);
                this.currentAnimationMatrix = this.animationHandler.animationMatrices;
            }
            return; 
        }

        // --- AGENT PIÉTON SEULEMENT APRÈS CE POINT ---

        // Si pas de chemin actuel, sortir
        if (!this.currentPathPoints || this.currentPathPoints.length === 0 || this.currentPathLengthWorld <= 0) {
            return;
        }

        // === CORRECTION: Vérifier d'abord si le temps d'arrivée est atteint ===
        // Cela garantit que l'agent entre dans le bâtiment exactement au temps calculé
        if (!this.hasReachedDestination && this.arrivalTmeGame > 0 && currentGameTime >= this.arrivalTmeGame) {
            console.log(`Agent ${this.id}: Temps d'arrivée atteint dans updateVisual - entrée immédiate dans le bâtiment`);
            
            // Pour plus de sécurité, forcer immédiatement l'entrée dans le bâtiment
            if (this.currentState === AgentState.IN_TRANSIT_TO_WORK) {
                this._enterBuilding(currentGameTime, 'WORK');
            } else if (this.currentState === AgentState.IN_TRANSIT_TO_HOME) {
                this._enterBuilding(currentGameTime, 'HOME');
            }
            return;
        }

        // Vérifier si destination déjà atteinte spatialement
        const lastPoint = this.currentPathPoints[this.currentPathPoints.length - 1];
        const distanceToLastPointSq = this.position.distanceToSquared(lastPoint);
        
        // CORRECTION: Réduire la tolérance à une valeur très petite mais non nulle pour garantir une détection précise
        const minToleranceSq = 0.01; // Valeur très petite mais non nulle
        
        // Vérifier si l'agent est arrivé à destination pour entrer directement dans le bâtiment
        if (!this.hasReachedDestination && distanceToLastPointSq <= Math.max(this.reachToleranceSq, minToleranceSq)) {
            console.log(`Agent ${this.id}: A atteint la destination dans updateVisual (distance: ${Math.sqrt(distanceToLastPointSq).toFixed(2)})`);
            
            // Force l'entrée directe dans le bâtiment sans délai
            if (this.currentState === AgentState.IN_TRANSIT_TO_WORK) {
                this._enterBuilding(currentGameTime, 'WORK');
            } else if (this.currentState === AgentState.IN_TRANSIT_TO_HOME) {
                this._enterBuilding(currentGameTime, 'HOME');
            }
            
            return;
        }

        // Calculer la progression sur le chemin
        if (this.departureTimeGame > 0 && this.arrivalTmeGame > 0) {
            // Calculation du pourcentage de progression et en s'assurant d'être entre 0-1
            let calculatedProgress;
            const totalTravelTimeNeeded = this.arrivalTmeGame - this.departureTimeGame;
            
            // Vérifier que le temps total n'est pas négatif ou 0
            if (totalTravelTimeNeeded <= 0) {
                calculatedProgress = 1.0; // Au cas où: 100% de progression
            } else {
                // Combien de temps s'est écoulé depuis le départ par rapport au temps total nécessaire
        const elapsedTimeSinceDeparture = currentGameTime - this.departureTimeGame;
                calculatedProgress = Math.min(1.0, Math.max(0.0, elapsedTimeSinceDeparture / totalTravelTimeNeeded));
            }
            
            this.visualInterpolationProgress = calculatedProgress;
        }

        // --- Mise à jour du mouvement ---
        if (this.movementHandler) {
            // Appelle le gestionnaire de mouvement pour calculer position et orientation
            this.currentPathIndexVisual = this.movementHandler.updatePedestrianMovement(
                deltaTime,
                this.currentPathPoints,
                this.currentPathLengthWorld,
                this.visualInterpolationProgress,
                this.currentPathIndexVisual // Passe l'index actuel
            );
        } else {
            console.error(`Agent ${this.id}: movementHandler non défini.`);
            // Fallback: se placer sur le dernier point si pas de handler
            if (this.currentPathPoints && this.currentPathPoints.length > 0) {
                this.position.copy(this.currentPathPoints[this.currentPathPoints.length - 1]).setY(this.yOffset);
            }
        }
        // -----------------------------------------

        // --- Calcul de l'animation (reste ici) ---
        if (this.animationHandler) {
            const effectiveAnimationSpeed = this.visualSpeed * (this.config?.agentAnimationSpeedFactor ?? 1.0);
            const walkTime = currentGameTime / 1000 * effectiveAnimationSpeed;
            this.animationHandler.update(walkTime, this.isLodActive); // Met à jour les matrices internes
            this.currentAnimationMatrix = this.animationHandler.animationMatrices; // Récupère les matrices à jour
        } else {
            this._resetAnimationMatrices(); // Fallback
        }
        // ----------------------------------------
    }

    // Nouvelle méthode pour réinitialiser les matrices d'animation
    _resetAnimationMatrices() {
        // Réinitialiser toutes les matrices d'animation à l'identité
        Object.keys(this.currentAnimationMatrix).forEach(key => {
            this.currentAnimationMatrix[key].identity();
        });
    }

    // Ajouter une méthode pour calculer et définir le prochain contrôle d'état nécessaire
    _calculateAndSetNextCheckTime(currentGameTime, recalculate = false) {
        // Calculer le prochain contrôle d'état nécessaire
        const nextCheckTime = currentGameTime + 10000; // 10 secondes à partir de maintenant
        this._nextStateCheckTime = nextCheckTime;
        if (recalculate) {
            this._nextStateCheckTime = currentGameTime + 10000; // 10 secondes à partir de maintenant
        }
    }

    /**
     * Démarre une transition du bâtiment vers le point de départ du chemin
     * @param {number} currentGameTime - Le temps de jeu actuel
     * @param {string} goal - "WORK" ou "HOME" pour indiquer la direction
     */
    startTransitionFromBuildingToPath(currentGameTime, goal) {
        // Si une transition est déjà en cours, ne pas la réinitialiser
        if (this.isMovingFromBuildingToPath || this.isMovingFromPathToBuilding) {
            // Déjà en transition, renvoyer true pour indiquer que la transition est en cours
            return true;
        }
        
        // Déterminer les points de départ et d'arrivée
        let startPos, endPos;
        
        if (goal === 'WORK') {
            startPos = this.homeBuildingPosition.clone();
            endPos = this.homePosition.clone();
        } else if (goal === 'HOME') {
            startPos = this.workBuildingPosition.clone();
            endPos = this.workPosition.clone();
        } else {
            console.error(`Agent ${this.id}: startTransitionFromBuildingToPath avec goal invalide: ${goal}`);
            return false;
        }
        
        if (!startPos || !endPos) {
            console.error(`Agent ${this.id}: startTransitionFromBuildingToPath impossible, positions manquantes`);
            return false;
        }
        
        // Logs de débogage détaillés
        console.log(`Agent ${this.id}: startTransitionFromBuildingToPath - 
            De: ${startPos.x.toFixed(2)},${startPos.y.toFixed(2)},${startPos.z.toFixed(2)} 
            Vers: ${endPos.x.toFixed(2)},${endPos.y.toFixed(2)},${endPos.z.toFixed(2)}`);
        
        // Créer un chemin simple
        startPos.y = this.yOffset;
        endPos.y = this.yOffset;
        this.buildingTransitionPathPoints = [startPos, endPos];
        
        // Calculer la durée de transition - mais avec une durée fixe courte
        const distance = startPos.distanceTo(endPos);
        const speed = this.agentBaseSpeed * 2; // Doubler la vitesse pour une transition plus rapide
        this.buildingTransitionDuration = (distance / speed) * 1000; // en ms
        
        // Limiter la durée maximale de transition pour éviter les blocages
        const maxTransitionDuration = 2000; // Maximum 2 secondes
        this.buildingTransitionDuration = Math.min(this.buildingTransitionDuration, maxTransitionDuration);
        
        // Initialiser les états de transition
        this.isMovingFromBuildingToPath = true;
        this.isMovingFromPathToBuilding = false;
        this.buildingTransitionProgress = 0;
        this.buildingTransitionStartTime = currentGameTime;
        
        // Rendre l'agent visible immédiatement
        this.isVisible = true;
        
        return true;
    }

    /**
     * Démarre une transition du point d'arrivée du chemin vers le bâtiment
     * @param {number} currentGameTime - Le temps de jeu actuel
     * @param {string} goal - "WORK" ou "HOME" pour indiquer la direction
     */
    startPathToBuildingTransition(currentGameTime, goal) {
        // Déterminer les points de départ et d'arrivée
        let startPos, endPos;
        
        if (goal === 'WORK') {
            startPos = this.workPosition.clone();
            endPos = this.workBuildingPosition.clone();
        } else if (goal === 'HOME') {
            startPos = this.homePosition.clone();
            endPos = this.homeBuildingPosition.clone();
        } else {
            console.error(`Agent ${this.id}: startPathToBuildingTransition avec goal invalide: ${goal}`);
            return false;
        }
        
        if (!startPos || !endPos) {
            console.error(`Agent ${this.id}: startPathToBuildingTransition impossible, positions manquantes`);
            return false;
        }
        
        // Logs de débogage détaillés
        console.log(`Agent ${this.id}: startPathToBuildingTransition - 
            De: ${startPos.x.toFixed(2)},${startPos.y.toFixed(2)},${startPos.z.toFixed(2)} 
            Vers: ${endPos.x.toFixed(2)},${endPos.y.toFixed(2)},${endPos.z.toFixed(2)}`);
        
        // Créer un chemin simple
        startPos.y = this.yOffset;
        endPos.y = this.yOffset;
        this.buildingTransitionPathPoints = [startPos, endPos];
        
        // Calculer la durée de transition - mais maintenant avec une durée fixe courte
        // pour garantir une animation visible mais rapide
        const distance = startPos.distanceTo(endPos);
        const speed = this.agentBaseSpeed * 2; // Doubler la vitesse pour une transition plus rapide
        this.buildingTransitionDuration = (distance / speed) * 1000; // en ms
        
        // Limiter la durée maximale de transition pour éviter les blocages
        const maxTransitionDuration = 2000; // Maximum 2 secondes
        this.buildingTransitionDuration = Math.min(this.buildingTransitionDuration, maxTransitionDuration);
        
        // Initialiser les états de transition
        this.isMovingFromBuildingToPath = false;
        this.isMovingFromPathToBuilding = true;
        this.buildingTransitionProgress = 0;
        this.buildingTransitionStartTime = currentGameTime;
        
        return true;
    }
    
    /**
     * Met à jour l'état de transition entre le bâtiment et le chemin
     * @param {number} currentGameTime - Le temps de jeu actuel
     * @returns {boolean} - true si la transition est terminée
     */
    updateBuildingTransition(currentGameTime) {
        if (!this.isMovingFromBuildingToPath && !this.isMovingFromPathToBuilding) {
            return false;
        }
        
        if (!this.buildingTransitionPathPoints || this.buildingTransitionPathPoints.length < 2) {
            console.warn(`Agent ${this.id}: updateBuildingTransition sans points de chemin valides`);
            this.isMovingFromBuildingToPath = false;
            this.isMovingFromPathToBuilding = false;
            return false;
        }
        
        // Calculer la progression
        const elapsedTime = currentGameTime - this.buildingTransitionStartTime;
        
        // Logs détaillés pour le débogage
        if (Math.random() < 0.05) { // Limiter les logs à 5% des frames pour éviter de surcharger la console
            console.log(`Agent ${this.id}: updateBuildingTransition - 
                Temps écoulé: ${elapsedTime.toFixed(2)}ms / ${this.buildingTransitionDuration.toFixed(2)}ms 
                (${(elapsedTime/this.buildingTransitionDuration*100).toFixed(1)}%)`);
        }
        
        this.buildingTransitionProgress = Math.min(1.0, elapsedTime / this.buildingTransitionDuration);
        
        // Mettre à jour la position
        const startPos = this.buildingTransitionPathPoints[0];
        const endPos = this.buildingTransitionPathPoints[1];
        this.position.lerpVectors(startPos, endPos, this.buildingTransitionProgress);
        
        // Si la transition est terminée ou si on a dépassé le temps maximum
        if (this.buildingTransitionProgress >= 1.0 || 
            elapsedTime > this.buildingTransitionDuration * 1.5) { // 50% de marge pour éviter les blocages
            
            console.log(`Agent ${this.id}: Transition terminée! Type: ${this.isMovingFromBuildingToPath ? 'Building->Path' : 'Path->Building'}`);
            
            if (this.isMovingFromBuildingToPath) {
                // Transition du bâtiment au chemin terminée, commencer le chemin principal
                this.isMovingFromBuildingToPath = false;
                
                // Démarrer le chemin principal selon l'état
                if (this.currentState === AgentState.READY_TO_LEAVE_FOR_WORK) {
                    console.log(`Agent ${this.id}: Fin transition bâtiment->chemin, passage à IN_TRANSIT_TO_WORK`);
                    this.currentState = AgentState.IN_TRANSIT_TO_WORK;
                } else if (this.currentState === AgentState.READY_TO_LEAVE_FOR_HOME) {
                    console.log(`Agent ${this.id}: Fin transition bâtiment->chemin, passage à IN_TRANSIT_TO_HOME`);
                    this.currentState = AgentState.IN_TRANSIT_TO_HOME;
                }
                
                return true;
            } else if (this.isMovingFromPathToBuilding) {
                // Transition du chemin au bâtiment terminée, finir le trajet
                this.isMovingFromPathToBuilding = false;
                this.isVisible = false;
                
                // Changer l'état selon la destination
                if (this._currentPathRequestGoal === 'WORK') {
                    console.log(`Agent ${this.id}: Fin transition chemin->bâtiment, passage à AT_WORK`);
                    this.currentState = AgentState.AT_WORK;
                    this.lastArrivalTimeWork = currentGameTime;
                } else if (this._currentPathRequestGoal === 'HOME') {
                    console.log(`Agent ${this.id}: Fin transition chemin->bâtiment, passage à AT_HOME`);
                    this.currentState = AgentState.AT_HOME;
                    this.lastArrivalTimeHome = currentGameTime;
                }
                
                // Nettoyer les données de chemin
                this.currentPathPoints = null;
                this.calculatedTravelDurationGame = 0;
                this.departureTimeGame = -1;
                this.arrivalTmeGame = -1;
                this.hasReachedDestination = false;
                
                return true;
            }
        }
        
        return false;
    }

    destroy() {
        // Annuler tous les événements planifiés
        this._cancelScheduledEvents();
        
        // Nettoyer également tous les événements potentiellement associés à cet agent
        const scheduler = this.experience?.timeScheduler;
        if (scheduler) {
            scheduler.cancelEventsForContext(this);
        }

        // Supprimer les écouteurs d'événements de temps
        if (this.experience && this.experience.time) {
            // Stocker les références aux fonctions de rappel pour les supprimer proprement
            if (this._speedChangeHandler) {
                this.experience.time.removeEventListener('speedchange', this._speedChangeHandler);
            }
            if (this._playedHandler) {
                this.experience.time.removeEventListener('played', this._playedHandler);
            }
        }
        
        this.path = null;
        this.homePosition = null;
        this.workPosition = null;
        this.homeGridNode = null;
        this.workGridNode = null;
        this.experience = null; // Libérer la référence à Experience
    }

    // Ajouter une méthode de secours pour forcer le retour à la maison
    forceReturnHome(currentGameTime) {
        console.warn(`Agent ${this.id}: Forçage du retour à la maison par téléportation directe`);
        
        // Forcer la position de l'agent à son domicile
        if (this.homePosition) {
            this.position.copy(this.homePosition);
            this.position.y += this.yOffset;
        }
        
        // Réinitialiser tous les drapeaux et états
        this.isInsidePark = false;
        this.parkSidewalkPosition = null;
        this.parkSidewalkGridNode = null;
        this.weekendWalkDestination = null;
        this.weekendWalkGridNode = null;
        this.weekendWalkEndTime = -1;
        this.currentPathPoints = null;
        this.calculatedTravelDurationGame = 0;
        this.departureTimeGame = -1;
        this.arrivalTmeGame = -1;
        this.currentPathIndexVisual = 0;
        this.visualInterpolationProgress = 0;
        this.hasReachedDestination = false; // Assurer que ce flag est aussi réinitialisé
        this._stateStartTime = null; // Réinitialiser le timer de blocage
        this._pathRequestTimeout = null; // Annuler un éventuel timeout de path request
        
        // Définir l'état à AT_HOME et cacher l'agent
        this.currentState = AgentState.AT_HOME;
        this.isVisible = false;
        
        // Enregistrer l'heure d'arrivée
        this.lastArrivalTimeHome = currentGameTime;
        this.requestedPathForDepartureTime = -1;

        // --- OPTIMISATION: Calculer le prochain check ---
        this._calculateAndSetNextCheckTime(currentGameTime);
        // --- FIN OPTIMISATION ---
    }

    /**
     * Fait entrer l'agent dans le bâtiment en démarrant une transition visuelle
     * @param {number} currentGameTime - Le temps de jeu actuel
     * @param {string} goal - "WORK" ou "HOME" pour indiquer la destination
     * @private
     */
    _enterBuilding(currentGameTime, goal) {
        console.log(`Agent ${this.id}: Démarrage transition vers bâtiment ${goal}`);
        
        // Utiliser startPathToBuildingTransition pour gérer la transition visuelle
        this.startPathToBuildingTransition(currentGameTime, goal);
    }

    /**
     * Synchronise la position visuelle d'un agent avec sa progression temporelle calculée.
     * Utile lorsque le temps a été fortement accéléré pour s'assurer que la position est cohérente.
     * 
     * @param {number} progressRatio - Ratio de progression dans le trajet (0 à 1)
     */
    syncVisualPositionWithProgress(progressRatio) {
        if (!this.currentPathPoints || this.currentPathPoints.length < 2) {
            console.warn(`Agent ${this.id}: Impossible de synchroniser la position, chemin ou handler manquant`);
            return;
        }
        
        // Assurer que le ratio est dans l'intervalle [0,1]
        const clampedRatio = Math.min(1.0, Math.max(0.0, progressRatio));
        
        // Mettre à jour la progression visuelle
        this.visualInterpolationProgress = clampedRatio;
        
        // Calculer l'index approximatif du segment de chemin 
        const lastIndex = this.currentPathPoints.length - 1;
        const approximateIndex = Math.floor(clampedRatio * lastIndex);
        this.currentPathIndexVisual = Math.min(lastIndex - 1, Math.max(0, approximateIndex));
        
        // Positionner directement l'agent à la position correspondante sur le chemin
        if (this.currentPathIndexVisual < lastIndex) {
            const currentPoint = this.currentPathPoints[this.currentPathIndexVisual];
            const nextPoint = this.currentPathPoints[this.currentPathIndexVisual + 1];
            
            // Calculer la progression dans le segment actuel
            const segmentCount = lastIndex;
            const segmentLength = 1.0 / segmentCount;
            const segmentProgress = (clampedRatio - (this.currentPathIndexVisual / segmentCount)) / segmentLength;
            
            // Interpoler la position entre les deux points du segment
            this.position.lerpVectors(currentPoint, nextPoint, segmentProgress);
            
            // Assurer la hauteur correcte
            this.position.y = this.yOffset;
            
            // Calculer l'orientation vers le prochain point
            if (this.currentPathIndexVisual < this.currentPathPoints.length - 1) {
                const direction = new THREE.Vector3().subVectors(nextPoint, currentPoint).normalize();
                if (direction.length() > 0.001) {
                    const targetRotation = Math.atan2(direction.x, direction.z);
                    this.orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
                }
            }
            
            // Forcer la visibilité
            this.isVisible = true;
        }
        
        // Si nous avons également un movementHandler, synchroniser avec lui
        if (this.movementHandler) {
            this.movementHandler.updatePedestrianMovement(
                0, // deltaTime non significatif ici
                this.currentPathPoints,
                this.currentPathLengthWorld,
                clampedRatio,
                this.currentPathIndexVisual
            );
        }
        
        console.log(`Agent ${this.id}: Position synchronisée avec la progression ${(clampedRatio * 100).toFixed(1)}%`);
    }
}

// Export de l'enum pour usage externe
Agent.prototype.constructor.AgentState = AgentState;

// --- AJOUT pour stocker l'état précédent pour le timer --- 
Agent.prototype._previousStateForStartTime = null; 
// --- FIN AJOUT --- 