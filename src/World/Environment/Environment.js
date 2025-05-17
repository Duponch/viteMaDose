// src/World/Environment/Environment.js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Calendar from '../../Utils/Calendar.js';
import WeatherSystem from '../Weather/WeatherSystem.js';
import EnvironmentSystem from './EnvironmentSystem.js';
import WaterSystem from './WaterSystem.js';

// --- Objets temporaires pour l'update (performance) ---
const _tempMatrix = new THREE.Matrix4();
const _tempPosition = new THREE.Vector3();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();

export default class Environment {
    constructor(experience, world) {
        this.experience = experience;
        this.world = world;
        this.scene = this.experience.scene;
        this.debug = this.experience.debug;
        this.config = this.world.cityManager.config;

        // Supprimé: Config spécifique aux nuages instanciés (maintenant géré par CloudSystem)
        this.mapSize = this.config.mapSize + 550;
        this.outerGroundDisplayRadius = 0;

        // --- Propriétés Cycle Jour/Nuit --- (INCHANGÉ)
        this.cycleEnabled = this.config.dayNightCycleEnabled;
        this.dayDurationMs = (this.config.dayDurationMinutes ?? 20) * 60 * 1000; // Assurer initialisation
        const initialNormalizedTime = this.config.startTimeOfDay ?? 0.25;
		this.cycleTime = (this.dayDurationMs > 0) ? (this.experience.time.elapsed % this.dayDurationMs) : 0; // Initialiser basé sur temps global
        this.sunDistance = 0;

        // --- Lumières Soleil & Ambiante & Couleurs Ciel --- (INCHANGÉ)
        this.sunColors = { dawn: new THREE.Color(0xFFCA87), day: new THREE.Color(0xFFFFFF), dusk: new THREE.Color(0xFFB17A), night: new THREE.Color(0x435E7A) };
        this.sunIntensity = { day: 3.0, night: 0.01 };
        this.ambientColors = { day: new THREE.Color(0xADCDE7), night: new THREE.Color(0x2B3A4F) };
        this.ambientIntensity = { day: 0.7, night: 0.1 };
        this.dayZenithColor = new THREE.Color('#87CEEB');
        this.nightZenithColor = new THREE.Color('#00001a');
        this.dayMiddleColor = new THREE.Color('#ADD8E6');
        this.nightMiddleColor = new THREE.Color('#00002a');
        this.dayHorizonColor = new THREE.Color('#B0E0E6');
        this.nightHorizonColor = new THREE.Color('#0b1028');

        // --- Uniforms pour le Shader Skybox --- (INCHANGÉ)
        this.skyUniforms = {
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
            uDayFactor: { value: 0.0 },
            uCurrentZenithColor: { value: new THREE.Color() },
            uCurrentMiddleColor: { value: new THREE.Color() },
            uCurrentHorizonColor: { value: new THREE.Color() },
            uSunInfluenceColor: { value: new THREE.Color(0xffccaa) }
         };

        // --- Propriétés de la Lune --- (INCHANGÉ)
        this.moonLight = null; this.moonMesh = null; this.moonDistance = 0;
        this.moonColor = new THREE.Color('#E8F0F5'); this.moonIntensity = { max: 0.2, min: 0.0 };
        this.moonSize = 30;

        this.vertexShaderCode = null;
        this.fragmentShaderCode = null;
        this.isInitialized = false;
        this.skyBox = null; this.starsMesh = null; this.outerGroundMesh = null;
        this.skyboxRadius = 0;

        // --- Intégration du calendrier ---
        this.calendar = new Calendar({
            startDate: '2025-04-24', // Peut être rendu configurable plus tard
            dayDurationMs: this.dayDurationMs
        });

        // --- Appels d'initialisation ---
        this.setSunLight();
        this.setAmbientLight();
        this.setMoonLight();
        
        // --- Système météorologique et environnemental ---
        this.weatherSystem = null; // Sera initialisé après le chargement complet de l'environnement
        this.environmentSystem = null; // Système d'environnement (oiseaux, etc.)
        this.waterSystem = null; // Système de gestion de l'eau
        // --------------------------------------

        // Créer la texture procédurale pour le sol
        this.outerGroundTexture = this.createOuterGroundTexture();
    }

    /**
     * Crée une texture procédurale pour le sol extérieur
     * @returns {THREE.CanvasTexture} La texture générée
     */
    createOuterGroundTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Couleur de base de l'herbe
        const baseColor = new THREE.Color(0x4c7f33);
        ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ajouter des variations de couleur pour simuler des touffes d'herbe
        for (let i = 0; i < 500; i++) {
            // Position aléatoire
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            
            // Taille aléatoire
            const size = Math.random() * 30 + 15;
            
            // Variation de couleur (plus claire ou plus foncée)
            const variation = Math.random() * 40 - 20;
            const r = Math.max(0, Math.min(255, baseColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, baseColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, baseColor.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            // Dessiner une touffe d'herbe
            ctx.beginPath();
            const numBlades = 5 + Math.floor(Math.random() * 5);
            for (let j = 0; j < numBlades; j++) {
                const angle = (j / numBlades) * Math.PI * 2;
                const radius = size * (0.7 + Math.random() * 0.6);
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                
                if (j === 0) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.closePath();
            ctx.fill();
        }

        // Ajouter des rochers et des cailloux
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 20 + 5;
            
            // Couleur du rocher (gris)
            const rockColor = new THREE.Color(0x808080);
            const variation = Math.random() * 30 - 15;
            const r = Math.max(0, Math.min(255, rockColor.r * 255 + variation));
            const g = Math.max(0, Math.min(255, rockColor.g * 255 + variation));
            const b = Math.max(0, Math.min(255, rockColor.b * 255 + variation));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 10); // Répéter la texture pour couvrir une grande surface

        return texture;
    }

	getdayDurationMs() {
        // Recalculer si la config peut changer dynamiquement, sinon retourner la valeur stockée
         return (this.config.dayDurationMinutes ?? 20) * 60 * 1000;
    }

	getCurrentHour() {
        if (!this.isInitialized || !this.cycleEnabled || this.dayDurationMs <= 0) {
             const initialNormalizedTime = this.config.startTimeOfDay ?? 0.25;
             return Math.floor(initialNormalizedTime * 24);
        }
        // Utiliser le temps global scaled du jeu (en ms)
        const currentGameTimeMs = this.experience.time.elapsed;
        // Calculer l'heure basée sur le temps DANS le cycle actuel
        const timeInCycleMs = currentGameTimeMs % this.dayDurationMs;
        const normalizedTimeInCycle = timeInCycleMs / this.dayDurationMs;
        return Math.floor(normalizedTimeInCycle * 24); // Heure entière 0-23
    }

    async initialize() {
        //console.log("Environment: Initialisation asynchrone...");
        try {
            // --- Chargement Shaders --- (MODIFIÉ POUR NETLIFY)
            const [vertexResponse, fragmentResponse] = await Promise.all([
                fetch('/src/World/Shaders/SkyVertex.glsl'),
                fetch('/src/World/Shaders/skyFragment.glsl')
            ]);
            if (!vertexResponse.ok || !fragmentResponse.ok) { throw new Error(`Erreur chargement shaders: VS=${vertexResponse.status}, FS=${fragmentResponse.status}`); }
            this.vertexShaderCode = await vertexResponse.text();
            this.fragmentShaderCode = await fragmentResponse.text();
            //console.log("Environment: Shaders chargés.");

            // --- Création Éléments Scène ---
            this.renderSkybox(); // Définit les rayons/distances
            this.outerGroundDisplayRadius = this.skyboxRadius + 10;
            this.createOuterGround();
            this.createStarsPoints();
            this.createMoonMesh();

            this.updateDayNightCycle(0); // Applique l'état initial
            this.isInitialized = true;
            
            // --- Initialiser les systèmes météorologiques et d'environnement ---
            this.weatherSystem = new WeatherSystem(this.experience, this);
            this.environmentSystem = new EnvironmentSystem(this.experience, this);
            this.waterSystem = new WaterSystem(this.experience, this);
            // ------------------------------------------------------
            
            //console.log("Environment: Initialisation terminée.");
        } catch (error) { console.error("Environment: Erreur init:", error); }
    }

    setSunLight() {
        // ... (code inchangé)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
		//this.sunLight.shadow.mapSize.set(4096, 4096);
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
         this.ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
         this.scene.add(this.ambientLight);
    }

    // --- NOUVELLE MÉTHODE : Initialisation lumière lune ---
    setMoonLight() {
        this.moonLight = new THREE.DirectionalLight(this.moonColor, this.moonIntensity.min);
        this.moonLight.castShadow = false; // La lune ne projette pas d'ombres fortes
        // Pas besoin de configurer les ombres ici
        // moonDistance est défini dans renderSkybox
        this.scene.add(this.moonLight);
        //console.log("Moonlight initialisée.");
    }
    // ---------------------------------------------------

    renderSkybox() {
        if (!this.vertexShaderCode || !this.fragmentShaderCode) { console.error("renderSkybox: Shaders non chargés."); return; }

        // --- Définition des rayons et distances ---
        this.skyboxRadius = this.config.mapSize * 1.5; // Rayon de la sphère céleste
        this.sunDistance = this.skyboxRadius * 0.9;   // Distance du soleil depuis le centre
        this.moonDistance = this.skyboxRadius * 1.1;  // Distance de la lune (légèrement plus proche ?)
        // ----------------------------------------

        //console.log(`Skybox: Rayon=${this.skyboxRadius.toFixed(0)}, DistSoleil=${this.sunDistance.toFixed(0)}, DistLune=${this.moonDistance.toFixed(0)}`);

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

        //console.log(`Skybox Shader créée.`);
    }

    // --- NOUVELLE MÉTHODE : Création mesh lune ---
    createMoonMesh() {
        if (this.moonMesh) return; // Evite recréation
        if (this.moonDistance <= 0) {
             console.error("Impossible de créer le mesh de la Lune: moonDistance non définie (renderSkybox doit être appelée avant).");
             return;
        }

        const moonGeometry = new THREE.SphereGeometry(this.moonSize, 16, 16);
        // Utilisation d'un matériau basique pour qu'elle soit visible même sans lumière directe forte
        const moonMaterial = new THREE.MeshBasicMaterial({
            color: this.moonColor, // Même couleur que la lumière pour cohérence
            depthWrite: false,     // Pour éviter conflits de profondeur avec objets lointains/skybox
            fog: false             // <--- AJOUTER CETTE LIGNE
        });

        this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moonMesh.renderOrder = 0; // Dessiné après skybox (-1) mais avant le reste (par défaut)
        this.moonMesh.visible = false; // Invisible initialement
        this.scene.add(this.moonMesh);
        //console.log(`Moon Mesh créé (taille: ${this.moonSize}).`);
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
        //console.log("Stars Points créés.");
    }

    updateDayNightCycle() { // Suppression du paramètre deltaTime
        // Vérifications initiales
        if (!this.isInitialized || !this.cycleEnabled || this.dayDurationMs <= 0) {
            // Si le cycle est désactivé ou non prêt, ne rien faire ou appliquer un état fixe
             if (!this.cycleEnabled && this.isInitialized) {
                 // Appliquer l'état de départ fixe si le cycle est désactivé
                 const initialNormalizedTime = this.config.startTimeOfDay ?? 0.25;
                 this.cycleTime = (this.dayDurationMs * initialNormalizedTime) % this.dayDurationMs;
                 // Appeler toute la logique ci-dessous avec initialNormalizedTime ?
                 // C'est une option, mais pour l'instant on quitte pour éviter calculs inutiles.
             }
            return;
        }

        // Obtenir le temps de jeu global actuel (scaled) en ms
        const currentGameTimeMs = this.experience.time.elapsed;

        // Calculer le temps actuel dans le cycle journalier (pour les visuels)
        this.cycleTime = currentGameTimeMs % this.dayDurationMs;
        const normalizedTime = this.cycleTime / this.dayDurationMs; // Temps normalisé [0, 1]

        // --- Position Soleil ---
        // Angle basé sur le temps normalisé (0 = minuit bas, 0.25 = lever est, 0.5 = midi haut, 0.75 = coucher ouest)
        const sunAngle = normalizedTime * Math.PI * 2 - (Math.PI / 2); // Commence à -PI/2 (minuit en bas)
        const sunX = Math.cos(sunAngle) * this.sunDistance;
        const sunY = Math.sin(sunAngle) * this.sunDistance; // Hauteur basée sur sin
        const sunZ = this.sunDistance * 0.1; // Léger décalage Z pour varier
        if (this.sunLight) {
            this.sunLight.position.set(sunX, sunY, sunZ);
        } else { console.warn("updateDayNightCycle: sunLight non défini."); }

        // --- Position Lune ---
        const moonAngle = sunAngle + Math.PI; // Opposé au soleil
        const moonX = Math.cos(moonAngle) * this.moonDistance;
        const moonY = Math.sin(moonAngle) * this.moonDistance;
        const moonZ = -this.moonDistance * 0.1; // Z opposé
        if (this.moonLight) {
            this.moonLight.position.set(moonX, moonY, moonZ);
        }
        if (this.moonMesh) {
            this.moonMesh.position.set(moonX, moonY, moonZ);
        }

        // --- Calcul du Facteur Jour/Nuit (pour les interpolations) ---
        // Basé sur la hauteur normalisée du soleil (Y / distance)
        const sunHeightFactor = this.sunDistance > 0 ? sunY / this.sunDistance : 0; // -1 (bas) à +1 (haut)
        // Transition douce entre nuit (-0.15 et avant -> 0) et jour (0.15 et après -> 1)
        const dayNightFactor = THREE.MathUtils.smoothstep(sunHeightFactor, -0.15, 0.15); // 0=Nuit, 1=Jour

        // --- Mise à jour Lumière Soleil ---
        if (this.sunLight) {
            this.sunLight.intensity = THREE.MathUtils.lerp(this.sunIntensity.night, this.sunIntensity.day, dayNightFactor);

            // Interpolation de couleur plus complexe basée sur les 4 phases
            let sunColorTarget = new THREE.Color();
            const phaseTime = normalizedTime * 4; // Pour mapping [0, 4]
            if (normalizedTime < 0.25) { // Phase 1: Nuit -> Aube (0 -> 1)
                sunColorTarget.lerpColors(this.sunColors.night, this.sunColors.dawn, phaseTime);
            } else if (normalizedTime < 0.5) { // Phase 2: Aube -> Jour (1 -> 2)
                sunColorTarget.lerpColors(this.sunColors.dawn, this.sunColors.day, phaseTime - 1);
            } else if (normalizedTime < 0.75) { // Phase 3: Jour -> Crépuscule (2 -> 3)
                sunColorTarget.lerpColors(this.sunColors.day, this.sunColors.dusk, phaseTime - 2);
            } else { // Phase 4: Crépuscule -> Nuit (3 -> 4)
                sunColorTarget.lerpColors(this.sunColors.dusk, this.sunColors.night, phaseTime - 3);
            }
            this.sunLight.color.copy(sunColorTarget);
        }

        // --- Mise à jour Lumière Ambiante ---
        if (this.ambientLight) {
            this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientIntensity.night, this.ambientIntensity.day, dayNightFactor);
            // Interpolation simple entre couleur nuit et jour
            this.ambientLight.color.lerpColors(this.ambientColors.night, this.ambientColors.day, dayNightFactor);
        }

        // --- Mise à jour Lumière Lune & Mesh ---
        const nightFactor = 1.0 - dayNightFactor; // Inverse : 1=Nuit, 0=Jour
        if (this.moonLight) {
            this.moonLight.intensity = THREE.MathUtils.lerp(this.moonIntensity.min, this.moonIntensity.max, nightFactor);
        }
        if (this.moonMesh) {
            // Afficher la lune seulement quand il fait suffisamment nuit
            this.moonMesh.visible = nightFactor > 0.1;
        }

        // --- Mise à jour Ciel (Skybox Shader Uniforms) ---
        if (this.skyBox && this.skyBox.material.uniforms) {
             // Interpolation des couleurs du ciel
            this.skyUniforms.uCurrentZenithColor.value.lerpColors(this.nightZenithColor, this.dayZenithColor, dayNightFactor);
            this.skyUniforms.uCurrentMiddleColor.value.lerpColors(this.nightMiddleColor, this.dayMiddleColor, dayNightFactor);
            this.skyUniforms.uCurrentHorizonColor.value.lerpColors(this.nightHorizonColor, this.dayHorizonColor, dayNightFactor);

             // Direction du soleil pour le shader
             if (this.sunLight) {
                this.skyUniforms.uSunDirection.value.copy(this.sunLight.position).normalize();
             }
            // Facteur jour/nuit pour le shader
            this.skyUniforms.uDayFactor.value = dayNightFactor;
             // La couleur d'influence du soleil (uSunInfluenceColor) est généralement fixe

            // Mise à jour de la couleur du fog
            if (this.experience.scene.fog) {
                this.experience.scene.fog.color.copy(this.skyUniforms.uCurrentHorizonColor.value);
            }
        }

        // --- Mise à jour Étoiles ---
        if (this.starsMesh && this.starsMesh.material) {
            // Opacité inverse du facteur jour/nuit
            const starsOpacity = nightFactor; // 1 la nuit, 0 le jour
            // Transition douce de l'opacité
            this.starsMesh.material.opacity = THREE.MathUtils.smoothstep(starsOpacity, 0.0, 0.8); // Rend les étoiles visibles graduellement
            this.starsMesh.visible = this.starsMesh.material.opacity > 0.01; // Cacher si quasi invisible
        }
    } // Fin updateDayNightCycle

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
		const flatRadius = this.mapSize * 0.5;
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
        const material = new THREE.MeshStandardMaterial({ 
            map: this.outerGroundTexture,
            color: 0x4c7f33,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        this.outerGroundMesh = new THREE.Mesh(geometry, material);
        this.outerGroundMesh.position.y = -0.1;
        this.outerGroundMesh.receiveShadow = true;
        this.outerGroundMesh.name = "OuterGround_Hills_CircularGeom_FlatCenter";
        this.scene.add(this.outerGroundMesh);
        //console.log(`Sol extérieur (géométrie circulaire, centre plat) créé. Rayon: ${terrainVisibleRadius}, Rayon plat: ${flatRadius}`);
    }

    destroy() {
        //console.log("Nettoyage de l'environnement (Shader Skybox, Lune, Nuages Instanciés)...");
        // Lumières, Skybox, Étoiles, Sol Extérieur, Lune (INCHANGÉ)
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        if (this.moonLight) this.scene.remove(this.moonLight);
        if (this.skyBox) { this.scene.remove(this.skyBox); this.skyBox.geometry?.dispose(); this.skyBox.material?.dispose(); this.skyBox = null; }
        if (this.starsMesh) { this.scene.remove(this.starsMesh); this.starsMesh.geometry?.dispose(); this.starsMesh.material?.dispose(); this.starsMesh = null; }
        if (this.outerGroundMesh) { this.scene.remove(this.outerGroundMesh); this.outerGroundMesh.geometry?.dispose(); this.outerGroundMesh.material?.dispose(); this.outerGroundMesh = null; }
        if (this.moonMesh) { this.scene.remove(this.moonMesh); this.moonMesh.geometry?.dispose(); this.moonMesh.material?.dispose(); this.moonMesh = null; }
        
        // Nettoyer les systèmes
        if (this.weatherSystem && this.weatherSystem.destroy) this.weatherSystem.destroy();
        if (this.environmentSystem && this.environmentSystem.destroy) this.environmentSystem.destroy();
        if (this.waterSystem && this.waterSystem.destroy) this.waterSystem.destroy();
        
        this.weatherSystem = null;
        this.environmentSystem = null;
        this.waterSystem = null;
    }
    // ------------------------------------

    // --- MÉTHODE UPDATE MODIFIÉE --- (mise à jour pour inclure le système d'eau)
    update(deltaTime) {
        // Mettre à jour seulement si l'environnement est initialisé
        if (this.isInitialized) {

            // 1. Mettre à jour le cycle Jour/Nuit (calcul couleurs, positions soleil/lune)
            // Cette fonction utilise deltaTime pour faire avancer this.cycleTime
			this.updateDayNightCycle();
            
            // --- NOUVEAU : Mettre à jour les systèmes ---
            if (this.weatherSystem) {
                this.weatherSystem.update(deltaTime);
            }
            
            if (this.environmentSystem) {
                this.environmentSystem.update(deltaTime);
            }
            
            if (this.waterSystem) {
                this.waterSystem.update(deltaTime);
            }
            // ---------------------------------------------------------
        }
    }

    /**
     * Retourne la date courante du jeu
     * @returns {Object} Objet contenant la date et l'heure du jeu
     */
    getCurrentCalendarDate() {
        // Utilise le temps de jeu écoulé pour calculer la date
        return this.calendar.getCurrentDate(this.experience.time.elapsed);
    }
    
    /**
     * Définit la densité des oiseaux
     * @param {number} density - Densité des oiseaux entre 0 et 1
     */
    setBirdDensity(density) {
        if (this.environmentSystem) {
            this.environmentSystem.setBirdDensity(density);
        }
    }
    
    /**
     * Configure la position de l'eau
     * @param {Object} position - Nouvelles coordonnées {x, y, z}
     */
    setWaterPosition(position) {
        if (this.waterSystem) {
            this.waterSystem.setPosition(position);
        }
    }
    
    /**
     * Configure les dimensions de l'eau
     * @param {number} width - Largeur de l'eau
     * @param {number} height - Hauteur de l'eau
     */
    setWaterDimensions(width, height) {
        if (this.waterSystem) {
            this.waterSystem.setDimensions(width, height);
        }
    }

    /**
     * Retourne le nombre de jours dans le mois actuel
     * @param {number} month - Mois optionnel (1-12)
     * @param {number} year - Année optionnelle
     * @returns {number} - Nombre de jours dans le mois
     */
    getMonthDays(month, year) {
        if (!this.calendar) return 30; // Valeur par défaut si le calendrier n'est pas disponible
        
        return this.calendar.getMonthDays(month, year);
    }
}