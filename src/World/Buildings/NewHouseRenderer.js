// src/World/Buildings/NewHouseRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions de création de textures (extraites du HTML) ---

/**
 * Crée une texture de mur simple avec des lignes horizontales.
 * @param {THREE.WebGLRenderer} [renderer=null] - Instance optionnelle du renderer pour l'anisotropie.
 * @returns {THREE.CanvasTexture} La texture générée.
 */
function createWallTexture(renderer = null) {
    const canvas = document.createElement('canvas');
    const canvasSize = 256;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d3d3d3'; // Gris clair
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.strokeStyle = '#b0b0b0'; // Lignes plus sombres
    ctx.lineWidth = 1.0;
    const lineSpacing = 8 * (canvasSize / 128);

    for (let y = lineSpacing / 2; y < canvasSize; y += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasSize, y);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Crée une texture de tuiles courbes pour le toit.
 * @param {THREE.WebGLRenderer} [renderer=null] - Instance optionnelle du renderer pour l'anisotropie.
 * @returns {THREE.CanvasTexture} La texture générée.
 */
function createRoofTexture(renderer = null) {
    const canvas = document.createElement('canvas');
    const canvasSize = 256;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#b03a2e'; // Rouge tuile
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const tileWidth = canvasSize / 5;
    const tileHeight = canvasSize / 6;
    const tileColorDarker = '#8e2e24'; // Contour plus sombre
    const overlapV = 0.7;
    const overlapH = 0.05;

    ctx.strokeStyle = tileColorDarker;
    ctx.lineWidth = 2;
    ctx.fillStyle = '#b03a2e'; // Même couleur que le fond pour le remplissage

    for (let row = 0; row < (canvasSize / (tileHeight * overlapV)) + 1; row++) {
        const offsetY = row * tileHeight * overlapV;
        const offsetX = (row % 2 === 0) ? 0 : tileWidth / 2;

        for (let col = -1; col < (canvasSize / tileWidth) + 1; col++) {
            const x = col * tileWidth + offsetX;
            const y = offsetY;

            ctx.beginPath();
            ctx.moveTo(x - tileWidth * overlapH, y);
            ctx.lineTo(x - tileWidth * overlapH, y + tileHeight * 0.8);
            ctx.quadraticCurveTo(x + tileWidth / 2, y + tileHeight * 1.15, x + tileWidth * (1 + overlapH), y + tileHeight * 0.8);
            ctx.lineTo(x + tileWidth * (1 + overlapH), y);
            ctx.closePath();
            // Note: Remplir AVANT de tracer le contour pour un meilleur look
            ctx.fill();
            ctx.stroke();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Fonction de base pour dessiner le motif de briques.
 * @param {CanvasRenderingContext2D} ctx Le contexte du canvas.
 * @param {number} canvasSize La taille du canvas.
 */
function drawBrickPattern(ctx, canvasSize) {
    const mortarColor = '#c0c0c0'; // Gris clair mortier
    const brickColor = '#a0522d'; // Brun-rouge brique
    const brickWidth = canvasSize / 4;
    const brickHeight = canvasSize / 8;
    const mortarThickness = 4 * (canvasSize / 256);

    // Fond (mortier)
    ctx.fillStyle = mortarColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.fillStyle = brickColor;

    // Dessiner les rangées de briques
    for (let row = 0; row < (canvasSize / brickHeight) + 1; row++) {
        const y = row * brickHeight;
        const offsetX = (row % 2 === 0) ? 0 : brickWidth / 2;

        for (let col = -1; col < (canvasSize / brickWidth) + 1; col++) {
            const x = col * brickWidth + offsetX;
            ctx.fillRect(
                x + mortarThickness / 2,
                y + mortarThickness / 2,
                brickWidth - mortarThickness,
                brickHeight - mortarThickness
            );
        }
    }
}

/**
 * Crée une texture de briques simple.
 * @param {THREE.WebGLRenderer} [renderer=null] - Instance optionnelle du renderer pour l'anisotropie.
 * @returns {THREE.CanvasTexture} La texture générée.
 */
function createBrickTexture(renderer = null) {
    const canvas = document.createElement('canvas');
    const canvasSize = 256;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    drawBrickPattern(ctx, canvasSize); // Utiliser la fonction de dessin

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Crée la texture pour le dessus du chapeau de cheminée (briques + trou noir).
 * @param {THREE.WebGLRenderer} [renderer=null] - Instance optionnelle du renderer pour l'anisotropie.
 * @returns {THREE.CanvasTexture} La texture générée.
 */
function createChimneyCapTopTexture(renderer = null) {
    const canvas = document.createElement('canvas');
    const canvasSize = 256;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    // 1. Dessiner le motif de briques en fond
    drawBrickPattern(ctx, canvasSize);

    // 2. Dessiner le carré noir (trou) par-dessus
    const borderRatio = 0.15;
    const holeSize = canvasSize * (1 - borderRatio * 2);
    const holeOffset = canvasSize * borderRatio;

    ctx.fillStyle = '#000000'; // Noir
    ctx.fillRect(holeOffset, holeOffset, holeSize, holeSize);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    texture.needsUpdate = true;
    return texture;
}

// --- Fin Fonctions Textures ---

export default class NewHouseRenderer {
    /**
     * @param {object} config - Configuration globale.
     * @param {object} materials - Matériaux partagés (non utilisés ici pour les textures procédurales).
     * @param {THREE.WebGLRenderer} [rendererInstance=null] - Référence au renderer principal.
     */
    constructor(config, materials, rendererInstance = null) {
        this.config = config;
        // Note: materials n'est pas utilisé ici car on génère les textures procéduralement.
        this.rendererInstance = rendererInstance;
        this.assetIdCounter = 0;

        // Création et stockage des textures partagées pour ce renderer
        this.sharedTextures = {
            wall: createWallTexture(this.rendererInstance),
            roof: createRoofTexture(this.rendererInstance),
            brick: createBrickTexture(this.rendererInstance),
            chimneyTop: createChimneyCapTopTexture(this.rendererInstance),
        };

        // Définition des matériaux utilisant ces textures partagées
        this.localMaterials = {
            wall: new THREE.MeshStandardMaterial({ map: this.sharedTextures.wall, roughness: 0.9, name: "HouseBase1Mat" }),
            roof: new THREE.MeshStandardMaterial({ map: this.sharedTextures.roof, roughness: 0.8, name: "HouseRoofMat" }),
            gable: new THREE.MeshStandardMaterial({ map: this.sharedTextures.wall.clone(), roughness: 0.9, side: THREE.DoubleSide, name: "HouseBase2Mat" }),
            chimneyBrick: new THREE.MeshStandardMaterial({ map: this.sharedTextures.brick, roughness: 0.85, name: "HouseBase1Mat" }),
            chimneyTop: new THREE.MeshStandardMaterial({ map: this.sharedTextures.chimneyTop, roughness: 0.85, name: "HouseBase2Mat" }),
            door: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, name: "HouseDoorMat" }),
            garageDoor: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, name: "HouseGarageDoorMat" }),
            windowFrame: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, name: "HouseBase1Mat" }),
            windowPane: new THREE.MeshStandardMaterial({ color: 0xadd8e6, transparent: true, opacity: 0.6, roughness: 0.3, name: "HouseBase2Mat" }),
            step: new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.8, name: "HouseBase1Mat" }),
        };
    }

    /**
     * Génère un asset procédural pour la maison de type B.
     * Retourne un objet { id, parts:[{ geometry, material }], fittingScaleFactor, centerOffset, sizeAfterFitting }.
     */
    generateProceduralHouse(baseWidth = 6, baseHeight = 4, baseDepth = 5, userScale = 2) {
        const houseGroup = new THREE.Group(); // Groupe temporaire pour assemblage

        // --- Copier/Adapter les Dimensions & Logique de createHouse ---
        // Appliquer le scale global directement aux dimensions de base
        const scale = userScale; // Variable scale globale pour modifier facilement la taille
        const wallHeight = 4 * scale; 
        const wallWidth = 6 * scale; 
        const wallDepth = 5 * scale;
        const roofHeight = 2 * scale; 
        const roofOverhang = 0.4 * scale; 
        const wallSegments = 4; 
        const roofThickness = 0.15 * scale; 
        const gableInset = 0.075 * scale;
        const roofOffsetY = -0.1 * scale; // Ajustement vertical du toit par rapport aux murs

        // Échelles "mondiales" des textures (adaptées du HTML)
        const wallTextureWorldScaleU = 4; const wallTextureWorldScaleV = 4;
        const roofTextureWorldScaleU = 5; const roofTextureWorldScaleV = 4;
        const brickTextureWorldScaleU = 1; const brickTextureWorldScaleV = 1;

        // --- Matériaux (références aux matériaux locaux) ---
        const wallMaterial = this.localMaterials.wall;
        const roofMaterial = this.localMaterials.roof;
        const gableMaterial = this.localMaterials.gable;
        const chimneyBrickMaterial = this.localMaterials.chimneyBrick;
        const chimneyTopMaterial = this.localMaterials.chimneyTop;
        const doorMaterial = this.localMaterials.door;
        const windowFrameMaterial = this.localMaterials.windowFrame;
        const windowPaneMaterial = this.localMaterials.windowPane;
        const stepMaterial = this.localMaterials.step;

        // Appliquer repeat aux textures clonées/locales si nécessaire (pour gable etc.)
        // Note: l'application du repeat se fait souvent sur la texture elle-même avant de l'assigner
        //       au matériau, ou via material.map.repeat.set()
        if (gableMaterial.map) {
            const gableBaseWidth = wallWidth;
            const gableVerticalStretchFactor = 1.5; // Facteur d'étirement vertical pour texture pignon
            gableMaterial.map.repeat.set(
                gableBaseWidth / wallTextureWorldScaleU,
                roofHeight / (wallTextureWorldScaleV * gableVerticalStretchFactor)
            );
            gableMaterial.map.needsUpdate = true;
            // Assurer wrapS/wrapT si ce n'est pas le défaut
            gableMaterial.map.wrapS = THREE.RepeatWrapping;
            gableMaterial.map.wrapT = THREE.RepeatWrapping;
        }


        // --- Création des Géométries et Meshes (Adapté de createHouse) ---

        // Murs (BoxGeometry sans arrondi)
        const wallGeometry = new THREE.BoxGeometry(wallWidth, wallHeight, wallDepth);
        const wallsMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        // Positionner le centre de la base à l'origine locale Y=0
        wallsMesh.position.y = wallHeight / 2;
        houseGroup.add(wallsMesh);

        // Toit (Groupe pour les pignons et pans)
        const roofGroup = new THREE.Group();
        roofGroup.position.y = wallHeight + roofOffsetY; // Positionner par rapport au haut des murs
        houseGroup.add(roofGroup);

        // 1. Pignons (ExtrudeGeometry) - Corrigé pour fermer les trous
        const gableBaseWidth = wallWidth;
        const gableShape = new THREE.Shape();
        gableShape.moveTo(-gableBaseWidth / 2, 0);
        gableShape.lineTo(gableBaseWidth / 2, 0);
        gableShape.lineTo(0, roofHeight);
        gableShape.closePath(); // Fermer la forme
        
        // Épaisseur pour combler l'espace entre les pans de toit et les extrémités
        const gableThickness = roofThickness * 3; // Plus épais pour être visible et fermer les trous
        const extrudeSettings = { 
            depth: gableThickness, 
            bevelEnabled: false,
            steps: 1,
            curveSegments: 1
        };
        const gableGeometry = new THREE.ExtrudeGeometry(gableShape, extrudeSettings);
        // S'assurer que les normales sont correctement calculées
        gableGeometry.computeVertexNormals();
        
        const frontGableMesh = new THREE.Mesh(gableGeometry, gableMaterial);
        // Positionner exactement à l'extrémité avant pour fermer le trou
        frontGableMesh.position.z = wallDepth / 2 - gableThickness / 2;
        roofGroup.add(frontGableMesh);
        
        const backGableMesh = new THREE.Mesh(gableGeometry.clone(), gableMaterial); // Cloner géométrie
        // Positionner exactement à l'extrémité arrière pour fermer le trou
        backGableMesh.position.z = -wallDepth / 2 + gableThickness / 2;
        backGableMesh.rotation.y = Math.PI; // Retourner le pignon arrière
        roofGroup.add(backGableMesh);

        // 2. Pans inclinés (BoxGeometry)
        const roofPaneLength = wallDepth + roofOverhang * 2;
        const roofSlopeBase = wallWidth / 2 + roofOverhang;
        const roofPaneSlopeWidth = Math.sqrt(Math.pow(roofSlopeBase, 2) + Math.pow(roofHeight, 2));
        const roofPaneGeometry = new THREE.BoxGeometry(roofPaneSlopeWidth, roofThickness, roofPaneLength);
        const roofAngle = Math.atan2(roofHeight, roofSlopeBase);
        const roofPaneLeftMesh = new THREE.Mesh(roofPaneGeometry, roofMaterial);
        roofPaneLeftMesh.position.set(-roofSlopeBase / 2, roofHeight / 2, 0);
        roofPaneLeftMesh.rotation.z = roofAngle;
        roofGroup.add(roofPaneLeftMesh);
        const roofPaneRightMesh = new THREE.Mesh(roofPaneGeometry.clone(), roofMaterial); // Cloner géométrie
        roofPaneRightMesh.position.set(roofSlopeBase / 2, roofHeight / 2, 0);
        roofPaneRightMesh.rotation.z = -roofAngle;
        roofGroup.add(roofPaneRightMesh);

        // Cheminée (Groupe pour corps et chapeau)
        const chimneyWidth = 0.6 * scale; 
        const chimneyHeight = 1.5 * scale; 
        const chimneyDepth = 0.6 * scale;
        const chimneyGroup = new THREE.Group();
        // Positionner la cheminée (logique complexe du HTML à adapter)
        const chimneyPosZRelative = -0.1; const chimneyPosXRelative = 0.6;
        const slopeX = roofSlopeBase * chimneyPosXRelative; const slopeY = roofHeight * chimneyPosXRelative;
        const chimneyLowerAmount = 0.5 * scale;
        const chimneyGroupBaseY = roofGroup.position.y + slopeY - chimneyLowerAmount; // Y base du groupe cheminée
        const chimneyBaseZ = wallDepth * chimneyPosZRelative;
        const chimneyBaseX = slopeX;
        chimneyGroup.position.set(chimneyBaseX, chimneyGroupBaseY, chimneyBaseZ);
        houseGroup.add(chimneyGroup); // Ajouter au groupe principal de la maison

        // Corps cheminée
        const chimneyGeometry = new THREE.BoxGeometry(chimneyWidth, chimneyHeight, chimneyDepth);
        const chimneyMesh = new THREE.Mesh(chimneyGeometry, chimneyBrickMaterial);
        // Position locale DANS le groupe cheminée (centré verticalement)
        chimneyMesh.position.y = chimneyHeight / 2;
        chimneyGroup.add(chimneyMesh);

        // Chapeau cheminée
        const capHeight = 0.15 * scale; 
        const capWidth = chimneyWidth * 1.2; 
        const capDepth = chimneyDepth * 1.2;
        const chimneyCapGeometry = new THREE.BoxGeometry(capWidth, capHeight, capDepth);
        // Créer les matériaux pour les faces du chapeau
        const chimneyCapMaterials = [
            chimneyBrickMaterial, // right (+X)
            chimneyBrickMaterial, // left (-X)
            chimneyTopMaterial,   // top (+Y) <-- Texture spéciale
            chimneyBrickMaterial, // bottom (-Y)
            chimneyBrickMaterial, // front (+Z)
            chimneyBrickMaterial  // back (-Z)
        ];
        const chimneyCapMesh = new THREE.Mesh(chimneyCapGeometry, chimneyCapMaterials);
        // Position locale DANS le groupe cheminée (au-dessus du corps)
        chimneyCapMesh.position.y = chimneyHeight + capHeight / 2;
        chimneyGroup.add(chimneyCapMesh);

        // Porte
        const doorWidth = 1 * scale; 
        const doorHeight = 2 * scale; 
        const doorDepth = 0.1 * scale;
        const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
        const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
        // Position par rapport au centre de la maison, sur la face avant
        doorMesh.position.set(0, doorHeight / 2, wallDepth / 2 + doorDepth / 2 + 0.001 * scale);
        houseGroup.add(doorMesh);

        // Marche
        const stepWidth = 1.2 * scale; 
        const stepHeight = 0.2 * scale; 
        const stepDepth = 0.5 * scale;
        const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
        const stepMesh = new THREE.Mesh(stepGeometry, stepMaterial);
        stepMesh.position.set(0, stepHeight / 2, wallDepth / 2 + doorDepth + stepDepth / 2);
        houseGroup.add(stepMesh);

        // Fenêtres (Utilisation d'une fonction helper pour éviter répétition)
        const createWindow = (x, y, z, rotY = 0) => {
            const windowGroup = new THREE.Group(); // Groupe pour cadre + vitre
            const frameWidth = 1.2 * scale; 
            const frameHeight = 1.4 * scale; 
            const frameDepth = 0.1 * scale;
            const barThickness = 0.08 * scale;

            // Cadre (assemblage de boîtes)
            const sideBarGeo = new THREE.BoxGeometry(barThickness, frameHeight, frameDepth);
            const topBotBarGeo = new THREE.BoxGeometry(frameWidth, barThickness, frameDepth);
            const verticalBarGeo = new THREE.BoxGeometry(barThickness, frameHeight - barThickness * 2, frameDepth * 0.8);
            const horizontalBarGeo = new THREE.BoxGeometry(frameWidth - barThickness * 2, barThickness, frameDepth * 0.8);

            const frameMeshes = [
                new THREE.Mesh(sideBarGeo, windowFrameMaterial), // Left
                new THREE.Mesh(sideBarGeo, windowFrameMaterial), // Right
                new THREE.Mesh(topBotBarGeo, windowFrameMaterial), // Top
                new THREE.Mesh(topBotBarGeo, windowFrameMaterial), // Bottom
                new THREE.Mesh(verticalBarGeo, windowFrameMaterial), // Vertical Center
                new THREE.Mesh(horizontalBarGeo, windowFrameMaterial) // Horizontal Center
            ];
            frameMeshes[0].position.x = -frameWidth / 2 + barThickness / 2;
            frameMeshes[1].position.x = frameWidth / 2 - barThickness / 2;
            frameMeshes[2].position.y = frameHeight / 2 - barThickness / 2;
            frameMeshes[3].position.y = -frameHeight / 2 + barThickness / 2;
            frameMeshes[4].position.z = -frameDepth * 0.1; // Léger retrait
            frameMeshes[5].position.z = -frameDepth * 0.1; // Léger retrait
            frameMeshes.forEach(m => windowGroup.add(m));

            // Vitre (PlaneGeometry)
            const paneGeometry = new THREE.PlaneGeometry(frameWidth - barThickness * 2, frameHeight - barThickness * 2);
            const paneMesh = new THREE.Mesh(paneGeometry, windowPaneMaterial);
            // Positionner la vitre légèrement en retrait derrière le cadre
            paneMesh.position.z = -frameDepth / 2 + 0.01 * scale;
            windowGroup.add(paneMesh);

            // Positionner et orienter le groupe fenêtre complet
            windowGroup.position.set(x, y, z);
            windowGroup.rotation.y = rotY;
            return windowGroup; // Retourner le groupe pour l'ajouter à houseGroup
        };

        const windowY = wallHeight / 2 + 0.1 * scale;
        const windowOffset = 0.05 * scale; // Décalage par rapport à la surface du mur
        houseGroup.add(createWindow(-wallWidth / 4, windowY, wallDepth / 2 + windowOffset)); // Avant Gauche
        houseGroup.add(createWindow( wallWidth / 4, windowY, wallDepth / 2 + windowOffset)); // Avant Droit
        houseGroup.add(createWindow(-wallWidth / 4, windowY, -wallDepth / 2 - windowOffset, Math.PI)); // Arrière Gauche
        houseGroup.add(createWindow( wallWidth / 4, windowY, -wallDepth / 2 - windowOffset, Math.PI)); // Arrière Droit
        houseGroup.add(createWindow(wallWidth / 2 + windowOffset, windowY, 0, Math.PI / 2)); // Côté Droit
        houseGroup.add(createWindow(-wallWidth / 2 - windowOffset, windowY, 0, -Math.PI / 2)); // Côté Gauche

        // --- Regroupement final par matériau pour l'asset ---
        const allGeometries = []; // Pour calculer la BBox globale
        const materialMap = new Map();

        // Initialiser la map avec les matériaux utilisés localement
        Object.values(this.localMaterials).forEach(mat => {
            if (mat) {
                // Utiliser le nom du matériau comme clé, créer une copie pour le stockage
                materialMap.set(mat.name, { material: mat.clone(), geoms: [] });
            }
        });
        // Gérer le cas spécial du matériau multi-face de la cheminée
        if (chimneyCapMesh && Array.isArray(chimneyCapMesh.material)) {
             chimneyCapMesh.material.forEach(mat => {
                 if (mat && !materialMap.has(mat.name)) {
                      materialMap.set(mat.name, { material: mat.clone(), geoms: [] });
                 }
             });
        }
        // Ajouter le matériau du marqueur de porte
        //materialMap.set("NewHouseDoorMarkerMat", { material: doorMarkerMaterial, geoms: [] });


        houseGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true); // S'assurer que la matrice monde est à jour
                let clonedGeom = child.geometry.clone();
                if (clonedGeom.index) clonedGeom = clonedGeom.toNonIndexed();
                clonedGeom.applyMatrix4(child.matrixWorld); // Appliquer la transformation MONDIALE
                allGeometries.push(clonedGeom);

                // Gérer les matériaux multiples (cas du chapeau cheminée)
                const materialsToProcess = Array.isArray(child.material) ? child.material : [child.material];
                materialsToProcess.forEach(mat => {
                    if (mat) {
                        const matName = mat.name || 'default_new_house_mat'; // Utiliser un nom par défaut
                        const groupData = materialMap.get(matName);
                        if (groupData) {
                            // Ajouter la géométrie clonée au bon groupe de matériau
                            groupData.geoms.push(clonedGeom);
                        } else {
                            console.warn(`[NewHouse Proc] Matériau non trouvé dans la map: ${matName}. Géométrie ignorée.`);
                        }
                    }
                });
            }
            // Gérer les groupes (fenêtres)
             else if (child.isGroup && child !== houseGroup) {
                  child.updateMatrixWorld(true); // Mettre à jour la matrice du groupe
                  child.children.forEach(grandChild => {
                      if (grandChild.isMesh && grandChild.geometry && grandChild.material) {
                           grandChild.updateMatrixWorld(true); // Matrice du petit-enfant
                           let clonedGeom = grandChild.geometry.clone();
                           if (clonedGeom.index) clonedGeom = clonedGeom.toNonIndexed();
                           clonedGeom.applyMatrix4(grandChild.matrixWorld); // Transformation MONDIALE
                           allGeometries.push(clonedGeom);

                           const matName = grandChild.material.name || 'default_new_house_mat';
                           const groupData = materialMap.get(matName);
                           if (groupData) {
                               groupData.geoms.push(clonedGeom);
                           } else {
                                console.warn(`[NewHouse Proc Window] Matériau non trouvé dans la map: ${matName}. Géométrie ignorée.`);
                           }
                      }
                  });
             }
        });


        if (allGeometries.length === 0) {
            console.error("[NewHouse Proc] Aucune géométrie valide trouvée après parcours.");
            // Nettoyer les géométries locales
             wallGeometry.dispose(); gableGeometry.dispose(); roofPaneGeometry.dispose();
             chimneyGeometry.dispose(); chimneyCapGeometry.dispose(); doorGeometry.dispose(); stepGeometry.dispose();
            // Nettoyer les géométries de fenêtres
            houseGroup.traverse(obj => { if (obj.isMesh) obj.geometry?.dispose(); });
            return null;
        }

        // Fusion globale temporaire pour calculer la BBox
        const globalMerged = mergeGeometries(allGeometries, false);
        if (!globalMerged) {
            console.error("[NewHouse Proc] Échec de la fusion globale pour BBox.");
            allGeometries.forEach(g => g.dispose());
            return null;
        }
        globalMerged.computeBoundingBox();
        const globalBBox = globalMerged.boundingBox;
        const globalMinY = globalBBox.min.y;
        const globalCenter = new THREE.Vector3();
        globalBBox.getCenter(globalCenter);
        const globalSize = new THREE.Vector3();
        globalBBox.getSize(globalSize);
        globalMerged.dispose();

        globalSize.x = Math.max(globalSize.x, 0.001);
        globalSize.y = Math.max(globalSize.y, 0.001);
        globalSize.z = Math.max(globalSize.z, 0.001);

        const fittingScaleFactor = Math.min(baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z);
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        // Fusionner les géométries par matériau et recentrer
        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;

            // Fusionner les géométries pour ce matériau
            const mergedPartGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeom) {
                console.error(`[NewHouse Proc] Échec de fusion du groupe "${matName}".`);
                groupData.geoms.forEach(g => g.dispose()); // Nettoyer les géométries non fusionnées
                return;
            }
            // Recentrer la géométrie fusionnée de la partie
            mergedPartGeom.translate(-globalCenter.x, -globalMinY, -globalCenter.z);

            // Utiliser le matériau cloné stocké dans groupData
            const finalMaterial = groupData.material;
            // Ne pas modifier le nom du matériau, garder celui d'origine
            parts.push({
                geometry: mergedPartGeom,
                material: finalMaterial
            });

            // Nettoyer les géométries clonées utilisées pour cette partie
            groupData.geoms.forEach(g => g.dispose());
        });

        // Nettoyer toutes les géométries initiales de allGeometries
        allGeometries.forEach(g => g.dispose());
        // Nettoyer les géométries de base qui ont été utilisées pour les clones
        wallGeometry.dispose(); gableGeometry.dispose(); roofPaneGeometry.dispose();
        chimneyGeometry.dispose(); chimneyCapGeometry.dispose(); doorGeometry.dispose(); stepGeometry.dispose();
        // Nettoyer les géométries de fenêtres
        houseGroup.traverse(obj => { if (obj.isMesh) obj.geometry?.dispose(); });

        const asset = {
            id: `house_newModel_${this.assetIdCounter++}`, // ID Unique pour ce modèle B
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(0, globalSize.y / 2, 0), // Centre à la base
            sizeAfterFitting: sizeAfterFitting,
            procedural: true,
            rendererType: 'NewHouseRenderer' // Identifier le renderer
        };

        console.log(`[NewHouse Proc] Asset généré avec ${parts.length} parties. ID: ${asset.id}`);
        return asset;
    }

    /**
     * Génère la matrice d'instance pour une maison.
     * Cette méthode est appelée par HousePlacementStrategy.
     * Elle prend en compte la structure `parts` de l'asset généré.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille.
     * @param {number} groundLevel - Niveau Y du sol.
     * @param {number} targetRotationY - Rotation Y cible.
     * @param {number} baseScaleFactor - Facteur d'échelle de base pour les maisons.
     * @param {object} assetInfo - L'objet asset généré par generateProceduralHouse.
     * @returns {object} Un objet { partName: [Matrix4], ... }
     */
    generateHouseInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor, assetInfo) {
        if (!assetInfo || !assetInfo.parts || assetInfo.parts.length === 0 || !assetInfo.fittingScaleFactor || !assetInfo.sizeAfterFitting || !assetInfo.centerOffset) {
            console.error("[NewHouse Instance] assetInfo invalide ou incomplet.", assetInfo);
            return null;
        }

        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = assetInfo.fittingScaleFactor * baseScaleFactor * assetInfo.userScale; // Inclure userScale si défini
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(targetRotationY);

        // Recentrage basé sur l'offset calculé lors de la génération
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -assetInfo.centerOffset.x,
            -assetInfo.centerOffset.y,
            -assetInfo.centerOffset.z
        );

        const finalHeight = assetInfo.sizeAfterFitting.y * baseScaleFactor * assetInfo.userScale;
        const finalY = finalHeight / 2 + groundLevel; // Positionner la base au niveau du sol
        const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);

        // Calculer la matrice de transformation globale
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(translationMatrix);

        // Créer la structure de retour { partName: [matrix] }
        const houseInstanceData = {};
        assetInfo.parts.forEach((part, index) => {
            // Utiliser un nom de partie basé sur l'index ou le nom du matériau si disponible
            const partKey = part.material.name || `part${index}`;
            houseInstanceData[partKey] = [instanceMatrix.clone()]; // Chaque partie utilise la même matrice globale
        });

        return houseInstanceData;
    }

    /**
     * Nettoie les ressources (textures, matériaux).
     */
    destroy() {
        console.log("Destroying NewHouseRenderer resources...");
        Object.values(this.sharedTextures).forEach(texture => texture?.dispose());
        Object.values(this.localMaterials).forEach(material => material?.dispose());
        this.sharedTextures = {};
        this.localMaterials = {};
        console.log("NewHouseRenderer destroyed.");
    }
}