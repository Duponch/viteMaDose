/**
 * Effet d'éclairs pour le système météorologique
 * Ajoute des flashs lumineux et des formes d'éclairs dans le ciel
 */
import * as THREE from 'three';

export default class LightningEffect {
    /**
     * @param {Object} weatherSystem - Référence au système météorologique principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.experience = this.weatherSystem.experience;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;
        this.time = this.experience.time;
        
        // Configuration
        this.enabled = true;
        this.intensity = 0; // 0 = pas d'éclairs, 1 = éclairs maximum
        this.lastLightningTime = 0;
        this.lightningDuration = 150; // durée d'un éclair en ms
        this.currentLightningAlpha = 0; // pour l'animation de flash
        this.isLightningActive = false;
        
        // Création des éléments visuels
        this.setupLightningLight();
        this.setupLightningMeshes();
        
        console.log("Effet d'éclairs initialisé");
    }
    
    /**
     * Configure la lumière principale pour les flashs d'éclairs
     */
    setupLightningLight() {
        // Lumière ambiante pour l'éclair (flash global)
        this.lightningLight = new THREE.AmbientLight(0xffffff, 0);
        this.scene.add(this.lightningLight);
    }
    
    /**
     * Configure les maillages pour représenter visuellement les éclairs
     */
    setupLightningMeshes() {
        this.lightningMeshes = [];
        this.maxLightningBolts = 3; // Nombre maximum d'éclairs visibles simultanément
        
        // Créer des matériaux pour les éclairs
        this.lightningMaterial = new THREE.MeshBasicMaterial({
            color: 0xeeeeff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide
        });
        
        // Créer plusieurs formes d'éclairs
        for (let i = 0; i < this.maxLightningBolts; i++) {
            const lightningMesh = this.createLightningBolt();
            this.lightningMeshes.push(lightningMesh);
            this.scene.add(lightningMesh);
            lightningMesh.visible = false;
        }
    }
    
    /**
     * Crée un maillage représentant un éclair avec une forme aléatoire
     * @returns {THREE.Mesh} Le maillage de l'éclair
     */
    createLightningBolt() {
        // Création d'une forme en zigzag pour l'éclair
        const points = [];
        const segments = 6 + Math.floor(Math.random() * 4); // 6-9 segments
        const width = 10 + Math.random() * 20; // Largeur du zigzag
        const height = 300 + Math.random() * 200; // Hauteur totale de l'éclair
        
        // Point de départ en haut
        points.push(new THREE.Vector3(0, 0, 0));
        
        // Créer des points en zigzag
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const x = (Math.random() - 0.5) * width * 2;
            const y = -t * height;
            const z = (Math.random() - 0.5) * width;
            points.push(new THREE.Vector3(x, y, z));
        }
        
        // Créer une géométrie à partir des points
        const curve = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(curve, segments * 3, 1.5, 8, false);
        
        // Créer le maillage avec le matériau d'éclair
        return new THREE.Mesh(geometry, this.lightningMaterial.clone());
    }
    
    /**
     * Déclenche un éclair si les conditions sont remplies
     */
    triggerLightning() {
        if (!this.enabled || this.intensity <= 0) return;
        
        // Vérifier si un éclair est déjà actif
        if (this.isLightningActive) return;
        
        // Probabilité basée sur l'intensité
        const probability = this.intensity * 0.01; // 0.01 à intensité max pour ne pas avoir trop d'éclairs
        
        if (Math.random() < probability) {
            this.isLightningActive = true;
            this.currentLightningAlpha = 1.0;
            this.lastLightningTime = this.time.elapsed;
            
            // Activer quelques éclairs aléatoirement
            const numBolts = Math.ceil(Math.random() * this.maxLightningBolts * this.intensity);
            for (let i = 0; i < this.lightningMeshes.length; i++) {
                const mesh = this.lightningMeshes[i];
                
                // Position aléatoire dans le ciel
                if (i < numBolts) {
                    mesh.visible = true;
                    mesh.position.set(
                        (Math.random() - 0.5) * 500, // X: position horizontale
                        150 + Math.random() * 100,    // Y: hauteur dans le ciel
                        (Math.random() - 0.5) * 500   // Z: profondeur
                    );
                    
                    // Rotation aléatoire
                    mesh.rotation.z = Math.random() * Math.PI * 0.25;
                    mesh.rotation.x = Math.random() * Math.PI * 0.1;
                    
                    // Opacité initiale
                    mesh.material.opacity = 1;
                } else {
                    mesh.visible = false;
                }
            }
            
            // Ajouter un son d'éclair si disponible
            if (this.experience.sound && this.experience.sound.thunder) {
                // Délai aléatoire pour simuler la distance de l'éclair
                const delay = Math.random() * 500 + 100;
                setTimeout(() => {
                    this.experience.sound.thunder.play();
                }, delay);
            }
        }
    }
    
    /**
     * Met à jour l'effet d'éclairs
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.enabled) return;
        
        // Tenter de déclencher un éclair
        this.triggerLightning();
        
        // Gérer l'animation des éclairs actifs
        if (this.isLightningActive) {
            const timeSinceLightning = this.time.elapsed - this.lastLightningTime;
            
            // Calcul de l'alpha (opacité) de l'éclair
            if (timeSinceLightning < this.lightningDuration) {
                // Temps normalisé (0-1)
                const t = timeSinceLightning / this.lightningDuration;
                
                // Animation d'opacité: rapide au début, puis décroissance
                this.currentLightningAlpha = 1.0 - t;
                
                // Appliquer la luminosité ambiante (flash)
                const flashIntensity = this.currentLightningAlpha * this.intensity * 2;
                this.lightningLight.intensity = flashIntensity;
                
                // Mettre à jour l'opacité des éclairs
                for (const mesh of this.lightningMeshes) {
                    if (mesh.visible) {
                        mesh.material.opacity = this.currentLightningAlpha;
                    }
                }
            } else {
                // Fin de l'éclair
                this.isLightningActive = false;
                this.currentLightningAlpha = 0;
                this.lightningLight.intensity = 0;
                
                // Cacher tous les éclairs
                for (const mesh of this.lightningMeshes) {
                    mesh.visible = false;
                }
            }
        }
    }
    
    /**
     * Nettoie toutes les ressources utilisées par l'effet d'éclairs
     */
    destroy() {
        // Supprimer la lumière
        if (this.lightningLight) {
            this.scene.remove(this.lightningLight);
            this.lightningLight = null;
        }
        
        // Supprimer les maillages d'éclairs
        for (const mesh of this.lightningMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        
        this.lightningMeshes = [];
        
        console.log("Effet d'éclairs nettoyé");
    }
} 