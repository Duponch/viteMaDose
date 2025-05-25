import * as THREE from 'three';

export default class RenderStatsUI {
    constructor(experience) {
        this.experience = experience;
        this.renderer = this.experience.renderer.instance;
        this.scene = this.experience.scene;
        
        this.isVisible = true;
        this.updateInterval = 100; // Mise à jour toutes les 100ms
        this.lastUpdateTime = 0;
        this.isStatsEnabled = false; // Stats désactivées par défaut pour les performances
        
        this.createUI();
        this.bindEvents();
        this.setupRenderHook();
        
        // Démarrer les mises à jour
        this.startUpdating();
    }

    createUI() {
        // Créer le conteneur principal
        this.container = document.createElement('div');
        this.container.id = 'render-stats-ui';
        this.container.className = 'render-stats-container';
        this.container.innerHTML = `
            <div class="render-stats-header">
                <h3>Statistiques de Rendu</h3>
                <div class="render-stats-controls">
                    <button class="render-stats-enable" title="Activer/Désactiver les statistiques">OFF</button>
                    <button class="render-stats-toggle" title="Masquer/Afficher">−</button>
                </div>
            </div>
            <div class="render-stats-content">
                <div class="render-stats-item">
                    <span class="render-stats-label">Draw Calls:</span>
                    <span class="render-stats-value" id="draw-calls">0</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Triangles:</span>
                    <span class="render-stats-value" id="triangles">0</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Géométries:</span>
                    <span class="render-stats-value" id="geometries">0</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Textures:</span>
                    <span class="render-stats-value" id="textures">0</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Mémoire:</span>
                    <span class="render-stats-value" id="memory">0 MB</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Instances:</span>
                    <span class="render-stats-value" id="instances">0</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Matériaux:</span>
                    <span class="render-stats-value" id="materials">0</span>
                </div>
                <div class="render-stats-item">
                    <span class="render-stats-label">Meshes Visibles:</span>
                    <span class="render-stats-value" id="visible-meshes">0</span>
                </div>
            </div>
            <div class="render-stats-details">
                <div class="render-stats-section-header">
                    <span>Statistiques par Catégorie</span>
                    <button class="render-stats-details-toggle" title="Masquer/Afficher les détails">▼</button>
                </div>
                <div class="render-stats-categories-content">
                <div class="render-stats-category-detailed">
                    <div class="render-stats-category-header">🏢 Bâtiments</div>
                    <div class="render-stats-category-stats">
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Draw Calls:</span>
                            <span class="render-stats-mini-value" id="buildings-draw-calls">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Triangles:</span>
                            <span class="render-stats-mini-value" id="buildings-triangles">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Instances:</span>
                            <span class="render-stats-mini-value" id="buildings-instances">0</span>
                        </div>
                    </div>
                </div>
                <div class="render-stats-category-detailed">
                    <div class="render-stats-category-header">🌳 Arbres</div>
                    <div class="render-stats-category-stats">
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Draw Calls:</span>
                            <span class="render-stats-mini-value" id="trees-draw-calls">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Triangles:</span>
                            <span class="render-stats-mini-value" id="trees-triangles">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Instances:</span>
                            <span class="render-stats-mini-value" id="trees-instances">0</span>
                        </div>
                    </div>
                </div>
                <div class="render-stats-category-detailed">
                    <div class="render-stats-category-header">🏙️ Éléments de ville</div>
                    <div class="render-stats-category-stats">
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Draw Calls:</span>
                            <span class="render-stats-mini-value" id="city-elements-draw-calls">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Triangles:</span>
                            <span class="render-stats-mini-value" id="city-elements-triangles">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Instances:</span>
                            <span class="render-stats-mini-value" id="city-elements-instances">0</span>
                        </div>
                    </div>
                </div>
                <div class="render-stats-category-detailed">
                    <div class="render-stats-category-header">🌍 Environnement</div>
                    <div class="render-stats-category-stats">
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Draw Calls:</span>
                            <span class="render-stats-mini-value" id="environment-draw-calls">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Triangles:</span>
                            <span class="render-stats-mini-value" id="environment-triangles">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Instances:</span>
                            <span class="render-stats-mini-value" id="environment-instances">0</span>
                        </div>
                    </div>
                </div>
                <div class="render-stats-category-detailed">
                    <div class="render-stats-category-header">👥 Agents</div>
                    <div class="render-stats-category-stats">
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Draw Calls:</span>
                            <span class="render-stats-mini-value" id="agents-draw-calls">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Triangles:</span>
                            <span class="render-stats-mini-value" id="agents-triangles">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Instances:</span>
                            <span class="render-stats-mini-value" id="agents-instances">0</span>
                        </div>
                    </div>
                </div>
                <div class="render-stats-category-detailed">
                    <div class="render-stats-category-header">🚗 Véhicules</div>
                    <div class="render-stats-category-stats">
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Draw Calls:</span>
                            <span class="render-stats-mini-value" id="vehicles-draw-calls">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Triangles:</span>
                            <span class="render-stats-mini-value" id="vehicles-triangles">0</span>
                        </div>
                        <div class="render-stats-mini-item">
                            <span class="render-stats-mini-label">Instances:</span>
                            <span class="render-stats-mini-value" id="vehicles-instances">0</span>
                        </div>
                    </div>
                </div>

                </div>
            </div>
        `;

        // Ajouter les styles CSS
        this.addStyles();
        
        // Ajouter à la page
        document.body.appendChild(this.container);
        
        // Références aux éléments
        this.elements = {
            enableButton: this.container.querySelector('.render-stats-enable'),
            toggleButton: this.container.querySelector('.render-stats-toggle'),
            content: this.container.querySelector('.render-stats-content'),
            detailsToggleButton: this.container.querySelector('.render-stats-details-toggle'),
            categoriesContent: this.container.querySelector('.render-stats-categories-content'),
            drawCalls: document.getElementById('draw-calls'),
            triangles: document.getElementById('triangles'),
            geometries: document.getElementById('geometries'),
            textures: document.getElementById('textures'),
            memory: document.getElementById('memory'),
            instances: document.getElementById('instances'),
            materials: document.getElementById('materials'),
            visibleMeshes: document.getElementById('visible-meshes'),
            // Statistiques détaillées par catégorie
            buildingsDrawCalls: document.getElementById('buildings-draw-calls'),
            buildingsTriangles: document.getElementById('buildings-triangles'),
            buildingsInstances: document.getElementById('buildings-instances'),
            treesDrawCalls: document.getElementById('trees-draw-calls'),
            treesTriangles: document.getElementById('trees-triangles'),
            treesInstances: document.getElementById('trees-instances'),
            cityElementsDrawCalls: document.getElementById('city-elements-draw-calls'),
            cityElementsTriangles: document.getElementById('city-elements-triangles'),
            cityElementsInstances: document.getElementById('city-elements-instances'),
            environmentDrawCalls: document.getElementById('environment-draw-calls'),
            environmentTriangles: document.getElementById('environment-triangles'),
            environmentInstances: document.getElementById('environment-instances'),
            agentsDrawCalls: document.getElementById('agents-draw-calls'),
            agentsTriangles: document.getElementById('agents-triangles'),
            agentsInstances: document.getElementById('agents-instances'),
            vehiclesDrawCalls: document.getElementById('vehicles-draw-calls'),
            vehiclesTriangles: document.getElementById('vehicles-triangles'),
            vehiclesInstances: document.getElementById('vehicles-instances')
        };
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .render-stats-container {
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                min-width: 200px;
                z-index: 1000;
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(5px);
            }

            .render-stats-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                padding-bottom: 5px;
            }

            .render-stats-header h3 {
                margin: 0;
                font-size: 14px;
                color: #00ff88;
            }

            .render-stats-controls {
                display: flex;
                gap: 5px;
                align-items: center;
            }

            .render-stats-enable {
                background: none;
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                font-family: 'Courier New', monospace;
                min-width: 30px;
            }

            .render-stats-enable:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .render-stats-enable.enabled {
                background: rgba(0, 255, 136, 0.2);
                border-color: #00ff88;
                color: #00ff88;
            }

            .render-stats-toggle {
                background: none;
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                width: 20px;
                height: 20px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .render-stats-toggle:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .render-stats-content {
                transition: all 0.3s ease;
            }

            .render-stats-content.hidden {
                display: none;
            }

            .render-stats-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 4px;
                padding: 2px 0;
            }

            .render-stats-label {
                color: #cccccc;
            }

            .render-stats-value {
                color: #00ff88;
                font-weight: bold;
                text-align: right;
                min-width: 60px;
            }

            .render-stats-item:nth-child(odd) {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 3px;
                padding: 2px 4px;
            }

            .render-stats-details {
                margin-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.2);
                padding-top: 8px;
            }

            .render-stats-section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: #00ff88;
                font-weight: bold;
                font-size: 11px;
                margin-bottom: 6px;
            }

            .render-stats-details-toggle {
                background: none;
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                width: 16px;
                height: 16px;
                border-radius: 2px;
                cursor: pointer;
                font-size: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .render-stats-details-toggle:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .render-stats-categories-content {
                transition: all 0.3s ease;
            }

            .render-stats-categories-content.hidden {
                display: none;
            }

            .render-stats-category {
                display: flex;
                justify-content: space-between;
                margin-bottom: 3px;
                padding: 1px 2px;
                font-size: 10px;
            }

            .render-stats-category:nth-child(even) {
                background: rgba(255, 255, 255, 0.03);
                border-radius: 2px;
            }

            .render-stats-category-label {
                color: #cccccc;
                font-size: 10px;
            }

            .render-stats-category-value {
                color: #00ff88;
                font-weight: bold;
                text-align: right;
                font-size: 10px;
            }

            .render-stats-category-detailed {
                margin-bottom: 8px;
                padding: 6px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 4px;
                border-left: 3px solid #00ff88;
            }

            .render-stats-category-header {
                color: #00ff88;
                font-weight: bold;
                font-size: 11px;
                margin-bottom: 4px;
            }

            .render-stats-category-stats {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 4px;
            }

            .render-stats-mini-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 2px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 2px;
            }

            .render-stats-mini-label {
                color: #cccccc;
                font-size: 8px;
                margin-bottom: 1px;
            }

            .render-stats-mini-value {
                color: #00ff88;
                font-weight: bold;
                font-size: 9px;
            }
        `;
        document.head.appendChild(style);
    }

    bindEvents() {
        // Enable/Disable stats
        this.elements.enableButton.addEventListener('click', () => {
            this.toggleStats();
        });

        // Toggle visibility
        this.elements.toggleButton.addEventListener('click', () => {
            this.toggleContent();
        });

        // Toggle details visibility
        this.elements.detailsToggleButton.addEventListener('click', () => {
            this.toggleDetails();
        });

        // Keyboard shortcut (Ctrl+R pour toggle)
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'r') {
                event.preventDefault();
                this.toggle();
            }
        });
    }

    toggleContent() {
        const isContentVisible = !this.elements.content.classList.contains('hidden');
        
        if (isContentVisible) {
            this.elements.content.classList.add('hidden');
            this.elements.toggleButton.textContent = '+';
        } else {
            this.elements.content.classList.remove('hidden');
            this.elements.toggleButton.textContent = '−';
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        this.container.style.display = 'block';
        this.isVisible = true;
    }

    hide() {
        this.container.style.display = 'none';
        this.isVisible = false;
    }

    startUpdating() {
        const update = () => {
            const now = Date.now();
            if (now - this.lastUpdateTime >= this.updateInterval) {
                this.updateStats();
                this.lastUpdateTime = now;
            }
            requestAnimationFrame(update);
        };
        update();
    }

    updateStats() {
        if (!this.isVisible || this.elements.content.classList.contains('hidden')) {
            return;
        }

        const info = this.renderer.info;
        const memory = this.renderer.info.memory;
        
        // Calculer les statistiques
        const stats = this.calculateStats();
        
        // Utiliser les statistiques du rendu principal si disponibles et activées
        const mainStats = this.isStatsEnabled ? this.experience.renderer.mainRenderStats : null;
        const drawCalls = mainStats ? mainStats.calls : (this.isStatsEnabled ? info.render.calls : 'N/A');
        const triangles = mainStats ? mainStats.triangles : (this.isStatsEnabled ? info.render.triangles : 'N/A');
        
        // Mettre à jour l'affichage
        this.elements.drawCalls.textContent = typeof drawCalls === 'number' ? drawCalls.toLocaleString() : drawCalls;
        this.elements.triangles.textContent = typeof triangles === 'number' ? triangles.toLocaleString() : triangles;
        this.elements.geometries.textContent = memory.geometries.toLocaleString();
        this.elements.textures.textContent = memory.textures.toLocaleString();
        this.elements.memory.textContent = `${stats.memoryMB} MB`;
        this.elements.instances.textContent = stats.instances.toLocaleString();
        this.elements.materials.textContent = stats.materials.toLocaleString();
        this.elements.visibleMeshes.textContent = stats.visibleMeshes.toLocaleString();
        
        // Mettre à jour les statistiques détaillées par catégorie
        // Utiliser les statistiques du renderer si disponibles et activées, sinon utiliser les calculées
        const categoryStats = this.isStatsEnabled && this.experience.renderer.categoryStats ? 
                             this.experience.renderer.categoryStats : stats.categories;
        
        this.elements.buildingsDrawCalls.textContent = this.isStatsEnabled ? 
            categoryStats.buildings.drawCalls.toLocaleString() : 'N/A';
        this.elements.buildingsTriangles.textContent = this.isStatsEnabled ? 
            categoryStats.buildings.triangles.toLocaleString() : 'N/A';
        this.elements.buildingsInstances.textContent = stats.categories.buildings.instances.toLocaleString();
        
        this.elements.treesDrawCalls.textContent = this.isStatsEnabled ? 
            categoryStats.trees.drawCalls.toLocaleString() : 'N/A';
        this.elements.treesTriangles.textContent = this.isStatsEnabled ? 
            categoryStats.trees.triangles.toLocaleString() : 'N/A';
        this.elements.treesInstances.textContent = stats.categories.trees.instances.toLocaleString();
        
        this.elements.cityElementsDrawCalls.textContent = this.isStatsEnabled ? 
            categoryStats.cityElements.drawCalls.toLocaleString() : 'N/A';
        this.elements.cityElementsTriangles.textContent = this.isStatsEnabled ? 
            categoryStats.cityElements.triangles.toLocaleString() : 'N/A';
        this.elements.cityElementsInstances.textContent = stats.categories.cityElements.instances.toLocaleString();
        
        this.elements.environmentDrawCalls.textContent = this.isStatsEnabled ? 
            categoryStats.environment.drawCalls.toLocaleString() : 'N/A';
        this.elements.environmentTriangles.textContent = this.isStatsEnabled ? 
            categoryStats.environment.triangles.toLocaleString() : 'N/A';
        this.elements.environmentInstances.textContent = stats.categories.environment.instances.toLocaleString();
        
        this.elements.agentsDrawCalls.textContent = this.isStatsEnabled ? 
            categoryStats.agents.drawCalls.toLocaleString() : 'N/A';
        this.elements.agentsTriangles.textContent = this.isStatsEnabled ? 
            categoryStats.agents.triangles.toLocaleString() : 'N/A';
        this.elements.agentsInstances.textContent = stats.categories.agents.instances.toLocaleString();
        
        this.elements.vehiclesDrawCalls.textContent = this.isStatsEnabled ? 
            categoryStats.vehicles.drawCalls.toLocaleString() : 'N/A';
        this.elements.vehiclesTriangles.textContent = this.isStatsEnabled ? 
            categoryStats.vehicles.triangles.toLocaleString() : 'N/A';
        this.elements.vehiclesInstances.textContent = stats.categories.vehicles.instances.toLocaleString();
    }

    calculateStats() {
        let instances = 0;
        let materials = 0;
        let memoryBytes = 0;
        let visibleMeshes = 0;

        // Initialiser les catégories (seulement meshes et instances, les draw calls et triangles viennent du renderer)
        const categories = {
            buildings: { meshes: 0, instances: 0 },
            trees: { meshes: 0, instances: 0 },
            cityElements: { meshes: 0, instances: 0 },
            environment: { meshes: 0, instances: 0 },
            agents: { meshes: 0, instances: 0 },
            vehicles: { meshes: 0, instances: 0 }
        };

        // Analyser les instances depuis InstancedMeshManager
        const instancedMeshManager = this.experience.world?.cityManager?.contentGenerator?.instancedMeshManager;
        if (instancedMeshManager?.instancedMeshes) {
            Object.entries(instancedMeshManager.instancedMeshes).forEach(([key, mesh]) => {
                if (mesh instanceof THREE.InstancedMesh) {
                    instances += mesh.count;
                    
                    // Catégoriser selon le nom de la clé
                    if (key.startsWith('house_') || key.startsWith('building_') || 
                        key.startsWith('skyscraper_') || key.startsWith('industrial_') || 
                        key.startsWith('commercial_') || key.startsWith('movietheater_')) {
                        categories.buildings.meshes++;
                        categories.buildings.instances += mesh.count;
                    } else if (key.startsWith('tree_')) {
                        categories.trees.meshes++;
                        categories.trees.instances += mesh.count;
                    } else if (key.startsWith('crosswalk_') || key.startsWith('lamppost_') || 
                               key.startsWith('sidewalk_') || key.startsWith('road_') || 
                               key.startsWith('park_') || key.includes('ground') || 
                               key.includes('grass')) {
                        categories.cityElements.meshes++;
                        categories.cityElements.instances += mesh.count;
                    } else {
                        // Autres éléments non catégorisés -> environnement
                        categories.environment.meshes++;
                        categories.environment.instances += mesh.count;
                    }
                }
            });
        }

        // Analyser les instances d'agents
        const agentManager = this.experience.world?.agentManager;
        if (agentManager?.instanceMeshes) {
            // Agents haute qualité
            if (agentManager.instanceMeshes.highDetail) {
                Object.values(agentManager.instanceMeshes.highDetail).forEach(mesh => {
                    if (mesh instanceof THREE.InstancedMesh) {
                        instances += mesh.count;
                        categories.agents.meshes++;
                        categories.agents.instances += mesh.count;
                    }
                });
            }
            // Agents basse qualité
            if (agentManager.instanceMeshes.lowDetail) {
                Object.values(agentManager.instanceMeshes.lowDetail).forEach(mesh => {
                    if (mesh instanceof THREE.InstancedMesh) {
                        instances += mesh.count;
                        categories.agents.meshes++;
                        categories.agents.instances += mesh.count;
                    }
                });
            }
        }

        // Analyser les instances de voitures
        const carManager = this.experience.world?.carManager;
        if (carManager?.instancedMeshes) {
            Object.values(carManager.instancedMeshes).forEach(mesh => {
                if (mesh instanceof THREE.InstancedMesh) {
                    instances += mesh.count;
                    categories.vehicles.meshes++;
                    categories.vehicles.instances += mesh.count;
                }
            });
        }

        // Analyser les éléments d'environnement (herbe, montagnes, ciel, etc.)
        const environmentSystem = this.experience.world?.environment?.environmentSystem;
        if (environmentSystem) {
            // Herbe shader
            if (environmentSystem.grassInstancer?.instancedMesh) {
                const grassMesh = environmentSystem.grassInstancer.instancedMesh;
                if (grassMesh instanceof THREE.InstancedMesh) {
                    instances += grassMesh.count;
                    categories.cityElements.meshes++; // L'herbe est plutôt un élément de ville
                    categories.cityElements.instances += grassMesh.count;
                }
            }
            
            // Oiseaux
            if (environmentSystem.birdSystem?.instancedMesh) {
                const birdMesh = environmentSystem.birdSystem.instancedMesh;
                if (birdMesh instanceof THREE.InstancedMesh) {
                    instances += birdMesh.count;
                    categories.environment.meshes++;
                    categories.environment.instances += birdMesh.count;
                }
            }
        }

        // Analyser les autres éléments de la scène (lampadaires, etc.)
        const lampPostManager = this.experience.world?.cityManager?.lampPostManager;
        if (lampPostManager?.instancedMesh) {
            const lampMesh = lampPostManager.instancedMesh;
            if (lampMesh instanceof THREE.InstancedMesh) {
                instances += lampMesh.count;
                categories.cityElements.meshes++;
                categories.cityElements.instances += lampMesh.count;
            }
        }

        // Compter les matériaux uniques et meshes visibles dans la scène
        const materialSet = new Set();
        this.scene.traverse((object) => {
            if (object.isMesh && object.visible) {
                visibleMeshes++;
                
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(mat => materialSet.add(mat.uuid));
                    } else {
                        materialSet.add(object.material.uuid);
                    }
                }
            }
        });
        materials = materialSet.size;

        // Estimer la mémoire utilisée (approximation)
        const rendererMemory = this.renderer.info.memory;
        memoryBytes += rendererMemory.geometries * 50000; // ~50KB par géométrie en moyenne
        memoryBytes += rendererMemory.textures * 200000;  // ~200KB par texture en moyenne
        memoryBytes += instances * 64; // 64 bytes par instance (matrice 4x4)
        memoryBytes += materials * 1000; // ~1KB par matériau

        const memoryMB = Math.round(memoryBytes / (1024 * 1024));

        return {
            instances,
            materials,
            memoryMB,
            visibleMeshes,
            categories
        };
    }

    setupRenderHook() {
        // Pas besoin de hook, on utilise directement les stats du renderer
        // Les statistiques sont maintenant capturées dans Renderer.js
    }

    toggleStats() {
        this.isStatsEnabled = !this.isStatsEnabled;
        
        // Activer/désactiver la capture des stats dans le renderer
        this.experience.renderer.setDetailedStatsEnabled(this.isStatsEnabled);
        
        // Mettre à jour l'apparence du bouton
        if (this.isStatsEnabled) {
            this.elements.enableButton.textContent = 'ON';
            this.elements.enableButton.classList.add('enabled');
        } else {
            this.elements.enableButton.textContent = 'OFF';
            this.elements.enableButton.classList.remove('enabled');
        }
        
        console.log(`Statistiques de rendu ${this.isStatsEnabled ? 'activées' : 'désactivées'}`);
    }

    toggleDetails() {
        const isDetailsVisible = !this.elements.categoriesContent.classList.contains('hidden');
        
        if (isDetailsVisible) {
            this.elements.categoriesContent.classList.add('hidden');
            this.elements.detailsToggleButton.textContent = '▶';
        } else {
            this.elements.categoriesContent.classList.remove('hidden');
            this.elements.detailsToggleButton.textContent = '▼';
        }
    }

    /**
     * Calcule le nombre de triangles dans une géométrie
     * @param {THREE.BufferGeometry} geometry - La géométrie à analyser
     * @returns {number} Le nombre de triangles
     */
    getTriangleCount(geometry) {
        if (!geometry) return 0;
        
        if (geometry.index) {
            // Géométrie indexée
            return geometry.index.count / 3;
        } else {
            // Géométrie non-indexée
            const positionAttribute = geometry.getAttribute('position');
            if (positionAttribute) {
                return positionAttribute.count / 3;
            }
        }
        
        return 0;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
} 