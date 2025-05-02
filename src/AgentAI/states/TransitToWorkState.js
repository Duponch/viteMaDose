import BaseMovementState from './BaseMovementState.js';
import AtWorkState from './AtWorkState.js';

export default class TransitToWorkState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'IN_TRANSIT_TO_WORK';
        this.agent.isVisible = true;
        this.agent.departureTimeGame = this.agent.experience.time.elapsed;
        console.log(`[FSM-${this.agent.id}] Entrée dans TransitToWorkState - MovementController actif: ${!!this.ctx.movementController}`);
        
        // Connexion explicite avec le chemin: s'assurer que MovementController connaît le chemin
        if (this.ctx.movementController && this.agent.currentPathPoints) {
            console.log(`[FSM-${this.agent.id}] Connexion du chemin avec MovementController: ${this.agent.currentPathPoints.length} points`);
            this.ctx.movementController.followPath(this.agent.currentPathPoints, this.agent.currentPathLengthWorld);
        } else {
            console.warn(`[FSM-${this.agent.id}] Pas de MovementController ou chemin manquant!`);
        }
    }

    async onUpdate(dt) {
        // Le mouvement est mis à jour automatiquement dans Agent.update ; on se contente de surveiller la fin du trajet
        console.log(`[FSM-${this.agent.id}] Transit.onUpdate - MovementController.finished: ${this.ctx.movementController?.finished}`);
        if (this.ctx.movementController.finished) {
            console.log(`[FSM-${this.agent.id}] Transit terminé! Changement vers AtWorkState`);
            this.ctx.fsm.changeState(new AtWorkState(this.ctx));
        }
    }
} 