// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions createCapsuleGeometry, createShoeGeometry (INCHANGÉES) ---
// Ces fonctions restent les mêmes car elles définissent l'apparence des agents.
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

		// Pooling
		this.activeCount = 0;
		this.instanceIdToAgent = new Array(maxAgents);
		this.agentToInstanceId = new Map();

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

        // --- Pathfinding Worker (NavMesh) ---
		this.pathfindingWorker = null;
		this.isWorkerInitialized = false;
        this.pendingPathRequests = new Map(); // Stocke les callbacks ou promesses en attente

		this.stats = {
			pathsToWorkByHour: {},
			pathsToHomeByHour: {},
		};
		this._initializeStats();

		this._initializeMeshes();
		console.log("AgentManager initialisé (NavMesh Worker non démarré).");
	}

	_initializeStats() {
        this.stats.pathsToWorkByHour = {};
        this.stats.pathsToHomeByHour = {};
        for (let i = 0; i < 24; i++) {
            this.stats.pathsToWorkByHour[i] = 0;
            this.stats.pathsToHomeByHour[i] = 0;
        }
    }

    /**
     * Initialise le worker de pathfinding NavMesh. (CORRIGÉ)
     * Doit être appelé APRÈS la génération du NavMesh.
     * @param {object} navMeshInstanceData - Données SÉRIALISÉES du NavMesh ({ groups, vertices: Float32Array }).
     */
    initializePathfindingWorker(navMeshInstanceData) { // Renommé pour clarté
        if (this.pathfindingWorker) {
            console.warn("AgentManager: Tentative de réinitialiser le worker déjà existant.");
            return;
        }
        // VÉRIFICATION AJOUTÉE : S'assurer que les données reçues sont valides
        if (!navMeshInstanceData || !navMeshInstanceData.groups || !navMeshInstanceData.vertices) {
            console.error("AgentManager: Invalid navMeshInstanceData received for worker initialization. Missing 'groups' or 'vertices'.", navMeshInstanceData);
            this.isWorkerInitialized = false;
            return;
        }
         // VÉRIFICATION AJOUTÉE : S'assurer que la config navMesh existe
        if (!this.config.navMesh) {
             console.error("AgentManager: Missing navMesh configuration (this.config.navMesh). Cannot initialize worker.");
             this.isWorkerInitialized = false;
             return;
        }

        try {
            console.log("AgentManager: Initialisation du NavMesh Pathfinding Worker...");
            this.pathfindingWorker = new Worker(new URL('./NavMeshPathfindingWorker.js', import.meta.url), { type: 'module' });
            this.pathfindingWorker.onmessage = (event) => this._handleWorkerMessage(event);
            this.pathfindingWorker.onerror = (error) => {
                 console.error("AgentManager: Erreur dans le NavMesh Worker:", error);
                 this.isWorkerInitialized = false;
                 this.pendingPathRequests.forEach((callbacks) => {
                     if (callbacks.reject) callbacks.reject(new Error("NavMesh Worker failed"));
                 });
                 this.pendingPathRequests.clear();
            };

            // --- CORRECTION : Envoyer les données NavMesh au worker avec la bonne structure ---
            // navMeshInstanceData contient { groups, vertices: Float32Array }
            const verticesBuffer = navMeshInstanceData.vertices;
            // Préparer les données transférables (le ArrayBuffer sous-jacent du Float32Array)
            const transferables = (verticesBuffer instanceof Float32Array || verticesBuffer instanceof ArrayBuffer) ? [verticesBuffer.buffer] : [];

            this.pathfindingWorker.postMessage({
                type: 'init',
                data: {
                    // Utiliser la structure attendue par le worker :
                    zoneData: {
                        groups: navMeshInstanceData.groups,     // Passer les groupes reçus
                        vertices: navMeshInstanceData.vertices // Passer le Float32Array des vertices
                    },
                    navMeshConfig: this.config.navMesh // Passer la configuration NavMesh
                }
            }, transferables); // Transférer le buffer des vertices si possible

            console.log("AgentManager: Message d'initialisation (zoneData & navMeshConfig) envoyé au worker.");

        } catch (error) {
            console.error("AgentManager: Échec de la création du NavMesh Pathfinding Worker:", error);
            this.pathfindingWorker = null;
            this.isWorkerInitialized = false;
        }
    }

    /**
     * Gère les messages reçus du worker NavMesh.
     * @param {MessageEvent} event
     */
    _handleWorkerMessage(event) {
        const { type, data, requestId, error } = event.data;
        // console.log("AgentManager: Message reçu du NavMesh worker:", type, requestId); // Debug

        if (type === 'initComplete') {
            this.isWorkerInitialized = true;
            console.log("AgentManager: NavMesh Pathfinding Worker initialisé et prêt.");
            // Traiter les requêtes qui étaient en attente si nécessaire (non implémenté ici)

        } else if (type === 'pathResult') {
            if (requestId === undefined || !this.pendingPathRequests.has(requestId)) {
                console.warn("AgentManager: Reçu pathResult pour une requête inconnue ou déjà traitée:", requestId);
                return;
            }

            const { resolve } = this.pendingPathRequests.get(requestId);
            this.pendingPathRequests.delete(requestId); // Supprimer la requête traitée

            // Les données ('data') devraient contenir { path: Array<{x,y,z}> | null, pathLength: number }
            if (data && data.path !== undefined && data.pathLength !== undefined) {
                 let finalWorldPath = null;
                 // Reconstruire les Vector3 (inchangé par rapport à A*)
                 if (data.path && Array.isArray(data.path) && data.path.length > 0) {
                     try {
                         finalWorldPath = data.path.map(posData => new THREE.Vector3(posData.x, posData.y, posData.z));
                     } catch (vecError) {
                         console.error(`Request ${requestId}: Erreur reconstruction Vector3:`, vecError);
                         finalWorldPath = null; // Considérer comme échec si reconstruction échoue
                     }
                 }

                 // Résoudre la promesse avec le chemin et la longueur
                 resolve({ path: finalWorldPath, pathLength: data.pathLength });

            } else {
                 console.warn(`AgentManager: Message 'pathResult' (ID: ${requestId}) invalide ou incomplet reçu du worker NavMesh:`, event.data);
                 resolve({ path: null, pathLength: 0 }); // Résoudre avec échec
            }

        } else if (type === 'pathError') {
             if (requestId === undefined || !this.pendingPathRequests.has(requestId)) {
                 console.warn("AgentManager: Reçu pathError pour une requête inconnue ou déjà traitée:", requestId);
                 return;
             }
             const { reject } = this.pendingPathRequests.get(requestId);
             this.pendingPathRequests.delete(requestId);

             console.error(`AgentManager: Erreur pathfinding NavMesh rapportée par le worker pour requête ${requestId}:`, error);
             reject(new Error(error || "NavMesh pathfinding failed")); // Rejeter la promesse

        } else if (type === 'workerError') { // Erreur générale du worker
            console.error("AgentManager: Erreur générale rapportée par le worker NavMesh:", error, "Data associée:", data);
            // Rejeter toutes les promesses en attente
            this.pendingPathRequests.forEach(({ reject }) => {
                 reject(new Error("NavMesh Worker encountered a general error"));
            });
            this.pendingPathRequests.clear();
            this.isWorkerInitialized = false; // Marquer comme non initialisé
        } else {
            console.warn("AgentManager: Type de message inconnu reçu du worker NavMesh:", type);
        }
    }

    /**
     * Demande un chemin au worker NavMesh entre deux positions monde.
     * Retourne une promesse qui sera résolue avec { path: Array<Vector3>|null, pathLength: number }.
     * @param {string} agentId - ID de l'agent demandeur (pour contexte/debug).
     * @param {THREE.Vector3} startPosWorld - Position de départ dans le monde.
     * @param {THREE.Vector3} endPosWorld - Position d'arrivée dans le monde.
     * @returns {Promise<{path: Array<THREE.Vector3>|null, pathLength: number}>}
     */
	async requestPath(agentId, startPosWorld, endPosWorld) {
        if (!this.pathfindingWorker || !this.isWorkerInitialized) {
            console.error(`AgentManager: Worker NavMesh non prêt pour requête path Agent ${agentId}.`);
            return { path: null, pathLength: 0 }; // Retourne échec immédiat
        }
        if (!startPosWorld || !endPosWorld) {
            console.error(`AgentManager: StartPos ou EndPos invalide pour requête path Agent ${agentId}.`);
            return { path: null, pathLength: 0 };
        }

        // Générer un ID unique pour cette requête
        const requestId = `${agentId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        // Créer une promesse et stocker ses fonctions resolve/reject
        const promise = new Promise((resolve, reject) => {
            this.pendingPathRequests.set(requestId, { resolve, reject });
        });

        // Envoyer la requête au worker
        // console.log(`AgentManager: Envoi requête NavMesh path (ID: ${requestId}) pour Agent ${agentId}: Start(${startPosWorld.x.toFixed(1)}, ${startPosWorld.z.toFixed(1)}) -> End(${endPosWorld.x.toFixed(1)}, ${endPosWorld.z.toFixed(1)})`);
        this.pathfindingWorker.postMessage({
            type: 'findPath',
            data: {
                startPos: { x: startPosWorld.x, y: startPosWorld.y, z: startPosWorld.z }, // Envoyer sous forme simple
                endPos: { x: endPosWorld.x, y: endPosWorld.y, z: endPosWorld.z },
                // Ajouter d'autres paramètres si nécessaires (ex: agent size)
                // agentRadius: this.config.agentRadius ?? 0.5,
            },
            requestId: requestId // Inclure l'ID de la requête
        });

        // Nettoyage automatique si la promesse n'est pas résolue après un certain temps (timeout)
         const timeoutMs = 10000; // 10 secondes timeout
         const timeoutId = setTimeout(() => {
             if (this.pendingPathRequests.has(requestId)) {
                 console.warn(`AgentManager: Timeout pour requête path NavMesh ${requestId}`);
                 const { reject } = this.pendingPathRequests.get(requestId);
                 this.pendingPathRequests.delete(requestId);
                 reject(new Error(`NavMesh path request ${requestId} timed out after ${timeoutMs}ms`));
             }
         }, timeoutMs);

         // S'assurer que le timeout est annulé quand la promesse est résolue/rejetée
          promise.finally(() => {
             clearTimeout(timeoutId);
         });


        return promise; // Retourner la promesse
    }

	getAgentStats() {
        const agentsByState = {};
        Object.values(AgentState || {}).forEach(state => agentsByState[state] = []); // Initialise avec les états connus

        if (this.agents) {
            this.agents.forEach(agent => {
                const state = agent.currentState || AgentState.IDLE;
                if (!agentsByState[state]) {
                    agentsByState[state] = [];
                }
                agentsByState[state].push(agent.id);
            });
        }

        return {
            agentsByState,
            pathsToWorkByHour: { ...this.stats.pathsToWorkByHour },
            pathsToHomeByHour: { ...this.stats.pathsToHomeByHour },
        };
    }

	// --- Méthodes de gestion des agents (Pooling, _initializeMeshes, createAgent, releaseAgent, getAgentById) ---
    // --- Ces méthodes restent globalement INCHANGÉES car elles concernent la logique et le visuel des agents, ---
    // --- pas directement la requête de pathfinding qui est maintenant externalisée via requestPath().       ---

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
			const meshMaterial = mat.clone();
			const mesh = new THREE.InstancedMesh(geom, meshMaterial, count);
			mesh.castShadow = !name.includes('Marker');
			mesh.receiveShadow = !name.includes('Marker');
			mesh.name = `${name}Instances`;
			mesh.frustumCulled = false;
			if (needsColor) {
				mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
				meshMaterial.vertexColors = true;
			}
			this.scene.add(mesh);
			this.instanceMeshes[name] = mesh;
			mesh.count = 0; // <-- démarrer sans instance active
		};
		createInstMesh('head', this.baseGeometries.head, this.baseMaterials.skin, this.maxAgents);
		createInstMesh('torso', this.baseGeometries.torso, this.baseMaterials.torso, this.maxAgents, true);
		createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2);
		createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2);
		createInstMesh('agentMarker', this.baseGeometries.debugMarker, this.baseMaterials.agentMarkerMat, this.maxAgents);
		createInstMesh('homeMarker', this.baseGeometries.debugMarker, this.baseMaterials.homeMarkerMat, this.maxAgents);
		createInstMesh('workMarker', this.baseGeometries.debugMarker, this.baseMaterials.workMarkerMat, this.maxAgents);
		console.log(`AgentManager: ${Object.keys(this.instanceMeshes).length} InstancedMesh créés (Max Agents: ${this.maxAgents}), tous à count=0.`);
	}

	createAgent() {
		if (this.activeCount >= this.maxAgents) return null;

		const agentConfig = {
			scale: this.config.agentScale ?? 0.1,
			speed: (this.config.agentWalkSpeed ?? 2.5) * (0.8 + Math.random() * 0.4),
			rotationSpeed: (this.config.agentRotationSpeed ?? 8.0) * (0.9 + Math.random() * 0.2),
			yOffset: this.config.agentYOffset ?? 0.3,
			torsoColor: new THREE.Color(Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1),
            // Passer agentManager ici pour que Agent puisse appeler requestPath
            agentManager: this,
			debugPathColor: null
		};
		agentConfig.torsoColorHex = agentConfig.torsoColor.getHex();
		agentConfig.debugPathColor = agentConfig.torsoColorHex;
		const instanceId = this.activeCount;
        // Passer l'agentManager à Agent
		const newAgent = new Agent(agentConfig, instanceId, this.experience);

		const cityManager = this.experience.world?.cityManager;
		if (cityManager) {
			const citizenInfo = cityManager.registerCitizen(newAgent.id, newAgent);
			const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);
			const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);
			if (homeAssigned) {
                 // initializeLifecycle essaiera de demander un chemin si l'heure est venue
				newAgent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId);
			} else {
				newAgent.currentState = AgentState.IDLE; // Utiliser la constante si importée ou définie ici
				newAgent.isVisible = false;
                console.warn(`Agent ${newAgent.id} could not be assigned a home.`);
			}
		} else {
             console.error("CityManager not available for agent initialization.");
			newAgent.currentState = AgentState.IDLE;
			newAgent.isVisible = false;
		}

		this.agents.push(newAgent);
		this.instanceIdToAgent[instanceId] = newAgent.id;
		this.agentToInstanceId.set(newAgent.id, instanceId);
		this.activeCount++;

		Object.values(this.instanceMeshes).forEach(mesh => mesh.count = this.activeCount);

		this.instanceMeshes.torso.instanceColor?.setXYZ(instanceId, newAgent.torsoColor.r, newAgent.torsoColor.g, newAgent.torsoColor.b);
        if(this.instanceMeshes.torso.instanceColor) this.instanceMeshes.torso.instanceColor.needsUpdate = true;

		Object.values(this.instanceMeshes).forEach(mesh => {
			mesh.instanceMatrix.needsUpdate = true;
		});

		return newAgent;
	}

	releaseAgent(agentId) {
		const freedId = this.agentToInstanceId.get(agentId);
		if (freedId === undefined) return;

		const lastId = this.activeCount - 1;
		if (freedId !== lastId) {
			Object.values(this.instanceMeshes).forEach(mesh => {
				const m = new THREE.Matrix4();
				mesh.getMatrixAt(lastId, m);
				mesh.setMatrixAt(freedId, m);
				if (mesh.instanceColor) {
					const color = new THREE.Color();
					mesh.getColorAt(lastId, color); // Correction: utiliser getColorAt
					mesh.setColorAt(freedId, color); // Correction: utiliser setColorAt
				}
				mesh.instanceMatrix.needsUpdate = true;
				if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			});
			const movedAgentId = this.instanceIdToAgent[lastId];
			this.instanceIdToAgent[freedId] = movedAgentId;
			this.agentToInstanceId.set(movedAgentId, freedId);
		}

		this.activeCount--;
		Object.values(this.instanceMeshes).forEach(mesh => {
			mesh.count = this.activeCount;
		});

		this.instanceIdToAgent[lastId] = undefined;
		this.agentToInstanceId.delete(agentId);

		const idx = this.agents.findIndex(a => a.id === agentId);
		if (idx !== -1) {
            // Avant de supprimer, s'assurer que les références sont nettoyées
            this.agents[idx].destroy();
            this.agents.splice(idx, 1);
        }
	}

    getAgentById(id) {
        return this.agents.find(agent => agent.id === id);
    }

    // --- Méthodes d'animation visuelle (_getPartAnimationMatrix, _getPartLocalOffsetMatrix) ---
    // --- Ces méthodes restent INCHANGÉES car elles définissent l'animation de marche ---
    _getPartAnimationMatrix(partType, time) {
        // ... (code inchangé) ...
        this.tempMatrix.identity(); // Renommé tempMatrix pour cohérence
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
        this.tempScale.set(1, 1, 1); this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        return this.tempMatrix;
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

    /**
     * Met à jour la logique d'état et les visuels de tous les agents actifs.
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms.
     */
	update(deltaTime) {
		if (!this.experience?.world?.environment?.isInitialized) return;
		const environment = this.experience.world.environment;
		const currentGameTime = this.experience.time.elapsed;
		const currentHour = environment.getCurrentHour();
		const isDebug = this.experience.isDebugMode;
		const debugMarkerScale = isDebug ? 1.0 : 0; // Markers visibles seulement en debug
		const fixedMarkerYOffset = 5.0;

		let needsBodyMatrixUpdate = false;
		let needsColorUpdate = this.instanceMeshes.torso.instanceColor?.needsUpdate || false;
		let needsAgentMarkerUpdate = false;
		let needsHomeMarkerUpdate = false;
		let needsWorkMarkerUpdate = false;

		// --- 1. Mettre à jour la logique de tous les agents actifs ---
        // Itérer seulement sur les agents actifs (index 0 à activeCount-1)
        for(let i = 0; i < this.activeCount; i++) {
             const agentId = this.instanceIdToAgent[i];
             const agent = this.getAgentById(agentId);
             if(agent) {
                 agent.updateState(deltaTime, currentHour, currentGameTime);
             }
        }

		// --- 2. Mettre à jour les visuels (InstancedMesh) ---
        for (let instanceId = 0; instanceId < this.activeCount; instanceId++) {
			const agentId = this.instanceIdToAgent[instanceId];
			const agent = this.getAgentById(agentId);

            // Si l'agent n'existe plus (ce qui ne devrait pas arriver avec la boucle sur activeCount), skipper
			if (!agent) continue;

            // Mise à jour visuelle de l'agent (position, orientation, animation)
            agent.updateVisuals(deltaTime, currentGameTime); // Cette fonction calcule la position/orientation finale

            const actualScale = agent.isVisible ? agent.scale : 0;
			this.tempScale.set(actualScale, actualScale, actualScale);
			this.agentMatrix.compose(agent.position, agent.orientation, this.tempScale);

            // Mettre à jour les matrices pour chaque partie du corps
            const updatePart = (partName, meshName, instanceIndexMultiplier = 1, instanceIndexOffset = 0) => {
				const finalInstanceIndex = instanceId * instanceIndexMultiplier + instanceIndexOffset;
                const mesh = this.instanceMeshes[meshName];
				if (!mesh || finalInstanceIndex >= mesh.count) return; // Sécurité

				// Utiliser la matrice d'animation pré-calculée par agent.updateVisuals
                const animationMatrix = agent.currentAnimationMatrix[partName] || this.tempMatrix.identity();
                const offsetMatrix = this._getPartLocalOffsetMatrix(partName);

                this.tempMatrix.multiplyMatrices(offsetMatrix, animationMatrix); // Apply animation to offset
                this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix); // Apply global transform

                mesh.setMatrixAt(finalInstanceIndex, this.finalPartMatrix);
			};

			updatePart('head', 'head');
			updatePart('torso', 'torso');
			updatePart('leftHand', 'hand', 2, 0);
			updatePart('rightHand', 'hand', 2, 1);
			updatePart('leftFoot', 'shoe', 2, 0);
			updatePart('rightFoot', 'shoe', 2, 1);
			needsBodyMatrixUpdate = true;

			// Mise à jour de la couleur du torse (si elle a changé, mais on le fait à chaque frame pour le moment)
			if (this.instanceMeshes.torso.instanceColor) {
				this.tempColor.setHex(agent.torsoColor.getHex());
				this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor); // Correction: utiliser setColorAt
				needsColorUpdate = true; // Marquer pour update GPU
			}

			// Mise à jour des marqueurs debug (position agent, domicile, travail)
            const updateMarker = (markerName, targetPosition) => {
                 const markerMesh = this.instanceMeshes[markerName];
                 if (markerMesh) {
                     if (isDebug && targetPosition) {
                         this.tempPosition.copy(targetPosition).setY(fixedMarkerYOffset); // Position au sol + offset Y
                         this.tempQuaternion.identity();
                         this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale);
                         this.debugMarkerMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                         markerMesh.setMatrixAt(instanceId, this.debugMarkerMatrix);
                     } else {
                         // Cacher si pas en mode debug ou pas de cible
                         this.debugMarkerMatrix.identity().scale(this.tempScale.set(0, 0, 0));
                         markerMesh.setMatrixAt(instanceId, this.debugMarkerMatrix);
                     }
                     return true; // Marquer qu'une mise à jour est nécessaire
                 }
                 return false; // Pas de mise à jour
            };

             needsAgentMarkerUpdate = updateMarker('agentMarker', agent.position) || needsAgentMarkerUpdate;
             needsHomeMarkerUpdate = updateMarker('homeMarker', agent.homePosition) || needsHomeMarkerUpdate;
             needsWorkMarkerUpdate = updateMarker('workMarker', agent.workPosition) || needsWorkMarkerUpdate;

		} // Fin boucle sur les agents actifs

		// --- 3. Envoyer les mises à jour au GPU (si nécessaire) ---
		if (needsBodyMatrixUpdate) {
			['head', 'torso', 'hand', 'shoe'].forEach(key => {
                const mesh = this.instanceMeshes[key];
				if (mesh?.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
                // Recalculer bounding sphere pour frustum culling (optionnel mais recommandé)
                // if (mesh && (key === 'head' || key === 'torso')) mesh.computeBoundingSphere();
			});
		}
		if (needsColorUpdate && this.instanceMeshes.torso.instanceColor) {
            this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }
		if (needsAgentMarkerUpdate && this.instanceMeshes.agentMarker) {
            this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true;
        }
		if (needsHomeMarkerUpdate && this.instanceMeshes.homeMarker) {
            this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true;
        }
		if (needsWorkMarkerUpdate && this.instanceMeshes.workMarker) {
            this.instanceMeshes.workMarker.instanceMatrix.needsUpdate = true;
        }
	} // Fin update()

    removeAgent(agentId) {
        // La logique de releaseAgent gère déjà le retrait visuel et le nettoyage du mapping.
        // Il faut juste retirer l'instance logique de this.agents.
		const idx = this.agents.findIndex(a => a.id === agentId);
		if (idx !== -1) {
            this.agents[idx].destroy(); // Nettoyer l'agent logique
            this.agents.splice(idx, 1);
            this.releaseAgent(agentId); // Gère le swap/décrémentation visuel
        }
	}

    destroy() {
		console.log("AgentManager: Destruction...");
		// Arrêter le worker NavMesh
		if (this.pathfindingWorker) {
			this.pathfindingWorker.terminate();
			this.pathfindingWorker = null;
			this.isWorkerInitialized = false;
			console.log("AgentManager: NavMesh Pathfinding Worker terminé.");
            // Rejeter les promesses en attente
            this.pendingPathRequests.forEach(({ reject }) => reject(new Error("AgentManager destroyed")));
            this.pendingPathRequests.clear();
		}

        // Nettoyer tous les agents logiques restants
		this.agents.forEach(agent => agent.destroy());
		this.agents = [];
		console.log("AgentManager: Agents logiques détruits.");

        // Nettoyer les InstancedMesh
		Object.values(this.instanceMeshes).forEach(mesh => {
			if (mesh.parent) mesh.parent.remove(mesh);
			// Disposer le material CLONE (créé dans _initializeMeshes)
			mesh.material?.dispose();
            // La géométrie est gérée par baseGeometries
		});
		this.instanceMeshes = {};
		console.log("AgentManager: InstancedMeshes retirés & matériaux clonés disposés.");

        // Nettoyer les géométries de base
		Object.values(this.baseGeometries).forEach(geom => geom?.dispose());
		this.baseGeometries = {};
		console.log("AgentManager: Géométries base disposées.");

        // Nettoyer les matériaux de base
		Object.values(this.baseMaterials).forEach(mat => mat?.dispose());
		this.baseMaterials = {};
		console.log("AgentManager: Matériaux base disposés.");

        // Réinitialiser le pooling et les maps
        this.activeCount = 0;
        this.instanceIdToAgent = new Array(this.maxAgents);
        this.agentToInstanceId.clear();

		this.scene = null;
        this.experience = null;
        this.config = null;
		console.log("AgentManager: Détruit.");
	}

    /**
     * Trouve le point le plus proche sur le NavMesh, avec une recherche étendue si nécessaire.
     * @param {THREE.Vector3} position - La position à snapper
     * @param {number} maxDistanceSearch - Distance maximale de recherche (défaut: 10)
     * @returns {object|null} Le résultat du snapping ou null si aucun point valide trouvé
     */
    findNearestNode(position, maxDistanceSearch = 10) {
        // SOLUTION TEMPORAIRE: Retourner systématiquement un point valide
        // En réalité, cette fonction devrait communiquer avec le worker NavMesh
        
        // Créer une copie de la position et forcer sa hauteur à celle du trottoir
        const snappedPos = position.clone();
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;
        snappedPos.y = sidewalkHeight;
        
        // Retourner toujours un résultat positif
        return {
            position: snappedPos,
            distance: 0
        };
    }
}