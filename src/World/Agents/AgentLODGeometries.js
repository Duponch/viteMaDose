// src/World/Agents/AgentLODGeometries.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Fonctions utilitaires pour créer des géométries de différents niveaux de détail

/**
 * Crée une géométrie capsule avec des options de LOD
 * @param {number} radius - Rayon de la capsule
 * @param {number} length - Longueur du cylindre central
 * @param {string} lodLevel - Niveau de détail ('high', 'medium', 'low')
 */
export function createLODCapsuleGeometry(radius, length, lodLevel = 'high') {
    // Définir le nombre de segments en fonction du LOD
    let radialSegments, heightSegments;
    
    switch(lodLevel) {
        case 'high':
            radialSegments = 16;
            heightSegments = 1;
            break;
        case 'medium':
            radialSegments = 8;
            heightSegments = 1;
            break;
        case 'low':
            radialSegments = 6;
            heightSegments = 1;
            break;
        default:
            radialSegments = 16;
            heightSegments = 1;
    }
    
    const cylinderHeight = length;
    const sphereRadius = radius;
    const geometries = [];
    
    // Créer le cylindre central
    const cylinderGeometry = new THREE.CylinderGeometry(
        radius, radius, cylinderHeight, radialSegments, heightSegments
    );
    geometries.push(cylinderGeometry);
    
    // Créer les hémisphères pour les extrémités
    const topSphereGeometry = new THREE.SphereGeometry(
        sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 
        0, Math.PI * 2, 0, Math.PI / 2
    );
    topSphereGeometry.translate(0, cylinderHeight / 2, 0);
    geometries.push(topSphereGeometry);
    
    const bottomSphereGeometry = new THREE.SphereGeometry(
        sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 
        0, Math.PI * 2, 0, Math.PI / 2
    );
    bottomSphereGeometry.rotateX(Math.PI);
    bottomSphereGeometry.translate(0, -cylinderHeight / 2, 0);
    geometries.push(bottomSphereGeometry);
    
    // Fusionner les géométries
    const mergedGeometry = mergeGeometries(geometries, false);
    
    // Nettoyer les géométries temporaires
    geometries.forEach(geom => geom.dispose());
    
    return mergedGeometry;
}

/**
 * Crée la géométrie de chaussure avec différents niveaux de détail
 * @param {string} lodLevel - Niveau de détail ('high', 'medium', 'low')
 */
export function createLODShoeGeometry(lodLevel = 'high') {
    const shoeRadius = 1.2; // Rayon de base
    const soleHeight = 0.4; // Hauteur de la semelle
    const shoeTopScale = new THREE.Vector3(1.0, 0.6, 1.5); // Échelle pour aplatir/allonger

    // Définir le nombre de segments en fonction du LOD
    let segments;
    switch(lodLevel) {
        case 'high':
            segments = 32;
            break;
        case 'medium':
            segments = 16;
            break;
        case 'low':
            segments = 8;
            break;
        default:
            segments = 32;
    }

    // Partie supérieure (demi-sphère inversée)
    const topPartGeometry = new THREE.SphereGeometry(
        shoeRadius, segments, Math.max(4, segments/2), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2
    );
    topPartGeometry.rotateX(Math.PI); // Orienter la partie plate vers le haut

    // Semelle (cylindre)
    const soleGeometry = new THREE.CylinderGeometry(
        shoeRadius, shoeRadius, soleHeight, segments
    );
    // Positionner le haut de la semelle à y=0
    soleGeometry.translate(0, -soleHeight / 2, 0);

    // Appliquer l'échelle aux géométries
    topPartGeometry.scale(shoeTopScale.x, shoeTopScale.y, shoeTopScale.z);
    soleGeometry.scale(shoeTopScale.x, shoeTopScale.y, shoeTopScale.z);

    return { top: topPartGeometry, sole: soleGeometry };
}

/**
 * Crée une tête simplifiée pour le LOD bas
 * @param {number} headRadius - Rayon de la tête
 * @param {number} headLength - Longueur du cylindre central de la tête
 * @param {string} lodLevel - Niveau de détail ('high', 'medium', 'low')
 */
export function createLODHeadGeometry(headRadius, headLength, lodLevel = 'high') {
    let segments, faceFeatureSegments;
    switch(lodLevel) {
        case 'high':
            segments = 32;
            faceFeatureSegments = 12;
            break;
        case 'medium':
            segments = 16;
            faceFeatureSegments = 8;
            break;
        case 'low':
            segments = 8;
            faceFeatureSegments = 4;
            break;
        default:
            segments = 32;
            faceFeatureSegments = 12;
    }

    // Si LOD est 'low', créer une version très simplifiée (juste la tête sans détails)
    if (lodLevel === 'low') {
        const headGeom = createLODCapsuleGeometry(headRadius, headLength, 'low');
        // En LOD bas, juste ajouter une géométrie de base pour les cheveux
        const hairGeom = new THREE.SphereGeometry(headRadius * 1.05, 8, 4);
        hairGeom.scale(0.95, 0.45, 0.95);
        
        // Appliquer le décalage des cheveux
        const hairMatrix = new THREE.Matrix4().makeTranslation(0, headRadius * 0.3, 0);
        hairGeom.applyMatrix4(hairMatrix);
        
        // Fusionner tête et cheveux
        const mergedGeom = mergeGeometries([headGeom, hairGeom], true);
        headGeom.dispose();
        hairGeom.dispose();
        return mergedGeom;
    }
    
    // Pour 'high' et 'medium', créer une version avec tous les détails mais moins de segments
    const headGeom = createLODCapsuleGeometry(headRadius, headLength, lodLevel);
    
    // Créer la géométrie des cheveux et l'aplatir légèrement
    const hairGeom = new THREE.SphereGeometry(headRadius * 1.05, segments, segments/2);
    hairGeom.scale(0.95, 0.45, 0.95);
    
    // Appliquer le décalage local des cheveux
    const hairMatrix = new THREE.Matrix4().makeTranslation(0, headRadius * 0.3, 0);
    hairGeom.applyMatrix4(hairMatrix);
    
    // Créer les géométries pour les yeux et la bouche avec moins de segments
    const eyeRadius = 0.3;
    const eyeGeom = new THREE.SphereGeometry(eyeRadius, faceFeatureSegments, faceFeatureSegments/2);
    
    // Pour la bouche, utiliser un cercle au lieu d'un tore si en LOD medium
    let mouthGeom;
    if (lodLevel === 'medium') {
        mouthGeom = new THREE.CircleGeometry(0.6, 8);
    } else {
        const smileRadius = 0.6;
        const smileTube = 0.08;
        const smileStartAngle = Math.PI * 1.15;
        const smileArc = Math.PI * 0.7;
        mouthGeom = new THREE.TorusGeometry(
            smileRadius, smileTube, faceFeatureSegments/2, faceFeatureSegments*2, 
            smileArc, smileStartAngle
        );
    }
    
    // Positionner les yeux et la bouche
    const eyeY = 0.3;
    const eyeX = 0.8;
    const eyeZ = headRadius * 0.9;
    const mouthY = -0.7;
    const mouthZ = headRadius;
    
    // Matrices de transformation
    const leftEyeMatrix = new THREE.Matrix4().makeTranslation(-eyeX, eyeY, eyeZ);
    const rightEyeMatrix = new THREE.Matrix4().makeTranslation(eyeX, eyeY, eyeZ);
    const mouthMatrix = new THREE.Matrix4().makeTranslation(0, mouthY, mouthZ);
    
    if (lodLevel === 'high') {
        mouthMatrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 16));
        mouthMatrix.multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 1.15));
    }
    
    // Appliquer les transformations aux géométries
    const leftEyeGeom = eyeGeom.clone().applyMatrix4(leftEyeMatrix);
    const rightEyeGeom = eyeGeom.clone().applyMatrix4(rightEyeMatrix);
    const mouthGeomTransformed = mouthGeom.clone().applyMatrix4(mouthMatrix);
    
    // Fusionner toutes les géométries
    const mergedGeom = mergeGeometries(
        [headGeom, hairGeom, leftEyeGeom, rightEyeGeom, mouthGeomTransformed], 
        true
    );
    
    // Nettoyer les géométries temporaires
    headGeom.dispose();
    hairGeom.dispose();
    eyeGeom.dispose();
    mouthGeom.dispose();
    leftEyeGeom.dispose();
    rightEyeGeom.dispose();
    mouthGeomTransformed.dispose();
    
    return mergedGeom;
}

/**
 * Crée une géométrie de torse avec différents niveaux de détail
 * @param {number} torsoRadius - Rayon du torse
 * @param {number} torsoLength - Longueur du torse
 * @param {string} lodLevel - Niveau de détail ('high', 'medium', 'low')
 */
export function createLODTorsoGeometry(torsoRadius, torsoLength, lodLevel = 'high') {
    let segments;
    switch(lodLevel) {
        case 'high':
            segments = 24;
            break;
        case 'medium':
            segments = 12;
            break;
        case 'low':
            segments = 8;
            break;
        default:
            segments = 24;
    }
    
    // Pour LOD bas, créer un simple cylindre avec des hémisphères aux extrémités
    if (lodLevel === 'low') {
        return createLODCapsuleGeometry(torsoRadius, torsoLength, 'low');
    }
    
    // Pour LOD medium et high, créer une version avec des détails
    const beltHeight = 0.2;
    const remainingLength = torsoLength - beltHeight;
    const shirtHeight = remainingLength * 0.7; // 70% pour la chemise
    const pantsHeight = remainingLength * 0.3; // 30% pour le pantalon
    
    // Créer les géométries pour chaque partie du torse
    const shirtCylinder = new THREE.CylinderGeometry(torsoRadius, torsoRadius, shirtHeight, segments);
    const beltCylinder = new THREE.CylinderGeometry(torsoRadius, torsoRadius, beltHeight, segments);
    const pantsCylinder = new THREE.CylinderGeometry(torsoRadius, torsoRadius, pantsHeight, segments);
    const torsoTopCap = new THREE.SphereGeometry(torsoRadius, segments, segments/2, 0, Math.PI * 2, 0, Math.PI / 2);
    const torsoBottomCap = new THREE.SphereGeometry(torsoRadius, segments, segments/2, 0, Math.PI * 2, 0, Math.PI / 2);
    
    // Ligne de boutons optionnelle pour LOD high seulement
    let shirtLine = null;
    if (lodLevel === 'high') {
        shirtLine = new THREE.BoxGeometry(0.1, shirtHeight, 0.1);
    }
    
    // Positionner les parties du torse
    const shirtY = (beltHeight + pantsHeight) / 2;
    const beltY = (pantsHeight - shirtHeight) / 2;
    const pantsY = -(shirtHeight + beltHeight) / 2;
    const capY = torsoLength / 2;
    
    // Créer des matrices de transformation pour chaque partie
    const shirtMatrix = new THREE.Matrix4().makeTranslation(0, shirtY, 0);
    const beltMatrix = new THREE.Matrix4().makeTranslation(0, beltY, 0);
    const pantsMatrix = new THREE.Matrix4().makeTranslation(0, pantsY, 0);
    const topCapMatrix = new THREE.Matrix4().makeTranslation(0, capY, 0);
    const bottomCapMatrix = new THREE.Matrix4().makeTranslation(0, -capY, 0)
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI));
    
    // Appliquer les transformations aux géométries
    shirtCylinder.applyMatrix4(shirtMatrix);
    beltCylinder.applyMatrix4(beltMatrix);
    pantsCylinder.applyMatrix4(pantsMatrix);
    torsoTopCap.applyMatrix4(topCapMatrix);
    torsoBottomCap.applyMatrix4(bottomCapMatrix);
    
    const geometriesToMerge = [shirtCylinder, beltCylinder, pantsCylinder, torsoTopCap, torsoBottomCap];
    
    // Ajouter la ligne de boutons si LOD high
    if (lodLevel === 'high' && shirtLine) {
        const shirtLineMatrix = new THREE.Matrix4().makeTranslation(0, shirtY, torsoRadius - 0.05);
        shirtLine.applyMatrix4(shirtLineMatrix);
        geometriesToMerge.push(shirtLine);
    }
    
    // Fusionner toutes les géométries
    const mergedGeom = mergeGeometries(geometriesToMerge, true);
    
    // Nettoyer les géométries temporaires
    geometriesToMerge.forEach(geom => geom.dispose());
    
    return mergedGeom;
}
