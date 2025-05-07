// src/World/Strategies/BuildingPlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

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
         
         // Ratio de commerces à placer (1 commerce sur X bâtiments)
         this.commercialRatio = 6; // 1 commerce pour 6 emplacements total
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
				// === on skippe tout ce qui n'est pas en bordure ===
				if (rowIndex > 0 && rowIndex < numItemsY - 1 && colIndex > 0 && colIndex < numItemsX - 1) {
					continue;
				}
				
				positionCounter++;
                
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