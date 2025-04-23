import * as PF from 'pathfinding';
import * as THREE from 'three';
import Pathfinder from './Pathfinder.js'; // Pour utiliser JPS pour les chemins intra-cluster

const DEFAULT_CLUSTER_SIZE = 32; // Taille d'un cluster (en cellules de grille)

class Cluster {
    constructor(id, x, y, width, height, gridOffsetX, gridOffsetY) {
        this.id = id;
        this.x = x; // Coordonnées de départ du cluster dans la grille globale
        this.y = y;
        this.width = width;
        this.height = height;
        this.gridOffsetX = gridOffsetX; // Pour convertir entre coords locales et globales
        this.gridOffsetY = gridOffsetY;
        this.entrances = {}; // Stocke les objets entrance par leur ID unique: { entranceId: { id, clusterId, x, y } }
    }
}

export default class HPAStar {
    constructor(navigationGraph, pathfinder, config = {}) {
        if (!navigationGraph || !navigationGraph.grid) {
            throw new Error("HPAStar: NavigationGraph et sa grille sont requis.");
        }
        if (!pathfinder) {
            throw new Error("HPAStar: Pathfinder (pour JPS) est requis.");
        }
        this.navigationGraph = navigationGraph;
        this.grid = navigationGraph.grid;
        this.pathfinder = pathfinder; // Instance de Pathfinder existant
        this.clusterSize = config.clusterSize || DEFAULT_CLUSTER_SIZE;
        this.clusters = [];

        // **MODIFIÉ : Utilisation d'une Map pour les entrances**
        this.entrances = new Map(); // Clé: "x,y", Valeur: { id, clusterId, x, y }
        this.entranceIdCounter = 0; // Compteur pour les ID uniques

        this.abstractGraph = {}; // { entranceId: [{ targetEntranceId: number, cost: number }] }

        console.time("HPAStar Precomputation");
        console.log("HPAStar: Initialisation...");
        this._buildClusters();
        this._buildEntrances(); // Logique modifiée
        this._buildAbstractGraph(); // Logique adaptée
        console.timeEnd("HPAStar Precomputation");
        console.log(`HPAStar: Précalcul terminé. ${this.entrances.size} entrances uniques, ${this.clusters.length} clusters.`);
    }

    _buildClusters() {
        console.log(`HPAStar: Construction des clusters (taille ${this.clusterSize})...`);
        this.clusters = [];
        const gridW = this.grid.width;
        const gridH = this.grid.height;
        let clusterId = 0;

        for (let y = 0; y < gridH; y += this.clusterSize) {
            for (let x = 0; x < gridW; x += this.clusterSize) {
                const w = Math.min(this.clusterSize, gridW - x);
                const h = Math.min(this.clusterSize, gridH - y);
                const cluster = new Cluster(clusterId++, x, y, w, h, x, y);
                this.clusters.push(cluster);
            }
        }
        console.log(`HPAStar: ${this.clusters.length} clusters créés.`);
    }

    _buildEntrances() {
        console.log("HPAStar: Identification des entrances...");
        this.entrances.clear(); // Vider la map
        this.entranceIdCounter = 0; // Réinitialiser compteur
        // Réinitialiser aussi les dictionnaires d'entrances des clusters
        this.clusters.forEach(c => c.entrances = {});

        for (const cluster of this.clusters) {
            const { id: clusterId, x: startX, y: startY, width: w, height: h } = cluster;

            // Fonction interne pour traiter un nœud sur la bordure *intérieure* du cluster courant
            const processInnerBorderNode = (innerX, innerY) => {
                // Vérifier si ce nœud intérieur est adjacent à un nœud extérieur marchable d'un autre cluster
                const neighbors = [{dx:0, dy:1}, {dx:0, dy:-1}, {dx:1, dy:0}, {dx:-1, dy:0}];
                let isActualBorder = false;
                for(const {dx, dy} of neighbors) {
                    const outerX = innerX + dx;
                    const outerY = innerY + dy;
                    if (this.isBorderTransition(outerX, outerY, innerX, innerY)) {
                        isActualBorder = true;
                        break;
                    }
                }

                if (!isActualBorder) return; // Ce nœud intérieur n'est pas une vraie entrance

                const coordKey = `${innerX},${innerY}`;
                let entrance = this.entrances.get(coordKey);

                if (!entrance) {
                    // Créer nouvelle entrance
                    entrance = {
                        id: this.entranceIdCounter++,
                        clusterId: clusterId, // Appartient à ce cluster
                        x: innerX,
                        y: innerY
                    };
                    this.entrances.set(coordKey, entrance); // Ajout global rapide
                    cluster.entrances[entrance.id] = entrance; // Ajout au dico du cluster
                } else {
                    // L'entrance existe déjà (créée par un voisin)
                    // Assurons-nous qu'elle est aussi dans le dico de ce cluster
                    if (!cluster.entrances[entrance.id]) {
                        cluster.entrances[entrance.id] = entrance;
                    }
                    // Potentiellement vérifier/corriger entrance.clusterId si nécessaire,
                    // mais normalement l'objet partagé devrait suffire.
                     if (entrance.clusterId !== clusterId) {
                          // Ce cas pourrait arriver si getClusterIdForNode a un souci aux bords,
                          // ou si le point est pile sur une ligne entre 4 clusters?
                          // Pour l'instant, on laisse le clusterId initial.
                          // console.warn(`HPAStar: Entrance ${entrance.id} at ${innerX},${innerY} found but has clusterId ${entrance.clusterId} instead of ${clusterId}`);
                     }
                }
            };

            // Parcourir les bords INTERIEURS du cluster
            if (w === 1 && h === 1) { // Cluster 1x1
                processInnerBorderNode(startX, startY);
            } else if (w === 1) { // Colonne (1xH)
                processInnerBorderNode(startX, startY); // Coin haut
                for (let j = 1; j < h - 1; j++) processInnerBorderNode(startX, startY + j); // Milieu
                if (h > 1) processInnerBorderNode(startX, startY + h - 1); // Coin bas
            } else if (h === 1) { // Ligne (Wx1)
                processInnerBorderNode(startX, startY); // Coin gauche
                for (let i = 1; i < w - 1; i++) processInnerBorderNode(startX + i, startY); // Milieu
                if (w > 1) processInnerBorderNode(startX + w - 1, startY); // Coin droit
            } else { // Cas général (W>1, H>1)
                 // Coins
                 processInnerBorderNode(startX, startY);
                 processInnerBorderNode(startX + w - 1, startY);
                 processInnerBorderNode(startX, startY + h - 1);
                 processInnerBorderNode(startX + w - 1, startY + h - 1);
                 // Bords (sans les coins)
                 for (let i = 1; i < w - 1; i++) {
                     processInnerBorderNode(startX + i, startY);
                     processInnerBorderNode(startX + i, startY + h - 1);
                 }
                 for (let j = 1; j < h - 1; j++) {
                     processInnerBorderNode(startX, startY + j);
                     processInnerBorderNode(startX + w - 1, startY + j);
                 }
            }
        }

        console.log(`HPAStar: ${this.entrances.size} unique entrance locations identified.`);
    }

    isBorderTransition(x1, y1, x2, y2) {
         const node1Walkable = this.navigationGraph.isValidGridCoord(x1, y1) && this.grid.isWalkableAt(x1, y1);
         const node2Walkable = this.navigationGraph.isValidGridCoord(x2, y2) && this.grid.isWalkableAt(x2, y2);

         if (node1Walkable && node2Walkable) {
             const cluster1 = this.getClusterIdForNode(x1, y1);
             const cluster2 = this.getClusterIdForNode(x2, y2);
             // Transition si clusters différents et valides
             return cluster1 !== cluster2 && cluster1 !== -1 && cluster2 !== -1;
         }
         return false;
    }

    _buildAbstractGraph() {
        console.log("HPAStar: Construction du graphe abstrait...");
        this.abstractGraph = {};
        let interClusterEdges = 0;
        let intraClusterEdges = 0;

        // Pré-créer les clés dans abstractGraph pour chaque ID d'entrance
        for (const entrance of this.entrances.values()) {
            this.abstractGraph[entrance.id] = [];
        }

        // 1. Connecter les entrances adjacentes à travers les frontières
        console.log("HPAStar: Connexion inter-cluster...");
        for (const entrance of this.entrances.values()) {
            const { id: entranceId, x, y, clusterId: entranceClusterId } = entrance;
            const neighborsCoords = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];

            for (const { dx, dy } of neighborsCoords) {
                const nx = x + dx;
                const ny = y + dy;
                const neighborCoordKey = `${nx},${ny}`;
                const neighborEntrance = this.entrances.get(neighborCoordKey); // Recherche rapide

                if (neighborEntrance && neighborEntrance.clusterId !== entranceClusterId) {
                    // Ajouter l'arête si elle n'existe pas déjà (vérification à sens unique suffit)
                    if (!this.abstractGraph[entranceId].some(edge => edge.targetEntranceId === neighborEntrance.id)) {
                        this._addAbstractEdge(entranceId, neighborEntrance.id, 1); // Coût 1
                        interClusterEdges++;
                    }
                }
            }
        }
        console.log(`HPAStar: ${interClusterEdges} arêtes inter-cluster ajoutées (coût 1).`);

        // 2. Calculer et connecter les entrances au sein de chaque cluster
        console.log("HPAStar: Calcul des chemins intra-cluster via JPS sur sous-grilles...");
        for (const cluster of this.clusters) {
            const clusterEntrancesList = Object.values(cluster.entrances); // Récupère les objets entrance du dico du cluster
            if (clusterEntrancesList.length < 2) continue;

            const subGrid = this._createSubGridForCluster(cluster);
            if (!subGrid) {
                 console.warn(`HPAStar: Impossible de créer la sous-grille pour le cluster ${cluster.id}`);
                 continue;
            }

            for (let i = 0; i < clusterEntrancesList.length; i++) {
                for (let j = i + 1; j < clusterEntrancesList.length; j++) {
                    const startE = clusterEntrancesList[i]; // { id, clusterId, x, y }
                    const endE = clusterEntrancesList[j];   // { id, clusterId, x, y }

                    // Passer seulement les coords à la fonction JPS sur sous-grille
                    const pathResultGrid = this._findPathOnSubGrid(
                        { x: startE.x, y: startE.y },
                        { x: endE.x, y: endE.y },
                        cluster,
                        subGrid
                    );

                    if (pathResultGrid && pathResultGrid.length > 1) {
                        const cost = pathResultGrid.length - 1;
                        if (cost >= 0) {
                            // Utiliser les IDs pour ajouter l'arête
                            if (!this.abstractGraph[startE.id].some(edge => edge.targetEntranceId === endE.id)) {
                                this._addAbstractEdge(startE.id, endE.id, cost);
                                intraClusterEdges++;
                            }
                        }
                    } else if (pathResultGrid && pathResultGrid.length === 1) {
                        // Cas start = end (coût 0)
                         if (!this.abstractGraph[startE.id].some(edge => edge.targetEntranceId === endE.id)) {
                            this._addAbstractEdge(startE.id, endE.id, 0);
                            intraClusterEdges++;
                        }
                    }
                }
            }
        }
        console.log(`HPAStar: ${intraClusterEdges} arêtes intra-cluster ajoutées.`);
    }

    _addAbstractEdge(entranceId1, entranceId2, cost) {
        if (!this.abstractGraph[entranceId1]) this.abstractGraph[entranceId1] = [];
        if (!this.abstractGraph[entranceId2]) this.abstractGraph[entranceId2] = [];
         // Ajouter arête A->B
         if (!this.abstractGraph[entranceId1].some(edge => edge.targetEntranceId === entranceId2)) {
             this.abstractGraph[entranceId1].push({ targetEntranceId: entranceId2, cost: cost });
         }
          // Ajouter arête B->A (non dirigé)
          if (!this.abstractGraph[entranceId2].some(edge => edge.targetEntranceId === entranceId1)) {
              this.abstractGraph[entranceId2].push({ targetEntranceId: entranceId1, cost: cost });
          }
    }

    getClusterIdForNode(gridX, gridY) {
        if (!this.navigationGraph.isValidGridCoord(gridX, gridY)) return -1; // Hors grille

        const clusterX = Math.floor(gridX / this.clusterSize);
        const clusterY = Math.floor(gridY / this.clusterSize);
        const gridWidthInClusters = Math.ceil(this.grid.width / this.clusterSize);
        const clusterIndex = clusterY * gridWidthInClusters + clusterX;

        if (clusterIndex >= 0 && clusterIndex < this.clusters.length) {
            // Vérification supplémentaire : le point est-il bien DANS les limites de ce cluster?
            const c = this.clusters[clusterIndex];
            if (gridX >= c.x && gridX < c.x + c.width && gridY >= c.y && gridY < c.y + c.height) {
                 return c.id;
            } else {
                // Le calcul d'index donne un cluster, mais le point est hors limites? Peut arriver aux bords exacts.
                // Recherche linéaire pour trouver le bon cluster (plus lent mais plus sûr)
                // console.warn(`HPAStar: Node (${gridX}, ${gridY}) index ${clusterIndex} mismatch. Searching linearly...`);
                for(const cluster of this.clusters) {
                   if (gridX >= cluster.x && gridX < cluster.x + cluster.width && gridY >= cluster.y && gridY < cluster.y + cluster.height) {
                       return cluster.id;
                   }
               }
                console.error(`HPAStar: Could not assign node (${gridX}, ${gridY}) to any cluster.`);
                return -1;
            }
        }
         console.warn(`HPAStar: Calculated cluster index ${clusterIndex} out of bounds for node (${gridX}, ${gridY}).`);
        return -1;
    }

    findPath(startWorldPos, endWorldPos) {
        console.log("HPAStar.findPath: Recherche de chemin hiérarchique demandée...");

        const startNode = this.navigationGraph.getClosestWalkableNode(startWorldPos);
        const endNode = this.navigationGraph.getClosestWalkableNode(endWorldPos);

        if (!startNode || !endNode) {
            console.warn("HPAStar.findPath: Impossible de trouver des nœuds de départ/arrivée marchables.");
            return null;
        }
         if (startNode.x === endNode.x && startNode.y === endNode.y) {
             return [this.navigationGraph.gridToWorld(startNode.x, startNode.y)];
         }

        const startClusterId = this.getClusterIdForNode(startNode.x, startNode.y);
        const endClusterId = this.getClusterIdForNode(endNode.x, endNode.y);

        if (startClusterId === -1 || endClusterId === -1) {
             console.error("HPAStar.findPath: Nœud de départ ou d'arrivée hors des clusters définis.");
             return this.pathfinder.findPathRaw(startNode, endNode); // Fallback
        }

        // Cas 1: Même cluster
        if (startClusterId === endClusterId) {
            return this.pathfinder.findPathRaw(startNode, endNode);
        }

        // Cas 2: Clusters différents
        console.log(`HPAStar.findPath: Chemin inter-cluster de ${startClusterId} à ${endClusterId}.`);

        // Structure pour A*
        const openSet = new Map(); // { entranceId: { g, h, f, parent, startPathGrid? } }
        const closedSet = new Set(); // { entranceId }
        const nodeDataStore = {}; // Pour stocker les données A* { entranceId: data }

        // Map pour accès rapide aux objets entrance par ID (construit une fois si besoin)
        const entrancesById = new Map( [...this.entrances.values()].map(e => [e.id, e]) );

         const heuristic = (entranceIdA, entranceIdB) => {
              const entranceA = entrancesById.get(entranceIdA);
              const entranceB = entrancesById.get(entranceIdB);
              if (!entranceA || !entranceB) return Infinity;
              const dx = entranceA.x - entranceB.x; const dy = entranceA.y - entranceB.y;
              return Math.abs(dx) + Math.abs(dy); // Manhattan
         };

        // 1. Initialisation
        const startClusterEntrances = Object.values(this.clusters[startClusterId].entrances); // Get entrance objects { id, clusterId, x, y }
        const endClusterEntrances = Object.values(this.clusters[endClusterId].entrances);

        if (startClusterEntrances.length === 0 || endClusterEntrances.length === 0) {
              console.warn(`HPAStar: Cluster ${startClusterId} ou ${endClusterId} sans entrances. Fallback JPS.`);
              return this.pathfinder.findPathRaw(startNode, endNode);
         }

         for (const entrance of startClusterEntrances) { // entrance is { id, clusterId, x, y }
             // On passe l'objet startNode {x,y} et l'objet entrance {x,y}
             const pathData = this._getPathDataWithCost(startNode, { x: entrance.x, y: entrance.y });
             if (pathData) {
                 const gCost = pathData.cost;
                 let minHeuristic = Infinity;
                  for (const endEntrance of endClusterEntrances) {
                      minHeuristic = Math.min(minHeuristic, heuristic(entrance.id, endEntrance.id));
                  }
                 minHeuristic = (minHeuristic === Infinity) ? 0 : minHeuristic;
                 const data = { g: gCost, h: minHeuristic, f: gCost + minHeuristic, parent: null, startPathGrid: pathData.path }; // Store grid path
                 openSet.set(entrance.id, data);
                 nodeDataStore[entrance.id] = data; // Store data for reconstruction
             }
         }

        if (openSet.size === 0) {
             console.warn("HPAStar: Fallback JPS - no path to start entrances.");
             return this.pathfinder.findPathRaw(startNode, endNode);
         }

         let finalEntranceInfo = null;

        // 2. Boucle A*
        while (openSet.size > 0) {
             let currentId = -1; let minF = Infinity;
             for (const [id, data] of openSet.entries()) { if (data.f < minF) { minF = data.f; currentId = id; } }
             if (currentId === -1) break;

             const currentData = openSet.get(currentId);
             const currentEntrance = entrancesById.get(currentId); // Fast lookup by ID
             if (!currentEntrance) { console.error(`HPAStar A*: Cannot find entrance object for ID ${currentId}`); break; }

             // Goal check
             if (currentEntrance.clusterId === endClusterId) {
                 finalEntranceInfo = { entranceId: currentId, data: currentData };
                 break; // Found path
             }

             // Move current from open to closed
             openSet.delete(currentId);
             closedSet.add(currentId);

             // Explore neighbors in abstract graph
             if (this.abstractGraph[currentId]) {
                 for (const edge of this.abstractGraph[currentId]) {
                     const neighborId = edge.targetEntranceId;
                     if (closedSet.has(neighborId)) continue;

                     const tentativeGCost = currentData.g + edge.cost;
                     const neighborData = openSet.get(neighborId); // Check if already in open set

                     if (!neighborData || tentativeGCost < neighborData.g) {
                         let minHeuristic = Infinity;
                         for (const endEntrance of endClusterEntrances) {
                            minHeuristic = Math.min(minHeuristic, heuristic(neighborId, endEntrance.id));
                         }
                         minHeuristic = (minHeuristic === Infinity) ? 0 : minHeuristic;

                         const newData = {
                             g: tentativeGCost,
                             h: minHeuristic,
                             f: tentativeGCost + minHeuristic,
                             parent: currentId, // Store parent ID
                             startPathGrid: null // Only first nodes have this
                         };
                         openSet.set(neighborId, newData);
                         nodeDataStore[neighborId] = newData; // Store/update data
                     }
                 }
             }
        } // End A* loop

        // 3. Reconstruction
        if (finalEntranceInfo) {
             // a) Path from final entrance to endNode
             const finalEntranceObj = entrancesById.get(finalEntranceInfo.entranceId); // Fast lookup
             if (!finalEntranceObj) { console.error(`HPA*: Cannot find final entrance ${finalEntranceInfo.entranceId}`); return this.pathfinder.findPathRaw(startNode, endNode); }
             // Pass object {x,y} pour start et endNode {x,y}
             const endPathData = this._getPathDataWithCost({x: finalEntranceObj.x, y: finalEntranceObj.y}, endNode);

             if (!endPathData || !endPathData.path) {
                  console.warn("HPAStar: Fallback JPS - no path from final entrance.");
                  return this.pathfinder.findPathRaw(startNode, endNode);
              }

             // b) Reconstruct abstract path (IDs) using nodeDataStore
             const abstractPathIds = [];
             let currentIdRec = finalEntranceInfo.entranceId;
             while (currentIdRec !== null) {
                 abstractPathIds.push(currentIdRec);
                 const nodeData = nodeDataStore[currentIdRec];
                 if (!nodeData) { console.error(`HPAStar: Reconstruction error - missing data for node ${currentIdRec}`); return this.pathfinder.findPathRaw(startNode, endNode); }
                 currentIdRec = nodeData.parent; // Move to parent ID
             }
             abstractPathIds.reverse();

             // c) Assemble final grid path
             let fullGridPath = []; // Array of [x, y] points

             // Add initial path segment
             const firstNodeId = abstractPathIds[0];
             const firstNodeData = nodeDataStore[firstNodeId];
              if (firstNodeData && firstNodeData.startPathGrid) {
                  fullGridPath = fullGridPath.concat(firstNodeData.startPathGrid);
              } else {
                  console.error(`HPAStar: Assembly error - missing startPathGrid for ${firstNodeId}`);
                  return this.pathfinder.findPathRaw(startNode, endNode); // Fallback
              }

             // Add final path segment
             if (endPathData && endPathData.path) {
                 if (fullGridPath.length > 0 && endPathData.path.length > 0) {
                     const lastPt = fullGridPath[fullGridPath.length - 1];
                     const firstPtEnd = endPathData.path[0];
                     if (lastPt[0] === firstPtEnd[0] && lastPt[1] === firstPtEnd[1]) {
                          fullGridPath = fullGridPath.concat(endPathData.path.slice(1)); // Avoid duplicate point
                     } else {
                          fullGridPath = fullGridPath.concat(endPathData.path);
                     }
                 } else {
                      fullGridPath = fullGridPath.concat(endPathData.path);
                  }
             }

             // d) Convert final grid path to world path
             if (fullGridPath.length > 0) {
                 const worldPath = fullGridPath.map(([gx, gy]) => this.navigationGraph.gridToWorld(gx, gy));
                 // console.log(`HPAStar: Chemin hiérarchique trouvé (${worldPath.length} points).`);
                 return worldPath;
             } else {
                  console.warn("HPAStar: Chemin final vide après assemblage. Fallback JPS.");
                 return this.pathfinder.findPathRaw(startNode, endNode);
             }

        } else {
            // A* failed to find a path on abstract graph
            console.warn("HPAStar: Aucun chemin trouvé par A* sur le graphe abstrait. Fallback JPS.");
            return this.pathfinder.findPathRaw(startNode, endNode);
        }
    }

    _createSubGridForCluster(cluster) {
        if (!cluster || !this.grid) return null;
        const subGrid = new PF.Grid(cluster.width, cluster.height);
        for (let localY = 0; localY < cluster.height; localY++) {
            for (let localX = 0; localX < cluster.width; localX++) {
                const globalX = cluster.x + localX;
                const globalY = cluster.y + localY;
                if (this.navigationGraph.isValidGridCoord(globalX, globalY)) {
                     const isWalkable = this.grid.isWalkableAt(globalX, globalY);
                     subGrid.setWalkableAt(localX, localY, isWalkable);
                } else {
                     subGrid.setWalkableAt(localX, localY, false);
                }
            }
        }
        return subGrid;
    }

    _findPathOnSubGrid(startCoords, endCoords, cluster, subGrid) {
        const startLocalX = startCoords.x - cluster.x;
        const startLocalY = startCoords.y - cluster.y;
        const endLocalX = endCoords.x - cluster.x;
        const endLocalY = endCoords.y - cluster.y;
         if (startLocalX < 0 || startLocalX >= subGrid.width || startLocalY < 0 || startLocalY >= subGrid.height ||
             endLocalX < 0 || endLocalX >= subGrid.width || endLocalY < 0 || endLocalY >= subGrid.height) {
             console.error(`HPAStar._findPathOnSubGrid: Coords locales (${startLocalX},${startLocalY}) ou (${endLocalX},${endLocalY}) hors limites sous-grille ${subGrid.width}x${subGrid.height} pour cluster ${cluster.id}. Global: (${startCoords.x},${startCoords.y})->(${endCoords.x},${endCoords.y})`);
             return null;
         }
        const finder = new PF.JumpPointFinder({ allowDiagonal: true, dontCrossCorners: true, heuristic: PF.Heuristic.manhattan });
        try {
            const subGridClone = subGrid.clone();
            subGridClone.setWalkableAt(startLocalX, startLocalY, true);
            subGridClone.setWalkableAt(endLocalX, endLocalY, true);
            const gridPath = finder.findPath(startLocalX, startLocalY, endLocalX, endLocalY, subGridClone);
            return gridPath;
        } catch (e) {
            console.error(`HPAStar._findPathOnSubGrid: Erreur JPS sur sous-grille (${subGrid.width}x${subGrid.height}) C:${cluster.id} de (${startLocalX},${startLocalY}) vers (${endLocalX},${endLocalY}). Erreur:`, e);
            return null;
        }
    }

    _getPathDataWithCost(start, end) {
        // start et end sont supposés être des objets {x, y}
         if (typeof start !== 'object' || start === null || typeof start.x !== 'number' ||
             typeof end !== 'object' || end === null || typeof end.x !== 'number') {
             console.error(`_getPathDataWithCost: Arguments invalides. Start: ${JSON.stringify(start)}, End: ${JSON.stringify(end)}`);
             return null;
         }

        // Appel JPS global avec les coordonnées {x, y}
         const worldPath = this.pathfinder.findPathRaw(start, end);

         if (worldPath && worldPath.length > 0) {
             // Conversion worldPath -> gridPath (temporaire)
             const gridPathRaw = worldPath.map(wp => this.navigationGraph.worldToGrid(wp.x, wp.z));
             // Supprimer doublons consécutifs
             const gridPath = [];
             if (gridPathRaw.length > 0) {
                 gridPath.push(gridPathRaw[0]);
                 for (let i = 1; i < gridPathRaw.length; i++) {
                     if (gridPathRaw[i].x !== gridPathRaw[i-1].x || gridPathRaw[i].y !== gridPathRaw[i-1].y) {
                         gridPath.push(gridPathRaw[i]);
                     }
                 }
             }
             const cost = gridPath.length > 0 ? gridPath.length - 1 : 0;
             // Retourner le chemin au format [ [x,y], ... ]
             return { path: gridPath.map(p => [p.x, p.y]), cost: cost };
         }
         return null;
    }
} 