import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeSkinned } from '../src/render/assets';

/** Un petit modèle articulé : un os, et des morceaux en couleurs unies attachés dessus */
function rig(colors: number[], opts: { map?: boolean; twoBones?: boolean } = {}) {
  const root = new THREE.Group();
  const bone = new THREE.Bone(), bone2 = new THREE.Bone();
  root.add(bone);
  if (opts.twoBones) root.add(bone2);
  const skeleton = new THREE.Skeleton([bone]), other = new THREE.Skeleton([bone2]);
  const parts: THREE.SkinnedMesh[] = [];
  colors.forEach((c, i) => {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(i * 2, 0, 0);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Float32Array.from({ length: n * 4 }, (_, k) => (k % 4 === 0 ? 1 : 0)), 4));
    const mat = new THREE.MeshStandardMaterial({ color: c });
    if (opts.map && i === 1) mat.map = new THREE.Texture();
    const m = new THREE.SkinnedMesh(g, mat);
    root.add(m);
    m.bind(opts.twoBones && i === 1 ? other : skeleton, new THREE.Matrix4());
    parts.push(m);
  });
  return { root, parts };
}

describe('fusion des maillages articulés d’un modèle', () => {
  it('fond les morceaux en couleurs unies en un seul maillage, la couleur dans les sommets', () => {
    const { root, parts } = rig([0xff0000, 0x00ff00, 0x0000ff]);
    expect(mergeSkinned(root)).toBe(true);
    const meshes: THREE.SkinnedMesh[] = [];
    root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    expect(meshes.length).toBe(1);
    const m = meshes[0], g = m.geometry;
    // boîtes non indexées : 36 sommets chacune
    expect(g.attributes.position.count).toBe(parts.length * 36);
    expect(g.attributes.skinIndex).toBeDefined();
    expect(g.attributes.skinWeight).toBeDefined();
    expect((m.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    const col = g.attributes.color;
    expect(col.getX(0)).toBeCloseTo(1); expect(col.getY(0)).toBeCloseTo(0);
    expect(col.getY(36)).toBeCloseTo(1); expect(col.getX(36)).toBeCloseTo(0);
    expect(col.getZ(72)).toBeCloseTo(1);
    expect(m.skeleton).toBe(parts[0].skeleton);
  });
  it('ne touche pas à un modèle d’un seul morceau, ni à un modèle texturé, ni à des squelettes différents', () => {
    expect(mergeSkinned(rig([0xff0000]).root)).toBe(false);
    const tex = rig([0xff0000, 0x00ff00], { map: true });
    expect(mergeSkinned(tex.root)).toBe(false);
    expect(tex.root.children.filter((o) => (o as THREE.SkinnedMesh).isSkinnedMesh).length).toBe(2);
    const two = rig([0xff0000, 0x00ff00], { twoBones: true });
    expect(mergeSkinned(two.root)).toBe(false);
  });
});
