// src/World/Environment.js
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// === CORRECTION IMPORT ===
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
// ========================

export default class Environment {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug;
        // === Supprimé : this.noiseMaker ici, il sera créé dans createOuterGround ===

        // Récupérer mapSize (important pour le centre plat)
        this.mapSize = this.experience.world?.cityManager?.config?.mapSize || 700;

        this.outerGroundDisplayRadius = 0; // Sera défini après renderSkybox

        // Propriétés Skybox...
        this.skyboxCanvas = null;
        this.skyboxContext = null;
        this.starsCanvas = null;
        this.skyboxTexture = null;
        this.skyBox = null;
        this.moonMesh = null;
        this.skyboxGreenProgress = 0;
        this.targetSkyboxGreenProgress = 0;
        this.skyboxRadius = 0;
        this.skyboxTransitionSpeed = 0.2;
        this.outerGroundMesh = null;

        this.setSunLight();
        this.setAmbientLight();
        this.renderSkybox(); // Définit this.skyboxRadius
        this.outerGroundDisplayRadius = this.skyboxRadius - 10; // Lier le rayon visible à la skybox
        this.createOuterGround(); // Appel de la fonction mise à jour
    }

    // setSunLight() reste inchangé...
	setSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        this.sunLight.shadow.normalBias = 0.05;
        this.sunLight.position.set(50, 80, 50);
        const shadowCamSize = this.mapSize / 2; // Taille de la ville
        // Ajuster la caméra d'ombre pour couvrir un peu plus large à cause des collines
        const shadowMargin = 100; // Marge supplémentaire
        this.sunLight.shadow.camera.left = -shadowCamSize - shadowMargin;
        this.sunLight.shadow.camera.right = shadowCamSize + shadowMargin;
        this.sunLight.shadow.camera.top = shadowCamSize + shadowMargin;
        this.sunLight.shadow.camera.bottom = -shadowCamSize - shadowMargin;
        this.sunLight.shadow.camera.near = 0.5;
        // Augmenter far pour inclure les collines et la position de la lumière
        this.sunLight.shadow.camera.far = this.sunLight.position.y + 100;
        this.sunLight.shadow.camera.updateProjectionMatrix();
        this.scene.add(this.sunLight);
    }

    // setAmbientLight() reste inchangé...
    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);
    }

    // renderSkybox() reste inchangé...
    renderSkybox() {
        this.skyboxCanvas = document.createElement('canvas');
        this.skyboxCanvas.width = 10240;
        this.skyboxCanvas.height = 5120;
        this.skyboxContext = this.skyboxCanvas.getContext('2d');
        this.starsCanvas = document.createElement('canvas');
        this.starsCanvas.width = this.skyboxCanvas.width;
        this.starsCanvas.height = this.skyboxCanvas.height;
        const starsContext = this.starsCanvas.getContext('2d');
        const numStars = 3000;
        for (let i = 0; i < numStars; i++) {
            const x = Math.random() * this.starsCanvas.width;
            const y = Math.random() * this.starsCanvas.height;
            const radius = Math.random() * 2.5 + 0.5;
            starsContext.beginPath();
            starsContext.arc(x, y, radius, 0, Math.PI * 2, false);
            starsContext.fillStyle = '#ffffff';
            starsContext.fill();
        }
        const gradient = this.skyboxContext.createLinearGradient(0, 0, 0, this.skyboxCanvas.height);
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(0.45, '#0b0322');
        gradient.addColorStop(0.6, '#f73428');
        this.skyboxContext.fillStyle = gradient;
        this.skyboxContext.fillRect(0, 0, this.skyboxCanvas.width, this.skyboxCanvas.height);
        this.skyboxContext.drawImage(this.starsCanvas, 0, 0);
        this.skyboxTexture = new THREE.CanvasTexture(this.skyboxCanvas);
        this.skyboxTexture.needsUpdate = true;
        this.skyboxRadius = this.mapSize * 0.8;
        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 60, 40);
        const skyMaterial = new THREE.MeshBasicMaterial({ map: this.skyboxTexture, side: THREE.BackSide });
        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.renderOrder = -1;
        this.scene.add(this.skyBox);
        console.log(`Skybox créée avec rayon: ${this.skyboxRadius}`);
    }

    // ----- createOuterGround MODIFIÉ -----
    createOuterGround() {
        if (this.outerGroundMesh) return; // Évite de recréer
        if (this.outerGroundDisplayRadius <= 0) {
             console.error("Impossible de créer OuterGround: outerGroundDisplayRadius non défini (skyboxRadius?).");
             return;
        }

        // --- Paramètres (ajustez si nécessaire) ---
        // La géométrie doit être au moins aussi grande que le rayon de découpe
        const width = this.outerGroundDisplayRadius * 2.5; // Plus grand pour avoir de la marge
        const depth = this.outerGroundDisplayRadius * 2.5;
        const segments = 150; // Plus de segments pour un meilleur détail

        // Paramètres pour la zone plate et le relief (inspirés de TerrainRenderer)
        const flatRadius = this.mapSize / 2 + this.mapSize / 6.36; // Rayon de la zone plate (ville)
        const transitionWidth = this.mapSize * 0.25; // Zone de transition plus large ?
        const noiseScale1 = 0.006; // Fréquence du bruit (plus petit = plus large)
        const noiseScale2 = 0.015; // Deuxième octave pour plus de détails
        const octave1Weight = 0.7; // Poids de la première octave
        const octave2Weight = 0.3; // Poids de la deuxième octave
        const hillAmplitude = 50; // Hauteur max des collines

        // Rayon final du terrain visible (doit correspondre à outerGroundDisplayRadius)
        const terrainVisibleRadius = this.outerGroundDisplayRadius;
        // -----------------------------------------

        // Création de la géométrie Plane
        const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
        // === Rotation AVANT modification des hauteurs (Y devient la hauteur) ===
        geometry.rotateX(-Math.PI / 2);
        // =======================================================================

        const simplex = new SimplexNoise(); // Utilisation du SimplexNoise de Three.js
        const positions = geometry.attributes.position.array; // Accès direct au tableau

        // --- Fonction smoothStep locale ---
        function smoothStep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }
        // ---------------------------------

        // --- 1. Modification des hauteurs (Coordonnée Y après rotation) ---
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            const dist = Math.sqrt(x * x + z * z); // Distance au centre (0,0)

            let height = 0; // Hauteur par défaut (plat)

            // Calculer la hauteur si on est en dehors de la zone plate
            if (dist >= flatRadius) {
                const noise1 = simplex.noise(x * noiseScale1, z * noiseScale1);
                const noise2 = simplex.noise(x * noiseScale2, z * noiseScale2);
                const combinedNoise = octave1Weight * noise1 + octave2Weight * noise2;
                // Calculer le facteur de transition (0 = plat, 1 = pleine hauteur)
                const factor = smoothStep(flatRadius, flatRadius + transitionWidth, dist);
                height = hillAmplitude * combinedNoise * factor;
            }

            positions[i + 1] = height; // Appliquer la hauteur calculée à Y
        }
        // -----------------------------------------------------------------

        // --- 2. Découpe Circulaire (modification de la géométrie) ---
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            const dist = Math.sqrt(x * x + z * z);

            if (dist > terrainVisibleRadius) {
                // Ramener le point sur le cercle en conservant la direction
                const factor = terrainVisibleRadius / dist;
                positions[i] = x * factor;     // Clamp X
                positions[i + 2] = z * factor; // Clamp Z
                // Optionnel: Mettre la hauteur à 0 ou à la hauteur du bord pour éviter un rebord abrupt
                // positions[i + 1] = getTerrainHeightAtRadius(terrainVisibleRadius, x, z); // Plus complexe
                // Pour l'instant, on garde la hauteur calculée précédemment, ce qui peut créer une "falaise"
            }
        }
        // ------------------------------------------------------------

        geometry.attributes.position.needsUpdate = true; // Indiquer que la position a changé
        geometry.computeVertexNormals(); // Recalculer les normales pour l'éclairage

        // --- Matériau (sans alphaMap maintenant) ---
        const material = new THREE.MeshStandardMaterial({
            color: 0x465e39, // Vert foncé (ou 0x596c3d comme dans l'exemple?)
            metalness: 0.1,
            roughness: 0.9,
            // side: THREE.DoubleSide // Peut-être plus nécessaire si on ne voit jamais dessous
        });
        // -----------------------------------------

        this.outerGroundMesh = new THREE.Mesh(geometry, material);
        // Ajuster la position Y globale si nécessaire (ex: si le bruit est centré sur 0)
        // L'exemple mettait -60, ce qui suggère que la hauteur de base était bien plus basse.
        // Gardons -0.1 pour l'instant, la hauteur est relative à ce plan.
        this.outerGroundMesh.position.y = -0.1;
        this.outerGroundMesh.receiveShadow = true; // Le sol reçoit les ombres
        this.outerGroundMesh.name = "OuterGround_Hills_CircularGeom_FlatCenter";

        this.scene.add(this.outerGroundMesh);
        console.log(`Sol extérieur (géométrie circulaire, centre plat) créé. Rayon: ${terrainVisibleRadius}, Rayon plat: ${flatRadius}`);
    }
    // ------------------------------------

    // updateSkyboxTransition() reste inchangé...
    updateSkyboxTransition(delta, normalizedHealth) {
         if (!this.skyboxContext || !this.skyboxTexture || !this.skyboxCanvas || !this.starsCanvas) return;
        this.targetSkyboxGreenProgress = 1 - normalizedHealth;
        if (this.skyboxGreenProgress !== this.targetSkyboxGreenProgress) {
            const diff = this.targetSkyboxGreenProgress - this.skyboxGreenProgress;
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
            const baseColor1 = new THREE.Color(0x0b0322);
            const targetColor1 = new THREE.Color(0x0c0100);
            const currentColor1 = baseColor1.clone().lerp(targetColor1, this.skyboxGreenProgress);
            gradient.addColorStop(0.45, '#' + currentColor1.getHexString());
            const baseColor2 = new THREE.Color(0xf73428);
            const targetColor2 = new THREE.Color(0x950900);
            const currentColor2 = baseColor2.clone().lerp(targetColor2, this.skyboxGreenProgress);
            gradient.addColorStop(0.6, '#' + currentColor2.getHexString());
            context.fillStyle = gradient;
            context.fillRect(0, 0, this.skyboxCanvas.width, this.skyboxCanvas.height);
            context.drawImage(this.starsCanvas, 0, 0);
            this.skyboxTexture.needsUpdate = true;
            const initialSunColor = new THREE.Color(0xffffff);
            const targetSunColor = new THREE.Color(0x5b0000);
            const currentSunColor = initialSunColor.clone().lerp(targetSunColor, this.skyboxGreenProgress);
             if (this.sunLight) {
                 this.sunLight.color.copy(currentSunColor);
             }
            if (this.moonMesh) {
                const initialMoonColor = new THREE.Color(0xffffff);
                const targetMoonColor  = new THREE.Color(0xff3325);
                const currentMoonColor = initialMoonColor.clone().lerp(targetMoonColor, this.skyboxGreenProgress);
                this.moonMesh.traverse((child) => {
                    if (child.isMesh && child.material && child.material.emissive) {
                        child.material.emissive.copy(currentMoonColor);
                    }
                });
            }
        }
    }

    // destroy() reste inchangé...
    destroy() {
        console.log("Nettoyage de l'environnement...");
        // ... (Nettoyage Skybox, Lune, Lumières) ...
        if (this.skyBox) { /* ... */ this.scene.remove(this.skyBox); this.skyBox.geometry?.dispose(); this.skyBox.material?.dispose(); this.skyBox=null;}
        if (this.skyboxTexture) { /* ... */ this.skyboxTexture.dispose(); this.skyboxTexture=null;}
        if (this.moonMesh) { /* ... */ this.scene.remove(this.moonMesh); /* dispose geometry/material */ this.moonMesh=null;}

        if (this.outerGroundMesh) {
            this.scene.remove(this.outerGroundMesh);
            this.outerGroundMesh.geometry?.dispose();
            // Pas d'alphaMap à nettoyer
            this.outerGroundMesh.material?.dispose();
            this.outerGroundMesh = null;
        }

        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        console.log("Environnement nettoyé.");
    }

    // update() reste inchangé...
    update(deltaTime, healthFactor = 1) {
        this.updateSkyboxTransition(deltaTime, healthFactor);
    }
}