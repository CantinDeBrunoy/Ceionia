# Traduction (français / anglais)

> Fichiers : `src/i18n/index.ts` (`tr`, `localize`, `plural`, langue, dictionnaires), `src/i18n/data.ts` (localise le catalogue, les âges, les saisons, les missions), `src/i18n/format.ts` (`fmtNum`), `src/i18n/en/*.ts` (les dictionnaires anglais, un par zone), `src/i18n/README.md` (convention détaillée)
> Tests : `tests/i18n.test.ts`, `tests/i18nOublis.test.ts`, `tests/i18nMissions.test.ts`, `tests/i18nEquipement.test.ts`
> Voir aussi : [interface.md](interface.md), [architecture.md](architecture.md), [sauvegarde.md](sauvegarde.md), et `src/i18n/README.md` (la référence : lire d'abord ce fichier-ci, puis celui-là pour le détail)

## En bref
Le français est la **langue source** : le code garde ses textes français et les enveloppe de `tr('texte français')`. En anglais, `tr` cherche ce texte exact dans une `Map` fusionnée des dictionnaires et rend l'anglais ; si l'entrée manque (ou en français), il rend le texte tel quel. Rien ne casse jamais par manque de traduction. Il n'y a que deux langues (`LANGS = ['fr', 'en']`).

## Règles du jeu
Côté joueur : un sélecteur FR / EN à l'écran d'accueil et dans Réglages › Partie. La langue est retenue dans le navigateur (`localStorage`, clé `ceionia.lang`). Au premier lancement : la langue du navigateur si c'est `fr` ou `en`, sinon `fr`. En jeu, changer de langue **sauvegarde la partie puis recharge la page**, qui reprend la partie dans la nouvelle langue (`AUTOSTART`, voir [architecture.md](architecture.md)). À l'accueil, l'écran est redessiné à chaud.

## Fonctionnement dans le code

### Les fonctions (`index.ts`)
| Fonction | Rôle |
|---|---|
| `tr(fr, params?)` | traduit un littéral ; `{nom}` remplacés par `params` (un `{nom}` sans valeur reste tel quel : `fmt`). `trf` en est un alias |
| `trs(liste)` | traduit chaque texte d'une liste |
| `plural(n, un, plusieurs)` / `nplural(n, un, plusieurs)` | singulier ou pluriel selon la langue : en français 0 et 1 sont au singulier, en anglais seul 1 l'est ; `nplural` ajoute le nombre. Les deux formes françaises sont deux entrées du dictionnaire |
| `colon()` | le deux-points de la langue : ` : ` en français (espace avant), `: ` en anglais |
| `pct(n)` | « 20 % » en français, « 20% » en anglais |
| `isEnglish()`, `getLang()` | tester la langue (pour les articles, les prépositions : `zoneThe`, `zoneOf` dans `world/hell.ts`) |
| `setLang(l, persist = true)` | change la langue, la mémorise, met `<html lang>` à jour, prévient les abonnés ; sans effet si elle ne change pas |
| `onLangChange(fn)` | abonnement, rend la fonction de désabonnement |
| `registerDict(nom, { fr: en })` | enregistre un dictionnaire ; une clé déjà connue avec une autre valeur est notée comme doublon, la dernière l'emporte |
| `localize(objet, champs)` | remplace des champs de texte (chaîne ou tableau de chaînes, ou des indices) par des accesseurs qui rendent la langue courante, avec cache invalidé à chaque changement de langue ou de dictionnaire |
| `registerKeys` / `t(clé)` | clés stables `{ fr, en }`, rares (un seul usage : `kingdom.skip` dans `ui/kingdom.ts`) |
| `i18nMissing()`, `i18nDuplicates()`, `i18nDicts()`, `i18nEntries()` | contrôle ; `i18nMissing`, `setLang`, `getLang`, `i18nDuplicates` sont aussi sur `window` |

`fmtNum` (`format.ts`, séparateurs des nombres en anglais) existe mais n'est utilisé nulle part.

### Données localisées
`localize` est appelé **à la fin du fichier qui définit les données** : `src/i18n/data.ts` pour `KINDS` (`names`, `desc`, `perk`), `AGES` (`name`, `tagline`), `SEASONS`, `BUILD_CATS`, `BUILD_SUBS`, `MISSIONS` (titre, intro, et pour chaque choix libellé, texte, ce que fait l'équipe, récits de réussite et d'échec, y compris ceux qui changent avec l'âge) ; et dans `sim/army.ts`, `sim/events.ts`, `sim/gear.ts`, `sim/hell.ts`, `sim/hellBase.ts`, `world/hell.ts`, `world/mapgen.ts`, `ui/kingdom.ts`, `ui/tutorial.ts`, `ui/warTips.ts`. Tout code qui lit `KINDS.house.names[age]` reçoit donc la bonne langue sans rien changer. `DIFF_TEXT` (`sim/difficulty.ts`) se traduit à la lecture.

### Les dictionnaires (`src/i18n/en/`)
Un fichier par zone, chacun `registerDict('zone', { 'texte français': 'English text' })` :
- `catalog` : catalogue (noms par âge, descriptions, atouts), bâtiments et leurs fiches ;
- `missions` : titres, récits, choix, résultats, résumés d'effets ; `events` : imprévus d'expédition ; `expeditions` : messages et comptes rendus ;
- `gear` : équipement, onglet Équipement et messages divers (incendies, pose, lieux) ; `army` : troupes, recrutement, commandement ;
- `war` : guerre, Enfers, nouvelles du front, barre de commandement, base avancée ;
- `tutorial` : tutoriel, aides (`warTips`), conseils du village, bannières, écrans de victoire, royaume des Enfers ;
- `menu` : accueil, réglages, difficultés, crédits ; `ui` : barre du haut, barre de construction, fenêtres, notifications ; `misc` : le reste.

`en/index.ts` importe `../data` puis chaque zone ; **un nouveau fichier de zone doit y être importé**. `main.ts` importe `./i18n/en` dès sa deuxième ligne, avant tout code qui appelle `tr`.

### Contrôles automatiques (`tests/i18n.test.ts`)
- les `{placeholders}` sont les mêmes en français et en anglais pour chaque entrée ;
- aucune traduction vide, aucune clé dans deux dictionnaires avec deux valeurs ;
- aucun `tr()` avec une interpolation `${…}` (le test lit tout `src/` avec une expression régulière) ;
- couverture : les littéraux de `tr('…')` trouvés dans `src/` sans traduction sont listés (informatif) ; `I18N_STRICT=1 npx vitest run tests/i18n.test.ts` fait échouer le test s'il en reste.
Les autres fichiers de test gardent des textes précis (textes jadis oubliés, missions, équipement) : un texte français affiché en anglais s'y ajoute comme cas.

### Exemple
```ts
// dans le code
this.ui.toast(tr('{name} est déjà sur la ligne.', { name }));
// dans src/i18n/en/expeditions.ts (la zone du système concerné)
'{name} est déjà sur la ligne.': '{name} is already on the line.',
```
Un pluriel : `nplural(n, 'habitant', 'habitants')` avec `'habitant': 'inhabitant'` et `'habitants': 'inhabitants'` au dictionnaire.

## Liens avec les autres systèmes
- L'interface passe tout par `tr` ([interface.md](interface.md)) ; les notifications traduisent le texte qu'on leur donne (un message à variables doit être construit avec `tr('… {n} …', { n })` avant l'appel).
- Les regex de `levelOf` (`ui/notifs.ts`) connaissent des mots anglais pour classer un message en anglais.
- La langue n'est pas dans la sauvegarde de la partie (clé séparée, voir [sauvegarde.md](sauvegarde.md)).

## Pièges et invariants
- **Premier argument de `tr` = un littéral**, à l'identique du dictionnaire, apostrophes comprises : `’` (typographique) et `'` sont deux clés différentes. Jamais de `${…}` dans `tr` : un `{placeholder}` et `params`.
- **Pas de `tr()` sur une valeur évaluée une seule fois à l'import** (la langue n'est pas encore connue, ou changera) : on traduit à l'affichage (`tr(KINDS[k].names[age])`) ou on `localize`.
- **`main.ts` importe `tr` sous le nom `trx`** (des variables locales s'appellent `tr`) : l'expression régulière du test de couverture (`tr(` ou `trf(`) **ne voit pas** ces textes ; les ajouter au dictionnaire à la main. Même précaution dans tout fichier qui renomme `tr` ou a une variable `tr` (elle masque la fonction : la renommer).
- Les entrées doivent être dans le dictionnaire **exactement** comme dans le code ; une faute de frappe donne un texte français en anglais, sans erreur. Vérifier en jeu avec `setLang('en')` puis `i18nMissing()` dans la console (liste des textes passés à `tr` sans traduction depuis le lancement).
- Un `{nom}` doit exister des deux côtés ; un pluriel s'écrit avec `plural` / `nplural`, pas avec un `s` collé.
- La liste « zones prévues, vides ou presque » de `src/i18n/README.md` est dépassée : toutes les zones listées ci-dessus sont remplies.
- Les noms propres, nombres et unités sans mot ne se traduisent pas.
- `localize` pose des accesseurs : une copie de l'objet (`{ ...KINDS.house }`, `structuredClone`) fige la langue du moment.

## Pour modifier
**Traduire un nouveau texte** : (1) écrire le texte en français dans `tr('…')` (ou dans la donnée, si elle est localisée) ; (2) l'ajouter au dictionnaire de la zone dans `src/i18n/en/<zone>.ts` ; (3) `npx vitest run tests/i18n.test.ts`.

**Ajouter des données avec des textes** (un tableau de bâtiments, de troupes…) : laisser les textes français dans la donnée et appeler `localize(objet, ['champ', …])` à la fin du fichier (ou ajouter une ligne dans `i18n/data.ts` pour le catalogue) ; les traductions vont dans le dictionnaire.

**Ajouter une langue** : l'ajouter à `Lang` et `LANGS` (`index.ts`), au nom affiché `LANG_NAME` (`ui/ui.ts`), créer ses dictionnaires, étendre `tr`, `plural`, `colon`, `pct` (la logique actuelle ne connaît que `'en'` et le français par défaut), les regex de `notifs.ts`, et les cas `isEnglish()` dispersés (`sim/expeditions.ts`, `world/hell.ts`, `ui/brief.ts`).

**Nouvelle zone de dictionnaire** : `registerDict('zone', {…})` dans `src/i18n/en/zone.ts`, import ajouté à `src/i18n/en/index.ts`.
