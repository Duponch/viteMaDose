import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../City/Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../City/CityManager.js').default} CityManager
 */

export default class CommercialPlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les zones commerciales.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {object} specificRenderers - Les renderers spécifiques.
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
    }

    /**
     * Peuple la parcelle avec des bâtiments commerciaux.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire de données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.commercialBaseScale ?? 2.0;
        const targetBuildingWidth = 2.0 * baseScaleFactor;
        const targetBuildingDepth = 2.0 * baseScaleFactor;
        const minSpacing = this.config.minCommercialSpacing ?? 0;

        const gridPlacement = this.calculateGridPlacement(
            plot,
            targetBuildingWidth,
            targetBuildingDepth,
            minSpacing
        );

        if (!gridPlacement) {
            return; // Pas assez d'espace
        }

        const { numItemsX, numItemsY, gapX, gapZ } = gridPlacement;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);

                // Création d'un cube bleu clair émissif pour représenter le commerce
                const matrix = new THREE.Matrix4();
                matrix.compose(
                    worldCellCenterPos,
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotationY, 0)),
                    new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor)
                );

                // Ajouter les données d'instance pour un cube commercial
                instanceDataManager.addData('commercial', 'default', matrix);

                // Enregistrer l'instance de bâtiment auprès de CityManager
                const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'commercial', buildingPosition);

                if (registeredBuilding) {
                    plot.addBuildingInstance({
                        id: registeredBuilding.id,
                        type: 'commercial',
                        position: buildingPosition.clone()
                    });
                }
            }
        }
    }
    
    /**
     * Méthode pour placer un bâtiment commercial à une position spécifique
     * @param {Plot} plot - La parcelle où placer le commerce
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire de données d'instance
     * @param {CityManager} cityManager - Gestionnaire de la ville
     * @param {THREE.Vector3} position - Position du commerce
     * @param {number} baseScaleFactor - Facteur d'échelle pour le commerce
     * @param {number} rotationY - Rotation Y en radians
     * @returns {boolean} - Vrai si le placement a réussi
     */
    placeSingleCommercial(plot, instanceDataManager, cityManager, position, baseScaleFactor, rotationY) {
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;
        
        // Création d'un cube bleu clair émissif
        const matrix = new THREE.Matrix4();
        matrix.compose(
            position,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
            new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor)
        );
        
        // Ajouter les données d'instance pour un cube commercial
        instanceDataManager.addData('commercial', 'default', matrix);
        
        // Enregistrer l'instance de bâtiment auprès de CityManager
        const buildingPosition = new THREE.Vector3(position.x, sidewalkHeight, position.z);
        const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'commercial', buildingPosition);
        
        if (registeredBuilding) {
            plot.addBuildingInstance({
                id: registeredBuilding.id,
                type: 'commercial',
                position: buildingPosition.clone()
            });
            return true;
        }
        
        return false;
    }
} 