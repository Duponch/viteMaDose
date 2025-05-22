// src/World/Environment/Environment.js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Calendar from '../../Utils/Calendar.js';
import WeatherSystem from '../Weather/WeatherSystem.js';
import EnvironmentSystem from './EnvironmentSystem.js';
import WaterSystem from './WaterSystem.js';
import ShaderLoader from '../../Utils/ShaderLoader.js';

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
        this.terrainVertexShader = null;
        this.terrainFragmentShader = null;
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
            // --- Chargement Shaders --- (UTILISATION DE LA CLASSE UTILITAIRE VITE)
            const vertexShaderCode = await ShaderLoader.loadShader('SkyVertex.glsl');
            const fragmentShaderCode = await ShaderLoader.loadShader('skyFragment.glsl');
            
            // Chargement des shaders pour le terrain
            const terrainVertexShader = await ShaderLoader.loadShader('terrainVertexShader.glsl');
            const terrainFragmentShader = await ShaderLoader.loadShader('terrainFragmentShader.glsl');
            
            this.vertexShaderCode = vertexShaderCode;
            this.fragmentShaderCode = fragmentShaderCode;
            this.terrainVertexShader = terrainVertexShader;
            this.terrainFragmentShader = terrainFragmentShader;
            //console.log("Environment: Shaders chargés.");

            // --- Création Éléments Scène ---
            this.renderSkybox(); // Définit les rayons/distances
            this.outerGroundDisplayRadius = this.skyboxRadius + 10;
            
            // Création des textures pour le terrain
            this.createTerrainTextures();
            
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
        if (this.outerGroundMesh) return; // Évite de recréer
        if (this.outerGroundDisplayRadius <= 0) {
             console.error("Impossible de créer OuterGround: outerGroundDisplayRadius non défini (skyboxRadius?).");
             return;
        }
        
        // Paramètres du terrain
        const width = this.outerGroundDisplayRadius * 2.5;  // Garder un terrain carré large
        const depth = this.outerGroundDisplayRadius * 2.5;  // Garder un terrain carré large
        const segments = 100; // Réduit pour effet low poly
        const flatRadius = this.mapSize * 0.5;
        const transitionWidth = this.mapSize * 0.4;
        
        // Paramètres du noise modifiés pour un style low poly plus triangulaire
        const noiseScale1 = 0.0008 * 1.3; // Échelle plus grande = montagnes plus larges
        const noiseScale2 = 0.002 * 1.3;
        const octave1Weight = 0.7 * 1.3;
        const octave2Weight = 0.3 * 1.3;
        const hillAmplitude = 250; // Amplitude augmentée pour montagnes plus hautes
        
        // Paramètres pour les couleurs de terrain
        const rockHeight = 50; // Hauteur à partir de laquelle la roche apparaît
        const snowHeight = 120; // Hauteur à partir de laquelle la neige apparaît
        const minSnowHeight = 65; // Hauteur minimale absolue pour la neige
        const transitionNoiseScale = 0.01; // Échelle du bruit pour les transitions (plus petit = plus grand motif)
        const transitionNoiseStrength = 35; // Force du bruit pour les transitions (plus = plus irrégulier)
        
        // Couleurs vives pour l'effet low poly
        const grassColorValue = new THREE.Color(0x4CAF50);  // Vert vif
        const rockColorValue = new THREE.Color(0x795548);   // Marron
        const snowColorValue = new THREE.Color(0xFFFFFF);   // Blanc
        
        // Création de la géométrie carrée
        const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        
        // Génération des hauteurs avec noise
        const simplex = new SimplexNoise();
        const positions = geometry.attributes.position.array;
        
        function smoothStep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }
        
        // Appliquer le bruit pour générer les hauteurs avec style low poly
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            const dist = Math.sqrt(x * x + z * z);
            
            let height = 0;
            if (dist >= flatRadius) {
                // Fonction de bruit pour un effet plus angulaire
                const noise1 = simplex.noise(x * noiseScale1, z * noiseScale1);
                const noise2 = simplex.noise(x * noiseScale2, z * noiseScale2);
                
                // Accentuer les variations pour créer des pics plus prononcés
                const sharpNoise1 = Math.pow(Math.abs(noise1), 0.8) * Math.sign(noise1);
                const sharpNoise2 = Math.pow(Math.abs(noise2), 0.8) * Math.sign(noise2);
                
                const combinedNoise = octave1Weight * sharpNoise1 + octave2Weight * sharpNoise2;
                
                // Transition entre la zone plate et les montagnes
                const factor = smoothStep(flatRadius, flatRadius + transitionWidth, dist);
                
                // Calculer la hauteur finale
                height = hillAmplitude * combinedNoise * factor;
            }
            
            positions[i + 1] = height;
        }
        
        // Ne plus limiter le terrain à un rayon visible (suppression de la découpe circulaire)
        // Le terrain reste carré comme la géométrie d'origine
        
        geometry.attributes.position.needsUpdate = true;
        
        // Important pour l'effet low poly: ne pas lisser les normales
        // Pour un effet facetté, on calcule les normales par face plutôt que par vertex
        geometry.computeVertexNormals();
        
        // Triangulation aléatoire supplémentaire pour certaines faces (effet montagneux plus prononcé)
        const triangulateRandomFaces = () => {
            // Obtenir une copie de la géométrie
            const positionAttribute = geometry.getAttribute('position');
            const positions = positionAttribute.array;
            const indices = [];
            
            // Créer les indices de faces
            for (let i = 0; i < segments; i++) {
                for (let j = 0; j < segments; j++) {
                    const a = i * (segments + 1) + j;
                    const b = i * (segments + 1) + (j + 1);
                    const c = (i + 1) * (segments + 1) + j;
                    const d = (i + 1) * (segments + 1) + (j + 1);
                    
                    // Création aléatoire de la diagonale pour certaines faces pour un effet plus anguleux
                    if (Math.random() > 0.5) {
                        indices.push(a, b, d);
                        indices.push(a, d, c);
                    } else {
                        indices.push(a, b, c);
                        indices.push(b, d, c);
                    }
                }
            }
            
            geometry.setIndex(indices);
        };
        
        triangulateRandomFaces();
        
        // Pour un effet low poly, on n'utilise plus les textures mais des couleurs simples
        if (!this.terrainVertexShader || !this.terrainFragmentShader) {
            console.error("Les shaders du terrain ne sont pas chargés, utilisation du matériau standard.");
            
            // Fallback avec matériau standard
            const material = new THREE.MeshStandardMaterial({
                color: grassColorValue,
                roughness: 0.9,
                metalness: 0.0,
                flatShading: true, // Important pour l'effet low poly
                side: THREE.DoubleSide
            });
            
            this.outerGroundMesh = new THREE.Mesh(geometry, material);
        } else {
            // Récupération des valeurs initiales pour l'éclairage et le brouillard
            // Utiliser la direction normalisée du soleil pour l'éclairage
            const sunDirection = this.sunLight ? this.sunLight.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
            const sunColor = this.sunLight ? this.sunLight.color.clone() : new THREE.Color(0xFFFFFF);
            const sunIntensity = this.sunLight ? this.sunLight.intensity : 1.0;
            
            // S'assurer que l'intensité ambiante n'est pas trop élevée pour éviter le sur-éclairage
            const ambientColor = this.ambientLight ? this.ambientLight.color.clone() : new THREE.Color(0x404040);
            const ambientIntensity = this.ambientLight ? Math.min(this.ambientLight.intensity, 0.5) : 0.3;
            
            // Paramètres du brouillard
            const fogEnabled = !!this.experience.scene.fog;
            const fogColor = this.experience.scene.fog ? this.experience.scene.fog.color.clone() : new THREE.Color(0xCCCCCC);
            const fogNear = this.experience.scene.fog ? this.experience.scene.fog.near : 1000;
            const fogFar = this.experience.scene.fog ? this.experience.scene.fog.far : 2000;
            
            // Densité du brouillard (récupérer depuis la configuration si disponible)
            // Si la propriété fogDensity existe dans config, l'utiliser, sinon par défaut à 1.0
            const fogDensity = this.config && this.config.fogDensity !== undefined ? this.config.fogDensity : 1.0;
            
            // Vérifier et définir des couleurs vives pour un meilleur contraste
            const grassColorValue = new THREE.Color(0x4CAF50);  // Vert vif
            const rockColorValue = new THREE.Color(0x795548);   // Marron
            const snowColorValue = new THREE.Color(0xFFFFFF);   // Blanc
            
            // Log pour le diagnostic
            console.log('Création du terrain low poly avec les valeurs suivantes:');
            console.log('- rockHeight:', rockHeight);
            console.log('- snowHeight:', snowHeight);
            console.log('- sunDirection:', sunDirection);
            console.log('- sunIntensity:', sunIntensity);
            console.log('- ambientIntensity:', ambientIntensity);
            console.log('- fogEnabled:', fogEnabled);
            console.log('- fogDensity:', fogDensity);
            
            // Créer les textures procédurales pour le terrain
            const grassTexture = this.createProceduralGrassTexture();
            const rockTexture = this.createProceduralRockTexture();
            const snowTexture = this.createProceduralSnowTexture();
            
            // Log pour le diagnostic
            console.log('Création des textures procédurales:');
            console.log('- grassTexture:', grassTexture);
            console.log('- rockTexture:', rockTexture);
            console.log('- snowTexture:', snowTexture);
            
            // Ajouter les textures aux uniforms
            const uniforms = {
                // Paramètres pour le terrain
                uFlatRadius: { value: flatRadius },
                uTransitionWidth: { value: transitionWidth },
                uHillAmplitude: { value: hillAmplitude },
                uTerrainVisibleRadius: { value: width / 2 }, // Utiliser la moitié de la largeur comme référence
                uRockHeight: { value: rockHeight },
                uSnowHeight: { value: snowHeight },
                uMinSnowHeight: { value: minSnowHeight }, // Hauteur minimale absolue pour la neige
                uNoiseScale1: { value: noiseScale1 },
                uNoiseScale2: { value: noiseScale2 },
                uOctave1Weight: { value: octave1Weight },
                uOctave2Weight: { value: octave2Weight },
                uGrassColor: { value: grassColorValue },
                uRockColor: { value: rockColorValue },
                uSnowColor: { value: snowColorValue },
                // Nouveaux paramètres pour transitions non-linéaires
                uTransitionNoiseScale: { value: transitionNoiseScale },
                uTransitionNoiseStrength: { value: transitionNoiseStrength },
                
                // Paramètres pour la lumière
                uSunPosition: { value: sunDirection },
                uSunColor: { value: sunColor },
                uSunIntensity: { value: sunIntensity },
                uAmbientColor: { value: ambientColor },
                uAmbientIntensity: { value: ambientIntensity },
                
                // Paramètres pour le brouillard
                uFogColor: { value: fogColor },
                uFogNear: { value: fogNear },
                uFogFar: { value: fogFar },
                uFogEnabled: { value: fogEnabled },
                uFogDensity: { value: fogDensity },
                
                // Textures procédurales
                uGrassTexture: { value: grassTexture },
                uRockTexture: { value: rockTexture },
                uSnowTexture: { value: snowTexture },
            };
            
            const material = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: this.terrainVertexShader,
                fragmentShader: this.terrainFragmentShader,
                side: THREE.DoubleSide,
                // Important: ne pas lisser entre les facettes pour obtenir l'effet low poly
                flatShading: true
            });
            
            this.outerGroundMesh = new THREE.Mesh(geometry, material);
        }
        
        this.outerGroundMesh.position.y = -0.1;
        this.outerGroundMesh.receiveShadow = true;
        this.outerGroundMesh.castShadow = true; // Permettre aux montagnes de projeter des ombres
        this.outerGroundMesh.name = "OuterGround_LowPoly_Mountains_Square";
        this.scene.add(this.outerGroundMesh);
        
        // Supprimer les anciennes textures car elles ne sont plus utilisées
        if (this.grassTexture) {
            this.grassTexture.dispose();
            this.grassTexture = null;
        }
        if (this.rockTexture) {
            this.rockTexture.dispose();
            this.rockTexture = null;
        }
        if (this.snowTexture) {
            this.snowTexture.dispose();
            this.snowTexture = null;
        }
        
        //console.log(`Terrain low poly carré créé. Segments: ${segments}, Amplitude: ${hillAmplitude}`);
    }

    destroy() {
        //console.log("Nettoyage de l'environnement (Shader Skybox, Lune, Nuages Instanciés)...");
        // Lumières, Skybox, Étoiles, Sol Extérieur, Lune (INCHANGÉ)
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        if (this.moonLight) this.scene.remove(this.moonLight);
        if (this.skyBox) { this.scene.remove(this.skyBox); this.skyBox.geometry?.dispose(); this.skyBox.material?.dispose(); this.skyBox = null; }
        if (this.starsMesh) { this.scene.remove(this.starsMesh); this.starsMesh.geometry?.dispose(); this.starsMesh.material?.dispose(); this.starsMesh = null; }
        
        // Nettoyer le terrain et ses textures
        if (this.outerGroundMesh) {
            this.scene.remove(this.outerGroundMesh);
            
            // Nettoyer les textures du shader
            if (this.outerGroundMesh.material && this.outerGroundMesh.material.uniforms) {
                const uniforms = this.outerGroundMesh.material.uniforms;
                
                // Disposer les textures procédurales si elles existent
                if (uniforms.uGrassTexture && uniforms.uGrassTexture.value) {
                    uniforms.uGrassTexture.value.dispose();
                }
                if (uniforms.uRockTexture && uniforms.uRockTexture.value) {
                    uniforms.uRockTexture.value.dispose();
                }
                if (uniforms.uSnowTexture && uniforms.uSnowTexture.value) {
                    uniforms.uSnowTexture.value.dispose();
                }
            }
            
            this.outerGroundMesh.geometry?.dispose();
            this.outerGroundMesh.material?.dispose();
            this.outerGroundMesh = null;
        }
        
        if (this.moonMesh) { this.scene.remove(this.moonMesh); this.moonMesh.geometry?.dispose(); this.moonMesh.material?.dispose(); this.moonMesh = null; }
        
        // Nettoyer les anciennes textures si elles existent encore
        if (this.grassTexture) this.grassTexture.dispose();
        if (this.rockTexture) this.rockTexture.dispose();
        if (this.snowTexture) this.snowTexture.dispose();
        if (this.outerGroundTexture) this.outerGroundTexture.dispose();
        
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
            
            // Mettre à jour les uniforms du terrain s'il est disponible avec un matériau shader
            if (this.outerGroundMesh && this.outerGroundMesh.material && this.outerGroundMesh.material.uniforms) {
                const uniforms = this.outerGroundMesh.material.uniforms;
                
                // Mise à jour des paramètres de lumière
                if (this.sunLight) {
                    // Utiliser la position normalisée pour une meilleure direction d'éclairage
                    const sunDirection = this.sunLight.position.clone().normalize();
                    uniforms.uSunPosition.value.copy(sunDirection);
                    uniforms.uSunColor.value.copy(this.sunLight.color);
                    uniforms.uSunIntensity.value = this.sunLight.intensity;
                }
                
                if (this.ambientLight) {
                    uniforms.uAmbientColor.value.copy(this.ambientLight.color);
                    uniforms.uAmbientIntensity.value = this.ambientLight.intensity;
                }
                
                // Mise à jour des paramètres de brouillard
                if (this.experience.scene.fog) {
                    uniforms.uFogEnabled.value = true;
                    uniforms.uFogColor.value.copy(this.experience.scene.fog.color);
                    
                    // Si c'est un brouillard linéaire, conserver les valeurs near et far
                    if (this.experience.scene.fog.isFog) {
                        uniforms.uFogNear.value = this.experience.scene.fog.near;
                        uniforms.uFogFar.value = this.experience.scene.fog.far;
                    }
                    
                    // Pour le brouillard exponentiel, obtenir directement la densité brute
                    // Cela correspond exactement à l'approche utilisée pour les oiseaux
                    if (this.experience.scene.fog.isFogExp2) {
                        // Utiliser directement la densité du brouillard de la scène
                        uniforms.uFogDensity.value = this.experience.scene.fog.density;
                    } else {
                        // Pour les brouillards non-exponentiels, convertir depuis fogEffect si disponible
                        if (this.weatherSystem && this.weatherSystem.fogEffect) {
                            // Obtenir la densité normalisée (0-1)
                            const normalizedDensity = this.weatherSystem.fogEffect.fogDensity;
                            // Convertir en densité exponentielle comparable à FogExp2
                            // La formule correspond à celle utilisée dans FogEffect.js
                            const minFogExp = 0;
                            const maxFogExp = 0.02;
                            uniforms.uFogDensity.value = normalizedDensity * (maxFogExp - minFogExp) + minFogExp;
                        } else {
                            // Fallback si aucune source disponible
                            uniforms.uFogDensity.value = 0.005; // Valeur moyenne faible
                        }
                    }
                } else {
                    // Si le brouillard est désactivé dans la scène
                    uniforms.uFogEnabled.value = false;
                    uniforms.uFogDensity.value = 0.0;
                }
            }
            
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

    /**
     * Crée les textures pour le terrain (herbe, roche, neige)
     * Note: Ces textures ne sont plus utilisées dans la version low poly
     * qui utilise des couleurs plates à la place
     */
    createTerrainTextures() {
        // Cette méthode est conservée pour compatibilité mais n'est plus utilisée
        // car nous utilisons maintenant des couleurs plates pour l'effet low poly
    }

    /**
     * Crée une texture procédurale pour l'herbe
     * @returns {THREE.Texture} Texture générée
     */
    createProceduralGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Couleur de base pour l'herbe
        ctx.fillStyle = '#4a8c3d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter des variations pour simuler de l'herbe
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 3 + 1;
            
            // Variation de la couleur de l'herbe
            const hue = 90 + Math.random() * 30; // vert avec variation
            const saturation = 50 + Math.random() * 30;
            const lightness = 30 + Math.random() * 20;
            
            ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            
            // Dessiner de petites brins d'herbe (lignes verticales)
            const grassHeight = Math.random() * 6 + 3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - grassHeight);
            ctx.lineWidth = size;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.stroke();
        }
        
        // Ajouter des textures de sol entre les herbes
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 4 + 2;
            
            // Couleur de terre
            const brownHue = 30 + Math.random() * 20;
            const brownSat = 30 + Math.random() * 20;
            const brownLight = 20 + Math.random() * 15;
            
            ctx.fillStyle = `hsl(${brownHue}, ${brownSat}%, ${brownLight}%)`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 5); // Répéter pour éviter des textures trop grandes/évidentes
        
        return texture;
    }

    /**
     * Crée une texture procédurale pour la roche
     * @returns {THREE.Texture} Texture générée
     */
    createProceduralRockTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Couleur de base pour la roche
        ctx.fillStyle = '#656565';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter de la texture de base avec du bruit
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // Ajouter du bruit pour créer une texture de roche
            const noise = Math.random() * 30 - 15;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
            data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise)); // G
            data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise)); // B
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Ajouter des fissures et lignes pour simuler des roches
        for (let i = 0; i < 100; i++) {
            const x1 = Math.random() * canvas.width;
            const y1 = Math.random() * canvas.height;
            const length = Math.random() * 100 + 20;
            const angle = Math.random() * Math.PI;
            
            const x2 = x1 + Math.cos(angle) * length;
            const y2 = y1 + Math.sin(angle) * length;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = Math.random() * 2 + 0.5;
            ctx.strokeStyle = `rgba(40, 40, 40, ${Math.random() * 0.5 + 0.2})`;
            ctx.stroke();
        }
        
        // Ajouter des taches plus claires et plus foncées
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 15 + 5;
            
            // Alternance entre taches claires et foncées
            const shade = Math.random() > 0.5 ? 
                `rgba(100, 100, 100, ${Math.random() * 0.3 + 0.1})` : 
                `rgba(50, 50, 50, ${Math.random() * 0.3 + 0.1})`;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = shade;
            ctx.fill();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
        
        return texture;
    }

    /**
     * Crée une texture procédurale pour la neige
     * @returns {THREE.Texture} Texture générée
     */
    createProceduralSnowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Couleur de base pour la neige
        ctx.fillStyle = '#f0f5f9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter de légères variations pour la texture de neige
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // Légères variations pour donner un aspect poudreux
            const variation = Math.random() * 15;
            data[i] = Math.max(220, Math.min(255, data[i] - variation));     // R
            data[i+1] = Math.max(220, Math.min(255, data[i+1] - variation)); // G
            data[i+2] = Math.max(240, Math.min(255, data[i+2])); // B - garder une teinte légèrement bleutée
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Ajouter des scintillements pour la neige
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 2 + 0.5;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fill();
        }
        
        // Ajouter quelques ombres subtiles pour donner du relief
        for (let i = 0; i < 300; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 10 + 5;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 210, 230, ${Math.random() * 0.2 + 0.1})`;
            ctx.fill();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        
        return texture;
    }
}