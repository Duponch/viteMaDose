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
        this.cycleTime = (this.dayDurationMs * (this.config.startTimeOfDay || 0.25)) % this.dayDurationMs;
        this.sunDistance = 0;
        // Lumières (inchangé)
        this.sunColors = {
            dawn: new THREE.Color(0xffa500), day: new THREE.Color(0xffffff),
            dusk: new THREE.Color(0xff4500), night: new THREE.Color(0x000033)
        };
        this.sunIntensity = { day: 3.5, night: 0 };
        this.ambientColors = { day: new THREE.Color(0xb0c4de), night: new THREE.Color(0x111133) };
        this.ambientIntensity = { day: 0.6, night: 0.1 };

        // --- NOUVEAU : Couleurs de BASE pour le gradient du ciel ---
        this.skyGradientBaseColors = {
             // [Zénith, Milieu, Horizon] - Important : Objets THREE.Color
             night: [new THREE.Color('#000000'), new THREE.Color('#00001a'), new THREE.Color('#000033')],
             dawn:  [new THREE.Color('#111133'), new THREE.Color('#ff8c00'), new THREE.Color('#ff4500')],
             day:   [new THREE.Color('#87CEEB'), new THREE.Color('#B0E0E6'), new THREE.Color('#ADD8E6')],
             dusk:  [new THREE.Color('#111133'), new THREE.Color('#ff4500'), new THREE.Color('#8B0000')]
        };
        // --- FIN NOUVEAU ---

        // --- Uniforms MODIFIÉS pour le Shader Skybox ---
        this.skyUniforms = {
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
            uDayFactor: { value: 0.0 }, // Gardé pour l'effet solaire
            // Supprimé : uZenithColorDay, uHorizonColorDay, uZenithColorNight, uHorizonColorNight
            // NOUVEAU : Couleurs courantes interpolées
            uCurrentZenithColor: { value: new THREE.Color() },
            uCurrentMiddleColor: { value: new THREE.Color() },
            uCurrentHorizonColor: { value: new THREE.Color() },
            // Gardé
            uSunInfluenceColor: { value: new THREE.Color(0xffccaa) }
        };
        // --- Fin Uniforms MODIFIÉS ---

        // Propriétés chargement shader (inchangé)
        this.vertexShaderCode = null;
        this.fragmentShaderCode = null;
        this.isInitialized = false;

        // Variables objets (inchangé)
        this.skyBox = null; this.starsMesh = null; this.outerGroundMesh = null; this.moonMesh = null;
        this.skyboxRadius = 0;

        // Configuration synchrone (inchangé)
        this.setSunLight();
        this.setAmbientLight();
    }

    // --- initialize() MODIFIÉ pour les nouveaux chemins ---
    async initialize() {
        console.log("Environment: Initialisation asynchrone...");
        try {
            const [vertexResponse, fragmentResponse] = await Promise.all([
                fetch('src/World/Shaders/skyVertex.glsl'),   // Vérifiez ce chemin
                fetch('src/World/Shaders/skyFragment.glsl') // Vérifiez ce chemin
            ]);

            if (!vertexResponse.ok || !fragmentResponse.ok) { /* ... erreur ... */ throw new Error(`HTTP error! status: VS=${vertexResponse.status}, FS=${fragmentResponse.status}`);}

            this.vertexShaderCode = await vertexResponse.text();
            this.fragmentShaderCode = await fragmentResponse.text();
            console.log("Environment: Shaders chargés.");

            this.renderSkybox(); // Crée skyBox (avec nouveau shader) et starsMesh
            this.outerGroundDisplayRadius = this.skyboxRadius + 10;
            this.createOuterGround();
            this.updateDayNightCycle(0); // Applique état initial (maintenant avec interpolation couleur)

            this.isInitialized = true;
            console.log("Environment: Initialisation terminée.");
        } catch (error) { console.error("Environment: Erreur init:", error); }
    }

    setSunLight() {
        // ... (code identique à avant) ...
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048); // Taille réduite pour perfs
        this.sunLight.shadow.normalBias = 0.05;
        this.sunDistance = this.mapSize * 0.7; // Défini ici ou dans renderSkybox

        const shadowCamSize = this.config.mapSize / 2;
        const shadowMargin = 250;
        this.sunLight.shadow.camera.left = -shadowCamSize - shadowMargin;
        this.sunLight.shadow.camera.right = shadowCamSize + shadowMargin;
        this.sunLight.shadow.camera.top = shadowCamSize + shadowMargin;
        this.sunLight.shadow.camera.bottom = -shadowCamSize - shadowMargin;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = this.sunDistance * 2.5;
        this.scene.add(this.sunLight);
    }

    setAmbientLight() {
        // ... (code identique à avant) ...
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(this.ambientLight);
    }

    renderSkybox() {
        // Utilise this.vertexShaderCode et this.fragmentShaderCode chargés
        if (!this.vertexShaderCode || !this.fragmentShaderCode) { /* ... erreur ... */ console.error("renderSkybox: Shaders non chargés."); return; }
        this.skyboxRadius = this.mapSize * 0.8;
        this.sunDistance = this.skyboxRadius * 0.9;
        console.log(`Skybox: Rayon=${this.skyboxRadius}, DistSoleil=${this.sunDistance}`);
        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 32, 15);
        const skyMaterial = new THREE.ShaderMaterial({
            vertexShader: this.vertexShaderCode, fragmentShader: this.fragmentShaderCode,
            uniforms: this.skyUniforms, // Utilise les uniforms mis à jour
            side: THREE.BackSide, depthWrite: false
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
        const angle = (this.cycleTime / this.dayDurationMs) * Math.PI * 2;
        const normalizedTime = this.cycleTime / this.dayDurationMs; // 0 à 1

        // Position Soleil (inchangé)
        const sunX = Math.cos(angle) * this.sunDistance;
        const sunY = Math.sin(angle) * this.sunDistance;
        const sunZ = 100;
        this.sunLight.position.set(sunX, sunY, sunZ);

        const dayFactor = Math.max(0, Math.sin(angle));

        // Lumières (inchangé)
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunIntensity.night, this.sunIntensity.day, dayFactor);
        this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientIntensity.night, this.ambientIntensity.day, dayFactor);
        let sunColorTarget = new THREE.Color();
        // ... (interpolation couleur soleil identique à avant) ...
        if (normalizedTime < 0.25) { sunColorTarget.lerpColors(this.sunColors.night, this.sunColors.dawn, normalizedTime * 4); }
        else if (normalizedTime < 0.5) { sunColorTarget.lerpColors(this.sunColors.dawn, this.sunColors.day, (normalizedTime - 0.25) * 4); }
        else if (normalizedTime < 0.75) { sunColorTarget.lerpColors(this.sunColors.day, this.sunColors.dusk, (normalizedTime - 0.5) * 4); }
        else { sunColorTarget.lerpColors(this.sunColors.dusk, this.sunColors.night, (normalizedTime - 0.75) * 4); }
        this.sunLight.color.copy(sunColorTarget);
        this.ambientLight.color.lerpColors(this.ambientColors.night, this.ambientColors.day, dayFactor);


        // --- NOUVEAU : Interpolation des couleurs du dégradé de ciel ---
        const nightSet   = this.skyGradientBaseColors.night;
        const dawnSet    = this.skyGradientBaseColors.dawn;
        const daySet     = this.skyGradientBaseColors.day;
        const duskSet    = this.skyGradientBaseColors.dusk;

        let colors1, colors2, t; // Jeux de couleurs source/cible et facteur d'interpolation

        // Définir les points de transition (0 = minuit, 0.25 = lever, 0.5 = midi, 0.75 = coucher)
        // Ajustez ces valeurs pour changer la durée des transitions
        const tNightEnd = 0.22; // Fin nuit noire -> début transition aube
        const tDawnEnd  = 0.28; // Fin transition aube -> début jour
        const tDayEnd   = 0.72; // Fin jour -> début transition crépuscule
        const tDuskEnd  = 0.78; // Fin transition crépuscule -> début retour nuit

        if (normalizedTime < tNightEnd) { // Nuit
            colors1 = nightSet; colors2 = nightSet; t = 0;
        } else if (normalizedTime < tDawnEnd) { // Transition Nuit -> Aube
            colors1 = nightSet; colors2 = dawnSet;
            t = (normalizedTime - tNightEnd) / (tDawnEnd - tNightEnd);
        } else if (normalizedTime < tDayEnd) { // Transition Aube -> Jour (ou juste Jour si transitions instantanées voulues)
             colors1 = dawnSet; colors2 = daySet; // Transition douce
             t = (normalizedTime - tDawnEnd) / (tDayEnd - tDawnEnd);
            // Ou : colors1 = daySet; colors2 = daySet; t = 0; // Pour un jour stable
        } else if (normalizedTime < tDuskEnd) { // Transition Jour -> Crépuscule
            colors1 = daySet; colors2 = duskSet;
            t = (normalizedTime - tDayEnd) / (tDuskEnd - tDayEnd);
        } else { // Transition Crépuscule -> Nuit
            colors1 = duskSet; colors2 = nightSet;
            t = (normalizedTime - tDuskEnd) / (1.0 - tDuskEnd);
        }

        // Appliquer une fonction d'easing pour une transition plus douce (optionnel)
        t = THREE.MathUtils.smoothstep(t, 0.0, 1.0);

        // Interpoler chaque arrêt de couleur et mettre à jour les uniforms
        this.skyUniforms.uCurrentZenithColor.value.lerpColors(colors1[0], colors2[0], t);
        this.skyUniforms.uCurrentMiddleColor.value.lerpColors(colors1[1], colors2[1], t);
        this.skyUniforms.uCurrentHorizonColor.value.lerpColors(colors1[2], colors2[2], t);
        // --- FIN Interpolation Ciel ---


        // Mettre à jour les autres uniforms (inchangé)
        this.skyUniforms.uSunDirection.value.copy(this.sunLight.position).normalize();
        this.skyUniforms.uDayFactor.value = dayFactor; // Le shader l'utilise toujours pour l'effet solaire

        // Étoiles (inchangé)
        if (this.starsMesh) {
             const starsOpacity = THREE.MathUtils.smoothstep(dayFactor, 0.1, 0.0);
             this.starsMesh.material.opacity = starsOpacity;
        }

         // Effet Santé (inchangé / optionnel)
         // ...
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