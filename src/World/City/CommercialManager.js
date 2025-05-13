import * as THREE from 'three';
import CommercialOpeningHoursStrategy from '../Strategies/CommercialOpeningHoursStrategy.js';

/**
 * @typedef {import('./District.js').default} District
 * @typedef {import('./Plot.js').default} Plot
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('./CityManager.js').default} CityManager
 */

export default class CommercialManager {
    /**
     * Gère le placement des bâtiments commerciaux dans la ville.
     * Assure qu'un seul bâtiment commercial soit présent par quartier.
     * @param {object} config - Configuration globale.
     */
    constructor(config) {
        this.config = config;
        // Taille réduite pour les commerces
        this.commercialScaleFactor = 0.8;
        
        // Liste des parcelles qui auront un commerce
        this.plotsWithCommercial = new Set();
        
        // Stratégie des horaires d'ouverture des commerces (par défaut 8h-21h 7j/7)
        this.openingHoursStrategy = new CommercialOpeningHoursStrategy();
    }

    /**
     * Analyse les quartiers et les parcelles pour déterminer où placer les commerces.
     * Sélectionne une parcelle par quartier qui aura un commerce.
     * @param {Array<District>} districts - Liste des districts de la ville.
     */
    selectPlotsForCommercial(districts) {
        districts.forEach(district => {
            // On ignore les districts industriels qui n'ont pas de commerces
            if (district.type === 'industrial') {
                return;
            }

            // Filtrer les parcelles éligibles pour les commerces (maisons et immeubles)
            const eligiblePlots = district.plots.filter(plot => 
                plot.zoneType === 'house' || plot.zoneType === 'building'
            );

            if (eligiblePlots.length === 0) {
                return; // Pas de parcelles éligibles dans ce quartier
            }

            // Sélectionner une parcelle aléatoire parmi les éligibles
            const selectedPlotIndex = Math.floor(Math.random() * eligiblePlots.length);
            const selectedPlot = eligiblePlots[selectedPlotIndex];
            
            // Marquer cette parcelle comme devant avoir un commerce
            this.plotsWithCommercial.add(selectedPlot.id);
        });

        //console.log(`CommercialManager: ${this.plotsWithCommercial.size} parcelles sélectionnées pour avoir un commerce`);
    }
    
    /**
     * Vérifie si une parcelle doit avoir un commerce.
     * @param {Plot} plot - La parcelle à vérifier.
     * @returns {boolean} - True si la parcelle doit avoir un commerce, false sinon.
     */
    shouldPlotHaveCommercial(plot) {
        return this.plotsWithCommercial.has(plot.id);
    }
    
    /**
     * Calcule le nombre de commerces à placer dans une parcelle.
     * Utilise le ratio 1/6 (1 commerce pour 6 emplacements).
     * @param {number} totalPositions - Nombre total d'emplacements dans la parcelle.
     * @returns {number} - Nombre de commerces à placer.
     */
    getCommercialCount(totalPositions) {
        return Math.max(1, Math.floor(totalPositions / 6));
    }
    
    /**
     * Sélectionne aléatoirement des positions pour placer des commerces dans la grille.
     * @param {number} numItemsX - Nombre d'éléments en X dans la grille.
     * @param {number} numItemsY - Nombre d'éléments en Y dans la grille.
     * @param {number} count - Nombre de positions à sélectionner.
     * @returns {Array<{x: number, y: number}>} - Positions sélectionnées.
     */
    selectRandomPositions(numItemsX, numItemsY, count) {
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
    
    /**
     * Compte le nombre de positions disponibles autour du périmètre.
     * @param {number} numItemsX - Nombre d'éléments en X dans la grille.
     * @param {number} numItemsY - Nombre d'éléments en Y dans la grille.
     * @returns {number} - Nombre de positions disponibles.
     */
    countAvailablePositions(numItemsX, numItemsY) {
        if (numItemsX <= 2 || numItemsY <= 2) {
            // Petites parcelles: tous les emplacements sont sur le périmètre
            return numItemsX * numItemsY;
        }
        // Sinon on compte uniquement le périmètre
        return 2 * numItemsX + 2 * (numItemsY - 2);
    }
    
    /**
     * Place des commerces sur une parcelle selon une grille définie.
     * @param {Plot} plot - La parcelle sur laquelle placer les commerces.
     * @param {object} gridInfo - Informations sur la grille (numItemsX, numItemsY, gapX, gapZ).
     * @param {number} targetBuildingWidth - Largeur cible des bâtiments.
     * @param {number} targetBuildingDepth - Profondeur cible des bâtiments.
     * @param {number} minSpacing - Espacement minimal entre les bâtiments.
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des données d'instance.
     * @param {CityManager} cityManager - Gestionnaire de la ville.
     * @param {number} groundLevel - Hauteur du sol.
     * @returns {Array<{x: number, y: number}>} - Positions des commerces placés.
     */
    placeCommercialsOnGrid(plot, gridInfo, targetBuildingWidth, targetBuildingDepth, minSpacing, instanceDataManager, cityManager, groundLevel) {
        const { numItemsX, numItemsY, gapX, gapZ } = gridInfo;
        const plotGroundY = this.config.plotGroundY ?? 0.005;
        const sidewalkHeight = this.config.sidewalkHeight ?? 0.2;
        
        // Calculer le nombre total d'emplacements disponibles
        const totalPositions = this.countAvailablePositions(numItemsX, numItemsY);
        
        // Calculer le nombre de commerces à placer
        const commercialCount = this.getCommercialCount(totalPositions);
        
        // Sélectionner des positions aléatoires pour les commerces
        const commercialPositions = this.selectRandomPositions(numItemsX, numItemsY, commercialCount);
        
        // Placer les commerces
        commercialPositions.forEach(pos => {
            const { x: colIndex, y: rowIndex } = pos;
            
            // Calculer le centre de la cellule
            const cellCenterX = plot.x + gapX + (colIndex * (targetBuildingWidth + minSpacing)) + targetBuildingWidth / 2;
            const cellCenterZ = plot.z + gapZ + (rowIndex * (targetBuildingDepth + minSpacing)) + targetBuildingDepth / 2;
            const worldCellCenterPos = new THREE.Vector3(cellCenterX, groundLevel, cellCenterZ);
            
            // Déterminer la rotation (à adapter selon la logique existante)
            const targetRotationY = Math.PI * 0.5 * Math.floor(Math.random() * 4); // Rotation aléatoire
            
            // Créer la matrice pour l'instance commerciale
            const matrix = new THREE.Matrix4();
            matrix.compose(
                worldCellCenterPos,
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotationY, 0)),
                new THREE.Vector3(this.commercialScaleFactor, this.commercialScaleFactor, this.commercialScaleFactor)
            );
            
            // Ajouter les données d'instance
            instanceDataManager.addData('commercial', 'default', matrix);
            
            // Enregistrer l'instance auprès du CityManager
            const buildingPosition = new THREE.Vector3(cellCenterX, sidewalkHeight, cellCenterZ);
            const registeredBuilding = cityManager.registerBuildingInstance(plot.id, 'commercial', buildingPosition);
            
            if (registeredBuilding) {
                plot.addBuildingInstance({
                    id: registeredBuilding.id,
                    type: 'commercial',
                    position: buildingPosition.clone()
                });
            }
        });
        
        return commercialPositions;
    }

    /**
     * Vérifie si les commerces sont ouverts à une date et heure donnée
     * @param {Object} calendarDate - Informations du calendrier
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {boolean} - True si les commerces sont ouverts
     */
    areCommercialsOpen(calendarDate, currentHour) {
        return this.openingHoursStrategy.isOpen(calendarDate, currentHour);
    }
    
    /**
     * Obtient le statut actuel des commerces (ouvert/fermé)
     * @param {Object} calendarDate - Informations du calendrier
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {string} - "Ouvert" ou "Fermé"
     */
    getCommercialsStatus(calendarDate, currentHour) {
        return this.openingHoursStrategy.getStatus(calendarDate, currentHour);
    }
    
    /**
     * Calcule le nombre d'heures avant la prochaine ouverture des commerces
     * @param {Object} calendarDate - Informations du calendrier
     * @param {number} currentHour - Heure actuelle (0-23)
     * @returns {number} - Nombre d'heures
     */
    getHoursUntilCommercialOpen(calendarDate, currentHour) {
        return this.openingHoursStrategy.hoursUntilOpen(calendarDate, currentHour);
    }
} 