// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import WorkScheduleStrategy from '../Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from '../Strategies/WeekendWalkStrategy.js';

// --- Fonctions createCapsuleGeometry, createShoeGeometry (INCHANGÉES) ---
// ... (coller les fonctions ici) ...
function createCapsuleGeometry(radius, length, radialSegments = 16, heightSegments = 1) {
    const cylinderHeight = length; const sphereRadius = radius; const geometries = [];
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, radialSegments, heightSegments); geometries.push(cylinderGeometry);
    const topSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2); topSphereGeometry.translate(0, cylinderHeight / 2, 0); geometries.push(topSphereGeometry);
    const bottomSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2); bottomSphereGeometry.rotateX(Math.PI); bottomSphereGeometry.translate(0, -cylinderHeight / 2, 0); geometries.push(bottomSphereGeometry);
    const mergedGeometry = mergeGeometries(geometries, false); geometries.forEach(geom => geom.dispose()); return mergedGeometry;
 }
/**
 * Crée les géométries séparées pour le dessus et la semelle d'une chaussure.
 * @returns {{top: THREE.BufferGeometry, sole: THREE.BufferGeometry}} Un objet contenant les deux géométries.
 */
function createShoeGeometry() {
    const shoeRadius = 1.2; // Rayon de base
    const soleHeight = 0.4; // Hauteur de la semelle
    const shoeTopScale = new THREE.Vector3(1.0, 0.6, 1.5); // Échelle pour aplatir/allonger

    // Partie supérieure (demi-sphère inversée)
    const topPartGeometry = new THREE.SphereGeometry(shoeRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    topPartGeometry.rotateX(Math.PI); // Orienter la partie plate vers le haut (qui sera le bas de la chaussure)

    // Semelle (cylindre)
    const soleGeometry = new THREE.CylinderGeometry(shoeRadius, shoeRadius, soleHeight, 32);
    // Positionner le *haut* de la semelle à y=0 pour qu'elle soit sous la partie supérieure
    soleGeometry.translate(0, -soleHeight / 2, 0);

    // Appliquer l'échelle aux géométries pour obtenir la forme désirée
    topPartGeometry.scale(shoeTopScale.x, shoeTopScale.y, shoeTopScale.z);
    soleGeometry.scale(shoeTopScale.x, shoeTopScale.y, shoeTopScale.z); // Échelle la semelle aussi

    // Retourner les géométries séparées pour pouvoir potentiellement utiliser des matériaux différents
    // Mais pour InstancedMesh, nous allons les fusionner plus tard.
    return { top: topPartGeometry, sole: soleGeometry };
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
		this.activeCount = 0;                             // Nombre d'agents réellement actifs
		this.instanceIdToAgent = new Array(maxAgents);    // instanceId → agent.id
		this.agentToInstanceId = new Map();               // agent.id → instanceId

		this.agents = [];
		this.instanceMeshes = {};
		this.baseGeometries = {};
		this.baseMaterials = {};

		// Constantes pour la géométrie
		this.headRadius = this.config.headRadius ?? 2.5;
		this.headLength = this.config.headLength ?? 1.0; // Longueur partie cylindrique tête

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

		this.stats = {
			pathsToWorkByHour: {},
			pathsToHomeByHour: {},
			requestingPathForWorkByHour: {},
			requestingPathForHomeByHour: {},
		};
		this._initializeStats();

		this._initializeMeshes();
		console.log("AgentManager initialisé (Worker non démarré).");
	}

	_initializeStats() {
        this.stats.pathsToWorkByHour = {};
        this.stats.pathsToHomeByHour = {};
        this.stats.requestingPathForWorkByHour = {};
        this.stats.requestingPathForHomeByHour = {};
        for (let i = 0; i < 24; i++) {
            this.stats.pathsToWorkByHour[i] = 0;
            this.stats.pathsToHomeByHour[i] = 0;
            this.stats.requestingPathForWorkByHour[i] = 0;
            this.stats.requestingPathForHomeByHour[i] = 0;
        }
    }

    // --- MODIFICATION : Initialise le Worker avec les DEUX grilles ---
    initializePathfindingWorker(navigationManager) { // <-- Prend NavigationManager
        if (this.pathfindingWorker) {
            console.warn("AgentManager: Tentative de réinitialiser le worker déjà existant.");
            return;
        }
        // --- MODIFICATION: Vérifier navigationManager --- 
        if (!navigationManager) {
            console.error("AgentManager: Impossible d'initialiser le worker - NavigationManager manquant.");
            return;
        }
        // --- FIN MODIFICATION ---

        try {
            console.log("AgentManager: Initialisation du Pathfinding Worker (mode SharedArrayBuffer)... HORS LIGNE");
            this.pathfindingWorker = new Worker(new URL('../Navigation/PathfindingWorker.js', import.meta.url), { type: 'module' });
            this.pathfindingWorker.onmessage = (event) => this._handleWorkerMessage(event);
            this.pathfindingWorker.onerror = (error) => { 
                 console.error("AgentManager: Erreur dans Pathfinding Worker:", error);
                 this.pathfindingWorker = null;
                 this.isWorkerInitialized = false;
             }; // <-- Gestion erreur worker améliorée

            // --- MODIFICATION: Obtenir les données des DEUX grilles ---
            const workerInitData = navigationManager.getAllGridDataForWorker();
            // --- FIN MODIFICATION ---

            // --- MODIFICATION: Vérifier les nouvelles données --- 
            if (!workerInitData || !workerInitData.pedestrian || !workerInitData.road || 
                !workerInitData.pedestrian.gridBuffer || !workerInitData.road.gridBuffer) {
                console.error("AgentManager: Échec de la récupération des données combinées de grille depuis NavigationManager.");
                 if (this.pathfindingWorker) this.pathfindingWorker.terminate();
                 this.pathfindingWorker = null;
                return;
            }
            // --- FIN MODIFICATION ---

            this.pathfindingWorker.postMessage({
                type: 'init',
                data: workerInitData // <-- Envoyer les données combinées
            });
            console.log("AgentManager: Message d'initialisation combiné (SharedArrayBuffers + params) envoyé au worker.");

        } catch (error) {
            console.error("AgentManager: Échec de la création du Pathfinding Worker:", error);
            this.pathfindingWorker = null;
            this.isWorkerInitialized = false;
        }
    }
    // --- FIN MODIFICATION ---

	_handleWorkerMessage(event) {
		const { type, data, error } = event.data;
		console.log(`[AgentManager DEBUG] Message reçu du worker: type=<span class="math-inline">\{type\}, agentId\=</span>{data?.agentId}`); // LOG 1

		if (type === 'initComplete') {
			this.isWorkerInitialized = true;
			console.log("AgentManager: Pathfinding Worker initialisé et prêt.");

		} else if (type === 'pathResult') {
			if (data && data.agentId && data.path !== undefined && data.pathLengthWorld !== undefined) {
				const { agentId, path: worldPathData, pathLengthWorld } = data;
				console.log(`[AgentManager DEBUG] pathResult reçu pour Agent ${agentId}. Longueur Monde: ${pathLengthWorld}`); // LOG 2

				const agent = this.getAgentById(agentId);

				if (agent) {
					console.log(`[AgentManager DEBUG] Agent ${agentId} trouvé. Vérification chemin reçu...`); // LOG 3 Modifié
					let finalWorldPath = null;

					// --- MODIFICATION : Gestion explicite de worldPathData null/vide ---
					if (worldPathData && Array.isArray(worldPathData) && worldPathData.length > 0) {
						try {
							finalWorldPath = worldPathData.map(posData => new THREE.Vector3(posData.x, posData.y, posData.z));
							console.log(`[AgentManager DEBUG] Chemin valide reçu et reconstruit pour Agent ${agentId} (${finalWorldPath.length} points).`); // LOG 4 Modifié
						} catch (vecError) {
							console.error(`[AgentManager ERREUR] Agent ${agentId}: Erreur reconstruction Vector3:`, vecError); // LOG ERREUR
							finalWorldPath = null; // Assurer que le chemin est null en cas d'erreur de reconstruction
						}
					} else {
						// Cas où le worker a renvoyé path: null (ou un chemin vide)
						console.warn(`[AgentManager WARN] Chemin non trouvé ou invalide reçu du worker pour Agent ${agentId} (path: ${worldPathData === null ? 'null' : 'vide'}).`); // LOG 5 Modifié
						finalWorldPath = null;
					}
					// --- FIN MODIFICATION ---

					// Appel setPath (maintenant gère aussi finalWorldPath = null)
					console.log(`[AgentManager DEBUG] Appel de agent.setPath pour Agent ${agentId}...`); // LOG 6
					agent.setPath(finalWorldPath, finalWorldPath ? pathLengthWorld : 0); // Passer 0 si chemin nul
					console.log(`[AgentManager DEBUG] Appel de agent.setPath TERMINÉ pour Agent ${agentId}.`); // LOG 7

				} else {
					console.warn(`[AgentManager WARN] Agent ${agentId} non trouvé pour le résultat du chemin.`); // LOG WARN
				}
			} else {
				console.warn("[AgentManager WARN] Message 'pathResult' incomplet reçu:", event.data); // LOG WARN
			}
		} else if (type === 'workerError') {
			console.error("[AgentManager ERREUR Worker]:", error, "Data:", data); // LOG ERREUR Worker
			// ... (gestion erreur)
		} else {
			console.warn("[AgentManager WARN] Type de message inconnu reçu du worker:", type); // LOG WARN
		}
	}
    // --- FIN NOUVELLE MÉTHODE ---

	getAgentStats() {
        // Regrouper les agents par état actuel
        const agentsByState = {};
         // Initialiser tous les états possibles pour éviter les clés manquantes
        Object.values(Agent.prototype.constructor.AgentState || { // Accès à l'enum AgentState via Agent.js
            AT_HOME: 'AT_HOME', 
            GOING_TO_WORK: 'GOING_TO_WORK', 
            AT_WORK: 'AT_WORK',
            GOING_HOME: 'GOING_HOME', 
            IDLE: 'IDLE', 
            WAITING_FOR_PATH: 'WAITING_FOR_PATH',
            REQUESTING_PATH_FOR_WORK: 'REQUESTING_PATH_FOR_WORK',
            REQUESTING_PATH_FOR_HOME: 'REQUESTING_PATH_FOR_HOME',
            WEEKEND_WALK_PREPARING: 'WEEKEND_WALK_PREPARING',
            WEEKEND_WALK_REQUESTING_PATH: 'WEEKEND_WALK_REQUESTING_PATH',
            WEEKEND_WALK_READY: 'WEEKEND_WALK_READY',
            WEEKEND_WALKING: 'WEEKEND_WALKING'
        }).forEach(state => agentsByState[state] = []);

        if (this.agents) {
            const AgentState = Agent.prototype.constructor.AgentState;
            this.agents.forEach(agent => {
                let state = agent.currentState || AgentState.IDLE;

                // --- Ajustement cohérence : si l'agent a déjà atteint sa destination mais que son état logique n'a pas encore changé ---
                if (agent.hasReachedDestination) {
                    if (state === AgentState.IN_TRANSIT_TO_WORK || state === AgentState.DRIVING_TO_WORK) {
                        state = AgentState.AT_WORK;
                    } else if (state === AgentState.IN_TRANSIT_TO_HOME || state === AgentState.DRIVING_HOME) {
                        state = AgentState.AT_HOME;
                    }
                    // Cas promenade week-end : considérer comme AT_HOME quand terminé
                    else if (state === AgentState.WEEKEND_WALKING) {
                        state = AgentState.AT_HOME;
                    }
                }

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
            requestingPathForWorkByHour: { ...this.stats.requestingPathForWorkByHour },
            requestingPathForHomeByHour: { ...this.stats.requestingPathForHomeByHour },
        };
    }

    // --- NOUVELLE MÉTHODE : Demande un chemin au Worker ---
    requestPathFromWorker(agentId, startNode, endNode, isVehicle) {
        if (!this.pathfindingWorker || !this.isWorkerInitialized) {
            console.error(`AgentManager: Worker non prêt pour requête path Agent ${agentId}.`);
            // Informer l'agent de l'échec ?
             const agent = this.getAgentById(agentId);
             if(agent) agent.setPath(null, 0); // Indiquer échec à l'agent
            return;
        }
        if(!startNode || !endNode) {
             console.error(`AgentManager: StartNode ou EndNode invalide pour requête path Agent ${agentId}.`);
             const agent = this.getAgentById(agentId);
             if(agent) agent.setPath(null, 0);
             return;
        }

        console.log(`AgentManager: Envoi requête path au worker pour Agent ${agentId} (${isVehicle ? 'véhicule' : 'piéton'}): (${startNode.x},${startNode.y}) -> (${endNode.x},${endNode.y})`);
        this.pathfindingWorker.postMessage({
            type: 'findPath',
            data: { agentId, startNode, endNode, isVehicle }
        });
    }
    // --- FIN NOUVELLE MÉTHODE ---

    // 2) _initializeMeshes (modifiée pour démarrer à count=0)
	_initializeMeshes() {
		console.log("AgentManager: Initialisation des InstancedMesh...");
		// Matériaux (Ajout du matériau pour les cheveux)
		this.baseMaterials.skin = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1, name: 'AgentSkinMat' });
		// Torso Color sera appliqué par instance via vertexColors ou instanceColor
		this.baseMaterials.torso = new THREE.MeshStandardMaterial({
            color: this.config.torsoColor ?? 0x800080, // Couleur par défaut
            roughness: 0.5, metalness: 0.2, name: 'AgentTorsoMat',
            // vertexColors: true // Décommenter si on utilise des couleurs par vertex
        });
		this.baseMaterials.hand = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.7, metalness: 0.1, name: 'AgentHandMat' });
        // Matériaux séparés pour la chaussure (si on voulait des couleurs différentes)
		// this.baseMaterials.shoeTop = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.1, name: 'AgentShoeTopMat' });
		// this.baseMaterials.shoeSole = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, metalness: 0.1, name: 'AgentShoeSoleMat' });
        // Pour InstancedMesh, un seul matériau est plus simple
        this.baseMaterials.shoe = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.1, name: 'AgentShoeMat' });
        this.baseMaterials.hair = new THREE.MeshStandardMaterial({
            color: 0x332211, // Brun foncé
            roughness: 0.8, // Assez rugueux
            metalness: 0.1, // Peu métallique
            name: 'AgentHairMat'
        });
        this.baseMaterials.faceFeature = new THREE.MeshBasicMaterial({
            color: 0x000000, // Noir
            name: 'AgentFaceFeatureMat'
        });
		// Matériau pour le marqueur de débogage
        this.baseMaterials.agentMarker = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
		// this.baseMaterials.homeMarker = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
		// this.baseMaterials.workMarker = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });

		// Géométries de base
		const torsoRadius = this.config.torsoRadius ?? 1.5;
		const torsoLength = this.config.torsoLength ?? 1.5;
		const handRadius = this.config.handRadius ?? 0.8;
		const handLength = this.config.handLength ?? 1.0;

		// Créer la géométrie de la tête
		const headGeom = createCapsuleGeometry(this.headRadius, this.headLength, 32);
		// Créer la géométrie des cheveux et l'aplatir légèrement
		const hairGeom = new THREE.SphereGeometry(this.headRadius * 1.05, 32, 16);
		hairGeom.scale(0.95, 0.45, 0.95);
		// Appliquer le décalage local des cheveux avant fusion
		const hairOffset = this._getPartLocalOffsetMatrix('hair');
		hairGeom.applyMatrix4(hairOffset);

		// Créer les géométries pour les yeux et la bouche
		const eyeRadius = 0.3;
		const eyeGeom = new THREE.SphereGeometry(eyeRadius, 12, 8);
		const smileRadius = 0.6;
		const smileTube = 0.08;
		const smileStartAngle = Math.PI * 1.15;
		const smileArc = Math.PI * 0.7;
		const mouthGeom = new THREE.TorusGeometry(smileRadius, smileTube, 8, 25, smileArc, smileStartAngle);

		// Positionner les yeux et la bouche
		const eyeY = 0.3;
		const eyeX = 0.8;
		const eyeZ = this.headRadius * 0.9;
		const mouthY = -0.7;
		const mouthZ = this.headRadius;

		// Créer les matrices de transformation pour les yeux et la bouche
		const leftEyeMatrix = new THREE.Matrix4();
		leftEyeMatrix.makeTranslation(-eyeX, eyeY, eyeZ);
		const rightEyeMatrix = new THREE.Matrix4();
		rightEyeMatrix.makeTranslation(eyeX, eyeY, eyeZ);
		const mouthMatrix = new THREE.Matrix4();
		mouthMatrix.makeTranslation(0, mouthY, mouthZ);
		mouthMatrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 16));
		mouthMatrix.multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 1.15));

		// Appliquer les transformations aux géométries
		const leftEyeGeom = eyeGeom.clone().applyMatrix4(leftEyeMatrix);
		const rightEyeGeom = eyeGeom.clone().applyMatrix4(rightEyeMatrix);
		const mouthGeomTransformed = mouthGeom.clone().applyMatrix4(mouthMatrix);

		// Fusionner toutes les géométries
		this.baseGeometries.head = mergeGeometries([headGeom, hairGeom, leftEyeGeom, rightEyeGeom, mouthGeomTransformed], true);
		headGeom.dispose();
		hairGeom.dispose();
		eyeGeom.dispose();
		mouthGeom.dispose();
		leftEyeGeom.dispose();
		rightEyeGeom.dispose();
		mouthGeomTransformed.dispose();

		this.baseGeometries.torso = createCapsuleGeometry(torsoRadius, torsoLength, 24);
		this.baseGeometries.hand = createCapsuleGeometry(handRadius, handLength, 12);
		// Fusionner la chaussure existante
		const shoeParts = createShoeGeometry();
		this.baseGeometries.shoe = mergeGeometries([shoeParts.top, shoeParts.sole], false);
		shoeParts.top.dispose(); shoeParts.sole.dispose();

		// Géométrie pour le marqueur de débogage (losange)
        this.baseGeometries.agentMarker = new THREE.OctahedronGeometry(0.5);
		// this.baseGeometries.homeMarker = new THREE.BoxGeometry(0.6, 0.6, 0.6);
		// this.baseGeometries.workMarker = new THREE.SphereGeometry(0.4);


		// Création des InstancedMesh
		const createInstMesh = (name, geom, mat, count, needsColor = false) => {
			console.log(`Creating InstancedMesh '${name}' with count ${count}`);
			// Créer l'InstancedMesh en passant mat tel quel (material ou array de materials)
			const mesh = new THREE.InstancedMesh(geom, mat, count);
			// Si mat est un tableau (multi-material), activer la mise à jour des groupes
			if (Array.isArray(mat)) {
				mesh.geometry.groupsNeedUpdate = true;
			}
			mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			mesh.frustumCulled = false;
			mesh.name = `Agent_${name}_Instances`;
			if (needsColor) {
				mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
				mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
				console.log(` > Added instanceColor buffer to ${name}`);
			}
			this.scene.add(mesh);
			this.instanceMeshes[name] = mesh;
		};

        // Head fusionné avec cheveux : passer un tableau de matériaux (skin, hair)
        createInstMesh('head', this.baseGeometries.head, [
            this.baseMaterials.skin,
            this.baseMaterials.hair,
            this.baseMaterials.faceFeature,
            this.baseMaterials.faceFeature,
            this.baseMaterials.faceFeature
        ], this.maxAgents);
        createInstMesh('torso', this.baseGeometries.torso, this.baseMaterials.torso, this.maxAgents, true);
        createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2);
        createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2);

        // Créer les meshes pour les marqueurs de débogage
        if (this.experience.isDebugMode) {
             createInstMesh('agentMarker', this.baseGeometries.agentMarker, this.baseMaterials.agentMarker, this.maxAgents);
            // createInstMesh('homeMarker', this.baseGeometries.homeMarker, this.baseMaterials.homeMarker, this.maxAgents);
            // createInstMesh('workMarker', this.baseGeometries.workMarker, this.baseMaterials.workMarker, this.maxAgents);
        }

        // Réinitialiser le pool
        this.activeCount = 0;
        this.agentToInstanceId.clear();
        this.instanceIdToAgent.fill(null); // Remplir de null
		console.log("InstancedMeshes créés:", Object.keys(this.instanceMeshes));
	}

	createAgent() {
		// Si le pool est plein, on n'en crée pas plus
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
		
		// Créer les stratégies pour cet agent
		const workScheduleStrategy = new WorkScheduleStrategy();
		const weekendWalkStrategy = new WeekendWalkStrategy();
		
		const newAgent = new Agent(agentConfig, instanceId, this.experience, workScheduleStrategy, weekendWalkStrategy);
	
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

		// 2.1) Définir la couleur initiale de l'instance (une seule fois)
		if (this.instanceMeshes.torso?.instanceColor) {
			this.instanceMeshes.torso.setColorAt(instanceId, newAgent.torsoColor);
			// Important pour que la couleur soit envoyée au GPU la première fois (et si releaseAgent est utilisé)
			this.instanceMeshes.torso.instanceColor.needsUpdate = true; 
		}

		this.activeCount++;

		// Incrémenter les compteurs de rendu pour les nouvelles instances
		if (this.instanceMeshes.head) this.instanceMeshes.head.count = this.activeCount;
		if (this.instanceMeshes.torso) this.instanceMeshes.torso.count = this.activeCount;
		if (this.instanceMeshes.hand) this.instanceMeshes.hand.count = this.activeCount * 2;
		if (this.instanceMeshes.shoe) this.instanceMeshes.shoe.count = this.activeCount * 2;
		if (this.instanceMeshes.agentMarker) this.instanceMeshes.agentMarker.count = this.activeCount;
	
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
		// 1) swapper si ce n'est pas la dernière instance
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
			// mettre à jour le mapping de l'agent déplacé
			const movedAgentId = this.instanceIdToAgent[lastId];
			this.instanceIdToAgent[freedId] = movedAgentId;
			this.agentToInstanceId.set(movedAgentId, freedId);
		}
	
		// 2) décrémenter le compteur
		this.activeCount--;
		if (this.instanceMeshes.head) this.instanceMeshes.head.count = this.activeCount;
		if (this.instanceMeshes.torso) this.instanceMeshes.torso.count = this.activeCount;
		if (this.instanceMeshes.hand) this.instanceMeshes.hand.count = this.activeCount * 2;
		if (this.instanceMeshes.shoe) this.instanceMeshes.shoe.count = this.activeCount * 2;
		if (this.instanceMeshes.agentMarker) this.instanceMeshes.agentMarker.count = this.activeCount;
	
		// 3) nettoyer le mapping pour l'agent libéré
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
		const headY = this.config.headY ?? 6.0;
        const handX = this.config.handX ?? 3.0;
        const handY = this.config.handY ?? 1.0;
        const handBaseRotZ = this.config.handBaseRotZ ?? Math.PI / 12;
        // --- AJOUT: Inclinaison de base des mains depuis config ou défaut ---
        const handTiltX = this.config.handTiltX ?? Math.PI / 10; // Angle d'inclinaison (environ 18 degrés)

		const footX = this.config.footX ?? 1.8;
        const footY = this.config.footY ?? -3.5;
        const footZ = this.config.footZ ?? 0.5;

		switch (partType) {
			case 'head':
                this.partOffsetMatrix.makeTranslation(0, headY, 0);
                break;
            case 'torso':
                // Le torse est à l'origine locale
                break;
            case 'hair':
                // Décalage local des cheveux PAR RAPPORT à l'origine de la tête
                // Nouvelle position Y = (Centre Sphère Sup Tête) + (Petit Décalage) + (Demi-Hauteur Cheveux Aplaties)
                // Centre Sphère Sup Tête = headLength / 2
                // headLength vient des propriétés de la classe (this.headLength)
                // headRadius vient des propriétés de la classe (this.headRadius)
                const hairFlattenedHalfHeight = (this.headRadius * 1.05) * 0.45; // Utiliser le facteur d'échelle Y (0.45)
                const hairOffsetY = (this.headLength / 2) + (this.headRadius * 0.1) + hairFlattenedHalfHeight;
                const hairOffsetZ = this.headRadius * 0.1; // Légèrement vers l'avant
                this.partOffsetMatrix.makeTranslation(0, hairOffsetY, hairOffsetZ);
                break;
			case 'leftHand':
			case 'rightHand':
                const sign = partType === 'leftHand' ? -1 : 1;
                this.tempPosition.set(sign * handX, handY, 0);
                // --- MODIFICATION: Appliquer la rotation X pour l'inclinaison ---
                this.tempQuaternion.setFromEuler(new THREE.Euler(sign * -handTiltX, 0, sign * -handBaseRotZ, 'XYZ'));
                this.tempScale.set(1,1,1);
                this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                break;
			case 'leftFoot':
			case 'rightFoot':
                const footSign = partType === 'leftFoot' ? -1 : 1;
                this.partOffsetMatrix.makeTranslation(footSign * footX, footY, footZ);
                break;
		}
        return this.partOffsetMatrix;
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
		let needsBodyMatrixUpdate = false;
		let needsAgentMarkerUpdate = false;
		let needsHomeMarkerUpdate = false;

		// --- Ajout des déclarations des matrices temporaires ---
		const tempLocalOffsetMatrix = new THREE.Matrix4();
		const tempAnimationMatrix = new THREE.Matrix4();
		const tempPartWorldMatrix = new THREE.Matrix4(); // Matrice mondiale finale pour une partie
		const tempHairLocalOffset = this._getPartLocalOffsetMatrix('hair'); // Offset des cheveux relatif à la tête (calculé une fois)
		const tempHeadWorldMatrix = new THREE.Matrix4();

		for (const agent of this.agents) {
			const instanceId = this.agentToInstanceId.get(agent.id);
			if (instanceId === undefined) continue;

			// Met à jour la position/orientation de base
			agent.updateVisuals(deltaTime, currentGameTime);
			const actualScale = agent.isVisible ? agent.scale : 0;
			this.tempScale.set(actualScale, actualScale, actualScale);
			this.agentMatrix.compose(agent.position, agent.orientation, this.tempScale);

			// --- Mise à jour des parties du corps instanciées ---
			// Fonction utilitaire pour calculer et appliquer la matrice à une instance
			const updatePartInstance = (partName, meshName, instanceIndex) => {
				const mesh = this.instanceMeshes[meshName];
				if (!mesh || instanceIndex >= mesh.count) return false;

				if (agent.isVisible) {
					// --- Calcul commun pour toutes les parties ---
					// 1. Obtenir le décalage local de la partie (position/rotation de base)
					tempLocalOffsetMatrix.copy(this._getPartLocalOffsetMatrix(partName));

					// 2. Obtenir la matrice d'animation de la partie (calculée dans agent.updateVisuals)
					tempAnimationMatrix.copy(agent.currentAnimationMatrix[partName] || this.tempMatrix.identity());

					// 3. Combiner : Matrice locale de la partie = Offset * Animation
					tempPartWorldMatrix.multiplyMatrices(tempLocalOffsetMatrix, tempAnimationMatrix);

					// 4. Combiner avec la matrice de l'agent : Matrice mondiale de la partie = Agent * LocalePartie
					tempPartWorldMatrix.premultiply(this.agentMatrix);

					// --- Application et cas spécifiques ---
					if (partName === 'hair') {
						tempPartWorldMatrix.multiplyMatrices(tempHeadWorldMatrix, tempHairLocalOffset);
						mesh.setMatrixAt(instanceIndex, tempPartWorldMatrix);
					} else {
						mesh.setMatrixAt(instanceIndex, tempPartWorldMatrix);
						if (partName === 'head') {
							tempHeadWorldMatrix.copy(tempPartWorldMatrix);
						}
					}
				} else {
					// Masquer l'instance si l'agent n'est pas visible
					this.tempMatrix.identity().scale(new THREE.Vector3(0,0,0));
					mesh.setMatrixAt(instanceIndex, this.tempMatrix);
				}
				return true;
			};

			// Appliquer la mise à jour pour chaque partie
			let updated = false;
			updated = updatePartInstance('head', 'head', instanceId) || updated;
			updated = updatePartInstance('torso', 'torso', instanceId) || updated;
			updated = updatePartInstance('leftHand', 'hand', instanceId * 2 + 0) || updated;
			updated = updatePartInstance('rightHand', 'hand', instanceId * 2 + 1) || updated;
			updated = updatePartInstance('leftFoot', 'shoe', instanceId * 2 + 0) || updated;
			updated = updatePartInstance('rightFoot', 'shoe', instanceId * 2 + 1) || updated;

			if (updated) needsBodyMatrixUpdate = true;

			// --- Mise à jour Debug marker (agentMarker) ---
			const markerMesh = this.instanceMeshes.agentMarker;
			if (markerMesh) {
				if (isDebug) {
					const shouldShowMarker = agent.currentState !== 'AT_HOME' && agent.currentState !== 'AT_WORK';
					
					if (shouldShowMarker) {
						this.tempMatrix.identity();
						this.tempMatrix.makeTranslation(
							agent.position.x,
							agent.position.y + fixedMarkerYOffset,
							agent.position.z
						);
						this.tempScale.set(debugMarkerScale, debugMarkerScale, debugMarkerScale);
						this.tempMatrix.scale(this.tempScale);
					} else {
						this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
					}
				} else {
					this.tempMatrix.identity().scale(new THREE.Vector3(0, 0, 0));
				}
				markerMesh.setMatrixAt(instanceId, this.tempMatrix);
				needsAgentMarkerUpdate = true;
			}
		}

		// 3. Pousser vers le GPU (si des changements ont eu lieu)
		if (needsBodyMatrixUpdate) {
			['head','torso','hand','shoe'].forEach(k => {
				const mesh = this.instanceMeshes[k];
				if (mesh?.instanceMatrix) {
					mesh.instanceMatrix.needsUpdate = true;
					if (k === 'head' || k === 'torso') mesh.computeBoundingSphere();
				}
			});
		}
		if (needsAgentMarkerUpdate) this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true;
		if (needsHomeMarkerUpdate) this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true;
	}

	removeAgent(agentId) {
		// 1) on supprime la logique
		const idx = this.agents.findIndex(a => a.id === agentId);
		if (idx !== -1) this.agents.splice(idx, 1);

		// 2) on libère le slot visuel
		this.releaseAgent(agentId);
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
			this.removeAgent(agent.id);
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