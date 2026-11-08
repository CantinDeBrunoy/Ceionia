# Langue (français / anglais)

Le code garde ses textes **français** (la « source ») ; on les enveloppe de `tr('…')`. En anglais, `tr` cherche le texte
français exact dans les dictionnaires et rend l'anglais ; si la traduction manque, ou en français, il rend le texte tel quel.
`tr` est une recherche dans une `Map` (O(1)). La langue des tests est `'fr'` (pas de navigateur) : rien ne change en français.

```ts
import { tr, plural, nplural, trs } from '../i18n';
```

## Envelopper un texte

| Cas | Code | Dictionnaire (`src/i18n/en/<zone>.ts`) |
|---|---|---|
| Texte fixe | `tr('Nourriture')` | `'Nourriture': 'Food'` |
| Variable | `tr('{n} habitants disponibles', { n })` | `'{n} habitants disponibles': '{n} inhabitants available'` |
| Plusieurs variables | `tr('{a} sur {b}', { a, b })` | `'{a} sur {b}': '{a} of {b}'` |
| Pluriel | `` `${n} ${plural(n, 'habitant', 'habitants')}` `` ou `nplural(n, 'habitant', 'habitants')` | `'habitant': 'inhabitant', 'habitants': 'inhabitants'` |
| Liste de textes (SEASONS, `names[]` par âge, points…) | `trs(SEASONS)` ou `tr(SEASONS[i])` | une entrée par élément |
| Clé stable (rare) | `t('menu.title')` après `registerKeys({ 'menu.title': { fr, en } })` | — |

Règles :

- Le premier argument de `tr` est un **littéral** (apostrophes, guillemets ou accents inclus, à l'identique : `’` et `'` sont deux clés différentes).
  **Jamais d'interpolation `${…}` dans `tr`** : on met un `{placeholder}` et on passe `params` (le test `tests/i18n.test.ts` le vérifie).
- Les `{placeholders}` doivent être identiques en français et en anglais (vérifié par le test).
- Les données statiques évaluées à l'import (tableaux de `catalog.ts`, `DIFF_TEXT`, `MISSIONS`…) restent en français et on traduit **à l'affichage** :
  `tr(KINDS[k].names[age])`, `tr(DIFF_TEXT.name[d])`. Ne pas envelopper un littéral évalué une seule fois au chargement (la langue n'est pas encore connue / changera).
- Attention aux variables locales nommées `tr` (ex. des trains dans `main.ts`) : elles masquent la fonction ; les renommer.
- Les noms propres, nombres et unités sans mot ne se traduisent pas. Un texte sans traduction reste en français : rien ne casse.

## Données statiques : `localize` (déjà branché)

`src/i18n/data.ts` remplace, à l'import, les champs de texte des données du jeu par des accesseurs qui rendent la langue courante :
`KINDS[k].names` / `desc` / `perk`, `AGES[i].name` / `tagline`, `SEASONS`, `BUILD_CATS[].label`, `BUILD_SUBS[][].label`. Tout le code existant
qui lit `KINDS.house.names[age]` reçoit donc l'anglais **sans changer** ; il suffit d'ajouter les entrées au dictionnaire (clé = texte français
exact du catalogue). Pour localiser un champ de plus (ex. `UPGRADES`), ajouter une ligne dans `data.ts`. `DIFF_TEXT` (src/sim/difficulty.ts) est
déjà traduit à la lecture (ses textes sont dans `en/menu.ts`). Les notifications (`ui.toast`/`info`/bannières) passent aussi par `tr`, donc
un message statique français qu'on leur passe est traduit tout seul ; un message à variables doit être construit avec `tr('… {n} …', { n })`
avant l'appel (et les regex de `levelOf` dans notifs.ts connaissent des mots anglais pour le classement).

## Dictionnaires

`src/i18n/en/<zone>.ts`, un fichier par zone, chacun de la forme :

```ts
import { registerDict } from '../index';
registerDict('zone', { 'texte français': 'English text' });
```

Zones prévues (déjà créées, vides ou presque) : `ui`, `menu`, `catalog`, `missions`, `events`, `gear`, `war`, `tutorial`,
`misc`, `expeditions`, `army`. Chaque agent ne modifie que son fichier : `src/i18n/en/index.ts` les importe tous et n'a pas à changer
(si vous créez un nouveau fichier de zone, ajoutez-y une ligne d'import). Une même clé ne doit pas figurer dans deux dictionnaires avec
deux traductions différentes (le test le signale).

## Vérifier la couverture

- `npx vitest run tests/i18n.test.ts` : placeholders cohérents, pas de doublon, et la liste des textes de `tr('…')` trouvés dans `src/` sans
  traduction (informatif). `I18N_STRICT=1 npx vitest run tests/i18n.test.ts` fait échouer le test s'il en reste.
- En jeu, en anglais : `i18nMissing()` dans la console (disponible sur `window`) liste les textes passés à `tr()` depuis le lancement
  qui n'ont pas de traduction ; `i18nResetMissing()` (module) la remet à zéro.
- `setLang('en')` / `setLang('fr')` dans la console change la langue (mémorisée dans `localStorage` sous `ceionia.lang`).

## Changement de langue

`setLang(l)` mémorise, met à jour `<html lang>` et appelle les abonnés (`onLangChange(fn)`). Dans le menu principal, l'écran est
redessiné à chaud. En jeu, l'interface est construite une fois : le sélecteur des réglages sauvegarde la partie puis recharge la page,
qui reprend la partie (`AUTOSTART`). Le code qui construit du HTML une seule fois n'a donc pas à se redessiner de lui-même.
