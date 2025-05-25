import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export default class Renderer {
    constructor(experience) {
        this.experience = experience;
        this.canvas = this.experience.canvas;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;

        // Flag pour activer/désactiver la capture des statistiques détaillées
        this.enableDetailedStats = false;
        this.mainRenderStats = null;

        this.setInstance();
    }

    setInstance() {
		this.instance = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true, // Active l'anti-aliasing
			alpha: true      // Permet la transparence (si nécessaire)
		});
		// Paramétrage de base du renderer
		this.instance.physicallyCorrectLights = true;
		this.instance.outputEncoding = THREE.sRGBEncoding;
		this.instance.toneMapping = THREE.CineonToneMapping;
		this.instance.toneMappingExposure = 1.75;
		this.instance.shadowMap.enabled = true;
		this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
		this.instance.setSize(this.sizes.width, this.sizes.height);
		this.instance.setPixelRatio(this.sizes.pixelRatio);
		this.instance.setClearColor(0x1e1a20);
	
		// -------------------------------
		// Ajout de l'effet de post-traitement Bloom
		// -------------------------------
		// Création du composer associé au renderer
		this.composer = new EffectComposer(this.instance);
		// Rendu de la scène par défaut
		const renderPass = new RenderPass(this.scene, this.camera.instance);
		this.composer.addPass(renderPass);
		// Instanciation du UnrealBloomPass
		// Les paramètres sont les suivants :
		//   - Résolution (basée sur la taille actuelle)
		//   - strength: intensité du bloom (ici 1.5)
		//   - radius: taille du halo (ici 0.4)
		//   - threshold: seuil de luminosité pour déclencher l'effet (ici 0.85)
		this.unrealBloomPass = new UnrealBloomPass(
			new THREE.Vector2(this.sizes.width, this.sizes.height),
			1.5,   // strength
			0.4,   // radius
			0.85   // threshold
		);
		this.composer.addPass(this.unrealBloomPass);
	}	

    resize() {
		this.instance.setSize(this.sizes.width, this.sizes.height);
		this.instance.setPixelRatio(this.sizes.pixelRatio);
		if (this.composer) {
			this.composer.setSize(this.sizes.width, this.sizes.height);
		}
	}	

    update() {
		if (this.enableDetailedStats) {
			// Mode avec statistiques détaillées (double rendu)
			this.instance.info.reset();
			
			// Capturer les stats avant le post-processing
			// Faire un rendu direct pour compter les draw calls réels
			const oldAutoClear = this.instance.autoClear;
			this.instance.autoClear = false;
			this.instance.clear();
			
			// Hook pour capturer les statistiques par catégorie
			this.categoryStats = {
				buildings: { drawCalls: 0, triangles: 0 },
				trees: { drawCalls: 0, triangles: 0 },
				cityElements: { drawCalls: 0, triangles: 0 },
				environment: { drawCalls: 0, triangles: 0 },
				agents: { drawCalls: 0, triangles: 0 },
				vehicles: { drawCalls: 0, triangles: 0 }
			};
			
			// Intercepter les appels de rendu pour catégoriser
			const originalRender = this.instance.render;
			this.instance.render = (scene, camera) => {
				this._interceptRenderCalls(scene, camera, originalRender);
			};
			
			this.instance.render(this.scene, this.camera.instance);
			
			// Restaurer la méthode de rendu originale
			this.instance.render = originalRender;
			
			// Sauvegarder les statistiques du rendu principal
			this.mainRenderStats = {
				calls: this.instance.info.render.calls,
				triangles: this.instance.info.render.triangles,
				points: this.instance.info.render.points,
				lines: this.instance.info.render.lines
			};
			
			// Restaurer autoClear et faire le rendu avec post-processing
			this.instance.autoClear = oldAutoClear;
			this.composer.render();
		} else {
			// Mode performance (rendu simple)
			this.composer.render();
		}
	}

	/**
	 * Intercepte les appels de rendu pour catégoriser les statistiques
	 * @private
	 */
	_interceptRenderCalls(scene, camera, originalRender) {
		// Analyser la scène avant le rendu pour catégoriser les objets
		const beforeCalls = this.instance.info.render.calls;
		const beforeTriangles = this.instance.info.render.triangles;
		
		// Effectuer le rendu normal
		originalRender.call(this.instance, scene, camera);
		
		// Les statistiques globales sont maintenant à jour
		// Pour les catégories, on utilise une approche différente basée sur l'analyse des objets visibles
		this._analyzeVisibleObjects(scene, camera);
	}

	/**
	 * Analyse les objets visibles pour calculer les statistiques par catégorie
	 * @private
	 */
	_analyzeVisibleObjects(scene, camera) {
		// Réinitialiser les compteurs
		Object.keys(this.categoryStats).forEach(key => {
			this.categoryStats[key].drawCalls = 0;
			this.categoryStats[key].triangles = 0;
		});

		// Parcourir tous les objets visibles dans la scène
		scene.traverse((object) => {
			if (object.visible && object.isMesh) {
				const category = this._categorizeObject(object);
				if (category) {
					this.categoryStats[category].drawCalls++;
					
					// Calculer les triangles
					if (object instanceof THREE.InstancedMesh) {
						const trianglesPerInstance = this._getTriangleCount(object.geometry);
						this.categoryStats[category].triangles += trianglesPerInstance * object.count;
					} else {
						this.categoryStats[category].triangles += this._getTriangleCount(object.geometry);
					}
				}
			}
		});
	}

	/**
	 * Catégorise un objet selon son nom ou ses propriétés
	 * @private
	 */
	_categorizeObject(object) {
		const name = object.name.toLowerCase();
		
		// Bâtiments
		if (name.includes('house') || name.includes('building') || name.includes('skyscraper') || 
			name.includes('industrial') || name.includes('commercial') || name.includes('movietheater')) {
			return 'buildings';
		}
		
		// Arbres
		if (name.includes('tree') || name.includes('fir')) {
			return 'trees';
		}
		
		// Éléments de ville
		if (name.includes('crosswalk') || name.includes('lamppost') || name.includes('sidewalk') || 
			name.includes('road') || name.includes('park') || name.includes('ground') || 
			name.includes('grass') || name.includes('lamp')) {
			return 'cityElements';
		}
		
		// Agents
		if (name.includes('agent') || name.includes('citizen') || name.includes('torso') || name.includes('head')) {
			return 'agents';
		}
		
		// Véhicules
		if (name.includes('car') || name.includes('vehicle') || name.includes('wheel') || name.includes('body')) {
			return 'vehicles';
		}
		
		// Environnement (oiseaux, ciel, montagnes, etc.)
		if (name.includes('bird') || name.includes('sky') || name.includes('mountain') || 
			name.includes('cloud') || name.includes('moon') || name.includes('sun')) {
			return 'environment';
		}
		
		// Par défaut, considérer comme environnement
		return 'environment';
	}

	/**
	 * Calcule le nombre de triangles dans une géométrie
	 * @private
	 */
	_getTriangleCount(geometry) {
		if (!geometry) return 0;
		
		if (geometry.index) {
			return geometry.index.count / 3;
		} else {
			const positionAttribute = geometry.getAttribute('position');
			if (positionAttribute) {
				return positionAttribute.count / 3;
			}
		}
		
		return 0;
	}

	/**
	 * Active ou désactive la capture des statistiques détaillées
	 * @param {boolean} enabled - True pour activer, false pour désactiver
	 */
	setDetailedStatsEnabled(enabled) {
		this.enableDetailedStats = enabled;
		if (!enabled) {
			this.mainRenderStats = null;
		}
	}	
}