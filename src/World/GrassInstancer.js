import * as THREE from 'three';

export default class GrassInstancer {
    constructor(config) {
        this.config = config;
        this.instanceNumber = 5000; // Nombre d'instances d'herbe par parcelle
        this.dummy = new THREE.Object3D();
        this.clock = new THREE.Clock();
        
        // Création de la géométrie de base pour une brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.1, 1, 1, 4);
        this.geometry.translate(0, 0.5, 0); // Déplacer le point le plus bas à 0

        // Création du matériau standard qui réagira naturellement à la lumière
        this.leavesMaterial = new THREE.MeshStandardMaterial({
            color: 0x61874c, // Même couleur que le sol des parcelles de type parc et maison
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        // Activer la réception des ombres pour la géométrie
        this.geometry.computeVertexNormals();
    }

    createGrassInstances(plot) {
        const instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.leavesMaterial,
            this.instanceNumber
        );

        // Activer la réception des ombres pour l'InstancedMesh
        instancedMesh.receiveShadow = true;
        instancedMesh.castShadow = false; // L'herbe ne projette pas d'ombres

        // Positionner et échelonner les instances d'herbe aléatoirement dans la parcelle
        for (let i = 0; i < this.instanceNumber; i++) {
            this.dummy.position.set(
                plot.x + (Math.random() * plot.width),
                0,
                plot.z + (Math.random() * plot.depth)
            );
            
            this.dummy.scale.setScalar(0.5 + Math.random() * 0.5);
            this.dummy.rotation.y = Math.random() * Math.PI;
            
            this.dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        return instancedMesh;
    }

    update() {
        // Plus besoin de mettre à jour le temps car nous n'utilisons plus de shader personnalisé
    }

    reset() {
        // Plus besoin de réinitialiser le temps
    }
} 