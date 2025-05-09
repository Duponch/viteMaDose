/**
 * Classe gérant la santé, les maladies et le système de médicaments des citoyens.
 * Implémente toute la logique liée à ces fonctionnalités de manière modulaire.
 */
export default class CitizenHealth {
    constructor(experience) {
        this.experience = experience;
        
        // Constantes pour les règles du système de santé
        this.VIEILLISSEMENT_HEBDO = 1; // Diminution du seuil de santé max par semaine
        this.ADAPTATION_JOURNALIERE = 1; // Augmentation de la santé max par jour
        this.AGRESSION_CHIMIQUE_PAR_MEDICAMENT = 1; // Diminution santé max par médicament
        this.DEPENDANCE_AUGMENTATION_PAR_MEDICAMENT = 10; // Augmentation dépendance par médicament
        this.DEPENDANCE_DIMINUTION_SANS_MEDICAMENT = 10; // Diminution dépendance après 7 jours sans médicament
        this.IMMUNITE_AUGMENTATION_PAR_JOUR = 1; // Augmentation santé par jour (système immunitaire)
        this.DEGATS_MALADIE_PAR_JOUR = 2; // Diminution santé par jour et par maladie
        this.SOIN_PALLIATIF_PAR_MEDICAMENT = 2; // Augmentation santé par médicament palliatif
        
        // Seuils pour les statuts sanitaires (en pourcentage de la santé max)
        this.SEUILS_STATUT_SANITAIRE = {
            TRES_BONNE_SANTE: { min: 75, max: 100, chance_maladie: 1 }, // 1% / semaine
            BONNE_SANTE: { min: 50, max: 75, chance_maladie: 5 }, // 5% / semaine
            MAUVAISE_SANTE: { min: 25, max: 50, chance_maladie: 10 }, // 10% / semaine
            TRES_MAUVAISE_SANTE: { min: 0, max: 25, chance_maladie: 15 } // 15% / semaine
        };
        
        // Tableau de noms de maladies possibles
        this.NOMS_MALADIES = [
            "Grippe", "Rhume", "Bronchite", "Gastro-entérite", 
            "Migraine", "Allergie", "Fatigue chronique", "Arthrite",
            "Lombalgie", "Insomnie", "Hypertension", "Diabète"
        ];
    }
    
    /**
     * Initialise les données de santé pour un citoyen
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     */
    initializeHealthData(citizenInfo) {
        if (!citizenInfo) return;
        
        // Initialiser les paramètres de santé s'ils n'existent pas déjà
        if (citizenInfo.health === undefined) citizenInfo.health = 50;
        if (citizenInfo.maxHealth === undefined) citizenInfo.maxHealth = 100;
        if (citizenInfo.healthThreshold === undefined) citizenInfo.healthThreshold = 100;
        
        // Paramètres de dépendance chimique
        if (citizenInfo.chemicalDependency === undefined) citizenInfo.chemicalDependency = 0;
        if (citizenInfo.lastMedicationTime === undefined) citizenInfo.lastMedicationTime = -1;
        if (citizenInfo.daysSinceLastMedication === undefined) citizenInfo.daysSinceLastMedication = 0;
        
        // Paramètres de maladies
        if (!citizenInfo.diseases) citizenInfo.diseases = [];
        if (!citizenInfo.naturalTreatmentCount) citizenInfo.naturalTreatmentCount = 0;
        
        // Statuts
        if (citizenInfo.status === undefined) citizenInfo.status = "Humain"; // "Humain" ou "Argile"
        if (citizenInfo.healthStatus === undefined) citizenInfo.healthStatus = this._calculateHealthStatus(citizenInfo);
        
        // Dates du dernier calcul pour le vieillissement/adaptation
        if (citizenInfo.lastWeeklyAgingUpdate === undefined) {
            const environment = this.experience.world?.environment;
            // Utiliser getCurrentCalendarDate pour obtenir le jour actuel
            const calendarDate = environment?.getCurrentCalendarDate();
            citizenInfo.lastWeeklyAgingUpdate = calendarDate?.jour || 0;
        }
        if (citizenInfo.lastDailyAdaptationUpdate === undefined) {
            const environment = this.experience.world?.environment;
            // Utiliser getCurrentCalendarDate pour obtenir le jour actuel
            const calendarDate = environment?.getCurrentCalendarDate();
            citizenInfo.lastDailyAdaptationUpdate = calendarDate?.jour || 0;
        }
        
        return citizenInfo;
    }
    
    /**
     * Met à jour l'état de santé d'un citoyen
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {number} currentDay - Le jour actuel du calendrier
     * @returns {Object} - Les informations mises à jour
     */
    updateHealth(citizenInfo, currentDay) {
        if (!citizenInfo) return null;
        
        // S'assurer que les données de santé sont initialisées
        this.initializeHealthData(citizenInfo);
        
        // 1. Vieillissement naturel (hebdomadaire)
        this._updateAging(citizenInfo, currentDay);
        
        // 2. Adaptation physiologique (journalière, si statut "Humain")
        this._updatePhysiologicalAdaptation(citizenInfo, currentDay);
        
        // 3. Dépendance chimique (vérifier si 7 jours sans médicament)
        this._updateChemicalDependency(citizenInfo, currentDay);
        
        // 4. Système immunitaire (augmentation santé journalière)
        this._updateImmuneSystem(citizenInfo, currentDay);
        
        // 5. Dégâts des maladies
        this._updateDiseasesDamage(citizenInfo);
        
        // 6. Besoin de médicament
        this._updateMedicationNeed(citizenInfo);
        
        // 7. Chance d'attraper une maladie (hebdomadaire)
        this._updateDiseaseChance(citizenInfo, currentDay);
        
        // 8. Mettre à jour le statut sanitaire
        citizenInfo.healthStatus = this._calculateHealthStatus(citizenInfo);
        
        // 9. Calculer le bonheur lié à la santé
        this._updateHappiness(citizenInfo);
        
        return citizenInfo;
    }
    
    /**
     * Ajoute une maladie aléatoire au citoyen
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     */
    addRandomDisease(citizenInfo) {
        if (!citizenInfo || !citizenInfo.diseases) return;
        
        // Sélectionner une maladie aléatoire
        const diseaseIndex = Math.floor(Math.random() * this.NOMS_MALADIES.length);
        const diseaseName = this.NOMS_MALADIES[diseaseIndex];
        
        // Vérifier si le citoyen a déjà cette maladie
        if (!citizenInfo.diseases.includes(diseaseName)) {
            citizenInfo.diseases.push(diseaseName);
            console.log(`Citoyen ${citizenInfo.id}: Nouvelle maladie: ${diseaseName}`);
        }
    }
    
    /**
     * Applique un traitement médicamenteux au citoyen
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {boolean} isPalliative - Si true, c'est un soin palliatif, sinon traitement classique
     * @returns {boolean} - True si le traitement a été appliqué avec succès
     */
    applyPharmaceuticalTreatment(citizenInfo, isPalliative = false) {
        if (!citizenInfo) return false;
        
        // Vérifier si le citoyen a suffisamment d'argent
        /*const medicationCost = 10;
        if (citizenInfo.money < medicationCost) {
            console.log(`Citoyen ${citizenInfo.id}: Pas assez d'argent pour acheter un médicament`);
            return false;
        }

        // Déduire le coût
        citizenInfo.money -= medicationCost;*/
        
        // Enregistrer la prise de médicament
        const environment = this.experience.world?.environment;
        citizenInfo.lastMedicationTime = environment?.currentGameTime || Date.now();
        citizenInfo.daysSinceLastMedication = 0;
        
        // Augmenter la dépendance chimique
        citizenInfo.chemicalDependency = Math.min(100, citizenInfo.chemicalDependency + this.DEPENDANCE_AUGMENTATION_PAR_MEDICAMENT);
        
        // Diminuer la santé max (agression chimique)
        citizenInfo.maxHealth = Math.max(0, citizenInfo.maxHealth - this.AGRESSION_CHIMIQUE_PAR_MEDICAMENT);
        
        // Mettre à jour le statut Argile/Humain
        if (citizenInfo.chemicalDependency >= 100 && citizenInfo.status !== "Argile") {
            citizenInfo.status = "Argile";
        }
        
        // Appliquer l'effet du médicament
        if (isPalliative) {
            // Soin palliatif: augmente la santé
            citizenInfo.health = Math.min(citizenInfo.maxHealth, citizenInfo.health + this.SOIN_PALLIATIF_PAR_MEDICAMENT);
        } else if (citizenInfo.diseases.length > 0) {
            // Traitement classique: supprime une maladie
            citizenInfo.diseases.pop();
        }
        
        return true;
    }
    
    /**
     * Applique un traitement naturel au citoyen
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @returns {boolean} - True si une maladie a été guérie, false sinon
     */
    applyNaturalTreatment(citizenInfo) {
        if (!citizenInfo) return false;
        
        // Incrémenter le compteur de traitements naturels
        citizenInfo.naturalTreatmentCount = (citizenInfo.naturalTreatmentCount || 0) + 1;
        
        // Vérifier si le seuil est atteint pour supprimer une maladie (5 prises)
        if (citizenInfo.naturalTreatmentCount >= 5 && citizenInfo.diseases.length > 0) {
            citizenInfo.diseases.pop();
            citizenInfo.naturalTreatmentCount = 0; // Réinitialiser le compteur
            return true;
        }
        
        return false;
    }
    
    /**
     * Calcule le statut sanitaire en fonction de la santé max
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @returns {string} - Le statut sanitaire
     */
    _calculateHealthStatus(citizenInfo) {
        if (!citizenInfo || citizenInfo.healthThreshold === undefined) return "INCONNU";
        
        // Calculer le pourcentage par rapport au seuil maximum (0-100)
        const healthPercent = (citizenInfo.maxHealth / citizenInfo.healthThreshold) * 100;
        
        if (healthPercent >= this.SEUILS_STATUT_SANITAIRE.TRES_BONNE_SANTE.min) {
            return "Très bonne santé";
        } else if (healthPercent >= this.SEUILS_STATUT_SANITAIRE.BONNE_SANTE.min) {
            return "Bonne santé";
        } else if (healthPercent >= this.SEUILS_STATUT_SANITAIRE.MAUVAISE_SANTE.min) {
            return "Mauvaise santé";
        } else {
            return "Très mauvaise santé";
        }
    }
    
    /**
     * Met à jour le vieillissement naturel (diminution hebdomadaire du seuil de santé max)
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {number} currentDay - Le jour actuel du calendrier
     */
    _updateAging(citizenInfo, currentDay) {
        if (!citizenInfo || citizenInfo.lastWeeklyAgingUpdate === undefined) return;
        
        // Accéder directement au jour actuel du calendrier
        const environment = this.experience.world?.environment;
        // Si currentDay est invalide, utiliser le jour du calendrier ou 0 par défaut
        if (!currentDay || currentDay <= 0) {
            const calendarData = environment?.getCurrentCalendarDate();
            currentDay = calendarData?.jour || 0;
        }
        
        // Vérifier si une semaine s'est écoulée
        let daysSinceLastUpdate = currentDay - citizenInfo.lastWeeklyAgingUpdate;
        
        // Si le jour actuel est plus petit que le dernier jour d'update, c'est probablement un changement de mois
        if (daysSinceLastUpdate < 0) {
            // Supposons que nous sommes passés au mois suivant
            // Récupérer le nombre de jours dans le mois précédent (approximatif à 30 jours si non disponible)
            const prevMonthDays = environment?.getMonthDays?.() || 30;
            
            // Recalculer les jours écoulés en tenant compte du changement de mois
            daysSinceLastUpdate = (prevMonthDays - citizenInfo.lastWeeklyAgingUpdate) + currentDay;
        }
        
        
        if (daysSinceLastUpdate >= 7) {
            // Calculer le nombre de semaines écoulées
            const weeksElapsed = Math.floor(daysSinceLastUpdate / 7);
                        
            // Appliquer le vieillissement
            citizenInfo.healthThreshold = Math.max(0, citizenInfo.healthThreshold - (weeksElapsed * this.VIEILLISSEMENT_HEBDO));
            
            
            // Si le seuil diminue en dessous de la santé max actuelle, ajuster la santé max
            if (citizenInfo.maxHealth > citizenInfo.healthThreshold) {
                citizenInfo.maxHealth = citizenInfo.healthThreshold;
            }
            
            // Mettre à jour la date du dernier calcul
            citizenInfo.lastWeeklyAgingUpdate = currentDay;
        }
    }
    
    /**
     * Met à jour l'adaptation physiologique (augmentation journalière de la santé max)
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {number} currentDay - Le jour actuel du calendrier
     */
    _updatePhysiologicalAdaptation(citizenInfo, currentDay) {
        if (!citizenInfo || citizenInfo.lastDailyAdaptationUpdate === undefined) return;
        
        // Vérifier si l'adaptation est bloquée par le statut "Argile"
        if (citizenInfo.status === "Argile") return;
        
        // Vérifier si un jour s'est écoulé
        let daysSinceLastUpdate = currentDay - citizenInfo.lastDailyAdaptationUpdate;
        
        // Gérer le changement de mois
        if (daysSinceLastUpdate < 0) {
            const environment = this.experience.world?.environment;
            const prevMonthDays = environment?.getMonthDays?.() || 30;
            daysSinceLastUpdate = (prevMonthDays - citizenInfo.lastDailyAdaptationUpdate) + currentDay;
        }
        
        if (daysSinceLastUpdate >= 1) {
            // Appliquer l'adaptation physiologique
            citizenInfo.maxHealth = Math.min(
                citizenInfo.healthThreshold, 
                citizenInfo.maxHealth + (daysSinceLastUpdate * this.ADAPTATION_JOURNALIERE)
            );
            
            // Mettre à jour la date du dernier calcul
            citizenInfo.lastDailyAdaptationUpdate = currentDay;
        }
    }
    
    /**
     * Met à jour la dépendance chimique
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {number} currentDay - Le jour actuel du calendrier
     */
    _updateChemicalDependency(citizenInfo, currentDay) {
        if (!citizenInfo || citizenInfo.lastMedicationTime === undefined) return;
        
        // Calculer les jours depuis la dernière prise de médicament
        const environment = this.experience.world?.environment;
        if (!environment) return;
        
        // Mettre à jour le compteur de jours sans médicament
        const currentGameTime = environment.currentGameTime || Date.now();
        const dayDurationInMs = environment.dayDurationMs || (24 * 60 * 60 * 1000);
        
        if (citizenInfo.lastMedicationTime > 0) {
            const msSinceLastMedication = currentGameTime - citizenInfo.lastMedicationTime;
            citizenInfo.daysSinceLastMedication = Math.floor(msSinceLastMedication / dayDurationInMs);
            
            // Diminuer la dépendance après 7 jours sans médicament
            if (citizenInfo.daysSinceLastMedication >= 7) {
                const weeksSinceLastMedication = Math.floor(citizenInfo.daysSinceLastMedication / 7);
                const dependencyReduction = weeksSinceLastMedication * this.DEPENDANCE_DIMINUTION_SANS_MEDICAMENT;
                
                // Appliquer la réduction
                citizenInfo.chemicalDependency = Math.max(0, citizenInfo.chemicalDependency - dependencyReduction);
                
                // Mettre à jour le statut Argile/Humain
                if (citizenInfo.chemicalDependency <= 0 && citizenInfo.status !== "Humain") {
                    citizenInfo.status = "Humain";
                }
                
                // Réinitialiser le dernier temps pour éviter plusieurs réductions
                citizenInfo.lastMedicationTime = currentGameTime - ((citizenInfo.daysSinceLastMedication % 7) * dayDurationInMs);
            }
        }
    }
    
    /**
     * Met à jour le système immunitaire (augmentation journalière de la santé)
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {number} currentDay - Le jour actuel du calendrier
     */
    _updateImmuneSystem(citizenInfo, currentDay) {
        if (!citizenInfo) return;
        
        // Calculer l'augmentation journalière de santé (système immunitaire)
        const lastImmuneDayUpdate = citizenInfo.lastImmuneDayUpdate || 0;
        let daysSinceLastUpdate = currentDay - lastImmuneDayUpdate;
        
        // Gérer le changement de mois
        if (daysSinceLastUpdate < 0) {
            const environment = this.experience.world?.environment;
            const prevMonthDays = environment?.getMonthDays?.() || 30;
            daysSinceLastUpdate = (prevMonthDays - lastImmuneDayUpdate) + currentDay;
        }
        
        if (daysSinceLastUpdate >= 1) {
            // Augmenter la santé 
            citizenInfo.health = Math.min(
                citizenInfo.maxHealth, 
                citizenInfo.health + (daysSinceLastUpdate * this.IMMUNITE_AUGMENTATION_PAR_JOUR)
            );
            
            // Mettre à jour la date du dernier calcul
            citizenInfo.lastImmuneDayUpdate = currentDay;
        }
    }
    
    /**
     * Met à jour les dégâts causés par les maladies
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     */
    _updateDiseasesDamage(citizenInfo) {
        if (!citizenInfo || !citizenInfo.diseases) return;
        
        // Calculer les dégâts totaux des maladies
        const diseasesCount = citizenInfo.diseases.length;
        if (diseasesCount > 0) {
            const diseaseDamage = diseasesCount * this.DEGATS_MALADIE_PAR_JOUR;
            
            // Appliquer les dégâts
            citizenInfo.health = Math.max(0, citizenInfo.health - diseaseDamage);
        }
    }
    
    /**
     * Met à jour le besoin de médicament
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     */
    _updateMedicationNeed(citizenInfo) {
        if (!citizenInfo) return;
        
        // Vérifier si la santé est inférieure à la santé max
        if (citizenInfo.health < citizenInfo.maxHealth) {
            // Le citoyen a besoin d'un médicament
            citizenInfo.needsMedication = true;
        } else {
            citizenInfo.needsMedication = false;
        }
    }
    
    /**
     * Met à jour la chance d'attraper une maladie
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     * @param {number} currentDay - Le jour actuel du calendrier
     */
    _updateDiseaseChance(citizenInfo, currentDay) {
        if (!citizenInfo) return;
        
        // Vérifier si une semaine s'est écoulée depuis la dernière vérification
        const lastDiseaseCheckDay = citizenInfo.lastDiseaseCheckDay || 0;
        let daysSinceLastCheck = currentDay - lastDiseaseCheckDay;
        
        // Gérer le changement de mois
        if (daysSinceLastCheck < 0) {
            const environment = this.experience.world?.environment;
            const prevMonthDays = environment?.getMonthDays?.() || 30;
            daysSinceLastCheck = (prevMonthDays - lastDiseaseCheckDay) + currentDay;
        }
        
        if (daysSinceLastCheck >= 7) {
            // Déterminer la chance de maladie en fonction du statut sanitaire
            let diseaseChance = 1; // Par défaut, 1%
            
            const healthStatus = this._calculateHealthStatus(citizenInfo);
            switch (healthStatus) {
                case "Très bonne santé":
                    diseaseChance = this.SEUILS_STATUT_SANITAIRE.TRES_BONNE_SANTE.chance_maladie;
                    break;
                case "Bonne santé":
                    diseaseChance = this.SEUILS_STATUT_SANITAIRE.BONNE_SANTE.chance_maladie;
                    break;
                case "Mauvaise santé":
                    diseaseChance = this.SEUILS_STATUT_SANITAIRE.MAUVAISE_SANTE.chance_maladie;
                    break;
                case "Très mauvaise santé":
                    diseaseChance = this.SEUILS_STATUT_SANITAIRE.TRES_MAUVAISE_SANTE.chance_maladie;
                    break;
            }
            
            // Lancer le dé pour déterminer si une maladie est contractée
            const rand = Math.random() * 100;
            if (rand < diseaseChance) {
                this.addRandomDisease(citizenInfo);
            }
            
            // Mettre à jour la date du dernier check
            citizenInfo.lastDiseaseCheckDay = currentDay;
        }
    }
    
    /**
     * Met à jour le bonheur lié à la santé
     * @private
     * @param {Object} citizenInfo - L'objet d'information du citoyen
     */
    _updateHappiness(citizenInfo) {
        if (!citizenInfo) return;
        
        // Calculer le bonheur lié à la santé
        const healthHappiness = citizenInfo.maxHealth > 0 ? citizenInfo.health / citizenInfo.maxHealth : 0;
        
        // Calculer le bonheur lié à l'argent
        const moneyHappiness = citizenInfo.salary > 0 ? Math.min(1, citizenInfo.salary / 100) : 0;
        
        // Calculer le bonheur global
        const totalHappiness = ((healthHappiness + moneyHappiness) / 2) * 100;
        
        // Mettre à jour le bonheur
        citizenInfo.happiness = totalHappiness;
    }
} 