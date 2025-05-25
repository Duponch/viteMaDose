import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class MovieTheaterRenderer {
    /**
     * Constructeur pour le renderer de cinéma.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Matériaux partagés du projet.
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; 
        this.assetIdCounter = 0;

        // Création des textures spécialisées pour le cinéma
        this.wallTexture = this.createWallTexture();
        this.roofTexture = this.createRoofTexture();
        this.marqueeAwningStripedTexture = this.createMarqueeAwningStripedTexture();
        this.sideAwningTexture = this.createSideAwningTexture();
        this.cinemaTextTexture = this.createCinemaTextTexture();
        this.popcornBucketTexture = this.createPopcornBucketTexture(256, 256, 16);

        // Définition des matériaux locaux pour le cinéma
        this.localMaterials = {
            // Matériau principal du bâtiment (rouge avec texture de briques)
            mainBuilding: new THREE.MeshStandardMaterial({ 
                map: this.wallTexture,
                name: "CinemaMainBuildingMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            // Matériau du toit (tuiles grises)
            roof: new THREE.MeshStandardMaterial({ 
                map: this.roofTexture,
                name: "CinemaRoofMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            // Matériau de la marquise rayée (rouge et blanc)
            marqueeStriped: new THREE.MeshStandardMaterial({ 
                map: this.marqueeAwningStripedTexture,
                name: "CinemaMarqueeStripedMat",
                roughness: 0.7,
                metalness: 0.1
            }),
            // Matériau des côtés de la marquise (blanc)
            marqueeSide: new THREE.MeshStandardMaterial({ 
                color: 0xffffff,
                name: "CinemaMarqueeSideMat",
                roughness: 0.7,
                metalness: 0.1
            }),
            // Matériau du cadre de porte/fenêtre (gris foncé)
            frame: new THREE.MeshStandardMaterial({ 
                color: 0x555555,
                name: "CinemaFrameMat",
                roughness: 0.8,
                metalness: 0.2
            }),
            // Matériau de la porte (bleu clair)
            door: new THREE.MeshStandardMaterial({ 
                color: 0xadd8e6,
                name: "CinemaDoorMat",
                roughness: 0.7,
                metalness: 0.1
            }),
            // Matériau du panneau (blanc cassé)
            sign: new THREE.MeshStandardMaterial({ 
                color: 0xeeeeee,
                name: "CinemaSignMat",
                roughness: 0.6,
                metalness: 0.1
            }),
            // Matériau de l'écran avec texte
            screen: new THREE.MeshStandardMaterial({ 
                map: this.cinemaTextTexture,
                name: "CinemaScreenMat",
                roughness: 0.3,
                metalness: 0.1
            }),
            // Matériau des fenêtres (bleu-violet)
            window: new THREE.MeshStandardMaterial({ 
                color: 0x7777ff,
                name: "CinemaWindowMat",
                transparent: true,
                opacity: 0.8,
                roughness: 0.1,
                metalness: 0.9
            }),
            // Matériau des auvents de fenêtres (brun rayé)
            sideAwning: new THREE.MeshStandardMaterial({ 
                map: this.sideAwningTexture,
                name: "CinemaSideAwningMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            // Matériau du seau de popcorn
            popcornBucket: new THREE.MeshStandardMaterial({
                map: this.popcornBucketTexture,
                name: "CinemaPopcornBucketMat",
                roughness: 0.7,
                metalness: 0.1
            }),
            // Matériau du fond du seau (gris)
            popcornBucketBottom: new THREE.MeshStandardMaterial({
                color: 0x888888,
                name: "CinemaPopcornBucketBottomMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            // Matériau du haut du seau (blanc)
            popcornBucketTop: new THREE.MeshStandardMaterial({
                color: 0xffffff,
                name: "CinemaPopcornBucketTopMat",
                roughness: 0.7,
                metalness: 0.1
            }),
            // Matériau des grains de popcorn (jaune)
            popcornKernel: new THREE.MeshStandardMaterial({
                color: 0xffff99,
                name: "CinemaPopcornKernelMat",
                roughness: 0.6,
                metalness: 0.1
            })
        };

        console.log("MovieTheaterRenderer initialized with detailed 3D model and textures.");
    }

    /**
     * Crée une texture de mur pour le cinéma (rouge avec lignes de mortier)
     */
    createWallTexture(width = 256, height = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const baseColor = '#cc0000'; // Rouge cinéma
        const lineColor = '#a50000'; // Rouge plus foncé pour les lignes de briques
        const brickHeight = 20; 
        const brickWidth = 50;  

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2; 

        for (let y = 0; y < height; y += brickHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        for (let y = 0; y < height; y += brickHeight) {
            const isOffsetRow = (Math.floor(y / brickHeight)) % 2 === 1;
            for (let x = isOffsetRow ? brickWidth / 2 : 0; x < width; x += brickWidth) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + brickHeight);
                ctx.stroke();
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.5, 1.5); 
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture de toit (tuiles simples)
     */
    createRoofTexture(width = 256, height = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const shingleWidth = 40;
        const shingleHeight = 25;
        const shingleColor = '#696969'; 
        const gapColor = '#808080';    

        ctx.fillStyle = gapColor;
        ctx.fillRect(0, 0, width, height);

        for (let y = 0; y < height; y += shingleHeight / 1.5) { 
            for (let x = 0; x < width; x += shingleWidth + 5) {
                let currentX = x;
                if ((Math.floor(y / (shingleHeight/1.5))) % 2 === 1) {
                    currentX += shingleWidth / 2;
                }
                ctx.fillStyle = shingleColor;
                ctx.beginPath();
                ctx.rect(currentX, y, shingleWidth, shingleHeight);
                ctx.fill();
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2); 
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture pour l'auvent principal (marquise) - Rouge et Blanc
     */
    createMarqueeAwningStripedTexture(width = 256, height = 64) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const numStripes = 10;
        const stripeWidth = width / numStripes;
        const color1 = '#CC0000'; // Rouge cinéma
        const color2 = '#FFFFFF'; // Blanc

        for (let i = 0; i < numStripes; i++) {
            ctx.fillStyle = (i % 2 === 0) ? color1 : color2;
            ctx.fillRect(i * stripeWidth, 0, stripeWidth, height);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture pour les auvents des fenêtres latérales
     */
    createSideAwningTexture(width = 128, height = 64) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8B4513'; 
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#5A2D0C'; 
        ctx.lineWidth = 4;
        for(let i = 0; i < 5; i++) {
            const yPos = (height / 5) * i + ctx.lineWidth;
            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(width, yPos);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture avec le texte "CINEMA"
     */
    createCinemaTextTexture() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512; 
        canvas.height = 128; 

        context.fillStyle = '#111111';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = 'bold 70px Arial'; 
        context.fillStyle = '#FFFFFF';    
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('CINEMA', canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture pour le seau de popcorn (rayures rouges et blanches)
     */
    createPopcornBucketTexture(width, height, numStripes) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const stripeWidth = canvas.width / numStripes;

        for (let i = 0; i < numStripes; i++) {
            context.fillStyle = (i % 2 === 0) ? '#FF0000' : '#FFFFFF'; 
            context.fillRect(i * stripeWidth, 0, stripeWidth, canvas.height);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping; 
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Génère l'asset procédural pour un cinéma.
     * @param {number} baseWidth - Largeur cible (pour calcul scale).
     * @param {number} baseHeight - Hauteur cible.
     * @param {number} baseDepth - Profondeur cible.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur.
     * @param {number} [verticalScale=1] - Facteur de scale vertical.
     * @returns {object|null} L'asset généré {id, parts, fittingScaleFactor, ...} ou null.
     */
    generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1, verticalScale = 0.8) {
        // Ajuster les dimensions de base
        const defaultScaleMultiplier = 2;
        const adjustedBaseWidth = baseWidth * defaultScaleMultiplier;
        const adjustedBaseHeight = baseHeight * defaultScaleMultiplier * verticalScale;
        const adjustedBaseDepth = baseDepth * defaultScaleMultiplier;
        
        const buildingGroup = new THREE.Group();

        // Constantes pour les dimensions du bâtiment principal (adaptées du code HTML)
        const buildingSideLength = 10; 
        const buildingHeight = 6;
        const roofThickness = 0.5;
        const lipHeight = 0.3;
        const lipThickness = 0.15;
        const marqueeHeight = 0.3;
        const marqueeWidth = 7;
        const marqueeDepth = 3;
        const signWidth = 5;
        const signHeight = 2;
        const signDepth = 0.3;
        const doorWidth = 2.5;
        const doorHeight = 3.0;
        const doorDepth = 0.2;
        const frameThickness = 0.15;
        const windowWidth = 1.8;
        const windowHeight = 1.2;
        const windowDepth = 0.1;
        const framePartThickness = 0.08;
        const awningWidth = 2.0;
        const awningHeight = 0.15;
        const awningDepth = 0.5;

        // Appliquer le multiplicateur d'échelle
        const scale = defaultScaleMultiplier;
        const verticalScaleFactor = scale * verticalScale;

        // Dimensions mises à l'échelle
        const scaledBuildingSideLength = buildingSideLength * scale;
        const scaledBuildingHeight = buildingHeight * verticalScaleFactor;
        const scaledRoofThickness = roofThickness * verticalScaleFactor;
        const scaledLipHeight = lipHeight * verticalScaleFactor;
        const scaledLipThickness = lipThickness * scale;
        const scaledMarqueeHeight = marqueeHeight * verticalScaleFactor;
        const scaledMarqueeWidth = marqueeWidth * scale;
        const scaledMarqueeDepth = marqueeDepth * scale;
        const scaledSignWidth = signWidth * scale;
        const scaledSignHeight = signHeight * verticalScaleFactor;
        const scaledSignDepth = signDepth * scale;
        const scaledDoorWidth = doorWidth * scale;
        const scaledDoorHeight = doorHeight * verticalScaleFactor;
        const scaledDoorDepth = doorDepth * scale;
        const scaledFrameThickness = frameThickness * scale;
        const scaledWindowWidth = windowWidth * scale;
        const scaledWindowHeight = windowHeight * verticalScaleFactor;
        const scaledWindowDepth = windowDepth * scale;
        const scaledFramePartThickness = framePartThickness * scale;
        const scaledAwningWidth = awningWidth * scale;
        const scaledAwningHeight = awningHeight * verticalScaleFactor;
        const scaledAwningDepth = awningDepth * scale;

        // Fonction utilitaire pour créer des boîtes
        const createBox = (width, height, depth, material, x, y, z, name = '') => {
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.name = name;
            buildingGroup.add(mesh);
            return mesh;
        };

        // 1. Corps principal du bâtiment (carré)
        const mainBuilding = createBox(
            scaledBuildingSideLength, scaledBuildingHeight, scaledBuildingSideLength,
            this.localMaterials.mainBuilding,
            0, baseHeight + scaledBuildingHeight / 2, 0,
            'mainBuilding'
        );
        mainBuilding.castShadow = true;
        mainBuilding.receiveShadow = true;

        // 2. Toit
        const roofWidth = scaledBuildingSideLength + 0.2 * scale;
        const roofDepth = scaledBuildingSideLength + 0.2 * scale;
        const roofY = baseHeight + scaledBuildingHeight + scaledRoofThickness / 2;
        const roof = createBox(
            roofWidth, scaledRoofThickness, roofDepth,
            this.localMaterials.roof,
            0, roofY, 0,
            'roof'
        );
        roof.castShadow = true;

        // 3. Rebords du toit
        const lipYPosition = roofY + scaledRoofThickness / 2 + scaledLipHeight / 2;

        // Rebord avant
        const frontLip = createBox(
            roofWidth, scaledLipHeight, scaledLipThickness,
            this.localMaterials.roof,
            0, lipYPosition, roofDepth / 2 - scaledLipThickness / 2,
            'frontLip'
        );
        frontLip.castShadow = true;

        // Rebord arrière
        const backLip = createBox(
            roofWidth, scaledLipHeight, scaledLipThickness,
            this.localMaterials.roof,
            0, lipYPosition, -roofDepth / 2 + scaledLipThickness / 2,
            'backLip'
        );
        backLip.castShadow = true;

        // Rebords latéraux
        const sideLipDepth = roofDepth - (2 * scaledLipThickness);
        const leftLip = createBox(
            scaledLipThickness, scaledLipHeight, sideLipDepth,
            this.localMaterials.roof,
            -roofWidth / 2 + scaledLipThickness / 2, lipYPosition, 0,
            'leftLip'
        );
        leftLip.castShadow = true;

        const rightLip = createBox(
            scaledLipThickness, scaledLipHeight, sideLipDepth,
            this.localMaterials.roof,
            roofWidth / 2 - scaledLipThickness / 2, lipYPosition, 0,
            'rightLip'
        );
        rightLip.castShadow = true;

        // 4. Marquise avec côtés blancs (différents matériaux selon les faces)
        const marqueeY = baseHeight + 4 * verticalScaleFactor;
        const marqueeZ = scaledBuildingSideLength / 2 + scaledMarqueeDepth / 2 - 0.5 * scale;
        
        // Simplification : utiliser un seul matériau pour éviter les problèmes de fusion
        const marquee = createBox(
            scaledMarqueeWidth, scaledMarqueeHeight, scaledMarqueeDepth,
            this.localMaterials.marqueeStriped,
            0, marqueeY, marqueeZ,
            'marquee'
        );
        marquee.castShadow = true;
        marquee.receiveShadow = true;

        // 5. Panneau avec texte "CINEMA"
        const signY = marqueeY + scaledMarqueeHeight / 2 + scaledSignHeight / 2;
        const signZ = marqueeZ + scaledSignDepth / 2 + 0.1 * scale;
        const sign = createBox(
            scaledSignWidth, scaledSignHeight, scaledSignDepth,
            this.localMaterials.sign,
            0, signY, signZ,
            'sign'
        );
        sign.castShadow = true;

        // 6. "Écran" du panneau avec texte
        const screenWidth = scaledSignWidth * 0.96;
        const screenHeight = scaledSignHeight * 0.9;
        const screenDepth = 0.1 * scale;
        const screen = createBox(
            screenWidth, screenHeight, screenDepth,
            this.localMaterials.screen,
            0, 0, scaledSignDepth / 2 + screenDepth / 2 + 0.01 * scale,
            'screen'
        );
        // Ajouter l'écran comme enfant du panneau
        sign.add(screen);

        // 7. Porte d'entrée avec cadre
        const doorY = baseHeight + scaledDoorHeight / 2;
        const doorZ = scaledBuildingSideLength / 2 + scaledDoorDepth / 2;
        const door = createBox(
            scaledDoorWidth, scaledDoorHeight, scaledDoorDepth,
            this.localMaterials.door,
            0, doorY, doorZ,
            'door'
        );
        door.castShadow = true;

        // Cadre de la porte
        // Linteau
        const lintel = createBox(
            scaledDoorWidth + 2 * scaledFrameThickness, scaledFrameThickness, scaledDoorDepth,
            this.localMaterials.frame,
            0, doorY + scaledDoorHeight / 2 + scaledFrameThickness / 2, doorZ,
            'doorLintel'
        );

        // Montants gauche et droit
        const jambLeft = createBox(
            scaledFrameThickness, scaledDoorHeight + scaledFrameThickness, scaledDoorDepth,
            this.localMaterials.frame,
            -scaledDoorWidth / 2 - scaledFrameThickness / 2, doorY - scaledFrameThickness / 2, doorZ,
            'doorJambLeft'
        );

        const jambRight = createBox(
            scaledFrameThickness, scaledDoorHeight + scaledFrameThickness, scaledDoorDepth,
            this.localMaterials.frame,
            scaledDoorWidth / 2 + scaledFrameThickness / 2, doorY - scaledFrameThickness / 2, doorZ,
            'doorJambRight'
        );

        // Barre verticale centrale
        const verticalBar = createBox(
            0.1 * scale, scaledDoorHeight, scaledDoorDepth * 1.1,
            this.localMaterials.frame,
            0, doorY, doorZ + scaledDoorDepth * 0.05,
            'doorVerticalBar'
        );

        // 8. Fenêtres latérales avec cadres
        const windowY = 2.7 * verticalScaleFactor + baseHeight;

        // Fenêtre gauche
        const window1X = -scaledBuildingSideLength / 2 - scaledWindowDepth / 2;
        const window1 = createBox(
            scaledWindowDepth, scaledWindowHeight, scaledWindowWidth,
            this.localMaterials.window,
            window1X, windowY, 0,
            'window1'
        );
        window1.castShadow = true;

        // Cadre fenêtre gauche
        this.createWindowFrame(buildingGroup, window1X, windowY, 0, scaledWindowWidth, scaledWindowHeight, scaledWindowDepth, scaledFramePartThickness, this.localMaterials.frame, 'frame1');

        // Auvent fenêtre gauche
        const awning1 = createBox(
            scaledAwningDepth, scaledAwningHeight, scaledAwningWidth,
            this.localMaterials.sideAwning,
            window1X - scaledAwningDepth / 2, windowY + scaledWindowHeight / 2 + scaledAwningHeight / 2 + 0.05 * scale, 0,
            'awning1'
        );
        awning1.castShadow = true;

        // Fenêtre droite
        const window2X = scaledBuildingSideLength / 2 + scaledWindowDepth / 2;
        const window2 = createBox(
            scaledWindowDepth, scaledWindowHeight, scaledWindowWidth,
            this.localMaterials.window,
            window2X, windowY, 0,
            'window2'
        );
        window2.castShadow = true;

        // Cadre fenêtre droite
        this.createWindowFrame(buildingGroup, window2X, windowY, 0, scaledWindowWidth, scaledWindowHeight, scaledWindowDepth, scaledFramePartThickness, this.localMaterials.frame, 'frame2');

        // Auvent fenêtre droite
        const awning2 = createBox(
            scaledAwningDepth, scaledAwningHeight, scaledAwningWidth,
            this.localMaterials.sideAwning,
            window2X + scaledAwningDepth / 2, windowY + scaledWindowHeight / 2 + scaledAwningHeight / 2 + 0.05 * scale, 0,
            'awning2'
        );
        awning2.castShadow = true;

        // 9. Popcorn géant sur le toit
        this.createGiantPopcorn(buildingGroup, 0, roofY + scaledRoofThickness / 2, 0, scale, verticalScaleFactor, baseHeight);

        // ----- Regroupement par matériau pour l'asset final -----
        const allGeometries = [];
        const materialMap = new Map();

        // Initialiser la map avec les matériaux utilisés
        Object.values(this.localMaterials).forEach(mat => {
            if (mat) {
                materialMap.set(mat.name, { material: mat, geoms: [] });
            }
        });

        buildingGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                let clonedGeom = child.geometry.clone();
                
                // Normaliser la géométrie : s'assurer qu'elle n'a pas d'index pour éviter les conflits
                if (clonedGeom.index !== null) {
                    clonedGeom = clonedGeom.toNonIndexed();
                }
                
                clonedGeom.applyMatrix4(child.matrixWorld);
                allGeometries.push(clonedGeom);
                
                // Gérer les matériaux multiples (marquise)
                if (Array.isArray(child.material)) {
                    // Pour les matériaux multiples, créer une géométrie séparée pour chaque matériau
                    const groups = clonedGeom.groups;
                    if (groups && groups.length > 0) {
                        // Si la géométrie a des groupes, traiter chaque groupe séparément
                        child.material.forEach((mat, index) => {
                            if (groups[index]) {
                                const groupData = materialMap.get(mat.name);
                                if (groupData) {
                                    // Créer une géométrie pour ce groupe spécifique
                                    const groupGeom = clonedGeom.clone();
                                    // Filtrer pour ne garder que ce groupe
                                    const start = groups[index].start;
                                    const count = groups[index].count;
                                    // Pour simplifier, on ajoute toute la géométrie à chaque matériau
                                    // C'est moins optimal mais évite les problèmes de fusion
                                    groupData.geoms.push(groupGeom.clone());
                                }
                            }
                        });
                    } else {
                        // Si pas de groupes, utiliser le premier matériau
                        const matName = child.material[0].name;
                        const groupData = materialMap.get(matName);
                        if (groupData) {
                            groupData.geoms.push(clonedGeom.clone());
                        }
                    }
                } else {
                    const matName = child.material.name;
                    const groupData = materialMap.get(matName);
                    if (groupData) {
                        groupData.geoms.push(clonedGeom.clone());
                    } else {
                        console.warn(`[Cinema Proc] Matériau non trouvé dans la map: ${matName || '[sans nom]'}. Géométrie ignorée.`);
                    }
                }
            }
        });

        if (allGeometries.length === 0) {
            console.error("[Cinema Proc] Aucune géométrie valide trouvée après parcours.");
            return null;
        }

        // Fusion globale temporaire pour calculer la BBox
        try {
            const globalMerged = mergeGeometries(allGeometries, false);
            if (!globalMerged) {
                console.error("[Cinema Proc] Échec de la fusion globale pour BBox.");
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

            const fittingScaleFactor = Math.min(adjustedBaseWidth / globalSize.x, adjustedBaseHeight / globalSize.y, adjustedBaseDepth / globalSize.z);
            const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

            // Fusionner les géométries par matériau et recentrer
            const parts = [];
            materialMap.forEach((groupData, matName) => {
                if (groupData.geoms.length === 0) return;

                try {
                    const mergedPartGeom = mergeGeometries(groupData.geoms, false);
                    if (!mergedPartGeom) {
                        console.error(`[Cinema Proc] Échec de fusion du groupe "${matName}".`);
                        groupData.geoms.forEach(g => g.dispose());
                        return;
                    }
                    mergedPartGeom.translate(-globalCenter.x, -globalMinY, -globalCenter.z);
                    parts.push({
                        geometry: mergedPartGeom,
                        material: groupData.material
                    });
                    groupData.geoms.forEach(g => g.dispose());
                } catch (error) {
                    console.error(`[Cinema Proc] Erreur lors de la fusion du groupe "${matName}":`, error);
                    groupData.geoms.forEach(g => g.dispose());
                }
            });

            allGeometries.forEach(g => g.dispose());

            if (parts.length === 0) {
                console.error("[Cinema Proc] Aucune partie valide créée après fusion.");
                return null;
            }

            const asset = {
                id: `movietheater_proc_${this.assetIdCounter++}`,
                parts: parts,
                fittingScaleFactor: fittingScaleFactor,
                userScale: userScale,
                centerOffset: new THREE.Vector3(0, globalSize.y / 2, 0),
                sizeAfterFitting: sizeAfterFitting
            };

            console.log(`[Cinema Proc] Asset généré avec ${parts.length} parties. ID: ${asset.id}`);
            return asset;
            
        } catch (error) {
            console.error("[Cinema Proc] Erreur lors de la fusion globale:", error);
            allGeometries.forEach(g => g.dispose());
            return null;
        }
    }

    /**
     * Crée un cadre de fenêtre avec tous ses éléments
     */
    createWindowFrame(parentGroup, x, y, z, windowWidth, windowHeight, windowDepth, frameThickness, frameMaterial, namePrefix) {
        const createBox = (width, height, depth, material, posX, posY, posZ, name) => {
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ);
            mesh.name = name;
            mesh.castShadow = true;
            parentGroup.add(mesh);
            return mesh;
        };

        // Cadre supérieur
        createBox(
            windowWidth, frameThickness, windowDepth,
            frameMaterial,
            x, y + windowHeight / 2 + frameThickness / 2, z,
            `${namePrefix}Top`
        );

        // Cadre inférieur
        createBox(
            windowWidth, frameThickness, windowDepth,
            frameMaterial,
            x, y - windowHeight / 2 - frameThickness / 2, z,
            `${namePrefix}Bottom`
        );

        // Montants gauche et droit
        createBox(
            frameThickness, windowHeight + 2 * frameThickness, windowDepth,
            frameMaterial,
            x, y, z - windowWidth / 2 - frameThickness / 2,
            `${namePrefix}Left`
        );

        createBox(
            frameThickness, windowHeight + 2 * frameThickness, windowDepth,
            frameMaterial,
            x, y, z + windowWidth / 2 + frameThickness / 2,
            `${namePrefix}Right`
        );
    }

    /**
     * Crée le popcorn géant sur le toit
     */
    createGiantPopcorn(parentGroup, x, y, z, scale, verticalScaleFactor, baseHeight) {
        const bucketHeight = 2.5 * verticalScaleFactor;
        const bucketRadiusTop = 1.2 * scale;
        const bucketRadiusBottom = 0.9 * scale;
        const bucketSegments = 16;

        // Seau de popcorn
        const bucketGeometry = new THREE.CylinderGeometry(bucketRadiusTop, bucketRadiusBottom, bucketHeight, bucketSegments);
        const bucketMaterials = [this.localMaterials.popcornBucket, this.localMaterials.popcornBucketTop, this.localMaterials.popcornBucketBottom];
        const bucket = new THREE.Mesh(bucketGeometry, bucketMaterials);
        bucket.position.set(x, y + bucketHeight / 2, z);
        bucket.name = 'popcornBucket';
        bucket.castShadow = true;
        bucket.receiveShadow = true;
        parentGroup.add(bucket);

        // Grains de popcorn
        const numKernels = 25;
        for (let i = 0; i < numKernels; i++) {
            const kernelRadius = (Math.random() * 0.3 + 0.2) * scale;
            const kernelGeom = new THREE.IcosahedronGeometry(kernelRadius, 0);
            const kernel = new THREE.Mesh(kernelGeom, this.localMaterials.popcornKernel);
            kernel.castShadow = true;

            const angle = Math.random() * Math.PI * 2;
            const radiusOffset = Math.random() * (bucketRadiusTop * 0.85);
            const kernelYPosition = y + bucketHeight + kernelRadius + (Math.random() * 0.8 * verticalScaleFactor);

            kernel.position.set(
                x + Math.cos(angle) * radiusOffset,
                kernelYPosition,
                z + Math.sin(angle) * radiusOffset
            );
            kernel.name = `popcornKernel${i}`;
            parentGroup.add(kernel);
        }
    }

    /**
     * Nettoie les ressources du renderer.
     */
    destroy() {
        // Disposer des textures
        this.wallTexture?.dispose();
        this.roofTexture?.dispose();
        this.marqueeAwningStripedTexture?.dispose();
        this.sideAwningTexture?.dispose();
        this.cinemaTextTexture?.dispose();
        this.popcornBucketTexture?.dispose();
        
        // Disposer des matériaux
        Object.values(this.localMaterials).forEach(material => {
            if (material.map) material.map.dispose();
            material.dispose();
        });
        
        console.log("MovieTheaterRenderer resources cleaned up.");
    }
} 