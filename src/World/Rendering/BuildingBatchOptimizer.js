import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Optimiseur agressif de batching pour les bâtiments
 * Réduit drastiquement le nombre de draw calls en fusionnant les géométries
 */
export default class BuildingBatchOptimizer {
    constructor() {
        // Catégories de fusion agressive
        this.materialCategories = {
            walls: { regex: /(wall|ground|floor|base|concrete|brick|facade|building|house|commercial|industrial)/i, materials: new Map() },
            roofs: { regex: /(roof|tile|top)/i, materials: new Map() },
            windows: { regex: /(window|glass|pane)/i, materials: new Map() },
            frames: { regex: /(frame|trim|door|garage|balcony|edge)/i, materials: new Map() },
            metals: { regex: /(metal|steel|iron|aluminum)/i, materials: new Map() },
            details: { regex: /(detail|accent|decor|equipment|antenna|pipe)/i, materials: new Map() }
        };

        // Atlas de textures partagé (pour phase 2)
        this.textureAtlas = null;
        this.atlasMapping = new Map();
    }

    /**
     * Optimise agressivement les parties d'un bâtiment
     * @param {Array} parts - Les parties du bâtiment
     * @param {Array<THREE.Matrix4>} matrices - Les matrices de transformation
     * @param {string} buildingType - Le type de bâtiment
     * @param {string} assetId - L'ID de l'asset
     * @returns {Array} Les meshes optimisés (2-4 meshes au lieu de 15-20)
     */
    optimizeBuilding(parts, matrices, buildingType, assetId) {
        if (!parts || parts.length === 0) return null;

        console.log(`[BatchOptimizer] Optimizing ${buildingType} ${assetId}: ${parts.length} parts`);

        // Étape 1: Catégoriser agressivement les parties
        const categorizedParts = this.categorizeParts(parts);
        console.log(`[BatchOptimizer] Categorized parts:`, Object.keys(categorizedParts).map(k => `${k}: ${categorizedParts[k].parts.length}`).join(', '));
        
        // Étape 2: Créer un matériau unifié par catégorie
        const unifiedMaterials = this.createUnifiedMaterials(categorizedParts, buildingType);
        
        // Étape 3: Fusionner les géométries par catégorie
        const optimizedMeshes = [];
        
        for (const [category, data] of Object.entries(categorizedParts)) {
            if (data.parts.length === 0) continue;
            
            try {
                // Fusionner toutes les géométries de cette catégorie
                const geometries = data.parts.map(p => p.geometry);
                const mergedGeometry = mergeGeometries(geometries, false);
                
                if (!mergedGeometry) {
                    console.warn(`[BatchOptimizer] Failed to merge ${category} geometries`);
                    continue;
                }

                // Utiliser le matériau unifié pour cette catégorie
                const material = unifiedMaterials[category];
                if (!material) {
                    console.warn(`[BatchOptimizer] No unified material for ${category}`);
                    continue;
                }

                // Créer un seul InstancedMesh pour toute la catégorie
                const instancedMesh = new THREE.InstancedMesh(
                    mergedGeometry, 
                    material, 
                    matrices.length
                );
                
                // Configuration des propriétés
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = category !== 'windows';
                instancedMesh.name = `${buildingType}_${assetId}_${category}`;
                
                // Appliquer les matrices
                matrices.forEach((matrix, index) => {
                    instancedMesh.setMatrixAt(index, matrix);
                });
                instancedMesh.instanceMatrix.needsUpdate = true;
                
                optimizedMeshes.push({
                    mesh: instancedMesh,
                    key: `${buildingType}_${assetId}_${category}`,
                    category: category,
                    isWindow: category === 'windows'
                });
                
                console.log(`[BatchOptimizer] Created ${category} mesh with ${matrices.length} instances`);
                
            } catch (error) {
                console.error(`[BatchOptimizer] Error processing ${category}:`, error);
            }
        }

        const reduction = Math.round((1 - optimizedMeshes.length / parts.length) * 100);
        console.log(`[BatchOptimizer] Result: ${parts.length} parts → ${optimizedMeshes.length} meshes (${reduction}% reduction)`);
        
        return optimizedMeshes;
    }

    /**
     * Catégorise agressivement les parties par type
     */
    categorizeParts(parts) {
        const categorized = {
            walls: { parts: [], colors: new Set() },
            roofs: { parts: [], colors: new Set() },
            windows: { parts: [], colors: new Set() },
            frames: { parts: [], colors: new Set() },
            metals: { parts: [], colors: new Set() },
            details: { parts: [], colors: new Set() }
        };

        parts.forEach((part, index) => {
            if (!part.geometry || !part.material) return;
            
            const materialName = part.material.name || '';
            let assigned = false;
            
            // Tester chaque catégorie
            for (const [catName, catData] of Object.entries(this.materialCategories)) {
                if (catData.regex.test(materialName)) {
                    categorized[catName].parts.push(part);
                    if (part.material.color) {
                        categorized[catName].colors.add(part.material.color.getHexString());
                    }
                    assigned = true;
                    console.log(`[BatchOptimizer] Part ${index} "${materialName}" → ${catName}`);
                    break;
                }
            }
            
            // Si non assigné, mettre dans "details"
            if (!assigned) {
                categorized.details.parts.push(part);
                if (part.material.color) {
                    categorized.details.colors.add(part.material.color.getHexString());
                }
                console.log(`[BatchOptimizer] Part ${index} "${materialName}" → details (unmatched)`);
            }
        });

        return categorized;
    }

    /**
     * Crée des matériaux unifiés pour chaque catégorie
     */
    createUnifiedMaterials(categorizedParts, buildingType) {
        const materials = {};
        
        for (const [category, data] of Object.entries(categorizedParts)) {
            if (data.parts.length === 0) continue;
            
            // Récupérer un matériau de référence
            const refPart = data.parts[0];
            const refMaterial = refPart.material;
            
            // Créer un matériau unifié basé sur le type
            let unifiedMaterial;
            
            if (category === 'windows') {
                // Matériau spécial pour les fenêtres
                unifiedMaterial = new THREE.MeshPhysicalMaterial({
                    color: this.getAverageColor(data.colors),
                    metalness: 0.9,
                    roughness: 0.1,
                    transmission: 0,
                    emissive: new THREE.Color(0xFFFF99),
                    emissiveIntensity: 0,
                    name: `Unified_${buildingType}_Windows`
                });
            } else if (category === 'roofs') {
                // Matériau pour les toits
                unifiedMaterial = new THREE.MeshStandardMaterial({
                    color: this.getAverageColor(data.colors) || 0x8B4513,
                    roughness: 0.8,
                    metalness: 0.2,
                    name: `Unified_${buildingType}_Roofs`
                });
            } else if (category === 'metals') {
                // Matériau métallique
                unifiedMaterial = new THREE.MeshStandardMaterial({
                    color: this.getAverageColor(data.colors) || 0x888888,
                    metalness: 0.8,
                    roughness: 0.3,
                    name: `Unified_${buildingType}_Metals`
                });
            } else {
                // Matériau standard pour les autres catégories
                unifiedMaterial = new THREE.MeshStandardMaterial({
                    color: this.getAverageColor(data.colors) || refMaterial.color,
                    roughness: refMaterial.roughness || 0.7,
                    metalness: refMaterial.metalness || 0.0,
                    name: `Unified_${buildingType}_${category}`
                });
            }
            
            // Copier les propriétés importantes du matériau de référence
            if (refMaterial.map) unifiedMaterial.map = refMaterial.map;
            if (refMaterial.normalMap) unifiedMaterial.normalMap = refMaterial.normalMap;
            if (refMaterial.aoMap) unifiedMaterial.aoMap = refMaterial.aoMap;
            
            materials[category] = unifiedMaterial;
        }
        
        return materials;
    }

    /**
     * Calcule la couleur moyenne d'un ensemble de couleurs
     */
    getAverageColor(colorSet) {
        if (colorSet.size === 0) return null;
        if (colorSet.size === 1) return new THREE.Color('#' + colorSet.values().next().value);
        
        let r = 0, g = 0, b = 0;
        colorSet.forEach(hex => {
            const color = new THREE.Color('#' + hex);
            r += color.r;
            g += color.g;
            b += color.b;
        });
        
        const count = colorSet.size;
        return new THREE.Color(r / count, g / count, b / count);
    }

    /**
     * Prépare un atlas de textures (pour optimisation future)
     */
    prepareTextureAtlas(textures) {
        // TODO: Implémenter la création d'atlas de textures
        // Ceci permettrait de réduire encore plus les draw calls
        // en utilisant un seul matériau avec différentes UV
    }

    /**
     * Nettoie les ressources
     */
    dispose() {
        // Nettoyer les matériaux unifiés
        for (const category of Object.values(this.materialCategories)) {
            category.materials.forEach(material => {
                if (material && typeof material.dispose === 'function') {
                    material.dispose();
                }
            });
            category.materials.clear();
        }
        
        // Nettoyer l'atlas de textures si présent
        if (this.textureAtlas) {
            this.textureAtlas.dispose();
            this.textureAtlas = null;
        }
        
        this.atlasMapping.clear();
    }
}