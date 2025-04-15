// src/World/Strategies/IndustrialPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager
 */

export default class IndustrialPlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les zones industrielles ('industrial').
     * Utilise CityAssetLoader pour obtenir des modèles d'usines/entrepôts.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {object} specificRenderers - Renderers spécialisés (non requis ici a priori).
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        // Pas besoin de renderer spécifique ici, on utilise les assets chargés
        super(config, assetLoader, specificRenderers, experience);
    }

    /**
     * Peuple la parcelle avec des bâtiments industriels.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire pour stocker les données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville pour enregistrer les bâtiments.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.gridIndustrialBaseScale ?? 1.0;
        const minSpacing = this.config.minIndustrialSpacing ?? 0;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;

        // Récupérer un asset industriel aléatoire
        const assetInfo = this.assetLoader.getRandomAssetData('industrial');

        if (!assetInfo) {
            console.warn(`IndustrialPlacementStrategy: Aucun asset 'industrial' trouvé pour Plot ${plot.id}.`);
            return;
        }
         if (!assetInfo.sizeAfterFitting || !assetInfo.centerOffset || !assetInfo.fittingScaleFactor || !assetInfo.id) {
             console.error(`IndustrialPlacementStrategy: Données de l'asset 'industrial' (ID: ${assetInfo.id}) incomplètes ou invalides pour Plot ${plot.id}.`);
             return;
         }
         // Vérifier si l'asset a des parties (inattendu pour industriel, mais sécurité)
         if (assetInfo.parts && assetInfo.parts.length > 0) {
             console.warn(`IndustrialPlacementStrategy: L'asset industriel ${assetInfo.id} a des 'parts', ce qui n'est pas géré comme un asset standard ici. Utilisation comme asset simple.`);
         }

        // Dimensions cibles basées sur l'asset chargé
        const targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
        const targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;

        const gridPlacement = this.calculateGridPlacement(
            plot,
            targetBuildingWidth,
            targetBuildingDepth,
            minSpacing
        );

        if (!gridPlacement) {
            // console.warn(`IndustrialPlacementStrategy: Impossible de placer des bâtiments industriels sur Plot ${plot.id}`);
            return;
        }

        const { numItemsX, numItemsY, gapX, gapZ } = gridPlacement;

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;

                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);

                // Calculer la matrice d'instance en utilisant la méthode de la classe de base
                const instanceMatrix = this.calculateInstanceMatrix(
                    cellCenterX,
                    cellCenterZ,
                    assetInfo.sizeAfterFitting.y, // Hauteur après échelle de base
                    assetInfo.fittingScaleFactor, // Échelle de base de l'asset
                    assetInfo.centerOffset,       // Offset du centre de l'asset
                    baseScaleFactor,              // Échelle spécifique à la grille industrielle
                    targetRotationY,
                    plotGroundY                   // Décalage vertical du sol
                );

                // Ajouter la matrice au gestionnaire d'instances
                instanceDataManager.addData('industrial', assetInfo.id, instanceMatrix);

                // Enregistrer l'instance de bâtiment
                const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'industrial', buildingPosition);

                if (registeredBuilding) {
                    plot.addBuildingInstance({
                        id: registeredBuilding.id,
                        type: 'industrial',
                        position: buildingPosition.clone()
                    });
                }
            } // Fin boucle colIndex
        } // Fin boucle rowIndex
    }
}