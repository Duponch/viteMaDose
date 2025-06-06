/**
 * Effet d'éclairs pour le système météorologique
 * Ajoute des flashs lumineux et des formes d'éclairs dans le ciel
 */
import * as THREE from 'three';

export default class LightningEffect {
    /**
     * @param {Object} weatherSystem - Référence au système météorologique principal
     */
    constructor(weatherSystem) {
        this.weatherSystem = weatherSystem;
        this.experience = this.weatherSystem.experience;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;
        this.time = this.experience.time;
        
        // Configuration
        this.enabled = true;
        this.intensity = 0; // 0 = pas d'éclairs, 1 = éclairs maximum
        this.lastLightningTime = performance.now();
        this.lightningDuration = 300; // durée d'un éclair principal en ms (augmenté de 150 à 300)
        this.subLightningDuration = 200; // durée d'un sous-éclair en ms (augmenté de 30 à 100)
        this.currentLightningAlpha = 0;
        this.isLightningActive = false;
        this.subLightnings = []; // Tableau pour stocker les sous-éclairs
        this.maxSubLightnings = 5; // Nombre maximum de sous-éclairs
        this.subLightningDelay = 0.4; // Délai entre chaque sous-éclair en ms
        
        // Performance: pré-calculer les couleurs d'éclairs pour éviter les allocations
        this.lightningColors = {
            zenith: new THREE.Color(0x8888aa),
            middle: new THREE.Color(0x7777aa),
            horizon: new THREE.Color(0x6666aa),
            top: new THREE.Color(0x777788),
            bottom: new THREE.Color(0x444466)
        };
        
        // Pré-créer les couleurs d'interpolation pour éviter les allocations en temps réel
        this.tempColor = new THREE.Color(); // Couleur réutilisable pour les interpolations
        
        // Création des éléments visuels
        this.setupLightningLight();
        this.setupSkyIllumination();
        this.setupLightningMeshes();
        
        // Définir une fréquence maximale de déclenchement (limiter à 2 par seconde max)
        this.minTimeBetweenLightnings = 500; // ms
        
        //console.log("Effet d'éclairs initialisé");
    }
    
    /**
     * Configure la lumière principale pour les flashs d'éclairs
     */
    setupLightningLight() {
        // Lumière ambiante pour l'éclair (flash global)
        this.lightningLight = new THREE.AmbientLight(0xffffff, 0);
        this.scene.add(this.lightningLight);
        
        // Lumière directionnelle pour un effet plus dramatique
        this.lightningDirectional = new THREE.DirectionalLight(0xeeeeff, 0);
        this.lightningDirectional.position.set(0, 1, 0);
        this.scene.add(this.lightningDirectional);
    }
    
    /**
     * Configure l'illumination du ciel lors des éclairs
     */
    setupSkyIllumination() {
        // Performance: éviter les vérifications profondes avec des opérateurs optionnels
        const env = this.weatherSystem.environment;
        if (!env || !env.skyUniforms) return;
        
        this.skyUniforms = env.skyUniforms;
        this.originalSkyValues = {};
        
        // Sauvegarde des couleurs originales - seulement une fois à l'initialisation
        this.cacheOriginalSkyColors();
        
        // Ajouter un grand dôme lumineux simple pour le flash global (moins coûteux que de modifier les shaders)
        const skyDomeGeometry = new THREE.SphereGeometry(800, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        this.skyDomeMaterial = new THREE.MeshBasicMaterial({
            color: 0x8888ff,
            transparent: true,
            opacity: 0,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        
        this.skyDome = new THREE.Mesh(skyDomeGeometry, this.skyDomeMaterial);
        this.skyDome.position.y = 0;
        this.skyDome.rotation.x = Math.PI;
        this.scene.add(this.skyDome);
    }
    
    /**
     * Met en cache les couleurs originales du ciel pour les restaurer plus tard
     * Optimisation: Fait une seule fois à l'initialisation
     */
    cacheOriginalSkyColors() {
        // On utilise des couleurs non-référencées (clones) pour éviter de modifier les originales
        if (this.skyUniforms.uTopColor && this.skyUniforms.uTopColor.value) {
            this.originalSkyValues.topColor = this.skyUniforms.uTopColor.value.clone();
        }
        
        if (this.skyUniforms.uBottomColor && this.skyUniforms.uBottomColor.value) {
            this.originalSkyValues.bottomColor = this.skyUniforms.uBottomColor.value.clone();
        }
        
        if (this.skyUniforms.uCurrentZenithColor && this.skyUniforms.uCurrentZenithColor.value) {
            this.originalSkyValues.zenithColor = this.skyUniforms.uCurrentZenithColor.value.clone();
        }
        
        if (this.skyUniforms.uCurrentMiddleColor && this.skyUniforms.uCurrentMiddleColor.value) {
            this.originalSkyValues.middleColor = this.skyUniforms.uCurrentMiddleColor.value.clone();
        }
        
        if (this.skyUniforms.uCurrentHorizonColor && this.skyUniforms.uCurrentHorizonColor.value) {
            this.originalSkyValues.horizonColor = this.skyUniforms.uCurrentHorizonColor.value.clone();
        }
    }
    
    /**
     * Configure les maillages pour représenter visuellement les éclairs
     */
    setupLightningMeshes() {
        this.lightningMeshes = [];
        this.maxLightningBolts = 3; // Réduit pour améliorer les performances
        
        // Optimisation: réutiliser le même matériau pour tous les éclairs
        this.lightningMaterial = new THREE.MeshBasicMaterial({
            color: 0xeeeeff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            fog: false, // Désactive l'effet du brouillard
            blending: THREE.AdditiveBlending // Rend les éclairs plus visibles
        });
        
        // Géométrie plus simple pour les éclairs (moins de segments)
        for (let i = 0; i < this.maxLightningBolts; i++) {
            const lightningMesh = this.createLightningBolt();
            this.lightningMeshes.push(lightningMesh);
            this.scene.add(lightningMesh);
            lightningMesh.visible = false;
        }
    }
    
    /**
     * Crée un maillage représentant un éclair avec une forme en zigzag
     * @returns {THREE.Mesh} Le maillage de l'éclair
     */
    createLightningBolt() {
        // Paramètres pour l'éclair en zigzag
        const height = 300 + Math.random() * 100; // Hauteur totale de l'éclair
        const segments = 8 + Math.floor(Math.random() * 4); // Nombre de segments (plus élevé pour plus de détails)
        const maxOffset = 30; // Déviation maximale du zigzag
        const thickness = 1.2 + Math.random() * 2; // Épaisseur de l'éclair
        
        // Créer la géométrie en forme de zigzag
        const points = [];
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Créer les points du zigzag
        const zigzagPoints = [];
        zigzagPoints.push(new THREE.Vector3(0, 0, 0)); // Point de départ (haut)
        
        // Générer le chemin en zigzag vers le bas
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const y = -t * height;
            // Plus de zigzag au milieu, moins aux extrémités
            const intensity = Math.sin(t * Math.PI);
            const x = (Math.random() - 0.5) * maxOffset * 2 * intensity;
            zigzagPoints.push(new THREE.Vector3(x, y, 0));
        }
        
        // Dernier point (bas)
        zigzagPoints.push(new THREE.Vector3(
            (Math.random() - 0.5) * maxOffset * 0.5, 
            -height, 
            0
        ));
        
        // Créer des triangles à partir des points du zigzag
        for (let i = 0; i < zigzagPoints.length - 1; i++) {
            const current = zigzagPoints[i];
            const next = zigzagPoints[i + 1];
            
            // Direction entre les points
            const direction = new THREE.Vector3()
                .subVectors(next, current)
                .normalize();
            
            // Vecteur perpendiculaire pour l'épaisseur
            const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0)
                .multiplyScalar(thickness);
            
            // Diminuer progressivement l'épaisseur vers le bas
            const thicknessFactor = 1 - (i / (zigzagPoints.length - 1)) * 0.5;
            perpendicular.multiplyScalar(thicknessFactor);
            
            // 4 coins du segment
            const v1 = new THREE.Vector3().addVectors(current, perpendicular);
            const v2 = new THREE.Vector3().subVectors(current, perpendicular);
            const v3 = new THREE.Vector3().addVectors(next, perpendicular);
            const v4 = new THREE.Vector3().subVectors(next, perpendicular);
            
            // Ajouter les vertices
            const baseIndex = vertices.length / 3;
            vertices.push(
                v1.x, v1.y, v1.z,
                v2.x, v2.y, v2.z,
                v3.x, v3.y, v3.z,
                v4.x, v4.y, v4.z
            );
            
            // Ajouter les indices pour les triangles
            indices.push(
                baseIndex, baseIndex + 1, baseIndex + 2,
                baseIndex + 1, baseIndex + 3, baseIndex + 2
            );
            
            // Ajouter des branches occasionnelles
            if (i > 1 && i < segments - 2 && Math.random() < 0.4) {
                const branchLength = height * (0.1 + Math.random() * 0.15);
                const branchDirection = Math.random() > 0.5 ? 1 : -1;
                const branchAngle = (Math.PI / 4) * (0.5 + Math.random() * 0.5) * branchDirection;
                
                // Calculer la direction de la branche
                const branchDir = new THREE.Vector3(direction.x, direction.y, 0)
                    .applyAxisAngle(new THREE.Vector3(0, 0, 1), branchAngle);
                
                // Point de fin de la branche
                const branchEnd = new THREE.Vector3()
                    .addVectors(current, branchDir.multiplyScalar(branchLength));
                
                // Perpendiculaire pour la branche
                const branchPerp = new THREE.Vector3(-branchDir.y, branchDir.x, 0)
                    .normalize()
                    .multiplyScalar(thickness * 0.7);
                
                // 4 coins du segment de branche
                const b1 = new THREE.Vector3().addVectors(current, branchPerp);
                const b2 = new THREE.Vector3().subVectors(current, branchPerp);
                const b3 = new THREE.Vector3().addVectors(branchEnd, branchPerp.multiplyScalar(0.5));
                const b4 = new THREE.Vector3().subVectors(branchEnd, branchPerp.multiplyScalar(0.5));
                
                // Ajouter les vertices
                const branchBaseIndex = vertices.length / 3;
                vertices.push(
                    b1.x, b1.y, b1.z,
                    b2.x, b2.y, b2.z,
                    b3.x, b3.y, b3.z,
                    b4.x, b4.y, b4.z
                );
                
                // Ajouter les indices pour les triangles
                indices.push(
                    branchBaseIndex, branchBaseIndex + 1, branchBaseIndex + 2,
                    branchBaseIndex + 1, branchBaseIndex + 3, branchBaseIndex + 2
                );
            }
        }
        
        // Définir les attributs de la géométrie
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        
        const lightningMesh = new THREE.Mesh(geometry, this.lightningMaterial);
        
        // Positionner l'éclair dans le ciel
        lightningMesh.position.set(
            (Math.random() - 0.5) * 500, // Position X aléatoire
            150 + Math.random() * 100,   // Hauteur dans le ciel
            (Math.random() - 0.5) * 500  // Position Z aléatoire
        );
        
        // Rotation aléatoire pour varier l'apparence
        lightningMesh.rotation.z = Math.random() * Math.PI * 0.25;
        
        return lightningMesh;
    }
    
    /**
     * Déclenche un éclair si les conditions sont remplies
     */
    triggerLightning() {
        if (!this.enabled || this.intensity <= 0) return;
        
        // Vérifier si le jeu est en pause
        if (this.time.isPaused) return;
        
        // Vérifier si un éclair est déjà actif
        if (this.isLightningActive) return;
        
        // Performance: limiter la fréquence des éclairs
        const currentTime = performance.now();
        const timeSinceLastLightning = currentTime - this.lastLightningTime;
        if (timeSinceLastLightning < this.minTimeBetweenLightnings) return;
        
        // Probabilité basée sur l'intensité
        const probability = this.intensity * 0.01;
        
        if (Math.random() < probability) {
            this.isLightningActive = true;
            this.currentLightningAlpha = 1.0;
            this.lastLightningTime = currentTime;
            
            // Réinitialiser les sous-éclairs
            this.subLightnings = [];
            
            // Déterminer le nombre de sous-éclairs (2-5)
            const numSubLightnings = Math.floor(Math.random() * (this.maxSubLightnings - 1)) + 3;
            
            // Créer les sous-éclairs avec des délais différents
            for (let i = 0; i < numSubLightnings; i++) {
                this.subLightnings.push({
                    startTime: currentTime + (i + 1) * this.subLightningDelay,
                    alpha: 0,
                    active: false,
                    intensity: 0.8 + Math.random() * 0.4 // Intensité variable entre 0.8 et 1.2
                });
            }
            
            // Optimisation: activer moins d'éclairs en même temps
            const numBolts = Math.ceil(Math.random() * 2 * this.intensity);
            for (let i = 0; i < this.lightningMeshes.length; i++) {
                const mesh = this.lightningMeshes[i];
                
                if (i < numBolts) {
                    mesh.visible = true;
                    mesh.position.set(
                        (Math.random() - 0.5) * 500,
                        150 + Math.random() * 100,    
                        (Math.random() - 0.5) * 500   
                    );
                    mesh.rotation.z = Math.random() * Math.PI * 0.25;
                    mesh.rotation.x = Math.random() * Math.PI * 0.1;
                    mesh.material.opacity = 1;
                } else {
                    mesh.visible = false;
                }
            }
            
            // Optimisation: utiliser le dôme pour l'illumination au lieu de modifier les shaders
            this.skyDomeMaterial.opacity = 0.2 * this.intensity;
            
            // Performance: Réduire l'impact des modifications du shader
            // Uniquement pour les intensités élevées d'éclairs
            if (this.intensity > 0.5 && this.skyUniforms) {
                this.tempSkyColors = this.captureSkyColors();
                this.applyLightningToSky(0.15 * this.intensity);
            }
            
            // Ajouter un son d'éclair si disponible
            if (this.experience.sound && this.experience.sound.thunder) {
                const delay = Math.random() * 500 + 100;
                setTimeout(() => {
                    this.experience.sound.thunder.play();
                }, delay);
            }
        }
    }
    
    /**
     * Capture les couleurs actuelles du ciel pour les restaurer plus tard
     * @returns {Object} Objet contenant les couleurs capturées
     */
    captureSkyColors() {
        const colors = {};
        
        if (this.skyUniforms.uTopColor && this.skyUniforms.uTopColor.value) {
            colors.topColor = this.skyUniforms.uTopColor.value.clone();
        }
        
        if (this.skyUniforms.uBottomColor && this.skyUniforms.uBottomColor.value) {
            colors.bottomColor = this.skyUniforms.uBottomColor.value.clone();
        }
        
        if (this.skyUniforms.uCurrentZenithColor && this.skyUniforms.uCurrentZenithColor.value) {
            colors.zenithColor = this.skyUniforms.uCurrentZenithColor.value.clone();
        }
        
        if (this.skyUniforms.uCurrentMiddleColor && this.skyUniforms.uCurrentMiddleColor.value) {
            colors.middleColor = this.skyUniforms.uCurrentMiddleColor.value.clone();
        }
        
        if (this.skyUniforms.uCurrentHorizonColor && this.skyUniforms.uCurrentHorizonColor.value) {
            colors.horizonColor = this.skyUniforms.uCurrentHorizonColor.value.clone();
        }
        
        return colors;
    }
    
    /**
     * Applique l'effet d'éclair au ciel en modifiant ses couleurs
     * @param {number} amount - Intensité de l'effet (0-1)
     */
    applyLightningToSky(amount) {
        // Modification moins intense des couleurs du ciel
        if (this.skyUniforms.uCurrentZenithColor && this.skyUniforms.uCurrentZenithColor.value) {
            this.skyUniforms.uCurrentZenithColor.value.lerp(this.lightningColors.zenith, amount);
        }
        
        if (this.skyUniforms.uCurrentMiddleColor && this.skyUniforms.uCurrentMiddleColor.value) {
            this.skyUniforms.uCurrentMiddleColor.value.lerp(this.lightningColors.middle, amount);
        }
        
        if (this.skyUniforms.uCurrentHorizonColor && this.skyUniforms.uCurrentHorizonColor.value) {
            this.skyUniforms.uCurrentHorizonColor.value.lerp(this.lightningColors.horizon, amount);
        }
        
        if (this.skyUniforms.uTopColor && this.skyUniforms.uTopColor.value) {
            this.skyUniforms.uTopColor.value.lerp(this.lightningColors.top, amount);
        }
        
        if (this.skyUniforms.uBottomColor && this.skyUniforms.uBottomColor.value) {
            this.skyUniforms.uBottomColor.value.lerp(this.lightningColors.bottom, amount);
        }
    }
    
    /**
     * Met à jour l'effet d'éclairs
     * @param {number} deltaTime - Temps écoulé depuis la dernière frame en ms
     */
    update(deltaTime) {
        if (!this.enabled) return;
        
        // Tenter de déclencher un éclair
        this.triggerLightning();
        
        const currentTime = performance.now();
        
        // Gérer l'animation des éclairs actifs
        if (this.isLightningActive) {
            const timeSinceLightning = currentTime - this.lastLightningTime;
            
            if (timeSinceLightning < this.lightningDuration) {
                // Temps normalisé (0-1) avec une courbe d'animation plus douce
                const t = timeSinceLightning / this.lightningDuration;
                
                // Animation d'opacité: plus douce au début, puis décroissance plus lente
                this.currentLightningAlpha = Math.pow(1.0 - t, 0.7); // Ajout d'un exposant pour ralentir la décroissance
                
                // Appliquer la luminosité (flash)
                const flashIntensity = this.currentLightningAlpha * this.intensity;
                this.lightningLight.intensity = flashIntensity * 1.5;
                if (this.lightningDirectional) {
                    this.lightningDirectional.intensity = flashIntensity;
                }
                
                // Mettre à jour l'opacité des éclairs
                for (const mesh of this.lightningMeshes) {
                    if (mesh.visible) {
                        mesh.material.opacity = this.currentLightningAlpha;
                    }
                }
                
                // Mettre à jour l'opacité du dôme céleste
                if (this.skyDomeMaterial) {
                    this.skyDomeMaterial.opacity = 0.2 * this.intensity * this.currentLightningAlpha;
                }
                
                // Gérer les sous-éclairs
                for (let i = 0; i < this.subLightnings.length; i++) {
                    const subLightning = this.subLightnings[i];
                    const timeSinceSubLightning = currentTime - subLightning.startTime;
                    
                    if (timeSinceSubLightning >= 0 && timeSinceSubLightning < this.subLightningDuration) {
                        subLightning.active = true;
                        const subT = timeSinceSubLightning / this.subLightningDuration;
                        subLightning.alpha = Math.pow(1.0 - subT, 0.7); // Même courbe d'animation que l'éclair principal
                        
                        // Appliquer l'effet des sous-éclairs avec intensité variable
                        const subFlashIntensity = subLightning.alpha * this.intensity * subLightning.intensity;
                        this.lightningLight.intensity += subFlashIntensity * 1.2;
                        if (this.lightningDirectional) {
                            this.lightningDirectional.intensity += subFlashIntensity;
                        }
                        
                        // Mettre à jour l'opacité du dôme pour les sous-éclairs
                        if (this.skyDomeMaterial) {
                            this.skyDomeMaterial.opacity += 0.15 * this.intensity * subLightning.alpha;
                        }
                    } else if (timeSinceSubLightning >= this.subLightningDuration) {
                        subLightning.active = false;
                    }
                }
                
                // Performance: restauration progressive seulement pour intensité élevée
                if (this.intensity > 0.5 && this.skyUniforms && this.tempSkyColors) {
                    const lerpAmount = 0.15 * this.intensity * this.currentLightningAlpha;
                    this.applyLightningToSky(lerpAmount);
                }
                
            } else {
                // Fin de l'éclair
                this.isLightningActive = false;
                this.currentLightningAlpha = 0;
                this.lightningLight.intensity = 0;
                if (this.lightningDirectional) {
                    this.lightningDirectional.intensity = 0;
                }
                
                // Cacher tous les éclairs
                for (const mesh of this.lightningMeshes) {
                    mesh.visible = false;
                }
                
                // Réinitialiser l'opacité du dôme
                if (this.skyDomeMaterial) {
                    this.skyDomeMaterial.opacity = 0;
                }
                
                // Restaurer complètement les couleurs du ciel
                if (this.intensity > 0.5 && this.skyUniforms && this.tempSkyColors) {
                    this.restoreOriginalSkyColors();
                }
                
                // Nettoyer les références temporaires
                this.tempSkyColors = null;
                this.subLightnings = [];
            }
        }
    }
    
    /**
     * Restaure les couleurs originales du ciel
     */
    restoreOriginalSkyColors() {
        if (!this.tempSkyColors) return;
        
        if (this.skyUniforms.uTopColor && this.tempSkyColors.topColor) {
            this.skyUniforms.uTopColor.value.copy(this.tempSkyColors.topColor);
        }
        
        if (this.skyUniforms.uBottomColor && this.tempSkyColors.bottomColor) {
            this.skyUniforms.uBottomColor.value.copy(this.tempSkyColors.bottomColor);
        }
        
        if (this.skyUniforms.uCurrentZenithColor && this.tempSkyColors.zenithColor) {
            this.skyUniforms.uCurrentZenithColor.value.copy(this.tempSkyColors.zenithColor);
        }
        
        if (this.skyUniforms.uCurrentMiddleColor && this.tempSkyColors.middleColor) {
            this.skyUniforms.uCurrentMiddleColor.value.copy(this.tempSkyColors.middleColor);
        }
        
        if (this.skyUniforms.uCurrentHorizonColor && this.tempSkyColors.horizonColor) {
            this.skyUniforms.uCurrentHorizonColor.value.copy(this.tempSkyColors.horizonColor);
        }
    }
    
    /**
     * Nettoie toutes les ressources utilisées par l'effet d'éclairs
     */
    destroy() {
        // Supprimer les lumières
        if (this.lightningLight) {
            this.scene.remove(this.lightningLight);
            this.lightningLight = null;
        }
        
        if (this.lightningDirectional) {
            this.scene.remove(this.lightningDirectional);
            this.lightningDirectional = null;
        }
        
        // Supprimer les maillages d'éclairs
        for (const mesh of this.lightningMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        
        this.lightningMeshes = [];
        
        // Supprimer le dôme du ciel
        if (this.skyDome) {
            this.scene.remove(this.skyDome);
            this.skyDome.geometry.dispose();
            this.skyDome.material.dispose();
            this.skyDome = null;
            this.skyDomeMaterial = null;
        }
        
        // Restaurer les couleurs originales du ciel si nécessaire
        if (this.isLightningActive && this.skyUniforms && this.tempSkyColors) {
            this.restoreOriginalSkyColors();
        }
        
        // Nettoyer les références
        this.skyUniforms = null;
        this.originalSkyValues = null;
        this.tempSkyColors = null;
        this.lightningColors = null;
        this.tempColor = null;
        
        //console.log("Effet d'éclairs nettoyé");
    }
}