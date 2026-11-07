import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { ISLE_SECURE, isleSecured } from '../src/world/portal';
import {
  blightLevel, isleBlight, blightAt, purityAt, demonBoost, healBoost, BLIGHT_DORMANT, BLIGHT_SECURED, BLIGHT_FLOOR, BLIGHT_R_MIN, DEMON_BONUS, HEAL_BONUS,
} from '../src/world/blight';
import { IsleBattle } from '../src/sim/isleBattle';
import { demonStats } from '../src/sim/hell';

describe('la contamination de l’île du portail', () => {
  beforeAll(() => setMapSize(192));

  const fresh = () => { const w = new World(); newWorld(w, 3, 2026, GEN); return w; };
  const tower = (w: World) => { const t = zoneOrigins(w, 'watchtower').find((k) => w.canPlace('watchtower', k % N, Math.floor(k / N)) === null)!; w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false); };
  const barracks = (w: World) => { const c = zoneOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!; w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false); };

  it('sans île, rien ; portail fermé : à demi ; portail ouvert sans défenses : au plus fort', () => {
    const w = fresh();
    expect(blightLevel(new World())).toBe(0);
    expect(isleBlight(new World())).toBeNull();
    expect(blightLevel(w)).toBe(BLIGHT_DORMANT);
    w.exp.done.push('portal');
    expect(blightLevel(w)).toBe(1);
    const b = isleBlight(w)!;
    expect(b.radius).toBeGreaterThan(w.portal!.r * 0.9);
  });

  it('elle recule à chaque défense, chaque vague repoussée, chaque zone conquise, et reste dans ses bornes', () => {
    const w = fresh();
    w.exp.done.push('portal');
    const curve = [blightLevel(w)];
    tower(w); curve.push(blightLevel(w));
    barracks(w); curve.push(blightLevel(w));
    for (let i = 0; i < ISLE_SECURE.waves - 1; i++) { w.isleGuard.waves++; curve.push(blightLevel(w)); }
    // décroissante, toujours entre le plancher et 1, nettement au-dessus du minimum tant que l'île n'est pas sécurisée
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeLessThan(curve[i - 1]);
    for (const v of curve) { expect(v).toBeLessThanOrEqual(1); expect(v).toBeGreaterThan(BLIGHT_SECURED); }
    // une zone des Enfers conquise la fait reculer aussi
    expect(blightLevel(w, 2)).toBeLessThan(blightLevel(w, 0));
    // l'île sécurisée : réduite au minimum (un peu moins encore avec les zones conquises, jamais sous le plancher)
    w.isleGuard.waves++;
    expect(isleSecured(w)).toBe(true);
    expect(blightLevel(w)).toBe(BLIGHT_SECURED);
    expect(blightLevel(w, 3)).toBeLessThan(BLIGHT_SECURED);
    expect(blightLevel(w, 99)).toBeGreaterThanOrEqual(BLIGHT_FLOOR);
    // des vagues en trop ne la font pas descendre plus bas
    w.isleGuard.waves = 50;
    expect(blightLevel(w)).toBe(BLIGHT_SECURED);
    // le rayon suit : petit cercle autour du portail
    expect(isleBlight(w)!.radius).toBeLessThan(BLIGHT_R_MIN + 2);
  });

  it('la plus forte au portail, elle s’atténue en s’éloignant, nulle loin de l’île ; les défenses la repoussent autour d’elles', () => {
    const w = fresh();
    w.exp.done.push('portal');
    const p = w.portal!;
    let b = isleBlight(w)!;
    const near = blightAt(b, p.x + 0.5, p.z + 1.6), mid = blightAt(b, p.x + p.r * 0.6, p.z), far = blightAt(b, p.x + p.r * 3, p.z);
    expect(near).toBeGreaterThan(0.8);
    expect(near).toBeLessThanOrEqual(1);
    expect(mid).toBeLessThan(near);
    expect(far).toBe(0);
    // bornes partout sur l'île
    for (let z = p.z - p.r - 3; z <= p.z + p.r + 3; z += 0.7)
      for (let x = p.x - p.r - 3; x <= p.x + p.r + 3; x += 0.7) {
        const v = blightAt(b, x, z);
        expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
      }
    tower(w);
    b = isleBlight(w)!;
    expect(b.halos.length).toBe(1);
    const [hx, hz] = b.halos[0];
    expect(purityAt(b, hx, hz)).toBe(1);
    // au pied de la tour, la contamination est presque partie ; le halo ne porte pas au loin
    const without = { ...b, halos: [] };
    expect(blightAt(b, hx, hz)).toBeLessThanOrEqual(blightAt(without, hx, hz) * 0.11);
    expect(purityAt(b, hx + 20, hz)).toBe(0);
    // la signature change avec les défenses et les vagues (les teintes et décors se refont alors), pas sinon
    const k1 = b.key;
    expect(isleBlight(w)!.key).toBe(k1);
    w.isleGuard.waves++;
    expect(isleBlight(w)!.key).not.toBe(k1);
  });

  it('les démons ont un petit bonus près du portail tant qu’elle est forte ; on se soigne plus vite dans la zone purifiée', () => {
    const w = fresh();
    w.exp.done.push('portal');
    const p = w.portal!;
    let b = isleBlight(w)!;
    expect(demonBoost(null, p.x, p.z)).toBe(1);
    const atGate = demonBoost(b, p.x + 0.5, p.z + 1.6);
    expect(atGate).toBeGreaterThan(1);
    expect(atGate).toBeLessThanOrEqual(1 + DEMON_BONUS);
    expect(demonBoost(b, p.x + p.r * 3, p.z)).toBe(1);
    // l'île sécurisée : plus de bonus, même au portail
    tower(w); barracks(w);
    w.isleGuard.waves = ISLE_SECURE.waves;
    b = isleBlight(w)!;
    expect(demonBoost(b, p.x + 0.5, p.z + 1.6)).toBe(1);
    const [hx, hz] = b.halos[0];
    expect(healBoost(b, hx, hz)).toBeCloseTo(1 + HEAL_BONUS);
    expect(healBoost(null, hx, hz)).toBe(1);
  });

  it('au combat sur l’île : les démons sortis du portail frappent plus fort, la garnison se soigne plus vite dans le halo', () => {
    const w = fresh();
    w.exp.done.push('portal');
    tower(w); barracks(w);
    const isle = new IsleBattle(w);
    isle.syncDefenses(1);
    isle.blight = isleBlight(w);
    const [px, pz] = isle.map.portal;
    const [fx, fz] = isle.map.freeNear(px, pz + 1.6, 3);
    const d = isle.sim.addRaider('imp', demonStats('imp', 1), fx, fz);
    isle.step(0.1);
    expect(d.boost ?? 1).toBeGreaterThan(1);
    // la garnison au pied de la tour, blessée : elle guérit plus vite que le soin de base
    const hb = [...isle.defs.values()].find((b) => b.kind === 'watchtower')!;
    const [ux, uz] = isle.map.freeNear(hb.site.x, hb.site.z + hb.site.r + 0.4, 3);
    isle.sim.units.delete(d.id);
    const u = isle.sim.addPlayerUnit('soldier', { hp: 100, dmg: 1, cooldown: 1, range: 1, sight: 4, speed: 1, radius: 0.2 }, ux, uz);
    u.hp = 10;
    isle.step(1, 1);
    expect(u.hp - 10).toBeGreaterThan(1.1);
  });
});
