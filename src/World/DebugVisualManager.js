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
     * @param {THREE.Group} [parentGroup]
     * @param {object} materials
     * @param {object} sizes
     * @param {object} config
     */
	constructor(parentGroup = null, materials = {}, sizes = null, config = {}) {
		this.parentGroup = parentGroup || new THREE.Group();
		this.parentGroup.name = "DebugVisuals";
		this.materials = materials;
		this.debugMaterials = {};
		this.sizes = sizes;
		this.config = config;

        // --- Couleurs (inchangées) ---
        this.zoneColors = {
            house: new THREE.Color(0x6495ED), building: new THREE.Color(0x4682B4),
            industrial: new THREE.Color(0xB8860B), skyscraper: new THREE.Color(0x8A2BE2),
            park: new THREE.Color(0x228B22), unbuildable: new THREE.Color(0x808080),
            residential: new THREE.Color(0x0077ff), business: new THREE.Color(0xcc0000),
            default: new THREE.Color(0xFFFFFF)
        };
        this.buildingColors = {
            house: new THREE.Color(0x98FB98), building: new THREE.Color(0xADD8E6),
            industrial: new THREE.Color(0xFFD700), skyscraper: new THREE.Color(0xDA70D6),
            park: new THREE.Color(0x3CB371), tree: new THREE.Color(0x9ACD32),
            default: new THREE.Color(0xFFB6C1)
        };

        // --- Hauteurs et Opacités des sols (inchangées) ---
        this.plotGroundOpacity = 0.6;
        this.districtGroundOpacity = 0.4;
        this.plotGroundHeight = 0.01;
        this.districtGroundHeight = 0.005;

        // --- Géométries partagées (inchangées) ---
        this.sharedGroundBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.sharedBuildingBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

        // --- Cache pour matériaux opaques des bâtiments (inchangé) ---
        this.buildingOutlineMaterials = {};

        // --- NOUVEAU : Ordres de rendu ---
        this.renderOrders = {
            districtGround: 0,
            plotGround: 1,
            buildingOutline: 2,
            debugLine: 999 // Lignes par-dessus tout
        };
    }

    /**
     * Crée un matériau de debug (MeshBasic transparent ou LineMaterial/LineBasic) s'il n'existe pas.
     * NOTE : Ne gère PLUS les matériaux opaques des outlines de bâtiments.
     */
    _getOrCreateDebugMaterial(key, color, isGroundPlane = false, opacity = 0.5, lineThickness = 1.0) {
        if (!this.debugMaterials[key]) {
            if (isGroundPlane) {
                this.debugMaterials[key] = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: opacity,
                    side: THREE.DoubleSide,
                    depthTest: true,   // <-- MODIFIÉ: Activer le test de profondeur
                    depthWrite: false, // <-- AJOUTÉ: Ne pas écrire dans le depth buffer (standard pour transparence)
                });
                 // Assigner le renderOrder spécifique aux sols
                 this.debugMaterials[key].renderOrder = this.renderOrders.plotGround; // Ou districtGround si on différencie
            } else if (this.sizes && lineThickness > 1) { // Ligne épaisse
                 this.debugMaterials[key] = new LineMaterial({
                     color: color.getHex(),
                     linewidth: lineThickness,
                     resolution: new THREE.Vector2(this.sizes.width, this.sizes.height),
                     dashed: false,
                     depthTest: false // Garder false pour les lignes qui doivent être visibles
                 });
                 this.debugMaterials[key].renderOrder = this.renderOrders.debugLine; // Mettre par dessus
            } else { // Ligne fine (fallback)
                 this.debugMaterials[key] = new LineBasicMaterial({
                     color: color,
                     depthTest: false // Garder false pour les lignes
                 });
                 this.debugMaterials[key].renderOrder = this.renderOrders.debugLine; // Mettre par dessus
            }
            this.debugMaterials[key].name = `DebugMat_${key}`;
            // renderOrder est maintenant assigné spécifiquement ci-dessus
        }
        // Mise à jour résolution pour LineMaterial
        const mat = this.debugMaterials[key];
        if (mat instanceof LineMaterial && this.sizes) {
             mat.resolution.set(this.sizes.width, this.sizes.height);
        }
        return mat;
    }

    // --- NOUVEAU : Obtenir/créer matériau OPAQUE pour Building Outlines ---
    _getOrCreateBuildingOutlineMaterial(key, color) {
        if (!this.buildingOutlineMaterials[key]) {
             this.buildingOutlineMaterials[key] = new THREE.MeshBasicMaterial({
                 color: color,
                 transparent: false, // Opaque
                 depthTest: true,    // Test profondeur activé (défaut)
                 depthWrite: true    // Écrit la profondeur (défaut)
             });
             this.buildingOutlineMaterials[key].name = `BuildingOutlineMat_${key}`;
             // Assigner un renderOrder plus élevé que les sols
             this.buildingOutlineMaterials[key].renderOrder = this.renderOrders.buildingOutline;
        }
        return this.buildingOutlineMaterials[key];
    }
    // --- FIN NOUVEAU ---

    addDebugVisual(object3D, visualType) {
        object3D.userData.visualType = visualType;
        this.parentGroup.add(object3D);
    }

    /**
     * Supprime du groupe parent tous les objets correspondant au type spécifié.
     * Dispose les géométries associées.
     * @param {string} visualType - Type de visuel à nettoyer.
     */
    clearDebugVisuals(visualType) {
        // ... (code existant inchangé)
        const objectsToRemove = [];
        for (let i = this.parentGroup.children.length - 1; i >= 0; i--) {
            const child = this.parentGroup.children[i];
            if (child.userData?.visualType === visualType) {
                objectsToRemove.push(child);
            }
        }
        objectsToRemove.forEach(child => {
            this.parentGroup.remove(child);
            // NE PAS disposer la géométrie si elle est partagée
            if (child.geometry && child.geometry !== this.sharedGroundBoxGeometry && child.geometry !== this.sharedBuildingBoxGeometry) {
                 child.geometry.dispose();
            }
            // Les matériaux sont gérés séparément (partagés ou spécifiques)
        });
    }

	clearAllAndDisposeMaterials() {
        // ... (code existant inchangé)
        console.log("Clearing all debug visuals and disposing materials...");
        this.clearDebugVisuals('PlotOutlines');
        this.clearDebugVisuals('BuildingOutlines');
        this.clearDebugVisuals('PlotGroundVisuals');
        this.clearDebugVisuals('DistrictGroundVisuals');

        Object.values(this.debugMaterials).forEach(material => material.dispose());
        this.debugMaterials = {};

        Object.values(this.buildingOutlineMaterials).forEach(material => material.dispose());
        this.buildingOutlineMaterials = {};

        this.sharedGroundBoxGeometry?.dispose();
        this.sharedBuildingBoxGeometry?.dispose();

        console.log("Debug materials and shared geometries disposed.");
    }

	/**
     * Crée les plans colorés pour visualiser le sol des parcelles.
     * @param {Array<Plot>} plots - Tableau de parcelles (plots).
     * @param {number} yPosition - Hauteur (Y) à utiliser pour les plans des parcelles.
     * @returns {Array<THREE.InstancedMesh>} Tableau des InstancedMesh créés pour les sols des parcelles.
     */
    createPlotGroundVisuals(plots, yPosition) {
        const visualType = 'PlotGroundVisuals';
        this.clearDebugVisuals(visualType); // Garder le nettoyage
        const plotGroundHeight = this.plotGroundHeight;
        let plotGroundCount = 0;
        const matricesByTypeColor = {};
        const createdMeshes = []; // <-- NOUVEAU: Tableau pour retourner les meshes

        // ... (logique existante pour remplir matricesByTypeColor) ...
         plots.forEach(plot => {
             if (plot.zoneType === 'unbuildable' || plot.width <= 0 || plot.depth <= 0) return;
             const color = this.zoneColors[plot.zoneType] || this.zoneColors.default;
             const colorHex = color.getHexString();
             const materialKey = `plot_ground_${colorHex}`;
             const matrix = new THREE.Matrix4();
             const position = new THREE.Vector3( plot.x + plot.width / 2, yPosition + plotGroundHeight / 2, plot.z + plot.depth / 2 );
             const quaternion = new THREE.Quaternion();
             const scale = new THREE.Vector3(plot.width, plotGroundHeight, plot.depth);
             matrix.compose(position, quaternion, scale);
             if (!matricesByTypeColor[materialKey]) { matricesByTypeColor[materialKey] = { color: color, matrices: [] }; }
             matricesByTypeColor[materialKey].matrices.push(matrix);
             plotGroundCount++;
         });

        for (const key in matricesByTypeColor) {
            const data = matricesByTypeColor[key];
            const matrices = data.matrices;
            if (matrices.length === 0) continue;
            const material = this._getOrCreateDebugMaterial(key, data.color, true, this.plotGroundOpacity);
            material.renderOrder = this.renderOrders.plotGround; // Assigner renderOrder ici

            const instancedMesh = new THREE.InstancedMesh(this.sharedGroundBoxGeometry, material, matrices.length);
            instancedMesh.name = `PlotGrounds_${key}`;
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.userData.visualType = visualType; // <-- Garder pour le nettoyage

            // NE PAS AJOUTER A parentGroup ICI
            // this.addDebugVisual(instancedMesh, visualType); <-- RETIRÉ

            createdMeshes.push(instancedMesh); // <-- AJOUTÉ: Ajouter au tableau de retour
        }
        console.log(`DebugVisualManager: ${createdMeshes.length} InstancedMesh de sols de parcelles créés.`);
        return createdMeshes; // <-- AJOUTÉ: Retourner les meshes
    }

	/**
     * Crée les plans colorés pour visualiser le sol des districts.
     * @param {Array<District>} districts - Tableau de districts.
     * @param {number} yPosition - Hauteur (Y) à utiliser pour les plans des districts.
     * @returns {Array<THREE.InstancedMesh>} Tableau des InstancedMesh créés pour les sols des districts.
     */
    createDistrictGroundVisuals(districts, yPosition) {
        const visualType = 'DistrictGroundVisuals';
        this.clearDebugVisuals(visualType); // Garder le nettoyage
        const districtGroundHeight = this.districtGroundHeight;
        let districtGroundCount = 0;
        const matricesByTypeColor = {};
        const createdMeshes = []; // <-- NOUVEAU

        // ... (logique existante pour remplir matricesByTypeColor) ...
         districts.forEach(district => {
             if (!district.plots || district.plots.length === 0) return;
             const bounds = district.bounds; if (!bounds || bounds.isEmpty()) return;
             const size = new THREE.Vector3(); bounds.getSize(size);
             const center = new THREE.Vector3(); bounds.getCenter(center);
             if (size.x <= 0 || size.z <= 0) return;
             const color = this.zoneColors[district.type] || this.zoneColors.default;
             const colorHex = color.getHexString();
             const materialKey = `district_ground_${colorHex}`;
             const matrix = new THREE.Matrix4();
             const position = new THREE.Vector3( center.x, yPosition + districtGroundHeight / 2, center.z );
             const quaternion = new THREE.Quaternion();
             const scale = new THREE.Vector3(size.x, districtGroundHeight, size.z);
             matrix.compose(position, quaternion, scale);
             if (!matricesByTypeColor[materialKey]) { matricesByTypeColor[materialKey] = { color: color, matrices: [] }; }
             matricesByTypeColor[materialKey].matrices.push(matrix);
             districtGroundCount++;
         });

        for (const key in matricesByTypeColor) {
            const data = matricesByTypeColor[key];
            const matrices = data.matrices;
            if (matrices.length === 0) continue;
            const material = this._getOrCreateDebugMaterial(key, data.color, true, this.districtGroundOpacity);
            material.renderOrder = this.renderOrders.districtGround; // Assigner renderOrder

            const instancedMesh = new THREE.InstancedMesh(this.sharedGroundBoxGeometry, material, matrices.length);
            instancedMesh.name = `DistrictGrounds_${key}`;
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
             instancedMesh.userData.visualType = visualType; // <-- Garder pour le nettoyage

            // this.addDebugVisual(instancedMesh, visualType); <-- RETIRÉ
            createdMeshes.push(instancedMesh); // <-- AJOUTÉ
        }
         console.log(`DebugVisualManager: ${createdMeshes.length} InstancedMesh de sols de districts créés.`);
        return createdMeshes; // <-- AJOUTÉ
    }

    // --- NOUVELLE MÉTHODE : Créer les outlines des parcelles ---
    /**
     * Crée les outlines (carrés au sol) pour visualiser les parcelles.
     * @param {Array<Plot>} plots - Tableau de parcelles (plots).
     * @param {number} [debugHeight=0.1] - Hauteur (Y) à utiliser pour les outlines.
     */
    createPlotOutlines(plots, debugHeight = 0.05, lineThickness = 2.0) {
		const visualType = 'PlotOutlines';
		this.clearDebugVisuals(visualType);
		let plotCount = 0;

		if (!this.sizes && lineThickness > 1.0) {
			 console.warn("[DVM Plot Outline] Sizes instance missing, cannot create thick lines. Falling back to thin lines.");
			 lineThickness = 1.0;
		 }

		plots.forEach(plot => {
			if (plot.width <=0 || plot.depth <= 0) return;
			const color = this.zoneColors[plot.zoneType] || this.zoneColors.default;
			const materialKey = `plot_outline_${color.getHexString()}_${lineThickness.toFixed(1)}`;
			const points = [ /* ... points ... */
			   plot.x, debugHeight, plot.z,
			   plot.x + plot.width, debugHeight, plot.z,
			   plot.x + plot.width, debugHeight, plot.z + plot.depth,
			   plot.x, debugHeight, plot.z + plot.depth,
			   plot.x, debugHeight, plot.z
			];
			let lineObject = null;
			const material = this._getOrCreateDebugMaterial(materialKey, color, false, 0, lineThickness);
			// --- Assigner le renderOrder pour les lignes ---
			 if (material instanceof LineMaterial || material instanceof LineBasicMaterial) {
				 material.renderOrder = this.renderOrders.debugLine; // <- AJOUTÉ
			 }
			// ---
			if (material instanceof LineMaterial) { /* ... création Line2 ... */
			   const geometry = new LineGeometry();
			   geometry.setPositions(points);
			   const line = new Line2(geometry, material);
			   line.computeLineDistances();
			   line.scale.set(1, 1, 1);
			   lineObject = line;
			} else { /* ... fallback LineSegments ... */
			   const geometry = new THREE.BufferGeometry().setFromPoints(points.reduce((acc, _, i, arr) => {
				   if (i % 3 === 0 && i < arr.length - 3) { acc.push(new THREE.Vector3(arr[i], arr[i+1], arr[i+2]), new THREE.Vector3(arr[i+3], arr[i+4], arr[i+5]));
				   } else if (i === arr.length - 3) { acc.push(new THREE.Vector3(arr[i], arr[i+1], arr[i+2]), new THREE.Vector3(arr[0], arr[1], arr[2])); }
				   return acc; }, []));
				lineObject = new THREE.LineSegments(geometry, material);
			}
			if (lineObject) {
				lineObject.name = `PlotOutline_${plot.id}_${plot.zoneType}`;
				this.addDebugVisual(lineObject, visualType);
				plotCount++;
			}
		});
	}

	/**
      * Crée les outlines (boîtes OPAQUES) pour visualiser les bâtiments enregistrés.
      * @param {Map<string, object>} buildingInstancesMap
      * @param {object} config - Passé pour info, mais utilise this.config stocké.
      * @param {number} yOffset
      * @returns {Array<THREE.InstancedMesh>} Tableau des InstancedMesh créés pour les outlines des bâtiments.
      */
    createBuildingOutlines(buildingInstancesMap, config, yOffset = 0.05) {
        const visualType = 'BuildingOutlines';
        this.clearDebugVisuals(visualType); // Garder le nettoyage
        let buildingCount = 0;
        const matricesByTypeColor = {};
        const createdMeshes = []; // <-- NOUVEAU

        // ... (logique existante pour remplir matricesByTypeColor) ...
        buildingInstancesMap.forEach(buildingInfo => {
             const type = buildingInfo.type;
             const position = buildingInfo.position;
             let baseW = 5, baseH = 5, baseD = 5;
             let scaleFactor = 1.0;
             let isValidType = true;
             let specificDebugScaleReduction = 0.7;
             const debugConfig = this.config.debug || {};

             switch(type) { // Récupérer dimensions et scale depuis this.config
                  case 'house':
                      baseW = this.config.houseBaseWidth || 5; baseH = this.config.houseBaseHeight || 6; baseD = this.config.houseBaseDepth || 5;
                      scaleFactor = this.config.gridHouseBaseScale || 1.0;
                      specificDebugScaleReduction = debugConfig.houseScaleReduction ?? 0.8;
                      break;
                  case 'building':
                      baseW = this.config.buildingBaseWidth || 10; baseH = this.config.buildingBaseHeight || 20; baseD = this.config.buildingBaseDepth || 10;
                      scaleFactor = this.config.gridBuildingBaseScale || 1.0;
                      specificDebugScaleReduction = debugConfig.buildingScaleReduction ?? 0.7;
                      break;
                  case 'industrial':
                      baseW = this.config.industrialBaseWidth || 18; baseH = this.config.industrialBaseHeight || 12; baseD = this.config.industrialBaseDepth || 25;
                      scaleFactor = this.config.gridIndustrialBaseScale || 1.0;
                      specificDebugScaleReduction = debugConfig.industrialScaleReduction ?? 0.6;
                      break;
                  case 'skyscraper':
                      baseW = this.config.skyscraperBaseWidth || 15; baseH = this.config.skyscraperBaseHeight || 80; baseD = this.config.skyscraperBaseDepth || 15;
                      scaleFactor = this.config.gridSkyscraperBaseScale || 1.0;
                      specificDebugScaleReduction = debugConfig.skyscraperScaleReduction ?? 0.5;
                      break;
                  default: isValidType = false; break;
             }
             if (!isValidType) return;
             const targetWidth = baseW * scaleFactor;
             const targetHeight = baseH * scaleFactor;
             const targetDepth = baseD * scaleFactor;
             if (!isFinite(targetWidth) || !isFinite(targetHeight) || !isFinite(targetDepth) || targetWidth <= 0 || targetHeight <= 0 || targetDepth <= 0) return;
             const finalDebugWidth = targetWidth * specificDebugScaleReduction;
             const finalDebugHeight = targetHeight * specificDebugScaleReduction;
             const finalDebugDepth = targetDepth * specificDebugScaleReduction;
             const color = this.buildingColors[type] || this.buildingColors.default;
             const colorHex = color.getHexString();
             const materialKey = `building_outline_${colorHex}`;
             const matrix = new THREE.Matrix4();
             const finalPosition = new THREE.Vector3(position.x, finalDebugHeight / 2 + yOffset, position.z);
             const quaternion = new THREE.Quaternion();
             const scale = new THREE.Vector3(finalDebugWidth, finalDebugHeight, finalDebugDepth);
             if (!isFinite(finalPosition.x) || !isFinite(finalPosition.y) || !isFinite(finalPosition.z)) return;
             matrix.compose(finalPosition, quaternion, scale);
             if (!matricesByTypeColor[materialKey]) { matricesByTypeColor[materialKey] = { color: color, matrices: [] }; }
             matricesByTypeColor[materialKey].matrices.push(matrix);
             buildingCount++;
         });


        for (const materialKey in matricesByTypeColor) {
             const data = matricesByTypeColor[materialKey];
             const matrices = data.matrices;
             if (matrices.length === 0) continue;
             const material = this._getOrCreateBuildingOutlineMaterial(materialKey, data.color); // Opaque
             material.renderOrder = this.renderOrders.buildingOutline; // Assigner renderOrder

             const instancedMesh = new THREE.InstancedMesh(this.sharedBuildingBoxGeometry, material, matrices.length);
             matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
             instancedMesh.instanceMatrix.needsUpdate = true;
             instancedMesh.name = `BuildingOutlines_${data.color.getHexString()}`;
             instancedMesh.userData.visualType = visualType; // <-- Garder pour nettoyage

             // this.addDebugVisual(instancedMesh, visualType); <-- RETIRÉ
             createdMeshes.push(instancedMesh); // <-- AJOUTÉ
        }
        console.log(`DebugVisualManager: ${createdMeshes.length} InstancedMesh d'outlines de bâtiments créés.`);
        return createdMeshes; // <-- AJOUTÉ
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