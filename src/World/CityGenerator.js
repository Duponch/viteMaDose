// src/World/CityGenerator.js
import * as THREE from 'three';

// --- Classe pour représenter une parcelle ---
class Plot {
    constructor(id, x, z, width, depth) {
        this.id = id; // Identifiant unique
        this.x = x;
        this.z = z;
        this.width = width; // Dimension sur l'axe X
        this.depth = depth; // Dimension sur l'axe Z
        this.children = []; // Sous-parcelles si elle est divisée
        this.isLeaf = true; // Est-ce une parcelle finale (non divisée) ?
        this.isPark = false; // Pourrait être un parc/espace vert
    }

    get center() {
        return new THREE.Vector3(this.x + this.width / 2, 0, this.z + this.depth / 2);
    }

    // Vérifie si un point est à l'intérieur de la parcelle
    contains(point) {
        return point.x >= this.x && point.x <= this.x + this.width &&
               point.z >= this.z && point.z <= this.z + this.depth;
    }
}

// --- Classe Principale ---
export default class CityGenerator {
    constructor(experience, config) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.config = {
			mapSize: 150,
			roadWidth: 10,          // Largeur de l'ESPACE route
			sidewalkWidth: 2,       // Largeur des trottoirs
			sidewalkHeight: 0.2,    // Hauteur des trottoirs
			centerlineWidth: 0.15,  // Largeur de la ligne centrale blanche
			centerlineHeight: 0.02, // Hauteur de la ligne centrale (légèrement > 0)
			minPlotSize: 15,
			maxRecursionDepth: 7,
			buildingMinHeight: 5,
			buildingMaxHeight: 25,
			parkProbability: 0.15,
			minBuildingSubZoneSize: 10,    // Taille minimale d'une sous-zone pour un bâtiment
			buildingSubZoneMargin: 1,       // Marge entre le bâtiment et les bords de la sous-zone
			...config
		};		

        // Matériaux
        // this.roadMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 }); // Supprimé car plus de surface de route
        this.sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 }); // Trottoir
        this.centerlineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Ligne blanche simple
        this.buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.2, roughness: 0.7 });
        this.parkMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 }); // Vert pour les parcs

        // Structure de données principale
        this.rootPlot = null;
        this.plots = [];
        this.leafPlots = [];
        this.nextPlotId = 0;

        // Groupes pour l'organisation de la scène
        this.roadGroup = new THREE.Group();      // Contiendra maintenant les lignes centrales
        this.sidewalkGroup = new THREE.Group();  // Pour les trottoirs autour des parcelles
        this.buildingGroup = new THREE.Group();  // Pour bâtiments et parcs
        this.scene.add(this.roadGroup);
        this.scene.add(this.sidewalkGroup);
        this.scene.add(this.buildingGroup);
    }

    generate() {
        console.log("Génération par subdivision (lignes centrales)...");
        this.clearScene();

        // 1. Initialiser la parcelle racine
        console.log("Config:", this.config);
        this.rootPlot = new Plot(this.nextPlotId++, -this.config.mapSize / 2, -this.config.mapSize / 2, this.config.mapSize, this.config.mapSize);
        this.plots.push(this.rootPlot);

        // 2. Lancer la subdivision récursive
        this.subdividePlot(this.rootPlot, 0);

        // 3. Collecter les parcelles feuilles
        this.collectLeafPlots(this.rootPlot);
        console.log(`Subdivision terminée: ${this.leafPlots.length} parcelles finales.`);

        // 4. Générer les LIGNES CENTRALES des routes
        this.generateRoadCenterlines(); // Fonction renommée/modifiée

        // 5. Générer le contenu des parcelles (Bâtiments/Parcs ET TROTTOIRS)
        this.generatePlotContentsAndSidewalks();

        console.log("Génération de la ville terminée.");
    }

    clearScene() {
        // Vider les groupes et disposer les géométries/matériaux
        const disposeGroup = (group) => {
            while (group.children.length > 0) {
                const obj = group.children[0];
                group.remove(obj);
                if (obj instanceof THREE.Mesh) {
                    if (obj.geometry) obj.geometry.dispose();
                    // Ne disposer que les matériaux clonés (bâtiments) ou spécifiques non partagés.
                    // Les matériaux de base (sidewalk, centerline, park) ne sont pas clonés ici.
                    if (obj.material && obj.material !== this.sidewalkMaterial && obj.material !== this.centerlineMaterial && obj.material !== this.parkMaterial) {
                         if (Array.isArray(obj.material)) {
                             obj.material.forEach(m => { if(m && m.isMaterial) m.dispose(); });
                         } else if (obj.material && obj.material.isMaterial) {
                             obj.material.dispose();
                         }
                    }
                } else if (obj instanceof THREE.Group) {
                    disposeGroup(obj);
                }
            }
        };
        disposeGroup(this.roadGroup); // Videra les lignes centrales
        disposeGroup(this.sidewalkGroup);
        disposeGroup(this.buildingGroup);

        // Réinitialiser les structures de données
        this.rootPlot = null; this.plots = []; this.leafPlots = []; this.nextPlotId = 0;
    }

	subdivideForBuildings(plot) {
		const minSubZoneSize = this.config.minBuildingSubZoneSize;
		const margin = this.config.buildingSubZoneMargin;
		let numCols = Math.floor(plot.width / minSubZoneSize);
		let numRows = Math.floor(plot.depth / minSubZoneSize);
		numCols = Math.max(numCols, 1);
		numRows = Math.max(numRows, 1);
		const subZones = [];
		const subWidth = plot.width / numCols;
		const subDepth = plot.depth / numRows;
		for (let i = 0; i < numCols; i++) {
			for (let j = 0; j < numRows; j++) {
				subZones.push({
					x: plot.x + i * subWidth,
					z: plot.z + j * subDepth,
					width: subWidth,
					depth: subDepth,
				});
			}
		}
		return subZones;
	}	

    // Subdivision et CollectLeafPlots restent inchangées
     subdividePlot(plot, depth) {
        // Condition d'arrêt modifiée
        if (depth >= this.config.maxRecursionDepth ||
            (plot.width * plot.depth < this.config.minPlotSize * this.config.minPlotSize * 1.5))
        {
            return;
        }

        // Choix de l'axe (logique inchangée)
        let splitVertical = plot.width > plot.depth;
        if (Math.abs(plot.width - plot.depth) < this.config.minPlotSize / 2) { splitVertical = Math.random() > 0.5; }
        if (splitVertical && plot.width < (this.config.minPlotSize * 2 + this.config.roadWidth)) splitVertical = false;
        if (!splitVertical && plot.depth < (this.config.minPlotSize * 2 + this.config.roadWidth)) splitVertical = true;

        // Vérifier si une division est possible avant de la faire
        const road = this.config.roadWidth;
        if (splitVertical) {
             if (plot.width < this.config.minPlotSize * 2 + road) { plot.isLeaf = true; return; } // Pas assez large
        } else {
             if (plot.depth < this.config.minPlotSize * 2 + road) { plot.isLeaf = true; return; } // Pas assez profonde
        }


        plot.isLeaf = false;
        let p1, p2;

        if (splitVertical) {
            // Division Verticale
            const minSplitPos = plot.x + this.config.minPlotSize + road / 2;
            const maxSplitPos = plot.x + plot.width - this.config.minPlotSize - road / 2;
            const splitX = THREE.MathUtils.randFloat(minSplitPos, maxSplitPos);
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, splitX - plot.x - road / 2, plot.depth);
            p2 = new Plot(this.nextPlotId++, splitX + road / 2, plot.z, (plot.x + plot.width) - (splitX + road / 2), plot.depth);
        } else {
            // Division Horizontale
             const minSplitPos = plot.z + this.config.minPlotSize + road / 2;
             const maxSplitPos = plot.z + plot.depth - this.config.minPlotSize - road / 2;
            const splitZ = THREE.MathUtils.randFloat(minSplitPos, maxSplitPos);
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, plot.width, splitZ - plot.z - road / 2);
            p2 = new Plot(this.nextPlotId++, plot.x, splitZ + road / 2, plot.width, (plot.z + plot.depth) - (splitZ + road / 2));
        }

        // Vérification et récursion
        if (p1.width > 0.1 && p1.depth > 0.1 && p2.width > 0.1 && p2.depth > 0.1) {
            plot.children.push(p1, p2); this.plots.push(p1, p2);
            this.subdividePlot(p1, depth + 1); this.subdividePlot(p2, depth + 1);
        } else {
             plot.isLeaf = true; plot.children = [];
             console.warn("Division a produit des parcelles invalides, parcelle forcée en feuille : ", plot.id);
             const indexP1 = this.plots.indexOf(p1); if(indexP1 > -1) this.plots.splice(indexP1, 1);
             const indexP2 = this.plots.indexOf(p2); if(indexP2 > -1) this.plots.splice(indexP2, 1);
        }
    }

    collectLeafPlots(plot) {
        if (plot.isLeaf) {
             // S'assurer que la parcelle est assez grande pour être un parc potentiellement
            if (plot.width >= this.config.minPlotSize && plot.depth >= this.config.minPlotSize) {
                 if (Math.random() < this.config.parkProbability) {
                     plot.isPark = true;
                 }
             }
            this.leafPlots.push(plot);
        } else {
            plot.children.forEach(child => this.collectLeafPlots(child));
        }
    }

    // --- Génération de la Géométrie ---

    // Fonction renommée et modifiée pour générer les LIGNES CENTRALES
    generateRoadCenterlines() {
        const roadW = this.config.roadWidth; // Gardé pour la détection du gap
        const tolerance = 0.1;
        const drawnRoads = new Set(); // Garde trace des segments de ligne créés

        console.log("Génération des lignes centrales...");

        for (let i = 0; i < this.leafPlots.length; i++) {
            const p1 = this.leafPlots[i];
            for (let j = i + 1; j < this.leafPlots.length; j++) {
                const p2 = this.leafPlots[j];
                let roadInfo = null;
                // Détection de Gap Vertical (inchangée)
                const gapH = p2.x - (p1.x + p1.width); const gapHReverse = p1.x - (p2.x + p2.width);
                const zOverlapStart = Math.max(p1.z, p2.z); const zOverlapEnd = Math.min(p1.z + p1.depth, p2.z + p2.depth);
                const zOverlapLength = zOverlapEnd - zOverlapStart;
                if (Math.abs(gapH - roadW) < tolerance && zOverlapLength > tolerance) {
                    roadInfo = { type: 'V', x: p1.x + p1.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p1.id, p2Id: p2.id };
                } else if (Math.abs(gapHReverse - roadW) < tolerance && zOverlapLength > tolerance) {
                     roadInfo = { type: 'V', x: p2.x + p2.width + roadW / 2, z: zOverlapStart, length: zOverlapLength, p1Id: p2.id, p2Id: p1.id };
                }
                // Détection de Gap Horizontal (inchangée)
                if (!roadInfo) {
                    const gapV = p2.z - (p1.z + p1.depth); const gapVReverse = p1.z - (p2.z + p2.depth);
                    const xOverlapStart = Math.max(p1.x, p2.x); const xOverlapEnd = Math.min(p1.x + p1.width, p2.x + p2.width);
                    const xOverlapLength = xOverlapEnd - xOverlapStart;
                    if (Math.abs(gapV - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: 'H', x: xOverlapStart, z: p1.z + p1.depth + roadW / 2, length: xOverlapLength, p1Id: p1.id, p2Id: p2.id };
                    } else if (Math.abs(gapVReverse - roadW) < tolerance && xOverlapLength > tolerance) {
                        roadInfo = { type: 'H', x: xOverlapStart, z: p2.z + p2.depth + roadW / 2, length: xOverlapLength, p1Id: p2.id, p2Id: p1.id };
                    }
                }

                // Génération si route (gap) détectée
                if (roadInfo) {
                    const roadKey = `${Math.min(roadInfo.p1Id, roadInfo.p2Id)}-${Math.max(roadInfo.p1Id, roadInfo.p2Id)}`;
                    if (!drawnRoads.has(roadKey)) {
                        // Appel de la nouvelle fonction pour créer la ligne centrale
                        this.createRoadCenterlineGeometry(roadInfo);
                        drawnRoads.add(roadKey);
                        // PAS BESOIN de gérer les intersections explicitement
                    }
                }
            }
        }
         console.log(`Lignes centrales générées: ${drawnRoads.size} segments.`);
    }

    // Fonction MODIFIÉE : crée la LIGNE CENTRALE (BoxGeometry fine)
    createRoadCenterlineGeometry(info) {
        const segmentGroup = new THREE.Group(); // Utiliser un groupe simplifie rotation/position
        let midX, midZ, angle;
        const clHeight = this.config.centerlineHeight;
        const clWidth = this.config.centerlineWidth;

        // Calculer le centre et l'angle du segment de route (comme avant)
        if (info.type === 'V') { // Route verticale (le long de Z)
            angle = 0;
            midX = info.x;
            midZ = info.z + info.length / 2;
        } else { // Route horizontale (le long de X)
            angle = Math.PI / 2;
            midX = info.x + info.length / 2;
            midZ = info.z;
        }
        segmentGroup.position.set(midX, 0, midZ); // Positionner au centre du segment
        segmentGroup.rotation.y = angle; // Orienter le groupe

        // Créer la géométrie de la ligne: une boîte fine et longue
        // Width = largeur de la ligne, Height = hauteur de la ligne, Depth = longueur de la route
        const centerlineGeom = new THREE.BoxGeometry(clWidth, clHeight, info.length);
        const centerlineMesh = new THREE.Mesh(centerlineGeom, this.centerlineMaterial);

        // Positionner la ligne légèrement au-dessus du sol (y=0)
        centerlineMesh.position.y = clHeight / 2 + 0.001; // +0.001 pour éviter Z-fight si sol à y=0

        // Pas besoin de rotation X car c'est une Box
        // Pas besoin d'ombres pour une ligne simple
        centerlineMesh.castShadow = false;
        centerlineMesh.receiveShadow = false;

        segmentGroup.add(centerlineMesh);
        this.roadGroup.add(segmentGroup); // Ajouter le groupe (contenant la ligne) au groupe principal des routes

        // Disposer la géométrie après création du mesh
        // centerlineGeom.dispose(); // Décommenter si la gestion mémoire est critique
    }

    // createIntersectionSurfaceGeometry est SUPPRIMÉE

    // Fonction pour générer trottoirs et contenu des parcelles (INCHANGÉE par rapport à la version précédente)
    generatePlotContentsAndSidewalks() {
        const baseBuildingGeometry = new THREE.BoxGeometry(1, 1, 1);
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;

        this.leafPlots.forEach(plot => {
            // --- Générer Trottoir autour de la parcelle (bâtiment OU parc) ---
            if (sidewalkW > 0) {
                const sidewalkGroup = new THREE.Group();
                sidewalkGroup.position.set(plot.center.x, 0, plot.center.z);
                const horizontalLength = plot.width + 2 * sidewalkW;
                const verticalLength = plot.depth;
                const geomH = new THREE.BoxGeometry(horizontalLength, sidewalkH, sidewalkW);
                const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, verticalLength);

                const topSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                topSW.position.set(0, sidewalkH / 2, -plot.depth / 2 - sidewalkW / 2);
                sidewalkGroup.add(topSW);
                const bottomSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                bottomSW.position.set(0, sidewalkH / 2, plot.depth / 2 + sidewalkW / 2);
                sidewalkGroup.add(bottomSW);
                const leftSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                leftSW.position.set(-plot.width / 2 - sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(leftSW);
                const rightSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                rightSW.position.set(plot.width / 2 + sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(rightSW);

                sidewalkGroup.traverse((child) => {
                     if (child instanceof THREE.Mesh) {
                         child.castShadow = true;
                         child.receiveShadow = true;
                     }
                 });
                this.sidewalkGroup.add(sidewalkGroup);
                // geomH.dispose(); // Décommenter si la gestion mémoire est critique
                // geomV.dispose(); // Décommenter si la gestion mémoire est critique
            }

            // --- Générer Contenu : Parc ou Bâtiment ---
			if (plot.isPark) {
				const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
				const parkMesh = new THREE.Mesh(parkGeom, this.parkMaterial);
				parkMesh.position.set(plot.center.x, 0.2, plot.center.z);
				parkMesh.rotation.x = -Math.PI / 2;
				parkMesh.receiveShadow = true;
				this.buildingGroup.add(parkMesh);
			} else {
				// Subdivision de la parcelle en sous-zones pour placer plusieurs bâtiments
				const subZones = this.subdivideForBuildings(plot);
				const margin = this.config.buildingSubZoneMargin;
				subZones.forEach(subZone => {
					// On retire la marge pour que le bâtiment ne remplisse pas entièrement la sous-zone
					const buildableWidth = Math.max(subZone.width - margin * 2, 0.1);
					const buildableDepth = Math.max(subZone.depth - margin * 2, 0.1);
					if (buildableWidth > 0.1 && buildableDepth > 0.1) {
						const height = THREE.MathUtils.randFloat(this.config.buildingMinHeight, this.config.buildingMaxHeight);
						const buildingMesh = new THREE.Mesh(baseBuildingGeometry, this.buildingMaterial.clone());
						buildingMesh.scale.set(buildableWidth, height, buildableDepth);
						buildingMesh.position.set(
							subZone.x + subZone.width / 2,
							height / 2,
							subZone.z + subZone.depth / 2
						);
						buildingMesh.castShadow = true;
						buildingMesh.receiveShadow = true;
						buildingMesh.material.color.setHSL(Math.random() * 0.1 + 0.55, 0.1, Math.random() * 0.3 + 0.4);
						this.buildingGroup.add(buildingMesh);
					}
				});
			}
        });
        // baseBuildingGeometry.dispose(); // Décommenter si la gestion mémoire est critique
    }
}