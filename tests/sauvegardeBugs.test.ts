import { describe, it, expect, beforeEach } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { mulberry32 } from '../src/core/rng';
import { GameTime } from '../src/core/time';
import { MISSIONS, readExpState } from '../src/sim/missions';
import { GEAR, GearId } from '../src/sim/gear';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { HellMap } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { IsleBattle } from '../src/sim/isleBattle';
import { isleOrigins } from '../src/build/zones';
import { saveSlot, loadSlot, readSlot, openSlot, asideSlot, clockOf, readClock, SaveData } from '../src/save/save';
import { helpOn, HELP_KEY } from '../src/ui/warTips';

/**
 * Les bugs de sauvegarde relevés en écrivant la doc (backlog, section M) : chacun a son test
 */

const store = new Map<string, string>();
const stubStorage = () => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
};

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

describe('équipement d’une expédition en route', () => {
  it('sauvegardé pendant le voyage, il revient en réserve au chargement', () => {
    const { w, ex } = village();
    for (const g of GEAR) w.exp.gear[g.id] = 3;
    const before = total(w.exp.gear);
    const a = ex.start(MISSIONS.find((m) => m.id === 'herd')!, 0)!;
    expect(a).toBeTruthy();
    // l'équipe emporte quelque chose
    expect(total(w.exp.gear)).toBeLessThan(before);
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(total(back.exp.gear)).toBe(before);
    for (const g of GEAR) expect(back.exp.gear[g.id], g.id).toBe(3);
    // rien n'est plus « en route » dans la partie rechargée
    expect(total(back.exp.away)).toBe(0);
    // la partie rechargée sait quelle équipe était en route, pour le dire au joueur
    expect(back.exp.out).toEqual(['herd']);
  });

  it('au retour de l’équipe, plus rien n’est compté en route', () => {
    const { w, agents, ex } = village();
    for (const g of GEAR) w.exp.gear[g.id] = 3;
    const a = ex.start(MISSIONS.find((m) => m.id === 'herd')!, 0)!;
    expect(total(w.exp.away)).toBeGreaterThan(0);
    for (let i = 0; i < 200000 && ex.active.includes(a); i++) {
      if (a.wait) ex.decide(a, a.wait.options.findIndex((_, i) => ex.canTake(a, i)));
      agents.update(0.05, 10, 0, false, 40, 0); ex.update(0.05);
    }
    expect(ex.active.includes(a)).toBe(false);
    expect(total(w.exp.away)).toBe(0);
    expect(w.exp.out).toEqual([]);
  });

  it('une ancienne sauvegarde, sans le champ, se lit encore', () => {
    const s = readExpState({ gear: { spear: 2 } });
    expect(s.gear.spear).toBe(2);
    expect(total(s.away)).toBe(0);
    expect(s.out).toEqual([]);
    expect(readExpState({ out: ['herd', 'inconnue', 3] }).out).toEqual(['herd']);
  });
});

describe('sauvegarde illisible', () => {
  beforeEach(stubStorage);

  it('n’est pas effacée : elle est mise de côté, avec la raison', () => {
    store.set('village-lowpoly:v1:slot:3', '{"v":1,"map":3,"world":');
    expect(loadSlot(3)).toBeNull();
    const r = readSlot(3);
    expect(r.save).toBeNull();
    expect(r.error).toBeTruthy();
    // la lecture seule (l'accueil) ne touche à rien
    expect(store.get('village-lowpoly:v1:slot:3')).toBe('{"v":1,"map":3,"world":');
    // au lancement de la partie : mise de côté, l'emplacement est libre pour la nouvelle
    const o = openSlot(3);
    expect(o.save).toBeNull();
    expect(o.error).toBeTruthy();
    expect(asideSlot(3)).toBe('{"v":1,"map":3,"world":');
    // la sauvegarde automatique de la partie neuve ne l'écrase pas
    saveSlot({ v: 1, map: 3, seed: 1, world: { n: 192, heights: [] }, age: 0, pop: 0, seasonT: 0, hour: 9, settings: {} as never, savedAt: 1 });
    expect(asideSlot(3)).toBe('{"v":1,"map":3,"world":');
  });

  it('refusée par la validation (ancienne carte), elle est mise de côté aussi', () => {
    store.set('village-lowpoly:v1:slot:3', JSON.stringify({ v: 1, map: 3, world: { n: 48, heights: [] } }));
    const o = openSlot(3);
    expect(o.save).toBeNull();
    expect(o.error).toMatch(/ancienne version/);
    expect(asideSlot(3)).toContain('"n":48');
  });

  it('pas de sauvegarde : ni erreur, ni rien de mis de côté', () => {
    expect(openSlot(3)).toEqual({ save: null, error: null });
    expect(asideSlot(3)).toBeNull();
  });

  it('une sauvegarde lisible se charge sans rien mettre de côté', () => {
    const d = { v: 1, map: 3, seed: 1, world: { n: 192, heights: [] }, age: 0, pop: 0, seasonT: 0, hour: 9, settings: {}, savedAt: 1 };
    store.set('village-lowpoly:v1:slot:3', JSON.stringify(d));
    expect(openSlot(3).save?.seed).toBe(1);
    expect(asideSlot(3)).toBeNull();
  });

  it('un navigateur qui refuse l’écriture : saveSlot le dit', () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(saveSlot({ v: 1, map: 3 } as SaveData)).toBe(false);
  });
});

describe('jours et pause', () => {
  it('sauvegardés, puis relus', () => {
    const t = new GameTime();
    t.days = 42; t.paused = true; t.hour = 14; t.seasonT = 2.5;
    const back = new GameTime();
    readClock(back, JSON.parse(JSON.stringify(clockOf(t))));
    expect(back.days).toBe(42);
    expect(back.paused).toBe(true);
    expect(back.hour).toBe(14);
    expect(back.seasonT).toBe(2.5);
  });

  it('une partie reprise commence toujours en pause, même sauvegardée en marche', () => {
    const t = new GameTime();
    t.paused = false; t.speed = 8;
    const back = new GameTime();
    readClock(back, JSON.parse(JSON.stringify(clockOf(t))));
    expect(back.paused).toBe(true);
  });

  it('une ancienne sauvegarde (sans les champs) : jour 0, en pause', () => {
    const back = new GameTime();
    readClock(back, { seasonT: 1, hour: 10 });
    expect(back.days).toBe(0);
    expect(back.paused).toBe(true);
    expect(back.hour).toBe(10);
  });
});

describe('clé ceionia.aides', () => {
  beforeEach(stubStorage);

  it('un seul défaut : absente, les aides sont éteintes, partout', () => {
    expect(helpOn()).toBe(false);
    store.set(HELP_KEY, '1');
    expect(helpOn()).toBe(true);
    store.set(HELP_KEY, '0');
    expect(helpOn()).toBe(false);
  });
});

describe('vague des Enfers au chargement', () => {
  it('la vague annoncée et la série de défaites survivent à la sauvegarde', () => {
    const h = new Hell(new HellMap(1));
    h.planned = h.planInvasion(2);
    h.lossStreak = 2;
    const back = Hell.load(new HellMap(1), JSON.parse(JSON.stringify(h.save())));
    expect(back.planned).toEqual(h.planned);
    expect(back.lossStreak).toBe(2);
  });

  it('une ancienne sauvegarde (sans les champs) : rien de prévu, aucune défaite', () => {
    const h = new Hell(new HellMap(1));
    const s = h.save() as unknown as Record<string, unknown>;
    delete s.planned; delete s.lossStreak;
    const back = Hell.load(new HellMap(1), s as never);
    expect(back.planned).toBeNull();
    expect(back.lossStreak).toBe(0);
  });

  it('un rempart posé seul sur l’île bloque la carte du combat', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const isle = new IsleBattle(w);
    isle.syncDefenses(1);
    const k = isleOrigins(w, 'wall').find((c) => w.canPlace('wall', c % N, Math.floor(c / N)) === null)!;
    expect(k).toBeDefined();
    const x = k % N, z = Math.floor(k / N), m = isle.map, cell = (z - m.oz) * m.W + (x - m.ox);
    expect(m.block[cell]).toBe(0);
    const b = w.place('wall', x, z, 0, false, 1, false)!;
    isle.syncDefenses(1);
    expect(m.block[cell]).toBe(1);
    // rasé : la case se libère
    w.removeBuilding(b.id);
    isle.syncDefenses(1);
    expect(m.block[cell]).toBe(0);
  });
});
