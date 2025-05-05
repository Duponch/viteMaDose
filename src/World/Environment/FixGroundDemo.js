// Script de démonstration pour tester la correction du sol
import { fixGroundLighting } from './FixShadow.js';

/**
 * Cette fonction applique la correction du sol à l'environnement actuel.
 * Pour l'utiliser, importez cette fonction et appelez-la en lui passant votre instance d'environnement.
 * 
 * Exemple dans le fichier principal ou dans World.js :
 * import { applyGroundFix } from './World/Environment/FixGroundDemo.js';
 * applyGroundFix(this.environment);
 */
export function applyGroundFix(environment) {
    // Vérifier que l'environnement est valide
    if (!environment) {
        console.error("Erreur : L'environnement n'est pas défini.");
        return;
    }
    
    console.log("Application de la correction du sol...");
    
    // Si l'environnement n'est pas encore initialisé, attendons qu'il le soit
    if (!environment.isInitialized) {
        console.log("L'environnement n'est pas encore initialisé. La correction sera appliquée après l'initialisation.");
        
        // Stocker la méthode createOuterGround originale
        const originalCreateOuterGround = environment.createOuterGround;
        
        // Redéfinir la méthode pour appliquer notre correction après la création du sol original
        environment.createOuterGround = function() {
            // Appeler la méthode originale d'abord
            originalCreateOuterGround.call(environment);
            
            // Puis appliquer notre correction
            fixGroundLighting(environment);
        };
        
        console.log("Méthode createOuterGround modifiée pour appliquer la correction automatiquement.");
    } else {
        // Si l'environnement est déjà initialisé, appliquer la correction immédiatement
        fixGroundLighting(environment);
    }
    
    return true;
}
