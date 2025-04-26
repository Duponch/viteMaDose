// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import HouseRenderer from './HouseRenderer.js';
import BuildingRenderer from './BuildingRenderer.js';
import SkyscraperRenderer from './SkyscraperRenderer.js';
import TreeRenderer from './TreeRenderer.js';

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
            crosswalk: []
        };
        this.assetIdCounter = 0;
        this.loadedAssets = new Map();
        this.loadingPromises = new Map();
        // Création des instances de HouseRenderer, BuildingRenderer et SkyscraperRenderer
        this.houseRenderer = new HouseRenderer(config, {});
        this.buildingRenderer = new BuildingRenderer(config, {});
        this.skyscraperRenderer = new SkyscraperRenderer(config, {});
        this.treeRenderer = new TreeRenderer(config, materials);
        console.log("CityAssetLoader initialisé. Utilisation de HouseRenderer pour les maisons, BuildingRenderer pour les immeubles et SkyscraperRenderer pour les gratte-ciels.");
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
    async loadAssets() {
        console.log("Chargement des assets (maisons via HouseRenderer, immeubles via BuildingRenderer, gratte-ciels via SkyscraperRenderer, etc.)...");
        this.reset();

        // Fonction interne createLoadPromises mise à jour pour gérer les types procéduraux.
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => {
            if (type === 'house' || type === 'building' || type === 'skyscraper' || type === 'tree') {
                console.log(`-> Préparation de la génération procédurale pour le type '${type}'...`);
                return [
                    this.loadAssetModel(null, type, width, height, depth, 1.0)
                        .catch(error => {
                            console.error(`Echec génération procédurale ${type}:`, error);
                            return null;
                        })
                ];
            }
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
                    console.error(`Format de configuration d'asset invalide pour le type ${type}:`, assetConfig, `dans ${dir}`);
                    return Promise.resolve(null);
                }
                const fileName = assetConfig.file;
                const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1;
                return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale)
                    .catch(error => {
                        console.error(`Echec chargement ${type} ${fileName}:`, error);
                        return null;
                    });
            });
        };

        const housePromises = createLoadPromises(
            this.config.houseModelFiles,
            this.config.houseModelDir,
            'house',
            this.config.houseBaseWidth,
            this.config.houseBaseHeight,
            this.config.houseBaseDepth
        );
        const buildingPromises = createLoadPromises(
            null,
            null,
            'building',
            this.config.buildingBaseWidth,
            this.config.buildingBaseHeight,
            this.config.buildingBaseDepth
        );
        const industrialPromises = createLoadPromises(
            this.config.industrialModelFiles,
            this.config.industrialModelDir,
            'industrial',
            this.config.industrialBaseWidth,
            this.config.industrialBaseHeight,
            this.config.industrialBaseDepth
        );
        const parkPromises = createLoadPromises(
            this.config.parkModelFiles,
            this.config.parkModelDir,
            'park',
            this.config.parkBaseWidth,
            this.config.parkBaseHeight,
            this.config.parkBaseDepth
        );
        const treePromises = createLoadPromises(
            null,
            null,
            'tree',
            this.config.treeBaseWidth,
            this.config.treeBaseHeight,
            this.config.treeBaseDepth
        );
        const skyscraperPromises = createLoadPromises(
            this.config.skyscraperModelFiles,
            this.config.skyscraperModelDir,
            'skyscraper',
            this.config.skyscraperBaseWidth,
            this.config.skyscraperBaseHeight,
            this.config.skyscraperBaseDepth
        );

        try {
            const [houseResults, buildingResults, industrialResults, parkResults, treeResults, skyscraperResults] = await Promise.all([
                Promise.all(housePromises),
                Promise.all(buildingPromises),
                Promise.all(industrialPromises),
                Promise.all(parkPromises),
                Promise.all(treePromises),
                Promise.all(skyscraperPromises)
            ]);

            // Attribution des résultats aux assets, en filtrant les null.
            this.assets.house = houseResults.filter(r => r !== null);
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null);
            this.assets.tree = treeResults.filter(r => r !== null);
            this.assets.skyscraper = skyscraperResults.filter(r => r !== null);

            console.log(`Assets chargés: ${this.assets.house.length} maisons (procédurales), ${this.assets.building.length} immeubles (procéduraux), ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs, ${this.assets.tree.length} arbres, ${this.assets.skyscraper.length} gratte-ciels.`);
            return this.assets;
        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset();
            return this.assets;
        }
    }

    // ----- reset -----
    reset() {
        this.disposeAssets();
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [], crosswalk: [] };
        this.assetIdCounter = 0;
    }

    // ----- loadAssetModel -----
    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1) {
		
        // Pour les maisons, utiliser HouseRenderer.
        if (type === 'house') {
            return new Promise((resolve) => {
                try {
                    const asset = this.houseRenderer.generateProceduralHouse(baseWidth, baseHeight, baseDepth, userScale);
                    resolve(asset);
                } catch (error) {
                    console.error("Erreur lors de la génération de la maison procédurale:", error);
                    resolve(null);
                }
            });
        }
        // Pour les immeubles, utiliser BuildingRenderer.
        if (type === 'building') {
            return new Promise((resolve) => {
                try {
                    const asset = this.buildingRenderer.generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale);
                    resolve(asset);
                } catch (error) {
                    console.error("Erreur lors de la génération de l'immeuble procédural:", error);
                    resolve(null);
                }
            });
        }
        // Pour les gratte-ciels, utiliser SkyscraperRenderer.
        if (type === 'skyscraper') {
            return new Promise((resolve) => {
                try {
                    const asset = this.skyscraperRenderer.generateProceduralSkyscraper(baseWidth, baseHeight, baseDepth, userScale);
                    resolve(asset);
                } catch (error) {
                    console.error("Erreur lors de la génération du gratte-ciel procédural:", error);
                    resolve(null);
                }
            });
        }
        // Ajouter la logique de génération pour le type 'tree'
        if (type === 'tree') {
            console.log('[Tree Proc] Génération d\'un arbre procédural');
            const treeAsset = this.treeRenderer.generateProceduralTree();
            if (!treeAsset) {
                console.error('[Tree Proc] Échec de la génération de l\'arbre');
                return null;
            }
            return treeAsset;
        }
        // --- Logique existante pour les autres types (industrial, park) ---
        // Modifié la condition pour exclure 'tree' si path est null
        if (!path && type !== 'tree') {
            console.error(`[AssetLoader] Path manquant pour le type '${type}' (non procédural). Asset ignoré.`);
            return Promise.resolve(null);
        }
        // Si c'est un arbre procédural, path est null, on saute le chargement de fichier
        if (type === 'tree') {
             // Le resolve(asset) dans le bloc 'if (type === 'tree')' ci-dessus a déjà traité ce cas.
             // On ne devrait jamais arriver ici pour un arbre procédural.
             // Mais par sécurité, on pourrait retourner null ici si jamais la logique changeait.
             console.warn("[AssetLoader] Tentative de chargement de fichier pour un arbre procédural détectée, ignorée.");
             return Promise.resolve(null);
        }

        // --- Logique de chargement de fichier pour industrial, park, etc. (inchangée) ---
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
                            console.error(`[${modelId}] Échec de la fusion des géométries pour ${path}. Asset ignoré.`);
                            geometries.forEach(g => g.dispose());
                            return resolve(null);
                        }
                        mergedGeometry.center();
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) {
                            console.error(`[${modelId}] Échec calcul BBox pour ${path}. Asset ignoré.`);
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

    // ----- disposeAssets -----
    disposeAssets() {
        console.log("Disposition des assets chargés (traitement des assets procéduraux)...");
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
            console.log(`  - ${disposedGeometries} géométries et ${disposedMaterials} matériaux disposés.`);
        }
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [], crosswalk: [] };
    }
}
