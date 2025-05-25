# Optimisation du Batching des Géométries

## Vue d'ensemble

Cette optimisation vise à réduire drastiquement le nombre de draw calls en regroupant les géométries qui partagent le même matériau. Au lieu de créer un `InstancedMesh` par partie de bâtiment, nous créons un seul `InstancedMesh` par type de matériau.

## Problème initial

Chaque bâtiment procédural génère plusieurs parties (murs, fenêtres, toits, etc.), et chaque partie devient un `InstancedMesh` séparé. Cela multiplie les draw calls :
- Un bâtiment simple : ~5 draw calls
- 100 bâtiments : ~500 draw calls
- Impact significatif sur les performances

## Solution : GeometryBatcher

Le `GeometryBatcher` regroupe toutes les géométries qui utilisent le même matériau en un seul `InstancedMesh`.

### Avantages
- **Réduction massive des draw calls** : De ~500 à ~10-20 (selon le nombre de matériaux uniques)
- **Meilleure utilisation du GPU** : Moins de changements d'état
- **Performance améliorée** : FPS plus stable, surtout avec beaucoup de bâtiments

### Architecture

```
GeometryBatcher
├── materialGroups (Map)
│   ├── Matériau 1 → [géométries, instances]
│   ├── Matériau 2 → [géométries, instances]
│   └── ...
└── mergedGeometryCache (Map)
    └── Cache des géométries fusionnées
```

## Utilisation

### Activation/Désactivation

Appuyez sur la touche **B** pour basculer entre le mode avec et sans batching.

### Moniteur de Performance

Appuyez sur la touche **P** pour afficher/masquer le moniteur de performance qui affiche :
- FPS
- Draw calls
- Nombre de triangles
- Utilisation mémoire

## Implémentation

### 1. GeometryBatcher (`src/World/Rendering/GeometryBatcher.js`)

Classe responsable du regroupement des géométries :
- `addGeometry()` : Ajoute une géométrie au batch
- `addAssetParts()` : Traite toutes les parties d'un asset
- `createInstancedMeshes()` : Génère les meshes optimisés
- `getMaterialKey()` : Crée une clé unique par matériau

### 2. InstancedMeshManager modifié

- Nouvelle méthode `createMeshesWithBatching()` qui utilise le `GeometryBatcher`
- Flag `useBatching` pour basculer entre les deux modes
- Conservation du mode legacy pour comparaison

### 3. PerformanceMonitor (`src/World/Rendering/PerformanceMonitor.js`)

Affiche les statistiques de rendu en temps réel :
- Draw calls (coloré en rouge si > 100)
- FPS (coloré en rouge si < 30)
- Triangles rendus
- Mémoire utilisée

## Résultats attendus

### Sans batching
- Draw calls : 200-500+ (selon le nombre de bâtiments)
- FPS : Variable, chutes possibles

### Avec batching
- Draw calls : 10-30 (selon les matériaux uniques)
- FPS : Plus stable et élevé

## Limitations

- Les animations spécifiques par partie (comme les arbres) restent séparées
- Le rechargement de la ville est nécessaire pour appliquer les changements
- Légère augmentation de la complexité du code

## Prochaines étapes

1. **Level of Detail (LOD)** : Implémenter des niveaux de détail pour les bâtiments éloignés
2. **Frustum Culling amélioré** : Optimiser le culling au niveau des instances
3. **Pooling des matériaux** : Réutiliser les matériaux identiques
4. **Texture Atlas** : Combiner les textures pour réduire les changements d'état

## Commandes clavier

- **P** : Afficher/masquer le Performance Monitor
- **B** : Activer/désactiver le batching (nécessite rechargement)
- **H** : Afficher/masquer les helpers de façade (déjà existant) 