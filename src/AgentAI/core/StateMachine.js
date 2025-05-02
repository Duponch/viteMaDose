import BaseState from './BaseState.js';

/**
 * Mini-moteur de machine d'états finie pour les agents.
 */
export default class StateMachine {
    /**
     * @param {import('./AgentContext').default} context Contexte partagé de l'agent.
     * @param {BaseState} initialState Instance de l'état initial.
     */
    constructor(context, initialState) {
        this.ctx = context;
        /** @type {BaseState} */
        this.state = null;
        this.debug = false; // Activer pour logs détaillés
        
        if (initialState) {
            this.changeState(initialState);
        } else {
            console.warn(`StateMachine: ⚠️ Pas d'état initial fourni pour agent ${context?.agent?.id}`);
        }
    }

    /**
     * Change immédiatement d'état.
     * Appelle onExit sur l'ancien, puis onEnter sur le nouveau.
     * @param {BaseState} newState
     */
    changeState(newState) {
        if (!newState) {
            console.error(`StateMachine: ⚠️ Tentative de changement vers un état null pour agent ${this.ctx?.agent?.id}`);
            return;
        }
        
        if (this.state === newState) return;
        
        const prevState = this.state ? this.state.constructor.name : "null";
        const nextState = newState.constructor.name;
        
        if (this.debug) {
            console.log(`StateMachine [Agent ${this.ctx?.agent?.id}]: Changement d'état ${prevState} → ${nextState}`);
        }
        
        if (this.state) {
            this.state.onExit();
        }
        
        this.state = newState;
        
        if (this.state) {
            this.state.onEnter();
        }
    }

    /**
     * Met à jour l'état courant.
     * @param {number} deltaTime Temps écoulé en secondes.
     */
    update(deltaTime) {
        if (this.state) {
            try {
                this.state.onUpdate(deltaTime);
            } catch (error) {
                console.error(`StateMachine [Agent ${this.ctx?.agent?.id}]: Erreur lors de onUpdate pour état ${this.state.constructor.name}:`, error);
            }
        } else if (this.debug) {
            console.warn(`StateMachine [Agent ${this.ctx?.agent?.id}]: Pas d'état courant à mettre à jour`);
        }
    }
} 