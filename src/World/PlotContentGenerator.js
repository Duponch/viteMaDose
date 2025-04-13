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

	defineHouseBaseMaterials() {
        console.log("Définition des matériaux de base pour la maison procédurale...");
        this.baseHouseMaterials.wall = new THREE.MeshStandardMaterial({
            color: 0xD4A3A1, roughness: 0.8, name: "HouseWallMat",
            polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 // Aide Z-Fighting
        });
        this.baseHouseMaterials.roof = new THREE.MeshStandardMaterial({
            color: 0x90A497, roughness: 0.7, name: "HouseRoofMat"
        });
        this.baseHouseMaterials.windowFrame = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC, roughness: 0.5, name: "HouseWindowFrameMat"
        });
        this.baseHouseMaterials.windowGlass = new THREE.MeshStandardMaterial({
            color: 0xADD8E6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6, name: "HouseWindowGlassMat" // Rendu opacité plus faible
        });
        this.baseHouseMaterials.door = new THREE.MeshStandardMaterial({
            color: 0x656565, roughness: 0.7, name: "HouseDoorMat"
        });
        this.baseHouseMaterials.garageDoor = new THREE.MeshStandardMaterial({
            color: 0x757575, roughness: 0.6, name: "HouseGarageDoorMat"
        });
        // Ajoutez d'autres matériaux si nécessaire
    }

	defineHouseBaseGeometries() {
        console.log("Création des géométries de base pour la maison procédurale...");
        const wallHeight = 4;
        const roofHeight = 2;
        const roofOverhang = 0.3;
        const wing1Width = 10; const wing1Depth = 6;
        const wing2Width = 6; const wing2Depth = 7;
        const wing1PosX = -wing1Width / 4; const wing1PosZ = -wing1Depth / 4;
        const wing2PosX = wing1PosX + wing1Width / 2; const wing2PosZ = wing1PosZ + wing1Depth / 2;

        // --- Géométrie des Murs (fusionnée) ---
        const wallGeos = [];
        const wing1Geo = new THREE.BoxGeometry(wing1Width, wallHeight, wing1Depth);
        wing1Geo.translate(wing1PosX, wallHeight / 2, wing1PosZ); // Centre Y à wallHeight/2
        wallGeos.push(wing1Geo);
        const wing2Geo = new THREE.BoxGeometry(wing2Width, wallHeight, wing2Depth);
        wing2Geo.translate(wing2PosX, wallHeight / 2, wing2PosZ); // Centre Y à wallHeight/2
        wallGeos.push(wing2Geo);

        const mergedWallGeo = mergeGeometries(wallGeos, false);
        if (mergedWallGeo) {
            // Calculer BBox pour obtenir les vraies limites après translation et fusion
            mergedWallGeo.computeBoundingBox();
            const wallMinY = mergedWallGeo.boundingBox.min.y; // Devrait être 0
            const calculatedWallHeight = mergedWallGeo.boundingBox.max.y - wallMinY; // Devrait être wallHeight
            // Stocker minY et height dans userData pour le positionnement Y précis
            mergedWallGeo.userData = { height: calculatedWallHeight, minY: wallMinY };
            this.baseHouseGeometries.wall = mergedWallGeo;
            console.log(` -> Géométrie murs créée (minY: ${wallMinY.toFixed(2)}, height: ${calculatedWallHeight.toFixed(2)}).`);
        } else {
            console.error("Échec fusion géométrie murs maison.");
            this.baseHouseGeometries.wall = new THREE.BoxGeometry(1,1,1); // Fallback
            this.baseHouseGeometries.wall.userData = { height: 1, minY: -0.5 }; // Fallback userData
        }
        wallGeos.forEach(g => g.dispose());


        // --- Géométrie des Toits (fusionnée) ---
        // La fonction interne createGableRoofGeometry et la fusion restent identiques à la version précédente (avec indices corrigés)
        const createGableRoofGeometry = (width, depth, baseH, roofH, overhang, posX, posY, posZ) => {
            const roofBaseW = width / 2 + overhang; const roofBaseD = depth / 2 + overhang;
            const roofYPos = 0; const ridgeY = roofYPos + roofH;
            const roofGeometry = new THREE.BufferGeometry();
            const verts = new Float32Array([-roofBaseW, roofYPos, -roofBaseD, roofBaseW, roofYPos, -roofBaseD, roofBaseW, roofYPos, roofBaseD, -roofBaseW, roofYPos, roofBaseD, 0, ridgeY, -roofBaseD, 0, ridgeY, roofBaseD]);
            const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0.5, 1, 0.5, 0]);
            const indices = [ 0, 4, 1, 2, 5, 3, 3, 5, 4, 3, 4, 0, 1, 4, 5, 1, 5, 2 ]; // Indices corrigés
            roofGeometry.setIndex(indices);
            roofGeometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            roofGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            roofGeometry.computeVertexNormals();
            roofGeometry.translate(posX, posY + baseH, posZ); // Positionne la BASE du toit
            return roofGeometry;
        };
        const roofGeos = [];
        roofGeos.push(createGableRoofGeometry(wing1Width, wing1Depth, wallHeight, roofHeight, roofOverhang, wing1PosX, 0, wing1PosZ));
        roofGeos.push(createGableRoofGeometry(wing2Width, wing2Depth, wallHeight, roofHeight, roofOverhang, wing2PosX, 0, wing2PosZ));
        const mergedRoofGeo = mergeGeometries(roofGeos, false);
        if (mergedRoofGeo) {
            this.baseHouseGeometries.roof = mergedRoofGeo;
            console.log(" -> Géométrie toits créée (indices corrigés).");
        } else {
             console.error("Échec fusion géométrie toits maison.");
             this.baseHouseGeometries.roof = new THREE.BoxGeometry(1,1,1); // Fallback
        }
        roofGeos.forEach(g => g.dispose());


        // --- Géométries Fenêtres/Portes ---
        // Le code de création des BoxGeometry et leur centrage reste identique
        const windowW = 1.5; const windowH = 1.2; const windowD = 0.1; const glassD = 0.05;
        const doorWidth = 1.2; const doorHeight = 2.2; const doorD = 0.15;
        const garageDoorWidth = 3; const garageDoorHeight = 2.5; const garageDoorD = 0.15;
        this.baseHouseGeometries.windowFrame = new THREE.BoxGeometry(windowW, windowH, windowD);
        this.baseHouseGeometries.windowGlass = new THREE.BoxGeometry(windowW * 0.9, windowH * 0.9, glassD);
        this.baseHouseGeometries.door = new THREE.BoxGeometry(doorWidth, doorHeight, doorD);
        this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(garageDoorWidth, garageDoorHeight, garageDoorD);
        this.baseHouseGeometries.windowFrame.center();
        this.baseHouseGeometries.windowGlass.center();
        this.baseHouseGeometries.door.center();
        this.baseHouseGeometries.garageDoor.center();
        console.log(" -> Géométries fenêtres/portes créées et centrées.");


        // --- Calcul et stockage hauteur totale approx ---
        // Le code pour stocker la hauteur totale approx reste identique
        const totalApproxHeight = wallHeight + roofHeight;
        // S'assurer que userData existe avant d'écrire dedans
        if (this.baseHouseGeometries.wall?.userData) {
            this.baseHouseGeometries.wall.userData.totalHeight = totalApproxHeight;
        }
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

   // MODIFIÉ: Logique de densité revue pour limiter à 1 maison max par plot
	// MODIFIÉ: Logique de densité revue pour autoriser plusieurs maisons (max 2x2)
    generatePlotPrimaryContent(plot) {
        // Vérifications essentielles
        if (!this.cityManager) {
           console.error("PlotContentGenerator.generatePlotPrimaryContent: CityManager non disponible.");
           return;
        }
         // NavigationGraph est nécessaire UNIQUEMENT pour les maisons type grille
        if (plot.zoneType === 'house' && !this.navigationGraph) {
            console.error(`PlotContentGenerator: NavigationGraph requis pour placer maisons sur grille (plot ${plot.id}).`);
            return;
        }

        // --- CAS 'house' (Logique de Densité Revue avec Plafond Max) ---
        if (plot.zoneType === 'house') {
            this.createPlotGround(plot); // Crée le sol spécifique à la parcelle

            // Vérifier si les composants de base de la maison sont prêts
            if (!this.baseHouseGeometries.wall || !this.baseHouseMaterials.wall || !this.baseHouseGeometries.wall.userData) {
                console.warn(`PlotContentGenerator: Composants maison procédurale non prêts pour plot ${plot.id}. Placement maison annulé.`);
                return;
            }

            // Récupérer les paramètres maison/grille depuis config et NavGraph
            const houseGridW = this.config.fixedHouseGridWidth;
            const houseGridD = this.config.fixedHouseGridDepth;
            const spacing = this.config.fixedHouseGridSpacing;
            const gridScale = this.navigationGraph.gridScale || 1.0;
            const gridCellSize = 1.0 / gridScale;

            // 1. Obtenir les limites de la parcelle en coordonnées de grille
            const plotBounds = plot.getBounds();
            const minGridPoint = this.navigationGraph.worldToGrid(plotBounds.minX, plotBounds.minZ);
            const maxGridPoint = this.navigationGraph.worldToGrid(plotBounds.maxX, plotBounds.maxZ);
            const minGx = minGridPoint.x;
            const minGy = minGridPoint.y;
            const maxGx = maxGridPoint.x;
            const maxGy = maxGridPoint.y;
            const plotGridW = maxGx - minGx + 1;
            const plotGridD = maxGy - minGy + 1;

            if (plotGridW <= 0 || plotGridD <= 0) {
                console.warn(`Plot ${plot.id} a des dimensions de grille invalides (${plotGridW}x${plotGridD}). Placement des maisons impossible.`);
                return;
            }

            // 2. Calculer le nombre maximum de maisons possibles
            const maxPossibleX = Math.max(0, Math.floor((plotGridW + spacing) / (houseGridW + spacing)));
            const maxPossibleY = Math.max(0, Math.floor((plotGridD + spacing) / (houseGridD + spacing)));

            // --- MODIFIÉ: Déterminer le nombre réel à placer (limité à 2x2 max) ---
            const MAX_HOUSES_PER_AXIS = 2; // Définir le nombre max de maisons par axe

            let numHousesX = Math.min(maxPossibleX, MAX_HOUSES_PER_AXIS);
            let numHousesY = Math.min(maxPossibleY, MAX_HOUSES_PER_AXIS);

            // Assurer qu'au moins une dimension n'est pas zéro si le placement est possible
            if (numHousesX === 0 || numHousesY === 0) {
                 // Si l'une des dimensions est 0, aucun placement n'est possible avec le plafond actuel ou la taille de la parcelle
                 numHousesX = 0;
                 numHousesY = 0;
             } else if (maxPossibleX === 0 || maxPossibleY === 0) {
                 // Ce cas devrait être couvert ci-dessus, mais ajouté par sécurité
                 numHousesX = 0;
                 numHousesY = 0;
             }
            // --- FIN MODIFICATION ---

            // 4. Si aucune maison ne doit être placée, sortir
            if (numHousesX === 0 || numHousesY === 0) {
                 // console.warn(`Plot ${plot.id} (${plotGridW}x${plotGridD} grid) ne peut pas contenir les maisons requises (demande ${numHousesX}x${numHousesY}, plafonné à ${MAX_HOUSES_PER_AXIS}). Max possible: ${maxPossibleX}x${maxPossibleY}`);
                return;
            }

            // 5. Calculer la zone de grille totale nécessaire pour le nombre réel de maisons
            const totalGridWidthNeeded = numHousesX * houseGridW + Math.max(0, numHousesX - 1) * spacing;
            const totalGridDepthNeeded = numHousesY * houseGridD + Math.max(0, numHousesY - 1) * spacing;

            // 6. Calculer le décalage de centrage dans la plage de grille de la parcelle
            const offsetX = Math.floor((plotGridW - totalGridWidthNeeded) / 2);
            const offsetY = Math.floor((plotGridD - totalGridDepthNeeded) / 2);

            // 7. Calculer la cellule de grille de départ (coin bas-gauche de la première maison)
            const startGx = minGx + offsetX;
            const startGy = minGy + offsetY;

            let housesPlacedOnPlot = 0;
            const groundLevel = 0.01;

            // 8. Boucler et placer les maisons selon la disposition calculée
            for (let rowIndex = 0; rowIndex < numHousesY; rowIndex++) {
                for (let colIndex = 0; colIndex < numHousesX; colIndex++) {

                    // Calculer la position de grille pour le coin bas-gauche de la maison actuelle
                    const currentGx = startGx + colIndex * (houseGridW + spacing);
                    const currentGy = startGy + rowIndex * (houseGridD + spacing);

                    // --- Placer la Maison (logique inchangée par rapport à l'étape précédente) ---
                    const centerGx = currentGx + (houseGridW / 2.0);
                    const centerGy = currentGy + (houseGridD / 2.0);
                    const worldCenterPos = this.navigationGraph.gridToWorld(centerGx, centerGy);

                    const targetWorldWidth = houseGridW * gridCellSize;
                    const targetWorldDepth = houseGridD * gridCellSize;
                    const baseHouseWidth = 10;
                    const baseHouseDepth = 9.5;
                    let scaleValue = Math.min( targetWorldWidth / baseHouseWidth, targetWorldDepth / baseHouseDepth );
                    scaleValue = THREE.MathUtils.clamp(scaleValue, 0.3, 1.5);

                    const rotationY = Math.floor(Math.random() * 4) * Math.PI / 2;
                    const wallMinY = this.baseHouseGeometries.wall.userData.minY ?? 0;
                    const posY = groundLevel - (wallMinY * scaleValue);
                    const basePosition = new THREE.Vector3(worldCenterPos.x, posY, worldCenterPos.z);
                    const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
                    const baseScale = new THREE.Vector3(scaleValue, scaleValue, scaleValue);
                    const mainHouseMatrix = new THREE.Matrix4().compose(basePosition, baseQuaternion, baseScale);

                    if (this.houseInstanceMatrices.wall) this.houseInstanceMatrices.wall.push(mainHouseMatrix.clone());
                    if (this.houseInstanceMatrices.roof) this.houseInstanceMatrices.roof.push(mainHouseMatrix.clone());
                    const addPartInstance = (partType, localMatrix) => { const finalMatrix = new THREE.Matrix4().multiplyMatrices(mainHouseMatrix, localMatrix); this.houseInstanceMatrices[partType]?.push(finalMatrix); };
                    const createLocalPartMatrix = (relX, relY, relZ, rotY = 0) => { const localPos = new THREE.Vector3(relX, relY, relZ); const localRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY); const localScale = new THREE.Vector3(1, 1, 1); return new THREE.Matrix4().compose(localPos, localRot, localScale); };
                    const createLocalGlassMatrix = (frameLocalMatrix) => { const framePos = new THREE.Vector3(); const frameRot = new THREE.Quaternion(); const frameScale = new THREE.Vector3(); frameLocalMatrix.decompose(framePos, frameRot, frameScale); const baseWindowFrameD = 0.1; const baseWindowGlassD = 0.05; const glassOffset = (baseWindowFrameD / 2) - (baseWindowGlassD / 2) + 0.01; const zOffsetVector = new THREE.Vector3(0, 0, glassOffset); zOffsetVector.applyQuaternion(frameRot); const glassLocalPos = framePos.clone().add(zOffsetVector); return new THREE.Matrix4().compose(glassLocalPos, frameRot, frameScale); };
                    const baseWallHeight = this.baseHouseGeometries.wall.userData.height ?? 4; const baseDoorHeight = 2.2; const baseDoorD = 0.15; const baseGarageDoorHeight = 2.5; const baseGarageDoorD = 0.15; const windowRelY = baseWallHeight / 2 + 0.4; const doorRelY = baseDoorHeight / 2; const garageDoorRelY = baseGarageDoorHeight / 2; const wing1W_Base = 10; const wing1D_Base = 6; const wing2W_Base = 6; const wing2D_Base = 7; const wing1PosX_Rel = -wing1W_Base / 4; const wing1PosZ_Rel = -wing1D_Base / 4; const wing2PosX_Rel = wing1PosX_Rel + wing1W_Base / 2; const wing2PosZ_Rel = wing1PosZ_Rel + wing1D_Base / 2; const w1_backZ = wing1PosZ_Rel - wing1D_Base / 2; const w1_leftX = wing1PosX_Rel - wing1W_Base / 2; const w2_rightX = wing2PosX_Rel + wing2W_Base / 2; const w2_frontZ = wing2PosZ_Rel + wing2D_Base / 2; const doorX_W1_Rel = wing1PosX_Rel - wing1W_Base / 3; const w1_frontZ = wing1PosZ_Rel + wing1D_Base / 2;
                    let frameMatrix = createLocalPartMatrix(wing1PosX_Rel - wing1W_Base / 4, windowRelY, w1_backZ, Math.PI); addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                    frameMatrix = createLocalPartMatrix(wing1PosX_Rel + wing1W_Base / 4, windowRelY, w1_backZ, Math.PI); addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                    frameMatrix = createLocalPartMatrix(w1_leftX, windowRelY, wing1PosZ_Rel - wing1D_Base / 4, -Math.PI / 2); addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                    frameMatrix = createLocalPartMatrix(w1_leftX, windowRelY, wing1PosZ_Rel + wing1D_Base / 4, -Math.PI / 2); addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                    frameMatrix = createLocalPartMatrix(w2_rightX, windowRelY, wing2PosZ_Rel - wing2D_Base / 4, Math.PI / 2); addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                    frameMatrix = createLocalPartMatrix(w2_rightX, windowRelY, wing2PosZ_Rel + wing2D_Base / 4, Math.PI / 2); addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                    let doorMatrix = createLocalPartMatrix(doorX_W1_Rel, doorRelY, w1_frontZ + baseDoorD / 2, 0); addPartInstance('door', doorMatrix);
                    let garageDoorMatrix = createLocalPartMatrix(wing2PosX_Rel, garageDoorRelY, w2_frontZ + baseGarageDoorD / 2, 0); addPartInstance('garageDoor', garageDoorMatrix);

                    plot.addPlacedHouseGrid({ gx: currentGx, gy: currentGy, gridWidth: houseGridW, gridDepth: houseGridD });
                    housesPlacedOnPlot++;

                    const registeredBuilding = this.cityManager.registerBuildingInstance( plot.id, 'house', worldCenterPos.clone());
                    if (registeredBuilding) {
                        plot.addBuildingInstance({ id: registeredBuilding.id, type: 'house', position: worldCenterPos.clone() });
                    }

                    if (this.debugPlotGridGroup && this.debugPlotGridMaterial) {
                         const debugGridWorldWidth = houseGridW * gridCellSize;
                         const debugGridWorldDepth = houseGridD * gridCellSize;
                         const debugGeom = new THREE.PlaneGeometry(debugGridWorldWidth, debugGridWorldDepth);
                         const debugMesh = new THREE.Mesh(debugGeom, this.debugPlotGridMaterial);
                         debugMesh.position.copy(worldCenterPos).setY(groundLevel + 0.02);
                         debugMesh.rotation.set(-Math.PI / 2, 0, rotationY);
                         this.debugPlotGridGroup.add(debugMesh);
                    }
                    // --- Fin Placer la Maison ---

                } // Fin boucle colIndex
            } // Fin boucle rowIndex

            if (housesPlacedOnPlot > 0) {
               // Log mis à jour pour refléter le changement
               console.log(`PlotContentGenerator: Placé ${housesPlacedOnPlot} maisons (${numHousesX}x${numHousesY}, plafonné à ${MAX_HOUSES_PER_AXIS}) centrées sur la parcelle ${plot.id}.`);
            }

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
    }

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

    // --- createInstancedMeshesFromData ---
    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh (maison procédurale multi-part + assets)..."); let totalInstancesCreated = 0; let instancedMeshCount = 0;
        for (const partName in this.baseHouseGeometries) { if (this.baseHouseGeometries.hasOwnProperty(partName) && this.baseHouseMaterials.hasOwnProperty(partName) && this.houseInstanceMatrices.hasOwnProperty(partName)) { const geometry = this.baseHouseGeometries[partName]; const material = this.baseHouseMaterials[partName]; const matrices = this.houseInstanceMatrices[partName]; if (geometry && material && matrices && matrices.length > 0) { const count = matrices.length; const instancedMesh = new THREE.InstancedMesh(geometry, material, count); instancedMesh.name = `ProceduralHouse_${partName}_Instanced`; instancedMesh.castShadow = true; instancedMesh.receiveShadow = true; matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); }); instancedMesh.instanceMatrix.needsUpdate = true; this.buildingGroup.add(instancedMesh); this.houseInstancedMeshes[partName] = instancedMesh; instancedMeshCount++; totalInstancesCreated += count; console.log(` -> InstancedMesh pour ${count} maisons (partie: ${partName}) créé.`); } else if (matrices && matrices.length === 0) { } else { console.warn(`Manque geometrie/materiau/matrices pour partie maison: ${partName}`); } } }
        if (!this.assetLoader && !this.stripeBaseGeometry) { if (!this.stripeBaseGeometry && this.instanceData.crosswalk && Object.keys(this.instanceData.crosswalk).length > 0) { console.error("Impossible de créer InstancedMesh crosswalk: stripeBaseGeometry non dispo."); } else if (!this.assetLoader) { console.error("Impossible de créer InstancedMesh: AssetLoader non disponible (pour assets non-maison)."); } }
        for (const type in this.instanceData) { if (type === 'house' || !this.instanceData.hasOwnProperty(type)) continue; for (const modelId in this.instanceData[type]) { if (!this.instanceData[type].hasOwnProperty(modelId)) continue; const matrices = this.instanceData[type][modelId]; if (matrices && matrices.length > 0) { let geometry = null; let material = null; let castShadow = true; let receiveShadow = true; if (type === 'crosswalk') { if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) { geometry = this.stripeBaseGeometry; material = this.materials.crosswalkMaterial; castShadow = false; receiveShadow = true; } else { console.warn(`Géométrie/matériau manquant pour 'crosswalk', ${matrices.length} instances ignorées.`); continue; } } else if (this.assetLoader) { const assetData = this.assetLoader.getAssetDataById(modelId); if (assetData && assetData.geometry && assetData.material) { geometry = assetData.geometry; material = assetData.material; } else { console.warn(`Données asset ${modelId} (type ${type}) invalides, ${matrices.length} instances ignorées.`); continue; } } else { console.warn(`AssetLoader manquant pour type '${type}', ${matrices.length} instances ignorées.`); continue; } const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length); matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); }); instancedMesh.instanceMatrix.needsUpdate = true; instancedMesh.castShadow = castShadow; instancedMesh.receiveShadow = receiveShadow; instancedMesh.name = `${type}_${modelId}_Instanced`; this.buildingGroup.add(instancedMesh); instancedMeshCount++; totalInstancesCreated += matrices.length; } } }
        if (instancedMeshCount > 0) { console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) pour ${totalInstancesCreated} instances (tous types confondus) ajoutés.`); } else { console.log("Aucune instance (maison ou autre) à créer via InstancedMesh."); }
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
