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
        // L'appel initial à updateLayerButtonsAppearance est ok,
        // même si le container est caché, il mettra juste le style des boutons.
        this.updateLayerButtonsAppearance();
    }

    createButtons() {
        // --- Boutons Temps (inchangés) ---
        this.elements.pausePlayButton = this._createButton('pause-play-button', this.time.isPaused ? '▶' : '⏸');
        this.elements.decreaseButton = this._createButton('decrease-speed-button', '⏮');
        this.elements.increaseButton = this._createButton('increase-speed-button', '⏭');
        this.elements.speedDisplay = document.createElement('span');
        this.elements.speedDisplay.id = 'speed-display';
        this.elements.speedDisplay.textContent = `${this.time.timeScale}x`;

        // --- Bouton Debug Principal (inchangé) ---
        this.elements.debugToggleButton = this._createButton('debug-toggle-button', '♣', "Afficher/Masquer les contrôles Debug");

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
            navGrid: { text: 'NavGrid', subLayers: null }, // Pas de sous-menu
            agentPath: { text: 'Paths', subLayers: null }   // Pas de sous-menu
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
                subMenu.style.display = 'flex';
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
        this.container.appendChild(this.elements.debugToggleButton);
        this.container.appendChild(this.elements.speedDisplay);
        this.container.appendChild(this.elements.decreaseButton);
        this.container.appendChild(this.elements.pausePlayButton);
        this.container.appendChild(this.elements.increaseButton);
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
            //if(this.time.isPaused) this.time.play();
        });
        this.elements.decreaseButton.addEventListener('click', () => {
            this.time.decreaseSpeed();
            //if(this.time.isPaused) this.time.play();
        });

        // --- Listener Bouton Debug Principal (inchangé) ---
        this.elements.debugToggleButton.addEventListener('click', () => {
            this.experience.toggleDebugMode();
        });

        // --- Listeners Boutons de Catégories et Sous-Calques ---
        Object.keys(this.elements).forEach(key => {
            const element = this.elements[key];

            // --- MODIFICATION Listener Catégorie ---
            if (key.startsWith('categoryBtn_')) {
                const categoryName = element.dataset.categoryName;
                const hasSubMenu = !!this.elements[`subMenu_${categoryName}`]; // Vérifier s'il y a des enfants

                element.addEventListener('click', () => {
                     if (!this.experience.isDebugMode) {
                         console.log("Activez d'abord le mode Debug principal.");
                         return;
                     }
                     if (hasSubMenu) {
                         // NOUVEAU: Appeler la méthode pour basculer tous les enfants
                         this.experience.toggleAllSubLayersInCategory(categoryName);
                     } else {
                         // COMPORTEMENT ORIGINAL: Basculer la catégorie elle-même si pas d'enfants
                         this.experience.toggleCategoryVisibility(categoryName);
                     }
                });
            }
            // --- FIN MODIFICATION Listener Catégorie ---

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
			 for (const key in this.elements) {
				if (key.startsWith('subMenu_')) {
					this.elements[key].style.display = isEnabled ? 'flex' : 'none';
				}
			}
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

        // --- MàJ Bouton Debug Principal ---
        if (this.experience.isDebugMode) {
            this.elements.debugToggleButton.style.opacity = '1.0';
            this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
        } else {
            this.elements.debugToggleButton.style.opacity = '0.6';
            this.elements.debugToggleButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        }
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
                    // --- MODIFICATION: L'état "actif" dépend maintenant si *tous* les enfants sont actifs ---
                    // Ou plus simplement, on colore différemment si la catégorie est visible globalement (_visible).
                    const isCategoryVisible = categoryState._visible;

                    // Style basé sur la visibilité de la catégorie ET le mode debug global
                    if (isCategoryVisible && isGlobalDebugActive) {
                        //button.style.border = '1px solid #00ccff';
                        button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
                    } else {
                        //button.style.border = '1px solid transparent';
                        button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                    }
                    button.disabled = !isGlobalDebugActive;
                    button.style.opacity = isGlobalDebugActive ? '1.0' : '0.5';
                    //button.style.opacity = isGlobalDebugActive ? '1.0' : '0.5';

                    // Mettre à jour la flèche si sous-menu
                    /* const subMenu = this.elements[`subMenu_${categoryName}`];
                     if (subMenu && button.textContent.includes('▼') || button.textContent.includes('►') ) {
                          const showSubMenu = categoryState._showSubMenu;
                          button.textContent = button.textContent.replace(/[▼►]/, showSubMenu ? '►' : '▼');
                          // Afficher/cacher le sous-menu DOM element
                          subMenu.style.display = showSubMenu ? 'flex' : 'none';
                     } */

                } else {
                     button.disabled = true; button.style.opacity = '0.5'; // Catégorie inconnue
                }

            } else if (key.startsWith('subLayerBtn_')) {
                const categoryName = button.dataset.categoryName;
                const subLayerName = button.dataset.subLayerName;
                if (layerStates.hasOwnProperty(categoryName) && layerStates[categoryName].hasOwnProperty(subLayerName)) {
                    const categoryState = layerStates[categoryName];
                    const isSubLayerActive = categoryState[subLayerName]; // État logique du sous-calque

                    // Style basé sur l'état logique du sous-calque ET si debug global est actif ET si la catégorie parente est visible
                    if (isSubLayerActive && isGlobalDebugActive && categoryState._visible) {
                        //button.style.border = '1px solid #00aaff';
                        button.style.backgroundColor = 'rgba(0, 120, 150, 0.7)';
                    } else {
                        //button.style.border = '1px solid transparent';
                        button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                    }
                    // Grisé si debug global inactif OU si catégorie parente cachée
                    button.disabled = !isGlobalDebugActive || !categoryState._visible;
                    button.style.opacity = (isGlobalDebugActive && categoryState._visible) ? '1.0' : '0.5';
                } else {
                     button.disabled = true; button.style.opacity = '0.5';
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
        console.log("TimeControlUI destroyed.");
    }
}