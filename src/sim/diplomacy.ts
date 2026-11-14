import type { World } from '../world/world';
import type { People, RivalIsle } from '../world/archipelago';
import type { KindId } from '../build/catalog';
import { tr } from '../i18n';
import { archipelagoOn } from '../world/expand';

/**
 * La diplomatie de l'archipel (voir `docs/diplomatie.md`) : les deux peuples des îles rivales, l'allié qu'on choisit parmi eux,
 * et leur conflit, qu'on règle à l'âge industriel par la paix, par la guerre, ou qu'on laisse se régler sans nous (au passage
 * au Moderne, les deux îles signent un traité). Tout est facultatif : rien de ceci n'existe sans l'archipel accepté
 * (`archipelagoOn`), et rien ne conditionne un âge
 */

/** Voie choisie pour le dénouement : la paix (une chaîne de pourparlers), la guerre aux côtés de l'allié, ou rester à l'écart */
export type Path = 'peace' | 'war' | 'neutral';
/**
 * Le conflit entre les deux îles : en cours, réglé par notre paix, gagné par la guerre, ou réglé sans nous par le traité du
 * Moderne
 */
export type Conflict = 'open' | 'peace' | 'won' | 'treaty';

export interface DiploState {
  /** peuples rencontrés (l'expédition de premier contact les rencontre tous les deux) */
  met: People[];
  /** l'île alliée, choisie sur la carte du choix de l'allié (définitif) */
  ally: People | null;
  /** la voie du dénouement (null : pas encore choisie) */
  path: Path | null;
  conflict: Conflict;
  /** le panneau d'âge a prévenu que les deux îles régleront leur conflit sans nous (une seule fois) */
  warned: boolean;
  /** la carte du dénouement s'est ouverte d'elle-même (une seule fois ; on la rouvre ensuite depuis le rayon Vie) */
  asked: boolean;
  /** paix : le comptoir chez l'île rivale est ouvert */
  post: boolean;
  /** paix : la fête des trois peuples a eu lieu */
  feast: boolean;
}

export const newDiplo = (): DiploState => ({ met: [], ally: null, path: null, conflict: 'open', warned: false, asked: false, post: false, feast: false });

const PEOPLES: People[] = ['orient', 'asie'];
const PATHS: Path[] = ['peace', 'war', 'neutral'];
const CONFLICTS: Conflict[] = ['open', 'peace', 'won', 'treaty'];

/** Relit l'état sauvegardé (ancienne partie : état vierge) */
export function readDiplo(d: any): DiploState {
  const s = newDiplo();
  if (!d || typeof d !== 'object') return s;
  s.met = Array.isArray(d.met) ? PEOPLES.filter((p) => d.met.includes(p)) : [];
  s.ally = PEOPLES.includes(d.ally) ? d.ally : null;
  // (un allié sans rencontre n'a pas de sens : la rencontre est sous-entendue)
  if (s.ally && !s.met.length) s.met = [...PEOPLES];
  s.path = PATHS.includes(d.path) ? d.path : null;
  s.conflict = CONFLICTS.includes(d.conflict) ? d.conflict : 'open';
  s.warned = d.warned === true;
  s.asked = d.asked === true;
  s.post = d.post === true;
  s.feast = d.feast === true;
  return s;
}

/** Ce qu'on écrit dans la sauvegarde : rien tant que rien n'a bougé */
export function saveDiplo(s: DiploState): DiploState | undefined {
  const e = newDiplo();
  return (Object.keys(e) as (keyof DiploState)[]).some((k) => JSON.stringify(s[k]) !== JSON.stringify(e[k])) ? s : undefined;
}

/**
 * L'archipel est-il accepté ? La seule question à poser pour savoir si la partie a les îles rivales (celle de l'agrandissement,
 * `world/expand.ts` : leur place n'existe que dans une partie agrandie par « Explorer le monde », ou née archipel)
 */
export { archipelagoOn };

/** L'autre peuple */
export const rivalOf = (p: People): People => (p === 'orient' ? 'asie' : 'orient');

/** Le peuple rival de l'allié (null tant qu'on n'a pas d'allié) : celui chez qui la paix ouvre un comptoir */
export function rivalPeople(d: DiploState): People | null { return d.ally ? rivalOf(d.ally) : null; }

/** Nom d'un peuple, en clair (pour les textes) */
export function peopleName(p: People) { return p === 'orient' ? tr('les Sablais') : tr('les Jadéens'); }
/** Nom de son île */
export function isleName(p: People) { return p === 'orient' ? tr('l’île des Sables') : tr('l’île de Jade'); }

/** L'île d'un peuple (null sans archipel) */
export function isleOf(w: Pick<World, 'isles'>, p: People): RivalIsle | null {
  return w.isles?.rivals.find((r) => r.people === p) ?? null;
}

/** La case est-elle sur cette île rivale ? (l'union de ses lobes, à quelques cases près : la terre est vérifiée à part) */
export function onRival(isle: RivalIsle, x: number, z: number) {
  return isle.lobes.some((l) => Math.hypot(x - l.x, z - l.z) <= l.r + 3);
}

// ---------------- Les étapes ----------------

/** Les missions de la diplomatie (voir `MISSIONS`) : le premier contact, puis la chaîne de la paix */
export const CONTACT = 'contact';
export const PEACE_CHAIN = ['envoys', 'truce', 'feast'] as const;
const DIPLO_MISSIONS = new Set<string>([CONTACT, ...PEACE_CHAIN]);

/** Une mission de la diplomatie est-elle proposée dans cette partie ? (les autres le sont toujours) */
export function missionOffered(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string): boolean {
  if (!DIPLO_MISSIONS.has(id)) return true;
  if (!archipelagoOn(w)) return false;
  // (une étape déjà réussie reste dans la liste, en petit : ce qu'on a fait)
  if (w.exp.done.includes(id)) return true;
  if (id === CONTACT) return true;
  // (la chaîne de la paix : la trêve règle le conflit, la fête vient après)
  return w.diplo.path === 'peace' && !!w.diplo.ally && (w.diplo.conflict === 'open' || w.diplo.conflict === 'peace');
}

/** Pourquoi une mission de la diplomatie ne peut pas partir (null : rien ne l'empêche de ce côté-là) */
export function missionWhy(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string): string | null {
  if (!DIPLO_MISSIONS.has(id)) return null;
  if (!archipelagoOn(w)) return tr('Il faut d’abord explorer le monde.');
  if (w.exp.done.includes(id)) return tr('C’est fait : cette étape ne se refait pas.');
  if (id === CONTACT) return null;
  if (!w.diplo.ally) return tr('Il faut d’abord choisir votre allié.');
  if (w.diplo.conflict !== 'open' && w.diplo.conflict !== 'peace') return tr('Le conflit des deux îles est déjà réglé.');
  if (w.diplo.path !== 'peace') return tr('Il faut d’abord choisir la voie de la paix.');
  return null;
}

/** Ce que font les effets de la diplomatie (`Effect` `diplo`) au retour d'une expédition réussie */
export type DiploAct = 'meet' | 'post' | 'truce' | 'feast';
export function applyDiplo(d: DiploState, act: DiploAct) {
  if (act === 'meet') d.met = [...PEOPLES];
  else if (act === 'post') d.post = true;
  // la trêve signée : le conflit est réglé par notre paix (les escarmouches cessent)
  else if (act === 'truce') { if (d.conflict === 'open') d.conflict = 'peace'; d.path = 'peace'; }
  else if (act === 'feast') d.feast = true;
}

/** La carte du choix de l'allié est à montrer : les deux peuples rencontrés, aucun allié encore */
export function allyPending(w: Pick<World, 'isles' | 'diplo'>) {
  return archipelagoOn(w) && w.diplo.met.length === PEOPLES.length && !w.diplo.ally;
}

/** Choisir son allié (une seule fois) */
export function chooseAlly(d: DiploState, p: People) {
  if (d.ally || !d.met.includes(p)) return false;
  d.ally = p;
  return true;
}

/** Le dénouement est ouvert : l'âge industriel, un allié, le conflit en cours */
export function endgameOpen(w: Pick<World, 'isles' | 'diplo'>, age: number) {
  return archipelagoOn(w) && !!w.diplo.ally && w.diplo.conflict === 'open' && age === ENDGAME_AGE;
}
/** L'âge du dénouement : l'industriel ; il se clôt au passage au Moderne */
export const ENDGAME_AGE = 3;

/**
 * Choisir (ou changer) sa voie tant que le conflit dure. La guerre engagée attend la bataille (`startAllyBattle`, à venir) ;
 * la paix ouvre la chaîne de pourparlers ; la neutralité ne fait rien
 */
export function choosePath(d: DiploState, p: Path) {
  if (!d.ally || d.conflict !== 'open') return false;
  d.path = p;
  return true;
}

/** La guerre est engagée aux côtés de l'allié, la bataille reste à livrer */
export function warEngaged(d: DiploState) { return d.path === 'war' && d.conflict === 'open'; }

/**
 * Le passage au Moderne : un conflit encore ouvert se règle sans nous, par un traité entre les deux îles. Renvoie vrai si
 * le traité vient d'être signé (la bannière l'annonce)
 */
export function settleAtAge(d: DiploState, age: number, on: boolean) {
  if (!on || age <= ENDGAME_AGE || d.conflict !== 'open') return false;
  d.conflict = 'treaty';
  if (d.path !== 'peace' && d.path !== 'war') d.path = 'neutral';
  return true;
}

/**
 * Le panneau d'âge doit-il prévenir que les îles régleront leur conflit sans nous ? Vers le Moderne, quand le conflit
 * dure encore (quelle que soit la voie : une guerre ou une paix commencée et pas finie se règle aussi par le traité)
 */
export function treatyAhead(w: Pick<World, 'isles' | 'diplo'>, age: number) {
  return archipelagoOn(w) && age === ENDGAME_AGE && w.diplo.conflict === 'open';
}

/**
 * Le passage d'âge vers `next` peut-il se faire ? Pas pendant la bataille aux côtés de l'allié ; et, vers le Moderne, une
 * première fois seulement après l'avertissement (`warned`). Renvoie le refus à dire au joueur, ou null
 */
export function ageGate(w: Pick<World, 'isles' | 'diplo'>, age: number, battle: boolean): { why: string; warn: boolean } | null {
  if (battle) return { why: tr('Une bataille est en cours : on ne change pas d’âge avant son issue.'), warn: false };
  if (treatyAhead(w, age) && !w.diplo.warned) return { why: tr('Les deux îles vont régler leur conflit sans vous. Cliquez encore pour passer à l’âge suivant.'), warn: true };
  return null;
}

// ---------------- Le conflit en décor (session « conflit naval ») ----------------

/**
 * L'état du conflit tel que le lit le conflit naval vivant (session « conflit naval » : `ConflictState` de
 * `sim/navalConflict.ts`, même forme) : la guerre tant qu'il dure (des escarmouches), la paix (la nôtre) ou le traité (des
 * navires de commerce), la victoire de l'allié (ses patrouilles) ; null sans archipel. La seule fonction à brancher sur
 * `NavalConflict.state`
 */
export type ConflictState = { kind: 'war' } | { kind: 'peace' } | { kind: 'won'; winner: People } | { kind: 'treaty' };
export function conflictState(w: Pick<World, 'isles' | 'diplo'>): ConflictState | null {
  if (!archipelagoOn(w)) return null;
  const d = w.diplo;
  if (d.conflict === 'won' && d.ally) return { kind: 'won', winner: d.ally };
  return d.conflict === 'peace' ? { kind: 'peace' } : d.conflict === 'treaty' ? { kind: 'treaty' } : { kind: 'war' };
}

// ---------------- La guerre : le crochet de la bataille, les récompenses ----------------

/**
 * Les récompenses de la guerre gagnée, prêtes pour la bataille à venir : un gros butin d'or, un tribut d'or chaque jour de
 * l'île vaincue, et un monument de la victoire à bâtir (bâtiment à créer avec la bataille)
 */
export const WAR_SPOILS = { loot: 60, tribute: 2, monument: 'victory' } as const;

/**
 * La bataille aux côtés de l'allié (à venir) : ce crochet la lance. Pour l'instant il ne fait rien et renvoie faux
 * (la guerre reste « engagée »)
 */
export function startAllyBattle(_w: World): boolean { return false; }

/** La bataille gagnée (appelée par la future bataille) : le conflit est réglé par les armes */
export function winAllyWar(d: DiploState) {
  if (d.path !== 'war' || d.conflict !== 'open') return false;
  d.conflict = 'won';
  return true;
}

/** Le tribut quotidien de l'île vaincue (or par jour de jeu ; zéro tant que la guerre n'est pas gagnée) */
export function tributePerDay(d: DiploState) { return d.conflict === 'won' ? WAR_SPOILS.tribute : 0; }

// ---------------- Les récompenses de la paix ----------------

/**
 * Le comptoir chez l'île rivale (pour la session de l'or) : le peuple qui l'accueille, une fois les émissaires reçus ;
 * null sinon
 */
export function rivalPost(w: Pick<World, 'isles' | 'diplo'>): People | null {
  return archipelagoOn(w) && w.diplo.post ? rivalPeople(w.diplo) : null;
}

/** Les bâtiments de la diplomatie, et la mission qui les ouvre */
export const DIPLO_KINDS: Partial<Record<KindId, string>> = { concord: 'truce' };

/** Le bâtiment est-il proposé dans cette partie ? (le monument de la concorde : seulement sur la voie de la paix) */
export function kindOffered(w: Pick<World, 'isles' | 'diplo' | 'exp'>, k: KindId) {
  const m = DIPLO_KINDS[k];
  if (!m) return true;
  return archipelagoOn(w) && (w.exp.done.includes(m) || w.diplo.path === 'peace');
}

// ---------------- Le cosmodrome ----------------

/**
 * Où le cosmodrome peut se poser : sur l'île alliée quand l'archipel est accepté, sur l'île principale sinon (le reste de
 * la carte en est exclu par ailleurs). Renvoie le refus, ou null
 */
export function spaceportWhy(w: Pick<World, 'isles' | 'diplo'>, x: number, z: number, s: number): string | null {
  if (!archipelagoOn(w)) return null;
  const ally = w.diplo.ally;
  if (!ally) return tr('Le cosmodrome se bâtit sur l’île de votre allié : rencontrez d’abord les peuples des îles (expédition « Le premier contact »).');
  const isle = isleOf(w, ally)!;
  const corners = [[x, z], [x + s - 1, z], [x, z + s - 1], [x + s - 1, z + s - 1]];
  if (!corners.every(([cx, cz]) => onRival(isle, cx + 0.5, cz + 0.5))) return tr('Le cosmodrome se bâtit sur l’île de votre allié ({isle}).', { isle: isleName(ally) });
  return null;
}
