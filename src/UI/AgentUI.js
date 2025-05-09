/**
 * Interface utilisateur pour interagir avec les agents/citoyens
 * Permet d'appliquer des traitements médicaux et voir les détails de santé
 */
export default class AgentUI {
    constructor(experience) {
        this.experience = experience;
        this.agentActionsVisible = false;
        
        // Références DOM
        this.elements = {
            actionsPanel: null,
            treatmentButtons: null
        };
        
        // Référence à l'agent actuellement sélectionné
        this.selectedAgent = null;
        
        this._createDOM();
        this._setupEventListeners();
    }
    
    /**
     * Crée les éléments DOM pour l'interface
     * @private
     */
    _createDOM() {
        // Panneau d'actions pour l'agent
        this.elements.actionsPanel = document.createElement('div');
        this.elements.actionsPanel.className = 'agent-actions-panel';
        this.elements.actionsPanel.dataset.uiInteractive = 'true';
        this.elements.actionsPanel.style.position = 'absolute';
        this.elements.actionsPanel.style.bottom = '10px';
        this.elements.actionsPanel.style.left = '50%';
        this.elements.actionsPanel.style.transform = 'translateX(-50%)';
        this.elements.actionsPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.elements.actionsPanel.style.color = 'white';
        this.elements.actionsPanel.style.padding = '10px';
        this.elements.actionsPanel.style.borderRadius = '5px';
        this.elements.actionsPanel.style.display = 'none';
        this.elements.actionsPanel.style.zIndex = '1000';
        
        const title = document.createElement('h3');
        title.style.margin = '0 0 10px 0';
        title.style.fontSize = '16px';
        title.style.textAlign = 'center';
        title.textContent = 'Actions pour le citoyen';
        this.elements.actionsPanel.appendChild(title);
        
        // Conteneur de boutons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '10px';
        
        // Bouton pour traitement palliatif
        const palliativeBtn = document.createElement('button');
        palliativeBtn.className = 'treatment-btn palliative-btn';
        palliativeBtn.textContent = 'Soin Palliatif';
        palliativeBtn.dataset.treatmentType = 'palliative';
        palliativeBtn.title = 'Augmente temporairement la santé du citoyen';
        palliativeBtn.style.padding = '5px 10px';
        palliativeBtn.style.backgroundColor = '#4CAF50';
        palliativeBtn.style.border = 'none';
        palliativeBtn.style.borderRadius = '3px';
        palliativeBtn.style.color = 'white';
        palliativeBtn.style.cursor = 'pointer';
        
        // Bouton pour traitement classique
        const classicBtn = document.createElement('button');
        classicBtn.className = 'treatment-btn classic-btn';
        classicBtn.textContent = 'Traitement Classique';
        classicBtn.dataset.treatmentType = 'classic';
        classicBtn.title = 'Guérit une maladie mais augmente la dépendance chimique';
        classicBtn.style.padding = '5px 10px';
        classicBtn.style.backgroundColor = '#2196F3';
        classicBtn.style.border = 'none';
        classicBtn.style.borderRadius = '3px';
        classicBtn.style.color = 'white';
        classicBtn.style.cursor = 'pointer';
        
        // Bouton pour traitement naturel
        const naturalBtn = document.createElement('button');
        naturalBtn.className = 'treatment-btn natural-btn';
        naturalBtn.textContent = 'Traitement Naturel';
        naturalBtn.dataset.treatmentType = 'natural';
        naturalBtn.title = 'Guérit une maladie après 5 prises, sans effets secondaires';
        naturalBtn.style.padding = '5px 10px';
        naturalBtn.style.backgroundColor = '#FF9800';
        naturalBtn.style.border = 'none';
        naturalBtn.style.borderRadius = '3px';
        naturalBtn.style.color = 'white';
        naturalBtn.style.cursor = 'pointer';
        
        // Ajouter les boutons au conteneur
        buttonContainer.appendChild(palliativeBtn);
        buttonContainer.appendChild(classicBtn);
        buttonContainer.appendChild(naturalBtn);
        
        // Ajouter le conteneur de boutons au panneau
        this.elements.actionsPanel.appendChild(buttonContainer);
        
        // Stocker les références aux boutons
        this.elements.treatmentButtons = buttonContainer.querySelectorAll('.treatment-btn');
        
        // Ajouter à la page
        document.body.appendChild(this.elements.actionsPanel);
    }
    
    /**
     * Configure les écouteurs d'événements
     * @private
     */
    _setupEventListeners() {
        // Écouter les clics sur les boutons de traitement
        this.elements.treatmentButtons.forEach(button => {
            button.addEventListener('click', this._handleTreatmentClick.bind(this));
        });
        
        // Écouter l'événement de sélection d'agent
        this.experience.addEventListener('agentselected', (e) => {
            this.selectedAgent = e.detail.agent;
            this.showActionsPanel();
        });
        
        // Écouter l'événement de désélection d'agent
        this.experience.addEventListener('agentdeselected', () => {
            this.selectedAgent = null;
            this.hideActionsPanel();
        });
    }
    
    /**
     * Gère les clics sur les boutons de traitement
     * @param {Event} event - L'événement de clic
     * @private
     */
    _handleTreatmentClick(event) {
        if (!this.selectedAgent) return;
        
        const treatmentType = event.target.dataset.treatmentType;
        const citizenManager = this.experience.world?.cityManager?.citizenManager;
        if (!citizenManager) return;
        
        let success = false;
        
        switch (treatmentType) {
            case 'palliative':
                success = citizenManager.applyMedication(this.selectedAgent.id, true);
                break;
            case 'classic':
                success = citizenManager.applyMedication(this.selectedAgent.id, false);
                break;
            case 'natural':
                success = citizenManager.applyNaturalTreatment(this.selectedAgent.id);
                break;
        }
        
        // Mettre à jour l'infobulle de l'agent
        if (success && this.experience.tooltipElement && this.selectedAgent) {
            this.experience.updateTooltipContent(this.selectedAgent);
        }
        
        // Ajouter un effet visuel sur le bouton
        this._addButtonFeedback(event.target, success);
    }
    
    /**
     * Ajoute un retour visuel au bouton après un clic
     * @param {HTMLElement} button - Le bouton cliqué
     * @param {boolean} success - Si l'action a réussi
     * @private
     */
    _addButtonFeedback(button, success) {
        // Sauvegarder la couleur d'origine
        const originalColor = button.style.backgroundColor;
        
        // Changer la couleur selon le résultat
        button.style.backgroundColor = success ? '#4CAF50' : '#f44336';
        
        // Restaurer la couleur après 500ms
        setTimeout(() => {
            button.style.backgroundColor = originalColor;
        }, 500);
    }
    
    /**
     * Affiche le panneau d'actions pour l'agent
     */
    showActionsPanel() {
        if (!this.elements.actionsPanel) return;
        
        // Mise à jour du titre avec l'ID de l'agent
        const titleElement = this.elements.actionsPanel.querySelector('h3');
        if (titleElement && this.selectedAgent) {
            titleElement.textContent = `Actions pour ${this.selectedAgent.id}`;
        }
        
        this.elements.actionsPanel.style.display = 'block';
        this.agentActionsVisible = true;
    }
    
    /**
     * Cache le panneau d'actions
     */
    hideActionsPanel() {
        if (!this.elements.actionsPanel) return;
        
        this.elements.actionsPanel.style.display = 'none';
        this.agentActionsVisible = false;
    }
    
    /**
     * Nettoie les ressources lors de la destruction
     */
    destroy() {
        // Supprimer les écouteurs d'événements
        this.elements.treatmentButtons.forEach(button => {
            button.removeEventListener('click', this._handleTreatmentClick);
        });
        
        // Supprimer les éléments DOM
        if (this.elements.actionsPanel && this.elements.actionsPanel.parentNode) {
            this.elements.actionsPanel.parentNode.removeChild(this.elements.actionsPanel);
        }
        
        // Nettoyer les références
        this.elements = null;
        this.selectedAgent = null;
        this.experience = null;
    }
} 