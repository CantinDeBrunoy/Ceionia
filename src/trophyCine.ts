/**
 * La petite cinématique d'un trophée qui rejoint la grande place (au retour d'une expédition légendaire) : la file d'attente,
 * le moment calme, le minutage des plans et le chemin de la vue. Rien ici ne touche à three.js ni à la page : la mise en scène
 * est dans `trophyStage.ts`
 */

/** Les trophées qui ont leur cinématique : ceux qu'une expédition rapporte (la couronne du roi des Enfers a la sienne) */
export const CINE_TROPHIES = ['mammoth', 'kraken', 'megalodon', 'dragon'] as const;
const CINE = new Set<string>(CINE_TROPHIES);

/** Durée de la cinématique (s) */
export const TROPHY_CINE_DUR = 5;
/** Le joueur doit être tranquille depuis ce temps (s) : pas de cinématique dès qu'une fenêtre se ferme */
export const CALM_DELAY = 0.8;

/** Les plans (s) : la vue glisse vers la place, tourne autour, puis revient ; le trophée monte de terre entre-temps */
export const SHOT = { approach: 1.5, riseFrom: 1.2, riseTo: 3, burst: 2.9, orbitTo: 4.1, capIn: 1.7, capOut: 4.3 } as const;

export interface TrophyEntry { id: string; t: number; after?: () => void }

/** La file des trophées à montrer, un à la fois */
export class TrophyCineQueue {
  private known: Set<string>;
  queue: TrophyEntry[] = [];
  cur: TrophyEntry | null = null;
  private calmT = 0;

  /** won : les trophées déjà sur la place (une partie rechargée ne rejoue rien) */
  constructor(won: readonly string[]) { this.known = new Set(won); }

  /**
   * Relève les trophées nouveaux et met en file ceux qui ont leur cinématique. after : à faire une fois la cinématique finie
   * (le récit de l'expédition) ; on ne le garde que si elle part tout de suite (calm et rien en cours) : rend vrai dans ce cas,
   * sinon c'est à l'appelant de le faire
   */
  detect(won: readonly string[], after?: () => void, calm = false): boolean {
    const fresh: TrophyEntry[] = [];
    for (const id of won) {
      if (this.known.has(id)) continue;
      this.known.add(id);
      if (CINE.has(id)) fresh.push({ id, t: 0 });
    }
    // (un trophée perdu, une partie remplacée : il pourra revenir)
    for (const id of [...this.known]) if (!won.includes(id)) this.known.delete(id);
    this.queue.push(...fresh);
    if (!after || !fresh.length || !calm || this.cur) return false;
    fresh[fresh.length - 1].after = after;
    this.calmT = CALM_DELAY;
    return true;
  }

  /** Ce trophée attend sa cinématique : on ne le pose pas encore sur la place */
  hidden(id: string) { return this.queue.some((e) => e.id === id); }

  /** Un tour : rend la cinématique qui commence ou celle qui finit */
  update(dt: number, calm: boolean): { start?: TrophyEntry; end?: TrophyEntry } {
    if (this.cur) {
      this.cur.t += dt;
      return this.cur.t >= TROPHY_CINE_DUR ? { end: this.stop() } : {};
    }
    this.calmT = calm ? this.calmT + dt : 0;
    if (!this.queue.length || this.calmT < CALM_DELAY) return {};
    this.cur = this.queue.shift()!;
    this.cur.t = 0;
    return { start: this.cur };
  }

  /** Passer : la cinématique en cours finit tout de suite (rend celle qui finit) */
  skip(): TrophyEntry | null { return this.cur ? this.stop() : null; }

  private stop() {
    const e = this.cur!;
    this.cur = null;
    this.calmT = 0;
    return e;
  }
}

/** Mouvement doux (départ et arrivée lents) */
export const ease = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };

/** La montée du trophée (0 : sous terre, 1 : à sa place), qui ralentit en arrivant */
export function riseAt(t: number) {
  const k = Math.min(1, Math.max(0, (t - SHOT.riseFrom) / (SHOT.riseTo - SHOT.riseFrom)));
  return 1 - (1 - k) ** 3;
}

/** L'opacité du bandeau */
export function captionAt(t: number) {
  return Math.min(1, Math.max(0, (t - SHOT.capIn) / 0.4), Math.max(0, (SHOT.capOut - t) / 0.4));
}

export interface CineView { x: number; z: number; yaw: number; pitch: number; dist: number }

/** Ramène un angle entre −π et π */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * La vue à l'instant t : de `from` (la vue du joueur) jusqu'à `close` (le trophée de près), un lent tour autour, puis le retour
 * à `from`. La distance glisse en proportion (de très loin, la vue ne fonce pas d'un coup sur la place)
 */
export function cineView(t: number, from: CineView, close: CineView): CineView {
  const yaw0 = from.yaw + wrap(close.yaw - from.yaw);
  const orbit = (k: number) => ({ ...close, yaw: yaw0 + 0.5 * k, dist: close.dist * (1 - 0.1 * k) });
  const mix = (a: CineView, b: CineView, k: number): CineView => ({
    x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + (b.yaw - a.yaw) * k, pitch: a.pitch + (b.pitch - a.pitch) * k,
    dist: Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * k),
  });
  if (t < SHOT.approach) return mix(from, { ...close, yaw: yaw0 }, ease(t / SHOT.approach));
  const ko = (Math.min(t, SHOT.orbitTo) - SHOT.approach) / (SHOT.orbitTo - SHOT.approach);
  // le tour : régulier au milieu, doux aux deux bouts
  const end = orbit(ease(ko) * 0.5 + ko * 0.5);
  if (t < SHOT.orbitTo) return end;
  return mix(end, from, ease((t - SHOT.orbitTo) / (TROPHY_CINE_DUR - SHOT.orbitTo)));
}

/**
 * L'angle d'où regarder le trophée sans qu'un arbre, un bâtiment ou une colline ne le cache : de face si possible (les
 * trophées sont tournés vers `front`), sinon un peu de côté, ou d'un peu plus haut. top(x, z) : le haut de ce qui se dresse en
 * ce point (le sol, un arbre, un bâtiment). On suit le rayon du milieu du trophée jusqu'à l'œil et on compte ce qui le coupe
 */
export function pickAngle(at: { x: number; y: number; z: number; h: number }, dist: number, front: number, top: (x: number, z: number) => number) {
  let best = { yaw: front, pitch: 0.5 }, bestScore = Infinity;
  const y0 = at.y + at.h * 0.5;
  for (const pitch of [0.5, 0.68, 0.86]) for (const dy of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
    const yaw = front + dy, sx = Math.sin(yaw), sz = Math.cos(yaw), tp = Math.tan(pitch), reach = Math.cos(pitch) * dist;
    let hits = 0;
    // (on part d'une demi-case : le socle et la place ne comptent pas)
    for (let s = 0.6; s <= reach; s += 0.35) if (top(at.x + sx * s, at.z + sz * s) > y0 + s * tp) hits++;
    // de face et d'assez bas, c'est mieux : on ne s'en écarte que si ça dégage la vue
    const score = hits * 10 + Math.abs(dy) * 1.5 + (pitch - 0.5) * 6;
    if (score < bestScore) { bestScore = score; best = { yaw, pitch }; }
  }
  return best;
}
