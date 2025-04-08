import * as THREE from 'three';
import Plot from './Plot.js'; // Assurez-vous que le chemin est correct

export default class CityLayoutGenerator {
    constructor(config) {
        // config contient { roadWidth, minPlotSize, maxPlotSize, maxRecursionDepth,
        //                  parkProbability, industrialZoneProbability, houseZoneProbability }
        this.config = config;
        this.plots = [];
        this.leafPlots = []; // Contiendra les parcelles finales utilisables
        this.rootPlot = null;
        this.nextPlotId = 0;
        console.log("CityLayoutGenerator initialisé.");
    }

    /**
     * Génère la structure des parcelles de la ville.
     * @param {number} mapSize - La taille totale de la carte (largeur et profondeur).
     * @returns {Array<Plot>} La liste des parcelles finales (feuilles) utilisables.
     */
    generateLayout(mapSize) {
        this.reset();
        console.log("Génération du layout par subdivision...");

        this.rootPlot = new Plot(
            this.nextPlotId++,
            -mapSize / 2, -mapSize / 2, // Position du coin supérieur gauche
            mapSize, mapSize            // Dimensions
        );
        this.plots.push(this.rootPlot);

        // Lancer la subdivision récursive
        this.subdividePlot(this.rootPlot, 0);

        // Collecter les parcelles feuilles et leur assigner un type
        this.collectLeafPlots(this.rootPlot);

        console.log(`Layout terminé: ${this.leafPlots.length} parcelles finales utilisables générées.`);
        return this.leafPlots;
    }

    /**
     * Réinitialise l'état du générateur de layout.
     */
    reset() {
        this.plots = [];
        this.leafPlots = [];
        this.rootPlot = null;
        this.nextPlotId = 0;
        // console.log("Layout Generator réinitialisé.");
    }

    /**
     * Méthode récursive pour subdiviser une parcelle.
     * @param {Plot} plot - La parcelle à subdiviser.
     * @param {number} depth - La profondeur actuelle de récursion.
     */
    subdividePlot(plot, depth) {
        const road = this.config.roadWidth;
        const minSize = this.config.minPlotSize;
        const maxSize = this.config.maxPlotSize;

        // --- Conditions d'arrêt de la subdivision ---
        // Trop petite pour être coupée en deux avec une route entre les deux
        const isTooSmallToSplit = (plot.width < minSize * 2 + road) && (plot.depth < minSize * 2 + road);
        // Profondeur max atteinte ET la parcelle est déjà dans les clous niveau taille max
        const reachedMaxDepth = depth >= this.config.maxRecursionDepth;
        const withinMaxSize = plot.width <= maxSize && plot.depth <= maxSize;

        if ((reachedMaxDepth && withinMaxSize) || isTooSmallToSplit) {
            if (isTooSmallToSplit && !withinMaxSize) {
                // Optionnel: Avertir si on force une feuille trop grande car on ne peut plus couper
                // console.warn(`Plot ${plot.id} [${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}] dépasse maxPlotSize (${maxSize}) mais ne peut plus être subdivisée.`);
            }
            plot.isLeaf = true; // Marquer comme feuille et arrêter
            return;
        }

        // --- Choix de la direction de coupe ---
        // Coupe verticalement si plus large que profonde, ou aléatoirement si dimensions proches
        let splitVertical = plot.width > plot.depth;
        if (Math.abs(plot.width - plot.depth) < minSize / 2) { // Si proche du carré
            splitVertical = Math.random() > 0.5;
        }

        // --- Vérifier si la coupe est possible dans la direction choisie ---
        let canSplitSelectedDirection = false;
        if (splitVertical && plot.width >= minSize * 2 + road) { // Assez large pour couper verticalement?
            canSplitSelectedDirection = true;
        } else if (!splitVertical && plot.depth >= minSize * 2 + road) { // Assez profonde pour couper horizontalement?
            canSplitSelectedDirection = true;
        }

        // Si la direction choisie n'est pas possible, essayer l'autre
        if (!canSplitSelectedDirection) {
            splitVertical = !splitVertical; // Inverser
             if (splitVertical && plot.width >= minSize * 2 + road) { // Vérifier à nouveau
                 canSplitSelectedDirection = true;
            } else if (!splitVertical && plot.depth >= minSize * 2 + road) {
                 canSplitSelectedDirection = true;
            }
        }

        // Si aucune direction n'est possible (ne devrait plus arriver grâce à isTooSmallToSplit mais sécurité)
        if (!canSplitSelectedDirection) {
            plot.isLeaf = true;
            return;
        }

        // --- Subdivision ---
        plot.isLeaf = false;
        let p1, p2;
        let splitCoord; // Coordonnée où la route sera centrée

        if (splitVertical) { // Coupe Verticale -> Route Verticale
            // Plage de coordonnées possibles pour le centre de la route
            const minSplitX = plot.x + minSize + road / 2;
            const maxSplitX = plot.x + plot.width - minSize - road / 2;
            // Choisir une coordonnée aléatoire dans la plage valide
            splitCoord = (minSplitX >= maxSplitX) ? (plot.x + plot.width / 2) : THREE.MathUtils.randFloat(minSplitX, maxSplitX);

            // Créer les deux nouvelles parcelles
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, splitCoord - plot.x - road / 2, plot.depth); // Gauche
            p2 = new Plot(this.nextPlotId++, splitCoord + road / 2, plot.z, plot.x + plot.width - (splitCoord + road / 2), plot.depth); // Droite

        } else { // Coupe Horizontale -> Route Horizontale
            const minSplitZ = plot.z + minSize + road / 2;
            const maxSplitZ = plot.z + plot.depth - minSize - road / 2;
            splitCoord = (minSplitZ >= maxSplitZ) ? (plot.z + plot.depth / 2) : THREE.MathUtils.randFloat(minSplitZ, maxSplitZ);

            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, plot.width, splitCoord - plot.z - road / 2); // Haut
            p2 = new Plot(this.nextPlotId++, plot.x, splitCoord + road / 2, plot.width, plot.z + plot.depth - (splitCoord + road / 2)); // Bas
        }

        // --- Validation et Récursion ---
        // Vérifier si les nouvelles parcelles ont des dimensions valides
        if (p1.width > 0.1 && p1.depth > 0.1 && p2.width > 0.1 && p2.depth > 0.1) {
            plot.children.push(p1, p2); // Lier les enfants
            this.plots.push(p1, p2);   // Ajouter à la liste globale
            // Appeler récursivement sur les enfants
            this.subdividePlot(p1, depth + 1);
            this.subdividePlot(p2, depth + 1);
        } else {
            // Si la division crée des parcelles invalides (trop fines), annuler
            plot.isLeaf = true;
            plot.children = []; // Vider les enfants potentiels
             // Optionnel: Retirer p1 et p2 de this.plots s'ils y ont été ajoutés juste avant
             const indexP1 = this.plots.indexOf(p1); if (indexP1 > -1) this.plots.splice(indexP1, 1);
             const indexP2 = this.plots.indexOf(p2); if (indexP2 > -1) this.plots.splice(indexP2, 1);
            // console.warn(`Division annulée pour plot ${plot.id}: parcelles enfants invalides.`);
        }
    }

    /**
     * Parcours récursivement l'arbre des parcelles pour collecter les feuilles
     * et leur assigner un type de zone.
     * @param {Plot} plot - La parcelle à examiner.
     */
    collectLeafPlots(plot) {
        if (plot.isLeaf) {
            // Ignorer les parcelles potentiellement trop petites marquées précédemment
            if (plot.width < this.config.minPlotSize || plot.depth < this.config.minPlotSize) {
                plot.zoneType = 'unbuildable';
                return; // Ne pas ajouter aux parcelles utilisables dans leafPlots
            }

            // --- Assignation du Type de Zone basée sur les probabilités ---
            const randomValue = Math.random();
            const parkLimit = this.config.parkProbability;
            const industrialLimit = parkLimit + this.config.industrialZoneProbability;
            const houseLimit = industrialLimit + this.config.houseZoneProbability;

            if (randomValue < parkLimit) {
                plot.isPark = true;
                plot.zoneType = 'park';
            } else if (randomValue < industrialLimit) {
                plot.zoneType = 'industrial';
            } else if (randomValue < houseLimit) {
                plot.zoneType = 'house';
            } else {
                plot.zoneType = 'building'; // Par défaut
            }
            // --- Fin Assignation ---

            // Ajouter la parcelle finale utilisable à la liste
            this.leafPlots.push(plot);

        } else {
            // Si ce n'est pas une feuille, explorer les enfants
            if (plot.children && plot.children.length > 0) {
                 plot.children.forEach((child) => this.collectLeafPlots(child));
            }
        }
    }
}