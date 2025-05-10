import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Gère la génération et le rendu des sapins procéduraux
 */
export default class FirTreeRenderer {
    /**
     * @param {object} config - Configuration globale
     * @param {object} materials - Collection de matériaux partagés
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.assetIdCounter = 0;
        
        // Palette de couleurs de feuillage pour les sapins (plus foncés que les arbres normaux)
        this.foliageColors = [
            0x207020, // Vert foncé principal
            0x2E8B57, // Vert mer
            0x3CB371, // Vert moyen
            0x228B22, // Vert forêt
            0x228B22, // Vert forêt (dupliqué pour augmenter la probabilité)
            0x207020  // Vert foncé principal (dupliqué pour augmenter la probabilité)
        ];

        // Création des textures partagées
        this.sharedTrunkTexture = this.createTrunkTexture();
        this.sharedFoliageTextures = new Map();
        // Pré-créer une texture de feuillage pour chaque couleur
        this.foliageColors.forEach(color => {
            this.sharedFoliageTextures.set(color, this.createFoliageTexture(color));
        });
    }

    /**
     * Crée une texture procédurale pour les troncs d'arbres
     * @returns {THREE.CanvasTexture} Texture générée pour les troncs
     */
    createTrunkTexture() {
        // Créer un canvas pour dessiner la texture
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Couleur de base du tronc (marron plus foncé pour le sapin)
        const baseColor = new THREE.Color(0x654321);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter des variations de couleur pour simuler l'écorce
        for (let i = 0; i < 80; i++) {
            // Position aléatoire
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            
            // Taille aléatoire
            const size = Math.random() * 5 + 1;
            
            // Variation de couleur (plus claire ou plus foncée)
            const variation = Math.random() * 40 - 20;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
            
            // Couleur plus foncée ou plus claire
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            // Dessiner des lignes verticales pour simuler l'écorce
            const width = Math.random() * 2 + 1;
            const height = Math.random() * 15 + 10;
            ctx.fillRect(x, y, width, height);
        }
        
        // Ajouter des lignes verticales pour simuler les fissures de l'écorce
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * canvas.width;
            const width = Math.random() * 2 + 1;
            const height = Math.random() * 100 + 50;
            const y = Math.random() * (canvas.height - height);
            
            // Couleur plus foncée pour les fissures
            const darkVariation = -30;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + darkVariation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + darkVariation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + darkVariation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(x, y, width, height);
        }
        
        // Créer la texture à partir du canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1); // Répéter horizontalement
        
        return texture;
    }

    /**
     * Crée une texture procédurale pour les feuillages des sapins
     * @param {number} baseColor - Couleur de base du feuillage
     * @returns {THREE.CanvasTexture} Texture générée pour les feuillages
     */
    createFoliageTexture(baseColor) {
        // Créer un canvas pour dessiner la texture
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Convertir la couleur de base en RGB
        const color = new THREE.Color(baseColor);
        ctx.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter des lignes verticales de différentes teintes de vert
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * canvas.width;
            const yStart = Math.random() * canvas.height * 0.3;
            const length = (Math.random() * 0.5 + 0.5) * (canvas.height - yStart);
            
            // Différentes teintes de vert
            const greenShade = Math.random() > 0.6 ? '#2E8B57' : (Math.random() > 0.3 ? '#3CB371' : '#228B22');
            ctx.strokeStyle = greenShade;
            ctx.lineWidth = Math.random() * 1.5 + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, yStart);
            ctx.lineTo(x + (Math.random() - 0.5) * 8, yStart + length);
            ctx.stroke();
        }
        
        // Ajouter quelques détails plus foncés pour la profondeur
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 8 + 2;
            
            // Variation de couleur plus foncée
            const darkerColor = new THREE.Color(color).multiplyScalar(0.7);
            ctx.fillStyle = `rgba(${darkerColor.r * 255}, ${darkerColor.g * 255}, ${darkerColor.b * 255}, 0.7)`;
            
            // Petites formes triangulaires pour simuler les aiguilles
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y + size);
            ctx.lineTo(x - size, y + size);
            ctx.closePath();
            ctx.fill();
        }
        
        // Créer la texture à partir du canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 2); // Répéter pour couvrir toute la surface
        
        return texture;
    }

    /**
     * Génère un sapin procédural avec des cônes empilés
     * @param {number} baseWidth - Largeur de base
     * @param {number} baseHeight - Hauteur de base
     * @param {number} baseDepth - Profondeur de base
     * @param {number} userScale - Facteur d'échelle spécifié par l'utilisateur
     * @returns {object} Asset data contenant les parties du sapin
     */
    generateProceduralTree(baseWidth = 4, baseHeight = 8, baseDepth = 4, userScale = 1) {
        console.log("[FirTree Proc] Début de la génération du sapin procédural.");
        const treeGroup = new THREE.Group();

        // Matériaux
        const trunkMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x654321, 
            name: "FirTreeTrunkMat",
            map: this.sharedTrunkTexture
        });
        
        // Sélection aléatoire d'une couleur de feuillage
        const foliageColor = this.foliageColors[Math.floor(Math.random() * this.foliageColors.length)];
        
        const foliageMaterial = new THREE.MeshStandardMaterial({ 
            color: foliageColor, 
            name: "FirTreeFoliageMat",
            metalness: 0.1,
            roughness: 0.7,
            map: this.sharedFoliageTextures.get(foliageColor)
        });

        // Paramètres du tronc
        const trunkHeight = baseHeight * 0.4;
        const trunkRadiusBottom = baseWidth * 0.15;
        const trunkRadiusTop = baseWidth * 0.1;
        
        // Création du tronc (cylindre simple)
        const trunkGeometry = new THREE.CylinderGeometry(
            trunkRadiusTop, 
            trunkRadiusBottom, 
            trunkHeight, 
            6  // segments
        );
        
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        treeGroup.add(trunk);
        
        // Hauteur totale du feuillage (cônes empilés)
        const foliageHeight = baseHeight * 0.8;
        const foliageBaseY = trunkHeight;
        
        // Créer 3 cônes empilés
        const coneSegments = 6; // Nombre de segments pour les cônes

        // Cône inférieur (plus large)
        const cone1Geometry = new THREE.ConeGeometry(baseWidth * 0.5, foliageHeight * 0.4, coneSegments);
        const cone1 = new THREE.Mesh(cone1Geometry, foliageMaterial);
        cone1.position.y = foliageBaseY + foliageHeight * 0.2;
        treeGroup.add(cone1);

        // Cône du milieu
        const cone2Geometry = new THREE.ConeGeometry(baseWidth * 0.375, foliageHeight * 0.35, coneSegments);
        const cone2 = new THREE.Mesh(cone2Geometry, foliageMaterial);
        cone2.position.y = foliageBaseY + foliageHeight * 0.5;
        treeGroup.add(cone2);

        // Cône supérieur (plus petit)
        const cone3Geometry = new THREE.ConeGeometry(baseWidth * 0.25, foliageHeight * 0.3, coneSegments);
        const cone3 = new THREE.Mesh(cone3Geometry, foliageMaterial);
        cone3.position.y = foliageBaseY + foliageHeight * 0.8;
        treeGroup.add(cone3);

        console.log("[FirTree Proc] Cônes de feuillage créés et ajoutés au groupe.");

        // Fusion et calcul de BBox
        const allGeoms = [];
        const materialMap = new Map();

        treeGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                child.updateMatrixWorld(true);
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld);

                // Ajouter un attribut index à la géométrie si elle n'en a pas
                if (!clonedGeom.index) {
                    const position = clonedGeom.attributes.position;
                    if (position) {
                        const count = position.count;
                        const indices = new Uint16Array(count);
                        for (let i = 0; i < count; i++) {
                            indices[i] = i;
                        }
                        clonedGeom.setIndex(new THREE.BufferAttribute(indices, 1));
                    }
                }

                allGeoms.push(clonedGeom);

                const matName = child.material.name || 'default_firtree_mat';
                if (!materialMap.has(matName)) {
                    materialMap.set(matName, { material: child.material.clone(), geoms: [] });
                }
                materialMap.get(matName).geoms.push(clonedGeom);
            }
        });

        console.log("[FirTree Proc] Parcours du groupe terminé. Nombre de géométries collectées:", allGeoms.length);

        if (allGeoms.length === 0) {
            console.error("[FirTree Proc] Aucune géométrie valide trouvée après le parcours du groupe.");
            trunkMaterial.dispose();
            foliageMaterial.dispose();
            return null;
        }

        // Fusionner toutes les géométries
        const mergedGeometry = this.mergeGeometries(allGeoms);
        if (!mergedGeometry) {
            console.error("[FirTree Proc] Échec de la fusion des géométries.");
            allGeoms.forEach(g => g.dispose());
            trunkMaterial.dispose();
            foliageMaterial.dispose();
            return null;
        }
        console.log("[FirTree Proc] Géométries fusionnées avec succès.");

        mergedGeometry.computeBoundingBox();
        const bbox = mergedGeometry.boundingBox;
        const centerOffset = new THREE.Vector3();
        bbox.getCenter(centerOffset);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        const minY = bbox.min.y;
        mergedGeometry.translate(-centerOffset.x, -minY, -centerOffset.z);

        mergedGeometry.computeBoundingBox();
        const finalBBox = mergedGeometry.boundingBox;
        const finalSize = new THREE.Vector3();
        finalBBox.getSize(finalSize);
        finalSize.x = Math.max(finalSize.x, 0.001);
        finalSize.y = Math.max(finalSize.y, 0.001);
        finalSize.z = Math.max(finalSize.z, 0.001);

        const fittingScaleFactor = Math.min(baseWidth / finalSize.x, baseHeight / finalSize.y, baseDepth / finalSize.z);
        const sizeAfterFitting = finalSize.clone().multiplyScalar(fittingScaleFactor);

        // Créer les parts pour chaque matériau
        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;

            const mergedPartGeometry = this.mergeGeometries(groupData.geoms);
            if (!mergedPartGeometry) {
                console.error(`[FirTree Proc] Échec de la fusion des géométries pour le matériau ${matName}.`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }

            mergedPartGeometry.translate(-centerOffset.x, -minY, -centerOffset.z);

            const finalMaterial = groupData.material;
            finalMaterial.name = `ProcFirTreeMat_${matName}_${this.assetIdCounter}`;

            parts.push({
                geometry: mergedPartGeometry,
                material: finalMaterial
            });

            groupData.geoms.forEach(g => g.dispose());
        });

        allGeoms.forEach(g => g.dispose());
        trunkMaterial.dispose();
        foliageMaterial.dispose();

        const modelId = `firtree_procedural_${this.assetIdCounter++}`;

        const treeAsset = {
            id: modelId,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(0, finalSize.y / 2, 0),
            sizeAfterFitting: sizeAfterFitting
        };
        console.log("[FirTree Proc] Asset de sapin généré avec succès:", treeAsset);
        return treeAsset;
    }

    /**
     * Fusionne plusieurs géométries en une seule
     * @param {Array<THREE.BufferGeometry>} geometries - Liste des géométries à fusionner
     * @returns {THREE.BufferGeometry} Géométrie fusionnée
     */
    mergeGeometries(geometries) {
        if (!geometries || geometries.length === 0) return null;

        try {
            return mergeGeometries(geometries, false);
        } catch (error) {
            console.error("[FirTree] Erreur lors de la fusion des géométries:", error);
            
            // Implémentation manuelle comme solution de secours
            const attributes = {};
            let vertexCount = 0;
            let indexCount = 0;

            // Première passe : compter les vertices et indices
            geometries.forEach(geometry => {
                for (const name in geometry.attributes) {
                    if (!attributes[name]) {
                        attributes[name] = {
                            array: new Float32Array(0),
                            itemSize: geometry.attributes[name].itemSize
                        };
                    }
                }
                vertexCount += geometry.attributes.position.count;
                if (geometry.index) {
                    indexCount += geometry.index.count;
                }
            });

            // Deuxième passe : allouer les buffers
            for (const name in attributes) {
                attributes[name].array = new Float32Array(vertexCount * attributes[name].itemSize);
            }
            const indices = new Uint32Array(indexCount);

            // Troisième passe : copier les données
            let vertexOffset = 0;
            let indexOffset = 0;

            geometries.forEach(geometry => {
                for (const name in geometry.attributes) {
                    const attribute = geometry.attributes[name];
                    const targetArray = attributes[name].array;
                    for (let i = 0; i < attribute.count; i++) {
                        for (let j = 0; j < attribute.itemSize; j++) {
                            targetArray[vertexOffset * attribute.itemSize + i * attribute.itemSize + j] = 
                                attribute.array[i * attribute.itemSize + j];
                        }
                    }
                }

                if (geometry.index) {
                    for (let i = 0; i < geometry.index.count; i++) {
                        indices[indexOffset + i] = geometry.index.array[i] + vertexOffset;
                    }
                    indexOffset += geometry.index.count;
                }

                vertexOffset += geometry.attributes.position.count;
            });

            // Créer la géométrie finale
            const mergedGeometry = new THREE.BufferGeometry();
            for (const name in attributes) {
                mergedGeometry.setAttribute(
                    name,
                    new THREE.BufferAttribute(attributes[name].array, attributes[name].itemSize)
                );
            }
            mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

            return mergedGeometry;
        }
    }
} 