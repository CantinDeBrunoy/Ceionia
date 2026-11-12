# Audio

> Fichiers : `src/audio/audio.ts` (`AudioEngine` : musique, ambiances, effets, voix des bruitages), `src/audio/spots.ts` (choix des bruitages de proximité, sans Web Audio), `src/audio/voices.ts` (la synthèse de chaque bruitage), `src/main.ts` › `Game.ambience`, `Game.syncSpots`
> Tests : `tests/bruitages.test.ts`
> Voir aussi : [architecture.md](architecture.md), [interface.md](interface.md) (réglages), [sauvegarde.md](sauvegarde.md)

## En bref
Tout le son est **synthétisé** par Web Audio : aucun fichier son, rien à télécharger, aucune licence à citer. Trois familles : la musique générative (selon l'âge, la saison, la nuit), les ambiances (nature autour du point visé, et bruitages de proximité des bâtiments et des volcans) et les effets ponctuels (`sfx…` : poser, démolir, éruption, tonnerre, combat…). Les sons et les ambiances sont allumés par défaut, la musique est coupée tant que le joueur ne l'allume pas ; le contexte démarre au premier clic ou à la première touche (`unlock`).

## Règles du jeu
- **Réglages** (Graphismes & son) : Musique, Sons, Ambiances (volume 0 … 1 ; défaut 0,5, 0,7, 0,7). Le bouton qui coupe les sons coupe aussi les ambiances.
- **Ambiances de nature** : vent (plus fort en altitude, l'hiver, par brume, pluie ou neige), pluie, eau lointaine, torrents et cascades proches, **ressac** près du rivage (houle lente), grillons la nuit, murmure du village le jour, oiseaux, mouettes, aigles en montagne, crépitement des feux, grenouilles ; sous terre : grondement et gouttes.
- **Bruitages de proximité** : quand la caméra s'approche, on entend les bâtiments et les volcans (table plus bas). Chaque source porte jusqu'à `r1` cases (pleine force jusqu'à `r0`). Les ateliers, la foule et les poules se taisent la nuit ; les bêtes des enclos s'entendent moins ; la taverne s'anime le soir. Sous la pluie, foule et abeilles baissent ; l'hiver, plus d'abeilles. Caméra haute : les bâtiments s'éteignent vers `dist` = 87, le volcan porte plus loin.
- **Onglet caché** : tout se tait (le contexte est suspendu), et reprend au retour.

| Source | Bâtiment (âge du modèle) | Son | Quand |
|---|---|---|---|
| `flint` | atelier, Préhistoire | chocs secs du silex | jour |
| `pottery` | atelier, Antiquité | tour qui ronronne, glissements de l'argile | jour |
| `forge` | atelier, Médiéval | marteau sur l'enclume par séries, soufflet | jour |
| `factory` | atelier (Industriel), minoterie à vapeur, usine automobile, raffinerie, puits de pétrole, briqueterie | halètement de la vapeur, grondement | toujours |
| `mill` | moulin, Médiéval | bief, grincement du bois | toujours |
| `wind` | éolienne (Moderne, Futuriste) | souffle des pales | toujours |
| `axe` / `saw` | bûcheron (Préhistoire, Antiquité) / scierie | coups de hache / va-et-vient de la scie | jour |
| `quarry`, `mine` | carrière, mine | burin et éboulis, pioche et écho | jour |
| `sheep` / `cows`, `hens` | enclos (vaches dès l'Industriel ; poules dès l'Antiquité) | bêlements, meuglements, caquètements | jour (bêtes : un peu la nuit) |
| `horses` | écurie | hennissements, ébrouements | idem |
| `bees` | rucher | bourdonnement | jour, hors hiver |
| `crowd` | place (sauf feu de camp et parc), forum | rumeur, conversations, appel d'un marchand | jour |
| `tavern` | taverne | conversations, rires, chopes | surtout le soir |
| `harbor` | port | clapot, cordages, cloche | toujours |
| `machine` | laboratoire (Moderne, Futuriste), fusion, arcologie, institut, ferme verticale, maglev, cosmodrome | bourdonnement électrique, ventilation, bips, pulsations | toujours |
| `volcano` | cratère (`VEG_VOLCANO`) | grondement qui enfle, bulles de lave | toujours |

## Fonctionnement dans le code
- **Bus** : `master` (compresseur) ← `musicG` (musique), `sfxG` (effets, volume Sons), `ambG` (volume Ambiances). Les boucles de bruit de nature (`noiseLoop`), les grillons, les oiseaux, mouettes, aigles, grenouilles et les voix des bruitages passent par `ambG`.
- **`audio.update(dt, état)`** (chaque image, `Game.frame`) : âge, saison, lumière, météo, population, distance de caméra, `under`, et la proximité calculée par `Game.ambience()` (torrent, cascade, côte, feu, altitude, grenouilles ; multipliée par le zoom `clamp(1,3 − dist/70, 0,15, 1)`). Il règle les gains des boucles, programme les cris et la musique, et les coups des voix de proximité (`tickVoices`).
- **Bruitages de proximité**, toutes les 0,25 s (`Game.syncSpots`, au village seulement : rien aux Enfers, sous terre ni au commandement de l'île) :
  1. `buildingSpots` : les sources des bâtiments à moins de 40 cases du point visé (`soundsOf(genre, âge du modèle)`), plus les cratères à moins de 45 cases (liste des cases `VEG_VOLCANO` refaite quand `world.version` change).
  2. `pickVoices` : force d'une source = `(1 − smoothstep(r0, r1, distance)) × loud` (`SPOT_DEFS`) ; une sorte n'a qu'**une voix** : ses sources se cumulent en `1 − Π(1 − p)`, la position est celle de la plus proche ; × heure (`timeFactor`), × zoom (`zoomFactor`), × pluie ; sous 0,03, rien. On garde les **6** plus fortes (3 sur écran tactile ou petit écran, `coarse`).
  3. Panoramique : la source projetée à l'écran, `x × 0,7`.
  4. `AudioEngine.spots(liste, pans)` : une voix nouvelle = `inp` → `out` (gain = force, fondu `setTargetAtTime` 0,25 s) → `StereoPannerNode` → `ambG`, avec ses boucles (`VOICES[sorte].loop`) ; une voix absente de la liste s'éteint en fondu, ses nœuds sont arrêtés et débranchés 1,6 s après.
  5. `tickVoices` (dans `update`) : quand l'heure de la voix arrive et qu'elle s'entend (force ≥ 0,02), `VOICES[sorte].tick` programme ses coups dans `inp` et rend le délai avant le suivant.
- **Synthèse** (`voices.ts`) : `note` (oscillateur, glissement, filtre, vibrato), `hiss` (souffle de bruit filtré), `noiseBed` (boucle de bruit, volume ondulant), `drone` (oscillateurs continus). Bêlement = dent de scie chevrotante (vibrato 9–12 Hz) dans un passe-bande ; enclume = partiels inharmoniques (× 2,76, × 5,4) ; foule = syllabes brèves à des hauteurs de voix variées sur une rumeur de bruit.
- **Pause** : `visibilitychange` → `audio.pause(document.hidden)` (`ctx.suspend()` / `resume()`).

## Liens avec les autres systèmes
- Réglages : `Settings.musicVol`, `sfxVol`, `ambVol`, `music`, `sfx` ([sauvegarde.md](sauvegarde.md)) ; curseurs dans `openSettings` ([interface.md](interface.md)).
- Proximité de nature : `Streams.nearness`, `World.waterDist`, `Life.fireNear`, `Fires.nearness`, `Fauna.frogsNear`.
- Effets branchés dans `main.ts` : éruption (`erupt`), tonnerre, fêtes, combats (`onClash`), plouf des poissons et hurlement des loups (volume selon la distance au point visé et le zoom).

## Pièges et invariants
- Rien ne joue avant `audio.start()` (geste du joueur) : `ctx` est `null`, toutes les méthodes ressortent.
- Les coups ne se programment que dans `update` : si la boucle de jeu ne tourne pas (onglet en arrière-plan, rAF arrêté), les voix gardent seulement leurs boucles ; d'où la suspension du contexte quand l'onglet est caché.
- Chaque coup crée ses nœuds ; ils s'arrêtent d'eux-mêmes (`stop`). Garder les rythmes raisonnables (la foule et la taverne, les plus denses, programment 3 ou 4 syllabes toutes les 0,5 s).
- `soundsOf` lit `Building.age` (âge du **modèle** affiché), pas l'âge du village : un bâtiment qui n'a pas encore évolué garde son son.

## Pour modifier
- **Ajouter un bruitage** : une sorte dans `SpotKind`, sa ligne dans `SPOT_DEFS` (force, portée, moment), son bâtiment dans `soundsOf`, sa voix dans `VOICES` (`voices.ts`) ; le test « toutes les sortes ont une voix » vérifie l'accord. Mettre à jour la table ci-dessus.
- **Vérifier sans écouter** : `__game.audio.debugSpots()` liste les voix (sorte, force, gain courant, panoramique, en fondu). Pour mesurer le signal : brancher un `AnalyserNode` sur `__game.audio.voices.get(sorte).out`.
- **Régler un volume** : `loud` dans `SPOT_DEFS` pour la portée relative ; `gain` de la voix (`VOICES`) pour son niveau. Les gains ont été calés hors temps réel (`OfflineAudioContext`, 12 s de chaque voix) : la fenêtre de 0,1 s la plus forte entre 0,02 et 0,06 en valeur efficace, comme une cascade proche (0,033) ; le torrent est à 0,011.
