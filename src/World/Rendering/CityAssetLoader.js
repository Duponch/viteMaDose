// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import HouseRenderer from '../Buildings/HouseRenderer.js';
import BuildingRenderer from '../Buildings/BuildingRenderer.js';
import NewBuildingRenderer from '../Buildings/NewBuildingRenderer.js';
import SkyscraperRenderer from '../Buildings/SkyscraperRenderer.js';
import NewSkyscraperRenderer from '../Buildings/NewSkyscraperRenderer.js';
import IndustrialRenderer, { generateProceduralIndustrial } from '../Buildings/IndustrialRenderer.js'; // Ajustez le chemin si nécessaire
import TreeRenderer from '../Vegetation/TreeRenderer.js';
import FirTreeRenderer from '../Vegetation/FirTreeRenderer.js';
import CommercialRenderer from '../Buildings/CommercialRenderer.js';

export default class CityAssetLoader {
    // ----- CONSTRUCTEUR -----
    constructor(config, materials, experience) {
        this.config = config;
        this.materials = materials;
        this.experience = experience;
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();
        this.assets = {
            house: [],
            building: [],
            industrial: [],
            park: [],
            tree: [],
            skyscraper: [],
            crosswalk: [],
            commercial: []
        };
        this.assetIdCounter = 0;
        this.loadedAssets = new Map();
        this.loadingPromises = new Map();
        // Création des instances de HouseRenderer, BuildingRenderer et SkyscraperRenderer
        this.houseRenderer = new HouseRenderer(config, {});
        this.buildingRenderer = new BuildingRenderer(config, {});
        this.newBuildingRenderer = new NewBuildingRenderer(config, {});
        this.skyscraperRenderer = new SkyscraperRenderer(config, {});
        this.newSkyscraperRenderer = new NewSkyscraperRenderer(config, {});
        this.treeRenderer = new TreeRenderer(config, materials);
        this.firTreeRenderer = new FirTreeRenderer(config, materials);
        this.commercialRenderer = new CommercialRenderer(config, materials);
        //console.log("CityAssetLoader initialisé. Utilisation de HouseRenderer pour les maisons, BuildingRenderer pour les immeubles, SkyscraperRenderer pour les gratte-ciels et CommercialRenderer pour les commerces.");
    }

    // ----- getRandomAssetData -----
    getRandomAssetData(type) {
        // Pour les maisons générées procéduralement, on retourne null.
        if (type === 'house') {
            return null;
        }
        const modelList = this.assets[type];
        if (!modelList || modelList.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    // ----- getAssetDataById -----
    getAssetDataById(id) {
        // On ignore les maisons car elles sont générées procéduralement.
        if (id && id.startsWith('house_')) {
            return null;
        }
        for (const type in this.assets) {
            if (type === 'house') continue;
            if (this.assets.hasOwnProperty(type)) {
                const found = this.assets[type].find(asset => asset.id === id);
                if (found) return found;
            }
        }
        return null;
    }

    // ----- loadAssets -----
    // ----- loadAssets -----
    async loadAssets() {
        //console.log("Chargement des assets (maisons via HouseRenderer, immeubles via BuildingRenderer, gratte-ciels via SkyscraperRenderer, etc.)..."); //
        this.reset(); //

        // Fonction interne createLoadPromises mise à jour pour gérer les types procéduraux.
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => { //
            if (type === 'house') { // Keep original logic for house
                //console.log(`-> Préparation de la génération procédurale pour le type '${type}'...`); //
                return [ //
                    this.loadAssetModel(null, type, width, height, depth, 1.0, null) // Pass null for renderer hint
                        .catch(error => { //
                            console.error(`Echec génération procédurale ${type}:`, error); //
                            return null; //
                        })
                ];
            } else if (type === 'tree') { // Modification pour gérer les deux types d'arbres
                //console.log(`-> Préparation de la génération procédurale pour les types d'arbres (régulier et sapin)...`);
                const treePromises = [
                    // Arbre régulier
                    this.loadAssetModel(null, type, width, height, depth, 1.0, 'regular')
                        .catch(error => {
                            console.error(`Echec génération procédurale arbre régulier:`, error);
                            return null;
                        }),
                    // Sapin
                    this.loadAssetModel(null, type, width, height, depth, 1.0, 'fir')
                        .catch(error => {
                            console.error(`Echec génération procédurale sapin:`, error);
                            return null;
                        })
                ];
                return treePromises;
            } else if (type === 'skyscraper') { // *** NOUVELLE LOGIQUE POUR GRATTE-CIELS ***
                 //console.log(`-> Préparation de la génération procédurale pour les variants de gratte-ciels (7 à 11 étages)...`);
                 const promises = [];
                 const minFloors = 7;
                 const maxFloors = 11;
                 for (let floors = minFloors; floors <= maxFloors; floors++) {
                     promises.push(
                         // Appelle loadAssetModel pour chaque nombre d'étages
                         // Pass le nombre d'étages via le paramètre rendererTypeHint pour l'instant (pas idéal, mais fonctionne)
                         this.loadAssetModel(null, type, width, height, depth, 1.0, floors) // Utilise rendererTypeHint pour passer le nombre d'étages
                            .catch(error => {
                                console.error(`Echec génération procédurale ${type} (${floors} étages):`, error);
                                return null;
                            })
                     );
                 }
                 return promises; // Retourne le tableau de promesses
            } else if (type === 'building') { // *** NEW LOGIC FOR BUILDINGS ***
                //console.log(`-> Préparation de la génération procédurale pour ${this.config.proceduralBuildingVariants ?? 10} variants d'immeubles (50/50)...`);
                const promises = [];
                const numVariants = this.config.proceduralBuildingVariants ?? 10; // Make it configurable? Default 10.
                
                // Pour garantir une distribution 50/50, générons exactement moitié/moitié
                const halfVariants = Math.ceil(numVariants / 2);
                
                // Première moitié avec NewBuildingRenderer
                for (let i = 0; i < halfVariants; i++) {
                    promises.push(
                        this.loadAssetModel(null, type, width, height, depth, 1.0, 'new')
                            .catch(error => {
                                console.error(`Echec génération procédurale ${type} (variant ${i}, renderer: new):`, error);
                                return null;
                            })
                    );
                }
                
                // Deuxième moitié avec BuildingRenderer
                for (let i = 0; i < numVariants - halfVariants; i++) {
                    promises.push(
                        this.loadAssetModel(null, type, width, height, depth, 1.0, 'old')
                            .catch(error => {
                                console.error(`Echec génération procédurale ${type} (variant ${i}, renderer: old):`, error);
                                return null;
                            })
                    );
                }
                
                return promises; // Return array of promises
            }
            if (type === 'industrial') { //
                // Génération procédurale industrielle
                //console.log(`-> Préparation de la génération procédurale pour le type '${type}'...`);
                const asset = generateProceduralIndustrial(width, height, depth, {}); //
                this.assets['industrial'] = [asset]; //
                return [Promise.resolve(asset)]; //
            }
            if (!assetConfigs || !dir || !type || width == null || height == null || depth == null) { //
                console.warn(`Configuration incomplète ou invalide pour le type '${type}', chargement ignoré.`); //
                return []; //
            }
            if (!Array.isArray(assetConfigs)) { //
                console.warn(`'${type}ModelFiles' n'est pas un tableau dans la config. Chargement ignoré.`); //
                return []; //
            }
            return assetConfigs.map(assetConfig => { //
                if (typeof assetConfig !== 'object' || assetConfig === null || !assetConfig.file) { //
                    console.error(`Format de configuration d'asset invalide pour le type ${type}:`, assetConfig, `dans ${dir}`); //
                    return Promise.resolve(null); //
                }
                const fileName = assetConfig.file; //
                const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1; //
                return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale) //
                    .catch(error => { //
                        console.error(`Echec chargement ${type} ${fileName}:`, error); //
                        return null; //
                    });
            });
        };

        const housePromises = createLoadPromises( //
            this.config.houseModelFiles, //
            this.config.houseModelDir, //
            'house', //
            this.config.houseBaseWidth, //
            this.config.houseBaseHeight, //
            this.config.houseBaseDepth //
        );
        const buildingPromises = createLoadPromises( //
            null, //
            null, //
            'building', //
            this.config.buildingBaseWidth, //
            this.config.buildingBaseHeight, //
            this.config.buildingBaseDepth //
        );
        const industrialPromises = createLoadPromises( //
            this.config.industrialModelFiles, //
            this.config.industrialModelDir, //
            'industrial', //
            this.config.industrialBaseWidth, //
            this.config.industrialBaseHeight, //
            this.config.industrialBaseDepth //
        );
        const parkPromises = createLoadPromises( //
            this.config.parkModelFiles, //
            this.config.parkModelDir, //
            'park', //
            this.config.parkBaseWidth, //
            this.config.parkBaseHeight, //
            this.config.parkBaseDepth //
        );
        const treePromises = createLoadPromises( //
            null, //
            null, //
            'tree', //
            this.config.treeBaseWidth, //
            this.config.treeBaseHeight, //
            this.config.treeBaseDepth //
        );
        const skyscraperPromises = createLoadPromises( //
            this.config.skyscraperModelFiles, //
            this.config.skyscraperModelDir, //
            'skyscraper', //
            this.config.skyscraperBaseWidth, //
            this.config.skyscraperBaseHeight, //
            this.config.skyscraperBaseDepth //
        );

        try { //
            const [houseResults, buildingResults, industrialResults, parkResults, treeResults, skyscraperResults] = await Promise.all([ //
                Promise.all(housePromises), //
                Promise.all(buildingPromises), //
                Promise.all(industrialPromises), //
                Promise.all(parkPromises), //
                Promise.all(treePromises), //
                Promise.all(skyscraperPromises) //
            ]);

            // Attribution des résultats aux assets, en filtrant les null.
            this.assets.house = houseResults.filter(r => r !== null); //
            this.assets.building = buildingResults.filter(r => r !== null); //
            this.assets.industrial = industrialResults.filter(r => r !== null); //
            this.assets.park = parkResults.filter(r => r !== null); //
            this.assets.tree = treeResults.filter(r => r !== null); //
            this.assets.skyscraper = skyscraperResults.filter(r => r !== null); //

            //console.log(`Assets chargés: ${this.assets.house.length} maisons (procédurales), ${this.assets.building.length} immeubles (procéduraux), ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs, ${this.assets.tree.length} arbres, ${this.assets.skyscraper.length} gratte-ciels.`); //
            return this.assets; //
        } catch (error) { //
            console.error("Erreur durant le chargement groupé des assets:", error); //
            this.reset(); //
            return this.assets; //
        }
    }

    // ----- reset -----
    reset() {
        this.disposeAssets();
        this.assets = { 
            house: [], 
            building: [], 
            industrial: [], 
            park: [], 
            tree: [], 
            skyscraper: [], 
            crosswalk: [],
            commercial: []
        };
        this.assetIdCounter = 0;
    }

    // ----- loadAssetModel -----
    loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1, rendererTypeHint = null) {
        // Garder une trace de l'ID unique pour cet asset, même si procédural
        const internalCounterId = this.assetIdCounter++; // Increment counter immediately
        const modelIdBase = path ? path.split('/').pop().split('.')[0] : `${type}_proc`;

        return new Promise((resolve) => {
            // Générer l'ID final plus tard si procédural, basé sur le type de renderer
            let finalModelId = path ? modelIdBase : null;

            // Check cache first (only for file paths)
            if (path && this.loadedAssets.has(modelIdBase)) {
                //console.log(`  - Asset '${modelIdBase}' déjà chargé, récupération depuis le cache.`);
                resolve(this.loadedAssets.get(modelIdBase));
                return;
            }

            // --- Procedural Generation ---
            if (path === null) {
                let assetData = null;
                //console.log(`Attempting procedural generation for type: ${type} ${rendererTypeHint ? `(Hint: ${rendererTypeHint})` : ''}`);

                if (type === 'house') {
                    if (!this.houseRenderer) {
                        console.error("HouseRenderer not initialized.");
                        resolve(null);
                        return;
                    }
                    try {
                        assetData = this.houseRenderer.generateProceduralHouse(baseWidth, baseHeight, baseDepth, userScale);
                        if (assetData) {
                            finalModelId = `house_proc_${internalCounterId}`;
                            assetData.id = finalModelId;
                            assetData.procedural = true;
                            assetData.rendererType = 'HouseRenderer';
                            this.loadedAssets.set(finalModelId, assetData);
                            //console.log(`  - Generated procedural house asset '${finalModelId}'`);
                            resolve(assetData);
                        } else {
                            console.warn("Procedural generation for house returned null.");
                            resolve(null);
                        }
                    } catch (error) {
                        console.error("Error during procedural house generation:", error);
                        resolve(null);
                    }
                } else if (type === 'building') {
                    // *** MODIFICATION START ***
                    const useNewRenderer = rendererTypeHint === 'new'; // Use the hint
                    const renderer = useNewRenderer ? this.newBuildingRenderer : this.buildingRenderer;
                    const rendererName = useNewRenderer ? 'NewBuildingRenderer' : 'BuildingRenderer';
                    // //console.log(`Generating procedural building using ${rendererName}...`); // Log less verbose

                    if (!renderer) {
                        console.error(`Renderer (${rendererName}) not initialized for type 'building'.`);
                        resolve(null);
                        return;
                    }

                    try {
                        assetData = renderer.generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale);
                        if (assetData) {
                            // Make ID unique including renderer type and counter
                            finalModelId = `building_proc_${rendererName}_${internalCounterId}`;
                            assetData.id = finalModelId;
                            assetData.procedural = true;
                            assetData.rendererType = rendererName; // Store which renderer was used
                            this.loadedAssets.set(finalModelId, assetData); // Cache it
                            //console.log(`  - Generated procedural building asset '${finalModelId}'`);
                            resolve(assetData); // Resolve with the generated asset
                        } else {
                            console.warn(`Procedural generation for building using ${rendererName} returned null.`);
                            resolve(null);
                        }
                    } catch (error) {
                        console.error(`Error during procedural building generation using ${rendererName}:`, error);
                        resolve(null);
                    }
                    // *** MODIFICATION END ***
                } else if (type === 'skyscraper') {
					// --- Récupération et validation numFloors ---
					const numFloors = parseInt(rendererTypeHint, 10); // rendererTypeHint contient le nb d'étages
					if (isNaN(numFloors) || numFloors < 6 || numFloors > 12) {
						console.error(`loadAssetModel: Nombre d'étages invalide (${rendererTypeHint}) pour gratte-ciel. Annulation.`);
						resolve(null); // Rejeter la promesse
						return; // Sortir de la fonction loadAssetModel pour cet appel
					}
				
					// --- Sélection du renderer (inchangé) ---
					// Alternance entre les deux types de renderers pour les gratte-ciels
					const useNewRenderer = numFloors % 2 === 0; // Utiliser NewSkyscraperRenderer pour les étages pairs
					const renderer = useNewRenderer ? this.newSkyscraperRenderer : this.skyscraperRenderer;
					const rendererName = useNewRenderer ? 'NewSkyscraperRenderer' : 'SkyscraperRenderer';
				
					if (!renderer) {
						console.error(`Renderer (${rendererName}) not initialized for type 'skyscraper'.`);
						resolve(null);
						return;
					}
				
					// --- Appel à generateProceduralSkyscraper (MODIFIÉ) ---
					try {
						// On passe maintenant numFloors aux DEUX renderers
						assetData = renderer.generateProceduralSkyscraper(
							baseWidth,
							baseHeight, // Moins pertinent maintenant que numFloors est passé
							baseDepth,
							userScale,
							numFloors // *** Passer numFloors ici ***
						);
				
						if (assetData) {
							// L'ID est généré DANS le renderer maintenant, on le récupère juste
							finalModelId = assetData.id; // Utiliser l'ID généré par le renderer
							assetData.procedural = true;
							assetData.rendererType = rendererName;
							assetData.numFloors = numFloors; // Assurer que numFloors est bien dans l'asset
							this.loadedAssets.set(finalModelId, assetData); // Cache l'asset
							//console.log(`  - Generated procedural skyscraper asset '${finalModelId}' (${numFloors} floors) using ${rendererName}`);
							resolve(assetData); // Résout la promesse avec l'asset généré
						} else {
							console.warn(`Procedural generation for skyscraper (${numFloors} floors) using ${rendererName} returned null.`);
							resolve(null); // Rejeter si la génération a échoué
						}
					} catch (error) {
						console.error(`Error during procedural skyscraper generation (${numFloors} floors) with ${rendererName}:`, error);
						resolve(null); // Rejeter en cas d'erreur
					}
					return; // Sortir car c'est procédural
				} else if (type === 'tree') {
                    // Vérification du type d'arbre à générer
                    const isFirTree = rendererTypeHint === 'fir';
                    const renderer = isFirTree ? this.firTreeRenderer : this.treeRenderer;
                    const rendererName = isFirTree ? 'FirTreeRenderer' : 'TreeRenderer';
                    
                    if (!renderer) {
                        console.error(`${rendererName} not initialized.`);
                        resolve(null);
                        return;
                    }
                    
                    try {
                        assetData = renderer.generateProceduralTree(baseWidth, baseHeight, baseDepth, userScale);
                        if (assetData) {
                            // Utiliser des identifiants distincts pour les deux types d'arbres
                            finalModelId = isFirTree 
                                ? `firtree_proc_${internalCounterId}` 
                                : `tree_proc_${internalCounterId}`;
                            
                            assetData.id = finalModelId;
                            assetData.procedural = true;
                            assetData.rendererType = rendererName;
                            assetData.treeType = isFirTree ? 'fir' : 'regular';
                            
                            this.loadedAssets.set(finalModelId, assetData);
                            //console.log(`  - Generated procedural ${isFirTree ? 'fir tree' : 'regular tree'} asset '${finalModelId}'`);
                            resolve(assetData);
                        } else {
                            console.warn(`Procedural generation for ${isFirTree ? 'fir tree' : 'regular tree'} returned null.`);
                            resolve(null);
                        }
                    } catch (error) {
                        console.error(`Error during procedural ${isFirTree ? 'fir tree' : 'regular tree'} generation:`, error);
                        resolve(null);
                    }
                } else if (type === 'industrial') {
                    try {
                        // Industrial generation might be slightly different, ensure it returns expected format
                        assetData = generateProceduralIndustrial(baseWidth, baseHeight, baseDepth, { userScale }, this.config, this.materials, this.experience?.renderer?.instance);
                        if (assetData) {
                            finalModelId = `industrial_proc_${internalCounterId}`;
                            assetData.id = finalModelId;
                            assetData.procedural = true;
                            assetData.rendererType = 'IndustrialRenderer';
                            this.loadedAssets.set(finalModelId, assetData);
                            //console.log(`  - Generated procedural industrial asset '${finalModelId}'`);
                            resolve(assetData);
                        } else {
                            console.warn("Procedural generation for industrial returned null.");
                            resolve(null);
                        }
                    } catch (error) {
                        console.error("Error during procedural industrial generation:", error);
                        resolve(null);
                    }
                }
                else {
                    console.warn(`Procedural generation not implemented for type: ${type}`);
                    resolve(null);
                }
                return; // Exit promise execution path for procedural
            }

            // --- File Loading (FBX/GLTF) ---
            finalModelId = modelIdBase; // Assign final ID for file-based assets
            const extension = path.split('.').pop().toLowerCase();
            const loader = extension === 'fbx' ? this.fbxLoader : this.gltfLoader;

            loader.load(
                path,
                (loadedObject) => {
                    let mergedGeometry = null;
                    const geometries = [];
                    try {
                        const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;
                        if (!modelRootObject) {
                            console.error(`[${modelIdBase}] Aucun objet racine trouvé dans ${path}. Asset ignoré.`);
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
                                    console.warn(`[${modelIdBase}] Mesh enfant ignoré car géométrie invalide ou manquante dans ${path}`);
                                }
                            }
                        });
                        if (!hasValidMesh) {
                            console.error(`[${modelIdBase}] Aucune géométrie de mesh valide trouvée dans ${path}. Asset ignoré.`);
                            return resolve(null);
                        }
                        if (geometries.length === 0) {
                            console.error(`[${modelIdBase}] Aucune géométrie collectée dans ${path}. Asset ignoré.`);
                            return resolve(null);
                        }
                        mergedGeometry = mergeGeometries(geometries, false);
                        if (!mergedGeometry) {
                            console.error(`[${modelIdBase}] Échec de la fusion des géométries pour ${path}. Asset ignoré.`);
                            geometries.forEach(g => g.dispose());
                            return resolve(null);
                        }
                        mergedGeometry.center();
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) {
                            console.error(`[${modelIdBase}] Échec calcul BBox pour ${path}. Asset ignoré.`);
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
                            console.error(`!!!!!! [${modelIdBase}] ERREUR NaN détectée dans les positions des vertices APRES fusion/centrage pour ${path}. Cet asset sera ignoré. !!!!!!`);
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
                        finalMaterial.name = `AssetMat_${modelIdBase}`;
                        resolve({
                            id: modelIdBase,
                            geometry: mergedGeometry,
                            material: finalMaterial,
                            fittingScaleFactor: fittingScaleFactor,
                            userScale: userScale,
                            centerOffset: centerOffset,
                            sizeAfterFitting: sizeAfterFitting
                        });
                        geometries.forEach(g => g.dispose());
                    } catch (processingError) {
                        console.error(`Erreur interne pendant traitement ${path} [${modelIdBase}]:`, processingError);
                        geometries?.forEach(g => g?.dispose());
                        if (mergedGeometry) mergedGeometry.dispose();
                        resolve(null);
                    }
                },
                undefined,
                (error) => {
                    console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelIdBase}]:`, error);
                    console.error(`URL complète: ${window.location.origin}/${path}`); // Ajout pour debugging
                    console.error(`Type d'erreur: ${error.constructor.name}`);
                    if (error instanceof SyntaxError) {
                        console.error(`Erreur de parsing, cela peut indiquer une mauvaise URL ou un problème de CORS`);
                    }
                    resolve(null);
                }
            );
        });
    }

    // ----- disposeAssets -----
    disposeAssets() {
        //console.log("Disposition des assets chargés (traitement des assets procéduraux)...");
        let disposedGeometries = 0;
        let disposedMaterials = 0;
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.parts && Array.isArray(assetData.parts)) {
                    assetData.parts.forEach(part => {
                        if (part.geometry && typeof part.geometry.dispose === 'function') {
                            part.geometry.dispose();
                            disposedGeometries++;
                        }
                        if (part.material && typeof part.material.dispose === 'function') {
                            part.material.dispose();
                            disposedMaterials++;
                        }
                    });
                } else {
                    if (assetData.geometry && typeof assetData.geometry.dispose === 'function') {
                        assetData.geometry.dispose();
                        disposedGeometries++;
                    }
                    if (assetData.material && typeof assetData.material.dispose === 'function') {
                        assetData.material.dispose();
                        disposedMaterials++;
                    }
                }
            });
            this.assets[type] = [];
        });
        if (disposedGeometries > 0 || disposedMaterials > 0) {
            //console.log(`  - ${disposedGeometries} géométries et ${disposedMaterials} matériaux disposés.`);
        }
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [], crosswalk: [], commercial: [] };
    }

    /**
     * Enregistre un asset avec l'ID spécifié
     * @param {string} id - L'identifiant pour l'asset
     * @param {object} assetData - Les données de l'asset
     * @returns {object} - Les données de l'asset enregistré
     */
    registerAssetData(id, assetData) {
        if (!id || !assetData) {
            console.error("registerAssetData: ID ou assetData invalide");
            return null;
        }
        
        // Déterminer le type à partir de l'ID
        let type = 'unknown';
        if (id.startsWith('house_')) type = 'house';
        else if (id.startsWith('building_')) type = 'building';
        else if (id.startsWith('industrial_')) type = 'industrial';
        else if (id.startsWith('park_')) type = 'park';
        else if (id.startsWith('tree_')) type = 'tree';
        else if (id.startsWith('skyscraper_')) type = 'skyscraper';
        else if (id.startsWith('commercial_')) type = 'commercial';
        
        // S'assurer que l'ID est attribué à l'asset
        assetData.id = id;
        
        // Enregistrer dans la map des assets chargés
        this.loadedAssets.set(id, assetData);
        
        // Ajouter au tableau du type correspondant (sauf si déjà présent)
        if (type !== 'unknown' && !this.assets[type].some(asset => asset.id === id)) {
            this.assets[type].push(assetData);
        }
        
        return assetData;
    }
}
