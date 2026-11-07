import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeLit, mats, LIT_FIXED } from '../src/render/materials';
import { GeoBatch } from '../src/render/batch';
import { Parts } from '../src/render/parts';
import { getModel } from '../src/render/models';
import { World, setMapSize } from '../src/world/world';
import { syncChunks } from '../src/render/vegetation';
import { BuildingView } from '../src/render/buildings';

/** Un petit modèle : un cube de corps, une fenêtre qui luit */
function model() {
  const p = new Parts();
  p.box(0.4, 0.4, 0.4, 0, 0, 0, 0xcccccc);
  p.box(0.1, 0.1, 0.01, 0, 0.2, 0.21, 0xffd27a, 0, true);
  return p.build();
}

describe('corps et lumières fondus (mats.lit)', () => {
  it('garde tous les sommets, graine nulle pour le corps et graine conservée pour les lumières', () => {
    const { body, glow } = model();
    const m = mergeLit(body, glow!)!;
    const nb = body.attributes.position.count, ng = glow!.attributes.position.count;
    expect(m.attributes.position.count).toBe(nb + ng);
    const a = m.attributes.aLight;
    for (let i = 0; i < nb; i++) expect(a.getX(i)).toBe(0);
    for (let i = 0; i < ng; i++) expect(a.getX(nb + i)).toBe(glow!.attributes.aLight.getX(i));
  });

  it('une lumière sans graine devient une lumière fixe, jamais un corps', () => {
    const { body } = model();
    const glow = new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed();
    glow.setAttribute('color', new THREE.BufferAttribute(new Float32Array(glow.attributes.position.count * 3).fill(1), 3));
    const m = mergeLit(body, glow)!;
    expect(m.attributes.aLight.getX(m.attributes.position.count - 1)).toBe(LIT_FIXED);
  });

  it('sans couleurs par sommet, ne fond rien', () => {
    expect(mergeLit(new THREE.BoxGeometry(1, 1, 1), null)).toBeNull();
  });

  it('les modèles futuristes se fondent tous', () => {
    for (const kind of ['house', 'arcology', 'vfarm', 'fusion', 'spaceport', 'research', 'maglev', 'workshop'] as const) {
      const m = getModel(kind, 5, { v: 0, L: false, R: false, F: false, tier: 3 });
      expect(mergeLit(m.body, m.glow), kind).not.toBeNull();
    }
  });
});

describe('lot de géométries', () => {
  it('compte les géométries partagées et les libère avec leur dernière instance', () => {
    const b = new GeoBatch(mats.lit, 2, 64);
    const g1 = mergeLit(model().body, null)!, g2 = mergeLit(model().body, null)!;
    const i1 = b.add(g1), i2 = b.add(g1), i3 = b.add(g2);
    expect(b.geometryCount).toBe(2);
    expect(b.instanceCount).toBe(3);
    b.swap(i3, g2, g1);
    expect(b.geometryCount).toBe(1);
    b.remove(i1, g1); b.remove(i2, g1);
    expect(b.geometryCount).toBe(1);
    b.remove(i3, g1);
    expect(b.geometryCount).toBe(0);
    expect(b.instanceCount).toBe(0);
  });

  it('grandit quand les sommets ou les instances manquent', () => {
    const b = new GeoBatch(mats.lit, 1, 8);
    const geos = Array.from({ length: 5 }, () => mergeLit(model().body, null)!);
    expect(() => geos.forEach((g) => b.add(g))).not.toThrow();
    expect(b.instanceCount).toBe(5);
  });
});

describe('bâtiments dans le lot', () => {
  it('chaque bâtiment futuriste a son instance, rendue à son retrait', () => {
    setMapSize(64);
    syncChunks();
    const w = new World();
    const view = new BuildingView(w);
    const a = w.place('arcology', 10, 10, 0, false, 5, false), h = w.place('house', 20, 20, 0, false, 5, false);
    const ea = view.entries.get(a.id)!, eh = view.entries.get(h.id)!;
    expect(ea.inst).toBeGreaterThanOrEqual(0);
    expect(eh.inst).toBeGreaterThanOrEqual(0);
    // le corps n'est plus dessiné à part, ni ses lumières
    expect(ea.body.visible).toBe(false);
    expect(ea.glow?.visible ?? false).toBe(false);
    w.removeBuilding(a.id);
    expect(view.entries.has(a.id)).toBe(false);
  });
});
