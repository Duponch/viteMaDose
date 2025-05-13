// src/UI/AgentStatsUI.js
import Chart from 'chart.js/auto';
import { defaultUIStates } from '../config/uiConfig.js';

export default class AgentStatsUI {
    constructor(experience) {
        this.experience = experience;
        this.isVisible = this.experience.uiStates?.agentStats ?? false;
        this.elements = {};
        this.charts = { 
            requestingWorkChart: null,
            requestingHomeChart: null
        };
        this.updateInterval = 1000;
        this.intervalId = null;
        this.listToggleStates = {};

        // --- NOUVEAU: États pour détecter clic vs drag ---
        this.isPointerDown = false;
        this.pointerDownTime = 0;
        this.pointerDownPosition = { x: 0, y: 0 };
        this.MAX_CLICK_DURATION = 200; // ms (Doit correspondre à Experience.js)
        this.MAX_CLICK_DISTANCE_SQ = 25; // pixels au carré (Doit correspondre à Experience.js)
        // --- FIN NOUVEAU ---

        // Liaisons des gestionnaires INTERNES à AgentStatsUI
        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundPanelMouseUpHandler = this._handlePanelMouseUp.bind(this);

        // ... (vérification AgentManager) ...
        this._createElements();
        this._setupEventListeners();
        // ... (vérification World) ...
    }

	_handleMouseDown(event) {
        // Enregistrer l'état seulement si le bouton principal (gauche) est pressé
        if (event.button === 0) {
            this.isPointerDown = true;
            this.pointerDownTime = Date.now();
            this.pointerDownPosition.x = event.clientX;
            this.pointerDownPosition.y = event.clientY;
            
            // Si le clic est sur le panneau ou le bouton toggle, empêcher la propagation
            const panel = this.elements.statsPanel;
            const toggleButton = this.elements.toggleButton;
            if (panel?.contains(event.target) || toggleButton?.contains(event.target)) {
                event.stopPropagation();
            }
        } else {
            // Si mousedown avec un autre bouton, réinitialiser
            this.isPointerDown = false;
        }
    }

    // Getter pour AgentManager (inchangé)
    get agentManager() {
        return this.experience.world?.agentManager;
    }

    _createElements() {
		this.container = document.body;
	
		// --- Bouton pour ouvrir/fermer ---
		this.elements.toggleButton = document.createElement('button');
		this.elements.toggleButton.id = 'agent-stats-toggle'; // ID pour CSS
		this.elements.toggleButton.textContent = '🗠';
		this.elements.toggleButton.title = 'Afficher/Masquer les statistiques des agents';
		this.elements.toggleButton.dataset.uiInteractive = 'true'; // Garder pour la logique de clic
		
		// Synchroniser l'état du bouton avec l'état par défaut
		this.elements.toggleButton.classList.toggle('active', this.isVisible);
		
		// Créer ou récupérer le container des contrôles
		let controlsContainer = document.querySelector('.control-buttons');
		if (!controlsContainer) {
			controlsContainer = document.createElement('div');
			controlsContainer.className = 'control-buttons';
			document.body.appendChild(controlsContainer);
		}
		
		// Ajouter le bouton au container
		controlsContainer.appendChild(this.elements.toggleButton);
	
		// --- Panneau des statistiques ---
		this.elements.statsPanel = document.createElement('div');
		this.elements.statsPanel.id = 'agent-stats-panel'; // ID pour CSS
		this.elements.statsPanel.dataset.uiInteractive = 'true'; // Garder pour la logique de clic
		this.elements.statsPanel.style.display = this.isVisible ? 'block' : 'none';
		// --- FIN IMPORTANT ---
		this.container.appendChild(this.elements.statsPanel);
	
		// --- Contenu du panneau (Structure DOM uniquement) ---
		/* const title = document.createElement('h3');
		title.id = 'agent-stats-title'; // ID optionnel pour CSS
		title.textContent = 'Statistiques des Agents';
		this.elements.statsPanel.appendChild(title); */
	
		this.elements.agentListSection = document.createElement('div');
		this.elements.agentListSection.id = 'agent-list-section'; // ID pour CSS & JS update
		// L'innerHTML sera défini dans _updateAgentList
		this.elements.statsPanel.appendChild(this.elements.agentListSection);

		const requestingWorkChartTitle = document.createElement('h4');
		requestingWorkChartTitle.id = 'agent-requesting-work-chart-title';
		requestingWorkChartTitle.textContent = 'Agents demandant un chemin pour le travail (par heure)';
		this.elements.statsPanel.appendChild(requestingWorkChartTitle);

		this.elements.requestingWorkChartCanvas = document.createElement('canvas');
		this.elements.requestingWorkChartCanvas.id = 'agent-requesting-work-chart';
		this.elements.statsPanel.appendChild(this.elements.requestingWorkChartCanvas);

		const requestingHomeChartTitle = document.createElement('h4');
		requestingHomeChartTitle.id = 'agent-requesting-home-chart-title';
		requestingHomeChartTitle.textContent = 'Agents demandant un chemin pour la maison (par heure)';
		this.elements.statsPanel.appendChild(requestingHomeChartTitle);

		this.elements.requestingHomeChartCanvas = document.createElement('canvas');
		this.elements.requestingHomeChartCanvas.id = 'agent-requesting-home-chart';
		this.elements.statsPanel.appendChild(this.elements.requestingHomeChartCanvas);
	}

    // --- NOUVEAU Gestionnaire MouseUp pour la fermeture du panneau ---
    _handlePanelMouseUp(event) {
        // 1. Vérifier si le panneau est visible ET si un mousedown avait été enregistré
        if (!this.isVisible || !this.isPointerDown || event.button !== 0) {
            // Important: Réinitialiser isPointerDown même si on sort tôt
            this.isPointerDown = false;
            return;
        }

        // Marquer que le bouton est relâché
        const wasPointerDown = this.isPointerDown;
        this.isPointerDown = false;

        // Si le mousedown n'était pas actif pour cette UI, ignorer
        if (!wasPointerDown) return;

        // 2. Calculer durée et distance
        const clickDuration = Date.now() - this.pointerDownTime;
        const deltaX = event.clientX - this.pointerDownPosition.x;
        const deltaY = event.clientY - this.pointerDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        // 3. Vérifier si c'était un "vrai" clic (court et sans bouger)
        const isRealClick = clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ;

        // 4. Si ce n'était PAS un vrai clic (c'était un drag ou un clic long), ne rien faire
        if (!isRealClick) {
            return;
        }

        // 5. Vérifier si le clic était en dehors du panneau ET du bouton toggle
        const panel = this.elements.statsPanel;
        const toggleButton = this.elements.toggleButton;
        
        // Vérifier si le clic est sur un élément UI interactif
        const clickedElement = event.target;
        const isUIInteractive = clickedElement?.closest('[data-ui-interactive="true"]');
        
        // Le clic est considéré comme "en dehors" si :
        // - Il n'est pas sur le panneau
        // - Il n'est pas sur le bouton toggle
        // - Il n'est pas sur un élément UI interactif
        const clickedOutside = (!panel?.contains(event.target)) && 
                             (!toggleButton?.contains(event.target)) &&
                             (!isUIInteractive);

        // 6. Si clic valide ET en dehors -> Fermer
        if (clickedOutside) {
            //console.log("Fermeture de l'infobulle des stats - clic en dehors détecté");
            this.hide();
        }
    }
    // --- FIN NOUVEAU ---

    _setupEventListeners() {
        // Clic sur le bouton toggle (inchangé)
        this.elements.toggleButton.addEventListener('click', () => {
            this.toggleVisibility();
        });
        // L'écouteur mousedown est ajouté/retiré dans show/hide
        // L'écouteur mouseup pour fermeture est ajouté/retiré dans show/hide
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.elements.statsPanel.style.display = 'none';
        this.elements.toggleButton.classList.remove('active');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        // Retirer les écouteurs globaux gérés par cette UI
        document.removeEventListener('mousedown', this._boundHandleMouseDown, true);
        document.removeEventListener('mouseup', this._boundPanelMouseUpHandler, true);
        // Retirer l'écouteur pour les clics INTERNES (sélection agent via Experience)
        if (this.elements.statsPanel && this.experience?._boundHandleStatsPanelClick) {
             this.elements.statsPanel.removeEventListener('click', this.experience._boundHandleStatsPanelClick);
        }
        // console.log("AgentStatsUI hidden, listeners removed.");
        this.listToggleStates = {};
    }

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.elements.statsPanel.style.display = 'block';
        this.elements.toggleButton.classList.add('active');
        this.update();
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.update(), this.updateInterval);
        
        // Ajouter les écouteurs globaux gérés par cette UI immédiatement
        // Mousedown pour savoir si on a initié le clic
        document.addEventListener('mousedown', this._boundHandleMouseDown, true);
        // Mouseup pour détecter clic extérieur
        document.addEventListener('mouseup', this._boundPanelMouseUpHandler, true);

        // Ajouter l'écouteur pour les clics sur les agents DANS le panneau (via Experience)
        if (this.elements.statsPanel && this.experience?._boundHandleStatsPanelClick) {
            this.elements.statsPanel.removeEventListener('click', this.experience._boundHandleStatsPanelClick);
            this.elements.statsPanel.addEventListener('click', this.experience._boundHandleStatsPanelClick);
        }
        
        this.listToggleStates = {};
    }

    toggleVisibility() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    update() {
        if (!this.isVisible || !this.agentManager) return;

        const stats = this.agentManager.getAgentStats();
        this._updateAgentList(stats.agentsByState);

        // Mettre à jour les graphiques de demande de chemin
        this._updateChart(
            this.charts.requestingWorkChart,
            this.elements.requestingWorkChartCanvas,
            stats.requestingPathForWorkByHour,
            'Agents demandant un chemin pour le travail'
        );

        this._updateChart(
            this.charts.requestingHomeChart,
            this.elements.requestingHomeChartCanvas,
            stats.requestingPathForHomeByHour,
            'Agents demandant un chemin pour la maison'
        );
    }

    _updateAgentList(agentsByState) {
        const listSection = this.elements.agentListSection;
        if (!listSection) return;

        let html = '<h4>Agents par État :</h4><ul class="agent-state-list">';

        for (const state in agentsByState) {
            const agentIds = agentsByState[state];
            const count = agentIds.length;
            const stateId = `agent-list-${state.replace(/\s+/g, '-')}`;
            // Lire l'état actuel du toggle pour cette liste
            const isExpanded = !!this.listToggleStates[stateId]; // !! pour convertir undefined en false

            html += `<li class="agent-state-item" data-state="${state}">`;
            html += `<b style="color: #a7c5eb;">${state} (${count})</b>: `;

            if (count > 0) {
                html += `<span class="agent-id-list-container" id="${stateId}">`;
                const initialDisplayCount = 10;
                const displayIds = agentIds.slice(0, initialDisplayCount);
                html += displayIds.map(id => `<span class="agent-id-link" data-agent-id="${id}" title="Sélectionner l\'agent ${id}">${id}</span>`).join(', ');

                if (count > initialDisplayCount) {
                    const hiddenSpanStyle = `display: ${isExpanded ? 'inline' : 'none'};`;
                    const buttonText = isExpanded ? "(voir moins)" : `(... voir ${count - initialDisplayCount} de plus)`;
                    const buttonDataLess = "(voir moins)";
                    const buttonDataMore = `(... voir ${count - initialDisplayCount} de plus)`;

                    // Span caché avec style basé sur l'état
                    html += `<span class="agent-id-list-hidden" style="${hiddenSpanStyle}">, ${agentIds.slice(initialDisplayCount).map(id => `<span class="agent-id-link" data-agent-id="${id}" title="Sélectionner l\'agent ${id}">${id}</span>`).join(', ')}</span>`;
                    // Bouton avec texte basé sur l'état
                    html += ` <button class="toggle-agent-list" data-target="#${stateId}" data-more-text="${buttonDataMore}" data-less-text="${buttonDataLess}" style="cursor: pointer; background: none; border: none; color: #a7c5eb; padding: 0; font-size: 0.8em;" data-ui-interactive="true">${buttonText}</button>`;
                }
                html += `</span>`;
            } else {
                html += 'Aucun';
            }
            html += `</li>`;
        }
        html += '</ul>';

        // Mettre à jour le HTML
        if (listSection.innerHTML !== html) {
            listSection.innerHTML = html;
        }

        // (Ré)attacher les écouteurs pour les boutons toggle après mise à jour du HTML
        this._setupToggleListeners();
    }

    // NOUVELLE MÉTHODE pour gérer les écouteurs des boutons toggle
    _setupToggleListeners() {
        const listSection = this.elements.agentListSection;
        if (!listSection) return;
        // console.log("AgentStatsUI: Setting up toggle listeners..."); // Log DEBUG

        listSection.querySelectorAll('.toggle-agent-list').forEach(button => {
            // console.log(`AgentStatsUI: Processing button for target ${button.dataset.target}`); // Log DEBUG
            // Si un gestionnaire existe déjà, le retirer
            if (button._toggleClickHandler) {
                // console.log(`AgentStatsUI: Removing existing listener for ${button.dataset.target}`); // Log DEBUG
                button.removeEventListener('click', button._toggleClickHandler);
            }
            // Créer le nouveau gestionnaire (lié au contexte de la classe)
            // Utiliser une fonction fléchée ou .bind(this) et stocker la référence
            const handler = this._handleToggleClick.bind(this);
            button._toggleClickHandler = handler; // Stocker la référence sur le bouton lui-même
            // Ajouter le nouvel écouteur
            // console.log(`AgentStatsUI: Adding new listener for ${button.dataset.target}`); // Log DEBUG
            button.addEventListener('click', handler);
        });
    }

    // NOUVELLE MÉTHODE pour gérer le clic sur un bouton toggle
    _handleToggleClick(event) {
        // console.log("AgentStatsUI: _handleToggleClick triggered"); // Debug
        event.stopPropagation();
        event.preventDefault();

        const button = event.target;
        const targetId = button.dataset.target.substring(1); // Retire le # pour l'utiliser comme clé

        // Inverser l'état stocké pour cette liste spécifique
        this.listToggleStates[targetId] = !this.listToggleStates[targetId];
        //console.log(`AgentStatsUI: Toggle state for ${targetId} set to ${this.listToggleStates[targetId]}`); // Debug

        // Forcer la mise à jour pour regénérer le HTML avec le nouvel état
        // Appeler update() mettra aussi à jour les graphiques, ce qui n'est pas idéal
        // Appelons directement _updateAgentList si agentManager est disponible
        if (this.agentManager) {
            const stats = this.agentManager.getAgentStats(); // Récupérer les données fraîches
            this._updateAgentList(stats.agentsByState);
        } else {
             // Fallback si agentManager n'est pas prêt (peu probable ici)
             this.update();
        }

        // Retirer la manipulation directe du DOM
        /*
        const container = document.querySelector(`#${targetId}`);
        if (!container) return;
        const hiddenSpan = container.querySelector('.agent-id-list-hidden');
        const isHidden = hiddenSpan.style.display === 'none';
        if (isHidden) { ... } else { ... }
        */
    }

    _updateChart(chartInstance, canvasElement, dataByHour, label) {
        // ... (code inchangé, incluant animation: false et update('none')) ...
         if (!canvasElement) return;
         const ctx = canvasElement.getContext('2d');
         if (!ctx) return;
         const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
         const data = labels.map((_, hour) => dataByHour[hour] || 0);
         const chartData = {
             labels: labels,
             datasets: [{
                 label: label,
                 data: data,
                 backgroundColor: 'rgba(75, 192, 192, 0.7)', // Teal un peu transparent
                 borderColor: 'rgba(75, 192, 192, 1)',
                 borderWidth: 1,
                 barPercentage: 0.8, // Rendre les barres un peu moins larges
                 categoryPercentage: 0.7
             }]
         };
         const chartOptions = {
             animation: false,
             plugins: { // Position de la légende
                 legend: {
                     position: 'bottom',
                     labels: {
                         color: '#ddd' // Couleur du texte de la légende
                     }
                 }
             },
             scales: {
                 y: {
                     beginAtZero: true,
                     ticks: {
                         stepSize: 1,
                         color: '#bbb' // Couleur des ticks Y
                      },
                     grid: {
                         color: 'rgba(255, 255, 255, 0.1)' // Couleur grille Y
                     }
                 },
                 x: {
                     ticks: {
                         color: '#bbb' // Couleur des ticks X
                     },
                     grid: {
                         display: false // Cacher grille verticale
                     }
                 }
             },
             responsive: true,
             maintainAspectRatio: true
         };
         const chartKey = (canvasElement.id === 'agent-requesting-work-chart') ? 'requestingWorkChart' : 'requestingHomeChart';
         if (!this.charts[chartKey]) {
             this.charts[chartKey] = new Chart(ctx, {
                 type: 'bar',
                 data: chartData,
                 options: chartOptions
             });
         } else {
             this.charts[chartKey].data = chartData;
             this.charts[chartKey].options = chartOptions; // S'assurer que les options sont à jour aussi
             this.charts[chartKey].update('none');
         }
    }

    destroy() {
        //console.log("Destroying AgentStatsUI...");
        if (this.intervalId) clearInterval(this.intervalId);
        // Retirer les écouteurs globaux
        document.removeEventListener('mousedown', this._boundHandleMouseDown, true);
        document.removeEventListener('mouseup', this._boundPanelMouseUpHandler, true);

        // ... (reste du destroy : charts, éléments DOM, références) ...
        if (this.charts.requestingWorkChart) this.charts.requestingWorkChart.destroy();
        if (this.charts.requestingHomeChart) this.charts.requestingHomeChart.destroy();
        this.elements.toggleButton?.remove();
        this.elements.statsPanel?.remove();
        this.experience = null;
        this.container = null;
        this.elements = {};
        //console.log("AgentStatsUI destroyed.");
    }
}