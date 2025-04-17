// src/UI/AgentStatsUI.js
import Chart from 'chart.js/auto'; // Importe Chart.js

export default class AgentStatsUI {
    constructor(experience) {
        this.experience = experience;

        // Le reste du constructeur reste presque identique...
        this.container = document.body;
        this.isVisible = false;
        this.elements = {};
        this.charts = { workChart: null, homeChart: null };

		this.updateInterval = 1000; // Mettre à jour toutes les secondes (ajustable)
        this.intervalId = null;

        this._createElements();
        this._setupEventListeners();

        // Ajout d'une vérification au cas où l'UI est créée mais World échoue
        if (!this.experience.world) {
             console.error("AgentStatsUI: World n'est pas disponible dans Experience !");
        }
    }

	get agentManager() {
        // Accède dynamiquement à agentManager quand nécessaire
        return this.experience.world?.agentManager;
    }

    _createElements() {
        // --- Bouton pour ouvrir/fermer ---
        this.elements.toggleButton = document.createElement('button');
        this.elements.toggleButton.id = 'agent-stats-toggle';
        this.elements.toggleButton.textContent = '📊 Stats Agents'; // Texte ou icône
        this.elements.toggleButton.title = 'Afficher/Masquer les statistiques des agents';
        // Style (ajuster selon votre CSS existant, ex: time-controls)
        this.elements.toggleButton.style.position = 'absolute';
        this.elements.toggleButton.style.bottom = '20px'; // Positionner près des contrôles de temps
        this.elements.toggleButton.style.right = '240px'; // Ajuster pour ne pas chevaucher
        this.elements.toggleButton.style.zIndex = '101';
        this.elements.toggleButton.style.padding = '8px 12px';
        this.elements.toggleButton.style.cursor = 'pointer';
        this.container.appendChild(this.elements.toggleButton);

        // --- Panneau des statistiques ---
        this.elements.statsPanel = document.createElement('div');
        this.elements.statsPanel.id = 'agent-stats-panel';
        // Style (position, taille, fond, etc.) - À adapter dans style.css
        this.elements.statsPanel.style.position = 'absolute';
        this.elements.statsPanel.style.bottom = '70px'; // Au-dessus du bouton
        this.elements.statsPanel.style.right = '20px';
        this.elements.statsPanel.style.width = '450px'; // Largeur ajustable
        this.elements.statsPanel.style.maxHeight = '400px'; // Hauteur max avec scroll
        this.elements.statsPanel.style.overflowY = 'auto'; // Scroll si contenu dépasse
        this.elements.statsPanel.style.backgroundColor = 'rgba(30, 30, 40, 0.9)';
        this.elements.statsPanel.style.border = '1px solid #555';
        this.elements.statsPanel.style.borderRadius = '8px';
        this.elements.statsPanel.style.padding = '15px';
        this.elements.statsPanel.style.color = '#eee';
        this.elements.statsPanel.style.fontFamily = 'sans-serif';
        this.elements.statsPanel.style.fontSize = '0.9em';
        this.elements.statsPanel.style.zIndex = '110'; // Au-dessus des autres UI
        this.elements.statsPanel.style.display = 'none'; // Caché par défaut
        this.container.appendChild(this.elements.statsPanel);

        // --- Contenu du panneau ---
        // Titre
        const title = document.createElement('h3');
        title.textContent = 'Statistiques des Agents';
        title.style.marginTop = '0';
        title.style.borderBottom = '1px solid #555';
        title.style.paddingBottom = '5px';
        this.elements.statsPanel.appendChild(title);

        // Section Liste Agents par État
        this.elements.agentListSection = document.createElement('div');
        this.elements.agentListSection.id = 'agent-list-section';
        this.elements.agentListSection.style.marginBottom = '15px';
        this.elements.statsPanel.appendChild(this.elements.agentListSection);

        // Section Graphique "Au Travail"
        const workChartTitle = document.createElement('h4');
        workChartTitle.textContent = 'Agents allant au travail (par heure)';
        workChartTitle.style.marginBottom = '5px';
        this.elements.statsPanel.appendChild(workChartTitle);
        this.elements.workChartCanvas = document.createElement('canvas');
        this.elements.workChartCanvas.id = 'agent-work-chart';
        this.elements.workChartCanvas.style.width = '100%'; // Prendra la largeur du panel
        this.elements.workChartCanvas.style.height = '150px'; // Hauteur fixe
        this.elements.statsPanel.appendChild(this.elements.workChartCanvas);

        // Section Graphique "À la Maison"
        const homeChartTitle = document.createElement('h4');
        homeChartTitle.textContent = 'Agents rentrant à la maison (par heure)';
        homeChartTitle.style.marginTop = '15px';
        homeChartTitle.style.marginBottom = '5px';
        this.elements.statsPanel.appendChild(homeChartTitle);
        this.elements.homeChartCanvas = document.createElement('canvas');
        this.elements.homeChartCanvas.id = 'agent-home-chart';
        this.elements.homeChartCanvas.style.width = '100%';
        this.elements.homeChartCanvas.style.height = '150px';
        this.elements.statsPanel.appendChild(this.elements.homeChartCanvas);
    }

    _setupEventListeners() {
        this.elements.toggleButton.addEventListener('click', () => {
            this.toggleVisibility();
        });

        // Optionnel: Écouter l'événement personnalisé si vous l'avez ajouté dans AgentManager
        // this.experience.addEventListener('agentstatsupdated', () => {
        //     if (this.isVisible) {
        //         this.update();
        //     }
        // });
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.elements.statsPanel.style.display = this.isVisible ? 'block' : 'none';

        if (this.isVisible) {
            this.update(); // Mise à jour immédiate à l'ouverture
            // --- NOUVEAU : Démarrer l'intervalle ---
            if (this.intervalId) clearInterval(this.intervalId); // Sécurité: nettoyer ancien intervalle
            this.intervalId = setInterval(() => this.update(), this.updateInterval);
            // --- FIN NOUVEAU ---
        } else {
            // --- NOUVEAU : Arrêter l'intervalle ---
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            // --- FIN NOUVEAU ---
        }
    }

	update() {
        // --- MODIFIÉ : Ne plus vérifier isVisible ici, car l'intervalle le gère ---
        const agentManager = this.agentManager;
        if (!agentManager) {
            // Si agentManager disparaît pendant que le panneau est ouvert (peu probable mais possible)
             if (this.intervalId) { // Arrêter l'intervalle si les données ne sont plus accessibles
                 clearInterval(this.intervalId);
                 this.intervalId = null;
             }
            return;
        }
        // --- FIN MODIFICATION ---


        const stats = agentManager.getAgentStats();

        this._updateAgentList(stats.agentsByState);
        this._updateChart(this.charts.workChart, this.elements.workChartCanvas, stats.pathsToWorkByHour, 'Agents allant au travail');
        this._updateChart(this.charts.homeChart, this.elements.homeChartCanvas, stats.pathsToHomeByHour, 'Agents rentrant à la maison');

         // La ligne setTimeout est supprimée, géré par setInterval maintenant
    }

    _updateAgentList(agentsByState) {
        let html = '<h4>Agents par État :</h4><ul>';
        for (const state in agentsByState) {
            const agentIds = agentsByState[state];
            const count = agentIds.length;
            // Limiter l'affichage des IDs si la liste est très longue
            const displayIds = agentIds.slice(0, 15).join(', ') + (count > 15 ? '...' : '');
            html += `<li><b>${state} (${count})</b>: ${count > 0 ? displayIds : 'Aucun'}</li>`;
        }
        html += '</ul>';
        this.elements.agentListSection.innerHTML = html;
    }

    _updateChart(chartInstance, canvasElement, dataByHour, label) {
        // ... (préparation ctx, labels, data - inchangé) ...
        const ctx = canvasElement.getContext('2d');
        if (!ctx) return;
        const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
        const data = labels.map((_, hour) => dataByHour[hour] || 0);

        const chartData = {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        };

        // --- OPTIONNEL : Désactiver les animations pour plus de fluidité ---
        const chartOptions = {
            animation: false, // <-- Désactiver toutes les animations
            // Vous pouvez aussi cibler des animations spécifiques si besoin
            // animation: {
            //     duration: 0 // Durée d'animation à 0
            // },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            },
            responsive: true,
            maintainAspectRatio: false
        };
        // --- FIN OPTIONNEL ---

        const chartKey = (canvasElement.id === 'agent-work-chart') ? 'workChart' : 'homeChart';
        if (!this.charts[chartKey]) {
            this.charts[chartKey] = new Chart(ctx, {
                type: 'bar',
                data: chartData,
                options: chartOptions // Utiliser les options (avec ou sans animation: false)
            });
        } else {
            this.charts[chartKey].data = chartData;
            // --- MODIFIÉ : Option pour mettre à jour sans animation ---
            // this.charts[chartKey].update(); // Mise à jour standard (avec animations par défaut si non désactivées dans options)
            this.charts[chartKey].update('none'); // <-- Tente de mettre à jour sans animation de transition
            // Alternative: this.charts[chartKey].update({duration: 0});
            // --- FIN MODIFICATION ---
        }
    }

    destroy() {
        console.log("Destroying AgentStatsUI...");
        // --- NOUVEAU : Nettoyer l'intervalle ---
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
         // --- FIN NOUVEAU ---

        // ... (reste du code destroy : charts, éléments DOM, références) ...
        if (this.charts.workChart) this.charts.workChart.destroy();
        if (this.charts.homeChart) this.charts.homeChart.destroy();
        this.elements.toggleButton?.remove();
        this.elements.statsPanel?.remove();
        this.experience = null;
        this.agentManager = null;
        this.container = null;
        this.elements = {};
        console.log("AgentStatsUI destroyed.");
    }
}