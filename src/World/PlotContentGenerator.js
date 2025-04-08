import * as THREE from 'three';

export default class PlotContentGenerator {
    constructor(config, materials) {
        this.config = config; // sidewalkWidth, subZoneMargin, etc.
        this.materials = materials; // sidewalkMaterial, parkMaterial, etc.
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra InstancedMesh, parcs, sols
        this.assetLoader = null; // Sera défini par generateContent
        console.log("PlotContentGenerator initialisé.");
    }

    /**
     * Génère le contenu (trottoirs, parcs, bâtiments) pour les parcelles fournies.
     * @param {Array<Plot>} leafPlots - La liste des parcelles finales.
     * @param {CityAssetLoader} assetLoader - L'instance du loader pour récupérer les données des modèles.
     * @returns {object} Contenant les groupes Three.js { sidewalkGroup, buildingGroup }.
     */
    generateContent(leafPlots, assetLoader) {
        this.reset(); // Nettoyer les groupes existants
        this.assetLoader = assetLoader; // Conserver la référence au loader
        console.log("Génération du contenu des parcelles (FBX aléatoires via InstancedMesh)...");

        if (!leafPlots || leafPlots.length === 0) {
            console.warn("Aucune parcelle fournie pour générer le contenu.");
            return this.getGroups();
        }
        if (!this.assetLoader) {
            console.error("PlotContentGenerator: AssetLoader non fourni ! Impossible de placer les bâtiments.");
            // On pourrait continuer sans bâtiments, mais c'est probablement une erreur.
             return this.getGroups(); // Retourner les groupes vides ou juste avec trottoirs/parcs
        }

        // Structure pour collecter les matrices de transformation, groupées par ID de modèle unique
        const instanceData = {
            house: {},    // Format: { 'house_0': [Matrix4, Matrix4, ...], 'house_1': [...] }
            building: {}  // Format: { 'building_0': [Matrix4, ...], ... }
        };

        // --- Itération sur les parcelles finales ---
        leafPlots.forEach((plot) => {
            // 1. Créer les trottoirs (si configuré)
            if (this.config.sidewalkWidth > 0) {
                this.createSidewalksForPlot(plot);
            }

            // 2. Gérer les parcs
            if (plot.isPark) {
                this.createParkGeometry(plot);
            }
            // 3. Gérer les zones constructibles (maisons ou immeubles)
            else if (plot.zoneType && ['house', 'building'].includes(plot.zoneType) && plot.width > 0.1 && plot.depth > 0.1) {
                // Créer le sol spécifique à cette parcelle constructible
                this.createPlotGround(plot);

                // Subdiviser la parcelle pour placer plusieurs instances si elle est grande
                const subZones = this.subdivideForPlacement(plot);
                const margin = this.config.buildingSubZoneMargin;

                subZones.forEach((subZone) => {
                    const buildableWidth = Math.max(0, subZone.width - margin * 2);
                    const buildableDepth = Math.max(0, subZone.depth - margin * 2);

                    // Si la sous-zone est assez grande après marges
                    if (buildableWidth > 0.1 && buildableDepth > 0.1) {
                        const subZoneCenterX = subZone.x + subZone.width / 2;
                        const subZoneCenterZ = subZone.z + subZone.depth / 2;

                        // --- Étape clé : Choisir un modèle aléatoire ---
                        const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);

                        if (assetInfo) {
                            // Calculer la matrice de transformation pour cette instance
                            // basée sur les données du modèle spécifique choisi (assetInfo)
                            const instanceMatrix = this.calculateInstanceMatrix(
                                subZoneCenterX,
                                subZoneCenterZ,
                                assetInfo.sizeAfterScaling.y, // Hauteur après scaling
                                assetInfo.scaleFactor,       // Facteur d'échelle du modèle
                                assetInfo.centerOffset       // Offset du centre original du modèle
                            );

                            // Stocker la matrice, groupée par l'ID unique du modèle
                            const modelId = assetInfo.id; // ex: 'house_0', 'building_1'
                            const type = plot.zoneType;   // 'house' ou 'building'

                            // Initialiser le tableau pour ce modelId si nécessaire
                            if (!instanceData[type][modelId]) {
                                instanceData[type][modelId] = [];
                            }
                            // Ajouter la matrice à la liste pour ce modèle spécifique
                            instanceData[type][modelId].push(instanceMatrix);

                        } else {
                           // Optionnel: Log si aucun modèle n'est dispo pour ce type
                           // console.warn(`Aucun modèle disponible pour le type ${plot.zoneType} lors du placement.`);
                        }
                    }
                }); // Fin boucle subZones
            } // Fin else if (zone constructible)
        }); // Fin boucle leafPlots

        // --- Étape finale : Créer les InstancedMesh à partir des données collectées ---
        this.createInstancedMeshesFromData(instanceData);

        console.log("Génération du contenu (FBX) terminée.");
        return this.getGroups(); // Retourner les groupes remplis
    }

    /**
     * Retourne les groupes contenant les éléments générés.
     * @returns {object} { sidewalkGroup, buildingGroup }
     */
     getGroups() {
         return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
     }

    /**
     * Réinitialise l'état et vide les groupes.
     */
    reset() {
        this.assetLoader = null; // Retirer la référence au loader
        // Fonction utilitaire pour vider un groupe et disposer son contenu
        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const obj = group.children[0];
                 group.remove(obj);
                 if (obj instanceof THREE.InstancedMesh) {
                     // Disposer la géométrie (partagée par l'InstancedMesh)
                     // Le matériau vient de l'asset loader, on ne le dispose pas ici
                      if (obj.geometry) obj.geometry.dispose();
                 } else if (obj instanceof THREE.Mesh) {
                     // Pour parcs, sols, trottoirs - disposer géométrie mais pas matériau partagé
                     if (obj.geometry) obj.geometry.dispose();
                 } else if (obj instanceof THREE.Group) {
                     // Vider récursivement si on a des groupes dans les groupes (ex: trottoirs par parcelle)
                     disposeGroupContents(obj);
                 }
             }
        };

        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup);
        // console.log("Plot Content Generator réinitialisé.");
    }

    /**
     * Calcule la matrice de transformation pour une instance de modèle.
     * @param {number} centerX - Position X du centre de l'emplacement.
     * @param {number} centerZ - Position Z du centre de l'emplacement.
     * @param {number} modelHeight - Hauteur du modèle APRÈS scaling (utilisé pour positionner en Y).
     * @param {number} scaleFactor - Facteur d'échelle uniforme à appliquer au modèle.
     * @param {THREE.Vector3} centerOffset - Offset du centre géométrique du modèle original (avant scaling).
     * @returns {THREE.Matrix4} La matrice de transformation pour l'instance.
     */
    calculateInstanceMatrix(centerX, centerZ, modelHeight, scaleFactor, centerOffset) {
        const instanceMatrix = new THREE.Matrix4();

        // 1. Créer la matrice de scaling uniforme
        const scale = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);

        // 2. Créer la matrice de translation pour re-centrer le modèle (annuler son offset original)
        const recenter = new THREE.Matrix4().makeTranslation(
            -centerOffset.x,
            -centerOffset.y,
            -centerOffset.z
        );

        // 3. Créer la matrice de translation pour placer le modèle à sa position finale
        //    La position Y place la base du modèle (après scaling et recentrage) au niveau du sol (0.1)
        const finalTranslation = new THREE.Matrix4().makeTranslation(
            centerX,
            modelHeight / 2 + 0.1, // +0.1 pour être juste au-dessus du sol de parcelle (qui est à 0.05)
            centerZ
        );

        // 4. Combiner les matrices: Transformation = TranslationFinale * Scaling * Recentrage
        //    L'ordre est important: d'abord recentrer, puis mettre à l'échelle, puis translater.
        instanceMatrix.multiplyMatrices(scale, recenter);       // result = scale * recenter
        instanceMatrix.premultiply(finalTranslation);         // result = finalTranslation * result

        return instanceMatrix;
    }

    /**
     * Crée les objets InstancedMesh à partir des matrices collectées, groupées par modèle.
     * @param {object} instanceData - Structure contenant les matrices groupées par type et modelId.
     */
    createInstancedMeshesFromData(instanceData) {
        console.log("Création des InstancedMesh par modèle FBX...");
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        if (!this.assetLoader) {
            console.error("Impossible de créer InstancedMesh: AssetLoader non disponible.");
            return;
        }

        // Parcourir les types ('house', 'building')
        for (const type in instanceData) {
            // Parcourir les ID de modèles spécifiques pour ce type
            for (const modelId in instanceData[type]) {
                const matrices = instanceData[type][modelId]; // Tableau de matrices pour ce modèle

                if (matrices && matrices.length > 0) {
                    // Récupérer les données (géométrie, matériau) associées à ce modelId
                    const assetData = this.assetLoader.getAssetDataById(modelId);

                    if (assetData && assetData.geometry && assetData.material) {
                        // Créer UN InstancedMesh pour TOUTES les instances de CE modèle
                        const instancedMesh = new THREE.InstancedMesh(
                            assetData.geometry, // Géométrie partagée
                            assetData.material, // Matériau partagé
                            matrices.length     // Nombre d'instances
                        );

                        // Appliquer chaque matrice stockée à une instance
                        matrices.forEach((matrix, index) => {
                            instancedMesh.setMatrixAt(index, matrix);
                        });

                        // Activer les ombres pour ce groupe d'instances
                        instancedMesh.castShadow = true;
                        instancedMesh.receiveShadow = true;
                        instancedMesh.name = modelId; // Nom utile pour le débogage

                        // Ajouter cet InstancedMesh au groupe principal des bâtiments/contenus
                        this.buildingGroup.add(instancedMesh);
                        instancedMeshCount++;
                        totalInstancesCreated += matrices.length;
                        // console.log(`  - Créé InstancedMesh pour ${modelId} (${matrices.length} instances).`);

                    } else {
                        console.warn(`Données d'asset introuvables pour ${modelId}. ${matrices.length} instances ne seront pas créées.`);
                    }
                }
            } // Fin boucle modelId
        } // Fin boucle type

        if (instancedMeshCount > 0) {
             console.log(`Création InstancedMesh terminée: ${instancedMeshCount} InstancedMesh créés pour un total de ${totalInstancesCreated} instances.`);
        } else {
             console.log("Aucune instance de bâtiment/maison à créer via InstancedMesh.");
        }
    }

    // --- Méthodes utilitaires copiées/collées (ou importées si mises dans des fichiers séparés) ---

    /** Crée les trottoirs autour d'une parcelle donnée */
    createSidewalksForPlot(plot) {
        const sidewalkW = this.config.sidewalkWidth;
        if (sidewalkW <= 0) return; // Ne rien faire si pas de largeur

        const sidewalkH = this.config.sidewalkHeight;
        const plotWidth = plot.width;
        const plotDepth = plot.depth;
        const plotCenterX = plot.x + plotWidth / 2;
        const plotCenterZ = plot.z + plotDepth / 2;

        const singlePlotSidewalkGroup = new THREE.Group();
        singlePlotSidewalkGroup.position.set(plotCenterX, 0, plotCenterZ);
        singlePlotSidewalkGroup.name = `Sidewalk_Plot_${plot.id}`;

        // Utiliser une seule géométrie par type pour optimiser un peu
        const geomH = new THREE.BoxGeometry(plotWidth, sidewalkH, sidewalkW);
        const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, plotDepth);
        const geomCorner = new THREE.BoxGeometry(sidewalkW, sidewalkH, sidewalkW);
        const sidewalkMat = this.materials.sidewalkMaterial;

        const createMesh = (geometry, x, z) => {
            const mesh = new THREE.Mesh(geometry, sidewalkMat);
            mesh.position.set(x, sidewalkH / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        singlePlotSidewalkGroup.add(createMesh(geomH, 0, -plotDepth / 2 - sidewalkW / 2)); // Top
        singlePlotSidewalkGroup.add(createMesh(geomH, 0, plotDepth / 2 + sidewalkW / 2));  // Bottom
        singlePlotSidewalkGroup.add(createMesh(geomV, -plotWidth / 2 - sidewalkW / 2, 0)); // Left
        singlePlotSidewalkGroup.add(createMesh(geomV, plotWidth / 2 + sidewalkW / 2, 0));  // Right
        singlePlotSidewalkGroup.add(createMesh(geomCorner, -plotWidth / 2 - sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2)); // TL
        singlePlotSidewalkGroup.add(createMesh(geomCorner, plotWidth / 2 + sidewalkW / 2, -plotDepth / 2 - sidewalkW / 2));  // TR
        singlePlotSidewalkGroup.add(createMesh(geomCorner, -plotWidth / 2 - sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));  // BL
        singlePlotSidewalkGroup.add(createMesh(geomCorner, plotWidth / 2 + sidewalkW / 2, plotDepth / 2 + sidewalkW / 2));   // BR

        this.sidewalkGroup.add(singlePlotSidewalkGroup);

         // Disposer les géométries créées ici si elles ne sont pas réutilisées ailleurs
         // (Si on les crée à chaque appel, il FAUT les disposer)
         // Note: C'est mieux de les créer une fois et de les réutiliser.
         // geomH.dispose(); geomV.dispose(); geomCorner.dispose(); // A faire si créé à chaque fois
    }

    /** Crée la géométrie d'un parc pour une parcelle */
    createParkGeometry(plot) {
        const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        const parkMesh = new THREE.Mesh(parkGeom, this.materials.parkMaterial);
        parkMesh.position.set(plot.center.x, 0.05, plot.center.z); // Légèrement au-dessus du sol global
        parkMesh.rotation.x = -Math.PI / 2;
        parkMesh.receiveShadow = true;
        parkMesh.name = `Park_Plot_${plot.id}`;
        this.buildingGroup.add(parkMesh); // Ajouter au groupe des contenus
    }

    /** Crée le sol pour une parcelle constructible */
    createPlotGround(plot) {
        const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
        const groundMesh = new THREE.Mesh(groundGeom, this.materials.buildingGroundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(plot.center.x, 0.05, plot.center.z); // Au même niveau que les parcs
        groundMesh.receiveShadow = true;
        groundMesh.name = `Ground_Plot_${plot.id}`;
        this.buildingGroup.add(groundMesh); // Ajouter au groupe des contenus
    }

    /** Subdivise une parcelle en plus petites zones pour le placement */
    subdivideForPlacement(plot) {
        const minSubZoneSize = plot.zoneType === "house"
           ? this.config.minHouseSubZoneSize
           : this.config.minBuildingSubZoneSize;

        // Gérer les cas où la parcelle est déjà plus petite que la subdivision minimale
        if (plot.width < minSubZoneSize && plot.depth < minSubZoneSize) {
             return [{ x: plot.x, z: plot.z, width: plot.width, depth: plot.depth }];
        }
        if (plot.width < minSubZoneSize) { // Trop étroit, subdiviser seulement en profondeur
            let numRows = Math.max(1, Math.floor(plot.depth / minSubZoneSize));
            const subDepth = plot.depth / numRows;
            const subZones = [];
             for (let j = 0; j < numRows; j++) {
                 subZones.push({ x: plot.x, z: plot.z + j * subDepth, width: plot.width, depth: subDepth });
             }
             return subZones;
        }
         if (plot.depth < minSubZoneSize) { // Trop peu profond, subdiviser seulement en largeur
            let numCols = Math.max(1, Math.floor(plot.width / minSubZoneSize));
             const subWidth = plot.width / numCols;
             const subZones = [];
              for (let i = 0; i < numCols; i++) {
                   subZones.push({ x: plot.x + i * subWidth, z: plot.z, width: subWidth, depth: plot.depth });
              }
              return subZones;
         }

        // Cas standard: subdiviser dans les deux directions
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

}