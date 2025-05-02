import BaseMovementState from './BaseMovementState.js';
import WeekendWalkingState from './WeekendWalkingState.js';

export default class WeekendWalkReadyState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'WEEKEND_WALK_READY';
        // généralement invisible, l'agent attend juste qu'on démarre la promenade
        this.agent.isVisible = false;
        // Si un chemin est déjà prêt, on enchaîne tout de suite
        if (this.agent.currentPathPoints && this.agent.currentPathPoints.length > 0) {
            this.ctx.fsm.changeState(new WeekendWalkingState(this.ctx));
        }
    }

    onUpdate() {
        // Rien : bascule dès qu'un chemin apparaît (géré dans setPath) ou au premier onEnter
    }
} 