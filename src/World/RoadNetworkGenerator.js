import * as THREE from 'three';

export default class RoadNetworkGenerator {
	constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.roadGroup = new THREE.Group();
        this.drawnRoads = new Set();
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
            // Disposer la géométrie du mesh à l'intérieur du groupe
            if (segmentGroup.children.length > 0 && segmentGroup.children[0].isMesh) {
                 const mesh = segmentGroup.children[0];
                 if (mesh.geometry) mesh.geometry.dispose();
                 // Le matériau est partagé, ne pas le disposer ici
            }
        }
        this.drawnRoads.clear();
        console.log("Road Network Generator réinitialisé.");
    }


    // Méthode modifiée :
    createRoadSegmentGeometry(info) {
        const segmentGroup = new THREE.Group(); // Groupe pour contenir la ligne (et potentiellement la route)
        let midX, midZ, angle;
        const clHeight = this.config.centerlineHeight;
        const clWidth = this.config.centerlineWidth; // La largeur visuelle de la ligne blanche

        // 1. Déterminer la position centrale et l'angle de rotation du SEGMENT de route
        if (info.type === "V") { // Segment vertical
            angle = 0; // Pas de rotation nécessaire
            midX = info.x; // Le centre X est donné par l'info
            midZ = info.z + info.length / 2; // Le centre Z est au milieu de la longueur
        } else { // Segment horizontal ("H")
            angle = Math.PI / 2; // Rotation de 90 degrés autour de l'axe Y
            midX = info.x + info.length / 2; // Le centre X est au milieu de la longueur
            midZ = info.z; // Le centre Z est donné par l'info
        }

        // 2. Positionner et orienter le GROUPE qui contiendra la ligne
        segmentGroup.position.set(midX, 0, midZ);
        segmentGroup.rotation.y = angle; // Appliquer la rotation au groupe

        // 3. Créer la GÉOMÉTRIE de la ligne blanche TOUJOURS de la même manière
        //    (par exemple, longue le long de l'axe Z local du groupe)
        //    La largeur visuelle est 'clWidth', la longueur du segment est 'info.length'.
        const centerlineGeom = new THREE.BoxGeometry(
            clWidth,    // La largeur de la ligne (devient la dimension X locale)
            clHeight,   // La hauteur de la ligne (dimension Y locale)
            info.length // La longueur de la ligne (devient la dimension Z locale)
        );

        // 4. Créer le MESH de la ligne et l'ajouter au groupe
        const centerlineMesh = new THREE.Mesh(centerlineGeom, this.materials.centerlineMaterial);
        // Positionner légèrement au-dessus du sol (0.001 pour éviter z-fighting avec le sol global)
        // La position Y est relative au groupe.
        centerlineMesh.position.y = clHeight / 2 + 0.001;
        centerlineMesh.castShadow = false;
        centerlineMesh.receiveShadow = false; // Les lignes ne reçoivent généralement pas d'ombres

        // Ajouter le mesh de la ligne au groupe du segment
        segmentGroup.add(centerlineMesh);

        // Ajouter le groupe du segment (qui contient la ligne correctement orientée)
        // au groupe principal des routes
        this.roadGroup.add(segmentGroup);

        // --- Optionnel : Ajouter la surface de la route ---
        // Si vous voulez ajouter un mesh pour la surface de la route elle-même,
        // vous le créeriez aussi avec des dimensions standard (largeur=roadWidth, longueur=info.length)
        // et l'ajouteriez à ce même 'segmentGroup'. La rotation du groupe l'orienterait correctement.
        /*
        const roadSurfaceGeom = new THREE.PlaneGeometry(this.config.roadWidth, info.length); // Ou BoxGeometry fine
        const roadSurfaceMesh = new THREE.Mesh(roadSurfaceGeom, this.materials.roadSurfaceMaterial); // Assurez-vous d'avoir ce matériau
        roadSurfaceMesh.rotation.x = -Math.PI / 2; // Orienter le plan horizontalement DANS le groupe
        roadSurfaceMesh.position.y = 0.005; // Juste au dessus du sol global
        roadSurfaceMesh.receiveShadow = true;
        segmentGroup.add(roadSurfaceMesh); // Ajouter au même groupe que la ligne
        */
    }
}