// src/World/InstanceDataManager.js
import * as THREE from 'three';

/**
 * Gère la collecte des données (matrices de transformation) pour les objets instanciés.
 * Les stratégies de placement ajoutent des données ici, puis le InstancedMeshFactory
 * utilise ces données pour créer les meshes finaux.
 */
export default class InstanceDataManager {
    constructor() {
        this.reset();
        console.log("InstanceDataManager initialized.");
    }

    /**
     * Réinitialise la structure de données interne.
     */
    reset() {
        /**
         * Structure de données pour stocker les matrices.
         * Format:
         * {
         * 'house': {
         * 'partName1': [matrix1, matrix2, ...],
         * 'partName2': [matrix3, ...]
         * },
         * 'building': {
         * 'assetId_partName': [matrix4, ...], // Pour procéduraux
         * 'assetId': [matrix5, ...]          // Pour standards (si clé 'default')
         * },
         * 'park': {
         * 'assetId1': [matrix6, ...],
         * 'assetId2': [matrix7, ...]
         * },
         * // ... autres types (tree, industrial, skyscraper, crosswalk)
         * }
         * @type {Object.<string, Object.<string, Array<THREE.Matrix4>>>}
         */
        this.data = {};
    }

    /**
     * Ajoute une matrice d'instance pour un type et un identifiant/clé spécifique.
     * @param {string} type - Le type d'objet (ex: 'house', 'building', 'park', 'tree', 'industrial', 'skyscraper', 'crosswalk').
     * @param {string} idOrKey - L'identifiant de l'asset ou la clé unique de la partie (ex: 'roof', 'industrial_asset_123', 'skyscraper_proc_0_part1', 'default_crosswalk_stripe').
     * @param {THREE.Matrix4} matrix - La matrice de transformation pour cette instance.
     */
    addData(type, idOrKey, matrix) {
        if (!type || !idOrKey || !matrix) {
            console.error("InstanceDataManager.addData: Informations manquantes (type, idOrKey, ou matrix).", { type, idOrKey, matrix });
            return;
        }

        // Assurer que le type existe dans la structure
        if (!this.data[type]) {
            this.data[type] = {};
        }

        // Assurer que l'id/clé existe pour ce type
        if (!this.data[type][idOrKey]) {
            this.data[type][idOrKey] = [];
        }

        // Ajouter la matrice (clonée pour éviter les modifications par référence)
        this.data[type][idOrKey].push(matrix.clone());
    }

    /**
     * Retourne l'ensemble des données d'instance collectées.
     * @returns {Object.<string, Object.<string, Array<THREE.Matrix4>>>} La structure de données interne.
     */
    getData() {
        return this.data;
    }

    /**
     * (Optionnel) Méthode pour obtenir les données pour un type spécifique.
     * @param {string} type - Le type d'objet.
     * @returns {Object.<string, Array<THREE.Matrix4>> | undefined}
     */
    getDataForType(type) {
        return this.data[type];
    }

     /**
      * (Optionnel) Méthode pour obtenir les matrices pour un type et id/clé spécifique.
      * @param {string} type - Le type d'objet.
      * @param {string} idOrKey - L'identifiant ou la clé.
      * @returns {Array<THREE.Matrix4> | undefined}
      */
     getMatrices(type, idOrKey) {
         return this.data[type]?.[idOrKey];
     }
}