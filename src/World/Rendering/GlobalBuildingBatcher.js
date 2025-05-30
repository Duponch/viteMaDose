import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Système de batching global pour TOUS les bâtiments
 * Au lieu de créer un InstancedMesh par type de bâtiment, on crée UN SEUL InstancedMesh
 * pour tous les bâtiments du même type de matériau
 */
export default class GlobalBuildingBatcher {
    constructor() {
        // Collections globales par type de matériau
        this.globalBatches = {
            walls: {
                geometries: [],
                matrices: [],
                instanceData: []
            },
            windows: {
                geometries: [],
                matrices: [],
                instanceData: []
            },
            roofs: {
                geometries: [],
                matrices: [],
                instanceData: []
            },
            details: {
                geometries: [],
                matrices: [],
                instanceData: []
            }
        };
        
        // Matériaux unifiés globaux
        this.globalMaterials = {
            walls: null,
            windows: null,
            roofs: null,
            details: null
        };
        
        this.meshes = [];
    }

    /**
     * Ajoute un bâtiment au batch global
     */
    addBuilding(parts, baseMatrix, buildingType, buildingId) {
        parts.forEach(part => {
            if (!part.geometry || !part.material) return;
            
            const category = this.categorize(part.material);
            const batch = this.globalBatches[category];
            
            if (batch) {
                // Cloner la géométrie et appliquer la transformation de la partie
                const geom = part.geometry.clone();
                if (part.matrix) {
                    geom.applyMatrix4(part.matrix);
                }
                
                batch.geometries.push(geom);
                batch.matrices.push(baseMatrix);
                batch.instanceData.push({
                    buildingType,
                    buildingId,
                    originalMaterial: part.material
                });
            }
        });
    }

    /**
     * Catégorise un matériau
     */
    categorize(material) {
        const name = material.name || '';
        
        if (name.match(/window|glass|pane/i)) return 'windows';
        if (name.match(/roof|tile/i)) return 'roofs';
        if (name.match(/wall|ground|floor|base|concrete|brick/i)) return 'walls';
        
        return 'details';
    }

    /**
     * Crée les meshes finaux optimisés
     */
    createOptimizedMeshes() {
        console.log('[GlobalBatcher] Creating optimized meshes...');
        
        // Créer les matériaux globaux
        this.createGlobalMaterials();
        
        const results = [];
        
        for (const [category, batch] of Object.entries(this.globalBatches)) {
            if (batch.geometries.length === 0) continue;
            
            try {
                // Fusionner TOUTES les géométries de cette catégorie
                console.log(`[GlobalBatcher] Merging ${batch.geometries.length} geometries for ${category}`);
                const mergedGeometry = mergeGeometries(batch.geometries, false);
                
                if (!mergedGeometry) {
                    console.warn(`[GlobalBatcher] Failed to merge ${category}`);
                    continue;
                }
                
                // Créer UN SEUL InstancedMesh pour cette catégorie
                const material = this.globalMaterials[category];
                const instancedMesh = new THREE.InstancedMesh(
                    mergedGeometry,
                    material,
                    batch.matrices.length
                );
                
                // Appliquer les matrices
                batch.matrices.forEach((matrix, i) => {
                    instancedMesh.setMatrixAt(i, matrix);
                });
                instancedMesh.instanceMatrix.needsUpdate = true;
                
                // Configuration
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = category !== 'windows';
                instancedMesh.name = `Global_${category}`;
                
                results.push({
                    mesh: instancedMesh,
                    category,
                    count: batch.matrices.length
                });
                
                this.meshes.push(instancedMesh);
                
            } catch (error) {
                console.error(`[GlobalBatcher] Error creating ${category} mesh:`, error);
            }
        }
        
        console.log(`[GlobalBatcher] Created ${results.length} global meshes from ${this.getTotalParts()} parts`);
        return results;
    }

    /**
     * Crée les matériaux globaux unifiés
     */
    createGlobalMaterials() {
        this.globalMaterials.walls = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            roughness: 0.7,
            metalness: 0.0,
            name: 'Global_Walls_Material'
        });
        
        this.globalMaterials.windows = new THREE.MeshPhysicalMaterial({
            color: 0x88CCFF,
            metalness: 0.9,
            roughness: 0.1,
            transmission: 0,
            emissive: new THREE.Color(0xFFFF99),
            emissiveIntensity: 0,
            name: 'Global_Windows_Material'
        });
        
        this.globalMaterials.roofs = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.2,
            name: 'Global_Roofs_Material'
        });
        
        this.globalMaterials.details = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.6,
            metalness: 0.3,
            name: 'Global_Details_Material'
        });
    }

    /**
     * Met à jour les fenêtres globales
     */
    updateWindows(lightsOn) {
        const windowMaterial = this.globalMaterials.windows;
        if (windowMaterial) {
            windowMaterial.emissiveIntensity = lightsOn ? 1.0 : 0.0;
            windowMaterial.needsUpdate = true;
        }
    }

    /**
     * Obtient le nombre total de parties
     */
    getTotalParts() {
        return Object.values(this.globalBatches).reduce(
            (total, batch) => total + batch.geometries.length, 0
        );
    }

    /**
     * Réinitialise le batcher
     */
    reset() {
        // Nettoyer les géométries
        for (const batch of Object.values(this.globalBatches)) {
            batch.geometries.forEach(geom => geom.dispose());
            batch.geometries = [];
            batch.matrices = [];
            batch.instanceData = [];
        }
        
        // Nettoyer les matériaux
        for (const material of Object.values(this.globalMaterials)) {
            if (material) material.dispose();
        }
        
        // Nettoyer les meshes
        this.meshes.forEach(mesh => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.parent) mesh.parent.remove(mesh);
        });
        this.meshes = [];
    }

    /**
     * Destruction complète
     */
    dispose() {
        this.reset();
        this.globalBatches = null;
        this.globalMaterials = null;
    }
}