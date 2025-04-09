// src/Experience.js
import * as THREE from 'three';
import Stats from 'stats.js';
import Sizes from './Utils/Sizes.js';
import Time from './Utils/Time.js';
import Camera from './Core/Camera.js';
import Renderer from './Core/Renderer.js';
import World from './Core/World.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import TimeUI from './UI/TimeUI.js'; // <-- Importer TimeUI

let instance = null;

export default class Experience {
    constructor(canvas) {
        // ... (singleton)
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
        this.world = new World(this); // World est créé ici

        // --- Instancier TimeUI APRÈS la création de World ---
        // World a besoin d'être créé pour que l'environnement soit accessible
        // Note: L'initialisation de l'environnement est asynchrone,
        // TimeUI gère le cas où l'environnement n'est pas encore prêt.
        this.timeUI = new TimeUI(this); // <-- Créer l'instance TimeUI

        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;

        // --- Initialisation de Stats.js ---
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        // IMPORTANT : Attendre potentiellement que le monde soit prêt
        // avant de lancer certaines logiques si nécessaire, mais pour l'UI,
        // elle peut se mettre à jour dès le début (elle affichera --:-- tant que l'env n'est pas prêt)
    }

    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        this.stats.begin();

        this.controls.update();
        this.camera.update();
        this.world.update(); // Met à jour l'environnement et son cycleTime
        this.renderer.update();

        // --- Mettre à jour l'UI de l'heure ---
        if (this.timeUI) {
            this.timeUI.update(); // <-- Appeler la mise à jour de TimeUI
        }

        this.stats.end();
    }

    destroy() {
        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);

        // --- Détruire l'UI ---
        if (this.timeUI) {
            this.timeUI.destroy(); // <-- Appeler la destruction de TimeUI
            this.timeUI = null;
        }

        // --- Détruire le monde ---
        this.world.destroy(); // S'assurer que le monde nettoie aussi (y compris l'environnement)

        // ... (reste du nettoyage : controls, renderer, stats)
        this.controls.dispose();
        this.renderer.instance.dispose();
        if (this.stats.dom.parentNode) {
             document.body.removeChild(this.stats.dom);
        }

        instance = null;
        console.log("Experience détruite.");
    }
}