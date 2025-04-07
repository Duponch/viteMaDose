import * as THREE from 'three';

export default class Environment {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug; // Pour ajouter des contrôles de debug plus tard

        this.setSunLight();
        this.setAmbientLight();
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3); // Lumière blanche, intensité 3
        this.sunLight.castShadow = true;
        this.sunLight.shadow.camera.far = 150; // Ajuster la portée des ombres
        this.sunLight.shadow.mapSize.set(2048, 2048); // Qualité des ombres
        this.sunLight.shadow.normalBias = 0.05; // Corrige les artefacts d'ombre
        this.sunLight.position.set(50, 70, 30); // Position de la lumière (directionnelle)
        this.scene.add(this.sunLight);

        // Optionnel : Helper pour visualiser la lumière directionnelle et ses ombres
        // const directionalLightCameraHelper = new THREE.CameraHelper(this.sunLight.shadow.camera)
        // this.scene.add(directionalLightCameraHelper)
        // const directionalLightHelper = new THREE.DirectionalLightHelper(this.sunLight, 0.2)
        // this.scene.add(directionalLightHelper)
    }

    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Lumière ambiante faible
        this.scene.add(this.ambientLight);
    }

    // Méthodes pour mettre à jour l'environnement si nécessaire (ex: cycle jour/nuit)
    update() {}
}