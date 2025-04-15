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
        super();
        instance = this;

        // --- Core components ---
        this.canvas = canvas;
        this.sizes = new Sizes();
        this.time = new Time();
        this.scene = new THREE.Scene();

        // --- Fog ---
        const fogColor = 0x1e2a36;
        const fogDensity = 0.003;
        // Créez l'objet fog
        this.originalFog = new THREE.FogExp2(fogColor, fogDensity); // <-- Stocker l'instance originale
        this.scene.fog = this.originalFog; // Appliquer initialement

        // --- Core Components Suite ---
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        this.world = new World(this);

        // --- Debug State ---
        this.isDebugMode = false;
        // Appliquer l'état initial du fog basé sur isDebugMode (facultatif, car enable/disable le feront)
        // if (this.isDebugMode) {
        //     this.scene.fog = null;
        // }

        // --- UI Components ---
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this);

        // --- Controls & Stats ---
        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        // --- Raycasting & Agent Selection ---
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedAgent = null;
        this.isFollowingAgent = false;

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        this.clickHandler = (event) => this.handleCanvasClick(event);
        this.canvas.addEventListener('click', this.clickHandler);

        // --- Initialisation ---
        // World.setDebugMode gère maintenant les visuels de debug
        // Pas besoin d'appeler setDebugMode ici car l'état initial est false
        // Si vous vouliez démarrer en mode debug, vous mettriez isDebugMode=true et appelleriez enableDebugMode() ici.
        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
    }

	handleCanvasClick(event) {
        // 1. Normaliser les coordonnées de la souris
        this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
        this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;

        // 2. Mettre à jour le Raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera.instance);

        // 3. Déterminer les objets à intersecter (les InstancedMesh des agents)
        const agentManager = this.world?.agentManager;
        if (!agentManager || !agentManager.instanceMeshes || !agentManager.agents) {
            console.warn("Click Handler: AgentManager non prêt ou pas d'agents.");
            return;
        }

        // Ciblez les parties visibles des agents (ex: torse, tête)
        const objectsToIntersect = [];
        if (agentManager.instanceMeshes.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
        if (agentManager.instanceMeshes.head) objectsToIntersect.push(agentManager.instanceMeshes.head);
        // Ajoutez d'autres parties si nécessaire

        if (objectsToIntersect.length === 0) {
            console.warn("Click Handler: Aucun InstancedMesh d'agent trouvé à intersecter.");
            return;
        }

        // 4. Lancer l'intersection
        const intersects = this.raycaster.intersectObjects(objectsToIntersect, false); // false = ne pas tester les enfants récursivement

        let agentClicked = false;
        if (intersects.length > 0) {
            const firstIntersect = intersects[0];
            // Vérifier si l'intersection a un instanceId (spécifique à InstancedMesh)
            if (firstIntersect.instanceId !== undefined) {
                const agentInstanceId = firstIntersect.instanceId;
                // Trouver l'agent logique correspondant
                const clickedAgent = agentManager.agents[agentInstanceId]; // Accès direct si l'indice correspond

                if (clickedAgent) {
                    console.log(`Agent cliqué: ${clickedAgent.id} (Instance ID: ${agentInstanceId})`);
                    this.selectAgent(clickedAgent);
                    agentClicked = true;
                } else {
                    console.warn(`Agent logique non trouvé pour instanceId ${agentInstanceId}`);
                }
            }
        }

        // 5. Si on n'a PAS cliqué sur un agent, désélectionner
        if (!agentClicked) {
            this.deselectAgent();
        }
    }

	selectAgent(agent) {
        if (this.selectedAgent === agent) return; // Déjà sélectionné

        this.selectedAgent = agent;
        this.isFollowingAgent = true;
        this.controls.enabled = false; // Désactiver OrbitControls
        this.camera.followAgent(agent); // Dire à la caméra de suivre
        console.log(`Camera following agent: ${agent.id}`);
        // Optionnel: ajouter un indicateur visuel sur l'agent sélectionné
    }

	deselectAgent() {
        if (!this.isFollowingAgent) return; // Déjà déselectionné

        console.log(`Camera stopped following agent: ${this.selectedAgent?.id}`);
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        this.controls.enabled = true; // Réactiver OrbitControls
        this.camera.stopFollowing(); // Dire à la caméra d'arrêter
        // Optionnel: retirer l'indicateur visuel
    }

    // --- Les autres méthodes (enableDebugMode, disableDebugMode, toggleDebugMode, resize, update, destroy) restent inchangées ---
    // ... (elles ne sont pas incluses ici car inchangées)

    // --- Debug Mode Methods ---
    enableDebugMode() {
        if (!this.isDebugMode) {
            this.isDebugMode = true;
            console.log("Debug Mode ENABLED");
            // --- Désactiver le brouillard ---
            if (this.scene) {
                this.scene.fog = null;
                console.log("  [Experience Debug] Fog disabled.");
            }
            // ---
            this.world.setDebugMode(true); // Mettre à jour les visuels
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: true } }));
        }
    }

    disableDebugMode() {
        if (this.isDebugMode) {
            this.isDebugMode = false;
            console.log("Debug Mode DISABLED");
             // --- Réactiver le brouillard ---
             if (this.scene && this.originalFog) {
                 this.scene.fog = this.originalFog;
                 console.log("  [Experience Debug] Fog enabled.");
             }
             // ---
            this.world.setDebugMode(false); // Cacher les visuels
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
        if (!this.isFollowingAgent && this.controls.enabled) { this.controls.update(); }
        this.camera.update(deltaTime);
        this.world.update();
        this.renderer.update();
        if (this.timeUI) { this.timeUI.update(); }
        this.stats.end();
    }

    destroy() {
        console.log("Destroying Experience...");

        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('click', this.clickHandler);

        // --- Détruire les UIs ---
        this.timeUI?.destroy(); this.timeUI = null;
        this.timeControlUI?.destroy(); this.timeControlUI = null;

        // --- Détruire le monde ---
        this.world?.destroy(); this.world = null;

        // --- Reste du nettoyage ---
        this.controls?.dispose(); this.controls = null;
        this.renderer?.instance?.dispose(); this.renderer = null;
        this.camera = null;
        if (this.stats?.dom.parentNode) { document.body.removeChild(this.stats.dom); }
        this.stats = null;
        this.scene = null; // La scène elle-même n'a pas de méthode destroy
        this.originalFog = null; // Nettoyer la référence au fog
        this.sizes = null; this.time = null; this.canvas = null;
        this.raycaster = null; this.mouse = null; this.selectedAgent = null;

        instance = null;
        console.log("Experience détruite.");
    }
}