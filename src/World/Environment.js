import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export default class Environment {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug;

        // Propriétés Skybox
        this.skyboxCanvas = null;
        this.skyboxContext = null;
		this.starsCanvas = null;
        this.skyboxTexture = null;
        this.skyBox = null;
        this.moonMesh = null;
        this.skyboxGreenProgress = 0;
        this.targetSkyboxGreenProgress = 0;
        this.skyboxRadius = 0; // <-- AJOUT: Pour stocker le rayon
        this.skyboxTransitionSpeed = 0.2; // ou récupérer depuis config

        // Propriété pour le nouveau sol extérieur
        this.outerGroundMesh = null; // <-- AJOUT

        // Récupérer mapSize depuis la config de CityManager (plus fiable)
        this.mapSize = this.experience.world?.cityManager?.config?.mapSize || 700; // Valeur par défaut si non trouvé
        //this.mapSize = 700; // Ou récupérez-la dynamiquement

        this.setSunLight();
        this.setAmbientLight();

        // Appels pour créer Skybox ET le nouveau sol
        this.renderSkybox();
        this.createOuterGround(); // <-- AJOUT
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048); // Qualité ok, peut être augmentée (4096) si besoin et si perf ok
        this.sunLight.shadow.normalBias = 0.05;
        this.sunLight.position.set(50, 80, 50); // Augmenter un peu la hauteur peut aider

        // --- Configuration cruciale de la Shadow Camera ---
        const shadowCamSize = this.mapSize / 2; // Rayon de la zone à couvrir
        // Ajustez ces valeurs pour couvrir votre 'mapSize'
        this.sunLight.shadow.camera.left = -shadowCamSize;
        this.sunLight.shadow.camera.right = shadowCamSize;
        this.sunLight.shadow.camera.top = shadowCamSize;
        this.sunLight.shadow.camera.bottom = -shadowCamSize;
        this.sunLight.shadow.camera.near = 0.5; // Par défaut souvent 0.5
        // Assurez-vous que 'far' est suffisant pour inclure la hauteur des bâtiments + la distance due à l'angle de la lumière
        this.sunLight.shadow.camera.far = 500; // Doit être assez grand pour la "profondeur" vue par la lumière

        // Très important: Mettre à jour la matrice de projection après changement
        this.sunLight.shadow.camera.updateProjectionMatrix();
        // --- Fin Configuration Shadow Camera ---

        this.scene.add(this.sunLight);

        // Optionnel : Helper pour visualiser la lumière directionnelle et ses ombres
        // const directionalLightCameraHelper = new THREE.CameraHelper(this.sunLight.shadow.camera)
        // this.scene.add(directionalLightCameraHelper)
        // const directionalLightHelper = new THREE.DirectionalLightHelper(this.sunLight, 0.2)
        // this.scene.add(directionalLightHelper)
    }

    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Lumière ambiante faible
        this.scene.add(this.ambientLight);
    }

	renderSkybox() {
        // Création du canvas principal
        this.skyboxCanvas = document.createElement('canvas');
        this.skyboxCanvas.width = 10240; // Ajustez si nécessaire
        this.skyboxCanvas.height = 5120; // Ajustez si nécessaire
        this.skyboxContext = this.skyboxCanvas.getContext('2d');

        // Création d'un canvas hors-écran pour les étoiles
        this.starsCanvas = document.createElement('canvas');
        this.starsCanvas.width = this.skyboxCanvas.width;
        this.starsCanvas.height = this.skyboxCanvas.height;
        const starsContext = this.starsCanvas.getContext('2d');

        // Dessiner les étoiles une seule fois sur le starsCanvas
        const numStars = 3000; // Ajustez si nécessaire
        for (let i = 0; i < numStars; i++) {
            const x = Math.random() * this.starsCanvas.width;
            const y = Math.random() * this.starsCanvas.height;
            const radius = Math.random() * 2.5 + 0.5;
            starsContext.beginPath();
            starsContext.arc(x, y, radius, 0, Math.PI * 2, false);
            starsContext.fillStyle = '#ffffff';
            starsContext.fill();
        }

        // Dessiner le gradient initial sur le skyboxCanvas
        const gradient = this.skyboxContext.createLinearGradient(0, 0, 0, this.skyboxCanvas.height);
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(0.45, '#0b0322'); // Couleurs initiales
        gradient.addColorStop(0.6, '#f73428');  // Couleurs initiales
        this.skyboxContext.fillStyle = gradient;
        this.skyboxContext.fillRect(0, 0, this.skyboxCanvas.width, this.skyboxCanvas.height);

        // Superposer le starsCanvas par-dessus le gradient
        this.skyboxContext.drawImage(this.starsCanvas, 0, 0);

        // Création de la texture et du skybox
        this.skyboxTexture = new THREE.CanvasTexture(this.skyboxCanvas);
        this.skyboxTexture.needsUpdate = true;

        // Définir et stocker le rayon de la skybox
        this.skyboxRadius = this.mapSize * 0.8; // Ex: 80% de mapSize, AJUSTEZ SI BESOIN
        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 60, 40); // <-- Utilise skyboxRadius

        const skyMaterial = new THREE.MeshBasicMaterial({
            map: this.skyboxTexture,
            side: THREE.BackSide,
        });
        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.renderOrder = -1;
        this.scene.add(this.skyBox);

        console.log(`Skybox créée avec rayon: ${this.skyboxRadius}`);

        //this.renderMoon();
    }

	createOuterGround() {
        if (this.outerGroundMesh) return; // Ne pas recréer si existe déjà

        const outerGroundRadius = this.skyboxRadius; // Légèrement plus grand que la skybox pour éviter les bords visibles
        const segments = 64; // Nombre de segments pour le cercle

        const outerGroundGeometry = new THREE.CircleGeometry(outerGroundRadius, segments);
        const outerGroundMaterial = new THREE.MeshStandardMaterial({
            color: 0x003300, // Vert très foncé
            metalness: 0.1,
            roughness: 0.9,
            side: THREE.DoubleSide // Au cas où on le verrait de dessous
        });

        this.outerGroundMesh = new THREE.Mesh(outerGroundGeometry, outerGroundMaterial);
        this.outerGroundMesh.rotation.x = -Math.PI / 2; // Orienter horizontalement
        // Positionner LÉGÈREMENT EN DESSOUS du sol de la ville (-0.01)
        this.outerGroundMesh.position.y = -0.1; // <-- AJUSTER si besoin
        this.outerGroundMesh.receiveShadow = true; // Reçoit les ombres
        this.outerGroundMesh.name = "OuterGround";

        this.scene.add(this.outerGroundMesh);
        console.log(`Sol extérieur (OuterGround) créé avec rayon: ${outerGroundRadius}`);
    }

    updateSkyboxTransition(delta, normalizedHealth) {
        // Assurez-vous que skyboxContext et skyboxTexture existent
         if (!this.skyboxContext || !this.skyboxTexture || !this.skyboxCanvas || !this.starsCanvas) {
            return;
        }
        // Calcule la cible de transition : 0 = santé max (ciel normal), 1 = santé min (ciel "vert")
        // L'ancien code utilisait "GreenProgress", adaptez si la logique est différente
        this.targetSkyboxGreenProgress = 1 - normalizedHealth;

        if (this.skyboxGreenProgress !== this.targetSkyboxGreenProgress) {
            const diff = this.targetSkyboxGreenProgress - this.skyboxGreenProgress;
            // Utilisez le delta de Experience pour une transition basée sur le temps réel
            const change = this.skyboxTransitionSpeed * delta;
            if (Math.abs(change) >= Math.abs(diff)) {
                this.skyboxGreenProgress = this.targetSkyboxGreenProgress;
            } else {
                this.skyboxGreenProgress += Math.sign(diff) * change;
            }

            const context = this.skyboxContext;
            context.clearRect(0, 0, this.skyboxCanvas.width, this.skyboxCanvas.height);

            const gradient = context.createLinearGradient(0, 0, 0, this.skyboxCanvas.height);
            gradient.addColorStop(0, '#000000');

            // Interpolation du gradient de la skybox (comme dans l'ancien code)
            const baseColor1 = new THREE.Color(0x0b0322);
            const targetColor1 = new THREE.Color(0x0c0100); // Ajustez la couleur cible si "vert" n'est plus le thème
            const currentColor1 = baseColor1.clone().lerp(targetColor1, this.skyboxGreenProgress);
            gradient.addColorStop(0.45, '#' + currentColor1.getHexString());

            const baseColor2 = new THREE.Color(0xf73428);
            const targetColor2 = new THREE.Color(0x950900); // Ajustez la couleur cible
            const currentColor2 = baseColor2.clone().lerp(targetColor2, this.skyboxGreenProgress);
            gradient.addColorStop(0.6, '#' + currentColor2.getHexString());

            context.fillStyle = gradient;
            context.fillRect(0, 0, this.skyboxCanvas.width, this.skyboxCanvas.height);
            // Redessiner les étoiles par-dessus le nouveau gradient
            context.drawImage(this.starsCanvas, 0, 0);
            this.skyboxTexture.needsUpdate = true;

            // --- Mise à jour d'autres éléments (Lumières, Lune, etc.) ---

            // Exemple: Transition pour la lumière directionnelle (soleil)
            // Note: Le code original modifiait aussi fog, eau, spotlight, herbe...
            // Adaptez ceci à ce qui est pertinent dans votre NOUVEAU jeu.
            const initialSunColor = new THREE.Color(0xffffff); // Couleur normale du soleil
            const targetSunColor = new THREE.Color(0x5b0000);  // Couleur cible (rougeâtre dans l'ex)
            const currentSunColor = initialSunColor.clone().lerp(targetSunColor, this.skyboxGreenProgress);
             if (this.sunLight) {
                 this.sunLight.color.copy(currentSunColor);
             }
             // Vous pourriez aussi ajuster l'ambientLight, le fog si vous en avez un, etc.
             // this.ambientLight.color.lerpColors(initialAmbientColor, targetAmbientColor, this.skyboxGreenProgress);
             // this.scene.fog.color.lerpColors(initialFogColor, targetFogColor, this.skyboxGreenProgress);


            // Transition progressive pour la lune
            if (this.moonMesh) {
                const initialMoonColor = new THREE.Color(0xffffff);
                const targetMoonColor  = new THREE.Color(0xff3325); // Ajustez la couleur cible
                const currentMoonColor = initialMoonColor.clone().lerp(targetMoonColor, this.skyboxGreenProgress);

                this.moonMesh.traverse((child) => {
                    if (child.isMesh && child.material && child.material.emissive) {
                        child.material.emissive.copy(currentMoonColor);
                        // Si vous voulez aussi changer la couleur de base (non émissive)
                        // child.material.color.copy(currentMoonColor);
                    }
                });
            }
            // --- Fin Mise à jour autres éléments ---
        }
    }

	destroy() {
        console.log("Nettoyage de l'environnement...");

        // Nettoyer Skybox
        if (this.skyBox) {
            this.scene.remove(this.skyBox);
            this.skyBox.geometry?.dispose();
            this.skyBox.material?.dispose();
            this.skyBox = null;
        }
        if (this.skyboxTexture) {
            this.skyboxTexture.dispose();
            this.skyboxTexture = null;
        }
        // Les canvas (skyboxCanvas, starsCanvas) seront nettoyés par le garbage collector

        // Nettoyer Lune
        if (this.moonMesh) {
             this.scene.remove(this.moonMesh);
             // Nettoyer géométrie/matériaux si OBJLoader ne le fait pas
             this.moonMesh.traverse(child => {
                 if (child.isMesh) {
                     child.geometry?.dispose();
                     child.material?.dispose();
                 }
             });
             this.moonMesh = null;
        }

        // Nettoyer OuterGround
        if (this.outerGroundMesh) {
            this.scene.remove(this.outerGroundMesh);
            this.outerGroundMesh.geometry?.dispose();
            this.outerGroundMesh.material?.dispose(); // Important car matériau unique
            this.outerGroundMesh = null;
        }

        // Nettoyer Lumières (si non géré ailleurs)
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        // Si vous aviez des helpers de lumière, les supprimer aussi
    }

    // Méthode update à ajouter ou modifier dans Environment.js
    update(deltaTime, /* Ajoutez ici la variable 'normalizedHealth' */ healthFactor = 1) {
        // deltaTime vient de Experience.js via World.js
        // healthFactor (entre 0 et 1) doit être passé depuis votre logique de jeu
        this.updateSkyboxTransition(deltaTime, healthFactor);
    }
}