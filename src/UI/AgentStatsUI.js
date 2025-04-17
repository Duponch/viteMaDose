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

        // --- NOUVEAU: Liaison pour le gestionnaire de clic extérieur ---
        this._boundHandleOutsideClick = this._handleOutsideClick.bind(this);
        // --- FIN NOUVEAU ---

        // Vérification AgentManager (pas besoin du getter ici, on le fera plus tard)
        if (!this.experience.world?.agentManager) {
            console.error("AgentStatsUI: AgentManager non trouvé lors de l'initialisation ! L'UI ne fonctionnera pas.");
            // Ne pas arrêter complètement, permet au moins d'afficher le bouton
        }

        this._createElements();
        this._setupEventListeners();

        if (!this.experience.world) {
             console.error("AgentStatsUI: World n'est pas disponible dans Experience !");
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
    _handleOutsideClick(event) {
		// Vérifier si le panneau est visible
		if (!this.isVisible) return;
	
		// --- MODIFICATION : Vérifier si le clic a eu lieu sur un élément UI marqué ---
		// event.target.closest vérifie si l'élément cliqué OU un de ses parents
		// possède l'attribut spécifié.
		const clickedOnInteractiveUI = event.target.closest('[data-ui-interactive="true"]');
	
		// Si le clic N'A PAS eu lieu sur un élément UI interactif, alors on ferme.
		if (!clickedOnInteractiveUI) {
			console.log("Outside click detected, closing stats panel."); // Debug
			this.hide();
		} else {
			// Optionnel: log pour voir quel élément UI a été cliqué
			// console.log("Clicked on interactive UI:", clickedOnInteractiveUI);
		}
		// --- FIN MODIFICATION ---
	}
    // --- FIN NOUVEAU ---

    _setupEventListeners() {
        // Clic sur le bouton toggle (inchangé)
        this.elements.toggleButton.addEventListener('click', () => {
            this.toggleVisibility();
        });

        // Note: L'ajout/suppression de l'écouteur 'outsideClick' se fait dans show/hide
    }

    // --- NOUVELLE METHODE : Pour cacher le panneau ---
    hide() {
        if (!this.isVisible) return; // Déjà caché

        this.isVisible = false;
        this.elements.statsPanel.style.display = 'none';

        // Arrêter l'intervalle de mise à jour
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        // Retirer l'écouteur de clic extérieur
        document.removeEventListener('click', this._boundHandleOutsideClick, true); // Utiliser capture phase pour intercepter avant d'autres clics
        console.log("AgentStatsUI hidden, interval stopped, outside click listener removed.");
    }
    // --- FIN NOUVELLE METHODE ---

    // --- NOUVELLE METHODE : Pour afficher le panneau ---
    show() {
        if (this.isVisible) return; // Déjà visible

        this.isVisible = true;
        this.elements.statsPanel.style.display = 'block';
        this.update(); // Mise à jour immédiate à l'ouverture

        // Démarrer l'intervalle de mise à jour
        if (this.intervalId) clearInterval(this.intervalId); // Sécurité
        this.intervalId = setInterval(() => this.update(), this.updateInterval);

        // Ajouter l'écouteur de clic extérieur (léger délai pour éviter qu'il se déclenche avec le clic d'ouverture)
        setTimeout(() => {
            document.addEventListener('click', this._boundHandleOutsideClick, true); // Utiliser capture phase
            console.log("AgentStatsUI shown, interval started, outside click listener added.");
        }, 0);
    }
    // --- FIN NOUVELLE METHODE ---

    // --- MODIFIÉ : toggleVisibility utilise show/hide ---
    toggleVisibility() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
    // --- FIN MODIFICATION ---

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
        // --- MODIFIÉ : Assurer le nettoyage de l'écouteur extérieur ---
        if (this.intervalId) clearInterval(this.intervalId);
        document.removeEventListener('click', this._boundHandleOutsideClick, true); // Nettoyer l'écouteur
        // --- FIN MODIFICATION ---

        if (this.charts.workChart) this.charts.workChart.destroy();
        if (this.charts.homeChart) this.charts.homeChart.destroy();
        this.elements.toggleButton?.remove();
        this.elements.statsPanel?.remove();
        this.experience = null;
        // agentManager n'est pas stocké directement, pas besoin de le nullifier
        this.container = null;
        this.elements = {};
        console.log("AgentStatsUI destroyed.");
    }
}