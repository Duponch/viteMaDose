// src/World/Vehicles/CarColors.js

/**
 * Définit une palette de couleurs pour les voitures
 * Couleurs vives et naturelles pour des voitures
 */
export const CAR_COLORS = [
    0xFF0000, // Rouge
    0x0000FF, // Bleu
    0x00FF00, // Vert
    0xFFFF00, // Jaune
    0xFF8000, // Orange
    0x800080, // Violet
    0x00FFFF, // Cyan
    0xFF00FF, // Magenta
    0x008000, // Vert foncé
    0x000080, // Bleu marine
    0x800000, // Bordeaux
    0x808000, // Olive
    0xC0C0C0, // Argent
    0x000000, // Noir
    0xFFFFFF, // Blanc
    0x964B00, // Marron
    0xA52A2A, // Brun
    0x808080, // Gris
    0xFFD700, // Or
    0xDDA0DD, // Prune
    0xADD8E6, // Bleu clair
    0xFFB6C1, // Rose clair
    0x90EE90, // Vert clair
    0x4B0082  // Indigo
];

/**
 * Génère une couleur aléatoire de la palette
 * @returns {number} Couleur hexadécimale
 */
export function getRandomCarColor() {
    return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
}

/**
 * Génère une couleur unique basée sur un identifiant
 * @param {number} id - Identifiant à utiliser pour la sélection de couleur
 * @returns {number} Couleur hexadécimale
 */
export function getCarColorById(id) {
    // Assure que même avec plus de voitures que de couleurs, chaque voiture aura une couleur consistante
    return CAR_COLORS[id % CAR_COLORS.length];
}
