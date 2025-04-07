import * as THREE from 'three';
import Sizes from './Utils/Sizes.js';
import Time from './Utils/Time.js';
import Camera from './Core/Camera.js';
import Renderer from './Core/Renderer.js';
import World from './Core/World.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let instance = null;

export default class Experience {
    constructor(canvas) {
        if (instance) {
            return instance;
        }
        instance = this;

        this.canvas = canvas;

        this.sizes = new Sizes();
        this.time = new Time();
        this.scene = new THREE.Scene();
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        this.world = new World(this);

        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;

        // --- Modifications ici ---
        // Utiliser addEventListener au lieu de on
        this.resizeHandler = () => this.resize(); // Garder une référence pour removeEventListener
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update(); // Garder une référence
        this.time.addEventListener('tick', this.updateHandler);
        // --- Fin Modifications ---
    }

    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        this.controls.update();
        this.camera.update();
        this.world.update();
        this.renderer.update();
    }

    destroy() {
        // --- Modifications ici ---
        // Utiliser removeEventListener au lieu de off
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        // --- Fin Modifications ---

        // Traverse la scène... (reste identique)
        this.scene.traverse(/* ... */);

        this.controls.dispose(); // Dispose OrbitControls
        this.renderer.instance.dispose();

        instance = null;
        // Potentiellement supprimer d'autres listeners globaux si ajoutés
        // window.removeEventListener(...)
    }
}