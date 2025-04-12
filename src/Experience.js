/*
 * Fichier: src/Experience.js
 * Ajouts:
 * - Propriété `isDebugMode` et méthodes pour la gérer.
 * - Appel à `world.setDebugMode` lors du changement d'état.
 * - Dispatch d'un événement `debugmodechanged`.
 */
// src/Experience.js
import * as THREE from 'three';
import Stats from 'stats.js';
import Sizes from './Utils/Sizes.js';
import Time from './Utils/Time.js';
import Camera from './Core/Camera.js';
import Renderer from './Core/Renderer.js';
import World from './Core/World.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import TimeUI from './UI/TimeUI.js';
import TimeControlUI from './UI/TimeControlUI.js';

let instance = null;

export default class Experience extends EventTarget { // <-- Hériter de EventTarget
    constructor(canvas) {
        // --- Singleton ---
        if (instance) {
            return instance;
        }
        super(); // <-- Appel au constructeur parent
        instance = this;

        // --- Core components ---
        this.canvas = canvas;
        this.sizes = new Sizes();
        this.time = new Time();
        this.scene = new THREE.Scene();
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        this.world = new World(this);

        // --- Debug State ---
        this.isDebugMode = false; // Initial state

        // --- UI Components (Instantiated AFTER core components) ---
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this); // TimeControlUI écoutera les events

        // --- Controls & Stats ---
        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        // --- Initialisation ---
        // Appliquer l'état de debug initial (même si false)
        this.world.setDebugMode(this.isDebugMode);
        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
    }

    // --- Debug Mode Methods ---
    enableDebugMode() {
        if (!this.isDebugMode) {
            this.isDebugMode = true;
            console.log("Debug Mode ENABLED");
            this.world.setDebugMode(true);
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: true } }));
        }
    }

    disableDebugMode() {
        if (this.isDebugMode) {
            this.isDebugMode = false;
            console.log("Debug Mode DISABLED");
            this.world.setDebugMode(false);
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: false } }));
        }
    }

    toggleDebugMode() {
        if (this.isDebugMode) {
            this.disableDebugMode();
        } else {
            this.enableDebugMode();
        }
    }
    // --- End Debug Mode Methods ---


    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        this.stats.begin();

        const deltaTime = this.time.delta;

        this.controls.update();
        this.camera.update();
        this.world.update(); // World update utilise déjà experience.time.delta
        this.renderer.update();

        if (this.timeUI) {
            this.timeUI.update();
        }
        // TimeControlUI se met à jour via les événements

        this.stats.end();
    }

    destroy() {
        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);

        // --- Détruire les UIs ---
        if (this.timeUI) {
            this.timeUI.destroy();
            this.timeUI = null;
        }
        if (this.timeControlUI) {
            this.timeControlUI.destroy();
            this.timeControlUI = null;
        }

        // --- Détruire le monde ---
        this.world.destroy();

        // --- Reste du nettoyage ---
        this.controls.dispose();
        this.renderer.instance.dispose();
        if (this.stats.dom.parentNode) {
             document.body.removeChild(this.stats.dom);
        }

        instance = null;
        console.log("Experience détruite.");
    }
}