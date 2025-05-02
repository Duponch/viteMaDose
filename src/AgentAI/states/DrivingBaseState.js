import BaseMovementState from './BaseMovementState.js';

export default class DrivingBaseState extends BaseMovementState {
    get carManager() {
        return this.agent.experience.world?.carManager;
    }
    get car() {
        return this.carManager?.getCarForAgent(this.agent.id);
    }
} 