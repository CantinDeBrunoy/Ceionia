import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { KINDS, KIND_ORDER, KindId } from '../src/build/catalog';
import { getModel } from '../src/render/models';
import { mergeLit, LIT_FIXED } from '../src/render/materials';
import {
  WATER_SURF, WATER_SPLASH, WATER_FALL, WATER_MAX, waterSeed, readWaterSeed, discWater, rectWater, ringWater, splashWater,
  splashRing, sheetWater, curtainWater, waterTint,
} from '../src/render/buildingWater';

/** Les sortes d'eau (0 surface, 1 écume, 2 chute) présentes dans un modèle, d'après les graines de ses lumières */
function waterKinds(kind: KindId, age: number) {
  const m = getModel(kind, age, { v: 0, L: false, R: false, F: true });
  const found = new Set<number>();
  const geos = [m.glow, ...(m.sways ?? []).map((s) => s.glow)];
  for (const g of geos) {
    const a = g?.attributes.aLight;
    for (let i = 0; a && i < a.count; i++) { const k = readWaterSeed(a.getX(i)).kind; if (k >= 0) found.add(k); }
  }
  return found;
}

/** Normale (y) de chaque triangle d'une géométrie non indexée */
function upness(g: THREE.BufferGeometry) {
  const p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), out: number[] = [];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    out.push(b.sub(a).cross(c.sub(a)).normalize().y);
  }
  return out;
}

describe('eau des bâtiments', () => {
  it('une graine d’eau se relit : sa sorte et son nombre, sous toutes les lumières', () => {
    for (const [base, kind] of [[WATER_SURF, 0], [WATER_SPLASH, 1], [WATER_FALL, 2]]) {
      for (const v of [0, 0.013, 0.25, 0.5, 0.98]) {
        const s = waterSeed(base, v), r = readWaterSeed(s);
        expect(s).toBeLessThanOrEqual(WATER_MAX);
        expect(r.kind).toBe(kind);
        expect(r.v).toBeCloseTo(v, 4);
      }
      // au-delà de 0,99, le nombre est écrêté : il ne déborde jamais sur la sorte voisine
      expect(readWaterSeed(waterSeed(base, 5)).kind).toBe(kind);
    }
    // les lumières (fenêtres, flammes, néons, lumières fixes) ne sont pas de l'eau
    for (const s of [0.3, -0.7, 2.4, LIT_FIXED]) expect(readWaterSeed(s).kind).toBe(-1);
    expect(LIT_FIXED).toBeGreaterThan(WATER_MAX);
  });

  it('les nappes regardent le ciel, le bord est à distance nulle et le milieu porte la distance au bord', () => {
    for (const g of [discWater(0.2, 10), rectWater(0.6, 0.2), ringWater(0.5, 0.66, 24), splashWater(0.05), splashRing(0.2, 0.03, 12)]) {
      for (const y of upness(g)) expect(y).toBeGreaterThan(0.99);
    }
    const d = discWater(0.2, 10).attributes.aLight;
    expect(readWaterSeed(d.getX(1)).v).toBeCloseTo(0, 5);
    expect(readWaterSeed(d.getX(0)).v).toBeCloseTo(0.2 * Math.cos(Math.PI / 10), 5);
    // rectangle : le centre est à la demi-profondeur des grands côtés, à la demi-largeur des petits
    const r = rectWater(0.6, 0.2).attributes.aLight;
    expect(readWaterSeed(r.getX(0)).v).toBeCloseTo(0.1, 5);
    expect(readWaterSeed(r.getX(3)).v).toBeCloseTo(0.3, 5);
    // une eau calme (puits) ne touche jamais le bord : pas d'écume
    const calm = discWater(0.1, 8, 0.03).attributes.aLight;
    for (let i = 0; i < calm.count; i++) expect(readWaterSeed(calm.getX(i)).v).toBeGreaterThanOrEqual(0.03 - 1e-6);
  });

  it('une chute va de sa source (0) à son bout (1), et la nappe qui tombe se voit des deux côtés', () => {
    const c = curtainWater(0.1, 0.12, 0.2, 8), p = c.attributes.position, a = c.attributes.aLight;
    for (let i = 0; i < p.count; i++) {
      const r = readWaterSeed(a.getX(i));
      expect(r.kind).toBe(2);
      expect(r.v).toBeCloseTo(Math.min(0.99, 1 - p.getY(i) / 0.2), 4);
    }
    const ups = upness(sheetWater(0.5, 0.1, 0.05));
    expect(ups.some((y) => y > 0) && ups.some((y) => y < 0)).toBe(true);
  });

  it('la tache d’écume prend la teinte de la nappe à cet endroit : claire au bord, sombre au large', () => {
    const lum = (h: number) => new THREE.Color(h).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(lum(waterTint(0x4fa2c2, 0))).toBeGreaterThan(lum(waterTint(0x4fa2c2, 0.2)));
    expect(waterTint(0x4fa2c2, 0.2)).toBe(waterTint(0x4fa2c2, 0.5));
  });

  it('fontaines, puits, thermes, bassins et parcs aquatiques ont une eau animée', () => {
    const want: [KindId, number, number[]][] = [
      ['well', 0, [0]], ['well', 1, [0]], ['well', 4, [0, 1, 2]], ['gather', 3, [0, 1, 2]], ['gather', 4, [0]],
      ['baths', 1, [0, 1, 2]], ['baths', 2, [0]], ['baths', 3, [0]], ['baths', 4, [0]], ['baths', 5, [0]],
      ['waterpark', 4, [0, 2]], ['zoo', 4, [0]], ['health', 1, [0, 2]], ['temple', 5, [0]], ['pen', 1, [0]],
    ];
    for (const [kind, age, kinds] of want) {
      const found = waterKinds(kind, age);
      for (const k of kinds) expect(found.has(k), `${kind} à l’âge ${age} : sorte ${k}`).toBe(true);
    }
  });

  it('dans tous les modèles, l’eau garde sa graine une fois fondue dans le maillage des bâtiments', () => {
    for (const kind of KIND_ORDER) for (let age = KINDS[kind].minAge; age < 6; age++) {
      const m = getModel(kind, age, { v: 0, L: false, R: false, F: true });
      if (!m.glow) continue;
      const lit = mergeLit(m.body, m.glow);
      expect(lit, `${kind} à l’âge ${age}`).not.toBeNull();
      const src = m.glow.attributes.aLight, out = lit!.attributes.aLight;
      let inSrc = 0, inLit = 0;
      for (let i = 0; i < src.count; i++) if (src.getX(i) <= WATER_MAX) inSrc++;
      for (let i = 0; i < out.count; i++) if (out.getX(i) <= WATER_MAX) { inLit++; expect(readWaterSeed(out.getX(i)).kind).toBeGreaterThanOrEqual(0); }
      expect(inLit, `${kind} à l’âge ${age}`).toBe(inSrc);
    }
  }, 60000);
});
