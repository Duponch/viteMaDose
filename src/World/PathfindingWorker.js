// src/World/PathfindingWorker.js
import * as PF from 'pathfinding';
// Importer AbstractGraph pour la désérialisation
import AbstractGraph from './HPA/AbstractGraph.js'; // Assurez-vous que le chemin relatif est correct

let pfGrid = null; // La grille fine originale (PF.Grid)
let abstractGraph = null; // Le graphe HPA précalculé (instance de AbstractGraph)
let detailFinder = null; // JPS Finder pour les chemins sur pfGrid

// Variables pour la conversion de coordonnées
let gridScale = 1.0;
let offsetX = 0;
let offsetZ = 0;
let sidewalkHeight = 0.2;

// --- Fonctions Helper (inchangées) ---

/**
 * Calcule la distance euclidienne 2D entre deux points dans le monde.
 * @param {{x: number, z: number}} p1
 * @param {{x: number, z: number}} p2
 * @returns {number}
 */
function calculateWorldDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Convertit les coordonnées grille (x, y) en coordonnées monde (x, y, z).
 * @param {number} gridX
 * @param {number} gridY
 * @returns {{x: number, y: number, z: number}}
 */
function gridToWorld(gridX, gridY) {
    // S'assurer que les paramètres de conversion sont définis
    if (gridScale === undefined || offsetX === undefined || offsetZ === undefined || sidewalkHeight === undefined) {
        console.error("[Worker] Variables de conversion non définies dans gridToWorld!");
        // Assignation de valeurs par défaut robustes en cas d'erreur
        gridScale = gridScale ?? 1.0;
        offsetX = offsetX ?? 0;
        offsetZ = offsetZ ?? 0;
        sidewalkHeight = sidewalkHeight ?? 0.2;
    }
    // Le +0.5 centre le point dans la cellule de la grille
    const worldX = (gridX + 0.5 - offsetX) / gridScale;
    const worldZ = (gridY + 0.5 - offsetZ) / gridScale;
    // Position Y légèrement au-dessus du trottoir pour éviter z-fighting
    return { x: worldX, y: sidewalkHeight + 0.05, z: worldZ };
}

// --- Gestionnaire de Messages Principal ---
self.onmessage = function(event) {
    const { type, data } = event.data;

    try {
        switch (type) {
            // --- Initialisation de la Grille Fine ---
            case 'initGrid':
                console.log('[Worker] Message Reçu: initGrid');
                if (data && data.gridData && data.conversionParams) {
                    const { width, height, nodesWalkable } = data.gridData;
                    const params = data.conversionParams;

                    // Stocker les paramètres de conversion
                    gridScale = params.gridScale ?? 1.0;
                    offsetX = params.offsetX ?? 0;
                    offsetZ = params.offsetZ ?? 0;
                    sidewalkHeight = params.sidewalkHeight ?? 0.2;

                    // Valider et créer la grille PF.Grid
                    if (width > 0 && height > 0 && nodesWalkable && nodesWalkable.length === height && nodesWalkable[0]?.length === width) {
                        const matrix = nodesWalkable.map(row => row.map(walkable => walkable ? 0 : 1)); // 0=walkable, 1=obstacle
                        pfGrid = new PF.Grid(width, height, matrix);

                        // Initialiser le JPS Finder pour les chemins détaillés
                        detailFinder = new PF.JumpPointFinder({
                            allowDiagonal: true,
                            dontCrossCorners: true,
                            heuristic: PF.Heuristic.manhattan
                            // diagonalMovement: PF.DiagonalMovement.IfAtMostOneObstacle // Option à tester
                        });

                        console.log(`[Worker] Grille Fine ${width}x${height} et JPS Finder (détail) initialisés.`);
                        self.postMessage({ type: 'gridInitComplete' }); // Confirmer l'initialisation de la grille

                    } else {
                        console.error("[Worker] Données de grille invalides reçues pour initGrid.", { width, height, nodesWalkable_height: nodesWalkable?.length });
                        throw new Error("Données de grille invalides pour initGrid.");
                    }
                } else {
                    throw new Error("Données manquantes pour initGrid (gridData ou conversionParams).");
                }
                break;

            // --- Initialisation du Graphe HPA ---
            case 'initHPA':
                console.log('[Worker] Message Reçu: initHPA');
                if (data && data.abstractGraphData) {
                    try {
                        // Désérialiser les données JSON pour recréer l'instance AbstractGraph
                        abstractGraph = AbstractGraph.deserialize(data.abstractGraphData);
                        console.log('[Worker] Graphe HPA désérialisé et prêt.');
                        self.postMessage({ type: 'hpaInitComplete' }); // Confirmer l'initialisation HPA
                    } catch (e) {
                        console.error('[Worker] Erreur désérialisation Graphe HPA:', e);
                        throw new Error("Échec désérialisation HPA.");
                    }
                } else {
                    throw new Error("Données manquantes pour initHPA (abstractGraphData).");
                }
                break;

            // --- Recherche de Chemin Détaillé (sur grille fine avec JPS) ---
            case 'findDetailPath':
                // console.log('[Worker] Message Reçu: findDetailPath', data); // Debug
                if (!pfGrid || !detailFinder) {
                    console.error(`[Worker] findDetailPath Agent ${data?.agentId}: Grille/Finder(JPS) non initialisé.`);
                    if (data?.agentId) { self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0, requestType: 'detail' } }); }
                    return;
                }
                if (!data || !data.agentId || !data.startNode || !data.endNode) {
                    console.error("[Worker] Données manquantes pour findDetailPath:", data);
                    if (data?.agentId) { self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0, requestType: 'detail' } }); }
                    return;
                }

                const { agentId: detailAgentId, startNode: detailStartNode, endNode: detailEndNode } = data;

                // Vérifier coordonnées valides
                const isValidCoordDetail = (node) => node && node.x >= 0 && node.x < pfGrid.width && node.y >= 0 && node.y < pfGrid.height;
                if (!isValidCoordDetail(detailStartNode) || !isValidCoordDetail(detailEndNode)) {
                     console.error(`[Worker] Coordonnées invalides pour findDetailPath Agent ${detailAgentId} - Start: (${detailStartNode?.x}, ${detailStartNode?.y}), End: (${detailEndNode?.x}, ${detailEndNode?.y}). Limites: ${pfGrid.width}x${pfGrid.height}`);
                     self.postMessage({ type: 'pathResult', data: { agentId: detailAgentId, path: null, pathLengthWorld: 0, requestType: 'detail' } });
                     return;
                 }

                // Gérer cas départ = arrivée
                if (detailStartNode.x === detailEndNode.x && detailStartNode.y === detailEndNode.y) {
                    const worldPathDataStart = [gridToWorld(detailStartNode.x, detailStartNode.y)];
                    self.postMessage({ type: 'pathResult', data: { agentId: detailAgentId, path: worldPathDataStart, pathLengthWorld: 0, requestType: 'detail' } });
                    return;
                }

                const gridCloneDetail = pfGrid.clone();
                gridCloneDetail.setWalkableAt(detailStartNode.x, detailStartNode.y, true); // Assurer marchable
                gridCloneDetail.setWalkableAt(detailEndNode.x, detailEndNode.y, true);
                let gridPathDetail = null;
                let worldPathDataDetail = null;
                let pathLengthWorldDetail = 0;

                try {
                    // Exécuter JPS
                    gridPathDetail = detailFinder.findPath(detailStartNode.x, detailStartNode.y, detailEndNode.x, detailEndNode.y, gridCloneDetail);

                    // Traiter résultat
                    if (gridPathDetail && gridPathDetail.length > 0) {
                        worldPathDataDetail = gridPathDetail.map(node => gridToWorld(node[0], node[1]));
                        // Calculer la longueur dans le monde réel
                        if (worldPathDataDetail.length > 1) {
                            for (let i = 0; i < worldPathDataDetail.length - 1; i++) {
                                pathLengthWorldDetail += calculateWorldDistance(worldPathDataDetail[i], worldPathDataDetail[i + 1]);
                            }
                        }
                    } else {
                        worldPathDataDetail = null;
                        pathLengthWorldDetail = 0;
                        console.warn(`[Worker] JPS n'a pas trouvé de chemin détaillé pour Agent ${detailAgentId} de (${detailStartNode.x},${detailStartNode.y}) à (${detailEndNode.x},${detailEndNode.y})`);
                    }

                } catch (e) {
                    console.error(`[Worker] Erreur DANS JPS pour Agent ${detailAgentId} (${detailStartNode.x},${detailStartNode.y})->(${detailEndNode.x},${detailEndNode.y}):`, e);
                    worldPathDataDetail = null;
                    pathLengthWorldDetail = 0;
                }

                // Renvoyer le résultat du chemin détaillé
                self.postMessage({
                    type: 'pathResult',
                    data: { agentId: detailAgentId, path: worldPathDataDetail, pathLengthWorld: pathLengthWorldDetail, requestType: 'detail' }
                });
                break;

            // --- Recherche de Chemin Abstrait (sur graphe HPA) ---
            case 'findAbstractPath':
                // console.log('[Worker] Message Reçu: findAbstractPath', data); // Debug
                if (!abstractGraph) {
                    console.error(`[Worker] findAbstractPath Agent ${data?.agentId}: Graphe HPA non initialisé.`);
                    if (data?.agentId) { self.postMessage({ type: 'abstractPathResult', data: { agentId: data.agentId, path: null } }); }
                    return;
                }
                if (!data || !data.agentId || data.startGateNodeId === undefined || data.endGateNodeId === undefined) {
                    console.error("[Worker] Données manquantes pour findAbstractPath:", data);
                    if (data?.agentId) { self.postMessage({ type: 'abstractPathResult', data: { agentId: data.agentId, path: null } }); }
                    return;
                }

                const { agentId: abstractAgentId, startGateNodeId, endGateNodeId } = data;

                 // Gérer cas départ = arrivée (au niveau abstrait)
                 if (startGateNodeId === endGateNodeId) {
                     console.warn(`[Worker] findAbstractPath Agent ${abstractAgentId}: Start gate ID (${startGateNodeId}) est identique à End gate ID.`);
                     // Renvoyer un chemin contenant juste ce nœud ? Ou null ? Renvoyons null pour forcer l'agent à gérer.
                     self.postMessage({ type: 'abstractPathResult', data: { agentId: abstractAgentId, path: null } });
                     // Alternative: renvoyer la porte unique
                     // const singleNode = abstractGraph.getNode(startGateNodeId);
                     // const singleGate = singleNode ? [{ id: singleNode.id, zoneId: singleNode.zoneId, x: singleNode.x, y: singleNode.y }] : null;
                     // self.postMessage({ type: 'abstractPathResult', data: { agentId: abstractAgentId, path: singleGate } });
                     return;
                 }


                let abstractPathResult = null;
                try {
                    // Utiliser la méthode de recherche A* implémentée dans AbstractGraph
                    abstractPathResult = abstractGraph.findAbstractPath(startGateNodeId, endGateNodeId);
                } catch (e) {
                    console.error(`[Worker] Erreur findAbstractPath pour Agent ${abstractAgentId} (${startGateNodeId}->${endGateNodeId}):`, e);
                    abstractPathResult = null;
                }

                // Formater le résultat : renvoyer une liste d'objets {id, zoneId, x, y}
                const gateSequence = abstractPathResult
                    ? abstractPathResult.map(node => ({ id: node.id, zoneId: node.zoneId, x: node.x, y: node.y }))
                    : null;

                if (!gateSequence) {
                     console.warn(`[Worker] A* abstrait n'a pas trouvé de chemin pour Agent ${abstractAgentId} de ${startGateNodeId} à ${endGateNodeId}`);
                }

                // Renvoyer la séquence de portes (ou null si échec)
                self.postMessage({
                    type: 'abstractPathResult',
                    data: { agentId: abstractAgentId, path: gateSequence }
                });
                break;

            default:
                console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        // Gestion Erreur Générale dans onmessage
        console.error('[Worker] Erreur générale dans onmessage:', error);
        // Tenter de renvoyer un échec pour l'agent si possible
        const agentIdOnError = data?.agentId;
        // Déterminer le type de réponse attendu basé sur le type de message entrant
        const expectedResponseType = (type === 'findAbstractPath') ? 'abstractPathResult' : 'pathResult';
        const requestTypeOnError = (type === 'findAbstractPath') ? 'abstract' : (type === 'findDetailPath' ? 'detail' : 'unknown');

        if (agentIdOnError) {
            if (expectedResponseType === 'abstractPathResult') {
                self.postMessage({ type: 'abstractPathResult', data: { agentId: agentIdOnError, path: null } });
            } else { // 'pathResult'
                self.postMessage({ type: 'pathResult', data: { agentId: agentIdOnError, path: null, pathLengthWorld: 0, requestType: requestTypeOnError } });
            }
        } else {
            // Erreur non liée à un agent spécifique ou agentId manquant
            self.postMessage({ type: 'workerError', error: error.message, dataReceived: event.data });
        }
    }
}; // Fin onmessage

// --- Gestionnaire onerror global ---
self.onerror = function(errorEvent) {
    // errorEvent est un ErrorEvent qui contient message, filename, lineno, colno, error
    console.error('[Worker] Erreur non capturée:', errorEvent.message, 'dans', errorEvent.filename, 'ligne', errorEvent.lineno, 'col', errorEvent.colno);
    // Tenter de renvoyer une erreur générique au thread principal
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + errorEvent.message });
};