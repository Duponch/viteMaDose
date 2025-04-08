// src/World/CityAssetLoader.js

import * as THREE from 'three';
// Importer les deux loaders
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Utilitaire pour fusionner les géométries
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    constructor(config) {
        this.config = config; // Contient les dirs, listes de fichiers, tailles de base...
        // Instancier les deux loaders
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();

        // Structure pour stocker les données des modèles chargés (par type)
        this.assets = {
            house: [],
            building: [],
            industrial: []
        };
        this.assetIdCounter = 0;
        console.log("CityAssetLoader initialisé (support FBX & GLB/GLTF).");
    }

    /**
     * Retourne les données d'un modèle choisi aléatoirement pour le type spécifié.
     */
    getRandomAssetData(type) {
        const modelList = this.assets[type];
        if (!modelList || modelList.length === 0) { return null; }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    /**
     * Retourne les données d'un modèle spécifique par son ID unique.
     */
    getAssetDataById(id) {
        for (const type in this.assets) {
             if (this.assets.hasOwnProperty(type)) {
                const found = this.assets[type].find(asset => asset.id === id);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Charge tous les modèles (FBX, GLB, GLTF) listés dans la configuration.
     */
    async loadAssets() {
        console.log("Chargement des assets (FBX & GLB/GLTF)...");
        this.reset();

        const createLoadPromises = (files, dir, type, width, height, depth) => {
            return (files || []).map(fileName =>
                // Appel à la méthode unifiée qui gère les deux formats
                this.loadAssetModel(dir + fileName, type, width, height, depth)
                    .catch(error => {
                        console.error(`Echec chargement ${type} ${fileName}:`, error);
                        return null;
                    })
            );
        };

        const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const buildingPromises = createLoadPromises(this.config.buildingModelFiles, this.config.buildingModelDir, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth);
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);

        try {
            const [houseResults, buildingResults, industrialResults] = await Promise.all([
                 Promise.all(housePromises),
                 Promise.all(buildingPromises),
                 Promise.all(industrialPromises)
            ]);

            this.assets.house = houseResults.filter(r => r !== null);
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);

            console.log(`Assets chargés: ${this.assets.house.length} maisons, ${this.assets.building.length} immeubles, ${this.assets.industrial.length} usines (FBX/GLB).`);
            return this.assets;

        } catch (error) {
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset();
            return this.assets;
        }
    }

    /**
     * Réinitialise l'état du loader.
     */
    reset() {
        this.disposeAssets();
        this.assets = { house: [], building: [], industrial: [] };
        this.assetIdCounter = 0;
    }

    /**
     * Charge un modèle 3D (FBX ou GLB/GLTF), extrait et prépare ses données.
     * @param {string} path Chemin complet vers le fichier modèle.
     * @param {string} type Type d'asset ('house', 'building', 'industrial').
     * @param {number} baseWidth Largeur cible pour le scaling.
     * @param {number} baseHeight Hauteur cible pour le scaling.
     * @param {number} baseDepth Profondeur cible pour le scaling.
     * @returns {Promise<object>} Promesse résolvant avec les données de l'asset.
     */
    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth) {
        const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`; // ID plus descriptif
        const extension = path.split('.').pop()?.toLowerCase();

        // console.log(`Tentative chargement [${modelId}] format ${extension}: ${path}`);

        return new Promise((resolve, reject) => {
            // --- Choix du Loader ---
            let loader;
            if (extension === 'fbx') {
                loader = this.fbxLoader;
            } else if (extension === 'glb' || extension === 'gltf') {
                loader = this.gltfLoader;
            } else {
                return reject(new Error(`[${modelId}] Format de fichier non supporté: ${extension}`));
            }

            // --- Chargement ---
            loader.load(
                path,
                (loadedObject) => { // Callback de succès
                    try { // Ajouter un try/catch pour la logique interne complexe
                        // --- Obtenir l'objet racine de la scène ---
                        // GLTF Loader retourne un objet avec .scene, FBX retourne directement le groupe/objet
                        const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;

                        if (!modelRootObject) {
                            return reject(new Error(`[${modelId}] Aucun objet racine trouvé après chargement.`));
                        }

                        // --- Extraction Géométrie et Matériaux (Logique unifiée) ---
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
                                    mats.forEach(m => { if (m) materials.push(m.clone()); }); // Cloner et vérifier nullité
                                }
                            }
                        });

                        if (geometries.length === 0) { return reject(new Error(`[${modelId}] Aucune géométrie de mesh trouvée dans ${path}`)); }

                        // --- Fusion et Matériau Final ---
                        const mergedGeometry = mergeGeometries(geometries, false);
                        if (!mergedGeometry) { return reject(new Error(`[${modelId}] Echec fusion géométries pour ${path}`)); }

                        let finalMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        if (!finalMaterial.color) finalMaterial.color = new THREE.Color(0xcccccc);
                        // Assurer que le matériau est compatible Standard (pourrait être Phong du FBX)
                        // Optionnel: convertir si nécessaire pour cohérence PBR
                        if (!(finalMaterial instanceof THREE.MeshStandardMaterial || finalMaterial instanceof THREE.MeshBasicMaterial)) {
                             // console.warn(`[${modelId}] Matériau type ${finalMaterial.type}, conversion en Standard suggérée pour PBR.`);
                             // Pourrait être converti ici si besoin : new THREE.MeshStandardMaterial().copy(finalMaterial) ... mais complexe
                        }


                        // --- Calculs BBox et Scaling ---
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) { return reject(new Error(`[${modelId}] Echec calcul BBox pour ${path}`)); }

                        const size = new THREE.Vector3(); bbox.getSize(size);
                        const center = new THREE.Vector3(); bbox.getCenter(center);

                        size.x = Math.max(size.x, 0.001); size.y = Math.max(size.y, 0.001); size.z = Math.max(size.z, 0.001);

                        const scaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);
                        const sizeAfterScaling = size.clone().multiplyScalar(scaleFactor);

                        // --- Résolution de la promesse ---
                        resolve({
                            id: modelId, geometry: mergedGeometry, material: finalMaterial,
                            scaleFactor: scaleFactor, centerOffset: center, sizeAfterScaling: sizeAfterScaling
                        });
                    } catch(processingError) {
                         console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
                         reject(processingError); // Rejeter la promesse si le traitement échoue
                    }
                },
                undefined, // onProgress
                (error) => { // onError du loader
                    console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelId}]:`, error);
                    reject(error);
                }
            ); // Fin loader.load
        }); // Fin Promise
    }

    /**
     * Dispose les ressources (géométries) de tous les assets chargés.
     */
    disposeAssets() {
        console.log("Disposition des assets chargés (FBX/GLB)...");
        let disposedGeometries = 0;
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.geometry) {
                    assetData.geometry.dispose();
                    disposedGeometries++;
                }
                // Ne pas disposer les matériaux ici (gestion complexe du partage/clonage)
            });
            // this.assets[type] = []; // Fait dans reset()
        });
         if (disposedGeometries > 0) { console.log(`  - ${disposedGeometries} géometries disposées.`); }
         // Vider explicitement ici aussi pour être sûr que disposeAssets seul fonctionne
         this.assets = { house: [], building: [], industrial: [] };
    }
}