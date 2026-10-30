# Village Lowpoly

Jeu de construction contemplatif en navigateur : on sculpte le terrain, on bâtit un village et on le regarde traverser **5 âges** (Préhistoire → Moderne) et **4 saisons**. Tout est procédural (géométrie low-poly, flat shading, sons Web Audio), aucun asset externe.

## Installation et lancement

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
npm run build      # vérification TypeScript + build statique dans dist/
npm run preview    # sert le dossier dist/
```

Le dossier `dist/` est 100 % statique (déployable tel quel).

## Contrôles

| Action | Souris / clavier | Tactile |
|---|---|---|
| Utiliser l'outil | clic gauche (glisser pour sculpter, tracer une route…) | un doigt |
| Tourner la caméra | clic droit + glisser, ou Q / E | deux doigts (rotation) |
| Déplacer la caméra | clic milieu ou Maj + clic droit, ou WASD / flèches | deux doigts (glisser) |
| Zoom | molette, ou + / - | pincement |
| Relief | 1 monter, 2 baisser, 3 aplanir, 4 falaise, 5 creuser (eau) | onglet Relief |
| Nature | 6 forêt, 7 champ, 8 jardin, 9 gomme | onglet Nature |
| Bâtir | B bâtiment, R route, X démolir, M déplacer, T tourner | onglet Bâtir (le bâtiment est posé au relâchement du doigt) |
| Taille du pinceau | [ et ] | curseur « Taille » |
| Annuler / rétablir | Ctrl+Z / Ctrl+Y | boutons ↩️ ↪️ |
| Pause | Espace | bouton ⏸ |
| Mode photo | P (H masque l'interface) | bouton 📷 |

Réglages (⚙️) : vitesse, durée du jour et des saisons, choix manuel de la saison et de l'heure, météo (auto, clair, pluie, neige, brume), volumes audio, sauvegarde, export/import JSON, nouvelle partie.

## Principe de jeu

Pas de ressources : le village a des **besoins** (nourriture, eau, logement, travail, bien-être) satisfaits par la présence de bâtiments, de champs, de jardins ou d'une rivière proche. Si un besoin manque, la population cesse simplement de croître (message doux dans le HUD). Quand la population et les bâtiments requis sont atteints, le village passe à l'âge suivant et les bâtiments « évoluent » avec une animation.

## Sauvegarde

Sauvegarde automatique toutes les 15 s (et à la fermeture de l'onglet) dans `localStorage`, un emplacement par carte. Export/import JSON depuis les réglages ou le menu principal.

## Structure du code

```
src/
  main.ts          boot, classe Game, boucle de jeu, raccourcis clavier
  core/            caméra orbitale + entrées souris/tactile, temps de jeu, RNG/maths
  world/           grille et heightmap (World), bruit simplex, génération des 3 cartes, pinceaux de relief
  build/           catalogue (bâtiments, âges), outils (placement fantôme, routes, démolition, undo/redo), orientation auto
  sim/             besoins/population/âges (Sim), habitants instanciés + pathfinding (Agents)
  render/          modèles procéduraux par âge, terrain/eau, routes, végétation instanciée, bâtiments, ciel/météo, saisons
  audio/           musique générative et ambiances Web Audio
  ui/              HUD, barre d'outils, réglages, menu de sélection de carte
  save/            sérialisation, localStorage, export/import
```

Voir `TODO.md` pour les simplifications connues.
