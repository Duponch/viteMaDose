import * as THREE from 'three';

export default class Scene extends THREE.Scene {
    constructor() {
        super();
        // Peut contenir une logique spécifique à la scène plus tard
        // Par exemple, configurer le brouillard globalement ici
        // this.fog = new THREE.Fog(...)
    }
}

// Note: Dans Experience.js, on utilise directement `new THREE.Scene()`
// mais avoir ce fichier permet d'étendre facilement plus tard.
// Pour l'instant, on peut simplifier Experience.js et ne pas importer Scene.js
// et juste faire `this.scene = new THREE.Scene();`
// Gardons le fichier pour la structure future.