import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3, BoxHelper } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Classe pour représenter une parcelle ---
class Plot {
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
            mapSize: 400,
            roadWidth: 10,
            sidewalkWidth: 2,
            sidewalkHeight: 0.2,
            centerlineWidth: 0.15,
            centerlineHeight: 0.02,
            minPlotSize: 15,
            maxRecursionDepth: 7,
            buildingMinHeight: 5,
            buildingMaxHeight: 25,
            parkProbability: 0.15,
            // Valeurs minimales différentes pour les sous-zones
            minHouseSubZoneSize: 7,
            minBuildingSubZoneSize: 10,
            buildingSubZoneMargin: 1,
            houseBaseWidth: 6,
            houseBaseHeight: 6,
            houseBaseDepth: 6,
            houseZoneProbability: 0.5,
            houseModelPath: "Public/Assets/Models/House4.glb",
            buildingModelPath: "Public/Assets/Models/Building2.glb",
            buildingBaseWidth: 10,
            buildingBaseHeight: 20,
            buildingBaseDepth: 10,
            ...config
        };

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
        // Les modèles bruts
        this.houseModel = null;
        this.buildingModel = null;
        // Géométries fusionnées pour instancing
        this.houseMergedGeometry = null;
        this.buildingMergedGeometry = null;
        // Matériaux pour instancing (on récupère celui du premier Mesh)
        this.houseMergedMaterial = null;
        this.buildingMergedMaterial = null;
        // Paramètres de transformation de base (calculés lors du chargement)
        this.houseScaleFactor = 1;
        this.houseCenterOffset = new THREE.Vector3();
        this.houseSizeAfterScaling = new THREE.Vector3();
        this.buildingScaleFactor = 1;
        this.buildingCenterOffset = new THREE.Vector3();
        this.buildingSizeAfterScaling = new THREE.Vector3();
    }

    async loadHouseModel() {
		return new Promise((resolve, reject) => {
			this.gltfLoader.load(
				this.config.houseModelPath,
				(gltf) => {
					this.houseModel = gltf.scene;
					const geometries = [];
					// Parcourir les Mesh enfants et fusionner leurs géométries
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
					// Calcul de la bounding box pour obtenir la taille et le centre
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

    async loadBuildingModel() {
		return new Promise((resolve, reject) => {
			this.gltfLoader.load(
				this.config.buildingModelPath,
				(gltf) => {
					this.buildingModel = gltf.scene;
					const geometries = [];
					this.buildingModel.traverse((child) => {
						if (child.isMesh) {
							child.updateMatrixWorld(true);
							const clonedGeom = child.geometry.clone();
							clonedGeom.applyMatrix4(child.matrixWorld);
							geometries.push(clonedGeom);
							if (!this.buildingMergedMaterial) {
								this.buildingMergedMaterial = child.material.clone();
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
		});
	}

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

    clearScene() {
        // (Fonction inchangée, voir code original)
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
                        obj.material !== this.parkMaterial
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

        this.rootPlot = null;
        this.plots = [];
        this.leafPlots = [];
        this.nextPlotId = 0;
        this.houseModel = null;
        this.buildingModel = null;
        this.houseMergedGeometry = null;
        this.buildingMergedGeometry = null;
    }

    // Modification ici : choisir la taille minimale en fonction du type de zone
    subdivideForBuildings(plot) {
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

    subdividePlot(plot, depth) {
        if (
            depth >= this.config.maxRecursionDepth ||
            plot.width * plot.depth <
            this.config.minPlotSize * this.config.minPlotSize * 1.5
        ) {
            return;
        }

        let splitVertical = plot.width > plot.depth;
        if (Math.abs(plot.width - plot.depth) < this.config.minPlotSize / 2) {
            splitVertical = Math.random() > 0.5;
        }
        if (
            splitVertical &&
            plot.width < this.config.minPlotSize * 2 + this.config.roadWidth
        )
            splitVertical = false;
        if (
            !splitVertical &&
            plot.depth < this.config.minPlotSize * 2 + this.config.roadWidth
        )
            splitVertical = true;

        const road = this.config.roadWidth;
        if (splitVertical) {
            if (plot.width < this.config.minPlotSize * 2 + road) {
                plot.isLeaf = true;
                return;
            }
        } else {
            if (plot.depth < this.config.minPlotSize * 2 + road) {
                plot.isLeaf = true;
                return;
            }
        }

        plot.isLeaf = false;
        let p1, p2;

        if (splitVertical) {
            const minSplitPos = plot.x + this.config.minPlotSize + road / 2;
            const maxSplitPos =
                plot.x + plot.width - this.config.minPlotSize - road / 2;
            const splitX = THREE.MathUtils.randFloat(minSplitPos, maxSplitPos);
            p1 = new Plot(
                this.nextPlotId++,
                plot.x,
                plot.z,
                splitX - plot.x - road / 2,
                plot.depth
            );
            p2 = new Plot(
                this.nextPlotId++,
                splitX + road / 2,
                plot.z,
                plot.x + plot.width - (splitX + road / 2),
                plot.depth
            );
        } else {
            const minSplitPos = plot.z + this.config.minPlotSize + road / 2;
            const maxSplitPos =
                plot.z + plot.depth - this.config.minPlotSize - road / 2;
            const splitZ = THREE.MathUtils.randFloat(minSplitPos, maxSplitPos);
            p1 = new Plot(
                this.nextPlotId++,
                plot.x,
                plot.z,
                plot.width,
                splitZ - plot.z - road / 2
            );
            p2 = new Plot(
                this.nextPlotId++,
                plot.x,
                splitZ + road / 2,
                plot.width,
                plot.z + plot.depth - (splitZ + road / 2)
            );
        }

        if (
            p1.width > 0.1 &&
            p1.depth > 0.1 &&
            p2.width > 0.1 &&
            p2.depth > 0.1
        ) {
            plot.children.push(p1, p2);
            this.plots.push(p1, p2);
            this.subdividePlot(p1, depth + 1);
            this.subdividePlot(p2, depth + 1);
        } else {
            plot.isLeaf = true;
            plot.children = [];
            console.warn(
                "Division a produit des parcelles invalides, parcelle forcée en feuille : ",
                plot.id
            );
            const indexP1 = this.plots.indexOf(p1);
            if (indexP1 > -1) this.plots.splice(indexP1, 1);
            const indexP2 = this.plots.indexOf(p2);
            if (indexP2 > -1) this.plots.splice(indexP2, 1);
        }
    }

    collectLeafPlots(plot) {
        if (plot.isLeaf) {
            if (
                plot.width >= this.config.minPlotSize &&
                plot.depth >= this.config.minPlotSize
            ) {
                if (Math.random() < this.config.parkProbability) {
                    plot.isPark = true;
                }
            }
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

    generateRoadCenterlines() {
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;
        const drawnRoads = new Set();

        console.log("Génération des lignes centrales...");

        for (let i = 0; i < this.leafPlots.length; i++) {
            const p1 = this.leafPlots[i];
            for (let j = i + 1; j < this.leafPlots.length; j++) {
                const p2 = this.leafPlots[j];
                let roadInfo = null;

                const gapH = p2.x - (p1.x + p1.width);
                const gapHReverse = p1.x - (p2.x + p2.width);
                const zOverlapStart = Math.max(p1.z, p2.z);
                const zOverlapEnd = Math.min(
                    p1.z + p1.depth,
                    p2.z + p2.depth
                );
                const zOverlapLength = zOverlapEnd - zOverlapStart;

                if (
                    Math.abs(gapH - roadW) < tolerance &&
                    zOverlapLength > tolerance
                ) {
                    roadInfo = {
                        type: "V",
                        x: p1.x + p1.width + roadW / 2,
                        z: zOverlapStart,
                        length: zOverlapLength,
                        p1Id: p1.id,
                        p2Id: p2.id
                    };
                } else if (
                    Math.abs(gapHReverse - roadW) < tolerance &&
                    zOverlapLength > tolerance
                ) {
                    roadInfo = {
                        type: "V",
                        x: p2.x + p2.width + roadW / 2,
                        z: zOverlapStart,
                        length: zOverlapLength,
                        p1Id: p2.id,
                        p2Id: p1.id
                    };
                }

                if (!roadInfo) {
                    const gapV = p2.z - (p1.z + p1.depth);
                    const gapVReverse = p1.z - (p2.z + p2.depth);
                    const xOverlapStart = Math.max(p1.x, p2.x);
                    const xOverlapEnd = Math.min(
                        p1.x + p1.width,
                        p2.x + p2.width
                    );
                    const xOverlapLength = xOverlapEnd - xOverlapStart;

                    if (
                        Math.abs(gapV - roadW) < tolerance &&
                        xOverlapLength > tolerance
                    ) {
                        roadInfo = {
                            type: "H",
                            x: xOverlapStart,
                            z: p1.z + p1.depth + roadW / 2,
                            length: xOverlapLength,
                            p1Id: p1.id,
                            p2Id: p2.id
                        };
                    } else if (
                        Math.abs(gapVReverse - roadW) < tolerance &&
                        xOverlapLength > tolerance
                    ) {
                        roadInfo = {
                            type: "H",
                            x: xOverlapStart,
                            z: p2.z + p2.depth + roadW / 2,
                            length: xOverlapLength,
                            p1Id: p2.id,
                            p2Id: p1.id
                        };
                    }
                }

                if (roadInfo) {
                    const roadKey = `${Math.min(
                        roadInfo.p1Id,
                        roadInfo.p2Id
                    )}-${Math.max(roadInfo.p1Id, roadInfo.p2Id)}`;
                    if (!drawnRoads.has(roadKey)) {
                        this.createRoadCenterlineGeometry(roadInfo);
                        drawnRoads.add(roadKey);
                    }
                }
            }
        }
        console.log(`Lignes centrales générées: ${drawnRoads.size} segments.`);
    }

    createRoadCenterlineGeometry(info) {
        const segmentGroup = new THREE.Group();
        let midX, midZ, angle;
        const clHeight = this.config.centerlineHeight;
        const clWidth = this.config.centerlineWidth;

        if (info.type === "V") {
            angle = 0;
            midX = info.x;
            midZ = info.z + info.length / 2;
        } else {
            angle = Math.PI / 2;
            midX = info.x + info.length / 2;
            midZ = info.z;
        }
        segmentGroup.position.set(midX, 0, midZ);
        segmentGroup.rotation.y = angle;

        const centerlineGeom = new THREE.BoxGeometry(
            clWidth,
            clHeight,
            info.length
        );
        const centerlineMesh = new THREE.Mesh(
            centerlineGeom,
            this.centerlineMaterial
        );
        centerlineMesh.position.y = clHeight / 2 + 0.001;
        centerlineMesh.castShadow = false;
        centerlineMesh.receiveShadow = false;
        segmentGroup.add(centerlineMesh);
        this.roadGroup.add(segmentGroup);
    }

	generatePlotContentsAndSidewalks() {
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;

        // Tableaux pour accumuler les matrices de transformation pour l'instancing
        const houseInstanceMatrices = [];
        const buildingInstanceMatrices = [];

        this.leafPlots.forEach((plot) => {
            // Création des trottoirs (inchangée)
            if (sidewalkW > 0) {
                const sidewalkGroup = new THREE.Group();
                sidewalkGroup.position.set(plot.center.x, 0, plot.center.z);

                const horizontalLength = plot.width + 2 * sidewalkW;
                const verticalLength = plot.depth;
                const geomH = new THREE.BoxGeometry(horizontalLength, sidewalkH, sidewalkW);
                const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, verticalLength);

                const topSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                topSW.position.set(0, sidewalkH / 2, -plot.depth / 2 - sidewalkW / 2);
                sidewalkGroup.add(topSW);

                const bottomSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                bottomSW.position.set(0, sidewalkH / 2, plot.depth / 2 + sidewalkW / 2);
                sidewalkGroup.add(bottomSW);

                const leftSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                leftSW.position.set(-plot.width / 2 - sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(leftSW);

                const rightSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                rightSW.position.set(plot.width / 2 + sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(rightSW);

                sidewalkGroup.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.sidewalkGroup.add(sidewalkGroup);
            }

            // Pour un parc, on crée simplement le sol
            if (plot.isPark) {
                const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
                const parkMesh = new THREE.Mesh(parkGeom, this.parkMaterial);
                parkMesh.position.set(plot.center.x, 0.2, plot.center.z);
                parkMesh.rotation.x = -Math.PI / 2;
                parkMesh.receiveShadow = true;
                this.buildingGroup.add(parkMesh);
            } else {
                // Création du sol (pour immeubles ou maisons)
                const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
                const groundMesh = new THREE.Mesh(groundGeom, this.buildingGroundMaterial);
                groundMesh.rotation.x = -Math.PI / 2;
                groundMesh.position.set(plot.center.x, 0.2, plot.center.z);
                groundMesh.receiveShadow = true;
                this.buildingGroup.add(groundMesh);

                const subZones = this.subdivideForBuildings(plot);
                const margin = this.config.buildingSubZoneMargin;

                subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(subZone.width - margin * 2, 0.1);
                    const buildableDepth = Math.max(subZone.depth - margin * 2, 0.1);

                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        // Calcul du centre de la subZone
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;

                        // Création de la matrice de transformation pour l'instance :
                        // On souhaite appliquer : M = T(translation) * S(scale) * T(-center)
                        let instanceMatrix = new THREE.Matrix4();
                        if (plot.zoneType === "house") {
                            const translation = new THREE.Matrix4().makeTranslation(
                                subZoneCenterX,
                                this.houseSizeAfterScaling.y / 2,
                                subZoneCenterZ
                            );
                            const scale = new THREE.Matrix4().makeScale(
                                this.houseScaleFactor,
                                this.houseScaleFactor,
                                this.houseScaleFactor
                            );
                            const recenter = new THREE.Matrix4().makeTranslation(
                                -this.houseCenterOffset.x,
                                -this.houseCenterOffset.y,
                                -this.houseCenterOffset.z
                            );
                            instanceMatrix.multiplyMatrices(translation, scale.multiply(recenter));
                            houseInstanceMatrices.push(instanceMatrix);
                        } else {
                            const translation = new THREE.Matrix4().makeTranslation(
                                subZoneCenterX,
                                this.buildingSizeAfterScaling.y / 2,
                                subZoneCenterZ
                            );
                            const scale = new THREE.Matrix4().makeScale(
                                this.buildingScaleFactor,
                                this.buildingScaleFactor,
                                this.buildingScaleFactor
                            );
                            const recenter = new THREE.Matrix4().makeTranslation(
                                -this.buildingCenterOffset.x,
                                -this.buildingCenterOffset.y,
                                -this.buildingCenterOffset.z
                            );
                            instanceMatrix.multiplyMatrices(translation, scale.multiply(recenter));
                            buildingInstanceMatrices.push(instanceMatrix);
                        }
                    }
                });
            }
        });

        // Création d'un InstancedMesh pour toutes les maisons (1 draw call)
        if (houseInstanceMatrices.length > 0) {
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
        }

        // Création d'un InstancedMesh pour tous les immeubles (1 draw call)
        if (buildingInstanceMatrices.length > 0) {
            const buildingInstancedMesh = new THREE.InstancedMesh(
                this.buildingMergedGeometry,
                this.buildingMergedMaterial,
                buildingInstanceMatrices.length
            );
            buildingInstanceMatrices.forEach((matrix, index) => {
                buildingInstancedMesh.setMatrixAt(index, matrix);
            });
            buildingInstancedMesh.castShadow = true;
            buildingInstancedMesh.receiveShadow = true;
            this.buildingGroup.add(buildingInstancedMesh);
        }
    }
}
