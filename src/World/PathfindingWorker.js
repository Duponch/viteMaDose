// --- src/World/PathfindingWorker.js ---

// (Imports et setup global du worker restent inchangés)
import * as PF from 'pathfinding'; // Assurez-vous que l'import est correct

let pfGrid = null;
let gridScale = 1.0;
let offsetX = 0;
let offsetZ = 0;
let sidewalkHeight = 0.2;

// Le finder JPS global, initialisé dans 'init'
let finderJPS = null;

// Pour HPA
let clusters = [];
let clusterSize = 0;
let clusterCols = 0;
let clusterRows = 0;
// Map<fromCid, Map<toCid, Array<{x,y,cluster}>>> pour accès rapide aux portes
let clusterDoorsMap = new Map();

// --- Fonction gridToWorld (inchangée) ---
function gridToWorld(gridX, gridY) {
    const worldX = (gridX + 0.5 - offsetX) / gridScale;
    const worldZ = (gridY + 0.5 - offsetZ) / gridScale;
    return { x: worldX, y: sidewalkHeight + 0.05, z: worldZ };
}

self.onmessage = function(event) {
    const { type, data } = event.data;

    try {
        // ------------------------------------------------
        // 1) INITIALISATION (appel unique)
        // ------------------------------------------------
        if (type === 'init') {
            const { width, height, nodesWalkable } = data.gridData;
            const params = data.conversionParams;

            // Stocker params de conversion
            gridScale      = params.gridScale;
            offsetX        = params.offsetX;
            offsetZ        = params.offsetZ;
            sidewalkHeight = params.sidewalkHeight;

            // Construire la grille PF.Grid
            const matrix = nodesWalkable.map(row => row.map(w => w ? 0 : 1));
            pfGrid = new PF.Grid(width, height, matrix);

            // Initialiser JPS global
            finderJPS = new PF.JumpPointFinder({
                allowDiagonal: true,
                dontCrossCorners: true,
                heuristic: PF.Heuristic.manhattan
            });

            // Pré-calcul HPA : découpage en clusters
            clusterSize  = 16;
            clusterCols  = Math.ceil(width  / clusterSize);
            clusterRows  = Math.ceil(height / clusterSize);
            clusters     = [];
            for (let cy = 0; cy < clusterRows; cy++) {
                for (let cx = 0; cx < clusterCols; cx++) {
                    clusters.push({ id: cy*clusterCols + cx, x: cx, y: cy, doors: [] });
                }
            }
            // Identifier les portes
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (!pfGrid.isWalkableAt(x,y)) continue;
                    const cid = Math.floor(y/clusterSize)*clusterCols + Math.floor(x/clusterSize);
                    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => {
                        const nx = x+dx, ny = y+dy;
                        if (nx<0||nx>=width||ny<0||ny>=height) return;
                        if (!pfGrid.isWalkableAt(nx,ny)) return;
                        const ncid = Math.floor(ny/clusterSize)*clusterCols + Math.floor(nx/clusterSize);
                        if (ncid !== cid) clusters[cid].doors.push({ x, y, cluster: ncid });
                    });
                }
            }
            // Nettoyer doublons portes
            clusters.forEach(c => {
                const seen = new Set();
                c.doors = c.doors.filter(d => {
                    const k = `${d.x},${d.y},${d.cluster}`;
                    return seen.has(k) ? false : seen.add(k);
                });
            });

            // Construire clusterDoorsMap pour accès rapide
            clusterDoorsMap.clear();
            clusters.forEach(c => {
                const m = new Map();
                c.doors.forEach(d => {
                    if (!m.has(d.cluster)) m.set(d.cluster, []);
                    m.get(d.cluster).push(d);
                });
                clusterDoorsMap.set(c.id, m);
            });

            self.postMessage({ type: 'initComplete' });
            return;
        }

        // ------------------------------------------------
        // 2) REQUÊTE DE CHEMIN
        // ------------------------------------------------
        if (type === 'findPath') {
            // Si pas encore init
            if (!pfGrid || !finderJPS) {
                if (data?.agentId) {
                    self.postMessage({
                        type: 'pathResult',
                        data: { agentId: data.agentId, path: null, pathLengthWorld: 0 }
                    });
                }
                return;
            }

            const { agentId, startNode, endNode } = data;

            // Cas trivial départ=arrivée
            if (startNode.x === endNode.x && startNode.y === endNode.y) {
                const wp = [ gridToWorld(startNode.x, startNode.y) ];
                self.postMessage({
                    type: 'pathResult',
                    data: { agentId, path: wp, pathLengthWorld: 0 }
                });
                return;
            }

            // --- Helper : Jump Point Search local ---
            function localJPS(s, e) {
                const g = pfGrid.clone();
                g.setWalkableAt(s.x, s.y, true);
                g.setWalkableAt(e.x, e.y, true);
                return finderJPS.findPath(s.x, s.y, e.x, e.y, g);
            }

           /**
			 * Trouve un chemin hiérarchique (HPA) entre deux nœuds de grille.
			 * Pour les trajets courts (manhattan < 2*clusterSize), on utilise directement JPS.
			 *
			 * @param {{x:number,y:number}} s  Le nœud de départ en coordonnées de grille.
			 * @param {{x:number,y:number}} e  Le nœud d’arrivée en coordonnées de grille.
			 * @returns {{gridPath:Array<[number,number]>, pathLength:number}|null}
			 */
			function findHierarchicalPath(s, e) {
				// Seuil pour bypasser HPA sur les trajets courts
				const dx = Math.abs(s.x - e.x), dy = Math.abs(s.y - e.y);
				if (dx + dy < clusterSize * 2) {
					// trajet court → un seul appel JPS
					const raw = localJPS(s, e);
					let len = 0;
					for (let i = 1; i < raw.length; i++) {
						const [ax, ay] = raw[i - 1], [bx, by] = raw[i];
						len += Math.hypot((bx - ax) / gridScale, (by - ay) / gridScale);
					}
					return { gridPath: raw, pathLength: len };
				}

				// Identification des clusters de départ et d’arrivée
				const cs       = clusterSize;
				const startCid = Math.floor(s.y / cs) * clusterCols + Math.floor(s.x / cs);
				const endCid   = Math.floor(e.y / cs) * clusterCols + Math.floor(e.x / cs);

				// Même cluster → A* local unique
				if (startCid === endCid) {
					const raw = localJPS(s, e);
					let len = 0;
					for (let i = 1; i < raw.length; i++) {
						const [ax, ay] = raw[i - 1], [bx, by] = raw[i];
						len += Math.hypot((bx - ax) / gridScale, (by - ay) / gridScale);
					}
					return { gridPath: raw, pathLength: len };
				}

				// Construction du graphe abstrait des clusters
				const adj = new Map();
				clusters.forEach(c => {
					// clusterDoorsMap: Map<fromCid, Map<toCid, Array<doors>>>
					const m = clusterDoorsMap.get(c.id) || new Map();
					adj.set(c.id, Array.from(m.keys()));
				});

				// BFS pour trouver la séquence de clusters
				const queue   = [[startCid]];
				const visited = new Set([startCid]);
				let cPath     = null;
				while (queue.length) {
					const path = queue.shift();
					const cid  = path[path.length - 1];
					if (cid === endCid) {
						cPath = path;
						break;
					}
					for (const nc of adj.get(cid) || []) {
						if (!visited.has(nc)) {
							visited.add(nc);
							queue.push(path.concat(nc));
						}
					}
				}
				if (!cPath) return null;  // pas de chemin abstrait trouvé

				// Concaténation des segments locaux entre portes
				const full = [];
				let prev   = s;
				for (let i = 1; i < cPath.length; i++) {
					const fromC = cPath[i - 1], toC = cPath[i];
					// Choisir la porte la plus proche de 'prev'
					const doors = (clusterDoorsMap.get(fromC).get(toC) || [])
						.sort((a, b) => ((a.x - prev.x) ** 2 + (a.y - prev.y) ** 2)
									- ((b.x - prev.x) ** 2 + (b.y - prev.y) ** 2));
					if (doors.length === 0) return null;
					const door = doors[0];
					const seg  = localJPS(prev, { x: door.x, y: door.y });
					if (!seg) return null;
					// On retire le dernier point pour éviter répétition
					full.push(...seg.slice(0, -1));
					prev = { x: door.x, y: door.y };
				}
				// Segment final jusqu’à e
				const lastSeg = localJPS(prev, e);
				if (!lastSeg) return null;
				full.push(...lastSeg);

				// Calcul de la longueur monde
				let total = 0;
				for (let i = 1; i < full.length; i++) {
					const [ax, ay] = full[i - 1], [bx, by] = full[i];
					total += Math.hypot((bx - ax) / gridScale, (by - ay) / gridScale);
				}

				return { gridPath: full, pathLength: total };
			}

            // Exécution HPA
            const result = findHierarchicalPath(startNode, endNode);
            let worldPath = null, worldLen = 0;
            if (result && result.gridPath) {
                worldPath = result.gridPath.map(n => gridToWorld(n[0], n[1]));
                worldLen  = result.pathLength;
            }

            self.postMessage({
                type: 'pathResult',
                data: { agentId, path: worldPath, pathLengthWorld: worldLen }
            });
            return;
        }

        // Si message inconnu
        console.warn('[Worker] Type de message inconnu reçu:', type);

    } catch (err) {
        console.error('[Worker] Erreur dans onmessage:', err);
        const agentId = data?.agentId;
        if (agentId) {
            self.postMessage({
                type: 'pathResult',
                data: { agentId, path: null, pathLengthWorld: 0 }
            });
        } else {
            self.postMessage({ type: 'workerError', error: err.message, data: event.data });
        }
    }
};

// --- Gestionnaire onerror global (inchangé) ---
self.onerror = function(error) {
    console.error('[Worker] Erreur non capturée:', error);
    self.postMessage({ type: 'workerError', error: 'Erreur worker non capturée: ' + error.message });
};