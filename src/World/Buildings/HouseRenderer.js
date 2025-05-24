// src/World/HouseRenderer.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class HouseRenderer {
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        // Initialisation des références spécifiques aux maisons
        this.baseHouseGeometries = {};
        this.baseHouseMaterials = {};
        this.houseInstanceMatrices = {};
        this.assetIdCounter = 0; // Compteur pour générer des IDs uniques pour les maisons procédurales
        
        // Création des textures partagées pour le toit
        this.sharedRoofTexture = this.createRoofTexture(256, 256);
        this.sharedRoofNormalMap = this.createRoofNormalMap(256, 256);
        this.sharedRoofRoughnessMap = this.createRoofRoughnessMap(256, 256);
        
        // Création de la texture de briques
        this.sharedBrickTexture = this.createBrickTexture(512, 512);
        this.sharedBrickNormalMap = this.createBrickNormalMap(512, 512);
        this.sharedBrickRoughnessMap = this.createBrickRoughnessMap(512, 512);
        
        this.defineHouseBaseMaterials();
        this.defineHouseBaseGeometries();
        this.initializeHouseMatrixArrays();
    }

    /**
     * Initialise les tableaux de matrices d'instances pour chaque partie de la maison.
     */
    initializeHouseMatrixArrays() {
        this.houseInstanceMatrices = {
            wall: [],
            roof: [],
            door: [],
            garageDoor: [],
            windowFrameSide: [],
            windowFrameTopBot: [],
            windowFrameVerticalCenter: [],
            windowFrameHorizontalCenter: [],
            windowPane: []
            // Ajoutez d'autres parties si nécessaire
        };
    }

    /**
     * Crée une texture de toit procédurale dans un style cartoon
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.Texture} - Texture générée
     */
    createRoofTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Fond de base
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(0, 0, width, height);
        
        // Dessin des tuiles dans un style cartoon
        const tileWidth = width / 8;
        const tileHeight = height / 8;
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                // Décalage alterné pour l'effet de tuiles
                const offsetX = (y % 2 === 0) ? 0 : tileWidth / 2;
                
                // Dessin d'une tuile
                ctx.fillStyle = '#A0522D'; // Couleur plus claire pour la tuile
                ctx.beginPath();
                ctx.moveTo(x * tileWidth + offsetX, y * tileHeight);
                ctx.lineTo(x * tileWidth + tileWidth + offsetX, y * tileHeight);
                ctx.lineTo(x * tileWidth + tileWidth + offsetX, y * tileHeight + tileHeight);
                ctx.lineTo(x * tileWidth + offsetX, y * tileHeight + tileHeight);
                ctx.closePath();
                ctx.fill();
                
                // Contour de la tuile
                ctx.strokeStyle = '#5D2906'; // Couleur plus foncée pour le contour
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
        
        // Création de la texture Three.js
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        
        return texture;
    }

    /**
     * Crée une normal map procédurale pour le toit dans un style cartoon
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.Texture} - Texture générée
     */
    createRoofNormalMap(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Fond de base (bleu = plat)
        ctx.fillStyle = '#8080FF';
        ctx.fillRect(0, 0, width, height);
        
        // Dessin des tuiles dans un style cartoon
        const tileWidth = width / 8;
        const tileHeight = height / 8;
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                // Décalage alterné pour l'effet de tuiles
                const offsetX = (y % 2 === 0) ? 0 : tileWidth / 2;
                
                // Dessin d'une tuile avec effet de relief
                // Rouge = déviation vers la droite, Vert = déviation vers le haut
                ctx.fillStyle = '#8080FF'; // Bleu = plat
                ctx.beginPath();
                ctx.moveTo(x * tileWidth + offsetX, y * tileHeight);
                ctx.lineTo(x * tileWidth + tileWidth + offsetX, y * tileHeight);
                ctx.lineTo(x * tileWidth + tileWidth + offsetX, y * tileHeight + tileHeight);
                ctx.lineTo(x * tileWidth + offsetX, y * tileHeight + tileHeight);
                ctx.closePath();
                ctx.fill();
                
                // Contour de la tuile avec effet de relief
                ctx.strokeStyle = '#6060FF'; // Bleu plus foncé = légère élévation
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
        
        // Création de la texture Three.js
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        
        return texture;
    }

    /**
     * Crée une roughness map procédurale pour le toit dans un style cartoon
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.Texture} - Texture générée
     */
    createRoofRoughnessMap(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Fond de base (gris moyen = rugosité moyenne)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, width, height);
        
        // Dessin des tuiles dans un style cartoon
        const tileWidth = width / 8;
        const tileHeight = height / 8;
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                // Décalage alterné pour l'effet de tuiles
                const offsetX = (y % 2 === 0) ? 0 : tileWidth / 2;
                
                // Contour de la tuile avec rugosité différente
                ctx.strokeStyle = '#606060'; // Gris plus foncé = plus rugueux
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    x * tileWidth + offsetX, 
                    y * tileHeight, 
                    tileWidth, 
                    tileHeight
                );
            }
        }
        
        // Création de la texture Three.js
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        
        return texture;
    }

    /**
     * Crée une texture de briques procédurale
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.Texture} - Texture générée
     */
    createBrickTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Couleurs de base pour les briques (réduites à deux variations)
        const baseBrickColor = '#8B6B5D';  // Couleur principale des briques (plus grisée)
        const darkerBrickColor = '#7B5B4D'; // Couleur plus foncée pour certaines briques (moins foncée)
        const mortarColor = '#4A2C2A'; // Mortier plus foncé pour plus de contraste
        
        // Dimensions des briques (augmentées)
        const brickWidth = width / 6;  // Réduit de 8 à 6 pour des briques plus grandes
        const brickHeight = height / 3;  // Réduit de 4 à 3 pour des briques plus grandes
        const mortarWidth = 2;  // Réduit de 3 à 2 pour un mortier plus fin
        
        // Fond de base (mortier)
        ctx.fillStyle = mortarColor;
        ctx.fillRect(0, 0, width, height);
        
        // Dessin des briques avec irrégularités
        for (let y = 0; y < 3; y++) {
            // Décalage alterné pour l'effet de briques
            const offsetX = (y % 2 === 0) ? 0 : brickWidth / 2;
            
            for (let x = 0; x < 6; x++) {
                // Sélection aléatoire de la couleur de brique (20% de chance d'être plus foncée)
                const brickColor = Math.random() < 0.2 ? darkerBrickColor : baseBrickColor;
                ctx.fillStyle = brickColor;
                
                // Ajouter des irrégularités aléatoires à la taille et position
                const randomOffsetX = (Math.random() - 0.5) * 2; // -1 à 1
                const randomOffsetY = (Math.random() - 0.5) * 2; // -1 à 1
                const randomWidth = brickWidth - mortarWidth + (Math.random() - 0.5) * 2;
                const randomHeight = brickHeight - mortarWidth + (Math.random() - 0.5) * 2;
                
                ctx.fillRect(
                    x * brickWidth + offsetX + mortarWidth/2 + randomOffsetX,
                    y * brickHeight + mortarWidth/2 + randomOffsetY,
                    randomWidth,
                    randomHeight
                );
                
                // Ajouter des variations de texture à l'intérieur des briques
                ctx.strokeStyle = mortarColor;
                ctx.lineWidth = 1;
                const numLines = Math.floor(Math.random() * 2) + 1; // 1 à 2 lignes par brique
                for (let i = 0; i < numLines; i++) {
                    const startX = x * brickWidth + offsetX + mortarWidth/2 + randomOffsetX;
                    const startY = y * brickHeight + mortarWidth/2 + randomOffsetY + (i + 1) * randomHeight / (numLines + 1);
                    const endX = startX + randomWidth;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, startY);
                    ctx.stroke();
                }
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Suppression de la répétition par défaut
        texture.repeat.set(1, 1);
        
        return texture;
    }

    /**
     * Crée une normal map pour les briques
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.Texture} - Texture générée
     */
    createBrickNormalMap(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Fond de base (bleu = plat)
        ctx.fillStyle = '#8080FF';
        ctx.fillRect(0, 0, width, height);
        
        // Dimensions des briques (légèrement plus petites)
        const brickWidth = width / 8;  // Ajusté pour correspondre à la texture
        const brickHeight = height / 4;  // Ajusté pour correspondre à la texture
        const mortarWidth = 3;  // Ajusté pour correspondre à la texture
        
        // Dessin des briques avec effet de relief
        for (let y = 0; y < 4; y++) {
            const offsetX = (y % 2 === 0) ? 0 : brickWidth / 2;
            
            for (let x = 0; x < 8; x++) {
                // Légère élévation pour les briques
                ctx.fillStyle = '#A0A0FF';
                ctx.fillRect(
                    x * brickWidth + offsetX + mortarWidth/2,
                    y * brickHeight + mortarWidth/2,
                    brickWidth - mortarWidth,
                    brickHeight - mortarWidth
                );
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
        
        return texture;
    }

    /**
     * Crée une roughness map pour les briques
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.Texture} - Texture générée
     */
    createBrickRoughnessMap(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Fond de base (gris moyen = rugosité moyenne)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, width, height);
        
        // Dimensions des briques (légèrement plus petites)
        const brickWidth = width / 8;  // Ajusté pour correspondre à la texture
        const brickHeight = height / 4;  // Ajusté pour correspondre à la texture
        const mortarWidth = 3;  // Ajusté pour correspondre à la texture
        
        // Dessin des briques avec rugosité différente
        for (let y = 0; y < 4; y++) {
            const offsetX = (y % 2 === 0) ? 0 : brickWidth / 2;
            
            for (let x = 0; x < 8; x++) {
                // Briques plus rugueuses que le mortier
                ctx.fillStyle = '#606060';
                ctx.fillRect(
                    x * brickWidth + offsetX + mortarWidth/2,
                    y * brickHeight + mortarWidth/2,
                    brickWidth - mortarWidth,
                    brickHeight - mortarWidth
                );
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
        
        return texture;
    }

    /**
     * Définit les matériaux de base utilisés pour les différentes parties de la maison.
     */
    defineHouseBaseMaterials() {
        const facadeColor = 0xd7ceae;
        const roofColor = 0x8B4513;
        const doorColor = 0x4a2c2a;
        const garageDoorColor = 0xd3d3d3;
        const windowFrameColor = 0x8b4513;
        const windowPaneColor = 0xadd8e6;

        this.baseHouseMaterials = {};

        // Configuration de la répétition de texture pour les murs
        this.sharedBrickTexture.repeat.set(2, 2);
        this.sharedBrickNormalMap.repeat.set(2, 2);
        this.sharedBrickRoughnessMap.repeat.set(2, 2);

        // Matériaux des murs avec texture de briques
        this.baseHouseMaterials.base_part1 = new THREE.MeshStandardMaterial({
            color: facadeColor,
            roughness: 0.8,
            metalness: 0.0,
            name: "HouseBase1Mat",
            map: this.sharedBrickTexture,
            normalMap: this.sharedBrickNormalMap,
            normalScale: new THREE.Vector2(0.5, 0.5),
            roughnessMap: this.sharedBrickRoughnessMap
        });
        
        // Utilisation du même matériau pour base_part2
        this.baseHouseMaterials.base_part2 = this.baseHouseMaterials.base_part1;
        
        // Utilisation des textures partagées pour le toit
        this.baseHouseMaterials.roof = new THREE.MeshStandardMaterial({
            color: roofColor, 
            roughness: 0.9,
            metalness: 0.0,
            name: "HouseRoofMat",
            side: THREE.DoubleSide,
            map: this.sharedRoofTexture,
            normalMap: this.sharedRoofNormalMap,
            normalScale: new THREE.Vector2(0.9, 0.9),
            roughnessMap: this.sharedRoofRoughnessMap
        });
        
        this.baseHouseMaterials.door = new THREE.MeshStandardMaterial({
            color: doorColor, roughness: 0.7, name: "HouseDoorMat"
        });
        this.baseHouseMaterials.garageDoor = new THREE.MeshStandardMaterial({
            color: garageDoorColor, roughness: 0.2, metalness: 0.6, name: "HouseGarageDoorMat"
        });
        
        // Nouveau matériau pour les cadres de fenêtres
        this.baseHouseMaterials.windowFrame = new THREE.MeshStandardMaterial({
            color: windowFrameColor, 
            roughness: 0.8, 
            metalness: 0.0, 
            name: "HouseWindowFrameMat"
        });
        
        // Nouveau matériau pour les vitres
        this.baseHouseMaterials.windowPane = new THREE.MeshStandardMaterial({
            color: windowPaneColor, 
            roughness: 0.3, 
            metalness: 0.4,
            transparent: true, 
            opacity: 0.6, 
            name: "HouseWindowPaneMat",
            emissive: new THREE.Color(0xFFFF99),
            emissiveIntensity: 0.0
        });
        
        // Matériau pour le marqueur de porte
        /*this.baseHouseMaterials.doorMarker = new THREE.MeshBasicMaterial({
            color: 0x4dabf5,
            emissive: 0x4dabf5,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8,
            name: "HouseDoorMarkerMat"
        });*/
    }

    /**
     * Définit les géométries de base pour les différentes parties de la maison.
     * Notez que l'épaisseur (doorDepth / windowDepth) a été réduite.
     */
    defineHouseBaseGeometries() {
        this.baseHouseGeometries = {};
    
        // --- Dimensions de base ---
        const armLength = 2;
        const armWidth = 1;
        const armDepth = 0.5 * 1.1;
        const roofPitchHeight = 0.3 * 1.1;
        const roofOverhang = 0.08;
        const doorHeight = 0.7 * armDepth;
        const doorWidth = 0.3;
        const doorDepth = 0.02;
        const garageDoorHeight = 0.8 * armDepth;
        const garageDoorWidth = 0.55;
        
        // Dimensions des fenêtres avec cadres détaillés
        const frameWidth = 0.2;
        const frameHeight = 0.4 * armDepth;
        const frameDepth = 0.01;
        const barThickness = 0.015;
    
        // Ajout d'un petit décalage pour éviter le z-fighting
        const zFightingOffset = 0.001; // Petit décalage de 1mm
    
        // --- Géométries de base ---
        this.baseHouseGeometries.base_part1 = new THREE.BoxGeometry(armLength, armDepth, armWidth);
        this.baseHouseGeometries.base_part1.translate(armLength / 2, armDepth / 2, armWidth / 2 + zFightingOffset);
        this.baseHouseGeometries.base_part2 = new THREE.BoxGeometry(armWidth, armDepth, armLength);
        this.baseHouseGeometries.base_part2.translate(armWidth / 2, armDepth / 2, armLength / 2 - zFightingOffset);
        this.baseHouseGeometries.base_part1.userData = { height: armDepth, minY: 0 };
        this.baseHouseGeometries.base_part2.userData = { height: armDepth, minY: 0 };

        // --- Géométries pour les portes ---
        this.baseHouseGeometries.door = new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth);
        this.baseHouseGeometries.garageDoor = new THREE.BoxGeometry(doorDepth, garageDoorHeight, garageDoorWidth);

        // --- Géométries pour les cadres de fenêtres ---
        // Barres latérales du cadre
        this.baseHouseGeometries.windowFrameSide = new THREE.BoxGeometry(barThickness, frameHeight, frameDepth);
        
        // Barres horizontales du cadre (haut et bas)
        this.baseHouseGeometries.windowFrameTopBot = new THREE.BoxGeometry(frameWidth, barThickness, frameDepth);
        
        // Barre verticale centrale
        this.baseHouseGeometries.windowFrameVerticalCenter = new THREE.BoxGeometry(barThickness, frameHeight - barThickness * 2, frameDepth * 0.8);
        
        // Barre horizontale centrale  
        this.baseHouseGeometries.windowFrameHorizontalCenter = new THREE.BoxGeometry(frameWidth - barThickness * 2, barThickness, frameDepth * 0.8);
        
        // Vitre (plane)
        this.baseHouseGeometries.windowPane = new THREE.PlaneGeometry(frameWidth - barThickness * 2, frameHeight - barThickness * 2);

        // --- Géométrie du toit épaissi ---
        const roofWidth = armWidth + 2 * roofOverhang;
        const roofDepth = armLength + 2 * roofOverhang;
        const roofHeight = roofPitchHeight;
        const halfRoofWidth = roofWidth / 2;
        const halfRoofDepth = roofDepth / 2;
        const roofThickness = 0.05;
        const roofGeometry = new THREE.BufferGeometry();
        
        // Ajout d'un décalage aux extrémités pour éviter le z-fighting
        const edgeOffset = 0.02;
        
        // Approche simplifiée : créer des faces distinctes pour le haut et le bas du toit
        // sans essayer de les connecter directement
        
        // Sommets pour le haut du toit
        const topVertices = [
            // Face avant
            -halfRoofWidth + edgeOffset, 0, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, 0, -halfRoofDepth + edgeOffset,
            0, roofHeight, -halfRoofDepth + edgeOffset,
            
            // Face arrière
            -halfRoofWidth + edgeOffset, 0, halfRoofDepth - edgeOffset,
            halfRoofWidth - edgeOffset, 0, halfRoofDepth - edgeOffset,
            0, roofHeight, halfRoofDepth - edgeOffset,
            
            // Face gauche
            -halfRoofWidth + edgeOffset, 0, -halfRoofDepth + edgeOffset,
            -halfRoofWidth + edgeOffset, 0, halfRoofDepth - edgeOffset,
            0, roofHeight, -halfRoofDepth + edgeOffset,
            0, roofHeight, halfRoofDepth - edgeOffset,
            
            // Face droite
            halfRoofWidth - edgeOffset, 0, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, 0, halfRoofDepth - edgeOffset,
            0, roofHeight, -halfRoofDepth + edgeOffset,
            0, roofHeight, halfRoofDepth - edgeOffset,
            
            // Face inférieure avant
            -halfRoofWidth + edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            0, roofHeight - roofThickness, -halfRoofDepth + edgeOffset,
            
            // Face inférieure arrière
            -halfRoofWidth + edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            0, roofHeight - roofThickness, halfRoofDepth - edgeOffset,
            
            // Face inférieure gauche
            -halfRoofWidth + edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            -halfRoofWidth + edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            0, roofHeight - roofThickness, -halfRoofDepth + edgeOffset,
            0, roofHeight - roofThickness, halfRoofDepth - edgeOffset,
            
            // Face inférieure droite
            halfRoofWidth - edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            0, roofHeight - roofThickness, -halfRoofDepth + edgeOffset,
            0, roofHeight - roofThickness, halfRoofDepth - edgeOffset,
            
            // Faces latérales pour l'épaisseur
            // Face latérale avant gauche
            -halfRoofWidth + edgeOffset, 0, -halfRoofDepth + edgeOffset,
            -halfRoofWidth + edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            0, roofHeight, -halfRoofDepth + edgeOffset,
            0, roofHeight - roofThickness, -halfRoofDepth + edgeOffset,
            
            // Face latérale avant droite
            halfRoofWidth - edgeOffset, 0, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            0, roofHeight, -halfRoofDepth + edgeOffset,
            0, roofHeight - roofThickness, -halfRoofDepth + edgeOffset,
            
            // Face latérale arrière gauche
            -halfRoofWidth + edgeOffset, 0, halfRoofDepth - edgeOffset,
            -halfRoofWidth + edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            0, roofHeight, halfRoofDepth - edgeOffset,
            0, roofHeight - roofThickness, halfRoofDepth - edgeOffset,
            
            // Face latérale arrière droite
            halfRoofWidth - edgeOffset, 0, halfRoofDepth - edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            0, roofHeight, halfRoofDepth - edgeOffset,
            0, roofHeight - roofThickness, halfRoofDepth - edgeOffset,
            
            // Face latérale gauche avant
            -halfRoofWidth + edgeOffset, 0, -halfRoofDepth + edgeOffset,
            -halfRoofWidth + edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            -halfRoofWidth + edgeOffset, 0, halfRoofDepth - edgeOffset,
            -halfRoofWidth + edgeOffset, -roofThickness, halfRoofDepth - edgeOffset,
            
            // Face latérale droite avant
            halfRoofWidth - edgeOffset, 0, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, -halfRoofDepth + edgeOffset,
            halfRoofWidth - edgeOffset, 0, halfRoofDepth - edgeOffset,
            halfRoofWidth - edgeOffset, -roofThickness, halfRoofDepth - edgeOffset
        ];
        
        // Indices pour les triangles
        const indices = [];
        
        // Fonction pour ajouter un triangle à partir de trois indices
        const addTriangle = (a, b, c) => {
            indices.push(a, b, c);
        };
        
        // Fonction pour ajouter un quad (deux triangles) à partir de quatre indices
        const addQuad = (a, b, c, d) => {
            addTriangle(a, b, c);
            addTriangle(a, c, d);
        };
        
        // Face avant (triangle)
        addTriangle(0, 1, 2);
        
        // Face arrière (triangle)
        addTriangle(3, 4, 5);
        
        // Face gauche (quad)
        addQuad(6, 7, 9, 8);
        
        // Face droite (quad)
        addQuad(10, 11, 13, 12);
        
        // Face inférieure avant (triangle)
        addTriangle(14, 15, 16);
        
        // Face inférieure arrière (triangle)
        addTriangle(17, 18, 19);
        
        // Face inférieure gauche (quad)
        addQuad(20, 21, 23, 22);
        
        // Face inférieure droite (quad)
        addQuad(24, 25, 27, 26);
        
        // Faces latérales pour l'épaisseur
        // Face latérale avant gauche
        addQuad(28, 29, 31, 30);
        
        // Face latérale avant droite
        addQuad(32, 33, 35, 34);
        
        // Face latérale arrière gauche
        addQuad(36, 37, 39, 38);
        
        // Face latérale arrière droite
        addQuad(40, 41, 43, 42);
        
        // Face latérale gauche avant
        addQuad(44, 45, 47, 46);
        
        // Face latérale droite avant
        addQuad(48, 49, 51, 50);
        
        const allVertices = new Float32Array(topVertices);
        const allIndices = new Uint16Array(indices);
        
        roofGeometry.setAttribute('position', new THREE.BufferAttribute(allVertices, 3));
        roofGeometry.setIndex(new THREE.BufferAttribute(allIndices, 1));
        roofGeometry.computeVertexNormals();
        
        // Calcul des coordonnées UV
        const uvs = [];
        for (let i = 0; i < allVertices.length / 3; i++) {
            const x = allVertices[i * 3];
            const z = allVertices[i * 3 + 2];
            uvs.push((x / roofWidth) + 0.5, (z / roofDepth) + 0.5);
        }
        roofGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        
        this.baseHouseGeometries.roof = roofGeometry;
    }

    /**
     * Crée une fenêtre détaillée avec cadre et vitre.
     * @param {number} x - Position X locale
     * @param {number} y - Position Y locale  
     * @param {number} z - Position Z locale
     * @param {number} rotY - Rotation Y en radians
     * @returns {object} Un objet contenant les matrices pour chaque partie de la fenêtre
     */
    createDetailedWindow(x, y, z, rotY = 0) {
        const frameWidth = 0.2;
        const frameHeight = 0.4 * (0.5 * 1.1); // armDepth
        const frameDepth = 0.02;
        const barThickness = 0.015;
        
        const windowParts = {
            windowFrameSide: [],
            windowFrameTopBot: [],
            windowFrameVerticalCenter: [],
            windowFrameHorizontalCenter: [],
            windowPane: []
        };

        // Créer une matrice de base pour la position et rotation de la fenêtre
        const baseTransform = new THREE.Matrix4()
            .makeRotationY(rotY)
            .setPosition(x, y, z);

        // Barre gauche du cadre
        const leftBarMatrix = new THREE.Matrix4()
            .makeTranslation(-frameWidth / 2 + barThickness / 2, 0, 0)
            .premultiply(baseTransform);
        windowParts.windowFrameSide.push(leftBarMatrix);

        // Barre droite du cadre
        const rightBarMatrix = new THREE.Matrix4()
            .makeTranslation(frameWidth / 2 - barThickness / 2, 0, 0)
            .premultiply(baseTransform);
        windowParts.windowFrameSide.push(rightBarMatrix);

        // Barre haute du cadre
        const topBarMatrix = new THREE.Matrix4()
            .makeTranslation(0, frameHeight / 2 - barThickness / 2, 0)
            .premultiply(baseTransform);
        windowParts.windowFrameTopBot.push(topBarMatrix);

        // Barre basse du cadre
        const bottomBarMatrix = new THREE.Matrix4()
            .makeTranslation(0, -frameHeight / 2 + barThickness / 2, 0)
            .premultiply(baseTransform);
        windowParts.windowFrameTopBot.push(bottomBarMatrix);

        // Barre verticale centrale
        const verticalCenterMatrix = new THREE.Matrix4()
            .makeTranslation(0, 0, -frameDepth * 0.1)
            .premultiply(baseTransform);
        windowParts.windowFrameVerticalCenter.push(verticalCenterMatrix);

        // Barre horizontale centrale
        const horizontalCenterMatrix = new THREE.Matrix4()
            .makeTranslation(0, 0, -frameDepth * 0.1)
            .premultiply(baseTransform);
        windowParts.windowFrameHorizontalCenter.push(horizontalCenterMatrix);

        // Vitre
        const paneMatrix = new THREE.Matrix4()
            .makeTranslation(0, 0, -frameDepth / 2 + 0.005)
            .premultiply(baseTransform);
        windowParts.windowPane.push(paneMatrix);

        return windowParts;
    }

    /**
     * Génère les matrices d'instances pour une maison et retourne un objet
     * dont les clés correspondent aux parties de la maison et les valeurs à des tableaux de matrices.
     *
     * @param {THREE.Vector3} worldCellCenterPos - Centre de la cellule de grille où placer la maison.
     * @param {number} groundLevel - Position Y du sol.
     * @param {number} targetRotationY - Rotation (en radians) autour de l'axe Y.
     * @param {number} baseScaleFactor - Facteur d'échelle appliqué.
     * @returns {object} Un objet contenant les données d'instances pour chaque partie.
     */
    generateHouseInstance(worldCellCenterPos, groundLevel, targetRotationY, baseScaleFactor) {
        const armLength = 2;
        const armWidth = 1;
        const armDepth = 0.5 * 1.1;
        const doorHeight = 0.7 * armDepth;
        const doorDepth = 0.02;
        const doorWidth = 0.3;
        const garageDoorHeight = 0.8 * armDepth;
        const garageDoorWidth = 0.55;
        const windowHeight = 0.4 * armDepth;
        const windowDepth = doorDepth;
        const window_Y_pos_Base = armDepth * 0.3;

        const finalScaleVector = new THREE.Vector3(baseScaleFactor, baseScaleFactor, baseScaleFactor);
        const finalPosY = groundLevel - 0.35;
        const modelCenterLocal = new THREE.Vector3(armLength / 2, armDepth / 2, armLength / 2);
        const centerOffsetRotated = modelCenterLocal.clone().applyQuaternion(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY)
        );
        const centerOffsetScaledRotated = centerOffsetRotated.multiplyScalar(baseScaleFactor);
        const finalPosition = new THREE.Vector3(
            worldCellCenterPos.x - centerOffsetScaledRotated.x,
            finalPosY,
            worldCellCenterPos.z - centerOffsetScaledRotated.z
        );
        const globalHouseMatrix = new THREE.Matrix4().compose(
            finalPosition,
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY),
            finalScaleVector
        );

        const houseInstanceData = {};

        // Fonction interne d'ajout d'une partie
        const addPartInstance = (partName, localMatrix) => {
            if (!houseInstanceData[partName]) {
                houseInstanceData[partName] = [];
            }
            if (this.baseHouseGeometries[partName]) {
                const finalMatrix = new THREE.Matrix4().multiplyMatrices(globalHouseMatrix, localMatrix);
                houseInstanceData[partName].push(finalMatrix.clone());
            } else {
                console.warn(`Géométrie maison manquante: ${partName}`);
            }
        };

        // Fonction interne pour ajouter une partie fenêtre
        const addWindowPart = (geomKey, facadeCoordX, facadeCoordZ, yBase, isYZPlane) => {
            const yCenter = yBase + windowHeight / 2;
            const localMatrix = new THREE.Matrix4().makeTranslation(facadeCoordX, yCenter, facadeCoordZ);
            addPartInstance(geomKey, localMatrix);
        };

        // Ajout des parties de base
        addPartInstance('base_part1', new THREE.Matrix4());
        addPartInstance('base_part2', new THREE.Matrix4());

        const roofBaseY = armDepth;
        const roofPos1 = new THREE.Vector3(armLength / 2, roofBaseY, armWidth / 2);
        const roofPos2 = new THREE.Vector3(armWidth / 2, roofBaseY, armLength / 2);
        const roofRot1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        const roofRot2 = new THREE.Quaternion();
        let localMatrix = new THREE.Matrix4().compose(roofPos1, roofRot1, new THREE.Vector3(1, 1, 1));
        addPartInstance('roof', localMatrix);
        localMatrix = new THREE.Matrix4().compose(roofPos2, roofRot2, new THREE.Vector3(1, 1, 1));
        addPartInstance('roof', localMatrix);

        const doorPos = new THREE.Vector3(armWidth, doorHeight / 2, armLength * 0.75);
        addPartInstance('door', new THREE.Matrix4().makeTranslation(doorPos.x, doorPos.y, doorPos.z));
        
        const garagePos = new THREE.Vector3(armLength, garageDoorHeight / 2, armWidth / 2);
        addPartInstance('garageDoor', new THREE.Matrix4().makeTranslation(garagePos.x, garagePos.y, garagePos.z));

        // Ajout des fenêtres détaillées avec cadres
        const frameHeight = 0.4 * armDepth;
        const windowY = armDepth * 0.3 + frameHeight / 2;
        const windowOffset = 0.01; // Décalage par rapport à la surface du mur

        // Fonction helper pour ajouter une fenêtre complète
        const addDetailedWindow = (x, y, z, rotY = 0) => {
            const windowParts = this.createDetailedWindow(x, y, z, rotY);
            // Ajouter chaque partie de la fenêtre aux matrices d'instances
            Object.keys(windowParts).forEach(partKey => {
                if (!houseInstanceData[partKey]) {
                    houseInstanceData[partKey] = [];
                }
                // Appliquer la matrice globale de la maison à chaque matrice de fenêtre
                windowParts[partKey].forEach(localMatrix => {
                    const finalMatrix = new THREE.Matrix4().multiplyMatrices(globalHouseMatrix, localMatrix);
                    houseInstanceData[partKey].push(finalMatrix);
                });
            });
        };

        // Fenêtres sur les faces avant et arrière (plan XY)
        addDetailedWindow(0.25, windowY, armWidth + windowOffset, 0);
        addDetailedWindow(0.75, windowY, armWidth + windowOffset, 0);
        addDetailedWindow(1.25, windowY, armWidth + windowOffset, 0);
        addDetailedWindow(1.75, windowY, armWidth + windowOffset, 0);
        addDetailedWindow(0.25, windowY, -windowOffset, Math.PI);
        addDetailedWindow(0.75, windowY, -windowOffset, Math.PI);
        addDetailedWindow(1.25, windowY, -windowOffset, Math.PI);
        addDetailedWindow(1.75, windowY, -windowOffset, Math.PI);

        // Fenêtres sur les côtés (plan YZ)
        addDetailedWindow(-windowOffset, windowY, 0.25, -Math.PI / 2);
        addDetailedWindow(-windowOffset, windowY, 0.75, -Math.PI / 2);
        addDetailedWindow(armWidth + windowOffset, windowY, 0.25, Math.PI / 2);
        addDetailedWindow(armWidth + windowOffset, windowY, 0.75, Math.PI / 2);
        
        // Fenêtres à côté de la porte (en évitant la zone de la porte)
        const doorEdgeLeft = armLength * 0.75 - doorWidth / 2;
        const doorEdgeRight = armLength * 0.75 + doorWidth / 2;
        addDetailedWindow(armWidth + windowOffset, windowY, (armWidth + doorEdgeLeft) / 2, Math.PI / 2);
        addDetailedWindow(armWidth + windowOffset, windowY, (doorEdgeRight + armLength) / 2, Math.PI / 2);

        return houseInstanceData;
    }

    /**
     * Crée les InstancedMesh pour les parties de la maison et les ajoute au groupe fourni.
     *
     * @param {object} instanceData - Objet associant les noms de partie à des tableaux de matrices.
     * @param {THREE.Group} houseGroup - Groupe dans lequel ajouter les InstancedMesh.
     * @param {object} experience - (Optionnel) Permet d'accéder par exemple à l'environnement de la scène.
     */
    createInstancedMeshes(instanceData, houseGroup, experience) {
        let instancedMeshCount = 0;

        for (const partName in instanceData) {
            if (instanceData.hasOwnProperty(partName)) {
                const matrices = instanceData[partName];
                const geometry = this.baseHouseGeometries[partName];
                let material = null;
                const isHouseWindowPart = (partName.startsWith('windowFrame') || partName === 'windowPane');

                if (isHouseWindowPart) {
                    if (partName === 'windowPane') {
                        material = this.baseHouseMaterials.windowPane.clone();
                        material.name = `HouseWindowPaneMat_Inst_${partName}`;
                        material.emissive = new THREE.Color(0xFFFF99);
                        material.emissiveIntensity = 0.0;
                        if (experience && experience.scene && experience.scene.environment) {
                            material.envMap = experience.scene.environment;
                            material.roughness = 0.9;
                            material.metalness = 0;
                            material.needsUpdate = true;
                        } else {
                            console.warn(`[InstancedMesh] Env map non trouvée pour vitre maison (${partName}).`);
                        }
                    } else {
                        // Cadres de fenêtres
                        material = this.baseHouseMaterials.windowFrame.clone();
                        material.name = `HouseWindowFrameMat_Inst_${partName}`;
                    }
                } else {
                    if (partName.startsWith('base_')) {
                        material = this.baseHouseMaterials[partName];
                    } else if (partName === 'roof') {
                        material = this.baseHouseMaterials.roof;
                    } else if (partName === 'door') {
                        material = this.baseHouseMaterials.door;
                    } else if (partName === 'garageDoor') {
                        material = this.baseHouseMaterials.garageDoor;
                    } else if (partName === 'doorMarker') {
                        material = this.baseHouseMaterials.doorMarker;
                    } else {
                        material = this.baseHouseMaterials[partName];
                    }
                    if (!material) {
                        console.warn(`[InstancedMesh] Matériau non trouvé pour partie maison: ${partName}`);
                    }
                }

                if (geometry && material && matrices && matrices.length > 0) {
                    const count = matrices.length;
                    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
                    instancedMesh.name = `House_${partName}_Instanced`;
                    instancedMesh.castShadow = true;
                    instancedMesh.receiveShadow = !(partName === 'windowPane');
                    matrices.forEach((matrix, index) => {
                        instancedMesh.setMatrixAt(index, matrix);
                    });
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    houseGroup.add(instancedMesh);
                    instancedMeshCount++;
                } else if (!matrices || matrices.length === 0) {
                    // Aucune instance pour cette partie
                } else {
                    if (!geometry) console.warn(`[InstancedMesh] Géométrie manquante pour partie maison: ${partName}`);
                    if (!material && !isHouseWindowPart) console.warn(`[InstancedMesh] Matériau non trouvé (non fenêtre) pour partie maison: ${partName}`);
                }
            }
        }

        console.log(`HouseRenderer: ${instancedMeshCount} InstancedMesh(s) créés pour la maison.`);
    }

    /**
     * Réinitialise le HouseRenderer en disposant des géométries et en réinitialisant les tableaux d'instances.
     */
    reset() {
        for (const key in this.baseHouseGeometries) {
            if (this.baseHouseGeometries[key]) {
                this.baseHouseGeometries[key].dispose();
            }
        }
        this.baseHouseGeometries = {};
        this.defineHouseBaseGeometries();
        this.initializeHouseMatrixArrays();
    }

    /**
     * Génère un asset procédural pour la maison.
     * Retourne un objet contenant :
     *   - id: identifiant unique
     *   - parts: tableau d'objets { geometry, material }
     *   - fittingScaleFactor, userScale, centerOffset, sizeAfterFitting
     *
     * Ces données permettront de créer des InstancedMesh dans PlotContentGenerator.
     */
    generateProceduralHouse(baseWidth, baseHeight, baseDepth, userScale = 10) {
        // Créer un groupe pour la maison de manière similaire à NewHouseRenderer
        const houseGroup = new THREE.Group();
        
        // Dimensions de base adaptées
        const scale = userScale * 0.2; // Adapter l'échelle pour correspondre aux dimensions
        const armLength = 2 * scale;
        const armWidth = 1 * scale;
        const armDepth = 0.55 * scale;
        const roofPitchHeight = 0.33 * scale;
        const roofOverhang = 0.08 * scale;
        const doorHeight = 0.7 * armDepth;
        const doorWidth = 0.3 * scale;
        const doorDepth = 0.02 * scale;
        const garageDoorHeight = 0.8 * armDepth;
        const garageDoorWidth = 0.55 * scale;

        // Créer les murs principaux
        const wall1Geo = new THREE.BoxGeometry(armLength, armDepth, armWidth);
        const wall1Mesh = new THREE.Mesh(wall1Geo, this.baseHouseMaterials.base_part1);
        wall1Mesh.position.set(armLength / 2, armDepth / 2, armWidth / 2);
        houseGroup.add(wall1Mesh);

        const wall2Geo = new THREE.BoxGeometry(armWidth, armDepth, armLength);
        const wall2Mesh = new THREE.Mesh(wall2Geo, this.baseHouseMaterials.base_part2);
        wall2Mesh.position.set(armWidth / 2, armDepth / 2, armLength / 2);
        houseGroup.add(wall2Mesh);

        // Créer les toits
        const roofPos1 = new THREE.Vector3(armLength / 2, armDepth, armWidth / 2);
        const roofPos2 = new THREE.Vector3(armWidth / 2, armDepth, armLength / 2);
        
        // Utiliser la géométrie de toit complexe existante mais l'adapter
        const roofGeo = this.baseHouseGeometries.roof.clone();
        const roof1Mesh = new THREE.Mesh(roofGeo, this.baseHouseMaterials.roof);
        roof1Mesh.position.copy(roofPos1);
        roof1Mesh.rotation.y = Math.PI / 2;
        houseGroup.add(roof1Mesh);

        const roof2Mesh = new THREE.Mesh(roofGeo.clone(), this.baseHouseMaterials.roof);
        roof2Mesh.position.copy(roofPos2);
        houseGroup.add(roof2Mesh);

        // Créer les portes
        const doorGeo = new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth);
        const doorMesh = new THREE.Mesh(doorGeo, this.baseHouseMaterials.door);
        doorMesh.position.set(armWidth, doorHeight / 2, armLength * 0.75);
        houseGroup.add(doorMesh);

        const garageGeo = new THREE.BoxGeometry(doorDepth, garageDoorHeight, garageDoorWidth);
        const garageMesh = new THREE.Mesh(garageGeo, this.baseHouseMaterials.garageDoor);
        garageMesh.position.set(armLength, garageDoorHeight / 2, armWidth / 2);
        houseGroup.add(garageMesh);

        // Créer les fenêtres détaillées comme dans NewHouseRenderer
        const createWindow = (x, y, z, rotY = 0) => {
            const windowGroup = new THREE.Group();
            // Utiliser les mêmes dimensions que dans defineHouseBaseGeometries mais avec scale
            const frameWidth = 0.2 * scale;
            const frameHeight = 0.4 * armDepth;
            const frameDepth = 0.02 * scale;
            const barThickness = 0.01 * scale; // Réduit pour être moins épais

            // Créer les géométries des barres du cadre
            const sideBarGeo = new THREE.BoxGeometry(barThickness, frameHeight, frameDepth);
            const topBotBarGeo = new THREE.BoxGeometry(frameWidth, barThickness, frameDepth);
            const verticalBarGeo = new THREE.BoxGeometry(barThickness, frameHeight - barThickness * 2, frameDepth * 0.8);
            const horizontalBarGeo = new THREE.BoxGeometry(frameWidth - barThickness * 2, barThickness, frameDepth * 0.8);

            // Cloner les matériaux pour éviter les conflits
            const windowFrameMat = this.baseHouseMaterials.windowFrame.clone();
            const windowPaneMat = this.baseHouseMaterials.windowPane.clone();

            // Créer les éléments du cadre
            const frameMeshes = [
                new THREE.Mesh(sideBarGeo, windowFrameMat), // Left
                new THREE.Mesh(sideBarGeo.clone(), windowFrameMat), // Right
                new THREE.Mesh(topBotBarGeo, windowFrameMat), // Top
                new THREE.Mesh(topBotBarGeo.clone(), windowFrameMat), // Bottom
                new THREE.Mesh(verticalBarGeo, windowFrameMat), // Vertical Center
                new THREE.Mesh(horizontalBarGeo, windowFrameMat) // Horizontal Center
            ];

            // Positionner les éléments du cadre
            frameMeshes[0].position.x = -frameWidth / 2 + barThickness / 2;
            frameMeshes[1].position.x = frameWidth / 2 - barThickness / 2;
            frameMeshes[2].position.y = frameHeight / 2 - barThickness / 2;
            frameMeshes[3].position.y = -frameHeight / 2 + barThickness / 2;
            frameMeshes[4].position.z = -frameDepth * 0.1;
            frameMeshes[5].position.z = -frameDepth * 0.1;
            frameMeshes.forEach(m => windowGroup.add(m));

            // Créer la vitre
            const paneGeometry = new THREE.PlaneGeometry(frameWidth - barThickness * 2, frameHeight - barThickness * 2);
            const paneMesh = new THREE.Mesh(paneGeometry, windowPaneMat);
            paneMesh.position.z = -frameDepth / 2 + 0.005 * scale;
            windowGroup.add(paneMesh);

            // Positionner et orienter le groupe fenêtre
            windowGroup.position.set(x, y, z);
            windowGroup.rotation.y = rotY;
            return windowGroup;
        };

        // Ajouter les fenêtres aux positions appropriées
        const frameHeight = 0.4 * armDepth;
        const windowY = armDepth * 0.3 + frameHeight / 2;
        const windowOffset = 0.01 * scale;

        // Fenêtres sur les faces avant et arrière
        houseGroup.add(createWindow(0.25 * scale, windowY, armWidth + windowOffset));
        houseGroup.add(createWindow(0.75 * scale, windowY, armWidth + windowOffset));
        houseGroup.add(createWindow(1.25 * scale, windowY, armWidth + windowOffset));
        houseGroup.add(createWindow(1.75 * scale, windowY, armWidth + windowOffset));
        houseGroup.add(createWindow(0.25 * scale, windowY, -windowOffset, Math.PI));
        houseGroup.add(createWindow(0.75 * scale, windowY, -windowOffset, Math.PI));
        houseGroup.add(createWindow(1.25 * scale, windowY, -windowOffset, Math.PI));
        houseGroup.add(createWindow(1.75 * scale, windowY, -windowOffset, Math.PI));

        // Fenêtres sur les côtés
        houseGroup.add(createWindow(-windowOffset, windowY, 0.25 * scale, -Math.PI / 2));
        houseGroup.add(createWindow(-windowOffset, windowY, 0.75 * scale, -Math.PI / 2));
        houseGroup.add(createWindow(armWidth + windowOffset, windowY, 0.25 * scale, Math.PI / 2));
        houseGroup.add(createWindow(armWidth + windowOffset, windowY, 0.75 * scale, Math.PI / 2));

        // Fenêtres à côté de la porte
        const doorEdgeLeft = armLength * 0.75 - doorWidth / 2;
        const doorEdgeRight = armLength * 0.75 + doorWidth / 2;
        houseGroup.add(createWindow(armWidth + windowOffset, windowY, (armWidth + doorEdgeLeft) / 2, Math.PI / 2));
        houseGroup.add(createWindow(armWidth + windowOffset, windowY, (doorEdgeRight + armLength) / 2, Math.PI / 2));

        // Forcer la mise à jour de toutes les matrices
        houseGroup.updateMatrixWorld(true);

        // --- Regroupement par matériau pour l'asset final ---
        const allGeometries = [];
        const materialMap = new Map();

        // Initialiser la map avec les matériaux utilisés
        Object.values(this.baseHouseMaterials).forEach(mat => {
            if (mat) {
                materialMap.set(mat.name, { material: mat.clone(), geoms: [] });
            }
        });

        // Parcourir tous les meshes du groupe maison
        houseGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                let clonedGeom = child.geometry.clone();
                if (clonedGeom.index) clonedGeom = clonedGeom.toNonIndexed();
                clonedGeom.applyMatrix4(child.matrixWorld);
                allGeometries.push(clonedGeom);

                const matName = child.material.name;
                const groupData = materialMap.get(matName);
                if (groupData) {
                    groupData.geoms.push(clonedGeom);
                } else {
                    console.warn(`[HouseProc] Matériau non trouvé dans la map: ${matName}`);
                }
            }
            // Gérer les groupes de fenêtres
            else if (child.isGroup && child !== houseGroup) {
                child.updateMatrixWorld(true);
                child.children.forEach(grandChild => {
                    if (grandChild.isMesh && grandChild.geometry && grandChild.material) {
                        grandChild.updateMatrixWorld(true);
                        let clonedGeom = grandChild.geometry.clone();
                        if (clonedGeom.index) clonedGeom = clonedGeom.toNonIndexed();
                        clonedGeom.applyMatrix4(grandChild.matrixWorld);
                        allGeometries.push(clonedGeom);

                        const matName = grandChild.material.name;
                        const groupData = materialMap.get(matName);
                        if (groupData) {
                            groupData.geoms.push(clonedGeom);
                        } else {
                            console.warn(`[HouseProc Window] Matériau non trouvé dans la map: ${matName}`);
                        }
                    }
                });
            }
        });

        if (allGeometries.length === 0) {
            console.error("[HouseProc] Aucune géométrie valide trouvée.");
            return null;
        }

        // Fusionner toutes les géométries pour calculer la BBox globale
        const globalMerged = mergeGeometries(allGeometries, false);
        if (!globalMerged) {
            console.error("[HouseProc] Échec de la fusion globale.");
            allGeometries.forEach(g => g.dispose());
            return null;
        }

        globalMerged.computeBoundingBox();
        const globalBBox = globalMerged.boundingBox;
        const globalMinY = globalBBox.min.y;
        const globalCenter = new THREE.Vector3();
        globalBBox.getCenter(globalCenter);
        const globalSize = new THREE.Vector3();
        globalBBox.getSize(globalSize);
        globalMerged.dispose();

        globalSize.x = Math.max(globalSize.x, 0.001);
        globalSize.y = Math.max(globalSize.y, 0.001);
        globalSize.z = Math.max(globalSize.z, 0.001);

        const fittingScaleFactor = Math.min(baseWidth / globalSize.x, baseHeight / globalSize.y, baseDepth / globalSize.z);
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        // Fusionner les géométries par matériau et recentrer
        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;

            const mergedPartGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeom) {
                console.error(`[HouseProc] Échec de fusion du groupe "${matName}".`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }
            
            mergedPartGeom.translate(-globalCenter.x, -globalMinY, -globalCenter.z);
            parts.push({
                geometry: mergedPartGeom,
                material: groupData.material
            });
            groupData.geoms.forEach(g => g.dispose());
        });

        // Nettoyer
        allGeometries.forEach(g => g.dispose());
        houseGroup.traverse(obj => { if (obj.isMesh) obj.geometry?.dispose(); });

        const asset = {
            id: `house_procedural_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(0, globalSize.y / 2, 0),
            sizeAfterFitting: sizeAfterFitting
        };

        console.log(`[HouseProc] Asset généré avec ${parts.length} parties. ID: ${asset.id}`);
        return asset;
    }
}
