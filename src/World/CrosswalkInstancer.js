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
		
			// *** Utiliser EXACTEMENT la logique de l'ancienne version ***
			const finalAngle = info.angle + Math.PI / 2; // Angle de la bande
			quaternion.setFromAxisAngle(yAxis, finalAngle);
		
			// Déterminer offsetDirection basé sur finalAngle (comme avant)
			if (Math.abs(finalAngle % Math.PI) < 0.01) { // Bandes horizontales (rotation 0 ou PI)
				offsetDirection.set(1, 0, 0); // Décalage le long de X
			} else { // Bandes verticales (rotation PI/2 ou -PI/2)
				offsetDirection.set(0, 0, 1); // Décalage le long de Z
			}
		
			// L'échelle reste basée sur la longueur de la bande (info.length)
			// en supposant que la géométrie de base a une longueur de 1.
			scale.set(1, 1, info.length);
		
			// Calculer les positions des bandes (logique des offsets inchangée)
			for (let i = 0; i < stripeCount; i++) {
				const currentOffset = initialOffset + i * stripeTotalWidth;
		
				// Calculer la position de la bande
				stripePosition.copy(basePosition).addScaledVector(offsetDirection, currentOffset);
				// Ajuster la hauteur Y
				stripePosition.y = stripeHeight / 2 + yOffset;
		
				// Composer la matrice finale
				matrix.compose(stripePosition, quaternion, scale); // Utilise stripePosition, la rotation (quaternion) et l'échelle
		
				// Ajouter les données d'instance
				instanceDataManager.addData('crosswalk', this.crosswalkStripeKey, matrix);
				stripesAdded++;
			}
		}); // Fin boucle crosswalkInfos corrigée

        console.log(`CrosswalkInstancer: ${stripesAdded} crosswalk stripe instances added to data.`);
    }

    /**
     * Méthode de réinitialisation (généralement vide pour un générateur stateless).
     */
    reset() {
        // Rien à réinitialiser ici pour l'instant
    }
}