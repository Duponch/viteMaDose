// src/World/Environment.js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

        // Config spécifique aux nuages instanciés (peut être mise dans CityManager.config si besoin)
        this.numberOfCloudBaseShapes = 5; // Combien de formes de base différentes
        this.totalNumberOfClouds = 50;   // Combien de nuages au total à afficher
        this.cloudAnimationSpeed = 0.00005; // Vitesse de base de l'animation

        this.mapSize = this.config.mapSize + 550;
        this.outerGroundDisplayRadius = 0;

        // --- Propriétés Cycle Jour/Nuit --- (INCHANGÉ)
        this.cycleEnabled = this.config.dayNightCycleEnabled;
        this.dayDurationMs = this.config.dayDurationMinutes * 60 * 1000;
        const initialNormalizedTime = this.config.startTimeOfDay !== undefined ? this.config.startTimeOfDay : 0.25;
        this.cycleTime = (this.dayDurationMs * initialNormalizedTime) % this.dayDurationMs;
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
        this.moonSize = 20;

        this.vertexShaderCode = null;
        this.fragmentShaderCode = null;
        this.isInitialized = false;
        this.skyBox = null; this.starsMesh = null; this.outerGroundMesh = null;
        this.skyboxRadius = 0;

        // --- NOUVEAU: Pour les nuages instanciés ---
        this.cloudGroup = new THREE.Group(); // Contiendra les InstancedMesh
        this.cloudGroup.name = "InstancedCloudsGroup";
        this.cloudMaterial = null; // Défini dans setCloudMaterial
        this.cloudBaseGeometries = []; // Stocke les K géométries de base
        this.cloudInstancedMeshes = []; // Stocke les K InstancedMesh
        // -----------------------------------------

        // --- Appels d'initialisation ---
        this.setSunLight();
        this.setAmbientLight();
        this.setMoonLight();
        this.setCloudMaterial(); // Crée le matériau partagé
    }

    async initialize() {
        console.log("Environment: Initialisation asynchrone...");
        try {
            // --- Chargement Shaders --- (INCHANGÉ)
            const [vertexResponse, fragmentResponse] = await Promise.all([
                fetch('src/World/Shaders/skyVertex.glsl'),
                fetch('src/World/Shaders/skyFragment.glsl')
            ]);
            if (!vertexResponse.ok || !fragmentResponse.ok) { throw new Error(`Erreur chargement shaders: VS=${vertexResponse.status}, FS=${fragmentResponse.status}`); }
            this.vertexShaderCode = await vertexResponse.text();
            this.fragmentShaderCode = await fragmentResponse.text();
            console.log("Environment: Shaders chargés.");

            // --- Création Éléments Scène ---
            this.renderSkybox(); // Définit les rayons/distances
            this.outerGroundDisplayRadius = this.skyboxRadius + 10;
            this.createOuterGround();
            this.createStarsPoints();
            this.createMoonMesh();

            // --- NOUVEAU: Création des nuages instanciés ---
            this.createInstancedClouds(); // Appel de la nouvelle fonction
            this.scene.add(this.cloudGroup); // Ajoute le groupe contenant les InstancedMesh
            // ----------------------------------------------

            this.updateDayNightCycle(0); // Applique l'état initial
            this.isInitialized = true;
            console.log("Environment: Initialisation terminée.");
        } catch (error) { console.error("Environment: Erreur init:", error); }
    }

	setCloudMaterial() {
        this.cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,       // Blanc
            roughness: 0.9,        // Peu brillant
            metalness: 0.1,
            flatShading: true,     // Style Low Poly
            transparent: true,     // <-- AJOUTER : Activer la transparence
            opacity: 0.4          // <-- AJOUTER : Niveau d'opacité (0.0 = invisible, 1.0 = opaque)
            // Optionnel: si vous rencontrez des problèmes de rendu/tri avec la transparence:
            // depthWrite: false
        });
         console.log("Matériau Low Poly transparent pour les nuages créé.");
    }

	createLowPolyCloudGeometry() {
        const cloudPartGeometries = [];
        const baseGeometry = new THREE.IcosahedronGeometry(5, 0); // Rayon 5, détail 0

        // --- RANDOMISATION ---
        const numParts = THREE.MathUtils.randInt(4, 8); // Nombre aléatoire de parties
        const maxOffset = 6;
        const minPartScale = 0.4;
        const maxPartScale = 1.2;
        // --------------------

        for (let i = 0; i < numParts; i++) {
            const randomPosition = new THREE.Vector3(
                (Math.random() - 0.5) * 2 * maxOffset,
                (Math.random() - 0.5) * 2 * maxOffset * 0.5,
                (Math.random() - 0.5) * 2 * maxOffset
            );
            const randomScale = THREE.MathUtils.randFloat(minPartScale, maxPartScale);
            const scaleVector = new THREE.Vector3(randomScale, randomScale, randomScale);
            const matrix = new THREE.Matrix4();
            matrix.compose(randomPosition, new THREE.Quaternion(), scaleVector);

            const clonedGeom = baseGeometry.clone();
            clonedGeom.applyMatrix4(matrix);
            cloudPartGeometries.push(clonedGeom);
        }

        const mergedGeometry = mergeGeometries(cloudPartGeometries, false);
        cloudPartGeometries.forEach(geom => geom.dispose());
        baseGeometry.dispose();

        if (mergedGeometry) {
            mergedGeometry.center(); // Centrer la forme finale
            return mergedGeometry;
        } else {
            console.warn("Échec de la fusion de la géométrie du nuage aléatoire.");
            return new THREE.IcosahedronGeometry(8, 0); // Fallback
        }
    }

	createInstancedClouds() {
        if (!this.cloudMaterial) {
            console.error("Impossible de créer les nuages instanciés: matériau non défini.");
            return;
        }
        if (this.cloudInstancedMeshes.length > 0 || this.cloudBaseGeometries.length > 0) {
             console.warn("Tentative de recréer les nuages instanciés alors qu'ils existent déjà.");
             return;
         }

        console.log(`Création du pool de ${this.numberOfCloudBaseShapes} formes de base de nuages...`);
        // 1. Générer les K formes de base
        for (let i = 0; i < this.numberOfCloudBaseShapes; i++) {
            this.cloudBaseGeometries.push(this.createLowPolyCloudGeometry());
        }
        console.log(`${this.cloudBaseGeometries.length} formes de base générées.`);

        // 2. Créer les K InstancedMesh
        const instancesPerMesh = Math.ceil(this.totalNumberOfClouds / this.numberOfCloudBaseShapes);
        console.log(`Création de ${this.numberOfCloudBaseShapes} InstancedMesh (environ ${instancesPerMesh} instances chacun) pour un total de ${this.totalNumberOfClouds} nuages.`);

        this.cloudBaseGeometries.forEach((baseGeom, index) => {
            const instancedMesh = new THREE.InstancedMesh(
                baseGeom,
                this.cloudMaterial,
                instancesPerMesh
            );
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = false; // Les nuages ne reçoivent généralement pas bien les ombres
            instancedMesh.name = `InstancedCloudMesh_${index}`;

            this.cloudInstancedMeshes.push(instancedMesh);
            this.cloudGroup.add(instancedMesh); // Ajouter au groupe principal des nuages
        });

        // 3. Placer les instances
        const skyHeight = 230;
        const spreadRadius = this.config.mapSize * 0.8;
        const scaleMin = 0.8; // Ajuster la plage d'échelle globale si besoin
        const scaleMax = 12.0;

        let currentInstanceIndex = 0;
        const instanceCounters = new Array(this.numberOfCloudBaseShapes).fill(0); // Compteur pour chaque InstancedMesh

        while(currentInstanceIndex < this.totalNumberOfClouds) {
             // Choisir à quel InstancedMesh appartient cette instance
            const meshIndex = currentInstanceIndex % this.numberOfCloudBaseShapes;
            const targetInstancedMesh = this.cloudInstancedMeshes[meshIndex];
            const indexInMesh = instanceCounters[meshIndex]; // Obtenir l'index DANS cet InstancedMesh

            // S'assurer qu'on ne dépasse pas la taille allouée (important si total / K n'est pas entier)
             if (indexInMesh < targetInstancedMesh.count) {
                // Calculer la transformation aléatoire
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * spreadRadius;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const y = skyHeight + (Math.random() - 0.5) * 90;
                const randomYRotation = Math.random() * Math.PI * 2;
                const randomScale = THREE.MathUtils.randFloat(scaleMin, scaleMax);

                _tempPosition.set(x, y, z);
                _tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomYRotation);
                _tempScale.set(randomScale, randomScale, randomScale);

                _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);

                // Appliquer la matrice à l'instance correcte dans le bon InstancedMesh
                targetInstancedMesh.setMatrixAt(indexInMesh, _tempMatrix);

                instanceCounters[meshIndex]++; // Incrémenter le compteur pour ce mesh spécifique
            }
            currentInstanceIndex++; // Passer à l'instance globale suivante
        }


        // Marquer les matrices comme nécessitant une mise à jour
        this.cloudInstancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });

        console.log(`Placement terminé pour ${currentInstanceIndex} instances de nuages distribuées sur ${this.cloudInstancedMeshes.length} InstancedMesh.`);
    }
    // -------------------------------------------------------------------


    // ... (votre code existant pour setSunLight, setAmbientLight, setMoonLight, renderSkybox, etc.) ...

    // --- NOUVEAU : Méthode pour créer les instances de nuages ---
    createClouds() {
        if (!this.cloudMaterial) {
             console.error("Impossible de créer les nuages: matériau non défini.");
             return;
         }
        if (this.cloudGroup.children.length > 0) {
             console.warn("Tentative de recréer les nuages alors qu'ils existent déjà.");
             return;
         }

        const numberOfClouds = 10;
        const skyHeight = 150;
        const spreadRadius = this.config.mapSize * 0.8;

        console.log(`Création de ${numberOfClouds} nuages (taille variable, transparents)...`);

        for (let i = 0; i < numberOfClouds; i++) {
            const cloudGeometry = this.createLowPolyCloudGeometry();
            const cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);

            // Position aléatoire
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spreadRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = skyHeight + (Math.random() - 0.5) * 40;
            cloudMesh.position.set(x, y, z);

            // Rotation aléatoire
            cloudMesh.rotation.y = Math.random() * Math.PI * 2;

            // --- MODIFIÉ : Échelle aléatoire avec une plus grande plage ---
            // Exemple: échelle allant de 0.5 à 4.0 (0.5 + 3.5 * 1.0)
            const scale = 0.5 + Math.random() * 10;
            cloudMesh.scale.set(scale, scale, scale);
            // -----------------------------------------------------------

            // Ombres (inchangé)
            cloudMesh.castShadow = true;

            cloudMesh.name = `Cloud_${i}`;
            this.cloudGroup.add(cloudMesh);
        }

        this.scene.add(this.cloudGroup);
        console.log("Groupe de nuages (taille variable, transparents) ajouté à la scène.");
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
        console.log("Nettoyage de l'environnement (Shader Skybox, Lune, Nuages Instanciés)...");
        // Lumières, Skybox, Étoiles, Sol Extérieur, Lune (INCHANGÉ)
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        if (this.moonLight) this.scene.remove(this.moonLight);
        if (this.skyBox) { this.scene.remove(this.skyBox); this.skyBox.geometry?.dispose(); this.skyBox.material?.dispose(); this.skyBox = null; }
        if (this.starsMesh) { this.scene.remove(this.starsMesh); this.starsMesh.geometry?.dispose(); this.starsMesh.material?.dispose(); this.starsMesh = null; }
        if (this.outerGroundMesh) { this.scene.remove(this.outerGroundMesh); this.outerGroundMesh.geometry?.dispose(); this.outerGroundMesh.material?.dispose(); this.outerGroundMesh = null; }
        if (this.moonMesh) { this.scene.remove(this.moonMesh); this.moonMesh.geometry?.dispose(); this.moonMesh.material?.dispose(); this.moonMesh = null; }

        // --- Nettoyage spécifique aux Nuages Instanciés ---
        if (this.cloudGroup) {
            // Retirer les InstancedMesh du groupe et de la scène
            this.cloudInstancedMeshes.forEach(mesh => {
                this.cloudGroup.remove(mesh);
                // La géométrie est disposée via cloudBaseGeometries ci-dessous
                // Le matériau est disposé via cloudMaterial ci-dessous
            });
            if(this.cloudGroup.parent) this.cloudGroup.parent.remove(this.cloudGroup);
            this.cloudInstancedMeshes = []; // Vider le tableau
        }
        this.cloudGroup = null;

        // Disposer les géométries de base uniques
        this.cloudBaseGeometries.forEach(geom => geom.dispose());
        this.cloudBaseGeometries = []; // Vider le tableau
        console.log("Géométries de base des nuages disposées.");

        // Disposer le matériau partagé des nuages
        if (this.cloudMaterial) {
            this.cloudMaterial.dispose();
            this.cloudMaterial = null;
            console.log("Matériau des nuages disposé.");
        }
        // ---------------------------------------------------

        // Nullification des références (INCHANGÉ)
        this.sunLight = null; this.ambientLight = null; this.moonLight = null;
        console.log("Environnement nettoyé.");
    }
    // ------------------------------------

    // --- MÉTHODE UPDATE MODIFIÉE ---
    update(deltaTime) {
        // Appeler updateDayNightCycle seulement si initialisé
        if (this.isInitialized) {
            this.updateDayNightCycle(deltaTime);

            // --- Animation des nuages instanciés ---
            const actualCloudSpeed = this.cloudAnimationSpeed * deltaTime;
            const limit = this.config.mapSize * 1.2; // Limite avant de réapparaître

            this.cloudInstancedMeshes.forEach(instancedMesh => {
                let needsMatrixUpdate = false; // Drapeau pour ce mesh

                for (let i = 0; i < instancedMesh.count; i++) {
                    instancedMesh.getMatrixAt(i, _tempMatrix); // Récupérer la matrice actuelle
                    _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale); // Décomposer

                    // Appliquer le mouvement
                    _tempPosition.x += actualCloudSpeed * (_tempScale.x * 10); // Vitesse dépend de l'échelle

                    // Logique de wrap-around
                    if (_tempPosition.x > limit) {
                        _tempPosition.x = -limit;
                        // Optionnel: changer Z aussi pour varier la trajectoire de retour
                         _tempPosition.z = (Math.random() - 0.5) * (this.config.mapSize * 1.6);
                    }

                    // Recomposer la matrice avec la nouvelle position
                    _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                    instancedMesh.setMatrixAt(i, _tempMatrix); // Remettre la matrice à jour
                    needsMatrixUpdate = true; // Marquer que ce mesh a besoin d'une màj
                }

                // Mettre à jour instanceMatrix UNE SEULE FOIS par mesh, si des instances ont bougé
                if (needsMatrixUpdate) {
                    instancedMesh.instanceMatrix.needsUpdate = true;
                }
            });
            // -----------------------------------
        }
    }
}