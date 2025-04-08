import * as THREE from 'three';

export default class RoadNetworkGenerator {
    constructor(config, materials) {
        this.config = config; // roadWidth, centerlineWidth, centerlineHeight
        this.materials = materials; // centerlineMaterial, roadSurfaceMaterial (pour plus tard)
        this.roadGroup = new THREE.Group();
        this.drawnRoads = new Set(); // Pour éviter les doublons
    }

    generateRoads(leafPlots) {
        this.reset();
        console.log("Génération du réseau routier...");

        if (!leafPlots || leafPlots.length === 0) {
            console.warn("Aucune parcelle fournie pour générer les routes.");
            return this.roadGroup;
        }

        const roadW = this.config.roadWidth;
        const tolerance = 0.1; // Tolérance pour la détection de l'écart

        for (let i = 0; i < leafPlots.length; i++) {
            const p1 = leafPlots[i];
            for (let j = i + 1; j < leafPlots.length; j++) {
                const p2 = leafPlots[j];
                let roadInfo = null;

                // Détection et création comme dans generateRoadCenterlines
                const gapH = p2.x - (p1.x + p1.width);
                const gapHReverse = p1.x - (p2.x + p2.width);
                const zOverlapStart = Math.max(p1.z, p2.z);
                const zOverlapEnd = Math.min(p1.z + p1.depth, p2.z + p2.depth);
                const zOverlapLength = Math.max(0, zOverlapEnd - zOverlapStart);

                if (Math.abs(gapH - roadW) < tolerance && zOverlapLength > tolerance) {
                    roadInfo = { type: "V", x: p1.x + p1.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p1.id, p2Id: p2.id };
                } else if (Math.abs(gapHReverse - roadW) < tolerance && zOverlapLength > tolerance) {
                    roadInfo = { type: "V", x: p2.x + p2.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p2.id, p2Id: p1.id };
                }

                if (!roadInfo) {
                    const gapV = p2.z - (p1.z + p1.depth);
                    const gapVReverse = p1.z - (p2.z + p2.depth);
                    const xOverlapStart = Math.max(p1.x, p2.x);
                    const xOverlapEnd = Math.min(p1.x + p1.width, p2.x + p2.width);
                    const xOverlapLength = Math.max(0, xOverlapEnd - xOverlapStart);

                    if (Math.abs(gapV - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: "H", x: xOverlapStart, z: p1.z + p1.depth + roadW / 2, length: xOverlapLength, p1Id: p1.id, p2Id: p2.id };
                    } else if (Math.abs(gapVReverse - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: "H", x: xOverlapStart, z: p2.z + p2.depth + roadW / 2, length: xOverlapLength, p1Id: p2.id, p2Id: p1.id };
                    }
                }

                if (roadInfo) {
                    const roadKey = `${Math.min(roadInfo.p1Id, roadInfo.p2Id)}-${Math.max(roadInfo.p1Id, roadInfo.p2Id)}-${roadInfo.type}`;
                    if (!this.drawnRoads.has(roadKey)) {
                        this.createRoadSegmentGeometry(roadInfo);
                        this.drawnRoads.add(roadKey);
                    }
                }
            }
        }

        console.log(`Réseau routier généré: ${this.drawnRoads.size} segments.`);
        return this.roadGroup;
    }

    reset() {
         // Vider le groupe et disposer les géométries précédentes
         while (this.roadGroup.children.length > 0) {
             const segmentGroup = this.roadGroup.children[0];
             this.roadGroup.remove(segmentGroup);
             if (segmentGroup.children.length > 0) {
                 const mesh = segmentGroup.children[0]; // Le mesh de la ligne centrale
                 if (mesh.geometry) mesh.geometry.dispose();
                 // Le matériau est partagé, ne pas le disposer ici
             }
         }
         this.drawnRoads.clear();
         console.log("Road Network Generator réinitialisé.");
    }

    // --- Copiez/Collez createRoadCenterlineGeometry ici ---
    // Renommez-la peut-être createRoadSegmentGeometry
    // Utilisez this.config et this.materials
    createRoadSegmentGeometry(info) {
        const segmentGroup = new THREE.Group(); // Un groupe par segment pour rotation facile
        let midX, midZ, angle;
        const clHeight = this.config.centerlineHeight;
        const clWidth = this.config.centerlineWidth;

        if (info.type === "V") { // Vertical road segment
            angle = 0; // No rotation needed relative to world Z
            midX = info.x; // Center X of the road segment
            midZ = info.z + info.length / 2; // Center Z of the road segment
        } else { // Horizontal road segment ("H")
            angle = Math.PI / 2; // Rotate 90 degrees
            midX = info.x + info.length / 2; // Center X of the road segment
            midZ = info.z; // Center Z of the road segment
        }

        // Position the group at the center of the road segment
        segmentGroup.position.set(midX, 0, midZ);
        // Rotate the group to align the geometry correctly
        segmentGroup.rotation.y = angle;

        // The BoxGeometry dimensions depend on the road type (V or H)
        // We create the box aligned with the X-axis *before* rotation.
        // For a Vertical road (angle=0), length is along Z.
        // For a Horizontal road (angle=PI/2), length is along X (after rotation).
        const centerlineGeom = new THREE.BoxGeometry(
            info.type === "V" ? clWidth : info.length, // Width is clWidth for V, length for H
            clHeight,                                 // Height is constant
            info.type === "V" ? info.length : clWidth // Depth is length for V, clWidth for H
        );

         const centerlineMesh = new THREE.Mesh(centerlineGeom, this.materials.centerlineMaterial);
        // Position slightly above ground within its group
        centerlineMesh.position.y = clHeight / 2 + 0.001;
        centerlineMesh.castShadow = false; // Lines usually don't cast shadows
        centerlineMesh.receiveShadow = false;

        // Add the mesh to the segment group
        segmentGroup.add(centerlineMesh);
        // Add the segment group to the main road group
        this.roadGroup.add(segmentGroup);

        // TODO: Ajouter la géométrie de la surface de la route (un plan ou une boîte fine)
        // const roadSurfaceGeom = new THREE.BoxGeometry(
        //     info.type === "V" ? this.config.roadWidth : info.length,
        //     0.01, // Très fin
        //     info.type === "V" ? info.length : this.config.roadWidth
        // );
        // const roadSurfaceMesh = new THREE.Mesh(roadSurfaceGeom, this.materials.roadSurfaceMaterial);
        // roadSurfaceMesh.position.y = 0.005; // Juste au dessus du sol global
        // roadSurfaceMesh.receiveShadow = true;
        // segmentGroup.add(roadSurfaceMesh);
    }
}