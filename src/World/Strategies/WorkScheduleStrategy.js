// Stratégie de planning de travail pour les agents
// Par défaut : travail du lundi au vendredi, repos le weekend

export default class WorkScheduleStrategy {
    /**
     * @param {Object} [options] - Options futures (ex: jours spéciaux)
     */
    constructor(options = {}) {
        // Options réservées pour l'extension future
        this.workDays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
        this.weekendDays = ["Samedi", "Dimanche"];
    }

    /**
     * Indique si l'agent doit travailler ce jour-là
     * @param {Object} calendarDate - Objet retourné par getCurrentDate (doit contenir jourSemaine)
     * @returns {boolean}
     */
    shouldWorkToday(calendarDate) {
        if (!calendarDate || !calendarDate.jourSemaine) {
            console.warn("WorkScheduleStrategy: calendarDate invalide");
            return false; // Par défaut, ne pas travailler si date invalide
        }
        
        // Vérification explicite que ce n'est PAS un weekend
        if (this.weekendDays.includes(calendarDate.jourSemaine)) {
            return false; // Le weekend, pas de travail!
        }
        
        // Par défaut : lundi à vendredi
        return this.workDays.includes(calendarDate.jourSemaine);
    }
} 