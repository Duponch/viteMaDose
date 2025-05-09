import * as THREE from 'three';
import Environment from './Environment/Environment.js';
import City from './City/CityManager.js';
import AgentManager from './Agents/AgentManager.js';
import CarManager from './Cars/CarManager.js';
import DebugVisualManager from './Debug/DebugVisualManager.js';

export default class World {
    constructor(experience) {
        this.experience = experience;
        this.scene = experience.scene;
        this.canvas = experience.canvas;
        
        // ... existing code ...
    }
    
    // ... existing methods ...
    
    update() {
       const deltaTime = this.experience.time.delta;
       this.environment?.update(deltaTime);
       const currentHour = this.environment?.getCurrentHour() ?? 12;
       const currentDay = this.environment?.getCurrentCalendarDate()?.jour ?? -1; // Get current day

       // --- Daily Citizen Stats Update ---
       // Check if it's noon (hour 12) and a new day
       if (currentHour === 12 && currentDay !== this.lastUpdatedDay && currentDay !== -1) {
           console.log(`World: Performing daily citizen stats update for day ${currentDay}`);
           this.cityManager?.citizenManager?.citizens.forEach(citizen => {
               // Calculate happiness based on health and salary (clamped between 0 and 100)
               citizen.happiness = Math.max(0, Math.min(100, (citizen.health + citizen.salary) / 2));

               // Increase health by 1 (max maxHealth)
               citizen.health = Math.min(citizen.maxHealth, citizen.health + 1);

               // Decrease maxHealth by 1 (min 0)
               citizen.maxHealth = Math.max(0, citizen.maxHealth - 1);

               // Increase money by their salary
               citizen.money += citizen.salary;
           });
           this.lastUpdatedDay = currentDay; // Update the last updated day
       }

       // Mise à jour du cityManager avec deltaTime pour la gestion de la santé des citoyens
       if (this.cityManager) {
           this.cityManager.update(deltaTime);
       }

       // PlotContentGenerator.update (fenêtres) est géré par CityManager ou ici si besoin
       if (this.cityManager?.contentGenerator) {
            this.cityManager.contentGenerator.update(currentHour); // Appel via CityManager
       }
       if(this.cityManager?.lampPostManager) {
           this.cityManager.lampPostManager.updateLampPostLights(currentHour); // Appel via CityManager
       }
       if(this.carManager) {
           this.carManager.updateCarLights(currentHour); // Mise à jour des phares des voitures
       }
       this.carManager?.update(deltaTime); // Mettre à jour les voitures
       this.agentManager?.update(deltaTime);
   }
   
   // ... other methods ...
} 