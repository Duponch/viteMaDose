// --- src/World/PathfindingWorker.js ---

// (Imports et setup global du worker restent inchangés)
import * as PF from 'pathfinding'; // Assurez-vous que l'import est correct

let pfGrid = null;
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
            console.log('[Worker] Initialisation reçue.');
            if (data && data.gridData && data.conversionParams) {
                const { width, height, nodesWalkable } = data.gridData;
                const params = data.conversionParams;

                // Stocker les paramètres de conversion
                gridScale = params.gridScale ?? 1.0;
                offsetX = params.offsetX ?? 0;
                offsetZ = params.offsetZ ?? 0;
                sidewalkHeight = params.sidewalkHeight ?? 0.2;

                if (width > 0 && height > 0 && nodesWalkable && nodesWalkable.length === height && nodesWalkable[0]?.length === width) {
                    const matrix = nodesWalkable.map(row => row.map(walkable => walkable ? 0 : 1));
                    // Utiliser le constructeur PF.Grid(width, height, matrix)
                    pfGrid = new PF.Grid(width, height, matrix);

                    finder = new PF.JumpPointFinder({ // Ou PF.AStarFinder
                        allowDiagonal: true,
                        dontCrossCorners: true,
                        heuristic: PF.Heuristic.manhattan
                    });

                    console.log(`[Worker] Grille ${width}x${height} et finder initialisés.`);
                    self.postMessage({ type: 'initComplete' });
                } else {
                    console.error("[Worker] Données de grille invalides ou dimensions incohérentes reçues.", { width, height, nodesWalkable_height: nodesWalkable?.length, nodesWalkable_width: nodesWalkable?.[0]?.length });
                    throw new Error("Données de grille invalides ou dimensions incohérentes pour l'initialisation.");
                }
            } else {
                 throw new Error("Données manquantes pour l'initialisation (gridData ou conversionParams).");
            }

        } else if (type === 'findPath') {
            // --- Vérifications initiales utilisant 'data' (qui est event.data) ---
            if (!pfGrid || !finder) {
                // Utilise data?.agentId pour éviter une erreur si data est null
                console.error(`[Worker] Tentative findPath Agent ${data?.agentId} mais worker non initialisé.`);
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

            // Vérification supplémentaire des bornes
             const isValidCoord = (node) => node && node.x >= 0 && node.x < pfGrid.width && node.y >= 0 && node.y < pfGrid.height;
             if (!isValidCoord(startNode) || !isValidCoord(endNode)) {
                 console.error(`[Worker] Coordonnées invalides pour Agent ${agentId} - Start: (${startNode?.x}, ${startNode?.y}), End: (${endNode?.x}, ${endNode?.y}). Limites grille: ${pfGrid.width}x${pfGrid.height}`);
                 self.postMessage({ type: 'pathResult', data: { agentId: agentId, path: null, pathLengthWorld: 0 } });
                 return;
             }

            // Gérer le cas départ = arrivée
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                 const worldPathData = [gridToWorld(startNode.x, startNode.y)];
                 self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData, pathLengthWorld: 0 } });
                 return;
            }

            const gridClone = pfGrid.clone();
            let gridPath = null;
            let worldPathData = null;
            let pathLengthWorld = 0;

            try {
                // Appel à findPath
                gridPath = finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, gridClone);

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
                     if (!gridClone.isWalkableAt(startNode.x, startNode.y)) console.error(` -> Start node (${startNode.x}, ${startNode.y}) non marchable.`);
                     if (!gridClone.isWalkableAt(endNode.x, endNode.y)) console.error(` -> End node (${endNode.x}, ${endNode.y}) non marchable.`);
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