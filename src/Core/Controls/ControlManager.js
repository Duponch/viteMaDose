// src/Core/Controls/ControlManager.js
import * as THREE from 'three';
import ClassicControls from './ClassicControls.js';
import FpsControls from './FpsControls.js';

export default class ControlManager extends EventTarget {
    constructor(experience) {
        super();
        this.experience = experience;
        
        // Créer les deux types de contrôles
        this.classicControls = new ClassicControls(experience);
        this.fpsControls = new FpsControls(experience);
        
        // Mode actif par défaut
        this.activeMode = 'classic';
        
        // Objet pour stocker l'état de la caméra lors des transitions
        this.lastFpsState = {
            position: null,
            direction: null
        };
        
        // État initial
        this.classicControls.enable();
        this.fpsControls.disable();
        
        //console.log("ControlManager initialisé avec mode", this.activeMode);
    }
    
    update() {
        // Mettre à jour uniquement les contrôles actifs
        if (this.activeMode === 'classic' && this.classicControls) {
            this.classicControls.update();
        } else if (this.activeMode === 'fps' && this.fpsControls) {
            this.fpsControls.update();
        }
    }
    
    // Changer de mode de contrôle
    setMode(mode) {
        if (mode === this.activeMode) return;
        
        if (mode === 'classic') {
            // Sauvegarder la position et la direction actuelles de la caméra
            const cameraPosition = new THREE.Vector3().copy(this.experience.camera.instance.position);
            const cameraDirection = new THREE.Vector3();
            this.experience.camera.instance.getWorldDirection(cameraDirection);
            
            // Stocker l'état pour une utilisation ultérieure
            this.lastFpsState.position = cameraPosition.clone();
            this.lastFpsState.direction = cameraDirection.clone();
            
            // Calculer un point cible devant la caméra
            const targetPosition = new THREE.Vector3().copy(cameraPosition).add(
                cameraDirection.multiplyScalar(10)
            );
            
            // Désactiver les contrôles FPS
            this.fpsControls.disable();
            
            // Activer les contrôles classiques
            this.classicControls.enable();
            
            // Configurer les contrôles classiques pour qu'ils utilisent la même position et direction
            this.classicControls.target.copy(targetPosition);
            
            this.activeMode = 'classic';
            //console.log("Passage au mode de contrôle classique");
        } else if (mode === 'fps') {
            // Récupérer la position et orientation actuelles de la caméra
            const cameraPosition = new THREE.Vector3().copy(this.experience.camera.instance.position);
            
            // Désactiver les contrôles classiques
            this.classicControls.disable();
            
            // Activer les contrôles FPS (la caméra conserve sa position automatiquement)
            this.fpsControls.enable();
            
            this.activeMode = 'fps';
            //console.log("Passage au mode de contrôle FPS");
        } else {
            console.warn(`Mode de contrôle inconnu: ${mode}`);
            return;
        }
        
        // Émettre un événement pour informer du changement
        this.dispatchEvent(new CustomEvent('modechanged', { 
            detail: { mode: this.activeMode } 
        }));
    }
    
    // Basculer entre les modes
    toggleMode() {
        const newMode = this.activeMode === 'classic' ? 'fps' : 'classic';
        this.setMode(newMode);
    }
    
    // Obtenir le mode actuel
    getActiveMode() {
        return this.activeMode;
    }
    
    // Récupérer le contrôleur actif
    getActiveControls() {
        return this.activeMode === 'classic' ? this.classicControls : this.fpsControls;
    }
    
    // Méthodes de compatibilité avec le code existant (délègue aux contrôles actifs)
    get target() {
        const activeControls = this.getActiveControls();
        return activeControls.target || new THREE.Vector3();
    }
    
    set target(newTarget) {
        const activeControls = this.getActiveControls();
        if (activeControls.target !== undefined) {
            activeControls.target = newTarget;
        }
    }
    
    lookAt(position) {
        const activeControls = this.getActiveControls();
        if (typeof activeControls.lookAt === 'function') {
            activeControls.lookAt(position);
        }
    }
    
    // Compatibilité avec le code existant qui utilise controls.enabled
    get enabled() {
        return this.getActiveControls().isActive;
    }
    
    set enabled(value) {
        if (value) {
            this.getActiveControls().enable();
        } else {
            this.getActiveControls().disable();
        }
    }
    
    destroy() {
        if (this.classicControls) {
            this.classicControls.destroy();
            this.classicControls = null;
        }
        
        if (this.fpsControls) {
            this.fpsControls.destroy();
            this.fpsControls = null;
        }
        
        this.experience = null;
    }
} 