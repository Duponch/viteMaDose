import BaseMovementState from './BaseMovementState.js';
import AtHomeState from './AtHomeState.js'; // réutilise AtHomeState existant (le premier état)

export default class TransitToHomeState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'IN_TRANSIT_TO_HOME';
        this.agent.isVisible = true;
        this.agent.departureTimeGame = this.agent.experience.time.elapsed;
    }

    onUpdate() {
        if (this.ctx.movementController.finished) {
            this.ctx.fsm.changeState(new AtHomeState(this.ctx));
        }
    }
} 