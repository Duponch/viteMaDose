import * as THREE from 'three';

export default class Camera {
    constructor(experience) {
        this.experience = experience;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        // --- NOUVEAU: État et cibles de suivi ---
        this.isFollowing = false;
        this.targetAgent = null;
        this.followSpeed = 4.0; // Vitesse de l'interpolation (plus haut = plus rapide)

        // Vecteurs pour le calcul du suivi
        //this.idealOffset = new THREE.Vector3(0, 3, -6); // Offset souhaité derrière l'agent (local)
		this.idealOffset = new THREE.Vector3(0, 3, 6);

        //this.idealLookAt = new THREE.Vector3(0, 1.5, 0); // Point à regarder (local, tête/haut du corps)
		this.idealLookAt = new THREE.Vector3(0, 1.5, -10);

        this.currentPosition = new THREE.Vector3(); // Où la caméra est actuellement
        this.currentLookAt = new THREE.Vector3(); // Où la caméra regarde actuellement

        this.worldAgentPosition = new THREE.Vector3();
        this.worldAgentOrientation = new THREE.Quaternion();
        this.worldCameraPosition = new THREE.Vector3();
        this.worldLookAtPosition = new THREE.Vector3();
        // ----------------------------------------

        this.setInstance();
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            45,
            this.sizes.width / this.sizes.height,
            0.1,
            3000
        );
        // Position initiale de la caméra (ajustée pour une meilleure vue)
        this.instance.position.set(80, 80, 80); // Un peu plus loin/haut
        this.scene.add(this.instance);

        // Initialiser currentPosition/LookAt avec la position initiale de la caméra
        this.currentPosition.copy(this.instance.position);
        // Pour currentLookAt, on peut viser l'origine ou un point au sol
        this.currentLookAt.set(0, 0, 0);
        this.instance.lookAt(this.currentLookAt); // S'assurer que la caméra regarde bien au début
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }

	followAgent(agent) {
        if (!agent) return;
        this.targetAgent = agent;
        this.isFollowing = true;
        // Optionnel: définir la position/lookat initiale directement pour un snap plus rapide
        // this.updateFollowLogic(0.1); // Appeler une fois avec un grand delta pour se rapprocher vite
        // this.instance.position.copy(this.currentPosition);
        // this.instance.lookAt(this.currentLookAt);
    }

	stopFollowing() {
        this.targetAgent = null;
        this.isFollowing = false;
        // La position/lookAt de la caméra restent où ils sont,
        // OrbitControls reprendra le contrôle à partir de là.
    }

	updateFollowLogic(deltaTimeSeconds) {
        if (!this.targetAgent) return;

        // 1. Obtenir la position et l'orientation MONDE de l'agent
        this.worldAgentPosition.copy(this.targetAgent.position);
        this.worldAgentOrientation.copy(this.targetAgent.orientation);

        // 2. Calculer la position IDÉALE de la caméra dans le monde
        // Partir de l'offset local, l'orienter comme l'agent, puis l'ajouter à la position de l'agent
        this.worldCameraPosition.copy(this.idealOffset);
        this.worldCameraPosition.applyQuaternion(this.worldAgentOrientation);
        this.worldCameraPosition.add(this.worldAgentPosition);

        // 3. Calculer le point IDÉAL que la caméra doit regarder dans le monde
        // Partir du point local à regarder, l'orienter, puis l'ajouter à la position de l'agent
        this.worldLookAtPosition.copy(this.idealLookAt);
        this.worldLookAtPosition.applyQuaternion(this.worldAgentOrientation);
        this.worldLookAtPosition.add(this.worldAgentPosition);

        // 4. Interpoler la position ACTUELLE de la caméra vers la position IDÉALE
        // Utilisation de lerp pour une interpolation simple.
        // Un facteur plus petit rend le suivi plus "lâche", plus grand le rend plus serré.
        // Calculer un alpha dépendant du temps pour une interpolation indépendante du framerate
        const lerpAlpha = 1.0 - Math.exp(-this.followSpeed * deltaTimeSeconds);
        this.currentPosition.lerp(this.worldCameraPosition, lerpAlpha);

        // 5. Interpoler le point ACTUEL que la caméra regarde vers le point IDÉAL
        this.currentLookAt.lerp(this.worldLookAtPosition, lerpAlpha);

        // 6. Appliquer la position et le lookAt à la caméra THREE
        this.instance.position.copy(this.currentPosition);
        this.instance.lookAt(this.currentLookAt);
    }

	update(deltaTime) { // deltaTime est maintenant passé depuis Experience (en ms)
        // Si la caméra est en mode suivi, exécuter la logique de suivi
        if (this.isFollowing && this.targetAgent) {
             // Convertir deltaTime (ms) en secondes pour les calculs basés sur le temps
             const deltaTimeSeconds = deltaTime / 1000.0;
             this.updateFollowLogic(deltaTimeSeconds);
        }
        // Si !this.isFollowing, OrbitControls (géré dans Experience.update)
        // s'occupe de la caméra, donc cette fonction ne fait rien d'autre.
    }
}