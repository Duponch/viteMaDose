// src/World/PlotContentGenerator.js
import * as THREE from 'three';

export default class PlotContentGenerator {
    constructor(config, materials) {
        // config contient maintenant minParkSubZoneSize
        this.config = config;
        this.materials = materials; // Contient sidewalk, park (pour sol), buildingGround
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra InstancedMesh (tous types), sols des parcelles
        this.assetLoader = null;
        console.log("PlotContentGenerator initialisé (avec support park modèles).");
    }

    generateContent(leafPlots, assetLoader) {
        this.reset();
        this.assetLoader = assetLoader;
        console.log("Génération du contenu des parcelles (incluant modèles parcs)...");

        if (!leafPlots || leafPlots.length === 0) {
            console.warn("PlotContentGenerator: Aucune parcelle fournie.");
            return this.getGroups();
        }
        if (!this.assetLoader) {
            console.error("PlotContentGenerator: AssetLoader non fourni !");
            return this.getGroups();
        }

        // Structure pour collecter les matrices par ID de modèle unique, incluant les parcs
        const instanceData = {
            house: {},
            building: {},
            industrial: {},
            park: {} // *** NOUVEAU: Ajouter 'park' ***
        };

        leafPlots.forEach((plot) => {
            // 1. Créer trottoirs (inchangé)
            if (this.config.sidewalkWidth > 0) {
                this.createSidewalksForPlot(plot);
            }

            // 2. Gérer les parcs et zones constructibles
            // *** MODIFIÉ: Traiter 'park' comme les autres types constructibles ***
            if (plot.zoneType && ['house', 'building', 'industrial', 'park'].includes(plot.zoneType)) {

                // Créer le sol de la parcelle (utilise parkMaterial si zoneType='park')
                this.createPlotGround(plot); // Crée un sol vert pour les parcs, gris pour les autres

                // Subdiviser pour placement multiple
                const subZones = this.subdivideForPlacement(plot); // Gère maintenant le type 'park'
                const margin = this.config.buildingSubZoneMargin; // Utiliser la même marge pour tous ?

                subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(0, subZone.width - margin * 2);
                    const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;

                        // Choisir un modèle aléatoire du bon type ('house', 'building', 'industrial', ou 'park')
                        const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);

                        if (assetInfo) {
                            const instanceMatrix = this.calculateInstanceMatrix(
                                subZoneCenterX, subZoneCenterZ,
                                assetInfo.sizeAfterScaling.y, assetInfo.scaleFactor, assetInfo.centerOffset
                            );

                            const modelId = assetInfo.id;
                            const type = plot.zoneType; // Sera 'park' pour les parcs

                            // Stocker la matrice, groupée par ID et type
                            if (!instanceData[type]) instanceData[type] = {}; // Vérif existence type (redondant mais sûr)
                            if (!instanceData[type][modelId]) instanceData[type][modelId] = [];
                            instanceData[type][modelId].push(instanceMatrix);
                        }
                        // else { console.warn(`Aucun asset trouvé pour le type ${plot.zoneType}`); } // Décommenter si besoin de debug
                    }
                }); // Fin boucle subZones
            }
            // *** SUPPRIMÉ: L'ancienne logique 'if (plot.isPark) { createParkGeometry(plot); }' est enlevée ***
            // Car maintenant géré dans le bloc principal ci-dessus.

            // Ignorer les types 'unbuildable' ou autres non gérés
        }); // Fin boucle leafPlots

        // Créer les InstancedMesh (inclut maintenant les parcs)
        this.createInstancedMeshesFromData(instanceData);

        console.log("Génération du contenu (avec modèles parcs) terminée.");
        return this.getGroups();
    }

    getGroups() {
         return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
     }

    reset() {
        this.assetLoader = null;
        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const obj = group.children[0];
                 group.remove(obj);
                 if (obj instanceof THREE.InstancedMesh) {
                      if (obj.geometry) obj.geometry.dispose();
                 } else if (obj instanceof THREE.Mesh) {
                      if (obj.geometry) obj.geometry.dispose();
                      // Ne pas disposer les matériaux partagés (sidewalk, ground, parkMaterial)
                 } else if (obj instanceof THREE.Group) {
                      disposeGroupContents(obj);
                 }
             }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);
        // console.log("Plot Content Generator réinitialisé.");
    }

    // Inchangé - calcule la matrice pour n'importe quel type
    calculateInstanceMatrix(centerX, centerZ, modelHeight, scaleFactor, centerOffset) {
        const instanceMatrix = new THREE.Matrix4();
        const scale = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
        const recenter = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        const finalTranslation = new THREE.Matrix4().makeTranslation(centerX, modelHeight / 2 + 0.1, centerZ); // +0.1 pour légère surélévation
        instanceMatrix.multiplyMatrices(scale, recenter);
        instanceMatrix.premultiply(finalTranslation);
        return instanceMatrix;
    }

    // Inchangé - crée les InstancedMesh pour tous les types présents dans instanceData
    createInstancedMeshesFromData(instanceData) {
        console.log("Création des InstancedMesh par modèle (incluant Parcs)...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        if (!this.assetLoader) {
            console.error("Impossible de créer InstancedMesh: AssetLoader non disponible.");
            return;
        }

        // Parcourir les types ('house', 'building', 'industrial', 'park')
        for (const type in instanceData) {
            for (const modelId in instanceData[type]) {
                const matrices = instanceData[type][modelId];

                if (matrices && matrices.length > 0) {
                    const assetData = this.assetLoader.getAssetDataById(modelId); // Récupère les données du modèle (geom, mat)

                    if (assetData && assetData.geometry && assetData.material) {
                        const instancedMesh = new THREE.InstancedMesh(
                            assetData.geometry, assetData.material, matrices.length
                        );
                        matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));

                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = true;
                        instancedMesh.name = modelId;

                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++;
                        totalInstancesCreated += matrices.length;
                    } else {
                        console.warn(`Données d'asset ${modelId} (type ${type}) non trouvées, ${matrices.length} instances ignorées.`);
                    }
                }
            }
        }

        if (instancedMeshCount > 0) {
             console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) créés pour ${totalInstancesCreated} instances.`);
        } else {
             console.log("Aucune instance à créer via InstancedMesh.");
        }
    }

    // Inchangé
    createSidewalksForPlot(plot) {
        const sidewalkW = this.config.sidewalkWidth; if (sidewalkW <= 0) return;
        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width; const plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2; const plotCenterZ = plot.z + plotDepth / 2;

        const singlePlotSidewalkGroup = new THREE.Group();
        singlePlotSidewalkGroup.position.set(plotCenterX, 0, plotCenterZ);
        singlePlotSidewalkGroup.name = `Sidewalk_Plot_${plot.id}`;

        const geomH = new THREE.BoxGeometry(plotWidth, sidewalkH, sidewalkW);
        const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, plotDepth);
        const geomCorner = new THREE.BoxGeometry(sidewalkW, sidewalkH, sidewalkW);
        const sidewalkMat = this.materials.sidewalkMaterial;

        const createMesh = (geometry, x, z) => {
            const mesh = new THREE.Mesh(geometry, sidewalkMat); mesh.position.set(x, sidewalkH / 2, z);
            mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
        };

        singlePlotSidewalkGroup.add(createMesh(geomH, 0, -plotDepth / 2 - sidewalkW / 2));
        singlePlotSidewalkGroup.add(createMesh(geomH, 0, plotDepth / 2 + sidewalkW / 2));
        singlePlotSidewalkGroup.add(createMesh(geomV, -plotWidth / 2 - sidewalkW / 2, 0));
        singlePlotSidewalkGroup.add(createMesh(geomV, plotWidth / 2 + sidewalkW / 2, 0));
        singlePlotSidewalkGroup.add(createMesh(geomCorner, -plotWidth / 2 - sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2));
        singlePlotSidewalkGroup.add(createMesh(geomCorner, plotWidth / 2 + sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2));
        singlePlotSidewalkGroup.add(createMesh(geomCorner, -plotWidth / 2 - sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));
        singlePlotSidewalkGroup.add(createMesh(geomCorner, plotWidth / 2 + sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));

        this.sidewalkGroup.add(singlePlotSidewalkGroup);

        geomH.dispose(); geomV.dispose(); geomCorner.dispose();
    }

    // *** SUPPRIMÉ: createParkGeometry n'est plus appelée ***
    // createParkGeometry(plot) { ... }

    // Modifié pour utiliser le bon matériau selon le type de zone
    createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        // Choisir le matériau du sol basé sur le zoneType
        let groundMaterial;
        if (plot.zoneType === 'park') {
            groundMaterial = this.materials.parkMaterial; // Sol vert pour les parcs
        } else {
            groundMaterial = this.materials.buildingGroundMaterial; // Sol gris/sombre pour les autres
        }

        const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(plot.center.x, 0.05, plot.center.z); // Légèrement au-dessus du sol global
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;
        this.buildingGroup.add(groundMesh); // Ajouter au groupe 'building' (qui contient tout le contenu des parcelles)
    }

    // Modifié pour inclure un cas pour 'park'
    subdivideForPlacement(plot) {
        let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': minSubZoneSize = this.config.minHouseSubZoneSize; break;
            case 'building': minSubZoneSize = this.config.minBuildingSubZoneSize; break;
            case 'industrial': minSubZoneSize = this.config.minIndustrialSubZoneSize; break;
            case 'park': minSubZoneSize = this.config.minParkSubZoneSize; break; // *** NOUVEAU: Utilise la config parc ***
            default: minSubZoneSize = 10;
        }
        minSubZoneSize = Math.max(minSubZoneSize, 1); // Assurer > 0

        // Si minParkSubZoneSize est très grand, cela favorisera une seule zone (un seul modèle par parcelle)
        // Si minParkSubZoneSize est petit, plusieurs petits éléments de parc pourraient être placés.

       // Le reste de la logique de subdivision reste identique...
       if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) {
            return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }];
       }
        if (plot.width < minSubZoneSize) {
           let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
           const subDepth = plot.depth / numRows; const subZones = [];
            for (let j = 0; j < numRows; j++) subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth });
            return subZones;
        }
         if (plot.depth < minSubZoneSize) {
           let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
            const subWidth = plot.width / numCols; const subZones = [];
             for (let i = 0; i < numCols; i++) subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth });
             return subZones;
         }

       let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
       let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
       const subZones = []; const subWidth = plot.width / numCols; const subDepth = plot.depth / numRows;
       for (let i = 0; i < numCols; i++) {
           for (let j = 0; j < numRows; j++) {
               subZones.push({ x: plot.x + i * subWidth, z: plot.z + j * subDepth, width: subWidth, depth: subDepth });
           }
       }
       return subZones;
   }
}