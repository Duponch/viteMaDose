import * as THREE from 'three';

export default class PlotContentGenerator {
    constructor(config, materials) {
        // config contient { sidewalkWidth, ..., minHouse/Building/IndustrialSubZoneSize }
        this.config = config;
        this.materials = materials; // Contient sidewalkMaterial, parkMaterial, buildingGroundMaterial
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra InstancedMesh, parcs, sols des parcelles
        this.assetLoader = null; // Référence au loader d'assets
        console.log("PlotContentGenerator initialisé (avec support industrial).");
    }

    /**
     * Génère le contenu (trottoirs, parcs, bâtiments, usines) pour les parcelles fournies.
     * @param {Array<Plot>} leafPlots - La liste des parcelles finales utilisables.
     * @param {CityAssetLoader} assetLoader - L'instance du loader pour récupérer les données des modèles.
     * @returns {object} Contenant les groupes Three.js { sidewalkGroup, buildingGroup }.
     */
    generateContent(leafPlots, assetLoader) {
        this.reset(); // Nettoyer les groupes
        this.assetLoader = assetLoader; // Stocker la référence
        console.log("Génération du contenu des parcelles (incluant usines)...");

        if (!leafPlots || leafPlots.length === 0) {
            console.warn("PlotContentGenerator: Aucune parcelle fournie.");
            return this.getGroups();
        }
        if (!this.assetLoader) {
            console.error("PlotContentGenerator: AssetLoader non fourni !");
            return this.getGroups();
        }

        // Structure pour collecter les matrices par ID de modèle unique
        const instanceData = {
            house: {},
            building: {},
            industrial: {} // <- Inclure les usines
        };

        // --- Itération sur les parcelles finales ---
        leafPlots.forEach((plot) => {
            // 1. Créer trottoirs
            if (this.config.sidewalkWidth > 0) {
                this.createSidewalksForPlot(plot);
            }

            // 2. Créer parcs
            if (plot.isPark) {
                this.createParkGeometry(plot);
            }
            // 3. Gérer les zones constructibles (maisons, immeubles, usines)
            else if (plot.zoneType && ['house', 'building', 'industrial'].includes(plot.zoneType)) {

                // Créer le sol de la parcelle
                this.createPlotGround(plot);

                // Subdiviser pour placement multiple si nécessaire
                const subZones = this.subdivideForPlacement(plot);
                const margin = this.config.buildingSubZoneMargin; // Marge autour des bâtiments/usines

                subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(0, subZone.width - margin * 2);
                    const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;

                        // Choisir un modèle aléatoire du bon type (house, building, industrial)
                        const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);

                        if (assetInfo) {
                            // Calculer la matrice pour cette instance spécifique
                            const instanceMatrix = this.calculateInstanceMatrix(
                                subZoneCenterX, subZoneCenterZ,
                                assetInfo.sizeAfterScaling.y, assetInfo.scaleFactor, assetInfo.centerOffset
                            );

                            // Stocker la matrice, groupée par ID du modèle et type
                            const modelId = assetInfo.id;
                            const type = plot.zoneType;

                            // Assurer que les structures imbriquées existent
                            if (!instanceData[type]) instanceData[type] = {};
                            if (!instanceData[type][modelId]) instanceData[type][modelId] = [];

                            // Ajouter la matrice
                            instanceData[type][modelId].push(instanceMatrix);
                        }
                        // else { console.warn(`Aucun asset trouvé pour le type ${plot.zoneType}`); }
                    }
                }); // Fin boucle subZones
            } // Fin else if constructible
             // Ignorer les types 'unbuildable' ou autres non gérés
        }); // Fin boucle leafPlots

        // --- Créer les InstancedMesh à partir des matrices collectées ---
        this.createInstancedMeshesFromData(instanceData);

        console.log("Génération du contenu (avec usines) terminée.");
        return this.getGroups(); // Retourner les groupes remplis
    }

    /**
     * Retourne les groupes contenant les éléments générés.
     * @returns {{sidewalkGroup: THREE.Group, buildingGroup: THREE.Group}}
     */
     getGroups() {
         return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
     }

    /**
     * Réinitialise l'état et vide les groupes Three.js.
     */
    reset() {
        this.assetLoader = null;
        // Fonction utilitaire pour vider et disposer le contenu d'un groupe
        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const obj = group.children[0];
                 group.remove(obj);
                 // Gérer la disposition spécifique des types d'objets
                 if (obj instanceof THREE.InstancedMesh) {
                      if (obj.geometry) obj.geometry.dispose();
                      // Le matériau vient de l'asset loader (potentiellement partagé), ne pas disposer ici.
                 } else if (obj instanceof THREE.Mesh) {
                      if (obj.geometry) obj.geometry.dispose();
                      // Ne pas disposer les matériaux partagés (sidewalk, park, ground).
                 } else if (obj instanceof THREE.Group) {
                      disposeGroupContents(obj); // Nettoyage récursif
                 }
             }
        };

        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);
        // console.log("Plot Content Generator réinitialisé.");
    }

    /**
     * Calcule la matrice de transformation pour une instance de modèle.
     * (Identique à la version précédente)
     */
    calculateInstanceMatrix(centerX, centerZ, modelHeight, scaleFactor, centerOffset) {
        const instanceMatrix = new THREE.Matrix4();
        const scale = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
        const recenter = new THREE.Matrix4().makeTranslation(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        const finalTranslation = new THREE.Matrix4().makeTranslation(centerX, modelHeight / 2 + 0.1, centerZ);
        instanceMatrix.multiplyMatrices(scale, recenter);
        instanceMatrix.premultiply(finalTranslation);
        return instanceMatrix;
    }

    /**
     * Crée les objets InstancedMesh à partir des matrices collectées, groupées par modèle.
     * (Identique à la version précédente, fonctionne car itère sur tous les types dans instanceData)
     */
    createInstancedMeshesFromData(instanceData) {
        console.log("Création des InstancedMesh par modèle FBX...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        if (!this.assetLoader) {
            console.error("Impossible de créer InstancedMesh: AssetLoader non disponible.");
            return;
        }

        // Parcourir les types ('house', 'building', 'industrial')
        for (const type in instanceData) {
            // Parcourir les ID de modèles spécifiques pour ce type
            for (const modelId in instanceData[type]) {
                const matrices = instanceData[type][modelId]; // Tableau de matrices

                if (matrices && matrices.length > 0) {
                    // Récupérer les données (géométrie, matériau) associées à cet ID
                    const assetData = this.assetLoader.getAssetDataById(modelId);

                    if (assetData && assetData.geometry && assetData.material) {
                        // Créer UN InstancedMesh pour CE modèle spécifique
                        const instancedMesh = new THREE.InstancedMesh(
                            assetData.geometry, assetData.material, matrices.length
                        );
                        matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));

                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = true;
                        instancedMesh.name = modelId; // Nom utile

                        this.buildingGroup.add(instancedMesh); // Ajouter au groupe principal
                        instancedMeshCount++;
                        totalInstancesCreated += matrices.length;
                    } else {
                        console.warn(`Données d'asset ${modelId} non trouvées, ${matrices.length} instances ignorées.`);
                    }
                }
            } // Fin boucle modelId
        } // Fin boucle type

        if (instancedMeshCount > 0) {
             console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) créés pour ${totalInstancesCreated} instances.`);
        } else {
             console.log("Aucune instance à créer via InstancedMesh.");
        }
    }

    /** Crée les trottoirs autour d'une parcelle */
    createSidewalksForPlot(plot) {
        const sidewalkW = this.config.sidewalkWidth; if (sidewalkW <= 0) return;
        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width; const plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2; const plotCenterZ = plot.z + plotDepth / 2;

        const singlePlotSidewalkGroup = new THREE.Group();
        singlePlotSidewalkGroup.position.set(plotCenterX, 0, plotCenterZ);
        singlePlotSidewalkGroup.name = `Sidewalk_Plot_${plot.id}`;

        // Optimisation: Créer les géométries une seule fois si possible
        // Ici, on les recrée à chaque fois pour simplicité, mais ce n'est pas idéal pour les perfs.
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

        // IMPORTANT: Disposer les géométries créées localement si elles ne sont pas réutilisées
        geomH.dispose(); geomV.dispose(); geomCorner.dispose();
    }

    /** Crée la géométrie d'un parc pour une parcelle */
    createParkGeometry(plot) {
        const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        const parkMesh = new THREE.Mesh(parkGeom, this.materials.parkMaterial);
        parkMesh.position.set(plot.center.x, 0.05, plot.center.z);
        parkMesh.rotation.x = -Math.PI / 2;
        parkMesh.receiveShadow = true;
        parkMesh.name = `Park_Plot_${plot.id}`;
        this.buildingGroup.add(parkMesh);
    }

    /** Crée le sol pour une parcelle constructible */
    createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        const groundMesh = new THREE.Mesh(groundGeom, this.materials.buildingGroundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(plot.center.x, 0.05, plot.center.z);
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}`;
        this.buildingGroup.add(groundMesh);
    }

    /** Subdivise une parcelle en plus petites zones pour le placement */
    subdivideForPlacement(plot) {
        let minSubZoneSize;
        switch (plot.zoneType) {
            case 'house': minSubZoneSize = this.config.minHouseSubZoneSize; break;
            case 'building': minSubZoneSize = this.config.minBuildingSubZoneSize; break;
            case 'industrial': minSubZoneSize = this.config.minIndustrialSubZoneSize; break; // Utilise la config usine
            default: minSubZoneSize = 10; // Fallback
        }
        minSubZoneSize = Math.max(minSubZoneSize, 1);

        // Gestion des cas limites (parcelle déjà trop petite)
        if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) {
             return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }];
        }
         if (plot.width < minSubZoneSize) { // Subdiviser seulement en profondeur
            let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
            const subDepth = plot.depth / numRows; const subZones = [];
             for (let j = 0; j < numRows; j++) subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth });
             return subZones;
         }
          if (plot.depth < minSubZoneSize) { // Subdiviser seulement en largeur
            let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
             const subWidth = plot.width / numCols; const subZones = [];
              for (let i = 0; i < numCols; i++) subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth });
              return subZones;
          }

        // Cas standard
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