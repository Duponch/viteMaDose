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
        this.waterWidth = 350;
        this.waterHeight = 250;
        this.waterSegments = 10;
        this.waterColor = 0x68c3c0;
        this.waterOpacity = 0.8;
        this.waterPosition = {
            x: 0,
            y: 0.5, // Légèrement au-dessus du sol
            z: 0
        };
        
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
        
        // Fusionner les vertices identiques (simplifie la géométrie)
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
            
            this.waves.push({
                y: vertex.y,
                x: vertex.x,
                z: vertex.z,
                ang: Math.random() * Math.PI * 2, // Angle aléatoire
                speed: 0.016 + Math.random() * 0.032 // Vitesse aléatoire
            });
        }
        
        // Créer le matériau pour l'eau
        let mat = new THREE.MeshPhongMaterial({
            color: this.waterColor,
            transparent: true,
            opacity: this.waterOpacity,
            flatShading: true,
        });
        
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
} 