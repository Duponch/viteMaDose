import * as THREE from 'three';

export default class GrassInstancer {
    constructor(config) {
        this.config = config;
        this.instanceNumber = 10000; // Nombre d'instances d'herbe par parcelle
        this.dummy = new THREE.Object3D();
        this.clock = new THREE.Clock();
        this.camera = null;
        this.instancedMeshes = [];
        this.plotData = []; // Stocker les données des parcelles
        
        // Paramètres de LOD - Optimisés pour les performances
        this.lodDistances = {
            high: 500,     // Distance pour la haute densité
            medium: 500,  // Distance pour la densité moyenne
            low: 500      // Distance pour la basse densité
        };
        
        // Distance maximale de visibilité (en unités)
        this.maxVisibilityDistance = 1000;
        
        // Facteur de visibilité pour les parcelles (pour une transition plus douce)
        this.visibilityFactor = config.visibilityFactor || 1.2;
        
        // Angle de champ de vision de la caméra (en degrés)
        this.fovAngle = config.fovAngle || 90;
        
        // Facteur de marge pour le champ de vision (pour éviter les coupures nettes)
        this.fovMargin = config.fovMargin || 4.0;
        
        // Distance minimale pour le champ de vision (pour éviter les parcelles trop éloignées)
        this.minFovDistance = config.minFovDistance || 50;
        
        // Marge supplémentaire pour les parcelles visibles à l'écran
        this.screenMargin = 3.0;
        
        // Paramètres pour la détection de visibilité verticale
        this.verticalFovMargin = 3.0;
        this.minVerticalAngle = -75;
        this.maxVerticalAngle = 75;
        
        // Seuil de visibilité partielle
        this.partialVisibilityThreshold = 0.15;
        
        // Nouveau : Distance maximale pour la visibilité partielle
        this.partialVisibilityDistance = 200;
        
        // Carrés des distances pour éviter les calculs de racine carrée
        this.lodDistancesSquared = {
            high: this.lodDistances.high * this.lodDistances.high,
            medium: this.lodDistances.medium * this.lodDistances.medium,
            low: this.lodDistances.low * this.lodDistances.low
        };
        
        // Carré de la distance maximale de visibilité
        this.maxVisibilityDistanceSquared = this.maxVisibilityDistance * this.maxVisibilityDistance;
        
        // Carré de la distance minimale pour le champ de vision
        this.minFovDistanceSquared = this.minFovDistance * this.minFovDistance;
        
        // Création de la géométrie de base pour une brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.2, 1.5, 1, 4);
        this.geometry.translate(0, 0.75, 0);

        // Création du matériau standard qui réagira naturellement à la lumière
        this.leavesMaterial = new THREE.MeshStandardMaterial({
            color: 0x485e3c, // Même couleur que le sol des parcelles de type parc et maison
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        // Activer la réception des ombres pour la géométrie
        this.geometry.computeVertexNormals();
        
        // Optimisation: Fréquence de mise à jour du LOD
        this.updateFrequency = 2; // Mettre à jour tous les 2 frames
        this.frameCount = 0;
        
        // Mode débogage
        this.debugMode = false; // Désactivé par défaut
        
        // Optimisation: Vecteur temporaire pour les calculs de distance
        this._tempVector = new THREE.Vector3();
        
        // Optimisation: Vecteur temporaire pour les calculs de direction
        this._directionVector = new THREE.Vector3();
        
        // Optimisation: Intervalle de mise à jour en millisecondes
        this.updateInterval = 1000; // Mettre à jour toutes les secondes
        this.lastUpdateTime = 0;
        
        // Optimisation: Seuil de mouvement de la caméra
        this.cameraMovementThreshold = 5; // Seuil de mouvement de la caméra (au carré)
        
        // Désactiver temporairement la vérification du champ de vision pour le débogage
        this.disableFovCheck = false;

        // Statistiques en temps réel
        this.stats = {
            totalPlots: 0,
            visiblePlots: 0,
            totalGrassBlades: 0,
            lastLogTime: 0,
            logInterval: 1000 // Log toutes les secondes
        };

        // Stocker la dernière orientation de la caméra
        this._lastCameraQuaternion = new THREE.Quaternion();
        this._cameraOrientationChanged = false;
        
        // Nouveau: Frustum pour vérifier la visibilité des parcelles
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._tempBoundingSphere = new THREE.Sphere();

        // Nouveau: Paramètre d'inclinaison statique de l'herbe
        this.bendStrength = 0.0; // 0 = vertical, 1.5 = presque horizontal
        
        // Nouveau: Paramètre d'inclinaison globale de l'herbe (rotation sans courbure)
        this.inclinationStrength = 0.0; // 0 = vertical, 1.0 = complètement incliné
        this.inclinationDirection = new THREE.Vector2(1.0, 0.0).normalize(); // Direction de l'inclinaison
    }

    setCamera(camera) {
        this.camera = camera;
        if (camera) {
            this._lastCameraQuaternion.copy(camera.quaternion);
        }
    }

    createGrassInstances(plot) {
        const instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.leavesMaterial,
            this.instanceNumber
        );

        // Activer la réception des ombres pour l'InstancedMesh
        instancedMesh.receiveShadow = true;
        instancedMesh.castShadow = false; // L'herbe ne projette pas d'ombres

        // Stocker les positions originales pour chaque instance
        instancedMesh.userData.positions = [];
        instancedMesh.userData.visible = new Array(this.instanceNumber).fill(true);
        instancedMesh.userData.originalMatrices = []; // Stocker les matrices originales
        
        // Calculer le centre de la parcelle pour les calculs de distance
        const plotCenter = new THREE.Vector3(
            plot.x + plot.width / 2,
            0,
            plot.z + plot.depth / 2
        );
        
        // Nouveau: Calculer la sphère englobante pour le frustum culling
        const boundingSphere = new THREE.Sphere(
            plotCenter.clone(),
            Math.sqrt((plot.width / 2) * (plot.width / 2) + (plot.depth / 2) * (plot.depth / 2))
        );
        
        // Stocker les données de la parcelle
        const plotInfo = {
            mesh: instancedMesh,
            center: plotCenter,
            distanceSquared: 0,
            allocatedInstances: this.instanceNumber, // Nombre d'instances allouées
            lastUpdate: 0,
            id: plot.id || Math.random().toString(36).substr(2, 9), // ID unique pour le débogage
            isVisible: true, // Flag pour indiquer si la parcelle est visible
            isFullyVisible: true, // Flag pour indiquer si la parcelle est complètement visible
            angleToCamera: 0,
            visibilityFactor: 1,
            boundingSphere: boundingSphere, // Nouveau: Sphère englobante pour le frustum culling
            plot: plot // Référence à la parcelle originale
        };
        this.plotData.push(plotInfo);

        // Positionner et échelonner les instances d'herbe aléatoirement dans la parcelle
        for (let i = 0; i < this.instanceNumber; i++) {
            const x = plot.x + (Math.random() * plot.width);
            const z = plot.z + (Math.random() * plot.depth);
            
            this.dummy.position.set(x, 0, z);
            this.dummy.scale.setScalar(0.3 + Math.random() * 0.5);
            this.dummy.rotation.y = Math.random() * Math.PI;
            
            this.dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this.dummy.matrix);
            
            // Stocker la position pour les calculs de distance
            instancedMesh.userData.positions.push(new THREE.Vector3(x, 0, z));
            
            // Stocker la matrice originale
            const originalMatrix = new THREE.Matrix4().copy(this.dummy.matrix);
            instancedMesh.userData.originalMatrices.push(originalMatrix);
        }

        this.instancedMeshes.push(instancedMesh);
        return instancedMesh;
    }

    update() {
        if (!this.camera) return;
        
        // Optimisation: Ne mettre à jour que tous les X frames
        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) return;

        const currentTime = Date.now();
        
        // Optimisation: Vérifier si suffisamment de temps s'est écoulé depuis la dernière mise à jour
        if (currentTime - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = currentTime;
        
        // Optimisation: Vérifier si la caméra a bougé significativement ou changé d'orientation
        const cameraPosition = this.camera.position;
        const cameraMoved = this._checkCameraMovement(cameraPosition);
        if (!cameraMoved && !this.debugMode) return;
        
        // Nouveau: Mettre à jour le frustum de la caméra
        this._updateCameraFrustum();
        
        // Mettre à jour les distances pour chaque parcelle
        this._updatePlotDistances(cameraPosition);
        
        // Trier les parcelles par distance (la plus proche en premier)
        this.plotData.sort((a, b) => a.distanceSquared - b.distanceSquared);
        
        // Calculer le nombre total d'instances à distribuer
        const totalInstances = this.instanceNumber * this.plotData.length;
        
        // Distribuer les instances en fonction de la distance
        this.distributeInstances(totalInstances);
        
        // Réinitialiser les compteurs
        this.stats.visiblePlots = 0;
        this.stats.totalGrassBlades = 0;
        
        // Appliquer les allocations à chaque parcelle et compter les statistiques
        this.plotData.forEach(plotInfo => {
            this.applyAllocationToPlot(plotInfo);
            if (plotInfo.isVisible) {
                this.stats.visiblePlots++;
                this.stats.totalGrassBlades += plotInfo.allocatedInstances;
            }
        });
        
        // Mettre à jour le total des parcelles
        this.stats.totalPlots = this.plotData.length;
        
        // Loguer les statistiques à intervalle régulier
        if (currentTime - this.stats.lastLogTime >= this.stats.logInterval) {
            this.stats.lastLogTime = currentTime;
        }
        
        // Afficher les informations de débogage
        if (this.debugMode) {
            this.logDebugInfo();
        }
    }
    
    // Nouveau: Mettre à jour le frustum de la caméra
    _updateCameraFrustum() {
        if (!this.camera) return;
        
        // Calculer la matrice de projection * vue
        this._projScreenMatrix.multiplyMatrices(
            this.camera.projectionMatrix, 
            this.camera.matrixWorldInverse
        );
        
        // Mettre à jour le frustum
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    }
    
    // Optimisation: Vérifier si la caméra a bougé significativement ou changé d'orientation
    _checkCameraMovement(cameraPosition) {
        let shouldUpdate = false;
        
        // Vérifier le mouvement de position
        if (!this._lastCameraPosition) {
            this._lastCameraPosition = cameraPosition.clone();
            shouldUpdate = true;
        } else {
            const tempVector = new THREE.Vector3().subVectors(cameraPosition, this._lastCameraPosition);
            const distanceSquared = tempVector.lengthSq();
            if (distanceSquared > this.cameraMovementThreshold) {
                shouldUpdate = true;
            }
            this._lastCameraPosition.copy(cameraPosition);
        }
        
        // Vérifier le changement d'orientation
        if (this.camera) {
            const currentQuaternion = this.camera.quaternion;
            const angle = this._lastCameraQuaternion.angleTo(currentQuaternion);
            // Mettre à jour si l'angle de rotation est significatif (plus de 5 degrés)
            if (angle > 0.087) { // ~5 degrés en radians
                shouldUpdate = true;
                this._lastCameraQuaternion.copy(currentQuaternion);
            }
        }
        
        return shouldUpdate;
    }
    
    // Optimisation: Mettre à jour les distances des parcelles
    _updatePlotDistances(cameraPosition) {
        // Utiliser un vecteur temporaire pour éviter de créer de nouveaux objets
        const tempVector = this._tempVector;
        const directionVector = this._directionVector;
        
        // Obtenir la direction de la caméra
        directionVector.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        
        // Calculer le cosinus de la moitié de l'angle de champ de vision
        const halfFovRadians = (this.fovAngle * Math.PI / 180) / 2;
        const cosHalfFov = Math.cos(halfFovRadians);
        
        // Calculer la hauteur de la caméra par rapport au sol
        const cameraHeight = cameraPosition.y;
        
        this.plotData.forEach(plotInfo => {
            // Calculer le vecteur de la caméra vers le centre de la parcelle
            tempVector.copy(plotInfo.center).sub(cameraPosition);
            
            // Calculer la distance au carré
            plotInfo.distanceSquared = tempVector.lengthSq();
            
            // Vérifier d'abord si la parcelle est à une distance supérieure à la distance maximale de visibilité
            const isBeyondMaxDistance = plotInfo.distanceSquared > this.maxVisibilityDistanceSquared;
            
            // Si la parcelle est au-delà de la distance maximale, elle n'est jamais visible
            if (isBeyondMaxDistance) {
                plotInfo.isVisible = false;
                plotInfo.isFullyVisible = false;
                plotInfo.visibilityFactor = 0;
                plotInfo.angleToCamera = 0;
                return;
            }
            
            // Nouveau: Test de frustum culling avec la sphère englobante
            this._tempBoundingSphere.copy(plotInfo.boundingSphere);
            const isInFrustum = this._frustum.intersectsSphere(this._tempBoundingSphere);
            
            // Si la vérification du champ de vision est désactivée, toutes les parcelles sont visibles
            if (this.disableFovCheck) {
                plotInfo.isVisible = true;
                plotInfo.isFullyVisible = plotInfo.distanceSquared < this.lodDistancesSquared.high;
                plotInfo.visibilityFactor = 1;
                plotInfo.angleToCamera = 0;
                return;
            }
            
            // Si la parcelle n'est pas dans le frustum, la marquer comme invisible
            if (!isInFrustum) {
                plotInfo.isVisible = false;
                plotInfo.isFullyVisible = false;
                plotInfo.visibilityFactor = 0;
                return;
            }
            
            // Calculer le cosinus de l'angle entre la direction de la caméra et le vecteur vers la parcelle
            const distance = Math.sqrt(plotInfo.distanceSquared);
            if (distance > 0) {
                // Normaliser le vecteur pour obtenir la direction
                tempVector.normalize();
                
                // Calculer le produit scalaire (cosinus de l'angle)
                const dotProduct = tempVector.dot(directionVector);
                
                // Calculer l'angle en degrés pour le débogage
                const angle = Math.acos(dotProduct) * 180 / Math.PI;
                plotInfo.angleToCamera = angle;
                
                // Vérifier si la parcelle est dans le champ de vision
                const adjustedCosHalfFov = cosHalfFov * (1 / this.fovMargin);
                let isInFov = dotProduct > adjustedCosHalfFov;
                
                // Calculer l'angle vertical entre la direction de la caméra et le vecteur vers la parcelle
                const verticalAngle = Math.asin(directionVector.y) * 180 / Math.PI;
                
                // Si la caméra est proche du sol
                if (cameraHeight < 5) {
                    // Si on regarde vers le bas, restreindre la visibilité
                    if (verticalAngle < -10) {
                        // Ne garder que les parcelles très proches et dans le FOV
                        isInFov = isInFov && plotInfo.distanceSquared < 100;
                    }
                } else {
                    // En vue normale, utiliser une détection plus permissive
                    // Calculer l'angle vertical entre la caméra et la parcelle
                    const plotVerticalAngle = Math.asin(tempVector.y / Math.sqrt(plotInfo.distanceSquared)) * 180 / Math.PI;
                    
                    // Vérifier si la parcelle est dans la zone de visibilité verticale
                    const isInVerticalFov = plotVerticalAngle >= this.minVerticalAngle && 
                                          plotVerticalAngle <= this.maxVerticalAngle;
                    
                    // Si la parcelle est dans le FOV vertical, la considérer comme visible
                    if (isInVerticalFov) {
                        // Calculer l'angle horizontal entre la direction de la caméra et le vecteur vers la parcelle
                        const horizontalAngle = Math.atan2(
                            tempVector.x * directionVector.z - tempVector.z * directionVector.x,
                            tempVector.x * directionVector.x + tempVector.z * directionVector.z
                        ) * 180 / Math.PI;

                        // Utiliser une marge beaucoup plus large pour le FOV horizontal
                        const extendedFovAngle = this.fovAngle * this.screenMargin;
                        
                        // Calculer un facteur de visibilité basé sur l'angle
                        const angleFactor = 1.0 - (Math.abs(horizontalAngle) / (extendedFovAngle / 2));
                        
                        // Calculer un facteur de distance
                        const distanceFactor = 1.0 - (Math.sqrt(plotInfo.distanceSquared) / this.partialVisibilityDistance);
                        
                        // Si l'angle est dans la zone étendue
                        if (Math.abs(horizontalAngle) < extendedFovAngle / 2) {
                            // Vérifier si la parcelle est à une distance raisonnable
                            if (plotInfo.distanceSquared < this.maxVisibilityDistanceSquared * 0.5) {
                                // Considérer comme visible si le facteur d'angle dépasse le seuil
                                // ou si la parcelle est très proche
                                if (angleFactor > this.partialVisibilityThreshold || distanceFactor > 0.8) {
                                    isInFov = true;
                                }
                            }
                        }
                    }
                }
                
                // Mettre à jour le flag de visibilité en fonction du champ de vision
                plotInfo.isVisible = isInFov;
                
                // Mettre à jour le flag de visibilité complète
                plotInfo.isFullyVisible = plotInfo.distanceSquared < this.lodDistancesSquared.high && isInFov;
                
                // Stocker le facteur de visibilité pour le débogage
                plotInfo.visibilityFactor = isInFov ? 1 : 0;
            } else {
                // Si la distance est nulle, la parcelle est à la position de la caméra
                plotInfo.isVisible = true;
                plotInfo.isFullyVisible = true;
                plotInfo.angleToCamera = 0;
                plotInfo.visibilityFactor = 1;
            }
        });
    }
    
    distributeInstances(totalInstances) {
        if (this.plotData.length === 0) return;
        
        // Si une seule parcelle, lui donner toutes les instances
        if (this.plotData.length === 1) {
            // Vérifier si la parcelle est visible
            if (this.plotData[0].isVisible) {
                this.plotData[0].allocatedInstances = this.instanceNumber;
            } else {
                this.plotData[0].allocatedInstances = 0;
            }
            return;
        }
        
        // En mode débogage, donner presque toutes les instances à la parcelle la plus proche
        if (this.debugMode && this.plotData.length > 0) {
            // Donner 90% des instances à la parcelle la plus proche
            const closestPlot = this.plotData[0];
            if (closestPlot.isVisible) {
                closestPlot.allocatedInstances = Math.floor(totalInstances * 0.9);
            } else {
                closestPlot.allocatedInstances = 0;
            }
            
            // Distribuer le reste entre les autres parcelles
            const remainingInstances = totalInstances - closestPlot.allocatedInstances;
            const remainingPlots = this.plotData.length - 1;
            
            for (let i = 1; i < this.plotData.length; i++) {
                if (this.plotData[i].isVisible) {
                    this.plotData[i].allocatedInstances = Math.floor(remainingInstances / remainingPlots);
                } else {
                    this.plotData[i].allocatedInstances = 0;
                }
            }
            
            // Ajuster pour éviter les arrondis
            const lastPlot = this.plotData[this.plotData.length - 1];
            if (lastPlot.isVisible) {
                lastPlot.allocatedInstances += remainingInstances - 
                    (this.plotData.slice(1).reduce((sum, plot) => sum + plot.allocatedInstances, 0));
            }
                
            return;
        }
        
        // Optimisation: Ne traiter que les parcelles visibles
        const visiblePlots = this.plotData.filter(plot => plot.isVisible);
        
        // Si aucune parcelle n'est visible, ne rien faire
        if (visiblePlots.length === 0) {
            // Mettre à zéro les instances pour toutes les parcelles
            this.plotData.forEach(plot => {
                plot.allocatedInstances = 0;
            });
            return;
        }
        
        // Si une seule parcelle est visible, lui donner toutes les instances
        if (visiblePlots.length === 1) {
            visiblePlots[0].allocatedInstances = this.instanceNumber;
            
            // Mettre à zéro les instances pour les autres parcelles
            this.plotData.forEach(plot => {
                if (plot !== visiblePlots[0]) {
                    plot.allocatedInstances = 0;
                }
            });
            return;
        }
        
        // Optimisation: Limiter le nombre de parcelles traitées
        const maxPlotsToProcess = 5; // Limiter à 5 parcelles maximum
        const plotsToProcess = visiblePlots.slice(0, maxPlotsToProcess);
        
        // Calculer les poids inverses à la distance (plus la distance est petite, plus le poids est grand)
        const weights = plotsToProcess.map(plot => {
            // Éviter la division par zéro et les distances trop petites
            const distanceSquared = Math.max(plot.distanceSquared, 1);
            return 1 / distanceSquared;
        });
        
        // Calculer la somme des poids
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
        
        // Distribuer les instances proportionnellement aux poids
        let remainingInstances = this.instanceNumber * plotsToProcess.length;
        
        for (let i = 0; i < plotsToProcess.length; i++) {
            // Pour la dernière parcelle, utiliser toutes les instances restantes
            if (i === plotsToProcess.length - 1) {
                plotsToProcess[i].allocatedInstances = remainingInstances;
            } else {
                // Calculer le nombre d'instances pour cette parcelle
                const allocatedCount = Math.floor(remainingInstances * (weights[i] / weightSum));
                plotsToProcess[i].allocatedInstances = allocatedCount;
                remainingInstances -= allocatedCount;
            }
        }
        
        // Mettre à zéro les instances pour les parcelles non visibles ou non traitées
        this.plotData.forEach(plot => {
            if (!plot.isVisible || !plotsToProcess.includes(plot)) {
                plot.allocatedInstances = 0;
            }
        });
    }
    
    applyAllocationToPlot(plotInfo) {
        const mesh = plotInfo.mesh;
        const allocatedCount = plotInfo.allocatedInstances;
        const visible = mesh.userData.visible;
        const originalMatrices = mesh.userData.originalMatrices;
        const matrix = new THREE.Matrix4();
        
        // Optimisation: Ne mettre à jour que si le nombre d'instances allouées a changé
        if (allocatedCount === 0) {
            // Si aucune instance n'est allouée, masquer toutes les instances
            for (let i = 0; i < this.instanceNumber; i++) {
                if (visible[i]) {
                    visible[i] = false;
                    mesh.getMatrixAt(i, matrix);
                    matrix.elements[12] = -10000; // X
                    matrix.elements[13] = -10000; // Y
                    matrix.elements[14] = -10000; // Z
                    mesh.setMatrixAt(i, matrix);
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            return;
        }
        
        // Optimisation: Si la parcelle est complètement visible, ne pas modifier les instances
        if (plotInfo.isFullyVisible && allocatedCount === this.instanceNumber) {
            return;
        }
        
        // Déterminer quelles instances rendre visibles
        for (let i = 0; i < this.instanceNumber; i++) {
            // Utiliser une fonction déterministe pour décider si l'instance doit être visible
            const shouldBeVisible = i < allocatedCount;
            
            if (visible[i] !== shouldBeVisible) {
                visible[i] = shouldBeVisible;
                
                if (shouldBeVisible) {
                    // Restaurer la matrice originale
                    mesh.setMatrixAt(i, originalMatrices[i]);
                } else {
                    // Déplacer hors champ
                    mesh.getMatrixAt(i, matrix);
                    matrix.elements[12] = -10000; // X
                    matrix.elements[13] = -10000; // Y
                    matrix.elements[14] = -10000; // Z
                    mesh.setMatrixAt(i, matrix);
                }
            }
        }
        
        mesh.instanceMatrix.needsUpdate = true;
    }
    
    logDebugInfo() {
        console.log("=== GrassInstancer Debug Info ===");
        console.log(`Nombre total de parcelles: ${this.plotData.length}`);
        console.log(`Nombre d'instances par parcelle: ${this.instanceNumber}`);
        console.log(`Distance maximale de visibilité: ${this.maxVisibilityDistance} unités`);
        console.log(`Facteur de visibilité: ${this.visibilityFactor}`);
        console.log(`Angle de champ de vision: ${this.fovAngle} degrés`);
        console.log(`Marge de champ de vision: ${this.fovMargin}`);
        console.log(`Distance minimale pour le champ de vision: ${this.minFovDistance} unités`);
        
        this.plotData.forEach((plot, index) => {
            console.log(`Parcelle ${index} (ID: ${plot.id}):`);
            console.log(`  Distance au carré: ${plot.distanceSquared.toFixed(2)}`);
            console.log(`  Distance: ${Math.sqrt(plot.distanceSquared).toFixed(2)}`);
            console.log(`  Angle par rapport à la caméra: ${plot.angleToCamera?.toFixed(2) || 0} degrés`);
            console.log(`  Facteur de visibilité: ${plot.visibilityFactor?.toFixed(2) || 1}`);
            console.log(`  Visible: ${plot.isVisible}`);
            console.log(`  Complètement visible: ${plot.isFullyVisible}`);
            console.log(`  Instances allouées: ${plot.allocatedInstances} (${(plot.allocatedInstances / this.instanceNumber * 100).toFixed(1)}%)`);
        });
        
        console.log("===============================");
    }

    reset() {
        // Réinitialiser la visibilité de toutes les instances
        this.instancedMeshes.forEach(mesh => {
            const visible = mesh.userData.visible;
            const originalMatrices = mesh.userData.originalMatrices;

            for (let i = 0; i < this.instanceNumber; i++) {
                visible[i] = true;
                mesh.setMatrixAt(i, originalMatrices[i]);
            }

            mesh.instanceMatrix.needsUpdate = true;
        });
        
        // Réinitialiser les allocations
        this.plotData.forEach(plotInfo => {
            plotInfo.allocatedInstances = this.instanceNumber;
            plotInfo.isVisible = true;
            plotInfo.isFullyVisible = true;
        });
    }

    setGrassBendStrength(strength) {
        this.bendStrength = strength;
        // Cette méthode est ajoutée pour la cohérence avec ShaderGrassInstancer
        // mais n'a pas d'effet ici car cette classe utilise des matrices de transformation
        // et non des shaders pour positionner l'herbe
        console.log("GrassInstancer: setGrassBendStrength appelé, mais n'a pas d'effet dans cette implémentation.");
    }
    
    // Nouvelle méthode pour l'inclinaison globale de l'herbe
    setGrassInclinationStrength(strength) {
        this.inclinationStrength = strength;
        // Cette méthode est ajoutée pour la cohérence avec ShaderGrassInstancer
        console.log("GrassInstancer: setGrassInclinationStrength appelé, mais n'a pas d'effet dans cette implémentation.");
    }
    
    // Nouvelle méthode pour définir la direction de l'inclinaison
    setGrassInclinationDirection(direction) {
        if (direction instanceof THREE.Vector2) {
            this.inclinationDirection.copy(direction).normalize();
        } else if (Array.isArray(direction) && direction.length >= 2) {
            this.inclinationDirection.set(direction[0], direction[1]).normalize();
        } else if (typeof direction === 'number') {
            // Si on passe un angle en radians
            this.inclinationDirection.set(Math.cos(direction), Math.sin(direction));
        }
        console.log("GrassInstancer: setGrassInclinationDirection appelé, mais n'a pas d'effet dans cette implémentation.");
    }
} 