// src/World/Strategies/ParkPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager
 */

export default class ParkPlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les zones de type parc ('park').
     * Place un nombre aléatoire d'éléments de parc choisis aléatoirement.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {object} specificRenderers - Renderers spécialisés (non requis ici).
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
    }

    /**
     * Peuple la parcelle avec des éléments de parc.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire pour stocker les données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville pour enregistrer les bâtiments (même si capacité 0).
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.gridParkBaseScale ?? 1.0;
        const minSpacing = this.config.minParkSpacing ?? 2.0;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;

        // 1. Obtenir un asset type 'park' *juste pour calculer la grille*
        //    On utilisera potentiellement d'autres assets pour le placement réel.
        const assetInfoForGrid = this.assetLoader.getRandomAssetData('park');
        if (!assetInfoForGrid) {
            console.warn(`ParkPlacementStrategy: Aucun asset 'park' trouvé pour calculer la grille sur Plot ${plot.id}.`);
            return;
        }
         if (!assetInfoForGrid.sizeAfterFitting || !assetInfoForGrid.centerOffset || !assetInfoForGrid.fittingScaleFactor || !assetInfoForGrid.id) {
             console.error(`ParkPlacementStrategy: Données de l'asset 'park' (ID: ${assetInfoForGrid.id}) incomplètes pour calculer la grille sur Plot ${plot.id}.`);
             return;
         }

        // 2. Calculer la grille potentielle de placement
        const targetItemWidth = assetInfoForGrid.sizeAfterFitting.x * baseScaleFactor;
        const targetItemDepth = assetInfoForGrid.sizeAfterFitting.z * baseScaleFactor;

        const gridPlacement = this.calculateGridPlacement(
            plot,
            targetItemWidth,
            targetItemDepth,
            minSpacing
        );

        if (!gridPlacement) {
            // console.warn(`ParkPlacementStrategy: Impossible de définir une grille de placement sur Plot ${plot.id}`);
            return; // Pas assez d'espace même pour une grille théorique
        }

        const { numItemsX, numItemsY, gapX, gapZ } = gridPlacement;

        // 3. Lister toutes les positions et rotations possibles dans la grille
        let parkCells = [];
        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                const cellCenterX = plot.x + gapX + (colIndex * (targetItemWidth + minSpacing)) + targetItemWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetItemDepth + minSpacing)) + targetItemDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);
                parkCells.push({ pos: worldCellCenterPos, rotationY: targetRotationY });
            }
        }

        const availableCells = parkCells.length;
        if (availableCells === 0) {
            // console.warn(`ParkPlacementStrategy: Aucune cellule de placement disponible sur Plot ${plot.id}`);
            return;
        }

        // 4. Déterminer combien d'éléments placer
        const minParkElements = this.config.minParkElements ?? 1; // Minimum 1 par défaut
        const maxParkElements = this.config.maxParkElements ?? 5; // Maximum 5 par défaut
        const effectiveMax = Math.min(maxParkElements, availableCells); // Ne pas dépasser le nombre de cellules
        const chosenCount = Math.floor(Math.random() * (effectiveMax - minParkElements + 1)) + minParkElements;

        // 5. Mélanger les cellules et sélectionner les premières 'chosenCount'
        //    (Fisher-Yates shuffle)
        let shuffledCells = parkCells.slice(); // Copie pour ne pas modifier l'original
        for (let i = shuffledCells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledCells[i], shuffledCells[j]] = [shuffledCells[j], shuffledCells[i]];
        }
        const selectedCells = shuffledCells.slice(0, chosenCount);

        // 6. Placer les éléments dans les cellules sélectionnées
        selectedCells.forEach(cell => {
            // Obtenir un asset de parc aléatoire *pour cet élément spécifique*
            const currentParkAsset = this.assetLoader.getRandomAssetData('park');
            if (!currentParkAsset) {
                console.warn("ParkPlacementStrategy: Aucun asset park trouvé lors de la sélection aléatoire.");
                return; // Passer à la cellule suivante
            }
            if (!currentParkAsset.sizeAfterFitting || !currentParkAsset.centerOffset || !currentParkAsset.fittingScaleFactor || !currentParkAsset.id) {
                 console.error(`ParkPlacementStrategy: Données de l'asset 'park' sélectionné (ID: ${currentParkAsset.id}) incomplètes.`);
                 return; // Passer à la cellule suivante
            }
             if (currentParkAsset.parts && currentParkAsset.parts.length > 0) {
                 console.warn(`ParkPlacementStrategy: L'asset parc ${currentParkAsset.id} a des 'parts'. Utilisation comme asset simple.`);
             }

            // Calculer la matrice d'instance pour cet asset spécifique
            const instanceMatrix = this.calculateInstanceMatrix(
                cell.pos.x, // Utiliser la position de la cellule sélectionnée
                cell.pos.z,
                currentParkAsset.sizeAfterFitting.y,
                currentParkAsset.fittingScaleFactor,
                currentParkAsset.centerOffset,
                baseScaleFactor, // Utiliser l'échelle de base définie pour les parcs
                cell.rotationY, // Utiliser la rotation calculée pour la cellule
                plotGroundY
            );

            // Ajouter la matrice au gestionnaire d'instances
            instanceDataManager.addData('park', currentParkAsset.id, instanceMatrix);

            // Enregistrer l'instance (même si c'est un parc, pour cohérence ou future logique)
            const buildingPosition = new THREE.Vector3(cell.pos.x, sidewalkHeight, cell.pos.z);
            // Les parcs ont typiquement une capacité de 0, registerBuildingInstance devrait gérer ça.
            const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'park', buildingPosition);

            if (registeredBuilding) {
                plot.addBuildingInstance({
                    id: registeredBuilding.id,
                    type: 'park', // Type spécifique 'park'
                    position: buildingPosition.clone()
                });
            }
        });
    }
}