// src/Core/World.js
import * as THREE from 'three';
import Environment from '../World/Environment.js';
// Supprimez Floor.js si CityManager gère le sol global
// import Floor from '../World/Floor.js';
import CityManager from '../World/CityManager.js'; // <- Changer l'import

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;
        this.cityManager = new CityManager(this.experience);

        // Instancier Environment (le constructeur est maintenant synchrone)
        this.environment = new Environment(this.experience, this);

        // Appeler l'initialisation asynchrone du monde
        this.initializeWorld();
    }

    // NOUVELLE méthode pour gérer l'initialisation asynchrone
    async initializeWorld() {
        console.log("World: Initialisation asynchrone...");
        try {
            // Démarrer l'initialisation asynchrone de l'environnement ET attendre qu'elle soit finie
            await this.environment.initialize();
            console.log("World: Environnement initialisé.");

            // Démarrer la génération de la ville (peut aussi être fait en parallèle si besoin)
            await this.generateCityAsync();

            console.log("World: Initialisation complète.");
            // Vous pouvez émettre un événement ou définir un flag si d'autres parties doivent savoir que le monde est prêt

        } catch (error) {
            console.error("World: Erreur lors de l'initialisation asynchrone:", error);
        }
    }

    // NOUVELLE méthode pour gérer l'initialisation asynchrone
    async generateCityAsync() {
        // Cette fonction reste asynchrone
        try {
            await this.cityManager.generateCity();
            console.log("Ville chargée dans le monde.");
        } catch (error) {
            console.error("Impossible de générer la ville dans World:", error);
        }
    }

    async generateCityAsync() {
        try {
            await this.cityManager.generateCity();
            console.log("Ville chargée dans le monde.");
            // Ici, vous pourriez déclencher d'autres logiques qui dépendent de la ville générée
            // (ex: initialiser les PNJ, démarrer des systèmes de simulation...)
        } catch (error) {
            console.error("Impossible de générer la ville dans World:", error);
        }
    }

	update() {
        // Récupérer deltaTime en MILLISECONDES car Environment.js l'attend ainsi
        const deltaTime = this.experience.time.delta; // Time.js fournit delta en ms
        const normalizedHealth = 0.8; // Exemple de santé

        this.cityManager?.update();
        // Passer deltaTime (en ms) à l'environnement
        this.environment?.update(deltaTime, normalizedHealth);
    }

    // --- Ajouter une méthode destroy pour nettoyer ---
    destroy() {
        console.log("Destruction du World...");
        this.cityManager?.destroy();
        this.environment?.destroy(); // S'assure que Environment nettoie ses éléments
        console.log("World détruit.");
    }
}