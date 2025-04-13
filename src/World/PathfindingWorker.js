// src/World/PathfindingWorker.js
import * as PF from 'pathfinding';
// Pas besoin d'importer THREE ici car on renvoie des objets simples {x, y, z}

let pfGrid = null;
let finder = null;
// --- NOUVEAU : Paramètres pour la conversion ---
let gridScale = 1.0;
let offsetX = 0;
let offsetZ = 0;
let sidewalkHeight = 0.2;
// ------------------------------------------

console.log('[Worker] Pathfinding Worker démarré.');

// --- NOUVEAU : Fonction gridToWorld DANS le worker ---
// Renvoie un objet simple {x, y, z}
function gridToWorld(gridX, gridY) {
    const worldX = (gridX + 0.5 - offsetX) / gridScale;
    const worldZ = (gridY + 0.5 - offsetZ) / gridScale; // N'oubliez pas que gridY correspond à worldZ
    // Retourner une position légèrement au-dessus de la hauteur définie du trottoir
    return { x: worldX, y: sidewalkHeight + 0.05, z: worldZ };
}
// -------------------------------------------------

self.onmessage = function(event) {
    const { type, data } = event.data;

    try {
        if (type === 'init') {
            console.log('[Worker] Initialisation reçue.');
            // --- MODIFIÉ : Attendre aussi conversionParams ---
            if (data && data.gridData && data.conversionParams) {
                const { width, height, nodesWalkable } = data.gridData;

                // --- Stocker les paramètres de conversion ---
                const params = data.conversionParams;
                gridScale = params.gridScale ?? 1.0; // Utiliser des valeurs par défaut robustes
                offsetX = params.offsetX ?? 0;
                offsetZ = params.offsetZ ?? 0;
                sidewalkHeight = params.sidewalkHeight ?? 0.2;
                // -----------------------------------------

                if (width && height && nodesWalkable) {
                    // Crée la matrice pour PF.Grid (0=walkable, 1=obstacle)
                    const matrix = nodesWalkable.map(row => row.map(walkable => walkable ? 0 : 1));
                    pfGrid = new PF.Grid(matrix);
                    finder = new PF.AStarFinder({ // Recréer le finder ici
                        allowDiagonal: true,
                        dontCrossCorners: true,
                        heuristic: PF.Heuristic.manhattan,
                        weight: 1
                    });
                    console.log(`[Worker] Grille ${width}x${height} et params conversion initialisés.`);
                    self.postMessage({ type: 'initComplete' });
                } else {
                    throw new Error("Données de grille invalides reçues pour l'initialisation.");
                }
            } else {
                 throw new Error("Données manquantes pour l'initialisation (gridData ou conversionParams).");
            }

        } else if (type === 'findPath') {
            if (!pfGrid || !finder) {
                throw new Error("Worker non initialisé. Impossible de trouver un chemin.");
            }
            if (!data || !data.agentId || !data.startNode || !data.endNode) {
                 throw new Error("Données manquantes pour la requête findPath.");
            }

            const { agentId, startNode, endNode } = data;

            // Gérer le cas départ = arrivée
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                 // --- MODIFIÉ : Convertir même le chemin trivial ---
                 const worldPathData = [gridToWorld(startNode.x, startNode.y)]; // Renvoie [{x,y,z}]
                 self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData } });
                 // --------------------------------------------
                 return;
            }

            // Recherche A* (inchangée)
            const gridClone = pfGrid.clone();
            let gridPath = null;
            let worldPathData = null; // <-- Résultat final [{x,y,z}, ...]

            try {
                gridPath = finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, gridClone);

                // --- MODIFIÉ : Conversion DANS le worker ---
                if (gridPath && gridPath.length > 0) {
                    worldPathData = gridPath.map(node => gridToWorld(node[0], node[1])); // Appel de la fonction locale
                    // console.log(`[Worker] Chemin trouvé et converti pour ${agentId} (${worldPathData.length} points monde).`);
                } else {
                    // console.log(`[Worker] Chemin A* vide ou null pour ${agentId}.`);
                    worldPathData = null;
                }
                // -----------------------------------------

            } catch (e) {
                console.error(`[Worker] Erreur A* pour Agent ${agentId} de (${startNode.x},${startNode.y}) vers (${endNode.x},${endNode.y}):`, e);
                worldPathData = null; // Assurer null en cas d'erreur A*
            }

            // --- MODIFIÉ : Envoyer worldPathData (ou null) ---
            // Le format est maintenant [{x,y,z}, {x,y,z}, ...] ou null
            self.postMessage({ type: 'pathResult', data: { agentId, path: worldPathData } });
            // -----------------------------------------

        } else {
            console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        console.error('[Worker] Erreur dans onmessage:', error);
        self.postMessage({ type: 'workerError', error: error.message, data: event.data });
    }
};

// Gestionnaire d'erreurs global (inchangé)
self.onerror = function(error) {
    console.error('[Worker] Erreur non capturée:', error);
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + error.message });
};