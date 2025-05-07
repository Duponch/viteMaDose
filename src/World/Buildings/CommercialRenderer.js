import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CommercialRenderer {
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
        this.groundFloorTexture = this.createBrickTexture(256, 256, '#575c4e', '#696969', 80, 35, 4);
        this.groundFloorTexture.repeat.set(3.5, 2.5);

        this.upperFloorTexture = this.createBrickTexture(256, 256, '#4682B4', '#6495ED', 80, 35, 4);
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
                map: this.roofTexture,
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
            })
        };

        console.log("CommercialRenderer initialized with local materials.");
    }

    /**
     * Crée une texture procédurale pour les briques
     * @param {number} width - Largeur de la texture
     * @param {number} height - Hauteur de la texture
     * @param {string} brickColor - Couleur des briques
     * @param {string} mortarColor - Couleur du mortier
     * @param {number} brickWidth - Largeur des briques
     * @param {number} brickHeight - Hauteur des briques
     * @param {number} mortarThickness - Épaisseur du mortier
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createBrickTexture(width = 256, height = 256, brickColor = '#8B4513', mortarColor = '#D3D3D3', brickWidth = 80, brickHeight = 35, mortarThickness = 4) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        context.fillStyle = mortarColor;
        context.fillRect(0, 0, width, height);

        context.fillStyle = brickColor;
        for (let y = 0; y < height; y += brickHeight) {
            for (let x = 0; x < width; x += brickWidth) {
                // Décalage d'une demi-brique pour les rangées paires
                const offsetX = (Math.floor(y / brickHeight) % 2 === 0) ? 0 : -brickWidth / 2;
                // Dessiner la brique principale
                context.fillRect(x + offsetX + mortarThickness / 2, y + mortarThickness / 2, brickWidth - mortarThickness, brickHeight - mortarThickness);
                // Ajouter la brique coupée qui dépasse à gauche/droite à cause du décalage
                 if (offsetX !== 0) {
                     context.fillRect(x + offsetX + width + mortarThickness / 2, y + mortarThickness / 2, brickWidth - mortarThickness, brickHeight - mortarThickness);
                 }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Ajuster le filtrage pour éviter le flou excessif avec de grandes briques
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        return texture;
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
     * @returns {object|null} L'asset généré {id, parts, fittingScaleFactor, ...} ou null.
     */
    generateProceduralBuilding(baseWidth, baseHeight, baseDepth, userScale = 1) {
        // Ajuster les dimensions de base
        const defaultScaleMultiplier = 1.2;
        const adjustedBaseWidth = baseWidth * defaultScaleMultiplier;
        const adjustedBaseHeight = baseHeight * defaultScaleMultiplier;
        const adjustedBaseDepth = baseDepth * defaultScaleMultiplier;
        
        const buildingGroup = new THREE.Group(); // Groupe temporaire pour l'assemblage

        // Constantes de dimensions du bâtiment commercial
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
            groundFloorWidth, groundFloorHeight, groundFloorDepth,
            this.localMaterials.groundFloor,
            0, baseHeight + groundFloorHeight / 2, 0
        );

        // 2. Étage supérieur
        const upperFloorY = baseHeight + groundFloorHeight + upperFloorHeight / 2;
        const upperFloor = createBox(
            upperFloorWidth, upperFloorHeight, upperFloorDepth,
            this.localMaterials.upperFloor,
            0, upperFloorY, 0
        );

        // 3. Toit
        const roofY = baseHeight + groundFloorHeight + upperFloorHeight + roofHeight / 2;
        const roof = createBox(
            roofWidth, roofHeight, roofDepth,
            this.localMaterials.roof,
            0, roofY, 0
        );

        // 4. Rebord du toit
        const roofLedgeY = roofY + roofHeight / 2 + roofLedgeHeight / 2;
        const roofLedgeColor = this.localMaterials.trim;

        // Rebord avant/arrière
        const ledgeFrontBack = createBox(
            roofWidth, roofLedgeHeight, roofLedgeThickness, 
            roofLedgeColor, 
            0, roofLedgeY, roofDepth / 2 - roofLedgeThickness / 2
        );
        
        const ledgeBack = createBox(
            roofWidth, roofLedgeHeight, roofLedgeThickness, 
            roofLedgeColor, 
            0, roofLedgeY, -roofDepth / 2 + roofLedgeThickness / 2
        );
        
        // Rebord gauche/droite
        const ledgeSideWidth = roofDepth - 2 * roofLedgeThickness;
        const ledgeLeft = createBox(
            roofLedgeThickness, roofLedgeHeight, ledgeSideWidth, 
            roofLedgeColor, 
            -roofWidth / 2 + roofLedgeThickness / 2, roofLedgeY, 0
        );
        
        const ledgeRight = createBox(
            roofLedgeThickness, roofLedgeHeight, ledgeSideWidth, 
            roofLedgeColor, 
            roofWidth / 2 - roofLedgeThickness / 2, roofLedgeY, 0
        );

        // 5. Aération sur le toit
        const ventY = roofY + roofHeight / 2 + ventHeight / 2;
        const ventX = roofWidth / 4;
        const ventZ = 0;
        const vent = createBox(
            ventWidth, ventHeight, ventDepth,
            this.localMaterials.vent,
            ventX, ventY, ventZ
        );

        // 6. Fenêtres de l'étage supérieur
        const windowY = upperFloorY;
        const windowZ = groundFloorDepth / 2 + windowDepth / 2;
        const windowPositions = [-1.5, 0, 1.5];

        windowPositions.forEach(posX => {
            // Fenêtre elle-même
            const windowMesh = createBox(
                windowWidth, windowHeight, windowDepth, 
                this.localMaterials.window, 
                posX, windowY, windowZ
            );

            // Cadres de la fenêtre
            const windowFrameDepth = windowDepth + frameDepthOffset;
            const windowFrameH = createBox(
                windowWidth + frameThickness*2, frameThickness, windowFrameDepth, 
                this.localMaterials.frame, 
                posX, windowY + windowHeight/2 + frameThickness/2, windowZ
            );
            
            const windowFrameB = createBox(
                windowWidth + frameThickness*2, frameThickness, windowFrameDepth, 
                this.localMaterials.frame, 
                posX, windowY - windowHeight/2 - frameThickness/2, windowZ
            );
            
            const windowFrameL = createBox(
                frameThickness, windowHeight, windowFrameDepth, 
                this.localMaterials.frame, 
                posX - windowWidth/2 - frameThickness/2, windowY, windowZ
            );
            
            const windowFrameR = createBox(
                frameThickness, windowHeight, windowFrameDepth, 
                this.localMaterials.frame, 
                posX + windowWidth/2 + frameThickness/2, windowY, windowZ
            );
        });

        // 7. Calcul des marges et positions pour porte et vitrine
        const totalFrontWidth = groundFloorWidth;
        const sideMargin = 0.4;
        
        // Position X de la porte (avec marge gauche)
        const doorX = -totalFrontWidth / 2 + sideMargin + doorWidth / 2;
        // Position X de la vitrine (avec marge droite)
        const shopWindowX = totalFrontWidth / 2 - sideMargin - shopWindowWidth / 2;
        
        // Positions Y et Z
        const doorY = baseHeight + doorHeight / 2;
        const doorZ = groundFloorDepth / 2 + doorDepth / 2;
        const shopWindowY = baseHeight + groundFloorHeight * 0.5;
        const shopWindowZ = groundFloorDepth / 2 + shopWindowDepth / 2;
        
        // 8. Vitrine du rez-de-chaussée
        const shopWindow = createBox(
            shopWindowWidth, shopWindowHeight, shopWindowDepth, 
            this.localMaterials.window, 
            shopWindowX, shopWindowY, shopWindowZ
        );
        
        // Cadre de la vitrine
        const shopFrameDepth = shopWindowDepth + frameDepthOffset;
        const frameH = createBox(
            shopWindowWidth + frameThickness*2, frameThickness, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX, shopWindowY + shopWindowHeight/2 + frameThickness/2, shopWindowZ
        );
        
        const frameB = createBox(
            shopWindowWidth + frameThickness*2, frameThickness, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX, shopWindowY - shopWindowHeight/2 - frameThickness/2, shopWindowZ
        );
        
        const frameL = createBox(
            frameThickness, shopWindowHeight, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX - shopWindowWidth/2 - frameThickness/2, shopWindowY, shopWindowZ
        );
        
        const frameR = createBox(
            frameThickness, shopWindowHeight, shopFrameDepth, 
            this.localMaterials.frame, 
            shopWindowX + shopWindowWidth/2 + frameThickness/2, shopWindowY, shopWindowZ
        );
        
        // 9. Porte d'entrée
        const door = createBox(
            doorWidth, doorHeight, doorDepth, 
            this.localMaterials.door, 
            doorX, doorY, doorZ
        );
        
        // Petite fenêtre sur la porte
        const doorWindow = createBox(
            doorWindowWidth, doorWindowHeight, doorWindowDepth, 
            this.localMaterials.window, 
            doorX, doorY + 0.4, doorZ
        );
        
        // Cadre de la porte
        const doorFrameDepth = doorDepth + frameDepthOffset;
        const doorFrameH = createBox(
            doorWidth + frameThickness*2, frameThickness, doorFrameDepth, 
            this.localMaterials.frame, 
            doorX, doorY + doorHeight/2 + frameThickness/2, doorZ
        );
        
        const doorFrameL = createBox(
            frameThickness, doorHeight, doorFrameDepth, 
            this.localMaterials.frame, 
            doorX - doorWidth/2 - frameThickness/2, doorY, doorZ
        );
        
        const doorFrameR = createBox(
            frameThickness, doorHeight, doorFrameDepth, 
            this.localMaterials.frame, 
            doorX + doorWidth/2 + frameThickness/2, doorY, doorZ
        );

        // ----- Regroupement par matériau pour l'asset final -----
        const allGeometries = []; // Pour calculer la BBox globale
        const materialMap = new Map();

        // Initialiser la map avec les matériaux utilisés
        Object.values(this.localMaterials).forEach(mat => {
            if (mat) {
                materialMap.set(mat.name, { material: mat, geoms: [] });
            }
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