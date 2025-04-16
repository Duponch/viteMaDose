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
import { Box3, Box3Helper } from 'three';

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
        this.tooltipElement = document.getElementById('agent-tooltip');
        this.tooltipTargetPosition = new THREE.Vector3(); // Pour calculer la position 3D de la cible
        
		this.selectedBuildingInfo = null;   // Infos du bâtiment sélectionné (depuis CitizenManager)
        this.selectedBuildingMesh = null;   // Référence à l'InstancedMesh cliqué
        this.selectedBuildingInstanceId = -1;// ID de l'instance dans l'InstancedMesh
        this.highlightMesh = null;          // Mesh pour le highlight visuel
        this.buildingTooltipElement = document.getElementById('building-tooltip'); // Tooltip bâtiment
        this.buildingTooltipTargetPosition = new THREE.Vector3(); // Position 3D pour le tooltip bâtiment
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

	createHighlightMesh() {
        // Une boîte simple, légèrement plus grande que 1x1x1
        const highlightGeometry = new THREE.BoxGeometry(1.05, 1.05, 1.05);
        const highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff, // Bleu vif
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide, // Pour être visible même si la caméra est à l'intérieur
            depthWrite: false // Important pour la transparence correcte
        });
        this.highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        this.highlightMesh.name = "BuildingHighlight";
        this.highlightMesh.visible = false; // Invisible par défaut
        this.highlightMesh.renderOrder = 1; // S'assurer qu'il est rendu après les objets opaques
        this.scene.add(this.highlightMesh);
    }

    _handleMouseDown(event) {
        if (event.button === 0) {
            this.mouseDownTime = Date.now();
            this.mouseDownPosition.x = event.clientX;
            this.mouseDownPosition.y = event.clientY;
        }
    }

    _handleMouseUp(event) {
        if (event.button !== 0) return; // Seulement clic gauche

        const upTime = Date.now();
        const clickDuration = upTime - this.mouseDownTime;
        const deltaX = event.clientX - this.mouseDownPosition.x;
        const deltaY = event.clientY - this.mouseDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        if (clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ) {
            // console.log("Click détecté."); // Garder pour debug si besoin
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            const objectsToIntersect = [];
            const agentManager = this.world?.agentManager;
            // const instancedMeshManager = this.world?.contentGenerator?.instancedMeshManager; // Corrigé l'accès
            const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;


            if (agentManager?.instanceMeshes?.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
            if (agentManager?.instanceMeshes?.head) objectsToIntersect.push(agentManager.instanceMeshes.head);

            if (instancedMeshManager?.instancedMeshes) {
                for (const key in instancedMeshManager.instancedMeshes) {
                    if (key.startsWith('house_') || key.startsWith('building_') || key.startsWith('skyscraper_') || key.startsWith('industrial_')) {
                       // Inclure toutes les parties principales pour le clic (on pourrait être plus spécifique si besoin)
                       objectsToIntersect.push(instancedMeshManager.instancedMeshes[key]);
                    }
                }
            }

            if (objectsToIntersect.length === 0) {
                 this.deselectAgent();
                 this.deselectBuilding();
                 return;
            }

            const intersects = this.raycaster.intersectObjects(objectsToIntersect, false);
            let clickedOnSomething = false;

            if (intersects.length > 0) {
                const firstIntersect = intersects[0];
                const clickedObject = firstIntersect.object;

                if (agentManager && agentManager.agents &&
                   (clickedObject === agentManager.instanceMeshes.torso || clickedObject === agentManager.instanceMeshes.head) &&
                   firstIntersect.instanceId !== undefined)
                {
                    const agentInstanceId = firstIntersect.instanceId;
                    const clickedAgent = agentManager.agents[agentInstanceId];
                    if (clickedAgent) {
                        // console.log(`Agent cliqué (via MouseUp): ${clickedAgent.id}`);
                        this.deselectBuilding();
                        this.selectAgent(clickedAgent);
                        clickedOnSomething = true;
                    }
                }
                else if (instancedMeshManager && firstIntersect.instanceId !== undefined && clickedObject instanceof THREE.InstancedMesh)
                {
                    const instanceId = firstIntersect.instanceId;
                    const clickedMesh = clickedObject;
                    const tempMatrix = new THREE.Matrix4();
                    clickedMesh.getMatrixAt(instanceId, tempMatrix);
                    const worldPosition = new THREE.Vector3();
                    worldPosition.setFromMatrixPosition(tempMatrix);

                    const citizenManager = this.world?.cityManager?.citizenManager;
                    let closestBuilding = null;
                    let minDistSq = Infinity;

                    // --- MODIFICATION ICI ---
                    // Augmenter la tolérance. 5.0 * 5.0 = 25.0 (distance de 5 unités)
                    // Ajustez cette valeur si nécessaire. Commencez avec une valeur plus grande
                    // et réduisez si cela cause des sélections incorrectes sur des bâtiments proches.
                    const toleranceSq = 25.0; // Anciennement 1.0
                    // --- FIN MODIFICATION ---

                    if (citizenManager?.buildingInstances) {
                        // --- AJOUT LOGS POUR DEBUG ---
                        // console.log(`--- Recherche bâtiment pour clic à ${worldPosition.x.toFixed(1)}, ${worldPosition.y.toFixed(1)}, ${worldPosition.z.toFixed(1)} (ToleranceSq: ${toleranceSq}) ---`);
                        // --- FIN AJOUT LOGS ---

                        citizenManager.buildingInstances.forEach(buildingInfo => {
                            const distSq = worldPosition.distanceToSquared(buildingInfo.position);

                            // --- AJOUT LOGS POUR DEBUG ---
                            // if(distSq < 50) { // Loguer seulement les bâtiments raisonnablement proches
                            //      console.log(`  -> Test bâtiment ID ${buildingInfo.id} (Type: ${buildingInfo.type}) à ${buildingInfo.position.x.toFixed(1)}, ${buildingInfo.position.y.toFixed(1)}, ${buildingInfo.position.z.toFixed(1)} | DistSq: ${distSq.toFixed(2)}`);
                            // }
                            // --- FIN AJOUT LOGS ---

                            if (distSq < minDistSq && distSq < toleranceSq) {
                                // --- AJOUT LOGS POUR DEBUG ---
                                // console.log(`      --> Nouveau candidat le plus proche trouvé ! (Précédent minDistSq: ${minDistSq.toFixed(2)})`);
                                // --- FIN AJOUT LOGS ---
                                minDistSq = distSq;
                                closestBuilding = buildingInfo;
                            }
                        });
                    }

                    if (closestBuilding) {
                        console.log(`Bâtiment cliqué: ID=${closestBuilding.id}, Type=${closestBuilding.type}`);
                        this.deselectAgent();
                        this.selectBuilding(closestBuilding, clickedMesh, instanceId);
                        clickedOnSomething = true;
                    } else {
                         console.log(`Clic sur mesh (${clickedMesh.name}, instance ${instanceId}), mais impossible de lier à un BuildingInfo à pos (${worldPosition.x.toFixed(1)}, ${worldPosition.z.toFixed(1)}).`);
                    }
                }
            }

            if (!clickedOnSomething) {
                // console.log("Clic dans le vide."); // Garder pour debug
                this.deselectAgent();
                this.deselectBuilding();
            }

        } else {
            // Drag ou clic long
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

	selectBuilding(buildingInfo, mesh, instanceId) {
        // Si on clique sur le même bâtiment déjà sélectionné, ne rien faire (ou désélectionner ?)
        if (this.selectedBuildingInfo && this.selectedBuildingInfo.id === buildingInfo.id) {
            // Optionnel: désélectionner si on re-clique sur le même
            // this.deselectBuilding();
            // return;
            return; // Pour l'instant, on ne fait rien si on re-clique
        }

        this.deselectBuilding(); // Désélectionner l'ancien avant

        console.log(`Sélection du bâtiment: ID=${buildingInfo.id}`);
        this.selectedBuildingInfo = buildingInfo;
        this.selectedBuildingMesh = mesh;
        this.selectedBuildingInstanceId = instanceId;

        // 1. Activer et positionner le highlight
        if (this.highlightMesh && this.selectedBuildingMesh && this.selectedBuildingInstanceId !== -1) {
            const instanceMatrix = new THREE.Matrix4();
            this.selectedBuildingMesh.getMatrixAt(this.selectedBuildingInstanceId, instanceMatrix);

            // Extraire la position, rotation, échelle de la matrice de l'instance
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            instanceMatrix.decompose(position, quaternion, scale);

            // Appliquer la même transformation au highlight mesh
            // On peut légèrement augmenter l'échelle du highlight pour mieux entourer
            const highlightScaleFactor = 1.02; // Légèrement plus grand
            this.highlightMesh.scale.set(scale.x * highlightScaleFactor, scale.y * highlightScaleFactor, scale.z * highlightScaleFactor);
            this.highlightMesh.position.copy(position);
            this.highlightMesh.quaternion.copy(quaternion);

            this.highlightMesh.visible = true;
            this.highlightMesh.updateMatrixWorld(true); // Forcer la mise à jour
        }

        // 2. Afficher le tooltip (le contenu et la position seront mis à jour dans update())
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.style.display = 'block';
            // Forcer une première mise à jour du contenu (optionnel, car update() le fera)
            this.updateBuildingTooltipContent();
        }
    }

    deselectBuilding() {
        if (!this.selectedBuildingInfo) return; // Rien à désélectionner

        console.log(`Désélection du bâtiment: ID=${this.selectedBuildingInfo.id}`);
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedBuildingInstanceId = -1;

        // Cacher le highlight
        if (this.highlightMesh) {
            this.highlightMesh.visible = false;
        }

        // Cacher le tooltip
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.style.display = 'none';
        }
    }
    // --------------------------------------------------------

    // --- NOUVEAU: Mise à jour contenu Tooltip Bâtiment ---
    updateBuildingTooltipContent() {
        if (!this.selectedBuildingInfo || !this.buildingTooltipElement) return;

        const building = this.selectedBuildingInfo;
        const totalCapacity = building.capacity || 0;

        // --- CALCUL HABITANTS ACTUELS (garde la logique précédente) ---
        let currentInhabitants = 0;
        const agentManager = this.world?.agentManager;
        if (agentManager?.agents) {
            agentManager.agents.forEach(agent => {
                const isAtHomeHere = agent.homeBuildingId === building.id && agent.currentState === 'AT_HOME';
                const isAtWorkHere = agent.workBuildingId === building.id && agent.currentState === 'AT_WORK';
                if (isAtHomeHere || isAtWorkHere) {
                    currentInhabitants++;
                }
            });
        }
        // --- FIN CALCUL HABITANTS ACTUELS ---


        // --- NOUVEAU: OBTENIR LA LISTE DES RÉSIDENTS ASSIGNÉS ---
        const residentsIds = [];
        // Vérifier si on a accès aux agents et si le bâtiment a des occupants assignés
        if (agentManager?.agents && building.occupants && building.occupants.length > 0) {
            building.occupants.forEach(occupantId => {
                // Trouver l'agent correspondant à l'ID
                const agent = agentManager.agents.find(a => a.id === occupantId);
                // Vérifier si l'agent existe ET si ce bâtiment est son domicile assigné
                if (agent && agent.homeBuildingId === building.id) {
                    residentsIds.push(occupantId); // Ajouter l'ID à la liste des résidents
                }
            });
        }

        // Formatter la liste des résidents pour l'affichage
        const residentsListString = residentsIds.length > 0
            ? residentsIds.join(', ')
            : 'None';
        // --- FIN NOUVELLE LOGIQUE RÉSIDENTS ---

        // Construire le contenu HTML final
        const content = `
          ID: ${building.id}<br>
          Type: ${building.type}<br>
          Capacity: ${totalCapacity}<br>
          Inside Now: ${currentInhabitants}<br> Residents: ${residentsListString}  `;

        // Mettre à jour le HTML seulement s'il a changé
        if (this.buildingTooltipElement.innerHTML !== content) {
            this.buildingTooltipElement.innerHTML = content;
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

        // --- Contrôles caméra / Suivi Agent (existant) ---
        if (!this.isFollowingAgent && this.controls?.enabled) {
             this.controls.update();
        }
        if(this.camera) this.camera.update(deltaTime);
        // ------------------------------------------------

        // --- Mises à jour Monde, Renderer, TimeUI (existant) ---
        if(this.world) this.world.update();
        if(this.renderer) this.renderer.update();
        if (this.timeUI) this.timeUI.update();
        // ------------------------------------------------------

        // --- Tooltip Agent (existant - légèrement modifié pour cacher si bâtiment sélectionné) ---
        if (this.selectedAgent && this.tooltipElement && !this.selectedBuildingInfo) { // <-- Ajout !this.selectedBuildingInfo
            this.updateTooltipContent(this.selectedAgent);
            // Recalcul position 3D agent
            this.tooltipTargetPosition.copy(this.selectedAgent.position);
            const headHeightOffset = 8.0 * this.selectedAgent.scale;
            this.tooltipTargetPosition.y += this.selectedAgent.yOffset + headHeightOffset;
            const rightOffset = new THREE.Vector3(1, 0, 0);
            rightOffset.applyQuaternion(this.selectedAgent.orientation);
            rightOffset.multiplyScalar(3.0 * this.selectedAgent.scale);
            this.tooltipTargetPosition.add(rightOffset);
            // Projection 2D agent
            const projectedPositionAgent = this.tooltipTargetPosition.clone().project(this.camera.instance);
            if (projectedPositionAgent.z < 1) {
                const screenX = (projectedPositionAgent.x * 0.5 + 0.5) * this.sizes.width;
                const screenY = (-projectedPositionAgent.y * 0.5 + 0.5) * this.sizes.height;
                this.tooltipElement.style.left = `${screenX}px`;
                this.tooltipElement.style.top = `${screenY}px`;
                 if (this.tooltipElement.style.display === 'none') { this.tooltipElement.style.display = 'block'; }
            } else {
                if (this.tooltipElement.style.display !== 'none') { this.tooltipElement.style.display = 'none'; }
            }
        } else {
             if (this.tooltipElement && this.tooltipElement.style.display !== 'none') { this.tooltipElement.style.display = 'none'; }
        }
        // ----------------------------------------------------------

        // --- NOUVEAU: Mise à jour Tooltip Bâtiment ---
        if (this.selectedBuildingInfo && this.buildingTooltipElement) {
            // 1. Mettre à jour le contenu (habitants peuvent changer)
            this.updateBuildingTooltipContent();

            // 2. Recalculer la position 3D cible (sommet haut-droite)
            if (this.selectedBuildingMesh && this.selectedBuildingInstanceId !== -1) {
                const instanceMatrix = new THREE.Matrix4();
                this.selectedBuildingMesh.getMatrixAt(this.selectedBuildingInstanceId, instanceMatrix);

                // Extraire position et échelle pour déterminer le sommet
                const position = new THREE.Vector3();
                const quaternion = new THREE.Quaternion(); // Nécessaire pour décomposer
                const scale = new THREE.Vector3();
                instanceMatrix.decompose(position, quaternion, scale);

                // --- Trouver la hauteur et largeur/profondeur locales ---
                // Utiliser la boundingBox de la géométrie *de base* de l'instance mesh
                const baseGeometry = this.selectedBuildingMesh.geometry;
                if (!baseGeometry.boundingBox) {
                    baseGeometry.computeBoundingBox(); // Calculer si elle n'existe pas
                }

                let localHeight = 1, localWidth = 1, localDepth = 1;
                if (baseGeometry.boundingBox) {
                    localHeight = baseGeometry.boundingBox.max.y - baseGeometry.boundingBox.min.y;
                    localWidth = baseGeometry.boundingBox.max.x - baseGeometry.boundingBox.min.x;
                    localDepth = baseGeometry.boundingBox.max.z - baseGeometry.boundingBox.min.z;
                }
                // Appliquer l'échelle de l'instance
                const scaledHeight = localHeight * scale.y;
                const scaledWidth = localWidth * scale.x;
                const scaledDepth = localDepth * scale.z;
                // --- Fin calcul dimensions locales ---

                // Calculer le point local du sommet haut-droite (par rapport au centre de l'instance qui est 'position')
                // On prend le coin X+, Y+, Z- (correspondant souvent à haut-droite-avant)
                const localSummitOffset = new THREE.Vector3(
                    scaledWidth / 2,
                    scaledHeight / 2, // Le Y+ est en haut par rapport au centre
                    -scaledDepth / 2 // Le Z- est souvent vers "l'avant" ou la droite selon l'orientation
                );

                // Transformer ce décalage local par la rotation de l'instance
                localSummitOffset.applyQuaternion(quaternion);

                // Ajouter le décalage transformé à la position centrale de l'instance
                this.buildingTooltipTargetPosition.copy(position).add(localSummitOffset);

                // Ajouter un petit offset supplémentaire pour dégager le tooltip du coin exact
                const offsetAmount = 1.5; // Ajuster cette valeur
                const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
                const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion); // Pas vraiment utile ici
                this.buildingTooltipTargetPosition.addScaledVector(rightDir, offsetAmount);
                this.buildingTooltipTargetPosition.y += offsetAmount * 0.5; // Monter un peu

                // 3. Projeter en 2D
                const projectedPositionBuilding = this.buildingTooltipTargetPosition.clone().project(this.camera.instance);

                if (projectedPositionBuilding.z < 1) { // Visible devant la caméra
                    const screenX = (projectedPositionBuilding.x * 0.5 + 0.5) * this.sizes.width;
                    const screenY = (-projectedPositionBuilding.y * 0.5 + 0.5) * this.sizes.height;

                    // Appliquer les styles pour positionner le tooltip
                    // Ajuster la transformation pour que le *coin* du tooltip soit au point cible
                    this.buildingTooltipElement.style.left = `${screenX}px`;
                    this.buildingTooltipElement.style.top = `${screenY}px`;
                    // Optionnel: ajuster la transformation pour décaler (ex: translation CSS)
                    // this.buildingTooltipElement.style.transform = `translate(5px, -100%)`; // Décaler un peu à droite, et au dessus

                    if (this.buildingTooltipElement.style.display === 'none') {
                        this.buildingTooltipElement.style.display = 'block';
                    }
                } else { // Cacher si derrière la caméra
                    if (this.buildingTooltipElement.style.display !== 'none') {
                        this.buildingTooltipElement.style.display = 'none';
                    }
                }
            } else { // Si mesh/instanceId ne sont pas valides, cacher
                 if (this.buildingTooltipElement.style.display !== 'none') {
                      this.buildingTooltipElement.style.display = 'none';
                 }
            }
        } else {
            // S'assurer qu'il est caché si aucun bâtiment n'est sélectionné
             if (this.buildingTooltipElement && this.buildingTooltipElement.style.display !== 'none') {
                 this.buildingTooltipElement.style.display = 'none';
             }
        }
        // --------------------------------------------------

        this.stats.end();
    }


    // --- Mettre à jour destroy() pour nettoyer le highlight et tooltip bâtiment ---
    destroy() {
        console.log("Destroying Experience...");

        // --- Nettoyage EventListeners (existant) ---
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);

        // --- NOUVEAU: Nettoyage Sélection Bâtiment ---
        if (this.highlightMesh) {
            this.scene.remove(this.highlightMesh);
            this.highlightMesh.geometry?.dispose();
            this.highlightMesh.material?.dispose();
            this.highlightMesh = null;
        }
        this.buildingTooltipElement = null; // Libérer référence DOM
        this.buildingTooltipTargetPosition = null;
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        // --------------------------------------------

        // --- Nettoyage Sélection Agent (existant) ---
        this.tooltipElement = null;
        this.tooltipTargetPosition = null;
        this.selectedAgent = null;
        // --------------------------------------------

        // --- Reste du nettoyage (existant) ---
        // ... (timeUI, timeControlUI, camera, world, controls, renderer, stats, scene, etc.) ...
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
        this.raycaster = null; this.mouse = null;

        instance = null;
        console.log("Experience détruite.");
    }
}