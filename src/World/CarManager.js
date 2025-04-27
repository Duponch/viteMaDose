// src/World/CarManager.js
import * as THREE from 'three';
import Car from './Car.js';

export default class CarManager {
    constructor(scene, experience) {
        this.scene = scene;
        this.experience = experience;
        // --- MODIFIÉ : Initialiser le pool de voitures ---
        this.maxCars = 250; // Ou récupérer depuis config si besoin
        this.cars = new Array(this.maxCars); // Tableau de taille fixe
        this.agentToCar = new Map(); // Agent ID -> Car instance
        this.carPoolIndices = new Map(); // Agent ID -> Index dans this.cars (et InstancedMesh)
        // --- FIN MODIFIÉ ---

        this.carGeometry = new THREE.BoxGeometry(1.2, 0.6, 2.4);
        this.carGeometry.translate(0, 0.3, 0);
        this.carMaterial = new THREE.MeshStandardMaterial({ /* ... options existantes ... */ });

        // --- MODIFIÉ : InstancedMesh avec taille fixe ---
        this.carInstancedMesh = new THREE.InstancedMesh(
            this.carGeometry,
            this.carMaterial,
            this.maxCars // Taille fixe
        );
        // --- FIN MODIFIÉ ---
        this.carInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.carInstancedMesh.castShadow = true;
        this.carInstancedMesh.receiveShadow = true;
        this.carInstancedMesh.name = "Cars";
        this.carInstancedMesh.frustumCulled = false;
        this.carInstancedMesh.renderOrder = 1;

        // --- MODIFIÉ : Initialiser toutes les matrices pour cacher les voitures ---
        this.tempMatrix = new THREE.Matrix4(); // Garder pour usage général
        const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0); // Matrice pour cacher
        for (let i = 0; i < this.maxCars; i++) {
            // Créer l'objet Car logique mais le marquer inactif
            this.cars[i] = new Car(i, this.experience, new THREE.Vector3(), new THREE.Vector3()); // Position initiale sans importance
            this.cars[i].isActive = false;
            this.carInstancedMesh.setMatrixAt(i, hiddenMatrix); // Cacher visuellement
        }
        this.carInstancedMesh.count = this.maxCars; // Rendre toutes les instances (même cachées)
        this.carInstancedMesh.instanceMatrix.needsUpdate = true; // Appliquer les matrices cachées
        // --- FIN MODIFIÉ ---

        this.scene.add(this.carInstancedMesh);
        this.roadHeight = 0.05;

        console.log("CarManager initialisé avec Pooling");
    }

    /**
     * Trouve une voiture inactive dans le pool et l'assigne à un agent.
     * @param {Object} agent - L'agent qui utilisera la voiture
     * @param {THREE.Vector3} startPosition - Position de départ de la voiture
     * @param {THREE.Vector3} targetPosition - Position cible où la voiture doit se rendre
     * @returns {Car|null} - La voiture assignée ou null si aucune n'est disponible.
     */
    createCarForAgent(agent, startPosition, targetPosition) {
        // Vérifier si l'agent a déjà une voiture (important!)
        if (this.agentToCar.has(agent.id)) {
            console.warn(`Agent ${agent.id} a déjà une voiture. Tentative de réassignation.`);
            return this.agentToCar.get(agent.id);
        }

        // --- MODIFIÉ : Chercher une voiture inactive dans le pool ---
        let availableCar = null;
        let availableCarIndex = -1;

        for (let i = 0; i < this.maxCars; i++) {
            if (this.cars[i] && !this.cars[i].isActive) {
                availableCar = this.cars[i];
                availableCarIndex = i;
                break; // Sortir dès qu'on en trouve une
            }
        }

        if (!availableCar) {
            // Ce log est maintenant correct : toutes les voitures du pool sont actives
            console.warn("Nombre maximal de voitures *actives* atteint");
            return null;
        }
        // --- FIN MODIFIÉ ---

        // Réactiver et configurer la voiture trouvée
        availableCar.isActive = true;
        availableCar.position.copy(startPosition);
        availableCar.targetPosition.copy(targetPosition); // Stocker la cible finale
        availableCar.quaternion.identity(); // Réinitialiser l'orientation
        availableCar.path = null; // Nettoyer l'ancien chemin
        availableCar.currentPathIndex = 0;
        availableCar.updateMatrix(); // Mettre à jour sa matrice initiale

        // Mettre à jour l'InstancedMesh pour cette voiture spécifique
        this.carInstancedMesh.setMatrixAt(availableCarIndex, availableCar.matrix);
        this.carInstancedMesh.instanceMatrix.needsUpdate = true; // Signaler la mise à jour

        // Enregistrer l'association
        this.agentToCar.set(agent.id, availableCar);
        this.carPoolIndices.set(agent.id, availableCarIndex); // Stocker l'index utilisé

        console.log(`[CarManager POOLING] Voiture ${availableCarIndex} assignée à Agent ${agent.id}`);
        return availableCar;
    }

    // getCarForAgent (inchangé)
    getCarForAgent(agentId) {
        return this.agentToCar.get(agentId) || null;
    }

    // hasCarForAgent (inchangé)
    hasCarForAgent(agentId) {
		const hasCar = this.agentToCar.has(agentId);
		// console.log(`[CarManager DEBUG] hasCarForAgent(${agentId}) -> ${hasCar}`); // LOG
		return hasCar;
	}

    /**
     * Marque la voiture d'un agent comme inactive et disponible pour le pool.
     * @param {string} agentId - ID de l'agent
     */
    releaseCarForAgent(agentId) {
        const car = this.agentToCar.get(agentId);
        const carIndex = this.carPoolIndices.get(agentId); // Récupérer l'index

        if (car && carIndex !== undefined) {
            // Marquer la voiture logique comme inactive
            car.isActive = false;
            car.path = null; // Nettoyer le chemin
            car.currentPathIndex = 0;

            // --- MODIFIÉ : Cacher la voiture visuellement ---
            // Créer une matrice qui met à l'échelle 0 pour la cacher
            const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
            this.carInstancedMesh.setMatrixAt(carIndex, hiddenMatrix);
            this.carInstancedMesh.instanceMatrix.needsUpdate = true;
            // --- FIN MODIFIÉ ---

            // Supprimer l'association agent-voiture
            this.agentToCar.delete(agentId);
            this.carPoolIndices.delete(agentId); // Nettoyer l'index aussi

            console.log(`[CarManager POOLING] Voiture ${carIndex} libérée par Agent ${agentId} et cachée.`);
        } else {
            console.warn(`Tentative de libérer une voiture pour Agent ${agentId} qui n'en a pas ou index manquant.`);
        }
    }

    /**
     * Met à jour toutes les voitures actives
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame
     */
    update(deltaTime) {
        let needsMatrixUpdate = false;
        let activeCarCount = 0;

        // --- MODIFIÉ : Itérer sur le pool fixe ---
        for (let i = 0; i < this.maxCars; i++) {
            const car = this.cars[i];
            if (car && car.isActive) { // Mettre à jour seulement les voitures actives
                activeCarCount++;
                car.update(deltaTime); // Logique interne de la voiture
                // La matrice de la voiture est mise à jour dans car.update() via car.updateMatrix()
                this.carInstancedMesh.setMatrixAt(i, car.matrix); // Mettre à jour la matrice dans l'InstancedMesh
                needsMatrixUpdate = true;
            }
            // Les voitures inactives ont déjà leur matrice pour être cachées (faite dans releaseCar)
            // ou n'ont pas encore été activées.
        }
        // --- FIN MODIFIÉ ---

        if (needsMatrixUpdate) {
            this.carInstancedMesh.instanceMatrix.needsUpdate = true;
        }

        // Log périodique (inchangé mais reflète maintenant les voitures actives)
        // if (Math.random() < 0.005) { // ~0.5% de chance par frame
        //     console.log(`CarManager: ${activeCarCount} voitures actives sur ${this.maxCars} pool size`);
        // }
    }

    // destroy (inchangé)
    destroy() {
        if (this.carInstancedMesh.parent) {
            this.carInstancedMesh.parent.remove(this.carInstancedMesh);
        }
        this.carGeometry.dispose();
        this.carMaterial.dispose();
        this.cars = [];
        this.agentToCar.clear();
        this.carPoolIndices.clear(); // Nettoyer la nouvelle map
        console.log("CarManager détruit");
    }
}