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
        this.config = {
            // Map & Layout
            mapSize: 500,
            roadWidth: 10,
            minPlotSize: 13,
            maxPlotSize: 40,
            maxRecursionDepth: 7,

            // --- District Formation ---
            minDistrictSize: 5, // NOUVEAU
            maxDistrictSize: 12, // NOUVEAU
            // (Suppression des ratios de zone globale)

            // --- Plot Type Adjustment Probabilities ---
            businessConversionProbability: 0.9,
            industrialConversionProbability: 0.85,

            // --- Initial Plot Type Probabilities (LayoutGenerator) ---
            parkProbability: 0.10,
            industrialZoneProbability: 0,
            houseZoneProbability: 0.35,
            skyscraperZoneProbability: 0.10,

            // Roads/Sidewalks & Plot Content (Inchangé)
            sidewalkWidth: 2, sidewalkHeight: 0.2, centerlineWidth: 0.15, centerlineHeight: 0.02,
            minHouseSubZoneSize: 7, minBuildingSubZoneSize: 10, minIndustrialSubZoneSize: 13,
            minParkSubZoneSize: 10, minSkyscraperSubZoneSize: 13, buildingSubZoneMargin: 1.5,

            // Asset Config (Inchangé)
            // ... (config assets houses, buildings, etc.) ...
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

        // Materials (Inchangé)
        this.materials = {
            // ... (autres matériaux inchangés) ...
            groundMaterial: new THREE.MeshStandardMaterial({ color: 0x0f0118 }),
            sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999999 }),
            centerlineMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            parkMaterial: new THREE.MeshStandardMaterial({ color: 0x61874c }),
            buildingGroundMaterial: new THREE.MeshStandardMaterial({ color: 0x333333 }),

            // --- NOUVEAU: Matériaux Debug (Plans colorés) ---
            debugResidentialMat: new THREE.MeshBasicMaterial({
                color: 0x0077ff, // Bleu pour résidentiel
                transparent: true,
                opacity: 0.4, // Ajustez l'opacité si besoin
                side: THREE.DoubleSide // Pour être visible des deux côtés si jamais
            }),
            debugIndustrialMat: new THREE.MeshBasicMaterial({
                color: 0xffa500, // Orange pour industriel
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            }),
            debugBusinessMat: new THREE.MeshBasicMaterial({
                color: 0xcc0000, // Rouge pour affaires
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            }),
             // Garder un matériau par défaut pour les cas imprévus (optionnel)
             debugDefaultMat: new THREE.MeshBasicMaterial({
                color: 0xcccccc,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
             }),
        };

        // Composants (Inchangé)
        this.assetLoader = new CityAssetLoader(this.config); /* ... etc ... */
        this.layoutGenerator = new CityLayoutGenerator(this.config);
        this.roadGenerator = new RoadNetworkGenerator(this.config, this.materials);
        this.contentGenerator = new PlotContentGenerator(this.config, this.materials);

        // Données Ville (Inchangé)
        this.districts = []; this.leafPlots = [];

        // Groupes Scène (Inchangé)
        this.cityContainer = new THREE.Group(); this.cityContainer.name = "CityContainer"; /* ... etc ... */
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

            console.time("AssetLoading"); /* ... */ await this.assetLoader.loadAssets(); console.timeEnd("AssetLoading"); this.logLoadedAssets();

            console.time("LayoutGeneration");
            this.leafPlots = this.layoutGenerator.generateLayout(this.config.mapSize);
            console.timeEnd("LayoutGeneration");
            console.log(`Layout généré avec ${this.leafPlots.length} parcelles.`);
            this.logInitialZoneTypes();

            if (!this.leafPlots || this.leafPlots.length === 0) throw new Error("Layout n'a produit aucune parcelle.");

            // --- NOUVELLE Logique: Formation des Quartiers ---
            console.time("DistrictFormation");
            this.createDistricts_V2(); // Utilise la nouvelle méthode
            console.timeEnd("DistrictFormation");
            console.log(`Districts formés: ${this.districts.length}`);

            // --- Ajustement des types de parcelles DANS les districts ---
            console.time("PlotTypeAdjustment");
            this.adjustPlotTypesWithinDistricts();
            console.timeEnd("PlotTypeAdjustment");
            this.logAdjustedZoneTypes();
            this.logDistrictStats();

            // --- Suite génération (Roads, Content) ---
            console.time("RoadGeneration"); /* ... */ this.roadGroup = this.roadGenerator.generateRoads(this.leafPlots); this.cityContainer.add(this.roadGroup); console.timeEnd("RoadGeneration");
            console.time("ContentGeneration"); /* ... */ const { sidewalkGroup, buildingGroup } = this.contentGenerator.generateContent(this.leafPlots, this.assetLoader); this.sidewalkGroup = sidewalkGroup; this.contentGroup = buildingGroup; this.cityContainer.add(this.sidewalkGroup); this.cityContainer.add(this.contentGroup); console.timeEnd("ContentGeneration");

            // --- Debug Visuals ---
            if (this.config.showDistrictBoundaries) { console.time("DebugVisualsGeneration"); this.createDistrictDebugVisuals(); console.timeEnd("DebugVisualsGeneration"); }

            console.log("--- Génération ville terminée ---");

        } catch (error) { console.error("Erreur majeure:", error); this.clearCity(); } finally { console.timeEnd("CityGeneration"); }
    }

    // ----- NOUVELLE MÉTHODE: createDistricts_V2 -----
    createDistricts_V2() {
        if (!this.leafPlots || this.leafPlots.length === 0) return;

        const allPlots = [...this.leafPlots]; // Copie pour pouvoir filtrer
        const assignedPlotIds = new Set();
        this.districts = []; // Reset districts

        // Filtrer les parcelles non constructibles initialement
        let availablePlots = allPlots.filter(p => p.zoneType !== 'unbuildable');

        while (availablePlots.length >= this.config.minDistrictSize) {
            // 1. Choisir une graine aléatoire parmi les disponibles
            const seedIndex = Math.floor(Math.random() * availablePlots.length);
            const seedPlot = availablePlots[seedIndex];

            // 2. Déterminer le type de district probabiliste pour cette graine
            const distToCenter = seedPlot.center.length(); // Distance du centre (Vector3)
            const probabilities = this.getDistrictTypeProbabilities(distToCenter);
            const districtType = this.chooseDistrictType(probabilities);

            // 3. Faire grandir le district (BFS)
            const newDistrict = new District(districtType);
            const queue = [seedPlot];
            const currentDistrictAssigned = new Set(); // IDs assignés à CE district pendant sa croissance

            // Ajouter la graine
            newDistrict.addPlot(seedPlot);
            assignedPlotIds.add(seedPlot.id);
            currentDistrictAssigned.add(seedPlot.id);

            let head = 0; // Index pour simuler une file (plus efficace que shift())
            while (head < queue.length && newDistrict.plots.length < this.config.maxDistrictSize) {
                const currentPlot = queue[head++]; // Prend l'élément et avance l'index

                // Trouver voisins non déjà assignés (ni globalement, ni à ce district)
                const neighbors = this.findNeighbors(currentPlot, allPlots); // Cherche dans toutes les parcelles
                for (const neighbor of neighbors) {
                     if (neighbor.zoneType !== 'unbuildable' &&
                         !assignedPlotIds.has(neighbor.id) &&
                         !currentDistrictAssigned.has(neighbor.id))
                     {
                        // Vérifier si on peut encore ajouter
                        if (newDistrict.plots.length < this.config.maxDistrictSize) {
                            newDistrict.addPlot(neighbor);
                            assignedPlotIds.add(neighbor.id);
                            currentDistrictAssigned.add(neighbor.id);
                            queue.push(neighbor);
                        } else {
                            break; // Arrêter d'ajouter des voisins si max atteint
                        }
                    }
                }
            } // Fin BFS pour ce district

            // 4. Valider et stocker le district
            if (newDistrict.plots.length >= this.config.minDistrictSize) {
                this.districts.push(newDistrict);
                // Les parcelles restent marquées comme assignées dans assignedPlotIds, c'est correct.
            } else {
                // Si le district n'atteint pas la taille min:
                // AFFICHER L'AVERTISSEMENT MAIS NE PAS LIBÉRER LES PARCELLES
                console.warn(`District potentiel (type ${districtType}) démarré à ${seedPlot.id} n'a pas atteint la taille min (${newDistrict.plots.length}). Ces ${newDistrict.plots.length} parcelles resteront assignées mais hors district.`);

                // ---> COMMENTER OU SUPPRIMER LA LOGIQUE DE LIBÉRATION <---
                /*
                currentDistrictAssigned.forEach(plotId => {
                    // Ne pas faire ceci : assignedPlotIds.delete(plotId);
                    const plot = allPlots.find(p => p.id === plotId);
                    if (plot) {
                        plot.districtId = null; // Garder districtId à null est ok
                    }
                });
                */
               // Les parcelles restent dans le Set global 'assignedPlotIds'
               // Elles ne seront donc pas réutilisées comme graines.
            }

            // 5. Mettre à jour la liste des parcelles disponibles pour la prochaine itération
            // Ce filtre exclura correctement les parcelles de la tentative échouée car elles sont toujours dans assignedPlotIds
            availablePlots = availablePlots.filter(p => !assignedPlotIds.has(p.id));
        } // Fin boucle While (assez de parcelles dispo)

        console.log(`Formation districts terminée. ${this.districts.length} districts créés. ${availablePlots.length} parcelles restantes non assignées.`);
    }


    // ----- getDistrictTypeProbabilities (Nouvelle fonction helper) -----
    getDistrictTypeProbabilities(distanceToCenter) {
        const mapRadius = this.config.mapSize / 2;
        if (mapRadius <= 0) return { business: 1/3, industrial: 1/3, residential: 1/3 }; // Eviter division par zero

        const normalizedDistance = Math.max(0, Math.min(1, distanceToCenter / mapRadius));
        const d = normalizedDistance;

        // Probabilités brutes (Ajustez ces courbes si nécessaire)
        const rawPBusiness = Math.exp(-d * 5);
        const rawPIndustrial = d > 0.6 ? 1 - Math.exp(-(d - 0.6) * 5) : 0.05; // Augmente surtout après 60%, petite base sinon
        const rawPResidential = Math.exp(-((d - 0.4)**2) / (2 * 0.1)) + 0.15; // Pic vers 40%, plus large base

        const totalRawP = rawPBusiness + rawPIndustrial + rawPResidential;
        if (totalRawP === 0) return { business: 1/3, industrial: 1/3, residential: 1/3 };

        return {
            business: rawPBusiness / totalRawP,
            industrial: rawPIndustrial / totalRawP,
            residential: rawPResidential / totalRawP
        };
    }

    // ----- chooseDistrictType (Nouvelle fonction helper) -----
    chooseDistrictType(probabilities) {
        const rand = Math.random();
        let cumulative = 0;
        if (rand < (cumulative += probabilities.business)) return 'business';
        if (rand < (cumulative += probabilities.industrial)) return 'industrial';
        return 'residential';
    }


    // ----- adjustPlotTypesWithinDistricts (Logique interne inchangée) -----
    adjustPlotTypesWithinDistricts() {
         // ... (Le code est identique à la version précédente, il fonctionne sur les nouveaux districts) ...
         console.log("Ajustement des types de parcelles selon les règles de district...");
         const stats = { convertedToSkyscraper: 0, convertedToIndustrial: 0, convertedToResidential: 0, parksProtected: 0 };

         this.districts.forEach(district => {
             district.plots.forEach(plot => {
                 if (plot.zoneType === 'park') { stats.parksProtected++; return; }
                 if (plot.zoneType === 'unbuildable') { return; }

                 const initialType = plot.zoneType;
                 let finalType = initialType;

                 switch (district.type) {
                     case 'business':
                         if (initialType !== 'skyscraper') {
                             if (Math.random() < this.config.businessConversionProbability) {
                                 finalType = 'skyscraper';
                                 if (initialType !== finalType) stats.convertedToSkyscraper++;
                             } else if (initialType === 'industrial' || initialType === 'house') {
                                 finalType = 'building';
                                 if (initialType !== finalType) stats.convertedToResidential++;
                             }
                         }
                         break;
                     case 'industrial':
                         if (initialType !== 'industrial') {
                              if (Math.random() < this.config.industrialConversionProbability) {
                                  finalType = 'industrial';
                                  if (initialType !== finalType) stats.convertedToIndustrial++;
                              } else if (['skyscraper', 'business', 'house'].includes(initialType)) {
                                  finalType = 'building';
                                 if (initialType !== finalType) stats.convertedToResidential++;
                              }
                         }
                         break;
                     case 'residential':
                         if (['industrial', 'business', 'skyscraper'].includes(initialType)) {
                             finalType = (plot.width * plot.depth > 150) ? 'building' : 'house';
                             if (initialType !== finalType) stats.convertedToResidential++;
                         }
                         break;
                 }
                  plot.zoneType = finalType;
                  plot.isPark = (finalType === 'park');
             });
         });
         console.log(`Ajustement terminé. Conversions -> Skyscraper: ${stats.convertedToSkyscraper}, Industrial: ${stats.convertedToIndustrial}, Residential: ${stats.convertedToResidential}. Parcs protégés: ${stats.parksProtected}`);
    }


    // ----- createDistrictDebugVisuals (Logique interne inchangée) -----
    createDistrictDebugVisuals() {
		// Vider les anciens visuels (inchangé)
		while (this.debugGroup.children.length > 0) {
			const child = this.debugGroup.children[0];
			this.debugGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			// Les matériaux sont partagés, ne pas les disposer ici
		}

		this.districts.forEach(district => {
			if (district.plots.length === 0) return;

			const bounds = district.bounds; // Récupère la Box3 calculée (y min/max sont ignorés ici)
			const size = new THREE.Vector3();
			bounds.getSize(size); // Donne la taille X, Y(faible), Z
			const center = new THREE.Vector3();
			bounds.getCenter(center); // Donne le centre X, Y(faible), Z

			// Ignorer si la taille est invalide sur les axes X ou Z
			if (size.x <= 0 || size.z <= 0) return;

			// --- CHANGEMENT ICI : Utiliser PlaneGeometry ---
			// La taille du plan correspond à la taille X et Z de la boîte englobante
			const planeGeom = new THREE.PlaneGeometry(size.x, size.z);

			// Choisir le matériau en fonction du type de district
			let material;
			switch(district.type) {
				case 'residential': material = this.materials.debugResidentialMat; break;
				case 'industrial': material = this.materials.debugIndustrialMat; break;
				case 'business': material = this.materials.debugBusinessMat; break;
				default: material = this.materials.debugDefaultMat; // Utiliser le matériau par défaut
			}

			// Créer le Mesh avec le plan et le matériau
			const planeMesh = new THREE.Mesh(planeGeom, material);

			// --- Positionner et Orienter le Plan ---
			// Positionner au centre X/Z de la boîte, et légèrement au-dessus du sol (ex: Y=0.1)
			planeMesh.position.set(center.x, 0.1, center.z);
			// Orienter le plan pour qu'il soit horizontal (couché sur le sol)
			planeMesh.rotation.x = -Math.PI / 2;

			planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
			this.debugGroup.add(planeMesh);
		});
		 console.log(`Visuels de débogage (Plans) pour ${this.debugGroup.children.length} districts créés.`);
	}

    // ----- findNeighbors (Inchangé) -----
    findNeighbors(plot, allPlots) {
        // ... (code identique à la version précédente) ...
        const neighbors = [];
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;

        const p1Bounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth };

        for (const p2 of allPlots) {
            if (p2.id === plot.id) continue;

            const p2Bounds = { minX: p2.x, maxX: p2.x + p2.width, minZ: p2.z, maxZ: p2.z + p2.depth };

            const xOverlap = Math.max(0, Math.min(p1Bounds.maxX, p2Bounds.maxX) - Math.max(p1Bounds.minX, p2Bounds.minX));
            const zOverlap = Math.max(0, Math.min(p1Bounds.maxZ, p2Bounds.maxZ) - Math.max(p1Bounds.minZ, p2Bounds.minZ));
            const xGap = Math.max(0, p2Bounds.minX - p1Bounds.maxX, p1Bounds.minX - p2Bounds.maxX); // Prend la plus grande distance si non contigu
            const zGap = Math.max(0, p2Bounds.minZ - p1Bounds.maxZ, p1Bounds.minZ - p2Bounds.maxZ);

            const touchesHorizontally = Math.abs(xGap) < tolerance && zOverlap > tolerance;
            const touchesVertically = Math.abs(zGap) < tolerance && xOverlap > tolerance;
            const separatedByHorizontalRoad = Math.abs(zGap - roadW) < tolerance && xOverlap > tolerance;
            const separatedByVerticalRoad = Math.abs(xGap - roadW) < tolerance && zOverlap > tolerance;

            if (touchesHorizontally || touchesVertically || separatedByHorizontalRoad || separatedByVerticalRoad) {
                neighbors.push(p2);
            }
        }
        return neighbors;
    }


    // ----- clearCity MODIFIÉ -----
    clearCity() {
        console.log("Nettoyage de la ville existante...");
        // ... (reset des générateurs comme avant) ...
        this.layoutGenerator?.reset();
        this.roadGenerator?.reset();
        // Passer null à reset si assetLoader n'est pas encore prêt ou si on veut juste vider
        this.contentGenerator?.reset(this.assetLoader || null);

        // Vider les groupes de la scène
        while (this.cityContainer.children.length > 0) {
            const group = this.cityContainer.children[0];
             // Vider aussi le contenu des groupes principaux avant de les retirer
             if (group === this.contentGroup || group === this.sidewalkGroup || group === this.roadGroup || group === this.debugGroup) {
                  while (group.children.length > 0) {
                      const child = group.children[0];
                      group.remove(child);
                      if (child.geometry) child.geometry.dispose();
                      // Ne pas disposer les matériaux partagés ici (debug ou autres)
                  }
             }
            this.cityContainer.remove(group);
        }
         this.roadGroup = null;
         this.sidewalkGroup = null;
         this.contentGroup = null;
         this.debugGroup = new THREE.Group(); // Recréer le groupe debug vide
         if (this.config.showDistrictBoundaries) { // Le rajouter au container si activé
             this.cityContainer.add(this.debugGroup);
         }


         // Vider les listes internes
         this.districts = [];
         this.leafPlots = [];

        // Supprimer le sol global
        // ... (comme avant) ...
        if (this.groundMesh) {
            if (this.groundMesh.parent) this.groundMesh.parent.remove(this.groundMesh);
            this.groundMesh.geometry.dispose();
            this.groundMesh = null;
        }

        console.log("Nettoyage terminé.");
    }

    // ----- createGlobalGround (Inchangé) -----
    createGlobalGround() {
        // ... (code identique) ...
        if (this.groundMesh && this.groundMesh.parent) return;
        if (this.groundMesh && !this.groundMesh.parent) { this.scene.add(this.groundMesh); return; }

        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize * 1.2, this.config.mapSize * 1.2);
        this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = -0.01;
        this.groundMesh.receiveShadow = true;
        this.groundMesh.name = "GlobalGround";
        this.scene.add(this.groundMesh);
        // console.log("Sol global créé."); // Moins verbeux
    }

    // ----- destroy MODIFIÉ -----
    destroy() {
        console.log("Destruction du CityManager...");
        this.clearCity(); // Nettoie d'abord (y compris debugGroup)

        // Dispose assets
        this.assetLoader?.disposeAssets();

        // Dispose matériaux partagés (y compris debug)
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        this.materials = {};
        console.log("  - Matériaux partagés disposés.");

        // Retirer conteneur principal
        if (this.cityContainer.parent) {
           this.cityContainer.parent.remove(this.cityContainer);
        }

        // Mettre à null
        this.assetLoader = null; this.layoutGenerator = null; this.roadGenerator = null;
        this.contentGenerator = null; this.experience = null; this.scene = null;
        this.districts = null; this.leafPlots = null;
        this.cityContainer = null; this.debugGroup = null; // Mettre les groupes à null aussi

        console.log("CityManager détruit.");
    }

    // --- Méthodes utilitaires ---
    getPlots() { return this.leafPlots || []; }
    getDistricts() { return this.districts || []; }
    logLoadedAssets() { /* ... (inchangé) ... */ }

    // --- NOUVEAU: Logging pour types de zones ---
    logInitialZoneTypes() {
        const counts = {};
        this.leafPlots.forEach(p => {
            counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
        });
        console.log("Répartition initiale des types de parcelles (par LayoutGenerator):", counts);
    }
     logAdjustedZoneTypes() {
         const counts = {};
         this.leafPlots.forEach(p => {
             counts[p.zoneType] = (counts[p.zoneType] || 0) + 1;
         });
         console.log("Répartition finale des types de parcelles (après ajustement District):", counts);
     }


    logDistrictStats() {
        // ... (légèrement modifié pour clarté) ...
        if (!this.districts || this.districts.length === 0) return;
        const stats = { residential: 0, industrial: 0, business: 0 };
        let totalPlotsInDistricts = 0;
        this.districts.forEach(d => {
            if (stats[d.type] !== undefined) stats[d.type]++;
            totalPlotsInDistricts += d.plots.length;
        });
        console.log(`Stats Districts -> Total: ${this.districts.length} (R: ${stats.residential}, I: ${stats.industrial}, B: ${stats.business}). Parcelles dans districts: ${totalPlotsInDistricts}/${this.leafPlots.length}`);
        this.districts.forEach(d => {
            const plotCounts = {};
            d.plots.forEach(p => { plotCounts[p.zoneType] = (plotCounts[p.zoneType] || 0) + 1; });
            const plotCountsString = Object.entries(plotCounts).map(([k, v]) => `${k}:${v}`).join(', ');
            console.log(` - District ${d.id} (${d.type}): ${d.plots.length} parcelles [${plotCountsString}]. Centre: (${d.center.x.toFixed(1)}, ${d.center.z.toFixed(1)})`);
        });
    }

    update() { }
}