// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions createCapsuleGeometry, createShoeGeometry (INCHANGÉES) ---
// ... (coller les fonctions ici) ...
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
        this.finalPartMatrix = new THREE.Matrix4();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3(1, 1, 1);
        this.tempColor = new THREE.Color();
        this.debugMarkerMatrix = new THREE.Matrix4();

        this.pathfindingWorker = null;
        this.isWorkerInitialized = false;
        // -----------------------------------
        // --- RETIRÉ : Plus de file d'attente locale ---
        // this.pathQueue = [];
        // this.maxPathCalculationsPerFrame = this.config.maxPathCalculationsPerFrame ?? 10;
        // -------------------------------------------
		this.stats = {
            pathsToWorkByHour: {}, // { 8: 15, 9: 25, ... }
            pathsToHomeByHour: {}, // { 19: 30, 20: 10, ... }
        };
        this._initializeStats();

        this._initializeMeshes();
        console.log("AgentManager initialisé (Worker non démarré).");
    }

	_initializeStats() {
        this.stats.pathsToWorkByHour = {};
        this.stats.pathsToHomeByHour = {};
        for (let i = 0; i < 24; i++) {
            this.stats.pathsToWorkByHour[i] = 0;
            this.stats.pathsToHomeByHour[i] = 0;
        }
    }

    // --- NOUVELLE MÉTHODE : Initialise le Worker ---
    initializePathfindingWorker(navigationGraph) {
        if (this.pathfindingWorker) {
            console.warn("AgentManager: Tentative de réinitialiser le worker déjà existant.");
            return;
        }
        if (!navigationGraph || !navigationGraph.grid) {
            console.error("AgentManager: Impossible d'initialiser le worker - NavigationGraph invalide.");
            return;
        }

        try {
            console.log("AgentManager: Initialisation du Pathfinding Worker...");
            this.pathfindingWorker = new Worker(new URL('./PathfindingWorker.js', import.meta.url), { type: 'module' });
            this.pathfindingWorker.onmessage = (event) => this._handleWorkerMessage(event);
            this.pathfindingWorker.onerror = (error) => { /* ... gestion erreur worker ... */ };

            // Préparer les données de la grille (inchangé)
            const nodesWalkable = navigationGraph.grid.nodes.map(row =>
                row.map(node => node.walkable)
            );
            const gridData = {
                width: navigationGraph.gridWidth,
                height: navigationGraph.gridHeight,
                nodesWalkable: nodesWalkable
            };

            // --- NOUVEAU : Préparer les paramètres de conversion ---
            const conversionParams = {
                gridScale: navigationGraph.gridScale,
                offsetX: navigationGraph.offsetX,
                offsetZ: navigationGraph.offsetZ,
                sidewalkHeight: navigationGraph.sidewalkHeight
            };
            // ----------------------------------------------------

            // Envoyer le message d'initialisation COMPLET
            this.pathfindingWorker.postMessage({
                type: 'init',
                data: { gridData, conversionParams } // <-- Envoyer les deux objets
            });
            console.log("AgentManager: Message d'initialisation (grille + params) envoyé au worker.");

        } catch (error) {
            console.error("AgentManager: Échec de la création du Pathfinding Worker:", error);
            this.pathfindingWorker = null;
            this.isWorkerInitialized = false;
        }
    }
    // --- FIN NOUVELLE MÉTHODE ---

    _handleWorkerMessage(event) {
        const { type, data, error } = event.data;
        // console.log("AgentManager: Message reçu du worker:", type, data); // Debug

        if (type === 'initComplete') {
            this.isWorkerInitialized = true;
            console.log("AgentManager: Pathfinding Worker initialisé et prêt.");

        } else if (type === 'pathResult') {
            // Vérifier si les données nécessaires sont présentes (y compris pathLengthWorld)
            if (data && data.agentId && data.path !== undefined && data.pathLengthWorld !== undefined) {
                const { agentId, path: worldPathData, pathLengthWorld } = data; // Extraire la longueur
                const agent = this.getAgentById(agentId);

                if (agent) {
                    let finalWorldPath = null;
                    // Reconstruire les Vector3 (inchangé)
                    if (worldPathData && Array.isArray(worldPathData) && worldPathData.length > 0) {
                        try {
                            finalWorldPath = worldPathData.map(posData => new THREE.Vector3(posData.x, posData.y, posData.z));
                        } catch (vecError) {
                            console.error(`Agent ${agentId}: Erreur reconstruction Vector3:`, vecError);
                            finalWorldPath = null;
                        }
                    } else {
                        finalWorldPath = null;
                    }

                    // Passer le chemin ET la longueur à l'agent
                    agent.setPath(finalWorldPath, pathLengthWorld);

                    // Mise à jour debug (optionnel, peut utiliser agent.currentPathPoints)
                    if (finalWorldPath && this.experience.isDebugMode && this.experience.world?.setAgentPathForAgent) {
                        this.experience.world.setAgentPathForAgent(agent, finalWorldPath, agent.debugPathColor);
                    }
                } else {
                    console.warn(`AgentManager: Agent ${agentId} non trouvé pour le résultat du chemin.`);
                }
            } else {
                console.warn("AgentManager: Message 'pathResult' incomplet reçu du worker:", event.data);
            }
        } else if (type === 'workerError') {
            console.error("AgentManager: Erreur rapportée par le worker:", error, "Data associée:", data);
             if (data?.agentId) {
                 const agentWithError = this.getAgentById(data.agentId);
                 // Si l'agent attendait spécifiquement un chemin
                 if(agentWithError && (agentWithError.currentState === 'REQUESTING_PATH_FOR_WORK' || agentWithError.currentState === 'REQUESTING_PATH_FOR_HOME')) {
                     agentWithError.setPath(null, 0); // Force l'échec et le retour à un état stable
                 }
             }
        } else {
            console.warn("AgentManager: Type de message inconnu reçu du worker:", type);
        }
    }
    // --- FIN NOUVELLE MÉTHODE ---

	getAgentStats() {
        // Regrouper les agents par état actuel
        const agentsByState = {};
         // Initialiser tous les états possibles pour éviter les clés manquantes
        Object.values(Agent.prototype.constructor.AgentState || { // Accès à l'enum AgentState via Agent.js
            AT_HOME: 'AT_HOME', GOING_TO_WORK: 'GOING_TO_WORK', AT_WORK: 'AT_WORK',
            GOING_HOME: 'GOING_HOME', IDLE: 'IDLE', WAITING_FOR_PATH: 'WAITING_FOR_PATH'
        }).forEach(state => agentsByState[state] = []);

        if (this.agents) {
            this.agents.forEach(agent => {
                const state = agent.currentState || 'IDLE'; // Utiliser IDLE si currentState est null/undefined
                if (!agentsByState[state]) {
                    agentsByState[state] = []; // Sécurité si un état inattendu apparaît
                }
                agentsByState[state].push(agent.id);
            });
        }

        return {
            agentsByState,
            pathsToWorkByHour: { ...this.stats.pathsToWorkByHour }, // Retourner une copie
            pathsToHomeByHour: { ...this.stats.pathsToHomeByHour }, // Retourner une copie
        };
    }

    // --- NOUVELLE MÉTHODE : Demande un chemin au Worker ---
    requestPathFromWorker(agentId, startNode, endNode) {
        if (!this.pathfindingWorker || !this.isWorkerInitialized) {
            console.error(`AgentManager: Worker non prêt pour requête path Agent ${agentId}.`);
            // Informer l'agent de l'échec ?
             const agent = this.getAgentById(agentId);
             if(agent) agent.setPath(null); // Indiquer échec à l'agent
            return;
        }
        if(!startNode || !endNode) {
             console.error(`AgentManager: StartNode ou EndNode invalide pour requête path Agent ${agentId}.`);
             const agent = this.getAgentById(agentId);
             if(agent) agent.setPath(null);
             return;
        }

        // console.log(`AgentManager: Envoi requête path au worker pour Agent ${agentId}: (${startNode.x},${startNode.y}) -> (${endNode.x},${endNode.y})`);
        this.pathfindingWorker.postMessage({
            type: 'findPath',
            data: { agentId, startNode, endNode }
        });
    }
    // --- FIN NOUVELLE MÉTHODE ---


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
        const markerSize = 3; this.baseGeometries.debugMarker = new THREE.OctahedronGeometry(markerSize, 0);
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

    // --- RETIRÉ : queuePathRequest n'est plus utilisé ---
    // queuePathRequest(agentId, startNode, endNode) { ... }
    // ---------------------------------------------------

    _getPartAnimationMatrix(partType, time) {
        this.animationMatrix.identity();
        const agentBaseWalkSpeed = this.config.agentWalkSpeed ?? 2.5;
        const animationSpeedFactor = this.config.agentAnimationSpeedFactor ?? 1.0;
        const agentBobAmplitude = this.config.agentBobAmplitude ?? 0.15;
        const agentStepLength = this.config.agentStepLength ?? 1.5;
        const agentStepHeight = this.config.agentStepHeight ?? 0.7;
        const agentSwingAmplitude = this.config.agentSwingAmplitude ?? 1.2;
        const agentAnkleRotationAmplitude = this.config.agentAnkleRotationAmplitude ?? (Math.PI / 8);
        const agentHandTiltAmplitude = this.config.agentHandTiltAmplitude ?? 0.2;
        const agentHeadBobAmplitude = this.config.agentHeadBobAmplitude ?? 0.06;
        const effectiveAnimationSpeed = agentBaseWalkSpeed * animationSpeedFactor;
        const walkTime = time * effectiveAnimationSpeed;
        let pos = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 }; let applyRotation = false;
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
        // Utiliser le temps global scaled du jeu fourni par Time.js
        const currentGameTime = this.experience.time.elapsed; // Temps total écoulé en ms (scaled)
        const isDebug = this.experience.isDebugMode;
        const debugMarkerScale = isDebug ? 1.0 : 0;
        const fixedMarkerYOffset = 5.0; // Pour les markers debug

        // 1. Mettre à jour l'ÉTAT logique de chaque agent basé sur currentGameTime
        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            agent.updateState(deltaTime, currentHour, currentGameTime);
        }

        // 2. Mettre à jour la partie VISUELLE de chaque agent
        let needsBodyMatrixUpdate = false;
        let needsColorUpdate = this.instanceMeshes.torso.instanceColor?.needsUpdate || false;
        let needsAgentMarkerUpdate = false;
        let needsHomeMarkerUpdate = false;
        let needsWorkMarkerUpdate = false;

        // Boucle pour mettre à jour les matrices des InstancedMesh
        for (let i = 0; i < this.agents.length; i++) {
             const agent = this.agents[i];
             const instanceId = agent.instanceId;

             // Demander à l'agent de mettre à jour sa position/orientation VISUELLE
             // Passe deltaTime (pour la vitesse d'anim/rotation) et currentGameTime (pour l'interpolation de position)
             agent.updateVisuals(deltaTime, currentGameTime);

             // Appliquer la matrice globale de l'agent (position/rotation/scale visuels)
             const actualScale = agent.isVisible ? agent.scale : 0;
             this.tempScale.set(actualScale, actualScale, actualScale);
             // Utilise agent.position et agent.orientation mis à jour par updateVisuals
             this.agentMatrix.compose(agent.position, agent.orientation, this.tempScale);

             // Appliquer les transformations aux parties du corps
             const updatePart = (pName, mName, idxMult = 1, idxOff = 0) => {
                 const idx = instanceId * idxMult + idxOff;
                 if (idx >= this.instanceMeshes[mName].count) return;

                 if (agent.isVisible) {
                     // Récupérer la matrice d'offset local (peut être précalculée ou via fonction)
                     const offsetMatrix = this._getPartLocalOffsetMatrix(pName); // Ou une version optimisée
                     // Récupérer la matrice d'animation calculée par updateVisuals
                     const animationMatrix = agent.currentAnimationMatrix[pName] || new THREE.Matrix4(); // Fallback matrice identité

                     // Combiner : AgentGlobal * OffsetLocal * AnimationLocale
                     this.tempMatrix.multiplyMatrices(offsetMatrix, animationMatrix);
                     this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix);

                     this.instanceMeshes[mName].setMatrixAt(idx, this.finalPartMatrix);
                 } else {
                     // Agent invisible, utiliser une matrice nulle pour le cacher efficacement
                     this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
                     this.instanceMeshes[mName].setMatrixAt(idx, this.tempMatrix);
                 }
             };

             // Mettre à jour toutes les parties visibles
             updatePart('head', 'head');
             updatePart('torso', 'torso');
             updatePart('leftHand', 'hand', 2, 0);
             updatePart('rightHand', 'hand', 2, 1);
             updatePart('leftFoot', 'shoe', 2, 0);
             updatePart('rightFoot', 'shoe', 2, 1);
             needsBodyMatrixUpdate = true; // Marquer pour MAJ GPU

             // Mise à jour couleur torse (inchangé)
             if (this.instanceMeshes.torso.instanceColor && instanceId < this.instanceMeshes.torso.count) {
                this.tempColor.setHex(agent.torsoColor.getHex());
                this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
                needsColorUpdate = true;
             }

             // Mise à jour Debug Markers (basé sur la position VISUELLE)
             this.tempQuaternion.identity(); // Pas de rotation pour les markers
             this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale);
             const markerBasePos = this.tempPosition.copy(agent.position).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));

             this.debugMarkerMatrix.compose(markerBasePos, this.tempQuaternion, this.tempScale);
             if (instanceId < this.instanceMeshes.agentMarker.count) {
                 this.instanceMeshes.agentMarker.setMatrixAt(instanceId, this.debugMarkerMatrix);
                 needsAgentMarkerUpdate = true;
             }
             // Utiliser homePosition/workPosition de l'agent qui sont statiques
             const homePos = agent.homePosition;
             if(homePos) {
                markerBasePos.copy(homePos).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));
                this.debugMarkerMatrix.compose(markerBasePos, this.tempQuaternion, this.tempScale);
             } else { this.debugMarkerMatrix.identity().scale(new THREE.Vector3(0,0,0)); }
             if (instanceId < this.instanceMeshes.homeMarker.count) {
                this.instanceMeshes.homeMarker.setMatrixAt(instanceId, this.debugMarkerMatrix);
                needsHomeMarkerUpdate = true;
             }
             const workPos = agent.workPosition;
             if(workPos) {
                markerBasePos.copy(workPos).add(new THREE.Vector3(0, fixedMarkerYOffset, 0));
                this.debugMarkerMatrix.compose(markerBasePos, this.tempQuaternion, this.tempScale);
             } else { this.debugMarkerMatrix.identity().scale(new THREE.Vector3(0,0,0)); }
             if (instanceId < this.instanceMeshes.workMarker.count) {
                this.instanceMeshes.workMarker.setMatrixAt(instanceId, this.debugMarkerMatrix);
                needsWorkMarkerUpdate = true;
             }

        } // Fin boucle MAJ visuelle agents

        // 3. Appliquer les mises à jour GPU pour les InstancedMesh (inchangé)
        if (needsBodyMatrixUpdate) {
            ['head', 'torso', 'hand', 'shoe'].forEach(k => {
                if(this.instanceMeshes[k]?.instanceMatrix) this.instanceMeshes[k].instanceMatrix.needsUpdate = true;
            });
        }
        if (needsColorUpdate && this.instanceMeshes.torso.instanceColor) {
            this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }
        if (needsAgentMarkerUpdate && this.instanceMeshes.agentMarker?.instanceMatrix) {
            this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true;
        }
        if (needsHomeMarkerUpdate && this.instanceMeshes.homeMarker?.instanceMatrix) {
            this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true;
        }
        if (needsWorkMarkerUpdate && this.instanceMeshes.workMarker?.instanceMatrix) {
            this.instanceMeshes.workMarker.instanceMatrix.needsUpdate = true;
        }
    }

    destroy() {
		console.log("AgentManager: Destruction...");
		// Arrêter le worker s'il existe
		if (this.pathfindingWorker) {
			this.pathfindingWorker.terminate();
			this.pathfindingWorker = null;
			this.isWorkerInitialized = false;
			console.log("AgentManager: Pathfinding Worker terminé.");
		}
	   // ... (reste de la logique de destroy existante) ...
		const cityManager = this.experience?.world?.cityManager;
		this.agents.forEach(agent => {
			// ... (nettoyage citizenManager) ...
			agent.destroy();
		});
		this.agents = [];
		console.log("AgentManager: Agents logiques détruits.");

		Object.values(this.instanceMeshes).forEach(mesh => {
			if (mesh.parent) mesh.parent.remove(mesh);
			// Dispose material CLONE (celui de InstancedMesh)
			if (mesh.material && mesh.material !== this.baseMaterials[mesh.name.replace('Instances','').toLowerCase()]) {
			   mesh.material.dispose?.();
			}
		});
		this.instanceMeshes = {};
		console.log("AgentManager: InstancedMeshes retirés & matériaux clonés disposés.");

		Object.values(this.baseGeometries).forEach(geom => { geom?.dispose(); });
		this.baseGeometries = {};
		console.log("AgentManager: Géométries base disposées.");

		Object.values(this.baseMaterials).forEach(mat => { mat?.dispose(); });
		this.baseMaterials = {};
		console.log("AgentManager: Matériaux base disposés.");

		this.scene = null; this.experience = null; this.config = null;
		console.log("AgentManager: Détruit.");
	}
}