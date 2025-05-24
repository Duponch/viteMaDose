import * as THREE from 'three';

/**
 * @typedef {import('./District.js').default} District
 * @typedef {import('./Plot.js').default} Plot
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('./CityManager.js').default} CityManager
 */

export default class MovieTheaterManager {
    /**
     * Gère le placement des cinémas dans la ville.
     * Assure qu'un seul cinéma soit présent par quartier.
     * @param {object} config - Configuration globale.
     */
    constructor(config) {
        this.config = config;
        // Taille légèrement plus grande que les commerces pour les cinémas
        this.movieTheaterScaleFactor = 1.0;
        
        // Liste des parcelles qui auront un cinéma
        this.plotsWithMovieTheater = new Set();
    }

    /**
     * Analyse les quartiers et les parcelles pour déterminer où placer les cinémas.
     * Sélectionne une parcelle par quartier qui aura un cinéma.
     * @param {Array<District>} districts - Liste des districts de la ville.
     */
    selectPlotsForMovieTheater(districts) {
        districts.forEach(district => {
            // On ignore les districts industriels qui n'ont pas de cinémas
            if (district.type === 'industrial') {
                return;
            }

            // Filtrer les parcelles éligibles pour les cinémas (maisons et immeubles)
            const eligiblePlots = district.plots.filter(plot => 
                plot.zoneType === 'house' || plot.zoneType === 'building'
            );

            if (eligiblePlots.length === 0) {
                return; // Pas de parcelles éligibles dans ce quartier
            }

            // Sélectionner une parcelle aléatoire parmi les éligibles
            const selectedPlotIndex = Math.floor(Math.random() * eligiblePlots.length);
            const selectedPlot = eligiblePlots[selectedPlotIndex];
            
            // Marquer cette parcelle comme devant avoir un cinéma
            this.plotsWithMovieTheater.add(selectedPlot.id);
        });

        console.log(`MovieTheaterManager: ${this.plotsWithMovieTheater.size} parcelles sélectionnées pour avoir un cinéma`);
    }
    
    /**
     * Vérifie si une parcelle doit avoir un cinéma.
     * @param {Plot} plot - La parcelle à vérifier.
     * @returns {boolean} - True si la parcelle doit avoir un cinéma, false sinon.
     */
    shouldPlotHaveMovieTheater(plot) {
        return this.plotsWithMovieTheater.has(plot.id);
    }
    
    /**
     * Calcule le nombre de cinémas à placer dans une parcelle.
     * Un seul cinéma par parcelle sélectionnée.
     * @param {number} totalPositions - Nombre total d'emplacements dans la parcelle.
     * @returns {number} - Nombre de cinémas à placer (toujours 1).
     */
    getMovieTheaterCount(totalPositions) {
        return 1; // Un seul cinéma par parcelle
    }
    
    /**
     * Sélectionne une position centrale ou visible pour placer le cinéma.
     * @param {number} numItemsX - Nombre d'éléments en X dans la grille.
     * @param {number} numItemsY - Nombre d'éléments en Y dans la grille.
     * @param {number} count - Nombre de positions à sélectionner (toujours 1).
     * @returns {Array<{x: number, y: number}>} - Position sélectionnée.
     */
    selectMovieTheaterPosition(numItemsX, numItemsY, count) {
        // Préférer une position sur le périmètre pour la visibilité
        const perimeterPositions = [];
        
        // Bordure supérieure et inférieure
        for (let x = 0; x < numItemsX; x++) {
            perimeterPositions.push({x, y: 0});
            if (numItemsY > 1) {
                perimeterPositions.push({x, y: numItemsY - 1});
            }
        }
        
        // Bordures gauche et droite (sans les coins qui sont déjà inclus)
        for (let y = 1; y < numItemsY - 1; y++) {
            perimeterPositions.push({x: 0, y});
            if (numItemsX > 1) {
                perimeterPositions.push({x: numItemsX - 1, y});
            }
        }
        
        // Si pas de positions de périmètre disponibles, utiliser le centre
        if (perimeterPositions.length === 0) {
            const centerX = Math.floor(numItemsX / 2);
            const centerY = Math.floor(numItemsY / 2);
            return [{x: centerX, y: centerY}];
        }
        
        // Sélectionner une position aléatoire sur le périmètre
        const randomIndex = Math.floor(Math.random() * perimeterPositions.length);
        return [perimeterPositions[randomIndex]];
    }
    
    /**
     * Place un cinéma sur une parcelle selon une grille définie.
     * @param {Plot} plot - La parcelle sur laquelle placer le cinéma.
     * @param {object} gridInfo - Informations sur la grille (numItemsX, numItemsY, gapX, gapZ).
     * @param {number} targetBuildingWidth - Largeur cible des bâtiments.
     * @param {number} targetBuildingDepth - Profondeur cible des bâtiments.
     * @param {number} minSpacing - Espacement minimal entre les bâtiments.
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des données d'instance.
     * @param {CityManager} cityManager - Gestionnaire de la ville.
     * @param {number} groundLevel - Hauteur du sol.
     * @param {MovieTheaterPlacementStrategy} movieTheaterStrategy - Stratégie de placement de cinéma (optionnel).
     * @returns {Array<{x: number, y: number}>} - Position du cinéma placé.
     */
    placeMovieTheaterOnGrid(plot, gridInfo, targetBuildingWidth, targetBuildingDepth, minSpacing, instanceDataManager, cityManager, groundLevel, movieTheaterStrategy = null) {
        const { numItemsX, numItemsY, gapX, gapZ } = gridInfo;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;
        
        // Sélectionner une position pour le cinéma
        const movieTheaterPositions = this.selectMovieTheaterPosition(numItemsX, numItemsY, 1);
        
        // Placer le cinéma
        movieTheaterPositions.forEach(pos => {
            const { x: colIndex, y: rowIndex } = pos;
            
            // Calculer le centre de la cellule
            const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
            const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
            const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
            
            // Déterminer la rotation avec une logique orientée vers l'extérieur
            let targetRotationY;
            
            if (movieTheaterStrategy) {
                // Utiliser la stratégie de cinéma pour déterminer l'orientation
                targetRotationY = movieTheaterStrategy.determineOrientationTowardsSidewalk(
                    cellCenterX, 
                    cellCenterZ, 
                    plot, 
                    this.config.sidewalkWidth ?? 0, 
                    rowIndex, 
                    colIndex, 
                    numItemsX, 
                    numItemsY
                );
                
                // Ajouter un helper de façade si disponible
                if (movieTheaterStrategy.facadeHelper) {
                    const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
                    movieTheaterStrategy.facadeHelper.addFacadeHelper(
                        buildingPosition, 
                        targetRotationY, 
                        targetBuildingWidth, 
                        targetBuildingDepth
                    );
                }
            } else {
                // Fallback: orientation fixe par défaut si pas de stratégie
                targetRotationY = Math.PI * 0.5 * Math.floor(Math.random() * 4);
            }
            
            // Créer la matrice pour l'instance de cinéma
            const matrix = new THREE.Matrix4();
            matrix.compose(
                worldCellCenterPos,
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotationY, 0)),
                new THREE.Vector3(this.movieTheaterScaleFactor, this.movieTheaterScaleFactor, this.movieTheaterScaleFactor)
            );
            
            // Ajouter les données d'instance
            instanceDataManager.addData('movietheater', 'default', matrix);
            
            // Enregistrer l'instance auprès du CityManager
            const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
            const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'movietheater', buildingPosition);
            
            if (registeredBuilding) {
                plot.addBuildingInstance({
                    id: registeredBuilding.id,
                    type: 'movietheater',
                    position: buildingPosition.clone()
                });
            }
        });
        
        return movieTheaterPositions;
    }
} 