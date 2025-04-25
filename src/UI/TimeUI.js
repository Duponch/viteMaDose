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
        this.element = null;

        this.createTimeDisplay();

        // Initialize average stats display properties
        this.avgHappiness = 0;
        this.avgHealth = 0;
        this.avgMaxHealth = 0;
        this.avgMoney = 0;
        this.avgSalary = 0; // Initialize average salary
    }

    createTimeDisplay() {
        this.element = document.createElement('div');
        this.element.classList.add('time-display'); // Classe CSS pour le style
        this.container.appendChild(this.element);
        this.update(); // Afficher l'heure initiale
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
        // Vérifier si l'environnement et l'élément existent et si l'environnement est initialisé
        if (!this.environment || !this.element || !this.environment.isInitialized) {
             // Optionnel: masquer ou afficher "Chargement..." si l'env n'est pas prêt
             if (this.element) this.element.textContent = "Chargement..."; // Indiquer chargement
            return;
        }

        // Vérifier si le cycle jour/nuit est actif (pour l'affichage de l'heure)
        const heure = this.environment.cycleEnabled 
            ? this.formatTime(this.environment.cycleTime, this.environment.dayDurationMs)
            : "Cycle désactivé"; // Afficher état si cycle désactivé

        // Récupérer la date courante du calendrier
        const cal = this.environment.getCurrentCalendarDate();
        // Format : Jeudi 24/04/2025
        const dateStr = cal ? `${cal.jourSemaine} ${cal.jour.toString().padStart(2, '0')}/${cal.mois.toString().padStart(2, '0')}/${cal.annee}` : "Date inconnue";

        // --- Récupérer et afficher les statistiques moyennes des citoyens ---
        const citizenManager = this.experience.world?.cityManager?.citizenManager;
        if (citizenManager && citizenManager.citizens.size > 0) {
            this.avgHappiness = citizenManager.getAverageHappiness();
            this.avgHealth = citizenManager.getAverageHealth();
            this.avgMaxHealth = citizenManager.getAverageMaxHealth();
            this.avgMoney = citizenManager.getAverageMoney();
            this.avgSalary = citizenManager.getAverageSalary(); // Get average salary

            // Format the stats (rounding to 1 decimal places)
            const formattedHappiness = this.avgHappiness.toFixed(1);
            const formattedHealth = this.avgHealth.toFixed(1);
            const formattedMaxHealth = this.avgMaxHealth.toFixed(1);
            const formattedMoney = this.avgMoney.toFixed(1);
            const formattedSalary = this.avgSalary.toFixed(1); // Format average salary

            // Update the text content with time, date, and stats
            this.element.innerHTML = `
                <div class="time-date">${heure} | ${dateStr}</div>
                <div class="citizen-stats">
                    Bonheur: ${formattedHappiness} %
                    Santé: ${formattedHealth} / ${formattedMaxHealth}
                    Argent: ${formattedMoney} $
                    Salaire moyen: ${formattedSalary} $/jour
                </div>
            `;
        } else {
            // Display only time/date if no citizens or manager not ready
             this.element.innerHTML = `
                 <div class="time-date">${heure} | ${dateStr}</div>
                 <div class="citizen-stats">Aucun citoyen</div>
             `;
            // Optionally reset displayed averages if no citizens
             this.avgHappiness = 0;
             this.avgHealth = 0;
             this.avgMaxHealth = 0;
             this.avgMoney = 0;
             this.avgSalary = 0; // Reset average salary display
        }

        // OLD line: this.element.textContent = `${heure}  |  ${dateStr}`;
    }

    // Méthode pour nettoyer l'élément lors de la destruction de l'expérience
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.environment = null;
        this.experience = null;
    }
}