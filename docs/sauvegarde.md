# Sauvegarde

> Fichiers : `src/save/save.ts` (format `SaveData`, `Settings`, clés `localStorage`, validation, export / import), `src/world/world.ts` (`World.toJSON` / `fromJSON`, `growLarge`), `src/main.ts` (`Game.buildSave`, `saveNow`, `importFile`, constructeur), `src/sim/missions.ts` (`readExpState`), `src/sim/difficulty.ts` (`readDifficulty`), `src/world/portal.ts` (`readPortal`), `src/sim/war.ts` (`War.save` / `load`)
> Tests : `tests/world.test.ts` (anciennes sauvegardes, `lit une ancienne sauvegarde…`), `tests/portail.test.ts`, `tests/place.test.ts`, `tests/difficulty.test.ts`, `tests/savedAgo.test.ts`, `tests/i18nOublis.test.ts` (messages d'erreur)
> Voir aussi : [architecture.md](architecture.md), [difficulte.md](difficulte.md), [tutoriel.md](tutoriel.md), [monde-carte.md](monde-carte.md), [armee-combat.md](armee-combat.md)

## En bref
Une partie se sauve dans le `localStorage` du navigateur, en un seul JSON, **un emplacement par carte** (il n'y a qu'une carte : le Continent, id 3). La sauvegarde est écrite toute seule toutes les 15 s, quand l'onglet se cache, à la fermeture de la page et à la demande. Les anciennes parties doivent toujours se charger : chaque champ est relu avec une valeur par défaut et une validation, il n'y a pas de numéro de version à migrer (`v` vaut toujours 1).

## Règles du jeu
- Reprise : l'écran d'accueil propose « Reprendre mon village » avec le mode, l'âge, la population et « sauvegardé il y a 5 min » (`savedAgo`).
- Une partie neuve sur une carte qui a déjà une sauvegarde demande une confirmation (elle l'écrase). « Recommencer cette carte » (Réglages › Partie) efface l'emplacement (`deleteSlot`), propose la difficulté, recharge la page.
- Export : bouton Exporter (Réglages › Partie), fichier `ceionia-carte{id+1}-{date}.json` (pour le Continent : `ceionia-carte4-…`, l'id est 3). Import : bouton Importer (écran d'accueil et Réglages) ; il **remplace** l'emplacement de la carte du fichier, puis la partie se charge.
- Une expédition en route n'est pas sauvegardée (`ExpState.riding` le dit) : à vérifier ce que devient l'équipement qu'elle emportait.

## Fonctionnement dans le code

### Ce qui est sauvé (`SaveData`, `save/save.ts`)
```
{ v: 1, map, seed, world, age, pop, seasonT, hour, settings, savedAt }
```
- `map` : id de la carte ; `seed` : graine du continent ; `age`, `pop` : âge du village et population (flottant) ; `seasonT`, `hour` : date de jeu ; `savedAt` : `Date.now()`.
- `settings` (`Settings`) : `dayLen`, `seasonLen`, `speed`, `musicVol`, `sfxVol`, `ambVol` (volume des ambiances ; absent = 0,7), `music`, `sfx` (sons allumés, lu seulement si `sfxChosen`), `sfxChosen` (le joueur a lui-même allumé ou coupé les sons ; absent = sons allumés, car les anciennes sauvegardes notaient `sfx: false` sans choix du joueur), `quality` (`auto|high|medium|low`), `autoLevel` (palier atteint du réglage Auto), `disasters`, `autoRoads`, `unlimited`, `hideUpBadges`. Construit par `Game.settings()`.
- `world` = `World.toJSON()` : `n` (côté de la carte), `gen` (version de génération du climat), `heights` (centièmes, entiers), `roads` (cases), `veg` (paires case / type), `biomes` (peinture, paires), `buildings` (tuples `[sorte, x, z, rot, auto, âge, 1 si « petit »]`), `nextId`, `plaza3`, `torches`, `basalt` (lave refroidie, paires en %), `ash`, `ore`, `wood`, `stone`, `crude`, `fuel`, `brick`, `oil` (gisements), `exp` (`ExpState` : missions faites, équipement, fabrication, bonus…), `difficulty` et `diffV`, `ageBase`, `lines` (lignes de train), `linesAuto`, `portal` (île), `isleGuard`, `war` (armée, faction et carte des Enfers, base avancée, roi, invasion, choix PvE…), `curves` (routes libres).
- **Pas sauvé** : la vue de la caméra, la pause (`time.paused`), les jours écoulés (`time.days`), la météo, l'outil et les piles annuler / rétablir, les habitants (ils sont recréés à partir de la population et des bâtiments), les animaux, les véhicules, les incendies en cours, les expéditions en route, le mode de vue (on revient toujours en surface), la position des trains (relancés depuis les lignes).

### Quand
- `Game.saveNow()` (n'écrit que si `running`) : minuterie de 15 s dans `frame` (`saveTimer`), `visibilitychange` (onglet caché), `pagehide`, bouton Sauvegarder, `exitUnder`, `toMenu`, changement de langue.
- Les réglages seuls : `applySettings()` (`saveSettings`, clé séparée) à chaque curseur ou bouton, et à chaque changement de palier du réglage Auto.
- `saveSlot` rend `false` si le navigateur refuse (quota plein, stockage bloqué) ; `saveNow` ignore ce résultat : **aucun message au joueur**.
- Coût : toute la carte est sérialisée à chaque sauvegarde (`heights` : (192+1)² nombres) ; non mesuré ici, voir [chargement-performances.md](chargement-performances.md).

### Clés `localStorage`
| Clé | Contenu | Défini dans |
|---|---|---|
| `village-lowpoly:v1:slot:{carte}` | la partie (`SaveData`) | `save/save.ts` (`KEY`) |
| `village-lowpoly:v1:settings` | les réglages (`Settings`), copie globale | `save/save.ts` (`SETTINGS_KEY`) |
| `village-lowpoly:v1:tutorial` | `{ on, step }` : tutoriel guidé activé et étape | `ui/tutorial.ts` (`KEY`) |
| `ceionia.aides` | `'1'` conseils du moment affichés, `'0'` masqués | `ui/ui.ts` (`help`), `ui/warTips.ts` (`HELP_KEY`) |
| `ceionia.aidesMilitaires` | liste des bulles du volet militaire déjà vues | `ui/warTips.ts` (`SEEN_KEY`) |
| `ceionia.bannieres` | clés des bannières « première fois » déjà montrées | `ui/notifs.ts` (`BANNER_KEY`) |
| `ceionia.lang` | `fr` ou `en` | `i18n/index.ts` (`LANG_KEY`) |

Le préfixe `village-lowpoly` est l'ancien nom du jeu : **ne pas le renommer** (les parties existantes disparaîtraient). `sessionStorage` : `village-lowpoly:autostart` (`AUTOSTART`) transmet « carte|continue » ou « carte|fresh|difficulté » d'un chargement de page au suivant.

### Lecture d'une sauvegarde
1. `loadSlot(carte)` : `JSON.parse` puis `validate` ; toute exception rend `null`. `validate` exige `v === 1`, `map` numérique, `world.heights` tableau, une carte qui existe (`mapDef`) et `world.n` parmi les tailles connues (`MapDef.sizes`) ; sinon erreur lisible (« Sauvegarde d'une ancienne version (carte plus petite) », « …carte qui n'existe plus… »).
2. Dans le constructeur de `Game` : `world.mapId/seed`, `world.fromJSON(save.world)`, `sim.age`, `sim.pop`, `time.seasonT`, `time.hour`, `addDefaultDecor(w, seed)` (rajoute grottes, failles, épaves et **gisements de pétrole** à une carte qui n'en a pas : c'est ainsi que les anciennes parties en reçoivent), `war.load(w.war)`. Si cela jette, `newWorld(…, graine par défaut)` : une partie neuve silencieuse.
3. Réglages : `loadSettings()` puis ceux de la sauvegarde par-dessus.

`World.fromJSON` relit chaque champ avec un défaut :
- bois et pierre absents → `START_WOOD`, `START_STONE` ; minerai, brut, carburant, briques : `max(0, +x || 0)`.
- `gen` absent ou ≤ 1 → `GEN_FIXED` (le climat d'avant le plan du continent).
- bâtiments : les sortes inconnues sont **sautées** et les numéros sont **réattribués** à la suite (`id` ≠ ancien `id`) ; c'est pourquoi les lignes de train sauvent des **rangs** de bâtiment (`s`), pas des numéros. Le château devient « gare centrale » s'il servait d'arrêt à l'âge industriel.
- `growLarge` : les bâtiments devenus plus grands depuis (2 × 2, place 3 × 3) s'étendent sur une place libre, sinon restent « petits » (`small`) et réessaient au chargement suivant ; `plaza3` marque les parties à place 3 × 3.
- monde souterrain retiré : `claimed`, `mined`, `dug`, `digs` sont ignorés.
- jardins retirés (l'arène les remplace) : les cases `VEG_GARDEN` (3) de `veg` redeviennent de l'herbe (0) dans `World.fromJSON`.
- `exp` : `readExpState` (filtre les missions et l'équipement inconnus, migre « le monstre des mers » vers kraken et mégalodon, marque `sea` pour les parties d'avant le volet maritime).
- `difficulty` : `readDifficulty(valeur, diffV)` (sans `diffV`, « normal » devient « easy » et « challenge » devient « normal »).
- `ageBase` absent → `{}` ; `portal` : `readPortal` (abîmé → pas d'île) ; `isleGuard` défaut 0 ; `curves` filtrées ; `war` : objet ou `null`, relu par `War.load` (champs tolérants ; une invasion `coming` en cours devient `ready` ; sans état d'invasion ou de PvE, la partie est dite « legacy » et jamais bloquée).

### Export / import
`exportSave` : `Blob` JSON + lien temporaire. `readSaveFile` : `validate(JSON.parse(texte))`. Depuis le jeu, `Game.importFile` écrit l'emplacement puis recharge la page ; depuis le menu, `saveSlot` puis `start(carte, 'continue')`. Une erreur s'affiche (« Import impossible : … ») sans rien écraser (la validation vient avant l'écriture).

## Liens avec les autres systèmes
- Chaque système qui garde un état durable le met dans `World` (donc dans `toJSON`) ou dans `world.war` / `world.exp`. Un état gardé seulement dans un objet de vue est perdu au rechargement.
- Tutoriel, aides, bannières et langue sont **par navigateur**, pas par partie : une partie importée sur un autre navigateur ne rapporte pas ces états.

## Pièges et invariants
- **Ne jamais jeter une sauvegarde pour un champ inconnu ou manquant** : valeur par défaut, `filter` des identifiants connus, `Number.isFinite`. Un `throw` dans `fromJSON` après son premier test laisse un monde à moitié rempli (le repli `newWorld` repart d'un monde déjà touché).
- Une sauvegarde illisible ou refusée par `validate` fait démarrer une **partie neuve** (le menu ne propose alors pas « Reprendre »), et la première sauvegarde automatique, 15 s plus tard, écrase l'ancienne. Aucun avertissement.
- **Taille de carte** : une partie garde la sienne (`world.n`, relue avant de bâtir le monde : `playSize` dans `main.ts` › `start`). Agrandir la carte des nouvelles parties, c'est changer `MapDef.size` et ajouter la taille à `MapDef.sizes` sans retirer les anciennes. Les cartes de 48 et 96 d'autrefois restent refusées.
- Les `id` de bâtiment ne sont pas stables d'une sauvegarde à l'autre : ne jamais en garder un dans un champ sauvegardé sans le convertir en rang (voir `lines`).
- Les paires et tuples sont positionnels : ajouter une valeur **à la fin** d'un tuple (comme le 7e élément `small` des bâtiments), jamais au milieu.
- Quota : le `localStorage` fait environ 5 Mo ; la sauvegarde d'un grand village approche-t-elle de cette limite ? À vérifier.
- `time.days` n'est pas sauvé (repart de 0) ; la pause non plus (on reprend en marche).
- Les deux clés `ceionia.aides` ont des défauts opposés : l'interface lit « absent = conseils masqués » (`=== '1'`), `warTips.helpAllowed` lit « absent = bulles permises » (`!== '0'`). À harmoniser si cela gêne.
- L'état « partie neuve ou reprise » vient de `!save` : `Tutorial` ne démarre qu'à une partie neuve.

## Pour modifier
**Ajouter un champ à la sauvegarde sans casser les parties existantes**
1. Déclarer le champ sur `World` (ou dans `ExpState`, `WarSave`…) avec sa valeur par défaut d'une partie neuve.
2. L'écrire dans `World.toJSON` (au même niveau que ses voisins ; les tableaux d'entiers pour rester compact).
3. Le relire dans `World.fromJSON` (ou `readExpState`, `War.load`) : valeur absente → défaut ; type, bornes et identifiants vérifiés ; jamais d'exception. Si une ancienne partie doit recevoir une valeur calculée (comme les gisements), la calculer au chargement (`addDefaultDecor` ou équivalent).
4. Un réglage du joueur : l'ajouter à `Settings` (champ optionnel), à `Game.settings()`, à sa lecture dans le constructeur de `Game` (`settings.x ?? défaut`), et à `openSettings` ([interface.md](interface.md)).
5. Test : fabriquer le JSON d'une partie **sans** le champ (`world.toJSON()` puis `delete d.champ`) et vérifier `fromJSON` ; puis un aller-retour `toJSON` → `fromJSON` (modèles : `tests/world.test.ts`, `tests/place.test.ts`).
6. Changer la forme d'un champ existant : garder la lecture de l'ancienne forme (comme `readDifficulty` avec `diffV`) ; ne bumper `v` que pour une rupture totale, `validate` refuserait les anciennes.
