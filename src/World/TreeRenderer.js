import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Gère la génération et le rendu des arbres procéduraux
 */
export default class TreeRenderer {
    /**
     * @param {object} config - Configuration globale
     * @param {object} materials - Collection de matériaux partagés
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.assetIdCounter = 0;
        
        // Palette de couleurs de feuillage
        this.foliageColors = [
            0x8fa46d, // Vert forêt
            0x8fa46d, // Vert lime
            0x8fa46d, // Vert foncé
            0x8fa46d, // Vert clair
            0x8fa46d, // Vert olive
            0x8fa46d  // Vert mer
        ];
    }

    /**
     * Crée une géométrie de feuillage en assemblant plusieurs icosaèdres
     * @param {number} baseSize - Taille de base pour le feuillage
     * @returns {THREE.BufferGeometry} Géométrie fusionnée du feuillage
     */
    createLowPolyFoliageGeometry(baseSize) {
        const foliagePartGeometries = [];
        const baseGeometry = new THREE.IcosahedronGeometry(baseSize, 0);

        // Paramètres de randomisation
        const numParts = THREE.MathUtils.randInt(4, 7); // Nombre de parties du feuillage
        const maxOffset = baseSize * 0.6; // Déplacement maximum des parties
        const minPartScale = 0.4;
        const maxPartScale = 0.8;

        for (let i = 0; i < numParts; i++) {
            // Position aléatoire avec plus de variation en hauteur
            const randomPosition = new THREE.Vector3(
                (Math.random() - 0.5) * 2 * maxOffset,
                (Math.random() - 0.5) * 2 * maxOffset * 0.7, // Plus de variation verticale
                (Math.random() - 0.5) * 2 * maxOffset
            );
            
            // Échelle aléatoire
            const randomScale = THREE.MathUtils.randFloat(minPartScale, maxPartScale);
            const scaleVector = new THREE.Vector3(randomScale, randomScale, randomScale);
            
            // Matrice de transformation
            const matrix = new THREE.Matrix4();
            matrix.compose(randomPosition, new THREE.Quaternion(), scaleVector);

            // Cloner et transformer la géométrie
            const clonedGeom = baseGeometry.clone();
            clonedGeom.applyMatrix4(matrix);
            foliagePartGeometries.push(clonedGeom);
        }

        // Fusionner toutes les parties
        const mergedGeometry = mergeGeometries(foliagePartGeometries, false);
        
        // Nettoyer les géométries temporaires
        foliagePartGeometries.forEach(geom => geom.dispose());
        baseGeometry.dispose();

        if (mergedGeometry) {
            mergedGeometry.center(); // Centrer la forme finale
            return mergedGeometry;
        } else {
            console.warn("Échec de la fusion de la géométrie du feuillage.");
            return new THREE.IcosahedronGeometry(baseSize, 0); // Fallback
        }
    }

    /**
     * Crée des nœuds (protuberances) sur le tronc de l'arbre
     * @param {number} trunkHeight - Hauteur du tronc
     * @param {number} trunkRadius - Rayon du tronc
     * @param {THREE.Material} material - Matériau à utiliser pour les nœuds
     * @returns {Array<THREE.Mesh>} Liste des nœuds créés
     */
    createTrunkKnots(trunkHeight, trunkRadius, material) {
        const knots = [];
        const numKnots = THREE.MathUtils.randInt(2, 5); // Nombre aléatoire de nœuds
        
        for (let i = 0; i < numKnots; i++) {
            // Position verticale aléatoire sur le tronc
            const heightPosition = Math.random() * trunkHeight;
            
            // Angle aléatoire autour du tronc
            const angle = Math.random() * Math.PI * 2;
            
            // Taille aléatoire du nœud
            const knotSize = trunkRadius * THREE.MathUtils.randFloat(0.4, 0.6);
            
            // Créer une géométrie de sphère pour le nœud
            const knotGeometry = new THREE.SphereGeometry(knotSize, 4, 4);
            
            // Créer le mesh du nœud
            const knot = new THREE.Mesh(knotGeometry, material);
            
            // Positionner le nœud sur le tronc
            knot.position.y = heightPosition;
            knot.position.x = Math.cos(angle) * (trunkRadius - 0.3);
            knot.position.z = Math.sin(angle) * (trunkRadius - 0.3);
            
            // Rotation aléatoire pour plus de variété
            knot.rotation.x = Math.random() * Math.PI * 0.2;
            knot.rotation.y = Math.random() * Math.PI * 0.2;
            knot.rotation.z = Math.random() * Math.PI * 0.2;
            
            knots.push(knot);
        }
        
        return knots;
    }

    /**
     * Crée un tronc courbé en utilisant une déformation de géométrie
     * @param {number} trunkHeight - Hauteur totale du tronc
     * @param {number} trunkRadiusBottom - Rayon à la base du tronc
     * @param {number} trunkRadiusTop - Rayon au sommet du tronc
     * @param {THREE.Material} material - Matériau du tronc
     * @returns {THREE.Mesh} Mesh du tronc courbé
     */
    createCurvedTrunk(trunkHeight, trunkRadiusBottom, trunkRadiusTop, material) {
        // Créer une géométrie de cylindre avec plus de segments pour une meilleure déformation
        const trunkGeometry = new THREE.CylinderGeometry(
            trunkRadiusTop, 
            trunkRadiusBottom, 
            trunkHeight, 
            4, // Plus de segments horizontaux
            8, // Plus de segments verticaux
            false
        );
        
        // Obtenir les positions des vertices
        const positions = trunkGeometry.attributes.position.array;
        
        // Paramètres de courbure
        const curveAmount = trunkHeight * 0.1; // Intensité de la courbure (15% de la hauteur)
        const curveDirection = new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(1),
            0,
            THREE.MathUtils.randFloatSpread(1)
        ).normalize();
        
        // Appliquer une déformation sinusoïdale pour créer une courbure naturelle
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i + 1]; // Coordonnée Y du vertex
            const heightFactor = y / trunkHeight; // Facteur de hauteur (0 à 1)
            
            // Calculer le déplacement en fonction de la hauteur (courbe sinusoïdale)
            const displacement = Math.sin(heightFactor * Math.PI) * curveAmount;
            
            // Appliquer le déplacement dans la direction de courbure
            positions[i] += curveDirection.x * displacement; // X
            positions[i + 2] += curveDirection.z * displacement; // Z
            
            // Ajouter une légère variation aléatoire pour plus de naturel
            const randomFactor = THREE.MathUtils.randFloat(0.95, 1.05);
            positions[i] *= randomFactor;
            positions[i + 2] *= randomFactor;
        }
        
        // Mettre à jour les normales pour un éclairage correct
        trunkGeometry.computeVertexNormals();
        
        // Créer le mesh du tronc
        const trunk = new THREE.Mesh(trunkGeometry, material);
        
        // Ajouter une légère rotation aléatoire pour plus de variété
        trunk.rotation.y = THREE.MathUtils.randFloatSpread(Math.PI / 12);
        trunk.rotation.z = THREE.MathUtils.randFloatSpread(Math.PI / 24);
        
        return trunk;
    }

    /**
     * Crée une texture procédurale pour les troncs d'arbres
     * @returns {THREE.CanvasTexture} Texture générée pour les troncs
     */
    createTrunkTexture() {
        // Créer un canvas pour dessiner la texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Couleur de base du tronc
        const baseColor = new THREE.Color(0x8B4513);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter des variations de couleur pour simuler l'écorce
        for (let i = 0; i < 100; i++) {
            // Position aléatoire
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            
            // Taille aléatoire
            const size = Math.random() * 20 + 5;
            
            // Variation de couleur (plus claire ou plus foncée)
            const variation = Math.random() * 60 - 20;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            // Dessiner une forme irrégulière pour simuler l'écorce
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let j = 0; j < 8; j++) {
                const angle = (j / 8) * Math.PI * 2;
                const radius = size * (0.7 + Math.random() * 0.6);
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
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
        texture.repeat.set(1, 2); // Répéter verticalement pour couvrir toute la hauteur du tronc
        
        return texture;
    }

    /**
     * Crée une texture procédurale pour les feuillages
     * @param {number} baseColor - Couleur de base du feuillage
     * @returns {THREE.CanvasTexture} Texture générée pour les feuillages
     */
    createFoliageTexture(baseColor) {
        // Créer un canvas pour dessiner la texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Convertir la couleur de base en RGB
        const color = new THREE.Color(baseColor);
        ctx.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter des variations de couleur pour simuler les feuilles
        for (let i = 0; i < 200; i++) {
            // Position aléatoire
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            
            // Taille aléatoire
            const size = Math.random() * 15 + 5;
            
            // Variation de couleur (plus claire ou plus foncée)
            const variation = Math.random() * 60 - 20;
            const r = Math.max(0, Math.min(255, color.r * 255 + variation));
            const g = Math.max(0, Math.min(255, color.g * 255 + variation));
            const b = Math.max(0, Math.min(255, color.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            // Dessiner une forme de feuille
            ctx.beginPath();
            
            // Forme de feuille stylisée
            const leafType = Math.floor(Math.random() * 3);
            
            if (leafType === 0) {
                // Feuille ovale
                ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2);
            } else if (leafType === 1) {
                // Feuille pointue
                ctx.moveTo(x, y - size);
                ctx.quadraticCurveTo(x + size, y, x, y + size);
                ctx.quadraticCurveTo(x - size, y, x, y - size);
            } else {
                // Feuille dentelée
                const numPoints = 8;
                for (let j = 0; j < numPoints; j++) {
                    const angle = (j / numPoints) * Math.PI * 2;
                    const radius = size * (0.8 + Math.random() * 0.4);
                    const px = x + Math.cos(angle) * radius;
                    const py = y + Math.sin(angle) * radius;
                    
                    if (j === 0) {
                        ctx.moveTo(px, py);
                    } else {
                        ctx.lineTo(px, py);
                    }
                }
                ctx.closePath();
            }
            
            ctx.fill();
            
            // Ajouter des détails (veines) à certaines feuilles
            if (Math.random() > 0.7) {
                ctx.strokeStyle = `rgba(${r * 0.7}, ${g * 0.7}, ${b * 0.7}, 0.5)`;
                ctx.lineWidth = 1;
                
                if (leafType === 0 || leafType === 1) {
                    // Veine centrale
                    ctx.beginPath();
                    ctx.moveTo(x, y - size * 0.8);
                    ctx.lineTo(x, y + size * 0.8);
                    ctx.stroke();
                    
                    // Veines latérales
                    for (let j = 1; j <= 3; j++) {
                        const offset = size * 0.3 * j;
                        ctx.beginPath();
                        ctx.moveTo(x, y - size * 0.5 + offset);
                        ctx.lineTo(x + offset, y - size * 0.2 + offset);
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.moveTo(x, y - size * 0.5 + offset);
                        ctx.lineTo(x - offset, y - size * 0.2 + offset);
                        ctx.stroke();
                    }
                }
            }
        }
        
        // Ajouter quelques points plus clairs pour simuler la lumière sur les feuilles
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 3 + 1;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Créer la texture à partir du canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2); // Répéter pour couvrir toute la surface
        
        return texture;
    }

    /**
     * Génère un arbre procédural
     * @returns {object} Asset data contenant les parties de l'arbre
     */
    generateProceduralTree(baseWidth = 4, baseHeight = 8, baseDepth = 4, userScale = 1) {
        console.log("[Tree Proc] Début de la génération de l'arbre procédural.");
        const treeGroup = new THREE.Group();

        // Créer la texture procédurale pour le tronc
        const trunkTexture = this.createTrunkTexture();
        
        // Matériaux
        const trunkMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x8B4513, 
            name: "TreeTrunkMat",
            map: trunkTexture
        });
        
        // Sélection aléatoire d'une couleur de feuillage
        const foliageColor = this.foliageColors[Math.floor(Math.random() * this.foliageColors.length)];
        
        // Créer la texture procédurale pour le feuillage
        const foliageTexture = this.createFoliageTexture(foliageColor);
        
        const foliageMaterial = new THREE.MeshStandardMaterial({ 
            color: foliageColor, 
            name: "TreeFoliageMat",
            metalness: 0.0,
            roughness: 0.8,
            map: foliageTexture,
            emissive: new THREE.Color(foliageColor).multiplyScalar(0.05) // Réduit l'émission pour moins de luminosité nocturne
        });

        // Tronc courbé
        const trunkHeight = baseHeight * 0.5;
        const trunkRadiusBottom = baseWidth * 0.15;
        const trunkRadiusTop = baseWidth * 0.1;
        
        // Remplacer le tronc droit par un tronc courbé
        const trunk = this.createCurvedTrunk(trunkHeight, trunkRadiusBottom, trunkRadiusTop, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        treeGroup.add(trunk);
        console.log("[Tree Proc] Tronc courbé créé et ajouté au groupe.");
        
        // Ajouter des nœuds au tronc
        /* const trunkKnots = this.createTrunkKnots(trunkHeight, trunkRadiusBottom, trunkMaterial);
        trunkKnots.forEach(knot => {
            treeGroup.add(knot);
        }); */
        console.log("[Tree Proc] Nœuds ajoutés au tronc.");

        // Feuillage
        const foliageBaseY = trunkHeight;
        const foliageHeightFactor = baseHeight * 0.7;
        const foliageWidthFactor = baseWidth * 0.7;

        // Créer les trois parties du feuillage avec des tailles différentes
        const foliage1 = new THREE.Mesh(
            this.createLowPolyFoliageGeometry(foliageWidthFactor * 1.1),
            foliageMaterial
        );
        foliage1.position.y = foliageBaseY + foliageHeightFactor * 0.25;
        treeGroup.add(foliage1);

        const foliage2 = new THREE.Mesh(
            this.createLowPolyFoliageGeometry(foliageWidthFactor * 0.9),
            foliageMaterial
        );
        foliage2.position.y = foliageBaseY + foliageHeightFactor * 0.6;
        foliage2.position.x = foliageWidthFactor * 0.4;
        foliage2.rotation.z = Math.PI / 5;
        treeGroup.add(foliage2);

        const foliage3 = new THREE.Mesh(
            this.createLowPolyFoliageGeometry(foliageWidthFactor * 0.8),
            foliageMaterial
        );
        foliage3.position.y = foliageBaseY + foliageHeightFactor * 0.5;
        foliage3.position.x = -foliageWidthFactor * 0.35;
        foliage3.rotation.z = -Math.PI / 6;
        treeGroup.add(foliage3);
        console.log("[Tree Proc] Feuillage créé et ajouté au groupe.");

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

                const matName = child.material.name || 'default_tree_mat';
                if (!materialMap.has(matName)) {
                    materialMap.set(matName, { material: child.material.clone(), geoms: [] });
                }
                materialMap.get(matName).geoms.push(clonedGeom);
            }
        });
        console.log("[Tree Proc] Parcours du groupe terminé. Nombre de géométries collectées:", allGeoms.length);

        if (allGeoms.length === 0) {
            console.error("[Tree Proc] Aucune géométrie valide trouvée après le parcours du groupe.");
            trunkMaterial.dispose();
            foliageMaterial.dispose();
            return null;
        }

        // Fusionner toutes les géométries
        const mergedGeometry = this.mergeGeometries(allGeoms);
        if (!mergedGeometry) {
            console.error("[Tree Proc] Échec de la fusion des géométries.");
            allGeoms.forEach(g => g.dispose());
            trunkMaterial.dispose();
            foliageMaterial.dispose();
            return null;
        }
        console.log("[Tree Proc] Géométries fusionnées avec succès.");

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
                console.error(`[Tree Proc] Échec de la fusion des géométries pour le matériau ${matName}.`);
                groupData.geoms.forEach(g => g.dispose());
                return;
            }

            mergedPartGeometry.translate(-centerOffset.x, -minY, -centerOffset.z);

            const finalMaterial = groupData.material;
            finalMaterial.name = `ProcTreeMat_${matName}_${this.assetIdCounter}`;

            parts.push({
                geometry: mergedPartGeometry,
                material: finalMaterial
            });

            groupData.geoms.forEach(g => g.dispose());
        });

        allGeoms.forEach(g => g.dispose());
        trunkMaterial.dispose();
        foliageMaterial.dispose();

        const modelId = `tree_procedural_${this.assetIdCounter++}`;

        const treeAsset = {
            id: modelId,
            parts: parts,
            fittingScaleFactor: fittingScaleFactor,
            userScale: userScale,
            centerOffset: new THREE.Vector3(0, finalSize.y / 2, 0),
            sizeAfterFitting: sizeAfterFitting
        };
        console.log("[Tree Proc] Asset d'arbre généré avec succès:", treeAsset);
        return treeAsset;
    }

    /**
     * Fusionne plusieurs géométries en une seule
     * @param {Array<THREE.BufferGeometry>} geometries - Liste des géométries à fusionner
     * @returns {THREE.BufferGeometry} Géométrie fusionnée
     */
    mergeGeometries(geometries) {
        if (!geometries || geometries.length === 0) return null;

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