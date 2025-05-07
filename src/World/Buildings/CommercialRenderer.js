import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CommercialRenderer {
    /**
     * Crée une texture procédurale pour les façades des immeubles
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createFacadeTexture(width = 512, height = 512) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Couleur de base
        ctx.fillStyle = '#f0e6d2';
        ctx.fillRect(0, 0, width, height);

        // Ajout de variations de couleur pour simuler des briques
        const brickWidth = width / 8;
        const brickHeight = height / 16;
        
        for (let y = 0; y < height; y += brickHeight) {
            for (let x = 0; x < width; x += brickWidth) {
                // Variation aléatoire plus prononcée avec une probabilité de briques plus foncées
                let variation;
                if (Math.random() < 0.2) { // 20% de chance d'avoir une brique plus foncée
                    variation = Math.random() * 40 - 60; // Variation plus forte vers le foncé
                } else {
                    variation = Math.random() * 30 - 15; // Variation normale
                }
                
                const r = Math.min(255, Math.max(0, 240 + variation));
                const g = Math.min(255, Math.max(0, 230 + variation));
                const b = Math.min(255, Math.max(0, 210 + variation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, brickWidth - 1, brickHeight - 1);
            }
        }

        // Ajout de lignes horizontales pour simuler des joints
        ctx.strokeStyle = '#d7c4a3';
        ctx.lineWidth = 2;
        for (let y = brickHeight; y < height; y += brickHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Ajout de lignes verticales décalées
        for (let y = 0; y < height; y += brickHeight * 2) {
            for (let x = brickWidth; x < width; x += brickWidth * 2) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + brickHeight);
                ctx.stroke();
            }
        }

        // Création de la texture Three.js
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    }

    /**
     * Constructeur pour le renderer de commerce.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Matériaux partagés du projet (ex: materials.buildingGroundMaterial).
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; 
        this.assetIdCounter = 0;

        // Création des textures partagées pour le commerce
        this.groundFloorTexture = this.createFacadeTexture(512, 512);
        this.groundFloorTexture.repeat.set(3.5, 2.5);

        this.upperFloorTexture = this.createFacadeTexture(512, 512);
        this.upperFloorTexture.repeat.set(3.5, 2);

        this.roofTexture = this.createRoofTileTexture(256, 128, '#808080', '#696969', 32, 16, 2);
        this.roofTexture.repeat.set(10, 10);

        // Définition des matériaux pour le commerce
        this.localMaterials = {
            groundFloor: new THREE.MeshStandardMaterial({ 
                map: this.groundFloorTexture,
                name: "CommercialGroundFloorMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            upperFloor: new THREE.MeshStandardMaterial({ 
                map: this.upperFloorTexture,
                name: "CommercialUpperFloorMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            roof: new THREE.MeshStandardMaterial({ 
                map: this.groundFloorTexture,
                name: "CommercialRoofMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            window: new THREE.MeshStandardMaterial({ 
                color: 0xadd8e6,
                transparent: true, 
                opacity: 0.7, 
                name: "CommercialWindowMat",
                emissive: 0xfcffe0,
                emissiveIntensity: 0.0,
                metalness: 0.8,
                roughness: 0.2
            }),
            balconyWindow: new THREE.MeshStandardMaterial({ 
                color: 0x607B8B, 
                transparent: true, 
                opacity: 0.6, 
                name: "CommercialBalconyWindowMat",
                emissive: 0xfcffe0,
                emissiveIntensity: 0.0,
                metalness: 0.8,
                roughness: 0.2
            }),
            frame: new THREE.MeshBasicMaterial({ 
                color: 0x4d414f, 
                name: "CommercialFrameMat"
            }),
            door: new THREE.MeshStandardMaterial({ 
                color: 0xCD853F, 
                name: "CommercialDoorMat",
                metalness: 0.8,
                roughness: 0.2,
                emissive: 0xfcffe0,
                emissiveIntensity: 0.0
            }),
            vent: new THREE.MeshStandardMaterial({ 
                color: 0x555555, 
                metalness: 0.9, 
                roughness: 0.4, 
                name: "CommercialVentMat" 
            }),
            trim: new THREE.MeshStandardMaterial({ 
                color: 0xb5aab8, 
                name: "CommercialTrimMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            awning: new THREE.MeshStandardMaterial({ 
                color: 0x008080, 
                name: "CommercialAwningMat",
                roughness: 0.8,
                metalness: 0.1
            }),
            awningSupport: new THREE.MeshStandardMaterial({ 
                color: 0xffffff, 
                name: "CommercialAwningSupportMat",
                roughness: 0.8,
                metalness: 0.1
            })
        };

        console.log("CommercialRenderer initialized with local materials.");
    }

    /**
     * Crée une texture procédurale pour les tuiles de toit
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @param {string} tileColor - Couleur des tuiles
     * @param {string} gapColor - Couleur des espaces entre les tuiles
     * @param {number} tileWidth - Largeur des tuiles
     * @param {number} tileHeight - Hauteur des tuiles
     * @param {number} gap - Espace entre les tuiles
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createRoofTileTexture(width = 256, height = 256, tileColor = '#A0522D', gapColor = '#696969', tileWidth = 40, tileHeight = 20, gap = 2) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        context.fillStyle = gapColor;
        context.fillRect(0, 0, width, height);

        context.fillStyle = tileColor;
        for (let y = 0; y < height; y += tileHeight / 2) { // Chevauchement des rangées
             const row = Math.floor(y / (tileHeight / 2));
             const startX = (row % 2 === 0) ? 0 : -tileWidth / 2; // Décalage horizontal
             for (let x = startX; x < width; x += tileWidth) {
                 context.beginPath();
                 // Dessiner une forme de tuile arrondie (simplifiée ici par un rectangle)
                 context.roundRect(x + gap, y + gap, tileWidth - 2 * gap, tileHeight - 2 * gap, [0, 0, 5, 5]); // Coins inférieurs arrondis
                 context.fill();
                 // Dessiner la partie qui dépasse à cause du décalage
                 if (startX !== 0) {
                     context.beginPath();
                     context.roundRect(x + gap + width, y + gap, tileWidth - 2 * gap, tileHeight - 2 * gap, [0, 0, 5, 5]);
                     context.fill();
                 }
             }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }
    
    /**
     * Génère l'asset procédural pour un commerce.
     * @param {number} baseWidth - Largeur cible (pour calcul scale).
     * @param {number} baseHeight - Hauteur cible.
     * @param {number} baseDepth - Profondeur cible.
     * @param {number} [userScale=1] - Facteur d'échelle utilisateur.
     * @param {number} [verticalScale=1] - Facteur de scale vertical.
     * @returns {object|null} L'asset généré {id, parts, fittingScaleFactor, ...} ou null.
     */
    generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1, verticalScale = 0.6) {
        // Ajuster les dimensions de base
        const defaultScaleMultiplier = 2;
        const adjustedBaseWidth = baseWidth * defaultScaleMultiplier;
        const adjustedBaseHeight = baseHeight * defaultScaleMultiplier * verticalScale; // Appliquer le scale vertical
        const adjustedBaseDepth = baseDepth * defaultScaleMultiplier;
        
        const buildingGroup = new THREE.Group(); // Groupe temporaire pour l'assemblage

        // Constantes de dimensions du bâtiment commercial (dimensions de base)
        const groundFloorHeight = 3;
        const upperFloorHeight = 2.5;
        const groundFloorWidth = 5;
        const groundFloorDepth = 4;
        const upperFloorWidth = groundFloorWidth;
        const upperFloorDepth = groundFloorDepth;
        const roofWidth = upperFloorWidth + 0.4;
        const roofHeight = 0.3;
        const roofDepth = upperFloorDepth + 0.4;
        const roofLedgeHeight = 0.2;
        const roofLedgeThickness = 0.1;
        const doorWidth = 1.0;
        const doorHeight = 2.2;
        const doorDepth = 0.05;
        const windowWidth = 0.8;
        const windowHeight = 1.2;
        const windowDepth = 0.05;
        const shopWindowWidth = 2.5;
        const shopWindowHeight = 1.8;
        const shopWindowDepth = 0.05;
        const frameThickness = 0.05;
        const frameDepthOffset = 0.01;
        const frameDepth = windowDepth + frameDepthOffset;
        const doorWindowWidth = 0.4;
        const doorWindowHeight = 0.5;
        const doorWindowDepth = doorDepth + 0.01;
        const awningStripeWidth = 0.5;
        const awningHeight = 0.2;
        const awningDepth = 1.0;
        const ventWidth = 0.8;
        const ventHeight = 0.4;
        const ventDepth = 0.6;

        // Appliquer le multiplicateur d'échelle à toutes les dimensions
        const scale = defaultScaleMultiplier;
        const verticalScaleFactor = scale * verticalScale; // Facteur de scale vertical combiné

        // Dimensions horizontales (largeur et profondeur)
        const scaledGroundFloorWidth = groundFloorWidth * scale;
        const scaledGroundFloorDepth = groundFloorDepth * scale;
        const scaledUpperFloorWidth = upperFloorWidth * scale;
        const scaledUpperFloorDepth = upperFloorDepth * scale;
        const scaledRoofWidth = roofWidth * scale;
        const scaledRoofDepth = roofDepth * scale;
        const scaledRoofLedgeThickness = roofLedgeThickness * scale;
        const scaledDoorWidth = doorWidth * scale;
        const scaledDoorDepth = doorDepth * scale;
        const scaledWindowWidth = windowWidth * scale;
        const scaledWindowDepth = windowDepth * scale;
        const scaledShopWindowWidth = shopWindowWidth * scale;
        const scaledShopWindowDepth = shopWindowDepth * scale;
        const scaledFrameThickness = frameThickness * scale;
        const scaledFrameDepthOffset = frameDepthOffset * scale;
        const scaledFrameDepth = frameDepth * scale;
        const scaledDoorWindowWidth = doorWindowWidth * scale;
        const scaledDoorWindowDepth = doorWindowDepth * scale;
        const scaledAwningStripeWidth = awningStripeWidth * scale;
        const scaledAwningDepth = awningDepth * scale;
        const scaledVentWidth = ventWidth * scale;
        const scaledVentDepth = ventDepth * scale;

        // Dimensions verticales (hauteurs)
        const scaledGroundFloorHeight = groundFloorHeight * verticalScaleFactor;
        const scaledUpperFloorHeight = upperFloorHeight * verticalScaleFactor;
        const scaledRoofHeight = roofHeight * verticalScaleFactor;
        const scaledRoofLedgeHeight = roofLedgeHeight * verticalScaleFactor;
        const scaledDoorHeight = doorHeight * verticalScaleFactor;
        const scaledWindowHeight = windowHeight * verticalScaleFactor;
        const scaledShopWindowHeight = shopWindowHeight * verticalScaleFactor;
        const scaledDoorWindowHeight = doorWindowHeight * verticalScaleFactor;
        const scaledAwningHeight = awningHeight * verticalScaleFactor;
        const scaledVentHeight = ventHeight * verticalScaleFactor;

        // Fonction utilitaire pour créer des boîtes
        const createBox = (width, height, depth, material, x, y, z) => {
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            buildingGroup.add(mesh);
            return mesh;
        };

        // 1. Rez-de-chaussée
        const groundFloor = createBox(
            scaledGroundFloorWidth, scaledGroundFloorHeight, scaledGroundFloorDepth,
            this.localMaterials.groundFloor,
            0, baseHeight + scaledGroundFloorHeight / 2, 0
        );

        // 2. Étage supérieur
        const upperFloorY = baseHeight + scaledGroundFloorHeight + scaledUpperFloorHeight / 2;
        const upperFloor = createBox(
            scaledUpperFloorWidth, scaledUpperFloorHeight, scaledUpperFloorDepth,
            this.localMaterials.upperFloor,
            0, upperFloorY, 0
        );

        // 3. Toit
        const roofY = baseHeight + scaledGroundFloorHeight + scaledUpperFloorHeight + scaledRoofHeight / 2;
        const roof = createBox(
            scaledRoofWidth, scaledRoofHeight, scaledRoofDepth,
            this.localMaterials.roof,
            0, roofY, 0
        );

        // 4. Rebord du toit
        const roofLedgeY = roofY + scaledRoofHeight / 2 + scaledRoofLedgeHeight / 2;
        const roofLedgeColor = this.localMaterials.trim;

        // Rebord avant/arrière
        const ledgeFrontBack = createBox(
            scaledRoofWidth, scaledRoofLedgeHeight, scaledRoofLedgeThickness, 
            roofLedgeColor, 
            0, roofLedgeY, scaledRoofDepth / 2 - scaledRoofLedgeThickness / 2
        );
        
        const ledgeBack = createBox(
            scaledRoofWidth, scaledRoofLedgeHeight, scaledRoofLedgeThickness, 
            roofLedgeColor, 
            0, roofLedgeY, -scaledRoofDepth / 2 + scaledRoofLedgeThickness / 2
        );
        
        // Rebord gauche/droite
        const ledgeSideWidth = scaledRoofDepth - 2 * scaledRoofLedgeThickness;
        const ledgeLeft = createBox(
            scaledRoofLedgeThickness, scaledRoofLedgeHeight, ledgeSideWidth, 
            roofLedgeColor, 
            -scaledRoofWidth / 2 + scaledRoofLedgeThickness / 2, roofLedgeY, 0
        );
        
        const ledgeRight = createBox(
            scaledRoofLedgeThickness, scaledRoofLedgeHeight, ledgeSideWidth, 
            roofLedgeColor, 
            scaledRoofWidth / 2 - scaledRoofLedgeThickness / 2, roofLedgeY, 0
        );

        // 5. Aération sur le toit
        const ventY = roofY + scaledRoofHeight / 2 + scaledVentHeight / 2;
        const ventX = scaledRoofWidth / 4;
        const ventZ = 0;
        const vent = createBox(
            scaledVentWidth, scaledVentHeight, scaledVentDepth,
            this.localMaterials.vent,
            ventX, ventY, ventZ
        );

        // 6. Fenêtres de l'étage supérieur
        const windowY = upperFloorY;
        const windowZ = scaledGroundFloorDepth / 2 + scaledWindowDepth / 2;
        const windowPositions = [-1.5, 0, 1.5].map(pos => pos * scale); // Mettre à l'échelle les positions

        windowPositions.forEach(posX => {
            // Fenêtre elle-même
            const windowMesh = createBox(
                scaledWindowWidth, scaledWindowHeight, scaledWindowDepth, 
                this.localMaterials.window, 
                posX, windowY, windowZ
            );

            // Cadres de la fenêtre
            const windowFrameDepth = scaledWindowDepth + scaledFrameDepthOffset;
            const windowFrameH = createBox(
                scaledWindowWidth + scaledFrameThickness*2, scaledFrameThickness, windowFrameDepth, 
                this.localMaterials.frame, 
                posX, windowY + scaledWindowHeight/2 + scaledFrameThickness/2, windowZ
            );
            
            const windowFrameB = createBox(
                scaledWindowWidth + scaledFrameThickness*2, scaledFrameThickness, windowFrameDepth, 
                this.localMaterials.frame, 
                posX, windowY - scaledWindowHeight/2 - scaledFrameThickness/2, windowZ
            );
            
            const windowFrameL = createBox(
                scaledFrameThickness, scaledWindowHeight, windowFrameDepth, 
                this.localMaterials.frame, 
                posX - scaledWindowWidth/2 - scaledFrameThickness/2, windowY, windowZ
            );
            
            const windowFrameR = createBox(
                scaledFrameThickness, scaledWindowHeight, windowFrameDepth, 
                this.localMaterials.frame, 
                posX + scaledWindowWidth/2 + scaledFrameThickness/2, windowY, windowZ
            );
        });

        // 7. Calcul des marges et positions pour porte et vitrine
        const totalFrontWidth = scaledGroundFloorWidth;
        const sideMargin = 0.4 * scale;
        
        // Position X de la porte (avec marge gauche)
        const doorX = -totalFrontWidth / 2 + sideMargin + scaledDoorWidth / 2;
        // Position X de la vitrine (avec marge droite)
        const shopWindowX = totalFrontWidth / 2 - sideMargin - scaledShopWindowWidth / 2;
        
        // Positions Y et Z
        const doorY = baseHeight + scaledDoorHeight / 2;
        const doorZ = scaledGroundFloorDepth / 2 + scaledDoorDepth / 2;
        const shopWindowY = baseHeight + scaledGroundFloorHeight * 0.5;
        const shopWindowZ = scaledGroundFloorDepth / 2 + scaledShopWindowDepth / 2;
        
        // 8. Vitrine du rez-de-chaussée
        const shopWindow = createBox(
            scaledShopWindowWidth, scaledShopWindowHeight, scaledShopWindowDepth, 
            this.localMaterials.window, 
            shopWindowX, shopWindowY, shopWindowZ
        );
        
        // Cadre de la vitrine
        const shopFrameDepth = scaledShopWindowDepth + scaledFrameDepthOffset;
        const frameH = createBox(
            scaledShopWindowWidth + scaledFrameThickness*2, scaledFrameThickness, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX, shopWindowY + scaledShopWindowHeight/2 + scaledFrameThickness/2, shopWindowZ
        );
        
        const frameB = createBox(
            scaledShopWindowWidth + scaledFrameThickness*2, scaledFrameThickness, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX, shopWindowY - scaledShopWindowHeight/2 - scaledFrameThickness/2, shopWindowZ
        );
        
        const frameL = createBox(
            scaledFrameThickness, scaledShopWindowHeight, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX - scaledShopWindowWidth/2 - scaledFrameThickness/2, shopWindowY, shopWindowZ
        );
        
        const frameR = createBox(
            scaledFrameThickness, scaledShopWindowHeight, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX + scaledShopWindowWidth/2 + scaledFrameThickness/2, shopWindowY, shopWindowZ
        );
        
        // 9. Porte d'entrée
        const door = createBox(
            scaledDoorWidth, scaledDoorHeight, scaledDoorDepth, 
            this.localMaterials.door, 
            doorX, doorY, doorZ
        );
        
        // Petite fenêtre sur la porte
        const doorWindow = createBox(
            scaledDoorWindowWidth, scaledDoorWindowHeight, scaledDoorWindowDepth, 
            this.localMaterials.window, 
            doorX, doorY + 0.4 * scale, doorZ
        );
        
        // Cadre de la porte
        const doorFrameDepth = scaledDoorDepth + scaledFrameDepthOffset;
        const doorFrameH = createBox(
            scaledDoorWidth + scaledFrameThickness*2, scaledFrameThickness, doorFrameDepth, 
            this.localMaterials.frame, 
            doorX, doorY + scaledDoorHeight/2 + scaledFrameThickness/2, doorZ
        );
        
        const doorFrameL = createBox(
            scaledFrameThickness, scaledDoorHeight, doorFrameDepth, 
            this.localMaterials.frame, 
            doorX - scaledDoorWidth/2 - scaledFrameThickness/2, doorY, doorZ
        );
        
        const doorFrameR = createBox(
            scaledFrameThickness, scaledDoorHeight, doorFrameDepth, 
            this.localMaterials.frame, 
            doorX + scaledDoorWidth/2 + scaledFrameThickness/2, doorY, doorZ
        );

        // 10. Auvent
        const awningGroup = new THREE.Group();

        // Calcul de la largeur et du centre de l'auvent basé sur les bords extérieurs de la porte et de la vitrine
        const awningLeftEdge = doorX - scaledDoorWidth / 2 - scaledFrameThickness; // Bord extérieur gauche (incluant cadre)
        const awningRightEdge = shopWindowX + scaledShopWindowWidth / 2 + scaledFrameThickness; // Bord extérieur droit (incluant cadre)
        const awningEffectiveWidth = awningRightEdge - awningLeftEdge; // Largeur totale à couvrir
        const awningCenterX = awningLeftEdge + awningEffectiveWidth / 2; // Centre recalculé

        const numStripes = Math.ceil(awningEffectiveWidth / scaledAwningStripeWidth); // Calcul dynamique des bandes
        const actualAwningWidth = numStripes * scaledAwningStripeWidth; // Largeur réelle basée sur les bandes

        // Calcul de la position Y de l'auvent
        const wallTopY = baseHeight + scaledGroundFloorHeight; // Sommet du mur
        const awningY = wallTopY - 0.1 * scale; // Légèrement en dessous du sommet du mur
        const awningPivotZ = scaledGroundFloorDepth / 2 - 0.05 * scale; // Position Z du pivot (légèrement en avant du mur)
        const awningAngle = Math.PI / 6; // Angle d'inclinaison

        console.log("[CommercialRenderer] Positions de l'auvent:", {
            baseHeight,
            scaledGroundFloorHeight,
            wallTopY,
            awningY,
            awningPivotZ,
            awningAngle
        });

        // Création des bandes de l'auvent
        for (let i = 0; i < numStripes; i++) {
            const stripeColor = i % 2 === 0 ? 0x008080 : 0xffffff; // Alternance Teal / Blanc
            const stripe = createBox(
                scaledAwningStripeWidth, scaledAwningHeight, scaledAwningDepth,
                new THREE.MeshStandardMaterial({ 
                    color: stripeColor,
                    name: `CommercialAwningStripeMat_${i}`,
                    roughness: 0.8,
                    metalness: 0.1
                }),
                -actualAwningWidth / 2 + scaledAwningStripeWidth / 2 + i * scaledAwningStripeWidth, 
                awningY,
                scaledAwningDepth / 2 + 1.95 * scale // Décalage vers l'avant des bandes
            );
            stripe.castShadow = false;
            stripe.receiveShadow = false;
            stripe.rotation.x = Math.PI / 6; // Inclinaison individuelle de chaque bande
            awningGroup.add(stripe);
        }

        // Positionner l'auvent au centre recalculé et au pivot Z
        awningGroup.position.set(awningCenterX, 0, awningPivotZ); // Y à 0 car déjà positionné dans les bandes
        awningGroup.rotation.x = 0; // Pas de rotation sur le groupe
        awningGroup.castShadow = true; // Le groupe projette l'ombre
        buildingGroup.add(awningGroup);

        // Supports latéraux de l'auvent (ajustés : horizontaux et légèrement plus bas)
        const supportThickness = 0.08 * scale; // Épaisseur du support
        const supportHeight = 0.08 * scale; // Hauteur du support (identique à épaisseur pour carré)
        const supportWallAttachY = awningY - 0.22 * scale; // Point d'attache Y sur le mur (LÉGÈREMENT PLUS HAUT)
        const supportWallAttachZ = scaledGroundFloorDepth / 2 + supportThickness / 2; // Point d'attache Z sur le mur

        // Calcul du point d'attache sous l'auvent
        const awningEdgeZ = awningPivotZ + scaledAwningDepth * Math.cos(awningAngle);

        // Longueur nécessaire pour le support horizontal
        const supportLength = awningEdgeZ - supportWallAttachZ;

        const supportGeo = new THREE.BoxGeometry(supportThickness, supportHeight, supportLength);
        const supportL = new THREE.Mesh(supportGeo, this.localMaterials.awningSupport);
        const supportR = new THREE.Mesh(supportGeo, this.localMaterials.awningSupport);

        // Positionner les supports
        const awningActualLeftEdgePos = awningCenterX - actualAwningWidth / 2;
        const awningActualRightEdgePos = awningCenterX + actualAwningWidth / 2;

        // Positionner le *centre* des supports horizontalement
        const supportCenterZ = supportWallAttachZ + supportLength / 2;

        supportL.position.set(awningActualLeftEdgePos - supportThickness, supportWallAttachY, supportCenterZ);
        supportR.position.set(awningActualRightEdgePos + supportThickness, supportWallAttachY, supportCenterZ);

        // Rotation: Aucune rotation nécessaire car on aligne la longueur sur l'axe Z
        supportL.rotation.set(0, 0, 0);
        supportR.rotation.set(0, 0, 0);
        supportL.castShadow = true;
        supportR.castShadow = true;

        buildingGroup.add(supportL);
        buildingGroup.add(supportR);

        // ----- Regroupement par matériau pour l'asset final -----
        const allGeometries = []; // Pour calculer la BBox globale
        const materialMap = new Map();

        // Initialiser la map avec les matériaux utilisés
        Object.values(this.localMaterials).forEach(mat => {
            if (mat) {
                materialMap.set(mat.name, { material: mat, geoms: [] });
            }
        });

        // Ajouter les matériaux des bandes de l'auvent
        awningGroup.children.forEach((stripe, index) => {
            const matName = `CommercialAwningStripeMat_${index}`;
            materialMap.set(matName, { material: stripe.material, geoms: [] });
        });

        buildingGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);
                allGeometries.push(clonedGeom);
                const matName = child.material.name;
                const groupData = materialMap.get(matName);
                if (groupData) {
                    groupData.geoms.push(clonedGeom);
                } else {
                    console.warn(`[Commercial Proc] Matériau non trouvé dans la map: ${matName || '[sans nom]'}. Géométrie ignorée.`);
                }
            }
        });

        if (allGeometries.length === 0) {
            console.error("[Commercial Proc] Aucune géométrie valide trouvée après parcours.");
            return null;
        }

        // Fusion globale temporaire pour calculer la BBox
        const globalMerged = mergeGeometries(allGeometries, false);
        if (!globalMerged) {
            console.error("[Commercial Proc] Échec de la fusion globale pour BBox.");
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

        const fittingScaleFactor = Math.min(adjustedBaseWidth / globalSize.x, adjustedBaseHeight / globalSize.y, adjustedBaseDepth / globalSize.z);
        const sizeAfterFitting = globalSize.clone().multiplyScalar(fittingScaleFactor);

        // Fusionner les géométries par matériau et recentrer
        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;

            const mergedPartGeom = mergeGeometries(groupData.geoms, false);
            if (!mergedPartGeom) {
                console.error(`[Commercial Proc] Échec de fusion du groupe "${matName}".`);
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

        allGeometries.forEach(g => g.dispose());

        const asset = {
            id: `commercial_proc_${this.assetIdCounter++}`,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: adjustedBaseWidth / globalSize.x,
            centerOffset: new THREE.Vector3(0, globalSize.y / 2, 0), // Centre à la base
            sizeAfterFitting: sizeAfterFitting
        };

        console.log(`[Commercial Proc] Asset généré avec ${parts.length} parties. ID: ${asset.id}`);
        return asset;
    }

    destroy() {
        console.log("Destroying CommercialRenderer...");
        // Libérer les textures
        this.groundFloorTexture?.dispose();
        this.upperFloorTexture?.dispose();
        this.roofTexture?.dispose();
        
        // Libérer les matériaux
        Object.values(this.localMaterials).forEach(material => {
            material?.dispose();
        });
        this.localMaterials = {};
        console.log("CommercialRenderer destroyed.");
    }
} 