// src/World/Strategies/BuildingPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';
import BuildingFacadeHelper from '../Buildings/BuildingFacadeHelper.js';

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
        
        // Créer le helper de visualisation des façades
        if (experience && experience.scene) {
            this.facadeHelper = new BuildingFacadeHelper(config, experience.scene);
        }
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

        // Vérifier si cette parcelle doit avoir un cinéma
        const shouldHaveMovieTheater = cityManager.shouldPlotHaveSpecialBuilding('movietheater', plot);
        let movieTheaterPosition = null;

        // Si cette parcelle doit avoir un cinéma, sélectionner une position harmonieuse
        if (shouldHaveMovieTheater) {
            movieTheaterPosition = this._selectHarmoniousPosition(numItemsX, numItemsY);
        }

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

                // Vérifier si cette position doit avoir un cinéma
                const isMovieTheaterPosition = movieTheaterPosition && 
                    movieTheaterPosition.x === colIndex && movieTheaterPosition.y === rowIndex;
                
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
                
                // Déterminer la rotation en fonction de la position par rapport aux trottoirs
                const sidewalkWidth = this.config.sidewalkWidth ?? 0;
                
                // --- MODIFICATION: Amélioration de la détection de la façade avant ---
                let targetRotationY = this.determineOrientationTowardsSidewalk(
                    cellCenterX, 
                    cellCenterZ, 
                    plot, 
                    sidewalkWidth, 
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

                // Si cette position doit avoir un cinéma, utiliser le renderer de cinéma
                if (isMovieTheaterPosition) {
                    this._placeMovieTheater(
                        worldCellCenterPos,
                        targetRotationY,
                        baseScaleFactor,
                        instanceDataManager,
                        cityManager,
                        plot,
                        cellCenterX,
                        cellCenterZ,
                        sidewalkHeight
                    );
                    continue;
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

    /**
     * Place un cinéma à la position spécifiée.
     * @param {THREE.Vector3} worldCellCenterPos - Position du centre de la cellule.
     * @param {number} targetRotationY - Rotation Y cible.
     * @param {number} baseScaleFactor - Facteur d'échelle de base.
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des données d'instance.
     * @param {CityManager} cityManager - Gestionnaire de la ville.
     * @param {Plot} plot - La parcelle.
     * @param {number} cellCenterX - Position X du centre de la cellule.
     * @param {number} cellCenterZ - Position Z du centre de la cellule.
     * @param {number} sidewalkHeight - Hauteur du trottoir.
     * @private
     */
    _placeMovieTheater(worldCellCenterPos, targetRotationY, baseScaleFactor, instanceDataManager, cityManager, plot, cellCenterX, cellCenterZ, sidewalkHeight) {
        const movieTheaterRenderer = this.renderers.movieTheaterRenderer;
        if (!movieTheaterRenderer) {
            console.error('BuildingPlacementStrategy: MovieTheaterRenderer non disponible');
            return;
        }

        const plotGroundY = this.config.plotGroundY ?? 0.005;
        
        // Utiliser l'échelle configurée pour les cinémas
        const movieTheaterBaseScale = this.config.movieTheaterBaseScale ?? 2.2;
        const movieTheaterScaleFactor = movieTheaterBaseScale; // Utiliser directement la valeur de config

        // Générer l'asset procédural avec des dimensions basées sur la configuration
        const targetBuildingWidth = 3.5 * movieTheaterScaleFactor;
        const targetBuildingDepth = 3.5 * movieTheaterScaleFactor;
        
        const assetInfo = movieTheaterRenderer.generateProceduralBuilding(
            targetBuildingWidth,
            targetBuildingWidth * 0.8, // Hauteur proportionnelle
            targetBuildingDepth,
            1.0, // userScale
            0.8  // verticalScale
        );

        if (!assetInfo || !assetInfo.parts) {
            console.error('BuildingPlacementStrategy: Échec de génération de l\'asset procédural de cinéma');
            return;
        }

        // Utiliser la même logique de centrage que les autres bâtiments
        const finalScaleValue = assetInfo.fittingScaleFactor * movieTheaterScaleFactor;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(targetRotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -assetInfo.centerOffset.x,
            -assetInfo.centerOffset.y,
            -assetInfo.centerOffset.z
        );
        const finalHeight = assetInfo.sizeAfterFitting.y * movieTheaterScaleFactor;
        const finalY = finalHeight / 2 + plotGroundY;
        const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);

        // Construire la matrice finale
        const instanceMatrix = new THREE.Matrix4();
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(translationMatrix);

        // Ajouter les données d'instance pour chaque partie du cinéma
        assetInfo.parts.forEach((part, index) => {
            const partKey = `${assetInfo.id}_part${index}`;
            instanceDataManager.addData('movietheater', partKey, instanceMatrix.clone());
        });

        // Enregistrer l'instance de bâtiment auprès de CityManager
        const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
        const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'movietheater', buildingPosition);

        if (registeredBuilding) {
            plot.addBuildingInstance({
                id: registeredBuilding.id,
                type: 'movietheater',
                position: buildingPosition.clone()
            });
        }
    }

    /**
     * Sélectionne une position harmonieuse pour un bâtiment spécial basée sur des principes de composition.
     * @param {number} numItemsX - Nombre d'éléments en X dans la grille.
     * @param {number} numItemsY - Nombre d'éléments en Y dans la grille.
     * @returns {{x: number, y: number}} - Position harmonieuse sélectionnée.
     * @private
     */
    _selectHarmoniousPosition(numItemsX, numItemsY) {
        // Si la grille est petite, utiliser une position centrale
        if (numItemsX <= 2 && numItemsY <= 2) {
            const centerX = Math.floor(numItemsX / 2);
            const centerY = Math.floor(numItemsY / 2);
            return {x: centerX, y: centerY};
        }
        
        // Calculer des positions basées sur la règle des tiers et le nombre d'or
        const goldenRatio = 0.618;
        
        const preferredPositions = [
            // Positions "règle des tiers" 
            {x: Math.floor(numItemsX * 0.33), y: Math.floor(numItemsY * 0.33)},
            {x: Math.floor(numItemsX * 0.67), y: Math.floor(numItemsY * 0.33)},
            {x: Math.floor(numItemsX * 0.33), y: Math.floor(numItemsY * 0.67)},
            {x: Math.floor(numItemsX * 0.67), y: Math.floor(numItemsY * 0.67)},
            
            // Positions "golden ratio"
            {x: Math.floor(numItemsX * goldenRatio), y: Math.floor(numItemsY * goldenRatio)},
            {x: Math.floor(numItemsX * (1 - goldenRatio)), y: Math.floor(numItemsY * goldenRatio)},
            
            // Position centrale comme fallback
            {x: Math.floor(numItemsX / 2), y: Math.floor(numItemsY / 2)}
        ];
        
        // Filtrer les positions valides et en bordure uniquement
        const validPositions = preferredPositions.filter(pos => {
            if (pos.x < 0 || pos.x >= numItemsX || pos.y < 0 || pos.y >= numItemsY) {
                return false;
            }
            // Vérifier que la position est en bordure (même logique que pour les immeubles)
            return !(pos.y > 0 && pos.y < numItemsY - 1 && pos.x > 0 && pos.x < numItemsX - 1);
        });
        
        // Éliminer les doublons
        const uniquePositions = validPositions.filter((pos, index, array) => 
            array.findIndex(p => p.x === pos.x && p.y === pos.y) === index
        );
        
        // Retourner une position aléatoire parmi les positions harmonieuses
        if (uniquePositions.length > 0) {
            const randomIndex = Math.floor(Math.random() * uniquePositions.length);
            return uniquePositions[randomIndex];
        }
        
        // Fallback : position centrale en bordure
        const centerX = Math.floor(numItemsX / 2);
        const centerY = Math.floor(numItemsY / 2);
        
        // Ajuster pour être en bordure si nécessaire
        if (centerY > 0 && centerY < numItemsY - 1 && centerX > 0 && centerX < numItemsX - 1) {
            // Position centrale n'est pas en bordure, choisir une bordure
            return {x: 0, y: centerY}; // Bordure gauche
        }
        
        return {x: centerX, y: centerY};
    }
}