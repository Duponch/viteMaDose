// src/UI/TimeUI.js

export default class TimeUI {
    constructor(experience) {
        this.experience = experience;
        this.environment = this.experience.world?.environment; // Accès à l'environnement

        if (!this.environment) {
            console.warn("TimeUI: Environment n'est pas prêt lors de l'initialisation.");
            return; // Ne rien faire si l'environnement n'est pas chargé
        }

        this.container = document.body; // Ou un autre élément conteneur d'UI si tu en as un
        this.element = null;

        this.createTimeDisplay();
    }

    createTimeDisplay() {
        this.element = document.createElement('div');
        this.element.classList.add('time-display'); // Classe CSS pour le style

        // Style initial (peut être affiné dans style.css)
        /* this.element.style.position = 'absolute';
        this.element.style.top = '10px';
        this.element.style.right = '10px';
        this.element.style.color = 'white';
        this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.element.style.padding = '5px 10px';
        this.element.style.fontFamily = 'Arial, sans-serif';
        this.element.style.fontSize = '24px';
        this.element.style.zIndex = '100'; // Pour être au-dessus du canvas */

        this.container.appendChild(this.element);
        this.update(); // Afficher l'heure initiale
    }

    /**
     * Formate le temps du cycle en HH:MM, en tenant compte du décalage visuel.
     * @param {number} cycleTime - Temps écoulé dans le cycle en ms.
     * @param {number} dayDurationMs - Durée totale du cycle en ms.
     * @returns {string} - L'heure formatée "HH:MM".
     */
    formatTime(cycleTime, dayDurationMs) {
        if (dayDurationMs <= 0) return "00:00"; // Éviter division par zéro

        // 1. Normaliser le temps du cycle (0 à 1)
        const normalizedTime = (cycleTime % dayDurationMs) / dayDurationMs;

        // 2. Appliquer un décalage pour aligner l'heure sur le cycle visuel
        //    On veut que normalizedTime = 0.25 (midi visuel) corresponde à 0.5 (12:00).
        //    Un décalage de +0.25 fait l'affaire.
        //    (0.25 + 0.25) % 1.0 = 0.5  (Midi)
        //    (0.75 + 0.25) % 1.0 = 0.0  (Minuit)
        //    (0.0 + 0.25) % 1.0 = 0.25 (6h du matin)
        const timeOffset = 0.25; // Décalage de 6 heures
        const adjustedNormalizedTime = (normalizedTime + timeOffset) % 1.0;

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
        // Vérifier si l'environnement et l'élément existent
        if (!this.environment || !this.element || !this.environment.isInitialized) {
             // Optionnel: masquer ou afficher "Chargement..." si l'env n'est pas prêt
             if (this.element) this.element.textContent = "--:--";
            return;
        }

        // Vérifier si le cycle jour/nuit est actif
        if (!this.environment.cycleEnabled) {
            this.element.textContent = "Cycle désactivé"; // Ou afficher l'heure fixe de début
            // Pour afficher l'heure fixe de début:
            // const startTime = this.environment.config.startTimeOfDay || 0.25;
            // const fixedCycleTime = (this.environment.dayDurationMs * startTime) % this.environment.dayDurationMs;
            // this.element.textContent = this.formatTime(fixedCycleTime, this.environment.dayDurationMs);
            return;
        }

        // Récupérer les valeurs actuelles du cycle
        const cycleTime = this.environment.cycleTime;
        const dayDurationMs = this.environment.dayDurationMs;

        // Mettre à jour le texte de l'élément
        this.element.textContent = this.formatTime(cycleTime, dayDurationMs);
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