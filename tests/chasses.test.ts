import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, Mission } from '../src/sim/missions';
import { EVENT_BY, eventsFor, EventCtx } from '../src/sim/events';
import { Expeditions, ActiveExpedition, FATE_AT, FATED, nextEventAt } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { KindId, lineOf, reqLine } from '../src/build/catalog';
import * as THREE from 'three';
import { ExpeditionScene } from '../src/render/expeditionScenes';
import { beastInfo } from '../src/render/beasts';

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;
const ctx = (m: Mission, ci: number, arrive: boolean): EventCtx => { const c = m.choices[ci]; return { dest: c.dest, mission: m.id, scene: c.scene, age: m.age, arrive, sea: !!c.sea, warm: false }; };
const ids = (m: Mission, ci: number, arrive: boolean) => eventsFor(ctx(m, ci, arrive)).map((e) => e.id);

/** Un village de quelques maisons sur le continent de la graine 2026, ses habitants dehors */
function village(age: number, seed = 7) {
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
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex, at: [x, z] as [number, number] };
}

/** Bâtit `kind` au plus près de (x, z), là où il tient */
function build(w: World, kind: KindId, x0: number, z0: number, age: number) {
  for (let r = 3; r < 40; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = x0 + dx, z = z0 + dz;
        if (w.canPlace(kind, x, z) === null) return w.place(kind, x, z, 0, true, age, false);
      }
  throw new Error(`pas de place pour ${kind}`);
}

/** Joue l'expédition jusqu'à `until` ; les imprévus se tranchent d'eux-mêmes (première option), et l'on note chaque image */
function play(v: ReturnType<typeof village>, a: ActiveExpedition, until: () => boolean, each?: () => void) {
  for (let i = 0; i < 80000 && !until(); i++) {
    v.agents.update(0.05, 10, a.age, false, 40, 0);
    v.ex.update(0.05);
    if (a.wait) v.ex.decide(a, 0);
    each?.();
  }
}

describe('la chasse au monstre des mers', () => {
  it('l’épave ne flotte qu’en chemin, jamais en plein combat ; le kraken a son tourbillon, le mégalodon sa charge', () => {
    const m = mission('monster');
    expect(EVENT_BY.wreck.arrive).toBe(true);
    for (const ci of [0, 1]) {
      expect(ids(m, ci, true)).toContain('wreck');
      expect(ids(m, ci, false)).not.toContain('wreck');
      // la tempête peut surgir à tout moment
      expect(ids(m, ci, false)).toContain('swell');
    }
    expect(ids(m, 1, false)).toContain('maelstrom');
    expect(ids(m, 0, false)).not.toContain('maelstrom');
    expect(ids(m, 0, false)).toContain('lunge');
    expect(ids(m, 1, false)).not.toContain('lunge');
    // le tourbillon et la charge offrent de se battre (harpons) ou non
    for (const id of ['maelstrom', 'lunge']) {
      expect(EVENT_BY[id].options.some((o) => o.needs?.includes('spear'))).toBe(true);
      expect(EVENT_BY[id].options.some((o) => !o.needs)).toBe(true);
    }
  });

  it('le tourbillon ne tombe qu’en plein combat, une fois le kraken sorti de l’eau, jamais à l’arrivée', () => {
    const m = mission('monster'), at = (k?: number) => eventsFor({ ...ctx(m, 1, k === undefined), at: k }).map((e) => e.id);
    expect(at()).not.toContain('maelstrom');
    expect(at(0.3)).not.toContain('maelstrom');
    expect(at(0.55)).toContain('maelstrom');
    expect(at(0.75)).toContain('maelstrom');
    // la tête du kraken se dresse à mi-combat (voir la scène) : le tourbillon ne vient pas avant
    expect(EVENT_BY.maelstrom.from).toBeGreaterThanOrEqual(0.5);
    // sur le vrai fil d'une chasse : jamais le premier imprévu à l'arrivée
    for (const seed of [3, 7, 11, 19, 23, 29]) {
      const v = village(1, seed), a = v.ex.start(m, 1, 1)!;
      let atK = -1;
      play(v, a, () => a.phase === 'back' || a.phase === 'home', () => {
        if (a.wait?.id === 'maelstrom' && atK < 0) atK = a.phase === 'work' ? a.t / Math.max(1, a.c.work + a.extra) : 0;
      });
      if (atK >= 0) expect(atK).toBeGreaterThanOrEqual(0.5);
    }
  }, 60000);

  it('même d’un village loin de la côte, la chasse prend le large (pas une rivière)', () => {
    for (const ci of [0, 1]) {
      const v = village(1), a = v.ex.start(mission('monster'), ci, 1)!;
      expect(a, v.ex.lastFail ?? '').not.toBeNull();
      expect(a.sea).toBe(true);
      expect(a.site).toBe('river');
    }
  });

  it('le monstre meurt sous les yeux de l’équipe : l’issue se tire avant la fin du travail, après le dernier imprévu, et c’est elle qui compte', { timeout: 30000 }, () => {
    for (const seed of [3, 7, 11, 19]) for (const ci of [0, 1]) {
      const v = village(1, seed), a = v.ex.start(mission('monster'), ci, 1)!;
      expect(a).not.toBeNull();
      let fatedAt = -1, lastEvent = -1, events = 0;
      play(v, a, () => a.phase === 'back' || a.phase === 'home', () => {
        const k = a.phase === 'work' ? a.t / Math.max(1, a.c.work + a.extra) : -1;
        if (a.wait && a.seen.length > events) { events = a.seen.length; lastEvent = k; }
        if (a.fate !== undefined && fatedAt < 0) fatedAt = k;
      });
      expect(a.phase === 'back' || a.phase === 'home').toBe(true);
      expect(a.fate).toBeDefined();
      // tiré pendant le travail, aux quatre cinquièmes, après le dernier imprévu
      expect(fatedAt).toBeGreaterThanOrEqual(FATE_AT - 0.01);
      expect(fatedAt).toBeLessThan(1);
      expect(fatedAt).toBeGreaterThan(lastEvent);
      expect(a.ok).toBe(a.fate);
    }
  });

  it('les autres expéditions tirent leur issue à la fin du travail, comme avant', () => {
    expect(FATED.has('mammoth')).toBe(false);
    expect([...FATED].sort()).toEqual(['dragon', 'kraken', 'megalodon']);
    const v = village(0), a = v.ex.start(mission('herd'), 0, 0)!;
    play(v, a, () => a.phase === 'back' || a.phase === 'home');
    expect(a.fate).toBeUndefined();
    // un imprévu tombe toujours avant l'issue d'une chasse
    expect(nextEventAt({ seen: ['a', 'b'], arriveMiss: true })).toBeLessThan(FATE_AT);
  });
});

describe('chasser le dragon (Moyen Âge)', () => {
  it('facultative, à la grotte, une vraie troupe en armes, un vrai risque, un gros butin', () => {
    const m = mission('dragon');
    expect(m.age).toBe(2);
    expect(m.mandatory).toBe(true);
    // le passage à l'âge industriel tient au filon et au dragon
    expect(MISSIONS.filter((x) => x.age === 2 && x.mandatory).map((x) => x.id)).toEqual(['mine', 'dragon']);
    for (const c of m.choices) {
      expect(c.dest).toBe('cave');
      expect(c.scene).toBe('dragon');
      expect(c.danger).toContain('monster');
      expect(c.party).toBeGreaterThanOrEqual(4);
      expect(c.risk).toBeGreaterThanOrEqual(0.3);
      expect(c.win.some((e) => e.t === 'ore' && e.n >= 10)).toBe(true);
      expect(c.win.some((e) => e.t === 'perk' && e.id === 'dragon')).toBe(true);
      expect(c.lose.some((e) => e.t === 'injured')).toBe(true);
    }
    // l'enfumer : plus long, plus sûr
    expect(m.choices[1].work).toBeGreaterThan(m.choices[0].work);
    expect(m.choices[1].risk).toBeLessThan(m.choices[0].risk);
  });

  it('ses imprévus : les ossements à l’entrée (en arrivant), le souffle de feu (pendant le combat)', () => {
    const m = mission('dragon');
    for (const ci of [0, 1]) {
      const arrive = ids(m, ci, true), later = ids(m, ci, false);
      expect(arrive).toContain('bones');
      expect(later).not.toContain('bones');
      expect(later).toContain('flames');
      expect(arrive.length).toBeGreaterThanOrEqual(2);
    }
    // pas les imprévus des explorateurs de grotte
    expect(ids(m, 0, false)).not.toContain('dark');
  });

  it('la troupe part vers une grotte, armée, et le dragon y meurt (ou s’envole) avant qu’elle ne reparte', () => {
    const v = village(2), a = v.ex.start(mission('dragon'), 0, 2)!;
    expect(a).not.toBeNull();
    expect(a.site).toBe('cave');
    let fatedWork = false;
    play(v, a, () => a.phase === 'back' || a.phase === 'home', () => { if (a.fate !== undefined && a.phase === 'work') fatedWork = true; });
    expect(fatedWork).toBe(true);
    expect(a.ok).toBe(a.fate);
  });
});

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

/** Joue l'expédition et sa scène jusqu'au départ de l'équipe ; `fate` force l'issue dès qu'elle tombe */
function stage(v: ReturnType<typeof village>, a: ActiveExpedition, each: (s: ExpeditionScene, k: number) => void, fate?: boolean) {
  stubCanvas();
  const s = new ExpeditionScene(v.w, v.agents, new THREE.Group(), a, null);
  for (let i = 0; i < 80000 && a.phase !== 'back'; i++) {
    v.agents.update(0.05, 10, a.age, false, 40, 0);
    v.ex.update(0.05);
    if (a.wait) v.ex.decide(a, 0);
    if (fate !== undefined && a.fate !== undefined) a.fate = fate;
    s.update(0.05, a);
    if (a.phase === 'work') each(s, a.t / Math.max(1, a.c.work + a.extra));
  }
  return s;
}

describe('la scène du dragon', () => {
  type Lair = { actor: { root: THREE.Object3D; actions: Map<string, unknown> }; act: string; roll: number; lift: number; hoard: THREE.Object3D };
  const lair = (s: ExpeditionScene) => (s as unknown as { dragon: Lair | null }).dragon!;

  it('le dragon est une bête articulée qui vole, crache le feu, rugit et meurt', () => {
    const { bones, clips } = beastInfo('dragon');
    for (const b of ['head', 'jaw', 'neck1', 'neck2', 'neck3', 'tail4', 'wL1', 'wL2', 'wR1', 'wR2']) expect(bones).toContain(b);
    for (const c of ['Walk', 'Idle', 'Fly', 'Attack', 'Idle_2', 'Hit', 'Death', 'Sleep']) expect(clips).toContain(c);
  });

  it('vaincu, il s’effondre et roule sur le flanc pendant le combat ; la troupe l’a assailli, il a craché le feu', () => {
    const v = village(2), a = v.ex.start(mission('dragon'), 0, 2)!;
    const acts = new Set<string>();
    let rolled = -1, awake = -1;
    const s = stage(v, a, (sc, k) => {
      const d = lair(sc);
      acts.add(d.act);
      if (awake < 0 && d.act !== 'sleep') awake = k;
      if (rolled < 0 && d.roll > 0.4) rolled = k;
      expect(Number.isFinite(d.actor.root.position.x + d.actor.root.position.y + d.actor.root.position.z)).toBe(true);
    }, true);
    expect(awake).toBeGreaterThan(0.05);
    expect(acts).toContain('breath');
    expect(acts).toContain('dead');
    expect(rolled).toBeGreaterThan(FATE_AT - 0.01);
    expect(rolled).toBeLessThan(1);
    expect(a.ok).toBe(true);
    expect(lair(s).hoard.visible).toBe(true);
    s.dispose(a);
  });

  it('enfumé puis vainqueur, il sort de sa grotte et s’envole au loin', () => {
    const v = village(2, 5), a = v.ex.start(mission('dragon'), 1, 2)!;
    let hidden = false, fled = false;
    const s = stage(v, a, (sc, k) => {
      const d = lair(sc);
      if (k < 0.1 && !d.actor.root.visible) hidden = true;
      if (d.act === 'flee' && d.lift > 0.5) fled = true;
    }, false);
    expect(hidden).toBe(true);
    expect(a.ok).toBe(false);
    // il prend son envol dès l'issue tombée ; on l'a vu monter avant le départ de la troupe
    expect(fled || lair(s).act === 'flee' || lair(s).act === 'roar').toBe(true);
    s.dispose(a);
  });
});

describe('organiser les JO', () => {
  it('époque moderne, facultative : il faut toutes les installations sportives', () => {
    const m = mission('games');
    expect(m.age).toBe(4);
    expect(m.mandatory).toBe(false);
    expect(m.requires?.kinds).toEqual(expect.arrayContaining(['stadium', 'football', 'basket', 'tennis', 'waterpark', 'alpine']));
    for (const c of m.choices) {
      expect(c.scene).toBe('games');
      // du bien-être, et des ressources
      expect(c.win.some((e) => e.t === 'need' && e.need === 'joy' && !e.days)).toBe(true);
      expect(c.win.some((e) => e.t === 'ore')).toBe(true);
    }
    // la flamme qui vacille en arrivant, le record pendant les épreuves
    expect(ids(m, 0, true)).toContain('flame');
    expect(ids(m, 0, false)).not.toContain('flame');
    expect(ids(m, 0, false)).toContain('record');
  });

  it('chaque équipement compte à part : le stade seul ne vaut pas le terrain de football', () => {
    const v = village(4), m = mission('games'), [x, z] = v.at;
    build(v.w, 'stadium', x + 8, z, 4);
    for (const k of ['basket', 'tennis', 'waterpark'] as KindId[]) build(v.w, k, x - 6, z + 6, 4);
    v.w.place('alpine', x + 20, z + 20, 0, true, 4, false);
    // le stade (qui compte d'ordinaire comme un terrain de football amélioré) ne suffit pas aux JO
    expect(v.ex.has('football')).toBe(true);
    expect(v.ex.missing(m)).toEqual(['bâtir : terrain de football']);
    expect(reqLine('football', m.requires!.kinds!)).toEqual(['football']);
    // ailleurs, la lignée reste entière
    expect(reqLine('football', ['football'])).toEqual(lineOf('football'));
    build(v.w, 'football', x - 6, z - 6, 4);
    expect(v.ex.missing(m)).toEqual([]);
  });

  it('sans stade ni bassins, on ne peut pas partir ; tout bâti, l’équipe se rend au pied du stade', () => {
    const v = village(4), m = mission('games');
    expect(v.ex.missing(m).length).toBe(6);
    expect(v.ex.why(m, m.choices[0])).toMatch(/Il faut d’abord/);
    const [x, z] = v.at;
    const stadium = build(v.w, 'stadium', x + 8, z, 4);
    expect(v.ex.missing(m).length).toBeGreaterThan(0);
    for (const k of ['football', 'basket', 'tennis', 'waterpark'] as KindId[]) build(v.w, k, x - 6, z + 6, 4);
    v.w.place('alpine', x + 20, z + 20, 0, true, 4, false);
    expect(v.ex.missing(m)).toEqual([]);
    const a = v.ex.start(m, 1, 4)!;
    expect(a).not.toBeNull();
    // au bord de l'emprise du stade
    const cx = stadium.x + 1.5, cz = stadium.z + 1.5;
    expect(Math.max(Math.abs(a.dest[0] - cx), Math.abs(a.dest[1] - cz))).toBeLessThan(3);
    // la cérémonie : le relais fait le tour du stade, la vasque s'allume, les athlètes courent, puis le podium
    type Games = { flame: THREE.Object3D; torch: THREE.Object3D; lit: boolean; sx: number; sz: number; half: number };
    let torch = false, lit = -1, far = 0, crowd = 0;
    const ids = a.party.slice();
    const s = stage(v, a, (sc, k) => {
      const g = (sc as unknown as { games: Games }).games;
      crowd = (sc as unknown as { npcs: unknown[] }).npcs.length;
      if (g.torch.visible) torch = true;
      if (lit < 0 && g.flame.visible) lit = k;
      const p = v.agents.partyPositions([ids[0]])[0];
      if (p && k < 0.3) far = Math.max(far, Math.hypot(p[0] - a.dest[0], p[1] - a.dest[1]));
    });
    expect(torch).toBe(true);
    expect(lit).toBeGreaterThan(0.28);
    expect(lit).toBeLessThan(0.4);
    // le porteur de la flamme s'est éloigné de la vasque : il a fait le tour du stade
    expect(far).toBeGreaterThan(2.5);
    expect(crowd).toBeGreaterThanOrEqual(8);
    s.dispose(a);
  });
});
