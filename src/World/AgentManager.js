// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js'; // Assurez-vous que le chemin est correct
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions createCapsuleGeometry, createShoeGeometry (INCHANGÉES - fournies pour complétude) ---
function createCapsuleGeometry(radius, length, radialSegments = 16, heightSegments = 1) {
    const cylinderHeight = length;
    const sphereRadius = radius;
    const geometries = [];
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, radialSegments, heightSegments);
    geometries.push(cylinderGeometry);
    const topSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    topSphereGeometry.translate(0, cylinderHeight / 2, 0);
    geometries.push(topSphereGeometry);
    const bottomSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    bottomSphereGeometry.rotateX(Math.PI);
    bottomSphereGeometry.translate(0, -cylinderHeight / 2, 0);
    geometries.push(bottomSphereGeometry);
    const mergedGeometry = mergeGeometries(geometries, false);
    geometries.forEach(geom => geom.dispose());
    return mergedGeometry;
}
function createShoeGeometry() {
    const shoeRadius = 1.2;
    const geometries = [];
    const topPartGeometry = new THREE.SphereGeometry(shoeRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    topPartGeometry.rotateX(Math.PI);
    geometries.push(topPartGeometry);
    const soleGeometry = new THREE.CircleGeometry(shoeRadius, 32);
    soleGeometry.rotateX(-Math.PI / 2);
    geometries.push(soleGeometry);
    let mergedGeometry = mergeGeometries(geometries, false);
    geometries.forEach(geom => geom.dispose());
    mergedGeometry.scale(1.0, 0.6, 1.5);
    return mergedGeometry;
}
// --- FIN Fonctions Géométrie ---

export default class AgentManager {
    // --- MODIFIÉ : Stocke experience, config ---
    constructor(scene, experience, config, maxAgents = 500) {
        if (!experience || !config) {
            throw new Error("AgentManager requires Experience and Config instances.");
        }
        this.scene = scene;
        this.experience = experience; // Stocker la référence à l'expérience
        this.config = config; // Stocker la config (pour agentScale, yOffset, etc.)
        this.maxAgents = 1;

        this.agents = []; // Contiendra les instances logiques d'Agent
        this.instanceMeshes = {}; // Stockera les InstancedMesh par partie
        this.baseGeometries = {}; // Géométries uniques
        this.baseMaterials = {}; // Matériaux uniques

        // --- Objets temporaires pour les calculs (performance - inchangé) ---
        this.tempMatrix = new THREE.Matrix4();
        this.agentMatrix = new THREE.Matrix4();
        this.partOffsetMatrix = new THREE.Matrix4();
        this.animationMatrix = new THREE.Matrix4();
        this.finalPartMatrix = new THREE.Matrix4();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3(1, 1, 1);
        this.tempColor = new THREE.Color();

        // Initialiser les meshes instanciés
        this._initializeMeshes();
        console.log("AgentManager initialisé.");
    }
    // --- FIN MODIFIÉ ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    _initializeMeshes() {
        console.log("AgentManager: Initialisation des InstancedMesh...");

        // 1. Matériaux de base
        this.baseMaterials.skin = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1, name: 'AgentSkinMat' });
        this.baseMaterials.torso = new THREE.MeshStandardMaterial({ color: 0x800080, roughness: 0.5, metalness: 0.2, name: 'AgentTorsoMat', vertexColors: true }); // Activer vertexColors si instanceColor est utilisé
        this.baseMaterials.hand = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1, name: 'AgentHandMat' });
        this.baseMaterials.shoe = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.7, metalness: 0.1, name: 'AgentShoeMat' });

        // 2. Géométries de base
        const headRadius = 2.5; const headLength = 1;
        const torsoRadius = 1.5; const torsoLength = 1.5;
        const handRadius = 0.8; const handLength = 1.0;
        this.baseGeometries.head = createCapsuleGeometry(headRadius, headLength, 32);
        this.baseGeometries.torso = createCapsuleGeometry(torsoRadius, torsoLength, 24);
        this.baseGeometries.hand = createCapsuleGeometry(handRadius, handLength, 12);
        this.baseGeometries.shoe = createShoeGeometry();

        // 3. Créer les InstancedMesh
        const createInstMesh = (name, geom, mat, count) => {
            const mesh = new THREE.InstancedMesh(geom, mat.clone(), count); // Cloner le matériau pour chaque mesh
            mesh.castShadow = true;
            mesh.receiveShadow = true; // Les agents peuvent recevoir des ombres
            mesh.name = `${name}Instances`;
             // Activer instanceColor SEULEMENT pour le torse
             if (name === 'torso') {
                 // Allouer le buffer pour les couleurs d'instance
                 mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
                 // Initialiser toutes les couleurs (ex: blanc par défaut)
                 /* for (let i = 0; i < count; i++) {
                      mesh.setColorAt(i, new THREE.Color(1, 1, 1));
                  }
                  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; */
             }
            this.scene.add(mesh);
            this.instanceMeshes[name] = mesh;
        };

        // Créer avec les bonnes tailles
        createInstMesh('head', this.baseGeometries.head, this.baseMaterials.skin, this.maxAgents);
        createInstMesh('torso', this.baseGeometries.torso, this.baseMaterials.torso, this.maxAgents);
        createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2); // 2 mains par agent
        createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2); // 2 pieds par agent

        console.log(`AgentManager: ${Object.keys(this.instanceMeshes).length} InstancedMesh créés (Max Agents: ${this.maxAgents}).`);
    }
    // --- FIN INCHANGÉ ---

    // --- MODIFIÉ : Crée agent logique, enregistre, assigne via CityManager ---
    createAgent() { // Ne prend plus startPosition en argument direct
        if (this.agents.length >= this.maxAgents) {
            console.warn("AgentManager: Nombre maximum d'agents atteint.");
            return null;
        }

        const instanceId = this.agents.length; // ID pour l'index dans InstancedMesh

        // --- Config spécifique pour cet agent ---
        const agentConfig = {
            // Lire depuis this.config (passé au constructeur AgentManager)
            scale: this.config.agentScale,
            speed: (this.config.agentWalkSpeed / 15) + (Math.random() - 0.5) * 0.5, // Vitesse basée sur config, avec variation
            rotationSpeed: this.config.agentRotationSpeed + (Math.random() - 0.5) * 2.0, // Rotation basée sur config, avec variation
            yOffset: this.config.agentYOffset, // Offset vertical pour la position logique
            torsoColor: new THREE.Color(Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1).getHex(), // Couleur aléatoire mais pas trop sombre/claire
            debugPathColor: null // Sera défini par World si besoin pour debug
        };

        // --- Créer l'instance logique Agent ---
        // Passe la référence à l'Experience pour qu'il puisse accéder aux autres managers
        const newAgent = new Agent(agentConfig, instanceId, this.experience);

        // --- Enregistrement et Assignation Domicile/Travail via CityManager ---
        const cityManager = this.experience.world?.cityManager;
        let success = false;
        if (cityManager) {
            // 1. Enregistrer le citoyen (lie l'ID de l'agent logique au registre global)
            const citizenInfo = cityManager.registerCitizen(newAgent.id, newAgent);

            // 2. Tenter d'assigner un domicile
            const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);

            // 3. Tenter d'assigner un lieu de travail
            const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);

            // 4. Initialiser le cycle de vie de l'agent SI domicile ET travail trouvés
            if (homeAssigned && workAssigned) {
                 // initializeLifecycle récupère les positions et place l'agent
                 newAgent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId);
                 success = true; // L'agent est prêt pour sa routine
            } else {
                 // Si l'assignation échoue, l'agent reste en état IDLE (géré dans initializeLifecycle)
                 console.warn(`Agent ${newAgent.id} n'a pas pu être entièrement initialisé (Domicile: ${homeAssigned}, Travail: ${workAssigned}). Il restera en IDLE.`);
                 newAgent.currentState = 'IDLE'; // Assurer l'état IDLE
                 newAgent.isVisible = false;
                 // On pourrait choisir de ne pas ajouter cet agent à la liste gérée,
                 // mais le garder permet de voir les échecs d'assignation.
                 // Il faut juste s'assurer que l'état IDLE ne cause pas de problème.
                 // Optionnel : Retirer du registre citizen ?
                 // cityManager.citizens.delete(citizenInfo.id);
            }
        } else {
            console.error(`AgentManager: CityManager non trouvé pour l'agent ${newAgent.id}. Agent reste IDLE.`);
            newAgent.currentState = 'IDLE';
            newAgent.isVisible = false;
        }
        // --- Fin Enregistrement/Assignation ---

        // Ajouter l'agent logique à la liste gérée, même s'il est IDLE
        this.agents.push(newAgent);

        // --- Initialiser la couleur du torse dans InstancedMesh ---
        if (this.instanceMeshes.torso.instanceColor) {
            this.tempColor.setHex(newAgent.torsoColor.getHex()); // Utiliser la couleur de l'agent
            this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
            this.instanceMeshes.torso.instanceColor.needsUpdate = true; // Marquer pour update
        }

        // --- Initialiser les matrices à une échelle NULLE (agent caché au début) ---
        this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0)); // Matrice échelle nulle
        Object.values(this.instanceMeshes).forEach(mesh => {
            // Appliquer aux bons indices (1 pour tête/torse, 2 pour mains/pieds)
            const indicesToUpdate = (mesh.name.includes('hand') || mesh.name.includes('shoe'))
                ? [instanceId * 2, instanceId * 2 + 1]
                : [instanceId];

            indicesToUpdate.forEach(index => {
                 if (index < mesh.count) { // Vérifier les limites
                     mesh.setMatrixAt(index, this.tempMatrix);
                 }
            });
            // Marquer la matrice d'instance pour mise à jour GPU
            if(mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
        });

        console.log(`Agent ${newAgent.id} (Instance ${instanceId}) créé. Initial State: ${newAgent.currentState}. Success: ${success}`);
        return newAgent; // Retourner l'agent logique
    }
    // --- FIN MODIFIÉ ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    getAgentById(id) {
        // Recherche par l'ID unique de l'agent logique (ex: "citizen_X")
        return this.agents.find(agent => agent.id === id);
    }
    // --- FIN INCHANGÉ ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    _getPartAnimationMatrix(partType, time) {
        this.animationMatrix.identity(); // Réinitialiser

        // Lire les paramètres depuis la config
        const walkSpeed = this.config.agentWalkSpeed ?? 2.5;
        const bobAmplitude = this.config.agentBobAmplitude ?? 0.15;
        const stepLength = this.config.agentStepLength ?? 1.5;
        const stepHeight = this.config.agentStepHeight ?? 0.7;
        const swingAmplitude = this.config.agentSwingAmplitude ?? 1.2;
        const ankleRotationAmplitude = this.config.agentAnkleRotationAmplitude ?? Math.PI / 8;
        const handTiltAmplitude = this.config.agentHandTiltAmplitude ?? 0.2;
        const headNodAmplitude = this.config.agentHeadNodAmplitude ?? 0.05;
        const headYawAmplitude = this.config.agentHeadYawAmplitude ?? 0.1;
        const headTiltAmplitude = this.config.agentHeadTiltAmplitude ?? 0.08;
        const headBobAmplitude = this.config.agentHeadBobAmplitude ?? 0.06;

        const walkTime = time * walkSpeed;

        let animPosX = 0, animPosY = 0, animPosZ = 0;
        let animRotX = 0, animRotY = 0, animRotZ = 0;
        let applyRotation = false;

        const torsoBobY = Math.sin(walkTime * 2) * bobAmplitude;

        switch (partType) {
            case 'torso':
                animPosY = torsoBobY;
                break;
            case 'head':
                animPosY = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * headBobAmplitude);
                // Rotations tête (peuvent être réactivées si besoin)
                // animRotX = Math.sin(walkTime) * headNodAmplitude;
                // animRotY = Math.sin(walkTime * 0.8) * headYawAmplitude; // Rythme légèrement différent
                // animRotZ = Math.cos(walkTime * 1.2) * headTiltAmplitude;
                // applyRotation = true;
                break;
            case 'leftFoot':
                animPosZ = Math.sin(walkTime) * stepLength;
                animPosY = Math.max(0, Math.cos(walkTime)) * stepHeight;
                animRotX = Math.sin(walkTime) * ankleRotationAmplitude;
                applyRotation = true;
                break;
            case 'rightFoot':
                animPosZ = Math.sin(walkTime + Math.PI) * stepLength;
                animPosY = Math.max(0, Math.cos(walkTime + Math.PI)) * stepHeight;
                animRotX = Math.sin(walkTime + Math.PI) * ankleRotationAmplitude;
                applyRotation = true;
                break;
            case 'leftHand':
                animPosZ = Math.sin(walkTime + Math.PI) * swingAmplitude; // Opposé pied droit
                animPosY = torsoBobY;
                animRotZ = Math.sin(walkTime * 1.8) * handTiltAmplitude;
                applyRotation = true;
                break;
            case 'rightHand':
                animPosZ = Math.sin(walkTime) * swingAmplitude;      // Opposé pied gauche
                animPosY = torsoBobY;
                animRotZ = Math.cos(walkTime * 1.8 + 0.5) * handTiltAmplitude;
                applyRotation = true;
                break;
        }

        this.tempPosition.set(animPosX, animPosY, animPosZ);
        if (applyRotation) {
            this.tempQuaternion.setFromEuler(new THREE.Euler(animRotX, animRotY, animRotZ, 'XYZ')); // Préciser l'ordre
        } else {
            this.tempQuaternion.identity();
        }
        this.tempScale.set(1, 1, 1); // L'animation ne change pas l'échelle locale

        this.animationMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        return this.animationMatrix;
    }
    // --- FIN INCHANGÉ ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    _getPartLocalOffsetMatrix(partType) {
        this.partOffsetMatrix.identity();
        // Positions de base relatives au centre de l'agent (0,0,0)
        const headY = 6.0;
        const torsoY = 0; // Torse est à l'origine
        const handX = 3.0; // Distance latérale des mains
        const handY = 1.0; // Hauteur des mains
        const handBaseRotZ = Math.PI / 12; // Inclinaison de base des mains
        const footX = 1.8; // Distance latérale des pieds
        const footY = -3.5; // Hauteur des pieds (négatif)
        const footZ = 0.5; // Position avant/arrière de base des pieds

        switch (partType) {
            case 'head':
                this.partOffsetMatrix.makeTranslation(0, headY, 0);
                break;
            case 'torso':
                // Reste à l'identité (ou makeTranslation(0, torsoY, 0))
                break;
            case 'leftHand':
                 this.tempPosition.set(-handX, handY, 0);
                 this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, -handBaseRotZ)); // Inclinaison Z négative
                 this.tempScale.set(1,1,1);
                 this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                break;
            case 'rightHand':
                 this.tempPosition.set(handX, handY, 0);
                 this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, handBaseRotZ)); // Inclinaison Z positive
                 this.tempScale.set(1,1,1);
                 this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                break;
            case 'leftFoot':
                this.partOffsetMatrix.makeTranslation(-footX, footY, footZ);
                break;
            case 'rightFoot':
                this.partOffsetMatrix.makeTranslation(footX, footY, footZ);
                break;
        }
        return this.partOffsetMatrix;
    }
    // --- FIN INCHANGÉ ---

    // --- MODIFIÉ : Passe l'heure, gère visibilité via scale ---
    update(deltaTime) {
        // --- Vérification des dépendances ---
        if (!this.experience || !this.experience.world || !this.experience.world.environment) {
            console.warn("AgentManager.update: Dépendances (experience, world, environment) non prêtes.");
            return; // Attendre que tout soit prêt
        }
        const environment = this.experience.world.environment;
        if (!environment.isInitialized) {
             console.warn("AgentManager.update: Environment non initialisé.");
             return;
        }

        // --- Obtenir l'heure actuelle (0-23) ---
        const currentHour = environment.getCurrentHour(); // Utiliser le getter
        // --------------------------------------

        const elapsedTime = this.experience.time.elapsed / 1000; // Pour l'animation des membres
        // const yOffset = this.config.agentYOffset || 0; // L'offset est maintenant dans agent.position

        let needsMatrixUpdate = false; // Drapeau pour savoir si une MAJ GPU est nécessaire
        let needsColorUpdate = this.instanceMeshes.torso.instanceColor?.needsUpdate || false; // Garder trace MAJ couleur

        // --- Boucle sur les agents logiques ---
        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            const instanceId = agent.instanceId; // Index pour les InstancedMesh

            // 1. Mise à jour logique de l'agent (état, position, orientation)
            agent.update(deltaTime, currentHour); // Passe l'heure actuelle

            // 2. Calcul de la matrice de base de l'agent pour le rendu
            this.tempPosition.copy(agent.position); // Utilise la position logique (qui inclut déjà yOffset)
            // Utiliser l'échelle de l'agent, ou 0 si isVisible est faux
            const actualScale = agent.isVisible ? agent.scale : 0;
            this.tempScale.set(actualScale, actualScale, actualScale);

            // Composer la matrice de l'agent (position, orientation, échelle)
            this.agentMatrix.compose(this.tempPosition, agent.orientation, this.tempScale);

            // 3. Calculer et définir la matrice pour chaque partie du corps
            const calculateAndSetPartMatrix = (partName, meshName, indexMultiplier = 1, indexOffset = 0) => {
                 const localOffsetMatrix = this._getPartLocalOffsetMatrix(partName); // Décalage local de la partie
                 const animationMatrix = this._getPartAnimationMatrix(partName, elapsedTime); // Animation de la partie

                 // Ordre: Animation appliquée à l'offset local, puis transformation globale de l'agent
                 // finalPartMatrix = agentMatrix * localOffsetMatrix * animationMatrix
                 this.tempMatrix.multiplyMatrices(localOffsetMatrix, animationMatrix); // Combine offset local et animation
                 this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix); // Applique la transformation globale (position, orientation, échelle)

                 // Définir la matrice dans l'InstancedMesh correspondant
                 const finalInstanceIndex = instanceId * indexMultiplier + indexOffset;
                 if (finalInstanceIndex < this.instanceMeshes[meshName].count) {
                    this.instanceMeshes[meshName].setMatrixAt(finalInstanceIndex, this.finalPartMatrix);
                    needsMatrixUpdate = true; // Marquer qu'au moins une matrice a changé
                 } else {
                     console.error(`AgentManager: Tentative d'accès à l'index invalide ${finalInstanceIndex} pour ${meshName} (Agent ${instanceId}, Max: ${this.instanceMeshes[meshName].count})`);
                 }
            };

            // Appeler pour chaque partie
            calculateAndSetPartMatrix('head', 'head');
            calculateAndSetPartMatrix('torso', 'torso');
            calculateAndSetPartMatrix('leftHand', 'hand', 2, 0); // index = id * 2 + 0
            calculateAndSetPartMatrix('rightHand', 'hand', 2, 1); // index = id * 2 + 1
            calculateAndSetPartMatrix('leftFoot', 'shoe', 2, 0); // index = id * 2 + 0
            calculateAndSetPartMatrix('rightFoot', 'shoe', 2, 1); // index = id * 2 + 1

            // 4. Mise à jour couleur torse (si nécessaire)
             if (this.instanceMeshes.torso.instanceColor) {
                 // Vérifier si la couleur a changé ? Pour l'instant, on met à jour si le flag est activé.
                 // Si on ne change jamais la couleur après l'init, on peut optimiser.
                this.tempColor.setHex(agent.torsoColor.getHex());
                this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
                needsColorUpdate = true; // Assurer que le flag est bien positionné
             }
        } // Fin boucle agents

        // 5. Marquer les InstancedMesh pour mise à jour GPU si nécessaire
        if (needsMatrixUpdate) {
            Object.values(this.instanceMeshes).forEach(mesh => {
                 if(mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
            });
        }
         // Marquer la couleur si besoin (fait après la boucle pour une seule MAJ)
         if (needsColorUpdate && this.instanceMeshes.torso.instanceColor) {
            this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Nettoie les citoyens du registre ---
    destroy() {
        console.log("AgentManager: Destruction...");

        // 1. Retirer les meshes de la scène
        Object.values(this.instanceMeshes).forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            // La géométrie est partagée (baseGeometries), disposée ci-dessous.
            // Le matériau a été cloné pour chaque mesh, il faut le disposer.
            if (mesh.material && typeof mesh.material.dispose === 'function') {
                mesh.material.dispose();
            }
        });
        this.instanceMeshes = {}; // Vider la référence

        // 2. Disposer les géométries de base uniques
        Object.values(this.baseGeometries).forEach(geom => {
             if (geom && typeof geom.dispose === 'function') geom.dispose();
        });
        this.baseGeometries = {};
        console.log("AgentManager: Géométries de base disposées.");

        // 3. Disposer les matériaux de base uniques
        Object.values(this.baseMaterials).forEach(mat => {
            if (mat && typeof mat.dispose === 'function') mat.dispose();
        });
        this.baseMaterials = {};
        console.log("AgentManager: Matériaux de base disposés.");

        // 4. Nettoyer les agents logiques ET les références dans CityManager
        const cityManager = this.experience?.world?.cityManager;
        this.agents.forEach(agent => {
            // Retirer la référence du citoyen dans le registre global si elle existe
            if (cityManager && cityManager.citizens && cityManager.citizens.has(agent.id)) {
                 cityManager.citizens.delete(agent.id);
                 // Faut-il aussi le retirer de la liste 'occupants' des bâtiments ? Oui, idéalement.
                 const citizenInfo = cityManager.getCitizenInfo(agent.id); // Récupérer avant delete
                 if(citizenInfo) {
                     if(citizenInfo.homeBuildingId) cityManager.getBuildingInfo(citizenInfo.homeBuildingId)?.occupants.splice(cityManager.getBuildingInfo(citizenInfo.homeBuildingId).occupants.indexOf(agent.id), 1);
                     if(citizenInfo.workBuildingId) cityManager.getBuildingInfo(citizenInfo.workBuildingId)?.occupants.splice(cityManager.getBuildingInfo(citizenInfo.workBuildingId).occupants.indexOf(agent.id), 1);
                 }

            }
            // Détruire l'agent logique (qui libère sa référence à 'experience')
            agent.destroy();
        });
        this.agents = []; // Vider la liste locale
        console.log("AgentManager: Agents logiques détruits et références nettoyées.");

        // 5. Nullifier les références internes
        this.scene = null;
        this.experience = null;
        this.config = null;
        console.log("AgentManager: Détruit.");
    }
    // --- FIN MODIFIÉ ---
}