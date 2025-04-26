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
        
        // Création des textures procédurales
        const sidewalkTexture = this.createSidewalkTexture();
        const normalMap = this.createSidewalkNormalMap();
        const roughnessMap = this.createSidewalkRoughnessMap();
        
        if (!this.materials.sidewalkMaterial) {
            console.warn("SidewalkGenerator: sidewalkMaterial not found in provided materials. Using fallback.");
            this.materials.sidewalkMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x999999,
                map: sidewalkTexture,
                normalMap: normalMap,
                normalScale: new THREE.Vector2(0.5, 0.5),
                roughnessMap: roughnessMap,
                roughness: 0.9,
                metalness: 0.0,
                envMapIntensity: 0.0
            });
        } else {
            // Mise à jour du matériau existant avec les nouvelles textures
            this.materials.sidewalkMaterial.map = sidewalkTexture;
            this.materials.sidewalkMaterial.normalMap = normalMap;
            this.materials.sidewalkMaterial.normalScale = new THREE.Vector2(0.5, 0.5);
            this.materials.sidewalkMaterial.roughnessMap = roughnessMap;
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

        // Couleur de base légèrement plus claire
        ctx.fillStyle = '#999999';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Taille des dalles
        const tileSize = 256;
        const numTiles = canvas.width / tileSize;

        // Dessin des dalles
        for (let y = 0; y < numTiles; y++) {
            for (let x = 0; x < numTiles; x++) {
                // Variation de couleur plus subtile
                const variation = Math.random() * 15 - 7.5; // Réduit de 30 à 15
                const r = Math.min(255, Math.max(0, 153 + variation));
                const g = Math.min(255, Math.max(0, 153 + variation));
                const b = Math.min(255, Math.max(0, 153 + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x * tileSize, y * tileSize, tileSize - 4, tileSize - 4);

                // Ajout de fissures plus subtiles
                if (Math.random() > 0.9) {
                    ctx.strokeStyle = '#888888'; // Plus clair
                    ctx.lineWidth = 2; // Plus fin
                    ctx.beginPath();
                    ctx.moveTo(x * tileSize + Math.random() * tileSize, y * tileSize + Math.random() * tileSize);
                    ctx.lineTo(x * tileSize + Math.random() * tileSize, y * tileSize + Math.random() * tileSize);
                    ctx.stroke();
                }
            }
        }

        // Création de la texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    }

    /**
     * Crée une normal map procédurale pour les trottoirs
     * @returns {THREE.CanvasTexture} La normal map générée
     */
    createSidewalkNormalMap() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Fond de base (bleu = plat)
        ctx.fillStyle = '#8080FF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Taille des dalles
        const tileSize = 256;
        const numTiles = canvas.width / tileSize;

        // Dessin des dalles avec effet de relief plus subtil
        for (let y = 0; y < numTiles; y++) {
            for (let x = 0; x < numTiles; x++) {
                // Élévation plus subtile
                ctx.fillStyle = '#9595FF'; // Plus proche du bleu de base
                ctx.fillRect(x * tileSize, y * tileSize, tileSize - 4, tileSize - 4);

                // Bordures légèrement surélevées
                ctx.strokeStyle = '#A5A5FF'; // Plus proche du bleu de base
                ctx.lineWidth = 3; // Plus fin
                ctx.strokeRect(x * tileSize, y * tileSize, tileSize - 4, tileSize - 4);

                // Coins légèrement surélevés
                ctx.fillStyle = '#B0B0FF'; // Plus proche du bleu de base
                const cornerSize = 6; // Plus petit
                ctx.fillRect(x * tileSize, y * tileSize, cornerSize, cornerSize);
                ctx.fillRect(x * tileSize + tileSize - cornerSize, y * tileSize, cornerSize, cornerSize);
                ctx.fillRect(x * tileSize, y * tileSize + tileSize - cornerSize, cornerSize, cornerSize);
                ctx.fillRect(x * tileSize + tileSize - cornerSize, y * tileSize + tileSize - cornerSize, cornerSize, cornerSize);
            }
        }

        // Création de la texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    }

    /**
     * Crée une roughness map procédurale pour les trottoirs
     * @returns {THREE.CanvasTexture} La roughness map générée
     */
    createSidewalkRoughnessMap() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Fond de base (gris moyen = rugosité moyenne)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Taille des dalles
        const tileSize = 256;
        const numTiles = canvas.width / tileSize;

        // Dessin des dalles avec variations de rugosité plus subtiles
        for (let y = 0; y < numTiles; y++) {
            for (let x = 0; x < numTiles; x++) {
                // Variation de rugosité plus subtile
                const roughness = Math.random() * 30 + 70; // Entre 70 et 100 (plus mat)
                ctx.fillStyle = `rgb(${roughness}, ${roughness}, ${roughness})`;
                ctx.fillRect(x * tileSize, y * tileSize, tileSize - 4, tileSize - 4);

                // Bordures légèrement plus rugueuses
                ctx.strokeStyle = '#707070';
                ctx.lineWidth = 3;
                ctx.strokeRect(x * tileSize, y * tileSize, tileSize - 4, tileSize - 4);

                // Coins légèrement plus rugueux
                ctx.fillStyle = '#656565';
                const cornerSize = 6;
                ctx.fillRect(x * tileSize, y * tileSize, cornerSize, cornerSize);
                ctx.fillRect(x * tileSize + tileSize - cornerSize, y * tileSize, cornerSize, cornerSize);
                ctx.fillRect(x * tileSize, y * tileSize + tileSize - cornerSize, cornerSize, cornerSize);
                ctx.fillRect(x * tileSize + tileSize - cornerSize, y * tileSize + tileSize - cornerSize, cornerSize, cornerSize);
            }
        }

        // Création de la texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
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