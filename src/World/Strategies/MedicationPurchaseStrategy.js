import AgentState from '../Agents/AgentState.js';
import CommercialOpeningHoursStrategy from './CommercialOpeningHoursStrategy.js';

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
        this.experience = experience;
        
        // Stockage des timestamps de dernières tentatives d'achat par agent
        this.lastPurchaseAttempt = new Map();
        
        // Stockage des heures de rendez-vous prévues par agent
        this.scheduledPurchaseHours = new Map();
    }

    /**
     * Vérifie si l'agent a besoin d'acheter un médicament et peut le faire
     * @param {string} agentId - ID de l'agent
     * @param {Object} citizenInfo - Informations du citoyen
     * @param {Object} agent - Instance de l'agent
     * @param {number} currentGameTime - Temps de jeu actuel
     * @param {Object} calendarDate - Date du calendrier actuel
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {boolean} - True si l'agent peut acheter un médicament
     */
    shouldPurchaseMedication(agentId, citizenInfo, agent, currentGameTime, calendarDate, currentHour) {
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
        if (currentGameTime - lastAttempt < this.cooldownTime) return false;

        // Obtenir le gestionnaire des commerces
        const cityManager = this.experience?.world?.cityManager;
        const commercialManager = cityManager?.commercialManager;
        
        // Vérifier si nous avons un rendez-vous prévu
        if (this.scheduledPurchaseHours.has(agentId)) {
            const scheduledHour = this.scheduledPurchaseHours.get(agentId);
            
            // Si nous sommes à l'heure prévue ou plus tard, autoriser l'achat
            if (currentHour >= scheduledHour) {
                // Supprimer le rendez-vous une fois utilisé
                this.scheduledPurchaseHours.delete(agentId);
                return true;
            }
            
            // Sinon, attendre l'heure prévue
            console.log(`Agent ${agentId}: Besoin de médicament. Rendez-vous prévu à ${scheduledHour}h (actuellement ${currentHour}h).`);
            return false;
        }

        // Vérifier si les commerces sont ouverts actuellement
        let isOpen = false;
        let openingHour = 8; // Par défaut
        
        if (commercialManager) {
            isOpen = commercialManager.areCommercialsOpen(calendarDate, currentHour);
            
            // Si fermé, récupérer l'heure d'ouverture prochaine
            if (!isOpen) {
                const hoursUntilOpen = commercialManager.getHoursUntilCommercialOpen(calendarDate, currentHour);
                openingHour = (currentHour + hoursUntilOpen) % 24;
            }
        } else {
            // Fallback si commercialManager n'est pas disponible
            const openingHoursStrategy = new CommercialOpeningHoursStrategy();
            isOpen = openingHoursStrategy.isOpen(calendarDate, currentHour);
            
            // Si fermé, récupérer l'heure d'ouverture prochaine
            if (!isOpen) {
                const hoursUntilOpen = openingHoursStrategy.hoursUntilOpen(calendarDate, currentHour);
                openingHour = (currentHour + hoursUntilOpen) % 24;
            }
        }
        
        // Si les commerces sont ouverts, on peut y aller maintenant
        if (isOpen) {
            return true;
        }
        
        // Sinon, planifier un rendez-vous pour l'heure d'ouverture
        // On ajoute une petite variation pour éviter que tous les agents y aillent exactement à la même heure
        const randomOffset = Math.floor(Math.random() * 3); // 0, 1 ou 2 heures après l'ouverture
        const scheduledHour = (openingHour + randomOffset) % 24;
        
        this.scheduledPurchaseHours.set(agentId, scheduledHour);
        console.log(`Agent ${agentId}: Besoin de médicament mais les commerces sont fermés (${currentHour}h). Rendez-vous planifié à ${scheduledHour}h.`);
        
        return false;
    }

    /**
     * Enregistre une tentative d'achat
     * @param {string} agentId - ID de l'agent
     * @param {number} currentGameTime - Temps de jeu actuel
     */
    recordPurchaseAttempt(agentId, currentGameTime) {
        this.lastPurchaseAttempt.set(agentId, currentGameTime);
        
        // Supprimer tout rendez-vous prévu puisque l'achat est en cours
        if (this.scheduledPurchaseHours.has(agentId)) {
            this.scheduledPurchaseHours.delete(agentId);
        }
    }
    
    /**
     * Effectue l'achat de médicament
     * @param {Object} citizenInfo - Informations du citoyen
     * @param {Object} agent - Instance de l'agent
     * @param {Object} calendarDate - Date du calendrier actuel 
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {boolean} - True si l'achat a réussi
     */
    purchaseMedication(citizenInfo, agent, calendarDate, currentHour) {
        if (!citizenInfo || !agent) return false;
        
        // Vérifier si les commerces sont toujours ouverts (sécurité au cas où l'agent arrive après la fermeture)
        const cityManager = this.experience?.world?.cityManager;
        let areCommercialsStillOpen = true;
        
        if (cityManager && cityManager.commercialManager) {
            areCommercialsStillOpen = cityManager.commercialManager.areCommercialsOpen(calendarDate, currentHour);
        } else {
            // Fallback si commercialManager n'est pas disponible
            const openingHoursStrategy = new CommercialOpeningHoursStrategy();
            areCommercialsStillOpen = openingHoursStrategy.isOpen(calendarDate, currentHour);
        }
        
        if (!areCommercialsStillOpen) {
            console.warn(`Agent ${agent.id}: Arrivé au commerce mais il est maintenant fermé (${currentHour}h).`);
            return false;
        }
        
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