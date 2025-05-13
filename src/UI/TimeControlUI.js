// src/UI/TimeControlUI.js

export default class TimeControlUI {
    constructor(experience) {
        this.experience = experience;
        this.time = this.experience.time;
        this.container = document.createElement('div');
        this.container.classList.add('time-controls');
		this.container.dataset.uiInteractive = 'true';
        document.body.appendChild(this.container);

        this.elements = {}; // Stockera tous les boutons (principaux et sous-types)

        // --- Conteneur GLOBAL pour TOUS les boutons de calques ---
        this.debugLayersContainer = document.createElement('div');
        this.debugLayersContainer.classList.add('debug-layers-container');
		this.debugLayersContainer.dataset.uiInteractive = 'true';
        // ----- MODIFICATION ICI -----
        this.debugLayersContainer.style.display = 'none'; // <- Changé de 'flex' à 'none'
        // --------------------------
        this.debugLayersContainer.style.position = 'absolute';
        this.debugLayersContainer.style.bottom = '70px'; // Ou ajuster selon besoin
        this.debugLayersContainer.style.right = '20px';
        // La ligne display: 'flex' a été retirée/modifiée ci-dessus
        this.debugLayersContainer.style.flexDirection = 'column';
        this.debugLayersContainer.style.gap = '8px'; // Espace entre catégories
        document.body.appendChild(this.debugLayersContainer);

        this.createButtons();
        this.setupEventListeners();
        this.updateButtonStates(); // Met à jour états initiaux
        this.updateLayerButtonsAppearance();
        this.syncUIButtonStates(); // Ajouter la synchronisation initiale
    }

    createButtons() {
        // --- Boutons Temps (inchangés) ---
        this.elements.pausePlayButton = this._createButton('pause-play-button', this.time.isPaused ? '▶' : '⏸');
        this.elements.decreaseButton = this._createButton('decrease-speed-button', '⏮');
        this.elements.increaseButton = this._createButton('increase-speed-button', '⏭');
        this.elements.speedDisplay = document.createElement('span');
        this.elements.speedDisplay.id = 'speed-display';
        this.elements.speedDisplay.textContent = `${this.time.timeScale}x`;

        // --- Bouton Carte de la Ville ---
        this.elements.cityMapButton = this._createButton('city-map-button', '🗺', "Afficher/Masquer la carte de la ville");

        // --- Boutons Météo et Environnement ---
        this.elements.weatherUIButton = this._createButton('weather-ui-button', '🌤', "Afficher/Masquer l'UI météo");
        this.elements.environmentUIButton = this._createButton('environment-ui-button', '♣', "Afficher/Masquer l'UI environnement");
        
        // Synchroniser les boutons avec l'état par défaut des UIs
        this.elements.weatherUIButton.classList.toggle('active', this.experience.uiStates?.weather ?? false);
        this.elements.environmentUIButton.classList.toggle('active', this.experience.uiStates?.environment ?? false);

        // --- Bouton Debug Principal (inchangé) ---
        this.elements.debugToggleButton = this._createButton('debug-toggle-button', '#', "Afficher/Masquer les contrôles Debug");

        // --- STRUCTURE DES CALQUES ET SOUS-CALQUES ---
        const layerStructure = {
            district: {
                text: 'Quartiers',
                subLayers: {
                    residential: 'Résidentiel',
                    business: 'Affaires',
                    industrial: 'Industriel'
                }
            },
            plot: {
                text: 'Parcelles',
                subLayers: {
                    house: 'Maisons',
                    building: 'Immeubles',
                    industrial: 'Industriels',
                    skyscraper: 'Gratte-ciels',
                    park: 'Parcs',
                    unbuildable: 'Non-constr.' // Optionnel
                }
            },
            buildingOutline: {
                text: 'Constructions',
                subLayers: {
                    house: 'Maisons',
                    building: 'Immeubles',
                    industrial: 'Industriels',
                    skyscraper: 'Gratte-ciels'
                }
            },
            navGridPedestrian: { text: 'NavGrid Piétons', subLayers: null },
            navGridVehicle: { text: 'NavGrid Véhicules', subLayers: null },
            agentPath: { text: 'Paths pedestrian', subLayers: null },
            vehiclePath: { text: 'Paths vehicle', subLayers: null }
        };

        // --- Création dynamique des boutons et sous-menus ---
        for (const categoryName in layerStructure) {
            const categoryData = layerStructure[categoryName];

            // Conteneur pour cette catégorie (bouton + sous-menu)
            const categoryContainer = document.createElement('div');
            categoryContainer.classList.add('debug-category-container');
            categoryContainer.style.display = 'flex';
            categoryContainer.style.flexDirection = 'column';
            categoryContainer.style.gap = '3px'; // Espace entre bouton principal et sous-menu

            // Bouton principal de la catégorie
            const mainButton = this._createButton(
                `debug-category-${categoryName}`,
                //categoryData.text + (categoryData.subLayers ? ' ▼' : ''), // Indicateur flèche si sous-menu
				categoryData.text, // Juste le texte
                `Afficher/Masquer ${categoryData.text}`
            );
            mainButton.classList.add('debug-category-button'); // Classe spécifique
            mainButton.dataset.categoryName = categoryName;
            this.elements[`categoryBtn_${categoryName}`] = mainButton;
            categoryContainer.appendChild(mainButton);

            // Si des sous-calques existent, créer le sous-menu
            if (categoryData.subLayers) {
                const subMenu = document.createElement('div');
                subMenu.classList.add('debug-submenu');
                subMenu.dataset.categoryName = categoryName;
                subMenu.style.display = 'none'; // Caché par défaut
                subMenu.style.marginLeft = '15px'; // Indentation
                subMenu.style.flexDirection = 'column';
                subMenu.style.gap = '4px';
                this.elements[`subMenu_${categoryName}`] = subMenu; // Stocker référence au sous-menu

                for (const subLayerName in categoryData.subLayers) {
                    const subLayerText = categoryData.subLayers[subLayerName];
                    const subButton = this._createButton(
                        `debug-sublayer-${categoryName}-${subLayerName}`,
                        subLayerText,
                        `Afficher/Masquer ${subLayerText}`
                    );
                    subButton.classList.add('debug-sublayer-button'); // Classe spécifique
                    subButton.dataset.categoryName = categoryName;
                    subButton.dataset.subLayerName = subLayerName;
                    this.elements[`subLayerBtn_${categoryName}_${subLayerName}`] = subButton;
                    subMenu.appendChild(subButton);
                }
                categoryContainer.appendChild(subMenu);
            }

            // Ajouter le conteneur de catégorie au conteneur principal des calques
            this.debugLayersContainer.appendChild(categoryContainer);

        } // Fin boucle sur layerStructure

        // --- Ajout final au container principal de l'UI (en bas à droite) ---
        this.container.appendChild(this.elements.cityMapButton);
        this.container.appendChild(this.elements.weatherUIButton);
        this.container.appendChild(this.elements.environmentUIButton);
        this.container.appendChild(this.elements.debugToggleButton);
        this.container.appendChild(this.elements.speedDisplay);
        this.container.appendChild(this.elements.decreaseButton);
        this.container.appendChild(this.elements.pausePlayButton);
        this.container.appendChild(this.elements.increaseButton);

        // Synchroniser l'état initial des boutons
        this.syncUIButtonStates();
    }

	_createButton(id, textContent, title = '') {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = textContent;
        if (title) button.title = title;
        // Ajouter des classes de base si nécessaire
        // button.classList.add('debug-button-base');
        return button;
    }

    setupEventListeners() {
        // --- Listeners Temps (inchangés) ---
        this.elements.pausePlayButton.addEventListener('click', () => this.time.togglePause());
        this.elements.increaseButton.addEventListener('click', () => {
            this.time.increaseSpeed();
        });
        this.elements.decreaseButton.addEventListener('click', () => {
            this.time.decreaseSpeed();
        });

        // --- Listeners Boutons Météo et Environnement ---
        this.elements.weatherUIButton.addEventListener('click', () => {
            this.experience.toggleWeatherUI();
            this.syncUIButtonStates(); // Utiliser la synchronisation au lieu du toggle direct
        });

        this.elements.environmentUIButton.addEventListener('click', () => {
            this.experience.toggleEnvironmentUI();
            this.syncUIButtonStates(); // Utiliser la synchronisation au lieu du toggle direct
        });

        // --- Listener Bouton Debug Principal ---
        this.elements.debugToggleButton.addEventListener('click', () => {
            this.experience.toggleDebugMode();
            this.syncUIButtonStates(); // Utiliser la synchronisation au lieu du toggle direct
        });

        // --- Listeners Boutons de Catégories et Sous-Calques ---
        Object.keys(this.elements).forEach(key => {
            const element = this.elements[key];

            if (key.startsWith('categoryBtn_')) {
                const categoryName = element.dataset.categoryName;
                const subMenuElement = this.elements[`subMenu_${categoryName}`];

                element.addEventListener('click', () => {
                    if (!this.experience.isDebugMode) {
                        console.log("Activez d'abord le mode Debug principal.");
                        return;
                    }

                    // Vérifier si le sous-menu existe avant d'accéder à ses propriétés
                    if (subMenuElement) {
                        // Toggle l'affichage du sous-menu
                        const isVisible = subMenuElement.style.display === 'flex';
                        subMenuElement.style.display = isVisible ? 'none' : 'flex';
                        
                        // Mettre à jour la flèche
                        element.textContent = element.textContent.replace(
                            isVisible ? '▼' : '▶',
                            isVisible ? '▶' : '▼'
                        );

                        // Si on ouvre le menu, on active la catégorie
                        if (!isVisible) {
                            this.experience.toggleAllSubLayersInCategory(categoryName);
                        } else {
                            // Désactiver la catégorie et tous ses sous-éléments
                            const category = this.experience.debugLayerVisibility[categoryName];
                            if (category) {
                                category._visible = false;
                                Object.keys(category).forEach(key => {
                                    if (!key.startsWith('_')) {
                                        category[key] = false;
                                    }
                                });
                                // Mettre à jour la visibilité dans le monde 3D
                                if (this.experience.world) {
                                    this.experience.world.setGroupVisibility(categoryName, false);
                                }
                                // Déclencher l'événement de mise à jour
                                this.experience.dispatchEvent(new CustomEvent('debugcategoryvisibilitychanged', {
                                    detail: {
                                        categoryName: categoryName,
                                        isVisible: false,
                                        allStates: { ...this.experience.debugLayerVisibility }
                                    }
                                }));
                            }
                        }
                    } else {
                        // Pour les catégories sans sous-menu, simplement basculer leur état
                        this.experience.toggleAllSubLayersInCategory(categoryName);
                    }
                });
            }
            // Listener Sous-calque (inchangé)
            else if (key.startsWith('subLayerBtn_')) {
                const categoryName = element.dataset.categoryName;
                const subLayerName = element.dataset.subLayerName;
                element.addEventListener('click', () => {
                     if (!this.experience.isDebugMode) {
                         console.log("Activez d'abord le mode Debug principal.");
                         return;
                     }
                    this.experience.toggleSubLayerVisibility(categoryName, subLayerName);
                });
            }
        });

        // --- Écoute des événements Experience (modifié) ---
        this.pauseHandler = () => this.updateButtonStates();
        this.playHandler = () => this.updateButtonStates();
        this.speedChangeHandler = (event) => this.updateButtonStates(event.detail.scale);
        this.time.addEventListener('paused', this.pauseHandler);
        this.time.addEventListener('played', this.playHandler);
        this.time.addEventListener('speedchange', this.speedChangeHandler);

        // Changement global du mode debug
        this.debugModeChangeHandler = (event) => {
             const isEnabled = event.detail.isEnabled;
             this.debugLayersContainer.style.display = isEnabled ? 'flex' : 'none';
             // Ne plus forcer l'affichage des sous-menus lors de l'activation du mode debug
             this.updateButtonStates(); // Met à jour l'état du bouton debug principal
             this.updateLayerButtonsAppearance(); // Met à jour l'apparence de tous les boutons de calques
        };
        this.experience.addEventListener('debugmodechanged', this.debugModeChangeHandler);

        // Changement de visibilité d'une catégorie (groupe entier)
        this.categoryVisibilityChangeHandler = (event) => {
            this.updateLayerButtonsAppearance();
        };
        this.experience.addEventListener('debugcategoryvisibilitychanged', this.categoryVisibilityChangeHandler);

        // Changement de visibilité d'un sous-calque (mesh spécifique)
        this.subLayerVisibilityChangeHandler = (event) => {
            this.updateLayerButtonsAppearance();
        };
        this.experience.addEventListener('debugsublayervisibilitychanged', this.subLayerVisibilityChangeHandler);

        // Changement de visibilité d'un sous-menu (pour affichage UI)
        this.subMenuVisibilityChangeHandler = (event) => {
             const { categoryName, showSubMenu } = event.detail;
             const subMenuElement = this.elements[`subMenu_${categoryName}`];
             if (subMenuElement) {
                 subMenuElement.style.display = showSubMenu ? 'flex' : 'none';
             }
             // Mettre à jour l'apparence du bouton parent (ex: flèche)
              const parentButton = this.elements[`categoryBtn_${categoryName}`];
              if (parentButton && parentButton.textContent.includes('▼')) {
                   parentButton.textContent = parentButton.textContent.replace(showSubMenu ? '▼' : '►', showSubMenu ? '►' : '▼');
              }
        };
        this.experience.addEventListener('debugsubmenuvisibilitychanged', this.subMenuVisibilityChangeHandler);

        // Écouteur pour le bouton de carte
        this.elements.cityMapButton.addEventListener('click', () => {
            this.experience.world.cityManager.toggleCityMap();
            this.syncUIButtonStates(); // Utiliser la synchronisation au lieu du toggle direct
        });

        // Ajouter des écouteurs pour les changements d'état des UI
        this.experience.addEventListener('weatheruichanged', () => this.syncUIButtonStates());
        this.experience.addEventListener('environmentuichanged', () => this.syncUIButtonStates());
        this.experience.addEventListener('debugmodechanged', () => this.syncUIButtonStates());
        this.experience.addEventListener('citymapvisibilitychanged', () => this.syncUIButtonStates());
    }

    /**
     * Met à jour l'état des boutons de contrôle du temps et du bouton debug principal.
     * (Séparé de l'apparence des boutons de calques)
     */
    updateButtonStates(currentScale = this.time?.timeScale ?? 1.0) {
        // Vérifier si time et experience existent encore
        if (!this.time || !this.experience) return;

        // --- MàJ Boutons Temps ---
        if (this.time.isPaused) {
            this.elements.pausePlayButton.textContent = '▶';
            this.elements.pausePlayButton.classList.add('paused');
        } else {
            this.elements.pausePlayButton.textContent = '⏸';
            this.elements.pausePlayButton.classList.remove('paused');
        }
        this.elements.speedDisplay.textContent = `${currentScale}x`;
        const minSpeed = this.time.speedSteps[0];
        const maxSpeed = this.time.speedSteps[this.time.speedSteps.length - 1];
        this.elements.decreaseButton.disabled = currentScale <= minSpeed;
        this.elements.increaseButton.disabled = currentScale >= maxSpeed;
    }

	/**
     * NOUVEAU : Met à jour l'apparence (style) de TOUS les boutons de calques
     * (catégories et sous-calques) en fonction de l'état actuel dans Experience.
     */
    updateLayerButtonsAppearance() {
        if (!this.experience || !this.experience.debugLayerVisibility) {
            console.warn("TimeControlUI: Experience ou debugLayerVisibility non disponible.");
            // Option: griser tous les boutons de calques
             Object.keys(this.elements).forEach(key => {
                if (key.startsWith('categoryBtn_') || key.startsWith('subLayerBtn_')) {
                    this.elements[key].disabled = true;
                    this.elements[key].style.opacity = '0.5';
                    this.elements[key].style.border = '1px solid transparent';
                    this.elements[key].style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                    this.elements[key].classList.remove('active');
                }
            });
            return;
        }

        const layerStates = this.experience.debugLayerVisibility;
        const isGlobalDebugActive = this.experience.isDebugMode;

        // Parcourir tous les éléments pour trouver les boutons
        Object.keys(this.elements).forEach(key => {
            const button = this.elements[key];

            if (key.startsWith('categoryBtn_')) {
                const categoryName = button.dataset.categoryName;
                if (layerStates.hasOwnProperty(categoryName)) {
                    const categoryState = layerStates[categoryName];
                    const isCategoryVisible = categoryState._visible;
                    console.log(`[TimeControlUI] UpdateAppearance pour ${categoryName}: isCategoryVisible=${isCategoryVisible}, isGlobalDebugActive=${isGlobalDebugActive}`);

                    // Style basé sur la visibilité de la catégorie ET le mode debug global
                    if (isCategoryVisible && isGlobalDebugActive) {
                        button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
                        button.classList.add('active');
                    } else {
                        button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                        button.classList.remove('active');
                    }
                    // Correction : le bouton reste cliquable si le mode debug est actif
                    button.disabled = !isGlobalDebugActive;
                    button.style.opacity = isGlobalDebugActive ? '1.0' : '0.5';
                } else {
                     button.disabled = true; button.style.opacity = '0.5'; button.classList.remove('active');
                }

            } else if (key.startsWith('subLayerBtn_')) {
                const categoryName = button.dataset.categoryName;
                const subLayerName = button.dataset.subLayerName;
                if (layerStates.hasOwnProperty(categoryName) && layerStates[categoryName].hasOwnProperty(subLayerName)) {
                    const categoryState = layerStates[categoryName];
                    const isSubLayerActive = categoryState[subLayerName];

                    if (isSubLayerActive && isGlobalDebugActive && categoryState._visible) {
                        button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
                        button.classList.add('active');
                    } else {
                        button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                        button.classList.remove('active');
                    }
                    // Correction : le bouton reste cliquable si le mode debug est actif
                    button.disabled = !isGlobalDebugActive;
                    button.style.opacity = isGlobalDebugActive ? '1.0' : '0.5';
                } else {
                     button.disabled = true; button.style.opacity = '0.5'; button.classList.remove('active');
                }
            }
        });
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

    // Nouvelle méthode pour synchroniser l'état des boutons avec l'état réel des UI
    syncUIButtonStates() {
        // Synchroniser le bouton de debug
        this.elements.debugToggleButton.classList.toggle('active', this.experience.isDebugMode);

        // Synchroniser le bouton de la carte
        if (this.experience.world?.cityManager?.cityMapVisualizer) {
            this.elements.cityMapButton.classList.toggle('active', this.experience.world.cityManager.cityMapVisualizer.isVisible);
        }

        // Synchroniser le bouton météo
        const weatherUI = document.querySelector('.weather-control-ui');
        if (weatherUI) {
            this.elements.weatherUIButton.classList.toggle('active', weatherUI.style.display !== 'none');
        }

        // Synchroniser le bouton environnement
        const environmentUI = document.querySelector('.environment-control-ui');
        if (environmentUI) {
            this.elements.environmentUIButton.classList.toggle('active', environmentUI.style.display !== 'none');
        }
    }

    destroy() {
        // --- Retirer listeners Temps & Debug ---
        this.time?.removeEventListener('paused', this.pauseHandler);
        this.time?.removeEventListener('played', this.playHandler);
        this.time?.removeEventListener('speedchange', this.speedChangeHandler);
        this.experience?.removeEventListener('debugmodechanged', this.debugModeChangeHandler);
        // --- AJOUT : Retirer les nouveaux listeners ---
        this.experience?.removeEventListener('debugcategoryvisibilitychanged', this.categoryVisibilityChangeHandler);
        this.experience?.removeEventListener('debugsublayervisibilitychanged', this.subLayerVisibilityChangeHandler);
		this.experience?.removeEventListener('debugcategorychildrenchanged', this.categoryChildrenChangeHandler);
		//this.experience?.removeEventListener('debugsubmenuvisibilitychanged', this.subMenuVisibilityChangeHandler);
        // ---------------------------------------------

        // --- Retirer les éléments du DOM ---
        this.container?.remove();
        this.debugLayersContainer?.remove();

        // --- Nettoyer références ---
        this.experience = null;
        this.time = null;
        this.container = null;
        this.debugLayersContainer = null;
        this.elements = {};

        // Retirer les écouteurs
        this.experience?.removeEventListener('weatheruichanged', this.syncUIButtonStates);
        this.experience?.removeEventListener('environmentuichanged', this.syncUIButtonStates);
        this.experience?.removeEventListener('debugmodechanged', this.syncUIButtonStates);
        this.experience?.removeEventListener('citymapvisibilitychanged', this.syncUIButtonStates);

        console.log("TimeControlUI destroyed.");
    }
}