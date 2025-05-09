// Stratégie pour gérer les horaires d'ouverture des bâtiments commerciaux

export default class CommercialOpeningHoursStrategy {
    /**
     * @param {Object} [options] - Options de configuration des horaires d'ouverture
     */
    constructor(options = {}) {
        // Horaires d'ouverture par défaut: 8h00 à 21h00 tous les jours
        this.openingHour = options.openingHour ?? 8;  // 8h00
        this.closingHour = options.closingHour ?? 21; // 21h00
        
        // Tous les jours de la semaine (par défaut)
        this.openDays = options.openDays ?? [
            "Lundi", "Mardi", "Mercredi", "Jeudi", 
            "Vendredi", "Samedi", "Dimanche"
        ];
    }

    /**
     * Vérifie si le commerce est ouvert à une date et heure données
     * @param {Object} calendarDate - Objet contenant le jour de la semaine
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {boolean} - True si le commerce est ouvert
     */
    isOpen(calendarDate, currentHour) {
        if (!calendarDate || !calendarDate.jourSemaine) {
            console.warn("CommercialOpeningHoursStrategy: calendarDate invalide");
            return false;
        }
        
        // Vérifier si le commerce est ouvert ce jour
        if (!this.openDays.includes(calendarDate.jourSemaine)) {
            return false;
        }
        
        // Vérifier si l'heure actuelle est dans la plage d'ouverture
        return currentHour >= this.openingHour && currentHour < this.closingHour;
    }
    
    /**
     * Obtient le statut actuel du commerce (ouvert/fermé)
     * @param {Object} calendarDate - Objet contenant le jour de la semaine
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {string} - Message de statut du commerce
     */
    getStatus(calendarDate, currentHour) {
        if (this.isOpen(calendarDate, currentHour)) {
            return "Ouvert";
        } else {
            return "Fermé";
        }
    }
    
    /**
     * Calcule le nombre d'heures avant la prochaine ouverture
     * @param {Object} calendarDate - Objet contenant le jour de la semaine
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {number} - Nombre d'heures avant la prochaine ouverture ou 0 si déjà ouvert
     */
    hoursUntilOpen(calendarDate, currentHour) {
        if (this.isOpen(calendarDate, currentHour)) {
            return 0; // Déjà ouvert
        }
        
        // Si l'heure actuelle est avant l'ouverture aujourd'hui
        if (currentHour < this.openingHour && this.openDays.includes(calendarDate.jourSemaine)) {
            return this.openingHour - currentHour;
        }
        
        // Sinon, il faudra attendre le lendemain (simplifié)
        return (24 - currentHour) + this.openingHour;
    }
} 