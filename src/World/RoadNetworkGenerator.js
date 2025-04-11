import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'; // <--- AJOUTEZ CETTE LIGNE

export default class RoadNetworkGenerator {
	constructor(config, materials) {
        this.config = config;
        this.materials = materials;
        this.roadGroup = new THREE.Group(); // Contiendra le mesh fusionné
        this.drawnRoads = new Set();
        this.centerlineGeometries = []; // <- Stockage temporaire
		this.crosswalkInfos = [];
    }

    generateRoads(leafPlots) {
        this.reset();
        console.log("Génération réseau routier et 1 passage piéton centré par segment...");

        if (!leafPlots || leafPlots.length === 0) { /* ... (inchangé) ... */ }

        const roadW = this.config.roadWidth;
        const tolerance = 0.1;
        // --- Nouvelle longueur, légèrement plus petite que la largeur de la route ---
        const crosswalkActualLength = roadW * 0.9; // Ex: 90% de la largeur de la route

        for (let i = 0; i < leafPlots.length; i++) {
            const p1 = leafPlots[i];
            for (let j = i + 1; j < leafPlots.length; j++) {
                const p2 = leafPlots[j];
                let roadInfo = null;
                let crosswalkInfo = null; // Info pour UN seul passage piéton

                // --- Détection Gaps (inchangée) ---
                const gapH = p2.x - (p1.x + p1.width);
                const gapHReverse = p1.x - (p2.x + p2.width);
                const zOverlapStart = Math.max(p1.z, p2.z);
                const zOverlapEnd = Math.min(p1.z + p1.depth, p2.z + p2.depth);
                const zOverlapLength = Math.max(0, zOverlapEnd - zOverlapStart);

                if (Math.abs(gapH - roadW) < tolerance && zOverlapLength > tolerance) {
                    roadInfo = { type: "V", x: p1.x + p1.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p1.id, p2Id: p2.id };
                    // --- Calcul passage piéton CENTRÉ pour route VERTICALE ---
                    crosswalkInfo = {
                        position: new THREE.Vector3(
                            roadInfo.x,
                            0,
                            (zOverlapStart + zOverlapEnd) / 2 // Centre Z de l'overlap
                        ),
                        angle: Math.PI / 2, // Angle de base (sera tourné de +90° dans PlotContentGenerator)
                        length: crosswalkActualLength, // Longueur réduite
                        // width/height gérés par PlotContentGenerator via config
                    };
                    // --- Fin V ---
                } else if (Math.abs(gapHReverse - roadW) < tolerance && zOverlapLength > tolerance) {
                     roadInfo = { type: "V", x: p2.x + p2.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p2.id, p2Id: p1.id };
                    // --- Calcul passage piéton CENTRÉ pour route VERTICALE ---
                     crosswalkInfo = {
                         position: new THREE.Vector3(roadInfo.x, 0, (zOverlapStart + zOverlapEnd) / 2),
                         angle: Math.PI / 2, length: crosswalkActualLength,
                     };
                    // --- Fin V ---
                }

                if (!roadInfo) {
                    const gapV = p2.z - (p1.z + p1.depth);
                    const gapVReverse = p1.z - (p2.z + p2.depth);
                    const xOverlapStart = Math.max(p1.x, p2.x);
                    const xOverlapEnd = Math.min(p1.x + p1.width, p2.x + p2.width);
                    const xOverlapLength = Math.max(0, xOverlapEnd - xOverlapStart);

                    if (Math.abs(gapV - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: "H", x: xOverlapStart, z: p1.z + p1.depth + roadW / 2, length: xOverlapLength, p1Id: p1.id, p2Id: p2.id };
                        // --- Calcul passage piéton CENTRÉ pour route HORIZONTALE ---
                        crosswalkInfo = {
                            position: new THREE.Vector3(
                                (xOverlapStart + xOverlapEnd) / 2, // Centre X de l'overlap
                                0,
                                roadInfo.z
                            ),
                            angle: 0, // Angle de base
                            length: crosswalkActualLength, // Longueur réduite
                        };
                        // --- Fin H ---
                    } else if (Math.abs(gapVReverse - roadW) < tolerance && xOverlapLength > tolerance) {
                         roadInfo = { type: "H", x: xOverlapStart, z: p2.z + p2.depth + roadW / 2, length: xOverlapLength, p1Id: p2.id, p2Id: p1.id };
                        // --- Calcul passage piéton CENTRÉ pour route HORIZONTALE ---
                         crosswalkInfo = {
                             position: new THREE.Vector3((xOverlapStart + xOverlapEnd) / 2, 0, roadInfo.z),
                             angle: 0, length: crosswalkActualLength,
                         };
                        // --- Fin H ---
                    }
                }
                // --- Fin Détection ---

                if (roadInfo) {
                    const roadKey = `${Math.min(roadInfo.p1Id, roadInfo.p2Id)}-${Math.max(roadInfo.p1Id, roadInfo.p2Id)}-${roadInfo.type}`;
                    if (!this.drawnRoads.has(roadKey)) {
						this.collectRoadSegmentGeometry(roadInfo); // Ligne centrale

                        // --- AJOUT: Stocker l'info de l'unique passage piéton ---
                        if (crosswalkInfo) {
                            // On n'a plus besoin du Set car on génère un seul par segment
                            this.crosswalkInfos.push(crosswalkInfo);
                        }
                        // -------------------------------------------------------

						this.drawnRoads.add(roadKey);
                    }
                }
            }
        }

		// --- Fusion lignes centrales (inchangé) ---
		if (this.centerlineGeometries.length > 0) { const mergedCenterlineGeometry = mergeGeometries(this.centerlineGeometries, false); if (mergedCenterlineGeometry) { const centerlineMesh = new THREE.Mesh(mergedCenterlineGeometry, this.materials.centerlineMaterial); centerlineMesh.castShadow = false; centerlineMesh.receiveShadow = true; centerlineMesh.name = "Merged_Road_Centerlines"; this.roadGroup.add(centerlineMesh); } else { console.warn("Fusion lignes centrales échouée."); } this.centerlineGeometries.forEach(geom => geom.dispose()); this.centerlineGeometries = []; }

        console.log(`Réseau routier généré: ${this.drawnRoads.size} segments. ${this.crosswalkInfos.length} passages piétons uniques identifiés.`);
        return { roadGroup: this.roadGroup, crosswalkInfos: this.crosswalkInfos };
    }

	collectRoadSegmentGeometry(info) {
        let midX, midZ, angle;
        const clHeight = this.config.centerlineHeight;
        const clWidth = this.config.centerlineWidth;

        if (info.type === "V") { angle = 0; midX = info.x; midZ = info.z + info.length / 2; }
        else { angle = Math.PI / 2; midX = info.x + info.length / 2; midZ = info.z; }

        // Créer la géométrie de base (non transformée)
        const centerlineGeom = new THREE.BoxGeometry(clWidth, clHeight, info.length);

        // Créer la matrice de transformation
        const matrix = new THREE.Matrix4();
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        const position = new THREE.Vector3(midX, clHeight / 2 + 0.001, midZ); // Légèrement au-dessus du sol
        matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1)); // Compose position, rotation, scale(1,1,1)

        // Appliquer la matrice à une copie de la géométrie
        const transformedGeom = centerlineGeom.clone().applyMatrix4(matrix);

        // Stocker la géométrie transformée
        this.centerlineGeometries.push(transformedGeom);

        // Disposer la géométrie de base qui a été clonée
        centerlineGeom.dispose();
    }

	reset() {
        while (this.roadGroup.children.length > 0) {
             const mesh = this.roadGroup.children[0];
             this.roadGroup.remove(mesh);
             if (mesh.geometry) mesh.geometry.dispose();
        }
        this.drawnRoads.clear();
        // Nettoyer aussi les géométries non fusionnées et les infos passages piétons
        this.centerlineGeometries.forEach(geom => geom.dispose());
        this.centerlineGeometries = [];
        this.crosswalkInfos = []; // <-- Réinitialiser ici
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