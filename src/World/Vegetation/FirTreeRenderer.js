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
        
        // Couleur de base pour le feuillage unique, comme dans l'original
        this.fixedFoliageBaseColor = 0x207020; // '#207020'

        // Création des textures partagées
        this.sharedTrunkTexture = this.createTrunkTexture();
        this.sharedFoliageTexture = this.createFoliageTexture(this.fixedFoliageBaseColor);
    }

    /**
     * Crée une texture procédurale pour les troncs d'arbres, style original
     * @returns {THREE.CanvasTexture} Texture générée pour les troncs
     */
    createTrunkTexture() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 128;

        // Fond marron de base
        context.fillStyle = '#150b01'; // Marron beaucoup plus foncé (Original: '#654321')
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Ajout de lignes verticales plus sombres et plus claires pour simuler l'écorce
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * canvas.width;
            const colorShade = Math.random() > 0.5 ? '#230b01' : '#070300'; // Alternance de teintes plus foncées
            context.strokeStyle = colorShade;
            context.lineWidth = Math.random() * 2 + 1; // Épaisseur variable
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x + (Math.random() - 0.5) * 5, canvas.height); // Lignes légèrement inclinées
            context.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1); // Répéter la texture horizontalement
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Crée une texture procédurale pour les feuillages des sapins, style original
     * @param {number} baseHexColor - Couleur de base du feuillage (ex: 0x207020)
     * @returns {THREE.CanvasTexture} Texture générée pour les feuillages
     */
    createFoliageTexture(baseHexColor) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 128;

        const color = new THREE.Color(baseHexColor);
        context.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Ajout de lignes verticales de différentes teintes de vert
        for (let i = 0; i < 80; i++) { // Plus de lignes pour le feuillage
            const x = Math.random() * canvas.width;
            const yStart = Math.random() * canvas.height * 0.3; // Lignes ne commencent pas toutes en haut
            const length = (Math.random() * 0.5 + 0.5) * (canvas.height - yStart); // Longueur variable
            // Teintes de vert plus foncées que la base #207020
            const greenShade = Math.random() > 0.7 ? '#0a2a0a' : 
                             (Math.random() > 0.4 ? '#0d300d' : 
                             (Math.random() > 0.2 ? '#0b2b0b' : '#0a2a0a'));
            context.strokeStyle = greenShade;
            context.lineWidth = Math.random() * 1.2 + 0.3;
            context.beginPath();
            context.moveTo(x, yStart);
            context.lineTo(x + (Math.random() - 0.5) * 6, yStart + length);
            context.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 2); // Répéter la texture pour un effet plus dense
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Génère un sapin procédural avec des cônes empilés, dimensions et style de l'original
     * @param {number} baseWidth - (Ignoré pour dimensions, utilisé pour mise à l'échelle conceptuelle si fittingScaleFactor était calculé dynamiquement)
     * @param {number} baseHeight - (Ignoré pour dimensions)
     * @param {number} baseDepth - (Ignoré pour dimensions)
     * @param {number} userScale - Facteur d'échelle spécifié par l'utilisateur
     * @returns {object|null} Asset data contenant les parties du sapin, ou null en cas d'erreur
     */
    generateProceduralTree(baseWidth = 4, baseHeight = 8, baseDepth = 4, userScale = 1) {
        console.log("[FirTree Proc] Début de la génération du sapin (style original).");
        const sourceTreeGroup = new THREE.Group(); // Groupe temporaire pour positionner les éléments comme dans l'original

        // Matériaux (style original)
        const trunkMaterial = new THREE.MeshStandardMaterial({
            map: this.sharedTrunkTexture,
            roughness: 0.8,
            metalness: 0.1,
            name: "FirTreeTrunkMat_OriginalStyle" 
        });
        
        const foliageMaterial = new THREE.MeshStandardMaterial({
            map: this.sharedFoliageTexture,
            roughness: 0.7,
            metalness: 0.1,
            name: "FirTreeFoliageMat_OriginalStyle"
        });

        // Tronc de l'arbre (dimensions et position de l'original)
        // Original: CylinderGeometry(0.4, 0.5, 2.5, 6); trunk.position.y = -0.75;
        const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 6);
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = -0.75; 
        sourceTreeGroup.add(trunk);
        
        // Feuillage de l'arbre (3 cônes, dimensions et positions de l'original)
        const coneSegments = 6;

        // Cône inférieur
        // Original: ConeGeometry(2, 3, coneSegments); cone1.position.y = 1.5;
        const cone1Geometry = new THREE.ConeGeometry(2, 3, coneSegments);
        const cone1 = new THREE.Mesh(cone1Geometry, foliageMaterial);
        cone1.position.y = 1.5;
        sourceTreeGroup.add(cone1);

        // Cône du milieu
        // Original: ConeGeometry(1.5, 2.5, coneSegments); cone2.position.y = cone1.position.y + 1.25; (soit 2.75)
        const cone2Geometry = new THREE.ConeGeometry(1.5, 2.5, coneSegments);
        const cone2 = new THREE.Mesh(cone2Geometry, foliageMaterial);
        cone2.position.y = 2.75; 
        sourceTreeGroup.add(cone2);

        // Cône supérieur
        // Original: ConeGeometry(1, 2, coneSegments); cone3.position.y = cone2.position.y + 1.0; (soit 3.75)
        const cone3Geometry = new THREE.ConeGeometry(1, 2, coneSegments);
        const cone3 = new THREE.Mesh(cone3Geometry, foliageMaterial);
        cone3.position.y = 3.75;
        sourceTreeGroup.add(cone3);

        // Fusion et calcul de BBox
        const allGeoms = [];
        const materialMap = new Map();

        sourceTreeGroup.updateMatrixWorld(true); // Assurer que les matrices du groupe sont à jour

        sourceTreeGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                // Appliquer la transformation du child pour que la géométrie soit en "world space" du sourceTreeGroup
                const clonedGeom = child.geometry.clone();
                clonedGeom.applyMatrix4(child.matrixWorld); // Applique la transformation locale ET celle du parent (sourceTreeGroup)

                if (!clonedGeom.index) {
                    const position = clonedGeom.attributes.position;
                    if (position) {
                        const count = position.count;
                        const indices = new Uint16Array(count);
                        for (let i = 0; i < count; i++) indices[i] = i;
                        clonedGeom.setIndex(new THREE.BufferAttribute(indices, 1));
                    }
                }
                allGeoms.push(clonedGeom);

                const matName = child.material.name || 'default_firtree_mat';
                if (!materialMap.has(matName)) {
                    materialMap.set(matName, { material: child.material.clone(), geoms: [] }); // Cloner pour éviter modif accidentelle
                }
                materialMap.get(matName).geoms.push(clonedGeom);
            }
        });

        if (allGeoms.length === 0) {
            console.error("[FirTree Proc] Aucune géométrie valide trouvée après le parcours du groupe.");
            // Pas besoin de disposer trunkMaterial et foliageMaterial ici car ils sont partagés ou clonés
            return null;
        }

        const mergedSceneGeometry = this.mergeGeometries(allGeoms); // Fusionne toutes les géométries pour le calcul global BBox
        if (!mergedSceneGeometry) {
            console.error("[FirTree Proc] Échec de la fusion des géométries pour BBox.");
            allGeoms.forEach(g => g.dispose());
            return null;
        }
        
        mergedSceneGeometry.computeBoundingBox();
        const bbox = mergedSceneGeometry.boundingBox.clone(); // Cloner pour éviter des modifications inattendues
        mergedSceneGeometry.dispose(); // Plus besoin de cette géométrie combinée globale

        const centerOffsetGlobal = new THREE.Vector3();
        bbox.getCenter(centerOffsetGlobal);
        const minYGlobal = bbox.min.y;

        // Créer les parts pour chaque matériau
        const parts = [];
        materialMap.forEach((groupData, matName) => {
            if (groupData.geoms.length === 0) return;

            const mergedPartGeometry = this.mergeGeometries(groupData.geoms);
            if (!mergedPartGeometry) {
                console.error(`[FirTree Proc] Échec de la fusion des géométries pour le matériau ${matName}.`);
                groupData.geoms.forEach(g => g.dispose()); // Disposer les clones si la fusion échoue
                return;
            }

            // Translater chaque part pour que l'ensemble de l'arbre (défini par bbox globale) ait sa base à Y=0
            mergedPartGeometry.translate(-centerOffsetGlobal.x, -minYGlobal, -centerOffsetGlobal.z);
            
            // Les groupData.material sont déjà des clones, on peut modifier leur nom
            groupData.material.name = `ProcFirTreeMat_${matName}_${this.assetIdCounter}`;

            parts.push({
                geometry: mergedPartGeometry,
                material: groupData.material 
            });
            // groupData.geoms (clones) ont été fusionnés, ils sont disposés par mergeGeometries si succès, sinon ici.
            // Si mergeGeometries ne dispose pas les sources, il faudrait le faire ici.
            // BufferGeometryUtils.mergeGeometries ne dispose pas les géométries source.
            // Cependant, nos 'groupData.geoms' sont déjà des clones qui ne seront plus utilisés ailleurs.
            // Laissons le garbage collector s'en charger ou disposons explicitement si besoin avéré.
            // Pour plus de propreté, disposons les géométries clonées sources après leur fusion dans 'mergedPartGeometry'
            groupData.geoms.forEach(g => g.dispose());
        });
        
        // Les géométries dans 'allGeoms' sont les mêmes que celles dans 'groupData.geoms', donc déjà traitées.
        // On ne les dispose pas ici une seconde fois.

        // Calculer la BBox finale de l'arbre assemblé (qui est maintenant à la base Y=0)
        const finalCombinedGeomForBBox = this.mergeGeometries(parts.map(p => p.geometry.clone())); // Cloner pour ne pas affecter les parts
        if (!finalCombinedGeomForBBox) {
             console.error("[FirTree Proc] Echec de la fusion des géométries finales pour BBox.");
             parts.forEach(p => p.geometry.dispose()); // Nettoyer les parts créées
             return null;
        }
        finalCombinedGeomForBBox.computeBoundingBox();
        const finalBBox = finalCombinedGeomForBBox.boundingBox;
        const finalSize = new THREE.Vector3();
        finalBBox.getSize(finalSize);
        finalCombinedGeomForBBox.dispose();


        finalSize.x = Math.max(finalSize.x, 0.001);
        finalSize.y = Math.max(finalSize.y, 0.001);
        finalSize.z = Math.max(finalSize.z, 0.001);

        const modelId = `firtree_procedural_orig_style_${this.assetIdCounter++}`;

        const treeAsset = {
            id: modelId,
            parts: parts,
            fittingScaleFactor: 1.0, // Les dimensions sont fixes, donc le fitting factor est 1.
            userScale: userScale,    // L'échelle utilisateur est toujours applicable.
            // Le centre de l'asset est maintenant au milieu de sa BBox (après translation à Y=0 pour sa base)
            centerOffset: new THREE.Vector3(0, finalSize.y / 2 * userScale, 0), // Appliquer userScale ici si la taille finale est attendue
            sizeAfterFitting: finalSize.clone() // Taille avant userScale
        };
        console.log("[FirTree Proc] Asset de sapin (style original) généré:", treeAsset);
        return treeAsset;
    }

    /**
     * Fusionne plusieurs géométries en une seule.
     * Gère le cas où les géométries sources doivent être disposées si elles ne sont plus utiles.
     * @param {Array<THREE.BufferGeometry>} geometries - Liste des géométries à fusionner.
     * @param {boolean} disposeSources - Si true, dispose les géométries sources après fusion.
     * @returns {THREE.BufferGeometry|null} Géométrie fusionnée ou null.
     */
    mergeGeometries(geometries, disposeSources = false) { // Par défaut, ne dispose pas les sources
        if (!geometries || geometries.length === 0) return null;
        
        // Filtrer les géométries potentiellement nulles ou invalides si nécessaire
        const validGeometries = geometries.filter(g => g instanceof THREE.BufferGeometry);
        if (validGeometries.length === 0) return null;

        try {
            const merged = mergeGeometries(validGeometries, false); // false = ne pas utiliser de groupes
            if (disposeSources) {
                validGeometries.forEach(g => g.dispose());
            }
            return merged;
        } catch (error) {
            console.error("[FirTree] Erreur lors de la fusion des géométries avec BufferGeometryUtils:", error);
            // La solution de secours manuelle est complexe et peut avoir des problèmes de performance/compatibilité.
            // Il est préférable de s'assurer que mergeGeometries de BufferGeometryUtils fonctionne.
            // Pour l'instant, on retourne null en cas d'échec avec l'utilitaire.
            if (disposeSources) {
                validGeometries.forEach(g => g.dispose());
            }
            return null; 
        }
    }
}