import BaseMovementState from './BaseMovementState.js';
import TransitToHomeState from './TransitToHomeState.js';
import DrivingHomeState from './DrivingHomeState.js';

export default class ReadyToLeaveForHomeState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'READY_TO_LEAVE_FOR_HOME';
        this.agent.isVisible = false;
    }

    onUpdate(deltaTime) {
        const env = this.env;
        if (!env) return;
        const timeWithinDay = this.timeWithinDay;
        
        console.log(`[FSM-${this.agent.id}] ReadyToLeaveForHome.onUpdate - timeWithinDay=${timeWithinDay}, exactHomeDepartureTime=${this.agent.exactHomeDepartureTimeGame}`);
        
        if (timeWithinDay >= this.agent.exactHomeDepartureTimeGame) {
            console.log(`[FSM-${this.agent.id}] C'est l'heure de rentrer! Changement vers ${this.agent.isInVehicle ? 'DrivingHomeState' : 'TransitToHomeState'}`);
            if (this.agent.isInVehicle) {
                this.ctx.fsm.changeState(new DrivingHomeState(this.ctx));
            } else {
                this.ctx.fsm.changeState(new TransitToHomeState(this.ctx));
            }
        }
    }
} 