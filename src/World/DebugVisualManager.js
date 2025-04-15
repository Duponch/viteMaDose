// src/World/DebugVisualManager.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'; // Pour fusion éventuelle

/**
 * DebugVisualManager centralise la création et le nettoyage des visuels de debug.
 */
export default class DebugVisualManager {
    /**
     * Constructeur.
     * @param {THREE.Group} [parentGroup] - Le groupe auquel ajouter les visuels de debug.
     * @param {object} materials - Un objet contenant les matériaux à utiliser.
     */
    constructor(parentGroup = null, materials = {}) {
        this.parentGroup = parentGroup || new THREE.Group();
        this.parentGroup.name = "DebugVisuals";
        this.materials = materials; // Matériaux existants
        this.debugMaterials = {}; // Pour stocker les matériaux de debug créés

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
    _getOrCreateDebugMaterial(key, color, isWireframe = false) {
        if (!this.debugMaterials[key]) {
            if (isWireframe) {
                this.debugMaterials[key] = new THREE.MeshBasicMaterial({
                    color: color,
                    wireframe: true,
                    depthTest: false, // Pour voir à travers d'autres objets
                    transparent: true,
                    opacity: 0.7
                });
            } else {
                this.debugMaterials[key] = new THREE.LineBasicMaterial({
                    color: color,
                    linewidth: 2, // Note: peut ne pas fonctionner sur tous les GPU
                    depthTest: false // Pour voir à travers d'autres objets
                });
            }
            this.debugMaterials[key].name = `DebugMat_${key}`;
            this.debugMaterials[key].renderOrder = 999; // Dessiner par-dessus
        }
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
    createPlotOutlines(plots, debugHeight = 0.1) {
        const visualType = 'PlotOutlines';
        this.clearDebugVisuals(visualType); // Nettoyer les anciennes outlines
        let plotCount = 0;

        const geometriesByType = {}; // Pour fusionner par couleur

        plots.forEach(plot => {
            const color = this.plotColors[plot.zoneType] || this.plotColors.default;
            const colorHex = color.getHexString(); // Utiliser hex comme clé

            // Définir les 4 coins du carré au sol
            const points = [
                new THREE.Vector3(plot.x, debugHeight, plot.z),
                new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z),
                new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z + plot.depth),
                new THREE.Vector3(plot.x, debugHeight, plot.z + plot.depth),
                new THREE.Vector3(plot.x, debugHeight, plot.z) // Fermer la boucle
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            if (!geometriesByType[colorHex]) {
                geometriesByType[colorHex] = [];
            }
            geometriesByType[colorHex].push(geometry);
            plotCount++;
        });

        // Créer un LineSegments fusionné par couleur
        for (const colorHex in geometriesByType) {
            if (geometriesByType[colorHex].length > 0) {
                const mergedGeometry = mergeGeometries(geometriesByType[colorHex], false);
                if (mergedGeometry) {
                    const material = this._getOrCreateDebugMaterial(`plot_${colorHex}`, new THREE.Color(`#${colorHex}`), false);
                    const lines = new THREE.LineSegments(mergedGeometry, material); // Utiliser LineSegments
                    lines.name = `PlotOutlines_${colorHex}`;
                    this.addDebugVisual(lines, visualType);
                } else {
                     console.warn(`Failed to merge plot outline geometries for color #${colorHex}`);
                }
                // Nettoyer les géométries individuelles après la fusion
                geometriesByType[colorHex].forEach(g => g.dispose());
            }
        }


        if (plotCount > 0) {
            console.log(`DebugVisualManager: ${Object.keys(geometriesByType).length} plot outline mesh(es) created for ${plotCount} plots.`);
        }
    }

    // --- NOUVELLE MÉTHODE : Créer les outlines des bâtiments ---
    /**
     * Crée les outlines (boîtes filaires) pour visualiser les bâtiments enregistrés.
     * @param {Map<string, object>} buildingInstancesMap - Map des instances de bâtiments (de CitizenManager).
     * @param {object} config - La configuration pour obtenir les tailles de base.
     */
    createBuildingOutlines(buildingInstancesMap, config) {
        const visualType = 'BuildingOutlines';
        this.clearDebugVisuals(visualType); // Nettoyer les anciennes outlines
        let buildingCount = 0;

        // Préparer les géométries de base pour chaque type (pour éviter recréation)
        const baseGeometries = {};
        const getBaseGeom = (type) => {
            if (!baseGeometries[type]) {
                let w = 5, h = 5, d = 5; // Taille par défaut
                switch(type) {
                    case 'house':       w = config.houseBaseWidth * 0.8; h = config.houseBaseHeight * 0.8; d = config.houseBaseDepth * 0.8; break;
                    case 'building':    w = config.buildingBaseWidth * 0.7; h = config.buildingBaseHeight * 0.7; d = config.buildingBaseDepth * 0.7; break;
                    case 'industrial':  w = config.industrialBaseWidth * 0.6; h = config.industrialBaseHeight * 0.6; d = config.industrialBaseDepth * 0.6; break;
                    case 'skyscraper':  w = config.skyscraperBaseWidth * 0.6; h = config.skyscraperBaseHeight * 0.6; d = config.skyscraperBaseDepth * 0.6; break;
                    // Pas d'outline pour 'park' ou 'tree' pour l'instant
                    default: return null;
                }
                baseGeometries[type] = new THREE.BoxGeometry(w, h, d);
            }
            return baseGeometries[type];
        };

        const matricesByTypeColor = {}; // Structure: { 'colorHex': { type: 'house', matrices: [] }, ... }

        buildingInstancesMap.forEach(buildingInfo => {
            const geom = getBaseGeom(buildingInfo.type);
            if (!geom) return; // Ne pas visualiser ce type

            const color = this.buildingColors[buildingInfo.type] || this.buildingColors.default;
            const colorHex = color.getHexString();

            // Calculer la matrice de transformation
            const matrix = new THREE.Matrix4();
            const position = buildingInfo.position.clone();
            position.y = geom.parameters.height / 2 + 0.05; // Placer la base de la boîte au sol
            const quaternion = new THREE.Quaternion(); // Pas de rotation pour les boîtes de debug
            const scale = new THREE.Vector3(1, 1, 1); // Utiliser la taille de la géométrie de base
            matrix.compose(position, quaternion, scale);

            // Stocker la matrice par couleur
            if (!matricesByTypeColor[colorHex]) {
                matricesByTypeColor[colorHex] = { type: buildingInfo.type, matrices: [] };
            }
            matricesByTypeColor[colorHex].matrices.push(matrix);
            buildingCount++;
        });

         // Créer un InstancedMesh par type/couleur
         for (const colorHex in matricesByTypeColor) {
             const data = matricesByTypeColor[colorHex];
             const baseGeom = getBaseGeom(data.type);
             const matrices = data.matrices;

             if (baseGeom && matrices.length > 0) {
                 const material = this._getOrCreateDebugMaterial(`building_${colorHex}`, new THREE.Color(`#${colorHex}`), true); // Wireframe
                 const instancedMesh = new THREE.InstancedMesh(baseGeom, material, matrices.length);

                 matrices.forEach((mat, index) => {
                     instancedMesh.setMatrixAt(index, mat);
                 });
                 instancedMesh.instanceMatrix.needsUpdate = true;
                 instancedMesh.name = `BuildingOutlines_${data.type}_${colorHex}`;
                 this.addDebugVisual(instancedMesh, visualType);
             }
         }

         // Nettoyer les géométries de base créées
         Object.values(baseGeometries).forEach(g => g.dispose());


        if (buildingCount > 0) {
            console.log(`DebugVisualManager: ${Object.keys(matricesByTypeColor).length} building outline mesh(es) created for ${buildingCount} buildings.`);
        }
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