import * as THREE from 'three';

export default class Environment {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug; // Pour ajouter des contrôles de debug plus tard
        this.mapSize = 500; // Ou récupérez-la dynamiquement
        this.setSunLight();
        this.setAmbientLight();
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048); // Qualité ok, peut être augmentée (4096) si besoin et si perf ok
        this.sunLight.shadow.normalBias = 0.05;
        this.sunLight.position.set(50, 80, 50); // Augmenter un peu la hauteur peut aider

        // --- Configuration cruciale de la Shadow Camera ---
        const shadowCamSize = this.mapSize / 2; // Rayon de la zone à couvrir
        // Ajustez ces valeurs pour couvrir votre 'mapSize'
        this.sunLight.shadow.camera.left = -shadowCamSize;
        this.sunLight.shadow.camera.right = shadowCamSize;
        this.sunLight.shadow.camera.top = shadowCamSize;
        this.sunLight.shadow.camera.bottom = -shadowCamSize;
        this.sunLight.shadow.camera.near = 0.5; // Par défaut souvent 0.5
        // Assurez-vous que 'far' est suffisant pour inclure la hauteur des bâtiments + la distance due à l'angle de la lumière
        this.sunLight.shadow.camera.far = 500; // Doit être assez grand pour la "profondeur" vue par la lumière

        // Très important: Mettre à jour la matrice de projection après changement
        this.sunLight.shadow.camera.updateProjectionMatrix();
        // --- Fin Configuration Shadow Camera ---

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