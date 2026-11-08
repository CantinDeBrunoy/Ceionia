import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, VEG_VOLCANO } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { raiseVolcano, removeVolcano } from '../src/world/terraform';

function monde() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Un endroit de terre ferme dégagé, loin de tout volcan existant */
function terre(w: World): [number, number] {
  for (let z = 40; z < N - 40; z += 3) for (let x = 40; x < N - 40; x += 3) {
    let ok = true;
    for (let dz = -8; dz <= 8 && ok; dz += 2) for (let dx = -8; dx <= 8; dx += 2) if (w.cellAvg(x + dx, z + dz) < 0.4 || w.veg[w.ci(x + dx, z + dz)] === VEG_VOLCANO) { ok = false; break; }
    if (ok && w.volcanoAt(x + 0.5, z + 0.5) < 0) return [x, z];
  }
  throw new Error('pas de terre');
}

describe('raser un volcan', () => {
  it('le cône retombe au sol et le volcan disparaît', () => {
    const w = monde();
    const [x, z] = terre(w);
    const avant = w.cellAvg(x, z);
    expect(raiseVolcano(w, x + 0.5, z + 0.5, 3)).toBe(true);
    w.updateVis();
    const cell = w.volcanoAt(x + 0.5, z + 0.5);
    expect(cell).toBeGreaterThanOrEqual(0);
    const haut = Math.max(...[-2, 0, 2].flatMap((dz) => [-2, 0, 2].map((dx) => w.cellAvg(x + dx, z + dz))));
    expect(haut).toBeGreaterThan(avant + 3);
    expect(removeVolcano(w, cell)).toBe(true);
    w.updateVis();
    expect(w.veg[cell]).not.toBe(VEG_VOLCANO);
    expect(w.volcanoAt(x + 0.5, z + 0.5)).toBe(-1);
    // plus de cône : le centre est redescendu près du sol d'origine
    expect(w.cellAvg(x, z)).toBeLessThan(avant + 1.2);
  });

  it('une case qui n’est pas un volcan : rien ne change', () => {
    const w = monde();
    const [x, z] = terre(w);
    expect(removeVolcano(w, w.ci(x, z))).toBe(false);
  });
});
