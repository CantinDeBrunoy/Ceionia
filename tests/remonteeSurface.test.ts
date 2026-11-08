import { describe, it, expect } from 'vitest';
import { SurfaceGate, surfaceStep, SURFACE_DELAY, type ViewMode } from '../src/core/surface';

/** Un faux jeu : les Enfers se quittent après un fondu (le temps avance à la main) */
function fake(start: ViewMode = 'hell', isle = false) {
  const s = { mode: start, isle, fading: false, now: 0, exits: 0, leaves: 0, timers: [] as { at: number; fn: () => void }[] };
  const g = new SurfaceGate({
    mode: () => s.mode, isle: () => s.isle, fading: () => s.fading,
    exitHell: () => { s.exits++; if (s.fading || s.mode !== 'hell') return; s.fading = true; s.timers.push({ at: s.now + 400, fn: () => { s.mode = 'surface'; s.fading = false; } }); },
    leaveIsle: () => { s.leaves++; s.isle = false; },
    later: (fn, ms) => s.timers.push({ at: s.now + ms, fn }),
  });
  const advance = (ms: number) => {
    const end = s.now + ms;
    for (;;) {
      const t = s.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!t) break;
      s.timers.splice(s.timers.indexOf(t), 1);
      s.now = t.at;
      t.fn();
    }
    s.now = end;
  };
  return { s, g, advance };
}

describe('remonter au monde réel', () => {
  it('étapes selon la vue', () => {
    expect(surfaceStep('surface', false, false)).toBe('run');
    expect(surfaceStep('surface', true, false)).toBe('leaveIsle');
    expect(surfaceStep('surface', true, false, true)).toBe('run');
    expect(surfaceStep('hell', false, false)).toBe('exitHell');
    expect(surfaceStep('hell', false, true)).toBe('wait');
    expect(surfaceStep('under', false, false)).toBe('run');
  });

  it('au village : l’action part tout de suite', () => {
    const { s, g } = fake('surface');
    let n = 0;
    g.ensure(() => n++);
    expect(n).toBe(1);
    expect(s.exits).toBe(0);
  });

  it('depuis les Enfers : on remonte, puis l’action part une seule fois', () => {
    const { s, g, advance } = fake('hell');
    let n = 0;
    g.ensure(() => n++);
    expect(n).toBe(0);
    expect(s.exits).toBe(1);
    advance(SURFACE_DELAY + 10);
    expect(s.mode).toBe('surface');
    expect(n).toBe(1);
    advance(5000);
    expect(n).toBe(1);
    expect(g.pending).toBe(false);
  });

  it('plusieurs demandes pendant la remontée : chacune une fois, dans l’ordre, un seul fondu', () => {
    const { s, g, advance } = fake('hell');
    const log: string[] = [];
    g.ensure(() => log.push('a'));
    g.ensure(() => log.push('b'));
    advance(SURFACE_DELAY + 10);
    expect(log).toEqual(['a', 'b']);
    expect(s.exits).toBe(1);
  });

  it('un fondu déjà en cours : on attend et on réessaie', () => {
    const { s, g, advance } = fake('hell');
    s.fading = true;
    s.timers.push({ at: 500, fn: () => { s.fading = false; } });
    let n = 0;
    g.ensure(() => n++);
    advance(SURFACE_DELAY + 10);
    expect(n).toBe(0);
    advance(SURFACE_DELAY * 2);
    expect(s.mode).toBe('surface');
    expect(n).toBe(1);
  });

  it('commandement de l’île : on le quitte sans délai, sauf pour aller sur l’île', () => {
    const a = fake('surface', true);
    let n = 0;
    a.g.ensure(() => n++);
    expect(a.s.leaves).toBe(1);
    expect(n).toBe(1);
    const b = fake('surface', true);
    b.g.ensure(() => n++, true);
    expect(b.s.leaves).toBe(0);
    expect(n).toBe(2);
  });

  it('une action qui rappelle ensure (suivre → remonter) ne boucle pas', () => {
    const { s, g, advance } = fake('hell');
    let n = 0;
    const follow = () => g.ensure(() => { n++; if (n < 5) follow(); });
    follow();
    advance(SURFACE_DELAY + 10);
    expect(n).toBe(5);
    expect(s.exits).toBe(1);
  });

  it('abandon : plus rien ne part', () => {
    const { g, advance } = fake('hell');
    let n = 0;
    g.ensure(() => n++);
    g.cancel();
    advance(5000);
    expect(n).toBe(0);
  });
});
