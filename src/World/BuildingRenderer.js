// src/World/BuildingRenderer.js
import * as THREE from 'three';

export default class BuildingRenderer {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        // Initialisation des références spécifiques aux immeubles
        this.baseBuildingGeometries = {};
        this.baseBuildingMaterials = {};
        this.buildingInstanceMatrices = {};
        this.defineBuildingBaseMaterials();
        this.defineBuildingBaseGeometries();
        this.initializeBuildingMatrixArrays();
    }

    /**
     * Initialise les tableaux de matrices d’instances pour les immeubles.
     */
    initializeBuildingMatrixArrays() {
        this.buildingInstanceMatrices = {
            default: []
        };
    }

    /**
     * Définit les matériaux de base utilisés pour les immeubles par défaut.
     */
    defineBuildingBaseMaterials() {
        // Couleur par défaut pour les immeubles (modifiable selon vos besoins)
        this.baseBuildingMaterials.default = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.9,
            name: "DefaultBuildingMat"
        });
    }

    /**
     * Définit les géométries de base pour les immeubles par défaut.
     * Ici, nous utilisons une boîte simple en guise de géométrie par défaut.
     */
    defineBuildingBaseGeometries() {
        this.baseBuildingGeometries.default = new THREE.BoxGeometry(1, 1, 1);
    }

    /**
     * Génère la matrice d'instance pour un immeuble en fonction des paramètres
     * et des données de l'asset.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer l'immeuble.
     * @param {number} groundLevel - Position Y du sol.
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle appliqué.
     * @param {object} assetInfo - Données de l'asset (doit contenir notamment sizeAfterFitting, fittingScaleFactor, centerOffset, id, et éventuellement parts).
     * @returns {object} Un objet contenant les matrices d'instance pour l'immeuble. Pour un asset non procédural, la clé 'default' est utilisée.
     */
    generateBuildingInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor, assetInfo) {
        // Calcul de la matrice de transformation commune
        const instanceMatrix = new THREE.Matrix4();
        const finalScaleValue = assetInfo.fittingScaleFactor * baseScaleFactor;
        const scaleMatrix = new THREE.Matrix4().makeScale(finalScaleValue, finalScaleValue, finalScaleValue);
        const rotationMatrix = new THREE.Matrix4().makeRotationY(targetRotationY);
        const recenterMatrix = new THREE.Matrix4().makeTranslation(
            -assetInfo.centerOffset.x,
            -assetInfo.centerOffset.y,
            -assetInfo.centerOffset.z
        );
        const finalHeight = assetInfo.sizeAfterFitting.y * baseScaleFactor;
        const finalY = finalHeight / 2 + (this.config.plotGroundY !== undefined ? this.config.plotGroundY : 0.005);
        const translationMatrix = new THREE.Matrix4().makeTranslation(worldCellCenterPos.x, finalY, worldCellCenterPos.z);

        instanceMatrix.multiplyMatrices(scaleMatrix, recenterMatrix);
        instanceMatrix.premultiply(rotationMatrix);
        instanceMatrix.premultiply(translationMatrix);

        // Génération des données d'instance en fonction du type d'asset
        const buildingInstanceData = {};
        if (assetInfo.parts && assetInfo.parts.length > 0) {
            // Pour les assets procéduraux, chaque partie est traitée individuellement
            assetInfo.parts.forEach((part, index) => {
                // Ici, nous utilisons la même matrice pour toutes les parties.
                buildingInstanceData[`part${index}`] = [instanceMatrix.clone()];
            });
        } else {
            // Asset standard avec une seule géométrie
            buildingInstanceData.default = [instanceMatrix.clone()];
        }
        return buildingInstanceData;
    }

    /**
     * Réinitialise le BuildingRenderer en libérant la géométrie par défaut et en réinitialisant les tableaux d'instances.
     */
    reset() {
        if (this.baseBuildingGeometries && this.baseBuildingGeometries.default) {
            this.baseBuildingGeometries.default.dispose();
        }
        this.baseBuildingGeometries = {};
        this.defineBuildingBaseGeometries();
        this.initializeBuildingMatrixArrays();
    }
}
