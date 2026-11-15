import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { ARCH_N } from '../src/world/archipelago';
import { Sim } from '../src/sim/sim';
import { KINDS, KIND_ORDER, KIND_LABEL, AGES } from '../src/build/catalog';
import { KIND_ICON } from '../src/ui/icons';
import { getModel } from '../src/render/models';
import { onRival, isleOf } from '../src/sim/diplomacy';
import { autoRoad } from '../src/build/autoroads';
import { facingRoadRot } from '../src/build/placement';
import { allyIsle, allyLand, allyPostReady, allyView, inAllyTown, onAllyIsle } from '../src/sim/allyLand';
import { readTradeState, saveTradeState, tradeOpen, TRADE_V } from '../src/sim/trade';

let cached: World | null = null;
/** L'archipel de la graine 11 (carte de 384), sans allié */
function archipel() {
  if (!cached) {
    setMapSize(ARCH_N);
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN_ARCH);
    w.updateVis();
    cached = w;
  }
  cached.diplo.ally = null;
  cached.diplo.met = ['orient', 'asie'];
  return cached;
}

/** Les cases d'une île rivale, terre ferme */
function cellsOf(w: World, people: 'orient' | 'asie') {
  const isle = isleOf(w, people)!, out: [number, number][] = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (onRival(isle, x + 0.5, z + 0.5) && w.cellMin(x, z) > 0.3) out.push([x, z]);
  return out;
}

/** Première place où ce bâtiment se pose sur l'île de l'allié */
function spotOnAlly(w: World, kind: 'tradepost' | 'harbor' | 'house') {
  const isle = allyIsle(w)!;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (onRival(isle, x + 0.5, z + 0.5) && w.canPlace(kind, x, z) === null) return [x, z] as const;
  return null;
}

describe('bâtir chez l’allié', () => {
  it('sans allié, les îles rivales sont interdites ; on le dit', () => {
    const w = archipel(), [x, z] = cellsOf(w, 'orient')[0];
    expect(w.playable(x, z)).toBe(false);
    expect(w.playWhy(x, z)).toMatch(/Choisissez d’abord votre allié/);
    expect(w.canRoad(x, z)).toBe(false);
  });

  it('avec un allié : son île se bâtit hors de sa ville, l’autre île reste interdite', () => {
    const w = archipel();
    w.diplo.ally = 'orient';
    const land = cellsOf(w, 'orient'), out = land.filter(([x, z]) => !inAllyTown(w, x, z)), town = land.filter(([x, z]) => inAllyTown(w, x, z));
    expect(out.length).toBeGreaterThan(500);
    expect(town.length).toBeGreaterThan(200);
    for (const [x, z] of out.slice(0, 50)) expect(w.playable(x, z), `${x},${z}`).toBe(true);
    for (const [x, z] of town.slice(0, 50)) { expect(w.playable(x, z)).toBe(false); expect(w.playWhy(x, z)).toMatch(/ville de vos alliés/); }
    // l'autre peuple
    for (const [x, z] of cellsOf(w, 'asie').slice(0, 50)) { expect(w.playable(x, z)).toBe(false); expect(w.playWhy(x, z)).toMatch(/Hors de votre île/); }
    // la ville entière : remparts, palais, temple, marché sont dans la zone interdite
    const v = isleOf(w, 'orient')!.village;
    expect(inAllyTown(w, Math.floor(v.x), Math.floor(v.z))).toBe(true);
    // routes : chez l'allié oui, dans sa ville non
    const [ox, oz] = out.find(([x, z]) => w.canRoad(x, z)) ?? out[0];
    expect(w.canRoad(ox, oz)).toBe(true);
    const [tx, tz] = town[0];
    expect(w.canRoad(tx, tz)).toBe(false);
    expect(allyLand(w, ox, oz)).toBe(true);
    // la vue de l'île : sur l'île, hors de la ville
    const view = allyView(w)!;
    expect(onRival(isleOf(w, 'orient')!, view.x, view.z)).toBe(true);
  });

  it('une maison et un port se posent chez l’allié', () => {
    const w = archipel();
    w.diplo.ally = 'asie';
    const h = spotOnAlly(w, 'house');
    expect(h).not.toBeNull();
    const p = spotOnAlly(w, 'harbor');
    expect(p).not.toBeNull();
    expect(onAllyIsle(w, p![0], p![1], 3)).toBe(true);
  });
});

describe('le comptoir', () => {
  it('un bâtiment du catalogue, au Médiéval, avec son nom, son icône et son modèle', () => {
    const d = KINDS.tradepost;
    expect(d).toMatchObject({ size: 2, minAge: 2, cat: 'prod' });
    expect(d.names.length).toBe(AGES.length);
    expect(d.names[2]).toBe('Comptoir');
    expect(KIND_ORDER).toContain('tradepost');
    expect(KIND_LABEL.tradepost).toBeTruthy();
    expect(KIND_ICON.tradepost).toBeTruthy();
    for (const age of [2, 3, 4, 5]) expect(getModel('tradepost', age, { v: 0, L: false, R: false, F: false }).body.attributes.position.count, `âge ${age}`).toBeGreaterThan(500);
  });

  it('ne se pose que sur l’île de l’allié', () => {
    const w = archipel();
    expect(w.canPlace('tradepost', 0, 0)).toBeTruthy();
    w.diplo.ally = 'orient';
    // sur l'île principale : refusé
    const f = w.isles!.main;
    let main: string | null = null;
    for (let z = f.z + 20; z < f.z + f.n - 20 && !main; z += 3) for (let x = f.x + 20; x < f.x + f.n - 20; x += 3) if (w.canPlace('house', x, z) === null) { main = w.canPlace('tradepost', x, z); break; }
    expect(main).toMatch(/île de votre allié/);
    const s = spotOnAlly(w, 'tradepost');
    expect(s).not.toBeNull();
  });
});

describe('l’installation chez l’allié (pour la diplomatie)', () => {
  it('allyPostReady : un allié, un port sur son île et un comptoir', () => {
    setMapSize(ARCH_N);
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN_ARCH);
    expect(allyPostReady(w)).toBe(false);
    w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'orient';
    expect(allyPostReady(w)).toBe(false);
    // un port chez soi ne compte pas
    const f = w.isles!.main;
    let home: [number, number] | null = null;
    for (let z = f.z; z < f.z + f.n && !home; z++) for (let x = f.x; x < f.x + f.n && !home; x++) if (w.canPlace('harbor', x, z) === null) home = [x, z];
    w.place('harbor', home![0], home![1], 0, true, 2, false);
    const h = spotOnAlly(w, 'harbor')!;
    w.place('harbor', h[0], h[1], 0, true, 2, false);
    expect(allyPostReady(w)).toBe(false);
    const p = spotOnAlly(w, 'tradepost')!;
    w.place('tradepost', p[0], p[1], 0, true, 2, false);
    expect(allyPostReady(w)).toBe(true);
    // sans le port de l'île alliée : plus prêt
    for (const b of [...w.buildings.values()]) if (b.kind === 'harbor' && onAllyIsle(w, b.x, b.z, 3)) w.removeBuilding(b.id);
    expect(allyPostReady(w)).toBe(false);
    cached = null;
  });
});

describe('routes automatiques chez l’allié', () => {
  it('le comptoir posé près du port de l’île alliée s’y relie, même avec des routes au village', () => {
    const w = archipel();
    w.diplo.ally = 'orient';
    // le village a déjà son réseau, de l'autre côté de la mer
    const [sx, sz] = w.startSpot();
    for (let i = 2; i < 8; i++) if (w.canRoad(sx + i, sz + 4)) w.setRoad(sx + i, sz + 4, true);
    expect(w.road.some((v, k) => v === 1 && w.inMain(k % N, Math.floor(k / N)))).toBe(true);
    const [hx, hz] = spotOnAlly(w, 'harbor')!;
    const port = w.place('harbor', hx, hz, facingRoadRot(w, 'harbor', hx, hz, 0), true, 2, false)!;
    autoRoad(w, port);
    // le comptoir, à quelques cases du port
    let post = null as ReturnType<World['place']> | null;
    for (let r = 4; r < 14 && !post; r++) for (let dz = -r; dz <= r && !post; dz++) for (let dx = -r; dx <= r && !post; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dz)) === r && w.canPlace('tradepost', hx + 1 + dx, hz + 1 + dz) === null) post = w.place('tradepost', hx + 1 + dx, hz + 1 + dz, facingRoadRot(w, 'tradepost', hx + 1 + dx, hz + 1 + dz, 0), true, 2, false);
    expect(post).toBeTruthy();
    const laid = autoRoad(w, post!);
    expect(laid).toBeGreaterThan(0);
    // les routes posées sont toutes sur l'île de l'allié
    let ally = 0;
    for (let k = 0; k < w.road.length; k++) if (w.road[k] && allyLand(w, k % N, Math.floor(k / N))) ally++;
    expect(ally).toBeGreaterThanOrEqual(laid);
    for (const b of [post!, port]) w.removeBuilding(b.id);
    w.road.fill(0);
  });
});

describe('l’échange passe par le comptoir', () => {
  it('sans archipel, jamais ; avec, il faut un comptoir', () => {
    const t = { trade: { sat: {} } };
    expect(tradeOpen(t, false, 3)).toBe(false);
    expect(tradeOpen(t, true, 0)).toBe(false);
    expect(tradeOpen(t, true, 1)).toBe(true);
  });

  it('une ancienne partie à l’archipel échange sans comptoir, jusqu’à son premier comptoir', () => {
    // écrite avant le comptoir bâti : pas de version
    expect(readTradeState({ sat: { wood: 0.1 } }, true).legacy).toBe(true);
    expect(readTradeState(undefined, true).legacy).toBe(true);
    // une partie sans archipel, ou écrite depuis : rien
    expect(readTradeState(undefined, false).legacy).toBeUndefined();
    expect(readTradeState({ v: TRADE_V, sat: {} }, true).legacy).toBeUndefined();
    // le drapeau se garde d'une sauvegarde à l'autre
    expect(readTradeState(JSON.parse(JSON.stringify(saveTradeState({ sat: {}, legacy: true }))), true).legacy).toBe(true);
    expect(tradeOpen({ trade: { sat: {}, legacy: true } }, true, 0)).toBe(true);
  });

  it('au chargement : l’archipel sans version devient ancien ; le premier comptoir prend le relais', () => {
    const w = archipel();
    w.diplo.ally = 'orient';
    w.trade = { sat: {} };
    const json = JSON.parse(JSON.stringify(w.toJSON()));
    expect(json.trade.v).toBe(TRADE_V);
    const r = new World();
    r.fromJSON(json);
    expect(r.trade.legacy).toBeUndefined();
    delete json.trade;
    const old = new World();
    old.fromJSON(json);
    expect(old.trade.legacy).toBe(true);
    const sim = new Sim(old);
    sim.update(0, 0);
    expect(sim.tradeOpen).toBe(true);
    // le premier comptoir bâti : l'échange passe par lui
    const s = spotOnAlly(old, 'tradepost')!;
    old.place('tradepost', s[0], s[1], 0, true, 2, false);
    sim.recalc();
    sim.update(0, 0);
    expect(old.trade.legacy).toBe(false);
    expect(sim.tradeOpen).toBe(true);
  });
});
