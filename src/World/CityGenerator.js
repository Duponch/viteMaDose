import * as THREE from 'three';

export default class CityGenerator {
    constructor(experience, config) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.config = config;

        // Matériaux partagés pour la performance
        this.roadMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide });
        this.buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.2, roughness: 0.7 });

        // Stocker les objets générés
        this.roads = [];
        this.buildings = [];

        // Grille pour représenter la carte (simplifié)
        // 0 = Vide, 1 = Route, 2 = Zone de bâtiment potentiel
        this.gridSize = Math.floor(this.config.mapSize / this.config.cellSize);
        this.grid = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(0));
    }

    generate() {
        console.log("Génération de la ville...");
        this.generateRoadNetwork();
        this.generateBuildings();
        console.log(`Ville générée: ${this.roads.length} routes, ${this.buildings.length} bâtiments.`);
    }

    // --- Génération du Réseau Routier (Très Simpliste) ---
    generateRoadNetwork() {
        const halfMap = this.config.mapSize / 2;
        const roadWidth = this.config.roadWidth;

        // Route principale (axe Z)
        this.createRoad(-halfMap, 0, halfMap, 0, roadWidth);
        // Route principale (axe X)
        this.createRoad(0, -halfMap, 0, halfMap, roadWidth);

        // Quelques routes secondaires aléatoires (exemple très basique)
        for (let i = 0; i < 5; i++) {
            const x = THREE.MathUtils.randFloat(-halfMap, halfMap);
            this.createRoad(x, -halfMap, x, halfMap, roadWidth);

            const z = THREE.MathUtils.randFloat(-halfMap, halfMap);
            this.createRoad(-halfMap, z, halfMap, z, roadWidth);
        }

        // Marquer la grille (simplifié: marquer les cellules traversées)
        // Une implémentation plus robuste utiliserait les intersections et segments
        this.roads.forEach(road => {
            // (Logique pour marquer la grille basée sur la géométrie des routes - complexe)
            // Pour l'instant, on se base sur la position pour la génération des bâtiments
        });
    }

    createRoad(x1, z1, x2, z2, width) {
        // Calcule la longueur et l'angle de la route
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
        const angle = Math.atan2(z2 - z1, x2 - x1);

        // Crée la géométrie (un simple plan pour la route)
        const roadGeometry = new THREE.PlaneGeometry(length, width);
        const roadMesh = new THREE.Mesh(roadGeometry, this.roadMaterial);

        // Positionne et oriente la route
        roadMesh.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2); // Centre du segment
        roadMesh.rotation.x = -Math.PI / 2; // Plane horizontal
        roadMesh.rotation.z = angle;      // Oriente dans la direction du segment

        roadMesh.receiveShadow = true; // Les routes peuvent recevoir des ombres

        this.scene.add(roadMesh);
        this.roads.push(roadMesh);
    }

    // --- Génération des Bâtiments (Très Simpliste) ---
    generateBuildings() {
        const halfMap = this.config.mapSize / 2;
        const density = this.config.buildingDensity;
        const roadWidth = this.config.roadWidth;
        const buildingMargin = 1; // Espace entre bâtiment et route/autre bâtiment

        // *** Approche Simplifiée : Placer aléatoirement et vérifier la collision avec les routes ***
        // Une meilleure approche définirait des "plots" constructibles entre les routes.
        const attempts = 200; // Nombre de tentatives pour placer des bâtiments

        // Géométrie et matériau de base (partagés si possible, mais ici simple)
        const buildingGeometry = new THREE.BoxGeometry(1, 1, 1); // Sera scalé

        for (let i = 0; i < attempts; i++) {
            // Taille aléatoire du bâtiment
            const sizeX = THREE.MathUtils.randFloat(4, 10);
            const sizeZ = THREE.MathUtils.randFloat(4, 10);
            const height = THREE.MathUtils.randFloat(this.config.buildingMinHeight, this.config.buildingMaxHeight);

            // Position aléatoire dans la carte
            const posX = THREE.MathUtils.randFloat(-halfMap + sizeX / 2, halfMap - sizeX / 2);
            const posZ = THREE.MathUtils.randFloat(-halfMap + sizeZ / 2, halfMap - sizeZ / 2);

            // Vérifier si la position est trop proche d'une route (simplifié)
            let tooCloseToRoad = false;
            // Approximation grossière : on vérifie juste si le centre est sur un axe principal
            if (Math.abs(posX) < roadWidth / 2 + sizeX / 2 + buildingMargin || Math.abs(posZ) < roadWidth / 2 + sizeZ / 2 + buildingMargin) {
                 // Logique plus fine nécessaire pour les routes secondaires
                 // On pourrait tester l'intersection des AABB (Axis-Aligned Bounding Box)
                 tooCloseToRoad = true; // Simplification: évite près des axes 0
            }

            // Vérifier si la position est trop proche d'un autre bâtiment (AABB collision)
            let tooCloseToBuilding = false;
            const buildingBox = new THREE.Box3(
                new THREE.Vector3(posX - sizeX / 2 - buildingMargin, 0, posZ - sizeZ / 2 - buildingMargin),
                new THREE.Vector3(posX + sizeX / 2 + buildingMargin, height, posZ + sizeZ / 2 + buildingMargin)
            );
            for(const existingBuilding of this.buildings) {
                 if (buildingBox.intersectsBox(existingBuilding.userData.boundingBox)) {
                     tooCloseToBuilding = true;
                     break;
                 }
            }


            // Si l'emplacement est valide et la densité le permet
            if (!tooCloseToRoad && !tooCloseToBuilding && Math.random() < density) {
                const buildingMesh = new THREE.Mesh(buildingGeometry, this.buildingMaterial.clone()); // Clone pour couleurs différentes
                buildingMesh.scale.set(sizeX, height, sizeZ);
                buildingMesh.position.set(posX, height / 2, posZ); // Positionne le centre à la base

                buildingMesh.castShadow = true;
                buildingMesh.receiveShadow = true;

                 // Modifier légèrement la couleur pour la variété
                buildingMesh.material.color.setHSL(Math.random() * 0.1 + 0.55, 0.1, Math.random() * 0.3 + 0.4);

                // Stocker la bounding box pour les vérifications futures
                buildingMesh.userData.boundingBox = new THREE.Box3().setFromObject(buildingMesh);


                this.scene.add(buildingMesh);
                this.buildings.push(buildingMesh);
            }
        }
        // Nettoyer la géométrie de base si elle n'est plus utilisée ailleurs
         buildingGeometry.dispose();


        // --- Optimisation potentielle ---
        // Si le nombre de bâtiments devient très grand (> quelques centaines/milliers),
        // envisagez d'utiliser THREE.InstancedMesh pour dessiner tous les bâtiments
        // avec un seul appel de dessin (draw call). Cela demande une logique différente
        // pour définir la position/taille/couleur de chaque instance.
        // Pour l'instant, des maillages séparés sont acceptables.
    }

    // Méthodes pour marquer la grille, trouver des plots, etc. (plus avancées)
    // ...
}