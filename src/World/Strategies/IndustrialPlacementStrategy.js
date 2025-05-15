// src/World/Strategies/IndustrialPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';
import BuildingFacadeHelper from '../Buildings/BuildingFacadeHelper.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
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
        
        // Créer le helper de visualisation des façades
        if (experience && experience.scene) {
            this.facadeHelper = new BuildingFacadeHelper(config, experience.scene);
        }
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
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;

                // Déterminer la rotation en fonction de la position par rapport aux trottoirs
                const targetRotationY = this.determineOrientationTowardsSidewalk(
                    cellCenterX, 
                    cellCenterZ, 
                    plot, 
                    this.config.sidewalkWidth ?? 0, 
                    rowIndex, 
                    colIndex, 
                    numItemsX, 
                    numItemsY
                );

                // --- NOUVEAU: Ajouter un helper de façade si disponible ---
                if (this.facadeHelper) {
                    const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                    this.facadeHelper.addFacadeHelper(
                        buildingPosition, 
                        targetRotationY, 
                        targetBuildingWidth, 
                        targetBuildingDepth
                    );
                }

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
    
    /**
     * Détermine l'orientation optimale d'un bâtiment pour qu'il soit face à un trottoir.
     * Tient compte des coins qui peuvent avoir deux façades donnant sur des trottoirs.
     * @param {number} cellCenterX - Position X du centre de la cellule
     * @param {number} cellCenterZ - Position Z du centre de la cellule
     * @param {Plot} plot - La parcelle contenant le bâtiment
     * @param {number} sidewalkWidth - Largeur du trottoir
     * @param {number} rowIndex - Indice de ligne dans la grille
     * @param {number} colIndex - Indice de colonne dans la grille
     * @param {number} numItemsX - Nombre total de colonnes
     * @param {number} numItemsY - Nombre total de lignes
     * @returns {number} L'angle de rotation Y en radians
     */
    determineOrientationTowardsSidewalk(cellCenterX, cellCenterZ, plot, sidewalkWidth, rowIndex, colIndex, numItemsX, numItemsY) {
        // Distances aux bords de la parcelle
        const distToLeft = cellCenterX - plot.x;
        const distToRight = (plot.x + plot.width) - cellCenterX;
        const distToTop = cellCenterZ - plot.z;
        const distToBottom = (plot.z + plot.depth) - cellCenterZ;
        
        // Déterminer si le bâtiment est dans un coin
        const isCorner = (
            (rowIndex === 0 && colIndex === 0) || // Coin haut gauche
            (rowIndex === 0 && colIndex === numItemsX - 1) || // Coin haut droit
            (rowIndex === numItemsY - 1 && colIndex === 0) || // Coin bas gauche
            (rowIndex === numItemsY - 1 && colIndex === numItemsX - 1) // Coin bas droit
        );
        
        /*
         * IMPORTANT: Dans Three.js, les rotations Y correspondent à:
         * 0 = face tournée vers +Z (sud)
         * Math.PI/2 = face tournée vers +X (est)
         * Math.PI = face tournée vers -Z (nord)
         * -Math.PI/2 (ou 3*Math.PI/2) = face tournée vers -X (ouest)
         * 
         * Pour que les flèches pointent vers l'extérieur, il faut donc:
         * - Pour les bâtiments au sud (bas) de la parcelle: rotation = 0 (pointer vers +Z)
         * - Pour les bâtiments à l'est (droite) de la parcelle: rotation = Math.PI/2 (pointer vers +X)
         * - Pour les bâtiments au nord (haut) de la parcelle: rotation = Math.PI (pointer vers -Z)
         * - Pour les bâtiments à l'ouest (gauche) de la parcelle: rotation = -Math.PI/2 (pointer vers -X)
         */
        
        if (isCorner) {
            // Pour les coins, on choisit l'orientation vers le côté où la distance est la plus faible
            // car c'est souvent le côté le plus visible ou le plus important
            
            if (rowIndex === 0 && colIndex === 0) {
                // Coin haut gauche: orienter vers le haut (-Z) ou vers la gauche (-X)
                return distToTop < distToLeft ? Math.PI : -Math.PI/2;
            } 
            else if (rowIndex === 0 && colIndex === numItemsX - 1) {
                // Coin haut droit: orienter vers le haut (-Z) ou vers la droite (+X)
                return distToTop < distToRight ? Math.PI : Math.PI/2;
            }
            else if (rowIndex === numItemsY - 1 && colIndex === 0) {
                // Coin bas gauche: orienter vers le bas (+Z) ou vers la gauche (-X)
                return distToBottom < distToLeft ? 0 : -Math.PI/2;
            }
            else if (rowIndex === numItemsY - 1 && colIndex === numItemsX - 1) {
                // Coin bas droit: orienter vers le bas (+Z) ou vers la droite (+X)
                return distToBottom < distToRight ? 0 : Math.PI/2;
            }
        }
        
        // Pour les bâtiments non situés dans les coins mais en bordure
        // Si le bâtiment est à gauche de la parcelle et n'est pas un coin
        if (colIndex === 0 && !isCorner) {
            return -Math.PI/2; // Face orientée vers la gauche (-X)
        }
        // Si le bâtiment est à droite de la parcelle et n'est pas un coin
        else if (colIndex === numItemsX - 1 && !isCorner) {
            return Math.PI/2; // Face orientée vers la droite (+X)
        }
        // Si le bâtiment est en haut de la parcelle et n'est pas un coin
        else if (rowIndex === 0 && !isCorner) {
            return Math.PI; // Face orientée vers le haut (-Z)
        }
        // Si le bâtiment est en bas de la parcelle et n'est pas un coin
        else if (rowIndex === numItemsY - 1 && !isCorner) {
            return 0; // Face orientée vers le bas (+Z)
        }
        
        // Si nous arrivons ici, c'est un bâtiment qui n'est pas en bordure
        // Cela ne devrait pas arriver avec le filtrage actuel, mais gérons ce cas
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        
        if (minDist === distToLeft) return -Math.PI/2;      // Vers la gauche (-X)
        else if (minDist === distToRight) return Math.PI/2; // Vers la droite (+X)
        else if (minDist === distToTop) return Math.PI;     // Vers le haut (-Z)
        else return 0;                                      // Vers le bas (+Z)
    }
}