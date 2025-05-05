// src/World/PlotGroundGenerator.js
import * as THREE from 'three';

/**
 * @typedef {import('./Plot.js').default} Plot
 */

/**
 * Génère les meshes représentant le sol pour chaque parcelle individuelle.
 */
export default class PlotGroundGenerator {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale (peut contenir plotGroundY).
     * @param {object} materials - Matériaux partagés (contient les matériaux de sol par type: parkMaterial, houseGroundMaterial, etc.).
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.grassTexture = this.createGrassTexture();
        this.lawnTexture = this.createLawnTexture();

        // Vérifier si les matériaux nécessaires existent (optionnel mais recommandé)
        const requiredMaterials = [
            'parkMaterial', 'houseGroundMaterial', 'buildingGroundMaterial',
            'industrialGroundMaterial', 'skyscraperGroundMaterial'
        ];
        requiredMaterials.forEach(matName => {
            if (!this.materials[matName]) {
                console.warn(`PlotGroundGenerator: Material '${matName}' not found in provided materials. Fallback or errors might occur.`);
                // Ajouter un fallback si nécessaire, ex:
                // this.materials[matName] = new THREE.MeshStandardMaterial({ color: 0x888888 });
            }
        });
    }

    /**
     * Crée une texture procédurale pour simuler l'herbe
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Couleur de base de l'herbe
        const baseColor = new THREE.Color(0x61874c);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ajouter des variations de couleur pour simuler des touffes d'herbe
        for (let i = 0; i < 200; i++) {
            // Position aléatoire
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            
            // Taille aléatoire
            const size = Math.random() * 20 + 10;
            
            // Variation de couleur (plus claire ou plus foncée)
            const variation = Math.random() * 40 - 20;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            // Dessiner une touffe d'herbe
            ctx.beginPath();
            const numBlades = 5 + Math.floor(Math.random() * 5);
            for (let j = 0; j < numBlades; j++) {
                const angle = (j / numBlades) * Math.PI * 2;
                const radius = size * (0.7 + Math.random() * 0.6);
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                
                if (j === 0) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.closePath();
            ctx.fill();
        }

        // Ajouter des taches plus foncées pour plus de variété
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 30 + 20;
            
            const darkVariation = -30;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + darkVariation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + darkVariation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + darkVariation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4); // Répéter la texture pour couvrir une plus grande surface
        return texture;
    }

    /**
     * Crée une texture procédurale pour simuler un gazon résidentiel
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createLawnTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Couleur de base du gazon (vert plus clair et plus vif)
        const baseColor = new THREE.Color(0x4CAF50);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ajouter des motifs de tonte (lignes alternées plus claires et plus foncées)
        const stripeWidth = 20;
        for (let y = 0; y < canvas.height; y += stripeWidth) {
            const isLightStripe = Math.floor(y / stripeWidth) % 2 === 0;
            const variation = isLightStripe ? 20 : -20;
            
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(0, y, canvas.width, stripeWidth);
        }

        // Ajouter des petites variations pour un aspect plus naturel
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 15 + 5;
            
            const variation = Math.random() * 30 - 15;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2); // Répétition plus faible pour un aspect plus uniforme
        return texture;
    }

    /**
     * Crée et retourne un groupe contenant les meshes de sol pour toutes les parcelles.
     * @param {Array<Plot>} plots - Tableau des parcelles finales (feuilles).
     * @returns {THREE.Group | null} Le groupe contenant les meshes de sol ou null si pas de parcelles.
     */
    generateGrounds(plots) {
        if (!plots || plots.length === 0) {
            console.log("PlotGroundGenerator: No plots provided, skipping ground generation.");
            return null;
        }

        console.log("PlotGroundGenerator: Generating plot ground meshes...");
        const groundGroup = new THREE.Group();
        groundGroup.name = "PlotGrounds"; // Nom du groupe pour débogage

        // Récupérer la hauteur Y du sol depuis la config (avec fallback)
        const groundY = this.config.plotGroundY ?? 0.005;
        let groundsCreated = 0;

        plots.forEach(plot => {
            // Créer la géométrie du plan
            const groundGeom = new THREE.PlaneGeometry(plot.width, plot.depth);

            // Sélectionner le matériau en fonction du type de zone
            let groundMaterial;
            switch (plot.zoneType) {
                case 'park':
                    // Créer un nouveau matériau avec la texture d'herbe pour les parcs
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.grassTexture,
                        color: 0x61874c,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    break;
                case 'house':
                    // Créer un nouveau matériau avec la texture de gazon pour les maisons
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.lawnTexture,
                        color: 0x4CAF50,
                        roughness: 0.7,
                        metalness: 0.0
                    });
                    break;
                case 'building':
                    groundMaterial = this.materials.buildingGroundMaterial;
                    break;
                case 'industrial':
                    groundMaterial = this.materials.industrialGroundMaterial;
                    break;
                case 'skyscraper':
                    groundMaterial = this.materials.skyscraperGroundMaterial;
                    break;
                case 'unbuildable':
                     // Pas de sol visible pour les zones non constructibles (ou un matériau différent)
                     groundGeom.dispose(); // Libérer la géométrie si non utilisée
                     return; // Passer à la parcelle suivante
                default:
                    console.warn(`PlotGroundGenerator: Plot ${plot.id} has unhandled zoneType ('${plot.zoneType}') for ground color. Using 'buildingGroundMaterial'.`);
                    groundMaterial = this.materials.buildingGroundMaterial;
            }

            // Vérifier si le matériau a été trouvé (au cas où le fallback n'est pas défini)
            if (!groundMaterial) {
                console.error(`PlotGroundGenerator: Material not found for zoneType '${plot.zoneType}' in plot ${plot.id}. Skipping ground mesh.`);
                groundGeom.dispose();
                return; // Passer à la parcelle suivante
            }

            // Créer le mesh
            const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);

            // Positionner et orienter le mesh
            groundMesh.rotation.x = -Math.PI / 2; // Orienter horizontalement
            // Utiliser le centre de la parcelle pour la position
            const plotCenter = plot.center; // Utilise le getter de Plot.js
            groundMesh.position.set(plotCenter.x, groundY, plotCenter.z);

            // Propriétés d'ombre et nom
            groundMesh.receiveShadow = true; // Le sol reçoit les ombres
            groundMesh.castShadow = false;   // Le sol ne projette pas d'ombres
            groundMesh.name = `Ground_Plot_${plot.id}_${plot.zoneType}`;

            // Ajouter au groupe
            groundGroup.add(groundMesh);
            groundsCreated++;
        }); // Fin boucle plots

        console.log(`PlotGroundGenerator: ${groundsCreated} ground meshes created and added to group.`);
        return groundGroup;
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}