import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { KindId } from '../src/build/catalog';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { costOf, refundOf, Resource, YIELD, REFINE_CRUDE, FUEL_PER_CRUDE, CAR_FUEL } from '../src/sim/economy';
import { flowOf, ledgerOf, refundTotal, shortages, shortText } from '../src/sim/ledger';

/** Les chiffres de l'économie (Karim, testeur v6) : ce que produit chaque bâtiment, le solde par ressource, le goulot */

function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

function spot(w: World, kind: KindId, x0 = 10, z0 = 10): [number, number] {
  for (let z = z0; z < N - 10; z++) for (let x = x0; x < N - 10; x++) if (w.canPlace(kind, x, z) === null) return [x, z];
  throw new Error(`pas de place pour ${kind}`);
}

const put = (w: World, kind: KindId, age: number) => { const [x, z] = spot(w, kind); return w.place(kind, x, z, 0, true, age, false)!; };

describe('ce que fait un bâtiment par jour', () => {
  it('le bûcheron et la carrière : leur rendement de l’âge', () => {
    expect(flowOf('lumber', 0)).toEqual({ wood: YIELD.lumber!.wood![0] });
    expect(flowOf('quarry', 2)).toEqual({ stone: YIELD.quarry!.stone![2] });
    expect(flowOf('mine', 3)).toEqual({ ore: YIELD.mine!.ore![3], stone: YIELD.mine!.stone![3] });
    // une gare de marchandises voisine : ×1,75
    expect(flowOf('lumber', 1, 1.75).wood).toBeCloseTo(YIELD.lumber!.wood![1] * 1.75);
  });

  it('la raffinerie prend du brut et donne du carburant ; l’usine automobile brûle son carburant (rien en illimité)', () => {
    expect(flowOf('refinery', 4)).toEqual({ crude: -REFINE_CRUDE, fuel: REFINE_CRUDE * FUEL_PER_CRUDE });
    expect(flowOf('carworks', 4)).toEqual({ fuel: -CAR_FUEL });
    expect(flowOf('carworks', 4, 1, true)).toEqual({});
    // une maison ne produit rien
    expect(flowOf('house', 2)).toEqual({});
  });
});

describe('le livre d’une ressource', () => {
  it('le solde de chaque ressource est celui que verse le jeu (Expeditions.daily)', () => {
    const w = continent();
    w.difficulty = 'normal';
    put(w, 'lumber', 4); put(w, 'lumber', 4); put(w, 'quarry', 4); put(w, 'brickworks', 4);
    put(w, 'oilwell', 4); put(w, 'refinery', 4); put(w, 'carworks', 4);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5), day = ex.daily();
    for (const r of ['wood', 'stone', 'ore', 'brick', 'crude', 'fuel'] as Resource[]) expect(ledgerOf(w, r).net, r).toBeCloseTo(day[r]);
    // le bois : une ligne pour les deux bûcherons, rien de consommé
    const wood = ledgerOf(w, 'wood');
    expect(wood.prod).toEqual([{ kind: 'lumber', n: 2, v: 2 * YIELD.lumber!.wood![4] }]);
    expect(wood.use).toEqual([]);
    // le carburant : la raffinerie en donne, les voitures en brûlent
    const fuel = ledgerOf(w, 'fuel');
    expect(fuel.prod.map((x) => x.kind)).toEqual(['refinery']);
    expect(fuel.use).toEqual([{ kind: 'carworks', n: 1, v: -CAR_FUEL }]);
    // avec du brut en réserve, la raffinerie tourne à pleine capacité
    w.crude = 50;
    expect(ledgerOf(w, 'crude').use).toEqual([{ kind: 'refinery', n: 1, v: -REFINE_CRUDE }]);
    expect(ledgerOf(w, 'crude').net).toBeCloseTo(ex.daily().crude);
  });
});

describe('le goulot de l’âge suivant', () => {
  it('le bois manque quand il faudra des jours pour payer les bâtiments qui restent ; on dit ce que coûte un bûcheron de plus', () => {
    const w = continent();
    w.difficulty = 'normal';
    put(w, 'lumber', 0);
    w.wood = 2; w.stone = 40;
    const items = [{ label: 'Hutte', kind: 'house' as KindId, have: 0, need: 6 }];
    const need = 6 * costOf('house', 0, 'normal', 1)!.wood;
    const [s] = shortages(w, 0, items);
    expect(s.res).toBe('wood');
    expect(s.short).toBe(need - 2);
    expect(s.days).toBeCloseTo((need - 2) / YIELD.lumber!.wood![0]);
    // le deuxième bûcheron se paie (le premier était offert) : en pierre seulement
    const c = costOf('lumber', 0, 'normal', 1)!;
    expect(c.wood).toBe(0);
    expect(shortText(w, 0, s)).toContain(`${c.stone} pierre`);
    expect(shortText(w, 0, s, true)).toContain(`${need - 2}`);
    // assez de bois en réserve : pas de goulot ; au bac à sable (ressources illimitées) non plus
    w.wood = need;
    expect(shortages(w, 0, items)).toEqual([]);
    w.wood = 0; w.difficulty = 'sandbox';
    expect(shortages(w, 0, items)).toEqual([]);
  });

  it('rien ne produit la pierre : elle manque, quel que soit le délai', () => {
    const w = continent();
    w.difficulty = 'normal';
    w.wood = 500; w.stone = 0;
    const [s] = shortages(w, 1, [{ label: 'x', kind: 'house', have: 0, need: 1 }]);
    expect(s.res).toBe('stone');
    expect(s.days).toBe(Infinity);
    expect(shortText(w, 1, s, true)).toContain('rien n’en produit');
  });
});

describe('démolir', () => {
  it('le remboursement annoncé avant le clic est celui que rend la démolition', () => {
    const w = continent();
    w.difficulty = 'normal';
    const a = put(w, 'house', 1), b = put(w, 'house', 1);
    const one = refundOf(w, a)!;
    expect(one.wood).toBeGreaterThan(0);
    expect(refundTotal(w, [a, b])).toEqual({ wood: one.wood * 2, stone: one.stone * 2 });
    w.difficulty = 'sandbox';
    expect(refundTotal(w, [a, b])).toBeNull();
  });
});
