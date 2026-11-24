import { describe, it, expect } from 'vitest';
import { NavalBattle, playNaval, PAY_GOLD, MERCHANTS, type NavalChoice, type NavalKind } from '../src/sim/navalBattle';

/** La flotte visée pour gagner sans ordre, par âge (le plan du nouveau monde) */
const TARGET: Record<number, number> = { 2: 3, 3: 4, 4: 5 };
const SEEDS = [1, 2, 3, 4, 5];
const fleet = (n: number) => Array(n).fill(1);
const play = (kind: NavalKind, age: number, n: number, picks: NavalChoice[] = [], seed = 1) => playNaval(new NavalBattle(kind, age, fleet(n), { seed }), picks);
/** Toutes les manières de mener la bataille (approche × engagement × fin) */
function combos(age: number): NavalChoice[][] {
  const out: NavalChoice[][] = [];
  for (const a of ['line', 'crescent', age <= 2 ? 'wind' : 'wide'] as NavalChoice[])
    for (const e of ['cannonade', age <= 2 ? 'board' : 'contact', age <= 2 ? 'fireship' : 'torpedo'] as NavalChoice[])
      for (const f of ['pursue', 'return'] as NavalChoice[]) out.push([a, e, f]);
  return out;
}

describe('la bataille navale (chantier B)', () => {
  it('trois temps, une carte de choix avant chacun ; le moteur attend le joueur', () => {
    const b = new NavalBattle('strait', 2, fleet(3), { seed: 1 });
    expect(b.waiting).toBe(1);
    expect(b.options().map((o) => o.id)).toEqual(['line', 'crescent', 'wind']);
    b.step(1);
    expect(b.t).toBe(0);
    expect(b.choose('board')).toBe(false);
    expect(b.choose('wind')).toBe(true);
    let steps = 0;
    while (!b.waiting && steps++ < 400) b.step(0.25);
    expect(b.waiting).toBe(2);
    expect(b.options().map((o) => o.id)).toEqual(['cannonade', 'board', 'fireship']);
    expect(b.choose('cannonade')).toBe(true);
    steps = 0;
    while (!b.waiting && !b.outcome && steps++ < 1000) b.step(0.25);
    expect(b.waiting).toBe(3);
    expect(b.options().map((o) => o.id)).toEqual(['pursue', 'return']);
    // (à l'Industriel, le large et la torpille)
    const c = new NavalBattle('strait', 3, fleet(4), { seed: 1 });
    expect(c.options().map((o) => o.id)).toEqual(['line', 'crescent', 'wide']);
  });

  it('gagnée sans ordre avec la flotte visée à chaque âge, en 90 à 120 s', () => {
    for (const age of [2, 3, 4]) for (const seed of SEEDS) {
      const b = play('strait', age, TARGET[age], [], seed);
      expect(b.outcome, `âge ${age}, graine ${seed}`).toBe('won');
      expect(b.t, `âge ${age}, graine ${seed}`).toBeGreaterThanOrEqual(90);
      expect(b.t, `âge ${age}, graine ${seed}`).toBeLessThanOrEqual(120);
      // (le blocus du port, à l'Industriel et au Moderne)
      if (age >= 3) expect(play('blockade', age, TARGET[age], [], seed).outcome, `blocus ${age} ${seed}`).toBe('won');
    }
  });

  it('chaque choix gagne avec trois navires (Médiéval)', () => {
    for (const picks of combos(2)) for (const seed of SEEDS) expect(play('strait', 2, 3, picks, seed).outcome, `${picks.join(' ')} ${seed}`).toBe('won');
  });

  it('avec deux navires : gagnée avec de bons choix, perdue de justesse avec les pires', () => {
    const results = combos(2).map((picks) => ({ picks, won: SEEDS.filter((seed) => play('strait', 2, 2, picks, seed).outcome === 'won').length }));
    expect(results.some((r) => r.won === SEEDS.length)).toBe(true);
    const worst = results.filter((r) => r.won === 0);
    expect(worst.length).toBeGreaterThan(0);
    // (de justesse : l'ennemi a souffert, il lui reste au plus les deux tiers de sa coque, et l'un de ses navires est coulé ou pris)
    for (const r of worst) {
      const b = play('strait', 2, 2, r.picks, 1);
      expect(b.hpShare(['foe']), r.picks.join(' ')).toBeLessThan(0.67);
      expect(b.foesDown() + b.ships.filter((s) => s.side === 'foe' && s.hp < s.max * 0.5).length, r.picks.join(' ')).toBeGreaterThan(0);
    }
  });

  it('le brûlot coûte un de nos navires ; l’abordage prend des navires ; rentrer garde la flotte', () => {
    const fire = play('strait', 2, 3, ['line', 'fireship', 'return']);
    expect(fire.outcome).toBe('won');
    expect(fire.oursLost()).toBe(1);
    expect(fire.hullsBack().filter((h) => h === 0).length).toBe(1);
    const board = play('strait', 2, 4, ['line', 'board', 'pursue']);
    expect(board.ships.some((s) => s.side === 'foe' && s.taken)).toBe(true);
    // (la canonnade : lente et sûre, aucun des nôtres coulé avec la flotte visée)
    for (const seed of SEEDS) expect(play('strait', 2, 3, ['line', 'cannonade', 'return'], seed).oursLost()).toBe(0);
    // (poursuivre fait plus de mal à l'ennemi que rentrer)
    const chase = play('strait', 2, 3, ['line', 'cannonade', 'pursue']), home = play('strait', 2, 3, ['line', 'cannonade', 'return']);
    expect(chase.foesDown()).toBeGreaterThanOrEqual(home.foesDown());
    expect(chase.hpShare(['foe'])).toBeLessThan(home.hpShare(['foe']) - 0.05);
    // (le brûlot demande deux de nos navires)
    const one = new NavalBattle('strait', 2, fleet(1), { seed: 1 });
    one.choose('line');
    while (!one.waiting) one.step(0.25);
    expect(one.options().find((o) => o.id === 'fireship')?.why).toBe('two');
  });

  it('nos navires rentrent avec leur coque (les touchés à réparer) ; la retraite perd la bataille', () => {
    const b = play('strait', 2, 3);
    const back = b.hullsBack();
    expect(back.length).toBe(3);
    expect(back.some((h) => h < 1)).toBe(true);
    // une coque abîmée part abîmée
    const hurt = new NavalBattle('strait', 2, [0.5, 1], { seed: 1 });
    expect(hurt.ours()[0].hp).toBe(hurt.ours()[0].max * 0.5);
    const r = new NavalBattle('strait', 2, fleet(3), { seed: 1 });
    r.choose('line');
    r.step(5);
    r.retreat();
    expect(r.outcome).toBe('lost');
    expect(r.hullsBack().every((h) => h > 0)).toBe(true);
  });

  it('les visites des îles : des navires alliés en plus, des ennemis en moins', () => {
    const base = new NavalBattle('strait', 2, fleet(3), { seed: 1 });
    const help = new NavalBattle('strait', 2, fleet(3), { seed: 1, allies: 2, foeCut: 1 });
    expect(help.ships.filter((s) => s.side === 'ally').length).toBe(base.ships.filter((s) => s.side === 'ally').length + 2);
    expect(help.ships.filter((s) => s.side === 'foe').length).toBe(base.ships.filter((s) => s.side === 'foe').length - 1);
  });

  it('l’escorte du convoi : le convoi arrive, quel que soit le choix, en 90 à 120 s', () => {
    for (const a of ['tight', 'scout'] as NavalChoice[]) for (const e of ['repel', 'lure', 'pay'] as NavalChoice[]) for (const age of [2, 3]) {
      const b = playNaval(new NavalBattle('convoy', age, fleet(2), { seed: 3, gold: 100 }), [a, e]);
      expect(b.outcome, `${a} ${e} ${age}`).toBe('won');
      // (jamais perdu en entier avec deux navires de guerre)
      expect(b.alive('merchant').length, `${a} ${e}`).toBeGreaterThan(0);
      expect(b.t).toBeGreaterThanOrEqual(90);
      expect(b.t).toBeLessThanOrEqual(120);
      expect(b.goldWon).toBe(b.alive('merchant').length * 8);
      if (e === 'pay') { expect(b.goldPaid).toBe(PAY_GOLD[age]); expect(b.alive('merchant').length).toBe(MERCHANTS); }
      // (le leurre ne coule pas : à bout de coque, il rejoint le convoi)
      if (e === 'lure') expect(b.oursLost(), `${a} ${age}`).toBe(0);
    }
    // payer demande l'or ; sans ordre, l'escorte serre le convoi et repousse les pirates
    const poor = new NavalBattle('convoy', 2, fleet(2), { seed: 1, gold: 5 });
    poor.choose('tight');
    while (!poor.waiting) poor.step(0.25);
    expect(poor.options().find((o) => o.id === 'pay')?.why).toBe('gold');
    expect(playNaval(new NavalBattle('convoy', 2, fleet(2), { seed: 1 })).picks).toEqual(['tight', 'repel']);
  });

  it('chaque marchand coulé coûte de l’or', () => {
    // (un seul navire d'escorte : le convoi n'est plus protégé de la perte totale)
    const b = playNaval(new NavalBattle('convoy', 3, fleet(1), { seed: 2 }), ['scout', 'repel']);
    const sunk = b.ships.filter((s) => s.side === 'merchant' && s.sunk).length;
    expect(b.goldLost).toBe(sunk * 10);
  });
});
