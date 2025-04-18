// src/UI/TimeControlUI.js

export default class TimeControlUI {
    constructor(experience) {
        this.experience = experience;
        this.time = this.experience.time;
        this.container = document.createElement('div');
        this.container.classList.add('time-controls');
		this.container.dataset.uiInteractive = 'true';
        document.body.appendChild(this.container);

        this.elements = {}; // Stockera tous les boutons

        // Conteneur GLOBAL pour TOUS les boutons de calques (INCHANGÉ)
        this.debugLayersContainer = document.createElement('div');
        this.debugLayersContainer.classList.add('debug-layers-container');
		this.debugLayersContainer.dataset.uiInteractive = 'true';
        this.debugLayersContainer.style.display = 'none'; // Caché par défaut
        this.debugLayersContainer.style.position = 'absolute';
        this.debugLayersContainer.style.bottom = '70px';
        this.debugLayersContainer.style.right = '20px';
        this.debugLayersContainer.style.flexDirection = 'column';
        this.debugLayersContainer.style.gap = '8px';
        document.body.appendChild(this.debugLayersContainer);

        this.createButtons();
        this.setupEventListeners();
        this.updateButtonStates();
        this.updateLayerButtonsAppearance();
    }

    createButtons() {
        // --- Boutons Temps (INCHANGÉ) ---
        this.elements.pausePlayButton = this._createButton('pause-play-button', this.time.isPaused ? '▶' : '⏸');
        this.elements.decreaseButton = this._createButton('decrease-speed-button', '⏮');
        this.elements.increaseButton = this._createButton('increase-speed-button', '⏭');
        this.elements.speedDisplay = document.createElement('span');
        this.elements.speedDisplay.id = 'speed-display';
        this.elements.speedDisplay.textContent = `${this.time.timeScale}x`;

        // --- Bouton Debug Principal (INCHANGÉ) ---
        this.elements.debugToggleButton = this._createButton('debug-toggle-button', '♣', "Afficher/Masquer les contrôles Debug");

        // --- STRUCTURE DES CALQUES (MODIFIÉE) ---
        const layerStructure = {
            district: {
                text: 'Quartiers',
                subLayers: { residential: 'Résidentiel', business: 'Affaires', industrial: 'Industriel' }
            },
            plot: {
                text: 'Parcelles',
                subLayers: {
                    house: 'Maisons', building: 'Immeubles', industrial: 'Industriels',
                    skyscraper: 'Gratte-ciels', park: 'Parcs', unbuildable: 'Non-constr.'
                }
            },
            buildingOutline: {
                text: 'Constructions',
                subLayers: {
                    house: 'Maisons', building: 'Immeubles',
                    industrial: 'Industriels', skyscraper: 'Gratte-ciels'
                }
            },
             // --- MODIFICATION ICI ---
            navMesh: { // <-- Renommé de navGrid à navMesh
                text: 'NavMesh', // <-- Texte mis à jour
                subLayers: null
            },
            // ----------------------
            agentPath: { text: 'Paths', subLayers: null }
        };
        // ---------------------------------------

        // --- Création dynamique des boutons (INCHANGÉ - utilise layerStructure modifiée) ---
        for (const categoryName in layerStructure) {
            const categoryData = layerStructure[categoryName];
            const categoryContainer = document.createElement('div');
            categoryContainer.classList.add('debug-category-container');
            categoryContainer.style.display = 'flex';
            categoryContainer.style.flexDirection = 'column';
            categoryContainer.style.gap = '3px';

            const mainButton = this._createButton(
                `debug-category-${categoryName}`, categoryData.text, `Afficher/Masquer ${categoryData.text}`
            );
            mainButton.classList.add('debug-category-button');
            mainButton.dataset.categoryName = categoryName; // Sera 'navMesh' pour le bouton correspondant
            this.elements[`categoryBtn_${categoryName}`] = mainButton;
            categoryContainer.appendChild(mainButton);

            if (categoryData.subLayers) {
                const subMenu = document.createElement('div');
                subMenu.classList.add('debug-submenu');
                subMenu.dataset.categoryName = categoryName;
                subMenu.style.display = 'none';
                subMenu.style.marginLeft = '15px';
                subMenu.style.display = 'flex';
                subMenu.style.flexDirection = 'column';
                subMenu.style.gap = '4px';
                this.elements[`subMenu_${categoryName}`] = subMenu;

                for (const subLayerName in categoryData.subLayers) {
                    const subLayerText = categoryData.subLayers[subLayerName];
                    const subButton = this._createButton(
                        `debug-sublayer-${categoryName}-${subLayerName}`, subLayerText, `Afficher/Masquer ${subLayerText}`
                    );
                    subButton.classList.add('debug-sublayer-button');
                    subButton.dataset.categoryName = categoryName;
                    subButton.dataset.subLayerName = subLayerName;
                    this.elements[`subLayerBtn_${categoryName}_${subLayerName}`] = subButton;
                    subMenu.appendChild(subButton);
                }
                categoryContainer.appendChild(subMenu);
            }
            this.debugLayersContainer.appendChild(categoryContainer);
        } // Fin boucle sur layerStructure

        // --- Ajout final au container principal (INCHANGÉ) ---
        this.container.appendChild(this.elements.debugToggleButton);
        this.container.appendChild(this.elements.speedDisplay);
        this.container.appendChild(this.elements.decreaseButton);
        this.container.appendChild(this.elements.pausePlayButton);
        this.container.appendChild(this.elements.increaseButton);
    }

    // --- _createButton (INCHANGÉ) ---
	_createButton(id, textContent, title = '') {
        const button = document.createElement('button');
        button.id = id; button.textContent = textContent; if (title) button.title = title;
        return button;
    }

    // --- setupEventListeners (INCHANGÉ - la logique générique gère les nouveaux noms) ---
    setupEventListeners() {
        // Listeners Temps
        this.elements.pausePlayButton.addEventListener('click', () => this.time.togglePause());
        this.elements.increaseButton.addEventListener('click', () => this.time.increaseSpeed());
        this.elements.decreaseButton.addEventListener('click', () => this.time.decreaseSpeed());

        // Listener Bouton Debug Principal
        this.elements.debugToggleButton.addEventListener('click', () => this.experience.toggleDebugMode());

        // Listeners Boutons de Catégories et Sous-Calques (générique)
        Object.keys(this.elements).forEach(key => {
            const element = this.elements[key];
            if (key.startsWith('categoryBtn_')) {
                const categoryName = element.dataset.categoryName;
                const hasSubMenu = !!this.elements[`subMenu_${categoryName}`];
                element.addEventListener('click', () => {
                     if (!this.experience.isDebugMode) return;
                     if (hasSubMenu) this.experience.toggleAllSubLayersInCategory(categoryName);
                     else this.experience.toggleCategoryVisibility(categoryName); // Cas simple (ex: NavMesh, Paths)
                });
            } else if (key.startsWith('subLayerBtn_')) {
                const categoryName = element.dataset.categoryName;
                const subLayerName = element.dataset.subLayerName;
                element.addEventListener('click', () => {
                     if (!this.experience.isDebugMode) return;
                    this.experience.toggleSubLayerVisibility(categoryName, subLayerName);
                });
            }
        });

        // Écoute des événements Experience (inchangé)
        this.pauseHandler = () => this.updateButtonStates();
        this.playHandler = () => this.updateButtonStates();
        this.speedChangeHandler = (event) => this.updateButtonStates(event.detail.scale);
        this.time.addEventListener('paused', this.pauseHandler);
        this.time.addEventListener('played', this.playHandler);
        this.time.addEventListener('speedchange', this.speedChangeHandler);

        this.debugModeChangeHandler = (event) => { /* ... gestion affichage container ... */
            const isEnabled = event.detail.isEnabled;
             this.debugLayersContainer.style.display = isEnabled ? 'flex' : 'none';
			 for (const key in this.elements) { // Cache/Montre les sous-menus avec le conteneur principal
				if (key.startsWith('subMenu_')) { this.elements[key].style.display = isEnabled ? 'flex' : 'none'; }
			 }
             this.updateButtonStates();
             this.updateLayerButtonsAppearance();
         };
        this.experience.addEventListener('debugmodechanged', this.debugModeChangeHandler);

        // Ces listeners mettent à jour l'apparence basée sur l'état dans Experience
        this.categoryVisibilityChangeHandler = () => this.updateLayerButtonsAppearance();
        this.experience.addEventListener('debugcategoryvisibilitychanged', this.categoryVisibilityChangeHandler);
        this.subLayerVisibilityChangeHandler = () => this.updateLayerButtonsAppearance();
        this.experience.addEventListener('debugsublayervisibilitychanged', this.subLayerVisibilityChangeHandler);
        // --- AJOUT : Listener pour changement enfants catégorie (met à jour apparence) ---
         this.categoryChildrenChangeHandler = () => this.updateLayerButtonsAppearance();
         this.experience.addEventListener('debugcategorychildrenchanged', this.categoryChildrenChangeHandler);
        // -------------------------------------------------------------------------------
        // Note: debugsubmenuvisibilitychanged n'est plus utilisé si on ne gère plus l'ouverture/fermeture des menus ici
    }

    // --- updateButtonStates (INCHANGÉ - gère temps + bouton debug principal) ---
    updateButtonStates(currentScale = this.time?.timeScale ?? 1.0) {
        if (!this.time || !this.experience) return;
        // MàJ Boutons Temps
        if (this.time.isPaused) { this.elements.pausePlayButton.textContent = '▶'; this.elements.pausePlayButton.classList.add('paused'); }
        else { this.elements.pausePlayButton.textContent = '⏸'; this.elements.pausePlayButton.classList.remove('paused'); }
        this.elements.speedDisplay.textContent = `${currentScale}x`;
        const minSpeed = this.time.speedSteps[0]; const maxSpeed = this.time.speedSteps[this.time.speedSteps.length - 1];
        this.elements.decreaseButton.disabled = currentScale <= minSpeed; this.elements.increaseButton.disabled = currentScale >= maxSpeed;
        // MàJ Bouton Debug Principal
        if (this.experience.isDebugMode) { this.elements.debugToggleButton.style.opacity = '1.0'; this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 120, 150, 0.7)'; }
        else { this.elements.debugToggleButton.style.opacity = '0.6'; this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; }
    }

	/**
     * Met à jour l'apparence (style) de TOUS les boutons de calques. (INCHANGÉ - la logique est générique)
     */
    updateLayerButtonsAppearance() {
        if (!this.experience?.debugLayerVisibility) { /* ... gestion erreur ... */ return; }
        const layerStates = this.experience.debugLayerVisibility;
        const isGlobalDebugActive = this.experience.isDebugMode;

        Object.keys(this.elements).forEach(key => {
            const button = this.elements[key];
            if (key.startsWith('categoryBtn_')) {
                const categoryName = button.dataset.categoryName;
                if (layerStates.hasOwnProperty(categoryName)) {
                    const categoryState = layerStates[categoryName];
                    const isCategoryVisible = categoryState._visible;
                    if (isCategoryVisible && isGlobalDebugActive) button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
                    else button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                    button.disabled = !isGlobalDebugActive;
                    button.style.opacity = isGlobalDebugActive ? '1.0' : '0.5';
                } else { button.disabled = true; button.style.opacity = '0.5'; }
            } else if (key.startsWith('subLayerBtn_')) {
                const categoryName = button.dataset.categoryName;
                const subLayerName = button.dataset.subLayerName;
                if (layerStates.hasOwnProperty(categoryName) && layerStates[categoryName].hasOwnProperty(subLayerName)) {
                    const categoryState = layerStates[categoryName];
                    const isSubLayerActive = categoryState[subLayerName];
                    if (isSubLayerActive && isGlobalDebugActive && categoryState._visible) button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
                    else button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                    button.disabled = !isGlobalDebugActive || !categoryState._visible;
                    button.style.opacity = (isGlobalDebugActive && categoryState._visible) ? '1.0' : '0.5';
                } else { button.disabled = true; button.style.opacity = '0.5'; }
            }
        });
    }

    // --- updateLayerButtonsState (OBSOLETE) ---
    // Remplacé par updateLayerButtonsAppearance qui gère tous les boutons (catégories + sous-calques)
    // updateLayerButtonsState() { ... }

    // --- destroy (Adapté) ---
    destroy() {
        // Retirer listeners Temps & Debug
        this.time?.removeEventListener('paused', this.pauseHandler);
        this.time?.removeEventListener('played', this.playHandler);
        this.time?.removeEventListener('speedchange', this.speedChangeHandler);
        this.experience?.removeEventListener('debugmodechanged', this.debugModeChangeHandler);
        // Retirer les listeners de visibilité (inchangé)
        this.experience?.removeEventListener('debugcategoryvisibilitychanged', this.categoryVisibilityChangeHandler);
        this.experience?.removeEventListener('debugsublayervisibilitychanged', this.subLayerVisibilityChangeHandler);
        this.experience?.removeEventListener('debugcategorychildrenchanged', this.categoryChildrenChangeHandler); // <-- Assurer retrait

        // Retirer les éléments du DOM (inchangé)
        this.container?.remove();
        this.debugLayersContainer?.remove();

        // Nettoyer références (inchangé)
        this.experience = null; this.time = null; this.container = null;
        this.debugLayersContainer = null; this.elements = {};
        console.log("TimeControlUI destroyed.");
    }
}