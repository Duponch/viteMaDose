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
		// --- Création du groupe temporaire pour la construction ---
		const skyscraper = new THREE.Group();

		// --- Matériaux ---
		const structureMaterial = new THREE.MeshStandardMaterial({ color: 0xced4da, flatShading: true, name: "SkyscraperStructureMat" });
		const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x6e7883, flatShading: true, name: "SkyscraperBaseMat" });
		const metallicMaterial = new THREE.MeshStandardMaterial({ color: 0xadb5bd, metalness: 0.9, roughness: 0.4, flatShading: true, side: THREE.DoubleSide, name: "SkyscraperMetallicMat" });
		const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true, name: "SkyscraperFloorMat" });
		const skyscraperWindowMaterial = new THREE.MeshStandardMaterial({
			color: 0x60a3bc,           // Couleur bleutée du verre
			metalness: 0.5,            // Faible métallisation pour un léger reflet
			roughness: 0.1,            // Faible rugosité pour des reflets nets
			transparent: true,         // Active la transparence
			opacity: 0.5,              // Ajuste selon l'effet souhaité
			side: THREE.DoubleSide,    // Rendre visible depuis les deux côtés
			flatShading: true,
			emissive: 0xFFFF99,        // Optionnel pour effets lumineux nocturnes
			emissiveIntensity: 0,    // Éteint par défaut
			name: "SkyscraperWindowMat_Standard" // Nom distinctif
		});
		// ---------------------------------------------------------

		// --- Dimensions générales ---
		const mainWidth = 9, mainDepth = 9, mainHeight = 30;
		const baseHeightVal = 2.5, intermediateStructureHeight = 1.0;
		const intermediateOverhang = 0.5;

		// ==========================================================
		// --- AJOUT : Facteurs de réduction (selon la demande utilisateur) ---
		const windowHeightReductionFactor = 0.5; // Rend les fenêtres 60% moins hautes
		const windowWidthReductionFactor = 0.5;  // Rend les fenêtres 60% moins larges
		const doorHeightReductionFactor = 0.6; // Rend les portes 60% moins hautes
		const doorWidthFactorAdjustment = 0.85; // Rend les portes 15% moins larges (relativement à l'espace)
		// ==========================================================

		// --- Calculs dépendant des facteurs ---
		const pillarThickness = 0.4;
		// Augmentée pour réduire la largeur des fenêtres
		const intermediateBandThickness = pillarThickness / windowWidthReductionFactor;
		const windowInset = 0.05;
		const floorThickness = 0.1;

		// --- Base ---
		const baseGeometry = new THREE.BoxGeometry(mainWidth, baseHeightVal, mainDepth);
		const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
		baseMesh.position.y = baseHeightVal / 2;
		baseMesh.castShadow = true; baseMesh.receiveShadow = true;
		skyscraper.add(baseMesh);

		// --- Entrées/Portes de la Base ---
		const doorHeight = baseHeightVal * doorHeightReductionFactor; // Nouvelle hauteur
		const doorWidthFactor = 0.5; // Facteur de base
		const originalBaseWindowPanelWidth = (mainWidth - 3 * pillarThickness) / 2;
		const originalBaseSideWindowPanelWidth = (mainDepth - 3 * pillarThickness) / 2;
		const doorWidth = originalBaseWindowPanelWidth * doorWidthFactor * doorWidthFactorAdjustment; // Nouvelle largeur
		const sideDoorWidth = originalBaseSideWindowPanelWidth * doorWidthFactor * doorWidthFactorAdjustment; // Nouvelle largeur
		const doorPanelDepth = (pillarThickness * 0.8) / 2;

		let doorGeomX = null, doorGeomZ = null;
		// Création portes avant/arrière
		if (doorWidth > 0.01 && doorHeight > 0.01) {
			doorGeomX = new THREE.BoxGeometry(doorWidth, doorHeight, doorPanelDepth);
			const doorCenterX = doorWidth * 0.75;
			for (let i = 0; i < 2; i++) {
				const zPos = (mainDepth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
				const doorLeft = new THREE.Mesh(doorGeomX, skyscraperWindowMaterial);
				doorLeft.position.set(-doorCenterX, doorHeight / 2, zPos); // Position Y basée sur nouvelle hauteur
				doorLeft.castShadow = true; skyscraper.add(doorLeft);
				const doorRight = new THREE.Mesh(doorGeomX, skyscraperWindowMaterial);
				doorRight.position.set(doorCenterX, doorHeight / 2, zPos); // Position Y basée sur nouvelle hauteur
				doorRight.castShadow = true; skyscraper.add(doorRight);
			}
		}
		// Création portes latérales
		if (sideDoorWidth > 0.01 && doorHeight > 0.01) {
			doorGeomZ = new THREE.BoxGeometry(doorPanelDepth, doorHeight, sideDoorWidth);
			const doorCenterZ = sideDoorWidth * 0.75;
			for (let i = 0; i < 2; i++) {
				const xPos = (mainWidth / 2) * (i === 0 ? 1 : -1) + (doorPanelDepth / 2 * (i === 0 ? 1 : -1));
				const doorBack = new THREE.Mesh(doorGeomZ, skyscraperWindowMaterial);
				doorBack.position.set(xPos, doorHeight / 2, -doorCenterZ); // Position Y basée sur nouvelle hauteur
				doorBack.castShadow = true; skyscraper.add(doorBack);
				const doorFront = new THREE.Mesh(doorGeomZ, skyscraperWindowMaterial);
				doorFront.position.set(xPos, doorHeight / 2, doorCenterZ); // Position Y basée sur nouvelle hauteur
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
		const numFloors = 9;
		const floorHeight = mainHeight / numFloors; // Hauteur totale d'un étage
		const structureHeight = mainHeight;
		const numWindowsPerFace = 4;
		const numIntermediateBands = numWindowsPerFace - 1;

		// Calcul Hauteur Fenêtres ET Bandes Horizontales (Corrigé)
		const windowHeightVal = floorHeight * windowHeightReductionFactor;
		const horizontalBandHeight = floorHeight - windowHeightVal; // Prend le reste

		// Piliers de coin
		const cornerPillarGeom = new THREE.BoxGeometry(pillarThickness + 0.7, structureHeight + 7, pillarThickness + 0.7);
		for (let i = 0; i < 2; i++) { for (let j = 0; j < 2; j++) {
			const pillar = new THREE.Mesh(cornerPillarGeom, structureMaterial);
			pillar.position.set((mainWidth / 2) * (i === 0 ? -1 : 1), startY + structureHeight / 2, (mainDepth / 2) * (j === 0 ? -1 : 1));
			pillar.castShadow = true; pillar.receiveShadow = true; skyscraper.add(pillar);
		} }

		// Calcul largeur fenêtres (utilise intermediateBandThickness augmentée)
		const totalSpanX = mainWidth - pillarThickness;
		const totalSpanZ = mainDepth - pillarThickness;
		const totalIntermediateBandWidthX = numIntermediateBands * intermediateBandThickness;
		const totalIntermediateBandWidthZ = numIntermediateBands * intermediateBandThickness;
		const totalWindowWidthX = Math.max(0, totalSpanX - totalIntermediateBandWidthX);
		const totalWindowWidthZ = Math.max(0, totalSpanZ - totalIntermediateBandWidthZ);
		const singleWindowWidthX = numWindowsPerFace > 0 ? totalWindowWidthX / numWindowsPerFace : 0;
		const singleWindowWidthZ = numWindowsPerFace > 0 ? totalWindowWidthZ / numWindowsPerFace : 0;

		// Géométries fenêtres (utilisent nouvelles dimensions)
		const windowGeomX = singleWindowWidthX > 0.01 && windowHeightVal > 0.01 ? new THREE.BoxGeometry(singleWindowWidthX, windowHeightVal, pillarThickness * 0.9) : null;
		const windowGeomZ = singleWindowWidthZ > 0.01 && windowHeightVal > 0.01 ? new THREE.BoxGeometry(pillarThickness * 0.9, windowHeightVal, singleWindowWidthZ) : null;

		// Création et placement des fenêtres (position Y corrigée)
		if (windowGeomX || windowGeomZ) {
			for (let floor = 0; floor < numFloors; floor++) {
				const floorBaseY = startY + floor * floorHeight;
				// Centre Y de la fenêtre = Base Y + Nouvelle hauteur bande + Nouvelle hauteur fenêtre / 2
				const yPosWindowCenter = floorBaseY + horizontalBandHeight + (windowHeightVal / 2);

				for (let win = 0; win < numWindowsPerFace; win++) {
					const xPos = (-mainWidth / 2 + pillarThickness / 2) + win * intermediateBandThickness + win * singleWindowWidthX + singleWindowWidthX / 2;
					const zPos = (-mainDepth / 2 + pillarThickness / 2) + win * intermediateBandThickness + win * singleWindowWidthZ + singleWindowWidthZ / 2;

					if (windowGeomX) {
						const windowFront = new THREE.Mesh(windowGeomX, skyscraperWindowMaterial);
						windowFront.position.set(xPos, yPosWindowCenter, mainDepth / 2 - windowInset);
						windowFront.castShadow = true; skyscraper.add(windowFront);
						const windowBack = new THREE.Mesh(windowGeomX, skyscraperWindowMaterial);
						windowBack.position.set(xPos, yPosWindowCenter, -mainDepth / 2 + windowInset);
						windowBack.castShadow = true; skyscraper.add(windowBack);
					}
					if (windowGeomZ) {
						const windowRight = new THREE.Mesh(windowGeomZ, skyscraperWindowMaterial);
						windowRight.position.set(mainWidth / 2 - windowInset, yPosWindowCenter, zPos);
						windowRight.castShadow = true; skyscraper.add(windowRight);
						const windowLeft = new THREE.Mesh(windowGeomZ, skyscraperWindowMaterial);
						windowLeft.position.set(-mainWidth / 2 + windowInset, yPosWindowCenter, zPos);
						windowLeft.castShadow = true; skyscraper.add(windowLeft);
					}
				}
			}
		}

		// Bandes Verticales intermédiaires (utilisent intermediateBandThickness augmentée)
		const verticalBandGeomX = intermediateBandThickness > 0.01 ? new THREE.BoxGeometry(intermediateBandThickness, structureHeight, pillarThickness) : null;
		const verticalBandGeomZ = intermediateBandThickness > 0.01 ? new THREE.BoxGeometry(pillarThickness, structureHeight, intermediateBandThickness) : null;
		const yPosBandVert = startY + structureHeight / 2;
		if (verticalBandGeomX && verticalBandGeomZ && singleWindowWidthX > 0.01 && singleWindowWidthZ > 0.01 && numIntermediateBands > 0){
			for (let i = 0; i < numIntermediateBands; i++) {
				const xPosBand = (-mainWidth / 2 + pillarThickness / 2) + (i + 1) * singleWindowWidthX + i * intermediateBandThickness + intermediateBandThickness / 2;
				const zPosBand = (-mainDepth / 2 + pillarThickness / 2) + (i + 1) * singleWindowWidthZ + i * intermediateBandThickness + intermediateBandThickness / 2;
				const bandFrontVert = new THREE.Mesh(verticalBandGeomX, structureMaterial); bandFrontVert.position.set(xPosBand, yPosBandVert, mainDepth / 2); bandFrontVert.castShadow = true; bandFrontVert.receiveShadow = true; skyscraper.add(bandFrontVert);
				const bandBackVert = new THREE.Mesh(verticalBandGeomX, structureMaterial); bandBackVert.position.set(xPosBand, yPosBandVert, -mainDepth / 2); bandBackVert.castShadow = true; bandBackVert.receiveShadow = true; skyscraper.add(bandBackVert);
				const bandRightVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial); bandRightVert.position.set(mainWidth / 2, yPosBandVert, zPosBand); bandRightVert.castShadow = true; bandRightVert.receiveShadow = true; skyscraper.add(bandRightVert);
				const bandLeftVert = new THREE.Mesh(verticalBandGeomZ, structureMaterial); bandLeftVert.position.set(-mainWidth / 2, yPosBandVert, zPosBand); bandLeftVert.castShadow = true; bandLeftVert.receiveShadow = true; skyscraper.add(bandLeftVert);
			}
		}

		// Bandes Horizontales (utilisent nouvelle horizontalBandHeight et position Y corrigée)
		const horizontalBandGeomX = horizontalBandHeight > 0.01 ? new THREE.BoxGeometry(mainWidth, horizontalBandHeight, pillarThickness) : null;
		const horizontalBandGeomZ = horizontalBandHeight > 0.01 ? new THREE.BoxGeometry(pillarThickness, horizontalBandHeight, mainDepth) : null;
		// Ajouter bande tout en bas (plancher 1er étage) et tout en haut (plafond dernier)
		for (let floor = 0; floor <= numFloors; floor++) {
			const bandBaseY = startY + floor * floorHeight;
			const yPosBandCenter = bandBaseY + horizontalBandHeight / 2; // Centre de la bande

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

		// Sols intérieurs (position Y corrigée pour être au-dessus de la bande)
		const floorGeometry = new THREE.BoxGeometry(mainWidth - pillarThickness, floorThickness, mainDepth - pillarThickness);
		for (let floor = 0; floor < numFloors; floor++) {
			const floorBaseY = startY + floor * floorHeight + horizontalBandHeight; // Au dessus de la bande
			const yPosFloor = floorBaseY + floorThickness / 2; // Centrer le sol
			const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
			floorMesh.position.set(0, yPosFloor, 0);
			floorMesh.receiveShadow = true;
			skyscraper.add(floorMesh);
		}

		// Toit (position Y corrigée pour être au-dessus de la dernière bande)
		const roofHeightVal = 1.5;
		const roofGeom = new THREE.BoxGeometry(mainWidth, roofHeightVal, mainDepth);
		const roofMesh = new THREE.Mesh(roofGeom, baseMaterial);
		const roofBaseY = startY + numFloors * floorHeight + horizontalBandHeight; // Au dessus dernière bande
		roofMesh.position.y = roofBaseY + roofHeightVal / 2; // Centrer le toit
		roofMesh.castShadow = true; roofMesh.receiveShadow = true;
		skyscraper.add(roofMesh);

		// Détails sur le Toit (position Y basée sur nouveau roofBaseY)
		const roofTopY = roofBaseY + roofHeightVal; // Sommet du toit plat
		const antennaHeight = 3, antennaRadius = 0.1;
		const antennaGeom = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaHeight, 8);
		const antenna1 = new THREE.Mesh(antennaGeom, metallicMaterial);
		antenna1.position.set(mainWidth * 0.3, roofTopY + antennaHeight / 2, mainDepth * 0.3);
		antenna1.castShadow = true; skyscraper.add(antenna1);
		const antenna2 = new THREE.Mesh(antennaGeom, metallicMaterial);
		antenna2.position.set(-mainWidth * 0.3, roofTopY + antennaHeight / 2, -mainDepth * 0.3);
		antenna2.castShadow = true; skyscraper.add(antenna2);

		const boxSize = 0.8;
		const boxGeom = new THREE.BoxGeometry(boxSize, boxSize * 0.5, boxSize);
		const roofBox1 = new THREE.Mesh(boxGeom, metallicMaterial);
		roofBox1.position.set(0, roofTopY + (boxSize * 0.5) / 2, -mainDepth * 0.2);
		roofBox1.castShadow = true; skyscraper.add(roofBox1);

		const dishRadius = 1.2; const dishDepth = Math.PI * 0.3; const dishThetaStart = Math.PI - dishDepth; const dishThetaLength = dishDepth;
		const dishGeometry = new THREE.SphereGeometry(dishRadius, 20, 10, 0, Math.PI * 2, dishThetaStart, dishThetaLength);
		const dish = new THREE.Mesh(dishGeometry, metallicMaterial);
		dish.rotation.x = Math.PI * 0.05;
		const dishStandHeight = 0.5;
		const dishStandGeom = new THREE.CylinderGeometry(0.1, 0.1, dishStandHeight, 8);
		const dishStand = new THREE.Mesh(dishStandGeom, metallicMaterial);
		dishStand.position.set(mainWidth * -0.25, roofTopY + dishStandHeight / 2, mainDepth * 0.2);
		dishStand.castShadow = true; skyscraper.add(dishStand);
		dish.position.copy(dishStand.position);
		dish.position.y = dishStand.position.y + dishStandHeight / 2 + dishRadius * 0.3 + 0.8;
		dish.castShadow = true; skyscraper.add(dish);

		const equipBoxGeom1 = new THREE.BoxGeometry(1.5, 0.8, 0.8);
		const equipBox1 = new THREE.Mesh(equipBoxGeom1, metallicMaterial);
		equipBox1.position.set(mainWidth * 0.3, roofTopY + 0.8 / 2, -mainDepth * 0.3);
		equipBox1.castShadow = true; skyscraper.add(equipBox1);

		const equipCylGeom1 = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12);
		const equipCyl1 = new THREE.Mesh(equipCylGeom1, metallicMaterial);
		equipCyl1.position.set(-mainWidth * 0.1, roofTopY + 1.2 / 2, mainDepth * 0.35);
		equipCyl1.castShadow = true; skyscraper.add(equipCyl1);
		// --- Fin de la construction ---

		// --- Regroupement par matériau pour créer les 'parts' ---
		const allGeoms = [];
		const materialGroups = {};
		// Utilisation de Map pour garantir l'ordre et faciliter la recherche de matériaux
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
				// Assurer la présence d'index ou non-indexé pour mergeGeometries
				//if (!clonedGeom.index && !clonedGeom.attributes.normal) {
				//     clonedGeom.computeVertexNormals(); // Peut être nécessaire si non indexé et sans normales
				//} else if(clonedGeom.index && !clonedGeom.attributes.normal){
				//     clonedGeom = clonedGeom.toNonIndexed(); // Essayer de désindexer
				//     clonedGeom.computeVertexNormals();
				//} else if (!clonedGeom.index){
				//     // Déjà non-indexé, on suppose que les normales sont ok
				//}
				// Simplification: on suppose que les géométries sont valides après applyMatrix4
				allGeoms.push(clonedGeom); // Pour BBox globale

				const matName = child.material.name;
				const groupData = materialMap.get(matName);
				if (groupData) {
					groupData.geoms.push(clonedGeom);
				} else {
					console.warn(`Matériau inconnu ou sans nom trouvé: ${matName || '[sans nom]'}`);
					// Optionnel: ajouter à un groupe par défaut
				}
			}
		});

		// Calcul BBox global et échelle
		if (allGeoms.length === 0) {
			console.error("Aucune géométrie valide trouvée pour le gratte-ciel procédural.");
			// Nettoyage des géométries de base
			baseGeometry?.dispose(); cornerPillarGeom?.dispose(); intermediateGeometry?.dispose(); verticalBandGeomX?.dispose(); verticalBandGeomZ?.dispose(); horizontalBandGeomX?.dispose(); horizontalBandGeomZ?.dispose(); floorGeometry?.dispose(); roofGeom?.dispose(); antennaGeom?.dispose(); boxGeom?.dispose(); dishGeometry?.dispose(); dishStandGeom?.dispose(); equipBoxGeom1?.dispose(); equipCylGeom1?.dispose(); windowGeomX?.dispose(); windowGeomZ?.dispose(); doorGeomX?.dispose(); doorGeomZ?.dispose();
			return null;
		}
		const globalMerged = mergeGeometries(allGeoms, false);
		if (!globalMerged) {
			console.error("Échec de fusion globale pour le gratte‑ciel procédural.");
			allGeoms.forEach(g => g.dispose());
			// Nettoyage des géométries de base
			baseGeometry?.dispose(); cornerPillarGeom?.dispose(); intermediateGeometry?.dispose(); verticalBandGeomX?.dispose(); verticalBandGeomZ?.dispose(); horizontalBandGeomX?.dispose(); horizontalBandGeomZ?.dispose(); floorGeometry?.dispose(); roofGeom?.dispose(); antennaGeom?.dispose(); boxGeom?.dispose(); dishGeometry?.dispose(); dishStandGeom?.dispose(); equipBoxGeom1?.dispose(); equipCylGeom1?.dispose(); windowGeomX?.dispose(); windowGeomZ?.dispose(); doorGeomX?.dispose(); doorGeomZ?.dispose();
			return null;
		}
		globalMerged.computeBoundingBox();
		const globalMin = globalMerged.boundingBox.min;
		const globalCenter = new THREE.Vector3(); globalMerged.boundingBox.getCenter(globalCenter);
		const globalSize = new THREE.Vector3(); globalMerged.boundingBox.getSize(globalSize);
		globalSize.x = Math.max(globalSize.x, 0.001); globalSize.y = Math.max(globalSize.y, 0.001); globalSize.z = Math.max(globalSize.z, 0.001);
		const fittingScaleFactor = Math.min( baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z );
		const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

		// Création des 'parts' finales
		const parts = [];
		materialMap.forEach((groupData, key) => {
			if (groupData.geoms.length === 0) return; // Skip empty groups

			const mergedPart = mergeGeometries(groupData.geoms, false);
			if (!mergedPart) {
				console.error(`Échec de fusion du groupe de géométries "${key}" pour le gratte‑ciel.`);
				groupData.geoms.forEach(g => g.dispose()); // Dispose individual geoms if merge fails
				return; // Continue to next material group
			}

			// Translater pour centrer à l'origine (0, 0, 0) et placer sur le sol (Y min à 0)
			mergedPart.translate(-globalCenter.x, -globalMin.y, -globalCenter.z);
			mergedPart.computeBoundingBox(); // Recalculer BBox après translation

			const finalMaterial = groupData.material; // Le clone avec le bon nom
			finalMaterial.needsUpdate = true; // Important pour la transparence/émissif
			parts.push({ geometry: mergedPart, material: finalMaterial });

			// Dispose individual geometries of this group *after* successful merge
			groupData.geoms.forEach(g => g.dispose());
		});


		// Nettoyage final
		allGeoms.forEach(g => g.dispose()); // Nettoie les géométries transformées initiales
		globalMerged.dispose();
		// Nettoie les géométries de base
		baseGeometry?.dispose(); cornerPillarGeom?.dispose(); intermediateGeometry?.dispose();
		verticalBandGeomX?.dispose(); verticalBandGeomZ?.dispose();
		if (horizontalBandGeomX) horizontalBandGeomX.dispose();
		if (horizontalBandGeomZ) horizontalBandGeomZ.dispose();
		floorGeometry?.dispose(); roofGeom?.dispose(); antennaGeom?.dispose(); boxGeom?.dispose(); dishGeometry?.dispose();
		dishStandGeom?.dispose(); equipBoxGeom1?.dispose(); equipCylGeom1?.dispose();
		if (windowGeomX) windowGeomX.dispose();
		if (windowGeomZ) windowGeomZ.dispose();
		if (doorGeomX) doorGeomX.dispose();
		if (doorGeomZ) doorGeomZ.dispose();


		// Objet asset final
		const asset = {
			id: `skyscraper_procedural_${this.assetIdCounter++}`,
			parts: parts, // Contient les { geometry, material } groupés
			fittingScaleFactor: fittingScaleFactor,
			userScale: userScale,
			centerOffset: new THREE.Vector3(globalCenter.x, globalCenter.y, globalCenter.z), // Offset original avant centrage
			sizeAfterFitting: sizeAfterFitting // Taille après mise à l'échelle pour tenir dans baseWidth/Height/Depth
		};
		console.log(`Gratte-ciel procédural généré: ${asset.id} avec ${parts.length} parties.`);
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