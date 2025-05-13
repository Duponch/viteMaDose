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
        
        // Créer la texture de trottoir
        this.sidewalkTexture = this.createSidewalkTexture();
        
        if (!this.materials.sidewalkMaterial) {
            console.warn("SidewalkGenerator: sidewalkMaterial not found in provided materials. Using fallback.");
            this.materials.sidewalkMaterial = new THREE.MeshStandardMaterial({ 
                map: this.sidewalkTexture,
                color: 0x999999,
                roughness: 0.9,
                metalness: 0.0,
                envMapIntensity: 0.0
            });
        } else {
            // Mise à jour du matériau existant avec la texture
            this.materials.sidewalkMaterial.map = this.sidewalkTexture;
            this.materials.sidewalkMaterial.normalMap = null;
            this.materials.sidewalkMaterial.roughnessMap = null;
            this.materials.sidewalkMaterial.roughness = 0.9;
            this.materials.sidewalkMaterial.metalness = 0.0;
            this.materials.sidewalkMaterial.envMapIntensity = 0.0;
        }
    }

    /**
     * Crée une texture procédurale pour les trottoirs
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createSidewalkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Couleur de base du trottoir (gris clair)
        const baseColor = new THREE.Color(0x999999);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ajouter des motifs de pavés (plus grands)
        const tileSize = 64; // Augmenté de 32 à 64
        const jointWidth = 3; // Légèrement plus large

        // Dessiner les joints (plus foncés)
        ctx.strokeStyle = '#707070';
        ctx.lineWidth = jointWidth;

        // Lignes horizontales
        for (let y = tileSize; y < canvas.height; y += tileSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Lignes verticales
        for (let x = tileSize; x < canvas.width; x += tileSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Dessiner les pavés avec des variations
        for (let y = 0; y < canvas.height; y += tileSize) {
            for (let x = 0; x < canvas.width; x += tileSize) {
                // Variation de couleur pour chaque pavé
                const variation = Math.random() * 20 - 10;
                const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
                const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
                const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(
                    x + jointWidth/2,
                    y + jointWidth/2,
                    tileSize - jointWidth,
                    tileSize - jointWidth
                );

                // Ajouter des motifs subtils sur certains pavés
                if (Math.random() < 0.2) { // 20% de chance d'avoir un motif
                    const patternType = Math.floor(Math.random() * 3);
                    const centerX = x + tileSize/2;
                    const centerY = y + tileSize/2;
                    const patternSize = tileSize * 0.4; // Augmenté de 0.3 à 0.4

                    ctx.strokeStyle = `rgb(${r - 20}, ${g - 20}, ${b - 20})`;
                    ctx.lineWidth = 2; // Légèrement plus épais

                    switch (patternType) {
                        case 0: // Carré
                            const squareSize = patternSize * 0.8;
                            ctx.strokeRect(
                                centerX - squareSize/2,
                                centerY - squareSize/2,
                                squareSize,
                                squareSize
                            );
                            break;

                        case 1: // Croix
                            ctx.beginPath();
                            ctx.moveTo(centerX - patternSize/2, centerY);
                            ctx.lineTo(centerX + patternSize/2, centerY);
                            ctx.moveTo(centerX, centerY - patternSize/2);
                            ctx.lineTo(centerX, centerY + patternSize/2);
                            ctx.stroke();
                            break;

                        case 2: // Points
                            const numPoints = 4;
                            for (let i = 0; i < numPoints; i++) {
                                const angle = (i / numPoints) * Math.PI * 2;
                                const px = centerX + Math.cos(angle) * patternSize/2;
                                const py = centerY + Math.sin(angle) * patternSize/2;
                                ctx.beginPath();
                                ctx.arc(px, py, 3, 0, Math.PI * 2); // Points légèrement plus grands
                                ctx.fill();
                            }
                            break;
                    }
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1); // Réduit la répétition pour des pavés plus grands
        return texture;
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
            //console.log("SidewalkGenerator: Sidewalk width is 0 or no plots provided, skipping sidewalk generation.");
            return null;
        }

        //console.log("SidewalkGenerator: Generating sidewalk geometries using SNAPPED values...");
        // Snapper la largeur du trottoir une seule fois
        const snappedSidewalkW = Math.round(sidewalkW / cellSizeWorld) * cellSizeWorld;
        if (snappedSidewalkW <= 0) {
            console.warn(`SidewalkGenerator: Snapped sidewalk width is <= 0 (${snappedSidewalkW}). Skipping generation.`);
            return null;
        }
        const halfSnappedSidewalkW = snappedSidewalkW / 2;

        const allSidewalkGeometries = [];
        const baseSidewalkGeom = new THREE.BoxGeometry(1, 1, 1); // Géométrie de base

        // Helper pour créer une géométrie transformée avec UV personnalisés
        const createTransformedGeom = (width, depth, height, x, z, yOffset = 0) => {
            const matrix = new THREE.Matrix4();
            // Appliquer l'échelle d'abord
            matrix.makeScale(width, height, depth);
            // Appliquer la position ensuite
            matrix.setPosition(x, height / 2 + yOffset, z);

            const clonedGeom = baseSidewalkGeom.clone();
            clonedGeom.applyMatrix4(matrix);

            // Ajuster les UVs en fonction de la taille
            const uvAttribute = clonedGeom.attributes.uv;
            const positions = clonedGeom.attributes.position;
            
            // Calculer le nombre de répétitions en fonction de la taille
            const repeatX = Math.max(1, Math.round(width / 2)); // 1 répétition tous les 2 mètres
            const repeatZ = Math.max(1, Math.round(depth / 2)); // 1 répétition tous les 2 mètres

            // Ajuster les UVs pour chaque vertex
            for (let i = 0; i < uvAttribute.count; i++) {
                const u = uvAttribute.getX(i);
                const v = uvAttribute.getY(i);
                
                // Ajuster U et V en fonction de la position du vertex
                const x = positions.getX(i);
                const z = positions.getZ(i);
                
                // Normaliser les coordonnées entre 0 et 1
                const normalizedX = (x + width/2) / width;
                const normalizedZ = (z + depth/2) / depth;
                
                // Appliquer la répétition
                uvAttribute.setXY(i, normalizedX * repeatX, normalizedZ * repeatZ);
            }
            
            uvAttribute.needsUpdate = true;
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
            //console.log("SidewalkGenerator: No sidewalk geometries were generated.");
            return null;
        }

        // --- Fusion des géométries ---
        //console.log(`SidewalkGenerator: Merging ${allSidewalkGeometries.length} geometries...`);
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

        //console.log("SidewalkGenerator: Sidewalk mesh created successfully.");
        return sidewalkMesh;
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}