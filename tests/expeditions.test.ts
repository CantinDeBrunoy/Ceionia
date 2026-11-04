import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, MOUNTAIN_H, BIOME_DESERT, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, Mission, choiceAt, readExpState, RECENT_EVENTS, effectSummary, Effect } from '../src/sim/missions';
import { EVENTS, EVENT_BY, eventsFor, pickEvent, EventCtx } from '../src/sim/events';
import { Expeditions, Report, ActiveExpedition } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { Underground } from '../src/world/underground';
import { AGES } from '../src/build/catalog';
import { ExpeditionScene } from '../src/render/expeditionScenes';
import { ExpeditionView, along, stepWalker, Walker } from '../src/render/expeditionView';
import { PenView, ARRIVALS, penWay } from '../src/render/pens';
import { Festivities } from '../src/render/festivities';

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

  it('le repérage des profondeurs est facultatif : son plan rend les troupes armées plus sûres, et une ancienne partie le garde', () => {
    const scout = mission('scout'), deep = mission('deep'), armor = deep.choices.find((c) => c.troop === 'armor')!, gallery = mission('mine').choices[0];
    expect(scout.mandatory).toBe(false);
    expect(scout.unlocks).toBeUndefined();
    expect(MISSIONS.some((m) => m.requires?.missions?.includes('scout'))).toBe(false);
    for (const c of scout.choices) expect(c.win).toContainEqual({ t: 'perk', id: 'map' });
    const v = village(2), risk = v.ex.riskOf(armor), other = v.ex.riskOf(gallery);
    v.w.exp.perks.push('map');
    expect(v.ex.riskOf(armor)).toBeCloseTo(risk * 0.8);
    expect(v.ex.riskOf(gallery)).toBeCloseTo(other);
    // une sauvegarde d'avant : le repérage réussi y a dressé le plan
    expect(readExpState({ done: ['scout'] }).perks).toContain('map');
    expect(readExpState({ done: ['herd'] }).perks).not.toContain('map');
  });

  it('le filon de la montagne rapporte de quoi passer à l’âge industriel, quel que soit le choix', () => {
    const m = mission('mine'), ore = (es: Effect[]) => es.reduce((s, e) => s + (e.t === 'ore' ? e.n : 0), 0);
    expect(m.mandatory).toBe(true);
    for (const c of m.choices) {
      expect(ore(c.win), c.label).toBeGreaterThanOrEqual(AGES[3].reqOre!);
      // et le bouton du choix le dit
      expect(effectSummary(c.win)).toContain(`+${ore(c.win)} minerai`);
    }
    expect(ore(m.choices[0].win)).toBe(12);
  });
});

/** De quoi dessiner les petites textures des scènes (brume, étincelles) hors du navigateur */
function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

describe('la chasse au mammouth', () => {
  const m = mission('mammoth');

  it('une seconde expédition obligatoire à la Préhistoire : trois façons de chasser, de quoi festoyer et des peaux', () => {
    expect(m.age).toBe(0);
    expect(m.mandatory).toBe(true);
    expect(m.choices.map((c) => c.dest)).toEqual(['plain', 'mountain', 'far']);
    for (const c of m.choices) {
      expect(c.scene).toBe('mammoth');
      expect(c.carry).toBe('sledge');
      // beaucoup de nourriture (pour quelques jours, et un peu pour toujours), du bien-être pour la fête, les peaux
      const food = c.win.filter((e) => e.t === 'need' && e.need === 'food'), joy = c.win.filter((e) => e.t === 'need' && e.need === 'joy');
      expect(food.reduce((s, e) => s + (e.t === 'need' ? e.n : 0), 0)).toBeGreaterThanOrEqual(7);
      expect(food.some((e) => e.t === 'need' && !e.days)).toBe(true);
      expect(joy.some((e) => e.t === 'need' && e.days)).toBe(true);
      expect(c.win).toContainEqual({ t: 'perk', id: 'furs' });
      expect(effectSummary(c.win)).toMatch(/peaux de mammouth/);
      // des dangers comme ailleurs à la Préhistoire : une équipe de trois à cinq, un risque d'un sur cinq à deux sur cinq
      expect(c.party).toBeGreaterThanOrEqual(3);
      expect(c.party).toBeLessThanOrEqual(5);
      expect(c.risk).toBeGreaterThanOrEqual(0.15);
      expect(c.risk).toBeLessThanOrEqual(0.4);
      expect(c.fail).toBeTruthy();
      // on chasse, sans rien de sanglant : ça se raconte aux enfants
      for (const t of [c.label, c.text, c.winText, c.loseText, c.doing ?? '']) expect(t).not.toMatch(/(^|[\s'’])(sang\b|tu[ée]|mort|cadavre|égorg|dépec|abatt)/i);
    }
    // le plus sûr est le plus long, le plus rapide est le plus risqué
    const [pits, ravine] = m.choices;
    expect(pits.risk).toBeLessThan(ravine.risk);
    expect(pits.work).toBeGreaterThan(ravine.work);
    expect(m.intro).not.toMatch(/sang|mort/i);
  });

  it('ses imprévus : le vieux mâle qui charge, la tempête de neige — à la chasse au mammouth seulement', () => {
    for (const id of ['tusks', 'blizzard']) {
      const e = EVENT_BY[id];
      expect(e.missions).toEqual(['mammoth']);
      expect(e.options.length).toBeGreaterThanOrEqual(2);
      for (const o of e.options) expect(o.text).not.toMatch(/(^|[\s'’])(sang\b|tu[ée]|mort)/i);
    }
    m.choices.forEach((_, ci) => {
      const ids = [...eventsFor(ctxOf(m, ci)), ...eventsFor(ctxOf(m, ci, false))].map((e) => e.id);
      expect(ids).toEqual(expect.arrayContaining(['tusks', 'blizzard']));
    });
    for (const id of ['herd', 'berries', 'horses']) {
      const ids = mission(id).choices.flatMap((_, ci) => [...eventsFor(ctxOf(mission(id), ci)), ...eventsFor(ctxOf(mission(id), ci, false))]).map((e) => e.id);
      expect(ids).not.toContain('tusks');
      expect(ids).not.toContain('blizzard');
    }
  });

  it('les chasseurs partent lances au poing et rentrent avec viande, peaux et bien-être', () => {
    const v = village(0), ex = new Expeditions(v.w, v.agents, () => 100, () => 0.99);
    ex.pop = () => 60;
    const a = ex.start(m, 0)!;
    expect(a).not.toBeNull();
    // pas de lances en réserve au village : ils ont leurs lances de chasse
    expect(a.gear.spear ?? 0).toBe(0);
    for (const id of a.party) expect(v.agents.agents.find((x) => x.id === id)!.kit?.weapon).toBe('spear');
    let report: Report | null = null;
    ex.onReport = (r) => (report = r);
    for (let i = 0; i < 40000 && !report; i++) { v.agents.update(0.05, 10, 0, false, 40, 0); ex.update(0.05); if (a.wait) ex.decide(a, 0); }
    expect(report!.ok).toBe(true);
    expect(v.w.exp.done).toContain('mammoth');
    expect(v.w.exp.perks).toContain('furs');
    expect(v.w.exp.bonus.food).toBeGreaterThan(0);
    expect(report!.summary).toMatch(/peaux de mammouth/);
  });

  it('on voit la harde et le piège, les chasseurs poussent le vieux mâle, puis l’issue au retour', () => {
    stubCanvas();
    for (const ci of [0, 1, 2]) {
      const v = village(0), ex = new Expeditions(v.w, v.agents, () => 100, () => 0.99);
      ex.pop = () => 60;
      const a = ex.start(m, ci)!, group = new THREE.Group(), scene = new ExpeditionScene(v.w, v.agents, group, a, null);
      type Mam = { b: { x: number; z: number; obj: THREE.Object3D }; size: number; lie: number; sink: number; legs: THREE.Object3D[] };
      const s = scene as unknown as { mammoths: Mam[]; mam: { old: Mam; trap: [number, number] } };
      // la harde : le vieux mâle, une femelle, son petit, chacun sur ses quatre pattes, avec sa trompe
      expect(s.mammoths[0].size).toBeGreaterThan(s.mammoths[1].size);
      expect(s.mammoths[2].size).toBeLessThan(s.mammoths[1].size * 0.6);
      for (const x of s.mammoths) { expect(x.legs.length).toBe(4); expect(group.children).toContain(x.b.obj); }
      const old = s.mam.old, d0 = Math.hypot(old.b.x - s.mam.trap[0], old.b.z - s.mam.trap[1]);
      let strides = 0;
      for (let i = 0; i < 40000 && !(a.phase === 'back' && a.t > 8); i++) {
        v.agents.update(0.05, 10, 0, false, 40, 0); ex.update(0.05);
        if (a.wait) ex.decide(a, 0);
        const legs = old.legs[0].rotation.x;
        scene.update(0.05, a);
        if (Math.abs(old.legs[0].rotation.x - legs) > 0.01) strides++;
      }
      expect(a.ok).toBe(true);
      // il a marché (ses pattes ont battu) vers le piège
      expect(strides).toBeGreaterThan(20);
      expect(Math.hypot(old.b.x - s.mam.trap[0], old.b.z - s.mam.trap[1])).toBeLessThan(d0);
      // pris : dans la fosse, au fond du ravin, ou couché, épuisé
      if (ci === 2) expect(old.lie).toBeGreaterThan(0.5); else expect(old.sink).toBeGreaterThan(0.02);
      // personne ne ramène de mammouth à la maison : ils restent tous dans la scène
      expect(scene.handOver(['sheep'])).toEqual([null]);
      expect(s.mammoths.every((x) => group.children.includes(x.b.obj))).toBe(true);
      scene.dispose(a);
    }
  });
});

describe('la fête du retour', () => {
  it('à chaque âge, un feu de joie à la taille du camp, sa ronde, ses musiciens et son décor ; puis tout se range', () => {
    stubCanvas();
    for (let age = 0; age <= 5; age++) {
      const v = village(age), fest = new Festivities(v.w), b = v.ex.base()!;
      fest.start(b[0], b[1], age);
      type F = { x: number; y: number; z: number; tongues: { m: THREE.Mesh }[]; dancers: unknown[]; band: unknown[]; smoke: { s: THREE.Sprite }[]; decor: THREE.Group; group: THREE.Group; dur: number };
      const fs = (fest as unknown as { fests: F[]; embers: unknown[] }).fests, f = fs[0];
      // à côté du cœur du village, là où l'équipe est revenue (elle regarde la ronde au lieu de se tenir dans le feu), hors des maisons
      expect(Math.hypot(f.x - b[0], f.z - b[1])).toBeGreaterThan(0.9);
      expect(v.w.occ[v.w.ci(Math.floor(f.x), Math.floor(f.z))]).toBeFalsy();
      expect(f.tongues.length).toBeGreaterThanOrEqual(6);
      expect(f.dancers.length).toBe(10);
      expect(f.band.length).toBe(2);
      let top = 0, smoke = 0;
      for (let i = 0; i < 300; i++) {
        fest.update(0.05);
        for (const t of f.tongues) top = Math.max(top, t.m.position.y + t.m.scale.y);
        for (const s of f.smoke) smoke = Math.max(smoke, s.s.position.y);
      }
      // un grand feu (deux fois un habitant), pas une colonne : la fumée s'efface bien avant le ciel
      expect(top).toBeGreaterThan(0.3);
      expect(top).toBeLessThan(0.6);
      expect(smoke).toBeGreaterThan(0.5);
      expect(smoke).toBeLessThan(1.6);
      expect((fest as unknown as { embers: unknown[] }).embers.length).toBeLessThan(100);
      // le décor : le bûcher et, dès l'Antiquité, les mâts et leurs guirlandes, la table et ses bancs
      expect(f.decor.children.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < 400 && fs.length; i++) fest.update(0.05);
      expect(fs.length).toBe(0);
      expect(fest.group.children.includes(f.group)).toBe(false);
    }
  });
});

describe('les bêtes ramenées', () => {
  it('une suiveuse garde son allure : pas d’hésitation entre la marche et l’arrêt quand la trace avance par bonds', () => {
    // le dernier de l'équipe marche droit, à une case par seconde ; sa trace ne retient un point que tous les 0,04
    const trail: number[] = [0, 0], f: Walker = { x: -0.5, z: 0, heading: Math.PI / 2, sp: 0, gait: 0 }, dt = 1 / 60;
    let changes = 0, gait = f.gait, jump = 0;
    for (let i = 1; i <= 600; i++) {
      const hx = i * dt, n = trail.length;
      if (hx - trail[n - 2] > 0.04) trail.push(hx, 0);
      const p = along(trail, 0.3, hx, 0), x0 = f.x;
      stepWalker(f, p ? p[0] : f.x, p ? p[1] : f.z, 1.3, dt);
      jump = Math.max(jump, Math.abs(f.x - x0));
      if (i > 60 && f.gait !== gait) changes++;
      gait = f.gait;
      // collée à sa place dans la file, à 0,3 derrière
      if (i > 120) expect(Math.abs(f.x - (hx - 0.3))).toBeLessThan(0.02);
    }
    expect(changes).toBe(0);
    expect(f.gait).toBe(2);
    expect(jump).toBeLessThan(1.3 * dt + 1e-9);
    // elle s'arrête quand l'équipe s'arrête (du galop au pas, puis à l'arrêt), sans repartir ni hésiter
    for (let i = 0; i < 120; i++) { stepWalker(f, f.x, f.z, 1.3, dt); if (f.gait !== gait) changes++; gait = f.gait; }
    expect(f.gait).toBe(0);
    expect(changes).toBeLessThanOrEqual(2);
  });

  it('une bête qui arrive à l’enclos le contourne et entre par le portail, sans traverser la clôture', () => {
    // (repère de l'enclos : la clôture autour de ±0,88, le portail au milieu de l'avant, en z = 0,88)
    const inside = (x: number, z: number) => Math.abs(x) < 0.95 && Math.abs(z) < 0.95;
    for (const [x0, z0] of [[0, -2], [-0.4, -1.4], [1.6, 0], [-1.1, 0.5], [0.3, 1.6], [2, 2], [-2.5, -1]]) {
      const way = penWay(x0, z0);
      expect(way[way.length - 1]).toEqual([0, 0.55]);
      // chaque étape, tracée en ligne droite, ne passe dans le pré que par le portail
      let [x, z] = [x0, z0];
      for (const [tx, tz] of way) {
        for (let k = 0; k <= 1; k += 0.02) {
          const px = x + (tx - x) * k, pz = z + (tz - z) * k;
          if (inside(px, pz)) expect(Math.abs(px), `${x0}, ${z0}`).toBeLessThan(0.25);
        }
        [x, z] = [tx, tz];
      }
    }
    // déjà au pré : elle va droit à sa place ; sur le seuil, un pas à l'intérieur
    expect(penWay(0.2, -0.3)).toEqual([]);
    expect(penWay(0.1, 0.85)).toEqual([[0, 0.55]]);
  });

  it('les moutons quittent la harde, suivent l’équipe sans à-coups, puis entrent à l’enclos de là où ils sont', () => {
    stubCanvas();
    const v = village(0), ex = new Expeditions(v.w, v.agents, () => 100, () => 0.99);
    ex.pop = () => 60;
    // un enclos à côté du village
    let pen = false;
    for (let z = 10; z < N - 10 && !pen; z++) for (let x = 10; x < N - 10 && !pen; x++) if (v.w.canPlace('pen', x, z) === null && [...v.w.buildings.values()].some((b) => Math.hypot(b.x - x, b.z - z) < 8)) { v.w.place('pen', x, z, 0, true, 0, false); pen = true; }
    expect(pen).toBe(true);
    const view = new ExpeditionView(v.w, v.agents, ex), pens = new PenView(v.w), a = ex.start(mission('herd'), 0)!;
    type F = { x: number; z: number; gait: number; kind?: string };
    const shows = (view as unknown as { shows: Map<number, { followers: F[]; scene: unknown }> }).shows;
    let herd: [number, number][] = [], start: [number, number][] = [], last: [number, number][] = [], jump = 0, changes = 0, gaits: number[] = [];
    const dt = 1 / 30;
    for (let i = 0; i < 60000 && ex.active.includes(a); i++) {
      v.agents.update(dt, 10, 0, false, 40, 0); ex.update(dt);
      if (a.wait) ex.decide(a, 0);
      const sh = shows.get(a.id);
      if (a.phase === 'work' && sh?.scene) herd = (sh.scene as { beasts: { x: number; z: number }[] }).beasts.map((b) => [b.x, b.z]);
      view.update(dt); pens.update(dt);
      const fs = shows.get(a.id)?.followers.filter((f) => f.kind) ?? [];
      if (!fs.length) continue;
      if (!start.length) { start = fs.map((f) => [f.x, f.z]); gaits = fs.map((f) => f.gait); }
      fs.forEach((f, j) => {
        if (last[j]) jump = Math.max(jump, Math.hypot(f.x - last[j][0], f.z - last[j][1]));
        if (f.gait !== gaits[j]) changes++;
        gaits[j] = f.gait;
      });
      last = fs.map((f) => [f.x, f.z]);
    }
    expect(start.length).toBeGreaterThanOrEqual(4);
    // chaque mouton part d'où il paissait dans la harde
    for (const [x, z] of start) expect(Math.min(...herd.map(([hx, hz]) => Math.hypot(hx - x, hz - z)))).toBeLessThan(0.1);
    // ni saut, ni allure qui hésite à chaque pas
    expect(jump).toBeLessThan(0.15);
    expect(changes / start.length).toBeLessThan(12);
    // l'expédition finie, l'enclos reprend chaque mouton là où il était, et il y entre par le portail
    view.update(dt); pens.update(dt);
    const inPen = [...(pens as unknown as { pens: Map<number, { cx: number; cz: number; rot: number; beasts: { kind: string; x: number; z: number; route?: unknown }[] }> }).pens.values()][0];
    const sheep = inPen.beasts.filter((b) => b.kind === 'sheep');
    expect(sheep.length).toBe(start.length);
    expect(sheep.every((b) => b.route)).toBe(true);
    for (const b of sheep) {
      const c = Math.cos(inPen.rot), s = Math.sin(inPen.rot), wx = inPen.cx + b.x * c + b.z * s, wz = inPen.cz - b.x * s + b.z * c;
      expect(Math.min(...last.map(([x, z]) => Math.hypot(x - wx, z - wz)))).toBeLessThan(0.05);
    }
    expect(ARRIVALS.every((r) => r.claimed)).toBe(true);
  });
});
