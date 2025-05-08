// src/World/Strategies/BuildingPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager
 * @typedef {import('../Buildings/BuildingRenderer.js').default} BuildingRenderer // Assurez-vous que le chemin est correct
 */

export default class BuildingPlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les zones de type immeuble ('building').
     * Utilise potentiellement BuildingRenderer et CityAssetLoader.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {{buildingRenderer?: BuildingRenderer}} specificRenderers - Doit contenir buildingRenderer.
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
        if (!this.renderers.buildingRenderer) {
            throw new Error("BuildingPlacementStrategy requires 'buildingRenderer' in specificRenderers.");
        }
         // Raccourci pratique
         this.buildingRenderer = this.renderers.buildingRenderer;
    }

    /**
     * Peuple la parcelle avec des immeubles.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire pour stocker les données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville pour enregistrer les bâtiments.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.gridBuildingBaseScale ?? 1.0;
        const minSpacing = this.config.minBuildingSpacing ?? 0;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;

        // --- TEMPORARY: Use a representative size for grid calculation ---
        // TODO: Ideally, get an average or representative size from assetLoader if possible,
        // or use a config value. Using the first asset's size for now for layout.
        const representativeAsset = this.assetLoader.getAssetDataById(this.assetLoader.assets.building[0]?.id);
        if (!representativeAsset || !representativeAsset.sizeAfterFitting) {
            console.warn(`BuildingPlacementStrategy: Could not get representative asset size for Plot ${plot.id}. Skipping placement.`);
            return;
        }
        const targetBuildingWidth = representativeAsset.sizeAfterFitting.x * baseScaleFactor;
        const targetBuildingDepth = representativeAsset.sizeAfterFitting.z * baseScaleFactor;
        // --- END TEMPORARY ---

        const gridPlacement = this.calculateGridPlacement(
            plot,
            targetBuildingWidth,
            targetBuildingDepth,
            minSpacing
        );

        if (!gridPlacement) {
            // console.warn(`BuildingPlacementStrategy: Impossible de placer des immeubles sur Plot ${plot.id}`);
            return;
        }

        const { numItemsX, numItemsY, gapX, gapZ } = gridPlacement;
        
        // Récupérer les positions des commerces (si elles existent)
        const commercialPositions = plot.commercialPositions || [];

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
				// === on skippe tout ce qui n'est pas en bordure ===
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}
                
                // Vérifier si cette position est occupée par un commerce
                const isCommercialPosition = commercialPositions.some(pos => 
                    pos.x === colIndex && pos.y === rowIndex);
                
                // Si c'est un commerce, ne pas placer d'immeuble ici
                if (isCommercialPosition) {
                    continue;
                }
                
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
                
                // Déterminer la rotation en fonction de la position par rapport aux trottoirs
                let targetRotationY = 0;
                const sidewalkWidth = this.config.sidewalkWidth ?? 0;
                
                // Calculer les distances aux bords de la parcelle
                const distToLeft = cellCenterX - plot.x;
                const distToRight = (plot.x + plot.width) - cellCenterX;
                const distToTop = cellCenterZ - plot.z;
                const distToBottom = (plot.z + plot.depth) - cellCenterZ;
                
                // Vérifier si le bâtiment est adjacent à un trottoir
                const isNearSidewalk = (distToLeft <= sidewalkWidth) || 
                                     (distToRight <= sidewalkWidth) || 
                                     (distToTop <= sidewalkWidth) || 
                                     (distToBottom <= sidewalkWidth);
                
                if (isNearSidewalk) {
                    // Si le bâtiment est près d'un trottoir, l'orienter vers ce trottoir
                    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                    const tolerance = 0.1;
                    
                    if (Math.abs(minDist - distToLeft) < tolerance)
                        targetRotationY = Math.PI / 2; // Face avant vers la gauche (-X)
                    else if (Math.abs(minDist - distToRight) < tolerance)
                        targetRotationY = -Math.PI / 2; // Face avant vers la droite (+X)
                    else if (Math.abs(minDist - distToTop) < tolerance)
                        targetRotationY = Math.PI; // Face avant vers le haut (-Z)
                    else
                        targetRotationY = 0; // Face avant vers le bas (+Z)
                } else {
                    // Si le bâtiment n'est pas près d'un trottoir, l'orienter vers le bord le plus proche
                    if (rowIndex === 0)
                        targetRotationY = Math.PI; // Face avant vers le haut (-Z)
                    else if (rowIndex === numItemsY - 1)
                        targetRotationY = 0; // Face avant vers le bas (+Z)
                    else if (colIndex === 0)
                        targetRotationY = Math.PI / 2; // Face avant vers la gauche (-X)
                    else if (colIndex === numItemsX - 1)
                        targetRotationY = -Math.PI / 2; // Face avant vers la droite (+X)
                }

                const assetInfo = this.assetLoader.getRandomAssetData('building');
                if (!assetInfo) {
                    console.warn(`BuildingPlacementStrategy: Aucun asset 'building' trouvé pour cellule (${colIndex},${rowIndex}) Plot ${plot.id}.`);
                    continue; // Skip this cell
                }
                if (!assetInfo.sizeAfterFitting || !assetInfo.centerOffset || !assetInfo.fittingScaleFactor || !assetInfo.id) {
                    console.error(`BuildingPlacementStrategy: Données de l'asset 'building' (ID: ${assetInfo.id}) incomplètes pour cellule (${colIndex},${rowIndex}) Plot ${plot.id}.`);
                    continue; // Skip this cell
                }

                // Utiliser BuildingRenderer pour obtenir les matrices d'instance,
                // en passant les informations de l'asset sélectionné.
                const buildingInstanceData = this.buildingRenderer.generateBuildingInstance(
                    worldCellCenterPos,
                    plotGroundY,
                    targetRotationY,
                    baseScaleFactor,
                    assetInfo // Passer les infos complètes de l'asset
                );

                if (buildingInstanceData) {
                    // Ajouter chaque partie (ou l'ensemble) au gestionnaire d'instances
                    for (const partOrModelKey in buildingInstanceData) {
                         if (buildingInstanceData.hasOwnProperty(partOrModelKey) && Array.isArray(buildingInstanceData[partOrModelKey])) {
                            buildingInstanceData[partOrModelKey].forEach(matrix => {
                                // Créer un identifiant unique pour cette combinaison asset/partie
                                // Si la clé est 'default', on utilise juste l'assetId.
                                // Sinon (pour les procéduraux), on combine assetId et partKey.
                                const instanceKey = (partOrModelKey === 'default') ? assetInfo.id : `${assetInfo.id}_${partOrModelKey}`;
                                instanceDataManager.addData('building', instanceKey, matrix);
                            });
                        }
                    }

                    // Enregistrer l'instance de bâtiment
                    const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                    const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'building', buildingPosition);

                    if (registeredBuilding) {
                        plot.addBuildingInstance({
                            id: registeredBuilding.id,
                            type: 'building',
                            position: buildingPosition.clone()
                        });
                    }
                } else {
                     console.warn(`BuildingRenderer n'a retourné aucune donnée d'instance pour asset ${assetInfo.id} sur Plot ${plot.id}, cellule (${colIndex},${rowIndex})`);
                 }
            } // Fin boucle colIndex
        } // Fin boucle rowIndex
    }
}