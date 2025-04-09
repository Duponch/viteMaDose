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
        this.updateButtonStates(); // Mettre à jour l'état initial
    }

    createButtons() {
        this.elements.pausePlayButton = document.createElement('button');
        this.elements.pausePlayButton.id = 'pause-play-button';

        this.elements.decreaseButton = document.createElement('button');
        this.elements.decreaseButton.id = 'decrease-speed-button';
        this.elements.decreaseButton.textContent = '-';

        this.elements.increaseButton = document.createElement('button');
        this.elements.increaseButton.id = 'increase-speed-button';
        this.elements.increaseButton.textContent = '+';

        this.elements.speedDisplay = document.createElement('span');
        this.elements.speedDisplay.id = 'speed-display';
        this.elements.speedDisplay.textContent = `${this.time.timeScale}x`; // Affichage initial

		this.container.appendChild(this.elements.speedDisplay);
        this.container.appendChild(this.elements.decreaseButton);
        this.container.appendChild(this.elements.pausePlayButton);
        this.container.appendChild(this.elements.increaseButton);
    }

    setupEventListeners() {
        // Clics sur les boutons
        this.elements.pausePlayButton.addEventListener('click', () => {
            this.time.togglePause();
        });

        this.elements.increaseButton.addEventListener('click', () => {
            this.time.increaseSpeed();
            // Si on accélère, on sort de la pause explicitement
            if(this.time.isPaused) {
                this.time.play();
            }
        });

        this.elements.decreaseButton.addEventListener('click', () => {
            this.time.decreaseSpeed();
             // Si on ralentit, on sort de la pause explicitement
             if(this.time.isPaused) {
                this.time.play();
            }
        });

        // Écoute des événements de Time.js pour mettre à jour l'UI
        this.pauseHandler = () => this.updateButtonStates();
        this.playHandler = () => this.updateButtonStates();
        this.speedChangeHandler = (event) => this.updateButtonStates(event.detail.scale);

        this.time.addEventListener('paused', this.pauseHandler);
        this.time.addEventListener('played', this.playHandler);
        this.time.addEventListener('speedchange', this.speedChangeHandler);
    }

    updateButtonStates(currentScale = this.time.timeScale) {
        // Mettre à jour le bouton Play/Pause
        if (this.time.isPaused) {
            this.elements.pausePlayButton.textContent = '>'; // Ou une icône Play
            this.elements.pausePlayButton.classList.add('paused');
        } else {
            this.elements.pausePlayButton.textContent = 'II'; // Ou une icône Pause
            this.elements.pausePlayButton.classList.remove('paused');
        }

        // Mettre à jour l'affichage de la vitesse
        this.elements.speedDisplay.textContent = `${currentScale}x`;

        // Désactiver les boutons +/- si on atteint les limites
        const minSpeed = this.time.speedSteps[0];
        const maxSpeed = this.time.speedSteps[this.time.speedSteps.length - 1];
        this.elements.decreaseButton.disabled = currentScale <= minSpeed;
        this.elements.increaseButton.disabled = currentScale >= maxSpeed;
    }

    // Optionnel: méthode update à appeler dans la boucle principale si besoin
    update() {
        // Généralement pas nécessaire si l'UI réagit aux événements
    }

    destroy() {
        // Retirer les écouteurs d'événements de Time.js
        this.time.removeEventListener('paused', this.pauseHandler);
        this.time.removeEventListener('played', this.playHandler);
        this.time.removeEventListener('speedchange', this.speedChangeHandler);

        // Retirer les écouteurs des boutons (pas strictement nécessaire si l'élément est retiré du DOM)
        // this.elements.pausePlayButton.removeEventListener('click', ...); // etc.

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