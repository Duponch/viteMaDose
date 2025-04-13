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
        // Stockera les zones de grille occupées par les maisons {gx, gy, gridWidth, gridDepth}
        this.placedHouseGrids = []; // Initialisé comme tableau vide
        // -------------
    }

	addPlacedHouseGrid(gridArea) {
        // gridArea devrait être { gx, gy, gridWidth, gridDepth }
        if (!this.placedHouseGrids) {
            this.placedHouseGrids = []; // Double sécurité
        }
        this.placedHouseGrids.push(gridArea);
    }

	isGridAreaFree(targetGx, targetGy, targetGridWidth, targetGridDepth, spacing) {
        if (!this.placedHouseGrids) {
            return true; // Initialisation tardive ou aucune maison placée
        }

        // Calculer les limites de la zone cible AVEC l'espacement inclus
        const checkMinX = targetGx - spacing;
        const checkMinY = targetGy - spacing; // Rappel: grid Y correspond à world Z
        const checkMaxX = targetGx + targetGridWidth + spacing;
        const checkMaxY = targetGy + targetGridDepth + spacing;

        // Vérifier les chevauchements avec les maisons déjà placées sur cette parcelle
        for (const placed of this.placedHouseGrids) {
            // Calculer les limites de la zone placée AVEC l'espacement inclus
            const placedMinX = placed.gx - spacing;
            const placedMinY = placed.gy - spacing;
            const placedMaxX = placed.gx + placed.gridWidth + spacing;
            const placedMaxY = placed.gy + placed.gridDepth + spacing;

            // Vérification de chevauchement de rectangles (AABB)
            // Il y a chevauchement si les intervalles [minX, maxX] ET [minY, maxY] se chevauchent.
            // Ils NE se chevauchent PAS si l'un est complètement à gauche/droite OU complètement au-dessus/en-dessous de l'autre.
            const overlapsX = checkMinX < placedMaxX && checkMaxX > placedMinX;
            const overlapsY = checkMinY < placedMaxY && checkMaxY > placedMinY;

            if (overlapsX && overlapsY) {
                return false; // Chevauchement trouvé
            }
        }
        return true; // Aucun chevauchement trouvé
    }

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