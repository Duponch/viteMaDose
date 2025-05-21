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

    /**
     * Charge un shader et le modifie avec des paramètres personnalisés
     * @param {string} shaderName - Nom du fichier shader
     * @param {Object} customParams - Paramètres personnalisés à inclure
     * @returns {Promise<string>} - Contenu du shader modifié
     */
    static async loadShaderWithCustomParams(shaderName, customParams = {}) {
        // Charger le shader de base
        let shaderContent = await this.loadShader(shaderName);
        
        // Ajouter les uniformes personnalisés si nécessaire
        if (customParams.uniforms && customParams.uniforms.length > 0) {
            const uniformsDeclaration = customParams.uniforms
                .map(uniform => `uniform ${uniform.type} ${uniform.name};${uniform.comment ? ' // ' + uniform.comment : ''}`)
                .join('\n');
            
            // Chercher où insérer les nouveaux uniformes
            const lastUniformIndex = shaderContent.lastIndexOf('uniform ');
            const lastUniformEndLine = shaderContent.indexOf('\n', lastUniformIndex);
            
            if (lastUniformIndex !== -1 && lastUniformEndLine !== -1) {
                // Insérer après le dernier uniform existant
                shaderContent = 
                    shaderContent.substring(0, lastUniformEndLine + 1) + 
                    uniformsDeclaration + '\n' + 
                    shaderContent.substring(lastUniformEndLine + 1);
            }
        }
        
        return shaderContent;
    }
} 