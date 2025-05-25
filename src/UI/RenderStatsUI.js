import * as THREE from 'three';

export default class RenderStatsUI {
    constructor(experience) {
        this.experience = experience;
        this.renderer = this.experience.renderer.instance;
        this.scene = this.experience.scene;
        
        this.isVisible = true;
        this.updateInterval = 100; // Mise à jour toutes les 100ms
        this.lastUpdateTime = 0;
        
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
                <button class="render-stats-toggle" title="Masquer/Afficher">−</button>
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
        `;

        // Ajouter les styles CSS
        this.addStyles();
        
        // Ajouter à la page
        document.body.appendChild(this.container);
        
        // Références aux éléments
        this.elements = {
            toggleButton: this.container.querySelector('.render-stats-toggle'),
            content: this.container.querySelector('.render-stats-content'),
            drawCalls: document.getElementById('draw-calls'),
            triangles: document.getElementById('triangles'),
            geometries: document.getElementById('geometries'),
            textures: document.getElementById('textures'),
            memory: document.getElementById('memory'),
            instances: document.getElementById('instances'),
            materials: document.getElementById('materials'),
            visibleMeshes: document.getElementById('visible-meshes')
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
        `;
        document.head.appendChild(style);
    }

    bindEvents() {
        // Toggle visibility
        this.elements.toggleButton.addEventListener('click', () => {
            this.toggleContent();
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
        
        // Utiliser les statistiques du rendu principal si disponibles
        const mainStats = this.experience.renderer.mainRenderStats;
        const drawCalls = mainStats ? mainStats.calls : info.render.calls;
        const triangles = mainStats ? mainStats.triangles : info.render.triangles;
        
        // Mettre à jour l'affichage
        this.elements.drawCalls.textContent = drawCalls.toLocaleString();
        this.elements.triangles.textContent = triangles.toLocaleString();
        this.elements.geometries.textContent = memory.geometries.toLocaleString();
        this.elements.textures.textContent = memory.textures.toLocaleString();
        this.elements.memory.textContent = `${stats.memoryMB} MB`;
        this.elements.instances.textContent = stats.instances.toLocaleString();
        this.elements.materials.textContent = stats.materials.toLocaleString();
        this.elements.visibleMeshes.textContent = stats.visibleMeshes.toLocaleString();
    }

    calculateStats() {
        let instances = 0;
        let materials = 0;
        let memoryBytes = 0;
        let visibleMeshes = 0;

        // Compter les instances depuis InstancedMeshManager
        const instancedMeshManager = this.experience.world?.cityManager?.contentGenerator?.instancedMeshManager;
        if (instancedMeshManager?.instancedMeshes) {
            Object.values(instancedMeshManager.instancedMeshes).forEach(mesh => {
                if (mesh instanceof THREE.InstancedMesh) {
                    instances += mesh.count;
                }
            });
        }

        // Compter les instances d'agents
        const agentManager = this.experience.world?.agentManager;
        if (agentManager?.instanceMeshes) {
            // Agents haute qualité
            if (agentManager.instanceMeshes.highDetail) {
                Object.values(agentManager.instanceMeshes.highDetail).forEach(mesh => {
                    if (mesh instanceof THREE.InstancedMesh) {
                        instances += mesh.count;
                    }
                });
            }
            // Agents basse qualité
            if (agentManager.instanceMeshes.lowDetail) {
                Object.values(agentManager.instanceMeshes.lowDetail).forEach(mesh => {
                    if (mesh instanceof THREE.InstancedMesh) {
                        instances += mesh.count;
                    }
                });
            }
        }

        // Compter les instances de voitures
        const carManager = this.experience.world?.carManager;
        if (carManager?.instancedMeshes) {
            Object.values(carManager.instancedMeshes).forEach(mesh => {
                if (mesh instanceof THREE.InstancedMesh) {
                    instances += mesh.count;
                }
            });
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
        // Basé sur les informations du renderer et quelques heuristiques
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
            visibleMeshes
        };
    }

    setupRenderHook() {
        // Pas besoin de hook, on utilise directement les stats du renderer
        // Les statistiques sont maintenant capturées dans Renderer.js
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
} 