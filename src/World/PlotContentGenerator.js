// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class PlotContentGenerator {
    constructor(config, materials) {
        this.config = config; // Contient notamment sidewalkWidth, les marges, minSubZoneSize pour chaque type...
        this.materials = materials;
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra bâtiments, maisons, industriels, parcs, gratte-ciels ET arbres
        this.assetLoader = null;
        // Structure pour stocker les matrices d'instances, indexées par type
        this.instanceData = {}; // Sera initialisé dans reset()
        console.log("PlotContentGenerator initialisé (avec support arbres et gratte-ciels).");
    }

    generateContent(leafPlots, assetLoader) {
        this.reset(assetLoader);
        console.log("Génération du contenu...");

        const allSidewalkGeometries = [];

        leafPlots.forEach((plot) => {
            // 1. Gestion du contenu principal de la parcelle (selon type de zone)
            this.generatePlotPrimaryContent(plot);
            // 2. Création des trottoirs pour la parcelle (si activé)
            if (this.config.sidewalkWidth > 0) {
                const plotSidewalkGeoms = this.collectSidewalkGeometriesForPlot(plot);
                allSidewalkGeometries.push(...plotSidewalkGeoms);
            }
            // 3. Placement des arbres
            this.placeTreesForPlot(plot);
        });

        // 4. Création des InstancedMesh pour tous les éléments (bâtiments, gratte-ciels, arbres, etc.)
        this.createInstancedMeshesFromData();

        // 5. Fusion des géométries de trottoir et ajout dans le groupe dédié
        if (allSidewalkGeometries.length > 0) {
            const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false);
            if (mergedSidewalkGeometry) {
                const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial);
                sidewalkMesh.castShadow = true;
                sidewalkMesh.receiveShadow = true;
                sidewalkMesh.name = "Merged_Sidewalks";
                this.sidewalkGroup.add(sidewalkMesh);
            } else {
                console.warn("La fusion des géométries de trottoir a échoué.");
            }
            allSidewalkGeometries.forEach(geom => geom.dispose());
        }

        console.log("Génération du contenu terminée.");
        return this.getGroups();
    }

    // Fonction qui collecte les géométries transformées pour les trottoirs d'une parcelle
    collectSidewalkGeometriesForPlot(plot) {
        const plotGeometries = [];
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width, plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2, plotCenterZ = plot.z + plotDepth / 2;

        // Géométrie de base (cube 1x1x1)
        const baseSidewalkGeom = new THREE.BoxGeometry(1, 1, 1);

        const createTransformedGeom = (width, depth, height, x, z, yOffset = 0) => {
            const matrix = new THREE.Matrix4();
            matrix.makeScale(width, height, depth);
            matrix.setPosition(new THREE.Vector3(x, height / 2 + yOffset, z));
            const clonedGeom = baseSidewalkGeom.clone();
            clonedGeom.applyMatrix4(matrix);
            return clonedGeom;
        };

        const halfPlotW = plotWidth / 2;
        const halfPlotD = plotDepth / 2;
        const halfSidewalkW = sidewalkW / 2;
        // Coordonnées globales des bords
        const topZ = plot.z - halfSidewalkW;
        const bottomZ = plot.z + plotDepth + halfSidewalkW;
        const leftX = plot.x - halfSidewalkW;
        const rightX = plot.x + plotWidth + halfSidewalkW;

        // Ajout des géométries pour les bords et coins
        plotGeometries.push(createTransformedGeom(plotWidth, sidewalkW, sidewalkH, plotCenterX, topZ)); // Haut
        plotGeometries.push(createTransformedGeom(plotWidth, sidewalkW, sidewalkH, plotCenterX, bottomZ)); // Bas
        plotGeometries.push(createTransformedGeom(sidewalkW, plotDepth, sidewalkH, leftX, plotCenterZ)); // Gauche
        plotGeometries.push(createTransformedGeom(sidewalkW, plotDepth, sidewalkH, rightX, plotCenterZ)); // Droite
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, leftX, topZ)); // Coin HG
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, rightX, topZ)); // Coin HD
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, leftX, bottomZ)); // Coin BG
        plotGeometries.push(createTransformedGeom(sidewalkW, sidewalkW, sidewalkH, rightX, bottomZ)); // Coin BD

        baseSidewalkGeom.dispose();
        return plotGeometries;
    }

    // Regroupe la génération du contenu principal de la parcelle en distinguant le cas "skyscraper"
    generatePlotPrimaryContent(plot) {
        if (plot.zoneType) {
            if (['house', 'building', 'industrial', 'park', 'skyscraper'].includes(plot.zoneType)) {
                // Traitement pour les autres zones
                this.createPlotGround(plot);
                const subZones = this.subdivideForPlacement(plot);
                const margin = this.config.buildingSubZoneMargin;
                subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(0, subZone.width - margin * 2);
                    const buildableDepth = Math.max(0, subZone.depth - margin * 2);
                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;
                        const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);
                        if (assetInfo) {
                            const instanceMatrix = this.calculateInstanceMatrix(
                                subZoneCenterX, subZoneCenterZ,
                                assetInfo.sizeAfterFitting.y,
                                assetInfo.fittingScaleFactor,
                                assetInfo.centerOffset,
                                assetInfo.userScale
                            );
                            const modelId = assetInfo.id;
                            if (!this.instanceData[plot.zoneType]) this.instanceData[plot.zoneType] = {};
                            if (!this.instanceData[plot.zoneType][modelId]) this.instanceData[plot.zoneType][modelId] = [];
                            this.instanceData[plot.zoneType][modelId].push(instanceMatrix);
                            // Stockage simplifié de l'emprise pour éviter de placer des arbres dans la zone occupée
                            if (!plot.occupiedSubZones) plot.occupiedSubZones = [];
                            plot.occupiedSubZones.push({
                                x: subZone.x + margin,
                                z: subZone.z + margin,
                                width: buildableWidth,
                                depth: buildableDepth
                            });
                        }
                    }
                });
            }
        }
    }

    // Place les arbres sur la parcelle selon le type de zone et des probabilités configurées
    placeTreesForPlot(plot) {
        if (!this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) {
            return;
        }
        const probSidewalk = this.config.treePlacementProbabilitySidewalk;
        const probPark = this.config.treePlacementProbabilityPark;
        const probMargin = this.config.treePlacementProbabilityMargin;
        const sidewalkW = this.config.sidewalkWidth;

        // 1. Arbres sur trottoir (aux coins par exemple)
        if (sidewalkW > 0 && probSidewalk > 0) {
            const corners = [
                { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 },
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 },
                { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 },
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }
            ];
            corners.forEach(corner => {
                if (Math.random() < probSidewalk) {
                    this.addTreeInstance(corner.x, corner.z);
                }
            });
        }

        // 2. Arbres dans la parcelle (cas des parcs ou en marge des zones construites)
        const plotBounds = {
            minX: plot.x, maxX: plot.x + plot.width,
            minZ: plot.z, maxZ: plot.z + plot.depth,
        };
        if (plot.zoneType === 'park' && probPark > 0) {
            const area = plot.width * plot.depth;
            const numTreesToTry = Math.ceil(area * probPark);
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                this.addTreeInstance(treeX, treeZ);
            }
        } else if (['house', 'building', 'industrial'].includes(plot.zoneType) && probMargin > 0) {
            const margin = this.config.buildingSubZoneMargin;
            const area = plot.width * plot.depth;
            const occupiedArea = (plot.occupiedSubZones || []).reduce((acc, sz) => acc + (sz.width * sz.depth), 0);
            const marginArea = area - occupiedArea;
            const numTreesToTry = Math.ceil(marginArea * probMargin);
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                let isOccupied = false;
                if (plot.occupiedSubZones) {
                    for (const sz of plot.occupiedSubZones) {
                        if (treeX >= sz.x && treeX <= sz.x + sz.width &&
                            treeZ >= sz.z && treeZ <= sz.z + sz.depth) {
                            isOccupied = true;
                            break;
                        }
                    }
                }
                if (!isOccupied) {
                    this.addTreeInstance(treeX, treeZ);
                }
            }
        }
    }

    // Ajoute une instance d'arbre à partir d'un asset aléatoire
    addTreeInstance(treeX, treeZ) {
        const assetInfo = this.assetLoader.getRandomAssetData('tree');
        if (assetInfo) {
            const randomScaleMultiplier = THREE.MathUtils.randFloat(0.85, 1.15);
            const finalUserScale = assetInfo.userScale * randomScaleMultiplier;
            const randomRotationY = Math.random() * Math.PI * 2;
            const instanceMatrix = this.calculateInstanceMatrix(
                treeX, treeZ,
                assetInfo.sizeAfterFitting.y,
                assetInfo.fittingScaleFactor,
                assetInfo.centerOffset,
                finalUserScale,
                randomRotationY
            );
            const modelId = assetInfo.id;
            const type = 'tree';
            if (!this.instanceData[type]) this.instanceData[type] = {};
            if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
            this.instanceData[type][modelId].push(instanceMatrix);
        }
    }

    // Retourne les groupes créés pour insertion dans la scène
    getGroups() {
        return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
    }

    // Réinitialise les données et stocke la référence vers l'assetLoader
    reset(assetLoader) {
        this.assetLoader = assetLoader;
        // On ajoute "skyscraper" dans l'instanceData pour que tous les types soient préparés
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {} };

        const disposeGroupContents = (group) => {
            while (group.children.length > 0) {
                const child = group.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                group.remove(child);
            }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);
    }

    // Calcule la matrice d'instance à partir de la position, du scale, d'une rotation optionnelle et du décalage
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0) {
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        const finalHeight = heightAfterFitting * userScale;
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalHeight / 2 + 0.05, centerZ);
        instanceMatrix.multiplyMatrices(scaleMatrix, rotationMatrix);
        instanceMatrix.multiply(recenterMatrix);
        instanceMatrix.premultiply(finalTranslationMatrix);
        return instanceMatrix;
    }

    // Itère sur instanceData pour créer pour chaque asset un InstancedMesh et l'ajouter au groupe principal
    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh par modèle (incluant arbres et gratte-ciels)...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;
        if (!this.assetLoader) {
            console.error("Impossible de créer InstancedMesh: AssetLoader non disponible.");
            return;
        }
        for (const type in this.instanceData) {
            if (!this.instanceData.hasOwnProperty(type)) continue;
            for (const modelId in this.instanceData[type]) {
                if (!this.instanceData[type].hasOwnProperty(modelId)) continue;
                const matrices = this.instanceData[type][modelId];
                if (matrices && matrices.length > 0) {
                    const assetData = this.assetLoader.getAssetDataById(modelId);
                    if (assetData && assetData.geometry && assetData.material) {
                        const instancedMesh = new THREE.InstancedMesh(
                            assetData.geometry,
                            assetData.material,
                            matrices.length
                        );
                        matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));
                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = true;
                        instancedMesh.name = `${type}_${modelId}`;
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++;
                        totalInstancesCreated += matrices.length;
                    } else {
                        console.warn(`Données d'asset ${modelId} (type ${type}) non trouvées ou invalides, ${matrices.length} instances ignorées.`);
                    }
                }
            }
        }
        if (instancedMeshCount > 0) {
            console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) InstancedMesh créés pour ${totalInstancesCreated} instances au total (tous types).`);
        } else {
            console.log("Aucune instance à créer via InstancedMesh.");
        }
    }

    // Crée le sol de la parcelle (pour tout type de zone)
    createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        let groundMaterial;
        if (plot.zoneType === 'park') {
            groundMaterial = this.materials.parkMaterial;
        } else {
            groundMaterial = this.materials.buildingGroundMaterial;
        }
        const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        // On suppose que plot possède une propriété center calculée en amont
        groundMesh.position.set(plot.center ? plot.center.x : plot.x + plot.width / 2, 0.2, plot.center ? plot.center.z : plot.z + plot.depth / 2);
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;
        this.buildingGroup.add(groundMesh);
    }

    // Subdivision pour le placement de contenus dans la parcelle (pour zones autres que skyscraper)
    subdivideForPlacement(plot) {
        let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': 
                minSubZoneSize = this.config.minHouseSubZoneSize; 
                break;
            case 'building': 
                minSubZoneSize = this.config.minBuildingSubZoneSize; 
                break;
            case 'industrial': 
                minSubZoneSize = this.config.minIndustrialSubZoneSize; 
                break;
            case 'park': 
                minSubZoneSize = this.config.minParkSubZoneSize; 
                break;
            case 'skyscraper':
                // Bien que les gratte-ciels soient gérés séparément, on peut définir la taille minimale ici
                minSubZoneSize = this.config.minSkyscraperSubZoneSize; 
                break;
            default: 
                minSubZoneSize = 10;
        }
        minSubZoneSize = Math.max(minSubZoneSize, 1);
        if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) {
            return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }];
        }
        if (plot.width < minSubZoneSize) {
            let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
            const subDepth = plot.depth / numRows;
            const subZones = [];
            for (let j = 0; j < numRows; j++) {
                subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth });
            }
            return subZones;
        }
        if (plot.depth < minSubZoneSize) {
            let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
            const subWidth = plot.width / numCols;
            const subZones = [];
            for (let i = 0; i < numCols; i++) {
                subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth });
            }
            return subZones;
        }
        let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
        let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
        const subZones = [];
        const subWidth = plot.width / numCols;
        const subDepth = plot.depth / numRows;
        for (let i = 0; i < numCols; i++) {
            for (let j = 0; j < numRows; j++) {
                subZones.push({ x: plot.x + i * subWidth, z: plot.z + j * subDepth, width: subWidth, depth: subDepth });
            }
        }
        return subZones;
    }
}
