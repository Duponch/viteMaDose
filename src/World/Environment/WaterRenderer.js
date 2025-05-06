// src/World/Environment/WaterRenderer.js
import * as THREE from 'three';

/**
 * Gère le rendu visuel de l'eau
 */
export default class WaterRenderer {
    /**
     * @param {Object} config - Configuration globale
     * @param {Object} materials - Collection de matériaux partagés
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        
        // Tailles par défaut
        this.defaultWidth = 350;
        this.defaultHeight = 250;
        this.defaultSegments = 10;
        
        // Propriétés visuelles
        this.waterColor = 0x68c3c0;
        this.waterOpacity = 0.8;
    }
    
    /**
     * Crée un plan d'eau animé
     * @param {number} width - Largeur de l'eau
     * @param {number} height - Hauteur de l'eau
     * @param {number} segments - Nombre de segments (résolution)
     * @returns {THREE.Mesh} - Le mesh de l'eau
     */
    createWater(width = this.defaultWidth, height = this.defaultHeight, segments = this.defaultSegments) {
        // Créer la géométrie de l'eau
        let geom = new THREE.PlaneGeometry(width, height, segments, segments);
        
        // Appliquer une rotation pour que l'eau soit horizontale
        geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        
        // Fusionner les vertices identiques
        geom.attributes.position.needsUpdate = true;
        
        // Créer le matériau
        let mat = new THREE.MeshPhongMaterial({
            color: this.waterColor,
            transparent: true,
            opacity: this.waterOpacity,
            flatShading: true,
        });
        
        // Créer le mesh
        const waterMesh = new THREE.Mesh(geom, mat);
        waterMesh.receiveShadow = true;
        waterMesh.name = "Water";
        
        // Stocker les données de vagues dans userData pour animation
        waterMesh.userData.waves = this.generateWavesData(geom);
        waterMesh.userData.verticesCount = geom.attributes.position.count;
        
        return waterMesh;
    }
    
    /**
     * Génère les données de vagues pour chaque vertex
     * @param {THREE.BufferGeometry} geometry - La géométrie pour laquelle générer les données
     * @returns {Array} - Tableau de données de vagues
     */
    generateWavesData(geometry) {
        const waves = [];
        const count = geometry.attributes.position.count;
        
        for (let i = 0; i < count; i++) {
            const vertex = new THREE.Vector3(
                geometry.attributes.position.getX(i),
                geometry.attributes.position.getY(i),
                geometry.attributes.position.getZ(i)
            );
            
            waves.push({
                y: vertex.y,
                x: vertex.x,
                z: vertex.z,
                ang: Math.random() * Math.PI * 2,
                speed: 0.016 + Math.random() * 0.032
            });
        }
        
        return waves;
    }
    
    /**
     * Déplace les vagues (animation)
     * @param {THREE.Mesh} waterMesh - Le mesh d'eau à animer
     */
    animateWaves(waterMesh) {
        if (!waterMesh || !waterMesh.userData.waves) return;
        
        const positions = waterMesh.geometry.attributes.position;
        const waves = waterMesh.userData.waves;
        const count = waterMesh.userData.verticesCount;
        
        for (let i = 0; i < count; i++) {
            const vprops = waves[i];
            
            // Calculer les nouvelles coordonnées avec mouvement sinusoïdal
            const x = vprops.x + Math.cos(vprops.ang);
            const y = vprops.y + Math.sin(vprops.ang) * 2;
            
            // Mettre à jour la position du vertex
            positions.setXYZ(i, x, y, vprops.z);
            
            // Mettre à jour l'angle pour la prochaine frame
            vprops.ang += vprops.speed;
        }
        
        // Indiquer que les positions ont changé
        positions.needsUpdate = true;
    }
    
    /**
     * Crée une version avancée de l'eau avec des shaders
     * @param {number} width - Largeur de l'eau
     * @param {number} height - Hauteur de l'eau
     * @returns {THREE.Mesh} - Le mesh de l'eau
     */
    createAdvancedWater(width = this.defaultWidth, height = this.defaultHeight) {
        // Cette méthode pourra être implémentée plus tard pour une version
        // avancée utilisant des shaders pour un rendu plus réaliste
        
        // Pour l'instant, nous utilisons la version simple
        return this.createWater(width, height, Math.max(this.defaultSegments, 20));
    }
} 