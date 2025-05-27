# Système LOD (Level of Detail) des Bâtiments

## Vue d'ensemble

Le système LOD des bâtiments a été implémenté pour améliorer drastiquement les performances de rendu en réduisant le nombre de draw calls lorsque la caméra est éloignée des bâtiments.

## Fonctionnement

### Principe
- **Haute qualité** : Modèles détaillés avec textures, fenêtres, etc. (utilisés quand la caméra est proche)
- **Basse qualité (LOD)** : Cubes colorés simples (utilisés quand la caméra est éloignée)

### Types de bâtiments supportés
Le système gère 9 types de bâtiments, chacun avec sa couleur distinctive :

1. **house** - Beige/Tan (#D2B48C) - Maisons résidentielles
2. **building** - Gris ardoise (#708090) - Immeubles modernes  
3. **skyscraper** - Gris foncé (#2F4F4F) - Gratte-ciels
4. **industrial** - Brun (#8B4513) - Bâtiments industriels
5. **commercial** - Bleu royal (#4169E1) - Bâtiments commerciaux
6. **movietheater** - Rouge foncé (#8B0000) - Cinémas
7. **newhouse** - Blé (#F5DEB3) - Nouvelles maisons
8. **newbuilding** - Gris foncé (#696969) - Nouveaux immeubles
9. **newskyscraper** - Bleu nuit (#191970) - Nouveaux gratte-ciels

### Configuration

#### Paramètres par défaut
- **Distance LOD** : 100 unités de monde
- **LOD activé** : Oui
- **Mise à jour** : Chaque frame

#### Configuration dans CityManager
```javascript
const config = {
    buildingLodDistance: 100, // Distance à laquelle activer le LOD
    // ... autres paramètres
};
```

## Interface utilisateur

### Panneau de contrôle
Le système LOD peut être contrôlé via l'interface RenderStatsUI :

1. **Checkbox "Activer LOD Bâtiments"** - Active/désactive le système
2. **Slider "Distance LOD"** - Ajuste la distance de basculement (50-300 unités)

### Raccourcis clavier
- **Ctrl+R** : Basculer l'affichage des statistiques de rendu

## API de contrôle

### Méthodes principales

#### InstancedMeshManager
```javascript
// Activer/désactiver le LOD
instancedMeshManager.setBuildingLOD(true/false);

// Définir la distance LOD
instancedMeshManager.setBuildingLODDistance(150);

// Forcer la mise à jour de la visibilité
instancedMeshManager.updateLODVisibility();
```

#### BuildingLODRenderer
```javascript
// Créer les géométries LOD
const lodGeometries = buildingLODRenderer.createAllLODGeometries();

// Obtenir la couleur d'un type
const color = buildingLODRenderer.getBuildingColor('house');
```

## Commandes de test

Des commandes de test sont disponibles dans la console du navigateur :

```javascript
// Afficher l'aide
buildingLODTest.help();

// Activer le LOD
buildingLODTest.setLOD(true);

// Définir la distance
buildingLODTest.setDistance(150);

// Tester avec la caméra éloignée
buildingLODTest.testCameraDistance(200);

// Afficher les statistiques
buildingLODTest.showStats();

// Voir les couleurs des types
buildingLODTest.showColors();
```

## Impact sur les performances

### Avant LOD
- **Draw calls** : ~860 (avec de nombreux bâtiments)
- **Triangles** : Très élevé
- **Performance** : Limitée avec beaucoup de bâtiments

### Après LOD
- **Draw calls** : Réduits drastiquement (1 par type de bâtiment en LOD)
- **Triangles** : Considérablement réduits
- **Performance** : Amélioration significative à distance

### Optimisations supplémentaires
- **Frustum culling** : Activé sur tous les meshes
- **Matériaux optimisés** : Vertex colors, flat shading pour LOD
- **Géométries simplifiées** : Cubes avec 1 segment par dimension

## Architecture technique

### Fichiers principaux
- `src/World/Buildings/BuildingLODRenderer.js` - Générateur de géométries LOD
- `src/World/Rendering/InstancedMeshManager.js` - Gestionnaire principal
- `src/UI/RenderStatsUI.js` - Interface de contrôle
- `src/Utils/BuildingLODTestCommands.js` - Commandes de test

### Flux de données
1. **Création** : BuildingLODRenderer génère les géométries simplifiées
2. **Gestion** : InstancedMeshManager crée et gère les meshes LOD
3. **Mise à jour** : World.update() appelle updateLODVisibility() chaque frame
4. **Basculement** : Basé sur la distance caméra-centre ville

## Dépannage

### Problèmes courants

#### LOD ne s'active pas
- Vérifier que `enableBuildingLOD` est `true`
- Vérifier la distance de la caméra vs `buildingLODDistance`
- Utiliser `buildingLODTest.showStats()` pour diagnostiquer

#### Couleurs incorrectes
- Vérifier les définitions dans `BuildingLODRenderer.buildingColors`
- Utiliser `buildingLODTest.showColors()` pour voir les couleurs

#### Performance toujours faible
- Vérifier que les meshes haute qualité sont bien masqués en LOD
- Utiliser les statistiques de rendu pour surveiller les draw calls

### Logs de débogage
Le système affiche des logs dans la console :
```
[IMM] Created LOD mesh for house: 150 instances
Building LOD enabled
Building LOD distance set to 100
```

## Évolutions futures

### Améliorations possibles
1. **LOD multi-niveaux** : Ajouter un niveau intermédiaire
2. **LOD par instance** : Basculement individuel par bâtiment
3. **Transition douce** : Fade entre haute et basse qualité
4. **LOD adaptatif** : Ajustement automatique selon les performances

### Intégration avec d'autres systèmes
- **Agents LOD** : Coordination avec le système LOD existant des agents
- **Végétation LOD** : Extension aux arbres et autres éléments
- **Éclairage LOD** : Simplification de l'éclairage à distance 