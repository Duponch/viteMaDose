// src/World/Strategies/HousePlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';
import BuildingFacadeHelper from '../Buildings/BuildingFacadeHelper.js';

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
        // Renderer alternatif pour nouvelle maison
        this.newHouseRenderer = this.renderers.newHouseRenderer;
        
        // Créer le helper de visualisation des façades
        if (experience && experience.scene) {
            this.facadeHelper = new BuildingFacadeHelper(config, experience.scene);
        }
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
        const minSpacing = this.config.minHouseSpacing ?? 0;
        const targetWidth = 2.0 * baseScaleFactor;
        const targetDepth = 2.0 * baseScaleFactor;
        const grid = this.calculateGridPlacement(plot, targetWidth, targetDepth, minSpacing);
        if (!grid) return;
        const { numItemsX, numItemsY, gapX, gapZ } = grid;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;
        const commercialPositions = plot.commercialPositions || [];

        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
                // Périphérie uniquement
                if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) continue;
                // Ne pas placer sur positions commerciales
                if (commercialPositions.some(pos => pos.x === colIndex && pos.y === rowIndex)) continue;

                const cx = plot.x + gapX + colIndex * (targetWidth + minSpacing) + targetWidth / 2;
                const cz = plot.z + gapZ + rowIndex * (targetDepth + minSpacing) + targetDepth / 2;
                // Orientation vers trottoir
                const arrowY = this.determineOrientationTowardsSidewalk(
                    cx, cz, plot, this.config.sidewalkWidth ?? 0,
                    rowIndex, colIndex, numItemsX, numItemsY
                );
                // Helper façades
                if (this.facadeHelper) {
                    this.facadeHelper.addFacadeHelper(
                        new THREE.Vector3(cx, sidewalkHeight, cz),
                        arrowY,
                        targetWidth,
                        targetDepth
                    );
                }
                const rotationY = arrowY - Math.PI / 2;

                // Choix entre ancien et nouveau système
                const useNew = this.newHouseRenderer && ((rowIndex + colIndex) % 2 === 0);
                
                if (useNew) {
                    // Nouveau système : utiliser les assets procéduraux de NewHouseRenderer
                    let variants = this.assetLoader.assets.house.filter(a => a.rendererType === 'NewHouseRenderer');
                    if (variants.length === 0) variants = this.assetLoader.assets.house;
                    const assetInfo = variants[Math.floor(Math.random() * variants.length)];
                    if (!assetInfo || !assetInfo.parts) continue;

                    // Génération des matrices d'instance pour chaque partie
                    assetInfo.parts.forEach((part, index) => {
                        const matrix = this.calculateInstanceMatrix(
                            cx, cz,
                            assetInfo.sizeAfterFitting.y,
                            assetInfo.fittingScaleFactor,
                            assetInfo.centerOffset,
                            assetInfo.userScale,
                            rotationY,
                            plotGroundY
                        );
                        const key = `${assetInfo.id}_part${index}`;
                        instanceDataManager.addData('house', key, matrix);
                    });
                } else {
                    // Ancien système : utiliser directement generateHouseInstance de HouseRenderer
                    const worldCellCenterPos = new THREE.Vector3(cx, 0, cz);
                    const houseInstanceData = this.houseRenderer.generateHouseInstance(
                        worldCellCenterPos,
                        plotGroundY,
                        rotationY,
                        baseScaleFactor
                    );
                    
                    // Ajouter chaque partie directement à InstanceDataManager
                    for (const partName in houseInstanceData) {
                        const matrices = houseInstanceData[partName];
                        matrices.forEach(matrix => {
                            instanceDataManager.addData('house', partName, matrix);
                        });
                    }
                }

                // Enregistrement pour la logique des citoyens
                const regPos = new THREE.Vector3(cx, sidewalkHeight, cz);
                const reg = cityManager.registerBuildingInstance(plot.id, 'house', regPos);
                if (reg) plot.addBuildingInstance({ id: reg.id, type: 'house', position: regPos.clone() });
            }
        }
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