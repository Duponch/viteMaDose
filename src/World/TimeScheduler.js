/**
 * Gestionnaire d'événements temporels pour le jeu
 * Permet de planifier des actions à des moments précis dans le temps du jeu
 */
export default class TimeScheduler {
    constructor(experience) {
        this.experience = experience;
        this.scheduledEvents = [];
        this.lastProcessedTime = 0;
        this.isInitialized = false;
        this.dayDurationMs = 0;
        this._tempEvents = []; // Stockage temporaire en cas d'initialisation retardée
        
        // Tentative d'initialisation immédiate
        this.initialize();
        
        // Planifier une initialisation différée si l'environnement n'est pas prêt
        if (!this.isInitialized && experience && experience.time) {
            console.log("TimeScheduler: Planification d'une initialisation différée...");
            this._initCheckInterval = setInterval(() => {
                if (this.initialize()) {
                    console.log("TimeScheduler: Initialisation différée réussie!");
                    clearInterval(this._initCheckInterval);
                    this._initCheckInterval = null;
                }
            }, 1000); // Vérifier toutes les secondes
        }
    }

    /**
     * Initialise le scheduler avec les propriétés de l'environnement
     * @returns {boolean} Vrai si l'initialisation est réussie
     */
    initialize() {
        try {
            const environment = this.experience?.world?.environment;
            if (!environment || !environment.isInitialized) {
                console.log("TimeScheduler: Impossible d'initialiser - environnement non prêt");
                return false;
            }

            this.dayDurationMs = environment.dayDurationMs;
            if (this.dayDurationMs <= 0) {
                console.warn("TimeScheduler: dayDurationMs invalide:", this.dayDurationMs);
                return false;
            }

            this.isInitialized = true;
            
            // Traiter les événements mis en attente avant l'initialisation
            if (this._tempEvents.length > 0) {
                this.scheduledEvents = [...this._tempEvents];
                this._tempEvents = [];
                this.scheduledEvents.sort((a, b) => a.scheduledTime - b.scheduledTime);
                console.log(`TimeScheduler: Initialisé avec ${this.scheduledEvents.length} événements en attente`);
            } else {
                console.log("TimeScheduler: Initialisé avec succès");
            }

            return true;
        } catch (error) {
            console.error("TimeScheduler: Erreur lors de l'initialisation:", error);
            return false;
        }
    }

    /**
     * Calcule le temps absolu du jeu à partir d'une heure de la journée
     * @param {number} hour - Heure de la journée (0-23)
     * @param {number} minute - Minute de l'heure (0-59)
     * @param {number} currentGameTime - Temps actuel du jeu pour calculer le jour correct
     * @returns {number} Temps absolu en ms dans le jeu
     */
    getGameTimeFromHour(hour, minute = 0, currentGameTime = this.experience?.time?.elapsed || 0) {
        if (!this.isInitialized) {
            this.initialize();
            if (!this.isInitialized) {
                console.warn("TimeScheduler: Impossible de calculer le temps - non initialisé");
                return currentGameTime; // Retourner le temps actuel comme fallback
            }
        }

        // Vérifier que les paramètres sont dans des plages valides
        hour = Math.max(0, Math.min(23, hour));
        minute = Math.max(0, Math.min(59, minute));

        const msPerHour = this.dayDurationMs / 24;
        const msPerMinute = msPerHour / 60;
        
        // Calculer le début du jour actuel
        const currentDayNumber = Math.floor(currentGameTime / this.dayDurationMs);
        const currentDayStartTime = currentDayNumber * this.dayDurationMs;
        
        // Calculer l'heure cible dans la journée
        const targetTimeInDay = (hour * msPerHour) + (minute * msPerMinute);
        
        // Si l'heure cible est déjà passée aujourd'hui, planifier pour demain
        const currentTimeInDay = currentGameTime - currentDayStartTime;
        if (targetTimeInDay <= currentTimeInDay) {
            return currentDayStartTime + this.dayDurationMs + targetTimeInDay;
        }
        
        // Sinon, planifier pour aujourd'hui
        return currentDayStartTime + targetTimeInDay;
    }

    /**
     * Ajoute un événement planifié au scheduler
     * @param {number} scheduledTime - Temps absolu du jeu où l'événement doit se produire
     * @param {Function} callback - Fonction à exécuter lorsque l'heure est atteinte
     * @param {Object} context - Contexte d'exécution (this) pour la callback
     * @param {Object} data - Données supplémentaires à passer à la callback
     * @param {string} id - Identifiant optionnel pour l'événement
     * @returns {string} Identifiant de l'événement pour pouvoir l'annuler plus tard
     */
    scheduleEvent(scheduledTime, callback, context, data = {}, id = null) {
        if (!callback || typeof callback !== 'function') {
            console.error("TimeScheduler: scheduleEvent nécessite une callback valide");
            return null;
        }

        const eventId = id || `event_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        
        const event = {
            id: eventId,
            scheduledTime,
            callback,
            context,
            data,
            isProcessed: false
        };

        // Si non initialisé, stocker temporairement
        if (!this.isInitialized) {
            this._tempEvents.push(event);
            return eventId;
        }

        // Ajouter l'événement à la liste et trier
        this.scheduledEvents.push(event);
        this.scheduledEvents.sort((a, b) => a.scheduledTime - b.scheduledTime);
        
        return eventId;
    }

    /**
     * Planifie un événement récurrent quotidien à une heure précise
     * @param {number} hour - Heure de la journée (0-23)
     * @param {number} minute - Minute de l'heure (0-59)
     * @param {Function} callback - Fonction à exécuter
     * @param {Object} context - Contexte d'exécution
     * @param {Object} data - Données supplémentaires
     * @param {string} id - Identifiant pour l'événement
     * @returns {string} Identifiant de l'événement
     */
    scheduleDailyEvent(hour, minute, callback, context, data = {}, id = null) {
        if (!callback || typeof callback !== 'function') {
            console.error("TimeScheduler: scheduleDailyEvent nécessite une callback valide");
            return null;
        }

        try {
            if (!this.isInitialized) {
                const initSuccess = this.initialize();
                if (!initSuccess) {
                    console.warn(`TimeScheduler: Stockage temporaire de l'événement quotidien ${id || "(sans id)"} car scheduler non initialisé`);
                }
            }

            const currentGameTime = this.experience?.time?.elapsed || 0;
            const scheduledTime = this.getGameTimeFromHour(hour, minute, currentGameTime);
            
            data.isDaily = true;
            data.hour = hour;
            data.minute = minute;
            
            return this.scheduleEvent(scheduledTime, callback, context, data, id);
        } catch (error) {
            console.error("TimeScheduler: Erreur dans scheduleDailyEvent:", error);
            return null;
        }
    }

    /**
     * Annule un événement planifié
     * @param {string} eventId - Identifiant de l'événement à annuler
     * @returns {boolean} Vrai si l'événement a été trouvé et annulé
     */
    cancelEvent(eventId) {
        const index = this.scheduledEvents.findIndex(event => event.id === eventId);
        if (index !== -1) {
            this.scheduledEvents.splice(index, 1);
            return true;
        }
        
        // Vérifier également dans les événements temporaires
        const tempIndex = this._tempEvents.findIndex(event => event.id === eventId);
        if (tempIndex !== -1) {
            this._tempEvents.splice(tempIndex, 1);
            return true;
        }
        
        return false;
    }

    /**
     * Annule tous les événements associés à un contexte spécifique
     * Utile pour nettoyer les événements d'un agent lors de sa destruction
     * @param {Object} context - Le contexte dont les événements doivent être annulés
     */
    cancelEventsForContext(context) {
        if (!context) return;
        
        this.scheduledEvents = this.scheduledEvents.filter(event => event.context !== context);
        this._tempEvents = this._tempEvents.filter(event => event.context !== context);
    }

    /**
     * Met à jour le scheduler en traitant les événements arrivés à échéance
     * @param {number} currentGameTime - Temps actuel du jeu
     */
    update(currentGameTime) {
        if (!this.isInitialized) {
            if (!this.initialize()) {
                return;
            }
        }

        // Si le temps a reculé (par exemple, en cas de réinitialisation), réinitialiser le processeur
        if (currentGameTime < this.lastProcessedTime) {
            this.lastProcessedTime = currentGameTime;
            return;
        }

        // Si aucun temps ne s'est écoulé ou pas d'événements, sortir
        if (currentGameTime === this.lastProcessedTime || this.scheduledEvents.length === 0) {
            return;
        }
        
        // Variables pour suivre les événements à replanifier
        const eventsToReschedule = [];
        let i = 0;

        // Traiter tous les événements arrivés à échéance
        while (i < this.scheduledEvents.length && 
              this.scheduledEvents[i].scheduledTime <= currentGameTime) {
            const event = this.scheduledEvents[i];
            
            try {
                // Exécuter la callback avec le contexte et les données
                event.callback.call(event.context, {
                    ...event.data,
                    scheduler: this,
                    currentGameTime,
                    eventId: event.id
                });
                
                // Si c'est un événement quotidien, le replanifier
                if (event.data && event.data.isDaily) {
                    const newTime = this.getGameTimeFromHour(
                        event.data.hour, 
                        event.data.minute, 
                        currentGameTime + 60000 // Ajouter une minute pour éviter de replanifier au même moment
                    );
                    
                    eventsToReschedule.push({
                        ...event,
                        scheduledTime: newTime,
                        isProcessed: false
                    });
                }
                
            } catch (error) {
                console.error(`TimeScheduler: Erreur lors de l'exécution de l'événement ${event.id}:`, error);
            }
            
            i++;
        }
        
        // Supprimer les événements traités
        if (i > 0) {
            this.scheduledEvents.splice(0, i);
        }
        
        // Ajouter les événements à replanifier
        if (eventsToReschedule.length > 0) {
            this.scheduledEvents.push(...eventsToReschedule);
            this.scheduledEvents.sort((a, b) => a.scheduledTime - b.scheduledTime);
        }
        
        this.lastProcessedTime = currentGameTime;
    }

    /**
     * Nettoie toutes les ressources lors de la destruction
     */
    destroy() {
        if (this._initCheckInterval) {
            clearInterval(this._initCheckInterval);
            this._initCheckInterval = null;
        }
        
        this.scheduledEvents = [];
        this._tempEvents = [];
        this.experience = null;
        this.isInitialized = false;
    }
} 