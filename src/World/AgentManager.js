// src/World/AgentManager.js
import * as THREE from 'three';
import Agent from './Agent.js'; // Importer la classe Agent logique
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Fonctions d'aide locales pour créer les géométries de base ---
// (Copiez les fonctions createCapsuleShape et createShoe ici, SANS les modifier
// pour ajouter castShadow car ce sera géré par l'InstancedMesh)

// Fonction pour créer une forme de capsule avec Cylindre + Sphères
function createCapsuleGeometry(radius, length, radialSegments = 16, heightSegments = 1) {
    const cylinderHeight = length;
    const sphereRadius = radius;
    const geometries = [];

    // Cylindre central
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, radialSegments, heightSegments);
    geometries.push(cylinderGeometry);

    // Sphère supérieure (demi-sphère)
    const topSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    topSphereGeometry.translate(0, cylinderHeight / 2, 0); // Déplacer la géométrie
    geometries.push(topSphereGeometry);

    // Sphère inférieure (demi-sphère)
    const bottomSphereGeometry = new THREE.SphereGeometry(sphereRadius, radialSegments, Math.ceil(radialSegments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    bottomSphereGeometry.rotateX(Math.PI); // Orienter vers le bas
    bottomSphereGeometry.translate(0, -cylinderHeight / 2, 0); // Déplacer la géométrie
    geometries.push(bottomSphereGeometry);

    // Fusionner les géométries en une seule
	const mergedGeometry = mergeGeometries(geometries, false);
    // IMPORTANT: Nettoyer les géométries individuelles après fusion
    geometries.forEach(geom => geom.dispose());

    return mergedGeometry;
}

// Fonction pour créer la géométrie de chaussure
function createShoeGeometry() {
    const shoeRadius = 1.2;
    const geometries = [];

    // Partie supérieure bombée (Demi-sphère inférieure, tournée)
    const topPartGeometry = new THREE.SphereGeometry(shoeRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    topPartGeometry.rotateX(Math.PI); // Partie bombée vers le haut
    geometries.push(topPartGeometry);

    // Semelle (Cercle plat)
    const soleGeometry = new THREE.CircleGeometry(shoeRadius, 32);
    soleGeometry.rotateX(-Math.PI / 2); // Oriente le cercle horizontalement
    // La position Y (0) est correcte car topPart est aussi centrée sur 0 après rotation
    geometries.push(soleGeometry);

    // Fusionner
	let mergedGeometry = mergeGeometries(geometries, false);
    geometries.forEach(geom => geom.dispose());

    // Appliquer la mise à l'échelle spécifique à la chaussure A LA GEOMETRIE
    mergedGeometry.scale(1.0, 0.6, 1.5); // Scale Y et Z

    return mergedGeometry;
}


// --- Classe AgentManager ---
export default class AgentManager {
    constructor(scene, experience, config, maxAgents = 500) {
        this.scene = scene;
        this.experience = experience;
        this.config = config;
        this.maxAgents = maxAgents;

        this.agents = []; // Contiendra les instances logiques d'Agent
        this.instanceMeshes = {}; // Stockera les InstancedMesh par partie
        this.baseGeometries = {};
        this.baseMaterials = {};

        // --- Objets temporaires pour les calculs (performance) ---
        this.tempMatrix = new THREE.Matrix4();
        this.agentMatrix = new THREE.Matrix4();
        this.partOffsetMatrix = new THREE.Matrix4();
        this.animationMatrix = new THREE.Matrix4();
        this.finalPartMatrix = new THREE.Matrix4();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3(1, 1, 1);
        this.tempColor = new THREE.Color();

        this._initializeMeshes();
    }

    _initializeMeshes() {
        console.log("AgentManager: Initialisation des InstancedMesh...");

        // 1. Matériaux de base (INCHANGÉ)
        this.baseMaterials.skin = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6, metalness: 0.1 });
        this.baseMaterials.torso = new THREE.MeshStandardMaterial({ color: 0x800080, roughness: 0.5, metalness: 0.2 });
        this.baseMaterials.hand = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1 });
        this.baseMaterials.shoe = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.7, metalness: 0.1 });

        // 2. Géométries de base (INCHANGÉ)
        const headRadius = 2.5; const headLength = 1;
        const torsoRadius = 1.5; const torsoLength = 1.5;
        const handRadius = 0.8; const handLength = 1.0;
        this.baseGeometries.head = createCapsuleGeometry(headRadius, headLength, 32);
        this.baseGeometries.torso = createCapsuleGeometry(torsoRadius, torsoLength, 24);
        this.baseGeometries.hand = createCapsuleGeometry(handRadius, handLength, 12);
        this.baseGeometries.shoe = createShoeGeometry();

        // 3. Créer les InstancedMesh (MODIFICATION TAILLE MAINS/PIEDS)
        const createInstMesh = (name, geom, mat, count) => { // Ajout paramètre count
            const mesh = new THREE.InstancedMesh(geom, mat, count); // Utilisation du paramètre count
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.name = `${name}Instances`;
             if (name === 'torso') {
                // Couleur seulement pour le torse (index 0 à maxAgents-1)
                mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxAgents * 3), 3);
            }
            this.scene.add(mesh);
            this.instanceMeshes[name] = mesh;
        };

        // Créer avec les bonnes tailles
        createInstMesh('head', this.baseGeometries.head, this.baseMaterials.skin, this.maxAgents);     // maxAgents têtes
        createInstMesh('torso', this.baseGeometries.torso, this.baseMaterials.torso, this.maxAgents);    // maxAgents torses
        createInstMesh('hand', this.baseGeometries.hand, this.baseMaterials.hand, this.maxAgents * 2);  // maxAgents * 2 mains
        createInstMesh('shoe', this.baseGeometries.shoe, this.baseMaterials.shoe, this.maxAgents * 2);  // maxAgents * 2 chaussures

        console.log(`AgentManager: ${Object.keys(this.instanceMeshes).length} InstancedMesh créés.`);
    }

    createAgent(startPosition = null) {
        if (this.agents.length >= this.maxAgents) {
            console.warn("AgentManager: Nombre maximum d'agents atteint.");
            return null;
        }

        const instanceId = this.agents.length; // Prochain ID disponible
        const agentConfig = {
            scale: this.config.agentScale,
            speed: 1.5, // Ou lire depuis config
            torsoColor: new THREE.Color(Math.random(), Math.random(), Math.random()).getHex(), // Couleur aléatoire pour l'exemple
            debugPathColor: null // Sera défini par World si besoin
        };
        const newAgent = new Agent(agentConfig, instanceId);

        if (startPosition) {
            newAgent.position.copy(startPosition);
        }

        this.agents.push(newAgent);

        // Initialiser la couleur du torse pour cette instance
        this.tempColor.setHex(newAgent.torsoColor.getHex()); // Assurer que torsoColor est bien une Color
        this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
        if(this.instanceMeshes.torso.instanceColor) this.instanceMeshes.torso.instanceColor.needsUpdate = true;


        // Initialiser les matrices à une échelle nulle pour les rendre invisibles au début
        this.tempMatrix.makeScale(0, 0, 0);
        this.instanceMeshes.head.setMatrixAt(instanceId, this.tempMatrix);
        this.instanceMeshes.torso.setMatrixAt(instanceId, this.tempMatrix);
        this.instanceMeshes.hand.setMatrixAt(instanceId * 2, this.tempMatrix); // Main Gauche
        this.instanceMeshes.hand.setMatrixAt(instanceId * 2 + 1, this.tempMatrix); // Main Droite
        this.instanceMeshes.shoe.setMatrixAt(instanceId * 2, this.tempMatrix); // Pied Gauche
        this.instanceMeshes.shoe.setMatrixAt(instanceId * 2 + 1, this.tempMatrix); // Pied Droit

        // Marquer pour la première mise à jour
        Object.values(this.instanceMeshes).forEach(mesh => {
            if(mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
        });


        return newAgent; // Retourner l'agent logique
    }

    getAgentById(id) {
        return this.agents.find(agent => agent.id === id);
    }

     // --- Calcul de l'animation (CPU) ---
	 _getPartAnimationMatrix(partType, time) {
        this.animationMatrix.identity(); // Réinitialiser

        // Lire les paramètres depuis la config
        const walkSpeed = this.config.agentWalkSpeed !== undefined ? this.config.agentWalkSpeed : 2.5;
        const bobAmplitude = this.config.agentBobAmplitude !== undefined ? this.config.agentBobAmplitude : 0.15;
        const stepLength = this.config.agentStepLength !== undefined ? this.config.agentStepLength : 1.5;
        const stepHeight = this.config.agentStepHeight !== undefined ? this.config.agentStepHeight : 0.7;
        const swingAmplitude = this.config.agentSwingAmplitude !== undefined ? this.config.agentSwingAmplitude : 1.2;
        const ankleRotationAmplitude = this.config.agentAnkleRotationAmplitude !== undefined ? this.config.agentAnkleRotationAmplitude : Math.PI / 8;
        const handTiltAmplitude = this.config.agentHandTiltAmplitude !== undefined ? this.config.agentHandTiltAmplitude : 0.2;
        const headNodAmplitude = this.config.agentHeadNodAmplitude !== undefined ? this.config.agentHeadNodAmplitude : 0.05;
        const headYawAmplitude = this.config.agentHeadYawAmplitude !== undefined ? this.config.agentHeadYawAmplitude : 0.1;
        const headTiltAmplitude = this.config.agentHeadTiltAmplitude !== undefined ? this.config.agentHeadTiltAmplitude : 0.08;
        const headBobAmplitude = this.config.agentHeadBobAmplitude !== undefined ? this.config.agentHeadBobAmplitude : 0.06;

        const walkTime = time * walkSpeed;

        // Variables pour position et rotation DUES A L'ANIMATION
        let animPosX = 0, animPosY = 0, animPosZ = 0;
        let animRotX = 0, animRotY = 0, animRotZ = 0;
        let applyRotation = false; // Appliquer la rotation seulement si nécessaire

        // Mouvement vertical commun (bobbing du corps)
        const torsoBobY = Math.sin(walkTime * 2) * bobAmplitude;

        switch (partType) {
            case 'torso':
                animPosY = torsoBobY;
                break;
            case 'head':
                animPosY = torsoBobY + (Math.sin(walkTime * 1.5 + 0.3) * headBobAmplitude); // Suit torse + bob propre
                animRotX = Math.sin(walkTime) * headNodAmplitude;           // Hochement
                animRotY = Math.sin(walkTime) * headYawAmplitude;           // Rotation latérale
                animRotZ = Math.cos(walkTime * 2) * headTiltAmplitude;       // Inclinaison latérale
                applyRotation = true;
                break;
            case 'leftFoot':
                animPosZ = Math.sin(walkTime) * stepLength;                   // Mouvement Z
                animPosY = Math.max(0, Math.cos(walkTime)) * stepHeight;     // Levée du pied (Y)
                animRotX = Math.sin(walkTime) * ankleRotationAmplitude;      // Rotation cheville (X)
                applyRotation = true;
                break;
            case 'rightFoot':
                animPosZ = Math.sin(walkTime + Math.PI) * stepLength;         // Mouvement Z (déphasé)
                animPosY = Math.max(0, Math.cos(walkTime + Math.PI)) * stepHeight; // Levée du pied (Y) (déphasé)
                animRotX = Math.sin(walkTime + Math.PI) * ankleRotationAmplitude; // Rotation cheville (X) (déphasé)
                applyRotation = true;
                break;
            case 'leftHand':
                animPosZ = Math.sin(walkTime) * swingAmplitude;              // Balancement Z (opposé pied gauche)
                animPosY = torsoBobY;                                         // Suit le torse en Y
                animRotZ = Math.sin(walkTime * 1.8) * handTiltAmplitude;     // Inclinaison Z dynamique
                applyRotation = true;
                break;
            case 'rightHand':
                animPosZ = Math.sin(walkTime + Math.PI) * swingAmplitude;      // Balancement Z (opposé pied droit)
                animPosY = torsoBobY;                                          // Suit le torse en Y
                animRotZ = Math.cos(walkTime * 1.8 + 0.5) * handTiltAmplitude; // Inclinaison Z dynamique
                applyRotation = true;
                break;
        }

        // Composer la matrice d'animation finale (Position + Rotation)
        this.tempPosition.set(animPosX, animPosY, animPosZ);
        if (applyRotation) {
            this.tempQuaternion.setFromEuler(new THREE.Euler(animRotX, animRotY, animRotZ));
        } else {
            this.tempQuaternion.identity(); // Pas de rotation pour torse (ou autres si ajoutés)
        }
        this.tempScale.set(1, 1, 1); // L'animation ne change pas l'échelle locale de la partie

        this.animationMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);

        return this.animationMatrix;
    }

     // --- Calcul du décalage local de base ---
	 _getPartLocalOffsetMatrix(partType) {
        this.partOffsetMatrix.identity();
        // Positions de base de l'HTML final
        const headY = 6.0;
        const torsoY = 0; // Origine
        const handX = 3.0; // *** Mains plus proches ***
        const handY = 1.0;
        const handBaseRotZ = Math.PI / 12; // Rotation de base
        const footX = 1.8;
        const footY = -3.5;
        const footZ = 0.5; // Position Z de base

        switch (partType) {
            case 'head':
                this.partOffsetMatrix.makeTranslation(0, headY, 0);
                break;
            case 'torso':
                this.partOffsetMatrix.makeTranslation(0, torsoY, 0); // Torse à l'origine
                break;
            case 'leftHand':
                 this.tempPosition.set(-handX, handY, 0); // Utilise handX ajusté
                 this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, -handBaseRotZ)); // Rotation Z de base
                 this.tempScale.set(1,1,1);
                 this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                break;
            case 'rightHand':
                 this.tempPosition.set(handX, handY, 0); // Utilise handX ajusté
                 this.tempQuaternion.setFromEuler(new THREE.Euler(0, 0, handBaseRotZ)); // Rotation Z de base
                 this.tempScale.set(1,1,1);
                 this.partOffsetMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                break;
            case 'leftFoot':
                this.partOffsetMatrix.makeTranslation(-footX, footY, footZ); // Utilise footZ
                break;
            case 'rightFoot':
                this.partOffsetMatrix.makeTranslation(footX, footY, footZ); // Utilise footZ
                break;
        }
        return this.partOffsetMatrix;
    }

    update(deltaTime) {
        const elapsedTime = this.experience.time.elapsed / 1000; // Temps en secondes pour l'animation
        const yOffset = this.config.agentYOffset || 0; // Lire l'offset Y depuis la config

        let needsMatrixUpdate = false;
        let needsColorUpdate = this.instanceMeshes.torso.instanceColor?.needsUpdate || false;

        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            const instanceId = agent.instanceId;

            agent.update(deltaTime); // Mise à jour logique

            // --- Calcul de la matrice de base de l'agent AVEC OFFSET Y ---
            this.tempPosition.copy(agent.position);
            this.tempPosition.y += yOffset; // << AJOUT DE L'OFFSET VERTICAL
            this.tempScale.set(agent.scale, agent.scale, agent.scale);
            this.agentMatrix.compose(this.tempPosition, agent.orientation, this.tempScale); // Utilise la position ajustée
            // ------------------------------------------------------------

            // Fonction interne pour calculer et définir la matrice de partie
            const calculateAndSetPartMatrix = (partName, meshName, indexMultiplier = 1, indexOffset = 0) => {
                 const localOffsetMatrix = this._getPartLocalOffsetMatrix(partName);
                 const animationMatrix = this._getPartAnimationMatrix(partName, elapsedTime); // Utilise la NOUVELLE animation

                 // Ordre: Appliquer l'animation à l'offset local, PUIS appliquer la transformation de l'agent
                 this.tempMatrix.multiplyMatrices(localOffsetMatrix, animationMatrix); // Combine offset et animation locale
                 this.finalPartMatrix.multiplyMatrices(this.agentMatrix, this.tempMatrix); // Applique la transformation globale (maintenant surélevée)

                 const finalInstanceIndex = instanceId * indexMultiplier + indexOffset;
                 if (finalInstanceIndex < this.instanceMeshes[meshName].count) {
                    this.instanceMeshes[meshName].setMatrixAt(finalInstanceIndex, this.finalPartMatrix);
                    needsMatrixUpdate = true;
                 } else {
                     console.error(`Tentative d'accès à l'index invalide ${finalInstanceIndex} pour ${meshName}`);
                 }
            };

            // Appeler pour chaque partie (inchangé)
            calculateAndSetPartMatrix('head', 'head');
            calculateAndSetPartMatrix('torso', 'torso');
            calculateAndSetPartMatrix('leftHand', 'hand', 2, 0);
            calculateAndSetPartMatrix('rightHand', 'hand', 2, 1);
            calculateAndSetPartMatrix('leftFoot', 'shoe', 2, 0);
            calculateAndSetPartMatrix('rightFoot', 'shoe', 2, 1);

            // Mise à jour couleur torse (inchangé)
             if (this.instanceMeshes.torso.instanceColor) {
                this.tempColor.setHex(agent.torsoColor.getHex());
                this.instanceMeshes.torso.setColorAt(instanceId, this.tempColor);
                needsColorUpdate = true;
             }
        }

        // Marquer les InstancedMesh pour mise à jour GPU (inchangé)
        if (needsMatrixUpdate) {
            Object.values(this.instanceMeshes).forEach(mesh => {
                 if(mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
            });
        }
         if (needsColorUpdate && this.instanceMeshes.torso.instanceColor) {
            this.instanceMeshes.torso.instanceColor.needsUpdate = true;
        }
    }

    destroy() {
        console.log("AgentManager: Destruction...");
        // Retirer les meshes de la scène
        Object.values(this.instanceMeshes).forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            // La géométrie et le matériau sont disposés ci-dessous
        });
        this.instanceMeshes = {};

        // Disposer les géométries de base
        Object.values(this.baseGeometries).forEach(geom => geom.dispose());
        this.baseGeometries = {};
        console.log("AgentManager: Géométries de base disposées.");

        // Disposer les matériaux de base
        Object.values(this.baseMaterials).forEach(mat => mat.dispose());
        this.baseMaterials = {};
        console.log("AgentManager: Matériaux de base disposés.");

        // Nettoyer la liste des agents logiques (ils n'ont pas de ressources Three.js)
        this.agents.forEach(agent => agent.destroy()); // Appelle leur propre nettoyage simple
        this.agents = [];

        this.scene = null;
        this.experience = null;
        this.config = null;
        console.log("AgentManager: Détruit.");
    }
}