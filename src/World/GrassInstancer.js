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
        
        // Paramètres de LOD - Très courts pour le débogage
        this.lodDistances = {
            high: 10,    // Distance pour la haute densité
            medium: 500, // Distance pour la densité moyenne
            low: 1000    // Distance pour la basse densité
        };
        
        // Carrés des distances pour éviter les calculs de racine carrée
        this.lodDistancesSquared = {
            high: this.lodDistances.high * this.lodDistances.high,
            medium: this.lodDistances.medium * this.lodDistances.medium,
            low: this.lodDistances.low * this.lodDistances.low
        };
        
        // Création de la géométrie de base pour une brin d'herbe
        this.geometry = new THREE.PlaneGeometry(0.1, 1, 1, 4);
        this.geometry.translate(0, 0.5, 0); // Déplacer le point le plus bas à 0

        // Création du matériau standard qui réagira naturellement à la lumière
        this.leavesMaterial = new THREE.MeshStandardMaterial({
            color: 0x61874c, // Même couleur que le sol des parcelles de type parc et maison
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        // Activer la réception des ombres pour la géométrie
        this.geometry.computeVertexNormals();
        
        // Optimisation: Fréquence de mise à jour du LOD
        this.updateFrequency = 1; // Mettre à jour à chaque frame pour le débogage
        this.frameCount = 0;
        
        // Mode débogage
        this.debugMode = true;
        
        // Optimisation: Vecteur temporaire pour les calculs de distance
        this._tempVector = new THREE.Vector3();
        
        // Optimisation: Intervalle de mise à jour en millisecondes
        this.updateInterval = 500; // Mettre à jour toutes les 500ms
        this.lastUpdateTime = 0;
    }

    setCamera(camera) {
        this.camera = camera;
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
        
        // Stocker les données de la parcelle
        const plotInfo = {
            mesh: instancedMesh,
            center: plotCenter,
            distanceSquared: 0,
            allocatedInstances: this.instanceNumber, // Nombre d'instances allouées
            lastUpdate: 0,
            id: plot.id || Math.random().toString(36).substr(2, 9), // ID unique pour le débogage
            isVisible: true // Flag pour indiquer si la parcelle est visible
        };
        this.plotData.push(plotInfo);

        // Positionner et échelonner les instances d'herbe aléatoirement dans la parcelle
        for (let i = 0; i < this.instanceNumber; i++) {
            const x = plot.x + (Math.random() * plot.width);
            const z = plot.z + (Math.random() * plot.depth);
            
            this.dummy.position.set(x, 0, z);
            this.dummy.scale.setScalar(0.5 + Math.random() * 0.5);
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
        
        // Optimisation: Vérifier si la caméra a bougé significativement
        const cameraPosition = this.camera.position;
        const cameraMoved = this._checkCameraMovement(cameraPosition);
        if (!cameraMoved && !this.debugMode) return;
        
        // Mettre à jour les distances pour chaque parcelle
        this._updatePlotDistances(cameraPosition);
        
        // Trier les parcelles par distance (la plus proche en premier)
        this.plotData.sort((a, b) => a.distanceSquared - b.distanceSquared);
        
        // Calculer le nombre total d'instances à distribuer
        const totalInstances = this.instanceNumber * this.plotData.length;
        
        // Distribuer les instances en fonction de la distance
        this.distributeInstances(totalInstances);
        
        // Appliquer les allocations à chaque parcelle
        this.plotData.forEach(plotInfo => {
            this.applyAllocationToPlot(plotInfo);
        });
        
        // Afficher les informations de débogage
        if (this.debugMode) {
            this.logDebugInfo();
        }
    }
    
    // Optimisation: Vérifier si la caméra a bougé significativement
    _checkCameraMovement(cameraPosition) {
        // Si c'est la première fois, initialiser la position précédente
        if (!this._lastCameraPosition) {
            this._lastCameraPosition = cameraPosition.clone();
            return true;
        }
        
        // Calculer la distance au carré entre la position actuelle et la position précédente
        const distanceSquared = cameraPosition.distanceToSquared(this._lastCameraPosition);
        
        // Mettre à jour la position précédente
        this._lastCameraPosition.copy(cameraPosition);
        
        // Retourner true si la caméra a bougé de plus d'une unité
        return distanceSquared > 1;
    }
    
    // Optimisation: Mettre à jour les distances des parcelles
    _updatePlotDistances(cameraPosition) {
        // Utiliser un vecteur temporaire pour éviter de créer de nouveaux objets
        const tempVector = this._tempVector;
        
        this.plotData.forEach(plotInfo => {
            // Calculer la distance au carré entre le centre de la parcelle et la caméra
            tempVector.copy(plotInfo.center);
            tempVector.sub(cameraPosition);
            plotInfo.distanceSquared = tempVector.lengthSq();
            
            // Mettre à jour le flag de visibilité
            plotInfo.isVisible = plotInfo.distanceSquared < this.lodDistancesSquared.low * 1.5;
        });
    }
    
    distributeInstances(totalInstances) {
        if (this.plotData.length === 0) return;
        
        // Si une seule parcelle, lui donner toutes les instances
        if (this.plotData.length === 1) {
            this.plotData[0].allocatedInstances = totalInstances;
            return;
        }
        
        // En mode débogage, donner presque toutes les instances à la parcelle la plus proche
        if (this.debugMode && this.plotData.length > 0) {
            // Donner 90% des instances à la parcelle la plus proche
            const closestPlot = this.plotData[0];
            closestPlot.allocatedInstances = Math.floor(totalInstances * 0.9);
            
            // Distribuer le reste entre les autres parcelles
            const remainingInstances = totalInstances - closestPlot.allocatedInstances;
            const remainingPlots = this.plotData.length - 1;
            
            for (let i = 1; i < this.plotData.length; i++) {
                this.plotData[i].allocatedInstances = Math.floor(remainingInstances / remainingPlots);
            }
            
            // Ajuster pour éviter les arrondis
            const lastPlot = this.plotData[this.plotData.length - 1];
            lastPlot.allocatedInstances += remainingInstances - 
                (this.plotData.slice(1).reduce((sum, plot) => sum + plot.allocatedInstances, 0));
                
            return;
        }
        
        // Optimisation: Ne traiter que les parcelles visibles
        const visiblePlots = this.plotData.filter(plot => plot.isVisible);
        
        // Si aucune parcelle n'est visible, ne rien faire
        if (visiblePlots.length === 0) return;
        
        // Si une seule parcelle est visible, lui donner toutes les instances
        if (visiblePlots.length === 1) {
            visiblePlots[0].allocatedInstances = totalInstances;
            return;
        }
        
        // Calculer les poids inverses à la distance (plus la distance est petite, plus le poids est grand)
        const weights = visiblePlots.map(plot => {
            // Éviter la division par zéro et les distances trop petites
            const distanceSquared = Math.max(plot.distanceSquared, 1);
            return 1 / distanceSquared;
        });
        
        // Calculer la somme des poids
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
        
        // Distribuer les instances proportionnellement aux poids
        let remainingInstances = totalInstances;
        
        for (let i = 0; i < visiblePlots.length; i++) {
            // Pour la dernière parcelle, utiliser toutes les instances restantes
            if (i === visiblePlots.length - 1) {
                visiblePlots[i].allocatedInstances = remainingInstances;
            } else {
                // Calculer le nombre d'instances pour cette parcelle
                const allocatedCount = Math.floor(totalInstances * (weights[i] / weightSum));
                visiblePlots[i].allocatedInstances = allocatedCount;
                remainingInstances -= allocatedCount;
            }
        }
        
        // Mettre à zéro les instances pour les parcelles non visibles
        this.plotData.forEach(plot => {
            if (!plot.isVisible) {
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
        
        this.plotData.forEach((plot, index) => {
            console.log(`Parcelle ${index} (ID: ${plot.id}):`);
            console.log(`  Distance au carré: ${plot.distanceSquared.toFixed(2)}`);
            console.log(`  Distance: ${Math.sqrt(plot.distanceSquared).toFixed(2)}`);
            console.log(`  Visible: ${plot.isVisible}`);
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
        });
    }
} 