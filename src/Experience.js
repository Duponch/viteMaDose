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

        // --- NOUVEAU: Référence à l'élément tooltip et vecteur 3D ---
        this.tooltipElement = document.getElementById('agent-tooltip');
        this.tooltipTargetPosition = new THREE.Vector3(); // Pour calculer la position 3D de la cible
        // ------------------------------------------------------------

        // --- Variables clic vs drag ---
        this.mouseDownTime = 0;
        this.mouseDownPosition = { x: null, y: null };
        this.MAX_CLICK_DURATION = 200;
        this.MAX_CLICK_DISTANCE_SQ = 25;

        // --- EventListeners ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        // --- Gestionnaires mousedown/mouseup ---
        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this);
        this.canvas.addEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.addEventListener('mouseup', this._boundHandleMouseUp);

        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
    }

    _handleMouseDown(event) {
        if (event.button === 0) {
            this.mouseDownTime = Date.now();
            this.mouseDownPosition.x = event.clientX;
            this.mouseDownPosition.y = event.clientY;
        }
    }

    _handleMouseUp(event) {
        if (event.button !== 0) return;
        const upTime = Date.now();
        const clickDuration = upTime - this.mouseDownTime;
        const deltaX = event.clientX - this.mouseDownPosition.x;
        const deltaY = event.clientY - this.mouseDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        if (clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ) {
            console.log("Click détecté.");
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            const agentManager = this.world?.agentManager;
            if (!agentManager || !agentManager.instanceMeshes || !agentManager.agents) {
                this.deselectAgent();
                return;
            }
            const objectsToIntersect = [];
            if (agentManager.instanceMeshes.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
            if (agentManager.instanceMeshes.head) objectsToIntersect.push(agentManager.instanceMeshes.head);

            if (objectsToIntersect.length === 0) {
                this.deselectAgent();
                return;
            }
            const intersects = this.raycaster.intersectObjects(objectsToIntersect, false);
            let agentClicked = false;
            if (intersects.length > 0) {
                const firstIntersect = intersects[0];
                if (firstIntersect.instanceId !== undefined) {
                    const agentInstanceId = firstIntersect.instanceId;
                    const clickedAgent = agentManager.agents[agentInstanceId];
                    if (clickedAgent) {
                        console.log(`Agent cliqué (via MouseUp): ${clickedAgent.id}`);
                        this.selectAgent(clickedAgent); // Sélectionne l'agent
                        agentClicked = true;
                    }
                }
            }
            if (!agentClicked) {
                this.deselectAgent(); // Désélectionne si clic dans le vide
            }
        } else {
            console.log("Drag détecté (ou clic long), pas de sélection/désélection.");
        }
        this.mouseDownTime = 0;
        this.mouseDownPosition.x = null;
        this.mouseDownPosition.y = null;
    }

    selectAgent(agent) {
        if (this.selectedAgent === agent) return;

        this.selectedAgent = agent;
        this.isFollowingAgent = true;
        this.controls.enabled = false;
        this.camera.followAgent(agent);
        console.log(`Camera following agent: ${agent.id}`);

        // --- NOUVEAU: Afficher et mettre à jour le tooltip ---
        if (this.tooltipElement) {
            this.updateTooltipContent(agent); // Met à jour le contenu
            this.tooltipElement.style.display = 'block'; // Rend visible
            // La position sera mise à jour dans update()
        }
        // -----------------------------------------------------
    }

	deselectAgent() {
        // --- NOUVEAU: Cacher le tooltip ---
        if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
             this.tooltipElement.style.display = 'none';
        }
        // ----------------------------------

        // Logique existante
        if (!this.isFollowingAgent && !this.selectedAgent) return;
        console.log(`Camera stopped following agent: ${this.selectedAgent?.id ?? 'None'}`);
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        if(this.controls) this.controls.enabled = true;
        if(this.camera) this.camera.stopFollowing();
    }

    // --- NOUVELLE MÉTHODE: Mettre à jour le contenu du tooltip ---
    updateTooltipContent(agent) {
      if (!agent || !this.tooltipElement) return;
      const content = `
        ID: ${agent.id}<br>
        State: ${agent.currentState || 'N/A'}<br>
        Home: ${agent.homeBuildingId || 'N/A'}<br>
        Work: ${agent.workBuildingId || 'N/A'}
      `;
      // Ajoute une vérification pour éviter d'écrire dans le DOM si le contenu n'a pas changé
      if (this.tooltipElement.innerHTML !== content) {
        this.tooltipElement.innerHTML = content;
      }
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

        if (!this.isFollowingAgent && this.controls?.enabled) {
             this.controls.update();
        }
        if(this.camera) this.camera.update(deltaTime);
        if(this.world) this.world.update();
        if(this.renderer) this.renderer.update();
        if (this.timeUI) this.timeUI.update();

        // --- NOUVEAU: Mise à jour position et contenu du tooltip ---
        if (this.selectedAgent && this.tooltipElement) {
            // 1. Mettre à jour le contenu (au cas où l'état change)
            this.updateTooltipContent(this.selectedAgent);

            // 2. Calculer la position 3D cible (approximativement au-dessus de la tête)
            this.tooltipTargetPosition.copy(this.selectedAgent.position);
            // Approximation de la hauteur de la tête basée sur l'échelle et l'offset Y
            // Ajustez la valeur '8.0' si nécessaire pour mieux correspondre à la hauteur visuelle
            const headHeightOffset = 8.0 * this.selectedAgent.scale;
            this.tooltipTargetPosition.y += this.selectedAgent.yOffset + headHeightOffset;

            // 3. Ajouter un petit décalage vers la droite relative à l'agent
            const rightOffset = new THREE.Vector3(1, 0, 0); // Direction locale droite
            rightOffset.applyQuaternion(this.selectedAgent.orientation); // Tourner selon l'agent
            rightOffset.multiplyScalar(3.0 * this.selectedAgent.scale); // Ajuster la distance de décalage
            this.tooltipTargetPosition.add(rightOffset);


            // 4. Projeter la position 3D en coordonnées écran 2D
            // Cloner le vecteur avant de le projeter pour ne pas modifier l'original si réutilisé
            const projectedPosition = this.tooltipTargetPosition.clone();
            projectedPosition.project(this.camera.instance);

            // Empêcher l'affichage si l'agent est derrière la caméra
            if (projectedPosition.z < 1) {
                // 5. Convertir les coordonnées normalisées (-1 à +1) en pixels
                const screenX = (projectedPosition.x * 0.5 + 0.5) * this.sizes.width;
                const screenY = (-projectedPosition.y * 0.5 + 0.5) * this.sizes.height;

                // 6. Appliquer les styles pour positionner le tooltip
                this.tooltipElement.style.left = `${screenX}px`;
                this.tooltipElement.style.top = `${screenY}px`;

                 // S'assurer qu'il est visible (au cas où il aurait été caché par la logique de z<1)
                 if (this.tooltipElement.style.display === 'none') {
                    this.tooltipElement.style.display = 'block';
                 }

            } else {
                // Cacher le tooltip si l'agent est derrière la caméra
                if (this.tooltipElement.style.display !== 'none') {
                    this.tooltipElement.style.display = 'none';
                }
            }

        } else {
             // S'assurer qu'il est caché si aucun agent n'est sélectionné
             if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
                 this.tooltipElement.style.display = 'none';
             }
        }
        // ----------------------------------------------------------

        this.stats.end();
    }

    destroy() {
        console.log("Destroying Experience...");

        // --- Nettoyage EventListeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);

        // --- NOUVEAU: Nettoyage référence tooltip ---
        this.tooltipElement = null;
        // --------------------------------------------

        // --- Reste du nettoyage ---
        this.timeUI?.destroy(); this.timeUI = null;
        this.timeControlUI?.destroy(); this.timeControlUI = null;
        this.camera?.destroy(); this.camera = null;
        this.world?.destroy(); this.world = null;
        this.controls?.dispose(); this.controls = null;
        this.renderer?.instance?.dispose(); this.renderer = null;
        if (this.stats?.dom.parentNode) { document.body.removeChild(this.stats.dom); }
        this.stats = null;
        this.scene = null;
        this.originalFog = null;
        this.sizes = null; this.time = null; this.canvas = null;
        this.raycaster = null; this.mouse = null; this.selectedAgent = null;
        this.tooltipTargetPosition = null; // Nettoyer le vecteur aussi

        instance = null;
        console.log("Experience détruite.");
    }
}