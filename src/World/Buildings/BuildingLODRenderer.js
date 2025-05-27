import * as THREE from 'three';

/**
 * Classe responsable de la génération et gestion des géométries LOD pour les bâtiments
 * Fournit des géométries simplifiées (cubes colorés) pour les bâtiments éloignés
 */
export default class BuildingLODRenderer {
    constructor() {
        // Cache des géométries générées pour éviter de les recréer
        this.geometryCache = {};
        
        // Définition des couleurs pour chaque type de bâtiment
        this.buildingColors = {
            house: 0xD2B48C,        // Beige/Tan - Couleur résidentielle chaleureuse
            building: 0x708090,     // Gris ardoise - Couleur d'immeuble moderne
            skyscraper: 0x2F4F4F,   // Gris foncé - Couleur de gratte-ciel imposant
            industrial: 0x8B4513,   // Brun - Couleur industrielle/usine
            commercial: 0x4169E1,   // Bleu royal - Couleur commerciale attractive
            movietheater: 0x8B0000, // Rouge foncé - Couleur de cinéma
            newhouse: 0xF5DEB3,     // Blé - Variante de maison plus claire
            newbuilding: 0x696969,  // Gris foncé - Variante d'immeuble
            newskyscraper: 0x191970 // Bleu nuit - Variante de gratte-ciel moderne
        };
        
        // Matériau simple pour tous les bâtiments LOD
        this.lodMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            roughness: 0.7,
            metalness: 0.1,
            name: 'BuildingLodMaterial'
        });
    }

    /**
     * Crée une géométrie de cube simple pour un type de bâtiment
     * @param {string} buildingType - Type de bâtiment (house, building, skyscraper, etc.)
     * @param {number} width - Largeur du cube
     * @param {number} height - Hauteur du cube
     * @param {number} depth - Profondeur du cube
     * @returns {THREE.BufferGeometry} Géométrie simplifiée avec couleurs
     */
    createLODGeometry(buildingType, width = 1, height = 1, depth = 1) {
        const cacheKey = `${buildingType}_${width}_${height}_${depth}`;
        
        // Si déjà en cache, retourner
        if (this.geometryCache[cacheKey]) {
            return this.geometryCache[cacheKey];
        }

        // Créer un cube simple avec un seul segment dans chaque dimension
        const geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
        
        // Obtenir la couleur pour ce type de bâtiment
        const color = new THREE.Color(this.buildingColors[buildingType] || 0x808080);
        
        // Ajouter des couleurs par défaut à la géométrie
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        
        // Appliquer la couleur à tous les sommets
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Simplifier en supprimant les attributs inutiles pour les performances
        geometry.deleteAttribute('normal');
        geometry.deleteAttribute('uv');
        
        // Mettre en cache et retourner
        this.geometryCache[cacheKey] = geometry;
        return geometry;
    }

    /**
     * Crée des géométries LOD pour tous les types de bâtiments
     * @returns {Object} Objet contenant toutes les géométries LOD
     */
    createAllLODGeometries() {
        const lodGeometries = {};
        
        // Créer une géométrie LOD pour chaque type de bâtiment
        Object.keys(this.buildingColors).forEach(buildingType => {
            // Ajuster les dimensions selon le type de bâtiment
            let width = 1, height = 1, depth = 1;
            
            switch(buildingType) {
                case 'house':
                case 'newhouse':
                    width = 1;
                    height = 0.8;
                    depth = 1;
                    break;
                case 'building':
                case 'newbuilding':
                    width = 1.2;
                    height = 1.5;
                    depth = 1.2;
                    break;
                case 'skyscraper':
                case 'newskyscraper':
                    width = 1.5;
                    height = 3;
                    depth = 1.5;
                    break;
                case 'industrial':
                    width = 2;
                    height = 1;
                    depth = 1.5;
                    break;
                case 'commercial':
                    width = 1.8;
                    height = 1.2;
                    depth = 1.3;
                    break;
                case 'movietheater':
                    width = 2.2;
                    height = 1.1;
                    depth = 1.8;
                    break;
            }
            
            lodGeometries[buildingType] = this.createLODGeometry(buildingType, width, height, depth);
        });
        
        return lodGeometries;
    }

    /**
     * Obtient le matériau LOD optimisé
     * @returns {THREE.Material} Matériau pour les bâtiments LOD
     */
    getLODMaterial() {
        return this.lodMaterial;
    }

    /**
     * Obtient la couleur d'un type de bâtiment
     * @param {string} buildingType - Type de bâtiment
     * @returns {number} Couleur hexadécimale
     */
    getBuildingColor(buildingType) {
        return this.buildingColors[buildingType] || 0x808080;
    }

    /**
     * Nettoie les géométries en cache pour libérer la mémoire
     */
    dispose() {
        // Parcourir et disposer toutes les géométries en cache
        Object.values(this.geometryCache).forEach(geometry => {
            if (geometry) {
                geometry.dispose();
            }
        });
        this.geometryCache = {};
        
        // Disposer le matériau
        if (this.lodMaterial) {
            this.lodMaterial.dispose();
            this.lodMaterial = null;
        }
    }
} 