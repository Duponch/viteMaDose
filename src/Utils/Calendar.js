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