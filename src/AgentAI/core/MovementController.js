import * as THREE from 'three';

export default class MovementController {
    /**
     * @param {import('./AgentContext').default} ctx
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.path = null;            // Array<THREE.Vector3>
        this.pathLengthWorld = 0;
        this.pathIndex = 0;
        this.progress = 0;
        this.reachToleranceSq = (ctx.config?.reachTolerance || 0.5) ** 2;
        this.speed = ctx.config?.speed || 1.5;
        this._tmp = new THREE.Vector3();
    }

    /**
     * Le FSM appelle cette méthode quand un chemin est reçu.
     */
    followPath(worldPath, lengthWorld) {
        // Synchroniser avec l'agent legacy
        if (this.ctx.agent) {
            this.ctx.agent.currentPathPoints = worldPath;
            this.ctx.agent.currentPathLengthWorld = lengthWorld;
        }

        this.path = worldPath;
        this.pathLengthWorld = lengthWorld;
        this.pathIndex = 0;
        this.progress = 0;
    }

    /**
     * Met à jour la position le long du chemin.
     * @param {number} dt secondes
     */
    update(dt) {
        if (!this.path || this.path.length === 0) return;
        const currentPos = this.ctx.agent.position;
        const target = this.path[this.pathIndex];
        if (!target) return;

        // Distance² jusqu'à la cible
        const distSq = currentPos.distanceToSquared(target);
        if (distSq < this.reachToleranceSq) {
            // Atteint le point
            if (this.pathIndex < this.path.length - 1) {
                this.pathIndex++;
            } else {
                // Chemin terminé
                this.path = null;
                return;
            }
        }
        // Avancer vers la cible
        this._tmp.subVectors(target, currentPos).normalize().multiplyScalar(this.speed * dt);
        currentPos.add(this._tmp);
    }

    /**
     * Indique si l'agent est arrivé à la fin du chemin.
     */
    get finished() {
        return !this.path || this.path.length === 0;
    }
} 