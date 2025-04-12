// src/World/PathfindingWorker.js
import * as PF from 'pathfinding';

let pfGrid = null; // La grille de navigation PF.Grid
let finder = null; // L'instance AStarFinder

console.log('[Worker] Pathfinding Worker démarré.');

// Gestionnaire pour les messages reçus du thread principal
self.onmessage = function(event) {
    const { type, data } = event.data;
    // console.log('[Worker] Message reçu:', type, data);

    try {
        if (type === 'init') {
            // Initialisation : Reçoit les données de la grille
            console.log('[Worker] Initialisation reçue.');
            if (data && data.gridData) {
                const { width, height, nodesWalkable } = data.gridData;
                if (width && height && nodesWalkable) {
                    // Recrée la matrice de nœuds pour PF.Grid
                    // pathfinding-js attend une matrice où 0 est marchable, 1 est non marchable
                    const matrix = [];
                    for (let y = 0; y < height; y++) {
                        matrix[y] = [];
                        for (let x = 0; x < width; x++) {
                            // Inverse la logique : true (walkable) -> 0, false -> 1
                            matrix[y][x] = nodesWalkable[y][x] ? 0 : 1;
                        }
                    }
                    pfGrid = new PF.Grid(matrix); // Crée la grille dans le worker
                    finder = new PF.AStarFinder({ // Crée le finder dans le worker
                        allowDiagonal: true,
                        dontCrossCorners: true,
                        heuristic: PF.Heuristic.manhattan,
                        weight: 1
                    });
                    console.log(`[Worker] Grille PF.Grid ${width}x${height} initialisée.`);
                    self.postMessage({ type: 'initComplete' }); // Confirme l'initialisation
                } else {
                    throw new Error("Données de grille invalides reçues pour l'initialisation.");
                }
            } else {
                 throw new Error("Données manquantes pour l'initialisation.");
            }

        } else if (type === 'findPath') {
            // Requête de pathfinding
            if (!pfGrid || !finder) {
                throw new Error("Worker non initialisé. Impossible de trouver un chemin.");
            }
            if (!data || !data.agentId || !data.startNode || !data.endNode) {
                throw new Error("Données manquantes pour la requête findPath.");
            }

            const { agentId, startNode, endNode } = data;
            // console.log(`[Worker] Recherche chemin pour Agent ${agentId}: (${startNode.x},${startNode.y}) -> (${endNode.x},${endNode.y})`);

            // Vérifier si départ et arrivée sont identiques (évite erreur A*)
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                 // console.log(`[Worker] Départ et arrivée identiques pour ${agentId}. Chemin trivial.`);
                 // Renvoyer un chemin avec juste le point de départ/arrivée
                 self.postMessage({ type: 'pathResult', data: { agentId, path: [[startNode.x, startNode.y]] } });
                 return;
            }

            // Cloner la grille pour la recherche A* (obligatoire avec pathfinding-js)
            const gridClone = pfGrid.clone();
            let gridPath = null;

            try {
                gridPath = finder.findPath(startNode.x, startNode.y, endNode.x, endNode.y, gridClone);
                // console.log(`[Worker] Chemin A* brut trouvé pour ${agentId} (${gridPath?.length} points).`);

            } catch (e) {
                console.error(`[Worker] Erreur A* pour Agent ${agentId} de (${startNode.x},${startNode.y}) vers (${endNode.x},${endNode.y}):`, e);
                 if (!gridClone.isWalkableAt(startNode.x, startNode.y)) { console.error(` -> Le nœud de départ (${startNode.x},${startNode.y}) n'est pas marchable sur la grille clonée.`); }
                 if (!gridClone.isWalkableAt(endNode.x, endNode.y)) { console.error(` -> Le nœud d'arrivée (${endNode.x},${endNode.y}) n'est pas marchable sur la grille clonée.`); }
                 // En cas d'erreur A*, on renvoie null
                 gridPath = null;
            }

            // Envoyer le résultat (chemin ou null) au thread principal
             // Le chemin est une liste de [x, y]
            self.postMessage({ type: 'pathResult', data: { agentId, path: gridPath } });

        } else {
            console.warn('[Worker] Type de message inconnu reçu:', type);
        }
    } catch (error) {
        console.error('[Worker] Erreur dans onmessage:', error);
        // Tenter d'envoyer une erreur au thread principal
        self.postMessage({ type: 'workerError', error: error.message, data: event.data });
    }
};

// Gestionnaire d'erreurs global pour le worker
self.onerror = function(error) {
    console.error('[Worker] Erreur non capturée:', error);
    // Peut aussi envoyer un message au thread principal si nécessaire
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + error.message });
};

// Signale que le worker est prêt (utile si l'initialisation est asynchrone plus tard)
// console.log('[Worker] Prêt à recevoir des messages.');