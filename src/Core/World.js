// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
import Floor from '../World/Floor.js';
import CityGenerator from '../World/CityGenerator.js';

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;

        this.floor = new Floor(this.experience);
        this.scene.add(this.floor.mesh);

        this.environment = new Environment(this.experience);

        // Passe la configuration au CityGenerator
        this.cityGenerator = new CityGenerator(this.experience, {
            mapSize: 150,         // Taille de la carte
            roadWidth: 5,         // Largeur de la route elle-même
            sidewalkWidth: 2,     // Largeur de chaque trottoir
            minPlotSize: 20,      // Taille minimale d'une parcelle avant d'arrêter de diviser
            maxRecursionDepth: 6, // Profondeur de subdivision max
            parkProbability: 0.1, // % de chance qu'une parcelle devienne un parc
            buildingMargin: 2.5,  // Espace entre bord de parcelle et bâtiment
            // ... autres paramètres si besoin
        });
        this.cityGenerator.generate(); // Lance la génération

        // ...
    }

    update() {
        // ...
    }
}