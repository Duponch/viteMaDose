import BaseMovementState from './BaseMovementState.js';
import ReadyToLeaveForHomeState from './ReadyToLeaveForHomeState.js';

export default class WeekendWalkingState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'WEEKEND_WALKING';
        this.agent.isVisible = true;
    }

    onUpdate() {
        const currentTime = this.agent.experience.time.elapsed;
        // Terminer quand le controller a fini ou que le temps de marche est écoulé
        if (this.ctx.movementController.finished || (this.agent.weekendWalkEndTime > 0 && currentTime >= this.agent.weekendWalkEndTime)) {
            this.agent._findNewPositionInsidePark(currentTime); // Peut relancer un autre move, sinon retour trottoir
            // Si pas dans un parc ou plus de move, déclencher retour maison
            if (!this.agent.isInsidePark) {
                this.ctx.fsm.changeState(new ReadyToLeaveForHomeState(this.ctx));
            }
        }
    }
} 