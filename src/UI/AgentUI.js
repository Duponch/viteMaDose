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
            treatmentButtons: null
        };
        
        // Référence à l'agent actuellement sélectionné
        this.selectedAgent = null;
        
        this._setupEventListeners();
    }
    
    /**
     * Configure les écouteurs d'événements
     * @private
     */
    _setupEventListeners() {
        // Écouter les clics sur les boutons de traitement dans l'infobulle
        document.addEventListener('click', (event) => {
            const button = event.target.closest('.treatment-btn');
            if (button) {
                this._handleTreatmentClick(event);
            }
        });
        
        // Écouter l'événement de sélection d'agent
        this.experience.addEventListener('agentselected', (e) => {
            this.selectedAgent = e.detail.agent;
        });
        
        // Écouter l'événement de désélection d'agent
        this.experience.addEventListener('agentdeselected', () => {
            this.selectedAgent = null;
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
     * Ajoute un retour visuel sur le bouton après un clic
     * @param {HTMLElement} button - Le bouton cliqué
     * @param {boolean} success - Si l'action a réussi
     * @private
     */
    _addButtonFeedback(button, success) {
        const originalBackground = button.style.backgroundColor;
        const originalText = button.textContent;
        
        // Changer temporairement l'apparence du bouton
        button.style.backgroundColor = success ? '#4CAF50' : '#f44336';
        button.textContent = success ? '✓ Succès' : '✗ Échec';
        
        // Restaurer l'apparence après un délai
        setTimeout(() => {
            button.style.backgroundColor = originalBackground;
            button.textContent = originalText;
        }, 1000);
    }
    
    /**
     * Nettoie les ressources lors de la destruction
     */
    destroy() {
        // Supprimer les écouteurs d'événements
        document.removeEventListener('click', this._handleTreatmentClick);
        
        // Nettoyer les références
        this.elements = null;
        this.selectedAgent = null;
        this.experience = null;
    }
} 