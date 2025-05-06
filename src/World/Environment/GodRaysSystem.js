import * as THREE from 'three';
import { GodRaysFakeSunShader, GodRaysDepthMaskShader, GodRaysGenerateShader, GodRaysCombineShader } from '../Shaders/GodRaysShader.js';

export default class GodRaysSystem {
    constructor(experience, environment) {
        this.experience = experience;
        this.environment = environment;
        this.scene = this.experience.scene;
        this.renderer = this.experience.renderer.instance;
        this.camera = this.experience.camera.instance;
        
        // Configuration
        this.enabled = true;
        this.godRayIntensity = 0.75;
        this.godRayRenderTargetResolutionMultiplier = 1.0 / 4.0;
        
        // Initialisation
        this.init();
    }
    
    init() {
        // Créer les render targets
        const width = this.renderer.domElement.width;
        const height = this.renderer.domElement.height;
        
        this.rtTextureColors = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
        this.rtTextureDepth = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
        this.rtTextureDepthMask = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
        
        const adjustedWidth = width * this.godRayRenderTargetResolutionMultiplier;
        const adjustedHeight = height * this.godRayRenderTargetResolutionMultiplier;
        this.rtTextureGodRays1 = new THREE.WebGLRenderTarget(adjustedWidth, adjustedHeight, { type: THREE.HalfFloatType });
        this.rtTextureGodRays2 = new THREE.WebGLRenderTarget(adjustedWidth, adjustedHeight, { type: THREE.HalfFloatType });
        
        // Créer la scène et la caméra pour le post-processing
        this.postprocessingScene = new THREE.Scene();
        this.postprocessingCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10000, 10000);
        this.postprocessingCamera.position.z = 100;
        this.postprocessingScene.add(this.postprocessingCamera);
        
        // Créer les matériaux de shader
        this.createShaderMaterials();
        
        // Créer le quad pour le rendu
        this.quad = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 1.0),
            this.materialGodraysGenerate
        );
        this.quad.position.z = -9900;
        this.postprocessingScene.add(this.quad);
    }
    
    createShaderMaterials() {
        // Matériau pour le masque de profondeur
        this.materialGodraysDepthMask = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(GodRaysDepthMaskShader.uniforms),
            vertexShader: GodRaysDepthMaskShader.vertexShader,
            fragmentShader: GodRaysDepthMaskShader.fragmentShader
        });
        
        // Matériau pour la génération des rayons
        this.materialGodraysGenerate = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(GodRaysGenerateShader.uniforms),
            vertexShader: GodRaysGenerateShader.vertexShader,
            fragmentShader: GodRaysGenerateShader.fragmentShader
        });
        
        // Matériau pour le soleil
        this.materialGodraysFakeSun = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(GodRaysFakeSunShader.uniforms),
            vertexShader: GodRaysFakeSunShader.vertexShader,
            fragmentShader: GodRaysFakeSunShader.fragmentShader
        });
        
        // Matériau pour la combinaison finale
        this.materialGodraysCombine = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(GodRaysCombineShader.uniforms),
            vertexShader: GodRaysCombineShader.vertexShader,
            fragmentShader: GodRaysCombineShader.fragmentShader
        });
        
        // Configurer les couleurs
        this.materialGodraysFakeSun.uniforms.bgColor.value.setHex(0x000511);
        this.materialGodraysFakeSun.uniforms.sunColor.value.setHex(0xffee00);
        this.materialGodraysCombine.uniforms.fGodRayIntensity.value = this.godRayIntensity;
    }
    
    update() {
        if (!this.enabled) return;
        
        // Obtenir la position du soleil dans l'espace écran
        const sunPosition = this.environment.sunLight.position.clone();
        const clipPosition = new THREE.Vector4();
        const screenSpacePosition = new THREE.Vector3();
        
        clipPosition.x = sunPosition.x;
        clipPosition.y = sunPosition.y;
        clipPosition.z = sunPosition.z;
        clipPosition.w = 1;
        
        clipPosition.applyMatrix4(this.camera.matrixWorldInverse).applyMatrix4(this.camera.projectionMatrix);
        
        // Perspective divide (produce NDC space)
        clipPosition.x /= clipPosition.w;
        clipPosition.y /= clipPosition.w;
        
        screenSpacePosition.x = (clipPosition.x + 1) / 2;
        screenSpacePosition.y = (clipPosition.y + 1) / 2;
        screenSpacePosition.z = clipPosition.z;
        
        // Mettre à jour les uniforms
        this.materialGodraysGenerate.uniforms.vSunPositionScreenSpace.value.copy(screenSpacePosition);
        this.materialGodraysFakeSun.uniforms.vSunPositionScreenSpace.value.copy(screenSpacePosition);
        this.materialGodraysFakeSun.uniforms.fAspect.value = this.renderer.domElement.width / this.renderer.domElement.height;
        
        // Rendu de la scène principale
        this.renderer.setRenderTarget(this.rtTextureColors);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        
        // Rendu de la profondeur
        this.scene.overrideMaterial = new THREE.MeshDepthMaterial();
        this.renderer.setRenderTarget(this.rtTextureDepth);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.scene.overrideMaterial = null;
        
        // Masque de profondeur
        this.materialGodraysDepthMask.uniforms.tInput.value = this.rtTextureDepth.texture;
        this.postprocessingScene.overrideMaterial = this.materialGodraysDepthMask;
        this.renderer.setRenderTarget(this.rtTextureDepthMask);
        this.renderer.render(this.postprocessingScene, this.postprocessingCamera);
        
        // Génération des rayons
        const filterLen = 1.0;
        const TAPS_PER_PASS = 6.0;
        
        // Pass 1
        this.filterGodRays(this.rtTextureDepthMask.texture, this.rtTextureGodRays2, this.getStepSize(filterLen, TAPS_PER_PASS, 1.0));
        
        // Pass 2
        this.filterGodRays(this.rtTextureGodRays2.texture, this.rtTextureGodRays1, this.getStepSize(filterLen, TAPS_PER_PASS, 2.0));
        
        // Pass 3
        this.filterGodRays(this.rtTextureGodRays1.texture, this.rtTextureGodRays2, this.getStepSize(filterLen, TAPS_PER_PASS, 3.0));
        
        // Combinaison finale
        this.materialGodraysCombine.uniforms.tColors.value = this.rtTextureColors.texture;
        this.materialGodraysCombine.uniforms.tGodRays.value = this.rtTextureGodRays2.texture;
        
        this.postprocessingScene.overrideMaterial = this.materialGodraysCombine;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postprocessingScene, this.postprocessingCamera);
        this.postprocessingScene.overrideMaterial = null;
    }
    
    filterGodRays(inputTex, renderTarget, stepSize) {
        this.postprocessingScene.overrideMaterial = this.materialGodraysGenerate;
        this.materialGodraysGenerate.uniforms.fStepSize.value = stepSize;
        this.materialGodraysGenerate.uniforms.tInput.value = inputTex;
        
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(this.postprocessingScene, this.postprocessingCamera);
        this.postprocessingScene.overrideMaterial = null;
    }
    
    getStepSize(filterLen, tapsPerPass, pass) {
        return filterLen * Math.pow(tapsPerPass, -pass);
    }
    
    resize() {
        const width = this.renderer.domElement.width;
        const height = this.renderer.domElement.height;
        
        this.rtTextureColors.setSize(width, height);
        this.rtTextureDepth.setSize(width, height);
        this.rtTextureDepthMask.setSize(width, height);
        
        const adjustedWidth = width * this.godRayRenderTargetResolutionMultiplier;
        const adjustedHeight = height * this.godRayRenderTargetResolutionMultiplier;
        this.rtTextureGodRays1.setSize(adjustedWidth, adjustedHeight);
        this.rtTextureGodRays2.setSize(adjustedWidth, adjustedHeight);
    }
    
    destroy() {
        // Nettoyer les render targets
        this.rtTextureColors.dispose();
        this.rtTextureDepth.dispose();
        this.rtTextureDepthMask.dispose();
        this.rtTextureGodRays1.dispose();
        this.rtTextureGodRays2.dispose();
        
        // Nettoyer les matériaux
        this.materialGodraysDepthMask.dispose();
        this.materialGodraysGenerate.dispose();
        this.materialGodraysFakeSun.dispose();
        this.materialGodraysCombine.dispose();
        
        // Nettoyer la scène
        this.postprocessingScene.remove(this.quad);
        this.quad.geometry.dispose();
    }
} 