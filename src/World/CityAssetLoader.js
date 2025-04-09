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

        // Ajout de 'skyscraper' et 'tree'
        this.assets = {
            house: [],
            building: [],
            industrial: [],
            park: [],
            tree: [],
            skyscraper: [] // <- Nouveau type
        };
        this.assetIdCounter = 0;
        console.log("CityAssetLoader initialisé (support FBX & GLB/GLTF, scale par modèle, incluant arbres et gratte-ciels).");
    }

    // ----- getRandomAssetData (Inchangé mais fonctionne pour 'skyscraper') -----
    getRandomAssetData(type) {
        // Fonctionne tel quel si 'type' est 'skyscraper' ou 'tree'
        const modelList = this.assets[type];
        if (!modelList || modelList.length === 0) {
            // console.warn(`Aucun asset chargé pour le type '${type}'.`); // Optionnel: Avertissement
            return null;
        }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    // ----- getAssetDataById (Inchangé mais fonctionne pour 'skyscraper') -----
    getAssetDataById(id) {
        // Fonctionne tel quel, parcourt tous les types y compris 'skyscraper'
        for (const type in this.assets) {
             if (this.assets.hasOwnProperty(type)) {
                const found = this.assets[type].find(asset => asset.id === id);
                if (found) return found;
            }
        }
        return null;
    }

    // ----- loadAssets MODIFIÉ -----
    async loadAssets() {
        console.log("Chargement des assets (incluant arbres et gratte-ciels)...");
        this.reset(); // Nettoie aussi skyscraper

        // Fonction interne createLoadPromises (inchangée mais utilisée pour skyscraper)
        const createLoadPromises = (assetConfigs, dir, type, width, height, depth) => {
            // Vérification de base de la config
           if (!assetConfigs || !dir || !type || width == null || height == null || depth == null) {
                console.warn(`Configuration incomplète ou invalide pour le type '${type}', chargement ignoré.`);
                return []; // Retourne un tableau vide pour Promise.all
            }
            // Assurer que assetConfigs est un tableau
            if (!Array.isArray(assetConfigs)) {
                console.warn(`'${type}ModelFiles' n'est pas un tableau dans la config. Chargement ignoré.`);
                return [];
            }
            // Traiter chaque élément de configuration
            return assetConfigs.map(assetConfig => {
                    // Vérifier si l'élément est un objet et a la propriété 'file'
                    if (typeof assetConfig !== 'object' || assetConfig === null || !assetConfig.file) {
                        console.error(`Format de configuration d'asset invalide pour le type ${type}:`, assetConfig, ` dans ${dir}`);
                        return Promise.resolve(null); // Résoudre avec null pour ne pas bloquer Promise.all
                    }
                    const fileName = assetConfig.file;
                    // Utiliser assetConfig.scale s'il est défini, sinon 1
                    const userScale = assetConfig.scale !== undefined ? assetConfig.scale : 1;

                    // Appeler loadAssetModel avec les paramètres corrects
                    return this.loadAssetModel(dir + fileName, type, width, height, depth, userScale)
                        .catch(error => {
                            // Gérer les erreurs de chargement spécifiques à un modèle
                            console.error(`Echec chargement ${type} ${fileName}:`, error);
                            return null; // Renvoyer null pour indiquer l'échec de ce modèle
                        });
                }
            );
        };

        // Créer les promesses pour tous les types
        const housePromises = createLoadPromises(this.config.houseModelFiles, this.config.houseModelDir, 'house', this.config.houseBaseWidth, this.config.houseBaseHeight, this.config.houseBaseDepth);
        const buildingPromises = createLoadPromises(this.config.buildingModelFiles, this.config.buildingModelDir, 'building', this.config.buildingBaseWidth, this.config.buildingBaseHeight, this.config.buildingBaseDepth);
        const industrialPromises = createLoadPromises(this.config.industrialModelFiles, this.config.industrialModelDir, 'industrial', this.config.industrialBaseWidth, this.config.industrialBaseHeight, this.config.industrialBaseDepth);
        const parkPromises = createLoadPromises(this.config.parkModelFiles, this.config.parkModelDir, 'park', this.config.parkBaseWidth, this.config.parkBaseHeight, this.config.parkBaseDepth);
        const treePromises = createLoadPromises(this.config.treeModelFiles, this.config.treeModelDir, 'tree', this.config.treeBaseWidth, this.config.treeBaseHeight, this.config.treeBaseDepth);
        // *** NOUVEAU: Promesses pour les gratte-ciels ***
        const skyscraperPromises = createLoadPromises(this.config.skyscraperModelFiles, this.config.skyscraperModelDir, 'skyscraper', this.config.skyscraperBaseWidth, this.config.skyscraperBaseHeight, this.config.skyscraperBaseDepth);


        try {
            // Attendre toutes les promesses
            // Ajout de skyscraperResults
            const [houseResults, buildingResults, industrialResults, parkResults, treeResults, skyscraperResults] = await Promise.all([
                 Promise.all(housePromises),
                 Promise.all(buildingPromises),
                 Promise.all(industrialPromises),
                 Promise.all(parkPromises),
                 Promise.all(treePromises),
                 Promise.all(skyscraperPromises) // <- Attendre les gratte-ciels
            ]);

            // Assigner les résultats (en filtrant les nulls dus aux erreurs)
            this.assets.house = houseResults.filter(r => r !== null);
            this.assets.building = buildingResults.filter(r => r !== null);
            this.assets.industrial = industrialResults.filter(r => r !== null);
            this.assets.park = parkResults.filter(r => r !== null);
            this.assets.tree = treeResults.filter(r => r !== null);
            this.assets.skyscraper = skyscraperResults.filter(r => r !== null); // <- Assigner les gratte-ciels

            // Mettre à jour le log
            console.log(`Assets chargés: ${this.assets.house.length} maisons, ${this.assets.building.length} immeubles, ${this.assets.industrial.length} usines, ${this.assets.park.length} parcs, ${this.assets.tree.length} arbres, ${this.assets.skyscraper.length} gratte-ciels.`); // <- Log modifié
            return this.assets; // Retourne l'objet assets complet

        } catch (error) {
            // Gère une erreur potentielle dans Promise.all lui-même (rare)
            console.error("Erreur durant le chargement groupé des assets:", error);
            this.reset(); // Assure un état propre en cas d'erreur majeure
            return this.assets; // Retourne l'état réinitialisé (vide)
        }
    }

    // ----- reset MODIFIÉ -----
    reset() {
        this.disposeAssets(); // Appelle disposeAssets qui gère maintenant skyscraper
        // Réinitialiser TOUS les types
        this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
        this.assetIdCounter = 0;
        // console.log("AssetLoader réinitialisé."); // Optionnel
    }

    // ----- loadAssetModel (Inchangé mais fonctionne pour 'skyscraper') -----
    async loadAssetModel(path, type, baseWidth, baseHeight, baseDepth, userScale = 1) {
        const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
        const extension = path.split('.').pop()?.toLowerCase();

        // console.log(`Tentative chargement [${modelId}] format ${extension}: ${path} (User Scale: ${userScale})`);

        return new Promise((resolve, reject) => {
            let loader;
            if (extension === 'fbx') { loader = this.fbxLoader; }
            else if (extension === 'glb' || extension === 'gltf') { loader = this.gltfLoader; }
            else {
                // Rejeter immédiatement si format non supporté
                return reject(new Error(`[${modelId}] Format de fichier non supporté: ${extension} pour le chemin ${path}`));
            }

            loader.load(
                path,
                (loadedObject) => {
                    // --- Bloc try...catch pour le traitement post-chargement ---
                    try {
                        const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;
                        if (!modelRootObject) {
                            // Rejeter si le modèle chargé est vide ou invalide
                            return reject(new Error(`[${modelId}] Aucun objet racine trouvé dans ${path}.`));
                        }

                        const geometries = [];
                        const materials = []; // Collecter les matériaux
                        let hasValidMesh = false; // Pour vérifier si au moins un mesh est trouvé

                        modelRootObject.traverse((child) => {
                            if (child.isMesh) {
                                hasValidMesh = true; // On a trouvé au moins un mesh
                                // S'assurer que la matrice world est à jour
                                child.updateMatrixWorld(true);
                                const clonedGeom = child.geometry.clone();

                                // Appliquer la transformation du node (position/rotation/scale DANS le modèle)
                                // à la géométrie clonée AVANT la fusion.
                                // Ceci place tous les morceaux en coordonnées "monde" relatives à la racine du modèle.
                                clonedGeom.applyMatrix4(child.matrixWorld);

                                // Appliquer la transformation inverse de la racine si nécessaire ?
                                // Non, car matrixWorld est déjà la transformation absolue.

                                geometries.push(clonedGeom);

                                // Gérer les matériaux (simples ou multiples)
                                if (child.material) {
                                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                                    mats.forEach(m => {
                                        if (m && m.isMaterial) { // Vérifier que c'est bien un matériau
                                            materials.push(m); // On prend le premier trouvé comme base, on le clonera plus tard
                                        }
                                    });
                                }
                                // Activer les ombres sur le mesh original (sera hérité par InstancedMesh)
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });

                        // Si aucun mesh n'a été trouvé dans le modèle
                        if (!hasValidMesh) {
                            return reject(new Error(`[${modelId}] Aucune géométrie de mesh valide trouvée dans ${path}.`));
                        }
                        // S'il n'y a pas de géométries collectées (étrange si hasValidMesh est true, mais sécurité)
                        if (geometries.length === 0) {
                            return reject(new Error(`[${modelId}] Aucune géométrie collectée bien qu'un mesh ait été détecté dans ${path}.`));
                        }

                        // Fusionner les géométries DÉJÀ TRANSFORMÉES
                        // false = ne pas utiliser les groupes de matériaux, on utilisera un seul matériau moyen
                        const mergedGeometry = mergeGeometries(geometries, false);
                        if (!mergedGeometry) {
                            // Si la fusion échoue (peut arriver avec des géométries invalides)
                            // Nettoyer les géométries clonées avant de rejeter
                            geometries.forEach(g => g.dispose());
                            return reject(new Error(`[${modelId}] Echec de la fusion des géométries pour ${path}.`));
                        }

                        // IMPORTANT: Centrer la géométrie fusionnée sur son origine locale (0,0,0)
                        // Cela annule la translation globale appliquée par applyMatrix4,
                        // mais conserve la forme et l'orientation relatives des parties.
                        mergedGeometry.center();

                        // Calculer la bounding box APRÈS la fusion ET le centrage
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) {
                            mergedGeometry.dispose(); // Nettoyer avant de rejeter
                            geometries.forEach(g => g.dispose());
                            return reject(new Error(`[${modelId}] Echec calcul BBox après fusion/centrage pour ${path}.`));
                        }

                        // Calculer la taille de la BBox centrée
                        const size = new THREE.Vector3();
                        bbox.getSize(size);

                        // Calculer le centre de la BBox (devrait être très proche de 0,0,0 après .center())
                        const centerOffset = new THREE.Vector3();
                         bbox.getCenter(centerOffset);
                         // Si le centre n'est pas proche de zéro, cela peut indiquer un problème avec .center() ou la géométrie elle-même.
                         // Note : On utilisera cet offset pour corriger la position finale dans PlotContentGenerator.

                        // Éviter la division par zéro si une dimension est nulle ou très petite
                        size.x = Math.max(size.x, 0.001);
                        size.y = Math.max(size.y, 0.001);
                        size.z = Math.max(size.z, 0.001);

                        // --- Calcul du Scale pour Ajustement ---
                        // On veut que le modèle RENTRE dans la boîte définie par baseWidth, baseHeight, baseDepth.
                        // On prend le ratio le plus petit pour s'assurer qu'aucune dimension ne dépasse.
                        const fittingScaleFactor = Math.min(
                            baseWidth / size.x,
                            baseHeight / size.y,
                            baseDepth / size.z
                        );

                        // Taille du modèle après application de ce facteur d'ajustement seul
                        const sizeAfterFitting = size.clone().multiplyScalar(fittingScaleFactor);

                        // --- Sélection et Clonage du Matériau ---
                        // Prendre le premier matériau trouvé ou un matériau par défaut.
                        // Cloner est essentiel pour InstancedMesh afin que chaque type d'asset
                        // puisse avoir son propre matériau (même s'ils partagent la même source au début).
                        let baseMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        if (!baseMaterial || !baseMaterial.isMaterial) { // Vérification supplémentaire
                           baseMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        }
                        const finalMaterial = baseMaterial.clone();
                        // S'assurer que le matériau cloné a bien une couleur définie
                        if (!finalMaterial.color) { finalMaterial.color = new THREE.Color(0xcccccc); }


                        // --- Résolution de la Promesse ---
                        resolve({
                            id: modelId,
                            geometry: mergedGeometry, // La géométrie fusionnée et centrée
                            material: finalMaterial, // Le matériau cloné et prêt à l'emploi
                            fittingScaleFactor: fittingScaleFactor, // Scale pour atteindre la taille de BASE
                            userScale: userScale,                   // Scale supplémentaire défini dans la config
                            centerOffset: centerOffset,             // Décalage du centre de la BBox (important pour positionner)
                            sizeAfterFitting: sizeAfterFitting      // Taille après application de fittingScaleFactor seul (utile pour le positionnement en Y)
                        });

                        // Nettoyer les géométries individuelles clonées qui ont été fusionnées
                         geometries.forEach(g => g.dispose());


                    } catch(processingError) {
                         // Gérer les erreurs qui surviennent PENDANT le traitement du modèle chargé
                         console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
                         // Essayer de nettoyer les géométries créées si possible
                         geometries?.forEach(g => g?.dispose());
                         if (mergedGeometry) mergedGeometry.dispose();
                         // Rejeter la promesse pour indiquer l'échec
                         reject(processingError);
                    }
                },
                undefined, // onProgress callback (peut être ajouté si nécessaire)
                (error) => {
                    // Gérer les erreurs de chargement réseau ou de parsing du fichier par le loader
                    console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelId}]:`, error);
                    reject(error); // Rejeter la promesse
                }
            );
        });
    }

    // ----- disposeAssets MODIFIÉ -----
    disposeAssets() {
        console.log("Disposition des assets chargés (incluant arbres et gratte-ciels)...");
        let disposedGeometries = 0;
        let disposedMaterials = 0; // Compter aussi les matériaux

        // Itérer sur TOUS les types d'assets connus
        Object.keys(this.assets).forEach(type => {
            this.assets[type].forEach(assetData => {
                // Disposer la géométrie
                if (assetData.geometry && typeof assetData.geometry.dispose === 'function') {
                    assetData.geometry.dispose();
                    disposedGeometries++;
                }
                // Disposer le matériau (chaque assetData a son propre clone)
                if (assetData.material && typeof assetData.material.dispose === 'function') {
                    assetData.material.dispose();
                    disposedMaterials++;
                }
            });
             // Vider le tableau pour ce type
             this.assets[type] = [];
        });

        // Log amélioré
         if (disposedGeometries > 0 || disposedMaterials > 0) {
             console.log(`  - ${disposedGeometries} géometries et ${disposedMaterials} matériaux disposés.`);
         }

         // Vider explicitement l'objet assets pour s'assurer qu'il est propre
         this.assets = { house: [], building: [], industrial: [], park: [], tree: [], skyscraper: [] };
    }
}