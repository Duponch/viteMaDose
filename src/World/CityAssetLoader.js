// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    // constructor reçoit maintenant la config complète de CityManager
    constructor(config) {
        this.config = config;
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();

        this.assets = {
            house: [],
            building: [],
            industrial: [],
            park: []
        };
        this.assetIdCounter = 0;
        console.log("CityAssetLoader initialisé (support FBX & GLB/GLTF et scale par modèle).");
    }

    getRandomAssetData(type) {
        const modelList = this.assets[type];
        if (!modelList || modelList.length === 0) { return null; }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    getAssetDataById(id) {
        for (const type in this.assets) {
             if (this.assets.hasOwnProperty(type)) {
                const found = this.assets[type].find(asset => asset.id === id);
                if (found) return found;
            }
        }
        return null;
    }

    async loadAssets() {
        console.log("Chargement des assets (avec scale spécifique)...");
        this.reset();

        // MODIFIÉ: Fonction interne pour gérer la nouvelle structure de config
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => {
            if (!assetConfigs || !dir || !type || width == null || height == null || depth == null) {
                console.warn(`Configuration incomplète pour le type '${type}', chargement ignoré.`);
                return [];
            }
            // map sur les objets de configuration { file, scale }
            return (assetConfigs || []).map(assetConfig => {
                    // Vérifie si l'élément est un objet avec 'file' (nouvelle structure) ou juste une string (ancienne structure pour compatibilité ?)
                    // Pour ce cas, on assume que c'est toujours un objet comme défini dans CityManager
                    if (typeof assetConfig !== 'object' || !assetConfig.file) {
                        console.error(`Format de configuration d'asset invalide pour le type ${type}:`, assetConfig);
                        return Promise.resolve(null); // Retourne une promesse résolue à null pour ne pas bloquer Promise.all
                    }
                    const fileName = assetConfig.file;
                    const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1; // Default scale is 1

                    return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale) // Passe userScale
                        .catch(error => {
                            console.error(`Echec chargement ${type} ${fileName}:`, error);
                            return null; // Permet à Promise.all de continuer même si un modèle échoue
                        });
                }
            );
        };

        // Utilise la fonction modifiée createLoadPromises
        const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const buildingPromises = createLoadPromises(this.config.buildingModelFiles, this.config.buildingModelDir, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth);
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);
        const parkPromises = createLoadPromises(this.config.parkModelFiles, this.config.parkModelDir, 'park', this.config.parkBaseWidth, this.config.parkBaseHeight, this.config.parkBaseDepth);


        try {
            const [houseResults, buildingResults, industrialResults, parkResults] = await Promise.all([
                 Promise.all(housePromises),
                 Promise.all(buildingPromises),
                 Promise.all(industrialPromises),
                 Promise.all(parkPromises)
            ]);

            // Assigner les résultats filtrés
            this.assets.house = houseResults.filter(r => r !== null);
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null);

            console.log(`Assets chargés: ${this.assets.house.length} maisons, ${this.assets.building.length} immeubles, ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs (FBX/GLB).`);
            return this.assets;

        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset();
            return this.assets; // Retourner l'objet assets (potentiellement vide ou partiellement rempli)
        }
    }

    reset() {
        this.disposeAssets();
        this.assets = { house: [], building: [], industrial: [], park: [] };
        this.assetIdCounter = 0;
    }

    // MODIFIÉ: Ajout du paramètre userScale
    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1) { // userScale avec défaut 1
        const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
        const extension = path.split('.').pop()?.toLowerCase();

        // console.log(`Tentative chargement [${modelId}] format ${extension}: ${path} (User Scale: ${userScale})`);

        return new Promise((resolve, reject) => {
            let loader;
            if (extension === 'fbx') { loader = this.fbxLoader; }
            else if (extension === 'glb' || extension === 'gltf') { loader = this.gltfLoader; }
            else { return reject(new Error(`[${modelId}] Format de fichier non supporté: ${extension}`)); }

            loader.load(
                path,
                (loadedObject) => {
                    try {
                        const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;
                        if (!modelRootObject) { return reject(new Error(`[${modelId}] Aucun objet racine trouvé.`)); }

                        const geometries = [];
                        const materials = [];
                        modelRootObject.traverse((child) => {
                            if (child.isMesh) {
                                child.updateMatrixWorld(true);
                                const clonedGeom = child.geometry.clone();
                                // Appliquer la transformation du node au clone de la géométrie
                                // Important si le modèle FBX/GLTF a des transformations internes
                                clonedGeom.applyMatrix4(child.matrixWorld);
                                geometries.push(clonedGeom);
                                if (child.material) {
                                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                                    mats.forEach(m => { if (m) materials.push(m.clone()); });
                                }
                            }
                        });

                        if (geometries.length === 0) { return reject(new Error(`[${modelId}] Aucune géométrie de mesh trouvée.`)); }

                        // Fusionner les géométries déjà transformées en espace monde
                        const mergedGeometry = mergeGeometries(geometries, false);
                        if (!mergedGeometry) { return reject(new Error(`[${modelId}] Echec fusion géométries.`)); }

                        // Réinitialiser la position de la géométrie fusionnée car les transformations ont été appliquées
                        mergedGeometry.center(); // Centre la géométrie à l'origine (0,0,0)

                        // Recalculer la bounding box APRES avoir centré
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) { return reject(new Error(`[${modelId}] Echec calcul BBox après centrage.`)); }

                        const size = new THREE.Vector3(); bbox.getSize(size);
                        const center = new THREE.Vector3(); bbox.getCenter(center); // Devrait être (0,0,0) ou très proche

                        // Éviter division par zéro si une dimension est nulle
                        size.x = Math.max(size.x, 0.001); size.y = Math.max(size.y, 0.001); size.z = Math.max(size.z, 0.001);

                        // Calculer le facteur de scale pour AJUSTER à la taille de BASE
                        const fittingScaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);

                        // La taille finale après ajustement (sans le userScale pour l'instant)
                        const sizeAfterFitting = size.clone().multiplyScalar(fittingScaleFactor);

                        // Préparer le matériau final
                        let finalMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        if (!finalMaterial.isMaterial) { // S'assurer que c'est un vrai matériau
                            finalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        }
                        // Clonage final pour s'assurer que chaque InstancedMesh utilise une copie unique (évite pb de side effects)
                        finalMaterial = finalMaterial.clone();
                        if (!finalMaterial.color) finalMaterial.color = new THREE.Color(0xcccccc);


                        // MODIFIÉ: Ajouter userScale à l'objet retourné
                        resolve({
                            id: modelId,
                            geometry: mergedGeometry,
                            material: finalMaterial,
                            fittingScaleFactor: fittingScaleFactor, // Le scale pour atteindre la taille de base
                            userScale: userScale,                   // Le scale défini dans la config
                            centerOffset: center,                  // Offset calculé (devrait être proche de 0 après .center())
                            sizeAfterFitting: sizeAfterFitting       // Taille après application de fittingScaleFactor seul
                        });

                    } catch(processingError) {
                         console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
                         // Disposer la géométrie potentiellement créée mais non utilisée
                         geometries.forEach(g => g.dispose());
                         if (mergedGeometry) mergedGeometry.dispose();
                         reject(processingError);
                    }
                },
                undefined, // onProgress
                (error) => {
                    console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelId}]:`, error);
                    reject(error);
                }
            );
        });
    }

    disposeAssets() {
        console.log("Disposition des assets chargés (incluant Parcs)...");
        let disposedGeometries = 0;
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.geometry) {
                    assetData.geometry.dispose();
                    disposedGeometries++;
                }
                // Les matériaux sont clonés maintenant, donc ils devraient être gérés par GC
                // Si on utilisait des matériaux partagés ici, il faudrait les disposer aussi.
            });
        });
         if (disposedGeometries > 0) { console.log(`  - ${disposedGeometries} géometries disposées.`); }
         this.assets = { house: [], building: [], industrial: [], park: [] };
    }
}