import * as THREE from 'three';

/**
 * Classe utilitaire qui génère des flèches visuelles pour indiquer
 * l'orientation des façades avant des bâtiments vers les trottoirs.
 * Ces flèches sont des helpers visuels qui ne sont affichés qu'en mode debug.
 */
export default class BuildingFacadeHelper {
    /**
     * Constructeur
     * @param {object} config - Configuration globale
     * @param {THREE.Scene} scene - Scène où ajouter les helpers
     */
    constructor(config, scene) {
        this.config = config;
        this.scene = scene;
        this.helpersGroup = new THREE.Group();
        this.helpersGroup.name = "BuildingFacadeHelpers";
        this.arrowHelpers = [];
        this.isVisible = false;
        
        // Créer le matériau pour les flèches
        this.arrowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3333,      // Rouge plus vif
            transparent: true,
            opacity: 0.9,         // Plus opaque
            depthWrite: false,    // Pour éviter les problèmes de rendu avec d'autres objets transparents
            side: THREE.DoubleSide
        });
        
        // Ajouter le groupe à la scène (invisible par défaut)
        this.scene.add(this.helpersGroup);
        this.helpersGroup.visible = this.isVisible;
    }
    
    /**
     * Ajoute une flèche helper pour un bâtiment
     * @param {THREE.Vector3} position - Position du bâtiment
     * @param {number} rotationY - Rotation Y du bâtiment (orientation de la façade)
     * @param {number} buildingWidth - Largeur du bâtiment
     * @param {number} buildingDepth - Profondeur du bâtiment
     */
    addFacadeHelper(position, rotationY, buildingWidth = 5, buildingDepth = 5) {
        // Cette méthode est désactivée pour supprimer les flèches rouges du rendu
        // Les flèches étaient utilisées uniquement pour le débogage
        return;
        
        /*// Calculer la taille de la flèche en fonction de la taille du bâtiment
        const arrowSize = Math.min(buildingWidth, buildingDepth) * 0.1; // Réduit la taille de la flèche
        const arrowLength = arrowSize * 1.5; // Flèche plus longue
        
        // Créer une géométrie de flèche personnalisée
        const arrowGeometry = this.createArrowGeometry(arrowSize, arrowLength);
        
        // Créer le mesh de la flèche
        const arrowMesh = new THREE.Mesh(arrowGeometry, this.arrowMaterial);
        
        // Calculer l'offset pour placer la flèche à l'emplacement de la porte
        // La porte est généralement au milieu de la façade
        // Pour les immeubles, la porte est généralement dans l'aile latérale
        const isBuilding = buildingWidth >= 7 && buildingDepth >= 7; // Heuristique pour détecter les immeubles
        
        // Position de base
        arrowMesh.position.copy(position);
        
        // Hauteur de la flèche, légèrement au-dessus du sol mais à hauteur de porte
        arrowMesh.position.y = 1.5; // Hauteur standard pour être au niveau de la porte
        
        // Calculer l'offset en fonction de la rotation et du type de bâtiment
        let offsetX = 0;
        let offsetZ = 0;
        
        if (isBuilding) {
            // Pour les immeubles, la porte est souvent sur l'aile latérale
            // Utiliser une heuristique basée sur l'angle pour déterminer la position de la porte
            offsetX = Math.sin(rotationY) * (buildingWidth / 3); // Décalage vers l'aile latérale
            offsetZ = Math.cos(rotationY) * (buildingDepth / 3);
        } else {
            // Pour les autres bâtiments, la porte est généralement au centre de la façade avant
            // Nous plaçons la flèche légèrement en avant du bâtiment pour qu'elle soit bien visible
            offsetX = Math.sin(rotationY) * (buildingWidth / 2 + 0.2);
            offsetZ = Math.cos(rotationY) * (buildingDepth / 2 + 0.2);
        }
        
        // Appliquer l'offset
        arrowMesh.position.x += offsetX;
        arrowMesh.position.z += offsetZ;
        
        // Rotation
        arrowMesh.rotation.y = rotationY;
        
        // Ajouter la flèche au groupe
        this.helpersGroup.add(arrowMesh);
        this.arrowHelpers.push(arrowMesh);*/
    }
    
    /**
     * Crée une géométrie de flèche personnalisée
     * @param {number} size - Taille de la flèche
     * @param {number} length - Longueur de la flèche
     * @returns {THREE.BufferGeometry} La géométrie de la flèche
     */
    createArrowGeometry(size, length) {
        // Points pour définir la flèche (pointe vers l'avant / +Z)
        const points = [
            new THREE.Vector3(0, 0, 0),             // Base arrière
            new THREE.Vector3(0, 0, length),        // Pointe avant
            new THREE.Vector3(size/2, 0, length - size),  // Aile droite
            new THREE.Vector3(-size/2, 0, length - size)  // Aile gauche
        ];
        
        // Faces de la flèche (triangles)
        const indices = [
            0, 2, 1,  // Triangle côté droit
            0, 1, 3,  // Triangle côté gauche
            0, 3, 2,  // Triangle base
            1, 2, 3   // Triangle de la pointe (dessous)
        ];
        
        // Créer la géométrie
        const geometry = new THREE.BufferGeometry();
        
        // Convertir les points en tableau Float32Array pour les positions
        const vertices = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            vertices[i * 3] = points[i].x;
            vertices[i * 3 + 1] = points[i].y;
            vertices[i * 3 + 2] = points[i].z;
        }
        
        // Ajouter les attributs à la géométrie
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        // Calculer les normales
        geometry.computeVertexNormals();
        
        return geometry;
    }
    
    /**
     * Basculer la visibilité des helpers
     * @param {boolean} isVisible - État de visibilité souhaité
     */
    toggleVisibility(isVisible = null) {
        if (isVisible === null) {
            this.isVisible = !this.isVisible;
        } else {
            this.isVisible = isVisible;
        }
        this.helpersGroup.visible = this.isVisible;
    }
    
    /**
     * Supprime tous les helpers
     */
    clearHelpers() {
        this.arrowHelpers.forEach(arrow => {
            if (arrow.geometry) arrow.geometry.dispose();
            this.helpersGroup.remove(arrow);
        });
        this.arrowHelpers = [];
    }
    
    /**
     * Nettoie les ressources à la destruction
     */
    dispose() {
        this.clearHelpers();
        if (this.arrowMaterial) this.arrowMaterial.dispose();
        if (this.scene && this.helpersGroup) {
            this.scene.remove(this.helpersGroup);
        }
    }
} 