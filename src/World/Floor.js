import * as THREE from 'three';

export default class Floor {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;

        this.setGeometry();
        this.setMaterial();
        this.setMesh();
    }

    setGeometry() {
        // Un grand plan pour le sol
        this.geometry = new THREE.PlaneGeometry(500, 500); // Taille assez grande
    }

    setMaterial() {
        // Matériau simple pour le sol
        this.material = new THREE.MeshStandardMaterial({
            color: 0x888888, // Gris
            metalness: 0.1, // Peu métallique
            roughness: 0.8  // Assez rugueux
        });
    }

    setMesh() {
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.rotation.x = -Math.PI * 0.5; // Orienter le plan horizontalement
        this.mesh.position.y = -0.01; // Légèrement en dessous de 0 pour éviter z-fighting
        this.mesh.receiveShadow = true; // Le sol reçoit les ombres
    }
}