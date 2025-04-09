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
        this.config = {
            // Map & Layout
            mapSize: 500,
            roadWidth: 10,
            minPlotSize: 13,
            maxPlotSize: 40,
            maxRecursionDepth: 7,

            // ... (District Formation comme avant) ...
            minDistrictSize: 5,
            maxDistrictSize: 12,

            // ... (Plot Type Adjustment Probabilities comme avant) ...
            businessConversionProbability: 0,
            industrialConversionProbability: 0,

            // ... (Initial Plot Type Probabilities comme avant) ...
            parkProbability: 0.10,
            industrialZoneProbability: 0.05,
            houseZoneProbability: 0.50,
            skyscraperZoneProbability: 0.1,

            // **** NOUVELLE SECTION POUR LES PROBABILITÉS DE TYPE DE DISTRICT ****
            districtProbabilities: {
				// Paramètres pour les quartiers d'affaires (Business/Skyscraper)
				business: {
					// Augmenter 'max' pour plus de dominance au centre (peut être > 1 avant normalisation)
					max: 3,  // Était 1.0 dans votre code, essayons plus pour vraiment dominer
					// Garder une décroissance assez rapide pour laisser place aux autres types plus loin
					decay: 11 // Était 10. Une valeur légèrement plus élevée = décroissance plus rapide.
				},
				// Paramètres pour les quartiers industriels
				industrial: {
					// Seuil à partir duquel la probabilité augmente (distance normalisée)
					threshold: 0.85, // Était 0.85. Commencer l'augmentation un peu plus tôt.
					// Facteur contrôlant la rapidité de la montée après le seuil
					factor: 9,     // Était 5. Augmenter pour une montée plus rapide.
					// Facteur multiplicateur pour la partie croissante (probabilité max en périphérie)
					multiplier: 0.9, // Était 0.2. Augmenter SIGNIFICATIVEMENT pour plus d'industrie loin du centre.
					// Probabilité de base en dessous du seuil (près du centre)
					base: 0.005   // Était 0.01. Réduire pour avoir très peu d'industrie au centre.
				},
				// Paramètres pour les quartiers résidentiels (Ajustés pour remplir l'espace restant)
				residential: {
					peakCenter: 0.45, // Centrer le pic résidentiel entre le centre et la périphérie. Était 0.5.
					peakWidth: 0.28,  // Largeur du pic. Était 0.2. Un peu plus large peut-être.
					// Probabilité de base réduite car business/industrial prennent plus de place aux extrêmes.
					base: 0.1        // Était 0.8. Réduire pour laisser la place aux autres types.
				}
			},
             // Le reste deviendra 'building' (environ 0.30)

            // Roads/Sidewalks & Plot Content (Inchangé)
            sidewalkWidth: 2, sidewalkHeight: 0.2, centerlineWidth: 0.15, centerlineHeight: 0.02,
            minHouseSubZoneSize: 7, minBuildingSubZoneSize: 10, minIndustrialSubZoneSize: 13,
            minParkSubZoneSize: 10, minSkyscraperSubZoneSize: 13, buildingSubZoneMargin: 1.5,

            // Asset Config (Inchangé)
             houseModelDir: "Public/Assets/Models/Houses/",
             houseModelFiles: [ { file: "House1.fbx" }, /* ... autres maisons ... */ { file: "House24.fbx" }, ],
             houseBaseWidth: 6, houseBaseHeight: 6, houseBaseDepth: 6,
             buildingModelDir: "Public/Assets/Models/Buildings/",
             buildingModelFiles: [ { file: "Building1.fbx", scale: 1.0 }, /* ... autres immeubles ... */ { file: "Building10.glb", scale: 1 }, ],
             buildingBaseWidth: 10, buildingBaseHeight: 20, buildingBaseDepth: 10,
             industrialModelDir: "Public/Assets/Models/Industrials/",
             industrialModelFiles: [ { file: "Factory1_glb.glb", scale: 1 }, { file: "Factory2_glb.glb" }, { file: "Factory3_glb.glb" } ],
             industrialBaseWidth: 18, industrialBaseHeight: 12, industrialBaseDepth: 25,
             parkModelDir: "Public/Assets/Models/Parks/",
             parkModelFiles: [ { file: "Bench.glb", scale: 0.5 }, { file: "Fountain.glb", scale: 1.0 }, { file: "Gazebo.glb", scale: 2 }, { file: "Table.glb", scale: 0.5 } ],
             parkBaseWidth: 15, parkBaseHeight: 3, parkBaseDepth: 15,
             treeModelDir: "Public/Assets/Models/Trees/",
             treeModelFiles: [ { file: "Tree.glb", scale: 0.9 }, /* ... autres arbres ... */ { file: "Tree7.glb", scale: 0.9 }, ],
             treeBaseWidth: 4, treeBaseHeight: 8, treeBaseDepth: 4,
             skyscraperModelDir: "Public/Assets/Models/Skyscrapers/",
             skyscraperModelFiles: [ { file: "Skyscraper1.glb", scale: 0.8 }, { file: "Skyscraper2.glb", scale: 1 }, { file: "Skyscraper3.glb", scale: 1 }, ],
             skyscraperBaseWidth: 15, skyscraperBaseHeight: 80, skyscraperBaseDepth: 15,

            // Tree Placement (Inchangé)
            treePlacementProbabilitySidewalk: 0.3, treePlacementProbabilityPark: 0.04, treePlacementProbabilityMargin: 0.008,

            // Debug (Inchangé)
             showDistrictBoundaries: true,

            // Fusion (Inchangé)
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
        this.clearCity();

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

            console.time("DistrictFormation");
            this.createDistricts_V2(); // Appel de la fonction qui utilise les probabilités modifiées
            console.timeEnd("DistrictFormation");
            console.log(`Districts formés: ${this.districts.length}`);

            console.time("PlotTypeAdjustment");
            this.adjustPlotTypesWithinDistricts();
            console.timeEnd("PlotTypeAdjustment");
            this.logAdjustedZoneTypes();
            this.logDistrictStats();

            console.time("RoadGeneration"); this.roadGroup = this.roadGenerator.generateRoads(this.leafPlots); this.cityContainer.add(this.roadGroup); console.timeEnd("RoadGeneration");
            console.time("ContentGeneration"); const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(this.leafPlots, this.assetLoader); this.sidewalkGroup = sidewalkGroup; this.contentGroup = buildingGroup; this.cityContainer.add(this.sidewalkGroup); this.cityContainer.add(this.contentGroup); console.timeEnd("ContentGeneration");

            if (this.config.showDistrictBoundaries) { console.time("DebugVisualsGeneration"); this.createDistrictDebugVisuals(); console.timeEnd("DebugVisualsGeneration"); }

            console.log("--- Génération ville terminée ---");

        } catch (error) { console.error("Erreur majeure:", error); this.clearCity(); } finally { console.timeEnd("CityGeneration"); }
    }

    // ----- NOUVELLE MÉTHODE: createDistricts_V2 (Fonction appelante) -----
    createDistricts_V2() {
        if (!this.leafPlots || this.leafPlots.length === 0) return;

        const allPlots = [...this.leafPlots];
        const assignedPlotIds = new Set();
        this.districts = [];

        let availablePlots = allPlots.filter(p => p.zoneType !== 'unbuildable');

        while (availablePlots.length >= this.config.minDistrictSize) {
            const seedIndex = Math.floor(Math.random() * availablePlots.length);
            const seedPlot = availablePlots[seedIndex];

            // *** APPEL à getDistrictTypeProbabilities (qui est maintenant modifiée) ***
            const distToCenter = seedPlot.center.length();
            const probabilities = this.getDistrictTypeProbabilities(distToCenter);
            const districtType = this.chooseDistrictType(probabilities);
            // *** FIN APPEL ***

            const newDistrict = new District(districtType);
            const queue = [seedPlot];
            const currentDistrictAssigned = new Set();

            newDistrict.addPlot(seedPlot);
            assignedPlotIds.add(seedPlot.id);
            currentDistrictAssigned.add(seedPlot.id);

            let head = 0;
            while (head < queue.length && newDistrict.plots.length < this.config.maxDistrictSize) {
                const currentPlot = queue[head++];
                const neighbors = this.findNeighbors(currentPlot, allPlots);
                for (const neighbor of neighbors) {
                     if (neighbor.zoneType !== 'unbuildable' &&
                         !assignedPlotIds.has(neighbor.id) &&
                         !currentDistrictAssigned.has(neighbor.id))
                     {
                        if (newDistrict.plots.length < this.config.maxDistrictSize) {
                            newDistrict.addPlot(neighbor);
                            assignedPlotIds.add(neighbor.id);
                            currentDistrictAssigned.add(neighbor.id);
                            queue.push(neighbor);
                        } else {
                            break;
                        }
                    }
                }
            }

            if (newDistrict.plots.length >= this.config.minDistrictSize) {
                this.districts.push(newDistrict);
            } else {
                console.warn(`District potentiel (type ${districtType}) démarré à ${seedPlot.id} n'a pas atteint la taille min (${newDistrict.plots.length}). Ces ${newDistrict.plots.length} parcelles resteront assignées mais hors district.`);
                // Les parcelles restent dans assignedPlotIds et ne sont pas réutilisées
            }

            availablePlots = availablePlots.filter(p => !assignedPlotIds.has(p.id));
        }

        console.log(`Formation districts terminée. ${this.districts.length} districts créés. ${availablePlots.length} parcelles restantes non assignées.`);
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
         console.log("Ajustement des types de parcelles selon les règles de district...");
         const stats = { convertedToSkyscraper: 0, convertedToIndustrial: 0, convertedToResidential: 0, parksProtected: 0 };

         this.districts.forEach(district => {
             district.plots.forEach(plot => {
                 if (plot.zoneType === 'park') { stats.parksProtected++; return; }
                 if (plot.zoneType === 'unbuildable') { return; }

                 const initialType = plot.zoneType;
                 let finalType = initialType;

                 // La logique ici reste la même, mais elle s'appliquera à des districts
                 // dont la répartition des types (business, industrial, residential)
                 // a été modifiée en amont par getDistrictTypeProbabilities.
                 switch (district.type) {
                     case 'business': // Moins de districts de ce type seront créés
                         if (initialType !== 'skyscraper') {
                             if (Math.random() < this.config.businessConversionProbability) {
                                 finalType = 'skyscraper';
                                 if (initialType !== finalType) stats.convertedToSkyscraper++;
                             } else if (initialType === 'industrial' || initialType === 'house') {
                                 finalType = 'building'; // Fallback si pas converti
                                 if (initialType !== finalType && (finalType === 'building' || finalType === 'house')) stats.convertedToResidential++;
                             }
                         }
                         break;
                     case 'industrial': // Moins de districts de ce type seront créés
                         if (initialType !== 'industrial') {
                              if (Math.random() < this.config.industrialConversionProbability) {
                                  finalType = 'industrial';
                                  if (initialType !== finalType) stats.convertedToIndustrial++;
                              } else if (['skyscraper', 'business', 'house'].includes(initialType)) {
                                  finalType = 'building'; // Fallback si pas converti
                                  if (initialType !== finalType && (finalType === 'building' || finalType === 'house')) stats.convertedToResidential++;
                              }
                         }
                         break;
                     case 'residential': // Plus de districts de ce type seront créés
                         if (['industrial', 'business', 'skyscraper'].includes(initialType)) {
                             // Convertir les types non résidentiels en résidentiel (maison ou immeuble)
                             finalType = (plot.width * plot.depth > 150) ? 'building' : 'house';
                             if (initialType !== finalType) stats.convertedToResidential++;
                         }
                         // Si c'était déjà 'house' ou 'building', on ne change rien.
                         break;
                 }
                  plot.zoneType = finalType;
                  plot.isPark = (finalType === 'park');
             });
         });
         console.log(`Ajustement terminé. Conversions -> Skyscraper: ${stats.convertedToSkyscraper}, Industrial: ${stats.convertedToIndustrial}, Residential (convertis): ${stats.convertedToResidential}. Parcs protégés: ${stats.parksProtected}`);
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