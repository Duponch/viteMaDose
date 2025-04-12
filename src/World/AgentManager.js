// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions createCapsuleGeometry, createShoeGeometry (INCHANGÉES) ---
function createCapsuleGeometry(radius, length, radialSegments = 16, heightSegments = 1) {
    const cylinderHeight = length; const sphereRadius = radius; const geometries = [];
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, radialSegments, heightSegments); geometries.push(cylinderGeometry);
    const topSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2); topSphereGeometry.translate(0, cylinderHeight / 2, 0); geometries.push(topSphereGeometry);
    const bottomSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2); bottomSphereGeometry.rotateX(Math.PI); bottomSphereGeometry.translate(0, -cylinderHeight / 2, 0); geometries.push(bottomSphereGeometry);
    const mergedGeometry = mergeGeometries(geometries, false); geometries.forEach(geom => geom.dispose()); return mergedGeometry;
 }
function createShoeGeometry() {
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

        this.headRadius = 2.5; // Sera écrasée

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

        // --- File d'attente Pathfinding ---
        this.pathQueue = [];
        this.maxPathCalculationsPerFrame = this.config.maxPathCalculationsPerFrame ?? 10;

        this._initializeMeshes();
        console.log("AgentManager initialisé.");
    }

    _initializeMeshes() {
        console.log("AgentManager: Initialisation des InstancedMesh...");
        // Matériaux
        this.baseMaterials.skin = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1, name: 'AgentSkinMat' });
        this.baseMaterials.torso = new THREE.MeshStandardMaterial({ color: 0x800080, roughness: 0.5, metalness: 0.2, name: 'AgentTorsoMat', vertexColors: true });
        this.baseMaterials.hand = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1, name: 'AgentHandMat' });
        this.baseMaterials.shoe = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.7, metalness: 0.1, name: 'AgentShoeMat' });
        // Géométries
        const headRadiusConst = 2.5; this.headRadius = headRadiusConst; const headLength = 1;
        const torsoRadius = 1.5; const torsoLength = 1.5;
        const handRadius = 0.8; const handLength = 1.0;
        this.baseGeometries.head = createCapsuleGeometry(this.headRadius, headLength, 32);
        this.baseGeometries.torso = createCapsuleGeometry(torsoRadius, torsoLength, 24);
        this.baseGeometries.hand = createCapsuleGeometry(handRadius, handLength, 12);
        this.baseGeometries.shoe = createShoeGeometry();
        // Debug Markers
        const markerSize = 7; this.baseGeometries.debugMarker = new THREE.OctahedronGeometry(markerSize, 0);
        this.baseMaterials.agentMarkerMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, name: 'AgentMarkerMat' });
        this.baseMaterials.homeMarkerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, name: 'HomeMarkerMat' });
        this.baseMaterials.workMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, name: 'WorkMarkerMat' });
        // Création InstancedMesh
        const createInstMesh = (name, geom, mat, count, needsColor = false) => {
            const meshMaterial = mat.clone(); const mesh = new THREE.InstancedMesh(geom, meshMaterial, count);
            mesh.castShadow = !name.includes('Marker'); mesh.receiveShadow = !name.includes('Marker');
            mesh.name = `${name}Instances`; mesh.frustumCulled = false;
             if (needsColor) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3); meshMaterial.vertexColors = true; }
            this.scene.add(mesh); this.instanceMeshes[name] = mesh;
        };
        createInstMesh('head', this.baseGeometries.head, this.baseMaterials.skin, this.maxAgents);
        createInstMesh('torso', this.baseGeometries.torso, this.baseMaterials.torso, this.maxAgents, true);
        createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2);
        createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2);
        createInstMesh('agentMarker', this.baseGeometries.debugMarker, this.baseMaterials.agentMarkerMat, this.maxAgents);
        createInstMesh('homeMarker', this.baseGeometries.debugMarker, this.baseMaterials.homeMarkerMat, this.maxAgents);
        createInstMesh('workMarker', this.baseGeometries.debugMarker, this.baseMaterials.workMarkerMat, this.maxAgents);
        console.log(`AgentManager: ${Object.keys(this.instanceMeshes).length} InstancedMesh créés (Max Agents: ${this.maxAgents}).`);
    }

    createAgent() {
        if (this.agents.length >= this.maxAgents) { return null; }
        const instanceId = this.agents.length;
        const agentConfig = {
            scale: this.config.agentScale ?? 0.1,
            speed: (this.config.agentWalkSpeed ?? 2.5) * (0.8 + Math.random() * 0.4),
            rotationSpeed: (this.config.agentRotationSpeed ?? 8.0) * (0.9 + Math.random() * 0.2),
            yOffset: this.config.agentYOffset ?? 0.3,
            torsoColor: new THREE.Color(Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1),
            debugPathColor: null
        };
        agentConfig.torsoColorHex = agentConfig.torsoColor.getHex(); agentConfig.debugPathColor = agentConfig.torsoColorHex;
        const newAgent = new Agent(agentConfig, instanceId, this.experience);
        const cityManager = this.experience.world?.cityManager; let initializationSuccess = false;
        if (cityManager) {
            const citizenInfo = cityManager.registerCitizen(newAgent.id, newAgent);
            const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);
            const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);
            if (homeAssigned) { newAgent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId); initializationSuccess = true; }
            else { newAgent.currentState = 'IDLE'; newAgent.isVisible = false; }
        } else { newAgent.currentState = 'IDLE'; newAgent.isVisible = false; }
        this.agents.push(newAgent);
        if (this.instanceMeshes.torso.instanceColor && instanceId < this.instanceMeshes.torso.count) {
            this.tempColor.setHex(agentConfig.torsoColorHex); this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor); this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }
        this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
        Object.values(this.instanceMeshes).forEach(mesh => {
            const indices = (mesh.name.includes('hand') || mesh.name.includes('shoe')) ? [instanceId * 2, instanceId * 2 + 1] : [instanceId];
            indices.forEach(index => { if (index < mesh.count) mesh.setMatrixAt(index, this.tempMatrix); });
            if(mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
        });
        return newAgent;
    }

    getAgentById(id) {
        return this.agents.find(agent => agent.id === id);
    }

    queuePathRequest(agentId, startNode, endNode) {
        const existingRequest = this.pathQueue.find(req => req.agentId === agentId);
        if (!existingRequest) { this.pathQueue.push({ agentId, startNode, endNode }); }
        // else { console.warn(`Agent ${agentId} request already queued.`); } // Optionnel
    }

    _getPartAnimationMatrix(partType, time) {
        this.animationMatrix.identity();
        const { agentWalkSpeed = 2.5, agentBobAmplitude = 0.15, agentStepLength = 1.5, agentStepHeight = 0.7, agentSwingAmplitude = 1.2, agentAnkleRotationAmplitude = Math.PI / 8, agentHandTiltAmplitude = 0.2, agentHeadBobAmplitude = 0.06 } = this.config;
        const walkTime = time * agentWalkSpeed; let pos = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 }; let applyRotation = false;
        const torsoBobY = Math.sin(walkTime * 2) * agentBobAmplitude;
        switch (partType) {
            case 'torso': pos.y = torsoBobY; break;
            case 'head': pos.y = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * agentHeadBobAmplitude); break;
            case 'leftFoot': pos.z = Math.sin(walkTime) * agentStepLength; pos.y = Math.max(0, Math.cos(walkTime)) * agentStepHeight; rot.x = Math.sin(walkTime) * agentAnkleRotationAmplitude; applyRotation = true; break;
            case 'rightFoot': pos.z = Math.sin(walkTime + Math.PI) * agentStepLength; pos.y = Math.max(0, Math.cos(walkTime + Math.PI)) * agentStepHeight; rot.x = Math.sin(walkTime + Math.PI) * agentAnkleRotationAmplitude; applyRotation = true; break;
            case 'leftHand': pos.z = Math.sin(walkTime + Math.PI) * agentSwingAmplitude; pos.y = torsoBobY; rot.z = Math.sin(walkTime * 1.8) * agentHandTiltAmplitude; applyRotation = true; break;
            case 'rightHand': pos.z = Math.sin(walkTime) * agentSwingAmplitude; pos.y = torsoBobY; rot.z = Math.cos(walkTime * 1.8 + 0.5) * agentHandTiltAmplitude; applyRotation = true; break;
        }
        this.tempPosition.set(pos.x, pos.y, pos.z);
        if (applyRotation) { this.tempQuaternion.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')); } else { this.tempQuaternion.identity(); }
        this.tempScale.set(1, 1, 1); this.animationMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        return this.animationMatrix;
     }

     _getPartLocalOffsetMatrix(partType) {
        this.partOffsetMatrix.identity();
        const headY = 6.0, handX = 3.0, handY = 1.0, handBaseRotZ = Math.PI / 12;
        const footX = 1.8, footY = -3.5, footZ = 0.5;
        switch (partType) {
            case 'head': this.partOffsetMatrix.makeTranslation(0, headY, 0); break; case 'torso': break;
            case 'leftHand': this.tempPosition.set(-handX, handY, 0); this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, -handBaseRotZ)); this.tempScale.set(1,1,1); this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale); break;
            case 'rightHand': this.tempPosition.set(handX, handY, 0); this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, handBaseRotZ)); this.tempScale.set(1,1,1); this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale); break;
            case 'leftFoot': this.partOffsetMatrix.makeTranslation(-footX, footY, footZ); break; case 'rightFoot': this.partOffsetMatrix.makeTranslation(footX, footY, footZ); break;
        } return this.partOffsetMatrix;
     }

	 update(deltaTime) {
        if (!this.experience?.world?.environment?.isInitialized) return;
        const environment = this.experience.world.environment;
        const currentHour = environment.getCurrentHour();
        const elapsedTime = this.experience.time.elapsed / 1000;
        const isDebug = this.experience.isDebugMode;
        const debugMarkerScale = isDebug ? 1.0 : 0; const fixedMarkerYOffset = 5.0;
        let needsBodyMatrixUpdate = false, needsColorUpdate = this.instanceMeshes.torso.instanceColor?.needsUpdate || false;
        let needsAgentMarkerUpdate = false, needsHomeMarkerUpdate = false, needsWorkMarkerUpdate = false;

        // --- 1. Traitement file d'attente Pathfinding ---
        let calculationsDone = 0;
        const pathfinder = this.experience.world?.cityManager?.getPathfinder();
        if (pathfinder) {
            while (this.pathQueue.length > 0 && calculationsDone < this.maxPathCalculationsPerFrame) {
                const request = this.pathQueue.shift();
                const agent = this.getAgentById(request.agentId);
                if (agent) {
                    const path = pathfinder.findPathRaw(request.startNode, request.endNode);
                    agent.setPath(path); // Donner chemin (ou null) à l'agent
                    if (path && isDebug) { // Visualisation debug
                         const world = this.experience.world;
                         if (world?.setAgentPathForAgent) world.setAgentPathForAgent(agent, agent.path, agent.debugPathColor);
                    }
                }
                calculationsDone++;
            }
        }
        // --------------------------------------------------

        // --- 2. MAJ logique & visuel agents ---
        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i]; const instanceId = agent.instanceId;

            // 2a. MAJ logique agent (position, orientation, état)
            agent.update(deltaTime, currentHour);

            // --- CORRECTION yOffset ---
            // 2b. Calculer la position VISUELLE en ajoutant le yOffset
            // On utilise tempPosition (un Vector3 temporaire) pour éviter de modifier agent.position
            const visualPosition = this.tempPosition; // Réutiliser l'objet temporaire
            visualPosition.copy(agent.position);   // Commencer avec la position logique (X, Z corrects, Y = sidewalkHeight)
            visualPosition.y += agent.yOffset;      // Ajouter l'offset Y spécifique de l'agent pour le visuel
            // --- FIN CORRECTION yOffset ---

            // 2c. Préparer la matrice de base de l'agent pour le rendu
            const actualScale = agent.isVisible ? agent.scale : 0;
            this.tempScale.set(actualScale, actualScale, actualScale);
            // Utiliser visualPosition (avec Y offset) pour composer la matrice de l'agent
            this.agentMatrix.compose(visualPosition, agent.orientation, this.tempScale);

            // 2d. MAJ parties corps (visible ou échelle nulle)
            // Ces calculs sont relatifs à agentMatrix, qui inclut maintenant le yOffset
            const updatePart = (pName, mName, idxMult = 1, idxOff = 0) => {
                const idx = instanceId * idxMult + idxOff; if (idx >= this.instanceMeshes[mName].count) return;
                if(agent.isVisible) {
                    const offset = this._getPartLocalOffsetMatrix(pName); const anim = this._getPartAnimationMatrix(pName, elapsedTime + instanceId * 0.1);
                    this.tempMatrix.multiplyMatrices(offset, anim); this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix);
                    this.instanceMeshes[mName].setMatrixAt(idx, this.finalPartMatrix);
                } else {
                    // Appliquer agentMatrix (qui a scale 0) pour cacher
                    this.instanceMeshes[mName].setMatrixAt(idx, this.agentMatrix);
                }
            };
            updatePart('head', 'head'); updatePart('torso', 'torso'); updatePart('leftHand', 'hand', 2, 0); updatePart('rightHand', 'hand', 2, 1); updatePart('leftFoot', 'shoe', 2, 0); updatePart('rightFoot', 'shoe', 2, 1);
            needsBodyMatrixUpdate = true;

            // 2e. MAJ couleur torse
            if (this.instanceMeshes.torso.instanceColor && instanceId < this.instanceMeshes.torso.count) {
                this.tempColor.setHex(agent.torsoColor.getHex()); this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor); needsColorUpdate = true;
            }

            // 2f. MAJ Debug Markers (Utiliser la position LOGIQUE de l'agent, sans yOffset visuel)
            this.tempQuaternion.identity(); this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale);
            // Agent Marker (Bleu)
            // Utilise agent.position (Y=sidewalkHeight) pour montrer où il est sur le navmesh
            const markerBasePos = this.tempPosition.copy(agent.position).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));
            this.debugMarkerMatrix.compose(markerBasePos, this.tempQuaternion, this.tempScale);
            if (instanceId < this.instanceMeshes.agentMarker.count) { this.instanceMeshes.agentMarker.setMatrixAt(instanceId, this.debugMarkerMatrix); needsAgentMarkerUpdate = true; }
            // Home Marker (Vert)
            const homeMarkerPos = agent.homePosition ? this.tempPosition.copy(agent.homePosition).add(new THREE.Vector3(0, fixedMarkerYOffset, 0)) : null;
            if (homeMarkerPos) { this.debugMarkerMatrix.compose(homeMarkerPos, this.tempQuaternion, this.tempScale); }
            else { this.debugMarkerMatrix.identity().scale(new THREE.Vector3(0,0,0)); } // Cache si pas de maison
            if (instanceId < this.instanceMeshes.homeMarker.count) { this.instanceMeshes.homeMarker.setMatrixAt(instanceId, this.debugMarkerMatrix); needsHomeMarkerUpdate = true; }
             // Work Marker (Rouge)
            const workMarkerPos = agent.workPosition ? this.tempPosition.copy(agent.workPosition).add(new THREE.Vector3(0, fixedMarkerYOffset, 0)) : null;
            if (workMarkerPos) { this.debugMarkerMatrix.compose(workMarkerPos, this.tempQuaternion, this.tempScale); }
            else { this.debugMarkerMatrix.identity().scale(new THREE.Vector3(0,0,0)); } // Cache si pas de travail
            if (instanceId < this.instanceMeshes.workMarker.count) { this.instanceMeshes.workMarker.setMatrixAt(instanceId, this.debugMarkerMatrix); needsWorkMarkerUpdate = true; }

        } // Fin boucle agents

        // --- 3. Appliquer MAJ GPU ---
        if (needsBodyMatrixUpdate) { ['head', 'torso', 'hand', 'shoe'].forEach(k => { if(this.instanceMeshes[k]?.instanceMatrix) this.instanceMeshes[k].instanceMatrix.needsUpdate = true; }); }
        if (needsColorUpdate && this.instanceMeshes.torso.instanceColor) { this.instanceMeshes.torso.instanceColor.needsUpdate = true; }
        if (needsAgentMarkerUpdate && this.instanceMeshes.agentMarker?.instanceMatrix) { this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true; }
        if (needsHomeMarkerUpdate && this.instanceMeshes.homeMarker?.instanceMatrix) { this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true; }
        if (needsWorkMarkerUpdate && this.instanceMeshes.workMarker?.instanceMatrix) { this.instanceMeshes.workMarker.instanceMatrix.needsUpdate = true; }
    }

    destroy() {
        console.log("AgentManager: Destruction...");
         // 1. Nettoyer agents logiques et refs CityManager
        const cityManager = this.experience?.world?.cityManager;
        this.agents.forEach(agent => {
            if (cityManager?.citizens?.has(agent.id)) {
                 const citizenInfo = cityManager.getCitizenInfo(agent.id);
                 if(citizenInfo) {
                     const homeBuilding = cityManager.getBuildingInfo(citizenInfo.homeBuildingId);
                     if(homeBuilding?.occupants?.includes(agent.id)) homeBuilding.occupants.splice(homeBuilding.occupants.indexOf(agent.id), 1);
                     const workBuilding = cityManager.getBuildingInfo(citizenInfo.workBuildingId);
                      if(workBuilding?.occupants?.includes(agent.id)) workBuilding.occupants.splice(workBuilding.occupants.indexOf(agent.id), 1);
                 }
                 cityManager.citizens.delete(agent.id);
            }
            agent.destroy();
        });
        this.agents = []; this.pathQueue = [];
        console.log("AgentManager: Agents logiques détruits & file vidée.");
        // 2. Retirer meshes & disposer matériaux CLONÉS
        Object.values(this.instanceMeshes).forEach(mesh => {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.material?.dispose) mesh.material.dispose();
        });
        this.instanceMeshes = {};
        console.log("AgentManager: InstancedMeshes retirés & matériaux clonés disposés.");
        // 3. Disposer géométries BASE
        Object.values(this.baseGeometries).forEach(geom => { if (geom?.dispose) geom.dispose(); });
        this.baseGeometries = {};
        console.log("AgentManager: Géométries base disposées.");
        // 4. Disposer matériaux BASE
        Object.values(this.baseMaterials).forEach(mat => { if (mat?.dispose) mat.dispose(); });
        this.baseMaterials = {};
        console.log("AgentManager: Matériaux base disposés.");
        // 5. Nullifier références
        this.scene = null; this.experience = null; this.config = null;
        console.log("AgentManager: Détruit.");
    }
}