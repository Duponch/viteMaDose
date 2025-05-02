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
        const agentId = this.ctx?.agent?.id;
        const isDebugAgent = agentId === 'citizen_0';
        if (isDebugAgent) {
            console.log(`[MoveCtrl-${agentId}] Path START: ${this.path?.length} points. Target 0: ${this.path?.[0]?.x?.toFixed(1)}, ${this.path?.[0]?.z?.toFixed(1)}`);
        }
    }

    /**
     * Met à jour la position le long du chemin.
     * @param {number} dt secondes
     */
    update(dt) {
        const agentId = this.ctx?.agent?.id;
        const isDebugAgent = agentId === 'citizen_0';

        if (!this.path || this.path.length === 0) return; // Chemin déjà fini ou inexistant

        const currentPos = this.ctx.agent.position;
        
        // Vérifier index (sécurité)
        if (this.pathIndex >= this.path.length) {
             if (isDebugAgent) console.warn(`[MoveCtrl-${agentId}] Invalid pathIndex ${this.pathIndex} >= ${this.path.length}`);
            this.path = null;
            return;
        }
        
        const target = this.path[this.pathIndex];
        if (!target) {
            if (isDebugAgent) console.warn(`[MoveCtrl-${agentId}] Target point at index ${this.pathIndex} is invalid.`);
            this.path = null;
            return;
        }

        const distSq = currentPos.distanceToSquared(target);
        const isLastPoint = this.pathIndex >= this.path.length - 1;
        
        const moveVector = this._tmp.subVectors(target, currentPos);
        const distanceToTarget = moveVector.length();
        const moveAmount = this.speed * dt;

        // Log pour le dernier point UNIQUEMENT
        if (isDebugAgent && isLastPoint) {
             console.log(`[MoveCtrl-${agentId}] LAST POINT CHECK: Dist=${distanceToTarget.toFixed(3)}, MoveAmt=${moveAmount.toFixed(3)}, DistSq=${distSq.toFixed(3)}, TolSq=${this.reachToleranceSq.toFixed(3)} -> Condition: ${moveAmount >= distanceToTarget} || ${distSq < this.reachToleranceSq}`);
        }

        // --- LOGIQUE DE FIN SIMPLIFIÉE --- 
        if (moveAmount >= distanceToTarget || distSq < this.reachToleranceSq) {
             if (isLastPoint) {
                 if (isDebugAgent) {
                     console.log(`[MoveCtrl-${agentId}] ✅ FINISH Condition Met! Dist=${distanceToTarget.toFixed(3)}, MoveAmt=${moveAmount.toFixed(3)}, DistSq=${distSq.toFixed(3)}, TolSq=${this.reachToleranceSq.toFixed(3)}`);
                 }
                 currentPos.copy(target); 
                 this.path = null;
                 return;
             } else {
                 // Ce n'était pas le dernier, on passe au suivant
                 // Déplacer d'abord à la position exacte du point courant pour éviter overshoot
                 currentPos.copy(target);
                 this.pathIndex++;
                 // Recalculer la cible pour le reste du mouvement (si dt le permet)
                 const remainingDt = dt * (1 - (distanceToTarget / moveAmount)); // Estimation du temps restant
                 const nextTarget = this.pathIndex < this.path.length ? this.path[this.pathIndex] : null;
                 if (nextTarget && remainingDt > 0) {
                     moveVector.subVectors(nextTarget, currentPos).normalize().multiplyScalar(this.speed * remainingDt);
                     currentPos.add(moveVector);
                 }
             }
        } else {
            // On n'a pas atteint le point, on avance simplement
            moveVector.normalize().multiplyScalar(moveAmount);
            currentPos.add(moveVector);
        }
    }

    /**
     * Indique si l'agent est arrivé à la fin du chemin.
     */
    get finished() {
        return !this.path || this.path.length === 0;
    }
} 