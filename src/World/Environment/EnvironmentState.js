/**
 * Classe représentant un état d'environnement complet
 * Utilisée pour gérer les éléments environnementaux comme les oiseaux
 */
export default class EnvironmentState {
    /**
     * @param {number} birdDensity - Densité des oiseaux (0-1)
     */
    constructor(
        birdDensity = 0.5
    ) {
        this.birdDensity = birdDensity;
    }

    /**
     * Crée une copie de cet état d'environnement
     * @returns {EnvironmentState} Une nouvelle instance avec les mêmes propriétés
     */
    clone() {
        return new EnvironmentState(
            this.birdDensity
        );
    }
} 