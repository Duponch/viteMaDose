// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import HouseRenderer from './HouseRenderer.js';
import BuildingRenderer from './BuildingRenderer.js';
import SkyscraperRenderer from './SkyscraperRenderer.js';

export default class CityAssetLoader {
    // ----- CONSTRUCTEUR -----
    constructor(config) {
        this.config = config;
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();
        this.assets = {
            house: [],
            building: [],
            industrial: [],
            park: [],
            tree: [],
            skyscraper: []
        };
        this.assetIdCounter = 0;
        // Création des instances de HouseRenderer, BuildingRenderer et SkyscraperRenderer
        this.houseRenderer = new HouseRenderer(config, {});
        this.buildingRenderer = new BuildingRenderer(config, {});
        this.skyscraperRenderer = new SkyscraperRenderer(config, {});
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
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
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
            return this.generateProceduralTree(baseWidth, baseHeight, baseDepth, userScale);
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

    // ----- generateProceduralTree (Nouvelle méthode) -----
    generateProceduralTree(baseWidth, baseHeight, baseDepth, userScale = 1) {
        console.log("[Tree Proc] Début de la génération de l'arbre procédural.");
        const treeGroup = new THREE.Group(); // Groupe pour contenir les parties de l'arbre

        // Matériaux (similaires à votre exemple)
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513, name: "TreeTrunkMat" });
        const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22, name: "TreeFoliageMat" });

        // Tronc (Cylindre basique) - Dimensions initiales à ajuster
        const trunkHeight = baseHeight * 0.4; // Exemple: 40% de la hauteur totale
        const trunkRadiusBottom = baseWidth * 0.15;
        const trunkRadiusTop = baseWidth * 0.1;
        const trunkGeometry = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 6);
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2; // Placer la base du tronc à y=0
        treeGroup.add(trunk);
        console.log("[Tree Proc] Tronc créé et ajouté au groupe.");

        // Feuillage (Icosaèdres) - Positions et tailles relatives
        const foliageBaseY = trunkHeight;
        const foliageHeightFactor = baseHeight * 0.6; // 60% restant pour le feuillage
        const foliageWidthFactor = baseWidth * 0.5; // Rayon max du feuillage

        const foliage1 = new THREE.Mesh(new THREE.IcosahedronGeometry(foliageWidthFactor * 0.9, 0), foliageMaterial);
        foliage1.position.y = foliageBaseY + foliageHeightFactor * 0.3;
        treeGroup.add(foliage1);

        const foliage2 = new THREE.Mesh(new THREE.IcosahedronGeometry(foliageWidthFactor * 0.7, 0), foliageMaterial);
        foliage2.position.y = foliageBaseY + foliageHeightFactor * 0.65;
        foliage2.position.x = foliageWidthFactor * 0.3;
        foliage2.rotation.z = Math.PI / 5;
        treeGroup.add(foliage2);

        const foliage3 = new THREE.Mesh(new THREE.IcosahedronGeometry(foliageWidthFactor * 0.6, 0), foliageMaterial);
        foliage3.position.y = foliageBaseY + foliageHeightFactor * 0.55;
        foliage3.position.x = -foliageWidthFactor * 0.25;
        foliage3.rotation.z = -Math.PI / 6;
        treeGroup.add(foliage3);
        console.log("[Tree Proc] Feuillage créé et ajouté au groupe.");

        // --- Fusion et calcul de BBox (similaire à loadAssetModel) ---
        const allGeoms = [];
        const materialMap = new Map(); // Pour regrouper par matériau si besoin

        treeGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);

                // Ajouter un attribut index à la géométrie si elle n'en a pas
                if (!clonedGeom.index) {
                    const position = clonedGeom.attributes.position;
                    if (position) {
                        const count = position.count;
                        const indices = new Uint16Array(count);
                        for (let i = 0; i < count; i++) {
                            indices[i] = i;
                        }
                        clonedGeom.setIndex(new THREE.BufferAttribute(indices, 1));
                    }
                }

                allGeoms.push(clonedGeom);

                // Regrouper par matériau
                const matName = child.material.name || 'default_tree_mat';
                if (!materialMap.has(matName)) {
                    materialMap.set(matName, { material: child.material.clone(), geoms: [] });
                }
                materialMap.get(matName).geoms.push(clonedGeom);
            }
        });
        console.log("[Tree Proc] Parcours du groupe terminé. Nombre de géométries collectées:", allGeoms.length);

        if (allGeoms.length === 0) {
            console.error("[Tree Proc] Aucune géométrie valide trouvée après le parcours du groupe. Vérifiez la création des Meshes.");
            // Nettoyage des géométries créées
            trunkGeometry.dispose();
            foliage1.geometry.dispose();
            foliage2.geometry.dispose();
            foliage3.geometry.dispose();
            trunkMaterial.dispose();
            foliageMaterial.dispose();
            return null;
        }

        // Fusionner toutes les géométries en une seule pour le calcul de la BBox
        const mergedGeometry = mergeGeometries(allGeoms, false); // false = ne pas créer de groupes
        if (!mergedGeometry) {
            // Log ajouté pour plus de détails
            console.error("[Tree Proc] Échec de la fonction mergeGeometries. Géométries d'entrée:", allGeoms);
            allGeoms.forEach(g => g.dispose());
             trunkMaterial.dispose();
             foliageMaterial.dispose();
            return null;
        }
        console.log("[Tree Proc] Géométries fusionnées avec succès.");

        mergedGeometry.computeBoundingBox();
        const bbox = mergedGeometry.boundingBox;
        const centerOffset = new THREE.Vector3();
        bbox.getCenter(centerOffset);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        // Ajuster la géométrie pour que son centre soit à l'origine (0,0,0)
        // Et que sa base soit à y=0 (en translatant par -min.y)
        const minY = bbox.min.y;
        mergedGeometry.translate(-centerOffset.x, -minY, -centerOffset.z); // Décale pour que le bas soit à y=0 et centré en XZ

        // Recalculer BBox après translation
        mergedGeometry.computeBoundingBox();
        const finalBBox = mergedGeometry.boundingBox;
        const finalSize = new THREE.Vector3();
        finalBBox.getSize(finalSize);
        finalSize.x = Math.max(finalSize.x, 0.001);
        finalSize.y = Math.max(finalSize.y, 0.001);
        finalSize.z = Math.max(finalSize.z, 0.001);

        // Calculer le facteur d'échelle pour correspondre aux dimensions de base
        const fittingScaleFactor = Math.min(baseWidth / finalSize.x, baseHeight / finalSize.y, baseDepth / finalSize.z);
        const sizeAfterFitting = finalSize.clone().multiplyScalar(fittingScaleFactor);

        // Créer les parts pour chaque matériau
        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;

            const mergedPartGeometry = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeometry) {
                console.error(`[Tree Proc] Échec de la fusion des géométries pour le matériau ${matName}.`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }

            // Appliquer la même translation que la géométrie globale
            mergedPartGeometry.translate(-centerOffset.x, -minY, -centerOffset.z);

            const finalMaterial = groupData.material;
            finalMaterial.name = `ProcTreeMat_${matName}_${this.assetIdCounter}`;

            parts.push({
                geometry: mergedPartGeometry,
                material: finalMaterial
            });

            groupData.geoms.forEach(g => g.dispose());
        });

        // Nettoyage des géométries temporaires
        allGeoms.forEach(g => g.dispose());
        trunkMaterial.dispose();
        foliageMaterial.dispose(); // Dispose l'original, on utilise le clone

        const modelId = `tree_procedural_${this.assetIdCounter++}`;

        // Retourner la structure d'asset attendue
        const treeAsset = {
            id: modelId,
            parts: parts, // Utiliser parts au lieu de geometry et material
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(0, finalSize.y / 2, 0), // Le centre est maintenant à mi-hauteur (car base à y=0)
            sizeAfterFitting: sizeAfterFitting
        };
        console.log("[Tree Proc] Asset d'arbre généré avec succès:", treeAsset);
        return treeAsset;
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
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
    }
}
