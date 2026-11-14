# Audio

> Fichiers : `src/audio/audio.ts` (`AudioEngine` : musique, ambiances, effets, voix des bruitages), `src/audio/spots.ts` (choix des bruitages de proximité, sans Web Audio), `src/audio/voices.ts` (la synthèse de chaque bruitage), `src/main.ts` › `Game.ambience`, `Game.syncSpots`
> Tests : `tests/bruitages.test.ts`
> Voir aussi : [architecture.md](architecture.md), [interface.md](interface.md) (réglages), [sauvegarde.md](sauvegarde.md)

## En bref
Le son est **synthétisé** par Web Audio, sauf quelques vrais cris d'animaux et la musique, enregistrés (ci-dessous). Trois familles : la musique (des morceaux libres de droits selon l'âge, le menu, les Enfers et la fin ; à défaut la musique générative, selon l'âge, la saison, la nuit), les ambiances (nature autour du point visé, et bruitages de proximité des bâtiments et des volcans) et les effets ponctuels (`sfx…` : poser, démolir, éruption, tonnerre, combat…). Les sons et les ambiances sont allumés par défaut, la musique est coupée tant que le joueur ne l'allume pas ; le contexte démarre au premier clic ou à la première touche (`unlock`).

## Règles du jeu
- **Réglages** (Graphismes & son) : Musique, Sons, Ambiances (volume 0 … 1 ; défaut 0,5, 0,7, 0,7). Le bouton qui coupe les sons coupe aussi les ambiances.
- **Niveaux des ambiances continues** (`update`), gardés discrets : pluie 0,045 × pluie, torrents 0,04, cascades 0,065, ressac 0,035 (± 80 % de houle), eau lointaine 0,012, murmure du village 0,018 au plus, grotte 0,04 ; tonnerre à 55 % (`sfxThunder`).
- **Bêtes seulement de près** : grillons, oiseaux, mouettes, aigles, grenouilles, cris de la faune et bruitages des bâtiments suivent la même règle de zoom (`near` dans `update`, `zoomFactor`) : pleins sous 15 de distance, muets au-delà de 40. Vue de haut, on n'entend plus que l'eau, la pluie, le murmure du village et le volcan.
- **Ambiances de nature** : pluie (plus de vent : son souffle continu prenait trop de place), eau lointaine, torrents et cascades proches, **ressac** près du rivage (houle lente), grillons la nuit (courtes trilles douces toutes les 1 à 5 s, plus de note continue hachée), murmure du village le jour, oiseaux (un chant toutes les 4 à 11 s), mouettes (toutes les 8 à 20 s), aigles en montagne, crépitement des feux, grenouilles ; sous terre : grondement et gouttes ; aux Enfers, le grondement seul (`hell` : pas de gouttes, dont le « bip-bup » détonnait).
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
| `machine` | laboratoire (Moderne, Futuriste), fusion, arcologie, institut, ferme verticale, maglev, cosmodrome | bourdonnement électrique, ventilation, pulsations sourdes (pas de bips aigus) | toujours |
| `volcano` | cratère (`VEG_VOLCANO`) | grondement qui enfle, bulles de lave | toujours |

## Fonctionnement dans le code
- **Bus** : `master` (compresseur) ← `musicG` (musique), `sfxG` (effets, volume Sons), `ambG` (volume Ambiances). Les boucles de bruit de nature (`noiseLoop`), les grillons, les oiseaux, mouettes, aigles, grenouilles et les voix des bruitages passent par `ambG`.
- **`audio.update(dt, état)`** (chaque image, `Game.frame`) : âge, saison, lumière, météo, population, distance de caméra, `under`, et la proximité calculée par `Game.ambience()` (torrent, cascade, côte, feu, altitude, grenouilles ; multipliée par le zoom `clamp(1,3 − dist/70, 0,15, 1)`). Il règle les gains des boucles, programme les cris et la musique, et les coups des voix de proximité (`tickVoices`).
- **Bruitages de proximité**, toutes les 0,25 s (`Game.syncSpots`, au village seulement : rien aux Enfers, sous terre ni au commandement de l'île) :
  1. `buildingSpots` : les sources des bâtiments à moins de 40 cases du point visé (`soundsOf(genre, âge du modèle)`), plus les cratères à moins de 45 cases (liste des cases `VEG_VOLCANO` refaite quand `world.version` change).
  2. `pickVoices` : force d'une source = `(1 − smoothstep(r0, r1, distance)) × loud` (`SPOT_DEFS`) ; une sorte n'a qu'**une voix** : ses sources se cumulent en `1 − Π(1 − p)`, la position est celle de la plus proche ; × heure (`timeFactor`), × zoom (`zoomFactor`), × pluie ; sous 0,03, rien. On garde les **2** plus fortes (1 sur écran tactile ou petit écran, `coarse`) ; la seconde à 45 % seulement, pour qu'une voix domine. Le zoom éteint les bâtiments vite : pleins sous 15 de distance, muets au-delà de 40 (`zoomFactor`) ; le volcan porte plus loin. Avant, 6 voix et des sons audibles de loin faisaient un tintamarre.
  3. Panoramique : la source projetée à l'écran, `x × 0,7`.
  4. `AudioEngine.spots(liste, pans)` : une voix nouvelle = `inp` → `out` (gain = force, fondu `setTargetAtTime` 0,25 s) → `StereoPannerNode` → `ambG`, avec ses boucles (`VOICES[sorte].loop`) ; une voix absente de la liste s'éteint en fondu, ses nœuds sont arrêtés et débranchés 1,6 s après.
  5. `tickVoices` (dans `update`) : quand l'heure de la voix arrive et qu'elle s'entend (force ≥ 0,02), `VOICES[sorte].tick` programme ses coups dans `inp` et rend le délai avant le suivant.
- **Musique enregistrée** (`MUSIC` dans `audio.ts`, fichiers dans `public/sons/musique/`) : une liste de morceaux par âge (`age0` … `age5`) et par scène (`menu`, `hell`, `end`). `audio.music(scène)` impose une scène, `null` rend celle de l'âge (lue dans `update`). `main.ts` la choisit toutes les 0,25 s : `end` pendant la cinématique de la chute du roi (`kingStage.playing`), le voyage des colons (`.overlay.voyage`) et les écrans de victoire (`.overlay.victory`, les deux fins) ; `hell` aux Enfers ; sinon l'âge. Le menu principal pose `menu` (`boot`, avec les réglages enregistrés et un démarrage du son au premier clic).
  - Rien n'est chargé tant que la musique est coupée. Un morceau est un `HTMLAudioElement` lu en flux (`createMediaElementSource` → gain de fondu → `musicG`), au niveau `TRACK_GAIN` (0,55 : en valeur efficace 0,014, un peu au-dessus de la musique générée, 0,011, au volume par défaut). Il entre en fondu (`MUSIC_FADE` = 4 s) ; 4 s avant sa fin, le suivant de la liste (autre que le précédent s'il y en a plusieurs) prend le relais en fondu enchaîné, de même quand la liste change (passage d'âge, Enfers, fin).
  - Repli : un fichier illisible ou absent est noté (`missing`) et sauté ; une liste sans fichier rend la musique générative (en partie seulement : au menu, elle ne tourne pas). Pendant un morceau, la musique générative se tait (`update` ressort avant les notes et recale `nextNote`, `nextPad`).
  - Revenir à la musique générée, ou passer à celle composée pour le jeu : remplacer les fichiers et les noms de `MUSIC` (une liste vide = musique générée pour cette scène), ou `RECORDED_MUSIC = false` partout. Mettre à jour les crédits.
  - Vérifier sans écouter : `__game.audio.debugMusic()` (scène, âge, morceau, position, gain, fichiers manquants).
  - Les morceaux (tous MP3 96 kbit/s stéréo, 44,1 kHz, ramenés à −20 LUFS intégrés et −2 dBTP au plus, 64 Mo en tout, 93 min) :

| Liste | Fichier | Morceau | Auteur | Licence |
|---|---|---|---|---|
| `age0` | `prehistoire-tribal` | « Tribal » (3:12) | Of Far Different Nature, OpenGameArt | CC0 |
| `age0` | `prehistoire-ancetres` | « The Sky of our Ancestors » (7:11) | Kevin MacLeod (incompetech.com) | CC BY 4.0 |
| `age0` | `prehistoire-oiseau-tonnerre` | « Thunderbird » (6:02) | Kevin MacLeod | CC BY 4.0 |
| `age1` | `antiquite-temple` | « Temple of the Manes » (2:36) | Kevin MacLeod | CC BY 4.0 |
| `age1` | `antiquite-harpe` | « Enchanted Journey » (4:30) | Kevin MacLeod | CC BY 4.0 |
| `age1` | `antiquite-luth` | « Suonatore di Liuto » (2:24) | Kevin MacLeod | CC BY 4.0 |
| `age1` | `antiquite-cuivres` | « Peaceful Desolation » (1:31) | Kevin MacLeod | CC BY 4.0 |
| `age2` | `medieval-exploration` | « Medieval: Exploration » (3:56) | RandomMind, OpenGameArt | CC0 |
| `age2` | `medieval-auberge` | « Medieval: The Old Tower Inn » (1:46) | RandomMind, OpenGameArt | CC0 |
| `age2` | `medieval-conteur` | « Teller of the Tales » (3:32) | Kevin MacLeod | CC BY 4.0 |
| `age3` | `industriel-gymnopedie` | « Gymnopedie No 1 » d'Erik Satie (3:07) | Kevin MacLeod | CC BY 4.0 |
| `age3` | `industriel-morialta` | « Danse Morialta » (3:56) | Kevin MacLeod | CC BY 4.0 |
| `age3` | `industriel-gymnopedie-3` | « Gymnopedie No 3 » d'Erik Satie (2:25) | Kevin MacLeod | CC BY 4.0 |
| `age3` | `industriel-valse-givre` | « Frost Waltz » (2:15) | Kevin MacLeod | CC BY 4.0 |
| `age3` | `industriel-adieux` | « The Parting » (3:04) | Kevin MacLeod | CC BY 4.0 |
| `age4` | `moderne-the` | « A cup of tea » (2:49) | TAD, OpenGameArt (« lofi Compilation ») | CC0 |
| `age4` | `moderne-fleuriste` | « Florist » (1:53) | TAD, OpenGameArt | CC0 |
| `age4` | `moderne-barman` | « Bartender » (4:07) | TAD, OpenGameArt | CC0 |
| `age4` | `moderne-cafe-chats` | « Cat caffe » (2:13) | TAD, OpenGameArt | CC0 |
| `age5` | `futuriste-synthwave` | « Calm Ambient 1 (Synthwave 4k) » (2:38) | The Cynic Project, OpenGameArt | CC0 |
| `age5` | `futuriste-aout` | « Another August » (3:27) | The Cynic Project, OpenGameArt | CC0 |
| `age5` | `futuriste-lifewave` | « Calm Ambient 3 (Lifewave 2k) » (3:07) | The Cynic Project, OpenGameArt | CC0 |
| `menu` | `menu` | « Thaxted » de Gustav Holst (2:33) | Kevin MacLeod | CC BY 4.0 |
| `hell` | `enfers-oppression` | « Oppressive Gloom » (3:19) | Kevin MacLeod | CC BY 4.0 |
| `hell` | `enfers-com-mecha` | « Theme of Com-Mecha » (4:59), écrit pour une planète volcanique et industrielle | Matthew Pablo, OpenGameArt | CC BY 3.0 |
| `hell` | `enfers-croisade` | « Crusade » (3:19) | Kevin MacLeod | CC BY 4.0 |
| `hell` | `enfers-rituel` | « Ritual » (4:24) | Kevin MacLeod | CC BY 4.0 |
| `end` | `fin` | « Beyond The Clouds » (2:22) | Matthew Pablo, OpenGameArt | CC BY 3.0 |

  - Préparer un fichier (ffmpeg, deux passes : mesure, puis correction linéaire) : `ffmpeg -i in.mp3 -af loudnorm=I=-20:TP=-2:LRA=11:print_format=json -f null -`, puis `ffmpeg -i in.mp3 -af "loudnorm=I=-20:TP=-2:LRA=11:measured_I=…:measured_TP=…:measured_LRA=…:measured_thresh=…:offset=…:linear=true,aresample=44100" -map_metadata -1 -ac 2 -c:a libmp3lame -b:a 96k sortie.mp3`. Vérifier : `ffmpeg -i sortie.mp3 -af ebur128=peak=true -f null -` (I ≈ −20 LUFS).
- **Synthèse** (`voices.ts`) : `note` (oscillateur, glissement, filtre, vibrato), `hiss` (souffle de bruit filtré), `noiseBed` (boucle de bruit, volume ondulant), `drone` (oscillateurs continus). Bêlement = dent de scie chevrotante (vibrato 9–12 Hz) dans un passe-bande ; enclume = partiels inharmoniques (× 2,76, × 5,4) ; foule = syllabes brèves à des hauteurs de voix variées sur une rumeur de bruit.
- **Pause** : `visibilitychange` → `audio.pause(document.hidden)` (`ctx.suspend()` / `resume()`, et le morceau en cours mis en pause).

## Liens avec les autres systèmes
- Réglages : `Settings.musicVol`, `sfxVol`, `ambVol`, `music`, `sfx` ([sauvegarde.md](sauvegarde.md)) ; curseurs dans `openSettings` ([interface.md](interface.md)).
- Proximité de nature : `Streams.nearness`, `World.waterDist`, `Life.fireNear`, `Fires.nearness`, `Fauna.frogsNear`.
- Effets branchés dans `main.ts` : éruption (`erupt`), tonnerre, fêtes, combats (`onClash`), plouf des poissons et hurlement des loups (volume selon la distance au point visé et le zoom). Vrais cris enregistrés (`SAMPLES` dans `audio.ts`, fichiers dans `public/sons/animaux/`, chargés au démarrage du son, rognés de leurs silences et ramenés à la crête `SAMPLE_PEAK`, joués à une hauteur un peu variée ; un fichier absent laisse le cri de synthèse) :

| Fichier | Espèces | Source | Licence |
|---|---|---|---|
| `mouton.mp3` | mouton, bouquetin (× 1,3 plus aigu) | Wikimedia Commons, « Sheep bleat.ogg » | CC0 |
| `cerf.mp3` | cerf, élan (× 0,85) | Wikimedia Commons, « Elkbellow.ogg » (US Fish and Wildlife Service) | domaine public |
| `vache.mp3` | vache | Wikimedia Commons, « Single Cow Moo.ogg », par MichaeltheFox8621 | CC BY-SA 4.0 (crédit obligatoire) |
| `cheval.mp3` | cheval | Wikimedia Commons, « Wiehern.ogg » | domaine public |
| `poule.mp3` | poule (passage de 3,5 s tiré au hasard, `max`) | Wikimedia Commons, « Hen announcing shes lain an egg.ogg », par alys (PDSounds) | domaine public |

Les fichiers sont les transcodages MP3 de Commons (lus partout, Safari compris). Pour en ajouter un : le déposer dans `public/sons/animaux/`, l'inscrire dans `SAMPLES` (`rate` pour le décaler, `max` pour un long enregistrement), le citer dans `showCredits` (avec sa traduction) et dans ce tableau.

Cités dans la page Crédits (`showCredits`). Cris de la faune sauvage : toutes les 7 à 16 s, si la vue est à moins de 40 de distance, `Fauna.pickCaller` tire un animal éveillé, visible et vivant à moins de 12 cases du point visé (force nulle à 14 cases), parmi les espèces de `CALLS` (`voices.ts` : mouton, vache, cheval, poule, cochon, cerf (brame ou aboiement), élan, éléphant (barrissement), chameau, lama, girafe, ours, bouquetin, renard) ; `audio.sfxCall` le joue sur le bus des ambiances, atténué selon la distance et le zoom. Hurlement (`sfxHowl`) : le chef puis un ou deux loups décalés, chacun sur sa note ; dents de scie dans deux formants « ou » (520 et 900 Hz) plus un sinus, un peu de souffle, montée glissée, longue tenue à peine ondulante (0,7 à 1,5 Hz), chute en fin de souffle, écho de vallée (0,31 s).

## Pièges et invariants
- Rien ne joue avant `audio.start()` (geste du joueur) : `ctx` est `null`, toutes les méthodes ressortent.
- Les coups ne se programment que dans `update` : si la boucle de jeu ne tourne pas (onglet en arrière-plan, rAF arrêté), les voix gardent seulement leurs boucles ; d'où la suspension du contexte quand l'onglet est caché.
- Chaque coup crée ses nœuds ; ils s'arrêtent d'eux-mêmes (`stop`). Garder les rythmes raisonnables (la foule et la taverne, les plus denses, programment 3 ou 4 syllabes toutes les 0,5 s).
- `soundsOf` lit `Building.age` (âge du **modèle** affiché), pas l'âge du village : un bâtiment qui n'a pas encore évolué garde son son.

## Pour modifier
- **Ajouter un bruitage** : une sorte dans `SpotKind`, sa ligne dans `SPOT_DEFS` (force, portée, moment), son bâtiment dans `soundsOf`, sa voix dans `VOICES` (`voices.ts`) ; le test « toutes les sortes ont une voix » vérifie l'accord. Mettre à jour la table ci-dessus.
- **Vérifier sans écouter** : `__game.audio.debugSpots()` liste les voix (sorte, force, gain courant, panoramique, en fondu). Pour mesurer le signal : brancher un `AnalyserNode` sur `__game.audio.voices.get(sorte).out`.
- **Régler un volume** : `loud` dans `SPOT_DEFS` pour la portée relative ; `gain` de la voix (`VOICES`) pour son niveau. Les gains ont été calés hors temps réel (`OfflineAudioContext`, 12 s de chaque voix) : la fenêtre de 0,1 s la plus forte entre 0,02 et 0,06 en valeur efficace, comme une cascade proche (0,033) ; le torrent est à 0,011.
