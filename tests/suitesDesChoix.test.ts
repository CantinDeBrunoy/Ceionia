import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, Mission } from '../src/sim/missions';
import { EVENTS, ExpEvent, eventsFor } from '../src/sim/events';
import { GEAR, gearGaps, emptyStock } from '../src/sim/gear';

/**
 * Chaque choix d'un imprévu d'expédition mène à sa propre suite : sur la scène, l'option choisie se joue (objets de l'imprévu,
 * gestes de l'équipe, bateau), et deux options d'un même imprévu ne donnent jamais la même chose. Retour de l'auteur (nov. 2026) :
 * « Fouiller l'épave » ne fouillait rien, « Ramer face aux vagues » ne faisait ramer personne
 */

// l'imprévu à faire survenir : le tirage au hasard est remplacé par celui qu'on veut voir, au plus tôt de ce que ses règles
// permettent (à l'arrivée s'il n'a ni `arrive` ni `from` : le pire moment pour être vu)
let forced: ExpEvent | null = null;
vi.mock('../src/sim/events', async (orig) => {
  const m = await orig<typeof import('../src/sim/events')>();
  return { ...m, pickEvent: (ctx: { arrive: boolean }, seen: string[]) => (forced && !seen.includes(forced.id) && (forced.arrive || (forced.from === undefined && !forced.missions?.length) ? ctx.arrive : !ctx.arrive) ? forced : null) };
});
const { Expeditions } = await import('../src/sim/expeditions');
const { Agents } = await import('../src/sim/agents');
const { ExpeditionView } = await import('../src/render/expeditionView');

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

/** Un village de quelques maisons, un stade et un cosmodrome, sur le continent de la graine 2026 (un par âge) */
const worlds = new Map<number, { json: string }>();
function village(age: number) {
  const had = worlds.get(age);
  if (had) return had;
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: [number, number] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  // (le stade et le cosmodrome : les jeux et la fusée partent de leur pied)
  for (const k of ['stadium', 'spaceport'] as const) {
    let done = false;
    for (let r = 4; r < 30 && !done; r++)
      for (let dz = -r; dz <= r && !done; dz++)
        for (let dx = -r; dx <= r && !done; dx++)
          if (w.canPlace(k, x + dx, z + dz) === null) { w.place(k, x + dx, z + dz, 0, true, age, false); done = true; }
  }
  const v = { json: JSON.stringify(w.toJSON()) };
  worlds.set(age, v);
  return v;
}

/** Le village de cet âge tel qu'il était à sa construction : chaque partie repart du même état (une expédition le change) */
function fresh(age: number) {
  const json = village(age).json, w = new World();
  w.fromJSON(JSON.parse(json));
  w.updateVis();
  w.isles = { main: { x: 0, z: 0, n: N }, rivals: [], small: [] };
  w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'orient'; w.diplo.path = 'peace';
  // (le premier convoi escorté : les émissaires peuvent partir, chantier B)
  w.diplo.saga.sea.push('convoy');
  // toute la réserve d'équipement : chaque option qui demande une pièce peut se prendre
  for (const g of GEAR) w.exp.gear[g.id] = 12;
  return w;
}

/** Une mission (et un choix, un âge) où l'imprévu peut survenir */
function fixture(ev: ExpEvent): { m: Mission; ci: number; age: number } | null {
  for (const m of MISSIONS) {
    if (m.farewell) continue;
    for (let ci = 0; ci < m.choices.length; ci++) {
      const c = m.choices[ci];
      const age = Math.max(m.age, ev.ages?.[0] ?? 0);
      if (ev.ages && age > ev.ages[1]) continue;
      const ctx = { dest: c.dest, mission: m.id, scene: c.scene, age, arrive: !!ev.arrive, sea: !!c.sea, warm: true, at: 0.55, own: m.talks };
      if (eventsFor(ctx).includes(ev)) return { m, ci, age };
    }
  }
  return null;
}

/**
 * Imprévus que la scène annonce par ses effets plutôt que par des objets à elle : pierres qui tombent, poissons qui sautent,
 * torches qui baissent, gaz, rafale autour de la montgolfière
 */
const BY_FX = new Set(['ledge', 'scree', 'rockfall', 'shoal', 'dark', 'firedamp', 'gust']);

const r2 = (n: number) => Math.round(n * 50) / 50;

/** Joue l'imprévu avec l'option `pick` et relève ce que montre la scène pendant les secondes qui suivent la décision */
function play(ev: ExpEvent, fx: { m: Mission; ci: number; age: number }, pick: number): { sig: string; staged: boolean; took: boolean; seen: string } | null {
  const w = fresh(fx.age);
  if (fx.m.id === 'allywar' || fx.m.isle?.when === 'war') { w.diplo.path = 'war'; w.diplo.conflict = 'open'; w.diplo.battle = 'none'; } else if (fx.m.talks) { w.diplo.path = 'peace'; w.diplo.conflict = 'open'; }
  // tout se rejoue à l'identique : même hasard, mêmes habitants
  const rnd = mulberry32(99);
  const spy = vi.spyOn(Math, 'random').mockImplementation(rnd);
  try {
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, fx.age, false, 40, 0);
    const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
    ex.pop = () => 60;
    ex.missing = () => [];
    const view = new ExpeditionView(w, agents, ex);
    forced = ev;
    const a = ex.start(fx.m, fx.ci, fx.age);
    if (!a) return null;
    a.events = 3;
    let i = 0;
    for (; i < 40000 && !a.wait && ex.active.includes(a); i++) { agents.update(0.1, 10, fx.age, false, 40, 0); ex.update(0.1); view.update(0.1); }
    if (!a.wait) return null;
    // pendant la décision, ce que l'imprévu annonce est sur la scène, en vue, près de l'équipe (l'aileron annoncé à l'arrivée,
    // quand le bateau était encore à quai, ne se voyait pas : retour de l'auteur, nov. 2026)
    for (let f = 0; f < 20; f++) { agents.update(0.05, 10, fx.age, false, 40, 0); ex.update(0.05); view.update(0.05); }
    const sc0 = (view as unknown as { shows: Map<number, { scene: { stagings: { id: string; objs: THREE.Object3D[] }[] } | null }> }).shows.get(a.id)?.scene;
    // (près d'un membre de l'équipe, à pied ou à bord : là où regarde la caméra qui la suit)
    const team = a.party.map((id) => agents.agents.find((g) => g.id === id)).filter((g) => !!g).map((g) => [g!.x, g!.z]);
    const near = (sc0?.stagings.filter((x) => x.id === ev.id) ?? []).flatMap((x) => x.objs).filter((o) => { if (!o.visible) return false; const p = o.getWorldPosition(new THREE.Vector3()); return team.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 4); }).length;
    // (le mégalodon qui fonce, le kraken : c'est le monstre de la scène qu'on annonce)
    const monster = (sc0 as unknown as { monster?: { obj: THREE.Object3D } | null } | undefined)?.monster?.obj.visible;
    const seen = near || monster ? '' : 'rien en vue pendant la décision';
    // l'équipe a emporté de tout : chaque option qui demande une pièce peut se prendre
    for (const g of GEAR) a.gear[g.id] = Math.max(a.gear[g.id] ?? 0, 1);
    const took = ex.canTake(a, pick) && ex.decide(a, pick);
    const out: unknown[] = [];
    let staged = false;
    for (let f = 0; f < 200 && ex.active.includes(a); f++) {
      agents.update(0.05, 10, fx.age, false, 40, 0); ex.update(0.05); view.update(0.05);
      if (f % 5) continue;
      const sc = (view as unknown as { shows: Map<number, { scene: { stagings: { id: string; objs: { position: { x: number; y: number; z: number }; visible: boolean; scale: { x: number } }[] }[]; boat: { obj: { position: { x: number; z: number }; rotation: { y: number } } } | null } | null }> }).shows.get(a.id)?.scene;
      const st = sc?.stagings.filter((s) => s.id === ev.id) ?? [];
      if (st.length) staged = true;
      out.push([
        st.map((s) => s.objs.map((o) => (o.visible ? [r2(o.position.x), r2(o.position.y), r2(o.position.z), r2(o.scale.x)] : 0))),
        a.party.map((id) => { const g = agents.agents.find((x) => x.id === id); return g ? [r2(g.x), r2(g.z), g.act ?? '', g.hidden ? 1 : 0] : 0; }),
        sc?.boat ? [r2(sc.boat.obj.position.x), r2(sc.boat.obj.position.z), r2(sc.boat.obj.rotation.y)] : 0,
      ]);
    }
    return { sig: JSON.stringify(out), staged, took, seen };
  } finally {
    spy.mockRestore();
    forced = null;
  }
}

describe('chaque choix d’un imprévu a sa propre suite', () => {
  it('chaque imprévu peut survenir dans une mission', () => {
    for (const ev of EVENTS) expect(fixture(ev), ev.id).not.toBeNull();
  });

  // un groupe d'imprévus par âge de la mission qui les accueille : chaque groupe reste dans un temps raisonnable
  const groups = new Map<number, ExpEvent[]>();
  for (const ev of EVENTS) { const f = fixture(ev); if (f) groups.set(f.age, [...(groups.get(f.age) ?? []), ev]); }
  for (const [age, evs] of [...groups].sort((p, q) => p[0] - q[0])) {
    it(`âge ${age} : ${evs.map((e) => e.id).join(', ')}`, { timeout: 600000 }, () => {
      stubCanvas();
      const bad: string[] = [];
      for (const ev of evs) {
        const fx = fixture(ev)!;
        // (une première partie pour rien : les formes mises en cache la première fois tirent au hasard, et décaleraient le relevé)
        for (let i = 0; i < ev.options.length; i++) play(ev, fx, i);
        const runs = ev.options.map((_, i) => play(ev, fx, i));
        if (runs.some((r) => !r)) { bad.push(`${ev.id} : ne survient pas (${fx.m.id})`); continue; }
        // le relevé est fidèle : la même option rejouée donne la même scène
        expect(play(ev, fx, 0)!.sig, `${ev.id} : relevé instable`).toBe(runs[0]!.sig);
        runs.forEach((r, i) => {
          if (!r!.took) bad.push(`${ev.id} ${i} : option refusée`);
          if (i === 0 && r!.seen && !BY_FX.has(ev.id)) bad.push(`${ev.id} : ${r!.seen}`);
          if (!r!.staged) bad.push(`${ev.id} ${i} « ${ev.options[i].label} » : rien sur la scène`);
          for (let j = 0; j < i; j++) if (runs[j]!.sig === r!.sig) bad.push(`${ev.id} ${i} « ${ev.options[i].label} » = ${j} « ${ev.options[j].label} »`);
        });
      }
      expect(bad.join('\n')).toBe('');
    });
  }
});

describe('fabriquer l’équipement d’une équipe ne prend pas des minutes', () => {
  it('tout l’équipement d’un choix, réserve vide, sort en moins de 40 s à vitesse normale sans atelier', () => {
    for (const m of MISSIONS) for (const c of m.choices) {
      const t = gearGaps(c, emptyStock(), [], m.age, () => true).reduce((s, g) => s + g.gear.time * g.need, 0);
      expect(t, `${m.id} « ${c.label} »`).toBeLessThan(40);
    }
  });
});
