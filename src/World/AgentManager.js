/*
 * Fichier: src/World/AgentManager.js
 * Correction: headRadius est maintenant une propriété de classe (this.headRadius)
 * initialisée dans _initializeMeshes et utilisée dans update.
 */
// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions createCapsuleGeometry, createShoeGeometry (INCHANGÉES) ---
function createCapsuleGeometry(radius, length, radialSegments = 16, heightSegments = 1) { /* ... code existant ... */
    const cylinderHeight = length; const sphereRadius = radius; const geometries = [];
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, radialSegments, heightSegments); geometries.push(cylinderGeometry);
    const topSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2); topSphereGeometry.translate(0, cylinderHeight / 2, 0); geometries.push(topSphereGeometry);
    const bottomSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2); bottomSphereGeometry.rotateX(Math.PI); bottomSphereGeometry.translate(0, -cylinderHeight / 2, 0); geometries.push(bottomSphereGeometry);
    const mergedGeometry = mergeGeometries(geometries, false); geometries.forEach(geom => geom.dispose()); return mergedGeometry;
 }
function createShoeGeometry() { /* ... code existant ... */
    const shoeRadius = 1.2; const geometries = [];
    const topPartGeometry = new THREE.SphereGeometry(shoeRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); topPartGeometry.rotateX(Math.PI); geometries.push(topPartGeometry);
    const soleGeometry = new THREE.CircleGeometry(shoeRadius, 32); soleGeometry.rotateX(-Math.PI / 2); geometries.push(soleGeometry);
    let mergedGeometry = mergeGeometries(geometries, false); geometries.forEach(geom => geom.dispose()); mergedGeometry.scale(1.0, 0.6, 1.5); return mergedGeometry;
}
// --- FIN Fonctions Géométrie ---

export default class AgentManager {
    constructor(scene, experience, config, maxAgents = 1) {
        if (!experience || !config) {
            throw new Error("AgentManager requires Experience and Config instances.");
        }
        this.scene = scene;
        this.experience = experience;
        this.config = config;
        this.maxAgents = maxAgents;

        this.agents = [];
        this.instanceMeshes = {};
        this.baseGeometries = {};
        this.baseMaterials = {};

        // --- Propriétés pour géométrie (initialisées dans _initializeMeshes) ---
        this.headRadius = 2.5; // Valeur par défaut, sera écrasée
        // ---------------------------------------------------------------------

        // --- Objets temporaires ---
        this.tempMatrix = new THREE.Matrix4();
        this.agentMatrix = new THREE.Matrix4();
        this.partOffsetMatrix = new THREE.Matrix4();
        this.animationMatrix = new THREE.Matrix4();
        this.finalPartMatrix = new THREE.Matrix4();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3(1, 1, 1);
        this.tempColor = new THREE.Color();
        this.debugMarkerMatrix = new THREE.Matrix4();

        this._initializeMeshes();
        console.log("AgentManager initialisé.");
    }

    // --- MODIFIÉ ---
    _initializeMeshes() {
        console.log("AgentManager: Initialisation des InstancedMesh (Corps + Debug)...");

        // --- 1. Matériaux de base (Corps) ---
        this.baseMaterials.skin = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1, name: 'AgentSkinMat' });
        this.baseMaterials.torso = new THREE.MeshStandardMaterial({ color: 0x800080, roughness: 0.5, metalness: 0.2, name: 'AgentTorsoMat', vertexColors: true });
        this.baseMaterials.hand = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1, name: 'AgentHandMat' });
        this.baseMaterials.shoe = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.7, metalness: 0.1, name: 'AgentShoeMat' });

        // --- 2. Géométries de base (Corps) ---
        // Définir les constantes localement, mais assigner à this.headRadius
        const headRadiusConst = 2.5;
        const headLength = 1;
        const torsoRadius = 1.5; const torsoLength = 1.5;
        const handRadius = 0.8; const handLength = 1.0;

        // Assignation à la propriété de classe
        this.headRadius = headRadiusConst;

        this.baseGeometries.head = createCapsuleGeometry(this.headRadius, headLength, 32); // Utilise this.headRadius
        this.baseGeometries.torso = createCapsuleGeometry(torsoRadius, torsoLength, 24);
        this.baseGeometries.hand = createCapsuleGeometry(handRadius, handLength, 12);
        this.baseGeometries.shoe = createShoeGeometry();

        // --- 3. Géométries et Matériaux de base (Debug Markers) ---
        const markerSize = 7;
        this.baseGeometries.debugMarker = new THREE.OctahedronGeometry(markerSize, 0);
        this.baseMaterials.agentMarkerMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, name: 'AgentMarkerMat' }); // Bleu
        this.baseMaterials.homeMarkerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, name: 'HomeMarkerMat' }); // Vert
        this.baseMaterials.workMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, name: 'WorkMarkerMat' }); // Rouge

        // --- 4. Créer les InstancedMesh (Corps + Debug) ---
        const createInstMesh = (name, geom, mat, count, needsColor = false) => {
            const mesh = new THREE.InstancedMesh(geom, mat.clone(), count);
            mesh.castShadow = (name !== 'agentMarker' && name !== 'homeMarker' && name !== 'workMarker');
            mesh.receiveShadow = (name !== 'agentMarker' && name !== 'homeMarker' && name !== 'workMarker');
            mesh.name = `${name}Instances`;
            mesh.frustumCulled = false;

             if (needsColor) {
                 mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
             }
            this.scene.add(mesh);
            this.instanceMeshes[name] = mesh;
        };

        // Créer meshes corps
        createInstMesh('head', this.baseGeometries.head, this.baseMaterials.skin, this.maxAgents);
        createInstMesh('torso', this.baseGeometries.torso, this.baseMaterials.torso, this.maxAgents, true);
        createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2);
        createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2);

        // Créer meshes debug markers
        createInstMesh('agentMarker', this.baseGeometries.debugMarker, this.baseMaterials.agentMarkerMat, this.maxAgents);
        createInstMesh('homeMarker', this.baseGeometries.debugMarker, this.baseMaterials.homeMarkerMat, this.maxAgents);
        createInstMesh('workMarker', this.baseGeometries.debugMarker, this.baseMaterials.workMarkerMat, this.maxAgents);

        console.log(`AgentManager: ${Object.keys(this.instanceMeshes).length} InstancedMesh créés (Max Agents: ${this.maxAgents}).`);
    }
    // --- FIN MODIFIÉ ---

    createAgent() {
        if (this.agents.length >= this.maxAgents) {
            console.warn("AgentManager: Nombre maximum d'agents atteint.");
            return null;
        }

        const instanceId = this.agents.length;

        // Config agent
        const agentConfig = {
            scale: this.config.agentScale ?? 0.1,
            speed: (this.config.agentWalkSpeed / 15) + (Math.random() - 0.5) * 0.5,
            rotationSpeed: this.config.agentRotationSpeed + (Math.random() - 0.5) * 2.0,
            yOffset: this.config.agentYOffset ?? 0.3,
            torsoColor: new THREE.Color(Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1),
            debugPathColor: null
        };
        agentConfig.torsoColorHex = agentConfig.torsoColor.getHex();

        // Créer agent logique
        const newAgent = new Agent(agentConfig, instanceId, this.experience);

        // Enregistrement & Assignation
        const cityManager = this.experience.world?.cityManager;
        let success = false;
        if (cityManager) {
            const citizenInfo = cityManager.registerCitizen(newAgent.id, newAgent);
            const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);
            const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);
            if (homeAssigned && workAssigned) {
                 newAgent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId);
                 success = true;
            } else {
                 console.warn(`Agent ${newAgent.id} non initialisé (Home:${homeAssigned}, Work:${workAssigned}). Reste IDLE.`);
                 newAgent.currentState = 'IDLE';
                 newAgent.isVisible = false;
            }
        } else {
            console.error(`AgentManager: CityManager non trouvé pour ${newAgent.id}. Agent IDLE.`);
            newAgent.currentState = 'IDLE';
            newAgent.isVisible = false;
        }

        this.agents.push(newAgent);

        // Initialiser couleur torse
        if (this.instanceMeshes.torso.instanceColor) {
            this.tempColor.setHex(agentConfig.torsoColorHex);
            this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
            this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }

        // Initialiser TOUTES les matrices à échelle NULLE
        this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
        Object.values(this.instanceMeshes).forEach(mesh => {
            const indicesToUpdate = (mesh.name.includes('hand') || mesh.name.includes('shoe'))
                ? [instanceId * 2, instanceId * 2 + 1]
                : [instanceId];

            indicesToUpdate.forEach(index => {
                 if (index < mesh.count) {
                     mesh.setMatrixAt(index, this.tempMatrix);
                 }
            });
            if(mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
        });

        console.log(`Agent ${newAgent.id} (Inst ${instanceId}) créé. State: ${newAgent.currentState}. Success: ${success}`);
        return newAgent;
    }

    getAgentById(id) {
        return this.agents.find(agent => agent.id === id);
    }

    _getPartAnimationMatrix(partType, time) { /* ... code existant inchangé ... */
        this.animationMatrix.identity();
        const walkSpeed = this.config.agentWalkSpeed ?? 2.5; const bobAmplitude = this.config.agentBobAmplitude ?? 0.15; const stepLength = this.config.agentStepLength ?? 1.5; const stepHeight = this.config.agentStepHeight ?? 0.7; const swingAmplitude = this.config.agentSwingAmplitude ?? 1.2; const ankleRotationAmplitude = this.config.agentAnkleRotationAmplitude ?? Math.PI / 8; const handTiltAmplitude = this.config.agentHandTiltAmplitude ?? 0.2; const headNodAmplitude = this.config.agentHeadNodAmplitude ?? 0.05; const headYawAmplitude = this.config.agentHeadYawAmplitude ?? 0.1; const headTiltAmplitude = this.config.agentHeadTiltAmplitude ?? 0.08; const headBobAmplitude = this.config.agentHeadBobAmplitude ?? 0.06;
        const walkTime = time * walkSpeed; let animPosX = 0, animPosY = 0, animPosZ = 0; let animRotX = 0, animRotY = 0, animRotZ = 0; let applyRotation = false; const torsoBobY = Math.sin(walkTime * 2) * bobAmplitude;
        switch (partType) {
            case 'torso': animPosY = torsoBobY; break;
            case 'head': animPosY = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * headBobAmplitude); break;
            case 'leftFoot': animPosZ = Math.sin(walkTime) * stepLength; animPosY = Math.max(0, Math.cos(walkTime)) * stepHeight; animRotX = Math.sin(walkTime) * ankleRotationAmplitude; applyRotation = true; break;
            case 'rightFoot': animPosZ = Math.sin(walkTime + Math.PI) * stepLength; animPosY = Math.max(0, Math.cos(walkTime + Math.PI)) * stepHeight; animRotX = Math.sin(walkTime + Math.PI) * ankleRotationAmplitude; applyRotation = true; break;
            case 'leftHand': animPosZ = Math.sin(walkTime + Math.PI) * swingAmplitude; animPosY = torsoBobY; animRotZ = Math.sin(walkTime * 1.8) * handTiltAmplitude; applyRotation = true; break;
            case 'rightHand': animPosZ = Math.sin(walkTime) * swingAmplitude; animPosY = torsoBobY; animRotZ = Math.cos(walkTime * 1.8 + 0.5) * handTiltAmplitude; applyRotation = true; break;
        }
        this.tempPosition.set(animPosX, animPosY, animPosZ); if (applyRotation) { this.tempQuaternion.setFromEuler(new THREE.Euler(animRotX, animRotY, animRotZ, 'XYZ')); } else { this.tempQuaternion.identity(); } this.tempScale.set(1, 1, 1);
        this.animationMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale); return this.animationMatrix;
     }

    _getPartLocalOffsetMatrix(partType) { /* ... code existant inchangé ... */
        this.partOffsetMatrix.identity();
        // Utiliser this.headRadius ici pour la cohérence, même si headY est une valeur calculée
        const headY = 6.0; // Pourrait être basé sur this.headRadius + torsoLength/2 etc. si besoin
        const torsoY = 0; const handX = 3.0; const handY = 1.0; const handBaseRotZ = Math.PI / 12; const footX = 1.8; const footY = -3.5; const footZ = 0.5;
        switch (partType) {
            case 'head': this.partOffsetMatrix.makeTranslation(0, headY, 0); break; case 'torso': break;
            case 'leftHand': this.tempPosition.set(-handX, handY, 0); this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, -handBaseRotZ)); this.tempScale.set(1,1,1); this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale); break;
            case 'rightHand': this.tempPosition.set(handX, handY, 0); this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, handBaseRotZ)); this.tempScale.set(1,1,1); this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale); break;
            case 'leftFoot': this.partOffsetMatrix.makeTranslation(-footX, footY, footZ); break; case 'rightFoot': this.partOffsetMatrix.makeTranslation(footX, footY, footZ); break;
        } return this.partOffsetMatrix;
     }

    // --- MODIFIÉ ---
    update(deltaTime) {
        if (!this.experience?.world?.environment?.isInitialized) {
            // Ne rien faire si l'environnement n'est pas prêt
            return;
        }
        const environment = this.experience.world.environment;
        const currentHour = environment.getCurrentHour();
        const elapsedTime = this.experience.time.elapsed / 1000;

        // Déterminer si le mode debug est actif et définir l'échelle des marqueurs
        const isDebug = this.experience.isDebugMode;
        // ***** Valeur Modifiée : Augmentez ici si besoin *****
        const debugMarkerScale = isDebug ? 1.0 : 0; // Échelle pour les marqueurs en mode debug (0 si désactivé)
        // *****************************************************

        // ***** Définir un offset Y fixe pour TOUS les marqueurs *****
        const fixedMarkerYOffset = 5.0; // Hauteur fixe au-dessus de la position de référence (agent, maison, travail)
        // ***********************************************************

        // Drapeaux pour optimiser les mises à jour GPU
        let needsMatrixUpdate = false; // Pour les parties du corps
        let needsColorUpdate = this.instanceMeshes.torso.instanceColor?.needsUpdate || false; // Pour la couleur du torse
        let needsAgentMarkerUpdate = false; // Pour le marqueur bleu
        let needsHomeMarkerUpdate = false;  // Pour le marqueur vert
        let needsWorkMarkerUpdate = false;  // Pour le marqueur rouge

        // Boucle sur tous les agents gérés
        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            const instanceId = agent.instanceId; // Index de cet agent dans les InstancedMesh

            // 1. Mettre à jour la logique interne de l'agent (état, chemin, etc.)
            agent.update(deltaTime, currentHour);

            // 2. Mettre à jour le visuel du corps de l'agent
            // Déterminer l'échelle actuelle (0 si non visible)
            const actualScale = agent.isVisible ? agent.scale : 0;
            this.tempScale.set(actualScale, actualScale, actualScale); // Échelle globale de l'agent

            // Composer la matrice de base de l'agent (position, orientation, échelle)
            // Utilise agent.position qui inclut déjà le yOffset de l'agent
            this.agentMatrix.compose(agent.position, agent.orientation, this.tempScale);

            // Fonction interne pour calculer et appliquer la matrice finale pour chaque partie du corps
            const calculateAndSetPartMatrix = (partName, meshName, indexMultiplier = 1, indexOffset = 0) => {
                 const localOffsetMatrix = this._getPartLocalOffsetMatrix(partName); // Décalage local de la partie (ex: bras par rapport au torse)
                 const animationMatrix = this._getPartAnimationMatrix(partName, elapsedTime); // Animation de la partie (ex: balancement bras)
                 this.tempMatrix.multiplyMatrices(localOffsetMatrix, animationMatrix); // Combine décalage et animation locale
                 this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix); // Applique la transformation globale de l'agent

                 // Appliquer la matrice finale à l'instance correcte dans l'InstancedMesh correspondant
                 const finalInstanceIndex = instanceId * indexMultiplier + indexOffset;
                 if (finalInstanceIndex < this.instanceMeshes[meshName].count) {
                    this.instanceMeshes[meshName].setMatrixAt(finalInstanceIndex, this.finalPartMatrix);
                    needsMatrixUpdate = true; // Marquer qu'au moins une partie du corps a bougé
                 }
            };

            // Calculer et définir les matrices pour chaque partie du corps
            calculateAndSetPartMatrix('head', 'head');
            calculateAndSetPartMatrix('torso', 'torso');
            calculateAndSetPartMatrix('leftHand', 'hand', 2, 0);  // Main gauche (index instanceId * 2 + 0)
            calculateAndSetPartMatrix('rightHand', 'hand', 2, 1); // Main droite (index instanceId * 2 + 1)
            calculateAndSetPartMatrix('leftFoot', 'shoe', 2, 0);  // Pied gauche (index instanceId * 2 + 0)
            calculateAndSetPartMatrix('rightFoot', 'shoe', 2, 1); // Pied droit (index instanceId * 2 + 1)

            // 3. Mettre à jour la couleur du torse si nécessaire
             if (this.instanceMeshes.torso.instanceColor) {
                 // Récupérer la couleur logique de l'agent et l'appliquer à l'instance
                 this.tempColor.setHex(agent.torsoColor.getHex());
                 this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
                 needsColorUpdate = true; // Marquer que les couleurs doivent être envoyées au GPU
             }

            // --- 4. Mettre à jour les Marqueurs de Débogage ---

            // Marqueur Agent (Bleu) - Suit la position actuelle de l'agent
            // Position: Position de l'agent + offset vertical fixe
            // ***** Positionnement Corrigé *****
            this.tempPosition.copy(agent.position).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));
            // *********************************
            this.tempQuaternion.identity(); // Garder l'orientation du marqueur fixe (non alignée sur l'agent)
            this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale); // Appliquer l'échelle de débogage
            this.debugMarkerMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale); // Composer la matrice du marqueur
            // Appliquer la matrice à l'instance du marqueur agent
            if (instanceId < this.instanceMeshes.agentMarker.count) {
                this.instanceMeshes.agentMarker.setMatrixAt(instanceId, this.debugMarkerMatrix);
                needsAgentMarkerUpdate = true; // Marquer que ce mesh doit être mis à jour
            }

            // Marqueur Domicile (Vert) - Position fixe au domicile de l'agent
            if (agent.homePosition) {
                 // Position: Position du domicile + offset vertical fixe
                 this.tempPosition.copy(agent.homePosition).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));
                 this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale); // Appliquer l'échelle de débogage
                 // Composer et appliquer la matrice (Quaternion est déjà identity)
                 this.debugMarkerMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                 if (instanceId < this.instanceMeshes.homeMarker.count) {
                     this.instanceMeshes.homeMarker.setMatrixAt(instanceId, this.debugMarkerMatrix);
                 }
            } else {
                 // Si pas de domicile, mettre l'échelle à zéro pour cacher le marqueur
                 this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
                 if (instanceId < this.instanceMeshes.homeMarker.count) {
                    this.instanceMeshes.homeMarker.setMatrixAt(instanceId, this.tempMatrix);
                 }
            }
            needsHomeMarkerUpdate = true; // Marquer que ce mesh doit être mis à jour (même si caché)

            // Marqueur Travail (Rouge) - Position fixe au lieu de travail de l'agent
             if (agent.workPosition) {
                  // Position: Position du travail + offset vertical fixe
                  this.tempPosition.copy(agent.workPosition).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));
                  this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale); // Appliquer l'échelle de débogage
                  // Composer et appliquer la matrice (Quaternion est déjà identity)
                  this.debugMarkerMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                   if (instanceId < this.instanceMeshes.workMarker.count) {
                     this.instanceMeshes.workMarker.setMatrixAt(instanceId, this.debugMarkerMatrix);
                   }
             } else {
                  // Si pas de travail, mettre l'échelle à zéro pour cacher le marqueur
                  this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
                   if (instanceId < this.instanceMeshes.workMarker.count) {
                    this.instanceMeshes.workMarker.setMatrixAt(instanceId, this.tempMatrix);
                   }
             }
             needsWorkMarkerUpdate = true; // Marquer que ce mesh doit être mis à jour (même si caché)
             // --------------------------------------------------

        } // Fin de la boucle for sur les agents

        // 5. Appliquer les mises à jour globales aux InstancedMesh (si nécessaire)
        // Envoyer les nouvelles matrices au GPU pour les parties du corps
        if (needsMatrixUpdate) {
            // Itérer sur les clés des meshes du corps
            ['head', 'torso', 'hand', 'shoe'].forEach(key => {
                 // Vérifier l'existence avant d'accéder à instanceMatrix (bonne pratique)
                 if(this.instanceMeshes[key]?.instanceMatrix) {
                     this.instanceMeshes[key].instanceMatrix.needsUpdate = true;
                 }
            });
        }
        // Envoyer les nouvelles couleurs au GPU pour le torse
        if (needsColorUpdate && this.instanceMeshes.torso.instanceColor) {
            this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }
        // Envoyer les nouvelles matrices au GPU pour les marqueurs de débogage
        if (needsAgentMarkerUpdate && this.instanceMeshes.agentMarker?.instanceMatrix) {
            this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true;
        }
        if (needsHomeMarkerUpdate && this.instanceMeshes.homeMarker?.instanceMatrix) {
            this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true;
        }
        if (needsWorkMarkerUpdate && this.instanceMeshes.workMarker?.instanceMatrix) {
            this.instanceMeshes.workMarker.instanceMatrix.needsUpdate = true;
        }
    } // --- Fin de la méthode update ---
    // --- FIN MODIFIÉ ---

    destroy() {
        console.log("AgentManager: Destruction...");

        // 1. Retirer les meshes (corps + debug)
        Object.values(this.instanceMeshes).forEach(mesh => {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.material && typeof mesh.material.dispose === 'function') {
                mesh.material.dispose();
            }
        });
        this.instanceMeshes = {};

        // 2. Disposer géométries (corps + debug)
        Object.values(this.baseGeometries).forEach(geom => {
             if (geom && typeof geom.dispose === 'function') geom.dispose();
        });
        this.baseGeometries = {};
        console.log("AgentManager: Géométries de base (corps+debug) disposées.");

        // 3. Disposer matériaux (corps + debug)
        Object.values(this.baseMaterials).forEach(mat => {
            if (mat && typeof mat.dispose === 'function') mat.dispose();
        });
        this.baseMaterials = {};
        console.log("AgentManager: Matériaux de base (corps+debug) disposés.");

        // 4. Nettoyer agents logiques et refs CityManager
        const cityManager = this.experience?.world?.cityManager;
        this.agents.forEach(agent => {
            if (cityManager && cityManager.citizens && cityManager.citizens.has(agent.id)) {
                 const citizenInfo = cityManager.getCitizenInfo(agent.id);
                 if(citizenInfo) {
                     const homeBuilding = cityManager.getBuildingInfo(citizenInfo.homeBuildingId);
                     if(homeBuilding?.occupants) homeBuilding.occupants.splice(homeBuilding.occupants.indexOf(agent.id), 1);
                     const workBuilding = cityManager.getBuildingInfo(citizenInfo.workBuildingId);
                     if(workBuilding?.occupants) workBuilding.occupants.splice(workBuilding.occupants.indexOf(agent.id), 1);
                 }
                 cityManager.citizens.delete(agent.id);
            }
            agent.destroy();
        });
        this.agents = [];
        console.log("AgentManager: Agents logiques détruits et références nettoyées.");

        // 5. Nullifier références
        this.scene = null;
        this.experience = null;
        this.config = null;
        console.log("AgentManager: Détruit.");
    }
}