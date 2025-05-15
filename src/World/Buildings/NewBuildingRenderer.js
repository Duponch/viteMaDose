// src/World/Buildings/NewBuildingRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// IMPORTANT: Les fonctions create...Texture (ex: createWallTexture) du fichier HTML
// ne sont PAS incluses ici. Vous devrez soit :
// 1. Les copier/coller ici (ou dans un fichier utilitaire) si vous voulez les répliquer.
// 2. (RECOMMANDÉ) Mapper les matériaux ci-dessous aux textures/matériaux EXISTANTS
//    dans votre projet principal (passés via le constructeur dans `materials`).
// L'exemple ci-dessous utilise des couleurs simples ou des matériaux existants (si trouvés) comme fallback.

export default class NewBuildingRenderer {
    /**
     * Constructeur pour le nouveau renderer d'immeuble.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Matériaux partagés du projet (ex: materials.buildingGroundMaterial).
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; // Matériaux du projet principal
        this.assetIdCounter = 0;

        // Création de la texture de façade partagée
        this.sharedFacadeTexture = this.createFacadeTexture();

        // Définition des matériaux LOCAUX pour cet immeuble.
        // Essayez de mapper aux matériaux existants, sinon utilisez un fallback simple.
        this.localMaterials = {
            wall: (this.materials.buildingGroundMaterial || new THREE.MeshStandardMaterial({ 
                color: 0x6B8E6B, 
                name:"FallbackWall",
                map: this.sharedFacadeTexture,
                roughness: 0.8,
                metalness: 0.1
            })).clone(),
            trim: (this.materials.sidewalkMaterial || new THREE.MeshStandardMaterial({ 
                color: 0xb5aab8, 
                name:"FallbackTrim",
                map: this.sharedFacadeTexture,
                roughness: 0.8,
                metalness: 0.1
            })).clone(),
            roof: new THREE.MeshStandardMaterial({ 
                color: 0xb8a8a0, 
                name:"NewBuildingRoof",
                map: this.sharedFacadeTexture,
                roughness: 0.8,
                metalness: 0.1
            }),
            window: new THREE.MeshStandardMaterial({ 
                color: 0xadd8e6, 
                transparent: true, 
                opacity: 0.7, 
                name:"NewBuildingWindow",
                emissive: 0xfcffe0,
                emissiveIntensity: 0.0,
                metalness: 0.8,
                roughness: 0.2
            }),
            balconyWindow: new THREE.MeshStandardMaterial({ 
                color: 0x607B8B, 
                transparent: true, 
                opacity: 0.6, 
                name:"NewBuildingBalconyWindow",
                emissive: 0xfcffe0,
                emissiveIntensity: 0.0,
                metalness: 0.8,
                roughness: 0.2
            }),
            groundFloor: (this.materials.industrialGroundMaterial || new THREE.MeshStandardMaterial({ 
                color: 0xaaaaaa, 
                name:"FallbackGroundFloor",
                map: this.sharedFacadeTexture,
                roughness: 0.8,
                metalness: 0.1
            })).clone(),
            frame: new THREE.MeshBasicMaterial({ 
                color: 0x4d414f, 
                name:"NewBuildingFrame" 
            }),
            vent: new THREE.MeshStandardMaterial({ 
                color: 0x555555, 
                metalness: 0.9, 
                roughness: 0.4, 
                name:"NewBuildingVent" 
            }),
            antenna: new THREE.MeshStandardMaterial({ 
                color: 0x444444, 
                metalness: 1.0, 
                roughness: 0.3, 
                name:"NewBuildingAntenna" 
            }),
            balconyWall: (this.materials.sidewalkMaterial || new THREE.MeshStandardMaterial({ 
                color: 0xb5aab8, 
                name:"FallbackBalconyWall",
                map: this.sharedFacadeTexture,
                roughness: 0.8,
                metalness: 0.1
            })).clone(),
            door: new THREE.MeshStandardMaterial({ 
                color: 0x8a7967, 
                name: "NewBuildingDoor",
                metalness: 0.8,
                roughness: 0.2,
                emissive: 0xfcffe0,
                emissiveIntensity: 0.0,
                map: null
            }),
        };

        // Assigner des noms uniques aux matériaux clonés pour éviter conflits
        Object.keys(this.localMaterials).forEach(key => {
            if (key === 'window' || key === 'balconyWindow' || key === 'door') {
                // Pour les fenêtres et les portes, utiliser un nom fixe
                this.localMaterials[key].name = `NewBuilding${key.charAt(0).toUpperCase() + key.slice(1)}`;
            } else {
                // Pour les autres matériaux, générer un nom unique
                this.localMaterials[key].name = `NewBuildingMat_${key}_${Math.random().toString(16).slice(2, 8)}`;
            }
        });

        //console.log("NewBuildingRenderer initialized with local materials.");
    }

    /**
     * Crée une texture procédurale pour les façades des immeubles
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createFacadeTexture(width = 512, height = 512) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Couleur de base
        ctx.fillStyle = '#f0e6d2';
        ctx.fillRect(0, 0, width, height);

        // Ajout de variations de couleur pour simuler des briques
        const brickWidth = width / 8;
        const brickHeight = height / 16;
        
        for (let y = 0; y < height; y += brickHeight) {
            for (let x = 0; x < width; x += brickWidth) {
                // Variation aléatoire plus prononcée avec une probabilité de briques plus foncées
                let variation;
                if (Math.random() < 0.2) { // 20% de chance d'avoir une brique plus foncée
                    variation = Math.random() * 40 - 60; // Variation plus forte vers le foncé
                } else {
                    variation = Math.random() * 30 - 15; // Variation normale
                }
                
                const r = Math.min(255, Math.max(0, 240 + variation));
                const g = Math.min(255, Math.max(0, 230 + variation));
                const b = Math.min(255, Math.max(0, 210 + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, brickWidth - 1, brickHeight - 1);
            }
        }

        // Ajout de lignes horizontales pour simuler des joints
        ctx.strokeStyle = '#d7c4a3';
        ctx.lineWidth = 2;
        for (let y = brickHeight; y < height; y += brickHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Ajout de lignes verticales décalées
        for (let y = 0; y < height; y += brickHeight * 2) {
            for (let x = brickWidth; x < width; x += brickWidth * 2) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + brickHeight);
                ctx.stroke();
            }
        }

        // Création de la texture Three.js
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    }

    /**
     * Génère l'asset procédural pour cet immeuble spécifique.
     * @param {number} baseWidth - Largeur cible (pour calcul scale).
     * @param {number} baseHeight - Hauteur cible.
     * @param {number} baseDepth - Profondeur cible.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur (généralement 1 ici).
     * @returns {object|null} L'asset généré {id, parts, fittingScaleFactor, ...} ou null.
     */
    generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1) {
        // Augmenter l'échelle par défaut
        const defaultScaleMultiplier = 1.2; // Augmentation de 50%
        
        // Ajuster les dimensions de base
        const adjustedBaseWidth = baseWidth * defaultScaleMultiplier;
        const adjustedBaseHeight = baseHeight * defaultScaleMultiplier;
        const adjustedBaseDepth = baseDepth * defaultScaleMultiplier;
        
        const buildingGroup = new THREE.Group(); // Groupe temporaire pour l'assemblage

        // ----- Copier les Constantes de Dimensions du HTML -----
        const floorHeight = 3; const numFloors = 6; const buildingHeight = floorHeight * numFloors;
        const mainWidth = 10; const mainDepth = 10; const recessWidth = 5; const recessDepth = 8;
        const roofOverhang = 0.5; const bandHeight = 0.2; const columnSize = 0.4;
        const roofLedgeHeight = 0.3; const roofLedgeThickness = 0.3; const roofHeight = 0.5;
        const rearBlockFloors = numFloors - 1; const rearBlockHeight = floorHeight * rearBlockFloors;
        const rearBlockWidth = mainWidth; const rearBlockDepth = 6;
        const frontBuildingCenterX = (mainWidth / 2 + recessWidth / 2 - mainWidth / 2) / 2 - (recessWidth / 4);
        const frontRoofBaseWidth = mainWidth + recessWidth; const frontRoofWidth = frontRoofBaseWidth + roofOverhang * 2;
        const frontRoofBaseDepth = mainDepth; const frontRoofDepth = frontRoofBaseDepth + roofOverhang * 2;
        const windowWidth = 1.2; const windowHeight = 1.5; const windowDepth = 0.1;
        const frameThickness = 0.05; const frameDepth = 0.08;
        const balconyWindowWidth = recessWidth * 0.7; const balconyWindowHeight = windowHeight * 1.1;
        const balconyWindowDepth = windowDepth; const dividerWidth = frameThickness * 1.5;
        const balconyWallHeight = 0.6; const balconyWallThickness = 0.2; const balconyWallWidth = recessWidth;
        const antennaHeight = 2.5; const antennaRadius = 0.15;

        // ----- Matériaux locaux (références pratiques) -----
        const wallMaterial = this.localMaterials.wall;
        const trimMaterial = this.localMaterials.trim;
        const roofMaterial = this.localMaterials.roof;
        const windowMaterial = this.localMaterials.window;
        const balconyWindowMaterial = this.localMaterials.balconyWindow;
        const groundFloorMaterial = this.localMaterials.groundFloor; // Simplifié
        const frameMaterial = this.localMaterials.frame;
        const ventMaterial = this.localMaterials.vent;
        const antennaMaterial = this.localMaterials.antenna;
        const balconyWallMaterial = this.localMaterials.balconyWall; // Trim par défaut
        const ledgeMaterial = trimMaterial; // Utilise le trim pour les rebords
        const doorMaterial = this.localMaterials.door;

        // ----- Création des Géométries et Meshes (Copier/Adapter du HTML) -----

        // --- Blocs Structurels ---
        const mainBlockGeo = new THREE.BoxGeometry(mainWidth, buildingHeight, mainDepth);
        const mainBlockMesh = new THREE.Mesh(mainBlockGeo, wallMaterial);
        mainBlockMesh.position.set(-(recessWidth / 2), buildingHeight / 2, 0);
        buildingGroup.add(mainBlockMesh);

        const recessBlockGeo = new THREE.BoxGeometry(recessWidth, buildingHeight, recessDepth);
        const recessBlockMesh = new THREE.Mesh(recessBlockGeo, wallMaterial);
        recessBlockMesh.position.set(mainWidth / 2, buildingHeight / 2, -(mainDepth - recessDepth) / 2);
        buildingGroup.add(recessBlockMesh);

        const rearBlockGeo = new THREE.BoxGeometry(rearBlockWidth, rearBlockHeight, rearBlockDepth);
        const rearBlockMesh = new THREE.Mesh(rearBlockGeo, wallMaterial);
        rearBlockMesh.position.set(mainBlockMesh.position.x, rearBlockHeight / 2, -mainDepth / 2 - rearBlockDepth / 2);
        buildingGroup.add(rearBlockMesh);

        // --- Toits et Rebords ---
        const frontRoofGeo = new THREE.BoxGeometry(frontRoofWidth, roofHeight, frontRoofDepth);
        const frontRoofMesh = new THREE.Mesh(frontRoofGeo, roofMaterial);
        frontRoofMesh.position.set(frontBuildingCenterX, buildingHeight + roofHeight / 2, 0);
        buildingGroup.add(frontRoofMesh);

        const frontLedgeFrontGeo = new THREE.BoxGeometry(frontRoofWidth, roofLedgeHeight, roofLedgeThickness);
        const frontLedgeFrontMesh = new THREE.Mesh(frontLedgeFrontGeo, ledgeMaterial);
        frontLedgeFrontMesh.position.set(frontRoofMesh.position.x, buildingHeight + roofHeight + roofLedgeHeight / 2, frontRoofDepth / 2 - roofLedgeThickness / 2);
        buildingGroup.add(frontLedgeFrontMesh);

        const frontLedgeBackGeo = new THREE.BoxGeometry(frontRoofWidth, roofLedgeHeight, roofLedgeThickness);
        const frontLedgeBackMesh = new THREE.Mesh(frontLedgeBackGeo, ledgeMaterial);
        frontLedgeBackMesh.position.set(frontRoofMesh.position.x, buildingHeight + roofHeight + roofLedgeHeight / 2, -frontRoofDepth / 2 + roofLedgeThickness / 2);
        buildingGroup.add(frontLedgeBackMesh);

        const frontLedgeLeftGeo = new THREE.BoxGeometry(roofLedgeThickness, roofLedgeHeight, frontRoofDepth - 2 * roofLedgeThickness);
        const frontLedgeLeftMesh = new THREE.Mesh(frontLedgeLeftGeo, ledgeMaterial);
        frontLedgeLeftMesh.position.set(frontRoofMesh.position.x - frontRoofWidth / 2 + roofLedgeThickness / 2, buildingHeight + roofHeight + roofLedgeHeight / 2, 0);
        buildingGroup.add(frontLedgeLeftMesh);

        const frontLedgeRightGeo = new THREE.BoxGeometry(roofLedgeThickness, roofLedgeHeight, frontRoofDepth - 2 * roofLedgeThickness);
        const frontLedgeRightMesh = new THREE.Mesh(frontLedgeRightGeo, ledgeMaterial);
        frontLedgeRightMesh.position.set(frontRoofMesh.position.x + frontRoofWidth / 2 - roofLedgeThickness / 2, buildingHeight + roofHeight + roofLedgeHeight / 2, 0);
        buildingGroup.add(frontLedgeRightMesh);

        // Éléments de toit (Vents, Antenne)
        const ventGeo = new THREE.BoxGeometry(1.5, 0.8, 1.5);
        const ventMesh1 = new THREE.Mesh(ventGeo, ventMaterial);
        ventMesh1.position.set(frontRoofMesh.position.x - frontRoofWidth * 0.2, buildingHeight + roofHeight + 0.4, -frontRoofDepth * 0.2);
        buildingGroup.add(ventMesh1);
        const ventMesh2 = new THREE.Mesh(ventGeo, ventMaterial);
        ventMesh2.position.set(frontRoofMesh.position.x + frontRoofWidth * 0.1, buildingHeight + roofHeight + 0.4, frontRoofDepth * 0.1);
        buildingGroup.add(ventMesh2);

        const antennaGeo = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight, 8);
        const antennaMesh = new THREE.Mesh(antennaGeo, antennaMaterial);
        antennaMesh.position.set(
            frontRoofMesh.position.x + frontRoofWidth * 0.3,
            buildingHeight + roofHeight + antennaHeight / 2,
            frontRoofMesh.position.z - frontRoofDepth * 0.3
        );
        buildingGroup.add(antennaMesh);

        // Toit arrière
        const rearRoofWidth = rearBlockWidth + roofOverhang * 2;
        const rearRoofDepth = rearBlockDepth + roofOverhang * 2;
        const rearRoofGeo = new THREE.BoxGeometry(rearRoofWidth, roofHeight, rearRoofDepth);
        const rearRoofMesh = new THREE.Mesh(rearRoofGeo, roofMaterial);
        rearRoofMesh.position.set(rearBlockMesh.position.x, rearBlockHeight + roofHeight / 2, rearBlockMesh.position.z);
        buildingGroup.add(rearRoofMesh);

        // --- Bandes Horizontales ---
        const frontBandGeo = new THREE.BoxGeometry(frontRoofWidth, bandHeight, frontRoofDepth);
        for (let i = 1; i < numFloors; i++) {
            const bandMesh = new THREE.Mesh(frontBandGeo, trimMaterial);
            bandMesh.position.set(frontBuildingCenterX, i * floorHeight - bandHeight / 2, 0);
            buildingGroup.add(bandMesh);
        }
        const baseFrontBandMesh = new THREE.Mesh(frontBandGeo, trimMaterial);
        baseFrontBandMesh.position.set(frontBuildingCenterX, bandHeight / 2, 0);
        buildingGroup.add(baseFrontBandMesh);

        const rearBandWidth = rearBlockWidth + roofOverhang * 2;
        const rearBandDepth = rearBlockDepth + roofOverhang * 2;
        const rearBandGeo = new THREE.BoxGeometry(rearBandWidth, bandHeight, rearBandDepth);
        for (let i = 1; i < rearBlockFloors; i++) {
            const bandMesh = new THREE.Mesh(rearBandGeo, trimMaterial);
            bandMesh.position.set(rearBlockMesh.position.x, i * floorHeight - bandHeight / 2, rearBlockMesh.position.z);
            buildingGroup.add(bandMesh);
        }
        const baseRearBandMesh = new THREE.Mesh(rearBandGeo, trimMaterial);
        baseRearBandMesh.position.set(rearBlockMesh.position.x, bandHeight / 2, rearBlockMesh.position.z);
        buildingGroup.add(baseRearBandMesh);

        // --- Colonnes Verticales ---
        const columnGeo = new THREE.BoxGeometry(columnSize, buildingHeight, columnSize);
        const columnPositions = [
            { x: mainWidth / 2 - recessWidth / 2 + columnSize / 2, z: -(mainDepth - recessDepth) / 2 + recessDepth / 2 - columnSize / 2 },
            { x: mainWidth / 2 + recessWidth / 2 - columnSize / 2, z: -(mainDepth - recessDepth) / 2 + recessDepth / 2 - columnSize / 2 },
            { x: mainWidth / 2 + recessWidth / 2 - columnSize / 2, z: -(mainDepth - recessDepth) / 2 - recessDepth / 2 + columnSize / 2 },
        ];
        columnPositions.forEach(pos => {
            const columnMesh = new THREE.Mesh(columnGeo, trimMaterial);
            columnMesh.position.set(pos.x, buildingHeight / 2, pos.z);
            buildingGroup.add(columnMesh);
        });

        // --- Fenêtres et Balcons ---
        const frameGeo = new THREE.BoxGeometry(windowWidth + 2 * frameThickness, windowHeight + 2 * frameThickness, frameDepth);
        const windowGeo = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth);
        const balconyFrameGeo = new THREE.BoxGeometry(balconyWindowWidth + 2 * frameThickness, balconyWindowHeight + 2 * frameThickness, frameDepth);
        const balconyWindowGeo = new THREE.BoxGeometry(balconyWindowWidth, balconyWindowHeight, balconyWindowDepth);
        const dividerGeo = new THREE.BoxGeometry(dividerWidth, balconyWindowHeight + 2 * frameThickness, frameDepth * 1.1);
        const balconyWallGeo = new THREE.BoxGeometry(balconyWallWidth, balconyWallHeight, balconyWallThickness);
        const recessBlockFrontZ = recessBlockMesh.position.z + recessDepth / 2;
        const frontWallBackZ = (frontRoofDepth / 2 - balconyWallThickness / 2) - balconyWallThickness / 2;
        const sideWallDepth = Math.max(0.01, frontWallBackZ - recessBlockFrontZ); // Assurer une profondeur minimale
        const balconySideWallGeo = new THREE.BoxGeometry(balconyWallThickness, balconyWallHeight, sideWallDepth);

        // Fonction locale createWindow (modifiée pour ajouter au groupe)
        const createWindow = (x, y, z, rotationY = 0) => {
            const windowMesh = new THREE.Mesh(windowGeo, windowMaterial);
            windowMesh.position.set(x, y, z);
            windowMesh.rotation.y = rotationY;
            buildingGroup.add(windowMesh);

            const frameMesh = new THREE.Mesh(frameGeo, frameMaterial);
            frameMesh.rotation.y = rotationY;
            const offset = new THREE.Vector3(0, 0, -(frameDepth - windowDepth) / 2 - 0.01);
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
            frameMesh.position.set(x + offset.x, y, z + offset.z);
            buildingGroup.add(frameMesh);
        };

        // Fenêtres Avant (Bloc Principal)
        const windowsPerFloorMain = 3;
        const windowSpacingMain = (mainWidth - (windowsPerFloorMain * windowWidth)) / (windowsPerFloorMain + 1);
        for (let floor = 1; floor < numFloors; floor++) {
            for (let i = 0; i < windowsPerFloorMain; i++) {
                const xPos = -(recessWidth / 2) - mainWidth / 2 + windowSpacingMain * (i + 1) + windowWidth * (i + 0.5);
                const yPos = floor * floorHeight + floorHeight / 2;
                const zPos = mainDepth / 2 + windowDepth / 2;
                createWindow(xPos, yPos, zPos, 0);
            }
        }

        // Balcons/Fenêtres Larges + Muret (Bloc en Retrait)
        for (let floor = 1; floor < numFloors; floor++) {
            const floorBaseY = floor * floorHeight;
            const windowLowerOffset = 0.2;
            const balconyWindowYPos = floorBaseY + balconyWindowHeight / 2 + windowLowerOffset;
            const balconyWindowZPos = recessBlockMesh.position.z + recessDepth / 2 + balconyWindowDepth / 2;

            const balconyWindowMesh = new THREE.Mesh(balconyWindowGeo, balconyWindowMaterial);
            balconyWindowMesh.position.set(recessBlockMesh.position.x, balconyWindowYPos, balconyWindowZPos);
            buildingGroup.add(balconyWindowMesh);

            const balconyFrameMesh = new THREE.Mesh(balconyFrameGeo, frameMaterial);
            balconyFrameMesh.position.set(recessBlockMesh.position.x, balconyWindowYPos, balconyWindowZPos - (frameDepth - windowDepth) / 2 - 0.01);
            buildingGroup.add(balconyFrameMesh);

            const dividerMesh = new THREE.Mesh(dividerGeo, frameMaterial);
            dividerMesh.position.set(recessBlockMesh.position.x, balconyWindowYPos, balconyWindowZPos + windowDepth / 2 + 0.01);
            buildingGroup.add(dividerMesh);

            const balconyWallYPos = floorBaseY + balconyWallHeight / 2;
            const balconyWallZPos = frontRoofDepth / 2 - balconyWallThickness / 2;
            const balconyWallMesh = new THREE.Mesh(balconyWallGeo, balconyWallMaterial);
            balconyWallMesh.position.set(recessBlockMesh.position.x, balconyWallYPos, balconyWallZPos);
            buildingGroup.add(balconyWallMesh);

            // Ajouter les murs latéraux seulement si la profondeur est valide
            if (sideWallDepth > 0.01) {
                const sideWallCenterZ = recessBlockFrontZ + sideWallDepth / 2;
                const balconySideWallLeftMesh = new THREE.Mesh(balconySideWallGeo, balconyWallMaterial);
                balconySideWallLeftMesh.position.set(recessBlockMesh.position.x - recessWidth / 2 + balconyWallThickness / 2, balconyWallYPos, sideWallCenterZ);
                buildingGroup.add(balconySideWallLeftMesh);
                const balconySideWallRightMesh = new THREE.Mesh(balconySideWallGeo, balconyWallMaterial);
                balconySideWallRightMesh.position.set(recessBlockMesh.position.x + recessWidth / 2 - balconyWallThickness / 2, balconyWallYPos, sideWallCenterZ);
                buildingGroup.add(balconySideWallRightMesh);
            } else {
                 // console.warn("Skipping balcony side walls due to zero depth.");
            }
        }

        // Fenêtres Arrière
        const windowsPerFloorRear = 2;
        const windowSpacingRear = (rearBlockWidth - (windowsPerFloorRear * windowWidth)) / (windowsPerFloorRear + 1);
        for (let floor = 1; floor < rearBlockFloors; floor++) {
            for (let i = 0; i < windowsPerFloorRear; i++) {
                const xPos = rearBlockMesh.position.x - rearBlockWidth / 2 + windowSpacingRear * (i + 1) + windowWidth * (i + 0.5);
                const yPos = floor * floorHeight + floorHeight / 2;
                const zPos = rearBlockMesh.position.z - rearBlockDepth / 2 - windowDepth / 2;
                createWindow(xPos, yPos, zPos, Math.PI);
            }
        }

        // Fenêtres Gauche
        const windowsPerFloorLeft = 2;
        const windowSpacingLeft = (mainDepth - (windowsPerFloorLeft * windowWidth)) / (windowsPerFloorLeft + 1);
        for (let floor = 1; floor < numFloors; floor++) {
            for (let i = 0; i < windowsPerFloorLeft; i++) {
                const xPos = mainBlockMesh.position.x - mainWidth / 2 - windowDepth / 2;
                const yPos = floor * floorHeight + floorHeight / 2;
                const zPos = mainBlockMesh.position.z - mainDepth / 2 + windowSpacingLeft * (i + 1) + windowWidth * (i + 0.5);
                createWindow(xPos, yPos, zPos, -Math.PI / 2);
            }
        }

        // Fenêtres Droite (Bloc Arrière)
        const windowsPerFloorRightRear = 1;
        const windowSpacingRightRear = (rearBlockDepth - (windowsPerFloorRightRear * windowWidth)) / (windowsPerFloorRightRear + 1);
        for (let floor = 1; floor < rearBlockFloors; floor++) {
            for (let i = 0; i < windowsPerFloorRightRear; i++) {
                const xPos = rearBlockMesh.position.x + rearBlockWidth / 2 + windowDepth / 2;
                const yPos = floor * floorHeight + floorHeight / 2;
                const zPos = rearBlockMesh.position.z - rearBlockDepth / 2 + windowSpacingRightRear * (i + 1) + windowWidth * (i + 0.5);
                createWindow(xPos, yPos, zPos, Math.PI / 2);
            }
        }

        // --- Rez-de-chaussée ---
        const groundFloorY = floorHeight / 2;
        const doorWidthPlaceholder = 1;
        const pizzaWindowWidth = Math.max(0.1, recessWidth - doorWidthPlaceholder * 0.5); // Assurer largeur min
        const pizzaWindowHeight = 2.5;
        const pizzaWindowGeo = new THREE.BoxGeometry(pizzaWindowWidth, pizzaWindowHeight, 0.1);
        const pizzaWindowMesh = new THREE.Mesh(pizzaWindowGeo, windowMaterial);
        pizzaWindowMesh.position.set(mainWidth / 2 + recessWidth / 2 - pizzaWindowWidth / 2 - doorWidthPlaceholder * 0.25, groundFloorY, -(mainDepth - recessDepth) / 2 + recessDepth / 2 + 0.06);
        buildingGroup.add(pizzaWindowMesh);

        // Ajouter un marqueur bleu émissif devant la porte pour indiquer l'orientation
        const doorMarkerMaterial = new THREE.MeshBasicMaterial({
            color: 0x4dabf5,      // Bleu clair
            emissive: 0x4dabf5,   // Même couleur pour l'émissif
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8,
            name: "NewBuildingDoorMarkerMat"
        });
        const doorMarkerGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const doorMarker = new THREE.Mesh(doorMarkerGeo, doorMarkerMaterial);
        // Positionner devant la porte du rez-de-chaussée (légèrement à côté de la vitrine, près de doorWidthPlaceholder)
        doorMarker.position.set(
            mainWidth / 2 + recessWidth / 2 - pizzaWindowWidth - doorWidthPlaceholder / 2, 
            0.5, // Légèrement au-dessus du sol
            -(mainDepth - recessDepth) / 2 + recessDepth / 2 + 0.5 // Devant le bâtiment
        );
        buildingGroup.add(doorMarker);

        const downtownWindowWidth = mainWidth * 0.5;
        const downtownWindowHeight = 2.5;
        const downtownWindowGeo = new THREE.BoxGeometry(downtownWindowWidth, downtownWindowHeight, 0.1);
        const downtownWindowMesh = new THREE.Mesh(downtownWindowGeo, windowMaterial);
        downtownWindowMesh.position.set(-(recessWidth / 2) - mainWidth / 2 + downtownWindowWidth / 2 + windowSpacingMain, groundFloorY, mainDepth / 2 + 0.06);
        buildingGroup.add(downtownWindowMesh);

        // ----- Fin Création Géométries -----

        // ----- Regroupement par matériau pour l'asset final -----
        const allGeometries = []; // Pour calculer la BBox globale
        const materialMap = new Map();

        // Initialiser la map avec les matériaux utilisés
        Object.values(this.localMaterials).forEach(mat => {
            if (mat) {
                materialMap.set(mat.name, { material: mat, geoms: [] });
            }
        });

        // Ajouter le matériau du marqueur de porte
        materialMap.set("NewBuildingDoorMarkerMat", { material: doorMarkerMaterial, geoms: [] });

        buildingGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);
                allGeometries.push(clonedGeom);
                const matName = child.material.name;
                const groupData = materialMap.get(matName);
                if (groupData) {
                    groupData.geoms.push(clonedGeom);
                } else {
                    console.warn(`[NewBuilding Proc] Matériau non trouvé dans la map: ${matName || '[sans nom]'}. Géométrie ignorée.`);
                }
            }
        });

        if (allGeometries.length === 0) {
            console.error("[NewBuilding Proc] Aucune géométrie valide trouvée après parcours.");
            // Nettoyer géométries locales
             mainBlockGeo.dispose(); recessBlockGeo.dispose(); rearBlockGeo.dispose(); ventGeo.dispose();
             antennaGeo.dispose(); rearRoofGeo.dispose(); columnGeo.dispose(); frameGeo.dispose();
             windowGeo.dispose(); balconyFrameGeo.dispose(); balconyWindowGeo.dispose(); dividerGeo.dispose();
             balconyWallGeo.dispose(); balconySideWallGeo.dispose(); pizzaWindowGeo.dispose(); downtownWindowGeo.dispose();
             frontRoofGeo.dispose(); frontLedgeFrontGeo.dispose(); frontLedgeBackGeo.dispose(); frontLedgeLeftGeo.dispose();
             frontLedgeRightGeo.dispose(); frontBandGeo.dispose(); rearBandGeo.dispose(); doorMarkerGeo.dispose();
            return null;
        }

        // Fusion globale temporaire pour calculer la BBox
        const globalMerged = mergeGeometries(allGeometries, false);
        if (!globalMerged) {
            console.error("[NewBuilding Proc] Échec de la fusion globale pour BBox.");
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

            const mergedPartGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeom) {
                console.error(`[NewBuilding Proc] Échec de fusion du groupe "${matName}".`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }
            mergedPartGeom.translate(-globalCenter.x, -globalMinY, -globalCenter.z);
            parts.push({
                geometry: mergedPartGeom,
                material: groupData.material // Utiliser le matériau stocké
            });
            groupData.geoms.forEach(g => g.dispose());
        });

        allGeometries.forEach(g => g.dispose());
        // Nettoyer les géométries non clonées
        mainBlockGeo.dispose(); recessBlockGeo.dispose(); rearBlockGeo.dispose(); ventGeo.dispose();
        antennaGeo.dispose(); rearRoofGeo.dispose(); columnGeo.dispose(); frameGeo.dispose();
        windowGeo.dispose(); balconyFrameGeo.dispose(); balconyWindowGeo.dispose(); dividerGeo.dispose();
        balconyWallGeo.dispose(); balconySideWallGeo.dispose(); pizzaWindowGeo.dispose(); downtownWindowGeo.dispose();
        frontRoofGeo.dispose(); frontLedgeFrontGeo.dispose(); frontLedgeBackGeo.dispose(); frontLedgeLeftGeo.dispose();
        frontLedgeRightGeo.dispose(); frontBandGeo.dispose(); rearBandGeo.dispose(); doorMarkerGeo.dispose();


        const asset = {
            id: `building_newModel_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: adjustedBaseWidth / globalSize.x, // Utiliser l'échelle ajustée
            centerOffset: new THREE.Vector3(0, globalSize.y / 2, 0), // Centre à la base
            sizeAfterFitting: sizeAfterFitting
        };

        //console.log(`[NewBuilding Proc] Asset généré avec ${parts.length} parties. ID: ${asset.id}`);
        return asset;
    }

    destroy() {
        //console.log("Destroying NewBuildingRenderer...");
        Object.values(this.localMaterials).forEach(material => {
            material?.dispose();
        });
        this.localMaterials = {};
        //console.log("NewBuildingRenderer destroyed.");
    }
}