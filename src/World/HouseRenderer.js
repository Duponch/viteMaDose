// src/World/HouseRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class HouseRenderer {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        // Initialisation des références spécifiques aux maisons
        this.baseHouseGeometries = {};
        this.baseHouseMaterials = {};
        this.houseInstanceMatrices = {};
        this.assetIdCounter = 0; // Compteur pour générer des IDs uniques pour les maisons procédurales
        this.defineHouseBaseMaterials();
        this.defineHouseBaseGeometries();
        this.initializeHouseMatrixArrays();
    }

    /**
     * Initialise les tableaux de matrices d’instances pour chaque partie de la maison.
     */
    initializeHouseMatrixArrays() {
        this.houseInstanceMatrices = {
            wall: [],
            roof: [],
            windowFrame: [],
            windowGlass: [],
            door: [],
            garageDoor: []
            // Ajoutez d'autres parties si nécessaire
        };
    }

    /**
     * Définit les matériaux de base utilisés pour les différentes parties de la maison.
     */
    defineHouseBaseMaterials() {
        const facadeColor = 0xF5F5DC;
        const roofColor = 0x8B4513;
        const doorColor = 0x4a2c2a;
        const garageDoorColor = 0xd3d3d3;
        const windowColor = 0xadd8e6;

        this.baseHouseMaterials = {};

        this.baseHouseMaterials.base_part1 = new THREE.MeshStandardMaterial({
            color: facadeColor, roughness: 0.8, name: "HouseBase1Mat"
        });
        this.baseHouseMaterials.base_part2 = new THREE.MeshStandardMaterial({
            color: facadeColor, roughness: 0.8, name: "HouseBase2Mat"
        });
        this.baseHouseMaterials.roof = new THREE.MeshStandardMaterial({
            color: roofColor, roughness: 0.7, name: "HouseRoofMat",
            side: THREE.DoubleSide // Pour assurer un rendu des deux côtés
        });
        this.baseHouseMaterials.door = new THREE.MeshStandardMaterial({
            color: doorColor, roughness: 0.7, name: "HouseDoorMat"
        });
        this.baseHouseMaterials.garageDoor = new THREE.MeshStandardMaterial({
            color: garageDoorColor, roughness: 0.6, name: "HouseGarageDoorMat"
        });
        this.baseHouseMaterials.window = new THREE.MeshStandardMaterial({
            color: windowColor, roughness: 0.1, metalness: 0.1,
            transparent: true, opacity: 0.7, name: "HouseWindowMat"
        });
    }

    /**
     * Définit les géométries de base pour les différentes parties de la maison.
     * Notez que l'épaisseur (doorDepth / windowDepth) a été réduite.
     */
    defineHouseBaseGeometries() {
		this.baseHouseGeometries = {};
	
		// --- Dimensions de base ---
		const armLength = 2;
		const armWidth = 1;
		const armDepth = 0.5;
		const roofPitchHeight = 0.3;
		const roofOverhang = 0.08;
		const doorHeight = 0.7 * armDepth;
		const doorWidth = 0.3;
		const doorDepth = 0.02; // Épaisseur réduite pour portes/fenêtres
		const garageDoorHeight = 0.8 * armDepth;
		const garageDoorWidth = 0.55;
		const windowHeight = 0.4 * armDepth;
		const windowWidth = 0.2;
		const windowDepth = doorDepth;
	
		// --- Géométries de base (BoxGeometry possède par défaut un attribut uv) ---
		this.baseHouseGeometries.base_part1 = new THREE.BoxGeometry(armLength, armDepth, armWidth);
		this.baseHouseGeometries.base_part1.translate(armLength / 2, armDepth / 2, armWidth / 2);
		this.baseHouseGeometries.base_part2 = new THREE.BoxGeometry(armWidth, armDepth, armLength);
		this.baseHouseGeometries.base_part2.translate(armWidth / 2, armDepth / 2, armLength / 2);
		this.baseHouseGeometries.base_part1.userData = { height: armDepth, minY: 0 };
		this.baseHouseGeometries.base_part2.userData = { height: armDepth, minY: 0 };
	
		// --- Géométrie du toit créée manuellement ---
		const roofWidth = armWidth + 2 * roofOverhang;
		const roofDepth = armLength + 2 * roofOverhang;
		const roofHeight = roofPitchHeight;
		const halfRoofWidth = roofWidth / 2;
		const halfRoofDepth = roofDepth / 2;
		const roofGeometry = new THREE.BufferGeometry();
		const vertices = new Float32Array([
			-halfRoofWidth, 0, -halfRoofDepth,
			 halfRoofWidth, 0, -halfRoofDepth,
			 halfRoofWidth, 0,  halfRoofDepth,
			-halfRoofWidth, 0,  halfRoofDepth,
			 0, roofHeight, -halfRoofDepth,
			 0, roofHeight,  halfRoofDepth
		]);
		const indices = new Uint16Array([
			0, 1, 4,
			2, 3, 5,
			0, 3, 5,
			0, 5, 4,
			1, 2, 5,
			1, 5, 4
		]);
		roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		roofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
		roofGeometry.computeVertexNormals();
	
		// ** Correction : ajouter un attribut 'uv' pour homogénéiser la géométrie **
		if (!roofGeometry.attributes.uv) {
			const count = roofGeometry.attributes.position.count; // nombre de sommets (dans ce cas 6)
			const uvs = new Float32Array(count * 2); // 2 coordonnées par sommet
			for (let i = 0; i < count; i++) {
				// Vous pouvez définir ici de vraies coordonnées uv.
				// Pour la simplicité, on attribue (0, 0) à chaque sommet.
				uvs[i * 2] = 0;
				uvs[i * 2 + 1] = 0;
			}
			roofGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
		}
	
		this.baseHouseGeometries.roof = roofGeometry;
	
		// --- Géométries pour les portes ---
		this.baseHouseGeometries.door = new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth);
		this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(doorDepth, garageDoorHeight, garageDoorWidth);
	
		// --- Géométries pour les fenêtres ---
		this.baseHouseGeometries.windowYZ = new THREE.BoxGeometry(windowDepth, windowHeight, windowWidth);
		this.baseHouseGeometries.windowXY = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth);
	}	

    /**
     * Génère les matrices d'instances pour une maison et retourne un objet
     * dont les clés correspondent aux parties de la maison et les valeurs à des tableaux de matrices.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer la maison.
     * @param {number} groundLevel - Position Y du sol.
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle appliqué.
     * @returns {object} Un objet contenant les données d'instances pour chaque partie.
     */
    generateHouseInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor) {
        const armLength = 2;
        const armWidth = 1;
        const armDepth = 0.5;
        const doorHeight = 0.7 * armDepth;
        const doorDepth = 0.02;
        const doorWidth = 0.3;
        const garageDoorHeight = 0.8 * armDepth;
        const garageDoorWidth = 0.55;
        const windowHeight = 0.4 * armDepth;
        const windowDepth = doorDepth;
        const window_Y_pos_Base = armDepth * 0.3;

        const finalScaleVector = new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor);
        const finalPosY = groundLevel;
        const modelCenterLocal = new THREE.Vector3(armLength / 2, armDepth / 2, armLength / 2);
        const centerOffsetRotated = modelCenterLocal.clone().applyQuaternion(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY)
        );
        const centerOffsetScaledRotated = centerOffsetRotated.multiplyScalar(baseScaleFactor);
        const finalPosition = new THREE.Vector3(
            worldCellCenterPos.x - centerOffsetScaledRotated.x,
            finalPosY,
            worldCellCenterPos.z - centerOffsetScaledRotated.z
        );
        const globalHouseMatrix = new THREE.Matrix4().compose(
            finalPosition,
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY),
            finalScaleVector
        );

        const houseInstanceData = {};

        // Fonction interne d'ajout d'une partie
        const addPartInstance = (partName, localMatrix) => {
            if (!houseInstanceData[partName]) {
                houseInstanceData[partName] = [];
            }
            if (this.baseHouseGeometries[partName]) {
                const finalMatrix = new THREE.Matrix4().multiplyMatrices(globalHouseMatrix, localMatrix);
                houseInstanceData[partName].push(finalMatrix.clone());
            } else {
                console.warn(`Géométrie maison manquante: ${partName}`);
            }
        };

        // Fonction interne pour ajouter une partie fenêtre
        const addWindowPart = (geomKey, facadeCoordX, facadeCoordZ, yBase, isYZPlane) => {
            const yCenter = yBase + windowHeight / 2;
            const localMatrix = new THREE.Matrix4().makeTranslation(facadeCoordX, yCenter, facadeCoordZ);
            addPartInstance(geomKey, localMatrix);
        };

        // Ajout des parties de base
        addPartInstance('base_part1', new THREE.Matrix4());
        addPartInstance('base_part2', new THREE.Matrix4());

        const roofBaseY = armDepth;
        const roofPos1 = new THREE.Vector3(armLength / 2, roofBaseY, armWidth / 2);
        const roofPos2 = new THREE.Vector3(armWidth / 2, roofBaseY, armLength / 2);
        const roofRot1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        const roofRot2 = new THREE.Quaternion();
        let localMatrix = new THREE.Matrix4().compose(roofPos1, roofRot1, new THREE.Vector3(1, 1, 1));
        addPartInstance('roof', localMatrix);
        localMatrix = new THREE.Matrix4().compose(roofPos2, roofRot2, new THREE.Vector3(1, 1, 1));
        addPartInstance('roof', localMatrix);

        const doorPos = new THREE.Vector3(armWidth, doorHeight / 2, armLength * 0.75);
        addPartInstance('door', new THREE.Matrix4().makeTranslation(doorPos.x, doorPos.y, doorPos.z));
        const garagePos = new THREE.Vector3(armLength, garageDoorHeight / 2, armWidth / 2);
        addPartInstance('garageDoor', new THREE.Matrix4().makeTranslation(garagePos.x, garagePos.y, garagePos.z));

        // Ajout des parties fenêtres (pour windowXY et windowYZ)
        addWindowPart('windowXY', 0.25, 0, window_Y_pos_Base, false);
        addWindowPart('windowXY', 0.75, 0, window_Y_pos_Base, false);
        addWindowPart('windowXY', 1.25, 0, window_Y_pos_Base, false);
        addWindowPart('windowXY', 1.75, 0, window_Y_pos_Base, false);
        addWindowPart('windowXY', 0.25, armWidth, window_Y_pos_Base, false);
        addWindowPart('windowXY', 0.75, armWidth, window_Y_pos_Base, false);
        addWindowPart('windowXY', 1.25, armWidth, window_Y_pos_Base, false);
        addWindowPart('windowXY', 1.75, armWidth, window_Y_pos_Base, false);
        addWindowPart('windowYZ', 0, 0.25, window_Y_pos_Base, true);
        addWindowPart('windowYZ', 0, 0.75, window_Y_pos_Base, true);
        addWindowPart('windowYZ', armWidth, 0.25, window_Y_pos_Base, true);
        addWindowPart('windowYZ', armWidth, 0.75, window_Y_pos_Base, true);
        const doorEdgeLeft = armLength * 0.75 - doorWidth / 2;
        const doorEdgeRight = armLength * 0.75 + doorWidth / 2;
        addWindowPart('windowYZ', armWidth, (armWidth + doorEdgeLeft) / 2, window_Y_pos_Base, true);
        addWindowPart('windowYZ', armWidth, (doorEdgeRight + armLength) / 2, window_Y_pos_Base, true);

        return houseInstanceData;
    }

    /**
     * Crée les InstancedMesh pour les parties de la maison et les ajoute au groupe fourni.
     *
     * @param {object} instanceData - Objet associant les noms de partie à des tableaux de matrices.
     * @param {THREE.Group} houseGroup - Groupe dans lequel ajouter les InstancedMesh.
     * @param {object} experience - (Optionnel) Permet d'accéder par exemple à l'environnement de la scène.
     */
    createInstancedMeshes(instanceData, houseGroup, experience) {
        let instancedMeshCount = 0;

        for (const partName in instanceData) {
            if (instanceData.hasOwnProperty(partName)) {
                const matrices = instanceData[partName];
                const geometry = this.baseHouseGeometries[partName];
                let material = null;
                const isHouseWindowPart = (partName === 'windowXY' || partName === 'windowYZ');

                if (isHouseWindowPart) {
                    material = this.baseHouseMaterials.window.clone();
                    material.name = `HouseWindowMat_Inst_${partName}`;
                    material.emissive = new THREE.Color(0xFFFF99);
                    material.emissiveIntensity = 0.0;
                    if (experience && experience.scene && experience.scene.environment) {
                        material.envMap = experience.scene.environment;
                        material.roughness = 0.05;
                        material.metalness = 0.9;
                        material.needsUpdate = true;
                    } else {
                        console.warn(`[InstancedMesh] Env map non trouvée pour fenêtres maison (${partName}).`);
                    }
                } else {
                    if (partName.startsWith('base_')) {
                        material = this.baseHouseMaterials[partName];
                    } else if (partName === 'roof') {
                        material = this.baseHouseMaterials.roof;
                    } else if (partName === 'door') {
                        material = this.baseHouseMaterials.door;
                    } else if (partName === 'garageDoor') {
                        material = this.baseHouseMaterials.garageDoor;
                    } else {
                        material = this.baseHouseMaterials[partName];
                    }
                    if (!material) {
                        console.warn(`[InstancedMesh] Matériau non trouvé pour partie maison: ${partName}`);
                    }
                }

                if (geometry && material && matrices && matrices.length > 0) {
                    const count = matrices.length;
                    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                    instancedMesh.name = `House_${partName}_Instanced`;
                    instancedMesh.castShadow = true;
                    instancedMesh.receiveShadow = !isHouseWindowPart;
                    matrices.forEach((matrix, index) => {
                        instancedMesh.setMatrixAt(index, matrix);
                    });
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    houseGroup.add(instancedMesh);
                    instancedMeshCount++;
                } else if (!matrices || matrices.length === 0) {
                    // Aucune instance pour cette partie
                } else {
                    if (!geometry) console.warn(`[InstancedMesh] Géométrie manquante pour partie maison: ${partName}`);
                    if (!material && !isHouseWindowPart) console.warn(`[InstancedMesh] Matériau non trouvé (non fenêtre) pour partie maison: ${partName}`);
                }
            }
        }

        console.log(`HouseRenderer: ${instancedMeshCount} InstancedMesh(s) créés pour la maison.`);
    }

    /**
     * Réinitialise le HouseRenderer en disposant des géométries et en réinitialisant les tableaux d'instances.
     */
    reset() {
        for (const key in this.baseHouseGeometries) {
            if (this.baseHouseGeometries[key]) {
                this.baseHouseGeometries[key].dispose();
            }
        }
        this.baseHouseGeometries = {};
        this.defineHouseBaseGeometries();
        this.initializeHouseMatrixArrays();
    }

    /**
     * Génère un asset procédural pour la maison.
     * Retourne un objet contenant :
     *   - id: identifiant unique
     *   - parts: tableau d'objets { geometry, material }
     *   - fittingScaleFactor, userScale, centerOffset, sizeAfterFitting
     *
     * Ces données permettront de créer des InstancedMesh dans PlotContentGenerator.
     */
    generateProceduralHouse(baseWidth, baseHeight, baseDepth, userScale = 1) {
        // Regrouper les géométries de chaque partie selon leur matériau
        const materialMap = new Map();
        for (const partName in this.baseHouseGeometries) {
            if (this.baseHouseGeometries.hasOwnProperty(partName)) {
                // Clone la géométrie de la partie
                const geomClone = this.baseHouseGeometries[partName].clone();
                const material = this.baseHouseMaterials[partName];
                if (!material) {
                    console.warn(`Matériau manquant pour la partie ${partName}.`);
                    continue;
                }
                const matName = material.name;
                if (!materialMap.has(matName)) {
                    materialMap.set(matName, { material: material.clone(), geoms: [] });
                }
                materialMap.get(matName).geoms.push(geomClone);
            }
        }

        // Fusionner les géométries de chaque groupe
        const parts = [];
        const allGeoms = [];
        materialMap.forEach((groupData, key) => {
            if (groupData.geoms.length === 0) return;
            const mergedGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedGeom) {
                console.error(`Échec de fusion des géométries pour le groupe "${key}".`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }
            // Conserver cette géométrie pour le calcul global
            allGeoms.push(mergedGeom);
            groupData.mergedGeom = mergedGeom;
            // Libérer les géométries individuelles
            groupData.geoms.forEach(g => g.dispose());
            groupData.geoms = [];
        });

        // Calculer la fusion globale pour obtenir la bounding box
        if (allGeoms.length === 0) {
            console.error("Aucune géométrie valide pour générer la maison procédurale.");
            return null;
        }
        const globalMerged = mergeGeometries(allGeoms, false);
        globalMerged.computeBoundingBox();
        const globalBBox = globalMerged.boundingBox;
        const globalMin = globalBBox.min.clone();
        const globalCenter = new THREE.Vector3();
        globalBBox.getCenter(globalCenter);
        const globalSize = new THREE.Vector3();
        globalBBox.getSize(globalSize);
        // Éviter la division par zéro
        globalSize.x = Math.max(globalSize.x, 0.001);
        globalSize.y = Math.max(globalSize.y, 0.001);
        globalSize.z = Math.max(globalSize.z, 0.001);
        const fittingScaleFactor = Math.min(baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z);
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        // Ajuster chaque partie par rapport au centre global
        materialMap.forEach((groupData, key) => {
            if (groupData.mergedGeom) {
                groupData.mergedGeom.translate(-globalCenter.x, -globalMin.y, -globalCenter.z);
            }
        });

        // Constituer le tableau final des parties
        materialMap.forEach((groupData, key) => {
            if (groupData.mergedGeom) {
                parts.push({
                    geometry: groupData.mergedGeom,
                    material: groupData.material
                });
            }
        });

        // Nettoyage final
        allGeoms.forEach(g => g.dispose());
        globalMerged.dispose();

        const asset = {
            id: `house_procedural_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: globalCenter,
            sizeAfterFitting: sizeAfterFitting
        };
        return asset;
    }
}
