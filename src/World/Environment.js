// src/World/Environment.js
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// === CORRECTION IMPORT ===
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
// ========================

export default class Environment {
    constructor(experience, world) {
        this.experience = experience;
        this.world = world; // Conservez la référence au monde
        this.scene = this.experience.scene;
        this.debug = this.experience.debug;
        this.config = this.world.cityManager.config; // Accès facile à la config

        this.mapSize = this.config.mapSize + 550;
        this.outerGroundDisplayRadius = 0; // Sera défini après renderSkybox

        // --- Propriétés Cycle Jour/Nuit ---
        this.cycleEnabled = this.config.dayNightCycleEnabled;
        this.dayDurationMs = this.config.dayDurationMinutes * 60 * 1000; // Durée en millisecondes
        this.cycleTime = (this.dayDurationMs * this.config.startTimeOfDay) % this.dayDurationMs; // Temps actuel dans le cycle (ms)
        this.sunDistance = 0; // Sera défini dans renderSkybox ou setSunLight
        // Couleurs/Intensités (ajustez selon vos préférences)
        this.sunColors = {
            dawn: new THREE.Color(0xffa500), // Lever (Orange)
            day: new THREE.Color(0xffffff),  // Journée (Blanc)
            dusk: new THREE.Color(0xff4500), // Coucher (Rouge-Orange)
            night: new THREE.Color(0x000033) // Nuit (Bleu très sombre) - Utilisé pour la teinte ambiante
        };
        this.sunIntensity = { day: 3.5, night: 0 };
        this.ambientColors = { day: new THREE.Color(0xb0c4de), night: new THREE.Color(0x111133) }; // Acier clair -> Bleu nuit
        this.ambientIntensity = { day: 0.6, night: 0.1 };
        this.skyGradientColors = {
             // [Top, Middle, Horizon]
            dawn: ['#111133', '#ff8c00', '#ff4500'],
            day: ['#87CEEB', '#B0E0E6', '#ADD8E6'], // SkyBlue, PowderBlue, LightBlue
            dusk: ['#111133', '#ff4500', '#8B0000'], // DarkRed à l'horizon
            night: ['#000000', '#00001a', '#000033'] // Noir -> Bleu très sombre
        };
        // --- Fin Propriétés Cycle ---

        // Propriétés Skybox existantes...
        this.skyboxCanvas = null; this.skyboxContext = null; this.starsCanvas = null; this.skyboxTexture = null; this.skyBox = null;
        this.moonMesh = null; // Vous pourriez vouloir animer la lune aussi !
        this.skyboxGreenProgress = 0; this.targetSkyboxGreenProgress = 0; this.skyboxRadius = 0;
        this.skyboxTransitionSpeed = 0.2;
        this.outerGroundMesh = null;

        this.setSunLight();
        this.setAmbientLight();
        this.renderSkybox(); // Définit this.skyboxRadius et met à jour sunDistance
        this.outerGroundDisplayRadius = this.skyboxRadius + 10;
        this.createOuterGround();

        // Appliquer l'état initial basé sur startTimeOfDay
        this.updateDayNightCycle(0); // Appeler une première fois avec delta = 0
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1); // Couleur/Intensité seront gérées dans update
        this.sunLight.castShadow = true;
        // Vos paramètres d'ombre existants
        this.sunLight.shadow.mapSize.set(4096, 4096);
        this.sunLight.shadow.normalBias = 0.05;
        // La position sera gérée dynamiquement
        // this.sunLight.position.set(200, 320, 200); // Position initiale gérée dans update
        this.sunDistance = this.mapSize * 0.7; // Distance du soleil par rapport au centre (0,0,0)

        const shadowCamSize = this.config.mapSize / 2; // Plus proche de la taille de la ville pour les ombres
        const shadowMargin = 250; // Marge
        this.sunLight.shadow.camera.left = -shadowCamSize - shadowMargin;
        this.sunLight.shadow.camera.right = shadowCamSize + shadowMargin;
        this.sunLight.shadow.camera.top = shadowCamSize + shadowMargin;
        this.sunLight.shadow.camera.bottom = -shadowCamSize - shadowMargin;
        this.sunLight.shadow.camera.near = 10; // Ajusté
        this.sunLight.shadow.camera.far = this.sunDistance * 2.5; // Doit englober la position max du soleil + la scène
        // Ne pas appeler updateProjectionMatrix ici, car la position initiale n'est pas définie
        this.scene.add(this.sunLight);
        // Optionnel: Ajouter une cible si nécessaire, sinon elle cible (0,0,0)
        // this.scene.add(this.sunLight.target);
    }

    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Couleur/Intensité seront gérées dans update
        this.scene.add(this.ambientLight);
    }

    // Modifiez renderSkybox pour définir skyboxRadius et sunDistance correctement
    renderSkybox() {
        // ... (début de renderSkybox: création canvas, étoiles etc.) ...
        // Définir le rayon basé sur la taille de la carte
        this.skyboxRadius = this.mapSize * 0.8; // Ou une autre valeur appropriée
        this.sunDistance = this.skyboxRadius * 0.9; // Lier la distance du soleil au rayon de la skybox
        console.log(`Rayon Skybox défini: ${this.skyboxRadius}, Distance Soleil: ${this.sunDistance}`);

        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 60, 40);
        // Le matériau sera mis à jour dynamiquement
        const skyMaterial = new THREE.MeshBasicMaterial({ map: this.skyboxTexture, side: THREE.BackSide });
        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.renderOrder = -1; // Pour être sûr qu'il est dessiné en premier
        this.scene.add(this.skyBox);

        // Créer le canvas des étoiles une seule fois
        this.starsCanvas = document.createElement('canvas');
        this.starsCanvas.width = 10240; // Utiliser une haute résolution
        this.starsCanvas.height = 5120;
        const starsContext = this.starsCanvas.getContext('2d');
        starsContext.fillStyle = 'black'; // Fond noir pour le canvas des étoiles
        starsContext.fillRect(0, 0, this.starsCanvas.width, this.starsCanvas.height);
        starsContext.fillStyle = '#ffffff';
        const numStars = 5000; // Plus d'étoiles
        for (let i = 0; i < numStars; i++) {
            const x = Math.random() * this.starsCanvas.width;
            const y = Math.random() * this.starsCanvas.height * 0.6; // Étoiles principalement dans la partie supérieure
            const radius = Math.random() * 1.5 + 0.5; // Petites étoiles
            starsContext.beginPath();
            starsContext.arc(x, y, radius, 0, Math.PI * 2);
            starsContext.fill();
        }

        // Initialiser le canvas principal (sera redessiné dans update)
        this.skyboxCanvas = document.createElement('canvas');
        this.skyboxCanvas.width = this.starsCanvas.width;
        this.skyboxCanvas.height = this.starsCanvas.height;
        this.skyboxContext = this.skyboxCanvas.getContext('2d');
        this.skyboxTexture = new THREE.CanvasTexture(this.skyboxCanvas);
        this.skyBox.material.map = this.skyboxTexture; // Assigner la texture au matériau

        console.log(`Skybox initialisée. Rayon: ${this.skyboxRadius}`);
    }

	updateDayNightCycle(deltaTime) {

		console.log(this.cycleEnabled);

        if (!this.cycleEnabled || this.dayDurationMs <= 0) return;

        // 1. Mettre à jour le temps du cycle
        this.cycleTime += deltaTime; // deltaTime est déjà en ms depuis Time.js
        this.cycleTime %= this.dayDurationMs; // Boucler le temps

        // 2. Calculer l'angle du cycle (0 à 2*PI)
        // 0 = minuit, PI/2 = lever, PI = midi, 3*PI/2 = coucher
        const angle = (this.cycleTime / this.dayDurationMs) * Math.PI * 2;

        // 3. Calculer la position du soleil
        // Rotation autour de l'axe Z (Est/Ouest sur X, Hauteur sur Y)
        const sunX = Math.cos(angle) * this.sunDistance;
        const sunY = Math.sin(angle) * this.sunDistance;
        const sunZ = 100; // Légèrement décalé sur Z pour un effet moins plat si désiré, ou 0
        this.sunLight.position.set(sunX, sunY, sunZ);
        // Assurez-vous que la cible est correcte (normalement 0,0,0 par défaut)
        // this.sunLight.target.position.set(0, 0, 0); // Si vous avez ajouté une cible manuellement

        // Mettre à jour la caméra d'ombre si nécessaire (si la cible ou la position change radicalement)
        // this.sunLight.shadow.camera.updateProjectionMatrix(); // Peut impacter les perfs si fait à chaque frame

        // 4. Déterminer la phase du cycle (pour transitions de couleur/intensité)
        const normalizedTime = this.cycleTime / this.dayDurationMs; // 0 à 1
        const dayFactor = Math.max(0, Math.sin(angle)); // 0 à 1 (intensité basée sur la hauteur du soleil)
        const dawnDuskFactor = Math.max(0, Math.sin(angle * 2)); // Pic au lever/coucher (pour la couleur chaude)

        // 5. Mettre à jour l'intensité des lumières
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunIntensity.night, this.sunIntensity.day, dayFactor);
        this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientIntensity.night, this.ambientIntensity.day, dayFactor);

        // 6. Mettre à jour la couleur des lumières (transitions plus complexes)
        let sunColorTarget = new THREE.Color();
        // Mélange Jour -> Coucher -> Nuit -> Lever -> Jour
        if (normalizedTime < 0.25) { // Nuit -> Lever (0 -> 0.25)
            sunColorTarget.lerpColors(this.sunColors.night, this.sunColors.dawn, normalizedTime * 4);
        } else if (normalizedTime < 0.5) { // Lever -> Jour (0.25 -> 0.5)
            sunColorTarget.lerpColors(this.sunColors.dawn, this.sunColors.day, (normalizedTime - 0.25) * 4);
        } else if (normalizedTime < 0.75) { // Jour -> Coucher (0.5 -> 0.75)
            sunColorTarget.lerpColors(this.sunColors.day, this.sunColors.dusk, (normalizedTime - 0.5) * 4);
        } else { // Coucher -> Nuit (0.75 -> 1)
            sunColorTarget.lerpColors(this.sunColors.dusk, this.sunColors.night, (normalizedTime - 0.75) * 4);
        }
        // Application de la couleur (peut être combinée avec l'effet health si besoin)
        this.sunLight.color.copy(sunColorTarget); // Utilisez .copy()

        // Couleur ambiante simple jour/nuit
        this.ambientLight.color.lerpColors(this.ambientColors.night, this.ambientColors.day, dayFactor);

        // 7. Mettre à jour la Skybox
        this.updateSkyboxAppearance(normalizedTime, dayFactor);

        // 8. Mettre à jour l'effet de santé (Optionnel: superposer à l'état jour/nuit)
        // Vous pouvez garder votre logique updateSkyboxTransition ou l'intégrer ici
        // en appliquant la teinte *après* avoir défini les couleurs jour/nuit.
        // Exemple simple : Teinter légèrement le soleil basé sur la santé
        const healthFactor = 1.0; // Remplacez par votre vraie valeur de santé normalisée (0-1)
        const baseSunColor = this.sunLight.color.clone(); // Copie de la couleur jour/nuit actuelle
        const healthTargetColor = new THREE.Color(0x5b0000); // Couleur cible pour faible santé
        this.sunLight.color.lerpColors(baseSunColor, healthTargetColor, 1 - healthFactor);
        // Faites de même pour ambientLight et skybox si nécessaire
    }

	updateSkyboxAppearance(normalizedTime, dayFactor) {
        if (!this.skyboxContext || !this.skyboxTexture || !this.skyboxCanvas || !this.starsCanvas) return;

        const ctx = this.skyboxContext;
        const w = this.skyboxCanvas.width;
        const h = this.skyboxCanvas.height;

        // Déterminer les couleurs de gradient cibles
        let gradientColorsTarget;
        if (normalizedTime < 0.25) { gradientColorsTarget = this.skyGradientColors.night; } // Nuit
        else if (normalizedTime < 0.35) { gradientColorsTarget = this.skyGradientColors.dawn; } // Lever
        else if (normalizedTime < 0.65) { gradientColorsTarget = this.skyGradientColors.day; } // Jour
        else if (normalizedTime < 0.75) { gradientColorsTarget = this.skyGradientColors.dusk; } // Coucher
        else { gradientColorsTarget = this.skyGradientColors.night; } // Retour nuit

       // Créer le gradient
       const gradient = ctx.createLinearGradient(0, 0, 0, h);
       // TODO: Implémenter une interpolation plus douce entre les ensembles de couleurs (dawn, day, dusk, night)
       // Pour l'instant, utilise les couleurs cibles directement
       gradient.addColorStop(0, gradientColorsTarget[0]);    // Couleur du haut (Zénith)
       gradient.addColorStop(0.6, gradientColorsTarget[1]);  // Couleur du milieu
       gradient.addColorStop(1, gradientColorsTarget[2]);    // Couleur de l'horizon

        // Dessiner le fond avec le gradient
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        // Dessiner les étoiles avec une opacité basée sur dayFactor
        // Plus il fait jour (dayFactor -> 1), plus les étoiles sont transparentes
        const starsOpacity = Math.max(0, Math.min(1, 1 - dayFactor * 2)); // Fade out plus rapide
        if (starsOpacity > 0.01) {
            ctx.globalAlpha = starsOpacity;
            ctx.drawImage(this.starsCanvas, 0, 0);
            ctx.globalAlpha = 1.0; // Réinitialiser l'alpha global
        }

        // Indiquer que la texture doit être mise à jour sur le GPU
        this.skyboxTexture.needsUpdate = true;
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
        /* const flatRadius = this.mapSize / 2 + this.mapSize / 6.36; // Rayon de la zone plate (ville)
        const transitionWidth = this.mapSize * 0.25; // Zone de transition plus large ?
        const noiseScale1 = 0.006; // Fréquence du bruit (plus petit = plus large)
        const noiseScale2 = 0.015; // Deuxième octave pour plus de détails
        const octave1Weight = 0.7; // Poids de la première octave
        const octave2Weight = 0.3; // Poids de la deuxième octave
        const hillAmplitude = 50; // Hauteur max des collines */

		// Rayon de la zone plate réduit pour démarrer la montée plus tôt
		const flatRadius = this.mapSize * 0.4; 
		// Zone de transition élargie pour permettre une montée plus progressive sur une plus grande distance
		const transitionWidth = this.mapSize * 0.4; 
		// Fréquence du bruit réduite pour étaler les détails sur une plus grande échelle (montagnes plus larges)
		const noiseScale1 = 0.002; 
		const noiseScale2 = 0.005; 
		// Ajustement des poids pour donner plus de détails dans la formation des reliefs
		const octave1Weight = 0.6; 
		const octave2Weight = 0.4; 
		// Amplitude augmentée pour obtenir des montagnes nettement plus hautes
		const hillAmplitude = 150; 

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
            color: 0x2e3407, // Vert foncé (ou 0x596c3d comme dans l'exemple?)
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
    update(deltaTime) {
		this.updateDayNightCycle(deltaTime);
    }
}