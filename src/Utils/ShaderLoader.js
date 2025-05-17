/**
 * Utilitaire pour gérer les chemins des shaders en fonction de l'environnement
 */
export default class ShaderLoader {
    /**
     * Détecte si nous sommes en environnement de production (Netlify)
     * @returns {boolean} true si nous sommes sur Netlify, false sinon
     */
    static isProduction() {
        return window.location.hostname.includes('netlify') || 
               window.location.hostname.includes('vitemadose');
    }

    /**
     * Retourne le chemin de base pour charger les shaders
     * @returns {string} Le chemin de base
     */
    static getShaderBasePath() {
        return this.isProduction() ? '/World/Shaders/' : '../src/World/Shaders/';
    }

    /**
     * Construit le chemin complet pour un shader
     * @param {string} shaderName - Nom du fichier shader
     * @returns {string} Le chemin complet
     */
    static getShaderPath(shaderName) {
        return `${this.getShaderBasePath()}${shaderName}`;
    }
} 