// src/World/PlotContentGenerator.js
import * as THREE from 'three';

export default class PlotContentGenerator {
    constructor(config, materials) {
        this.config = config; // Contient maintenant les probabilités et sidewalkWidth
        this.materials = materials;
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra bâtiments ET arbres
        this.assetLoader = null;
        // Structure pour stocker les matrices d'instances (par ID de modèle)
        this.instanceData = {}; // Initialisé dans reset()

        console.log("PlotContentGenerator initialisé (avec support arbres).");
    }

    generateContent(leafPlots, assetLoader) {
        this.reset(assetLoader); // Passe l'assetLoader au reset
        console.log("Génération du contenu des parcelles (incluant arbres)...");

        if (!leafPlots || leafPlots.length === 0 || !this.assetLoader) {
            console.warn("PlotContentGenerator: Données insuffisantes (parcelles ou assetLoader).");
            return this.getGroups();
        }

        leafPlots.forEach((plot) => {
            // 1. Générer le contenu principal (bâtiments, sols, trottoirs)
            this.generatePlotPrimaryContent(plot);

            // 2. Placer les arbres pour cette parcelle (trottoirs et intérieur)
            this.placeTreesForPlot(plot);
        });

        // 3. Créer les InstancedMesh pour TOUS les types (bâtiments, parcs, arbres...)
        this.createInstancedMeshesFromData();

        console.log("Génération du contenu (avec arbres) terminée.");
        return this.getGroups();
    }

    // Nouvelle méthode pour regrouper la génération du contenu principal
    generatePlotPrimaryContent(plot) {
         // A. Créer trottoirs (si activé)
         // Note: On pourrait déplacer la logique de création des mesh ici pour plus de clarté
         if (this.config.sidewalkWidth > 0) {
             this.createSidewalksForPlot(plot); // Crée les meshs des trottoirs
         }

         // B. Gérer le contenu de la parcelle (sol, bâtiments/parcs)
         if (plot.zoneType && ['house', 'building', 'industrial', 'park'].includes(plot.zoneType)) {
             // Créer le sol de la parcelle
             this.createPlotGround(plot);

             // Subdiviser pour placement multiple (si nécessaire)
             const subZones = this.subdivideForPlacement(plot);
             const margin = this.config.buildingSubZoneMargin; // Marge utilisée aussi pour les arbres

             subZones.forEach((subZone) => {
                 // Calculer zone constructible dans la sous-zone
                 const buildableWidth = Math.max(0, subZone.width - margin * 2);
                 const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                 if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                     const subZoneCenterX = subZone.x + subZone.width / 2;
                     const subZoneCenterZ = subZone.z + subZone.depth / 2;

                     // Choisir un modèle du bon type (house, building, industrial, park)
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
                         const type = plot.zoneType;

                         // Stocker la matrice pour l'InstancedMesh plus tard
                         if (!this.instanceData[type]) this.instanceData[type] = {};
                         if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
                         this.instanceData[type][modelId].push(instanceMatrix);

                         // *** Stocker l'emprise de ce bâtiment pour éviter les arbres (simplifié) ***
                         // On stocke juste le centre et les dimensions de la *sous-zone* utilisée
                         // Une approche plus précise stockerait la BBox exacte après transformation
                         if (!plot.occupiedSubZones) plot.occupiedSubZones = [];
                         plot.occupiedSubZones.push({
                             x: subZone.x + margin, // Centre de la zone *construite*
                             z: subZone.z + margin,
                             width: buildableWidth,
                             depth: buildableDepth
                         });
                     }
                 }
             }); // Fin boucle subZones
         }
    }

    // Nouvelle méthode pour placer les arbres
    placeTreesForPlot(plot) {
        if (!this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) {
            return; // Pas de modèles d'arbres chargés
        }

        const probSidewalk = this.config.treePlacementProbabilitySidewalk;
        const probPark = this.config.treePlacementProbabilityPark;
        const probMargin = this.config.treePlacementProbabilityMargin;
        const sidewalkW = this.config.sidewalkWidth;

        // --- 1. Arbres sur les trottoirs ---
        if (sidewalkW > 0 && probSidewalk > 0) {
            // Placer aux coins et potentiellement le long des bords
            const corners = [
                { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 }, // Coin HG
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 }, // Coin HD
                { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }, // Coin BG
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }, // Coin BD
            ];
            corners.forEach(corner => {
                if (Math.random() < probSidewalk) {
                    this.addTreeInstance(corner.x, corner.z);
                }
            });
            // On pourrait ajouter d'autres points le long des bords ici si souhaité
        }

        // --- 2. Arbres dans les parcelles ---
        const plotBounds = {
            minX: plot.x, maxX: plot.x + plot.width,
            minZ: plot.z, maxZ: plot.z + plot.depth,
        };

        if (plot.zoneType === 'park' && probPark > 0) {
            // Placer aléatoirement dans les parcs
            const area = plot.width * plot.depth;
            const numTreesToTry = Math.ceil(area * probPark); // Nb d'arbres basé sur densité/surface

            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                 // Optionnel: vérifier si ça tombe sur un élément de parc déjà placé si on stockait leur BBox
                this.addTreeInstance(treeX, treeZ);
            }
        } else if (['house', 'building', 'industrial'].includes(plot.zoneType) && probMargin > 0) {
            // Placer dans les marges des autres parcelles
            const margin = this.config.buildingSubZoneMargin;
            const area = plot.width * plot.depth;
            const occupiedArea = (plot.occupiedSubZones || []).reduce((acc, sz) => acc + (sz.width * sz.depth), 0);
            const marginArea = area - occupiedArea;
            const numTreesToTry = Math.ceil(marginArea * probMargin); // Nb arbres basé sur surface de marge

             for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);

                // Vérifier si le point tombe DANS une zone occupée
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

                // Si le point n'est PAS dans une zone occupée, ajouter l'arbre
                if (!isOccupied) {
                    this.addTreeInstance(treeX, treeZ);
                }
            }
        }
    }

    // Helper pour ajouter une instance d'arbre
    addTreeInstance(treeX, treeZ) {
        const assetInfo = this.assetLoader.getRandomAssetData('tree');
        if (assetInfo) {
             // Ajoute une petite variation de scale pour le naturel
             const randomScaleMultiplier = THREE.MathUtils.randFloat(0.85, 1.15);
             const finalUserScale = assetInfo.userScale * randomScaleMultiplier;

             // Ajoute une petite rotation aléatoire pour le naturel
             const randomRotationY = Math.random() * Math.PI * 2;

            const instanceMatrix = this.calculateInstanceMatrix(
                treeX, treeZ,
                assetInfo.sizeAfterFitting.y,
                assetInfo.fittingScaleFactor,
                assetInfo.centerOffset,
                finalUserScale, // Utilise le scale avec variation
                randomRotationY // Passe la rotation
            );

            const modelId = assetInfo.id;
            const type = 'tree'; // Spécifique pour les arbres

            if (!this.instanceData[type]) this.instanceData[type] = {};
            if (!this.instanceData[type][modelId]) this.instanceData[type][modelId] = [];
            this.instanceData[type][modelId].push(instanceMatrix);
        }
    }


    getGroups() {
         return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
     }

    reset(assetLoader) { // Accepte assetLoader
        this.assetLoader = assetLoader; // Met à jour l'assetLoader
        // Réinitialise la structure pour stocker les matrices d'instances
        this.instanceData = {
             house: {},
             building: {},
             industrial: {},
             park: {},
             tree: {} // N'oubliez pas de réinitialiser les arbres
        };

        // Nettoie les groupes Three.js
        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const obj = group.children[0];
                 group.remove(obj);
                 if (obj instanceof THREE.InstancedMesh) {
                      if (obj.geometry) obj.geometry.dispose();
                      // Matériaux clonés gérés par GC
                 } else if (obj instanceof THREE.Mesh) {
                      if (obj.geometry) obj.geometry.dispose();
                 } else if (obj instanceof THREE.Group) {
                      disposeGroupContents(obj); // Récursif pour les sous-groupes
                 }
             }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup); // Nettoie bâtiments ET arbres
        // console.log("Plot Content Generator réinitialisé.");
    }

    // MODIFIÉ: Ajout rotationY optionnelle
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0) {
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY); // Matrice de rotation
        const recenterMatrix = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        const finalHeight = heightAfterFitting * userScale; // Hauteur après TOUS les scales
        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalHeight / 2 + 0.05, centerZ); // Un peu moins haut que les bâtiments

        // Combinaison: Scale -> Rotate -> Recenter -> Translate
        instanceMatrix.multiplyMatrices(scaleMatrix, rotationMatrix); // Scale * Rotation
        instanceMatrix.multiply(recenterMatrix);                   // (Scale * Rotation) * Recenter
        instanceMatrix.premultiply(finalTranslationMatrix);         // Translation * ((Scale * Rotation) * Recenter)

        return instanceMatrix;
    }

    // MODIFIÉ: Itère sur TOUS les types dans instanceData, y compris 'tree'
    createInstancedMeshesFromData() {
        console.log("Création des InstancedMesh par modèle (incluant arbres)...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        if (!this.assetLoader) {
            console.error("Impossible de créer InstancedMesh: AssetLoader non disponible.");
            return;
        }

        // Parcourir TOUS les types stockés ('house', 'building', 'industrial', 'park', 'tree')
        for (const type in this.instanceData) {
            if (!this.instanceData.hasOwnProperty(type)) continue; // Sécurité

            for (const modelId in this.instanceData[type]) {
                if (!this.instanceData[type].hasOwnProperty(modelId)) continue;

                const matrices = this.instanceData[type][modelId];

                if (matrices && matrices.length > 0) {
                    const assetData = this.assetLoader.getAssetDataById(modelId);

                    if (assetData && assetData.geometry && assetData.material) {
                        // Créer l'InstancedMesh
                        const instancedMesh = new THREE.InstancedMesh(
                            assetData.geometry,
                            assetData.material, // Matériau cloné
                            matrices.length
                        );
                        matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));

                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = true; // Les arbres peuvent recevoir des ombres
                        instancedMesh.name = `${type}_${modelId}`; // Nom plus descriptif

                        // Ajouter au groupe principal (qui contient bâtiments, parcs, et maintenant arbres)
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++;
                        totalInstancesCreated += matrices.length;
                    } else {
                        console.warn(`Données d'asset ${modelId} (type ${type}) non trouvées ou invalides, ${matrices.length} instances ignorées.`);
                    }
                }
            }
        } // Fin boucle sur les types

        if (instancedMeshCount > 0) {
             console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) InstancedMesh créés pour ${totalInstancesCreated} instances au total (tous types).`);
        } else {
             console.log("Aucune instance à créer via InstancedMesh.");
        }
    }

    // Création des trottoirs - Peut rester globalement inchangée
    // Mais on n'y place plus les arbres directement
    createSidewalksForPlot(plot) {
       const sidewalkW = this.config.sidewalkWidth; if (sidewalkW <= 0) return;
       const sidewalkH = this.config.sidewalkHeight;
       const plotWidth = plot.width; const plotDepth = plot.depth;
       const plotCenterX = plot.x + plotWidth / 2; const plotCenterZ = plot.z + plotDepth / 2;

       // Utiliser un groupe spécifique pour les trottoirs de cette parcelle facilite le nettoyage si nécessaire
       const singlePlotSidewalkGroup = new THREE.Group();
       singlePlotSidewalkGroup.position.set(plotCenterX, 0, plotCenterZ); // Positionne le groupe au centre de la parcelle
       singlePlotSidewalkGroup.name = `Sidewalk_Plot_${plot.id}`;

       const sidewalkGeom = new THREE.BoxGeometry(1, sidewalkH, 1);
       const sidewalkMat = this.materials.sidewalkMaterial;

       const createMesh = (width, depth, x, z) => {
           const mesh = new THREE.Mesh(sidewalkGeom, sidewalkMat);
           mesh.scale.set(width, 1, depth);
           // Positions relatives au centre du groupe (centre de la parcelle)
           mesh.position.set(x, sidewalkH / 2, z);
           mesh.castShadow = true;
           mesh.receiveShadow = true;
           return mesh;
       };

       // Coordonnées relatives au centre (plotCenterX, plotCenterZ)
       const halfPlotW = plotWidth / 2;
       const halfPlotD = plotDepth / 2;
       const halfSidewalkW = sidewalkW / 2;

       // Bordures
       singlePlotSidewalkGroup.add(createMesh(plotWidth, sidewalkW, 0, -halfPlotD - halfSidewalkW)); // Haut
       singlePlotSidewalkGroup.add(createMesh(plotWidth, sidewalkW, 0, halfPlotD + halfSidewalkW));  // Bas
       singlePlotSidewalkGroup.add(createMesh(sidewalkW, plotDepth, -halfPlotW - halfSidewalkW, 0)); // Gauche
       singlePlotSidewalkGroup.add(createMesh(sidewalkW, plotDepth, halfPlotW + halfSidewalkW, 0));  // Droite
       // Coins
       singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, -halfPlotW - halfSidewalkW, -halfPlotD - halfSidewalkW)); // HG
       singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, halfPlotW + halfSidewalkW, -halfPlotD - halfSidewalkW));  // HD
       singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, -halfPlotW - halfSidewalkW, halfPlotD + halfSidewalkW));  // BG
       singlePlotSidewalkGroup.add(createMesh(sidewalkW, sidewalkW, halfPlotW + halfSidewalkW, halfPlotD + halfSidewalkW));   // BD

       // Ajoute le groupe de trottoirs de cette parcelle au groupe global des trottoirs
       this.sidewalkGroup.add(singlePlotSidewalkGroup);

       // Important: Ne disposez PAS la géométrie ici si vous prévoyez de réutiliser `sidewalkGeom`
       // Si elle est créée à chaque appel, il FAUT la disposer. Si elle est créée une fois dans le constructeur, non.
       // Pour être sûr, créons-la à chaque fois et disposons-la.
       sidewalkGeom.dispose();
   }

    // Création du sol de la parcelle - inchangé
    createPlotGround(plot) {
        // ... (code inchangé)
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
        this.buildingGroup.add(groundMesh); // Ajouter au groupe 'building'
    }

    // Subdivision pour placement - inchangé
    subdivideForPlacement(plot) {
        // ... (code inchangé)
         let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': minSubZoneSize = this.config.minHouseSubZoneSize; break;
            case 'building': minSubZoneSize = this.config.minBuildingSubZoneSize; break;
            case 'industrial': minSubZoneSize = this.config.minIndustrialSubZoneSize; break;
            case 'park': minSubZoneSize = this.config.minParkSubZoneSize; break;
            default: minSubZoneSize = 10;
        }
        minSubZoneSize = Math.max(minSubZoneSize, 1);

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