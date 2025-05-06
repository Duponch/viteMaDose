// src/Core/Controls/ClassicControls.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default class ClassicControls {
    constructor(experience) {
        this.experience = experience;
        this.camera = this.experience.camera;
        this.canvas = this.experience.canvas;
        
        // Créer les contrôles OrbitControls
        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;
        
        // État initial
        this.isActive = true;
        
        console.log("ClassicControls initialisés");
    }
    
    update() {
        if (this.isActive && this.controls) {
            this.controls.update();
        }
    }
    
    enable() {
        if (this.controls) {
            this.controls.enabled = true;
            this.isActive = true;
        }
    }
    
    disable() {
        if (this.controls) {
            this.controls.enabled = false;
            this.isActive = false;
        }
    }
    
    // Méthodes pour la compatibilité avec le code existant
    get target() {
        return this.controls ? this.controls.target : new THREE.Vector3();
    }
    
    set target(newTarget) {
        if (this.controls && newTarget instanceof THREE.Vector3) {
            this.controls.target.copy(newTarget);
        }
    }
    
    // Méthode pour définir le point de vue
    lookAt(position) {
        if (this.controls && position instanceof THREE.Vector3) {
            this.controls.target.copy(position);
        }
    }
    
    destroy() {
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }
        this.experience = null;
        this.camera = null;
        this.canvas = null;
    }
} 