import * as THREE from 'three';
import ShaderLoader from '../../Utils/ShaderLoader.js';

export default class ShaderGrassInstancer {
    constructor(config, experience) {
        this.config = config;
        this.experience = experience;
        this.scene = experience.scene;
        this.instanceNumber = config.grassInstanceCount;
        this.dummy = new THREE.Object3D();
        this.clock = new THREE.Clock();
        this.instancedMeshes = [];
        this.camera = null;
        
        // Paramètres de la végétation
        this.grassColor = new THREE.Color(0x485e3c); // Même couleur que dans l'ancien GrassInstancer
        this.windStrength = config.grassWindStrength || 1.0;
        
        // Pour la réception des ombres
        this.shadowDensity = config.grassShadowDensity || 0.6;
        
        // Géométrie de base pour un brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.1, 1, 1, 4);
        this.geometry.translate(0, 0.5, 0); // Déplacer le point le plus bas à 0
        
        // Initialiser les shaders et le matériau
        this.initShaderMaterial();
    }
    
    async initShaderMaterial() {
        try {
            // Préparer le matériau de Three.js avec support des ombres
            const grassTexture = this._createGrassTexture();
            
            // Créer un matériau MeshPhongMaterial standard qui supporte les ombres
            this.leavesMaterial = new THREE.MeshPhongMaterial({
                color: this.grassColor,
                side: THREE.DoubleSide,
                map: grassTexture,
                transparent: true,
                // Les propriétés importantes pour les ombres
                shadowSide: THREE.DoubleSide,
                receiveShadow: true
            });
            
            // Ajouter des uniformes personnalisés au shader standard de Three.js
            this.leavesMaterial.onBeforeCompile = (shader) => {
                // Ajouter nos uniformes personnalisés
                shader.uniforms.time = { value: 0 };
                shader.uniforms.windStrength = { value: this.windStrength };
                
                // Stocker une référence au shader pour la mise à jour
                this.materialShader = shader;
                
                // 1. D'abord déclarer les uniformes dans le vertex shader
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `
                    uniform float time;
                    uniform float windStrength;
                    varying vec2 vUv;
                    
                    void main() {
                        vUv = uv;
                    `
                );
                
                // 2. Ensuite ajouter le code d'animation
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    
                    // DISPLACEMENT pour l'herbe
                    float dispPower = 1.0 - cos(uv.y * 3.1416 / 2.0);
                    float displacement = sin(position.z + time * 5.0) * (0.1 * dispPower * windStrength);
                    transformed.x += displacement;
                    
                    // Légère variation sur l'axe z pour plus de naturalité
                    float displacementZ = cos(position.x + time * 7.0) * (0.05 * dispPower * windStrength);
                    transformed.z += displacementZ;
                    `
                );
                
                // 3. Déclarer la varying dans le fragment shader
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `
                    varying vec2 vUv;
                    
                    void main() {
                    `
                );
                
                // 4. Améliorer le calcul de la couleur
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    `
                    #include <color_fragment>
                    
                    // Nuances plus sombres à la base de l'herbe, plus claires aux extrémités
                    float clarity = (vUv.y * 0.5) + 0.5;
                    diffuseColor.rgb *= clarity;
                    
                    // Ajout d'une légère variation aléatoire
                    float randomVariation = fract(sin(vUv.x * 100.0) * 10000.0) * 0.05 + 0.95;
                    diffuseColor.rgb *= randomVariation;
                    `
                );
            };
            
            console.log("Matériau d'herbe initialisé avec succès en mode compatible ombres");
        } catch (error) {
            console.error("Erreur lors de l'initialisation du matériau d'herbe:", error);
        }
    }
    
    /**
     * Crée une texture procédurale pour l'herbe
     * @returns {THREE.Texture} La texture générée
     * @private
     */
    _createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Fond transparent
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dessiner un brin d'herbe avec un dégradé
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, 'rgba(72, 94, 60, 1)'); // Couleur de base à la racine
        gradient.addColorStop(0.7, 'rgba(82, 104, 65, 1)'); // Légèrement plus clair
        gradient.addColorStop(1, 'rgba(97, 117, 75, 0.8)'); // Plus clair aux pointes avec transparence
        
        // Forme du brin avec un léger flou aux bords
        ctx.fillStyle = gradient;
        
        // Dessiner la forme de base (triangle arrondi)
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.5, canvas.height); // Base au milieu
        ctx.bezierCurveTo(
            canvas.width * 0.1, canvas.height * 0.7, // Point de contrôle
            canvas.width * 0.1, canvas.height * 0.3, // Point de contrôle
            canvas.width * 0.5, 0                    // Sommet du brin
        );
        ctx.bezierCurveTo(
            canvas.width * 0.9, canvas.height * 0.3, // Point de contrôle
            canvas.width * 0.9, canvas.height * 0.7, // Point de contrôle
            canvas.width * 0.5, canvas.height        // Retour à la base
        );
        ctx.fill();
        
        // Créer la texture Three.js à partir du canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        
        return texture;
    }
    
    createGrassInstances(plot) {
        // Vérifier si le matériau est initialisé
        if (!this.leavesMaterial) {
            console.warn("Le matériau d'herbe n'est pas encore initialisé");
            return new THREE.Group(); // Retourner un groupe vide
        }
        
        // Créer le mesh instancié
        const instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.leavesMaterial,
            this.instanceNumber
        );
        
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = false; // L'herbe ne projette pas d'ombre (pour des raisons de performance)
        instancedMesh.receiveShadow = true; // L'herbe reçoit des ombres
        
        // Position du centre de la parcelle
        const centerX = plot.x + plot.width / 2;
        const centerZ = plot.z + plot.depth / 2;
        
        // Déterminer la densité d'herbe en fonction du type de zone
        let density = 1.0;
        if (plot.zoneType === 'park') {
            density = 1.2; // Plus dense dans les parcs
        } else if (plot.zoneType === 'house') {
            density = 0.7; // Moins dense dans les zones résidentielles
        }
        
        // Positionner et échelonner les instances d'herbe aléatoirement dans la parcelle
        for (let i = 0; i < this.instanceNumber; i++) {
            // Position aléatoire dans la parcelle
            const x = plot.x + (Math.random() * plot.width);
            const z = plot.z + (Math.random() * plot.depth);
            
            // Éviter de placer l'herbe près des bords de parcelle
            const margin = 0.1;
            const adjustedX = Math.max(plot.x + margin, Math.min(plot.x + plot.width - margin, x));
            const adjustedZ = Math.max(plot.z + margin, Math.min(plot.z + plot.depth - margin, z));
            
            // Positionner, échelonner et orienter le dummy
            this.dummy.position.set(adjustedX, 0, adjustedZ);
            
            // Variation de taille
            const scale = (0.3 + Math.random() * 0.5) * density;
            this.dummy.scale.setScalar(scale);
            
            // Rotation aléatoire
            this.dummy.rotation.y = Math.random() * Math.PI * 2;
            
            // Mettre à jour la matrice et l'appliquer à l'instance
            this.dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }
        
        // Indiquer que la matrice d'instance a été modifiée
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Stocker le mesh dans le tableau des meshes
        this.instancedMeshes.push(instancedMesh);
        
        return instancedMesh;
    }
    
    update() {
        // Mettre à jour l'uniform de temps pour l'animation si le shader est compilé
        if (this.materialShader) {
            this.materialShader.uniforms.time.value = this.clock.getElapsedTime();
            this.materialShader.uniforms.windStrength.value = this.windStrength;
        }
    }
    
    reset() {
        // Supprimer tous les meshes instanciés de la scène
        this.instancedMeshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            
            // Libérer les ressources
            mesh.dispose();
        });
        
        // Réinitialiser le tableau
        this.instancedMeshes = [];
    }
    
    // Fonction pour ajuster le paramètre de force du vent
    setWindStrength(strength) {
        this.windStrength = strength;
        // Sera mis à jour dans la méthode update
    }
    
    setCamera(camera) {
        this.camera = camera;
    }
} 