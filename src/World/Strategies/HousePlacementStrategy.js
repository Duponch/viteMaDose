// src/World/Strategies/HousePlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../City/Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../City/CityManager.js').default} CityManager
 * @typedef {import('../Buildings/HouseRenderer.js').default} HouseRenderer // Assurez-vous que le chemin est correct
 */

export default class HousePlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les zones résidentielles de type maison.
     * Utilise HouseRenderer pour générer les instances.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {{houseRenderer?: HouseRenderer}} specificRenderers - Doit contenir houseRenderer.
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
        if (!this.renderers.houseRenderer) {
            throw new Error("HousePlacementStrategy requires 'houseRenderer' in specificRenderers.");
        }
        // Raccourci pratique
        this.houseRenderer = this.renderers.houseRenderer;
    }

    /**
     * Peuple la parcelle avec des maisons générées procéduralement.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire pour stocker les données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville pour enregistrer les bâtiments.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.gridHouseBaseScale ?? 1.5;
        // Dimensions cibles basées sur la logique interne de HouseRenderer (armLength=2.0)
        const targetBuildingWidth = 2.0 * baseScaleFactor;
        const targetBuildingDepth = 2.0 * baseScaleFactor;
        const minSpacing = this.config.minHouseSpacing ?? 0;

        const gridPlacement = this.calculateGridPlacement(
            plot,
            targetBuildingWidth,
            targetBuildingDepth,
            minSpacing
        );

        if (!gridPlacement) {
            // console.warn(`HousePlacementStrategy: Impossible de placer des maisons sur Plot ${plot.id}`);
            return; // Pas assez d'espace
        }

        const { numItemsX, numItemsY, gapX, gapZ } = gridPlacement;
        const plotGroundY = this.config.plotGroundY ?? 0.005; // Utiliser pour la position Y
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2; // Pour enregistrer la position du bâtiment
        
        // Récupérer les positions des commerces (si elles existent)
        const commercialPositions = plot.commercialPositions || [];

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
				// === ne garder que la périphérie ===
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}
                
                // Vérifier si cette position est occupée par un commerce
                const isCommercialPosition = commercialPositions.some(pos => 
                    pos.x === colIndex && pos.y === rowIndex);
                
                // Si c'est un commerce, ne pas placer de maison ici
                if (isCommercialPosition) {
                    continue;
                }
                
                // Calculer le centre de la cellule de la grille
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

                // Déterminer la rotation
                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);

                // Générer les données d'instance pour une maison
                // HouseRenderer retourne un objet { partName: [matrix, ...], ... }
                const houseInstanceData = this.houseRenderer.generateHouseInstance(
                    worldCellCenterPos,
                    plotGroundY, // Utiliser la hauteur configurée pour le positionnement vertical
                    targetRotationY,
                    baseScaleFactor
                );

                if (houseInstanceData) {
                    // Ajouter chaque partie (et ses matrices) au gestionnaire d'instances
                    for (const partName in houseInstanceData) {
                        if (houseInstanceData.hasOwnProperty(partName) && Array.isArray(houseInstanceData[partName])) {
                            houseInstanceData[partName].forEach(matrix => {
                                instanceDataManager.addData('house', partName, matrix);
                            });
                        }
                    }

                    // Enregistrer l'instance de bâtiment auprès de CityManager
                    // Utiliser le centre de la cellule, mais à la hauteur du trottoir pour la logique de citoyen
                    const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                    const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'house', buildingPosition);

                    if (registeredBuilding) {
                        plot.addBuildingInstance({
                            id: registeredBuilding.id,
                            type: 'house',
                            position: buildingPosition.clone()
                        });
                    }
                } else {
                    console.warn(`HouseRenderer n'a retourné aucune donnée d'instance pour Plot ${plot.id}, cellule (${colIndex},${rowIndex})`);
                }
            } // Fin boucle colIndex
        } // Fin boucle rowIndex
    }
}