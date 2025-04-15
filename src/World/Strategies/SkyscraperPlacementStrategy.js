// src/World/Strategies/SkyscraperPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager
 * @typedef {import('../SkyscraperRenderer.js').default} SkyscraperRenderer // Assurez-vous que le chemin est correct
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

        // Récupérer les données de l'asset pour ce type.
        // Devrait retourner l'asset procédural pré-généré via CityAssetLoader.
        const assetInfo = this.assetLoader.getRandomAssetData('skyscraper');

        if (!assetInfo) {
            console.warn(`SkyscraperPlacementStrategy: Aucun asset 'skyscraper' trouvé pour Plot ${plot.id}.`);
            return;
        }
        if (!assetInfo.sizeAfterFitting || !assetInfo.centerOffset || !assetInfo.fittingScaleFactor || !assetInfo.id) {
             console.error(`SkyscraperPlacementStrategy: Données de l'asset 'skyscraper' (ID: ${assetInfo.id}) incomplètes ou invalides pour Plot ${plot.id}.`);
             return;
        }
        // Les gratte-ciels générés procéduralement auront des 'parts'
        if (!assetInfo.parts || assetInfo.parts.length === 0) {
             console.warn(`SkyscraperPlacementStrategy: L'asset gratte-ciel ${assetInfo.id} n'a pas de 'parts' définies. Comportement inattendu.`);
             // On pourrait tenter de le traiter comme un asset simple, mais c'est risqué.
             // return; // Ou gérer un fallback si nécessaire
        }

        // Dimensions cibles basées sur l'asset généré et l'échelle de la grille
        const targetBuildingWidth = assetInfo.sizeAfterFitting.x * baseScaleFactor;
        const targetBuildingDepth = assetInfo.sizeAfterFitting.z * baseScaleFactor;

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
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);

                // Utiliser SkyscraperRenderer pour obtenir les matrices d'instance
                const skyscraperInstanceData = this.skyscraperRenderer.generateSkyscraperInstance(
                    worldCellCenterPos,
                    plotGroundY,
                    targetRotationY,
                    baseScaleFactor,
                    assetInfo // Passer les infos complètes de l'asset procédural
                );

                if (skyscraperInstanceData) {
                    // Ajouter chaque partie au gestionnaire d'instances
                    for (const partName in skyscraperInstanceData) {
                        if (skyscraperInstanceData.hasOwnProperty(partName) && Array.isArray(skyscraperInstanceData[partName])) {
                            skyscraperInstanceData[partName].forEach(matrix => {
                                // Créer un identifiant unique pour cette combinaison asset/partie
                                const instanceKey = `${assetInfo.id}_${partName}`;
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
                    console.warn(`SkyscraperRenderer n'a retourné aucune donnée d'instance pour asset ${assetInfo.id} sur Plot ${plot.id}, cellule (${colIndex},${rowIndex})`);
                }
            } // Fin boucle colIndex
        } // Fin boucle rowIndex
    }
}