// src/World/SkyscraperRenderer.js
import * as THREE from 'three';

export default class SkyscraperRenderer {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        // Initialisation des références spécifiques aux gratte-ciels
        this.baseSkyscraperGeometries = {};
        this.baseSkyscraperMaterials = {};
        this.skyscraperInstanceMatrices = {};
        this.defineSkyscraperBaseMaterials();
        this.defineSkyscraperBaseGeometries();
        this.initializeSkyscraperMatrixArrays();
    }

    /**
     * Initialise les tableaux de matrices d’instances pour les gratte-ciels.
     */
    initializeSkyscraperMatrixArrays() {
        this.skyscraperInstanceMatrices = {
            default: []
        };
    }

    /**
     * Définit les matériaux de base utilisés pour les gratte-ciels.
     */
    defineSkyscraperBaseMaterials() {
        // Par défaut, un matériau métallique/gris pour les gratte-ciels
        this.baseSkyscraperMaterials.default = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.5,
            metalness: 0.8,
            name: "DefaultSkyscraperMat"
        });
    }

    /**
     * Définit les géométries de base pour les gratte-ciels.
     * Ici, nous utilisons une boîte simple comme géométrie par défaut.
     */
    defineSkyscraperBaseGeometries() {
        this.baseSkyscraperGeometries.default = new THREE.BoxGeometry(1, 1, 1);
    }

    /**
     * Génère la matrice d'instance pour un gratte-ciel en fonction des paramètres fournis.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer le gratte-ciel.
     * @param {number} groundLevel - Position Y du sol.
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle appliqué.
     * @param {object} assetInfo - Objet contenant les données de l'asset (doit contenir notamment sizeAfterFitting, fittingScaleFactor, centerOffset, id, et éventuellement parts).
     * @returns {object} Un objet contenant les matrices d'instances pour le gratte-ciel.
     *
     * Pour un asset non procédural, la clé 'default' est utilisée.
     * Pour un asset procédural (avec des parts), une entrée est créée pour chaque partie (ex. 'part0', 'part1', etc.).
     */
    generateSkyscraperInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor, assetInfo) {
        // Calcul de la matrice de transformation
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = assetInfo.fittingScaleFactor * baseScaleFactor;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(targetRotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -assetInfo.centerOffset.x,
            -assetInfo.centerOffset.y,
            -assetInfo.centerOffset.z
        );
        // Calcul de la translation en fonction de la hauteur finale de l'asset
        const finalHeight = assetInfo.sizeAfterFitting.y * baseScaleFactor;
        const finalY = finalHeight / 2 + (this.config.plotGroundY !== undefined ? this.config.plotGroundY : 0.005);
        const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);

        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(translationMatrix);

        // Préparation des données d'instance
        const skyscraperInstanceData = {};

        if (assetInfo.parts && assetInfo.parts.length > 0) {
            // Pour un asset procédural, on traite chaque partie séparément
            assetInfo.parts.forEach((part, index) => {
                skyscraperInstanceData[`part${index}`] = [instanceMatrix.clone()];
            });
        } else {
            // Asset standard avec une seule géométrie
            skyscraperInstanceData.default = [instanceMatrix.clone()];
        }
        return skyscraperInstanceData;
    }

    /**
     * Réinitialise le SkyscraperRenderer en libérant les ressources de géométrie et en réinitialisant les tableaux d’instances.
     */
    reset() {
        if (this.baseSkyscraperGeometries && this.baseSkyscraperGeometries.default) {
            this.baseSkyscraperGeometries.default.dispose();
        }
        this.baseSkyscraperGeometries = {};
        this.defineSkyscraperBaseGeometries();
        this.initializeSkyscraperMatrixArrays();
    }
}
