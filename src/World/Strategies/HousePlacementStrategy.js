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
        
        // Ratio de commerces à placer (1 commerce sur X bâtiments)
        this.commercialRatio = 6; // 1 commerce pour 6 emplacements total
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

        // Calculer le nombre total d'emplacements
        const totalPositions = this._countAvailablePositions(numItemsX, numItemsY);
        
        // Calculer le nombre de commerces à placer
        const commercialCount = Math.max(1, Math.floor(totalPositions / this.commercialRatio));
        
        // Sélectionner des positions aléatoires pour les commerces
        const commercialPositions = this._selectRandomPositions(numItemsX, numItemsY, commercialCount);
        
        // Taille réduite pour les commerces
        const commercialScaleFactor = baseScaleFactor * 0.8;

        let positionCounter = 0;
        for (let rowIndex = 0; rowIndex < numItemsY; rowIndex++) {
            for (let colIndex = 0; colIndex < numItemsX; colIndex++) {
				// === ne garder que la périphérie ===
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}
                
                positionCounter++;
                
                // Calculer le centre de la cellule de la grille
                const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
                const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
                const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);

                // Déterminer la rotation
                const targetRotationY = this.determineBuildingRotation(cellCenterX, cellCenterZ, plot);
                
                // Vérifier si cette position doit être un commerce
                const isCommercial = commercialPositions.some(pos => 
                    pos.x === colIndex && pos.y === rowIndex);
                
                if (isCommercial) {
                    // Créer un bâtiment commercial
                    const matrix = new THREE.Matrix4();
                    matrix.compose(
                        worldCellCenterPos,
                        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotationY, 0)),
                        new THREE.Vector3(commercialScaleFactor, commercialScaleFactor, commercialScaleFactor)
                    );
                    
                    // Ajouter les données d'instance pour un commerce
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
                    
                    continue; // Passer à la position suivante
                }

                // Sinon, générer les données d'instance pour une maison
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
    
    /**
     * Compte le nombre de positions disponibles autour du périmètre
     * @param {number} numItemsX - Nombre d'éléments en X
     * @param {number} numItemsY - Nombre d'éléments en Y
     * @returns {number} - Nombre de positions disponibles
     * @private
     */
    _countAvailablePositions(numItemsX, numItemsY) {
        if (numItemsX <= 2 || numItemsY <= 2) {
            // Petites parcelles: tous les emplacements sont sur le périmètre
            return numItemsX * numItemsY;
        }
        // Sinon on compte uniquement le périmètre
        return 2 * numItemsX + 2 * (numItemsY - 2);
    }
    
    /**
     * Sélectionne aléatoirement des positions autour du périmètre
     * @param {number} numItemsX - Nombre d'éléments en X
     * @param {number} numItemsY - Nombre d'éléments en Y
     * @param {number} count - Nombre de positions à sélectionner
     * @returns {Array<{x: number, y: number}>} - Positions sélectionnées
     * @private
     */
    _selectRandomPositions(numItemsX, numItemsY, count) {
        const positions = [];
        
        // Générer toutes les positions de périmètre disponibles
        const allPositions = [];
        
        // Bordure supérieure et inférieure
        for (let x = 0; x < numItemsX; x++) {
            allPositions.push({x, y: 0});
            allPositions.push({x, y: numItemsY - 1});
        }
        
        // Bordures gauche et droite (sans les coins qui sont déjà inclus)
        for (let y = 1; y < numItemsY - 1; y++) {
            allPositions.push({x: 0, y});
            allPositions.push({x: numItemsX - 1, y});
        }
        
        // Sélectionner aléatoirement count positions
        const selectedCount = Math.min(count, allPositions.length);
        
        // Mélanger le tableau
        for (let i = allPositions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
        }
        
        // Prendre les premières count positions
        return allPositions.slice(0, selectedCount);
    }
}