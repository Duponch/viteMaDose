// src/World/PlotContentGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class PlotContentGenerator {
    // --- MODIFIÉ : Ajout cityManager ref ---
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.sidewalkGroup = new THREE.Group();
        this.buildingGroup = new THREE.Group(); // Contiendra bâtiments, maisons, industriels, parcs, gratte-ciels ET arbres ET passages piétons
        this.assetLoader = null;
        // Structure pour stocker les matrices d'instances, indexées par type puis modelId
        this.instanceData = {}; // Sera initialisé dans reset()
        this.stripeBaseGeometry = null; // Pour les bandes de passage piéton
        // --- NOUVEAU ---
        this.cityManager = null; // Référence au CityManager pour enregistrer les bâtiments
        // -------------
        console.log("PlotContentGenerator initialisé (avec support enregistrement bâtiments).");
    }
    // --- FIN MODIFIÉ ---

    // --- MODIFIÉ : Accepte et stocke cityManager ---
    generateContent(leafPlots, assetLoader, crosswalkInfos = [], cityManager) {
        this.reset(assetLoader); // Réinitialise y compris cityManager=null
        // --- NOUVEAU ---
        if (!cityManager) {
             console.error("PlotContentGenerator.generateContent : CityManager est requis !");
             // Retourner des groupes vides ou lancer une erreur ?
             return { sidewalkGroup: this.sidewalkGroup, buildingGroup: this.buildingGroup };
        }
        this.cityManager = cityManager; // Stocker la référence pour l'utiliser dans les autres méthodes
        // -------------
        console.log("Génération du contenu (avec enregistrement bâtiments)...");

        const allSidewalkGeometries = [];

        // --- Géométrie Base Passage Piéton ---
        // Recréée ici car reset() la dispose
        this.stripeBaseGeometry = new THREE.BoxGeometry(
            this.config.crosswalkStripeWidth,
            this.config.crosswalkHeight,
            0.5 // Longueur Z locale, sera scalée par la matrice d'instance
        );

        // --- Génération Contenu Parcelles ---
        leafPlots.forEach((plot) => {
            // Appel generatePlotPrimaryContent (qui utilise maintenant this.cityManager)
            this.generatePlotPrimaryContent(plot);

            // Collecte Trottoirs (inchangé)
            if (this.config.sidewalkWidth > 0) {
                const g = this.collectSidewalkGeometriesForPlot(plot); // Fonction interne
                allSidewalkGeometries.push(...g);
            }

            // Placement Arbres (inchangé en termes d'enregistrement, utilise juste assetLoader)
            this.placeTreesForPlot(plot); // Fonction interne
        });

        // --- Traitement pour générer les bandes passages piétons ---
        if (crosswalkInfos && crosswalkInfos.length > 0) {
            console.log(`Préparation des matrices pour ${crosswalkInfos.length} passages piétons (en bandes)...`);

            if (!this.instanceData.crosswalk) this.instanceData.crosswalk = {};
            const crosswalkAssetId = 'default_crosswalk_stripe'; // ID arbitraire pour les bandes
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
            // Offset pour centrer le groupe de bandes autour de la position donnée
            const initialOffset = -totalWidth / 2 + stripeWidth / 2;

            crosswalkInfos.forEach(info => {
                basePosition.copy(info.position); // Position centrale du passage

                // Angle final pour orienter les BANDES perpendiculairement à la route
                const finalAngle = info.angle + Math.PI / 2;
                quaternion.setFromAxisAngle(yAxis, finalAngle);

                // Direction du décalage des bandes (perpendiculaire à l'orientation finale des bandes)
                if (Math.abs(finalAngle % Math.PI) < 0.01) { // Bandes verticales (angle 0 ou PI)
                     offsetDirection.set(1, 0, 0); // Décaler sur X
                } else { // Bandes horizontales (angle PI/2 ou -PI/2)
                    offsetDirection.set(0, 0, 1); // Décaler sur Z
                }

                // Mettre à l'échelle la longueur (Z local de BoxGeometry) pour correspondre à info.length
                // info.length est la largeur de la route souhaitée pour le passage piéton
                scale.set(1, 1, info.length); // Scale Z local

                // Créer les matrices pour chaque bande
                for (let i = 0; i < stripeCount; i++) {
                    const currentOffset = initialOffset + i * stripeTotalWidth;
                    // Cloner basePosition avant de la modifier
                    stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset);
                    // Hauteur des bandes
                    stripePosition.y = this.config.crosswalkHeight / 2 + 0.005; // Légèrement au-dessus du sol

                    // Composer la matrice pour cette bande spécifique
                    matrix.compose(stripePosition, quaternion, scale);
                    // Stocker une copie de la matrice
                    this.instanceData.crosswalk[crosswalkAssetId].push(matrix.clone());
                }
            });
             console.log(`Matrices pour ${this.instanceData.crosswalk[crosswalkAssetId].length} bandes de passage piéton générées.`);
        }
        // --- Fin traitement bandes ---

        // Création des InstancedMesh à partir des données collectées (y compris crosswalk)
        this.createInstancedMeshesFromData();

        // Fusion trottoirs (inchangé)
        if (allSidewalkGeometries.length > 0) {
            const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false);
            if (mergedSidewalkGeometry) {
                const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial);
                sidewalkMesh.castShadow = false;
                sidewalkMesh.receiveShadow = true;
                sidewalkMesh.name = "Merged_Sidewalks";
                this.sidewalkGroup.add(sidewalkMesh);
            } else { console.warn("Fusion trottoirs échouée."); }
            allSidewalkGeometries.forEach(geom => geom.dispose()); // Nettoyer les géométries individuelles
        }

        console.log("Génération du contenu terminée.");
        return this.getGroups(); // Retourne les groupes contenant les meshes
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
		// --- NOUVEAU : Vérification CityManager ---
		if (!this.cityManager) {
		   console.error("PlotContentGenerator.generatePlotPrimaryContent: CityManager non disponible.");
		   return; // Ne rien faire si le manager n'est pas là
		}
		// ----------------------------------------

		// Vérifier si c'est un type de zone qui contient des bâtiments/assets
	   if (plot.zoneType && ['house', 'building', 'industrial', 'park', 'skyscraper'].includes(plot.zoneType)) {

		   // Créer le sol de la parcelle (optionnel, si non géré globalement)
		   this.createPlotGround(plot); // Fonction interne

		   // Subdiviser la parcelle pour placer plusieurs éléments si nécessaire
		   const subZones = this.subdivideForPlacement(plot); // Fonction interne
		   const margin = plot.zoneType !== 'park' ? this.config.buildingSubZoneMargin : 0; // Marge sauf pour les parcs

		   subZones.forEach((subZone, index) => { // Utiliser l'index si nécessaire pour ID unique
			   const buildableWidth = Math.max(0, subZone.width - margin * 2);
			   const buildableDepth = Math.max(0, subZone.depth - margin * 2);

			   // Ne placer que si la zone constructible est suffisante
			   if (buildableWidth > 0.1 && buildableDepth > 0.1) {
				   const subZoneCenterX = subZone.x + subZone.width / 2;
				   const subZoneCenterZ = subZone.z + subZone.depth / 2;

				   // Obtenir un asset aléatoire du bon type depuis l'AssetLoader
				   const assetInfo = this.assetLoader.getRandomAssetData(plot.zoneType);

				   if (assetInfo) {
					   // Calculer la matrice d'instance pour cet asset dans cette sous-zone
					   const instanceMatrix = this.calculateInstanceMatrix(
						   subZoneCenterX, subZoneCenterZ,
						   assetInfo.sizeAfterFitting.y, // Hauteur après mise à l'échelle de base
						   assetInfo.fittingScaleFactor, // Facteur d'échelle de base
						   assetInfo.centerOffset,       // Décalage du centre de l'asset
						   assetInfo.userScale           // Échelle supplémentaire de l'utilisateur
						   // rotationY = 0 par défaut ici, pourrait être randomisé
					   );

					   const modelId = assetInfo.id; // ID de l'asset chargé (pas de l'instance)

					   // --- Ajouter aux données pour InstancedMesh (comme avant) ---
					   if (!this.instanceData[plot.zoneType]) this.instanceData[plot.zoneType] = {};
					   if (!this.instanceData[plot.zoneType][modelId]) this.instanceData[plot.zoneType][modelId] = [];
					   this.instanceData[plot.zoneType][modelId].push(instanceMatrix.clone()); // Stocker une copie

					   // --- NOUVEAU: Enregistrer l'instance du bâtiment via CityManager ---
					   // Utiliser le centre de la sous-zone comme position de référence
					   const buildingPosition = new THREE.Vector3(subZoneCenterX, this.config.sidewalkHeight, subZoneCenterZ);
					   // Utiliser assetInfo.type si disponible, sinon plot.zoneType
					   const buildingType = assetInfo.type || plot.zoneType;
					   const registeredBuilding = this.cityManager.registerBuildingInstance(
						   plot.id,
						   buildingType,
						   buildingPosition
						   // La capacité est gérée dans registerBuildingInstance basée sur le type
					   );

					   // Optionnel : Lier l'ID de l'instance de bâtiment à la parcelle
					   if (registeredBuilding) {
						   plot.addBuildingInstance({ // Utilise la méthode de Plot.js
							   id: registeredBuilding.id, // ID unique de l'instance
							   type: registeredBuilding.type,
							   position: buildingPosition.clone(),
							   // Ajouter d'autres infos si nécessaire (ex: modelId de l'asset)
						   });
					   }
					   // ----------------------------------------------------------------

					   // Stocker l'emprise pour éviter de placer des arbres dessus (comme avant)
					   if (!plot.occupiedSubZones) plot.occupiedSubZones = [];
					   plot.occupiedSubZones.push({
						   x: subZone.x + margin,
						   z: subZone.z + margin,
						   width: buildableWidth,
						   depth: buildableDepth
					   });
				   } else {
					   // console.warn(`Aucun asset trouvé pour le type ${plot.zoneType} dans la sous-zone.`);
				   }
			   }
		   }); // Fin boucle sur subZones
	   }
   }

    // Place les arbres sur la parcelle selon le type de zone et des probabilités configurées
    placeTreesForPlot(plot) {
        // Vérifier si des assets d'arbres sont chargés
        if (!this.assetLoader || !this.assetLoader.assets.tree || this.assetLoader.assets.tree.length === 0) {
            return; // Pas d'arbres à placer
        }

        // Récupérer les paramètres de config
        const probSidewalk = this.config.treePlacementProbabilitySidewalk;
        const probPark = this.config.treePlacementProbabilityPark;
        const probMargin = this.config.treePlacementProbabilityMargin;
        const sidewalkW = this.config.sidewalkWidth;

        // 1. Arbres sur trottoir (coins et potentiellement le long des bords)
        if (sidewalkW > 0 && probSidewalk > 0) {
            // Coins du trottoir extérieur
            const corners = [
                { x: plot.x - sidewalkW / 2, z: plot.z - sidewalkW / 2 }, // Haut Gauche
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z - sidewalkW / 2 }, // Haut Droite
                { x: plot.x - sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 }, // Bas Gauche
                { x: plot.x + plot.width + sidewalkW / 2, z: plot.z + plot.depth + sidewalkW / 2 } // Bas Droite
            ];
            corners.forEach(corner => {
                if (Math.random() < probSidewalk) {
                    this.addTreeInstance(corner.x, corner.z); // Appel interne
                }
            });
            // TODO: Ajouter potentiellement des arbres le long des bords du trottoir aussi
        }

        // 2. Arbres dans la parcelle (parcs ou marges)
        const plotBounds = {
            minX: plot.x, maxX: plot.x + plot.width,
            minZ: plot.z, maxZ: plot.z + plot.depth,
        };

        // Cas spécifique des parcs
        if (plot.zoneType === 'park' && probPark > 0) {
            const area = plot.width * plot.depth;
            const numTreesToTry = Math.ceil(area * probPark); // Nombre d'arbres proportionnel à l'aire
            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                // Dans un parc, on suppose qu'on peut placer n'importe où (pas d'occupiedSubZones à vérifier)
                this.addTreeInstance(treeX, treeZ);
            }
        }
        // Cas des marges des autres zones constructibles
        else if (['house', 'building', 'industrial', 'skyscraper'].includes(plot.zoneType) && probMargin > 0) {
            const area = plot.width * plot.depth;
            // Calculer l'aire occupée par les bâtiments/structures principaux
            const occupiedArea = (plot.occupiedSubZones || []).reduce((acc, sz) => acc + (sz.width * sz.depth), 0);
            const marginArea = Math.max(0, area - occupiedArea); // Aire disponible en marge
            const numTreesToTry = Math.ceil(marginArea * probMargin); // Proportionnel à l'aire de marge

            for (let i = 0; i < numTreesToTry; i++) {
                const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);

                // Vérifier si l'emplacement est dans une zone déjà occupée
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

                // Si l'emplacement est libre, ajouter l'arbre
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
        this.assetLoader = assetLoader; // Stocker la référence à l'asset loader
        // --- NOUVEAU ---
        this.cityManager = null; // Réinitialiser la référence au CityManager
        // -------------
        // Réinitialiser la structure pour stocker les matrices d'instances
        // Assurer que tous les types (y compris 'skyscraper' et 'crosswalk') sont présents
        this.instanceData = { house: {}, building: {}, industrial: {}, park: {}, tree: {}, skyscraper: {}, crosswalk: {} };

        // Nettoyer les groupes Three.js (retirer les enfants et disposer leur géométrie)
        const disposeGroupContents = (group) => {
             while (group.children.length > 0) {
                 const c = group.children[0];
                 group.remove(c);
                 if (c.geometry) c.geometry.dispose();
                 // Ne pas disposer le matériau ici s'il est partagé (ex: materials.sidewalkMaterial)
                 // Les matériaux des InstancedMesh seront gérés par AssetLoader.disposeAssets
             }
        };
        disposeGroupContents(this.sidewalkGroup);
        disposeGroupContents(this.buildingGroup); // Nettoie les anciens InstancedMesh

        // Disposer l'ancienne géométrie de base pour les passages piétons si elle existe
        if (this.stripeBaseGeometry) {
            this.stripeBaseGeometry.dispose();
            this.stripeBaseGeometry = null;
        }
        // console.log("PlotContentGenerator réinitialisé."); // Optionnel
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
        let totalInstancesCreated = 0;
        let instancedMeshCount = 0;

        // Vérifications initiales (inchangées)
        if (!this.assetLoader && !this.stripeBaseGeometry) {
             // Cas spécifique crosswalk sans assetLoader
             if (!this.stripeBaseGeometry && this.instanceData.crosswalk && Object.keys(this.instanceData.crosswalk).length > 0) {
                console.error("Impossible de créer InstancedMesh crosswalk: stripeBaseGeometry non dispo.");
             } else if (!this.assetLoader) {
                console.error("Impossible de créer InstancedMesh: AssetLoader non disponible.");
                return;
             }
             // Si seulement stripeBaseGeometry manque mais qu'il y a d'autres types, on continue pour les autres
        }


        // Boucle sur les types d'assets (house, building, crosswalk, etc.)
        for (const type in this.instanceData) {
            if (!this.instanceData.hasOwnProperty(type)) continue;

            // Boucle sur les modèles spécifiques pour ce type
            for (const modelId in this.instanceData[type]) {
                if (!this.instanceData[type].hasOwnProperty(modelId)) continue;

                const matrices = this.instanceData[type][modelId];

                // Vérifier s'il y a des matrices à traiter pour ce modèle
                if (matrices && matrices.length > 0) {
                    let geometry = null;
                    let material = null;
                    let castShadow = true;
                    let receiveShadow = true;

                    // Obtenir la géométrie et le matériau
                    if (type === 'crosswalk') {
                        // Cas spécial pour les passages piétons (bandes)
                        if (this.stripeBaseGeometry && this.materials.crosswalkMaterial) {
                            geometry = this.stripeBaseGeometry;
                            material = this.materials.crosswalkMaterial;
                            castShadow = false; // Les bandes ne projettent pas d'ombres
                            receiveShadow = true;
                        } else {
                            console.warn(`Géométrie/matériau manquant pour 'crosswalk' (bandes), ${matrices.length} instances ignorées.`);
                            continue; // Passer au modèle suivant
                        }
                    } else if (this.assetLoader) {
                        // Cas général pour les bâtiments, arbres, etc.
                        const assetData = this.assetLoader.getAssetDataById(modelId);
                        if (assetData && assetData.geometry && assetData.material) {
                            geometry = assetData.geometry;
                            material = assetData.material;
                            // castShadow/receiveShadow pourraient être définis par asset si besoin
                        } else {
                            console.warn(`Données asset ${modelId} (type ${type}) invalides ou manquantes (geom/mat), ${matrices.length} instances ignorées.`);
                            continue; // Passer au modèle suivant
                        }
                    } else {
                        // Si pas crosswalk et pas d'assetLoader, on ne peut rien faire
                        console.warn(`AssetLoader manquant pour type '${type}', ${matrices.length} instances ignorées.`);
                        continue;
                    }

                    // Créer l'InstancedMesh
                    const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);

                    // Appliquer chaque matrice
                    matrices.forEach((matrix, index) => {
                        instancedMesh.setMatrixAt(index, matrix);
                    });

                    // --- !!! CORRECTION IMPORTANTE !!! ---
                    // Indiquer que les données de matrice ont changé et doivent être envoyées au GPU
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    // -------------------------------------

                    // Configurer les ombres
                    instancedMesh.castShadow = castShadow;
                    instancedMesh.receiveShadow = receiveShadow;
                    instancedMesh.name = `${type}_${modelId}_Instanced`; // Nom unique

                    // Ajouter au groupe de bâtiments/contenu
                    this.buildingGroup.add(instancedMesh);
                    instancedMeshCount++;
                    totalInstancesCreated += matrices.length;

                } // Fin if (matrices && matrices.length > 0)
            } // Fin boucle modelId
        } // Fin boucle type

        // Log final (inchangé)
        if (instancedMeshCount > 0) {
            console.log(`Création InstancedMesh terminée: ${instancedMeshCount} mesh(es) pour ${totalInstancesCreated} instances ajoutés à buildingGroup.`);
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
