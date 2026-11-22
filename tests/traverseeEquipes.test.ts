import { describe, it, expect, beforeEach } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, readExpState } from '../src/sim/missions';
import { GEAR, GearId } from '../src/sim/gear';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { readTeamNote, TeamNote } from '../src/sim/expeditions';
import type { Report } from '../src/sim/expeditions';

/**
 * « Explorer le monde » recharge la page : une équipe en route, qui n'est pas sauvegardée, était annulée (notes de joueurs du
 * 22 nov. 2026). Elle est notée avant le rechargement (`teamNotes`) et relancée après la cinématique (`resume`)
 */

/** Un petit village sur le continent, avec des habitants prêts à partir */
function village(seed = 5) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: number[] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && ok(x, z) && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

const total = (g: Record<GearId, number>) => Object.values(g).reduce((s, n) => s + n, 0);
const herd = MISSIONS.find((m) => m.id === 'herd')!;

/** Le village rechargé : le monde relu de sa sauvegarde, de nouveaux habitants, de nouvelles expéditions */
function reload(w: World, seed = 9) {
  const back = new World();
  back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
  back.updateVis();
  const agents = new Agents(back);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 40, 0);
  const ex = new Expeditions(back, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w: back, agents, ex };
}

/** Fait avancer l'équipe jusqu'à ce que `until` soit vrai (les imprévus tranchés au mieux) */
function run(ex: Expeditions, agents: Agents, until: () => boolean, max = 200000) {
  for (let i = 0; i < max && !until(); i++) {
    for (const a of ex.active) if (a.wait) ex.decide(a, a.wait.options.findIndex((_, k) => ex.canTake(a, k)));
    agents.update(0.05, 10, 0, false, 40, 0); ex.update(0.05);
  }
}

describe('une équipe en route pendant la traversée', () => {
  it('au travail : relancée, elle reprend sur place là où elle en était, avec son équipement', () => {
    const { w, agents, ex } = village();
    for (const g of GEAR) w.exp.gear[g.id] = 3;
    const a = ex.start(herd, 0)!;
    run(ex, agents, () => a.phase === 'work' && !a.wait && a.t > (a.c.work + a.extra) * 0.5);
    expect(a.phase).toBe('work');
    const notes = JSON.parse(JSON.stringify(ex.teamNotes())) as TeamNote[];
    expect(notes).toHaveLength(1);
    expect(notes[0].done).toBeGreaterThan(0.45);
    const seen = [...a.seen];
    const r = reload(w);
    expect(r.ex.active).toHaveLength(0);
    const before = total(r.w.exp.gear);
    const news: string[] = [];
    r.ex.onNews = (m) => news.push(m);
    expect(r.ex.resume(notes.map(readTeamNote).filter((n): n is TeamNote => !!n))).toEqual({ back: 1, lost: [] });
    const b = r.ex.active[0];
    expect(b.m.id).toBe('herd');
    expect(b.phase).toBe('out');
    expect(b.seen).toEqual(seen);
    // le même équipement repart avec elle
    expect(total(r.w.exp.gear)).toBeLessThan(before);
    expect(news.some((m) => m.includes('reprend la route'))).toBe(true);
    // arrivée : le travail reprend à mi-chemin, sans nouvel imprévu d'arrivée
    run(r.ex, r.agents, () => b.phase !== 'out');
    expect(b.phase).toBe('work');
    expect(b.t).toBeGreaterThan((b.c.work + b.extra) * 0.45);
    expect(b.wait).toBeNull();
    expect(b.seen).toEqual(seen);
    // et elle finit par rentrer, son équipement rendu
    let rep: Report | null = null;
    r.ex.onReport = (x) => { rep = x; };
    run(r.ex, r.agents, () => !r.ex.active.includes(b));
    expect(rep).toBeTruthy();
    expect(total(r.w.exp.away)).toBe(0);
  });

  it('sur le retour : elle rentre aussitôt, avec l’issue déjà tirée', () => {
    const { w, agents, ex } = village();
    const a = ex.start(herd, 0)!;
    run(ex, agents, () => a.phase === 'back');
    const notes = ex.teamNotes();
    expect(notes[0].done).toBe(1);
    const r = reload(w);
    let rep: Report | null = null;
    r.ex.onReport = (x) => { rep = x; };
    r.ex.resume(notes);
    run(r.ex, r.agents, () => !!rep, 100);
    expect(rep).toBeTruthy();
    expect(rep!.ok).toBe(a.ok);
    expect(r.ex.active).toHaveLength(0);
  });

  it('une note abîmée, ou d’une mission disparue, est oubliée', () => {
    expect(readTeamNote(null)).toBeNull();
    expect(readTeamNote({ m: 'nexistepas', c: 0, phase: 'work' })).toBeNull();
    expect(readTeamNote({ m: 'herd', c: 9, phase: 'work' })).toBeNull();
    expect(readTeamNote({ m: 'herd', c: 0, phase: 'ailleurs' })).toBeNull();
    const n = readTeamNote({ m: 'herd', c: 0, phase: 'work', done: 7 })!;
    expect(n.done).toBe(1);
    expect(n.seen).toEqual([]);
  });
});
