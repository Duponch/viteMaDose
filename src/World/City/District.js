/*
 * Fichier: src/World/District.js
 * Modifications:
 * - Ajout de la méthode `hasPark()` pour vérifier la présence d'un parc.
 */
// src/World/District.js
import * as THREE from 'three';

let nextDistrictId = 0;

export default class District {
    /**
     * Represents a district in the city.
     * @param {string} type - The type of the district ('residential', 'industrial', 'business').
     */
    constructor(type) {
        this.id = nextDistrictId++;
        this.type = type; // 'residential', 'industrial', 'business'
        this.plots = []; // Array of Plot objects in this district
        this._center = null; // Cached center
        this._bounds = null; // Cached bounding box
    }

    /**
     * Adds a plot to the district and updates the plot's districtId.
     * @param {Plot} plot - The plot to add.
     */
    addPlot(plot) {
        if (plot && !this.plots.includes(plot)) {
            this.plots.push(plot);
            plot.districtId = this.id; // Link plot back to district
            this._center = null; // Invalidate cache
            this._bounds = null; // Invalidate cache
        }
    }

    /**
     * Calculates and returns the geometric center of the district.
     * @returns {THREE.Vector3} The center point.
     */
    get center() {
        if (this._center) {
            return this._center;
        }
        if (this.plots.length === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        const center = new THREE.Vector3(0, 0, 0);
        this.plots.forEach(plot => {
            center.add(plot.center); // Utilise le getter 'center' de Plot
        });
        center.divideScalar(this.plots.length);
        this._center = center;
        return this._center;
    }

    /**
     * Calculates and returns the bounding box encompassing all plots in the district.
     * @returns {THREE.Box3} The bounding box.
     */
    get bounds() {
        if (this._bounds) {
            return this._bounds;
        }
        if (this.plots.length === 0) {
            this._bounds = new THREE.Box3(); // Empty box
            return this._bounds;
        }

        const box = new THREE.Box3();
        this.plots.forEach(plot => {
            // Utiliser les coins de la parcelle pour définir sa boîte 2D au sol
            const plotMin = new THREE.Vector3(plot.x, 0, plot.z);
            const plotMax = new THREE.Vector3(plot.x + plot.width, 0, plot.z + plot.depth);
            box.expandByPoint(plotMin);
            box.expandByPoint(plotMax);
        });
         // Donner une petite hauteur à la boîte pour la visualisation
         box.min.y = 0.1; // Légèrement au-dessus du sol
         box.max.y = 0.3;
        this._bounds = box;
        return this._bounds;
    }

    // ==============================================================
    // NOUVELLE FONCTION: hasPark
    // ==============================================================
    /**
     * Checks if this district already contains a plot designated as a park.
     * @returns {boolean} True if a park exists, false otherwise.
     */
    hasPark() {
        return this.plots.some(plot => plot.zoneType === 'park');
    }
    // ==============================================================

     /**
      * Returns the count of plots with specific zone types allowed for this district.
      * @returns {number}
      */
     getPlotCountMatchingType() {
         return this.plots.filter(plot => this.isAllowedPlotType(plot.zoneType)).length;
     }

     /**
      * Checks if a given zoneType is allowed within this district type.
      * @param {string} zoneType
      * @returns {boolean}
      */
     isAllowedPlotType(zoneType) {
         switch (this.type) {
             case 'residential':
                 // Un parc est autorisé (mais un seul sera gardé)
                 return ['house', 'building', 'park'].includes(zoneType);
             case 'industrial':
                 // Un parc est autorisé (mais un seul sera gardé)
                 return ['industrial', 'park'].includes(zoneType);
             case 'business':
                 // Un parc est autorisé (mais un seul sera gardé)
                 return ['skyscraper', 'park'].includes(zoneType);
             default:
                 return false;
         }
     }
}