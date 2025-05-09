import * as THREE from 'three';
import AgentState from './AgentState.js';
import MedicationPurchaseStrategy from '../Strategies/MedicationPurchaseStrategy.js';
import CommercialOpeningHoursStrategy from '../Strategies/CommercialOpeningHoursStrategy.js';

export default class AgentMedicationBehavior {
    /**
     * Gère la logique d'achat et de prise de médicament pour un agent
     * @param {Agent} agent - L'instance Agent associée
     * @param {MedicationPurchaseStrategy} medicationPurchaseStrategy - La stratégie d'achat (optionnelle)
     */
    constructor(agent, medicationPurchaseStrategy = null) {
        this.agent = agent;
        this.experience = agent.experience;
        this.medicationPurchaseStrategy = medicationPurchaseStrategy || new MedicationPurchaseStrategy({}, this.experience);
        
        // Propriétés liées à l'achat et la prise de médicament
        this.commercialBuildingId = null;
        this.commercialPosition = null;
        this.commercialGridNode = null;
        this.lastMedicationTaken = -1; // Timestamp de la dernière prise de médicament
        
        // Initialise l'inventaire si nécessaire
        if (!this.agent.inventory) {
            this.agent.inventory = {
                medications: 0
            };
        }
    }
    
    /**
     * Met à jour le comportement d'achat de médicament
     * @param {Object} calendarDate - Informations du calendrier actuel
     * @param {number} currentHour - Heure actuelle (0-23)
     * @param {number} currentGameTime - Temps de jeu actuel (ms)
     */
    update(calendarDate, currentHour, currentGameTime) {
        const agent = this.agent;
        const agentState = agent.currentState;
        
        // Récupérer les informations du citoyen
        const cityManager = this.experience.world?.cityManager;
        const citizenInfo = cityManager?.getCitizenInfo(agent.id);
        
        if (!cityManager || !citizenInfo) return;
        
        // Afficher les informations de planification de weekend si c'est le weekend
        if (["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine) && agent.weekendBehavior?.weekendWalkStrategy) {
            const walkStrategy = agent.weekendBehavior.weekendWalkStrategy;
            const dayKey = walkStrategy._getDayKey ? walkStrategy._getDayKey(calendarDate) : null;
            
            if (dayKey && walkStrategy.agentWalkMap?.has(dayKey)) {
                const agentWalkMap = walkStrategy.agentWalkMap.get(dayKey);
                if (agentWalkMap && agentWalkMap.has(agent.id)) {
                    const walkInfo = agentWalkMap.get(agent.id);
                    if (walkInfo) {
                        const walkHour = walkInfo.startHour || walkInfo.hour || -1;
                        const walkDuration = walkInfo.duration || 2;
                        //console.log(`Agent ${agent.id}: Info promenade weekend : départ prévu à ${walkHour}h pour ${walkDuration.toFixed(1)}h, statut démarré: ${walkInfo.hasStarted}`);
                    }
                }
            }
        }
        
        // On vérifie si c'est vendredi soir (priorité au retour à la maison)
        // Cette condition ne s'applique qu'aux jours de travail, pas aux achats de médicaments
        const isFridayEvening = calendarDate?.jourSemaine === "Vendredi" && currentHour >= agent.departureHomeHour;
        
        // --- Étape 1: Vérifier si l'agent doit prendre un médicament s'il est à la maison ---
        if (agentState === AgentState.AT_HOME && 
            citizenInfo.needsMedication && 
            agent.inventory && 
            agent.inventory.medications > 0 &&
            (this.lastMedicationTaken === -1 || this._canTakeMedicationAgain(currentGameTime))) {
            
            const medicationTaken = this._takeMedication(citizenInfo, currentGameTime);
            //console.log(`Agent ${agent.id}: Prise de médicament à la maison (réussie: ${medicationTaken}).`);
            
            // Si l'agent a pris un médicament, sortir de la méthode pour ne pas faire d'autres actions
            if (medicationTaken) return;
        }
        
        // --- Étape 2: Vérifier si l'agent doit aller acheter un médicament ---
        // L'agent peut aller acheter un médicament s'il est à la maison, que ce soit en semaine ou weekend
        if (agentState === AgentState.AT_HOME) {
            // Vérifier si les commerces sont ouverts avant d'envisager l'achat de médicament
            let areCommercialsOpen = false;
            
            if (cityManager.commercialManager) {
                areCommercialsOpen = cityManager.commercialManager.areCommercialsOpen(calendarDate, currentHour);
            } else {
                // Fallback si commercialManager n'est pas disponible
                const openingHoursStrategy = new CommercialOpeningHoursStrategy();
                areCommercialsOpen = openingHoursStrategy.isOpen(calendarDate, currentHour);
            }
            
            // Si les commerces sont fermés, ne pas partir acheter de médicament
            if (!areCommercialsOpen) {
                // Planifier l'achat pour plus tard via la stratégie
                this.medicationPurchaseStrategy.shouldPurchaseMedication(
                    agent.id, citizenInfo, agent, currentGameTime, calendarDate, currentHour
                );
                return;
            }
            
            const shouldPurchase = this.medicationPurchaseStrategy.shouldPurchaseMedication(
                agent.id, citizenInfo, agent, currentGameTime, calendarDate, currentHour
            );

            if (shouldPurchase) {
                // Tenter de trouver le bâtiment commercial le plus proche
                const nearestCommercial = this.medicationPurchaseStrategy.findNearestCommercialBuilding(agent, cityManager);
                
                if (nearestCommercial) {
                    this.commercialBuildingId = nearestCommercial.id;
                    const commercialPos = nearestCommercial.position.clone();
                    const navManager = cityManager.navigationManager;
                    const navGraph = navManager?.getNavigationGraph(false); // Toujours piéton
                    
                    if (navGraph) {
                        // Ajuster la position Y pour être au niveau du trottoir
                        commercialPos.y = navGraph.sidewalkHeight || 0.2;
                        
                        // Trouver le nœud le plus proche sur le graphe de navigation
                        this.commercialGridNode = navGraph.getClosestWalkableNode(commercialPos);
						
                        if (this.commercialGridNode) {
                            this.commercialPosition = navGraph.gridToWorld(this.commercialGridNode.x, this.commercialGridNode.y);
                            
                            // Enregistrer la tentative d'achat
                            this.medicationPurchaseStrategy.recordPurchaseAttempt(agent.id, currentGameTime);
                            
                            // Indiquer si c'est le weekend pour le log
                            const isWeekend = ["Samedi", "Dimanche"].includes(calendarDate?.jourSemaine);
                            const dayTypeMsg = isWeekend ? "weekend" : "semaine";
                            
                            //console.log(`Agent ${agent.id}: Besoin de médicament détecté (${dayTypeMsg}). Direction le magasin ${this.commercialBuildingId}.`);
                            
                            // Demander un chemin vers le bâtiment commercial
                            agent._currentPathRequestGoal = 'COMMERCIAL';
                            agent.requestPath(
                                agent.homePosition,
                                this.commercialPosition,
                                agent.homeGridNode,
                                this.commercialGridNode,
                                AgentState.READY_TO_LEAVE_FOR_COMMERCIAL,
                                currentGameTime
                            );
                            return; // Sortir après avoir initié la demande de chemin
                        }
                    }
                } else {
                    console.warn(`Agent ${agent.id}: Besoin de médicament mais aucun bâtiment commercial trouvé.`);
                }
            }
        }
        
        // --- Étape 3: Gérer l'arrivée au bâtiment commercial ---
        if (agentState === AgentState.AT_COMMERCIAL) {
            // Effectuer l'achat de médicament
            const purchaseSuccess = this.medicationPurchaseStrategy.purchaseMedication(
                citizenInfo, agent, calendarDate, currentHour
            );
            
            if (purchaseSuccess) {
                //console.log(`Agent ${agent.id}: Achat effectué au magasin ${this.commercialBuildingId}. Retour à la maison.`);
            } else {
                console.warn(`Agent ${agent.id}: Échec de l'achat au magasin ${this.commercialBuildingId}. Retour à la maison.`);
            }
            
            // Si c'est vendredi soir, on utilise le chemin normal pour rentrer à la maison
            // mais on le note dans les logs pour information
            if (isFridayEvening && agent.workBuildingId) {
                //console.log(`Agent ${agent.id}: Vendredi soir, retour normal à la maison depuis le commercial.`);
            }
            
            // Demander un chemin pour rentrer à la maison
            if (agent.homePosition && agent.homeGridNode && this.commercialPosition && this.commercialGridNode) {
                agent._currentPathRequestGoal = 'HOME';
                agent.requestPath(
                    this.commercialPosition,
                    agent.homePosition,
                    this.commercialGridNode,
                    agent.homeGridNode,
                    AgentState.READY_TO_LEAVE_FOR_HOME,
                    currentGameTime
                );
            } else {
                console.error(`Agent ${agent.id}: Impossible de rentrer (infos domicile ou commercial manquantes). Forçage récupération.`);
                agent.forceRecoverFromTimeout(currentGameTime);
            }
        }
    }
    
    /**
     * Vérifie si l'agent peut prendre un médicament (respect du délai journalier)
     * @param {number} currentGameTime - Temps de jeu actuel
     * @returns {boolean} - True si l'agent peut prendre un médicament
     */
    _canTakeMedicationAgain(currentGameTime) {
        if (this.lastMedicationTaken === -1) return true;
        
        // Obtenir la durée d'un jour en ms de jeu
        const environment = this.experience.world?.environment;
        const dayDurationMs = environment?.dayDurationMs || 24 * 60 * 60 * 1000;
        
        // Vérifier si au moins un jour s'est écoulé depuis la dernière prise
        const timeElapsed = currentGameTime - this.lastMedicationTaken;
        const canTake = timeElapsed >= dayDurationMs;
        
        if (!canTake) {
            // Calculer et afficher le temps restant en heures de jeu
            const hoursRemaining = (dayDurationMs - timeElapsed) / (dayDurationMs / 24);
            //console.log(`Agent ${this.agent.id}: Doit attendre encore ${hoursRemaining.toFixed(1)}h avant de pouvoir reprendre un médicament.`);
        }
        
        return canTake;
    }
    
    /**
     * Fait prendre un médicament à l'agent
     * @param {Object} citizenInfo - Informations du citoyen
     * @param {number} currentGameTime - Temps de jeu actuel
     * @returns {boolean} - True si le médicament a été pris
     */
    _takeMedication(citizenInfo, currentGameTime) {
        if (!citizenInfo || !this.agent.inventory || this.agent.inventory.medications <= 0) {
            return false;
        }
        
        // Appliquer les effets du médicament via CitizenHealth
        const citizenHealth = this.experience.world?.cityManager?.citizenManager?.citizenHealth;
        if (citizenHealth) {
            // Application du traitement pharmaceutique (soin palliatif)
            citizenHealth.applyPharmaceuticalTreatment(citizenInfo, true);

			// Décrémenter l'inventaire
			this.agent.inventory.medications--;
        
			// Mettre à jour le timestamp de dernière prise
			this.lastMedicationTaken = currentGameTime;

            //console.log(`Agent ${this.agent.id}: Médicament pris. Inventaire restant: ${this.agent.inventory.medications} médicament(s).`);
            
            // Mettre à jour l'infobulle si l'agent est sélectionné
            if (this.experience.selectedAgent === this.agent) {
                this.experience.updateTooltipContent(this.agent);
            }
            
            return true;
        }
        
        return false;
    }
} 