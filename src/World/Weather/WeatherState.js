/**
 * Classe représentant un état météorologique complet
 * Utilisée pour les transitions entre différentes conditions météo
 */
export default class WeatherState {
    /**
     * @param {string} type - Le type de météo (clear, cloudy, etc.)
     * @param {number} cloudDensity - Densité des nuages (0-1)
     * @param {number} cloudOpacity - Opacité des nuages (0-1)
     * @param {number} rainIntensity - Intensité de la pluie (0-1)
     * @param {number} fogDensity - Densité du brouillard (0-1)
     * @param {number} sunBrightness - Luminosité du soleil (0-1)
     * @param {number} lightningIntensity - Intensité des éclairs (0-1)
     * @param {number} rainbowOpacity - Opacité de l'arc-en-ciel (0-1)
     * @param {number} grassBendStrength - Force d'inclinaison de l'herbe (0-1.5)
     * @param {number} leavesIntensity - Intensité des feuilles qui s'envolent (0-1)
     */
    constructor(
        type = 'clear',
        cloudDensity = 0.1,
        cloudOpacity = 0.3,
        rainIntensity = 0,
        fogDensity = 0,
        sunBrightness = 1.0,
        lightningIntensity = 0,
        rainbowOpacity = 0,
        grassBendStrength = 0,
        leavesIntensity = 0
    ) {
        this.type = type;
        this.cloudDensity = cloudDensity;
        this.cloudOpacity = cloudOpacity;
        this.rainIntensity = rainIntensity;
        this.fogDensity = fogDensity;
        this.sunBrightness = sunBrightness;
        this.lightningIntensity = lightningIntensity;
        this.rainbowOpacity = rainbowOpacity;
        this.grassBendStrength = grassBendStrength;
        this.leavesIntensity = leavesIntensity;
    }

    /**
     * Crée une copie de cet état météorologique
     * @returns {WeatherState} Une nouvelle instance avec les mêmes propriétés
     */
    clone() {
        return new WeatherState(
            this.type,
            this.cloudDensity,
            this.cloudOpacity,
            this.rainIntensity,
            this.fogDensity,
            this.sunBrightness,
            this.lightningIntensity,
            this.rainbowOpacity,
            this.grassBendStrength,
            this.leavesIntensity
        );
    }
} 