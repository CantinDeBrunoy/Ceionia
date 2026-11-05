import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, VEG_FOREST, MAX_H, MIN_H } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { raiseVolcano, volcanoRadius } from '../src/world/terraform';
import { KINDS, KIND_ORDER, KindId, sizeOf } from '../src/build/catalog';
import { getModel } from '../src/render/models';
import { HUMAN } from '../src/render/assets';
import { VegView, WALL_GAP, syncChunks } from '../src/render/vegetation';
import { BuildingView, skylineTier } from '../src/render/buildings';
import { Atmosphere } from '../src/render/atmosphere';
import type { Environment } from '../src/render/env';
import type { AudioEngine } from '../src/audio/audio';
import type { GameTime } from '../src/core/time';
import { makeSeasonState } from '../src/render/season';

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  syncChunks();
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Portée d'une géométrie autour de son axe vertical */
function reach(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  return r;
}

describe('rendu', () => {
  it('les modèles restent sur leur parcelle (à la marge près que les arbres laissent libre), à tous les âges', () => {
    // le ponton et le port s'avancent sur l'eau, où rien ne pousse
    const water: KindId[] = ['pier', 'harbor'];
    for (const kind of KIND_ORDER) {
      if (water.includes(kind)) continue;
      const s = KINDS[kind].size;
      for (let age = KINDS[kind].minAge; age < 6; age++)
        for (let v = 0; v < 6; v++) {
          const p = getModel(kind, age, { v, L: false, R: false, F: v % 2 === 0 }).body.attributes.position;
          let out = 0;
          for (let i = 0; i < p.count; i++) out = Math.max(out, Math.abs(p.getX(i)) - s / 2, Math.abs(p.getZ(i)) - s / 2);
          expect(out, `${kind} à l’âge ${age}`).toBeLessThan(WALL_GAP);
        }
    }
  }, 60000);

  it('aucun arbre ne traverse un bâtiment, même quand le temple antique devient une église au Moyen Âge', () => {
    const w = continent();
    // le temple au milieu des bois : la place la plus boisée tout autour
    let best: [number, number] = [0, 0], most = -1;
    for (let z = 20; z < N - 20; z++)
      for (let x = 20; x < N - 20; x++) {
        if (w.canPlace('temple', x, z) !== null) continue;
        let n = 0;
        for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) if (w.veg[w.ci(x + dx, z + dz)] === VEG_FOREST) n++;
        if (n > most) { most = n; best = [x, z]; }
      }
    expect(most).toBeGreaterThan(8);
    const temple = w.place('temple', best[0], best[1], 0, true, 1, false);
    // quelques maisons à l'orée de la même forêt
    for (const [dx, dz] of [[-3, 0], [3, 1], [0, 3]]) if (w.canPlace('house', best[0] + dx, best[1] + dz) === null) w.place('house', best[0] + dx, best[1] + dz, 0, true, 1, false);
    const veg = new VegView(w);
    veg.applySeason(makeSeasonState());
    // le passage au Moyen Âge : l'église remplace le temple sur la même emprise
    temple.age = 2;
    const blds = [...w.buildings.values()];
    for (const b of blds) for (let j = 0; j < sizeOf(b); j++) for (let i = 0; i < sizeOf(b); i++) expect(w.veg[w.ci(b.x + i, b.z + j)]).toBe(0);
    // chaque arbre (tout ce qui monte à plus de 30 cm) : sa cime ne touche ni l'emprise ni la marge qui l'entoure
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let trees = 0;
    veg.group.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh) || !o.count) return;
      o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox!.max.y < 0.3) return;
      const r0 = reach(o.geometry);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        m.decompose(pos, q, sc);
        const r = r0 * Math.max(sc.x, sc.z);
        for (const b of blds) {
          const s = sizeOf(b);
          const qx = Math.max(b.x - WALL_GAP, Math.min(b.x + s + WALL_GAP, pos.x)), qz = Math.max(b.z - WALL_GAP, Math.min(b.z + s + WALL_GAP, pos.z));
          if (Math.hypot(pos.x - qx, pos.z - qz) > r + 3) continue;
          trees++;
          expect(Math.hypot(pos.x - qx, pos.z - qz), `${b.kind} en ${b.x}, ${b.z}`).toBeGreaterThanOrEqual(r - 1e-4);
        }
      }
    });
    expect(trees).toBeGreaterThan(20);
  });
});

describe('personnages', () => {
  it('les personnages des bâtiments agrandis (temple, atelier, moulin) gardent la taille des habitants', () => {
    // le technicien au pied de l'éolienne : posée sur quatre cases, elle est dessinée pour une puis agrandie, lui non
    const top = (small: boolean) => {
      const g = getModel('mill', 4, { v: 0, L: false, R: false, F: true, small }).crowd!;
      g.computeBoundingBox();
      return g.boundingBox!.max.y;
    };
    expect(top(false)).toBeGreaterThan(HUMAN * 0.8);
    expect(top(false)).toBeLessThan(HUMAN * 1.1);
    expect(top(false)).toBeCloseTo(top(true), 3);
  });
});

describe('maisons et tours', () => {
  /** Une rangée de n maisons accolées, façade au sud, à l'âge voulu ; leurs fiches (clés de modèle) dans l'ordre */
  function terrace(n: number, age: number) {
    const w = continent(), view = new BuildingView(w);
    let x0 = 0, z0 = 0;
    find: for (let z = 20; z < N - 20; z++) for (let x = 20; x < N - 20; x++) {
      for (let i = 0; i < n; i++) if (w.canPlace('house', x + i, z) !== null) continue find;
      x0 = x; z0 = z; break find;
    }
    const ids: number[] = [];
    for (let i = 0; i < n; i++) ids.push(w.place('house', x0 + i, z0, 0, false, age, false).id);
    return ids.map((id) => { const [, , , lrf, row] = view.entries.get(id)!.key.split('|'); return { L: lrf[0] === '1', R: lrf[1] === '1', row }; });
  }

  it('une longue rangée se découpe en blocs de trois maisons au plus, chacun d’une seule couleur de toit', () => {
    const row = terrace(10, 2);
    let len = 1;
    for (let i = 1; i < row.length; i++) {
      // deux voisines s'accordent : accolées des deux côtés, ou séparées par une ruelle
      expect(row[i].L).toBe(row[i - 1].R);
      if (row[i].L) { len++; expect(row[i].row).toBe(row[i - 1].row); }
      else { len = 1; expect(row[i].row).not.toBe(row[i - 1].row); }
      expect(len).toBeLessThanOrEqual(3);
    }
    expect(row.filter((h) => h.L).length).toBeGreaterThan(3);
  });

  it('les maisons du Moyen Âge, aussi détaillées que l’hôtel-Dieu, restent légères : il y en a beaucoup dans un village', () => {
    const tris = (g: THREE.BufferGeometry | null | undefined) => (g ? g.attributes.position.count / 3 : 0);
    for (let v = 0; v < 6; v++)
      for (const [L, R, F] of [[false, false, true], [false, false, false], [true, false, true], [true, true, true]]) {
        const m = getModel('house', 2, { v, L, R, F, row: v % 4 });
        expect(tris(m.body) + tris(m.glow), `variante ${v}, ${+L}${+R}${+F}`).toBeLessThan(3000);
      }
  });

  it('la Préhistoire, les puits, l’éclairage et les bâtiments antiques enrichis restent sous le plafond (3 000 triangles par case, 4 500 en 2 × 2)', () => {
    const tris = (g: THREE.BufferGeometry | null | undefined) => (g ? g.attributes.position.count / 3 : 0);
    const cases: [KindId, number][] = [];
    for (const kind of KIND_ORDER) if (KINDS[kind].minAge === 0) cases.push([kind, 0]);
    for (const age of [0, 1, 2, 3]) cases.push(['well', age], ['lamp', age]);
    cases.push(['health', 1], ['senate', 1], ['school', 1], ['workshop', 2], ['fire', 2]);
    for (const [kind, age] of cases)
      for (let v = 0; v < 3; v++) {
        const m = getModel(kind, age, { v, L: false, R: false, F: true });
        const n = tris(m.body) + tris(m.glow) + tris(m.crowd) + tris(m.rotor?.geo) + (m.sways ?? []).reduce((s, w) => s + tris(w.geo) + tris(w.glow), 0);
        expect(n, `${kind} à l’âge ${age}, variante ${v}`).toBeLessThan(KINDS[kind].size === 1 ? 3000 : 4500);
      }
  });

  it('les bâtiments « Night City » de l’âge futuriste restent sous le plafond (3 000 triangles par case, 4 500 en 2 × 2)', () => {
    const tris = (g: THREE.BufferGeometry | null | undefined) => (g ? g.attributes.position.count / 3 : 0);
    const kinds: KindId[] = ['health', 'fire', 'police', 'tavern', 'barber', 'manor', 'theater', 'lab', 'baths'];
    for (const kind of kinds)
      for (let v = 0; v < 3; v++) {
        const m = getModel(kind, 5, { v, L: false, R: false, F: true });
        const n = tris(m.body) + tris(m.glow) + tris(m.crowd) + tris(m.rotor?.geo) + (m.sways ?? []).reduce((s, w) => s + tris(w.geo) + tris(w.glow), 0);
        expect(n, `${kind}, variante ${v}`).toBeLessThan(KINDS[kind].size === 1 ? 3000 : 4500);
      }
  });

  it('le cosmodrome et l’aéroport, refaits en détail, restent sous 800 triangles par case', () => {
    const tris = (g: THREE.BufferGeometry | null | undefined) => (g ? g.attributes.position.count / 3 : 0);
    for (const [kind, age] of [['spaceport', 5], ['airport', 4], ['airport', 5]] as [KindId, number][]) {
      const m = getModel(kind, age, { v: 0, L: false, R: false, F: true });
      const n = tris(m.body) + tris(m.glow) + tris(m.crowd) + (m.sways ?? []).reduce((s, w) => s + tris(w.geo) + tris(w.glow), 0);
      expect(n, `${kind} à l’âge ${age}`).toBeLessThan(800 * KINDS[kind].size ** 2);
    }
  });

  it('le château d’eau, détaillé à chaque âge, reste sous 4 000 triangles (girouette, drone et personnages compris)', () => {
    const tris = (g: THREE.BufferGeometry | null | undefined) => (g ? g.attributes.position.count / 3 : 0);
    for (let age = 3; age < 6; age++) {
      const m = getModel('watertower', age, { v: 0, L: false, R: false, F: true });
      const n = tris(m.body) + tris(m.glow) + tris(m.crowd) + (m.sways ?? []).reduce((s, w) => s + tris(w.geo) + tris(w.glow), 0);
      expect(n, `âge ${age}`).toBeLessThan(4000);
    }
  });

  it('les tours futuristes n’ont pas toutes la même hauteur : la ville a une ligne d’horizon', () => {
    const tops = new Set<number>();
    let lo = Infinity, hi = 0;
    for (let x = 0; x < 60; x++) for (let z = 0; z < 60; z += 7) {
      const tier = skylineTier(x, z), g = getModel('house', 5, { v: (x * 7 + z) % 6, L: false, R: false, F: true, tier }).body;
      g.computeBoundingBox();
      const h = Math.round(g.boundingBox!.max.y * 10) / 10;
      tops.add(h); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    expect(tops.size).toBeGreaterThan(6);
    expect(hi / lo).toBeGreaterThan(2);
  });
});

describe('ciel', () => {
  it('pas d’arc-en-ciel sous la neige : ni quand la pluie tourne à la neige, ni quand il se met à neiger pendant qu’il brille', () => {
    const w = continent();
    const atm = new Atmosphere(w, null as unknown as AudioEngine);
    const focus = new THREE.Vector3(100, 0, 100), cam = new THREE.PerspectiveCamera(50, 1.5, 0.1, 500);
    cam.position.set(100, 30, 130); cam.lookAt(focus);
    // (pas d'orage : la pluie reste sous le seuil des éclairs)
    const env = { weatherKind: 'clear', wantKind: 'clear', weatherK: 0, rainK: 0, daylight: 1, night: 0 } as unknown as Environment;
    const time = { hour: 11, season: 1, days: 3, frac: 0.3 } as unknown as GameTime, s = makeSeasonState();
    const bowT = () => (atm as unknown as { bowT: number }).bowT;
    // le temps qu'il fait, celui qui vient, et l'avancée de la transition
    const run = (sec: number, kind: string, want: string, k: number) => {
      Object.assign(env, { weatherKind: kind, wantKind: want, weatherK: k, rainK: kind === 'rain' ? k * 0.5 : 0 });
      for (let t = 0; t < sec; t += 0.1) atm.update(0.1, time, s, env, cam, focus);
    };
    // la pluie cesse, le soleil revient : l'arc-en-ciel
    run(3, 'rain', 'rain', 1); run(1, 'rain', 'clear', 0.3); run(1, 'clear', 'clear', 0);
    expect(bowT()).toBeGreaterThan(30);
    // il se met à neiger : il s'efface en quelques secondes
    run(1, 'clear', 'snow', 0); run(7, 'snow', 'snow', 1);
    expect(bowT()).toBe(0);
    // la pluie tourne à la neige : il ne paraît pas
    run(3, 'rain', 'rain', 1); run(2, 'rain', 'snow', 0.3);
    expect(bowT()).toBe(0);
    run(10, 'snow', 'snow', 1);
    expect(bowT()).toBe(0);
  });
});

/** L'ancienne forme du volcan (cône lisse), telle qu'elle était avant les ravines des grands volcans */
function oldVolcano(world: World, wx: number, wz: number, radius: number) {
  wx = Math.min(N - 1, Math.floor(wx)) + 0.5; wz = Math.min(N - 1, Math.floor(wz)) + 0.5;
  const R = volcanoRadius(radius), H = R * 1.6, crater = Math.max(1.5, R * 0.25), pit = 1.2 + H * 0.1;
  const base = Math.max(0.3, world.cellAvg(Math.min(N - 1, Math.floor(wx)), Math.min(N - 1, Math.floor(wz))));
  const rim = base + H * Math.pow(1 - (crater + 0.8) / R, 1.6), inner = crater - Math.min(0.6, Math.max(0, (R - 9) * 0.1));
  for (let z = Math.max(0, Math.floor(wz - R)); z <= Math.min(N, Math.ceil(wz + R)); z++)
    for (let x = Math.max(0, Math.floor(wx - R)); x <= Math.min(N, Math.ceil(wx + R)); x++) {
      const d = Math.hypot(x - wx, z - wz);
      if (d > R) continue;
      const i = world.vi(x, z), h = world.heights[i];
      const nh = d < inner ? rim - pit * Math.min(1, (1 - (d / inner) ** 2) * 1.6) : d < crater ? rim : Math.max(h, Math.min(rim, base + H * Math.pow(1 - d / R, 1.6)));
      world.heights[i] = Math.min(MAX_H, Math.max(MIN_H, nh));
    }
}

describe('volcan', () => {
  it('le volcan de la carte et les volcans des petits pinceaux gardent exactement leur forme', () => {
    const w = continent();
    for (const [x, z, r] of [[60, 60, 1], [100, 120, 3], [140, 60, 5.5]]) {
      const ref = w.heights.slice();
      raiseVolcano(w, x, z, r);
      const before = w.heights.slice();
      w.heights.set(ref);
      oldVolcano(w, x, z, r);
      expect(Array.from(w.heights)).toEqual(Array.from(before));
    }
  });

  it('un grand volcan a un cratère net, des ravines sur ses flancs et pas de sommet écrêté', () => {
    const w = continent();
    const x = 100, z = 100, r = 8, R = volcanoRadius(r);
    raiseVolcano(w, x, z, r);
    // (le relief affiché, lissé : c'est lui qui doit garder les ravines)
    w.updateVis();
    const at = (d: number, a: number) => w.hAt(x + 0.5 + Math.cos(a) * d, z + 0.5 + Math.sin(a) * d);
    let top = -Infinity;
    for (let j = z - R; j <= z + R; j++) for (let i = x - R; i <= x + R; i++) top = Math.max(top, w.h(i, j));
    // le bord reste sous le plafond du relief : plus de dôme plat
    expect(top).toBeLessThan(MAX_H - 0.5);
    // le cratère : un fond bien plus bas que le bord
    let rim = -Infinity;
    for (let a = 0; a < 6.28; a += 0.2) rim = Math.max(rim, at(R * 0.22, a));
    expect(rim - w.hAt(x + 0.5, z + 0.5)).toBeGreaterThan(2.5);
    // à mi-pente, des ravines et des arêtes : la hauteur varie nettement en faisant le tour
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 6.28; a += 0.05) { const h = at(R * 0.5, a); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    expect(hi - lo).toBeGreaterThan(1.2);
    // et les flancs sont concaves : à mi-chemin du bord au pied, bien moins haut qu'un cône droit
    const mid = at((R * 0.22 + R) / 2, 0.3), foot = at(R, 0.3);
    expect(mid).toBeLessThan((rim + foot) / 2);
  });
});
