// src/World/DistrictManager.js
import * as THREE from 'three';
import District from './District.js';

export default class DistrictManager {
    /**
     * Constructeur de DistrictManager.
     * @param {object} config - La configuration globale.
     * @param {Array} leafPlots - Tableau des parcelles.
     * @param {THREE.Group} [debugGroup=null] - Groupe de debug.
     * @param {NavigationManager} navigationManager - Référence au gestionnaire de navigation. // <-- MODIFIÉ
     */
    constructor(config, leafPlots, debugGroup = null, navigationManager = null) { // <-- MODIFIÉ
        this.config = config;
        this.leafPlots = leafPlots || [];
        this.districts = [];
        this.debugGroup = debugGroup;
        this.navigationManager = navigationManager; // <-- Stocker le Manager entier
        this._gateIdCounter = 0;
    }

    /**
     * Procède à la génération et à la validation de la formation des districts.
     * Lève une exception en cas d'échec critique.
     * Appelle l'identification des portes HPA après validation. // <-- MODIFICATION
     */
    generateAndValidateDistricts() {
        let districtLayoutValid = false;
        let attempts = 0;
        console.time("DistrictFormationAndValidation");
        while (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
            // ... (logique existante de _createDistricts et validateDistrictLayout) ...
            // Réinitialise la référence de district dans toutes les parcelles.
            this.leafPlots.forEach(plot => {
                plot.districtId = null;
                if (plot.buildingInstances) {
                    plot.buildingInstances = [];
                }
            });
            // Vider les districts précédents pour la nouvelle tentative
            this.districts = [];
            this._gateIdCounter = 0; // Réinitialiser aussi le compteur de portes

            this._createDistricts();
            this.logDistrictStats();
            districtLayoutValid = this.validateDistrictLayout();
            if (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
                console.log(`Disposition invalide, nouvelle tentative...`);
            } else if (!districtLayoutValid) {
                console.error(`ERREUR: Aucune disposition valide obtenue après ${attempts} tentatives.`);
            }
        }
        console.timeEnd("DistrictFormationAndValidation");
        if (!districtLayoutValid) {
            throw new Error(`Echec critique : disposition de districts invalide après ${attempts} tentatives.`);
        }

        console.log("Disposition des districts validée.");

        // --- AJOUT : Identification des portes HPA ---
        console.time("HPAGateIdentification");
        this.identifyAndAddHPAGates();
        console.timeEnd("HPAGateIdentification");
        // --- FIN AJOUT ---

        console.time("PlotTypeAdjustment");
        this.adjustPlotTypesWithinDistricts();
        console.timeEnd("PlotTypeAdjustment");
        this.assignDefaultTypeToUnassigned();
        this.logAdjustedZoneTypes();
    }

	// --- NOUVELLE MÉTHODE : Identifier les portes HPA ---
    /**
     * Identifie les points de passage ("portes") entre districts adjacents
     * en se basant sur les routes et les nœuds marchables du NavigationGraph.
     */
    identifyAndAddHPAGates() {
        // --- MODIFICATION : Récupérer le graphe ici ---
        const navigationGraph = this.navigationManager?.getNavigationGraph(); // Utiliser ?. pour sécurité
        // ---------------------------------------------

        if (!navigationGraph || !navigationGraph.grid) { // Vérifier le graphe récupéré
            console.error("DistrictManager: Impossible d'identifier les portes HPA, NavigationGraph non disponible via NavigationManager.");
            return;
        }
        if (!this.districts || this.districts.length < 2) {
            console.log("DistrictManager: Pas assez de districts pour identifier des portes inter-districts.");
            return;
        }

        console.log("Identification des portes HPA entre districts adjacents...");
        let gatesFound = 0;
        const navGrid = navigationGraph.grid; // Utiliser le graphe récupéré
        const checkedPairs = new Set();

        for (let i = 0; i < this.districts.length; i++) {
            const distA = this.districts[i];

            for (let j = i + 1; j < this.districts.length; j++) {
                const distB = this.districts[j];

                // ... (logique pour trouver borderPlotsA et borderPlotsB reste inchangée) ...
                const borderPlotsA = new Set();
                const borderPlotsB = new Set();

                distA.plots.forEach(plotA => {
                    const neighbors = this.findNeighbors(plotA, this.leafPlots);
                    neighbors.forEach(neighbor => {
                        if (neighbor.districtId === distB.id) {
                            borderPlotsA.add(plotA);
                            borderPlotsB.add(neighbor);
                        }
                    });
                });

                if (borderPlotsA.size === 0 || borderPlotsB.size === 0) {
                    continue;
                }


                borderPlotsA.forEach(plotA => {
                    borderPlotsB.forEach(plotB => {
                        const roadInfo = this._findRoadBetweenPlots(plotA, plotB);
                        if (roadInfo) {
                            // --- MODIFICATION : Passer navigationGraph à la méthode helper ---
                            const gateNodes = this._findGateNodesOnRoad(plotA, plotB, roadInfo, navigationGraph);
                            // -----------------------------------------------------------------

                            gateNodes.forEach(nodePos => {
                                const gateId = `gate_${this._gateIdCounter++}`;
                                const gateInfo = {
                                    id: gateId,
                                     // --- MODIFICATION : Utiliser la largeur du graphe récupéré ---
                                    nodeId: nodePos.y * navigationGraph.gridWidth + nodePos.x,
                                    // ----------------------------------------------------------
                                    position: { x: nodePos.x, y: nodePos.y },
                                };
                                distA.addGate(gateInfo);
                                distB.addGate(gateInfo);
                                gatesFound++;
                            });
                        }
                    });
                });
            }
        }

        console.log(`Identification terminée : ${gatesFound} points de portes HPA identifiés et ajoutés aux districts.`);
        // ... (Debug log optionnel) ...
    }

	/**
     * Trouve les nœuds de grille marchables le long du segment de route identifié.
     * @param {Plot} plotA
     * @param {Plot} plotB
     * @param {object} roadInfo
     * @param {NavigationGraph} navigationGraph - Le graphe de navigation bas niveau. // <-- AJOUTÉ
     * @returns {Array<{x: number, y: number}>}
     */
    _findGateNodesOnRoad(plotA, plotB, roadInfo, navigationGraph) { // <-- AJOUTÉ navigationGraph
        const gateNodes = [];
        // --- MODIFICATION : Utiliser le graphe passé en argument ---
        if (!navigationGraph || !navigationGraph.grid) return gateNodes;
        // ---------------------------------------------------------

        const roadW = this.config.roadWidth;
        const halfRoadW = roadW / 2;
        const grid = navigationGraph.grid; // Utiliser la grille du graphe passé
        const step = 1.0 / navigationGraph.gridScale;

        if (roadInfo.type === 'V') {
            // ... (logique interne inchangée, mais utilise navigationGraph pour les conversions/vérifications) ...
            const roadCenterX = roadInfo.x;
            const startZ = roadInfo.z;
            const endZ = roadInfo.z + roadInfo.length;
            for (let z = startZ + step / 2; z < endZ; z += step) {
                for (let dx = -halfRoadW; dx <= halfRoadW; dx += step) {
                    const worldX = roadCenterX + dx;
                    const gridPos = navigationGraph.worldToGrid(worldX, z); // Utiliser navGraph
                    if (navigationGraph.isValidGridCoord(gridPos.x, gridPos.y) && grid.isWalkableAt(gridPos.x, gridPos.y)) {
                        if (!gateNodes.some(n => n.x === gridPos.x && n.y === gridPos.y)) {
                            gateNodes.push(gridPos);
                        }
                    }
                }
            }

        } else { // Route horizontale
             // ... (logique interne inchangée, mais utilise navigationGraph pour les conversions/vérifications) ...
             const roadCenterZ = roadInfo.z;
             const startX = roadInfo.x;
             const endX = roadInfo.x + roadInfo.length;
             for (let x = startX + step / 2; x < endX; x += step) {
                for (let dz = -halfRoadW; dz <= halfRoadW; dz += step) {
                     const worldZ = roadCenterZ + dz;
                     const gridPos = navigationGraph.worldToGrid(x, worldZ); // Utiliser navGraph
                    if (navigationGraph.isValidGridCoord(gridPos.x, gridPos.y) && grid.isWalkableAt(gridPos.x, gridPos.y)) {
                         if (!gateNodes.some(n => n.x === gridPos.x && n.y === gridPos.y)) {
                             gateNodes.push(gridPos);
                         }
                    }
                }
            }
        }

        // ... (Simplification / sélection du point milieu reste inchangée) ...
         if (gateNodes.length > 2) {
             const midIndex = Math.floor(gateNodes.length / 2);
             return [gateNodes[midIndex]];
         }
        return gateNodes;
    }

	/**
     * Trouve les informations de la route (si elle existe) entre deux parcelles adjacentes.
     * @param {Plot} p1
     * @param {Plot} p2
     * @returns {object|null} { type: 'V'|'H', x?, z?, length? } ou null si pas de route directe.
     */
    _findRoadBetweenPlots(p1, p2) {
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;

        // Vérification Route Verticale
        const gapH = p2.x - (p1.x + p1.width);
        const gapHReverse = p1.x - (p2.x + p2.width);
        const zOverlapStart = Math.max(p1.z, p2.z);
        const zOverlapEnd = Math.min(p1.z + p1.depth, p2.z + p2.depth);
        const zOverlapLength = Math.max(0, zOverlapEnd - zOverlapStart);

        if (Math.abs(gapH - roadW) < tolerance && zOverlapLength > tolerance) {
            return { type: "V", x: p1.x + p1.width + roadW / 2, z: zOverlapStart, length: zOverlapLength };
        } else if (Math.abs(gapHReverse - roadW) < tolerance && zOverlapLength > tolerance) {
            return { type: "V", x: p2.x + p2.width + roadW / 2, z: zOverlapStart, length: zOverlapLength };
        }

        // Vérification Route Horizontale
        const gapV = p2.z - (p1.z + p1.depth);
        const gapVReverse = p1.z - (p2.z + p2.depth);
        const xOverlapStart = Math.max(p1.x, p2.x);
        const xOverlapEnd = Math.min(p1.x + p1.width, p2.x + p2.width);
        const xOverlapLength = Math.max(0, xOverlapEnd - xOverlapStart);

        if (Math.abs(gapV - roadW) < tolerance && xOverlapLength > tolerance) {
            return { type: "H", x: xOverlapStart, z: p1.z + p1.depth + roadW / 2, length: xOverlapLength };
        } else if (Math.abs(gapVReverse - roadW) < tolerance && xOverlapLength > tolerance) {
            return { type: "H", x: xOverlapStart, z: p2.z + p2.depth + roadW / 2, length: xOverlapLength };
        }

        return null; // Pas de route directe trouvée
    }

    /**
     * Méthode interne qui crée les districts en deux phases :
     * - Phase 1 : "Seed & Grow" – formation initiale par expansion à partir d'une parcelle graine.
     * - Phase 2 : assignation des parcelles restantes aux districts les plus proches.
     */
    _createDistricts() {
        if (!this.leafPlots || this.leafPlots.length === 0) {
            console.warn("Aucune parcelle disponible pour former des districts.");
            return;
        }
        const allPlots = [...this.leafPlots];
        const assignedPlotIds = new Set();
        let availablePlotsForPhase1 = allPlots.filter(p => p.zoneType !== 'unbuildable');
        const mapRadius = this.config.mapSize / 2;
        if (mapRadius <= 0) {
            console.error("mapRadius invalide.");
            return;
        }
        console.log("Formation des districts - Phase 1 : Seed & Grow");
        while (availablePlotsForPhase1.length >= this.config.minDistrictSize) {
            const seedIndex = Math.floor(Math.random() * availablePlotsForPhase1.length);
            const seedPlot = availablePlotsForPhase1[seedIndex];
            if (assignedPlotIds.has(seedPlot.id)) {
                availablePlotsForPhase1.splice(seedIndex, 1);
                continue;
            }
            const distToCenter = seedPlot.center.length();
            const normalizedDistance = Math.max(0, Math.min(1, distToCenter / mapRadius));
            let districtType;
            if (normalizedDistance < this.config.forceBusinessMaxDistance) {
                districtType = 'business';
            } else {
                const probabilities = this.getDistrictTypeProbabilities(distToCenter);
                districtType = this.chooseDistrictType(probabilities);
            }
            const newDistrict = new District(districtType);
            const queue = [seedPlot];
            const currentDistrictAssigned = new Set();
            newDistrict.addPlot(seedPlot);
            assignedPlotIds.add(seedPlot.id);
            currentDistrictAssigned.add(seedPlot.id);
            availablePlotsForPhase1.splice(seedIndex, 1);
            let head = 0;
            while (head < queue.length && newDistrict.plots.length < this.config.maxDistrictSize) {
                const currentPlot = queue[head++];
                const neighbors = this.findNeighbors(currentPlot, allPlots);
                for (const neighbor of neighbors) {
                    if (
                        neighbor.zoneType !== 'unbuildable' &&
                        !assignedPlotIds.has(neighbor.id) &&
                        !currentDistrictAssigned.has(neighbor.id)
                    ) {
                        let canAddNeighbor = true;
                        const neighborDistToCenter = neighbor.center.length();
                        const neighborNormalizedDistance = Math.max(0, Math.min(1, neighborDistToCenter / mapRadius));
                        if (newDistrict.type === 'industrial') {
                            if (neighborNormalizedDistance < this.config.strictMinIndustrialDist) {
                                canAddNeighbor = false;
                            }
                        } else if (newDistrict.type === 'business') {
                            if (neighborNormalizedDistance > this.config.strictMaxBusinessDist) {
                                canAddNeighbor = false;
                            }
                        }
                        if (newDistrict.plots.length < this.config.maxDistrictSize && canAddNeighbor) {
                            newDistrict.addPlot(neighbor);
                            assignedPlotIds.add(neighbor.id);
                            currentDistrictAssigned.add(neighbor.id);
                            queue.push(neighbor);
                            const neighborIndexInAvailable = availablePlotsForPhase1.findIndex(p => p.id === neighbor.id);
                            if (neighborIndexInAvailable > -1) {
                                availablePlotsForPhase1.splice(neighborIndexInAvailable, 1);
                            }
                        } else {
                            if (newDistrict.plots.length >= this.config.maxDistrictSize) {
                                break;
                            }
                        }
                    }
                }
            }
            if (newDistrict.plots.length >= this.config.minDistrictSize) {
                this.districts.push(newDistrict);
            } else {
                console.warn(`District (type ${districtType}, seed ${seedPlot.id}) trop petit (${newDistrict.plots.length}/${this.config.minDistrictSize}). Libération des parcelles.`);
                newDistrict.plots.forEach(p => {
                    assignedPlotIds.delete(p.id);
                    p.districtId = null;
                });
            }
        }
        console.log(`Phase 1 terminée : ${this.districts.length} districts créés.`);
        console.log("Formation des districts - Phase 2 : Assignation des parcelles restantes");
        let remainingPlots = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id));
        let assignedInPhase2 = 0;
        if (remainingPlots.length > 0 && this.districts.length > 0) {
            console.log(` -> Tentative d'assigner ${remainingPlots.length} parcelles restantes.`);
            remainingPlots.forEach(plot => {
                let bestDistrict = null;
                let minDistanceSq = Infinity;
                this.districts.forEach(district => {
                    const distSq = plot.center.distanceToSquared(district.center);
                    if (distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        bestDistrict = district;
                    }
                });
                if (bestDistrict) {
                    let canAssign = true;
                    const plotDistToCenter = plot.center.length();
                    const plotNormalizedDistance = Math.max(0, Math.min(1, plotDistToCenter / mapRadius));
                    if (bestDistrict.type === 'industrial') {
                        if (plotNormalizedDistance < this.config.strictMinIndustrialDist) {
                            canAssign = false;
                        }
                    } else if (bestDistrict.type === 'business') {
                        if (plotNormalizedDistance > this.config.strictMaxBusinessDist) {
                            canAssign = false;
                        }
                    }
                    if (canAssign) {
                        bestDistrict.addPlot(plot);
                        assignedPlotIds.add(plot.id);
                        assignedInPhase2++;
                    } else {
                        console.warn(`(Phase 2) Parcelle ${plot.id} (type initial ${plot.zoneType}) ne peut être assignée au district ${bestDistrict.id} (${bestDistrict.type}) selon les règles.`);
                    }
                } else {
                    console.warn(`(Phase 2) Parcelle ${plot.id} n'a trouvé aucun district proche.`);
                }
            });
            console.log(` -> ${assignedInPhase2} parcelles assignées en Phase 2.`);
        } else if (remainingPlots.length > 0) {
            console.warn(` -> ${remainingPlots.length} parcelles restent non assignées, aucun district n'a été créé en Phase 1.`);
        } else {
            console.log(" -> Aucune parcelle restante à assigner en Phase 2.");
        }
        const finalUnassignedCount = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id)).length;
        console.log(`Formation des districts terminée : ${this.districts.length} districts formés, ${finalUnassignedCount} parcelles constructibles non assignées.`);
    }

    /**
     * Valide la disposition des districts en vérifiant diverses règles de placement et de comptage.
     * @returns {boolean} true si validation réussie, false sinon.
     */
    validateDistrictLayout() {
        console.log("Validation de la disposition des districts...");
        if (!this.districts || this.districts.length === 0) {
            console.warn("Validation échouée : aucun district à valider.");
            return false;
        }
        const mapRadius = this.config.mapSize / 2;
        if (mapRadius <= 0) {
            console.error("Validation échouée : mapRadius invalide.");
            return false;
        }
        let businessInCoreCenterCount = 0;
        let industrialInCoreEdgeCount = 0;
        let strictlyMisplacedIndustrial = 0;
        let strictlyMisplacedBusiness = 0;
        let totalIndustrialCount = 0;
        let totalBusinessCount = 0;
        this.districts.forEach(district => {
            const distToCenter = district.center.length();
            const normalizedDistance = Math.max(0, Math.min(1, distToCenter / mapRadius));
            if (district.type === 'industrial') {
                totalIndustrialCount++;
            } else if (district.type === 'business') {
                totalBusinessCount++;
            }
            if (district.type === 'business' && normalizedDistance <= this.config.validationZoneCenterMaxDist) {
                businessInCoreCenterCount++;
            }
            if (district.type === 'industrial' && normalizedDistance >= this.config.validationZoneEdgeMinDist) {
                industrialInCoreEdgeCount++;
            }
            if (district.type === 'industrial' && normalizedDistance < this.config.strictMinIndustrialDist) {
                strictlyMisplacedIndustrial++;
                console.warn(`District industriel ${district.id} à distance ${normalizedDistance.toFixed(2)} (interdit < ${this.config.strictMinIndustrialDist})`);
            }
            if (district.type === 'business' && normalizedDistance > this.config.strictMaxBusinessDist) {
                strictlyMisplacedBusiness++;
                console.warn(`District business ${district.id} à distance ${normalizedDistance.toFixed(2)} (interdit > ${this.config.strictMaxBusinessDist})`);
            }
        });
        const hasEnoughBusinessInCoreZone = businessInCoreCenterCount >= this.config.minBusinessInCenter;
        const hasEnoughIndustrialInEdgeZone = industrialInCoreEdgeCount >= this.config.minIndustrialInEdge;
        const noStrictlyMisplaced = strictlyMisplacedIndustrial === 0 && strictlyMisplacedBusiness === 0;
        const meetsMinTotalIndustrial = totalIndustrialCount >= this.config.minTotalIndustrialDistricts;
        const meetsMaxTotalIndustrial = totalIndustrialCount <= this.config.maxTotalIndustrialDistricts;
        const meetsMinTotalBusiness = totalBusinessCount >= this.config.minTotalBusinessDistricts;
        const meetsMaxTotalBusiness = totalBusinessCount <= this.config.maxTotalBusinessDistricts;
        console.log("RESULTATS VALIDATION:");
        console.log(` - Placement strict Industriel (<${this.config.strictMinIndustrialDist}): ${strictlyMisplacedIndustrial} (OK si 0) -> ${strictlyMisplacedIndustrial === 0}`);
        console.log(` - Placement strict Business (>${this.config.strictMaxBusinessDist}): ${strictlyMisplacedBusiness} (OK si 0) -> ${strictlyMisplacedBusiness === 0}`);
        console.log(` - Minimum Zone Centre : Business (<${this.config.validationZoneCenterMaxDist}): ${businessInCoreCenterCount} (min requis ${this.config.minBusinessInCenter}) -> ${hasEnoughBusinessInCoreZone}`);
        console.log(` - Minimum Zone Périphérie: Industriel (>${this.config.validationZoneEdgeMinDist}): ${industrialInCoreEdgeCount} (min requis ${this.config.minIndustrialInEdge}) -> ${hasEnoughIndustrialInEdgeZone}`);
        console.log(` - Total Industriel: ${totalIndustrialCount} (min: ${this.config.minTotalIndustrialDistricts}, max: ${this.config.maxTotalIndustrialDistricts}) -> Min OK: ${meetsMinTotalIndustrial}, Max OK: ${meetsMaxTotalIndustrial}`);
        console.log(` - Total Business: ${totalBusinessCount} (min: ${this.config.minTotalBusinessDistricts}, max: ${this.config.maxTotalBusinessDistricts}) -> Min OK: ${meetsMinTotalBusiness}, Max OK: ${meetsMaxTotalBusiness}`);
        if (!noStrictlyMisplaced) {
            console.warn("Validation échouée : au moins un district est mal placé strictement.");
            return false;
        }
        if (!meetsMinTotalIndustrial) {
            console.warn(`Validation échouée : total industriel (${totalIndustrialCount}) inférieur au minimum requis (${this.config.minTotalIndustrialDistricts}).`);
            return false;
        }
        if (!meetsMaxTotalIndustrial) {
            console.warn(`Validation échouée : total industriel (${totalIndustrialCount}) supérieur au maximum autorisé (${this.config.maxTotalIndustrialDistricts}).`);
            return false;
        }
        if (!meetsMinTotalBusiness) {
            console.warn(`Validation échouée : total business (${totalBusinessCount}) inférieur au minimum requis (${this.config.minTotalBusinessDistricts}).`);
            return false;
        }
        if (!meetsMaxTotalBusiness) {
            console.warn(`Validation échouée : total business (${totalBusinessCount}) supérieur au maximum autorisé (${this.config.maxTotalBusinessDistricts}).`);
            return false;
        }
        console.log("Validation réussie : toutes les règles de placement et de comptage sont respectées.");
        return true;
    }

    /**
     * Ajuste les types de parcelles dans chaque district en fonction du type de district
     * (alternance résidentielle, 0/1 parc par district).
     */
    adjustPlotTypesWithinDistricts() {
        console.log("Ajustement des types de parcelles (alternance résidentielle, 0/1 parc par district)...");
        const stats = {
            forcedToSkyscraper: 0,
            forcedToIndustrial: 0,
            assignedHouse: 0,
            assignedBuilding: 0,
            assignedPark: 0,
            parkRemoved: 0,
            changedResidentialType: 0,
            alreadyCorrectResidential: 0,
            alreadyCorrectOther: 0,
            unbuildableSkipped: 0
        };
        this.districts.forEach(district => {
            let assignHouse = true;
            let parkAssignedInDistrict = false;
            district.plots.forEach(plot => {
                if (plot.zoneType === 'unbuildable') {
                    stats.unbuildableSkipped++;
                    return;
                }
                const initialType = plot.zoneType;
                let targetType = null;
                const isInitiallyPark = (initialType === 'park');
                switch (district.type) {
                    case 'business':
                        targetType = 'skyscraper';
                        if (isInitiallyPark) {
                            if (!parkAssignedInDistrict) {
                                targetType = 'park';
                                stats.assignedPark++;
                                parkAssignedInDistrict = true;
                            } else {
                                targetType = 'skyscraper';
                                stats.parkRemoved++;
                                stats.forcedToSkyscraper++;
                            }
                        } else {
                            if (initialType !== targetType)
                                stats.forcedToSkyscraper++;
                            else
                                stats.alreadyCorrectOther++;
                        }
                        break;
                    case 'industrial':
                        targetType = 'industrial';
                        if (isInitiallyPark) {
                            if (!parkAssignedInDistrict) {
                                targetType = 'park';
                                stats.assignedPark++;
                                parkAssignedInDistrict = true;
                            } else {
                                targetType = 'industrial';
                                stats.parkRemoved++;
                                stats.forcedToIndustrial++;
                            }
                        } else {
                            if (initialType !== targetType)
                                stats.forcedToIndustrial++;
                            else
                                stats.alreadyCorrectOther++;
                        }
                        break;
                    case 'residential':
                        if (isInitiallyPark) {
                            if (!parkAssignedInDistrict) {
                                targetType = 'park';
                                stats.assignedPark++;
                                parkAssignedInDistrict = true;
                            } else {
                                targetType = assignHouse ? 'house' : 'building';
                                stats.parkRemoved++;
                                if (targetType === 'house')
                                    stats.assignedHouse++;
                                else
                                    stats.assignedBuilding++;
                                assignHouse = !assignHouse;
                            }
                        } else {
                            targetType = assignHouse ? 'house' : 'building';
                            if (targetType === 'house') {
                                stats.assignedHouse++;
                                if (initialType !== 'house')
                                    stats.changedResidentialType++;
                                else
                                    stats.alreadyCorrectResidential++;
                            } else {
                                stats.assignedBuilding++;
                                if (initialType !== 'building')
                                    stats.changedResidentialType++;
                                else
                                    stats.alreadyCorrectResidential++;
                            }
                            assignHouse = !assignHouse;
                        }
                        break;
                    default:
                        targetType = initialType;
                        console.warn(`District ${district.id} a un type inconnu: ${district.type}. Parcelle ${plot.id} inchangée.`);
                        stats.alreadyCorrectOther++;
                        break;
                }
                if (targetType !== null) {
                    plot.zoneType = targetType;
                    plot.isPark = (targetType === 'park');
                }
            });
        });
        console.log("Ajustement terminé :");
        console.log(` - Forcés Gratte-ciel: ${stats.forcedToSkyscraper}`);
        console.log(` - Forcés Industriel: ${stats.forcedToIndustrial}`);
        console.log(` - Assignés Maison: ${stats.assignedHouse}`);
        console.log(` - Assignés Immeuble: ${stats.assignedBuilding}`);
        console.log(` - Assignés/Gardés Parc: ${stats.assignedPark}`);
        console.log(` - Parcs Convertis: ${stats.parkRemoved}`);
        console.log(` - Changements résidentiels: ${stats.changedResidentialType}`);
        console.log(` - Déjà corrects (résidentiel): ${stats.alreadyCorrectResidential}`);
        console.log(` - Déjà corrects (autres): ${stats.alreadyCorrectOther}`);
        console.log(` - Parcelles non constructibles ignorées: ${stats.unbuildableSkipped}`);
    }

    /**
     * Pour toutes les parcelles non assignées à un district (hors "unbuildable" et "park"),
     * force le type par défaut 'building'.
     */
    assignDefaultTypeToUnassigned() {
        console.log("Fallback : Attribution d'un type par défaut aux parcelles non assignées...");
        let unassignedCorrected = 0;
        this.leafPlots.forEach(plot => {
            if (plot.districtId === null && plot.zoneType !== 'unbuildable' && plot.zoneType !== 'park') {
                const originalType = plot.zoneType;
                plot.zoneType = 'building';
                plot.isPark = false;
                console.warn(` -> Parcelle ${plot.id} (initial: ${originalType}) sans district. Forcé à '${plot.zoneType}'.`);
                unassignedCorrected++;
            }
        });
        if (unassignedCorrected > 0) {
            console.log(` -> ${unassignedCorrected} parcelles mises à jour en type par défaut.`);
        } else {
            console.log(" -> Toutes les parcelles constructibles sont assignées à un district.");
        }
    }

    /**
     * Cherche et retourne les parcelles voisines d'une parcelle donnée.
     * @param {object} plot - La parcelle ciblée.
     * @param {Array} allPlots - Liste de toutes les parcelles.
     * @returns {Array} Tableau des parcelles voisines.
     */
    findNeighbors(plot, allPlots) {
        const neighbors = [];
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;
        const p1Bounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth };
        for (const p2 of allPlots) {
            if (p2.id === plot.id) continue;
            const p2Bounds = { minX: p2.x, maxX: p2.x + p2.width, minZ: p2.z, maxZ: p2.z + p2.depth };
            const zDist = (p2Bounds.minZ >= p1Bounds.maxZ) ? (p2Bounds.minZ - p1Bounds.maxZ) : (p1Bounds.minZ - p2Bounds.maxZ);
            const xDist = (p2Bounds.minX >= p1Bounds.maxX) ? (p2Bounds.minX - p1Bounds.maxX) : (p1Bounds.minX - p2Bounds.maxX);
            const xOverlap = Math.max(0, Math.min(p1Bounds.maxX, p2Bounds.maxX) - Math.max(p1Bounds.minX, p2Bounds.minX));
            const zOverlap = Math.max(0, Math.min(p1Bounds.maxZ, p2Bounds.maxZ) - Math.max(p1Bounds.minZ, p2Bounds.minZ));
            const touchesVertically = Math.abs(xDist) < tolerance && zOverlap > tolerance;
            const touchesHorizontally = Math.abs(zDist) < tolerance && xOverlap > tolerance;
            const separatedByVerticalRoad = Math.abs(xDist - roadW) < tolerance && zOverlap > tolerance;
            const separatedByHorizontalRoad = Math.abs(zDist - roadW) < tolerance && xOverlap > tolerance;
            if (touchesHorizontally || touchesVertically || separatedByHorizontalRoad || separatedByVerticalRoad) {
                neighbors.push(p2);
            }
        }
        return neighbors;
    }

    /**
     * Calcule les probabilités brutes pour chaque type de district en fonction de la distance par rapport au centre.
     * @param {number} distanceToCenter - Distance de la parcelle au centre de la carte.
     * @returns {object} Les probabilités pour 'business', 'industrial' et 'residential'.
     */
    getDistrictTypeProbabilities(distanceToCenter) {
        const mapRadius = this.config.mapSize / 2;
        const bizConf = this.config.districtProbabilities.business;
        const indConf = this.config.districtProbabilities.industrial;
        const resConf = this.config.districtProbabilities.residential;
        const defaultProbs = { business: 0.1, industrial: 0.1, residential: 0.8 };
        if (!bizConf || !indConf || !resConf || mapRadius <= 0) {
            console.warn("Config districtProbabilities incomplète ou mapRadius nul, utilisation des probabilités par défaut.");
            return defaultProbs;
        }
        const normalizedDistance = Math.max(0, Math.min(1, distanceToCenter / mapRadius));
        const d = normalizedDistance;
        const rawPBusiness = Math.exp(-d * (bizConf.decay || 10)) * (bizConf.max !== undefined ? bizConf.max : 0.15);
        let rawPIndustrial;
        if (d > (indConf.threshold !== undefined ? indConf.threshold : 0.85)) {
            rawPIndustrial = (1 - Math.exp(-(d - (indConf.threshold !== undefined ? indConf.threshold : 0.85)) * (indConf.factor || 5))) * (indConf.multiplier !== undefined ? indConf.multiplier : 0.2);
        } else {
            rawPIndustrial = (indConf.base !== undefined ? indConf.base : 0.01);
        }
        const residentialPeakTerm = Math.exp(-((d - (resConf.peakCenter !== undefined ? resConf.peakCenter : 0.5)) ** 2) / (2 * (resConf.peakWidth || 0.2)));
        const rawPResidential = residentialPeakTerm + (resConf.base !== undefined ? resConf.base : 0.8);
        const totalRawP = rawPBusiness + rawPIndustrial + rawPResidential;
        if (totalRawP <= 0) {
            console.warn("Somme des probabilités brutes nulle ou négative, utilisation des probabilités par défaut.");
            return defaultProbs;
        }
        return {
            business: rawPBusiness / totalRawP,
            industrial: rawPIndustrial / totalRawP,
            residential: rawPResidential / totalRawP
        };
    }

    /**
     * Choisit le type de district en fonction des probabilités fournies.
     * @param {object} probabilities - Objet contenant les probabilités pour chaque type.
     * @returns {string} Le type choisi ('business', 'industrial' ou 'residential').
     */
    chooseDistrictType(probabilities) {
        const rand = Math.random();
        let cumulative = 0;
        if (rand < (cumulative += probabilities.business)) return 'business';
        if (rand < (cumulative += probabilities.industrial)) return 'industrial';
        return 'residential';
    }

    /**
     * Crée des visuels de debug (plans) pour visualiser les limites des districts.
     */
    createDistrictDebugVisuals() {
        const visualType = 'DistrictBoundaries';
        if (this.debugGroup) {
            // Supprime les visuels existants pour éviter les doublons.
            for (let i = this.debugGroup.children.length - 1; i >= 0; i--) {
                const child = this.debugGroup.children[i];
                if (child.userData.visualType === visualType) {
                    this.debugGroup.remove(child);
                    if (child.geometry) child.geometry.dispose();
                }
            }
        }
        this.districts.forEach(district => {
            if (district.plots.length === 0) return;
            const bounds = district.bounds;
            const size = new THREE.Vector3();
            bounds.getSize(size);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            if (size.x <= 0 || size.z <= 0) return;
            const planeGeom = new THREE.PlaneGeometry(size.x, size.z);
            let material;
            switch (district.type) {
                case 'residential':
                    material = new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
                    break;
                case 'industrial':
                    material = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
                    break;
                case 'business':
                    material = new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
                    break;
                default:
                    material = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
                    break;
            }
            const planeMesh = new THREE.Mesh(planeGeom, material);
            planeMesh.position.set(center.x, 0.15, center.z);
            planeMesh.rotation.x = -Math.PI / 2;
            planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
            planeMesh.userData.visualType = visualType;
            planeMesh.renderOrder = 998;
            if (this.debugGroup) {
                this.debugGroup.add(planeMesh);
            }
        });
        const count = this.debugGroup ? this.debugGroup.children.filter(c => c.userData.visualType === visualType).length : 0;
        console.log(`Visuels debug des districts mis à jour : ${count} districts visualisés.`);
    }

    /**
     * Affiche dans la console quelques statistiques sur la formation des districts.
     */
    logDistrictStats() {
        if (!this.districts || this.districts.length === 0) return;
        const stats = { residential: 0, industrial: 0, business: 0 };
        let totalPlotsInDistricts = 0;
        this.districts.forEach(d => {
            if (stats[d.type] !== undefined) stats[d.type]++;
            totalPlotsInDistricts += d.plots.length;
        });
        console.log(`Stats des districts -> Total: ${this.districts.length} (R: ${stats.residential}, I: ${stats.industrial}, B: ${stats.business}). Parcelles dans districts: ${totalPlotsInDistricts}/${this.leafPlots ? this.leafPlots.length : 0}`);
        this.districts.forEach(d => {
            const plotCounts = {};
            d.plots.forEach(p => {
                plotCounts[p.zoneType] = (plotCounts[p.zoneType] || 0) + 1;
            });
            const plotCountsString = Object.entries(plotCounts)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ');
            const centerX = d.center ? d.center.x.toFixed(1) : 'N/A';
            const centerZ = d.center ? d.center.z.toFixed(1) : 'N/A';
            console.log(` - District ${d.id} (${d.type}): ${d.plots.length} parcelles [${plotCountsString}]. Centre: (${centerX}, ${centerZ})`);
        });
    }

    /**
     * Affiche dans la console la répartition finale des types de parcelles après ajustement.
     */
    logAdjustedZoneTypes() {
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Répartition finale des types (après ajustement & fallback):", counts);
    }

    /**
     * Renvoie la liste des districts générés.
     * @returns {Array} La liste des districts.
     */
    getDistricts() {
        return this.districts;
    }
}
