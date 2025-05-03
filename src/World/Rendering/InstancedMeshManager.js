// src/World/InstancedMeshManager.js
import * as THREE from 'three';

/**
 * @typedef {import('../CityAssetLoader.js').default} CityAssetLoader
 * @typedef {import('../Buildings/HouseRenderer.js').default} HouseRenderer
 * @typedef {import('../Buildings/BuildingRenderer.js').default} BuildingRenderer
 * @typedef {import('../Buildings/SkyscraperRenderer.js').default} SkyscraperRenderer
 * @typedef {import('../../Experience.js').default} Experience
 */

/**
 * Crée et gère les objets THREE.InstancedMesh à partir des données d'instance collectées.
 * Gère également la mise à jour des éléments spécifiques comme les fenêtres.
 */
export default class InstancedMeshManager {
    /**
     * Constructeur.
     * @param {object} config - Configuration globale.
     * @param {object} materials - Collection de matériaux partagés (ex: crosswalkMaterial).
     * @param {CityAssetLoader} assetLoader - Pour accéder aux données des assets chargés.
     * @param {object} specificRenderers - Contient les instances des renderers spécialisés { houseRenderer, buildingRenderer, skyscraperRenderer }.
     * @param {THREE.Group} parentGroup - Le groupe de scène auquel ajouter les InstancedMesh créés.
     * @param {Experience} experience - Référence à l'instance Experience (pour envMap, etc.).
     */
    constructor(config, materials, assetLoader, specificRenderers, parentGroup, experience) {
        this.config = config;
        this.materials = materials;
        this.assetLoader = assetLoader;
        this.renderers = specificRenderers; // { houseRenderer, buildingRenderer, skyscraperRenderer }
        this.parentGroup = parentGroup;
        this.experience = experience;

        /** @type {Object.<string, THREE.InstancedMesh>} */
        this.instancedMeshes = {}; // Stocke les meshes créés, clé = type_idOrKey
        /** @type {Array<THREE.InstancedMesh>} */
        this.windowMeshes = []; // Références spécifiques aux meshes de fenêtres pour l'update

        // Géométrie de base pour les passages piétons (si applicable)
        this.stripeBaseGeometry = null;
        if (this.config.crosswalkStripeWidth > 0 && this.config.crosswalkHeight > 0) {
            // Utiliser une profondeur arbitraire (ex: 1.0) car elle sera mise à l'échelle par la matrice
            this.stripeBaseGeometry = new THREE.BoxGeometry(
                this.config.crosswalkStripeWidth,
                this.config.crosswalkHeight,
                1.0 // Profondeur de base, sera écrasée par la matrice
            );
        }

        console.log("InstancedMeshManager initialized.");
    }

    /**
     * Crée tous les InstancedMesh basés sur les données fournies.
     * @param {Object.<string, Object.<string, Array<THREE.Matrix4>>>} instanceData - Données provenant de InstanceDataManager.
     */
    createMeshes(instanceData) {
        console.log("InstancedMeshManager: Creating InstancedMeshes...");
        this.reset(); // Nettoyer les anciens meshes avant d'en créer de nouveaux

        let totalMeshesCreated = 0;
        let totalInstancesCreated = 0;

        for (const type in instanceData) {
            if (!instanceData.hasOwnProperty(type)) continue;

            for (const idOrKey in instanceData[type]) {
                if (!instanceData[type].hasOwnProperty(idOrKey)) continue;

                const matrices = instanceData[type][idOrKey];
                if (!matrices || matrices.length === 0) {
                    continue; // Pas d'instances pour cette clé
                }

                let geometry = null;
                let material = null;
                let castShadow = true;
                let receiveShadow = true;
                let isWindow = false;
                const meshKey = `${type}_${idOrKey}`; // Clé unique pour stocker le mesh

                try {
                    // --- Déterminer Géométrie et Matériau ---
                    switch (type) {
                        case 'house': {
							const partName = idOrKey; // Pour 'house', idOrKey est le partName
							geometry = this.renderers.houseRenderer?.baseHouseGeometries[partName];
							// const baseMaterial = this.renderers.houseRenderer?.baseHouseMaterials[partName]; // <-- On enlève ça d'ici
	
							// --- MODIFICATION ---
							// Vérifier seulement la géométrie ici. Le matériau sera géré plus bas.
							if (!geometry) {
								console.warn(`[IMM] Missing geometry for house part: ${partName}`);
								continue; // Passer à la clé suivante si la géométrie manque
							}
							// --- FIN MODIFICATION ---
	
							isWindow = (partName === 'windowXY' || partName === 'windowYZ');
							if (isWindow) {
								// Cloner et configurer le matériau fenêtre
								// Vérifier que le matériau de base 'window' existe
								const baseWindowMaterial = this.renderers.houseRenderer?.baseHouseMaterials?.window;
								if (!baseWindowMaterial) {
									console.warn(`[IMM] Base window material not found in HouseRenderer.`);
									continue; // Impossible de créer le matériau fenêtre
								}
								material = baseWindowMaterial.clone(); // Cloner depuis le matériau 'window'
								material.name = `Inst_HouseWindow_${partName}`; // Nom unique
								material.emissive = new THREE.Color(0xFFFF99);
								material.emissiveIntensity = 0.0;
								if (this.experience?.scene?.environment) {
									material.envMap = this.experience.scene.environment;
									material.roughness = 0.05;
									material.metalness = 0.9;
									// Pas besoin de material.needsUpdate = true ici, sera fait si l'intensité change
								}
								receiveShadow = false;
							} else {
								// Pour les autres parties (murs, toit, porte...), récupérer leur matériau spécifique
								material = this.renderers.houseRenderer?.baseHouseMaterials[partName];
								if (!material) {
									// Si le matériau spécifique manque pour une partie non-fenêtre, on logue et on saute.
									console.warn(`[IMM] Missing material for non-window house part: ${partName}`);
									continue;
								}
								// Pour les parties non-fenêtres, receiveShadow reste true (valeur par défaut)
							}
							// La création de l'InstancedMesh se fera après le 'break' avec le bon 'material'
							break; // Important de sortir du switch ici
						} // Fin case 'house'
                        case 'building':
                        case 'skyscraper': {
                             // Clé est assetId_partName (ex: 'building_proc_0_part0')
                             const parts = idOrKey.split('_');
                             const partName = parts.pop(); // 'part0'
                             const assetId = parts.join('_'); // 'building_proc_0'

                             const assetData = this.assetLoader.getAssetDataById(assetId);
                             if (!assetData || !assetData.parts || assetData.parts.length === 0) {
                                console.warn(`[IMM] Asset data or parts not found for ${type} ID: ${assetId}`);
                                continue;
                             }

                             // Trouver la partie correspondante (par nom ou index)
                             let partIndex = -1;
                             if (partName.startsWith('part')) {
                                 partIndex = parseInt(partName.substring(4), 10);
                             }
                             // Alternative: rechercher par nom si les parties ont des noms spécifiques

                             const part = (partIndex !== -1 && assetData.parts[partIndex]) ? assetData.parts[partIndex] : null;

                             if (!part || !part.geometry || !part.material) {
                                 console.warn(`[IMM] Invalid part data for ${type} asset ${assetId}, part key: ${partName}`);
                                 continue;
                             }

                             geometry = part.geometry;
                             material = part.material; // Utiliser le matériau de la partie directement

                             // Vérifier si c'est une fenêtre (basé sur le nom standardisé)
                             isWindow = (material.name === "BuildingWindowMat" || material.name === "SkyscraperWindowMat_Standard");
                             if (isWindow) {
                                 receiveShadow = false;
                                 // L'intensité émissive sera gérée dans updateWindows
                                 // Assurer que le matériau est prêt pour l'émissivité
                                 if (!material.emissive) material.emissive = new THREE.Color(0xfcffe0);
                             }
                             break;
                        }
                        case 'industrial':
                        case 'park':
                        case 'tree': {
                            const assetId = idOrKey; // Pour standard, idOrKey est l'assetId
                            const assetData = this.assetLoader.getAssetDataById(assetId);
                            if (!assetData) {
                                console.warn(`[IMM] Asset data not found for ${type} ID: ${assetId}`);
                                continue;
                            }

                            // Si l'asset a des parts, on doit gérer chaque partie séparément
                            if (assetData.parts && assetData.parts.length > 0) {
                                // Pour chaque partie, créer un InstancedMesh
                                assetData.parts.forEach((part, index) => {
                                    if (!part.geometry || !part.material) {
                                        console.warn(`[IMM] Invalid part data for ${type} asset ${assetId}, part index: ${index}`);
                                        return;
                                    }

                                    const count = matrices.length;
                                    const instancedMesh = new THREE.InstancedMesh(part.geometry, part.material, count);
                                    instancedMesh.castShadow = castShadow;
                                    instancedMesh.receiveShadow = receiveShadow;
                                    instancedMesh.name = `${meshKey}_part${index}`;

                                    matrices.forEach((matrix, index) => {
                                        instancedMesh.setMatrixAt(index, matrix);
                                    });
                                    instancedMesh.instanceMatrix.needsUpdate = true;

                                    this.parentGroup.add(instancedMesh);
                                    this.instancedMeshes[`${meshKey}_part${index}`] = instancedMesh;
                                    totalMeshesCreated++;
                                    totalInstancesCreated += count;
                                });
                                continue;
                            }

                            // Si l'asset n'a pas de parts, on le traite comme avant
                            if (!assetData.geometry || !assetData.material) {
                                console.warn(`[IMM] Asset data invalid for ${type} ID: ${assetId}`);
                                continue;
                            }
                            geometry = assetData.geometry;
                            material = assetData.material; // Utiliser le matériau de l'asset directement
                            break;
                        }
                        case 'crosswalk': {
							// Pour les passages piétons, idOrKey est généralement 'default_crosswalk_stripe'
							// Utiliser la géométrie et le matériau prédéfinis pour les bandes
							if (!this.stripeBaseGeometry || !this.materials.crosswalkMaterial) {
								console.warn(`[IMM] Crosswalk geometry or material not available.`);
								continue; // Passer à la clé suivante si les prérequis manquent
							}
							geometry = this.stripeBaseGeometry;
							material = this.materials.crosswalkMaterial;
							castShadow = false; // Les passages piétons ne projettent pas d'ombre
							receiveShadow = true; // Ils reçoivent les ombres
							isWindow = false; // Ce ne sont pas des fenêtres
							break; // Sortir du switch après avoir défini geom/mat/shadows
					    }
                        default:
                            console.warn(`[IMM] Unhandled asset type for instancing: ${type}`);
                            continue;
                    } // Fin switch(type)

                    // --- Création de l'InstancedMesh ---
                    if (geometry && material) {
						// ... (le reste du code qui crée l'InstancedMesh reste identique)
						const count = matrices.length;
						const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
						instancedMesh.castShadow = castShadow;
						instancedMesh.receiveShadow = receiveShadow;
						instancedMesh.name = meshKey; // Nom unique
	
						matrices.forEach((matrix, index) => {
							instancedMesh.setMatrixAt(index, matrix);
						});
						instancedMesh.instanceMatrix.needsUpdate = true;
	
						this.parentGroup.add(instancedMesh);
						this.instancedMeshes[meshKey] = instancedMesh;
						totalMeshesCreated++;
						totalInstancesCreated += count;
	
						// Ajouter aux fenêtres si applicable (ne s'appliquera pas aux crosswalks)
						if (isWindow) {
							this.windowMeshes.push(instancedMesh);
						}
					} else {
						 // Log déjà existant si geom/mat sont manquants après le switch
						 console.warn(`[IMM] Skipped mesh creation for ${meshKey} due to missing geometry or material after switch.`);
					}

                } catch (error) {
                     console.error(`[IMM] Error processing instance data for type '${type}', key '${idOrKey}':`, error);
                }

            } // Fin boucle idOrKey
        } // Fin boucle type

        if (totalMeshesCreated > 0) {
            console.log(`InstancedMeshManager: ${totalMeshesCreated} InstancedMesh(es) created (${totalInstancesCreated} total instances). ${this.windowMeshes.length} window mesh(es) tracked.`);
        } else {
            console.log("InstancedMeshManager: No InstancedMesh created.");
        }
    }

    /**
     * Met à jour l'apparence des fenêtres en fonction de l'heure.
     * @param {number} currentHour - L'heure actuelle (0-23).
     */
    updateWindows(currentHour) {
        if (this.windowMeshes.length === 0) return;

        // Les lumières sont allumées entre 18h inclus et 6h exclus
        const lightsOn = (currentHour >= 18 || currentHour < 6);

        this.windowMeshes.forEach(mesh => {
            // Le matériau peut être un tableau si l'objet d'origine en avait plusieurs,
            // mais pour les InstancedMesh, c'est généralement un seul matériau.
            if (!mesh.material || typeof mesh.material.dispose !== 'function') return;

            const material = mesh.material;
            let needsMaterialUpdate = false;

            // Identifier le type de fenêtre basé sur le nom du matériau (convention établie)
            const isSkyscraperWindow = material.name === "SkyscraperWindowMat_Standard";
            const isHouseWindow = material.name.startsWith("Inst_HouseWindow_");
            const isBuildingWindow = material.name === "BuildingWindowMat";

            let targetIntensity = 0.0; // Intensité émissive (0 = éteint)

            if (isSkyscraperWindow) {
                targetIntensity = lightsOn ? 1.17 : 0.0; // Valeur spécifique gratte-ciel
                // Logique additionnelle spécifique (ex: transmission, roughness)
                const targetTransmission = lightsOn ? 0.0 : 0.0; // Exemple
                const targetRoughness = lightsOn ? 0.8 : 0.1; // Exemple
                if (material.transmission !== targetTransmission) {
                    material.transmission = targetTransmission;
                    needsMaterialUpdate = true;
                }
                if (material.roughness !== targetRoughness) {
                    material.roughness = targetRoughness;
                    needsMaterialUpdate = true;
                }
            } else if (isHouseWindow) {
                targetIntensity = lightsOn ? 1.23 : 0.0; // Valeur spécifique maison
            } else if (isBuildingWindow) {
                targetIntensity = lightsOn ? 0.88 : 0.0; // Valeur spécifique immeuble
            } else {
                // Fenêtre non reconnue ou type non géré
                return;
            }

            // Appliquer l'intensité émissive si elle a changé
            if (material.emissiveIntensity !== targetIntensity) {
                material.emissiveIntensity = targetIntensity;
                 needsMaterialUpdate = true; // Indiquer que le matériau doit être mis à jour si l'intensité change
            }

            // Marquer le matériau pour mise à jour si nécessaire
            // Note: même si seul emissiveIntensity change, needsUpdate=true est souvent requis.
            if (needsMaterialUpdate) {
                material.needsUpdate = true;
            }
        });
    }

    /**
     * Nettoie les InstancedMesh créés et réinitialise l'état interne.
     */
    reset() {
        // Nettoyer les meshes de fenêtres (références)
        this.windowMeshes = [];

        // Nettoyer les InstancedMesh du parentGroup
        Object.keys(this.instancedMeshes).forEach(key => {
            const mesh = this.instancedMeshes[key];
            if (mesh) {
                // Retirer de la scène
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                }
                // Nettoyer la géométrie ? NON, elle est partagée (vient de AssetLoader ou Renderer)
                // mesh.geometry?.dispose();

                // Nettoyer le matériau ? SEULEMENT s'il a été CLONE (ex: fenêtres)
                if (mesh.material && mesh.material.name.startsWith('Inst_HouseWindow_')) {
                    mesh.material.dispose();
                }
                // Pour les autres matériaux (procéduraux partagés, assets standards),
                // leur nettoyage est géré par AssetLoader ou les Renderers.
            }
        });

        // Réinitialiser le conteneur
        this.instancedMeshes = {};

        // Nettoyer la géométrie de base des passages piétons si elle existe
        if (this.stripeBaseGeometry) {
             this.stripeBaseGeometry.dispose();
             this.stripeBaseGeometry = null;
             // Recréer si nécessaire (ou passer en argument lors de la création)
             if (this.config.crosswalkStripeWidth > 0 && this.config.crosswalkHeight > 0) {
                 this.stripeBaseGeometry = new THREE.BoxGeometry(
                     this.config.crosswalkStripeWidth,
                     this.config.crosswalkHeight,
                     1.0
                 );
             }
        }

        // console.log("InstancedMeshManager reset complete.");
    }

    /**
     * Méthode de destruction complète (appelée lorsque le World est détruit).
     */
    destroy() {
        console.log("Destroying InstancedMeshManager...");
        this.reset(); // Effectue le nettoyage principal
        // Libérer les références
        this.config = null;
        this.materials = null;
        this.assetLoader = null;
        this.renderers = null;
        this.parentGroup = null;
        this.experience = null;
        if (this.stripeBaseGeometry) { // Double vérification
             this.stripeBaseGeometry.dispose();
             this.stripeBaseGeometry = null;
        }
        console.log("InstancedMeshManager destroyed.");
    }
}