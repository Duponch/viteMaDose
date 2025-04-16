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

		// --- État de Visibilité des Calques Debug ---
        this.debugLayerVisibility = {
            districtGround: true,
            plotGround: true,
            buildingOutline: true,
            navGrid: false, // Caché par défaut ?
            agentPath: false // Caché par défaut ?
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

        this.createHighlightMesh(); // Créer le mesh de surbrillance
        console.log("Experience initialisée. Mode debug:", this.isDebugMode);
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
        tooltipElement.style.display = 'block';     // Forcer l'affichage pour la mesure

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
        tooltipElement.style.display = 'block';      // Assurer qu'il est affiché
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
        if (!agent) return;
        if (this.selectedAgent === agent) return; // Déjà sélectionné

        this.deselectBuilding(); // Désélectionner bâtiment avant

        const agentIsInside = agent.currentState === 'AT_HOME' || agent.currentState === 'AT_WORK';
        const citizenManager = this.world?.cityManager?.citizenManager;

        if (agentIsInside && citizenManager) {
            // --- CAS: AGENT À L'INTÉRIEUR (Logique existante inchangée) ---
            const buildingId = agent.currentState === 'AT_HOME' ? agent.homeBuildingId : agent.workBuildingId;
            const buildingInfo = citizenManager.getBuildingInfo(buildingId);

            if (buildingInfo) {
                 console.log(`Agent ${agent.id} is inside ${buildingInfo.type} ${buildingId}. Moving camera above building.`);
                 this.selectedAgent = agent; // Sélectionner l'agent logiquement
                 this.isFollowingAgent = false; // NE PAS activer le suivi caméra
                 this.controls.enabled = true; // Garder OrbitControls activé

                 const buildingPos = buildingInfo.position;
                 const camTargetPos = new THREE.Vector3(buildingPos.x, buildingPos.y + 60, buildingPos.z + 40);
                 const camLookAt = buildingPos.clone();

                 // Utiliser moveToTarget pour aller au-dessus du bâtiment (pas de suivi ensuite)
                 this.camera.moveToTarget(camTargetPos, camLookAt, 1200, null); // Dernier argument null: pas d'agent à suivre après

                 if (this.tooltipElement) {
                    this.updateTooltipContent(agent);
                 }

            } else {
                 // Fallback: Bâtiment non trouvé, suivre l'agent (comportement existant)
                 console.warn(`Could not find building info for ${buildingId}. Falling back to agent follow.`);
                 this.selectedAgent = agent;
                 // --- !! MODIFICATION ICI (Moins probable mais pour être complet) !! ---
                 // Transition douce MÊME SI on ne trouve pas le bâtiment ?
                 // Ou garder le comportement actuel de suivi immédiat ?
                 // Pour l'instant, on garde le suivi immédiat comme fallback:
                 // this.isFollowingAgent = true;
                 // this.controls.enabled = false;
                 // this.camera.followAgent(agent); // Suivi immédiat
                 // --- Alternative: Transition douce vers l'agent caché ---
                 const agentPos = agent.position.clone();
                 const camTargetPos = agentPos.clone().add(new THREE.Vector3(0, 15, 10)); // Vue générique proche
                 this.camera.moveToTarget(camTargetPos, agentPos, 1000, agent); // Suivre l'agent après
                 // --- Fin Alternative ---

                 if (this.tooltipElement) {
                     this.updateTooltipContent(agent);
                 }
            }

        } else {
            // --- CAS: AGENT À L'EXTÉRIEUR (Nouvelle logique de transition) ---
            console.log(`Agent ${agent.id} is outside. Starting smooth transition to follow.`);
            this.selectedAgent = agent;
            this.isFollowingAgent = false; // On ne suit PAS ENCORE
            this.controls.enabled = false; // Désactiver OrbitControls PENDANT la transition

            // 1. Calculer la position cible de la caméra DERRIÈRE l'agent
            const followDistance = this.camera.followDistance || 8; // Récupérer depuis Camera.js
            const followHeight = 3.0; // Hauteur souhaitée de la caméra par rapport à l'agent
            const lookAtOffset = 1.0; // Regarder légèrement au-dessus des pieds

            const agentPos = agent.position.clone();
            const agentOrientation = agent.orientation.clone();

            // Vecteur "arrière" relatif à l'orientation de l'agent
            const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(agentOrientation);
            // Vecteur "haut"
            const up = new THREE.Vector3(0, 1, 0);

            // Position finale souhaitée de la caméra pour le début du suivi
            const targetCamPos = agentPos.clone()
                                      .addScaledVector(backward, followDistance) // Reculer
                                      .addScaledVector(up, followHeight);          // Monter

            // Point que la caméra doit regarder (centre de l'agent, un peu en hauteur)
            const targetLookAt = agentPos.clone().addScaledVector(up, lookAtOffset);

            // 2. Lancer l'animation de la caméra vers cette position, en indiquant l'agent à suivre APRÈS
            const transitionDuration = 800; // Durée de la transition en ms (ajuster si besoin)
            this.camera.moveToTarget(targetCamPos, targetLookAt, transitionDuration, agent); // Passer l'agent !

            // 3. Mettre à jour le tooltip
            if (this.tooltipElement) {
                this.updateTooltipContent(agent);
                // La position du tooltip sera mise à jour dans la boucle update()
            }
        }

        // Cacher l'infobulle bâtiment (inchangé)
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.style.display = 'none';
        }
    }

    // Désélectionne l'agent et désactive le suivi
    deselectAgent() {
        if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
            this.tooltipElement.style.display = 'none';
        }
        if (!this.selectedAgent) return; // Si aucun agent n'était sélectionné, ne rien faire

        const agentBeingDeselected = this.selectedAgent; // Garder une référence
        this.selectedAgent = null;
        this.isFollowingAgent = false; // Arrêter le suivi logique

        // Appeler stopFollowing sur la caméra pour arrêter toute animation ou suivi
        // et réactiver les contrôles Orbit si nécessaire.
        if (this.camera) {
            this.camera.stopFollowing();
        }

        // Optionnel : Forcer la réactivation des contrôles au cas où stopFollowing ne le ferait pas
         if (this.controls && !this.controls.enabled) {
            console.log("DeselectAgent: Forcing OrbitControls enabled.");
             this.controls.enabled = true;
             // Peut-être copier la cible de la caméra actuelle pour une transition douce des contrôles
             // this.controls.target.copy(this.camera.instance.position).add(this.camera.instance.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
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
        // Définir une hauteur et un décalage Z pour la caméra
        // Ajustez ces valeurs pour obtenir le cadrage souhaité
        const cameraHeightAboveBuilding = 150 + (buildingInfo.type === 'skyscraper' ? 50 : 0); // Plus haut pour gratte-ciels
        const cameraZOffset = 200 + (buildingInfo.type === 'skyscraper' ? 25 : 0);
        const cameraTargetPos = new THREE.Vector3(buildingPos.x, buildingPos.y + cameraHeightAboveBuilding, buildingPos.z + cameraZOffset);
        const cameraLookAt = buildingPos.clone(); // Regarder le bâtiment

        this.camera.moveToTarget(cameraTargetPos, cameraLookAt, 1000); // Animation de 1s
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
                        listLabel = "Habitants ";
                    } else if (building.isWorkplace && agent.workBuildingId === building.id) {
                        occupantsList.push(occupantId);
                        listLabel = "Employés ";
                    }
                }
            });
        }

        // Génère le HTML pour la liste (cliquable)
        let occupantsListHTML = 'None';
        if (occupantsList.length > 0) {
            occupantsListHTML = occupantsList.map(id =>
                `<span class="resident-id-link" data-agent-id="${id}">${id}</span>` // Garde la classe pour la fonctionnalité de clic
            ).join(' | ');
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
        this.isDebugMode = !this.isDebugMode;
        console.log(`Debug Mode global ${this.isDebugMode ? 'ENABLED' : 'DISABLED'}`);

        // Gérer le brouillard
        if (this.scene) {
            this.scene.fog = this.isDebugMode ? null : this.originalFog;
        }

        // Demander au World de créer/nettoyer les visuels et appliquer les visibilités
        if (this.world) {
            this.world.setDebugMode(this.isDebugMode);
        }

        // Notifier l'UI du changement d'état global
        this.dispatchEvent(new CustomEvent('debugmodechanged', { detail: { isEnabled: this.isDebugMode } }));
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
        if (this.selectedAgent && this.tooltipElement && !this.selectedBuildingInfo) {
            this.updateTooltipContent(this.selectedAgent); // Met à jour le contenu

            // Calcule la position 3D cible pour le tooltip agent
            this.tooltipTargetPosition.copy(this.selectedAgent.position);
            const headHeightOffset = 8.0 * this.selectedAgent.scale; // Approx. hauteur tête
            this.tooltipTargetPosition.y += this.selectedAgent.yOffset + headHeightOffset;
            // Appelle la nouvelle fonction pour positionner l'infobulle
            this._updateTooltipPosition(this.tooltipElement, this.tooltipTargetPosition);

        } else { // Cache si aucun agent sélectionné ou si bâtiment sélectionné
            if (this.tooltipElement && this.tooltipElement.style.display !== 'none') { this.tooltipElement.style.display = 'none'; }
        }

        // --- Mise à jour Tooltip Bâtiment ---
        if (this.selectedBuildingInfo && this.buildingTooltipElement) {
            this.updateBuildingTooltipContent(); // Met à jour le contenu

            // Recalcule la position 3D cible (sommet haut-droite du highlight)
            if (this.highlightMesh && this.highlightMesh.visible) {
                // Utiliser la position et la géométrie du highlight pour une position plus stable
                 const highlightWorldPosition = new Vector3();
                 this.highlightMesh.getWorldPosition(highlightWorldPosition); // Centre du highlight
                 const highlightHeight = this.highlightMesh.scale.y; // Hauteur du highlight

                 // Cible légèrement au-dessus du centre du highlight
                 this.buildingTooltipTargetPosition.copy(highlightWorldPosition);
                 this.buildingTooltipTargetPosition.y += highlightHeight * 0.5 + 0.5; // +0.5 pour un petit espace

                // Appelle la nouvelle fonction pour positionner l'infobulle
                this._updateTooltipPosition(this.buildingTooltipElement, this.buildingTooltipTargetPosition);

            } else { // Cache si highlight invalide
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

        // Retirer TOUS les écouteurs
        this.sizes.removeEventListener('resize', this.resizeHandler);
        this.time.removeEventListener('tick', this.updateHandler);
        this.canvas.removeEventListener('mousedown', this._boundHandleMouseDown);
        this.canvas.removeEventListener('mouseup', this._boundHandleMouseUp);
        if (this.buildingTooltipElement) {
            this.buildingTooltipElement.removeEventListener('click', this._boundHandleBuildingTooltipClick);
        }
        if (this.tooltipElement) {
            this.tooltipElement.removeEventListener('click', this._boundHandleAgentTooltipClick);
        }

        // ... (reste du code destroy existant) ...
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