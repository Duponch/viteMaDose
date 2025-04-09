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
        const initialNormalizedTime = this.config.startTimeOfDay !== undefined ? this.config.startTimeOfDay : 0.25;
        this.cycleTime = (this.dayDurationMs * initialNormalizedTime) % this.dayDurationMs;
        this.sunDistance = 0; // Sera défini dans renderSkybox

        // --- Lumières Soleil & Ambiante ---
        this.sunColors = { /* ... (inchangé) ... */
            dawn: new THREE.Color(0xFFCA87),
            day: new THREE.Color(0xFFFFFF),
            dusk: new THREE.Color(0xFFB17A),
            night: new THREE.Color(0x435E7A)
        };
        this.sunIntensity = { day: 3.0, night: 0.01 };
        this.ambientColors = { /* ... (inchangé) ... */
            day: new THREE.Color(0xADCDE7),
            night: new THREE.Color(0x2B3A4F)
        };
        this.ambientIntensity = { day: 0.7, night: 0.1 };

        // --- Couleurs simples Jour/Nuit pour le Ciel ---
        this.dayZenithColor = new THREE.Color('#87CEEB');
        this.nightZenithColor = new THREE.Color('#00001a');
        this.dayMiddleColor = new THREE.Color('#ADD8E6');
        this.nightMiddleColor = new THREE.Color('#00002a');
        this.dayHorizonColor = new THREE.Color('#B0E0E6');
        this.nightHorizonColor = new THREE.Color('#0b1028');

        // --- Uniforms pour le Shader Skybox ---
        this.skyUniforms = { /* ... (inchangé) ... */
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
            uDayFactor: { value: 0.0 },
            uCurrentZenithColor: { value: new THREE.Color() },
            uCurrentMiddleColor: { value: new THREE.Color() },
            uCurrentHorizonColor: { value: new THREE.Color() },
            uSunInfluenceColor: { value: new THREE.Color(0xffccaa) }
         };

        // --- NOUVEAU : Propriétés de la Lune ---
        this.moonLight = null;
        this.moonMesh = null;
        this.moonDistance = 0; // Sera défini dans renderSkybox
        this.moonColor = new THREE.Color('#E8F0F5'); // Couleur blanc froid/légèrement bleu
        this.moonIntensity = { max: 0.2, min: 0.0 }; // Intensité max la nuit
        this.moonSize = 20; // Rayon du mesh de la lune
        // --------------------------------------

        this.vertexShaderCode = null;
        this.fragmentShaderCode = null;
        this.isInitialized = false;
        this.skyBox = null; this.starsMesh = null; this.outerGroundMesh = null; // moonMesh ajouté ci-dessus
        this.skyboxRadius = 0;

        // --- Appels d'initialisation ---
        this.setSunLight();
        this.setAmbientLight();
        this.setMoonLight(); // <- NOUVEL APPEL
    }

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

            this.renderSkybox(); // Initialise skyboxRadius, sunDistance, moonDistance
            this.outerGroundDisplayRadius = this.skyboxRadius + 10;
            this.createOuterGround();
            this.createStarsPoints(); // Déplacé après renderSkybox pour avoir skyboxRadius
            this.createMoonMesh(); // <- NOUVEL APPEL (après renderSkybox pour moonDistance)

            this.updateDayNightCycle(0); // Applique l'état initial (soleil, lune, ciel...)
            this.isInitialized = true;
            console.log("Environment: Initialisation terminée.");
        } catch (error) { console.error("Environment: Erreur init:", error); }
    }

    setSunLight() {
        // ... (code inchangé)
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
        // sunDistance est défini dans renderSkybox
        this.scene.add(this.sunLight);
    }

    setAmbientLight() {
        // ... (code inchangé)
         this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
         this.scene.add(this.ambientLight);
    }

    // --- NOUVELLE MÉTHODE : Initialisation lumière lune ---
    setMoonLight() {
        this.moonLight = new THREE.DirectionalLight(this.moonColor, this.moonIntensity.min);
        this.moonLight.castShadow = false; // La lune ne projette pas d'ombres fortes
        // Pas besoin de configurer les ombres ici
        // moonDistance est défini dans renderSkybox
        this.scene.add(this.moonLight);
        console.log("Moonlight initialisée.");
    }
    // ---------------------------------------------------

    renderSkybox() {
        if (!this.vertexShaderCode || !this.fragmentShaderCode) { console.error("renderSkybox: Shaders non chargés."); return; }

        // --- Définition des rayons et distances ---
        this.skyboxRadius = this.config.mapSize * 1.5; // Rayon de la sphère céleste
        this.sunDistance = this.skyboxRadius * 0.9;   // Distance du soleil depuis le centre
        this.moonDistance = this.skyboxRadius * 0.8;  // Distance de la lune (légèrement plus proche ?)
        // ----------------------------------------

        console.log(`Skybox: Rayon=${this.skyboxRadius.toFixed(0)}, DistSoleil=${this.sunDistance.toFixed(0)}, DistLune=${this.moonDistance.toFixed(0)}`);

        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 32, 15);
        const skyMaterial = new THREE.ShaderMaterial({ /* ... (inchangé) ... */
            vertexShader: this.vertexShaderCode,
            fragmentShader: this.fragmentShaderCode,
            uniforms: this.skyUniforms,
            side: THREE.BackSide,
            depthWrite: false
         });
        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.renderOrder = -1; // S'assurer qu'il est dessiné en premier
        this.scene.add(this.skyBox);

        // createStarsPoints() et createMoonMesh() sont appelés DANS initialize() APRÈS renderSkybox()

        console.log(`Skybox Shader créée.`);
    }

    // --- NOUVELLE MÉTHODE : Création mesh lune ---
    createMoonMesh() {
        if (this.moonMesh) return; // Evite recréation
        if (this.moonDistance <= 0) {
             console.error("Impossible de créer le mesh de la Lune: moonDistance non définie (renderSkybox doit être appelée avant).");
             return;
        }

        const moonGeometry = new THREE.SphereGeometry(this.moonSize, 16, 16); // Taille et segments
        // Utilisation d'un matériau basique pour qu'elle soit visible même sans lumière directe forte
        const moonMaterial = new THREE.MeshBasicMaterial({
            color: this.moonColor, // Même couleur que la lumière pour cohérence
            depthWrite: false      // Pour éviter conflits de profondeur avec objets lointains/skybox
        });

        this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moonMesh.renderOrder = 0; // Dessiné après skybox (-1) mais avant le reste (par défaut)
        this.moonMesh.visible = false; // Invisible initialement
        this.scene.add(this.moonMesh);
        console.log(`Moon Mesh créé (taille: ${this.moonSize}).`);
    }
    // ---------------------------------------------

    createStarsPoints() {
        // ... (code inchangé) ...
        if (this.starsMesh) return;
        const starCount = 10000; const positions = new Float32Array(starCount * 3); const colors = new Float32Array(starCount * 3); const baseColor = new THREE.Color(0xffffff);
        for (let i = 0; i < starCount; i++) { const radius = this.skyboxRadius + Math.random() * 500; const theta = 2 * Math.PI * Math.random(); const phi = Math.acos(2 * Math.random() - 1); const x = radius * Math.sin(phi) * Math.cos(theta); const y = radius * Math.sin(phi) * Math.sin(theta); const z = radius * Math.cos(phi); positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z; const intensity = Math.random() * 0.5 + 0.5; colors[i * 3] = baseColor.r * intensity; colors[i * 3 + 1] = baseColor.g * intensity; colors[i * 3 + 2] = baseColor.b * intensity; }
        const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const starsMaterial = new THREE.PointsMaterial({ size: 3, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.0, depthWrite: false });
        this.starsMesh = new THREE.Points(starsGeometry, starsMaterial); this.scene.add(this.starsMesh);
        console.log("Stars Points créés.");
    }

    updateDayNightCycle(deltaTime) {
        if (!this.isInitialized || !this.cycleEnabled || this.dayDurationMs <= 0) return;

        this.cycleTime += deltaTime;
        this.cycleTime %= this.dayDurationMs;
        const normalizedTime = this.cycleTime / this.dayDurationMs;

        // --- Position Soleil ---
        const sunAngle = normalizedTime * Math.PI * 2 - Math.PI / 2; // Angle basé sur le temps normalisé
        const sunX = Math.cos(sunAngle) * this.sunDistance;
        const sunY = Math.sin(sunAngle) * this.sunDistance;
        const sunZ = this.sunDistance * 0.1; // Légèrement décalé pour varier
        this.sunLight.position.set(sunX, sunY, sunZ);

        // --- NOUVEAU : Position Lune (opposée au soleil) ---
        const moonAngle = sunAngle + Math.PI; // Ajoute 180 degrés à l'angle du soleil
        const moonX = Math.cos(moonAngle) * this.moonDistance;
        const moonY = Math.sin(moonAngle) * this.moonDistance;
        const moonZ = -this.moonDistance * 0.1; // Position Z opposée à celle du soleil
        if (this.moonLight) this.moonLight.position.set(moonX, moonY, moonZ);
        if (this.moonMesh) this.moonMesh.position.set(moonX, moonY, moonZ); // Positionne aussi le mesh
        // ----------------------------------------------------

        // --- Calcul du facteur Jour/Nuit ---
        const sunHeightFactor = sunY / this.sunDistance; // Hauteur normalisée du soleil (-1 à +1)
        const dayNightFactor = THREE.MathUtils.smoothstep(sunHeightFactor, -0.15, 0.15); // 0=Nuit, 1=Jour

        // --- Mise à jour Lumière Soleil ---
        // ... (code inchangé)
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunIntensity.night, this.sunIntensity.day, dayNightFactor);
        let sunColorTarget = new THREE.Color();
        const phaseTime = normalizedTime * 4;
        if (normalizedTime < 0.25) { sunColorTarget.lerpColors(this.sunColors.night, this.sunColors.dawn, phaseTime); }
        else if (normalizedTime < 0.5) { sunColorTarget.lerpColors(this.sunColors.dawn, this.sunColors.day, phaseTime - 1); }
        else if (normalizedTime < 0.75) { sunColorTarget.lerpColors(this.sunColors.day, this.sunColors.dusk, phaseTime - 2); }
        else { sunColorTarget.lerpColors(this.sunColors.dusk, this.sunColors.night, phaseTime - 3); }
        this.sunLight.color.copy(sunColorTarget);


        // --- Mise à jour Lumière Ambiante ---
        // ... (code inchangé)
         this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientIntensity.night, this.ambientIntensity.day, dayNightFactor);
         this.ambientLight.color.lerpColors(this.ambientColors.night, this.ambientColors.day, dayNightFactor);

        // --- NOUVEAU : Mise à jour Lumière Lune & Mesh ---
        const nightFactor = 1.0 - dayNightFactor; // Facteur inverse : 1=Nuit, 0=Jour
        if (this.moonLight) {
            // Interpole l'intensité de la lune en fonction de 'nightFactor'
            this.moonLight.intensity = THREE.MathUtils.lerp(this.moonIntensity.min, this.moonIntensity.max, nightFactor);
        }
        if (this.moonMesh) {
            // Rend le mesh de la lune visible seulement quand il fait assez nuit
            this.moonMesh.visible = nightFactor > 0.1; // Petit seuil pour éviter l'affichage au crépuscule/aube
        }
        // --------------------------------------------------

        // --- Mise à jour Ciel (Skybox Shader) ---
        // ... (code inchangé - interpolation simple)
         this.skyUniforms.uCurrentZenithColor.value.lerpColors(this.nightZenithColor, this.dayZenithColor, dayNightFactor);
         this.skyUniforms.uCurrentMiddleColor.value.lerpColors(this.nightMiddleColor, this.dayMiddleColor, dayNightFactor);
         this.skyUniforms.uCurrentHorizonColor.value.lerpColors(this.nightHorizonColor, this.dayHorizonColor, dayNightFactor);
         this.skyUniforms.uSunDirection.value.copy(this.sunLight.position).normalize();
         this.skyUniforms.uDayFactor.value = dayNightFactor;

        // --- Mise à jour Étoiles ---
        // ... (code inchangé)
         if (this.starsMesh) {
             const starsOpacity = 1.0 - dayNightFactor;
             this.starsMesh.material.opacity = THREE.MathUtils.smoothstep(starsOpacity, 0.0, 0.8);
             this.starsMesh.visible = this.starsMesh.material.opacity > 0.01;
         }
    }

    createOuterGround() {
        // ... (code inchangé)
        if (this.outerGroundMesh) return; // Évite de recréer
        if (this.outerGroundDisplayRadius <= 0) {
             console.error("Impossible de créer OuterGround: outerGroundDisplayRadius non défini (skyboxRadius?).");
             return;
        }
        const width = this.outerGroundDisplayRadius * 2.5;
        const depth = this.outerGroundDisplayRadius * 2.5;
        const segments = 150;
		const flatRadius = this.mapSize * 0.4;
		const transitionWidth = this.mapSize * 0.4;
		const noiseScale1 = 0.002;
		const noiseScale2 = 0.005;
		const octave1Weight = 0.6;
		const octave2Weight = 0.4;
		const hillAmplitude = 150;
        const terrainVisibleRadius = this.outerGroundDisplayRadius;
        const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        const simplex = new SimplexNoise();
        const positions = geometry.attributes.position.array;
        function smoothStep(edge0, edge1, x) { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); }
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]; const z = positions[i + 2]; const dist = Math.sqrt(x * x + z * z);
            let height = 0;
            if (dist >= flatRadius) {
                const noise1 = simplex.noise(x * noiseScale1, z * noiseScale1);
                const noise2 = simplex.noise(x * noiseScale2, z * noiseScale2);
                const combinedNoise = octave1Weight * noise1 + octave2Weight * noise2;
                const factor = smoothStep(flatRadius, flatRadius + transitionWidth, dist);
                height = hillAmplitude * combinedNoise * factor;
            }
            positions[i + 1] = height;
        }
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]; const z = positions[i + 2]; const dist = Math.sqrt(x * x + z * z);
            if (dist > terrainVisibleRadius) {
                const factor = terrainVisibleRadius / dist;
                positions[i] = x * factor; positions[i + 2] = z * factor;
            }
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0x2e3407, metalness: 0.1, roughness: 0.9 });
        this.outerGroundMesh = new THREE.Mesh(geometry, material);
        this.outerGroundMesh.position.y = -0.1;
        this.outerGroundMesh.receiveShadow = true;
        this.outerGroundMesh.name = "OuterGround_Hills_CircularGeom_FlatCenter";
        this.scene.add(this.outerGroundMesh);
        console.log(`Sol extérieur (géométrie circulaire, centre plat) créé. Rayon: ${terrainVisibleRadius}, Rayon plat: ${flatRadius}`);
    }

    destroy() {
        console.log("Nettoyage de l'environnement (Shader Skybox, Lune)...");
        // Lumières
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        if (this.moonLight) this.scene.remove(this.moonLight); // <- NOUVEAU

        // Skybox
        if (this.skyBox) { /* ... (nettoyage inchangé) ... */
             this.scene.remove(this.skyBox);
             this.skyBox.geometry?.dispose();
             this.skyBox.material?.dispose();
             this.skyBox = null;
         }

        // Étoiles
        if (this.starsMesh) { /* ... (nettoyage inchangé) ... */
             this.scene.remove(this.starsMesh);
             this.starsMesh.geometry?.dispose();
             this.starsMesh.material?.dispose();
             this.starsMesh = null;
         }

        // Sol extérieur
        if (this.outerGroundMesh) { /* ... (nettoyage inchangé) ... */
             this.scene.remove(this.outerGroundMesh);
             this.outerGroundMesh.geometry?.dispose();
             this.outerGroundMesh.material?.dispose();
             this.outerGroundMesh = null;
         }

        // --- NOUVEAU : Nettoyage Lune ---
        if (this.moonMesh) {
            this.scene.remove(this.moonMesh);
            this.moonMesh.geometry?.dispose();
            this.moonMesh.material?.dispose();
            this.moonMesh = null;
        }
        // -------------------------------

        // Nullification des références
        this.sunLight = null;
        this.ambientLight = null;
        this.moonLight = null; // <- NOUVEAU

        console.log("Environnement nettoyé.");
    }

    update(deltaTime) {
        // Appeler updateDayNightCycle seulement si initialisé
        if (this.isInitialized) {
            this.updateDayNightCycle(deltaTime);
        }
    }
}