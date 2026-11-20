import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { Expeditions, partyLimit } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS } from '../src/sim/missions';
import { mulberry32 } from '../src/core/rng';
import { priceIn, canPay, pay, YIELD } from '../src/sim/economy';
import { rulesOf, Difficulty } from '../src/sim/difficulty';
import { KindId } from '../src/build/catalog';
import { loadout, gearGaps, GearId, Pack, GEAR_BY } from '../src/sim/gear';

const DAY = 130;

function run(diff: Difficulty, extraLumber: number, seed = 2026, trip = 150) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed);
  w.difficulty = diff;
  w.updateVis();
  const r = rulesOf(diff);
  w.wood = r.startWood; w.stone = r.startStone;
  const sim = new Sim(w), agents = new Agents(w);
  const ex = new Expeditions(w, agents, () => DAY, mulberry32(7));
  ex.pop = () => sim.pop;
  ex.age = () => 0;
  let cx = 0, cz = 0;
  const tryPlace = (k: KindId) => {
    const c = priceIn(w, k, 0);
    if (!canPay(w, c)) return false;
    for (let rr = 0; rr < 40; rr++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
      const x = cx + dx, z = cz + dz;
      if (x > 4 && z > 4 && x < N - 8 && z < N - 8 && w.canPlace(k, x, z) === null) { w.place(k, x, z, 0, true, 0, false); pay(w, c); return true; }
    }
    return false;
  };
  // la place
  outer: for (let rr = 0; rr < 80; rr++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
    const x = 90 + dx, z = 90 + dz;
    if (w.canPlace('gather', x, z) === null) { cx = x; cz = z; const c = priceIn(w, 'gather', 0); w.place('gather', x, z, 0, true, 0, false); pay(w, c); break outer; }
  }
  tryPlace('lumber'); tryPlace('quarry');
  const count = (k: KindId) => [...w.buildings.values()].filter((b) => b.kind === k).length;
  // les deux expéditions obligatoires, l'une après l'autre (le choix prudent), d'une durée fixe de 90 s
  const todo = ['herd', 'mammoth'];
  let waitWood = 0, waitStone = 0, t = 0;
  let teams: { id: string; left: number; party: number; take: Pack }[] = [];
  const marks: Record<string, number> = {};
  for (; t < DAY * 60; t += 1) {
    sim.update(1, 1);
    ex.update(1);
    // les expéditions d'abord (équipement, départ), autant d'équipes que la population en permet ; puis les bâtiments
    for (const tm of teams) if (--tm.left === 0) { w.exp.done.push(tm.id); for (const [g, n] of Object.entries(tm.take)) w.exp.gear[g as GearId] += n!; }
    teams = teams.filter((tm) => tm.left > 0);
    for (const id of todo) {
      if (teams.some((tm) => tm.id === id) || w.exp.done.includes(id)) continue;
      const m = MISSIONS.find((x) => x.id === id)!, c = m.choices[0];
      const busyN = teams.reduce((n, tm) => n + tm.party, 0);
      if (teams.length >= partyLimit(sim.pop) || sim.pop - busyN < c.party) continue;
      const gaps = gearGaps(c, w.exp.gear, w.exp.craft, 0, () => true);
      for (const g of gaps) for (let i = g.have + g.queued; i < g.need; i++) ex.craft(g.gear.id, 0);
      if (gaps.every((g) => g.have >= g.need)) {
        const l = loadout(c, w.exp.gear);
        for (const [g, n] of Object.entries(l.take)) w.exp.gear[g as GearId] -= n!;
        teams.push({ id, left: trip, party: c.party, take: l.take }); marks['go_' + id] = +(t / DAY).toFixed(2);
      }
    }
    const want: KindId[] = [];
    if (!sim.housing.ok || count('house') < 4) want.push('house');
    if (!sim.food.ok || count('farm') < 1) want.push('farm');
    if (!sim.water.ok || count('well') < 1) want.push('well');
    if (!sim.jobs.ok || count('workshop') < 1) want.push('workshop');
    if (!sim.joy.ok) want.push('gather');
    if (!sim.health.ok) want.push('health');
    if (count('lumber') < 1 + extraLumber) want.unshift('lumber');
    for (const k of want) if (!tryPlace(k)) {
      const c = priceIn(w, k, 0);
      if (c && w.wood < c.wood) waitWood++; else if (c && w.stone < c.stone) waitStone++;
      break;
    }
    for (const k of ['house', 'farm', 'well', 'workshop'] as KindId[]) if (marks[k] === undefined && count(k) >= (k === 'house' ? 4 : 1)) marks[k] = +(t / DAY).toFixed(2);
    if (marks.pop12 === undefined && sim.pop >= 12) marks.pop12 = +(t / DAY).toFixed(2);
    if (marks.pop20 === undefined && sim.pop >= 20) marks.pop20 = +(t / DAY).toFixed(2);
    for (const id of w.exp.done) if (marks[id] === undefined) marks[id] = +(t / DAY).toFixed(2);
    if (sim.ready) break;
  }
  return { days: +(t / DAY).toFixed(2), sansBois: +(waitWood / DAY).toFixed(2), sansPierre: +(waitStone / DAY).toFixed(2), pop: Math.floor(sim.pop), houses: count('house'), lumber: count('lumber'), wood: Math.floor(w.wood), stone: Math.floor(w.stone), marks };
}

/** Les réglages d'avant le 19 nov. 2026 (bûcheron 8 puis 12 bois par jour, 50 bois au départ en Normal, lance à 2 bois) */
function before<T>(f: () => T): T {
  const y = [...YIELD.lumber!.wood!], sw = rulesOf('normal').startWood, sp = GEAR_BY.spear.wood;
  YIELD.lumber!.wood![0] = 8; YIELD.lumber!.wood![1] = 12; rulesOf('normal').startWood = 50; GEAR_BY.spear.wood = 2;
  try { return f(); } finally { YIELD.lumber!.wood = y; rulesOf('normal').startWood = sw; GEAR_BY.spear.wood = sp; }
}

/**
 * Un joueur sans hâte, simulé : il comble les besoins, bâtit ce que demande l'Antiquité et envoie les deux expéditions
 * obligatoires (le choix prudent, lances fabriquées) dès que la population le permet, une expédition durant 300 s de jeu
 * (trajet, travail, imprévus). On mesure le temps jusqu'à l'Antiquité, et le temps passé à attendre du bois
 */
describe('le bois avant l’Antiquité', () => {
  it('en Normal, on attend moins le bois qu’avant ; Facile reste plus rapide que Normal', () => {
    const now = { easy: run('easy', 0, 2026, 300), normal: run('normal', 0, 2026, 300) };
    const old = before(() => ({ easy: run('easy', 0, 2026, 300), normal: run('normal', 0, 2026, 300) }));
    console.log('avant', JSON.stringify(old), 'après', JSON.stringify(now));
    expect(now.normal.days).toBeLessThan(old.normal.days);
    expect(now.normal.sansBois).toBeLessThan(old.normal.sansBois * 0.7);
    expect(now.easy.days).toBeLessThanOrEqual(old.easy.days);
    expect(now.easy.days).toBeLessThan(now.normal.days);
  }, 120000);
});
