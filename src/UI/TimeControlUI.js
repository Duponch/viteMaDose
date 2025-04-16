// src/UI/TimeControlUI.js

export default class TimeControlUI {
    constructor(experience) {
        this.experience = experience;
        this.time = this.experience.time;

        this.container = document.createElement('div');
        this.container.classList.add('time-controls');
        document.body.appendChild(this.container);

        this.elements = {};

        // --- Conteneur pour les boutons de calques ---
        this.debugLayersContainer = document.createElement('div');
        this.debugLayersContainer.classList.add('debug-layers-container');
        this.debugLayersContainer.style.display = 'none'; // Caché par défaut
        this.debugLayersContainer.style.position = 'absolute';
        this.debugLayersContainer.style.bottom = '70px';
        this.debugLayersContainer.style.right = '20px';
        // Initialement caché, display sera géré par JS
        // this.debugLayersContainer.style.display = 'flex'; // <-- Supprimé ici, géré par l'état
        this.debugLayersContainer.style.flexDirection = 'column';
        this.debugLayersContainer.style.gap = '5px';
        document.body.appendChild(this.debugLayersContainer);

        this.createButtons();
        this.setupEventListeners();
        this.updateButtonStates();
        this.updateLayerButtonsState();
    }

    createButtons() {
        // --- Boutons Temps ---
        this.elements.pausePlayButton = document.createElement('button');
        this.elements.pausePlayButton.id = 'pause-play-button';
        this.elements.pausePlayButton.textContent = this.time.isPaused ? '▶' : '⏸'; // Contenu initial

        this.elements.decreaseButton = document.createElement('button');
        this.elements.decreaseButton.id = 'decrease-speed-button';
        this.elements.decreaseButton.textContent = '⏮';

        this.elements.increaseButton = document.createElement('button');
        this.elements.increaseButton.id = 'increase-speed-button';
        this.elements.increaseButton.textContent = '⏭';

        this.elements.speedDisplay = document.createElement('span');
        this.elements.speedDisplay.id = 'speed-display';
        this.elements.speedDisplay.textContent = `${this.time.timeScale}x`;

        // --- Bouton Debug Principal ---
        this.elements.debugToggleButton = document.createElement('button');
        this.elements.debugToggleButton.id = 'debug-toggle-button';
        this.elements.debugToggleButton.textContent = '🐞';
        this.elements.debugToggleButton.title = "Afficher/Masquer les contrôles Debug";

        // --- Boutons de Calques ---
        const layers = [
            { id: 'districtGround', text: 'Districts' },
            { id: 'plotGround', text: 'Plots' },
            { id: 'buildingOutline', text: 'Buildings' },
            { id: 'navGrid', text: 'NavGrid' },
            { id: 'agentPath', text: 'Paths' }
        ];

        layers.forEach(layer => {
            const button = document.createElement('button');
            button.id = `debug-layer-${layer.id}`;
            button.classList.add('debug-layer-button');
            button.textContent = layer.text;
            button.dataset.layerName = layer.id;
            this.elements[`layerBtn_${layer.id}`] = button;
            this.debugLayersContainer.appendChild(button);
        });

        // --- Ajout au container principal ---
        this.container.appendChild(this.elements.debugToggleButton);
        this.container.appendChild(this.elements.speedDisplay);
        this.container.appendChild(this.elements.decreaseButton);
        this.container.appendChild(this.elements.pausePlayButton);
        this.container.appendChild(this.elements.increaseButton);
    }

    setupEventListeners() {
        // --- Listeners Temps ---
        this.elements.pausePlayButton.addEventListener('click', () => this.time.togglePause());
        this.elements.increaseButton.addEventListener('click', () => {
            this.time.increaseSpeed();
            if(this.time.isPaused) this.time.play(); // Reprendre si en pause
        });
        this.elements.decreaseButton.addEventListener('click', () => {
            this.time.decreaseSpeed();
            if(this.time.isPaused) this.time.play(); // Reprendre si en pause
        });

        // --- Listener Bouton Debug Principal ---
        this.elements.debugToggleButton.addEventListener('click', () => {
            this.experience.toggleDebugMode();
            // La visibilité du conteneur est gérée par l'écouteur 'debugmodechanged'
        });

        // --- Listeners Boutons de Calques ---
        Object.keys(this.elements).forEach(key => {
            if (key.startsWith('layerBtn_')) {
                const button = this.elements[key];
                const layerName = button.dataset.layerName;
                if (layerName) {
                    button.addEventListener('click', () => {
                         if (this.experience.isDebugMode) {
                            this.experience.toggleDebugLayer(layerName);
                         } else {
                            console.log("Activez d'abord le mode Debug principal.");
                         }
                    });
                }
            }
        });

        // --- Écoute des événements ---
        this.pauseHandler = () => this.updateButtonStates();
        this.playHandler = () => this.updateButtonStates();
        this.speedChangeHandler = (event) => this.updateButtonStates(event.detail.scale);
        this.time.addEventListener('paused', this.pauseHandler);
        this.time.addEventListener('played', this.playHandler);
        this.time.addEventListener('speedchange', this.speedChangeHandler);

        this.debugModeChangeHandler = (event) => {
             this.updateButtonStates();
             this.debugLayersContainer.style.display = event.detail.isEnabled ? 'flex' : 'none';
             this.updateLayerButtonsState(); // MAJ état boutons calques
        };
        this.experience.addEventListener('debugmodechanged', this.debugModeChangeHandler);

        this.debugLayerVisibilityChangeHandler = (event) => {
            this.updateLayerButtonsState(); // MAJ état boutons calques
        };
        this.experience.addEventListener('debuglayervisibilitychanged', this.debugLayerVisibilityChangeHandler);
    }

    updateButtonStates(currentScale = this.time.timeScale) {
        // Vérifier si time existe encore (utile lors de la destruction)
        if (!this.time) return;

        // --- MàJ Boutons Temps ---
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

        // --- MàJ Bouton Debug Principal ---
        // Vérifier si experience existe encore
        if (!this.experience) return;
        if (this.experience.isDebugMode) {
            this.elements.debugToggleButton.style.opacity = '1.0';
            this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 150, 255, 0.7)';
        } else {
            this.elements.debugToggleButton.style.opacity = '0.6';
            this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        }
    }

    updateLayerButtonsState() {
        // --- AJOUT DE LA VÉRIFICATION ---
        if (!this.experience || typeof this.experience.debugLayerVisibility !== 'object') {
            console.warn("TimeControlUI: Experience ou debugLayerVisibility non disponible pour la mise à jour de l'état des boutons de calque.");
            // Optionnellement, désactiver tous les boutons de calque si l'état n'est pas disponible
            Object.keys(this.elements).forEach(key => {
                if (key.startsWith('layerBtn_')) {
                    const button = this.elements[key];
                    button.disabled = true;
                    button.style.opacity = '0.5';
                    button.style.border = '1px solid transparent';
                    button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                }
            });
            return; // Sortir de la fonction
        }
        // --- FIN DE L'AJOUT ---

        const layerVisibility = this.experience.debugLayerVisibility; // Maintenant on sait que ça existe
        const isGlobalDebugActive = this.experience.isDebugMode;

        Object.keys(this.elements).forEach(key => {
            if (key.startsWith('layerBtn_')) {
                const button = this.elements[key];
                const layerName = button.dataset.layerName;

                // La vérification hasOwnProperty peut maintenant être effectuée en toute sécurité
                if (layerName && layerVisibility.hasOwnProperty(layerName)) {
                    const isActive = layerVisibility[layerName];
                    // Appliquer un style si le calque est visible ET le mode debug global est actif
                    if (isActive && isGlobalDebugActive) {
                        button.style.border = '1px solid #00aaff';
                        button.style.backgroundColor = 'rgba(0, 100, 180, 0.7)';
                    } else {
                        button.style.border = '1px solid transparent';
                        button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; // Style standard
                    }
                    // Griser le bouton si le mode debug global n'est pas actif
                    button.disabled = !isGlobalDebugActive;
                    button.style.opacity = isGlobalDebugActive ? '1.0' : '0.5';
                } else if (layerName) {
                    // Log si un bouton existe pour un layerName non trouvé dans l'état (sécurité)
                    console.warn(`TimeControlUI: Bouton trouvé pour un calque inconnu '${layerName}'.`);
                    button.disabled = true;
                    button.style.opacity = '0.5';
                }
            }
        });
    }

    destroy() {
        // --- Retirer listeners Temps & Debug ---
        // Utiliser optional chaining pour éviter les erreurs si time/experience sont déjà null
        this.time?.removeEventListener('paused', this.pauseHandler);
        this.time?.removeEventListener('played', this.playHandler);
        this.time?.removeEventListener('speedchange', this.speedChangeHandler);
        this.experience?.removeEventListener('debugmodechanged', this.debugModeChangeHandler);
        this.experience?.removeEventListener('debuglayervisibilitychanged', this.debugLayerVisibilityChangeHandler);

        // --- Retirer les éléments du DOM ---
        this.container?.remove(); // Méthode plus simple pour retirer l'élément
        this.debugLayersContainer?.remove();

        // --- Nettoyer références ---
        this.experience = null;
        this.time = null;
        this.container = null;
        this.debugLayersContainer = null;
        this.elements = {};
        console.log("TimeControlUI destroyed.");
    }
}