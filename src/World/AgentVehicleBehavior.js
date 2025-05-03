// src/World/AgentVehicleBehavior.js
import * as THREE from 'three'; // Nécessaire pour Vector3 potentiellement

export default class AgentVehicleBehavior {
    /**
     * Gère la logique liée à l'utilisation d'un véhicule par un agent.
     * @param {Agent} agent - L'instance Agent associée.
     */
    constructor(agent) {
        this.agent = agent;
        this.experience = agent.experience;
        this.carManager = this.experience.world?.carManager; // Référence au CarManager

        // Probabilité d'avoir un véhicule (peut aussi venir de la config agent)
        this.hasVehicle = Math.random() < (this.agent.config?.vehicleOwnershipProbability ?? 0.1);

        // Propriétés spécifiques au véhicule
        this.isUsingVehicle = false; // Si l'agent est *actuellement* dans un véhicule actif
        this.vehicleHomePosition = null; // Position de 'garage' près de la maison
        this.currentVehicle = null; // Référence à l'instance Car actuelle

        // Calculer la position du garage si l'agent a un véhicule
        this._initializeVehicleHomePosition();
    }

    /**
     * Calcule et stocke la position où la voiture est garée près de la maison.
     * @private
     */
    _initializeVehicleHomePosition() {
        if (this.hasVehicle && this.agent.homePosition) {
            // Créer une position légèrement décalée de la maison pour la voiture
            this.vehicleHomePosition = this.agent.homePosition.clone();
            const offsetRadius = 1.5; // Distance de décalage
            const randomAngle = Math.random() * Math.PI * 2;
            this.vehicleHomePosition.x += Math.cos(randomAngle) * offsetRadius;
            this.vehicleHomePosition.z += Math.sin(randomAngle) * offsetRadius;
            // Utiliser la hauteur de la route + un petit offset (ou config.carHeight)
            const roadHeight = this.experience.world?.roadNavigationGraph?.graphHeight ?? 0.1;
            this.vehicleHomePosition.y = roadHeight + 0.15; // Hauteur approx d'une voiture au sol
        } else {
            this.vehicleHomePosition = null;
        }
    }

    /**
     * Détermine si l'agent devrait utiliser son véhicule pour le trajet actuel.
     * (Pourrait être plus complexe plus tard, ex: basé sur distance)
     * @returns {boolean}
     */
    shouldUseVehicle() {
        return this.hasVehicle;
    }

    /**
     * Demande une voiture au CarManager pour un trajet.
     * @param {THREE.Vector3} startPosition - Position de départ souhaitée de la voiture.
     * @param {THREE.Vector3} targetPosition - Destination finale de la voiture.
     * @returns {boolean} - True si une voiture a été obtenue, false sinon.
     */
    requestCar(startPosition, targetPosition) {
        if (!this.carManager) {
            console.error(`Agent ${this.agent.id}: CarManager non disponible pour demander une voiture.`);
            return false;
        }
        if (!this.shouldUseVehicle()) {
            return false; // N'essaie même pas s'il ne doit pas utiliser de voiture
        }

        // Vérifier si l'agent a déjà une voiture (ne devrait pas arriver si releaseCar est bien appelé)
        if (this.carManager.hasCarForAgent(this.agent.id)) {
             console.warn(`Agent ${this.agent.id} a déjà une voiture dans CarManager lors de la demande.`);
             this.currentVehicle = this.carManager.getCarForAgent(this.agent.id);
             if (this.currentVehicle) {
                 this.currentVehicle.targetPosition.copy(targetPosition); // MAJ cible
                 this.isUsingVehicle = true; // S'assurer que l'état est correct
                 return true;
             }
             // Si getCarForAgent échoue malgré hasCarForAgent, il y a un problème
             this.carManager.releaseCarForAgent(this.agent.id); // Tenter de nettoyer
        }

        const car = this.carManager.createCarForAgent(this.agent, startPosition, targetPosition);
        if (car) {
            this.currentVehicle = car;
            this.isUsingVehicle = true; // Marquer comme utilisant activement
            console.log(`Agent ${this.agent.id}: Voiture ${car.instanceId} obtenue.`);
            return true;
        } else {
            console.warn(`Agent ${this.agent.id}: Échec de l'obtention d'une voiture (pool plein ?).`);
            this.currentVehicle = null;
            this.isUsingVehicle = false;
            return false;
        }
    }

    /**
     * Libère la voiture actuellement utilisée par l'agent auprès du CarManager.
     */
    releaseCar() {
        if (this.currentVehicle && this.carManager) {
            console.log(`Agent ${this.agent.id}: Libération de la voiture ${this.currentVehicle.instanceId}.`);
            this.carManager.releaseCarForAgent(this.agent.id);
        } else {
            // S'assurer que même si currentVehicle est null, on essaie de libérer via l'ID
            // au cas où il y aurait une désynchronisation
             if (this.carManager && this.carManager.hasCarForAgent(this.agent.id)) {
                 console.warn(`Agent ${this.agent.id}: Libération de la voiture via ID car currentVehicle était null.`);
                 this.carManager.releaseCarForAgent(this.agent.id);
             }
        }
        this.currentVehicle = null;
        this.isUsingVehicle = false; // Ne l'utilise plus activement
    }

    /**
     * Logique appelée lorsque l'agent "entre" visuellement dans le véhicule.
     * (Principalement pour gérer l'état isUsingVehicle).
     */
    enterVehicle() {
        if (!this.isUsingVehicle && this.currentVehicle) {
             this.isUsingVehicle = true; // Confirme l'utilisation active
             // console.log(`Agent ${this.agent.id}: Est entré dans la voiture ${this.currentVehicle.instanceId}.`);
        } else if (!this.currentVehicle) {
             console.warn(`Agent ${this.agent.id}: Tentative d'entrer dans un véhicule mais currentVehicle est null.`);
        }
    }

    /**
     * Logique appelée lorsque l'agent "sort" visuellement du véhicule.
     * (Principalement pour gérer l'état isUsingVehicle et libérer la voiture).
     */
    exitVehicle() {
        if (this.isUsingVehicle || this.currentVehicle) {
            // console.log(`Agent ${this.agent.id}: Sort du véhicule.`);
            this.releaseCar(); // Libère la voiture dans le CarManager
        }
         // S'assurer que l'état est bien réinitialisé même si releaseCar a échoué
         this.isUsingVehicle = false;
         this.currentVehicle = null;
    }

    /**
     * Retourne la position de la voiture si l'agent en utilise une, sinon null.
     * @returns {THREE.Vector3 | null}
     */
    getVehiclePosition() {
        return this.isUsingVehicle && this.currentVehicle ? this.currentVehicle.position : null;
    }

    /**
     * Retourne l'orientation de la voiture si l'agent en utilise une, sinon null.
     * @returns {THREE.Quaternion | null}
     */
    getVehicleOrientation() {
        return this.isUsingVehicle && this.currentVehicle ? this.currentVehicle.quaternion : null;
    }

    /**
     * Indique si l'agent conduit activement une voiture.
     * @returns {boolean}
     */
    isDriving() {
        return this.isUsingVehicle && this.currentVehicle && this.currentVehicle.isActive;
    }

    /**
     * Méthode de mise à jour (pour l'instant vide, mais pourrait être utilisée
     * pour des logiques futures liées au véhicule, ex: entretien).
     */
    update(deltaTime) {
        // Pour l'instant, la logique de déplacement est gérée par la state machine principale
        // et la voiture elle-même.
    }
}