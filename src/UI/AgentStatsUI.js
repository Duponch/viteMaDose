// src/UI/AgentStatsUI.js
import Chart from 'chart.js/auto';

export default class AgentStatsUI {
    constructor(experience) {
        this.experience = experience;
        this.isVisible = false;
        this.elements = {};
        this.charts = { 
            requestingWorkChart: null,
            requestingHomeChart: null
        };
        this.updateInterval = 1000;
        this.intervalId = null;

        // --- NOUVEAU: États pour détecter clic vs drag ---
        this.isPointerDown = false;
        this.pointerDownTime = 0;
        this.pointerDownPosition = { x: 0, y: 0 };
        this.MAX_CLICK_DURATION = 200; // ms (Doit correspondre à Experience.js)
        this.MAX_CLICK_DISTANCE_SQ = 25; // pixels au carré (Doit correspondre à Experience.js)
        // --- FIN NOUVEAU ---

        // Liaisons des gestionnaires INTERNES à AgentStatsUI
        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this);
        // Retirer la liaison pour le clic panneau stats d'ici
        // this._boundHandleStatsPanelClick = this.experience._handleStatsPanelClick.bind(this.experience); // Pas besoin ici

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
		this.container.appendChild(this.elements.toggleButton);
	
		// --- Panneau des statistiques ---
		this.elements.statsPanel = document.createElement('div');
		this.elements.statsPanel.id = 'agent-stats-panel'; // ID pour CSS
		this.elements.statsPanel.dataset.uiInteractive = 'true'; // Garder pour la logique de clic
		// --- IMPORTANT: Garder display:none ici pour le contrôle initial ---
		this.elements.statsPanel.style.display = 'none';
		// --- FIN IMPORTANT ---
		this.container.appendChild(this.elements.statsPanel);
	
		// --- Contenu du panneau (Structure DOM uniquement) ---
		const title = document.createElement('h3');
		title.id = 'agent-stats-title'; // ID optionnel pour CSS
		title.textContent = 'Statistiques des Agents';
		this.elements.statsPanel.appendChild(title);
	
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
	
		console.log("AgentStatsUI elements created (styles moved to CSS).");
	}

    // --- NOUVEAU : Gestionnaire pour les clics en dehors du panneau ---
    _handleMouseUp(event) {
        // 1. Vérifier si le panneau est visible ET si un mousedown avait été enregistré par CETTE UI
        if (!this.isVisible || !this.isPointerDown || event.button !== 0) {
            this.isPointerDown = false; // Réinitialiser au cas où
            return;
        }

        // Marquer que le bouton est relâché
        this.isPointerDown = false;

        // 2. Calculer durée et distance
        const clickDuration = Date.now() - this.pointerDownTime;
        const deltaX = event.clientX - this.pointerDownPosition.x;
        const deltaY = event.clientY - this.pointerDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        // 3. Vérifier si c'était un "vrai" clic (court et sans bouger)
        const isRealClick = clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ;

        // 4. Si ce n'était PAS un vrai clic (c'était un drag ou un clic long), ne rien faire
        if (!isRealClick) {
            // console.log("MouseUp ignored (drag or long press). Duration:", clickDuration, "DistSq:", distanceSq); // Debug
            return;
        }

        // 5. Si c'était un vrai clic, vérifier s'il était en dehors de l'UI interactive
        const clickedOnInteractiveUI = event.target.closest('[data-ui-interactive="true"]');

        // 6. Si clic valide ET en dehors de l'UI -> Fermer
        if (!clickedOnInteractiveUI) {
            // console.log("Valid outside click detected, closing stats panel."); // Debug
            this.hide();
        } else {
            // console.log("Valid click detected, but inside UI:", clickedOnInteractiveUI); // Debug
        }
    }
    // --- FIN NOUVEAU ---

    _setupEventListeners() {
        // Clic sur le bouton toggle (inchangé)
        this.elements.toggleButton.addEventListener('click', () => {
            this.toggleVisibility();
        });

        // Note: L'ajout/suppression de l'écouteur 'outsideClick' se fait dans show/hide
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.elements.statsPanel.style.display = 'none';
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        // Retirer les écouteurs globaux
        document.removeEventListener('mousedown', this._boundHandleMouseDown, true); // Capture phase
        document.removeEventListener('mouseup', this._boundHandleMouseUp, true);     // Capture phase

        // --- NOUVEAU : Retirer l'écouteur pour les clics sur les agents DANS le panneau ---
        if (this.elements.statsPanel && this.experience?._boundHandleStatsPanelClick) {
             this.elements.statsPanel.removeEventListener('click', this.experience._boundHandleStatsPanelClick);
        }
        // --- FIN NOUVEAU ---
        // console.log("AgentStatsUI hidden, listeners removed."); // Debug
    }

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.elements.statsPanel.style.display = 'block';
        this.update();
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.update(), this.updateInterval);
        // Ajouter les écouteurs globaux (léger délai pour éviter fermeture immédiate)
        // Utiliser la phase de capture (true) pour intercepter avant OrbitControls
        setTimeout(() => {
            document.addEventListener('mousedown', this._boundHandleMouseDown, true);
            document.addEventListener('mouseup', this._boundHandleMouseUp, true);

            // --- NOUVEAU : Ajouter l'écouteur pour les clics sur les agents DANS le panneau ---
            // Assurer que la méthode liée existe dans Experience et que le panneau existe
            if (this.elements.statsPanel && this.experience?._boundHandleStatsPanelClick) {
                // Vérifier si l'écouteur n'est pas déjà attaché (sécurité)
                // Note: removeEventListener ne lèvera pas d'erreur s'il n'existe pas
                this.elements.statsPanel.removeEventListener('click', this.experience._boundHandleStatsPanelClick);
                this.elements.statsPanel.addEventListener('click', this.experience._boundHandleStatsPanelClick);
                console.log("Stats panel click listener attached in AgentStatsUI.show()"); // Debug
            } else {
                 console.warn("Could not attach stats panel click listener in AgentStatsUI.show()"); // Debug
            }
            // --- FIN NOUVEAU ---

            // console.log("AgentStatsUI shown, listeners added."); // Debug
        }, 0);
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
        // Récupérer la section de la liste
        const listSection = this.elements.agentListSection;
        if (!listSection) return;

        let html = '<h4>Agents par État :</h4><ul class=\"agent-state-list\">'; // Utiliser une classe pour un ciblage plus facile

        // Parcourir chaque état
        for (const state in agentsByState) {
            const agentIds = agentsByState[state];
            const count = agentIds.length;
            const stateId = `agent-list-${state.replace(/\s+/g, '-')}`; // ID unique pour chaque liste d'état

            html += `<li class=\"agent-state-item\" data-state=\"${state}\">`; // Ajouter data-state
            html += `<b style=\"color: #a7c5eb;\">${state} (${count})</b>: `;

            if (count > 0) {
                // Liste des IDs (initialement tronquée si nécessaire)
                html += `<span class=\"agent-id-list-container\" id=\"${stateId}\">`;
                const initialDisplayCount = 10;
                const displayIds = agentIds.slice(0, initialDisplayCount);
                html += displayIds.map(id => `<span class=\"agent-id-link\" data-agent-id=\"${id}\" title=\"Sélectionner l\'agent ${id}\">${id}</span>`).join(', ');

                if (count > initialDisplayCount) {
                    // Ajouter les IDs cachés
                    html += `<span class=\"agent-id-list-hidden\" style=\"display: none;\">, ${agentIds.slice(initialDisplayCount).map(id => `<span class=\"agent-id-link\" data-agent-id=\"${id}\" title=\"Sélectionner l\'agent ${id}\">${id}</span>`).join(', ')}</span>`;
                    // Ajouter le bouton toggle
                    html += ` <button class=\"toggle-agent-list\" data-target=\"#${stateId}\" data-more-text=\"(... voir ${count - initialDisplayCount} de plus)\" data-less-text=\"(voir moins)\" style=\"cursor: pointer; background: none; border: none; color: #a7c5eb; padding: 0; font-size: 0.8em;\">(... voir ${count - initialDisplayCount} de plus)</button>`;
                }
                html += `</span>`; // Fin agent-id-list-container
            } else {
                html += 'Aucun';
            }
            html += `</li>`; // Fin agent-state-item
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

        listSection.querySelectorAll('.toggle-agent-list').forEach(button => {
            // Si un gestionnaire existe déjà, le retirer
            if (button._toggleClickHandler) {
                button.removeEventListener('click', button._toggleClickHandler);
            }
            // Créer le nouveau gestionnaire (lié au contexte de la classe)
            // Utiliser une fonction fléchée ou .bind(this) et stocker la référence
            const handler = this._handleToggleClick.bind(this);
            button._toggleClickHandler = handler; // Stocker la référence sur le bouton lui-même
            // Ajouter le nouvel écouteur
            button.addEventListener('click', handler);
        });
    }

    // NOUVELLE MÉTHODE pour gérer le clic sur un bouton toggle
    _handleToggleClick(event) {
        event.stopPropagation(); // Empêcher le clic de remonter au panneau (et d'être géré par Experience.js)

        const button = event.target;
        const targetId = button.dataset.target;
        const container = document.querySelector(targetId);
        if (!container) return;

        const hiddenSpan = container.querySelector('.agent-id-list-hidden');
        const isHidden = hiddenSpan.style.display === 'none';

        if (isHidden) {
            hiddenSpan.style.display = 'inline'; // Ou 'block' selon le rendu souhaité
            button.textContent = button.dataset.lessText;
        } else {
            hiddenSpan.style.display = 'none';
            button.textContent = button.dataset.moreText;
        }
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
        console.log("Destroying AgentStatsUI...");
        if (this.intervalId) clearInterval(this.intervalId);
        // Retirer les écouteurs globaux
        document.removeEventListener('mousedown', this._boundHandleMouseDown, true);
        document.removeEventListener('mouseup', this._boundHandleMouseUp, true);

        // ... (reste du destroy : charts, éléments DOM, références) ...
        if (this.charts.requestingWorkChart) this.charts.requestingWorkChart.destroy();
        if (this.charts.requestingHomeChart) this.charts.requestingHomeChart.destroy();
        this.elements.toggleButton?.remove();
        this.elements.statsPanel?.remove();
        this.experience = null;
        this.container = null;
        this.elements = {};
        console.log("AgentStatsUI destroyed.");
    }
}