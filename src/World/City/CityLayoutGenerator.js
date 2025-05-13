import * as THREE from 'three';
import Plot from './Plot.js'; // Assurez-vous que le chemin est correct

export default class CityLayoutGenerator {
    // ----- CONSTRUCTEUR MODIFIÉ -----
    constructor(config) {
        // config contient maintenant aussi skyscraperZoneProbability
        this.config = config;
        this.plots = [];
        this.leafPlots = []; // Contiendra les parcelles finales utilisables
        this.rootPlot = null;
        this.nextPlotId = 0;
        // Ajouter la taille de cellule de la grille
        this.gridCellSize = 1.0 / config.gridScale;
        //console.log("CityLayoutGenerator initialisé.");
    }

    // Nouvelle méthode utilitaire pour snapper les dimensions
    snapToGrid(value) {
        return Math.round(value / this.gridCellSize) * this.gridCellSize;
    }

    // Nouvelle méthode pour snapper une position
    snapPositionToGrid(value) {
        return Math.floor(value / this.gridCellSize) * this.gridCellSize;
    }

    // ----- generateLayout (Inchangé) -----
    /**
     * Génère la structure des parcelles de la ville.
     * @param {number} mapSize - La taille totale de la carte (largeur et profondeur).
     * @returns {Array<Plot>} La liste des parcelles finales (feuilles) utilisables.
     */
    generateLayout(mapSize) {
        this.reset();
        //console.log("Génération du layout par subdivision...");

        // Snapper la taille de la carte à la grille
        const snappedMapSize = this.snapToGrid(mapSize);
        const snappedStartX = this.snapPositionToGrid(-snappedMapSize / 2);
        const snappedStartZ = this.snapPositionToGrid(-snappedMapSize / 2);

        // Crée la parcelle racine couvrant toute la carte
        this.rootPlot = new Plot(
            this.nextPlotId++,
            snappedStartX,
            snappedStartZ,
            snappedMapSize,
            snappedMapSize
        );
        this.plots.push(this.rootPlot);

        // Lancer la subdivision récursive à partir de la racine
        this.subdividePlot(this.rootPlot, 0);

        // Collecter les parcelles feuilles finales et leur assigner un type de zone
        this.collectLeafPlots(this.rootPlot);

        //console.log(`Layout terminé: ${this.leafPlots.length} parcelles finales utilisables générées.`);
        return this.leafPlots; // Retourne seulement les feuilles utilisables
    }

    // ----- reset (Inchangé) -----
    /**
     * Réinitialise l'état du générateur de layout.
     */
    reset() {
        // TODO: S'assurer que les anciennes parcelles sont nettoyées si elles contiennent des références circulaires ou des listeners
        this.plots = [];
        this.leafPlots = [];
        this.rootPlot = null; // Réinitialiser la racine
        this.nextPlotId = 0;
        // console.log("Layout Generator réinitialisé."); // Optionnel
    }

    // ----- subdividePlot (Inchangé) -----
    /**
     * Méthode récursive pour subdiviser une parcelle.
     * @param {Plot} plot - La parcelle à subdiviser.
     * @param {number} depth - La profondeur actuelle de récursion.
     */
    subdividePlot(plot, depth) {
        // Récupérer les paramètres de configuration
        const road = this.config.roadWidth;
        const minSize = this.config.minPlotSize;
        const maxSize = this.config.maxPlotSize; // Taille max pour éviter la subdivision

        // Snapper les dimensions minimales à la grille
        const snappedMinSize = this.snapToGrid(minSize);
        const snappedRoad = this.snapToGrid(road);

        // --- Conditions d'arrêt de la récursion ---

        // 1. La parcelle est trop petite pour être coupée en deux (même sans route)
        // OU trop petite pour créer deux parcelles de taille minSize avec une route entre elles.
        const cannotSplitFurther = (plot.width < snappedMinSize * 2 + snappedRoad) && (plot.depth < snappedMinSize * 2 + snappedRoad);

        // 2. La profondeur de récursion maximale est atteinte
        const reachedMaxDepth = depth >= this.config.maxRecursionDepth;

        // 3. La parcelle est déjà dans les limites de taille maximale souhaitées (sauf si on peut encore couper)
        const withinMaxSize = plot.width <= maxSize && plot.depth <= maxSize;

        // Arrêter si:
        // - On a atteint la profondeur max ET la taille est acceptable OU on ne PEUT plus couper de toute façon
        // - OU si la parcelle est juste trop petite pour être coupée
        if ((reachedMaxDepth && withinMaxSize) || cannotSplitFurther) {
            // Si on s'arrête parce qu'on ne peut plus couper, mais qu'elle est encore trop grande,
            // on pourrait vouloir logger un avertissement (optionnel).
            if (cannotSplitFurther && !withinMaxSize) {
                // console.warn(`Plot ${plot.id} [${plot.width.toFixed(1)}x${plot.depth.toFixed(1)}] est trop grande (${maxSize}) mais ne peut plus être subdivisée.`);
            }
            plot.isLeaf = true; // Marquer comme feuille (potentiellement utilisable)
            return; // Arrêter la subdivision pour cette branche
        }

        // --- Choix de la direction de la coupe ---
        // Par défaut, couper la dimension la plus longue.
        let splitVertical = plot.width > plot.depth;
        // Si les dimensions sont très proches (presque carré), choisir aléatoirement.
        // Utiliser une tolérance pour éviter les effets de bord flottants.
        if (Math.abs(plot.width - plot.depth) < snappedMinSize * 0.1) {
            splitVertical = Math.random() > 0.5;
        }
        // Si la dimension choisie est trop petite pour être coupée, essayer l'autre.
        if (splitVertical && plot.width < snappedMinSize * 2 + snappedRoad) {
            splitVertical = false; // Tenter horizontalement
        } else if (!splitVertical && plot.depth < snappedMinSize * 2 + snappedRoad) {
            splitVertical = true; // Tenter verticalement
        }

        // --- Vérification finale: est-ce qu'on PEUT couper dans la direction (re)choisie ? ---
        if ((splitVertical && plot.width < snappedMinSize * 2 + snappedRoad) ||
            (!splitVertical && plot.depth < snappedMinSize * 2 + snappedRoad)) {
            // Si même l'autre direction n'est pas possible, on doit s'arrêter.
            // console.warn(`Plot ${plot.id} ne peut être coupée dans aucune direction respectant minSize. Marquée comme feuille.`);
            plot.isLeaf = true;
            return;
        }


        // --- Subdivision ---
        plot.isLeaf = false; // Ce n'est plus une feuille car on va la couper
        let p1, p2; // Les deux nouvelles parcelles
        let splitCoord; // Coordonnée où la route (son centre) sera placée

        if (splitVertical) { // Coupe Verticale => Crée une route verticale au milieu
            // Déterminer la plage valide pour la position de la coupe (centre de la route)
            // La coupe doit laisser au moins minSize de chaque côté + la moitié de la route.
            const minSplitX = this.snapPositionToGrid(plot.x + snappedMinSize + snappedRoad / 2);
            const maxSplitX = this.snapPositionToGrid(plot.x + plot.width - snappedMinSize - snappedRoad / 2);

            // S'assurer que min < max (sinon, on ne peut pas vraiment couper aléatoirement)
            if (minSplitX >= maxSplitX) {
                 // Si la plage est invalide ou nulle, forcer la coupe au milieu (ne devrait pas arriver grace aux checks précédents)
                 splitCoord = this.snapPositionToGrid(plot.x + plot.width / 2);
                 // console.warn(`Plage de coupe verticale invalide pour plot ${plot.id}. Coupe au milieu.`);
             } else {
                 // Choisir une position de coupe qui est alignée sur la grille
                 const possibleSplits = [];
                 for (let x = minSplitX; x <= maxSplitX; x += this.gridCellSize) {
                     possibleSplits.push(x);
                 }
                 splitCoord = possibleSplits[Math.floor(Math.random() * possibleSplits.length)];
             }

            // Créer les deux nouvelles parcelles (gauche et droite de la route)
            // Parcelle 1 (gauche)
            const width1 = this.snapToGrid(splitCoord - plot.x - snappedRoad / 2);
            const width2 = this.snapToGrid(plot.x + plot.width - (splitCoord + snappedRoad / 2));
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, width1, plot.depth);
            // Parcelle 2 (droite)
            p2 = new Plot(this.nextPlotId++, splitCoord + snappedRoad / 2, plot.z, width2, plot.depth);

        } else { // Coupe Horizontale => Crée une route horizontale au milieu
             // Déterminer la plage valide pour la position de la coupe (centre de la route)
            const minSplitZ = this.snapPositionToGrid(plot.z + snappedMinSize + snappedRoad / 2);
            const maxSplitZ = this.snapPositionToGrid(plot.z + plot.depth - snappedMinSize - snappedRoad / 2);

            if (minSplitZ >= maxSplitZ) {
                 splitCoord = this.snapPositionToGrid(plot.z + plot.depth / 2);
                 // console.warn(`Plage de coupe horizontale invalide pour plot ${plot.id}. Coupe au milieu.`);
             } else {
                 // Choisir une position de coupe qui est alignée sur la grille
                 const possibleSplits = [];
                 for (let z = minSplitZ; z <= maxSplitZ; z += this.gridCellSize) {
                     possibleSplits.push(z);
                 }
                 splitCoord = possibleSplits[Math.floor(Math.random() * possibleSplits.length)];
             }

            // Créer les deux nouvelles parcelles (haut et bas de la route)
            // Parcelle 1 (haut)
            const depth1 = this.snapToGrid(splitCoord - plot.z - snappedRoad / 2);
            const depth2 = this.snapToGrid(plot.z + plot.depth - (splitCoord + snappedRoad / 2));
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, plot.width, depth1);
            // Parcelle 2 (bas)
            p2 = new Plot(this.nextPlotId++, plot.x, splitCoord + snappedRoad / 2, plot.width, depth2);
        }

        // --- Validation et Récursion ---
        // Vérifier si les nouvelles parcelles ont des dimensions minimales (sécurité)
        // Utiliser une petite tolérance (ex: 0.1) pour éviter les problèmes de flottants.
        if (p1.width > 0.1 && p1.depth > 0.1 && p2.width > 0.1 && p2.depth > 0.1) {
            plot.children.push(p1, p2); // Lier les enfants à la parcelle parente
            this.plots.push(p1, p2);   // Ajouter les nouvelles parcelles à la liste globale

            // Appeler récursivement sur les deux nouvelles parcelles
            this.subdividePlot(p1, depth + 1);
            this.subdividePlot(p2, depth + 1);
        } else {
            // Si la division a créé des parcelles invalides (trop fines), annuler la division.
            // La parcelle actuelle reste une feuille.
            plot.isLeaf = true;
            plot.children = []; // Vider les enfants potentiels (qui n'ont pas été ajoutés à this.plots)
            // Retirer p1 et p2 de this.plots s'ils y ont été ajoutés (ne devrait pas arriver si on vérifie avant push)
            // const indexP1 = this.plots.indexOf(p1); if (indexP1 > -1) this.plots.splice(indexP1, 1);
            // const indexP2 = this.plots.indexOf(p2); if (indexP2 > -1) this.plots.splice(indexP2, 1);
             console.warn(`Division annulée pour plot ${plot.id}: création de parcelles enfants invalides (p1: ${p1.width.toFixed(1)}x${p1.depth.toFixed(1)}, p2: ${p2.width.toFixed(1)}x${p2.depth.toFixed(1)}).`);
        }
    }

    // ----- collectLeafPlots MODIFIÉ -----
    /**
     * Parcours récursivement l'arbre des parcelles pour collecter les feuilles
     * et leur assigner un type de zone basé sur les probabilités.
     * @param {Plot} plot - La parcelle à examiner.
     */
    collectLeafPlots(plot) {
        if (plot.isLeaf) {
            // Optionnel: Ignorer les parcelles qui sont en dessous de la taille minimale absolue
            // même si elles ont été marquées comme feuilles parce qu'on ne pouvait plus les couper.
            if (plot.width < this.config.minPlotSize || plot.depth < this.config.minPlotSize) {
                plot.zoneType = 'unbuildable'; // Marquer comme non constructible
                // Ne pas ajouter à this.leafPlots car elle n'est pas utilisable
                return;
            }

            // --- Assignation du Type de Zone basée sur les probabilités ---
            const randomValue = Math.random(); // Valeur aléatoire entre 0 et 1

            // Récupérer les probabilités depuis la config
            const parkProb = this.config.parkProbability || 0;
            const industrialProb = this.config.industrialZoneProbability || 0;
            const houseProb = this.config.houseZoneProbability || 0;
            const skyscraperProb = this.config.skyscraperZoneProbability || 0; // <- Probabilité Skyscraper

            // Calculer les limites cumulatives
            const parkLimit = parkProb;
            const industrialLimit = parkLimit + industrialProb;
            const houseLimit = industrialLimit + houseProb;
            const skyscraperLimit = houseLimit + skyscraperProb; // <- Limite Skyscraper

            // Assigner le type en fonction de la plage où tombe la valeur aléatoire
            if (randomValue < parkLimit) {
                plot.isPark = true; // Garder isPark pour rétrocompatibilité ou logique spécifique
                plot.zoneType = 'park';
            } else if (randomValue < industrialLimit) {
                plot.zoneType = 'industrial';
            } else if (randomValue < houseLimit) {
                plot.zoneType = 'house';
            } else if (randomValue < skyscraperLimit) { // <- Nouvelle condition
                plot.zoneType = 'skyscraper';
            } else {
                // Tout ce qui reste est assigné comme 'building' (immeuble standard)
                plot.zoneType = 'building';
            }
            // --- Fin Assignation ---

            // Ajouter la parcelle finale (qui est une feuille ET de taille suffisante ET a un type)
            // à la liste des parcelles utilisables.
            this.leafPlots.push(plot);

        } else {
            // Si ce n'est pas une feuille, explorer récursivement les enfants
            if (plot.children && plot.children.length > 0) {
                 plot.children.forEach((child) => this.collectLeafPlots(child));
            }
            // Si une parcelle n'est pas une feuille et n'a pas d'enfants (ne devrait pas arriver avec la logique de subdividePlot),
            // elle est simplement ignorée.
        }
    }
}