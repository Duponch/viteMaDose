// src/World/Strategies/SkyscraperPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager
 * @typedef {import('../Buildings/SkyscraperRenderer.js').default} SkyscraperRenderer // Assurez-vous que le chemin est correct
 */

export default class SkyscraperPlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les zones de type gratte-ciel ('skyscraper').
     * Utilise SkyscraperRenderer pour générer les instances (probablement procédurales).
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {{skyscraperRenderer?: SkyscraperRenderer}} specificRenderers - Doit contenir skyscraperRenderer.
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
        if (!this.renderers.skyscraperRenderer) {
            throw new Error("SkyscraperPlacementStrategy requires 'skyscraperRenderer' in specificRenderers.");
        }
        // Raccourci pratique
        this.skyscraperRenderer = this.renderers.skyscraperRenderer;
    }

    /**
     * Peuple la parcelle avec des gratte-ciels.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire pour stocker les données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville pour enregistrer les bâtiments.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.gridSkyscraperBaseScale ?? 1.0; // Note: Scale différent pour skyscrapers
        const minSpacing = this.config.minSkyscraperSpacing ?? 0;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;

        // Récupérer TOUS les assets de type skyscraper disponibles
        const allSkyscraperAssets = this.assetLoader.assets.skyscraper;

        if (!allSkyscraperAssets || allSkyscraperAssets.length === 0) {
             console.warn(`SkyscraperPlacementStrategy: Aucun asset 'skyscraper' trouvé (variantes 6-12 étages attendues) pour Plot ${plot.id}.`);
             return;
        }

        // On prend les dimensions du premier asset comme référence pour le placement
        // (on suppose qu'ils ont tous à peu près la même base)
        const referenceAssetInfo = allSkyscraperAssets[0];
        if (!referenceAssetInfo.sizeAfterFitting || !referenceAssetInfo.centerOffset || !referenceAssetInfo.fittingScaleFactor || !referenceAssetInfo.id) {
             console.error(`SkyscraperPlacementStrategy: Données de l'asset de référence 'skyscraper' (ID: ${referenceAssetInfo.id}) incomplètes ou invalides.`);
             return;
        }

        // Dimensions cibles basées sur l'asset de référence et l'échelle
        const targetBuildingWidth = referenceAssetInfo.sizeAfterFitting.x * baseScaleFactor;
        const targetBuildingDepth = referenceAssetInfo.sizeAfterFitting.z * baseScaleFactor;

        const gridPlacement = this.calculateGridPlacement(
            plot,
            targetBuildingWidth,
            targetBuildingDepth,
            minSpacing
        );

        if (!gridPlacement) {
            // console.warn(`SkyscraperPlacementStrategy: Impossible de placer des gratte-ciels sur Plot ${plot.id}`);
            return;
        }

        const { numItemsX, numItemsY, gapX, gapZ } = gridPlacement;

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);

                // *** Sélectionner un asset gratte-ciel aléatoire PARMI les variantes ***
                const randomAssetIndex = Math.floor(Math.random() * allSkyscraperAssets.length);
                const selectedAssetInfo = allSkyscraperAssets[randomAssetIndex];
                
                // Vérifier si l'asset sélectionné est valide (au cas où)
                if (!selectedAssetInfo || !selectedAssetInfo.parts || selectedAssetInfo.parts.length === 0 || !selectedAssetInfo.id) {
                     console.warn(`SkyscraperPlacementStrategy: Asset gratte-ciel sélectionné aléatoirement (index ${randomAssetIndex}, ID: ${selectedAssetInfo?.id}) invalide ou sans 'parts' pour Plot ${plot.id}. Passage au suivant.`);
                     continue; // Passer à la cellule suivante
                }

                // Utiliser SkyscraperRenderer pour obtenir les matrices d'instance AVEC L'ASSET SÉLECTIONNÉ
                const skyscraperInstanceData = this.skyscraperRenderer.generateSkyscraperInstance(
                    worldCellCenterPos,
                    plotGroundY,
                    targetRotationY,
                    baseScaleFactor,
                    selectedAssetInfo // Utiliser l'asset choisi aléatoirement
                );

                if (skyscraperInstanceData) {
                    // Ajouter chaque partie au gestionnaire d'instances
                    for (const partName in skyscraperInstanceData) {
                        if (skyscraperInstanceData.hasOwnProperty(partName) && Array.isArray(skyscraperInstanceData[partName])) {
                            skyscraperInstanceData[partName].forEach(matrix => {
                                // Créer un identifiant unique pour cette combinaison asset/partie
                                const instanceKey = `${selectedAssetInfo.id}_${partName}`;
                                instanceDataManager.addData('skyscraper', instanceKey, matrix);
                            });
                        }
                    }

                    // Enregistrer l'instance de bâtiment
                    const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                    const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'skyscraper', buildingPosition);

                    if (registeredBuilding) {
                        plot.addBuildingInstance({
                            id: registeredBuilding.id,
                            type: 'skyscraper',
                            position: buildingPosition.clone()
                        });
                    }
                } else {
                    console.warn(`SkyscraperRenderer n'a retourné aucune donnée d'instance pour asset ${selectedAssetInfo.id} sur Plot ${plot.id}, cellule (${colIndex},${rowIndex})`);
                }
            } // Fin boucle colIndex
        } // Fin boucle rowIndex
    }
}