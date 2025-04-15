// src/World/DebugVisualManager.js
import * as THREE from 'three';

/**
 * DebugVisualManager centralise la création et le nettoyage des visuels de debug.
 * Il permet d'ajouter des objets de debug (par exemple, outlines, plans, helpers)
 * dans un groupe de scène dédié, sans mélanger la logique de génération de la ville.
 */
export default class DebugVisualManager {
    /**
     * Constructeur.
     * @param {THREE.Group} [parentGroup] - Le groupe auquel ajouter les visuels de debug.
     *                                       S'il n'est pas fourni, un groupe sera créé.
     * @param {object} materials - Un objet contenant les matériaux à utiliser (ex. debugParkOutlineMaterial).
     */
    constructor(parentGroup = null, materials = {}) {
        this.parentGroup = parentGroup || new THREE.Group();
        this.parentGroup.name = "DebugVisuals";
        this.materials = materials;
    }

    /**
     * Ajoute un objet de debug au groupe parent.
     * @param {THREE.Object3D} object3D - L'objet de debug à ajouter.
     */
    addDebugVisual(object3D) {
        this.parentGroup.add(object3D);
    }

    /**
     * Supprime du groupe parent tous les objets de debug.
     * Si un type de visuel est spécifié (via la propriété userData.visualType),
     * seuls les objets correspondant à ce type seront supprimés.
     * @param {string|null} visualType - (Optionnel) Type de visuel à nettoyer.
     */
    clearDebugVisuals(visualType = null) {
        const objectsToRemove = [];
        for (let i = this.parentGroup.children.length - 1; i >= 0; i--) {
            const child = this.parentGroup.children[i];
            if (!visualType || (child.userData && child.userData.visualType === visualType)) {
                objectsToRemove.push(child);
            }
        }
        objectsToRemove.forEach(child => {
            this.parentGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            // Si le matériau est spécifique et non partagé, il peut être nettoyé ici.
        });
    }

    /**
     * Crée les outlines pour visualiser les parcs.
     * Pour chaque plot dont le zoneType est 'park', dessine un contour sous forme de ligne.
     * @param {Array} plots - Tableau de parcelles (plots).
     * @param {number} [debugHeight=15.0] - Hauteur (Y) à utiliser pour les outlines.
     */
    createParkOutlines(plots, debugHeight = 15.0) {
        const visualType = 'ParkOutlines';
        this.clearDebugVisuals(visualType);
        let parkCount = 0;
        plots.forEach(plot => {
            if (plot.zoneType === 'park') {
                parkCount++;
                const points = [
                    new THREE.Vector3(plot.x, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z),
                    new THREE.Vector3(plot.x + plot.width, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z + plot.depth),
                    new THREE.Vector3(plot.x, debugHeight, plot.z) // Fermeture de l'outline
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                // Utiliser le matériau de debug pour park fourni dans materials
                const material = this.materials.debugParkOutlineMaterial || new THREE.LineBasicMaterial({
                    color: 0x00ff00,
                    linewidth: 2,
                    depthTest: false
                });
                const line = new THREE.Line(geometry, material);
                line.name = `ParkOutline_Plot_${plot.id}`;
                line.userData.visualType = visualType;
                line.renderOrder = 999; // Assurer que le visual se dessine par-dessus d'autres objets
                this.parentGroup.add(line);
            }
        });
        console.log(`DebugVisualManager: ${parkCount} park outlines created.`);
    }

    /**
     * Exemple : Peut être étendu pour créer des outlines ou helper pour des districts.
     * Ici, pour chaque district, on crée un plan de debug indiquant ses limites.
     * @param {Array} districts - Tableau d'objets district (supposant une propriété bounds et center).
     */
    createDistrictBoundaries(districts) {
        const visualType = 'DistrictBoundaries';
        this.clearDebugVisuals(visualType);
        districts.forEach(district => {
            if (!district.plots || district.plots.length === 0) return;
            // Récupère la bounding box via district.bounds (on suppose que c'est un THREE.Box3)
            const bounds = district.bounds;
            const size = new THREE.Vector3();
            bounds.getSize(size);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            if (size.x <= 0 || size.z <= 0) return;
            const planeGeom = new THREE.PlaneGeometry(size.x, size.z);
            // Choix du matériau en fonction du type (exemple simple ici)
            let material;
            switch (district.type) {
                case 'residential':
                    material = new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
                    break;
                case 'industrial':
                    material = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
                    break;
                case 'business':
                    material = new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
                    break;
                default:
                    material = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
                    break;
            }
            const planeMesh = new THREE.Mesh(planeGeom, material);
            planeMesh.position.set(center.x, 0.15, center.z);
            planeMesh.rotation.x = -Math.PI / 2;
            planeMesh.name = `District_${district.id}_${district.type}_DebugPlane`;
            planeMesh.userData.visualType = visualType;
            planeMesh.renderOrder = 998;
            this.parentGroup.add(planeMesh);
        });
        console.log("DebugVisualManager: District boundaries created.");
    }
}
