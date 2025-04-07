import * as THREE from 'three';

export default class Renderer {
    constructor(experience) {
        this.experience = experience;
        this.canvas = this.experience.canvas;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;

        this.setInstance();
    }

    setInstance() {
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true, // Active l'anti-aliasing
            alpha: true // Permet la transparence (si nécessaire)
        });
        // Améliorations de performance/qualité
        this.instance.physicallyCorrectLights = true; // Pour PBR materials plus tard
        this.instance.outputEncoding = THREE.sRGBEncoding; // Encodage couleur standard
        this.instance.toneMapping = THREE.CineonToneMapping; // Joli rendu des couleurs/lumières
        this.instance.toneMappingExposure = 1.75;
        this.instance.shadowMap.enabled = true; // Activer les ombres
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap; // Ombres douces

        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);
        this.instance.setClearColor(0x1e1a20); // Couleur de fond si pas de skybox
    }

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);
    }

    update() {
        this.instance.render(this.scene, this.camera.instance);
    }
}