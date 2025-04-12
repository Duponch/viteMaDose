/*
 * Fichier: src/UI/TimeControlUI.js
 * Ajouts:
 * - Création du bouton de debug.
 * - Ajout d'un écouteur pour le clic sur le bouton debug -> experience.toggleDebugMode().
 * - Ajout d'un écouteur pour l'événement 'debugmodechanged' -> met à jour l'apparence du bouton.
 * - Nettoyage des nouveaux écouteurs dans destroy().
 */
// src/UI/TimeControlUI.js

export default class TimeControlUI {
    constructor(experience) {
        this.experience = experience;
        this.time = this.experience.time; // Accès direct à l'instance Time

        this.container = document.createElement('div');
        this.container.classList.add('time-controls');
        document.body.appendChild(this.container); // Ajoute le conteneur au body

        this.elements = {}; // Pour stocker les références aux boutons

        this.createButtons();
        this.setupEventListeners();
        this.updateButtonStates(); // Mettre à jour l'état initial (y compris debug)
    }

    createButtons() {
        // --- Boutons existants ---
        this.elements.pausePlayButton = document.createElement('button');
        this.elements.pausePlayButton.id = 'pause-play-button';

        this.elements.decreaseButton = document.createElement('button');
        this.elements.decreaseButton.id = 'decrease-speed-button';
        this.elements.decreaseButton.textContent = '⏮';

        this.elements.increaseButton = document.createElement('button');
        this.elements.increaseButton.id = 'increase-speed-button';
        this.elements.increaseButton.textContent = '⏭';

        this.elements.speedDisplay = document.createElement('span');
        this.elements.speedDisplay.id = 'speed-display';
        this.elements.speedDisplay.textContent = `${this.time.timeScale}x`; // Affichage initial

        // --- Nouveau Bouton Debug ---
        this.elements.debugToggleButton = document.createElement('button');
        this.elements.debugToggleButton.id = 'debug-toggle-button';
        this.elements.debugToggleButton.textContent = '〄'; // Emoji insecte pour debug
        this.elements.debugToggleButton.title = "Activer/Désactiver le mode Debug"; // Tooltip
        // Style initial (mode debug désactivé)
        // --------------------------

        // --- Ajout au container (ordre peut être ajusté) ---
        this.container.appendChild(this.elements.debugToggleButton); // Ajouté en premier
        this.container.appendChild(this.elements.speedDisplay);
        this.container.appendChild(this.elements.decreaseButton);
        this.container.appendChild(this.elements.pausePlayButton);
        this.container.appendChild(this.elements.increaseButton);
    }

    setupEventListeners() {
        // --- Clics sur les boutons existants ---
        this.elements.pausePlayButton.addEventListener('click', () => {
            this.time.togglePause();
        });
        this.elements.increaseButton.addEventListener('click', () => {
            this.time.increaseSpeed();
            if(this.time.isPaused) this.time.play();
        });
        this.elements.decreaseButton.addEventListener('click', () => {
            this.time.decreaseSpeed();
            if(this.time.isPaused) this.time.play();
        });

        // --- Clic sur le bouton Debug ---
        this.elements.debugToggleButton.addEventListener('click', () => {
            this.experience.toggleDebugMode();
        });
        // ------------------------------

        // --- Écoute des événements de Time.js ---
        this.pauseHandler = () => this.updateButtonStates();
        this.playHandler = () => this.updateButtonStates();
        this.speedChangeHandler = (event) => this.updateButtonStates(event.detail.scale);

        this.time.addEventListener('paused', this.pauseHandler);
        this.time.addEventListener('played', this.playHandler);
        this.time.addEventListener('speedchange', this.speedChangeHandler);

        // --- Écoute de l'événement de Experience pour le mode debug ---
        this.debugModeChangeHandler = (event) => this.updateButtonStates();
        this.experience.addEventListener('debugmodechanged', this.debugModeChangeHandler);
        // -----------------------------------------------------------
    }

    updateButtonStates(currentScale = this.time.timeScale) {
        // --- Mise à jour boutons temps ---
        if (this.time.isPaused) {
            this.elements.pausePlayButton.textContent = '▶'; // Icône Play
            this.elements.pausePlayButton.classList.add('paused');
        } else {
            this.elements.pausePlayButton.textContent = '⏸'; // Icône Pause
            this.elements.pausePlayButton.classList.remove('paused');
        }
        this.elements.speedDisplay.textContent = `${currentScale}x`;
        const minSpeed = this.time.speedSteps[0];
        const maxSpeed = this.time.speedSteps[this.time.speedSteps.length - 1];
        this.elements.decreaseButton.disabled = currentScale <= minSpeed;
        this.elements.increaseButton.disabled = currentScale >= maxSpeed;

        // --- Mise à jour bouton debug ---
        if (this.experience.isDebugMode) {
            this.elements.debugToggleButton.style.opacity = '1.0'; // Pleinement visible
            this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 150, 255, 0.7)'; // Fond bleu léger
        } else {
            this.elements.debugToggleButton.style.opacity = '0.6'; // Moins visible
            this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; // Fond sombre standard
        }
        // ------------------------------
    }

    // Optionnel: méthode update à appeler dans la boucle principale si besoin
    update() {
        // Généralement pas nécessaire si l'UI réagit aux événements
    }

    destroy() {
        // --- Retirer les écouteurs d'événements de Time.js ---
        this.time.removeEventListener('paused', this.pauseHandler);
        this.time.removeEventListener('played', this.playHandler);
        this.time.removeEventListener('speedchange', this.speedChangeHandler);

        // --- Retirer l'écouteur d'événement de Experience ---
        this.experience.removeEventListener('debugmodechanged', this.debugModeChangeHandler);
        // ----------------------------------------------------

        // Retirer les écouteurs des boutons (pas strictement nécessaire si l'élément est retiré du DOM)
        // this.elements.pausePlayButton.removeEventListener('click', ...); // etc.
        // this.elements.debugToggleButton.removeEventListener('click', ...);

        // Retirer le conteneur du DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        // Nettoyer les références
        this.experience = null;
        this.time = null;
        this.container = null;
        this.elements = {};
        console.log("TimeControlUI destroyed.");
    }
}