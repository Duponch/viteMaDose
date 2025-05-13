// src/World/DistrictManager.js
import * as THREE from 'three';
import District from './District.js';

export default class DistrictManager {
    /**
     * Constructeur de DistrictManager.
     * @param {object} config - La configuration globale (mapSize, paramètres de district, etc.)
     * @param {Array} leafPlots - Tableau des parcelles générées (plots).
     * @param {THREE.Group} [debugGroup=null] - Groupe destiné aux visualisations de debug (optionnel).
     */
    constructor(config, leafPlots, debugGroup = null) {
        this.config = config;
        this.leafPlots = leafPlots || [];
        this.districts = [];
        this.debugGroup = debugGroup;
    }

    /**
     * Procède à la génération et à la validation de la formation des districts.
     * Lève une exception en cas d'échec critique.
     */
    generateAndValidateDistricts() {
        let districtLayoutValid = false;
        let attempts = 0;
        //console.time("DistrictFormationAndValidation");
        while (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
            attempts++;
            //console.log(`\nTentative de formation/validation des districts #${attempts}...`);

            // --- RÉINITIALISATION CRUCIALE --- 
            this.districts = []; // Vider les districts de la tentative précédente
            // ---------------------------------

            // Réinitialise la référence de district dans toutes les parcelles.
            this.leafPlots.forEach(plot => {
                plot.districtId = null;
                if (plot.buildingInstances) {
                    plot.buildingInstances = [];
                }
            });
            // Crée les districts (Phase 1 et Phase 2)
            this._createDistricts();
            this.logDistrictStats();
            districtLayoutValid = this.validateDistrictLayout();
            if (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
                //console.log(`Disposition invalide, nouvelle tentative...`);
            } else if (!districtLayoutValid) {
                console.error(`ERREUR: Aucune disposition valide obtenue après ${attempts} tentatives.`);
            }
        }
        //console.timeEnd("DistrictFormationAndValidation");
        if (!districtLayoutValid) {
            throw new Error(`Echec critique : disposition de districts invalide après ${attempts} tentatives.`);
        }
        //console.log("Disposition des districts validée.");
        //console.time("PlotTypeAdjustment");
        this.adjustPlotTypesWithinDistricts();
        //console.timeEnd("PlotTypeAdjustment");
        this.assignDefaultTypeToUnassigned();
        this.logAdjustedZoneTypes();
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
        ////console.log("Formation des districts - Phase 1 : Seed & Grow");
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
                    if (typeof neighbor.id === 'undefined') {
                        console.error(`Neighbor plot has undefined ID! Skipping.`, neighbor);
                        continue; // Skip this problematic neighbor
                    }
                    // --- DEBUG LOG --- 
                    // //console.log(`  -> Checking neighbor ${neighbor.id} for district ${newDistrict.id} (${newDistrict.type}). Already assigned? ${assignedPlotIds.has(neighbor.id)}.`);
                    // --- END DEBUG LOG ---

                    // Vérification CLAIRE et UNIQUE : la parcelle est constructible ET n'a JAMAIS été assignée globalement
                    if (neighbor.zoneType !== 'unbuildable' && !assignedPlotIds.has(neighbor.id)) 
                    {
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
                //console.warn(`District (type ${districtType}, seed ${seedPlot.id}) trop petit (${newDistrict.plots.length}/${this.config.minDistrictSize}). Libération des parcelles.`);
                // On ne retire une parcelle de l'assignation globale QUE si elle appartient TOUJOURS
                // à ce district au moment de la libération. Sinon, elle a été "volée" et on la laisse au voleur.
                const plotsToRelease = [...newDistrict.plots]; // Copie pour itérer
                newDistrict.plots = []; // Vider la liste du district échoué
                
                plotsToRelease.forEach(p => {
                    const currentPlotDistrictId = p.districtId;
                    const wasInGlobalSet = assignedPlotIds.has(p.id);
                    ////console.log(`  -> Tentative Libération: Plot ${p.id}. Current districtId: ${currentPlotDistrictId}. ID district échoué: ${newDistrict.id}. Était dans assignedPlotIds? ${wasInGlobalSet}.`);

                    if (currentPlotDistrictId === newDistrict.id) {
                        // La parcelle appartient toujours à ce district échoué, on la libère complètement.
                        if (wasInGlobalSet) {
                            assignedPlotIds.delete(p.id);
                        } else {
                             console.error(`  -> !! ATTENTION Libération !! Plot ${p.id} (districtId ${currentPlotDistrictId}) devrait être dans assignedPlotIds mais ne l'est pas !`);
                        }
                        p.districtId = null;
                        ////console.log(`     -> Libérée (districtId=null, retirée de assignedPlotIds)`);
                    } else {
                        // La parcelle a été volée par un autre district (districtId !== newDistrict.id)
                        // On ne touche PAS à son districtId ni à assignedPlotIds.
                        // Elle reste assignée au district qui l'a volée.
                         console.warn(`  -> !! ATTENTION Libération !! Plot ${p.id} appartient maintenant au district ${currentPlotDistrictId} (pas ${newDistrict.id}). Non libérée globalement.`);
                    }
                });
            }
        }
        ////console.log(`Phase 1 terminée : ${this.districts.length} districts créés.`);
        ////console.log("Formation des districts - Phase 2 : Assignation des parcelles restantes");
        let remainingPlots = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id));
        let assignedInPhase2 = 0;
        if (remainingPlots.length > 0 && this.districts.length > 0) {
            ////console.log(` -> Tentative d'assigner ${remainingPlots.length} parcelles restantes.`);
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
                        // --- DEBUG LOG Phase 2 --- 
                        const oldDistrictId = plot.districtId;
                        ////console.log(`  -> Phase 2 Assignation: Plot ${plot.id} (districtId actuel: ${oldDistrictId}) assigné au district ${bestDistrict.id} (${bestDistrict.type}).`);
                        if (oldDistrictId !== null) {
                            console.warn(`  -> !! ATTENTION Phase 2 !! Plot ${plot.id} avait déjà un districtId (${oldDistrictId}) avant d'être assigné au district ${bestDistrict.id}.`);
                        }
                        // --- END DEBUG LOG --- 
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
            ////console.log(` -> ${assignedInPhase2} parcelles assignées en Phase 2.`);
        } else if (remainingPlots.length > 0) {
            console.warn(` -> ${remainingPlots.length} parcelles restent non assignées, aucun district n'a été créé en Phase 1.`);
        } else {
            //
            // //console.log(" -> Aucune parcelle restante à assigner en Phase 2.");
        }
        const finalUnassignedCount = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id)).length;
        ////console.log(`Formation des districts terminée : ${this.districts.length} districts formés, ${finalUnassignedCount} parcelles constructibles non assignées.`);
    }

    /**
     * Valide la disposition des districts en vérifiant diverses règles de placement et de comptage.
     * @returns {boolean} true si validation réussie, false sinon.
     */
    validateDistrictLayout() {
        ////console.log("Validation de la disposition des districts...");
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
        ////console.log("RESULTATS VALIDATION:");
        ////console.log(` - Placement strict Industriel (<${this.config.strictMinIndustrialDist}): ${strictlyMisplacedIndustrial} (OK si 0) -> ${strictlyMisplacedIndustrial === 0}`);
        ////console.log(` - Placement strict Business (>${this.config.strictMaxBusinessDist}): ${strictlyMisplacedBusiness} (OK si 0) -> ${strictlyMisplacedBusiness === 0}`);
        ////console.log(` - Minimum Zone Centre : Business (<${this.config.validationZoneCenterMaxDist}): ${businessInCoreCenterCount} (min requis ${this.config.minBusinessInCenter}) -> ${hasEnoughBusinessInCoreZone}`);
        ////console.log(` - Minimum Zone Périphérie: Industriel (>${this.config.validationZoneEdgeMinDist}): ${industrialInCoreEdgeCount} (min requis ${this.config.minIndustrialInEdge}) -> ${hasEnoughIndustrialInEdgeZone}`);
        ////console.log(` - Total Industriel: ${totalIndustrialCount} (min: ${this.config.minTotalIndustrialDistricts}, max: ${this.config.maxTotalIndustrialDistricts}) -> Min OK: ${meetsMinTotalIndustrial}, Max OK: ${meetsMaxTotalIndustrial}`);
        ////console.log(` - Total Business: ${totalBusinessCount} (min: ${this.config.minTotalBusinessDistricts}, max: ${this.config.maxTotalBusinessDistricts}) -> Min OK: ${meetsMinTotalBusiness}, Max OK: ${meetsMaxTotalBusiness}`);
        if (!noStrictlyMisplaced) {
            //console.warn("Validation échouée : au moins un district est mal placé strictement.");
            return false;
        }
        if (!meetsMinTotalIndustrial) {
            //console.warn(`Validation échouée : total industriel (${totalIndustrialCount}) inférieur au minimum requis (${this.config.minTotalIndustrialDistricts}).`);
            return false;
        }
        if (!meetsMaxTotalIndustrial) {
            //console.warn(`Validation échouée : total industriel (${totalIndustrialCount}) supérieur au maximum autorisé (${this.config.maxTotalIndustrialDistricts}).`);
            return false;
        }
        if (!meetsMinTotalBusiness) {
            //console.warn(`Validation échouée : total business (${totalBusinessCount}) inférieur au minimum requis (${this.config.minTotalBusinessDistricts}).`);
            return false;
        }
        if (!meetsMaxTotalBusiness) {
            //console.warn(`Validation échouée : total business (${totalBusinessCount}) supérieur au maximum autorisé (${this.config.maxTotalBusinessDistricts}).`);
            return false;
        }
        ////console.log("Validation réussie : toutes les règles de placement et de comptage sont respectées.");
        return true;
    }

    /**
     * Ajuste les types de parcelles dans chaque district en fonction du type de district
     * (alternance résidentielle, 0/1 parc par district).
     */
    adjustPlotTypesWithinDistricts() {
        ////console.log("Ajustement des types de parcelles (alternance résidentielle, 0/1 parc par district)...");
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
        /* //console.log("Ajustement terminé :");
        //console.log(` - Forcés Gratte-ciel: ${stats.forcedToSkyscraper}`);
        //console.log(` - Forcés Industriel: ${stats.forcedToIndustrial}`);
        //console.log(` - Assignés Maison: ${stats.assignedHouse}`);
        //console.log(` - Assignés Immeuble: ${stats.assignedBuilding}`);
        //console.log(` - Assignés/Gardés Parc: ${stats.assignedPark}`);
        //console.log(` - Parcs Convertis: ${stats.parkRemoved}`);
        //console.log(` - Changements résidentiels: ${stats.changedResidentialType}`);
        //console.log(` - Déjà corrects (résidentiel): ${stats.alreadyCorrectResidential}`);
        //console.log(` - Déjà corrects (autres): ${stats.alreadyCorrectOther}`);
        //console.log(` - Parcelles non constructibles ignorées: ${stats.unbuildableSkipped}`); */
    }

    /**
     * Pour toutes les parcelles non assignées à un district (hors "unbuildable" et "park"),
     * force le type par défaut 'building'.
     */
    assignDefaultTypeToUnassigned() {
        ////console.log("Fallback : Attribution d'un type par défaut aux parcelles non assignées...");
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
            ////console.log(` -> ${unassignedCorrected} parcelles mises à jour en type par défaut.`);
        } else {
            ////console.log(" -> Toutes les parcelles constructibles sont assignées à un district.");
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
        ////console.log(`Visuels debug des districts mis à jour : ${count} districts visualisés.`);
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
        ////console.log(`Stats des districts -> Total: ${this.districts.length} (R: ${stats.residential}, I: ${stats.industrial}, B: ${stats.business}). Parcelles dans districts: ${totalPlotsInDistricts}/${this.leafPlots ? this.leafPlots.length : 0}`);
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
            ////console.log(` - District ${d.id} (${d.type}): ${d.plots.length} parcelles [${plotCountsString}]. Centre: (${centerX}, ${centerZ})`);
        });
    }

    /**
     * Affiche dans la console les types de zone finaux après ajustement et fallback,
     * avec un décompte global et par district.
     */
    logAdjustedZoneTypes() {
        ////console.log("Types de zone finaux après ajustement et fallback:");
        const finalCountsGlobal = {};
        this.leafPlots.forEach(plot => {
            finalCountsGlobal[plot.zoneType] = (finalCountsGlobal[plot.zoneType] || 0) + 1;
        });
        const finalCountsStrGlobal = Object.entries(finalCountsGlobal)
            .map(([k, v]) => `${k}:${v}`)
            .sort() // Trier pour la lisibilité
            .join(', ');
        ////console.log(` -> Répartition globale: { ${finalCountsStrGlobal} }`);

        ////console.log(" -> Détail par district:");
        this.districts.forEach(district => {
            const finalCountsDistrict = {};
            let plotsInDistrict = 0;
            // Compter uniquement les parcelles qui appartiennent réellement à ce district
            this.leafPlots.forEach(plot => {
                if (plot.districtId === district.id) {
                    finalCountsDistrict[plot.zoneType] = (finalCountsDistrict[plot.zoneType] || 0) + 1;
                    plotsInDistrict++;
                }
            });

            // Comparer au nombre de parcelles que le district *pense* avoir
            const expectedPlots = district.plots.length;
            const plotCountMatch = plotsInDistrict === expectedPlots ? "" : ` (ATTENTION: attendu ${expectedPlots})`;

            const finalCountsStrDistrict = Object.entries(finalCountsDistrict)
                .map(([k, v]) => `${k}:${v}`)
                .sort() // Trier pour la lisibilité
                .join(', ');

            const centerX = district.center ? district.center.x.toFixed(1) : 'N/A';
            const centerZ = district.center ? district.center.z.toFixed(1) : 'N/A';

            ////console.log(`  - District ${district.id} (${district.type}): ${plotsInDistrict} parcelles${plotCountMatch} [${finalCountsStrDistrict || 'Aucune parcelle assignée'}]. Centre: (${centerX}, ${centerZ})`);
        });

        // Logguer les parcelles qui n'ont toujours pas de district (ne devrait pas arriver si fallback a fonctionné)
        const stillUnassigned = this.leafPlots.filter(p => p.districtId === null && p.zoneType !== 'unbuildable');
        if (stillUnassigned.length > 0) {
            console.warn(` -> ATTENTION: ${stillUnassigned.length} parcelles constructibles sont toujours sans district après le fallback :`);
            stillUnassigned.forEach(p => console.warn(`    - Parcelle ${p.id} (type final: ${p.zoneType})`));
        }
    }

    /**
     * Renvoie la liste des districts générés.
     * @returns {Array} La liste des districts.
     */
    getDistricts() {
        return this.districts;
    }
}
