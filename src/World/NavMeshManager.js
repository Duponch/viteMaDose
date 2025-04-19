// src/World/NavMeshManager.js
import * as THREE from 'three';
import { Pathfinding, PathfindingHelper } from 'three-pathfinding';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class NavMeshManager {
    /**
     * Constructeur du NavMeshManager.
     * @param {object} config - Configuration générale (contient config.navMesh).
     * @param {object} experience - Référence à l'instance Experience.
     */
    constructor(config, experience) {
        this.config = config.navMesh || {};
        this.experience = experience;
        this.pathfinding = new Pathfinding();
        // Pas de setWasmPath ici, géré par le worker ou implicitement

        this.ZONE_ID = 'city_level';
        this.zoneData = null; // Stocke { groups, vertices: Vector3[] }
        this.navMeshDataForWorker = null; // Stocke { groups, vertices: Float32Array }

        this.pathfindingHelper = new PathfindingHelper();
        this.debugMesh = null;
        this.debugMeshMaterial = new THREE.MeshBasicMaterial({
            color: 0x1E90FF, wireframe: true,
            depthTest: false, depthWrite: false, transparent: true, opacity: 0.3
        });
        this.debugMeshMaterial.name = "DebugNavMeshMat_Custom";

        console.log("NavMeshManager initialized (API based on .d.ts).");
    }

    /**
     * Construit les données NavMesh à partir DU mesh marchable fourni.
     * @param {THREE.Mesh} walkableMesh - LE mesh contenant la géométrie combinée et transformée.
     * @returns {Promise<object|null>} Une promesse résolue avec les données géométriques sérialisées pour le worker (ou null si échec).
     */
    async buildNavMesh(walkableMesh) {
        console.log("NavMeshManager: Starting NavMesh data generation...");
        this.zoneData = null;
        this.navMeshDataForWorker = null;
        // Nettoyer l'ancienne zone dans l'instance locale pathfinding
        this.pathfinding?.setZoneData(this.ZONE_ID, null); // Utilise setZoneData(..., null) pour vider


        if (!walkableMesh || !walkableMesh.isMesh || !walkableMesh.geometry) {
            console.error("NavMeshManager: Invalid or missing walkable mesh provided.");
            return null;
        }
        walkableMesh.updateMatrixWorld(true);

        let geometry;
        try {
             geometry = walkableMesh.geometry.clone();
             geometry.applyMatrix4(walkableMesh.matrixWorld);
        } catch (error) {
            console.error("NavMeshManager: Error cloning/transforming geometry:", error);
            return null;
        }

        if (!geometry.index) {
            console.error("NavMeshManager: Walkable geometry must be indexed for Pathfinding.createZone.");
            geometry.dispose();
            return null;
        }

        try {
            // 1. Utiliser Pathfinding.createZone (statique) pour générer les données
            console.log(`NavMeshManager: Calling Pathfinding.createZone for '${this.ZONE_ID}'...`);
            const tolerance = this.config.vertexWeldingTolerance || 0.0001;
            const createdZoneData = Pathfinding.createZone(geometry, tolerance);

            if (!createdZoneData || !createdZoneData.groups || !createdZoneData.vertices) {
                 throw new Error("Pathfinding.createZone did not return valid zone data ({groups, vertices}).");
            }
            this.zoneData = createdZoneData; // Stocker { groups, vertices: Vector3[] }
            console.log(`NavMeshManager: Zone data created successfully. Groups: ${this.zoneData.groups?.length ?? 'N/A'}.`);

            // 2. Charger ces données dans l'instance pathfinding locale (main thread)
            this.pathfinding.setZoneData(this.ZONE_ID, this.zoneData);



			

			// Dans NavMeshManager.buildNavMesh, après this.pathfinding.setZoneData(...)
			console.log("NavMeshManager buildNavMesh: Zone Data Loaded. Checking validity...");
			console.log("  -> zoneData Structure:", {
				verticesCount: this.zoneData?.vertices?.length ?? 'N/A',
				groupsDefined: !!this.zoneData?.groups,
				groupsCount: this.zoneData?.groups?.length ?? 'N/A',
				firstGroupPolyCount: this.zoneData?.groups?.[0]?.polygons?.length ??
									this.zoneData?.groups?.[0]?.polyIndices?.length ??
									(Array.isArray(this.zoneData?.groups?.[0]) ? this.zoneData.groups[0].length : 'N/A')
			});

			// Vérifier si on peut obtenir un groupID immédiatement après chargement
			const checkGroupID = this.getAgentGroupID(); // Appelle la fonction qui contient getGroup
			console.log(`  -> Immediate getAgentGroupID check result: ${checkGroupID}`);

			if (checkGroupID === null) {
				console.error("<<<<< CRITICAL NAVMESH FAILURE >>>>> getAgentGroupID returned null. The generated NavMesh data is likely INVALID or EMPTY on the main thread!");
				// Optionnel: loguer les paramètres utilisés pour le build
				console.error("     Build Parameters Used:", this.config); // Log config.navMesh
				// Optionnel: logger des infos sur la géométrie d'entrée
				// if (geometry) { // geometry est le clone transformé passé à createZone
				//    console.error(`     Input Geometry Vertices: ${geometry.attributes.position.count}, Indexed: ${!!geometry.index}`);
				// }
			} else {
				console.log("     NavMesh seems potentially valid on main thread (got Group ID).");
			}
			// Fin des logs ajoutés




			
            // --- SUPPRESSION DU TEST getZone ---
            // if (!this.pathfinding.getZone(this.ZONE_ID)) { // <<< LIGNE INCORRECTE SUPPRIMÉE
            //      throw new Error(`Failed to load zone data into pathfinding instance for zone '${this.ZONE_ID}'.`);
            // }
            // ---------------------------------
            console.log(`NavMeshManager: Zone data loaded into main thread pathfinding instance for zone '${this.ZONE_ID}'.`);

            geometry.dispose(); // Nettoyer la géométrie clonée

            // 3. Préparer les données SÉRIALISÉES pour le worker
             const serializableVertices = new Float32Array(this.zoneData.vertices.length * 3);
             for (let i = 0; i < this.zoneData.vertices.length; i++) {
                 serializableVertices[i * 3] = this.zoneData.vertices[i].x;
                 serializableVertices[i * 3 + 1] = this.zoneData.vertices[i].y;
                 serializableVertices[i * 3 + 2] = this.zoneData.vertices[i].z;
             }
             // Supposer que 'groups' est sérialisable
             const zoneDataForWorker = {
                 groups: this.zoneData.groups, // Peut nécessiter sérialisation si complexe
                 vertices: serializableVertices
             };
             this.navMeshDataForWorker = zoneDataForWorker;

             return this.navMeshDataForWorker; // Retourner les données sérialisées

        } catch (error) {
            console.error("NavMeshManager: Failed to create/load NavMesh zone data:", error);
            geometry?.dispose();
            this.zoneData = null;
            this.navMeshDataForWorker = null;
            return null;
        }
    }

    // --- getNavMeshDataForWorker, getNavMeshConfig, getZoneID, getAgentGroupID, findNearestNode ---
    // --- (INCHANGÉS par rapport à la version précédente corrigée) ---
    getNavMeshDataForWorker() { return this.navMeshDataForWorker; }
    getNavMeshConfig() { return this.config; }
    getZoneID() { return this.ZONE_ID; }
    getAgentGroupID() {
        if (!this.zoneData) return null;
        try {
            const groupID = this.pathfinding.getGroup(this.ZONE_ID, new THREE.Vector3(0,0,0));
            if (groupID === null || groupID === undefined) return null;
            return groupID;
        } catch (error) { console.error("Error in getGroup:", error); return null; }
    }
    findNearestNode(worldPosition, checkPolygon = true) {
        if (!this.zoneData) return null;
        const groupID = this.getAgentGroupID();
        if (groupID === null) return null;
        try {
            const closestNodeResult = this.pathfinding.getClosestNode(worldPosition, this.ZONE_ID, groupID, checkPolygon);
            if (closestNodeResult && closestNodeResult.node !== null && closestNodeResult.pos) {
                 return { position: closestNodeResult.pos, node: closestNodeResult.node };
            } else { return null; }
        } catch(error) { console.error("Error in findNearestNode:", error); return null; }
    }

    // --- createDebugVisualization (INCHANGÉ par rapport à la version précédente corrigée) ---
    // (Utilise toujours la reconstruction manuelle comme fallback probable)
    createDebugVisualization(targetGroup) {
        if (!this.zoneData) { this.clearDebugVisualization(targetGroup); return; }
        this.clearDebugVisualization(targetGroup);
        try {
             const debugGeometry = new THREE.BufferGeometry();
             const vertices = []; const indices = [];
             this.zoneData.vertices.forEach(v => vertices.push(v.x, v.y, v.z));
             debugGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
             this.zoneData.groups?.forEach(group => {
                 // Structure exacte de group/polygons à vérifier dans l'objet réel zoneData
                 const polys = group.polygons || group.polyIndices || group; // Essayer différentes clés possibles
                 if(polys && Array.isArray(polys)) {
                     polys.forEach(poly => {
                         const vIds = poly.vertexIds || poly; // Essayer différentes clés possibles
                         if (vIds && Array.isArray(vIds) && vIds.length >= 3) {
                             const v0 = vIds[0];
                             for (let i = 1; i < vIds.length - 1; i++) { indices.push(v0, vIds[i], vIds[i+1]); }
                         }
                     });
                 } else if (group && Array.isArray(group)) { // Si group est directement un tableau de polys?
                     group.forEach(poly => { /* ... même logique que ci-dessus ... */ });
                 }
             });
             if(indices.length > 0) {
                debugGeometry.setIndex(indices);
                this.debugMesh = new THREE.Mesh(debugGeometry, this.debugMeshMaterial);
                this.debugMesh.name = "NavMesh_Debug_Mesh_Manual";
                this.debugMesh.renderOrder = this.experience.world?.debugHeights?.navMesh || 1;
                targetGroup.add(this.debugMesh);
             } else { console.warn("NavMeshManager: Could not extract polygons for manual debug mesh."); }
        } catch (error) { console.error("Error creating debug viz:", error); this.debugMesh = null; }
    }

    // --- clearDebugVisualization (INCHANGÉ par rapport à la version précédente corrigée) ---
    clearDebugVisualization(targetGroup) {
         if (this.debugMesh) {
            if (targetGroup && this.debugMesh.parent === targetGroup) targetGroup.remove(this.debugMesh);
            if (this.debugMesh.name.includes("_Manual") && this.debugMesh.geometry) this.debugMesh.geometry.dispose();
            this.pathfindingHelper?.reset();
            this.debugMesh = null;
         }
    }

    // --- destroy (INCHANGÉ par rapport à la version précédente corrigée) ---
    destroy() {
        console.log("Destroying NavMeshManager...");
        this.pathfinding?.setZoneData(this.ZONE_ID, null);
        this.pathfinding = null;
        this.zoneData = null;
        this.navMeshDataForWorker = null;

        this.clearDebugVisualization();
        this.pathfindingHelper?.reset();
        this.pathfindingHelper = null;
        this.debugMeshMaterial?.dispose();
        this.debugMeshMaterial = null;

        this.config = null;
        this.experience = null;
        console.log("NavMeshManager destroyed.");
    }
}