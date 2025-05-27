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
            <div class="render-stats-object-counts">
                <div class="render-stats-section-header">
                    <span>Compteurs d'objets</span>
                    <button class="render-stats-counts-toggle" title="Masquer/Afficher les compteurs">▼</button>
                </div>
                <div class="render-stats-counts-content">
                    <div class="render-stats-count-section">
                        <div class="render-stats-count-header">🏢 Bâtiments</div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Total:</span>
                            <span class="render-stats-count-value" id="buildings-total">0</span>
                        </div>
                        <div class="render-stats-count-subsection">
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Maisons:</span>
                                <span class="render-stats-count-value" id="buildings-house">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Immeubles:</span>
                                <span class="render-stats-count-value" id="buildings-building">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Gratte-ciels:</span>
                                <span class="render-stats-count-value" id="buildings-skyscraper">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Industriels:</span>
                                <span class="render-stats-count-value" id="buildings-industrial">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Commerciaux:</span>
                                <span class="render-stats-count-value" id="buildings-commercial">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Cinémas:</span>
                                <span class="render-stats-count-value" id="buildings-movietheater">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Nouveaux Gratte-ciels:</span>
                                <span class="render-stats-count-value" id="buildings-newskyscraper">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Nouvelles Maisons:</span>
                                <span class="render-stats-count-value" id="buildings-newhouse">0</span>
                            </div>
                            <div class="render-stats-count-item">
                                <span class="render-stats-count-sublabel">Nouveaux Immeubles:</span>
                                <span class="render-stats-count-value" id="buildings-newbuilding">0</span>
                            </div>
                        </div>
                    </div>
                    <div class="render-stats-count-section">
                        <div class="render-stats-count-header">🌳 Environnement urbain</div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Arbres:</span>
                            <span class="render-stats-count-value" id="trees-count">0</span>
                        </div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Lampadaires:</span>
                            <span class="render-stats-count-value" id="lampposts-count">0</span>
                        </div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Trottoirs:</span>
                            <span class="render-stats-count-value" id="sidewalks-count">0</span>
                        </div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Passages piétons:</span>
                            <span class="render-stats-count-value" id="crosswalks-count">0</span>
                        </div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Lignes de route:</span>
                            <span class="render-stats-count-value" id="roadlines-count">0</span>
                        </div>
                    </div>
                    <div class="render-stats-count-section">
                        <div class="render-stats-count-header">☁️ Atmosphère</div>
                        <div class="render-stats-count-item">
                            <span class="render-stats-count-label">Nuages:</span>
                            <span class="render-stats-count-value" id="clouds-count">0</span>
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
            countsToggleButton: this.container.querySelector('.render-stats-counts-toggle'),
            countsContent: this.container.querySelector('.render-stats-counts-content'),
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
            vehiclesInstances: document.getElementById('vehicles-instances'),
            // Compteurs d'objets
            buildingsTotal: document.getElementById('buildings-total'),
            buildingsHouse: document.getElementById('buildings-house'),
            buildingsBuilding: document.getElementById('buildings-building'),
            buildingsSkyscraper: document.getElementById('buildings-skyscraper'),
            buildingsIndustrial: document.getElementById('buildings-industrial'),
            buildingsCommercial: document.getElementById('buildings-commercial'),
            buildingsMovietheater: document.getElementById('buildings-movietheater'),
            buildingsNewSkyscraper: document.getElementById('buildings-newskyscraper'),
            buildingsNewHouse: document.getElementById('buildings-newhouse'),
            buildingsNewBuilding: document.getElementById('buildings-newbuilding'),
            treesCount: document.getElementById('trees-count'),
            lamppostsCount: document.getElementById('lampposts-count'),
            sidewalksCount: document.getElementById('sidewalks-count'),
            crosswalksCount: document.getElementById('crosswalks-count'),
            roadlinesCount: document.getElementById('roadlines-count'),
            cloudsCount: document.getElementById('clouds-count')
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

            .render-stats-object-counts {
                margin-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.2);
                padding-top: 8px;
            }

            .render-stats-counts-toggle {
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

            .render-stats-counts-toggle:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .render-stats-counts-content {
                transition: all 0.3s ease;
            }

            .render-stats-counts-content.hidden {
                display: none;
            }

            .render-stats-count-section {
                margin-bottom: 8px;
                padding: 6px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 4px;
                border-left: 3px solid #00ff88;
            }

            .render-stats-count-header {
                color: #00ff88;
                font-weight: bold;
                font-size: 11px;
                margin-bottom: 4px;
            }

            .render-stats-count-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 2px;
                padding: 2px 0;
            }

            .render-stats-count-label {
                color: #cccccc;
                font-size: 10px;
            }

            .render-stats-count-value {
                color: #00ff88;
                font-weight: bold;
                text-align: right;
                font-size: 10px;
            }

            .render-stats-count-subsection {
                margin-left: 10px;
                margin-top: 4px;
                padding-left: 10px;
                border-left: 1px solid rgba(255, 255, 255, 0.1);
            }

            .render-stats-count-subsection .render-stats-count-item {
                margin-bottom: 1px;
            }

            .render-stats-count-sublabel {
                color: #999999;
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

        // Toggle counts visibility
        this.elements.countsToggleButton.addEventListener('click', () => {
            this.toggleCounts();
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
        
        // Mettre à jour les compteurs d'objets
        const objectCounts = this.calculateObjectCounts();
        
        // Fonction helper pour formater les nombres de manière sécurisée
        const safeFormat = (value) => {
            return (typeof value === 'number' && !isNaN(value)) ? value.toLocaleString() : '0';
        };
        
        // Bâtiments
        this.elements.buildingsTotal.textContent = safeFormat(objectCounts.buildings.total);
        this.elements.buildingsHouse.textContent = safeFormat(objectCounts.buildings.house);
        this.elements.buildingsBuilding.textContent = safeFormat(objectCounts.buildings.building);
        this.elements.buildingsSkyscraper.textContent = safeFormat(objectCounts.buildings.skyscraper);
        this.elements.buildingsIndustrial.textContent = safeFormat(objectCounts.buildings.industrial);
        this.elements.buildingsCommercial.textContent = safeFormat(objectCounts.buildings.commercial);
        this.elements.buildingsMovietheater.textContent = safeFormat(objectCounts.buildings.movietheater);
        this.elements.buildingsNewSkyscraper.textContent = safeFormat(objectCounts.buildings.newskyscraper);
        this.elements.buildingsNewHouse.textContent = safeFormat(objectCounts.buildings.newhouse);
        this.elements.buildingsNewBuilding.textContent = safeFormat(objectCounts.buildings.newbuilding);
        
        // Environnement urbain
        this.elements.treesCount.textContent = safeFormat(objectCounts.trees);
        this.elements.lamppostsCount.textContent = safeFormat(objectCounts.lampposts);
        this.elements.sidewalksCount.textContent = safeFormat(objectCounts.sidewalks);
        this.elements.crosswalksCount.textContent = safeFormat(objectCounts.crosswalks);
        this.elements.roadlinesCount.textContent = safeFormat(objectCounts.roadlines);
        
        // Atmosphère
        this.elements.cloudsCount.textContent = safeFormat(objectCounts.clouds);
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

    toggleCounts() {
        const isCountsVisible = !this.elements.countsContent.classList.contains('hidden');
        
        if (isCountsVisible) {
            this.elements.countsContent.classList.add('hidden');
            this.elements.countsToggleButton.textContent = '▶';
        } else {
            this.elements.countsContent.classList.remove('hidden');
            this.elements.countsToggleButton.textContent = '▼';
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

    calculateObjectCounts() {
        const counts = {
            buildings: {
                total: 0,
                house: 0,
                building: 0,
                skyscraper: 0,
                industrial: 0,
                commercial: 0,
                movietheater: 0,
                newskyscraper: 0,
                newhouse: 0,
                newbuilding: 0
            },
            trees: 0,
            lampposts: 0,
            sidewalks: 0,
            crosswalks: 0,
            roadlines: 0,
            clouds: 0
        };

        try {
            // Compter les bâtiments depuis CitizenManager (buildingInstances est une Map, pas un Array)
            const citizenManager = this.experience.world?.cityManager?.citizenManager;
            if (citizenManager?.buildingInstances && citizenManager.buildingInstances instanceof Map) {
                counts.buildings.total = citizenManager.buildingInstances.size;
                
                // Compter par type en itérant sur les valeurs de la Map
                for (const building of citizenManager.buildingInstances.values()) {
                    if (building && building.type) {
                        const type = building.type.toLowerCase();
                        if (type && counts.buildings.hasOwnProperty(type)) {
                            counts.buildings[type]++;
                        }
                    }
                }
            }

            // Compter les instances depuis InstancedMeshManager
            const instancedMeshManager = this.experience.world?.cityManager?.contentGenerator?.instancedMeshManager;
            if (instancedMeshManager?.instancedMeshes) {
                Object.entries(instancedMeshManager.instancedMeshes).forEach(([key, mesh]) => {
                    if (mesh instanceof THREE.InstancedMesh && typeof mesh.count === 'number') {
                        // Arbres
                        if (key.startsWith('tree_')) {
                            counts.trees += mesh.count;
                        }
                        // Trottoirs
                        else if (key.startsWith('sidewalk_')) {
                            counts.sidewalks += mesh.count;
                        }
                        // Passages piétons (chercher dans les clés crosswalk)
                        else if (key.startsWith('crosswalk_')) {
                            counts.crosswalks += mesh.count;
                        }
                        // Lignes de route (chercher différentes variantes)
                        else if (key.includes('roadLine') || key.includes('road_line') || key.includes('roadlines') || key.includes('roadMarking')) {
                            counts.roadlines += mesh.count;
                        }
                    }
                });
            }

            // Compter les lampadaires depuis LampPostManager
            const lampPostManager = this.experience.world?.cityManager?.lampPostManager;
            if (lampPostManager?.lampPostMeshes) {
                // LampPostManager stocke les meshes dans lampPostMeshes.grey, .light, .lightCone
                const greyMesh = lampPostManager.lampPostMeshes.grey;
                if (greyMesh instanceof THREE.InstancedMesh && typeof greyMesh.count === 'number') {
                    counts.lampposts = greyMesh.count;
                }
            }

            // Compter les nuages (temps réel)
            const cloudSystem = this.experience.world?.environment?.environmentSystem?.cloudSystem;
            if (cloudSystem?.clouds && Array.isArray(cloudSystem.clouds)) {
                counts.clouds = cloudSystem.clouds.length;
            }
        } catch (error) {
            console.warn('Erreur lors du calcul des compteurs d\'objets:', error);
        }

        return counts;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
} 