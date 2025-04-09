// src/World/Environment.js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export default class Environment {
    constructor(experience, world) {
        this.experience = experience;
        this.world = world;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug;
        this.config = this.world.cityManager.config;

        this.mapSize = this.config.mapSize + 550;
        this.outerGroundDisplayRadius = 0;

        // --- Propriétés Cycle Jour/Nuit ---
        this.cycleEnabled = this.config.dayNightCycleEnabled;
        this.dayDurationMs = this.config.dayDurationMinutes * 60 * 1000;
        const initialNormalizedTime = this.config.startTimeOfDay !== undefined ? this.config.startTimeOfDay : 0.25; // 0.25 = Lever
        this.cycleTime = (this.dayDurationMs * initialNormalizedTime) % this.dayDurationMs;
        this.sunDistance = 0;

        // --- Lumières Soleil & Ambiante ---
        // (Vous pouvez garder les couleurs d'aube/crépuscule pour le soleil si vous voulez,
        // ou les simplifier aussi en interpolant juste entre blanc et bleu nuit)
        this.sunColors = {
            dawn: new THREE.Color(0xFFCA87), // Utilisé pour la transition de couleur du soleil
            day: new THREE.Color(0xFFFFFF),  // Soleil blanc à midi
            dusk: new THREE.Color(0xFFB17A), // Utilisé pour la transition de couleur du soleil
            night: new THREE.Color(0x435E7A) // Couleur du soleil la nuit (très faible intensité)
        };
        this.sunIntensity = { day: 3.0, night: 0.01 }; // Légère intensité nuit pour couleur
        this.ambientColors = {
            day: new THREE.Color(0xADCDE7),
            night: new THREE.Color(0x2B3A4F)
        };
        this.ambientIntensity = { day: 0.7, night: 0.1 };

        // --- NOUVEAU : Couleurs simples Jour/Nuit pour le Ciel ---
        // Zénith (haut du ciel)
        this.dayZenithColor = new THREE.Color('#87CEEB');   // Bleu ciel
        this.nightZenithColor = new THREE.Color('#00001a'); // Bleu très sombre / noir

        // Milieu (entre zénith et horizon)
        this.dayMiddleColor = new THREE.Color('#ADD8E6');   // Bleu clair
        this.nightMiddleColor = new THREE.Color('#00002a'); // Un peu moins sombre

        // Horizon
        this.dayHorizonColor = new THREE.Color('#B0E0E6');  // Bleu très clair / poudré
        this.nightHorizonColor = new THREE.Color('#0b1028'); // Couleur nuit horizon
        // ------------------------------------------------------

        // --- Uniforms pour le Shader Skybox ---
        this.skyUniforms = {
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
            uDayFactor: { value: 0.0 },
            uCurrentZenithColor: { value: new THREE.Color() },
            uCurrentMiddleColor: { value: new THREE.Color() },
            uCurrentHorizonColor: { value: new THREE.Color() },
            uSunInfluenceColor: { value: new THREE.Color(0xffccaa) }
        };
        // -----------------------------------

        // Le reste du constructeur reste identique...
        this.vertexShaderCode = null;
        this.fragmentShaderCode = null;
        this.isInitialized = false;
        this.skyBox = null; this.starsMesh = null; this.outerGroundMesh = null; this.moonMesh = null;
        this.skyboxRadius = 0;
        this.setSunLight();
        this.setAmbientLight();
    }

    // initialize() reste identique...
    async initialize() {
        console.log("Environment: Initialisation asynchrone...");
        try {
            const [vertexResponse, fragmentResponse] = await Promise.all([
                fetch('src/World/Shaders/skyVertex.glsl'),
                fetch('src/World/Shaders/skyFragment.glsl')
            ]);
            if (!vertexResponse.ok || !fragmentResponse.ok) { throw new Error(`Erreur chargement shaders: VS=${vertexResponse.status}, FS=${fragmentResponse.status}`); }
            this.vertexShaderCode = await vertexResponse.text();
            this.fragmentShaderCode = await fragmentResponse.text();
            console.log("Environment: Shaders chargés.");
            this.renderSkybox();
            this.outerGroundDisplayRadius = this.skyboxRadius + 10;
            this.createOuterGround();
            this.updateDayNightCycle(0); // Applique l'état initial
            this.isInitialized = true;
            console.log("Environment: Initialisation terminée.");
        } catch (error) { console.error("Environment: Erreur init:", error); }
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = this.config.mapSize * 2;
        this.sunLight.shadow.bias = -0.002;
        this.sunLight.shadow.normalBias = 0.02;
        const mapSize = this.config.mapSize;
        const shadowCamSize = mapSize * 0.6;
        this.sunLight.shadow.camera.left = -shadowCamSize;
        this.sunLight.shadow.camera.right = shadowCamSize;
        this.sunLight.shadow.camera.top = shadowCamSize;
        this.sunLight.shadow.camera.bottom = -shadowCamSize;
        this.sunLight.shadow.camera.updateProjectionMatrix();
        this.sunDistance = this.config.mapSize * 0.8; // Ajuster si besoin
        this.scene.add(this.sunLight);
    }

    // setAmbientLight() reste identique...
    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(this.ambientLight);
    }

    renderSkybox() {
        if (!this.vertexShaderCode || !this.fragmentShaderCode) { console.error("renderSkybox: Shaders non chargés."); return; }
        this.skyboxRadius = this.config.mapSize * 1.5;
        this.sunDistance = this.skyboxRadius * 0.9;
        console.log(`Skybox: Rayon=${this.skyboxRadius.toFixed(0)}, DistSoleil=${this.sunDistance.toFixed(0)}`);
        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 32, 15);
        const skyMaterial = new THREE.ShaderMaterial({
            vertexShader: this.vertexShaderCode,
            fragmentShader: this.fragmentShaderCode,
            uniforms: this.skyUniforms,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.renderOrder = -1;
        this.scene.add(this.skyBox);
        this.createStarsPoints();
        console.log(`Skybox Shader créée.`);
    }

    createStarsPoints() { /* ... (inchangé) ... */
        const starCount = 10000; const positions = new Float32Array(starCount * 3); const colors = new Float32Array(starCount * 3); const baseColor = new THREE.Color(0xffffff);
        for (let i = 0; i < starCount; i++) { const radius = this.skyboxRadius + Math.random() * 500; const theta = 2 * Math.PI * Math.random(); const phi = Math.acos(2 * Math.random() - 1); const x = radius * Math.sin(phi) * Math.cos(theta); const y = radius * Math.sin(phi) * Math.sin(theta); const z = radius * Math.cos(phi); positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z; const intensity = Math.random() * 0.5 + 0.5; colors[i * 3] = baseColor.r * intensity; colors[i * 3 + 1] = baseColor.g * intensity; colors[i * 3 + 2] = baseColor.b * intensity; }
        const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const starsMaterial = new THREE.PointsMaterial({ size: 3, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.0, depthWrite: false });
        this.starsMesh = new THREE.Points(starsGeometry, starsMaterial); this.scene.add(this.starsMesh);
     }

	 updateDayNightCycle(deltaTime) {
        if (!this.isInitialized || !this.cycleEnabled || this.dayDurationMs <= 0) return;

        this.cycleTime += deltaTime;
        this.cycleTime %= this.dayDurationMs;
        const normalizedTime = this.cycleTime / this.dayDurationMs;

        const sunAngle = normalizedTime * Math.PI * 2 - Math.PI / 2;
        const sunX = Math.cos(sunAngle) * this.sunDistance;
        const sunY = Math.sin(sunAngle) * this.sunDistance;
        const sunZ = 0;
        this.sunLight.position.set(sunX, sunY, sunZ);

        // --- Calcul du facteur Jour/Nuit ---
        // 0.0 la nuit, 1.0 à midi, avec transition douce via smoothstep
        // Basé sur la hauteur normalisée du soleil (-1 la nuit, 0 horizon, +1 midi)
        const sunHeightFactor = sunY / this.sunDistance;
        const dayNightFactor = THREE.MathUtils.smoothstep(sunHeightFactor, -0.15, 0.15); // Transition douce autour de l'horizon

        // --- Mise à jour Lumière Soleil ---
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunIntensity.night, this.sunIntensity.day, dayNightFactor);
        // Interpolation couleur soleil (peut rester telle quelle ou être simplifiée)
        let sunColorTarget = new THREE.Color();
        const phaseTime = normalizedTime * 4;
        if (normalizedTime < 0.25) { sunColorTarget.lerpColors(this.sunColors.night, this.sunColors.dawn, phaseTime); }
        else if (normalizedTime < 0.5) { sunColorTarget.lerpColors(this.sunColors.dawn, this.sunColors.day, phaseTime - 1); }
        else if (normalizedTime < 0.75) { sunColorTarget.lerpColors(this.sunColors.day, this.sunColors.dusk, phaseTime - 2); }
        else { sunColorTarget.lerpColors(this.sunColors.dusk, this.sunColors.night, phaseTime - 3); }
        this.sunLight.color.copy(sunColorTarget);


        // --- Mise à jour Lumière Ambiante ---
        this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientIntensity.night, this.ambientIntensity.day, dayNightFactor);
        this.ambientLight.color.lerpColors(this.ambientColors.night, this.ambientColors.day, dayNightFactor);


        // --- Interpolation SIMPLE et DIRECTE des couleurs du ciel ---
        // Utilise le dayNightFactor (0 la nuit, 1 le jour) pour interpoler
        this.skyUniforms.uCurrentZenithColor.value.lerpColors(this.nightZenithColor, this.dayZenithColor, dayNightFactor);
        this.skyUniforms.uCurrentMiddleColor.value.lerpColors(this.nightMiddleColor, this.dayMiddleColor, dayNightFactor);
        this.skyUniforms.uCurrentHorizonColor.value.lerpColors(this.nightHorizonColor, this.dayHorizonColor, dayNightFactor);
        // -------------------------------------------------------------


        // Mettre à jour les uniforms restants
        this.skyUniforms.uSunDirection.value.copy(this.sunLight.position).normalize();
        this.skyUniforms.uDayFactor.value = dayNightFactor; // Utiliser dayNightFactor pour le halo solaire aussi

        // Mise à jour Étoiles
        if (this.starsMesh) {
            const starsOpacity = 1.0 - dayNightFactor; // Inverse du facteur jour/nuit
            this.starsMesh.material.opacity = THREE.MathUtils.smoothstep(starsOpacity, 0.0, 0.8); // Apparition/disparition douce
            this.starsMesh.visible = this.starsMesh.material.opacity > 0.01;
        }
    }

    // --- SUPPRIMER la fonction updateSkyboxAppearance ---
    // updateSkyboxAppearance(normalizedTime, dayFactor) { ... }

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

    destroy() {
        console.log("Nettoyage de l'environnement (Shader Skybox)...");
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);

        // Nettoyer Skybox Shader
        if (this.skyBox) {
             this.scene.remove(this.skyBox);
             this.skyBox.geometry?.dispose();
             this.skyBox.material?.dispose(); // Important pour ShaderMaterial
             this.skyBox = null;
        }

        // Nettoyer Étoiles Points
        if (this.starsMesh) {
            this.scene.remove(this.starsMesh);
            this.starsMesh.geometry?.dispose();
            this.starsMesh.material?.dispose();
            this.starsMesh = null;
        }

        // Nettoyer OuterGround (Identique)
        if (this.outerGroundMesh) {
             this.scene.remove(this.outerGroundMesh);
             this.outerGroundMesh.geometry?.dispose();
             this.outerGroundMesh.material?.dispose();
             this.outerGroundMesh = null;
        }

        if (this.moonMesh) { /* ... Nettoyage ... */ }

        console.log("Environnement nettoyé.");
    }

    update(deltaTime) {
        // Appeler updateDayNightCycle seulement si initialisé
        if (this.isInitialized) {
            this.updateDayNightCycle(deltaTime);
        }
        // La logique de transition de santé (si séparée) irait ici
    }
}