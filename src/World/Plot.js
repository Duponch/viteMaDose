// src/World/Plot.js
import * as THREE from 'three';

export default class Plot {
    // --- MODIFIÉ : Ajout buildingInstances ---
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
        this.districtId = null; // ID du quartier auquel appartient cette parcelle
        this.occupiedSubZones = []; // Utilisé par PlotContentGenerator pour le placement (ex: arbres)

        // --- NOUVEAU ---
        // Stockera les infos des bâtiments *instances* placés sur cette parcelle
        this.buildingInstances = []; // { id: string, type: string, position: Vector3, capacity?: number, occupants?: number[] }
        // -------------
    }
    // --- FIN MODIFIÉ ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    get center() {
        return new THREE.Vector3(
            this.x + this.width / 2,
            0, // Niveau du sol
            this.z + this.depth / 2
        );
    }
    // --- FIN INCHANGÉ ---

    // --- NOUVEAU : Méthode helper pour obtenir le point d'entrée/sortie (trottoir) ---
    getEntryPoint(sidewalkHeight) {
        const center = this.center;
        center.y = sidewalkHeight;
        return center;
        // TODO: Améliorer pour trouver le point le plus proche sur le trottoir/NavigationGraph
    }
    // --- FIN NOUVEAU ---

    // --- NOUVEAU : Ajouter une instance de bâtiment ---
    addBuildingInstance(instanceData) {
        if (!this.buildingInstances) {
            this.buildingInstances = []; // Initialisation de sécurité
        }
        this.buildingInstances.push(instanceData);
    }
    // --- FIN NOUVEAU ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    contains(point) { // point is a Vector3
        return (
            point.x >= this.x &&
            point.x <= this.x + this.width &&
            // point.y is ignored for 2D check
            point.z >= this.z &&
            point.z <= this.z + this.depth
        );
    }
    // --- FIN INCHANGÉ ---

    // --- INCHANGÉ (mais fourni pour complétude) ---
    getBounds() {
        return {
            minX: this.x,
            maxX: this.x + this.width,
            minZ: this.z,
            maxZ: this.z + this.depth,
        };
    }
    // --- FIN INCHANGÉ ---
}