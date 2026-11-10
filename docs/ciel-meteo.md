# Ciel et météo

> Fichiers : `src/core/time.ts` (`GameTime` : heure, jours, saisons, vitesse, pause), `src/render/env.ts` (`Environment` : soleil, lune, couleurs du ciel, étoiles, nuages, brouillard, météo, pluie, neige qui tombe), `src/render/season.ts` (palette des saisons, tenue de la neige), `src/render/snow.ts` (neige posée sur les matériaux), `src/render/atmosphere.ts` (`Atmosphere` : brume, nuages des sommets, arc-en-ciel, orages), `src/render/nightSky.ts` (`NightSky` : aurores boréales, étoiles filantes), `src/core/skyNights.ts` (programme des nuits, logique pure), `src/render/glow.ts` (halo de nuit), `src/render/life.ts` (lucioles, nuée du crépuscule), `src/main.ts` (`Game.frame`, `refreshSeason`, `renderer_render`, `dispelFog`, `skyShow`), `src/ui/ui.ts` (réglages : météo, durée du jour, saison).
> Tests : `tests/cielNocturne.test.ts`, `tests/saisons.test.ts`, `tests/neigeRoutes.test.ts`.
> Voir aussi : [architecture.md](architecture.md), [vegetation-biomes.md](vegetation-biomes.md), [rendu-modeles.md](rendu-modeles.md), [interface.md](interface.md), [incidents.md](incidents.md), [routes.md](routes.md)

## En bref
Le temps du jeu (`GameTime`) fait tourner les heures et les saisons. `Environment` en tire la lumière (soleil le jour, lune la nuit), les couleurs du ciel, les étoiles et la météo (clair, pluie, neige, brouillard). `Atmosphere` ajoute la brume du matin, les nuages accrochés aux sommets, l'arc-en-ciel après la pluie et les orages. `NightSky` ajoute, certaines nuits, une aurore boréale et des étoiles filantes. Tout est du décor : seule la pluie touche la simulation (humidité des champs, habitants à l'abri).

## Règles du jeu

### Le temps
- Une journée dure `dayLen = 100` s réelles (réglage « Durée du jour », 30 à 400 s), une saison `seasonLen = 160` s : une saison fait 1,6 jour, une année 6,4 jours (`time.ts`).
- Les heures de nuit filent plus vite : `NIGHT_SKIP = 0.6`, la nuit prend environ 30 % du cycle (≈ 31 s à ×1, durée du jour par défaut).
- Vitesse ×1, ×2, ×4 et pause : `GameTime.update(dt)` rend le temps de jeu (`gdt`, 0 en pause).
- Saison affichée : `GameTime.season` ; le décor passe d'une saison à l'autre sur `BLEND = 0.3` de saison, centré sur le changement (`GameTime.mix`).
- `GameTime.days` compte les jours depuis le lancement ; il n'est **pas sauvegardé**.

### Jour et nuit
- Soleil sur un cercle : angle `(hour − 6) / 24 × 2π` ; `daylight = smoothstep(−0.12, 0.28, élévation)` ; `env.night = clamp(1 − daylight × 1.15)`.
- Ciel : dégradé horizon → zénith (`skyMat`, sphère de rayon 520) entre `NIGHT_*`, `DAY_*`, `DUSK_*` (`env.ts`), teinté par la saison (`light.sky × light.skyK`), grisé par temps couvert. Soleil, lumière d'ambiance et brouillard suivent aussi la fiche de saison ([saisons.md](saisons.md)). Le fond (`scene.background`) et le brouillard prennent la couleur de l'horizon.
- Étoiles : 500 points (rayon 480, moitié haute du ciel), opacité `(1 − jour) × (1 − couvert)`.
- La nuit reste lisible : lune bleutée (intensité 1,9), lumière d'ambiance (`hemi`) 0,88 la nuit contre 0,72 le jour.
- Fenêtres et lampadaires : `night = clamp(1 − day × 1.15 + couvert × 0.25 × day)`, `emissiveIntensity = night × 2.1`, uniformes `LIGHTS` (`materials.ts`).
- Halo (bloom) : de nuit seulement, force `0.8 × clamp((night − 0.35) / 0.45)`, seuil 1,3 (`Game.renderer_render`) ; coupé par la qualité (`gfx.glow`).
- Habitants : rentrent la nuit (20 h 30 – 5 h 30) ou par forte pluie (`rainK > 0.6`) ; torches des patrouilles dès `night > 0.5` ([habitants.md](habitants.md)).
- Vie : lucioles les nuits d'été, nuée d'étourneaux au crépuscule (17,6 h – 20,4 h, ciel clair) (`life.ts`).

### Saisons
- Fiche de chaque saison (`seasonConfig.ts`, détail dans [saisons.md](saisons.md)) : sol, arbres, végétation basse, eau, lumière, effets.
- Neige au sol : `snow` vaut 0, 0, 0,05 et 1 selon la saison ; elle ne tient que la première moitié de l'hiver, fond de `seasonT` 3,5 à 3,9 (il en reste 15 %), et n'est qu'à 15 % au tout début du printemps (`computeSeason`).
- Neige posée sur les toits, branches, rochers : `SNOW.value` × part retenue par le biome (`SNOWY = [1, 1, 0.15, 0.2, 1]`, `setSnowMap`) ; 0 sous terre.
- Les routes ne se refont qu'aux seuils de neige (`roadSnowStep`), sinon le shader suit seul ([routes.md](routes.md)).

### Météo
- Tirage toutes les 35 à 90 s de jeu (`weatherTimer`), table `autoWeather` par saison (clair / pluie ou neige / brouillard) : printemps 63 / 35 / 1,8 %, été 85 / 14 / 0,9 %, automne 67 / 30 / 3 %, hiver 49 / 50 (neige) / 1,2 %. La pluie tourne à la neige si la neige au sol dépasse 0,5.
- Changement : l'intensité `weatherK` redescend (0,5 par seconde réelle) avant que le type change, puis remonte (0,35/s).
- Réglages : Auto, Clair, Pluie, Neige, Brume (`env.setWeather` ; `manualWeather` reste tant qu'on ne repasse pas en Auto).
- Pluie : 1 500 traits, neige : 1 300 flocons, dans un volume de 50 × 24 × 50 autour du point visé ; plus dessinés quand la caméra est à plus de 95.
- Brouillard (`THREE.Fog`) : 85 → 220 par temps clair, 40 → 120 sous la pluie ou la neige, 8 → 70 dans le brouillard ; il recule quand on dézoome.
- La pluie remplit l'humidité des champs (`Sim.moisture`, rendement, sécheresse) ; elle règle aussi le vent, les sons, la faune.

### Brume, nuages, arc-en-ciel, orages (`Atmosphere`)
- Brume au ras du sol : un matin et un soir sur trois (`MIST_CHANCE = 0.3`, tirage par jour `mistDay`), plus en automne (`light.mist` de la fiche : 0,6, 0,3, 0,8, 0,45) ; le brouillard l'épaissit et la monte, la pluie la disperse. Le bouton « dissiper » (`#bFog` → `Game.dispelFog`) chasse brouillard et brume 300 s. Coupée en qualité réduite (`gfx.mist`).
- Nuages : `11 × N/48` groupes autour du milieu de la carte, qui tournent lentement (0,006 rad/s), assombris la nuit, gris par temps couvert. Nuages des sommets : `N/12` pics au plus (plus de 7 de haut, espacés de 12 cases, pas les volcans), 7 bouffées chacun (`CAP_PUFFS`).
- Arc-en-ciel : quand une vraie pluie (`weatherK > 0.5`) cesse, ciel dégagé, sans neige, en plein jour (7 h – 17,5 h) : 45 s réelles. À l'opposé du soleil ; on ne le voit qu'en lui tournant le dos et si la vue montre le ciel.
- Orages : quand une pluie commence, chance d'orage 60 % l'été, 35 % au printemps et en automne, jamais l'hiver. Éclair toutes les 4 à 13 s tant que `rainK > 0.75`, à 12 – 52 cases du point visé, attiré par un bâtiment proche (une chance sur deux) ; tonnerre retardé de 0,035 s par case ; une fois sur deux la foudre met le feu (`onStrike`, [incidents.md](incidents.md)).

### Aurores boréales et étoiles filantes (`NightSky`, `skyNights.ts`)
- Chaque nuit a son programme (`nightShow(nuit, saison, froid, sel)`), tiré une fois au soir. Les nuages cachent le spectacle (il pâlit avec le couvert), ils ne l'annulent pas.
- Aurore : chance `AURORA_BASE = [0.06, 0.02, 0.1, 0.3]` (printemps, été, automne, hiver) plus `AURORA_COLD = [0.14, 0.05, 0.2, 0.35]` × froid de la carte (part des terres en taïga ou au-dessus de `SNOW_LINE[0]`, pleine à `COLD_FULL = 0.25`). Hiver sur une carte froide : 65 % des nuits ; été tempéré : 2 %. Force 0,6 à 1.
- Elle se lève en pleine nuit (`smoothstep(0.6, 0.95, env.night)`), en fondu (≈ 5 s de jeu), respire (sursauts), s'éteint avant l'aube. Plus vive vers le nord (−z), à peine un voile au sud. Elle teinte un peu de vert le paysage (`hemi`) et le fond du ciel.
- Étoiles filantes : grande nuit (`SHOWER = [0.05, 0.11, 0.05, 0.08]`, plus souvent l'été et l'hiver, jamais deux de suite), quelques-unes (`SOME = 0.18`), une seule (`LONE = 0.3`), aucune sinon. Cadence par seconde de jeu `METEOR_RATE` (0,045 / 0,22 / 3), ajustée à la durée du jour (`meteorRate`) ; la grande nuit vient par bouffées, toutes ses étoiles jaillissent d'un même radiant. 6 % de bolides (plus gros, plus lents).
- Annonce (une par nuit, quand le spectacle se voit : nuit noire, ciel dégagé) : l'aurore et la grande nuit des étoiles filantes ont un message ; un clic relève la vue vers l'horizon (`CameraRig.lookUp`, cap nord pour l'aurore). Avec un observatoire, ce sont les astronomes qui annoncent. En mode photo, le message va dans la cloche.
- Où on les voit : au-dessus du bord de l'île vu d'où l'on regarde. Vue vers l'horizon : dans le ciel. Vue d'ensemble : dans les coins du fond de nuit, derrière l'île. De loin : tout autour de l'île. Vue plongeante de près : rien (on regarde le sol), sauf la lueur de l'aurore.
- Pour essayer : `__game.skyShow('aurora')`, `'shower'`, `'star'` (une étoile filante tout de suite), `'off'`. De jour, la nuit tombe d'un coup (22 h) et le ciel se dégage ; le jeu doit tourner. `__game.nightSky.tonight` donne le programme de la nuit.

## Fonctionnement dans le code
- `Game.frame` : `time.update(dt)` → `gdt` ; `env.update(dt, time, season, cible, gdt, distance)` ; en surface `atmosphere.update(dt, …)` puis `nightSky.update(dt, gdt, time, env, caméra)` et ses annonces (`nightSky.news` → `skyNewsText` → `ui.toast`) ; sous terre et aux Enfers `atmosphere.hideMist()` et rien d'autre (autres scènes). `refreshSeason` (chaque image) : `computeSeason`, teintes du sol par bandes, végétation, neige des routes.
- `Environment.update` : météo (minuteur en temps de jeu, transitions en temps réel), soleil et lune, couleurs, ombres autour du point visé (zone qui s'élargit avec le dézoom, calée sur les texels), lumières des bâtiments, nuages, précipitations. Accès : `weatherKind`, `weatherK`, `wantKind`, `rainK`, `daylight`, `night`.
- Brume : `patchMist` réécrit les morceaux `fog_*` de `THREE.ShaderChunk` au chargement du module ; uniformes partagés `MIST`, `MIST_COL` (objets simples que three ne recopie pas).
- `Atmosphere.update` travaille en **temps réel** (`dt`) : brume, arc-en-ciel et orages continuent en pause. L'éclat d'un éclair ajoute à `hemi` et aux couleurs du ciel après `env.update`.
- `NightSky` :
  - Programme : `nightOf(days, hour)` (avant midi, la nuit de la veille) ; au changement de nuit, `nightShow` avec `coldShare()` (une case sur quatre) et un sel tiré au lancement (`days` repart de 0 à chaque chargement). `force(kind, time)` impose le programme d'une nuit.
  - Coupole centrée sur la caméra, rayon `SKY_R = 900`, au-delà de l'île : l'île la cache (test de profondeur, pas d'écriture), mélange additif. `rimAt` (et son double dans le vertex shader) donne la hauteur angulaire du bord de l'île (cercle de rayon `RIM × N`) vu de la caméra, au cap voulu.
  - Aurore : une bande de `AURORA_SEG × AURORA_ROWS` quads sur tout l'horizon ; chaque sommet porte (cap, hauteur dans la bande), le vertex shader la pose au-dessus du bord de l'île sur `AURORA_H` radians. Le fragment shader dessine deux voiles (`veil`) : bord inférieur ondulant, plis, rayons, vert au pied, violet en haut, liseré rose ; bruit sans couture lu sur un cercle (`ring`). `uFine` saute le second voile quand `gfx.density ≤ 0.5`.
  - Étoiles filantes : réserve de `METEOR_MAX = 24` rubans (4 sommets chacun) refaits sur le processeur à chaque image ; départ tiré dans la part de ciel visible au-dessus du bord (`spawn`, 8 essais, projection à l'écran). Elles volent au temps du jeu, mais deux fois plus vite au plus à ×4 (`fly = min(gdt, dt × 2)`).
- `Glow` : composeur (rendu, bloom, sortie) seulement quand le halo est allumé ; sinon rendu direct.

## Liens avec les autres systèmes
- Simulation : `sim.rain` (humidité des champs), `sim.season`, habitants et faune lisent l'heure, la pluie, la nuit.
- Végétation et sol : `season` (couleurs, feuillage, cultures), `SNOW` et `setSnowMap` ([vegetation-biomes.md](vegetation-biomes.md)).
- Incendies : la foudre (`Atmosphere.onStrike`) ; éruptions et lave rougeoient au halo de nuit.
- Sons : ambiance pluie, vent, grillons la nuit, oiseaux le jour (`audio.update`), tonnerre (`sfxThunder`).
- Interface : icône de météo du HUD (`WEATHER_ICON`), réglages, notifications ([interface.md](interface.md)).

## Pièges et invariants
- Jamais de puissance d'un nombre négatif ni de NaN dans un shader additif : un seul point non fini gagnait toute l'image par le halo. `Glow` filtre ces points, mais il faut les éviter à la source (`x * x` plutôt que `pow(x, 2.0)`).
- Rien ne doit se compiler en cours de partie : les maillages de `NightSky` restent visibles dès le départ et ne dessinent rien (`setDrawRange(0, 0)`) quand le ciel est vide. Un objet qui n'apparaît que plus tard (`visible = false`) se compile à sa première apparition (c'est le cas de l'arc-en-ciel).
- Deux horloges : `Atmosphere` et les transitions de météo en temps réel, `NightSky`, le minuteur de météo et la simulation en temps de jeu. Ce qui doit se figer en pause passe par `gdt`.
- `env.update` refait `hemi` et les couleurs du ciel à chaque image : les teintes ajoutées ensuite (éclair, aurore) ne s'accumulent pas. Garder cet ordre.
- La durée du jour change la longueur des nuits : les cadences d'étoiles filantes passent par `meteorRate`.
- La caméra regarde le plus souvent vers le sol (inclinaison 0,85, minimum 0,25) : un ciel « au-dessus de l'horizon » ne se voit presque jamais. D'où la coupole posée au-dessus du bord de l'île et le bouton « lever les yeux ».

## Pour modifier
- **Plus ou moins d'aurores** : `AURORA_BASE`, `AURORA_COLD`, `COLD_FULL` (`skyNights.ts`), puis les bornes de `tests/cielNocturne.test.ts`.
- **Couleurs ou forme de l'aurore** : `veil` et `main` du fragment shader dans le constructeur de `NightSky` ; hauteur `AURORA_H`, distance au bord dans le vertex shader. Vérifier en jeu à l'horizon, en vue d'ensemble et de loin.
- **Étoiles filantes** : chances `SHOWER`, `SOME`, `LONE`, cadences `METEOR_RATE` (`skyNights.ts`) ; allure (longueur, durée, largeur, éclat, teintes) dans `NightSky.spawn` et `METEOR_COLORS`.
- **Un nouveau spectacle de nuit** : un champ de `NightShow` et son tirage dans `nightShow`, son rendu dans `NightSky.update`, une annonce dans `SkyNews` et `skyNewsText`, la traduction dans `src/i18n/en/misc.ts`, un cas dans `force`.
- **Un nouveau temps** : `WeatherKind` et la table `autoWeather` (`env.ts`), son rendu dans `Environment.update`, son bouton dans les réglages (`ui.ts`), son icône (`WEATHER_ICON`), son effet sonore (`audio.ts`).
- **Changer la longueur des jours ou des nuits** : `dayLen`, `seasonLen`, `NIGHT_SKIP` (`time.ts`) ; tout ce qui suit l'heure suit seul.
