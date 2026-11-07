import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, boatKindFor, BoatKind, choiceAt, isLegendary, mandatoriesFor, readExpState } from '../src/sim/missions';
import { EVENT_BY, eventsFor, EventCtx } from '../src/sim/events';
import { Expeditions, ActiveExpedition, seaClearance, SEA_CLEAR, SEA_CLEAR_MIN, openWater } from '../src/sim/expeditions';
import { GEN } from '../src/world/continent';
import { Agents } from '../src/sim/agents';
import { ExpeditionScene } from '../src/render/expeditionScenes';
import { shipRoute } from '../src/render/transports';

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

describe('l’embarcation évolue avec l’âge', () => {
  it('pirogue, barque, voilier, vapeur, vedette, hydroglisseur ; la troupe armée prend la galère aux premiers âges', () => {
    const kinds: BoatKind[] = [0, 1, 2, 3, 4, 5].map((a) => boatKindFor(a));
    expect(kinds).toEqual(['canoe', 'rowboat', 'sail', 'steam', 'launch', 'hover']);
    expect(new Set(kinds).size).toBe(6);
    expect([0, 1, 2].map((a) => boatKindFor(a, true))).toEqual(['galley', 'galley', 'galley']);
    expect(boatKindFor(3, true)).toBe('steam');
    // un âge hors bornes ne casse rien
    expect(boatKindFor(9)).toBe('hover');
    expect(boatKindFor(-1)).toBe('canoe');
  });
});

describe('le récif, la pêche au large et la chasse au monstre', () => {
  const sea = (id: string, ci: number, age = mission(id).age, arrive = true): EventCtx => {
    const c = mission(id).choices[ci];
    return { dest: c.dest, mission: id, scene: c.scene, age, arrive, sea: !!c.sea, warm: false };
  };
  const ids = (ctx: EventCtx) => eventsFor(ctx).map((e) => e.id);

  it('le récif et les grands bancs prennent la mer', () => {
    expect(mission('reef').choices[0].sea).toBe(true);
    expect(mission('fishing').choices[1].sea).toBe(true);
    expect(mission('fishing').choices[0].sea).toBeFalsy();
  });

  it('requins en mer, crocodiles sur les eaux douces chaudes, jamais l’inverse', () => {
    expect(ids(sea('reef', 0, 4))).toContain('shark');
    expect(ids(sea('fishing', 1))).toContain('shark');
    expect(ids(sea('reef', 0, 4))).not.toContain('croc');
    // sur une rivière : pas de requin ; le crocodile seulement sous un climat chaud
    const river = (warm: boolean): EventCtx => ({ dest: 'river', mission: 'fishing', scene: 'boat', age: 1, arrive: false, sea: false, warm });
    expect(ids(river(true))).toContain('croc');
    expect(ids(river(false))).not.toContain('croc');
    expect(ids(river(true))).not.toContain('shark');
    // le crocodile guette aussi ceux qui pêchent depuis la berge
    expect(ids({ dest: 'river', mission: 'fishing', scene: 'fish', age: 1, arrive: false, sea: false, warm: true })).toContain('croc');
    // pas de crocodile en pleine montagne
    expect(ids({ dest: 'mountain', mission: 'flint', scene: 'mine', age: 0, arrive: false, sea: false, warm: true })).not.toContain('croc');
  });

  it('chaque attaque offre de fuir, de se battre à la lance ou de jeter un appât', () => {
    for (const id of ['shark', 'croc']) {
      const e = EVENT_BY[id];
      expect(e.options.length).toBe(3);
      expect(e.options.some((o) => o.needs?.includes('spear'))).toBe(true);
      expect(e.options.some((o) => !o.needs && /fuir/i.test(o.label))).toBe(true);
      expect(e.options.some((o) => /appât|viande/i.test(o.label))).toBe(true);
      // se battre est la plus sûre, fuir la plus coûteuse en temps
      const spear = e.options.find((o) => o.needs)!;
      expect(Math.min(...e.options.map((o) => o.risk))).toBe(spear.risk);
    }
  });

  it('la chasse au monstre : deux expéditions armées de l’Antiquité (le kraken obligatoire, le mégalodon légendaire), galères et troupe à pied, des trophées', () => {
    const kraken = mission('kraken'), mega = mission('megalodon');
    expect(MISSIONS.some((m) => m.id === 'monster')).toBe(false);
    expect([kraken.age, mega.age]).toEqual([1, 1]);
    expect(kraken.mandatory).toBe(true);
    expect(mega.mandatory).toBe(false);
    expect(isLegendary(kraken) && isLegendary(mega)).toBe(true);
    expect(kraken.icon).not.toBe(mega.icon);
    expect(mandatoriesFor(1).map((m) => m.id)).toEqual(['seeds', 'kraken', 'portal']);
    for (const c of kraken.choices) expect(c.scene).toBe('kraken');
    for (const c of mega.choices) expect(c.scene).toBe('megalodon');
    for (const c of [...kraken.choices, ...mega.choices]) {
      expect(c.sea).toBe(true);
      // à pied : ni chevaux, ni carburant ; une vraie troupe et un vrai risque
      expect(c.mounts ?? 0).toBe(0);
      expect(c.fuel ?? 0).toBe(0);
      expect(c.party).toBeGreaterThanOrEqual(5);
      expect(c.risk).toBeGreaterThan(0.3);
      expect(c.danger).toContain('monster');
      // bien-être, nourriture, minerai et un trophée
      const kinds = c.win.map((e) => e.t);
      expect(kinds).toContain('ore');
      expect(kinds).toContain('perk');
      expect(c.win.some((e) => e.t === 'need' && e.need === 'joy')).toBe(true);
      expect(c.win.some((e) => e.t === 'need' && e.need === 'food')).toBe(true);
      expect(c.lose.some((e) => e.t === 'injured')).toBe(true);
      // à tous les âges, la même troupe
      expect(choiceAt(c, 4).party).toBe(c.party);
    }
    // le trophée est propre à chaque monstre
    for (const m of [kraken, mega]) for (const c of m.choices) expect(c.win.some((e) => e.t === 'perk' && e.id === m.id)).toBe(true);
    // des imprévus de mer pour la galère, pas ceux du requin ni de la rivière
    for (const id of ['megalodon', 'kraken']) {
      const got = ids(sea(id, 0, 1));
      expect(got).toEqual(expect.arrayContaining(['swell', 'wreck']));
      expect(got).not.toContain('shark');
      expect(got).not.toContain('flood');
      expect(got).not.toContain('traveler');
    }
  });

  it('les anciennes sauvegardes : « le monstre des mers » réussi vaut le kraken (l’Antiquité reste franchie), et le mégalodon s’il en a les dents', () => {
    expect(readExpState({ done: ['seeds', 'monster'], perks: ['seeds', 'kraken'] }).done).toEqual(['seeds', 'kraken']);
    const mega = readExpState({ done: ['seeds', 'monster'], perks: ['megalodon'] });
    expect(mega.done).toEqual(['seeds', 'kraken', 'megalodon']);
    // (le portail n'est demandé que sur une carte qui a son île : pas dans ces anciennes parties)
    expect(mandatoriesFor(1).filter((m) => m.id !== 'portal').every((m) => mega.done.includes(m.id))).toBe(true);
    expect(mega.perks).toEqual(['megalodon']);
    // rien à faire pour les nouvelles
    expect(readExpState({ done: ['megalodon'], perks: ['megalodon'] }).done).toEqual(['megalodon']);
  });
});

/** Un village sur la côte : ses maisons à la distance voulue d’une mer profonde */
function coastVillage(age: number, seed = 7) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const deep = (x: number, z: number) => w.inCells(x, z) && !w.lake[w.ci(x, z)] && w.cellAvg(x, z) < -0.6;
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let best: [number, number] | null = null, bd = 1e9;
  for (let z = 14; z < N - 14; z += 2)
    for (let x = 14; x < N - 14; x += 2) {
      if (w.cellAvg(x, z) < 0.5 || !ok(x, z)) continue;
      // la mer profonde la plus proche, entre 10 et 18 cases
      let d = 1e9;
      for (let dz = -18; dz <= 18; dz += 2) for (let dx = -18; dx <= 18; dx += 2) if (deep(x + dx, z + dz)) d = Math.min(d, Math.hypot(dx, dz));
      if (d >= 10 && d < bd) { bd = d; best = [x, z]; }
    }
  if (!best) throw new Error('pas de côte');
  const [x, z] = best;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

describe('en mer : la barque file au large, la faune et le monstre sont de la partie', () => {
  function sail(id: string, ci: number, age: number) {
    stubCanvas();
    const v = coastVillage(age), m = mission(id);
    const a = v.ex.start(m, ci, age)!;
    expect(a).not.toBeNull();
    const group = new THREE.Group(), scene = new ExpeditionScene(v.w, v.agents, group, a, null);
    return { v, a, group, scene, s: scene as unknown as { boat: { obj: THREE.Object3D; home: [number, number]; out: [number, number] } | null; swimmers: { kind: string; obj: THREE.Object3D }[]; monster: { kind: string; obj: THREE.Object3D; tents: { obj: THREE.Object3D }[]; hits: number } | null; darts: unknown[] } };
  }
  /** Joue l’expédition jusqu’à son terme, en prenant des mesures à chaque image */
  function run(r: ReturnType<typeof sail>, each: (k: number) => void) {
    const { v, a, scene } = r;
    for (let i = 0; i < 60000 && a.phase !== 'back'; i++) {
      v.agents.update(0.05, 10, a.age, false, 40, 0); v.ex.update(0.05);
      if (a.wait) v.ex.decide(a, 0);
      scene.update(0.05, a);
      if (a.phase === 'work') each(Math.min(1, a.t / Math.max(1, a.c.work + a.extra)));
    }
  }

  it('le récif : au large (sur l’eau profonde), à bord de l’embarcation de l’âge, entouré de baleine, dauphins, raies et poissons', () => {
    const r = sail('reef', 0, 4);
    expect(r.a.sea).toBe(true);
    expect(r.s.boat).not.toBeNull();
    const { home, out } = r.s.boat!;
    // bien plus loin que la rive
    expect(Math.hypot(out[0] - home[0], out[1] - home[1])).toBeGreaterThan(3);
    const kinds = new Set(r.s.swimmers.map((x) => x.kind));
    for (const k of ['whale', 'dolphin', 'manta', 'school']) expect(kinds.has(k), k).toBe(true);
    let far = 0, jumped = false;
    const ys = new Map<unknown, number>();
    run(r, () => {
      const p = r.s.boat!.obj.position;
      far = Math.max(far, Math.hypot(p.x - home[0], p.z - home[1]));
      for (const sw of r.s.swimmers) if (sw.obj.position.y > (ys.get(sw) ?? 1e9) + 0.01) jumped = true; else ys.set(sw, Math.min(ys.get(sw) ?? 1e9, sw.obj.position.y));
    });
    expect(far).toBeGreaterThan(3);
    expect(jumped).toBe(true);
    r.scene.dispose(r.a);
  });

  it('mégalodon et kraken : le combat se tient en haute mer, loin de toute rive ou falaise', () => {
    for (const ci of [0, 1]) {
      const r = sail(ci ? 'kraken' : 'megalodon', 0, 1), { home } = r.s.boat!, out = (r.scene as unknown as { arena: [number, number] }).arena;
      // un point d'eau dégagé tout autour (aucune rive, aucun rocher dans le rayon du combat et de la caméra)
      expect(seaClearance(r.v.w, out[0], out[1], SEA_CLEAR, openWater(r.v.w))).toBeGreaterThanOrEqual(SEA_CLEAR_MIN);
      expect(Math.hypot(out[0] - home[0], out[1] - home[1])).toBeGreaterThan(2);
      // pendant le combat, ni le monstre ni la galère ne frôlent la rive
      const seen: number[] = [];
      run(r, (k) => { if (k < 0.25 || k > 0.8) return; const p = r.s.boat!.obj.position, m = r.s.monster!.obj; seen.push(seaClearance(r.v.w, p.x, p.z, 8)); if (m.visible) seen.push(seaClearance(r.v.w, m.position.x, m.position.z, 8)); });
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(SEA_CLEAR_MIN - 1);
      r.scene.dispose(r.a);
    }
  });

  it('chaque âge a sa barque (une géométrie distincte)', () => {
    const geos = new Set<unknown>();
    for (const age of [0, 1, 2, 3, 4, 5]) {
      const r = sail('fishing', 1, age);
      const mesh = r.s.boat!.obj.children[0] as THREE.Mesh;
      geos.add(mesh.geometry);
      r.scene.dispose(r.a);
    }
    expect(geos.size).toBe(6);
  });

  it('le requin, le crocodile, la houle et l’épave se jouent sur la scène, pour chaque option, puis s’effacent', () => {
    for (const [id, mid, ci, age] of [['shark', 'reef', 0, 4], ['croc', 'fishing', 0, 1], ['swell', 'megalodon', 0, 1], ['wreck', 'kraken', 0, 1], ['maelstrom', 'kraken', 0, 1]] as [string, string, number, number][]) {
      for (let pick = 0; pick < EVENT_BY[id].options.length; pick++) {
        const r = sail(mid, ci, age), st = () => (r.scene as unknown as { stagings: { id: string; objs: THREE.Object3D[] }[] }).stagings;
        r.a.wait = EVENT_BY[id];
        for (let i = 0; i < 40; i++) r.scene.update(0.05, r.a);
        expect(st().some((x) => x.id === id), `${id} surgit`).toBe(true);
        // l’imprévu attend la décision : il est là, visible, et personne ne sort de la scène
        for (const o of st().flatMap((x) => x.objs)) expect(Number.isFinite(o.position.x + o.position.y + o.position.z), id).toBe(true);
        r.a.wait = null; r.a.seen.push(id); r.a.picks.push(pick);
        for (let i = 0; i < 400; i++) {
          r.scene.update(0.05, r.a);
          for (const o of st().flatMap((x) => x.objs)) if (!Number.isFinite(o.position.x + o.position.y + o.position.z)) throw new Error(`${id}/${pick} : position invalide`);
        }
        expect(st().length, `${id}/${pick} s’efface`).toBe(0);
        r.scene.dispose(r.a);
      }
    }
  }, 30000);

  it('le mégalodon et le kraken : toute la troupe à bord de la galère, le monstre paraît, les harpons le frappent', () => {
    for (const [ci, kind] of [[0, 'megalodon'], [1, 'kraken']] as [number, string][]) {
      const r = sail(ci ? 'kraken' : 'megalodon', 0, 1);
      expect(r.s.monster?.kind).toBe(kind);
      expect(r.a.party.length).toBeGreaterThanOrEqual(5);
      let seen = false, darts = 0;
      run(r, () => {
        const m = r.s.monster!;
        if (m.obj.visible) seen = true;
        darts = Math.max(darts, r.s.darts.length);
      });
      expect(seen).toBe(true);
      expect(darts).toBeGreaterThan(0);
      expect(r.s.monster!.hits).toBeGreaterThan(0);
      r.scene.dispose(r.a);
    }
  });

  it('le monstre vaincu meurt sous les yeux de la troupe : le mégalodon se retourne pendant le combat, la galère au large', () => {
    for (const [ci, kind] of [[0, 'megalodon'], [1, 'kraken']] as [number, string][]) {
      const r = sail(ci ? 'kraken' : 'megalodon', 0, 1), { home } = r.s.boat!;
      // l'issue est tirée d'avance : vaincu
      let rolled = -1, sunk = -1, farAtDeath = 0;
      const { v, a, scene } = r;
      for (let i = 0; i < 60000 && a.phase !== 'back'; i++) {
        v.agents.update(0.05, 10, a.age, false, 40, 0); v.ex.update(0.05);
        if (a.wait) v.ex.decide(a, 0);
        if (a.fate === false) a.fate = true;
        scene.update(0.05, a);
        if (a.phase !== 'work' || a.fate === undefined) continue;
        const m = r.s.monster as unknown as { obj: THREE.Object3D; ended: boolean };
        expect(m.ended).toBe(true);
        const k = a.t / Math.max(1, a.c.work + a.extra), p = r.s.boat!.obj.position;
        if (kind === 'megalodon' && rolled < 0 && Math.abs(m.obj.rotation.z) > 3) { rolled = k; farAtDeath = Math.hypot(p.x - home[0], p.z - home[1]); }
        if (kind === 'kraken' && sunk < 0 && !m.obj.visible) { sunk = k; farAtDeath = Math.hypot(p.x - home[0], p.z - home[1]); }
      }
      const when = kind === 'megalodon' ? rolled : sunk;
      // pendant le travail, pas une fois l'équipe repartie ; la galère est encore au large
      expect(when, kind).toBeGreaterThan(0);
      expect(when, kind).toBeLessThan(1);
      expect(farAtDeath, kind).toBeGreaterThan(3);
      expect(a.ok).toBe(true);
      r.scene.dispose(r.a);
    }
  });

  it('deux galères encadrent le monstre, l’équipage partagé entre elles, sans pêcheur à la ligne', () => {
    for (const id of ['megalodon', 'kraken']) {
      const r = sail(id, 0, 1);
      type Sc = { escort: { obj: THREE.Object3D; riders: number[] } | null; arena: [number, number] | null; rods: Map<number, unknown>; boat: { obj: THREE.Object3D; riders: number[] } };
      const s = r.scene as unknown as Sc;
      expect(s.escort, id).not.toBeNull();
      // toute la troupe embarque, une moitié sur chaque galère
      expect(s.boat.riders.length).toBe(r.a.party.length);
      expect(s.escort!.riders.length).toBe(Math.floor(r.a.party.length / 2));
      let flank = 0, rods = 0, apart = Infinity;
      run(r, (k) => {
        rods += s.rods.size;
        if (k < 0.3 || k > 0.8) return;
        const a = s.boat.obj.position, b = s.escort!.obj.position, [cx, cz] = s.arena!;
        apart = Math.min(apart, Math.hypot(a.x - b.x, a.z - b.z));
        // le point de combat, entre les deux galères
        if (Math.hypot((a.x + b.x) / 2 - cx, (a.z + b.z) / 2 - cz) < 0.4) flank++;
      });
      expect(rods, id).toBe(0);
      expect(flank, id).toBeGreaterThan(0);
      expect(apart, id).toBeGreaterThan(2);
      expect(r.s.monster!.hits, id).toBeGreaterThan(0);
      r.scene.dispose(r.a);
    }
  });

  it('le kraken a tout son corps : la tête et ses bras, qui ondulent autour d’elle', () => {
    const r = sail('kraken', 0, 1), m = r.s.monster as unknown as { obj: THREE.Group; arms: THREE.Object3D[] };
    expect(m.arms.length).toBe(8);
    for (const arm of m.arms) expect(arm.parent).toBe(m.obj);
    r.scene.dispose(r.a);
  });
});

describe('la chasse au monstre se tient en vraie haute mer, jamais dans une flaque', () => {
  /** Un village de quatre maisons en (x, z) */
  function settle(w: World, x: number, z: number, seed = 7) {
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 1, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 1, false, 40, 0);
    const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
    ex.pop = () => 60;
    return { w, agents, ex };
  }
  /** Le point de combat de la scène : en haute mer, dégagé tout autour, loin de la rive */
  function arena(v: ReturnType<typeof settle>, id: string) {
    stubCanvas();
    const a = v.ex.start(mission(id), 0, 1);
    expect(a, v.ex.lastFail ?? '').not.toBeNull();
    const scene = new ExpeditionScene(v.w, v.agents, new THREE.Group(), a!, null), sc = scene as unknown as { boat: { home: [number, number] }; arena: [number, number] }, bt = { home: sc.boat.home, out: sc.arena };
    scene.dispose(a!);
    return bt;
  }

  it('sur plusieurs continents générés, d’où que parte le village : un point de haute mer reliée au large, dégagé de tout', () => {
    let hunts = 0, inside = 0;
    for (const seed of [2026, 42, 77, 123]) for (const f of [0.15, 0.5, 0.85]) {
      setMapSize(192);
      const w = new World();
      newWorld(w, 3, seed, GEN);
      w.updateVis();
      const sea = openWater(w);
      // trois villages : au nord, au milieu, au sud des terres bâtissables
      const spots: [number, number][] = [];
      for (let z = 10; z < N - 10; z += 3) for (let x = 10; x < N - 10; x += 3) if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < 3 && w.cellSlope(x, z) < 0.2 && [0, 2].every((d) => w.canPlace('house', x + d, z + d) === null)) spots.push([x, z]);
      const [x, z] = spots[Math.floor(spots.length * f)];
      const v = settle(w, x, z);
      for (const id of ['megalodon', 'kraken']) {
        const { out, home } = arena(v, id);
        expect(seaClearance(w, out[0], out[1], SEA_CLEAR, sea), `${seed} ${f} ${id}`).toBeGreaterThanOrEqual(SEA_CLEAR_MIN);
        // le mouillage aussi est en haute mer : la galère y file tout droit, sans passer par la terre
        for (let k = 0; k <= 1; k += 0.05) expect(sea[w.ci(Math.floor(home[0] + (out[0] - home[0]) * k), Math.floor(home[1] + (out[1] - home[1]) * k))], `${seed} ${f} ${id}`).toBe(1);
        // d'ordinaire assez loin du bord de la carte pour que la vue ne montre pas le bout du monde
        hunts++;
        if (Math.min(out[0], out[1], N - out[0], N - out[1]) >= SEA_CLEAR + 8) inside++;
      }
    }
    expect(inside / hunts).toBeGreaterThan(0.75);
  }, 120000);

  /** Une carte plate de terre ferme (hauteur 1), où l'on creuse de l'eau */
  function flat(dig: (x: number, z: number) => boolean) {
    setMapSize(96);
    const w = new World(), heights = new Float32Array((N + 1) * (N + 1));
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) heights[z * (N + 1) + x] = dig(x, z) ? -1.6 : 1;
    w.restore({ heights, road: new Uint8Array(N * N), veg: new Uint8Array(N * N), buildings: [], nextId: 1 });
    w.updateVis();
    return w;
  }

  it('une mer intérieure, si grande soit-elle, n’est pas la haute mer : « Aucune haute mer atteignable »', () => {
    // un grand bassin de 34 cases de côté, sous le niveau de la mer, sans issue vers le large
    const w = flat((x, z) => x >= 50 && x <= 84 && z >= 30 && z <= 64);
    expect(openWater(w).some((c) => c === 1)).toBe(false);
    const v = settle(w, 40, 44);
    for (const id of ['megalodon', 'kraken']) {
      expect(v.ex.start(mission(id), 0, 1)).toBeNull();
      expect(v.ex.lastFail).toMatch(/Aucune haute mer atteignable/);
    }
  });

  it('le même bassin ouvert sur le large : la chasse y part, au milieu de l’eau', () => {
    const w = flat((x, z) => x >= 50 && z >= 30 && z <= 64);
    const v = settle(w, 40, 44), sea = openWater(w);
    const { out } = arena(v, 'megalodon');
    expect(seaClearance(w, out[0], out[1], SEA_CLEAR, sea)).toBeGreaterThanOrEqual(SEA_CLEAR_MIN);
  });

  it('un étroit bras de mer (moins large que la scène) ne suffit pas', () => {
    // un chenal de 8 cases de large, ouvert sur le bord de la carte
    const w = flat((x, z) => x >= 50 && z >= 40 && z <= 48);
    const v = settle(w, 40, 44);
    expect(v.ex.start(mission('kraken'), 0, 1)).toBeNull();
    expect(v.ex.lastFail).toMatch(/Aucune haute mer atteignable/);
  });
});

describe('le navire du port suit l’eau jusqu’au large', () => {
  it('son chemin longe la rivière ou la côte bien au-delà de dix cases, reste sur l’eau et se lisse', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    // un quai : une case d’eau peu profonde, collée à une eau profonde
    let found: [number, number, number, number] | null = null;
    for (let z = 30; z < N - 30 && !found; z += 2)
      for (let x = 30; x < N - 30 && !found; x += 2) {
        const h = w.cellAvg(x, z);
        if (h > -0.1 || h < -0.3 || w.lake[w.ci(x, z)]) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.cellAvg(x + dx * 2, z + dz * 2) < -0.6 && !w.lake[w.ci(x + dx * 2, z + dz * 2)]) { found = [x, z, dx, dz]; break; }
      }
    expect(found).not.toBeNull();
    const [x, z, dx, dz] = found!;
    const route = shipRoute(w, [x + 0.5, z + 0.5], dx, dz);
    expect(route.length).toBeGreaterThan(20);
    // bien plus loin que les dix cases d’autrefois
    const last = route[route.length - 1];
    expect(Math.hypot(last[0] - x, last[1] - z)).toBeGreaterThan(12);
    // des points tous les demi-cases ; jamais sur la terre ferme (à une case de marge près)
    let wet = 0;
    route.forEach(([px, pz], i) => {
      if (i) expect(Math.hypot(px - route[i - 1][0], pz - route[i - 1][1])).toBeLessThan(0.65);
      if (w.cellAvg(Math.floor(px), Math.floor(pz)) < 0.05) wet++;
    });
    expect(wet / route.length).toBeGreaterThan(0.95);
  });

  it('faute d’eau, le navire reste à quai', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    let land: [number, number] | null = null;
    for (let z = 20; z < N - 20 && !land; z += 7) for (let x = 20; x < N - 20 && !land; x += 7) if (w.cellAvg(x, z) > 1 && !w.nearWater(x, z, 4)) land = [x, z];
    expect(land).not.toBeNull();
    expect(shipRoute(w, [land![0] + 0.5, land![1] + 0.5], 0, 1).length).toBeLessThanOrEqual(2);
  });
});

// (pour que le type ActiveExpedition reste utilisé quand les tests évoluent)
export type { ActiveExpedition };
