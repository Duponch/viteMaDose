// src/World/CarManager.js
import * as THREE from 'three';
import Car from './Car.js';
import { createLowPolyCarGeometry } from './LowPolyCarGeometry.js';
import { getCarColorById } from './CarColors.js';

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
        
        // Stockage des couleurs pour chaque voiture
        this.carColors = new Array(this.maxCars);
        for (let i = 0; i < this.maxCars; i++) {
            this.carColors[i] = getCarColorById(i);
        }
        // --- FIN MODIFIÉ ---

        // --- NOUVEAU : Initialisation des matériaux et géométries ---
        this.materials = {
            lightConeMaterial: new THREE.MeshBasicMaterial({
                color: 0xFFFF99,
                transparent: true,
                opacity: 0.0015,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        };

        // Création de la géométrie du cône de lumière
        const coneHeight = 5.0; // Longueur du cône (maintenant dans l'axe Z)
        const coneRadiusBottom = 1.0; // Rayon à la base réduit
        const coneRadialSegments = 16;
        this.lightConeGeometry = new THREE.ConeGeometry(
            coneRadiusBottom,
            coneHeight,
            coneRadialSegments,
            1,
            true
        );
        // Rotation pour orienter le cône horizontalement (axe Y vers Z) et le tourner de 180°
        this.lightConeGeometry.rotateX(Math.PI / 2);
        this.lightConeGeometry.rotateY(Math.PI); // Rotation de 180° pour inverser le sens
        // Centre le cône sur son axe
        this.lightConeGeometry.translate(0, 0, -coneHeight / 2); // Négatif car on a tourné de 180°
        this.lightConeGeometry.computeBoundingBox();

        // --- NOUVEAU : Utiliser la géométrie fusionnée low-poly PAR MATÉRIAU ---
        const carGeoms = createLowPolyCarGeometry();
        this.instancedMeshes = {};
        this.carMeshOrder = [
            'body', 'windows', 'wheels', 'hubcaps', 'lights', 'rearLights', 'lightCones'
        ];

        this.roadHeight = 0.05;

        // Initialisation des InstancedMesh
        for (const part of this.carMeshOrder) {
            if (part === 'lightCones') {
                // Pour les cônes de lumière, on utilise la géométrie et le matériau créés spécifiquement
                const lightConeMesh = new THREE.InstancedMesh(
                    this.lightConeGeometry,
                    this.materials.lightConeMaterial,
                    this.maxCars * 2 // Double car on a deux cônes par voiture
                );
                lightConeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                lightConeMesh.castShadow = false;
                lightConeMesh.receiveShadow = false;
                lightConeMesh.name = "Cars_LightCones";
                lightConeMesh.frustumCulled = false;
                lightConeMesh.renderOrder = 1;
                lightConeMesh.userData.isCarPart = true;
                lightConeMesh.visible = false; // Initialement invisible
                this.scene.add(lightConeMesh);
                this.instancedMeshes[part] = lightConeMesh;
            } else {
                const { geometry, material } = carGeoms[part];
                const mesh = new THREE.InstancedMesh(geometry, material, this.maxCars);
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.name = `Cars_${part}`;
                mesh.frustumCulled = false;
                mesh.renderOrder = 1;
                mesh.userData.isCarPart = true;
                
                // Préparer la personnalisation des couleurs pour InstancedMesh
                if (part === 'body') {
                    // Activer les instances colors pour l'InstancedMesh du corps
                    mesh.instanceColor = new THREE.InstancedBufferAttribute(
                        new Float32Array(this.maxCars * 3), 3
                    );
                    
                    // Initialiser les couleurs pour chaque instance
                    for (let i = 0; i < this.maxCars; i++) {
                        const color = new THREE.Color(this.carColors[i]);
                        mesh.setColorAt(i, color);
                    }
                }
                
                this.scene.add(mesh);
                mesh.computeBoundingSphere();
                mesh.computeBoundingBox();
                mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
                this.instancedMeshes[part] = mesh;
            }
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
            
            // Assurer que la couleur est correctement définie (pour la carrosserie)
            if (part === 'body' && this.instancedMeshes[part].instanceColor) {
                const color = new THREE.Color(this.carColors[availableCarIndex]);
                this.instancedMeshes[part].setColorAt(availableCarIndex, color);
                this.instancedMeshes[part].instanceColor.needsUpdate = true;
            }
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
                    if (part === 'lightCones') {
                        // Pour les cônes de lumière, on utilise une matrice spéciale
                        const coneMatrix1 = new THREE.Matrix4();
                        const coneMatrix2 = new THREE.Matrix4();
                        coneMatrix1.copy(car.matrix);
                        coneMatrix2.copy(car.matrix);
                        
                        // Position des phares (à ajuster selon le modèle de voiture)
                        const phareGauche = new THREE.Vector3(-0.7, 0.65, 6.5); // Décalage vers la gauche et l'avant
                        const phareDroit = new THREE.Vector3(0.7, 0.65, 6.5);  // Décalage vers la droite et l'avant
                        
                        // Appliquer la transformation de la voiture aux positions des phares
                        phareGauche.applyMatrix4(car.matrix);
                        phareDroit.applyMatrix4(car.matrix);
                        
                        // Définir les matrices pour les deux cônes
                        coneMatrix1.setPosition(phareGauche.x, phareGauche.y, phareGauche.z);
                        coneMatrix2.setPosition(phareDroit.x, phareDroit.y, phareDroit.z);
                        
                        // Mettre à jour les deux instances (une pour chaque phare)
                        this.instancedMeshes[part].setMatrixAt(i * 2, coneMatrix1);
                        this.instancedMeshes[part].setMatrixAt(i * 2 + 1, coneMatrix2);
                    } else {
                        this.instancedMeshes[part].setMatrixAt(i, car.matrix);
                    }
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

    /**
     * Met à jour l'intensité émissive des phares en fonction de l'heure.
     * @param {number} currentHour - L'heure actuelle (0-23).
     */
    updateCarLights(currentHour) {
        const lightsOn = (currentHour >= 18 || currentHour < 6);
        const targetIntensity = lightsOn ? 1 : 0.0;

        // Mettre à jour les phares avant
        const headlightsMesh = this.instancedMeshes.lights;
        if (headlightsMesh && headlightsMesh.material) {
            if (headlightsMesh.material.emissiveIntensity !== targetIntensity) {
                headlightsMesh.material.emissiveIntensity = targetIntensity;
                headlightsMesh.material.needsUpdate = true;
            }
        }

        // Mettre à jour les feux arrière (toujours allumés)
        const rearLightsMesh = this.instancedMeshes.rearLights;
        if (rearLightsMesh && rearLightsMesh.material) {
            if (rearLightsMesh.material.emissiveIntensity !== 0.6) {
                rearLightsMesh.material.emissiveIntensity = 0.6;
                rearLightsMesh.material.needsUpdate = true;
            }
        }

        // Mettre à jour la visibilité des cônes de lumière
        const lightConesMesh = this.instancedMeshes.lightCones;
        if (lightConesMesh) {
            lightConesMesh.visible = lightsOn;
        }
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
        // Nettoyer la géométrie du cône de lumière
        if (this.lightConeGeometry) {
            this.lightConeGeometry.dispose();
        }
        // Nettoyer les matériaux
        if (this.materials) {
            Object.values(this.materials).forEach(material => {
                if (material && typeof material.dispose === 'function') {
                    material.dispose();
                }
            });
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

    /**
     * Récupère l'instance Car associée à un agentId.
     * @param {string} agentId - L'ID de l'agent.
     * @returns {Car | undefined} L'instance Car ou undefined si non trouvée.
     */
    getCarByAgentId(agentId) {
        return this.agentToCar.get(agentId);
    }
}