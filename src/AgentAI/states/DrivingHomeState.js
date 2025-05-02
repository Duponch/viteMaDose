import DrivingBaseState from './DrivingBaseState.js';
import AtHomeState from './AtHomeState.js';

export default class DrivingHomeState extends DrivingBaseState {
    onEnter() {
        this.agent.currentState = 'DRIVING_HOME';
        this.agent.isVisible = false;
        if (this.car) {
            this.car.setPath(this.agent.currentPathPoints);
        }
    }

    onUpdate() {
        if (!this.car || !this.car.isActive) {
            this.ctx.fsm.changeState(new AtHomeState(this.ctx));
        }
    }
} 