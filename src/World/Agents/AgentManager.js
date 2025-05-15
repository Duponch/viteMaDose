// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js';
import AgentState from './AgentState.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import WorkScheduleStrategy from '../Strategies/WorkScheduleStrategy.js';
import WeekendWalkStrategy from '../Strategies/WeekendWalkStrategy.js';
import AgentLODRenderer from './AgentLODRenderer.js';

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
		this.instanceMeshes = {
			highDetail: {},
			lowDetail: {}
		};
		this.baseGeometries = {};
		this.baseMaterials = {};

		// Créer le renderer LOD
		this.lodRenderer = new AgentLODRenderer();

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
		
		// Planifier une synchronisation initiale différée pour laisser le temps aux agents de s'initialiser
		setTimeout(() => {
			this._synchronizeAgentsOnStartup();
		}, 2000); // 2 secondes après l'initialisation
		
		//console.log("AgentManager initialisé (Worker non démarré).");
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
            //console.log("AgentManager: Initialisation du Pathfinding Worker (mode SharedArrayBuffer)... HORS LIGNE");
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
            //console.log("AgentManager: Message d'initialisation combiné (SharedArrayBuffers + params) envoyé au worker.");

        } catch (error) {
            console.error("AgentManager: Échec de la création du Pathfinding Worker:", error);
            this.pathfindingWorker = null;
            this.isWorkerInitialized = false;
        }
    }
    // --- FIN MODIFICATION ---

	_handleWorkerMessage(event) {
		const { type, data, error } = event.data;
		////console.log(`[AgentManager DEBUG] Message reçu du worker: type=<span class="math-inline">\{type\}, agentId\=</span>{data?.agentId}`); // LOG 1

		if (type === 'initComplete') {
			this.isWorkerInitialized = true;
			////console.log("AgentManager: Pathfinding Worker initialisé et prêt.");

		} else if (type === 'pathResult') {
			if (data && data.agentId && data.path !== undefined && data.pathLengthWorld !== undefined) {
				const { agentId, path: worldPathData, pathLengthWorld, fromCache } = data;
				////console.log(`[AgentManager DEBUG] pathResult reçu pour Agent ${agentId}. Longueur Monde: ${pathLengthWorld}`); // LOG 2

				// Mettre à jour les statistiques du cache
				if (this.pathRequestStats) {
					if (fromCache === true) {
						this.pathRequestStats.cacheHits++;
					} else {
						this.pathRequestStats.cacheMisses++;
					}
				}

				// Ignorer les résultats pour les agents de préchauffage
				if (agentId.toString().startsWith('preheat_')) {
					// C'est un agent de préchauffage, le message est traité par un listener dédié
					return;
				}

				const agent = this.getAgentById(agentId);

				if (agent) {
					////console.log(`[AgentManager DEBUG] Agent ${agentId} trouvé. Vérification chemin reçu...`); // LOG 3 Modifié
					let finalWorldPath = null;

					// --- MODIFICATION : Gestion explicite de worldPathData null/vide ---
					if (worldPathData && Array.isArray(worldPathData) && worldPathData.length > 0) {
						try {
							finalWorldPath = worldPathData.map(posData => new THREE.Vector3(posData.x, posData.y, posData.z));
							////console.log(`[AgentManager DEBUG] Chemin valide reçu et reconstruit pour Agent ${agentId} (${finalWorldPath.length} points).`); // LOG 4 Modifié
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
					////console.log(`[AgentManager DEBUG] Appel de agent.setPath pour Agent ${agentId}...`); // LOG 6
					agent.setPath(finalWorldPath, finalWorldPath ? pathLengthWorld : 0); // Passer 0 si chemin nul
					////console.log(`[AgentManager DEBUG] Appel de agent.setPath TERMINÉ pour Agent ${agentId}.`); // LOG 7

				} else {
					// Ne pas afficher d'avertissement pour les agents de préchauffage
					if (!agentId.toString().startsWith('preheat_')) {
						console.warn(`[AgentManager WARN] Agent ${agentId} non trouvé pour le résultat du chemin.`); // LOG WARN
					}
				}
			} else {
				console.warn("[AgentManager WARN] Message 'pathResult' incomplet reçu:", event.data); // LOG WARN
			}
		} else if (type === 'cacheStats') {
			// Stocker les statistiques du cache
			this.workerCacheStats = data;
			console.log("AgentManager: Statistiques du cache reçues:", data);

		} else if (type === 'cacheCleared') {
			console.log("AgentManager: Cache vidé avec succès");

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

        // Mettre à jour les statistiques de requêtes
        if (!this.pathRequestStats) {
            this.pathRequestStats = {
                totalRequests: 0,
                vehicleRequests: 0,
                pedestrianRequests: 0,
                cacheHits: 0,
                cacheMisses: 0,
                nearCacheHits: 0,
                lastStatsReset: Date.now()
            };
        }
        
        this.pathRequestStats.totalRequests++;
        if (isVehicle) {
            this.pathRequestStats.vehicleRequests++;
        } else {
            this.pathRequestStats.pedestrianRequests++;
        }

        // Journaliser la requête avec moins de détails si elle n'est pas la première
        const verbose = this.pathRequestStats.totalRequests % 100 === 1;
        if (verbose) {
            ////console.log(`AgentManager: Envoi requête path #${this.pathRequestStats.totalRequests} au worker pour Agent ${agentId} (${isVehicle ? 'véhicule' : 'piéton'}): (${startNode.x},${startNode.y}) -> (${endNode.x},${endNode.y})`);
        }
        
        this.pathfindingWorker.postMessage({
            type: 'findPath',
            data: { agentId, startNode, endNode, isVehicle }
        });
    }
    // --- FIN NOUVELLE MÉTHODE ---

    // 2) _initializeMeshes (modifiée pour démarrer à count=0)
	_initializeMeshes() {
		////console.log("AgentManager: Initialisation des InstancedMesh...");
		// Matériaux (Ajout des matériaux pour le torse détaillé)
		this.baseMaterials.skin = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1, name: 'AgentSkinMat' });
		this.baseMaterials.shirt = new THREE.MeshStandardMaterial({ color: 0x4466cc, roughness: 0.7, metalness: 0.1, name: 'AgentShirtMat' });
		this.baseMaterials.belt = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6, metalness: 0.2, name: 'AgentBeltMat' });
		this.baseMaterials.pants = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.1, name: 'AgentPantsMat' });
		this.baseMaterials.hand = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.7, metalness: 0.1, name: 'AgentHandMat' });
		this.baseMaterials.shoe = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.1, name: 'AgentShoeMat' });
		this.baseMaterials.hair = new THREE.MeshStandardMaterial({
			color: 0x332211,
			roughness: 0.8,
			metalness: 0.1,
			name: 'AgentHairMat'
		});
		this.baseMaterials.faceFeature = new THREE.MeshBasicMaterial({
			color: 0x000000,
			name: 'AgentFaceFeatureMat'
		});
		this.baseMaterials.agentMarker = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

		// Matériau plus simple pour le LOD (moins coûteux)
		this.baseMaterials.lodSimple = new THREE.MeshStandardMaterial({ 
			vertexColors: true, 
			flatShading: true,
			roughness: 0.7,
			metalness: 0,
			name: 'AgentLodSimpleMat'
		});
		
		// Optimiser le matériau LOD
		this.lodRenderer.optimizeMaterial(this.baseMaterials.lodSimple);

		// Géométries de base
		const torsoRadius = this.config.torsoRadius ?? 1.5;
		const torsoLength = this.config.torsoLength ?? 2.0;
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

		// --- NOUVEAU : Création du torse détaillé ---
		const beltHeight = 0.2;
		const remainingLength = torsoLength - beltHeight;
		const shirtHeight = remainingLength * 0.7; // 70% pour la chemise
		const pantsHeight = remainingLength * 0.3; // 30% pour le pantalon

		// Créer les géométries pour chaque partie du torse
		const shirtCylinder = new THREE.CylinderGeometry(torsoRadius, torsoRadius, shirtHeight, 24);
		const beltCylinder = new THREE.CylinderGeometry(torsoRadius, torsoRadius, beltHeight, 24);
		const pantsCylinder = new THREE.CylinderGeometry(torsoRadius, torsoRadius, pantsHeight, 24);
		const torsoTopCap = new THREE.SphereGeometry(torsoRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
		const torsoBottomCap = new THREE.SphereGeometry(torsoRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
		const shirtLine = new THREE.BoxGeometry(0.1, shirtHeight, 0.1);

		// Positionner les parties du torse
		const shirtY = (beltHeight + pantsHeight) / 2;
		const beltY = (pantsHeight - shirtHeight) / 2;
		const pantsY = -(shirtHeight + beltHeight) / 2;
		const capY = torsoLength / 2;

		// Créer des matrices de transformation pour chaque partie
		const shirtMatrix = new THREE.Matrix4().makeTranslation(0, shirtY, 0);
		const beltMatrix = new THREE.Matrix4().makeTranslation(0, beltY, 0);
		const pantsMatrix = new THREE.Matrix4().makeTranslation(0, pantsY, 0);
		const topCapMatrix = new THREE.Matrix4().makeTranslation(0, capY, 0);
		const bottomCapMatrix = new THREE.Matrix4().makeTranslation(0, -capY, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI));
		const shirtLineMatrix = new THREE.Matrix4().makeTranslation(0, shirtY, torsoRadius - 0.05);

		// Appliquer les transformations aux géométries
		shirtCylinder.applyMatrix4(shirtMatrix);
		beltCylinder.applyMatrix4(beltMatrix);
		pantsCylinder.applyMatrix4(pantsMatrix);
		torsoTopCap.applyMatrix4(topCapMatrix);
		torsoBottomCap.applyMatrix4(bottomCapMatrix);
		shirtLine.applyMatrix4(shirtLineMatrix);

		// Fusionner les géométries en deux groupes pour éviter les problèmes de fusion
		const upperTorso = mergeGeometries([shirtCylinder, torsoTopCap, shirtLine], true);
		const lowerTorso = mergeGeometries([beltCylinder, pantsCylinder, torsoBottomCap], true);

		// Fusionner les deux groupes
		this.baseGeometries.torso = mergeGeometries([upperTorso, lowerTorso], true);

		// Nettoyer les géométries temporaires
		shirtCylinder.dispose();
		beltCylinder.dispose();
		pantsCylinder.dispose();
		torsoTopCap.dispose();
		torsoBottomCap.dispose();
		shirtLine.dispose();
		upperTorso.dispose();
		lowerTorso.dispose();

		this.baseGeometries.hand = createCapsuleGeometry(handRadius, handLength, 12);
		const shoeParts = createShoeGeometry();
		this.baseGeometries.shoe = mergeGeometries([shoeParts.top, shoeParts.sole], false);
		shoeParts.top.dispose();
		shoeParts.sole.dispose();

		this.baseGeometries.agentMarker = new THREE.OctahedronGeometry(0.5);

		// --- INITIALISATION DES GÉOMÉTRIES LOD (NOUVELLE PARTIE) ---
		// Créer les géométries simplifiées
		this.baseGeometries.lodHead = this.lodRenderer.createSquareHeadGeometry(this.headRadius);
		this.baseGeometries.lodTorso = this.lodRenderer.createSquareTorsoGeometry(torsoRadius, torsoLength);
		this.baseGeometries.lodHand = this.lodRenderer.createSquareExtremityGeometry(handRadius, handLength);
		this.baseGeometries.lodShoe = this.lodRenderer.createSquareShoeGeometry();

		// Création des InstancedMesh
		const createInstMesh = (name, geom, mat, count, needsColor = false, detailLevel = 'highDetail') => {
			//console.log(`Creating InstancedMesh '${name}' with count ${count}`);
			const mesh = new THREE.InstancedMesh(geom, mat, count);
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
				//console.log(` > Added instanceColor buffer to ${name}`);
			}
			this.scene.add(mesh);
			this.instanceMeshes[detailLevel][name] = mesh;
		};

		// --- CRÉATION DES INSTANCES HAUTE QUALITÉ ---
		// Head fusionné avec cheveux : passer un tableau de matériaux
		createInstMesh('head', this.baseGeometries.head, [
			this.baseMaterials.skin,
			this.baseMaterials.hair,
			this.baseMaterials.faceFeature,
			this.baseMaterials.faceFeature,
			this.baseMaterials.faceFeature
		], this.maxAgents);

		// Torso avec les nouveaux matériaux
		createInstMesh('torso', this.baseGeometries.torso, [
			this.baseMaterials.shirt,
			this.baseMaterials.belt,
			this.baseMaterials.pants,
			this.baseMaterials.shirt,
			this.baseMaterials.pants,
			this.baseMaterials.faceFeature
		], this.maxAgents, true);

		createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2);
		createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2);

		// --- CRÉATION DES INSTANCES LOD (BASSE QUALITÉ) ---
		createInstMesh('head', this.baseGeometries.lodHead, this.baseMaterials.lodSimple, this.maxAgents, true, 'lowDetail');
		createInstMesh('torso', this.baseGeometries.lodTorso, this.baseMaterials.lodSimple, this.maxAgents, true, 'lowDetail');
		createInstMesh('hand', this.baseGeometries.lodHand, this.baseMaterials.lodSimple, this.maxAgents * 2, true, 'lowDetail');
		createInstMesh('shoe', this.baseGeometries.lodShoe, this.baseMaterials.lodSimple, this.maxAgents * 2, true, 'lowDetail');

		if (this.experience.isDebugMode) {
			createInstMesh('agentMarker', this.baseGeometries.agentMarker, this.baseMaterials.agentMarker, this.maxAgents);
		}

		// Réinitialiser le pool
		this.activeCount = 0;
		this.agentToInstanceId.clear();
		this.instanceIdToAgent.fill(null);
		//console.log("InstancedMeshes créés:", Object.keys(this.instanceMeshes));
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
			debugPathColor: null,
			lodDistance: this.config.agentLodDistance ?? 50
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
		if (this.instanceMeshes.highDetail.torso?.instanceColor) {
			this.instanceMeshes.highDetail.torso.setColorAt(instanceId, newAgent.torsoColor);
			// Important pour que la couleur soit envoyée au GPU la première fois (et si releaseAgent est utilisé)
			this.instanceMeshes.highDetail.torso.instanceColor.needsUpdate = true; 
		}

		// 2.2) Définir la couleur pour les meshes LOD (basse qualité)
		if (this.instanceMeshes.lowDetail.head?.instanceColor) {
			// Définir explicitement la couleur pour chaque mesh LOD
			const skinColor = new THREE.Color(0xffcc99); // Couleur de peau
			const clothingColor = newAgent.torsoColor;
			const shoeColor = new THREE.Color(0x444444); // Couleur de chaussure
			
			// Tête (couleur de peau)
			this.instanceMeshes.lowDetail.head.setColorAt(instanceId, skinColor);
			
			// Torse (couleur de vêtement)
			this.instanceMeshes.lowDetail.torso.setColorAt(instanceId, clothingColor);
			
			// Mains (gauche et droite)
			this.instanceMeshes.lowDetail.hand.setColorAt(instanceId * 2, skinColor);
			this.instanceMeshes.lowDetail.hand.setColorAt(instanceId * 2 + 1, skinColor);
			
			// Pieds (gauche et droite)
			this.instanceMeshes.lowDetail.shoe.setColorAt(instanceId * 2, shoeColor);
			this.instanceMeshes.lowDetail.shoe.setColorAt(instanceId * 2 + 1, shoeColor);
			
			// Marquer les buffers comme ayant besoin d'être mis à jour
			this.instanceMeshes.lowDetail.head.instanceColor.needsUpdate = true;
			this.instanceMeshes.lowDetail.torso.instanceColor.needsUpdate = true;
			this.instanceMeshes.lowDetail.hand.instanceColor.needsUpdate = true;
			this.instanceMeshes.lowDetail.shoe.instanceColor.needsUpdate = true;
		}
		
		// 2.3) Définir la couleur pour les mains et pieds LOD
		if (this.instanceMeshes.lowDetail.hand?.instanceColor) {
			const handColor = new THREE.Color(0xffcc99); // Couleur de peau
			const shoeColor = new THREE.Color(0x444444); // Couleur de chaussure
			
			// Mains (gauche et droite)
			this.instanceMeshes.lowDetail.hand.setColorAt(instanceId * 2, handColor);
			this.instanceMeshes.lowDetail.hand.setColorAt(instanceId * 2 + 1, handColor);
			
			// Pieds (gauche et droite)
			this.instanceMeshes.lowDetail.shoe.setColorAt(instanceId * 2, shoeColor);
			this.instanceMeshes.lowDetail.shoe.setColorAt(instanceId * 2 + 1, shoeColor);
			
			this.instanceMeshes.lowDetail.hand.instanceColor.needsUpdate = true;
			this.instanceMeshes.lowDetail.shoe.instanceColor.needsUpdate = true;
		}

		this.activeCount++;

		// Incrémenter les compteurs de rendu pour les nouvelles instances
		// High detail
		if (this.instanceMeshes.highDetail.head) this.instanceMeshes.highDetail.head.count = this.activeCount;
		if (this.instanceMeshes.highDetail.torso) this.instanceMeshes.highDetail.torso.count = this.activeCount;
		if (this.instanceMeshes.highDetail.hand) this.instanceMeshes.highDetail.hand.count = this.activeCount * 2;
		if (this.instanceMeshes.highDetail.shoe) this.instanceMeshes.highDetail.shoe.count = this.activeCount * 2;
		
		// Low detail
		if (this.instanceMeshes.lowDetail.head) this.instanceMeshes.lowDetail.head.count = this.activeCount;
		if (this.instanceMeshes.lowDetail.torso) this.instanceMeshes.lowDetail.torso.count = this.activeCount;
		if (this.instanceMeshes.lowDetail.hand) this.instanceMeshes.lowDetail.hand.count = this.activeCount * 2;
		if (this.instanceMeshes.lowDetail.shoe) this.instanceMeshes.lowDetail.shoe.count = this.activeCount * 2;
		
		if (this.instanceMeshes.agentMarker) this.instanceMeshes.agentMarker.count = this.activeCount;
	
		// 4) on initialise la matrice / couleur de ce slot
		// … (votre code existant pour setMatrixAt et setColorAt sur instanceId) …
		this.instanceMeshes.highDetail.torso.instanceColor?.setXYZ(instanceId,
			newAgent.torsoColor.r, newAgent.torsoColor.g, newAgent.torsoColor.b);
		this.instanceMeshes.highDetail.torso.instanceColor.needsUpdate = true;
		// idem pour head, hand, shoe…
	
		Object.values(this.instanceMeshes.highDetail).forEach(mesh => {
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
			Object.values(this.instanceMeshes.highDetail).forEach(mesh => {
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
		if (this.instanceMeshes.highDetail.head) this.instanceMeshes.highDetail.head.count = this.activeCount;
		if (this.instanceMeshes.highDetail.torso) this.instanceMeshes.highDetail.torso.count = this.activeCount;
		if (this.instanceMeshes.highDetail.hand) this.instanceMeshes.highDetail.hand.count = this.activeCount * 2;
		if (this.instanceMeshes.highDetail.shoe) this.instanceMeshes.highDetail.shoe.count = this.activeCount * 2;
	
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
        const environment = this.experience.world.environment;
        const currentGameTime = this.experience.time.elapsed;
        const isDebug = this.experience.isDebugMode;
        const debugMarkerScale = isDebug ? 1.0 : 0;
        const fixedMarkerYOffset = 5.0;
        const calendarDate = environment.getCurrentCalendarDate();
        
        // Obtenir une référence au pool d'objets
        const objectPool = this.experience.objectPool;
        if (!objectPool) {
            console.warn("AgentManager: objectPool non disponible, utilisation du mode non optimisé");
        }

        // Variables temporaires pour les calculs de matrices
        let needsHighDetailUpdate = false;
        let needsLowDetailUpdate = false;
        let needsAgentMarkerUpdate = false;
        let needsHomeMarkerUpdate = false;

        // --- Utilisation du pool d'objets pour les matrices temporaires ---
        // Obtenir les matrices temporaires du pool
        const tempLocalOffsetMatrix = objectPool ? objectPool.getMatrix4() : new THREE.Matrix4();
        const tempAnimationMatrix = objectPool ? objectPool.getMatrix4() : new THREE.Matrix4();
        const tempPartWorldMatrix = objectPool ? objectPool.getMatrix4() : new THREE.Matrix4();
        const tempHairLocalOffset = this._getPartLocalOffsetMatrix('hair'); // Offset des cheveux relatif à la tête (calculé une fois)
        const tempHeadWorldMatrix = objectPool ? objectPool.getMatrix4() : new THREE.Matrix4();
        
        // Utiliser le tempScale existant ou en créer un nouveau du pool si nécessaire
        const usePooledScale = !this.tempScale && objectPool;
        const tempScale = usePooledScale ? objectPool.getVector3(1, 1, 1) : (this.tempScale || new THREE.Vector3(1, 1, 1));
        if (!this.tempScale) this.tempScale = tempScale;

        // Variable temporaire pour stocker l'échelle de l'agent
        let zeroScale = null;

        // Mise à jour des matrices d'instance pour chaque agent actif
        for (const agent of this.agents) {
            const instanceId = agent.instanceId;
            if (!agent || instanceId === undefined) continue; // Ignorer les agents invalides

            // --- Mise à jour logique de l'agent ---
            if (typeof currentGameTime !== 'number') {
                console.warn("AgentManager: currentGameTime n'est pas un nombre:", currentGameTime);
                currentGameTime = this.experience.time.elapsed;
            }
            agent.update(deltaTime, environment.getCurrentHour(), calendarDate, currentGameTime);

            // --- Mise à jour des matrices d'instance ---
            // Met à jour la position/orientation de base
            const actualScale = agent.isVisible ? agent.scale : 0;
            this.tempScale.set(actualScale, actualScale, actualScale);
            this.agentMatrix.compose(agent.position, agent.orientation, this.tempScale);

            // Créer un vecteur scale (0,0,0) une seule fois et le réutiliser pour cacher les instances
            if (!agent.isVisible && !zeroScale && objectPool) {
                zeroScale = objectPool.getVector3(0, 0, 0);
            }

            // Déterminer quel niveau de détail utiliser
            const isLowDetail = agent.isLodActive;

            // --- Mise à jour des parties du corps instanciées ---
            // Fonction utilitaire pour calculer et appliquer la matrice à une instance
            const updatePartInstance = (partName, meshName, instanceIndex, detailLevel) => {
                const meshes = detailLevel === 'high' ? this.instanceMeshes.highDetail : this.instanceMeshes.lowDetail;
                const mesh = meshes[meshName];
                if (!mesh || instanceIndex >= mesh.count) return false;

                if (agent.isVisible) {
                    // --- Calcul commun pour toutes les parties ---
                    // 1. Obtenir le décalage local de la partie (position/rotation de base)
                    tempLocalOffsetMatrix.copy(this._getPartLocalOffsetMatrix(partName));

                    // 2. Obtenir la matrice d'animation de la partie
                    // Pour le LOD bas, on n'utilise pas d'animation, juste la position de base
                    if (detailLevel === 'high') {
                        tempAnimationMatrix.copy(agent.currentAnimationMatrix[partName] || this.tempMatrix.identity());
                    } else {
                        tempAnimationMatrix.identity();
                    }

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
                    // Utiliser la matrice existante ou temporaire avec une échelle nulle
                    this.tempMatrix.identity();
                    if (zeroScale) {
                        this.tempMatrix.scale(zeroScale);
                    } else {
                        this.tempMatrix.scale(new THREE.Vector3(0, 0, 0));
                    }
                    mesh.setMatrixAt(instanceIndex, this.tempMatrix);
                }
                return true;
            };

            // Appliquer la mise à jour pour chaque partie selon le niveau de détail
            let highUpdated = false;
            let lowUpdated = false;

            if (isLowDetail) {
                // Mettre à jour seulement les parties LOD
                lowUpdated = updatePartInstance('head', 'head', instanceId, 'low') || lowUpdated;
                lowUpdated = updatePartInstance('torso', 'torso', instanceId, 'low') || lowUpdated;
                lowUpdated = updatePartInstance('leftHand', 'hand', instanceId * 2 + 0, 'low') || lowUpdated;
                lowUpdated = updatePartInstance('rightHand', 'hand', instanceId * 2 + 1, 'low') || lowUpdated;
                lowUpdated = updatePartInstance('leftFoot', 'shoe', instanceId * 2 + 0, 'low') || lowUpdated;
                lowUpdated = updatePartInstance('rightFoot', 'shoe', instanceId * 2 + 1, 'low') || lowUpdated;
                
                // Masquer les parties haute qualité
                this.tempMatrix.identity();
                if (zeroScale) {
                    this.tempMatrix.scale(zeroScale);
                } else {
                    this.tempMatrix.scale(new THREE.Vector3(0, 0, 0));
                }
                this.instanceMeshes.highDetail.head.setMatrixAt(instanceId, this.tempMatrix);
                this.instanceMeshes.highDetail.torso.setMatrixAt(instanceId, this.tempMatrix);
                this.instanceMeshes.highDetail.hand.setMatrixAt(instanceId * 2 + 0, this.tempMatrix);
                this.instanceMeshes.highDetail.hand.setMatrixAt(instanceId * 2 + 1, this.tempMatrix);
                this.instanceMeshes.highDetail.shoe.setMatrixAt(instanceId * 2 + 0, this.tempMatrix);
                this.instanceMeshes.highDetail.shoe.setMatrixAt(instanceId * 2 + 1, this.tempMatrix);
                highUpdated = true;
            } else {
                // Mettre à jour seulement les parties haute qualité
                highUpdated = updatePartInstance('head', 'head', instanceId, 'high') || highUpdated;
                highUpdated = updatePartInstance('torso', 'torso', instanceId, 'high') || highUpdated;
                highUpdated = updatePartInstance('leftHand', 'hand', instanceId * 2 + 0, 'high') || highUpdated;
                highUpdated = updatePartInstance('rightHand', 'hand', instanceId * 2 + 1, 'high') || highUpdated;
                highUpdated = updatePartInstance('leftFoot', 'shoe', instanceId * 2 + 0, 'high') || highUpdated;
                highUpdated = updatePartInstance('rightFoot', 'shoe', instanceId * 2 + 1, 'high') || highUpdated;
                
                // Masquer les parties basse qualité
                this.tempMatrix.identity();
                if (zeroScale) {
                    this.tempMatrix.scale(zeroScale);
                } else {
                    this.tempMatrix.scale(new THREE.Vector3(0, 0, 0));
                }
                this.instanceMeshes.lowDetail.head.setMatrixAt(instanceId, this.tempMatrix);
                this.instanceMeshes.lowDetail.torso.setMatrixAt(instanceId, this.tempMatrix);
                this.instanceMeshes.lowDetail.hand.setMatrixAt(instanceId * 2 + 0, this.tempMatrix);
                this.instanceMeshes.lowDetail.hand.setMatrixAt(instanceId * 2 + 1, this.tempMatrix);
                this.instanceMeshes.lowDetail.shoe.setMatrixAt(instanceId * 2 + 0, this.tempMatrix);
                this.instanceMeshes.lowDetail.shoe.setMatrixAt(instanceId * 2 + 1, this.tempMatrix);
                lowUpdated = true;
            }

            if (highUpdated) needsHighDetailUpdate = true;
            if (lowUpdated) needsLowDetailUpdate = true;

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
                        this.tempMatrix.identity();
                        if (zeroScale) {
                            this.tempMatrix.scale(zeroScale);
                        } else {
                            this.tempMatrix.scale(new THREE.Vector3(0, 0, 0));
                        }
                    }
                } else {
                    this.tempMatrix.identity();
                    if (zeroScale) {
                        this.tempMatrix.scale(zeroScale);
                    } else {
                        this.tempMatrix.scale(new THREE.Vector3(0, 0, 0));
                    }
                }
                markerMesh.setMatrixAt(instanceId, this.tempMatrix);
                needsAgentMarkerUpdate = true;
            }
        }

        // 3. Pousser vers le GPU (si des changements ont eu lieu)
        if (needsHighDetailUpdate) {
            Object.values(this.instanceMeshes.highDetail).forEach(mesh => {
                if (mesh?.instanceMatrix) {
                    mesh.instanceMatrix.needsUpdate = true;
                    // Optimisation: Réduire la fréquence des appels computeBoundingSphere()
                    // Cette opération est coûteuse mais pas nécessaire à chaque frame
                    if (Math.random() < 0.1) { // 10% de chance de recalculer à chaque frame
                        mesh.computeBoundingSphere();
                    }
                }
            });
        }
        
        if (needsLowDetailUpdate) {
            Object.values(this.instanceMeshes.lowDetail).forEach(mesh => {
                if (mesh?.instanceMatrix) {
                    mesh.instanceMatrix.needsUpdate = true;
                    // Optimisation: Réduire la fréquence des appels computeBoundingSphere()
                    if (Math.random() < 0.05) { // 5% de chance pour les LOD bas
                        mesh.computeBoundingSphere();
                    }
                }
            });
        }
        
        if (needsAgentMarkerUpdate) this.instanceMeshes.agentMarker.instanceMatrix.needsUpdate = true;
        if (needsHomeMarkerUpdate) this.instanceMeshes.homeMarker.instanceMatrix.needsUpdate = true;
        
        // Retourner les objets temporaires au pool
        if (objectPool) {
            objectPool.releaseMatrix4(tempLocalOffsetMatrix);
            objectPool.releaseMatrix4(tempAnimationMatrix);
            objectPool.releaseMatrix4(tempPartWorldMatrix);
            objectPool.releaseMatrix4(tempHeadWorldMatrix);
            if (zeroScale) objectPool.releaseVector3(zeroScale);
            // Ne pas libérer tempScale s'il s'agit du this.tempScale existant
            if (usePooledScale) objectPool.releaseVector3(tempScale);
        }
    }

	removeAgent(agentId) {
		// 1) on supprime la logique
		const idx = this.agents.findIndex(a => a.id === agentId);
		if (idx !== -1) this.agents.splice(idx, 1);

		// 2) on libère le slot visuel
		this.releaseAgent(agentId);
	}

    destroy() {
		//console.log("AgentManager: Destruction...");
		// Arrêter le worker s'il existe
		if (this.pathfindingWorker) {
			this.pathfindingWorker.terminate();
			this.pathfindingWorker = null;
			this.isWorkerInitialized = false;
			//console.log("AgentManager: Pathfinding Worker terminé.");
		}
	   // ... (reste de la logique de destroy existante) ...
		const cityManager = this.experience?.world?.cityManager;
		this.agents.forEach(agent => {
			this.removeAgent(agent.id);
			agent.destroy();
		});
		this.agents = [];
		//console.log("AgentManager: Agents logiques détruits.");

		Object.values(this.instanceMeshes.highDetail).forEach(mesh => {
			if (mesh.parent) mesh.parent.remove(mesh);
			// Dispose material CLONE (celui de InstancedMesh)
			if (mesh.material && mesh.material !== this.baseMaterials[mesh.name.replace('Instances','').toLowerCase()]) {
			   mesh.material.dispose?.();
			}
		});
		this.instanceMeshes.highDetail = {};
		//console.log("AgentManager: InstancedMeshes retirés & matériaux clonés disposés.");

		Object.values(this.instanceMeshes.lowDetail).forEach(mesh => {
			if (mesh.parent) mesh.parent.remove(mesh);
			// Dispose material CLONE (celui de InstancedMesh)
			if (mesh.material && mesh.material !== this.baseMaterials[mesh.name.replace('Instances','').toLowerCase()]) {
			   mesh.material.dispose?.();
			}
		});
		this.instanceMeshes.lowDetail = {};
		//console.log("AgentManager: InstancedMeshes retirés & matériaux clonés disposés.");

		Object.values(this.baseGeometries).forEach(geom => { geom?.dispose(); });
		this.baseGeometries = {};
		//console.log("AgentManager: Géométries base disposées.");

		Object.values(this.baseMaterials).forEach(mat => { mat?.dispose(); });
		this.baseMaterials = {};
		//console.log("AgentManager: Matériaux base disposés.");

		// Nettoyer le renderer LOD
		if (this.lodRenderer) {
			this.lodRenderer.dispose();
			this.lodRenderer = null;
		}

		this.scene = null; this.experience = null; this.config = null;
		//console.log("AgentManager: Détruit.");
	}

    /**
     * Demande les statistiques du cache au worker
     * @returns {Promise} Promise qui sera résolue avec les statistiques
     */
    requestCacheStats() {
        return new Promise((resolve, reject) => {
            if (!this.pathfindingWorker || !this.isWorkerInitialized) {
                reject(new Error("Worker non initialisé"));
                return;
            }
            
            // Fonction qui sera appelée lorsque le message sera reçu
            const onStatsReceived = (event) => {
                if (event.data.type === 'cacheStats') {
                    this.pathfindingWorker.removeEventListener('message', onStatsReceived);
                    resolve(event.data.data);
                }
            };
            
            // Ajouter le listener temporaire
            this.pathfindingWorker.addEventListener('message', onStatsReceived);
            
            // Envoyer la requête
            this.pathfindingWorker.postMessage({ type: 'getCacheStats' });
            
            // Timeout de sécurité
            setTimeout(() => {
                this.pathfindingWorker.removeEventListener('message', onStatsReceived);
                reject(new Error("Timeout lors de la récupération des statistiques du cache"));
            }, 2000);
        });
    }
    
    /**
     * Vide le cache de chemins
     * @returns {Promise} Promise qui sera résolue lorsque le cache sera vidé
     */
    clearPathCache() {
        return new Promise((resolve, reject) => {
            if (!this.pathfindingWorker || !this.isWorkerInitialized) {
                reject(new Error("Worker non initialisé"));
                return;
            }
            
            // Fonction qui sera appelée lorsque le message sera reçu
            const onCacheCleared = (event) => {
                if (event.data.type === 'cacheCleared') {
                    this.pathfindingWorker.removeEventListener('message', onCacheCleared);
                    
                    // Réinitialiser les statistiques
                    if (this.pathRequestStats) {
                        this.pathRequestStats.cacheHits = 0;
                        this.pathRequestStats.cacheMisses = 0;
                        this.pathRequestStats.nearCacheHits = 0;
                        this.pathRequestStats.lastStatsReset = Date.now();
                    }
                    
                    resolve();
                }
            };
            
            // Ajouter le listener temporaire
            this.pathfindingWorker.addEventListener('message', onCacheCleared);
            
            // Envoyer la requête
            this.pathfindingWorker.postMessage({ type: 'clearCache' });
            
            // Timeout de sécurité
            setTimeout(() => {
                this.pathfindingWorker.removeEventListener('message', onCacheCleared);
                reject(new Error("Timeout lors du vidage du cache"));
            }, 2000);
        });
    }
    
    /**
     * Retourne les statistiques actuelles du pathfinding
     * @returns {Object} Statistiques de requêtes de chemins et du cache
     */
    getPathfindingStats() {
        const stats = {
            requests: this.pathRequestStats || {
                totalRequests: 0,
                vehicleRequests: 0,
                pedestrianRequests: 0,
                cacheHits: 0,
                cacheMisses: 0,
                nearCacheHits: 0
            },
            workerCache: this.workerCacheStats || {}
        };
        
        // Calculer le taux de hit du cache
        if (stats.requests.totalRequests > 0) {
            stats.requests.cacheHitRate = ((stats.requests.cacheHits / stats.requests.totalRequests) * 100).toFixed(2) + '%';
        } else {
            stats.requests.cacheHitRate = '0%';
        }
        
        return stats;
    }

    /**
     * Analyse détaillée des performances du cache de chemins après préchauffage
     * Cette méthode est appelée après le préchauffage et permet de comprendre
     * si le cache fonctionne correctement, avec une courte analyse des résultats.
     */
    async analyzePathCachePerformance() {
        try {
            // 1. Obtenir d'abord les statistiques actuelles
            const stats = await this.requestCacheStats();
            
            // 2. Variables pour l'analyse
            const previousHitRate = stats.hitRate;
            const previousSize = stats.size;
            
            // 3. Effectuer quelques requêtes de test pour voir si le cache est utilisé
            //console.log("AgentManager: Test de performance du cache avec 5 agents...");
            
            const testAgents = this.agents.slice(0, 5);
            let testHits = 0;
            let testMisses = 0;
            
            // 4. Pour chaque agent de test, faire une requête aller et une requête retour
            for (const agent of testAgents) {
                if (!agent.homeGridNode || !agent.workGridNode) continue;
                
                // Créer un ID temporaire pour le test
                const testId = `test_${agent.id}_${Date.now()}`;
                
                // Tester le chemin aller
                await this._preheatSinglePath(
                    testId,
                    agent.homeGridNode,
                    agent.workGridNode,
                    false // Toujours tester sans véhicule pour simplifier
                ).then(result => {
                    if (result && result.fromCache) testHits++;
                    else testMisses++;
                }).catch(err => {
                    testMisses++;
                });
                
                // Tester le chemin retour
                await this._preheatSinglePath(
                    testId,
                    agent.workGridNode,
                    agent.homeGridNode,
                    false
                ).then(result => {
                    if (result && result.fromCache) testHits++;
                    else testMisses++;
                }).catch(err => {
                    testMisses++;
                });
            }
            
            // 5. Obtenir les statistiques après les tests
            const newStats = await this.requestCacheStats();
            const newHitRate = newStats.hitRate;
            
            // 6. Analyse des résultats
            //console.log("=== ANALYSE CACHE DE PATHFINDING ===");
            //console.log(`Taille actuelle du cache: ${newStats.size} chemins stockés`);
            //console.log(`Taux de succès global: ${newHitRate}`);
            //console.log(`Hits: ${newStats.hits}, NearHits: ${newStats.nearHits}, Misses: ${newStats.misses}`);
            //console.log(`Test de performance: ${testHits} hits sur ${testHits + testMisses} requêtes (${((testHits/(testHits + testMisses))*100).toFixed(2)}%)`);
            
            // 7. Interprétation
            if (testHits > 0) {
                //console.log("✅ Le cache fonctionne - des chemins sont retrouvés avec succès!");
                //console.log(`   Recommandation: Continuez à surveiller le taux de succès quotidien.`);
            } else {
                //console.log("⚠️ Le cache ne semble pas fonctionner efficacement sur les tests.");
                //console.log("   Causes possibles:");
                //console.log("   - Les chemins préchauffés ne correspondent pas aux chemins demandés");
                //console.log("   - Problème de normalisation des coordonnées pour les clés du cache");
                //console.log("   - Le seuil de proximité pourrait être trop faible");
                //console.log("   Recommandation: Augmentez le seuil de proximité et diversifiez les variantes préchauffées");
            }
            
            //console.log("=================================");
            
            return {
                cacheSize: newStats.size,
                hitRate: newHitRate,
                testHitRate: testHits / (testHits + testMisses)
            };
            
        } catch (error) {
            console.error("Erreur lors de l'analyse du cache:", error);
            return null;
        }
    }

    /**
     * Préchauffe le cache avec les chemins entre domicile et travail des agents
     * @param {number} maxAgents - Nombre maximum d'agents à traiter pour le préchauffage
     * @returns {Promise} Promise qui sera résolue lorsque le préchauffage sera terminé
     */
    preheatCommonPaths(maxAgents = 50) {
        return new Promise((resolve, reject) => {
            if (!this.pathfindingWorker || !this.isWorkerInitialized) {
                reject(new Error("Worker non initialisé"));
                return;
            }
            
            // Sélectionner un échantillon d'agents qui ont des données valides
            const validAgents = this.agents.filter(agent => 
                agent.homeGridNode && agent.workGridNode &&
                agent.vehicleBehavior // S'assurer que vehicleBehavior est défini
            );
            
            // Limiter au nombre demandé
            const sampleAgents = validAgents.slice(0, Math.min(maxAgents, validAgents.length));
            //console.log(`AgentManager: Préchauffage du cache pour ${sampleAgents.length} agents valides...`);
            
            let processedCount = 0;
            let errorCount = 0;
            
            // Traiter chaque agent de l'échantillon
            const processNextAgent = (index) => {
                if (index >= sampleAgents.length) {
                    //console.log(`AgentManager: Préchauffage terminé - ${processedCount} chemins calculés, ${errorCount} erreurs`);
                    resolve({
                        processedCount,
                        errorCount
                    });
                    return;
                }
                
                const agent = sampleAgents[index];
                
                // Récupérer les états de véhicule possibles pour cet agent
                // Préchauffer pour les deux cas - avec et sans véhicule
                const vehicleStates = [false, true]; // Toujours tester les deux pour maximiser la couverture
                
                // Créer des variantes de points de départ et d'arrivée pour augmenter la couverture du cache
                const createVariants = (node, count = 5) => { // Augmenté de 3 à 5 variantes
                    const variants = [{ x: node.x, y: node.y }]; // Point original
                    
                    // Créer des variantes avec de petits décalages
                    for (let i = 1; i < count; i++) {
                        // Ajouter des variantes avec des décalages plus variés
                        // Utiliser des multiples de 0.5 pour mieux couvrir les cas
                        variants.push({
                            x: Math.floor(node.x) + (i * 0.5),
                            y: Math.floor(node.y) + (i * 0.5)
                        });
                        
                        // Ajouter des variantes dans d'autres directions
                        if (i <= 2) { // Limiter pour ne pas avoir trop de variantes
                            variants.push({
                                x: Math.floor(node.x) - (i * 0.5),
                                y: Math.floor(node.y) + (i * 0.5)
                            });
                            variants.push({
                                x: Math.floor(node.x) + (i * 0.5),
                                y: Math.floor(node.y) - (i * 0.5)
                            });
                        }
                    }
                    return variants;
                };
                
                // Générer des variantes pour les nœuds de départ et d'arrivée
                const homeVariants = createVariants(agent.homeGridNode);
                const workVariants = createVariants(agent.workGridNode);
                
                // Créer un tableau de promesses pour tous les chemins à préchauffer
                const pathPromises = [];
                
                // Pour chaque état de véhicule possible et chaque variante
                for (const useVehicle of vehicleStates) {
                    // Pour chaque variante du point de départ
                    for (const homeVariant of homeVariants) {
                        // Pour chaque variante du point d'arrivée (limité pour éviter trop de calculs)
                        for (const workVariant of workVariants.slice(0, 2)) {
                            // Chemin aller (maison → travail)
                            pathPromises.push(
                                this._preheatSinglePath(
                                    agent.id, 
                                    homeVariant, 
                                    workVariant, 
                                    useVehicle
                                ).catch(err => {
                                    console.warn(`Erreur préchauffage variante ${agent.id} (home->work, vehicle=${useVehicle}):`, err);
                                    errorCount++;
                                    return null;
                                })
                            );
                            
                            // Chemin retour (travail → maison) - pour toutes les variantes
                            // Modification: Générer plus de chemins retour
                            if (useVehicle || homeVariant === homeVariants[0] || Math.random() < 0.5) {
                                pathPromises.push(
                                    this._preheatSinglePath(
                                        agent.id, 
                                        workVariant, 
                                        homeVariant, 
                                        useVehicle
                                    ).catch(err => {
                                        console.warn(`Erreur préchauffage ${agent.id} (work->home, vehicle=${useVehicle}):`, err);
                                        errorCount++;
                                        return null;
                                    })
                                );
                            }
                        }
                    }
                }
                
                // Attendre que toutes les promesses soient résolues
                Promise.all(pathPromises)
                    .then(results => {
                        // Compter les chemins réussis
                        const successCount = results.filter(r => r !== null).length;
                        processedCount += successCount;
                        
                        // Passer à l'agent suivant avec un délai pour éviter de surcharger le worker
                        setTimeout(() => processNextAgent(index + 1), 20);
                    })
                    .catch(error => {
                        console.error(`Erreur globale lors du préchauffage pour l'agent ${agent.id}:`, error);
                        errorCount++;
                        setTimeout(() => processNextAgent(index + 1), 20);
                    });
            };
            
            // Démarrer le traitement
            processNextAgent(0);
        });
    }
    
    /**
     * Préchauffe un chemin spécifique
     * @private
     * @param {string} agentId - ID de l'agent
     * @param {Object} startNode - Nœud de départ
     * @param {Object} endNode - Nœud d'arrivée
     * @param {boolean} useVehicle - Si l'agent utilise un véhicule
     * @returns {Promise} Promise qui sera résolue lorsque le calcul sera terminé
     */
    _preheatSinglePath(agentId, startNode, endNode, useVehicle) {
        return new Promise((resolve, reject) => {
            // Générer un ID unique pour ce préchauffage
            const preheatId = `preheat_${agentId}_${Date.now()}`;
            
            // Fonction qui sera appelée lorsque le résultat sera reçu
            const onPathResult = (event) => {
                if (event.data.type === 'pathResult' && 
                    event.data.data && 
                    event.data.data.agentId === preheatId) {
                    
                    this.pathfindingWorker.removeEventListener('message', onPathResult);
                    
                    const result = event.data.data;
                    if (result.path && result.pathLengthWorld > 0) {
                        resolve({
                            success: true,
                            fromCache: result.fromCache || false
                        });
                    } else {
                        reject(new Error("Échec du calcul de chemin"));
                    }
                }
            };
            
            // Ajouter le listener temporaire
            this.pathfindingWorker.addEventListener('message', onPathResult);
            
            // Envoyer la requête avec l'ID spécial
            this.pathfindingWorker.postMessage({
                type: 'findPath',
                data: { 
                    agentId: preheatId, 
                    startNode, 
                    endNode, 
                    isVehicle: useVehicle 
                }
            });
            
            // Timeout de sécurité
            setTimeout(() => {
                this.pathfindingWorker.removeEventListener('message', onPathResult);
                reject(new Error("Timeout lors du préchauffage de chemin"));
            }, 3000);
        });
    }

    /**
     * Force tous les agents à synchroniser leur état avec l'heure actuelle.
     * À appeler après une forte accélération du temps ou lorsque le jeu est mis en pause.
     * Cette méthode utilise la nouvelle approche basée sur les événements intégrée directement dans les agents.
     * 
     * @param {number} currentGameTime - Temps de jeu actuel
     * @param {number} currentHour - Heure actuelle du jeu (0-23)
     * @param {Object} calendarDate - Date actuelle du jeu
     */
    forceSyncAllAgentsWithGameTime(currentGameTime, currentHour, calendarDate) {
        console.log(`AgentManager: Synchronisation forcée de tous les agents à ${currentHour}h...`);
        
        // Déclencher la synchronisation sur chaque agent
        this.agents.forEach(agent => {
            if (agent && typeof agent._synchronizeWithGameTime === 'function') {
                agent._synchronizeWithGameTime(currentGameTime);
            }
        });
        
        console.log(`AgentManager: Synchronisation forcée terminée pour ${this.agents.length} agents.`);
    }

    /**
     * Vérifie et reprogramme les événements pour tous les agents après une forte accélération du temps.
     * Utilise le mécanisme de synchronisation basé sur les événements dans les agents.
     * 
     * @param {number} currentGameTime - Temps de jeu actuel
     */
    checkAgentsEventsAfterTimeAcceleration(currentGameTime) {
        console.log(`AgentManager: Vérification des événements après accélération du temps...`);
        
        // Obtenir l'heure actuelle du jeu
        const environment = this.experience?.world?.environment;
        if (!environment) {
            console.warn("AgentManager: Impossible d'obtenir l'environnement");
            return;
        }
        
        const currentHour = environment.getCurrentHour ? environment.getCurrentHour() : 0;
        
        // Synchroniser les agents par lots pour éviter de bloquer le thread principal
        const batchSize = 50;
        let processed = 0;
        
        const syncBatch = () => {
            const endIndex = Math.min(processed + batchSize, this.agents.length);
            
            for (let i = processed; i < endIndex; i++) {
                const agent = this.agents[i];
                if (!agent) continue;
                
                try {
                    // 1. Synchroniser la position et l'état de l'agent en fonction de l'heure
                    if (typeof agent._synchronizeWithGameTime === 'function') {
                        agent._synchronizeWithGameTime(currentGameTime);
                    }
                    
                    // 2. Recalculer les événements planifiés
                    if (typeof agent._calculateScheduledTimes === 'function') {
                        agent._calculateScheduledTimes();
                    }
                } catch (error) {
                    console.error(`AgentManager: Erreur lors de la mise à jour de l'agent ${agent.id}:`, error);
                }
            }
            
            processed = endIndex;
            
            // Si tous les agents n'ont pas été traités, continuer au prochain tick
            if (processed < this.agents.length) {
                setTimeout(syncBatch, 0);
            } else {
                console.log(`AgentManager: Vérification des événements terminée pour ${this.agents.length} agents.`);
            }
        };
        
        // Démarrer le processus de synchronisation
        syncBatch();
    }

    /**
     * Synchronise tous les agents au démarrage du jeu
     * @private
     */
    _synchronizeAgentsOnStartup() {
        if (!this.experience?.world?.environment) {
            console.warn("AgentManager: Impossible de synchroniser les agents au démarrage - environnement non prêt");
            return;
        }
        
        const currentGameTime = this.experience.time.elapsed;
        console.log(`AgentManager: Synchronisation initiale des agents au démarrage...`);
        
        // Synchroniser tous les agents en utilisant leur propre méthode
        for (const agent of this.agents) {
            if (!agent) continue;
            
            try {
                if (typeof agent._synchronizeWithGameTime === 'function') {
                    agent._synchronizeWithGameTime(currentGameTime);
                }
            } catch (error) {
                console.error(`AgentManager: Erreur lors de la synchronisation initiale de l'agent ${agent.id}:`, error);
            }
        }
        
        console.log(`AgentManager: Synchronisation initiale terminée pour ${this.agents.length} agents.`);
    }
}