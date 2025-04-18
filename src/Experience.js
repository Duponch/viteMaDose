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
import AgentStatsUI from './UI/AgentStatsUI.js';
// Import nécessaire pour la recherche de mesh par position
import { Matrix4, Vector3 } from 'three';

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
        // World initialise CityManager, qui initialise NavMeshManager, etc.
        this.world = new World(this);
        this.isDebugMode = false; // Mode debug global
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this);
		this.agentStatsUI = new AgentStatsUI(this);
        this.controls = new OrbitControls(this.camera.instance, this.canvas);
        this.controls.enableDamping = true;
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // --- Sélection Agent (INCHANGÉ) ---
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        this.tooltipElement = document.getElementById('agent-tooltip');
        if (this.tooltipElement) this.tooltipElement.dataset.uiInteractive = 'true';
		this.tooltipTargetPosition = new THREE.Vector3();

        // --- Sélection Bâtiment (INCHANGÉ) ---
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedBuildingInstanceId = -1;
        this.highlightMesh = null;
        this.buildingTooltipElement = document.getElementById('building-tooltip');
        if (this.buildingTooltipElement) this.buildingTooltipElement.dataset.uiInteractive = 'true';
		this.buildingTooltipTargetPosition = new THREE.Vector3();

        // --- STRUCTURE ÉTAT DEBUG (MODIFIÉE) ---
        // Remplacer navGrid par navMesh
        this.debugLayerVisibility = {
            district: {
                _showSubMenu: false, _visible: false, // Caché par défaut
                residential: true, business: true, industrial: true
            },
            plot: {
                _showSubMenu: false, _visible: false, // Caché par défaut
                house: true, building: true, industrial: true,
                skyscraper: true, park: true, unbuildable: false // Cacher non-constr. par défaut
            },
            buildingOutline: {
                 _showSubMenu: false, _visible: false, // Caché par défaut
                 house: true, building: true, industrial: true, skyscraper: true
            },
            // --- MODIFICATION ICI ---
            navMesh: { // <-- Renommé
                _visible: false // Pas de sous-menu pour le NavMesh a priori
            },
            // ----------------------
            agentPath: {
                _visible: false // Pas de sous-menu
            }
        };
        // --------------------------------------------

        // --- Variables clic vs drag (INCHANGÉ) ---
        this.mouseDownTime = 0;
        this.mouseDownPosition = { x: null, y: null };
        this.MAX_CLICK_DURATION = 200;
        this.MAX_CLICK_DISTANCE_SQ = 25;
        this.clickHandledByTooltip = false;

        // --- EventListeners (INCHANGÉ) ---
        this.resizeHandler = () => this.resize();
        this.sizes.addEventListener('resize', this.resizeHandler);

        this.updateHandler = () => this.update();
        this.time.addEventListener('tick', this.updateHandler);

        this._boundHandleMouseDown = this._handleMouseDown.bind(this);
        this._boundHandleMouseUp = this._handleMouseUp.bind(this);
        this.canvas.addEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.addEventListener('mouseup', this._boundHandleMouseUp);

        this._boundHandleBuildingTooltipClick = this._handleBuildingTooltipClick.bind(this);
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.addEventListener('click', this._boundHandleBuildingTooltipClick);
        }
        this._boundHandleAgentTooltipClick = this._handleAgentTooltipClick.bind(this);
        if (this.tooltipElement) {
            this.tooltipElement.addEventListener('click', this._boundHandleAgentTooltipClick);
        }

        this.createHighlightMesh(); // (INCHANGÉ)
        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
    }

    // --- _updateTooltipPosition (INCHANGÉ) ---
	_updateTooltipPosition(tooltipElement, targetPosition3D) {
        if (!tooltipElement || !targetPosition3D) { /* ... */ return; }
        const projectedPosition = targetPosition3D.clone().project(this.camera.instance);
        if (projectedPosition.z >= 1) { /* ... */ return; }
        const baseScreenX = (projectedPosition.x * 0.5 + 0.5) * this.sizes.width;
        const baseScreenY = (-projectedPosition.y * 0.5 + 0.5) * this.sizes.height;
        const initialDisplay = tooltipElement.style.display;
        tooltipElement.style.visibility = 'hidden'; tooltipElement.style.display = 'block';
        const tooltipWidth = tooltipElement.offsetWidth; const tooltipHeight = tooltipElement.offsetHeight;
        tooltipElement.style.display = initialDisplay;
        if (tooltipWidth <= 0 || tooltipHeight <= 0) { /* ... */ return; }
        const desiredOffsetX = 15;
        let desiredTopY = baseScreenY - tooltipHeight - 10;
        let finalScreenX = baseScreenX + desiredOffsetX;
        const margin = 10;
        if (finalScreenX + tooltipWidth > this.sizes.width - margin) finalScreenX = this.sizes.width - tooltipWidth - margin;
        else if (finalScreenX < margin) finalScreenX = margin;
        let finalScreenY = desiredTopY;
        if (finalScreenY < margin) finalScreenY = baseScreenY + 20;
        if (finalScreenY + tooltipHeight > this.sizes.height - margin) finalScreenY = this.sizes.height - tooltipHeight - margin;
        if (finalScreenY < margin) finalScreenY = margin;
        tooltipElement.style.left = `${Math.round(finalScreenX)}px`;
        tooltipElement.style.top = `${Math.round(finalScreenY)}px`;
        tooltipElement.style.visibility = 'visible';
        tooltipElement.style.display = 'block';
    }

    // --- createHighlightMesh (INCHANGÉ) ---
    createHighlightMesh() { /* ... */
        const highlightGeometry = new THREE.BoxGeometry(1.05, 1.05, 1.05);
        const highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff, transparent: true, opacity: 0.35,
            side: THREE.DoubleSide, depthWrite: false
        });
        this.highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        this.highlightMesh.name = "BuildingHighlight";
        this.highlightMesh.visible = false;
        this.highlightMesh.renderOrder = 1;
        this.scene.add(this.highlightMesh);
     }

    // --- _handleMouseDown, _handleMouseUp (INCHANGÉ) ---
    _handleMouseDown(event) { /* ... */
        if (event.button === 0) {
            this.mouseDownTime = Date.now();
            this.mouseDownPosition.x = event.clientX;
            this.mouseDownPosition.y = event.clientY;
        }
    }
    _handleMouseUp(event) { /* ... */
        if (this.clickHandledByTooltip) { this.clickHandledByTooltip = false; this.mouseDownTime = 0; /* ... */ return; }
        if (event.button !== 0) return;
        const upTime = Date.now(); const clickDuration = upTime - this.mouseDownTime;
        const deltaX = event.clientX - this.mouseDownPosition.x; const deltaY = event.clientY - this.mouseDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        if (clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ) {
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            const objectsToIntersect = [];
            const agentManager = this.world?.agentManager;
            const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;
            if (agentManager?.instanceMeshes?.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
            if (agentManager?.instanceMeshes?.head) objectsToIntersect.push(agentManager.instanceMeshes.head);
            if (instancedMeshManager?.instancedMeshes) {
                for (const key in instancedMeshManager.instancedMeshes) {
                    if (key.startsWith('house_') || key.startsWith('building_') || key.startsWith('skyscraper_') || key.startsWith('industrial_')) {
                        objectsToIntersect.push(instancedMeshManager.instancedMeshes[key]);
                    }
                }
            }
            if (objectsToIntersect.length === 0) { this.deselectAgent(); this.deselectBuilding(); return; }

            const intersects = this.raycaster.intersectObjects(objectsToIntersect, false);
            let clickedOnSomething = false;
            if (intersects.length > 0) {
                const firstIntersect = intersects[0]; const clickedObject = firstIntersect.object;
                if (agentManager && agentManager.agents && (clickedObject === agentManager.instanceMeshes.torso || clickedObject === agentManager.instanceMeshes.head) && firstIntersect.instanceId !== undefined) {
                    const clickedAgent = agentManager.agents[firstIntersect.instanceId];
                    if (clickedAgent) { this.deselectBuilding(); this.selectAgent(clickedAgent); clickedOnSomething = true; }
                } else if (instancedMeshManager && firstIntersect.instanceId !== undefined && clickedObject instanceof THREE.InstancedMesh) {
                    const instanceId = firstIntersect.instanceId; const clickedMesh = clickedObject;
                    const tempMatrix = new THREE.Matrix4(); clickedMesh.getMatrixAt(instanceId, tempMatrix);
                    const worldPosition = new THREE.Vector3(); worldPosition.setFromMatrixPosition(tempMatrix);
                    const citizenManager = this.world?.cityManager?.citizenManager;
                    let closestBuilding = null; let minDistSq = Infinity; const toleranceSq = 50.0; // Augmenté
                    if (citizenManager?.buildingInstances) {
                        citizenManager.buildingInstances.forEach(buildingInfo => {
                            const distSq = worldPosition.distanceToSquared(buildingInfo.position);
                            if (distSq < minDistSq && distSq < toleranceSq) { minDistSq = distSq; closestBuilding = buildingInfo; }
                        });
                    }
                    if (closestBuilding) { this.deselectAgent(); this.selectBuilding(closestBuilding, clickedMesh, instanceId); clickedOnSomething = true; }
                }
            }
            if (!clickedOnSomething) { this.deselectAgent(); this.deselectBuilding(); }
        }
        this.mouseDownTime = 0; this.mouseDownPosition.x = null; this.mouseDownPosition.y = null;
    }

    // --- _handleAgentTooltipClick, _handleBuildingTooltipClick (INCHANGÉ) ---
    _handleAgentTooltipClick(event) { /* ... */
        const clickedLink = event.target.closest('.building-id-link');
        if (clickedLink) {
            const buildingId = clickedLink.dataset.buildingId;
            if (buildingId && buildingId !== 'N/A') {
                const citizenManager = this.world?.cityManager?.citizenManager;
                const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;
                if (!citizenManager || !instancedMeshManager) return;
                const buildingInfo = citizenManager.getBuildingInfo(buildingId);
                if (!buildingInfo) return;
                let foundMesh = null; let foundInstanceId = -1; let minDistanceSq = Infinity;
                const targetPosition = buildingInfo.position; const searchToleranceSq = 50.0;
                const tempMatrix = new Matrix4(); const instancePosition = new Vector3();
                for (const key in instancedMeshManager.instancedMeshes) {
                    if (key.startsWith('house_') || key.startsWith('building_') || key.startsWith('skyscraper_') || key.startsWith('industrial_')) {
                        const mesh = instancedMeshManager.instancedMeshes[key];
                        for (let i = 0; i < mesh.count; i++) {
                            mesh.getMatrixAt(i, tempMatrix); instancePosition.setFromMatrixPosition(tempMatrix);
                            const distSq = instancePosition.distanceToSquared(targetPosition);
                            if (distSq < minDistanceSq && distSq < searchToleranceSq) { minDistanceSq = distSq; foundMesh = mesh; foundInstanceId = i; }
                        }
                    }
                }
                if (foundMesh && foundInstanceId !== -1) { this.deselectAgent(); this.selectBuilding(buildingInfo, foundMesh, foundInstanceId); this.clickHandledByTooltip = true; }
            }
        }
     }
    _handleBuildingTooltipClick(event) { /* ... */
        const clickedLink = event.target.closest('.resident-id-link');
        if (clickedLink) {
            const agentId = clickedLink.dataset.agentId;
            if (agentId) {
                const agentManager = this.world?.agentManager;
                const agentToSelect = agentManager?.agents.find(a => a.id === agentId);
                if (agentToSelect) { this.deselectBuilding(); this.selectAgent(agentToSelect); this.clickHandledByTooltip = true; }
                else { console.warn(`Agent avec ID ${agentId} non trouvé.`); }
            }
        }
     }

    // --- selectAgent, deselectAgent, selectBuilding, deselectBuilding (INCHANGÉ) ---
    // Ces méthodes gèrent la sélection logique et visuelle (tooltip, highlight, caméra)
    selectAgent(agent) { /* ... code inchangé (inclut moveToTarget pour transition) ... */
        if (!agent || this.selectedAgent === agent) return;
        this.deselectBuilding();
        const agentIsInside = agent.currentState === 'AT_HOME' || agent.currentState === 'AT_WORK';
        const citizenManager = this.world?.cityManager?.citizenManager;
        if (agentIsInside && citizenManager) {
            const buildingId = agent.currentState === 'AT_HOME' ? agent.homeBuildingId : agent.workBuildingId;
            const buildingInfo = citizenManager.getBuildingInfo(buildingId);
            if (buildingInfo) {
                 this.selectedAgent = agent; this.isFollowingAgent = false; this.controls.enabled = true;
                 const buildingPos = buildingInfo.position;
                 const camTargetPos = new THREE.Vector3(buildingPos.x, buildingPos.y + 60, buildingPos.z + 40);
                 this.camera.moveToTarget(camTargetPos, buildingPos.clone(), 1200, null);
                 if (this.tooltipElement) this.updateTooltipContent(agent);
            } else {
                 this.selectedAgent = agent;
                 const agentPos = agent.position.clone();
                 const camTargetPos = agentPos.clone().add(new THREE.Vector3(0, 15, 10));
                 this.camera.moveToTarget(camTargetPos, agentPos, 1000, agent);
                 if (this.tooltipElement) this.updateTooltipContent(agent);
            }
        } else {
            this.selectedAgent = agent; this.isFollowingAgent = false; this.controls.enabled = false;
            const followDistance = this.camera.followDistance || 8; const followHeight = 3.0; const lookAtOffset = 1.0;
            const agentPos = agent.position.clone(); const agentOrientation = agent.orientation.clone();
            const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(agentOrientation); const up = new THREE.Vector3(0, 1, 0);
            const targetCamPos = agentPos.clone().addScaledVector(backward, followDistance).addScaledVector(up, followHeight);
            const targetLookAt = agentPos.clone().addScaledVector(up, lookAtOffset);
            const transitionDuration = 800;
            this.camera.moveToTarget(targetCamPos, targetLookAt, transitionDuration, agent);
            if (this.tooltipElement) this.updateTooltipContent(agent);
        }
        if (this.buildingTooltipElement) this.buildingTooltipElement.style.display = 'none';
     }
    deselectAgent() { /* ... code inchangé ... */
        if (this.tooltipElement) this.tooltipElement.style.display = 'none';
        if (!this.selectedAgent) return;
        this.selectedAgent = null; this.isFollowingAgent = false;
        if (this.camera) this.camera.stopFollowing();
        // if (this.controls && !this.controls.enabled) this.controls.enabled = true; // Géré par stopFollowing
     }
    selectBuilding(buildingInfo, mesh, instanceId) { /* ... code inchangé (inclut moveToTarget) ... */
        if (!buildingInfo || (this.selectedBuildingInfo && this.selectedBuildingInfo.id === buildingInfo.id)) return;
        this.deselectAgent();
        this.selectedBuildingInfo = buildingInfo; this.selectedBuildingMesh = mesh; this.selectedBuildingInstanceId = instanceId;
        if (this.highlightMesh && this.selectedBuildingMesh && this.selectedBuildingInstanceId !== -1) {
             const instanceMatrix = new THREE.Matrix4(); this.selectedBuildingMesh.getMatrixAt(this.selectedBuildingInstanceId, instanceMatrix);
             const position = new THREE.Vector3(); const quaternion = new THREE.Quaternion(); const scale = new THREE.Vector3();
             instanceMatrix.decompose(position, quaternion, scale); const highlightScaleFactor = 1.02;
             this.highlightMesh.scale.set(scale.x * highlightScaleFactor, scale.y * highlightScaleFactor, scale.z * highlightScaleFactor);
             this.highlightMesh.position.copy(position); this.highlightMesh.quaternion.copy(quaternion);
             this.highlightMesh.visible = true; this.highlightMesh.updateMatrixWorld(true);
        }
        const buildingPos = buildingInfo.position;
        const cameraHeightAboveBuilding = 150 + (buildingInfo.type === 'skyscraper' ? 50 : 0);
        const cameraZOffset = 200 + (buildingInfo.type === 'skyscraper' ? 25 : 0);
        const cameraTargetPos = new THREE.Vector3(buildingPos.x, buildingPos.y + cameraHeightAboveBuilding, buildingPos.z + cameraZOffset);
        this.camera.moveToTarget(cameraTargetPos, buildingPos.clone(), 1000);
        if (this.tooltipElement) this.tooltipElement.style.display = 'none';
        if (this.buildingTooltipElement) this.updateBuildingTooltipContent();
     }
    deselectBuilding() { /* ... code inchangé ... */
        if (!this.selectedBuildingInfo) return;
        this.selectedBuildingInfo = null; this.selectedBuildingMesh = null; this.selectedBuildingInstanceId = -1;
        if (this.highlightMesh) this.highlightMesh.visible = false;
        if (this.buildingTooltipElement) this.buildingTooltipElement.style.display = 'none';
     }

    // --- updateTooltipContent, updateBuildingTooltipContent (INCHANGÉ) ---
    // Ces méthodes gèrent le contenu HTML des tooltips
    updateTooltipContent(agent) { /* ... */
         if (!agent || !this.tooltipElement) return;
        const createBuildingLink = (buildingId) => buildingId ? `<span class="building-id-link" data-building-id="${buildingId}">${buildingId}</span>` : 'N/A';
        const homeLink = createBuildingLink(agent.homeBuildingId); const workLink = createBuildingLink(agent.workBuildingId);
        const content = `ID: ${agent.id}<br>State: ${agent.currentState || 'N/A'}<br>Home: ${homeLink}<br>Work: ${workLink}`;
        if (this.tooltipElement.innerHTML !== content) this.tooltipElement.innerHTML = content;
     }
    updateBuildingTooltipContent() { /* ... */
        if (!this.selectedBuildingInfo || !this.buildingTooltipElement) return;
        const building = this.selectedBuildingInfo; const totalCapacity = building.capacity || 0;
        let currentOccupantsInside = 0; const occupantsList = []; let listLabel = "Occupants";
        const agentManager = this.world?.agentManager;
        if (agentManager?.agents && building.occupants && building.occupants.length > 0) {
            building.occupants.forEach(occupantId => {
                const agent = agentManager.agents.find(a => a.id === occupantId);
                if (agent) {
                    const isAtHomeHere = agent.homeBuildingId === building.id && agent.currentState === 'AT_HOME';
                    const isAtWorkHere = agent.workBuildingId === building.id && agent.currentState === 'AT_WORK';
                    if (isAtHomeHere || isAtWorkHere) currentOccupantsInside++;
                    if (!building.isWorkplace && agent.homeBuildingId === building.id) { occupantsList.push(occupantId); listLabel = "Habitants "; }
                    else if (building.isWorkplace && agent.workBuildingId === building.id) { occupantsList.push(occupantId); listLabel = "Employés "; }
                }
            });
        }
        let occupantsListHTML = 'None';
        if (occupantsList.length > 0) {
            occupantsListHTML = occupantsList.map(id => `<span class="resident-id-link" data-agent-id="${id}">${id}</span>`).join(' | ');
        }
        const content = `ID : ${building.id}<br>Type : ${building.type}<br>Capacité : ${totalCapacity}<br>Actuellement à l'intérieur : ${currentOccupantsInside}<br>${listLabel}: <br>${occupantsListHTML}`;
        if (this.buildingTooltipElement.innerHTML !== content) this.buildingTooltipElement.innerHTML = content;
     }

    // --- Gestion Mode Debug (Adapté pour navMesh) ---
    enableDebugMode() {
        if (!this.isDebugMode) {
            this.isDebugMode = true;
            console.log("Debug Mode ENABLED");
            if (this.scene) this.scene.fog = null;
            if (this.world) this.world.setDebugMode(true);
            // Ouvrir tous les sous-menus en mode debug (inchangé)
            for (const category in this.debugLayerVisibility) {
                if (this.debugLayerVisibility[category]._showSubMenu !== undefined) {
                    this.debugLayerVisibility[category]._showSubMenu = true;
                }
            }
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: true } }));
        }
    }

    disableDebugMode() {
        if (this.isDebugMode) {
            this.isDebugMode = false;
            console.log("Debug Mode DISABLED");
            if (this.scene && this.originalFog) this.scene.fog = this.originalFog;
            if (this.world) this.world.setDebugMode(false);
            // Fermer tous les sous-menus (inchangé)
            for (const category in this.debugLayerVisibility) {
                if (this.debugLayerVisibility[category]._showSubMenu !== undefined) {
                    this.debugLayerVisibility[category]._showSubMenu = false;
                }
            }
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: false } }));
        }
    }

    toggleDebugMode() {
        this.isDebugMode = !this.isDebugMode;
        console.log(`Debug Mode global ${this.isDebugMode ? 'ENABLED' : 'DISABLED'}`);
        if (this.scene) this.scene.fog = this.isDebugMode ? null : this.originalFog;
        if (this.world) this.world.setDebugMode(this.isDebugMode);
        // Gérer l'état des sous-menus (inchangé)
        for (const category in this.debugLayerVisibility) {
            if (this.debugLayerVisibility[category]._showSubMenu !== undefined) {
                this.debugLayerVisibility[category]._showSubMenu = this.isDebugMode;
            }
        }
        this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: this.isDebugMode } }));
    }

    /**
     * Bascule la visibilité globale d'une catégorie de debug.
     * @param {string} categoryName - Nom de la catégorie ('district', 'plot', 'navMesh', etc.).
     */
    toggleCategoryVisibility(categoryName) {
        // --- MODIFICATION : Vérifier la clé navMesh ---
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName)) {
            console.warn(`Experience.toggleCategoryVisibility: Unknown category name '${categoryName}'`);
            return;
        }
        // -----------------------------------------
        const category = this.debugLayerVisibility[categoryName];
        const currentVisibility = category._visible;
        const newVisibility = !currentVisibility;
        category._visible = newVisibility;
        console.log(`Debug Category '${categoryName}' visibility toggled to: ${newVisibility}`);
        if (this.isDebugMode && this.world) {
            // --- MODIFICATION : Utilise setGroupVisibility ---
            this.world.setGroupVisibility(categoryName, newVisibility);
            // ---------------------------------------------
        }
        this.dispatchEvent(new CustomEvent('debugcategoryvisibilitychanged', {
            detail: { categoryName: categoryName, isVisible: newVisibility, allStates: { ...this.debugLayerVisibility } }
        }));
    }

	/**
     * Bascule l'état de *tous* les sous-calques d'une catégorie donnée. (INCHANGÉ)
     * @param {string} categoryName - Nom de la catégorie (ex: 'plot', 'district').
     */
	toggleAllSubLayersInCategory(categoryName) { /* ... code inchangé ... */
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName)) return;
        const category = this.debugLayerVisibility[categoryName];
        const subLayerKeys = Object.keys(category).filter(key => !key.startsWith('_'));
        if (subLayerKeys.length === 0) return;
        const shouldActivate = subLayerKeys.every(key => !category[key]);
        const targetState = shouldActivate;
        let changesMade = false;
        subLayerKeys.forEach(subTypeName => {
            if (category[subTypeName] !== targetState) {
                category[subTypeName] = targetState;
                if (this.isDebugMode && this.world && category._visible) {
                    this.world.setSubLayerMeshVisibility(categoryName, subTypeName, targetState);
                }
                changesMade = true;
            }
        });
        if (changesMade) {
            this.dispatchEvent(new CustomEvent('debugcategorychildrenchanged', {
                detail: { categoryName: categoryName, allStates: { ...this.debugLayerVisibility } }
            }));
        }
    }

	/**
     * Bascule la visibilité d'un sous-type spécifique dans une catégorie. (INCHANGÉ)
     * @param {string} categoryName - Nom de la catégorie (ex: 'plot').
     * @param {string} subTypeName - Nom du sous-type (ex: 'house').
     */
    toggleSubLayerVisibility(categoryName, subTypeName) { /* ... code inchangé ... */
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName) || !this.debugLayerVisibility[categoryName].hasOwnProperty(subTypeName) || subTypeName.startsWith('_')) return;
		const category = this.debugLayerVisibility[categoryName];
		const currentVisibility = category[subTypeName];
		const newVisibility = !currentVisibility;
		category[subTypeName] = newVisibility;
		console.log(`  Debug Sub-Layer '${categoryName}.${subTypeName}' visibility toggled to: ${newVisibility}`);
		if (this.isDebugMode && category._visible && this.world) {
		   this.world.setSubLayerMeshVisibility(categoryName, subTypeName, newVisibility);
		}
		this.dispatchEvent(new CustomEvent('debugsublayervisibilitychanged', {
			detail: { categoryName: categoryName, subTypeName: subTypeName, isVisible: newVisibility, allStates: { ...this.debugLayerVisibility } }
		}));
    }

    // --- toggleDebugLayer (OBSOLETE) ---
    // La visibilité est maintenant gérée par toggleCategoryVisibility et toggleSubLayerVisibility
    // toggleDebugLayer(layerName) { ... }

    // --- resize, update (INCHANGÉ) ---
    resize() {
        if (this.camera) this.camera.resize();
        if (this.renderer) this.renderer.resize();
        // Informer l'UI du changement de taille si nécessaire (ex: pour LineMaterial debug)
         if (this.timeControlUI) this.timeControlUI.updateLayerButtonsAppearance(); // Recalcule LineMaterial resolution
    }

    update() {
        this.stats.begin();
        const deltaTime = this.time.delta;
        // --- Camera/Controls Update ---
        if (!this.isFollowingAgent && this.controls?.enabled) { this.controls.update(); }
        if (this.camera) this.camera.update(deltaTime);
        // --- World Update ---
        if (this.world) { this.world.update(); } // World délègue aux managers internes
        // --- UI Update ---
        if (this.timeUI) this.timeUI.update();
        // AgentStatsUI a son propre intervalle, pas besoin d'update ici
        // --- Tooltips Update ---
        if (this.selectedAgent && this.tooltipElement && !this.selectedBuildingInfo) {
			this.updateTooltipContent(this.selectedAgent);
			this.tooltipTargetPosition.copy(this.selectedAgent.position).add(new THREE.Vector3(0, this.selectedAgent.scale * 8, 0));
			this._updateTooltipPosition(this.tooltipElement, this.tooltipTargetPosition);
		} else if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
			this.tooltipElement.style.display = 'none';
		}
		if (this.selectedBuildingInfo && this.buildingTooltipElement && this.highlightMesh?.visible) {
			this.updateBuildingTooltipContent();
			this.buildingTooltipTargetPosition.copy(this.highlightMesh.position).add(new THREE.Vector3(0, this.highlightMesh.scale.y / 2 + 2, 0));
			this._updateTooltipPosition(this.buildingTooltipElement, this.buildingTooltipTargetPosition);
		} else if (this.buildingTooltipElement && this.buildingTooltipElement.style.display !== 'none') {
			this.buildingTooltipElement.style.display = 'none';
		}
        // --- Render ---
        if (this.renderer) this.renderer.update();
        this.stats.end();
    }

    // --- destroy (INCHANGÉ) ---
    destroy() {
        console.log("Destroying Experience...");
        // --- Remove Listeners ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);
        if (this.buildingTooltipElement) this.buildingTooltipElement.removeEventListener('click', this._boundHandleBuildingTooltipClick);
        if (this.tooltipElement) this.tooltipElement.removeEventListener('click', this._boundHandleAgentTooltipClick);
        // --- Dispose Components ---
        if (this.highlightMesh) { /* ... dispose highlight ... */
             this.scene.remove(this.highlightMesh);
             this.highlightMesh.geometry?.dispose();
             this.highlightMesh.material?.dispose();
        }
        this.agentStatsUI?.destroy(); this.agentStatsUI = null;
        this.timeUI?.destroy(); this.timeUI = null;
        this.timeControlUI?.destroy(); this.timeControlUI = null;
        this.camera?.destroy(); this.camera = null;
        this.world?.destroy(); this.world = null; // World détruit CityManager, AgentManager etc.
        this.controls?.dispose(); this.controls = null;
        this.renderer?.instance?.dispose(); this.renderer = null; // Dispose WebGLRenderer
        if (this.stats?.dom.parentNode) { document.body.removeChild(this.stats.dom); }
        this.stats = null;
        // --- Nullify References ---
        this.highlightMesh = null; this.buildingTooltipElement = null; this.tooltipElement = null;
        this.selectedBuildingInfo = null; this.selectedBuildingMesh = null; this.selectedAgent = null;
        this.scene = null; this.originalFog = null;
        this.sizes = null; this.time = null; this.canvas = null;
        this.raycaster = null; this.mouse = null;
        instance = null;
        console.log("Experience détruite.");
    }
}