# TODO / versions simplifiées

Fonctionnalités implémentées en version simple (à enrichir) :

- **Audio** : tout est généré en Web Audio (musique générative par gamme/timbre selon l'âge, la saison et l'heure ; vent, pluie, clapotis, oiseaux, grillons, murmure du village ; sons de pose, destruction, changement d'âge). Pas de vraies pistes musicales, pas de spatialisation ni de réverbération.
- **Post-processing** : vignette et faux tilt-shift réalisés en CSS (`backdrop-filter`, désactivé sur mobile). Pas de bloom, d'occlusion ambiante ni de profondeur de champ réelle.
- **Instancing** : arbres, champs, jardins, fleurs et habitants sont des `InstancedMesh`. Les bâtiments sont des meshes simples qui partagent des géométries fusionnées et mises en cache (pas d'instancing par modèle).
- **Évolution d'âge** : les bâtiments sont remplacés un par un avec une animation écrasement/rebond, pas de vrai morphing de géométrie.
- **Auto-adaptation** : orientation vers la route voisine, maisons alignées accolées fusionnées (murs mitoyens, toits raccordés), clôtures et fleurs devant les maisons sans route. Pas de fusion entre bâtiments de types différents ni de jardins arrière.
- **Lumières de nuit** : fenêtres, torches et lampadaires sont émissifs (pas de vraies lumières ponctuelles).
- **Habitants** : 90 agents maximum, sans besoins individuels. Pathfinding : Dijkstra sur la grille qui préfère les routes.
- **Sauvegarde** : `localStorage` uniquement (un emplacement par carte), pas d'IndexedDB.
- **Retour au menu / nouvelle partie** : rechargent la page.
- **Déplacer un bâtiment** : l'annulation restaure l'état après retrait du bâtiment, pas l'état d'origine.
- **Mobile** : pixel ratio plafonné à 1.5, ombres 1024, pas de MSAA. Pas de profilage sur appareils réels (testé seulement en émulation).

Idées non faites : ponts sur l'eau, événements (festivals), éditeur de seed dans le menu, capture GIF.
