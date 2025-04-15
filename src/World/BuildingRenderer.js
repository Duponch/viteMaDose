// src/World/BuildingRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class BuildingRenderer {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        // Initialisation des références spécifiques aux immeubles
        this.baseBuildingGeometries = {};
        this.baseBuildingMaterials = {};
        this.buildingInstanceMatrices = {};
        this.assetIdCounter = 0; // Compteur pour générer des IDs uniques pour les immeubles procéduraux
        this.defineBuildingBaseMaterials();
        this.defineBuildingBaseGeometries();
        this.initializeBuildingMatrixArrays();
    }

    /**
     * Initialise les tableaux de matrices d’instances pour les immeubles.
     */
    initializeBuildingMatrixArrays() {
        this.buildingInstanceMatrices = {
            default: []
        };
    }

    /**
     * Définit les matériaux de base utilisés pour les immeubles par défaut.
     */
    defineBuildingBaseMaterials() {
        // Couleur par défaut pour les immeubles (modifiable selon vos besoins)
        this.baseBuildingMaterials.default = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.9,
            name: "DefaultBuildingMat"
        });
    }

    /**
     * Définit les géométries de base pour les immeubles par défaut.
     * Ici, nous utilisons une boîte simple en guise de géométrie par défaut.
     */
    defineBuildingBaseGeometries() {
        this.baseBuildingGeometries.default = new THREE.BoxGeometry(1, 1, 1);
    }

    /**
     * Génère la matrice d'instance pour un immeuble en fonction des paramètres
     * et des données de l'asset.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer l'immeuble.
     * @param {number} groundLevel - Position Y du sol.
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle appliqué.
     * @param {object} assetInfo - Données de l'asset (doit contenir notamment sizeAfterFitting, fittingScaleFactor, centerOffset, id et éventuellement parts).
     * @returns {object} Un objet contenant les matrices d'instance pour l'immeuble.
     */
    generateBuildingInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor, assetInfo) {
        // Calcul de la matrice de transformation commune
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

        // Génération des données d'instance en fonction du type d'asset
        const buildingInstanceData = {};
        if (assetInfo.parts && assetInfo.parts.length > 0) {
            // Pour les assets procéduraux, chaque partie est traitée individuellement
            assetInfo.parts.forEach((part, index) => {
                buildingInstanceData[`part${index}`] = [instanceMatrix.clone()];
            });
        } else {
            // Asset standard avec une seule géométrie
            buildingInstanceData.default = [instanceMatrix.clone()];
        }
        return buildingInstanceData;
    }

    /**
     * Réinitialise le BuildingRenderer en libérant la géométrie par défaut et en réinitialisant les tableaux d'instances.
     */
    reset() {
        if (this.baseBuildingGeometries && this.baseBuildingGeometries.default) {
            this.baseBuildingGeometries.default.dispose();
        }
        this.baseBuildingGeometries = {};
        this.defineBuildingBaseGeometries();
        this.initializeBuildingMatrixArrays();
    }

    /**
     * Génère un asset procédural pour un immeuble.
     * Retourne un objet contenant :
     *   - id: identifiant unique
     *   - parts: tableau d'objets { geometry, material }
     *   - fittingScaleFactor, userScale, centerOffset, sizeAfterFitting
     *
     * Ces données permettront de créer des InstancedMesh (dans CityAssetLoader ou un autre générateur de contenu).
     *
     * @param {number} baseWidth - Largeur de base à atteindre.
     * @param {number} baseHeight - Hauteur de base à atteindre.
     * @param {number} baseDepth - Profondeur de base à atteindre.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur.
     * @returns {object|null} L'asset généré ou null en cas d'erreur.
     */
    generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1) {
        const buildingGroup = new THREE.Group();

        // ----- Paramètres et matériaux pour la génération d'immeuble -----
        const Z_FIGHT_OFFSET = 0.01;
        const mainColor = 0xf0e6d2;
        const sideColor = 0x6082b6;
        const roofColor = 0x808080;
        const roofDetailColor = 0xa9a9a9;
        const windowColor = 0x4682B4;
        const doorColor = 0x8a7967;
        const equipmentColor = 0xaaaaaa;

        const mainMaterial = new THREE.MeshStandardMaterial({ color: mainColor, name: "BuildingMainMat" });
        const sideMaterial = new THREE.MeshStandardMaterial({ color: sideColor, name: "BuildingSideMat" });
        const roofMaterial = new THREE.MeshStandardMaterial({ color: roofColor, name: "BuildingRoofMat" });
        const roofDetailMaterial = new THREE.MeshStandardMaterial({ color: roofDetailColor, name: "BuildingRoofDetailMat" });
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: windowColor,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xfcffe0,
            name: "BuildingWindowMat"
        });
        const doorMaterial = new THREE.MeshStandardMaterial({ color: doorColor, name: "BuildingDoorMat" });
        const equipmentMaterial = new THREE.MeshStandardMaterial({
            color: equipmentColor,
            metalness: 0.9,
            roughness: 0.4,
            name: "BuildingEquipmentMat"
        });

        // ----- Dimensions (valeurs par défaut, à adapter selon vos besoins) -----
        const mainWidthDim = 8, mainHeightDim = 16, mainDepthDim = 8;
        const sideWidthDim = 3, sideHeightDim = 14, sideDepthDim = 7;
        const roofOverhangDim = 0.5, windowWidthDim = 1.5, windowHeightDim = 1;
        const windowDepthDim = 0.1, roofThickness = 0.5, roofTopThickness = 0.2;
        const totalRoofHeight = roofThickness + roofTopThickness;
        const doorHeightDim = 3, doorWidthDim = 1.5;
        const antennaHeight1 = 4, antennaHeight2 = 3;
        const antennaRadius = 0.1, boxSize1 = 1, boxWidth2 = 1.5;
        const boxHeight2 = 0.5, boxDepth2 = 1;

        // ----- Création des éléments de l'immeuble -----
        // Bloc principal
        const mainBlockGeo = new THREE.BoxGeometry(mainWidthDim, mainHeightDim, mainDepthDim);
        const mainBlock = new THREE.Mesh(mainBlockGeo, mainMaterial);
        mainBlock.position.y = mainHeightDim / 2;
        mainBlock.castShadow = true; mainBlock.receiveShadow = true;
        buildingGroup.add(mainBlock);

        // Section latérale
        const sideBlockGeo = new THREE.BoxGeometry(sideWidthDim, sideHeightDim, sideDepthDim);
        const sideBlock = new THREE.Mesh(sideBlockGeo, sideMaterial);
        sideBlock.position.x = mainWidthDim / 2 + sideWidthDim / 2;
        sideBlock.position.y = sideHeightDim / 2;
        sideBlock.position.z = (mainDepthDim - sideDepthDim) / 2;
        sideBlock.castShadow = true; sideBlock.receiveShadow = true;
        buildingGroup.add(sideBlock);

        // Toits
        const mainRoofY = mainHeightDim;
        const sideRoofY = sideHeightDim;
        const mainRoofGeo = new THREE.BoxGeometry(mainWidthDim + roofOverhangDim, roofThickness, mainDepthDim + roofOverhangDim);
        const mainRoof = new THREE.Mesh(mainRoofGeo, roofDetailMaterial);
        mainRoof.position.y = mainRoofY + roofThickness / 2;
        mainRoof.castShadow = true;
        buildingGroup.add(mainRoof);

        const mainRoofTopGeo = new THREE.BoxGeometry(mainWidthDim, roofTopThickness, mainDepthDim);
        const mainRoofTop = new THREE.Mesh(mainRoofTopGeo, roofMaterial);
        mainRoofTop.position.y = mainRoofY + roofThickness + roofTopThickness / 2;
        mainRoofTop.castShadow = true;
        buildingGroup.add(mainRoofTop);

        const sideRoofGeo = new THREE.BoxGeometry(sideWidthDim + roofOverhangDim, roofThickness, sideDepthDim + roofOverhangDim);
        const sideRoof = new THREE.Mesh(sideRoofGeo, roofDetailMaterial);
        sideRoof.position.x = sideBlock.position.x;
        sideRoof.position.y = sideRoofY + roofThickness / 2;
        sideRoof.position.z = sideBlock.position.z;
        sideRoof.castShadow = true;
        buildingGroup.add(sideRoof);

        const sideRoofTopGeo = new THREE.BoxGeometry(sideWidthDim, roofTopThickness, sideDepthDim);
        const sideRoofTop = new THREE.Mesh(sideRoofTopGeo, roofMaterial);
        sideRoofTop.position.x = sideBlock.position.x;
        sideRoofTop.position.y = sideRoofY + roofThickness + roofTopThickness / 2;
        sideRoofTop.position.z = sideBlock.position.z;
        sideRoofTop.castShadow = true;
        buildingGroup.add(sideRoofTop);

        // Fenêtres
        const windowGeo = new THREE.BoxGeometry(windowWidthDim, windowHeightDim, windowDepthDim);
        const numFloorsMain = 6, numWindowsPerRowMain = 2, startYMain = 2.5;
        const spacingYMain = (mainHeightDim - startYMain * 1.5) / numFloorsMain;
        const totalWindowWidthMain = numWindowsPerRowMain * windowWidthDim;
        const spacingXMain = (mainWidthDim - totalWindowWidthMain) / (numWindowsPerRowMain + 1);
        const spacingZMain = (mainDepthDim - totalWindowWidthMain) / (numWindowsPerRowMain + 1);
        for (let i = 0; i < numFloorsMain; i++) {
            for (let j = 0; j < numWindowsPerRowMain; j++) {
                const windowMesh = new THREE.Mesh(windowGeo, windowMaterial);
                windowMesh.position.x = -mainWidthDim / 2 + spacingXMain * (j + 1) + windowWidthDim * j + windowWidthDim / 2;
                windowMesh.position.y = startYMain + i * spacingYMain;
                windowMesh.position.z = mainDepthDim / 2 + Z_FIGHT_OFFSET;
                windowMesh.castShadow = true;
                buildingGroup.add(windowMesh);
            }
        }
        for (let i = 0; i < numFloorsMain; i++) {
            for (let j = 0; j < numWindowsPerRowMain; j++) {
                const windowMesh = new THREE.Mesh(windowGeo, windowMaterial);
                windowMesh.position.x = -mainWidthDim / 2 - Z_FIGHT_OFFSET;
                windowMesh.position.y = startYMain + i * spacingYMain;
                windowMesh.position.z = -mainDepthDim / 2 + spacingZMain * (j + 1) + windowWidthDim * j + windowWidthDim / 2;
                windowMesh.rotation.y = Math.PI / 2;
                windowMesh.castShadow = true;
                buildingGroup.add(windowMesh);
            }
        }
        const numFloorsSide = 5, startYSide = 2.5;
        const spacingYSide = (sideHeightDim - startYSide * 1.5) / numFloorsSide;
        const sideWindowGeo = new THREE.BoxGeometry(windowWidthDim * 0.5, windowHeightDim * 0.8, windowDepthDim);
        for (let i = 0; i < numFloorsSide; i++) {
            const windowMesh = new THREE.Mesh(sideWindowGeo, windowMaterial);
            windowMesh.position.x = sideBlock.position.x;
            windowMesh.position.y = startYSide + i * spacingYSide;
            windowMesh.position.z = sideBlock.position.z + sideDepthDim / 2 + Z_FIGHT_OFFSET;
            windowMesh.castShadow = true;
            buildingGroup.add(windowMesh);
        }

        // Porte
        const doorGeo = new THREE.BoxGeometry(doorWidthDim, doorHeightDim, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMaterial);
        door.position.x = sideBlock.position.x;
        door.position.y = doorHeightDim / 2;
        door.position.z = sideBlock.position.z + sideDepthDim / 2 + 0.05;
        buildingGroup.add(door);

        // Équipements toit
        const roofEquipmentY = mainRoofY + totalRoofHeight + 0.1;
        const antennaGeo1 = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight1, 8);
        const antenna1Mesh = new THREE.Mesh(antennaGeo1, equipmentMaterial);
        antenna1Mesh.position.set(-mainWidthDim * 0.3, roofEquipmentY + antennaHeight1 / 2, -mainDepthDim * 0.3);
        antenna1Mesh.castShadow = true;
        buildingGroup.add(antenna1Mesh);
        const antennaGeo2 = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight2, 8);
        const antenna2Mesh = new THREE.Mesh(antennaGeo2, equipmentMaterial);
        antenna2Mesh.position.set(-mainWidthDim * 0.35, roofEquipmentY + antennaHeight2 / 2, -mainDepthDim * 0.35);
        antenna2Mesh.castShadow = true;
        buildingGroup.add(antenna2Mesh);
        const boxGeo1 = new THREE.BoxGeometry(boxSize1, boxSize1, boxSize1);
        const box1Mesh = new THREE.Mesh(boxGeo1, equipmentMaterial);
        box1Mesh.position.set(mainWidthDim * 0.2, roofEquipmentY + boxSize1 / 2, mainDepthDim * 0.2);
        box1Mesh.castShadow = true;
        buildingGroup.add(box1Mesh);
        const boxGeo2 = new THREE.BoxGeometry(boxWidth2, boxHeight2, boxDepth2);
        const box2Mesh = new THREE.Mesh(boxGeo2, equipmentMaterial);
        box2Mesh.position.set(mainWidthDim * 0.1, roofEquipmentY + boxHeight2 / 2, -mainDepthDim * 0.2);
        box2Mesh.castShadow = true;
        buildingGroup.add(box2Mesh);

        // ----- Regroupement par matériau -----
        const allBuildingGeoms = [];
        const buildingMaterialMap = new Map();
        buildingMaterialMap.set(mainMaterial.name, { material: mainMaterial.clone(), geoms: [] });
        buildingMaterialMap.set(sideMaterial.name, { material: sideMaterial.clone(), geoms: [] });
        buildingMaterialMap.set(roofMaterial.name, { material: roofMaterial.clone(), geoms: [] });
        buildingMaterialMap.set(roofDetailMaterial.name, { material: roofDetailMaterial.clone(), geoms: [] });
        buildingMaterialMap.set(windowMaterial.name, { material: windowMaterial.clone(), geoms: [] });
        buildingMaterialMap.set(doorMaterial.name, { material: doorMaterial.clone(), geoms: [] });
        buildingMaterialMap.set(equipmentMaterial.name, { material: equipmentMaterial.clone(), geoms: [] });

        buildingGroup.traverse(child => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);
                allBuildingGeoms.push(clonedGeom);
                const matName = child.material.name;
                const groupData = buildingMaterialMap.get(matName);
                if (groupData) {
                    groupData.geoms.push(clonedGeom);
                } else {
                    console.warn(`[Building Proc] Matériau inconnu ou sans nom trouvé: ${matName || '[sans nom]'}`);
                }
            }
        });

        if (allBuildingGeoms.length === 0) {
            console.error("[Building Proc] Aucune géométrie valide trouvée.");
            return null;
        }
        const globalMergedBuilding = mergeGeometries(allBuildingGeoms, false);
        if (!globalMergedBuilding) {
            console.error("[Building Proc] Échec de fusion globale.");
            allBuildingGeoms.forEach(g => g.dispose());
            return null;
        }
        globalMergedBuilding.computeBoundingBox();
        const globalMinBuilding = globalMergedBuilding.boundingBox.min;
        const globalCenterBuilding = new THREE.Vector3();
        globalMergedBuilding.boundingBox.getCenter(globalCenterBuilding);
        const globalSizeBuilding = new THREE.Vector3();
        globalMergedBuilding.boundingBox.getSize(globalSizeBuilding);
        globalSizeBuilding.x = Math.max(globalSizeBuilding.x, 0.001);
        globalSizeBuilding.y = Math.max(globalSizeBuilding.y, 0.001);
        globalSizeBuilding.z = Math.max(globalSizeBuilding.z, 0.001);
        const fittingScaleFactorBuilding = Math.min(baseWidth / globalSizeBuilding.x, baseHeight / globalSizeBuilding.y, baseDepth / globalSizeBuilding.z);
        const sizeAfterFittingBuilding = globalSizeBuilding.clone().multiplyScalar(fittingScaleFactorBuilding);

        const buildingParts = [];
        buildingMaterialMap.forEach((groupData, key) => {
            if (groupData.geoms.length === 0) return;
            const mergedPart = mergeGeometries(groupData.geoms, false);
            if (!mergedPart) {
                console.error(`[Building Proc] Échec de fusion du groupe "${key}".`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }
            mergedPart.translate(-globalCenterBuilding.x, -globalMinBuilding.y, -globalCenterBuilding.z);
            mergedPart.computeBoundingBox();
            const finalMaterial = groupData.material;
            finalMaterial.needsUpdate = true;
            buildingParts.push({ geometry: mergedPart, material: finalMaterial });
            groupData.geoms.forEach(g => g.dispose());
        });

        // Nettoyage final
        allBuildingGeoms.forEach(g => g.dispose());
        globalMergedBuilding.dispose();
        mainBlockGeo.dispose();
        sideBlockGeo.dispose();
        mainRoofGeo.dispose();
        mainRoofTopGeo.dispose();
        sideRoofGeo.dispose();
        sideRoofTopGeo.dispose();
        windowGeo.dispose();
        doorGeo.dispose();
        antennaGeo1.dispose();
        antennaGeo2.dispose();
        boxGeo1.dispose();
        boxGeo2.dispose();

        const buildingAsset = {
            id: `building_procedural_${this.assetIdCounter++}`,
            parts: buildingParts,
            fittingScaleFactor: fittingScaleFactorBuilding,
            userScale: userScale,
            centerOffset: new THREE.Vector3(globalCenterBuilding.x, globalCenterBuilding.y, globalCenterBuilding.z),
            sizeAfterFitting: sizeAfterFittingBuilding
        };
        return buildingAsset;
    }
}
