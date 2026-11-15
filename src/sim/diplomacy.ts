import type { World } from '../world/world';
import type { People, RivalIsle } from '../world/archipelago';
import type { KindId } from '../build/catalog';
import { tr } from '../i18n';
import { archipelagoOn } from '../world/expand';

/**
 * La diplomatie de l'archipel (voir `docs/diplomatie.md`) : les deux peuples des îles rivales, l'allié qu'on choisit parmi eux
 * à la fin de la cinématique des îles, et leur conflit, qu'on règle à l'âge industriel par la paix ou par la guerre : il doit
 * l'être pour passer au Moderne. Rien de ceci n'existe sans l'archipel accepté (`archipelagoOn`)
 */

/** Voie choisie pour le dénouement : la paix (une chaîne de pourparlers) ou la guerre aux côtés de l'allié */
export type Path = 'peace' | 'war';
/**
 * Le conflit entre les deux îles : en cours, réglé par notre paix, gagné par la guerre, ou réglé d'office par un traité
 * entre les deux îles (une partie déjà au-delà de l'Industriel, voir `settleLate`)
 */
export type Conflict = 'open' | 'peace' | 'won' | 'treaty';

export interface DiploState {
  /** peuples rencontrés (tous les deux dès que l'allié est choisi) */
  met: People[];
  /** l'île alliée, choisie sur la carte du choix de l'allié (définitif) */
  ally: People | null;
  /** la voie du dénouement (null : pas encore choisie) */
  path: Path | null;
  conflict: Conflict;
  /** la carte du dénouement s'est ouverte d'elle-même (une seule fois ; on la rouvre ensuite depuis le panneau des âges) */
  asked: boolean;
  /** paix : le comptoir chez l'île rivale est ouvert */
  post: boolean;
  /** paix : la fête des trois peuples a eu lieu */
  feast: boolean;
}

export const newDiplo = (): DiploState => ({ met: [], ally: null, path: null, conflict: 'open', asked: false, post: false, feast: false });

const PEOPLES: People[] = ['orient', 'asie'];
const PATHS: Path[] = ['peace', 'war'];
const CONFLICTS: Conflict[] = ['open', 'peace', 'won', 'treaty'];

/** Relit l'état sauvegardé (ancienne partie : état vierge) */
export function readDiplo(d: any): DiploState {
  const s = newDiplo();
  if (!d || typeof d !== 'object') return s;
  s.met = Array.isArray(d.met) ? PEOPLES.filter((p) => d.met.includes(p)) : [];
  s.ally = PEOPLES.includes(d.ally) ? d.ally : null;
  // (un allié sans rencontre n'a pas de sens : la rencontre est sous-entendue)
  if (s.ally && !s.met.length) s.met = [...PEOPLES];
  // (l'ancienne neutralité n'existe plus : la voie est à choisir de nouveau)
  s.path = PATHS.includes(d.path) ? d.path : null;
  s.conflict = CONFLICTS.includes(d.conflict) ? d.conflict : 'open';
  // (une ancienne partie restée neutre revoit la carte du dénouement)
  s.asked = d.asked === true && d.path !== 'neutral';
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

/**
 * Les missions de la diplomatie (voir `MISSIONS`) : la chaîne de la paix, et l'expédition militaire de la guerre (en
 * attendant la grande bataille). Le premier contact (`contact`) n'existe plus : l'allié se choisit à la fin de la cinématique
 */
export const PEACE_CHAIN = ['envoys', 'truce', 'feast'] as const;
export const WAR_MISSION = 'allywar';
const DIPLO_MISSIONS = new Set<string>([...PEACE_CHAIN, WAR_MISSION]);

/** Une mission de la diplomatie est-elle proposée dans cette partie ? (les autres le sont toujours) */
export function missionOffered(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string): boolean {
  if (!DIPLO_MISSIONS.has(id)) return true;
  if (!archipelagoOn(w)) return false;
  // (une étape déjà réussie reste dans la liste, en petit : ce qu'on a fait)
  if (w.exp.done.includes(id)) return true;
  const d = w.diplo;
  if (!d.ally) return false;
  if (id === WAR_MISSION) return d.path === 'war' && d.conflict === 'open';
  // (la chaîne de la paix : la trêve règle le conflit, la fête vient après)
  return d.path === 'peace' && (d.conflict === 'open' || d.conflict === 'peace');
}

/** Pourquoi une mission de la diplomatie ne peut pas partir (null : rien ne l'empêche de ce côté-là) */
export function missionWhy(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string): string | null {
  if (!DIPLO_MISSIONS.has(id)) return null;
  if (!archipelagoOn(w)) return tr('Il faut d’abord explorer le monde.');
  if (w.exp.done.includes(id)) return tr('C’est fait : cette étape ne se refait pas.');
  const d = w.diplo;
  if (!d.ally) return tr('Il faut d’abord choisir votre allié.');
  if (id === WAR_MISSION) {
    if (d.conflict !== 'open') return tr('Le conflit des deux îles est déjà réglé.');
    if (d.path !== 'war') return tr('Il faut d’abord choisir d’aider notre allié.');
    return null;
  }
  if (d.conflict !== 'open' && d.conflict !== 'peace') return tr('Le conflit des deux îles est déjà réglé.');
  if (d.path !== 'peace') return tr('Il faut d’abord choisir la voie de la paix.');
  return null;
}

/**
 * Ce que font les effets de la diplomatie (`Effect` `diplo`) au retour d'une expédition réussie. `meet` ne sert plus qu'aux
 * anciennes sauvegardes (l'expédition du premier contact) ; `victory` : la guerre gagnée par l'expédition militaire
 */
export type DiploAct = 'meet' | 'post' | 'truce' | 'feast' | 'victory';
export function applyDiplo(d: DiploState, act: DiploAct) {
  if (act === 'meet') d.met = [...PEOPLES];
  else if (act === 'post') d.post = true;
  // la trêve signée : le conflit est réglé par notre paix (les escarmouches cessent)
  else if (act === 'truce') { if (d.conflict === 'open') d.conflict = 'peace'; d.path = 'peace'; }
  else if (act === 'feast') d.feast = true;
  else if (act === 'victory') winAllyWar(d);
}

/**
 * La carte du choix de l'allié est à montrer : l'archipel accepté, aucun allié encore. Elle s'ouvre à la fin de la
 * cinématique des îles, puis au calme tant que le choix manque (une partie rechargée, une ancienne partie)
 */
export function allyPending(w: Pick<World, 'isles' | 'diplo'>) {
  return archipelagoOn(w) && !w.diplo.ally;
}

/** Choisir son allié (une seule fois) : les deux peuples sont alors rencontrés */
export function chooseAlly(d: DiploState, p: People) {
  if (d.ally || !PEOPLES.includes(p)) return false;
  d.ally = p;
  d.met = [...PEOPLES];
  return true;
}

/** L'âge du dénouement : l'industriel ; le conflit doit y être réglé pour passer au Moderne */
export const ENDGAME_AGE = 3;

/** Le dénouement est ouvert : l'âge industriel, un allié, le conflit en cours */
export function endgameOpen(w: Pick<World, 'isles' | 'diplo'>, age: number) {
  return archipelagoOn(w) && !!w.diplo.ally && w.diplo.conflict === 'open' && age === ENDGAME_AGE;
}

/**
 * Choisir (ou changer) sa voie tant que le conflit dure : la paix ouvre la chaîne de pourparlers, la guerre l'expédition
 * militaire (`allywar`)
 */
export function choosePath(d: DiploState, p: Path) {
  if (!d.ally || d.conflict !== 'open' || !PATHS.includes(p)) return false;
  d.path = p;
  return true;
}

/** La guerre est engagée aux côtés de l'allié, l'expédition (puis la bataille) reste à gagner */
export function warEngaged(d: DiploState) { return d.path === 'war' && d.conflict === 'open'; }

/**
 * La condition du passage au Moderne, dans le panneau des âges (`Sim.ageProgress`) : le conflit des deux îles réglé, par la
 * paix (la trêve) ou par la guerre (l'expédition militaire gagnée). Seulement avec l'archipel. Son libellé la fait
 * reconnaître par le panneau (`reqOf` → `conflict` : un clic rouvre la carte) et par le conseil (`Sim.messageConflict`)
 */
export const CONFLICT_LABEL = 'le conflit des deux îles, réglé';
export function conflictItem(w: Pick<World, 'isles' | 'diplo'>, next: number): { have: number; need: number } | null {
  if (!archipelagoOn(w) || next !== ENDGAME_AGE + 1) return null;
  return { have: w.diplo.conflict === 'open' ? 0 : 1, need: 1 };
}

/**
 * Une partie déjà au-delà de l'Industriel avec un conflit ouvert (une ancienne partie, ou un archipel accepté au Moderne)
 * ne reste pas bloquée : le conflit est réglé d'office, par un traité entre les deux îles. Renvoie vrai s'il vient de l'être
 */
export function settleLate(d: DiploState, age: number, on: boolean) {
  if (!on || age <= ENDGAME_AGE || d.conflict !== 'open') return false;
  d.conflict = 'treaty';
  return true;
}

/** Le passage d'âge peut-il se faire ? Pas pendant la bataille aux côtés de l'allié (à venir). Renvoie le refus, ou null */
export function ageGate(battle: boolean): string | null {
  return battle ? tr('Une bataille est en cours : on ne change pas d’âge avant son issue.') : null;
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
  if (!ally) return tr('Le cosmodrome se bâtit sur l’île de votre allié : choisissez d’abord votre allié.');
  const isle = isleOf(w, ally)!;
  const corners = [[x, z], [x + s - 1, z], [x, z + s - 1], [x + s - 1, z + s - 1]];
  if (!corners.every(([cx, cz]) => onRival(isle, cx + 0.5, cz + 0.5))) return tr('Le cosmodrome se bâtit sur l’île de votre allié ({isle}).', { isle: isleName(ally) });
  return null;
}
