/**
 * Module de calendrier robuste pour le jeu.
 * Gère la date courante à partir du temps de jeu écoulé.
 * Supporte le calendrier grégorien classique.
 */

const JOURS_SEMAINE = [
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
];
const MOIS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export default class Calendar {
    /**
     * @param {Object} options
     * @param {string} options.startDate - Date de départ au format 'YYYY-MM-DD' (ex: '2025-04-24')
     * @param {number} options.dayDurationMs - Durée d'un jour en ms dans le jeu
     */
    constructor({ startDate = '2025-04-24', dayDurationMs = 20 * 60 * 1000 } = {}) {
        this.startDate = new Date(startDate);
        this.dayDurationMs = dayDurationMs;
    }

    /**
     * Calcule la date courante du jeu à partir du temps de jeu écoulé (en ms)
     * @param {number} elapsedMs - Temps de jeu écoulé (ms)
     * @returns {Object} - { date: Date, jourSemaine: string, nomMois: string, jour: number, mois: number, annee: number }
     */
    getCurrentDate(elapsedMs) {
        const joursEcoules = Math.floor(elapsedMs / this.dayDurationMs);
        const date = new Date(this.startDate);
        date.setDate(date.getDate() + joursEcoules);
        return {
            date,
            jourSemaine: JOURS_SEMAINE[date.getDay()],
            nomMois: MOIS[date.getMonth()],
            jour: date.getDate(),
            mois: date.getMonth() + 1,
            annee: date.getFullYear(),
        };
    }

    /**
     * Retourne le nombre de jours dans un mois donné
     * @param {number} month - Mois (1-12)
     * @param {number} year - Année
     * @returns {number} - Nombre de jours dans le mois
     */
    getMonthDays(month, year) {
        // Si les paramètres ne sont pas fournis, utiliser la date actuelle du jeu
        if (month === undefined || year === undefined) {
            const currentDate = this.getCurrentDate(Date.now());
            month = currentDate.mois;
            year = currentDate.annee;
        }
        
        // Le mois est 1-indexé dans les paramètres mais Date utilise 0-index
        const daysInMonth = new Date(year, month, 0).getDate();
        return daysInMonth;
    }

    /**
     * Retourne la date formatée JJ/MM/AAAA
     * @param {Date} date
     */
    static formatDate(date) {
        const jj = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const aaaa = date.getFullYear();
        return `${jj}/${mm}/${aaaa}`;
    }
} 