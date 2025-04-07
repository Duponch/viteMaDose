import * as THREE from 'three';
import Stats from 'stats.js';
import Sizes from './Utils/Sizes.js';
import Time from './Utils/Time.js';
import Camera from './Core/Camera.js';
import Renderer from './Core/Renderer.js';
import World from './Core/World.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let instance = null;

export default class Experience {
    constructor(canvas) {
        // singleton...
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

        // --- Initialisation de Stats.js ---
        this.stats = new Stats();
        // Vous pouvez configurer le mode (0: FPS, 1: ms, etc.)
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);
        // --- Fin initialisation Stats.js ---

        // --- Utiliser addEventListener au lieu de on ---
        this.resizeHandler = () => this.resize(); // Pour removeEventListener plus tard
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update(); // Pour removeEventListener plus tard
        this.time.addEventListener('tick', this.updateHandler);
    }

    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        // Commencez la mesure
        this.stats.begin();

        this.controls.update();
        this.camera.update();
        this.world.update();
        this.renderer.update();

        // Fin de la mesure
        this.stats.end();
    }

    destroy() {
        // --- Nettoyage des EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);

        // Traverse la scène et effectuez le nettoyage nécessaire...
        // (reste identique)

        this.controls.dispose(); // Dispose OrbitControls
        this.renderer.instance.dispose();

        // Supprimez l'élément Stats du DOM
        document.body.removeChild(this.stats.dom);

        instance = null;
        // Potentiellement supprimer d'autres listeners globaux si ajoutés
        // window.removeEventListener(...)
    }
}