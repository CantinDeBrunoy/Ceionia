import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Parts } from '../src/render/parts';
import * as front from '../src/render/models/frontline';
import type { FrontKit } from '../src/render/models/frontline';

/** Triangles d'une liste de géométries (non indexées, comme Parts les garde) */
const tris = (gs: THREE.BufferGeometry[]) => gs.reduce((n, g) => n + g.attributes.position.count / 3, 0);

/**
 * Un modèle de la tête de pont à un âge, avec un kit factice : les pièces qui se balancent ou tournent sont gardées à part, et
 * chaque personnage animé compte comme celui de models.ts (neuf boîtes : jambes, corps, tête, coiffe, bras)
 */
function draw(fn: (p: Parts, kit: FrontKit) => void) {
  const p = new Parts(), moving: Parts[] = [], crowd: Parts[] = [], piece = () => { const q = new Parts(); moving.push(q); return q; };
  let smokes = 0, turns = 0;
  const kit: FrontKit = {
    sway: piece, turn: () => { turns++; return piece(); }, smoke: () => { smokes++; },
    figure: (_p, x, z, body, ry = 0) => {
      const q = new Parts();
      for (let i = 0; i < 9; i++) q.box(0.02, 0.05, 0.02, x, 0.012 + i * 0.01, z, body, ry);
      crowd.push(q);
    },
  };
  fn(p, kit);
  const all = [p, ...moving, ...crowd], n = all.reduce((s, q) => s + tris(q.body) + tris(q.glow), 0);
  return { p, n, moving, crowd, all, smokes, turns };
}

/** Les modèles, leur emprise (en cases) et leurs âges */
const MODELS: [string, number, number[], (age: number) => (p: Parts, kit: FrontKit) => void][] = [
  ['infirmerie', 2, [2, 3, 4, 5], (a) => (p, k) => front.frontInfirmary(p, a, k)],
  ['forge', 2, [3, 4, 5], (a) => (p, k) => front.frontForge(p, a, k)],
  // (le fort en 6 × 6 depuis le 24 nov. 2026 ; un ancien fort resté à sa taille garde le modèle de 3 × 3)
  ['fort', 6, [3, 4, 5], (a) => (p, k) => front.fortModel(p, a, k)],
  ['fort ancien', 3, [3, 4, 5], (a) => (p, k) => front.fortModel(p, a, k, 3)],
  ['batterie', 2, [3, 4, 5], (a) => (p, k) => front.coastBattery(p, a, k)],
  ['caserne', 2, [4, 5], (a) => (p, k) => front.garrisonBarracks(p, a, k)],
  ['hôpital', 2, [4, 5], (a) => (p, k) => front.milHospital(p, a, k)],
  ['foyer', 2, [4, 5], (a) => (p, k) => front.soldierClub(p, a, k)],
  ...[0, 1, 2, 3, 4, 5].map((v) => [`maison ${v}`, 1, [4, 5], (a: number) => (p: Parts, k: FrontKit) => front.garrisonHouse(p, a, v, k)] as [string, number, number[], (age: number) => (p: Parts, kit: FrontKit) => void]),
  ['héliport', 2, [4, 5], (a) => (p, k) => front.milHeliport(p, a, k)],
  ['radar', 2, [4, 5], (a) => (p, k) => front.radarStation(p, a, k)],
];
const CAP: Record<number, number> = { 1: 3000, 2: 4500, 3: 6500, 6: 13000 };

describe('modèles de la tête de pont', () => {
  it('chaque modèle, à chaque âge, est sans NaN, sur sa parcelle, sous son plafond de triangles, sans socle plat', () => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), rows: string[] = [], checks: (() => void)[] = [];
    for (const [name, size, ages, fn] of MODELS) for (const age of ages) {
      const { n, p, all } = draw(fn(age));
      checks.push(() => expect(n, `${name} à l’âge ${age}`).toBeLessThan(CAP[size]));
      checks.push(() => expect(n, `${name} à l’âge ${age}`).toBeGreaterThan(CAP[size] * 0.45));
      for (const q of all) for (const g of [...q.body, ...q.glow]) {
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), `${name} à l’âge ${age}`).toBe(true);
      }
      // sur la parcelle (les pièces mobiles sont dessinées autour de leur pivot : seul le corps compte)
      let out = 0, big = 0, where = '';
      for (const g of [...p.body, ...p.glow]) {
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const o = Math.max(Math.abs(pos.getX(i)) - size / 2, Math.abs(pos.getZ(i)) - size / 2);
          if (o > out) { out = o; where = `(${pos.getX(i).toFixed(2)}, ${pos.getY(i).toFixed(2)}, ${pos.getZ(i).toFixed(2)})`; }
        }
        // pas d'aplat au ras du sol (voir le test « socle plat » de rendu.test.ts)
        for (let t = 0; t + 2 < pos.count; t += 3) {
          a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
          if ((a.y + b.y + c.y) / 3 > 0.03) continue;
          const nn = b.clone().sub(a).cross(c.clone().sub(a));
          if (nn.y <= 0) continue;
          if (nn.length() / 2 / (size * size) > big) { big = nn.length() / 2 / (size * size); where += ` aplat (${a.x.toFixed(2)}, ${a.z.toFixed(2)})`; }
        }
      }
      rows.push(`${name} âge ${age} : ${n} triangles${out > 0.03 || big > 0.03 ? ` ; hors parcelle ${out.toFixed(3)}, aplat ${big.toFixed(3)} ${where}` : ''}`);
      checks.push(() => expect(out, `${name} à l’âge ${age}`).toBeLessThan(0.03), () => expect(big, `${name} à l’âge ${age}`).toBeLessThan(0.03));
    }
    console.log(rows.join('\n'));
    for (const ch of checks) ch();
  });

  it('chaque modèle se fusionne, porte nos couleurs (drapeau au vent ou écu) et a ses pièces mobiles', () => {
    for (const [name, , ages, fn] of MODELS) for (const age of ages) {
      const { p, moving, all } = draw(fn(age));
      // une sentinelle du blason a un canal bleu négatif (voir teamPaint.ts)
      const team = all.some((q) => q.body.some((g) => { const c = g.attributes.color; for (let i = 0; i < c.count; i++) if (c.getZ(i) < -0.45) return true; return false; }));
      expect(team, `${name} à l’âge ${age}`).toBe(true);
      expect(moving.length, `${name} à l’âge ${age}`).toBeGreaterThan(0);
      expect(p.build().body.attributes.position.count, `${name} à l’âge ${age}`).toBeGreaterThan(0);
    }
  });

  it('l’antenne du radar et les rotors tournent, la forge fume, un âge hors bornes prend le modèle le plus proche', () => {
    for (const age of [4, 5]) expect(draw((p, k) => front.radarStation(p, age, k)).turns, `radar à l’âge ${age}`).toBeGreaterThan(0);
    expect(draw((p, k) => front.milHeliport(p, 4, k)).turns).toBeGreaterThanOrEqual(2);
    for (const age of [3, 4]) expect(draw((p, k) => front.frontForge(p, age, k)).smokes, `forge à l’âge ${age}`).toBeGreaterThan(0);
    expect(draw((p, k) => front.fortModel(p, 2, k)).n).toBe(draw((p, k) => front.fortModel(p, 3, k)).n);
    expect(draw((p, k) => front.frontInfirmary(p, 6, k)).n).toBe(draw((p, k) => front.frontInfirmary(p, 5, k)).n);
    expect(draw((p, k) => front.garrisonHouse(p, 4, 13, k)).n).toBe(draw((p, k) => front.garrisonHouse(p, 4, 1, k)).n);
  });
});
