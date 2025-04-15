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
        this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);

        // --- Core Components Suite ---
        this.camera = new Camera(this); // <-- Instance Camera modifiée
        this.renderer = new Renderer(this);
        this.world = new World(this);

        // --- Debug State ---
        this.isDebugMode = false;

        // --- UI Components ---
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this);

        // --- Controls & Stats ---
        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        // --- Raycasting & Agent Selection --- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< NOUVEAU
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedAgent = null; // Agent actuellement suivi
        this.isFollowingAgent = false; // État du suivi caméra
        // Définir les couches pour le raycasting (optionnel mais bonne pratique)
        // this.raycaster.layers.set(AGENT_LAYER); // Si vous utilisez des layers

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        // --- NOUVEL ÉCOUTEUR POUR LE CLIC --- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< NOUVEAU
        this.clickHandler = (event) => this.handleCanvasClick(event);
        this.canvas.addEventListener('click', this.clickHandler);
        // ---------------------------------------

        // --- Initialisation ---
        this.world.setDebugMode(this.isDebugMode);
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

        const deltaTime = this.time.delta; // Temps écoulé depuis la dernière frame en ms

        // Mettre à jour les contrôles Orbit SEULEMENT si on ne suit pas un agent
        if (!this.isFollowingAgent && this.controls.enabled) {
            this.controls.update(); // Applique le damping etc.
        }

        // La caméra se met toujours à jour (gère le suivi OU attend OrbitControls)
        this.camera.update(deltaTime); // << Passer deltaTime à la caméra

        // Mises à jour du monde et du rendu (inchangées)
        this.world.update(); // World utilise déjà experience.time.delta
        this.renderer.update();

        if (this.timeUI) {
            this.timeUI.update();
        }
        // TimeControlUI se met à jour via les événements

        this.stats.end();
    }

    destroy() {
        console.log("Destroying Experience..."); // Log ajouté

        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('click', this.clickHandler); // << Nettoyer le listener de clic

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
        if (this.world) { // Vérifier si world existe
           this.world.destroy();
           this.world = null; // << S'assurer de nullifier world
        }


        // --- Reste du nettoyage ---
        if (this.controls) { // Vérifier si controls existe
             this.controls.dispose();
             this.controls = null; // << Nullifier controls
        }
        if (this.renderer) { // Vérifier si renderer existe
            // La disposition du renderer se fait dans sa propre classe destroy potentiellement
            // this.renderer.destroy(); // Si une méthode destroy existe
             this.renderer.instance?.dispose(); // Dispose WebGL context
             this.renderer = null; // << Nullifier renderer
        }

        // Caméra est gérée par Three.js, pas de dispose direct nécessaire normalement
        this.camera = null; // << Nullifier camera

        if (this.stats?.dom.parentNode) {
             document.body.removeChild(this.stats.dom);
        }
        this.stats = null; // << Nullifier stats

        // Nettoyer les variables de Experience
        this.scene = null;
        this.sizes = null;
        this.time = null;
        this.canvas = null;
        this.raycaster = null;
        this.mouse = null;
        this.selectedAgent = null;


        instance = null; // Très important pour le singleton
        console.log("Experience détruite.");
    }
}