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
        const deltaTime = this.experience.time.delta / 1000; // Obtenir delta en secondes

        // --- Récupérer l'état de santé ---
        // Ceci est un EXEMPLE. Vous devrez implémenter la logique pour obtenir
        // l'état de santé de votre jeu (ex: depuis un gestionnaire de joueur, etc.)
        // et le normaliser entre 0 (santé min) et 1 (santé max).
        const playerHealth = 0.8; // Exemple: Le joueur a 80% de santé
        const normalizedHealth = playerHealth; // Assurez-vous que c'est bien entre 0 et 1
        // --- Fin Récupération Santé ---


        // Mettre à jour les composants de la ville si nécessaire
        this.cityManager?.update(); // Appelera la méthode update de CityManager
        // Appel de l'update de l'environnement avec delta et santé
        this.environment?.update(deltaTime, normalizedHealth);
    }

    // --- Ajouter une méthode destroy pour nettoyer ---
    destroy() {
        console.log("Destruction du World...");
        this.cityManager?.destroy(); // Nettoie CityGround
        this.environment?.destroy(); // <-- AJOUT: Appelle le nettoyage de Environment (Skybox, OuterGround, Lune, Lumières)

        // Vider la scène explicitement si les destroy précédents ne suffisent pas
        // (Peut-être pas nécessaire si les destroy sont complets)
        // while(this.scene.children.length > 0){
        //    const object = this.scene.children[0];
        //    this.scene.remove(object);
        //    // Ajouter dispose pour geometry/material si nécessaire
        // }
        console.log("World détruit.");
    }
}