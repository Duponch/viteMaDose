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
    }

    /**
     * Crée et retourne un mesh unique contenant tous les trottoirs.
     * @param {Array<Plot>} plots - Tableau des parcelles finales (feuilles).
     * @returns {THREE.Mesh | null} Le mesh fusionné des trottoirs ou null si la largeur est 0 ou s'il y a une erreur.
     */
    generateSidewalks(plots) {
        const sidewalkW = this.config.sidewalkWidth ?? 0;
        const sidewalkH = this.config.sidewalkHeight ?? 0.2;
        // Récupérer gridScale et calculer cellSizeWorld
        const gridScale = this.config.gridScale ?? 1.0; // Assurez-vous que gridScale est dans la config
        const cellSizeWorld = 1.0 / gridScale;

        if (sidewalkW <= 0 || !plots || plots.length === 0) {
            console.log("SidewalkGenerator: Sidewalk width is 0 or no plots provided, skipping sidewalk generation.");
            return null;
        }

        console.log("SidewalkGenerator: Generating sidewalk geometries using SNAPPED values...");
        // Snapper la largeur du trottoir une seule fois
        const snappedSidewalkW = Math.round(sidewalkW / cellSizeWorld) * cellSizeWorld;
        if (snappedSidewalkW <= 0) {
            console.warn(`SidewalkGenerator: Snapped sidewalk width is <= 0 (${snappedSidewalkW}). Skipping generation.`);
            return null;
        }
        const halfSnappedSidewalkW = snappedSidewalkW / 2;

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

        plots.forEach(plot => {
            // Dimensions et position originales
            const originalPX = plot.x; const originalPZ = plot.z;
            const originalPW = plot.width; const originalPD = plot.depth;

            // Snapper l'origine et les dimensions de la parcelle comme dans NavigationGraph
            const pX = Math.round(originalPX / cellSizeWorld) * cellSizeWorld;
            const pZ = Math.round(originalPZ / cellSizeWorld) * cellSizeWorld;
            const pW = Math.round(originalPW / cellSizeWorld) * cellSizeWorld;
            const pD = Math.round(originalPD / cellSizeWorld) * cellSizeWorld;

            // Calculer les coordonnées nécessaires en utilisant les valeurs snappées
            const snappedPlotCenterX = pX + pW / 2;
            const snappedPlotCenterZ = pZ + pD / 2;

            // Positions des centres des segments de trottoir (utilisant les valeurs snappées)
            const topZ = pZ - halfSnappedSidewalkW;                     // Centre du segment haut
            const bottomZ = pZ + pD + halfSnappedSidewalkW;             // Centre du segment bas
            const leftX = pX - halfSnappedSidewalkW;                     // Centre du segment gauche
            const rightX = pX + pW + halfSnappedSidewalkW;             // Centre du segment droit

            // --- Création des 8 segments (utilisant les dimensions snappées) ---
            // Côtés (longueur = dimension snappée de la parcelle, largeur = largeur snappée du trottoir)
            allSidewalkGeometries.push(createTransformedGeom(pW, snappedSidewalkW, sidewalkH, snappedPlotCenterX, topZ));    // Haut
            allSidewalkGeometries.push(createTransformedGeom(pW, snappedSidewalkW, sidewalkH, snappedPlotCenterX, bottomZ)); // Bas
            allSidewalkGeometries.push(createTransformedGeom(snappedSidewalkW, pD, sidewalkH, leftX, snappedPlotCenterZ));    // Gauche
            allSidewalkGeometries.push(createTransformedGeom(snappedSidewalkW, pD, sidewalkH, rightX, snappedPlotCenterZ));   // Droite

            // Coins (carrés de côté = largeur snappée du trottoir)
            allSidewalkGeometries.push(createTransformedGeom(snappedSidewalkW, snappedSidewalkW, sidewalkH, leftX, topZ));     // Coin Haut Gauche
            allSidewalkGeometries.push(createTransformedGeom(snappedSidewalkW, snappedSidewalkW, sidewalkH, rightX, topZ));    // Coin Haut Droit
            allSidewalkGeometries.push(createTransformedGeom(snappedSidewalkW, snappedSidewalkW, sidewalkH, leftX, bottomZ));  // Coin Bas Gauche
            allSidewalkGeometries.push(createTransformedGeom(snappedSidewalkW, snappedSidewalkW, sidewalkH, rightX, bottomZ)); // Coin Bas Droit
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