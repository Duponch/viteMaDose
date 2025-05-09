// src/World/CitizenManager.js
import * as THREE from 'three';
import CitizenHealth from './CitizenHealth.js';

export default class CitizenManager {
    /**
     * Constructeur de CitizenManager.
     * @param {object} config - La configuration générale du projet, contenant notamment
     * les capacités par défaut pour les bâtiments.
     */
    constructor(config) {
        this.config = config;
        // Map des instances de bâtiments, indexées par leur identifiant.
        this.buildingInstances = new Map();
        // Map des citoyens enregistrés, indexés par leur identifiant.
        this.citizens = new Map();
        // Compteur pour générer des identifiants uniques pour les bâtiments.
        this.nextBuildingInstanceId = 0;
        
        // Instance du gestionnaire de santé des citoyens
        this.citizenHealth = null;
    }

    /**
     * Initialise le gestionnaire de santé des citoyens
     * @param {object} experience - L'instance de l'expérience
     */
    initializeHealthSystem(experience) {
        if (!this.citizenHealth && experience) {
            this.citizenHealth = new CitizenHealth(experience);
            console.log("CitizenManager: Système de santé initialisé");
        }
    }

    /**
     * Enregistre une nouvelle instance de bâtiment.
     * @param {string} plotId - L'identifiant de la parcelle dans laquelle se trouve le bâtiment.
     * @param {string} assetType - Le type d'asset ('house', 'building', 'skyscraper', 'industrial', 'park').
     * @param {THREE.Vector3} position - La position d'ancrage du bâtiment.
     * @param {number|null} capacityOverride - Capacité optionnelle remplaçant la valeur par défaut.
     * @returns {object} L'objet d'information du bâtiment enregistré.
     */
    registerBuildingInstance(plotId, assetType, position, capacityOverride = null) {
        const id = `bldg_${this.nextBuildingInstanceId++}`;
        let capacity = 0;
        let isWorkplace = false;

        switch (assetType) {
            case 'house':
                capacity = capacityOverride ?? this.config.maxCitizensPerHouse ?? 5;
                break;
            case 'building':
                capacity = capacityOverride ?? this.config.maxCitizensPerBuilding ?? 10;
                break;
            case 'skyscraper':
                capacity = capacityOverride ?? this.config.maxWorkersPerSkyscraper ?? 100;
                isWorkplace = true;
                break;
            case 'industrial':
                capacity = capacityOverride ?? this.config.maxWorkersPerIndustrial ?? 50;
                isWorkplace = true;
                break;
            case 'park': // Les parcs ont une capacité de 0 (pas de résidents/travailleurs)
            default:
                capacity = 0;
                break;
        }

        const buildingInfo = {
            id: id,
            plotId: plotId,
            type: assetType,
            position: position.clone(), // Copie de la position pour éviter les références partagées.
            capacity: capacity,
            isWorkplace: isWorkplace,
            occupants: [] // Tableau des identifiants des citoyens affectés.
        };

        this.buildingInstances.set(id, buildingInfo);
        return buildingInfo;
    }

    /**
     * Enregistre un citoyen dans le système.
     * @param {string} citizenId - L'identifiant unique du citoyen.
     * @param {object} agentLogic - Une référence à la logique ou instance de l'agent.
     * @returns {object} L'objet d'information du citoyen enregistré.
     */
    registerCitizen(citizenId, agentLogic) {
        if (this.citizens.has(citizenId)) {
            console.warn(`Citizen ${citizenId} already registered.`);
            return this.citizens.get(citizenId);
        }
        const citizenInfo = {
            id: citizenId,
            agentLogic: agentLogic, // Conserve une référence à l'instance Agent
            homeBuildingId: null,
            workBuildingId: null,
            happiness: 100, // Bonheur initial
            health: 50, // Santé initiale
            maxHealth: 100, // Santé max initiale
            healthThreshold: 100, // Seuil de santé max (diminue avec le temps)
            money: 0, // Argent initial
            salary: 100, // Salaire quotidien initial (mis à 100€ selon les specs)
            
            // Nouvelles propriétés
            status: "Humain", // Statut initial (Humain ou Argile)
            chemicalDependency: 0, // Dépendance chimique (0-100)
            diseases: [], // Maladies
            needsMedication: false, // Besoin de médicament
            lastMedicationTime: -1, // Dernier temps de prise de médicament
            daysSinceLastMedication: 0, // Jours écoulés depuis la dernière prise
            healthStatus: "Bonne santé", // Statut sanitaire
            naturalTreatmentCount: 0 // Compteur pour traitement naturel
        };
        
        this.citizens.set(citizenId, citizenInfo);
        
        // Initialiser les données de santé si le gestionnaire est disponible
        if (this.citizenHealth) {
            this.citizenHealth.initializeHealthData(citizenInfo);
        }
        
        return citizenInfo;
    }

    /**
     * Assigne aléatoirement un domicile à un citoyen parmi les bâtiments résidentiels disponibles.
     * @param {string} citizenId - L'identifiant du citoyen.
     * @returns {boolean} Vrai si l'affectation a réussi, sinon faux.
     */
    assignHomeToCitizen(citizenId) {
        const citizenInfo = this.citizens.get(citizenId);
        if (!citizenInfo || citizenInfo.homeBuildingId) return false; // Déjà affecté ou citoyen non trouvé

        // Recherche les bâtiments de type 'house' ou 'building' disposant d'une capacité résiduelle.
        const potentialHomes = Array.from(this.buildingInstances.values()).filter(b =>
            (b.type === 'house' || b.type === 'building') &&
            b.occupants.length < b.capacity
        );

        if (potentialHomes.length === 0) {
            // console.warn(`No available home for citizen ${citizenId}`); // Message un peu verbeux
            return false;
        }

        const home = potentialHomes[Math.floor(Math.random() * potentialHomes.length)];
        home.occupants.push(citizenId);
        citizenInfo.homeBuildingId = home.id;

        // Mise à jour directe de l'agent logique s'il existe.
        if (citizenInfo.agentLogic) {
            citizenInfo.agentLogic.homeBuildingId = home.id;
            // On pourrait aussi initialiser la position de l'agent ici, mais c'est fait dans agent.initializeLifecycle
        } else {
            console.warn(`Missing agent logic for citizen ${citizenId} during home assignment.`);
        }

        // console.log(`Citizen ${citizenId} assigned home ${home.id} (Type: ${home.type})`);
        return true;
    }

    /**
     * Assigne aléatoirement un lieu de travail à un citoyen parmi les bâtiments identifiés comme lieux de travail.
     * @param {string} citizenId - L'identifiant du citoyen.
     * @returns {boolean} Vrai si l'affectation a réussi, sinon faux.
     */
    assignWorkplaceToCitizen(citizenId) {
        const citizenInfo = this.citizens.get(citizenId);
        if (!citizenInfo || citizenInfo.workBuildingId) return false; // Déjà affecté ou citoyen non trouvé

        // Recherche des bâtiments marqués comme "workplace" avec de la place.
        const potentialWorkplaces = Array.from(this.buildingInstances.values()).filter(b =>
            b.isWorkplace && b.occupants.length < b.capacity
        );

        if (potentialWorkplaces.length === 0) {
            // console.warn(`No available workplace for citizen ${citizenId}`); // Message un peu verbeux
            return false;
        }

        const workplace = potentialWorkplaces[Math.floor(Math.random() * potentialWorkplaces.length)];
        workplace.occupants.push(citizenId);
        citizenInfo.workBuildingId = workplace.id;

        if (citizenInfo.agentLogic) {
            citizenInfo.agentLogic.workBuildingId = workplace.id;
        } else {
            console.warn(`Missing agent logic for citizen ${citizenId} during work assignment.`);
        }

        // console.log(`Citizen ${citizenId} assigned workplace ${workplace.id} (Type: ${workplace.type})`);
        return true;
    }

    /**
     * Récupère les informations d'un bâtiment à partir de son identifiant.
     * @param {string} buildingInstanceId - L'identifiant du bâtiment.
     * @returns {object|null} L'objet du bâtiment ou null s'il n'est pas trouvé.
     */
    getBuildingInfo(buildingInstanceId) {
        return this.buildingInstances.get(buildingInstanceId) || null;
    }

    /**
     * Récupère toutes les instances de bâtiments correspondant aux types spécifiés.
     * @param {Array<string>} types - Un tableau de types de bâtiments à rechercher (ex: ['house', 'park']).
     * @returns {Array<object>} Un tableau contenant les objets d'information des bâtiments correspondants.
     */
    getBuildingsByType(types) {
        if (!Array.isArray(types) || types.length === 0) {
            return []; // Retourner un tableau vide si les types sont invalides
        }
        
        const matchingBuildings = [];
        // Itérer sur les *valeurs* de la Map
        for (const buildingInfo of this.buildingInstances.values()) {
            if (types.includes(buildingInfo.type)) {
                matchingBuildings.push(buildingInfo);
            }
        }
        return matchingBuildings;
    }

    /**
     * Récupère les informations d'un citoyen à partir de son identifiant.
     * @param {string} citizenId - L'identifiant du citoyen.
     * @returns {object|null} L'objet du citoyen ou null s'il n'est pas trouvé.
     */
    getCitizenInfo(citizenId) {
        return this.citizens.get(citizenId) || null;
    }

    /**
     * Met à jour les citoyens (appelé régulièrement par le système)
     * @param {number} deltaTime - Temps écoulé depuis la dernière mise à jour
     */
    update(deltaTime) {
        if (!this.citizenHealth) return;

        const environment = this.citizenHealth.experience.world?.environment;
        if (!environment) return;

        // Obtenir le jour actuel à partir de getCurrentCalendarDate()
        const calendarDate = environment.getCurrentCalendarDate();
        const currentDay = calendarDate?.jour || 0;
        
        // Pour le débogage
        if (currentDay > 0 && (this._lastLoggedDay === undefined || currentDay !== this._lastLoggedDay)) {
            console.log(`CitizenManager: Jour actuel du calendrier = ${currentDay}`);
            this._lastLoggedDay = currentDay;
        }
        
        // Mettre à jour la santé de tous les citoyens
        this.citizens.forEach(citizen => {
            this.citizenHealth.updateHealth(citizen, currentDay);
            
            // Payer le salaire quotidien (une fois par jour)
            this._updateSalary(citizen, currentDay);
        });
    }
    
    /**
     * Met à jour le salaire d'un citoyen (une fois par jour)
     * @private
     * @param {Object} citizen - L'objet citoyen
     * @param {number} currentDay - Le jour actuel
     */
    _updateSalary(citizen, currentDay) {
        if (!citizen) return;
        
        // Vérifier si le dernier jour de paiement est défini
        if (citizen.lastSalaryDay === undefined) {
            citizen.lastSalaryDay = currentDay;
            return;
        }
        
        // Vérifier si un jour s'est écoulé depuis le dernier paiement
        let daysSinceLastSalary = currentDay - citizen.lastSalaryDay;
        
        // Gérer le changement de mois
        if (daysSinceLastSalary < 0) {
            const environment = this.citizenHealth?.experience.world?.environment;
            const prevMonthDays = environment?.getMonthDays?.() || 30;
            daysSinceLastSalary = (prevMonthDays - citizen.lastSalaryDay) + currentDay;
            console.log(`Citoyen ${citizen.id}: Changement de mois détecté - jours depuis dernier salaire recalculés = ${daysSinceLastSalary}`);
        }
        
        if (daysSinceLastSalary >= 1) {
            // Payer le salaire pour chaque jour écoulé
            citizen.money += citizen.salary * daysSinceLastSalary;
            citizen.lastSalaryDay = currentDay;
        }
    }
    
    /**
     * Applique un traitement médicamenteux à un citoyen
     * @param {string} citizenId - L'identifiant du citoyen
     * @param {boolean} isPalliative - Si true, soin palliatif; sinon traitement classique
     * @returns {boolean} - True si le traitement a été appliqué
     */
    applyMedication(citizenId, isPalliative = false) {
        if (!this.citizenHealth) return false;
        
        const citizen = this.citizens.get(citizenId);
        if (!citizen) return false;
        
        return this.citizenHealth.applyPharmaceuticalTreatment(citizen, isPalliative);
    }
    
    /**
     * Applique un traitement naturel à un citoyen
     * @param {string} citizenId - L'identifiant du citoyen
     * @returns {boolean} - True si une maladie a été guérie
     */
    applyNaturalTreatment(citizenId) {
        if (!this.citizenHealth) return false;
        
        const citizen = this.citizens.get(citizenId);
        if (!citizen) return false;
        
        return this.citizenHealth.applyNaturalTreatment(citizen);
    }

    /**
     * Calcule le bonheur moyen de tous les citoyens.
     * @returns {number} Le bonheur moyen ou 0 si aucun citoyen.
     */
    getAverageHappiness() {
        if (this.citizens.size === 0) return 0;
        let totalHappiness = 0;
        this.citizens.forEach(citizen => {
            totalHappiness += citizen.happiness;
        });
        return totalHappiness / this.citizens.size;
    }

    /**
     * Calcule la santé moyenne de tous les citoyens.
     * @returns {number} La santé moyenne ou 0 si aucun citoyen.
     */
    getAverageHealth() {
        if (this.citizens.size === 0) return 0;
        let totalHealth = 0;
        this.citizens.forEach(citizen => {
            totalHealth += citizen.health;
        });
        return totalHealth / this.citizens.size;
    }

    /**
     * Calcule la santé max moyenne de tous les citoyens.
     * @returns {number} La santé max moyenne ou 0 si aucun citoyen.
     */
    getAverageMaxHealth() {
        if (this.citizens.size === 0) return 0;
        let totalMaxHealth = 0;
        this.citizens.forEach(citizen => {
            totalMaxHealth += citizen.maxHealth;
        });
        return totalMaxHealth / this.citizens.size;
    }

    /**
     * Calcule l'argent moyen de tous les citoyens.
     * @returns {number} L'argent moyen ou 0 si aucun citoyen.
     */
    getAverageMoney() {
        if (this.citizens.size === 0) return 0;
        let totalMoney = 0;
        this.citizens.forEach(citizen => totalMoney += citizen.money);
        return totalMoney / this.citizens.size;
    }

    /**
     * Calcule le salaire moyen de tous les citoyens.
     * @returns {number} Le salaire moyen.
     */
    getAverageSalary() {
        if (this.citizens.size === 0) return 0;
        let totalSalary = 0;
        this.citizens.forEach(citizen => totalSalary += citizen.salary);
        return totalSalary / this.citizens.size;
    }
    
    /**
     * Calcule la dépendance chimique moyenne de tous les citoyens.
     * @returns {number} La dépendance chimique moyenne.
     */
    getAverageChemicalDependency() {
        if (this.citizens.size === 0) return 0;
        let totalDependency = 0;
        this.citizens.forEach(citizen => totalDependency += (citizen.chemicalDependency || 0));
        return totalDependency / this.citizens.size;
    }
    
    /**
     * Récupère le nombre total de maladies pour tous les citoyens.
     * @returns {number} Le nombre total de maladies.
     */
    getTotalDiseases() {
        if (this.citizens.size === 0) return 0;
        let totalDiseases = 0;
        this.citizens.forEach(citizen => {
            if (citizen.diseases && Array.isArray(citizen.diseases)) {
                totalDiseases += citizen.diseases.length;
            }
        });
        return totalDiseases;
    }
    
    /**
     * Compte le nombre de citoyens par statut (Humain/Argile).
     * @returns {Object} Un objet contenant le nombre pour chaque statut.
     */
    getStatusCounts() {
        const counts = {
            "Humain": 0,
            "Argile": 0
        };
        
        this.citizens.forEach(citizen => {
            if (citizen.status === "Humain") {
                counts.Humain++;
            } else if (citizen.status === "Argile") {
                counts.Argile++;
            }
        });
        
        return counts;
    }
    
    /**
     * Réinitialise l'état du CitizenManager.
     * Vide les listes de bâtiments et de citoyens et remet le compteur d'ID à zéro.
     */
    reset() {
        this.buildingInstances.clear();
        this.citizens.clear();
        this.nextBuildingInstanceId = 0;
        console.log("CitizenManager reset.");
    }
}