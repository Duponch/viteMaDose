// src/World/Strategies/IZonePlacementStrategy.js
import * as THREE from 'three';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager
 * @typedef {import('../../../Experience.js').default} Experience
 */

/**
 * Classe de base (simulant une interface) pour les stratégies de placement de contenu sur une parcelle.
 * Chaque stratégie concrète (pour maison, immeuble, parc, etc.) doit hériter de cette classe
 * et implémenter la méthode `populatePlot`.
 */
export default class IZonePlacementStrategy {

    /**
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {object} specificRenderers - Un objet contenant les renderers spécialisés (houseRenderer, etc.).
     * @param {Experience} experience - Référence à l'instance Experience (optionnel, si nécessaire).
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        if (this.constructor === IZonePlacementStrategy) {
            throw new Error("IZonePlacementStrategy is an abstract class and cannot be instantiated directly.");
        }
        this.config = config;
        this.assetLoader = assetLoader;
        this.renderers = specificRenderers; // e.g., { houseRenderer, buildingRenderer, ... }
        this.experience = experience;
        // Vous pouvez ajouter ici des propriétés ou méthodes communes à toutes les stratégies si besoin.
    }

    /**
     * Méthode principale pour peupler une parcelle avec du contenu spécifique à la zone.
     * Cette méthode DOIT être implémentée par les classes filles.
     *
     * @param {Plot} plot - La parcelle à peupler.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire pour stocker les données d'instance générées.
     * @param {CityManager} cityManager - Le gestionnaire de la ville pour enregistrer les bâtiments.
     * @param {number} groundLevel - La hauteur Y du sol de la parcelle.
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        throw new Error(`Method 'populatePlot()' must be implemented by subclass ${this.constructor.name}.`);
    }

    /**
     * Méthode utilitaire (optionnelle) pour calculer la matrice d'instance finale.
     * Peut être partagée ou spécifique à chaque stratégie si les calculs diffèrent.
     * @param {number} centerX - Coordonnée X du centre de l'instance.
     * @param {number} centerZ - Coordonnée Z du centre de l'instance.
     * @param {number} heightAfterFitting - Hauteur de l'asset après mise à l'échelle de base.
     * @param {number} fittingScaleFactor - Facteur d'échelle pour adapter l'asset aux dimensions de base.
     * @param {THREE.Vector3} centerOffset - Décalage du centre géométrique de l'asset.
     * @param {number} userScale - Échelle supplémentaire appliquée par l'utilisateur/configuration.
     * @param {number} [rotationY=0] - Rotation autour de l'axe Y.
     * @param {number} [yLevelOffset=0] - Décalage vertical supplémentaire (ex: plotGroundY).
     * @returns {THREE.Matrix4} La matrice de transformation finale pour l'instance.
     */
    calculateInstanceMatrix(centerX, centerZ, heightAfterFitting, fittingScaleFactor, centerOffset, userScale, rotationY = 0, yLevelOffset = 0) {
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = fittingScaleFactor * userScale;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY);

        // L'offset doit être appliqué AVANT la mise à l'échelle pour centrer le modèle d'origine
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -centerOffset.x,
            -centerOffset.y, // Centrage vertical initial
            -centerOffset.z
        );

        // Calculer la position Y finale
        const finalHeight = heightAfterFitting * userScale;
        const finalY = finalHeight / 2 + yLevelOffset; // Centre vertical + décalage du sol

        const finalTranslationMatrix = new THREE.Matrix4().makeTranslation(centerX, finalY, centerZ);

        // Ordre: Scale -> Recenter -> Rotate -> Translate
        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix); // Applique d'abord le recentrage, puis l'échelle
        instanceMatrix.premultiply(rotationMatrix);                    // Applique la rotation
        instanceMatrix.premultiply(finalTranslationMatrix);            // Applique la translation finale

        return instanceMatrix;
    }

     /**
      * Détermine la rotation cible pour un bâtiment en fonction de sa position dans la parcelle.
      * Vise à orienter la "façade" (souvent le côté le plus proche d'un bord) vers l'extérieur.
      * @param {number} cellCenterX - Position X du centre de la cellule/bâtiment.
      * @param {number} cellCenterZ - Position Z du centre de la cellule/bâtiment.
      * @param {Plot} plot - La parcelle contenant la cellule.
      * @returns {number} L'angle de rotation Y en radians.
      */
     determineBuildingRotation(cellCenterX, cellCenterZ, plot) {
        const distToLeft = cellCenterX - plot.x;
        const distToRight = (plot.x + plot.width) - cellCenterX;
        const distToTop = cellCenterZ - plot.z; // Note: Z augmente vers le bas dans la config Three.js typique
        const distToBottom = (plot.z + plot.depth) - cellCenterZ;

        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        let targetRotationY = 0;
        const tolerance = 0.1; // Tolérance pour la comparaison des distances

        // Trouver quel bord est le plus proche
        if (Math.abs(minDist - distToLeft) < tolerance)
            targetRotationY = -Math.PI / 2; // Façade vers la gauche (-X)
        else if (Math.abs(minDist - distToRight) < tolerance)
            targetRotationY = Math.PI / 2;  // Façade vers la droite (+X)
        else if (Math.abs(minDist - distToTop) < tolerance)
            targetRotationY = 0; // Façade vers le haut (-Z)
        else if (Math.abs(minDist - distToBottom) < tolerance)
            targetRotationY = Math.PI;      // Façade vers le bas (+Z)

        return targetRotationY;
    }

    /**
     * Calcule le nombre d'éléments et l'espacement pour un placement en grille.
     * @param {Plot} plot - La parcelle.
     * @param {number} itemWidth - Largeur de l'élément à placer.
     * @param {number} itemDepth - Profondeur de l'élément à placer.
     * @param {number} minSpacing - Espacement minimum entre les éléments.
     * @returns {object|null} Un objet { numItemsX, numItemsY, gapX, gapZ } ou null si placement impossible.
     */
    calculateGridPlacement(plot, itemWidth, itemDepth, minSpacing) {
        if (itemWidth <= 0.01 || itemDepth <= 0.01) {
            console.warn(`Placement impossible pour Plot ${plot.id}: dimensions d'item invalides (${itemWidth}x${itemDepth})`);
            return null;
        }

        minSpacing = Math.max(0, minSpacing); // Assurer un espacement non négatif

        let numItemsX = 0;
        const itemPlusSpacingX = itemWidth + minSpacing;
        // Vérifier si la parcelle peut contenir au moins un item en largeur
        if (plot.width >= itemWidth) {
            // Si l'espacement est significatif, calculer avec l'espacement
            numItemsX = (itemPlusSpacingX > 0.01)
                ? Math.floor((plot.width + minSpacing) / itemPlusSpacingX) // Formule corrigée pour la grille
                : Math.floor(plot.width / itemWidth); // Cas où l'espacement est quasi nul
            // Assurer au moins 1 si la largeur le permettait initialement
            if (numItemsX === 0) numItemsX = 1;
        }

        let numItemsY = 0;
        const itemPlusSpacingY = itemDepth + minSpacing;
         // Vérifier si la parcelle peut contenir au moins un item en profondeur
        if (plot.depth >= itemDepth) {
             // Si l'espacement est significatif, calculer avec l'espacement
            numItemsY = (itemPlusSpacingY > 0.01)
                ? Math.floor((plot.depth + minSpacing) / itemPlusSpacingY) // Formule corrigée pour la grille
                : Math.floor(plot.depth / itemDepth); // Cas où l'espacement est quasi nul
             // Assurer au moins 1 si la profondeur le permettait initialement
            if (numItemsY === 0) numItemsY = 1;
        }

        // S'il est impossible de placer même une seule rangée/colonne
        if (numItemsX === 0 || numItemsY === 0) {
             console.warn(`Placement impossible pour Plot ${plot.id}: pas assez d'espace pour ${numItemsX}x${numItemsY} items (${itemWidth}x${itemDepth} + spacing ${minSpacing}) dans ${plot.width}x${plot.depth}`);
             return null;
        }

        // calcul de l'espace occupé par les items + espacement minimal
		const totalUsedWidth = numItemsX * itemWidth + (numItemsX - 1) * minSpacing;
		const totalUsedDepth = numItemsY * itemDepth + (numItemsY - 1) * minSpacing;

		// moitié de l'espace restant : c'est la marge qu'on applique en début de grille
		const gapX = Math.max(0, (plot.width  - totalUsedWidth ) / 2);
		const gapZ = Math.max(0, (plot.depth  - totalUsedDepth) / 2);

        return { numItemsX, numItemsY, gapX, gapZ };
    }
}