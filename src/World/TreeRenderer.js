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
            0x556B2F, // Vert forêt
            0x556B2F, // Vert lime
            0x556B2F, // Vert foncé
            0x556B2F, // Vert clair
            0x556B2F, // Vert olive
            0x556B2F  // Vert mer
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
        const maxOffset = baseSize * 0.8; // Déplacement maximum des parties
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
     * Génère un arbre procédural
     * @returns {object} Asset data contenant les parties de l'arbre
     */
    generateProceduralTree(baseWidth = 4, baseHeight = 8, baseDepth = 4, userScale = 1) {
        console.log("[Tree Proc] Début de la génération de l'arbre procédural.");
        const treeGroup = new THREE.Group();

        // Matériaux
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513, name: "TreeTrunkMat" });
        
        // Sélection aléatoire d'une couleur de feuillage
        const foliageColor = this.foliageColors[Math.floor(Math.random() * this.foliageColors.length)];
        const foliageMaterial = new THREE.MeshStandardMaterial({ 
            color: foliageColor, 
            name: "TreeFoliageMat",
            metalness: 0.0,
            roughness: 0.8,
            emissive: new THREE.Color(foliageColor).multiplyScalar(0.05) // Réduit l'émission pour moins de luminosité nocturne
        });

        // Tronc
        const trunkHeight = baseHeight * 0.5;
        const trunkRadiusBottom = baseWidth * 0.15;
        const trunkRadiusTop = baseWidth * 0.1;
        const trunkGeometry = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 6);
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        treeGroup.add(trunk);
        console.log("[Tree Proc] Tronc créé et ajouté au groupe.");

        // Feuillage
        const foliageBaseY = trunkHeight;
        const foliageHeightFactor = baseHeight * 0.7;
        const foliageWidthFactor = baseWidth * 0.7;

        // Créer les trois parties du feuillage avec des tailles différentes
        const foliage1 = new THREE.Mesh(
            this.createLowPolyFoliageGeometry(foliageWidthFactor * 1.1),
            foliageMaterial
        );
        foliage1.position.y = foliageBaseY + foliageHeightFactor * 0.3;
        treeGroup.add(foliage1);

        const foliage2 = new THREE.Mesh(
            this.createLowPolyFoliageGeometry(foliageWidthFactor * 0.9),
            foliageMaterial
        );
        foliage2.position.y = foliageBaseY + foliageHeightFactor * 0.65;
        foliage2.position.x = foliageWidthFactor * 0.4;
        foliage2.rotation.z = Math.PI / 5;
        treeGroup.add(foliage2);

        const foliage3 = new THREE.Mesh(
            this.createLowPolyFoliageGeometry(foliageWidthFactor * 0.8),
            foliageMaterial
        );
        foliage3.position.y = foliageBaseY + foliageHeightFactor * 0.55;
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
            trunkGeometry.dispose();
            foliage1.geometry.dispose();
            foliage2.geometry.dispose();
            foliage3.geometry.dispose();
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