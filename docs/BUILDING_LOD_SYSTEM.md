# Système LOD (Level of Detail) pour les Bâtiments

## Vue d'ensemble

Le système LOD optimise automatiquement les performances en ajustant le niveau de détail des bâtiments selon leur distance à la caméra. Plus un bâtiment est éloigné, moins il nécessite de détails, permettant d'économiser des ressources de rendu.

## Fonctionnalités

### Niveaux de Détail

1. **HIGH (Haute qualité)** - Distance < 50m
   - Modèle complet avec tous les détails
   - Textures et matériaux originaux
   - Toutes les parties visibles

2. **MEDIUM (Qualité moyenne)** - Distance 50-150m
   - Modèle légèrement simplifié
   - Maintient la plupart des détails visuels

3. **LOW (Basse qualité)** - Distance 150-300m
   - Cubes colorés simples
   - Couleurs spécifiques par type de bâtiment :
     - 🏠 Maisons : Vert sage (#8fbc8f)
     - 🏢 Immeubles : Gris bleu (#708090)
     - 🏗️ Gratte-ciels : Gris foncé (#696969)
     - 🏭 Industriels : Brun (#cd853f)
     - 🏪 Commerciaux : Violet (#9370db)

4. **CULLED (Masqué)** - Distance > 300m
   - Complètement invisible
   - Aucune ressource utilisée

### Interface Utilisateur

- **Raccourci** : `Ctrl + L` pour afficher/masquer l'interface de contrôle
- **Statistiques en temps réel** :
  - Nombre total de bâtiments
  - Répartition par niveau de détail
  - Pourcentage d'optimisation
- **Contrôles de distance** : Ajustement en temps réel des seuils de transition

## Configuration

### Paramètres par défaut dans CityManager

```javascript
// Distances de transition LOD (en unités Three.js)
lodHighDetailDistance: 50,    // Distance pour le détail max
lodMediumDetailDistance: 150, // Distance pour le détail moyen  
lodLowDetailDistance: 300,    // Distance pour le détail bas
lodCullDistance: 500,         // Distance de culling complet
lodUpdateInterval: 100        // Fréquence de mise à jour (ms)
```

### Personnalisation des couleurs

Les couleurs des cubes LOD peuvent être modifiées dans `BuildingLODManager.js` :

```javascript
lodColors: {
    house: 0x8fbc8f,      // Vert maison
    building: 0x708090,   // Gris bleu immeuble
    skyscraper: 0x696969, // Gris foncé gratte-ciel
    industrial: 0xcd853f, // Brun industriel
    commercial: 0x9370db, // Violet commercial
    default: 0xcccccc     // Gris par défaut
}
```

## Intégration

### Automatique
Le système s'intègre automatiquement dans la génération de ville :
1. Les bâtiments sont enregistrés automatiquement lors de leur création
2. Le système se met à jour à chaque frame
3. Les transitions se font en douceur selon la position de la caméra

### Manuel
Pour contrôler manuellement le système :

```javascript
// Obtenir les statistiques
const stats = experience.world.cityManager.getLODStats();

// Modifier les distances
experience.world.cityManager.setLODDistances({
    highDetailDistance: 75,
    mediumDetailDistance: 200
});
```

## Performance

### Bénéfices attendus
- **Réduction du nombre de draw calls** pour les bâtiments éloignés
- **Économie de mémoire GPU** avec des géométries simplifiées
- **Amélioration du framerate** surtout avec beaucoup de bâtiments
- **Meilleure scalabilité** pour des villes plus grandes

### Overhead
- **Calcul de distance** : Optimisé avec cache et limitation de fréquence
- **Mémoire supplémentaire** : Cubes LOD légers (géométries partagées)
- **Gestion des transitions** : Minimale, basée sur la visibilité

## Fichiers du Système

- `src/World/Rendering/BuildingLODManager.js` - Gestionnaire principal
- `src/UI/BuildingLODControlUI.js` - Interface utilisateur
- `src/World/City/PlotContentGenerator.js` - Intégration dans la génération
- `src/World/City/CityManager.js` - Configuration et API

## Dépannage

### Problèmes courants

1. **Bâtiments qui disparaissent** : Vérifier les distances de culling
2. **Performance dégradée** : Réduire la fréquence de mise à jour
3. **Couleurs incorrectes** : Vérifier le mapping des types de bâtiments

### Debug

Utiliser l'interface de contrôle (`Ctrl + L`) pour :
- Surveiller la répartition des niveaux de détail
- Ajuster les distances en temps réel
- Vérifier le pourcentage d'optimisation

## Extensions Futures

- **LOD pour la végétation** : Arbres et herbe
- **LOD adaptatif** : Ajustement automatique selon les performances
- **LOD par qualité graphique** : Presets utilisateur
- **Occlusion culling** : Masquer les bâtiments cachés