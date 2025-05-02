// src/World/Environment.js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Calendar from '../Utils/Calendar.js';

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
        this.totalNumberOfClouds = 30;   // Combien de nuages au total à afficher
        this.cloudAnimationSpeed = 0.00005; // Vitesse de base de l'animation

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

        // --- NOUVEAU: Pour les nuages instanciés ---
        this.cloudGroup = new THREE.Group(); // Contiendra les InstancedMesh
        this.cloudGroup.name = "InstancedCloudsGroup";
        this.cloudMaterial = null; // Défini dans setCloudMaterial
        this.cloudBaseGeometries = []; // Stocke les K géométries de base
        this.cloudInstancedMeshes = []; // Stocke les K InstancedMesh
        // -----------------------------------------

        // --- Intégration du calendrier ---
        // Permet de configurer aisément la date de départ depuis le fichier de configuration global.
        // Si aucune date n'est fournie, on utilise un lundi par défaut (2025-04-21) afin
        // d'éviter que le jeu ne démarre systématiquement un week-end et que tous les citoyens
        // restent chez eux pendant la phase de test.
        const calendarStartDate = this.config?.calendarStartDate ?? '2025-04-21'; // Lundi
        this.calendar = new Calendar({
            startDate: calendarStartDate,
            dayDurationMs: this.dayDurationMs
        });

        // --- Appels d'initialisation ---
        this.setSunLight();
        this.setAmbientLight();
        this.setMoonLight();
        this.setCloudMaterial(); // Crée le matériau partagé
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
        const numParts = THREE.MathUtils.randInt(6, 10); // Nombre aléatoire de parties
        const maxOffset = 6;
        const minPartScale = 0.3;
        const maxPartScale = 0.7;
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

        const numberOfClouds = 7;
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
        this.moonDistance = this.skyboxRadius * 1.1;  // Distance de la lune (légèrement plus proche ?)
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

    updateDayNightCycle() { // Suppression du paramètre deltaTime
        // Vérifications initiales
        if (!this.isInitialized || !this.cycleEnabled || !this.dayDurationMs || this.dayDurationMs <= 0) {
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
                this.experience.scene.fog.color.copy(this.skyUniforms.uCurrentZenithColor.value);
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
        // Mettre à jour seulement si l'environnement est initialisé
        if (this.isInitialized) {

            // 1. Mettre à jour le cycle Jour/Nuit (calcul couleurs, positions soleil/lune)
            // Cette fonction utilise deltaTime pour faire avancer this.cycleTime
			this.updateDayNightCycle(); // Utilise le temps global depuis experience.time

            // 2. Animer les éléments (ex: nuages)
            // Vérifier si des nuages instanciés existent
            if (this.cloudInstancedMeshes.length > 0) {
                const actualCloudSpeed = this.cloudAnimationSpeed * deltaTime; // Vitesse ajustée au delta time
                // Utiliser une limite basée sur la taille de la skybox ou une valeur fixe grande
                const limit = (this.skyboxRadius || this.config.mapSize * 1.5) * 1.1;

                // Boucler sur chaque InstancedMesh de nuages
                this.cloudInstancedMeshes.forEach(instancedMesh => {
                    let needsMatrixUpdate = false; // Drapeau pour ce mesh spécifique

                    // Boucler sur chaque instance DANS ce mesh
                    for (let i = 0; i < instancedMesh.count; i++) {
                        instancedMesh.getMatrixAt(i, _tempMatrix); // Récupérer la matrice actuelle
                        _tempMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale); // Décomposer

                        // Appliquer le mouvement (simple déplacement sur X)
                        // La vitesse peut dépendre de l'échelle pour un effet de parallaxe
                        _tempPosition.x += actualCloudSpeed * (_tempScale.x * 10 + 500); // Ajuster multiplicateur

                        // Logique de "wrap-around" (réapparition de l'autre côté)
                        if (_tempPosition.x > limit) {
                            _tempPosition.x = -limit; // Réapparaît à gauche
                            // Optionnel: changer Z ou Y pour varier la trajectoire de retour
                             _tempPosition.z = (Math.random() - 0.5) * limit * 1.5; // Position Z aléatoire
                             _tempPosition.y = 230 + (Math.random() - 0.5) * 90; // Hauteur aléatoire
                             // Peut-être aussi changer l'échelle ou la rotation au retour ?
                        }

                        // Recomposer la matrice avec la nouvelle position
                        _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
                        instancedMesh.setMatrixAt(i, _tempMatrix); // Remettre la matrice à jour
                        needsMatrixUpdate = true; // Marquer que ce mesh a besoin d'une màj GPU
                    }

                    // Mettre à jour instanceMatrix UNE SEULE FOIS par mesh, si des instances ont bougé
                    if (needsMatrixUpdate) {
                        instancedMesh.instanceMatrix.needsUpdate = true;
                    }
                }); // Fin boucle sur InstancedMeshes
            } // Fin animation nuages
        } // Fin if (isInitialized)
    }

    /**
     * Retourne la date courante du jeu (jour, mois, année, jour de la semaine, etc.)
     */
    getCurrentCalendarDate() {
        // Utilise le temps de jeu écoulé
        return this.calendar.getCurrentDate(this.experience.time.elapsed);
    }
}