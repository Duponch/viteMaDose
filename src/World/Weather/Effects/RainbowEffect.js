/**
 * Effet d'arc-en-ciel pour le système météorologique
 * Utilise un shader pour créer un arc-en-ciel semi-transparent
 */
import * as THREE from 'three';

export default class RainbowEffect {
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.experience = weatherSystem.experience;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;
        
        // Configuration
        this.enabled = true;
        this.opacity = 0.0; // Opacité initiale (0 = invisible)
        this.rainbowMesh = null;
        this.uniforms = null;
        
        // Dimensions
        this.innerRadius = 0.45; // Rayon intérieur relatif [0-1]
        this.outerRadius = 0.65; // Rayon extérieur relatif [0-1]
        this.arcSpan = 0.5;      // Étendue de l'arc (0.5 = demi-cercle)
        
        // Initialisation
        this.init();
    }
    
    /**
     * Initialise l'effet d'arc-en-ciel
     */
    async init() {
        try {
            // Chargement des shaders
            const [vertexResponse, fragmentResponse] = await Promise.all([
                fetch('src/World/Shaders/RainbowVertex.glsl'),
                fetch('src/World/Shaders/RainbowFragment.glsl')
            ]);
            
            if (!vertexResponse.ok || !fragmentResponse.ok) {
                throw new Error(`Erreur chargement shaders: VS=${vertexResponse.status}, FS=${fragmentResponse.status}`);
            }
            
            const vertexShader = await vertexResponse.text();
            const fragmentShader = await fragmentResponse.text();
            
            // Création des uniforms pour le shader
            this.uniforms = {
                uOpacity: { value: this.opacity },
                uInnerRadius: { value: this.innerRadius },
                uOuterRadius: { value: this.outerRadius },
                uArcSpan: { value: this.arcSpan },
                uPosition: { value: new THREE.Vector3(0, 0, 0) },
                groundHeight: { value: 0 }
            };
            
            // Création du matériau utilisant les shaders
            const material = new THREE.ShaderMaterial({
                uniforms: this.uniforms,
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            
            // Création de la géométrie (un plan circulaire)
            const radius = this.weatherSystem.environment.skyboxRadius * 1.2;
            const geometry = new THREE.CircleGeometry(radius, 64);
            
            // Création du mesh
            this.rainbowMesh = new THREE.Mesh(geometry, material);
            
            // Positionnement de l'arc-en-ciel face à la caméra
            this.updatePosition();
            
            // Ajout à la scène (mais caché jusqu'à ce que l'opacité soit > 0)
            this.scene.add(this.rainbowMesh);
            
            console.log("Effet arc-en-ciel initialisé");
        } catch (error) {
            console.error("Erreur lors de l'initialisation de l'effet arc-en-ciel:", error);
        }
    }
    
    /**
     * Met à jour la position de l'arc-en-ciel pour qu'il soit toujours face à la caméra
     * et se positionne contre le ciel
     */
    updatePosition() {
        if (!this.rainbowMesh) return;
        
        // Position caméra
        const cameraPosition = this.camera.instance.position.clone();
        
        // Direction de la caméra
        const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.instance.quaternion);
        
        // Distance à la skybox
        const skyboxRadius = this.weatherSystem.environment.skyboxRadius;
        const distance = skyboxRadius * 1; // Légèrement en avant de la skybox
        
        // Position finale (toujours au même endroit par rapport à la caméra)
        const position = cameraPosition.clone().add(
            cameraDirection.multiplyScalar(distance)
        );
        
        // Ajuster la hauteur pour placer l'arc-en-ciel au niveau du sol
        position.y = 0; // Position au niveau du sol
        
        // Mettre à jour la hauteur du sol dans les uniforms
        this.uniforms.groundHeight.value = position.y;
        
        // Appliquer la position
        this.rainbowMesh.position.copy(position);
        
        // Créer une matrice de rotation pour orienter l'arc-en-ciel
        const target = new THREE.Vector3();
        target.copy(cameraPosition).add(cameraDirection);
        
        // Orienter le mesh pour qu'il soit toujours face à la caméra
        this.rainbowMesh.lookAt(target);
        
        // Rotation pour que l'arc-en-ciel soit vertical et dans le bon sens
        this.rainbowMesh.rotateY(Math.PI / 2);
        this.rainbowMesh.rotateZ(Math.PI); // Inverser l'arc-en-ciel
    }
    
    /**
     * Définit l'opacité de l'arc-en-ciel
     * @param {number} value - Opacité entre 0 et 1
     */
    setOpacity(value) {
        this.opacity = THREE.MathUtils.clamp(value, 0, 1);
        
        if (this.uniforms) {
            this.uniforms.uOpacity.value = this.opacity;
        }
        
        // Visibilité du mesh basée sur l'opacité
        if (this.rainbowMesh) {
            this.rainbowMesh.visible = this.opacity > 0.01;
        }
    }
    
    /**
     * Met à jour l'effet à chaque frame
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.enabled || !this.rainbowMesh) return;
        
        // Mettre à jour la position de l'arc-en-ciel par rapport à la caméra
        this.updatePosition();
        
        // L'arc-en-ciel n'apparaît que lorsqu'il y a du soleil et de la pluie
        // Mais ici nous le contrôlons manuellement par un curseur d'opacité dans l'UI
    }
    
    /**
     * Nettoie les ressources utilisées par l'effet
     */
    destroy() {
        if (this.rainbowMesh) {
            this.scene.remove(this.rainbowMesh);
            this.rainbowMesh.geometry.dispose();
            this.rainbowMesh.material.dispose();
            this.rainbowMesh = null;
        }
        
        this.uniforms = null;
        
        console.log("Effet arc-en-ciel nettoyé");
    }
} 