// src/World/CrosswalkInstancer.js
import * as THREE from 'three';

/**
 * @typedef {import('./InstanceDataManager.js').default} InstanceDataManager
 */

/**
 * Génère les données d'instance (matrices) pour les bandes des passages piétons.
 */
export default class CrosswalkInstancer {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale (contient les dimensions/espacement des bandes).
     * @param {object} materials - Matériaux partagés (non directement utilisé ici, mais pour cohérence).
     */
    constructor(config, materials) {
        this.config = config;
        this.materials = materials; // Non utilisé ici, mais conservé pour structure
        this.crosswalkStripeKey = 'default_crosswalk_stripe'; // Clé utilisée pour stocker les données
    }

    /**
     * Génère les matrices pour chaque bande de chaque passage piéton et les ajoute à l'InstanceDataManager.
     * @param {Array<object>} crosswalkInfos - Tableau d'objets contenant { position: THREE.Vector3, angle: number, length: number } pour chaque passage piéton.
     * @param {InstanceDataManager} instanceDataManager - Le gestionnaire où ajouter les données.
     */
    generateCrosswalkInstances(crosswalkInfos, instanceDataManager) {
        if (!crosswalkInfos || crosswalkInfos.length === 0) {
            // console.log("CrosswalkInstancer: No crosswalk info provided, skipping instance generation.");
            return;
        }

        // Récupérer les paramètres de configuration
        const stripeCount = this.config.crosswalkStripeCount ?? 5;
        const stripeWidth = this.config.crosswalkStripeWidth ?? 0.6;
        const stripeGap = this.config.crosswalkStripeGap ?? 0.5;
        const stripeHeight = this.config.crosswalkHeight ?? 0.03;
        const yOffset = 0.005; // Petit décalage vertical pour éviter z-fighting

        if (stripeWidth <= 0 || stripeHeight <= 0 || stripeCount <= 0) {
            console.warn("CrosswalkInstancer: Invalid crosswalk stripe configuration (width, height, or count <= 0). Skipping generation.");
            return;
        }

        console.log(`CrosswalkInstancer: Generating instance data for ${crosswalkInfos.length} crosswalks (${stripeCount} stripes each)...`);
        let stripesAdded = 0;

        // Pré-calculer les valeurs constantes
        const stripeTotalWidth = stripeWidth + stripeGap; // Largeur d'une bande + son espacement
        const totalCrosswalkVisualWidth = (stripeCount * stripeWidth) + Math.max(0, stripeCount - 1) * stripeGap;
        // Offset pour centrer la première bande sur la position de départ (info.position)
        // puis centrer l'ensemble du passage piéton
        const initialOffset = -totalCrosswalkVisualWidth / 2 + stripeWidth / 2;

        // Objets THREE réutilisables pour la performance
        const matrix = new THREE.Matrix4();
        const basePosition = new THREE.Vector3();
        const stripePosition = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const offsetDirection = new THREE.Vector3(); // Direction perpendiculaire au passage piéton
        const yAxis = new THREE.Vector3(0, 1, 0); // Axe de rotation

        crosswalkInfos.forEach(info => {
            if (!info || !info.position || info.angle === undefined || info.length === undefined) {
                console.warn("CrosswalkInstancer: Invalid crosswalk info object skipped:", info);
                return;
            }

            basePosition.copy(info.position); // Position centrale du passage piéton

            // Déterminer l'orientation et la direction de décalage des bandes
            // L'angle dans crosswalkInfo est l'angle de la *route* (0 pour Horizontale, PI/2 pour Verticale)
            // Les bandes sont *perpendiculaires* à la route.
            // Donc, angle = 0 (route H) => bandes Verticales (rotation PI/2) => offset en X
            // angle = PI/2 (route V) => bandes Horizontales (rotation 0) => offset en Z

            let finalAngle; // Rotation appliquée aux bandes elles-mêmes
            if (Math.abs(info.angle) < 0.1) { // Route Horizontale (angle=0 ou PI)
                finalAngle = Math.PI / 2;     // Bandes verticales
                offsetDirection.set(1, 0, 0); // Décalage le long de X
            } else {                          // Route Verticale (angle=PI/2 ou -PI/2)
                finalAngle = 0;               // Bandes horizontales
                offsetDirection.set(0, 0, 1); // Décalage le long de Z
            }

            quaternion.setFromAxisAngle(yAxis, finalAngle);

            // Définir l'échelle : X et Y sont 1 (car la géométrie de base a la bonne largeur/hauteur), Z est la longueur
            // Note: On suppose que InstancedMeshManager utilise une géométrie de base de (width, height, 1.0)
             scale.set(1, 1, info.length);

            // Créer les matrices pour chaque bande
            for (let i = 0; i < stripeCount; i++) {
                const currentOffset = initialOffset + i * stripeTotalWidth;

                // Calculer la position de la bande
                stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset);
                // Ajuster la hauteur Y
                stripePosition.y = stripeHeight / 2 + yOffset;

                // Composer la matrice finale
                matrix.compose(stripePosition, quaternion, scale);

                // Ajouter les données d'instance
                instanceDataManager.addData('crosswalk', this.crosswalkStripeKey, matrix);
                stripesAdded++;
            }
        }); // Fin boucle crosswalkInfos

        console.log(`CrosswalkInstancer: ${stripesAdded} crosswalk stripe instances added to data.`);
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}