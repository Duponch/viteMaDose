import * as THREE from 'three';

/**
 * Système gérant l'eau dans l'environnement
 */
export default class WaterSystem {
    /**
     * @param {Object} experience - L'instance principale de l'expérience
     * @param {Object} environment - L'instance de l'environnement
     */
    constructor(experience, environment) {
        this.experience = experience;
        this.environment = environment;
        this.scene = this.experience.scene;
        this.time = this.experience.time;
        
        // Configuration de l'eau
        this.waterWidth = this.environment.mapSize * 2; // Couvre toute la carte
        this.waterHeight = this.environment.mapSize * 2;
        this.waterSegments = 50; // Réduit pour les performances
        this.waterColor = 0x68c3c0;
        this.waterOpacity = 0.8;
        this.waterPosition = {
            x: 0,
            y: -10, // Position beaucoup plus basse par défaut
            z: 0
        };
        
        // Paramètres d'optimisation
        this.maxWaveHeight = 2.0; // Hauteur maximale des vagues
        this.waveSpeed = 0.016; // Vitesse de base des vagues
        this.waveVariation = 0.032; // Variation de vitesse
        
        // Paramètres d'animation de la texture
        this.textureOffset = 0;
        this.textureSpeed = 0.0005;
        
        // Initialiser le système d'eau
        this.initWater();
    }
    
    /**
     * Initialise le système d'eau
     */
    initWater() {
        // Créer la géométrie de l'eau avec une grille de vertices
        let geom = new THREE.PlaneGeometry(
            this.waterWidth, 
            this.waterHeight, 
            this.waterSegments, 
            this.waterSegments
        );
        
        // Appliquer une rotation pour que l'eau soit horizontale
        geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        
        // Fusionner les vertices identiques
        geom.attributes.position.needsUpdate = true;
        
        // Stocker le nombre de vertices
        this.verticesCount = geom.attributes.position.count;
        
        // Création des données pour chaque vague (vertex)
        this.waves = [];
        
        // Pour chaque vertex, créer des paramètres de vague
        for (let i = 0; i < this.verticesCount; i++) {
            const vertex = new THREE.Vector3(
                geom.attributes.position.getX(i),
                geom.attributes.position.getY(i),
                geom.attributes.position.getZ(i)
            );
            
            // Calculer la distance du centre
            const distanceFromCenter = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            const normalizedDistance = distanceFromCenter / (this.waterWidth / 2);
            
            // Ajuster les paramètres en fonction de la distance
            const waveHeight = this.maxWaveHeight * (1 - normalizedDistance * 0.5);
            const waveSpeed = this.waveSpeed * (1 + normalizedDistance * 0.5);
            
            this.waves.push({
                y: vertex.y,
                x: vertex.x,
                z: vertex.z,
                ang: Math.random() * Math.PI * 2,
                speed: waveSpeed + Math.random() * this.waveVariation,
                height: waveHeight
            });
        }
        
        // Créer le matériau pour l'eau
        let mat = new THREE.MeshPhongMaterial({
            color: this.waterColor,
            transparent: true,
            opacity: this.waterOpacity,
            flatShading: true,
            shininess: 100,
            specular: new THREE.Color(0xffffff),
            envMap: this.experience.scene.environment,
            reflectivity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        // Créer une texture procédurale pour l'eau
        const waterTexture = this.createWaterTexture();
        mat.map = waterTexture;
        mat.bumpMap = waterTexture;
        mat.bumpScale = 0.5;
        
        // Créer le mesh final
        this.waterMesh = new THREE.Mesh(geom, mat);
        
        // Activer les ombres
        this.waterMesh.receiveShadow = true;
        
        // Définir la position
        this.waterMesh.position.set(
            this.waterPosition.x,
            this.waterPosition.y,
            this.waterPosition.z
        );
        
        // Ajouter à la scène
        this.scene.add(this.waterMesh);
    }
    
    /**
     * Déplace les vagues en fonction du temps
     */
    moveWaves() {
        if (!this.waterMesh) return;
        
        const positions = this.waterMesh.geometry.attributes.position;
        
        // Pour chaque vertex, mettre à jour sa position
        for (let i = 0; i < this.verticesCount; i++) {
            const vprops = this.waves[i];
            
            // Calculer les nouvelles coordonnées avec un mouvement sinusoïdal
            const x = vprops.x + Math.cos(vprops.ang);
            const y = vprops.y + Math.sin(vprops.ang) * vprops.height;
            
            // Mettre à jour la position du vertex
            positions.setXYZ(i, x, y, vprops.z);
            
            // Mettre à jour l'angle pour la prochaine frame
            vprops.ang += vprops.speed;
        }
        
        // Indiquer que les positions ont changé
        positions.needsUpdate = true;
    }
    
    /**
     * Met à jour la position de l'eau
     * @param {Object} position - Nouvelle position {x, y, z}
     */
    setPosition(position) {
        if (!this.waterMesh) return;
        
        this.waterPosition = { ...this.waterPosition, ...position };
        this.waterMesh.position.set(
            this.waterPosition.x,
            this.waterPosition.y,
            this.waterPosition.z
        );
    }
    
    /**
     * Définit les dimensions de l'eau
     * @param {number} width - Largeur
     * @param {number} height - Profondeur
     */
    setDimensions(width, height) {
        if (!this.waterMesh) return;
        
        // Stocker les nouvelles dimensions
        this.waterWidth = width;
        this.waterHeight = height;
        
        // Recréer l'eau avec les nouvelles dimensions
        this.scene.remove(this.waterMesh);
        this.initWater();
    }
    
    /**
     * Mise à jour du système d'eau
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        this.moveWaves();
        this.animateTexture(deltaTime);
    }
    
    /**
     * Anime la texture de l'eau
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    animateTexture(deltaTime) {
        if (this.waterMesh && this.waterMesh.material.map) {
            this.textureOffset += this.textureSpeed * deltaTime;
            this.waterMesh.material.map.offset.set(
                this.textureOffset,
                this.textureOffset * 0.5
            );
            this.waterMesh.material.bumpMap.offset.set(
                this.textureOffset * 0.7,
                this.textureOffset * 0.3
            );
        }
    }
    
    /**
     * Nettoie les ressources utilisées par le système d'eau
     */
    destroy() {
        if (this.waterMesh) {
            this.scene.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh.material.dispose();
            this.waterMesh = null;
        }
        
        this.waves = [];
    }
    
    /**
     * Crée une texture procédurale pour l'eau
     * @returns {THREE.Texture} La texture générée
     */
    createWaterTexture() {
        const canvas = document.createElement('canvas');
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Fond bleu transparent
        ctx.fillStyle = 'rgba(104, 195, 192, 0.8)';
        ctx.fillRect(0, 0, size, size);

        // Ajouter des motifs de vagues
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;

        // Dessiner des cercles concentriques pour les vagues
        for (let i = 0; i < 5; i++) {
            const radius = (i + 1) * size / 6;
            ctx.beginPath();
            ctx.arc(size/2, size/2, radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Ajouter des motifs de lumière
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        return texture;
    }
} 