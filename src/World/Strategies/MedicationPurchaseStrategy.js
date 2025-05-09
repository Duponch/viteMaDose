import AgentState from '../Agents/AgentState.js';

export default class MedicationPurchaseStrategy {
    /**
     * Stratégie pour gérer l'achat de médicaments par les agents
     * @param {Object} options - Options de configuration
     * @param {Object} experience - L'instance Experience
     */
    constructor(options = {}, experience = null) {
        // Configuration
        this.cooldownTime = options.cooldownTime || 4 * 60 * 60 * 100; // 4h de temps de jeu par défaut
        this.medicationPrice = options.medicationPrice || 10; // Prix du médicament (€)
        
        // Stockage des timestamps de dernières tentatives d'achat par agent
        this.lastPurchaseAttempt = new Map();
    }

    /**
     * Vérifie si l'agent a besoin d'acheter un médicament et peut le faire
     * @param {string} agentId - ID de l'agent
     * @param {Object} citizenInfo - Informations du citoyen
     * @param {Object} agent - Instance de l'agent
     * @param {number} currentGameTime - Temps de jeu actuel
     * @returns {boolean} - True si l'agent peut acheter un médicament
     */
    shouldPurchaseMedication(agentId, citizenInfo, agent, currentGameTime) {
        if (!citizenInfo || !agent) return false;

        // Vérifier si l'agent est à la maison (condition requise)
        if (agent.currentState !== AgentState.AT_HOME) return false;

        // Vérifier si l'agent a besoin d'un médicament
        if (!citizenInfo.needsMedication) return false;

        // Vérifier si l'agent a assez d'argent
        if (citizenInfo.money < this.medicationPrice) return false;

        // Initialiser lastPurchaseAttempt si nécessaire
        if (!this.lastPurchaseAttempt.has(agentId)) {
            this.lastPurchaseAttempt.set(agentId, 0);
        }

        // Vérifier le cooldown
        const lastAttempt = this.lastPurchaseAttempt.get(agentId);

		console.log('currentGameTime : ', currentGameTime);
		console.log('this.cooldownTime : ', this.cooldownTime);

	    if (currentGameTime - lastAttempt < this.cooldownTime) return false;

        return true;
    }

    /**
     * Enregistre une tentative d'achat
     * @param {string} agentId - ID de l'agent
     * @param {number} currentGameTime - Temps de jeu actuel
     */
    recordPurchaseAttempt(agentId, currentGameTime) {
        this.lastPurchaseAttempt.set(agentId, currentGameTime);
    }
    
    /**
     * Effectue l'achat de médicament
     * @param {Object} citizenInfo - Informations du citoyen
     * @param {Object} agent - Instance de l'agent
     * @returns {boolean} - True si l'achat a réussi
     */
    purchaseMedication(citizenInfo, agent) {
        if (!citizenInfo || !agent) return false;
        
        // Vérifier si l'agent a assez d'argent
        if (citizenInfo.money < this.medicationPrice) return false;
        
        // Déduire le prix du médicament
        citizenInfo.money -= this.medicationPrice;
        
        // Ajouter le médicament à l'inventaire
        if (!agent.inventory) agent.inventory = {};
        if (!agent.inventory.medications) agent.inventory.medications = 0;
        agent.inventory.medications++;
        
        console.log(`Agent ${agent.id}: Achat de médicament réussi. Inventaire: ${agent.inventory.medications} médicament(s).`);
        
        return true;
    }
    
    /**
     * Trouve le bâtiment commercial le plus proche
     * @param {Object} agent - Instance de l'agent
     * @param {Object} cityManager - Le gestionnaire de ville
     * @returns {Object|null} - Le bâtiment commercial le plus proche ou null si aucun trouvé
     */
    findNearestCommercialBuilding(agent, cityManager) {
        if (!agent || !cityManager) return null;
        
        // Récupérer tous les bâtiments commerciaux
        const commercialBuildings = cityManager.getBuildingsByType(['commercial']);
        if (!commercialBuildings || commercialBuildings.length === 0) return null;
        
        // Trouver le plus proche
        let nearestBuilding = null;
        let minDistance = Infinity;
        
        commercialBuildings.forEach(building => {
            if (building.position) {
                const distance = agent.position.distanceToSquared(building.position);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestBuilding = building;
                }
            }
        });
        
        return nearestBuilding;
    }
} 