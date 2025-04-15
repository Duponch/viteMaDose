import * as THREE from 'three';
// Retirer mergeGeometries si on ne l'utilise plus pour les plots
// import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';

/**
 * DebugVisualManager centralise la création et le nettoyage des visuels de debug.
 */
export default class DebugVisualManager {
    /**
     * Constructeur.
     * @param {THREE.Group} [parentGroup] - Le groupe auquel ajouter les visuels de debug.
     * @param {object} materials - Un objet contenant les matériaux à utiliser.
     */
	constructor(parentGroup = null, materials = {}, sizes = null) {
        this.parentGroup = parentGroup || new THREE.Group();
        this.parentGroup.name = "DebugVisuals";
        this.materials = materials; // Matériaux existants
        this.debugMaterials = {}; // Pour stocker les matériaux de debug créés
        this.sizes = sizes;

        // --- NOUVEAU : Définition des couleurs ---
        this.plotColors = {
            house: new THREE.Color(0x6495ED),        // Cornflower Blue
            building: new THREE.Color(0x4682B4),     // Steel Blue
            industrial: new THREE.Color(0xB8860B),   // Dark Goldenrod
            skyscraper: new THREE.Color(0x8A2BE2),   // Blue Violet
            park: new THREE.Color(0x228B22),        // Forest Green
            unbuildable: new THREE.Color(0x808080), // Grey
            default: new THREE.Color(0xFFFFFF)      // White (fallback)
        };
        this.buildingColors = {
            house: new THREE.Color(0x90EE90),        // Light Green
            building: new THREE.Color(0xADD8E6),     // Light Blue
            industrial: new THREE.Color(0xFFD700),   // Gold
            skyscraper: new THREE.Color(0xDA70D6),   // Orchid
            park: new THREE.Color(0x32CD32),        // Lime Green (pour éléments de parc?)
            tree: new THREE.Color(0x9ACD32),        // Yellow Green
            default: new THREE.Color(0xFFC0CB)      // Pink (fallback)
        };
        // --- FIN NOUVEAU ---
    }

    /**
     * Crée un matériau de debug (LineBasic ou MeshBasic Wireframe) s'il n'existe pas.
     * @param {string} key - Clé unique pour le matériau (ex: 'plot_house', 'building_industrial').
     * @param {THREE.Color} color - La couleur du matériau.
     * @param {boolean} isWireframe - Si true, crée un MeshBasicMaterial wireframe, sinon LineBasicMaterial.
     * @returns {THREE.Material}
     */
    _getOrCreateDebugMaterial(key, color, isWireframe = false, lineThickness = 1.0) {
		if (!this.debugMaterials[key]) {
			if (isWireframe) {
				// --- MODIFICATION : Rendu Solide Transparent au lieu de Wireframe ---
				this.debugMaterials[key] = new THREE.MeshBasicMaterial({
					color: color,
					// wireframe: false, // <--- Retiré ou mis à false
					depthTest: false,
					transparent: true,
					opacity: 0.35, // Ajuster l'opacité pour la visibilité
					side: THREE.DoubleSide // Pour voir l'intérieur si besoin
				});
				// --- FIN MODIFICATION ---
			} else if (this.sizes) {
				// ... (cas LineMaterial inchangé) ...
				 this.debugMaterials[key] = new LineMaterial({ /* ... */ });
			} else {
				// ... (cas LineBasicMaterial fallback inchangé) ...
				 this.debugMaterials[key] = new LineBasicMaterial({ /* ... */ });
			}
			this.debugMaterials[key].name = `DebugMat_${key}`;
			this.debugMaterials[key].renderOrder = 999;
		}
		// ... (mise à jour résolution/linewidth inchangée) ...
		return this.debugMaterials[key];
	}

    /**
     * Ajoute un objet de debug au groupe parent.
     * @param {THREE.Object3D} object3D - L'objet de debug à ajouter.
     * @param {string} visualType - Le type de visuel (ex: 'PlotOutlines', 'BuildingOutlines').
     */
    addDebugVisual(object3D, visualType) {
        object3D.userData.visualType = visualType; // Marquer l'objet
        this.parentGroup.add(object3D);
    }

    /**
     * Supprime du groupe parent tous les objets correspondant au type spécifié.
     * @param {string} visualType - Type de visuel à nettoyer.
     */
    clearDebugVisuals(visualType) {
        const objectsToRemove = [];
        for (let i = this.parentGroup.children.length - 1; i >= 0; i--) {
            const child = this.parentGroup.children[i];
            if (child.userData && child.userData.visualType === visualType) {
                objectsToRemove.push(child);
            }
        }
        let disposedGeometries = 0;
        objectsToRemove.forEach(child => {
            this.parentGroup.remove(child);
            if (child.geometry) {
                child.geometry.dispose();
                disposedGeometries++;
            }
            // Les matériaux sont partagés via _getOrCreateDebugMaterial, ne pas les disposer ici.
        });
        // console.log(`Cleared ${objectsToRemove.length} debug visuals of type '${visualType}'. Disposed ${disposedGeometries} geometries.`);
    }

     /**
      * Nettoie TOUS les visuels de debug gérés par ce manager et dispose les matériaux créés.
      */
     clearAllAndDisposeMaterials() {
        console.log("Clearing all debug visuals and disposing materials...");
        this.clearDebugVisuals('PlotOutlines');
        this.clearDebugVisuals('BuildingOutlines');
        // Ajoutez d'autres types si nécessaire
        this.clearDebugVisuals('ParkOutlines');
        this.clearDebugVisuals('DistrictBoundaries');

        // Dispose des matériaux de debug créés
        Object.values(this.debugMaterials).forEach(material => material.dispose());
        this.debugMaterials = {};
        console.log("Debug materials disposed.");
     }


    // --- NOUVELLE MÉTHODE : Créer les outlines des parcelles ---
    /**
     * Crée les outlines (carrés au sol) pour visualiser les parcelles.
     * @param {Array<Plot>} plots - Tableau de parcelles (plots).
     * @param {number} [debugHeight=0.1] - Hauteur (Y) à utiliser pour les outlines.
     */
    createPlotOutlines(plots, debugHeight = 0.1, lineThickness = 3.0) { // Ajout lineThickness
		const visualType = 'PlotOutlines';
		this.clearDebugVisuals(visualType);
		let plotCount = 0;
		// Pas besoin de fusionner, on crée une Line2 par plot
		console.log(`  [DVM Plot Line2] Processing ${plots.length} plots...`);
	
		if (!this.sizes) {
			console.error("[DVM Plot Line2] Sizes instance missing in DebugVisualManager. Cannot create thick lines.");
			return;
		}
	
		plots.forEach(plot => {
			const color = this.plotColors[plot.zoneType] || this.plotColors.default;
			const colorHex = color.getHexString(); // Pour la clé du matériau
	
			// Points du carré (X, Y, Z, X, Y, Z, ...)
			const points = [
				plot.x, debugHeight, plot.z,
				plot.x + plot.width, debugHeight, plot.z,
				plot.x + plot.width, debugHeight, plot.z + plot.depth,
				plot.x, debugHeight, plot.z + plot.depth,
				plot.x, debugHeight, plot.z // Retour au début pour fermer
			];
	
			// Créer la géométrie spécifique pour Line2
			const geometry = new LineGeometry();
			geometry.setPositions(points); // Attend un tableau plat [x1, y1, z1, x2, y2, z2, ...]
	
			// Obtenir ou créer le matériau épais
			// Le troisième argument 'false' indique que ce n'est pas un wireframe
			const material = this._getOrCreateDebugMaterial(`plot_line_${colorHex}`, color, false, lineThickness);
	
			// Vérifier si le matériau est bien LineMaterial (sinon on ne peut pas créer Line2)
			if (!(material instanceof LineMaterial)) {
				 console.warn(`[DVM Plot Line2] Could not get/create LineMaterial for plot ${plot.id}. Skipping.`);
				 geometry.dispose(); // Nettoyer la géométrie créée
				 return; // Passer au plot suivant
			}
	
	
			// Créer l'objet Line2
			const line = new Line2(geometry, material);
			line.computeLineDistances(); // Important pour LineMaterial
			line.scale.set(1, 1, 1); // Nécessaire pour LineMaterial
			line.name = `PlotOutline_${plot.id}_${plot.zoneType}`;
	
			// Ajouter au groupe de debug
			this.addDebugVisual(line, visualType);
			plotCount++;
		});
	
		console.log(`  [DVM Plot Line2] Finished creating outlines. Added ${plotCount} Line2 objects.`);
	}

    // --- NOUVELLE MÉTHODE : Créer les outlines des bâtiments ---
    /**
     * Crée les outlines (boîtes filaires) pour visualiser les bâtiments enregistrés.
     * @param {Map<string, object>} buildingInstancesMap - Map des instances de bâtiments (de CitizenManager).
     * @param {object} config - La configuration pour obtenir les tailles de base.
     */
    createBuildingOutlines(buildingInstancesMap, config) {
        const visualType = 'BuildingOutlines';
        this.clearDebugVisuals(visualType);
        let buildingCount = 0;
        const baseGeometries = {};
        const getBaseGeom = (type) => { /* ... code existant ... */
             if (!baseGeometries[type]) {
                let w = 5, h = 5, d = 5; // Taille par défaut
                let valid = true;
                switch(type) {
                    case 'house':       w = config.houseBaseWidth * 0.8 || 5; h = config.houseBaseHeight * 0.8 || 5; d = config.houseBaseDepth * 0.8 || 5; break;
                    case 'building':    w = config.buildingBaseWidth * 0.7 || 8; h = config.buildingBaseHeight * 0.7 || 15; d = config.buildingBaseDepth * 0.7 || 8; break;
                    case 'industrial':  w = config.industrialBaseWidth * 0.6 || 15; h = config.industrialBaseHeight * 0.6 || 10; d = config.industrialBaseDepth * 0.6 || 20; break;
                    case 'skyscraper':  w = config.skyscraperBaseWidth * 0.6 || 12; h = config.skyscraperBaseHeight * 0.6 || 50; d = config.skyscraperBaseDepth * 0.6 || 12; break;
                    default: valid = false; break; // Ne pas créer pour park, tree, etc.
                }
                if (!valid) return null;
                // *** AJOUT Vérification NaN/Infinity ***
                 if (!isFinite(w) || !isFinite(h) || !isFinite(d) || w <= 0 || h <= 0 || d <= 0) {
                     console.warn(`  [DVM Build] Invalid dimensions calculated for type '${type}': W=${w}, H=${h}, D=${d}. Using default 5x5x5.`);
                     w = 5; h = 5; d = 5;
                 }
                baseGeometries[type] = new THREE.BoxGeometry(w, h, d);
            }
            return baseGeometries[type];
        };
        const matricesByTypeColor = {};
        // *** AJOUT LOG ***
        console.log(`  [DVM Build] Processing ${buildingInstancesMap.size} building instances...`);

        buildingInstancesMap.forEach(buildingInfo => {
            const geom = getBaseGeom(buildingInfo.type);
            if (!geom) return;

            const color = this.buildingColors[buildingInfo.type] || this.buildingColors.default;
            const colorHex = color.getHexString();
            const matrix = new THREE.Matrix4();
            const position = buildingInfo.position.clone();
             // *** AJOUT Vérification NaN/Infinity ***
             if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
                  console.warn(`  [DVM Build] Invalid position for building ${buildingInfo.id} (type ${buildingInfo.type}):`, position);
                  return; // Ignorer ce bâtiment
             }
             // *** AJOUT Vérification geom.parameters ***
             if (!geom.parameters || typeof geom.parameters.height !== 'number') {
                 console.warn(`  [DVM Build] Geometry parameters missing for type ${buildingInfo.type}`);
                 position.y = 2.5 + 0.05; // Fallback height guess
             } else {
                position.y = geom.parameters.height / 2 + 0.05;
             }
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            matrix.compose(position, quaternion, scale);

            if (!matricesByTypeColor[colorHex]) {
                matricesByTypeColor[colorHex] = { type: buildingInfo.type, matrices: [] };
            }
            matricesByTypeColor[colorHex].matrices.push(matrix);
            buildingCount++;
        });
         // *** AJOUT LOG ***
         console.log(`  [DVM Build] Processed ${buildingCount} valid buildings. Found ${Object.keys(matricesByTypeColor).length} type/color groups.`);

        let addedMeshes = 0; // Compteur
         for (const colorHex in matricesByTypeColor) {
             const data = matricesByTypeColor[colorHex];
             const baseGeom = getBaseGeom(data.type); // Re-get (should be cached)
             const matrices = data.matrices;

             if (baseGeom && matrices.length > 0) {
                 const material = this._getOrCreateDebugMaterial(`building_${colorHex}`, new THREE.Color(`#${colorHex}`), true);
                 const instancedMesh = new THREE.InstancedMesh(baseGeom, material, matrices.length);

                 matrices.forEach((mat, index) => {
                     instancedMesh.setMatrixAt(index, mat);
                 });
                 instancedMesh.instanceMatrix.needsUpdate = true;
                 instancedMesh.name = `BuildingOutlines_${data.type}_${colorHex}`;
                 this.addDebugVisual(instancedMesh, visualType);
                 addedMeshes++; // Incrémenter
                 // *** AJOUT LOG ***
                 // console.log(`    [DVM Build] Added InstancedMesh for type ${data.type}, color #${colorHex}`);
             } else {
                 // *** AJOUT LOG ***
                 console.warn(`    [DVM Build] Skipping InstancedMesh creation for color #${colorHex} (geom: ${!!baseGeom}, matrices: ${matrices.length})`);
             }
         }
         Object.values(baseGeometries).forEach(g => g.dispose());
         // *** AJOUT LOG ***
         console.log(`  [DVM Build] Finished creating outlines. Added ${addedMeshes} InstancedMesh objects.`);
    }

    // Les méthodes createParkOutlines et createDistrictBoundaries restent inchangées
    // ... (coller le code existant de ces méthodes ici) ...
    createParkOutlines(plots, debugHeight = 0.15) { // Légèrement plus haut que les parcelles
        const visualType = 'ParkOutlines';
        this.clearDebugVisuals(visualType);
        let parkCount = 0;
        const parkGeometries = []; // Pour fusion

        plots.forEach(plot => {
            if (plot.zoneType === 'park') {
                parkCount++;
                const points = [
                    new THREE.Vector3(plot.x, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z) // Fermeture
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                parkGeometries.push(geometry);
            }
        });

        if (parkGeometries.length > 0) {
            const mergedGeometry = mergeGeometries(parkGeometries, false);
            if (mergedGeometry) {
                const material = this._getOrCreateDebugMaterial('park_outline', this.plotColors.park, false);
                const line = new THREE.LineSegments(mergedGeometry, material);
                line.name = `ParkOutlines_Merged`;
                this.addDebugVisual(line, visualType);
                console.log(`DebugVisualManager: ${parkCount} park outlines created (merged).`);
            } else {
                console.warn("Failed to merge park outline geometries.");
            }
            parkGeometries.forEach(g => g.dispose()); // Nettoyer
        }
    }

    createDistrictBoundaries(districts, config) {
        const visualType = 'DistrictBoundaries';
        this.clearDebugVisuals(visualType);
        if (!config.showDistrictBoundaries) return;

        districts.forEach(district => {
            if (!district.plots || district.plots.length === 0) return;
            const bounds = district.bounds;
            const size = new THREE.Vector3();
            bounds.getSize(size);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            if (size.x <= 0 || size.z <= 0) return;

            const planeGeom = new THREE.PlaneGeometry(size.x, size.z);
            let material;
            const districtColorKey = `district_${district.type}`;
            const color = this.plotColors[district.type] || this.plotColors.default; // Utiliser les couleurs de plot
             material = this._getOrCreateDebugMaterial(districtColorKey, color, true); // Wireframe
             // On pourrait ajuster l'opacité ici si besoin
             // material.opacity = 0.3;

            const planeMesh = new THREE.Mesh(planeGeom, material);
            planeMesh.position.set(center.x, 0.15, center.z); // Au-dessus des outlines de plot
            planeMesh.rotation.x = -Math.PI / 2;
            planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
            this.addDebugVisual(planeMesh, visualType);
        });
        // console.log("DebugVisualManager: District boundaries updated.");
    }
}