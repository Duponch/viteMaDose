import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Supprimez OBJLoader/MTLLoader si vous n'utilisez que GLB/GLTF
// import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityAssetLoader {
    constructor(config) {
        this.config = config; // Contient les paths, base sizes etc.
        this.gltfLoader = new GLTFLoader();
        // this.mtlLoader = new MTLLoader(); // Si besoin
        // this.objLoader = new OBJLoader(); // Si besoin

        this.assets = {
            house: null,
            building: null,
            // Ajoutez d'autres assets ici (lampadaires, arbres...)
        };
    }

    async loadAssets() {
        console.log("Chargement des assets de la ville...");
        try {
            const [houseData, buildingData] = await Promise.all([
                this.loadModel(
                    'house',
                    this.config.houseModelPath,
                    this.config.houseBaseWidth,
                    this.config.houseBaseHeight,
                    this.config.houseBaseDepth
                ),
                this.loadModel(
                    'building',
                    this.config.buildingModelPath,
                    this.config.buildingBaseWidth,
                    this.config.buildingBaseHeight,
                    this.config.buildingBaseDepth
                ),
                // Ajoutez d'autres promesses de chargement ici
            ]);
            this.assets.house = houseData;
            this.assets.building = buildingData;
            console.log("Assets chargés.");
            return this.assets;
        } catch (error) {
            console.error("Erreur lors du chargement des assets :", error);
            throw error; // Propager l'erreur
        }
    }

    getAssetData(type) {
        return this.assets[type];
    }

    // Méthode générique pour charger un modèle GLTF/GLB
    async loadModel(type, path, baseWidth, baseHeight, baseDepth) {
        console.log(`Chargement du modèle ${type} : ${path}`);
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                path,
                (gltf) => {
                    console.log(`Modèle ${type} GLB chargé.`);
                    const modelScene = gltf.scene;
                    const geometries = [];
                    let mergedMaterial = null;

                    modelScene.traverse((child) => {
                        if (child.isMesh) {
                            child.updateMatrixWorld(true);
                            const clonedGeom = child.geometry.clone();
                            clonedGeom.applyMatrix4(child.matrixWorld);
                            geometries.push(clonedGeom);
                            if (!mergedMaterial && child.material) {
                                if (Array.isArray(child.material) && child.material.length > 0) {
                                    mergedMaterial = child.material[0].clone();
                                } else if (!Array.isArray(child.material)) {
                                    mergedMaterial = child.material.clone();
                                }
                            }
                        }
                    });

                    if (geometries.length === 0) {
                        return reject(new Error(`Aucune géométrie trouvée dans le modèle ${type}.`));
                    }
                    if (!mergedMaterial) {
                         console.warn(`Aucun matériau trouvé pour ${type}, utilisation d'un matériau par défaut.`);
                         mergedMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                    }

                    const mergedGeometry = mergeGeometries(geometries, true);
                    mergedGeometry.computeBoundingBox(); // S'assurer que la bbox est calculée

                    const bbox = mergedGeometry.boundingBox;
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const center = new THREE.Vector3();
                    bbox.getCenter(center);

                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                         console.error(`Taille invalide (0) calculée pour la BBox de ${type}.`);
                         // Utiliser une taille par défaut pour éviter les divisions par zéro
                         size.set(1, 1, 1);
                        // Ne pas rejeter, mais logguer l'erreur et continuer avec une échelle de 1
                         // return reject(new Error(`Taille de BBox invalide pour ${type}.`));
                    }


                    const scaleFactorX = baseWidth / size.x;
                    const scaleFactorY = baseHeight / size.y;
                    const scaleFactorZ = baseDepth / size.z;
                    const scaleFactor = Math.min(scaleFactorX, scaleFactorY, scaleFactorZ);

                    const sizeAfterScaling = size.clone().multiplyScalar(scaleFactor); // Clone pour ne pas modifier l'original

                     console.log(`  - ${type} - Taille originale: ${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`);
                     console.log(`  - ${type} - Centre original: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`);
                     console.log(`  - ${type} - Facteur d'échelle: ${scaleFactor.toFixed(3)}`);
                     console.log(`  - ${type} - Taille après échelle: ${sizeAfterScaling.x.toFixed(2)}, ${sizeAfterScaling.y.toFixed(2)}, ${sizeAfterScaling.z.toFixed(2)}`);


                    resolve({
                        mergedGeometry,
                        mergedMaterial,
                        scaleFactor,
                        centerOffset: center, // Offset du centre *avant* scaling
                        sizeAfterScaling
                    });
                },
                undefined,
                (error) => {
                    console.error(`Erreur chargement ${type} (${path}):`, error);
                    reject(error);
                }
            );
        });
    }

    // Gardez les anciennes méthodes si vous avez besoin de charger OBJ/MTL spécifiquement
    // async loadObjMtlModel(...) {}

    disposeAssets() {
         console.log("Disposition des assets...");
         Object.values(this.assets).forEach(assetData => {
            if (assetData) {
                if (assetData.mergedGeometry) {
                    assetData.mergedGeometry.dispose();
                    console.log("  - Géométrie fusionnée disposée");
                }
                // Ne pas disposer le matériau ici s'il est partagé ou cloné depuis l'original
                // Laisser le GC ou le MaterialManager s'en charger.
                // if (assetData.mergedMaterial && assetData.mergedMaterial.dispose) {
                //    assetData.mergedMaterial.dispose();
                //    console.log("  - Matériau fusionné disposé");
                // }
            }
         });
         this.assets = { house: null, building: null }; // Réinitialiser
    }
}