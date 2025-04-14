// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class PlotContentGenerator {
    // --- MODIFIÉ : Ajout cityManager ref ---
	constructor(config, materials, debugPlotGridMaterial) {
        // ... (Constructeur potentiellement modifié pour garder les références, MAIS LE CODE N'EST PAS FOURNI car inchangé dans sa structure principale)
        this.config = config;
        this.materials = materials;
        this.sidewalkGroup = new THREE.Group(); this.sidewalkGroup.name = "Sidewalks";
        this.buildingGroup = new THREE.Group(); this.buildingGroup.name = "PlotContents";
        this.assetLoader = null;
        this.instanceData = {}; // Pour non-house assets + crosswalks
        this.stripeBaseGeometry = null;
        this.cityManager = null;
        this.navigationGraph = null;
        this.debugPlotGridGroup = null;
        this.debugPlotGridMaterial = debugPlotGridMaterial ?? new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

        // --- Section Maison Procédurale ---
        this.baseHouseGeometries = {};
        this.baseHouseMaterials = {};
        this.houseInstanceMatrices = {};
        this.houseInstancedMeshes = {};
        this.defineHouseBaseMaterials();
        this.defineHouseBaseGeometries();
        this.initializeHouseMatrixArrays();
        // --------------------------------

        console.log("PlotContentGenerator initialized (Dynamic World Coordinate Grid logic).");
    }

	initializeHouseMatrixArrays() {
        this.houseInstanceMatrices = {
            wall: [],
            roof: [],
            windowFrame: [],
            windowGlass: [],
            door: [],
            garageDoor: []
            // Ajoutez d'autres parties si nécessaire (ex: fascia)
        };
    }

	// ==============================================================
    // Fonction 1 : defineHouseBaseMaterials (INCHANGÉE sauf log)
    // ==============================================================
    defineHouseBaseMaterials() {
        // console.log("Définition des matériaux de base pour la maison L-shape..."); // Log légèrement ajusté
        const facadeColor = 0xF5F5DC;
        const roofColor = 0x8B4513;
        const doorColor = 0x4a2c2a;
        const garageDoorColor = 0xd3d3d3;
        const windowColor = 0xadd8e6;

        this.baseHouseMaterials = {};

        this.baseHouseMaterials.base_part1 = new THREE.MeshStandardMaterial({
            color: facadeColor, roughness: 0.8, name: "HouseBase1Mat"
        });
        this.baseHouseMaterials.base_part2 = new THREE.MeshStandardMaterial({
            color: facadeColor, roughness: 0.8, name: "HouseBase2Mat"
        });
        this.baseHouseMaterials.roof = new THREE.MeshStandardMaterial({
            color: roofColor, roughness: 0.7, name: "HouseRoofMat",
            side: THREE.DoubleSide // Maintenir DoubleSide
        });
        this.baseHouseMaterials.door = new THREE.MeshStandardMaterial({
            color: doorColor, roughness: 0.7, name: "HouseDoorMat"
        });
        this.baseHouseMaterials.garageDoor = new THREE.MeshStandardMaterial({
            color: garageDoorColor, roughness: 0.6, name: "HouseGarageDoorMat"
        });
        this.baseHouseMaterials.window = new THREE.MeshStandardMaterial({
            color: windowColor, roughness: 0.1, metalness: 0.1,
            transparent: true, opacity: 0.7, name: "HouseWindowMat",
            // side: THREE.DoubleSide // Optionnel si problèmes fenêtres
        });
    }

	// ==============================================================
    // Fonction 2 : defineHouseBaseGeometries (MODIFIÉE - Épaisseur réduite)
    // ==============================================================
    defineHouseBaseGeometries() {
        // console.log("Création des géométries de base (Épaisseur réduite)...");
        this.baseHouseGeometries = {};

        // --- Dimensions ---
        const armLength = 2; const armWidth = 1; const armDepth = 0.5;
        const roofPitchHeight = 0.3; const roofOverhang = 0.08;
        const doorHeight = 0.7 * armDepth; const doorWidth = 0.3;
        // *** MODIFICATION ICI : Réduire l'épaisseur ***
        const doorDepth = 0.02; // Epaisseur portes/fenêtres réduite (était 0.05)
        // *** FIN MODIFICATION ***
        const garageDoorHeight = 0.8 * armDepth; const garageDoorWidth = 0.55;
        const windowHeight = 0.4 * armDepth; const windowWidth = 0.2;
        // windowDepth utilisera automatiquement la nouvelle valeur de doorDepth
        const windowDepth = doorDepth;

        // --- Géométries Bases (inchangées) ---
        this.baseHouseGeometries.base_part1 = new THREE.BoxGeometry(armLength, armDepth, armWidth);
        this.baseHouseGeometries.base_part1.translate(armLength / 2, armDepth / 2, armWidth / 2);
        this.baseHouseGeometries.base_part2 = new THREE.BoxGeometry(armWidth, armDepth, armLength);
        this.baseHouseGeometries.base_part2.translate(armWidth / 2, armDepth / 2, armLength / 2);
        this.baseHouseGeometries.base_part1.userData = { height: armDepth, minY: 0 };
        this.baseHouseGeometries.base_part2.userData = { height: armDepth, minY: 0 };

        // --- Géométrie Toit (BufferGeometry - inchangé) ---
        const roofWidth = armWidth + 2 * roofOverhang;
        const roofDepth = armLength + 2 * roofOverhang;
        const roofHeight = roofPitchHeight;
        const halfRoofWidth = roofWidth / 2;
        const halfRoofDepth = roofDepth / 2;
        const roofGeometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([ /* ... sommets inchangés ... */ -halfRoofWidth, 0, -halfRoofDepth, halfRoofWidth, 0, -halfRoofDepth, halfRoofWidth, 0, halfRoofDepth, -halfRoofWidth, 0, halfRoofDepth, 0, roofHeight, -halfRoofDepth, 0, roofHeight, halfRoofDepth ]);
        const indices = new Uint16Array([ /* ... indices inchangés ... */ 0, 1, 4, 2, 3, 5, 0, 3, 5, 0, 5, 4, 1, 2, 5, 1, 5, 4, /* 0, 2, 1, 0, 3, 2 */ ]);
        roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        roofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        roofGeometry.computeVertexNormals();
        this.baseHouseGeometries.roof = roofGeometry;

        // --- Géométries Portes (utilise nouvelle épaisseur) ---
        this.baseHouseGeometries.door = new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth);
        this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(doorDepth, garageDoorHeight, garageDoorWidth);

        // --- Géométries Fenêtres (utilise nouvelle épaisseur) ---
        this.baseHouseGeometries.windowYZ = new THREE.BoxGeometry(windowDepth, windowHeight, windowWidth); // windowDepth est mis à jour
        this.baseHouseGeometries.windowXY = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth); // windowDepth est mis à jour
    }

    createProceduralHouseComponents() {
        console.log("Création géométrie et matériau pour maison procédurale...");

        // --- Recréer les matériaux ---
        this.proceduralHouseMaterial = new THREE.MeshStandardMaterial({
            color: 0xD4A3A1, // Couleur mur de l'exemple
            roughness: 0.8,
        });
        this.proceduralHouseMaterial.name = "ProceduralHouseMaterial";

        // --- Recréer la géométrie ---
        const wallHeight = 4;
        const roofHeight = 2;
        const roofOverhang = 0.3;
        const wing1Width = 10; const wing1Depth = 6;
        const wing2Width = 6; const wing2Depth = 7;
        const wing1PosX = -wing1Width / 4;
        const wing1PosZ = -wing1Depth / 4;
        const wing2PosX = wing1PosX + wing1Width / 2;
        const wing2PosZ = wing1PosZ + wing1Depth / 2;

        const geometriesToMerge = [];

        // Aile 1 (BoxGeometry - includes position, normal, uv)
        const wing1Geo = new THREE.BoxGeometry(wing1Width, wallHeight, wing1Depth);
        wing1Geo.translate(wing1PosX, wallHeight / 2, wing1PosZ);
        geometriesToMerge.push(wing1Geo);

        // Aile 2 (BoxGeometry - includes position, normal, uv)
        const wing2Geo = new THREE.BoxGeometry(wing2Width, wallHeight, wing2Depth);
        wing2Geo.translate(wing2PosX, wallHeight / 2, wing2PosZ);
        geometriesToMerge.push(wing2Geo);

        // --- Toits (Gable Roof Simplifié avec BufferGeometry) ---
        // Fonction interne pour créer UN toit (MODIFIÉE pour ajouter UVs)
        const createGableRoofGeometry = (width, depth, baseHeight, roofH, overhang, posX, posY, posZ) => {
            const roofBaseW = width / 2 + overhang;
            const roofBaseD = depth / 2 + overhang;
            const roofYPos = 0; // Base du toit au niveau Y=0 localement
            const ridgeY = roofYPos + roofH; // Sommet relatif à la base du toit

            const roofGeometry = new THREE.BufferGeometry();
            const gableVertices = new Float32Array([
                 // Base du toit (à roofYPos)
                 -roofBaseW, roofYPos, -roofBaseD, // 0 - Coin arrière gauche
                  roofBaseW, roofYPos, -roofBaseD, // 1 - Coin arrière droit
                  roofBaseW, roofYPos,  roofBaseD, // 2 - Coin avant droit
                 -roofBaseW, roofYPos,  roofBaseD, // 3 - Coin avant gauche
                 // Sommet du pignon (à ridgeY)
                  0, ridgeY, -roofBaseD, // 4 - Point haut arrière
                  0, ridgeY,  roofBaseD  // 5 - Point haut avant
             ]);
            // --- **NOUVEAU : Définition des UVs** ---
            // Simple projection planaire XY pour les faces des pignons etXZ pour les pans.
            // (Ces valeurs sont approximatives et pourraient être améliorées pour une vraie texture)
            const uvs = new Float32Array([
                // Coordonnées UV pour chaque vertex défini ci-dessus
                0, 0, // 0: -roofBaseW, roofYPos, -roofBaseD
                1, 0, // 1:  roofBaseW, roofYPos, -roofBaseD
                1, 1, // 2:  roofBaseW, roofYPos,  roofBaseD
                0, 1, // 3: -roofBaseW, roofYPos,  roofBaseD
                0.5, 1, // 4: 0, ridgeY, -roofBaseD (milieu haut arrière)
                0.5, 0, // 5: 0, ridgeY,  roofBaseD (milieu haut avant)
            ]);
            // ------------------------------------------
            const indices = [ 0, 1, 4,  3, 2, 5,  0, 3, 5,  0, 5, 4,  1, 2, 5,  1, 5, 4, ];

            roofGeometry.setIndex(indices);
            roofGeometry.setAttribute('position', new THREE.BufferAttribute(gableVertices, 3));
            // --- **NOUVEAU : Ajouter l'attribut UV** ---
            roofGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            // ------------------------------------------
            roofGeometry.computeVertexNormals();

            roofGeometry.translate(posX, posY + baseHeight, posZ); // Positionne la base du toit
            return roofGeometry;
        };

        // Créer les géométries des deux toits (qui auront maintenant des UVs)
        const roof1Geo = createGableRoofGeometry(wing1Width, wing1Depth, wallHeight, roofHeight, roofOverhang, wing1PosX, 0, wing1PosZ);
        geometriesToMerge.push(roof1Geo);
        const roof2Geo = createGableRoofGeometry(wing2Width, wing2Depth, wallHeight, roofHeight, roofOverhang, wing2PosX, 0, wing2PosZ);
        geometriesToMerge.push(roof2Geo);

        // --- Fusionner toutes les géométries ---
        if (geometriesToMerge.length > 0) {
            // Vérifier les attributs avant la fusion (pour le debug)
            // console.log("Geometry 0 (Wing 1 - Box):", Object.keys(geometriesToMerge[0].attributes));
            // console.log("Geometry 1 (Wing 2 - Box):", Object.keys(geometriesToMerge[1].attributes));
            // console.log("Geometry 2 (Roof 1 - Buffer):", Object.keys(geometriesToMerge[2].attributes));
            // console.log("Geometry 3 (Roof 2 - Buffer):", Object.keys(geometriesToMerge[3].attributes));

            this.proceduralHouseGeometry = mergeGeometries(geometriesToMerge, false);

            if (this.proceduralHouseGeometry) {
                 this.proceduralHouseGeometry.center();
                this.proceduralHouseGeometry.computeBoundingBox();
                const houseHeight = this.proceduralHouseGeometry.boundingBox.max.y - this.proceduralHouseGeometry.boundingBox.min.y;
                this.proceduralHouseGeometry.userData = { height: houseHeight };
                console.log("Géométrie maison procédurale créée et fusionnée (avec UVs).");
            } else {
                 console.error("Échec de la fusion des géométries de la maison procédurale (même avec UVs).");
                 this.proceduralHouseGeometry = new THREE.BoxGeometry(5, 5, 5);
                 this.proceduralHouseGeometry.userData = { height: 5 };
            }
        } else {
             console.error("Aucune géométrie à fusionner pour la maison procédurale.");
             this.proceduralHouseGeometry = new THREE.BoxGeometry(5, 5, 5);
             this.proceduralHouseGeometry.userData = { height: 5 };
        }

        // Nettoyer les géométries intermédiaires
        geometriesToMerge.forEach(g => g.dispose());
    }
    // --- FIN NOUVELLE FONCTION ---


    // --- generateContent MODIFIÉ ---
    generateContent(leafPlots, assetLoader, crosswalkInfos = [], cityManager, debugPlotGridGroup = null) {
        this.reset(assetLoader); // Reset internal state + assetLoader ref

        // Critical checks for CityManager and NavigationGraph
        if (!cityManager || !cityManager.getNavigationGraph()) {
            console.error("PlotContentGenerator.generateContent: CityManager or NavigationGraph not available! Cannot generate content.");
            // Return empty groups to prevent crashes later
            return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
        }
        this.cityManager = cityManager;
        this.navigationGraph = cityManager.getNavigationGraph(); // Store NavGraph reference
        this.debugPlotGridGroup = debugPlotGridGroup; // <-- NEW: Store the group reference
        console.log(`PlotContentGenerator: Starting content generation (with referenced NavGraph, Debug Plot Grid Group: ${debugPlotGridGroup ? 'Yes' : 'No'})...`);

        // Reset instance data (including house)
        this.initializeHouseMatrixArrays();
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {}, crosswalk: {} }; // Ensure clean state

        const allSidewalkGeometries = []; // For merging sidewalks
        // Base crosswalk geometry
        if(this.config.crosswalkStripeWidth > 0) {
             this.stripeBaseGeometry = new THREE.BoxGeometry(this.config.crosswalkStripeWidth, this.config.crosswalkHeight, 0.5);
        }


        // --- Main Loop over Plots ---
        leafPlots.forEach((plot) => {
            // Reset grid placement tracking FOR THIS PLOT before generating its content
            plot.placedHouseGrids = []; // ESSENTIAL!

            // Generate primary content (grid houses or subdivided assets)
            this.generatePlotPrimaryContent(plot);

            // Generate sidewalks if configured
            if (this.config.sidewalkWidth > 0) {
                 const g = this.collectSidewalkGeometriesForPlot(plot);
                 allSidewalkGeometries.push(...g);
            }

            // Place trees (uses occupiedSubZones or free areas)
            this.placeTreesForPlot(plot);
        });
        // --- End Plot Loop ---


        // Process crosswalks (unchanged)
        if (crosswalkInfos && crosswalkInfos.length > 0 && this.stripeBaseGeometry) {
             if (!this.instanceData.crosswalk) this.instanceData.crosswalk = {}; const crosswalkAssetId = 'default_crosswalk_stripe'; if (!this.instanceData.crosswalk[crosswalkAssetId]) this.instanceData.crosswalk[crosswalkAssetId] = []; const matrix = new THREE.Matrix4(); const basePosition = new THREE.Vector3(); const stripePosition = new THREE.Vector3(); const quaternion = new THREE.Quaternion(); const scale = new THREE.Vector3(); const offsetDirection = new THREE.Vector3(); const yAxis = new THREE.Vector3(0, 1, 0); const stripeCount = this.config.crosswalkStripeCount; const stripeWidth = this.config.crosswalkStripeWidth; const stripeGap = this.config.crosswalkStripeGap; const stripeTotalWidth = stripeWidth + stripeGap; const totalWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap; const initialOffset = -totalWidth / 2 + stripeWidth / 2;
             crosswalkInfos.forEach(info => { basePosition.copy(info.position); const finalAngle = info.angle + Math.PI / 2; quaternion.setFromAxisAngle(yAxis, finalAngle); if (Math.abs(finalAngle % Math.PI) < 0.01) { offsetDirection.set(1, 0, 0); } else { offsetDirection.set(0, 0, 1); } scale.set(1, 1, info.length); for (let i = 0; i < stripeCount; i++) { const currentOffset = initialOffset + i * stripeTotalWidth; stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset); stripePosition.y = this.config.crosswalkHeight / 2 + 0.005; matrix.compose(stripePosition, quaternion, scale); this.instanceData.crosswalk[crosswalkAssetId].push(matrix.clone()); } });
        } else if (crosswalkInfos && crosswalkInfos.length > 0 && !this.stripeBaseGeometry) {
             console.warn("Crosswalk info received but stripeBaseGeometry not created (config?)");
        }


        // Create InstancedMeshes (procedural houses + loaded assets)
        this.createInstancedMeshesFromData();

        // Merge sidewalk geometries (unchanged)
        if (allSidewalkGeometries.length > 0) {
            const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false);
            if (mergedSidewalkGeometry) {
                 const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial);
                 sidewalkMesh.castShadow = false; sidewalkMesh.receiveShadow = true;
                 sidewalkMesh.name = "Merged_Sidewalks";
                 this.sidewalkGroup.add(sidewalkMesh);
             } else { console.warn("Sidewalk merge failed."); }
             allSidewalkGeometries.forEach(geom => geom.dispose()); // Clean up geometries after merge
        }

        console.log("PlotContentGenerator: Content generation finished.");
        return this.getGroups(); // Return updated groups
    }

    // Fonction qui collecte les géométries transformées pour les trottoirs d'une parcelle
    collectSidewalkGeometriesForPlot(plot) {
        const plotGeometries = [];
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width, plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2, plotCenterZ = plot.z + plotDepth / 2;

        // Géométrie de base (cube 1x1x1)
        const baseSidewalkGeom = new THREE.BoxGeometry(1, 1, 1);

        const createTransformedGeom = (width, depth, height, x, z, yOffset = 0) => {
            const matrix = new THREE.Matrix4();
            matrix.makeScale(width, height, depth);
            matrix.setPosition(new THREE.Vector3(x, height / 2 + yOffset, z));
            const clonedGeom = baseSidewalkGeom.clone();
            clonedGeom.applyMatrix4(matrix);
            return clonedGeom;
        };

        const halfPlotW = plotWidth / 2;
        const halfPlotD = plotDepth / 2;
        const halfSidewalkW = sidewalkW / 2;
        // Coordonnées globales des bords
        const topZ = plot.z - halfSidewalkW;
        const bottomZ = plot.z + plotDepth + halfSidewalkW;
        const leftX = plot.x - halfSidewalkW;
        const rightX = plot.x + plotWidth + halfSidewalkW;

        // Ajout des géométries pour les bords et coins
        plotGeometries.push(createTransformedGeom(plotWidth, sidewalkW, sidewalkH, plotCenterX, topZ)); // Haut
        plotGeometries.push(createTransformedGeom(plotWidth, sidewalkW, sidewalkH, plotCenterX, bottomZ)); // Bas
        plotGeometries.push(createTransformedGeom(sidewalkW, plotDepth, sidewalkH, leftX, plotCenterZ)); // Gauche
        plotGeometries.push(createTransformedGeom(sidewalkW, plotDepth, sidewalkH, rightX, plotCenterZ)); // Droite
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, leftX, topZ)); // Coin HG
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, rightX, topZ)); // Coin HD
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, leftX, bottomZ)); // Coin BG
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, rightX, bottomZ)); // Coin BD

        baseSidewalkGeom.dispose();
        return plotGeometries;
    }

	generatePlotPrimaryContent(plot) {
		if (!this.cityManager || !this.assetLoader) {
			console.error(`PlotContentGenerator: Prérequis manquants pour plot ${plot.id}`);
			return;
		}
		// Création du sol de la parcelle
		const plotGroundY = 0.005;
		this.createPlotGround(plot, plotGroundY);
		plot.buildingInstances = [];
		const groundLevel = plotGroundY;
		const zoneType = plot.zoneType;
	
		let targetBuildingWidth = 0;
		let targetBuildingDepth = 0;
		let baseScaleFactor = 1.0;
		let assetInfo = null;
		let minSpacing = 0;
	
		// Définition des dimensions cibles, de l’échelle et de l’espacement en fonction du type de zone
		switch (zoneType) {
			case 'house': {
				const houseArmLength = 2.0;
				baseScaleFactor = this.config.gridHouseBaseScale ?? 1.5;
				targetBuildingWidth = houseArmLength * baseScaleFactor;
				targetBuildingDepth = houseArmLength * baseScaleFactor;
				minSpacing = this.config.minHouseSpacing ?? 0;
				break;
			}
			case 'building':
			case 'industrial':
			case 'skyscraper': {
				assetInfo = this.assetLoader.getRandomAssetData(zoneType);
				if (!assetInfo) {
					console.warn(`Aucun asset ${zoneType} trouvé pour le plot ${plot.id}.`);
					return;
				}
				if (zoneType === 'building') {
					baseScaleFactor = this.config.gridBuildingBaseScale ?? 1.0;
					minSpacing = this.config.minBuildingSpacing ?? 0;
				} else if (zoneType === 'industrial') {
					baseScaleFactor = this.config.gridIndustrialBaseScale ?? 1.0;
					minSpacing = this.config.minIndustrialSpacing ?? 0;
				} else {
					baseScaleFactor = this.config.gridSkyscraperBaseScale ?? 1.0;
					minSpacing = this.config.minSkyscraperSpacing ?? 0;
				}
				targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
				targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;
				break;
			}
			case 'park': {
				// On choisit un asset park par défaut pour établir la taille de grille
				assetInfo = this.assetLoader.getRandomAssetData('park');
				if (!assetInfo) {
					console.warn(`Aucun asset park trouvé pour le plot ${plot.id}.`);
					return;
				}
				baseScaleFactor = this.config.gridParkBaseScale ?? 1.0;
				targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
				targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;
				minSpacing = this.config.minParkSpacing ?? 2.0;
				break;
			}
			default:
				console.warn(`Type de zone inconnu ou non géré pour le contenu primaire: ${zoneType}`);
				return;
		}
	
		if (['house', 'building', 'industrial', 'skyscraper', 'park'].includes(zoneType)) {
			if (targetBuildingWidth <= 0.01 || targetBuildingDepth <= 0.01) { return; }
			minSpacing = Math.max(0, minSpacing);
			let numItemsX = 0;
			const itemPlusSpacingX = targetBuildingWidth + minSpacing;
			if (plot.width >= targetBuildingWidth) {
				numItemsX = (itemPlusSpacingX > 0.01) ? Math.floor((plot.width + minSpacing) / itemPlusSpacingX) : Math.floor(plot.width / targetBuildingWidth);
				if (numItemsX === 0) numItemsX = 1;
			}
			let numItemsY = 0;
			const itemPlusSpacingY = targetBuildingDepth + minSpacing;
			if (plot.depth >= targetBuildingDepth) {
				numItemsY = (itemPlusSpacingY > 0.01) ? Math.floor((plot.depth + minSpacing) / itemPlusSpacingY) : Math.floor(plot.depth / targetBuildingDepth);
				if (numItemsY === 0) numItemsY = 1;
			}
			numItemsX = Math.max(0, numItemsX);
			numItemsY = Math.max(0, numItemsY);
			if (numItemsX === 0 || numItemsY === 0) { return; }
			const remainingWidth = plot.width - (numItemsX * targetBuildingWidth);
			const remainingDepth = plot.depth - (numItemsY * targetBuildingDepth);
			const gapX = (numItemsX > 0) ? Math.max(0, remainingWidth / (numItemsX + 1)) : 0;
			const gapZ = (numItemsY > 0) ? Math.max(0, remainingDepth / (numItemsY + 1)) : 0;
	
			if (zoneType === 'park') {
				// Pour les parcs, on collecte toutes les positions de grille
				let parkCells = [];
				for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
					for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
						const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + gapX)) + targetBuildingWidth / 2;
						const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + gapZ)) + targetBuildingDepth / 2;
						const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
						const distToLeft = cellCenterX - plot.x;
						const distToRight = (plot.x + plot.width) - cellCenterX;
						const distToTop = cellCenterZ - plot.z;
						const distToBottom = (plot.z + plot.depth) - cellCenterZ;
						const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
						let targetRotationY = 0;
						const tolerance = 0.1;
						if (Math.abs(minDist - distToLeft) < tolerance)
							targetRotationY = -Math.PI / 2;
						else if (Math.abs(minDist - distToRight) < tolerance)
							targetRotationY = Math.PI / 2;
						else if (Math.abs(minDist - distToBottom) < tolerance)
							targetRotationY = Math.PI;
						parkCells.push({ pos: worldCellCenterPos, rotationY: targetRotationY });
					}
				}
				const availableCells = parkCells.length;
				if (availableCells === 0) return;
				const minParkElements = this.config.minParkElements ?? 3;
				const maxParkElements = this.config.maxParkElements ?? 5;
				const effectiveMax = Math.min(maxParkElements, availableCells);
				const chosenCount = Math.floor(Math.random() * (effectiveMax - minParkElements + 1)) + minParkElements;
				// Mélanger les cellules et en sélectionner 'chosenCount'
				let shuffledCells = parkCells.slice();
				for (let i = shuffledCells.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[shuffledCells[i], shuffledCells[j]] = [shuffledCells[j], shuffledCells[i]];
				}
				const selectedCells = shuffledCells.slice(0, chosenCount);
				// Pour chaque cellule sélectionnée, choisir aléatoirement un asset park pour varier les éléments
				selectedCells.forEach(item => {
					const currentParkAsset = this.assetLoader.getRandomAssetData('park');
					if (!currentParkAsset) {
						console.warn("Aucun asset park trouvé lors de la sélection aléatoire.");
						return;
					}
					const instanceMatrix = this.calculateInstanceMatrix(
						item.pos.x, item.pos.z,
						currentParkAsset.sizeAfterFitting.y,
						currentParkAsset.fittingScaleFactor,
						currentParkAsset.centerOffset,
						baseScaleFactor,
						item.rotationY
					);
					const modelId = currentParkAsset.id;
					if (!this.instanceData['park']) this.instanceData['park'] = {};
					if (!this.instanceData['park'][modelId]) this.instanceData['park'][modelId] = [];
					this.instanceData['park'][modelId].push(instanceMatrix.clone());
					const buildingPosition = item.pos.clone().setY(this.config.sidewalkHeight);
					const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, 'park', buildingPosition);
					if (registeredBuilding) {
						plot.addBuildingInstance({
							id: registeredBuilding.id,
							type: 'park',
							position: buildingPosition.clone()
						});
					}
				});
			} else {
				// Traitement standard pour 'house', 'building', 'industrial' et 'skyscraper'
				for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
					for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
						const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + gapX)) + targetBuildingWidth / 2;
						const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + gapZ)) + targetBuildingDepth / 2;
						const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
						const distToLeft = cellCenterX - plot.x;
						const distToRight = (plot.x + plot.width) - cellCenterX;
						const distToTop = cellCenterZ - plot.z;
						const distToBottom = (plot.z + plot.depth) - cellCenterZ;
						const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
						let targetRotationY = 0;
						const tolerance = 0.1;
						if (Math.abs(minDist - distToLeft) < tolerance)
							targetRotationY = -Math.PI / 2;
						else if (Math.abs(minDist - distToRight) < tolerance)
							targetRotationY = Math.PI / 2;
						else if (Math.abs(minDist - distToBottom) < tolerance)
							targetRotationY = Math.PI;
		
						if (zoneType === 'house') {
							// Logique de placement pour les maisons (récupérée depuis l'implémentation originale)
							const armLength = 2;
							const armWidth = 1;
							const armDepth = 0.5;
							const doorHeight = 0.7 * armDepth;
							const doorDepth = 0.02;
							const doorWidth = 0.3;
							const garageDoorHeight = 0.8 * armDepth;
							const garageDoorWidth = 0.55;
							const windowHeight = 0.4 * armDepth;
							const windowDepth = doorDepth;
							const window_Y_pos_Base = armDepth * 0.3;
							const finalScaleVector = new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor);
							const finalPosY = groundLevel;
							const modelCenterLocal = new THREE.Vector3(armLength / 2, armDepth / 2, armLength / 2);
							const centerOffsetRotated = modelCenterLocal.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY));
							const centerOffsetScaledRotated = centerOffsetRotated.multiplyScalar(baseScaleFactor);
							const finalPosition = new THREE.Vector3(
								worldCellCenterPos.x - centerOffsetScaledRotated.x,
								finalPosY,
								worldCellCenterPos.z - centerOffsetScaledRotated.z
							);
							const globalHouseMatrix = new THREE.Matrix4().compose(finalPosition, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY), finalScaleVector);
							let localMatrix;
							const addPartInstance = (partName, localMatrix) => {
								if (this.baseHouseGeometries[partName]) {
									const finalMatrix = new THREE.Matrix4().multiplyMatrices(globalHouseMatrix, localMatrix);
									const type = 'house';
									const modelId = partName;
									if (!this.instanceData[type]) this.instanceData[type] = {};
									if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
									this.instanceData[type][modelId].push(finalMatrix.clone());
								} else {
									console.warn(`Géométrie maison manquante: ${partName}`);
								}
							};
							const addWindowPart = (geomKey, facadeCoordX, facadeCoordZ, yBase, isYZPlane) => {
								const yCenter = yBase + windowHeight / 2;
								let xPos, zPos;
								if (isYZPlane) {
									xPos = facadeCoordX;
									zPos = facadeCoordZ;
								} else {
									xPos = facadeCoordX;
									zPos = facadeCoordZ;
								}
								localMatrix = new THREE.Matrix4().makeTranslation(xPos, yCenter, zPos);
								addPartInstance(geomKey, localMatrix);
							};
							localMatrix = new THREE.Matrix4();
							addPartInstance('base_part1', localMatrix);
							localMatrix = new THREE.Matrix4();
							addPartInstance('base_part2', localMatrix);
							const roofBaseY = armDepth;
							const roofPos1 = new THREE.Vector3(armLength / 2, roofBaseY, armWidth / 2);
							const roofPos2 = new THREE.Vector3(armWidth / 2, roofBaseY, armLength / 2);
							const roofRot1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
							const roofRot2 = new THREE.Quaternion();
							localMatrix = new THREE.Matrix4().compose(roofPos1, roofRot1, new THREE.Vector3(1, 1, 1));
							addPartInstance('roof', localMatrix);
							localMatrix = new THREE.Matrix4().compose(roofPos2, roofRot2, new THREE.Vector3(1, 1, 1));
							addPartInstance('roof', localMatrix);
							const doorPos = new THREE.Vector3(armWidth, doorHeight / 2, armLength * 0.75);
							localMatrix = new THREE.Matrix4().makeTranslation(doorPos.x, doorPos.y, doorPos.z);
							addPartInstance('door', localMatrix);
							const garagePos = new THREE.Vector3(armLength, garageDoorHeight / 2, armWidth / 2);
							localMatrix = new THREE.Matrix4().makeTranslation(garagePos.x, garagePos.y, garagePos.z);
							addPartInstance('garageDoor', localMatrix);
							addWindowPart('windowXY', 0.25, 0, window_Y_pos_Base, false);
							addWindowPart('windowXY', 0.75, 0, window_Y_pos_Base, false);
							addWindowPart('windowXY', 1.25, 0, window_Y_pos_Base, false);
							addWindowPart('windowXY', 1.75, 0, window_Y_pos_Base, false);
							addWindowPart('windowXY', 0.25, armWidth, window_Y_pos_Base, false);
							addWindowPart('windowXY', 0.75, armWidth, window_Y_pos_Base, false);
							addWindowPart('windowXY', 1.25, armWidth, window_Y_pos_Base, false);
							addWindowPart('windowXY', 1.75, armWidth, window_Y_pos_Base, false);
							addWindowPart('windowYZ', 0, 0.25, window_Y_pos_Base, true);
							addWindowPart('windowYZ', 0, 0.75, window_Y_pos_Base, true);
							addWindowPart('windowYZ', armWidth, 0.25, window_Y_pos_Base, true);
							addWindowPart('windowYZ', armWidth, 0.75, window_Y_pos_Base, true);
							const doorEdgeLeft = armLength * 0.75 - doorWidth / 2;
							const doorEdgeRight = armLength * 0.75 + doorWidth / 2;
							addWindowPart('windowYZ', armWidth, (armWidth + doorEdgeLeft) / 2, window_Y_pos_Base, true);
							addWindowPart('windowYZ', armWidth, (doorEdgeRight + armLength) / 2, window_Y_pos_Base, true);
							const buildingPosition = finalPosition.clone().setY(this.config.sidewalkHeight);
							const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, 'house', buildingPosition);
							if (registeredBuilding) {
								plot.addBuildingInstance({
									id: registeredBuilding.id,
									type: 'house',
									position: buildingPosition.clone()
								});
							}
						} else if (assetInfo && ['building', 'industrial', 'skyscraper'].includes(zoneType)) {
							const instanceMatrix = this.calculateInstanceMatrix(
								worldCellCenterPos.x, worldCellCenterPos.z,
								assetInfo.sizeAfterFitting.y,
								assetInfo.fittingScaleFactor,
								assetInfo.centerOffset,
								baseScaleFactor,
								targetRotationY
							);
							const modelId = assetInfo.id;
							if (!this.instanceData[zoneType]) this.instanceData[zoneType] = {};
							if (!this.instanceData[zoneType][modelId]) this.instanceData[zoneType][modelId] = [];
							this.instanceData[zoneType][modelId].push(instanceMatrix.clone());
							const buildingPosition = worldCellCenterPos.clone().setY(this.config.sidewalkHeight);
							const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, zoneType, buildingPosition);
							if (registeredBuilding) {
								plot.addBuildingInstance({
									id: registeredBuilding.id,
									type: zoneType,
									position: buildingPosition.clone()
								});
							}
						}
					}
				}
			}
		}
	}		

    // Place les arbres sur la parcelle selon le type de zone et des probabilités configurées
	placeTreesForPlot(plot) {
        if (!this.assetLoader || !this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) { return; }
        const probSidewalk = this.config.treePlacementProbabilitySidewalk ?? 0;
        const probPark = this.config.treePlacementProbabilityPark ?? 0;
        const sidewalkW = this.config.sidewalkWidth ?? 0;

        // 1. Placement sur les trottoirs (inchangé, logique géométrique simple)
        if (sidewalkW > 0 && probSidewalk > 0) {
            const corners = [ { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 }, { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 }, { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }, { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 } ];
            corners.forEach(corner => { if (Math.random() < probSidewalk) { this.addTreeInstance(corner.x, corner.z); } });
            // TODO: Pourrait être amélioré pour placer le long des bords aussi.
        }

        // 2. Placement dans les parcs (inchangé, logique simple de densité)
        const plotBounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth, };
        if (plot.zoneType === 'park' && probPark > 0) {
            const area = plot.width * plot.depth;
            const numTreesToTry = Math.ceil(area * probPark); // Densité basée sur probPark
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                // Dans un parc, on suppose qu'on peut planter partout pour l'instant
                this.addTreeInstance(treeX, treeZ);
            }
        }

        // 3. SUPPRESSION de la logique de placement dans les marges des autres zones
        // L'ancienne logique était basée sur `plot.placedGridCells`, qui n'est plus utilisée
        // pour le placement dynamique. Une nouvelle logique de marge nécessiterait de vérifier
        // la proximité des `plot.buildingInstances`, ce qui est plus complexe.
        // console.log(`Placement arbres pour plot ${plot.id} (${plot.zoneType}) terminé (pas de placement en marge).`);
    }

    // Ajoute une instance d'arbre à partir d'un asset aléatoire
    addTreeInstance(treeX, treeZ) {
        const assetInfo = this.assetLoader.getRandomAssetData('tree');
        if (assetInfo) {
            const randomScaleMultiplier = THREE.MathUtils.randFloat(0.85, 1.15); const finalUserScale = assetInfo.userScale * randomScaleMultiplier; const randomRotationY = Math.random() * Math.PI * 2;
            const instanceMatrix = this.calculateInstanceMatrix( treeX, treeZ, assetInfo.sizeAfterFitting.y, assetInfo.fittingScaleFactor, assetInfo.centerOffset, finalUserScale, randomRotationY );
            const modelId = assetInfo.id; const type = 'tree'; if (!this.instanceData[type]) this.instanceData[type] = {}; if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = []; this.instanceData[type][modelId].push(instanceMatrix);
        }
    }

    // --- getGroups ---
    getGroups() { return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup }; }

    // --- reset ---
	reset(assetLoader) {
        this.assetLoader = assetLoader;
        this.cityManager = null;
        this.navigationGraph = null; // Réinitialiser ref NavGraph
        // this.debugPlotGridGroup = null; // La référence au groupe debug est externe maintenant, ne pas la nullifier ici

        // --- Réinitialisation données d'instance (inchangé) ---
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {}, crosswalk: {} };
        this.initializeHouseMatrixArrays(); // Spécifique maison procédurale
        this.houseInstancedMeshes = {};     // Spécifique maison procédurale

        // --- Nettoyage Géométries de Base (inchangé) ---
        Object.values(this.baseHouseGeometries).forEach(geom => geom?.dispose());
        this.baseHouseGeometries = {};
        if (this.stripeBaseGeometry) { this.stripeBaseGeometry.dispose(); this.stripeBaseGeometry = null; }

        // --- Nettoyage Groupes Scène (inchangé) ---
        const disposeGroupContents = (group) => { /* ... (code interne inchangé) ... */ if (!group) return; while (group.children.length > 0) { const c = group.children[0]; group.remove(c); const isBaseHouseGeo = Object.values(this.baseHouseGeometries).includes(c.geometry); const isBaseStripeGeo = c.geometry === this.stripeBaseGeometry; let isLoadedAssetGeo = false; if (this.assetLoader) { for (const type in this.assetLoader.assets) { if (this.assetLoader.assets[type].some(a => a.geometry === c.geometry)) { isLoadedAssetGeo = true; break; } } } if (c.geometry && !isBaseHouseGeo && !isBaseStripeGeo && !isLoadedAssetGeo) { c.geometry.dispose(); } } };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);

        // --- Redéfinition Géométries/Matériaux de Base (inchangé) ---
        this.defineHouseBaseMaterials(); // Redéfinit les matériaux
        this.defineHouseBaseGeometries(); // Recrée les géométries de base
    }

    // ==============================================================
    // --- calculateInstanceMatrix (Inchangée) ---
    // Recalcule la matrice pour une instance d'asset chargé (pas maison proc.)
    // ==============================================================
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0) {
        const instanceMatrix = new THREE.Matrix4();
        // 1. Échelle finale (combine fitting et user scale)
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        // 2. Rotation (autour de Y)
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY);
        // 3. Re-centrage (annule le centrage fait dans l'AssetLoader)
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        // 4. Positionnement final
        const finalHeight = heightAfterFitting * userScale;
        // Positionne le *bas* de la BBox au niveau du sol de la parcelle (plotGroundY)
        const finalY = finalHeight / 2 + (this.config.plotGroundY ?? 0.005); // Utilise plotGroundY si défini, sinon 0.005
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalY, centerZ);

        // Application des transformations: Scale -> Rotate -> Recenter -> Translate
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(finalTranslationMatrix);

        return instanceMatrix;
    }

    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh (maison L-shape grille/scalée + assets)...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        // Vider le groupe avant de le remplir
        while (this.buildingGroup.children.length > 0) {
            this.buildingGroup.remove(this.buildingGroup.children[0]);
        }

        // --- 1. Maison L-shape ---
        const houseDataType = 'house';
        if (this.instanceData[houseDataType]) {
            for (const partName in this.instanceData[houseDataType]) {
                if (this.instanceData[houseDataType].hasOwnProperty(partName)) {
                    const matrices = this.instanceData[houseDataType][partName];
                    const geometry = this.baseHouseGeometries[partName];
                    let material = null;
                    if (partName.startsWith('base_')) { material = this.baseHouseMaterials[partName]; }
                    else if (partName === 'roof') { material = this.baseHouseMaterials.roof; }
                    else if (partName === 'door') { material = this.baseHouseMaterials.door; }
                    else if (partName === 'garageDoor') { material = this.baseHouseMaterials.garageDoor; }
                    else if (partName === 'windowXY' || partName === 'windowYZ') { material = this.baseHouseMaterials.window; }
                    else { material = this.baseHouseMaterials[partName]; if (!material) console.warn(`[InstancedMesh] Matériau non trouvé pour la partie maison: ${partName}`); }

                    if (geometry && material && matrices && matrices.length > 0) {
                        const count = matrices.length;
                        const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                        instancedMesh.name = `NewHouse_${partName}_Instanced`;
                        instancedMesh.castShadow = true; instancedMesh.receiveShadow = true;
                        matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); });
                        instancedMesh.instanceMatrix.needsUpdate = true;
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++; totalInstancesCreated += count;
                    } else if (!matrices || matrices.length === 0) { /* Cas normal */ }
                    else { if (!geometry) console.warn(`[InstancedMesh] Géométrie manquante pour la partie maison: ${partName}`); if (!material) console.warn(`[InstancedMesh] Matériau manquant pour la partie maison: ${partName}`); }
                }
            }
        }

        // --- 2. Autres Assets (Building, Industrial, Park, Tree, Skyscraper, Crosswalk) ---
        if (!this.assetLoader && !this.stripeBaseGeometry) {
             console.warn("[InstancedMesh] AssetLoader et stripeBaseGeometry non disponibles pour les autres types.");
        }

        // Boucle sur les types (sauf 'house')
        for (const type in this.instanceData) {
             if (type === houseDataType || !this.instanceData.hasOwnProperty(type)) continue;

             // >>> AJOUT DEBUG POUR PARK <<<
             if(type === 'park'){
                 console.log(`[InstancedMesh Debug] Traitement du type 'park'. Données:`, this.instanceData[type]);
             }
             // >>> FIN DEBUG <<<

             // Boucle sur les modelId
             for (const modelId in this.instanceData[type]) {
                 if (!this.instanceData[type].hasOwnProperty(modelId)) continue;

                 const matrices = this.instanceData[type][modelId];
                 if (matrices && matrices.length > 0) {
                     let geometry = null;
                     let material = null;
                     let castShadow = true;
                     let receiveShadow = true;

                     // >>> AJOUT DEBUG POUR PARK <<<
                     if(type === 'park'){
                        console.log(`[InstancedMesh Debug - Park] Préparation mesh pour modelId: ${modelId} avec ${matrices.length} instance(s).`);
                     }
                     // >>> FIN DEBUG <<<

                     // Déterminer la géométrie et le matériau
                     if (type === 'crosswalk') {
                         if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) {
                             geometry = this.stripeBaseGeometry; material = this.materials.crosswalkMaterial; castShadow = false; receiveShadow = true;
                         } else { console.warn(`[InstancedMesh] Géométrie/matériau manquant pour crosswalk.`); continue; }
                     } else if (this.assetLoader) {
                         const assetData = this.assetLoader.getAssetDataById(modelId);
                         // >>> AJOUT DEBUG POUR PARK <<<
                         if(type === 'park'){
                            console.log(`[InstancedMesh Debug - Park] AssetData trouvé pour ${modelId}:`, assetData ? 'Oui' : 'Non');
                            if(assetData) console.log(`   -> Geometry valid: ${!!assetData.geometry}, Material valid: ${!!assetData.material}`);
                         }
                         // >>> FIN DEBUG <<<
                         if (assetData && assetData.geometry && assetData.material) {
                             geometry = assetData.geometry; material = assetData.material;
                         } else { console.warn(`[InstancedMesh] Données asset ${modelId} (type ${type}) invalides ou non trouvées.`); continue; }
                     } else { console.warn(`[InstancedMesh] AssetLoader manquant pour type '${type}'.`); continue; }

                     // Créer l'InstancedMesh
                     if (!geometry) { console.error(`[InstancedMesh] ERREUR CRITIQUE: Géométrie est null/undefined pour ${type} - ${modelId}`); continue; }
                     if (!material) { console.error(`[InstancedMesh] ERREUR CRITIQUE: Matériau est null/undefined pour ${type} - ${modelId}`); continue; }

                     const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
                     matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); });
                     instancedMesh.instanceMatrix.needsUpdate = true;
                     instancedMesh.castShadow = castShadow;
                     instancedMesh.receiveShadow = receiveShadow;
                     instancedMesh.name = `${type}_${modelId}_Instanced`;

                      // >>> AJOUT DEBUG POUR PARK <<<
                      if(type === 'park'){
                         console.log(`[InstancedMesh Debug - Park] InstancedMesh créé et ajouté pour ${instancedMesh.name}`);
                      }
                      // >>> FIN DEBUG <<<

                     this.buildingGroup.add(instancedMesh);
                     instancedMeshCount++;
                     totalInstancesCreated += matrices.length;
                 } else if (type === 'park') { // DEBUG spécifique si pas de matrices pour un modelId de parc
                     console.log(`[InstancedMesh Debug - Park] Aucune matrice trouvée pour modelId: ${modelId}`);
                 }
             } // Fin boucle modelId
        } // Fin boucle type

        if (instancedMeshCount > 0) {
            console.log(`InstancedMesh: ${instancedMeshCount} mesh(es) pour ${totalInstancesCreated} instances créés au total.`);
        } else {
            console.log("Aucune instance à créer via InstancedMesh.");
        }
    }

    // --- createPlotGround ---
    createPlotGround(plot, groundY = 0.01) { // Ajout paramètre groundY avec valeur par défaut
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        let groundMaterial;
        if (plot.zoneType === 'park') {
            groundMaterial = this.materials.parkMaterial;
        } else {
            groundMaterial = this.materials.buildingGroundMaterial;
        }
        const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        // Utilise le paramètre groundY pour la position Y
        groundMesh.position.set(plot.center ? plot.center.x : plot.x + plot.width / 2, groundY, plot.center ? plot.center.z : plot.z + plot.depth / 2);
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;
        this.buildingGroup.add(groundMesh);
    }

    // --- subdivideForPlacement ---
    subdivideForPlacement(plot) {
        let minSubZoneSize; switch (plot.zoneType) { case 'house': minSubZoneSize = this.config.minHouseSubZoneSize; break; case 'building': minSubZoneSize = this.config.minBuildingSubZoneSize; break; case 'industrial': minSubZoneSize = this.config.minIndustrialSubZoneSize; break; case 'park': minSubZoneSize = this.config.minParkSubZoneSize; break; case 'skyscraper': minSubZoneSize = this.config.minSkyscraperSubZoneSize; break; default: minSubZoneSize = 10; } minSubZoneSize = Math.max(minSubZoneSize, 1);
        if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) { return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }]; }
        if (plot.width < minSubZoneSize) { let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize)); const subDepth = plot.depth / numRows; const subZones = []; for (let j = 0; j < numRows; j++) { subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth }); } return subZones; }
        if (plot.depth < minSubZoneSize) { let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize)); const subWidth = plot.width / numCols; const subZones = []; for (let i = 0; i < numCols; i++) { subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth }); } return subZones; }
        let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize)); let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize)); const subZones = []; const subWidth = plot.width / numCols; const subDepth = plot.depth / numRows; for (let i = 0; i < numCols; i++) { for (let j = 0; j < numRows; j++) { subZones.push({ x: plot.x + i * subWidth, z: plot.z + j * subDepth, width: subWidth, depth: subDepth }); } } return subZones;
    }
}
