import type { World } from '../world/world';
import type { KindId } from '../build/catalog';
import { archipelagoOn } from '../world/expand';
import { PEACE_CHAIN, WAR_MISSION, type DiploState } from './diplomacy';
import { RAID_FIRST } from './campaign';

/**
 * Le fil des âges (chantier A du nouveau monde, décision de l'auteur du 24 nov. 2026) : le conflit des deux îles ne se règle
 * plus au Médiéval, il s'étale sur trois **chapitres**, le Médiéval, l'Industriel et le Moderne, pour la guerre comme pour la
 * paix. Chaque chapitre fait est une condition du passage à l'âge suivant ; le dernier règle le conflit. Règles pures, état
 * sauvegardé dans `diplo.saga`. Voir `docs/diplomatie.md`, « Le fil des âges ».
 *
 * Contenu provisoire, en attendant les chantiers suivants (marqué `stub` dans les étapes) : la bataille navale et l'escorte
 * du convoi (chantier B) viendront avant le débarquement et les émissaires ; le fort, la ville de garnison et les bâtiments
 * de la concession (chantier C) au fil des chapitres ; la bataille épique et les Jeux des îles (chantier D) au Moderne.
 */

/** Les âges des chapitres : le Médiéval, l'Industriel, le Moderne. Le conflit s'ouvre au premier, se règle au dernier */
export const FIRST_CHAPTER = 2, LAST_CHAPTER = 4;
export type Chapter = 2 | 3 | 4;
export const CHAPTERS: Chapter[] = [2, 3, 4];
/** L'âge est-il celui d'un chapitre ? (au-delà, le conflit est réglé d'office : `settleLate`) */
export const inSaga = (age: number) => age >= FIRST_CHAPTER && age <= LAST_CHAPTER;

export interface SagaState {
  /** les chapitres faits (leur âge) : gardés même si l'on reperd ensuite ce qu'on tenait */
  done: Chapter[];
  /** paix : la trêve est signée (l'ambassade de la paix, au Médiéval) ; la paix elle-même vient au Moderne */
  truce: boolean;
}
export const newSaga = (): SagaState => ({ done: [], truce: false });

/** Relit l'état sauvegardé (partie d'avant les chapitres : rien de fait, voir `catchUp` pour ce qu'on lui compte) */
export function readSaga(s: any): SagaState {
  const out = newSaga();
  if (!s || typeof s !== 'object') return out;
  if (Array.isArray(s.done)) out.done = CHAPTERS.filter((a) => s.done.includes(a));
  out.truce = s.truce === true;
  return out;
}

/** Ce que les règles lisent hors du monde : le nombre de bâtiments d'un genre (les étapes de construction de la paix) */
export interface SagaCtx { count?(k: KindId): number }

/**
 * Où mène une étape : une expédition (`mission`), la bataille de la campagne (`battle`), un bâtiment à poser (`build`), la
 * paix à signer (`sign`), ou rien qu'attendre (`wait` : la première sortie rivale contre le camp)
 */
export type StepGo = 'mission' | 'battle' | 'build' | 'sign' | 'wait';
export interface SagaStep {
  id: string; age: Chapter; done: boolean; go: StepGo;
  mission?: string; kind?: KindId;
  /** remplaçant provisoire d'une étape d'un chantier à venir (B, C ou D) */
  stub?: 'B' | 'C' | 'D';
}

type Saga = Pick<World, 'isles' | 'diplo' | 'exp'>;

/**
 * Les étapes de la voie prise, des trois chapitres, dans l'ordre (vide sans voie). Le conflit réglé : toutes faites.
 * - La guerre : au Médiéval, les éclaireurs, le débarquement, puis tenir le camp (repousser la première sortie) ; à
 *   l'Industriel, le port, puis la tour du rempart ; au Moderne, l'assaut de la ville.
 * - La paix : au Médiéval, les émissaires, puis l'ambassade de la paix (la trêve) ; à l'Industriel, un second comptoir chez
 *   l'allié (provisoire : le port marchand partagé, chantier C) ; au Moderne, l'ambassade bâtie puis la paix signée
 *   (provisoire : les Jeux des îles, chantier D).
 */
export function sagaSteps(w: Saga, ctx: SagaCtx = {}): SagaStep[] {
  const d = w.diplo, over = d.conflict !== 'open', exp = (id: string) => w.exp.done.includes(id);
  const count = (k: KindId) => ctx.count?.(k) ?? 0;
  if (!d.path) return [];
  const held = d.camp.held, s: SagaStep[] = [];
  if (d.path === 'war') {
    // (chantier B : la bataille du bras de mer viendra ici, avant le débarquement)
    s.push({ id: WAR_MISSION, age: 2, go: 'mission', mission: WAR_MISSION, done: d.battle !== 'none' || exp(WAR_MISSION) });
    s.push({ id: 'plage', age: 2, go: 'battle', done: held.includes('plage') });
    s.push({ id: 'camp', age: 2, go: 'wait', done: held.includes('plage') && (d.camp.raids > 0 || held.length > 1) });
    // (chantier B : le blocus du port, avant sa prise ; chantier C : le fort, après la tour)
    s.push({ id: 'port', age: 3, go: 'battle', done: held.includes('port') });
    s.push({ id: 'tour', age: 3, go: 'battle', done: held.includes('tour') });
    // (chantier C : la ville de garnison ; chantier D : la bataille des deux îles remplacera l'assaut)
    s.push({ id: 'assault', age: 4, go: 'battle', done: d.conflict === 'won', stub: 'D' });
  } else {
    // (chantier B : l'escorte du premier convoi viendra ici, avant les émissaires)
    const [envoys, truce] = PEACE_CHAIN;
    s.push({ id: envoys, age: 2, go: 'mission', mission: envoys, done: exp(envoys) });
    s.push({ id: truce, age: 2, go: 'mission', mission: truce, done: d.saga.truce || exp(truce) });
    // (provisoire : le port marchand partagé, les maisons communes et le sauvetage, chantiers B et C)
    s.push({ id: 'post2', age: 3, go: 'build', kind: 'tradepost', done: count('tradepost') >= 2, stub: 'C' });
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
 * Une partie qui prend sa voie au-delà du Médiéval (l'archipel accepté tard, une partie d'avant les chapitres) : les chapitres
 * des âges passés sont comptés faits, avec ce qu'ils donnent (la guerre : la plage prise, son camp et sa caserne avancée, puis
 * le port et la tour à l'âge d'après ; la paix : le comptoir chez le rival et la trêve). On commence au chapitre de l'âge du
 * village. Renvoie vrai si quelque chose a été compté
 */
export function catchUp(d: DiploState, age: number, clock: number, dayLen: number): boolean {
  if (!d.ally || !d.path || d.conflict !== 'open') return false;
  let any = false;
  for (const a of CHAPTERS) {
    if (a >= age || d.saga.done.includes(a)) continue;
    any = true;
    d.saga.done.push(a);
    if (d.path === 'war') {
      const c = d.camp, want = a === 2 ? ['plage'] as const : ['plage', 'port', 'tour'] as const;
      for (const f of want) if (!c.held.includes(f)) c.held.push(f);
      if (d.battle === 'none') d.battle = 'ready';
      if (!c.raid) c.raid = clock + RAID_FIRST * dayLen;
    } else if (a === 2) { d.post = true; d.saga.truce = true; }
  }
  return any;
}

/** La paix signée, au bout du chapitre du Moderne (provisoire : les Jeux des îles, chantier D, la régleront) */
export function signPeace(w: Saga, ctx: SagaCtx = {}): boolean {
  const d = w.diplo;
  if (d.path !== 'peace' || d.conflict !== 'open') return false;
  const st = chapterSteps(w, LAST_CHAPTER, ctx).filter((x) => x.id !== 'sign');
  if (!d.saga.done.includes(2) && !d.saga.truce) return false;
  if (!st.every((x) => x.done)) return false;
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

/** La condition du passage vers l'âge `next` (null : aucune, sans archipel ou hors des chapitres) ; have/need : les étapes */
export function chapterItem(w: Saga, next: number, ctx: SagaCtx = {}): { label: string; have: number; need: number } | null {
  if (!archipelagoOn(w)) return null;
  const a = next - 1;
  if (!inSaga(a)) return null;
  const label = CHAPTER_LABELS[a as Chapter];
  if (chapterDone(w, a, ctx)) return { label, have: 1, need: 1 };
  const st = chapterSteps(w, a, ctx);
  if (!st.length) return { label, have: 0, need: 1 };
  return { label, have: st.filter((x) => x.done).length, need: st.length };
}

/** L'étape du moment dans le chapitre de l'âge (la première pas faite), ou null */
export function stepNow(w: Saga, age: number, ctx: SagaCtx = {}): SagaStep | null {
  if (chapterDone(w, age, ctx)) return null;
  return chapterSteps(w, age, ctx).find((x) => !x.done) ?? null;
}
