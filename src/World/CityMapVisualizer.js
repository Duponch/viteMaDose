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
            'skyscraper': '#cc0000', // Rouge pour les gratte-ciels (affaires)m 
            'park': '#32CD32', // Vert pour les parcs
            'unbuildable': '#cccccc' // Gris pour les zones non constructibles
        };

        // Taille d'une cellule de la grille (en unités du monde)
        this.cellSize = 10; // Ajuster selon la taille minimale souhaitée
        this.grid = new Map(); // Stocke les cellules occupées

        // Initialiser le canvas
        this.initializeCanvas();
    }

    initializeCanvas() {
        // Taille du canvas basée sur la taille de la carte
        const size = this.config.mapSize;
        this.canvas.width = size;
        this.canvas.height = size;
        
        // Style du canvas
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '50%';
        this.canvas.style.left = '50%';
        this.canvas.style.transform = 'translate(-50%, -50%)';
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
                
                if (cell) {
                    // Couleur basée sur le type de zone
                    const color = this.zoneColors[cell.zoneType] || '#FFFFFF';
                    this.ctx.fillStyle = color;
                    
                    // Position de la cellule sur le canvas (vue du ciel)
                    const worldPos = this.gridToWorld(x, z);
                    const canvasX = worldPos.x + this.config.mapSize / 2;
                    const canvasY = worldPos.z + this.config.mapSize / 2; // Plus d'inversion de Y
                    
                    // Dessiner la cellule
                    this.ctx.fillRect(canvasX, canvasY, this.cellSize, this.cellSize);
                    
                    // Contour de la cellule
                    this.ctx.strokeStyle = '#000000';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(canvasX, canvasY, this.cellSize, this.cellSize);
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