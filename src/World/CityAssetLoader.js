// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    // ----- CONSTRUCTEUR MODIFIÉ -----
	constructor(config) {
        this.config = config; // Contient maintenant la config skyscraper
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();

        // S'assurer que 'house' est listé, même s'il ne sera pas chargé
        this.assets = {
            house: [], // Gardé pour la structure, mais ne sera pas peuplé par loadAssets
            building: [],
            industrial: [],
            park: [],
            tree: [],
            skyscraper: []
        };
        this.assetIdCounter = 0;
        console.log("CityAssetLoader initialisé (support FBX & GLB/GLTF, scale par modèle, incluant arbres et gratte-ciels). Le chargement des maisons ('house') sera ignoré.");
    }

    // ----- getRandomAssetData (Inchangé mais fonctionne pour 'skyscraper') -----
	getRandomAssetData(type) {
        // Ne retourne rien pour le type 'house' car ils sont générés procéduralement
        if (type === 'house') {
            // console.warn("getRandomAssetData: Le type 'house' est généré procéduralement, aucun asset chargé.");
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

    // ----- getAssetDataById (Inchangé mais fonctionne pour 'skyscraper') -----
	getAssetDataById(id) {
		// Ne cherche pas le type 'house'
		if (id && id.startsWith('house_')) {
		   // console.warn(`getAssetDataById: Le type 'house' est généré procéduralement.`);
			return null;
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
        console.log("Chargement des assets (MAISONS IGNORÉES, arbres et gratte-ciels inclus)...");
        this.reset(); // Nettoie tous les types, y compris 'house'

        // Fonction interne createLoadPromises (inchangée)
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => {
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
                        return Promise.resolve(null);
                    }
                    const fileName = assetConfig.file;
                    const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1;
                    return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale)
                        .catch(error => {
                            console.error(`Echec chargement ${type} ${fileName}:`, error);
                            return null;
                        });
                }
            );
        };

        // *** IGNORER la création des promesses pour les maisons ***
        // const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const housePromises = Promise.resolve([]); // <- Retourne un tableau vide immédiatement

        // Créer les promesses pour les autres types (inchangé)
        const buildingPromises = createLoadPromises(this.config.buildingModelFiles, this.config.buildingModelDir, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth);
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);
        const parkPromises = createLoadPromises(this.config.parkModelFiles, this.config.parkModelDir, 'park', this.config.parkBaseWidth, this.config.parkBaseHeight, this.config.parkBaseDepth);
        const treePromises = createLoadPromises(this.config.treeModelFiles, this.config.treeModelDir, 'tree', this.config.treeBaseWidth, this.config.treeBaseHeight, this.config.treeBaseDepth);
        const skyscraperPromises = createLoadPromises(this.config.skyscraperModelFiles, this.config.skyscraperModelDir, 'skyscraper', this.config.skyscraperBaseWidth, this.config.skyscraperBaseHeight, this.config.skyscraperBaseDepth);


        try {
            // Attendre toutes les promesses (houseResults sera toujours [])
            const [houseResults, buildingResults, industrialResults, parkResults, treeResults, skyscraperResults] = await Promise.all([
                 housePromises, // <- Contiendra toujours []
                 Promise.all(buildingPromises),
                 Promise.all(industrialPromises),
                 Promise.all(parkPromises),
                 Promise.all(treePromises),
                 Promise.all(skyscraperPromises)
            ]);

            // Assigner les résultats (en filtrant les nulls et en ignorant houseResults)
            // this.assets.house = houseResults.filter(r => r !== null); // <- Ligne retirée/commentée
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null);
            this.assets.tree = treeResults.filter(r => r !== null);
            this.assets.skyscraper = skyscraperResults.filter(r => r !== null);

            // Mettre à jour le log pour refléter l'ignorance des maisons
            console.log(`Assets chargés (MAISONS IGNORÉES): ${this.assets.building.length} immeubles, ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs, ${this.assets.tree.length} arbres, ${this.assets.skyscraper.length} gratte-ciels.`);
            return this.assets;

        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset();
            return this.assets;
        }
    }

    // ----- reset (MODIFIÉ pour s'assurer que 'house' est bien dans la structure) -----
    reset() {
        this.disposeAssets();
        // S'assurer que la clé 'house' existe, même vide
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
        this.assetIdCounter = 0;
    }

    // ----- loadAssetModel (Inchangé mais fonctionne pour 'skyscraper') -----
    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1) {
        // *** Ajout : Ignorer le type 'house' ici aussi ***
        if (type === 'house') {
            // console.log(`[${type}] Chargement ignoré pour ${path}`);
            return Promise.resolve(null); // Retourne null pour ce type
        }
        // --- Reste de la fonction inchangée ---
        const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
        const extension = path.split('.').pop()?.toLowerCase();
        return new Promise((resolve, reject) => {
            let loader;
            if (extension === 'fbx') { loader = this.fbxLoader; }
            else if (extension === 'glb' || extension === 'gltf') { loader = this.gltfLoader; }
            else {
                return reject(new Error(`[${modelId}] Format de fichier non supporté: ${extension} pour le chemin ${path}`));
            }
            loader.load(
                path,
                (loadedObject) => {
                    try {
                        const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;
                        if (!modelRootObject) {
                            return reject(new Error(`[${modelId}] Aucun objet racine trouvé dans ${path}.`));
                        }
                        const geometries = []; const materials = []; let hasValidMesh = false;
                        modelRootObject.traverse((child) => {
                            if (child.isMesh) {
                                hasValidMesh = true; child.updateMatrixWorld(true);
                                const clonedGeom = child.geometry.clone();
                                clonedGeom.applyMatrix4(child.matrixWorld);
                                geometries.push(clonedGeom);
                                if (child.material) {
                                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                                    mats.forEach(m => { if (m && m.isMaterial) { materials.push(m); } });
                                }
                                child.castShadow = true; child.receiveShadow = true;
                            }
                        });
                        if (!hasValidMesh) { return reject(new Error(`[${modelId}] Aucune géométrie de mesh valide trouvée dans ${path}.`)); }
                        if (geometries.length === 0) { return reject(new Error(`[${modelId}] Aucune géométrie collectée dans ${path}.`)); }
                        const mergedGeometry = mergeGeometries(geometries, false);
                        if (!mergedGeometry) { geometries.forEach(g => g.dispose()); return reject(new Error(`[${modelId}] Echec de la fusion des géométries pour ${path}.`)); }
                        mergedGeometry.center();
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) { mergedGeometry.dispose(); geometries.forEach(g => g.dispose()); return reject(new Error(`[${modelId}] Echec calcul BBox pour ${path}.`)); }
                        const size = new THREE.Vector3(); bbox.getSize(size);
                        const centerOffset = new THREE.Vector3(); bbox.getCenter(centerOffset);
                        size.x = Math.max(size.x, 0.001); size.y = Math.max(size.y, 0.001); size.z = Math.max(size.z, 0.001);
                        const fittingScaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);
                        const sizeAfterFitting = size.clone().multiplyScalar(fittingScaleFactor);
                        let baseMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        if (!baseMaterial || !baseMaterial.isMaterial) { baseMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc }); }
                        const finalMaterial = baseMaterial.clone();
                        if (!finalMaterial.color) { finalMaterial.color = new THREE.Color(0xcccccc); }
                        resolve({ id: modelId, geometry: mergedGeometry, material: finalMaterial, fittingScaleFactor: fittingScaleFactor, userScale: userScale, centerOffset: centerOffset, sizeAfterFitting: sizeAfterFitting });
                        geometries.forEach(g => g.dispose());
                    } catch(processingError) {
                         console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
                         geometries?.forEach(g => g?.dispose()); if (mergedGeometry) mergedGeometry.dispose();
                         reject(processingError);
                    }
                },
                undefined,
                (error) => { console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelId}]:`, error); reject(error); }
            );
        });
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