// src/World/CityManager.js
import * as THREE from 'three';
import CityLayoutGenerator from './CityLayoutGenerator.js';
import RoadNetworkGenerator from './RoadNetworkGenerator.js';
import PlotContentGenerator from './PlotContentGenerator.js';
import CityAssetLoader from './CityAssetLoader.js';
import District from './District.js';

export default class CityManager {
    constructor(experience, config = {}) {
        this.experience = experience;
        this.scene = this.experience.scene;

        // --- Configuration Principale ---
        // (La configuration reste inchangée pour cette stratégie,
        // mais vous pourriez aussi ajuster les probabilités initiales
        // et de conversion en complément si désiré)
        // Dans le constructeur de CityManager (src/World/CityManager.js)

		this.config = {
			// Map & Layout
			mapSize: 700,
			roadWidth: 10,
			minPlotSize: 13,
			maxPlotSize: 40, // N'affecte pas la taille du district directement, mais la taille des parcelles initiales
			maxRecursionDepth: 7, // Profondeur de subdivision des parcelles

			// District Formation
			minDistrictSize: 5,  // Nombre minimum de parcelles pour former un district
			maxDistrictSize: 10, // Nombre maximum de parcelles lors de la croissance initiale d'un district

			// Probabilités initiales de type de parcelle (AVANT la logique de district)
			// Ces probabilités sont utilisées par CityLayoutGenerator
			parkProbability: 0.10,
			industrialZoneProbability: 0.05,
			houseZoneProbability: 0.50,
			skyscraperZoneProbability: 0.10, // Probabilité initiale qu'une parcelle soit 'skyscraper'
			// La probabilité 'building' est implicitement 1 - (somme des autres)

			// Paramètres pour la détermination du type de DISTRICT basé sur la distance
			forceBusinessMaxDistance: 0.15, // Distance normalisée max pour FORCER 'business' près du centre
			// forceIndustrialMinDistance: 0.85, // N'est plus utilisé car remplacé par la logique probabiliste + validation
			districtProbabilities: { // Paramètres pour getDistrictTypeProbabilities
				business: { max: 10, decay: 12 }, // Influence la probabilité 'business' (décroit avec la distance)
				industrial: { threshold: 0.85, factor: 10, multiplier: 0.05, base: 0.0001 }, // Influence probabilité 'industrial' (augmente loin du centre)
				residential: { peakCenter: 0.5, peakWidth: 0.3, base: 0.05 } // Influence probabilité 'residential' (pic au milieu)
			},

			// --- VALIDATION ET RÈGLES STRICTES ---
			// Zones pour les minimums LOCAUX (optionnel si les min globaux suffisent)
			validationZoneCenterMaxDist: 0.20, // Zone "Centre" = 20% du rayon depuis le centre
			validationZoneEdgeMinDist: 0.80,   // Zone "Périphérie" = au-delà de 80% du rayon
			minBusinessInCenter: 1,            // Minimum de districts business DANS la zone centrale (peut être 0 si minTotalBusinessDistricts >= 1)
			minIndustrialInEdge: 1,            // Minimum de districts industriels DANS la zone périphérie (peut être 0 si minTotalIndustrialDistricts >= 1)

			// Placement Strict par Distance (Règles fondamentales)
			// ÉCHEC si un district industriel est PLUS PROCHE que cette distance normalisée du centre
			strictMinIndustrialDist: 0.35,     // Ex: Pas d'industrie dans les 35% les plus proches du centre (0=centre, 1=bord)
			// ÉCHEC si un district business (gratte-ciel) est PLUS LOIN que cette distance normalisée du centre
			strictMaxBusinessDist: 0.60,       // Ex: Pas de gratte-ciels au-delà de 60% de la distance vers le bord

			// Comptes Globaux Minimum/Maximum (Vos X et Y)
			// ÉCHEC si le nombre TOTAL de districts industriels n'est pas dans cette fourchette
			minTotalIndustrialDistricts: 1,    // X: Doit y avoir AU MOINS CE NOMBRE de districts industriels (mettre >= 1 pour en avoir toujours)
			maxTotalIndustrialDistricts: 5,    // Y: Ne doit pas y avoir PLUS QUE CE NOMBRE de districts industriels
			// ÉCHEC si le nombre TOTAL de districts d'affaires (gratte-ciels) n'est pas dans cette fourchette
			minTotalBusinessDistricts: 1,      // X: Doit y avoir AU MOINS CE NOMBRE de districts d'affaires
			maxTotalBusinessDistricts: 4,      // Y: Ne doit pas y avoir PLUS QUE CE NOMBRE de districts d'affaires

			// Tentatives de Régénération
			maxDistrictRegenAttempts: 15,      // Nombre max de tentatives pour générer une disposition VALIDE (augmenté car règles plus strictes)

			// --- Contenu des Parcelles ---
			// Routes/Trottoirs
			sidewalkWidth: 2,
			sidewalkHeight: 0.2,
			centerlineWidth: 0.15,
			centerlineHeight: 0.02,

			// Subdivision des parcelles pour placer les bâtiments/assets
			minHouseSubZoneSize: 7,
			minBuildingSubZoneSize: 10,
			minIndustrialSubZoneSize: 13,
			minParkSubZoneSize: 10,
			minSkyscraperSubZoneSize: 13, // Taille minimale pour placer un gratte-ciel (affecte la subdivision)
			buildingSubZoneMargin: 1.5,   // Marge autour des assets dans leur sous-zone

			// --- Configuration des Assets ---
			// (Les chemins et dimensions de base restent les mêmes, assurez-vous qu'ils sont corrects)
			houseModelDir: "Public/Assets/Models/Houses/",
			houseModelFiles: [ { file: "House1.fbx" }, /* ... */ { file: "House24.fbx" }, ],
			houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,

			buildingModelDir: "Public/Assets/Models/Buildings/",
			buildingModelFiles: [ { file: "Building1.fbx", scale: 1.0 }, /* ... */ { file: "Building10.glb", scale: 1 }, ],
			buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,

			industrialModelDir: "Public/Assets/Models/Industrials/",
			industrialModelFiles: [ { file: "Factory1_glb.glb", scale: 4 }/* , { file: "Factory2_glb.glb", scale: 4 }, { file: "Factory3_glb.glb", scale: 4 } */ ],
			industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,

			parkModelDir: "Public/Assets/Models/Parks/",
			parkModelFiles: [ { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 }, { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 } ],
			parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,

			treeModelDir: "Public/Assets/Models/Trees/",
			treeModelFiles: [ { file: "Tree.glb", scale: 0.9 }, /* ... */ { file: "Tree7.glb", scale: 0.9 }, ],
			treeBaseWidth: 4, treeBaseHeight: 8, treeBaseDepth: 4,

			skyscraperModelDir: "Public/Assets/Models/Skyscrapers/",
			skyscraperModelFiles: [ { file: "Skyscraper1.glb", scale: 0.8 }, { file: "Skyscraper2.glb", scale: 1 }, { file: "Skyscraper3.glb", scale: 1 }, ],
			skyscraperBaseWidth: 15, skyscraperBaseHeight: 80, skyscraperBaseDepth: 15,

			// --- Placement des Arbres ---
			treePlacementProbabilitySidewalk: 0.3, // Probabilité d'avoir un arbre à un coin de trottoir
			treePlacementProbabilityPark: 0.04,    // Densité d'arbres dans les parcs (par m²)
			treePlacementProbabilityMargin: 0.008, // Densité d'arbres dans les marges des autres zones (par m²)

			// --- Debug ---
			showDistrictBoundaries: true, // Mettre à true pour voir les zones de district colorées

			// --- Fusion des configurations externes ---
			// !! Important: Laissez cette ligne à la fin !!
			// Elle permet de surcharger les valeurs par défaut ci-dessus avec
			// un objet de configuration optionnel passé au constructeur de CityManager.
			...config
		};

		if (config.districtProbabilities) {
            this.config.districtProbabilities.business = { ...this.config.districtProbabilities.business, ...config.districtProbabilities.business };
            this.config.districtProbabilities.industrial = { ...this.config.districtProbabilities.industrial, ...config.districtProbabilities.industrial };
            this.config.districtProbabilities.residential = { ...this.config.districtProbabilities.residential, ...config.districtProbabilities.residential };
        }

        // Materials (Inchangé)
        this.materials = {
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }),
            debugResidentialMat: new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugIndustrialMat: new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
            debugBusinessMat: new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
             debugDefaultMat: new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
        };

        // Composants (Inchangé)
        this.assetLoader = new CityAssetLoader(this.config);
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials);

        // Données Ville (Inchangé)
        this.districts = []; this.leafPlots = [];

        // Groupes Scène (Inchangé)
        this.cityContainer = new THREE.Group(); this.cityContainer.name = "CityContainer";
        this.roadGroup = null;
        this.sidewalkGroup = null;
        this.contentGroup = null;
        this.groundMesh = null;
        this.debugGroup = new THREE.Group(); this.debugGroup.name = "DebugVisuals";

        this.scene.add(this.cityContainer);
        if (this.config.showDistrictBoundaries) { this.cityContainer.add(this.debugGroup); }

        console.log("CityManager initialisé (Nouvelle logique de Districts).");
    }

    async generateCity() {
        console.time("CityGeneration");
        this.clearCity(); // Nettoyage initial

        try {
            console.log("--- Démarrage génération ville ---");
            this.createGlobalGround();

            console.time("AssetLoading"); await this.assetLoader.loadAssets(); console.timeEnd("AssetLoading"); this.logLoadedAssets();

            console.time("LayoutGeneration");
            this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");
            console.log(`Layout généré avec ${this.leafPlots.length} parcelles.`);
            this.logInitialZoneTypes();

            if (!this.leafPlots || this.leafPlots.length === 0) throw new Error("Layout n'a produit aucune parcelle.");

            // --- BOUCLE DE FORMATION/VALIDATION DISTRICT ---
            let districtLayoutValid = false;
            let attempts = 0;
            console.time("DistrictFormationAndValidation");
            while (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
                attempts++;
                console.log(`\nTentative de formation/validation des districts #${attempts}...`);

                this.districts = []; // Réinitialiser l'état des districts

                this.createDistricts_V2();
                this.logDistrictStats();

                districtLayoutValid = this.validateDistrictLayout(); // Valider la disposition

                if (!districtLayoutValid && attempts < this.config.maxDistrictRegenAttempts) {
                    console.log(`Disposition invalide, nouvelle tentative (max ${this.config.maxDistrictRegenAttempts})...`);
                } else if (!districtLayoutValid) {
                    // Ce message est loggué, mais la boucle va se terminer
                    console.error(`ERREUR DANS LA BOUCLE: Impossible d'obtenir une disposition de districts valide après ${attempts} tentatives.`);
                }
            }
            console.timeEnd("DistrictFormationAndValidation");
            console.log(`Formation districts terminée après ${attempts} tentative(s). Etat final: ${districtLayoutValid ? 'Valide' : 'Invalide (max tentatives atteint)'}`);
            // --- FIN BOUCLE ---


            // ******** AJOUT DE LA VÉRIFICATION CRUCIALE ********
            if (!districtLayoutValid) {
                // Si on est sorti de la boucle SANS une disposition valide
                const errorMessage = `Échec critique: Impossible de générer une disposition de districts valide respectant toutes les règles après ${this.config.maxDistrictRegenAttempts} tentatives. Arrêt de la génération de la ville. Veuillez vérifier/assouplir les règles dans la configuration (strictMin/Max, min/max Total...).`;
                console.error(errorMessage);
                this.clearCity(); // Optionnel: nettoyer ce qui a été généré jusqu'ici
                throw new Error(errorMessage); // Lance une erreur pour arrêter net l'exécution de generateCity
                // Alternativement, vous pourriez juste faire 'return;' si vous ne voulez pas d'erreur,
                // mais lancer une erreur est plus explicite pour un échec critique.
                // return;
            }
            // ******** FIN DE L'AJOUT ********


            // Le code suivant ne s'exécutera QUE si districtLayoutValid est true
            console.log("Disposition des districts validée. Poursuite de la génération...");

            console.time("PlotTypeAdjustment");
            this.adjustPlotTypesWithinDistricts(); // Appliquer les types stricts aux parcelles
            console.timeEnd("PlotTypeAdjustment");
            this.logAdjustedZoneTypes();

            console.time("RoadGeneration"); this.roadGroup = this.roadGenerator.generateRoads(this.leafPlots); this.cityContainer.add(this.roadGroup); console.timeEnd("RoadGeneration");
            console.time("ContentGeneration"); const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(this.leafPlots, this.assetLoader); this.sidewalkGroup = sidewalkGroup; this.contentGroup = buildingGroup; this.cityContainer.add(this.sidewalkGroup); this.cityContainer.add(this.contentGroup); console.timeEnd("ContentGeneration");

            if (this.config.showDistrictBoundaries) { console.time("DebugVisualsGeneration"); this.createDistrictDebugVisuals(); console.timeEnd("DebugVisualsGeneration"); }

            console.log("--- Génération ville terminée (avec succès) ---");

        } catch (error) {
            // Le catch attrapera l'erreur lancée si la validation finale échoue
            console.error("Erreur majeure pendant la génération:", error);
            // S'assurer que tout est nettoyé en cas d'erreur
            this.clearCity();
            // Vous pourriez vouloir afficher un message à l'utilisateur ici
        } finally {
            console.timeEnd("CityGeneration");
        }
    }

    // ----- NOUVELLE MÉTHODE: createDistricts_V2 (Fonction appelante) -----
    createDistricts_V2() {
        if (!this.leafPlots || this.leafPlots.length === 0) {
            console.warn("createDistricts_V2: Aucune parcelle disponible pour former des districts.");
            return; // Sortir si pas de parcelles
        }

        const allPlots = [...this.leafPlots];
        // Note: assignedPlotIds est utilisé pour s'assurer qu'une parcelle n'est
        // assignée qu'à UN SEUL district pendant UNE tentative de formation.
        // Il est implicitement réinitialisé car la fonction est rappelée
        // depuis la boucle de régénération si nécessaire, et this.districts est vidé.
        const assignedPlotIds = new Set();
        // this.districts a déjà été réinitialisé dans la boucle de generateCity avant cet appel

        // Filtrer les parcelles non constructibles et celles déjà assignées (ne devrait pas arriver au premier appel)
        let availablePlots = allPlots.filter(p => p.zoneType !== 'unbuildable' && !assignedPlotIds.has(p.id));

        const mapRadius = this.config.mapSize / 2; // Calculer le rayon une seule fois
        if (mapRadius <= 0) {
             console.error("createDistricts_V2: mapRadius invalide, impossible de normaliser la distance.");
             return; // Sortir si mapRadius est invalide
        }

        // Boucle tant qu'il y a assez de parcelles pour potentiellement former un district minimal
        while (availablePlots.length >= this.config.minDistrictSize) {
            // Choisir une parcelle de départ aléatoire parmi celles disponibles
            const seedIndex = Math.floor(Math.random() * availablePlots.length);
            const seedPlot = availablePlots[seedIndex];

            // Calculer la distance normalisée de la parcelle de départ
            const distToCenter = seedPlot.center.length();
            const normalizedDistance = Math.max(0, Math.min(1, distToCenter / mapRadius));

            let districtType; // Variable pour stocker le type choisi

            // --- Logique de choix de type MODIFIÉE ---
            // Forcer 'business' si très proche du centre
            if (normalizedDistance < this.config.forceBusinessMaxDistance) {
                districtType = 'business';
                // console.log(`(Debug) Forcing business at dist ${normalizedDistance.toFixed(2)} for plot ${seedPlot.id}`); // Optionnel
            }
            // SINON (pour toutes les autres distances, y compris la périphérie)
            else {
                // Utiliser la logique probabiliste
                const probabilities = this.getDistrictTypeProbabilities(distToCenter); // Récupérer les probabilités pour cette distance
                districtType = this.chooseDistrictType(probabilities); // Choisir selon les probabilités
                // console.log(`(Debug) Probabilistic choice at dist ${normalizedDistance.toFixed(2)} -> ${districtType} for plot ${seedPlot.id}`); // Optionnel
            }
            // --- Fin Logique de choix ---

            // Créer le nouveau district avec le type déterminé
            const newDistrict = new District(districtType);

            // Utiliser une recherche en largeur (BFS) pour agréger les voisins
            const queue = [seedPlot]; // File d'attente pour le BFS
            const currentDistrictAssigned = new Set(); // Garde trace des parcelles DANS ce district potentiel

            // Ajouter la parcelle de départ
            newDistrict.addPlot(seedPlot);
            assignedPlotIds.add(seedPlot.id); // Marquer comme assignée globalement pour cette tentative
            currentDistrictAssigned.add(seedPlot.id); // Marquer comme assignée à ce district en cours

            let head = 0; // Index pour la file d'attente BFS
            // Continuer tant qu'il y a des parcelles dans la file et que la taille max n'est pas atteinte
            while (head < queue.length && newDistrict.plots.length < this.config.maxDistrictSize) {
                const currentPlot = queue[head++]; // Récupérer la parcelle suivante
                // Trouver ses voisins parmi TOUTES les parcelles
                const neighbors = this.findNeighbors(currentPlot, allPlots);

                for (const neighbor of neighbors) {
                    // Vérifier si le voisin est valide et pas déjà pris par CE district ou un autre
                     if (neighbor.zoneType !== 'unbuildable' &&
                         !assignedPlotIds.has(neighbor.id) &&
                         !currentDistrictAssigned.has(neighbor.id))
                     {
                        // ******** NOUVELLE VÉRIFICATION DE DISTANCE STRICTE ICI ********
                        let canAddNeighbor = true; // Supposons qu'on peut l'ajouter par défaut

                        // Calculer la distance normalisée du *voisin* potentiel
                        const neighborDistToCenter = neighbor.center.length();
                        const neighborNormalizedDistance = Math.max(0, Math.min(1, neighborDistToCenter / mapRadius));

                        // Si le district en cours est de type industriel...
                        if (newDistrict.type === 'industrial') {
                            // ... vérifier si le voisin est TROP PROCHE du centre.
                            if (neighborNormalizedDistance < this.config.strictMinIndustrialDist) {
                                canAddNeighbor = false; // Ne pas ajouter ce voisin
                                // console.log(`(Debug) Blocage ajout plot ${neighbor.id} (dist ${neighborNormalizedDistance.toFixed(2)}) au district industriel ${newDistrict.id} car < ${this.config.strictMinIndustrialDist}`);
                            }
                        }
                        // Sinon si le district en cours est de type business...
                        else if (newDistrict.type === 'business') {
                            // ... vérifier si le voisin est TROP LOIN du centre.
                            if (neighborNormalizedDistance > this.config.strictMaxBusinessDist) {
                                canAddNeighbor = false; // Ne pas ajouter ce voisin
                                // console.log(`(Debug) Blocage ajout plot ${neighbor.id} (dist ${neighborNormalizedDistance.toFixed(2)}) au district business ${newDistrict.id} car > ${this.config.strictMaxBusinessDist}`);
                            }
                        }
                        // (Pas de règle de distance stricte pour les districts résidentiels dans ce scénario)

                        // ******** FIN DE LA NOUVELLE VÉRIFICATION ********


                        // Si la taille max n'est pas atteinte ET si le voisin respecte les règles de distance
                        if (newDistrict.plots.length < this.config.maxDistrictSize && canAddNeighbor) {
                            newDistrict.addPlot(neighbor);
                            assignedPlotIds.add(neighbor.id);
                            currentDistrictAssigned.add(neighbor.id);
                            queue.push(neighbor); // Ajouter à la file pour explorer ses voisins
                        } else {
                             // Si la taille max est atteinte OU si le voisin ne peut pas être ajouté (règle distance),
                             // on ne l'ajoute pas et on arrête potentiellement de chercher des voisins pour CE currentPlot
                             // si la taille max est la raison.
                             if (newDistrict.plots.length >= this.config.maxDistrictSize) {
                                break; // Sortir de la boucle des voisins si la taille max est atteinte
                             }
                             // Si c'est 'canAddNeighbor' qui est false, on continue juste la boucle 'for'
                             // pour tester les autres voisins du 'currentPlot'.
                        }
                    }
                } // Fin boucle for (neighbors)
            }

            // Vérifier si le district formé a atteint la taille minimale requise
            if (newDistrict.plots.length >= this.config.minDistrictSize) {
                this.districts.push(newDistrict); // Ajouter le district valide à la liste
            } else {
                // Si trop petit, on ne le garde pas comme district valide.
                // IMPORTANT: Les parcelles assignées (dans assignedPlotIds) ne sont PAS
                // remises dans availablePlots pour cette tentative, pour éviter de
                // potentiellement re-sélectionner la même petite grappe immédiatement.
                // Elles deviendront disponibles lors de la prochaine tentative (régénération).
                console.warn(`District potentiel (type ${districtType}) démarré à plot ${seedPlot.id} n'a pas atteint la taille min (${newDistrict.plots.length}/${this.config.minDistrictSize}). Parcelles ignorées pour cette tentative.`);
            }

            // Mettre à jour la liste des parcelles disponibles pour la prochaine itération de la boucle while
            // en retirant toutes celles qui ont été assignées DANS CETTE TENTATIVE.
            availablePlots = availablePlots.filter(p => !assignedPlotIds.has(p.id));

        } // Fin de la boucle while (availablePlots >= minDistrictSize)

        console.log(`Formation districts (tentative actuelle) terminée. ${this.districts.length} districts créés. ${availablePlots.length} parcelles constructibles restantes non assignées.`);
        // Note: Le nombre total de districts est celui de CETTE tentative. La validation décidera si c'est acceptable.
    }

	validateDistrictLayout() {
		console.log("Validation de la disposition des districts (avec règles strictes et comptes min/max)...");
		if (!this.districts || this.districts.length === 0) {
			console.warn("Validation échouée: Aucun district à valider.");
			return false;
		}
	
		const mapRadius = this.config.mapSize / 2;
		if (mapRadius <= 0) {
			console.error("Validation échouée: mapRadius invalide.");
			return false;
		}
	
		// Compteurs pour les minimums requis dans les zones spécifiques (existants)
		let businessInCoreCenterCount = 0;
		let industrialInCoreEdgeCount = 0;
	
		// Indicateurs pour les types strictement mal placés (existants)
		let strictlyMisplacedIndustrial = 0;
		let strictlyMisplacedBusiness = 0;
	
		// *** NOUVEAU: Compteurs pour le nombre total de chaque type ***
		let totalIndustrialCount = 0;
		let totalBusinessCount = 0;
	
		this.districts.forEach(district => {
			const distToCenter = district.center.length();
			const normalizedDistance = Math.max(0, Math.min(1, distToCenter / mapRadius));
	
			// Incrémenter les compteurs totaux
			if (district.type === 'industrial') {
				totalIndustrialCount++;
			} else if (district.type === 'business') {
				totalBusinessCount++;
			}
	
			// 1. Compter pour les minimums dans les zones spécifiques (validationZone...)
			if (district.type === 'business' && normalizedDistance <= this.config.validationZoneCenterMaxDist) {
				businessInCoreCenterCount++;
			}
			if (district.type === 'industrial' && normalizedDistance >= this.config.validationZoneEdgeMinDist) {
				industrialInCoreEdgeCount++;
			}
	
			// 2. Vérifier les placements strictement interdits (strict...)
			if (district.type === 'industrial' && normalizedDistance < this.config.strictMinIndustrialDist) {
				strictlyMisplacedIndustrial++;
				console.warn(`District industriel ${district.id} trouvé à une distance ${normalizedDistance.toFixed(2)} (strictement interdit < ${this.config.strictMinIndustrialDist})`);
			}
			if (district.type === 'business' && normalizedDistance > this.config.strictMaxBusinessDist) {
				strictlyMisplacedBusiness++;
				 console.warn(`District business ${district.id} trouvé à une distance ${normalizedDistance.toFixed(2)} (strictement interdit > ${this.config.strictMaxBusinessDist})`);
			}
		});
	
		// --- Vérification des conditions ---
	
		// Conditions existantes
		const hasEnoughBusinessInCoreZone = businessInCoreCenterCount >= this.config.minBusinessInCenter;
		const hasEnoughIndustrialInEdgeZone = industrialInCoreEdgeCount >= this.config.minIndustrialInEdge;
		const noStrictlyMisplaced = strictlyMisplacedIndustrial === 0 && strictlyMisplacedBusiness === 0;
	
		// *** NOUVEAU: Conditions sur les comptes totaux ***
		const meetsMinTotalIndustrial = totalIndustrialCount >= this.config.minTotalIndustrialDistricts;
		const meetsMaxTotalIndustrial = totalIndustrialCount <= this.config.maxTotalIndustrialDistricts;
		const meetsMinTotalBusiness = totalBusinessCount >= this.config.minTotalBusinessDistricts;
		const meetsMaxTotalBusiness = totalBusinessCount <= this.config.maxTotalBusinessDistricts;
	
		// --- Log détaillé ---
		console.log(`RESULTATS VALIDATION:`);
		console.log(` - Placement Strict: Industriel (<${this.config.strictMinIndustrialDist}): ${strictlyMisplacedIndustrial} (OK si 0) -> ${strictlyMisplacedIndustrial === 0}`);
		console.log(` - Placement Strict: Business (>${this.config.strictMaxBusinessDist}): ${strictlyMisplacedBusiness} (OK si 0) -> ${strictlyMisplacedBusiness === 0}`);
		// Optionnel: vous pouvez garder ou enlever les checks de zone si les checks globaux suffisent
		console.log(` - Minimum Zone Centre: Business (<${this.config.validationZoneCenterMaxDist}): ${businessInCoreCenterCount} (requis min ${this.config.minBusinessInCenter}) -> ${hasEnoughBusinessInCoreZone}`);
		console.log(` - Minimum Zone Périphérie: Industriel (>${this.config.validationZoneEdgeMinDist}): ${industrialInCoreEdgeCount} (requis min ${this.config.minIndustrialInEdge}) -> ${hasEnoughIndustrialInEdgeZone}`);
		// Nouveaux logs pour les comptes globaux
		console.log(` - Compte Total Industriel: ${totalIndustrialCount} (Min: ${this.config.minTotalIndustrialDistricts}, Max: ${this.config.maxTotalIndustrialDistricts}) -> Min OK: ${meetsMinTotalIndustrial}, Max OK: ${meetsMaxTotalIndustrial}`);
		console.log(` - Compte Total Business: ${totalBusinessCount} (Min: ${this.config.minTotalBusinessDistricts}, Max: ${this.config.maxTotalBusinessDistricts}) -> Min OK: ${meetsMinTotalBusiness}, Max OK: ${meetsMaxTotalBusiness}`);
	
		// --- Décision finale de validation ---
		// La validation réussit SEULEMENT SI TOUTES les conditions sont remplies
	
		if (!noStrictlyMisplaced) {
			console.warn("Validation échouée: Au moins un district est strictement mal placé (trop proche/loin du centre).");
			return false;
		}
		// Enlevez ou commentez les lignes suivantes si les minimums de zone ne sont plus nécessaires
		/*
		if (!hasEnoughBusinessInCoreZone) {
			console.warn(`Validation échouée: Pas assez de districts business DANS LA ZONE centrale.`);
			return false;
		}
		if (!hasEnoughIndustrialInEdgeZone) {
			console.warn(`Validation échouée: Pas assez de districts industriels DANS LA ZONE périphérique.`);
			return false;
		}
		*/
		// Vérification des comptes globaux
		if (!meetsMinTotalIndustrial) {
			console.warn(`Validation échouée: Nombre total de districts industriels (<span class="math-inline">\{totalIndustrialCount\}\) est inférieur au minimum requis \(</span>{this.config.minTotalIndustrialDistricts}).`);
			return false;
		}
		if (!meetsMaxTotalIndustrial) {
			console.warn(`Validation échouée: Nombre total de districts industriels (<span class="math-inline">\{totalIndustrialCount\}\) est supérieur au maximum autorisé \(</span>{this.config.maxTotalIndustrialDistricts}).`);
			return false;
		}
		if (!meetsMinTotalBusiness) {
			console.warn(`Validation échouée: Nombre total de districts d'affaires (<span class="math-inline">\{totalBusinessCount\}\) est inférieur au minimum requis \(</span>{this.config.minTotalBusinessDistricts}).`);
			return false;
		}
		if (!meetsMaxTotalBusiness) {
			console.warn(`Validation échouée: Nombre total de districts d'affaires (<span class="math-inline">\{totalBusinessCount\}\) est supérieur au maximum autorisé \(</span>{this.config.maxTotalBusinessDistricts}).`);
			return false;
		}
	
		// Si toutes les vérifications passent
		console.log("Validation Réussie: Toutes les règles de placement et de comptage sont respectées.");
		return true;
	}

    // ----- getDistrictTypeProbabilities (Fonction MODIFIÉE selon Stratégie 1) -----
    getDistrictTypeProbabilities(distanceToCenter) {
        const mapRadius = this.config.mapSize / 2;
        // Récupérer les paramètres depuis la config pour lisibilité
        const bizConf = this.config.districtProbabilities.business;
        const indConf = this.config.districtProbabilities.industrial;
        const resConf = this.config.districtProbabilities.residential;

        // Valeurs par défaut robustes si la config est mal formée
        const defaultProbs = { business: 0.1, industrial: 0.1, residential: 0.8 };
        if (!bizConf || !indConf || !resConf || mapRadius <= 0) {
            console.warn("Config districtProbabilities incomplète ou mapRadius nul, utilisation des probabilités par défaut.");
            return defaultProbs;
        }

        const normalizedDistance = Math.max(0, Math.min(1, distanceToCenter / mapRadius));
        const d = normalizedDistance;

        // --- Calcul des probabilités brutes EN UTILISANT LA CONFIG ---

        // Affaires (Business/Skyscraper)
        const rawPBusiness = Math.exp(-d * (bizConf.decay || 10)) * (bizConf.max !== undefined ? bizConf.max : 0.15);

        // Industriel
        let rawPIndustrial;
        if (d > (indConf.threshold !== undefined ? indConf.threshold : 0.85)) {
            rawPIndustrial = (1 - Math.exp(-(d - (indConf.threshold !== undefined ? indConf.threshold : 0.85)) * (indConf.factor || 5))) * (indConf.multiplier !== undefined ? indConf.multiplier : 0.2);
        } else {
            rawPIndustrial = (indConf.base !== undefined ? indConf.base : 0.01);
        }

        // Résidentiel
        const residentialPeakTerm = Math.exp(-((d - (resConf.peakCenter !== undefined ? resConf.peakCenter : 0.5))**2) / (2 * (resConf.peakWidth || 0.2)));
        const rawPResidential = residentialPeakTerm + (resConf.base !== undefined ? resConf.base : 0.8);

        // --- Fin Calcul ---

        // Normalisation (inchangée)
        const totalRawP = rawPBusiness + rawPIndustrial + rawPResidential;
        if (totalRawP <= 0) { // Utiliser <= pour inclure le cas où tout est à 0
             console.warn("Somme des probabilités brutes nulle ou négative, utilisation des probabilités par défaut.");
             return defaultProbs; // Retourner les valeurs par défaut
        }

        return {
            business: rawPBusiness / totalRawP,
            industrial: rawPIndustrial / totalRawP,
            residential: rawPResidential / totalRawP
        };
    }

    // ----- chooseDistrictType (Fonction Helper - Inchangée mais essentielle) -----
    chooseDistrictType(probabilities) {
        const rand = Math.random();
        let cumulative = 0;
        // Important: Tester business et industrial d'abord car ils ont les probabilités les plus faibles.
        // Si on testait résidentiel en premier, il serait presque toujours choisi.
        if (rand < (cumulative += probabilities.business)) return 'business';
        if (rand < (cumulative += probabilities.industrial)) return 'industrial';
        // Tout ce qui reste est résidentiel
        return 'residential';
    }

    // ... Reste du fichier CityManager.js (adjustPlotTypesWithinDistricts, clearCity, etc.) ...
    // Ces autres fonctions n'ont pas besoin d'être modifiées pour la Stratégie 1
    // mais elles seront appelées après la création des districts dont les types
    // auront été influencés par getDistrictTypeProbabilities modifié.

    // ... (coller ici le reste des fonctions de CityManager.js:
    // adjustPlotTypesWithinDistricts, createDistrictDebugVisuals, findNeighbors,
    // clearCity, createGlobalGround, destroy, logLoadedAssets, logInitialZoneTypes,
    // logAdjustedZoneTypes, logDistrictStats, update)
    // ...

    // NOTE : J'ai omis le reste des fonctions pour la clarté, mais assurez-vous
    // de placer ces fonctions modifiées au bon endroit dans votre fichier complet.


    // ----- adjustPlotTypesWithinDistricts (Inchangé pour Stratégie 1) -----
    adjustPlotTypesWithinDistricts() {
		// Logique modifiée pour être STRICTE
		console.log("Ajustement STRICT des types de parcelles pour correspondre au type du district...");
		// Ajout de compteurs pour mieux suivre ce qui se passe
		const stats = {
			forcedToSkyscraper: 0,
			forcedToIndustrial: 0,
			forcedToResidential: 0, // Compte les conversions vers house/building
			parksProtected: 0,
			alreadyCorrect: 0, // Compte les parcelles déjà du bon type
			unbuildableSkipped: 0
		};
	
		this.districts.forEach(district => {
			district.plots.forEach(plot => {
				// 1. Préserver les parcs existants
				if (plot.zoneType === 'park') {
					stats.parksProtected++;
					plot.isPark = true; // Assurer la cohérence
					return; // Ne pas modifier les parcs
				}
				// 2. Ignorer les parcelles non constructibles
				if (plot.zoneType === 'unbuildable') {
					stats.unbuildableSkipped++;
					return;
				}
	
				const initialType = plot.zoneType; // Garder une trace du type initial pour les stats
				let targetType = null; // Le type que la parcelle DEVRAIT avoir
	
				// 3. Déterminer le type CIBLE basé STRICTEMENT sur le type du DISTRICT
				switch (district.type) {
					case 'business':
						// Un district d'affaires ne contient QUE des gratte-ciels
						targetType = 'skyscraper';
						if (initialType !== targetType) stats.forcedToSkyscraper++; else stats.alreadyCorrect++;
						break;
	
					case 'industrial':
						// Un district industriel ne contient QUE des bâtiments industriels
						targetType = 'industrial';
						if (initialType !== targetType) stats.forcedToIndustrial++; else stats.alreadyCorrect++;
						break;
	
					case 'residential':
						// Un district résidentiel contient des maisons ou des immeubles standards
						// Choisir entre 'house' et 'building' basé sur la taille de la parcelle
						// (Vous pouvez ajuster le seuil de 150 m² si nécessaire)
						const plotArea = plot.width * plot.depth;
						targetType = (plotArea > 550) ? 'building' : 'house';
						// Compter comme conversion si ce n'était pas déjà le bon type résidentiel
						if (initialType !== targetType) stats.forcedToResidential++; else stats.alreadyCorrect++;
						break;
	
					default:
						// Si le type de district n'est pas reconnu, on ne change pas la parcelle
						targetType = initialType; // Garder le type initial
						stats.alreadyCorrect++; // ou le considérer comme correct/inchangé
						break;
				}
	
				// 4. Appliquer le type cible à la parcelle
				if (targetType !== null) {
					 plot.zoneType = targetType;
					 // Mettre à jour la propriété isPark par sécurité (elle devrait être false sauf si type='park')
					 plot.isPark = (targetType === 'park');
				}
			});
		});
	
		// Afficher les statistiques détaillées
		console.log(`Ajustement STRICT terminé:`);
		console.log(`  - Forcés Gratte-ciel: ${stats.forcedToSkyscraper}`);
		console.log(`  - Forcés Industriel: ${stats.forcedToIndustrial}`);
		console.log(`  - Forcés Résidentiel (maison/immeuble): ${stats.forcedToResidential}`);
		console.log(`  - Parcs Protégés: ${stats.parksProtected}`);
		console.log(`  - Déjà Corrects / Inchangés: ${stats.alreadyCorrect}`);
		console.log(`  - Non-constructibles Ignorés: ${stats.unbuildableSkipped}`);
	}


    // ----- createDistrictDebugVisuals (Inchangé) -----
    createDistrictDebugVisuals() {
		while (this.debugGroup.children.length > 0) {
			const child = this.debugGroup.children[0];
			this.debugGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
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
			switch(district.type) {
				case 'residential': material = this.materials.debugResidentialMat; break;
				case 'industrial': material = this.materials.debugIndustrialMat; break;
				case 'business': material = this.materials.debugBusinessMat; break;
				default: material = this.materials.debugDefaultMat;
			}

			const planeMesh = new THREE.Mesh(planeGeom, material);
			planeMesh.position.set(center.x, 0.1, center.z);
			planeMesh.rotation.x = -Math.PI / 2;

			planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
			this.debugGroup.add(planeMesh);
		});
		 console.log(`Visuels de débogage (Plans) pour ${this.debugGroup.children.length} districts créés.`);
	}

    // ----- findNeighbors (Inchangé) -----
    findNeighbors(plot, allPlots) {
        const neighbors = [];
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;

        const p1Bounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth };

        for (const p2 of allPlots) {
            if (p2.id === plot.id) continue;

            const p2Bounds = { minX: p2.x, maxX: p2.x + p2.width, minZ: p2.z, maxZ: p2.z + p2.depth };

            const xOverlap = Math.max(0, Math.min(p1Bounds.maxX, p2Bounds.maxX) - Math.max(p1Bounds.minX, p2Bounds.minX));
            const zOverlap = Math.max(0, Math.min(p1Bounds.maxZ, p2Bounds.maxZ) - Math.max(p1Bounds.minZ, p2Bounds.minZ));
            // Calcul des gaps (distance entre les bords les plus proches)
            const xDist = Math.max(p2Bounds.minX - p1Bounds.maxX, p1Bounds.minX - p2Bounds.maxX);
            const zDist = Math.max(p2Bounds.minZ - p1Bounds.maxZ, p1Bounds.minZ - p2Bounds.maxZ);

            // Voisin si :
            // - Se touchent directement (gap proche de 0) sur un côté ET ont un chevauchement sur l'autre axe
            const touchesHorizontally = Math.abs(xDist) < tolerance && zOverlap > tolerance;
            const touchesVertically = Math.abs(zDist) < tolerance && xOverlap > tolerance;
            // - Sont séparés par exactement la largeur d'une route ET ont un chevauchement sur l'autre axe
            const separatedByHorizontalRoad = Math.abs(zDist - roadW) < tolerance && xOverlap > tolerance;
            const separatedByVerticalRoad = Math.abs(xDist - roadW) < tolerance && zOverlap > tolerance;

            if (touchesHorizontally || touchesVertically || separatedByHorizontalRoad || separatedByVerticalRoad) {
                neighbors.push(p2);
            }
        }
        return neighbors;
    }


    // ----- clearCity (Inchangé) -----
    clearCity() {
        console.log("Nettoyage de la ville existante...");
        this.layoutGenerator?.reset();
        this.roadGenerator?.reset();
        this.contentGenerator?.reset(this.assetLoader || null);

        while (this.cityContainer.children.length > 0) {
            const group = this.cityContainer.children[0];
             if (group === this.contentGroup || group === this.sidewalkGroup || group === this.roadGroup || group === this.debugGroup) {
                  while (group.children.length > 0) {
                      const child = group.children[0];
                      group.remove(child);
                      if (child.geometry) child.geometry.dispose();
                      // Ne pas disposer les matériaux partagés ici
                  }
             }
            this.cityContainer.remove(group);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.contentGroup = null;
         this.debugGroup = new THREE.Group(); this.debugGroup.name = "DebugVisuals";
         if (this.config.showDistrictBoundaries) {
             this.cityContainer.add(this.debugGroup);
         }

         this.districts = [];
         this.leafPlots = [];

        if (this.groundMesh) {
            if (this.groundMesh.parent) this.groundMesh.parent.remove(this.groundMesh);
            if (this.groundMesh.geometry) this.groundMesh.geometry.dispose();
            // Le matériau est dans this.materials, disposé dans destroy()
            this.groundMesh = null;
        }

        console.log("Nettoyage terminé.");
    }

    // ----- createGlobalGround (Inchangé) -----
    createGlobalGround() {
        if (this.groundMesh && this.groundMesh.parent) return;
        if (this.groundMesh && !this.groundMesh.parent) { this.scene.add(this.groundMesh); return; }

        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize * 1.2, this.config.mapSize * 1.2);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = -0.01;
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "GlobalGround";
        this.scene.add(this.groundMesh);
    }

    // ----- destroy (Inchangé) -----
    destroy() {
        console.log("Destruction du CityManager...");
        this.clearCity();

        this.assetLoader?.disposeAssets();

        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        this.materials = {};
        console.log("  - Matériaux partagés disposés.");

        if (this.cityContainer && this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        this.assetLoader = null; this.layoutGenerator = null; this.roadGenerator = null;
        this.contentGenerator = null; this.experience = null; this.scene = null;
        this.districts = null; this.leafPlots = null;
        this.cityContainer = null; this.debugGroup = null;

        console.log("CityManager détruit.");
    }

    // --- Méthodes utilitaires (Inchangées) ---
    getPlots() { return this.leafPlots || []; }
    getDistricts() { return this.districts || []; }

    logLoadedAssets() {
       if (!this.assetLoader || !this.assetLoader.assets) return;
       const counts = Object.entries(this.assetLoader.assets).map(([type, list]) => `${type}: ${list.length}`).join(', ');
       console.log(`Assets chargés - ${counts}`);
   }

    logInitialZoneTypes() {
        if (!this.leafPlots) return;
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Répartition initiale des types (par LayoutGenerator):", counts);
    }
     logAdjustedZoneTypes() {
         if (!this.leafPlots) return;
         const counts = {};
         this.leafPlots.forEach(p => {
             counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
         });
         console.log("Répartition finale des types (après ajustement District):", counts);
     }


    logDistrictStats() {
        if (!this.districts || this.districts.length === 0) return;
        const stats = { residential: 0, industrial: 0, business: 0 };
        let totalPlotsInDistricts = 0;
        this.districts.forEach(d => {
            if (stats[d.type] !== undefined) stats[d.type]++;
            totalPlotsInDistricts += d.plots.length;
        });
        console.log(`Stats Districts -> Total: ${this.districts.length} (R: ${stats.residential}, I: ${stats.industrial}, B: ${stats.business}). Parcelles dans districts: ${totalPlotsInDistricts}/${this.leafPlots?.length || 0}`);
        this.districts.forEach(d => {
            const plotCounts = {};
            d.plots.forEach(p => { plotCounts[p.zoneType] = (plotCounts[p.zoneType] || 0) + 1; });
            const plotCountsString = Object.entries(plotCounts).map(([k, v]) => `${k}:${v}`).join(', ');
            // Utiliser le getter .center de District
            const centerX = d.center ? d.center.x.toFixed(1) : 'N/A';
            const centerZ = d.center ? d.center.z.toFixed(1) : 'N/A';
            console.log(` - District ${d.id} (${d.type}): ${d.plots.length} parcelles [${plotCountsString}]. Centre: (${centerX}, ${centerZ})`);
        });
    }

    update() {
        // Mettre à jour les composants si nécessaire (ex: animations)
        // this.cityManager?.update(); // Est appelé depuis World.js
        // this.environment?.update(); // Est appelé depuis World.js
    }
} // Fin de la classe CityManager