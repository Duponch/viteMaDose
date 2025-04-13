// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class PlotContentGenerator {
    // --- MODIFIÉ : Ajout cityManager ref ---
	constructor(config, materials, debugPlotGridMaterial) {
        this.config = config;
        this.materials = materials;
        this.sidewalkGroup = new THREE.Group(); this.sidewalkGroup.name = "Sidewalks";
        this.buildingGroup = new THREE.Group(); this.buildingGroup.name = "PlotContents";
        this.assetLoader = null;
        this.instanceData = {}; // For non-house assets + crosswalks
        this.stripeBaseGeometry = null;
        this.cityManager = null; // Will be set in generateContent
        this.navigationGraph = null; // Will be set in generateContent
        this.debugPlotGridGroup = null; // <-- NEW: Reference to debug group
        this.debugPlotGridMaterial = debugPlotGridMaterial ?? new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }); // <-- NEW: Debug material (with fallback)

        // --- Procedural House Section (Unchanged structure) ---
        this.baseHouseGeometries = {};
        this.baseHouseMaterials = {};
        this.houseInstanceMatrices = {};
        this.houseInstancedMeshes = {};
        this.defineHouseBaseMaterials();
        this.defineHouseBaseGeometries();
        this.initializeHouseMatrixArrays();
        // ---------------------------------

        console.log("PlotContentGenerator initialized (grid logic for houses).");
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
    // Fonction 2 : defineHouseBaseGeometries (MODIFIÉE - Ajout computeVertexNormals)
    // ==============================================================
    defineHouseBaseGeometries() {
        // console.log("Création des géométries de base pour la maison L-shape..."); // Log légèrement ajusté
        this.baseHouseGeometries = {};

        // --- Dimensions ---
        // Note: Ces dimensions définissent le modèle LOCAL.
        // Le scaling global sera appliqué plus tard.
        const armLength = 2; const armWidth = 1; const armDepth = 0.5; // Hauteur mur = armDepth
        const roofPitchHeight = 0.3; const roofOverhang = 0.08;
        const doorHeight = 0.7 * armDepth; const doorWidth = 0.3; const doorDepth = 0.05; // Épaisseur porte
        const garageDoorHeight = 0.8 * armDepth; const garageDoorWidth = 0.55;
        const windowHeight = 0.4 * armDepth; const windowWidth = 0.2; const windowDepth = doorDepth; // Épaisseur fenêtre

        // --- Géométries Bases ---
        // Origine locale est au coin intérieur du L.
        // base_part1 s'étend le long de +X (length) et +Z (width)
        // base_part2 s'étend le long de +Z (length) et +X (width)
        this.baseHouseGeometries.base_part1 = new THREE.BoxGeometry(armLength, armDepth, armWidth);
        this.baseHouseGeometries.base_part1.translate(armLength / 2, armDepth / 2, armWidth / 2); // Centre la pièce localement
        this.baseHouseGeometries.base_part2 = new THREE.BoxGeometry(armWidth, armDepth, armLength);
        this.baseHouseGeometries.base_part2.translate(armWidth / 2, armDepth / 2, armLength / 2); // Centre la pièce localement
        // Stocker la hauteur pour le calcul Y plus tard
        this.baseHouseGeometries.base_part1.userData = { height: armDepth, minY: 0 }; // MinY = 0 après translation
        this.baseHouseGeometries.base_part2.userData = { height: armDepth, minY: 0 }; // MinY = 0 après translation
        // console.log(" -> Géométries bases créées et centrées localement.");

        // --- Géométrie Toit ---
        const roofShape = new THREE.Shape();
        const triangleBase = armWidth + 2 * roofOverhang;
        roofShape.moveTo(-triangleBase / 2, 0); roofShape.lineTo(triangleBase / 2, 0);
        roofShape.lineTo(0, roofPitchHeight); roofShape.lineTo(-triangleBase / 2, 0);
        const extrudeSettings = { depth: armLength + 2 * roofOverhang, bevelEnabled: false };
        this.baseHouseGeometries.roof = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
        this.baseHouseGeometries.roof.center(); // Centre la géométrie extrudée
        this.baseHouseGeometries.roof.computeVertexNormals(); // Recalcul explicite des normales
        // console.log(" -> Géométrie toit (Extrude) créée, centrée et normales recalculées.");

        // --- Géométries Portes (fines) ---
        // Centrées localement
        this.baseHouseGeometries.door = new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth);
        this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(doorDepth, garageDoorHeight, garageDoorWidth);
        // console.log(" -> Géométries portes créées et centrées localement.");

        // --- Géométries Fenêtres (fines) ---
        // Centrées localement
        this.baseHouseGeometries.windowYZ = new THREE.BoxGeometry(windowDepth, windowHeight, windowWidth); // Pour faces X+/-
        this.baseHouseGeometries.windowXY = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth); // Pour faces Z+/-
        // console.log(" -> Géométries fenêtres créées et centrées localement.");
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

	// ==============================================================
    // Fonction 3 : generatePlotPrimaryContent (MODIFIÉE - Centrage basé sur l'empreinte carrée)
    // ==============================================================
    generatePlotPrimaryContent(plot) {
        if (!this.cityManager || !this.navigationGraph) {
            console.error(`PlotContentGenerator: CityManager ou NavigationGraph manquant pour plot ${plot.id}.`);
            return;
        }

        // --- CAS 'house' ---
        if (plot.zoneType === 'house') {
            this.createPlotGround(plot);

            if (!this.baseHouseGeometries.base_part1?.userData) {
                console.warn(`PlotContentGenerator: Composants maison (L-shape) non prêts pour plot ${plot.id}.`);
                return;
            }

            // --- Configuration Grille et Cellules (inchangé) ---
            const houseGridW = this.config.fixedHouseGridWidth ?? 10;
            const houseGridD = this.config.fixedHouseGridDepth ?? 10;
            const spacing = this.config.fixedHouseGridSpacing ?? 8;
            const gridScale = this.navigationGraph.gridScale ?? 1.0;
            const gridCellSize = 1.0 / gridScale;
            const plotBounds = plot.getBounds();
            const minGridPoint = this.navigationGraph.worldToGrid(plotBounds.minX, plotBounds.minZ);
            const maxGridPoint = this.navigationGraph.worldToGrid(plotBounds.maxX, plotBounds.maxZ);
            const minGx = minGridPoint.x; const minGy = minGridPoint.y;
            const maxGx = maxGridPoint.x; const maxGy = maxGridPoint.y;
            const plotGridW = maxGx - minGx + 1; const plotGridD = maxGy - minGy + 1;
            if (plotGridW <= 0 || plotGridD <= 0) return;
            const maxPossibleX = Math.max(0, Math.floor((plotGridW + spacing) / (houseGridW + spacing)));
            const maxPossibleY = Math.max(0, Math.floor((plotGridD + spacing) / (houseGridD + spacing)));
            let numHousesX = maxPossibleX; let numHousesY = maxPossibleY;
            if (numHousesX <= 0 || numHousesY <= 0) return;
            const totalGridWidthNeeded = numHousesX * houseGridW + Math.max(0, numHousesX - 1) * spacing;
            const totalGridDepthNeeded = numHousesY * houseGridD + Math.max(0, numHousesY - 1) * spacing;
            const offsetX = Math.floor((plotGridW - totalGridWidthNeeded) / 2);
            const offsetY = Math.floor((plotGridD - totalGridDepthNeeded) / 2);
            const startGx = minGx + offsetX; const startGy = minGy + offsetY;
            const groundLevel = 0.01;
            // --- Fin Configuration Grille ---

            // --- Dimensions modèle LOCAL L pour référence ---
            const armLength = 2.0; // Dimension X/Z de l'empreinte carrée englobante
            const armWidth = 1.0;
            const armDepth = 0.5;  // Hauteur mur
            const roofPitchHeight = 0.3;
            const baseModelFootprintSize = armLength; // On utilise la dimension englobante pour l'échelle

            // --- Centre de l'empreinte CARRÉE par rapport à l'origine locale (coin du L) ---
            const modelSquareCenterOffsetX = armLength / 2;
            const modelSquareCenterOffsetZ = armLength / 2;
            const modelSquareCenterLocal = new THREE.Vector3(modelSquareCenterOffsetX, 0, modelSquareCenterOffsetZ); // Offset sur le plan XZ

            let housesPlacedOnPlot = 0;

            // --- Boucle de placement ---
            for (let rowIndex = 0; rowIndex < numHousesY; rowIndex++) {
                for (let colIndex = 0; colIndex < numHousesX; colIndex++) {

                    // --- Calcul Centre Cellule et Échelle (inchangé) ---
                    const currentGx = startGx + colIndex * (houseGridW + spacing);
                    const currentGy = startGy + rowIndex * (houseGridD + spacing);
                    const centerGx = currentGx + (houseGridW / 2.0);
                    const centerGy = currentGy + (houseGridD / 2.0);
                    const worldCellCenterPos = this.navigationGraph.gridToWorld(centerGx, centerGy); // Centre de la cellule cible
                    const targetWorldWidth = houseGridW * gridCellSize;
                    const targetWorldDepth = houseGridD * gridCellSize;
                    let scaleValue = Math.min(
                        targetWorldWidth / baseModelFootprintSize,
                        targetWorldDepth / baseModelFootprintSize
                    );
                    scaleValue *= THREE.MathUtils.randFloat(0.9, 1.1);
                    scaleValue = THREE.MathUtils.clamp(scaleValue, 0.8, 4.0);
                    const baseScale = new THREE.Vector3(scaleValue, scaleValue, scaleValue);
                    // --- Fin Centre Cellule et Échelle ---

                    // --- Rotation et Position Y (inchangé) ---
                    const rotationY = Math.floor(Math.random() * 4) * Math.PI / 2;
                    const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
                    const baseYOffset = this.baseHouseGeometries.base_part1.userData.minY ?? 0;
                    const finalPosY = groundLevel - baseYOffset * scaleValue;
                    // --- Fin Rotation et Position Y ---

                    // --- **CORRECTION CENTRAGE V2 : Basé sur l'empreinte carrée** ---
                    // 1. Appliquer la rotation à l'offset du CENTRE CARRÉ local
                    const centerOffsetRotated = modelSquareCenterLocal.clone().applyQuaternion(baseQuaternion);
                    // 2. Appliquer l'échelle à cet offset rotaté
                    const centerOffsetScaledRotated = centerOffsetRotated.multiplyScalar(scaleValue);
                    // 3. La position finale de la matrice globale (qui transforme l'origine (0,0,0) du modèle)
                    //    est le centre de la cellule MOINS ce décalage calculé.
                    //    Ceci place l'origine du modèle de telle sorte que son centre carré (après rot/scale) atterrisse au centre de la cellule.
                    const finalPosition = new THREE.Vector3(
                        worldCellCenterPos.x - centerOffsetScaledRotated.x,
                        finalPosY, // La hauteur reste basée sur le sol
                        worldCellCenterPos.z - centerOffsetScaledRotated.z
                    );
                    // --- **FIN CORRECTION CENTRAGE V2** ---

                    // Création de la matrice GLOBALE pour cette instance de maison
                    const globalHouseMatrix = new THREE.Matrix4().compose(finalPosition, baseQuaternion, baseScale);

                    // --- Helper addPartInstance (inchangé) ---
                    const addPartInstance = (partName, localMatrix) => {
                         if (this.baseHouseGeometries[partName]) {
                            // La matrice finale pour l'instance de la pièce est Global * Local
                            const finalMatrix = new THREE.Matrix4().multiplyMatrices(globalHouseMatrix, localMatrix);
                            const type = 'house'; const modelId = partName;
                            if (!this.instanceData[type]) this.instanceData[type] = {};
                            if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
                            this.instanceData[type][modelId].push(finalMatrix);
                         } else { console.warn(`Géométrie manquante: ${partName}`); }
                    };

                    // --- Ajout des Parties (Utilise les positions locales RELATIVES AU COIN (0,0,0)) ---
                    // La matrice globale gère le placement correct de l'origine (0,0,0).
                    // Les matrices locales positionnent les pièces par rapport à cette origine.
                    // Les géométries elles-mêmes ont été centrées dans defineHouseBaseGeometries.
                    const doorHeight = this.baseHouseGeometries.door.parameters.height;
                    const doorDepth = this.baseHouseGeometries.door.parameters.width; // Box(depth, height, width)
                    const garageDoorHeight = this.baseHouseGeometries.garageDoor.parameters.height;
                    const windowHeight = this.baseHouseGeometries.windowXY.parameters.height;
                    const windowDepth = this.baseHouseGeometries.windowXY.parameters.depth;
                    const window_Y_pos_Base = armDepth * 0.1; // Position Y du BAS de la fenêtre, relative au sol local (0)

                    let localMatrix;

                    // Bases (Géométrie déjà translatée pour que le coin soit à 0,0,0)
                    localMatrix = new THREE.Matrix4(); // Matrice Identité
                    addPartInstance('base_part1', localMatrix);
                    localMatrix = new THREE.Matrix4(); // Matrice Identité
                    addPartInstance('base_part2', localMatrix);

                    // Toits (Géométrie centrée, besoin de translation + rotation locale)
                    const roofPosY_Center = armDepth + roofPitchHeight / 2; // Position Y du CENTRE du toit
                    const roofPos1 = new THREE.Vector3(armLength / 2, roofPosY_Center, armWidth / 2); // Centre relatif au coin 0,0,0
                    const roofPos2 = new THREE.Vector3(armWidth / 2, roofPosY_Center, armLength / 2); // Centre relatif au coin 0,0,0
                    const roofRot1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
                    const roofRot2 = new THREE.Quaternion();
                    localMatrix = new THREE.Matrix4().compose(roofPos1, roofRot1, new THREE.Vector3(1, 1, 1)); addPartInstance('roof', localMatrix);
                    localMatrix = new THREE.Matrix4().compose(roofPos2, roofRot2, new THREE.Vector3(1, 1, 1)); addPartInstance('roof', localMatrix);

                    // Porte principale (sur face +X de base_part2)
                    const doorPos = new THREE.Vector3(armWidth + doorDepth / 2, doorHeight / 2, armLength * 0.75); // Centre de la porte, relatif au coin 0,0,0
                    localMatrix = new THREE.Matrix4().makeTranslation(doorPos.x, doorPos.y, doorPos.z);
                    addPartInstance('door', localMatrix);

                    // Porte Garage (sur face +X de base_part1)
                    const garagePos = new THREE.Vector3(armLength + doorDepth / 2, garageDoorHeight / 2, armWidth * 0.5); // Centre, relatif au coin 0,0,0
                    localMatrix = new THREE.Matrix4().makeTranslation(garagePos.x, garagePos.y, garagePos.z);
                    addPartInstance('garageDoor', localMatrix);

                    // Fenêtres (Helper pour positionner le CENTRE de la fenêtre relatif au coin 0,0,0)
                    const addWindowPart = (geomKey, x, yBase, z) => {
                        // yBase est la position du BAS de la fenêtre
                        localMatrix = new THREE.Matrix4().makeTranslation(x, yBase + windowHeight / 2, z); // Positionne le CENTRE Y
                        addPartInstance(geomKey, localMatrix);
                    };
                    // Face -Z de base_part1 (x=0..L, z=0) -> Centre Z = -windowDepth/2
                    addWindowPart('windowXY', 0.25, window_Y_pos_Base, -windowDepth / 2);
                    addWindowPart('windowXY', 0.75, window_Y_pos_Base, -windowDepth / 2);
                    addWindowPart('windowXY', 1.25, window_Y_pos_Base, -windowDepth / 2);
                    addWindowPart('windowXY', 1.75, window_Y_pos_Base, -windowDepth / 2);
                    // Face +Z de base_part1 (x=0..L, z=W) -> Centre Z = W + windowDepth/2
                    addWindowPart('windowXY', 0.25, window_Y_pos_Base, armWidth + windowDepth / 2);
                    addWindowPart('windowXY', 0.75, window_Y_pos_Base, armWidth + windowDepth / 2);
                    addWindowPart('windowXY', 1.25, window_Y_pos_Base, armWidth + windowDepth / 2);
                    addWindowPart('windowXY', 1.75, window_Y_pos_Base, armWidth + windowDepth / 2);
                    // Face -X de base_part2 (z=0..L, x=0) -> Centre X = -windowDepth/2
                    addWindowPart('windowYZ', -windowDepth / 2, window_Y_pos_Base, 0.25);
                    addWindowPart('windowYZ', -windowDepth / 2, window_Y_pos_Base, 0.75);
                    addWindowPart('windowYZ', -windowDepth / 2, window_Y_pos_Base, 1.25);
                    addWindowPart('windowYZ', -windowDepth / 2, window_Y_pos_Base, 1.75);
                     // Face +X de base_part2 (z=0..L, x=W) -> Centre X = W + windowDepth/2
                     addWindowPart('windowYZ', armWidth + windowDepth / 2, window_Y_pos_Base, 0.25);
                     // addWindowPart('windowYZ', armWidth + windowDepth / 2, window_Y_pos_Base, 0.75); // Porte ici
                     addWindowPart('windowYZ', armWidth + windowDepth / 2, window_Y_pos_Base, 1.25);
                     // Face +Z de base_part2 (x=0..W, z=L) -> Centre Z = L + windowDepth/2
                     addWindowPart('windowXY', 0.25, window_Y_pos_Base, armLength + windowDepth / 2);
                     addWindowPart('windowXY', 0.75, window_Y_pos_Base, armLength + windowDepth / 2);
                    // --- Fin Ajout Parties ---

                    // --- Enregistrement & Debug (inchangé) ---
                    const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, 'house', worldCellCenterPos.clone().setY(this.config.sidewalkHeight));
                    if (registeredBuilding) { plot.addBuildingInstance({ id: registeredBuilding.id, type: 'house', position: worldCellCenterPos.clone().setY(this.config.sidewalkHeight) }); }
                    if (this.debugPlotGridGroup && this.debugPlotGridMaterial) {
                        const debugGridWorldWidth = houseGridW * gridCellSize; const debugGridWorldDepth = houseGridD * gridCellSize;
                        const debugGeom = new THREE.PlaneGeometry(debugGridWorldWidth, debugGridWorldDepth);
                        const debugMesh = new THREE.Mesh(debugGeom, this.debugPlotGridMaterial);
                        debugMesh.position.copy(worldCellCenterPos).setY(groundLevel + 0.02);
                        debugMesh.rotation.set(-Math.PI / 2, 0, 0);
                        this.debugPlotGridGroup.add(debugMesh);
                    }
                    plot.addPlacedHouseGrid({ gx: currentGx, gy: currentGy, gridWidth: houseGridW, gridDepth: houseGridD });
                    housesPlacedOnPlot++;
                } // Fin boucle colonnes
            } // Fin boucle lignes
            // --- Fin Boucle Placement ---

        // --- CAS AUTRES TYPES (Logique inchangée) ---
        } else if (plot.zoneType && ['building', 'industrial', 'park', 'skyscraper'].includes(plot.zoneType)) {
             this.createPlotGround(plot);
             const subZones = this.subdivideForPlacement(plot);
             const margin = plot.zoneType === 'park' ? 0 : (this.config.buildingSubZoneMargin ?? 1.5);
             subZones.forEach((subZone) => {
                 const buildableWidth = Math.max(0, subZone.width - margin * 2);
                 const buildableDepth = Math.max(0, subZone.depth - margin * 2);
                 if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                    const subZoneCenterX = subZone.x + subZone.width / 2;
                    const subZoneCenterZ = subZone.z + subZone.depth / 2;
                    const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);
                    if (assetInfo) {
                        const instanceMatrix = this.calculateInstanceMatrix( subZoneCenterX, subZoneCenterZ, assetInfo.sizeAfterFitting.y, assetInfo.fittingScaleFactor, assetInfo.centerOffset, assetInfo.userScale );
                        const modelId = assetInfo.id;
                        if (!this.instanceData[plot.zoneType]) this.instanceData[plot.zoneType] = {};
                        if (!this.instanceData[plot.zoneType][modelId]) this.instanceData[plot.zoneType][modelId] = [];
                        this.instanceData[plot.zoneType][modelId].push(instanceMatrix.clone());
                        const buildingPosition = new THREE.Vector3(subZoneCenterX, this.config.sidewalkHeight, subZoneCenterZ);
                        const buildingType = plot.zoneType;
                        const registeredBuilding = this.cityManager.registerBuildingInstance( plot.id, buildingType, buildingPosition );
                        if (registeredBuilding) { plot.addBuildingInstance({ id: registeredBuilding.id, type: buildingType, position: buildingPosition.clone() }); }
                    } else { console.warn(`Aucun asset trouvé pour le type ${plot.zoneType} dans la sous-zone de plot ${plot.id}`); }
                    if (!plot.occupiedSubZones) plot.occupiedSubZones = [];
                    plot.occupiedSubZones.push({ x: subZone.x + margin, z: subZone.z + margin, width: buildableWidth, depth: buildableDepth });
                 }
             });
        }
    } // Fin generatePlotPrimaryContent

    // Place les arbres sur la parcelle selon le type de zone et des probabilités configurées
    placeTreesForPlot(plot) {
        if (!this.assetLoader || !this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) { return; }
        const probSidewalk = this.config.treePlacementProbabilitySidewalk; const probPark = this.config.treePlacementProbabilityPark; const probMargin = this.config.treePlacementProbabilityMargin; const sidewalkW = this.config.sidewalkWidth;
        if (sidewalkW > 0 && probSidewalk > 0) {
            const corners = [ { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 }, { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 }, { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }, { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 } ]; corners.forEach(corner => { if (Math.random() < probSidewalk) { this.addTreeInstance(corner.x, corner.z); } });
        }
        const plotBounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth, };
        if (plot.zoneType === 'park' && probPark > 0) {
            const area = plot.width * plot.depth; const numTreesToTry = Math.ceil(area * probPark); for (let i = 0; i < numTreesToTry; i++) { const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX); const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ); this.addTreeInstance(treeX, treeZ); }
        } else if (['house', 'building', 'industrial', 'skyscraper'].includes(plot.zoneType) && probMargin > 0) {
            const area = plot.width * plot.depth; const occupiedArea = (plot.occupiedSubZones || []).reduce((acc, sz) => acc + (sz.width * sz.depth), 0); const marginArea = Math.max(0, area - occupiedArea); const numTreesToTry = Math.ceil(marginArea * probMargin);
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX); const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ); let isOccupied = false;
                if (plot.occupiedSubZones) { for (const sz of plot.occupiedSubZones) { if (treeX >= sz.x && treeX <= sz.x + sz.width && treeZ >= sz.z && treeZ <= sz.z + sz.depth) { isOccupied = true; break; } } }
                if (!isOccupied) { this.addTreeInstance(treeX, treeZ); }
            }
        }
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
        this.navigationGraph = null; // Reset NavGraph ref
        this.debugPlotGridGroup = null; // <-- NEW: Reset debug group ref
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {}, crosswalk: {} };

        // Cleanup procedural houses
        Object.values(this.baseHouseGeometries).forEach(geom => geom?.dispose());
        this.baseHouseGeometries = {};
        // Do not dispose base materials here as they are redefined
        // this.baseHouseMaterials = {}; // Clear container
        this.initializeHouseMatrixArrays(); // Clear matrices
        this.houseInstancedMeshes = {}; // Clear mesh references

        // Cleanup scene groups (dynamically added geometries and meshes)
        const disposeGroupContents = (group) => {
            if (!group) return;
            while (group.children.length > 0) {
                const c = group.children[0];
                group.remove(c);
                // Dispose only if geometry is NOT one of the BASE geometries (house, stripe, loaded asset)
                const isBaseHouseGeo = Object.values(this.baseHouseGeometries).includes(c.geometry);
                const isBaseStripeGeo = c.geometry === this.stripeBaseGeometry;
                let isLoadedAssetGeo = false;
                if (this.assetLoader) {
                    for (const type in this.assetLoader.assets) {
                        if (this.assetLoader.assets[type].some(a => a.geometry === c.geometry)) {
                            isLoadedAssetGeo = true;
                            break;
                        }
                    }
                }
                if (c.geometry && !isBaseHouseGeo && !isBaseStripeGeo && !isLoadedAssetGeo) {
                    c.geometry.dispose();
                }
                // Do not dispose materials here as they are either shared (this.materials), managed by AssetLoader, or base house materials (this.baseHouseMaterials)
            }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);

        // Dispose base geometry specific to this generator
        if (this.stripeBaseGeometry) {
            this.stripeBaseGeometry.dispose();
            this.stripeBaseGeometry = null;
        }

        // Redefine base materials/geometries for the next generation
        this.defineHouseBaseMaterials(); // Ensures materials exist for next time
        this.defineHouseBaseGeometries();
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
        // On applique l'inverse de l'offset du centre de la BBox de la géométrie chargée
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        // 4. Positionnement final
        // La hauteur finale est la hauteur après fitting * userScale
        const finalHeight = heightAfterFitting * userScale;
        // Positionne le *bas* de la BBox (qui est à -finalHeight/2 après recentrage) au niveau du sol (légèrement au-dessus)
        const finalY = finalHeight / 2 + 0.05; // 0.05 pour éviter z-fighting
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalY, centerZ);

        // Application des transformations: Scale -> Rotate -> Recenter -> Translate
        // Note: l'ordre de multiplication est important (dernière opération appliquée en premier)
        // instanceMatrix = finalTranslationMatrix * rotationMatrix * scaleMatrix * recenterMatrix; // Ordre logique inverse
        // Ordre THREE.js (multiplication à droite):
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix); // Scale puis recentre (objet à l'origine, scalé)
        instanceMatrix.premultiply(rotationMatrix); // Applique la rotation à l'objet scalé/recentré
        instanceMatrix.premultiply(finalTranslationMatrix); // Translaté l'objet final

        return instanceMatrix;
    }

    // ==============================================================
    // --- createInstancedMeshesFromData (Inchangée) ---
    // Crée les InstancedMesh à partir des matrices collectées
    // ==============================================================
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

                    // Sélection du matériau basé sur le nom de la partie
                    if (partName.startsWith('base_')) { material = this.baseHouseMaterials[partName]; }
                    else if (partName === 'roof') { material = this.baseHouseMaterials.roof; }
                    else if (partName === 'door') { material = this.baseHouseMaterials.door; }
                    else if (partName === 'garageDoor') { material = this.baseHouseMaterials.garageDoor; }
                    else if (partName === 'windowXY' || partName === 'windowYZ') { material = this.baseHouseMaterials.window; }
                    else { material = this.baseHouseMaterials[partName]; /* Fallback si d'autres pièces */ if (!material) console.warn(`[InstancedMesh] Matériau non trouvé pour la partie maison: ${partName}`); }

                    if (geometry && material && matrices && matrices.length > 0) {
                        const count = matrices.length;
                        const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                        instancedMesh.name = `NewHouse_${partName}_Instanced`;
                        instancedMesh.castShadow = true; instancedMesh.receiveShadow = true;
                        matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); });
                        instancedMesh.instanceMatrix.needsUpdate = true;
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++; totalInstancesCreated += count;
                    } else if (!matrices || matrices.length === 0) { /* Cas normal si aucune instance de cette partie */ }
                    else {
                        // Log plus détaillé si qqch manque alors qu'il y a des matrices
                        if (!geometry) console.warn(`[InstancedMesh] Géométrie manquante pour la partie maison: ${partName}`);
                        if (!material) console.warn(`[InstancedMesh] Matériau manquant pour la partie maison: ${partName}`);
                    }
                }
            }
        }

        // --- 2. Autres Assets (Building, Industrial, Park, Tree, Skyscraper, Crosswalk) ---
        if (!this.assetLoader && !this.stripeBaseGeometry) {
             console.warn("[InstancedMesh] AssetLoader et stripeBaseGeometry non disponibles pour les autres types.");
        }

        // Boucle sur les types (sauf 'house' déjà traité)
        for (const type in this.instanceData) {
             if (type === houseDataType || !this.instanceData.hasOwnProperty(type)) continue;

             // Boucle sur les modelId (assets spécifiques ou 'default_crosswalk_stripe')
             for (const modelId in this.instanceData[type]) {
                 if (!this.instanceData[type].hasOwnProperty(modelId)) continue;

                 const matrices = this.instanceData[type][modelId];
                 if (matrices && matrices.length > 0) {
                     let geometry = null;
                     let material = null;
                     let castShadow = true;
                     let receiveShadow = true;

                     // Déterminer la géométrie et le matériau
                     if (type === 'crosswalk') {
                         if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) {
                             geometry = this.stripeBaseGeometry;
                             material = this.materials.crosswalkMaterial;
                             castShadow = false; receiveShadow = true;
                         } else {
                             console.warn(`[InstancedMesh] Géométrie/matériau manquant pour crosswalk.`);
                             continue; // Skip ce modelId
                         }
                     } else if (this.assetLoader) {
                         // Pour les autres types, chercher l'asset chargé
                         const assetData = this.assetLoader.getAssetDataById(modelId);
                         if (assetData && assetData.geometry && assetData.material) {
                             geometry = assetData.geometry;
                             material = assetData.material;
                             // Ombres par défaut pour les assets
                         } else {
                             console.warn(`[InstancedMesh] Données asset ${modelId} (type ${type}) invalides ou non trouvées.`);
                             continue; // Skip ce modelId
                         }
                     } else {
                         console.warn(`[InstancedMesh] AssetLoader manquant pour type '${type}'.`);
                         continue; // Skip ce type si pas de loader
                     }

                     // Créer l'InstancedMesh
                     const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
                     matrices.forEach((matrix, index) => {
                         instancedMesh.setMatrixAt(index, matrix);
                     });
                     instancedMesh.instanceMatrix.needsUpdate = true;
                     instancedMesh.castShadow = castShadow;
                     instancedMesh.receiveShadow = receiveShadow;
                     instancedMesh.name = `${type}_${modelId}_Instanced`;
                     this.buildingGroup.add(instancedMesh);
                     instancedMeshCount++;
                     totalInstancesCreated += matrices.length;
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
    createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth); let groundMaterial; if (plot.zoneType === 'park') { groundMaterial = this.materials.parkMaterial; } else { groundMaterial = this.materials.buildingGroundMaterial; } const groundMesh = new THREE.Mesh(groundGeom, groundMaterial); groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.set(plot.center ? plot.center.x : plot.x + plot.width / 2, 0.2, plot.center ? plot.center.z : plot.z + plot.depth / 2); groundMesh.receiveShadow = true; groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`; this.buildingGroup.add(groundMesh);
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
