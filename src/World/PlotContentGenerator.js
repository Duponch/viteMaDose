import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'; // Si besoin pour les trottoirs

export default class PlotContentGenerator {
    constructor(config, materials) {
        this.config = config; // sidewalkWidth, sidewalkHeight, park parameters, buildingSubZoneMargin, etc.
        this.materials = materials; // sidewalkMaterial, parkMaterial, buildingGroundMaterial
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra bâtiments, parcs, sols des parcelles
    }

    generateContent(leafPlots, assetData) {
        this.reset();
        console.log("Génération du contenu des parcelles (trottoirs, bâtiments, parcs)...");

        if (!leafPlots || leafPlots.length === 0) {
            console.warn("Aucune parcelle fournie pour générer le contenu.");
            return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
        }
        if (!assetData) {
            console.warn("Données des assets non fournies pour générer le contenu.");
            // On pourrait générer trottoirs/parcs mais pas les bâtiments
            // return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
        }


        const houseInstanceMatrices = [];
        const buildingInstanceMatrices = [];
        const houseAsset = assetData?.house; // Utilise optional chaining
        const buildingAsset = assetData?.building;


        leafPlots.forEach((plot) => {
            if (this.config.sidewalkWidth > 0) {
                this.createSidewalksForPlot(plot);
            }

            if (plot.isPark) {
                this.createParkGeometry(plot);
            } else if (plot.zoneType && plot.width > 0.1 && plot.depth > 0.1) { // Constructible
                // Sol de la parcelle
                this.createPlotGround(plot);

                 // Subdiviser pour placer les bâtiments/maisons
                 const subZones = this.subdivideForPlacement(plot);
                 const margin = this.config.buildingSubZoneMargin;

                 subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(0, subZone.width - margin * 2);
                    const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;

                        let assetInfo = null;
                        let matrixList = null;

                        if (plot.zoneType === "house" && houseAsset?.mergedGeometry) {
                           assetInfo = houseAsset;
                           matrixList = houseInstanceMatrices;
                        } else if (plot.zoneType === "building" && buildingAsset?.mergedGeometry) {
                            assetInfo = buildingAsset;
                            matrixList = buildingInstanceMatrices;
                        }

                        if (assetInfo && matrixList) {
                             const instanceMatrix = this.calculateInstanceMatrix(
                                 subZoneCenterX,
                                 subZoneCenterZ,
                                 assetInfo.sizeAfterScaling.y, // Utiliser la hauteur après scaling
                                 assetInfo.scaleFactor,
                                 assetInfo.centerOffset
                             );
                             matrixList.push(instanceMatrix);
                        }
                    }
                 });
            }
        });

        // Créer les InstancedMesh si nécessaire
        this.createInstancedMeshes(houseInstanceMatrices, buildingInstanceMatrices, houseAsset, buildingAsset);

        console.log("Génération du contenu terminée.");
        return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
    }

    reset() {
        // Vider et disposer les géométries/meshes des groupes
        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const obj = group.children[0];
                 group.remove(obj);
                 if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                     if (obj.geometry) obj.geometry.dispose();
                     // Ne pas disposer les matériaux partagés (sidewalk, park, ground)
                     // Pour InstancedMesh, le matériau vient de l'asset loader
                     if (obj instanceof THREE.InstancedMesh) {
                         // Le matériau est cloné dans l'asset loader, on pourrait le disposer ici
                         // mais attention si le loader est réutilisé sans recharger
                         // if (obj.material && obj.material.dispose) obj.material.dispose();
                     }
                 } else if (obj instanceof THREE.Group) {
                     disposeGroupContents(obj); // Récursif si nécessaire
                 }
             }
        };

        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);
        console.log("Plot Content Generator réinitialisé.");
    }

     calculateInstanceMatrix(centerX, centerZ, modelHeight, scaleFactor, centerOffset) {
        const instanceMatrix = new THREE.Matrix4();
        const translation = new THREE.Matrix4().makeTranslation(
            centerX,
            modelHeight / 2 + 0.1, // Positionne la base du modèle (après scaling) sur le sol de la parcelle
            centerZ
        );
        const scale = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
        // Décalage pour aligner le centre géométrique du modèle *original* avec le centre de la sous-zone
        const recenter = new THREE.Matrix4().makeTranslation(
            -centerOffset.x,
            -centerOffset.y,
            -centerOffset.z
        );

        // Ordre: D'abord on met à l'échelle et on recentre le modèle, PUIS on le translate à sa position finale
        // instanceMatrix = translation * scale * recenter
        instanceMatrix.multiplyMatrices(scale, recenter); // scale * recenter
        instanceMatrix.premultiply(translation); // translation * (scale * recenter) -> Attention: threejs matrix multiplication order

        // Alternative plus lisible:
        // const matrix = new THREE.Matrix4();
        // const position = new THREE.Vector3(centerX, modelHeight / 2 + 0.1, centerZ);
        // const quaternion = new THREE.Quaternion(); // Pas de rotation ici
        // const scaleVec = new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor);
        // matrix.compose(position, quaternion, scaleVec);
        // // Appliquer le décalage pour le centre original après les transformations principales
        // const offsetMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x * scaleFactor, -centerOffset.y * scaleFactor, -centerOffset.z * scaleFactor);
        // matrix.multiply(offsetMatrix);
        // return matrix;

         return instanceMatrix; // Retourner la matrice calculée
    }


    createInstancedMeshes(houseMatrices, buildingMatrices, houseAsset, buildingAsset) {
        if (houseMatrices.length > 0 && houseAsset?.mergedGeometry && houseAsset?.mergedMaterial) {
            const mesh = new THREE.InstancedMesh(
                houseAsset.mergedGeometry,
                houseAsset.mergedMaterial,
                houseMatrices.length
            );
            houseMatrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.buildingGroup.add(mesh);
            console.log(`Ajout de ${houseMatrices.length} instances de maisons.`);
        }

         if (buildingMatrices.length > 0 && buildingAsset?.mergedGeometry && buildingAsset?.mergedMaterial) {
            const mesh = new THREE.InstancedMesh(
                buildingAsset.mergedGeometry,
                buildingAsset.mergedMaterial, // Peut être un tableau, InstancedMesh prend le premier
                buildingMatrices.length
            );
             // InstancedMesh n'utilise qu'un matériau, assurez-vous que c'est celui voulu
             if (Array.isArray(mesh.material)) {
                 mesh.material = mesh.material[0];
             }
            buildingMatrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.buildingGroup.add(mesh);
             console.log(`Ajout de ${buildingMatrices.length} instances d'immeubles.`);
        }
    }

    // --- Copiez/Collez subdivideForBuildings ici ---
    // Renommez en subdivideForPlacement ou similaire
    // Utilisez this.config
     subdivideForPlacement(plot) {
         // Utiliser des noms plus génériques si on place autre chose que des bâtiments
         const minSubZoneSize = plot.zoneType === "house"
            ? this.config.minHouseSubZoneSize
            : this.config.minBuildingSubZoneSize; // Adapter si plus de types

         // Si la parcelle est plus petite que la taille minimale de sous-zone,
         // crée une seule sous-zone de la taille de la parcelle.
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


        // Cas nominal: diviser dans les deux directions
        let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
        let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));

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

    // --- Extrayez la logique de création des trottoirs ici ---
    createSidewalksForPlot(plot) {
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width;
        const plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2;
        const plotCenterZ = plot.z + plotDepth / 2;

        // Crée un groupe pour les trottoirs de cette parcelle pour les positionner facilement
        const singlePlotSidewalkGroup = new THREE.Group();
        singlePlotSidewalkGroup.position.set(plotCenterX, 0, plotCenterZ);

        // Géométries (pourraient être créées une seule fois et réutilisées)
        const geomH = new THREE.BoxGeometry(plotWidth, sidewalkH, sidewalkW);
        const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, plotDepth);
        const geomCorner = new THREE.BoxGeometry(sidewalkW, sidewalkH, sidewalkW);

        // Création des 4 côtés et 4 coins relatifs au centre du groupe (centre de la parcelle)
        const createMesh = (geometry, x, z) => {
            const mesh = new THREE.Mesh(geometry, this.materials.sidewalkMaterial);
            mesh.position.set(x, sidewalkH / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        // Top (-z direction relative au centre)
        singlePlotSidewalkGroup.add(createMesh(geomH, 0, -plotDepth / 2 - sidewalkW / 2));
        // Bottom (+z direction relative au centre)
        singlePlotSidewalkGroup.add(createMesh(geomH, 0, plotDepth / 2 + sidewalkW / 2));
        // Left (-x direction relative au centre)
        singlePlotSidewalkGroup.add(createMesh(geomV, -plotWidth / 2 - sidewalkW / 2, 0));
        // Right (+x direction relative au centre)
        singlePlotSidewalkGroup.add(createMesh(geomV, plotWidth / 2 + sidewalkW / 2, 0));

        // Corners
        singlePlotSidewalkGroup.add(createMesh(geomCorner, -plotWidth / 2 - sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2)); // TL
        singlePlotSidewalkGroup.add(createMesh(geomCorner, plotWidth / 2 + sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2));  // TR
        singlePlotSidewalkGroup.add(createMesh(geomCorner, -plotWidth / 2 - sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));  // BL
        singlePlotSidewalkGroup.add(createMesh(geomCorner, plotWidth / 2 + sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));   // BR

        this.sidewalkGroup.add(singlePlotSidewalkGroup);
    }

    // --- Extrayez la logique de création des parcs ici ---
    createParkGeometry(plot) {
        const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        const parkMesh = new THREE.Mesh(parkGeom, this.materials.parkMaterial);
        parkMesh.position.set(plot.center.x, 0.05, plot.center.z); // Légèrement surélevé
        parkMesh.rotation.x = -Math.PI / 2;
        parkMesh.receiveShadow = true;
        this.buildingGroup.add(parkMesh); // Ajouté au groupe des bâtiments/contenus
    }

     // --- Extrayez la logique de création du sol de parcelle ici ---
     createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        const groundMesh = new THREE.Mesh(groundGeom, this.materials.buildingGroundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(plot.center.x, 0.05, plot.center.z); // Légèrement surélevé
        groundMesh.receiveShadow = true;
        this.buildingGroup.add(groundMesh);
     }
}