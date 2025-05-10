import * as THREE from 'three';

/**
 * Classe utilitaire pour gérer des pools d'objets réutilisables
 * Permet d'éviter la création excessive d'objets temporaires à chaque frame
 */
export default class ObjectPool {
    constructor() {
        // Initialisation des différents pools
        this.matrix4Pool = [];
        this.vector3Pool = [];
        this.quaternionPool = [];
        this.euler3Pool = [];
        
        // Configuration des tailles initiales et maximales des pools
        this.config = {
            matrix4: { initialSize: 20, maxSize: 1000 },
            vector3: { initialSize: 50, maxSize: 2000 },
            quaternion: { initialSize: 20, maxSize: 1000 },
            euler3: { initialSize: 10, maxSize: 500 }
        };
        
        // Statistiques d'utilisation
        this.stats = {
            matrix4: { created: 0, reused: 0, returned: 0 },
            vector3: { created: 0, reused: 0, returned: 0 },
            quaternion: { created: 0, reused: 0, returned: 0 },
            euler3: { created: 0, reused: 0, returned: 0 }
        };
        
        // Préallouer les objets pour chaque pool
        this._preallocate();
    }
    
    /**
     * Préalloue des objets pour chaque pool selon la configuration
     * @private
     */
    _preallocate() {
        // Préallouer les Matrix4
        for (let i = 0; i < this.config.matrix4.initialSize; i++) {
            this.matrix4Pool.push(new THREE.Matrix4());
        }
        
        // Préallouer les Vector3
        for (let i = 0; i < this.config.vector3.initialSize; i++) {
            this.vector3Pool.push(new THREE.Vector3());
        }
        
        // Préallouer les Quaternion
        for (let i = 0; i < this.config.quaternion.initialSize; i++) {
            this.quaternionPool.push(new THREE.Quaternion());
        }
        
        // Préallouer les Euler
        for (let i = 0; i < this.config.euler3.initialSize; i++) {
            this.euler3Pool.push(new THREE.Euler());
        }
        
        // Mettre à jour les statistiques
        this.stats.matrix4.created = this.config.matrix4.initialSize;
        this.stats.vector3.created = this.config.vector3.initialSize;
        this.stats.quaternion.created = this.config.quaternion.initialSize;
        this.stats.euler3.created = this.config.euler3.initialSize;
    }
    
    /**
     * Obtient une matrice Matrix4 du pool ou en crée une nouvelle si nécessaire
     * @returns {THREE.Matrix4} Une matrice Matrix4 réinitialisée à l'identité
     */
    getMatrix4() {
        if (this.matrix4Pool.length > 0) {
            this.stats.matrix4.reused++;
            return this.matrix4Pool.pop().identity();
        } else {
            if (this.stats.matrix4.created < this.config.matrix4.maxSize) {
                this.stats.matrix4.created++;
                return new THREE.Matrix4();
            } else {
                console.warn('ObjectPool: Maximum Matrix4 pool size reached, creating temporary object');
                return new THREE.Matrix4();
            }
        }
    }
    
    /**
     * Obtient un vecteur Vector3 du pool ou en crée un nouveau si nécessaire
     * @param {number} x - Valeur x initiale (défaut 0)
     * @param {number} y - Valeur y initiale (défaut 0)
     * @param {number} z - Valeur z initiale (défaut 0)
     * @returns {THREE.Vector3} Un vecteur Vector3 réinitialisé aux valeurs spécifiées
     */
    getVector3(x = 0, y = 0, z = 0) {
        if (this.vector3Pool.length > 0) {
            this.stats.vector3.reused++;
            return this.vector3Pool.pop().set(x, y, z);
        } else {
            if (this.stats.vector3.created < this.config.vector3.maxSize) {
                this.stats.vector3.created++;
                return new THREE.Vector3(x, y, z);
            } else {
                console.warn('ObjectPool: Maximum Vector3 pool size reached, creating temporary object');
                return new THREE.Vector3(x, y, z);
            }
        }
    }
    
    /**
     * Obtient un quaternion du pool ou en crée un nouveau si nécessaire
     * @returns {THREE.Quaternion} Un quaternion réinitialisé à l'identité
     */
    getQuaternion() {
        if (this.quaternionPool.length > 0) {
            this.stats.quaternion.reused++;
            return this.quaternionPool.pop().identity();
        } else {
            if (this.stats.quaternion.created < this.config.quaternion.maxSize) {
                this.stats.quaternion.created++;
                return new THREE.Quaternion();
            } else {
                console.warn('ObjectPool: Maximum Quaternion pool size reached, creating temporary object');
                return new THREE.Quaternion();
            }
        }
    }
    
    /**
     * Obtient un Euler du pool ou en crée un nouveau si nécessaire
     * @returns {THREE.Euler} Un Euler réinitialisé à zéro
     */
    getEuler() {
        if (this.euler3Pool.length > 0) {
            this.stats.euler3.reused++;
            return this.euler3Pool.pop().set(0, 0, 0);
        } else {
            if (this.stats.euler3.created < this.config.euler3.maxSize) {
                this.stats.euler3.created++;
                return new THREE.Euler();
            } else {
                console.warn('ObjectPool: Maximum Euler pool size reached, creating temporary object');
                return new THREE.Euler();
            }
        }
    }
    
    /**
     * Retourne une matrice Matrix4 au pool pour réutilisation
     * @param {THREE.Matrix4} matrix - La matrice à retourner au pool
     */
    releaseMatrix4(matrix) {
        if (!matrix || !(matrix instanceof THREE.Matrix4)) return;
        
        if (this.matrix4Pool.length < this.config.matrix4.maxSize) {
            this.matrix4Pool.push(matrix);
            this.stats.matrix4.returned++;
        }
    }
    
    /**
     * Retourne un vecteur Vector3 au pool pour réutilisation
     * @param {THREE.Vector3} vector - Le vecteur à retourner au pool
     */
    releaseVector3(vector) {
        if (!vector || !(vector instanceof THREE.Vector3)) return;
        
        if (this.vector3Pool.length < this.config.vector3.maxSize) {
            this.vector3Pool.push(vector);
            this.stats.vector3.returned++;
        }
    }
    
    /**
     * Retourne un quaternion au pool pour réutilisation
     * @param {THREE.Quaternion} quaternion - Le quaternion à retourner au pool
     */
    releaseQuaternion(quaternion) {
        if (!quaternion || !(quaternion instanceof THREE.Quaternion)) return;
        
        if (this.quaternionPool.length < this.config.quaternion.maxSize) {
            this.quaternionPool.push(quaternion);
            this.stats.quaternion.returned++;
        }
    }
    
    /**
     * Retourne un Euler au pool pour réutilisation
     * @param {THREE.Euler} euler - L'euler à retourner au pool
     */
    releaseEuler(euler) {
        if (!euler || !(euler instanceof THREE.Euler)) return;
        
        if (this.euler3Pool.length < this.config.euler3.maxSize) {
            this.euler3Pool.push(euler);
            this.stats.euler3.returned++;
        }
    }
    
    /**
     * Obtient les statistiques d'utilisation du pool
     * @returns {Object} Statistiques d'utilisation
     */
    getStats() {
        return {
            matrix4: { ...this.stats.matrix4, available: this.matrix4Pool.length },
            vector3: { ...this.stats.vector3, available: this.vector3Pool.length },
            quaternion: { ...this.stats.quaternion, available: this.quaternionPool.length },
            euler3: { ...this.stats.euler3, available: this.euler3Pool.length }
        };
    }
    
    /**
     * Réinitialise tous les pools (les vide)
     */
    clear() {
        this.matrix4Pool = [];
        this.vector3Pool = [];
        this.quaternionPool = [];
        this.euler3Pool = [];
        
        // Réinitialiser les statistiques de retour
        this.stats.matrix4.returned = 0;
        this.stats.vector3.returned = 0;
        this.stats.quaternion.returned = 0;
        this.stats.euler3.returned = 0;
        
        // Préallouer à nouveau
        this._preallocate();
    }
} 