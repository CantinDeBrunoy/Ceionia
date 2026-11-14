import * as THREE from 'three';
import type { Parts } from '../parts';
import { mulberry32 } from '../../core/rng';

/**
 * Met en ruine un modèle encore en chantier dans `p` (avant `build`) : les lumières s'éteignent, une bonne part des pièces
 * qui ne touchent pas le sol tombe (merlons, coupoles, étages, kiosques), des pans restent noircis de suie, et des tas de
 * gravats jonchent le pied des murs. Marche pour n'importe quel modèle des villes (palais, portes, remparts, maisons…) ;
 * tirage fixe par `seed`, pour que la ruine soit la même à chaque chargement
 */
export function ruinParts(p: Parts, seed: number, fall = 0.55) {
  const r = mulberry32(seed * 131 + 7), box = new THREE.Box3(), kept: THREE.BufferGeometry[] = [], fallen: THREE.Box3[] = [];
  for (const g of p.glow) g.dispose();
  p.glow = [];
  for (const g of p.body) {
    box.setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute);
    // une pièce posée en hauteur (plus de 0,3 case au-dessus du sol) tombe une fois sur deux ; les grandes masses restent
    const big = (box.max.x - box.min.x) * (box.max.z - box.min.z) > 1.2;
    if (box.min.y > 0.3 && !big && r() < fall) { fallen.push(box.clone()); g.dispose(); continue; }
    // suie : un quart des pièces restantes, assombries et rougies
    if (r() < 0.25) {
      const c = g.attributes.color, k = 0.45 + r() * 0.2;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k * 1.05, c.getY(i) * k * 0.95, c.getZ(i) * k * 0.9);
    }
    kept.push(g);
  }
  p.body = kept;
  // les gravats : quelques tas bas au pied des pièces tombées, de la couleur de la pierre
  const n = Math.min(14, Math.ceil(fallen.length / 4));
  for (let i = 0; i < n; i++) {
    const b = fallen[Math.floor(r() * fallen.length)], s = 0.08 + r() * 0.1;
    const x = (b.min.x + b.max.x) / 2 + (r() - 0.5) * 0.3, z = (b.min.z + b.max.z) / 2 + (r() - 0.5) * 0.3;
    p.add(new THREE.OctahedronGeometry(s, 0).scale(1.4, 0.45, 1.1), x, s * 0.15, z, r() < 0.5 ? 0xb8a682 : 0x8f8068, r() * 3);
  }
}
