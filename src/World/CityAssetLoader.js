import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'; // Importation nécessaire
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    constructor(config) {
        // config contient { houseModelDir, houseModelFiles, houseBaseWidth, ... } etc.
        this.config = config;
        this.fbxLoader = new FBXLoader();

        // Structure pour stocker les données des modèles chargés (par type)
        this.assets = {
            house: [], // Chaque élément sera { id, geometry, material, scaleFactor, centerOffset, sizeAfterScaling }
            building: []
        };
        this.assetIdCounter = 0; // Compteur pour ID unique
         console.log("CityAssetLoader initialisé.");
    }

    /**
     * Retourne les données d'un modèle choisi aléatoirement pour le type spécifié.
     * @param {string} type 'house' ou 'building'.
     * @returns {object|null} L'objet de données de l'asset ou null si aucun modèle n'est disponible.
     */
    getRandomAssetData(type) {
        const modelList = this.assets[type];
        if (!modelList || modelList.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * modelList.length);
        return modelList[randomIndex];
    }

    /**
     * Retourne les données d'un modèle spécifique par son ID unique.
     * @param {string} id L'ID unique du modèle (ex: 'house_0').
     * @returns {object|null} L'objet de données de l'asset ou null s'il n'est pas trouvé.
     */
    getAssetDataById(id) {
        for (const type in this.assets) {
            const found = this.assets[type].find(asset => asset.id === id);
            if (found) return found;
        }
        return null;
    }

    /**
     * Charge tous les modèles FBX listés dans la configuration.
     * @returns {Promise<object>} Une promesse qui résout avec la structure this.assets remplie.
     */
    async loadAssets() {
        console.log("Chargement des assets FBX...");
        this.reset(); // Nettoyer les assets précédents

        // Créer les promesses de chargement pour chaque fichier listé
        const housePromises = (this.config.houseModelFiles || []).map(fileName =>
            this.loadFbxModel(
                this.config.houseModelDir + fileName,
                'house',
                this.config.houseBaseWidth,
                this.config.houseBaseHeight,
                this.config.houseBaseDepth
            ).catch(error => { // Gérer l'erreur ici pour Promise.allSettled implicite
                 console.error(`Echec chargement maison ${fileName}:`, error);
                 return null; // Retourner null en cas d'échec pour ce fichier
            })
        );

        const buildingPromises = (this.config.buildingModelFiles || []).map(fileName =>
            this.loadFbxModel(
                this.config.buildingModelDir + fileName,
                'building',
                this.config.buildingBaseWidth,
                this.config.buildingBaseHeight,
                this.config.buildingBaseDepth
            ).catch(error => {
                 console.error(`Echec chargement immeuble ${fileName}:`, error);
                 return null;
             })
        );

        try {
            // Exécuter toutes les promesses en parallèle
            const houseResults = await Promise.all(housePromises);
            const buildingResults = await Promise.all(buildingPromises);

            // Filtrer les résultats valides (non null) et les stocker
            this.assets.house = houseResults.filter(result => result !== null);
            this.assets.building = buildingResults.filter(result => result !== null);

            console.log(`Assets FBX chargés: ${this.assets.house.length} modèles maisons, ${this.assets.building.length} modèles immeubles.`);
            return this.assets; // Retourne la structure des assets chargés

        } catch (error) {
            // Cette partie ne devrait pas être atteinte si les catch individuels fonctionnent
            console.error("Erreur inattendue durant Promise.all pour les assets FBX:", error);
            this.reset(); // Assurer un état propre
            return this.assets; // Retourner la structure vide
        }
    }

    /**
     * Réinitialise l'état du loader, dispose les assets précédents.
     */
    reset() {
        this.disposeAssets(); // Appelle la méthode de nettoyage
        this.assets = { house: [], building: [] };
        this.assetIdCounter = 0;
        // console.log("CityAssetLoader réinitialisé."); // Déjà loggué par disposeAssets?
    }

    /**
     * Charge un unique modèle FBX, extrait et prépare ses données.
     * @param {string} path Chemin complet vers le fichier FBX.
     * @param {string} type 'house' ou 'building'.
     * @param {number} baseWidth Largeur cible pour le scaling.
     * @param {number} baseHeight Hauteur cible pour le scaling.
     * @param {number} baseDepth Profondeur cible pour le scaling.
     * @returns {Promise<object>} Une promesse résolvant avec les données de l'asset préparé.
     */
    async loadFbxModel(path, type, baseWidth, baseHeight, baseDepth) {
        const modelId = `${type}_${this.assetIdCounter++}`;
        // console.log(`Chargement FBX [${modelId}]: ${path}`);

        return new Promise((resolve, reject) => {
            this.fbxLoader.load(
                path,
                (object) => { // Callback de succès (object est souvent un THREE.Group)
                    const geometries = [];
                    const materials = [];

                    object.traverse((child) => {
                        if (child.isMesh) {
                            child.updateMatrixWorld(true); // Assurer que la matrice monde est à jour
                            const clonedGeom = child.geometry.clone();
                            // Appliquer la transformation du node DANS le FBX à la géométrie
                            clonedGeom.applyMatrix4(child.matrixWorld);
                             // Important: Re-centrer la géométrie pour que son origine soit (0,0,0)
                             // Ceci est crucial si le FBX avait des objets positionnés loin de l'origine globale
                             // MAIS nous devons garder l'offset pour le replacer correctement plus tard.
                             // Pour mergeGeometries, on veut les coordonnées globales. Pour BBox aussi.
                             // On ne recentre PAS ici. On calcule l'offset du centre de la BBox plus tard.

                            geometries.push(clonedGeom);

                            // Extraire et cloner les matériaux
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    materials.push(...child.material.map(m => m.clone()));
                                } else {
                                    materials.push(child.material.clone());
                                }
                            }
                        }
                    });

                    if (geometries.length === 0) {
                        return reject(new Error(`[${modelId}] Aucune géométrie trouvée dans ${path}`));
                    }

                    // Fusionner les géométries en une seule
                    const mergedGeometry = mergeGeometries(geometries, false); // false: ne pas créer de groupes par matériau
                    if (!mergedGeometry) {
                        return reject(new Error(`[${modelId}] Echec de la fusion des géométries pour ${path}`));
                    }

                    // Sélectionner le premier matériau trouvé pour InstancedMesh
                    let finalMaterial;
                    if (materials.length > 0) {
                        finalMaterial = materials[0]; // On prend le premier CLONÉ
                        // Optionnel: Parcourir les matériaux pour en trouver un "principal" si nécessaire
                    } else {
                        console.warn(`[${modelId}] Aucun matériau trouvé dans ${path}. Utilisation d'un matériau par défaut.`);
                        finalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                    }
                     // S'assurer que le matériau a une couleur définie
                    if (!finalMaterial.color) finalMaterial.color = new THREE.Color(0xcccccc);
                     // Activer les ombres sur le matériau par défaut si ce n'est pas déjà fait
                     // (Note: les matériaux chargés peuvent déjà avoir ces propriétés)
                     // finalMaterial.castShadow = true; -> Fait sur l'InstancedMesh
                     // finalMaterial.receiveShadow = true;


                    // Calculs BoundingBox et Scaling
                    mergedGeometry.computeBoundingBox();
                    const bbox = mergedGeometry.boundingBox;
                    if (!bbox) {
                         return reject(new Error(`[${modelId}] Impossible de calculer la bounding box pour ${path}`));
                    }
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const center = new THREE.Vector3(); // Centre de la BBox
                    bbox.getCenter(center);

                     // Prévenir division par zéro si une dimension est nulle ou trop petite
                    size.x = Math.max(size.x, 0.001);
                    size.y = Math.max(size.y, 0.001);
                    size.z = Math.max(size.z, 0.001);

                    // Calcul du facteur d'échelle uniforme basé sur la dimension la plus contraignante
                    const scaleFactorX = baseWidth / size.x;
                    const scaleFactorY = baseHeight / size.y;
                    const scaleFactorZ = baseDepth / size.z;
                    const scaleFactor = Math.min(scaleFactorX, scaleFactorY, scaleFactorZ);

                    const sizeAfterScaling = size.clone().multiplyScalar(scaleFactor);

                    // console.log(`  - ${modelId}: ScaleFactor=${scaleFactor.toFixed(3)}, CenterOffset=(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), ScaledSize=(${sizeAfterScaling.x.toFixed(2)}, ${sizeAfterScaling.y.toFixed(2)}, ${sizeAfterScaling.z.toFixed(2)})`);

                    // Résoudre la promesse avec les données préparées
                    resolve({
                        id: modelId,
                        geometry: mergedGeometry, // Géométrie prête pour InstancedMesh
                        material: finalMaterial,   // Matériau prêt pour InstancedMesh
                        scaleFactor: scaleFactor,
                        centerOffset: center,      // Offset du centre de la BBox (avant scaling)
                        sizeAfterScaling: sizeAfterScaling // Taille après application du scaleFactor
                    });
                },
                undefined, // onProgress
                (error) => { // onError
                    console.error(`Erreur chargement FBX ${path} [${modelId}]:`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Dispose les géométries et potentiellement les matériaux de tous les assets chargés.
     */
    disposeAssets() {
        console.log("Disposition des assets chargés...");
        let disposedGeometries = 0;
        ['house', 'building'].forEach(type => {
            this.assets[type].forEach(assetData => {
                if (assetData.geometry) {
                    assetData.geometry.dispose();
                    disposedGeometries++;
                }
                // Optionnel: Disposer les matériaux s'ils sont uniques et clonés
                // if (assetData.material && assetData.material.dispose) {
                //    assetData.material.dispose();
                // }
            });
            this.assets[type] = []; // Vider le tableau après disposition
        });
        if (disposedGeometries > 0) {
             console.log(`  - ${disposedGeometries} géometries disposées.`);
        }
    }
}