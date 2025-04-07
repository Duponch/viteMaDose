// Remplacer 'import EventEmitter from 'events';' par ceci :
// Pas d'import nécessaire

// Faire hériter de EventTarget au lieu de EventEmitter
export default class Time extends EventTarget {
    constructor() {
        // super() est nécessaire
        super();

        // Setup initial (reste identique)
        this.start = Date.now();
        this.current = this.start;
        this.elapsed = 0;
        this.delta = 16;

        // Lancement de la boucle de tick dès l'instanciation
        window.requestAnimationFrame(() => {
            this.tick();
        });
    }

    tick() {
        const currentTime = Date.now();
        this.delta = currentTime - this.current;
        this.current = currentTime;
        this.elapsed = this.current - this.start;

        // Utiliser dispatchEvent au lieu de emit
        this.dispatchEvent(new Event('tick'));

        // Continue la boucle (reste identique)
        window.requestAnimationFrame(() => {
            this.tick();
        });
    }

     // Pas besoin de méthode 'off' explicite ici non plus
}