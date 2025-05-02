import DrivingBaseState from './DrivingBaseState.js';
import AtHomeState from './AtHomeState.js';

export default class DrivingHomeState extends DrivingBaseState {
    onEnter() {
        const agentId = this.agent?.id || 'unknown';
        console.log(`[FSM-${agentId}] -> Entrée DrivingHomeState`);
        this.agent.currentState = 'DRIVING_HOME';
        this.agent.isVisible = false;
        
        // Vérifier si la voiture est accessible (via DrivingBaseState)
        if (!this.car) {
            console.error(`[FSM-${agentId}] DrivingHomeState.onEnter: ERREUR - Voiture (this.car) non trouvée!`);
            // Fallback immédiat vers AtHome ?
            this.ctx.fsm.changeState(new AtHomeState(this.ctx));
            return;
        }

        // Vérifier si un chemin existe pour la voiture
        if (!this.agent.currentPathPoints || this.agent.currentPathPoints.length === 0) {
             console.error(`[FSM-${agentId}] DrivingHomeState.onEnter: ERREUR - Chemin (agent.currentPathPoints) manquant pour la voiture!`);
             // Fallback immédiat vers AtHome ?
             this.ctx.fsm.changeState(new AtHomeState(this.ctx));
             return;
        }
        
        console.log(`[FSM-${agentId}] DrivingHomeState.onEnter: Application du chemin (${this.agent.currentPathPoints.length} points) à la voiture ${this.car.id}`);
        this.car.setPath(this.agent.currentPathPoints);
    }

    onUpdate() {
        const agentId = this.agent?.id || 'unknown';
        // Log ajouté pour voir quand la condition est remplie
        if (!this.car || !this.car.isActive) {
            console.log(`[FSM-${agentId}] DrivingHomeState.onUpdate: Condition de fin détectée (Voiture: ${!!this.car}, Active: ${this.car?.isActive}). Passage à AtHomeState.`);
            this.ctx.fsm.changeState(new AtHomeState(this.ctx));
        }
    }
} 