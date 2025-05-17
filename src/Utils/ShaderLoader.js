/**
 * Utilitaire pour gérer les chemins des shaders
 * Utilise import.meta.glob de Vite pour charger les shaders pendant la compilation
 */
export default class ShaderLoader {
    static shaderCache = {};
    static isInitialized = false;
    static shaderModules = {};

    /**
     * Initialise le cache des shaders
     */
    static async initialize() {
        if (this.isInitialized) return;
        
        // Utiliser Vite import.meta.glob pour charger tous les shaders
        this.shaderModules = import.meta.glob('/src/World/Shaders/*.glsl', { as: 'raw' });
        this.isInitialized = true;
    }

    /**
     * Charge un shader par son nom
     * @param {string} shaderName - Nom du fichier shader
     * @returns {Promise<string>} - Contenu du shader
     */
    static async loadShader(shaderName) {
        await this.initialize();
        
        // Vérifier si le shader est déjà en cache
        if (this.shaderCache[shaderName]) {
            return this.shaderCache[shaderName];
        }
        
        const shaderPath = `/src/World/Shaders/${shaderName}`;
        
        // Vérifier si le shader est disponible via import.meta.glob
        if (this.shaderModules[shaderPath]) {
            try {
                const shaderContent = await this.shaderModules[shaderPath]();
                this.shaderCache[shaderName] = shaderContent;
                return shaderContent;
            } catch (error) {
                console.error(`Erreur lors du chargement du shader ${shaderName}:`, error);
                throw error;
            }
        } else {
            throw new Error(`Shader ${shaderName} non trouvé dans les modules importés.`);
        }
    }

    
} 