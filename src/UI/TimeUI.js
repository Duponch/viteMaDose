// src/UI/TimeUI.js

export default class TimeUI {
    constructor(experience) {
        this.experience = experience;
        this.environment = this.experience.world?.environment; // Accès à l'environnement

        if (!this.environment) {
            console.warn("TimeUI: Environment n'est pas prêt lors de l'initialisation.");
            // Allow creation but update will do nothing until ready
        }

        this.container = document.body; // Ou un autre élément conteneur d'UI si tu en a un
        this.timeDateElement = null;
        this.statsElement = null;

        this.createDisplayElements();

        // Initialize average stats display properties
        this.avgHappiness = 0;
        this.avgHealth = 0;
        this.avgMaxHealth = 0;
        this.avgMoney = 0;
        this.avgSalary = 0; // Initialize average salary
    }

    createDisplayElements() {
        this.timeDateElement = document.createElement('div');
        this.timeDateElement.classList.add('time-date-display');
        this.container.appendChild(this.timeDateElement);

        this.statsElement = document.createElement('div');
        this.statsElement.classList.add('citizen-stats-display');
        this.container.appendChild(this.statsElement);

        this.update();
    }

    /**
     * Formate le temps du cycle en HH:MM.
     * @param {number} cycleTime - Temps écoulé dans le cycle en ms.
     * @param {number} dayDurationMs - Durée totale du cycle en ms.
     * @returns {string} - L'heure formatée "HH:MM".
     */
    formatTime(cycleTime, dayDurationMs) {
        if (dayDurationMs <= 0) return "00:00"; // Éviter division par zéro

        // 1. Normaliser le temps du cycle (0 à 1)
        const normalizedTime = (cycleTime % dayDurationMs) / dayDurationMs;

        // 2. --- SUPPRESSION DU DÉCALAGE ---
        // L'heure affichée correspondra directement au cycle visuel normalisé.
        // normalizedTime = 0.25 -> 6h (lever)
        // normalizedTime = 0.5  -> 12h (midi)
        // normalizedTime = 0.75 -> 18h (coucher)
        const adjustedNormalizedTime = normalizedTime; // Utiliser directement le temps normalisé

        // 3. Convertir le temps normalisé ajusté en minutes totales
        const totalMinutesInDay = 24 * 60;
        const currentMinute = Math.floor(adjustedNormalizedTime * totalMinutesInDay);

        // 4. Extraire les heures et les minutes
        const hours = Math.floor(currentMinute / 60);
        const minutes = currentMinute % 60;

        // 5. Formatage avec zéro devant si nécessaire
        const formattedHours = String(hours).padStart(2, '0');
        const formattedMinutes = String(minutes).padStart(2, '0');

        return `${formattedHours}:${formattedMinutes}`;
    }

    update() {
        if (!this.environment || !this.timeDateElement || !this.statsElement || !this.environment.isInitialized) {
             if (this.timeDateElement) this.timeDateElement.textContent = "Chargement...";
             if (this.statsElement) this.statsElement.textContent = "";
            return;
        }

        const heure = this.environment.cycleEnabled
            ? this.formatTime(this.environment.cycleTime, this.environment.dayDurationMs)
            : "Cycle désactivé";
        const cal = this.environment.getCurrentCalendarDate();
        const dateStr = cal ? `${cal.jourSemaine} ${cal.jour.toString().padStart(2, '0')}/${cal.mois.toString().padStart(2, '0')}/${cal.annee}` : "Date inconnue";

        this.timeDateElement.innerHTML = `${heure} | ${dateStr}`;

        const citizenManager = this.experience.world?.cityManager?.citizenManager;
        if (citizenManager && citizenManager.citizens.size > 0) {
            this.avgHappiness = citizenManager.getAverageHappiness();
            this.avgHealth = citizenManager.getAverageHealth();
            this.avgMaxHealth = citizenManager.getAverageMaxHealth();
            this.avgMoney = citizenManager.getAverageMoney();
            this.avgSalary = citizenManager.getAverageSalary();

            const formattedHappiness = this.avgHappiness.toFixed(1);
            const formattedHealth = this.avgHealth.toFixed(1);
            const formattedMaxHealth = this.avgMaxHealth.toFixed(1);
            const formattedMoney = this.avgMoney.toFixed(1);
            const formattedSalary = this.avgSalary.toFixed(1);

            this.statsElement.innerHTML = `
                <span class="stat-item" title="Bonheur">☻ ${formattedHappiness}</span>
                <span class="stat-item" title="Santé">♥ ${formattedHealth}/${formattedMaxHealth}</span>
                <span class="stat-item" title="Argent">$ ${formattedMoney}</span>
                <span class="stat-item" title="Salaire moyen">✤ ${formattedSalary}</span>
            `;
        } else {
            this.statsElement.innerHTML = `<span class="stat-item">--</span>`;
            this.avgHappiness = 0;
            this.avgHealth = 0;
            this.avgMaxHealth = 0;
            this.avgMoney = 0;
            this.avgSalary = 0;
        }
    }

    destroy() {
        if (this.timeDateElement && this.timeDateElement.parentNode) {
            this.timeDateElement.parentNode.removeChild(this.timeDateElement);
        }
        if (this.statsElement && this.statsElement.parentNode) {
            this.statsElement.parentNode.removeChild(this.statsElement);
        }
        this.timeDateElement = null;
        this.statsElement = null;
        this.environment = null;
        this.experience = null;
    }
}