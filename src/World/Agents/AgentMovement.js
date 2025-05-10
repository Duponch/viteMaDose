// src/World/AgentMovement.js
import * as THREE from 'three';

// Vecteurs temporaires pour fallback (cas où le pool n'est pas disponible)
const _tempV3_1 = new THREE.Vector3();
const _tempV3_2 = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();

export default class AgentMovement {
    /**
     * Gère le déplacement visuel et l'orientation d'un agent le long d'un chemin.
     * @param {Agent} agent - L'instance Agent à contrôler.
     */
    constructor(agent) {
        this.agent = agent;
        this.experience = agent.experience;
        this.config = agent.config;

        // Références directes pour accès rapide (attention à la synchronisation)
        this.position = agent.position; // Référence directe
        this.orientation = agent.orientation; // Référence directe

        // Paramètres (peuvent venir de la config agent)
        this.rotationSpeed = this.config.rotationSpeed ?? 8.0;
        this.yOffset = this.config.yOffset ?? 0.3;
    }

    /**
     * Met à jour la position et l'orientation visuelles de l'agent (piéton) en fonction
     * de sa progression sur le chemin actuel.
     * Assume que l'agent n'est PAS dans un véhicule.
     *
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame (ms).
     * @param {Array<THREE.Vector3> | null} pathPoints - Les points du chemin actuel.
     * @param {number} pathLengthWorld - La longueur totale du chemin.
     * @param {number} progress - La progression normalisée (0-1) sur le chemin.
     * @param {number} currentPathIndexVisual - L'index du segment actuel sur le chemin.
     * @returns {number} Le nouvel index visuel calculé.
     */
    updatePedestrianMovement(deltaTime, pathPoints, pathLengthWorld, progress, currentPathIndexVisual) {
        let newPathIndexVisual = currentPathIndexVisual;

        if (!pathPoints || pathPoints.length === 0 || pathLengthWorld <= 0) {
            // Pas de chemin valide, on ne bouge pas (la visibilité est gérée ailleurs)
            return newPathIndexVisual;
        }

        // Obtenir une référence au pool d'objets si disponible
        const objectPool = this.experience?.objectPool;
        
        // Variables temporaires - utiliser le pool si disponible
        let segmentVector = objectPool ? objectPool.getVector3() : _tempV3_1;
        let lookVector = null; // On le créera seulement si nécessaire
        let tempMatrix = null; // On le créera seulement si nécessaire
        let tempQuat = null; // On le créera seulement si nécessaire

        progress = Math.max(0, Math.min(1, progress)); // Clamper la progression

        // --- 1. Calculer la position sur le chemin ---
        if (pathPoints.length === 1) {
            this.position.copy(pathPoints[0]);
        } else {
            const targetDistance = progress * pathLengthWorld;
            let cumulativeLength = 0;
            let targetPositionFound = false;

            for (let i = 0; i < pathPoints.length - 1; i++) {
                const p1 = pathPoints[i];
                const p2 = pathPoints[i + 1];
                segmentVector.copy(p2).sub(p1);
                const segmentLength = segmentVector.length();

                if (segmentLength < 0.001) continue; // Ignorer segments de longueur nulle

                // Si la distance cible est sur ce segment ou si c'est le dernier segment
                if (cumulativeLength + segmentLength >= targetDistance || i === pathPoints.length - 2) {
                    const lengthOnSegment = Math.max(0, targetDistance - cumulativeLength);
                    // Calculer la progression sur CE segment
                    const segmentProgress = Math.max(0, Math.min(1, segmentLength > 0 ? lengthOnSegment / segmentLength : 0));

                    // Interpoler pour trouver la position exacte
                    this.position.copy(p1).addScaledVector(segmentVector, segmentProgress);
                    newPathIndexVisual = i; // Mettre à jour l'index visuel
                    targetPositionFound = true;
                    break; // Sortir de la boucle une fois la position trouvée
                }
                cumulativeLength += segmentLength;
            }
            // Si pour une raison quelconque on n'a pas trouvé (ex: chemin invalide après le début),
            // se placer sur le dernier point pour éviter des erreurs.
            if (!targetPositionFound) {
                this.position.copy(pathPoints[pathPoints.length - 1]);
                newPathIndexVisual = pathPoints.length - 2;
            }
        }

        // Appliquer l'offset Y
        this.position.y = (pathPoints.length > 0 ? pathPoints[0].y : 0) + this.yOffset; // Utiliser la hauteur du chemin + offset

        // --- 2. Calculer l'orientation ---
        // Orienter vers le point suivant sur le chemin
        let lookAtIndex = Math.min(newPathIndexVisual + 1, pathPoints.length - 1);
        // Si très proche de la fin, regarder la destination finale
        if (progress > 0.98 && pathPoints.length > 1) {
            lookAtIndex = pathPoints.length - 1;
        }

        const lookTargetPoint = pathPoints[lookAtIndex];

        // S'orienter seulement si le point de regard est différent de la position actuelle
        // et que le chemin a plus d'un point.
        if (pathPoints.length > 1 && this.position.distanceToSquared(lookTargetPoint) > 0.01) {
            // Créer les objets temporaires pour l'orientation seulement si nécessaire
            lookVector = objectPool ? objectPool.getVector3() : _tempV3_2;
            tempMatrix = objectPool ? objectPool.getMatrix4() : _tempMatrix;
            tempQuat = objectPool ? objectPool.getQuaternion() : _tempQuat;
            
            // Regarder horizontalement (garder la même hauteur Y pour le point de regard)
            lookVector.copy(lookTargetPoint).setY(this.position.y);

            // Utiliser lookAt pour obtenir la matrice de rotation, puis le quaternion
            tempMatrix.lookAt(this.position, lookVector, THREE.Object3D.DEFAULT_UP);
            tempQuat.setFromRotationMatrix(tempMatrix);

            // Ajustement car le modèle regarde peut-être dans une direction par défaut (ex: +Z)
            // Si votre modèle regarde vers +Z par défaut, décommentez la ligne suivante:
            // Utiliser un quaternion temporaire pour éviter d'en créer un nouveau
            const piRotation = objectPool ? objectPool.getQuaternion() : new THREE.Quaternion();
            piRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            tempQuat.multiply(piRotation);
            if (objectPool) objectPool.releaseQuaternion(piRotation);

            // Interpolation douce (Slerp) de l'orientation actuelle vers la cible
            const deltaSeconds = deltaTime / 1000.0;
            // Utiliser une formule indépendante du framerate pour le facteur alpha
            const slerpAlpha = 1.0 - Math.exp(-this.rotationSpeed * deltaSeconds);
            this.orientation.slerp(tempQuat, slerpAlpha);
        }
        
        // Libérer les objets temporaires
        if (objectPool) {
            if (segmentVector) objectPool.releaseVector3(segmentVector);
            if (lookVector) objectPool.releaseVector3(lookVector);
            if (tempMatrix) objectPool.releaseMatrix4(tempMatrix);
            if (tempQuat) objectPool.releaseQuaternion(tempQuat);
        }

        return newPathIndexVisual; // Retourner le nouvel index visuel
    }
}