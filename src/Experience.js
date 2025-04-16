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

export default class Experience extends EventTarget {
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
        this.originalFog = new THREE.FogExp2(0x1e2a36, 0.003);
        this.scene.fog = this.originalFog;
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        this.world = new World(this);
        this.isDebugMode = false;
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this);
        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedAgent = null;
        this.isFollowingAgent = false;

        // --- NOUVEAU: Variables pour détecter clic vs drag ---
        this.mouseDownTime = 0;
        this.mouseDownPosition = { x: null, y: null };
        this.MAX_CLICK_DURATION = 200; // ms maximum pour être un clic
        this.MAX_CLICK_DISTANCE_SQ = 25; // Distance max (au carré) pour être un clic (5*5 pixels)
        // --------------------------------------------------

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        // --- MODIFIÉ: Remplacer 'click' par 'mousedown' et 'mouseup' ---
        // this.clickHandler = (event) => this.handleCanvasClick(event); // ANCIEN
        // this.canvas.addEventListener('click', this.clickHandler);    // ANCIEN

        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this);
        this.canvas.addEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.addEventListener('mouseup', this._boundHandleMouseUp);
        // --------------------------------------------------------------

        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
    }

    // --- SUPPRIMÉ: handleCanvasClick n'est plus utilisé directement ---
    // handleCanvasClick(event) { ... ancien code ... }
    // -----------------------------------------------------------------

    // --- NOUVEAU: Gestionnaires mousedown/mouseup ---
    _handleMouseDown(event) {
        // Enregistrer l'heure et la position de départ du clic gauche
        if (event.button === 0) { // Bouton gauche
            this.mouseDownTime = Date.now();
            this.mouseDownPosition.x = event.clientX;
            this.mouseDownPosition.y = event.clientY;
        }
    }

    _handleMouseUp(event) {
        // Ne traiter que le relâchement du bouton gauche
        if (event.button !== 0) return;

        const upTime = Date.now();
        const clickDuration = upTime - this.mouseDownTime;

        // Calculer la distance (au carré) parcourue par la souris
        const deltaX = event.clientX - this.mouseDownPosition.x;
        const deltaY = event.clientY - this.mouseDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        // Vérifier si c'est un clic (court et peu de mouvement)
        if (clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ) {
            // --- C'est un CLIC : Exécuter la logique de sélection/désélection ---
            console.log("Click détecté."); // Debug

            // 1. Normaliser les coordonnées de la souris (du mouseup)
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;

            // 2. Mettre à jour le Raycaster
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            // 3. Déterminer les objets à intersecter
            const agentManager = this.world?.agentManager;
            if (!agentManager || !agentManager.instanceMeshes || !agentManager.agents) {
                console.warn("MouseUp Handler (Click): AgentManager non prêt.");
                this.deselectAgent(); // Désélectionner par sécurité si agent manager n'est pas prêt
                return;
            }
            const objectsToIntersect = [];
            if (agentManager.instanceMeshes.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
            if (agentManager.instanceMeshes.head) objectsToIntersect.push(agentManager.instanceMeshes.head);

            if (objectsToIntersect.length === 0) {
                console.warn("MouseUp Handler (Click): Aucun InstancedMesh d'agent trouvé.");
                this.deselectAgent();
                return;
            }

            // 4. Lancer l'intersection
            const intersects = this.raycaster.intersectObjects(objectsToIntersect, false);

            let agentClicked = false;
            if (intersects.length > 0) {
                const firstIntersect = intersects[0];
                if (firstIntersect.instanceId !== undefined) {
                    const agentInstanceId = firstIntersect.instanceId;
                    const clickedAgent = agentManager.agents[agentInstanceId];
                    if (clickedAgent) {
                        console.log(`Agent cliqué (via MouseUp): ${clickedAgent.id}`);
                        this.selectAgent(clickedAgent);
                        agentClicked = true;
                    } else {
                        console.warn(`Agent logique non trouvé pour instanceId ${agentInstanceId} (via MouseUp)`);
                    }
                }
            }

            // 5. Si on n'a PAS cliqué sur un agent, désélectionner
            if (!agentClicked) {
                this.deselectAgent();
            }
            // --- Fin logique Clic ---

        } else {
            // --- C'est un DRAG (ou clic long) ---
            console.log("Drag détecté (ou clic long), pas de sélection/désélection."); // Debug
            // Ne rien faire ici concernant la sélection/désélection.
            // La rotation de la caméra pendant le drag a été gérée par les listeners de Camera.js.
        }

        // Réinitialiser pour le prochain clic
        this.mouseDownTime = 0;
        this.mouseDownPosition.x = null;
        this.mouseDownPosition.y = null;
    }
    // --- Fin NOUVEAU ---

    // ... (selectAgent, deselectAgent, enableDebugMode, etc. restent identiques) ...
    selectAgent(agent) {
        if (this.selectedAgent === agent) return; // Déjà sélectionné

        this.selectedAgent = agent;
        this.isFollowingAgent = true;
        this.controls.enabled = false; // Désactiver OrbitControls
        this.camera.followAgent(agent); // Dire à la caméra de suivre
        console.log(`Camera following agent: ${agent.id}`);
    }

	deselectAgent() {
        // Ne désélectionner que s'il y a un agent sélectionné
        if (!this.isFollowingAgent && !this.selectedAgent) return;

        console.log(`Camera stopped following agent: ${this.selectedAgent?.id ?? 'None'}`);
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        if(this.controls) this.controls.enabled = true; // Réactiver OrbitControls (vérifier si controls existe)
        if(this.camera) this.camera.stopFollowing(); // Dire à la caméra d'arrêter (vérifier si camera existe)
    }

    enableDebugMode() {
        if (!this.isDebugMode) {
            this.isDebugMode = true;
            console.log("Debug Mode ENABLED");
            if (this.scene) {
                this.scene.fog = null;
                console.log("  [Experience Debug] Fog disabled.");
            }
            if(this.world) this.world.setDebugMode(true);
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: true } }));
        }
    }

    disableDebugMode() {
        if (this.isDebugMode) {
            this.isDebugMode = false;
            console.log("Debug Mode DISABLED");
             if (this.scene && this.originalFog) {
                 this.scene.fog = this.originalFog;
                 console.log("  [Experience Debug] Fog enabled.");
             }
            if(this.world) this.world.setDebugMode(false);
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

    resize() {
        if(this.camera) this.camera.resize();
        if(this.renderer) this.renderer.resize();
    }

    update() {
        this.stats.begin();
        const deltaTime = this.time.delta;

        // Mettre à jour OrbitControls uniquement si l'agent n'est pas suivi
        if (!this.isFollowingAgent && this.controls?.enabled) {
             this.controls.update();
        }

        // Mettre à jour la caméra (qui gère le suivi si actif)
        if(this.camera) this.camera.update(deltaTime);

        // Mettre à jour le monde et ses composants
        if(this.world) this.world.update();

        // Faire le rendu
        if(this.renderer) this.renderer.update();

        // Mettre à jour l'UI
        if (this.timeUI) this.timeUI.update();
        // TimeControlUI est piloté par événements, pas besoin d'update ici a priori

        this.stats.end();
    }

    destroy() {
        console.log("Destroying Experience...");

        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        // --- MODIFIÉ: Retirer les listeners mousedown/mouseup ---
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);
        // ------------------------------------------------------

        // --- Détruire les UIs ---
        this.timeUI?.destroy(); this.timeUI = null;
        this.timeControlUI?.destroy(); this.timeControlUI = null;

        // --- Détruire la caméra et ses listeners ---
        this.camera?.destroy(); // Assurez-vous que destroy nettoie les listeners internes
        this.camera = null;

        // --- Détruire le monde ---
        this.world?.destroy(); this.world = null;

        // --- Reste du nettoyage ---
        this.controls?.dispose(); this.controls = null;
        this.renderer?.instance?.dispose(); this.renderer = null;

        if (this.stats?.dom.parentNode) { document.body.removeChild(this.stats.dom); }
        this.stats = null;
        this.scene = null;
        this.originalFog = null;
        this.sizes = null; this.time = null; this.canvas = null;
        this.raycaster = null; this.mouse = null; this.selectedAgent = null;

        instance = null;
        console.log("Experience détruite.");
    }
}