// src/World/Buildings/NewSkyscraperRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class NewSkyscraperRenderer {
    // ... (constructeur et autres méthodes inchangés) ...
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; // Main project materials
        this.assetIdCounter = 0; // Unique IDs for procedural assets

        // --- Define materials specific to this skyscraper ---
        // Adapt colors and textures as needed from your create...Texture functions or shared materials
        this.localMaterials = {
            structure: new THREE.MeshStandardMaterial({ color: 0x4a6f8e, roughness: 0.7, metalness: 0.2, name: "NewSkyscraperStructureMat" }),
            beam: new THREE.MeshStandardMaterial({ color: 0x4a6f8e, roughness: 0.7, metalness: 0.2, name: "NewSkyscraperBeamMat" }),
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
            roof: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, name: "NewSkyscraperRoofMat" }),
            antenna: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6, side: THREE.DoubleSide, name: "NewSkyscraperAntennaMat" }),
            door: new THREE.MeshStandardMaterial({ color: 0xA0522D, roughness: 0.8, name: "NewSkyscraperDoorMat" }),
            threshold: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, name: "NewSkyscraperThresholdMat" }),
            floor: new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.8, name: "NewSkyscraperFloorMat" }),
            redLight: new THREE.MeshBasicMaterial({ color: 0xff0000, name: "NewSkyscraperRedLightMat" }) // Non-lit material
        };
        console.log("NewSkyscraperRenderer initialized.");
    }

    /**
     * Generates the procedural asset data for this skyscraper.
     * @param {number} baseWidth - Target width (used for scaling).
     * @param {number} baseHeight - Target height (used for scaling).
     * @param {number} baseDepth - Target depth (used for scaling).
     * @param {number} [userScale=1] - User-defined scale factor.
     * @returns {object|null} Asset data { id, parts, fittingScaleFactor, ... } or null.
     */
    generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale = 1) {
        console.log("[NewSkyscraper Proc] Generating asset...");
        const skyscraperGroup = new THREE.Group(); // Temporary group for assembly

        // ----- Dimensions & Params (Copied & Adapted from HTML snippet) -----
        // const Z_FIGHT_OFFSET = 0.01; // Potentiellement non nécessaire si les géométries sont bien séparées
        const mainWidth = 12; const mainDepth = 10; const mainHeight = 25;
        const floorHeight = 3.5; const numFloors = Math.floor(mainHeight / floorHeight);
        const pillarSize = 1.0; const horizontalBeamSize = 0.5;
        const numMullionsPerFacade = 3; const windowRecess = 0.1;
        const floorThickness = 0.1; const platformOverhang = 0.3;
        const topSectionRoofThickness = 0.8; const platformRaiseOffset = 0.1;
        const topSectionHeight = 5; const topSectionWidth = mainWidth * 0.7;
        const topSectionDepth = mainDepth * 0.7; const numMullionsTop = 2;
        const roofBaseWidth = topSectionWidth * 0.8; const roofBaseDepth = topSectionDepth * 0.8;
        const roofBaseHeight = 1; const poleHeight = 4; const poleRadius = 0.2;
        const dishRadius = 1.5; const redLightRadius = 0.3;

        // ----- Materials -----
        const structureMaterial = this.localMaterials.structure;
        const horizontalBeamMaterial = this.localMaterials.beam;
        const windowMaterial = this.localMaterials.window; // USE THE SPECIFIC WINDOW MATERIAL
        const roofMaterial = this.localMaterials.roof;
        const antennaMaterial = this.localMaterials.antenna;
        const doorMaterial = this.localMaterials.door;
        const thresholdMaterial = this.localMaterials.threshold;
        const floorMaterial = this.localMaterials.floor;
        const redLightMaterial = this.localMaterials.redLight;


        // ----- Helper function to create floors (Adapted from HTML) -----
        const createFloor = (yPos, floorH, width, depth, numMullions, isGroundFloor = false, addFloorSurface = true) => {
            const floorGroup = new THREE.Group(); // Group for this specific floor
            const mullionSize = pillarSize;
            const numPanels = numMullions + 1;

            // --- Vérification hauteur négative ---
            if (floorH <= 0) {
                console.warn(`[NewSkyscraper Proc] Hauteur d'étage invalide (${floorH}) à Y=${yPos}. Étage ignoré.`);
                return null; // Ne pas créer cet étage
            }

            // --- Pillars ---
            const pillarGeo = new THREE.BoxGeometry(pillarSize, floorH, pillarSize);
            const pillarPositions = [
                { x: width / 2 - pillarSize / 2, z: depth / 2 - pillarSize / 2 },
                { x: -width / 2 + pillarSize / 2, z: depth / 2 - pillarSize / 2 },
                { x: width / 2 - pillarSize / 2, z: -depth / 2 + pillarSize / 2 },
                { x: -width / 2 + pillarSize / 2, z: -depth / 2 + pillarSize / 2 }
            ];
            pillarPositions.forEach(pos => {
                const pillar = new THREE.Mesh(pillarGeo, structureMaterial);
                // Le centre Y de la géométrie est à 0, donc le centre du mesh est à floorH/2
                pillar.position.set(pos.x, floorH / 2, pos.z);
                floorGroup.add(pillar);
            });

            // --- Dimensions ---
            const horizontalSectionLength = width - pillarSize;
            const verticalSectionLength = depth - pillarSize;
            const windowHeight = floorH - 2 * horizontalBeamSize - floorThickness;

            // --- Vérifications de dimensions avant de créer les géométries ---
            if (horizontalSectionLength <= 0 || verticalSectionLength <= 0) {
                 console.warn(`[NewSkyscraper Proc] Dimensions internes négatives ou nulles (H:${horizontalSectionLength.toFixed(2)}, V:${verticalSectionLength.toFixed(2)}) à Y=${yPos}. Éléments de façade ignorés.`);
                 // On ajoute quand même le groupe (avec les piliers) pour maintenir la structure
                 floorGroup.position.y = yPos;
                 skyscraperGroup.add(floorGroup);
                 return floorGroup;
            }
            if (windowHeight <= 0) {
                 console.warn(`[NewSkyscraper Proc] Hauteur de fenêtre négative ou nulle (${windowHeight.toFixed(2)}) à Y=${yPos}. Fenêtres/Meneaux ignorés.`);
                 // Continuer pour créer les poutres horizontales/verticales et le sol
                 // return floorGroup; // commenter pour que les poutres soient ajoutées
            }


            // --- Front/Back Facades ---
            let windowPanelWidthFB = 0;
            if (numPanels > 0 && horizontalSectionLength > numMullions * mullionSize) {
                 windowPanelWidthFB = (horizontalSectionLength - numMullions * mullionSize) / numPanels;
            } else if (numPanels > 0) { windowPanelWidthFB = 0.01; /* fallback */ }

            // Géométries (créées seulement si windowHeight > 0)
            const windowGeoFB = windowHeight > 0 ? new THREE.BoxGeometry(windowPanelWidthFB, windowHeight, pillarSize - windowRecess * 2) : null;
            const mullionGeoFB = windowHeight > 0 ? new THREE.BoxGeometry(mullionSize, windowHeight, pillarSize - windowRecess * 2) : null;
            const horizontalSectionGeo = new THREE.BoxGeometry(horizontalSectionLength, horizontalBeamSize, pillarSize);


            let doorPanelIndex = -1, doorPanelCount = 0, doorWidth = 0, doorHeight = 0, doorDepth = 0, doorXPos = 0, doorYPos = 0;
            if (isGroundFloor && numPanels > 0 && windowPanelWidthFB > 0 && windowHeight > 0) { // S'assurer windowHeight > 0
                doorPanelCount = (numPanels % 2 === 0 && numPanels >= 2) ? 2 : 1;
                doorPanelIndex = Math.floor(numPanels / 2) - (doorPanelCount === 2 ? 1 : 0);
                doorWidth = doorPanelCount * windowPanelWidthFB + (doorPanelCount - 1) * mullionSize;
                doorHeight = (floorH - horizontalBeamSize - floorThickness) * 0.8;
                doorDepth = pillarSize - windowRecess * 2;
                doorYPos = horizontalBeamSize + floorThickness + doorHeight / 2;
                let startXForDoor = -horizontalSectionLength / 2;
                for (let i = 0; i < doorPanelIndex; i++) { startXForDoor += windowPanelWidthFB; if (i < numMullions) { startXForDoor += mullionSize; } }
                doorXPos = startXForDoor + doorWidth / 2;
            }

            [-1, 1].forEach(sideZ => {
                const zPos = (depth / 2 - pillarSize / 2) * sideZ;
                const zPosWindow = zPos - windowRecess * sideZ;
                const isFrontFace = sideZ === 1;

                // --- Poutres horizontales ---
                if (isGroundFloor && isFrontFace && doorWidth > 0 && doorHeight > 0) {
                    // Logique pour poutre basse coupée par la porte
                    const sectionWidthLeft = doorXPos - doorWidth / 2 - (-horizontalSectionLength / 2);
                    const sectionWidthRight = (horizontalSectionLength / 2) - (doorXPos + doorWidth / 2);
                    if (sectionWidthLeft > 0.01) {
                        const leftSectionGeo = new THREE.BoxGeometry(sectionWidthLeft, horizontalBeamSize, pillarSize);
                        const leftSection = new THREE.Mesh(leftSectionGeo, horizontalBeamMaterial);
                        leftSection.position.set((-horizontalSectionLength / 2 + sectionWidthLeft / 2), horizontalBeamSize / 2, zPos);
                        floorGroup.add(leftSection);
                        leftSectionGeo.dispose(); // Dispose geometry after use
                    }
                    if (sectionWidthRight > 0.01) {
                        const rightSectionGeo = new THREE.BoxGeometry(sectionWidthRight, horizontalBeamSize, pillarSize);
                        const rightSection = new THREE.Mesh(rightSectionGeo, horizontalBeamMaterial);
                        rightSection.position.set((horizontalSectionLength / 2 - sectionWidthRight / 2), horizontalBeamSize / 2, zPos);
                        floorGroup.add(rightSection);
                        rightSectionGeo.dispose(); // Dispose geometry after use
                    }
                    const thresholdGeo = new THREE.BoxGeometry(doorWidth, horizontalBeamSize * 0.5, pillarSize);
                    const thresholdMesh = new THREE.Mesh(thresholdGeo, thresholdMaterial);
                    thresholdMesh.position.set(doorXPos, horizontalBeamSize * 0.25, zPos);
                    floorGroup.add(thresholdMesh);
                    thresholdGeo.dispose();
                } else {
                    // Poutre basse complète
                    const bottomSection = new THREE.Mesh(horizontalSectionGeo, horizontalBeamMaterial);
                    bottomSection.position.set(0, horizontalBeamSize / 2, zPos);
                    floorGroup.add(bottomSection);
                }
                // Poutre haute (toujours complète)
                const topSection = new THREE.Mesh(horizontalSectionGeo, horizontalBeamMaterial);
                topSection.position.set(0, floorH - horizontalBeamSize / 2, zPos);
                floorGroup.add(topSection);
                // --- Fin poutres horizontales ---

                // --- Fenêtres, Porte, Meneaux (seulement si windowHeight > 0) ---
                if (windowGeoFB && mullionGeoFB && windowPanelWidthFB > 0) {
                    let currentX = -horizontalSectionLength / 2;
                    const windowBaseY = horizontalBeamSize + floorThickness;
                    const windowCenterY = windowBaseY + windowHeight / 2;
                    for (let i = 0; i < numPanels; i++) {
                        const isDoorPanel = isGroundFloor && isFrontFace && i >= doorPanelIndex && i < doorPanelIndex + doorPanelCount && doorWidth > 0 && doorHeight > 0;
                        const isFirstDoorPanel = isDoorPanel && i === doorPanelIndex;
                        const isMiddleDoorMullionToSkip = (doorPanelCount === 2) && i === doorPanelIndex;

                        if (isDoorPanel) {
                            if (isFirstDoorPanel) {
                                const doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
                                const doorMesh = new THREE.Mesh(doorGeo, doorMaterial);
                                doorMesh.position.set(doorXPos, doorYPos, zPosWindow);
                                floorGroup.add(doorMesh);
                                doorGeo.dispose(); // Dispose geometry
                            }
                            currentX += windowPanelWidthFB;
                        } else {
                            // Ajouter la fenêtre
                            const windowX = currentX + windowPanelWidthFB / 2;
                            const windowMesh = new THREE.Mesh(windowGeoFB, windowMaterial);
                            windowMesh.position.set(windowX, windowCenterY, zPosWindow);
                            floorGroup.add(windowMesh);
                            currentX += windowPanelWidthFB;
                        }
                        // Ajouter le meneau (si ce n'est pas celui au milieu d'une double porte)
                        if (i < numMullions && !isMiddleDoorMullionToSkip) {
                             const mullionX = currentX + mullionSize / 2;
                             const mullionMesh = new THREE.Mesh(mullionGeoFB, structureMaterial);
                             mullionMesh.position.set(mullionX, windowCenterY, zPosWindow);
                             floorGroup.add(mullionMesh);
                             currentX += mullionSize;
                        } else if (i < numMullions) {
                             currentX += mullionSize; // Sauter l'espace du meneau même si on ne le dessine pas
                        }
                    }
                }
                 // --- Fin Fenêtres/Porte/Meneaux ---
            });
            // Disposer les géométries temporaires FB après la boucle
            if(windowGeoFB) windowGeoFB.dispose();
            if(mullionGeoFB) mullionGeoFB.dispose();
            if(horizontalSectionGeo) horizontalSectionGeo.dispose(); // Dispose reused geometry

            // --- Side Facades ---
            let windowPanelWidthLR = 0;
            if (numPanels > 0 && verticalSectionLength > numMullions * mullionSize) {
                windowPanelWidthLR = (verticalSectionLength - numMullions * mullionSize) / numPanels;
            } else if (numPanels > 0) { windowPanelWidthLR = 0.01; /* fallback */ }

            // Géométries latérales (seulement si windowHeight > 0)
            const windowGeoLR = windowHeight > 0 ? new THREE.BoxGeometry(pillarSize - windowRecess * 2, windowHeight, windowPanelWidthLR) : null;
            const mullionGeoLR = windowHeight > 0 ? new THREE.BoxGeometry(pillarSize - windowRecess * 2, windowHeight, mullionSize) : null;
            const verticalSectionGeo = new THREE.BoxGeometry(pillarSize, horizontalBeamSize, verticalSectionLength);


            [-1, 1].forEach(sideX => {
                const xPos = (width / 2 - pillarSize / 2) * sideX;
                const xPosWindow = xPos - windowRecess * sideX;

                // Poutres horizontales (verticales vues de côté)
                const bottomSectionVert = new THREE.Mesh(verticalSectionGeo, horizontalBeamMaterial);
                bottomSectionVert.position.set(xPos, horizontalBeamSize / 2, 0);
                floorGroup.add(bottomSectionVert);
                const topSectionVert = new THREE.Mesh(verticalSectionGeo, horizontalBeamMaterial);
                topSectionVert.position.set(xPos, floorH - horizontalBeamSize / 2, 0);
                floorGroup.add(topSectionVert);
                // --- Fin poutres ---

                // --- Fenêtres et Meneaux Latéraux (seulement si windowHeight > 0) ---
                if (windowGeoLR && mullionGeoLR && windowPanelWidthLR > 0) {
                    let currentZ = -verticalSectionLength / 2;
                    const windowBaseY = horizontalBeamSize + floorThickness;
                    const windowCenterY = windowBaseY + windowHeight / 2;
                    for (let i = 0; i < numPanels; i++) {
                        const windowZ = currentZ + windowPanelWidthLR / 2;
                        const windowMesh = new THREE.Mesh(windowGeoLR, windowMaterial);
                        windowMesh.position.set(xPosWindow, windowCenterY, windowZ);
                        floorGroup.add(windowMesh);
                        currentZ += windowPanelWidthLR;
                        if (i < numMullions) {
                            const mullionZ = currentZ + mullionSize / 2;
                            const mullionMesh = new THREE.Mesh(mullionGeoLR, structureMaterial);
                            mullionMesh.position.set(xPosWindow, windowCenterY, mullionZ);
                            floorGroup.add(mullionMesh);
                            currentZ += mullionSize;
                        }
                    }
                }
                // --- Fin Fenêtres/Meneaux ---
            });
            // Disposer géométries temporaires LR
            if(windowGeoLR) windowGeoLR.dispose();
            if(mullionGeoLR) mullionGeoLR.dispose();
            if(verticalSectionGeo) verticalSectionGeo.dispose();

            // --- Floor Surface ---
            if (addFloorSurface && horizontalSectionLength > 0 && verticalSectionLength > 0) {
                const floorGeo = new THREE.BoxGeometry(horizontalSectionLength, floorThickness, verticalSectionLength);
                const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
                floorMesh.position.y = horizontalBeamSize + floorThickness / 2;
                floorGroup.add(floorMesh);
                floorGeo.dispose(); // Dispose geometry
            }

            // Positionner le groupe de l'étage
            floorGroup.position.y = yPos;
            skyscraperGroup.add(floorGroup); // AJOUTER AU GROUPE PRINCIPAL

            // Disposer la géométrie du pilier après usage
            pillarGeo.dispose();

            return floorGroup; // Retourner le groupe créé
        }; // End createFloor helper

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
        topFloorGeo.dispose(); // Dispose geometry

        // --- Top Section ---
        const topSectionY = topFloorY + platformRaiseOffset;
        createFloor(topSectionY, topSectionHeight, topSectionWidth, topSectionDepth, numMullionsTop, false, true);

        // --- Top Section Roof Platform ---
        const topSectionRoofY = topSectionY + topSectionHeight;
        const topSectionPlatformWidth = topSectionWidth + 2 * platformOverhang;
        const topSectionPlatformDepth = topSectionDepth + 2 * platformOverhang;
        const topSectionRoofGeo = new THREE.BoxGeometry(topSectionPlatformWidth, topSectionRoofThickness, topSectionPlatformDepth);
        const topSectionRoofMesh = new THREE.Mesh(topSectionRoofGeo, roofMaterial);
        topSectionRoofMesh.position.y = topSectionRoofY - topSectionRoofThickness / 2 + platformRaiseOffset;
        skyscraperGroup.add(topSectionRoofMesh);
        topSectionRoofGeo.dispose(); // Dispose geometry

        // --- Final Roof Base ---
        const roofBaseY = topSectionRoofY + platformRaiseOffset;
        const roofBaseGeo = new THREE.BoxGeometry(roofBaseWidth, roofBaseHeight, roofBaseDepth);
        const roofBase = new THREE.Mesh(roofBaseGeo, roofMaterial);
        roofBase.position.y = roofBaseY + roofBaseHeight / 2;
        skyscraperGroup.add(roofBase);
        roofBaseGeo.dispose(); // Dispose geometry

        // --- Antenna/Pole ---
        const poleBaseY = roofBaseY + roofBaseHeight;
        const poleTopY = poleBaseY + poleHeight;
        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 12);
        const pole = new THREE.Mesh(poleGeo, antennaMaterial);
        pole.position.y = poleBaseY + poleHeight / 2;
        skyscraperGroup.add(pole);
        poleGeo.dispose(); // Dispose geometry

        // --- Dish ---
        const dishGeo = new THREE.SphereGeometry(dishRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3);
        const dish = new THREE.Mesh(dishGeo, antennaMaterial);
        dish.position.y = roofBaseY + roofBaseHeight + 1.5;
        dish.position.x = roofBaseWidth / 3;
        dish.rotation.x = Math.PI / 5;
        dish.rotation.z = -Math.PI;
        skyscraperGroup.add(dish);
        dishGeo.dispose(); // Dispose geometry

        // --- Red Light ---
        const redLightGeo = new THREE.SphereGeometry(redLightRadius, 8, 8);
        const redLightMesh = new THREE.Mesh(redLightGeo, redLightMaterial);
        redLightMesh.position.y = poleTopY + redLightRadius;
        skyscraperGroup.add(redLightMesh);
        redLightGeo.dispose(); // Dispose geometry

        // ----- Final Asset Preparation (avec correction du centerOffset) -----
        const allGeoms = [];
        const materialMap = new Map();

        Object.values(this.localMaterials).forEach(mat => {
             if (mat) { materialMap.set(mat.name, { material: mat.clone(), geoms: [] }); } // Cloner pour l'asset final
        });

        skyscraperGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);
                allGeoms.push(clonedGeom);
                const matName = child.material.name;
                const groupData = materialMap.get(matName);
                if (groupData) { groupData.geoms.push(clonedGeom); }
                 else { /* console.warn(...) */ }
            }
             // Gérer les groupes d'étages
             else if (child.isGroup && child !== skyscraperGroup) {
                 child.updateMatrixWorld(true); // Matrice du groupe d'étage
                 child.children.forEach(floorChild => {
                     if (floorChild.isMesh && floorChild.geometry && floorChild.material) {
                          floorChild.updateMatrixWorld(true); // Matrice du mesh dans le monde
                          const clonedGeom = floorChild.geometry.clone();
                          clonedGeom.applyMatrix4(floorChild.matrixWorld); // Utiliser matrixWorld
                          allGeoms.push(clonedGeom);
                          const matName = floorChild.material.name;
                          const groupData = materialMap.get(matName);
                          if (groupData) { groupData.geoms.push(clonedGeom); }
                           else { /* console.warn(...) */ }
                     }
                 });
             }
        });


        if (allGeoms.length === 0) { /* ... (gestion erreur) ... */ return null; }

        const globalMerged = mergeGeometries(allGeoms, false);
        if (!globalMerged) { /* ... (gestion erreur) ... */ return null; }

        globalMerged.computeBoundingBox();
        const globalBBox = globalMerged.boundingBox;
        const globalMin = globalBBox.min.clone(); // ** Important de cloner **
        const globalCenterOriginal = new THREE.Vector3(); // ** Stocker le centre original **
        globalBBox.getCenter(globalCenterOriginal);
        const globalSize = new THREE.Vector3();
        globalBBox.getSize(globalSize);
        globalMerged.dispose();

        globalSize.x = Math.max(globalSize.x, 0.001);
        globalSize.y = Math.max(globalSize.y, 0.001);
        globalSize.z = Math.max(globalSize.z, 0.001);

        // Utiliser les dimensions cibles pour le scaling
        const fittingScaleFactor = Math.min(baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z);
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;
            const mergedPartGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeom) { /* ... (gestion erreur) ... */ return; }

            // ** Utiliser le centre original pour la translation **
            mergedPartGeom.translate(-globalCenterOriginal.x, -globalMin.y, -globalCenterOriginal.z);
            parts.push({ geometry: mergedPartGeom, material: groupData.material });
            groupData.geoms.forEach(g => g.dispose());
        });

        allGeoms.forEach(g => g.dispose()); // Nettoyer les clones initiaux

        // ** Calcul CORRIGÉ du centerOffset **
        // C'est la position du centre d'origine par rapport à la nouvelle origine (base)
        const finalCenterOffsetY = globalCenterOriginal.y - globalMin.y;
        const finalCenterOffset = new THREE.Vector3(0, finalCenterOffsetY, 0);

        const asset = {
            id: `skyscraper_newModel_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: finalCenterOffset, // ** Utiliser le décalage corrigé **
            sizeAfterFitting: sizeAfterFitting
        };

        console.log(`[NewSkyscraper Proc] Asset '${asset.id}' generated with ${parts.length} parts.`);
        return asset;
    }

    // ... (destroy et generateSkyscraperInstance inchangés) ...
     /**
      * Cleans up resources used by the renderer.
      */
     destroy() {
        console.log("Destroying NewSkyscraperRenderer resources...");
        Object.values(this.localMaterials).forEach(material => {
             material?.dispose();
         });
        this.localMaterials = {};
         // Dispose any other specific resources if needed
         console.log("NewSkyscraperRenderer destroyed.");
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
        // L'échelle finale combine le facteur d'adaptation de l'asset et le facteur global de la stratégie
        const finalScaleValue = assetInfo.fittingScaleFactor * baseScaleFactor;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(targetRotationY);

        // Le recentrage utilise le centerOffset calculé lors de la génération de l'asset
        // Ce centerOffset est relatif à l'origine locale (base, centre XZ) de l'asset
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -assetInfo.centerOffset.x, // Devrait être 0 avec la correction
            -assetInfo.centerOffset.y, // Représente le centre Y original par rapport à la base
            -assetInfo.centerOffset.z  // Devrait être 0 avec la correction
        );

        // La hauteur finale APRES mise à l'échelle
        const finalHeight = assetInfo.sizeAfterFitting.y * baseScaleFactor;
        // La position Y finale: centre de la hauteur finale + niveau du sol
        const finalY = finalHeight / 2 + groundLevel;
        const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);

        // Ordre: Scale -> Recenter -> Rotate -> Translate
        // 1. Appliquer le recentrage A L'ASSET SCALÉ
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        // 2. Appliquer la rotation
        instanceMatrix.premultiply(rotationMatrix);
        // 3. Appliquer la translation finale
        instanceMatrix.premultiply(translationMatrix);


        // --- Créer la structure de retour pour InstanceDataManager ---
        // InstanceDataManager s'attend à { type: { idOrKey: [matrices...] } }
        // Ici, type='skyscraper', idOrKey sera l'ID unique de l'asset + nom de la partie,
        // et le tableau contiendra une seule matrice pour cette instance.
        const skyscraperInstanceData = {};

        // Construire les clés pour chaque partie (ex: "skyscraper_newModel_0_part0", "skyscraper_newModel_0_part1", etc.)
        // où "part0", "part1" correspondent implicitement à l'index dans assetInfo.parts
        assetInfo.parts.forEach((part, index) => {
            const partKey = `part${index}`; // Clé simple basée sur l'index
            // Clé complète pour InstanceDataManager
            const instanceKey = `${assetInfo.id}_${partKey}`;
            skyscraperInstanceData[instanceKey] = [instanceMatrix.clone()]; // Ajouter la matrice clonée
        });

        // S'il n'y a pas de 'parts' (cas d'un asset standard, peu probable ici mais par sécurité)
        if (!assetInfo.parts || assetInfo.parts.length === 0) {
             // Utiliser 'default' comme clé de partie ou l'ID de l'asset comme clé ?
             // Utilisons l'ID de l'asset comme clé pour InstanceDataManager
             skyscraperInstanceData[assetInfo.id] = [instanceMatrix.clone()];
        }


        return skyscraperInstanceData;
    }


}