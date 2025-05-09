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
        /* const lastAttempt = this.lastPurchaseAttempt.get(agentId);
        if (currentGameTime - lastAttempt < this.cooldownTime) return false; */

        // Obtenir le gestionnaire des commerces
        const cityManager = this.experience?.world?.cityManager;
        const commercialManager = cityManager?.commercialManager;
        
        // Vérifier si nous avons un rendez-vous prévu
        if (this.scheduledPurchaseHours.has(agentId)) {
            const scheduledHour = this.scheduledPurchaseHours.get(agentId);
            
            // Si nous sommes à l'heure prévue ou plus tard, autoriser l'achat
            if (currentHour >= scheduledHour) {
                // Vérifier si l'heure actuelle est compatible avec le temps libre de l'agent
                if (this._isAgentFreeAtHour(agent, calendarDate, currentHour)) {
                    // Supprimer le rendez-vous une fois utilisé
                    this.scheduledPurchaseHours.delete(agentId);
                    return true;
                } else {
                    // L'agent n'est pas libre, reporter le rendez-vous
                    this.scheduledPurchaseHours.delete(agentId); // Supprimer le rendez-vous actuel
                    // Un nouveau rendez-vous sera planifié plus bas
                }
            } else {
                // Sinon, attendre l'heure prévue
                console.log(`Agent ${agentId}: Besoin de médicament. Rendez-vous prévu à ${scheduledHour}h (actuellement ${currentHour}h).`);
                return false;
            }
        }

        // Vérifier si les commerces sont ouverts actuellement
        let isOpen = false;
        let openingHour = 8; // Par défaut
        let closingHour = 21; // Par défaut
        
        if (commercialManager) {
            isOpen = commercialManager.areCommercialsOpen(calendarDate, currentHour);
            
            // Récupérer les horaires d'ouverture
            if (commercialManager.openingHoursStrategy) {
                openingHour = commercialManager.openingHoursStrategy.openingHour;
                closingHour = commercialManager.openingHoursStrategy.closingHour;
            }
            
            // Si fermé, récupérer l'heure d'ouverture prochaine
            if (!isOpen) {
                const hoursUntilOpen = commercialManager.getHoursUntilCommercialOpen(calendarDate, currentHour);
                openingHour = (currentHour + hoursUntilOpen) % 24;
            }
        } else {
            // Fallback si commercialManager n'est pas disponible
            const openingHoursStrategy = new CommercialOpeningHoursStrategy();
            isOpen = openingHoursStrategy.isOpen(calendarDate, currentHour);
            openingHour = openingHoursStrategy.openingHour;
            closingHour = openingHoursStrategy.closingHour;
            
            // Si fermé, récupérer l'heure d'ouverture prochaine
            if (!isOpen) {
                const hoursUntilOpen = openingHoursStrategy.hoursUntilOpen(calendarDate, currentHour);
                openingHour = (currentHour + hoursUntilOpen) % 24;
            }
        }
        
        // Si les commerces sont ouverts et l'agent est libre, on peut y aller maintenant
        if (isOpen && this._isAgentFreeAtHour(agent, calendarDate, currentHour)) {
            return true;
        }
        
        // Sinon, planifier un rendez-vous pour une heure où les commerces sont ouverts ET l'agent est libre
        const scheduledHour = this._findNextFreeTimeForShopping(agent, calendarDate, currentHour, openingHour, closingHour);
        
        if (scheduledHour !== null) {
            this.scheduledPurchaseHours.set(agentId, scheduledHour);
            console.log(`Agent ${agentId}: Besoin de médicament mais occupation actuelle. Rendez-vous planifié à ${scheduledHour}h.`);
        } else {
            console.warn(`Agent ${agentId}: Impossible de trouver un créneau libre pour acheter des médicaments.`);
        }
        
        return false;
    }

    /**
     * Vérifie si l'agent est libre à une heure donnée (pas au travail, pas en promenade)
     * @param {Object} agent - Instance de l'agent
     * @param {Object} calendarDate - Date du calendrier actuel
     * @param {number} hour - Heure à vérifier (0-23)
     * @returns {boolean} - True si l'agent est libre à cette heure
     * @private
     */
    _isAgentFreeAtHour(agent, calendarDate, hour) {
        // Vérifier si c'est un jour de travail
        const isWorkDay = agent.workScheduleStrategy?.shouldWorkToday(calendarDate) ?? false;
        
        if (isWorkDay) {
            // En semaine, l'agent est libre avant l'heure de départ au travail ou après l'heure de retour
            // Récupérer les heures de départ et de retour de l'agent
            const departureWorkHour = Math.floor(agent.departureWorkHour ?? 8);  // Par défaut 8h
            const departureHomeHour = Math.floor(agent.departureHomeHour ?? 17); // Par défaut 17h
            
            // En semaine, l'agent est libre s'il n'est pas dans ses heures de travail
            return hour < departureWorkHour || hour >= departureHomeHour;
        } else {
            // Le weekend, l'agent est libre s'il n'est pas en promenade
            // Vérifier si l'agent a une promenade prévue à cette heure
            if (agent.weekendBehavior && agent.weekendBehavior.weekendWalkStrategy) {
                const walkStrategy = agent.weekendBehavior.weekendWalkStrategy;
                const dayKey = walkStrategy._getDayKey ? walkStrategy._getDayKey(calendarDate) : null;
                
                if (dayKey && walkStrategy.agentWalkMap && walkStrategy.agentWalkMap.has(dayKey)) {
                    const agentWalkMap = walkStrategy.agentWalkMap.get(dayKey);
                    if (agentWalkMap && agentWalkMap.has(agent.id)) {
                        const agentWalkInfo = agentWalkMap.get(agent.id);
                        
                        if (agentWalkInfo) {
                            const walkHour = agentWalkInfo.startHour || agentWalkInfo.hour;
                            const walkDuration = agentWalkInfo.duration || 2; // Durée par défaut: 2h
                            
                            // Vérifier si l'heure actuelle est dans la plage horaire de la promenade
                            // L'agent n'est pas libre pendant sa promenade
                            if (hour >= walkHour && hour < (walkHour + walkDuration)) {
                                return false;
                            }
                        }
                    }
                }
            }
            
            // Si on ne peut pas déterminer les horaires de promenade ou si l'heure actuelle
            // ne coïncide pas avec une promenade, on considère que l'agent est libre
            return true;
        }
    }

    /**
     * Trouve la prochaine heure libre pour faire des achats
     * @param {Object} agent - Instance de l'agent
     * @param {Object} calendarDate - Date du calendrier actuel
     * @param {number} currentHour - Heure actuelle (0-23)
     * @param {number} openingHour - Heure d'ouverture des commerces
     * @param {number} closingHour - Heure de fermeture des commerces
     * @returns {number|null} - L'heure planifiée ou null si aucune heure libre n'est trouvée
     * @private
     */
    _findNextFreeTimeForShopping(agent, calendarDate, currentHour, openingHour, closingHour) {
        // Pour éviter une boucle infinie en cas de problème
        const maxIterations = 24;
        
        // Ajouter une variation aléatoire pour éviter que tous les agents y aillent en même temps
        const randomOffset = Math.floor(Math.random() * 3); // 0, 1 ou 2 heures après l'heure idéale
        
        console.log(`Agent ${agent.id}: Recherche d'un créneau libre. Heure actuelle: ${currentHour}h, Horaires commerce: ${openingHour}h-${closingHour}h`);
        
        // Chercher une heure libre à partir de l'heure actuelle
        for (let i = 0; i < maxIterations; i++) {
            const testHour = (currentHour + i) % 24;
            
            // Vérifier si les commerces sont ouverts à cette heure
            const isOpenAtTestHour = testHour >= openingHour && testHour < closingHour;
            
            // Vérifier si l'agent est libre à cette heure
            const isAgentFreeAtTestHour = this._isAgentFreeAtHour(agent, calendarDate, testHour);
            
            console.log(`Agent ${agent.id}: Test heure ${testHour}h - Commerce ouvert: ${isOpenAtTestHour}, Agent libre: ${isAgentFreeAtTestHour}`);
            
            if (isOpenAtTestHour && isAgentFreeAtTestHour) {
                // Ajouter l'offset aléatoire, mais rester dans les horaires d'ouverture
                const scheduledHour = Math.min(testHour + randomOffset, closingHour - 1);
                console.log(`Agent ${agent.id}: Créneau libre trouvé à ${testHour}h, planifié à ${scheduledHour}h (avec offset ${randomOffset})`);
                return scheduledHour;
            }
        }
        
        // Si aucune heure n'est trouvée aujourd'hui, prendre la première heure disponible demain
        // Pour simplifier, on suppose que l'agent sera libre à l'ouverture des magasins demain
        console.log(`Agent ${agent.id}: Aucun créneau libre aujourd'hui, planification pour demain à ${openingHour}h`);
        return openingHour;
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