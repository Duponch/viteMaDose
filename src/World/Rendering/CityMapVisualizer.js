import * as THREE from 'three';

export default class CityMapVisualizer {
    constructor(config, leafPlots) {
        this.config = config;
        this.leafPlots = leafPlots;

        // Log des parcelles reçues
        //console.log("CityMapVisualizer - Nombre de parcelles reçues:", leafPlots.length);
        const zoneCounts = {};
        leafPlots.forEach(plot => {
            zoneCounts[plot.zoneType] = (zoneCounts[plot.zoneType] || 0) + 1;
        });
        //console.log("CityMapVisualizer - Répartition des zones:", zoneCounts);

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isVisible = false;
        this.container = null;

        // Cache pour les positions des agents
        this.agentPositions = new Map();
        this.lastAgentUpdate = 0;
        this.agentUpdateInterval = 500; // Mise à jour des agents toutes les 500ms

        // Cache pour la grille
        this.gridCache = null;
        this.lastGridUpdate = 0;
        this.gridUpdateInterval = 1000; // Mise à jour de la grille toutes les secondes

        // Couleurs pour les différents types de zones (alignées avec les couleurs de debug)
        this.zoneColors = {
            'house': '#0077ff', // Bleu pour les maisons (résidentiel)
            'building': '#0077ff', // Bleu pour les immeubles (résidentiel)
            'industrial': '#ffa500', // Orange pour les zones industrielles
            'skyscraper': '#cc0000', // Rouge pour les gratte-ciels (affaires)
            'park': '#32CD32', // Vert pour les parcs
            'unbuildable': '#cccccc' // Gris pour les zones non constructibles
        };

        // État de visibilité des types de parcelles
        this.visibleZoneTypes = new Set(Object.keys(this.zoneColors));

        // Taille d'une cellule de la grille (en unités du monde)
        this.cellSize = 10; // Ajuster selon la taille minimale souhaitée

        // Initialiser le canvas
        this.initializeCanvas();
    }

    initializeCanvas() {
        // Taille du canvas basée sur la taille de la carte (réduite de 40%)
        const size = this.config.mapSize * 0.6; // 60% de la taille originale
        this.canvas.width = size;
        this.canvas.height = size;

        // Ajouter l'ID pour le style CSS
        this.canvas.id = 'city-map-canvas';
        this.canvas.style.display = 'none';

        // Ajouter l'écouteur de clic
        this.canvas.addEventListener('click', this.handleMapClick.bind(this));
    }

    handleMapClick(event) {
        if (!this.experience || !this.experience.camera?.instance) return;

        // Récupérer les coordonnées du clic par rapport au canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Convertir les coordonnées du canvas en coordonnées du monde
        const worldX = (x / 0.6) - (this.config.mapSize / 2);
        const worldZ = (y / 0.6) - (this.config.mapSize / 2);

        // Récupérer la caméra
        const camera = this.experience.camera.instance;

        // Calculer la nouvelle position (50m au-dessus du sol)
        const newPosition = new THREE.Vector3(worldX, 50, worldZ);

        // Calculer la direction de regard (vers le bas)
        const lookAtPosition = new THREE.Vector3(worldX, 0, worldZ);

        // Créer une animation pour déplacer la caméra
        const duration = 1000; // 1 seconde
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Interpolation linéaire de la position
            camera.position.lerpVectors(camera.position, newPosition, progress);

            // Mettre à jour la direction de regard
            camera.lookAt(lookAtPosition);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    // Convertit une position du monde en coordonnées de grille
    worldToGrid(x, z) {
        return {
            x: Math.floor((x + this.config.mapSize / 2) / this.cellSize),
            z: Math.floor((z + this.config.mapSize / 2) / this.cellSize)
        };
    }

    // Convertit des coordonnées de grille en position du monde
    gridToWorld(gridX, gridZ) {
        return {
            x: gridX * this.cellSize - this.config.mapSize / 2,
            z: gridZ * this.cellSize - this.config.mapSize / 2
        };
    }

    // Marque les cellules occupées par une parcelle
    markPlotCells(plot) {
        const startGrid = this.worldToGrid(plot.x, plot.z);
        const endGrid = this.worldToGrid(plot.x + plot.width, plot.z + plot.depth);

        for (let x = startGrid.x; x < endGrid.x; x++) {
            for (let z = startGrid.z; z < endGrid.z; z++) {
                const key = `${x},${z}`;
                if (!this.gridCache.cells.has(key)) {
                    this.gridCache.cells.set(key, {
                        plotId: plot.id,
                        zoneType: plot.zoneType,
                        canvasX: (x * this.cellSize - this.config.mapSize / 2 + this.config.mapSize / 2) * 0.6,
                        canvasY: (z * this.cellSize - this.config.mapSize / 2 + this.config.mapSize / 2) * 0.6
                    });
                }
            }
        }
    }

    setExperience(experience) {
        this.experience = experience;
        this.setupDebugListeners();
        this.setupAgentListeners();
        // Ne pas démarrer les mises à jour ici, attendre que la mini-map soit visible
    }

    startPositionUpdates() {
        if (this.positionUpdateInterval) return; // Éviter les doublons

        // Mettre à jour les positions toutes les 500ms
        this.positionUpdateInterval = setInterval(() => {
            if (this.isVisible) { // Vérifier que la mini-map est toujours visible
                this.updateAllAgentPositions();
            } else {
                this.stopPositionUpdates(); // Arrêter si la mini-map a été masquée
            }
        }, 500);
    }

    stopPositionUpdates() {
        if (this.positionUpdateInterval) {
            clearInterval(this.positionUpdateInterval);
            this.positionUpdateInterval = null;
        }
    }

    updateAllAgentPositions() {
        if (!this.isVisible) return; // Ne pas mettre à jour si la mini-map est masquée

        const now = Date.now();
        if (now - this.lastAgentUpdate < this.agentUpdateInterval) {
            return;
        }
        this.lastAgentUpdate = now;

        if (!this.experience?.world?.agentManager) return;

        const agents = this.experience.world.agentManager.agents;
        if (!agents) return;

        // Mise à jour optimisée des positions
        const newPositions = new Map();
        agents.forEach(agent => {
            if (agent.isVisible) {
                newPositions.set(agent.id, agent.position.clone());
            }
        });

        // Mise à jour atomique des positions
        this.agentPositions = newPositions;

        this.drawMap();
    }

    setupDebugListeners() {
        if (!this.experience) return;

        //Écouter les changements de mode debug
        this.experience.addEventListener("debugmodechanged", (event) => {
            const { isEnabled } = event.detail;
            if (isEnabled) {
                this.visibleZoneTypes.clear();
            } else {
                Object.keys(this.zoneColors).forEach(type => {
                    this.visibleZoneTypes.add(type);
                });
            }
            this.drawMap();
        });

        // Écouter les changements de visibilité des sous-calques
        this.experience.addEventListener('debugsublayervisibilitychanged', (event) => {
            const { categoryName, subTypeName, isVisible } = event.detail;
            if (categoryName === 'plot') {
                if (isVisible) {
                    this.visibleZoneTypes.add(subTypeName);
                } else {
                    this.visibleZoneTypes.delete(subTypeName);
                }
                this.drawMap(); // Redessiner la carte
            }
        });

        // Écouter les changements de visibilité des catégories
        this.experience.addEventListener('debugcategoryvisibilitychanged', (event) => {
            const { categoryName, isVisible } = event.detail;
            if (categoryName === 'plot') {
                // Si la catégorie plot est masquée, masquer tous les types de parcelles
                if (!isVisible) {
                    this.visibleZoneTypes.clear();
                } else {
                    // Sinon, réactiver tous les types
                    Object.keys(this.zoneColors).forEach(type => {
                        this.visibleZoneTypes.add(type);
                    });
                }
                this.drawMap(); // Redessiner la carte
            }
        });
    }

    setupAgentListeners() {
        if (!this.experience) return;

        // Écouter les mises à jour de position des agents
        this.experience.addEventListener('agentpositionupdated', (event) => {
            const { agentId, position } = event.detail;
            const agent = this.experience.world.agentManager.getAgentById(agentId);
            if (agent && agent.isVisible) {
                this.agentPositions.set(agentId, position);
                if (this.isVisible) {
                    this.drawMap();
                }
            }
        });

        // Écouter la suppression des agents
        this.experience.addEventListener('agentremoved', (event) => {
            const { agentId } = event.detail;
            this.agentPositions.delete(agentId);
            if (this.isVisible) {
                this.drawMap();
            }
        });
    }

    drawMap() {
        const now = Date.now();

        // Effacer le canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Mise à jour de la grille si nécessaire
        if (!this.gridCache || now - this.lastGridUpdate >= this.gridUpdateInterval) {
            this.updateGridCache();
            this.lastGridUpdate = now;
        }

        // Dessiner la grille mise en cache
        this.drawGridFromCache();

        // Dessiner les agents
        this.drawAgents();
    }

    updateGridCache() {
        this.gridCache = {
            cells: new Map(),
            size: Math.ceil(this.config.mapSize / this.cellSize)
        };

        // Marquer toutes les cellules occupées
        this.leafPlots.forEach(plot => {
            const startGrid = this.worldToGrid(plot.x, plot.z);
            const endGrid = this.worldToGrid(plot.x + plot.width, plot.z + plot.depth);

            for (let x = startGrid.x; x < endGrid.x; x++) {
                for (let z = startGrid.z; z < endGrid.z; z++) {
                    const key = `${x},${z}`;
                    if (!this.gridCache.cells.has(key)) {
                        this.gridCache.cells.set(key, {
                            plotId: plot.id,
                            zoneType: plot.zoneType,
                            canvasX: (x * this.cellSize - this.config.mapSize / 2 + this.config.mapSize / 2) * 0.6,
                            canvasY: (z * this.cellSize - this.config.mapSize / 2 + this.config.mapSize / 2) * 0.6
                        });
                    }
                }
            }
        });
    }

    drawGridFromCache() {
        if (!this.gridCache) return;

        this.gridCache.cells.forEach(cell => {
            if (this.visibleZoneTypes.has(cell.zoneType)) {
                const color = this.zoneColors[cell.zoneType] || '#FFFFFF';
                this.ctx.fillStyle = color;
                this.ctx.fillRect(cell.canvasX, cell.canvasY, this.cellSize * 0.6, this.cellSize * 0.6);

                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(cell.canvasX, cell.canvasY, this.cellSize * 0.6, this.cellSize * 0.6);
            }
        });
    }

    drawAgents() {
        this.ctx.fillStyle = '#00ffff';
        const agentSize = 3;

        this.agentPositions.forEach(position => {
            const canvasX = (position.x + this.config.mapSize / 2) * 0.6;
            const canvasY = (position.z + this.config.mapSize / 2) * 0.6;

            this.ctx.beginPath();
            this.ctx.arc(canvasX, canvasY, agentSize, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    show() {
        if (!this.isVisible) {
            this.isVisible = true;
            this.canvas.style.display = 'block';
            this.startPositionUpdates();
            this.drawMap();
            // Émettre l'événement de changement de visibilité
            if (this.experience) {
                this.experience.dispatchEvent(new CustomEvent('citymapvisibilitychanged', {
                    detail: { isVisible: true }
                }));
            }
        }
    }

    hide() {
        if (this.isVisible) {
            this.isVisible = false;
            this.canvas.style.display = 'none';
            this.stopPositionUpdates();
            // Émettre l'événement de changement de visibilité
            if (this.experience) {
                this.experience.dispatchEvent(new CustomEvent('citymapvisibilitychanged', {
                    detail: { isVisible: false }
                }));
            }
            this.stopPositionUpdates(); // Arrêter les mises à jour quand masquée
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    setContainer(container) {
        this.container = container;
        container.appendChild(this.canvas);
    }

    destroy() {
        this.stopPositionUpdates();
        this.gridCache = null;
        if (this.container && this.canvas) {
            this.container.removeChild(this.canvas);
        }
    }
} 