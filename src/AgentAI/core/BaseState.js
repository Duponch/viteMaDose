export default class BaseState {
    constructor(context) {
        // Conserve une référence vers le contexte partagé de l'agent
        this.ctx = context;
    }

    /**
     * Facilite l'accès au temps courant du jeu.
     * @returns {number} Le temps courant en millisecondes.
     */
    get currentGameTime() {
        return this.ctx.currentGameTime ?? 0;
    }

    /**
     * Appelé une seule fois lorsqu'on entre dans l'état.
     */
    onEnter() {}

    /**
     * Appelé à chaque frame/logique de mise à jour.
     * @param {number} deltaTime Temps écoulé depuis la dernière mise à jour (en secondes).
     */
    onUpdate(deltaTime) {}

    /**
     * Appelé une seule fois lorsqu'on quitte l'état.
     */
    onExit() {}
} 