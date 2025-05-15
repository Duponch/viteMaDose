// src/World/AgentAnimation.js
import * as THREE from 'three';

// Vecteurs et Quaternions temporaires réutilisables (pour la performance)
const _tempPos = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3(1, 1, 1);

export default class AgentAnimation {
    constructor(config, experience) {
        this.config = config; // Stocker la config pour les paramètres d'animation
        this.experience = experience; // Peut être utile pour d'autres aspects

        // Initialiser un objet pour stocker les matrices calculées
        this.animationMatrices = {
            head: new THREE.Matrix4(),
            torso: new THREE.Matrix4(),
            leftHand: new THREE.Matrix4(),
            rightHand: new THREE.Matrix4(),
            leftFoot: new THREE.Matrix4(),
            rightFoot: new THREE.Matrix4(),
        };
    }

    /**
     * Met à jour et retourne les matrices d'animation pour un agent.
     * @param {number} walkTime - Le temps de marche calculé (basé sur vitesse et temps de jeu).
     * @param {boolean} isLodActive - Indique si le LOD est actif (pour désactiver l'animation).
     * @returns {object} - L'objet `this.animationMatrices` mis à jour.
     */
    update(walkTime, isLodActive) {
        // Si le LOD est actif, réinitialiser toutes les matrices à l'identité
        if (isLodActive) {
            this.resetMatrices();
            return this.animationMatrices;
        }

        // --- Récupération des paramètres d'animation depuis la config ---
        // Utiliser des fallbacks robustes si la config est incomplète
        const agentBobAmplitude = this.config?.agentBobAmplitude ?? 0.15;
        const agentStepLength = this.config?.agentStepLength ?? 1.5;
        const agentStepHeight = this.config?.agentStepHeight ?? 0.7;
        const agentSwingAmplitude = this.config?.agentSwingAmplitude ?? 1.2;
        const agentAnkleRotationAmplitude = this.config?.agentAnkleRotationAmplitude ?? (Math.PI / 8);
        const agentHandTiltAmplitude = this.config?.agentHandTiltAmplitude ?? 0.2;
        const agentHeadBobAmplitude = this.config?.agentHeadBobAmplitude ?? 0.06;
        // ----------------------------------------------------------------

        const torsoBobY = Math.sin(walkTime * 2) * agentBobAmplitude;
        let pos = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 };

        // Torso
        pos.y = torsoBobY;
        this.animationMatrices.torso.compose(_tempPos.set(pos.x, pos.y, pos.z), _tempQuat.identity(), _tempScale);

        // Head
        pos.y = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * agentHeadBobAmplitude);
        this.animationMatrices.head.compose(_tempPos.set(pos.x, pos.y, pos.z), _tempQuat.identity(), _tempScale);

        // Left Foot
        pos.z = Math.sin(walkTime) * agentStepLength;
        pos.y = Math.max(0, Math.cos(walkTime)) * agentStepHeight;
        rot.x = Math.sin(walkTime) * agentAnkleRotationAmplitude; rot.y = 0; rot.z = 0;
        this.animationMatrices.leftFoot.compose(_tempPos.set(pos.x, pos.y, pos.z), _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), _tempScale);

        // Right Foot
        pos.z = Math.sin(walkTime + Math.PI) * agentStepLength;
        pos.y = Math.max(0, Math.cos(walkTime + Math.PI)) * agentStepHeight;
        rot.x = Math.sin(walkTime + Math.PI) * agentAnkleRotationAmplitude; rot.y = 0; rot.z = 0;
        this.animationMatrices.rightFoot.compose(_tempPos.set(pos.x, pos.y, pos.z), _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), _tempScale);

        // Left Hand
        pos.z = Math.sin(walkTime + Math.PI) * agentSwingAmplitude;
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = Math.sin(walkTime * 1.8) * agentHandTiltAmplitude;
        this.animationMatrices.leftHand.compose(_tempPos.set(pos.x, pos.y, pos.z), _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), _tempScale);

        // Right Hand
        pos.z = Math.sin(walkTime) * agentSwingAmplitude;
        pos.y = torsoBobY; rot.x = 0; rot.y = 0; rot.z = Math.cos(walkTime * 1.8 + 0.5) * agentHandTiltAmplitude;
        this.animationMatrices.rightHand.compose(_tempPos.set(pos.x, pos.y, pos.z), _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), _tempScale);

        return this.animationMatrices;
    }

    /**
     * Met à jour les matrices d'animation pour un agent en voiture.
     * Position les mains comme sur un volant et les jambes en position assise.
     * @param {boolean} isLodActive - Indique si le LOD est actif.
     * @returns {object} - L'objet `this.animationMatrices` mis à jour.
     */
    updateCar(isLodActive) {
        // Si le LOD est actif, réinitialiser toutes les matrices à l'identité
        if (isLodActive) {
            this.resetMatrices();
            return this.animationMatrices;
        }

        // Position assise pour le corps
        let pos = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 };

        // Torso - légèrement vers l'avant pour position assise
        pos.y = 0;
        pos.z = -0.3;
        rot.x = -0.2; // Légère inclinaison vers l'avant
        this.animationMatrices.torso.compose(
            _tempPos.set(pos.x, pos.y, pos.z), 
            _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), 
            _tempScale
        );

        // Head - légèrement relevée pour regarder la route
        pos.y = 0.1;
        pos.z = -0.2;
        rot.x = -0.1; // Légère inclinaison
        this.animationMatrices.head.compose(
            _tempPos.set(pos.x, pos.y, pos.z), 
            _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), 
            _tempScale
        );

        // Left Foot - position pédale
        pos.z = -0.8;
        pos.y = -0.4;
        rot.x = -1.2; // Pied sur pédale
        this.animationMatrices.leftFoot.compose(
            _tempPos.set(pos.x, pos.y, pos.z), 
            _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), 
            _tempScale
        );

        // Right Foot - position pédale
        pos.z = -0.8;
        pos.y = -0.4;
        rot.x = -1.2; // Pied sur pédale
        this.animationMatrices.rightFoot.compose(
            _tempPos.set(pos.x, pos.y, pos.z), 
            _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), 
            _tempScale
        );

        // Left Hand - main sur le volant (gauche)
        pos.z = 0.5;
        pos.y = 0.5;
        pos.x = -0.5;
        rot.x = 0.7; // Main tendue
        rot.y = 0;
        rot.z = 0;
        this.animationMatrices.leftHand.compose(
            _tempPos.set(pos.x, pos.y, pos.z), 
            _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), 
            _tempScale
        );

        // Right Hand - main sur le volant (droite)
        pos.z = 0.5;
        pos.y = 0.5;
        pos.x = 0.5; 
        rot.x = 0.7; // Main tendue
        rot.y = 0;
        rot.z = 0;
        this.animationMatrices.rightHand.compose(
            _tempPos.set(pos.x, pos.y, pos.z), 
            _tempQuat.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, 'XYZ')), 
            _tempScale
        );

        return this.animationMatrices;
    }

    /**
     * Réinitialise toutes les matrices d'animation à l'identité.
     */
    resetMatrices() {
        Object.keys(this.animationMatrices).forEach(key => {
            this.animationMatrices[key].identity();
        });
    }
}