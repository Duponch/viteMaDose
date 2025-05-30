import * as THREE from 'three';

/**
 * Moniteur de performance pour mesurer les draw calls et FPS
 */
export default class PerformanceMonitor {
    constructor(renderer) {
        this.renderer = renderer;
        this.stats = {
            drawCalls: 0,
            triangles: 0,
            geometries: 0,
            textures: 0,
            programs: 0,
            fps: 0,
            frameTime: 0
        };
        
        this.lastTime = performance.now();
        this.frames = 0;
        this.fpsUpdateInterval = 1000; // Update FPS every second
        this.lastFpsUpdate = this.lastTime;
        
        // Pour le calcul du FPS moyen
        this.fpsHistory = [];
        this.maxHistoryLength = 60;
    }

    /**
     * Met à jour les statistiques
     */
    update() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Calcul du FPS
        this.frames++;
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.stats.fps = Math.round((this.frames * 1000) / (currentTime - this.lastFpsUpdate));
            this.frames = 0;
            this.lastFpsUpdate = currentTime;
            
            // Historique FPS
            this.fpsHistory.push(this.stats.fps);
            if (this.fpsHistory.length > this.maxHistoryLength) {
                this.fpsHistory.shift();
            }
        }
        
        // Stats du renderer
        const info = this.renderer.info;
        this.stats.drawCalls = info.render.calls;
        this.stats.triangles = info.render.triangles;
        this.stats.geometries = info.memory.geometries;
        this.stats.textures = info.memory.textures;
        this.stats.programs = info.programs ? info.programs.length : 0;
        this.stats.frameTime = deltaTime;
    }

    /**
     * Obtient les statistiques actuelles
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Obtient le FPS moyen
     */
    getAverageFps() {
        if (this.fpsHistory.length === 0) return 0;
        const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.fpsHistory.length);
    }

    /**
     * Log les statistiques dans la console
     */
    logStats(label = '') {
        const prefix = label ? `[${label}] ` : '';
        console.log(`${prefix}Performance Stats:`);
        console.log(`  Draw Calls: ${this.stats.drawCalls}`);
        console.log(`  Triangles: ${this.stats.triangles.toLocaleString()}`);
        console.log(`  Geometries: ${this.stats.geometries}`);
        console.log(`  Textures: ${this.stats.textures}`);
        console.log(`  Programs: ${this.stats.programs}`);
        console.log(`  FPS: ${this.stats.fps} (avg: ${this.getAverageFps()})`);
        console.log(`  Frame Time: ${this.stats.frameTime.toFixed(2)}ms`);
    }

    /**
     * Compare deux ensembles de statistiques
     */
    static compareStats(before, after, label = 'Optimization') {
        console.log(`\n=== ${label} Results ===`);
        console.log(`Draw Calls: ${before.drawCalls} → ${after.drawCalls} (${Math.round((1 - after.drawCalls/before.drawCalls) * 100)}% reduction)`);
        console.log(`Triangles: ${before.triangles.toLocaleString()} → ${after.triangles.toLocaleString()}`);
        console.log(`Geometries: ${before.geometries} → ${after.geometries}`);
        console.log(`FPS: ${before.fps} → ${after.fps} (+${after.fps - before.fps})`);
        console.log(`==================\n`);
    }

    /**
     * Réinitialise les statistiques
     */
    reset() {
        this.frames = 0;
        this.lastTime = performance.now();
        this.lastFpsUpdate = this.lastTime;
        this.fpsHistory = [];
    }
}