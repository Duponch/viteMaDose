import MovementController from './MovementController.js';
import VehicleController from './VehicleController.js';

/**
 * Regroupe toutes les données et services dont les états ont besoin.
 */
export default class AgentContext {
    /**
     * @param {any} config Configuration initiale de l'agent (identique à ancien Agent.js).
     * @param {number} instanceId Id instancé par l'AgentManager.
     * @param {any} experience Référence à l'Experience globale.
     * @param {import('../strategies/WorkScheduleStrategy').default} workScheduleStrategy
     * @param {import('../strategies/WeekendWalkStrategy').default} weekendWalkStrategy
     */
    constructor(agentInstance, config, instanceId, experience, workScheduleStrategy, weekendWalkStrategy) {
        this.config = config;
        this.instanceId = instanceId;
        this.experience = experience;

        // Référence directe à l'instance Agent d'origine (facilite la transition en douceur)
        this.agent = agentInstance;

        this.workScheduleStrategy = workScheduleStrategy;
        this.weekendWalkStrategy = weekendWalkStrategy;

        // Position & orientation (Three.js obtient la référence pour le rendu)
        this.position = config.initialPosition || null;
        this.orientation = null; // à définir plus tard

        // Contrôleurs techniques
        this.movementController = new MovementController(this);
        this.vehicleController = new VehicleController(this);

        // Heure courante (accès pratique)
        this.time = experience.time;

        /** @type {import('./StateMachine').default} */
        this.fsm = null; // Sera défini par l'Agent après création de la machine d'états
    }

    // --- Méthodes utilitaires fréquemment utilisées par les états ---
    gameTime() {
        return this.time?.elapsed ?? 0;
    }

    shouldPrepareWork(currentGameTime) {
        // TODO : reprendre le calcul existant (_calculateScheduledTimes) ou l'externaliser.
        return false;
    }

    requestPathToWork() {
        // TODO : déléguer à Agent (façade) ou directement à AgentManager via callbacks.
    }

    setInvisible() {
        // Accès à l'instance visuelle depuis AgentManager / InstancedMesh.
    }
} 