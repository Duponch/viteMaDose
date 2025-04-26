// src/World/CarManager.js
import * as THREE from 'three';
import Car from './Car.js';

export default class CarManager {
    constructor(scene, experience) {
        this.scene = scene;
        this.experience = experience;
        this.cars = [];
        
        // Nombre maximal de voitures dans le jeu (à ajuster selon les performances)
        this.maxCars = 50;
        
        // Matériau et géométrie pour les voitures (simples cubes rouges pour l'instant)
        this.carGeometry = new THREE.BoxGeometry(1.0, 0.5, 2.0);
        this.carMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff0000,
            roughness: 0.5,
            metalness: 0.2
        });
        
        // InstancedMesh pour les voitures
        this.carInstancedMesh = new THREE.InstancedMesh(
            this.carGeometry,
            this.carMaterial,
            this.maxCars
        );
        this.carInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.carInstancedMesh.castShadow = true;
        this.carInstancedMesh.receiveShadow = true;
        this.carInstancedMesh.name = "Cars";
        
        // Ajouter l'InstancedMesh à la scène
        this.scene.add(this.carInstancedMesh);
        
        // Variables temporaires pour éviter la création d'objets à chaque frame
        this.tempMatrix = new THREE.Matrix4();
        
        // Map pour associer les agents à leurs voitures
        this.agentToCar = new Map();
        
        // Hauteur de la route (légèrement au-dessus pour éviter le clipping)
        this.roadHeight = 0.05;
        
        console.log("CarManager initialisé");
    }
    
    /**
     * Crée une voiture pour un agent spécifique
     * @param {Object} agent - L'agent qui utilisera la voiture
     * @param {THREE.Vector3} startPosition - Position de départ de la voiture
     * @param {THREE.Vector3} targetPosition - Position cible où la voiture doit se rendre
     * @returns {Car} - La voiture créée ou null si impossible
     */
    createCarForAgent(agent, startPosition, targetPosition) {
        // Vérifier si l'agent a déjà une voiture
        if (this.agentToCar.has(agent.id)) {
            return this.agentToCar.get(agent.id);
        }
        
        // Vérifier si nous avons atteint le nombre maximal de voitures
        if (this.cars.length >= this.maxCars) {
            console.warn("Nombre maximal de voitures atteint");
            return null;
        }
        
        // Créer une nouvelle voiture
        const carIndex = this.cars.length;
        const car = new Car(carIndex, this.experience, startPosition, targetPosition);
        
        // Associer la voiture à l'agent
        this.agentToCar.set(agent.id, car);
        
        // Ajouter la voiture à notre liste
        this.cars.push(car);
        
        // Mise à jour du nombre d'instances rendues
        this.carInstancedMesh.count = this.cars.length;
        
        return car;
    }
    
    /**
     * Récupère la voiture associée à un agent
     * @param {string} agentId - ID de l'agent
     * @returns {Car|null} - La voiture associée ou null
     */
    getCarForAgent(agentId) {
        return this.agentToCar.get(agentId) || null;
    }
    
    /**
     * Indique si un agent possède une voiture
     * @param {string} agentId - ID de l'agent
     * @returns {boolean} - true si l'agent a une voiture
     */
    hasCarForAgent(agentId) {
        return this.agentToCar.has(agentId);
    }
    
    /**
     * Libère une voiture associée à un agent
     * @param {string} agentId - ID de l'agent
     */
    releaseCarForAgent(agentId) {
        const car = this.agentToCar.get(agentId);
        if (car) {
            // Marquer la voiture comme inactive
            car.isActive = false;
            
            // Supprimer l'association agent-voiture
            this.agentToCar.delete(agentId);
            
            // Réinitialiser la matrice pour cette instance
            this.tempMatrix.identity();
            this.carInstancedMesh.setMatrixAt(car.instanceId, this.tempMatrix);
            this.carInstancedMesh.instanceMatrix.needsUpdate = true;
            
            console.log(`Voiture libérée pour l'agent ${agentId}`);
        }
    }
    
    /**
     * Met à jour toutes les voitures actives
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame
     */
    update(deltaTime) {
        let needsMatrixUpdate = false;
        let activeCarCount = 0;
        
        // Mettre à jour chaque voiture active
        for (const car of this.cars) {
            if (car.isActive) {
                activeCarCount++;
                car.update(deltaTime);
                
                // Mettre à jour la matrice de l'instance
                car.updateMatrix();
                this.carInstancedMesh.setMatrixAt(car.instanceId, car.matrix);
                needsMatrixUpdate = true;
            }
        }
        
        // Mettre à jour les matrices des instances si nécessaire
        if (needsMatrixUpdate) {
            this.carInstancedMesh.instanceMatrix.needsUpdate = true;
        }
        
        // Log périodique du nombre de voitures actives
        if (Math.random() < 0.005) { // ~0.5% de chance par frame
            console.log(`CarManager: ${activeCarCount} voitures actives sur ${this.cars.length} total`);
        }
    }
    
    /**
     * Nettoie les ressources lors de la destruction
     */
    destroy() {
        // Supprimer l'InstancedMesh de la scène
        if (this.carInstancedMesh.parent) {
            this.carInstancedMesh.parent.remove(this.carInstancedMesh);
        }
        
        // Disposer de la géométrie et du matériau
        this.carGeometry.dispose();
        this.carMaterial.dispose();
        
        // Vider les listes et maps
        this.cars = [];
        this.agentToCar.clear();
        
        console.log("CarManager détruit");
    }
} 