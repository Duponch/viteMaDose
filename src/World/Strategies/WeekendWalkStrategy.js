// Stratégie pour les promenades du weekend pour les agents
// Fait en sorte que 20-30% des agents se promènent quelques heures le samedi et dimanche
// à des horaires aléatoires entre 6h et 23h

export default class WeekendWalkStrategy {
    /**
     * @param {Object} [options] - Options de configuration
     * @param {number} [options.minPercentage=20] - Pourcentage minimum d'agents qui se promènent (défaut: 20%)
     * @param {number} [options.maxPercentage=30] - Pourcentage maximum d'agents qui se promènent (défaut: 30%)
     * @param {number} [options.minDurationHours=1] - Durée minimum de la promenade en heures (défaut: 1h)
     * @param {number} [options.maxDurationHours=3] - Durée maximum de la promenade en heures (défaut: 3h)
     * @param {number} [options.minHour=6] - Heure minimum de début de promenade (défaut: 6h)
     * @param {number} [options.maxHour=23] - Heure maximum de fin de promenade (défaut: 23h)
     */
    constructor(options = {}) {
        this.minPercentage = options.minPercentage ?? 20;
        this.maxPercentage = options.maxPercentage ?? 30;
        this.minDurationHours = options.minDurationHours ?? 1;
        this.maxDurationHours = options.maxDurationHours ?? 3;
        this.minHour = options.minHour ?? 6;
        this.maxHour = options.maxHour ?? 23;
        
        // Map pour stocker les agents qui vont se promener
        this.agentWalkMap = new Map();
    }

    /**
     * Détermine si un agent spécifique doit se promener ce jour-là
     * @param {string} agentId - Identifiant unique de l'agent
     * @param {Object} calendarDate - Objet retourné par getCurrentDate
     * @returns {boolean}
     */
    shouldWalkToday(agentId, calendarDate) {
        // Vérifier si c'est le weekend
        const isWeekend = ["Samedi", "Dimanche"].includes(calendarDate.jourSemaine);
        
        if (!isWeekend) {
            return false;
        }
        
        // Si c'est un nouveau jour, réinitialiser la map et déterminer les agents qui se promèneront
        const dayKey = `${calendarDate.jourSemaine}_${calendarDate.jour}_${calendarDate.mois}_${calendarDate.annee}`;
        
        if (!this.agentWalkMap.has(dayKey)) {
            this.initializeDayWalks(dayKey);
        }
        
        // Vérifier si cet agent spécifique est dans la liste des promeneurs
        const agentWalkInfo = this.agentWalkMap.get(dayKey).get(agentId);
        return !!agentWalkInfo;
    }
    
    /**
     * Initialise les promenades pour une journée donnée
     * @param {string} dayKey - Clé unique pour le jour
     * @private
     */
    initializeDayWalks(dayKey) {
        const agentsForDay = new Map();
        this.agentWalkMap.set(dayKey, agentsForDay);
    }
    
    /**
     * Détermine si un agent doit se promener maintenant en fonction de l'heure
     * @param {string} agentId - Identifiant unique de l'agent
     * @param {Object} calendarDate - Objet retourné par getCurrentDate
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {boolean}
     */
    shouldWalkNow(agentId, calendarDate, currentHour) {
        if (!this.shouldWalkToday(agentId, calendarDate)) {
            return false;
        }
        
        const dayKey = `${calendarDate.jourSemaine}_${calendarDate.jour}_${calendarDate.mois}_${calendarDate.annee}`;
        const agentWalkInfo = this.agentWalkMap.get(dayKey).get(agentId);
        
        if (!agentWalkInfo) {
            return false;
        }
        
        // Vérifier si l'heure actuelle est dans la plage de promenade de l'agent
        return currentHour >= agentWalkInfo.startHour && currentHour < agentWalkInfo.endHour;
    }
    
    /**
     * Enregistre un agent pour déterminer s'il doit se promener le weekend
     * @param {string} agentId - Identifiant unique de l'agent
     * @param {Object} calendarDate - Objet retourné par getCurrentDate
     */
    registerAgent(agentId, calendarDate) {
        if (!["Samedi", "Dimanche"].includes(calendarDate.jourSemaine)) {
            return;
        }
        
        const dayKey = `${calendarDate.jourSemaine}_${calendarDate.jour}_${calendarDate.mois}_${calendarDate.annee}`;
        
        if (!this.agentWalkMap.has(dayKey)) {
            this.initializeDayWalks(dayKey);
        }
        
        const dayAgents = this.agentWalkMap.get(dayKey);
        
        // Si l'agent est déjà enregistré, on ne fait rien
        if (dayAgents.has(agentId)) {
            return;
        }
        
        // Déterminer si cet agent se promène (basé sur le pourcentage configuré)
        const walkProbability = this.minPercentage + Math.random() * (this.maxPercentage - this.minPercentage);
        const willWalk = Math.random() * 100 < walkProbability;
        
        if (willWalk) {
            // Déterminer les heures de début et de fin de promenade
            const walkDuration = this.minDurationHours + Math.random() * (this.maxDurationHours - this.minDurationHours);
            const latestPossibleStart = Math.min(this.maxHour - walkDuration, this.maxHour - 1);
            const startHour = Math.floor(this.minHour + Math.random() * (latestPossibleStart - this.minHour));
            const endHour = Math.min(Math.ceil(startHour + walkDuration), this.maxHour);
            
            dayAgents.set(agentId, {
                startHour,
                endHour,
                duration: endHour - startHour
            });
        } else {
            // L'agent ne se promène pas aujourd'hui
            dayAgents.set(agentId, null);
        }
    }
} 