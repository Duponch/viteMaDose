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
            roadWidth: 10,         // Largeur de la CHAUSSÉE uniquement
            sidewalkWidth: 2,   // Largeur des trottoirs (maintenant liés aux parcelles)
            sidewalkHeight: 0.2,  // Hauteur des trottoirs
            minPlotSize: 15,
            maxRecursionDepth: 7,
            //buildingMargin: 2,   // Marge INTÉRIEURE de la parcelle pour le bâtiment (commenté car non utilisé dans le code fourni)
            buildingMinHeight: 5,
            buildingMaxHeight: 25,
            parkProbability: 0.15,
            ...config
        };

        // Matériaux
        this.roadMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 }); // Chaussée
        this.sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 }); // Trottoir
        // this.intersectionMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a }); // Plus utilisé pour la surface
        this.buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.2, roughness: 0.7 });
        this.parkMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 }); // Vert pour les parcs

        // Structure de données principale
        this.rootPlot = null;
        this.plots = [];
        this.leafPlots = [];
        this.nextPlotId = 0;

        // Groupes pour l'organisation de la scène
        this.roadGroup = new THREE.Group();      // Pour les chaussées routes/intersections
        this.sidewalkGroup = new THREE.Group();  // Pour les trottoirs autour des parcelles
        this.buildingGroup = new THREE.Group();  // Pour bâtiments et parcs
        this.scene.add(this.roadGroup);
        this.scene.add(this.sidewalkGroup);
        this.scene.add(this.buildingGroup);
    }

    generate() {
        console.log("Génération par subdivision (trottoirs par parcelles)...");
        this.clearScene();

        // 1. Initialiser la parcelle racine
		console.log(this.config);
        this.rootPlot = new Plot(this.nextPlotId++, -this.config.mapSize / 2, -this.config.mapSize / 2, this.config.mapSize, this.config.mapSize);
        this.plots.push(this.rootPlot);

        // 2. Lancer la subdivision récursive
        this.subdividePlot(this.rootPlot, 0);

        // 3. Collecter les parcelles feuilles
        this.collectLeafPlots(this.rootPlot);
        console.log(`Subdivision terminée: ${this.leafPlots.length} parcelles finales.`);

        // 4. Générer les surfaces de CHAUSSÉE (routes/intersections)
        this.generateRoadSurfaces();

        // 5. Générer le contenu des parcelles (Bâtiments/Parcs ET TROTTOIRS)
        this.generatePlotContentsAndSidewalks(); // <-- Appel de la fonction modifiée

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
                    // Ne disposer que les matériaux clonés (ex: bâtiments) ou spécifiques (trottoirs)
                    // S'assure de ne pas disposer les matériaux partagés globaux (road, park) s'ils ne sont pas clonés
                    // Ici, sidewalkMaterial n'est pas cloné, mais on peut le laisser pour être sûr si on changeait la logique.
                    if (obj.material && obj.material !== this.roadMaterial && obj.material !== this.parkMaterial /* && obj.material !== this.sidewalkMaterial */) {
                         if (Array.isArray(obj.material)) {
                             obj.material.forEach(m => { if(m.isMaterial) m.dispose(); }); // Vérifier isMaterial
                         } else if (obj.material.isMaterial) { // Vérifier si c'est bien un matériau avant dispose
                             obj.material.dispose();
                         }
                    }
                } else if (obj instanceof THREE.Group) {
                    // Vider récursivement les sous-groupes (utile pour les trottoirs)
                    disposeGroup(obj);
                }
            }
        };
        disposeGroup(this.roadGroup);
        disposeGroup(this.sidewalkGroup); // Vider aussi les trottoirs
        disposeGroup(this.buildingGroup);

        // Réinitialiser les structures de données
        this.rootPlot = null; this.plots = []; this.leafPlots = []; this.nextPlotId = 0;
    }

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
            // Division Verticale (logique inchangée, mais vérification préalable faite)
            const minSplitPos = plot.x + this.config.minPlotSize + road / 2;
            const maxSplitPos = plot.x + plot.width - this.config.minPlotSize - road / 2;
            // Il devrait toujours y avoir de la place grâce à la vérif précédente
            const splitX = THREE.MathUtils.randFloat(minSplitPos, maxSplitPos);
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, splitX - plot.x - road / 2, plot.depth);
            p2 = new Plot(this.nextPlotId++, splitX + road / 2, plot.z, (plot.x + plot.width) - (splitX + road / 2), plot.depth);
        } else {
            // Division Horizontale (logique inchangée, mais vérification préalable faite)
             const minSplitPos = plot.z + this.config.minPlotSize + road / 2;
             const maxSplitPos = plot.z + plot.depth - this.config.minPlotSize - road / 2;
             // Il devrait toujours y avoir de la place grâce à la vérif précédente
            const splitZ = THREE.MathUtils.randFloat(minSplitPos, maxSplitPos);
            p1 = new Plot(this.nextPlotId++, plot.x, plot.z, plot.width, splitZ - plot.z - road / 2);
            p2 = new Plot(this.nextPlotId++, plot.x, splitZ + road / 2, plot.width, (plot.z + plot.depth) - (splitZ + road / 2));
        }

        // Vérification et récursion (inchangée)
        // Théoriquement, cette vérification post-création devient moins critique avec la vérification pré-division
        if (p1.width > 0.1 && p1.depth > 0.1 && p2.width > 0.1 && p2.depth > 0.1) {
            plot.children.push(p1, p2); this.plots.push(p1, p2);
            this.subdividePlot(p1, depth + 1); this.subdividePlot(p2, depth + 1);
        } else {
             plot.isLeaf = true; plot.children = []; // Marquer comme feuille si les enfants ne sont pas valides
             console.warn("Division a produit des parcelles invalides (malgré la vérification pré), parcelle forcée en feuille : ", plot.id);
             // Nettoyer les plots invalides de la liste globale si nécessaire (plus complexe)
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
             } // Sinon elle reste une parcelle normale (potentiellement petite)
            this.leafPlots.push(plot);
        } else {
            plot.children.forEach(child => this.collectLeafPlots(child));
        }
    }

    // --- Génération de la Géométrie ---

    generateRoadSurfaces() {
        const roadW = this.config.roadWidth;
        const tolerance = 0.1;
        const drawnRoads = new Set();
        const drawnIntersections = new Set();

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

                // Génération si route détectée (inchangée, mais appelle fonctions simplifiées)
                if (roadInfo) {
                    const roadKey = `${Math.min(roadInfo.p1Id, roadInfo.p2Id)}-${Math.max(roadInfo.p1Id, roadInfo.p2Id)}`;
                    if (!drawnRoads.has(roadKey)) {
                        this.createRoadSurfaceGeometry(roadInfo, roadW); // Appel simplifié
                        drawnRoads.add(roadKey);
                        // Ajouter intersections simplifiées (inchangé)
                        let iPos1, iPos2;
                        if (roadInfo.type === 'V') { iPos1 = new THREE.Vector3(roadInfo.x, 0, roadInfo.z); iPos2 = new THREE.Vector3(roadInfo.x, 0, roadInfo.z + roadInfo.length); }
                        else { iPos1 = new THREE.Vector3(roadInfo.x, 0, roadInfo.z); iPos2 = new THREE.Vector3(roadInfo.x + roadInfo.length, 0, roadInfo.z); }
                        const roundFactor = 10;
                        const iKey1 = `${Math.round(iPos1.x * roundFactor)}-${Math.round(iPos1.z * roundFactor)}`;
                        const iKey2 = `${Math.round(iPos2.x * roundFactor)}-${Math.round(iPos2.z * roundFactor)}`;
                        if (!drawnIntersections.has(iKey1)) { this.createIntersectionSurfaceGeometry(iPos1, roadW); drawnIntersections.add(iKey1); } // Appel simplifié
                        if (!drawnIntersections.has(iKey2)) { this.createIntersectionSurfaceGeometry(iPos2, roadW); drawnIntersections.add(iKey2); } // Appel simplifié
                    }
                }
            }
        }
         console.log(`Géométrie chaussée: ${drawnRoads.size} segments, ${drawnIntersections.size} intersections.`);
    }

    // Fonction simplifiée : crée uniquement la surface de la route
    createRoadSurfaceGeometry(info, roadW) {
        const segmentGroup = new THREE.Group();
        let midX, midZ, angle;
        midX = info.x; midZ = info.z; // Centre de la géométrie
        if (info.type === 'V') {
            angle = 0; // Pas de rotation pour vertical (aligné sur Z)
            midZ = info.z + info.length / 2;
        } else { // type 'H'
            angle = Math.PI / 2; // Rotation 90 degrés pour horizontal (aligné sur X)
            midX = info.x + info.length / 2;
        }
        segmentGroup.position.set(midX, 0, midZ); // Positionner au centre calculé
        segmentGroup.rotation.y = angle; // Appliquer la rotation

        // La PlaneGeometry est créée avec (width, height)
        // Pour une route verticale (angle=0), width=roadW, height=info.length
        // Pour une route horizontale (angle=90), width doit être roadW et height info.length *avant rotation*
        // Donc on utilise toujours (roadW, info.length) et la rotation fera le reste.
        const roadGeom = new THREE.PlaneGeometry(roadW, info.length);
        const roadMesh = new THREE.Mesh(roadGeom, this.roadMaterial);
        roadMesh.rotation.x = -Math.PI / 2; // Mettre le plan à plat
        roadMesh.position.y = 0.01; // Léger offset Y pour éviter Z-fighting avec le sol (si existant)
        roadMesh.receiveShadow = true;
        segmentGroup.add(roadMesh);
        // roadGeom.dispose(); // On dispose la géométrie après l'avoir utilisée

        this.roadGroup.add(segmentGroup);
    }

    // Fonction simplifiée : crée uniquement la surface de l'intersection
    createIntersectionSurfaceGeometry(centerPos, roadW) {
        const baseGeom = new THREE.PlaneGeometry(roadW, roadW);
        const baseMesh = new THREE.Mesh(baseGeom, this.roadMaterial);
        baseMesh.position.copy(centerPos);
        baseMesh.rotation.x = -Math.PI / 2;
        baseMesh.position.y = 0.005; // Offset Y (légèrement sous route adjacente pour éviter Z-fighting)
        baseMesh.receiveShadow = true;
        this.roadGroup.add(baseMesh);
        // baseGeom.dispose(); // On dispose la géométrie après l'avoir utilisée
    }

    // Fonction modifiée pour générer contenu ET trottoirs autour des parcelles (bâtiments ET parcs)
    generatePlotContentsAndSidewalks() {
        const baseBuildingGeometry = new THREE.BoxGeometry(1, 1, 1); // Géométrie de base pour les bâtiments
        const sidewalkW = this.config.sidewalkWidth;
        const sidewalkH = this.config.sidewalkHeight;

        this.leafPlots.forEach(plot => {

            // --- Générer Trottoir autour de la parcelle (bâtiment OU parc) ---
            // MODIFICATION ICI : Suppression de la condition "!plot.isPark"
            if (sidewalkW > 0) { // On génère des trottoirs pour TOUTES les parcelles feuilles si largeur > 0
                const sidewalkGroup = new THREE.Group();
                // Positionner le groupe au centre de la parcelle pour faciliter les positions locales
                sidewalkGroup.position.set(plot.center.x, 0, plot.center.z);

                // Dimensions des segments de trottoir
                // Les segments horizontaux (Haut/Bas) ont une longueur étendue pour couvrir les coins
                const horizontalLength = plot.width + 2 * sidewalkW;
                // Les segments verticaux (Gauche/Droite) ont une longueur simple (profondeur de la parcelle)
                const verticalLength = plot.depth;

                // Géométries (réutilisables pour les paires opposées)
                // Création à l'intérieur pour pouvoir les disposer après usage pour cette parcelle
                const geomH = new THREE.BoxGeometry(horizontalLength, sidewalkH, sidewalkW);
                const geomV = new THREE.BoxGeometry(sidewalkW, sidewalkH, verticalLength);

                // Création et positionnement des 4 segments (positions locales par rapport au centre du groupe/plot)
                // Haut
                const topSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                topSW.position.set(0, sidewalkH / 2, -plot.depth / 2 - sidewalkW / 2);
                sidewalkGroup.add(topSW);

                // Bas
                const bottomSW = new THREE.Mesh(geomH, this.sidewalkMaterial);
                bottomSW.position.set(0, sidewalkH / 2, plot.depth / 2 + sidewalkW / 2);
                sidewalkGroup.add(bottomSW);

                // Gauche
                const leftSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                leftSW.position.set(-plot.width / 2 - sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(leftSW);

                 // Droite
                const rightSW = new THREE.Mesh(geomV, this.sidewalkMaterial);
                rightSW.position.set(plot.width / 2 + sidewalkW / 2, sidewalkH / 2, 0);
                sidewalkGroup.add(rightSW);

                // Appliquer les ombres aux trottoirs
                 sidewalkGroup.traverse((child) => {
                     if (child instanceof THREE.Mesh) {
                         child.castShadow = true;
                         child.receiveShadow = true;
                     }
                 });

                // Ajouter le groupe de trottoirs de cette parcelle au groupe global
                this.sidewalkGroup.add(sidewalkGroup);

                // Disposer les géométries de base une fois les 4 maillages créés
                geomH.dispose();
                geomV.dispose();
            } // Fin de la génération du trottoir pour cette parcelle

            // --- Générer Contenu : Parc ---
            if (plot.isPark) {
                const parkGeom = new THREE.PlaneGeometry(plot.width, plot.depth);
                const parkMesh = new THREE.Mesh(parkGeom, this.parkMaterial);
                parkMesh.position.set(plot.center.x, 0.05, plot.center.z); // Léger offset Y pour être au-dessus de la route/intersection
                parkMesh.rotation.x = -Math.PI / 2;
                parkMesh.receiveShadow = true;
                this.buildingGroup.add(parkMesh); // Ajouté au groupe 'building' qui contient aussi les parcs
                // parkGeom.dispose(); // On dispose la géométrie après usage
            }
            // --- Générer Contenu : Bâtiment ---
            else { // Si ce n'est pas un parc, c'est un bâtiment potentiel
                //const margin = this.config.buildingMargin; // Non utilisé
                const buildableWidth = plot.width /* - margin * 2 */ ;
                const buildableDepth = plot.depth /* - margin * 2 */ ;

                // S'assurer qu'il y a de la place pour construire
                if (buildableWidth > 1 && buildableDepth > 1) {
                    const height = THREE.MathUtils.randFloat(this.config.buildingMinHeight, this.config.buildingMaxHeight);
                    // Cloner le matériau pour pouvoir changer la couleur individuellement
                    const buildingMesh = new THREE.Mesh(baseBuildingGeometry, this.buildingMaterial.clone());
                    buildingMesh.scale.set(buildableWidth, height, buildableDepth);
                    // Positionner au centre de la parcelle, avec Y au milieu de sa hauteur
                    buildingMesh.position.set(plot.center.x, height / 2, plot.center.z);
                    buildingMesh.castShadow = true;
                    buildingMesh.receiveShadow = true;
                    // Donner une teinte légèrement variable
                    buildingMesh.material.color.setHSL(Math.random() * 0.1 + 0.55, 0.1, Math.random() * 0.3 + 0.4);
                    this.buildingGroup.add(buildingMesh);
                 } else {
                    // Optionnel: logguer si une parcelle non-parc est trop petite pour un bâtiment
                    // console.log(`Parcelle ${plot.id} trop petite pour un bâtiment.`);
                 }
            }
        }); // Fin de la boucle forEach sur leafPlots

        // Disposer la géométrie de base du bâtiment APRÈS la boucle car elle est réutilisée
         baseBuildingGeometry.dispose();
    }
}