import * as THREE from 'three';
import Environment from '../World/Environment.js';
import Floor from '../World/Floor.js';
import CityGenerator from '../World/CityGenerator.js';

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources; // Si on charge des assets

        // Crée le sol
        this.floor = new Floor(this.experience);
        this.scene.add(this.floor.mesh);

        // Crée l'environnement (lumières, etc.)
        this.environment = new Environment(this.experience);

        // Crée le générateur de ville et génère la ville
        this.cityGenerator = new CityGenerator(this.experience, {
            mapSize: 100, // Taille de la zone de la ville
            cellSize: 1, // Taille d'une cellule de grille (optionnel)
            roadWidth: 4, // Largeur des routes
            buildingMinHeight: 5,
            buildingMaxHeight: 25,
            buildingDensity: 0.7 // Probabilité de construire sur un plot libre
        });
        this.cityGenerator.generate();

        // Écouter les événements si nécessaire (ex: ressources chargées)
        // this.resources.on('ready', () => { ... })
    }

    update() {
        // Mettre à jour les éléments du monde ici si nécessaire
        // (ex: animations spécifiques au monde)
    }
}