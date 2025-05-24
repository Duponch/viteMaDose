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
     * Sélectionne environ un quartier sur 4 qui aura un cinéma, en s'assurant qu'ils soient bien espacés.
     * @param {Array<District>} districts - Liste des districts de la ville.
     */
    selectPlotsForMovieTheater(districts) {
        // Filtrer les quartiers éligibles (non industriels)
        const eligibleDistricts = districts.filter(district => district.type !== 'industrial');
        
        if (eligibleDistricts.length === 0) {
            console.log('MovieTheaterManager: Aucun quartier éligible pour les cinémas');
            return;
        }

        // Calculer le centre de chaque quartier éligible
        const districtsWithCenters = eligibleDistricts.map(district => {
            let totalX = 0, totalZ = 0, plotCount = 0;
            
            district.plots.forEach(plot => {
                totalX += plot.x + plot.width / 2;
                totalZ += plot.z + plot.depth / 2;
                plotCount++;
            });
            
            return {
                district: district,
                center: {
                    x: totalX / plotCount,
                    z: totalZ / plotCount
                }
            };
        });

        // Sélectionner les quartiers en s'assurant qu'ils soient bien espacés
        const selectedDistricts = this._selectWellSpacedDistricts(districtsWithCenters);
        
        // Pour chaque quartier sélectionné, choisir une parcelle éligible
        selectedDistricts.forEach(districtWithCenter => {
            const district = districtWithCenter.district;
            
            // Filtrer les parcelles éligibles pour les cinémas (UNIQUEMENT les immeubles)
            const eligiblePlots = district.plots.filter(plot => 
                plot.zoneType === 'building'
            );

            if (eligiblePlots.length === 0) {
                console.warn(`MovieTheaterManager: Aucune parcelle d'immeuble éligible dans le quartier ${district.id}`);
                return; // Pas de parcelles éligibles dans ce quartier
            }

            // Sélectionner une parcelle aléatoire parmi les éligibles
            const selectedPlotIndex = Math.floor(Math.random() * eligiblePlots.length);
            const selectedPlot = eligiblePlots[selectedPlotIndex];
            
            // Marquer cette parcelle comme devant avoir un cinéma
            this.plotsWithMovieTheater.add(selectedPlot.id);
        });

        console.log(`MovieTheaterManager: ${this.plotsWithMovieTheater.size} parcelles sélectionnées pour avoir un cinéma (${selectedDistricts.length} quartiers sur ${eligibleDistricts.length} éligibles)`);
    }

    /**
     * Sélectionne des quartiers bien espacés pour placer les cinémas.
     * Utilise un algorithme glouton pour maximiser la distance entre les quartiers sélectionnés.
     * @param {Array<{district: District, center: {x: number, z: number}}>} districtsWithCenters - Quartiers avec leurs centres calculés.
     * @returns {Array<{district: District, center: {x: number, z: number}}>} - Quartiers sélectionnés.
     * @private
     */
    _selectWellSpacedDistricts(districtsWithCenters) {
        if (districtsWithCenters.length === 0) return [];
        
        // Nombre cible de cinémas : environ 1 quartier sur 4, minimum 1, MAXIMUM 3
        const rawTargetCount = Math.max(1, Math.floor(districtsWithCenters.length / 4));
        const targetCount = Math.min(3, rawTargetCount); // Limiter à 3 cinémas maximum
        
        // Distance minimale entre les cinémas (ajustable selon la taille de la carte)
        const minDistanceBetweenCinemas = 150; // Distance en unités de la carte
        
        const selectedDistricts = [];
        const remainingDistricts = [...districtsWithCenters];
        
        // Sélectionner le premier quartier (celui le plus proche du centre de la carte ou aléatoire)
        const firstIndex = Math.floor(Math.random() * remainingDistricts.length);
        selectedDistricts.push(remainingDistricts[firstIndex]);
        remainingDistricts.splice(firstIndex, 1);
        
        // Sélectionner les quartiers suivants en s'assurant qu'ils soient suffisamment éloignés
        while (selectedDistricts.length < targetCount && remainingDistricts.length > 0) {
            let bestCandidate = null;
            let bestMinDistance = 0;
            let bestIndex = -1;
            
            // Pour chaque quartier restant, calculer sa distance minimale aux quartiers déjà sélectionnés
            for (let i = 0; i < remainingDistricts.length; i++) {
                const candidate = remainingDistricts[i];
                
                let minDistanceToSelected = Infinity;
                for (const selected of selectedDistricts) {
                    const distance = this._calculateDistance(candidate.center, selected.center);
                    minDistanceToSelected = Math.min(minDistanceToSelected, distance);
                }
                
                // Choisir le candidat qui est le plus loin de tous les quartiers déjà sélectionnés
                if (minDistanceToSelected > bestMinDistance) {
                    bestMinDistance = minDistanceToSelected;
                    bestCandidate = candidate;
                    bestIndex = i;
                }
            }
            
            // Si le meilleur candidat est suffisamment loin, le sélectionner
            if (bestCandidate && bestMinDistance >= minDistanceBetweenCinemas) {
                selectedDistricts.push(bestCandidate);
                remainingDistricts.splice(bestIndex, 1);
            } else {
                // Si aucun candidat n'est assez loin, prendre le plus éloigné disponible
                if (bestCandidate) {
                    selectedDistricts.push(bestCandidate);
                    remainingDistricts.splice(bestIndex, 1);
                } else {
                    break; // Plus de candidats disponibles
                }
            }
        }
        
        console.log(`MovieTheaterManager: Sélectionné ${selectedDistricts.length} quartiers bien espacés pour les cinémas (maximum 3 autorisés)`);
        return selectedDistricts;
    }

    /**
     * Calcule la distance euclidienne entre deux points.
     * @param {{x: number, z: number}} point1 - Premier point.
     * @param {{x: number, z: number}} point2 - Deuxième point.
     * @returns {number} - Distance entre les deux points.
     * @private
     */
    _calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dz = point1.z - point2.z;
        return Math.sqrt(dx * dx + dz * dz);
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
     * Sélectionne une position harmonieuse pour placer le cinéma par rapport aux autres bâtiments.
     * @param {number} numItemsX - Nombre d'éléments en X dans la grille.
     * @param {number} numItemsY - Nombre d'éléments en Y dans la grille.
     * @param {number} count - Nombre de positions à sélectionner (toujours 1).
     * @returns {Array<{x: number, y: number}>} - Position sélectionnée.
     */
    selectMovieTheaterPosition(numItemsX, numItemsY, count) {
        // Pour une parcelle d'immeubles, privilégier une position qui s'harmonise avec les autres bâtiments
        
        // Si la grille est petite (2x2 ou moins), utiliser une position centrale
        if (numItemsX <= 2 && numItemsY <= 2) {
            const centerX = Math.floor(numItemsX / 2);
            const centerY = Math.floor(numItemsY / 2);
            return [{x: centerX, y: centerY}];
        }
        
        // Pour des grilles plus grandes, privilégier une position qui crée une composition harmonieuse
        const positions = [];
        
        // Calculer des positions "golden ratio" pour une meilleure composition
        const goldenRatio = 0.618;
        
        // Positions basées sur la règle des tiers et le nombre d'or
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
        
        // Filtrer les positions valides (dans les limites de la grille)
        const validPositions = preferredPositions.filter(pos => 
            pos.x >= 0 && pos.x < numItemsX && pos.y >= 0 && pos.y < numItemsY
        );
        
        // Éliminer les doublons
        const uniquePositions = validPositions.filter((pos, index, array) => 
            array.findIndex(p => p.x === pos.x && p.y === pos.y) === index
        );
        
        // Sélectionner une position aléatoire parmi les positions harmonieuses
        if (uniquePositions.length > 0) {
            const randomIndex = Math.floor(Math.random() * uniquePositions.length);
            return [uniquePositions[randomIndex]];
        }
        
        // Fallback : position centrale
        const centerX = Math.floor(numItemsX / 2);
        const centerY = Math.floor(numItemsY / 2);
        return [{x: centerX, y: centerY}];
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