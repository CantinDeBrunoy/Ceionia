import type { World } from '../world/world';
import type { People } from '../world/archipelago';
import { tr } from '../i18n';
import { archipelagoOn, isleOffered, isleName, Path, PEACE_CHAIN, rivalOf, WAR_MISSION, type BoonKind } from './diplomacy';
import { ISLE_MISSIONS } from './isleMissions';
import { MISSIONS, type Mission } from './missions';

/**
 * La feuille de route du conflit des deux îles (retour de joueurs, 22 nov. 2026 : après « Aider notre allié » ou « Négocier
 * la paix », on ne savait plus quoi faire). Une fois la voie prise, une fenêtre montre ce qui prépare la suite (les visites
 * facultatives sur les îles, avec ce qu'elles rapportent pour cette voie) et les étapes qui la déclenchent, dans l'ordre :
 * la guerre (les éclaireurs, puis la bataille), la paix (les émissaires, puis l'ambassade). Règle pure : `DiploChoice` la
 * dessine (`showRoad`), `Game.openDiploChoice` la rouvre
 */

/** Une visite facultative sur les îles, vue depuis la voie prise */
export interface RoadPrep { id: string; icon: string; title: string; gain: string; done: boolean; running: boolean }
/**
 * Une étape de la suite : faite, à faire maintenant, ou plus tard (après la précédente). `go` dit où mène son bouton :
 * l'expédition (`mission`), la bataille (`battle`), ou rien (`wait` : en cours, ou délai)
 */
export interface RoadStep { id: string; icon: string; title: string; sub: string; state: 'done' | 'now' | 'next'; go: 'mission' | 'battle' | 'wait' }
export interface Road {
  path: Path; ally: People; rival: People; prep: RoadPrep[]; steps: RoadStep[];
  /** on peut encore changer de voie (pas une fois la bataille engagée) */
  canChange: boolean;
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
}

/** La feuille de route, ou null (pas d'archipel, pas d'allié, pas de voie, ou le conflit réglé) */
export function roadView(w: Pick<World, 'isles' | 'diplo' | 'exp'>, ctx: RoadCtx): Road | null {
  const d = w.diplo;
  if (!archipelagoOn(w) || !d.ally || !d.path || d.conflict !== 'open') return null;
  const path = d.path, ally = d.ally, rival = rivalOf(ally);
  const prep: RoadPrep[] = [];
  for (const m of ISLE_MISSIONS) {
    if (!isleOffered(w, m.id, m.isle!.when)) continue;
    const gain = prepGain(m, path);
    if (!gain) continue;
    prep.push({ id: m.id, icon: m.icon, title: m.title, gain, done: w.exp.done.includes(m.id), running: ctx.running(m.id) });
  }
  // (celles qui restent à faire d'abord)
  prep.sort((a, b) => Number(a.done) - Number(b.done));
  const steps: RoadStep[] = [];
  const mission = (id: string, sub: string, before: boolean): RoadStep => {
    const m = MISSIONS.find((x) => x.id === id), done = w.exp.done.includes(id), run = ctx.running(id);
    return {
      id, icon: m?.icon ?? '🧭', title: m?.title ?? id,
      sub: done ? tr('C’est fait') : run ? tr('L’expédition est en route') : sub,
      state: done ? 'done' : before ? 'now' : 'next', go: done || run ? 'wait' : 'mission',
    };
  };
  if (path === 'peace') {
    const [envoys, truce] = PEACE_CHAIN, first = w.exp.done.includes(envoys);
    steps.push(mission(envoys, tr('ouvre leur comptoir et la discussion'), true));
    steps.push(mission(truce, tr('la paix signée : une fête, un monument'), first));
  } else {
    const scouted = d.battle !== 'none' || w.exp.done.includes(WAR_MISSION);
    const s = mission(WAR_MISSION, tr('reconnaître la côte de {isle}', { isle: isleName(rival) }), true);
    if (scouted) { s.state = 'done'; s.go = 'wait'; s.sub = tr('C’est fait'); }
    steps.push(s);
    const wait = d.battle === 'lost' ? Math.max(0, d.retry - w.exp.clock) : 0;
    steps.push({
      id: 'battle', icon: '⚔️', title: tr('La bataille de {isle}', { isle: isleName(rival) }),
      sub: wait > 0 ? tr('nos troupes se refont : encore {n} jours', { n: Math.max(1, Math.ceil(wait / ctx.dayLen)) }) : tr('la plage, le port, les remparts, le palais'),
      state: scouted ? 'now' : 'next', go: scouted && wait <= 0 ? 'battle' : 'wait',
    });
  }
  return { path, ally, rival, prep, steps, canChange: d.battle === 'none' };
}
