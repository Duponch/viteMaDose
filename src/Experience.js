// src/Experience.js
import * as THREE from 'three';
import Stats from 'stats.js';
import Sizes from './Utils/Sizes.js';
import Time from './Utils/Time.js'; // <-- Time est déjà importé
import Camera from './Core/Camera.js';
import Renderer from './Core/Renderer.js';
import World from './Core/World.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import TimeUI from './UI/TimeUI.js';
import TimeControlUI from './UI/TimeControlUI.js'; // <-- Importer la nouvelle UI

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
        this.time = new Time(); // <-- L'instance Time est créée ici
        this.scene = new THREE.Scene();
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        this.world = new World(this);

        // --- Instancier les UIs APRÈS la création de Time et World ---
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this); // <-- Créer l'instance TimeControlUI

        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;

        // --- Initialisation de Stats.js ---
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        // La boucle update écoute déjà le 'tick' de Time
        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);
    }

    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        this.stats.begin();

        // Le delta utilisé ici est maintenant le delta ajusté par Time.js
        const deltaTime = this.time.delta;

        this.controls.update();
        this.camera.update();
        // World.update utilise experience.time.delta, donc il utilisera aussi le temps ajusté
        this.world.update();
        this.renderer.update();

        // --- Mettre à jour les UIs si nécessaire (TimeUI a besoin de l'heure, TimeControlUI réagit aux events) ---
        if (this.timeUI) {
            this.timeUI.update();
        }
        // if (this.timeControlUI) {
        //     this.timeControlUI.update(); // Probablement pas nécessaire
        // }

        this.stats.end();
    }

    destroy() {
        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler); // On retire l'écouteur principal

        // --- Détruire les UIs ---
        if (this.timeUI) {
            this.timeUI.destroy();
            this.timeUI = null;
        }
        if (this.timeControlUI) {
            this.timeControlUI.destroy(); // <-- Appeler la destruction de TimeControlUI
            this.timeControlUI = null;
        }

        // --- Détruire le monde ---
        this.world.destroy();

        // ... (reste du nettoyage : controls, renderer, stats)
        this.controls.dispose();
        this.renderer.instance.dispose();
        if (this.stats.dom.parentNode) {
             document.body.removeChild(this.stats.dom);
        }

        // Nettoyer l'instance Time elle-même si nécessaire (arrêter son requestAnimationFrame ?)
        // Pour l'instant, on le laisse tourner car il ne consomme pas grand chose une fois l'experience détruite.
        // Si Time avait des listeners internes ou des ressources lourdes, il faudrait une méthode destroy() dans Time.js

        instance = null;
        console.log("Experience détruite.");
    }
}