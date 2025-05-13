// src/World/Strategies/TreePlacementStrategy.js
import * as THREE from 'three';
import IZonePlacementStrategy from './IZonePlacementStrategy.js';

/**
 * @typedef {import('../Plot.js').default} Plot
 * @typedef {import('../Rendering/CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Rendering/InstanceDataManager.js').default} InstanceDataManager
 * @typedef {import('../CityManager.js').default} CityManager // Pas utilisé ici mais pour cohérence de signature
 */

/**
 * Stratégie spécifique pour placer les arbres sur les parcelles.
 * Place des arbres sur les trottoirs et dans les parcs selon des probabilités.
 */
export default class TreePlacementStrategy extends IZonePlacementStrategy {

    /**
     * Constructeur.
     * @param {object} config - La configuration globale.
     * @param {CityAssetLoader} assetLoader - Le gestionnaire d'assets.
     * @param {object} specificRenderers - Renderers spécialisés (non requis ici).
     * @param {Experience} experience - Référence à l'instance Experience.
     */
    constructor(config, assetLoader, specificRenderers, experience = null) {
        super(config, assetLoader, specificRenderers, experience);
    }

    /**
     * Méthode principale pour placer les arbres sur l'ensemble des parcelles fournies.
     * @param {Array<Plot>} plots - Tableau des parcelles finales.
     * @param {CityAssetLoader} assetLoader - Le chargeur d'assets pour obtenir les modèles d'arbres.
     * @param {InstanceDataManager} instanceDataManager - Pour enregistrer les matrices des arbres.
     */
    placeTrees(plots, assetLoader, instanceDataManager) {
        //console.log("TreePlacementStrategy: Placing trees...");
        // Vérifier si des assets d'arbres sont chargés
        if (!assetLoader || !assetLoader.assets.tree || assetLoader.assets.tree.length === 0) {
            console.warn("TreePlacementStrategy: No tree assets loaded, skipping tree placement.");
            return;
        }

        const probSidewalk = this.config.treePlacementProbabilitySidewalk ?? 0;
        const probPark = this.config.treePlacementProbabilityPark ?? 0;
        const sidewalkW = this.config.sidewalkWidth ?? 0;
        let treesPlaced = 0;

        plots.forEach(plot => {
            // 1. Placement sur les trottoirs (aux coins)
            if (sidewalkW > 0 && probSidewalk > 0) {
                const halfSidewalkW = sidewalkW / 2;
                const corners = [
                    // Coin Supérieur Gauche
                    { x: plot.x - halfSidewalkW, z: plot.z - halfSidewalkW },
                    // Coin Supérieur Droit
                    { x: plot.x + plot.width + halfSidewalkW, z: plot.z - halfSidewalkW },
                    // Coin Inférieur Gauche
                    { x: plot.x - halfSidewalkW, z: plot.z + plot.depth + halfSidewalkW },
                    // Coin Inférieur Droit
                    { x: plot.x + plot.width + halfSidewalkW, z: plot.z + plot.depth + halfSidewalkW }
                ];

                corners.forEach(corner => {
                    if (Math.random() < probSidewalk) {
                       if(this._addTreeInstance(corner.x, corner.z, assetLoader, instanceDataManager)) {
                           treesPlaced++;
                       }
                    }
                });
            }

            // 2. Placement dans les parcs
            if (plot.zoneType === 'park' && probPark > 0) {
                const plotBounds = {
                    minX: plot.x,
                    maxX: plot.x + plot.width,
                    minZ: plot.z,
                    maxZ: plot.z + plot.depth
                };
                const area = plot.width * plot.depth;
                // Calculer un nombre cible basé sur la surface et la probabilité
                const numTreesToTry = Math.ceil(area * probPark);

                for (let i = 0; i < numTreesToTry; i++) {
                    // Position aléatoire DANS la parcelle
                    const treeX = THREE.MathUtils.randFloat(plotBounds.minX, plotBounds.maxX);
                    const treeZ = THREE.MathUtils.randFloat(plotBounds.minZ, plotBounds.maxZ);
                    // Tenter d'ajouter l'arbre (peut échouer si aucun asset n'est trouvé)
                    if(this._addTreeInstance(treeX, treeZ, assetLoader, instanceDataManager)) {
                        treesPlaced++;
                    }
                }
            }
        }); // Fin boucle plots

        //console.log(`TreePlacementStrategy: ${treesPlaced} tree instances added.`);
    }

    /**
     * Méthode privée pour ajouter une instance d'arbre unique.
     * @param {number} treeX - Coordonnée X de l'arbre.
     * @param {number} treeZ - Coordonnée Z de l'arbre.
     * @param {CityAssetLoader} assetLoader - Le chargeur d'assets.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire de données d'instance.
     * @returns {boolean} true si l'ajout a réussi, false sinon.
     */
    _addTreeInstance(treeX, treeZ, assetLoader, instanceDataManager) {
        // Sélectionner un asset d'arbre en alternant entre les types
        // (au lieu de choisir aléatoirement parmi tous les arbres)
        const allTrees = assetLoader.assets.tree || [];
        if (allTrees.length === 0) {
            console.warn("TreePlacementStrategy: No tree assets available.");
            return false;
        }

        // Séparer les assets en deux groupes: arbres réguliers et sapins
        const regularTrees = allTrees.filter(tree => tree.treeType === 'regular');
        const firTrees = allTrees.filter(tree => tree.treeType === 'fir');
        
        // Vérifier qu'on a au moins un arbre de chaque type
        if (regularTrees.length === 0 || firTrees.length === 0) {
            console.warn("TreePlacementStrategy: Missing one of the tree types, using available type only.");
            // Si un type manque, utiliser le type disponible
            const availableTrees = regularTrees.length > 0 ? regularTrees : firTrees;
            const assetInfo = availableTrees[Math.floor(Math.random() * availableTrees.length)];
            return this._placeTreeAsset(treeX, treeZ, assetInfo, instanceDataManager);
        }
        
        // Alterner entre les deux types d'arbres avec une probabilité de 50%
        const useFirTree = Math.random() < 0.5;
        const treePool = useFirTree ? firTrees : regularTrees;
        
        // Choisir aléatoirement parmi le type sélectionné
        const assetInfo = treePool[Math.floor(Math.random() * treePool.length)];
        
        return this._placeTreeAsset(treeX, treeZ, assetInfo, instanceDataManager);
    }
    
    /**
     * Place un asset d'arbre spécifique aux coordonnées indiquées
     * @param {number} treeX - Coordonnée X de l'arbre
     * @param {number} treeZ - Coordonnée Z de l'arbre
     * @param {object} assetInfo - Information sur l'asset d'arbre
     * @param {InstanceDataManager} instanceDataManager - Gestionnaire des instances
     * @returns {boolean} true si l'ajout a réussi, false sinon
     */
    _placeTreeAsset(treeX, treeZ, assetInfo, instanceDataManager) {
        if (!assetInfo) {
            console.warn("TreePlacementStrategy: Invalid tree asset info.");
            return false;
        }
        
        if (!assetInfo.sizeAfterFitting || !assetInfo.centerOffset || !assetInfo.fittingScaleFactor || !assetInfo.id) {
            console.error(`TreePlacementStrategy: Tree asset data (ID: ${assetInfo.id}) is incomplete or invalid.`);
            return false;
        }

        // Échelle et rotation aléatoires
        const randomScaleMultiplier = THREE.MathUtils.randFloat(0.85, 1.15);
        const finalUserScale = (assetInfo.userScale ?? 1.0) * randomScaleMultiplier; // Utiliser userScale de l'asset
        const randomRotationY = Math.random() * Math.PI * 2;
        const plotGroundY = this.config.plotGroundY ?? 0.005;

        // Si l'asset a des parts, on doit gérer chaque partie séparément
        if (assetInfo.parts && assetInfo.parts.length > 0) {
            // Pour chaque partie, créer une matrice d'instance
            assetInfo.parts.forEach((part, index) => {
                const instanceMatrix = this.calculateInstanceMatrix(
                    treeX,
                    treeZ,
                    assetInfo.sizeAfterFitting.y,
                    assetInfo.fittingScaleFactor,
                    assetInfo.centerOffset,
                    finalUserScale,
                    randomRotationY,
                    plotGroundY
                );

                // Utiliser l'ID de l'asset original pour toutes les parties
                instanceDataManager.addData('tree', assetInfo.id, instanceMatrix);
            });
            return true;
        }

        // Si l'asset n'a pas de parts, on le traite comme avant
        const instanceMatrix = this.calculateInstanceMatrix(
            treeX,
            treeZ,
            assetInfo.sizeAfterFitting.y,
            assetInfo.fittingScaleFactor,
            assetInfo.centerOffset,
            finalUserScale,
            randomRotationY,
            plotGroundY
        );

        // Ajouter les données
        instanceDataManager.addData('tree', assetInfo.id, instanceMatrix);
        return true; // Ajout réussi
    }

    /**
     * Implémentation nécessaire à cause de l'héritage, mais non utilisée directement
     * pour le placement des arbres qui se fait via la méthode `placeTrees`.
     * @param {Plot} plot
     * @param {InstanceDataManager} instanceDataManager
     * @param {CityManager} cityManager
     * @param {number} groundLevel
     */
    populatePlot(plot, instanceDataManager, cityManager, groundLevel) {
        // Cette méthode n'est pas destinée à être appelée directement pour les arbres.
        // La logique est dans `placeTrees`.
        // console.warn("TreePlacementStrategy.populatePlot() called directly - this should likely be done via placeTrees().");
    }
}