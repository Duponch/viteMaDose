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
            // console.log(`[${type}] Chargement ignoré pour ${path}`); // Log optionnel
            return Promise.resolve(null); // Retourne null pour ce type
        }
        // --- Reste de la fonction inchangée JUSQU'À la fin du try/catch ---
        const modelId = `${type}_${this.assetIdCounter++}_${path.split('/').pop()}`;
        const extension = path.split('.').pop()?.toLowerCase();
        return new Promise((resolve, reject) => {
            let loader;
            if (extension === 'fbx') { loader = this.fbxLoader; }
            else if (extension === 'glb' || extension === 'gltf') { loader = this.gltfLoader; }
            else {
                // Utiliser resolve(null) au lieu de reject pour ne pas bloquer Promise.all
                console.error(`[${modelId}] Format de fichier non supporté: ${extension} pour ${path}. Asset ignoré.`);
                return resolve(null);
                // return reject(new Error(`[${modelId}] Format de fichier non supporté: ${extension} pour le chemin ${path}`));
            }
            loader.load(
                path,
                (loadedObject) => {
                    let mergedGeometry = null; // Déclarer ici pour la portée du catch et finally
                    const geometries = []; // Pour pouvoir la nettoyer dans le catch
                    try {
                        const modelRootObject = (extension === 'glb' || extension === 'gltf') ? loadedObject.scene : loadedObject;
                        if (!modelRootObject) {
                            // Utiliser resolve(null)
                            console.error(`[${modelId}] Aucun objet racine trouvé dans ${path}. Asset ignoré.`);
                            return resolve(null);
                            // return reject(new Error(`[${modelId}] Aucun objet racine trouvé dans ${path}.`));
                        }
                        const materials = []; let hasValidMesh = false;
                        modelRootObject.traverse((child) => {
                            if (child.isMesh) {
                                if (child.geometry && child.geometry.attributes.position) { // Vérif de base
                                    hasValidMesh = true; child.updateMatrixWorld(true); // Force la màj matrice monde
                                    const clonedGeom = child.geometry.clone();
                                    clonedGeom.applyMatrix4(child.matrixWorld); // Appliquer la transformation monde
                                    geometries.push(clonedGeom);
                                    // Gestion matériaux (simplifiée)
                                    if (child.material) {
                                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                                        mats.forEach(m => { if (m && m.isMaterial) { materials.push(m); } });
                                    }
                                    // Ombres
                                    child.castShadow = true; child.receiveShadow = true;
                                } else {
                                     console.warn(`[${modelId}] Mesh enfant ignoré car géométrie invalide ou manquante dans ${path}`);
                                }
                            }
                        });
                        if (!hasValidMesh) { /* resolve(null) */ console.error(`[${modelId}] Aucune géométrie de mesh valide trouvée dans ${path}. Asset ignoré.`); return resolve(null); }
                        if (geometries.length === 0) { /* resolve(null) */ console.error(`[${modelId}] Aucune géométrie collectée dans ${path}. Asset ignoré.`); return resolve(null); }
                        // Fusionner les géométries
                        mergedGeometry = mergeGeometries(geometries, false); // 'false' pour ne pas créer de groupes
                        if (!mergedGeometry) { /* resolve(null) */ console.error(`[${modelId}] Echec de la fusion des géométries pour ${path}. Asset ignoré.`); geometries.forEach(g => g.dispose()); return resolve(null); }
                        // Centrer la géométrie fusionnée et calculer sa BBox
                        mergedGeometry.center();
                        mergedGeometry.computeBoundingBox();
                        const bbox = mergedGeometry.boundingBox;
                        if (!bbox) { /* resolve(null) */ console.error(`[${modelId}] Echec calcul BBox pour ${path}. Asset ignoré.`); mergedGeometry.dispose(); geometries.forEach(g => g.dispose()); return resolve(null); }

                        // ==============================================================
                        // --- NOUVELLE VÉRIFICATION NaN ---
                        // ==============================================================
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
                            mergedGeometry.dispose(); // Nettoyer la géométrie corrompue
                            geometries.forEach(g => g.dispose()); // Nettoyer les intermédiaires
                            return resolve(null); // Ignorer cet asset
                        }
                        // ==============================================================
                        // --- FIN VÉRIFICATION NaN ---
                        // ==============================================================


                        const size = new THREE.Vector3(); bbox.getSize(size);
                        const centerOffset = new THREE.Vector3(); bbox.getCenter(centerOffset); // Offset du centre après .center()
                        // Empêcher taille nulle (cause division par zéro)
                        size.x = Math.max(size.x, 0.001); size.y = Math.max(size.y, 0.001); size.z = Math.max(size.z, 0.001);
                        // Calculer le facteur d'échelle pour fitter dans les dimensions de base fournies
                        const fittingScaleFactor = Math.min(baseWidth / size.x, baseHeight / size.y, baseDepth / size.z);
                        const sizeAfterFitting = size.clone().multiplyScalar(fittingScaleFactor);
                        // Sélectionner/cloner un matériau (simplifié: prend le premier trouvé)
                        let baseMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        if (!baseMaterial || !baseMaterial.isMaterial) { baseMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc }); }
                        const finalMaterial = baseMaterial.clone(); // Cloner pour éviter modif partagée
                        if (!finalMaterial.color) { finalMaterial.color = new THREE.Color(0xcccccc); } // Assurer couleur par défaut
                        finalMaterial.name = `AssetMat_${modelId}`; // Donner un nom au matériau final

                        // Résoudre la promesse avec les données traitées
                        resolve({
                            id: modelId,
                            geometry: mergedGeometry,      // Géométrie fusionnée et centrée (et vérifiée sans NaN)
                            material: finalMaterial,       // Matériau cloné
                            fittingScaleFactor: fittingScaleFactor, // Échelle pour fitter base dims
                            userScale: userScale,          // Échelle fournie par l'utilisateur
                            centerOffset: centerOffset,    // Offset du centre de la géométrie (après .center())
                            sizeAfterFitting: sizeAfterFitting // Taille approx après fittingScaleFactor
                        });
                        // Nettoyer les géométries intermédiaires clonées
                        geometries.forEach(g => g.dispose());

                    } catch(processingError) {
                         // Gestion d'erreur interne au traitement
                         console.error(`Erreur interne pendant traitement ${path} [${modelId}]:`, processingError);
                         geometries?.forEach(g => g?.dispose()); // Nettoyer si possible
                         if (mergedGeometry) mergedGeometry.dispose(); // Nettoyer si possible
                         // Utiliser resolve(null) au lieu de reject
                         resolve(null);
                         // reject(processingError); // Rejeter la promesse principale
                    }
                },
                undefined, // onProgress non utilisé ici
                (error) => {
                    // Gestion d'erreur du loader lui-même
                    console.error(`Erreur chargement ${extension.toUpperCase()} ${path} [${modelId}]:`, error);
                    // Utiliser resolve(null) au lieu de reject
                    resolve(null);
                    // reject(error);
                }
            );
        });
    } // Fin loadAssetModel

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