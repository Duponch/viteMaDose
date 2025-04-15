// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import HouseRenderer from './HouseRenderer.js';
import BuildingRenderer from './BuildingRenderer.js';

export default class PlotContentGenerator {
    constructor(config, materials, debugPlotGridMaterial) {
        this.config = config;
        this.materials = materials;
        this.debugPlotGridMaterial = debugPlotGridMaterial ?? new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

        // Groupes pour stocker les contenus générés
        this.sidewalkGroup = new THREE.Group();
        this.sidewalkGroup.name = "Sidewalks";
        this.buildingGroup = new THREE.Group();
        this.buildingGroup.name = "PlotContents";
        this.groundGroup = new THREE.Group();
        this.groundGroup.name = "PlotGrounds";

        // Références et données
        this.assetLoader = null;
        this.instanceData = {
            house: {},
            building: {},
            industrial: {},
            park: {},
            tree: {},
            skyscraper: {},
            crosswalk: {}
        };
        this.stripeBaseGeometry = null;
        this.cityManager = null;
        this.navigationGraph = null;
        this.debugPlotGridGroup = null;

        // Instanciation des modules dédiés aux maisons et aux immeubles
        this.houseRenderer = new HouseRenderer(config, materials);
        this.buildingRenderer = new BuildingRenderer(config, materials);

        console.log("PlotContentGenerator initialized (avec stockage refs fenêtres).");
    }

    /**
     * Génère le contenu pour l'ensemble des parcelles.
     * On remet à zéro l'état interne, parcourt les parcelles, génère le contenu (maisons, immeubles, trottoirs, arbres, etc.)
     * et crée les InstancedMesh.
     */
    generateContent(leafPlots, assetLoader, crosswalkInfos = [], cityManager, debugPlotGridGroup = null) {
        this.reset(assetLoader);

        // Vérifications critiques
        if (!cityManager || !cityManager.getNavigationGraph()) {
            console.error("PlotContentGenerator.generateContent: CityManager or NavigationGraph not available! Cannot generate content.");
            return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
        }
        this.cityManager = cityManager;
        this.navigationGraph = cityManager.getNavigationGraph();
        this.debugPlotGridGroup = debugPlotGridGroup;
        console.log(`PlotContentGenerator: Starting content generation (NavGraph available, Debug Plot Grid Group: ${debugPlotGridGroup ? 'Yes' : 'No'})...`);

        // Réinitialisation des données d'instances
        this.instanceData = {
            house: {},
            building: {},
            industrial: {},
            park: {},
            tree: {},
            skyscraper: {},
            crosswalk: {}
        };

        const allSidewalkGeometries = [];
        if (this.config.crosswalkStripeWidth > 0) {
            this.stripeBaseGeometry = new THREE.BoxGeometry(this.config.crosswalkStripeWidth, this.config.crosswalkHeight, 0.5);
        }

        // Parcours des parcelles
        leafPlots.forEach((plot) => {
            // Pour chaque parcelle, on remet à zéro le suivi de placement des grilles de maison
            plot.placedHouseGrids = [];

            // Génération du contenu primaire de la parcelle (maison, immeuble, parc, etc.)
            this.generatePlotPrimaryContent(plot);

            // Récupération des trottoirs
            if (this.config.sidewalkWidth > 0) {
                const g = this.collectSidewalkGeometriesForPlot(plot);
                allSidewalkGeometries.push(...g);
            }

            // Placement d’arbres sur la parcelle
            this.placeTreesForPlot(plot);
        });

        // Traitement des passages piétons (crosswalk)
        if (crosswalkInfos && crosswalkInfos.length > 0 && this.stripeBaseGeometry) {
            if (!this.instanceData.crosswalk) this.instanceData.crosswalk = {};
            const crosswalkAssetId = 'default_crosswalk_stripe';
            if (!this.instanceData.crosswalk[crosswalkAssetId]) this.instanceData.crosswalk[crosswalkAssetId] = [];
            const matrix = new THREE.Matrix4();
            const basePosition = new THREE.Vector3();
            const stripePosition = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const offsetDirection = new THREE.Vector3();
            const yAxis = new THREE.Vector3(0, 1, 0);
            const stripeCount = this.config.crosswalkStripeCount;
            const stripeWidth = this.config.crosswalkStripeWidth;
            const stripeGap = this.config.crosswalkStripeGap;
            const stripeTotalWidth = stripeWidth + stripeGap;
            const totalWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap;
            const initialOffset = -totalWidth / 2 + stripeWidth / 2;
            crosswalkInfos.forEach(info => {
                basePosition.copy(info.position);
                const finalAngle = info.angle + Math.PI / 2;
                quaternion.setFromAxisAngle(yAxis, finalAngle);
                if (Math.abs(finalAngle % Math.PI) < 0.01) {
                    offsetDirection.set(1, 0, 0);
                } else {
                    offsetDirection.set(0, 0, 1);
                }
                scale.set(1, 1, info.length);
                for (let i = 0; i < stripeCount; i++) {
                    const currentOffset = initialOffset + i * stripeTotalWidth;
                    stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset);
                    stripePosition.y = this.config.crosswalkHeight / 2 + 0.005;
                    matrix.compose(stripePosition, quaternion, scale);
                    this.instanceData.crosswalk[crosswalkAssetId].push(matrix.clone());
                }
            });
        } else if (crosswalkInfos && crosswalkInfos.length > 0 && !this.stripeBaseGeometry) {
            console.warn("Crosswalk info received but stripeBaseGeometry not created (config?)");
        }

        // Création des InstancedMesh (maisons, immeubles, arbres, etc.)
        this.createInstancedMeshesFromData();

        // Fusion des géométries de trottoirs
        if (allSidewalkGeometries.length > 0) {
            const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false);
            if (mergedSidewalkGeometry) {
                const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial);
                sidewalkMesh.castShadow = false;
                sidewalkMesh.receiveShadow = true;
                sidewalkMesh.name = "Merged_Sidewalks";
                this.sidewalkGroup.add(sidewalkMesh);
            } else {
                console.warn("Sidewalk merge failed.");
            }
            allSidewalkGeometries.forEach(geom => geom.dispose());
        }

        console.log("PlotContentGenerator: Content generation finished.");
        return this.getGroups();
    }

    /**
     * Collecte et transforme les géométries pour les trottoirs d'une parcelle.
     */
    collectSidewalkGeometriesForPlot(plot) {
        const plotGeometries = [];
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width, plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2, plotCenterZ = plot.z + plotDepth / 2;
        const baseSidewalkGeom = new THREE.BoxGeometry(1, 1, 1);
        const createTransformedGeom = (width, depth, height, x, z, yOffset = 0) => {
            const matrix = new THREE.Matrix4();
            matrix.makeScale(width, height, depth);
            matrix.setPosition(new THREE.Vector3(x, height / 2 + yOffset, z));
            const clonedGeom = baseSidewalkGeom.clone();
            clonedGeom.applyMatrix4(matrix);
            return clonedGeom;
        };

        const halfSidewalkW = sidewalkW / 2;
        const topZ = plot.z - halfSidewalkW;
        const bottomZ = plot.z + plotDepth + halfSidewalkW;
        const leftX = plot.x - halfSidewalkW;
        const rightX = plot.x + plotWidth + halfSidewalkW;

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

    /**
     * Génère le contenu primaire d'une parcelle (sol, placement de bâtiments, etc.).
     * Pour le zoneType "house", on délègue la création à HouseRenderer.
     */
    generatePlotPrimaryContent(plot) {
        // Création du sol de la parcelle
        const plotGroundY = 0.15;
        this.createPlotGround(plot, plotGroundY);
        plot.buildingInstances = [];
        const groundLevel = plotGroundY;
        const zoneType = plot.zoneType;

        let targetBuildingWidth = 0;
        let targetBuildingDepth = 0;
        let baseScaleFactor = 1.0;
        let assetInfo = null;
        let minSpacing = 0;

        switch (zoneType) {
            case 'house': {
                const houseArmLength = 2.0;
                baseScaleFactor = this.config.gridHouseBaseScale ?? 1.5;
                targetBuildingWidth = houseArmLength * baseScaleFactor;
                targetBuildingDepth = houseArmLength * baseScaleFactor;
                minSpacing = this.config.minHouseSpacing ?? 0;
                break;
            }
            case 'building':
            case 'industrial':
            case 'skyscraper': {
                assetInfo = this.assetLoader.getRandomAssetData(zoneType);
                if (!assetInfo) {
                    console.warn(`Aucun asset ${zoneType} trouvé pour le plot ${plot.id}.`);
                    return;
                }
                if (zoneType === 'building') {
                    baseScaleFactor = this.config.gridBuildingBaseScale ?? 1.0;
                    minSpacing = this.config.minBuildingSpacing ?? 0;
                } else if (zoneType === 'industrial') {
                    baseScaleFactor = this.config.gridIndustrialBaseScale ?? 1.0;
                    minSpacing = this.config.minIndustrialSpacing ?? 0;
                } else {
                    baseScaleFactor = this.config.gridSkyscraperBaseScale ?? 1.0;
                    minSpacing = this.config.minSkyscraperSpacing ?? 0;
                }
                targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
                targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;
                break;
            }
            case 'park': {
                assetInfo = this.assetLoader.getRandomAssetData('park');
                if (!assetInfo) {
                    console.warn(`Aucun asset park trouvé pour le plot ${plot.id}.`);
                    return;
                }
                baseScaleFactor = this.config.gridParkBaseScale ?? 1.0;
                targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
                targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;
                minSpacing = this.config.minParkSpacing ?? 2.0;
                break;
            }
            default:
                console.warn(`Type de zone inconnu ou non géré pour le contenu primaire: ${zoneType}`);
                return;
        }

        if (['house', 'building', 'industrial', 'skyscraper', 'park'].includes(zoneType)) {
            if (targetBuildingWidth <= 0.01 || targetBuildingDepth <= 0.01) { return; }
            minSpacing = Math.max(0, minSpacing);
            let numItemsX = 0;
            const itemPlusSpacingX = targetBuildingWidth + minSpacing;
            if (plot.width >= targetBuildingWidth) {
                numItemsX = (itemPlusSpacingX > 0.01) ? Math.floor((plot.width + minSpacing) / itemPlusSpacingX) : Math.floor(plot.width / targetBuildingWidth);
                if (numItemsX === 0) numItemsX = 1;
            }
            let numItemsY = 0;
            const itemPlusSpacingY = targetBuildingDepth + minSpacing;
            if (plot.depth >= targetBuildingDepth) {
                numItemsY = (itemPlusSpacingY > 0.01) ? Math.floor((plot.depth + minSpacing) / itemPlusSpacingY) : Math.floor(plot.depth / targetBuildingDepth);
                if (numItemsY === 0) numItemsY = 1;
            }
            numItemsX = Math.max(0, numItemsX);
            numItemsY = Math.max(0, numItemsY);
            if (numItemsX === 0 || numItemsY === 0) { return; }
            const remainingWidth = plot.width - (numItemsX * targetBuildingWidth);
            const remainingDepth = plot.depth - (numItemsY * targetBuildingDepth);
            const gapX = (numItemsX > 0) ? Math.max(0, remainingWidth / (numItemsX + 1)) : 0;
            const gapZ = (numItemsY > 0) ? Math.max(0, remainingDepth / (numItemsY + 1)) : 0;

            if (zoneType === 'park') {
                // Placement dans les parcs
                let parkCells = [];
                for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
                    for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                        const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + gapX)) + targetBuildingWidth / 2;
                        const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + gapZ)) + targetBuildingDepth / 2;
                        const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
                        const distToLeft = cellCenterX - plot.x;
                        const distToRight = (plot.x + plot.width) - cellCenterX;
                        const distToTop = cellCenterZ - plot.z;
                        const distToBottom = (plot.z + plot.depth) - cellCenterZ;
                        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                        let targetRotationY = 0;
                        const tolerance = 0.1;
                        if (Math.abs(minDist - distToLeft) < tolerance)
                            targetRotationY = -Math.PI / 2;
                        else if (Math.abs(minDist - distToRight) < tolerance)
                            targetRotationY = Math.PI / 2;
                        else if (Math.abs(minDist - distToBottom) < tolerance)
                            targetRotationY = Math.PI;
                        parkCells.push({ pos: worldCellCenterPos, rotationY: targetRotationY });
                    }
                }
                const availableCells = parkCells.length;
                if (availableCells === 0) return;
                const minParkElements = this.config.minParkElements ?? 3;
                const maxParkElements = this.config.maxParkElements ?? 5;
                const effectiveMax = Math.min(maxParkElements, availableCells);
                const chosenCount = Math.floor(Math.random() * (effectiveMax - minParkElements + 1)) + minParkElements;
                let shuffledCells = parkCells.slice();
                for (let i = shuffledCells.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledCells[i], shuffledCells[j]] = [shuffledCells[j], shuffledCells[i]];
                }
                const selectedCells = shuffledCells.slice(0, chosenCount);
                selectedCells.forEach(item => {
                    const currentParkAsset = this.assetLoader.getRandomAssetData('park');
                    if (!currentParkAsset) {
                        console.warn("Aucun asset park trouvé lors de la sélection aléatoire.");
                        return;
                    }
                    const instanceMatrix = this.calculateInstanceMatrix(
                        item.pos.x, item.pos.z,
                        currentParkAsset.sizeAfterFitting.y,
                        currentParkAsset.fittingScaleFactor,
                        currentParkAsset.centerOffset,
                        baseScaleFactor,
                        item.rotationY
                    );
                    const modelId = currentParkAsset.id;
                    if (!this.instanceData['park']) this.instanceData['park'] = {};
                    if (!this.instanceData['park'][modelId]) this.instanceData['park'][modelId] = [];
                    this.instanceData['park'][modelId].push(instanceMatrix.clone());
                    const buildingPosition = item.pos.clone().setY(this.config.sidewalkHeight);
                    const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, 'park', buildingPosition);
                    if (registeredBuilding) {
                        plot.addBuildingInstance({
                            id: registeredBuilding.id,
                            type: 'park',
                            position: buildingPosition.clone()
                        });
                    }
                });
            } else if (zoneType === 'house') {
                // Délégation à HouseRenderer pour la création des maisons
                for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
                    for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                        const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + gapX)) + targetBuildingWidth / 2;
                        const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + gapZ)) + targetBuildingDepth / 2;
                        const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
                        const distToLeft = cellCenterX - plot.x;
                        const distToRight = (plot.x + plot.width) - cellCenterX;
                        const distToTop = cellCenterZ - plot.z;
                        const distToBottom = (plot.z + plot.depth) - cellCenterZ;
                        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                        let targetRotationY = 0;
                        const tolerance = 0.1;
                        if (Math.abs(minDist - distToLeft) < tolerance)
                            targetRotationY = -Math.PI / 2;
                        else if (Math.abs(minDist - distToRight) < tolerance)
                            targetRotationY = Math.PI / 2;
                        else if (Math.abs(minDist - distToBottom) < tolerance)
                            targetRotationY = Math.PI;

                        // Appel à HouseRenderer pour générer les matrices d'instances de la maison
                        const houseInstanceData = this.houseRenderer.generateHouseInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor);
                        if (!this.instanceData['house']) this.instanceData['house'] = {};
                        for (const part in houseInstanceData) {
                            if (houseInstanceData.hasOwnProperty(part)) {
                                if (!this.instanceData['house'][part]) this.instanceData['house'][part] = [];
                                this.instanceData['house'][part].push(...houseInstanceData[part]);
                            }
                        }
                        const buildingPosition = worldCellCenterPos.clone().setY(this.config.sidewalkHeight);
                        const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, 'house', buildingPosition);
                        if (registeredBuilding) {
                            plot.addBuildingInstance({
                                id: registeredBuilding.id,
                                type: 'house',
                                position: buildingPosition.clone()
                            });
                        }
                    }
                }
            } else {
                // Traitement standard pour 'building', 'industrial' et 'skyscraper' via BuildingRenderer
                for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
                    for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                        const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + gapX)) + targetBuildingWidth / 2;
                        const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + gapZ)) + targetBuildingDepth / 2;
                        const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
                        const distToLeft = cellCenterX - plot.x;
                        const distToRight = (plot.x + plot.width) - cellCenterX;
                        const distToTop = cellCenterZ - plot.z;
                        const distToBottom = (plot.z + plot.depth) - cellCenterZ;
                        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                        let targetRotationY = 0;
                        const tolerance = 0.1;
                        if (Math.abs(minDist - distToLeft) < tolerance)
                            targetRotationY = -Math.PI / 2;
                        else if (Math.abs(minDist - distToRight) < tolerance)
                            targetRotationY = Math.PI / 2;
                        else if (Math.abs(minDist - distToBottom) < tolerance)
                            targetRotationY = Math.PI;
  
                        if (assetInfo && ['building', 'industrial', 'skyscraper'].includes(zoneType)) {
                            const buildingInstanceData = this.buildingRenderer.generateBuildingInstance(
                                worldCellCenterPos,
                                groundLevel,
                                targetRotationY,
                                baseScaleFactor,
                                assetInfo
                            );
                            const modelId = assetInfo.id;
                            if (!this.instanceData[zoneType]) this.instanceData[zoneType] = {};
                            for (const part in buildingInstanceData) {
                                if (buildingInstanceData.hasOwnProperty(part)) {
                                    if (!this.instanceData[zoneType][modelId]) this.instanceData[zoneType][modelId] = [];
                                    this.instanceData[zoneType][modelId].push(...buildingInstanceData[part]);
                                }
                            }
                            const buildingPosition = worldCellCenterPos.clone().setY(this.config.sidewalkHeight);
                            const registeredBuilding = this.cityManager.registerBuildingInstance(plot.id, zoneType, buildingPosition);
                            if (registeredBuilding) {
                                plot.addBuildingInstance({
                                    id: registeredBuilding.id,
                                    type: zoneType,
                                    position: buildingPosition.clone()
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Place des arbres sur la parcelle selon le type de zone et la probabilité configurée.
     */
    placeTreesForPlot(plot) {
        if (!this.assetLoader || !this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) { return; }
        const probSidewalk = this.config.treePlacementProbabilitySidewalk ?? 0;
        const probPark = this.config.treePlacementProbabilityPark ?? 0;
        const sidewalkW = this.config.sidewalkWidth ?? 0;

        // 1. Placement sur les trottoirs
        if (sidewalkW > 0 && probSidewalk > 0) {
            const corners = [
                { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 },
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 },
                { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 },
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }
            ];
            corners.forEach(corner => { if (Math.random() < probSidewalk) { this.addTreeInstance(corner.x, corner.z); } });
        }

        // 2. Placement dans les parcs
        const plotBounds = { minX: plot.x, maxX: plot.x + plot.width, minZ: plot.z, maxZ: plot.z + plot.depth };
        if (plot.zoneType === 'park' && probPark > 0) {
            const area = plot.width * plot.depth;
            const numTreesToTry = Math.ceil(area * probPark);
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                this.addTreeInstance(treeX, treeZ);
            }
        }
    }

    /**
     * Ajoute une instance d'arbre en utilisant un asset aléatoire.
     */
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

    /**
     * Retourne les groupes utilisés pour le rendu.
     */
    getGroups() {
        return {
            sidewalkGroup: this.sidewalkGroup,
            buildingGroup: this.buildingGroup,
            groundGroup: this.groundGroup
        };
    }

    /**
     * Réinitialise l'état interne, vide les groupes et remet à zéro les données.
     */
    reset(assetLoader) {
        this.assetLoader = assetLoader;
        this.cityManager = null;
        this.navigationGraph = null;
        this.instanceData = {
            house: {},
            building: {},
            industrial: {},
            park: {},
            tree: {},
            skyscraper: {},
            crosswalk: {}
        };
        // Réinitialise également le HouseRenderer et le BuildingRenderer
        this.houseRenderer.reset();
        this.buildingRenderer.reset();

        if (this.stripeBaseGeometry) {
            this.stripeBaseGeometry.dispose();
            this.stripeBaseGeometry = null;
        }

        // Nettoyage des groupes
        const disposeGroupContents = (group) => {
            while (group.children.length > 0) {
                const child = group.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                group.remove(child);
            }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);
        disposeGroupContents(this.groundGroup);

        console.log("PlotContentGenerator reset complete.");
    }

    /**
     * Calcule la matrice d'instance pour un asset en fonction des paramètres.
     */
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0) {
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        const finalHeight = heightAfterFitting * userScale;
        const finalY = finalHeight / 2 + (this.config.plotGroundY ?? 0.005);
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalY, centerZ);
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(finalTranslationMatrix);
        return instanceMatrix;
    }

    /**
     * Crée les InstancedMesh à partir des données d'instance et les ajoute au groupe buildingGroup.
     */
    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        // Vider le groupe buildingGroup
        while (this.buildingGroup.children.length > 0) {
            this.buildingGroup.remove(this.buildingGroup.children[0]);
        }
        // Réinitialiser la liste des références pour les fenêtres
        this.windowInstancedMeshes = [];

        // --- 1. Maison (utilise les données générées par HouseRenderer) ---
        const houseDataType = 'house';
        if (this.instanceData[houseDataType]) {
            for (const partName in this.instanceData[houseDataType]) {
                if (this.instanceData[houseDataType].hasOwnProperty(partName)) {
                    const matrices = this.instanceData[houseDataType][partName];
                    const geometry = this.houseRenderer.baseHouseGeometries[partName];
                    let material = null;
                    const isHouseWindowPart = (partName === 'windowXY' || partName === 'windowYZ');
                    if (isHouseWindowPart) {
                        material = this.houseRenderer.baseHouseMaterials.window.clone();
                        material.name = `HouseWindowMat_Inst_${partName}`;
                        material.emissive = new THREE.Color(0xFFFF99);
                        material.emissiveIntensity = 0.0;
                        if (this.experience?.scene?.environment) {
                            material.envMap = this.experience.scene.environment;
                            material.roughness = 0.05;
                            material.metalness = 0.9;
                            material.needsUpdate = true;
                        } else {
                            console.warn(`[InstancedMesh] Env map non trouvée pour fenêtres maison (${partName}).`);
                        }
                    } else {
                        if (partName.startsWith('base_')) {
                            material = this.houseRenderer.baseHouseMaterials[partName];
                        } else if (partName === 'roof') {
                            material = this.houseRenderer.baseHouseMaterials.roof;
                        } else if (partName === 'door') {
                            material = this.houseRenderer.baseHouseMaterials.door;
                        } else if (partName === 'garageDoor') {
                            material = this.houseRenderer.baseHouseMaterials.garageDoor;
                        } else {
                            material = this.houseRenderer.baseHouseMaterials[partName];
                        }
                        if (!material) {
                            console.warn(`[InstancedMesh] Matériau non trouvé pour partie maison: ${partName}`);
                        }
                    }
                    if (geometry && material && matrices && matrices.length > 0) {
                        const count = matrices.length;
                        const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                        instancedMesh.name = `House_${partName}_Instanced`;
                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = !isHouseWindowPart;
                        matrices.forEach((matrix, index) => {
                            instancedMesh.setMatrixAt(index, matrix);
                        });
                        instancedMesh.instanceMatrix.needsUpdate = true;
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++;
                        totalInstancesCreated += count;
                        if (isHouseWindowPart) {
                            this.windowInstancedMeshes.push(instancedMesh);
                        }
                    } else if (!matrices || matrices.length === 0) {
                        // Rien à faire pour cette partie
                    } else {
                        if (!geometry) console.warn(`[InstancedMesh] Géométrie manquante pour partie maison: ${partName}`);
                        if (!material && !isHouseWindowPart) console.warn(`[InstancedMesh] Matériau non trouvé (non fenêtre) pour partie maison: ${partName}`);
                    }
                }
            }
        }

        // --- 2. Autres assets (building, industrial, park, tree, skyscraper, crosswalk) ---
        for (const type in this.instanceData) {
            if (type === houseDataType || !this.instanceData.hasOwnProperty(type)) continue;
            for (const modelId in this.instanceData[type]) {
                if (!this.instanceData[type].hasOwnProperty(modelId)) continue;
                const matrices = this.instanceData[type][modelId];
                if (matrices && matrices.length > 0) {
                    let isProceduralAsset = false;
                    if ((type === 'skyscraper' && modelId.startsWith('skyscraper_procedural_')) ||
                        (type === 'building' && modelId.startsWith('building_procedural_'))) {
                        isProceduralAsset = true;
                        const assetData = this.assetLoader.getAssetDataById(modelId);
                        if (assetData?.parts?.length > 0) {
                            assetData.parts.forEach((part, index) => {
                                if (part.geometry && part.material) {
                                    const partGeometry = part.geometry;
                                    const partMaterial = part.material;
                                    const count = matrices.length;
                                    const instancedMesh = new THREE.InstancedMesh(partGeometry, partMaterial, count);
                                    instancedMesh.name = `${modelId}_Part${index}_Instanced`;
                                    instancedMesh.castShadow = true;
                                    const isWindowPartProcedural = (partMaterial.name === "SkyscraperWindowMat_Standard" || partMaterial.name === "BuildingWindowMat");
                                    instancedMesh.receiveShadow = !isWindowPartProcedural;
                                    matrices.forEach((matrix, idx) => {
                                        instancedMesh.setMatrixAt(idx, matrix);
                                    });
                                    instancedMesh.instanceMatrix.needsUpdate = true;
                                    this.buildingGroup.add(instancedMesh);
                                    instancedMeshCount++;
                                    totalInstancesCreated += count;
                                    if (isWindowPartProcedural) {
                                        this.windowInstancedMeshes.push(instancedMesh);
                                    }
                                } else {
                                    console.warn(`[InstancedMesh] Partie invalide pour l'asset procédural ${modelId} (type ${type}).`);
                                }
                            });
                        } else {
                            console.warn(`[InstancedMesh] Données de parties manquantes pour l'asset procédural ${modelId} (type ${type}).`);
                        }
                    } else {
                        let geometry = null;
                        let material = null;
                        let castShadow = true;
                        let receiveShadow = true;
                        if (type === 'crosswalk') {
                            if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) {
                                geometry = this.stripeBaseGeometry;
                                material = this.materials.crosswalkMaterial;
                                castShadow = false;
                                receiveShadow = true;
                            } else {
                                console.warn(`[InstancedMesh] Géométrie/matériau manquant pour crosswalk.`);
                                continue;
                            }
                        } else if (this.assetLoader) {
                            const assetData = this.assetLoader.getAssetDataById(modelId);
                            if (assetData?.geometry && assetData?.material) {
                                geometry = assetData.geometry;
                                material = assetData.material;
                            } else {
                                console.warn(`[InstancedMesh] Données asset ${modelId} (type ${type}) invalides/non trouvées.`);
                                continue;
                            }
                        } else {
                            console.warn(`[InstancedMesh] AssetLoader manquant pour type '${type}'.`);
                            continue;
                        }

                        if (!isProceduralAsset) {
                            if (!geometry || !material) continue;
                            const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
                            matrices.forEach((matrix, index) => {
                                instancedMesh.setMatrixAt(index, matrix);
                            });
                            instancedMesh.instanceMatrix.needsUpdate = true;
                            instancedMesh.castShadow = castShadow;
                            instancedMesh.receiveShadow = receiveShadow;
                            instancedMesh.name = `${type}_${modelId}_Instanced`;
                            this.buildingGroup.add(instancedMesh);
                            instancedMeshCount++;
                            totalInstancesCreated += matrices.length;
                        }
                    }
                }
            }
        }

        if (instancedMeshCount > 0) {
            console.log(`InstancedMesh: ${instancedMeshCount} mesh(es) (${totalInstancesCreated} instances totales) créés. Total fenêtres suivies: ${this.windowInstancedMeshes ? this.windowInstancedMeshes.length : 0}.`);
        } else {
            console.log("Aucune instance InstancedMesh créée.");
        }
    }

    /**
     * Crée le sol de la parcelle en fonction de son zoneType.
     */
    createPlotGround(plot, groundY = 0.01) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        let groundMaterial;
        switch (plot.zoneType) {
            case 'park':
                groundMaterial = this.materials.parkMaterial;
                break;
            case 'house':
                groundMaterial = this.materials.houseGroundMaterial;
                break;
            case 'building':
                groundMaterial = this.materials.buildingGroundMaterial;
                break;
            case 'industrial':
                groundMaterial = this.materials.industrialGroundMaterial;
                break;
            case 'skyscraper':
                groundMaterial = this.materials.skyscraperGroundMaterial;
                break;
            default:
                console.warn(`Plot ${plot.id} a un zoneType ('${plot.zoneType}') non géré pour la couleur du sol. Utilisation du matériau 'buildingGround'.`);
                groundMaterial = this.materials.buildingGroundMaterial;
        }

        if (!groundMaterial) {
            console.error(`Matériau non trouvé pour zoneType '${plot.zoneType}' dans plot ${plot.id}. Utilisation du matériau 'buildingGround'.`);
            groundMaterial = this.materials.buildingGroundMaterial;
        }

        const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(
            plot.center ? plot.center.x : plot.x + plot.width / 2,
            groundY,
            plot.center ? plot.center.z : plot.z + plot.depth / 2
        );
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;
        this.groundGroup.add(groundMesh);
    }

    /**
     * Découpe une parcelle en sous-zones pour le placement.
     */
    subdivideForPlacement(plot) {
        let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': minSubZoneSize = this.config.minHouseSubZoneSize; break;
            case 'building': minSubZoneSize = this.config.minBuildingSubZoneSize; break;
            case 'industrial': minSubZoneSize = this.config.minIndustrialSubZoneSize; break;
            case 'park': minSubZoneSize = this.config.minParkSubZoneSize; break;
            case 'skyscraper': minSubZoneSize = this.config.minSkyscraperSubZoneSize; break;
            default: minSubZoneSize = 10;
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

    /**
     * Met à jour l'apparence des fenêtres en fonction de l'heure (allumage/extinction des lumières).
     * Les fenêtres des gratte-ciel, maisons et immeubles sont mises à jour selon leurs propriétés spécifiques.
     *
     * @param {number} currentHour - L'heure actuelle (en 24h) pour déterminer l'état lumineux.
     */
    update(currentHour) {
        // Les lumières sont allumées entre 18h inclus et 6h exclus
        const lightsOn = (currentHour >= 18 || currentHour < 6);

        // Parcourt toutes les InstancedMesh des fenêtres stockées dans this.windowInstancedMeshes
        if (!this.windowInstancedMeshes) return;
        this.windowInstancedMeshes.forEach(mesh => {
            if (mesh.material) {
                const material = mesh.material;
                let needsMaterialUpdate = false;
                // Identification du type de fenêtre selon le nom du matériau
                const isSkyscraperWindow = material.name === "SkyscraperWindowMat_Standard";
                const isHouseWindow = material.name.startsWith("HouseWindowMat_Inst_");
                const isBuildingWindow = material.name === "BuildingWindowMat";
                // Intensité émissive par défaut (éteint)
                let targetIntensity = 0.0;

                if (isSkyscraperWindow) {
                    // Logique spécifique pour les fenêtres de gratte-ciel
                    targetIntensity = lightsOn ? 1.17 : 0.0;
                    const targetTransmission = lightsOn ? 0.0 : 0.0; // Pas de transmission dans notre cas
                    const targetRoughness = lightsOn ? 0.8 : 0.1;
                    if (material.transmission !== targetTransmission) {
                        material.transmission = targetTransmission;
                        needsMaterialUpdate = true;
                    }
                    if (material.roughness !== targetRoughness) {
                        material.roughness = targetRoughness;
                        needsMaterialUpdate = true;
                    }
                } else if (isHouseWindow) {
                    // Logique spécifique pour les fenêtres de maison
                    targetIntensity = lightsOn ? 1.23 : 0.0;
                } else if (isBuildingWindow) {
                    // Logique spécifique pour les fenêtres d'immeuble
                    targetIntensity = lightsOn ? 0.88 : 0.0;
                }

                // Application de l'intensité émissive
                if (material.emissiveIntensity !== targetIntensity) {
                    material.emissiveIntensity = targetIntensity;
                }
                // Mise à jour du matériau si nécessaire
                if (needsMaterialUpdate) {
                    material.needsUpdate = true;
                }
            }
        });
    }
}
