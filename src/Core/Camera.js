import * as THREE from 'three';

export default class Camera {
    constructor(experience) {
        this.experience = experience;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        this.setInstance();
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            45, // FOV (Champ de vision vertical)
            this.sizes.width / this.sizes.height, // Aspect Ratio
            0.1, // Near clipping plane
            500 // Far clipping plane (à ajuster selon la taille de la ville)
        );
        // Position initiale de la caméra (à ajuster)
        this.instance.position.set(50, 60, 50);
        this.scene.add(this.instance);
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }

    update() {
        // Logique de caméra spécifique si nécessaire (ex: suivi de personnage)
        // Pour l'instant, OrbitControls gère les mouvements
    }
}