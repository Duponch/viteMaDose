// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    // ----- CONSTRUCTEUR MODIFIÉ -----
	constructor(config) {
        this.config = config;
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();
        this.assets = {
            house: [], // Gardé pour la structure, mais ne sera pas peuplé
            building: [],
            industrial: [],
            park: [],
            tree: [],
            skyscraper: []
        };
        this.assetIdCounter = 0;
        // Message mis à jour pour refléter l'ignorance des maisons
        console.log("CityAssetLoader initialisé. Le chargement des maisons ('house') sera ignoré.");
    }

    // ----- getRandomAssetData (Inchangé mais fonctionne pour 'skyscraper') -----
	getRandomAssetData(type) {
        // Ne retourne rien pour le type 'house' car ils sont générés procéduralement
        if (type === 'house') {
            return null; // Les maisons ne sont plus basées sur des assets chargés
        }

        // Logique existante pour les autres types
        const modelList = this.assets[type];
        if (!modelList || modelList.length === 0) {
            // console.warn(`Aucun asset chargé pour le type '${type}'.`);
            return null;
        }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    // ----- getAssetDataById (Inchangé mais fonctionne pour 'skyscraper') -----
	getAssetDataById(id) {
		// Ne cherche pas le type 'house'
		if (id && id.startsWith('house_')) {
			return null; // Les maisons ne sont plus basées sur des assets chargés
		}
		// Logique existante pour les autres types
		for (const type in this.assets) {
			 if (type === 'house') continue; // <- IGNORER le type 'house'
			 if (this.assets.hasOwnProperty(type)) {
				const found = this.assets[type].find(asset => asset.id === id);
				if (found) return found;
			}
		}
		return null;
	}

    // ----- loadAssets MODIFIÉ -----
    async loadAssets() {
        console.log("Chargement des assets (MAISONS IGNORÉES)...");
        this.reset();

        // Fonction interne createLoadPromises (MODIFIÉE pour ignorer 'house')
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => {
           // *** AJOUT : Ignorer le type 'house' DANS la fonction helper ***
           if (type === 'house') {
               // console.log(` -> Chargement ignoré pour le type 'house'.`); // Log optionnel
               return []; // Retourne un tableau de promesses vide
           }
           // *** FIN AJOUT ***

           if (!assetConfigs || !dir || !type || width == null || height == null || depth == null) {
                console.warn(`Configuration incomplète ou invalide pour le type '${type}', chargement ignoré.`);
                return [];
            }
           if (!Array.isArray(assetConfigs)) {
                console.warn(`'${type}ModelFiles' n'est pas un tableau dans la config. Chargement ignoré.`);
                return [];
            }
            return assetConfigs.map(assetConfig => {
                    if (typeof assetConfig !== 'object' || assetConfig === null || !assetConfig.file) {
                        console.error(`Format de configuration d'asset invalide pour le type ${type}:`, assetConfig, ` dans ${dir}`);
                        return Promise.resolve(null); // Résoudre avec null pour ne pas bloquer Promise.all
                    }
                    const fileName = assetConfig.file;
                    const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1;
                    // Appel à loadAssetModel qui ignore aussi 'house'
                    return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale)
                        .catch(error => {
                            console.error(`Echec chargement ${type} ${fileName}:`, error);
                            return null; // Retourner null en cas d'erreur pour ne pas bloquer Promise.all
                        });
                }
            );
        };

        // Créer les promesses pour les autres types (l'appel pour 'house' retournera [])
        const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const buildingPromises = createLoadPromises(this.config.buildingModelFiles, this.config.buildingModelDir, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth);
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);
        const parkPromises = createLoadPromises(this.config.parkModelFiles, this.config.parkModelDir, 'park', this.config.parkBaseWidth, this.config.parkBaseHeight, this.config.parkBaseDepth);
        const treePromises = createLoadPromises(this.config.treeModelFiles, this.config.treeModelDir, 'tree', this.config.treeBaseWidth, this.config.treeBaseHeight, this.config.treeBaseDepth);
        const skyscraperPromises = createLoadPromises(this.config.skyscraperModelFiles, this.config.skyscraperModelDir, 'skyscraper', this.config.skyscraperBaseWidth, this.config.skyscraperBaseHeight, this.config.skyscraperBaseDepth);


        try {
            // Attendre toutes les promesses (houseResults sera toujours [])
            const [houseResults, buildingResults, industrialResults, parkResults, treeResults, skyscraperResults] = await Promise.all([
                 Promise.all(housePromises), // Attendre même si vide
                 Promise.all(buildingPromises),
                 Promise.all(industrialPromises),
                 Promise.all(parkPromises),
                 Promise.all(treePromises),
                 Promise.all(skyscraperPromises)
            ]);

            // Assigner les résultats (en filtrant les nulls et en s'assurant que house est vide)
            this.assets.house = []; // Assurer que c'est vide
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null);
            this.assets.tree = treeResults.filter(r => r !== null);
            this.assets.skyscraper = skyscraperResults.filter(r => r !== null);

            console.log(`Assets chargés (MAISONS IGNORÉES): ${this.assets.building.length} immeubles, ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs, ${this.assets.tree.length} arbres, ${this.assets.skyscraper.length} gratte-ciels.`);
            return this.assets;

        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset(); // Assure un état propre
            return this.assets; // Retourne l'état potentiellement vide
        }
    }

    // ----- reset (MODIFIÉ pour s'assurer que 'house' est bien dans la structure) -----
    reset() {
        this.disposeAssets();
        // S'assurer que la clé 'house' existe, même vide
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
        this.assetIdCounter = 0;
    }

    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1) {
		// *** AJOUT : Ignorer le type 'house' ici aussi ***
		if (type === 'house') {
			return Promise.resolve(null);
		}
		
		// *** NOUVELLE CONDITION POUR LES GRATTE‑CIELS ***
		if (type === 'skyscraper') {
			return new Promise((resolve) => {
				try {
					const asset = this.generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale);
					resolve(asset);
				} catch (error) {
					console.error(`Erreur lors de la génération du gratte-ciel procédural:`, error);
					resolve(null);
				}
			});
		}
	
		// --- Reste de la fonction inchangée ---
		const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
		const extension = path.split('.').pop()?.toLowerCase();
		return new Promise((resolve, reject) => {
			let loader;
			if (extension === 'fbx') { loader = this.fbxLoader; }
			else if (extension === 'glb' || extension === 'gltf') { loader = this.gltfLoader; }
			else {
				console.error(`[${modelId}] Format de fichier non supporté: ${extension} pour ${path}. Asset ignoré.`);
				return resolve(null);
			}
			loader.load(
				path,
				(loadedObject) => {
					let mergedGeometry = null;
					const geometries = [];
					try {
						const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;
						if (!modelRootObject) {
							console.error(`[${modelId}] Aucun objet racine trouvé dans ${path}. Asset ignoré.`);
							return resolve(null);
						}
						const materials = [];
						let hasValidMesh = false;
						modelRootObject.traverse((child) => {
							if (child.isMesh) {
								if (child.geometry && child.geometry.attributes.position) {
									hasValidMesh = true;
									child.updateMatrixWorld(true);
									const clonedGeom = child.geometry.clone();
									clonedGeom.applyMatrix4(child.matrixWorld);
									geometries.push(clonedGeom);
									if (child.material) {
										const mats = Array.isArray(child.material) ? child.material : [child.material];
										mats.forEach(m => { if (m && m.isMaterial) { materials.push(m); } });
									}
									child.castShadow = true; 
									child.receiveShadow = true;
								} else {
									console.warn(`[${modelId}] Mesh enfant ignoré car géométrie invalide ou manquante dans ${path}`);
								}
							}
						});
						if (!hasValidMesh) {
							console.error(`[${modelId}] Aucune géométrie de mesh valide trouvée dans ${path}. Asset ignoré.`);
							return resolve(null);
						}
						if (geometries.length === 0) {
							console.error(`[${modelId}] Aucune géométrie collectée dans ${path}. Asset ignoré.`);
							return resolve(null);
						}
						mergedGeometry = mergeGeometries(geometries, false);
						if (!mergedGeometry) {
							console.error(`[${modelId}] Echec de la fusion des géométries pour ${path}. Asset ignoré.`);
							geometries.forEach(g => g.dispose());
							return resolve(null);
						}
						mergedGeometry.center();
						mergedGeometry.computeBoundingBox();
						const bbox = mergedGeometry.boundingBox;
						if (!bbox) {
							console.error(`[${modelId}] Echec calcul BBox pour ${path}. Asset ignoré.`);
							mergedGeometry.dispose();
							geometries.forEach(g => g.dispose());
							return resolve(null);
						}
						let hasNaN = false;
						const positions = mergedGeometry.attributes.position.array;
						for (let i = 0; i < positions.length; i++) {
							if (isNaN(positions[i])) {
								hasNaN = true;
								break;
							}
						}
						if (hasNaN) {
							console.error(`!!!!!! [${modelId}] ERREUR NaN détectée dans les positions des vertices APRES fusion/centrage pour ${path}. Cet asset sera ignoré. !!!!!!`);
							mergedGeometry.dispose();
							geometries.forEach(g => g.dispose());
							return resolve(null);
						}
						const size = new THREE.Vector3();
						bbox.getSize(size);
						const centerOffset = new THREE.Vector3();
						bbox.getCenter(centerOffset);
						size.x = Math.max(size.x, 0.001);
						size.y = Math.max(size.y, 0.001);
						size.z = Math.max(size.z, 0.001);
						const fittingScaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);
						const sizeAfterFitting = size.clone().multiplyScalar(fittingScaleFactor);
						let baseMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
						if (!baseMaterial || !baseMaterial.isMaterial) { 
							baseMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
						}
						const finalMaterial = baseMaterial.clone();
						if (!finalMaterial.color) { finalMaterial.color = new THREE.Color(0xcccccc); }
						finalMaterial.name = `AssetMat_${modelId}`;
						resolve({
							id: modelId,
							geometry: mergedGeometry,
							material: finalMaterial,
							fittingScaleFactor: fittingScaleFactor,
							userScale: userScale,
							centerOffset: centerOffset,
							sizeAfterFitting: sizeAfterFitting
						});
						geometries.forEach(g => g.dispose());
					} catch (processingError) {
						console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
						geometries?.forEach(g => g?.dispose());
						if (mergedGeometry) mergedGeometry.dispose();
						resolve(null);
					}
				},
				undefined,
				(error) => {
					console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelId}]:`, error);
					resolve(null);
				}
			);
		});
	}

	generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale = 1) {
		// Création d'un modèle procédural de gratte‑ciel basé sur le code récupéré sur internet
		const skyscraper = new THREE.Group();
	
		// Matériaux
		const structureMaterial = new THREE.MeshStandardMaterial({ color: 0xced4da, flatShading: true });
		const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xadb5bd, flatShading: true });
		const windowMaterial = new THREE.MeshPhysicalMaterial({
			color: 0x60a3bc,
			metalness: 0.1,
			roughness: 0.05,
			transmission: 0.9,
			thickness: 0.3,
			ior: 1.5,
			flatShading: true,
		});
		const metallicMaterial = new THREE.MeshStandardMaterial({ color: 0xadb5bd, metalness: 0.9, roughness: 0.4, flatShading: true, side: THREE.DoubleSide });
		const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true });
	
		// --- Dimensions générales ---
		const mainWidth = 9, mainDepth = 9, mainHeight = 30;
		const baseHeightLocal = 2.5, intermediateStructureHeight = 1.0;
		const intermediateOverhang = 0.5, pillarThickness = 0.4;
		const windowInset = 0.05, intermediateBandThickness = pillarThickness, floorThickness = 0.1;
	
		// --- Base ---
		const baseGeometry = new THREE.BoxGeometry(mainWidth, baseHeightLocal, mainDepth);
		const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
		baseMesh.position.y = baseHeightLocal / 2;
		baseMesh.castShadow = true; baseMesh.receiveShadow = true;
		skyscraper.add(baseMesh);
	
		// --- Entrées/Portes de la Base ---
		const doorHeight = baseHeightLocal;
		const doorWidthFactor = 0.5;
		const originalBaseWindowPanelWidth = (mainWidth - 3 * pillarThickness) / 2;
		const doorWidth = originalBaseWindowPanelWidth * doorWidthFactor;
		const doorPanelDepth = (pillarThickness * 0.8) / 2;
		if (doorWidth > 0) {
			const doorGeomX = new THREE.BoxGeometry(doorWidth, doorHeight, doorPanelDepth);
			const doorCenterX = doorWidth * 0.75;
			for (let i = 0; i < 2; i++) {
				const zPos = (mainDepth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
				const doorLeft = new THREE.Mesh(doorGeomX, windowMaterial);
				doorLeft.position.set(-doorCenterX, doorHeight / 2, zPos);
				doorLeft.castShadow = true; skyscraper.add(doorLeft);
				const doorRight = new THREE.Mesh(doorGeomX, windowMaterial);
				doorRight.position.set(doorCenterX, doorHeight / 2, zPos);
				doorRight.castShadow = true; skyscraper.add(doorRight);
			}
		}
		const originalBaseSideWindowPanelWidth = (mainDepth - 3 * pillarThickness) / 2;
		const sideDoorWidth = originalBaseSideWindowPanelWidth * doorWidthFactor;
		if (sideDoorWidth > 0) {
			const doorGeomZ = new THREE.BoxGeometry(doorPanelDepth, doorHeight, sideDoorWidth);
			const doorCenterZ = sideDoorWidth * 0.75;
			for (let i = 0; i < 2; i++) {
				const xPos = (mainWidth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
				const doorBack = new THREE.Mesh(doorGeomZ, windowMaterial);
				doorBack.position.set(xPos, doorHeight / 2, -doorCenterZ);
				doorBack.castShadow = true; skyscraper.add(doorBack);
				const doorFront = new THREE.Mesh(doorGeomZ, windowMaterial);
				doorFront.position.set(xPos, doorHeight / 2, doorCenterZ);
				doorFront.castShadow = true; skyscraper.add(doorFront);
			}
		}
	
		// --- Structure Intermédiaire ---
		const intermediateWidth = mainWidth + 2 * intermediateOverhang;
		const intermediateDepth = mainDepth + 2 * intermediateOverhang;
		const intermediateGeometry = new THREE.BoxGeometry(intermediateWidth, intermediateStructureHeight, intermediateDepth);
		const intermediateMesh = new THREE.Mesh(intermediateGeometry, baseMaterial);
		intermediateMesh.position.y = baseHeightLocal + intermediateStructureHeight / 2;
		intermediateMesh.castShadow = true; intermediateMesh.receiveShadow = true;
		skyscraper.add(intermediateMesh);
	
		// --- Corps Principal ---
		const startY = baseHeightLocal + intermediateStructureHeight;
		const numFloors = 9;
		const floorHeight = mainHeight / numFloors;
		const structureHeight = mainHeight;
		const numWindowsPerFace = 4;
		const numIntermediateBands = numWindowsPerFace - 1;
		const horizontalBandHeight = pillarThickness * 0.5;
		const windowHeightVal = floorHeight - horizontalBandHeight;
		const cornerPillarGeom = new THREE.BoxGeometry(pillarThickness, structureHeight, pillarThickness);
		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				const pillar = new THREE.Mesh(cornerPillarGeom, structureMaterial);
				pillar.position.set((mainWidth / 2) * (i === 0 ? -1 : 1), startY + structureHeight / 2, (mainDepth / 2) * (j === 0 ? -1 : 1));
				pillar.castShadow = true; pillar.receiveShadow = true;
				skyscraper.add(pillar);
			}
		}
		const totalSpanX = mainWidth - pillarThickness;
		const totalSpanZ = mainDepth - pillarThickness;
		const totalIntermediateBandWidthX = numIntermediateBands * intermediateBandThickness;
		const totalIntermediateBandWidthZ = numIntermediateBands * intermediateBandThickness;
		const totalWindowWidthX = totalSpanX - totalIntermediateBandWidthX;
		const totalWindowWidthZ = totalSpanZ - totalIntermediateBandWidthZ;
		const singleWindowWidthX = totalWindowWidthX / numWindowsPerFace;
		const singleWindowWidthZ = totalWindowWidthZ / numWindowsPerFace;
		const windowGeomX = new THREE.BoxGeometry(singleWindowWidthX, windowHeightVal, pillarThickness * 0.9);
		const windowGeomZ = new THREE.BoxGeometry(pillarThickness * 0.9, windowHeightVal, singleWindowWidthZ);
		for (let floor = 0; floor < numFloors; floor++) {
			const yPosWindowCenter = startY + floor * floorHeight + horizontalBandHeight / 2 + windowHeightVal / 2;
			for (let win = 0; win < numWindowsPerFace; win++) {
				const xPos = (-mainWidth / 2 + pillarThickness / 2) + win * intermediateBandThickness + win * singleWindowWidthX + singleWindowWidthX / 2;
				const zPos = (-mainDepth / 2 + pillarThickness / 2) + win * intermediateBandThickness + win * singleWindowWidthZ + singleWindowWidthZ / 2;
				const windowFront = new THREE.Mesh(windowGeomX, windowMaterial);
				windowFront.position.set(xPos, yPosWindowCenter, mainDepth / 2 - windowInset);
				windowFront.castShadow = true; skyscraper.add(windowFront);
				const windowBack = new THREE.Mesh(windowGeomX, windowMaterial);
				windowBack.position.set(xPos, yPosWindowCenter, -mainDepth / 2 + windowInset);
				windowBack.castShadow = true; skyscraper.add(windowBack);
				const windowRight = new THREE.Mesh(windowGeomZ, windowMaterial);
				windowRight.position.set(mainWidth / 2 - windowInset, yPosWindowCenter, zPos);
				windowRight.castShadow = true; skyscraper.add(windowRight);
				const windowLeft = new THREE.Mesh(windowGeomZ, windowMaterial);
				windowLeft.position.set(-mainWidth / 2 + windowInset, yPosWindowCenter, zPos);
				windowLeft.castShadow = true; skyscraper.add(windowLeft);
			}
		}
		// --- Bandes Verticales ---
		const verticalBandGeomX = new THREE.BoxGeometry(intermediateBandThickness, structureHeight, pillarThickness);
		const verticalBandGeomZ = new THREE.BoxGeometry(pillarThickness, structureHeight, intermediateBandThickness);
		const yPosBandVert = startY + structureHeight / 2;
		for (let i = 0; i < numIntermediateBands; i++) {
			const xPosBand = (-mainWidth / 2 + pillarThickness / 2) + (i + 1) * singleWindowWidthX + i * intermediateBandThickness + intermediateBandThickness / 2;
			const zPosBand = (-mainDepth / 2 + pillarThickness / 2) + (i + 1) * singleWindowWidthZ + i * intermediateBandThickness + intermediateBandThickness / 2;
			const bandFrontVert = new THREE.Mesh(verticalBandGeomX, structureMaterial);
			bandFrontVert.position.set(xPosBand, yPosBandVert, mainDepth / 2);
			bandFrontVert.castShadow = true; bandFrontVert.receiveShadow = true;
			skyscraper.add(bandFrontVert);
			const bandBackVert = new THREE.Mesh(verticalBandGeomX, structureMaterial);
			bandBackVert.position.set(xPosBand, yPosBandVert, -mainDepth / 2);
			bandBackVert.castShadow = true; bandBackVert.receiveShadow = true;
			skyscraper.add(bandBackVert);
			const bandRightVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial);
			bandRightVert.position.set(mainWidth / 2, yPosBandVert, zPosBand);
			bandRightVert.castShadow = true; bandRightVert.receiveShadow = true;
			skyscraper.add(bandRightVert);
			const bandLeftVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial);
			bandLeftVert.position.set(-mainWidth / 2, yPosBandVert, zPosBand);
			bandLeftVert.castShadow = true; bandLeftVert.receiveShadow = true;
			skyscraper.add(bandLeftVert);
		}
		// --- Bandes Horizontales ---
		const horizontalBandGeomX = new THREE.BoxGeometry(mainWidth, horizontalBandHeight, pillarThickness);
		const horizontalBandGeomZ = new THREE.BoxGeometry(pillarThickness, horizontalBandHeight, mainDepth);
		for (let floor = 0; floor <= numFloors; floor++) {
			const yPosBand = startY + floor * floorHeight;
			const bandFront = new THREE.Mesh(horizontalBandGeomX, structureMaterial);
			bandFront.position.set(0, yPosBand, mainDepth / 2);
			skyscraper.add(bandFront);
			const bandBack = new THREE.Mesh(horizontalBandGeomX, structureMaterial);
			bandBack.position.set(0, yPosBand, -mainDepth / 2);
			skyscraper.add(bandBack);
			const bandRight = new THREE.Mesh(horizontalBandGeomZ, structureMaterial);
			bandRight.position.set(mainWidth / 2, yPosBand, 0);
			skyscraper.add(bandRight);
			const bandLeft = new THREE.Mesh(horizontalBandGeomZ, structureMaterial);
			bandLeft.position.set(-mainWidth / 2, yPosBand, 0);
			skyscraper.add(bandLeft);
		}
		// --- Sols intérieurs ---
		const floorGeometry = new THREE.BoxGeometry(mainWidth - pillarThickness, floorThickness, mainDepth - pillarThickness);
		for (let floor = 0; floor < numFloors; floor++) {
			const yPosFloor = startY + floor * floorHeight + floorThickness / 2;
			const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
			floorMesh.position.set(0, yPosFloor, 0);
			floorMesh.receiveShadow = true;
			skyscraper.add(floorMesh);
		}
		// --- Toit ---
		const roofHeightVal = 1.5;
		const roofGeom = new THREE.BoxGeometry(mainWidth, roofHeightVal, mainDepth);
		const roofMesh = new THREE.Mesh(roofGeom, baseMaterial);
		roofMesh.position.y = startY + mainHeight + roofHeightVal / 2;
		roofMesh.castShadow = true; roofMesh.receiveShadow = true;
		skyscraper.add(roofMesh);
		// --- Détails sur le Toit ---
		const roofTopY = roofMesh.position.y + roofHeightVal / 2;
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
		dish.position.x = dishStand.position.x;
		dish.position.z = dishStand.position.z;
		dish.position.y = dishStand.position.y + dishStandHeight / 2 + dishRadius * 0.3;
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
	
		// --- Fusion des géométries du groupe ---
		const geometries = [];
		skyscraper.traverse(child => {
			if (child.isMesh && child.geometry) {
				child.updateMatrixWorld(true);
				const clonedGeom = child.geometry.clone();
				clonedGeom.applyMatrix4(child.matrixWorld);
				geometries.push(clonedGeom);
			}
		});
		if (geometries.length === 0) {
			console.error("Aucune géométrie collectée pour le gratte-ciel procédural.");
			return null;
		}
		const mergedGeometry = mergeGeometries(geometries, false);
		if (!mergedGeometry) {
			console.error("Échec de la fusion des géométries du gratte-ciel procédural.");
			geometries.forEach(g => g.dispose());
			return null;
		}
		mergedGeometry.center();
		mergedGeometry.computeBoundingBox();
		const bbox = mergedGeometry.boundingBox;
		if (!bbox) {
			console.error("Échec du calcul de la bounding box du gratte-ciel procédural.");
			mergedGeometry.dispose();
			geometries.forEach(g => g.dispose());
			return null;
		}
		const size = new THREE.Vector3();
		bbox.getSize(size);
		const centerOffset = new THREE.Vector3();
		bbox.getCenter(centerOffset);
		size.x = Math.max(size.x, 0.001);
		size.y = Math.max(size.y, 0.001);
		size.z = Math.max(size.z, 0.001);
		const fittingScaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);
		const sizeAfterFitting = size.clone().multiplyScalar(fittingScaleFactor);
	
		const asset = {
			id: `skyscraper_procedural_${this.assetIdCounter++}`,
			geometry: mergedGeometry,
			material: baseMaterial.clone(), // Vous pouvez ajuster le choix du matériau ici si besoin
			fittingScaleFactor: fittingScaleFactor,
			userScale: userScale,
			centerOffset: centerOffset,
			sizeAfterFitting: sizeAfterFitting
		};
	
		// Nettoyage des géométries temporaires
		geometries.forEach(g => g.dispose());
		return asset;
	}	

     // ----- disposeAssets (MODIFIÉ pour s'assurer que 'house' est dans la boucle mais sera vide) -----
     disposeAssets() {
        console.log("Disposition des assets chargés (ignorera 'house' car vide)...");
        let disposedGeometries = 0; let disposedMaterials = 0;
        // Itérer sur TOUS les types (y compris 'house' qui sera vide)
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.geometry && typeof assetData.geometry.dispose === 'function') { assetData.geometry.dispose(); disposedGeometries++; }
                if (assetData.material && typeof assetData.material.dispose === 'function') { assetData.material.dispose(); disposedMaterials++; }
            });
            this.assets[type] = []; // Vider
        });
         if (disposedGeometries > 0 || disposedMaterials > 0) { console.log(`  - ${disposedGeometries} géometries et ${disposedMaterials} matériaux disposés.`); }
         this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] }; // Assurer état propre
    }
}