// src/World/Agent.js
import * as THREE from 'three';

export default class Agent {
    /**
     * Crée un agent avec un modèle FBX animé.
     * @param {THREE.Scene} scene La scène Three.js.
     * @param {THREE.Object3D} model Le modèle 3D CLONÉ (avec animations) à utiliser pour cet agent.
     * @param {number} debugPathColor Couleur hexadécimale pour visualiser le chemin (optionnel).
     */
    constructor(scene, model, debugPathColor = 0xff0000) {
        this.scene = scene;
        this.model = model; // Le modèle cloné spécifique à cet agent
        this.speed = 1; // Unités par seconde
        this.path = null;
        this.currentPathIndex = 0;
        this.reachTolerance = 0.2; // Tolérance pour atteindre un point
        this.debugPathColor = debugPathColor; // Utilisé par World.js pour la visualisation

        // --- Animation Setup ---
        this.mixer = null;
        this.walkAction = null;
        this.idleAction = null; // Optionnel: si vous avez une anim 'idle'
        this.setupAnimation();
        // -----------------------

        // Le modèle est déjà positionné par World.js lors du clonage
        // this.model.position.copy(startPosition); // Pas nécessaire ici
        // this.model.position.y = modelBaseHeight; // Assurer hauteur sol (géré par World.js via navGraph height)

        // Assurez-vous que le modèle est ajouté à la scène (normalement fait dans World.js après clonage)
        if (!this.model.parent) {
            this.scene.add(this.model);
        }
        this.model.name = "AgentModel_" + this.id; // Donner un nom unique si besoin
    }

    setupAnimation() {
        if (!this.model || !this.model.animations || this.model.animations.length === 0) {
            console.warn(`Agent ${this.id}: Modèle fourni n'a pas d'animations.`);
            return;
        }

        this.mixer = new THREE.AnimationMixer(this.model);

        // Trouver le clip d'animation (inchangé)
        const walkClipSource = THREE.AnimationClip.findByName(this.model.animations, 'walk') || this.model.animations[0];

        if (walkClipSource) {
            // --- NOUVEAU : Filtrer les pistes pour enlever le root motion ---
            console.log(`Agent ${this.id}: Analyse des pistes pour l'animation '${walkClipSource.name || '[0]'}'.`);
            const originalTracks = walkClipSource.tracks;
            const filteredTracks = [];

            // Identifiez le nom du nœud racine ou de l'os principal qui est déplacé.
            // Cela peut nécessiter d'inspecter `originalTracks` dans la console.
            // Exemples courants: "RootNode", "Hips", "mixamorigHips", ou le nom de l'objet racine lui-même.
            // Si vous ne savez pas, vous pouvez essayer de filtrer toutes les pistes '.position'.
            // const rootNodeName = "mixamorigHips"; // <-- METTEZ LE BON NOM ICI SI CONNU

            originalTracks.forEach(track => {
                 // console.log(` -> Piste trouvée: ${track.name}`); // Décommenter pour inspecter les noms
                // On veut garder toutes les pistes SAUF celles qui animent la POSITION de la racine.
                // Condition simple (peut être trop large) : ne pas inclure les pistes '.position'
                if (!track.name.endsWith('.position')) {
                     filteredTracks.push(track);
                }
                // Condition plus spécifique (si vous connaissez le nom du noeud racine/hanches):
                // if (!(track.name === rootNodeName + '.position')) {
                //     filteredTracks.push(track);
                // }
            });

			// Créer un nouveau clip SANS les pistes de position racine
            const modifiedClip = new THREE.AnimationClip(
                walkClipSource.name + "_NoRootPos", // Nouveau nom pour débogage
                walkClipSource.duration,
                filteredTracks // Utiliser les pistes filtrées
            );
            // --------------------------------------------------------

            // Utiliser le clip MODIFIÉ pour créer l'action
            this.walkAction = this.mixer.clipAction(modifiedClip);
            this.walkAction.setLoop(THREE.LoopRepeat);
            console.log(`Agent ${this.id}: Animation '${modifiedClip.name || '[0]'}' configurée comme walkAction (sans root motion position).`);

        } else {
            console.error(`Agent ${this.id}: Impossible de trouver une animation valide pour la marche.`);
        }

        // Optionnel: Configurer une animation 'idle' si elle existe
        // const idleClip = THREE.AnimationClip.findByName(this.model.animations, 'idle');
        // if (idleClip) {
        //     this.idleAction = this.mixer.clipAction(idleClip);
        //     this.idleAction.setLoop(THREE.LoopRepeat);
        //     this.idleAction.play(); // Jouer l'idle par défaut
        // }
    }

    setPath(pathPoints) {
        if (pathPoints && pathPoints.length > 0) {
            this.path = pathPoints;
            this.currentPathIndex = 0;

            // Assurer que le modèle est bien à la position Y du chemin
            this.model.position.y = this.path[0].y;

            if (this.path.length > 1) {
                // Orienter vers le premier waypoint (si chemin a plus d'un point)
                const nextPoint = this.path[1].clone();
                nextPoint.y = this.model.position.y; // Regarder à la même hauteur
                this.model.lookAt(nextPoint);

                // Démarrer l'animation de marche
                if (this.walkAction) {
                     // Optionnel : fade in
                     // if(this.idleAction && this.idleAction.isRunning()) this.idleAction.fadeOut(0.2);
                     // this.walkAction.reset().fadeIn(0.2).play();
                     this.walkAction.reset().play();
                }

            } else {
                 // Si chemin d'un seul point, juste s'y mettre ? Ou considérer terminé.
                 this.model.position.copy(this.path[0]);
                 this.path = null; // Chemin terminé
                 if (this.walkAction && this.walkAction.isRunning()) {
                     this.walkAction.fadeOut(0.5); // Fondu de sortie
                     // Optionnel: jouer l'idle
                     // if (this.idleAction) this.idleAction.reset().fadeIn(0.5).play();
                 }
            }
        } else {
            // Pas de chemin ou chemin terminé
            this.path = null;
            this.currentPathIndex = 0;
            // Arrêter l'animation de marche
             if (this.walkAction && this.walkAction.isRunning()) {
                 this.walkAction.fadeOut(0.5);
                  // Optionnel: jouer l'idle
                 // if (this.idleAction) this.idleAction.reset().fadeIn(0.5).play();
            }
        }
    }

    update(deltaTime) {
        // Mettre à jour l'animation mixer (delta en secondes)
        if (this.mixer) {
            this.mixer.update(deltaTime / 1000);
        }

        // Logique de déplacement (si un chemin est défini)
        if (!this.path || this.currentPathIndex >= this.path.length) {
            // Si l'animation de marche tourne encore sans raison, l'arrêter
             if (this.walkAction && this.walkAction.isRunning() && !this.path) {
                this.walkAction.fadeOut(0.5);
                 // if (this.idleAction) this.idleAction.reset().fadeIn(0.5).play();
            }
            return; // Pas de chemin ou chemin terminé
        }

        // --- Assurer que l'animation de marche joue ---
        if (this.walkAction && !this.walkAction.isRunning()) {
             this.walkAction.play(); // Relancer si arrêtée par erreur
        }
        // -------------------------------------------

        const targetPosition = this.path[this.currentPathIndex];
        const currentPosition = this.model.position;

        // Comparaison sur XZ pour la distance
        const distanceToTargetXZ = Math.sqrt(
            Math.pow(targetPosition.x - currentPosition.x, 2) +
            Math.pow(targetPosition.z - currentPosition.z, 2)
        );

        // Distance à parcourir ce frame
        const moveDistance = this.speed * (deltaTime / 1000);

        if (distanceToTargetXZ <= this.reachTolerance || distanceToTargetXZ < moveDistance) {
            // Atteint la cible : se positionner exactement et passer au point suivant
            currentPosition.copy(targetPosition); // Assure la position exacte (Y inclus)
            this.currentPathIndex++;

            if (this.currentPathIndex < this.path.length) {
                // Regarder vers le point suivant
                const nextPoint = this.path[this.currentPathIndex].clone();
                nextPoint.y = this.model.position.y; // Regarder à la même hauteur
                this.model.lookAt(nextPoint);
            } else {
                // Chemin terminé
                // console.log(`Agent ${this.id}: Chemin terminé !`);
                this.path = null; // Réinitialiser
                if (this.walkAction && this.walkAction.isRunning()) {
                    this.walkAction.fadeOut(0.5);
                    // if (this.idleAction) this.idleAction.reset().fadeIn(0.5).play();
                }
            }
        } else {
            // Se déplacer vers la cible
            const direction = targetPosition.clone().sub(currentPosition);
            direction.y = 0; // Mouvement uniquement sur XZ
            direction.normalize();
            this.model.position.addScaledVector(direction, moveDistance);

            // S'assurer que Y reste constant (hauteur du trottoir/chemin)
            // C'est important car addScaledVector peut introduire des erreurs flottantes
            this.model.position.y = targetPosition.y;

            // Réorienter si nécessaire (déjà fait lors du changement de point)
             // const lookTarget = targetPosition.clone();
             // lookTarget.y = this.model.position.y;
             // this.model.lookAt(lookTarget); // Peut causer des saccades si appelé à chaque frame
        }
    }

    destroy() {
        // Arrêter les animations
        if(this.mixer) {
            this.mixer.stopAllAction();
        }

        // Retirer le modèle de la scène
        if (this.model && this.model.parent) {
            this.scene.remove(this.model);
        }

        // Disposer géométrie/matériaux du modèle CLONÉ
        // C'est important car SkeletonUtils.clone crée de nouvelles géométries/matériaux
         if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                     if (Array.isArray(child.material)) {
                         child.material.forEach(material => material?.dispose());
                     } else {
                         child.material?.dispose();
                     }
                }
            });
        }

        // Nullifier les références
        this.model = null;
        this.scene = null;
        this.path = null;
        this.mixer = null;
        this.walkAction = null;
        this.idleAction = null;
        // console.log(`Agent ${this.id} détruit.`);
    }
}