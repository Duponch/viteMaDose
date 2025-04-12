// src/World/Agent.js
import * as THREE from 'three';

// --- Fonctions d'aide intégrées (depuis l'HTML) ---

// Fonction pour créer une forme de capsule avec Cylindre + Sphères
function createCapsuleShape(radius, length, material, radialSegments = 16, heightSegments = 1) {
    const group = new THREE.Group();
    const cylinderHeight = length;
    const sphereRadius = radius;

    // Cylindre central
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, radialSegments, heightSegments);
    const cylinder = new THREE.Mesh(cylinderGeometry, material);
    cylinder.castShadow = true; // Ajouter ombres
    group.add(cylinder);

    // Sphère supérieure (demi-sphère)
    const topSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    const topSphere = new THREE.Mesh(topSphereGeometry, material);
    topSphere.position.y = cylinderHeight / 2;
    topSphere.castShadow = true;
    group.add(topSphere);

    // Sphère inférieure (demi-sphère)
    const bottomSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    const bottomSphere = new THREE.Mesh(bottomSphereGeometry, material);
    bottomSphere.position.y = -cylinderHeight / 2;
    bottomSphere.rotation.x = Math.PI; // Rotation pour orienter la demi-sphère vers le bas
    bottomSphere.castShadow = true;
    group.add(bottomSphere);

    // Stocker les géométries pour nettoyage potentiel (optionnel, si on nettoie via traverse)
    group.userData.geometries = [cylinderGeometry, topSphereGeometry, bottomSphereGeometry];

    return group;
}

// Fonction pour créer la forme de chaussure
function createShoe(material) {
    const shoeGroup = new THREE.Group();
    const shoeRadius = 1.2; // Gardé de l'HTML

    // Partie supérieure bombée (Demi-sphère inférieure, tournée)
    const topPartGeometry = new THREE.SphereGeometry(shoeRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const topPart = new THREE.Mesh(topPartGeometry, material);
    topPart.rotation.x = Math.PI; // Partie bombée vers le haut
    topPart.castShadow = true;
    shoeGroup.add(topPart);

    // Semelle (Cercle plat)
    const soleGeometry = new THREE.CircleGeometry(shoeRadius, 32);
    const sole = new THREE.Mesh(soleGeometry, material);
    sole.rotation.x = -Math.PI / 2; // Oriente le cercle horizontalement
    sole.position.y = 0; // Au niveau du bas de la partie bombée
    sole.castShadow = false; // La semelle ne projette pas vraiment d'ombre utile
    sole.receiveShadow = true; // Peut recevoir des ombres
    shoeGroup.add(sole);

    // Appliquer la mise à l'échelle spécifique à la chaussure
    shoeGroup.scale.y = 0.6;
    shoeGroup.scale.z = 1.5;

    // Stocker les géométries pour nettoyage potentiel
    shoeGroup.userData.geometries = [topPartGeometry, soleGeometry];

    return shoeGroup;
}


// --- Classe Agent ---
export default class Agent {
    /**
     * Crée un agent avec un modèle type Rayman basé sur le code HTML.
     * @param {THREE.Scene} scene La scène Three.js.
     * @param {Experience} experience L'instance de l'expérience (pour l'accès au temps).
     * @param {number} agentId L'identifiant unique de l'agent.
     * @param {number} bodyOverrideColor Couleur hexadécimale pour le torse (optionnel).
     * @param {number} agentScale Échelle générale à appliquer au modèle.
     */
    constructor(scene, experience, agentId, bodyOverrideColor = null, agentScale = 1.0) {
        this.scene = scene;
        this.experience = experience;
        this.id = agentId;
        // Utiliser la couleur override pour le torse si fournie, sinon la couleur par défaut du HTML
        this.torsoColor = bodyOverrideColor !== null ? bodyOverrideColor : 0x800080; // Violet par défaut
        this.scale = agentScale;
        this.speed = 1.5; // Vitesse par défaut (ajustée précédemment)
        this.reachTolerance = 0.15; // Tolérance fixe (ajustée précédemment)
        this.path = null;
        this.currentPathIndex = 0;
        // La couleur debug peut être différente de la couleur du torse maintenant
        this.debugPathColor = bodyOverrideColor !== null ? bodyOverrideColor : 0xff0000; // Rouge si pas d'override

        // --- Création du modèle Rayman (utilise la nouvelle logique) ---
        this.model = this.createRaymanModel();

        // --- Appliquer l'échelle globale ---
        this.model.scale.set(this.scale, this.scale, this.scale);

        this.scene.add(this.model);
    }

    /**
     * Crée la géométrie et les materials pour le modèle basé sur l'HTML.
     * @returns {THREE.Group} Le groupe contenant toutes les parties du modèle.
     */
    createRaymanModel() {
        const agentGroup = new THREE.Group();
        agentGroup.name = `Agent_${this.id}`;

        // --- Matériaux (basés sur l'HTML) ---
        this.skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1 });
        this.torsoMaterial = new THREE.MeshStandardMaterial({ color: this.torsoColor, roughness: 0.5, metalness: 0.2 });
        this.handMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1 });
        this.shoeMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.7, metalness: 0.1 });

        // Stocker les matériaux pour nettoyage
        this.materials = [this.skinMaterial, this.torsoMaterial, this.handMaterial, this.shoeMaterial];

        // --- Création des parties du corps (basé sur l'HTML) ---

        // 1. Tête (Capsule)
        const headRadius = 2.5;
        const headLength = 1;
        this.head = createCapsuleShape(headRadius, headLength, this.skinMaterial, 32);
        this.head.position.y = 6.0;
        agentGroup.add(this.head);

        // 2. Torse (Capsule)
        const torsoRadius = 1.5;
        const torsoLength = 1.5;
        this.torso = createCapsuleShape(torsoRadius, torsoLength, this.torsoMaterial, 24);
        this.torso.position.y = 0; // Centre du groupe
        agentGroup.add(this.torso);

        // 3. Mains (Capsules)
        const handRadius = 0.8;
        const handLength = 1.0;

        this.leftHand = createCapsuleShape(handRadius, handLength, this.handMaterial, 12);
        this.leftHand.position.set(-4.5, 1.0, 0);
        this.leftHand.rotation.z = -Math.PI / 12;
        agentGroup.add(this.leftHand);

        this.rightHand = createCapsuleShape(handRadius, handLength, this.handMaterial, 12);
        this.rightHand.position.set(4.5, 1.0, 0);
        this.rightHand.rotation.z = Math.PI / 12;
        agentGroup.add(this.rightHand);

        // 4. Pieds/Chaussures (Forme spécifique)
        this.leftFoot = createShoe(this.shoeMaterial);
        this.leftFoot.position.set(-1.8, -3.5, 0.5);
        agentGroup.add(this.leftFoot);

        this.rightFoot = createShoe(this.shoeMaterial);
        this.rightFoot.position.set(1.8, -3.5, 0.5);
        agentGroup.add(this.rightFoot);

        // Stocker les références pour l'animation (pas le torse ni la tête ?)
        // L'animation HTML ne bouge que les mains et pieds.
        this.animatedParts = [this.leftHand, this.rightHand, this.leftFoot, this.rightFoot];
        // Stocker les positions Y de base pour l'animation
        this.leftHandBaseY = this.leftHand.position.y;
        this.rightHandBaseY = this.rightHand.position.y;
        this.leftFootBaseY = this.leftFoot.position.y;
        this.rightFootBaseY = this.rightFoot.position.y;

        // Note : On ne stocke plus this.geometries car le nettoyage se fera par parcours

        // Mettre le groupe principal légèrement au-dessus du sol pour que les pieds (à y=-3.5 relatif)
        // touchent le sol (y=0 absolu) APRES application de l'échelle.
        // La position Y exacte sera définie par setPath, mais on ajuste le "point zéro" interne.
        // Le point le plus bas est à y = -3.5 (base des pieds). On veut que ce point soit à y=0 DANS LE GROUPE.
        // Donc on translate tout le groupe vers le haut de 3.5.
        // Attention: ceci est avant la mise à l'échelle globale !
        // agentGroup.position.y = 3.5; // <- FAUSSE BONNE IDEE, car la position Y globale est gérée par le path.
                                    // Laissons le centre du torse (y=0) comme origine locale du groupe.
                                    // La position Y absolue sera gérée par this.model.position.y = path[...].y

        return agentGroup;
    }

    setPath(pathPoints) {
        if (pathPoints && pathPoints.length > 0) {
            this.path = pathPoints;
            this.currentPathIndex = 0;

            // Positionner le modèle AU SOL au début du chemin
            this.model.position.copy(this.path[0]);
            // pathPoints[0].y EST la hauteur du sol (trottoir).
            // Notre modèle a son origine au niveau du torse (y=0 local).
            // Il faut donc que this.model.position.y soit égal à pathPoints[0].y
            // pour que l'origine locale soit au niveau du sol.
            this.model.position.y = this.path[0].y;

            if (this.path.length > 1) {
                // Orienter vers le premier waypoint
                const nextPoint = this.path[1].clone();
                // Regarder à la hauteur du TORSE pour l'orientation (origine locale y=0)
                // On calcule la position absolue du torse pour lookAt
                const torsoWorldPos = new THREE.Vector3();
                this.model.getWorldPosition(torsoWorldPos); // Donne la position du groupe (origine = torse)
                nextPoint.y = torsoWorldPos.y; // Orienter horizontalement par rapport au torse

                this.model.lookAt(nextPoint);

            } else {
                 // Si chemin d'un seul point
                 this.model.position.copy(this.path[0]);
                 this.model.position.y = this.path[0].y;
                 this.path = null; // Chemin terminé
            }
        } else {
            // Pas de chemin ou chemin terminé
            this.path = null;
            this.currentPathIndex = 0;
        }
    }

    /**
     * Applique l'animation de lévitation de l'HTML.
     * @param {number} timeElapsed Temps total écoulé en millisecondes.
     */
    animateLevitation(timeElapsed) {
        const time = timeElapsed / 1000; // Convertir en secondes

        // Mettre à jour Y basé sur la position Y initiale stockée
        this.leftHand.position.y = this.leftHandBaseY + Math.sin(time * 2) * 0.2;
        this.rightHand.position.y = this.rightHandBaseY + Math.cos(time * 2 + 1) * 0.2;
        this.leftFoot.position.y = this.leftFootBaseY + Math.sin(time * 1.5 + 2) * 0.15;
        this.rightFoot.position.y = this.rightFootBaseY + Math.cos(time * 1.5 + 3) * 0.15;

        // Optionnel: légère rotation des mains
        this.leftHand.rotation.z = -Math.PI / 12 + Math.sin(time * 1.8) * 0.1;
        this.rightHand.rotation.z = Math.PI / 12 + Math.cos(time * 1.8 + 0.5) * 0.1;
    }

    update(deltaTime) {
        // --- Animation procédurale (lévitation) ---
        this.animateLevitation(this.experience.time.elapsed);
        // -----------------------------------------

        // Logique de déplacement (si un chemin est défini)
        if (!this.path || this.currentPathIndex >= this.path.length) {
            return; // Pas de chemin ou chemin terminé
        }

        const targetPosition = this.path[this.currentPathIndex];
        const currentPosition = this.model.position;

        // Comparaison sur XZ pour la distance
        const distanceToTargetXZ = Math.sqrt(
            Math.pow(targetPosition.x - currentPosition.x, 2) +
            Math.pow(targetPosition.z - currentPosition.z, 2)
        );

        // Distance à parcourir ce frame
        const moveDistance = this.speed * (deltaTime / 1000);

        if (distanceToTargetXZ <= this.reachTolerance || distanceToTargetXZ < moveDistance) {
            // Atteint la cible : se positionner exactement et passer au point suivant
            currentPosition.x = targetPosition.x;
            currentPosition.z = targetPosition.z;
            currentPosition.y = targetPosition.y; // Assurer la hauteur exacte du sol
            this.currentPathIndex++;

            if (this.currentPathIndex < this.path.length) {
                // Regarder vers le point suivant
                const nextPoint = this.path[this.currentPathIndex].clone();
                 // Regarder horizontalement depuis la position actuelle (au niveau du sol/torse)
                nextPoint.y = currentPosition.y;
                this.model.lookAt(nextPoint);

            } else {
                // Chemin terminé
                this.path = null; // Réinitialiser
            }
        } else {
            // Se déplacer vers la cible
            const direction = targetPosition.clone().sub(currentPosition);
            direction.y = 0; // Mouvement uniquement sur XZ
            direction.normalize();
            this.model.position.addScaledVector(direction, moveDistance);

            // S'assurer que Y reste constant (hauteur du sol)
            this.model.position.y = targetPosition.y;
        }
    }

    destroy() {
        // Retirer le groupe modèle de la scène
        if (this.model && this.model.parent) {
            this.scene.remove(this.model);
        }

        // --- Nettoyage Robuste via Parcours ---
        if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    // Nettoyer les matériaux si ce sont des instances uniques
                    // Note: Si les matériaux de base (this.skinMaterial etc.) sont partagés
                    // par plusieurs agents, il ne faut PAS les disposer ici mais plutôt
                    // lors de la destruction globale de World ou Experience.
                    // Pour l'instant, on suppose qu'ils ne sont pas partagés massivement.
                    // Si les matériaux sont clonés implicitement par les helpers, c'est ok.
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
                // Nettoyer les géométries stockées dans userData par les helpers
                if (child.userData && child.userData.geometries) {
                    child.userData.geometries.forEach(geom => geom.dispose());
                }
            });
        }
        // Disposer aussi les matériaux de base stockés explicitement
        this.materials.forEach(mat => mat.dispose());


        // Nullifier les références
        this.model = null;
        this.scene = null;
        this.experience = null;
        this.path = null;
        this.materials = [];
        this.animatedParts = [];
        this.head = null;
        this.torso = null;
        this.leftHand = null;
        this.rightHand = null;
        this.leftFoot = null;
        this.rightFoot = null;
        this.skinMaterial = null;
        this.torsoMaterial = null;
        this.handMaterial = null;
        this.shoeMaterial = null;

        // console.log(`Agent ${this.id} (Rayman HTML style) détruit.`);
    }
}