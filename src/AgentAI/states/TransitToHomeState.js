import BaseMovementState from './BaseMovementState.js';
import AtHomeState from './AtHomeState.js'; // réutilise AtHomeState existant (le premier état)

export default class TransitToHomeState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'IN_TRANSIT_TO_HOME';
        this.agent.isVisible = true;
        this.agent.departureTimeGame = this.agent.experience.time.elapsed;

        if (this.ctx.movementController && this.agent.currentPathPoints) {
            console.log(`[FSM-${this.agent.id}] TransitToHome: Connexion chemin retour (${this.agent.currentPathPoints.length} points) avec MovementController.`);
            this.ctx.movementController.followPath(this.agent.currentPathPoints, this.agent.currentPathLengthWorld);
        } else {
            console.warn(`[FSM-${this.agent.id}] TransitToHome: MovementController ou chemin manquant lors de l'entrée dans l'état!`);
            // Fallback ? Peut-être forcer AtHomeState directement ?
            // this.ctx.fsm.changeState(new AtHomeState(this.ctx)); 
        }
    }

    onUpdate() {
        if (this.ctx.movementController.finished) {
            this.ctx.fsm.changeState(new AtHomeState(this.ctx));
        }
    }
} 