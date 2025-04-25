// src/Utils/Time.js
// Pas d'import nécessaire pour EventTarget

export default class Time extends EventTarget {
    constructor() {
        super();

        // Setup initial
        this.start = Date.now();
        this.current = this.start;
        this.elapsed = 0;
        this.delta = 16; // Delta initial (ne sera utilisé qu'au premier tick)
        this.unscaledDelta = 16; // <-- AJOUT: Delta non affecté par pause/scale

        // Contrôle du temps
        this.timeScale = 1.0; // Échelle de temps (1.0 = vitesse normale)
        this._isPaused = false;
        this.speedSteps = [0.05, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]; // Vitesses prédéfinies

        // Lancement de la boucle de tick dès l'instanciation
        window.requestAnimationFrame(() => {
            this.tick();
        });
    }

    /* tick() {
        const currentTime = Date.now();
        const rawDelta = currentTime - this.current; // Temps réel écoulé depuis le dernier frame
        this.current = currentTime;

        // Calculer le delta utilisé par le jeu (prend en compte pause et échelle)
        this.delta = this._isPaused ? 0 : rawDelta * this.timeScale;

        // Mettre à jour le temps total écoulé (avec le delta du jeu)
        this.elapsed += this.delta;

        // Émettre l'événement tick (les écouteurs recevront le delta ajusté)
        this.dispatchEvent(new Event('tick'));

        // Continue la boucle
        window.requestAnimationFrame(() => {
            this.tick();
        });
    } */

	tick() {
		const currentTime = Date.now();
		let rawDelta = currentTime - this.current; // Temps réel écoulé
		this.current = currentTime;

		// --- Ajout : Brider le delta maximum ---
		// Empêche les sauts énormes si l'application lag ou perd le focus
		// 1000 / 30 = ~33ms (pour 30 FPS min). On peut prendre un peu plus large.
		const maxDelta = 50; // Limite à 50ms (équiv. 20 FPS min)
		if (rawDelta > maxDelta) {
			rawDelta = maxDelta;
			// console.warn(`Time.tick: Delta time capped at ${maxDelta}ms`); // Optionnel: pour débug
		}
		// --------------------------------------

        // --- AJOUT : Stocker le delta non modifié ---
        this.unscaledDelta = rawDelta;
        // ------------------------------------------

		// Calculer le delta utilisé par le jeu (prend en compte pause, échelle ET bridage)
		this.delta = this._isPaused ? 0 : rawDelta * this.timeScale;

		// Mettre à jour le temps total écoulé (avec le delta du jeu)
		this.elapsed += this.delta;

		// Émettre l'événement tick (les écouteurs recevront le delta ajusté)
		// Vérifier si des écouteurs existent avant de créer l'événement (micro-optimisation)
		// if (this.listenerCount('tick') > 0) { // Note: EventTarget n'a pas listenerCount
			this.dispatchEvent(new Event('tick'));
		// }

		// Continue la boucle
		window.requestAnimationFrame(() => {
			this.tick();
		});
	}

    // --- Méthodes de contrôle du temps ---

    pause() {
        if (!this._isPaused) {
            this._isPaused = true;
            this.dispatchEvent(new Event('paused')); // Émettre un événement pour l'UI
            console.log("Time: Paused");
        }
    }

    play() {
        if (this._isPaused) {
            this._isPaused = false;
            // Important: réinitialiser 'current' pour éviter un saut de temps énorme au redémarrage
            this.current = Date.now();
            this.dispatchEvent(new Event('played')); // Émettre un événement pour l'UI
            console.log("Time: Played");
        }
    }

    togglePause() {
        if (this._isPaused) {
            this.play();
        } else {
            this.pause();
        }
    }

    setSpeed(scale) {
        this.timeScale = Math.max(0, scale); // S'assurer que l'échelle n'est pas négative
        this.dispatchEvent(new CustomEvent('speedchange', { detail: { scale: this.timeScale } }));
        console.log(`Time: Speed set to ${this.timeScale}x`);
        // Si on ajuste la vitesse pendant la pause, on reste en pause
        // Si on ajuste la vitesse pendant la lecture, on continue la lecture
    }

    increaseSpeed() {
        let currentIndex = this.speedSteps.indexOf(this.timeScale);
        // Si la vitesse actuelle n'est pas dans les paliers, on se cale sur le plus proche (ou 1x par défaut)
        if (currentIndex === -1) {
            // Trouver l'index du palier juste supérieur ou égal à la vitesse actuelle
            currentIndex = this.speedSteps.findIndex(step => step >= this.timeScale);
            // Si aucun n'est supérieur (ex: on était à 5x), on prend le dernier palier
            if (currentIndex === -1) currentIndex = this.speedSteps.length - 1;
            // Si on était entre deux paliers (ex: 1.5x), findIndex donne l'index du palier supérieur (2x),
            // donc on ne veut pas l'incrémenter tout de suite pour aller à 4x. On reste sur 2x.
            // C'est ok comme ça.
        } else {
             // Si on est sur un palier, on prend le suivant (si possible)
            currentIndex = Math.min(this.speedSteps.length - 1, currentIndex + 1);
        }
        this.setSpeed(this.speedSteps[currentIndex]);
    }

    decreaseSpeed() {
        let currentIndex = this.speedSteps.indexOf(this.timeScale);
         if (currentIndex === -1) {
            // Trouver l'index du palier juste inférieur ou égal
            for(let i = this.speedSteps.length - 1; i >= 0; i--) {
                if (this.speedSteps[i] <= this.timeScale) {
                    currentIndex = i;
                    break;
                }
            }
             // Si aucun n'est inférieur (ex: on était à 0.1x), on prend le premier palier
             if (currentIndex === -1) currentIndex = 0;
            // Comme pour increase, on ne décrémente pas si on s'est recalé.
        } else {
            // Si on est sur un palier, on prend le précédent (si possible)
            currentIndex = Math.max(0, currentIndex - 1);
        }
        this.setSpeed(this.speedSteps[currentIndex]);
    }

    get isPaused() {
        return this._isPaused;
    }
}