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
		this.crosswalkBaseGeometry = null;
        console.log("PlotContentGenerator initialisé (avec support arbres et gratte-ciels).");
    }

	generateContent(leafPlots, assetLoader, crosswalkInfos = []) {
        this.reset(assetLoader);
        console.log("Génération du contenu (incluant passages piétons en bandes tournées)...");

        const allSidewalkGeometries = [];

        // Géométrie de base pour UNE BANDE (inchangé ici)
        this.stripeBaseGeometry = new THREE.BoxGeometry(
            this.config.crosswalkStripeWidth,
            this.config.crosswalkHeight,
            0.5 // Longueur Z locale, sera scalée
        );

        leafPlots.forEach((plot) => {
            // ... (Génération contenu parcelle, trottoirs, arbres - inchangé) ...
             this.generatePlotPrimaryContent(plot);
             if (this.config.sidewalkWidth > 0) { const g = this.collectSidewalkGeometriesForPlot(plot); allSidewalkGeometries.push(...g); }
             this.placeTreesForPlot(plot);
        });

        // --- Traitement pour générer les bandes (avec rotation ajoutée) ---
        if (crosswalkInfos && crosswalkInfos.length > 0) {
            console.log(`Préparation des matrices pour ${crosswalkInfos.length} passages piétons (en bandes)...`);

            if (!this.instanceData.crosswalk) this.instanceData.crosswalk = {};
            const crosswalkAssetId = 'default_crosswalk_stripe';
            if (!this.instanceData.crosswalk[crosswalkAssetId]) this.instanceData.crosswalk[crosswalkAssetId] = [];

            // Objets temporaires pour éviter recréation dans la boucle
            const matrix = new THREE.Matrix4();
            const basePosition = new THREE.Vector3();
            const stripePosition = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const offsetDirection = new THREE.Vector3();
            const yAxis = new THREE.Vector3(0, 1, 0); // Axe de rotation Y

            const stripeCount = this.config.crosswalkStripeCount;
            const stripeWidth = this.config.crosswalkStripeWidth;
            const stripeGap = this.config.crosswalkStripeGap;
            const stripeTotalWidth = stripeWidth + stripeGap;
            const totalWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap;
            const initialOffset = -totalWidth / 2 + stripeWidth / 2;

            crosswalkInfos.forEach(info => {
                basePosition.copy(info.position); // Position centrale du passage (calculée dans RoadNetworkGenerator)

                // --- AJOUT DE LA ROTATION SUPPLÉMENTAIRE ---
                // L'angle de base (info.angle) oriente le passage PARALLÈLEMENT à la route H ou V.
                // On ajoute PI/2 pour orienter les bandes PERPENDICULAIREMENT à la route.
                const finalAngle = info.angle + Math.PI / 2;
                quaternion.setFromAxisAngle(yAxis, finalAngle);
                // --------------------------------------------

                // Direction du décalage des bandes (perpendiculaire à l'orientation FINALE des bandes)
                // Si finalAngle est ~PI/2 (bandes horizontales), décaler sur Z.
                // Si finalAngle est ~0 ou ~PI (bandes verticales), décaler sur X.
                // Note: C'est l'inverse de la logique précédente car l'angle a changé.
                if (Math.abs(finalAngle) < 0.01 || Math.abs(finalAngle - Math.PI) < 0.01 || Math.abs(finalAngle + Math.PI) < 0.01) { // Bandes verticales
                     offsetDirection.set(1, 0, 0); // Décaler sur X
                } else { // Bandes horizontales
                    offsetDirection.set(0, 0, 1); // Décaler sur Z
                }


                // Mettre à l'échelle la longueur (Z local) pour correspondre à info.length (longueur réduite calculée avant)
                scale.set(1, 1, info.length);

                // Créer les matrices pour chaque bande
                for (let i = 0; i < stripeCount; i++) {
                    const currentOffset = initialOffset + i * stripeTotalWidth;
                    stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset);
                    stripePosition.y = this.config.crosswalkHeight / 2 + 0.005; // Hauteur

                    matrix.compose(stripePosition, quaternion, scale);
                    this.instanceData.crosswalk[crosswalkAssetId].push(matrix.clone());
                }
            });
        }
        // --- Fin traitement bandes ---

        this.createInstancedMeshesFromData();

        // Fusion trottoirs (inchangé)
		if (allSidewalkGeometries.length > 0) { const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false); if (mergedSidewalkGeometry) { const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial); sidewalkMesh.castShadow = false; sidewalkMesh.receiveShadow = true; sidewalkMesh.name = "Merged_Sidewalks"; this.sidewalkGroup.add(sidewalkMesh); } else { console.warn("Fusion trottoirs échouée."); } allSidewalkGeometries.forEach(geom => geom.dispose()); }


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
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {}, crosswalk: {} };

        const disposeGroupContents = (group) => {
             while (group.children.length > 0) { const c = group.children[0]; group.remove(c); if (c.geometry) c.geometry.dispose(); /* if (c.material) c.material.dispose(); // Careful with shared mats */ } // Safety: Check before disposing material if reused
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);

        // Disposer l'ancienne géométrie de base si elle existe
        if (this.stripeBaseGeometry) {
            this.stripeBaseGeometry.dispose();
            this.stripeBaseGeometry = null;
        }
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
        console.log("Création des InstancedMesh par modèle (incluant bandes passages piétons)...");
        let totalInstancesCreated = 0; let instancedMeshCount = 0;
        if (!this.assetLoader && !this.stripeBaseGeometry) { console.error("Impossible de créer InstancedMesh: AssetLoader ET stripeBaseGeometry non dispos."); return; }
        for (const type in this.instanceData) {
            if (!this.instanceData.hasOwnProperty(type)) continue;
            for (const modelId in this.instanceData[type]) {
                if (!this.instanceData[type].hasOwnProperty(modelId)) continue;
                const matrices = this.instanceData[type][modelId];
                if (matrices && matrices.length > 0) {
                    let geometry = null; let material = null; let castShadow = true; let receiveShadow = true;
                    if (type === 'crosswalk') {
                        if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) {
                            geometry = this.stripeBaseGeometry; material = this.materials.crosswalkMaterial; castShadow = false; receiveShadow = true;
                        } else { console.warn(`Géométrie/matériau manquant pour 'crosswalk' (bandes), ${matrices.length} instances ignorées.`); continue; }
                    } else if (this.assetLoader) {
                        const assetData = this.assetLoader.getAssetDataById(modelId);
                        if (assetData && assetData.geometry && assetData.material) { geometry = assetData.geometry; material = assetData.material; }
                        else { console.warn(`Données asset ${modelId} (type ${type}) invalides, ${matrices.length} instances ignorées.`); continue; }
                    } else { continue; }
                    const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
                    matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));
                    instancedMesh.castShadow = castShadow; instancedMesh.receiveShadow = receiveShadow; instancedMesh.name = `${type}_${modelId}`;
                    this.buildingGroup.add(instancedMesh); instancedMeshCount++; totalInstancesCreated += matrices.length;
                }
            }
        }
        if (instancedMeshCount > 0) { console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) pour ${totalInstancesCreated} instances.`); } else { console.log("Aucune instance à créer via InstancedMesh."); }
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
