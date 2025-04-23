// --- src/World/PathfindingWorker.js ---

// (Imports et setup global du worker restent inchangés)
import * as PF from 'pathfinding'; // Assurez-vous que l'import est correct

// --- Constantes partagées (doivent correspondre à NavigationGraph.js) ---
const WALKABLE = 0;
const NON_WALKABLE = 1;

// --- Variables globales du worker ---
// Supprimé: let pfGrid = null;
let workerGridWalkableMap = null; // Uint8Array view on the SharedArrayBuffer
let gridWidth = 0;
let gridHeight = 0;
let finder = null;
let gridScale = 1.0;
let offsetX = 0;
let offsetZ = 0;
let sidewalkHeight = 0.2;

// --- Fonction helper pour calculer la distance (inchangée) ---
function calculateWorldDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dz * dz);
}

// --- Fonction gridToWorld (inchangée) ---
function gridToWorld(gridX, gridY) {
    if (gridScale === undefined || offsetX === undefined || offsetZ === undefined || sidewalkHeight === undefined) {
        console.error("[Worker] Variables de conversion non définies dans gridToWorld!");
        gridScale = gridScale ?? 1.0;
        offsetX = offsetX ?? 0;
        offsetZ = offsetZ ?? 0;
        sidewalkHeight = sidewalkHeight ?? 0.2;
    }
    const worldX = (gridX + 0.5 - offsetX) / gridScale;
    const worldZ = (gridY + 0.5 - offsetZ) / gridScale;
    return { x: worldX, y: sidewalkHeight + 0.05, z: worldZ };
}

// --- CORRIGÉ : Fonction onmessage complète ---
self.onmessage = function(event) {
    // 'data' contient l'objet envoyé depuis le thread principal (event.data)
    const { type, data } = event.data;

    try {
        if (type === 'init') {
            console.log('[Worker] Initialisation reçue (mode SharedArrayBuffer).');
            // Modifier pour accepter gridBuffer au lieu de gridData
            // if (data && data.gridData && data.conversionParams) {
            if (data && data.gridBuffer && data.gridWidth && data.gridHeight && data.conversionParams) {
                // const { width, height, nodesWalkable } = data.gridData;
                const params = data.conversionParams;
                const receivedBuffer = data.gridBuffer;
                gridWidth = data.gridWidth;
                gridHeight = data.gridHeight;

                // Vérifier si on a bien reçu un SharedArrayBuffer
                if (!(receivedBuffer instanceof SharedArrayBuffer)) {
                    throw new Error("L'objet reçu n'est pas un SharedArrayBuffer.");
                }

                // Stocker les paramètres de conversion
                gridScale = params.gridScale ?? 1.0;
                offsetX = params.offsetX ?? 0;
                offsetZ = params.offsetZ ?? 0;
                sidewalkHeight = params.sidewalkHeight ?? 0.2;

                // Créer la vue sur le buffer partagé
                workerGridWalkableMap = new Uint8Array(receivedBuffer);
                console.log(`[Worker] Vue Uint8Array créée sur SharedArrayBuffer (${gridWidth}x${gridHeight}).`);

                // Supprimer la création de pfGrid ici
                // if (width > 0 && height > 0 && nodesWalkable && nodesWalkable.length === height && nodesWalkable[0]?.length === width) {
                //     const matrix = nodesWalkable.map(row => row.map(walkable => walkable ? 0 : 1));
                //     pfGrid = new PF.Grid(width, height, matrix);

                // Initialiser le finder (peut rester global)
                finder = new PF.JumpPointFinder({ // Ou PF.AStarFinder
                    allowDiagonal: true,
                    dontCrossCorners: true,
                    heuristic: PF.Heuristic.manhattan
                });

                // console.log(`[Worker] Grille ${width}x${height} et finder initialisés.`);
                console.log(`[Worker] Finder initialisé.`);
                self.postMessage({ type: 'initComplete' });
                // } else {
                //     console.error("[Worker] Données de grille invalides ou dimensions incohérentes reçues.", { width, height, nodesWalkable_height: nodesWalkable?.length, nodesWalkable_width: nodesWalkable?.[0]?.length });
                //     throw new Error("Données de grille invalides ou dimensions incohérentes pour l'initialisation.");
                // }
            } else {
                 // throw new Error("Données manquantes pour l'initialisation (gridData ou conversionParams).");
                 throw new Error("Données manquantes pour l'initialisation (gridBuffer, gridWidth, gridHeight ou conversionParams).");
            }

        } else if (type === 'findPath') {
            // --- Vérifications initiales adaptées ---
            // if (!pfGrid || !finder) {
            if (!workerGridWalkableMap || !finder) {
                console.error(`[Worker] Tentative findPath Agent ${data?.agentId} mais worker non initialisé ou buffer manquant.`);
                 if(data?.agentId) {
                     self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0 } });
                 }
                return;
            }
            // Vérifie si data et les propriétés nécessaires existent
            if (!data || !data.agentId || !data.startNode || !data.endNode) {
                 console.error("[Worker] Données manquantes pour requête findPath:", data);
                  if(data?.agentId) {
                     self.postMessage({ type: 'pathResult', data: { agentId: data.agentId, path: null, pathLengthWorld: 0 } });
                 }
                 return;
            }
            // --- FIN Vérifications initiales ---

            // *** Déclaration des variables DANS la portée du bloc 'findPath' ***
            const { agentId, startNode, endNode } = data;

            // Vérification supplémentaire des bornes (utilise gridWidth/gridHeight globaux)
            const isValidCoord = (node) => node && node.x >= 0 && node.x < gridWidth && node.y >= 0 && node.y < gridHeight;
            if (!isValidCoord(startNode) || !isValidCoord(endNode)) {
                 console.error(`[Worker] Coordonnées invalides pour Agent ${agentId} - Start: (${startNode?.x}, ${startNode?.y}), End: (${endNode?.x}, ${endNode?.y}). Limites grille: ${gridWidth}x${gridHeight}`);
                 self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                 return;
            }

            // Gérer le cas départ = arrivée
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                 const worldPathData = [gridToWorld(startNode.x, startNode.y)];
                 self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData, pathLengthWorld: 0 } });
                 return;
            }

            let gridPath = null;
            let worldPathData = null;
            let pathLengthWorld = 0;

            try {
                // --- Création de la grille PF.Grid locale à la volée --- 
                const matrix = [];
                for (let y = 0; y < gridHeight; y++) {
                    const row = [];
                    for (let x = 0; x < gridWidth; x++) {
                        // Lire depuis la map partagée. PF.Grid attend 0=walkable, 1=obstacle
                        // ce qui correspond à nos constantes WALKABLE/NON_WALKABLE.
                        row.push(workerGridWalkableMap[y * gridWidth + x]);
                    }
                    matrix.push(row);
                }
                const currentSearchGrid = new PF.Grid(gridWidth, gridHeight, matrix);

                // --- Assurer que start/end sont marchables sur CETTE instance locale ---
                // C'est important car JPS peut échouer sinon.
                currentSearchGrid.setWalkableAt(startNode.x, startNode.y, true);
                currentSearchGrid.setWalkableAt(endNode.x, endNode.y, true);

                // Appel à findPath avec la grille locale
                // gridPath = finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, gridClone);
                gridPath = finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, currentSearchGrid);

                // Traitement du chemin trouvé (inchangé)
                if (gridPath && gridPath.length > 0) {
                    worldPathData = gridPath.map(node => gridToWorld(node[0], node[1]));
                    if (worldPathData.length > 1) {
                        for (let i = 0; i < worldPathData.length - 1; i++) {
                            pathLengthWorld += calculateWorldDistance(worldPathData[i], worldPathData[i+1]);
                        }
                    }
                } else {
                    worldPathData = null;
                    pathLengthWorld = 0;
                }

            } catch (e) {
                // Log erreur pathfinding (inchangé)
                console.error(`[Worker] Erreur DANS finder.findPath pour Agent ${agentId} (${startNode.x},${startNode.y})->(${endNode.x},${endNode.y}):`, e);
                 try {
                     // Vérifier la marchabilité sur la grille locale (currentSearchGrid) si elle existe
                     if (currentSearchGrid && !currentSearchGrid.isWalkableAt(startNode.x, startNode.y)) console.error(` -> Start node (${startNode.x}, ${startNode.y}) non marchable sur grille locale.`);
                     if (currentSearchGrid && !currentSearchGrid.isWalkableAt(endNode.x, endNode.y)) console.error(` -> End node (${endNode.x}, ${endNode.y}) non marchable sur grille locale.`);
                 } catch (walkError) { console.error(" -> Erreur lors de la vérification isWalkableAt:", walkError); }

                worldPathData = null;
                pathLengthWorld = 0;
            }

            // Envoyer le résultat (succès ou échec après tentative)
            self.postMessage({
                type: 'pathResult',
                data: { agentId, path: worldPathData, pathLengthWorld: pathLengthWorld }
            });

        } else {
            console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        // --- CORRECTION DANS LE CATCH ---
        // Erreur générale dans le handler onmessage
        console.error('[Worker] Erreur générale dans onmessage:', error);
         // Tenter de renvoyer une erreur spécifique si possible
         // Accéder à agentId via 'data' (qui est event.data)
         const agentIdOnError = data?.agentId; // <<< CORRIGÉ ICI
         if (agentIdOnError) {
             // Renvoyer un résultat d'échec pour cet agent
             self.postMessage({ type: 'pathResult', data: { agentId: agentIdOnError, path: null, pathLengthWorld: 0 } });
         } else {
             // Si on ne peut pas identifier l'agent, envoyer une erreur générique
             self.postMessage({ type: 'workerError', error: error.message, data: event.data }); // event.data contient l'intégralité du message reçu
         }
         // --- FIN CORRECTION DANS LE CATCH ---
    }
};

// --- Gestionnaire onerror global (inchangé) ---
self.onerror = function(error) {
    console.error('[Worker] Erreur non capturée:', error);
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + error.message });
};