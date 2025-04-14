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
		// Au lieu de :
		// this.instance.render(this.scene, this.camera.instance);
		// Nous appelons :
		this.composer.render();
	}	
}