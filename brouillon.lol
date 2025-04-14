Etant donné que les lumières comme les SpotLight sont très couteuses et que je veux donner l'impression que les lampadaires sont allumés (en plus de la propriété émissive de l'ampoule), je cherche un compromis non couteux mais qui donne l'effet recherché au lampadaires.


Que suggères-tu ?

Absolument ! Utiliser des SpotLight pour chaque lampadaire dans une scène potentiellement grande serait en effet très coûteux en termes de performances. Voici plusieurs approches pour simuler l'effet d'éclairage des lampadaires de manière plus économique, en complément de l'émissivité de l'ampoule que vous avez déjà mise en place (lampPostMeshes.light dans CityManager.js) :

Options Principales (Compromis Performance/Visuel) :

    Sprites/Billboards Lumineux (Très Économique) :
        Concept : Créer une petite texture représentant un halo lumineux (par exemple, un dégradé radial doux allant du blanc/jaune vers le transparent). Appliquer cette texture à des PlaneGeometry configurés pour toujours faire face à la caméra (comportement "Billboard") ou simplement utiliser des Points avec une texture.
        Implémentation :
            Créer une texture de halo (peut être générée par code ou chargée).
            Créer un InstancedMesh supplémentaire dans CityManager.js (comme vous l'avez fait pour les lampadaires) en utilisant une PlaneGeometry comme base.
            Utiliser un MeshBasicMaterial pour ces plans :
                map: Votre texture de halo.
                transparent: true.
                blending: THREE.AdditiveBlending (Important pour un effet lumineux additif réaliste, où les halos se superposent bien).
                depthWrite: false (Généralement recommandé pour les effets transparents additifs afin d'éviter les problèmes de tri de profondeur).
            Dans la boucle où vous positionnez les lampadaires (createLampPostInstancedMeshes), positionnez également une instance de ce halo légèrement en dessous de l'ampoule (lightGeometry). La matrice de transformation de l'instance du halo n'aura pas besoin de la rotation du lampadaire si la texture est radiale, juste la position et une échelle pour la taille du halo.
            Contrôle jour/nuit : Dans CityManager.updateLampPostLights, basculez simplement la propriété visible de l'ensemble de l'InstancedMesh des halos (this.lampHaloInstancedMesh.visible = lightsOn;). C'est très performant.
        Avantages : Très léger en performances, surtout avec InstancedMesh. Contrôle fin de l'apparence via la texture.
        Inconvénients : Effet 2D (peut être visible sous certains angles si non billboard), nécessite une texture. Le comportement "Billboard" parfait peut nécessiter une logique de rotation par instance ou des shaders personnalisés si on n'utilise pas THREE.Sprite (qui ne s'instancie pas aussi facilement).

    Post-Processing (Bloom) :
        Concept : Utiliser un effet de post-traitement qui fait "baver" la lumière des zones très lumineuses de l'image rendue. Puisque vos ampoules ont déjà un matériau émissif (emissiveIntensity est ajustée dans updateLampPostLights), le bloom les affectera naturellement la nuit.
        Implémentation :
            Utiliser EffectComposer et UnrealBloomPass de Three.js.
            Modifier Renderer.js : Instancier EffectComposer, ajouter un RenderPass (le rendu normal de la scène) et un UnrealBloomPass.
            Dans la méthode update du Renderer, appeler composer.render() au lieu de renderer.render(scene, camera).
            Ajuster les paramètres de UnrealBloomPass : threshold (seuil de luminosité pour déclencher le bloom), strength (intensité), radius (taille du halo).
        Avantages : Relativement simple à mettre en place. Affecte toutes les sources lumineuses (émissives) de manière cohérente. L'effet s'active/désactive naturellement avec l'emissiveIntensity de vos ampoules. Peut donner un très bon rendu global.
        Inconvénients : Affecte toute la scène (peut faire baver des éléments non désirés si trop lumineux). A un coût de performance propre (mais souvent inférieur à de nombreuses lumières dynamiques). Moins de contrôle spécifique sur chaque lampadaire individuellement.

    Géométrie Simple Supplémentaire (Halo Solide) :
        Concept : Ajouter une autre géométrie très simple (ex: une sphère basse résolution) autour de l'ampoule dans votre InstancedMesh. Cette géométrie aurait un matériau basique, transparent et coloré pour simuler le halo.
        Implémentation :
            Dans CityManager.buildLampPostGeometries, créer une géométrie supplémentaire (ex: new THREE.SphereGeometry(1.5, 8, 6)).
            Créer un matériau dédié (ex: new THREE.MeshBasicMaterial({ color: 0xFFFFaa, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })).
            Créer un autre InstancedMesh spécifiquement pour ces halos.
            Positionner et mettre à l'échelle les instances de halo autour des ampoules, comme pour l'option 1.
            Contrôle jour/nuit : Comme pour l'option 1, basculer la visibilité de l'InstancedMesh des halos ou ajuster l'opacity du matériau (moins performant si fait chaque frame).
        Avantages : Potentiellement le plus léger si la géométrie est très simple et intégrée via InstancedMesh. Pas besoin de textures.
        Inconvénients : Peut paraître moins "doux" ou "gazeux" qu'un sprite ou le bloom. La transparence peut toujours poser des soucis de rendu selon la scène.

Recommandation :

    Commencez par le Bloom (Option 2) : C'est souvent le plus rapide à tester et donne un bon aperçu de l'effet global. Si les performances sont bonnes et que l'effet sur toute la scène vous convient, c'est une excellente solution.
    Si le Bloom est trop coûteux ou affecte trop d'éléments : Essayez l'Option 1 (Sprites/Billboards). Elle offre un bon contrôle visuel avec d'excellentes performances grâce à InstancedMesh. Assurez-vous d'utiliser AdditiveBlending et depthWrite: false.
    L'Option 3 (Géométrie Halo) est une alternative si vous voulez éviter les textures et le post-processing, mais l'aspect visuel peut être plus difficile à rendre satisfaisant.

N'oubliez pas d'ajuster l'intensité/visibilité de ces effets dans votre fonction CityManager.updateLampPostLights en fonction de currentHour pour qu'ils n'apparaissent que la nuit, en synchronisation avec l'emissiveIntensity de vos ampoules.