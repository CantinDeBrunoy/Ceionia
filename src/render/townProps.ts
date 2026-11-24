import * as THREE from 'three';
import { Parts } from './parts';
import { mergeLit } from './materials';
import { hash2 } from '../core/rng';
import type { Lot, TownPlan } from '../world/rivalTown';
import { O, palm } from './models/oriental';
import { A } from './models/asian';

/**
 * La vie des rues des villes des peuples de l'archipel, de l'Industriel au Futuriste (voir `rivalTowns.ts` et `docs/iles.md`) :
 * réverbères le long des rues et autour des places (allumés la nuit), charrettes et pousse-pousse, voitures et autobus, puis
 * capsules volantes ; arbres d'avenue, marquage au sol au Moderne, liserés lumineux au Futuriste. Tout est fondu en une
 * géométrie par ville et par âge, en coordonnées du monde, posée sur le relief ; la vue ne la montre que de près
 * (le « niveau de détail » de `RivalTowns`)
 */

/** Émet un réverbère de l'âge en (x, y, z), le bras tourné de `ry` */
function lamp(p: Parts, age: number, orient: boolean, x: number, y: number, z: number, ry: number) {
  if (age <= 3) {
    // fonte noire, lanterne à quatre vitres sous un chapeau
    p.cyl(0.012, 0.02, 0.42, 4, x, y, z, 0x2a2a2e);
    p.box(0.05, 0.06, 0.05, x, y + 0.42, z, 0xffd890, 0, true);
    p.cone(0.045, 0.04, 4, x, y + 0.48, z, orient ? O.turqD : 0x2a2a2e, false, Math.PI / 4);
    return;
  }
  const c = Math.cos(ry), s = Math.sin(ry);
  if (age === 4) {
    // mât d'acier, bras, tête allumée
    p.cyl(0.009, 0.014, 0.62, 4, x, y, z, 0x8a9096);
    p.box(0.012, 0.012, 0.16, x + s * 0.08, y + 0.61, z + c * 0.08, 0x8a9096, ry);
    p.box(0.05, 0.022, 0.07, x + s * 0.16, y + 0.59, z + c * 0.16, 0xfff2d0, ry, true);
    return;
  }
  // borne blanche élancée, anneau de néon
  p.cyl(0.008, 0.014, 0.5, 5, x, y, z, 0xf2f0ea);
  p.cyl(0.03, 0.03, 0.03, 6, x, y + 0.48, z, orient ? O.turqL : A.cyan, 'neon');
}

/** Un véhicule de l'âge, le long de `ry` (avant vers (sin ry, cos ry)) ; `k` le varie */
function vehicle(p: Parts, age: number, orient: boolean, x: number, y: number, z: number, ry: number, k: number) {
  const add = (g: THREE.BufferGeometry, u: number, yy: number, n: number, col: number, glow: boolean | 'neon' = false) => {
    // u le long du véhicule, n en travers
    const c = Math.cos(ry), s = Math.sin(ry);
    p.add(g, x + s * u + c * n, y + yy, z + c * u - s * n, col, ry, glow);
  };
  const wheel = (u: number, n: number, r: number) => add(new THREE.CylinderGeometry(r, r, 0.02, 6).rotateZ(Math.PI / 2), u, r, n, 0x2a2a2e);
  const box = (w: number, h: number, l: number, u: number, yy: number, n: number, col: number, glow: boolean | 'neon' = false) => add(new THREE.BoxGeometry(w, h, l).translate(0, h / 2, 0), u, yy, n, col, glow);
  if (age <= 3) {
    if (orient || k % 3 === 0) {
      // charrette bâchée à deux roues, son timon
      const col = orient ? [0xc7563e, 0xd9a43c, 0x2f6e6a, 0xe9e1cf][k % 4] : [A.red, 0x2f4f6f, A.ochre][k % 3];
      box(0.18, 0.08, 0.28, 0, 0.07, 0, 0x7a5536);
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 6, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 0, 0.15, 0, col);
      for (const n of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 8).rotateZ(Math.PI / 2), -0.02, 0.07, n, 0x5a3e2a);
      box(0.015, 0.015, 0.22, 0.22, 0.06, 0, 0x5a3e2a);
      return;
    }
    // pousse-pousse : siège, capote, deux grandes roues, brancards
    box(0.14, 0.06, 0.14, -0.02, 0.08, 0, A.redDark);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 6, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), -0.06, 0.16, 0, 0x2a2a2e);
    for (const n of [-0.08, 0.08]) add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 8).rotateZ(Math.PI / 2), -0.02, 0.075, n, 0x3a2a20);
    for (const n of [-0.05, 0.05]) box(0.012, 0.012, 0.2, 0.14, 0.09, n, 0x5a3e2a);
    return;
  }
  if (age === 4) {
    const bus = k % 7 === 3;
    const col = bus ? (orient ? 0xd9a43c : 0x3f7a6a) : [0xc0442a, 0x2f6f9e, 0xe8e4dc, 0x3a3a3e, 0xd9a43c, orient ? 0x2f9e9a : 0x7a2a2a][k % 6];
    const L = bus ? 0.62 : 0.3, H = bus ? 0.17 : 0.07;
    box(0.15, H, L, 0, 0.03, 0, col);
    if (bus) box(0.152, 0.06, L - 0.06, 0, 0.1, 0, 0xf0e2b0, true);
    else box(0.13, 0.065, L * 0.52, 0, 0.1, -0.02, 0x3a4a5a);
    for (const u of [-L * 0.32, L * 0.32]) for (const n of [-0.07, 0.07]) wheel(u, n, 0.032);
    for (const n of [-0.05, 0.05]) box(0.03, 0.02, 0.01, n, 0.05, L / 2, 0xfff2d0, true);
    return;
  }
  // capsule sur coussin, liseré lumineux dessous ; une sur trois vole plus haut
  const col = [0xf6f6f2, orient ? O.turqL : A.pink, 0xd8dee0, orient ? O.gold : A.cyan][k % 4], lift = k % 3 === 1 ? 0.7 : 0.1;
  add(new THREE.CapsuleGeometry(0.07, 0.16, 2, 6).rotateX(Math.PI / 2).scale(1, 0.7, 1), 0, lift + 0.05, 0, col);
  add(new THREE.SphereGeometry(0.055, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, lift + 0.07, 0.02, 0x9fd6e6, true);
  box(0.1, 0.008, 0.24, 0, lift - 0.005, 0, orient ? O.turqL : A.cyan, 'neon');
}

/** Arbre d'avenue (Moderne, Futuriste) : palmier chez les Orientaux, arbre rond sinon */
function tree(p: Parts, orient: boolean, x: number, y: number, z: number, k: number) {
  if (orient) { palm(p, x, z, 0.55 + (k % 3) * 0.06, k, 0x9a8a6a, 0x5f9442, false); return; }
  p.cyl(0.018, 0.026, 0.22, 5, x, y, z, A.darkwood);
  p.add(new THREE.IcosahedronGeometry(0.14, 0).scale(1, 0.85, 1), x, y + 0.3, z, [A.leaf, A.maple, A.blossom, A.pine][k % 4]);
}

/** Les objets des rues d'une ville à l'âge `age` (3 à 5), fondus en une géométrie du monde ; null avant l'Industriel */
export function townProps(plan: TownPlan, age: number, lots: Lot[], h: (x: number, z: number) => number): THREE.BufferGeometry | null {
  if (age < 3) return null;
  const p = new Parts(), orient = plan.people === 'orient', lift = 0.045;
  // une place libre : hors des lots (les maisons au bord de la rue, les monuments)
  const free = (x: number, z: number, r: number) => !lots.some((l) => l.kind !== 'field' && Math.hypot(l.x - x, l.z - z) < Math.hypot(l.w, l.d) * 0.43 + r);
  let k = 0;
  for (const s of plan.streets) {
    if (s.from > age) continue;
    const main = s.w >= 1;
    let carry = hash2(Math.round(s.pts[0][0] * 7), Math.round(s.pts[0][1] * 7), 3) * 1.5, carV = 1 + hash2(Math.round(s.pts[0][0] * 5), 3, Math.round(s.pts[0][1] * 5)) * 2;
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const a = s.pts[i], b = s.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.01) continue;
      const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = -uz, nz = ux, ry = Math.atan2(ux, uz);
      // les réverbères : tous les 1,8 cases, d'un bord puis de l'autre ; les arbres entre eux sur les avenues
      for (let t = carry; t < len; t += 1.8) {
        const side = k % 2 ? 1 : -1, off = s.w / 2 - 0.04;
        const x = a[0] + ux * t + nx * side * off, z = a[1] + uz * t + nz * side * off;
        if (free(x, z, 0.05)) lamp(p, age, orient, x, h(x, z) + lift, z, Math.atan2(-nx * side, -nz * side));
        if (main && age >= 4) {
          const tx = a[0] + ux * (t + 0.9) - nx * side * off, tz = a[1] + uz * (t + 0.9) - nz * side * off;
          if (t + 0.9 < len && free(tx, tz, 0.12)) tree(p, orient, tx, h(tx, tz) + lift, tz, k);
        }
        k++;
      }
      carry = ((carry - len) % 1.8 + 1.8) % 1.8;
      // les véhicules, sur leur file, dans les deux sens
      if (main) {
        for (let t = carV; t < len - 0.2; t += 2.2 + hash2(Math.round(t * 9), i, k) * 2.4) {
          const dir = hash2(Math.round(t * 5), i + 7, k) < 0.5 ? 1 : -1, x = a[0] + ux * t + nx * dir * s.w * 0.22, z = a[1] + uz * t + nz * dir * s.w * 0.22;
          if (free(x, z, 0.1)) vehicle(p, age, orient, x, h(x, z) + lift, z, dir > 0 ? ry : ry + Math.PI, k++);
        }
        carV = 0.8;
      }
      // le marquage au sol (Moderne) ou les liserés lumineux des bords (Futuriste), par tronçons qui suivent le relief
      if (main && age >= 4) {
        for (let t = 0.25; t < len - 0.1; t += age === 4 ? 0.45 : 0.5) {
          if (age === 4) {
            const x = a[0] + ux * t, z = a[1] + uz * t;
            p.add(new THREE.PlaneGeometry(0.03, 0.2).rotateX(-Math.PI / 2), x, h(x, z) + lift + 0.006, z, 0xf2f0e6, ry);
          } else for (const sd of [-1, 1]) {
            const x = a[0] + ux * t + nx * sd * (s.w / 2 - 0.08), z = a[1] + uz * t + nz * sd * (s.w / 2 - 0.08);
            p.add(new THREE.PlaneGeometry(0.025, 0.42).rotateX(-Math.PI / 2), x, h(x, z) + lift + 0.006, z, orient ? O.turqL : A.cyan, ry, 'neon');
          }
        }
      }
    }
  }
  // les places : une couronne de réverbères et quelques bancs
  for (const q of plan.plazas) {
    const n = Math.max(6, Math.round(q.r * 2));
    for (let i = 0; i < n; i++) {
      const an = (i / n) * Math.PI * 2 + 0.2, x = q.x + Math.cos(an) * (q.r - 0.2), z = q.z + Math.sin(an) * (q.r - 0.2);
      if (!free(x, z, 0.05)) continue;
      lamp(p, age, orient, x, h(x, z) + lift, z, an + Math.PI);
      const bx = q.x + Math.cos(an + 0.15) * (q.r - 0.3), bz = q.z + Math.sin(an + 0.15) * (q.r - 0.3);
      if (i % 2 === 0 && free(bx, bz, 0.1)) {
        const y = h(bx, bz) + lift, ry = -an;
        p.box(0.22, 0.02, 0.07, bx, y + 0.06, bz, age >= 5 ? 0xf2f0ea : 0x7a5536, ry);
        p.box(0.02, 0.06, 0.06, bx + Math.sin(ry + Math.PI / 2) * 0.09, y, bz + Math.cos(ry + Math.PI / 2) * 0.09, 0x3a3a3e, ry);
        p.box(0.02, 0.06, 0.06, bx - Math.sin(ry + Math.PI / 2) * 0.09, y, bz - Math.cos(ry + Math.PI / 2) * 0.09, 0x3a3a3e, ry);
      }
    }
  }
  if (!p.body.length) return null;
  const { body, glow } = p.build(false);
  return mergeLit(body, glow) ?? body;
}
