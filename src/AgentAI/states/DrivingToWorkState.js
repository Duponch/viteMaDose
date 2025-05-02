import DrivingBaseState from './DrivingBaseState.js';
import AtWorkState from './AtWorkState.js';

export default class DrivingToWorkState extends DrivingBaseState {
    onEnter() {
        this.agent.currentState = 'DRIVING_TO_WORK';
        this.agent.isVisible = false; // on cache le piéton
        if (this.car) {
            this.car.setPath(this.agent.currentPathPoints);
        }
    }

    onUpdate() {
        if (!this.car || !this.car.isActive) {
            this.ctx.fsm.changeState(new AtWorkState(this.ctx));
        }
    }
} 