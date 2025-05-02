import BaseState from '../core/BaseState.js';

export default class BaseMovementState extends BaseState {
    get agent() { return this.ctx.agent; }
    get env() { return this.agent.experience?.world?.environment; }

    get calendarDate() {
        const e = this.env;
        if (!e) return null;
        if (typeof e.getCurrentCalendarDate === 'function') return e.getCurrentCalendarDate();
        if (typeof e.getCurrentDate === 'function') return e.getCurrentDate(this.currentGameTime);
        return null;
    }

    /**
     * Obtient l'heure actuelle du jour (0-23)
     * @returns {number}
     */
    get currentHour() {
        // Utiliser valeur du context si disponible (plus précise)
        if (typeof this.ctx.currentHour === 'number') {
            return this.ctx.currentHour;
        }
        
        // Fallback à l'API d'environnement
        const e = this.env;
        if (e && typeof e.getCurrentHour === 'function') return e.getCurrentHour();
        
        // Dernier recours: calculer depuis timeWithinDay
        if (e?.dayDurationMs > 0) {
            const hourFloat = (this.timeWithinDay / e.dayDurationMs) * 24;
            return Math.floor(hourFloat);
        }
        
        return 0;
    }

    /**
     * Obtient le temps écoulé dans le jour actuel (en ms)
     * @returns {number}
     */
    get timeWithinDay() {
        // Utiliser la valeur du context si disponible (mieux synchronisée)
        if (typeof this.ctx.timeWithinDay === 'number') {
            return this.ctx.timeWithinDay;
        }
        
        // Fallback standard
        const e = this.env;
        if (!e || !e.dayDurationMs) return 0;
        return this.currentGameTime % e.dayDurationMs;
    }
} 