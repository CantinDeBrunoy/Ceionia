import { describe, it, expect } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim, GOLD_LABEL } from '../src/sim/sim';
import { AGES } from '../src/build/catalog';
import { RES_NAME } from '../src/sim/economy';
import type { ArchLayout } from '../src/world/archipelago';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import {
  BUY, SELL, SAT_MAX, SAT_RECOVER, SAT_STEP, TRADE_RES, buy, buyQuote, firstGoldAge, goldNeed, goldSince, newTradeState,
  readTradeState, recover, sell, sellQuote, sellRate,
} from '../src/sim/trade';
import { archipelagoOn } from '../src/world/expand';

/** Un monde plat de 192 cases ; avec `at`, l'archipel accepté à cet âge (des îles, faute de mieux) */
function flat(at: number | null = null) {
  setMapSize(192);
  const w = new World();
  w.heights.fill(1);
  if (at !== null) { w.isles = { main: { x: 0, z: 0, n: 192 }, rivals: [], small: [] } as unknown as ArchLayout; w.exploredAt = at; }
  return w;
}

describe('or : la ressource', () => {
  it('existe, sans producteur, et vaut zéro dans une partie neuve', () => {
    expect(RES_NAME.gold).toBe('or');
    const w = flat();
    expect(w.gold).toBe(0);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    expect(ex.daily().gold).toBe(0);
  });

  it('se sauvegarde et se relit ; une ancienne partie sans or en a zéro', () => {
    const w = flat();
    w.gold = 37.5;
    w.trade.sat.wood = 0.12;
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(r.gold).toBe(37.5);
    expect(r.trade.sat.wood).toBeCloseTo(0.12, 9);
    const { gold, trade, ...old } = w.toJSON() as Record<string, unknown>;
    expect(gold).toBe(37.5);
    expect(trade).toBeTruthy();
    const o = new World();
    o.gold = 5;
    o.fromJSON(old);
    expect(o.gold).toBe(0);
    expect(o.trade).toEqual(newTradeState());
  });

  it('une sauvegarde abîmée ne casse rien', () => {
    expect(readTradeState({ sat: { wood: 9, stone: -1, ore: 'x' } })).toEqual({ sat: { wood: SAT_MAX } });
    expect(readTradeState(null)).toEqual(newTradeState());
  });

  it('ne s’affiche (archipelagoOn) que si l’archipel est accepté', () => {
    expect(archipelagoOn(flat())).toBe(false);
    expect(archipelagoOn(flat(2))).toBe(true);
  });

  it('l’âge d’acceptation vient de world.exploredAt (absent : comme accepté dès le début)', () => {
    expect(goldSince(flat(3))).toBe(3);
    const w = flat(2);
    w.exploredAt = null;
    expect(goldSince(w)).toBe(0);
  });
});

describe('comptoir : les cours', () => {
  it('cours de départ : vendre pour 1 or, acheter avec 1 or ; l’aller-retour ne rapporte rien', () => {
    expect(SELL).toEqual({ wood: 10, stone: 10, ore: 3, brick: 4, fuel: 2 });
    expect(BUY).toEqual({ wood: 6, stone: 6, ore: 2, brick: 2, fuel: 1 });
    for (const r of TRADE_RES) expect(BUY[r], r).toBeLessThan(SELL[r]);
  });

  it('chaque vente baisse le cours de 1 %, jusqu’à −40 %', () => {
    expect(sellRate('wood', 0)).toBe(10);
    expect(sellRate('wood', 0.1)).toBeCloseTo(10 / 0.9, 9);
    expect(sellRate('wood', 0.9)).toBeCloseTo(10 / 0.6, 9);
    const q = sellQuote('wood', 0, 3);
    expect(q.cost).toBeCloseTo(10 + 10 / 0.99 + 10 / 0.98, 9);
    expect(q.sat).toBeCloseTo(3 * SAT_STEP, 9);
    expect(sellQuote('ore', 0.395, 10).sat).toBe(SAT_MAX);
  });

  it('le cours remonte de 5 % par jour', () => {
    const t = newTradeState();
    t.sat = { wood: 0.2, ore: 0.03 };
    recover(t, 1);
    expect(t.sat.wood).toBeCloseTo(0.2 - SAT_RECOVER, 9);
    expect(t.sat.ore).toBeUndefined();
    recover(t, 10);
    expect(t.sat).toEqual({});
  });

  it('le temps qui passe au village fait remonter les cours', () => {
    const w = flat(2);
    w.trade.sat.stone = 0.1;
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    for (let i = 0; i < 100; i++) ex.update(1);
    expect(w.trade.sat.stone).toBeCloseTo(0.05, 6);
  });

  it('vendre et acheter : les stocks bougent, rien sans de quoi payer', () => {
    const w = flat(2);
    w.wood = 25;
    expect(sell(w, 'wood', 1)).toBe(true);
    expect(w.gold).toBe(1);
    expect(w.wood).toBeCloseTo(15, 9);
    expect(w.trade.sat.wood).toBeCloseTo(0.01, 9);
    // 10,1 de bois pour le suivant : il en reste 15
    expect(sell(w, 'wood', 1)).toBe(true);
    expect(sell(w, 'wood', 1)).toBe(false);
    expect(w.gold).toBe(2);
    expect(buy(w, 'ore', 3)).toBe(false);
    expect(buy(w, 'ore', 2)).toBe(true);
    expect(w.ore).toBe(buyQuote('ore', 2));
    expect(w.gold).toBe(0);
  });
});

describe('passage d’âge : l’or', () => {
  it('barème : Industriel 20, Moderne 50, Futuriste 100 ; rien avant', () => {
    expect(AGES.map((a) => a.reqGold ?? 0)).toEqual([0, 0, 0, 20, 50, 100]);
  });

  it('ne compte qu’à partir de l’âge qui suit l’acceptation', () => {
    // accepté en entrant au Médiéval (ou avant) : dès l'Industriel
    expect(firstGoldAge(1)).toBe(3);
    expect(firstGoldAge(2)).toBe(3);
    expect(goldNeed(3, true, 2)).toBe(20);
    // accepté à l'âge industriel : rien pour le Moderne, de l'or pour le Futuriste
    expect(goldNeed(4, true, 3)).toBe(0);
    expect(goldNeed(5, true, 3)).toBe(100);
    // accepté au Moderne : rien du tout
    expect(goldNeed(5, true, 4)).toBe(0);
    // sans archipel, jamais
    for (let n = 1; n < AGES.length; n++) expect(goldNeed(n, false, 0)).toBe(0);
  });

  it('dans les conditions d’âge : seulement avec l’archipel, en réserve, et remplie en ressources illimitées', () => {
    const item = (sim: Sim) => sim.ageProgress()!.items.find((i) => i.label === GOLD_LABEL);
    const no = new Sim(flat());
    no.age = 2;
    expect(item(no)).toBeUndefined();

    const w = flat(2), sim = new Sim(w);
    sim.age = 2;
    expect(item(sim)).toMatchObject({ have: 0, need: 20 });
    w.gold = 12.7;
    expect(item(sim)!.have).toBe(12);
    sim.pop = 1000;
    expect(sim.ready).toBe(false);
    w.unlimited = true;
    expect(item(sim)!.have).toBe(20);

    // une partie qui accepte tard, à l'âge industriel : pas d'or pour le Moderne
    const late = flat(3), s2 = new Sim(late);
    s2.age = 3;
    expect(item(s2)).toBeUndefined();
    s2.age = 4;
    expect(item(s2)).toMatchObject({ need: 100 });
  });
});
