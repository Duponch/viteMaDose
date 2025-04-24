// Stratégie de planning de travail pour les agents
// Par défaut : travail du lundi au vendredi, repos le weekend

export default class WorkScheduleStrategy {
    /**
     * @param {Object} [options] - Options futures (ex: jours spéciaux)
     */
    constructor(options = {}) {
        // Options réservées pour l'extension future
    }

    /**
     * Indique si l'agent doit travailler ce jour-là
     * @param {Object} calendarDate - Objet retourné par getCurrentDate (doit contenir jourSemaine)
     * @returns {boolean}
     */
    shouldWorkToday(calendarDate) {
        // Par défaut : lundi à vendredi
        return ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"].includes(calendarDate.jourSemaine);
    }
} 