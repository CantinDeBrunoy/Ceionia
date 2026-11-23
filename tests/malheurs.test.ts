import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { KindId } from '../src/build/catalog';
import { Fires } from '../src/render/fires';
import { Emergencies } from '../src/render/emergency';
import { sickToll, theftToll, applyTheft, applySick, ailing, sickNews, theftNews, DEATH_CHANCE, DEATH_MIN_POP, UNAIDED_WAIT } from '../src/sim/mishaps';

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Première place où poser ce bâtiment, en partant du coin (x0, z0) */
function spot(w: World, kind: KindId, x0 = 10, z0 = 10): [number, number] {
  for (let z = z0; z < N - 10; z++) for (let x = x0; x < N - 10; x++) if (w.canPlace(kind, x, z) === null) return [x, z];
  throw new Error(`pas de place pour ${kind}`);
}

describe('malaises et cambriolages sans secours', () => {
  it('un malade sans soins : en Facile, un peu de santé en moins une journée, jamais de décès ; au bac à sable, rien', () => {
    const w = continent();
    w.difficulty = 'easy';
    for (const r of [0, 0.1, 0.5, 0.99]) expect(sickToll(w, () => r)).toEqual({ n: 2, days: 1, dies: false });
    w.difficulty = 'sandbox';
    expect(sickToll(w, () => 0)).toEqual({ n: 0, days: 0, dies: false });
  });

  it('en Normal, plus de santé en moins, deux jours, et une chance sur quatre que le malade ne s’en remette pas', () => {
    const w = continent();
    w.difficulty = 'normal';
    expect(sickToll(w, () => DEATH_CHANCE - 0.01)).toEqual({ n: 3, days: 2, dies: true });
    expect(sickToll(w, () => DEATH_CHANCE + 0.01)).toEqual({ n: 3, days: 2, dies: false });
  });

  it('la santé du village baisse le temps de la maladie, puis revient ; la fiche le dit ; la sauvegarde le garde', () => {
    const w = continent();
    w.difficulty = 'normal';
    const [x, z] = spot(w, 'health', 30, 30);
    w.place('health', x, z, 0, true, 3, false);
    const sim = new Sim(w);
    sim.age = 3;
    sim.recalc();
    sim.update(0.1);
    const full = sim.health.cap;
    expect(full).toBeGreaterThan(3);
    applySick(w, { n: 3, days: 2, dies: false }, 100);
    expect(ailing(w)).toBe(3);
    sim.update(0.1);
    expect(sim.health.cap).toBe(full - 3);
    expect(sim.needDetail('health').rows.some((r) => r.v === -3)).toBe(true);
    // relu d'une sauvegarde
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(ailing(back)).toBe(3);
    // deux jours plus tard, le malade est remis
    for (let i = 0; i < 210; i++) sim.update(1);
    expect(ailing(w)).toBe(0);
    expect(w.ills).toEqual([]);
    expect(sim.health.cap).toBe(full);
    // une ancienne sauvegarde n'a pas de malades
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    delete old.ills;
    const legacy = new World();
    legacy.fromJSON(old);
    expect(legacy.ills).toEqual([]);
  });

  it('un décès ne vide pas un petit village : sous DEATH_MIN_POP habitants, personne ne meurt', () => {
    const w = continent();
    const sim = new Sim(w);
    sim.pop = DEATH_MIN_POP - 1;
    expect(sim.loseOne(DEATH_MIN_POP)).toBe(false);
    expect(sim.pop).toBe(DEATH_MIN_POP - 1);
    sim.pop = 40;
    expect(sim.loseOne(DEATH_MIN_POP)).toBe(true);
    expect(sim.pop).toBe(39);
  });

  it('un cambriolage sans police : un petit larcin en Facile, un peu plus en Normal (l’or aussi), rien en ressources illimitées', () => {
    const w = continent();
    w.difficulty = 'easy';
    w.wood = 300; w.stone = 120; w.gold = 50;
    expect(theftToll(w)).toEqual({ wood: 6, stone: 2, gold: 0 });
    // un gros stock : le plafond
    w.wood = 5000;
    expect(theftToll(w).wood).toBe(10);
    // presque rien : une unité, jamais plus qu'on n'a
    w.wood = 3; w.stone = 0;
    expect(theftToll(w)).toEqual({ wood: 1, stone: 0, gold: 0 });
    w.difficulty = 'normal';
    w.wood = 300; w.stone = 120; w.gold = 50;
    const loot = theftToll(w);
    expect(loot).toEqual({ wood: 15, stone: 6, gold: 2 });
    applyTheft(w, loot);
    expect([w.wood, w.stone, w.gold]).toEqual([285, 114, 48]);
    w.difficulty = 'sandbox';
    expect(theftToll(w)).toEqual({ wood: 0, stone: 0, gold: 0 });
  });

  it('les messages disent ce que ça a coûté, et ce qui l’aurait évité', () => {
    expect(sickNews({ n: 2, days: 1, dies: false }, false)).toMatch(/une journée.*santé −2.*hôpital/);
    expect(sickNews({ n: 3, days: 2, dies: true }, true)).toMatch(/pas survécu.*hôpital/);
    expect(theftNews({ wood: 6, stone: 2, gold: 0 })).toMatch(/6 bois et 2 pierre.*police/);
    expect(theftNews({ wood: 0, stone: 0, gold: 0 })).toMatch(/mains vides/);
    // le joueur a le temps de bâtir un poste à portée
    expect(UNAIDED_WAIT).toBeGreaterThanOrEqual(20);
  });

  it('loin de tout poste, la carte de l’incident attend ; un poste bâti à temps arrive, sinon les conséquences tombent', () => {
    const w = continent();
    w.difficulty = 'easy';
    const [hx, hz] = spot(w, 'house', 60, 60);
    const house = w.place('house', hx, hz, 0, true, 3, false);
    const em = new Emergencies(w, new Fires(w), new Set());
    const hit: string[] = [];
    em.onUnaided = (sv, b) => hit.push(`${sv}:${b.id}`);
    // le malaise tombe (premier appel à 140 s) : personne à portée, une carte sans secours
    for (let i = 0; i < 145; i++) em.update(1, 3);
    const lone = () => em.incidents().filter((i) => i.key.startsWith('lone:'));
    expect(lone().map((i) => i.key)).toEqual([`lone:health:${house.id}`]);
    expect(em.news.some((m) => m.includes('aucun hôpital'))).toBe(true);
    // un hôpital bâti à portée avant la fin : le malade est sauvé, pas de conséquence
    const [sx, sz] = spot(w, 'health', hx - 4, hz - 4);
    w.place('health', sx, sz, 0, true, 3, false);
    em.update(1, 3);
    expect(lone()).toEqual([]);
    // le cambriolage (premier appel à 220 s), sans police : au bout de l'attente, les conséquences tombent
    for (let i = 0; i < 80 + UNAIDED_WAIT; i++) em.update(1, 3);
    expect(hit).toEqual([`police:${house.id}`]);
    expect(lone()).toEqual([]);
  });
});
