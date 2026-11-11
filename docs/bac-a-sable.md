# Bac à sable

> Fichiers : `src/sim/difficulty.ts` (la difficulté `sandbox` et ses textes), `src/world/world.ts` (`World.sandbox`, `World.missionDone`, `World.unlimited`), `src/sim/sim.ts` (`Sim.setAge`, croissance, conseil), `src/ui/ui.ts` (accueil, choix de la partie, panneau de l'âge, verrous), `src/ui/tutorial.ts` (tutoriel et chapitres coupés), `src/main.ts` (`Game`, lancement), `src/build/startLock.ts` (verrou de départ)
> Tests : `tests/bacASable.test.ts`, `tests/difficulty.test.ts`
> Voir aussi : [difficulte.md](difficulte.md), [ages.md](ages.md), [economie-ressources.md](economie-ressources.md), [besoins-population.md](besoins-population.md), [tutoriel.md](tutoriel.md), [sauvegarde.md](sauvegarde.md), [batiments-catalogue.md](batiments-catalogue.md)

## En bref
Le bac à sable est la troisième difficulté (`sandbox`), à côté de Facile et Normal. On choisit l'âge de départ, tout y est débloqué et gratuit, aucun besoin ne freine le village, et il n'y a ni tutoriel ni conseil. On bâtit comme on veut, et on peut changer d'âge à volonté depuis le panneau de l'âge.
Ce n'est pas un réglage à part : c'est `World.difficulty === 'sandbox'`. Le mode est donc sauvegardé avec la partie, et un seul test (`world.sandbox`) dit si on y est.

## Règles du jeu
- **Lancement** : l'écran d'accueil a une carte « Bac à sable » avec six boutons d'âge (Préhistoire à Futuriste) ; « Jouer en Bac à sable » lance la partie à l'âge choisi. « Recommencer cette carte » (réglages) propose le même choix d'âge.
- **Âge** : la partie commence à l'âge choisi. Le panneau de l'âge (en haut à gauche) ne montre plus de conditions : il liste les six âges, un clic y va, en avant comme en arrière, sans condition.
- **Bâtiments** : tous ceux de l'âge courant et des âges précédents sont disponibles, y compris ceux que débloque une expédition. Plus de bâtiment préalable exigé (`reqKind`), plus de verrou « posez d'abord la place du village ».
- **Ressources** : infinies. Aucun coût n'est prélevé, la barre affiche « ∞ » (bois, pierre, minerai, briques, carburant). L'équipement des expéditions et le recrutement sont gratuits aussi.
- **Besoins** : aucun ne freine le village. Il grandit dès qu'il reste des places (logement). Pas de famine, pas de départs, pas de ralentissement après un manque.
- **Portail** : dès l'Antiquité (au départ ou en changeant d'âge), le portail s'ouvre de lui-même, sans l'expédition « Le portail de l'autre rive » ; la carte du choix (affronter les démons ou refermer le portail) arrive aussitôt. Une fois ouvert, il le reste, même si l'on revient à la Préhistoire. L'expédition reste jouable.
- **Coupé** : le tutoriel, le conseil du moment (la pastille est cachée), les bulles d'aide militaire (`warTips.update` n'est pas appelé), la liste « nouveaux bâtiments » au changement d'âge, l'astuce du portail à l'Antiquité.
- **Marque** : le panneau de l'âge porte « Bac à sable » et sa jauge reste pleine ; le menu « Reprendre mon village » et les réglages affichent le mode.
- **Fin de partie** : la fusée reste possible (ses expéditions sont débloquées comme les autres) ; elle ne dépend de rien d'autre.

## Fonctionnement dans le code
**Le test**
- `World.sandbox` (getter) : `difficulty === 'sandbox'`. C'est le seul test à écrire ; ne comparez pas `difficulty` à la main.
- `World.missionDone(id)` : « cette expédition a-t-elle débloqué son bâtiment ? », vrai au bac à sable. À utiliser à la place de `world.exp.done.includes(id)` pour un déblocage (pas pour savoir si l'expédition a vraiment eu lieu).
- `World.unlimited` : `rulesOf(difficulty).unlimited ?? réglage « Ressources »` ; la table `DIFFICULTY.sandbox` vaut `unlimited: true`. Tout le code d'économie passe déjà par lui.

**Lancement et âge de départ**
- `ui.ts` › `showMenu` : la carte du mode `sandbox` contient les boutons `.ageBtn` ; l'âge choisi (`startAge`) est passé à `host.start(map, 'new', seed, difficulty, age)`.
- `ui.ts` › `chooseDifficulty` : même choix (zone `.pickAges`, visible seulement si le bac à sable est coché) ; rend `{ d, age }`. `Game.newGame(difficulty, age)` écrit `carte|fresh|difficulté|âge` dans `sessionStorage` (clé `AUTOSTART`) avant de recharger la page.
- `main.ts` › `boot` relit cette clé et appelle `start(…, age)`, puis `new Game(map, mode, seed, difficulty, startAge)`. Le constructeur de `Game` règle `sim.age` (borné aux âges existants) quand `w.sandbox`, seulement pour une partie neuve.
- `Sim.update` : les fondateurs (quatre habitants à la pose de la place) arrivent à tout âge au bac à sable, pas seulement à la Préhistoire.

**Changer d'âge**
- `Sim.setAge(n)` : sans effet hors bac à sable ; borne `n`, recalcule, remet `world.ageBase`, puis appelle `onAgeUp` (même chemin que le vrai passage d'âge : bannière, garnison, rendu).
- `ui.ts` › `UI.update` : en bac à sable, `#ageReq` liste des `button[data-setage]` ; `#agePanel` gère le clic (`closest('[data-setage]')`) et appelle `sim.setAge`.
- `Sim.ageProgress` rend `null` au bac à sable : plus de conditions, `Sim.ready` est faux, `Sim.advance` ne fait rien.
- `BuildingView.update` (`render/buildings.ts`) fait évoluer chaque bâtiment, un à la fois, vers `targetAge` : l'âge du village, jamais sous le `minAge` de sa sorte. En redescendant, les bâtiments redescendent donc aussi (l'arène redevient champ de joute au Médiéval) ; une sorte trop récente pour l'âge choisi (le Colisée à la Préhistoire) garde son premier modèle. Les routes et les places suivent l'âge choisi. Hors bac à sable, l'âge ne baisse jamais : rien ne change.

**Déblocages**
- `ui.ts` › `UI.lockOf` : après l'âge minimum et maximum, le verrou de départ et le tutoriel, un `if (h.world.sandbox) return null` saute `reqMission` et `reqKind`.
- `ui.ts` : `lockGo` (clic vers l'expédition), les améliorations de la fiche d'un bâtiment (`missionDone`, `reqKind`) et `showNewAge` suivent la même règle.
- `render/upgradeBadges.ts` › `upgradable` : les flèches d'amélioration utilisent `missionDone`.
- `build/startLock.ts` › `isStart` : `buildings.size === 0 && !w.sandbox` ; `startRefusal` en dépend.

**Portail**
- `Sim.update` : au bac à sable, âge ≥ 1 et île présente → `world.portalWoken = true` (sauvegardé, `portalWoken` dans `World.toJSON`). `World.portalOpen` = île et (`portalWoken` ou `exp.done` contient `portal`). `exp.done` n'est pas touché.
- `War.active` devient vrai, `pve` vaut `ask`, et `Game.stepWar` ouvre la carte du choix une fois (`choiceSeen`), comme après l'expédition.

**Besoins et conseil**
- `Sim.canGrow` : au bac à sable, `housing.ok` seul.
- `DIFFICULTY.sandbox` : `famine: 0`, `recoverT: 0`, donc `Sim.hardship` ne fait rien.
- `Sim.computeMessage` : renvoie tout de suite « Bac à sable : … » avec `messageKind` vide ; `ui.ts` › `renderMessage` cache la pastille (`el.hidden`).

**Tutoriel**
- `main.ts` : `new Tutorial(ui, host, !save, w.sandbox)`. Avec `off`, le constructeur sort avant de lire ou d'écrire l'état (`readState` / `writeState`), `show` ne fait rien, et les réglages disent « Pas de tutoriel au bac à sable ». Le choix du joueur pour les autres parties n'est jamais touché.

**Sauvegarde**
- `World.toJSON` / `World.fromJSON` portent `difficulty` (et `diffV`) ; l'âge est dans `SaveData.age`. Aucun champ de plus : le mode n'a pas de clé propre.

## Liens avec les autres systèmes
- **Difficulté** : le bac à sable est une ligne de `DIFFICULTY` ; voir [difficulte.md](difficulte.md). Il reprend l'équilibre des Enfers « legacy » (`hellBalance.ts` › `balanceOf`) et 2 troupes d'invasion (`war.ts` › `invasionTroops`).
- **Économie** : coûts nuls via `priceIn` (`economy.ts`), `gear.ts`, `recruitPlan.ts`, `army.ts`, `hellBase.ts` (tous testent `unlimited`).
- **Expéditions** : elles restent jouables (gains, récits). Leurs déblocages sont déjà acquis ; ne comptent pas comme « réussies » (`exp.done`), donc aucun effet sur les trophées ni sur le compte des missions.
- **Sauvegarde** : un village déjà sauvé au bac à sable avant ce chantier est lu tel quel ; il gagne simplement les déblocages.

## Pièges et invariants
- **Ne marquez pas les missions comme faites** pour tout débloquer : cela fausserait trophées, récompenses, perks et fin de partie. Passez par `missionDone`.
- Tout nouveau verrou (expédition, bâtiment préalable, âge, étape de tutoriel) doit être levé au bac à sable, sauf `minAge` et `maxAge`, qui définissent « les âges disponibles ».
- Descendre d'âge ne rajeunit pas les bâtiments posés : ils gardent leur `age`. Seuls les nouveaux se posent à l'âge choisi.
- `Sim.setAge` doit rester la seule porte de changement d'âge libre ; elle refuse hors bac à sable.
- Le tutoriel est un état global du navigateur, pas de la partie : un bac à sable ne doit ni le lire ni l'écrire.
- Le texte « ∞ » vient de `World.unlimited` (aussi vrai en Facile avec le réglage « Ressources illimitées ») : les deux cas partagent l'affichage, mais seul `world.sandbox` coupe conseils, tutoriel et besoins.
- Le changement d'âge vide la pile annuler / refaire (`onAgeUp`) : voulu.

## Pour modifier
**Une nouvelle fonctionnalité doit respecter le bac à sable.** Posez-vous trois questions.
1. Elle coûte quelque chose ? Passez par `priceIn` / `world.unlimited`, jamais par un test de difficulté.
2. Elle se débloque (expédition, bâtiment, étape) ? Testez `world.sandbox` ou `world.missionDone(id)` et rendez-la disponible.
3. Elle donne un conseil, un tutoriel, un blocage ou une pénalité (famine, départs, ralentissement) ? Coupez-la avec `world.sandbox`.
Le test est toujours `world.sandbox` (ou `sim` / `host.world.sandbox` depuis l'interface). Si la fonction n'a pas le monde sous la main, passez un booléen `sandbox` ou un objet avec `sandbox?: boolean` (comme `isStart`) : cela garde les tests simples.
Ajoutez un cas dans `tests/bacASable.test.ts`.

**Ajouter un âge** : aucun changement ici, le choix de départ et le panneau lisent `AGES`.
**Changer les textes du mode** : `RAW` dans `difficulty.ts` (`points`, `summary`, `startAge`) puis l'anglais dans `src/i18n/en/menu.ts`.
**Changer ce qui est coupé** : cherchez `sandbox` dans `src` ; chaque coupure est un test isolé et commenté.
