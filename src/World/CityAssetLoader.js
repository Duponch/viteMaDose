// src/World/CityAssetLoader.js

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    constructor(config) {
        this.config = config; // Contient maintenant les infos pour house, building, industrial, ET park
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();

        // Structure pour stocker les données des modèles chargés (par type)
        this.assets = {
            house: [],
            building: [],
            industrial: [],
            park: [] // *** NOUVEAU: Ajouter 'park' ***
        };
        this.assetIdCounter = 0;
        console.log("CityAssetLoader initialisé (support FBX & GLB/GLTF pour House, Building, Industrial, Park).");
    }

    getRandomAssetData(type) {
        const modelList = this.assets[type]; // Fonctionne tel quel si 'type' est 'park'
        if (!modelList || modelList.length === 0) { return null; }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    getAssetDataById(id) {
        // Fonctionne tel quel, parcourt tous les types dans this.assets
        for (const type in this.assets) {
             if (this.assets.hasOwnProperty(type)) {
                const found = this.assets[type].find(asset => asset.id === id);
                if (found) return found;
            }
        }
        return null;
    }

    async loadAssets() {
        console.log("Chargement des assets (incluant Parcs)...");
        this.reset();

        const createLoadPromises = (files, dir, type, width, height, depth) => {
            // Vérifier si les paramètres nécessaires existent avant de mapper
            if (!files || !dir || !type || width == null || height == null || depth == null) {
                console.warn(`Configuration incomplète pour le type '${type}', chargement ignoré.`);
                return []; // Retourner un tableau vide si la config manque
            }
            return (files || []).map(fileName =>
                this.loadAssetModel(dir + fileName, type, width, height, depth)
                    .catch(error => {
                        console.error(`Echec chargement ${type} ${fileName}:`, error);
                        return null;
                    })
            );
        };

        // Créer les promesses pour chaque type, y compris les parcs
        const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const buildingPromises = createLoadPromises(this.config.buildingModelFiles, this.config.buildingModelDir, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth);
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);
        // *** NOUVEAU: Promesses pour les parcs ***
        const parkPromises = createLoadPromises(this.config.parkModelFiles, this.config.parkModelDir, 'park', this.config.parkBaseWidth, this.config.parkBaseHeight, this.config.parkBaseDepth);


        try {
            // Attendre toutes les promesses en parallèle
            const [houseResults, buildingResults, industrialResults, parkResults] = await Promise.all([ // *** AJOUTÉ parkResults ***
                 Promise.all(housePromises),
                 Promise.all(buildingPromises),
                 Promise.all(industrialPromises),
                 Promise.all(parkPromises) // *** AJOUTÉ parkPromises ***
            ]);

            // Assigner les résultats filtrés
            this.assets.house = houseResults.filter(r => r !== null);
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null); // *** NOUVEAU: Assigner parcs ***

            // Mettre à jour le log
            console.log(`Assets chargés: ${this.assets.house.length} maisons, ${this.assets.building.length} immeubles, ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs (FBX/GLB).`); // *** MODIFIÉ log ***
            return this.assets;

        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset(); // Assurer la réinitialisation en cas d'erreur
            return this.assets; // Retourner l'objet assets vide
        }
    }

    reset() {
        this.disposeAssets();
        // Réinitialiser tous les types, y compris les parcs
        this.assets = { house: [], building: [], industrial: [], park: [] }; // *** NOUVEAU: Ajouter park ***
        this.assetIdCounter = 0;
    }

    // La fonction loadAssetModel est générique et n'a pas besoin de modification
    // Elle utilise le 'type' passé en argument ('house', 'building', 'industrial', ou 'park')
    // pour créer l'ID unique (modelId).
    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth) {
        const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
        const extension = path.split('.').pop()?.toLowerCase();

        // console.log(`Tentative chargement [${modelId}] format ${extension}: ${path}`);

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
                                clonedGeom.applyMatrix4(child.matrixWorld);
                                geometries.push(clonedGeom);
                                if (child.material) {
                                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                                    mats.forEach(m => { if (m) materials.push(m.clone()); });
                                }
                            }
                        });

                        if (geometries.length === 0) { return reject(new Error(`[${modelId}] Aucune géométrie de mesh trouvée.`)); }

                        const mergedGeometry = mergeGeometries(geometries, false);
                        if (!mergedGeometry) { return reject(new Error(`[${modelId}] Echec fusion géométries.`)); }

                        let finalMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        if (!finalMaterial.color) finalMaterial.color = new THREE.Color(0xcccccc);
                         // Optionnel: Vérifier/Convertir matériau si besoin

                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) { return reject(new Error(`[${modelId}] Echec calcul BBox.`)); }

                        const size = new THREE.Vector3(); bbox.getSize(size);
                        const center = new THREE.Vector3(); bbox.getCenter(center);
                        size.x = Math.max(size.x, 0.001); size.y = Math.max(size.y, 0.001); size.z = Math.max(size.z, 0.001);

                        const scaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);
                        const sizeAfterScaling = size.clone().multiplyScalar(scaleFactor);

                        resolve({
                            id: modelId, geometry: mergedGeometry, material: finalMaterial,
                            scaleFactor: scaleFactor, centerOffset: center, sizeAfterScaling: sizeAfterScaling
                        });
                    } catch(processingError) {
                         console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
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
        // Itérer sur tous les types présents dans this.assets (inclut 'park')
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.geometry) {
                    assetData.geometry.dispose();
                    disposedGeometries++;
                }
            });
        });
         if (disposedGeometries > 0) { console.log(`  - ${disposedGeometries} géometries disposées.`); }
         // Vider explicitement ici aussi (redondant avec reset, mais sûr)
         this.assets = { house: [], building: [], industrial: [], park: [] }; // *** MODIFIÉ: Ajouter park ***
    }
}