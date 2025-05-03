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
import * as DebugTools from './World/Rendering/DebugTools.js';

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
        this.originalFog = new THREE.FogExp2(0x1e2a36, 0.0005);
        this.scene.fog = this.originalFog;
        this.camera = new Camera(this);
        this.renderer = new Renderer(this);
        this.world = new World(this);
        this.isDebugMode = false;
        this.timeUI = new TimeUI(this);
        this.timeControlUI = new TimeControlUI(this);
        this.agentStatsUI = new AgentStatsUI(this); // <--- INSTANCIER LA NOUVELLE UI
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

        this.createHighlightMesh(); // Créer le mesh de surbrillance
        console.log("Experience initialisée. Mode debug:", this.isDebugMode);

        // Exposer l'instance pour un accès global
        window.experience = this;

        // Exposer les outils de debug
        window.debugTools = DebugTools;
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
            // Tenter de positionner au point de base, MAIS ne pas forcer l'affichage
            // car les étapes suivantes pourraient le cacher à nouveau.
            // Le display final sera géré à la toute fin.
            tooltipElement.style.left = `${Math.round(baseScreenX)}px`;
            tooltipElement.style.top = `${Math.round(baseScreenY)}px`;
            tooltipElement.style.visibility = 'visible'; // Rendre visible si on quitte ici
            // NE PAS faire display = 'block' ici, car il faut vérifier les autres conditions
            // Si l'élément était caché initialement, il le restera (ce qui est peut-être le problème)
            // --> Correction: On doit le rendre visible si la projection est bonne
            if (projectedPosition.z < 1 && initialDisplay === 'none') {
                // On le rend visible uniquement s'il était caché ET que la projection est valide
                // Mais on le laisse à la position de base car on n'a pas pu le clamper
                tooltipElement.style.display = 'block';
            } else if (projectedPosition.z < 1) {
                // S'il n'était pas caché, on le laisse affiché
                tooltipElement.style.display = 'block';
            }
            return;
        }

        // 5. Calculer la position désirée (au-dessus du point)
        const desiredOffsetX = 15;
        let desiredTopY = baseScreenY - tooltipHeight - 10; // Position 'top' désirée
        let finalScreenX = baseScreenX + desiredOffsetX; // Calcul X

        // 6. Vérifier et contraindre les limites de l'écran
        const margin = 10;

        // Clamp horizontal (inchangé)
        if (finalScreenX + tooltipWidth > this.sizes.width - margin) {
            finalScreenX = this.sizes.width - tooltipWidth - margin;
        } else if (finalScreenX < margin) { // Utiliser else if pour éviter double ajustement
            finalScreenX = margin;
        }

        // Clamp vertical (logique corrigée)
        let finalScreenY = desiredTopY;

        if (finalScreenY < margin) { // Dépasse en haut ?
            finalScreenY = baseScreenY + 20; // Essayer en dessous
        }
        // Vérifier si la position actuelle (au-dessus ou en dessous) dépasse en bas
        if (finalScreenY + tooltipHeight > this.sizes.height - margin) {
            finalScreenY = this.sizes.height - tooltipHeight - margin; // Coller en bas
        }
        // Re-vérifier le haut après avoir potentiellement collé en bas
        if (finalScreenY < margin) {
            finalScreenY = margin; // Coller en haut
        }

        // 7. Appliquer la position finale
        tooltipElement.style.left = `${Math.round(finalScreenX)}px`;
        tooltipElement.style.top = `${Math.round(finalScreenY)}px`;

        // 8. Assurer la visibilité et le bon 'display' FINALEMENT
        tooltipElement.style.visibility = 'visible'; // Rendre visible
        tooltipElement.style.display = 'block'; // Assurer qu'il est affiché
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
            // console.log("Click détecté."); // Décommenter pour debug
            this.mouse.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.mouse.y = -(event.clientY / this.sizes.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera.instance);

            // --- Préparer les objets à intersecter ---
            const objectsToIntersect = [];
            const agentManager = this.world?.agentManager;
            const instancedMeshManager = this.world?.cityManager?.contentGenerator?.instancedMeshManager;
            const carManager = this.world?.carManager; // <<< NOUVEAU

            // Ajouter les agents (torse et tête)
            if (agentManager?.instanceMeshes?.torso) objectsToIntersect.push(agentManager.instanceMeshes.torso);
            if (agentManager?.instanceMeshes?.head) objectsToIntersect.push(agentManager.instanceMeshes.head);

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
                            console.log(`Clic sur voiture (instance ${instanceId}), agent sélectionné: ${agentId}`);
                        } else {
                            console.log(`Clic sur voiture (instance ${instanceId}), mais aucun agent associé trouvé.`);
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
                    console.log(`Bâtiment ${buildingId} trouvé : Mesh ${foundMesh.name}, Instance ${foundInstanceId}`);
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
                // console.log(`Clic sur l'ID résident/employé: ${agentId}`); // Décommenter pour debug
                const agentManager = this.world?.agentManager;
                const agentToSelect = agentManager?.agents.find(a => a.id === agentId);
                if (agentToSelect) {
                    // console.log(`Agent ${agentId} trouvé, sélection en cours...`); // Décommenter pour debug
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
        if (!agent) {
            console.log("Experience: Deselecting agent.");
            this.selectedAgent = null;
            this.camera.stopFollowing(); // Arrête le suivi et réactive OrbitControls
            // Mettre à jour l'UI pour désélectionner
            if (this.ui) {
                this.ui.setSelectedAgentInfo(null);
            } else {
                console.warn("Experience.selectAgent: this.ui is not defined when trying to deselect.");
            }
            return;
        }

        console.log(`Experience: Selecting agent ${agent.id}`);
        this.selectedAgent = agent;
        if (this.ui) {
            this.ui.setSelectedAgentInfo(agent); // Mettre à jour l'UI
        } else {
            console.warn("Experience.selectAgent: this.ui is not defined when trying to select.");
        }

        // --- MODIFIÉ: Handle Agent in Car ---
        let agentPosition, agentOrientation;
        let lookAtHeightOffset = 1.0; // Default for pedestrians
        let followDistance = 8.0; // Default follow distance
        let isDriving = agent.isDriving; // Check if agent is driving
        let car = null; // Garder une référence à la voiture si trouvée

        if (isDriving && this.world.carManager) {
            car = this.world.carManager.getCarByAgentId(agent.id);
            if (car) {
                agentPosition = car.position.clone(); // Use car's position
                agentOrientation = car.orientation.clone(); // Use car's orientation
                lookAtHeightOffset = 1.2; // Légèrement plus bas qu'avant (1.5)
                followDistance = 9.0;    // Légèrement plus proche qu'avant (10.0)
                console.log(`Selecting agent in car ${car.id}. Using car position and orientation.`);
            } else {
                // Fallback if car not found
                console.warn(`Agent ${agent.id} isDriving=true but no car found! Falling back to agent pos/ori.`);
                isDriving = false; // Traiter comme piéton si la voiture est introuvable
                agentPosition = agent.position.clone();
                agentOrientation = agent.orientation ? agent.orientation.clone() : new THREE.Quaternion();
            }
        } else {
            // Standard pedestrian selection
            isDriving = false;
            agentPosition = agent.position.clone();
            agentOrientation = agent.orientation ? agent.orientation.clone() : new THREE.Quaternion();
        }
        // --- FIN MODIFICATION ---

        // Le point que la caméra regarde (centre de l'agent/voiture + offset vertical)
        const lookAtPoint = agentPosition.clone().add(new THREE.Vector3(0, lookAtHeightOffset, 0));

        // Calcul de la position cible de la caméra
        const backward = new THREE.Vector3(0, 0, 1); // Z positif est "derrière" dans le repère local
        backward.applyQuaternion(agentOrientation);
        backward.normalize();

        // Positionner la caméra derrière et légèrement en hauteur
        const cameraOffsetDirection = backward.clone(); // Direction derrière l'agent/voiture
        const verticalOffsetRatio = isDriving ? 0.20 : 0.2; // Ajuster ratio hauteur/distance si besoin (gardons 0.2 pour l'instant)
        cameraOffsetDirection.add(new THREE.Vector3(0, verticalOffsetRatio, 0));
        cameraOffsetDirection.normalize(); // Normaliser la direction finale de l'offset

        const cameraOffset = cameraOffsetDirection.multiplyScalar(followDistance);

        // --- MODIFICATION CLÉ : Calculer depuis agentPosition --- 
        // Calculer la position par rapport à la position DE BASE de l'agent/voiture
        const targetCamPos = agentPosition.clone().add(cameraOffset);
        // --- FIN MODIFICATION CLÉ ---

        // Démarrer l'animation de la caméra
        // Elle visera lookAtPoint depuis targetCamPos
        this.camera.moveToTarget(targetCamPos, lookAtPoint, 1000, agent);

        console.log(`Camera target position: ${targetCamPos.x.toFixed(2)}, ${targetCamPos.y.toFixed(2)}, ${targetCamPos.z.toFixed(2)}`);
        console.log(`Camera lookAt point: ${lookAtPoint.x.toFixed(2)}, ${lookAtPoint.y.toFixed(2)}, ${lookAtPoint.z.toFixed(2)}`);
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
        const currentTarget = this.controls.target; // Ou this.camera.targetLookAtPosition si controls désactivé

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

    // --- MODIFIÉ : Met à jour le contenu HTML du tooltip agent AVEC liens ---
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

        const content = `
            <div class="tooltip-header">
                <span class="agent-id">${agent.id}</span>
                <span class="agent-state">${agent.currentState || 'N/A'}</span>
            </div>
            <div class="tooltip-section">
                <div class="tooltip-row">
                    <span class="tooltip-label">☗</span>
                    <span class="tooltip-value">${homeLink}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">⚒</span>
                    <span class="tooltip-value">${workLink}</span>
                </div>
            </div>
            <div class="tooltip-section">
                <div class="tooltip-row">
                    <span class="tooltip-label" title="Bonheur">☻</span>
                    <span class="tooltip-value">${citizenInfo?.happiness?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label" title="Santé">♥</span>
                    <span class="tooltip-value">${citizenInfo?.health?.toFixed(0) || 'N/A'}/${citizenInfo?.maxHealth?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label" title="Argent">$</span>
                    <span class="tooltip-value">${citizenInfo?.money?.toFixed(0) || 'N/A'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label" title="Salaire moyen">✤</span>
                    <span class="tooltip-value">${citizenInfo?.salary?.toFixed(0) || 'N/A'}</span>
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
                console.log("Building Tooltip: Toggle button clicked!");
                event.stopPropagation();
                // 1. Inverser l'état stocké
                this.isBuildingOccupantListExpanded = !this.isBuildingOccupantListExpanded;
                console.log(`Building Tooltip: Set isBuildingOccupantListExpanded to ${this.isBuildingOccupantListExpanded}`);
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
                    console.log(`Stats Panel: Clic sur l'ID agent: ${agentId}`);
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
            console.log("Debug Mode ENABLED");
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
            console.log("Debug Mode DISABLED");
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
        // --- AJOUT DE LA NOUVELLE LOGIQUE DANS toggleDebugMode AUSSI ---
        this.isDebugMode = !this.isDebugMode;
        console.log(`Debug Mode global ${this.isDebugMode ? 'ENABLED' : 'DISABLED'}`);

        if (this.scene) {
            this.scene.fog = this.isDebugMode ? null : this.originalFog;
        }

        if (this.world) {
            this.world.setDebugMode(this.isDebugMode);
        }

        // --- AJOUT : Réinitialiser la sélection des éléments debug lors de l'activation ---
        if (this.isDebugMode) {
            this.resetDebugLayerVisibility();
        }

        // Forcer l'état des sous-menus basé sur le mode debug
        for (const category in this.debugLayerVisibility) {
            if (this.debugLayerVisibility[category]._showSubMenu !== undefined) {
                // Si on active le debug, on montre tout. Si on désactive, on cache tout.
                this.debugLayerVisibility[category]._showSubMenu = this.isDebugMode;
            }
        }
        // --- FIN AJOUT ---

        this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: this.isDebugMode } }));
    }

    /**
     * NOUVELLE MÉTHODE: Bascule l'état de *tous* les sous-calques d'une catégorie donnée.
     * Si au moins un est actif, tous passent à inactif.
     * Si tous sont inactifs, tous passent à actif.
     * @param {string} categoryName - Nom de la catégorie (ex: 'plot', 'district').
     */
    toggleAllSubLayersInCategory(categoryName) {
        console.log(`[Experience] Entrée dans toggleAllSubLayersInCategory pour ${categoryName}`);
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
        console.log(`[Experience] Pour ${categoryName}, targetState déterminé : ${targetState}`);

        category._visible = targetState;
        console.log(`[Experience] Pour ${categoryName}, category._visible mis à : ${category._visible}`);

        let changesMade = false;
        subLayerKeys.forEach(subTypeName => {
            if (category[subTypeName] !== targetState) {
                category[subTypeName] = targetState;
                if (this.isDebugMode && this.world) {
                    if (category._visible) {
                        console.log(`[Experience] Appel setSubLayerMeshVisibility(${categoryName}, ${subTypeName}, ${targetState})`);
                        this.world.setSubLayerMeshVisibility(categoryName, subTypeName, targetState);
                    }
                }
                changesMade = true;
            }
        });

        if (this.isDebugMode && this.world) {
            console.log(`[Experience] Appel setGroupVisibility(${categoryName}, ${category._visible})`);
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

    /**
     * Bascule la visibilité globale d'une catégorie de debug. (Utilisé pour les catégories SANS enfants)
     * @param {string} categoryName - Nom de la catégorie ('district', 'plot', 'buildingOutline', 'navGrid', 'agentPath').
     */
    toggleCategoryVisibility(categoryName) {
        if (!this.debugLayerVisibility.hasOwnProperty(categoryName)) {
            console.warn(`Experience.toggleCategoryVisibility: Unknown category name '${categoryName}'`);
            return;
        }

        const category = this.debugLayerVisibility[categoryName];
        const currentVisibility = category._visible;
        const newVisibility = !currentVisibility;
        category._visible = newVisibility;

        console.log(`Debug Category '${categoryName}' visibility toggled to: ${newVisibility}`);

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

        console.log(`  Debug Sub-Layer '${categoryName}.${subTypeName}' visibility toggled to: ${newVisibility}`);

        let parentVisibilityChanged = false;
        let applyIndividualChildVisibility = true; // Flag pour savoir si on doit mettre à jour l'enfant seul

        // --- 1. Faut-il activer le parent ? ---
        if (newVisibility && !category._visible) {
            console.log(`   Parent category '${categoryName}' was hidden, activating it.`);
            category._visible = true;
            parentVisibilityChanged = true;
            applyIndividualChildVisibility = false; // La synchro globale s'en chargera
            if (this.isDebugMode && this.world) {
                this.world.setGroupVisibility(categoryName, true);
                const subLayerKeys = Object.keys(category).filter(key => !key.startsWith('_'));
                subLayerKeys.forEach(key => {
                    console.log(`[Experience] Syncing child mesh visibility: ${categoryName}.${key} = ${category[key]}`);
                    this.world.setSubLayerMeshVisibility(categoryName, key, category[key]);
                });
            }
        }
        // --- 2. Faut-il désactiver le parent ? ---
        else if (!newVisibility && category._visible) {
            const subLayerKeys = Object.keys(category).filter(key => !key.startsWith('_'));
            const allChildrenInactive = subLayerKeys.every(key => !category[key]);
            if (allChildrenInactive) {
                console.log(`   Last active child of '${categoryName}' deactivated, hiding parent.`);
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
            console.log(`[Experience] Applying individual child visibility: ${categoryName}.${subTypeName} = ${newVisibility}`);
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
        console.log(`  Debug Layer '${layerName}' visibility toggled to: ${this.debugLayerVisibility[layerName]}`);

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
        this.stats.begin();
        const deltaTime = this.time.delta; // Delta temps JEU (scaled) en ms
        const currentGameTime = this.time.elapsed; // Temps JEU total (scaled) en ms
        const currentHour = this.world?.environment?.getCurrentHour() ?? 12; // Heure JEU actuelle

        // --- ORDRE MODIFIÉ ---

        // --- 1. Mettre à jour le Monde (MAINTENANT EN PREMIER) ---
        if (this.world) {
            // Appel unique à la méthode update du monde (met à jour les voitures, etc.)
            this.world.update();
        }

        // --- 2. Mettre à jour la logique de Contrôles/Caméra (MAINTENANT APRES LE MONDE) ---
        if (!this.isFollowingAgent && this.controls?.enabled) {
            this.controls.update(); // Pour les contrôles Orbit standard
        }
        // La caméra gère son propre update pour le suivi ou moveToTarget.
        // Elle lira maintenant la position mise à jour par world.update()
        if (this.camera) this.camera.update(deltaTime);

        // --- FIN ORDRE MODIFIÉ ---

        // --- 3. Mettre à jour les UI ---
        if (this.timeUI) this.timeUI.update(); // Utilise environment.cycleTime qui est MAJ par env.update()
        // AgentStatsUI est mis à jour par son propre intervalle

        // --- 4. Tooltips : rafraîchir CONTENU + position tant que la bulle reste ouverte ---
        if (this.selectedAgent && this.tooltipElement && !this.selectedBuildingInfo) {
            // 4a. mettre à jour le HTML de la bulle
            this.updateTooltipContent(this.selectedAgent);
            // 4b. positionner la bulle
            this.tooltipTargetPosition
                .copy(this.selectedAgent.position)
                .add(new THREE.Vector3(0, this.selectedAgent.scale * 8, 0));
            this._updateTooltipPosition(this.tooltipElement, this.tooltipTargetPosition);
        } else if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
            // plus d'agent sélectionné → masquer la bulle
            this.tooltipElement.style.display = 'none';
        }

        if (this.selectedBuildingInfo && this.buildingTooltipElement && this.highlightMesh?.visible) {
            // 4c. mettre à jour le HTML de la bulle bâtiment
            this.updateBuildingTooltipContent();
            // 4d. positionner la bulle bâtiment
            this.buildingTooltipTargetPosition
                .copy(this.highlightMesh.position)
                .add(new THREE.Vector3(0, this.highlightMesh.scale.y / 2 + 2, 0));
            this._updateTooltipPosition(this.buildingTooltipElement, this.buildingTooltipTargetPosition);
        } else if (this.buildingTooltipElement && this.buildingTooltipElement.style.display !== 'none') {
            this.buildingTooltipElement.style.display = 'none';
        }

        // --- 5. Rendu ---
        if (this.renderer) this.renderer.update();

        this.stats.end();
    }

    // Nettoie les ressources et écouteurs lors de la destruction
    destroy() {
        console.log("Destroying Experience...");

        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);
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

        // ... (reste du code destroy existant) ...
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
        this.tooltipElement = null;
        this.tooltipTargetPosition = null;
        this.selectedAgent = null;

        this.agentStatsUI?.destroy(); this.agentStatsUI = null;
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

    // Propriété pour accéder facilement au gestionnaire de voitures
    get carManager() {
        return this.world?.carManager;
    }
}