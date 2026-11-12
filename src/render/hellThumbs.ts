import * as THREE from 'three';
import type { BaseKind } from '../sim/hell';
import type { ThumbModel } from './thumbs';
import { baseGeo, BASE_FLAG, GATE_HINGE, WALL_E, WALL_W } from './hellBase';
import { baseAgeGeo } from './hellBaseAges';
import { wallPartsAged, gatePartsAged } from './hellWallAges';

/**
 * Les modèles des bâtiments de la base des Enfers pour les vignettes de la barre du bas (source « hell » de `Thumbs`, chargée
 * avec le reste des Enfers) : les mêmes pièces que la vue (`baseAgeGeo`, `wallPartsAged`, `gatePartsAged`), à l'âge du village,
 * mais en matériaux simples (ceux de la vue prennent la lumière des cavernes) et sans animation. La façade regarde -z : on tourne
 * le bâtiment d'un demi-tour pour qu'elle fasse face à la caméra des vignettes. Un pan de mur est un court pan d'est en ouest
 */

let M: { lit: THREE.Material; glow: THREE.Material; field: THREE.Material; flag: THREE.Material } | null = null;
const mats = () => (M ??= {
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  field: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
  flag: new THREE.MeshStandardMaterial({ color: BASE_FLAG, side: THREE.DoubleSide, roughness: 0.9 }),
});

export function hellThumb(id: string, age: number): ThumbModel {
  const kind = id as BaseKind, m = mats(), g = new THREE.Group(), mine: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry | null | undefined, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (kind === 'palisade') {
    // (pièces gardées en cache par la vue : on ne les libère pas)
    const p = wallPartsAged(age, WALL_E | WALL_W);
    add(p.solid, m.lit); add(p.shine, m.glow); add(p.field, m.field);
  } else if (kind === 'gate') {
    const p = gatePartsAged(age);
    add(p.solid, m.lit); add(p.shine, m.glow); add(p.field, m.field);
    add(p.leaf, p.leafField ? m.field : m.lit, GATE_HINGE);
  } else {
    const aged = baseAgeGeo(kind, age);
    const p = aged ?? (() => { const o = baseGeo(kind); return { solid: o.solid, shine: o.shine, flame: null, field: null, spin: [], flag: o.flag, flags: [] as [number, number, number][] }; })();
    mine.push(p.solid, ...[p.shine, p.flame, p.field].filter((x): x is THREE.BufferGeometry => !!x), ...p.spin.map((s) => s.geo));
    add(p.solid, m.lit); add(p.shine, m.glow); add(p.flame, m.glow); add(p.field, m.field);
    for (const s of p.spin) add(s.geo, m.glow, s.x, 0, s.z);
    // les drapeaux, immobiles (le premier, celui de faction, un peu plus grand)
    for (const [i, f] of [p.flag, ...(p.flags ?? [])].entries()) {
      if (!f) continue;
      const k = i === 0 ? 1 : 0.8, cloth = new THREE.PlaneGeometry(0.52 * k, 0.34 * k, 1, 1).translate(0.26 * k, 0, 0);
      mine.push(cloth);
      add(cloth, m.flag, ...f);
    }
  }
  if (!g.children.length) return null;
  g.rotation.y = Math.PI;
  return { obj: g, done: () => { for (const x of mine) x.dispose(); } };
}
