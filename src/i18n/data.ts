/**
 * Données du jeu dont les textes se lisent partout (noms par âge, descriptions, saisons, rayons de la barre de construction) :
 * leurs champs deviennent des accesseurs qui rendent la langue courante (voir `localize` dans index.ts). Les traductions
 * sont dans src/i18n/en/*.ts, clé = texte français tel qu'il est écrit dans le catalogue. Pour localiser un champ de plus,
 * l'ajouter ici (une ligne), sans toucher aux fichiers de données.
 */
import { localize } from './index';
import { KINDS, AGES, SEASONS, BUILD_CATS, BUILD_SUBS } from '../build/catalog';
import { MISSIONS } from '../sim/missions';

for (const d of Object.values(KINDS)) localize(d, ['names', 'desc', 'perk']);
for (const a of AGES) localize(a, ['name', 'tagline']);
localize(SEASONS, [0, 1, 2, 3]);
for (const c of BUILD_CATS) localize(c, ['label']);
for (const subs of Object.values(BUILD_SUBS)) for (const s of subs) localize(s, ['label']);

// Missions : titre, récit, et pour chaque choix libellé, phrase, ce que fait l'équipe, récits de réussite et d'échec (y compris
// ceux qui changent avec l'âge) ; leurs textes sont dans en/missions.ts
for (const m of MISSIONS) {
  localize(m, ['title', 'intro']);
  for (const c of m.choices) {
    localize(c, ['label', 'text', 'doing', 'winText', 'loseText']);
    for (const o of Object.values(c.ages ?? {})) if (o) localize(o,['label', 'text', 'doing', 'winText', 'loseText']);
  }
}
