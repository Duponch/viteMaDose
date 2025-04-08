import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { Box3, Vector3, BoxHelper } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Classe pour représenter une parcelle ---
class Plot {
    // ... (code inchangé)
    constructor(id, x, z, width, depth) {
        this.id = id;
        this.x = x;
        this.z = z;
        this.width = width;
        this.depth = depth;
        this.children = [];
        this.isLeaf = true;
        this.isPark = false;
        this.zoneType = null;
    }

    get center() {
        return new THREE.Vector3(
            this.x + this.width / 2,
            0,
            this.z + this.depth / 2
        );
    }

    contains(point) {
        return (
            point.x >= this.x &&
            point.x <= this.x + this.width &&
            point.z >= this.z &&
            point.z <= this.z + this.depth
        );
    }
}

// --- Classe Principale ---
export default class CityGenerator {
    constructor(experience, config) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.config = {
            mapSize: 500,
            roadWidth: 10,
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            minPlotSize: 15,
            // --- NOUVEAU PARAMETRE ---
            maxPlotSize: 30, // Taille maximale souhaitée pour une dimension de parcelle finale
            // -------------------------
            maxRecursionDepth: 7,
            buildingMinHeight: 5,
            buildingMaxHeight: 25,
            parkProbability: 0.15,
            minHouseSubZoneSize: 7,
            minBuildingSubZoneSize: 10,
            buildingSubZoneMargin: 1,
            houseBaseWidth: 6,
            houseBaseHeight: 6,
            houseBaseDepth: 6,
            houseZoneProbability: 0.5,
            houseModelPath: "Public/Assets/Models/House4.glb",
            buildingModelPath: "Public/Assets/Models/Building5fix.glb",
            //buildingMaterialPath: "Public/Assets/Models/Building4.mtl",
            buildingBaseWidth: 10,
            buildingBaseHeight: 20,
            buildingBaseDepth: 10,
            ...config
        };

        // --- Matériaux (inchangés) ---
        this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0x0f0118 });
        this.sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        this.centerlineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            metalness: 0.2,
            roughness: 0.7
        });
        this.buildingGroundMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        this.parkMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 });

        // --- État (inchangé) ---
        this.rootPlot = null;
        this.plots = [];
        this.leafPlots = [];
        this.nextPlotId = 0;

        this.roadGroup = new THREE.Group();
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group();
        this.scene.add(this.roadGroup);
        this.scene.add(this.sidewalkGroup);
        this.scene.add(this.buildingGroup);

        this.gltfLoader = new GLTFLoader();
        this.houseModel = null;
        this.buildingModel = null;
        this.houseMergedGeometry = null;
        this.buildingMergedGeometry = null;
        this.houseMergedMaterial = null;
        this.buildingMergedMaterial = null;
        this.houseScaleFactor = 1;
        this.houseCenterOffset = new THREE.Vector3();
        this.houseSizeAfterScaling = new THREE.Vector3();
        this.buildingScaleFactor = 1;
        this.buildingCenterOffset = new THREE.Vector3();
        this.buildingSizeAfterScaling = new THREE.Vector3();
    }

    // --- loadHouseModel (inchangé) ---
    async loadHouseModel() {
        // ... (code inchangé)
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                this.config.houseModelPath,
                (gltf) => {
                    this.houseModel = gltf.scene;
                    const geometries = [];
                    this.houseModel.traverse((child) => {
                        if (child.isMesh) {
                            child.updateMatrixWorld(true);
                            const clonedGeom = child.geometry.clone();
                            clonedGeom.applyMatrix4(child.matrixWorld);
                            geometries.push(clonedGeom);
                            if (!this.houseMergedMaterial) {
                                this.houseMergedMaterial = child.material.clone();
                            }
                        }
                    });
                    if (geometries.length === 0) {
                        return reject(new Error("Aucune géométrie trouvée dans le modèle de maison."));
                    }
                    this.houseMergedGeometry = mergeGeometries(geometries, true);
                    const bbox = new THREE.Box3().setFromBufferAttribute(this.houseMergedGeometry.attributes.position);
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const center = new THREE.Vector3();
                    bbox.getCenter(center);
                    const scaleFactorX = this.config.houseBaseWidth / size.x;
                    const scaleFactorY = this.config.houseBaseHeight / size.y;
                    const scaleFactorZ = this.config.houseBaseDepth / size.z;
                    const scaleFactor = Math.min(scaleFactorX, scaleFactorY, scaleFactorZ);
                    this.houseScaleFactor = scaleFactor;
                    this.houseCenterOffset = center;
                    this.houseSizeAfterScaling = size.multiplyScalar(scaleFactor);
                    resolve();
                },
                null,
                reject
            );
        });
    }

    // --- loadBuildingModel (inchangé) ---
    /* async loadBuildingModel() {
        // ... (code inchangé)
         return new Promise((resolve, reject) => {
            const mtlLoader = new MTLLoader();
            mtlLoader.load(
                this.config.buildingMaterialPath,
                (materials) => {
                    materials.preload();
                    const objLoader = new OBJLoader();
                    objLoader.setMaterials(materials);
                    objLoader.load(
                        this.config.buildingModelPath,
                        (obj) => {
                            this.buildingModel = obj;
                            const geometries = [];
                            this.buildingModel.traverse((child) => {
                                if (child.isMesh) {
                                    child.updateMatrixWorld(true);
                                    const clonedGeom = child.geometry.clone();
                                    clonedGeom.applyMatrix4(child.matrixWorld);
                                    geometries.push(clonedGeom);
                                    if (!this.buildingMergedMaterial) {
                                        let material;
                                        if (Array.isArray(child.material)) {
                                            material = child.material[0];
                                        } else {
                                            material = child.material;
                                        }
                                        if (material && typeof material.clone === "function") {
                                            this.buildingMergedMaterial = material.clone();
                                        } else {
                                             this.buildingMergedMaterial = material; // Fallback si non clonable ou undefined
                                        }
                                    }
                                }
                            });
                            if (geometries.length === 0) {
                                return reject(new Error("Aucune géométrie trouvée dans le modèle d'immeuble."));
                            }
                            this.buildingMergedGeometry = mergeGeometries(geometries, true);
                            const bbox = new THREE.Box3().setFromBufferAttribute(this.buildingMergedGeometry.attributes.position);
                            const size = new THREE.Vector3();
                            bbox.getSize(size);
                            const center = new THREE.Vector3();
                            bbox.getCenter(center);
                            const scaleFactorX = this.config.buildingBaseWidth / size.x;
                            const scaleFactorY = this.config.buildingBaseHeight / size.y;
                            const scaleFactorZ = this.config.buildingBaseDepth / size.z;
                            const scaleFactor = Math.min(scaleFactorX, scaleFactorY, scaleFactorZ);
                            this.buildingScaleFactor = scaleFactor;
                            this.buildingCenterOffset = center;
                            this.buildingSizeAfterScaling = size.multiplyScalar(scaleFactor);
                            resolve();
                        },
                        undefined,
                        reject
                    );
                },
                undefined,
                reject
            );
        });
    } */

	async loadBuildingModel() {
        console.log(`Chargement du modèle d'immeuble : ${this.config.buildingModelPath}`);
        // Utilisation de GLTFLoader, comme pour la maison
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                this.config.buildingModelPath,
                (gltf) => {
                    console.log("Modèle d'immeuble GLB chargé avec succès.");
                    this.buildingModel = gltf.scene; // La scène chargée
                    const geometries = [];
                    this.buildingMergedMaterial = null; // Réinitialiser avant de chercher

                    // Parcourir la scène pour extraire géométries et matériaux
                    this.buildingModel.traverse((child) => {
                        if (child.isMesh) {
                            console.log("  - Trouvé Mesh dans l'immeuble:", child.name);
                            child.updateMatrixWorld(true); // S'assurer que la matrice est à jour
                            const clonedGeom = child.geometry.clone();
                            clonedGeom.applyMatrix4(child.matrixWorld); // Appliquer la transformation du node
                            geometries.push(clonedGeom);

                            // Capturer le premier matériau trouvé (pour l'InstancedMesh)
                            // S'il y a plusieurs matériaux, l'InstancedMesh n'en utilisera qu'un.
                            if (!this.buildingMergedMaterial) {
                                if (Array.isArray(child.material)) {
                                     if (child.material.length > 0) {
                                        this.buildingMergedMaterial = child.material[0].clone();
                                        console.log("    - Matériau (tableau) capturé :", this.buildingMergedMaterial.name || "sans nom");
                                    }
                                } else if (child.material) {
                                    this.buildingMergedMaterial = child.material.clone();
                                     console.log("    - Matériau (unique) capturé :", this.buildingMergedMaterial.name || "sans nom");
                                }
                            }
                        }
                    });

                    if (geometries.length === 0) {
                        console.error("Aucune géométrie trouvée dans le modèle d'immeuble GLB.");
                        return reject(new Error("Aucune géométrie trouvée dans le modèle d'immeuble GLB."));
                    }
                    if (!this.buildingMergedMaterial) {
                         console.warn("Aucun matériau trouvé pour l'immeuble GLB, utilisation d'un matériau par défaut.");
                         // Fallback vers un matériau simple si aucun n'est trouvé dans le GLB
                         this.buildingMergedMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                    }


                    console.log(`Fusion de ${geometries.length} géométries pour l'immeuble.`);
                    this.buildingMergedGeometry = mergeGeometries(geometries, true); // Fusionner les géométries

                    // Calculer la bounding box, taille, centre et facteur d'échelle
                    const bbox = new THREE.Box3().setFromBufferAttribute(this.buildingMergedGeometry.attributes.position);
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const center = new THREE.Vector3();
                    bbox.getCenter(center);

                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                         console.error("Taille invalide (0) calculée pour la BBox de l'immeuble.");
                         return reject(new Error("Taille de BBox invalide pour l'immeuble."));
                    }


                    const scaleFactorX = this.config.buildingBaseWidth / size.x;
                    const scaleFactorY = this.config.buildingBaseHeight / size.y;
                    const scaleFactorZ = this.config.buildingBaseDepth / size.z;
                    // Utiliser Math.min pour conserver les proportions
                    const scaleFactor = Math.min(scaleFactorX, scaleFactorY, scaleFactorZ);

                    this.buildingScaleFactor = scaleFactor;
                    this.buildingCenterOffset = center; // Centre de la géométrie fusionnée *avant* scaling
                    this.buildingSizeAfterScaling = size.multiplyScalar(scaleFactor); // Taille après application du scale

                     console.log(`  - Taille originale immeuble: ${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`);
                     console.log(`  - Centre original immeuble: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`);
                     console.log(`  - Facteur d'échelle immeuble: ${scaleFactor.toFixed(3)}`);
                     console.log(`  - Taille après échelle: ${this.buildingSizeAfterScaling.x.toFixed(2)}, ${this.buildingSizeAfterScaling.y.toFixed(2)}, ${this.buildingSizeAfterScaling.z.toFixed(2)}`);


                    resolve(); // Résoudre la promesse
                },
                undefined, // Progress callback (optionnel)
                (error) => {
                    console.error(`Erreur lors du chargement du modèle d'immeuble GLB (${this.config.buildingModelPath}):`, error);
                    reject(error); // Rejeter la promesse en cas d'erreur
                }
            );
        });
    }

    // --- generate (inchangé) ---
    async generate() {
        console.log("Génération par subdivision (lignes centrales)...");
        this.clearScene();

        const groundGeometry = new THREE.PlaneGeometry(this.config.mapSize, this.config.mapSize);
        const groundMesh = new THREE.Mesh(groundGeometry, this.groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(0, 0.005, 0);
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);

        this.rootPlot = new Plot(
            this.nextPlotId++,
            -this.config.mapSize / 2,
            -this.config.mapSize / 2,
            this.config.mapSize,
            this.config.mapSize
        );
        this.plots.push(this.rootPlot);

        this.subdividePlot(this.rootPlot, 0);
        this.collectLeafPlots(this.rootPlot);
        console.log(`Subdivision terminée: ${this.leafPlots.length} parcelles finales.`);

        this.generateRoadCenterlines();

        try {
            await this.loadHouseModel();
            await this.loadBuildingModel();
            this.generatePlotContentsAndSidewalks();
        } catch (error) {
            console.error("Error loading models:", error);
        }

        console.log("Génération de la ville terminée.");
    }

    // --- clearScene (inchangé) ---
    clearScene() {
        // ... (code inchangé)
        const disposeGroup = (group) => {
            while (group.children.length > 0) {
                const obj = group.children[0];
                group.remove(obj);
                if (obj instanceof THREE.Mesh) {
                    if (obj.geometry) obj.geometry.dispose();
                    if (
                        obj.material &&
                        obj.material !== this.sidewalkMaterial &&
                        obj.material !== this.centerlineMaterial &&
                        obj.material !== this.parkMaterial &&
                        obj.material !== this.buildingGroundMaterial && // Ajout pour être sûr
                        obj.material !== this.groundMaterial         // Ajout pour être sûr
                    ) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach((m) => {
                                if (m && m.isMaterial) m.dispose();
                            });
                        } else if (obj.material && obj.material.isMaterial) {
                            obj.material.dispose();
                        }
                    }
                } else if (obj instanceof THREE.Group) {
                    disposeGroup(obj);
                }
            }
        };
        disposeGroup(this.roadGroup);
        disposeGroup(this.sidewalkGroup);
        disposeGroup(this.buildingGroup);

        // Supprimer aussi le sol principal
        const ground = this.scene.children.find(child => child.geometry instanceof THREE.PlaneGeometry && child.material === this.groundMaterial);
        if (ground) {
            this.scene.remove(ground);
            ground.geometry.dispose();
            // ground.material.dispose(); // On garde le material pour la prochaine génération
        }


        this.rootPlot = null;
        this.plots = [];
        this.leafPlots = [];
        this.nextPlotId = 0;

        // Disposer les géométries fusionnées si elles existent
        if (this.houseMergedGeometry) this.houseMergedGeometry.dispose();
        if (this.buildingMergedGeometry) this.buildingMergedGeometry.dispose();
        // Ne pas disposer les matériaux fusionnés ici s'ils sont clonés depuis les modèles chargés
        // car ils pourraient être réutilisés. Laisser le GC s'en charger.

        this.houseModel = null; // Permet de recharger si nécessaire
        this.buildingModel = null;
        this.houseMergedGeometry = null;
        this.buildingMergedGeometry = null;
        this.houseMergedMaterial = null; // Réinitialiser pour re-capturer
        this.buildingMergedMaterial = null;

        // Réinitialiser les compteurs de groupe peut être utile si on les réutilise
        // this.roadGroup = new THREE.Group();
        // this.sidewalkGroup = new THREE.Group();
        // this.buildingGroup = new THREE.Group();
        // this.scene.add(this.roadGroup);
        // this.scene.add(this.sidewalkGroup);
        // this.scene.add(this.buildingGroup);
    }

    // --- subdivideForBuildings (inchangé) ---
    subdivideForBuildings(plot) {
        // ... (code inchangé)
        const minSubZoneSize = plot.zoneType === "house"
            ? this.config.minHouseSubZoneSize
            : this.config.minBuildingSubZoneSize;
        const margin = this.config.buildingSubZoneMargin;
        let numCols = Math.floor(plot.width / minSubZoneSize);
        let numRows = Math.floor(plot.depth / minSubZoneSize);
        numCols = Math.max(numCols, 1);
        numRows = Math.max(numRows, 1);
        const subZones = [];
        const subWidth = plot.width / numCols;
        const subDepth = plot.depth / numRows;
        for (let i = 0; i < numCols; i++) {
            for (let j = 0; j < numRows; j++) {
                subZones.push({
                    x: plot.x + i * subWidth,
                    z: plot.z + j * subDepth,
                    width: subWidth,
                    depth: subDepth
                });
            }
        }
        return subZones;
    }

    // --- MODIFICATION subdividePlot ---
    subdividePlot(plot, depth) {
        const road = this.config.roadWidth;
        const minSize = this.config.minPlotSize;
        const maxSize = this.config.maxPlotSize;

        // --- Conditions d'arrêt de la subdivision ---
        const isTooSmallToSplit = (plot.width < minSize * 2 + road) && (plot.depth < minSize * 2 + road);
        const reachedMaxDepth = depth >= this.config.maxRecursionDepth;
        const withinMaxSize = plot.width <= maxSize && plot.depth <= maxSize;

        // On arrête si :
        // 1. La profondeur max est atteinte ET la parcelle respecte déjà la taille max
        // OU
        // 2. La parcelle est trop petite pour être divisée davantage (en respectant minSize)
        if ((reachedMaxDepth && withinMaxSize) || isTooSmallToSplit) {
            // Vérification finale : si on arrête parce qu'elle est trop petite,
            // mais qu'elle dépasse quand même maxSize (cas edge), on la marque comme feuille mais on prévient.
             if (isTooSmallToSplit && !withinMaxSize) {
                console.warn(`Plot ${plot.id} [${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}] dépasse maxPlotSize (${maxSize}) mais ne peut plus être subdivisée (minPlotSize: ${minSize}, roadWidth: ${road}). Forcée en feuille.`);
            }
            plot.isLeaf = true;
            return;
        }

        // --- Logique de choix de la direction de division (inchangée pour l'instant) ---
        let splitVertical = plot.width > plot.depth;
        // Si les dimensions sont proches, choisir aléatoirement
        if (Math.abs(plot.width - plot.depth) < minSize / 2) {
            splitVertical = Math.random() > 0.5;
        }

        // --- Vérifier si la division est possible dans la direction choisie ---
        let canSplitSelectedDirection = false;
        if (splitVertical && plot.width >= minSize * 2 + road) {
            canSplitSelectedDirection = true;
        } else if (!splitVertical && plot.depth >= minSize * 2 + road) {
            canSplitSelectedDirection = true;
        }

        // Si la direction choisie n'est pas possible, essayer l'autre direction
        if (!canSplitSelectedDirection) {
            splitVertical = !splitVertical; // Inverser la direction
            if (splitVertical && plot.width >= minSize * 2 + road) {
                 canSplitSelectedDirection = true;
            } else if (!splitVertical && plot.depth >= minSize * 2 + road) {
                 canSplitSelectedDirection = true;
            }
        }

        // Si aucune direction n'est possible (redondant avec isTooSmallToSplit mais plus explicite ici)
        if (!canSplitSelectedDirection) {
             if (!withinMaxSize) {
                 console.warn(`Plot ${plot.id} [${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}] dépasse maxPlotSize (${maxSize}) mais aucune direction de split n'est valide (minPlotSize: ${minSize}, roadWidth: ${road}). Forcée en feuille.`);
             }
            plot.isLeaf = true;
            return;
        }

        // --- Division ---
        plot.isLeaf = false;
        let p1, p2;
        let splitCoord;

        if (splitVertical) {
            // Calculer la plage de division possible
            const minSplitX = plot.x + minSize + road / 2;
            const maxSplitX = plot.x + plot.width - minSize - road / 2;
            // Assurer que minSplitX <= maxSplitX (au cas où plot.width est exactement minSize * 2 + road)
            if (minSplitX > maxSplitX) {
                 splitCoord = plot.x + plot.width / 2; // Centrer si la marge est nulle ou négative
            } else {
                splitCoord = THREE.MathUtils.randFloat(minSplitX, maxSplitX);
            }

            p1 = new Plot(
                this.nextPlotId++,
                plot.x,
                plot.z,
                splitCoord - plot.x - road / 2,
                plot.depth
            );
            p2 = new Plot(
                this.nextPlotId++,
                splitCoord + road / 2,
                plot.z,
                plot.x + plot.width - (splitCoord + road / 2),
                plot.depth
            );
        } else { // Split Horizontal
            const minSplitZ = plot.z + minSize + road / 2;
            const maxSplitZ = plot.z + plot.depth - minSize - road / 2;
             if (minSplitZ > maxSplitZ) {
                 splitCoord = plot.z + plot.depth / 2;
            } else {
                 splitCoord = THREE.MathUtils.randFloat(minSplitZ, maxSplitZ);
             }

            p1 = new Plot(
                this.nextPlotId++,
                plot.x,
                plot.z,
                plot.width,
                splitCoord - plot.z - road / 2
            );
            p2 = new Plot(
                this.nextPlotId++,
                plot.x,
                splitCoord + road / 2,
                plot.width,
                plot.z + plot.depth - (splitCoord + road / 2)
            );
        }

        // --- Validation et Récursion ---
        // Vérifier si les nouvelles parcelles ont des dimensions valides (supérieures à une petite tolérance)
        if (
            p1.width > 0.1 && p1.depth > 0.1 &&
            p2.width > 0.1 && p2.depth > 0.1
        ) {
            plot.children.push(p1, p2);
            this.plots.push(p1, p2);
            this.subdividePlot(p1, depth + 1);
            this.subdividePlot(p2, depth + 1);
        } else {
            // Si la division crée des parcelles invalides (trop fines), on annule la division
            plot.isLeaf = true;
            plot.children = []; // Vider les enfants potentiellement ajoutés
            console.warn(
                `Division a produit des parcelles invalides (p1: ${p1.width.toFixed(1)}x${p1.depth.toFixed(1)}, p2: ${p2.width.toFixed(1)}x${p2.depth.toFixed(1)}). Parcelle ${plot.id} forcée en feuille.`
            );
            // Il faut aussi retirer p1 et p2 de this.plots s'ils y ont été ajoutés
             const indexP1 = this.plots.indexOf(p1);
             if (indexP1 > -1) this.plots.splice(indexP1, 1);
             const indexP2 = this.plots.indexOf(p2);
             if (indexP2 > -1) this.plots.splice(indexP2, 1);
        }
    }

    // --- collectLeafPlots (inchangé) ---
    collectLeafPlots(plot) {
        if (plot.isLeaf) {
            // On ne vérifie plus minPlotSize ici, car subdividePlot s'en est chargé.
            // Une parcelle feuille peut potentiellement être plus petite si la division était impossible.
            // if (plot.width >= this.config.minPlotSize && plot.depth >= this.config.minPlotSize) { // Ancienne vérif
                if (Math.random() < this.config.parkProbability) {
                    plot.isPark = true;
                }
            // }
            if (!plot.isPark) {
                plot.zoneType =
                    Math.random() < this.config.houseZoneProbability
                        ? "house"
                        : "building";
            }
            this.leafPlots.push(plot);
        } else {
            plot.children.forEach((child) => this.collectLeafPlots(child));
        }
    }

    // --- generateRoadCenterlines (inchangé) ---
    generateRoadCenterlines() {
       // ... (code inchangé)
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;
        const drawnRoads = new Set();

        console.log("Génération des lignes centrales...");

        for (let i = 0; i < this.leafPlots.length; i++) {
            const p1 = this.leafPlots[i];
            for (let j = i + 1; j < this.leafPlots.length; j++) {
                const p2 = this.leafPlots[j];
                let roadInfo = null;

                // Check vertical gap (p2 right of p1)
                const gapH = p2.x - (p1.x + p1.width);
                // Check vertical gap (p1 right of p2)
                const gapHReverse = p1.x - (p2.x + p2.width);
                const zOverlapStart = Math.max(p1.z, p2.z);
                const zOverlapEnd = Math.min(p1.z + p1.depth, p2.z + p2.depth);
                const zOverlapLength = Math.max(0, zOverlapEnd - zOverlapStart); // Ensure non-negative

                if (Math.abs(gapH - roadW) < tolerance && zOverlapLength > tolerance) {
                    roadInfo = { type: "V", x: p1.x + p1.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p1.id, p2Id: p2.id };
                } else if (Math.abs(gapHReverse - roadW) < tolerance && zOverlapLength > tolerance) {
                    roadInfo = { type: "V", x: p2.x + p2.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p2.id, p2Id: p1.id };
                }

                // Check horizontal gap if no vertical road found
                if (!roadInfo) {
                    // Check horizontal gap (p2 below p1)
                    const gapV = p2.z - (p1.z + p1.depth);
                     // Check horizontal gap (p1 below p2)
                    const gapVReverse = p1.z - (p2.z + p2.depth);
                    const xOverlapStart = Math.max(p1.x, p2.x);
                    const xOverlapEnd = Math.min(p1.x + p1.width, p2.x + p2.width);
                    const xOverlapLength = Math.max(0, xOverlapEnd - xOverlapStart); // Ensure non-negative

                    if (Math.abs(gapV - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: "H", x: xOverlapStart, z: p1.z + p1.depth + roadW / 2, length: xOverlapLength, p1Id: p1.id, p2Id: p2.id };
                    } else if (Math.abs(gapVReverse - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: "H", x: xOverlapStart, z: p2.z + p2.depth + roadW / 2, length: xOverlapLength, p1Id: p2.id, p2Id: p1.id };
                    }
                }

                if (roadInfo) {
                    // Use sorted IDs for consistent key
                    const roadKey = `${Math.min(roadInfo.p1Id, roadInfo.p2Id)}-${Math.max(roadInfo.p1Id, roadInfo.p2Id)}-${roadInfo.type}`;
                    if (!drawnRoads.has(roadKey)) {
                        this.createRoadCenterlineGeometry(roadInfo);
                        drawnRoads.add(roadKey);
                    }
                }
            }
        }
        console.log(`Lignes centrales générées: ${drawnRoads.size} segments.`);
    }

    // --- createRoadCenterlineGeometry (inchangé) ---
    createRoadCenterlineGeometry(info) {
        // ... (code inchangé)
        const segmentGroup = new THREE.Group();
        let midX, midZ, angle;
        const clHeight = this.config.centerlineHeight;
        const clWidth = this.config.centerlineWidth;

        if (info.type === "V") {
            angle = 0;
            midX = info.x;
            midZ = info.z + info.length / 2;
        } else { // "H"
            angle = Math.PI / 2;
            midX = info.x + info.length / 2;
            midZ = info.z;
        }
        segmentGroup.position.set(midX, 0, midZ);
        segmentGroup.rotation.y = angle; // Rotation around Y axis

        const centerlineGeom = new THREE.BoxGeometry(
            info.type === "V" ? clWidth : info.length, // Width depends on orientation
            clHeight,
            info.type === "V" ? info.length : clWidth // Depth depends on orientation
        );
         const centerlineMesh = new THREE.Mesh(centerlineGeom, this.centerlineMaterial);
        // No need to rotate the mesh itself if the group is rotated
        centerlineMesh.position.y = clHeight / 2 + 0.001; // Position slightly above ground
        centerlineMesh.castShadow = false;
        centerlineMesh.receiveShadow = false;

        segmentGroup.add(centerlineMesh);
        this.roadGroup.add(segmentGroup);
    }

    // --- generatePlotContentsAndSidewalks (inchangé) ---
    generatePlotContentsAndSidewalks() {
        // ... (code inchangé)
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;

        const houseInstanceMatrices = [];
        const buildingInstanceMatrices = [];

        this.leafPlots.forEach((plot) => {
            // Create sidewalks (only if width > 0)
            if (sidewalkW > 0) {
                const sidewalkGroup = new THREE.Group();
                sidewalkGroup.position.set(plot.center.x, 0, plot.center.z);

                // Use plot dimensions directly
                const horizontalLength = plot.width + 2 * sidewalkW;
                const verticalLength = plot.depth + 2 * sidewalkW; // Adjusted for corners
                const plotWidthHalf = plot.width / 2;
                const plotDepthHalf = plot.depth / 2;

                // Geometry definitions (can be reused)
                const geomH = new THREE.BoxGeometry(plot.width, sidewalkH, sidewalkW); // Top/Bottom
                const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, plot.depth); // Left/Right
                const geomCorner = new THREE.BoxGeometry(sidewalkW, sidewalkH, sidewalkW); // Corners

                // Create sidewalks relative to the plot center
                const topSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                topSW.position.set(0, sidewalkH / 2, -plotDepthHalf - sidewalkW / 2);
                sidewalkGroup.add(topSW);

                const bottomSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                bottomSW.position.set(0, sidewalkH / 2, plotDepthHalf + sidewalkW / 2);
                sidewalkGroup.add(bottomSW);

                const leftSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                leftSW.position.set(-plotWidthHalf - sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(leftSW);

                const rightSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                rightSW.position.set(plotWidthHalf + sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(rightSW);

                // Add corners to fill gaps
                const cornerTL = new THREE.Mesh(geomCorner, this.sidewalkMaterial);
                cornerTL.position.set(-plotWidthHalf - sidewalkW / 2, sidewalkH / 2, -plotDepthHalf - sidewalkW / 2);
                sidewalkGroup.add(cornerTL);

                const cornerTR = new THREE.Mesh(geomCorner, this.sidewalkMaterial);
                cornerTR.position.set(plotWidthHalf + sidewalkW / 2, sidewalkH / 2, -plotDepthHalf - sidewalkW / 2);
                sidewalkGroup.add(cornerTR);

                const cornerBL = new THREE.Mesh(geomCorner, this.sidewalkMaterial);
                cornerBL.position.set(-plotWidthHalf - sidewalkW / 2, sidewalkH / 2, plotDepthHalf + sidewalkW / 2);
                sidewalkGroup.add(cornerBL);

                const cornerBR = new THREE.Mesh(geomCorner, this.sidewalkMaterial);
                cornerBR.position.set(plotWidthHalf + sidewalkW / 2, sidewalkH / 2, plotDepthHalf + sidewalkW / 2);
                sidewalkGroup.add(cornerBR);


                sidewalkGroup.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.sidewalkGroup.add(sidewalkGroup);
            }

            // Generate plot content (park or buildings/houses)
            if (plot.isPark) {
                const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
                const parkMesh = new THREE.Mesh(parkGeom, this.parkMaterial);
                parkMesh.position.set(plot.center.x, 0.1, plot.center.z); // Slightly above base ground
                parkMesh.rotation.x = -Math.PI / 2;
                parkMesh.receiveShadow = true;
                this.buildingGroup.add(parkMesh); // Add parks to building group for simplicity
            } else if (plot.zoneType && plot.width > 0.1 && plot.depth > 0.1) { // Ensure plot is valid
                // Create ground plane for the plot
                const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
                const groundMesh = new THREE.Mesh(groundGeom, this.buildingGroundMaterial);
                groundMesh.rotation.x = -Math.PI / 2;
                groundMesh.position.set(plot.center.x, 0.1, plot.center.z); // Slightly above base ground
                groundMesh.receiveShadow = true;
                this.buildingGroup.add(groundMesh);

                // Subdivide plot area for individual building/house placement
                const subZones = this.subdivideForBuildings(plot);
                const margin = this.config.buildingSubZoneMargin;

                subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(0, subZone.width - margin * 2);
                    const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;

                        let instanceMatrix = new THREE.Matrix4();
                        let modelSize, modelScaleFactor, modelCenterOffset;

                        if (plot.zoneType === "house" && this.houseMergedGeometry) {
                            modelSize = this.houseSizeAfterScaling;
                            modelScaleFactor = this.houseScaleFactor;
                            modelCenterOffset = this.houseCenterOffset;
                        } else if (plot.zoneType === "building" && this.buildingMergedGeometry) {
                            modelSize = this.buildingSizeAfterScaling;
                            modelScaleFactor = this.buildingScaleFactor;
                            modelCenterOffset = this.buildingCenterOffset;
                        } else {
                            return; // Skip if model/geometry not loaded
                        }

                        // Calculate position and scale matrix for the instance
                        const translation = new THREE.Matrix4().makeTranslation(
                            subZoneCenterX,
                            modelSize.y / 2 + 0.1, // Place base slightly above ground plane
                            subZoneCenterZ
                        );
                        const scale = new THREE.Matrix4().makeScale(
                            modelScaleFactor,
                            modelScaleFactor,
                            modelScaleFactor
                        );
                        // Apply translation to align model's original center with subZone center
                        const recenter = new THREE.Matrix4().makeTranslation(
                            -modelCenterOffset.x,
                            -modelCenterOffset.y,
                            -modelCenterOffset.z
                        );

                        // Combine transformations: Translate * Scale * Recenter
                        instanceMatrix.multiplyMatrices(translation, scale.multiply(recenter));


                        if (plot.zoneType === "house") {
                            houseInstanceMatrices.push(instanceMatrix);
                        } else {
                            buildingInstanceMatrices.push(instanceMatrix);
                        }
                    }
                });
            }
        });

        // Create InstancedMeshes if models are loaded and instances exist
        if (houseInstanceMatrices.length > 0 && this.houseMergedGeometry && this.houseMergedMaterial) {
            const houseInstancedMesh = new THREE.InstancedMesh(
                this.houseMergedGeometry,
                this.houseMergedMaterial,
                houseInstanceMatrices.length
            );
            houseInstanceMatrices.forEach((matrix, index) => {
                houseInstancedMesh.setMatrixAt(index, matrix);
            });
            houseInstancedMesh.castShadow = true;
            houseInstancedMesh.receiveShadow = true;
            this.buildingGroup.add(houseInstancedMesh);
            console.log(`Added ${houseInstanceMatrices.length} house instances.`);
        } else if (houseInstanceMatrices.length > 0) {
             console.warn("House instances were generated but model/material not ready.");
        }


        if (buildingInstanceMatrices.length > 0 && this.buildingMergedGeometry && this.buildingMergedMaterial) {
            const buildingInstancedMesh = new THREE.InstancedMesh(
                this.buildingMergedGeometry,
                this.buildingMergedMaterial, // Use the potentially complex material
                buildingInstanceMatrices.length
            );
             // Handle potential array material for InstancedMesh (use first material if array)
            if (Array.isArray(this.buildingMergedMaterial)) {
                buildingInstancedMesh.material = this.buildingMergedMaterial[0];
                console.warn("Building model uses multiple materials. InstancedMesh will use the first one.");
            }

            buildingInstanceMatrices.forEach((matrix, index) => {
                buildingInstancedMesh.setMatrixAt(index, matrix);
            });
            buildingInstancedMesh.castShadow = true;
            buildingInstancedMesh.receiveShadow = true;
            this.buildingGroup.add(buildingInstancedMesh);
             console.log(`Added ${buildingInstanceMatrices.length} building instances.`);
        } else if (buildingInstanceMatrices.length > 0) {
            console.warn("Building instances were generated but model/material not ready.");
        }
    }
}