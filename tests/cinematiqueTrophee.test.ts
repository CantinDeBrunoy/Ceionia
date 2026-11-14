import { describe, it, expect } from 'vitest';
import { TrophyCineQueue, TROPHY_CINE_DUR, CALM_DELAY, SHOT, cineView, riseAt, captionAt, pickAngle } from '../src/trophyCine';

/** Fait tourner la file pendant `s` secondes, par pas de 0,1 s ; rend ce qui a commencé et fini */
function run(q: TrophyCineQueue, s: number, calm = true) {
  const started: string[] = [], ended: string[] = [];
  for (let t = 0; t < s - 1e-9; t += 0.1) {
    const r = q.update(0.1, calm);
    if (r.start) started.push(r.start.id);
    if (r.end) ended.push(r.end.id);
  }
  return { started, ended };
}

describe('cinématique d’un trophée sur la place', () => {
  it('ne rejoue rien au chargement : les trophées déjà gagnés sont connus', () => {
    const q = new TrophyCineQueue(['mammoth', 'dragon']);
    q.detect(['mammoth', 'dragon']);
    expect(q.queue).toEqual([]);
    expect(run(q, 3).started).toEqual([]);
  });

  it('un trophée nouveau attend un moment calme, puis joue 5 s', () => {
    const q = new TrophyCineQueue([]);
    q.detect(['mammoth']);
    expect(q.hidden('mammoth')).toBe(true);
    // une fenêtre ouverte : rien ne part
    expect(run(q, 10, false).started).toEqual([]);
    // le calme revenu, il faut encore CALM_DELAY avant de partir
    const a = run(q, CALM_DELAY - 0.2);
    expect(a.started).toEqual([]);
    const b = run(q, 0.4);
    expect(b.started).toEqual(['mammoth']);
    expect(q.hidden('mammoth')).toBe(false);
    expect(q.cur?.id).toBe('mammoth');
    const c = run(q, TROPHY_CINE_DUR + 0.2);
    expect(c.ended).toEqual(['mammoth']);
    expect(q.cur).toBeNull();
  });

  it('pas de cinématique pour la couronne du roi des Enfers (elle a la sienne)', () => {
    const q = new TrophyCineQueue([]);
    q.detect(['hellking']);
    expect(q.queue).toEqual([]);
  });

  it('une seule à la fois : la suivante attend la fin de la première et un nouveau moment calme', () => {
    const q = new TrophyCineQueue([]);
    q.detect(['kraken']);
    run(q, CALM_DELAY + 0.2);
    expect(q.cur?.id).toBe('kraken');
    q.detect(['kraken', 'megalodon']);
    expect(q.hidden('megalodon')).toBe(true);
    const r = run(q, TROPHY_CINE_DUR + CALM_DELAY + 0.5);
    expect(r.ended).toEqual(['kraken']);
    expect(r.started).toEqual(['megalodon']);
  });

  it('passer arrête la cinématique en cours', () => {
    const q = new TrophyCineQueue([]);
    q.detect(['dragon']);
    run(q, CALM_DELAY + 0.2);
    expect(q.skip()?.id).toBe('dragon');
    expect(q.cur).toBeNull();
    expect(q.skip()).toBeNull();
  });

  it('le récit attend la fin de la cinématique quand elle part tout de suite, sinon il ne la garde pas', () => {
    let shown = 0;
    const q = new TrophyCineQueue([]);
    // le joueur est tranquille : le récit est gardé et vient à la fin
    expect(q.detect(['mammoth'], () => shown++, true)).toBe(true);
    const r = run(q, CALM_DELAY + 0.1);
    expect(r.started).toEqual(['mammoth']);
    expect(shown).toBe(0);
    q.skip()!.after?.();
    expect(shown).toBe(1);
    // une fenêtre ouverte : le récit se montre tout de suite (à l'appelant), la cinématique attend
    const q2 = new TrophyCineQueue([]);
    expect(q2.detect(['dragon'], () => shown++, false)).toBe(false);
    expect(q2.queue.map((e) => e.after)).toEqual([undefined]);
    // une expédition sans trophée : rien à garder
    expect(q2.detect(['dragon'], () => shown++, true)).toBe(false);
  });

  it('la vue part de celle du joueur, s’approche du trophée, tourne, puis revient', () => {
    const from = { x: 10, z: 10, yaw: 0.75 + Math.PI * 2, pitch: 0.85, dist: 80 };
    const close = { x: 40, z: 30, yaw: 0.75, pitch: 0.42, dist: 6 };
    const v0 = cineView(0, from, close), v1 = cineView(SHOT.approach, from, close), v2 = cineView(SHOT.orbitTo, from, close), v3 = cineView(TROPHY_CINE_DUR, from, close);
    expect(v0.x).toBeCloseTo(10); expect(v0.dist).toBeCloseTo(80);
    expect(v1.x).toBeCloseTo(40); expect(v1.dist).toBeCloseTo(6);
    // (l'angle du joueur, à un tour près : on ne fait pas un tour complet pour rejoindre le trophée)
    expect(v1.yaw).toBeCloseTo(from.yaw);
    expect(v2.yaw - v1.yaw).toBeCloseTo(0.5);
    expect(v3).toEqual(expect.objectContaining({ x: 10, z: 10, pitch: 0.85 }));
    expect(v3.dist).toBeCloseTo(80); expect(v3.yaw).toBeCloseTo(from.yaw);
    // pas de saut d'une image à l'autre
    for (let t = 0; t < TROPHY_CINE_DUR; t += 0.05) {
      const a = cineView(t, from, close), b = cineView(t + 0.05, from, close);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(3);
      expect(Math.abs(a.yaw - b.yaw)).toBeLessThan(0.1);
    }
  });

  it('le trophée monte de terre, le bandeau s’affiche puis s’efface', () => {
    expect(riseAt(0)).toBe(0);
    expect(riseAt(SHOT.riseFrom)).toBe(0);
    expect(riseAt((SHOT.riseFrom + SHOT.riseTo) / 2)).toBeGreaterThan(0.5);
    expect(riseAt(SHOT.riseTo)).toBe(1);
    expect(captionAt(0)).toBe(0);
    expect(captionAt(3)).toBe(1);
    expect(captionAt(TROPHY_CINE_DUR)).toBe(0);
  });

  it('la vue choisit un angle dégagé : de face sur une place nue, de côté si un bois cache le trophée', () => {
    const at = { x: 50, y: 0, z: 50, h: 0.5 };
    expect(pickAngle(at, 5, 0.75, () => 0)).toEqual({ yaw: 0.75, pitch: 0.5 });
    // un bois devant le trophée, du côté de la vue de face (de 1 à 6 cases, dans un angle de 0,3 radian)
    const wood = (x: number, z: number) => {
      const dx = x - 50, dz = z - 50, d = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
      return d > 1 && d < 6 && Math.abs(Math.atan2(Math.sin(a - 0.75), Math.cos(a - 0.75))) < 0.3 ? 1.8 : 0;
    };
    const v = pickAngle(at, 5, 0.75, wood);
    expect(Math.abs(v.yaw - 0.75)).toBeGreaterThan(0.3);
  });
});
