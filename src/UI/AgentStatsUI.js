// src/UI/AgentStatsUI.js
import Chart from 'chart.js/auto';

export default class AgentStatsUI {
    constructor(experience) {
        this.experience = experience;
        this.isVisible = false;
        this.elements = {};
        this.charts = { workChart: null, homeChart: null };
        this.updateInterval = 1000;
        this.intervalId = null;

        // --- NOUVEAU: États pour détecter clic vs drag ---
        this.isPointerDown = false;
        this.pointerDownTime = 0;
        this.pointerDownPosition = { x: 0, y: 0 };
        this.MAX_CLICK_DURATION = 200; // ms (Doit correspondre à Experience.js)
        this.MAX_CLICK_DISTANCE_SQ = 25; // pixels au carré (Doit correspondre à Experience.js)
        // --- FIN NOUVEAU ---

        // Liaisons des gestionnaires
        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this); // Renommé pour clarté

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
		this.elements.toggleButton.textContent = '📊 Stats Agents';
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
	
		const workChartTitle = document.createElement('h4');
		workChartTitle.id = 'agent-work-chart-title'; // ID optionnel pour CSS
		workChartTitle.textContent = 'Agents allant au travail (par heure)';
		this.elements.statsPanel.appendChild(workChartTitle);
	
		this.elements.workChartCanvas = document.createElement('canvas');
		this.elements.workChartCanvas.id = 'agent-work-chart'; // ID pour JS (Chart.js) & CSS
		this.elements.statsPanel.appendChild(this.elements.workChartCanvas);
	
		const homeChartTitle = document.createElement('h4');
		homeChartTitle.id = 'agent-home-chart-title'; // ID optionnel pour CSS
		homeChartTitle.textContent = 'Agents rentrant à la maison (par heure)';
		this.elements.statsPanel.appendChild(homeChartTitle);
	
		this.elements.homeChartCanvas = document.createElement('canvas');
		this.elements.homeChartCanvas.id = 'agent-home-chart'; // ID pour JS (Chart.js) & CSS
		this.elements.statsPanel.appendChild(this.elements.homeChartCanvas);
	
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
        // ... (code de la méthode update inchangé - utilise le getter agentManager) ...
         const agentManager = this.agentManager;
         if (!agentManager) {
              if (this.intervalId) {
                  clearInterval(this.intervalId);
                  this.intervalId = null;
              }
             return;
         }
         const stats = agentManager.getAgentStats();
         this._updateAgentList(stats.agentsByState);
         this._updateChart(this.charts.workChart, this.elements.workChartCanvas, stats.pathsToWorkByHour, 'Agents allant au travail');
         this._updateChart(this.charts.homeChart, this.elements.homeChartCanvas, stats.pathsToHomeByHour, 'Agents rentrant à la maison');
    }

    _updateAgentList(agentsByState) {
        // ... (code inchangé) ...
         let html = '<h4>Agents par État :</h4><ul style="padding-left: 20px; columns: 2; -webkit-columns: 2; -moz-columns: 2;">'; // Style colonnes
         for (const state in agentsByState) {
             const agentIds = agentsByState[state];
             const count = agentIds.length;
             const displayIds = agentIds.slice(0, 10).join(', ') + (count > 10 ? '...' : ''); // Moins d'IDs par ligne
             html += `<li style="margin-bottom: 5px;"><b style="color: #a7c5eb;">${state} (${count})</b>: ${count > 0 ? displayIds : 'Aucun'}</li>`; // Un peu de couleur
         }
         html += '</ul>';
         this.elements.agentListSection.innerHTML = html;
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
         const chartKey = (canvasElement.id === 'agent-work-chart') ? 'workChart' : 'homeChart';
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
        if (this.charts.workChart) this.charts.workChart.destroy();
        if (this.charts.homeChart) this.charts.homeChart.destroy();
        this.elements.toggleButton?.remove();
        this.elements.statsPanel?.remove();
        this.experience = null;
        this.container = null;
        this.elements = {};
        console.log("AgentStatsUI destroyed.");
    }
}