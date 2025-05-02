import BaseMovementState from './BaseMovementState.js';
import TransitToWorkState from './TransitToWorkState.js';
import DrivingToWorkState from './DrivingToWorkState.js';

export default class ReadyToLeaveForWorkState extends BaseMovementState {
    onEnter() {
        this.agent.currentState = 'READY_TO_LEAVE_FOR_WORK';
        this.agent.isVisible = false;
        console.log(`[FSM-${this.agent.id}] -> Entrée ReadyToLeaveForWorkState`);
    }

    onUpdate(deltaTime) {
        console.log(`[FSM-${this.agent.id}] -> Update ReadyToLeaveForWorkState`); // Log pour vérifier l'appel
        
        const env = this.env;
        if (!env) return; // Garde de sécurité
        
        const timeWithinDay = this.timeWithinDay;
        const exactTime = this.agent.exactWorkDepartureTimeGame;
        
        // Vérification des valeurs (essentiel)
        if (isNaN(timeWithinDay) || isNaN(exactTime)) {
            console.error(`[FSM-${this.agent.id}] ReadyToLeave - VALEURS INVALIDES: timeWithinDay=${timeWithinDay}, exactWorkDepartureTime=${exactTime}`);
            return;
        }
        
        console.log(`[FSM-${this.agent.id}] ReadyToLeave check: time=${timeWithinDay.toFixed(0)} >= departTime=${exactTime.toFixed(0)} ?`);

        if (timeWithinDay >= exactTime) {
            console.log(`[FSM-${this.agent.id}] ✅ Condition Départ Travail REMPLIE. Changement vers ${this.agent.isInVehicle ? 'Driving' : 'Transit'}...`);
            if (this.agent.isInVehicle) {
                this.ctx.fsm.changeState(new DrivingToWorkState(this.ctx));
            } else {
                this.ctx.fsm.changeState(new TransitToWorkState(this.ctx));
            }
        } 
        // Retrait du HACK - la condition naturelle doit fonctionner
        // else {
        //     console.log(`[FSM-${this.agent.id}] ❌ Pas encore l'heure.`);
        // }
    }
} 