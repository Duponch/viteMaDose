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

        // Pooling
        this.activeCount = 0;
        this.instanceIdToAgent = new Array(maxAgents);
        this.agentToInstanceId = new Map();

        this.agents = [];
        this.instanceMeshes = {};
        this.baseGeometries = {};
        this.baseMaterials = {};

        this.headRadius = 2.5; // Sera écrasée par _initializeMeshes

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

        // --- Pathfinding Worker & HPA State ---
        this.pathfindingWorker = null;
        this.isGridWorkerInitialized = false; // État pour la grille fine
        this.isHPAWorkerInitialized = false;  // État pour le graphe HPA
        this.pendingHPAData = null; // Données HPA en attente d'envoi

        // Statistiques
        this.stats = {
            pathsToWorkByHour: {},
            pathsToHomeByHour: {},
        };
        this._initializeStats();

        // Création des meshes instanciés
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

    /**
     * Initialise le Pathfinding Worker en lui envoyant d'abord les données de la grille fine.
     * Stocke les données HPA préparées pour les envoyer ultérieurement.
     * @param {import('./NavigationGraph.js').default} navigationGraph - Le graphe de navigation bas niveau contenant la grille et les paramètres.
     */
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
            // Création du worker
            this.pathfindingWorker = new Worker(new URL('./PathfindingWorker.js', import.meta.url), { type: 'module' });
            this.pathfindingWorker.onmessage = (event) => this._handleWorkerMessage(event);
            this.pathfindingWorker.onerror = (error) => {
                console.error("AgentManager: Erreur dans Pathfinding Worker:", error);
                this.isGridWorkerInitialized = false; // Marquer comme non initialisé en cas d'erreur
                this.isHPAWorkerInitialized = false;
                this.pathfindingWorker = null; // Permettre une nouvelle tentative peut-être
            };

            // Préparer les données de la grille fine
            // Accès sécurisé aux nœuds
            const nodesWalkable = navigationGraph.grid.nodes?.map(row =>
                row?.map(node => node.walkable ?? false) ?? [] // Gérer ligne ou nœud potentiellement undefined
            ) ?? []; // Gérer grille ou nœuds potentiellement undefined

            // Vérification supplémentaire après la préparation
             if (nodesWalkable.length !== navigationGraph.gridHeight || (navigationGraph.gridHeight > 0 && nodesWalkable[0].length !== navigationGraph.gridWidth)) {
                 console.error("AgentManager: Incohérence détectée dans les dimensions de nodesWalkable après création.");
                 throw new Error("Incohérence des dimensions de la grille pour l'initialisation du worker.");
             }

            const gridData = {
                width: navigationGraph.gridWidth,
                height: navigationGraph.gridHeight,
                nodesWalkable: nodesWalkable
            };

            // Préparer les paramètres de conversion
            const conversionParams = {
                gridScale: navigationGraph.gridScale,
                offsetX: navigationGraph.offsetX,
                offsetZ: navigationGraph.offsetZ,
                sidewalkHeight: navigationGraph.sidewalkHeight
            };

            // Stocker les données HPA préparées par CityManager en attente
            const cityManager = this.experience.world?.cityManager;
            // Utiliser directement le graphe abstrait sérialisé, s'il est prêt
            const abstractGraphInstance = cityManager?.getAbstractGraph();
            if (abstractGraphInstance && abstractGraphInstance.nodes.size > 0) {
                try {
                    this.pendingHPAData = abstractGraphInstance.serialize(); // Sérialiser ici
                     console.log("AgentManager: Données HPA sérialisées et prêtes à être envoyées au worker.");
                } catch (serializeError) {
                     console.error("AgentManager: Erreur lors de la sérialisation du graphe HPA:", serializeError);
                     this.pendingHPAData = null;
                }
            } else {
                console.warn("AgentManager: Graphe abstrait non disponible ou vide via CityManager lors de l'init worker. HPA ne sera pas initialisé.");
                this.pendingHPAData = null;
            }


            // Envoyer SEULEMENT l'init de la grille fine pour l'instant
            this.pathfindingWorker.postMessage({
                type: 'initGrid', // Utiliser le type spécifique
                data: { gridData, conversionParams }
            });
            console.log("AgentManager: Message 'initGrid' envoyé au worker.");

        } catch (error) {
            console.error("AgentManager: Échec de la création ou de l'initialisation du Pathfinding Worker:", error);
            if (this.pathfindingWorker) {
                this.pathfindingWorker.terminate(); // Assurer la terminaison en cas d'erreur
            }
            this.pathfindingWorker = null;
            this.isGridWorkerInitialized = false;
            this.isHPAWorkerInitialized = false;
        }
    }

    /**
     * Gère les messages reçus du Pathfinding Worker.
     * @param {MessageEvent} event - L'événement de message du worker.
     */
    _handleWorkerMessage(event) {
        const { type, data, error } = event.data;
        // console.log("[AgentManager] Message reçu du worker:", type, data); // Utile pour le debug

        try {
            switch (type) {
                case 'gridInitComplete':
                    this.isGridWorkerInitialized = true;
                    console.log("AgentManager: Worker a confirmé l'initialisation de la grille fine.");

                    // Envoyer les données HPA si elles sont en attente
                    if (this.pendingHPAData) {
                        console.log("AgentManager: Envoi des données HPA (sérialisées) au worker...");
                        this.pathfindingWorker.postMessage({
                            type: 'initHPA',
                            // Les données ont déjà été sérialisées dans initializePathfindingWorker
                            data: { abstractGraphData: this.pendingHPAData }
                        });
                        this.pendingHPAData = null; // Nettoyer après envoi
                    } else {
                        console.warn("AgentManager: Pas de données HPA en attente à envoyer au worker après gridInitComplete.");
                        this.isHPAWorkerInitialized = false; // Assurer que HPA n'est pas marqué comme prêt
                    }
                    break;

                case 'hpaInitComplete':
                    this.isHPAWorkerInitialized = true;
                    console.log("AgentManager: Worker a confirmé l'initialisation HPA.");
                    // Peut-être déclencher des actions qui dépendaient de HPA prêt ici
                    break;

                case 'pathResult': // Résultat d'un chemin détaillé (JPS)
                    if (data && data.agentId && data.path !== undefined && data.pathLengthWorld !== undefined) {
                        const { agentId, path: worldPathData, pathLengthWorld } = data;
                        const agent = this.getAgentById(agentId);
                        if (agent) {
                            let finalWorldPath = null;
                            // Reconstruire les Vector3
                            if (worldPathData && Array.isArray(worldPathData) && worldPathData.length > 0) {
                                try {
                                    finalWorldPath = worldPathData.map(posData => new THREE.Vector3(posData.x, posData.y, posData.z));
                                } catch (vecError) {
                                    console.error(`Agent ${agentId}: Erreur reconstruction Vector3 pour pathResult:`, vecError);
                                    finalWorldPath = null;
                                }
                            }
                            // Appeler la méthode spécifique sur l'agent pour chemin détaillé
                            // Assurez-vous que cette méthode existe dans Agent.js
                            agent.setDetailPath(finalWorldPath, pathLengthWorld);
                        } else {
                            console.warn(`AgentManager: Agent ${agentId} non trouvé pour pathResult.`);
                        }
                    } else {
                        console.warn("AgentManager: Message 'pathResult' incomplet reçu:", event.data);
                    }
                    break;

                case 'abstractPathResult': // Résultat d'un chemin abstrait (séquence de portes)
                     if (data && data.agentId && data.path !== undefined) { // path peut être null ici
                        const { agentId: abstractAgentId, path: gateSequence } = data;
                        const agent = this.getAgentById(abstractAgentId);
                        if (agent) {
                            // Appeler la méthode spécifique sur l'agent pour chemin abstrait
                            // Assurez-vous que cette méthode existe dans Agent.js
                            agent.setAbstractPath(gateSequence);
                        } else {
                            console.warn(`AgentManager: Agent ${abstractAgentId} non trouvé pour abstractPathResult.`);
                        }
                    } else {
                         console.warn("AgentManager: Message 'abstractPathResult' incomplet reçu:", event.data);
                    }
                    break;

                case 'workerError':
                    console.error("AgentManager: Erreur rapportée par le worker:", error, "Data associée:", data);
                    // Informer l'agent concerné si possible
                    if (data?.agentId) {
                        const agentWithError = this.getAgentById(data.agentId);
                        if (agentWithError) {
                            // Déterminer quelle requête a échoué si possible (peut nécessiter plus d'infos dans l'erreur)
                            // Pour l'instant, on suppose que l'agent gère l'échec dans setDetailPath/setAbstractPath
                            console.warn(`AgentManager: Notifying agent ${data.agentId} about worker error.`);
                            // Exemple : Forcer un reset de chemin sur l'agent
                            // agentWithError.setDetailPath(null, 0); // Ou une méthode plus générique d'échec
                            // agentWithError.setAbstractPath(null);
                        }
                    }
                    break;

                default:
                    console.warn("AgentManager: Type de message inconnu reçu du worker:", type);
            }
        } catch (handlerError) {
             console.error(`AgentManager: Erreur dans _handleWorkerMessage pour le type ${type}:`, handlerError);
             // Tenter d'informer l'agent si possible
             if (data?.agentId) {
                 const agentOnError = this.getAgentById(data.agentId);
                 // Informer l'agent de l'échec...
             }
        }
    }

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

    /**
     * Envoie une requête de pathfinding (détaillé ou abstrait) au worker.
     * @param {string} agentId - ID de l'agent demandeur.
     * @param {'findDetailPath' | 'findAbstractPath'} requestType - Le type de chemin demandé.
     * @param {object} pathData - Données spécifiques à la requête:
     * - pour 'findDetailPath': { startNode: {x, y}, endNode: {x, y} }
     * - pour 'findAbstractPath': { startGateNodeId: number, endGateNodeId: number }
     */
    requestPathFromWorker(agentId, requestType, pathData) {
        const agent = this.getAgentById(agentId); // Récupérer l'agent pour notifier en cas d'échec précoce

        // Vérifier si le worker est prêt pour le type de requête demandé
        if (!this.pathfindingWorker || !this.isGridWorkerInitialized) {
            console.error(`AgentManager: Worker (grille) non prêt pour requête ${requestType} Agent ${agentId}.`);
            if (agent) {
                if (requestType === 'findAbstractPath') agent.setAbstractPath(null);
                else agent.setDetailPath(null, 0);
            }
            return;
        }
        if (requestType === 'findAbstractPath' && !this.isHPAWorkerInitialized) {
            console.error(`AgentManager: Worker (HPA) non prêt pour requête ${requestType} Agent ${agentId}.`);
            if (agent) agent.setAbstractPath(null);
            return;
        }

        // Valider les données et construire le message
        let message;
        if (requestType === 'findDetailPath') {
             if (!pathData || !pathData.startNode || !pathData.endNode ||
                 typeof pathData.startNode.x !== 'number' || typeof pathData.startNode.y !== 'number' ||
                 typeof pathData.endNode.x !== 'number' || typeof pathData.endNode.y !== 'number') {
                 console.error(`AgentManager: Données invalides pour findDetailPath Agent ${agentId}:`, pathData);
                 if(agent) agent.setDetailPath(null, 0);
                 return;
             }
             message = {
                 type: 'findDetailPath',
                 data: { agentId, startNode: pathData.startNode, endNode: pathData.endNode }
             };
        } else if (requestType === 'findAbstractPath') {
            if (!pathData || pathData.startGateNodeId === undefined || pathData.endGateNodeId === undefined) {
                 console.error(`AgentManager: Données invalides pour findAbstractPath Agent ${agentId}:`, pathData);
                 if(agent) agent.setAbstractPath(null);
                 return;
            }
             message = {
                 type: 'findAbstractPath',
                 data: { agentId, startGateNodeId: pathData.startGateNodeId, endGateNodeId: pathData.endGateNodeId }
             };
        } else {
            console.error(`AgentManager: Type de requête inconnu '${requestType}' pour Agent ${agentId}.`);
             // Informer l'agent ? Comment déterminer quel type d'échec notifier ?
             if (agent) { /* Peut-être une méthode agent.notifyPathRequestFailure() ? */ }
            return;
        }

        // Envoyer le message au worker
        // console.log(`AgentManager: Envoi requête ${requestType} au worker pour Agent ${agentId}:`, message.data); // Debug
        this.pathfindingWorker.postMessage(message);
    }

    // 2) _initializeMeshes (modifiée pour démarrer à count=0)
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
		// Si le pool est plein, on n’en crée pas plus
		if (this.activeCount >= this.maxAgents) {
			return null;
		}
	
		// 1) création de la logique
		const agentConfig = {
			scale: this.config.agentScale ?? 0.1,
			speed: (this.config.agentWalkSpeed ?? 2.5) * (0.8 + Math.random() * 0.4),
			rotationSpeed: (this.config.agentRotationSpeed ?? 8.0) * (0.9 + Math.random() * 0.2),
			yOffset: this.config.agentYOffset ?? 0.3,
			torsoColor: new THREE.Color(Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1),
			debugPathColor: null
		};
		agentConfig.torsoColorHex = agentConfig.torsoColor.getHex();
		agentConfig.debugPathColor = agentConfig.torsoColorHex;
		const instanceId = this.activeCount;                 // on prend la prochaine case libre
		const newAgent = new Agent(agentConfig, instanceId, this.experience);
	
		// enregistrement, assignment home/work…
		const cityManager = this.experience.world?.cityManager;
		let initializationSuccess = false;
		if (cityManager) {
			const citizenInfo = cityManager.registerCitizen(newAgent.id, newAgent);
			const homeAssigned = cityManager.assignHomeToCitizen(citizenInfo.id);
			const workAssigned = cityManager.assignWorkplaceToCitizen(citizenInfo.id);
			if (homeAssigned) {
				newAgent.initializeLifecycle(citizenInfo.homeBuildingId, citizenInfo.workBuildingId);
				initializationSuccess = true;
			} else {
				newAgent.currentState = 'IDLE';
				newAgent.isVisible = false;
			}
		} else {
			newAgent.currentState = 'IDLE';
			newAgent.isVisible = false;
		}
	
		// 2) on ajoute à nos listes
		this.agents.push(newAgent);
		this.instanceIdToAgent[instanceId] = newAgent.id;
		this.agentToInstanceId.set(newAgent.id, instanceId);
		this.activeCount++;
	
		// 3) on informe three.js qu’on a plus d’instances actives
		Object.values(this.instanceMeshes).forEach(mesh => mesh.count = this.activeCount);
	
		// 4) on initialise la matrice / couleur de ce slot
		// … (votre code existant pour setMatrixAt et setColorAt sur instanceId) …
		this.instanceMeshes.torso.instanceColor?.setXYZ(instanceId,
			newAgent.torsoColor.r, newAgent.torsoColor.g, newAgent.torsoColor.b);
		this.instanceMeshes.torso.instanceColor.needsUpdate = true;
		// idem pour head, hand, shoe…
	
		Object.values(this.instanceMeshes).forEach(mesh => {
			mesh.instanceMatrix.needsUpdate = true;
		});
	
		return newAgent;
	}

	releaseAgent(agentId) {
		const freedId = this.agentToInstanceId.get(agentId);
		if (freedId === undefined) return; // pas trouvé
	
		const lastId = this.activeCount - 1;
		// 1) swapper si ce n’est pas la dernière instance
		if (freedId !== lastId) {
			Object.values(this.instanceMeshes).forEach(mesh => {
				// swap matrices
				const m = new THREE.Matrix4();
				mesh.getMatrixAt(lastId, m);
				mesh.setMatrixAt(freedId, m);
				// swap couleurs si elles existent
				if (mesh.instanceColor) {
					const color = new THREE.Color();
					mesh.instanceColor.getColor(lastId, color);
					mesh.instanceColor.setXYZ(freedId, color.r, color.g, color.b);
				}
				mesh.instanceMatrix.needsUpdate = true;
				if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			});
			// mettre à jour le mapping de l’agent déplacé
			const movedAgentId = this.instanceIdToAgent[lastId];
			this.instanceIdToAgent[freedId] = movedAgentId;
			this.agentToInstanceId.set(movedAgentId, freedId);
		}
	
		// 2) décrémenter le compteur
		this.activeCount--;
		Object.values(this.instanceMeshes).forEach(mesh => {
			mesh.count = this.activeCount;
		});
	
		// 3) nettoyer le mapping pour l’agent libéré
		this.instanceIdToAgent[lastId] = undefined;
		this.agentToInstanceId.delete(agentId);
	
		// 4) retirer la logique
		const idx = this.agents.findIndex(a => a.id === agentId);
		if (idx !== -1) this.agents.splice(idx, 1);
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
		const environment        = this.experience.world.environment;
		const currentGameTime    = this.experience.time.elapsed;
		const isDebug            = this.experience.isDebugMode;
		const debugMarkerScale   = isDebug ? 1.0 : 0;
		const fixedMarkerYOffset = 5.0;

		// 1. Logique
		this.agents.forEach(agent => {
			agent.updateState(deltaTime, environment.getCurrentHour(), currentGameTime);
		});

		// 2. Visuels
		let needsBodyMatrixUpdate   = false;
		let needsColorUpdate        = this.instanceMeshes.torso.instanceColor?.needsUpdate || false;
		let needsAgentMarkerUpdate  = false;
		let needsHomeMarkerUpdate   = false;
		let needsWorkMarkerUpdate   = false;

		for (const agent of this.agents) {
			const instanceId = this.agentToInstanceId.get(agent.id);
			if (instanceId === undefined) continue;

			// Met à jour la position/orientation de base
			agent.updateVisuals(deltaTime, currentGameTime);
			const actualScale = agent.isVisible ? agent.scale : 0;
			this.tempScale.set(actualScale, actualScale, actualScale);
			this.agentMatrix.compose(agent.position, agent.orientation, this.tempScale);

			// Mise à jour des parties du corps…
			const updatePart = (pName, mName, idxMult = 1, idxOff = 0) => {
				const idx = instanceId * idxMult + idxOff;
				const mesh = this.instanceMeshes[mName];
				if (!mesh || idx >= mesh.count) return;

				if (agent.isVisible) {
					const offsetMatrix    = this._getPartLocalOffsetMatrix(pName);
					const animationMatrix = agent.currentAnimationMatrix[pName] || new THREE.Matrix4();
					this.tempMatrix.multiplyMatrices(offsetMatrix, animationMatrix);
					this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix);
					mesh.setMatrixAt(idx, this.finalPartMatrix);
				} else {
					this.tempMatrix.identity().scale(new THREE.Vector3(0,0,0));
					mesh.setMatrixAt(idx, this.tempMatrix);
				}
			};
			updatePart('head',     'head');
			updatePart('torso',    'torso');
			updatePart('leftHand', 'hand', 2, 0);
			updatePart('rightHand','hand', 2, 1);
			updatePart('leftFoot', 'shoe', 2, 0);
			updatePart('rightFoot','shoe', 2, 1);
			needsBodyMatrixUpdate = true;

			// Couleur du torse
			if (this.instanceMeshes.torso.instanceColor) {
				this.tempColor.setHex(agent.torsoColor.getHex());
				this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
				needsColorUpdate = true;
			}

			// Debug marker (agentMarker)
			const markerMesh = this.instanceMeshes.agentMarker;
			if (markerMesh) {
				if (isDebug) {
					// Composer la matrice du losange au-dessus de l’agent
					this.tempMatrix.identity();
					this.tempMatrix.makeTranslation(
						agent.position.x,
						agent.position.y + fixedMarkerYOffset,
						agent.position.z
					);
					this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale);
					this.tempMatrix.scale(this.tempScale);
				} else {
					// Masquer le losange (échelle 0)
					this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
				}
				markerMesh.setMatrixAt(instanceId, this.tempMatrix);
				needsAgentMarkerUpdate = true;
			}

			// … Vous pouvez appliquer la même logique pour homeMarker & workMarker si nécessaire …
		}

		// 3. Pousser vers le GPU
		if (needsBodyMatrixUpdate) {
			['head','torso','hand','shoe'].forEach(k => {
				const mesh = this.instanceMeshes[k];
				if (mesh?.instanceMatrix) {
					mesh.instanceMatrix.needsUpdate = true;
					if (k==='head' || k==='torso') mesh.computeBoundingSphere();
				}
			});
		}
		if (needsColorUpdate)        this.instanceMeshes.torso.instanceColor.needsUpdate = true;
		if (needsAgentMarkerUpdate)  this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true;
		if (needsHomeMarkerUpdate)   this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true;
		if (needsWorkMarkerUpdate)   this.instanceMeshes.workMarker.instanceMatrix.needsUpdate = true;
	}

	removeAgent(agentId) {
		// 1) on supprime la logique
		const idx = this.agents.findIndex(a => a.id === agentId);
		if (idx !== -1) this.agents.splice(idx, 1);

		// 2) on libère le slot visuel
		this.releaseAgent(agentId);
	}

    /**
     * Nettoie les ressources utilisées par AgentManager, y compris le worker.
     */
    destroy() {
        console.log("AgentManager: Destruction...");

        // Arrêter et nettoyer le worker
        if (this.pathfindingWorker) {
            this.pathfindingWorker.terminate();
            this.pathfindingWorker = null;
            this.isGridWorkerInitialized = false;
            this.isHPAWorkerInitialized = false;
            this.pendingHPAData = null;
            console.log("AgentManager: Pathfinding Worker terminé.");
        }

        // Supprimer les agents (logique et visuel via releaseAgent)
        // Copier les IDs car this.agents sera modifié par removeAgent
        const agentIdsToRemove = this.agents.map(a => a.id);
        agentIdsToRemove.forEach(agentId => {
            this.removeAgent(agentId); // removeAgent appelle releaseAgent
             // Assurer que l'agent logique est détruit aussi
             // Note: removeAgent retire de this.agents, donc pas besoin de trouver l'index ici
        });
        this.agents = []; // Vider explicitement après la boucle
        console.log("AgentManager: Agents logiques et visuels détruits/libérés.");


        // Nettoyer les InstancedMeshes restants (au cas où releaseAgent aurait manqué quelque chose)
        Object.values(this.instanceMeshes).forEach(mesh => {
            if (mesh.parent) mesh.parent.remove(mesh);
            // Dispose material CLONE (celui de InstancedMesh)
             // Vérifier si le matériau existe et est différent du matériau de base avant de disposer
             if (mesh.material) {
                 const baseMatKey = mesh.name.replace('Instances','').toLowerCase();
                 if (mesh.material !== this.baseMaterials[baseMatKey]) {
                     mesh.material.dispose?.();
                 }
             }
        });
        this.instanceMeshes = {};
        console.log("AgentManager: InstancedMeshes retirés & matériaux clonés disposés.");

        // Disposer les géométries de base partagées
        Object.values(this.baseGeometries).forEach(geom => { geom?.dispose(); });
        this.baseGeometries = {};
        console.log("AgentManager: Géométries base disposées.");

        // Disposer les matériaux de base partagés
        Object.values(this.baseMaterials).forEach(mat => { mat?.dispose(); });
        this.baseMaterials = {};
        console.log("AgentManager: Matériaux base disposés.");

        // Nullifier les références
        this.scene = null;
        this.experience = null;
        this.config = null;
        this.agentToInstanceId.clear();
        this.instanceIdToAgent = [];
        this.stats = {};

        console.log("AgentManager: Détruit.");
    }
}