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

        // --- Sélection Agent ---
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        this.tooltipElement = document.getElementById('agent-tooltip'); // Assurez-vous que cet ID existe
        this.tooltipTargetPosition = new THREE.Vector3();

        // --- Sélection Bâtiment ---
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedBuildingInstanceId = -1;
        this.highlightMesh = null;
        this.buildingTooltipElement = document.getElementById('building-tooltip'); // Assurez-vous que cet ID existe
        this.buildingTooltipTargetPosition = new THREE.Vector3();

        // --- Variables clic vs drag ---
        this.mouseDownTime = 0;
        this.mouseDownPosition = { x: null, y: null };
        this.MAX_CLICK_DURATION = 200;
        this.MAX_CLICK_DISTANCE_SQ = 25; // pixels squared

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

        // --- Gestionnaire pour les clics DANS l'infobulle BÂTIMENT (EXISTANT) ---
        this._boundHandleBuildingTooltipClick = this._handleBuildingTooltipClick.bind(this);
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.addEventListener('click', this._boundHandleBuildingTooltipClick);
        }

        // --- NOUVEAU : Gestionnaire pour les clics DANS l'infobulle AGENT ---
        this._boundHandleAgentTooltipClick = this._handleAgentTooltipClick.bind(this);
        if (this.tooltipElement) {
            this.tooltipElement.addEventListener('click', this._boundHandleAgentTooltipClick);
        }
        // --- FIN NOUVEAU ---

        this.createHighlightMesh(); // Créer le mesh de surbrillance
        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
    }

    // Crée le mesh utilisé pour surligner le bâtiment sélectionné
    createHighlightMesh() {
        const highlightGeometry = new THREE.BoxGeometry(1.05, 1.05, 1.05); // Légèrement plus grand
        const highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff, // Bleu vif
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        this.highlightMesh.name = "BuildingHighlight";
        this.highlightMesh.visible = false;
        this.highlightMesh.renderOrder = 1; // Dessiner après les objets opaques
        this.scene.add(this.highlightMesh);
    }

    // Enregistre l'heure et la position au début du clic
    _handleMouseDown(event) {
        if (event.button === 0) { // Bouton gauche
            this.mouseDownTime = Date.now();
            this.mouseDownPosition.x = event.clientX;
            this.mouseDownPosition.y = event.clientY;
        }
    }

    // Gère la fin du clic : détermine si c'est un clic simple et lance le raycasting
    _handleMouseUp(event) {
        if (event.button !== 0) return; // Seulement clic gauche

        const upTime = Date.now();
        const clickDuration = upTime - this.mouseDownTime;
        const deltaX = event.clientX - this.mouseDownPosition.x;
        const deltaY = event.clientY - this.mouseDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        // Vérifier si c'est un clic (durée courte, peu de mouvement)
        if (clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ) {
            // console.log("Click détecté."); // Décommenter pour debug
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            // --- Préparer les objets à intersecter ---
            const objectsToIntersect = [];
            const agentManager = this.world?.agentManager;
            const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;

            // Ajouter les agents (torse et tête)
            if (agentManager?.instanceMeshes?.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
            if (agentManager?.instanceMeshes?.head) objectsToIntersect.push(agentManager.instanceMeshes.head);

            // Ajouter les bâtiments (toutes les parties principales)
            if (instancedMeshManager?.instancedMeshes) {
                for (const key in instancedMeshManager.instancedMeshes) {
                    if (key.startsWith('house_') || key.startsWith('building_') || key.startsWith('skyscraper_') || key.startsWith('industrial_')) {
                        // Exclure éventuellement les fenêtres si elles sont séparées et non cliquables
                        // if (!key.includes('Window')) {
                        objectsToIntersect.push(instancedMeshManager.instancedMeshes[key]);
                        // }
                    }
                }
            }

            if (objectsToIntersect.length === 0) {
                this.deselectAgent();
                this.deselectBuilding();
                return;
            }

            // --- Lancer le Raycasting ---
            const intersects = this.raycaster.intersectObjects(objectsToIntersect, false);
            let clickedOnSomething = false;

            if (intersects.length > 0) {
                const firstIntersect = intersects[0];
                const clickedObject = firstIntersect.object;

                // --- Vérifier si un Agent a été cliqué ---
                if (agentManager && agentManager.agents &&
                    (clickedObject === agentManager.instanceMeshes.torso || clickedObject === agentManager.instanceMeshes.head) &&
                    firstIntersect.instanceId !== undefined) {
                    const agentInstanceId = firstIntersect.instanceId;
                    const clickedAgent = agentManager.agents[agentInstanceId];
                    if (clickedAgent) {
                        this.deselectBuilding(); // Important: désélectionner bâtiment
                        this.selectAgent(clickedAgent);
                        clickedOnSomething = true;
                    }
                }
                // --- Vérifier si un Bâtiment a été cliqué ---
                else if (instancedMeshManager && firstIntersect.instanceId !== undefined && clickedObject instanceof THREE.InstancedMesh) {
                    const instanceId = firstIntersect.instanceId;
                    const clickedMesh = clickedObject;
                    const tempMatrix = new THREE.Matrix4();
                    clickedMesh.getMatrixAt(instanceId, tempMatrix);
                    const worldPosition = new THREE.Vector3();
                    worldPosition.setFromMatrixPosition(tempMatrix); // Position de l'instance cliquée

                    const citizenManager = this.world?.cityManager?.citizenManager;
                    let closestBuilding = null;
                    let minDistSq = Infinity;
                    const toleranceSq = 25.0; // Tolérance pour lier le clic au bâtiment (ajustée)

                    if (citizenManager?.buildingInstances) {
                        citizenManager.buildingInstances.forEach(buildingInfo => {
                            const distSq = worldPosition.distanceToSquared(buildingInfo.position);
                            if (distSq < minDistSq && distSq < toleranceSq) {
                                minDistSq = distSq;
                                closestBuilding = buildingInfo;
                            }
                        });
                    }

                    if (closestBuilding) {
                        console.log(`Bâtiment cliqué: ID=${closestBuilding.id}, Type=${closestBuilding.type}`);
                        this.deselectAgent(); // Important: désélectionner agent
                        this.selectBuilding(closestBuilding, clickedMesh, instanceId);
                        clickedOnSomething = true;
                    } else {
                        console.log(`Clic sur mesh (${clickedMesh.name}, instance ${instanceId}), mais impossible de lier à un BuildingInfo.`);
                    }
                }
            }

            // --- Si clic dans le vide ---
            if (!clickedOnSomething) {
                this.deselectAgent();
                this.deselectBuilding();
            }
        }

        // --- Réinitialiser l'état du clic ---
        this.mouseDownTime = 0;
        this.mouseDownPosition.x = null;
        this.mouseDownPosition.y = null;
    }

    // --- NOUVEAU : Gère les clics dans l'infobulle AGENT ---
    _handleAgentTooltipClick(event) {
        const clickedLink = event.target.closest('.building-id-link');
        if (clickedLink) {
            const buildingId = clickedLink.dataset.buildingId;
            if (buildingId && buildingId !== 'N/A') {
                console.log(`Agent Tooltip: Clic sur l'ID bâtiment: ${buildingId}`);
                const citizenManager = this.world?.cityManager?.citizenManager;
                const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;

                if (!citizenManager || !instancedMeshManager) {
                    console.error("Impossible de trouver CitizenManager ou InstancedMeshManager.");
                    return;
                }

                // 1. Trouver les infos du bâtiment
                const buildingInfo = citizenManager.getBuildingInfo(buildingId);
                if (!buildingInfo) {
                    console.warn(`Impossible de trouver les informations pour le bâtiment ${buildingId}`);
                    return;
                }

                // 2. Trouver le mesh et l'instanceId correspondants (Méthode approximative par position)
                //    NOTE: C'est la partie la plus délicate car buildingInfo ne contient pas
                //    directement le lien vers le mesh/instanceId.
                let foundMesh = null;
                let foundInstanceId = -1;
                let minDistanceSq = Infinity;
                const targetPosition = buildingInfo.position;
                // Augmentation de la tolérance car la position enregistrée peut différer légèrement de la position de l'instance
                const searchToleranceSq = 50.0; // Tolérance au carré pour trouver l'instance

                const tempMatrix = new Matrix4(); // Réutiliser pour la performance
                const instancePosition = new Vector3();

                // Itérer sur les meshes pertinents
                for (const key in instancedMeshManager.instancedMeshes) {
                    // Simplification : on cherche dans tous les types de bâtiments/maisons etc.
                    if (key.startsWith('house_') || key.startsWith('building_') || key.startsWith('skyscraper_') || key.startsWith('industrial_')) {
                        const mesh = instancedMeshManager.instancedMeshes[key];
                        for (let i = 0; i < mesh.count; i++) {
                            mesh.getMatrixAt(i, tempMatrix);
                            instancePosition.setFromMatrixPosition(tempMatrix);
                            const distSq = instancePosition.distanceToSquared(targetPosition);

                            if (distSq < minDistanceSq && distSq < searchToleranceSq) {
                                minDistanceSq = distSq;
                                foundMesh = mesh;
                                foundInstanceId = i;
                            }
                        }
                    }
                }

                // 3. Sélectionner le bâtiment si trouvé
                if (foundMesh && foundInstanceId !== -1) {
                    console.log(`Bâtiment ${buildingId} trouvé : Mesh ${foundMesh.name}, Instance ${foundInstanceId}`);
                    // Désélectionner l'agent actuel (car on sélectionne un bâtiment)
                    this.deselectAgent();
                    // Sélectionner le bâtiment trouvé
                    this.selectBuilding(buildingInfo, foundMesh, foundInstanceId);
                } else {
                    console.warn(`Impossible de trouver le mesh/instance correspondant au bâtiment ${buildingId} près de la position ${targetPosition.x.toFixed(1)},${targetPosition.z.toFixed(1)}.`);
                    // Optionnel : Animer la caméra vers la position du bâtiment même si le mesh n'est pas trouvé ?
                    // if (this.controls && buildingInfo.position) {
                    //     this.controls.target.copy(buildingInfo.position);
                    // }
                }
            }
        }
    }
    // --- FIN NOUVELLE MÉTHODE ---

    // Gère les clics à l'intérieur du tooltip du BÂTIMENT (délégation)
    _handleBuildingTooltipClick(event) {
        const clickedLink = event.target.closest('.resident-id-link');
        if (clickedLink) {
            const agentId = clickedLink.dataset.agentId;
            if (agentId) {
                // console.log(`Clic sur l'ID résident/employé: ${agentId}`); // Décommenter pour debug
                const agentManager = this.world?.agentManager;
                const agentToSelect = agentManager?.agents.find(a => a.id === agentId);
                if (agentToSelect) {
                    // console.log(`Agent ${agentId} trouvé, sélection en cours...`); // Décommenter pour debug
                    this.deselectBuilding(); // Quitter la sélection bâtiment
                    this.selectAgent(agentToSelect); // Sélectionner l'agent cliqué
                } else {
                    console.warn(`Agent avec ID ${agentId} non trouvé.`);
                }
            }
        }
    }

    // Sélectionne un agent et active le suivi caméra/tooltip
    selectAgent(agent) {
        if (this.selectedAgent === agent) return;
        this.deselectBuilding(); // Toujours désélectionner bâtiment si on sélectionne agent
        this.selectedAgent = agent;
        this.isFollowingAgent = true;
        this.controls.enabled = false;
        this.camera.followAgent(agent);
        // S'assurer que le tooltip bâtiment est caché
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.style.display = 'none';
        }
        // Afficher et mettre à jour le tooltip agent
        if (this.tooltipElement) {
            this.updateTooltipContent(agent);
            this.tooltipElement.style.display = 'block';
        }
    }

    // Désélectionne l'agent et désactive le suivi
    deselectAgent() {
        if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
            this.tooltipElement.style.display = 'none';
        }
        if (!this.isFollowingAgent && !this.selectedAgent) return;
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        if (this.controls) this.controls.enabled = true;
        if (this.camera) this.camera.stopFollowing();
    }

    // Sélectionne un bâtiment, active le highlight et le tooltip bâtiment
    selectBuilding(buildingInfo, mesh, instanceId) {
        if (this.selectedBuildingInfo && this.selectedBuildingInfo.id === buildingInfo.id) {
            return; // Ne rien faire si déjà sélectionné
        }
        this.deselectAgent(); // Toujours désélectionner agent si on sélectionne bâtiment
        this.selectedBuildingInfo = buildingInfo;
        this.selectedBuildingMesh = mesh;
        this.selectedBuildingInstanceId = instanceId;

        // Activer et positionner le highlight
        if (this.highlightMesh && this.selectedBuildingMesh && this.selectedBuildingInstanceId !== -1) {
            const instanceMatrix = new THREE.Matrix4();
            this.selectedBuildingMesh.getMatrixAt(this.selectedBuildingInstanceId, instanceMatrix);
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            instanceMatrix.decompose(position, quaternion, scale);
            const highlightScaleFactor = 1.02;
            this.highlightMesh.scale.set(scale.x * highlightScaleFactor, scale.y * highlightScaleFactor, scale.z * highlightScaleFactor);
            this.highlightMesh.position.copy(position);
            this.highlightMesh.quaternion.copy(quaternion);
            this.highlightMesh.visible = true;
            this.highlightMesh.updateMatrixWorld(true);
        }

        // S'assurer que le tooltip agent est caché
        if (this.tooltipElement) {
            this.tooltipElement.style.display = 'none';
        }
        // Afficher et mettre à jour le tooltip bâtiment
        if (this.buildingTooltipElement) {
            this.updateBuildingTooltipContent(); // Met à jour immédiatement
            this.buildingTooltipElement.style.display = 'block';
        }
    }

    // Désélectionne le bâtiment, cache highlight et tooltip
    deselectBuilding() {
        if (!this.selectedBuildingInfo) return;
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedBuildingInstanceId = -1;
        if (this.highlightMesh) {
            this.highlightMesh.visible = false;
        }
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.style.display = 'none';
        }
    }

    // --- MODIFIÉ : Met à jour le contenu HTML du tooltip agent AVEC liens ---
    updateTooltipContent(agent) {
        if (!agent || !this.tooltipElement) return;

        // Fonction interne pour créer les liens
        const createBuildingLink = (buildingId) => {
            if (buildingId) {
                // Utilise la classe 'building-id-link' pour le JS et le CSS
                return `<span class="building-id-link" data-building-id="${buildingId}">${buildingId}</span>`;
            } else {
                return 'N/A';
            }
        };

        const homeLink = createBuildingLink(agent.homeBuildingId);
        const workLink = createBuildingLink(agent.workBuildingId);

        const content = `
          ID: ${agent.id}<br>
          State: ${agent.currentState || 'N/A'}<br>
          Home: ${homeLink}<br>
          Work: ${workLink}
        `;
        if (this.tooltipElement.innerHTML !== content) {
            this.tooltipElement.innerHTML = content;
        }
    }
    // --- FIN MODIFICATION updateTooltipContent ---

    // Met à jour le contenu HTML du tooltip bâtiment (adapté pour afficher employés si nécessaire)
    updateBuildingTooltipContent() {
        if (!this.selectedBuildingInfo || !this.buildingTooltipElement) return;

        const building = this.selectedBuildingInfo;
        const totalCapacity = building.capacity || 0;
        let currentOccupantsInside = 0;
        const occupantsList = []; // Pourra contenir résidents OU employés
        let listLabel = "Occupants"; // Label par défaut

        const agentManager = this.world?.agentManager;

        if (agentManager?.agents && building.occupants && building.occupants.length > 0) {
            building.occupants.forEach(occupantId => {
                const agent = agentManager.agents.find(a => a.id === occupantId);
                if (agent) {
                    // Compte ceux à l'intérieur
                    const isAtHomeHere = agent.homeBuildingId === building.id && agent.currentState === 'AT_HOME';
                    const isAtWorkHere = agent.workBuildingId === building.id && agent.currentState === 'AT_WORK';
                    if (isAtHomeHere || isAtWorkHere) {
                        currentOccupantsInside++;
                    }

                    // Ajoute à la liste appropriée (résidents OU employés)
                    if (!building.isWorkplace && agent.homeBuildingId === building.id) {
                        occupantsList.push(occupantId);
                        listLabel = "Residents";
                    } else if (building.isWorkplace && agent.workBuildingId === building.id) {
                        occupantsList.push(occupantId);
                        listLabel = "Employees";
                    }
                }
            });
        }

        // Génère le HTML pour la liste (cliquable)
        let occupantsListHTML = 'None';
        if (occupantsList.length > 0) {
            occupantsListHTML = occupantsList.map(id =>
                `<span class="resident-id-link" data-agent-id="${id}">${id}</span>` // Garde la classe pour la fonctionnalité de clic
            ).join(', ');
        }

        // Construit le contenu final du tooltip
        const content = `
          ID: ${building.id}<br>
          Type: ${building.type}<br>
          Capacity: ${totalCapacity}<br>
          Inside Now: ${currentOccupantsInside}<br>
          ${listLabel}: ${occupantsListHTML}
        `;

        // Met à jour le DOM seulement si nécessaire
        if (this.buildingTooltipElement.innerHTML !== content) {
            this.buildingTooltipElement.innerHTML = content;
        }
    }

    // Gère le mode debug (visuels, brouillard)
    enableDebugMode() {
        if (!this.isDebugMode) {
            this.isDebugMode = true;
            console.log("Debug Mode ENABLED");
            if (this.scene) this.scene.fog = null;
            if (this.world) this.world.setDebugMode(true);
            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: true } }));
        }
    }

    disableDebugMode() {
        if (this.isDebugMode) {
            this.isDebugMode = false;
            console.log("Debug Mode DISABLED");
            if (this.scene && this.originalFog) this.scene.fog = this.originalFog;
            if (this.world) this.world.setDebugMode(false);
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

    // Gère le redimensionnement de la fenêtre
    resize() {
        if (this.camera) this.camera.resize();
        if (this.renderer) this.renderer.resize();
    }

    // Boucle de mise à jour principale
    update() {
        this.stats.begin(); // Début mesure performance
        const deltaTime = this.time.delta; // Temps écoulé depuis la dernière frame (ms)

        // Mise à jour des contrôles OrbitControls si non en suivi
        if (!this.isFollowingAgent && this.controls?.enabled) {
            this.controls.update();
        }
        // Mise à jour caméra (gère le suivi si activé)
        if (this.camera) this.camera.update(deltaTime);
        // Mise à jour du monde (agents, environnement, etc.)
        if (this.world) this.world.update();
        // Mise à jour du renderer (dessine la scène)
        if (this.renderer) this.renderer.update();
        // Mise à jour de l'UI de l'heure
        if (this.timeUI) this.timeUI.update();

        // --- Mise à jour Tooltip Agent ---
        if (this.selectedAgent && this.tooltipElement && !this.selectedBuildingInfo) { // Afficher seulement si pas de bâtiment sélectionné
            this.updateTooltipContent(this.selectedAgent); // Met à jour le contenu
            // Calcule la position 3D cible pour le tooltip agent
            this.tooltipTargetPosition.copy(this.selectedAgent.position);
            const headHeightOffset = 8.0 * this.selectedAgent.scale; // Approx. hauteur tête
            this.tooltipTargetPosition.y += this.selectedAgent.yOffset + headHeightOffset;
            const rightOffset = new THREE.Vector3(1, 0, 0);
            rightOffset.applyQuaternion(this.selectedAgent.orientation); // Décalage relatif à l'orientation
            rightOffset.multiplyScalar(3.0 * this.selectedAgent.scale);
            this.tooltipTargetPosition.add(rightOffset);

            // Projette la position 3D en 2D écran
            const projectedPositionAgent = this.tooltipTargetPosition.clone().project(this.camera.instance);

            if (projectedPositionAgent.z < 1) { // Vérifie si devant la caméra
                const screenX = (projectedPositionAgent.x * 0.5 + 0.5) * this.sizes.width;
                const screenY = (-projectedPositionAgent.y * 0.5 + 0.5) * this.sizes.height;
                // Positionne le tooltip
                this.tooltipElement.style.left = `${screenX}px`;
                this.tooltipElement.style.top = `${screenY}px`;
                if (this.tooltipElement.style.display === 'none') { this.tooltipElement.style.display = 'block'; }
            } else { // Cache si derrière
                if (this.tooltipElement.style.display !== 'none') { this.tooltipElement.style.display = 'none'; }
            }
        } else { // Cache si aucun agent sélectionné ou si bâtiment sélectionné
            if (this.tooltipElement && this.tooltipElement.style.display !== 'none') { this.tooltipElement.style.display = 'none'; }
        }

        // --- Mise à jour Tooltip Bâtiment ---
        if (this.selectedBuildingInfo && this.buildingTooltipElement) {
            this.updateBuildingTooltipContent(); // Met à jour le contenu
            // Recalcule la position 3D cible (sommet haut-droite)
            if (this.selectedBuildingMesh && this.selectedBuildingInstanceId !== -1) {
                const instanceMatrix = new THREE.Matrix4();
                this.selectedBuildingMesh.getMatrixAt(this.selectedBuildingInstanceId, instanceMatrix);
                const position = new THREE.Vector3();
                const quaternion = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                instanceMatrix.decompose(position, quaternion, scale);

                // Calcule les dimensions locales de la géométrie de base
                const baseGeometry = this.selectedBuildingMesh.geometry;
                if (!baseGeometry.boundingBox) { baseGeometry.computeBoundingBox(); }
                let localHeight = 1, localWidth = 1, localDepth = 1;
                if (baseGeometry.boundingBox) {
                    localHeight = baseGeometry.boundingBox.max.y - baseGeometry.boundingBox.min.y;
                    localWidth = baseGeometry.boundingBox.max.x - baseGeometry.boundingBox.min.x;
                    localDepth = baseGeometry.boundingBox.max.z - baseGeometry.boundingBox.min.z;
                }
                const scaledHeight = localHeight * scale.y;
                const scaledWidth = localWidth * scale.x;
                const scaledDepth = localDepth * scale.z;

                // Calcule le décalage local du sommet cible
                const localSummitOffset = new THREE.Vector3(scaledWidth / 2, scaledHeight / 2, -scaledDepth / 2);
                localSummitOffset.applyQuaternion(quaternion); // Applique la rotation de l'instance

                // Calcule la position mondiale du sommet
                this.buildingTooltipTargetPosition.copy(position).add(localSummitOffset);

                // Ajoute un petit décalage visuel
                const offsetAmount = 1.5;
                const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
                this.buildingTooltipTargetPosition.addScaledVector(rightDir, offsetAmount);
                this.buildingTooltipTargetPosition.y += offsetAmount * 0.5;

                // Projette en 2D écran
                const projectedPositionBuilding = this.buildingTooltipTargetPosition.clone().project(this.camera.instance);

                if (projectedPositionBuilding.z < 1) { // Si devant la caméra
                    const screenX = (projectedPositionBuilding.x * 0.5 + 0.5) * this.sizes.width;
                    const screenY = (-projectedPositionBuilding.y * 0.5 + 0.5) * this.sizes.height;
                    // Positionne le tooltip
                    this.buildingTooltipElement.style.left = `${screenX}px`;
                    this.buildingTooltipElement.style.top = `${screenY}px`;
                    if (this.buildingTooltipElement.style.display === 'none') { this.buildingTooltipElement.style.display = 'block'; }
                } else { // Cache si derrière
                    if (this.buildingTooltipElement.style.display !== 'none') { this.buildingTooltipElement.style.display = 'none'; }
                }
            } else { // Cache si données instance invalides
                if (this.buildingTooltipElement.style.display !== 'none') { this.buildingTooltipElement.style.display = 'none'; }
            }
        } else { // Cache si aucun bâtiment sélectionné
            if (this.buildingTooltipElement && this.buildingTooltipElement.style.display !== 'none') { this.buildingTooltipElement.style.display = 'none'; }
        }

        this.stats.end(); // Fin mesure performance
    }

    // Nettoie les ressources et écouteurs lors de la destruction
    destroy() {
        console.log("Destroying Experience...");

        // Nettoyage EventListeners
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.removeEventListener('click', this._boundHandleBuildingTooltipClick);
        }
        // ---> NOUVEAU : Retirer l'écouteur de l'infobulle agent <---
        if (this.tooltipElement) {
            this.tooltipElement.removeEventListener('click', this._boundHandleAgentTooltipClick);
        }
        // --->

        // Nettoyage Sélection Bâtiment
        if (this.highlightMesh) {
            this.scene.remove(this.highlightMesh);
            this.highlightMesh.geometry?.dispose();
            this.highlightMesh.material?.dispose();
        }
        this.highlightMesh = null;
        this.buildingTooltipElement = null;
        this.buildingTooltipTargetPosition = null;
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;

        // Nettoyage Sélection Agent
        this.tooltipElement = null;
        this.tooltipTargetPosition = null;
        this.selectedAgent = null;

        // Destruction des composants principaux
        this.timeUI?.destroy(); this.timeUI = null;
        this.timeControlUI?.destroy(); this.timeControlUI = null;
        this.camera?.destroy(); this.camera = null;
        this.world?.destroy(); this.world = null;
        this.controls?.dispose(); this.controls = null;
        this.renderer?.instance?.dispose(); this.renderer = null;
        if (this.stats?.dom.parentNode) { document.body.removeChild(this.stats.dom); }
        this.stats = null;

        // Nettoyage des références
        this.scene = null;
        this.originalFog = null;
        this.sizes = null; this.time = null; this.canvas = null;
        this.raycaster = null; this.mouse = null;

        instance = null; // Réinitialise le singleton
        console.log("Experience détruite.");
    }
}