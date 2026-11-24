import type { World } from '../world/world';
import type { KindId } from '../build/catalog';
import { archipelagoOn } from '../world/expand';
import { PEACE_CHAIN, WAR_MISSION, type DiploState } from './diplomacy';
import { RAID_FIRST, battleOpen } from './campaign';
import { COMMON_KINDS, COMMONS_NEED, GARRISON_KINDS, garrisonBuilt, commonsCount, nextToBuild } from './concession';

/**
 * Le fil des âges (chantier A du nouveau monde, décision de l'auteur du 24 nov. 2026) : le conflit des deux îles ne se règle
 * plus au Médiéval, il s'étale sur trois **chapitres**, le Médiéval, l'Industriel et le Moderne, pour la guerre comme pour la
 * paix. Chaque chapitre fait est une condition du passage à l'âge suivant ; le dernier règle le conflit. Règles pures, état
 * sauvegardé dans `diplo.saga`. Voir `docs/diplomatie.md`, « Le fil des âges ».
 *
 * Les étapes navales (chantier B) viennent avant le débarquement, le port et les émissaires ; les bâtiments des zones
 * (chantier C, `sim/concession.ts`) : le fort à l'Industriel, la ville de garnison au Moderne (guerre), le port marchand
 * partagé et deux maisons communes à l'Industriel (paix). Contenu provisoire (marqué `stub`) : la bataille épique et les Jeux
 * des îles (chantier D) au Moderne.
 */

/** Les âges des chapitres : le Médiéval, l'Industriel, le Moderne. Le conflit s'ouvre au premier, se règle au dernier */
export const FIRST_CHAPTER = 2, LAST_CHAPTER = 4;
export type Chapter = 2 | 3 | 4;
export const CHAPTERS: Chapter[] = [2, 3, 4];
/** L'âge est-il celui d'un chapitre ? */
export const inSaga = (age: number) => age >= FIRST_CHAPTER && age <= LAST_CHAPTER;
/**
 * Le conflit se mène-t-il à cet âge ? Dès le Médiéval, et sans fin : une arrivée tardive dans l'archipel (jusqu'au
 * Futuriste) joue les chapitres passés à la suite (bug de l'auteur, 24 nov. 2026 : « Explorer le monde » au Futuriste ne
 * laissait plus aucun moyen de régler le conflit)
 */
export const conflictAge = (age: number) => age >= FIRST_CHAPTER;
/** Les chapitres ouverts à cet âge : le sien et ceux d'avant (au Futuriste, les trois) */
export const chaptersUpTo = (age: number) => CHAPTERS.filter((a) => a <= age);

export interface SagaState {
  /** les chapitres faits (leur âge) : gardés même si l'on reperd ensuite ce qu'on tenait */
  done: Chapter[];
  /** paix : la trêve est signée (l'ambassade de la paix, au Médiéval) ; la paix elle-même vient au Moderne */
  truce: boolean;
  /** les batailles navales gagnées (chantier B : le bras de mer, le blocus du port, l'escorte du convoi) */
  sea: SeaStep[];
  /** heure (`exp.clock`) à partir de laquelle une bataille navale perdue se rejoue */
  seaRetry: number;
}
/** Les étapes navales des chapitres (chantier B, `sim/navalBattle.ts`) */
export type SeaStep = 'strait' | 'blockade' | 'convoy';
export const SEA_STEPS: SeaStep[] = ['strait', 'blockade', 'convoy'];
export const isSeaStep = (id: string): id is SeaStep => (SEA_STEPS as string[]).includes(id);
export const newSaga = (): SagaState => ({ done: [], truce: false, sea: [], seaRetry: 0 });

/** Relit l'état sauvegardé (partie d'avant les chapitres : rien de fait, voir `catchUp` pour ce qu'on lui compte) */
export function readSaga(s: any): SagaState {
  const out = newSaga();
  if (!s || typeof s !== 'object') return out;
  if (Array.isArray(s.done)) out.done = CHAPTERS.filter((a) => s.done.includes(a));
  out.truce = s.truce === true;
  if (Array.isArray(s.sea)) out.sea = SEA_STEPS.filter((x) => s.sea.includes(x));
  out.seaRetry = Number.isFinite(s.seaRetry) ? Math.max(0, s.seaRetry) : 0;
  return out;
}

/** Ce que les règles lisent hors du monde : le nombre de bâtiments d'un genre (les étapes de construction de la paix) */
export interface SagaCtx { count?(k: KindId): number }

/**
 * Où mène une étape : une expédition (`mission`), la bataille de la campagne (`battle`), une bataille navale (`naval` : le
 * bras de mer, le blocus, l'escorte du convoi), un bâtiment à poser (`build`), la paix à signer (`sign`), ou rien qu'attendre
 * (`wait` : la première sortie rivale contre le camp)
 */
export type StepGo = 'mission' | 'battle' | 'naval' | 'build' | 'sign' | 'wait';
export interface SagaStep {
  id: string; age: Chapter; done: boolean; go: StepGo;
  mission?: string; kind?: KindId;
  /** remplaçant provisoire d'une étape d'un chantier à venir (B, C ou D) */
  stub?: 'B' | 'C' | 'D';
}

type Saga = Pick<World, 'isles' | 'diplo' | 'exp'>;

/**
 * Les étapes de la voie prise, des trois chapitres, dans l'ordre (vide sans voie). Le conflit réglé : toutes faites.
 * - La guerre : au Médiéval, les éclaireurs, la bataille du bras de mer, le débarquement, puis tenir le camp (repousser la
 *   première sortie) ; à l'Industriel, le blocus, le port, la tour du rempart, puis le fort ; au Moderne, la ville de
 *   garnison, puis l'assaut de la ville.
 * - La paix : au Médiéval, l'escorte du convoi, les émissaires, puis l'ambassade de la paix (la trêve) ; à l'Industriel, le
 *   port marchand partagé, puis deux des trois maisons communes ; au Moderne, l'ambassade bâtie puis la paix signée
 *   (provisoire : les Jeux des îles, chantier D).
 */
export function sagaSteps(w: Saga, ctx: SagaCtx = {}): SagaStep[] {
  const d = w.diplo, over = d.conflict !== 'open', exp = (id: string) => w.exp.done.includes(id);
  const count = (k: KindId) => ctx.count?.(k) ?? 0;
  if (!d.path) return [];
  const counts = (ks: KindId[]) => Object.fromEntries(ks.map((k) => [k, count(k)])) as Partial<Record<KindId, number>>;
  const held = d.camp.held, s: SagaStep[] = [];
  const sea = d.saga.sea;
  if (d.path === 'war') {
    s.push({ id: WAR_MISSION, age: 2, go: 'mission', mission: WAR_MISSION, done: d.battle !== 'none' || exp(WAR_MISSION) });
    // la bataille du bras de mer, avant le débarquement (une partie à la plage déjà prise la compte faite)
    s.push({ id: 'strait', age: 2, go: 'naval', done: sea.includes('strait') || held.includes('plage') });
    s.push({ id: 'plage', age: 2, go: 'battle', done: held.includes('plage') });
    s.push({ id: 'camp', age: 2, go: 'wait', done: held.includes('plage') && (d.camp.raids > 0 || held.length > 1) });
    // le blocus du port, avant sa prise (le port déjà pris le compte fait) ; (chantier C : le fort, après la tour)
    s.push({ id: 'blockade', age: 3, go: 'naval', done: sea.includes('blockade') || held.includes('port') });
    s.push({ id: 'port', age: 3, go: 'battle', done: held.includes('port') });
    s.push({ id: 'tour', age: 3, go: 'battle', done: held.includes('tour') });
    // le fort : le camp de la plage devient un fort, bâti par le joueur dans la tête de pont (le port pris)
    s.push({ id: 'fort', age: 3, go: 'build', kind: 'fort', done: count('fort') >= 1 });
    // la ville de garnison grandit autour du fort : la caserne et deux autres de ses bâtiments
    const gar = counts(GARRISON_KINDS);
    s.push({ id: 'garrison', age: 4, go: 'build', kind: nextToBuild(gar, GARRISON_KINDS), done: garrisonBuilt(gar) });
    // (chantier D : la bataille des deux îles remplacera l'assaut)
    s.push({ id: 'assault', age: 4, go: 'battle', done: d.conflict === 'won', stub: 'D' });
  } else {
    const [envoys, truce] = PEACE_CHAIN;
    // l'escorte du premier convoi, avant les émissaires (les émissaires déjà faits la comptent faite)
    s.push({ id: 'convoy', age: 2, go: 'naval', done: sea.includes('convoy') || exp(envoys) || d.saga.truce });
    s.push({ id: envoys, age: 2, go: 'mission', mission: envoys, done: exp(envoys) });
    s.push({ id: truce, age: 2, go: 'mission', mission: truce, done: d.saga.truce || exp(truce) });
    // le port marchand partagé et la ligne de vapeurs, puis deux des trois maisons communes, dans la concession
    s.push({ id: 'harbor2', age: 3, go: 'build', kind: 'merchantPort', done: count('merchantPort') >= 1 });
    const com = counts(COMMON_KINDS);
    s.push({ id: 'commons', age: 3, go: 'build', kind: nextToBuild(com, COMMON_KINDS), done: commonsCount(com) >= COMMONS_NEED });
    // (provisoire : la candidature et les Jeux des îles, chantier D)
    s.push({ id: 'embassy', age: 4, go: 'build', kind: 'embassy', done: count('embassy') >= 1, stub: 'D' });
    s.push({ id: 'sign', age: 4, go: 'sign', done: d.conflict === 'peace', stub: 'D' });
  }
  if (over) for (const x of s) x.done = true;
  return s;
}

/** Les étapes d'un chapitre */
export const chapterSteps = (w: Saga, age: number, ctx: SagaCtx = {}) => sagaSteps(w, ctx).filter((s) => s.age === age);

/** Le chapitre de cet âge est-il fait ? (le conflit réglé, ou noté fait, ou toutes ses étapes faites) */
export function chapterDone(w: Saga, age: number, ctx: SagaCtx = {}): boolean {
  const d = w.diplo;
  if (d.conflict !== 'open' || d.saga.done.includes(age as Chapter)) return true;
  const st = chapterSteps(w, age, ctx);
  return st.length > 0 && st.every((x) => x.done);
}

/**
 * Note faits les chapitres finis, jusqu'à l'âge du village (un chapitre fait le reste, même si une sortie reprend ensuite ce
 * qu'on tenait). Renvoie l'âge du chapitre qui vient de finir, ou null
 */
export function stepSaga(w: Saga, age: number, ctx: SagaCtx = {}): Chapter | null {
  const d = w.diplo;
  if (!archipelagoOn(w) || !d.ally || !d.path || d.conflict !== 'open') return null;
  let fresh: Chapter | null = null;
  for (const a of CHAPTERS) {
    if (a > age || d.saga.done.includes(a)) continue;
    if (chapterDone(w, a, ctx)) { d.saga.done.push(a); fresh = a; }
  }
  return fresh;
}

/**
 * Une arrivée tardive dans l'archipel (à l'Industriel, au Moderne, au Futuriste) : rien n'est offert, les chapitres des âges
 * passés se jouent à la suite, sans attendre d'âge (leurs batailles sont ouvertes : `BATTLE_AGE` ≤ l'âge du village). La
 * condition du passage d'âge les demande avec celui de l'âge (`chapterItem`). Avant le 24 nov. 2026 au soir, `catchUp`
 * comptait faits les chapitres passés : la fonction ne fait plus rien, gardée pour qui l'appelle encore
 */
export function catchUp(_d: DiploState, _age: number, _clock: number, _dayLen: number): boolean { void RAID_FIRST; return false; }

/** La paix signée, au bout du chapitre du Moderne (provisoire : les Jeux des îles, chantier D, la régleront) */
export function signPeace(w: Saga, ctx: SagaCtx = {}): boolean {
  const d = w.diplo;
  if (d.path !== 'peace' || d.conflict !== 'open') return false;
  // (toutes les étapes d'avant, chapitres passés compris : une arrivée tardive les fait à la suite)
  const st = sagaSteps(w, ctx).filter((x) => x.id !== 'sign');
  if (!d.saga.truce && !d.saga.done.includes(2)) return false;
  if (!st.every((x) => x.done || d.saga.done.includes(x.age))) return false;
  d.conflict = 'peace';
  return true;
}

/**
 * Les conditions du passage d'âge (`Sim.ageProgress`) : le chapitre de l'âge en cours fait. Un libellé par chapitre (celui
 * du Moderne, le conflit réglé), reconnu par le panneau (`ageGo` → `conflict`) et par le conseil
 */
export const CONFLICT_LABEL = 'le conflit des deux îles, réglé';
export const CHAPTER_LABELS: Record<Chapter, string> = {
  2: 'le conflit des deux îles : le chapitre du Médiéval',
  3: 'le conflit des deux îles : le chapitre de l’Industriel',
  4: CONFLICT_LABEL,
};
export const isChapterLabel = (l: string) => CHAPTERS.some((a) => CHAPTER_LABELS[a] === l);

/**
 * La condition du passage vers l'âge `next` (null : aucune, sans archipel ou hors des chapitres) : le chapitre de l'âge, et
 * ceux d'avant pas encore faits (une arrivée tardive les rattrape à la suite) ; have/need : leurs étapes
 */
export function chapterItem(w: Saga, next: number, ctx: SagaCtx = {}): { label: string; have: number; need: number } | null {
  if (!archipelagoOn(w)) return null;
  const a = next - 1;
  if (!inSaga(a)) return null;
  const label = CHAPTER_LABELS[a as Chapter];
  const late = chaptersUpTo(a).filter((c) => !chapterDone(w, c, ctx));
  if (!late.length) return { label, have: 1, need: 1 };
  const st = sagaSteps(w, ctx).filter((x) => late.includes(x.age));
  if (!st.length) return { label, have: 0, need: 1 };
  return { label, have: st.filter((x) => x.done).length, need: st.length };
}

/**
 * Une étape qu'on n'attend pas : « Tenir le camp » quand une bataille de la campagne est déjà ouverte à cet âge (une arrivée
 * tardive). Le port pris, le camp compte pour tenu (`sagaSteps`) : le joueur n'attend pas une sortie pour avancer
 */
export const stepSkipped = (w: Saga, s: SagaStep, age: number) => s.id === 'camp' && battleOpen(w.diplo, age);

/** L'étape du moment : la première pas faite des chapitres ouverts à cet âge (les chapitres en retard d'abord), ou null */
export function stepNow(w: Saga, age: number, ctx: SagaCtx = {}): SagaStep | null {
  const open = chaptersUpTo(age).filter((c) => !chapterDone(w, c, ctx));
  return sagaSteps(w, ctx).find((x) => !x.done && open.includes(x.age) && !stepSkipped(w, x, age)) ?? null;
}

/**
 * La bataille navale qui attend avant cette étape de la campagne : le bras de mer avant le débarquement, le blocus avant le
 * port (null : aucune, ou déjà gagnée). Les anciennes parties à la plage ou au port déjà pris n'en ont pas
 */
export function seaBefore(d: Pick<DiploState, 'path' | 'camp' | 'saga' | 'conflict'>, battle: string): SeaStep | null {
  if (d.path !== 'war' || d.conflict !== 'open') return null;
  if (battle === 'landing' && !d.saga.sea.includes('strait') && !d.camp.held.includes('plage')) return 'strait';
  if (battle === 'port' && !d.saga.sea.includes('blockade') && !d.camp.held.includes('port')) return 'blockade';
  return null;
}

/** Une bataille navale gagnée : notée (une fois) */
export function seaWon(d: Pick<DiploState, 'saga'>, step: SeaStep) { if (!d.saga.sea.includes(step)) d.saga.sea.push(step); }
/** Une bataille navale perdue : elle se rejoue dans `days` jours */
export function seaLost(d: Pick<DiploState, 'saga'>, clock: number, dayLen: number, days: number) { d.saga.seaRetry = clock + days * dayLen; }
/** La bataille navale peut-elle partir (le délai d'une défaite passé) ? */
export const seaReady = (d: Pick<DiploState, 'saga'>, clock: number) => clock >= d.saga.seaRetry;
