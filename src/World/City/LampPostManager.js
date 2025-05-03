// src/World/LampPostManager.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class LampPostManager {
    /**
     * Constructeur du LampPostManager.
     * @param {object} config - La configuration globale (incluant sidewalkHeight, lampPostLightConeRadiusBottom, etc.).
     * @param {object} materials - Les matériaux utilisés (notamment lampLightConeMaterial).
     * @param {THREE.Group} cityContainer - Le groupe de la scène auquel les lampadaires seront ajoutés.
     */
    constructor(config, materials, cityContainer) {
        this.config = config;
        this.materials = materials;
        this.cityContainer = cityContainer;

        // Propriétés pour stocker la géométrie du cône et les instanced meshes des lampadaires.
        this.lampPostConeGeometry = null;
        this.lampPostMeshes = {
            grey: null,
            light: null,
            lightCone: null
        };
    }

    /**
     * Construit les géométries et matériaux nécessaires aux lampadaires.
     * Cette méthode regroupe la logique pour créer la partie grise, la partie lumineuse
     * et le cône lumineux.
     * @returns {object} Un objet contenant greyGeometry, lightGeometry, greyMaterial et lightMaterial.
     */
    buildLampPostGeometries() {
        console.warn("--- UTILISATION GÉOMÉTRIE LAMPADAIRE SIMPLIFIÉE (SANS COURBE) ---");
        const poleSegments = 4;
        const baseRadiusTop = 0.2;
        const baseRadiusBottom = 0.25;
        const baseHeight = 0.6;
        const poleRadius = 0.1;
        const poleLowerHeight = 5;
        const poleTopY = baseHeight + poleLowerHeight;
        const armLength = 2.5;
        const lampHeadWidth = 0.9;
        const lampHeadHeight = 0.3;
        const lampHeadDepth = 0.45;
        const lightSourceWidth = lampHeadWidth * 0.8;
        const lightSourceHeight = 0.25;
        const lightSourceDepth = lampHeadDepth * 0.8;
        const lightSourceCenterY = poleTopY - lampHeadHeight - lightSourceHeight / 2;
        // Utilisation de la hauteur du trottoir depuis la config (avec valeur par défaut)
        const sidewalkH = this.config.sidewalkHeight || 0.2;
        const coneHeight = lightSourceCenterY - (this.config.sidewalkHeight ?? 0.2) + 1;
        const coneRadiusBottom = this.config.lampPostLightConeRadiusBottom ?? 5.0;
        const coneRadiusTop = 0.1; // Petit rayon en haut du cône
        const coneRadialSegments = 16;

        if (coneHeight > 0) {
            this.lampPostConeGeometry = new THREE.ConeGeometry(
                coneRadiusBottom,
                coneHeight,
                coneRadialSegments,
                1,
                true
            );
            // Centre verticalement le cône
            this.lampPostConeGeometry.translate(0, coneHeight / 2 - 2.5, 0);
            this.lampPostConeGeometry.computeBoundingBox();
            console.log(`Géométrie du cône lumière créée (H: ${coneHeight.toFixed(1)}, R_bas: ${coneRadiusBottom})`);
        } else {
            console.error("Hauteur du cône calculée négative ou nulle. Impossible de créer la géométrie du cône.");
            this.lampPostConeGeometry = null;
        }

        // Création des différentes parties du lampadaire
        const baseGeo = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, baseHeight, poleSegments);
        baseGeo.translate(0, baseHeight / 2, 0);
        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleLowerHeight, poleSegments);
        poleGeo.translate(0, baseHeight + poleLowerHeight / 2, 0);
        const armGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, armLength, poleSegments);
        armGeo.rotateZ(Math.PI / 2);
        armGeo.translate(armLength / 2, poleTopY, 0);
        const lampHeadGeo = new THREE.BoxGeometry(lampHeadWidth, lampHeadHeight, lampHeadDepth);
        lampHeadGeo.translate(armLength, poleTopY - lampHeadHeight / 2, 0);
        const lightGeo = new THREE.BoxGeometry(lightSourceWidth, lightSourceHeight, lightSourceDepth);
        lightGeo.translate(armLength, lightSourceCenterY, 0);
        lightGeo.computeBoundingBox();

        const greyGeos = [baseGeo, poleGeo, armGeo, lampHeadGeo];
        const mergedGreyGeo = mergeGeometries(greyGeos, false);
        if (!mergedGreyGeo) {
            console.error("Échec critique de la fusion des géométries du lampadaire (parties grises).");
            greyGeos.forEach(g => g.dispose());
            lightGeo.dispose();
            return { greyGeometry: null, lightGeometry: null, greyMaterial: null, lightMaterial: null };
        }
        mergedGreyGeo.computeBoundingBox();
        greyGeos.forEach(g => g.dispose());

        const greyMaterial = new THREE.MeshStandardMaterial({
            color: 0x606060,
            roughness: 0.6,
            metalness: 0.9,
            name: "LampPostGreyMat_Simplified"
        });
        const lightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffaa,
            emissive: 0xffffdd,
            emissiveIntensity: 0.0,
            name: "LampPostLightMat_Simplified"
        });

        return {
            greyGeometry: mergedGreyGeo,
            lightGeometry: lightGeo,
            greyMaterial,
            lightMaterial
        };
    }

    /**
     * Parcourt un ensemble de parcelles (leafPlots) et génère la position et l'orientation
     * de chaque lampadaire à placer autour des parcelles constructibles.
     * @param {Array} leafPlots - Tableau des parcelles (plots).
     */
    addLampPosts(leafPlots) {
        const spacing = this.config.lampPostSpacing || 20;
        const lampData = [];
        const sidewalkH = this.config.sidewalkHeight || 0.2;
        console.log(`Ajout des lampadaires avec espacement ${spacing} et orientation corrigée...`);

        const positionMap = new Map();
        const addLampData = (x, z, angleY) => {
            const key = `${x.toFixed(1)},${z.toFixed(1)}`;
            if (!positionMap.has(key)) {
                positionMap.set(key, angleY);
                lampData.push({
                    position: new THREE.Vector3(x, sidewalkH, z),
                    angleY: Math.atan2(Math.sin(angleY), Math.cos(angleY))
                });
            }
        };

        leafPlots.forEach(plot => {
            if (plot.zoneType === 'park' || plot.zoneType === 'unbuildable') return;
            const plotX = plot.x;
            const plotZ = plot.z;
            const plotW = plot.width;
            const plotD = plot.depth;
            const sidewalkOffset = (this.config.sidewalkWidth || 0) / 2;
            // Bord supérieur
            const angleTop = Math.PI / 2;
            for (let x = plotX; x <= plotX + plotW; x += spacing) {
                addLampData(x, plotZ - sidewalkOffset, angleTop);
            }
            // Bord inférieur
            const angleBottom = -Math.PI / 2;
            for (let x = plotX; x <= plotX + plotW; x += spacing) {
                addLampData(x, plotZ + plotD + sidewalkOffset, angleBottom);
            }
            // Bord gauche
            const angleLeft = Math.PI;
            for (let z = plotZ + spacing / 2; z < plotZ + plotD; z += spacing) {
                addLampData(plotX - sidewalkOffset, z, angleLeft);
            }
            // Bord droit
            const angleRight = Math.PI * 2;
            for (let z = plotZ + spacing / 2; z < plotZ + plotD; z += spacing) {
                addLampData(plotX + plotW + sidewalkOffset, z, angleRight);
            }
        });

        if (lampData.length === 0) {
            console.log("Aucune position de lampadaire générée.");
            return;
        }
        console.log(`${lampData.length} lampadaires uniques à créer.`);
        this.createLampPostInstancedMeshes(lampData);
    }

    /**
     * À partir des données de position/rotation issues de addLampPosts(),
     * crée les instanced meshes pour les parties grises, lumineuses et les cônes lumineux.
     * @param {Array} lampData - Tableau d'objets contenant position (Vector3) et angleY.
     */
    createLampPostInstancedMeshes(lampData) {
        const { greyGeometry, lightGeometry, greyMaterial, lightMaterial } = this.buildLampPostGeometries();
        // Récupération du matériau pour le cône à partir des matériaux fournis
        const coneGeometry = this.lampPostConeGeometry;
        const coneMaterial = this.materials.lampLightConeMaterial;

        if (!greyGeometry || !lightGeometry || !greyGeometry.boundingBox || !lightGeometry.boundingBox) {
            console.error("Échec création InstancedMesh : géométries invalides ou boundingBox manquante.");
            return;
        }
        const count = lampData.length;
        if (count === 0) return;
        console.log(`Création des InstancedMesh pour ${count} lampadaires...`);

        const greyInstancedMesh = new THREE.InstancedMesh(greyGeometry, greyMaterial, count);
        greyInstancedMesh.name = "LampPosts_GreyParts_Instanced";
        const lightInstancedMesh = new THREE.InstancedMesh(lightGeometry, lightMaterial, count);
        lightInstancedMesh.name = "LampPosts_LightParts_Instanced";

        let coneInstancedMesh = null;
        let coneHeight = 0;
        if (coneGeometry && coneMaterial) {
            coneInstancedMesh = new THREE.InstancedMesh(coneGeometry, coneMaterial, count);
            coneInstancedMesh.name = "LampPosts_LightCones_Instanced";
            coneInstancedMesh.visible = false;
            coneHeight = coneGeometry.parameters.height;
            if (!coneGeometry.boundingBox) coneGeometry.computeBoundingBox();
        }

        const dummy = new THREE.Object3D();
        const coneMatrix = new THREE.Matrix4();
        const armLength = 2.5;
        const baseHeight = 0.8;
        const poleLowerHeight = 5;
        const lampHeadHeight = 0.4;
        const lightSourceHeight = 0.35;
        const poleTopY = baseHeight + poleLowerHeight;
        const calculatedLightSourceCenterY = poleTopY - lampHeadHeight - lightSourceHeight / 2;
        const lampRotation = new THREE.Quaternion();
        const coneUpVector = new THREE.Vector3(0, 1, 0);
        const positionOffset = new THREE.Vector3();
        const coneScale = new THREE.Vector3(1, 1, 1);

        for (let i = 0; i < count; i++) {
            const data = lampData[i];
            dummy.position.copy(data.position);
            dummy.rotation.set(0, data.angleY, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            greyInstancedMesh.setMatrixAt(i, dummy.matrix);
            lightInstancedMesh.setMatrixAt(i, dummy.matrix);
            if (coneInstancedMesh && coneHeight > 0) {
                const localBulbPos = new THREE.Vector3(armLength, calculatedLightSourceCenterY, 0);
                const worldBulbPos = localBulbPos.applyMatrix4(dummy.matrix);
                lampRotation.setFromRotationMatrix(dummy.matrix);
                positionOffset.copy(coneUpVector).applyQuaternion(lampRotation).multiplyScalar(-coneHeight / 2);
                const coneCenterPos = worldBulbPos.clone().add(positionOffset);
                coneMatrix.compose(coneCenterPos, lampRotation, coneScale);
                coneInstancedMesh.setMatrixAt(i, coneMatrix);
            }
        }

        greyInstancedMesh.instanceMatrix.needsUpdate = true;
        lightInstancedMesh.instanceMatrix.needsUpdate = true;
        if (coneInstancedMesh) coneInstancedMesh.instanceMatrix.needsUpdate = true;

        greyInstancedMesh.castShadow = true;
        greyInstancedMesh.receiveShadow = true;
        lightInstancedMesh.castShadow = false;
        lightInstancedMesh.receiveShadow = false;
        if (coneInstancedMesh) {
            coneInstancedMesh.castShadow = false;
            coneInstancedMesh.receiveShadow = false;
        }

        if (this.cityContainer) {
            this.cityContainer.add(greyInstancedMesh);
            this.cityContainer.add(lightInstancedMesh);
            if (coneInstancedMesh) {
                this.cityContainer.add(coneInstancedMesh);
            }
            console.log("InstancedMesh des lampadaires ajoutés au container.");
        }

        this.lampPostMeshes.grey = greyInstancedMesh;
        this.lampPostMeshes.light = lightInstancedMesh;
        this.lampPostMeshes.lightCone = coneInstancedMesh;
    }

    /**
     * Met à jour l'intensité lumineuse et la visibilité des cônes lumineux
     * en fonction de l'heure (ex. lampes allumées la nuit).
     * @param {number} currentHour - L'heure actuelle (de 0 à 23).
     */
    updateLampPostLights(currentHour) {
        if (!this.lampPostMeshes || (!this.lampPostMeshes.light && !this.lampPostMeshes.lightCone)) {
            return;
        }
        const lightsOn = (currentHour >= 18 || currentHour < 6);
        const lightMesh = this.lampPostMeshes.light;
        if (lightMesh && lightMesh.material) {
            const targetIntensity = lightsOn ? 1.8 : 0.0;
            if (lightMesh.material.emissiveIntensity !== targetIntensity) {
                lightMesh.material.emissiveIntensity = targetIntensity;
            }
        }
        const coneMesh = this.lampPostMeshes.lightCone;
        if (coneMesh) {
            if (coneMesh.visible !== lightsOn) {
                coneMesh.visible = lightsOn;
            }
        }
    }
}
