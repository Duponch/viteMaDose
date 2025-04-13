// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class PlotContentGenerator {
    // --- MODIFIÉ : Ajout cityManager ref ---
	constructor(config, materials) {
        this.config = config;
        this.materials = materials; // Matériaux partagés (sol, trottoir etc.)
        this.sidewalkGroup = new THREE.Group(); this.sidewalkGroup.name = "Sidewalks";
        this.buildingGroup = new THREE.Group(); this.buildingGroup.name = "PlotContents";
        this.assetLoader = null;
        this.instanceData = {}; // For non-house assets + crosswalks
        this.stripeBaseGeometry = null;
        this.cityManager = null;

        // --- NOUVEAU: Pour les maisons procédurales (Multi-Part Instancing) ---
        this.baseHouseGeometries = {}; // { wall: BufferGeometry, roof: BufferGeometry, ... }
        this.baseHouseMaterials = {};  // { wall: Material, roof: Material, ... }
        this.houseInstanceMatrices = {}; // { wall: Matrix4[], roof: Matrix4[], ... }
        this.houseInstancedMeshes = {};  // { wall: InstancedMesh, roof: InstancedMesh, ... }

        // Définir les matériaux de la maison ici une seule fois
        this.defineHouseBaseMaterials();
        // Définir les géométries de base de la maison ici une seule fois
        this.defineHouseBaseGeometries();
        // Initialiser les tableaux de matrices
        this.initializeHouseMatrixArrays();
        // --------------------------------------------------------------------

        console.log("PlotContentGenerator initialisé (avec support maison procédurale multi-part instancing).");
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

        // --- Géométrie des Murs (fusionnée) ---
        // Calcul positions relatives pour centrage
        const wing1PosX = -wing1Width / 4;
        const wing1PosZ = -wing1Depth / 4;
        const wing2PosX = wing1PosX + wing1Width / 2;
        const wing2PosZ = wing1PosZ + wing1Depth / 2;

        const wallGeos = [];
        const wing1Geo = new THREE.BoxGeometry(wing1Width, wallHeight, wing1Depth);
        wing1Geo.translate(wing1PosX, wallHeight / 2, wing1PosZ);
        wallGeos.push(wing1Geo);
        const wing2Geo = new THREE.BoxGeometry(wing2Width, wallHeight, wing2Depth);
        wing2Geo.translate(wing2PosX, wallHeight / 2, wing2PosZ);
        wallGeos.push(wing2Geo);

        const mergedWallGeo = mergeGeometries(wallGeos, false);
        if (mergedWallGeo) {
            mergedWallGeo.userData = { baseHeight: wallHeight }; // Stocker hauteur mur
            this.baseHouseGeometries.wall = mergedWallGeo;
            console.log(" -> Géométrie murs créée.");
        } else { console.error("Échec fusion géométrie murs maison."); this.baseHouseGeometries.wall = new THREE.BoxGeometry(1,1,1);}
        wallGeos.forEach(g => g.dispose());

        // --- Géométrie des Toits (fusionnée) ---
        const createGableRoofGeometry = (width, depth, baseH, roofH, overhang, posX, posY, posZ) => {
            const roofBaseW = width / 2 + overhang; const roofBaseD = depth / 2 + overhang;
            const roofYPos = 0; const ridgeY = roofYPos + roofH;
            const roofGeometry = new THREE.BufferGeometry();
            const verts = new Float32Array([
                -roofBaseW, roofYPos, -roofBaseD, // 0 - Back Left
                 roofBaseW, roofYPos, -roofBaseD, // 1 - Back Right
                 roofBaseW, roofYPos,  roofBaseD, // 2 - Front Right
                -roofBaseW, roofYPos,  roofBaseD, // 3 - Front Left
                 0, ridgeY, -roofBaseD, // 4 - Ridge Back
                 0, ridgeY,  roofBaseD  // 5 - Ridge Front
            ]);
            const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0.5, 1, 0.5, 0]);

            // --- **INDICES CORRIGÉS** ---
            // Triangles définis en ordre counter-clockwise (vu de l'extérieur)
            const indices = [
                // Pignon Arrière (Triangle 0-4-1)
                0, 4, 1,
                // Pignon Avant (Triangle 2-5-3)
                2, 5, 3,
                // Pan Gauche (Quads 3-5-4-0 -> Triangles 3-5-4 et 3-4-0)
                3, 5, 4,
                3, 4, 0,
                // Pan Droit (Quads 1-4-5-2 -> Triangles 1-4-5 et 1-5-2)
                1, 4, 5,
                1, 5, 2
                // Note: Le dessous du toit n'est pas explicitement défini ici,
                // mais ce n'est généralement pas nécessaire visuellement.
            ];
            // --- **FIN CORRECTION INDICES** ---

            roofGeometry.setIndex(indices);
            roofGeometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            roofGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            roofGeometry.computeVertexNormals(); // Recalculer les normales après avoir défini les bonnes faces
            roofGeometry.translate(posX, posY + baseH, posZ);
            return roofGeometry;
        };
        const roofGeos = [];
        roofGeos.push(createGableRoofGeometry(wing1Width, wing1Depth, wallHeight, roofHeight, roofOverhang, wing1PosX, 0, wing1PosZ));
        roofGeos.push(createGableRoofGeometry(wing2Width, wing2Depth, wallHeight, roofHeight, roofOverhang, wing2PosX, 0, wing2PosZ));
        const mergedRoofGeo = mergeGeometries(roofGeos, false);
         if (mergedRoofGeo) {
            this.baseHouseGeometries.roof = mergedRoofGeo;
            console.log(" -> Géométrie toits créée (indices corrigés).");
        } else { console.error("Échec fusion géométrie toits maison."); this.baseHouseGeometries.roof = new THREE.BoxGeometry(1,1,1); }
        roofGeos.forEach(g => g.dispose());


        // --- Géométries Fenêtres/Portes (simples BoxGeometry) ---
        // Dimensions de l'exemple
        const windowW = 1.5; const windowH = 1.2; const windowD = 0.1; // Profondeur cadre
        const glassD = 0.05; // Profondeur verre
        const doorWidth = 1.2; const doorHeight = 2.2; const doorD = 0.15;
        const garageDoorWidth = 3; const garageDoorHeight = 2.5; const garageDoorD = 0.15;

        this.baseHouseGeometries.windowFrame = new THREE.BoxGeometry(windowW, windowH, windowD);
        this.baseHouseGeometries.windowGlass = new THREE.BoxGeometry(windowW * 0.9, windowH * 0.9, glassD); // Légèrement plus petit
        this.baseHouseGeometries.door = new THREE.BoxGeometry(doorWidth, doorHeight, doorD);
        this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(garageDoorWidth, garageDoorHeight, garageDoorD);
        console.log(" -> Géométries fenêtres/portes créées.");

        // --- Calculer hauteur totale (approximative) pour positionnement ---
        // Utiliser la hauteur des murs + hauteur du toit
        const totalApproxHeight = wallHeight + roofHeight;
        Object.values(this.baseHouseGeometries).forEach(geom => {
            if(geom && !geom.userData.totalHeight) { // Stocker si pas déjà fait
                geom.userData.totalHeight = totalApproxHeight;
                // Centrer chaque géométrie INDIVIDUELLE pour faciliter le positionnement relatif
                // SAUF les murs et toits qui sont déjà positionnés relativement
                if (geom !== this.baseHouseGeometries.wall && geom !== this.baseHouseGeometries.roof) {
                    geom.center(); // Centre fenêtres, portes etc. sur leur propre origine
                }
            }
        });
        console.log(" -> Hauteur approx stockée et géométries centrées.");

        // --- Nettoyage éventuel d'anciennes géométries si cette fonction est appelée plusieurs fois ---
        // (Normalement appelée une seule fois dans le constructeur)
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
    generateContent(leafPlots, assetLoader, crosswalkInfos = [], cityManager) {
        this.reset(assetLoader);
        if (!cityManager) { /* ... erreur ... */ return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup }; }
        this.cityManager = cityManager;
        console.log("Génération du contenu (avec maison procédurale multi-part instancing)...");

        // --- NOUVEAU: Réinitialiser les tableaux de matrices ---
        this.initializeHouseMatrixArrays();
        // ------------------------------------------------------

        const allSidewalkGeometries = [];
        this.stripeBaseGeometry = new THREE.BoxGeometry(this.config.crosswalkStripeWidth, this.config.crosswalkHeight, 0.5);
        // Les géométries/matériaux de la maison sont déjà définis dans le constructeur

        leafPlots.forEach((plot) => {
            this.generatePlotPrimaryContent(plot); // Appel inchangé
            if (this.config.sidewalkWidth > 0) { /* ... trottoirs ... */ const g = this.collectSidewalkGeometriesForPlot(plot); allSidewalkGeometries.push(...g); }
            this.placeTreesForPlot(plot);
        });

        // Traitement passages piétons (inchangé)
        if (crosswalkInfos && crosswalkInfos.length > 0) { /* ... code crosswalk ... */
             if (!this.instanceData.crosswalk) this.instanceData.crosswalk = {}; const crosswalkAssetId = 'default_crosswalk_stripe'; if (!this.instanceData.crosswalk[crosswalkAssetId]) this.instanceData.crosswalk[crosswalkAssetId] = []; const matrix = new THREE.Matrix4(); const basePosition = new THREE.Vector3(); const stripePosition = new THREE.Vector3(); const quaternion = new THREE.Quaternion(); const scale = new THREE.Vector3(); const offsetDirection = new THREE.Vector3(); const yAxis = new THREE.Vector3(0, 1, 0); const stripeCount = this.config.crosswalkStripeCount; const stripeWidth = this.config.crosswalkStripeWidth; const stripeGap = this.config.crosswalkStripeGap; const stripeTotalWidth = stripeWidth + stripeGap; const totalWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap; const initialOffset = -totalWidth / 2 + stripeWidth / 2;
             crosswalkInfos.forEach(info => { basePosition.copy(info.position); const finalAngle = info.angle + Math.PI / 2; quaternion.setFromAxisAngle(yAxis, finalAngle); if (Math.abs(finalAngle % Math.PI) < 0.01) { offsetDirection.set(1, 0, 0); } else { offsetDirection.set(0, 0, 1); } scale.set(1, 1, info.length); for (let i = 0; i < stripeCount; i++) { const currentOffset = initialOffset + i * stripeTotalWidth; stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset); stripePosition.y = this.config.crosswalkHeight / 2 + 0.005; matrix.compose(stripePosition, quaternion, scale); this.instanceData.crosswalk[crosswalkAssetId].push(matrix.clone()); } });
        }

        // Création des InstancedMesh (gère maisons et autres)
        this.createInstancedMeshesFromData();

        // Fusion trottoirs (inchangé)
        if (allSidewalkGeometries.length > 0) { /* ... code fusion trottoirs ... */
            const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false); if (mergedSidewalkGeometry) { const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial); sidewalkMesh.castShadow = false; sidewalkMesh.receiveShadow = true; sidewalkMesh.name = "Merged_Sidewalks"; this.sidewalkGroup.add(sidewalkMesh); } else { console.warn("Fusion trottoirs échouée."); } allSidewalkGeometries.forEach(geom => geom.dispose());
        }

        console.log("Génération du contenu terminée.");
        return this.getGroups();
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

    // Regroupe la génération du contenu principal de la parcelle en distinguant le cas "skyscraper"

	generatePlotPrimaryContent(plot) {
        if (!this.cityManager) { /* ... erreur ... */ return; }

        // Utiliser la subdivision pour TOUS les types constructibles, y compris 'house'
        if (plot.zoneType && ['house', 'building', 'industrial', 'park', 'skyscraper'].includes(plot.zoneType)) {

            this.createPlotGround(plot); // Crée le sol pour la parcelle entière

            // Appliquer la subdivision pour déterminer où placer les éléments
            const subZones = this.subdivideForPlacement(plot);
            // Définir une marge spécifique pour les maisons (peut être 0 ou une petite valeur)
            const margin = plot.zoneType === 'house' ? (this.config.houseSubZoneMargin ?? 0.5) :
                           plot.zoneType === 'park' ? 0 :
                           (this.config.buildingSubZoneMargin ?? 1.5);

            // Itérer sur les sous-zones
            subZones.forEach((subZone, index) => {
                const buildableWidth = Math.max(0, subZone.width - margin * 2);
                const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                // Vérifier si la sous-zone est assez grande
                if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                    const subZoneCenterX = subZone.x + subZone.width / 2;
                    const subZoneCenterZ = subZone.z + subZone.depth / 2;

                    // --- Traitement spécifique par type de zone ---

                    // --- CAS 'house' ---
                    if (plot.zoneType === 'house') {
                        // Vérifier si les géométries/matériaux de base sont prêts
                        if (!this.baseHouseGeometries.wall || !this.baseHouseMaterials.wall) {
                            console.warn(`Composants maison procédurale non prêts pour sous-zone plot ${plot.id}`);
                            return; // Passer à la sous-zone suivante
                        }

                        // --- Calcul échelle pour adapter la maison à la sous-zone ---
                        // Dimensions de base de la maison (approximatives, l'encombrement L)
                        const baseHouseWidth = 10; // wing1Width
                        const baseHouseDepth = 9.5; // wing1Depth/2 + wing2Depth
                        // Calculer le facteur d'échelle pour fitter dans la sous-zone buildable
                        let scaleValue = Math.min(
                            buildableWidth / baseHouseWidth,
                            buildableDepth / baseHouseDepth
                        );
                        // Optionnel: Limiter l'échelle minimale/maximale
                        scaleValue = THREE.MathUtils.clamp(scaleValue, 0.3, 1.5); // Ex: min 30%, max 150%
                        // --- Fin Calcul échelle ---

                        const totalApproxHeight = this.baseHouseGeometries.wall?.userData?.totalHeight || 5;
                        const rotationY = Math.floor(Math.random() * 4) * Math.PI / 2;

                        const basePosition = new THREE.Vector3(subZoneCenterX, totalApproxHeight * scaleValue / 2 + 0.05, subZoneCenterZ); // Positionne base au sol
                        const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
                        const baseScale = new THREE.Vector3(scaleValue, scaleValue, scaleValue);
                        const mainHouseMatrix = new THREE.Matrix4().compose(basePosition, baseQuaternion, baseScale);

                        // Ajouter la matrice aux différentes parties (murs, toit)
                        if (this.houseInstanceMatrices.wall) this.houseInstanceMatrices.wall.push(mainHouseMatrix.clone());
                        if (this.houseInstanceMatrices.roof) this.houseInstanceMatrices.roof.push(mainHouseMatrix.clone());

                        // Placer Fenêtres/Portes (avec la même matrice principale)
                        // Les dimensions des fenêtres/portes sont DANS la géométrie de base,
                        // donc elles sont scalées avec la maison. On applique juste la matrice.
                        const wallH = 4 * scaleValue; // Hauteur mur scalée pour position Y fenêtre/porte
                        const windowY = wallH / 2 + (0.4 * scaleValue);
                        const doorH = 2.2 * scaleValue; const doorD = 0.15 * scaleValue;
                        const garageDoorH = 2.5 * scaleValue; const garageDoorD = 0.15 * scaleValue;
                        const windowFrameD = 0.1 * scaleValue; const windowGlassD = 0.05 * scaleValue;

                         // Fonction helper interne pour ajouter les matrices des pièces
                         const addPartInstance = (partType, localMatrix) => {
                             const finalMatrix = new THREE.Matrix4().multiplyMatrices(mainHouseMatrix, localMatrix);
                             this.houseInstanceMatrices[partType]?.push(finalMatrix);
                         };
                         // Fonction pour créer la matrice locale d'une pièce (simplifiée)
                         const createLocalPartMatrix = (relX, relY, relZ, rotY = 0) => {
                            const localPos = new THREE.Vector3(relX, relY, relZ);
                            const localRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
                            const localScale = new THREE.Vector3(1, 1, 1);
                            return new THREE.Matrix4().compose(localPos, localRot, localScale);
                         };
                         // Fonction pour créer la matrice locale du verre (légèrement décalée)
                         const createLocalGlassMatrix = (frameLocalMatrix) => {
                             const framePos = new THREE.Vector3();
                             const frameRot = new THREE.Quaternion();
                             const frameScale = new THREE.Vector3();
                             frameLocalMatrix.decompose(framePos, frameRot, frameScale); // Récupère pos/rot locale du cadre

                             const glassOffset = (windowFrameD / 2) - (windowGlassD / 2) + 0.01;
                             const zOffsetVector = new THREE.Vector3(0, 0, glassOffset);
                             zOffsetVector.applyQuaternion(frameRot); // Oriente l'offset
                             const glassLocalPos = framePos.clone().add(zOffsetVector);
                             return new THREE.Matrix4().compose(glassLocalPos, frameRot, frameScale); // Utilise même rot/scale que cadre
                         };


                        // Positions relatives des ailes DANS la géométrie de BASE (avant scale/rotation)
                        const wing1W_Base = 10; const wing1D_Base = 6; const wing2W_Base = 6; const wing2D_Base = 7;
                        const wing1PosX_Rel = -wing1W_Base / 4; const wing1PosZ_Rel = -wing1D_Base / 4;
                        const wing2PosX_Rel = wing1PosX_Rel + wing1W_Base / 2; const wing2PosZ_Rel = wing1PosZ_Rel + wing1D_Base / 2;

                         // Recalculer les positions RELATIVES des fenêtres/portes par rapport au CENTRE de la géométrie de base
                         // (car les géométries de base sont centrées maintenant, sauf murs/toits)
                         // Exemple fenêtre Aile 1 Arrière Gauche:
                         // X = wing1PosX_Rel - wing1W_Base / 4
                         // Y = windowY (calculé avec hauteur murale SCALÉE)
                         // Z = wing1PosZ_Rel - wing1D_Base / 2 - windowOffset (l'offset n'est plus nécessaire car la pièce est séparée)
                         const w1_backZ = wing1PosZ_Rel - wing1D_Base / 2;
                         const w1_leftX = wing1PosX_Rel - wing1W_Base / 2;
                         const w2_rightX = wing2PosX_Rel + wing2W_Base / 2;
                         const w2_frontZ = wing2PosZ_Rel + wing2D_Base / 2;
                         const doorX_W1_Rel = wing1PosX_Rel - wing1W_Base / 3;
                         const w1_frontZ = wing1PosZ_Rel + wing1D_Base / 2;

                         // Placer les fenêtres
                         let frameMatrix = createLocalPartMatrix(wing1PosX_Rel - wing1W_Base / 4, windowY, w1_backZ, Math.PI);
                         addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                         frameMatrix = createLocalPartMatrix(wing1PosX_Rel + wing1W_Base / 4, windowY, w1_backZ, Math.PI);
                         addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                         frameMatrix = createLocalPartMatrix(w1_leftX, windowY, wing1PosZ_Rel - wing1D_Base / 4, -Math.PI / 2);
                         addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                         frameMatrix = createLocalPartMatrix(w1_leftX, windowY, wing1PosZ_Rel + wing1D_Base / 4, -Math.PI / 2);
                         addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                         frameMatrix = createLocalPartMatrix(w2_rightX, windowY, wing2PosZ_Rel - wing2D_Base / 4, Math.PI / 2);
                         addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));
                         frameMatrix = createLocalPartMatrix(w2_rightX, windowY, wing2PosZ_Rel + wing2D_Base / 4, Math.PI / 2);
                         addPartInstance('windowFrame', frameMatrix); addPartInstance('windowGlass', createLocalGlassMatrix(frameMatrix));

                         // Placer Porte Principale (position Y basée sur hauteur porte)
                         let doorMatrix = createLocalPartMatrix(doorX_W1_Rel, doorH / 2, w1_frontZ, 0);
                         addPartInstance('door', doorMatrix);

                         // Placer Porte Garage (position Y basée sur hauteur porte garage)
                         let garageDoorMatrix = createLocalPartMatrix(wing2PosX_Rel, garageDoorH / 2, w2_frontZ, 0);
                         addPartInstance('garageDoor', garageDoorMatrix);


                        // Enregistrement logique CityManager (inchangé)
                        const registeredBuilding = this.cityManager.registerBuildingInstance(
                            plot.id, 'house', basePosition.clone().setY(this.config.sidewalkHeight), null // Pas d'override capacité
                        );
                        if (registeredBuilding) {
                            plot.addBuildingInstance({ id: registeredBuilding.id, type: 'house', position: basePosition.clone().setY(this.config.sidewalkHeight) });
                        }


                    // --- CAS AUTRES TYPES (logique existante, utilise instanceData standard) ---
                    } else {
                        const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);
                        if (assetInfo) {
                            const instanceMatrix = this.calculateInstanceMatrix( subZoneCenterX, subZoneCenterZ, assetInfo.sizeAfterFitting.y, assetInfo.fittingScaleFactor, assetInfo.centerOffset, assetInfo.userScale );
                            const modelId = assetInfo.id;
                            if (!this.instanceData[plot.zoneType]) this.instanceData[plot.zoneType] = {};
                            if (!this.instanceData[plot.zoneType][modelId]) this.instanceData[plot.zoneType][modelId] = [];
                            this.instanceData[plot.zoneType][modelId].push(instanceMatrix.clone());
                            // Enregistrement CityManager
                            const buildingPosition = new THREE.Vector3(subZoneCenterX, this.config.sidewalkHeight, subZoneCenterZ);
                            const buildingType = assetInfo.type || plot.zoneType;
                            const registeredBuilding = this.cityManager.registerBuildingInstance( plot.id, buildingType, buildingPosition );
                            if (registeredBuilding) { plot.addBuildingInstance({ id: registeredBuilding.id, type: buildingType, position: buildingPosition.clone() }); }
                        }
                    } // Fin else (autres types)

                    // Marquer la sous-zone comme occupée (pour les arbres etc.)
                    if (!plot.occupiedSubZones) plot.occupiedSubZones = [];
                    plot.occupiedSubZones.push({ x: subZone.x + margin, z: subZone.z + margin, width: buildableWidth, depth: buildableDepth });

                } // Fin if buildableWidth/Depth > 0.1
            }); // Fin subZones.forEach
        } // Fin if plot.zoneType is constructible
    }

    // Place les arbres sur la parcelle selon le type de zone et des probabilités configurées
    placeTreesForPlot(plot) {
        // Vérifier si des assets d'arbres sont chargés
        if (!this.assetLoader || !this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) {
            return; // Pas d'arbres à placer
        }

        // Récupérer les paramètres de config
        const probSidewalk = this.config.treePlacementProbabilitySidewalk;
        const probPark = this.config.treePlacementProbabilityPark;
        const probMargin = this.config.treePlacementProbabilityMargin;
        const sidewalkW = this.config.sidewalkWidth;

        // 1. Arbres sur trottoir (coins et potentiellement le long des bords)
        if (sidewalkW > 0 && probSidewalk > 0) {
            // Coins du trottoir extérieur
            const corners = [
                { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 }, // Haut Gauche
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 }, // Haut Droite
                { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }, // Bas Gauche
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 } // Bas Droite
            ];
            corners.forEach(corner => {
                if (Math.random() < probSidewalk) {
                    this.addTreeInstance(corner.x, corner.z); // Appel interne
                }
            });
            // TODO: Ajouter potentiellement des arbres le long des bords du trottoir aussi
        }

        // 2. Arbres dans la parcelle (parcs ou marges)
        const plotBounds = {
            minX: plot.x, maxX: plot.x + plot.width,
            minZ: plot.z, maxZ: plot.z + plot.depth,
        };

        // Cas spécifique des parcs
        if (plot.zoneType === 'park' && probPark > 0) {
            const area = plot.width * plot.depth;
            const numTreesToTry = Math.ceil(area * probPark); // Nombre d'arbres proportionnel à l'aire
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                // Dans un parc, on suppose qu'on peut placer n'importe où (pas d'occupiedSubZones à vérifier)
                this.addTreeInstance(treeX, treeZ);
            }
        }
        // Cas des marges des autres zones constructibles
        else if (['house', 'building', 'industrial', 'skyscraper'].includes(plot.zoneType) && probMargin > 0) {
            const area = plot.width * plot.depth;
            // Calculer l'aire occupée par les bâtiments/structures principaux
            const occupiedArea = (plot.occupiedSubZones || []).reduce((acc, sz) => acc + (sz.width * sz.depth), 0);
            const marginArea = Math.max(0, area - occupiedArea); // Aire disponible en marge
            const numTreesToTry = Math.ceil(marginArea * probMargin); // Proportionnel à l'aire de marge

            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);

                // Vérifier si l'emplacement est dans une zone déjà occupée
                let isOccupied = false;
                if (plot.occupiedSubZones) {
                    for (const sz of plot.occupiedSubZones) {
                        if (treeX >= sz.x && treeX <= sz.x + sz.width &&
                            treeZ >= sz.z && treeZ <= sz.z + sz.depth) {
                            isOccupied = true;
                            break;
                        }
                    }
                }

                // Si l'emplacement est libre, ajouter l'arbre
                if (!isOccupied) {
                    this.addTreeInstance(treeX, treeZ);
                }
            }
        }
    }

    // Ajoute une instance d'arbre à partir d'un asset aléatoire
    addTreeInstance(treeX, treeZ) {
        const assetInfo = this.assetLoader.getRandomAssetData('tree');
        if (assetInfo) {
            const randomScaleMultiplier = THREE.MathUtils.randFloat(0.85, 1.15);
            const finalUserScale = assetInfo.userScale * randomScaleMultiplier;
            const randomRotationY = Math.random() * Math.PI * 2;
            const instanceMatrix = this.calculateInstanceMatrix(
                treeX, treeZ,
                assetInfo.sizeAfterFitting.y,
                assetInfo.fittingScaleFactor,
                assetInfo.centerOffset,
                finalUserScale,
                randomRotationY
            );
            const modelId = assetInfo.id;
            const type = 'tree';
            if (!this.instanceData[type]) this.instanceData[type] = {};
            if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
            this.instanceData[type][modelId].push(instanceMatrix);
        }
    }

    // Retourne les groupes créés pour insertion dans la scène
    getGroups() {
        return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
    }

    // Réinitialise les données et stocke la référence vers l'assetLoader
	reset(assetLoader) {
        this.assetLoader = assetLoader;
        this.cityManager = null;
        // Réinitialiser instanceData standard
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {}, crosswalk: {} };

        // --- Nettoyer maison procédurale ---
        // Disposer les géométries de base
        Object.values(this.baseHouseGeometries).forEach(geom => geom?.dispose());
        this.baseHouseGeometries = {};
        // Disposer les matériaux de base
        Object.values(this.baseHouseMaterials).forEach(mat => mat?.dispose());
        this.baseHouseMaterials = {};
        // Vider les tableaux de matrices
        this.initializeHouseMatrixArrays(); // Remet les tableaux à []
        // Les InstancedMesh eux-mêmes sont retirés par disposeGroupContents
        this.houseInstancedMeshes = {};
        // -----------------------------------

        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const c = group.children[0];
                 group.remove(c);
                 // Disposer la géométrie SEULEMENT si ce n'est PAS une géométrie de base partagée
                 const isBaseHouseGeo = Object.values(this.baseHouseGeometries).includes(c.geometry);
                 const isBaseStripeGeo = c.geometry === this.stripeBaseGeometry;
                 // Aussi vérifier si c'est une géométrie chargée par AssetLoader (on ne dispose pas ici)
                 let isLoadedAssetGeo = false;
                 if(this.assetLoader){
                     for(const type in this.assetLoader.assets){
                         if(this.assetLoader.assets[type].some(a => a.geometry === c.geometry)){
                             isLoadedAssetGeo = true; break;
                         }
                     }
                 }

                 if (c.geometry && !isBaseHouseGeo && !isBaseStripeGeo && !isLoadedAssetGeo) {
                     c.geometry.dispose();
                 }
                 // Ne pas disposer les matériaux ici (gérés via baseHouseMaterials, materials, ou assetLoader)
             }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup); // Nettoie tous les InstancedMesh

        if (this.stripeBaseGeometry) { this.stripeBaseGeometry.dispose(); this.stripeBaseGeometry = null; }

         // Redéfinir les matériaux/géométries de base pour la prochaine génération
         this.defineHouseBaseMaterials();
         this.defineHouseBaseGeometries();
    }

    // Calcule la matrice d'instance à partir de la position, du scale, d'une rotation optionnelle et du décalage
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0) {
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        const finalHeight = heightAfterFitting * userScale;
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalHeight / 2 + 0.05, centerZ);
        instanceMatrix.multiplyMatrices(scaleMatrix, rotationMatrix);
        instanceMatrix.multiply(recenterMatrix);
        instanceMatrix.premultiply(finalTranslationMatrix);
        return instanceMatrix;
    }

    // Itère sur instanceData pour créer pour chaque asset un InstancedMesh et l'ajouter au groupe principal
    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh (maison procédurale multi-part + assets)...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        // --- 1. Créer les InstancedMesh pour chaque partie de la MAISON ---
        for (const partName in this.baseHouseGeometries) {
            if (this.baseHouseGeometries.hasOwnProperty(partName) && this.baseHouseMaterials.hasOwnProperty(partName) && this.houseInstanceMatrices.hasOwnProperty(partName)) {
                const geometry = this.baseHouseGeometries[partName];
                const material = this.baseHouseMaterials[partName];
                const matrices = this.houseInstanceMatrices[partName];

                if (geometry && material && matrices && matrices.length > 0) {
                    const count = matrices.length;
                    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                    instancedMesh.name = `ProceduralHouse_${partName}_Instanced`;
                    instancedMesh.castShadow = true; // Les parties de la maison projettent des ombres
                    instancedMesh.receiveShadow = true; // Reçoivent aussi

                    matrices.forEach((matrix, index) => {
                        instancedMesh.setMatrixAt(index, matrix);
                    });
                    instancedMesh.instanceMatrix.needsUpdate = true; // TRÈS IMPORTANT

                    this.buildingGroup.add(instancedMesh);
                    this.houseInstancedMeshes[partName] = instancedMesh; // Stocker la référence si besoin
                    instancedMeshCount++;
                    totalInstancesCreated += count;
                    console.log(` -> InstancedMesh pour ${count} maisons (partie: ${partName}) créé.`);
                } else if (matrices && matrices.length === 0) {
                    // Pas d'erreur si juste aucune instance pour cette partie (ex: pas de porte de garage partout)
                    // console.log(` -> Aucune instance pour la partie maison: ${partName}`);
                } else {
                     console.warn(`Manque geometrie/materiau/matrices pour partie maison: ${partName}`);
                }
            }
        }
        // --- FIN création InstancedMesh Maison ---


        // --- 2. Créer les InstancedMesh pour les AUTRES assets (code existant adapté) ---
        if (!this.assetLoader && !this.stripeBaseGeometry) {
             if (!this.stripeBaseGeometry && this.instanceData.crosswalk && Object.keys(this.instanceData.crosswalk).length > 0) { console.error("Impossible de créer InstancedMesh crosswalk: stripeBaseGeometry non dispo."); }
             else if (!this.assetLoader) { console.error("Impossible de créer InstancedMesh: AssetLoader non disponible (pour assets non-maison)."); }
        }

        for (const type in this.instanceData) {
            // *** Ignorer 'house' car traité ci-dessus ***
            if (type === 'house' || !this.instanceData.hasOwnProperty(type)) continue;

            for (const modelId in this.instanceData[type]) {
                if (!this.instanceData[type].hasOwnProperty(modelId)) continue;
                const matrices = this.instanceData[type][modelId];
                if (matrices && matrices.length > 0) {
                    let geometry = null; let material = null; let castShadow = true; let receiveShadow = true;
                    if (type === 'crosswalk') {
                        if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) { geometry = this.stripeBaseGeometry; material = this.materials.crosswalkMaterial; castShadow = false; receiveShadow = true; }
                        else { console.warn(`Géométrie/matériau manquant pour 'crosswalk', ${matrices.length} instances ignorées.`); continue; }
                    } else if (this.assetLoader) {
                        const assetData = this.assetLoader.getAssetDataById(modelId);
                        if (assetData && assetData.geometry && assetData.material) { geometry = assetData.geometry; material = assetData.material; }
                        else { console.warn(`Données asset ${modelId} (type ${type}) invalides, ${matrices.length} instances ignorées.`); continue; }
                    } else { console.warn(`AssetLoader manquant pour type '${type}', ${matrices.length} instances ignorées.`); continue; }

                    const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
                    matrices.forEach((matrix, index) => { instancedMesh.setMatrixAt(index, matrix); });
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    instancedMesh.castShadow = castShadow; instancedMesh.receiveShadow = receiveShadow;
                    instancedMesh.name = `${type}_${modelId}_Instanced`;
                    this.buildingGroup.add(instancedMesh);
                    instancedMeshCount++;
                    totalInstancesCreated += matrices.length;
                }
            }
        }

        // Log final
        if (instancedMeshCount > 0) {
            console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) pour ${totalInstancesCreated} instances (tous types confondus) ajoutés.`);
        } else {
            console.log("Aucune instance (maison ou autre) à créer via InstancedMesh.");
        }
    }

    // Crée le sol de la parcelle (pour tout type de zone)
    createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        let groundMaterial;
        if (plot.zoneType === 'park') {
            groundMaterial = this.materials.parkMaterial;
        } else {
            groundMaterial = this.materials.buildingGroundMaterial;
        }
        const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        // On suppose que plot possède une propriété center calculée en amont
        groundMesh.position.set(plot.center ? plot.center.x : plot.x + plot.width / 2, 0.2, plot.center ? plot.center.z : plot.z + plot.depth / 2);
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;
        this.buildingGroup.add(groundMesh);
    }

    // Subdivision pour le placement de contenus dans la parcelle (pour zones autres que skyscraper)
    subdivideForPlacement(plot) {
        let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': 
                minSubZoneSize = this.config.minHouseSubZoneSize; 
                break;
            case 'building': 
                minSubZoneSize = this.config.minBuildingSubZoneSize; 
                break;
            case 'industrial': 
                minSubZoneSize = this.config.minIndustrialSubZoneSize; 
                break;
            case 'park': 
                minSubZoneSize = this.config.minParkSubZoneSize; 
                break;
            case 'skyscraper':
                // Bien que les gratte-ciels soient gérés séparément, on peut définir la taille minimale ici
                minSubZoneSize = this.config.minSkyscraperSubZoneSize; 
                break;
            default: 
                minSubZoneSize = 10;
        }
        minSubZoneSize = Math.max(minSubZoneSize, 1);
        if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) {
            return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }];
        }
        if (plot.width < minSubZoneSize) {
            let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
            const subDepth = plot.depth / numRows;
            const subZones = [];
            for (let j = 0; j < numRows; j++) {
                subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth });
            }
            return subZones;
        }
        if (plot.depth < minSubZoneSize) {
            let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
            const subWidth = plot.width / numCols;
            const subZones = [];
            for (let i = 0; i < numCols; i++) {
                subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth });
            }
            return subZones;
        }
        let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
        let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
        const subZones = [];
        const subWidth = plot.width / numCols;
        const subDepth = plot.depth / numRows;
        for (let i = 0; i < numCols; i++) {
            for (let j = 0; j < numRows; j++) {
                subZones.push({ x: plot.x + i * subWidth, z: plot.z + j * subDepth, width: subWidth, depth: subDepth });
            }
        }
        return subZones;
    }
}
