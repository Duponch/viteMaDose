// src/World/HPA/HPAPrecalculator.js
import AbstractGraph from './AbstractGraph.js'; // Importer la structure
import { HPANode } from './AbstractGraph.js'; // Importer HPANode
import * as PF from 'pathfinding'; // Importer la bibliothèque pathfinding pour A* bas niveau

export default class HPAPrecalculator {
    /**
     * @param {Array<District>} districts - Liste des districts (zones HPA).
     * @param {NavigationGraph} navigationGraph - Le graphe de navigation bas niveau.
     * @param {AbstractGraph} abstractGraph - L'instance du graphe abstrait à remplir.
     */
    constructor(districts, navigationGraph, abstractGraph) {
        this.districts = districts;
        this.navigationGraph = navigationGraph;
        this.abstractGraph = abstractGraph;

        if (!this.navigationGraph || !this.navigationGraph.grid) {
            throw new Error("HPAPrecalculator: NavigationGraph invalide ou manquant.");
        }
        if (!this.abstractGraph) {
            throw new Error("HPAPrecalculator: AbstractGraph manquant.");
        }

        // Utiliser un A* finder pour les calculs de chemins détaillés
        this.detailPathFinder = new PF.AStarFinder({
            allowDiagonal: true,
            dontCrossCorners: true,
            heuristic: PF.Heuristic.manhattan // Ou une autre heuristique
        });
        // Ou utiliser JPS si disponible et préféré :
        // this.detailPathFinder = new PF.JumpPointFinder({ ... });
    }

    /**
     * Exécute le précalcul des chemins intra et inter-zones.
     */
    precomputePaths() {
        console.log("HPAPrecalculator: Début du précalcul des chemins HPA...");
        console.time("HPAPrecomputation");

        // 1. Ajouter tous les nœuds (portes) à l'AbstractGraph
        this.districts.forEach(district => {
            district.gates.forEach(gate => {
                // Utiliser HPANode pour le graphe abstrait
                const hpaNode = new HPANode(gate.nodeId, district.hpaZoneId, gate.position.x, gate.position.y);
                this.abstractGraph.addNode(hpaNode);
            });
        });
        console.log(` -> ${this.abstractGraph.nodes.size} nœuds (portes) ajoutés au graphe abstrait.`);

        // 2. Calculer les chemins INTRA-ZONE (entre portes du même district)
        console.log(" -> Calcul des chemins intra-zone...");
        let intraPathsCalculated = 0;
        this.districts.forEach(district => {
            const gatesInDistrict = district.gates;
            if (gatesInDistrict.length < 2) return; // Pas besoin si moins de 2 portes

            for (let i = 0; i < gatesInDistrict.length; i++) {
                for (let j = i + 1; j < gatesInDistrict.length; j++) {
                    const gateA = gatesInDistrict[i];
                    const gateB = gatesInDistrict[j];

                    const pathResult = this._findDetailPath(gateA.position, gateB.position);

                    if (pathResult) {
                        // Ajouter l'arête DANS LES DEUX SENS à l'AbstractGraph
                        this.abstractGraph.addEdge(gateA.nodeId, gateB.nodeId, pathResult.cost, pathResult.path);
                        // Note: addEdge gère l'ajout bidirectionnel
                        intraPathsCalculated++;
                    } else {
                         console.warn(`  - Échec chemin intra-zone District ${district.id}: ${gateA.id} <-> ${gateB.id}`);
                    }
                }
            }
        });
         console.log(`  -> ${intraPathsCalculated} chemins intra-zone calculés et ajoutés.`);


        // 3. Calculer les chemins INTER-ZONES (entre portes de districts adjacents)
        //    Une porte peut appartenir à deux districts. On cherche les connexions entre
        //    deux portes distinctes qui partagent une zone commune (implicitement adjacentes).
        //    Ou plus simplement: une porte est par définition entre deux zones.
        //    On a déjà ajouté les HPANodes pour chaque porte. Il faut juste connecter
        //    les portes qui sont physiquement proches sur la grille fine.

        //    Alternative plus robuste: On part des arêtes du graphe bas niveau.
        //    Si une arête (ou un chemin très court) connecte deux HPANodes de zones différentes,
        //    c'est une connexion inter-zone de coût faible.

        //    Approche Simplifiée pour l'instant :
        //    Si deux HPANodes sont très proches sur la grille (dist Manhattan <= seuil),
        //    on ajoute une arête de faible coût entre eux, MÊME s'ils sont dans la même zone (ça sera écrasé par le vrai calcul intra-zone)
        //    ou dans des zones différentes. Le vrai coût sera calculé plus tard si nécessaire.

        console.log(" -> Ajout des connexions INTER-ZONE (basé sur proximité)...");
        let interEdgesAdded = 0;
        const proximityThreshold = 2; // Nœuds grille à distance 1 ou 2 (Manhattan)
        const abstractNodesArray = Array.from(this.abstractGraph.nodes.values());

        for(let i = 0; i < abstractNodesArray.length; i++) {
            const nodeA = abstractNodesArray[i];
            for (let j = i + 1; j < abstractNodesArray.length; j++) {
                const nodeB = abstractNodesArray[j];

                // Vérifier s'ils sont déjà connectés par le calcul intra-zone
                const alreadyConnected = nodeA.edges.some(edge => edge.to === nodeB);
                if (alreadyConnected) continue;

                // Calculer distance Manhattan sur la grille
                const dist = Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);

                if (dist <= proximityThreshold) {
                    // Ils sont proches, probablement connectés directement par la route/trottoir
                    // Ajouter une arête de coût bas (le coût exact pourrait être 1 ou sqrt(2) ou la distance réelle)
                    // Le 'detailPath' est juste les deux points ici.
                    const cost = dist; // Approximation
                    const detailPath = [ {x: nodeA.x, y: nodeA.y}, {x: nodeB.x, y: nodeB.y} ];
                    this.abstractGraph.addEdge(nodeA.id, nodeB.id, cost, detailPath);
                    interEdgesAdded++;
                }
            }
        }
        console.log(`  -> ${interEdgesAdded} connexions inter-zone (proximité) ajoutées.`);


        console.timeEnd("HPAPrecomputation");
        console.log("HPAPrecalculator: Précalcul terminé.");
    }

    /**
     * Trouve un chemin détaillé sur la grille fine entre deux positions grille.
     * @param {{x: number, y: number}} startGridPos
     * @param {{x: number, y: number}} endGridPos
     * @returns {{path: Array<{x: number, y: number}>, cost: number}|null}
     */
    _findDetailPath(startGridPos, endGridPos) {
        const grid = this.navigationGraph.grid.clone(); // IMPORTANT: Cloner pour la recherche A*

        // Assurer que départ et arrivée sont marchables (peuvent être sur une porte non marquée initialement)
        grid.setWalkableAt(startGridPos.x, startGridPos.y, true);
        grid.setWalkableAt(endGridPos.x, endGridPos.y, true);

        try {
            const pathNodes = this.detailPathFinder.findPath(
                startGridPos.x, startGridPos.y,
                endGridPos.x, endGridPos.y,
                grid
            );

            if (pathNodes && pathNodes.length > 0) {
                // Calculer le coût (longueur simple du chemin en nombre de pas)
                // On pourrait calculer une distance plus précise si nécessaire
                const cost = pathNodes.length -1; // Nombre de segments
                const simplifiedPath = pathNodes.map(node => ({ x: node[0], y: node[1] }));
                return { path: simplifiedPath, cost: cost };
            }
        } catch (e) {
            console.error(`Erreur A* détaillée entre (<span class="math-inline">\{startGridPos\.x\},</span>{startGridPos.y}) et (<span class="math-inline">\{endGridPos\.x\},</span>{endGridPos.y}):`, e);
        }
        return null;
    }
}