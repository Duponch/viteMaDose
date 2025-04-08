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
        this.resources = this.experience.resources; // Si vous utilisez un loader centralisé

        // Le sol est maintenant géré par CityManager, supprimez ceci :
        // this.floor = new Floor(this.experience);
        // this.scene.add(this.floor.mesh);

        this.environment = new Environment(this.experience);

        // --- Instancier CityManager ---
        // Passez la configuration spécifique si nécessaire
        this.cityManager = new CityManager(this.experience);

        // --- Lancer la génération (maintenant asynchrone) ---
        this.generateCityAsync();


        // ... autres éléments du monde ...
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
        // Mettre à jour les composants de la ville si nécessaire
        this.cityManager?.update(); // Appelera la méthode update de CityManager
        this.environment?.update();
    }

    // --- Ajouter une méthode destroy pour nettoyer ---
    destroy() {
        console.log("Destruction du World...");
        this.cityManager?.destroy(); // Appeler destroy sur le CityManager
        // Nettoyer l'environnement, etc.
        // this.environment.destroy(); // Si Environment a une méthode destroy
         // Supprimer les lumières, etc. de la scène si Environment ne le fait pas

         // Vider la scène explicitement si nécessaire (attention aux éléments gérés par Experience)
         // while(this.scene.children.length > 0){
         //     this.scene.remove(this.scene.children[0]);
         // }
    }
}