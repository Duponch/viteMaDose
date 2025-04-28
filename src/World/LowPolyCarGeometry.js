// src/World/LowPolyCarGeometry.js
import * as THREE from 'three';
// Import direct ES module, compatible Vite
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Crée les géométries fusionnées et matériaux pour chaque partie du modèle low-poly.
 * Retourne un objet { body, windows, wheels, metal, lights, rearLights } pour instancing par matériau.
 */
export function createLowPolyCarGeometry(options = {}) {
    // Couleurs principales (personnalisables)
    const bodyColor = options.bodyColor || 0xffff00;
    const windowColor = options.windowColor || 0x6699cc;
    const wheelColor = options.wheelColor || 0x333333;
    const hubcapColor = options.hubcapColor || 0xcccccc;
    const metalColor = options.metalColor || 0xaaaaaa;
    const lightColor = options.lightColor || 0xffffff;
    const rearLightColor = options.rearLightColor || 0xff0000;

    // Matériaux
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8, roughness: 0.4 });
    const windowMaterial = new THREE.MeshPhongMaterial({ color: windowColor, transparent: true, opacity: 0.7 });
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: wheelColor, metalness: 0.1, roughness: 0.9 });
    const hubcapMaterial = new THREE.MeshStandardMaterial({ color: hubcapColor, metalness: 0.9, roughness: 0.2 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: metalColor, metalness: 1.0, roughness: 0.3 });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: lightColor, emissive: lightColor, emissiveIntensity: 0.6 });
    const rearLightMaterial = new THREE.MeshStandardMaterial({ color: rearLightColor, emissive: rearLightColor, emissiveIntensity: 0.6 });

    // --- Géométries par groupe ---
    const matrix = new THREE.Matrix4();
    // Carrosserie (corps + toit)
    const bodyGeoms = [];
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4);
    matrix.identity();
    matrix.setPosition(0, 0.8/2 + 0.2, 0);
    bodyGeometry.applyMatrix4(matrix);
    bodyGeoms.push(bodyGeometry);
    const roofGeometry = new THREE.BoxGeometry(2 * 0.95, 0.6, 4 * 0.6);
    matrix.identity();
    matrix.setPosition(0, 0.8 + 0.6/2 - 0.1 + 0.2, -4 * 0.1);
    roofGeometry.applyMatrix4(matrix);
    bodyGeoms.push(roofGeometry);
    // Pare-chocs
    const bumperGeometry = new THREE.BoxGeometry(2 * 1.05, 0.15, 0.1);
    matrix.identity();
    matrix.setPosition(0, 0.15/2 + 0.2, 4/2 + 0.05);
    bumperGeometry.applyMatrix4(matrix);
    bodyGeoms.push(bumperGeometry);
    const rearBumperGeometry = bumperGeometry.clone();
    rearBumperGeometry.translate(0, 0, -4 - 0.1);
    bodyGeoms.push(rearBumperGeometry);
    // Grille
    const grilleGeometry = new THREE.BoxGeometry(2 * 0.6, 0.8 * 0.3, 0.05);
    matrix.identity();
    matrix.setPosition(0, 0.8 * 0.3 / 2 + 0.1 + 0.2, 4/2 + 0.01);
    grilleGeometry.applyMatrix4(matrix);
    bodyGeoms.push(grilleGeometry);

    // Vitres
    const windowGeoms = [];
    const windowSideHeight = 0.6 * 0.7;
    const windowSideLength = 4 * 0.55;
    const windowFrontBackWidth = 2 * 0.85;
    const windowFrontBackHeight = 0.6 * 0.7;
    const windowYPos = 0.8 + 0.6/2 - 0.1 + 0.2;
    // Avant
    const frontWindowGeom = new THREE.BoxGeometry(windowFrontBackWidth, windowFrontBackHeight, 0.1);
    matrix.identity();
    matrix.setPosition(0, windowYPos, 4 * 0.2);
    frontWindowGeom.applyMatrix4(matrix);
    windowGeoms.push(frontWindowGeom);
    // Arrière
    const backWindowGeom = new THREE.BoxGeometry(windowFrontBackWidth, windowFrontBackHeight, 0.1);
    matrix.identity();
    matrix.setPosition(0, windowYPos, -4 * 0.4);
    backWindowGeom.applyMatrix4(matrix);
    windowGeoms.push(backWindowGeom);
    // Côtés
    const sideWindowGeom = new THREE.BoxGeometry(0.1, windowSideHeight, windowSideLength);
    // Gauche
    const sideWindowLeft = sideWindowGeom.clone();
    matrix.identity();
    matrix.setPosition(-2/2 + 0.01, windowYPos, 0);
    sideWindowLeft.applyMatrix4(matrix);
    windowGeoms.push(sideWindowLeft);
    // Droite
    const sideWindowRight = sideWindowGeom.clone();
    matrix.identity();
    matrix.setPosition(2/2 - 0.01, windowYPos, 0);
    sideWindowRight.applyMatrix4(matrix);
    windowGeoms.push(sideWindowRight);

    // Roues
    const wheelGeoms = [];
    const wheelRadius = 0.4;
    const wheelThickness = 0.2;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelY = wheelRadius * 0.8;
    const wheelZOffset = 4 / 2 - wheelRadius * 1.2;
    const wheelXOffset = 2 / 2 - wheelThickness / 3;
    const wheelPositions = [
        [wheelXOffset, wheelY, wheelZOffset],
        [-wheelXOffset, wheelY, wheelZOffset],
        [wheelXOffset, wheelY, -wheelZOffset],
        [-wheelXOffset, wheelY, -wheelZOffset]
    ];
    for (const pos of wheelPositions) {
        const w = wheelGeometry.clone();
        w.translate(pos[0], pos[1], pos[2]);
        wheelGeoms.push(w);
    }
    // Enjoliveurs (hubcaps)
    const hubcapGeoms = [];
    const hubcapRadius = wheelRadius * 0.5;
    const hubcapThickness = wheelThickness * 1.2;
    const hubcapGeometry = new THREE.CylinderGeometry(hubcapRadius, hubcapRadius, hubcapThickness, 12);
    hubcapGeometry.rotateZ(Math.PI / 2);
    for (const pos of wheelPositions) {
        const h = hubcapGeometry.clone();
        h.translate(pos[0] + (pos[0] > 0 ? wheelThickness * 0.1 : -wheelThickness * 0.1), pos[1], pos[2]);
        hubcapGeoms.push(h);
    }

    // Métal (pare-chocs déjà inclus dans body, ici que pour les hubcaps)
    // (Si tu veux séparer plus, ajoute ici)

    // Phares
    const lightGeoms = [];
    const lightHeight = 0.15;
    // Correction : la hauteur Y des phares doit être la même que le haut du pare-chocs (0.2 + 0.15/2)
    const lightYPos = 0.2 + 0.15/2;
    const headLightGeometry = new THREE.BoxGeometry(0.2, lightHeight, 0.1);
    // Gauche
    const headLightLeft = headLightGeometry.clone();
    matrix.identity();
    matrix.setPosition(-2 * 0.35, lightYPos, 4/2 + 0.05);
    headLightLeft.applyMatrix4(matrix);
    lightGeoms.push(headLightLeft);
    // Droite
    const headLightRight = headLightGeometry.clone();
    matrix.identity();
    matrix.setPosition(2 * 0.35, lightYPos, 4/2 + 0.05);
    headLightRight.applyMatrix4(matrix);
    lightGeoms.push(headLightRight);

    // Feux arrière
    const rearLightGeoms = [];
    const rearLightGeometry = new THREE.BoxGeometry(0.2, lightHeight, 0.1);
    // Gauche
    const rearLightLeft = rearLightGeometry.clone();
    matrix.identity();
    matrix.setPosition(-2 * 0.35, lightYPos, -4/2 + 0.05);
    rearLightLeft.applyMatrix4(matrix);
    rearLightGeoms.push(rearLightLeft);
    // Droite
    const rearLightRight = rearLightGeometry.clone();
    matrix.identity();
    matrix.setPosition(2 * 0.35, lightYPos, -4/2 + 0.05);
    rearLightRight.applyMatrix4(matrix);
    rearLightGeoms.push(rearLightRight);

    // Fusionner par type
    const result = {
        body: {
            geometry: mergeGeometries(bodyGeoms, false),
            material: bodyMaterial
        },
        windows: {
            geometry: mergeGeometries(windowGeoms, false),
            material: windowMaterial
        },
        wheels: {
            geometry: mergeGeometries(wheelGeoms, false),
            material: wheelMaterial
        },
        hubcaps: {
            geometry: mergeGeometries(hubcapGeoms, false),
            material: hubcapMaterial
        },
        lights: {
            geometry: mergeGeometries(lightGeoms, false),
            material: lightMaterial
        },
        rearLights: {
            geometry: mergeGeometries(rearLightGeoms, false),
            material: rearLightMaterial
        }
    };
    return result;
}
