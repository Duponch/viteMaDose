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
    // Fonction 1 : defineHouseBaseMaterials (INCHANGÉE depuis la dernière réponse)
    // ==============================================================
    defineHouseBaseMaterials() {
        console.log("Définition des matériaux de base pour la nouvelle maison (L-shape)...");
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
        console.log("Création des géométries de base pour la nouvelle maison (L-shape)...");
        this.baseHouseGeometries = {};

        // --- Dimensions ---
        const armLength = 2; const armWidth = 1; const armDepth = 0.5;
        const roofPitchHeight = 0.3; const roofOverhang = 0.08;
        const doorHeight = 0.7 * armDepth; const doorWidth = 0.3; const doorDepth = 0.05;
        const garageDoorHeight = 0.8 * armDepth; const garageDoorWidth = 0.55;
        const windowHeight = 0.4 * armDepth; const windowWidth = 0.2; const windowDepth = doorDepth;

        // --- Géométries Bases ---
        this.baseHouseGeometries.base_part1 = new THREE.BoxGeometry(armLength, armDepth, armWidth);
        this.baseHouseGeometries.base_part2 = new THREE.BoxGeometry(armWidth, armDepth, armLength);
        this.baseHouseGeometries.base_part1.userData = { height: armDepth, minY: -armDepth / 2 };
        this.baseHouseGeometries.base_part2.userData = { height: armDepth, minY: -armDepth / 2 };
        console.log(" -> Géométries bases créées.");

        // --- Géométrie Toit ---
        const roofShape = new THREE.Shape();
        const triangleBase = armWidth + 2 * roofOverhang;
        roofShape.moveTo(-triangleBase / 2, 0); roofShape.lineTo(triangleBase / 2, 0);
        roofShape.lineTo(0, roofPitchHeight); roofShape.lineTo(-triangleBase / 2, 0);
        const extrudeSettings = { depth: armLength + 2 * roofOverhang, bevelEnabled: false };
        this.baseHouseGeometries.roof = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
        this.baseHouseGeometries.roof.center();
        // *** MODIFICATION ICI ***
        this.baseHouseGeometries.roof.computeVertexNormals(); // Recalcul explicite des normales
        // *** FIN MODIFICATION ***
        console.log(" -> Géométrie toit (Extrude) créée et normales recalculées.");

        // --- Géométries Portes ---
        this.baseHouseGeometries.door = new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth);
        this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(doorDepth, garageDoorHeight, garageDoorWidth);
        console.log(" -> Géométries portes créées.");

        // --- Géométries Fenêtres ---
        this.baseHouseGeometries.windowYZ = new THREE.BoxGeometry(windowDepth, windowHeight, windowWidth);
        this.baseHouseGeometries.windowXY = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth);
        console.log(" -> Géométries fenêtres créées.");
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
    // Fonction 3 : generatePlotPrimaryContent (MODIFIÉE - Scaling + Centrage affiné)
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
            const plotGridW = maxGx - minGx + 1;
            const plotGridD = maxGy - minGy + 1;

            if (plotGridW <= 0 || plotGridD <= 0) return;

            const maxPossibleX = Math.max(0, Math.floor((plotGridW + spacing) / (houseGridW + spacing)));
            const maxPossibleY = Math.max(0, Math.floor((plotGridD + spacing) / (houseGridD + spacing)));
            let numHousesX = maxPossibleX;
            let numHousesY = maxPossibleY;

            if (numHousesX <= 0 || numHousesY <= 0) return;

            const totalGridWidthNeeded = numHousesX * houseGridW + Math.max(0, numHousesX - 1) * spacing;
            const totalGridDepthNeeded = numHousesY * houseGridD + Math.max(0, numHousesY - 1) * spacing;
            const offsetX = Math.floor((plotGridW - totalGridWidthNeeded) / 2);
            const offsetY = Math.floor((plotGridD - totalGridDepthNeeded) / 2);
            const startGx = minGx + offsetX;
            const startGy = minGy + offsetY;

            let housesPlacedOnPlot = 0;
            const groundLevel = 0.01;

            // --- Dimensions modèle L pour scaling ---
            const armLength = 2.0; // Dimension de base du modèle
            // *** AJUSTEMENT POUR SCALING ***
            // Utiliser une valeur plus petite ici fera paraître la maison plus grande
            // car scaleValue = targetSize / baseSize.
            const baseModelSizeForScaling = armLength * 0.8; // Ex: considérer que la base est 80% de armLength
            // *** FIN AJUSTEMENT ***

            for (let rowIndex = 0; rowIndex < numHousesY; rowIndex++) {
                for (let colIndex = 0; colIndex < numHousesX; colIndex++) {

                    const currentGx = startGx + colIndex * (houseGridW + spacing);
                    const currentGy = startGy + rowIndex * (houseGridD + spacing);
                    const centerGx = currentGx + (houseGridW / 2.0);
                    const centerGy = currentGy + (houseGridD / 2.0);
                    const worldCellCenterPos = this.navigationGraph.gridToWorld(centerGx, centerGy); // Centre de la cellule

                    // --- Calcul de l'échelle ---
                    const targetWorldWidth = houseGridW * gridCellSize;
                    const targetWorldDepth = houseGridD * gridCellSize;
                    let scaleValue = Math.min(
                        targetWorldWidth / baseModelSizeForScaling, // Utilise la taille réduite
                        targetWorldDepth / baseModelSizeForScaling  // Utilise la taille réduite
                    );
                    scaleValue *= THREE.MathUtils.randFloat(0.9, 1.1); // Variation +/- 10%
                    // *** AJUSTEMENT CLAMP ***
                    scaleValue = THREE.MathUtils.clamp(scaleValue, 0.8, 4.0); // Permet une échelle plus grande
                    // *** FIN AJUSTEMENT ***
                    const baseScale = new THREE.Vector3(scaleValue, scaleValue, scaleValue);

                    // --- Rotation ---
                    const rotationY = Math.floor(Math.random() * 4) * Math.PI / 2;
                    const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);

                    // --- Positionnement (Centrage affiné) ---
                    const armDepthBase = this.baseHouseGeometries.base_part1.userData.height ?? 0.5;
                    const baseYOffset = this.baseHouseGeometries.base_part1.userData.minY ?? -armDepthBase / 2;
                    const finalPosY = groundLevel - baseYOffset * scaleValue;

                    // *** AJUSTEMENT CENTRAGE ***
                    // Le modèle L est défini avec son coin "intérieur" à l'origine (0,0,0)
                    // et s'étend principalement vers X+ et Z+. Son centre visuel est proche de (armLength/2, Y, armLength/2).
                    // Pour le centrer dans la cellule `worldCellCenterPos`, nous devons translater
                    // l'origine du modèle par (-armLength/2, 0, -armLength/2) AVANT d'appliquer la rotation/échelle.
                    // Correction : On applique la translation après la composition initiale.
                    // La position de la matrice globale sera le centre de la cellule.
                    // Les pièces sont ajoutées relativement à une origine (0,0,0).
                    // Donc, la matrice globale EST correcte si les pièces sont bien définies / translatées localement.
                    // L'erreur précédente venait peut-être du scaling.
                    // Gardons la position de base au centre de la cellule.
                    const basePosition = new THREE.Vector3(worldCellCenterPos.x, finalPosY, worldCellCenterPos.z);
                    // *** FIN AJUSTEMENT ***

                    // --- Matrice GLOBALE ---
                    const globalHouseMatrix = new THREE.Matrix4().compose(basePosition, baseQuaternion, baseScale);

                    // --- Helper addPartInstance (inchangé) ---
                    const addPartInstance = (partName, localMatrix) => {
                         if (this.baseHouseGeometries[partName]) {
                            const finalMatrix = new THREE.Matrix4().multiplyMatrices(globalHouseMatrix, localMatrix);
                            const type = 'house'; const modelId = partName;
                            if (!this.instanceData[type]) this.instanceData[type] = {};
                            if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
                            this.instanceData[type][modelId].push(finalMatrix);
                         } else { console.warn(`Géométrie manquante: ${partName}`); }
                    };

                    // --- Ajout des Parties (Positions locales inchangées) ---
                    const armWidth = 1; const armDepth = 0.5;
                    const roofPitchHeight = 0.3; const doorHeight = 0.7 * armDepth; const doorWidth = 0.3;
                    const doorDepth = 0.05; const garageDoorHeight = 0.8 * armDepth; const garageDoorWidth = 0.55;
                    const windowHeight = 0.4 * armDepth; const windowWidth = 0.2; const windowDepth = doorDepth;
                    const window_Y_pos_Relative = armDepth * 0.6;

                    const base1_Pos = new THREE.Vector3(armLength/2, armDepth/2, armWidth/2); const base2_Pos = new THREE.Vector3(armWidth/2, armDepth/2, armLength/2);
                    const roofPosY_Center = armDepth + roofPitchHeight/2; const roofPos1 = new THREE.Vector3(armLength/2, roofPosY_Center, armWidth/2); const roofPos2 = new THREE.Vector3(armWidth/2, roofPosY_Center, armLength/2);
                    const roofRotY_1 = Math.PI/2; const roofRot1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), roofRotY_1); const roofRot2 = new THREE.Quaternion();
                    const door1_Z_pos = (armWidth+armLength)/2; const door1_Pos = new THREE.Vector3(armWidth+doorDepth/2, doorHeight/2, door1_Z_pos);
                    const garageDoor_Pos = new THREE.Vector3(armLength+doorDepth/2, garageDoorHeight/2, armWidth/2);

                    let localMatrix = new THREE.Matrix4().makeTranslation(base1_Pos.x, base1_Pos.y, base1_Pos.z); addPartInstance('base_part1', localMatrix);
                    localMatrix = new THREE.Matrix4().makeTranslation(base2_Pos.x, base2_Pos.y, base2_Pos.z); addPartInstance('base_part2', localMatrix);
                    localMatrix = new THREE.Matrix4().compose(roofPos1, roofRot1, new THREE.Vector3(1,1,1)); addPartInstance('roof', localMatrix);
                    localMatrix = new THREE.Matrix4().compose(roofPos2, roofRot2, new THREE.Vector3(1,1,1)); addPartInstance('roof', localMatrix);
                    localMatrix = new THREE.Matrix4().makeTranslation(door1_Pos.x, door1_Pos.y, door1_Pos.z); addPartInstance('door', localMatrix);
                    localMatrix = new THREE.Matrix4().makeTranslation(garageDoor_Pos.x, garageDoor_Pos.y, garageDoor_Pos.z); addPartInstance('garageDoor', localMatrix);
                    const addWindowPart = (geomKey, x, y, z) => { localMatrix = new THREE.Matrix4().makeTranslation(x, y, z); addPartInstance(geomKey, localMatrix); };
                    addWindowPart('windowXY',0.25,window_Y_pos_Relative,-windowDepth/2); addWindowPart('windowXY',0.75,window_Y_pos_Relative,-windowDepth/2); addWindowPart('windowXY',1.25,window_Y_pos_Relative,-windowDepth/2); addWindowPart('windowXY',1.75,window_Y_pos_Relative,-windowDepth/2);
                    addWindowPart('windowXY',0.25,window_Y_pos_Relative,armWidth+windowDepth/2); addWindowPart('windowXY',0.75,window_Y_pos_Relative,armWidth+windowDepth/2); addWindowPart('windowXY',1.25,window_Y_pos_Relative,armWidth+windowDepth/2); addWindowPart('windowXY',1.75,window_Y_pos_Relative,armWidth+windowDepth/2);
                    addWindowPart('windowYZ',armWidth+windowDepth/2,window_Y_pos_Relative,0.25); addWindowPart('windowYZ',armWidth+windowDepth/2,window_Y_pos_Relative,0.75); addWindowPart('windowYZ',armWidth+windowDepth/2,window_Y_pos_Relative,1.25); addWindowPart('windowYZ',armWidth+windowDepth/2,window_Y_pos_Relative,1.75);
                    addWindowPart('windowXY',0.25,window_Y_pos_Relative,armLength+windowDepth/2); addWindowPart('windowXY',0.75,window_Y_pos_Relative,armLength+windowDepth/2);
                    // --- Fin Ajout Parties ---

                    // --- Enregistrement & Debug (inchangé) ---
                    const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, 'house', worldCellCenterPos.clone().setY(this.config.sidewalkHeight));
                    if (registeredBuilding) { plot.addBuildingInstance({ id: registeredBuilding.id, type: 'house', position: worldCellCenterPos.clone().setY(this.config.sidewalkHeight) }); }
                    if (this.debugPlotGridGroup && this.debugPlotGridMaterial) {
                        const debugGridWorldWidth = houseGridW * gridCellSize; const debugGridWorldDepth = houseGridD * gridCellSize;
                        const debugGeom = new THREE.PlaneGeometry(debugGridWorldWidth, debugGridWorldDepth);
                        const debugMesh = new THREE.Mesh(debugGeom, this.debugPlotGridMaterial);
                        debugMesh.position.copy(worldCellCenterPos).setY(groundLevel + 0.02);
                        debugMesh.rotation.set(-Math.PI / 2, 0, rotationY); this.debugPlotGridGroup.add(debugMesh);
                    }
                    plot.addPlacedHouseGrid({ gx: currentGx, gy: currentGy, gridWidth: houseGridW, gridDepth: houseGridD });
                    housesPlacedOnPlot++;
                }
            }
            // if (housesPlacedOnPlot > 0) { console.log(`Plot ${plot.id}: Placé ${housesPlacedOnPlot} maisons L.`); }

        // --- CAS AUTRES TYPES (Logique inchangée) ---
        } else if (plot.zoneType && ['building', 'industrial', 'park', 'skyscraper'].includes(plot.zoneType)) {
            // --- Coller ici exactement la même logique que dans la réponse précédente ---
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

    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0) {
        const instanceMatrix = new THREE.Matrix4(); const finalScaleValue = fittingScaleFactor * userScale; const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue); const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY); const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z); const finalHeight = heightAfterFitting * userScale; const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalHeight / 2 + 0.05, centerZ); instanceMatrix.multiplyMatrices(scaleMatrix, rotationMatrix); instanceMatrix.multiply(recenterMatrix); instanceMatrix.premultiply(finalTranslationMatrix); return instanceMatrix;
    }

    // ==============================================================
    // Fonction 4 : createInstancedMeshesFromData (Inchangée par rapport à la réponse précédente)
    // ==============================================================
    // La logique ici était déjà correcte pour assigner les matériaux.
    // Les problèmes de rendu venaient probablement des normales/culling (corrigé via DoubleSide/computeVertexNormals)
    // ou du scaling (corrigé dans generatePlotPrimaryContent).
    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh (maison L-shape grille/scalée + assets)...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

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
                    else { material = this.baseHouseMaterials[partName]; if (!material) console.warn(`Matériau non trouvé: ${partName}`); }

                    if (geometry && material && matrices && matrices.length > 0) {
                        const count = matrices.length;
                        const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                        instancedMesh.name = `NewHouse_${partName}_Instanced`;
                        instancedMesh.castShadow = true; instancedMesh.receiveShadow = true;
                        matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); });
                        instancedMesh.instanceMatrix.needsUpdate = true;
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++; totalInstancesCreated += count;
                    } else if (!matrices || matrices.length === 0) { /* Normal */ }
                    else { if (!geometry) console.warn(`Géo manquante: ${partName}`); if (!material) console.warn(`Mat manquant: ${partName}`); }
                }
            }
        }

        // --- 2. Autres Assets ---
        if (!this.assetLoader && !this.stripeBaseGeometry) { /* ... warnings ... */ }
        for (const type in this.instanceData) {
             if (type === houseDataType || !this.instanceData.hasOwnProperty(type)) continue;
             for (const modelId in this.instanceData[type]) {
                 if (!this.instanceData[type].hasOwnProperty(modelId)) continue;
                 const matrices = this.instanceData[type][modelId];
                 if (matrices && matrices.length > 0) {
                     let geometry = null; let material = null; let castShadow = true; let receiveShadow = true;
                     if (type === 'crosswalk') { if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) { geometry = this.stripeBaseGeometry; material = this.materials.crosswalkMaterial; castShadow = false; receiveShadow = true; } else { console.warn(`Géo/mat manquant crosswalk`); continue; }}
                     else if (this.assetLoader) { const assetData = this.assetLoader.getAssetDataById(modelId); if (assetData && assetData.geometry && assetData.material) { geometry = assetData.geometry; material = assetData.material; } else { console.warn(`Données asset ${modelId} invalides`); continue; }}
                     else { console.warn(`AssetLoader manquant type '${type}'`); continue; }

                     const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
                     matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); });
                     instancedMesh.instanceMatrix.needsUpdate = true;
                     instancedMesh.castShadow = castShadow; instancedMesh.receiveShadow = receiveShadow;
                     instancedMesh.name = `${type}_${modelId}_Instanced`;
                     this.buildingGroup.add(instancedMesh);
                     instancedMeshCount++; totalInstancesCreated += matrices.length;
                 }
             }
        }

        if (instancedMeshCount > 0) { console.log(`InstancedMesh: ${instancedMeshCount} mesh(es) pour ${totalInstancesCreated} instances créés.`); }
        else { console.log("Aucune instance à créer via InstancedMesh."); }
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
