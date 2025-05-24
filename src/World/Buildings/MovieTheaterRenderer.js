import * as THREE from 'three';

export default class MovieTheaterRenderer {
    /**
     * Constructeur pour le renderer de cinéma.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Matériaux partagés du projet.
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; 
        this.assetIdCounter = 0;

        // Matériau rouge émissif pour le cinéma
        this.localMaterials = {
            cinema: new THREE.MeshStandardMaterial({ 
                color: 0xff0000,
                emissive: 0x440000,
                emissiveIntensity: 0.3,
                name: "MovieTheaterMat",
                roughness: 0.7,
                metalness: 0.1
            })
        };

        console.log("MovieTheaterRenderer initialized with red emissive material.");
    }

    /**
     * Génère l'asset procédural pour un cinéma.
     * @param {number} baseWidth - Largeur cible (pour calcul scale).
     * @param {number} baseHeight - Hauteur cible.
     * @param {number} baseDepth - Profondeur cible.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur.
     * @param {number} [verticalScale=1] - Facteur de scale vertical.
     * @returns {object|null} L'asset généré {id, parts, fittingScaleFactor, ...} ou null.
     */
    generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1, verticalScale = 0.8) {
        // Ajuster les dimensions de base
        const defaultScaleMultiplier = 2;
        const adjustedBaseWidth = baseWidth * defaultScaleMultiplier;
        const adjustedBaseHeight = baseHeight * defaultScaleMultiplier * verticalScale;
        const adjustedBaseDepth = baseDepth * defaultScaleMultiplier;
        
        const buildingGroup = new THREE.Group();

        // Dimensions du cinéma (cube simple mais plus imposant qu'un commerce)
        const cinemaWidth = 6;
        const cinemaHeight = 4;
        const cinemaDepth = 5;

        // Appliquer le multiplicateur d'échelle
        const scale = defaultScaleMultiplier;
        const verticalScaleFactor = scale * verticalScale;

        const scaledWidth = cinemaWidth * scale;
        const scaledHeight = cinemaHeight * verticalScaleFactor;
        const scaledDepth = cinemaDepth * scale;

        // Créer le cube principal du cinéma
        const cinemaGeometry = new THREE.BoxGeometry(scaledWidth, scaledHeight, scaledDepth);
        const cinemaMesh = new THREE.Mesh(cinemaGeometry, this.localMaterials.cinema);
        cinemaMesh.position.set(0, baseHeight + scaledHeight / 2, 0);
        buildingGroup.add(cinemaMesh);

        // Calculer le facteur d'échelle pour l'ajustement
        const fittingScaleFactor = Math.min(
            adjustedBaseWidth / scaledWidth,
            adjustedBaseDepth / scaledDepth
        ) * userScale;

        // Créer les parties pour le système d'instancing
        const parts = [];
        buildingGroup.children.forEach((child, index) => {
            if (child.isMesh) {
                const part = {
                    id: `movietheater_part_${index}`,
                    geometry: child.geometry.clone(),
                    material: child.material,
                    position: child.position.clone(),
                    rotation: child.rotation.clone(),
                    scale: child.scale.clone()
                };
                parts.push(part);
            }
        });

        // Générer un ID unique pour cet asset
        const assetId = `movietheater_proc_${this.assetIdCounter++}`;

        const asset = {
            id: assetId,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            boundingBox: new THREE.Box3().setFromObject(buildingGroup),
            group: buildingGroup
        };

        // Nettoyage
        buildingGroup.clear();
        parts.forEach(part => {
            if (part.geometry) {
                part.geometry.dispose();
            }
        });

        return asset;
    }

    /**
     * Nettoie les ressources du renderer.
     */
    destroy() {
        // Disposer des matériaux
        Object.values(this.localMaterials).forEach(material => {
            if (material.map) material.map.dispose();
            material.dispose();
        });
        
        console.log("MovieTheaterRenderer resources cleaned up.");
    }
} 