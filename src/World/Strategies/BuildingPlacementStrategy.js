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

        // Récupérer les données de l'asset pour ce type.
        // NOTE: Depuis la modification de CityAssetLoader, getRandomAssetData('building')
        // retournera probablement l'asset procédural pré-généré s'il existe.
        const assetInfo = this.assetLoader.getRandomAssetData('building');

        if (!assetInfo) {
            console.warn(`BuildingPlacementStrategy: Aucun asset 'building' trouvé pour Plot ${plot.id}.`);
            return;
        }
        if (!assetInfo.sizeAfterFitting || !assetInfo.centerOffset || !assetInfo.fittingScaleFactor || !assetInfo.id) {
             console.error(`BuildingPlacementStrategy: Données de l'asset 'building' (ID: ${assetInfo.id}) incomplètes ou invalides pour Plot ${plot.id}.`);
             return;
        }

        // Dimensions cibles basées sur l'asset chargé/généré et l'échelle de la grille
        const targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
        const targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;

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

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
				// === on skippe tout ce qui n'est pas en bordure ===
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}		   
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);

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