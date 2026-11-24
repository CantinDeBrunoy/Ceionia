import type { World } from '../world/world';
import type { People } from '../world/archipelago';
import { tr } from '../i18n';
import { archipelagoOn, canChangePath, isleOffered, isleName, Path, rivalOf, type BoonKind, type DiploState } from './diplomacy';
import { ISLE_MISSIONS } from './isleMissions';
import { MISSIONS, type Mission } from './missions';
import { battleOpen, campaignNext, corps, corpsMax, raidDue } from './campaign';
import { AGES, type KindId } from '../build/catalog';
import { CHAPTERS, chapterDone, sagaSteps, stepSkipped, seaReady, isSeaStep, type Chapter, type SagaStep } from './saga';
import { MIN_FLEET } from './fleet';

/**
 * La feuille de route du conflit des deux îles (retour de joueurs, 22 nov. 2026 : après « Aider notre allié » ou « Négocier
 * la paix », on ne savait plus quoi faire). Une fois la voie prise, une fenêtre montre ce qui prépare la suite (les visites
 * facultatives sur les îles, avec ce qu'elles rapportent pour cette voie) et les étapes qui la déclenchent, dans l'ordre :
 * en trois chapitres, un par âge, du Médiéval au Moderne (le fil des âges, `sim/saga.ts`) : seul celui de l'âge du village
 * est déplié, les autres montrent leur titre et l'âge où ils s'ouvrent. Règle pure : `DiploChoice` la dessine (`showRoad`),
 * `Game.openDiploChoice` la rouvre
 */

/** Une visite facultative sur les îles, vue depuis la voie prise */
export interface RoadPrep { id: string; icon: string; title: string; gain: string; done: boolean; running: boolean }
/**
 * Une étape de la suite : faite, à faire maintenant, ou plus tard (après la précédente). `go` dit où mène son bouton :
 * l'expédition (`mission`), la bataille (`battle`), ou rien (`wait` : en cours, ou délai)
 */
export interface RoadStep {
  id: string; icon: string; title: string; sub: string; state: 'done' | 'now' | 'next'; go: 'mission' | 'battle' | 'naval' | 'fleet' | 'build' | 'sign' | 'wait';
  /** le chapitre de l'étape (son âge) */
  age: Chapter;
  /** le bâtiment à poser (`build`) */
  kind?: KindId;
}
/** Un chapitre : fait, celui de l'âge (déplié), ou plus tard (son titre et l'âge où il s'ouvre) */
export interface RoadChapter { age: Chapter; title: string; state: 'done' | 'now' | 'later'; sub: string }
export interface Road {
  path: Path; ally: People; rival: People; prep: RoadPrep[];
  /** toutes les étapes, des trois chapitres, dans l'ordre */
  steps: RoadStep[];
  chapters: RoadChapter[];
  /** on peut encore changer de voie (pas une fois la bataille engagée) */
  canChange: boolean;
  /** une sortie rivale fond sur le camp : la défendre passe avant tout (son bouton mène à la bataille) */
  alert?: string;
  /** l'état de la campagne, une ligne chacun (le corps, la prochaine sortie) */
  notes: string[];
}

/** Ce que gagne une visite des îles pour une voie (vide : rien pour elle), d'après ses meilleurs gains */
export function prepGain(m: Mission, path: Path): string {
  const best: Partial<Record<BoonKind, number>> = {};
  for (const c of m.choices) for (const e of c.win) if (e.t === 'boon') best[e.kind] = Math.max(best[e.kind] ?? 0, e.n);
  if (path === 'peace') return (best.peace ?? 0) > 0 ? tr('pourparlers plus sûrs') : '';
  const out: string[] = [];
  if ((best.allies ?? 0) > 0) out.push(tr('+{n} alliés', { n: best.allies! }));
  if ((best.ours ?? 0) > 0) out.push(tr('+{n} soldats', { n: best.ours! }));
  if ((best.foes ?? 0) > 0) out.push(tr('−{n} ennemis', { n: best.foes! }));
  return out.join(' · ');
}

export interface RoadCtx {
  /** une expédition de cet id est-elle en route ? */
  running(id: string): boolean;
  /** durée d'un jour de jeu (s), pour dire le délai d'une bataille perdue */
  dayLen: number;
  /** l'âge du village (le chapitre en cours) ; absent : le Médiéval */
  age?: number;
  /** le nombre de bâtiments d'un genre (les étapes de construction de la paix) */
  count?(k: KindId): number;
  /** notre flotte : les navires à flot, ceux en chantier (absent : aucune) */
  fleet?: { afloat: number; arming: number };
}

/** Le titre d'un chapitre, selon la voie */
export function chapterTitle(path: Path, age: Chapter): string {
  if (path === 'war') return age === 2 ? tr('La tête de pont') : age === 3 ? tr('Les avant-postes') : tr('La bataille des deux îles');
  return age === 2 ? tr('La trêve') : age === 3 ? tr('Le commerce des deux îles') : tr('La paix des îles');
}

/** Le titre d'une étape (pour le conseil et la feuille de route) */
export function stepTitle(id: string, d: Pick<DiploState, 'ally'>): string {
  const rival = d.ally ? rivalOf(d.ally) : 'asie';
  const m = MISSIONS.find((x) => x.id === id);
  if (m) return tr(m.title);
  const t: Record<string, () => string> = {
    plage: () => tr('Le débarquement'), camp: () => tr('Tenir le camp'), port: () => tr('Le port de {isle}', { isle: isleName(rival) }),
    tour: () => tr('La tour du rempart'), assault: () => tr('L’assaut'), post2: () => tr('Un second comptoir'),
    strait: () => tr('La bataille du bras de mer'), blockade: () => tr('Le blocus du port'), convoy: () => tr('L’escorte du premier convoi'),
    embassy: () => tr('L’ambassade'), sign: () => tr('Signer la paix des îles'),
  };
  return t[id]?.() ?? id;
}

const ICON: Record<string, string> = { strait: '⚓', blockade: '⛓️', convoy: '🚢', plage: '⛵', camp: '🏕️', port: '⚓', tour: '🏰', assault: '⚔️', post2: '💰', embassy: '🌐', sign: '📜' };

/** Le sous-titre d'une étape pas encore faite */
function subOf(id: string, rival: People): string {
  switch (id) {
    case 'allywar': return tr('reconnaître la côte de {isle}', { isle: isleName(rival) });
    case 'strait': return tr('notre flotte et celle de l’allié contre la leur');
    case 'blockade': return tr('fermer la mer au port : plus de renforts par bateau');
    case 'convoy': return tr('trois navires marchands à mener chez eux, malgré les pirates');
    case 'plage': return tr('la plage : un camp et une caserne avancée');
    case 'camp': return tr('repousser la première sortie rivale');
    case 'port': return tr('un avant-poste et sa garnison');
    case 'tour': return tr('une tour qui tire, et ses archers');
    case 'assault': return tr('les remparts, puis le palais');
    case 'envoys': return tr('ouvre leur comptoir et la discussion');
    case 'truce': return tr('une trêve signée : les combats cessent');
    case 'post2': return tr('chez notre allié : le commerce des deux îles grandit');
    case 'embassy': return tr('la maison des trois peuples, sur notre île');
    case 'sign': return tr('les deux chefs signent la paix chez nous');
  }
  return '';
}

/** La feuille de route, ou null (pas d'archipel, pas d'allié, pas de voie, ou le conflit réglé) */
export function roadView(w: Pick<World, 'isles' | 'diplo' | 'exp'>, ctx: RoadCtx): Road | null {
  const d = w.diplo;
  if (!archipelagoOn(w) || !d.ally || !d.path || d.conflict !== 'open') return null;
  const path = d.path, ally = d.ally, rival = rivalOf(ally), age = ctx.age ?? 2, sctx = { count: ctx.count };
  const prep: RoadPrep[] = [];
  // (la trêve signée, plus de pourparlers : les visites qui les rendaient plus sûrs ne servent plus à la paix)
  for (const m of path === 'peace' && d.saga.truce ? [] : ISLE_MISSIONS) {
    if (!isleOffered(w, m.id, m.isle!.when)) continue;
    const gain = prepGain(m, path);
    if (!gain) continue;
    prep.push({ id: m.id, icon: m.icon, title: m.title, gain, done: w.exp.done.includes(m.id), running: ctx.running(m.id) });
  }
  // (celles qui restent à faire d'abord)
  prep.sort((a, b) => Number(a.done) - Number(b.done));

  // les chapitres : faits, celui de l'âge (ou d'avant, pas encore fait), ou plus tard
  const chapters: RoadChapter[] = CHAPTERS.map((a): RoadChapter => {
    const title = chapterTitle(path, a);
    if (chapterDone(w, a, sctx)) return { age: a, title, state: 'done', sub: tr('Chapitre fait') };
    // (un chapitre d'un âge passé, pas encore fait : une arrivée tardive le rattrape maintenant)
    if (a < age) return { age: a, title, state: 'now', sub: tr('Chapitre en retard (âge : {age}), à rattraper', { age: AGES[a].name }) };
    if (a === age) return { age: a, title, state: 'now', sub: tr('Le chapitre de l’âge : {age}', { age: AGES[a].name }) };
    return { age: a, title, state: 'later', sub: tr('S’ouvre à l’âge : {age}', { age: AGES[a].name }) };
  });
  const open = new Set(chapters.filter((c) => c.state === 'now').map((c) => c.age));

  // les étapes : celle du moment est la première pas faite d'un chapitre ouvert
  const clock = w.exp.clock, raid = path === 'war' && raidDue(d, clock);
  const wait = d.battle === 'lost' ? Math.max(0, d.retry - clock) : 0;
  const all = sagaSteps(w, sctx), first = all.find((s) => !s.done && open.has(s.age) && !stepSkipped(w, s, age));
  const view = (s: SagaStep): RoadStep => {
    const now = s === first, m = s.mission ? MISSIONS.find((x) => x.id === s.mission) : undefined, run = !!s.mission && ctx.running(s.mission);
    const st: RoadStep = { id: s.id, icon: m?.icon ?? ICON[s.id] ?? '🧭', title: stepTitle(s.id, d), sub: subOf(s.id, rival), state: s.done ? 'done' : now ? 'now' : 'next', go: 'wait', age: s.age, kind: s.kind };
    if (s.done) { st.sub = tr('C’est fait'); return st; }
    // (arrivée tardive : le camp se tiendra en prenant le port, pas en attendant une sortie)
    if (stepSkipped(w, s, age)) { st.sub = tr('se fait en prenant le port'); return st; }
    if (!now) return st;
    if (s.go === 'mission') { st.go = run ? 'wait' : 'mission'; if (run) st.sub = tr('L’expédition est en route'); }
    else if (s.go === 'naval') {
      // une bataille navale : il faut d'abord des navires de guerre (le chantier naval), puis le délai d'une défaite
      const f = ctx.fleet ?? { afloat: 0, arming: 0 }, seaWait = Math.max(0, d.saga.seaRetry - clock);
      if (f.afloat < MIN_FLEET) { st.go = 'fleet'; st.sub = f.arming && f.afloat + f.arming >= MIN_FLEET ? tr('nos navires de guerre sont en chantier ({n}/{m} à flot)', { n: f.afloat, m: MIN_FLEET }) : tr('armez au moins {m} navires de guerre au chantier naval ({n}/{m})', { n: f.afloat, m: MIN_FLEET }); }
      else if (!seaReady(d, clock)) { const n = Math.max(1, Math.ceil(seaWait / ctx.dayLen)); st.sub = n === 1 ? tr('notre flotte se refait : encore un jour') : tr('notre flotte se refait : encore {n} jours', { n }); }
      else st.go = 'naval';
    }
    else if (s.go === 'battle') {
      if (wait > 0) { const n = Math.max(1, Math.ceil(wait / ctx.dayLen)); st.sub = n === 1 ? tr('nos troupes se refont : encore un jour') : tr('nos troupes se refont : encore {n} jours', { n }); }
      else if (!raid && battleOpen(d, age)) {
        st.go = 'battle';
        // (une sortie a repris ce qu'on tenait : on le reprend d'abord)
        const k = campaignNext(d), what = k === 'port' ? tr('le port') : k === 'tour' ? tr('la tour du rempart') : tr('la plage');
        if ((s.id === 'assault' && k !== 'assault') || (s.id === 'tour' && (k === 'landing' || k === 'port')) || (s.id === 'port' && k === 'landing')) st.sub = tr('d’abord reprendre {what}', { what });
      }
    } else if (s.go === 'wait') {
      // (la première sortie rivale : elle vient d'elle-même, la ligne du corps dit quand ; arrivée, le bouton mène à la défense)
      if (raid) st.go = 'battle';
    } else st.go = s.go;
    return st;
  };
  const steps = all.map(view);

  const notes: string[] = [];
  let alert: string | undefined;
  // notre flotte, dès qu'une bataille navale reste à livrer (ou qu'on a des navires)
  const f = ctx.fleet;
  if (f && (f.afloat + f.arming > 0 || all.some((s) => isSeaStep(s.id) && !s.done)))
    notes.push(f.arming ? tr('Notre flotte : {n} navires de guerre, {k} en chantier', { n: f.afloat, k: f.arming }) : tr('Notre flotte : {n} navires de guerre', { n: f.afloat }));
  if (path === 'war') {
    alert = raid ? tr('Une sortie rivale fond sur notre camp') : undefined;
    if (d.camp.held.length) {
      const [s0, a0] = corps(d, age), [s1, a1] = corpsMax(d, age);
      notes.push(tr('Notre corps : {n} soldats sur {m}', { n: s0 + a0, m: s1 + a1 }) + (s0 + a0 < s1 + a1 ? tr(' · la caserne avancée le refait') : ''));
      if (!raid && d.camp.raid > clock && open.size) { const n = Math.max(1, Math.ceil((d.camp.raid - clock) / ctx.dayLen)); notes.push(n === 1 ? tr('Prochaine sortie rivale d’ici un jour') : tr('Prochaine sortie rivale dans {n} jours', { n })); }
    }
  }
  // le chapitre de l'âge fait : on le dit, et ce qui vient (le passage d'âge)
  if (!open.size) {
    const next = chapters.find((c) => c.state === 'later');
    if (next) notes.push(tr('Chapitre fait. La suite, « {title} », s’ouvre à l’âge : {age}.', { title: next.title, age: AGES[next.age].name }));
  } else if (open.size > 1 || [...open][0] < age) {
    // (une arrivée tardive : les chapitres en retard se jouent à la suite, sans attendre d'âge)
    notes.push(age > 4 ? tr('Arrivés tard dans l’archipel : les trois chapitres se jouent à la suite, jusqu’au règlement du conflit.') : tr('Arrivés tard dans l’archipel : les chapitres en retard se jouent à la suite, sans attendre d’âge.'));
  }
  return { path, ally, rival, prep, steps, chapters, canChange: canChangePath(d), alert, notes };
}
