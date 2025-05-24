import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';
import BuildingFacadeHelper from '../Buildings/BuildingFacadeHelper.js';

/**
 * @typedef {import('../City/Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../City/CityManager.js').default} CityManager
 */

export default class MovieTheaterPlacementStrategy extends IZonePlacementStrategy {

    /**
     * Stratégie de placement pour les cinémas.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {object} specificRenderers - Les renderers spécifiques.
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
        
        // Créer le helper de visualisation des façades
        if (experience && experience.scene) {
            this.facadeHelper = new BuildingFacadeHelper(config, experience.scene);
            console.log("MovieTheaterPlacementStrategy: BuildingFacadeHelper initialized");
        } else {
            console.warn("MovieTheaterPlacementStrategy: Cannot initialize BuildingFacadeHelper, experience or scene missing");
        }
    }

    /**
     * Peuple la parcelle avec un cinéma.
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire de données d'instance.
     * @param {CityManager} cityManager - Le gestionnaire de la ville.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        const baseScaleFactor = this.config.movieTheaterBaseScale ?? 2.5; // Légèrement plus grand que commercial
        const targetBuildingWidth = 2.5 * baseScaleFactor;
        const targetBuildingDepth = 2.5 * baseScaleFactor;
        const minSpacing = this.config.minMovieTheaterSpacing ?? 0;

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
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;

        // Pour un cinéma, on place généralement un seul bâtiment au centre ou dans une position visible
        const centerRowIndex = Math.floor(numItemsY / 2);
        const centerColIndex = Math.floor(numItemsX / 2);

        const cellCenterX = plot.x + gapX + (centerColIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
        const cellCenterZ = plot.z + gapZ + (centerRowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
        const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

        // Déterminer la rotation en fonction de la position par rapport aux trottoirs
        const targetRotationY = this.determineOrientationTowardsSidewalk(
            cellCenterX, 
            cellCenterZ, 
            plot, 
            this.config.sidewalkWidth ?? 0, 
            centerRowIndex, 
            centerColIndex, 
            numItemsX, 
            numItemsY
        );

        // Ajouter un helper de façade si disponible
        if (this.facadeHelper) {
            const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
            this.facadeHelper.addFacadeHelper(
                buildingPosition, 
                targetRotationY, 
                targetBuildingWidth, 
                targetBuildingDepth
            );
        }

        // Création d'un cube rouge émissif pour représenter le cinéma
        const matrix = new THREE.Matrix4();
        matrix.compose(
            worldCellCenterPos,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotationY, 0)),
            new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor)
        );

        // Ajouter les données d'instance pour un cube de cinéma
        instanceDataManager.addData('movietheater', 'default', matrix);

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
     * Méthode pour placer un cinéma à une position spécifique
     * @param {Plot} plot - La parcelle où placer le cinéma
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire de données d'instance
     * @param {CityManager} cityManager - Gestionnaire de la ville
     * @param {THREE.Vector3} position - Position du cinéma
     * @param {number} baseScaleFactor - Facteur d'échelle pour le cinéma
     * @param {number} rotationY - Rotation Y en radians
     * @returns {boolean} - Vrai si le placement a réussi
     */
    placeSingleMovieTheater(plot, instanceDataManager, cityManager, position, baseScaleFactor, rotationY) {
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;
        
        // Ajouter un helper de façade si disponible
        if (this.facadeHelper) {
            const buildingPosition = new THREE.Vector3(position.x, sidewalkHeight, position.z);
            const targetBuildingWidth = 2.5 * baseScaleFactor;
            const targetBuildingDepth = 2.5 * baseScaleFactor;
            this.facadeHelper.addFacadeHelper(
                buildingPosition, 
                rotationY, 
                targetBuildingWidth, 
                targetBuildingDepth
            );
        }
        
        // Création d'un cube rouge émissif
        const matrix = new THREE.Matrix4();
        matrix.compose(
            position,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
            new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor)
        );
        
        // Ajouter les données d'instance pour un cube de cinéma
        instanceDataManager.addData('movietheater', 'default', matrix);
        
        // Enregistrer l'instance de bâtiment auprès de CityManager
        const buildingPosition = new THREE.Vector3(position.x, sidewalkHeight, position.z);
        const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'movietheater', buildingPosition);
        
        if (registeredBuilding) {
            plot.addBuildingInstance({
                id: registeredBuilding.id,
                type: 'movietheater',
                position: buildingPosition.clone()
            });
            return true;
        }
        
        return false;
    }
    
    /**
     * Détermine l'orientation optimale d'un cinéma pour qu'il soit face à un trottoir.
     * Identique à la logique commerciale.
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
        
        if (isCorner) {
            // Pour les coins, on choisit l'orientation vers le côté où la distance est la plus faible
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
        if (colIndex === 0 && !isCorner) {
            return -Math.PI/2; // Face orientée vers la gauche (-X)
        }
        else if (colIndex === numItemsX - 1 && !isCorner) {
            return Math.PI/2; // Face orientée vers la droite (+X)
        }
        else if (rowIndex === 0 && !isCorner) {
            return Math.PI; // Face orientée vers le haut (-Z)
        }
        else if (rowIndex === numItemsY - 1 && !isCorner) {
            return 0; // Face orientée vers le bas (+Z)
        }
        
        // Si nous arrivons ici, c'est un bâtiment qui n'est pas en bordure
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        
        if (minDist === distToLeft) return -Math.PI/2;      // Vers la gauche (-X)
        else if (minDist === distToRight) return Math.PI/2; // Vers la droite (+X)
        else if (minDist === distToTop) return Math.PI;     // Vers le haut (-Z)
        else return 0;                                      // Vers le bas (+Z)
    }
} 