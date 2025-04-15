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
     * @param {object} sizes - L'instance Sizes pour la résolution (utilisé par LineMaterial).
     */
    constructor(parentGroup = null, materials = {}, sizes = null) {
        this.parentGroup = parentGroup || new THREE.Group();
        this.parentGroup.name = "DebugVisuals";
        this.materials = materials;
        this.debugMaterials = {}; // Cache pour matériaux partagés (lignes, sols transparents)
        this.sizes = sizes;

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

	// --- NOUVEAU : Créer les "sols" des parcelles ---
    /**
     * Crée les plans colorés pour visualiser le sol des parcelles.
     * @param {Array<Plot>} plots - Tableau de parcelles (plots).
     * @param {number} height - Hauteur (Y) à utiliser pour les plans des parcelles.
     */
    createPlotGroundVisuals(plots, yPosition) {
        const visualType = 'PlotGroundVisuals';
        this.clearDebugVisuals(visualType);
        const plotGroundHeight = this.plotGroundHeight;
        let plotGroundCount = 0;
        const matricesByTypeColor = {};

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
            // --- Assigner le renderOrder spécifique ---
            material.renderOrder = this.renderOrders.plotGround; // <- MODIFIÉ
            // ---
            const instancedMesh = new THREE.InstancedMesh(this.sharedGroundBoxGeometry, material, matrices.length);
            instancedMesh.name = `PlotGrounds_${key}`;
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
            this.addDebugVisual(instancedMesh, visualType);
        }
        // ... (log inchangé)
    }

	/**
     * Crée les plans colorés pour visualiser le sol des districts.
     * @param {Array<District>} districts - Tableau de districts.
     * @param {number} height - Hauteur (Y) à utiliser pour les plans des districts.
     */
    createDistrictGroundVisuals(districts, yPosition) {
        const visualType = 'DistrictGroundVisuals';
        this.clearDebugVisuals(visualType);
        const districtGroundHeight = this.districtGroundHeight;
        let districtGroundCount = 0;
        const matricesByTypeColor = {};

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
             // --- Assigner le renderOrder spécifique ---
             material.renderOrder = this.renderOrders.districtGround; // <- MODIFIÉ
             // ---
            const instancedMesh = new THREE.InstancedMesh(this.sharedGroundBoxGeometry, material, matrices.length);
            instancedMesh.name = `DistrictGrounds_${key}`;
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
            this.addDebugVisual(instancedMesh, visualType);
        }
        // ... (log inchangé)
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

    // --- NOUVELLE MÉTHODE : Créer les outlines des bâtiments ---
    /**
     * Crée les outlines (boîtes filaires) pour visualiser les bâtiments enregistrés.
     * @param {Map<string, object>} buildingInstancesMap - Map des instances de bâtiments (de CitizenManager).
     * @param {object} config - La configuration pour obtenir les tailles de base.
     */
    createBuildingOutlines(buildingInstancesMap, config, yOffset = 0.05) {
        const visualType = 'BuildingOutlines';
        this.clearDebugVisuals(visualType);
        let buildingCount = 0;
        const matricesByTypeColor = {};

        buildingInstancesMap.forEach(buildingInfo => {
            // ... (calcul dimensions et matrice inchangé)
            const type = buildingInfo.type;
            const position = buildingInfo.position;
            let baseW = 5, baseH = 5, baseD = 5; let scaleFactor = 1.0; let isValidType = true;
            switch(type) {
                case 'house': baseW = config.houseBaseWidth || 5; baseH = config.houseBaseHeight || 6; baseD = config.houseBaseDepth || 5; scaleFactor = config.gridHouseBaseScale || 1.0; break;
                case 'building': baseW = config.buildingBaseWidth || 10; baseH = config.buildingBaseHeight || 20; baseD = config.buildingBaseDepth || 10; scaleFactor = config.gridBuildingBaseScale || 1.0; break;
                case 'industrial': baseW = config.industrialBaseWidth || 18; baseH = config.industrialBaseHeight || 12; baseD = config.industrialBaseDepth || 25; scaleFactor = config.gridIndustrialBaseScale || 1.0; break;
                case 'skyscraper': baseW = config.skyscraperBaseWidth || 15; baseH = config.skyscraperBaseHeight || 80; baseD = config.skyscraperBaseDepth || 15; scaleFactor = config.gridSkyscraperBaseScale || 1.0; break;
                default: isValidType = false; break;
            }
            if (!isValidType) return;
            const targetWidth = baseW * scaleFactor; const targetHeight = baseH * scaleFactor; const targetDepth = baseD * scaleFactor;
            if (!isFinite(targetWidth) || !isFinite(targetHeight) || !isFinite(targetDepth) || targetWidth <= 0 || targetHeight <= 0 || targetDepth <= 0) return;
            const color = this.buildingColors[type] || this.buildingColors.default;
            const colorHex = color.getHexString();
            const materialKey = `building_outline_${colorHex}`;
            const matrix = new THREE.Matrix4();
            const finalPosition = new THREE.Vector3( position.x, targetHeight / 2 + yOffset, position.z );
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3(targetWidth, targetHeight, targetDepth);
            if (!isFinite(finalPosition.x) || !isFinite(finalPosition.y) || !isFinite(finalPosition.z)) return;
            matrix.compose(finalPosition, quaternion, scale);
            if (!matricesByTypeColor[materialKey]) { matricesByTypeColor[materialKey] = { color: color, matrices: [] }; }
            matricesByTypeColor[materialKey].matrices.push(matrix);
            buildingCount++;
        });

        let addedMeshes = 0;
         for (const materialKey in matricesByTypeColor) {
             const data = matricesByTypeColor[materialKey];
             const matrices = data.matrices;
             if (matrices.length === 0) continue;
             // --- Obtenir le matériau OPAQUE avec le bon renderOrder ---
             const material = this._getOrCreateBuildingOutlineMaterial(materialKey, data.color); // Utilise le cache/créateur spécifique
             // ---
             const instancedMesh = new THREE.InstancedMesh(this.sharedBuildingBoxGeometry, material, matrices.length);
             matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
             instancedMesh.instanceMatrix.needsUpdate = true;
             instancedMesh.name = `BuildingOutlines_${data.color.getHexString()}`;
             this.addDebugVisual(instancedMesh, visualType);
             addedMeshes++;
         }
         // ... (log inchangé)
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