// src/World/NavMeshPathfindingWorker.js

import * as THREE from 'three';
import { Pathfinding } from 'three-pathfinding';

console.log('NavMeshPathfindingWorker: Script chargé.');

// --- Variables Globales du Worker ---
let pathfinding = null;
let ZONE_ID = 'city_level';
let groupID = null;
let navMeshConfig = {};
let isInitialized = false;

// --- Fonctions Helper ---
function calculatePathLength(path) {
    let length = 0;
    if (!path || path.length < 2) return 0;
    for (let i = 0; i < path.length - 1; i++) {
        length += path[i].distanceTo(path[i+1]);
    }
    return length;
}

function serializePath(vectorPath) {
    if (!vectorPath) return null;
    return vectorPath.map(v => ({ x: v.x, y: v.y, z: v.z }));
}

// --- Fonction Helper pour recherche élargie des points valides ---
function findClosestValidNode(position, zoneId, groupId, maxSearchDistance = 10) {
    if (!pathfinding || !isInitialized) return null;
    
    // Essayer d'abord la position exacte
    let result = pathfinding.getClosestNode(position, zoneId, groupId, true);
    if (result && result.node !== null && result.pos) {
        return result;
    }
    
    // Si échoué, essayer avec des distances croissantes
    const searchSteps = 5; // Nombre d'étapes de recherche
    const stepSize = maxSearchDistance / searchSteps;
    
    // Directions de recherche (8 directions)
    const directions = [
        new THREE.Vector3(1, 0, 0),   // droite
        new THREE.Vector3(-1, 0, 0),  // gauche
        new THREE.Vector3(0, 0, 1),   // avant
        new THREE.Vector3(0, 0, -1),  // arrière
        new THREE.Vector3(1, 0, 1),   // diagonale avant-droite
        new THREE.Vector3(-1, 0, 1),  // diagonale avant-gauche
        new THREE.Vector3(1, 0, -1),  // diagonale arrière-droite
        new THREE.Vector3(-1, 0, -1)  // diagonale arrière-gauche
    ];
    
    // Normaliser les diagonales
    for (let i = 4; i < directions.length; i++) {
        directions[i].normalize();
    }
    
    // Pour chaque étape de distance
    for (let step = 1; step <= searchSteps; step++) {
        const currentDistance = step * stepSize;
        
        // Essayer dans chaque direction
        for (const dir of directions) {
            const searchPos = position.clone().addScaledVector(dir, currentDistance);
            result = pathfinding.getClosestNode(searchPos, zoneId, groupId, true);
            
            if (result && result.node !== null && result.pos) {
                // console.log(`Found valid node at distance ${currentDistance} in direction (${dir.x}, ${dir.z})`);
                return result;
            }
        }
    }
    
    return null; // Aucun point valide trouvé même après recherche élargie
}

// --- Gestionnaire de Messages ---
self.onmessage = async function(event) {
    const { type, data, requestId } = event.data;

    // --- Initialisation ---
    if (type === 'init') {
        console.log('[NavMeshWorker] Initialisation reçue...');
        if (isInitialized) { /* ... avertissement ... */ self.postMessage({ type: 'initComplete' }); return; }
        // --- VÉRIFICATION DES DONNÉES REÇUES (inchangée) ---
        if (!data || !data.zoneData || !data.zoneData.groups || !data.zoneData.vertices || !data.navMeshConfig) {
            self.postMessage({ type: 'workerError', error: 'Données de zone ou configuration manquantes' }); return;
        }

        navMeshConfig = data.navMeshConfig; // Conserver la config reçue

        try {
            // 1. Instancier Pathfinding (inchangé)
            pathfinding = new Pathfinding();
            console.log('[NavMeshWorker] Instance Pathfinding créée.');

            // 2. --- SUPPRESSION de pathfinding.setWasmPath ---
            // La bibliothèque devrait charger le WASM implicitement ou
            // il faut vérifier sa documentation pour une autre méthode de configuration si nécessaire.
            const wasmPath = '/recast.wasm'; // Garder pour référence si besoin de déboguer le chemin servi
            console.log(`[NavMeshWorker] Note: WASM devrait être chargé depuis : ${wasmPath} (appel setWasmPath supprimé)`);
            // pathfinding.setWasmPath(wasmPath); // <--- LIGNE SUPPRIMÉE

            // 3. Initialiser le module WASM (si nécessaire explicitement - reste commenté)
             // if (typeof pathfinding.init === 'function') {
             //    try {
             //         await pathfinding.init(); // Décommenter si votre version requiert .init()
             //         console.log('[NavMeshWorker] Module WASM Pathfinding initialisé via .init().');
             //    } catch (wasmError) { /* ... */ }
             // }

            // 4. Reconstruire les vertices Vector3[] (inchangé)
            const verticesArray = data.zoneData.vertices;
            // ... (vérification Float32Array) ...
            const vertices = [];
            if (!(verticesArray instanceof Float32Array)) throw new Error("Received vertices data is not a Float32Array.");
            for (let i = 0; i < verticesArray.length; i += 3) {
                vertices.push(new THREE.Vector3(verticesArray[i], verticesArray[i + 1], verticesArray[i + 2]));
            }

            // 5. Préparer la structure zoneData pour setZoneData (inchangé)
            const reconstructedZoneData = {
                groups: data.zoneData.groups,
                vertices: vertices
            };
            console.log(`[NavMeshWorker] Reconstruit ${vertices.length} vertices.`);

            // 6. Charger les données de zone (inchangé)
            pathfinding.setZoneData(ZONE_ID, reconstructedZoneData);
            console.log(`[NavMeshWorker] Données de zone chargées pour la zone '${ZONE_ID}'.`);

            // 7. Obtenir l'ID du groupe d'agents (inchangé)
            const defaultPositionForGroup = new THREE.Vector3(0, 0, 0);
            groupID = pathfinding.getGroup(ZONE_ID, defaultPositionForGroup);
            if (groupID === null || groupID === undefined) {
                 throw new Error("Impossible d'obtenir un groupID valide pour les agents. La zone est peut-être invalide ou vide.");
            }
            console.log(`[NavMeshWorker] Groupe d'agents (ID: ${groupID}) obtenu pour la zone.`);

            // 8. Finaliser (inchangé)
            isInitialized = true;
            console.log('[NavMeshWorker] Initialisation basée sur setZoneData terminée avec succès.');
            self.postMessage({ type: 'initComplete' });

        } catch (initError) { // Gère les erreurs de new Pathfinding(), setZoneData, getGroup etc.
            console.error('[NavMeshWorker] Erreur pendant l\'initialisation via setZoneData:', initError);
            isInitialized = false; pathfinding = null; groupID = null;
            // Envoyer l'erreur au thread principal
            self.postMessage({ type: 'workerError', error: `Erreur initialisation: ${initError.message || initError}` });
        }

    // --- Recherche de Chemin ---
	} else if (type === 'findPath') {
		// Vérifications initiales
		if (!isInitialized || !pathfinding || groupID === null) {
			console.warn(`[NavMeshWorker] Path request received but worker not ready (init=${isInitialized}, pf=${!!pathfinding}, group=${groupID}). Req ID: ${requestId}`);
			self.postMessage({ type: 'pathError', requestId: requestId, error: 'Worker not initialized' });
			return;
		}
		if (!data || !data.startPos || !data.endPos) {
			console.warn(`[NavMeshWorker] Invalid path request data. Req ID: ${requestId}`);
			self.postMessage({ type: 'pathError', requestId: requestId, error: 'Invalid request data' });
			return;
		}

		// Utiliser le NavMesh pour générer un chemin suivant les trottoirs et passages piétons
		try {
			// Version améliorée pour assurer un pathfinding robuste
            const startVec = new THREE.Vector3(data.startPos.x, data.startPos.y, data.startPos.z);
            const endVec = new THREE.Vector3(data.endPos.x, data.endPos.y, data.endPos.z);
            
            // Forcer la hauteur à celle du trottoir
            const sidewalkHeight = 0.2;
            startVec.y = sidewalkHeight;
            endVec.y = sidewalkHeight;
            
            // Recherche de points valides sur le NavMesh avec plusieurs tentatives
            let startPosOnMesh = null;
            let endPosOnMesh = null;
            
            // Recherche de point de départ valide
            const startSearchDistances = [0, 1, 2, 3, 5, 8]; // Distances de recherche croissantes
            for (const distance of startSearchDistances) {
                // Tentative avec la position exacte d'abord
                if (distance === 0) {
                    const result = pathfinding.getClosestNode(startVec, ZONE_ID, groupID, true);
                    if (result && result.node && result.pos) {
                        startPosOnMesh = result.pos;
                        break;
                    }
                } else {
                    // Essayer en 8 directions autour du point avec distance croissante
                    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                        const offsetX = Math.cos(angle) * distance;
                        const offsetZ = Math.sin(angle) * distance;
                        const testPos = new THREE.Vector3(
                            startVec.x + offsetX,
                            sidewalkHeight,
                            startVec.z + offsetZ
                        );
                        const result = pathfinding.getClosestNode(testPos, ZONE_ID, groupID, true);
                        if (result && result.node && result.pos) {
                            startPosOnMesh = result.pos;
                            console.log(`[NavMeshWorker] Found valid start point at distance ${distance}`);
                            break;
                        }
                    }
                    if (startPosOnMesh) break;
                }
            }
            
            // Recherche de point d'arrivée valide
            for (const distance of startSearchDistances) {
                // Tentative avec la position exacte d'abord
                if (distance === 0) {
                    const result = pathfinding.getClosestNode(endVec, ZONE_ID, groupID, true);
                    if (result && result.node && result.pos) {
                        endPosOnMesh = result.pos;
                        break;
                    }
                } else {
                    // Essayer en 8 directions autour du point avec distance croissante
                    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                        const offsetX = Math.cos(angle) * distance;
                        const offsetZ = Math.sin(angle) * distance;
                        const testPos = new THREE.Vector3(
                            endVec.x + offsetX,
                            sidewalkHeight,
                            endVec.z + offsetZ
                        );
                        const result = pathfinding.getClosestNode(testPos, ZONE_ID, groupID, true);
                        if (result && result.node && result.pos) {
                            endPosOnMesh = result.pos;
                            console.log(`[NavMeshWorker] Found valid end point at distance ${distance}`);
                            break;
                        }
                    }
                    if (endPosOnMesh) break;
                }
            }
            
            // Si on ne trouve pas de points valides, utiliser un chemin direct en fallback
            if (!startPosOnMesh || !endPosOnMesh) {
                console.warn(`[NavMeshWorker] Could not find valid NavMesh points. Using direct path as fallback.`);
                const directPath = [startVec.clone(), endVec.clone()];
                const directPathLength = calculatePathLength(directPath);
                
                self.postMessage({
                    type: 'pathResult',
                    requestId: requestId,
                    data: {
                        path: serializePath(directPath),
                        pathLength: directPathLength
                    }
                });
                return;
            }
            
            // Calculer le chemin entre les points trouvés
            const path = pathfinding.findPath(startPosOnMesh, endPosOnMesh, ZONE_ID, groupID);
            
            // Si un chemin est trouvé, l'envoyer
            if (path && path.length > 0) {
                // Ajouter points de départ/arrivée exacts si nécessaire
                const completePath = [startVec.clone()];
                path.forEach(point => completePath.push(point.clone()));
                completePath.push(endVec.clone());
                
                // Calculer la longueur du chemin final
                const pathLength = calculatePathLength(completePath);
                
                // Envoyer le résultat
                self.postMessage({
                    type: 'pathResult',
                    requestId: requestId,
                    data: { 
                        path: serializePath(completePath),
                        pathLength: pathLength
                    }
                });
            } else {
                // Si aucun chemin n'est trouvé, utiliser un chemin direct
                console.warn(`[NavMeshWorker] Could not find path on NavMesh. Using direct path as fallback.`);
                const directPath = [startVec.clone(), endVec.clone()];
                const directPathLength = calculatePathLength(directPath);
                
                self.postMessage({
                    type: 'pathResult',
                    requestId: requestId,
                    data: {
                        path: serializePath(directPath),
                        pathLength: directPathLength
                    }
                });
            }
		} catch (pathError) {
			console.error(`[NavMeshWorker Req ${requestId}] Error during pathfinding:`, pathError);
			self.postMessage({ type: 'pathError', requestId: requestId, error: `Pathfinding error: ${pathError.message || pathError}` });
		}
	// Fin du bloc 'findPath'
	} else { /* ... message inconnu ... */ }
};

// --- Gestionnaire d'Erreurs Globales (INCHANGÉ) ---
self.onerror = function(errorEvent) { /* ... */ };

console.log("NavMeshPathfindingWorker: Gestionnaires de messages définis (API .d.ts adaptée, getZone retiré).");