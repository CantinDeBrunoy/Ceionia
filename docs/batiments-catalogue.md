# Catalogue des bâtiments

> Fichiers : `src/build/catalog.ts` (`KINDS`, `UPGRADES`, tailles, rayons), `src/sim/economy.ts` (prix), `src/ui/ui.ts` (`lockOf`, vignettes du menu Bâtir), `src/ui/icons.ts` (`KIND_ICON`), `src/i18n/en/catalog.ts` (anglais), `src/render/models.ts` (modèles 3D)
> Tests : `tests/place.test.ts`, `tests/verrouDepart.test.ts`, `tests/fiche.test.ts`, `tests/voletMilitaire.test.ts`, `tests/i18n.test.ts`
> Voir aussi : [placement-construction.md](placement-construction.md), [rendu-modeles.md](rendu-modeles.md), [interface.md](interface.md), [traduction.md](traduction.md), [ages.md](ages.md), [economie-ressources.md](economie-ressources.md), [besoins-population.md](besoins-population.md), [difficulte.md](difficulte.md)

## En bref
`KINDS` (`catalog.ts`) est la table de tous les genres de bâtiments, indexée par `KindId` (65 genres). Un genre donne sa taille, son âge minimum, son rayon dans le menu, ses noms par âge et ses apports (logement, vivres, eau, travail, bien-être, soins) par âge. Un `Building` posé ne stocke que son genre, sa case, sa rotation et un âge d'affichage : tout le reste se lit dans le catalogue. Les règles de terrain sont ailleurs (`World.canPlace`, voir [placement-construction.md](placement-construction.md)).

## Règles du jeu
- **Âges** : index 0 à 5 (Préhistoire, Antiquité, Médiéval, Industriel, Moderne, Futuriste, `AGES`). Un bâtiment se pose à partir de `minAge`. Les bâtiments du village changent de modèle tout seuls quand l'âge monte (voir plus bas).
- **Tailles** (`size`, en cases) : 1 (maison, puits, lampadaire, ferme), 2 (atelier, école, soins, temple, moulin…), 3 (place, raffinerie, port, stade, cirque, arène, zoo, arcologie…), 4 (aéroport, cosmodrome). Le champ `size` est la taille actuelle ; `Building.small` marque un ancien bâtiment resté à l'ancienne taille (`smallSize`, `sizeOf`).
- **Âge maximum** (`maxAge`) : seuls `acropolis`, `forum` et `senate` l'ont (1) : on ne les bâtit plus après l'Antiquité (le menu les masque, `lockOf` refuse avec « c'est trop tard »). Ceux déjà posés restent et évoluent.
- **Déblocages** :
  - `reqMission` : expédition à réussir (`pen`, `stable`, `apiary`, `mine`, `refinery`, `baths`, `tavern`, `circus`, `arena`, `carworks`, `aerodrome`, `shipyard`, `observatory`, `watchtower`). `lockOf` renvoie « Débloqué par l'expédition … » ; pour `portal`, le texte parle de la faille violette.
  - `reqKind` : un bâtiment à avoir déjà (`station` veut `terminal`, `terminal` veut `brickworks`, `carworks` veut `refinery`, `barracks`/`wall`/`gate` veulent `watchtower`). Le test se fait avec `Sim.built`, qui compte aussi les améliorations (`lineOf`).
  - Tutoriel : `tutorial.lock(k)` verrouille tout sauf l'étape en cours pendant les premières étapes (voir [tutoriel.md](tutoriel.md)).
  - Village vide : seule la place du village (`START_KIND = 'gather'`) est permise (voir [placement-construction.md](placement-construction.md)).
- **Limites de nombre** : le catalogue n'en fixe aucune (pas de « deux écoles au plus » : à vérifier si une règle de ce genre existe ailleurs ; je n'en ai trouvé aucune). Les maxima viennent du terrain (`ZONED`) et des besoins (un second lieu de soins ne sert que si le village grandit).
- **Prix** (`costOf`, `economy.ts`, version « neuf » via `priceIn`) :
  - sandbox (`w.unlimited`) : gratuit ;
  - Facile (`price: null`) : seuls les genres de taille 2 et plus coûtent, `bois = 8 + 4a`, `pierre = 6 + 4a` (`a = max(âge, minAge)` ; enclos et écurie : pierre `2 + a`) ; la place du village est gratuite malgré ses 3 × 3 ;
  - Normal : tout coûte, `bois = round(taille × (5 + 3a))`, `pierre = round(taille × (3 + 3a))` (enclos : pierre `1 + a`) ; un pan de rempart compte `0,34` ; la place du village compte pour 1 ; le premier bûcheron et le premier pierrier sont gratuits (`PRODUCERS`) ;
  - briques en plus (`BRICK_PRICE` : gare 10, gare centrale 30, usine auto 20, raffinerie 30 ; ×1,5 en Normal).
  Une amélioration coûte le prix du nouveau bâtiment, entier.
- **Rayons du menu** (`BuildCat` : `home`, `prod`, `service`, `life`, `war` ; `BUILD_CATS`) et **groupes** (`BUILD_SUBS`, `KIND_SUB`). Les groupes ne servent qu'à ranger les vignettes (aucun effet sur le jeu ni la sauvegarde). Rayon `war` : défense, remparts.
- **Ordre du menu** : `KIND_ORDER` (64 genres). Seul `manor` en est absent : on ne l'obtient qu'en améliorant une maison.
- **Évolutions** (`UPGRADES`, bouton « Améliorer » de la fiche) : maison → manoir, puits → château d'eau, gare centrale → gare maglev, ponton → port, atelier → usine auto, ferme → ferme verticale. `lineOf(k)` donne un genre et toutes ses améliorations (une maison devenue manoir compte comme une maison).

## Fonctionnement dans le code
- **Champs de `KindDef`** : `id`, `size`, `minAge`, `maxAge?`, `icon` (emoji, gardé pour l'anglais et les messages), `cat`, `names[6]`, `desc`, `housing/food/water/jobs/joy/health` (tableaux par âge), `perk?` (texte de la fiche), `reqMission?`, `reqKind?`.
- **Tableaux par âge** : une boucle en bas de `catalog.ts` complète chaque tableau (`names`, `housing`, … ) jusqu'à `AGES.length` en répétant la dernière valeur. Un nom vide (`''`) signifie « pas encore dispo à cet âge » : le code lit toujours `names[Math.max(âge, minAge)]`.
- **Âge d'un bâtiment** : `Building.age` est l'âge du modèle affiché. À la pose, c'est l'âge du village (`ToolController.tryPlace`) ; ensuite `BuildingView.update` (`render/buildings.ts`) lance une animation « evolve » pour un bâtiment à la fois (toutes les 0,06 s) et fixe `b.age = worldAge` au milieu de l'animation. La simulation lit `b.age` (`Sim.recalc`) : les apports d'un bâtiment augmentent donc à mesure que son animation passe.
- **Taille qui change** : `OLD_SIZE`/`smallSize` (la place du village était 1 × 1) et `World.growLarge` + `GREW`/`GREW3` (`world.ts`) font grandir, au chargement d'une ancienne sauvegarde, les bâtiments devenus plus grands. Sans place libre, `small: true` et nouvel essai au chargement suivant.
- **`hasDoor`** : pas de porte ni de chemin pour `lamp`, `gather`, `wall`, `gate`.
- **Fiche et vignettes** (`ui.ts`) : `lockOf(k)` donne la raison du verrou (âge, âge max, village vide, tutoriel, expédition, bâtiment requis) ; `renderItems` ne montre que `minAge <= âge + 1` et pas les `maxAge` dépassés, les verrouillés après les libres ; `givesOf`/`GIVES` fabriquent les puces (« +14 habitants »).
- **Textes** : `i18n/data.ts` appelle `localize(d, ['names','desc','perk'])` pour chaque genre ; la clé de traduction est le texte français exact.

## Liens avec les autres systèmes
- Besoins et population : [besoins-population.md](besoins-population.md) (`Sim.recalc` additionne les tableaux par âge).
- Prix et production : [economie-ressources.md](economie-ressources.md) (`YIELD`, `BRICK_PRICE`).
- Arène (`arena`, 3 × 3, dès l'Antiquité, débloquée par l'expédition `pugilat`) : Colisée, champ de joute, arène de lutte, palais de la boxe, arène des robots ; modèle dans `render/arena.ts`. Elle remplace les anciens jardins (outil retiré, `VEG_GARDEN` effacé au chargement, voir [sauvegarde.md](sauvegarde.md)).
- Remparts : [remparts.md](remparts.md) (`wall`, `gate`, `isRampart`).
- Modèles 3D : [rendu-modeles.md](rendu-modeles.md) (`getModel(kind, age, opts)`).
- Âges et missions : [ages.md](ages.md), [expeditions.md](expeditions.md).

## Pièges et invariants
- Les enregistrements `Record<KindId, …>` (`KINDS`, `KIND_SUB`, `KIND_LABEL`, `KIND_ICON`) sont exhaustifs : TypeScript refuse un genre oublié. `KIND_ORDER`, `ZONED`, `UNLOCK_NOTE` (`ui.ts`), `GREW` (`world.ts`), `BRICK_PRICE`, `YIELD` et `YARD` (`render/roads.ts`) sont partiels : un oubli passe sans erreur.
- Un identifiant de genre est écrit dans la sauvegarde (`[kind, x, z, rot, auto, age, small?]`) : ne jamais renommer un `KindId` ; un genre inconnu est ignoré au chargement (`World.fromJSON`). Voir [sauvegarde.md](sauvegarde.md).
- Ne pas changer `size` d'un genre existant sans entrée de migration (`OLD_SIZE`, `GREW`) : les anciennes emprises se chevaucheraient.
- `acropolis`/`forum`/`senate` ont des noms pour les âges 2 à 5 alors qu'on ne les bâtit qu'à l'âge 1 : c'est voulu (ils évoluent), ne pas les « nettoyer ».
- `desc` et `perk` ne doivent pas répéter la phrase de déblocage (déjà affichée par `lockOf`) : commit « Cirque : la fiche ne répète plus la phrase de déblocage ».
- `canPlace` ne vérifie ni l'âge, ni les expéditions, ni `reqKind` : seule l'interface (`lockOf`) le fait. Un test ou un outil qui appelle `World.place` directement contourne tous les verrous.

## Pour modifier
**Ajouter un bâtiment de bout en bout**
1. `catalog.ts` : ajouter l'identifiant au type `KindId`, une entrée dans `KINDS` (taille, `minAge`, `cat`, `names` sur 6 âges, apports, `perk`, `reqMission`/`reqKind` si besoin), dans `KIND_ORDER`, `KIND_SUB` et `KIND_LABEL`. S'il s'obtient par amélioration, ajouter une ligne à `UPGRADES`.
2. Terrain : si le bâtiment a une contrainte, la coder dans `World.canPlace` (`world.ts`) et la décrire dans `ZONED` (`zones.ts`) pour que la surbrillance et le message « Aucun emplacement » fonctionnent. Zones de mer : ajouter à `SEASIDE`.
3. Modèle : un `case` dans le `switch` de `getModel` (`render/models.ts`), plus `futureModel` pour l'âge 5 (sinon l'âge 4 est réutilisé, rehaussé), éventuellement `IMPORTED`, `UPSCALE`, `YARD` (cour devant, `render/roads.ts`). Voir [rendu-modeles.md](rendu-modeles.md).
4. Menu : une icône dans `KIND_ICON` (`ui/icons.ts`, tracé SVG dans `P` si nouvelle).
5. Traduction : noms, `desc`, `perk` et `KIND_LABEL` dans `src/i18n/en/catalog.ts` (clé = français exact) ; lancer `tests/i18n.test.ts`.
6. Besoins : renseigner `housing/food/water/jobs/joy/health` ; si le bâtiment produit des ressources, `YIELD` (`economie-ressources.md`) ; si un âge ou une mission l'exige, `AGES[].reqKinds` ou `requires.kinds` de la mission.
7. Prix : `BRICK_PRICE` si briques ; sinon `costOf` s'applique seul.
8. Tests : un test de pose (`World.canPlace`, `tests/place.test.ts` en modèle), `npx tsc --noEmit`, `npx vitest run`.

**Changer un coût** : `costOf` (`economy.ts`) pour la formule, `DIFFICULTY.normal.price` (`sim/difficulty.ts`) pour les coefficients ; l'affichage (`costLabel`) suit seul.

**Faire grandir un bâtiment existant** : changer `size`, ajouter son genre à `GREW` (ou `GREW3`) dans `world.ts`, vérifier `placement.ts` (`footprintOrigin` gère les tailles 1 à 4).
