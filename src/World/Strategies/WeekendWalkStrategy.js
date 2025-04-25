// src/World/Strategies/WeekendWalkStrategy.js
// Stratégie de promenade du weekend pour les agents.
// Différences principales avec le WorkScheduleStrategy :
//   - Active uniquement le samedi et le dimanche.
//   - Fenêtre horaire par défaut de 6h00 à 23h00.
//   - Définit pour chaque agent une heure de départ aléatoire
//     ainsi qu'une durée de promenade (en heures)
//     stockées dans `agentWalkMap` afin d'être lues par l'agent.
//
// L'agent utilise :
//   * `registerAgent(agentId, calendarDate)`  -> enregistre un planning pour la date courante.
//   * `shouldWalkNow(agentId, calendarDate, currentHour)` -> indique s'il est temps de débuter.
//   * `agentWalkMap`                           -> accès direct pour récupérer la durée.
//
// REMARQUE : la sélection d'une destination proche d'un parc est gérée
//            côté Agent via `_findRandomWalkDestination` qui privilégie
//            déjà les plots "park" lorsqu'ils existent. Cette stratégie
//            se concentre donc sur la planification temporelle.

export default class WeekendWalkStrategy {
    /**
     * @param {Object} [options] - Options de configuration.
     *  @param {number} [options.startHourMin=6]        - Heure min de départ.
     *  @param {number} [options.startHourMax=10]       - Heure max de départ (inclus).
     *  @param {number} [options.minDurationHours=1]    - Durée min de la promenade.
     *  @param {number} [options.maxDurationHours=3]    - Durée max de la promenade.
     */
    constructor(options = {}) {
        this.startHourMin       = Number.isFinite(options.startHourMin)       ? options.startHourMin       : 6;
        this.startHourMax       = Number.isFinite(options.startHourMax)       ? options.startHourMax       : 10;
        this.minDurationHours   = Number.isFinite(options.minDurationHours)   ? options.minDurationHours   : 1;
        this.maxDurationHours   = Number.isFinite(options.maxDurationHours)   ? options.maxDurationHours   : 3;

        // Map clé = "Samedi_10_2_2024" (jourSemaine_jour_mois_annee)
        // Valeur = Map(agentId -> { startHour, duration, hasStarted })
        this.agentWalkMap = new Map();
    }

    /**
     * Renvoie la clé unique représentant une date de calendrier.
     * @param {Object} calendarDate - Objet retourné par environment.getCurrentCalendarDate()
     */
    _getDayKey(calendarDate) {
        // Exemple : "Samedi_10_2_2024"
        return `${calendarDate.jourSemaine}_${calendarDate.jour}_${calendarDate.mois}_${calendarDate.annee}`;
    }

    /**
     * Enregistre l'agent pour la date courante s'il n'existe pas déjà.
     * Génère une heure de départ aléatoire et une durée aléatoire.
     * @param {string} agentId
     * @param {Object} calendarDate
     */
    registerAgent(agentId, calendarDate) {
        if (!agentId || !calendarDate) return;
        // Limiter aux jours du weekend uniquement.
        if (!["Samedi", "Dimanche"].includes(calendarDate.jourSemaine)) return;

        const dayKey = this._getDayKey(calendarDate);
        if (!this.agentWalkMap.has(dayKey)) {
            this.agentWalkMap.set(dayKey, new Map());
        }
        const dayMap = this.agentWalkMap.get(dayKey);
        if (dayMap.has(agentId)) return; // déjà enregistré

        // Générer l'heure de départ et la durée.
        const startHour = this._randomIntInclusive(this.startHourMin, this.startHourMax);
        const duration  = this._randomFloatInclusive(this.minDurationHours, this.maxDurationHours);

        dayMap.set(agentId, {
            startHour,
            duration,
            hasStarted: false,
        });
        
        console.log(`WeekendWalkStrategy: Agent ${agentId} enregistré pour ${calendarDate.jourSemaine}, départ prévu à ${startHour}h pour ${duration.toFixed(1)}h`);
    }

    /**
     * Détermine si l'agent doit commencer sa promenade maintenant.
     * @param {string}  agentId
     * @param {Object}  calendarDate
     * @param {number}  currentHour - Heure courante du jeu (0-23).
     * @returns {boolean}
     */
    shouldWalkNow(agentId, calendarDate, currentHour) {
        if (!agentId || !calendarDate || typeof currentHour !== "number") return false;
        if (!["Samedi", "Dimanche"].includes(calendarDate.jourSemaine)) return false;

        const dayKey = this._getDayKey(calendarDate);
        const dayMap = this.agentWalkMap.get(dayKey);
        if (!dayMap) return false;

        const info = dayMap.get(agentId);
        if (!info) return false;

        // Si déjà démarré, ne pas déclencher de nouveau.
        if (info.hasStarted) return false;

        // Déclenchement si heure courante >= heure prévue ET avant fin de journée (23h).
        if (currentHour >= info.startHour && currentHour < 23) {
            info.hasStarted = true; // Marquer comme déclenché pour ne pas répéter
            console.log(`WeekendWalkStrategy: Agent ${agentId} - C'est l'heure! Départ à ${currentHour}h (prévu: ${info.startHour}h)`);
            return true;
        }
        return false;
    }

    /**
     * Renvoie un entier aléatoire inclusif entre min et max.
     */
    _randomIntInclusive(min, max) {
        const mn = Math.ceil(min);
        const mx = Math.floor(max);
        return Math.floor(Math.random() * (mx - mn + 1)) + mn;
    }

    /**
     * Renvoie un flottant aléatoire inclusif entre min et max.
     */
    _randomFloatInclusive(min, max) {
        return Math.random() * (max - min) + min;
    }
} 