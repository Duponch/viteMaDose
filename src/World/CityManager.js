import * as THREE from 'three';
import Building from './Building/Building.js';
import Plot from './Plot.js';
import NavigationManager from './Navigation/NavigationManager.js';

export default class CityManager {
    constructor(scene, experience, config) {
        this.scene = scene;
        this.experience = experience;
        this.config = config;
        
        // Propriétés pour la génération de la ville
        this.buildings = [];
        this.plots = [];
        this.crosswalkInfos = [];
        
        // Structure pour accéder rapidement aux entités par ID
        this.buildingMap = new Map();
        this.buildingTypeMap = new Map();
        this.citizenMap = new Map();
        
        // Structure pour gérer les assignations
        this.homeAssignments = new Map();    // CitizenID -> BuildingID
        this.workAssignments = new Map();    // CitizenID -> BuildingID
        this.commercialAssignments = new Map(); // CitizenID -> BuildingID
        
        // Navigation
        this.navigationManager = null;
    }
    
    initializeNavigation() {
        console.log("CityManager: Initialisation de la navigation...");
        
        // Configuration du cache pour le NavigationManager
        const navConfig = {
            ...this.config,
            cacheMaxEntries: 10000,              // Taille maximale du cache
            cacheExpirationTime: 60000,          // 1 minute d'expiration
            pathSimplificationTolerance: 0.15,   // Tolérance pour la simplification des chemins
            compressionEnabled: true,            // Activation de la compression des chemins
            useCache: true                       // Activer le cache par défaut
        };
        
        // Création du NavigationManager avec l'instance d'expérience
        this.navigationManager = new NavigationManager(this.experience, navConfig);
        
        // Construction des graphes de navigation
        const plots = this.plots;
        const crosswalkInfos = this.crosswalkInfos;
        
        if (!plots || plots.length === 0) {
            console.error("CityManager: Impossible d'initialiser la navigation - aucune parcelle disponible");
            return;
        }
        
        this.navigationManager.buildNavigationGraphs(plots, crosswalkInfos);
        this.navigationManager.initializePathfinder();
        
        // Démarrer le rapport périodique des métriques du cache
        if (this.experience.isDebugMode) {
            this.navigationManager.startCacheMetricsReporting(30000); // Toutes les 30 secondes
        }
        
        console.log("CityManager: Navigation initialisée avec succès");
    }
    
    addBuilding(building) {
        if (!(building instanceof Building)) {
            console.error("CityManager: Tentative d'ajouter un objet non-Building");
            return null;
        }
        
        // Ajouter le bâtiment à nos collections
        this.buildings.push(building);
        this.buildingMap.set(building.id, building);
        
        // Organiser par type
        const type = building.type;
        if (!this.buildingTypeMap.has(type)) {
            this.buildingTypeMap.set(type, []);
        }
        this.buildingTypeMap.get(type).push(building);
        
        return building;
    }
    
    addPlot(plot) {
        if (!(plot instanceof Plot)) {
            console.error("CityManager: Tentative d'ajouter un objet non-Plot");
            return null;
        }
        
        this.plots.push(plot);
        return plot;
    }
    
    addCrosswalkInfo(crosswalkInfo) {
        if (!crosswalkInfo || !crosswalkInfo.position) {
            console.error("CityManager: Tentative d'ajouter une info de passage piéton invalide");
            return null;
        }
        
        this.crosswalkInfos.push(crosswalkInfo);
        return crosswalkInfo;
    }
    
    getBuildingById(id) {
        return this.buildingMap.get(id) || null;
    }
    
    getBuildingsByType(types) {
        if (!Array.isArray(types)) {
            types = [types];
        }
        
        const result = [];
        types.forEach(type => {
            const buildingsOfType = this.buildingTypeMap.get(type) || [];
            result.push(...buildingsOfType);
        });
        
        return result;
    }
    
    registerCitizen(citizenId, citizenRef) {
        if (!citizenId) {
            console.error("CityManager: Tentative d'enregistrer un citoyen sans ID");
            return null;
        }
        
        const info = {
            id: citizenId,
            reference: citizenRef,
            homeBuildingId: null,
            workBuildingId: null,
            commercialBuildingId: null
        };
        
        this.citizenMap.set(citizenId, info);
        return info;
    }
    
    assignHomeToCitizen(citizenId) {
        const citizenInfo = this.citizenMap.get(citizenId);
        if (!citizenInfo) {
            console.error(`CityManager: Citoyen ${citizenId} non trouvé pour assignation maison`);
            return false;
        }
        
        // Trouver un bâtiment résidentiel disponible
        const residentialBuildings = this.getBuildingsByType(['residential', 'apartment']);
        if (!residentialBuildings || residentialBuildings.length === 0) {
            console.error("CityManager: Aucun bâtiment résidentiel disponible pour assignation");
            return false;
        }
        
        // Choisir un bâtiment aléatoirement
        const randomIndex = Math.floor(Math.random() * residentialBuildings.length);
        const selectedBuilding = residentialBuildings[randomIndex];
        
        // Enregistrer l'assignation
        citizenInfo.homeBuildingId = selectedBuilding.id;
        this.homeAssignments.set(citizenId, selectedBuilding.id);
        
        return true;
    }
    
    assignWorkplaceToCitizen(citizenId) {
        const citizenInfo = this.citizenMap.get(citizenId);
        if (!citizenInfo) {
            console.error(`CityManager: Citoyen ${citizenId} non trouvé pour assignation travail`);
            return false;
        }
        
        // Trouver un bâtiment de bureau disponible
        const workplaceBuildings = this.getBuildingsByType(['office', 'commercial', 'factory']);
        if (!workplaceBuildings || workplaceBuildings.length === 0) {
            console.error("CityManager: Aucun bâtiment de travail disponible pour assignation");
            return false;
        }
        
        // Choisir un bâtiment aléatoirement
        const randomIndex = Math.floor(Math.random() * workplaceBuildings.length);
        const selectedBuilding = workplaceBuildings[randomIndex];
        
        // Enregistrer l'assignation
        citizenInfo.workBuildingId = selectedBuilding.id;
        this.workAssignments.set(citizenId, selectedBuilding.id);
        
        return true;
    }
    
    getNavigationGraph(isVehicle = false) {
        return this.navigationManager?.getNavigationGraph(isVehicle) || null;
    }
    
    destroy() {
        // Nettoyage des ressources
        if (this.navigationManager) {
            this.navigationManager.destroy();
            this.navigationManager = null;
        }
        
        // Vider les collections
        this.buildings.forEach(building => {
            building.destroy?.();
        });
        this.buildings = [];
        this.plots = [];
        this.crosswalkInfos = [];
        
        // Vider les maps
        this.buildingMap.clear();
        this.buildingTypeMap.clear();
        this.citizenMap.clear();
        this.homeAssignments.clear();
        this.workAssignments.clear();
        this.commercialAssignments.clear();
        
        console.log("CityManager: Détruit");
    }
} 