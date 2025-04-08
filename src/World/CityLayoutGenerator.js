import * as THREE from 'three';
import Plot from './Plot.js'; // Assurez-vous que le chemin est correct

export default class CityLayoutGenerator {
    constructor(config) {
        this.config = config; // mapSize, minPlotSize, maxPlotSize, roadWidth, maxRecursionDepth, parkProbability, houseZoneProbability etc.
        this.plots = [];
        this.leafPlots = [];
        this.rootPlot = null;
        this.nextPlotId = 0;
    }

    generateLayout(mapSize) {
        this.reset();
        console.log("Génération du layout par subdivision...");

        this.rootPlot = new Plot(
            this.nextPlotId++,
            -mapSize / 2,
            -mapSize / 2,
            mapSize,
            mapSize
        );
        this.plots.push(this.rootPlot);

        this.subdividePlot(this.rootPlot, 0);
        this.collectLeafPlots(this.rootPlot);

        console.log(`Layout terminé: ${this.leafPlots.length} parcelles finales.`);
        return this.leafPlots;
    }

    reset() {
        this.plots = [];
        this.leafPlots = [];
        this.rootPlot = null;
        this.nextPlotId = 0;
        console.log("Layout Generator réinitialisé.");
    }

    // --- Copiez/Collez la méthode subdividePlot de CityGenerator ici ---
    // Assurez-vous d'utiliser this.config pour les paramètres
    // et this.nextPlotId, this.plots
    subdividePlot(plot, depth) {
        const road = this.config.roadWidth;
        const minSize = this.config.minPlotSize;
        const maxSize = this.config.maxPlotSize;

        const isTooSmallToSplit = (plot.width < minSize * 2 + road) && (plot.depth < minSize * 2 + road);
        const reachedMaxDepth = depth >= this.config.maxRecursionDepth;
        const withinMaxSize = plot.width <= maxSize && plot.depth <= maxSize;

        if ((reachedMaxDepth && withinMaxSize) || isTooSmallToSplit) {
             if (isTooSmallToSplit && !withinMaxSize) {
                // console.warn(`Plot ${plot.id} [${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}] dépasse maxPlotSize (${maxSize}) mais ne peut plus être subdivisée. Forcée en feuille.`);
             }
            plot.isLeaf = true;
            return;
        }

        let splitVertical = plot.width > plot.depth;
        if (Math.abs(plot.width - plot.depth) < minSize / 2) {
            splitVertical = Math.random() > 0.5;
        }

        let canSplitSelectedDirection = false;
        if (splitVertical && plot.width >= minSize * 2 + road) {
            canSplitSelectedDirection = true;
        } else if (!splitVertical && plot.depth >= minSize * 2 + road) {
            canSplitSelectedDirection = true;
        }

        if (!canSplitSelectedDirection) {
            splitVertical = !splitVertical;
            if (splitVertical && plot.width >= minSize * 2 + road) {
                 canSplitSelectedDirection = true;
            } else if (!splitVertical && plot.depth >= minSize * 2 + road) {
                 canSplitSelectedDirection = true;
            }
        }

        if (!canSplitSelectedDirection) {
             if (!withinMaxSize) {
                 // console.warn(`Plot ${plot.id} [${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}] dépasse maxPlotSize (${maxSize}) mais aucune direction de split valide. Forcée en feuille.`);
             }
            plot.isLeaf = true;
            return;
        }

        plot.isLeaf = false;
        let p1, p2;
        let splitCoord;

        if (splitVertical) {
            const minSplitX = plot.x + minSize + road / 2;
            const maxSplitX = plot.x + plot.width - minSize - road / 2;
            splitCoord = (minSplitX > maxSplitX) ? plot.x + plot.width / 2 : THREE.MathUtils.randFloat(minSplitX, maxSplitX);

            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, splitCoord - plot.x - road / 2, plot.depth);
            p2 = new Plot(this.nextPlotId++, splitCoord + road / 2, plot.z, plot.x + plot.width - (splitCoord + road / 2), plot.depth);
        } else {
            const minSplitZ = plot.z + minSize + road / 2;
            const maxSplitZ = plot.z + plot.depth - minSize - road / 2;
            splitCoord = (minSplitZ > maxSplitZ) ? plot.z + plot.depth / 2 : THREE.MathUtils.randFloat(minSplitZ, maxSplitZ);

            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, plot.width, splitCoord - plot.z - road / 2);
            p2 = new Plot(this.nextPlotId++, plot.x, splitCoord + road / 2, plot.width, plot.z + plot.depth - (splitCoord + road / 2));
        }

        if (p1.width > 0.1 && p1.depth > 0.1 && p2.width > 0.1 && p2.depth > 0.1) {
            plot.children.push(p1, p2);
            this.plots.push(p1, p2);
            this.subdividePlot(p1, depth + 1);
            this.subdividePlot(p2, depth + 1);
        } else {
            plot.isLeaf = true;
            plot.children = [];
            // console.warn(`Division annulée pour plot ${plot.id}: parcelles enfants invalides.`);
            const indexP1 = this.plots.indexOf(p1); if (indexP1 > -1) this.plots.splice(indexP1, 1);
            const indexP2 = this.plots.indexOf(p2); if (indexP2 > -1) this.plots.splice(indexP2, 1);
        }
    }

    // --- Copiez/Collez la méthode collectLeafPlots de CityGenerator ici ---
    // Assurez-vous d'utiliser this.config et this.leafPlots
     collectLeafPlots(plot) {
        if (plot.isLeaf) {
            if (plot.width < this.config.minPlotSize || plot.depth < this.config.minPlotSize) {
                // Optionnel : Marquer les très petites parcelles comme non constructibles ou parcs ?
                 // plot.isPark = true; // Ou un autre flag
                 // console.log(`Petite parcelle ${plot.id} (${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}) marquée.`);
                 // Pour l'instant, on les garde mais elles pourraient ne pas avoir de contenu.
            } else if (Math.random() < this.config.parkProbability) {
                plot.isPark = true;
                plot.zoneType = 'park'; // Assignons un type de zone
            }

            if (!plot.isPark) {
                 // Assignation simple pour l'instant, pourrait être plus complexe
                 plot.zoneType = Math.random() < this.config.houseZoneProbability ? "house" : "building";
            }
            this.leafPlots.push(plot);
        } else {
            plot.children.forEach((child) => this.collectLeafPlots(child));
        }
    }
}