// src/World/Buildings/NewSkyscraperRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class NewSkyscraperRenderer {
    // ... (constructeur et autres méthodes inchangés) ...
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; // Main project materials
        this.assetIdCounter = 0; // Unique IDs for procedural assets

        // Création des textures procédurales avec paramètres spécifiques
        const wallTexture = this.createWallTexture();
        const roofTexture = this.createRoofTexture();
        
        // Créer une seconde texture identique pour les poutres avec paramètres ajustés
        const beamTexture = wallTexture.clone();
        beamTexture.needsUpdate = true;
        // Ajustement pour compenser l'étirement sur les poutres horizontales fines
        // wallTexture utilise maintenant (1.5, 1), donc il faut recalculer pour les poutres
        // Ratio des proportions : murs (12x3.5) vs poutres (12x0.5) = facteur 7 en hauteur
        beamTexture.repeat.set(3.5, 2 / 7); // Retour aux valeurs qui fonctionnaient bien pour les poutres

        // --- Define materials specific to this skyscraper ---
        // Adapt colors and textures as needed from your create...Texture functions or shared materials
        this.localMaterials = {
            structure: new THREE.MeshStandardMaterial({ 
                map: wallTexture,
                roughness: 0.7, 
                metalness: 0.2, 
                name: "NewSkyscraperStructureMat" 
            }),
            beam: new THREE.MeshStandardMaterial({ 
                map: beamTexture, // Utilise la texture ajustée pour les poutres
                roughness: 0.7, 
                metalness: 0.2, 
                name: "NewSkyscraperBeamMat" 
            }),
            // IMPORTANT: Separate window material for lighting updates
            window: new THREE.MeshStandardMaterial({
                // Base color can be slightly transparent glass-like
                color: new THREE.Color(0x64a0c8), // Example: Bluish grey
                roughness: 0.2,
                metalness: 0.1,
                transparent: true,
                opacity: 0.7, // Base opacity
                emissive: new THREE.Color(0xffff99), // Yellowish light when on
                emissiveIntensity: 0.0, // Start with lights off
                name: "NewSkyscraperWindowMat" // Unique name for InstancedMeshManager
            }),
            roof: new THREE.MeshStandardMaterial({ 
                map: roofTexture,
                color: 0x666666, 
                roughness: 0.8, 
                name: "NewSkyscraperRoofMat" 
            }),
            antenna: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide, name: "NewSkyscraperAntennaMat" }),
            door: new THREE.MeshStandardMaterial({ color: 0x582812, roughness: 0.8, name: "NewSkyscraperDoorMat" }),
            threshold: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperThresholdMat" }),
            floor: new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.8, name: "NewSkyscraperFloorMat" }),
            redLight: new THREE.MeshBasicMaterial({ color: 0xff0000, name: "NewSkyscraperRedLightMat" }), // Non-lit material
            trim: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperTrimMat" }),
            vent: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperVentMat" }),
            balconyWall: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperBalconyWallMat" }),
            frame: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperFrameMat" }),
            balconyWindow: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperBalconyWindowMat" })
        };

        //console.log("NewSkyscraperRenderer initialized.");
    }

    /**
     * Crée une texture procédurale pour les murs avec un motif de dalles
     * @returns {THREE.Texture}
     */
    createWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');

        // Fond gris moderne
        context.fillStyle = '#a8a8a8';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Paramètres pour les dalles
        const tileWidth = 128;  // Largeur d'une dalle
        const tileHeight = 64;  // Hauteur d'une dalle
        const jointWidth = 2;   // Épaisseur des joints

        // Couleurs pour les dalles
        const baseColor = { r: 168, g: 168, b: 168 };
        const darkJoint = '#888888';
        const lightHighlight = '#c0c0c0';

        // Dessiner les joints horizontaux
        context.fillStyle = darkJoint;
        for (let y = 0; y < canvas.height; y += tileHeight + jointWidth) {
            context.fillRect(0, y, canvas.width, jointWidth);
        }

        // Dessiner les joints verticaux avec décalage pour effet brique
        for (let y = 0; y < canvas.height; y += tileHeight + jointWidth) {
            const rowIndex = Math.floor(y / (tileHeight + jointWidth));
            const offset = (rowIndex % 2) * (tileWidth / 2);
            
            for (let x = -offset; x < canvas.width; x += tileWidth + jointWidth) {
                context.fillRect(x, y, jointWidth, tileHeight);
            }
        }

        // Remplir les dalles avec des variations de couleur
        for (let y = 0; y < canvas.height; y += tileHeight + jointWidth) {
            const rowIndex = Math.floor(y / (tileHeight + jointWidth));
            const offset = (rowIndex % 2) * (tileWidth / 2);
            
            for (let x = -offset; x < canvas.width; x += tileWidth + jointWidth) {
                if (x + tileWidth > 0 && x < canvas.width) {
                    // Variation de couleur pour chaque dalle
                    const variation = (Math.random() - 0.5) * 0.1;
                    const r = Math.max(0, Math.min(255, baseColor.r + variation * 255));
                    const g = Math.max(0, Math.min(255, baseColor.g + variation * 255));
                    const b = Math.max(0, Math.min(255, baseColor.b + variation * 255));
                    
                    context.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
                    context.fillRect(x + jointWidth, y + jointWidth, tileWidth, tileHeight);
                    
                    // Ajouter un léger highlight sur le bord supérieur gauche
                    context.fillStyle = lightHighlight;
                    context.fillRect(x + jointWidth, y + jointWidth, tileWidth, 1);
                    context.fillRect(x + jointWidth, y + jointWidth, 1, tileHeight);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Paramètres optimisés pour les murs verticaux - échelle augmentée et étirement horizontal
        texture.repeat.set(0.5, 1); // Diminution de X pour étirer horizontalement
        return texture;
    }

    /**
     * Crée une texture procédurale pour le toit avec un motif de dalles modernes
     * @returns {THREE.Texture}
     */
    createRoofTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');

        // Fond gris foncé pour le toit
        context.fillStyle = '#666666';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Paramètres pour les dalles de toit
        const tileSize = 64;      // Taille d'une dalle carrée
        const jointWidth = 2;     // Largeur des joints
        const pattern = tileSize + jointWidth;

        // Couleurs
        const baseColor = { r: 102, g: 102, b: 102 };
        const jointColor = '#555555';
        const highlightColor = '#777777';
        const shadowColor = '#4a4a4a';

        // Dessiner la grille de joints
        context.fillStyle = jointColor;
        
        // Joints horizontaux
        for (let y = 0; y < canvas.height; y += pattern) {
            context.fillRect(0, y, canvas.width, jointWidth);
        }
        
        // Joints verticaux
        for (let x = 0; x < canvas.width; x += pattern) {
            context.fillRect(x, 0, jointWidth, canvas.height);
        }

        // Remplir les dalles avec des variations
        for (let y = 0; y < canvas.height; y += pattern) {
            for (let x = 0; x < canvas.width; x += pattern) {
                // Variation de couleur pour chaque dalle
                const variation = (Math.random() - 0.5) * 0.15;
                const r = Math.max(0, Math.min(255, baseColor.r + variation * 100));
                const g = Math.max(0, Math.min(255, baseColor.g + variation * 100));
                const b = Math.max(0, Math.min(255, baseColor.b + variation * 100));
                
                context.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
                context.fillRect(x + jointWidth, y + jointWidth, tileSize, tileSize);
                
                // Ajouter un effet de relief avec highlight et ombre
                context.fillStyle = highlightColor;
                context.fillRect(x + jointWidth, y + jointWidth, tileSize, 1); // Ligne du haut
                context.fillRect(x + jointWidth, y + jointWidth, 1, tileSize); // Ligne de gauche
                
                context.fillStyle = shadowColor;
                context.fillRect(x + jointWidth, y + jointWidth + tileSize - 1, tileSize, 1); // Ligne du bas
                context.fillRect(x + jointWidth + tileSize - 1, y + jointWidth, 1, tileSize); // Ligne de droite
                
                // Ajouter quelques détails de texture à l'intérieur de certaines dalles
                if (Math.random() > 0.7) {
                    context.fillStyle = highlightColor;
                    const dotX = x + jointWidth + tileSize * 0.3 + Math.random() * tileSize * 0.4;
                    const dotY = y + jointWidth + tileSize * 0.3 + Math.random() * tileSize * 0.4;
                    context.fillRect(dotX, dotY, 2, 2);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2); // Répétition appropriée pour le toit
        return texture;
    }

    /**
	 * Generates the procedural asset data for this skyscraper.
	 * @param {number} baseWidth - Target width (used for scaling).
	 * @param {number} baseHeight - Target height (used for scaling). <<< CE PARAMETRE SERA MOINS UTILISE POUR LA HAUTEUR
	 * @param {number} baseDepth - Target depth (used for scaling).
	 * @param {number} [userScale=1] - User-defined scale factor.
	 * @param {number} [numFloors=9] - Number of floors (default 9).
	 * @returns {object|null} Asset data { id, parts, fittingScaleFactor, ... } or null.
	 */
	generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale = 1, numFloors = 9) {
		//console.log(`[NewSkyscraper Proc] Generating asset with ${numFloors} floors...`);
		const skyscraperGroup = new THREE.Group();

		// ----- Dimensions & Params (Copied & Adapted from HTML snippet) -----
		const globalScale = 1.2; // Facteur d'échelle global
		
		const mainWidth = 12 * globalScale; const mainDepth = 10 * globalScale;
		const floorHeight = 3.5 * globalScale;
		numFloors = (numFloors >= 7 && numFloors <= 11) ? numFloors : 9; // Valider
		const buildingHeight = floorHeight * numFloors;
		const pillarSize = 1.0 * globalScale; const horizontalBeamSize = 0.5 * globalScale;
		const numMullionsPerFacade = 3; const windowRecess = 0.1 * globalScale;
		const floorThickness = 0.1 * globalScale; const platformOverhang = 0.3 * globalScale;
		const topSectionRoofThickness = 0.8 * globalScale; const platformRaiseOffset = 0.1 * globalScale;
		const topSectionHeight = 5 * globalScale; const topSectionWidth = mainWidth * 0.7;
		const topSectionDepth = mainDepth * 0.7; const numMullionsTop = 2;
		const roofBaseWidth = topSectionWidth * 0.8; const roofBaseDepth = topSectionDepth * 0.8;
		const roofBaseHeight = 1 * globalScale; const poleHeight = 4 * globalScale; const poleRadius = 0.13 * globalScale;
		const dishRadius = 1.5 * globalScale; const redLightRadius = 0.15 * globalScale;
		const rearBlockFloors = numFloors - 1;
		const rearBlockHeight = floorHeight * rearBlockFloors;
		const rearBlockWidth = mainWidth;
		const rearBlockDepth = 6;
		const recessWidth = 5;
		const frontBuildingCenterX = (mainWidth / 2 + recessWidth / 2 - mainWidth / 2) / 2 - (recessWidth / 4);

		// *** CORRECTION ICI: Déclaration de roofOverhang ***
		const roofOverhang = 0.5;
		// *** FIN CORRECTION ***

		const frontRoofBaseWidth = mainWidth + recessWidth; const frontRoofWidth = frontRoofBaseWidth + roofOverhang * 2; // Utilisé ici
		const frontRoofBaseDepth = mainDepth; const frontRoofDepth = frontRoofBaseDepth + roofOverhang * 2; // Utilisé ici
		const windowWidth = 1.2; const windowHeight = 1.5; const windowDepth = 0.1;
		const frameThickness = 0.05; const frameDepth = 0.05;
		const balconyWindowWidth = recessWidth * 0.7; const balconyWindowHeight = windowHeight * 1.1;
		const balconyWindowDepth = windowDepth; const dividerWidth = frameThickness * 1.5;
		const balconyWallHeight = 0.6; const balconyWallThickness = 0.2; const balconyWallWidth = recessWidth;
		const antennaHeight = 2.5; const antennaRadius = 0.15;

		// ----- Materials -----
		const structureMaterial = this.localMaterials.structure;
		const horizontalBeamMaterial = this.localMaterials.beam;
		const windowMaterial = this.localMaterials.window;
		const roofMaterial = this.localMaterials.roof;
		const antennaMaterial = this.localMaterials.antenna;
		const doorMaterial = this.localMaterials.door;
		const thresholdMaterial = this.localMaterials.threshold;
		const floorMaterial = this.localMaterials.floor;
		const redLightMaterial = this.localMaterials.redLight;
		const ledgeMaterial = this.localMaterials.trim;
		const ventMaterial = this.localMaterials.vent;
		const balconyWallMaterial = this.localMaterials.balconyWall;
		const frameMaterial = this.localMaterials.frame;
		const balconyWindowMaterial = this.localMaterials.balconyWindow;

		// ----- Helper function to create floors -----
		const createFloor = (yPos, floorH, width, depth, numMullions, isGroundFloor = false, addFloorSurface = true) => {
			// ... (code interne de createFloor - reste identique à la version précédente) ...
			const floorGroup = new THREE.Group();
			const mullionSize = pillarSize;
			const numPanels = numMullions + 1;
			if (floorH <= 0) { return null; }
			const pillarGeo = new THREE.BoxGeometry(pillarSize, floorH, pillarSize);
			const pillarPositions = [ { x: width / 2 - pillarSize / 2, z: depth / 2 - pillarSize / 2 }, { x: -width / 2 + pillarSize / 2, z: depth / 2 - pillarSize / 2 }, { x: width / 2 - pillarSize / 2, z: -depth / 2 + pillarSize / 2 }, { x: -width / 2 + pillarSize / 2, z: -depth / 2 + pillarSize / 2 } ];
			pillarPositions.forEach(pos => { const pillar = new THREE.Mesh(pillarGeo, structureMaterial); pillar.position.set(pos.x, floorH / 2, pos.z); floorGroup.add(pillar); });
			const horizontalSectionLength = width - pillarSize; const verticalSectionLength = depth - pillarSize; const windowHeight = floorH - 2 * horizontalBeamSize;
			if (horizontalSectionLength <= 0 || verticalSectionLength <= 0) { pillarGeo.dispose(); floorGroup.position.y = yPos; skyscraperGroup.add(floorGroup); return floorGroup; }
			if (windowHeight <= 0) { /* avertissement */ }
			let windowPanelWidthFB = 0; if (numPanels > 0 && horizontalSectionLength > numMullions * mullionSize) { windowPanelWidthFB = (horizontalSectionLength - numMullions * mullionSize) / numPanels; } else if (numPanels > 0) { windowPanelWidthFB = 0.01; }
			const windowGeoFB = windowHeight > 0 ? new THREE.BoxGeometry(windowPanelWidthFB, windowHeight, pillarSize - windowRecess * 2) : null; const mullionGeoFB = windowHeight > 0 ? new THREE.BoxGeometry(mullionSize, windowHeight, pillarSize - windowRecess * 2) : null; const horizontalSectionGeo = new THREE.BoxGeometry(horizontalSectionLength, horizontalBeamSize, pillarSize);
			let doorPanelIndex = -1, doorPanelCount = 0, doorWidth = 0, doorHeight = 0, doorDepth = 0, doorXPos = 0, doorYPos = 0;
			if (isGroundFloor && numPanels > 0 && windowPanelWidthFB > 0 && windowHeight > 0) { 
				doorPanelCount = (numPanels % 2 === 0 && numPanels >= 2) ? 2 : 1; 
				doorPanelIndex = Math.floor(numPanels / 2) - (doorPanelCount === 2 ? 1 : 0); 
				doorWidth = doorPanelCount * windowPanelWidthFB + (doorPanelCount - 1) * mullionSize; 
				// Correction: La porte doit remplir tout l'espace entre le seuil et la poutre du haut
				// Le seuil fait horizontalBeamSize * 0.5 de hauteur, donc la porte commence à cette hauteur
				const thresholdHeight = horizontalBeamSize * 0.5;
				const availableSpaceBottom = thresholdHeight; // Base de la porte = sommet du seuil
				const availableSpaceTop = floorH - horizontalBeamSize; // Haut de la porte = bas de la poutre supérieure
				doorHeight = availableSpaceTop - availableSpaceBottom; // Hauteur complète de l'espace disponible
				doorDepth = pillarSize - windowRecess * 2; 
				doorYPos = availableSpaceBottom + doorHeight / 2; // Centre de la porte dans l'espace disponible
				let startXForDoor = -horizontalSectionLength / 2; 
				for (let i = 0; i < doorPanelIndex; i++) { 
					startXForDoor += windowPanelWidthFB; 
					if (i < numMullions) { 
						startXForDoor += mullionSize; 
					} 
				} 
				doorXPos = startXForDoor + doorWidth / 2; 
			}
			[-1, 1].forEach(sideZ => { const zPos = (depth / 2 - pillarSize / 2) * sideZ; const zPosWindow = zPos - windowRecess * sideZ; const isFrontFace = sideZ === 1;
				if (isGroundFloor && isFrontFace && doorWidth > 0 && doorHeight > 0) { const sectionWidthLeft = doorXPos - doorWidth / 2 - (-horizontalSectionLength / 2); const sectionWidthRight = (horizontalSectionLength / 2) - (doorXPos + doorWidth / 2); if (sectionWidthLeft > 0.01) { const leftSectionGeo = new THREE.BoxGeometry(sectionWidthLeft, horizontalBeamSize, pillarSize); const leftSection = new THREE.Mesh(leftSectionGeo, horizontalBeamMaterial); leftSection.position.set((-horizontalSectionLength / 2 + sectionWidthLeft / 2), horizontalBeamSize / 2, zPos); floorGroup.add(leftSection); leftSectionGeo.dispose(); } if (sectionWidthRight > 0.01) { const rightSectionGeo = new THREE.BoxGeometry(sectionWidthRight, horizontalBeamSize, pillarSize); const rightSection = new THREE.Mesh(rightSectionGeo, horizontalBeamMaterial); rightSection.position.set((horizontalSectionLength / 2 - sectionWidthRight / 2), horizontalBeamSize / 2, zPos); floorGroup.add(rightSection); rightSectionGeo.dispose(); } const thresholdGeo = new THREE.BoxGeometry(doorWidth, horizontalBeamSize * 0.5, pillarSize); const thresholdMesh = new THREE.Mesh(thresholdGeo, thresholdMaterial); thresholdMesh.position.set(doorXPos, horizontalBeamSize * 0.25, zPos); floorGroup.add(thresholdMesh); thresholdGeo.dispose(); } else { const bottomSection = new THREE.Mesh(horizontalSectionGeo, horizontalBeamMaterial); bottomSection.position.set(0, horizontalBeamSize / 2, zPos); floorGroup.add(bottomSection); }
				const topSection = new THREE.Mesh(horizontalSectionGeo, horizontalBeamMaterial); topSection.position.set(0, floorH - horizontalBeamSize / 2, zPos); floorGroup.add(topSection);
				if (windowGeoFB && mullionGeoFB && windowPanelWidthFB > 0) { let currentX = -horizontalSectionLength / 2; const windowBaseY = horizontalBeamSize; const windowCenterY = windowBaseY + windowHeight / 2; for (let i = 0; i < numPanels; i++) { const isDoorPanel = isGroundFloor && isFrontFace && i >= doorPanelIndex && i < doorPanelIndex + doorPanelCount && doorWidth > 0 && doorHeight > 0; const isFirstDoorPanel = isDoorPanel && i === doorPanelIndex; const isMiddleDoorMullionToSkip = (doorPanelCount === 2) && i === doorPanelIndex; if (isDoorPanel) { if (isFirstDoorPanel) { const doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth); const doorMesh = new THREE.Mesh(doorGeo, doorMaterial); doorMesh.position.set(doorXPos, doorYPos, zPosWindow); floorGroup.add(doorMesh); doorGeo.dispose(); 
					
					// Bande verticale au milieu de la porte
					const dividerWidth = frameThickness * 2;
					const dividerGeo = new THREE.BoxGeometry(dividerWidth, doorHeight, frameDepth);
					const divider = new THREE.Mesh(dividerGeo, frameMaterial);
					divider.position.set(doorXPos, doorYPos, zPosWindow + doorDepth / 2 + frameDepth / 2);
					floorGroup.add(divider);
					dividerGeo.dispose();
					
					// Ajouter un marqueur bleu émissif devant la porte pour indiquer l'orientation
					// Seulement pour la porte principale au rez-de-chaussée
					/*if (isGroundFloor && isFrontFace) {
						const doorMarkerMaterial = new THREE.MeshBasicMaterial({
							color: 0x4dabf5,      // Bleu clair
							emissive: 0x4dabf5,   // Même couleur pour l'émissif
							emissiveIntensity: 0.8,
							transparent: true,
							opacity: 0.8,
							name: "NewSkyscraperDoorMarkerMat"
						});
						const doorMarkerGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
						const doorMarker = new THREE.Mesh(doorMarkerGeo, doorMarkerMaterial);
						// Positionner devant la porte principale, légèrement au-dessus du sol
						doorMarker.position.set(doorXPos, 0.5, zPosWindow + doorDepth + 0.5);
						floorGroup.add(doorMarker);
						doorMarkerGeo.dispose();
					}*/
					} currentX += windowPanelWidthFB; } else { const windowX = currentX + windowPanelWidthFB / 2; const windowMesh = new THREE.Mesh(windowGeoFB, windowMaterial); windowMesh.position.set(windowX, windowCenterY, zPosWindow); floorGroup.add(windowMesh); currentX += windowPanelWidthFB; } if (i < numMullions && !isMiddleDoorMullionToSkip) { const mullionX = currentX + mullionSize / 2; const mullionMesh = new THREE.Mesh(mullionGeoFB, structureMaterial); mullionMesh.position.set(mullionX, windowCenterY, zPosWindow); floorGroup.add(mullionMesh); currentX += mullionSize; } else if (i < numMullions) { currentX += mullionSize; } } }
			}); if(windowGeoFB) windowGeoFB.dispose(); if(mullionGeoFB) mullionGeoFB.dispose(); horizontalSectionGeo.dispose();
			let windowPanelWidthLR = 0; if (numPanels > 0 && verticalSectionLength > numMullions * mullionSize) { windowPanelWidthLR = (verticalSectionLength - numMullions * mullionSize) / numPanels; } else if (numPanels > 0) { windowPanelWidthLR = 0.01; } const windowGeoLR = windowHeight > 0 ? new THREE.BoxGeometry(pillarSize - windowRecess * 2, windowHeight, windowPanelWidthLR) : null; const mullionGeoLR = windowHeight > 0 ? new THREE.BoxGeometry(pillarSize - windowRecess * 2, windowHeight, mullionSize) : null; const verticalSectionGeo = new THREE.BoxGeometry(pillarSize, horizontalBeamSize, verticalSectionLength);
			[-1, 1].forEach(sideX => { const xPos = (width / 2 - pillarSize / 2) * sideX; const xPosWindow = xPos - windowRecess * sideX; const bottomSectionVert = new THREE.Mesh(verticalSectionGeo, horizontalBeamMaterial); bottomSectionVert.position.set(xPos, horizontalBeamSize / 2, 0); floorGroup.add(bottomSectionVert); const topSectionVert = new THREE.Mesh(verticalSectionGeo, horizontalBeamMaterial); topSectionVert.position.set(xPos, floorH - horizontalBeamSize / 2, 0); floorGroup.add(topSectionVert); if (windowGeoLR && mullionGeoLR && windowPanelWidthLR > 0) { let currentZ = -verticalSectionLength / 2; const windowBaseY = horizontalBeamSize; const windowCenterY = windowBaseY + windowHeight / 2; for (let i = 0; i < numPanels; i++) { const windowZ = currentZ + windowPanelWidthLR / 2; const windowMesh = new THREE.Mesh(windowGeoLR, windowMaterial); windowMesh.position.set(xPosWindow, windowCenterY, windowZ); floorGroup.add(windowMesh); currentZ += windowPanelWidthLR; if (i < numMullions) { const mullionZ = currentZ + mullionSize / 2; const mullionMesh = new THREE.Mesh(mullionGeoLR, structureMaterial); mullionMesh.position.set(xPosWindow, windowCenterY, mullionZ); floorGroup.add(mullionMesh); currentZ += mullionSize; } } } });
			if(windowGeoLR) windowGeoLR.dispose(); if(mullionGeoLR) mullionGeoLR.dispose(); verticalSectionGeo.dispose();
			if (addFloorSurface && horizontalSectionLength > 0 && verticalSectionLength > 0) { const floorGeo = new THREE.BoxGeometry(horizontalSectionLength, floorThickness, verticalSectionLength); const floorMesh = new THREE.Mesh(floorGeo, floorMaterial); floorMesh.position.y = horizontalBeamSize + floorThickness / 2; floorGroup.add(floorMesh); floorGeo.dispose(); }
			floorGroup.position.y = yPos; skyscraperGroup.add(floorGroup); pillarGeo.dispose(); return floorGroup;
		};

		// --- Create Floors ---
		for (let floor = 0; floor < numFloors; floor++) {
			createFloor(floor * floorHeight, floorHeight, mainWidth, mainDepth, numMullionsPerFacade, floor === 0, true);
		}

		// --- Top Floor Platform ---
		const topFloorY = numFloors * floorHeight;
		const topPlatformWidth = mainWidth + 2 * platformOverhang;
		const topPlatformDepth = mainDepth + 2 * platformOverhang;
		const topFloorGeo = new THREE.BoxGeometry(topPlatformWidth, horizontalBeamSize, topPlatformDepth);
		const topFloorMesh = new THREE.Mesh(topFloorGeo, horizontalBeamMaterial);
		topFloorMesh.position.y = topFloorY - horizontalBeamSize / 2 + platformRaiseOffset;
		skyscraperGroup.add(topFloorMesh);
		topFloorGeo.dispose();

		// --- Top Section ---
		const topSectionY = topFloorY + platformRaiseOffset;
		createFloor(topSectionY, topSectionHeight, topSectionWidth, topSectionDepth, numMullionsTop, false, true);

		// --- Top Section Roof Platform ---
		const topSectionRoofY = topSectionY + topSectionHeight;
		const topSectionPlatformWidth = topSectionWidth + 2 * platformOverhang; // Utilise platformOverhang
		const topSectionPlatformDepth = topSectionDepth + 2 * platformOverhang; // Utilise platformOverhang
		const topSectionRoofGeo = new THREE.BoxGeometry(topSectionPlatformWidth, topSectionRoofThickness, topSectionPlatformDepth);
		const topSectionRoofMesh = new THREE.Mesh(topSectionRoofGeo, roofMaterial);
		topSectionRoofMesh.position.y = topSectionRoofY - topSectionRoofThickness / 2 + platformRaiseOffset;
		skyscraperGroup.add(topSectionRoofMesh);
		topSectionRoofGeo.dispose();

		// --- Final Roof Base ---
		const roofBaseY = topSectionRoofY + platformRaiseOffset;
		const roofBaseGeo = new THREE.BoxGeometry(roofBaseWidth, roofBaseHeight, roofBaseDepth);
		const roofBase = new THREE.Mesh(roofBaseGeo, roofMaterial);
		roofBase.position.y = roofBaseY + roofBaseHeight / 2;
		skyscraperGroup.add(roofBase);
		roofBaseGeo.dispose();

		// --- Antenna/Pole ---
		const poleBaseY = roofBaseY + roofBaseHeight;
		const poleTopY = poleBaseY + poleHeight;
		const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 4);
		const pole = new THREE.Mesh(poleGeo, antennaMaterial);
		pole.position.y = poleBaseY + poleHeight / 2;
		skyscraperGroup.add(pole);
		poleGeo.dispose();

		// --- Dish ---
		const dishGeo = new THREE.SphereGeometry(dishRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3);
		const dish = new THREE.Mesh(dishGeo, antennaMaterial);
		dish.position.y = roofBaseY + roofBaseHeight + 1.7;
		dish.position.x = roofBaseWidth / 3;
		dish.rotation.x = Math.PI / 5;
		dish.rotation.z = -Math.PI;
		skyscraperGroup.add(dish);
		dishGeo.dispose();

		// --- Red Light ---
		const redLightGeo = new THREE.SphereGeometry(redLightRadius, 8, 8);
		const redLightMesh = new THREE.Mesh(redLightGeo, redLightMaterial);
		redLightMesh.position.y = poleTopY + redLightRadius;
		skyscraperGroup.add(redLightMesh);
		redLightGeo.dispose();

		// ----- Final Asset Preparation -----
		const allGeoms = [];
		const materialMap = new Map();
		Object.values(this.localMaterials).forEach(mat => { if (mat) { materialMap.set(mat.name, { material: mat.clone(), geoms: [] }); } });
		
		// Ajouter le matériau du marqueur de porte (créé spécifiquement pour ce bâtiment)
		/*materialMap.set("NewSkyscraperDoorMarkerMat", { 
			material: new THREE.MeshBasicMaterial({
				color: 0x4dabf5,      // Bleu clair
				emissive: 0x4dabf5,   // Même couleur pour l'émissif
				emissiveIntensity: 0.8,
				transparent: true,
				opacity: 0.8,
				name: "NewSkyscraperDoorMarkerMat"
			}),
			geoms: [] 
		});*/

		skyscraperGroup.traverse((child) => {
			if (child.isMesh && child.geometry && child.material) {
				child.updateMatrixWorld(true);
				const clonedGeom = child.geometry.clone();
				clonedGeom.applyMatrix4(child.matrixWorld);
				allGeoms.push(clonedGeom);
				const matName = child.material.name;
				const groupData = materialMap.get(matName);
				if (groupData) { groupData.geoms.push(clonedGeom); }
				else { console.warn(`[NewSkyscraper Proc] Material not in map: ${matName}`); }
			} else if (child.isGroup && child !== skyscraperGroup) {
				child.updateMatrixWorld(true);
				child.children.forEach(floorChild => {
					if (floorChild.isMesh && floorChild.geometry && floorChild.material) {
						floorChild.updateMatrixWorld(true);
						const clonedGeom = floorChild.geometry.clone();
						clonedGeom.applyMatrix4(floorChild.matrixWorld);
						allGeoms.push(clonedGeom);
						const matName = floorChild.material.name;
						const groupData = materialMap.get(matName);
						if (groupData) { groupData.geoms.push(clonedGeom); }
						else { console.warn(`[NewSkyscraper Proc] Floor child material not in map: ${matName}`); }
					}
				});
			}
		});

		if (allGeoms.length === 0) { /* ... gestion erreur ... */ return null; }
		const globalMerged = mergeGeometries(allGeoms, false);
		if (!globalMerged) { /* ... gestion erreur ... */ allGeoms.forEach(g => g.dispose()); return null; }

		globalMerged.computeBoundingBox();
		const globalBBox = globalMerged.boundingBox;
		const globalMin = globalBBox.min.clone();
		const globalCenterOriginal = new THREE.Vector3();
		globalBBox.getCenter(globalCenterOriginal);
		const globalSize = new THREE.Vector3();
		globalBBox.getSize(globalSize);
		globalMerged.dispose();

		globalSize.x = Math.max(globalSize.x, 0.001); globalSize.y = Math.max(globalSize.y, 0.001); globalSize.z = Math.max(globalSize.z, 0.001);

		const finalCalculatedHeight = globalSize.y;
		const targetHeightForScaling = (numFloors * floorHeight) + topSectionHeight + topSectionRoofThickness + roofBaseHeight + poleHeight + redLightRadius*2 + platformRaiseOffset*2;
		const fittingScaleFactor = Math.min( baseWidth / globalSize.x, targetHeightForScaling / finalCalculatedHeight, baseDepth / globalSize.z );
		const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

		const parts = [];
		materialMap.forEach((groupData, matName) => {
			if (groupData.geoms.length === 0) return;
			const mergedPartGeom = mergeGeometries(groupData.geoms, false);
			if (!mergedPartGeom) { groupData.geoms.forEach(g => g.dispose()); return; }
			mergedPartGeom.translate(-globalCenterOriginal.x, -globalMin.y, -globalCenterOriginal.z);
			parts.push({ geometry: mergedPartGeom, material: groupData.material });
			groupData.geoms.forEach(g => g.dispose());
		});
		allGeoms.forEach(g => g.dispose());

		const finalCenterOffsetY = globalCenterOriginal.y - globalMin.y;
		const finalCenterOffset = new THREE.Vector3(0, finalCenterOffsetY, 0);

		const asset = {
			id: `skyscraper_newModel_${numFloors}fl_${this.assetIdCounter++}`,
			parts: parts,
			fittingScaleFactor: fittingScaleFactor,
			userScale: userScale,
			centerOffset: finalCenterOffset,
			sizeAfterFitting: sizeAfterFitting,
			numFloors: numFloors
		};

		//console.log(`[NewSkyscraper Proc] Asset '${asset.id}' generated with ${numFloors} floors.`);
		return asset;
	} // Fin generateProceduralSkyscraper

    // ... (destroy et generateSkyscraperInstance inchangés) ...
     /**
      * Cleans up resources used by the renderer.
      */
     destroy() {
		//console.log("Destroying NewSkyscraperRenderer resources...");
		Object.values(this.localMaterials).forEach(material => {
			 material?.dispose();
		 });
		this.localMaterials = {};
		 //console.log("NewSkyscraperRenderer destroyed.");
	}

    /**
     * Génère la matrice d'instance pour un gratte-ciel en fonction des paramètres fournis.
     * (Cette méthode est probablement appelée par SkyscraperPlacementStrategy)
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer le gratte-ciel.
     * @param {number} groundLevel - Position Y du sol (plotGroundY).
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle global pour ce type de bâtiment.
     * @param {object} assetInfo - Objet contenant les données de l'asset généré { id, parts, fittingScaleFactor, userScale, centerOffset, sizeAfterFitting }.
     * @returns {object|null} Un objet où les clés sont les noms de matériaux et les valeurs sont des tableaux contenant UNE matrice pour cette instance, ou null.
     */
    generateSkyscraperInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor, assetInfo) {
		if (!assetInfo || !assetInfo.fittingScaleFactor || !assetInfo.sizeAfterFitting || !assetInfo.centerOffset) {
			console.error("[NewSkyscraper Instance] assetInfo invalide ou incomplet.", assetInfo);
			return null;
		}
	
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
		const finalY = finalHeight / 2 + groundLevel;
		const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);
	
		instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
		instanceMatrix.premultiply(rotationMatrix);
		instanceMatrix.premultiply(translationMatrix);
	
		const skyscraperInstanceData = {};
		assetInfo.parts.forEach((part, index) => {
			const partKey = `part${index}`;
			const instanceKey = `${assetInfo.id}_${partKey}`;
			skyscraperInstanceData[instanceKey] = [instanceMatrix.clone()];
		});
	
		if (!assetInfo.parts || assetInfo.parts.length === 0) {
			 skyscraperInstanceData[assetInfo.id] = [instanceMatrix.clone()];
		}
	
		return skyscraperInstanceData;
	}
}