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
        this.parentGroup.name = "DebugVisuals"; // Ce groupe n'est peut-être plus utilisé directement par World.js
        this.materials = materials; // Matériaux standards
        this.debugMaterials = {}; // Cache pour matériaux de debug (lignes, sols)
        this.sizes = sizes;
        this.config = config;

        // --- Couleurs (utilisées pour obtenir la couleur initiale) ---
        this.zoneColors = { /* ... couleurs existantes ... */
            house: new THREE.Color(0x6495ED), building: new THREE.Color(0x4682B4),
            industrial: new THREE.Color(0xB8860B), skyscraper: new THREE.Color(0x8A2BE2),
            park: new THREE.Color(0x228B22), unbuildable: new THREE.Color(0x808080),
            residential: new THREE.Color(0x0077ff), business: new THREE.Color(0xcc0000),
            default: new THREE.Color(0xFFFFFF)
        };
        this.buildingColors = { /* ... couleurs existantes ... */
            house: new THREE.Color(0x98FB98), building: new THREE.Color(0xADD8E6),
            industrial: new THREE.Color(0xFFD700), skyscraper: new THREE.Color(0xDA70D6),
            park: new THREE.Color(0x3CB371), tree: new THREE.Color(0x9ACD32),
            default: new THREE.Color(0xFFB6C1)
        };

        // --- Opacités ---
        this.plotGroundOpacity = 0.6;
        this.districtGroundOpacity = 0.4;
        // Retrait des hauteurs ici, elles sont gérées par World.js

        // --- Géométries partagées ---
        this.sharedGroundBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.sharedBuildingBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

        // --- Cache pour matériaux (maintenant générique) ---
        this.cachedMaterials = {};

        // --- Ordres de rendu ---
        this.renderOrders = {
            districtGround: 0,
            plotGround: 1,
            buildingOutline: 2,
            debugLine: 999
        };
    }

    /**
     * Crée ou récupère un matériau de debug depuis le cache.
     * Gère les matériaux pour les sols (MeshBasic, transparent) et les lignes.
     * @param {string} key Clé unique pour le matériau (ex: 'plot_ground_house', 'building_outline_residential').
     * @param {THREE.Color} color Couleur de base.
     * @param {string} visualType Type de visuel ('ground', 'outline').
     * @param {number} [opacity=0.5] Opacité pour les sols.
     * @param {number} [lineThickness=1.0] Épaisseur pour les lignes.
     * @returns {THREE.Material} Le matériau créé ou récupéré.
     */
    _getOrCreateMaterial(key, color, visualType, opacity = 0.5, lineThickness = 1.0) {
		if (!this.cachedMaterials[key]) {
			if (visualType === 'ground') {
				this.cachedMaterials[key] = new THREE.MeshBasicMaterial({
					color: color,
					transparent: true,
					opacity: opacity,
					side: THREE.DoubleSide,
					depthWrite: false // Important pour la transparence
				});
				// Le renderOrder sera défini lors de la création du mesh
			} else if (visualType === 'buildingOutline') { // Matériau OPAQUE pour les outlines
				 this.cachedMaterials[key] = new THREE.MeshBasicMaterial({
					 color: color,
					 transparent: false,
					 depthTest: true,
					 depthWrite: true
				 });
				 // Le renderOrder sera défini lors de la création du mesh
			 } else if (visualType === 'line') {
				if (this.sizes && lineThickness > 1) { // Ligne épaisse (LineMaterial)
					this.cachedMaterials[key] = new LineMaterial({
						color: color.getHex(),
						linewidth: lineThickness,
						resolution: new THREE.Vector2(this.sizes.width, this.sizes.height),
						dashed: false,
						depthTest: false // Lignes visibles par-dessus
					});
					this.cachedMaterials[key].renderOrder = this.renderOrders.debugLine;
				} else { // Ligne fine (LineBasicMaterial)
					this.cachedMaterials[key] = new LineBasicMaterial({
						color: color,
						depthTest: false // Lignes visibles par-dessus
					});
					this.cachedMaterials[key].renderOrder = this.renderOrders.debugLine;
				}
			} else {
				console.warn(`_getOrCreateMaterial: Unknown visualType '${visualType}' for key '${key}'. Creating default material.`);
				this.cachedMaterials[key] = new THREE.MeshBasicMaterial({ color: color });
			}
			this.cachedMaterials[key].name = `DebugMat_${key}`;
		}

		// Mise à jour résolution pour LineMaterial si nécessaire
		const mat = this.cachedMaterials[key];
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
        console.log("Disposing all cached debug materials...");
        Object.values(this.cachedMaterials).forEach(material => material.dispose());
        this.cachedMaterials = {};

        this.sharedGroundBoxGeometry?.dispose();
        this.sharedBuildingBoxGeometry?.dispose();

        console.log("Debug materials and shared geometries disposed.");
    }

	/**
     * MODIFIÉ : Crée les plans colorés pour le sol des parcelles, regroupés par type de zone.
     * @param {Array<Plot>} plots - Tableau de parcelles (plots).
     * @param {number} yPosition - Hauteur Y des plans.
     * @returns {object} Un objet où les clés sont les types de zone (ex: 'house', 'park')
     * et les valeurs sont les InstancedMesh correspondants.
     */
    createPlotGroundVisuals(plots, yPosition) {
        const visualType = 'PlotGroundVisuals'; // Garder pour identification éventuelle
        // this.clearDebugVisuals(visualType); // Le nettoyage est fait par World.js maintenant
        const plotGroundHeight = 0.01; // Hauteur fixe pour le sol debug
        const createdMeshesByType = {}; // { zoneType: InstancedMesh }
        const matricesByType = {}; // { zoneType: [Matrix4, ...] }

        plots.forEach(plot => {
            const zoneType = plot.zoneType || 'default';
            if (zoneType === 'unbuildable' || plot.width <= 0 || plot.depth <= 0) return;

            // Initialiser le tableau pour ce type si nécessaire
            if (!matricesByType[zoneType]) {
                matricesByType[zoneType] = [];
            }

            // Calculer la matrice
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3( plot.x + plot.width / 2, yPosition + plotGroundHeight / 2, plot.z + plot.depth / 2 );
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3(plot.width, plotGroundHeight, plot.depth);
            matrix.compose(position, quaternion, scale);

            matricesByType[zoneType].push(matrix);
        });

        // Créer un InstancedMesh par type de zone
        for (const zoneType in matricesByType) {
            const matrices = matricesByType[zoneType];
            if (matrices.length === 0) continue;

            const color = this.zoneColors[zoneType] || this.zoneColors.default;
            const materialKey = `plot_ground_${zoneType}`; // Clé basée sur le type
            const material = this._getOrCreateMaterial(materialKey, color, 'ground', this.plotGroundOpacity);
            material.renderOrder = this.renderOrders.plotGround; // Assigner renderOrder

            const instancedMesh = new THREE.InstancedMesh(this.sharedGroundBoxGeometry, material, matrices.length);
            instancedMesh.name = `PlotGrounds_${zoneType}`; // Nom basé sur le type
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.userData.visualType = visualType; // Garder pour référence
            instancedMesh.userData.subType = zoneType; // Stocker le sous-type

            createdMeshesByType[zoneType] = instancedMesh; // Stocker par type
        }
        console.log(`DebugVisualManager: Plot grounds created for types: ${Object.keys(createdMeshesByType).join(', ')}.`);
        return createdMeshesByType; // Retourner l'objet des meshes par type
    }

	/**
     * MODIFIÉ : Crée les plans colorés pour le sol des districts, regroupés par type de district.
     * @param {Array<District>} districts - Tableau de districts.
     * @param {number} yPosition - Hauteur Y des plans.
     * @returns {object} Un objet où les clés sont les types de district (ex: 'residential')
     * et les valeurs sont les InstancedMesh correspondants.
     */
    createDistrictGroundVisuals(districts, yPosition) {
        const visualType = 'DistrictGroundVisuals';
        const districtGroundHeight = 0.005; // Hauteur fixe
        const createdMeshesByType = {}; // { districtType: InstancedMesh }
        const matricesByType = {}; // { districtType: [Matrix4, ...] }

        districts.forEach(district => {
            const districtType = district.type || 'default';
            if (!district.plots || district.plots.length === 0) return;
            const bounds = district.bounds; if (!bounds || bounds.isEmpty()) return;
            const size = new THREE.Vector3(); bounds.getSize(size);
            const center = new THREE.Vector3(); bounds.getCenter(center);
            if (size.x <= 0 || size.z <= 0) return;

            if (!matricesByType[districtType]) {
                 matricesByType[districtType] = [];
            }

            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3( center.x, yPosition + districtGroundHeight / 2, center.z );
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3(size.x, districtGroundHeight, size.z);
            matrix.compose(position, quaternion, scale);

            matricesByType[districtType].push(matrix);
        });

        for (const districtType in matricesByType) {
            const matrices = matricesByType[districtType];
            if (matrices.length === 0) continue;

            const color = this.zoneColors[districtType] || this.zoneColors.default; // Utilise les mêmes couleurs que les plots
            const materialKey = `district_ground_${districtType}`;
            const material = this._getOrCreateMaterial(materialKey, color, 'ground', this.districtGroundOpacity);
            material.renderOrder = this.renderOrders.districtGround;

            const instancedMesh = new THREE.InstancedMesh(this.sharedGroundBoxGeometry, material, matrices.length);
            instancedMesh.name = `DistrictGrounds_${districtType}`;
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.userData.visualType = visualType;
            instancedMesh.userData.subType = districtType; // Stocker le sous-type

            createdMeshesByType[districtType] = instancedMesh;
        }
         console.log(`DebugVisualManager: District grounds created for types: ${Object.keys(createdMeshesByType).join(', ')}.`);
        return createdMeshesByType;
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
     * MODIFIÉ : Crée les outlines (boîtes OPAQUES) pour les bâtiments, regroupés par type de bâtiment.
     * @param {Map<string, object>} buildingInstancesMap - Map des instances de bâtiments.
     * @param {object} config - Configuration globale (utilisée via this.config).
     * @param {number} yOffset - Décalage vertical de base pour les outlines.
     * @returns {object} Un objet où les clés sont les types de bâtiment (ex: 'house', 'skyscraper')
     * et les valeurs sont les InstancedMesh correspondants.
     */
    createBuildingOutlines(buildingInstancesMap, config, yOffset = 0.05) {
        const visualType = 'BuildingOutlines';
        const createdMeshesByType = {}; // { buildingType: InstancedMesh }
        const matricesByType = {}; // { buildingType: [Matrix4, ...] }

        buildingInstancesMap.forEach(buildingInfo => {
            const buildingType = buildingInfo.type || 'default'; // 'house', 'building', 'industrial', 'skyscraper'
            const position = buildingInfo.position;
            let baseW = 5, baseH = 5, baseD = 5;
            let scaleFactor = 1.0;
            let isValidType = true;
            let specificDebugScaleReduction = 0.7;
            const debugConfig = this.config.debug || {};

            // Récupérer dimensions et scale depuis this.config
            switch(buildingType) {
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
                 default: isValidType = false; break; // Ignore 'park', 'tree', 'unbuildable', etc.
            }
            if (!isValidType) return;

            const targetWidth = baseW * scaleFactor;
            const targetHeight = baseH * scaleFactor;
            const targetDepth = baseD * scaleFactor;
            if (!isFinite(targetWidth) || !isFinite(targetHeight) || !isFinite(targetDepth) || targetWidth <= 0 || targetHeight <= 0 || targetDepth <= 0) return;
            const finalDebugWidth = targetWidth * specificDebugScaleReduction;
            const finalDebugHeight = targetHeight * specificDebugScaleReduction;
            const finalDebugDepth = targetDepth * specificDebugScaleReduction;

            if (!matricesByType[buildingType]) {
                 matricesByType[buildingType] = [];
            }

            const matrix = new THREE.Matrix4();
            const finalPosition = new THREE.Vector3(position.x, finalDebugHeight / 2 + yOffset, position.z);
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3(finalDebugWidth, finalDebugHeight, finalDebugDepth);
            if (!isFinite(finalPosition.x) || !isFinite(finalPosition.y) || !isFinite(finalPosition.z)) return;
            matrix.compose(finalPosition, quaternion, scale);

            matricesByType[buildingType].push(matrix);
        });

        for (const buildingType in matricesByType) {
            const matrices = matricesByType[buildingType];
            if (matrices.length === 0) continue;

            const color = this.buildingColors[buildingType] || this.buildingColors.default;
            const materialKey = `building_outline_${buildingType}`; // Clé par type
            const material = this._getOrCreateMaterial(materialKey, color, 'buildingOutline'); // Opaque
            material.renderOrder = this.renderOrders.buildingOutline; // Assigner renderOrder

            const instancedMesh = new THREE.InstancedMesh(this.sharedBuildingBoxGeometry, material, matrices.length);
            instancedMesh.name = `BuildingOutlines_${buildingType}`; // Nom par type
            matrices.forEach((mat, index) => { instancedMesh.setMatrixAt(index, mat); });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.userData.visualType = visualType;
            instancedMesh.userData.subType = buildingType; // Stocker le sous-type

            createdMeshesByType[buildingType] = instancedMesh;
        }
        console.log(`DebugVisualManager: Building outlines created for types: ${Object.keys(createdMeshesByType).join(', ')}.`);
        return createdMeshesByType;
    }

    // Les méthodes createParkOutlines et createDistrictBoundaries restent inchangées
    // ... (coller le code existant de ces méthodes ici) ...
    createParkOutlines(plots, debugHeight = 0.15) {
        const visualType = 'ParkOutlines'; // Peut-être renommer en PlotOutlines_Park
        const parkGeometries = [];

        plots.forEach(plot => {
             if (plot.zoneType === 'park') {
                 const points = [ /* ... points du contour ... */
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
                 const color = this.zoneColors.park || this.zoneColors.default;
                 const material = this._getOrCreateMaterial('park_outline', color, 'line', 0, 2.0); // Épaisseur 2.0
                 const line = new THREE.LineSegments(mergedGeometry, material); // Utiliser LineSegments pour lignes fines/épaisses
                 line.name = `PlotOutlines_Park_Merged`;
                 line.userData.visualType = visualType; // Pour identification
                 // Retourner 'line' pour que World.js l'ajoute au bon groupe
                 // this.addDebugVisual(line, visualType); // Ne pas ajouter ici
                 parkGeometries.forEach(g => g.dispose()); // Nettoyer après fusion
                 return line; // Retourner l'objet ligne
             } else {
                 console.warn("Failed to merge park outline geometries.");
                 parkGeometries.forEach(g => g.dispose()); // Nettoyer même si échec
                 return null;
             }
        }
        return null; // Pas de parc
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