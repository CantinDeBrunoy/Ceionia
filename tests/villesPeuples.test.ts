import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { ARCH_N } from '../src/world/archipelago';
import { townPlans, lotsAt, inPoly, segDist, HOUSE_SHARE, OUTSIDE, type TownKind, type TownPlan } from '../src/world/rivalTown';
import { townModel, townWall, triCount } from '../src/render/townModels';

const SEEDS = [11, 4242, 7];
/** Budgets de triangles des modèles du peuple asiatique (`models/asian.ts`), quand ils diffèrent des autres */
const ASIE_CAP: Partial<Record<TownKind, number>> = { temple: 11500, palace: 11500, house: 1700, teahouse: 3000, gate: 3000, tower: 1300, paifang: 1400 };
const worlds = new Map<number, World>();
function archipel(seed: number) {
  if (!worlds.has(seed)) {
    setMapSize(ARCH_N);
    const w = new World();
    w.seed = seed;
    newWorld(w, CONTINENT, seed, GEN_ARCH);
    worlds.set(seed, w);
  }
  return worlds.get(seed)!;
}
const water = (w: World, x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); return !w.inCells(ix, iz) || w.isWaterCell(ix, iz); };
/** De l'eau à `r` cases au plus de (x, z) ? */
const waterNear = (w: World, x: number, z: number, r: number) => {
  for (let dz = -r; dz <= r; dz += 0.5) for (let dx = -r; dx <= r; dx += 0.5) if (Math.hypot(dx, dz) <= r && water(w, x + dx, z + dz)) return true;
  return false;
};
const near = (p: TownPlan, x: number, z: number) => p.wall.some((a, i) => segDist(x, z, a, p.wall[(i + 1) % p.wall.length]) < 1.6);

describe('villes des peuples rivaux (archipel)', () => {
  afterAll(() => setMapSize(192));

  it('une ville par île rivale, au replat du village, tirée de la graine', () => {
    for (const seed of SEEDS) {
      const w = archipel(seed), plans = townPlans(w);
      expect(plans.map((p) => p.people).sort()).toEqual(['asie', 'orient']);
      plans.forEach((p, i) => {
        const v = w.isles!.rivals[i].village;
        expect(p.x).toBe(v.x); expect(p.z).toBe(v.z);
      });
    }
    // même graine, même ville (deux mondes générés à part)
    setMapSize(ARCH_N);
    const w2 = new World();
    w2.seed = 11;
    newWorld(w2, CONTINENT, 11, GEN_ARCH);
    const a = townPlans(archipel(11)), b = townPlans(w2);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('le squelette : temple au centre, palais en hauteur dans les murs, marché entre les deux, port et plage au bord de l’eau', () => {
    for (const seed of SEEDS)
      for (const p of townPlans(archipel(seed))) {
        const w = archipel(seed), one = (k: TownKind) => p.lots.filter((l) => l.kind === k);
        expect(one('temple')).toHaveLength(1); expect(one('palace')).toHaveLength(1); expect(one('market')).toHaveLength(1); expect(one('port')).toHaveLength(1);
        const [t, pal, mk] = [one('temple')[0], one('palace')[0], one('market')[0]];
        expect([t.x, t.z]).toEqual(p.points.temple);
        expect(inPoly(pal.x, pal.z, p.wall)).toBe(true);
        expect(inPoly(mk.x, mk.z, p.wall)).toBe(true);
        expect(Math.hypot(mk.x - t.x, mk.z - t.z)).toBeLessThan(Math.hypot(pal.x - t.x, pal.z - t.z));
        // le palais est plus haut que le temple
        expect(w.cellAvg(Math.floor(pal.x), Math.floor(pal.z))).toBeGreaterThanOrEqual(w.cellAvg(Math.floor(t.x), Math.floor(t.z)) - 0.05);
        // le quai et la plage touchent l'eau ; la plage n'est pas le port
        expect(waterNear(w, p.points.port[0], p.points.port[1], 1.5)).toBe(true);
        expect(waterNear(w, p.points.plage[0], p.points.plage[1], 1.5)).toBe(true);
        const landNear = (x: number, z: number, r: number) => { for (let dz = -r; dz <= r; dz += 0.5) for (let dx = -r; dx <= r; dx += 0.5) if (!water(w, x + dx, z + dz)) return true; return false; };
        expect(landNear(p.points.plage[0], p.points.plage[1], 1.5)).toBe(true);
        expect(Math.hypot(p.points.plage[0] - p.points.port[0], p.points.plage[1] - p.points.port[1])).toBeGreaterThan(4);
        // remparts fermés sur la terre, au moins deux portes, la première tournée vers la mer
        expect(p.points.remparts).toHaveLength(12);
        for (const [x, z] of p.wall) expect(water(w, x, z)).toBe(false);
        expect(p.points.portes.length).toBeGreaterThanOrEqual(2);
        const g0 = p.points.portes[0];
        expect(Math.hypot(g0[0] - p.points.port[0], g0[1] - p.points.port[1])).toBeLessThan(Math.min(...p.points.portes.slice(1).map((g) => Math.hypot(g[0] - p.points.port[0], g[1] - p.points.port[1]))));
      }
  });

  it('les lots : dans les murs (les champs et le port dehors), jamais dans l’eau, sans se marcher dessus', () => {
    for (const seed of SEEDS)
      for (const p of townPlans(archipel(seed))) {
        const w = archipel(seed);
        for (const l of p.lots) {
          if (l.kind === 'tower' || l.kind === 'gate') continue;
          if (l.kind === 'field') { expect(inPoly(l.x, l.z, p.wall)).toBe(false); expect(water(w, l.x, l.z)).toBe(false); continue; }
          if (l.kind === 'port') continue;
          // l'usine, la gare et l'arcologie : hors les murs, sur la terre ferme
          if (OUTSIDE.includes(l.kind)) { expect(inPoly(l.x, l.z, p.wall)).toBe(false); expect(water(w, l.x, l.z)).toBe(false); continue; }
          expect(inPoly(l.x, l.z, p.wall) || near(p, l.x, l.z)).toBe(true);
          expect(water(w, l.x, l.z)).toBe(false);
        }
        const big = p.lots.filter((l) => ['temple', 'palace', 'market', 'caravan', 'baths'].includes(l.kind));
        for (let i = 0; i < big.length; i++)
          for (let j = i + 1; j < big.length; j++) {
            const a = big[i], b = big[j];
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan((Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) * 0.43 - 0.2);
          }
      }
  });

  it('la ville se densifie d’âge en âge : un bourg à l’Antiquité, toutes les maisons au Futuriste', () => {
    for (const seed of SEEDS)
      for (const p of townPlans(archipel(seed))) {
        const houses = (a: number) => lotsAt(p, a).filter((l) => l.kind === 'house' || l.kind === 'workshop').length;
        const all = houses(5);
        expect(all).toBeGreaterThan(90);
        for (let a = 2; a <= 5; a++) expect(houses(a)).toBeGreaterThan(houses(a - 1));
        expect(houses(1) / all).toBeLessThan(HOUSE_SHARE[1] + 0.05);
        // la Préhistoire montre le bourg de l'Antiquité ; le squelette existe dès le début
        expect(lotsAt(p, 0)).toEqual(lotsAt(p, 1));
        for (const k of ['temple', 'palace', 'market', 'port', 'gate', 'tower'] as TownKind[]) expect(lotsAt(p, 1).some((l) => l.kind === k)).toBe(true);
      }
  });

  it('les repères des âges récents : usine et gare à l’Industriel, gratte-ciel au Moderne, arcologie au Futuriste, à la place de maisons et de champs', () => {
    for (const seed of SEEDS)
      for (const p of townPlans(archipel(seed))) {
        const has = (k: TownKind, a: number) => lotsAt(p, a).some((l) => l.kind === k);
        for (const [k, a] of [['factory', 3], ['station', 3], ['skyscraper', 4], ['arcology', 5]] as [TownKind, number][]) {
          expect(has(k, a - 1), `${seed} ${p.people} ${k}`).toBe(false);
          expect(has(k, a), `${seed} ${p.people} ${k}`).toBe(true);
        }
        // ce qu'un repère remplace a disparu quand il arrive
        for (const a of [3, 4, 5]) {
          const live = lotsAt(p, a), marks = live.filter((l) => ['factory', 'station', 'skyscraper', 'arcology'].includes(l.kind));
          for (const m of marks)
            for (const l of live)
              if (l !== m && ['house', 'workshop', 'field', 'garden'].includes(l.kind)) expect(Math.hypot(l.x - m.x, l.z - m.z)).toBeGreaterThan(Math.hypot(m.w, m.d) / 2);
        }
      }
  });

  it('les modèles des deux peuples, à chaque âge : propres, dans leur budget de triangles et dans leur lot', () => {
    const kinds: [TownKind, number, number, number][] = [
      ['house', 1.2, 1.1, 1300], ['workshop', 1.2, 1.1, 1300], ['garden', 2.2, 2.2, 2000], ['field', 3, 2.5, 1000], ['tower', 1.3, 1.3, 1000], ['gate', 2.4, 1.4, 1500],
      // les monuments couvrent 25 à 30 cases : 11 000 triangles au plus pour le temple et le palais (une pièce de chaque par ville)
      ['temple', 5, 5, 11000], ['palace', 6, 5, 11000], ['market', 4, 4, 6500], ['port', 4, 3.5, 6500], ['caravan', 4, 4, 6500], ['baths', 3, 2.6, 6500],
      ['teahouse', 1.8, 1.6, 3000], ['paifang', 1.8, 0.5, 1400],
      // les repères : un de chaque par ville
      ['factory', 3.2, 2.4, 6500], ['station', 3.6, 1.8, 6500], ['skyscraper', 2.4, 2.4, 6500], ['arcology', 5, 5, 11000],
    ];
    const box = new THREE.Box3();
    for (const people of ['orient', 'asie'] as const)
      for (const [kind, w, d, cap] of kinds) {
        if ((kind === 'caravan' || kind === 'baths') && people === 'asie') continue;
        if ((kind === 'teahouse' || kind === 'paifang') && people === 'orient') continue;
        for (let age = 1; age <= 5; age++)
          for (let v = 0; v < 12; v++) {
            const g = townModel(people, kind, age, v, w, d), pos = g.attributes.position.array as Float32Array;
            // (les monuments du peuple asiatique ont le détail des nôtres : charpente, tuiles en couvre-joints, balustrades)
            if (triCount(g) > (people === 'asie' ? ASIE_CAP[kind] ?? cap : cap)) expect(`${people} ${kind} ${age} ${v} : ${triCount(g)}`).toBe('dans le budget');
            expect(pos.every((x) => Number.isFinite(x))).toBe(true);
            // dans son lot (les arbres et les toits débordent un peu ; le port avance sur l'eau avec son navire)
            if (kind === 'port') continue;
            box.setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute);
            expect(box.max.x - box.min.x).toBeLessThanOrEqual(w + 0.6);
            expect(box.max.z - box.min.z).toBeLessThanOrEqual(d + 0.6);
          }
      }
    for (const people of ['orient', 'asie'] as const) for (let age = 1; age <= 5; age++) expect(triCount(townWall(people, age, 1.6))).toBeLessThan(600);
  });

  it('les états de bataille : en ruine (plus bas, sans lumières, gravats) et en reconstruction (échafaudage)', () => {
    const box = new THREE.Box3(), top = (g: THREE.BufferGeometry) => { box.setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute); return box.max.y; };
    const lit = (g: THREE.BufferGeometry) => Array.from(g.attributes.aLight.array as Float32Array).some((x) => x !== 0);
    for (const people of ['orient', 'asie'] as const)
      for (const [kind, w, d] of [['palace', 6, 5], ['gate', 2.4, 1.4], ['tower', 1.3, 1.3], ['house', 1.2, 1.1], ['temple', 5, 5]] as [TownKind, number, number][])
        for (const age of [2, 3, 5]) {
          const ok = townModel(people, kind, age, 1, w, d), ruin = townModel(people, kind, age, 1, w, d, 'ruin'), rep = townModel(people, kind, age, 1, w, d, 'repair');
          for (const g of [ruin, rep]) expect((g.attributes.position.array as Float32Array).every((x) => Number.isFinite(x))).toBe(true);
          expect(top(ruin)).toBeLessThan(top(ok));
          expect(lit(ruin)).toBe(false);
          expect(triCount(rep)).toBeGreaterThan(30);
          // le cache rend la même géométrie, et l'état intact ne change pas
          expect(townModel(people, kind, age, 1, w, d, 'ruin')).toBe(ruin);
          expect(townModel(people, kind, age, 1, w, d, 'intact')).toBe(ok);
        }
    for (const people of ['orient', 'asie'] as const) {
      const ok = townWall(people, 3, 1.6), br = [0, 1, 2, 3].map((s) => townWall(people, 3, 1.6, 'ruin', s));
      // des brèches : le haut du pan ne tient plus partout
      for (const g of br) expect(top(g)).toBeLessThan(top(ok) - 0.05);
    }
  });
});
