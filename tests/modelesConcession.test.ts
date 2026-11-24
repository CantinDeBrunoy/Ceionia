import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Parts } from '../src/render/parts';
import type { People } from '../src/world/archipelago';
import {
  allyBarracks, allyShipyard, allyHospital, merchantPort, exchangeHall, commonSchool, dispensary, researchCenter, type ConcessionKit,
} from '../src/render/models/concession';

type V3 = [number, number, number];
type Draw = (p: Parts, age: number, people: People, kit: ConcessionKit) => void;

/** Les modèles de la concession : emprise, premier âge */
const MODELS: [string, Draw, number, number][] = [
  ['allyBarracks', allyBarracks, 2, 2], ['allyShipyard', allyShipyard, 2, 2], ['allyHospital', allyHospital, 2, 2],
  ['merchantPort', merchantPort, 3, 3], ['exchangeHall', exchangeHall, 2, 3], ['commonSchool', commonSchool, 2, 3],
  ['dispensary', dispensary, 2, 3], ['researchCenter', researchCenter, 2, 4],
];
/** Plafond de triangles selon l'emprise (comme `tests/rendu.test.ts`) */
const CAP: Record<number, number> = { 2: 4500, 3: 6500 };

/** Un kit de test : les pièces mobiles et les personnages animés sont gardés à part, avec leur pivot */
function testKit() {
  const moving: { p: Parts; pivot: V3 }[] = [];
  const kit: ConcessionKit = {
    sway: (pivot) => { const p = new Parts(); moving.push({ p, pivot }); return p; },
    turn: (pivot) => { const p = new Parts(); moving.push({ p, pivot }); return p; },
    swing: (pivot) => { const p = new Parts(); moving.push({ p, pivot }); return p; },
    smoke: () => {},
    fan: (draw) => { const p = new Parts(); draw(p); moving.push({ p, pivot: [0, 0, 0] }); },
  };
  return { kit, moving };
}

/** Dessine un modèle : ses géométries (pièces mobiles reposées à leur pivot) */
function draw(fn: Draw, age: number, people: People) {
  const p = new Parts(), { kit, moving } = testKit();
  fn(p, age, people, kit);
  const geos: THREE.BufferGeometry[] = [];
  const main = p.build();
  geos.push(main.body);
  if (main.glow) geos.push(main.glow);
  for (const m of moving) for (const g of [...m.p.body, ...m.p.glow]) geos.push(g.clone().translate(...m.pivot));
  return { geos, body: main.body };
}

describe('modèles de la concession', () => {
  const report: string[] = [];
  for (const [name, fn, size, first] of MODELS)
    it(`${name} : sans NaN, sous ${CAP[size]} triangles, sur sa parcelle, sans dalle pleine`, () => {
      for (const people of ['orient', 'asie'] as People[])
        for (let age = first; age <= 5; age++) {
          const { geos, body } = draw(fn, age, people);
          let tris = 0, out = 0, nan = false;
          for (const g of geos) {
            const pos = g.attributes.position;
            tris += pos.count / 3;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan = true;
              out = Math.max(out, Math.abs(x) - size / 2, Math.abs(z) - size / 2);
            }
            const col = g.attributes.color;
            for (let i = 0; i < col.count * 3; i++) if (!Number.isFinite((col.array as Float32Array)[i])) nan = true;
          }
          const label = `${name}, ${people}, âge ${age}`;
          expect(nan, label).toBe(false);
          expect(tris, label).toBeLessThan(CAP[size]);
          expect(out, label).toBeLessThan(0.16);
          // pas de socle plat : aucun grand triangle tourné vers le ciel au ras du sol
          const pos = body.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
          let big = 0;
          for (let t = 0; t + 2 < pos.count; t += 3) {
            a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
            if ((a.y + b.y + c.y) / 3 > 0.03) continue;
            const n = b.clone().sub(a).cross(c.clone().sub(a));
            if (n.y <= 0) continue;
            big = Math.max(big, n.length() / 2 / (size * size));
          }
          expect(big, label).toBeLessThan(0.03);
          report.push(`${label} : ${Math.round(tris)}`);
        }
    });
  it('rapport des triangles', () => { console.log(report.join('\n')); });
});
