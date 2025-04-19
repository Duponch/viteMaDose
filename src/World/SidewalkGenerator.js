// src/World/SidewalkGenerator.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * @typedef {import('./Plot.js').default} Plot
 */

/**
 * Génère la géométrie fusionnée pour les trottoirs de l'ensemble des parcelles.
 */
export default class SidewalkGenerator {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale (contient sidewalkWidth, sidewalkHeight).
     * @param {object} materials - Matériaux partagés (contient sidewalkMaterial).
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        if (!this.materials.sidewalkMaterial) {
            console.warn("SidewalkGenerator: sidewalkMaterial not found in provided materials. Using fallback.");
            this.materials.sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        }
        
        // Ajouter une marge de connexion pour éviter les trous entre trottoirs
        this.connectionMargin = 0.2; // Augmenter la marge à 20cm pour mieux connecter les trottoirs
    }

    /**
     * Crée et retourne un mesh unique contenant tous les trottoirs.
     * @param {Array<Plot>} plots - Tableau des parcelles finales (feuilles).
     * @returns {THREE.Mesh | null} Le mesh fusionné des trottoirs ou null si la largeur est 0 ou s'il y a une erreur.
     */
    generateSidewalks(plots) {
        const sidewalkW = this.config.sidewalkWidth ?? 0;
        const sidewalkH = this.config.sidewalkHeight ?? 0.2;

        if (sidewalkW <= 0 || !plots || plots.length === 0) {
            console.log("SidewalkGenerator: Sidewalk width is 0 or no plots provided, skipping sidewalk generation.");
            return null;
        }

        console.log("SidewalkGenerator: Generating sidewalk geometries with extended margins...");
        const allSidewalkGeometries = [];
        const baseSidewalkGeom = new THREE.BoxGeometry(1, 1, 1); // Géométrie de base

        // Helper pour créer une géométrie transformée
        const createTransformedGeom = (width, depth, height, x, z, yOffset = 0) => {
            const matrix = new THREE.Matrix4();
            // Appliquer l'échelle d'abord
            matrix.makeScale(width, height, depth);
            // Appliquer la position ensuite
            matrix.setPosition(x, height / 2 + yOffset, z);

            const clonedGeom = baseSidewalkGeom.clone();
            clonedGeom.applyMatrix4(matrix);
            return clonedGeom;
        };

        // Générer les segments de trottoirs pour chaque parcelle avec des marges étendues
        plots.forEach(plot => {
            const plotWidth = plot.width;
            const plotDepth = plot.depth;
            const plotX = plot.x;
            const plotZ = plot.z;

            // Calculer les coordonnées nécessaires
            const plotCenterX = plotX + plotWidth / 2;
            const plotCenterZ = plotZ + plotDepth / 2;
            const halfSidewalkW = sidewalkW / 2;

            // Ajouter la marge de connexion aux dimensions pour éviter les trous
            const margin = this.connectionMargin;

            // Positions des centres des segments de trottoir
            const topZ = plotZ - halfSidewalkW;         // Centre du segment haut
            const bottomZ = plotZ + plotDepth + halfSidewalkW; // Centre du segment bas
            const leftX = plotX - halfSidewalkW;         // Centre du segment gauche
            const rightX = plotX + plotWidth + halfSidewalkW; // Centre du segment droit

            // --- Création des 8 segments (4 côtés, 4 coins) ---
            // Côtés (longueur = dimension de la parcelle + marge, largeur = sidewalkW)
            allSidewalkGeometries.push(createTransformedGeom(plotWidth + margin, sidewalkW + margin, sidewalkH, plotCenterX, topZ));    // Haut
            allSidewalkGeometries.push(createTransformedGeom(plotWidth + margin, sidewalkW + margin, sidewalkH, plotCenterX, bottomZ)); // Bas
            allSidewalkGeometries.push(createTransformedGeom(sidewalkW + margin, plotDepth + margin, sidewalkH, leftX, plotCenterZ));    // Gauche
            allSidewalkGeometries.push(createTransformedGeom(sidewalkW + margin, plotDepth + margin, sidewalkH, rightX, plotCenterZ));   // Droite

            // Coins (carrés de côté sidewalkW + marge)
            allSidewalkGeometries.push(createTransformedGeom(sidewalkW + margin, sidewalkW + margin, sidewalkH, leftX, topZ));     // Coin Haut Gauche
            allSidewalkGeometries.push(createTransformedGeom(sidewalkW + margin, sidewalkW + margin, sidewalkH, rightX, topZ));    // Coin Haut Droit
            allSidewalkGeometries.push(createTransformedGeom(sidewalkW + margin, sidewalkW + margin, sidewalkH, leftX, bottomZ));  // Coin Bas Gauche
            allSidewalkGeometries.push(createTransformedGeom(sidewalkW + margin, sidewalkW + margin, sidewalkH, rightX, bottomZ)); // Coin Bas Droit
        });

        baseSidewalkGeom.dispose(); // Nettoyer la géométrie de base

        if (allSidewalkGeometries.length === 0) {
            console.log("SidewalkGenerator: No sidewalk geometries were generated.");
            return null;
        }

        // --- Fusion des géométries ---
        console.log(`SidewalkGenerator: Merging ${allSidewalkGeometries.length} geometries...`);
        const mergedSidewalkGeometry = mergeGeometries(allSidewalkGeometries, false);

        // Nettoyer les géométries individuelles après la fusion (important!)
        allSidewalkGeometries.forEach(geom => geom.dispose());

        if (!mergedSidewalkGeometry) {
            console.error("SidewalkGenerator: Failed to merge sidewalk geometries.");
            return null;
        }

        // --- Création du Mesh final ---
        const sidewalkMesh = new THREE.Mesh(mergedSidewalkGeometry, this.materials.sidewalkMaterial);
        sidewalkMesh.castShadow = false; // Les trottoirs ne projettent généralement pas d'ombres
        sidewalkMesh.receiveShadow = true; // Mais ils en reçoivent
        sidewalkMesh.name = "Merged_Sidewalks"; // Nom pour débogage

        console.log("SidewalkGenerator: Sidewalk mesh created successfully.");
        return sidewalkMesh;
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}