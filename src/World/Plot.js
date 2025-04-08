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
        this.isPark = false;
        this.zoneType = null; // Ex: 'house', 'building', 'commercial', 'industrial'
    }

    get center() {
        return new THREE.Vector3(
            this.x + this.width / 2,
            0,
            this.z + this.depth / 2
        );
    }

    contains(point) {
        return (
            point.x >= this.x &&
            point.x <= this.x + this.width &&
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