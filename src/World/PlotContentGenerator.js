// src/World/PlotContentGenerator.js
import * as THREE from 'three';

export default class PlotContentGenerator {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group();
        this.assetLoader = null;
        console.log("PlotContentGenerator initialisé (avec support park modèles et scale).");
    }

    generateContent(leafPlots, assetLoader) {
        this.reset();
        this.assetLoader = assetLoader;
        console.log("Génération du contenu des parcelles (avec scale spécifique)...");

        if (!leafPlots || leafPlots.length === 0) {
            console.warn("PlotContentGenerator: Aucune parcelle fournie.");
            return this.getGroups();
        }
        if (!this.assetLoader) {
            console.error("PlotContentGenerator: AssetLoader non fourni !");
            return this.getGroups();
        }

        const instanceData = { house: {}, building: {}, industrial: {}, park: {} };

        leafPlots.forEach((plot) => {
            if (this.config.sidewalkWidth > 0) {
                this.createSidewalksForPlot(plot);
            }

            if (plot.zoneType && ['house', 'building', 'industrial', 'park'].includes(plot.zoneType)) {
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
                            // MODIFIÉ: Passe userScale à calculateInstanceMatrix
                            const instanceMatrix = this.calculateInstanceMatrix(
                                subZoneCenterX, subZoneCenterZ,
                                assetInfo.sizeAfterFitting.y, // Hauteur après ajustement
                                assetInfo.fittingScaleFactor, // Scale d'ajustement
                                assetInfo.centerOffset,      // Offset de centrage
                                assetInfo.userScale          // Scale spécifié par l'utilisateur
                            );

                            const modelId = assetInfo.id;
                            const type = plot.zoneType;

                            if (!instanceData[type]) instanceData[type] = {};
                            if (!instanceData[type][modelId]) instanceData[type][modelId] = [];
                            instanceData[type][modelId].push(instanceMatrix);
                        }
                    }
                });
            }
        });

        this.createInstancedMeshesFromData(instanceData);

        console.log("Génération du contenu (avec scale spécifique) terminée.");
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
                      // Le matériau est cloné dans l'asset loader, pas besoin de le disposer ici
                      if (obj.geometry) obj.geometry.dispose(); // La géométrie est partagée par l'instance, disposer ici
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
    }

    // MODIFIÉ: Ajout du paramètre userScale et utilisation
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale) {
        const instanceMatrix = new THREE.Matrix4();

        // Calcule le scale final en combinant le scale d'ajustement et le scale utilisateur
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);

        // Déplacement pour recentrer la géométrie (qui a été centrée dans le loader)
        // Comme la géométrie est déjà centrée, l'offset devrait être (0,0,0) mais on le garde par sécurité
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);

        // Translation finale pour placer le modèle à sa position dans le monde
        // On utilise la hauteur *après* application du fittingScale *et* du userScale
        const finalHeight = heightAfterFitting * userScale;
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalHeight / 2 + 0.1, centerZ); // +0.1 pour légère surélévation

        // Combinaison des transformations : Scale -> Recenter -> Translate
        // Note: l'ordre est important. On applique d'abord le scale et le recentrage sur le modèle à l'origine,
        // puis on le translate à sa position finale.
        // matrix.premultiply(otherMatrix) équivaut à matrix = otherMatrix * matrix
        // matrix.multiply(otherMatrix) équivaut à matrix = matrix * otherMatrix

        // 1. Appliquer le scale
        instanceMatrix.copy(scaleMatrix);
        // 2. Appliquer le recentrage (par rapport à l'origine locale après scale)
        //    Techniquement, comme on a centré la géométrie, ce recenterMatrix devrait être proche de l'identité si centerOffset est (0,0,0).
        //    Mais si le modèle n'était pas parfaitement centré à l'origine dans le fichier source, `centerOffset` le corrige.
        //    On multiplie le scale par la translation de recentrage.
        instanceMatrix.multiply(recenterMatrix); //  instanceMatrix = scaleMatrix * recenterMatrix

        // 3. Placer le modèle au bon endroit dans le monde (appliquer la translation finale)
        //    On prémultiplie par la translation finale.
        instanceMatrix.premultiply(finalTranslationMatrix); // instanceMatrix = finalTranslationMatrix * instanceMatrix (qui contient scale*recenter)

        return instanceMatrix;
    }


    // Inchangé - crée les InstancedMesh pour tous les types présents dans instanceData
    createInstancedMeshesFromData(instanceData) {
        console.log("Création des InstancedMesh par modèle (incluant Parcs et scale)...");
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
                    const assetData = this.assetLoader.getAssetDataById(modelId);

                    if (assetData && assetData.geometry && assetData.material) {
                        // Utilise la géométrie et le matériau (cloné) récupérés
                        const instancedMesh = new THREE.InstancedMesh(
                            assetData.geometry,
                            assetData.material, // Utilise le matériau cloné
                            matrices.length
                        );
                        matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));

                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = true;
                        instancedMesh.name = modelId; // Nom basé sur l'ID unique du modèle

                        this.buildingGroup.add(instancedMesh); // Ajouter au groupe principal du contenu
                        instancedMeshCount++;
                        totalInstancesCreated += matrices.length;
                    } else {
                        console.warn(`Données d'asset ${modelId} (type ${type}) non trouvées ou invalides, ${matrices.length} instances ignorées.`);
                    }
                }
            }
        }

        if (instancedMeshCount > 0) {
             console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) InstancedMesh créés pour ${totalInstancesCreated} instances au total.`);
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

        // Utiliser une seule géométrie pour tous les segments de trottoir pour optimiser
        const sidewalkGeom = new THREE.BoxGeometry(1, sidewalkH, 1); // Géométrie de base 1xHautx1
        const sidewalkMat = this.materials.sidewalkMaterial;

        const createMesh = (width, depth, x, z) => {
            const mesh = new THREE.Mesh(sidewalkGeom, sidewalkMat);
            mesh.scale.set(width, 1, depth); // Mise à l'échelle de la géométrie de base
            mesh.position.set(x, sidewalkH / 2, z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            return mesh;
        };

        // Bordures
        singlePlotSidewalkGroup.add(createMesh(plotWidth, sidewalkW, 0, -plotDepth / 2 - sidewalkW / 2)); // Haut
        singlePlotSidewalkGroup.add(createMesh(plotWidth, sidewalkW, 0, plotDepth / 2 + sidewalkW / 2));  // Bas
        singlePlotSidewalkGroup.add(createMesh(sidewalkW, plotDepth, -plotWidth / 2 - sidewalkW / 2, 0)); // Gauche
        singlePlotSidewalkGroup.add(createMesh(sidewalkW, plotDepth, plotWidth / 2 + sidewalkW / 2, 0));  // Droite
        // Coins
        singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, -plotWidth / 2 - sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2)); // HG
        singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, plotWidth / 2 + sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2));  // HD
        singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, -plotWidth / 2 - sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));  // BG
        singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, plotWidth / 2 + sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));   // BD

        this.sidewalkGroup.add(singlePlotSidewalkGroup);

        sidewalkGeom.dispose(); // Dispose la géométrie de base car elle n'est plus nécessaire
    }

    // Modifié pour utiliser le bon matériau selon le type de zone
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
        groundMesh.position.set(plot.center.x, 0.05, plot.center.z);
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;
        this.buildingGroup.add(groundMesh); // Ajouter au groupe 'building' (contenu des parcelles)
    }

    // Modifié pour inclure un cas pour 'park'
    subdivideForPlacement(plot) {
        let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': minSubZoneSize = this.config.minHouseSubZoneSize; break;
            case 'building': minSubZoneSize = this.config.minBuildingSubZoneSize; break;
            case 'industrial': minSubZoneSize = this.config.minIndustrialSubZoneSize; break;
            case 'park': minSubZoneSize = this.config.minParkSubZoneSize; break;
            default: minSubZoneSize = 10; // Valeur par défaut si type inconnu
        }
        minSubZoneSize = Math.max(minSubZoneSize, 1);

       // Le reste de la logique de subdivision reste identique
       if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) {
            return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }];
       }
        // Si trop étroit mais assez profond
        if (plot.width < minSubZoneSize) {
           let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
           const subDepth = plot.depth / numRows; const subZones = [];
            for (let j = 0; j < numRows; j++) subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth });
            return subZones;
        }
         // Si trop peu profond mais assez large
         if (plot.depth < minSubZoneSize) {
           let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
            const subWidth = plot.width / numCols; const subZones = [];
             for (let i = 0; i < numCols; i++) subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth });
             return subZones;
         }

       // Subdivision en grille
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