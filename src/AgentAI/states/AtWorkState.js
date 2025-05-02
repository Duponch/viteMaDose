import BaseMovementState from './BaseMovementState.js';

export default class AtWorkState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'AT_WORK';
        this.agent.isVisible = false;
        this.agent.lastArrivalTimeWork = this.agent.experience.time.elapsed;
        // Reset path info
        this.agent.currentPathPoints = null;
        this.ctx.movementController.followPath(null, 0);
    }

    onUpdate() {
        const env = this.env;
        if (!env) return;
        const currentTime = this.agent.experience.time.elapsed;
        const timeWithinDay = currentTime % env.dayDurationMs;
        const currentHour = env.currentHour ?? 0;

        // Préparer le retour maison
        if (timeWithinDay >= this.agent.prepareHomeDepartureTimeGame &&
            this.agent.requestedPathForDepartureTime !== currentTime) {
            this.agent.requestedPathForDepartureTime = currentTime;
            this.agent.isInVehicle = this.agent.hasVehicle;
            this.agent.requestPath(
                this.agent.workPosition,
                this.agent.homePosition,
                null,
                null,
                'READY_TO_LEAVE_FOR_HOME',
                currentTime
            );
        }
    }
} 