import * as THREE from 'three';

export default class CityMapVisualizer {
    constructor(config, leafPlots) {
        this.config = config;
        this.leafPlots = leafPlots;
        
        // Log des parcelles reçues
        console.log("CityMapVisualizer - Nombre de parcelles reçues:", leafPlots.length);
        const zoneCounts = {};
        leafPlots.forEach(plot => {
            zoneCounts[plot.zoneType] = (zoneCounts[plot.zoneType] || 0) + 1;
        });
        console.log("CityMapVisualizer - Répartition des zones:", zoneCounts);

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isVisible = false;
        this.container = null;
        
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
        this.grid = new Map(); // Stocke les cellules occupées

        // Initialiser le canvas
        this.initializeCanvas();
    }

    initializeCanvas() {
        // Taille du canvas basée sur la taille de la carte (réduite de 40%)
        const size = this.config.mapSize * 0.6; // 60% de la taille originale
        this.canvas.width = size;
        this.canvas.height = size;
        
        // Style du canvas
        this.canvas.style.position = 'absolute';
        this.canvas.style.bottom = '20px'; // Position en bas
        this.canvas.style.left = '70px'; // Position à gauche après le bouton agent-stats-toggle
        this.canvas.style.zIndex = '1000';
        this.canvas.style.display = 'none';
        this.canvas.style.border = '2px solid white';
        this.canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
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
                if (!this.grid.has(key)) {
                    this.grid.set(key, {
                        plotId: plot.id,
                        zoneType: plot.zoneType
                    });
                }
            }
        }
    }

    setExperience(experience) {
        this.experience = experience;
        this.setupDebugListeners();
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

    drawMap() {
        // Effacer le canvas et la grille
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.grid.clear();

        // Marquer toutes les cellules occupées
        this.leafPlots.forEach(plot => this.markPlotCells(plot));

        // Dessiner la grille
        const gridSize = Math.ceil(this.config.mapSize / this.cellSize);
        
        // Dessiner chaque cellule
        for (let x = 0; x < gridSize; x++) {
            for (let z = 0; z < gridSize; z++) {
                const key = `${x},${z}`;
                const cell = this.grid.get(key);
                
                if (cell && this.visibleZoneTypes.has(cell.zoneType)) {
                    // Couleur basée sur le type de zone
                    const color = this.zoneColors[cell.zoneType] || '#FFFFFF';
                    this.ctx.fillStyle = color;
                    
                    // Position de la cellule sur le canvas (vue du ciel)
                    const worldPos = this.gridToWorld(x, z);
                    const canvasX = (worldPos.x + this.config.mapSize / 2) * 0.6;
                    const canvasY = (worldPos.z + this.config.mapSize / 2) * 0.6;
                    
                    // Dessiner la cellule
                    this.ctx.fillRect(canvasX, canvasY, this.cellSize * 0.6, this.cellSize * 0.6);
                    
                    // Contour de la cellule
                    this.ctx.strokeStyle = '#000000';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(canvasX, canvasY, this.cellSize * 0.6, this.cellSize * 0.6);
                }
            }
        }
    }

    show() {
        if (!this.isVisible) {
            this.isVisible = true;
            this.canvas.style.display = 'block';
            this.drawMap();
        }
    }

    hide() {
        if (this.isVisible) {
            this.isVisible = false;
            this.canvas.style.display = 'none';
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
} 