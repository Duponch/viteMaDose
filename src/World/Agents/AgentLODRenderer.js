import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Classe responsable de la génération et gestion des géométries LOD pour les agents
 * Fournit des géométries simplifiées "carrées" pour les agents éloignés
 */
export default class AgentLODRenderer {
    constructor() {
        // Cache des géométries générées pour éviter de les recréer
        this.geometryCache = {
            high: {},
            medium: {},
            low: {}
        };
        
        // Flag indiquant que la frustum culling est forcée pour les parties LOD
        this._forceFrustumCulling = true;
    }

    /**
     * Crée une géométrie de tête carrée simplifiée pour le LOD
     * @param {number} size - Taille de la tête
     * @returns {THREE.BufferGeometry} Géométrie simplifiée
     */
    createSquareHeadGeometry(size) {
        // Si déjà en cache, retourner
        if (this.geometryCache.low.head) {
            return this.geometryCache.low.head;
        }

        // Créer un cube pour la tête - encore plus simple avec moins de segments
        const headSize = size * 2.2;
        const headGeom = new THREE.BoxGeometry(headSize, headSize, headSize, 1, 1, 1);
        
        // Ajouter des couleurs par défaut à la géométrie (beige clair pour la peau)
        const count = headGeom.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(0xffcc99); // Couleur de peau
        
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        headGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Simplifier en supprimant les attributs inutiles pour les performances
        headGeom.deleteAttribute('normal');
        headGeom.deleteAttribute('uv');
        
        // Mettre en cache et retourner
        this.geometryCache.low.head = headGeom;
        return headGeom;
    }

    /**
     * Crée une géométrie de torse carrée simplifiée pour le LOD
     * @param {number} torsoRadius - Rayon du torse
     * @param {number} torsoLength - Longueur du torse
     * @returns {THREE.BufferGeometry} Géométrie simplifiée
     */
    createSquareTorsoGeometry(torsoRadius, torsoLength) {
        // Si déjà en cache, retourner
        if (this.geometryCache.low.torso) {
            return this.geometryCache.low.torso;
        }

        // Créer un simple cube pour le torse
        const width = torsoRadius * 2;
        const height = torsoLength;
        const depth = torsoRadius * 2;
        
        // Utiliser un cube avec un seul segment dans chaque dimension pour optimisation maximale
        const torsoGeom = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
        
        // Ajouter des couleurs par défaut à la géométrie (bleu pour le torse/chemise)
        const count = torsoGeom.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(0x4466cc); // Couleur de chemise
        
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        torsoGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Simplifier en supprimant les attributs inutiles pour les performances
        torsoGeom.deleteAttribute('normal');
        torsoGeom.deleteAttribute('uv');
        
        // Mettre en cache et retourner
        this.geometryCache.low.torso = torsoGeom;
        return torsoGeom;
    }

    /**
     * Crée une géométrie de membre (main/pied) carrée simplifiée pour le LOD
     * @param {number} radius - Rayon du membre
     * @param {number} length - Longueur du membre
     * @returns {THREE.BufferGeometry} Géométrie simplifiée
     */
    createSquareExtremityGeometry(radius, length) {
        // Si déjà en cache, retourner
        const cacheKey = `extremity_${radius}_${length}`;
        if (this.geometryCache.low[cacheKey]) {
            return this.geometryCache.low[cacheKey];
        }

        // Créer un simple cube pour le membre
        const width = radius * 1.8;
        const height = length * 0.8;
        const depth = radius * 1.8;
        
        // Utiliser un cube avec un seul segment pour optimisation maximale
        const extremityGeom = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
        
        // Ajouter des couleurs par défaut à la géométrie (couleur peau)
        const count = extremityGeom.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(0xffcc99); // Couleur de peau
        
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        extremityGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Simplifier en supprimant les attributs inutiles pour les performances
        extremityGeom.deleteAttribute('normal');
        extremityGeom.deleteAttribute('uv');
        
        // Mettre en cache et retourner
        this.geometryCache.low[cacheKey] = extremityGeom;
        return extremityGeom;
    }

    /**
     * Crée une géométrie de chaussure carrée simplifiée pour le LOD
     * @returns {THREE.BufferGeometry} Géométrie simplifiée
     */
    createSquareShoeGeometry() {
        // Si déjà en cache, retourner
        if (this.geometryCache.low.shoe) {
            return this.geometryCache.low.shoe;
        }

        // Créer un simple cube mais légèrement allongé vers l'avant pour les chaussures
        const width = 1.2;
        const height = 0.6;
        const depth = 2.0;
        
        // Utiliser un cube avec un seul segment pour optimisation maximale
        const shoeGeom = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
        
        // Déplacer vers l'avant pour refléter la forme de chaussure
        shoeGeom.translate(0, 0, 0.4);
        
        // Ajouter des couleurs par défaut à la géométrie (noir pour les chaussures)
        const count = shoeGeom.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(0x444444); // Couleur de chaussure
        
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        shoeGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Simplifier en supprimant les attributs inutiles pour les performances
        shoeGeom.deleteAttribute('normal');
        shoeGeom.deleteAttribute('uv');
        
        // Mettre en cache et retourner
        this.geometryCache.low.shoe = shoeGeom;
        return shoeGeom;
    }
    
    /**
     * Configure les matériaux pour le mode LOD
     * @param {THREE.Material} material - Matériau à configurer
     */
    optimizeMaterial(material) {
        if (!material) return;
        
        // Simplifier le matériau pour le LOD
        material.flatShading = true;
        material.needsUpdate = true;
        
        // Désactiver les fonctionnalités coûteuses
        if (material.map) material.map = null;
        if (material.normalMap) material.normalMap = null;
        if (material.roughnessMap) material.roughnessMap = null;
        if (material.metalnessMap) material.metalnessMap = null;
        
        // Optimiser les paramètres de rendu
        material.fog = false;
        material.lights = false;
    }

    /**
     * Nettoie les géométries en cache pour libérer la mémoire
     */
    dispose() {
        // Parcourir et disposer toutes les géométries en cache
        for (const level in this.geometryCache) {
            for (const key in this.geometryCache[level]) {
                if (this.geometryCache[level][key]) {
                    this.geometryCache[level][key].dispose();
                    this.geometryCache[level][key] = null;
                }
            }
        }
        this.geometryCache = {
            high: {},
            medium: {},
            low: {}
        };
    }
} 