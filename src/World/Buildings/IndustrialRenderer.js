// src/World/IndustrialRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'; // Nécessaire pour la génération procédurale

export default class IndustrialRenderer {
    /**
     * Constructeur pour IndustrialRenderer.
     * @param {object} config - La configuration globale (peut être utilisée pour les dimensions, etc.).
     * @param {object} materials - Matériaux partagés (non utilisé ici, mais prévu par la structure).
     * @param {THREE.WebGLRenderer} rendererInstance - Référence au renderer (pour l'anisotropie).
     */
    constructor(config, materials, rendererInstance = null) {
        this.config = config;
        this.materials = materials; // Peut être utilisé pour des matériaux partagés plus tard
        this.rendererInstance = rendererInstance; // Stocker la référence au renderer
        this.assetIdCounter = 0; // Pour générer des IDs uniques

        // Initialisation des géométries et matériaux de base (sera rempli par define...)
        this.baseIndustrialGeometries = {};
        this.baseIndustrialMaterials = {};

        // Définir les matériaux et géométries de base lors de la création
        this._defineBaseMaterials();
        this._defineBaseGeometries();
    }

    // --- Fonctions de création de Textures Procédurales (adaptées en méthodes de classe) ---

    /**
     * Crée une texture de béton simple.
     */
    _createConcreteTexture(size = 256, baseColor = '#C0C0C0', noiseColor = '#A0A0A0', noiseAmount = 0.3) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        const noiseR = parseInt(noiseColor.slice(1, 3), 16);
        const noiseG = parseInt(noiseColor.slice(3, 5), 16);
        const noiseB = parseInt(noiseColor.slice(5, 7), 16);
        for (let i = 0; i < data.length; i += 4) {
            if (Math.random() < noiseAmount) {
                const variation = (Math.random() - 0.5) * 30;
                data[i] = Math.max(0, Math.min(255, noiseR + variation));
                data[i + 1] = Math.max(0, Math.min(255, noiseG + variation));
                data[i + 2] = Math.max(0, Math.min(255, noiseB + variation));
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.rendererInstance ? this.rendererInstance.capabilities.getMaxAnisotropy() : 16;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture de tôle métallique ondulée pour le toit (plus contrastée).
     */
    _createCorrugatedMetalTexture(size = 256, baseColor = '#90A0B0', shadowColor = '#405060', waveHeight = 6, waveLength = 24) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = shadowColor;
        ctx.lineWidth = waveHeight;
        for (let x = waveLength / 4; x < size; x += waveLength / 2) {
             ctx.beginPath();
             ctx.moveTo(x, 0);
             ctx.lineTo(x, size);
             ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.rendererInstance ? this.rendererInstance.capabilities.getMaxAnisotropy() : 16;
        texture.needsUpdate = true;
        return texture;
    }


    /**
     * Crée une texture grise avec des anneaux rouges pour les cheminées.
     */
    _createChimneyTexture(size = 128, baseColor = '#606060', ringColor = '#FF0000', ringCount = 2, ringHeightRatio = 0.08) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = ringColor;
        const ringHeight = size * ringHeightRatio;
        const ringSpacing = ringHeight * 0.5;
        const topOffset = ringHeight * 0.5;
        for (let i = 0; i < ringCount; i++) {
            const y = topOffset + i * (ringHeight + ringSpacing);
            if (y + ringHeight < size) {
                ctx.fillRect(0, y, size, ringHeight);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.rendererInstance ? this.rendererInstance.capabilities.getMaxAnisotropy() : 16;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Définit les matériaux de base utilisés pour les différentes parties de l'usine.
     * Stocke les matériaux dans this.baseIndustrialMaterials.
     * @private
     */
    _defineBaseMaterials() {
        // Création des textures UNE SEULE FOIS
        const concreteTexture = this._createConcreteTexture(256, '#C8C8C8', '#A8A8A8', 0.4);
        const backConcreteTexture = this._createConcreteTexture(256, '#B0B0B0', '#959595', 0.35);
        const metalSheetRoofTexture = this._createCorrugatedMetalTexture(128, '#90A0B0', '#405060', 6, 24);
        const chimneyTexture = this._createChimneyTexture(128, '#707070', '#D00000', 2, 0.04);

        this.baseIndustrialMaterials = {
            factoryWall: new THREE.MeshStandardMaterial({
                map: concreteTexture,
                roughness: 0.8,
                metalness: 0.1,
                name: "IndustrialFactoryWallMat" // Nom pour débogage
            }),
            backWall: new THREE.MeshStandardMaterial({
                map: backConcreteTexture,
                roughness: 0.85,
                metalness: 0.1,
                name: "IndustrialBackWallMat"
            }),
            roof: new THREE.MeshStandardMaterial({
                map: metalSheetRoofTexture,
                roughness: 0.5,
                metalness: 0.5,
                name: "IndustrialRoofMat"
            }),
            chimney: new THREE.MeshStandardMaterial({
                map: chimneyTexture,
                roughness: 0.7,
                name: "IndustrialChimneyMat"
            }),
            doorPanel: new THREE.MeshStandardMaterial({
                color: 0xAAAAAA,
                roughness: 0.4,
                metalness: 0.8,
                name: "IndustrialDoorPanelMat"
            }),
            windowPane: new THREE.MeshStandardMaterial({
                color: 0xADD8E6,
                roughness: 0.2,
                metalness: 0.1,
                transparent: true,
                opacity: 0.6,
                name: "IndustrialWindowPaneMat"
            }),
            windowFrame: new THREE.MeshStandardMaterial({
                color: 0x505050, // Gris foncé
                roughness: 0.7,
                metalness: 0.2,
                name: "IndustrialWindowFrameMat"
            }),
            chimneyTop: new THREE.MeshStandardMaterial({
                color: 0x303030,
                name: "IndustrialChimneyTopMat"
            }),
            // Ajouter d'autres matériaux si nécessaire
        };
    }

    /**
     * Définit les géométries de base pour les différentes parties de l'usine.
     * Stocke les géométries dans this.baseIndustrialGeometries.
     * @private
     */
    _defineBaseGeometries() {
        // --- Dimensions (extraites du code HTML) ---
        const factoryWidth = 24;
        const factoryDepth = 16;
        const factoryHeight = 8;
        const backBuildingWidth = factoryWidth;
        const backBuildingDepth = 12 * 0.7;
        const backBuildingHeight = factoryHeight * 0.7;

        const numTeeth = 6;
        const toothWidth = factoryWidth / numTeeth;
        const toothVerticalHeight = 2.0;
        const toothSlopeHeight = 2.5;
        const totalToothHeight = toothVerticalHeight + toothSlopeHeight;

        const doorWidth = 5;
        const doorHeight = 6;
        const doorDepth = 0.15;
        const numPanels = 8;
        const panelHeight = doorHeight / numPanels;
        const panelSpacing = 0.02;

        const windowWidth = 2.5;
        const windowHeight = 2;
        const windowFrameDepth = 0.12;
        const windowFrameThickness = 0.1;

        const chimneyHeight = 16;
        const chimneyRadiusBottom = 3;
        const chimneyRadiusTop = 1.5;
        const chimneyWallThickness = 0.3;
        const chimneyRadialSegments = 8;

        this.baseIndustrialGeometries = {};

        // --- Géométries principales ---
        this.baseIndustrialGeometries.factoryBody = new THREE.BoxGeometry(
            factoryWidth, factoryHeight, factoryDepth
        );
        // NOTE: Pas de translation ici, la position sera gérée par la matrice d'instance

        this.baseIndustrialGeometries.backBuildingBody = new THREE.BoxGeometry(
            backBuildingWidth, backBuildingHeight, backBuildingDepth
        );

        // --- Géométrie du toit (combinée) ---
        // On va créer les dents et les fusionner
        const roofToothGeometries = [];
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, toothVerticalHeight);
        shape.lineTo(toothWidth, totalToothHeight);
        shape.lineTo(toothWidth, 0);
        shape.lineTo(0, 0);
        const extrudeSettings = { steps: 1, depth: factoryDepth, bevelEnabled: false };
        const singleToothGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        for (let i = 0; i < numTeeth; i++) {
            const toothMatrix = new THREE.Matrix4();
            // Positionner chaque dent RELATIVEMENT à l'origine du toit (0,0,0)
            toothMatrix.makeTranslation(-factoryWidth / 2 + i * toothWidth, 0, 0);
            const clonedTooth = singleToothGeometry.clone().applyMatrix4(toothMatrix);
            roofToothGeometries.push(clonedTooth);
        }
        this.baseIndustrialGeometries.sawtoothRoof = mergeGeometries(roofToothGeometries, false);
        singleToothGeometry.dispose(); // Nettoyer la géométrie de base
        roofToothGeometries.forEach(g => g.dispose()); // Nettoyer les clones

        // --- Géométrie de la porte (combinée) ---
        const doorPanelGeometries = [];
        const singlePanelGeometry = new THREE.BoxGeometry(doorWidth, panelHeight - panelSpacing, doorDepth);
        for (let i = 0; i < numPanels; i++) {
            const panelMatrix = new THREE.Matrix4();
            // Positionner chaque panneau RELATIVEMENT à l'origine de la porte (0,0,0)
            panelMatrix.makeTranslation(0, panelHeight / 2 + i * panelHeight - doorHeight / 2, 0); // Centrer verticalement
            const clonedPanel = singlePanelGeometry.clone().applyMatrix4(panelMatrix);
            doorPanelGeometries.push(clonedPanel);
        }
        this.baseIndustrialGeometries.warehouseDoor = mergeGeometries(doorPanelGeometries, false);
        singlePanelGeometry.dispose();
        doorPanelGeometries.forEach(g => g.dispose());

        // --- Géométries des Fenêtres (cadre + vitre) ---
        // Cadre
        const frameExtWidth = windowWidth;
        const frameExtHeight = windowHeight;
        const frameExtDepth = windowFrameDepth;
        const sideBarGeo = new THREE.BoxGeometry(windowFrameThickness, frameExtHeight, frameExtDepth);
        const topBotBarGeo = new THREE.BoxGeometry(frameExtWidth - windowFrameThickness * 2, windowFrameThickness, frameExtDepth);
        const leftBar = sideBarGeo.clone().translate(-frameExtWidth / 2 + windowFrameThickness / 2, 0, 0);
        const rightBar = sideBarGeo.clone().translate(frameExtWidth / 2 - windowFrameThickness / 2, 0, 0);
        const topBar = topBotBarGeo.clone().translate(0, frameExtHeight / 2 - windowFrameThickness / 2, 0);
        const bottomBar = topBotBarGeo.clone().translate(0, -frameExtHeight / 2 + windowFrameThickness / 2, 0);
        this.baseIndustrialGeometries.windowFrame = mergeGeometries([leftBar, rightBar, topBar, bottomBar], false);
        sideBarGeo.dispose(); topBotBarGeo.dispose(); // Nettoyer bases
        // Vitre
        const paneWidth = frameExtWidth - windowFrameThickness * 2;
        const paneHeight = frameExtHeight - windowFrameThickness * 2;
        const paneDepth = 0.03;
        this.baseIndustrialGeometries.windowPane = new THREE.BoxGeometry(paneWidth, paneHeight, paneDepth);
        // La vitre sera positionnée légèrement en retrait DANS la fonction de création d'instance

        // --- Géométries Cheminées ---
        this.baseIndustrialGeometries.chimneyBody = new THREE.CylinderGeometry(
            chimneyRadiusTop, chimneyRadiusBottom, chimneyHeight, chimneyRadialSegments
        );
        this.baseIndustrialGeometries.chimneyTopRing = new THREE.RingGeometry(
            chimneyRadiusTop - chimneyWallThickness, chimneyRadiusTop, chimneyRadialSegments
        );
        this.baseIndustrialGeometries.chimneyTopRing.rotateX(-Math.PI / 2); // Orienter l'anneau
        // Le positionnement se fera dans la fonction de création d'instance
    }

    /**
     * Génère les données pour un asset d'usine procédurale complet.
     * Retourne un objet utilisable par CityAssetLoader ou PlotContentGenerator.
     *
     * @param {number} baseWidth - Largeur cible (pour le facteur d'échelle global).
     * @param {number} baseHeight - Hauteur cible.
     * @param {number} baseDepth - Profondeur cible.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur.
     * @returns {object|null} L'asset généré ou null en cas d'erreur.
     */
    generateProceduralIndustrial(baseWidth, baseHeight, baseDepth, userScale = 1) {
        //console.log("Generating procedural industrial building asset...");
        const industrialGroup = new THREE.Group();

        // --- Récupérer Géométries et Matériaux ---
        const factoryBodyGeom = this.baseIndustrialGeometries.factoryBody;
        const backBuildingBodyGeom = this.baseIndustrialGeometries.backBuildingBody;
        const sawtoothRoofGeom = this.baseIndustrialGeometries.sawtoothRoof;
        const warehouseDoorGeom = this.baseIndustrialGeometries.warehouseDoor;
        const windowFrameGeom = this.baseIndustrialGeometries.windowFrame;
        const windowPaneGeom = this.baseIndustrialGeometries.windowPane;
        const chimneyBodyGeom = this.baseIndustrialGeometries.chimneyBody;
        const chimneyTopRingGeom = this.baseIndustrialGeometries.chimneyTopRing;

        const factoryWallMat = this.baseIndustrialMaterials.factoryWall;
        const backWallMat = this.baseIndustrialMaterials.backWall;
        const roofMat = this.baseIndustrialMaterials.roof;
        const doorPanelMat = this.baseIndustrialMaterials.doorPanel;
        const windowFrameMat = this.baseIndustrialMaterials.windowFrame;
        const windowPaneMat = this.baseIndustrialMaterials.windowPane;
        const chimneyMat = this.baseIndustrialMaterials.chimney;
        const chimneyTopMat = this.baseIndustrialMaterials.chimneyTop;

        // --- Dimensions (pour positionnement local) ---
        const factoryWidth = 24; const factoryDepth = 16; const factoryHeight = 8;
        const backBuildingWidth = factoryWidth; const backBuildingDepth = 12 * 0.7; const backBuildingHeight = factoryHeight * 0.7;
        const overlapAmount = 0.5;
        const numTeeth = 6; const totalToothHeight = 2.0 + 2.5; const roofSinkAmount = 0.1;
        const doorWidth = 5; const doorHeight = 6; const placementOffset = 0.15;
        const windowWidth = 2.5; const windowHeight = 2; const windowYPos = factoryHeight * 0.6;
        const windowFrameDepth = 0.12; const paneDepth = 0.03;
        const chimneyHeight = 16; const chimneyBaseZOffset = -factoryDepth / 2 - backBuildingDepth / 2 + overlapAmount;
        const chimneySpacingX = backBuildingWidth * 0.3;

        // --- Assemblage des Meshes dans le groupe (positions relatives) ---

        // 1. Corps Principal
        const factoryMesh = new THREE.Mesh(factoryBodyGeom, factoryWallMat);
        factoryMesh.position.y = factoryHeight / 2; // Centré verticalement à l'origine
        industrialGroup.add(factoryMesh);

        // 2. Bâtiment Arrière
        const backBuildingMesh = new THREE.Mesh(backBuildingBodyGeom, backWallMat);
        backBuildingMesh.position.set(0, backBuildingHeight / 2, -factoryDepth / 2 - backBuildingDepth / 2 + overlapAmount);
        industrialGroup.add(backBuildingMesh);

        // 3. Toit
        const roofMesh = new THREE.Mesh(sawtoothRoofGeom, roofMat);
        roofMesh.position.y = factoryHeight - roofSinkAmount; // Positionné sur le corps principal
        roofMesh.position.z = -factoryDepth / 2; // Position Z du toit par rapport à l'origine
        industrialGroup.add(roofMesh);

        // 4. Porte
        const doorMesh = new THREE.Mesh(warehouseDoorGeom, doorPanelMat);
        doorMesh.position.set(0, doorHeight / 2, factoryDepth / 2 - placementOffset);
        industrialGroup.add(doorMesh);

        // 5. Fenêtres (créer un groupe par fenêtre pour gérer les 2 matériaux)
        const createWindowInstance = (x, y, z, rotationY = 0) => {
            const windowGroup = new THREE.Group();
            const frameMesh = new THREE.Mesh(windowFrameGeom, windowFrameMat);
            const paneMesh = new THREE.Mesh(windowPaneGeom, windowPaneMat);
            // Positionner la vitre légèrement en retrait DANS le cadre
            paneMesh.position.z = windowFrameDepth / 2 - paneDepth / 2 - 0.01;
            windowGroup.add(frameMesh);
            windowGroup.add(paneMesh);

            // Positionner le groupe entier
            const surfacePositionX = factoryWidth / 2;
            const surfacePositionZ = factoryDepth / 2;
            const inwardOffset = placementOffset;

            if (Math.abs(rotationY - Math.PI / 2) < 0.1) { // Droite
                windowGroup.position.set(surfacePositionX - inwardOffset, y, z);
            } else if (Math.abs(rotationY + Math.PI / 2) < 0.1) { // Gauche
                windowGroup.position.set(-surfacePositionX + inwardOffset, y, z);
            } else if (Math.abs(rotationY) < 0.1) { // Avant
                windowGroup.position.set(x, y, surfacePositionZ - inwardOffset);
            } else { // Arrière (non défini dans l'exemple original, mais pourrait être ajouté)
                 windowGroup.position.set(x, y, z);
            }
            windowGroup.rotation.y = rotationY;
            industrialGroup.add(windowGroup);
        };

        const numWindowsSideMain = 3;
        const sideSpacingMain = (factoryDepth - numWindowsSideMain * windowWidth) / (numWindowsSideMain + 1);
        const frontAvailableWidthMain = (factoryWidth - doorWidth) / 2;
        const numWindowsFrontSideMain = Math.floor(frontAvailableWidthMain / (windowWidth + sideSpacingMain));
        const frontSpacingMain = (frontAvailableWidthMain - numWindowsFrontSideMain * windowWidth) / (numWindowsFrontSideMain + 1);

        for (let i = 0; i < numWindowsSideMain; i++) {
            const zPos = -factoryDepth / 2 + sideSpacingMain * (i + 1) + windowWidth * i + windowWidth / 2;
            createWindowInstance(0, windowYPos, zPos, Math.PI / 2); // Droite
            createWindowInstance(0, windowYPos, zPos, -Math.PI / 2); // Gauche
        }
        for (let i = 0; i < numWindowsFrontSideMain; i++) {
            const xPosRight = doorWidth / 2 + frontSpacingMain * (i + 1) + windowWidth * i + windowWidth / 2;
            createWindowInstance(xPosRight, windowYPos, 0, 0); // Avant Droite
            const xPosLeft = -doorWidth / 2 - frontSpacingMain * (i + 1) - windowWidth * i - windowWidth / 2;
            createWindowInstance(xPosLeft, windowYPos, 0, 0); // Avant Gauche
        }

        // 6. Cheminées (groupe par cheminée pour les 2 matériaux)
        const createChimneyInstance = (x, z) => {
            const chimneyGroup = new THREE.Group();
            const chimneyBodyMesh = new THREE.Mesh(chimneyBodyGeom, chimneyMat);
            const chimneyTopRingMesh = new THREE.Mesh(chimneyTopRingGeom, chimneyTopMat);
            chimneyTopRingMesh.position.y = chimneyHeight / 2 + 0.01; // Positionné sur le corps
            chimneyGroup.add(chimneyBodyMesh);
            chimneyGroup.add(chimneyTopRingMesh);
            // Positionner le groupe entier
            chimneyGroup.position.set(x, backBuildingHeight + chimneyHeight / 2, z);
            industrialGroup.add(chimneyGroup);
        };
        createChimneyInstance(chimneySpacingX, chimneyBaseZOffset);
        createChimneyInstance(-chimneySpacingX, chimneyBaseZOffset);

        // --- Regroupement final par matériau pour l'asset ---
        const materialMap = new Map();
        const allGeometries = []; // Pour calculer la BBox globale

        industrialGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                // Assurer que la matrice mondiale est à jour si on l'utilise
                child.updateMatrixWorld(true); // Force mise à jour depuis le parent (industrialGroup)
                const clonedGeom = child.geometry.clone();
                // Appliquer la transformation MONDIALE de l'enfant
                clonedGeom.applyMatrix4(child.matrixWorld);

                // Ajouter à la liste pour BBox globale
                allGeometries.push(clonedGeom);

                // Regrouper par nom de matériau
                const matName = child.material.name || 'default_industrial_mat';
                if (!materialMap.has(matName)) {
                    // Cloner le matériau lors de la première rencontre pour éviter partage non désiré
                    materialMap.set(matName, { material: child.material.clone(), geoms: [] });
                }
                materialMap.get(matName).geoms.push(clonedGeom);
            }
            else if (child.isGroup && child.children.length > 0) {
                 // Gérer les groupes (fenêtres, cheminées)
                 child.updateMatrixWorld(true); // Mettre à jour la matrice du groupe enfant
                 child.children.forEach(grandChild => {
                     if (grandChild.isMesh && grandChild.geometry && grandChild.material) {
                          grandChild.updateMatrixWorld(true); // Assurer que la matrice du petit-enfant est à jour
                          const clonedGeom = grandChild.geometry.clone();
                          // Appliquer la transformation MONDIALE du petit-enfant
                          clonedGeom.applyMatrix4(grandChild.matrixWorld);

                          allGeometries.push(clonedGeom);

                          const matName = grandChild.material.name || 'default_industrial_mat';
                           if (!materialMap.has(matName)) {
                               materialMap.set(matName, { material: grandChild.material.clone(), geoms: [] });
                           }
                           materialMap.get(matName).geoms.push(clonedGeom);
                     }
                 });
            }
        });


        if (allGeometries.length === 0) {
            console.error("Industrial Procedural Generation: No valid geometries found.");
            return null;
        }

        // *** DEBUT CORRECTION INDICE ***
        // Vérifier et ajouter l'index si nécessaire AVANT la fusion globale
        const hasIndexGlobal = allGeometries.some(g => g.index !== null);
        const allHaveIndexGlobal = allGeometries.every(g => g.index !== null);

        if (hasIndexGlobal && !allHaveIndexGlobal) {
             console.warn("Industrial Procedural: Geometries have mixed index states before global merge. Adding index to non-indexed.");
            allGeometries.forEach(geom => {
                if (geom.index === null) {
                    const position = geom.attributes.position;
                    if (position) {
                        const count = position.count;
                        const indices = (count > 65535) ? new Uint32Array(count) : new Uint16Array(count);
                        for (let i = 0; i < count; i++) indices[i] = i;
                        geom.setIndex(new THREE.BufferAttribute(indices, 1));
                    } else {
                         console.error("Industrial Procedural: Geometry missing position attribute, cannot add index.");
                    }
                }
            });
        } else if (!hasIndexGlobal) {
             console.warn("Industrial Procedural: No geometries have index before global merge. Adding index to all.");
             allGeometries.forEach(geom => {
                const position = geom.attributes.position;
                 if (position) {
                     const count = position.count;
                     const indices = (count > 65535) ? new Uint32Array(count) : new Uint16Array(count);
                     for (let i = 0; i < count; i++) indices[i] = i;
                     geom.setIndex(new THREE.BufferAttribute(indices, 1));
                 } else {
                      console.error("Industrial Procedural: Geometry missing position attribute, cannot add index.");
                 }
             });
        }
        // *** FIN CORRECTION INDICE ***

        // Calculer la BBox globale et le centrage (maintenant que les indices sont cohérents)
        const globalMerged = mergeGeometries(allGeometries, false); // Ligne 487
        if (!globalMerged) {
            console.error("Industrial Procedural Generation: Failed to merge geometries for bounding box calculation."); // Ligne 489
            allGeometries.forEach(g => g.dispose());
            return null;
        }
        globalMerged.computeBoundingBox();
        const globalBBox = globalMerged.boundingBox;
        const globalMin = globalBBox.min.clone(); // Stocker le Y minimum
        const globalCenter = new THREE.Vector3();
        globalBBox.getCenter(globalCenter);
        const globalSize = new THREE.Vector3();
        globalBBox.getSize(globalSize);
        globalMerged.dispose(); // Nettoyer la géométrie globale fusionnée

        // Assurer que les tailles ne sont pas nulles/infinies
        globalSize.x = Math.max(globalSize.x, 0.001);
        globalSize.y = Math.max(globalSize.y, 0.001);
        globalSize.z = Math.max(globalSize.z, 0.001);

        // Calculer le facteur d'échelle pour correspondre aux dimensions de base demandées
        const fittingScaleFactor = Math.min(baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z);
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        // Fusionner les géométries par matériau et recentrer
        const parts = [];
        materialMap.forEach((groupData, key) => {
            if (groupData.geoms.length === 0) return;

             // *** DEBUT CORRECTION INDICE PAR GROUPE ***
             const hasIndexGroup = groupData.geoms.some(g => g.index !== null);
             const allHaveIndexGroup = groupData.geoms.every(g => g.index !== null);
             if (hasIndexGroup && !allHaveIndexGroup) {
                  console.warn(`Industrial Proc: Geometries for material "${key}" have mixed index states. Adding index.`);
                  groupData.geoms.forEach(geom => {
                      if (geom.index === null) {
                          const position = geom.attributes.position;
                           if (position) {
                               const count = position.count;
                               const indices = (count > 65535) ? new Uint32Array(count) : new Uint16Array(count);
                               for (let i = 0; i < count; i++) indices[i] = i;
                               geom.setIndex(new THREE.BufferAttribute(indices, 1));
                           } else { console.error(`Industrial Proc: Geometry for "${key}" missing position, cannot add index.`);}
                      }
                  });
             } else if (!hasIndexGroup && groupData.geoms.length > 0) { // S'assurer qu'il y a des géométries avant d'ajouter
                 console.warn(`Industrial Proc: No geometries for material "${key}" have index. Adding index to all.`);
                 groupData.geoms.forEach(geom => {
                     const position = geom.attributes.position;
                     if (position) {
                         const count = position.count;
                         const indices = (count > 65535) ? new Uint32Array(count) : new Uint16Array(count);
                         for (let i = 0; i < count; i++) indices[i] = i;
                         geom.setIndex(new THREE.BufferAttribute(indices, 1));
                     } else { console.error(`Industrial Proc: Geometry for "${key}" missing position, cannot add index.`); }
                 });
             }
             // *** FIN CORRECTION INDICE PAR GROUPE ***

            const mergedPartGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeom) {
                console.error(`Industrial Procedural Generation: Failed to merge geometries for material group "${key}".`);
                groupData.geoms.forEach(g => g.dispose()); // Nettoyer les géométries non fusionnées
                return;
            }
            // Recentrer la géométrie fusionnée de la partie
            mergedPartGeom.translate(-globalCenter.x, -globalMin.y, -globalCenter.z);
            // Utiliser le matériau cloné stocké dans groupData
            const finalMaterial = groupData.material;
            finalMaterial.name = `ProcIndMat_${key}_${this.assetIdCounter}`; // Nom unique pour debug
            parts.push({ geometry: mergedPartGeom, material: finalMaterial });

            // Nettoyer les géométries clonées utilisées pour cette partie
            groupData.geoms.forEach(g => g.dispose());
        });

        // Nettoyer toutes les géométries initiales de allGeometries car elles ont été clonées/fusionnées
        allGeometries.forEach(g => g.dispose());

        // Créer l'objet asset final
        const asset = {
            id: `industrial_procedural_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(0, globalSize.y / 2, 0), // Centre est maintenant à l'origine (0, moitié hauteur, 0)
            sizeAfterFitting: sizeAfterFitting
        };
        //console.log("Procedural industrial asset generated:", asset);
        return asset;
    }

    /**
     * Réinitialise le renderer (nettoie géométries/matériaux de base).
     */
    reset() {
        // Disposer les géométries de base
        Object.values(this.baseIndustrialGeometries).forEach(geom => geom?.dispose());
        this.baseIndustrialGeometries = {};

        // Disposer les matériaux de base (attention aux textures partagées si gérées ici)
        Object.values(this.baseIndustrialMaterials).forEach(mat => {
            mat?.map?.dispose(); // Dispose la texture si elle existe
            mat?.dispose();
        });
        this.baseIndustrialMaterials = {};

        //console.log("IndustrialRenderer reset.");
        // Redéfinir après reset si nécessaire
        // this._defineBaseMaterials();
        // this._defineBaseGeometries();
    }
}

// Exporter la fonction de génération procédurale pour CityAssetLoader
export function generateProceduralIndustrial(baseWidth, baseHeight, baseDepth, options, config, materials, rendererInstance) {
    // Créer une instance temporaire de IndustrialRenderer pour la génération
    // *** AJOUT : Passer rendererInstance ***
    const tempRenderer = new IndustrialRenderer(config, materials, rendererInstance);
    const asset = tempRenderer.generateProceduralIndustrial(baseWidth, baseHeight, baseDepth, options?.userScale ?? 1);
    tempRenderer.reset(); // Nettoyer les ressources temporaires
    return asset;
}