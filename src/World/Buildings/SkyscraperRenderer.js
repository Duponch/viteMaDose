// src/World/SkyscraperRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class SkyscraperRenderer {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        // Initialisation des références spécifiques aux gratte-ciels
        this.baseSkyscraperGeometries = {};
        this.baseSkyscraperMaterials = {};
        this.skyscraperInstanceMatrices = {};
        this.assetIdCounter = 0; // compteur pour générer des IDs uniques
        
        // Création de la texture de façade partagée
        this.sharedFacadeTexture = this.createFacadeTexture();
        
        this.defineSkyscraperBaseMaterials();
        this.defineSkyscraperBaseGeometries();
        this.initializeSkyscraperMatrixArrays();
    }

    /**
     * Initialise les tableaux de matrices d'instances pour les gratte-ciels.
     */
    initializeSkyscraperMatrixArrays() {
        this.skyscraperInstanceMatrices = {
            default: []
        };
    }

    /**
     * Crée une texture procédurale pour les façades des gratte-ciels
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createFacadeTexture(width = 512, height = 512) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Couleur de base plus claire pour un meilleur contraste
        ctx.fillStyle = '#e0e6ed';
        ctx.fillRect(0, 0, width, height);

        // Ajout de variations de couleur pour simuler des panneaux de verre
        // Réduction encore plus importante du nombre de panneaux
        const panelWidth = width / 3;  // Réduit à 3 divisions (panneaux encore plus larges)
        const panelHeight = height / 6; // Réduit à 6 divisions (panneaux encore plus hauts)
        
        // Couleurs de base pour les panneaux
        const baseColors = [
            { r: 206, g: 212, b: 218 }, // Gris clair
            { r: 196, g: 202, b: 208 }, // Gris légèrement plus foncé
            { r: 216, g: 222, b: 228 }  // Gris légèrement plus clair
        ];
        
        for (let y = 0; y < height; y += panelHeight) {
            for (let x = 0; x < width; x += panelWidth) {
                // Sélection aléatoire d'une couleur de base
                const baseColor = baseColors[Math.floor(Math.random() * baseColors.length)];
                
                // Variation plus importante de la couleur
                const variation = Math.random() * 30 - 15;
                const r = Math.min(255, Math.max(0, baseColor.r + variation));
                const g = Math.min(255, Math.max(0, baseColor.g + variation));
                const b = Math.min(255, Math.max(0, baseColor.b + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, panelWidth - 1, panelHeight - 1);
                
                // Ajout d'un effet de réflexion sur certains panneaux
                if (Math.random() > 0.7) {
                    const reflectionWidth = panelWidth * 0.3;
                    const reflectionHeight = panelHeight * 0.3;
                    const reflectionX = x + Math.random() * (panelWidth - reflectionWidth);
                    const reflectionY = y + Math.random() * (panelHeight - reflectionHeight);
                    
                    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;
                    ctx.fillRect(reflectionX, reflectionY, reflectionWidth, reflectionHeight);
                }
            }
        }

        // Ajout de lignes horizontales pour simuler des joints
        ctx.strokeStyle = '#8a929a'; // Couleur plus foncée pour les joints
        ctx.lineWidth = 4; // Lignes encore plus épaisses
        for (let y = panelHeight; y < height; y += panelHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Ajout de lignes verticales décalées
        for (let y = 0; y < height; y += panelHeight * 2) {
            for (let x = panelWidth; x < width; x += panelWidth * 2) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + panelHeight);
                ctx.stroke();
            }
        }
        
        // Ajout de lignes verticales supplémentaires pour plus de détails
        for (let y = 0; y < height; y += panelHeight) {
            for (let x = panelWidth; x < width; x += panelWidth) {
                if (Math.random() > 0.5) { // 50% de chance d'avoir une ligne verticale
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + panelHeight);
                    ctx.stroke();
                }
            }
        }

        // Création de la texture Three.js
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1.5); // Ajustement de la répétition pour les panneaux plus grands
        return texture;
    }

    /**
     * Définit les matériaux de base utilisés pour les gratte-ciels.
     */
    defineSkyscraperBaseMaterials() {
        // Par défaut, un matériau métallique/gris pour les gratte-ciels.
        this.baseSkyscraperMaterials.default = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.5,
            metalness: 0.8,
            name: "DefaultSkyscraperMat",
            map: this.sharedFacadeTexture
        });
    }

    /**
     * Définit les géométries de base pour les gratte-ciels.
     * Ici, on utilise une boîte simple comme géométrie par défaut.
     */
    defineSkyscraperBaseGeometries() {
        this.baseSkyscraperGeometries.default = new THREE.BoxGeometry(1, 1, 1);
    }

    /**
     * Génère la matrice d'instance pour un gratte-ciel en fonction des paramètres fournis.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer le gratte-ciel.
     * @param {number} groundLevel - Position Y du sol.
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle appliqué.
     * @param {object} assetInfo - Objet contenant les données de l'asset (doit contenir sizeAfterFitting, fittingScaleFactor, centerOffset, id et éventuellement parts).
     * @returns {object} Un objet contenant les matrices d'instances pour le gratte-ciel.
     */
    generateSkyscraperInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor, assetInfo) {
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = assetInfo.fittingScaleFactor * baseScaleFactor;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(targetRotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -assetInfo.centerOffset.x,
            -assetInfo.centerOffset.y,
            -assetInfo.centerOffset.z
        );
        const finalHeight = assetInfo.sizeAfterFitting.y * baseScaleFactor;
        const finalY = finalHeight / 2 + (this.config.plotGroundY !== undefined ? this.config.plotGroundY : 0.005);
        const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);

        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(translationMatrix);

        const skyscraperInstanceData = {};
        if (assetInfo.parts && assetInfo.parts.length > 0) {
            assetInfo.parts.forEach((part, index) => {
                skyscraperInstanceData[`part${index}`] = [instanceMatrix.clone()];
            });
        } else {
            skyscraperInstanceData.default = [instanceMatrix.clone()];
        }
        return skyscraperInstanceData;
    }

    /**
     * Génère un asset procédural pour un gratte-ciel.
     *
     * Retourne un objet contenant :
     *   - id: identifiant unique
     *   - parts: tableau d'objets { geometry, material }
     *   - fittingScaleFactor, userScale, centerOffset, sizeAfterFitting
     *
     * Ces données seront utilisées pour créer des InstancedMesh dans votre scène.
     *
     * @param {number} baseWidth - Largeur cible.
     * @param {number} baseHeight - Hauteur cible.
     * @param {number} baseDepth - Profondeur cible.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur.
     * @param {number} [numFloors] - Nombre de niveaux du gratte-ciel.
     * @returns {object|null} L'asset généré ou null en cas d'erreur.
     */
    generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale = 1, numFloors) {
        const skyscraper = new THREE.Group();

        // --- Définition des matériaux spécifiques ---
        const structureMaterial = new THREE.MeshStandardMaterial({
            color: 0xced4da,
            flatShading: true,
            name: "SkyscraperStructureMat",
            map: this.sharedFacadeTexture
        });
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x6e7883,
            flatShading: true,
            name: "SkyscraperBaseMat",
            map: this.sharedFacadeTexture
        });
        const metallicMaterial = new THREE.MeshStandardMaterial({
            color: 0xadb5bd,
            metalness: 0.9,
            roughness: 0.4,
            flatShading: true,
            side: THREE.DoubleSide,
            name: "SkyscraperMetallicMat",
            map: this.sharedFacadeTexture
        });
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            flatShading: true,
            name: "SkyscraperFloorMat",
            map: this.sharedFacadeTexture
        });
        const skyscraperWindowMaterial = new THREE.MeshStandardMaterial({
            color: 0x60a3bc,
            metalness: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            flatShading: true,
            emissive: 0xfcffe0,
            name: "SkyscraperWindowMat_Standard"
        });

        // --- Dimensions générales ---
        const mainWidth = 9, mainDepth = 9;
        const standardFloorHeight = 3.0; // Hauteur fixe pour chaque étage
        const baseHeightVal = 2.5, intermediateStructureHeight = 1.0;
        const intermediateOverhang = 0.5;
        const windowHeightReductionFactor = 0.5;
        const windowWidthReductionFactor = 0.5;
        const doorHeightReductionFactor = 0.6;
        const doorWidthFactorAdjustment = 0.85;
        const pillarThickness = 0.4;
        const intermediateBandThickness = pillarThickness / windowWidthReductionFactor;
        const windowInset = 0.05;
        const floorThickness = 0.1; // Épaisseur visuelle du plancher (pour le maillage)

        // --- Base ---
        const baseGeometry = new THREE.BoxGeometry(mainWidth, baseHeightVal, mainDepth);
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.position.y = baseHeightVal / 2;
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        skyscraper.add(baseMesh);

        // --- Entrées/Portes de la base ---
        const doorHeight = baseHeightVal * doorHeightReductionFactor;
        const doorWidthFactor = 0.5;
        const originalBaseWindowPanelWidth = (mainWidth - 3 * pillarThickness) / 2;
        const originalBaseSideWindowPanelWidth = (mainDepth - 3 * pillarThickness) / 2;
        const doorWidth = originalBaseWindowPanelWidth * doorWidthFactor * doorWidthFactorAdjustment;
        const sideDoorWidth = originalBaseSideWindowPanelWidth * doorWidthFactor * doorWidthFactorAdjustment;
        const doorPanelDepth = (pillarThickness * 0.8) / 2;
        let doorGeomX = null, doorGeomZ = null;
        if (doorWidth > 0.01 && doorHeight > 0.01) {
            doorGeomX = new THREE.BoxGeometry(doorWidth, doorHeight, doorPanelDepth);
            const doorCenterX = doorWidth * 0.75;
            for (let i = 0; i < 2; i++) {
                const zPos = (mainDepth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
                const doorLeft = new THREE.Mesh(doorGeomX, skyscraperWindowMaterial);
                doorLeft.position.set(-doorCenterX, doorHeight / 2, zPos);
                doorLeft.castShadow = true;
                skyscraper.add(doorLeft);
                const doorRight = new THREE.Mesh(doorGeomX, skyscraperWindowMaterial);
                doorRight.position.set(doorCenterX, doorHeight / 2, zPos);
                doorRight.castShadow = true;
                skyscraper.add(doorRight);
            }
        }
        if (sideDoorWidth > 0.01 && doorHeight > 0.01) {
            doorGeomZ = new THREE.BoxGeometry(doorPanelDepth, doorHeight, sideDoorWidth);
            const doorCenterZ = sideDoorWidth * 0.75;
            for (let i = 0; i < 2; i++) {
                const xPos = (mainWidth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
                const doorBack = new THREE.Mesh(doorGeomZ, skyscraperWindowMaterial);
                doorBack.position.set(xPos, doorHeight / 2, -doorCenterZ);
                doorBack.castShadow = true;
                skyscraper.add(doorBack);
                const doorFront = new THREE.Mesh(doorGeomZ, skyscraperWindowMaterial);
                doorFront.position.set(xPos, doorHeight / 2, doorCenterZ);
                doorFront.castShadow = true;
                skyscraper.add(doorFront);
            }
        }

        // --- Structure intermédiaire ---
        const intermediateWidth = mainWidth + 2 * intermediateOverhang;
        const intermediateDepth = mainDepth + 2 * intermediateOverhang;
        const intermediateGeometry = new THREE.BoxGeometry(intermediateWidth, intermediateStructureHeight, intermediateDepth);
        const intermediateMesh = new THREE.Mesh(intermediateGeometry, baseMaterial);
        intermediateMesh.position.y = baseHeightVal + intermediateStructureHeight / 2;
        intermediateMesh.castShadow = true;
        intermediateMesh.receiveShadow = true;
        skyscraper.add(intermediateMesh);

        // --- Corps principal ---
        const startY = baseHeightVal + intermediateStructureHeight;
        if (numFloors === undefined || numFloors < 7 || numFloors > 11) {
             console.warn(`generateProceduralSkyscraper: numFloors invalide (${numFloors}). Utilisation de 9 par défaut.`);
             numFloors = 9; // Valeur par défaut si non fourni ou invalide
        }
        const structureHeight = numFloors * standardFloorHeight;
        const floorHeight = standardFloorHeight; // La hauteur de chaque étage est maintenant fixe
        const numWindowsPerFace = 4;
        const numIntermediateBands = numWindowsPerFace - 1;
        const windowHeightVal = floorHeight * windowHeightReductionFactor;
        const horizontalBandHeight = floorHeight - windowHeightVal;
        const cornerPillarGeom = new THREE.BoxGeometry(pillarThickness + 0.7, structureHeight, pillarThickness + 0.7);
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                const pillar = new THREE.Mesh(cornerPillarGeom, structureMaterial);
                pillar.position.set(
                    (mainWidth / 2) * (i === 0 ? -1 : 1),
                    startY + structureHeight / 2,
                    (mainDepth / 2) * (j === 0 ? -1 : 1)
                );
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                skyscraper.add(pillar);
            }
        }
        const totalSpanX = mainWidth - pillarThickness;
        const totalSpanZ = mainDepth - pillarThickness;
        const totalIntermediateBandWidthX = numIntermediateBands * intermediateBandThickness;
        const totalIntermediateBandWidthZ = numIntermediateBands * intermediateBandThickness;
        const totalWindowWidthX = Math.max(0, totalSpanX - totalIntermediateBandWidthX);
        const totalWindowWidthZ = Math.max(0, totalSpanZ - totalIntermediateBandWidthZ);
        const singleWindowWidthX = numWindowsPerFace > 0 ? totalWindowWidthX / numWindowsPerFace : 0;
        const singleWindowWidthZ = numWindowsPerFace > 0 ? totalWindowWidthZ / numWindowsPerFace : 0;
        const windowGeomX = singleWindowWidthX > 0.01 && windowHeightVal > 0.01
            ? new THREE.BoxGeometry(singleWindowWidthX, windowHeightVal, pillarThickness * 0.9)
            : null;
        const windowGeomZ = singleWindowWidthZ > 0.01 && windowHeightVal > 0.01
            ? new THREE.BoxGeometry(pillarThickness * 0.9, windowHeightVal, singleWindowWidthZ)
            : null;
        if (windowGeomX || windowGeomZ) {
            for (let floor = 0; floor < numFloors; floor++) {
                const floorBaseY = startY + floor * floorHeight;
                const yPosWindowCenter = floorBaseY + horizontalBandHeight + (windowHeightVal / 2);
                for (let win = 0; win < numWindowsPerFace; win++) {
                    const xPos = (-mainWidth / 2 + pillarThickness / 2)
                        + win * intermediateBandThickness + win * singleWindowWidthX + singleWindowWidthX / 2;
                    const zPos = (-mainDepth / 2 + pillarThickness / 2)
                        + win * intermediateBandThickness + win * singleWindowWidthZ + singleWindowWidthZ / 2;
                    if (windowGeomX) {
                        const windowFront = new THREE.Mesh(windowGeomX, skyscraperWindowMaterial);
                        windowFront.position.set(xPos, yPosWindowCenter, mainDepth / 2 - windowInset);
                        windowFront.castShadow = true;
                        skyscraper.add(windowFront);
                        const windowBack = new THREE.Mesh(windowGeomX, skyscraperWindowMaterial);
                        windowBack.position.set(xPos, yPosWindowCenter, -mainDepth / 2 + windowInset);
                        windowBack.castShadow = true;
                        skyscraper.add(windowBack);
                    }
                    if (windowGeomZ) {
                        const windowRight = new THREE.Mesh(windowGeomZ, skyscraperWindowMaterial);
                        windowRight.position.set(mainWidth / 2 - windowInset, yPosWindowCenter, zPos);
                        windowRight.castShadow = true;
                        skyscraper.add(windowRight);
                        const windowLeft = new THREE.Mesh(windowGeomZ, skyscraperWindowMaterial);
                        windowLeft.position.set(-mainWidth / 2 + windowInset, yPosWindowCenter, zPos);
                        windowLeft.castShadow = true;
                        skyscraper.add(windowLeft);
                    }
                }
            }
        }
        const verticalBandGeomX = intermediateBandThickness > 0.01
            ? new THREE.BoxGeometry(intermediateBandThickness, structureHeight, pillarThickness * 0.95)
            : null;
        const verticalBandGeomZ = intermediateBandThickness > 0.01
            ? new THREE.BoxGeometry(pillarThickness * 0.95, structureHeight, intermediateBandThickness)
            : null;
        const yPosBandVert = startY + structureHeight / 2;
        if (verticalBandGeomX && verticalBandGeomZ && singleWindowWidthX > 0.01 && singleWindowWidthZ > 0.01 && numIntermediateBands > 0) {
            for (let i = 0; i < numIntermediateBands; i++) {
                const xPosBand = (-mainWidth / 2 + pillarThickness / 2)
                    + (i + 1) * singleWindowWidthX + i * intermediateBandThickness + intermediateBandThickness / 2;
                const zPosBand = (-mainDepth / 2 + pillarThickness / 2)
                    + (i + 1) * singleWindowWidthZ + i * intermediateBandThickness + intermediateBandThickness / 2;
                const bandFrontVert = new THREE.Mesh(verticalBandGeomX, structureMaterial);
                bandFrontVert.position.set(xPosBand, yPosBandVert, mainDepth / 2);
                bandFrontVert.castShadow = true;
                bandFrontVert.receiveShadow = true;
                skyscraper.add(bandFrontVert);
                const bandBackVert = new THREE.Mesh(verticalBandGeomX, structureMaterial);
                bandBackVert.position.set(xPosBand, yPosBandVert, -mainDepth / 2);
                bandBackVert.castShadow = true;
                bandBackVert.receiveShadow = true;
                skyscraper.add(bandBackVert);
                const bandRightVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial);
                bandRightVert.position.set(mainWidth / 2, yPosBandVert, zPosBand);
                bandRightVert.castShadow = true;
                bandRightVert.receiveShadow = true;
                skyscraper.add(bandRightVert);
                const bandLeftVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial);
                bandLeftVert.position.set(-mainWidth / 2, yPosBandVert, zPosBand);
                bandLeftVert.castShadow = true;
                bandLeftVert.receiveShadow = true;
                skyscraper.add(bandLeftVert);
            }
        }
        const horizontalBandGeomX = horizontalBandHeight > 0.01
            ? new THREE.BoxGeometry(mainWidth, horizontalBandHeight, pillarThickness)
            : null;
        const horizontalBandGeomZ = horizontalBandHeight > 0.01
            ? new THREE.BoxGeometry(pillarThickness, horizontalBandHeight, mainDepth)
            : null;
        for (let floor = 0; floor <= numFloors; floor++) {
            const bandBaseY = startY + floor * floorHeight;
            const yPosBandCenter = bandBaseY + horizontalBandHeight / 2;
            if (horizontalBandGeomX) {
                const bandFront = new THREE.Mesh(horizontalBandGeomX, structureMaterial);
                bandFront.position.set(0, yPosBandCenter, mainDepth / 2);
                skyscraper.add(bandFront);
                const bandBack = new THREE.Mesh(horizontalBandGeomX, structureMaterial);
                bandBack.position.set(0, yPosBandCenter, -mainDepth / 2);
                skyscraper.add(bandBack);
            }
            if (horizontalBandGeomZ) {
                const bandRight = new THREE.Mesh(horizontalBandGeomZ, structureMaterial);
                bandRight.position.set(mainWidth / 2, yPosBandCenter, 0);
                skyscraper.add(bandRight);
                const bandLeft = new THREE.Mesh(horizontalBandGeomZ, structureMaterial);
                bandLeft.position.set(-mainWidth / 2, yPosBandCenter, 0);
                skyscraper.add(bandLeft);
            }
        }
        const floorGeometry = new THREE.BoxGeometry(mainWidth - pillarThickness, floorThickness, mainDepth - pillarThickness);
        for (let floor = 0; floor < numFloors; floor++) {
            const floorBaseY = startY + floor * floorHeight + horizontalBandHeight;
            const yPosFloor = floorBaseY - floorThickness / 2;
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.position.set(0, yPosFloor, 0);
            floorMesh.receiveShadow = true;
            skyscraper.add(floorMesh);
        }
        const roofHeightVal = 1.5;
        const roofGeom = new THREE.BoxGeometry(mainWidth, roofHeightVal, mainDepth);
        const roofMesh = new THREE.Mesh(roofGeom, baseMaterial);
        const roofBaseY = startY + structureHeight;
        roofMesh.position.y = roofBaseY + roofHeightVal / 2;
        roofMesh.castShadow = true;
        roofMesh.receiveShadow = true;
        skyscraper.add(roofMesh);
        const roofTopY = roofBaseY + roofHeightVal;
        const antennaHeight = 3, antennaRadius = 0.1;
        const antennaGeom = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight, 8);
        const antenna1 = new THREE.Mesh(antennaGeom, metallicMaterial);
        antenna1.position.set(mainWidth * 0.3, roofTopY + antennaHeight / 2, mainDepth * 0.3);
        antenna1.castShadow = true;
        skyscraper.add(antenna1);
        const antenna2 = new THREE.Mesh(antennaGeom, metallicMaterial);
        antenna2.position.set(-mainWidth * 0.3, roofTopY + antennaHeight / 2, -mainDepth * 0.3);
        antenna2.castShadow = true;
        skyscraper.add(antenna2);
        const boxSize = 0.8;
        const boxGeom = new THREE.BoxGeometry(boxSize, boxSize * 0.5, boxSize);
        const roofBox1 = new THREE.Mesh(boxGeom, metallicMaterial);
        roofBox1.position.set(0, roofTopY + (boxSize * 0.5) / 2, -mainDepth * 0.2);
        roofBox1.castShadow = true;
        skyscraper.add(roofBox1);
        const dishRadius = 1.2;
        const dishDepth = Math.PI * 0.3;
        const dishThetaStart = Math.PI - dishDepth;
        const dishThetaLength = dishDepth;
        const dishGeometry = new THREE.SphereGeometry(dishRadius, 20, 10, 0, Math.PI * 2, dishThetaStart, dishThetaLength);
        const dish = new THREE.Mesh(dishGeometry, metallicMaterial);
        dish.rotation.x = Math.PI * 0.05;
        const dishStandHeight = 0.5;
        const dishStandGeom = new THREE.CylinderGeometry(0.1, 0.1, dishStandHeight, 8);
        const dishStand = new THREE.Mesh(dishStandGeom, metallicMaterial);
        dishStand.position.set(mainWidth * -0.25, roofTopY + dishStandHeight / 2, mainDepth * 0.2);
        dishStand.castShadow = true;
        skyscraper.add(dishStand);
        dish.position.copy(dishStand.position);
        dish.position.y = dishStand.position.y + dishStandHeight / 2 + dishRadius * 0.3 + 0.8;
        dish.castShadow = true;
        skyscraper.add(dish);
        const equipBoxGeom1 = new THREE.BoxGeometry(1.5, 0.8, 0.8);
        const equipBox1 = new THREE.Mesh(equipBoxGeom1, metallicMaterial);
        equipBox1.position.set(mainWidth * 0.3, roofTopY + 0.8 / 2, -mainDepth * 0.3);
        equipBox1.castShadow = true;
        skyscraper.add(equipBox1);
        const equipCylGeom1 = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12);
        const equipCyl1 = new THREE.Mesh(equipCylGeom1, metallicMaterial);
        equipCyl1.position.set(-mainWidth * 0.1, roofTopY + 1.2 / 2, mainDepth * 0.35);
        equipCyl1.castShadow = true;
        skyscraper.add(equipCyl1);

        // --- Regroupement par matériau ---
        const allGeoms = [];
        const materialMap = new Map();
        materialMap.set(structureMaterial.name, { material: structureMaterial.clone(), geoms: [] });
        materialMap.set(baseMaterial.name, { material: baseMaterial.clone(), geoms: [] });
        materialMap.set(metallicMaterial.name, { material: metallicMaterial.clone(), geoms: [] });
        materialMap.set(floorMaterial.name, { material: floorMaterial.clone(), geoms: [] });
        materialMap.set(skyscraperWindowMaterial.name, { material: skyscraperWindowMaterial.clone(), geoms: [] });

        skyscraper.traverse(child => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                let clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);
                allGeoms.push(clonedGeom);
                const matName = child.material.name;
                const groupData = materialMap.get(matName);
                if (groupData) {
                    groupData.geoms.push(clonedGeom);
                } else {
                    console.warn(`Matériau inconnu ou sans nom trouvé: ${matName || '[sans nom]'}`);
                }
            }
        });

        if (allGeoms.length === 0) {
            console.error("Aucune géométrie valide trouvée pour le gratte-ciel procédural.");
            return null;
        }
        const globalMerged = mergeGeometries(allGeoms, false);
        if (!globalMerged) {
            console.error("Échec de fusion globale pour le gratte‑ciel procédural.");
            allGeoms.forEach(g => g.dispose());
            return null;
        }
        globalMerged.computeBoundingBox();
        const globalMin = globalMerged.boundingBox.min;
        const globalCenter = new THREE.Vector3();
        globalMerged.boundingBox.getCenter(globalCenter);
        const globalSize = new THREE.Vector3();
        globalMerged.boundingBox.getSize(globalSize);
        globalSize.x = Math.max(globalSize.x, 0.001);
        globalSize.y = Math.max(globalSize.y, 0.001);
        globalSize.z = Math.max(globalSize.z, 0.001);
        
        // *** Modification du calcul du fittingScaleFactor ***
        // Calculer l'échelle uniquement en fonction de la largeur et profondeur cibles.
        // La hauteur (baseHeight) passée en paramètre est ignorée ici.
        const fittingScaleFactorXZ = Math.min(baseWidth / globalSize.x, baseDepth / globalSize.z);
        // La hauteur finale sera la hauteur géométrique calculée multipliée par ce facteur d'échelle XZ.
        const finalHeight = globalSize.y * fittingScaleFactorXZ;
        
        // Appliquer le même facteur d'échelle aux trois axes pour conserver les proportions X/Z
        const fittingScaleFactor = fittingScaleFactorXZ; 

        // Calculer la taille finale après application de l'échelle uniforme
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        const parts = [];
        materialMap.forEach((groupData, key) => {
            if (groupData.geoms.length === 0) return;
            const mergedPart = mergeGeometries(groupData.geoms, false);
            if (!mergedPart) {
                console.error(`Échec de fusion du groupe de géométries "${key}" pour le gratte‑ciel.`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }
            mergedPart.translate(-globalCenter.x, -globalMin.y, -globalCenter.z);
            mergedPart.computeBoundingBox();
            const finalMaterial = groupData.material;
            finalMaterial.needsUpdate = true;
            parts.push({ geometry: mergedPart, material: finalMaterial });
            groupData.geoms.forEach(g => g.dispose());
        });

        allGeoms.forEach(g => g.dispose());
        globalMerged.dispose();
        baseGeometry?.dispose();
        cornerPillarGeom?.dispose();
        intermediateGeometry?.dispose();
        if (verticalBandGeomX) verticalBandGeomX.dispose();
        if (verticalBandGeomZ) verticalBandGeomZ.dispose();
        if (horizontalBandGeomX) horizontalBandGeomX.dispose();
        if (horizontalBandGeomZ) horizontalBandGeomZ.dispose();
        if (floorGeometry) floorGeometry.dispose();
        if (roofGeom) roofGeom.dispose();
        if (antennaGeom) antennaGeom.dispose();
        if (boxGeom) boxGeom.dispose();
        if (dishGeometry) dishGeometry.dispose();
        if (dishStandGeom) dishStandGeom.dispose();
        if (equipBoxGeom1) equipBoxGeom1.dispose();
        if (equipCylGeom1) equipCylGeom1.dispose();
        if (windowGeomX) windowGeomX.dispose();
        if (windowGeomZ) windowGeomZ.dispose();
        if (doorGeomX) doorGeomX.dispose();
        if (doorGeomZ) doorGeomZ.dispose();

        const asset = {
            id: `skyscraper_procedural_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(globalCenter.x, globalCenter.y, globalCenter.z),
            sizeAfterFitting: sizeAfterFitting
        };
        return asset;
    }

    /**
     * Réinitialise le SkyscraperRenderer en libérant les ressources de géométrie et en réinitialisant les tableaux d'instances.
     */
    reset() {
        if (this.baseSkyscraperGeometries && this.baseSkyscraperGeometries.default) {
            this.baseSkyscraperGeometries.default.dispose();
        }
        this.baseSkyscraperGeometries = {};
        this.defineSkyscraperBaseGeometries();
        this.initializeSkyscraperMatrixArrays();
    }
}
