// src/World/Plot.js
import * as THREE from 'three';

export default class Plot {
    constructor(id, x, z, width, depth) {
        this.id = id;
        this.x = x;
        this.z = z;
        this.width = width;
        this.depth = depth;
        this.children = [];
        this.isLeaf = true;
        this.isPark = false; // Peut être déprécié au profit de zoneType === 'park'
        this.zoneType = null; // Ex: 'house', 'building', 'industrial', 'skyscraper', 'park', 'unbuildable'
        this.districtId = null; // <- NOUVEAU: ID du quartier auquel appartient cette parcelle
        this.occupiedSubZones = []; // Utilisé par PlotContentGenerator pour le placement (ex: arbres)
    }

    get center() {
        return new THREE.Vector3(
            this.x + this.width / 2,
            0, // Niveau du sol
            this.z + this.depth / 2
        );
    }

    contains(point) { // point is a Vector3
        return (
            point.x >= this.x &&
            point.x <= this.x + this.width &&
            // point.y is ignored for 2D check
            point.z >= this.z &&
            point.z <= this.z + this.depth
        );
    }

    // --- Ajout potentiel ---
    getBounds() {
        return {
            minX: this.x,
            maxX: this.x + this.width,
            minZ: this.z,
            maxZ: this.z + this.depth,
        };
    }
}