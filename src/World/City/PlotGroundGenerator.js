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
        this.concreteTexture = this.createConcreteTexture();
        this.tileTexture = this.createTileTexture();

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
        canvas.width = 1024; // Augmentation de la résolution pour plus de détails
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Palette de couleurs vertes variées (du foncé au clair)
        const greenShades = [
            new THREE.Color(0x2a4e1a), // Vert très foncé
            new THREE.Color(0x3a5e2a), // Vert foncé
            new THREE.Color(0x4a6e3a), // Vert moyen foncé
            new THREE.Color(0x5a7e4a), // Vert moyen
            new THREE.Color(0x6a8e5a), // Vert moyen clair
            new THREE.Color(0x7a9e6a), // Vert clair
            new THREE.Color(0x8aae7a)  // Vert très clair
        ];

        // Couleur de base (vert moyen foncé)
        const baseColor = greenShades[2];
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Fonction pour dessiner un brin d'herbe individuel
        const drawGrassBlade = (x, y, length, width, angle, color) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            
            // Gradient pour le brin d'herbe (plus foncé à la base, plus clair au sommet)
            const gradient = ctx.createLinearGradient(0, 0, 0, -length);
            gradient.addColorStop(0, `rgb(${color.r * 255 * 0.7}, ${color.g * 255 * 0.7}, ${color.b * 255 * 0.7})`); // Base plus foncée
            gradient.addColorStop(0.6, `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`); // Couleur normale
            gradient.addColorStop(1, `rgb(${Math.min(255, color.r * 255 * 1.3)}, ${Math.min(255, color.g * 255 * 1.3)}, ${Math.min(255, color.b * 255 * 1.3)})`); // Sommet plus clair
            
            ctx.fillStyle = gradient;
            
            // Forme du brin d'herbe (légèrement courbe)
            ctx.beginPath();
            ctx.moveTo(-width/2, 0);
            ctx.quadraticCurveTo(-width/4, -length/2, 0, -length);
            ctx.quadraticCurveTo(width/4, -length/2, width/2, 0);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        };

        // Générer des milliers de brins d'herbe individuels
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            
            // Taille variable du brin d'herbe
            const length = 8 + Math.random() * 25;
            const width = 1 + Math.random() * 3;
            
            // Angle légèrement aléatoire pour un aspect naturel
            const angle = (Math.random() - 0.5) * 0.6; // Angle entre -0.3 et 0.3 radians
            
            // Sélection aléatoire d'une nuance de vert
            const colorIndex = Math.floor(Math.random() * greenShades.length);
            const grassColor = greenShades[colorIndex];
            
            drawGrassBlade(x, y, length, width, angle, grassColor);
        }

        // Ajouter des touffes d'herbe plus denses par endroits
        for (let i = 0; i < 150; i++) {
            const clusterX = Math.random() * canvas.width;
            const clusterY = Math.random() * canvas.height;
            const clusterSize = 20 + Math.random() * 40;
            const numBladesInCluster = 15 + Math.floor(Math.random() * 25);
            
            // Couleur dominante pour cette touffe
            const dominantColorIndex = Math.floor(Math.random() * greenShades.length);
            
            for (let j = 0; j < numBladesInCluster; j++) {
                const offsetX = (Math.random() - 0.5) * clusterSize;
                const offsetY = (Math.random() - 0.5) * clusterSize;
                const x = clusterX + offsetX;
                const y = clusterY + offsetY;
                
                // Vérifier que le brin reste dans les limites du canvas
                if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
                    const length = 10 + Math.random() * 20;
                    const width = 1.5 + Math.random() * 2.5;
                    const angle = (Math.random() - 0.5) * 0.8;
                    
                    // Utiliser la couleur dominante avec de légères variations
                    let colorIndex = dominantColorIndex;
                    if (Math.random() < 0.3) { // 30% de chance de variation
                        colorIndex = Math.max(0, Math.min(greenShades.length - 1, 
                            dominantColorIndex + (Math.random() < 0.5 ? -1 : 1)));
                    }
                    
                    drawGrassBlade(x, y, length, width, angle, greenShades[colorIndex]);
                }
            }
        }

        // Ajouter de la texture granuleuse de base avec de petits points
        for (let i = 0; i < 12000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 2 + 0.5;
            
            // Variation de couleur très subtile pour la granularité
            const colorIndex = Math.floor(Math.random() * greenShades.length);
            const pointColor = greenShades[colorIndex];
            
            ctx.fillStyle = `rgba(${pointColor.r * 255}, ${pointColor.g * 255}, ${pointColor.b * 255}, ${0.3 + Math.random() * 0.4})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ajouter quelques zones d'ombre plus foncées pour du réalisme
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 60 + 30;
            
            const shadowColor = greenShades[0]; // Utiliser le vert le plus foncé
            ctx.fillStyle = `rgba(${shadowColor.r * 255}, ${shadowColor.g * 255}, ${shadowColor.b * 255}, ${0.1 + Math.random() * 0.2})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(6, 6); // Augmentation de la répétition pour plus de détails
        return texture;
    }

    /**
     * Crée une texture procédurale pour simuler du béton
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createConcreteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Couleur de base du béton (plus foncée)
        const baseColor = new THREE.Color(0x909090);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ajouter des motifs géométriques
        const patternSize = 64;
        for (let y = 0; y < canvas.height; y += patternSize) {
            for (let x = 0; x < canvas.width; x += patternSize) {
                // Variation de couleur pour chaque motif (plus foncée)
                const variation = Math.random() * 30 - 15;
                const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
                const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
                const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                
                // Dessiner des formes géométriques variées
                const shapeType = Math.floor(Math.random() * 4);
                ctx.beginPath();
                
                switch (shapeType) {
                    case 0: // Rectangle
                        const width = patternSize * (0.6 + Math.random() * 0.4);
                        const height = patternSize * (0.6 + Math.random() * 0.4);
                        const offsetX = (patternSize - width) / 2;
                        const offsetY = (patternSize - height) / 2;
                        ctx.rect(x + offsetX, y + offsetY, width, height);
                        break;
                        
                    case 1: // Triangle
                        const size = patternSize * (0.6 + Math.random() * 0.4);
                        const centerX = x + patternSize / 2;
                        const centerY = y + patternSize / 2;
                        ctx.moveTo(centerX, centerY - size/2);
                        ctx.lineTo(centerX + size/2, centerY + size/2);
                        ctx.lineTo(centerX - size/2, centerY + size/2);
                        break;
                        
                    case 2: // Lignes croisées
                        const crossSize = patternSize * (0.6 + Math.random() * 0.4);
                        const crossCenterX = x + patternSize / 2;
                        const crossCenterY = y + patternSize / 2;
                        ctx.moveTo(crossCenterX - crossSize/2, crossCenterY);
                        ctx.lineTo(crossCenterX + crossSize/2, crossCenterY);
                        ctx.moveTo(crossCenterX, crossCenterY - crossSize/2);
                        ctx.lineTo(crossCenterX, crossCenterY + crossSize/2);
                        break;
                        
                    case 3: // Motif en échelle
                        const stepSize = patternSize * (0.6 + Math.random() * 0.4);
                        const stepWidth = stepSize / 4;
                        for (let i = 0; i < 4; i++) {
                            const stepX = x + (patternSize - stepSize) / 2 + i * stepWidth;
                            const stepY = y + (patternSize - stepSize) / 2;
                            ctx.rect(stepX, stepY, stepWidth, stepSize);
                        }
                        break;
                }
                
                ctx.closePath();
                ctx.fill();
            }
        }

        // Ajouter des lignes de jointure (plus foncées)
        ctx.strokeStyle = '#707070';
        ctx.lineWidth = 2;
        for (let y = patternSize; y < canvas.height; y += patternSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        for (let x = patternSize; x < canvas.width; x += patternSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Ajouter des fissures aléatoires (plus foncées)
        ctx.strokeStyle = '#606060';
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const startX = Math.random() * canvas.width;
            const startY = Math.random() * canvas.height;
            const length = Math.random() * 100 + 50;
            const angle = Math.random() * Math.PI * 2;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(
                startX + Math.cos(angle) * length,
                startY + Math.sin(angle) * length
            );
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        return texture;
    }

    /**
     * Crée une texture procédurale pour simuler du carrelage
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createTileTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Couleur de base du carrelage (gris foncé)
        const baseColor = new THREE.Color(0x808080);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Taille des carreaux
        const tileSize = 64;
        const jointWidth = 2;

        // Dessiner les joints (plus foncés)
        ctx.strokeStyle = '#606060';
        ctx.lineWidth = jointWidth;

        // Lignes horizontales
        for (let y = tileSize; y < canvas.height; y += tileSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Lignes verticales
        for (let x = tileSize; x < canvas.width; x += tileSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Dessiner les carreaux avec des variations
        for (let y = 0; y < canvas.height; y += tileSize) {
            for (let x = 0; x < canvas.width; x += tileSize) {
                // Variation de couleur pour chaque carreau (plus foncée)
                const variation = Math.random() * 30 - 15;
                const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
                const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
                const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(
                    x + jointWidth/2,
                    y + jointWidth/2,
                    tileSize - jointWidth,
                    tileSize - jointWidth
                );

                // Ajouter des motifs subtils sur certains carreaux
                if (Math.random() < 0.3) { // 30% de chance d'avoir un motif
                    const patternType = Math.floor(Math.random() * 3);
                    const centerX = x + tileSize/2;
                    const centerY = y + tileSize/2;
                    const patternSize = tileSize * 0.4;

                    // Motifs plus foncés
                    ctx.strokeStyle = `rgb(${r - 40}, ${g - 40}, ${b - 40})`;
                    ctx.lineWidth = 1;

                    switch (patternType) {
                        case 0: // Carré
                            const squareSize = patternSize * 0.8;
                            ctx.strokeRect(
                                centerX - squareSize/2,
                                centerY - squareSize/2,
                                squareSize,
                                squareSize
                            );
                            break;

                        case 1: // Croix
                            ctx.beginPath();
                            ctx.moveTo(centerX - patternSize/2, centerY);
                            ctx.lineTo(centerX + patternSize/2, centerY);
                            ctx.moveTo(centerX, centerY - patternSize/2);
                            ctx.lineTo(centerX, centerY + patternSize/2);
                            ctx.stroke();
                            break;

                        case 2: // Points
                            const numPoints = 4;
                            for (let i = 0; i < numPoints; i++) {
                                const angle = (i / numPoints) * Math.PI * 2;
                                const px = centerX + Math.cos(angle) * patternSize/2;
                                const py = centerY + Math.sin(angle) * patternSize/2;
                                ctx.beginPath();
                                ctx.arc(px, py, 2, 0, Math.PI * 2);
                                ctx.fill();
                            }
                            break;
                    }
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    }

    /**
     * Crée et retourne un groupe contenant les meshes de sol pour toutes les parcelles.
     * @param {Array<Plot>} plots - Tableau des parcelles finales (feuilles).
     * @returns {THREE.Group | null} Le groupe contenant les meshes de sol ou null si pas de parcelles.
     */
    generateGrounds(plots) {
        if (!plots || plots.length === 0) {
            //console.log("PlotGroundGenerator: No plots provided, skipping ground generation.");
            return null;
        }

        //console.log("PlotGroundGenerator: Generating plot ground meshes...");
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
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.grassTexture,
                        color: 0x61874c,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    break;
                case 'house':
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.lawnTexture,
                        color: 0x4a6e3a,        // Couleur plus sombre
                        roughness: 1.0,        // Rugosité maximale pour éliminer les reflets
                        metalness: 0.0,        // Aucune métallicité
                        transparent: false,     // Pas de transparence
                        emissive: 0x000000,    // Aucune émission de lumière
                        side: THREE.FrontSide, // Rendu seulement sur la face avant
                        flatShading: false,    // Ombrage lisse
                        fog: true              // Affecté par le brouillard
                    });
                    break;
                case 'building':
                    // Utiliser la texture de béton plus foncée pour les immeubles
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.concreteTexture,
                        color: 0x909090,
                        roughness: 0.9,
                        metalness: 0.0
                    });
                    break;
                case 'industrial':
                    // Utiliser la texture de béton pour les zones industrielles
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.concreteTexture,
                        color: 0xA0A0A0, // Un peu plus foncé pour les zones industrielles
                        roughness: 0.95, // Plus rugueux pour un aspect plus usé
                        metalness: 0.0
                    });
                    break;
                case 'skyscraper':
                    // Utiliser la texture de carrelage pour les gratte-ciels avec des couleurs plus foncées
                    groundMaterial = new THREE.MeshStandardMaterial({
                        map: this.tileTexture,
                        color: 0x808080,
                        roughness: 0.7,
                        metalness: 0.1
                    });
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

        //console.log(`PlotGroundGenerator: ${groundsCreated} ground meshes created and added to group.`);
        return groundGroup;
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}