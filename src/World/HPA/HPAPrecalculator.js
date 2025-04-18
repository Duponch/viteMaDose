// src/World/HPA/HPAPrecalculator.js
import AbstractGraph from './AbstractGraph.js'; // Importer la structure
import { HPANode } from './AbstractGraph.js'; // Importer HPANode
import * as PF from 'pathfinding'; // Importer la bibliothèque pathfinding pour A* / JPS bas niveau

export default class HPAPrecalculator {
    /**
     * @param {Array<import('../District.js').default>} districts - Liste des districts (zones HPA).
     * @param {import('../NavigationGraph.js').default} navigationGraph - Le graphe de navigation bas niveau.
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

        // --- Utiliser Jump Point Search (JPS) pour les chemins détaillés ---
        this.detailPathFinder = new PF.JumpPointFinder({
            allowDiagonal: true,
            dontCrossCorners: true, // Important pour éviter de couper les coins d'obstacles
            heuristic: PF.Heuristic.manhattan, // JPS fonctionne bien avec plusieurs heuristiques
            // Vous pouvez expérimenter avec diagonalMovement si nécessaire :
            // diagonalMovement: PF.DiagonalMovement.Always,
            // diagonalMovement: PF.DiagonalMovement.Never,
            // diagonalMovement: PF.DiagonalMovement.IfAtMostOneObstacle,
            // diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles,
        });
        // --------------------------------------------------------------

        console.log("HPAPrecalculator using JumpPointFinder for detail paths.");
    }

    /**
     * Exécute le précalcul des chemins intra et inter-zones.
     */
    precomputePaths() {
        console.log("HPAPrecalculator: Début du précalcul des chemins HPA...");
        console.time("HPAPrecomputation");

        // 1. Ajouter tous les nœuds (portes) identifiés à l'AbstractGraph
        this.districts.forEach(district => {
            district.gates.forEach(gate => {
                // Créer un HPANode pour chaque porte trouvée
                // L'ID unique 'gate.nodeId' est calculé dans DistrictManager
                const hpaNode = new HPANode(gate.nodeId, district.hpaZoneId, gate.position.x, gate.position.y);
                this.abstractGraph.addNode(hpaNode);
            });
        });
        console.log(` -> ${this.abstractGraph.nodes.size} nœuds (portes) ajoutés au graphe abstrait.`);

        // 2. Calculer les chemins INTRA-ZONE (entre portes du même district)
        console.log(" -> Calcul des chemins intra-zone...");
        let intraPathsCalculated = 0;
        let intraPathErrors = 0;
        this.districts.forEach(district => {
            const gatesInDistrict = district.gates;
            // Pas besoin de calculer si moins de 2 portes dans le district
            if (gatesInDistrict.length < 2) return;

            // Itérer sur toutes les paires uniques de portes dans ce district
            for (let i = 0; i < gatesInDistrict.length; i++) {
                for (let j = i + 1; j < gatesInDistrict.length; j++) {
                    const gateA = gatesInDistrict[i];
                    const gateB = gatesInDistrict[j];

                    // Trouver le chemin détaillé entre ces deux portes en utilisant JPS
                    const pathResult = this._findDetailPath(gateA.position, gateB.position);

                    if (pathResult && pathResult.path && pathResult.cost > 0) {
                        // Ajouter l'arête DANS LES DEUX SENS à l'AbstractGraph
                        // La méthode addEdge gère l'ajout bidirectionnel et évite les doublons
                        this.abstractGraph.addEdge(gateA.nodeId, gateB.nodeId, pathResult.cost, pathResult.path);
                        intraPathsCalculated++;
                    } else {
                        // Logguer un avertissement si aucun chemin n'est trouvé (peut arriver si la grille est complexe)
                        // ou si le coût est 0 (portes identiques ou adjacentes?)
                         if (!pathResult || !pathResult.path) {
                             console.warn(`  - Échec chemin intra-zone District ${district.id}: ${gateA.id} <-> ${gateB.id} (Pas de chemin JPS)`);
                             intraPathErrors++;
                         } else if (pathResult.cost <= 0) {
                             // console.warn(`  - Chemin intra-zone de coût nul ou négatif District ${district.id}: ${gateA.id} <-> ${gateB.id}`);
                             // Ne pas ajouter une arête de coût nul si les portes sont distinctes
                             if(gateA.nodeId !== gateB.nodeId) intraPathErrors++;
                         }
                    }
                }
            }
        });
         console.log(`  -> ${intraPathsCalculated} chemins intra-zone calculés et ajoutés. (${intraPathErrors} erreurs)`);


        // 3. Ajouter les connexions INTER-ZONES (basées sur la proximité physique des portes sur la grille)
        //    Une porte HPA est par définition à la frontière entre deux zones (districts).
        //    Les HPANodes correspondants ont été ajoutés à l'AbstractGraph à l'étape 1.
        //    Il faut maintenant connecter ces HPANodes s'ils sont adjacents sur la grille fine.
        console.log(" -> Ajout des connexions INTER-ZONE (basé sur proximité)...");
        let interEdgesAdded = 0;
        // Seuil de proximité (distance Manhattan sur la grille fine) pour considérer deux portes comme connectées directement.
        // Une valeur de 1 signifie adjacence directe (non diagonale).
        // Une valeur de 2 inclut les diagonales directes.
        const proximityThreshold = 2; // Accepter adjacence directe et diagonale simple
        const abstractNodesArray = Array.from(this.abstractGraph.nodes.values());

        for(let i = 0; i < abstractNodesArray.length; i++) {
            const nodeA = abstractNodesArray[i];
            for (let j = i + 1; j < abstractNodesArray.length; j++) {
                const nodeB = abstractNodesArray[j];

                // IMPORTANT : On ne connecte que si les nœuds appartiennent à des ZONES DIFFERENTES
                // et qu'ils n'ont pas déjà été connectés par un chemin INTRA-ZONE (ne devrait pas arriver si zones différentes).
                 if (nodeA.zoneId === nodeB.zoneId) {
                     continue; // Pas une connexion inter-zone
                 }

                 // Vérifier si une connexion (même intra-zone, par erreur) existe déjà
                const alreadyConnected = nodeA.edges.some(edge => edge.to === nodeB);
                if (alreadyConnected) continue;

                // Calculer distance Manhattan sur la grille fine
                const dist = Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);

                // Si les portes sont suffisamment proches
                if (dist <= proximityThreshold) {
                    // Ils sont adjacents sur la grille.
                    // Créer une arête directe avec un coût représentatif de cette proximité.
                    // Le coût pourrait être 1 pour adjacence directe, 1.414 pour diagonale, ou simplement 'dist'.
                    const cost = dist; // Utiliser la distance Manhattan comme coût simple.
                    // Le chemin détaillé pour cette connexion directe est juste les deux points eux-mêmes.
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
     * Trouve un chemin détaillé sur la grille fine entre deux positions grille en utilisant JPS.
     * @param {{x: number, y: number}} startGridPos - Position grille {x, y}.
     * @param {{x: number, y: number}} endGridPos - Position grille {x, y}.
     * @returns {{path: Array<{x: number, y: number}>, cost: number}|null} - Le chemin sous forme de {x, y} et son coût, ou null.
     */
    _findDetailPath(startGridPos, endGridPos) {
        // Vérification initiale des arguments
        if (!startGridPos || !endGridPos ||
            typeof startGridPos.x !== 'number' || typeof startGridPos.y !== 'number' ||
            typeof endGridPos.x !== 'number' || typeof endGridPos.y !== 'number') {
            console.error("HPAPrecalculator._findDetailPath: Positions de départ ou d'arrivée invalides.");
            return null;
        }

        const grid = this.navigationGraph.grid.clone(); // Toujours cloner pour la recherche

        // Valider les coordonnées avant de les utiliser
        if (!this.navigationGraph.isValidGridCoord(startGridPos.x, startGridPos.y) ||
            !this.navigationGraph.isValidGridCoord(endGridPos.x, endGridPos.y)) {
             console.warn(`HPAPrecalculator._findDetailPath: Coordonnées hors grille (${startGridPos.x},${startGridPos.y}) -> (${endGridPos.x},${endGridPos.y})`);
             return null;
        }


        // Assurer que départ et arrivée sont considérés comme marchables pour le finder
        // même s'ils ne l'étaient pas dans la grille originale (ils sont sur une porte).
        grid.setWalkableAt(startGridPos.x, startGridPos.y, true);
        grid.setWalkableAt(endGridPos.x, endGridPos.y, true);

        try {
            // Exécuter la recherche JPS
            const pathNodes = this.detailPathFinder.findPath(
                startGridPos.x, startGridPos.y,
                endGridPos.x, endGridPos.y,
                grid
            );

            // Traiter le résultat
            if (pathNodes && pathNodes.length > 0) {
                // Calculer le coût basé sur la longueur du chemin
                // Le coût HPA est souvent la distance ou le temps. Ici, utilisons la longueur comme approximation.
                // Pour une grille avec diagonales, on pourrait calculer la distance réelle.
                let calculatedCost = 0;
                for(let i = 0; i < pathNodes.length - 1; i++) {
                    const dx = pathNodes[i+1][0] - pathNodes[i][0];
                    const dy = pathNodes[i+1][1] - pathNodes[i][1];
                    calculatedCost += (dx !== 0 && dy !== 0) ? 1.414 : 1; // Coût diagonal approx.
                }
                //const cost = pathNodes.length - 1; // Coût simple = nombre de pas

                // Formater le chemin en [{x, y}, ...]
                const simplifiedPath = pathNodes.map(node => ({ x: node[0], y: node[1] }));

                return { path: simplifiedPath, cost: calculatedCost };
            } else {
                // Aucun chemin trouvé par JPS
                return null;
            }
        } catch (e) {
            // Gérer les erreurs potentielles de JPS (ex: points hors grille après clone?)
            console.error(`HPAPrecalculator: Erreur JPS détaillée entre (${startGridPos.x},${startGridPos.y}) et (${endGridPos.x},${endGridPos.y}):`, e);
            return null;
        }
    }
} // Fin de la classe HPAPrecalculator