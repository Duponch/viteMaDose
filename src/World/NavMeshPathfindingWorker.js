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

    // --- Recherche de Chemin (inchangé) ---
	} else if (type === 'findPath') {
		// Vérifications initiales (inchangées)
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

		const startVec = new THREE.Vector3(data.startPos.x, data.startPos.y, data.startPos.z);
		const endVec = new THREE.Vector3(data.endPos.x, data.endPos.y, data.endPos.z);
		let path = null; // Initialiser le chemin à null

		try {
			// --- AJOUT : Snap points to NavMesh ---
			const checkPolygon = true; // Assure que le noeud trouvé est sur un polygone marchable

			// Trouver le point le plus proche sur le NavMesh pour le départ
			const closestStartNodeResult = pathfinding.getClosestNode(startVec, ZONE_ID, groupID, checkPolygon);
			// Trouver le point le plus proche sur le NavMesh pour l'arrivée
			const closestEndNodeResult = pathfinding.getClosestNode(endVec, ZONE_ID, groupID, checkPolygon);

			let snappedStartVec = null;
			let snappedEndVec = null;

			// Vérifier si le snapping a réussi pour le départ
			if (closestStartNodeResult && closestStartNodeResult.node !== null && closestStartNodeResult.pos) {
				snappedStartVec = closestStartNodeResult.pos; // Utiliser la position retournée par getClosestNode
			} else {
				console.warn(`[NavMeshWorker Req ${requestId}] Could not snap start point (${startVec.x.toFixed(1)}, ${startVec.y.toFixed(1)}, ${startVec.z.toFixed(1)}) to NavMesh.`);
			}

			// Vérifier si le snapping a réussi pour l'arrivée
			if (closestEndNodeResult && closestEndNodeResult.node !== null && closestEndNodeResult.pos) {
				snappedEndVec = closestEndNodeResult.pos; // Utiliser la position retournée par getClosestNode
			} else {
				console.warn(`[NavMeshWorker Req ${requestId}] Could not snap end point (${endVec.x.toFixed(1)}, ${endVec.y.toFixed(1)}, ${endVec.z.toFixed(1)}) to NavMesh.`);
			}
			// --- FIN AJOUT SNAPPING ---

			// --- MODIFIÉ : Chercher le chemin seulement si les deux points ont été snappés ---
			if (snappedStartVec && snappedEndVec) {
				// Vérifier si les points snappés sont trop proches (évite erreur findPath)
				if (snappedStartVec.distanceToSquared(snappedEndVec) < 0.01) { // Tolérance très faible
					console.log(`[NavMeshWorker Req ${requestId}] Snapped start and end points are virtually identical. Returning direct path.`);
					path = [snappedStartVec.clone(), snappedEndVec.clone()]; // Retourner un chemin simple entre les deux points
				} else {
					// Appeler findPath avec les points SNAPPÉS
					// console.log(`[NavMeshWorker Req ${requestId}] Finding path between snapped points: Start(${snappedStartVec.x.toFixed(1)}, ${snappedStartVec.z.toFixed(1)}) -> End(${snappedEndVec.x.toFixed(1)}, ${snappedEndVec.z.toFixed(1)})`); // Optionnel: Debug
					path = pathfinding.findPath(snappedStartVec, snappedEndVec, ZONE_ID, groupID);
					// if (!path) { console.warn(`[NavMeshWorker Req ${requestId}] pathfinding.findPath returned null between snapped points.`); } // Optionnel: Debug
				}
			} else {
				// Si le snapping a échoué pour l'un ou l'autre point, le chemin reste null
				console.warn(`[NavMeshWorker Req ${requestId}] Pathfinding aborted because start or end point could not be snapped to NavMesh.`);
				path = null;
			}
			// --- FIN MODIFICATION ---

			// Traitement du résultat (inchangé, mais 'path' peut être null ou un chemin court)
			if (path && path.length > 0) {
				const pathLength = calculatePathLength(path);
				self.postMessage({
					type: 'pathResult', requestId: requestId,
					data: { path: serializePath(path), pathLength: pathLength }
				});
			} else {
				// Si path est null ou vide (après snapping échoué ou findPath échoué)
				self.postMessage({ type: 'pathResult', requestId: requestId, data: { path: null, pathLength: 0 } });
			}
		} catch (pathError) {
			console.error(`[NavMeshWorker Req ${requestId}] Error during findPath/getClosestNode:`, pathError);
			self.postMessage({ type: 'pathError', requestId: requestId, error: `Pathfinding internal error: ${pathError.message || pathError}` });
		}
	// Fin du bloc 'findPath'
	} else { /* ... message inconnu ... */ }
};

// --- Gestionnaire d'Erreurs Globales (INCHANGÉ) ---
self.onerror = function(errorEvent) { /* ... */ };

console.log("NavMeshPathfindingWorker: Gestionnaires de messages définis (API .d.ts adaptée, getZone retiré).");