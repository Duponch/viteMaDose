// src/World/Environment.js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

// Importer les shaders (assurez-vous que le chemin est correct)
// Vous pouvez utiliser un loader ou les coller comme chaînes de caractères
// Exemple avec import (nécessite un bundler configuré pour .glsl, comme Vite avec plugin)
// import skyVertexShader from './shaders/skyVertex.glsl';
// import skyFragmentShader from './shaders/skyFragment.glsl';

// Si vous n'avez pas de loader GLSL, collez le code ici :
const skyVertexShader = `
varying vec3 vWorldDirection;
void main() {
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldDirection = worldPosition.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const skyFragmentShader = `
varying vec3 vWorldDirection;
uniform vec3 uSunDirection;
uniform float uDayFactor;
uniform vec3 uZenithColorDay;
uniform vec3 uHorizonColorDay;
uniform vec3 uZenithColorNight;
uniform vec3 uHorizonColorNight;
uniform vec3 uSunInfluenceColor;

vec3 mixVec3(vec3 a, vec3 b, float t) {
    return a * (1.0 - t) + b * t;
}

void main() {
    vec3 viewDirection = normalize(vWorldDirection);
    vec3 zenithColor = mixVec3(uZenithColorNight, uZenithColorDay, uDayFactor);
    vec3 horizonColor = mixVec3(uHorizonColorNight, uHorizonColorDay, uDayFactor);
    float skyFactor = smoothstep(0.0, 0.6, viewDirection.y);
    vec3 skyGradient = mixVec3(horizonColor, zenithColor, skyFactor);
    float dotSun = dot(viewDirection, normalize(uSunDirection));
    float sunHalo = smoothstep(0.95, 1.0, dotSun);
    sunHalo = pow(sunHalo, 10.0) * uDayFactor;
    float sunTint = smoothstep(0.6, 1.0, dotSun);
    sunTint = pow(sunTint, 2.0) * uDayFactor;
    vec3 finalColor = skyGradient;
    finalColor = mixVec3(finalColor, uSunInfluenceColor * 1.5, sunTint * 0.4);
    finalColor += uSunInfluenceColor * sunHalo * 1.2;
    gl_FragColor = vec4(finalColor, 1.0);
}`;


export default class Environment {
    constructor(experience, world) {
        this.experience = experience;
        this.world = world;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug;
        this.config = this.world.cityManager.config;

        this.mapSize = this.config.mapSize + 550;
        this.outerGroundDisplayRadius = 0;

        // --- Propriétés Cycle Jour/Nuit (Identiques) ---
        this.cycleEnabled = this.config.dayNightCycleEnabled;
        this.dayDurationMs = this.config.dayDurationMinutes * 60 * 1000;
        this.cycleTime = (this.dayDurationMs * (this.config.startTimeOfDay || 0.25)) % this.dayDurationMs;
        this.sunDistance = 0;

        // --- CORRECTION : Définir les couleurs ---
        this.sunColors = {
            dawn: new THREE.Color(0xffa500), // Lever (Orange)
            day: new THREE.Color(0xffffff),  // Journée (Blanc)
            dusk: new THREE.Color(0xff4500), // Coucher (Rouge-Orange)
            night: new THREE.Color(0x000033) // Nuit (Bleu très sombre) - Pour la teinte ambiante/solaire nuit
        };
        this.sunIntensity = { day: 3.5, night: 0 }; // Gardez ceci

        this.ambientColors = {
             day: new THREE.Color(0xb0c4de),   // Acier clair
             night: new THREE.Color(0x111133) // Bleu nuit
        };
        this.ambientIntensity = { day: 0.6, night: 0.1 }; // Gardez ceci
        // --- FIN CORRECTION ---

        // --- Uniforms (identique) ---
        this.skyUniforms = {
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
            uDayFactor: { value: 0.0 },
            uZenithColorDay: { value: new THREE.Color(0x87CEEB) },
            uHorizonColorDay: { value: new THREE.Color(0xADD8E6) },
            uZenithColorNight: { value: new THREE.Color(0x000033) },
            uHorizonColorNight: { value: new THREE.Color(0x000000) },
            uSunInfluenceColor: { value: new THREE.Color(0xffccaa) }
        };

        // ... (reste du constructeur) ...

        this.setSunLight();
        this.setAmbientLight();
        this.renderSkybox();
        this.outerGroundDisplayRadius = this.skyboxRadius + 10;
        this.createOuterGround();

        this.updateDayNightCycle(0); // Appliquer l'état initial
    }

    setSunLight() {
        // ... (Identique à avant) ...
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(4096, 4096); // Envisagez de réduire à 2048 pour perfs
        this.sunLight.shadow.normalBias = 0.05;
        this.sunDistance = this.mapSize * 0.7;

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
        // ... (Identique à avant) ...
         this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
         this.scene.add(this.ambientLight);
    }

    // --- renderSkybox MODIFIÉ ---
    renderSkybox() {
        this.skyboxRadius = this.mapSize * 0.8;
        this.sunDistance = this.skyboxRadius * 0.9; // S'assurer que c'est défini
        console.log(`Rayon Skybox: ${this.skyboxRadius}, Distance Soleil: ${this.sunDistance}`);

        const skyGeometry = new THREE.SphereGeometry(this.skyboxRadius, 32, 15); // Moins de segments suffisent souvent

        // --- Création du ShaderMaterial ---
        const skyMaterial = new THREE.ShaderMaterial({
            vertexShader: skyVertexShader,     // Code GLSL du vertex shader
            fragmentShader: skyFragmentShader, // Code GLSL du fragment shader
            uniforms: this.skyUniforms,        // Lien vers nos uniforms JS
            side: THREE.BackSide,              // Important: Rendre l'intérieur
            depthWrite: false                  // Le ciel est toujours derrière
        });
        // --- Fin Création ---

        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.renderOrder = -1; // Rendu en premier (le plus loin)
        this.scene.add(this.skyBox);

        // --- Supprimer toute la logique Canvas ---
        // Plus besoin de starsCanvas, skyboxCanvas, skyboxContext, skyboxTexture

        // Optionnel : Remplacer les étoiles canvas par des THREE.Points
        this.createStarsPoints(); // Appeler une nouvelle fonction

        console.log(`Skybox Shader initialisée. Rayon: ${this.skyboxRadius}`);
    }

    // --- NOUVELLE Fonction pour les étoiles avec Points ---
    createStarsPoints() {
        const starCount = 10000; // Plus d'étoiles si besoin
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3); // Optionnel: pour varier la couleur/luminosité
        const baseColor = new THREE.Color(0xffffff);

        for (let i = 0; i < starCount; i++) {
            // Position sur une sphère (plus grande que la skybox)
            const radius = this.skyboxRadius + Math.random() * 500; // Etoiles plus lointaines
            const theta = 2 * Math.PI * Math.random(); // Angle horizontal
            const phi = Math.acos(2 * Math.random() - 1); // Angle vertical

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Couleur/Luminosité aléatoire
            const intensity = Math.random() * 0.5 + 0.5; // 0.5 à 1.0
            colors[i * 3] = baseColor.r * intensity;
            colors[i * 3 + 1] = baseColor.g * intensity;
            colors[i * 3 + 2] = baseColor.b * intensity;
        }

        const starsGeometry = new THREE.BufferGeometry();
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); // Utiliser les couleurs

        const starsMaterial = new THREE.PointsMaterial({
            size: 3, // Taille des étoiles (ajuster)
            sizeAttenuation: true, // Etoiles plus petites si plus loin
            vertexColors: true, // Utiliser les couleurs définies par vertex
            transparent: true,
            opacity: 0.0, // Commencer transparent (sera mis à jour)
            depthWrite: false // Ne pas masquer les objets derrière
        });

        this.starsMesh = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.starsMesh);
    }


    // --- updateDayNightCycle MODIFIÉ ---
    updateDayNightCycle(deltaTime) {
        if (!this.cycleEnabled || this.dayDurationMs <= 0) return;

        this.cycleTime += deltaTime;
        this.cycleTime %= this.dayDurationMs;

        const angle = (this.cycleTime / this.dayDurationMs) * Math.PI * 2;
        const normalizedTime = this.cycleTime / this.dayDurationMs; // 0 à 1

        // --- Position Soleil (Identique) ---
        const sunX = Math.cos(angle) * this.sunDistance;
        const sunY = Math.sin(angle) * this.sunDistance;
        const sunZ = 100;
        this.sunLight.position.set(sunX, sunY, sunZ);

        // --- Facteur Jour (Identique) ---
        const dayFactor = Math.max(0, Math.sin(angle));

        // --- Mettre à jour les lumières (Identique) ---
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunIntensity.night, this.sunIntensity.day, dayFactor);
        this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientIntensity.night, this.ambientIntensity.day, dayFactor);

        let sunColorTarget = new THREE.Color();
        if (normalizedTime < 0.25) { sunColorTarget.lerpColors(this.sunColors.night, this.sunColors.dawn, normalizedTime * 4); }
        else if (normalizedTime < 0.5) { sunColorTarget.lerpColors(this.sunColors.dawn, this.sunColors.day, (normalizedTime - 0.25) * 4); }
        else if (normalizedTime < 0.75) { sunColorTarget.lerpColors(this.sunColors.day, this.sunColors.dusk, (normalizedTime - 0.5) * 4); }
        else { sunColorTarget.lerpColors(this.sunColors.dusk, this.sunColors.night, (normalizedTime - 0.75) * 4); }
        this.sunLight.color.copy(sunColorTarget);
        this.ambientLight.color.lerpColors(this.ambientColors.night, this.ambientColors.day, dayFactor);


        // --- Mettre à jour les UNIFORMS du Shader Skybox ---
        // Pas besoin d'appeler updateSkyboxAppearance !
        this.skyUniforms.uSunDirection.value.copy(this.sunLight.position).normalize();
        this.skyUniforms.uDayFactor.value = dayFactor;
        // --- Fin Mise à jour Uniforms ---


        // --- Mettre à jour l'opacité des étoiles Points ---
        if (this.starsMesh) {
             // Fade out rapide quand dayFactor > 0, fade in lent quand < 0.1
            const starsOpacity = THREE.MathUtils.smoothstep(dayFactor, 0.1, 0.0); // Inverse: 1 la nuit, 0 le jour
            this.starsMesh.material.opacity = starsOpacity;
        }


        // --- Effet Santé (Optionnel, peut être appliqué ici aussi) ---
        const healthFactor = 1.0; // Votre valeur
        if (healthFactor < 1.0) { // Appliquer seulement si la santé n'est pas max
             const baseSunColor = this.sunLight.color.clone();
             const healthTargetColor = new THREE.Color(0x5b0000);
             this.sunLight.color.lerpColors(baseSunColor, healthTargetColor, 1.0 - healthFactor);
             // Vous pourriez aussi teinter les uniforms du ciel ici si besoin
             // Exemple : this.skyUniforms.uSunInfluenceColor.value.lerpColors(...)
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

    update(deltaTime) { // healthFactor n'est plus nécessaire ici si géré dans updateDayNightCycle
        this.updateDayNightCycle(deltaTime);
        // La logique de transition de santé (si séparée) irait ici
    }
}