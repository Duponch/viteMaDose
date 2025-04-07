// Remplacer 'import EventEmitter from 'events';' par ceci :
// Pas d'import nécessaire, EventTarget est global

// Faire hériter de EventTarget au lieu de EventEmitter
export default class Sizes extends EventTarget {
    constructor() {
        // super() est nécessaire quand on hérite
        super();

        // Setup initial (reste identique)
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.pixelRatio = Math.min(window.devicePixelRatio, 2);

        // Écouteur pour le redimensionnement
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.pixelRatio = Math.min(window.devicePixelRatio, 2);

            // Utiliser dispatchEvent au lieu de emit
            // On doit créer un objet Event (ou CustomEvent si on veut passer des données)
            this.dispatchEvent(new Event('resize'));
        });
    }

    // Pas besoin de méthode 'off' explicite si on utilise addEventListener/removeEventListener
    // La gestion se fait côté écouteur (dans Experience.js par exemple)
}