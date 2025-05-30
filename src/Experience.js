// src/Experience.js
import * as THREE from 'three';
import Stats from 'stats.js';
import Sizes from './Utils/Sizes.js';
import Time from './Utils/Time.js';
import Camera from './Core/Camera.js';
import Renderer from './Core/Renderer.js';
import World from './Core/World.js';
import TimeUI from './UI/TimeUI.js';
import TimeControlUI from './UI/TimeControlUI.js';
import AgentStatsUI from './UI/AgentStatsUI.js';
import WeatherControlUI from './UI/WeatherControlUI.js';
import EnvironmentControlUI from './UI/EnvironmentControlUI.js';
import FpsControlUI from './UI/FpsControlUI.js';
import BirdCameraUI from './UI/BirdCameraUI.js';
import RenderStatsUI from './UI/RenderStatsUI.js';
import ControlManager from './Core/Controls/ControlManager.js';
import './UI/WeatherUI.css';
import './UI/EnvironmentUI.css';
// Import nécessaire pour la recherche de mesh par position
import { Matrix4, Vector3 } from 'three';
import * as DebugTools from './World/Rendering/DebugTools.js';
import AgentUI from './UI/AgentUI.js';
// Import du pool d'objets
import ObjectPool from './Utils/ObjectPool.js';
import { defaultUIStates, saveUIStates, loadUIStates } from './config/uiConfig.js';
import TimeScheduler from './World/TimeScheduler.js';
import PerformanceMonitor from './Utils/PerformanceMonitor.js';

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
        this.originalFog = new THREE.FogExp2(0x1e2a36, 0);
        this.scene.fog = this.originalFog;
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        
        // --- Performance monitoring ---
        this.performanceMonitor = new PerformanceMonitor(this.renderer.instance);
        
        // --- Création du pool d'objets AVANT le world ---
        this.objectPool = new ObjectPool();
        this.world = new World(this);
        this.isDebugMode = false;

        // Charger les états des UI AVANT de créer les UIs
        this.uiStates = loadUIStates();

        this.timeUI = new TimeUI(this);
        this.weatherControlUI = new WeatherControlUI(this);
        this.environmentControlUI = new EnvironmentControlUI(this);
        this.agentStatsUI = new AgentStatsUI(this);
        this.timeControlUI = new TimeControlUI(this); // Déplacé après les autres UIs
        
        // Remplacer OrbitControls par ControlManager
        this.controlManager = new ControlManager(this);
        this.fpsControlUI = new FpsControlUI(this);
        this.birdCameraUI = new BirdCameraUI(this);
        this.renderStatsUI = new RenderStatsUI(this);
        
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // --- Sélection Agent ---
        this.selectedAgent = null;
        this.isFollowingAgent = false;
        this.tooltipElement = document.getElementById('agent-tooltip'); // Assurez-vous que cet ID existe
        if (this.tooltipElement) {
            this.tooltipElement.dataset.uiInteractive = 'true';
        }
        this.tooltipTargetPosition = new THREE.Vector3();

        // --- Sélection Bâtiment ---
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedBuildingInstanceId = -1;
        this.isBuildingOccupantListExpanded = false;
        this.highlightMesh = null;
        this.buildingTooltipElement = document.getElementById('building-tooltip'); // Assurez-vous que cet ID existe
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.dataset.uiInteractive = 'true'; // <-- AJOUTER
        }
        this.buildingTooltipTargetPosition = new THREE.Vector3();

        // --- Gestion des oiseaux (NOUVEAU) ---
        this.mouseMoveHandler = this._handleMouseMove.bind(this);
        window.addEventListener('mousemove', this.mouseMoveHandler);

        // --- NOUVELLE STRUCTURE : État de Visibilité des Calques et Sous-Calques Debug ---
        this.debugLayerVisibility = {
            district: {
                _showSubMenu: false,
                _visible: true,
                residential: true,
                business: true,
                industrial: true
            },
            plot: {
                _showSubMenu: false,
                _visible: true,
                house: true,
                building: true,
                industrial: true,
                skyscraper: true,
                park: true,
                unbuildable: true
            },
            buildingOutline: {
                _showSubMenu: false,
                _visible: true,
                house: true,
                building: true,
                industrial: true,
                skyscraper: true
            },
            navGrid: {
                _visible: false
            },
            navGridPedestrian: {
                _visible: false
            },
            navGridVehicle: {
                _visible: false
            },
            agentPath: {
                _visible: false
            },
            vehiclePath: {
                _visible: false
            }
        };

        // --- Variables clic vs drag ---
        this.mouseDownTime = 0;
        this.mouseDownPosition = { x: null, y: null };
        this.MAX_CLICK_DURATION = 200;
        this.MAX_CLICK_DISTANCE_SQ = 25; // pixels squared
        this.clickHandledByTooltip = false;

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

        // --- NOUVEAU : Gestionnaire pour les clics DANS le panneau de statistiques agent ---
        this._boundHandleStatsPanelClick = this._handleStatsPanelClick.bind(this);

        // --- Gestionnaire pour les contrôles de temps globaux ---
        this._boundHandleTimeControls = this._handleTimeControls.bind(this);
        document.addEventListener('keydown', this._boundHandleTimeControls);

        this.createHighlightMesh(); // Créer le mesh de surbrillance
        //console.log("Experience initialisée. Mode debug:", this.isDebugMode);

        // Exposer l'instance pour un accès global
        window.experience = this;

        // Exposer les outils de debug
        window.debugTools = DebugTools;

        // Exposer le pool d'objets pour un accès facile dans la console
        window.objectPool = this.objectPool;
        
        // Exposer des méthodes de test de performance
        window.testBatchingPerformance = () => this.testBatchingPerformance();

        this.agentUI = new AgentUI(this);

        // Initialiser le scheduler en même temps que les autres composants
        this.timeScheduler = new TimeScheduler(this);
    }

    /**
     * Helper function to calculate and apply clamped tooltip position.
     * @param {HTMLElement} tooltipElement - The tooltip DOM element.
     * @param {THREE.Vector3} targetPosition3D - The 3D world position to track.
     */
    _updateTooltipPosition(tooltipElement, targetPosition3D) {
        if (!tooltipElement || !targetPosition3D) {
            if (tooltipElement && tooltipElement.style.display !== 'none') tooltipElement.style.display = 'none';
            return;
        }

        // 1. Projection 3D -> 2D
        const projectedPosition = targetPosition3D.clone().project(this.camera.instance);

        // 2. Vérifier si la cible est derrière la caméra ou trop proche (z >= 1)
        if (projectedPosition.z >= 1) {
            if (tooltipElement.style.display !== 'none') tooltipElement.style.display = 'none'; // Cache si derrière
            return;
        }

        // 3. Conversion en coordonnées écran (pixels)
        const baseScreenX = (projectedPosition.x * 0.5 + 0.5) * this.sizes.width;
        const baseScreenY = (-projectedPosition.y * 0.5 + 0.5) * this.sizes.height;

        // 4. Obtenir les dimensions de l'infobulle
        // Sauvegarde de l'état actuel de display pour le restaurer si la mesure échoue
        const initialDisplay = tooltipElement.style.display;
        tooltipElement.style.visibility = 'hidden'; // Rendre invisible mais mesurable
        tooltipElement.style.display = 'block'; // Forcer l'affichage pour la mesure

        const tooltipWidth = tooltipElement.offsetWidth;
        const tooltipHeight = tooltipElement.offsetHeight;

        // Remettre display à son état initial APRÈS mesure, mais garder invisible pour l'instant
        tooltipElement.style.display = initialDisplay;

        // Si les dimensions ne sont pas valides (mesure a échoué)
        if (tooltipWidth <= 0 || tooltipHeight <= 0) {
            tooltipElement.style.visibility = 'visible';
            if (projectedPosition.z < 1) {
                tooltipElement.style.display = 'block';
            }
            return;
        }

        // 5. Calculer la position désirée
        // Centrer verticalement
        const finalScreenY = (this.sizes.height - tooltipHeight) / 2;
        
        // Positionner sur la moitié droite (3/4 de l'écran)
        const finalScreenX = (this.sizes.width * 0.75) - (tooltipWidth / 2);

        // 6. Vérifier et contraindre les limites de l'écran
        const margin = 10;

        // Clamp horizontal
        let clampedX = finalScreenX;
        if (clampedX + tooltipWidth > this.sizes.width - margin) {
            clampedX = this.sizes.width - tooltipWidth - margin;
        } else if (clampedX < margin) {
            clampedX = margin;
        }

        // Clamp vertical
        let clampedY = finalScreenY;
        if (clampedY + tooltipHeight > this.sizes.height - margin) {
            clampedY = this.sizes.height - tooltipHeight - margin;
        } else if (clampedY < margin) {
            clampedY = margin;
        }

        // 7. Appliquer la position finale
        tooltipElement.style.left = `${Math.round(clampedX)}px`;
        tooltipElement.style.top = `${Math.round(clampedY)}px`;

        // 8. Assurer la visibilité et le bon 'display'
        tooltipElement.style.visibility = 'visible';
        tooltipElement.style.display = 'block';
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
        // --- Début Logique AgentStatsUI ---
        // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
        // SECTION ENTIÈRE À SUPPRIMER
        // La logique de fermeture du panneau AgentStatsUI est maintenant gérée DANS AgentStatsUI
        /*
        const agentStatsPanel = this.agentStatsUI?.elements?.statsPanel;
        const isAgentStatsVisible = this.agentStatsUI?.isVisible;
        // ... (toute la logique if/else basée sur isAgentStatsVisible) ...
         if(this.agentStatsUI) this.agentStatsUI.isPointerDown = false; // <- Garder potentiellement ce reset?
        */
        // --- Fin Logique AgentStatsUI ---
        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        // Réinitialiser isPointerDown de AgentStatsUI ici par sécurité, car Experience écoute aussi mouseup
        if (this.agentStatsUI?.isVisible) { // Seulement si le panneau était potentiellement concerné
            if (this.agentStatsUI) this.agentStatsUI.isPointerDown = false;
        }

        // --- Logique Originale Raycasting / Désélection 3D ---
        if (this.clickHandledByTooltip) {
            this.clickHandledByTooltip = false; // Réinitialiser le drapeau immédiatement
            // Réinitialiser aussi l'état du clic pour éviter des effets de bord
            this.mouseDownTime = 0;
            this.mouseDownPosition.x = null;
            this.mouseDownPosition.y = null;
            // Sortir de la fonction pour ne pas exécuter le raycast/désélection
            return;
        }

        if (event.button !== 0) return; // Seulement clic gauche

        const upTime = Date.now();
        const clickDuration = upTime - this.mouseDownTime;
        const deltaX = event.clientX - this.mouseDownPosition.x;
        const deltaY = event.clientY - this.mouseDownPosition.y;
        const distanceSq = deltaX * deltaX + deltaY * deltaY;

        // Vérifier si c'est un clic (durée courte, peu de mouvement)
        if (clickDuration <= this.MAX_CLICK_DURATION && distanceSq <= this.MAX_CLICK_DISTANCE_SQ) {
            // //console.log("Click détecté."); // Décommenter pour debug
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            // --- Préparer les objets à intersecter ---
            const objectsToIntersect = [];
            const agentManager = this.world?.agentManager;
            const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;
            const carManager = this.world?.carManager; // <<< NOUVEAU

            // Ajouter les agents (torse et tête) - HAUTE QUALITÉ
            if (agentManager?.instanceMeshes?.highDetail) {
                if (agentManager.instanceMeshes.highDetail.torso) objectsToIntersect.push(agentManager.instanceMeshes.highDetail.torso);
                if (agentManager.instanceMeshes.highDetail.head) objectsToIntersect.push(agentManager.instanceMeshes.highDetail.head);
            }
            
            // Ajouter les agents LOD (torse et tête) - BASSE QUALITÉ
            if (agentManager?.instanceMeshes?.lowDetail) {
                if (agentManager.instanceMeshes.lowDetail.torso) objectsToIntersect.push(agentManager.instanceMeshes.lowDetail.torso);
                if (agentManager.instanceMeshes.lowDetail.head) objectsToIntersect.push(agentManager.instanceMeshes.lowDetail.head);
            }

            // Ajouter les voitures (body, wheel, etc.) // <<< NOUVEAU
            if (carManager?.instancedMeshes) {
                objectsToIntersect.push(...Object.values(carManager.instancedMeshes));
            }

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
                // alert("aaaaaaaaaa"); // <<< RETIRER
                const firstIntersect = intersects[0];
                const clickedObject = firstIntersect.object;

                // --- Vérifier si un Agent a été cliqué ---
                if (agentManager && agentManager.agents &&
                    ((agentManager.instanceMeshes.highDetail && 
                      (clickedObject === agentManager.instanceMeshes.highDetail.torso || 
                       clickedObject === agentManager.instanceMeshes.highDetail.head)) ||
                     (agentManager.instanceMeshes.lowDetail && 
                      (clickedObject === agentManager.instanceMeshes.lowDetail.torso || 
                       clickedObject === agentManager.instanceMeshes.lowDetail.head))) &&
                    firstIntersect.instanceId !== undefined) {
                    
                    // Convertir l'instanceId en id d'agent
                    const agentInstanceId = firstIntersect.instanceId;
                    // Utiliser l'instanceId pour trouver l'agent
                    const clickedAgentId = agentManager.instanceIdToAgent[agentInstanceId];
                    const clickedAgent = agentManager.getAgentById(clickedAgentId);
                    
                    if (clickedAgent) {
                        this.deselectBuilding(); // Important: désélectionner bâtiment
                        this.selectAgent(clickedAgent);
                        clickedOnSomething = true;
                    }
                }
                // --- Vérifier si une Voiture a été cliquée --- // <<< NOUVEAU BLOC
                else if (carManager && firstIntersect.instanceId !== undefined && clickedObject instanceof THREE.InstancedMesh) {
                    const instanceId = firstIntersect.instanceId;
                    const agentId = carManager.getAgentIdByInstanceId(instanceId); // Récupérer l'agent via CarManager

                    if (agentId !== undefined) {
                        const clickedAgent = agentManager.getAgentById(agentId);
                        if (clickedAgent) {
                            this.deselectBuilding(); // Désélectionner bâtiment
                            this.selectAgent(clickedAgent); // Sélectionner l'agent DANS la voiture
                            clickedOnSomething = true;
                            //console.log(`Clic sur voiture (instance ${instanceId}), agent sélectionné: ${agentId}`);
                        } else {
                            //console.log(`Clic sur voiture (instance ${instanceId}), mais aucun agent associé trouvé.`);
                        }
                    }
                }
                // --- Fin Vérification Voiture ---
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
                            const tempVector = new THREE.Vector3().subVectors(worldPosition, buildingInfo.position);
                            const distSq = tempVector.lengthSq();
                            if (distSq < minDistSq && distSq < toleranceSq) {
                                minDistSq = distSq;
                                closestBuilding = buildingInfo;
                            }
                        });
                    }

                    if (closestBuilding) {
                        //console.log(`Bâtiment cliqué: ID=${closestBuilding.id}, Type=${closestBuilding.type}`);
                        this.deselectAgent(); // Important: désélectionner agent
                        this.selectBuilding(closestBuilding, clickedMesh, instanceId);
                        clickedOnSomething = true;
                    } else {
                        //console.log(`Clic sur mesh (${clickedMesh.name}, instance ${instanceId}), mais impossible de lier à un BuildingInfo.`);
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
                //console.log(`Agent Tooltip: Clic sur l'ID bâtiment: ${buildingId}`);
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
                            const tempVector2 = new THREE.Vector3().subVectors(instancePosition, targetPosition);
                            const distSq = tempVector2.lengthSq();

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
                    //console.log(`Bâtiment ${buildingId} trouvé : Mesh ${foundMesh.name}, Instance ${foundInstanceId}`);
                    // Désélectionner l'agent actuel (car on sélectionne un bâtiment)
                    this.deselectAgent();
                    // Sélectionner le bâtiment trouvé
                    this.selectBuilding(buildingInfo, foundMesh, foundInstanceId);
                    this.clickHandledByTooltip = true;
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
        // --- AJOUT : Ignorer si le clic vient d'un bouton toggle ---
        if (event.target.closest('.toggle-building-occupant-list')) {
            return; // Ne rien faire si le clic était sur le bouton toggle
        }
        // --- FIN AJOUT ---

        const clickedLink = event.target.closest('.resident-id-link');
        if (clickedLink) {
            const agentId = clickedLink.dataset.agentId;
            if (agentId) {
                // //console.log(`Clic sur l'ID résident/employé: ${agentId}`); // Décommenter pour debug
                const agentManager = this.world?.agentManager;
                const agentToSelect = agentManager?.agents.find(a => a.id === agentId);
                if (agentToSelect) {
                    // //console.log(`Agent ${agentId} trouvé, sélection en cours...`); // Décommenter pour debug
                    this.deselectBuilding(); // Quitter la sélection bâtiment
                    this.selectAgent(agentToSelect); // Sélectionner l'agent cliqué
                    this.clickHandledByTooltip = true;
                } else {
                    console.warn(`Agent avec ID ${agentId} non trouvé.`);
                }
            }
        }
    }

    // Sélectionne un agent et active le suivi caméra/tooltip
    selectAgent(agent) {
        if (!agent) return;
        if (this.selectedAgent === agent) return; // Déjà sélectionné

        // Sauvegarder l'ancien agent pour la désélection propre
        const oldAgent = this.selectedAgent;
        
        // Mettre à jour la sélection
        this.selectedAgent = agent;
        if (this.tooltipElement) {
            this.tooltipElement.style.display = 'block';
            this.updateTooltipContent(agent);
            this.tooltipTargetPosition.copy(agent.position).add(new THREE.Vector3(0, agent.scale * 8, 0));
        }

        // Marquer l'agent comme sélectionné
        agent.isSelected = true;

        // Désélectionner l'ancien agent si nécessaire
        if (oldAgent) {
            oldAgent.isSelected = false;
            if (this.isFollowingAgent) {
                this.stopFollowingAgent();
            }
        }

        // Calculer une position cible pour la caméra
        const agentPos = agent.position.clone();
        const cameraOffset = new THREE.Vector3(0, 10, 15); // Position relative à l'agent
        const targetCamPos = agentPos.clone().add(cameraOffset);
        const targetLookAt = agentPos.clone().add(new THREE.Vector3(0, 1, 0));

        // Lancer une transition douce vers l'agent
        this.camera.moveToTarget(targetCamPos, targetLookAt, 500, agent);
        //console.log(`Agent ${agent.id} sélectionné, transition vers l'agent en cours...`);

        // Déclencher un événement pour que l'interface utilisateur puisse réagir
        this.dispatchEvent(new CustomEvent('agentselected', { detail: { agent } }));
    }

    // Désélectionne l'agent et désactive le suivi
    deselectAgent() {
        if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
            this.tooltipElement.style.display = 'none';
        }
        if (!this.selectedAgent) return;

        const agentBeingDeselected = this.selectedAgent;
        this.selectedAgent = null;
        this.isFollowingAgent = false;

        // Calculer une position cible pour la caméra après la désélection
        const currentCamPos = this.camera.instance.position.clone();
        const currentLookAt = new THREE.Vector3();
        this.camera.instance.getWorldDirection(currentLookAt).multiplyScalar(10).add(currentCamPos);

        // Position cible : légèrement plus haute et plus éloignée
        const targetCamPos = currentCamPos.clone().add(new THREE.Vector3(0, 20, 30));
        const targetLookAt = currentLookAt.clone().add(new THREE.Vector3(0, 10, 0));

        // Lancer une transition douce vers cette position
        this.camera.moveToTarget(targetCamPos, targetLookAt, 1000, null);

        // Les contrôles seront réactivés automatiquement à la fin de la transition
        // dans la méthode update de la caméra
        if (this.ui) {
            this.ui.setSelectedAgentInfo(null); // Met à jour l'UI
        } else {
             console.warn("Experience.deselectAgent: this.ui is not defined.");
        }

        // Déclencher un événement pour que l'interface utilisateur puisse réagir
        this.dispatchEvent(new CustomEvent('agentdeselected'));
    }

    // Sélectionne un bâtiment, active le highlight et le tooltip bâtiment
    selectBuilding(buildingInfo, mesh, instanceId) {
        if (!buildingInfo) return;
        if (this.selectedBuildingInfo && this.selectedBuildingInfo.id === buildingInfo.id) {
            return; // Déjà sélectionné
        }

        this.deselectAgent(); // Désélectionner agent si on sélectionne bâtiment

        this.selectedBuildingInfo = buildingInfo;
        this.selectedBuildingMesh = mesh;
        this.selectedBuildingInstanceId = instanceId;

        // Activer et positionner le highlight (code existant)
        if (this.highlightMesh && this.selectedBuildingMesh && this.selectedBuildingInstanceId !== -1) {
            // ... (logique de positionnement du highlight existante) ...
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

        // --- NOUVEAU : Déplacer la caméra au-dessus du bâtiment ---
        const buildingPos = buildingInfo.position;

        // --- MODIFIÉ: Calculer la position cible en conservant l'orientation horizontale ---
        const currentCamPos = this.camera.instance.position;
        const currentTarget = this.controlManager.target; // Ou this.camera.targetLookAtPosition si controls désactivé

        // 1. Vecteur direction horizontal actuel (Caméra -> Cible)
        const direction = new THREE.Vector3().subVectors(currentTarget, currentCamPos);
        direction.y = 0; // Ignorer la composante verticale
        direction.normalize();

        // 2. Définir la distance et la hauteur souhaitées par rapport au bâtiment
        // Ajustez ces valeurs pour le cadrage
        const desiredDistance = 150 + (buildingInfo.type === 'skyscraper' ? 50 : 0); // Distance horizontale par rapport au bâtiment
        const desiredHeight = 100 + (buildingInfo.type === 'skyscraper' ? 80 : 0); // Hauteur au-dessus du bâtiment

        // 3. Calculer la position cible de la caméra
        // On part de la position du bâtiment, on recule selon la direction actuelle, et on monte
        const cameraTargetPos = buildingPos.clone()
            .addScaledVector(direction, -desiredDistance) // Reculer selon la direction
            .add(new THREE.Vector3(0, desiredHeight, 0)); // Monter

        // 4. Le point regardé reste le bâtiment
        const cameraLookAt = buildingPos.clone();
        // --- FIN MODIFICATION ---

        this.camera.moveToTarget(cameraTargetPos, cameraLookAt, 500); // Animation de 0.5s au lieu de 1s
        // --- FIN NOUVEAU ---

        // Cacher l'infobulle agent
        if (this.tooltipElement) {
            this.tooltipElement.style.display = 'none';
        }
        // Afficher et mettre à jour le tooltip bâtiment
        if (this.buildingTooltipElement) {
            this.updateBuildingTooltipContent(); // Met à jour immédiatement
            // La position sera définie dans update()
        }
    }

    // Désélectionne le bâtiment, cache highlight et tooltip
    deselectBuilding() {
        if (!this.selectedBuildingInfo) return;
        this.isBuildingOccupantListExpanded = false;
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedBuildingInstanceId = -1;
        if (this.highlightMesh) {
            this.highlightMesh.visible = false;
        }
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.style.display = 'none';
        }
        // S'assurer qu'OrbitControls est actif quand rien n'est sélectionné
        // (sauf si un agent extérieur est sélectionné juste après)
        // C'est géré dans selectAgent/deselectAgent maintenant.
        // if (this.controls && !this.isFollowingAgent) { // Vérifier si on ne suit pas déjà un agent
        //    this.controls.enabled = true;
        // }
    }

    // --- MODIFIÉ : Met à jour le contenu HTML du tooltip agent AVEC liens et infos santé ---
    updateTooltipContent(agent) {
        if (!agent || !this.tooltipElement) return;

        // Fonction interne pour créer les liens
        const createBuildingLink = (buildingId) => {
            if (buildingId) {
                return `<span class="building-id-link" data-building-id="${buildingId}">${buildingId}</span>`;
            } else {
                return 'N/A';
            }
        };

        const homeLink = createBuildingLink(agent.homeBuildingId);
        const workLink = createBuildingLink(agent.workBuildingId);

        // Récupérer les statistiques du citoyen
        const citizenManager = this.world?.cityManager?.citizenManager;
        const citizenInfo = citizenManager?.getCitizenInfo(agent.id);

        // Préparer l'affichage des maladies
        let maladiesHTML = 'Aucune';
        if (citizenInfo?.diseases && citizenInfo.diseases.length > 0) {
            maladiesHTML = citizenInfo.diseases.join(', ');
        }

        // Icône pour le statut Humain/Argile
        const statusIcon = citizenInfo?.status === "Argile" ? "🧱" : "👤";
        
        // Information d'adaptation physiologique
        const hasAdaptation = citizenInfo?.status === "Humain";
        const adaptationInfo = hasAdaptation 
            ? "Oui (+1/jour)" 
            : "Non (bloquée)";
            
        // Information d'agression chimique
        const agressionChimiqueInfo = "Oui (-1/médoc)";
        
        // Information de vieillissement hebdomadaire
        const vieillissementInfo = "Oui (-1/semaine)";

        // Liste des besoins actuels
        let besoinsHTML = 'Aucun';
        const besoins = [];
        
        if (citizenInfo?.needsMedication) {
            besoins.push('💊 Médicament');
        }
        
        if (besoins.length > 0) {
            besoinsHTML = besoins.join(', ');
        }
        
        // Affichage de l'inventaire
        const medicationCount = agent.inventory?.medications || 0;
        const inventoryHTML = `💊 Médicaments: ${medicationCount}`;

        const content = `
            <div class="tooltip-header">
                <span class="agent-id">${agent.id}</span>
                <span class="agent-state">${agent.currentState || 'N/A'}</span>
            </div>
            <div class="tooltip-section">
                <div class="tooltip-row">
                    <span class="tooltip-label">☗ Domicile</span>
                    <span class="tooltip-value">${homeLink}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">⚒ Travail</span>
                    <span class="tooltip-value">${workLink}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">☻ Bonheur</span>
                    <span class="tooltip-value">${citizenInfo?.happiness?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">♥ Santé / Santé Max</span>
                    <span class="tooltip-value">${citizenInfo?.health?.toFixed(0) || 'N/A'}/${citizenInfo?.maxHealth?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">⭕ Seuil Santé Max</span>
                    <span class="tooltip-value">${citizenInfo?.healthThreshold?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">🔄 Adaptation Phy.</span>
                    <span class="tooltip-value">${adaptationInfo}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">⚠️ Agression Chim.</span>
                    <span class="tooltip-value">${agressionChimiqueInfo}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">👴 Vieillissement</span>
                    <span class="tooltip-value">${vieillissementInfo}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">${statusIcon} Statut</span>
                    <span class="tooltip-value">${citizenInfo?.status || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">💊 Dépendance</span>
                    <span class="tooltip-value">${citizenInfo?.chemicalDependency?.toFixed(0) || '0'}/100</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">📋 Besoins</span>
                    <span class="tooltip-value">${besoinsHTML}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">🦠 Maladies</span>
                    <span class="tooltip-value">${maladiesHTML}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">$ Argent</span>
                    <span class="tooltip-value">${citizenInfo?.money?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">✤ Salaire</span>
                    <span class="tooltip-value">${citizenInfo?.salary?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">🎒 Inventaire</span>
                    <span class="tooltip-value">${inventoryHTML}</span>
                </div>
            </div>
            <div class="agent-actions-panel">
                <div class="button-container">
                    <button class="treatment-btn palliative-btn" data-treatment-type="palliative" title="Augmente temporairement la santé du citoyen">Soin Pall.</button>
                    <button class="treatment-btn classic-btn" data-treatment-type="classic" title="Guérit une maladie mais augmente la dépendance chimique">Trait. Class.</button>
                    <button class="treatment-btn natural-btn" data-treatment-type="natural" title="Guérit une maladie après 5 prises, sans effets secondaires">Trait. Nat.</button>
                </div>
            </div>
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
        const buildingId = building.id; // ID du bâtiment pour l'unicité

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
                        listLabel = "Habitants ";
                    } else if (building.isWorkplace && agent.workBuildingId === building.id) {
                        occupantsList.push(occupantId);
                        listLabel = "Employés ";
                    }
                }
            });
        }

        // Génère le HTML pour la liste (cliquable et avec toggle)
        let occupantsListHTML = 'Aucun';
        const count = occupantsList.length;
        if (count > 0) {
            const initialDisplayCount = 10;
            const displayIds = occupantsList.slice(0, initialDisplayCount);
            const listContainerId = `building-tooltip-list-${buildingId}`.replace(/\./g, '-'); // ID unique

            occupantsListHTML = `<span class="building-occupant-list-container" id="${listContainerId}">`; // Conteneur pour le toggle
            occupantsListHTML += displayIds.map(id =>
                `<span class="resident-id-link" data-agent-id="${id}" title="Sélectionner l\'agent ${id}">${id}</span>`
            ).join(' | ');

            if (count > initialDisplayCount) {
                // <<< UTILISATION DE L'ETAT STOCKE >>>
                const isExpanded = this.isBuildingOccupantListExpanded;
                const hiddenSpanStyle = `display: ${isExpanded ? 'inline' : 'none'};`;
                const buttonText = isExpanded ? "(voir moins)" : `(... voir ${count - initialDisplayCount} de plus)`;
                const buttonDataLess = "(voir moins)";
                const buttonDataMore = `(... voir ${count - initialDisplayCount} de plus)`;

                occupantsListHTML += `<span class="building-occupant-list-hidden" style="${hiddenSpanStyle}"> | ${occupantsList.slice(initialDisplayCount).map(id => `<span class="resident-id-link" data-agent-id="${id}" title="Sélectionner l\'agent ${id}">${id}</span>`).join(' | ')}</span>`;
                occupantsListHTML += ` <button class="toggle-building-occupant-list" data-target="#${listContainerId}" data-more-text="${buttonDataMore}" data-less-text="${buttonDataLess}" style="cursor: pointer; background: none; border: none; color: #a7c5eb; padding: 0; font-size: 0.9em; vertical-align: baseline; pointer-events: auto;" data-ui-interactive="true">${buttonText}</button>`;
            }
            occupantsListHTML += `</span>`; // Fin building-occupant-list-container
        }

        // Construit le contenu final du tooltip
        const content = `
          ID : ${building.id}<br>
          Type : ${building.type}<br>
          Capacité : ${totalCapacity}<br>
          Actuellement à l'intérieur : ${currentOccupantsInside}<br>
          ${listLabel}: <br>${occupantsListHTML}
        `;

        // Met à jour le DOM seulement si nécessaire
        if (this.buildingTooltipElement.innerHTML !== content) {
            this.buildingTooltipElement.innerHTML = content;
            this._setupBuildingTooltipToggleListeners();
        }
    }

    // --- MODIFIÉ : Le handler inverse l'état et force le re-rendu ---
    _setupBuildingTooltipToggleListeners() {
        if (!this.buildingTooltipElement) return;

        this.buildingTooltipElement.querySelectorAll('.toggle-building-occupant-list').forEach(button => {
            // --- Utiliser une fonction nommée pour faciliter le removeEventListener ---
            const handler = (event) => {
                //console.log("Building Tooltip: Toggle button clicked!");
                event.stopPropagation();
                // 1. Inverser l'état stocké
                this.isBuildingOccupantListExpanded = !this.isBuildingOccupantListExpanded;
                //console.log(`Building Tooltip: Set isBuildingOccupantListExpanded to ${this.isBuildingOccupantListExpanded}`);
                // 2. Forcer la mise à jour du contenu (qui lira le nouvel état)
                this.updateBuildingTooltipContent();
                // 3. Mettre à jour la position (important car la hauteur change)
                this._updateTooltipPosition(this.buildingTooltipElement, this.buildingTooltipTargetPosition);
            };

            // Retirer l'ancien écouteur s'il existe (plus fiable avec fonction nommée)
            if (button._clickHandler) {
                button.removeEventListener('click', button._clickHandler);
            }
            // Attacher le nouvel écouteur et le stocker
            button._clickHandler = handler;
            button.addEventListener('click', handler);
        });
    }

    // --- NOUVEAU : Gère les clics dans le PANNEAU DE STATISTIQUES AGENT ---
    _handleStatsPanelClick(event) {
        // Recherche d'un lien d'agent cliqué
        const clickedLink = event.target.closest('.agent-id-link');
        if (clickedLink) {
            const agentId = clickedLink.dataset.agentId;
            if (agentId) {
                const agentManager = this.world?.agentManager;
                const agentToSelect = agentManager?.agents.find(a => a.id === agentId);
                if (agentToSelect) {
                    //console.log(`Stats Panel: Clic sur l'ID agent: ${agentId}`);
                    // Pas besoin de désélectionner bâtiment ici, car on est dans un panneau différent
                    // this.deselectBuilding();
                    this.selectAgent(agentToSelect); // Sélectionner l'agent cliqué
                    // Optionnel : Fermer le panneau de stats après sélection ?
                    // this.agentStatsUI?.hide();
                    this.clickHandledByTooltip = true; // Considérer ce clic comme géré par l'UI
                } else {
                    console.warn(`Agent avec ID ${agentId} non trouvé depuis le panneau de stats.`);
                }
            }
        }
        // Note: Ne pas gérer les clics sur les boutons toggle ici, c'est fait dans AgentStatsUI
    }
    // --- FIN NOUVELLE MÉTHODE ---

    /**
     * Réinitialise la visibilité de tous les éléments debug (catégories et sous-catégories) à false.
     * Les catégories et sous-catégories ne sont donc pas sélectionnées par défaut.
     */
    resetDebugLayerVisibility() {
        for (const category in this.debugLayerVisibility) {
            const cat = this.debugLayerVisibility[category];
            if (typeof cat === 'object') {
                if ('_visible' in cat) cat._visible = false;
                if ('_showSubMenu' in cat) cat._showSubMenu = false;
                for (const key in cat) {
                    if (!key.startsWith('_')) cat[key] = false;
                }
            } else if (typeof cat === 'boolean') {
                this.debugLayerVisibility[category] = false;
            }
        }
        // --- AJOUT : Forcer la mise à jour de la visibilité 3D ---
        this.updateAllDebugVisibility();
    }

    /**
     * Met à jour la visibilité de tous les groupes et sous-groupes debug dans le monde 3D
     * en fonction de debugLayerVisibility (pour garantir la synchro UI <-> rendu)
     */
    updateAllDebugVisibility() {
        if (!this.world) return;
        for (const category in this.debugLayerVisibility) {
            const cat = this.debugLayerVisibility[category];
            if (typeof cat === 'object') {
                if ('_visible' in cat) this.world.setGroupVisibility(category, cat._visible);
                for (const key in cat) {
                    if (!key.startsWith('_')) {
                        this.world.setSubLayerMeshVisibility(category, key, cat[key]);
                    }
                }
            } else if (typeof cat === 'boolean') {
                this.world.setLayerVisibility(category, cat);
            }
        }
    }

    enableDebugMode() {
        if (!this.isDebugMode) {
            this.isDebugMode = true;
            //console.log("Debug Mode ENABLED");
            if (this.scene) this.scene.fog = null;
            if (this.world) this.world.setDebugMode(true);

            // --- AJOUT : Réinitialiser la sélection des éléments debug ---
            this.resetDebugLayerVisibility();

            // --- MODIFICATION: Forcer l'ouverture de tous les sous-menus ---
            for (const category in this.debugLayerVisibility) {
                if (this.debugLayerVisibility[category]._showSubMenu !== undefined) {
                    this.debugLayerVisibility[category]._showSubMenu = true; // Toujours montrer en mode debug
                }
            }
            // --- FIN MODIFICATION ---

            this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: true } }));
        }
    }

    disableDebugMode() {
        if (this.isDebugMode) {
            this.isDebugMode = false;
            //console.log("Debug Mode DISABLED");
            if (this.scene && this.originalFog) this.scene.fog = this.originalFog;
            if (this.world) this.world.setDebugMode(false);
            // Cacher tous les sous-menus lorsque le mode debug est désactivé (comportement actuel OK)
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
        //console.log(`Debug Mode global ${this.isDebugMode ? 'ENABLED' : 'DISABLED'}`);

        if (this.scene) {
            this.scene.fog = this.isDebugMode ? null : this.originalFog;
        }

        if (this.world) {
            this.world.setDebugMode(this.isDebugMode);
        }

        // Réinitialiser la sélection des éléments debug lors de l'activation
        if (this.isDebugMode) {
            this.resetDebugLayerVisibility();
        }

        // Forcer l'état des sous-menus basé sur le mode debug
        for (const category in this.debugLayerVisibility) {
            if (this.debugLayerVisibility[category]._showSubMenu !== undefined) {
                this.debugLayerVisibility[category]._showSubMenu = this.isDebugMode;
            }
        }

        this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: this.isDebugMode } }));
    }

    toggleWeatherUI() {
        const weatherUI = document.querySelector('.weather-control-ui');
        if (weatherUI) {
            const isVisible = weatherUI.style.display !== 'none';
            weatherUI.style.display = isVisible ? 'none' : 'block';
            if (this.weatherUI) {
                this.weatherUI.isVisible = !isVisible;
                this.updateUIState('weather', !isVisible);
            }
        }
    }

    toggleEnvironmentUI() {
        const environmentUI = document.querySelector('.environment-control-ui');
        if (environmentUI) {
            const isVisible = environmentUI.style.display !== 'none';
            environmentUI.style.display = isVisible ? 'none' : 'block';
            if (this.environmentUI) {
                this.environmentUI.isVisible = !isVisible;
                this.updateUIState('environment', !isVisible);
            }
        }
    }

    toggleAllSubLayersInCategory(categoryName) {
        //console.log(`[Experience] Entrée dans toggleAllSubLayersInCategory pour ${categoryName}`);
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName)) {
            console.warn(`Experience.toggleAllSubLayersInCategory: Unknown category name '${categoryName}'`);
            return;
        }

        const category = this.debugLayerVisibility[categoryName];
        const subLayerKeys = Object.keys(category).filter(key => !key.startsWith('_'));

        if (subLayerKeys.length === 0) {
            this.toggleCategoryVisibility(categoryName);
            return;
        }

        const shouldActivate = subLayerKeys.every(key => !category[key]);
        const targetState = shouldActivate;
        //console.log(`[Experience] Pour ${categoryName}, targetState déterminé : ${targetState}`);

        category._visible = targetState;
        //console.log(`[Experience] Pour ${categoryName}, category._visible mis à : ${category._visible}`);

        let changesMade = false;
        subLayerKeys.forEach(subTypeName => {
            if (category[subTypeName] !== targetState) {
                category[subTypeName] = targetState;
                if (this.isDebugMode && this.world) {
                    if (category._visible) {
                        //console.log(`[Experience] Appel setSubLayerMeshVisibility(${categoryName}, ${subTypeName}, ${targetState})`);
                        this.world.setSubLayerMeshVisibility(categoryName, subTypeName, targetState);
                    }
                }
                changesMade = true;
            }
        });

        if (this.isDebugMode && this.world) {
            //console.log(`[Experience] Appel setGroupVisibility(${categoryName}, ${category._visible})`);
            this.world.setGroupVisibility(categoryName, category._visible);
        }

        this.dispatchEvent(new CustomEvent('debugcategoryvisibilitychanged', {
            detail: {
                categoryName: categoryName,
                isVisible: category._visible,
                allStates: { ...this.debugLayerVisibility }
            }
        }));

        if (changesMade) {
            this.dispatchEvent(new CustomEvent('debugcategorychildrenchanged', {
                detail: {
                    categoryName: categoryName,
                    allStates: { ...this.debugLayerVisibility }
                }
            }));
        }
    }

    toggleCategoryVisibility(categoryName) {
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName)) {
            console.warn(`Experience.toggleCategoryVisibility: Unknown category name '${categoryName}'`);
            return;
        }

        const category = this.debugLayerVisibility[categoryName];
        const currentVisibility = category._visible;
        const newVisibility = !currentVisibility;
        category._visible = newVisibility;

        //console.log(`Debug Category '${categoryName}' visibility toggled to: ${newVisibility}`);

        // Appliquer la visibilité au groupe correspondant dans World
        if (this.isDebugMode && this.world) {
            this.world.setGroupVisibility(categoryName, newVisibility);
        }

        // Mettre à jour l'état visuel des sous-types dans l'UI (grisés si parent caché)
        // L'état logique des sous-types n'est PAS modifié ici.
        this.dispatchEvent(new CustomEvent('debugcategoryvisibilitychanged', {
            detail: {
                categoryName: categoryName,
                isVisible: newVisibility,
                allStates: { ...this.debugLayerVisibility }
            }
        }));
    }

    toggleSubLayerVisibility(categoryName, subTypeName) {
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName) ||
            !this.debugLayerVisibility[categoryName].hasOwnProperty(subTypeName) ||
            subTypeName.startsWith('_')) {
            console.warn(`Experience.toggleSubLayerVisibility: Invalid category '${categoryName}' or subType '${subTypeName}'`);
            return;
        }

        const category = this.debugLayerVisibility[categoryName];
        const currentVisibility = category[subTypeName];
        const newVisibility = !currentVisibility;
        category[subTypeName] = newVisibility;

        //console.log(`  Debug Sub-Layer '${categoryName}.${subTypeName}' visibility toggled to: ${newVisibility}`);

        let parentVisibilityChanged = false;
        let applyIndividualChildVisibility = true; // Flag pour savoir si on doit mettre à jour l'enfant seul

        // --- 1. Faut-il activer le parent ? ---
        if (newVisibility && !category._visible) {
            //console.log(`   Parent category '${categoryName}' was hidden, activating it.`);
            category._visible = true;
            parentVisibilityChanged = true;
            applyIndividualChildVisibility = false; // La synchro globale s'en chargera
            if (this.isDebugMode && this.world) {
                this.world.setGroupVisibility(categoryName, true);
                const subLayerKeys = Object.keys(category).filter(key => !key.startsWith('_'));
                subLayerKeys.forEach(key => {
                    //console.log(`[Experience] Syncing child mesh visibility: ${categoryName}.${key} = ${category[key]}`);
                    this.world.setSubLayerMeshVisibility(categoryName, key, category[key]);
                });
            }
        }
        // --- 2. Faut-il désactiver le parent ? ---
        else if (!newVisibility && category._visible) {
            const subLayerKeys = Object.keys(category).filter(key => !key.startsWith('_'));
            const allChildrenInactive = subLayerKeys.every(key => !category[key]);
            if (allChildrenInactive) {
                //console.log(`   Last active child of '${categoryName}' deactivated, hiding parent.`);
                category._visible = false;
                parentVisibilityChanged = true;
                // Pas besoin de applyIndividualChildVisibility = false ici, car le groupe entier sera caché
                if (this.isDebugMode && this.world) {
                    this.world.setGroupVisibility(categoryName, false);
                }
            }
        }

        // --- 3. Mettre à jour la visibilité 3D de l'enfant si le parent n'a pas changé OU n'a pas été activé ---
        if (applyIndividualChildVisibility && this.isDebugMode && category._visible && this.world) {
            //console.log(`[Experience] Applying individual child visibility: ${categoryName}.${subTypeName} = ${newVisibility}`);
            this.world.setSubLayerMeshVisibility(categoryName, subTypeName, newVisibility);
        }

        // --- 4. Dispatch des événements ---
        if (parentVisibilityChanged) {
            this.dispatchEvent(new CustomEvent('debugcategoryvisibilitychanged', {
                detail: {
                    categoryName: categoryName,
                    isVisible: category._visible,
                    allStates: { ...this.debugLayerVisibility }
                }
            }));
        }
        this.dispatchEvent(new CustomEvent('debugsublayervisibilitychanged', {
            detail: {
                categoryName: categoryName,
                subTypeName: subTypeName,
                isVisible: newVisibility,
                allStates: { ...this.debugLayerVisibility }
            }
        }));
    }

    toggleDebugLayer(layerName) {
        if (!this.debugLayerVisibility.hasOwnProperty(layerName)) {
            console.warn(`Experience.toggleDebugLayer: Unknown layer name '${layerName}'`);
            return;
        }

        // Inverser l'état de visibilité du calque
        this.debugLayerVisibility[layerName] = !this.debugLayerVisibility[layerName];
        //console.log(`  Debug Layer '${layerName}' visibility toggled to: ${this.debugLayerVisibility[layerName]}`);

        // Si le mode debug global est actif, mettre à jour la visibilité du groupe correspondant dans World
        if (this.isDebugMode && this.world) {
            this.world.setLayerVisibility(layerName, this.debugLayerVisibility[layerName]);
        }

        // Notifier l'UI (pour mettre à jour l'état des boutons de calque)
        // On réutilise l'événement existant ou on en crée un nouveau si besoin de plus de détails
        this.dispatchEvent(new CustomEvent('debuglayervisibilitychanged', {
            detail: {
                layerName: layerName,
                isVisible: this.debugLayerVisibility[layerName],
                allStates: { ...this.debugLayerVisibility } // Passer tous les états actuels
            }
        }));
    }

    // Gère le redimensionnement de la fenêtre
    resize() {
        if (this.camera) this.camera.resize();
        if (this.renderer) this.renderer.resize();
    }

    update() {
        // Start stats measurement
        this.stats.begin();
        
        const deltaTime = this.time.delta; // Delta temps JEU (scaled) en ms
        const currentGameTime = this.time.elapsed; // Temps JEU total (scaled) en ms
        const currentHour = this.world?.environment?.getCurrentHour() ?? 12; // Heure JEU actuelle

        // Update controls (remplacer OrbitControls.update par ControlManager.update)
        this.controlManager.update();

        // Update camera (garde la compatibilité avec le code original)
        if (!this.isFollowingAgent) {
            this.camera.update(deltaTime);
        }

        // Update world
        if (this.world) {
            this.world.update();
        }

        // Update UI
        if (this.timeUI) this.timeUI.update();

        // Update tooltips if they are active
        if (this.selectedAgent && this.tooltipElement) {
            // Mettre à jour le contenu
            this.updateTooltipContent(this.selectedAgent);
            // Positionner la bulle
            this.tooltipTargetPosition
                .copy(this.selectedAgent.position)
                .add(new THREE.Vector3(0, this.selectedAgent.scale * 8, 0));
            this._updateTooltipPosition(this.tooltipElement, this.tooltipTargetPosition);
        } else if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
            // Plus d'agent sélectionné -> masquer la bulle
            this.tooltipElement.style.display = 'none';
        }
        
        if (this.selectedBuildingInfo && this.buildingTooltipElement && this.highlightMesh?.visible) {
            // Mettre à jour le contenu
            this.updateBuildingTooltipContent();
            // Positionner la bulle
            this.buildingTooltipTargetPosition
                .copy(this.highlightMesh.position)
                .add(new THREE.Vector3(0, this.highlightMesh.scale.y / 2 + 2, 0));
            this._updateTooltipPosition(this.buildingTooltipElement, this.buildingTooltipTargetPosition);
        } else if (this.buildingTooltipElement && this.buildingTooltipElement.style.display !== 'none') {
            this.buildingTooltipElement.style.display = 'none';
        }

        // Update renderer
        if (this.renderer) {
            this.renderer.update();
        }

        // Mettre à jour le scheduler avec le temps actuel
        if (this.timeScheduler) {
            this.timeScheduler.update(this.time.elapsed);
        }
        
        // Update performance monitor
        if (this.performanceMonitor) {
            this.performanceMonitor.update();
        }

        // End stats measurement
        this.stats.end();
    }

    // Nettoie les ressources et écouteurs lors de la destruction
    destroy() {
        //console.log("Destruction de l'Experience...");
        
        // UI
        this.timeUI.destroy();
        this.timeControlUI.destroy();
        this.agentStatsUI.destroy();
        this.weatherControlUI.destroy();
        this.environmentControlUI.destroy();
        this.fpsControlUI.destroy();
        this.birdCameraUI.destroy();
        this.renderStatsUI.destroy();
        
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);
        window.removeEventListener('mousemove', this.mouseMoveHandler);
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.removeEventListener('click', this._boundHandleBuildingTooltipClick);
            // Retirer aussi l'écouteur du panneau stats SI attaché ici (ancienne méthode, sécurité)
            if (this._boundHandleStatsPanelClick) {
                this.buildingTooltipElement.removeEventListener('click', this._boundHandleStatsPanelClick); // Correction: Doit être statsPanel, pas buildingTooltipElement
            }
        }
        if (this.tooltipElement) {
            this.tooltipElement.removeEventListener('click', this._boundHandleAgentTooltipClick);
        }
        // L'écouteur du panneau de stats est retiré dans AgentStatsUI.hide() et AgentStatsUI.destroy()
        // Mais il faut s'assurer que la référence est bien nullifiée ici aussi pour être propre
        this._boundHandleStatsPanelClick = null;

        // --- NOUVEAU : Retirer l'écouteur du panneau de stats (sécurité si AgentStatsUI.destroy échoue avant) ---
        if (this.agentStatsUI?.elements?.statsPanel && this.experience?._boundHandleStatsPanelClick) {
            this.agentStatsUI.elements.statsPanel.removeEventListener('click', this.experience._boundHandleStatsPanelClick);
        }
        // --- FIN NOUVEAU ---

        // --- Nettoyer les objets Three.js ---
        this.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (child.material.isMaterial) {
                    this._disposeMaterial(child.material);
                } else {
                    // Array of materials
                    for (const material of child.material) {
                        this._disposeMaterial(material);
                    }
                }
            }
        });

        // Nettoyer le mesh de surbrillance
        if (this.highlightMesh) {
            this.scene.remove(this.highlightMesh);
            this.highlightMesh.geometry?.dispose();
            this.highlightMesh.material?.dispose();
            this.highlightMesh = null;
        }

        // --- Nettoyer les composants propres ---
        if (this.controlManager) this.controlManager.destroy();
        if (this.renderer) this.renderer.destroy();
        if (this.camera) this.camera.destroy();
        if (this.world) this.world.destroy();
        if (this.timeUI) this.timeUI.destroy();
        if (this.timeControlUI) this.timeControlUI.destroy();
        if (this.agentStatsUI) this.agentStatsUI.destroy();
        if (this.weatherControlUI) this.weatherControlUI.destroy();
        if (this.environmentControlUI) this.environmentControlUI.destroy();
        if (this.fpsControlUI) this.fpsControlUI.destroy();
        if (this.birdCameraUI) this.birdCameraUI.destroy();

        // --- Supprimer les références ---
        this.scene = null;
        this.canvas = null;
        this.sizes = null;
        this.time = null;
        this.camera = null;
        this.renderer = null;
        this.controlManager = null;
        this.raycaster = null;
        this.tooltipElement = null;
        this.buildingTooltipElement = null;
        this.tooltipTargetPosition = null;
        this.buildingTooltipTargetPosition = null;
        this.selectedBuildingInfo = null;
        this.selectedBuildingMesh = null;
        this.selectedAgent = null;

        this.agentStatsUI?.destroy(); this.agentStatsUI = null;
        this.timeUI?.destroy(); this.timeUI = null;
        this.timeControlUI?.destroy(); this.timeControlUI = null;
        this.weatherControlUI?.destroy(); this.weatherControlUI = null;
        this.environmentControlUI?.destroy(); this.environmentControlUI = null;
        this.fpsControlUI?.destroy(); this.fpsControlUI = null;
        this.birdCameraUI?.destroy(); this.birdCameraUI = null;
        this.renderStatsUI?.destroy(); this.renderStatsUI = null;

        if (this.stats?.dom.parentNode) { document.body.removeChild(this.stats.dom); }
        this.stats = null;

        // --- Gestionnaire pour les contrôles de temps globaux ---
        document.removeEventListener('keydown', this._boundHandleTimeControls);

        // Détruire l'interface utilisateur de l'agent
        this.agentUI?.destroy();
        this.agentUI = null;

        // Nettoyer le pool d'objets
        if (this.objectPool) {
            this.objectPool.clear();
            this.objectPool = null;
        }

        // Détruire le scheduler
        if (this.timeScheduler) {
            this.timeScheduler.destroy();
            this.timeScheduler = null;
        }

        instance = null;
        //console.log("Experience détruite.");
    }

    // Propriété pour accéder facilement au gestionnaire de voitures
    get carManager() {
        return this.world?.carManager;
    }

    /**
     * Gère les mouvements de souris pour le système d'oiseaux
     * @param {MouseEvent} event - L'événement de mouvement de souris
     * @private
     */
    _handleMouseMove(event) {
        // Coordonnées normalisées pour le système d'oiseaux
        const x = event.clientX;
        const y = event.clientY;
        
        // Mettre à jour la position du prédateur dans le système d'oiseaux
        if (this.world?.environment?.environmentSystem?.birdSystem) {
            this.world.environment.environmentSystem.birdSystem.updatePredator(x, y);
        }
    }

    // ... (reste des méthodes existantes) ...

    followAgent(agent) {
        if (agent) {
            // Désactiver tous les contrôles avant de suivre un agent
            if (this.controlManager) {
                this.controlManager.setMode('classic');
                this.controlManager.classicControls.disable();
            }
            this.isFollowingAgent = true;
            this.selectedAgent = agent;
            this.camera.followAgent(agent);
        }
    }

    stopFollowingAgent() {
        this.isFollowingAgent = false;
        this.camera.stopFollowing();
        
        // Réactiver les contrôles classiques
        if (this.controlManager && this.controlManager.getActiveMode() === 'classic') {
            this.controlManager.classicControls.enable();
        }
    }

    // Méthode utilitaire pour nettoyer les matériaux
    _disposeMaterial(material) {
        if (material.map) material.map.dispose();
        if (material.lightMap) material.lightMap.dispose();
        if (material.bumpMap) material.bumpMap.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.specularMap) material.specularMap.dispose();
        if (material.envMap) material.envMap.dispose();
        material.dispose();
    }

    _zoomToSelectedBuilding(duration = 1500) {
        if (!this.selectedBuildingInfo || !this.highlightMesh) return;

        const buildingPos = this.highlightMesh.position;
        const buildingHeight = this.highlightMesh.scale.y;
        const cameraDistance = Math.max(10, buildingHeight * 4);
        const cameraHeight = buildingHeight * 1.5;

        const cameraTargetPos = new THREE.Vector3(
            buildingPos.x - cameraDistance * 0.7,
            buildingPos.y + cameraHeight,
            buildingPos.z - cameraDistance * 0.7
        );

        // Laisser la caméra regarder vers le bâtiment
        const targetLookAt = new THREE.Vector3(
            buildingPos.x,
            buildingPos.y + buildingHeight * 0.3,
            buildingPos.z
        );

        // S'assurer que les contrôles sont en mode classique
        if (this.controlManager) {
            this.controlManager.setMode('classic');
        }

        // Si on suivait un agent, arrêter
        if (this.isFollowingAgent) {
            this.stopFollowingAgent();
        }

        // Utiliser la méthode de transition existante
        this.camera.moveToTarget(cameraTargetPos, targetLookAt, duration);
    }

    // --- Gestionnaire pour les contrôles de temps globaux ---
    _handleTimeControls(event) {
        // Empêcher le comportement par défaut pour les touches de contrôle du temps
        if (['KeyE', 'KeyR', 'KeyF', 'KeyH'].includes(event.code)) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Gérer les touches de contrôle du temps
        if (event.code === 'KeyE') {
            this.time.decreaseSpeed();
        } else if (event.code === 'KeyR') {
            this.time.increaseSpeed();
        } else if (event.code === 'KeyF') {
            const wasPaused = this.time.isPaused;
            this.time.togglePause();
            
            // Si le jeu vient d'être repris après une pause, synchroniser les agents
            if (wasPaused && !this.time.isPaused) {
                this._synchronizeAgentsAfterPause();
            }
        } else if (event.code === 'KeyH') {
            // Activer/désactiver les helpers de façade des bâtiments
            if (this.world && this.world.contentGenerator) {
                this.world.contentGenerator.toggleBuildingFacadeHelpers();
                console.log("Affichage des flèches d'orientation des façades de bâtiments basculé");
            }
        }
    }

    /**
     * Synchronise les agents après une pause ou une forte accélération du temps
     * @private
     */
    _synchronizeAgentsAfterPause() {
        if (this.world?.agentManager) {
            console.log("Experience: Synchronisation forcée des agents après reprise...");
            const currentGameTime = this.time.elapsed;
            const currentHour = this.world.environment?.getCurrentHour() || 0;
            const environment = this.world.environment;
            const calendarDate = environment?.getCurrentCalendarDate();
            
            // Si disponible, utiliser la méthode de synchronisation du AgentManager
            if (typeof this.world.agentManager.forceSyncAllAgentsWithGameTime === 'function') {
                this.world.agentManager.forceSyncAllAgentsWithGameTime(currentGameTime, currentHour, calendarDate);
            } else if (typeof this.world.agentManager.checkAgentsEventsAfterTimeAcceleration === 'function') {
                this.world.agentManager.checkAgentsEventsAfterTimeAcceleration(currentGameTime);
            }
            
            // Notifier le scheduler pour qu'il traite immédiatement tous les événements en attente
            if (this.timeScheduler) {
                console.log("Experience: Forçage du traitement des événements planifiés...");
                this.timeScheduler.processPendingEvents(currentGameTime);
            }
        } else {
            console.warn("Experience: Impossible de synchroniser les agents - AgentManager non disponible");
        }
    }

    /**
     * Met à jour l'état d'une UI et sauvegarde la configuration
     * @param {string} uiName - Le nom de l'UI à mettre à jour
     * @param {boolean} isVisible - Le nouvel état de visibilité
     */
    updateUIState(uiName, isVisible) {
        this.uiStates[uiName] = isVisible;
        saveUIStates(this.uiStates);
        
        // Émettre l'événement de changement
        this.dispatchEvent(new CustomEvent(`${uiName}uichanged`, {
            detail: { isVisible }
        }));
    }
    
    /**
     * Teste et compare les performances avec et sans batching agressif
     */
    testBatchingPerformance() {
        console.log('\n=== TEST DE PERFORMANCE DU BATCHING ===');
        
        // Attendre que la scène soit stable
        setTimeout(() => {
            // Mesure 1: Performance actuelle
            this.performanceMonitor.reset();
            let stats1 = null;
            
            // Collecter les stats pendant 3 secondes
            setTimeout(() => {
                stats1 = this.performanceMonitor.getStats();
                this.performanceMonitor.logStats('État actuel');
                
                // Basculer l'optimisation
                const meshManager = this.world?.instancedMeshManager;
                if (meshManager) {
                    const currentState = meshManager.enableBuildingOptimization;
                    console.log(`\nBasculement de l'optimisation: ${currentState} → ${!currentState}`);
                    meshManager.setBuildingOptimization(!currentState);
                    
                    // Recréer la ville pour appliquer les changements
                    console.log('Régénération de la ville...');
                    this.world.regenerateCity();
                    
                    // Attendre que la régénération soit complète
                    setTimeout(() => {
                        // Mesure 2: Nouvelle performance
                        this.performanceMonitor.reset();
                        
                        setTimeout(() => {
                            const stats2 = this.performanceMonitor.getStats();
                            this.performanceMonitor.logStats('Après changement');
                            
                            // Comparer les résultats
                            PerformanceMonitor.compareStats(stats1, stats2, 'Optimisation Batching');
                            
                            console.log('\n=== FIN DU TEST ===\n');
                        }, 3000);
                    }, 2000); // Attendre que la ville soit régénérée
                }
            }, 3000);
        }, 1000); // Attendre que la scène soit stable
    }
}