// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
	// ----- CONSTRUCTEUR (Inchangé, mais montré pour contexte) -----
	constructor(config) {
        this.config = config;
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();
        this.assets = {
            house: [],
            building: [], // Sera peuplé par la fonction procédurale maintenant
            industrial: [],
            park: [],
            tree: [],
            skyscraper: []
        };
        this.assetIdCounter = 0;
        console.log("CityAssetLoader initialisé. Le chargement des maisons ('house') sera ignoré. Le chargement des immeubles ('building') sera remplacé par du procédural.");
    }

    // ----- getRandomAssetData (Inchangé mais fonctionne pour 'building' procédural) -----
	getRandomAssetData(type) {
        // Ne retourne rien pour le type 'house' car ils sont générés procéduralement
        if (type === 'house') {
            return null;
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

    // ----- getAssetDataById (Inchangé mais fonctionne pour 'building' procédural) -----
	getAssetDataById(id) {
		// Ne cherche pas le type 'house'
		if (id && id.startsWith('house_')) {
			return null;
		}
		// Logique existante pour les autres types
		for (const type in this.assets) {
			 if (type === 'house') continue;
			 if (this.assets.hasOwnProperty(type)) {
				const found = this.assets[type].find(asset => asset.id === id);
				if (found) return found;
			}
		}
		return null;
	}

	// ----- loadAssets (Inchangé, appelle loadAssetModel qui gère le procédural) -----
    async loadAssets() {
        console.log("Chargement des assets (MAISONS IGNORÉES, IMMEUBLES PROCÉDURAUX)...");
        this.reset();

        // Fonction interne createLoadPromises (MODIFIÉE pour ignorer 'house' et appeler loadAssetModel pour 'building')
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => {
           // Ignorer le type 'house'
           if (type === 'house') {
               return [];
           }
           // Si c'est 'building', assetConfigs n'est pas utilisé, on génère juste une promesse pour le procédural
           if (type === 'building') {
                console.log(` -> Préparation de la génération procédurale pour le type '${type}'...`);
                // On crée une seule promesse qui appelle loadAssetModel SANS path spécifique
                // loadAssetModel détectera le type 'building' et lancera la génération.
                return [this.loadAssetModel(null, type, width, height, depth, 1.0)
                        .catch(error => {
                            console.error(`Echec génération procédurale ${type}:`, error);
                            return null;
                        })];
           }

           // Logique existante pour les autres types (industrial, park, tree, skyscraper)
           if (!assetConfigs || !dir || !type || width == null || height == null || depth == null) {
                console.warn(`Configuration incomplète ou invalide pour le type '${type}', chargement ignoré.`);
                return [];
            }
           if (!Array.isArray(assetConfigs)) {
                console.warn(`'${type}ModelFiles' n'est pas un tableau dans la config. Chargement ignoré.`);
                return [];
            }
            return assetConfigs.map(assetConfig => {
                    // ... (logique inchangée pour charger les fichiers FBX/GLB des autres types) ...
                    if (typeof assetConfig !== 'object' || assetConfig === null || !assetConfig.file) {
                        console.error(`Format de configuration d'asset invalide pour le type ${type}:`, assetConfig, ` dans ${dir}`);
                        return Promise.resolve(null); // Résoudre avec null pour ne pas bloquer Promise.all
                    }
                    const fileName = assetConfig.file;
                    const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1;
                    // Appel à loadAssetModel
                    return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale)
                        .catch(error => {
                            console.error(`Echec chargement ${type} ${fileName}:`, error);
                            return null; // Retourner null en cas d'erreur pour ne pas bloquer Promise.all
                        });
                }
            );
        };

        // Créer les promesses (buildingPromises contiendra une seule promesse procédurale)
        const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const buildingPromises = createLoadPromises(null, null, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth); // Pas besoin de config spécifique ici
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);
        const parkPromises = createLoadPromises(this.config.parkModelFiles, this.config.parkModelDir, 'park', this.config.parkBaseWidth, this.config.parkBaseHeight, this.config.parkBaseDepth);
        const treePromises = createLoadPromises(this.config.treeModelFiles, this.config.treeModelDir, 'tree', this.config.treeBaseWidth, this.config.treeBaseHeight, this.config.treeBaseDepth);
        const skyscraperPromises = createLoadPromises(this.config.skyscraperModelFiles, this.config.skyscraperModelDir, 'skyscraper', this.config.skyscraperBaseWidth, this.config.skyscraperBaseHeight, this.config.skyscraperBaseDepth);


        try {
            // Attendre toutes les promesses
            const [houseResults, buildingResults, industrialResults, parkResults, treeResults, skyscraperResults] = await Promise.all([
                 Promise.all(housePromises),
                 Promise.all(buildingPromises), // Attendre le résultat de la génération procédurale
                 Promise.all(industrialPromises),
                 Promise.all(parkPromises),
                 Promise.all(treePromises),
                 Promise.all(skyscraperPromises)
            ]);

            // Assigner les résultats (en filtrant les nulls)
            this.assets.house = []; // Assurer que c'est vide
            this.assets.building = buildingResults.filter(r => r !== null); // Devrait contenir 1 asset procédural si succès
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null);
            this.assets.tree = treeResults.filter(r => r !== null);
            this.assets.skyscraper = skyscraperResults.filter(r => r !== null);

            console.log(`Assets chargés (MAISONS IGNORÉES, IMMEUBLES PROCÉDURAUX): ${this.assets.building.length} immeubles (proc.), ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs, ${this.assets.tree.length} arbres, ${this.assets.skyscraper.length} gratte-ciels.`);
            return this.assets;

        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset();
            return this.assets;
        }
    }

    // ----- reset (MODIFIÉ pour inclure 'building' dans la structure vide) -----
    reset() {
        this.disposeAssets();
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
        this.assetIdCounter = 0;
    }

	// ----- loadAssetModel MODIFIÉ -----
	async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1) {
		// Ignorer 'house'
		if (type === 'house') {
			return Promise.resolve(null);
		}

		// Générer 'skyscraper' procéduralement
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

		// *** NOUVEAU: Générer 'building' procéduralement ***
		if (type === 'building') {
			return new Promise((resolve) => {
				try {
					const asset = this.generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale);
					resolve(asset); // Résout la promesse avec l'asset généré
				} catch (error) {
					console.error(`Erreur lors de la génération de l'immeuble procédural:`, error);
					resolve(null); // Résout avec null en cas d'erreur
				}
			});
		}
		// *** FIN NOUVEAU ***

		// --- Logique existante pour charger les autres types (industrial, park, tree) ---
		if (!path) { // Sécurité si path est null pour les types non procéduraux
			console.error(`[AssetLoader] Path manquant pour le type '${type}' (non procédural). Asset ignoré.`);
			return Promise.resolve(null);
		}
		const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
		const extension = path.split('.').pop()?.toLowerCase();
		return new Promise((resolve, reject) => {
			// ... (logique de chargement FBX/GLB inchangée pour industrial, park, tree) ...
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
					// ... (Traitement de l'objet chargé, fusion, centrage, mise à l'échelle inchangé) ...
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
						// ... Vérification NaN ...
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

    // ----- generateProceduralSkyscraper (Inchangé, fourni pour contexte) -----
    generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale = 1) {
        const skyscraper = new THREE.Group();

        // --- Matériaux (MODIFICATION ICI pour skyscraperWindowMaterial) ---
        const structureMaterial = new THREE.MeshStandardMaterial({ color: 0xced4da, flatShading: true, name: "SkyscraperStructureMat" });
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x6e7883, flatShading: true, name: "SkyscraperBaseMat" });
        const metallicMaterial = new THREE.MeshStandardMaterial({ color: 0xadb5bd, metalness: 0.9, roughness: 0.4, flatShading: true, side: THREE.DoubleSide, name: "SkyscraperMetallicMat" });
        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true, name: "SkyscraperFloorMat" });
        const skyscraperWindowMaterial = new THREE.MeshStandardMaterial({
            color: 0x60a3bc,
            metalness: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            flatShading: true,
            emissive: 0xfcffe0, // << AJOUT: Couleur émissive (peut être différente de la couleur de base)
            // emissiveIntensity: 0, // L'intensité initiale est gérée par PlotContentGenerator.update
            name: "SkyscraperWindowMat_Standard"
        });
        // -----------------------------------------------------------------

        // --- Dimensions générales ---
        const mainWidth = 9, mainDepth = 9, mainHeight = 30;
        const baseHeightVal = 2.5, intermediateStructureHeight = 1.0;
        const intermediateOverhang = 0.5;
        const windowHeightReductionFactor = 0.5;
        const windowWidthReductionFactor = 0.5;
        const doorHeightReductionFactor = 0.6;
        const doorWidthFactorAdjustment = 0.85;
        const pillarThickness = 0.4;
        const intermediateBandThickness = pillarThickness / windowWidthReductionFactor;
        const windowInset = 0.05;
        const floorThickness = 0.1;

        // --- Base ---
        const baseGeometry = new THREE.BoxGeometry(mainWidth, baseHeightVal, mainDepth);
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.position.y = baseHeightVal / 2;
        baseMesh.castShadow = true; baseMesh.receiveShadow = true;
        skyscraper.add(baseMesh);

        // --- Entrées/Portes Base ---
        const doorHeight = baseHeightVal * doorHeightReductionFactor;
        const doorWidthFactor = 0.5;
        const originalBaseWindowPanelWidth = (mainWidth - 3 * pillarThickness) / 2;
        const originalBaseSideWindowPanelWidth = (mainDepth - 3 * pillarThickness) / 2;
        const doorWidth = originalBaseWindowPanelWidth * doorWidthFactor * doorWidthFactorAdjustment;
        const sideDoorWidth = originalBaseSideWindowPanelWidth * doorWidthFactor * doorWidthFactorAdjustment;
        const doorPanelDepth = (pillarThickness * 0.8) / 2;
        let doorGeomX = null, doorGeomZ = null;
        if (doorWidth > 0.01 && doorHeight > 0.01) { /* ... portes avant/arrière ... */
            doorGeomX = new THREE.BoxGeometry(doorWidth, doorHeight, doorPanelDepth);
			const doorCenterX = doorWidth * 0.75;
			for (let i = 0; i < 2; i++) {
				const zPos = (mainDepth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
				const doorLeft = new THREE.Mesh(doorGeomX, skyscraperWindowMaterial); // Utilise le mat fenetre
				doorLeft.position.set(-doorCenterX, doorHeight / 2, zPos);
				doorLeft.castShadow = true; skyscraper.add(doorLeft);
				const doorRight = new THREE.Mesh(doorGeomX, skyscraperWindowMaterial); // Utilise le mat fenetre
				doorRight.position.set(doorCenterX, doorHeight / 2, zPos);
				doorRight.castShadow = true; skyscraper.add(doorRight);
			}
        }
        if (sideDoorWidth > 0.01 && doorHeight > 0.01) { /* ... portes latérales ... */
            doorGeomZ = new THREE.BoxGeometry(doorPanelDepth, doorHeight, sideDoorWidth);
			const doorCenterZ = sideDoorWidth * 0.75;
			for (let i = 0; i < 2; i++) {
				const xPos = (mainWidth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
				const doorBack = new THREE.Mesh(doorGeomZ, skyscraperWindowMaterial); // Utilise le mat fenetre
				doorBack.position.set(xPos, doorHeight / 2, -doorCenterZ);
				doorBack.castShadow = true; skyscraper.add(doorBack);
				const doorFront = new THREE.Mesh(doorGeomZ, skyscraperWindowMaterial); // Utilise le mat fenetre
				doorFront.position.set(xPos, doorHeight / 2, doorCenterZ);
				doorFront.castShadow = true; skyscraper.add(doorFront);
			}
        }

        // --- Structure Intermédiaire ---
		const intermediateWidth = mainWidth + 2 * intermediateOverhang;
		const intermediateDepth = mainDepth + 2 * intermediateOverhang;
		const intermediateGeometry = new THREE.BoxGeometry(intermediateWidth, intermediateStructureHeight, intermediateDepth);
		const intermediateMesh = new THREE.Mesh(intermediateGeometry, baseMaterial);
		intermediateMesh.position.y = baseHeightVal + intermediateStructureHeight / 2;
		intermediateMesh.castShadow = true; intermediateMesh.receiveShadow = true;
		skyscraper.add(intermediateMesh);

        // --- Corps Principal ---
        const startY = baseHeightVal + intermediateStructureHeight;
        const numFloors = 9; const floorHeight = mainHeight / numFloors; const structureHeight = mainHeight;
        const numWindowsPerFace = 4; const numIntermediateBands = numWindowsPerFace - 1;
        const windowHeightVal = floorHeight * windowHeightReductionFactor;
        const horizontalBandHeight = floorHeight - windowHeightVal;
        // Piliers coin
        const cornerPillarGeom = new THREE.BoxGeometry(pillarThickness + 0.7, structureHeight + 7, pillarThickness + 0.7);
		for (let i = 0; i < 2; i++) { for (let j = 0; j < 2; j++) { /* ... piliers ... */
            const pillar = new THREE.Mesh(cornerPillarGeom, structureMaterial);
			pillar.position.set((mainWidth / 2) * (i === 0 ? -1 : 1), startY + structureHeight / 2, (mainDepth / 2) * (j === 0 ? -1 : 1));
			pillar.castShadow = true; pillar.receiveShadow = true; skyscraper.add(pillar);
        } }
        // Calculs fenêtres
        const totalSpanX = mainWidth - pillarThickness; const totalSpanZ = mainDepth - pillarThickness;
		const totalIntermediateBandWidthX = numIntermediateBands * intermediateBandThickness; const totalIntermediateBandWidthZ = numIntermediateBands * intermediateBandThickness;
		const totalWindowWidthX = Math.max(0, totalSpanX - totalIntermediateBandWidthX); const totalWindowWidthZ = Math.max(0, totalSpanZ - totalIntermediateBandWidthZ);
		const singleWindowWidthX = numWindowsPerFace > 0 ? totalWindowWidthX / numWindowsPerFace : 0; const singleWindowWidthZ = numWindowsPerFace > 0 ? totalWindowWidthZ / numWindowsPerFace : 0;
        // Géométries fenêtres
        const windowGeomX = singleWindowWidthX > 0.01 && windowHeightVal > 0.01 ? new THREE.BoxGeometry(singleWindowWidthX, windowHeightVal, pillarThickness * 0.9) : null;
        const windowGeomZ = singleWindowWidthZ > 0.01 && windowHeightVal > 0.01 ? new THREE.BoxGeometry(pillarThickness * 0.9, windowHeightVal, singleWindowWidthZ) : null;
        // Placement fenêtres
        if (windowGeomX || windowGeomZ) { for (let floor = 0; floor < numFloors; floor++) { /* ... boucle fenêtres ... */
            const floorBaseY = startY + floor * floorHeight;
            const yPosWindowCenter = floorBaseY + horizontalBandHeight + (windowHeightVal / 2);
            for (let win = 0; win < numWindowsPerFace; win++) {
                const xPos = (-mainWidth / 2 + pillarThickness / 2) + win * intermediateBandThickness + win * singleWindowWidthX + singleWindowWidthX / 2;
                const zPos = (-mainDepth / 2 + pillarThickness / 2) + win * intermediateBandThickness + win * singleWindowWidthZ + singleWindowWidthZ / 2;
                if (windowGeomX) { /* ... fenêtres X ... */
                    const windowFront = new THREE.Mesh(windowGeomX, skyscraperWindowMaterial);
                    windowFront.position.set(xPos, yPosWindowCenter, mainDepth / 2 - windowInset);
                    windowFront.castShadow = true; skyscraper.add(windowFront);
                    const windowBack = new THREE.Mesh(windowGeomX, skyscraperWindowMaterial);
                    windowBack.position.set(xPos, yPosWindowCenter, -mainDepth / 2 + windowInset);
                    windowBack.castShadow = true; skyscraper.add(windowBack);
                 }
                if (windowGeomZ) { /* ... fenêtres Z ... */
                    const windowRight = new THREE.Mesh(windowGeomZ, skyscraperWindowMaterial);
                    windowRight.position.set(mainWidth / 2 - windowInset, yPosWindowCenter, zPos);
                    windowRight.castShadow = true; skyscraper.add(windowRight);
                    const windowLeft = new THREE.Mesh(windowGeomZ, skyscraperWindowMaterial);
                    windowLeft.position.set(-mainWidth / 2 + windowInset, yPosWindowCenter, zPos);
                    windowLeft.castShadow = true; skyscraper.add(windowLeft);
                 }
            }
        } }
        // Bandes verticales
        const verticalBandGeomX = intermediateBandThickness > 0.01 ? new THREE.BoxGeometry(intermediateBandThickness, structureHeight, pillarThickness) : null;
		const verticalBandGeomZ = intermediateBandThickness > 0.01 ? new THREE.BoxGeometry(pillarThickness, structureHeight, intermediateBandThickness) : null;
		const yPosBandVert = startY + structureHeight / 2;
		if (verticalBandGeomX && verticalBandGeomZ && singleWindowWidthX > 0.01 && singleWindowWidthZ > 0.01 && numIntermediateBands > 0){ for (let i = 0; i < numIntermediateBands; i++) { /* ... bandes verticales ... */
            const xPosBand = (-mainWidth / 2 + pillarThickness / 2) + (i + 1) * singleWindowWidthX + i * intermediateBandThickness + intermediateBandThickness / 2;
            const zPosBand = (-mainDepth / 2 + pillarThickness / 2) + (i + 1) * singleWindowWidthZ + i * intermediateBandThickness + intermediateBandThickness / 2;
            const bandFrontVert = new THREE.Mesh(verticalBandGeomX, structureMaterial); bandFrontVert.position.set(xPosBand, yPosBandVert, mainDepth / 2); bandFrontVert.castShadow = true; bandFrontVert.receiveShadow = true; skyscraper.add(bandFrontVert);
            const bandBackVert = new THREE.Mesh(verticalBandGeomX, structureMaterial); bandBackVert.position.set(xPosBand, yPosBandVert, -mainDepth / 2); bandBackVert.castShadow = true; bandBackVert.receiveShadow = true; skyscraper.add(bandBackVert);
            const bandRightVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial); bandRightVert.position.set(mainWidth / 2, yPosBandVert, zPosBand); bandRightVert.castShadow = true; bandRightVert.receiveShadow = true; skyscraper.add(bandRightVert);
            const bandLeftVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial); bandLeftVert.position.set(-mainWidth / 2, yPosBandVert, zPosBand); bandLeftVert.castShadow = true; bandLeftVert.receiveShadow = true; skyscraper.add(bandLeftVert);
        } }
        // Bandes horizontales
        const horizontalBandGeomX = horizontalBandHeight > 0.01 ? new THREE.BoxGeometry(mainWidth, horizontalBandHeight, pillarThickness) : null;
		const horizontalBandGeomZ = horizontalBandHeight > 0.01 ? new THREE.BoxGeometry(pillarThickness, horizontalBandHeight, mainDepth) : null;
		for (let floor = 0; floor <= numFloors; floor++) { /* ... bandes horizontales ... */
            const bandBaseY = startY + floor * floorHeight;
			const yPosBandCenter = bandBaseY + horizontalBandHeight / 2;
            if (horizontalBandGeomX) {
                const bandFront = new THREE.Mesh(horizontalBandGeomX, structureMaterial); bandFront.position.set(0, yPosBandCenter, mainDepth / 2); skyscraper.add(bandFront);
                const bandBack = new THREE.Mesh(horizontalBandGeomX, structureMaterial); bandBack.position.set(0, yPosBandCenter, -mainDepth / 2); skyscraper.add(bandBack);
            }
            if (horizontalBandGeomZ) {
                const bandRight = new THREE.Mesh(horizontalBandGeomZ, structureMaterial); bandRight.position.set(mainWidth / 2, yPosBandCenter, 0); skyscraper.add(bandRight);
                const bandLeft = new THREE.Mesh(horizontalBandGeomZ, structureMaterial); bandLeft.position.set(-mainWidth / 2, yPosBandCenter, 0); skyscraper.add(bandLeft);
            }
         }
        // Sols intérieurs
        const floorGeometry = new THREE.BoxGeometry(mainWidth - pillarThickness, floorThickness, mainDepth - pillarThickness);
		for (let floor = 0; floor < numFloors; floor++) { /* ... sols ... */
            const floorBaseY = startY + floor * floorHeight + horizontalBandHeight;
            const yPosFloor = floorBaseY + floorThickness / 2;
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.position.set(0, yPosFloor, 0);
            floorMesh.receiveShadow = true;
            skyscraper.add(floorMesh);
         }
        // Toit
        const roofHeightVal = 1.5; const roofGeom = new THREE.BoxGeometry(mainWidth, roofHeightVal, mainDepth); const roofMesh = new THREE.Mesh(roofGeom, baseMaterial); const roofBaseY = startY + numFloors * floorHeight + horizontalBandHeight; roofMesh.position.y = roofBaseY + roofHeightVal / 2; roofMesh.castShadow = true; roofMesh.receiveShadow = true; skyscraper.add(roofMesh);
        // Détails toit
        const roofTopY = roofBaseY + roofHeightVal;
		const antennaHeight = 3, antennaRadius = 0.1; const antennaGeom = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight, 8); /* ... antennes ... */
        const antenna1 = new THREE.Mesh(antennaGeom, metallicMaterial); antenna1.position.set(mainWidth * 0.3, roofTopY + antennaHeight / 2, mainDepth * 0.3); antenna1.castShadow = true; skyscraper.add(antenna1);
        const antenna2 = new THREE.Mesh(antennaGeom, metallicMaterial); antenna2.position.set(-mainWidth * 0.3, roofTopY + antennaHeight / 2, -mainDepth * 0.3); antenna2.castShadow = true; skyscraper.add(antenna2);
		const boxSize = 0.8; const boxGeom = new THREE.BoxGeometry(boxSize, boxSize * 0.5, boxSize); /* ... boîte toit ... */
        const roofBox1 = new THREE.Mesh(boxGeom, metallicMaterial); roofBox1.position.set(0, roofTopY + (boxSize * 0.5) / 2, -mainDepth * 0.2); roofBox1.castShadow = true; skyscraper.add(roofBox1);
		const dishRadius = 1.2; const dishDepth = Math.PI * 0.3; const dishThetaStart = Math.PI - dishDepth; const dishThetaLength = dishDepth; const dishGeometry = new THREE.SphereGeometry(dishRadius, 20, 10, 0, Math.PI * 2, dishThetaStart, dishThetaLength); /* ... antenne parabolique ... */
        const dish = new THREE.Mesh(dishGeometry, metallicMaterial); dish.rotation.x = Math.PI * 0.05; const dishStandHeight = 0.5; const dishStandGeom = new THREE.CylinderGeometry(0.1, 0.1, dishStandHeight, 8); const dishStand = new THREE.Mesh(dishStandGeom, metallicMaterial); dishStand.position.set(mainWidth * -0.25, roofTopY + dishStandHeight / 2, mainDepth * 0.2); dishStand.castShadow = true; skyscraper.add(dishStand); dish.position.copy(dishStand.position); dish.position.y = dishStand.position.y + dishStandHeight / 2 + dishRadius * 0.3 + 0.8; dish.castShadow = true; skyscraper.add(dish);
        const equipBoxGeom1 = new THREE.BoxGeometry(1.5, 0.8, 0.8); /* ... boite equip ... */
        const equipBox1 = new THREE.Mesh(equipBoxGeom1, metallicMaterial); equipBox1.position.set(mainWidth * 0.3, roofTopY + 0.8 / 2, -mainDepth * 0.3); equipBox1.castShadow = true; skyscraper.add(equipBox1);
        const equipCylGeom1 = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12); /* ... cylindre equip ... */
        const equipCyl1 = new THREE.Mesh(equipCylGeom1, metallicMaterial); equipCyl1.position.set(-mainWidth * 0.1, roofTopY + 1.2 / 2, mainDepth * 0.35); equipCyl1.castShadow = true; skyscraper.add(equipCyl1);


		// --- Regroupement par matériau ---
        // ... (logique inchangée pour regrouper les géométries par matériau dans materialMap) ...
        const allGeoms = []; const materialMap = new Map();
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
				if (groupData) { groupData.geoms.push(clonedGeom); }
                else { console.warn(`Matériau inconnu ou sans nom trouvé: ${matName || '[sans nom]'}`); }
			}
         });

        // Calcul BBox global et échelle
        // ... (logique inchangée pour calculer globalMerged, globalMin, globalCenter, globalSize, fittingScaleFactor, sizeAfterFitting) ...
        if (allGeoms.length === 0) { console.error("Aucune géométrie valide trouvée pour le gratte-ciel procédural."); return null; }
		const globalMerged = mergeGeometries(allGeoms, false);
		if (!globalMerged) { console.error("Échec de fusion globale pour le gratte‑ciel procédural."); allGeoms.forEach(g => g.dispose()); return null; }
		globalMerged.computeBoundingBox();
		const globalMin = globalMerged.boundingBox.min;
		const globalCenter = new THREE.Vector3(); globalMerged.boundingBox.getCenter(globalCenter);
		const globalSize = new THREE.Vector3(); globalMerged.boundingBox.getSize(globalSize);
		globalSize.x = Math.max(globalSize.x, 0.001); globalSize.y = Math.max(globalSize.y, 0.001); globalSize.z = Math.max(globalSize.z, 0.001);
		const fittingScaleFactor = Math.min( baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z );
		const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        // Création des 'parts' finales
        // ... (logique inchangée pour créer les 'parts' à partir de materialMap) ...
        const parts = [];
		materialMap.forEach((groupData, key) => {
            if (groupData.geoms.length === 0) return;
			const mergedPart = mergeGeometries(groupData.geoms, false);
			if (!mergedPart) { console.error(`Échec de fusion du groupe de géométries "${key}" pour le gratte‑ciel.`); groupData.geoms.forEach(g => g.dispose()); return; }
			mergedPart.translate(-globalCenter.x, -globalMin.y, -globalCenter.z);
			mergedPart.computeBoundingBox();
			const finalMaterial = groupData.material;
            finalMaterial.needsUpdate = true; // Nécessaire si transparent, etc.
			parts.push({ geometry: mergedPart, material: finalMaterial });
			groupData.geoms.forEach(g => g.dispose());
         });

        // Nettoyage final
        // ... (logique inchangée pour disposer allGeoms, globalMerged, et les géométries de base) ...
        allGeoms.forEach(g => g.dispose()); globalMerged.dispose();
        baseGeometry?.dispose(); cornerPillarGeom?.dispose(); intermediateGeometry?.dispose();
		verticalBandGeomX?.dispose(); verticalBandGeomZ?.dispose();
		if (horizontalBandGeomX) horizontalBandGeomX.dispose(); if (horizontalBandGeomZ) horizontalBandGeomZ.dispose();
		floorGeometry?.dispose(); roofGeom?.dispose(); antennaGeom?.dispose(); boxGeom?.dispose(); dishGeometry?.dispose();
		dishStandGeom?.dispose(); equipBoxGeom1?.dispose(); equipCylGeom1?.dispose();
		if (windowGeomX) windowGeomX.dispose(); if (windowGeomZ) windowGeomZ.dispose();
        if (doorGeomX) doorGeomX.dispose(); if (doorGeomZ) doorGeomZ.dispose();

        // Objet asset final
        const asset = {
            id: `skyscraper_procedural_${this.assetIdCounter++}`,
            parts: parts, fittingScaleFactor: fittingScaleFactor, userScale: userScale,
            centerOffset: new THREE.Vector3(globalCenter.x, globalCenter.y, globalCenter.z),
            sizeAfterFitting: sizeAfterFitting
        };
        // console.log(`Gratte-ciel procédural généré: ${asset.id} avec ${parts.length} parties.`); // Moins verbeux
        return asset;
    }

	generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1) {
        // console.log(`Génération de l'immeuble procédural (Base: ${baseWidth}x${baseHeight}x${baseDepth}, UserScale: ${userScale})...`);
        const buildingGroup = new THREE.Group();

        // --- Constantes et Matériaux (MODIFICATION ICI pour windowMaterial) ---
        const Z_FIGHT_OFFSET = 0.01;
        const mainColor = 0xf0e6d2; const sideColor = 0x6082b6; const roofColor = 0x808080;
        const roofDetailColor = 0xa9a9a9; const windowColor = 0x4682B4; const doorColor = 0x8a7967;
        const equipmentColor = 0xaaaaaa;

        const mainMaterial = new THREE.MeshStandardMaterial({ color: mainColor, name: "BuildingMainMat" });
        const sideMaterial = new THREE.MeshStandardMaterial({ color: sideColor, name: "BuildingSideMat" });
        const roofMaterial = new THREE.MeshStandardMaterial({ color: roofColor, name: "BuildingRoofMat" });
        const roofDetailMaterial = new THREE.MeshStandardMaterial({ color: roofDetailColor, name: "BuildingRoofDetailMat" });
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: windowColor,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xFFFFFF, // << AJOUT: Couleur émissive
            // emissiveIntensity: 0, // Géré par PlotContentGenerator.update
            name: "BuildingWindowMat"
        });
        const doorMaterial = new THREE.MeshStandardMaterial({ color: doorColor, name: "BuildingDoorMat" });
        const equipmentMaterial = new THREE.MeshStandardMaterial({
            color: equipmentColor, metalness: 0.9, roughness: 0.4, name: "BuildingEquipmentMat"
        });
        // --- Fin Matériaux ---

        // --- Dimensions (extraites du code HTML) ---
        const mainWidthDim = 8; const mainHeightDim = 16; const mainDepthDim = 8;
        const sideWidthDim = 3; const sideHeightDim = 14; const sideDepthDim = 7;
        const roofOverhangDim = 0.5; const windowWidthDim = 1.5; const windowHeightDim = 1;
        const windowDepthDim = 0.1; const roofThickness = 0.5; const roofTopThickness = 0.2;
        const totalRoofHeight = roofThickness + roofTopThickness; const doorHeightDim = 3;
        const doorWidthDim = 1.5; const antennaHeight1 = 4; const antennaHeight2 = 3;
        const antennaRadius = 0.1; const boxSize1 = 1; const boxWidth2 = 1.5;
        const boxHeight2 = 0.5; const boxDepth2 = 1;
        // --- Fin Dimensions ---

        // --- Création Géométries et Meshes ---
        // ... (logique de création des blocs, toits, fenêtres, porte, équipements inchangée) ...
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
        const mainRoofY = mainHeightDim; const sideRoofY = sideHeightDim;
        const mainRoofGeo = new THREE.BoxGeometry(mainWidthDim + roofOverhangDim, roofThickness, mainDepthDim + roofOverhangDim);
        const mainRoof = new THREE.Mesh(mainRoofGeo, roofDetailMaterial); mainRoof.position.y = mainRoofY + roofThickness / 2; mainRoof.castShadow = true; buildingGroup.add(mainRoof);
        const mainRoofTopGeo = new THREE.BoxGeometry(mainWidthDim, roofTopThickness, mainDepthDim);
        const mainRoofTop = new THREE.Mesh(mainRoofTopGeo, roofMaterial); mainRoofTop.position.y = mainRoofY + roofThickness + roofTopThickness / 2; mainRoofTop.castShadow = true; buildingGroup.add(mainRoofTop);
        const sideRoofGeo = new THREE.BoxGeometry(sideWidthDim + roofOverhangDim, roofThickness, sideDepthDim + roofOverhangDim);
        const sideRoof = new THREE.Mesh(sideRoofGeo, roofDetailMaterial); sideRoof.position.x = sideBlock.position.x; sideRoof.position.y = sideRoofY + roofThickness / 2; sideRoof.position.z = sideBlock.position.z; sideRoof.castShadow = true; buildingGroup.add(sideRoof);
        const sideRoofTopGeo = new THREE.BoxGeometry(sideWidthDim, roofTopThickness, sideDepthDim);
        const sideRoofTop = new THREE.Mesh(sideRoofTopGeo, roofMaterial); sideRoofTop.position.x = sideBlock.position.x; sideRoofTop.position.y = sideRoofY + roofThickness + roofTopThickness / 2; sideRoofTop.position.z = sideBlock.position.z; sideRoofTop.castShadow = true; buildingGroup.add(sideRoofTop);
        // Fenêtres
        const windowGeo = new THREE.BoxGeometry(windowWidthDim, windowHeightDim, windowDepthDim);
        const numFloorsMain = 6; const numWindowsPerRowMain = 2; const startYMain = 2.5;
        const spacingYMain = (mainHeightDim - startYMain * 1.5) / numFloorsMain;
        const totalWindowWidthMain = numWindowsPerRowMain * windowWidthDim;
        const spacingXMain = (mainWidthDim - totalWindowWidthMain) / (numWindowsPerRowMain + 1); const spacingZMain = (mainDepthDim - totalWindowWidthMain) / (numWindowsPerRowMain + 1);
        for (let i = 0; i < numFloorsMain; i++) { for (let j = 0; j < numWindowsPerRowMain; j++) { /* Avant */
            const windowMesh = new THREE.Mesh(windowGeo, windowMaterial); windowMesh.position.x = -mainWidthDim / 2 + spacingXMain * (j + 1) + windowWidthDim * j + windowWidthDim / 2; windowMesh.position.y = startYMain + i * spacingYMain; windowMesh.position.z = mainDepthDim / 2 + Z_FIGHT_OFFSET; windowMesh.castShadow = true; buildingGroup.add(windowMesh);
        }}
        for (let i = 0; i < numFloorsMain; i++) { for (let j = 0; j < numWindowsPerRowMain; j++) { /* Gauche */
            const windowMesh = new THREE.Mesh(windowGeo, windowMaterial); windowMesh.position.x = -mainWidthDim / 2 - Z_FIGHT_OFFSET; windowMesh.position.y = startYMain + i * spacingYMain; windowMesh.position.z = -mainDepthDim / 2 + spacingZMain * (j + 1) + windowWidthDim * j + windowWidthDim / 2; windowMesh.rotation.y = Math.PI / 2; windowMesh.castShadow = true; buildingGroup.add(windowMesh);
        }}
        const numFloorsSide = 5; const startYSide = 2.5; const spacingYSide = (sideHeightDim - startYSide * 1.5) / numFloorsSide;
        const sideWindowGeo = new THREE.BoxGeometry(windowWidthDim * 0.5, windowHeightDim * 0.8, windowDepthDim);
        for (let i = 0; i < numFloorsSide; i++) { /* Avant Côté */
            const windowMesh = new THREE.Mesh(sideWindowGeo, windowMaterial); windowMesh.position.x = sideBlock.position.x; windowMesh.position.y = startYSide + i * spacingYSide; windowMesh.position.z = sideBlock.position.z + sideDepthDim / 2 + Z_FIGHT_OFFSET; windowMesh.castShadow = true; buildingGroup.add(windowMesh);
        }
        // Porte
        const doorGeo = new THREE.BoxGeometry(doorWidthDim, doorHeightDim, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMaterial); door.position.x = sideBlock.position.x; door.position.y = doorHeightDim / 2; door.position.z = sideBlock.position.z + sideDepthDim / 2 + 0.05; buildingGroup.add(door);
        // Équipements toit
        const roofEquipmentY = mainRoofY + totalRoofHeight + 0.1;
        const antennaGeo1 = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight1, 8);
        const antenna1Mesh = new THREE.Mesh(antennaGeo1, equipmentMaterial); antenna1Mesh.position.set(-mainWidthDim * 0.3, roofEquipmentY + antennaHeight1 / 2, -mainDepthDim * 0.3); antenna1Mesh.castShadow = true; buildingGroup.add(antenna1Mesh);
        const antennaGeo2 = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight2, 8);
        const antenna2Mesh = new THREE.Mesh(antennaGeo2, equipmentMaterial); antenna2Mesh.position.set(-mainWidthDim * 0.35, roofEquipmentY + antennaHeight2 / 2, -mainDepthDim * 0.35); antenna2Mesh.castShadow = true; buildingGroup.add(antenna2Mesh);
        const boxGeo1 = new THREE.BoxGeometry(boxSize1, boxSize1, boxSize1);
        const box1Mesh = new THREE.Mesh(boxGeo1, equipmentMaterial); box1Mesh.position.set(mainWidthDim * 0.2, roofEquipmentY + boxSize1 / 2, mainDepthDim * 0.2); box1Mesh.castShadow = true; buildingGroup.add(box1Mesh);
        const boxGeo2 = new THREE.BoxGeometry(boxWidth2, boxHeight2, boxDepth2);
        const box2Mesh = new THREE.Mesh(boxGeo2, equipmentMaterial); box2Mesh.position.set(mainWidthDim * 0.1, roofEquipmentY + boxHeight2 / 2, -mainDepthDim * 0.2); box2Mesh.castShadow = true; buildingGroup.add(box2Mesh);
        // --- Fin Création ---

        // --- Regroupement par matériau ---
        // ... (logique inchangée pour regrouper dans buildingMaterialMap) ...
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
				let clonedGeom = child.geometry.clone();
				clonedGeom.applyMatrix4(child.matrixWorld);
				allBuildingGeoms.push(clonedGeom);
				const matName = child.material.name;
				const groupData = buildingMaterialMap.get(matName);
				if (groupData) { groupData.geoms.push(clonedGeom); }
                else { console.warn(`[Building Proc] Matériau inconnu ou sans nom trouvé: ${matName || '[sans nom]'}`); }
			}
         });

        // Calcul BBox global et échelle
        // ... (logique inchangée pour calculer globalMergedBuilding, globalMin/Center/Size, fittingScaleFactorBuilding, sizeAfterFittingBuilding) ...
        if (allBuildingGeoms.length === 0) { console.error("[Building Proc] Aucune géométrie valide trouvée."); return null; }
		const globalMergedBuilding = mergeGeometries(allBuildingGeoms, false);
		if (!globalMergedBuilding) { console.error("[Building Proc] Échec de fusion globale."); allBuildingGeoms.forEach(g => g.dispose()); return null; }
		globalMergedBuilding.computeBoundingBox();
		const globalMinBuilding = globalMergedBuilding.boundingBox.min;
		const globalCenterBuilding = new THREE.Vector3(); globalMergedBuilding.boundingBox.getCenter(globalCenterBuilding);
		const globalSizeBuilding = new THREE.Vector3(); globalMergedBuilding.boundingBox.getSize(globalSizeBuilding);
		globalSizeBuilding.x = Math.max(globalSizeBuilding.x, 0.001); globalSizeBuilding.y = Math.max(globalSizeBuilding.y, 0.001); globalSizeBuilding.z = Math.max(globalSizeBuilding.z, 0.001);
		const fittingScaleFactorBuilding = Math.min( baseWidth / globalSizeBuilding.x, baseHeight / globalSizeBuilding.y, baseDepth / globalSizeBuilding.z );
		const sizeAfterFittingBuilding = globalSizeBuilding.clone().multiplyScalar(fittingScaleFactorBuilding);

        // Création des 'parts' finales
        // ... (logique inchangée pour créer buildingParts) ...
        const buildingParts = [];
		buildingMaterialMap.forEach((groupData, key) => {
            if (groupData.geoms.length === 0) return;
			const mergedPart = mergeGeometries(groupData.geoms, false);
			if (!mergedPart) { console.error(`[Building Proc] Échec de fusion du groupe "${key}".`); groupData.geoms.forEach(g => g.dispose()); return; }
			mergedPart.translate(-globalCenterBuilding.x, -globalMinBuilding.y, -globalCenterBuilding.z);
			mergedPart.computeBoundingBox();
			const finalMaterial = groupData.material;
            finalMaterial.needsUpdate = true;
			buildingParts.push({ geometry: mergedPart, material: finalMaterial });
			groupData.geoms.forEach(g => g.dispose());
         });

        // Nettoyage final
        // ... (logique inchangée pour disposer allBuildingGeoms, globalMergedBuilding, et les géométries de base) ...
        allBuildingGeoms.forEach(g => g.dispose()); globalMergedBuilding.dispose();
        mainBlockGeo?.dispose(); sideBlockGeo?.dispose(); mainRoofGeo?.dispose(); mainRoofTopGeo?.dispose();
        sideRoofGeo?.dispose(); sideRoofTopGeo?.dispose(); windowGeo?.dispose(); sideWindowGeo?.dispose();
        doorGeo?.dispose(); antennaGeo1?.dispose(); antennaGeo2?.dispose(); boxGeo1?.dispose(); boxGeo2?.dispose();

        // Objet asset final
        const buildingAsset = {
            id: `building_procedural_${this.assetIdCounter++}`,
            parts: buildingParts, fittingScaleFactor: fittingScaleFactorBuilding, userScale: userScale,
            centerOffset: new THREE.Vector3(globalCenterBuilding.x, globalCenterBuilding.y, globalCenterBuilding.z),
            sizeAfterFitting: sizeAfterFittingBuilding
        };
        // console.log(`Immeuble procédural généré: ${buildingAsset.id} avec ${buildingParts.length} parties.`); // Moins verbeux
        return buildingAsset;
    }
    // ----- FIN generateProceduralBuilding -----

     // ----- disposeAssets (MODIFIÉ pour s'assurer que 'building' est dans la boucle) -----
     disposeAssets() {
        // ... (logique inchangée) ...
        console.log("Disposition des assets chargés (ignorera 'house', traitera 'building'/'skyscraper' procédural)...");
        let disposedGeometries = 0; let disposedMaterials = 0;
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.parts && Array.isArray(assetData.parts)) {
                    assetData.parts.forEach(part => {
                        if (part.geometry && typeof part.geometry.dispose === 'function') { part.geometry.dispose(); disposedGeometries++; }
                        if (part.material && typeof part.material.dispose === 'function') { part.material.dispose(); disposedMaterials++; }
                    });
                } else {
                    if (assetData.geometry && typeof assetData.geometry.dispose === 'function') { assetData.geometry.dispose(); disposedGeometries++; }
                    if (assetData.material && typeof assetData.material.dispose === 'function') { assetData.material.dispose(); disposedMaterials++; }
                 }
            });
            this.assets[type] = [];
        });
         if (disposedGeometries > 0 || disposedMaterials > 0) { console.log(`  - ${disposedGeometries} géometries et ${disposedMaterials} matériaux disposés.`); }
         this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
    }
}