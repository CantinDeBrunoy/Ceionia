import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { AGES, KINDS, KIND_ORDER, KIND_LABEL, KindId } from '../src/build/catalog';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { costOf, priceIn, canPay, pay, costLabel, shortLabel, YIELD, RES_NAME, BRICK_PRICE } from '../src/sim/economy';
import { getModel } from '../src/render/models';
import { KIND_ICON } from '../src/ui/icons';

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

describe('briqueterie', () => {
  it('c’est un bâtiment de 2 × 2 du rayon Production, dès l’âge industriel, avec son nom, son icône et son modèle', () => {
    const d = KINDS.brickworks;
    expect(d).toMatchObject({ size: 2, minAge: 3, cat: 'prod' });
    expect(d.names.length).toBe(AGES.length);
    expect(d.names[3]).toBe('Briqueterie');
    expect(KIND_ORDER).toContain('brickworks');
    expect(KIND_LABEL.brickworks).toBeTruthy();
    expect(KIND_ICON.brickworks).toBeTruthy();
    expect(RES_NAME.brick).toBe('briques');
    // un modèle dessiné à chaque âge (le dernier reprend celui de l'époque moderne), avec la fumée de sa cheminée
    for (const age of [3, 4, 5]) {
      const m = getModel('brickworks', age, { v: 0, L: false, R: false, F: false });
      expect(m.body.attributes.position.count, `âge ${age}`).toBeGreaterThan(500);
      expect(m.glow, `âge ${age}`).toBeTruthy();
      expect(m.smoke.length, `âge ${age}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('elle cuit des briques à partir de rien, en continu, et plus vite aux âges suivants', () => {
    expect(YIELD.brickworks!.brick).toEqual([0, 0, 0, 8, 12, 16]);
    const w = continent();
    const [x, z] = spot(w, 'brickworks');
    const b = w.place('brickworks', x, z, 0, true, 3, false)!;
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    expect(w.brick).toBe(0);
    expect(ex.daily().brick).toBe(8);
    // versées au fil des heures, pas d'un coup chaque jour
    for (let t = 0; t < 25; t++) ex.update(1);
    expect(w.brick).toBeGreaterThan(1.5);
    expect(w.brick).toBeLessThan(2.5);
    for (let t = 0; t < 75; t++) ex.update(1);
    expect(w.brick).toBeGreaterThan(7.5);
    expect(w.brick).toBeLessThan(8.5);
    // à l'époque moderne : douze par jour ; sans briqueterie, plus rien
    b.age = 4;
    expect(ex.daily().brick).toBe(12);
    w.removeBuilding(b.id);
    expect(ex.daily().brick).toBe(0);
  });
});

describe('prix en briques', () => {
  it('quelques grands bâtiments industriels en demandent, en plus du bois et de la pierre', () => {
    for (const k of Object.keys(BRICK_PRICE) as KindId[]) {
      expect(KINDS[k].size, k).toBeGreaterThanOrEqual(2);
      expect(KINDS[k].minAge, k).toBeGreaterThanOrEqual(3);
      const c = costOf(k, 4)!;
      expect(c.brick, k).toBe(BRICK_PRICE[k]);
      expect(c.wood, k).toBeGreaterThan(0);
      expect(c.stone, k).toBeGreaterThan(0);
    }
    expect(costOf('refinery', 4)!.brick).toBe(30);
    // la briqueterie elle-même, les petits bâtiments et les autres grands n'en demandent pas
    expect(costOf('brickworks', 3)!.brick).toBeUndefined();
    expect(costOf('quarry', 3)).toBeNull();
    expect(costOf('mill', 3)!.brick).toBeUndefined();
    // en défi, tout se paie, les briques plus cher de moitié
    expect(costOf('refinery', 4, 'challenge', 1)!.brick).toBe(45);
    expect(costOf('house', 3, 'challenge', 1)!.brick).toBeUndefined();
  });

  it('on ne bâtit que si l’on a les briques ; elles se dépensent, et le prix se dit', () => {
    const w = continent();
    w.wood = 500; w.stone = 500; w.brick = 0;
    const c = priceIn(w, 'station', 3)!;
    expect(c.brick).toBe(10);
    expect(canPay(w, c)).toBe(false);
    expect(shortLabel(w, c)).toBe('Il faut ' + costLabel(c) + ` (vous avez 500 bois, 500 pierre et 0 brique)`);
    expect(costLabel(c)).toMatch(/ et 10 briques$/);
    w.brick = 12;
    expect(canPay(w, c)).toBe(true);
    pay(w, c);
    expect(w.brick).toBe(2);
    expect(w.wood).toBe(500 - c.wood);
    // sans briques dans le prix, le message d'avant ne change pas
    const m = priceIn(w, 'mill', 3)!;
    w.wood = 0;
    expect(shortLabel(w, m)).toBe(`Il faut ${m.wood} bois et ${m.stone} pierre (vous avez 0 bois et ${Math.floor(w.stone)} pierre)`);
    // en ressources illimitées, rien à payer
    w.unlimited = true;
    expect(priceIn(w, 'refinery', 4)).toBeNull();
  });
});

describe('passage d’âge : les briques', () => {
  it('l’époque moderne et l’âge futuriste en réclament ; pas l’industriel ni avant', () => {
    expect(AGES[1].reqBrick).toBeUndefined();
    expect(AGES[3].reqBrick).toBeUndefined();
    expect(AGES[4].reqBrick).toBe(40);
    expect(AGES[5].reqBrick).toBe(80);
  });

  it('la condition « briques » suit la réserve, ne compte pas en ressources illimitées et ne s’invente pas avant l’âge', () => {
    const w = continent();
    const sim = new Sim(w);
    sim.age = 2;
    expect(sim.ageProgress()!.items.some((i) => i.label.startsWith('briques'))).toBe(false);
    sim.age = 3;
    const item = () => sim.ageProgress()!.items.find((i) => i.label.startsWith('briques'))!;
    expect(item()).toMatchObject({ label: 'briques (briqueterie)', have: 0, need: 40 });
    expect(item().kind).toBeUndefined();
    w.brick = 25.9;
    expect(item().have).toBe(25);
    w.brick = 40;
    expect(item().have).toBeGreaterThanOrEqual(item().need);
    // la condition est un des éléments du passage : sans elle, on ne passe pas
    const others = sim.ageProgress()!.items.filter((i) => !i.label.startsWith('briques'));
    expect(others.some((i) => i.have < i.need)).toBe(true);
    w.brick = 0;
    sim.pop = 1000;
    expect(sim.ready).toBe(false);
    w.unlimited = true;
    expect(item().have).toBe(40);
    // une partie déjà plus avancée n'a pas à les refaire : seul l'âge suivant compte
    sim.age = 5;
    expect(sim.ageProgress()).toBeNull();
  });

  it('le conseil du moment prévient quand il manque de briques et qu’aucune briqueterie n’existe', () => {
    const w = continent();
    const sim = new Sim(w);
    sim.age = 3;
    w.brick = 4;
    // tout le reste est réuni : seules manquent les briques
    sim.ageProgress = () => ({ next: 4, ratio: 0.9, items: [{ label: 'briques (briqueterie)', have: 4, need: 40 }] });
    const say = () => { sim.pop = AGES[4].reqPop; return (sim as unknown as { computeMessage(): string }).computeMessage(); };
    // décors minimaux : de quoi loger, nourrir, abreuver, employer, divertir et soigner
    for (const k of ['house', 'house', 'house', 'house', 'farm', 'farm', 'well', 'workshop', 'workshop', 'gather', 'health'] as KindId[]) w.place(k, ...spot(w, k, 60, 60), 0, true, 3, false);
    sim.recalc();
    sim.pop = AGES[4].reqPop;
    expect(say()).toBe('Pour l’âge suivant : il faut 40 briques : « Briqueterie » (Bâtir › Production).');
    expect(sim.messageKind).toBe('brickworks');
    // un bâtiment conseillé qui coûte des briques : on dit d'abord où en avoir, comme pour la pierre et la carrière
    w.wood = 900; w.stone = 900; w.brick = 0;
    sim.ageProgress = () => ({ next: 4, ratio: 0.9, items: [{ label: 'Petite gare', have: 0, need: 1, kind: 'station' }] });
    expect(say()).toMatch(/^Il manque des briques pour « Petite gare » : « Briqueterie » \(Bâtir › Production\)/);
    expect(sim.messageKind).toBe('brickworks');
    // avec une briqueterie, on dit combien il en faut encore, et la gare redevient le conseil
    w.place('brickworks', ...spot(w, 'brickworks', 90, 90), 0, true, 3, false);
    sim.recalc();
    expect(say()).toMatch(/^Pour l’âge suivant : il manque « Petite gare »/);
    expect(sim.messageKind).toBe('station');
    sim.ageProgress = () => ({ next: 4, ratio: 0.9, items: [{ label: 'briques (briqueterie)', have: 4, need: 40 }] });
    expect(say()).toBe('Pour l’âge suivant : il faut encore 36 briques (la briqueterie en cuit chaque jour).');
  });
});

describe('sauvegarde des briques', () => {
  it('le stock se sauvegarde et se relit ; une ancienne sauvegarde n’en a pas : zéro, et rien ne casse', () => {
    const w = continent();
    w.brick = 33.5;
    const saved = JSON.parse(JSON.stringify(w.toJSON()));
    expect(saved.brick).toBe(33.5);
    const r = new World();
    r.fromJSON(saved);
    expect(r.brick).toBe(33.5);
    // sans le champ (partie d'avant les briques), au-delà de l'âge industriel comme avant
    const { brick, ...old } = saved;
    void brick;
    const o = new World();
    o.fromJSON(old);
    expect(o.brick).toBe(0);
    const sim = new Sim(o);
    sim.age = 4;
    sim.recalc();
    // la partie déjà passée à l'époque moderne ne réclame pas de briques pour ce qu'elle a déjà franchi
    expect(sim.ageProgress()!.items.find((i) => i.label.startsWith('briques'))).toMatchObject({ have: 0, need: 80 });
    expect(sim.age).toBe(4);
    // une valeur absurde est ramenée à zéro
    const bad = new World();
    bad.fromJSON({ ...old, brick: -5 });
    expect(bad.brick).toBe(0);
  });
});
