# Amélioration de l'orientation des bâtiments vers les trottoirs

## Résumé des modifications

Ce projet améliore l'orientation des bâtiments pour s'assurer que leur façade avant est toujours correctement orientée vers un trottoir adjacent. Les modifications incluent:

1. Création d'une nouvelle méthode `determineOrientationTowardsSidewalk` dans `BuildingPlacementStrategy` qui calcule précisément l'orientation optimale du bâtiment en fonction de sa position par rapport aux trottoirs.

2. Gestion spéciale des bâtiments d'angle qui peuvent avoir deux façades donnant sur des trottoirs, en choisissant l'orientation la plus naturelle.

3. Ajout d'un helper visuel (flèches rouges) qui indique clairement la direction de la façade avant de chaque bâtiment.

4. Implémentation d'une touche de raccourci clavier (H) pour activer/désactiver l'affichage des flèches d'aide à l'orientation.

## Comment utiliser

1. Générez la ville comme d'habitude.
2. Appuyez sur la touche **H** du clavier pour afficher ou masquer les flèches d'orientation des bâtiments.
3. Les flèches rouges indiquent la direction de la façade avant de chaque bâtiment.
4. Dans les coins, les bâtiments seront orientés vers le trottoir le plus proche ou le plus visible.

## Implémentation technique

- Création d'une classe `BuildingFacadeHelper` qui gère l'affichage des flèches d'orientation.
- Modification de `BuildingPlacementStrategy` pour utiliser une logique améliorée d'orientation des bâtiments.
- Ajout d'une méthode `toggleBuildingFacadeHelpers` à `PlotContentGenerator` pour faciliter l'activation/désactivation des helpers.
- Modification de `Experience.js` pour gérer la touche de raccourci H. 