// src/World/CarManager.js
import * as THREE from 'three';
import Car from './Car.js';
import { createLowPolyCarGeometry } from './LowPolyCarGeometry.js';

export default class CarManager {
    constructor(scene, experience) {
        this.scene = scene;
        this.experience = experience;
        // --- MODIFIÉ : Initialiser le pool de voitures ---
        this.maxCars = 500; // Ou récupérer depuis config si besoin
        this.cars = new Array(this.maxCars); // Tableau de taille fixe
        this.agentToCar = new Map(); // Agent ID -> Car instance
        this.carPoolIndices = new Map(); // Agent ID -> Index dans this.cars (et InstancedMesh)
        this.instanceIdToAgentId = new Array(this.maxCars); // instanceId -> Agent ID
        // --- FIN MODIFIÉ ---

        // --- NOUVEAU : Utiliser la géométrie fusionnée low-poly PAR MATÉRIAU ---
        const carGeoms = createLowPolyCarGeometry();
        this.instancedMeshes = {};
        this.carMeshOrder = [
            'body', 'windows', 'wheels', 'hubcaps', 'lights', 'rearLights'
        ];
        for (const part of this.carMeshOrder) {
            const { geometry, material } = carGeoms[part];
            const mesh = new THREE.InstancedMesh(geometry, material, this.maxCars);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.name = `Cars_${part}`;
            mesh.frustumCulled = false;
            mesh.renderOrder = 1;
            mesh.userData.isCarPart = true; // Marqueur pour identification
            this.scene.add(mesh);
            mesh.computeBoundingSphere(); // Calculer la sphère englobante (gardé pour info)
            mesh.computeBoundingBox(); // Calculer la boîte englobante (gardé pour info)
            // <<< NOUVEAU: Forcer une grande BoundingSphere pour le Raycaster >>>
            mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000); // Centre à (0,0,0), rayon très grand
            this.instancedMeshes[part] = mesh;
        }

        // --- MODIFIÉ : Initialiser toutes les matrices pour cacher les voitures ---
        this.tempMatrix = new THREE.Matrix4(); // Garder pour usage général
        const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0); // Matrice pour cacher
        for (let i = 0; i < this.maxCars; i++) {
            // Créer l'objet Car logique mais le marquer inactif
            this.cars[i] = new Car(i, this.experience, new THREE.Vector3(), new THREE.Vector3()); // Position initiale sans importance
            this.cars[i].isActive = false;
            for (const part of this.carMeshOrder) {
                this.instancedMeshes[part].setMatrixAt(i, hiddenMatrix);
            }
        }
        for (const part of this.carMeshOrder) {
            this.instancedMeshes[part].count = this.maxCars;
            this.instancedMeshes[part].instanceMatrix.needsUpdate = true;
        }
        // --- FIN MODIFIÉ ---

        this.roadHeight = 0.05;

        console.log("CarManager initialisé avec Pooling multi-matériaux");
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

        // Mettre à jour tous les InstancedMeshs pour cette voiture spécifique
        for (const part of this.carMeshOrder) {
            this.instancedMeshes[part].setMatrixAt(availableCarIndex, availableCar.matrix);
            this.instancedMeshes[part].instanceMatrix.needsUpdate = true;
        }

        // Enregistrer l'association
        this.agentToCar.set(agent.id, availableCar);
        this.carPoolIndices.set(agent.id, availableCarIndex); // Stocker l'index utilisé
        this.instanceIdToAgentId[availableCarIndex] = agent.id; // instanceId -> Agent ID

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

            // --- MODIFIÉ : Cacher la voiture visuellement sur tous les InstancedMeshs ---
            const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
            for (const part of this.carMeshOrder) {
                this.instancedMeshes[part].setMatrixAt(carIndex, hiddenMatrix);
                this.instancedMeshes[part].instanceMatrix.needsUpdate = true;
            }
            // --- FIN MODIFIÉ ---

            // Supprimer l'association agent-voiture
            this.agentToCar.delete(agentId);
            this.carPoolIndices.delete(agentId); // Nettoyer l'index aussi
            this.instanceIdToAgentId[carIndex] = undefined; // instanceId -> Agent ID

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
                for (const part of this.carMeshOrder) {
                    this.instancedMeshes[part].setMatrixAt(i, car.matrix);
                }
                needsMatrixUpdate = true;
            }
            // Les voitures inactives ont déjà leur matrice pour être cachées (faite dans releaseCar)
            // ou n'ont pas encore été activées.
        }
        // --- FIN MODIFIÉ ---

        if (needsMatrixUpdate) {
            for (const part of this.carMeshOrder) {
                this.instancedMeshes[part].instanceMatrix.needsUpdate = true;
            }
        }

        // Log périodique (inchangé mais reflète maintenant les voitures actives)
        // if (Math.random() < 0.005) { // ~0.5% de chance par frame
        //     console.log(`CarManager: ${activeCarCount} voitures actives sur ${this.maxCars} pool size`);
        // }
    }

    // destroy (inchangé)
    destroy() {
        for (const part of this.carMeshOrder) {
            if (this.instancedMeshes[part].parent) {
                this.instancedMeshes[part].parent.remove(this.instancedMeshes[part]);
            }
            this.instancedMeshes[part].geometry.dispose();
            this.instancedMeshes[part].material.dispose();
        }
        this.cars = [];
        this.agentToCar.clear();
        this.carPoolIndices.clear(); // Nettoyer la nouvelle map
        console.log("CarManager détruit");
    }

    /**
     * Vérifie si un mesh donné est une partie d'une voiture gérée par ce manager.
     * @param {THREE.Mesh} mesh L'objet mesh à vérifier.
     * @returns {boolean} True si c'est une partie de voiture instanciée.
     */
    isCarMesh(mesh) {
        // Vérifie si le mesh est une instance de InstancedMesh et a le marqueur userData
        return mesh instanceof THREE.InstancedMesh && mesh.userData.isCarPart === true;
        // Alternative plus robuste si on veut vérifier l'appartenance exacte:
        // return Object.values(this.instancedMeshes).includes(mesh);
    }

    /**
     * Récupère l'ID de l'agent conduisant la voiture à un index d'instance donné.
     * @param {number} instanceId L'index de l'instance (provenant de l'intersection Raycaster).
     * @returns {string | undefined} L'ID de l'agent ou undefined s'il n'y a pas d'agent assigné.
     */
    getAgentIdByInstanceId(instanceId) {
        if (instanceId >= 0 && instanceId < this.maxCars) {
            return this.instanceIdToAgentId[instanceId];
        }
        return undefined;
    }
}