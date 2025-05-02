import BaseMovementState from './BaseMovementState.js';

export default class WeekendWalkRequestingState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'WEEKEND_WALK_REQUESTING_PATH';
        this.agent.isVisible = false;
    }

    onUpdate() {
        // Attente passive du setPath; rien ici
    }
} 