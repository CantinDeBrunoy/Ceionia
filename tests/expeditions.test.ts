import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, BIOME_DESERT, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, Mission, choiceAt, readExpState, RECENT_EVENTS } from '../src/sim/missions';
import { EVENTS, EVENT_BY, eventsFor, pickEvent, EventCtx } from '../src/sim/events';
import { Expeditions, Report, ActiveExpedition } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { Underground } from '../src/world/underground';

function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Première case de terre plate des basses terres, entourée de cases où bâtir aussi */
function flatLand(w: World, h = 0.6) {
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  for (let z = 10; z < N - 10; z++)
    for (let x = 10; x < N - 10; x++)
      if (w.cellAvg(x, z) > h && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && ok(x, z) && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) return [x, z];
  throw new Error('pas de terrain plat');
}

/** Un village de quelques maisons, ses habitants dehors, et ses expéditions (tirage réglé par la graine) */
function village(age: number, seed = 7) {
  const w = continent();
  const [x, z] = flatLand(w);
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

/** Fait avancer le jeu jusqu'à ce que `until` soit vrai (ou longtemps) ; les imprévus se tranchent d'eux-mêmes si `decide` */
function play(v: ReturnType<typeof village>, until: () => boolean, age: number, decide?: (a: ActiveExpedition) => number) {
  for (let i = 0; i < 60000 && !until(); i++) {
    v.agents.update(0.05, 10, age, false, 40, 0);
    v.ex.update(0.05);
    if (decide) for (const a of v.ex.active) if (a.wait) v.ex.decide(a, decide(a));
  }
}

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;
/** Ce qu'une équipe rencontre à son arrivée, pour ce choix de cette mission */
const ctxOf = (m: Mission, ci: number, arrive = true): EventCtx => { const c = m.choices[ci]; return { dest: c.dest, mission: m.id, scene: c.scene, age: m.age, arrive }; };

describe('imprévus des expéditions', () => {
  it('chaque imprévu survient dans au moins une mission, et chaque mission a de quoi varier', () => {
    const used = new Set<string>();
    for (const m of MISSIONS) m.choices.forEach((_, ci) => {
      const arrive = eventsFor(ctxOf(m, ci)), later = eventsFor(ctxOf(m, ci, false));
      for (const e of [...arrive, ...later]) used.add(e.id);
      // à l'arrivée, au moins deux imprévus possibles (le cosmodrome n'en a que deux)
      expect(arrive.length, `${m.id} › ${m.choices[ci].label}`).toBeGreaterThanOrEqual(2);
    });
    expect(EVENTS.filter((e) => !used.has(e.id)).map((e) => e.id)).toEqual([]);
    // des imprévus propres à beaucoup de missions
    expect(EVENTS.filter((e) => e.missions || e.scenes).length).toBeGreaterThanOrEqual(20);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });

  it('les imprévus vont avec la mission : pas de loups chez les jongleurs, le bon meneur pour chaque troupeau', () => {
    const ids = (m: string, ci: number) => [...eventsFor(ctxOf(mission(m), ci)), ...eventsFor(ctxOf(mission(m), ci, false))].map((e) => e.id);
    expect(ids('fair', 0)).not.toContain('wolves');
    expect(ids('brewer', 0)).not.toContain('wolves');
    // moutons : le bélier ; sangliers : le vieux sanglier ; aurochs : le grand taureau ; chevaux : l'étalon
    expect(ids('herd', 0)).toContain('ram');
    expect(ids('herd', 0)).not.toContain('stallion');
    expect(ids('herd', 1)).toContain('tusker');
    expect(ids('herd', 2)).toContain('bull');
    expect(ids('horses', 0)).toContain('stallion');
    expect(ids('horses', 0)).not.toContain('bull');
    // la pirogue a ses rapides, pas une crue qu'on passerait « en barque » ou « à gué »
    expect(ids('seeds', 1)).toContain('rapids');
    expect(ids('seeds', 1)).not.toContain('flood');
    // sous terre, la troupe armée a ses propres imprévus, pas les torches qui faiblissent des explorateurs
    expect(ids('deep', 0)).toEqual(expect.arrayContaining(['echo', 'tired', 'crossroads']));
    expect(ids('deep', 0)).not.toContain('dark');
    // les loups et la laie ne rôdent plus à l'époque moderne
    expect(ids('summit', 1)).not.toContain('wolves');
    // une bête menée à la corde est de l'espèce que la mission ramène
    for (const m of MISSIONS) m.choices.forEach((c, ci) => {
      const kinds = new Set(c.win.flatMap((e) => (e.t === 'herd' ? e.kinds : [])));
      for (const e of [...eventsFor(ctxOf(m, ci)), ...eventsFor(ctxOf(m, ci, false))])
        for (const o of e.options) for (const b of o.bonus ?? []) if (b.t === 'herd') for (const k of b.kinds) expect(kinds.has(k), `${e.id} pour ${m.id}`).toBe(true);
    });
  });

  it('les imprévus en chemin (le voyageur, la laie, la corniche) ne surviennent qu’à l’arrivée', () => {
    for (const id of ['traveler', 'boar', 'ledge', 'winds', 'alarm']) expect(EVENT_BY[id].arrive).toBe(true);
    const mid = eventsFor({ dest: 'plain', mission: 'herd', scene: 'herd', age: 0, arrive: false }).map((e) => e.id);
    expect(mid).not.toContain('traveler');
    expect(mid).not.toContain('boar');
  });

  it('on ne retombe pas sur l’imprévu qu’on veut éviter tant qu’il y en a d’autres', () => {
    const ctx = ctxOf(mission('herd'), 0), all = eventsFor(ctx).map((e) => e.id), rnd = mulberry32(3);
    for (let i = 0; i < 300; i++) {
      const avoid = [all[i % all.length], all[(i + 1) % all.length]];
      const e = pickEvent(ctx, [], avoid, rnd)!;
      expect(avoid).not.toContain(e.id);
    }
    // plus rien d'autre : on accepte un imprévu déjà vu ailleurs plutôt que rien
    expect(pickEvent(ctx, [], all, rnd)).not.toBeNull();
    // jamais deux fois le même dans une expédition
    expect(pickEvent(ctx, all, [], rnd)).toBeNull();
  });

  it('deux expéditions de suite n’ont pas le même imprévu, et l’on s’en souvient dans la sauvegarde', () => {
    const v = village(0), m = mission('herd'), got: string[][] = [];
    for (let k = 0; k < 4; k++) {
      const a = v.ex.start(m, 0)!;
      expect(a).not.toBeNull();
      play(v, () => !v.ex.active.includes(a), 0, () => 0);
      got.push(a.seen);
    }
    for (let k = 1; k < got.length; k++) for (const id of got[k]) expect(got[k - 1]).not.toContain(id);
    expect(v.w.exp.recent.length).toBeGreaterThan(0);
    expect(v.w.exp.recent.length).toBeLessThanOrEqual(RECENT_EVENTS);
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(v.w.toJSON())));
    expect(r.exp.recent).toEqual(v.w.exp.recent);
    // une ancienne sauvegarde (sans souvenir des imprévus) se relit sans rien éviter
    expect(readExpState({ done: ['herd'] }).recent).toEqual([]);
    expect(readExpState({ recent: ['wolves', 3, 'fog'] }).recent).toEqual(['wolves', 'fog']);
  });

  it('deux équipes en route en même temps n’attendent jamais le même imprévu', () => {
    const v = village(0, 11), a = v.ex.start(mission('herd'), 0)!, b = v.ex.start(mission('berries'), 0)!;
    expect(a && b).toBeTruthy();
    play(v, () => a.seen.length > 0 && b.seen.length > 0, 0);
    expect(a.seen[0]).not.toBe(b.seen[0]);
  });

  it('le choix du joueur est celui que retient le récit, et la scène sait lequel jouer', () => {
    const v = village(2), a = v.ex.start(mission('scout'), 0)!;
    play(v, () => !!a.wait, 2);
    const ev = a.wait!, i = ev.options.findIndex((_, j) => v.ex.canTake(a, j) && j > 0) >= 0 ? ev.options.findIndex((_, j) => v.ex.canTake(a, j) && j > 0) : 0;
    expect(v.ex.decide(a, i)).toBe(true);
    expect(a.picks[a.seen.indexOf(ev.id)]).toBe(i);
    expect(a.notes[a.notes.length - 1]).toBe(ev.options[i].text);
    // la décision prise, on ne la reprend pas
    expect(v.ex.decide(a, 0)).toBe(false);
  });
});

describe('comptes rendus des expéditions', () => {
  it('les jongleurs du carrefour ont leur compte rendu, et rentrent avec l’équipe', () => {
    const v = village(2), m = mission('fair');
    expect(m.choices[0].carry).toBe('guests');
    let report: Report | null = null;
    v.ex.onReport = (r) => (report = r);
    const a = v.ex.start(m, 0, 2)!;
    play(v, () => !!report, 2, (x) => x.wait!.options.findIndex((_, j) => v.ex.canTake(x, j)));
    expect(report).not.toBeNull();
    expect(report!.m.id).toBe('fair');
    expect(report!.notes.length).toBe(a.seen.length);
    expect(report!.text.length).toBeGreaterThan(10);
  });

  it('une grotte se cherche dans une vraie grotte (ou au pied d’une paroi), jamais dans le désert s’il y a mieux', () => {
    const v = village(2), a = v.ex.start(mission('mine'), 1, 2)!;
    expect(a.site).toBe('cave');
    const [x, z] = a.dest, k = v.w.ci(Math.floor(x), Math.floor(z));
    expect(v.w.biome[k]).not.toBe(BIOME_DESERT);
    expect(v.w.outpostEntrance(Math.floor(x), Math.floor(z), 1)).toBeGreaterThanOrEqual(0);
  });

  it('l’expédition armée compte les filons qu’elle abat vraiment : récit, détail du minerai, compteur des profondeurs', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 2, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 30, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    ex.under = new Underground(w);
    w.exp.done.push('horses', 'mine', 'scout');
    const free = (k: 'stable' | 'outpost') => { for (let zz = 10; zz < N - 10; zz++) for (let xx = 10; xx < N - 10; xx++) if (w.canPlace(k, xx, zz) === null) return [xx, zz]; throw new Error('pas de place'); };
    const [sx, sz] = free('stable');
    w.place('stable', sx, sz, 0, true, 2, false);
    const [px, pz] = free('outpost');
    w.place('outpost', px, pz, 0, true, 2, false);
    ex.update(1.1);
    const deep = mission('deep'), armor = deep.choices.findIndex((c) => c.troop === 'armor');
    // les récits n'annoncent plus un nombre de filons fixé d'avance
    for (const c of deep.choices) for (const age of [2, 3, 4, 5]) expect(choiceAt(c, age).winText).not.toMatch(/six filons|trois filons|filons remontent/);
    const reports: Report[] = [];
    ex.onReport = (r) => reports.push(r);
    const run = (a: ActiveExpedition) => { for (let i = 0; i < 80000 && ex.active.includes(a); i++) { agents.update(0.05, 10, 2, false, 30, 0); ex.update(0.05); if (a.wait) ex.decide(a, a.wait.options.findIndex((_, j) => ex.canTake(a, j))); } };
    // une première troupe : ses filons sont abattus, comptés, et le détail du minerai fait le total
    const ore0 = w.ore, mined0 = w.mined.size, a = ex.start(deep, armor)!;
    expect(a.targets.length).toBeGreaterThan(0);
    run(a);
    const r = reports[0], n = w.mined.size - mined0;
    expect(r.ok).toBe(true);
    expect(n).toBe(a.targets.length);
    expect(ex.depthStats().veins).toBe(w.mined.size);
    const m = /\+(\d+) minerai : (\d+) filons? abattus? \(([^)]*)\)(?:, et (\d+) trouvés? en chemin)?/.exec(r.summary)!;
    expect(m).not.toBeNull();
    expect(+m[2]).toBe(n);
    // le détail compte des filons (« 2 de charbon, 1 d'or… ») : il fait le nombre de filons ; le total fait le minerai gagné
    expect(m[3].split(', ').reduce((s, p) => s + parseInt(p, 10), 0)).toBe(n);
    expect(+m[1]).toBe(w.ore - ore0);
    expect(r.summary.match(/minerai/g)!.length).toBe(1);
    expect(r.text).toMatch(new RegExp(`filons? abattus?`));
    // une troupe qui ne trouve aucun filon sur son chemin ne prétend pas en avoir abattu
    const b = ex.start(deep, armor)!;
    b.targets = [];
    run(b);
    const r2 = reports[1];
    expect(r2.ok).toBe(true);
    expect(r2.text).toMatch(/pas un filon/);
    expect(r2.summary).not.toMatch(/filons? abattus?/);
  });
});
