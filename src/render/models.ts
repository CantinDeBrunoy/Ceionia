import * as THREE from 'three';
import { Parts } from './parts';
import { KindId, KINDS } from '../build/catalog';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeFit, hasModel, ModelName } from './assets';
import { hash2 } from '../core/rng';
import { drawRocket } from './rocket';

/**
 * Bâtiments importés (CC0), par sorte puis par âge : leurs variantes ; null ou absent, le modèle procédural. Il ne reste que
 * les petites fermes antiques de Quaternius : les chaumières, forges, églises, moulins, châteaux, immeubles et bureaux des
 * packs KayKit et Kenney, d'un autre style que le reste, ont laissé la place aux modèles dessinés
 */
const IMPORTED: Partial<Record<KindId, (ModelName[] | null)[]>> = {
  farm: [null, ['a_farm', 'a_farm2']],
};
/** Part de la case occupée par un modèle importé (sa plus grande largeur) ; les maisons laissent une ruelle entre voisines */
const FIT: Partial<Record<KindId, number>> = { well: 0.62, mill: 0.9, landmark: 0.95, house: 0.84 };
/**
 * Rangs d'un toit importé : sur chaque pan incliné, des baguettes à hauteurs régulières, d'un ton plus sombre que le pan
 * (ardoises, tuiles ou bottes de chaume en rangs), là où le modèle n'a qu'une grande face lisse
 */
function roofLines(g: THREE.BufferGeometry, step: number): THREE.BufferGeometry | null {
  const pos = g.attributes.position, col = g.attributes.color, out: THREE.BufferGeometry[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), cc = new THREE.Color();
  const m = new THREE.Matrix4(), ax = new THREE.Vector3(), az = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const area = n.length() / 2;
    n.normalize();
    if (n.y < 0.3 || n.y > 0.93 || area < 0.0015) continue;
    if (col) cc.fromBufferAttribute(col, t).multiplyScalar(0.78); else cc.setRGB(0.4, 0.4, 0.45);
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
    for (let h = Math.ceil(lo / step + 0.3) * step; h < hi - step * 0.3; h += step) {
      const pts: THREE.Vector3[] = [];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) if ((p.y - h) * (q.y - h) < 0) pts.push(p.clone().lerp(q, (h - p.y) / (q.y - p.y)));
      if (pts.length < 2) continue;
      const len = pts[0].distanceTo(pts[1]);
      if (len < 0.02) continue;
      ax.subVectors(pts[1], pts[0]).normalize();
      az.crossVectors(ax, n).normalize();
      const box = new THREE.BoxGeometry(len, 0.006, 0.014).toNonIndexed();
      box.applyMatrix4(m.makeBasis(ax, n, az).setPosition(pts[0].clone().add(pts[1]).multiplyScalar(0.5).addScaledVector(n, 0.004)));
      for (const name of Object.keys(box.attributes)) if (!(name in g.attributes)) box.deleteAttribute(name);
      if (col) box.setAttribute('color', new THREE.BufferAttribute(new Float32Array(box.attributes.position.count * 3).map((_, i) => [cc.r, cc.g, cc.b][i % 3]), 3));
      if (Object.keys(g.attributes).some((name) => !(name in box.attributes))) continue;
      out.push(box);
    }
  }
  return out.length ? mergeGeometries(out, false) : null;
}

/** Modèle importé de la sorte et de l'âge, s'il y en a : façade vers +z, à l'échelle de la case ; fumée au sommet des ateliers */

/**
 * Abords des modèles importés qui, seuls sur l'herbe, faisaient pauvres : margelle dallée, auge, seaux et porteuse d'eau au
 * puits ; caisses, tonneaux et chalands à l'étal du marché ; tables, chopes et buveurs devant la taverne ; épouvantail, gerbes,
 * poules et fermier à la petite ferme
 */
function importedExtras(p: Parts, kind: KindId, age: number) {
  if (kind === 'well' && (age === 1 || age === 2)) {
    p.cyl(0.42, 0.43, 0.008, 14, 0, 0, 0, age === 1 ? 0xd9cdb6 : 0xb8b0a0);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; p.box(0.08, 0.004, 0.05, Math.sin(a) * 0.36, 0.008, Math.cos(a) * 0.36, dark(age === 1 ? 0xd9cdb6 : 0xb8b0a0, 0.86 + (i % 3) * 0.06), a); }
    p.box(0.22, 0.06, 0.08, 0.3, 0.008, 0.32, C.stone, -0.6); p.box(0.19, 0.006, 0.06, 0.3, 0.06, 0.32, C.water, -0.6);
    for (const [x, z] of [[-0.34, 0.2], [-0.4, 0.1]]) { p.cyl(0.025, 0.02, 0.04, 7, x, 0.008, z, C.wood); p.cyl(0.026, 0.026, 0.005, 7, x, 0.03, z, C.darkwood); }
    figure(p, -0.28, 0.34, age === 1 ? 0xf2ead8 : 0x8a5a3a, 2.4, false, 0x2a2420);
    p.cyl(0.016, 0.022, 0.05, 7, -0.24, 0.1, 0.3, age === 1 ? C.terracotta : 0x9a7a5a);
    for (const [x, z, c] of [[0.38, -0.3, 0xf2a6c8], [0.34, -0.38, 0xf2d24a]] as number[][]) p.sphere(0.03, x, 0.02, z, c, 0, 0.7);
  } else if (kind === 'gather' && age === 2) {
    for (const [x, z] of [[0.4, 0.4], [-0.4, 0.38]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0, z, 0x9a6a44); for (const y of [0.02, 0.07]) p.cyl(0.042, 0.042, 0.008, 8, x, y, z, C.darkwood); }
    p.box(0.08, 0.07, 0.08, 0.32, 0, 0.44, 0xb48a5e, 0.3); p.sphere(0.035, -0.32, 0.03, 0.44, 0xd8c49a, 0, 0.8);
    p.box(0.1, 0.06, 0.07, -0.42, 0, -0.38, C.wood); for (let k = 0; k < 2; k++) p.sphere(0.014, -0.44 + k * 0.03, 0.07, -0.38, C.white);
    figure(p, 0.15, 0.42, 0x3a5a9a, Math.PI); figure(p, -0.12, 0.44, 0xb8443a, Math.PI + 0.3);
    p.cyl(0.03, 0.022, 0.03, 8, -0.09, 0.08, 0.4, 0xc8a070);
  } else if (kind === 'tavern' && age === 2) {
    for (const [x, z] of [[-0.3, 0.32], [0.28, 0.36]]) {
      p.box(0.18, 0.012, 0.09, x, 0.07, z, C.wood); for (const d of [-0.07, 0.07]) p.box(0.012, 0.07, 0.07, x + d, 0, z, C.darkwood);
      for (const s of [-1, 1]) p.box(0.18, 0.012, 0.04, x, 0.045, z + s * 0.08, C.wood);
      for (let k = 0; k < 2; k++) p.cyl(0.012, 0.012, 0.03, 6, x - 0.04 + k * 0.08, 0.082, z, 0x8a5a3a);
    }
    seated(p, -0.34, 0.06, 0.24, 0, 0x8a3a3a); seated(p, 0.3, 0.06, 0.45, Math.PI, 0x3a5a9a, 0x8a5a3a);
    for (const [x, z] of [[0.42, -0.1], [0.42, 0.02]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0, z, 0x9a6a44); p.cyl(0.042, 0.042, 0.008, 8, x, 0.045, z, C.darkwood); }
    p.box(0.03, 0.04, 0.03, -0.42, 0.24, 0.06, 0xffd68a, 0, true);
  } else if (kind === 'farm' && age === 1) {
    p.cyl(0.006, 0.008, 0.26, 4, 0.38, 0, 0.32, C.darkwood); p.box(0.14, 0.012, 0.012, 0.38, 0.2, 0.32, C.darkwood);
    p.box(0.04, 0.06, 0.03, 0.38, 0.15, 0.32, 0xc8a070); p.sphere(0.022, 0.38, 0.23, 0.32, 0xe8d6b0); p.cone(0.035, 0.03, 6, 0.38, 0.245, 0.32, 0xd8b860);
    for (const [x, z] of [[-0.38, -0.36], [-0.3, -0.4], [-0.34, -0.3]]) p.cone(0.035, 0.11, 6, x, 0, z, 0xe0c060);
    for (let k = 0; k < 4; k++) { const x = -0.32 + (k % 2) * 0.07, z = 0.34 + Math.floor(k / 2) * 0.06; p.box(0.025, 0.022, 0.035, x, 0, z, C.white, k); p.box(0.01, 0.01, 0.01, x, 0.022, z + 0.015, 0xd84a3e); }
    figure(p, 0.2, 0.4, 0x8a6a4a, Math.PI);
  }
}

function importedModel(kind: KindId, age: number, v: number, size: number): Model | null {
  const names = IMPORTED[kind]?.[age]?.filter(hasModel);
  if (!names?.length) return null;
  const name = names[v % names.length], key = `m|${kind}|${age}|${name}|${size}`;
  const known = cache.get(key);
  if (known) return known;
  let body = bakeFit(name, size * (FIT[kind] ?? 0.92), 0);
  if (!body) return null;
  // autour des modèles importés posés seuls (le puits, l'étal du marché, la taverne, la petite ferme) : des abords dessinés
  let glow: THREE.BufferGeometry | null = null;
  const ex = new Parts();
  importedExtras(ex, kind, age);
  if (ex.body.length) { const b = ex.build(); body = mergeGeometries([body, b.body], false) ?? body; glow = b.glow; }
  // les toits des maisons prennent des rangs d'ardoises, de tuiles ou de chaume
  if (kind === 'house') { const lines = roofLines(body, 0.032); if (lines) body = mergeGeometries([body, lines], false) ?? body; }
  const m: Model = { body, glow, smoke: [], rotor: null, vane: null };
  cache.set(key, m);
  return m;
}

export const C = {
  cream: 0xf4e8d0, pink: 0xf1c9c4, mint: 0xcde8d6, sky: 0xcfe2f0, butter: 0xf8e5a6, lav: 0xd8cdea, white: 0xf7f3ec,
  terracotta: 0xe39a86, thatch: 0xdcc080, slate: 0x8e9bb4, brown: 0xb48a68, red: 0xd8786c, teal: 0x86c4b8,
  wood: 0xb08968, darkwood: 0x7a6355, stone: 0xcfcac2, darkstone: 0x9d9890, dirt: 0xcdb08a, gold: 0xe8c66a,
  green: 0x9ccf92, darkgreen: 0x7fb87f, door: 0x7a5a48, win: 0x9db4c6, brick: 0xd98f80, darkbrick: 0xb4685c,
  glass: 0xbfe0ee, roofdark: 0x6f7c96, metal: 0x9aa3ad, flame: 0xffb15c, water: 0x8fd0e0, hide: 0xd9b99b,
};
const WALLS = [C.cream, C.pink, C.mint, C.sky, C.butter, C.lav];
const ROOFS = [C.terracotta, C.teal, C.red, C.slate, C.brown, C.thatch];

export interface ModelOpts {
  v: number; L: boolean; R: boolean; F: boolean;
  /** resté en 1 × 1 (ancienne partie) */
  small?: boolean;
  /** maisons : variante du bloc de maisons accolées, commune à tout le bloc (la couleur de son toit) */
  row?: number;
  /** tours de l'âge futuriste : rang dans la ligne d'horizon, de 0 (immeuble bas) à 3 (gratte-ciel) */
  tier?: number;
}

/** Bâtiments passés en 2 × 2 dont le modèle procédural est dessiné pour une case : on l'agrandit d'autant */
const UPSCALE: KindId[] = ['temple', 'workshop', 'mill'];
const UP = 1.85;
/** Géométries d'un bâtiment, et sommets de ses cheminées (x, y, z, sorte : 0 foyer, 1 feu de bois, 2 forge ou usine) */
export interface Model {
  body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; smoke: number[];
  /** pièce qui tourne (ailes, pales) : centrée sur son moyeu `pivot`, autour de `axis`, à `speed` radians par seconde */
  rotor?: { geo: THREE.BufferGeometry; pivot: [number, number, number]; axis: [number, number, number]; speed: number } | null;
  /**
   * tête qui se tourne face au vent (éolienne, roue de pompage) autour de l'axe vertical `pivot` (x, z) : le rotor y est
   * accroché, avec la tête `geo` (gouvernail, nacelle) ou tout le modèle (`whole`) ; `face` : cap du rotor dans le modèle
   */
  vane?: { pivot: [number, number]; face: number; whole: boolean; geo: THREE.BufferGeometry | null } | null;
  /** pièces qui se balancent (drapeaux, bannières, enseignes pendues, linge, cloches) autour d'un axe passant par `pivot` */
  sways?: { geo: THREE.BufferGeometry; glow?: THREE.BufferGeometry | null; pivot: [number, number, number]; axis: [number, number, number]; amp: number; freq: number; spin?: number; steady?: boolean }[];
  /** personnages animés (voir `animPart`) : une seule géométrie, que le shader des foules anime */
  crowd?: THREE.BufferGeometry | null;
}

/**
 * Sol du modèle en cours : la plupart des bâtiments n'ont plus de dalle pleine (un aplat gris sur toute la parcelle) ; le vrai
 * sol (herbe, sable du biome) se voit entre leurs détails, et le modèle descend d'autant pour ne pas flotter
 */
let sinkOut = 0;
function sink(h: number) { sinkOut = Math.max(sinkOut, h); }

/**
 * Pièces du modèle en cours qui se balancent : dessinées autour de leur `pivot` (en 0, 0, 0), elles oscillent autour de `axis`
 * d'au plus `amp` radians, `freq` fois par seconde environ (plus fort quand le vent forcit)
 */
let swayOut: { p: Parts; pivot: [number, number, number]; axis: [number, number, number]; amp: number; freq: number; spin?: number; steady?: boolean }[] = [];
function sway(pivot: [number, number, number], axis: [number, number, number], amp: number, freq: number) {
  const s = { p: new Parts(), pivot, axis, amp, freq };
  swayOut.push(s);
  return s.p;
}
/** Pièce qui se balance comme un manège (bateau pirate, nacelle), à son rythme, sans dépendre du vent */
function swing(pivot: [number, number, number], axis: [number, number, number], amp: number, freq: number) {
  const s = { p: new Parts(), pivot, axis, amp, freq, steady: true };
  swayOut.push(s);
  return s.p;
}
/**
 * Personnages animés du modèle en cours : chaque pièce (corps et tête, bras, jambes) est dessinée à part, avec son pivot, son
 * axe, l'amplitude, la fréquence et la phase de son balancement et la hauteur de son rebond ; le shader des foules les anime
 * (`crowdMat`). Elles sont réunies dans `Model.crowd`. Seuls les personnages posés sur le modèle lui-même s'animent (pas ceux
 * d'une pièce qui tourne ou se balance déjà)
 */
let crowdOut: THREE.BufferGeometry[] = [];
let mainParts: Parts | null = null;
type V3 = [number, number, number];
function animPart(draw: (q: Parts) => void, pivot: V3, axis: V3, amp: number, freq: number, phase: number, bounce = 0) {
  const q = new Parts();
  draw(q);
  if (!q.body.length) return;
  const g = q.build(false).body, n = g.attributes.position.count;
  const piv = new Float32Array(n * 3), ax = new Float32Array(n * 3), an = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { piv.set(pivot, i * 3); ax.set(axis, i * 3); an.set([amp, freq, phase, bounce], i * 4); }
  g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
  g.setAttribute('aAxis', new THREE.BufferAttribute(ax, 3));
  g.setAttribute('aAnim', new THREE.BufferAttribute(an, 4));
  crowdOut.push(g);
}
/**
 * Échelle des personnages du modèle en cours : un modèle dessiné pour une case puis agrandi (UPSCALE) les dessine d'autant
 * plus petits, pour qu'une fois agrandis ils gardent la taille des habitants qui marchent (le prêtre et la fidèle du temple
 * antique, le technicien de l'éolienne)
 */
let lifeK = 1, lifeIn = false;
/**
 * Dessine (`draw`) des personnages, une bête, un véhicule à la taille des habitants, réduits autour de leur pied (x, y, z) dans
 * un modèle agrandi ; `k` : agrandit en plus un dessin fait plus petit qu'un habitant (le potier à son tour). Les pièces animées
 * suivent (pivots, rebonds) ; un personnage dans un groupe déjà ramené à la bonne taille n'est pas réduit deux fois
 */
function lifeSize(p: Parts, x: number, y: number, z: number, draw: () => void, k = 1) {
  if (lifeIn) { draw(); return; }
  const nb = p.body.length, ng = p.glow.length, nc = crowdOut.length;
  lifeIn = true;
  draw();
  lifeIn = false;
  const s = k * lifeK;
  if (Math.abs(s - 1) < 1e-6) return;
  const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
  for (const g of [...p.body.slice(nb), ...p.glow.slice(ng)]) g.applyMatrix4(m);
  const v = new THREE.Vector3();
  for (const g of crowdOut.slice(nc)) {
    g.applyMatrix4(m);
    const pv = g.attributes.aPivot, an = g.attributes.aAnim;
    for (let i = 0; i < pv.count; i++) { v.fromBufferAttribute(pv, i).applyMatrix4(m); pv.setXYZ(i, v.x, v.y, v.z); an.setW(i, an.getW(i) * s); }
  }
}
/** Attitude d'un personnage : il flâne et discute (et gesticule), il acclame bras levés, il court sur place */
type Pose = 'idle' | 'cheer' | 'run';

/** Pièce du modèle en cours qui tourne sans fin autour de `axis` passant par `pivot`, à `speed` tours par seconde (manèges) */
function turning(pivot: [number, number, number], axis: [number, number, number], speed: number) {
  const s = { p: new Parts(), pivot, axis, amp: 0, freq: 0, spin: speed };
  swayOut.push(s);
  return s.p;
}

/** Cheminées du modèle en cours de construction */
let smokeOut: number[] = [];
function smoke(x: number, y: number, z: number, kind: number) { smokeOut.push(x, y, z, kind); }

/** Modèles importés posés sur la parcelle du modèle en cours (ex. la tour de guet KayKit de la caserne médiévale) */
let attachOut: THREE.BufferGeometry[] = [];
/** Pose une variante du modèle importé, large de `width`, en (x, z) ; false s'il n'est pas chargé */
function attach(names: ModelName[], v: number, width: number, x: number, z: number, ry = 0, remap?: (c: THREE.Color) => void, sy = 1, skip?: RegExp): boolean {
  const ok = names.filter(hasModel);
  const g = ok.length ? bakeFit(ok[v % ok.length], width, ry, remap, skip) : null;
  if (!g) return false;
  attachOut.push(g.scale(1, sy, 1).translate(x, 0, z));
  return true;
}

/** Recolore le rouge vif d'un modèle importé (toiles, tuiles) : peaux tannées, chaume… pour la Préhistoire */
const unRed = (to: number) => {
  const t = new THREE.Color(to);
  return (c: THREE.Color) => { if (c.r > c.g * 1.6 && c.r > c.b * 1.6) { const l = c.r * 0.6 + 0.55; c.copy(t).multiplyScalar(Math.min(1.15, l)); } };
};

/** Le dessus du dernier modèle posé (faces tournées vers le ciel au-dessus de `minY`) prend une couleur, nuancée face à face */
function recolorTop(minY: number, color: number) {
  const g = attachOut[attachOut.length - 1], pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); d.fromBufferAttribute(pos, t + 2);
    if ((a.y + b.y + d.y) / 3 < minY || b.clone().sub(a).cross(d.clone().sub(a)).normalize().y < 0.3) continue;
    c.setHex(color).multiplyScalar(0.9 + ((t / 3) % 5) * 0.04);
    for (let j = 0; j < 3; j++) col.setXYZ(t + j, c.r, c.g, c.b);
  }
}

/** La plus haute cheminée du dernier modèle posé fume */
function smokeTop(kind: number) {
  const pos = attachOut[attachOut.length - 1].attributes.position;
  let top = 0;
  for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
  smoke(pos.getX(top), pos.getY(top) + 0.02, pos.getZ(top), kind);
}

/** Soulève le dernier modèle posé (sur un dallage, un socle) */
const lift = (h: number) => { attachOut[attachOut.length - 1].translate(0, h, 0); };

/** Marbre trop blanc : une pierre crème, plus chaude */
const toMarble = (c: THREE.Color) => { if (c.r > 0.85 && c.g > 0.85 && c.b > 0.85) c.setRGB(0.95, 0.91, 0.82); };

/**
 * Toit de tuiles sur le dernier modèle posé : ses pans (faces inclinées au-dessus de `minY`) prennent la couleur des tuiles,
 * puis on y pose des rangées de tuiles couvre-joints, un faîtage, des antéfixes le long des égouts et des acrotères aux angles
 */
function tileRoof(p: Parts, minY: number, color: number) {
  const g = attachOut[attachOut.length - 1], pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color(color);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); d.fromBufferAttribute(pos, t + 2);
    if ((a.y + b.y + d.y) / 3 < minY) continue;
    const ny = Math.abs(b.clone().sub(a).cross(d.clone().sub(a)).normalize().y);
    if (ny < 0.3) continue;
    for (let j = 0; j < 3; j++) col.setXYZ(t + j, c.r, c.g, c.b);
    // les pans inclinés donnent l'emprise du toit, l'égout et le faîte
    if (ny > 0.95) continue;
    for (const v of [a, b, d]) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  }
  if (x0 > x1) return;
  // faîtage le long du plus grand côté ; u le long du faîtage, v en travers des pans
  const alongX = x1 - x0 >= z1 - z0;
  const [u0, u1, v0, v1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  const vc = (v0 + v1) / 2, half = (v1 - v0) / 2, rise = y1 - y0, slope = Math.atan2(rise, half), len = Math.hypot(rise, half);
  const at = (u: number, y: number, v: number): [number, number, number] => (alongX ? [u, y, v] : [v, y, u]);
  const tileC = dark(color, 0.84), capC = dark(color, 0.74), marble = 0xf2ead8;
  const n = Math.max(4, Math.round((u1 - u0) / 0.045));
  for (const side of [-1, 1])
    for (let i = 0; i <= n; i++) {
      const u = u0 + 0.012 + ((u1 - u0 - 0.024) * i) / n, [x, y, z] = at(u, (y0 + y1) / 2 + 0.008, vc + (side * half) / 2);
      if (alongX) p.add(new THREE.BoxGeometry(0.011, 0.011, len * 0.98), x, y, z, tileC, 0, false, 0, side * slope);
      else p.add(new THREE.BoxGeometry(len * 0.98, 0.011, 0.011), x, y, z, tileC, 0, false, -side * slope, 0);
      // antéfixes de marbre au bout d'une rangée sur deux
      if (i % 2 === 0) { const [ex, ey, ez] = at(u, y0 - 0.004, vc + side * half); p.box(0.014, 0.022, 0.014, ex, ey, ez, marble); }
    }
  // faîtage
  const [rx, ry, rz] = at((u0 + u1) / 2, y1 - 0.004, vc);
  p.box(alongX ? u1 - u0 : 0.03, 0.018, alongX ? 0.03 : u1 - u0, rx, ry, rz, capC);
  // acrotères : palmettes aux deux bouts du faîte, petits socles aux angles
  for (const u of [u0 + 0.01, u1 - 0.01]) {
    const [ax, ay, az] = at(u, y1, vc);
    p.cone(0.022, 0.05, 5, ax, ay, az, marble);
    for (const side of [-1, 1]) { const [cx, cy, cz] = at(u, y0, vc + side * half * 0.96); p.sphere(0.014, cx, cy + 0.014, cz, marble); }
  }
}

/** Cyprès : tronc court, flamme vert sombre */
function cypress(p: Parts, x: number, z: number, h = 0.24) {
  p.cyl(0.012, 0.016, 0.05, 5, x, 0, z, C.wood);
  p.cone(h * 0.19, h, 6, x, 0.04, z, C.darkgreen);
}

/** Le bois orange vif du Survival Kit de Kenney devient un bois brun, patiné */
const toWood = (c: THREE.Color) => {
  if (c.r > 0.35 && c.r > c.g * 1.25 && c.g > c.b * 1.3) { const l = 0.55 + c.r * 0.5; c.setRGB(0.42 * l, 0.27 * l, 0.16 * l); }
};
/** Poulailler rouge et blanc des fermes modernes, en bois brut pour les premiers âges */
const toTimber = (c: THREE.Color) => {
  if (c.r > c.g * 1.4) { const l = 0.6 + c.r * 0.4; c.setRGB(0.5 * l, 0.34 * l, 0.22 * l); }
  else if (c.r > 0.8 && c.g > 0.8 && c.b > 0.8) c.setRGB(0.78, 0.66, 0.5);
};
/** Couchages : la natte verte devient une fourrure brune, le coussin une peau claire */
const toFur = (c: THREE.Color) => {
  if (c.g > c.r * 1.15) { if (c.r + c.g + c.b > 1.9) c.setRGB(0.86, 0.78, 0.64); else c.setRGB(0.5, 0.36, 0.24); }
};

/** Assombrit une couleur (sous-faces, bordures) */
const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const SHUTTERS = [C.teal, C.red, C.darkgreen, C.slate];

interface RoofOpts {
  /** largeur des murs (le long du faîtage, x local) et profondeur (z local) */
  w: number; d: number; h: number;
  color: number; wall: number;
  ry?: number;
  /** longueur des pans (débords compris) et décalage de leur centre le long du faîtage */
  len?: number; dx?: number;
  /** débord à l'égout */
  ov?: number;
  /** rangées de tuiles couvre-joints sur les pans */
  tiles?: boolean;
  /** rangs d'ardoises ou de bardeaux, pièce par pièce, de l'égout au faîte */
  courses?: boolean;
}

/** Toit à deux pans épais avec débords ; les pignons gardent la couleur des murs */
function roof(p: Parts, x: number, y: number, z: number, o: RoofOpts) {
  const ry = o.ry ?? 0, len = o.len ?? o.w + 0.12, dx = o.dx ?? 0, ov = o.ov ?? 0.07, t = 0.035;
  p.gable(o.w, o.h, o.d, x, y, z, o.wall, ry);
  const hd = o.d / 2, a = Math.atan2(o.h, hd);
  for (const sg of [1, -1]) {
    const sl = Math.hypot(hd, o.h) + ov;
    const cy = o.h / 2 + Math.cos(a) * t / 2 - Math.sin(a) * ov / 2, cz = sg * (hd / 2 + Math.sin(a) * t / 2 + Math.cos(a) * ov / 2);
    p.add(new THREE.BoxGeometry(len, t, sl).rotateX(sg * a).translate(dx, cy, cz).rotateY(ry), x, y, z, o.color);
    if (o.courses) {
      // rangs décalés, chaque pièce un peu plus claire ou plus sombre : le pan prend le grain des ardoises
      const rows = Math.max(3, Math.round(sl / 0.042)), rl = sl / rows;
      for (let j = 0; j < rows; j++)
        for (let u = -len / 2 + (j % 2 ? 0.035 : 0), i = 0; u < len / 2 - 0.01; i++) {
          const pw = Math.min(0.07 + hash2(j, i, 31) * 0.06, len / 2 - u);
          const pg = new THREE.BoxGeometry(pw - 0.006, 0.007, rl + 0.004).translate(dx + u + pw / 2, t / 2 + 0.0035, -sl / 2 + (j + 0.5) * rl);
          p.add(pg.rotateX(sg * a).translate(0, cy, cz).rotateY(ry), x, y, z, dark(o.color, 0.84 + hash2(i, j, 33 + sg) * 0.24));
          u += pw;
        }
    }
    if (!o.tiles) continue;
    // couvre-joints posés sur le pan, de l'égout au faîte
    const ny = Math.cos(a) * (t / 2 + 0.0055), nz = sg * Math.sin(a) * (t / 2 + 0.0055);
    const n = Math.max(3, Math.round(len / 0.045));
    for (let i = 0; i <= n; i++) {
      const tg = new THREE.BoxGeometry(0.011, 0.011, sl).rotateX(sg * a).translate(dx - len / 2 + 0.015 + (i * (len - 0.03)) / n, cy + ny, cz + nz);
      p.add(tg.rotateY(ry), x, y, z, dark(o.color, 0.84));
    }
  }
  p.add(new THREE.BoxGeometry(len, 0.03, 0.06).translate(dx, o.h + 0.012, 0).rotateY(ry), x, y, z, dark(o.color, 0.82));
}

/** Colonne à l'antique : base, fût, chapiteau */
function column(p: Parts, x: number, z: number, h: number, y = 0, r = 0.032) {
  p.cyl(r * 1.35, r * 1.45, 0.025, 8, x, y, z, C.stone);
  p.cyl(r * 0.92, r * 1.06, h - 0.05, 8, x, y + 0.025, z, 0xf2ead8);
  p.cyl(r * 1.3, r, 0.012, 8, x, y + h - 0.037, z, C.stone);
  p.box(r * 2.5, 0.025, r * 2.5, x, y + h - 0.025, z, C.stone);
}

/**
 * Toit d'un seul pan, en tuiles : dalle inclinée de (w × d), rangées de couvre-joints dans le sens de la pente, faîtage en
 * haut, antéfixes au bas. Pente le long de z (vers -z quand tilt > 0) ou, avec alongX, le long de x
 */
function tiledShed(p: Parts, x: number, y: number, z: number, w: number, d: number, tilt: number, alongX = false) {
  const tc = dark(C.terracotta, 0.84), cap = dark(C.terracotta, 0.74);
  if (!alongX) {
    p.add(new THREE.BoxGeometry(w, 0.025, d), x, y, z, C.terracotta, 0, false, 0, -tilt);
    const n = Math.max(3, Math.round(w / 0.047));
    for (let i = 0; i <= n; i++) p.add(new THREE.BoxGeometry(0.011, 0.011, d), x - w / 2 + 0.015 + (i * (w - 0.03)) / n, y + 0.0185, z, tc, 0, false, 0, -tilt);
    p.box(w, 0.016, 0.026, x, y + 0.004 + (d / 2) * Math.sin(tilt), z + d / 2 * Math.cos(tilt), cap);
    for (let i = 0; i <= n; i += 2) p.box(0.012, 0.02, 0.012, x - w / 2 + 0.015 + (i * (w - 0.03)) / n, y - 0.02 - (d / 2) * Math.sin(tilt), z - d / 2 * Math.cos(tilt), 0xf2ead8);
  } else {
    p.add(new THREE.BoxGeometry(w, 0.025, d), x, y, z, C.terracotta, 0, false, tilt);
    const n = Math.max(3, Math.round(d / 0.047));
    for (let i = 0; i <= n; i++) p.add(new THREE.BoxGeometry(w, 0.011, 0.011), x, y + 0.0185, z - d / 2 + 0.015 + (i * (d - 0.03)) / n, tc, 0, false, tilt);
  }
}

/** Rondin couché le long de x */
function log(p: Parts, len: number, r: number, x: number, y: number, z: number, ry = 0, color = C.wood) {
  p.add(new THREE.CylinderGeometry(r, r, len, 6).rotateZ(Math.PI / 2), x, y + r, z, color, ry);
}

/**
 * Maison de l'époque moderne, façade vers +z, de x0 à x1 (accolée à ses voisines L, R) : maison cube à l'étage bardé de bois
 * en porte-à-faux, grandes baies, panneaux solaires ; pavillon enduit au toit d'ardoise, bow-window et garage ; petit
 * immeuble à balcons vitrés, boutique et son store en rez-de-chaussée, toit-terrasse planté
 */
function modernHouse(p: Parts, o: ModelOpts, x0: number, x1: number, cx: number, d: number, zc: number) {
  const kind = o.v % 3, w = x1 - x0, zf = zc + d / 2;
  const render = [0xf4f0e8, 0xe8e0d4, 0xdfe6ea, 0xf0e2d0][o.v % 4], accent = [0xb07a4e, 0x3c4a54, 0xc8643a, 0x6a8a6a][(o.v >> 1) % 4];
  const frame = 0x3a4048, glass = 0x9fc4dc;
  p.box(w + 0.02, 0.03, d + 0.08, cx, 0, zc, 0xb8b4ac);
  if (kind === 0) {
    // rez-de-chaussée enduit, étage bardé de bois qui avance sur la rue
    p.box(w, 0.3, d, cx, 0.03, zc, render);
    const ux = cx + (o.v % 2 ? 0.03 : -0.03), uw = w * 0.9;
    p.box(uw, 0.28, d + 0.04, ux, 0.33, zc + 0.02, accent);
    for (let x = ux - uw / 2 + 0.03; x < ux + uw / 2 - 0.01; x += 0.04) p.box(0.006, 0.28, 0.004, x, 0.33, zf + 0.041, dark(accent, 0.82));
    // grandes baies cerclées de sombre, bandeau vitré à l'étage
    p.box(w * 0.46, 0.2, 0.012, cx - w * 0.16, 0.07, zf + 0.004, frame); p.box(w * 0.44, 0.18, 0.014, cx - w * 0.16, 0.08, zf + 0.005, glass, 0, true);
    p.box(0.005, 0.18, 0.016, cx - w * 0.16, 0.08, zf + 0.006, frame);
    p.box(uw * 0.7, 0.12, 0.012, ux, 0.41, zf + 0.044, frame); p.box(uw * 0.68, 0.1, 0.014, ux, 0.42, zf + 0.045, glass, 0, true);
    // porte, auvent, numéro, jardinières
    p.box(0.09, 0.2, 0.012, cx + w * 0.3, 0.03, zf + 0.006, frame); p.box(0.004, 0.06, 0.006, cx + w * 0.3 - 0.03, 0.12, zf + 0.013, 0xc4cad2);
    p.box(0.13, 0.012, 0.07, cx + w * 0.3, 0.25, zf + 0.035, frame);
    for (const s of [-1, 1]) { p.box(0.08, 0.04, 0.04, cx + s * w * 0.18 + 0.05, 0.03, zf + 0.04, 0x6a6a6e); p.sphere(0.03, cx + s * w * 0.18 + 0.05, 0.08, zf + 0.04, 0x6fa85a, 0, 0.8); }
    // acrotère, panneaux solaires, groupe de clim
    p.box(uw + 0.02, 0.03, d + 0.06, ux, 0.61, zc + 0.02, dark(render, 0.9));
    for (let k = 0; k < 3; k++) {
      const x = ux - uw * 0.3 + k * uw * 0.3;
      p.add(new THREE.BoxGeometry(uw * 0.26, 0.008, 0.16), x, 0.66, zc - 0.06, 0x2a3a6a, 0, false, 0, -0.35);
      for (let j = 0; j < 3; j++) p.add(new THREE.BoxGeometry(0.003, 0.009, 0.16), x - uw * 0.09 + j * uw * 0.09, 0.661, zc - 0.06, 0x8a9ab8, 0, false, 0, -0.35);
    }
    p.box(0.08, 0.06, 0.06, x0 + 0.08, 0.03, zc - d / 2 + 0.04, 0xd8dce2); p.box(0.05, 0.05, 0.004, x0 + 0.08, 0.035, zc - d / 2 + 0.071, 0x8a8f96);
  } else if (kind === 1) {
    // pavillon enduit, toit d'ardoise sombre, bow-window, porte vitrée, garage à porte sectionnelle
    const h = 0.4;
    p.box(w, h - 0.03, d, cx, 0.03, zc, render);
    roof(p, cx, h, zc, { w, d, h: 0.24, color: 0x4f5966, wall: render, courses: true });
    p.box(w * 0.34, 0.2, 0.08, cx - w * 0.2, 0.06, zf + 0.04, render); p.box(w * 0.32, 0.16, 0.084, cx - w * 0.2, 0.08, zf + 0.04, glass, 0, true);
    for (const s of [-1, 0, 1]) p.box(0.006, 0.16, 0.086, cx - w * 0.2 + s * w * 0.1, 0.08, zf + 0.04, C.white);
    p.box(w * 0.36, 0.012, 0.1, cx - w * 0.2, 0.26, zf + 0.045, 0x4f5966);
    if (w > 0.6) { p.box(0.22, 0.17, 0.012, cx + w * 0.26, 0.03, zf + 0.004, 0xe8e4dc); for (let k = 0; k < 5; k++) p.box(0.22, 0.004, 0.014, cx + w * 0.26, 0.05 + k * 0.032, zf + 0.005, 0xc4c0b8); }
    else { p.box(0.09, 0.2, 0.012, cx + w * 0.22, 0.03, zf + 0.004, 0x5a3e2c); p.box(0.05, 0.1, 0.014, cx + w * 0.22, 0.12, zf + 0.005, glass, 0, true); }
    windows(p, [cx - w * 0.2, cx + w * 0.22], 0.31, zf + 0.004, 0.08, 0.08, C.white);
    p.cyl(0.014, 0.014, 0.12, 6, cx + w * 0.3, h + 0.1, zc - 0.08, 0x8a8f96); p.cyl(0.02, 0.02, 0.01, 6, cx + w * 0.3, h + 0.22, zc - 0.08, 0x5d6168);
    if (!o.F) {
      p.box(w * 0.9, 0.006, 0.12, cx, 0.03, zf + 0.12, 0x8fcf7e);
      hedge(p, cx - w * 0.25, zf + 0.17, w * 0.4, 0.04, 0.05, 0.03);
      p.box(0.012, 0.08, 0.012, cx + w * 0.4, 0.03, zf + 0.15, 0x3c3c40); p.box(0.04, 0.03, 0.05, cx + w * 0.4, 0.11, zf + 0.15, 0x3a6ab8);
    }
  } else {
    // petit immeuble : boutique au rez-de-chaussée (vitrine, store rayé, enseigne), deux étages à balcons vitrés, toit-terrasse
    const tall = !o.L && !o.R, ww = tall ? Math.min(w, 0.66) : w, H = 1.0, shop = of3(o.v, [0xd84a3e, 0x3c7fd8, 0x4fa860, 0xf2c23a]);
    p.box(ww, 0.27, d, cx, 0.03, zc, 0x5d6168);
    p.box(ww * 0.8, 0.17, 0.012, cx, 0.06, zf + 0.004, glass, 0, true); p.box(0.006, 0.17, 0.014, cx + ww * 0.15, 0.06, zf + 0.005, 0x3a4048);
    for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(ww * 0.84 / 6, 0.008, 0.09), cx - ww * 0.42 + (k + 0.5) * (ww * 0.84 / 6), 0.25, zf + 0.045, k % 2 ? C.white : shop, 0, false, 0, 0.35);
    p.box(ww * 0.5, 0.04, 0.012, cx, 0.27, zf + 0.004, shop); for (let k = 0; k < 6; k++) p.box(0.02, 0.02, 0.004, cx - ww * 0.18 + k * ww * 0.07, 0.28, zf + 0.012, C.white);
    p.box(ww, H - 0.3, d, cx, 0.3, zc, render);
    for (let f = 0; f < 2; f++) {
      const y = 0.36 + f * 0.33;
      for (const s of [-1, 1]) {
        const x = cx + s * ww * 0.24;
        p.box(ww * 0.34, 0.2, 0.012, x, y, zf + 0.004, frame); p.box(ww * 0.3, 0.18, 0.014, x, y + 0.01, zf + 0.005, glass, 0, true);
        p.box(ww * 0.4, 0.014, 0.08, x, y - 0.014, zf + 0.04, 0xd8dce2);
        p.box(ww * 0.4, 0.07, 0.004, x, y, zf + 0.079, 0xbfe0ee); p.box(ww * 0.4, 0.006, 0.006, x, y + 0.07, zf + 0.079, 0x8a8f96);
      }
      p.box(0.05, 0.3, 0.006, cx, y - 0.03, zf + 0.003, accent);
    }
    p.box(ww + 0.02, 0.03, d + 0.02, cx, H, zc, dark(render, 0.88));
    p.box(ww * 0.5, 0.04, d * 0.5, cx - ww * 0.15, H + 0.03, zc - 0.05, 0x7fb87f); p.sphere(0.05, cx - ww * 0.25, H + 0.09, zc - 0.05, 0x6fa85a, 0, 0.9);
    p.cyl(0.05, 0.05, 0.09, 8, cx + ww * 0.25, H + 0.03, zc - 0.1, 0x8a8f96); p.cone(0.055, 0.03, 8, cx + ww * 0.25, H + 0.12, zc - 0.1, 0x5d6168);
    p.cyl(0.004, 0.004, 0.2, 4, cx + ww * 0.35, H + 0.03, zc + 0.12, 0x8a8f96);
  }
}
const of3 = (v: number, a: number[]) => a[(v >> 2) % a.length];

/**
 * Immeuble de bureaux moderne : socle vitré du hall et son auvent, tour à mur-rideau (montants, bandeaux de planchers), arête
 * de couleur, enseigne et locaux techniques sur le toit, parvis avec jardinières, mâts et arceaux à vélos
 */
function modernOffice(p: Parts, v: number) {
  const glass = [0x6a8aa8, 0x5a8a8a, 0x7a8aa0][v % 3], band = 0xd8dce2, accent = [0xf28a3c, 0x2ab0b0, 0xd84a3e][v % 3], W = 0.68, D = 0.48, H = 0.84;
  p.box(0.86, 0.012, 0.74, 0, 0, 0.06, 0xc4c0b8);
  // hall vitré en rez-de-chaussée, auvent
  p.box(W, 0.14, D, 0, 0.012, -0.02, 0x3a4048); p.box(W - 0.02, 0.12, D + 0.004, 0, 0.022, -0.02, 0xbfe0ee, 0, true);
  for (let x = -W / 2 + 0.085; x < W / 2; x += 0.085) p.box(0.008, 0.12, D + 0.008, x, 0.022, -0.02, 0x3a4048);
  p.box(0.3, 0.012, 0.12, 0, 0.15, D / 2 + 0.04, 0x3a4048); for (const s of [-1, 1]) p.box(0.008, 0.14, 0.008, s * 0.13, 0.012, D / 2 + 0.09, 0x8a8f96);
  // la tour : verre, montants, bandeaux de planchers, l'arête de couleur
  p.box(W, H - 0.15, D, 0, 0.15, -0.02, glass);
  for (let y = 0.15; y < H; y += 0.1) p.box(W + 0.006, 0.014, D + 0.006, 0, y, -0.02, band);
  for (let x = -W / 2 + 0.06; x < W / 2; x += 0.06) { p.box(0.006, H - 0.15, 0.006, x, 0.15, D / 2 - 0.018, band); p.box(0.006, H - 0.15, 0.006, x, 0.15, -D / 2 - 0.022, band); }
  for (let z = -D / 2 + 0.04; z < D / 2; z += 0.06) for (const s of [-1, 1]) p.box(0.006, H - 0.15, 0.006, s * (W / 2 + 0.002), 0.15, z - 0.02, band);
  for (let y = 0.2; y < H - 0.05; y += 0.1) for (let x = -W / 2 + 0.03; x < W / 2; x += 0.06) if (Math.abs(Math.round(x * 50) + Math.round(y * 30) + v) % 5 === 0) p.box(0.05, 0.06, 0.004, x, y, D / 2 - 0.016, 0xfff1c9, 0, true);
  p.box(0.04, H - 0.15, 0.04, W / 2 - 0.02, 0.15, D / 2 - 0.04, accent);
  // couronnement, enseigne, locaux techniques, antenne
  p.box(W + 0.02, 0.04, D + 0.02, 0, H, -0.02, band);
  p.box(0.3, 0.06, 0.012, -0.1, H + 0.04, D / 2 - 0.02, accent); for (let k = 0; k < 6; k++) p.box(0.03, 0.03, 0.004, -0.22 + k * 0.045, H + 0.055, D / 2 - 0.012, C.white, 0, true);
  p.box(0.2, 0.08, 0.16, 0.16, H + 0.04, -0.1, 0xb8bcc2); for (let k = 0; k < 4; k++) p.box(0.004, 0.06, 0.162, 0.07 + k * 0.05, H + 0.05, -0.1, 0x8a8f96);
  p.cyl(0.04, 0.04, 0.012, 10, 0.16, H + 0.12, -0.1, 0x5d6168);
  p.cyl(0.005, 0.005, 0.24, 4, -0.24, H + 0.04, -0.14, 0x8a8f96); p.box(0.012, 0.012, 0.012, -0.24, H + 0.28, -0.14, 0xd84a3e, 0, true);
  // parvis : jardinières, mâts, vélos
  for (const s of [-1, 1]) { p.box(0.14, 0.05, 0.06, s * 0.3, 0.012, 0.36, 0x8a8f96); p.sphere(0.05, s * 0.3, 0.07, 0.36, 0x6fa85a, 0, 0.8); }
  for (const [x, c] of [[-0.12, 0x3a6ab8], [0, 0xf4f2ee], [0.12, 0xd84a3e]] as number[][]) { p.cyl(0.004, 0.005, 0.36, 4, x, 0.012, 0.4, 0xc4cad2); p.box(0.004, 0.05, 0.07, x, 0.3, 0.435, c); }
  for (let k = 0; k < 3; k++) p.add(new THREE.TorusGeometry(0.02, 0.003, 3, 8, Math.PI), 0.38 + k * 0.03, 0.012, 0.2, 0x8a8f96, Math.PI / 2);
}

/**
 * Église de village romane : nef de pierre aux contreforts et vitraux, toit d'ardoise en rangs, abside ronde au chevet, clocher-
 * porche à abat-sons, cadran et flèche octogonale, croix et coq dorés ; porte en plein cintre sur ses marches ; le cimetière,
 * ses croix et son if, derrière un muret
 */
function villageChurch(p: Parts) {
  const st = 0xd8d0c2, dk = 0xb8ae9e, sl = 0x6f7c96;
  p.box(0.86, 0.012, 0.92, 0, 0, 0, 0xa8c890);
  // la nef et ses contreforts, ses vitraux
  p.box(0.44, 0.34, 0.62, -0.06, 0.012, -0.1, st);
  for (const s of [-1, 1]) {
    stones(p, -0.06 + s * 0.22, -0.1, 0.62, 0.012, 0.35, s * Math.PI / 2, dk, 0.5, 520 + s);
    for (const z of [-0.36, -0.16, 0.04]) { p.box(0.05, 0.24, 0.06, -0.06 + s * 0.245, 0.012, z, dk); p.add(new THREE.BoxGeometry(0.05, 0.06, 0.06), -0.06 + s * 0.245, 0.26, z, dk, 0, false, s * 0.6); }
    [-0.26, -0.06].forEach((z, j) => { p.box(0.012, 0.13, 0.05, -0.06 + s * 0.222, 0.13, z, j ? 0x6a7ad8 : 0xd84a3e, 0, true); p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), -0.06 + s * 0.222, 0.26, z, dk); });
  }
  roof(p, -0.06, 0.352, -0.1, { w: 0.62, d: 0.44, h: 0.26, color: sl, wall: st, ry: Math.PI / 2, ov: 0.03, courses: true });
  // l'abside ronde au chevet, son toit en cul-de-four (elle ne déborde pas de la parcelle : les arbres voisins restent dehors)
  p.cyl(0.15, 0.15, 0.28, 12, -0.06, 0.012, -0.39, st); p.cone(0.165, 0.16, 12, -0.06, 0.29, -0.39, sl);
  for (const a of [-0.6, 0, 0.6]) p.box(0.01, 0.1, 0.03, -0.06 + Math.sin(a) * 0.151, 0.12, -0.39 - Math.cos(a) * 0.151, 0x6a7ad8, a, true);
  // le clocher-porche : tour de pierre, abat-sons, cadran, flèche, croix et coq
  const tx = -0.06, tz = 0.3;
  p.box(0.26, 0.74, 0.26, tx, 0.012, tz, st);
  for (const s of [-1, 1]) stones(p, tx + s * 0.13, tz, 0.26, 0.012, 0.75, s * Math.PI / 2, dk, 0.55, 530 + s);
  stones(p, tx, tz + 0.13, 0.26, 0.3, 0.75, 0, dk, 0.55, 533);
  for (const [qx, qz] of [[-1, 1], [1, 1]]) quoins(p, tx + qx * 0.13, tz + qz * 0.13, 0.012, 0.74, qx, qz, 0xe9e2d4);
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const ox = tx + nx * 0.131, oz = tz + nz * 0.131, ry = Math.atan2(nx, nz);
    p.box(0.08, 0.12, 0.012, ox, 0.56, oz, 0x2a2622, ry);
    for (let k = 0; k < 4; k++) p.box(0.08, 0.008, 0.016, ox, 0.575 + k * 0.026, oz, 0x8a6a4a, ry);
  }
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).rotateX(Math.PI / 2), tx, 0.426, tz + 0.132, 0xf2ece0);
  p.box(0.004, 0.035, 0.004, tx, 0.42, tz + 0.14, 0x2a2622); p.box(0.026, 0.004, 0.004, tx + 0.01, 0.426, tz + 0.14, 0x2a2622);
  p.box(0.28, 0.03, 0.28, tx, 0.75, tz, dk);
  p.cone(0.17, 0.5, 8, tx, 0.78, tz, sl);
  p.box(0.012, 0.12, 0.012, tx, 1.26, tz, C.gold); p.box(0.06, 0.012, 0.012, tx, 1.33, tz, C.gold);
  p.add(new THREE.ConeGeometry(0.012, 0.04, 4).rotateZ(Math.PI / 2), tx + 0.01, 1.39, tz, C.gold);
  // la porte en plein cintre et ses marches, l'œil-de-bœuf au-dessus
  p.box(0.09, 0.15, 0.014, tx, 0.04, tz + 0.132, 0x5a3e2c); p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.016, 10, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), tx, 0.19, tz + 0.132, 0x5a3e2c);
  p.add(new THREE.TorusGeometry(0.058, 0.012, 4, 12, Math.PI), tx, 0.19, tz + 0.136, dk);
  for (let k = 0; k < 3; k++) p.box(0.2 - k * 0.04, 0.014, 0.045, tx, 0.012 + k * 0.014, tz + 0.155 + 0.035 * (2 - k), 0xcfc8ba);
  p.add(new THREE.TorusGeometry(0.03, 0.008, 4, 12), tx, 0.3, tz + 0.133, dk); p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 10).rotateX(Math.PI / 2), tx, 0.3, tz + 0.132, 0xb48ad8, 0, true);
  // le cimetière : muret, croix et stèles, l'if
  p.box(0.012, 0.05, 0.6, 0.38, 0.012, -0.05, dk); p.box(0.2, 0.05, 0.012, 0.29, 0.012, -0.35, dk);
  for (const [x, z, k] of [[0.24, -0.25, 0], [0.32, -0.12, 1], [0.24, 0.0, 1], [0.32, 0.12, 0]] as number[][]) {
    if (k) { p.box(0.012, 0.07, 0.012, x, 0.012, z, 0x9a9488); p.box(0.04, 0.012, 0.012, x, 0.06, z, 0x9a9488); }
    else { p.box(0.04, 0.05, 0.012, x, 0.012, z, 0x9a9488); p.box(0.03, 0.004, 0.06, x, 0.012, z + 0.03, 0x7fa86a); }
  }
  p.cyl(0.015, 0.02, 0.06, 5, 0.3, 0.012, 0.26, C.darkwood); p.cone(0.07, 0.24, 7, 0.3, 0.07, 0.26, 0x3f6a46);
}

/**
 * Château fort (deux cases) : courtines crénelées et leur chemin de ronde, quatre tours rondes à mâchicoulis et toits en
 * poivrière et leurs bannières, châtelet d'entrée à deux tourelles, herse et pont-levis, donjon carré à meurtrières flanqué
 * d'une échauguette ; dans la cour, le puits, une charrette, des bottes de paille
 */
function castle(p: Parts) {
  const st = 0xc8c0b0, dk = 0xa89e8c, roofC = 0x5d6a80, banner = 0x3a6ab8;
  p.cyl(0.9, 0.96, 0.06, 4, 0, 0, 0, 0x8fb87e, false, Math.PI / 4);
  const merlons = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.floor(len / 0.1)), ry = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k <= n; k += 2) { const t = k / n; p.box(0.05, 0.05, 0.05, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, st, ry); }
  };
  // les courtines, crénelées, et leur chemin de ronde
  for (const [x, z, w, d] of [[0, -0.78, 1.4, 0.16], [-0.78, 0, 0.16, 1.4], [0.78, 0, 0.16, 1.4]] as number[][]) {
    p.box(w, 0.42, d, x, 0.06, z, st);
    p.box(w, 0.012, d, x, 0.48, z, dk);
    if (w > d) { stones(p, x, z - d / 2, w, 0.06, 0.48, Math.PI, dk, 0.5, 600); merlons(x - w / 2, z + d / 2 - 0.02, x + w / 2, z + d / 2 - 0.02, 0.48); merlons(x - w / 2, z - d / 2 + 0.02, x + w / 2, z - d / 2 + 0.02, 0.48); }
    else { const sx = Math.sign(x); stones(p, x + sx * w / 2, z, d, 0.06, 0.48, sx * Math.PI / 2, dk, 0.5, 610 + sx); merlons(x + w / 2 - 0.02, z - d / 2, x + w / 2 - 0.02, z + d / 2, 0.48); merlons(x - w / 2 + 0.02, z - d / 2, x - w / 2 + 0.02, z + d / 2, 0.48); }
  }
  // la façade avant, de part et d'autre du châtelet
  for (const s of [-1, 1]) {
    const x = s * 0.48;
    p.box(0.44, 0.42, 0.16, x, 0.06, 0.78, st);
    stones(p, x, 0.86, 0.44, 0.06, 0.48, 0, dk, 0.5, 620 + s);
    merlons(x - 0.22, 0.84, x + 0.22, 0.84, 0.48); merlons(x - 0.22, 0.72, x + 0.22, 0.72, 0.48);
    for (const z of [0.86]) p.box(0.012, 0.06, 0.004, x, 0.26, z + 0.001, 0x2a2622);
  }
  // les tours rondes, leurs mâchicoulis, leurs toits en poivrière, leurs bannières
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    p.cyl(0.19, 0.21, 0.66, 12, x, 0.06, z, st);
    for (let k = 0; k < 3; k++) p.box(0.012, 0.07, 0.004, x + Math.sin(k * 2.1) * 0.195, 0.28 + k * 0.1, z + Math.cos(k * 2.1) * 0.195, 0x2a2622, k * 2.1);
    p.cyl(0.235, 0.2, 0.06, 12, x, 0.66, z, dk);
    for (let k = 0; k < 12; k += 2) p.box(0.05, 0.05, 0.05, x + Math.sin(k * 0.5236) * 0.215, 0.72, z + Math.cos(k * 0.5236) * 0.215, st, k * 0.5236);
    p.cone(0.25, 0.42, 12, x, 0.74, z, roofC);
    p.cyl(0.005, 0.005, 0.16, 4, x, 1.14, z, C.darkwood); p.box(0.004, 0.06, 0.1, x, 1.24, z + 0.05, banner); p.box(0.005, 0.015, 0.1, x, 1.255, z + 0.05, C.gold);
  }
  // le châtelet d'entrée : deux tourelles, la herse, le pont-levis, les blasons
  for (const s of [-1, 1]) {
    p.cyl(0.1, 0.11, 0.62, 10, s * 0.16, 0.06, 0.82, st);
    p.cyl(0.125, 0.1, 0.05, 10, s * 0.16, 0.62, 0.82, dk);
    p.cone(0.14, 0.28, 10, s * 0.16, 0.67, 0.82, roofC);
    p.box(0.05, 0.06, 0.006, s * 0.16, 0.34, 0.925, banner); p.box(0.02, 0.06, 0.007, s * 0.16, 0.34, 0.926, C.gold);
  }
  p.box(0.22, 0.48, 0.18, 0, 0.06, 0.8, st);
  merlons(-0.11, 0.88, 0.11, 0.88, 0.54);
  p.box(0.12, 0.2, 0.012, 0, 0.06, 0.891, 0x2a2622);
  for (let k = 0; k < 4; k++) p.box(0.006, 0.18, 0.006, -0.045 + k * 0.03, 0.12, 0.897, 0x4a4a4e);
  for (let k = 0; k < 4; k++) p.box(0.12, 0.006, 0.006, 0, 0.14 + k * 0.035, 0.897, 0x4a4a4e);
  p.box(0.14, 0.014, 0.24, 0, 0.06, 1.0, C.wood); for (let k = 0; k < 5; k++) p.box(0.14, 0.004, 0.006, 0, 0.074, 0.9 + k * 0.05, C.darkwood);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.004, 0.004, 0.3), s * 0.06, 0.2, 0.96, 0x3c3c40, 0, false, 0, -0.55);
  // le donjon carré, ses meurtrières, ses créneaux, son échauguette, sa bannière
  p.box(0.5, 0.88, 0.5, 0, 0.06, -0.18, st);
  for (const s of [-1, 1]) stones(p, s * 0.25, -0.18, 0.5, 0.06, 0.94, s * Math.PI / 2, dk, 0.5, 640 + s);
  stones(p, 0, 0.07, 0.5, 0.06, 0.94, 0, dk, 0.5, 643);
  for (const y of [0.3, 0.55, 0.78]) for (const x of [-0.12, 0.12]) p.box(0.016, 0.07, 0.004, x, y, 0.071, 0x2a2622);
  p.box(0.54, 0.03, 0.54, 0, 0.94, -0.18, dk);
  merlons(-0.25, 0.06, 0.25, 0.06, 0.97); merlons(-0.25, -0.42, 0.25, -0.42, 0.97); merlons(-0.25, -0.42, -0.25, 0.06, 0.97); merlons(0.25, -0.42, 0.25, 0.06, 0.97);
  p.cyl(0.07, 0.04, 0.2, 8, 0.25, 0.82, 0.06, st); p.cone(0.09, 0.2, 8, 0.25, 1.02, 0.06, roofC);
  p.cyl(0.006, 0.006, 0.3, 4, -0.1, 0.97, -0.3, C.darkwood); p.box(0.005, 0.1, 0.16, -0.1, 1.15, -0.22, banner); p.box(0.006, 0.03, 0.16, -0.1, 1.17, -0.22, C.gold);
  // la cour : le puits, une charrette, des bottes de paille
  p.cyl(0.07, 0.07, 0.07, 10, -0.45, 0.06, 0.35, C.stone); p.cyl(0.055, 0.055, 0.005, 10, -0.45, 0.13, 0.35, C.water);
  for (const s of [-1, 1]) p.box(0.012, 0.14, 0.012, -0.45 + s * 0.06, 0.13, 0.35, C.darkwood); p.box(0.14, 0.012, 0.012, -0.45, 0.27, 0.35, C.darkwood);
  p.box(0.16, 0.05, 0.1, 0.45, 0.1, 0.35, C.wood); for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 8).rotateZ(Math.PI / 2), 0.45 + s * 0.085, 0.1, 0.35, C.darkwood);
  for (const [x, z] of [[0.5, 0.15], [0.42, 0.12]]) p.cyl(0.04, 0.04, 0.06, 8, x, 0.06, z, 0xd8c06a);
}

function house(p: Parts, age: number, o: ModelOpts) {
  const wall = WALLS[o.v % 6], roofC = ROOFS[(o.v * 5 + 2) % 6];
  if (age === 0) { prehistoricHut(p, o.v); return; }
  const x0 = -0.36 - (o.L ? 0.14 : 0), x1 = 0.36 + (o.R ? 0.14 : 0);
  const w = x1 - x0, cx = (x0 + x1) / 2, d = 0.5, zc = -0.04;
  const zf = zc + d / 2 + 0.006;
  const rw = w + (o.L ? 0 : 0.08) + (o.R ? 0 : 0.08), rcx = cx + ((o.R ? 0 : 0.08) - (o.L ? 0 : 0.08)) / 2;
  if (age === 4) { modernHouse(p, o, x0, x1, cx, d, zc); return; }
  if (age === 2) { medievalHouse(p, o, x0, x1, cx, d, zc, rw, rcx); return; }
  if (age === 3) { industrialHouse(p, o, x0, x1, cx, d, zc, rw, rcx); return; }
  if (age === 1) { antiqueHouse(p, o, x0, x1, cx, d, zc, rw, rcx); return; }
  const h = age === 3 ? 0.55 : 0.32;
  const wc = age === 3 ? C.brick : wall;
  const rc = age === 3 ? C.slate : roofC;
  const frame = age === 3 ? C.white : C.wood;
  // soubassement de pierre, murs, toit
  p.box(w + 0.03, 0.05, d + 0.03, cx, 0, zc, age === 3 ? C.darkstone : C.stone);
  p.box(w, h - 0.05, d, cx, 0.05, zc, wc);
  const roofH = age === 3 ? 0.3 : 0.22;
  roof(p, cx, h, zc, { w, d, h: roofH, color: rc, wall: wc, len: rw, dx: rcx - cx });
  // cheminée
  if (age === 3) {
    p.box(0.09, 0.32, 0.09, rcx + rw * 0.25, h + 0.05, zc, C.darkbrick);
    p.box(0.11, 0.03, 0.11, rcx + rw * 0.25, h + 0.37, zc, C.darkstone);
    smoke(rcx + rw * 0.25, h + 0.42, zc, 0);
  } else if (o.v % 2 === 0) {
    p.box(0.08, roofH + 0.1, 0.08, rcx + rw * 0.27, h, zc - 0.1, C.stone);
    p.box(0.1, 0.025, 0.1, rcx + rw * 0.27, h + roofH + 0.1, zc - 0.1, C.darkstone);
    smoke(rcx + rw * 0.27, h + roofH + 0.15, zc - 0.1, 0);
  }
  // porte : encadrement, battant, marche
  p.box(0.155, 0.215, 0.014, cx, 0, zf - 0.003, frame);
  p.box(0.12, 0.19, 0.02, cx, 0, zf, C.door);
  p.box(0.2, 0.025, 0.07, cx, 0, zf + 0.035, C.stone);
  // fenêtres : cadre, vitre (s'allume la nuit), appui, volets au Moyen Âge
  const win = (x: number, y: number) => {
    p.box(0.135, 0.155, 0.014, x, y - 0.018, zf - 0.003, frame);
    p.box(0.1, 0.12, 0.02, x, y, zf, C.win, 0, true);
    p.box(0.16, 0.022, 0.045, x, y - 0.03, zf + 0.012, frame);
  };
  const floors = age === 3 ? [0.14, 0.36] : [0.14];
  const off = 0.23;
  for (const y of floors)
    for (const sx of [-off, off]) {
      const wx = cx + sx * (w > 0.9 ? 1.2 : 1);
      if (Math.abs(wx - x0) < 0.1 || Math.abs(wx - x1) < 0.1) continue;
      win(wx, y);
    }
  if (age === 3) win(cx, 0.36);
  // jardinet clôturé quand la maison ne donne pas sur une route
  if (!o.F) {
    for (let i = 0; i < 5; i++) p.box(0.03, 0.1, 0.03, -0.4 + i * 0.2, 0, 0.46, C.wood);
    p.box(0.84, 0.025, 0.02, 0, 0.06, 0.46, C.wood);
    p.sphere(0.045, -0.2, 0.03, 0.37, C.pink, 0, 0.8);
    p.sphere(0.04, 0.24, 0.03, 0.36, C.butter, 0, 0.8);
    p.sphere(0.05, 0.36, 0.03, 0.33, C.darkgreen, 0, 0.8);
  }
}

/** Huttes de la Préhistoire, trois variantes : hutte ronde de clayonnage au chaume épais, maison longue, tipi de peaux peint */
// ---------- Vie du campement préhistorique : petits objets posés autour des huttes et des abris ----------

/** Séchoir : deux perches fourchues et leur traverse, lanières de viande ou poissons pendus */
function dryingRack(p: Parts, x: number, z: number, ry: number, fish = false) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number): [number, number] => [x + u * c, z - u * s];
  for (const u of [-0.12, 0.12]) { const [px, pz] = at(u); p.cyl(0.009, 0.011, 0.22, 4, px, 0, pz, C.darkwood); p.add(new THREE.BoxGeometry(0.006, 0.05, 0.006), px + 0.008, 0.22, pz, C.darkwood, ry, false, 0.4); }
  p.add(new THREE.BoxGeometry(0.28, 0.012, 0.012), x, 0.21, z, C.wood, ry);
  for (let k = 0; k < 5; k++) {
    const [px, pz] = at(-0.09 + k * 0.045);
    if (fish) { p.add(new THREE.BoxGeometry(0.016, 0.07, 0.006), px, 0.165, pz, 0xb8c2c8, ry); p.add(new THREE.ConeGeometry(0.014, 0.025, 3), px, 0.125, pz, 0x9aa4aa, ry, false, Math.PI); }
    else p.add(new THREE.BoxGeometry(0.018, 0.08 + (k % 2) * 0.02, 0.006), px, 0.16 - (k % 2) * 0.01, pz, k % 2 ? 0x9a3a2a : 0x7a2a22, ry);
  }
}

/** Peau tendue sur son cadre de perches, lacée, tenue par une jambe de force */
function hideFrame(p: Parts, x: number, z: number, ry: number) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const u of [-0.1, 0.1]) p.box(0.012, 0.24, 0.012, x + u * c, 0, z - u * s, C.darkwood, ry);
  for (const y of [0.03, 0.21]) p.add(new THREE.BoxGeometry(0.22, 0.012, 0.012), x, y, z, C.darkwood, ry);
  p.add(new THREE.BoxGeometry(0.17, 0.15, 0.006), x, 0.12, z, C.hide, ry);
  p.add(new THREE.BoxGeometry(0.09, 0.07, 0.007), x, 0.12, z, dark(C.hide, 0.82), ry);
  for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.004, 0.004, 0.012), x + (-0.075 + k * 0.05) * c, 0.205, z - (-0.075 + k * 0.05) * s, 0x5a4636, ry);
  p.add(new THREE.BoxGeometry(0.008, 0.24, 0.008).translate(0, 0.12, 0), x + s * 0.07, 0, z + c * 0.07, C.darkwood, ry, false, 0, -0.35);
}

/** Foyer : cercle de pierres, braises qui rougeoient, broche sur deux fourches et sa pièce de viande ; il fume */
function hearth(p: Parts, x: number, z: number, ry = 0) {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; p.sphere(0.022, x + Math.cos(a) * 0.065, 0.008, z + Math.sin(a) * 0.065, i % 2 ? C.stone : C.darkstone, 0, 0.7); }
  p.box(0.06, 0.02, 0.06, x, 0.004, z, 0x3a2a22); p.box(0.04, 0.03, 0.04, x, 0.01, z, C.flame, 0.5, true);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const u of [-0.08, 0.08]) p.cyl(0.006, 0.007, 0.13, 4, x + u * c, 0, z - u * s, C.darkwood);
  p.add(new THREE.BoxGeometry(0.2, 0.008, 0.008), x, 0.13, z, C.wood, ry);
  p.add(new THREE.BoxGeometry(0.05, 0.03, 0.03), x, 0.118, z, 0x8a3a26, ry);
  smoke(x, 0.14, z, 1);
}

/** Panier tressé, plein de baies ou de grains */
function wickerBasket(p: Parts, x: number, z: number, fill: number, s = 1) {
  p.cyl(0.04 * s, 0.03 * s, 0.05 * s, 7, x, 0, z, 0xb08a58);
  p.cyl(0.042 * s, 0.042 * s, 0.008 * s, 7, x, 0.05 * s, z, 0x8a6a40);
  for (let k = 0; k < 5; k++) p.sphere(0.012 * s, x + Math.cos(k * 1.3) * 0.018 * s, 0.05 * s, z + Math.sin(k * 1.3) * 0.018 * s, fill, 0);
}

/** Meule à grain : la pierre plate creusée et la molette */
function quern(p: Parts, x: number, z: number, ry = 0) {
  p.add(new THREE.BoxGeometry(0.13, 0.03, 0.08), x, 0.015, z, C.darkstone, ry);
  p.add(new THREE.BoxGeometry(0.1, 0.006, 0.05), x, 0.032, z, 0xd9c49a, ry);
  p.add(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 6).rotateZ(Math.PI / 2), x, 0.05, z, C.stone, ry);
}

/** Lances appuyées contre un mur ou une perche, pointes de silex */
function spears(p: Parts, x: number, z: number, ry: number, n = 2) {
  for (let k = 0; k < n; k++) {
    const u = (k - (n - 1) / 2) * 0.04, px = x + u * Math.cos(ry), pz = z - u * Math.sin(ry);
    p.add(new THREE.CylinderGeometry(0.005, 0.006, 0.36, 4).translate(0, 0.18, 0), px, 0, pz, C.wood, ry, false, 0, -0.2);
    p.add(new THREE.ConeGeometry(0.012, 0.04, 4).translate(0, 0.38, 0), px, 0, pz, C.darkstone, ry, false, 0, -0.2);
  }
}

/** Crâne d'aurochs et ses cornes, accroché au-dessus d'une porte */
function skull(p: Parts, x: number, y: number, z: number, ry = 0) {
  p.add(new THREE.BoxGeometry(0.05, 0.04, 0.03), x, y, z, 0xf0e8d8, ry);
  for (const s2 of [-1, 1]) p.add(new THREE.ConeGeometry(0.01, 0.07, 4).rotateZ(-s2 * 1.2), x + s2 * 0.045 * Math.cos(ry), y + 0.02, z - s2 * 0.045 * Math.sin(ry), 0xe8dcc0, ry);
}

/** Pots de terre cuite, un peu de travers */
function pots(p: Parts, x: number, z: number, n = 2) {
  for (let k = 0; k < n; k++) { const px = x + (k % 2) * 0.06, pz = z + Math.floor(k / 2) * 0.06 - (k % 2) * 0.02; p.cyl(0.03 - k * 0.003, 0.024, 0.055, 7, px, 0, pz, k % 2 ? 0x9c6445 : 0xb5764f); p.cyl(0.024, 0.03, 0.012, 7, px, 0.055, pz, 0x8a5a3e); }
}

function prehistoricHut(p: Parts, v: number) {
  const straw = [0xe2c472, 0xd9b964, 0xe8cf86][v % 3], strawDark = dark(straw, 0.78), wattle = 0xc59f72, stake = 0x7a5a3e;
  const ring = (n: number, r: number, y: number) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; p.sphere(0.03 + (i % 3) * 0.006, Math.cos(a) * r, y, Math.sin(a) * r, i % 2 ? C.stone : C.darkstone, 0, 0.6); } };
  if (v % 3 === 0) {
    // hutte ronde : mur de clayonnage cerclé, pieux qui dépassent, chaume en trois couches, perches croisées au faîte
    ring(12, 0.34, 0.01);
    p.cyl(0.3, 0.32, 0.26, 10, 0, 0, -0.02, wattle);
    for (const y of [0.07, 0.17]) p.add(new THREE.CylinderGeometry(0.316 - y * 0.06, 0.318 - y * 0.06, 0.03, 10, 1, true), 0, y, -0.02, dark(wattle, 0.75));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.31; p.cyl(0.011, 0.013, 0.3, 4, Math.cos(a) * 0.318, 0, Math.sin(a) * 0.318 - 0.02, stake); }
    p.cone(0.47, 0.14, 10, 0, 0.21, -0.02, strawDark);
    p.cone(0.44, 0.3, 10, 0, 0.25, -0.02, straw);
    p.cone(0.3, 0.26, 10, 0, 0.42, -0.02, dark(straw, 0.92));
    p.cone(0.14, 0.16, 8, 0, 0.6, -0.02, strawDark);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.26, 4), s * 0.03, 0.78, -0.02, C.darkwood, 0, false, s * 0.38);
    smoke(0, 0.8, -0.02, 1);
    // porte : linteau, ouverture sombre, peau relevée
    p.box(0.16, 0.025, 0.05, 0, 0.21, 0.29, C.darkwood);
    p.box(0.12, 0.2, 0.03, 0, 0, 0.3, 0x3d2c22);
    p.box(0.07, 0.15, 0.012, 0.075, 0.05, 0.315, C.hide, 0.15);
    // crâne d'aurochs au-dessus de la porte, herbes qui sèchent, séchoir à viande, foyer, panier de baies
    skull(p, 0, 0.27, 0.31);
    for (let k = 0; k < 3; k++) p.box(0.012, 0.05, 0.012, -0.12 + k * 0.03, 0.2, 0.3, [0x7fae5a, 0x9a8a4a, 0x6f9e4e][k]);
    dryingRack(p, -0.34, -0.32, 0.7);
    hearth(p, 0.3, -0.36, 0.3);
    wickerBasket(p, -0.4, 0.1, 0xb8323a);
  } else if (v % 3 === 1) {
    // maison longue : murs bas de clayonnage, grand toit de chaume qui descend presque au sol, cornes de perches aux pignons
    p.box(0.66, 0.035, 0.44, 0, 0, -0.04, C.darkstone);
    p.box(0.62, 0.17, 0.4, 0, 0.03, -0.04, wattle);
    for (const z of [0.161, -0.241]) for (let x = -0.27; x <= 0.27; x += 0.09) p.box(0.016, 0.2, 0.016, x, 0.02, z, stake);
    roof(p, 0, 0.2, -0.04, { w: 0.62, d: 0.4, h: 0.36, color: straw, wall: wattle, len: 0.78, ov: 0.12 });
    p.box(0.8, 0.04, 0.06, 0, 0.555, -0.04, strawDark);
    // rangs de chaume sur chaque pan
    const ang = Math.atan2(0.36, 0.2);
    for (const s of [-1, 1]) for (const f of [0.18, 0.46, 0.74]) p.add(new THREE.BoxGeometry(0.79, 0.02, 0.06).rotateX(s * ang), 0, 0.2 + f * 0.36 + 0.012, -0.04 + s * ((1 - f) * 0.2 + 0.016), strawDark);
    for (const s of [-1, 1]) for (const k of [-1, 1]) p.add(new THREE.CylinderGeometry(0.01, 0.012, 0.22, 4), s * 0.37, 0.6, -0.04 + k * 0.03, C.darkwood, 0, false, 0, k * 0.5);
    smoke(0.18, 0.6, -0.04, 1);
    p.box(0.13, 0.17, 0.03, 0, 0.02, 0.165, 0x3d2c22);
    p.box(0.17, 0.025, 0.04, 0, 0.19, 0.17, C.darkwood);
    // séchoir à poissons, peau tendue, foyer, meule, lances contre le mur
    dryingRack(p, 0.3, 0.34, 0, true);
    hideFrame(p, -0.38, -0.38, 0.4);
    hearth(p, 0.42, -0.08, 1.2);
    quern(p, -0.42, 0.06, 0.4);
    spears(p, -0.2, 0.19, 0, 3);
  } else {
    // tipi de peaux peint de bandes d'ocre, perches au sommet, rabat ouvert
    ring(10, 0.3, 0.01);
    p.add(new THREE.ConeGeometry(0.3, 0.62, 9, 1, true), 0, 0.31, -0.02, C.hide);
    for (const [y, r, c] of [[0.1, 0.26, 0xb5553c], [0.15, 0.24, 0x7a5a3e], [0.36, 0.13, 0xb5553c]] as [number, number, number][]) p.add(new THREE.CylinderGeometry(r - 0.012, r, 0.028, 9, 1, true), 0, y, -0.02, c);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.26, 4).rotateZ(-0.35), Math.cos(a) * 0.03, 0.66, Math.sin(a) * 0.03 - 0.02, C.darkwood, -a); }
    smoke(0, 0.7, -0.02, 1);
    p.add(new THREE.BoxGeometry(0.11, 0.2, 0.01).translate(0, 0.1, 0), 0, 0, 0.255, 0x3d2c22, 0, false, 0, -0.45);
    p.add(new THREE.BoxGeometry(0.07, 0.18, 0.01).translate(0, 0.09, 0), 0.07, 0, 0.25, C.hide, -0.5, false, 0, -0.45);
    // soleils peints à l'ocre, piquets qui tiennent la toile, lances contre les perches, peau tendue, séchoir, pots
    for (const [a, y] of [[0.6, 0.24], [-0.6, 0.24], [2.4, 0.3], [-2.2, 0.2], [1.6, 0.42], [-1.4, 0.4]]) p.sphere(0.022, Math.sin(a) * (0.3 - y * 0.484), y, Math.cos(a) * (0.3 - y * 0.484) - 0.02, y > 0.35 ? 0x3a2a22 : 0xd8a03a, 0, 1);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; p.box(0.012, 0.03, 0.012, Math.cos(a) * 0.31, 0, Math.sin(a) * 0.31 - 0.02, C.darkwood); }
    spears(p, -0.22, 0.12, 0.6, 2);
    hideFrame(p, -0.38, -0.32, -0.5);
    dryingRack(p, 0.36, -0.3, -0.8);
    pots(p, 0.38, 0.06, 3);
  }
  // bois empilé, pot de terre, peau étendue devant
  log(p, 0.2, 0.026, 0.3, 0, 0.28, 0.5); log(p, 0.2, 0.026, 0.34, 0, 0.22, 0.5); log(p, 0.2, 0.026, 0.32, 0.046, 0.25, 0.5);
  p.cyl(0.035, 0.028, 0.06, 7, -0.28, 0, 0.3, 0xb5764f); p.cyl(0.03, 0.035, 0.015, 7, -0.28, 0.06, 0.3, 0x9c6445);
  p.add(new THREE.CircleGeometry(0.1, 7).rotateX(-Math.PI / 2).scale(1.3, 1, 0.9), -0.12, 0.005, 0.38, C.hide);
}

/**
 * Maison du Moyen Âge : rez-de-chaussée de pierre aux angles chaînés, étage à colombages en encorbellement, toit raide
 * bleu-vert, bleu ou de tuile ; selon la variante, une tourelle d'angle à toit pointu ou une lucarne
 */
/**
 * Maison de l'Antiquité, qui s'accole à ses voisines en rangée : domus aux murs enduits (bandeau rouge en soubassement,
 * porte cloutée entre deux pilastres, fenêtres hautes à barreaux, toit de tuiles et sa cheminée de l'âtre, amphores à la
 * porte, treille et ses raisins), taberna à étage (comptoir de marbre et ses jarres, amphores sur l'étagère, volets repliés,
 * enseigne peinte, toile tendue, balcon de bois à l'étage) ou maison blanche à la grecque (porte et volets bleus, toit en
 * terrasse et son parapet, demi-toit de tuiles, pots de fleurs, escalier extérieur) ; devant, si elle ne donne pas sur la
 * rue, une cour fermée d'un muret, son olivier ou son cyprès
 */
function antiqueHouse(p: Parts, o: ModelOpts, x0: number, x1: number, cx: number, d: number, zc: number, rw: number, rcx: number) {
  const kind = o.v % 3, w = x1 - x0, zf = zc + d / 2, side = o.v % 2 ? 1 : -1;
  const plaster = kind === 2 ? 0xf6f2ea : [0xf0e4c8, 0xe8c89a, 0xf0dcb0, 0xead2a8, 0xe2b48a, 0xf2e6cc][o.v % 6];
  const red = 0xa8443a, wood = 0x6a4a34, stoneC = 0xd8d0c0;
  const H = kind === 1 ? 0.46 : 0.3;
  // soubassement de pierre, murs enduits, corniche
  p.box(w + 0.012, 0.04, d + 0.012, cx, 0, zc, stoneC);
  p.box(w, H - 0.04, d, cx, 0.04, zc, plaster);
  for (let y = 0.1; y < H - 0.03; y += 0.07) p.box(w, 0.004, 0.006, cx, y, zf + 0.002, dark(plaster, 0.93));
  // fenêtre haute et étroite à barreaux (ou à volets de bois)
  const slit = (x: number, y: number, shut = 0) => {
    p.box(0.05, 0.07, 0.012, x, y, zf + 0.003, 0x3a2c24);
    p.box(0.06, 0.012, 0.03, x, y - 0.012, zf + 0.01, stoneC);
    if (shut) for (const s of [-1, 1]) p.box(0.03, 0.075, 0.008, x + s * 0.042, y - 0.003, zf + 0.008, shut);
    else for (const dx of [-0.012, 0.012]) p.box(0.005, 0.07, 0.006, x + dx, y, zf + 0.012, 0x2a2a2e);
  };
  if (kind === 0) {
    // domus : soubassement peint en rouge, porte cloutée entre deux pilastres, fenêtres hautes à barreaux
    p.box(w, 0.07, 0.006, cx, 0.04, zf + 0.002, red);
    const dx = cx;
    for (const s of [-1, 1]) { p.box(0.025, 0.24, 0.025, dx + s * 0.08, 0.04, zf + 0.01, 0xf4eee0); p.box(0.034, 0.02, 0.03, dx + s * 0.08, 0.28, zf + 0.01, 0xf4eee0); }
    p.box(0.2, 0.025, 0.03, dx, 0.28, zf + 0.012, 0xf4eee0);
    p.box(0.13, 0.22, 0.016, dx, 0.04, zf + 0.004, wood);
    p.box(0.004, 0.22, 0.02, dx, 0.04, zf + 0.008, dark(wood, 0.7));
    for (let k = 0; k < 6; k++) p.box(0.008, 0.008, 0.006, dx + (k % 2 ? 0.03 : -0.03), 0.08 + Math.floor(k / 2) * 0.06, zf + 0.014, C.gold);
    p.box(0.17, 0.03, 0.06, dx, 0, zf + 0.03, stoneC);
    for (const s of [-1, 1]) slit(cx + s * w * 0.32, 0.18);
    // amphores à la porte
    for (const [s, h] of [[-1, 0.07], [1, 0.06]]) { p.cyl(0.018, 0.03, h, 8, dx + s * 0.15, 0.01, zf + 0.05, C.terracotta); p.cyl(0.01, 0.016, 0.03, 6, dx + s * 0.15, 0.01 + h, zf + 0.05, C.terracotta); }
  } else if (kind === 1) {
    // taberna : grande baie de la boutique, comptoir de marbre et ses jarres, étagère d'amphores, volets repliés, enseigne
    const bx = cx - side * w * 0.12, bw = w * 0.55;
    p.box(bw, 0.2, 0.012, bx, 0.04, zf + 0.003, 0x2a221c);
    p.box(bw * 0.8, 0.09, 0.08, bx, 0.04, zf + 0.04, 0xece6da); p.box(bw * 0.82, 0.014, 0.09, bx, 0.13, zf + 0.04, 0xf8f4ec);
    for (const k of [-1, 1]) p.cyl(0.02, 0.02, 0.008, 8, bx + k * bw * 0.2, 0.14, zf + 0.04, 0x8a4a2a);
    for (let k = 0; k < 4; k++) p.cyl(0.014, 0.02, 0.05, 6, bx - bw * 0.3 + k * bw * 0.2, 0.16, zf + 0.008, [C.terracotta, 0xc8a070][k % 2]);
    for (const s of [-1, 1]) p.box(0.02, 0.2, 0.05, bx + s * (bw / 2 + 0.012), 0.04, zf + 0.02, wood);
    p.box(bw, 0.035, 0.008, bx, 0.25, zf + 0.004, red); for (let k = 0; k < 6; k++) p.box(0.02, 0.016, 0.004, bx - bw * 0.35 + k * bw * 0.14, 0.26, zf + 0.009, 0xf4eee0);
    p.add(new THREE.BoxGeometry(bw + 0.04, 0.008, 0.12), bx, 0.235, zf + 0.06, 0xe8dcc0, 0, false, 0, 0.35);
    // porte de l'escalier qui monte au logement, à côté
    p.box(0.08, 0.18, 0.014, cx + side * w * 0.33, 0.04, zf + 0.004, wood);
    // l'étage : fenêtres à volets, balcon de bois sur ses poutres
    for (const sx of [-0.22, 0.22]) slit(cx + sx * (w > 0.9 ? 1.25 : 1), 0.34, 0x7a5a3a);
    p.box(w * 0.86, 0.014, 0.08, cx, 0.29, zf + 0.04, wood);
    for (let k = 0; k <= 4; k++) p.box(0.016, 0.016, 0.08, cx - w * 0.4 + k * w * 0.2, 0.275, zf + 0.04, dark(wood, 0.8));
    p.box(w * 0.86, 0.01, 0.01, cx, 0.36, zf + 0.078, wood);
    for (let x = -w * 0.42; x <= w * 0.42 + 1e-6; x += 0.05) p.box(0.008, 0.07, 0.008, cx + x, 0.3, zf + 0.078, wood);
  } else {
    // maison blanche : porte et volets bleus, pots de géraniums ; un bougainvillier grimpe de la porte jusqu'au parapet
    const blue = [0x3a6ab8, 0x2e8aa8][o.v % 2];
    p.box(0.11, 0.2, 0.016, cx + side * w * 0.2, 0.04, zf + 0.004, blue);
    p.box(0.15, 0.03, 0.06, cx + side * w * 0.2, 0, zf + 0.03, stoneC);
    slit(cx - side * w * 0.18, 0.16, blue);
    if (w > 0.8) slit(cx + side * w * 0.42, 0.18, blue);
    for (const dx of [-0.05, 0.05]) { p.cyl(0.018, 0.013, 0.03, 6, cx - side * w * 0.18 + dx, 0.115, zf + 0.022, C.terracotta); p.sphere(0.02, cx - side * w * 0.18 + dx, 0.15, zf + 0.022, 0xd84a3e, 0, 0.8); }
    // auvent de tuiles sur deux consoles au-dessus de la porte, banc de pierre contre le mur, soubassement peint
    const doorX = cx + side * w * 0.2;
    p.add(new THREE.BoxGeometry(0.19, 0.02, 0.11), doorX, 0.27, zf + 0.05, C.terracotta, 0, false, 0, 0.45);
    for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.011, 0.011, 0.11), doorX - 0.08 + k * 0.04, 0.283, zf + 0.05, dark(C.terracotta, 0.84), 0, false, 0, 0.45);
    for (const s of [-1, 1]) p.box(0.012, 0.03, 0.06, doorX + s * 0.08, 0.235, zf + 0.03, wood);
    p.box(0.13, 0.03, 0.045, cx - side * w * 0.4, 0, zf + 0.025, stoneC);
    p.box(w, 0.035, 0.006, cx, 0.04, zf + 0.002, blue);
    const bx = cx + side * (w * 0.2 + 0.09);
    p.cyl(0.008, 0.012, 0.28, 5, bx, 0, zf + 0.014, 0x6a4a34);
    for (let k = 0; k < 7; k++) p.sphere(0.026 + (k % 3) * 0.006, bx + Math.sin(k * 2.3) * 0.035 - side * k * 0.012, 0.1 + k * 0.032, zf + 0.018, [0xd8459a, 0xe868b0, 0xc83a8a][k % 3], 0, 0.75);
  }
  if (kind === 2) {
    // toit en terrasse : parapet blanc, demi-toit de tuiles au fond, pots sur la terrasse ; escalier extérieur au bout de la rangée
    p.box(w, 0.012, d, cx, H, zc, 0xe8e2d4);
    for (const z of [zf - 0.02, zc - d / 2 + 0.02]) p.box(w, 0.05, 0.03, cx, H, z, plaster);
    for (const s of [-1, 1]) if (s < 0 ? !o.L : !o.R) p.box(0.03, 0.05, d, s < 0 ? x0 + 0.015 : x1 - 0.015, H, zc, plaster);
    tiledShed(p, rcx, H + 0.07, zc - d / 4, rw, d / 2 + 0.04, 0.32);
    for (const dx of [-0.15, 0.1]) { p.cyl(0.025, 0.018, 0.04, 6, cx + dx, H + 0.012, zf - 0.08, C.terracotta); p.sphere(0.03, cx + dx, H + 0.07, zf - 0.08, 0x5f9a4a, 0, 0.9); }
    if (!o.R) for (let k = 0; k < 6; k++) p.box(0.07, 0.03, 0.06, x1 + 0.035, k * 0.05, zf - 0.04 - k * 0.06, plaster);
    // une maison sur deux : treille sur la terrasse, poteaux, perches et feuilles de vigne
    if (o.v % 2 === 0) {
      const px = [cx - w * 0.3, cx + w * 0.3], pz = [zc + 0.02, zf - 0.05];
      for (const x of px) for (const z of pz) p.box(0.014, 0.17, 0.014, x, H + 0.012, z, wood);
      for (const x of px) p.box(0.016, 0.016, pz[1] - pz[0] + 0.04, x, H + 0.18, (pz[0] + pz[1]) / 2, wood);
      for (let k = 0; k < 5; k++) p.box(w * 0.64, 0.01, 0.012, cx, H + 0.195, pz[0] + k * (pz[1] - pz[0]) / 4, wood);
      for (let k = 0; k < 7; k++) p.sphere(0.035, cx - w * 0.27 + k * w * 0.09, H + 0.21, (pz[0] + pz[1]) / 2 + Math.sin(k * 1.9) * 0.05, k % 2 ? 0x6f9a4a : 0x5f8a3e, 0, 0.45);
    }
  } else {
    roof(p, cx, H, zc, { w, d, h: 0.14, color: C.terracotta, wall: plaster, len: rw, dx: rcx - cx, tiles: true });
    // conduit de l'âtre qui fume
    const chx = x1 - 0.1;
    p.box(0.07, 0.16, 0.07, chx, H + 0.02, zc - 0.08, plaster); p.box(0.09, 0.02, 0.09, chx, H + 0.18, zc - 0.08, C.terracotta);
    smoke(chx, H + 0.22, zc - 0.08, 0);
  }
  // l'arrière et les pignons ne sont plus des murs nus : enduit rayé, petites fenêtres hautes à appui de pierre
  const zb = zc - d / 2;
  for (let y = 0.1; y < H - 0.03; y += 0.07) p.box(w, 0.004, 0.006, cx, y, zb - 0.002, dark(plaster, 0.93));
  for (const sx of w > 0.9 ? [-0.32, 0, 0.32] : [-0.18, 0.18]) {
    p.box(0.05, 0.06, 0.012, cx + sx * w, H * 0.62, zb - 0.003, 0x3a2c24);
    p.box(0.06, 0.012, 0.03, cx + sx * w, H * 0.62 - 0.012, zb - 0.01, stoneC);
  }
  for (const [s, x] of [[-1, x0], [1, x1]] as [number, number][]) {
    if (s < 0 ? o.L : o.R) continue;
    p.box(0.012, 0.06, 0.05, x + s * 0.003, H * 0.62, zc, 0x3a2c24);
    // chaînes d'angle blanches de la domus et de la boutique
    if (kind !== 2) for (const z of [zf - 0.012, zb + 0.012]) p.box(0.03, H - 0.04, 0.03, x - s * 0.01, 0.04, z, 0xf4eee0);
  }
  if (kind !== 2) {
    // frise peinte sous la corniche : bandeau ocre et sa grecque rouge sombre
    p.box(w, 0.026, 0.006, cx, H - 0.05, zf + 0.004, 0xd09a4a);
    for (let x = x0 + 0.03; x < x1 - 0.02; x += 0.045) p.box(0.02, 0.012, 0.004, x, H - 0.043 + (Math.round((x - x0) / 0.045) % 2) * 0.006, zf + 0.008, 0x8a3428);
  }
  if (kind === 0) {
    // le jardin de la domus, derrière : muret enduit, figuier, banc de pierre et jarre
    p.box(w - 0.04, 0.07, 0.025, cx, 0, zb - 0.17, plaster);
    for (const s of [-1, 1]) if (s < 0 ? !o.L : !o.R) p.box(0.025, 0.07, 0.17, s < 0 ? x0 + 0.03 : x1 - 0.03, 0, zb - 0.085, plaster);
    tree(p, cx - side * w * 0.22, zb - 0.09, 0.75, 0x6f9a4a);
    p.box(0.12, 0.03, 0.04, cx + side * w * 0.18, 0, zb - 0.07, stoneC);
    p.cyl(0.02, 0.03, 0.07, 8, cx + side * w * 0.34, 0, zb - 0.1, C.terracotta);
  }
  // treille sur le flanc libre de la domus : poteaux, perches, feuilles de vigne et grappes
  if (kind === 0 && !o.R && !o.F) {
    for (const z of [zf + 0.02, zf + 0.2]) p.box(0.016, 0.24, 0.016, x1 - 0.04, 0, z, wood);
    p.box(0.016, 0.016, 0.22, x1 - 0.04, 0.24, zf + 0.11, wood);
    for (let k = 0; k < 5; k++) p.sphere(0.035, x1 - 0.06 - (k % 2) * 0.05, 0.25, zf + 0.03 + k * 0.045, 0x5f9a4a, 0, 0.6);
    for (const z of [zf + 0.08, zf + 0.16]) p.sphere(0.014, x1 - 0.05, 0.215, z, 0x6a3a8a, 0, 1.4);
  }
  // cour sur l'avant quand la maison ne donne pas sur la rue : muret enduit, passage, olivier ou cyprès
  if (!o.F) {
    const gx = kind === 2 ? cx + side * w * 0.2 : cx + (kind === 1 ? side * w * 0.33 : 0);
    p.box(w, 0.006, 0.17, cx, 0, zf + 0.1, kind === 2 ? 0xe8e2d4 : 0xcdb890);
    for (const [a, b] of [[x0, gx - 0.07], [gx + 0.07, x1]] as [number, number][]) if (b - a > 0.02) p.box(b - a, 0.08, 0.03, (a + b) / 2, 0, zf + 0.18, kind === 2 ? plaster : stoneC);
    if (o.v % 2) cypress(p, cx - side * w * 0.32, zf + 0.1, 0.26);
    else tree(p, cx - side * w * 0.32, zf + 0.1, 0.8, 0x8aa86a);
  }
}

/**
 * Maison de l'âge industriel, qui s'accole à ses voisines en rangée : maison ouvrière de brique (bandeau, linteaux et appuis
 * de pierre, fenêtres à guillotine, porte à imposte et sa marche, souche de cheminée aux pots de terre sur le mur mitoyen,
 * parfois une lucarne), maison de ville en pierre blonde (chaînes d'angle, persiennes, balcon de fer forgé, toit mansardé à
 * lucarnes, corniche) ou maison à boutique (devanture peinte et sa vitrine éclairée, enseigne, store rayé, jardinières à
 * l'étage) ; devant, si elle ne donne pas sur la rue, une courette et sa grille de fonte
 */
function industrialHouse(p: Parts, o: ModelOpts, x0: number, x1: number, cx: number, d: number, zc: number, rw: number, rcx: number) {
  const kind = o.v % 3, w = x1 - x0, zf = zc + d / 2, H = 0.5;
  const stone = 0xe8dfcc, white = 0xf2efe6, iron = 0x2a2a2e;
  const brick = [0xa85e50, 0x9a5446, 0xb06a52, 0x96584a, 0xa86452, 0x9e5a4c][o.v % 6];
  const wall = kind === 1 ? [0xe2d6bc, 0xd8c8a8][o.v % 2] : brick;
  const doorC = [0x2c4a3e, 0x6a2a2a, 0x2a3a5a, 0x3a3a3e, 0x5a2a4a, 0x2c4a3e][o.v % 6];
  const side = o.v % 2 ? 1 : -1, spread = w > 0.9 ? 1.25 : 1;
  // fenêtre à guillotine : cadre blanc, vitres (allumées la nuit), traverse et meneau, appui et linteau de pierre
  const sash = (x: number, y: number, ww = 0.09, hh = 0.13, shutters = 0) => {
    p.box(ww + 0.02, hh + 0.02, 0.012, x, y - 0.01, zf + 0.002, white);
    p.box(ww, hh, 0.016, x, y, zf + 0.004, C.win, 0, true);
    p.box(ww, 0.008, 0.02, x, y + hh * 0.5, zf + 0.008, white); p.box(0.006, hh, 0.02, x, y, zf + 0.008, white);
    p.box(ww + 0.05, 0.018, 0.04, x, y - 0.028, zf + 0.012, stone);
    p.box(ww + 0.04, 0.028, 0.018, x, y + hh + 0.006, zf + 0.006, stone);
    if (kind !== 1) p.box(0.022, 0.03, 0.02, x, y + hh + 0.004, zf + 0.01, white);
    if (shutters) for (const s of [-1, 1]) { p.box(ww * 0.5, hh + 0.01, 0.008, x + s * (ww * 0.75 + 0.012), y - 0.005, zf + 0.008, shutters); for (let k = 1; k < 5; k++) p.box(ww * 0.5, 0.004, 0.012, x + s * (ww * 0.75 + 0.012), y - 0.005 + k * (hh / 5), zf + 0.01, dark(shutters, 0.8)); }
  };
  // porte à imposte : encadrement, battant, imposte vitrée, heurtoir, marche
  const door = (x: number) => {
    p.box(0.15, 0.24, 0.012, x, 0.04, zf + 0.002, kind === 1 ? stone : white);
    p.box(0.11, 0.18, 0.02, x, 0.04, zf + 0.004, doorC);
    for (const y of [0.08, 0.15]) p.box(0.08, 0.05, 0.004, x, y, zf + 0.015, dark(doorC, 0.85));
    archTop(p, x, 0.225, zf + 0.008, 0.05, C.win, true);
    p.box(0.012, 0.012, 0.01, x + 0.03, 0.13, zf + 0.018, C.gold);
    p.box(0.17, 0.04, 0.07, x, 0, zf + 0.035, 0x9a948a);
  };
  // soubassement, murs, bandeau, corniche
  p.box(w + 0.012, 0.05, d + 0.012, cx, 0, zc, 0x7a6e64);
  p.box(w, H - 0.05, d, cx, 0.05, zc, wall);
  if (kind !== 1) stones(p, cx, zf, w, 0.05, H, 0, dark(brick, 0.85), 0.38, 450 + o.v);
  else {
    for (let y = 0.1; y < H - 0.03; y += 0.06) p.box(w, 0.004, 0.006, cx, y, zf + 0.002, dark(wall, 0.9));
    if (!o.L) quoins(p, x0, zf, 0.05, H, -1, 1, 0xf2ead8);
    if (!o.R) quoins(p, x1, zf, 0.05, H, 1, 1, 0xf2ead8);
  }
  p.box(w + 0.01, 0.022, d + 0.012, cx, 0.255, zc, kind === 1 ? 0xf2ead8 : dark(brick, 0.72));
  p.box(w + 0.02, 0.03, d + 0.03, cx, H - 0.025, zc, kind === 1 ? 0xf2ead8 : stone);
  // souche de cheminée sur le mur mitoyen de droite, pots de terre cuite, fumée
  const chx = x1 - 0.07;
  const top = kind === 1 ? H + 0.36 : H + 0.34;
  p.box(0.1, top - H + 0.02, 0.15, chx, H - 0.02, zc - 0.02, kind === 1 ? 0xd8c8a8 : dark(brick, 0.9));
  p.box(0.12, 0.025, 0.17, chx, top, zc - 0.02, stone);
  for (const dz of [-0.045, 0, 0.045]) p.cyl(0.013, 0.017, 0.05, 6, chx, top + 0.025, zc - 0.02 + dz, 0xc0704a);
  smoke(chx, top + 0.09, zc - 0.02, 0);
  if (kind === 1) {
    // maison de ville : hautes fenêtres à persiennes, balcon de fer forgé, porte au milieu, toit mansardé et ses lucarnes
    const sh = [0x7a8a96, 0x5a7a5a][o.v % 2];
    for (const sx of [-0.22, 0.22]) { sash(cx + sx * spread, 0.09, 0.08, 0.14, sh); sash(cx + sx * spread, 0.3, 0.08, 0.15, sh); }
    door(cx);
    p.box(w * 0.78, 0.014, 0.06, cx, 0.285, zf + 0.03, stone);
    p.box(w * 0.78, 0.008, 0.008, cx, 0.35, zf + 0.058, iron);
    for (let x = -w * 0.38; x <= w * 0.38 + 1e-6; x += 0.035) p.box(0.005, 0.06, 0.005, cx + x, 0.29, zf + 0.058, iron);
    for (const s of [-1, 1]) p.box(0.006, 0.06, 0.06, cx + s * w * 0.39, 0.29, zf + 0.03, iron);
    for (const sg of [1, -1]) p.add(new THREE.BoxGeometry(rw, 0.21, 0.03), rcx, H + 0.09, zc + sg * (d / 2 - 0.05), C.slate, 0, false, 0, -sg * 0.32);
    p.box(rw - 0.04, 0.025, d - 0.16, rcx, H + 0.19, zc, dark(C.slate, 0.85));
    p.box(rw, 0.02, d + 0.05, rcx, H + 0.005, zc, 0xf2ead8);
    for (const s of [-1, 1]) if (s < 0 ? !o.L : !o.R) p.box(0.02, 0.2, d - 0.1, s < 0 ? x0 + 0.02 : x1 - 0.02, H, zc, C.slate);
    for (const sx of [-0.2, 0.2]) {
      const x = cx + sx * spread;
      p.box(0.08, 0.1, 0.06, x, H + 0.04, zf - 0.03, 0xf2ead8); p.box(0.05, 0.065, 0.004, x, H + 0.06, zf + 0.002, C.win, 0, true);
      p.gable(0.09, 0.04, 0.07, x, H + 0.14, zf - 0.03, C.slate);
    }
  } else {
    if (kind === 2) {
      // boutique : devanture peinte, vitrine éclairée et ses marchandises, porte vitrée, enseigne, store rayé
      const shop = [0x2c4a3e, 0x6a2a2a, 0x2a3a5a][o.v % 3], gold = C.gold;
      p.box(w * 0.92, 0.22, 0.03, cx, 0.03, zf + 0.012, shop);
      p.box(w * 0.55, 0.13, 0.012, cx - side * w * 0.12, 0.07, zf + 0.03, C.win, 0, true);
      for (let k = 0; k < 4; k++) p.box(0.03, 0.025, 0.02, cx - side * w * 0.12 - w * 0.2 + k * w * 0.13, 0.075, zf + 0.022, [0xd84a3e, 0xf2c23a, 0x3c7fd8, 0x4fa860][(k + o.v) % 4]);
      p.box(0.09, 0.17, 0.012, cx + side * w * 0.3, 0.035, zf + 0.03, dark(shop, 0.8)); p.box(0.06, 0.09, 0.004, cx + side * w * 0.3, 0.1, zf + 0.037, C.win, 0, true);
      p.box(w * 0.8, 0.05, 0.014, cx, 0.2, zf + 0.03, dark(shop, 0.75));
      for (let k = 0; k < 7; k++) p.box(0.022, 0.026, 0.004, cx - 0.1 + k * 0.033, 0.212, zf + 0.039, gold);
      const awn = [0xd84a3e, 0x3a6ab8, 0x4fa860][(o.v + 1) % 3];
      for (let k = 0; k < 8; k++) p.add(new THREE.BoxGeometry((w * 0.86) / 8 + 0.002, 0.008, 0.13), cx - w * 0.43 + (k + 0.5) * (w * 0.86) / 8, 0.17, zf + 0.09, k % 2 ? white : awn, 0, false, 0, 0.5);
      for (const sx of [-0.22, 0.22]) {
        const x = cx + sx * spread;
        sash(x, 0.3);
        p.box(0.11, 0.025, 0.035, x, 0.272, zf + 0.03, 0x6a4a34);
        for (let k = 0; k < 3; k++) p.sphere(0.014, x - 0.035 + k * 0.035, 0.302, zf + 0.03, [0xd84a3e, 0xf2a6c8, 0xf2d24a][k], 0, 0.9);
      }
    } else {
      // maison ouvrière : la porte d'un côté, une fenêtre de l'autre, deux à l'étage
      door(cx + side * w * 0.27);
      sash(cx - side * w * 0.16, 0.09, 0.11, 0.13);
      for (const sx of [-0.22, 0.22]) sash(cx + sx * spread, 0.31);
      p.box(0.03, 0.04, 0.006, cx + side * w * 0.27 + side * 0.1, 0.17, zf + 0.004, 0x2a5aa8);
    }
    roof(p, cx, H, zc, { w, d, h: 0.24, color: C.slate, wall, len: rw, dx: rcx - cx, courses: true });
    // une lucarne à fronton sur une maison sur deux
    if (o.v % 2 === 0) {
      const lx = cx - side * w * 0.05, lz = zf - 0.08, ly = H;
      p.box(0.1, 0.14, 0.1, lx, ly, lz, wall); p.box(0.06, 0.07, 0.004, lx, ly + 0.05, lz + 0.052, C.win, 0, true);
      p.box(0.07, 0.012, 0.02, lx, ly + 0.038, lz + 0.056, stone);
      p.gable(0.1, 0.05, 0.12, lx, ly + 0.14, lz + 0.01, C.slate);
    }
  }
  // courette sur l'avant, quand la maison ne donne pas sur la rue : dalles, grille de fonte et son portillon, pot de fleurs
  if (!o.F) {
    p.box(w, 0.008, 0.16, cx, 0, zf + 0.1, 0xb8b0a0);
    for (let x = x0 + 0.02; x <= x1 - 0.02 + 1e-6; x += 0.05) { if (Math.abs(x - (cx + side * w * 0.27)) < 0.07) continue; p.box(0.006, 0.09, 0.006, x, 0, zf + 0.18, iron); p.cone(0.006, 0.014, 4, x, 0.09, zf + 0.18, iron); }
    p.box(w, 0.008, 0.008, cx, 0.07, zf + 0.18, iron);
    p.cyl(0.022, 0.016, 0.03, 6, cx - side * w * 0.3, 0.008, zf + 0.09, C.terracotta); p.sphere(0.024, cx - side * w * 0.3, 0.045, zf + 0.09, 0xd84a3e, 0, 0.8);
  }
}

function medievalHouse(p: Parts, o: ModelOpts, x0: number, x1: number, cx: number, d: number, zc: number, rw: number, rcx: number) {
  const w = x1 - x0, stone = [0xd3cbbd, 0xc6beb0][o.v % 2], wall = [0xf4ead8, 0xf1e4cc, 0xf6efe2][o.v % 3];
  // un bloc de maisons accolées garde un seul toit, d'une seule couleur (pas de bandes bleu, vert, rouge d'une maison à l'autre)
  const rc = [0x5f9a94, 0x6f86c4, 0x5f8f7a, 0xb06a52][(o.row ?? o.v) % 4], beam = C.darkwood, shutter = SHUTTERS[o.v % 4];
  const g0 = 0.25, h = 0.54, jet = 0.03, zf0 = zc + d / 2 + 0.006, zf1 = zc + d / 2 + jet + 0.006, zb1 = zc - d / 2 - jet - 0.006;
  // socle, rez-de-chaussée de pierre et pierres d'angle
  p.box(w + 0.03, 0.04, d + 0.03, cx, 0, zc, C.darkstone);
  p.box(w, g0 - 0.04, d, cx, 0.04, zc, stone);
  for (const bx of [x0 + 0.035, x1 - 0.035]) for (let k = 0, y = 0.05; y < g0 - 0.03; y += 0.06, k++) p.box(k % 2 ? 0.07 : 0.05, 0.045, 0.012, bx, y, zf0, dark(stone, 0.88));
  // étage en encorbellement, crème, et ses colombages devant et derrière
  p.box(w, h - g0, d + 2 * jet, cx, g0, zc, wall);
  for (const z of [zf1, zb1]) {
    p.box(w + 0.012, 0.032, 0.02, cx, g0, z, beam);
    p.box(w + 0.012, 0.03, 0.02, cx, h - 0.03, z, beam);
    for (const bx of [x0 + 0.02, x1 - 0.02]) p.box(0.032, h - g0, 0.02, bx, g0, z, beam);
    for (let x = x0 + 0.13; x < x1 - 0.1; x += 0.26) {
      // entre deux fenêtres : un poteau et deux décharges en V
      p.box(0.022, h - g0, 0.02, x + 0.13, g0, z, beam);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.018, 0.17, 0.02), x + 0.13 + s * 0.045, g0 + 0.15, z, beam, 0, false, s * 0.55);
    }
  }
  // pignons à colombages (sauf contre une maison voisine)
  for (const [x, side] of [[x0 - 0.006, -1], [x1 + 0.006, 1]]) {
    if ((side < 0 && o.L) || (side > 0 && o.R)) continue;
    for (const z of [zc - d / 2 - jet + 0.02, zc + d / 2 + jet - 0.02]) p.box(0.02, h - g0, 0.035, x, g0, z, beam);
    const hh = h - g0 - 0.06, dd = d + 2 * jet - 0.08, ang = Math.atan2(dd, hh), len = Math.hypot(hh, dd);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, len, 0.02), x, g0 + 0.03 + hh / 2, zc, beam, 0, false, 0, s * ang);
  }
  roof(p, cx, h, zc, { w, d: d + 2 * jet, h: 0.42, color: rc, wall, len: rw, dx: rcx - cx, ov: 0.09 });
  // porte de bois sous un linteau, marche ; fenêtres à volets
  p.box(0.17, 0.2, 0.014, cx, 0.04, zf0 - 0.002, dark(stone, 0.8));
  p.box(0.13, 0.18, 0.02, cx, 0.04, zf0, C.door);
  p.box(0.2, 0.025, 0.07, cx, 0, zf0 + 0.035, C.stone);
  const win = (x: number, y: number, z: number, sh: boolean) => {
    p.box(0.12, 0.13, 0.014, x, y - 0.015, z - 0.002, beam);
    p.box(0.09, 0.1, 0.02, x, y, z, C.win, 0, true);
    if (sh) for (const s of [-1, 1]) p.box(0.04, 0.12, 0.014, x + s * 0.085, y - 0.01, z + 0.004, shutter);
  };
  for (const sx of [-0.22, 0.22]) { const x = cx + sx * (w > 0.9 ? 1.2 : 1); if (x - 0.08 > x0 && x + 0.08 < x1) win(x, 0.1, zf0, false); }
  for (let x = x0 + 0.13; x < x1 - 0.05; x += 0.26) win(x, 0.34, zf1, true);
  // tourelle d'angle ou lucarne, cheminée
  const corner = o.v % 3 === 0 ? (!o.R ? x1 - 0.02 : !o.L ? x0 + 0.02 : null) : null;
  if (corner !== null) {
    const tz = zc + d / 2 + jet - 0.04;
    p.cyl(0.085, 0.07, h - g0 + 0.16, 8, corner, g0 - 0.06, tz, wall);
    p.add(new THREE.CylinderGeometry(0.088, 0.088, 0.025, 8, 1, true), corner, g0 + 0.02, tz, beam);
    p.add(new THREE.CylinderGeometry(0.088, 0.088, 0.025, 8, 1, true), corner, h + 0.06, tz, beam);
    p.box(0.05, 0.07, 0.02, corner, h - 0.06, tz + 0.08, C.win, 0, true);
    p.cone(0.115, 0.34, 8, corner, h + 0.1, tz, rc);
    p.sphere(0.018, corner, h + 0.45, tz, C.gold);
  } else if (o.v % 3 === 1) {
    const dz = zc + d * 0.2;
    p.box(0.14, 0.13, 0.16, cx, h + 0.04, dz, wall);
    p.box(0.08, 0.08, 0.02, cx, h + 0.07, dz + 0.081, C.win, 0, true);
    roof(p, cx, h + 0.17, dz, { w: 0.16, d: 0.15, h: 0.09, color: rc, wall, ry: Math.PI / 2, ov: 0.03 });
  }
  if (o.v % 2 === 0) {
    p.box(0.09, 0.62, 0.09, rcx + rw * 0.28, h - 0.1, zc - 0.12, stone);
    p.box(0.11, 0.03, 0.11, rcx + rw * 0.28, h + 0.52, zc - 0.12, C.darkstone);
    smoke(rcx + rw * 0.28, h + 0.57, zc - 0.12, 0);
  }
  // jardinet clôturé quand la maison ne donne pas sur une route
  if (!o.F) {
    for (let i = 0; i < 5; i++) p.box(0.03, 0.1, 0.03, -0.4 + i * 0.2, 0, 0.46, C.wood);
    p.box(0.84, 0.025, 0.02, 0, 0.06, 0.46, C.wood);
    p.sphere(0.045, -0.2, 0.03, 0.37, C.pink, 0, 0.8);
    p.sphere(0.05, 0.36, 0.03, 0.33, C.darkgreen, 0, 0.8);
  }
}

/** Botte de foin ronde couchée */
function bale(p: Parts, x: number, z: number, ry = 0) {
  p.add(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 9).rotateX(Math.PI / 2), x, 0.075, z, C.gold, ry);
}
/** Meule de foin */
function stack(p: Parts, x: number, z: number, s = 1) {
  p.cyl(0.11 * s, 0.15 * s, 0.14 * s, 7, x, 0, z, C.thatch);
  p.cone(0.12 * s, 0.16 * s, 7, x, 0.14 * s, z, C.gold);
}
/** Clôture de piquets entre deux points */
function fence(p: Parts, x0: number, z0: number, x1: number, z1: number) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.16));
  for (let i = 0; i <= n; i++) p.box(0.022, 0.12, 0.022, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, C.wood);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  for (const y of [0.04, 0.09]) p.box(len, 0.018, 0.012, (x0 + x1) / 2, y, (z0 + z1) / 2, C.wood, ry);
}
/** Enclos (2 × 2) : un pré clôturé, porte devant, abri au fond à gauche, auge et foin ; les bêtes vivent à part (PenView) */
function pen(p: Parts, age: number) {
  const R = 0.88, grass = age === 0 ? 0x9cb86a : 0x8cbf6c, mud = dark(C.dirt, 0.78);
  p.box(1.84, 0.012, 1.84, 0, 0, 0, grass);
  // pré : touffes plus vertes ou jaunies, sentier piétiné de la porte à l'abri, boue et flaque autour de l'auge
  for (const [x, z, r, k] of [[0.3, -0.12, 0.24, 1.1], [-0.38, 0.32, 0.2, 0.9], [0.6, 0.2, 0.16, 1.06], [-0.1, -0.3, 0.14, 0.94], [0.1, 0.5, 0.12, 1.12], [-0.6, -0.05, 0.13, 0.88], [0.66, -0.2, 0.1, 0.92], [-0.3, 0.7, 0.1, 1.08]] as number[][])
    p.cyl(r, r * 0.92, 0.004, 9, x, 0.012, z, dark(grass, k));
  p.box(0.26, 0.005, 1.05, -0.2, 0.012, 0.3, dark(C.dirt, 0.9), 0.32);
  p.cyl(0.22, 0.2, 0.005, 10, 0.45, 0.012, 0.52, mud);
  p.cyl(0.07, 0.065, 0.004, 8, 0.22, 0.017, 0.62, 0x6fa8c0);
  // herbes folles et fleurs
  for (let i = 0; i < 40; i++) {
    const x = Math.sin(i * 2.39) * 0.74, z = Math.cos(i * 1.71 + i * 0.13) * 0.74;
    if (x < -0.1 && z < -0.25) continue;
    if (i % 5 === 0) p.sphere(0.014, x, 0.03, z, [0xf2e27a, 0xffffff, 0xd88ab8][i % 3]);
    else p.cone(0.016, 0.06, 4, x, 0.012, z, dark(grass, 0.78));
  }
  // cailloux, seau
  for (const [x, z, r] of [[0.68, -0.68, 0.03], [0.74, -0.6, 0.022], [-0.72, 0.68, 0.026]]) p.sphere(r, x, 0.015, z, C.stone, 0, 0.6);
  p.cyl(0.035, 0.028, 0.06, 7, 0.24, 0.012, 0.48, age >= 3 ? C.metal : C.darkwood);
  // clôture : branchages, piquets, pierre sèche au Moyen Âge, barrières blanches ensuite
  const wall = age === 2, post = age >= 3 ? C.white : age === 0 ? C.darkwood : C.wood;
  const side = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
    if (wall) { p.box(len, 0.09, 0.07, (x0 + x1) / 2, 0, (z0 + z1) / 2, C.darkstone, ry); p.box(len, 0.03, 0.08, (x0 + x1) / 2, 0.09, (z0 + z1) / 2, C.stone, ry); return; }
    const n = Math.max(1, Math.round(len / 0.2));
    for (let i = 0; i <= n; i++) p.box(0.026, age === 0 ? 0.15 : 0.13, 0.026, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, post);
    for (const y of age === 0 ? [0.05, 0.1, 0.13] : [0.05, 0.1]) p.box(len, 0.018, 0.014, (x0 + x1) / 2, y, (z0 + z1) / 2, post, ry + (age === 0 ? (y - 0.09) * 0.4 : 0));
  };
  side(-R, -R, R, -R); side(R, -R, R, R); side(-R, -R, -R, R);
  side(-R, R, -0.24, R); side(0.24, R, R, R);
  // portail : deux battants ouverts vers l'extérieur ; dès l'Antiquité, un linteau et une lanterne qui luit la nuit
  for (const s of [-1, 1]) {
    p.box(0.035, age === 0 ? 0.2 : 0.24, 0.035, s * 0.25, 0, R, wall ? C.darkstone : post);
    p.box(0.014, 0.1, 0.13, s * 0.27, 0.025, R + 0.07, wall ? C.wood : post, s * 0.35);
    p.box(0.014, 0.018, 0.13, s * 0.27, 0.06, R + 0.07, wall ? C.darkwood : post, s * 0.35, false, s * 0.6);
  }
  if (age >= 1) {
    p.box(0.56, 0.03, 0.045, 0, 0.24, R, wall ? C.darkstone : post);
    p.box(0.012, 0.05, 0.012, 0.25, 0.19, R + 0.035, C.darkwood);
    p.box(0.035, 0.045, 0.035, 0.25, 0.15, R + 0.035, C.flame, 0, true);
  }
  // abri : appentis de branchages, cabane de bois, écurie à colombages, grange ouverte
  const sx = -0.5, sz = -0.56;
  if (age === 2 && attach(['f_stable'], 0, 0.64, sx, sz - 0.04)) { /* écurie importée */ }
  else if (age >= 3 && attach(['f_barn'], 0, 0.62, sx, sz - 0.02)) { /* grange importée */ }
  else if (age === 0) {
    for (const [x, z] of [[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]]) p.box(0.03, z > 0 ? 0.26 : 0.36, 0.03, sx + x, 0, sz + z, C.darkwood);
    p.box(0.5, 0.03, 0.42, sx, 0.31, sz, C.thatch, 0, false, 0);
  } else if (age === 1 && attach(['f_hut'], 0, 0.54, sx, sz - 0.02, Math.PI / 2)) {
    // toit de chaume et son faîtage de paille ; dessous la meule et les sacs de grain
    recolorTop(0.16, C.thatch);
    p.box(0.5, 0.03, 0.05, sx, 0.345, sz - 0.02, dark(C.thatch, 0.82));
    stack(p, sx - 0.1, sz - 0.04, 0.55);
    for (const [x, z] of [[0.14, -0.06], [0.2, 0.02], [0.17, -0.01]]) p.sphere(0.035, sx + x, 0.035, sz + z, 0xd9c4a0, 0, 1.15);
    // devant : la mangeoire pleine de grain, le tas de bûches, la fourche contre le poteau, la lanterne sur son piquet
    p.box(0.26, 0.06, 0.08, sx + 0.1, 0, sz + 0.25, C.darkwood); p.box(0.22, 0.012, 0.06, sx + 0.1, 0.05, sz + 0.25, C.gold);
    for (let k = 0; k < 5; k++) log(p, 0.18, 0.022, sx - 0.17 + (k > 2 ? 0.0 : 0), k > 2 ? 0.038 : 0, sz + 0.23 + (k > 2 ? (k - 3) * 0.045 + 0.022 : k * 0.045));
    p.box(0.012, 0.3, 0.012, sx + 0.34, 0, sz + 0.12, C.wood, 0, false, 0.25);
    p.box(0.012, 0.008, 0.05, sx + 0.266, 0.29, sz + 0.12, C.metal);
    for (const d of [-0.02, 0, 0.02]) p.box(0.006, 0.05, 0.006, sx + 0.266, 0.29, sz + 0.12 + d, C.metal);
    p.box(0.016, 0.28, 0.016, sx + 0.3, 0, sz + 0.27, C.darkwood);
    p.box(0.03, 0.04, 0.03, sx + 0.3, 0.28, sz + 0.27, C.flame, 0, true);
    p.pyramid(0.045, 0.03, 0.045, sx + 0.3, 0.32, sz + 0.27, C.metal);
  } else if (age <= 2) {
    const wallC = age === 1 ? C.wood : C.stone;
    p.box(0.52, 0.26, 0.36, sx, 0, sz, wallC);
    roof(p, sx, 0.26, sz, { w: 0.52, d: 0.36, h: 0.18, color: age === 1 ? C.thatch : C.slate, wall: wallC, ov: 0.05 });
    p.box(0.16, 0.18, 0.02, sx, 0, sz + 0.185, C.darkwood);
  } else {
    p.box(0.56, 0.34, 0.4, sx, 0, sz, 0xb4473c);
    roof(p, sx, 0.34, sz, { w: 0.56, d: 0.4, h: 0.2, color: C.roofdark, wall: 0xb4473c, ov: 0.05 });
    p.box(0.2, 0.24, 0.02, sx, 0, sz + 0.205, C.white);
  }
  // auge d'eau, râtelier à foin contre l'abri, foin et brins éparpillés
  p.box(0.34, 0.07, 0.11, 0.45, 0, 0.56, C.darkwood); p.box(0.3, 0.01, 0.08, 0.45, 0.065, 0.56, C.water);
  for (const x of [-0.24, -0.06]) p.box(0.022, 0.2, 0.022, x, 0, -0.5, C.darkwood);
  p.box(0.22, 0.02, 0.1, -0.15, 0.08, -0.52, C.darkwood);
  for (let i = 0; i < 6; i++) p.box(0.012, 0.12, 0.012, -0.24 + i * 0.036, 0.09, -0.47, C.wood, 0, false, 0.25);
  p.box(0.18, 0.07, 0.06, -0.15, 0.1, -0.53, C.gold);
  for (let i = 0; i < 7; i++) p.box(0.06, 0.004, 0.012, -0.15 + Math.sin(i * 1.9) * 0.14, 0.013, -0.38 + Math.cos(i * 2.3) * 0.08, C.gold, i * 0.9);
  // le coin du fond à droite : foin, gerbes et, dès l'Antiquité, le poulailler (bois brut avant l'âge industriel)
  if (age === 0) stack(p, 0.55, -0.5, 0.7);
  else {
    bale(p, 0.28, -0.6, 0.3); bale(p, 0.4, -0.44, 1.2);
    if (!attach(['f_coop'], 0, 0.28, 0.62, -0.6, -Math.PI / 2, age < 3 ? toTimber : undefined)) stack(p, 0.66, -0.66, 0.55);
  }
  attach(['f_hay'], 0, 0.1, 0.12, -0.7); attach(['f_hay'], 0, 0.085, 0.2, -0.76, 1.3);
  // un banc le long de la clôture, une barrique d'eau à partir du Moyen Âge
  if (age >= 1) attach(['f_bench'], 0, 0.26, -0.7, 0.5, Math.PI / 2);
  if (age >= 2) attach(['f_barrel'], 0, 0.1, 0.72, 0.22);
}

/** Charrette chargée de foin (orientée selon x) */
function cart(p: Parts, x: number, z: number) {
  p.box(0.24, 0.04, 0.14, x, 0.07, z, C.wood);
  for (const s of [-1, 1]) {
    p.box(0.24, 0.05, 0.012, x, 0.11, z + s * 0.065, C.wood);
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8).rotateX(Math.PI / 2), x, 0.06, z + s * 0.085, C.darkwood);
    p.box(0.16, 0.014, 0.014, x + 0.19, 0.07, z + s * 0.04, C.wood);
  }
  p.box(0.2, 0.06, 0.11, x, 0.11, z, C.gold);
}
/** Petit tracteur (orienté selon x) */
function tractor(p: Parts, x: number, z: number) {
  p.box(0.2, 0.08, 0.1, x, 0.06, z, C.red);
  p.box(0.09, 0.1, 0.1, x - 0.05, 0.14, z, C.red);
  p.box(0.07, 0.06, 0.102, x - 0.05, 0.17, z, C.glass);
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 9).rotateX(Math.PI / 2), x - 0.06, 0.07, z + s * 0.07, C.darkstone);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8).rotateX(Math.PI / 2), x + 0.07, 0.04, z + s * 0.065, C.darkstone);
  }
  p.cyl(0.012, 0.012, 0.08, 5, x + 0.05, 0.14, z, C.metal);
}

function farm(p: Parts, age: number) {
  if (age === 0) {
    // grenier sur pilotis, séchoir à gerbes, meules
    const gx = -0.18, gz = -0.18;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.035, 0.15, 0.035, gx + a * 0.11, 0, gz + b * 0.11, C.darkwood);
    p.box(0.3, 0.03, 0.3, gx, 0.15, gz, C.wood);
    p.cyl(0.13, 0.13, 0.16, 7, gx, 0.18, gz, C.hide);
    p.cone(0.27, 0.1, 7, gx, 0.3, gz, dark(C.thatch, 0.7));
    p.cone(0.26, 0.28, 7, gx, 0.33, gz, C.thatch);
    p.box(0.03, 0.3, 0.03, 0.08, 0, 0.14, C.wood); p.box(0.03, 0.3, 0.03, 0.42, 0, 0.14, C.wood);
    p.box(0.38, 0.025, 0.025, 0.25, 0.28, 0.14, C.wood);
    for (let i = 0; i < 4; i++) p.cyl(0.035, 0.02, 0.13, 5, 0.13 + i * 0.08, 0.15, 0.14, C.gold);
    stack(p, 0.3, -0.24); stack(p, 0.02, 0.36, 0.75);
    p.cyl(0.05, 0.04, 0.06, 6, -0.32, 0, 0.3, C.brown);
    // meule et sa farine, paniers de grain, haie de branches au fond, bâton à fouir, oiseau qui picore
    quern(p, -0.38, 0.06, 0.5);
    wickerBasket(p, 0.38, 0.38, C.gold); wickerBasket(p, 0.28, 0.43, C.gold, 0.8);
    for (let x = -0.44; x <= 0.45; x += 0.08) p.cyl(0.006, 0.008, 0.12 + hash2(x * 10, 3, 61) * 0.05, 4, x, 0, -0.45, C.darkwood);
    for (const y of [0.05, 0.1]) p.box(0.9, 0.008, 0.008, 0, y, -0.45, C.wood);
    p.add(new THREE.BoxGeometry(0.008, 0.3, 0.008).translate(0, 0.15, 0), 0.46, 0, 0.1, C.wood, 0, false, 0.25);
  } else if (age === 1) {
    // ferme de bois et chaume, meule, charrette, enclos
    p.box(0.5, 0.04, 0.34, -0.08, 0, -0.22, C.stone);
    p.box(0.46, 0.2, 0.3, -0.08, 0.04, -0.22, C.wood);
    roof(p, -0.08, 0.24, -0.22, { w: 0.46, d: 0.3, h: 0.2, color: C.thatch, wall: C.wood });
    p.box(0.1, 0.15, 0.02, -0.08, 0, -0.065, C.door);
    p.box(0.08, 0.07, 0.02, -0.24, 0.1, -0.065, C.win, 0, true);
    stack(p, 0.34, -0.22);
    cart(p, 0.1, 0.24);
    fence(p, -0.45, 0.44, 0.45, 0.44); fence(p, -0.45, 0.06, -0.45, 0.44);
  } else if (age === 2) {
    // grange rouge à pignon sur rue : soubassement de pierre, planches à couvre-joints, angles blancs, toit de bardeaux,
    // porte en croix, fenil ouvert sur le foin sous sa poulie, girouette ; fenêtre éclairée sur le côté, lanterne à la porte
    const bx = -0.06, bz = -0.16, W = 0.56, D = 0.38, H = 0.3, red2 = dark(C.red, 0.82);
    p.box(0.6, 0.05, 0.42, bx, 0, bz, C.stone);
    stones(p, bx, bz + 0.21, 0.6, 0, 0.05, 0, C.stone, 0.85, 1);
    for (const s of [-1, 1]) stones(p, bx + s * 0.3, bz, 0.42, 0, 0.05, s * Math.PI / 2, C.stone, 0.85, 2 + s);
    p.box(W, H, D, bx, 0.05, bz, C.red);
    roof(p, bx, 0.35, bz, { w: D, d: W, h: 0.3, color: C.darkbrick, wall: C.red, ry: Math.PI / 2, len: 0.48, courses: true });
    const zf = bz + D / 2 + 0.006;
    // couvre-joints : sur les pignons (jusque sous le toit), sur les longs pans
    for (let u = -W / 2 + 0.035; u < W / 2 - 0.02; u += 0.052) {
      const top = 0.35 + 0.3 * (1 - Math.abs(u) / (W / 2)) - 0.02;
      for (const s of [-1, 1]) {
        const y0 = s > 0 && Math.abs(u) < 0.12 ? 0.3 : 0.05;
        p.box(0.012, top - y0, 0.008, bx + u, y0, bz + s * (D / 2 + 0.003), red2);
      }
    }
    for (let v = -D / 2 + 0.04; v < D / 2 - 0.02; v += 0.052) for (const s of [-1, 1]) p.box(0.008, H, 0.012, bx + s * (W / 2 + 0.003), 0.05, bz + v, red2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.024, H, 0.024, bx + sx * W / 2, 0.05, bz + sz * D / 2, C.white);
    for (const s of [-1, 1]) p.box(0.012, 0.02, D + 0.02, bx + s * (W / 2 + 0.004), 0.33, bz, C.white);
    // porte de grange à deux battants, croix blanches
    p.box(0.22, 0.25, 0.014, bx, 0.05, zf - 0.003, C.white);
    p.box(0.2, 0.22, 0.02, bx, 0.05, zf, dark(C.red, 0.78));
    p.box(0.008, 0.22, 0.024, bx, 0.05, zf, C.white);
    for (const d of [-0.05, 0.05]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.2, 0.014, 0.01), bx + d, 0.16, zf + 0.012, C.white, 0, false, s * 1.1);
    // fenil : ouverture sombre sur le foin, poutre et poulie
    p.box(0.14, 0.13, 0.014, bx, 0.39, zf - 0.002, C.white);
    p.box(0.11, 0.1, 0.016, bx, 0.405, zf, 0x3c3028);
    p.box(0.1, 0.045, 0.02, bx, 0.405, zf + 0.002, C.gold);
    p.box(0.024, 0.024, 0.12, bx, 0.56, zf + 0.04, C.darkwood);
    p.cyl(0.016, 0.016, 0.01, 8, bx, 0.535, zf + 0.085, C.metal);
    p.box(0.004, 0.09, 0.004, bx, 0.45, zf + 0.085, 0xc9b48a);
    // girouette au faîte
    p.box(0.008, 0.1, 0.008, bx, 0.66, bz + 0.12, C.darkwood);
    p.box(0.1, 0.008, 0.008, bx, 0.74, bz + 0.12, C.darkwood, 0.6);
    p.box(0.035, 0.03, 0.008, bx, 0.75, bz + 0.12, 0x3c3530, 0.6);
    // fenêtre éclairée sur le côté, lanterne près de la porte
    p.box(0.014, 0.1, 0.11, bx + W / 2 + 0.004, 0.17, bz - 0.04, C.white);
    p.box(0.02, 0.08, 0.09, bx + W / 2 + 0.006, 0.18, bz - 0.04, C.win, 0, true);
    p.box(0.006, 0.08, 0.008, bx + W / 2 + 0.017, 0.18, bz - 0.04, C.darkwood); p.box(0.006, 0.008, 0.09, bx + W / 2 + 0.017, 0.22, bz - 0.04, C.darkwood);
    p.box(0.012, 0.012, 0.05, bx + 0.15, 0.27, zf + 0.02, C.darkwood);
    p.box(0.032, 0.042, 0.032, bx + 0.15, 0.22, zf + 0.04, C.flame, 0, true);
    p.pyramid(0.045, 0.025, 0.045, bx + 0.15, 0.262, zf + 0.04, 0x3c3530);
    // devant : terre battue jonchée de paille, fourche contre le mur ; bottes, meule, clôture
    p.cyl(0.17, 0.18, 0.006, 10, bx, 0, zf + 0.13, dark(C.dirt, 0.82));
    for (let i = 0; i < 7; i++) p.box(0.05, 0.004, 0.006, bx - 0.12 + hash2(i, 1, 51) * 0.24, 0.007, zf + 0.06 + hash2(i, 2, 51) * 0.16, C.gold, hash2(i, 3, 51) * 3);
    p.add(new THREE.BoxGeometry(0.01, 0.3, 0.01).translate(0, 0.15, 0), bx - 0.2, 0, zf + 0.07, C.wood, 0, false, 0, -0.2);
    for (const d of [-0.016, 0, 0.016]) p.add(new THREE.BoxGeometry(0.005, 0.05, 0.005).translate(0, 0.025, 0), bx - 0.2 + d, 0.29, zf + 0.012, C.metal, 0, false, 0, -0.2);
    bale(p, 0.33, -0.28, 0.3); bale(p, 0.33, -0.1, -0.2); bale(p, 0.3, 0.2, 1.2);
    fence(p, -0.45, 0.44, 0.45, 0.44);
    stack(p, -0.32, 0.26, 0.8);
  } else if (age === 3) {
    // grange de planches à angles blancs et portes en croix, silo et son échelle, éolienne de pompage, auge, boîte aux lettres
    const bx = -0.14, bz = -0.18, red = 0xb4473c, zf = bz + 0.17;
    p.box(0.48, 0.05, 0.38, bx, 0, bz, C.darkstone);
    stones(p, bx, bz + 0.19, 0.48, 0, 0.05, 0, C.darkstone, 0.8, 330);
    p.box(0.44, 0.28, 0.34, bx, 0.05, bz, red);
    roof(p, bx, 0.33, bz, { w: 0.44, d: 0.34, h: 0.2, color: C.roofdark, wall: red, len: 0.52, courses: true });
    for (let u = -0.2; u <= 0.2; u += 0.045) for (const s of [-1, 1]) p.box(0.01, 0.28, 0.008, bx + u, 0.05, bz + s * 0.173, dark(red, 0.82));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.02, 0.28, 0.02, bx + sx * 0.22, 0.05, bz + sz * 0.17, C.white);
    p.box(0.46, 0.02, 0.36, bx, 0.33, bz, C.white);
    p.box(0.18, 0.21, 0.014, bx, 0.05, zf + 0.004, C.white); p.box(0.16, 0.19, 0.016, bx, 0.05, zf + 0.008, dark(red, 0.78));
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.22, 0.012, 0.008), bx, 0.145, zf + 0.018, C.white, 0, false, s * 0.86);
    p.box(0.008, 0.19, 0.02, bx, 0.05, zf + 0.012, C.white);
    p.box(0.09, 0.07, 0.014, bx, 0.36, zf + 0.004, C.white); p.box(0.07, 0.05, 0.016, bx, 0.37, zf + 0.007, 0x3c3028); p.box(0.07, 0.02, 0.018, bx, 0.37, zf + 0.008, C.gold);
    p.cyl(0.11, 0.11, 0.58, 10, 0.3, 0, -0.22, C.metal);
    for (const y of [0.08, 0.2, 0.32, 0.44, 0.55]) p.cyl(0.113, 0.113, 0.012, 10, 0.3, y, -0.22, dark(C.metal, 0.8));
    p.sphere(0.11, 0.3, 0.58, -0.22, C.metal, 1, 0.6); p.cyl(0.015, 0.015, 0.03, 6, 0.3, 0.68, -0.22, dark(C.metal, 0.8));
    for (const s of [-1, 1]) p.box(0.006, 0.56, 0.006, 0.3 + s * 0.025, 0.02, -0.105, dark(C.metal, 0.7));
    for (let y = 0.06; y < 0.58; y += 0.05) p.box(0.05, 0.005, 0.005, 0.3, y, -0.105, dark(C.metal, 0.7));
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6).rotateZ(1.05), 0.12, 0.5, -0.22, dark(C.metal, 0.85));
    // éolienne de pompage : pylône d'acier, roue à pales qui tourne, gouvernail, réservoir
    const wx = 0.36, wz = 0.3;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.01, 0.46, 0.01).translate(0, 0.23, 0), wx + dx * 0.045, 0, wz + dz * 0.045, 0x8a8f96, 0, false, -dx * 0.09, dz * 0.09);
    for (const y of [0.12, 0.26]) p.box(0.08 - y * 0.12, 0.006, 0.08 - y * 0.12, wx, y, wz, 0x8a8f96);
    // la tête (carter et gouvernail) se tourne face au vent, la roue devant
    const hd = vane(wx, wz, 0);
    hd.box(0.03, 0.03, 0.06, wx, 0.45, wz, 0x6a6f78); hd.add(new THREE.BoxGeometry(0.004, 0.06, 0.08), wx, 0.46, wz - 0.07, 0xd84a3e);
    hd.box(0.006, 0.006, 0.07, wx, 0.465, wz - 0.03, 0x6a6f78);
    const r = spinner([wx, 0.47, wz + 0.04], [0, 0, 1], 2.2);
    for (let i = 0; i < 12; i++) r.add(new THREE.BoxGeometry(0.018, 0.08, 0.004).translate(0, 0.05, 0).rotateZ((i / 12) * Math.PI * 2), 0, 0, 0, C.white);
    r.add(new THREE.TorusGeometry(0.075, 0.004, 3, 16), 0, 0, 0, 0x8a8f96);
    p.cyl(0.07, 0.07, 0.06, 10, wx - 0.12, 0, wz + 0.1, 0x6a7a8a); p.cyl(0.062, 0.062, 0.006, 10, wx - 0.12, 0.058, wz + 0.1, C.water);
    // bottes, tracteur, boîte aux lettres
    bale(p, -0.3, 0.25, 0.2); bale(p, -0.14, 0.3, -0.1);
    tractor(p, 0.12, 0.22);
    p.box(0.01, 0.12, 0.01, -0.42, 0, 0.44, C.wood); p.box(0.05, 0.035, 0.03, -0.42, 0.12, 0.44, 0x4a6aa8); p.box(0.004, 0.025, 0.012, -0.393, 0.14, 0.45, 0xd84a3e);
  } else {
    // serre : soubassement, parois et toit de verre sur des montants blancs, rangées de plantes sur leurs tablettes et
    // lampes de culture qui s'allument la nuit, porte coulissante ; cuve d'eau, caisses de légumes, brouette, bacs de culture
    const glass = 0xcfeaf0, frame = 0xf2f2ee;
    p.box(0.84, 0.05, 0.6, 0, 0, -0.1, C.stone);
    // parois de verre (elles luisent la nuit, aux lampes de culture) ; la façade est ouverte au-dessus d'une plinthe vitrée
    p.box(0.8, 0.22, 0.012, 0, 0.05, -0.38, glass, 0, true);
    for (const sx of [-1, 1]) p.box(0.012, 0.22, 0.56, sx * 0.4, 0.05, -0.1, glass, 0, true);
    p.box(0.8, 0.07, 0.012, 0, 0.05, 0.18, glass, 0, true);
    p.gable(0.8, 0.16, 0.56, 0, 0.27, -0.1, 0xdff3f6);
    for (let i = 0; i < 7; i++) { const x = -0.4 + i * (0.8 / 6); p.box(0.014, 0.22, 0.58, x, 0.05, -0.1, frame); p.add(new THREE.BoxGeometry(0.014, 0.012, 0.33).translate(0, 0, 0.165), x, 0.43, -0.1, frame, 0, false, 0, 0.52); p.add(new THREE.BoxGeometry(0.014, 0.012, 0.33).translate(0, 0, -0.165), x, 0.43, -0.1, frame, 0, false, 0, -0.52); }
    p.box(0.82, 0.016, 0.58, 0, 0.16, -0.1, frame);
    p.box(0.82, 0.02, 0.02, 0, 0.43, -0.1, frame);
    // à l'intérieur : tablettes, plantes en rangs, lampes de culture
    for (const z of [-0.26, -0.1, 0.06]) {
      p.box(0.68, 0.012, 0.08, 0, 0.12, z, C.wood);
      for (let i = 0; i < 9; i++) p.sphere(0.026, -0.3 + i * 0.075, 0.15, z, [C.darkgreen, 0x7cc46a, 0x9ccf62][(i + Math.round(z * 10)) % 3], 0, 1.1);
      for (const i of [1, 4, 7]) p.sphere(0.012, -0.3 + i * 0.075, 0.18, z + 0.012, 0xd84a3e, 0);
      p.box(0.62, 0.008, 0.02, 0, 0.36, z, 0xffd8f0, 0, true);
    }
    p.box(0.14, 0.18, 0.012, 0.2, 0.05, 0.185, 0xe8f6fa); p.box(0.004, 0.18, 0.016, 0.2, 0.05, 0.19, frame);
    // dehors : cuve d'eau, caisses de légumes, brouette, bacs de culture
    p.cyl(0.06, 0.06, 0.16, 10, -0.36, 0, 0.3, 0x3c7fd8); p.cyl(0.062, 0.062, 0.01, 10, -0.36, 0.16, 0.3, 0x2e5a9a);
    for (const [x, c] of [[-0.2, 0xd84a3e], [-0.11, 0xf2a03c], [-0.155, 0x7cc46a]] as [number, number][]) { const y = x === -0.155 ? 0.05 : 0; p.box(0.08, 0.05, 0.06, x, y, 0.32, C.wood); for (let k = 0; k < 3; k++) p.sphere(0.014, x - 0.022 + k * 0.022, y + 0.055, 0.32, c, 0); }
    p.box(0.1, 0.04, 0.07, 0.1, 0.04, 0.34, 0x4f8a5a); p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateZ(Math.PI / 2), 0.04, 0.02, 0.34, 0x2a2a2a);
    for (const sd of [-1, 1]) p.add(new THREE.BoxGeometry(0.008, 0.008, 0.1), 0.15, 0.05, 0.34 + sd * 0.03, C.darkwood, 0, false, 0, 0.4);
    for (const x of [0.3]) { p.box(0.16, 0.06, 0.12, x, 0, 0.32, C.wood); p.box(0.14, 0.03, 0.1, x, 0.06, 0.32, C.darkgreen); for (let k = 0; k < 3; k++) p.sphere(0.015, x - 0.04 + k * 0.04, 0.1, 0.32, 0xf2a03c, 0); }
  }
  // la serre : carrés potagers surélevés, arrosoir, cagettes de récolte et le maraîcher
  if (age >= 4) {
    for (const [x, z] of [[0.22, 0.3], [-0.06, 0.34]]) {
      p.box(0.2, 0.05, 0.12, x, 0.012, z, 0x8a6a44); p.box(0.18, 0.01, 0.1, x, 0.062, z, 0x6a4a34);
      for (let k = 0; k < 6; k++) p.sphere(0.018, x - 0.065 + (k % 3) * 0.065, 0.08, z - 0.025 + Math.floor(k / 3) * 0.05, k % 2 ? 0x6aa84a : 0x8ac85a, 0, 0.8);
    }
    p.cyl(0.02, 0.025, 0.04, 7, 0.4, 0.012, 0.2, 0x4fa860); p.box(0.04, 0.006, 0.006, 0.43, 0.04, 0.2, 0x4fa860, 0.6);
    figure(p, 0.38, 0.38, 0x4fa860, -2.6);
  }
}

function well(p: Parts, age: number) {
  // Préhistoire : margelle de pierre, seau et petit toit de chaume (puits de Quaternius, tuiles recolorées)
  if (age === 0 && attach(['p_well'], 0, 0.6, 0, 0, Math.PI, unRed(C.thatch))) {
    // sol piétiné et humide autour de la margelle, eau sombre juste sous son rebord
    p.cyl(0.36, 0.37, 0.008, 10, 0, 0, 0, dark(C.dirt, 0.82));
    p.cyl(0.155, 0.155, 0.012, 14, 0, 0.17, 0.052, 0x4f9cc0);
    // jarres à eau, auge creusée dans un tronc, touffes de roseaux, pierres plates pour ne pas patauger
    pots(p, 0.3, 0.22, 3);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 7).rotateZ(Math.PI / 2), -0.3, 0.035, 0.26, C.wood);
    p.box(0.18, 0.012, 0.05, -0.3, 0.06, 0.26, 0x4f9cc0);
    for (const [x, z] of [[-0.36, -0.3], [0.34, -0.34], [-0.4, 0.0]]) for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.008, 0.1 + k * 0.012, 0.008).translate(0, 0.05, 0), x + Math.cos(k * 1.7) * 0.025, 0, z + Math.sin(k * 1.7) * 0.025, k % 2 ? 0x6f9e4e : 0x8aae5a, 0, false, Math.cos(k) * 0.2);
    for (const [x, z] of [[0.05, 0.38], [0.14, 0.44], [-0.06, 0.43]]) p.sphere(0.03, x, 0.004, z, C.stone, 0, 0.35);
    return;
  }
  if (age <= 2) {
    p.cyl(0.22, 0.24, 0.2, 8, 0, 0, 0, C.stone);
    p.cyl(0.17, 0.17, 0.02, 8, 0, 0.19, 0, C.water);
    if (age === 0) { p.box(0.03, 0.4, 0.03, -0.2, 0, 0, C.wood); p.box(0.03, 0.4, 0.03, 0.2, 0, 0, C.wood); p.box(0.44, 0.03, 0.03, 0, 0.4, 0, C.wood); }
    else {
      p.box(0.04, 0.42, 0.04, -0.21, 0, 0, C.wood); p.box(0.04, 0.42, 0.04, 0.21, 0, 0, C.wood);
      if (age === 1) p.gable(0.56, 0.18, 0.42, 0, 0.4, 0, C.terracotta);
      else p.pyramid(0.56, 0.24, 0.5, 0, 0.4, 0, C.slate, 0);
      p.box(0.07, 0.07, 0.07, 0, 0.22, 0.0, C.wood);
    }
  } else if (age === 3) {
    // la place de la pompe : pavés, une femme qui pompe, des seaux, un banc, un réverbère
    p.cyl(0.44, 0.45, 0.008, 14, 0, 0, 0, 0xb8b0a0);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.box(0.08, 0.004, 0.05, Math.sin(a) * 0.38, 0.008, Math.cos(a) * 0.38, dark(0xb8b0a0, 0.86 + (i % 3) * 0.06), a); }
    figure(p, -0.28, -0.08, 0x6a4a6a, Math.PI / 2, false, 0x4a3426); p.cyl(0.03, 0.025, 0.05, 8, -0.04, 0.1, 0.12, C.metal);
    for (const [x, z] of [[0.28, 0.32], [0.36, 0.26]]) p.cyl(0.03, 0.025, 0.05, 8, x, 0.008, z, C.metal);
    p.box(0.2, 0.02, 0.06, -0.3, 0.05, 0.32, C.wood, 0.4); for (const d of [-0.07, 0.07]) p.box(0.015, 0.05, 0.05, -0.3 + d * Math.cos(0.4), 0.008, 0.32 - d * Math.sin(0.4), 0x3c4a44, 0.4);
    lampPost(p, 0.34, -0.32, 0.32);
    p.box(0.4, 0.1, 0.2, 0.0, 0, 0.1, C.darkstone);
    p.box(0.14, 0.2, 0.14, -0.12, 0, -0.1, C.metal);
    p.cyl(0.035, 0.05, 0.4, 6, -0.12, 0.2, -0.1, C.roofdark);
    p.box(0.18, 0.03, 0.04, -0.04, 0.55, -0.1, C.roofdark);
    p.box(0.3, 0.02, 0.14, 0.05, 0.1, 0.1, C.water);
  } else {
    // fontaine de la place : dallage en couronnes, bassin octogonal à margelle, vasques étagées, jets en gerbe vers le
    // centre, lumières sous l'eau la nuit, bancs tournés vers elle, bornes lumineuses, jardinières fleuries
    const rim = 0xf2ece0, jet = 0xcdeef7;
    p.cyl(0.47, 0.47, 0.012, 16, 0, 0, 0, 0xd8d2c4);
    p.cyl(0.41, 0.41, 0.004, 16, 0, 0.012, 0, 0xc8c0b0);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.box(0.004, 0.003, 0.06, Math.cos(a) * 0.44, 0.012, Math.sin(a) * 0.44, 0xb8b0a0, -a); }
    p.cyl(0.32, 0.34, 0.1, 8, 0, 0.016, 0, 0xe8e2d4, false, Math.PI / 8);
    p.cyl(0.335, 0.335, 0.022, 8, 0, 0.112, 0, rim, false, Math.PI / 8);
    p.cyl(0.29, 0.29, 0.01, 8, 0, 0.1, 0, 0x6fb8d0, false, Math.PI / 8);
    for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * Math.PI * 2; p.box(0.024, 0.008, 0.024, Math.cos(a) * 0.26, 0.098, Math.sin(a) * 0.26, 0xbfe8ff, 0, true); }
    // vasques et jet central
    p.cyl(0.05, 0.07, 0.16, 8, 0, 0.1, 0, rim);
    p.cyl(0.16, 0.06, 0.045, 12, 0, 0.255, 0, rim);
    p.cyl(0.14, 0.14, 0.008, 12, 0, 0.292, 0, 0x8fd0e4);
    p.cyl(0.03, 0.04, 0.12, 8, 0, 0.3, 0, rim);
    p.cyl(0.085, 0.035, 0.03, 10, 0, 0.415, 0, rim);
    p.cyl(0.07, 0.07, 0.006, 10, 0, 0.44, 0, 0x8fd0e4);
    p.cyl(0.01, 0.018, 0.16, 6, 0, 0.44, 0, jet);
    p.sphere(0.028, 0, 0.61, 0, 0xe4f6ff, 1);
    // nappes qui tombent des vasques, gerbes de la margelle vers le centre
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.04, 0.15, 0.006, Math.cos(a) * 0.15, 0.11, Math.sin(a) * 0.15, jet, -a + Math.PI / 2); }
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      p.add(new THREE.CylinderGeometry(0.005, 0.009, 0.17, 4).translate(0, 0.085, 0).rotateZ(0.62).rotateY(-a), Math.cos(a) * 0.29, 0.11, Math.sin(a) * 0.29, jet);
    }
    // bancs, bornes lumineuses, jardinières
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 0.405, z = Math.sin(a) * 0.405;
      p.box(0.14, 0.018, 0.045, x, 0.04, z, C.wood, -a + Math.PI / 2);
      for (const d of [-0.05, 0.05]) p.box(0.016, 0.03, 0.04, x - Math.sin(a) * d, 0.012, z + Math.cos(a) * d, 0x5d6878, -a + Math.PI / 2);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, x = Math.cos(a) * 0.43, z = Math.sin(a) * 0.43;
      if (i % 2) { p.cyl(0.012, 0.014, 0.08, 6, x, 0.012, z, 0x5d6878); p.cyl(0.016, 0.016, 0.016, 6, x, 0.09, z, 0xffe2a0, true); }
      else { p.box(0.08, 0.05, 0.08, x, 0.012, z, 0x8a8a8a); for (let k = 0; k < 4; k++) p.sphere(0.018, x + (k % 2 ? 0.018 : -0.018), 0.075, z + (k < 2 ? 0.018 : -0.018), [C.pink, C.butter, 0xd84a3e, C.lav][k], 0, 0.8); }
    }
  }
}

function workshop(p: Parts, age: number, o: ModelOpts) {
  if (age === 0 && hasModel('p_roof')) {
    // atelier du tailleur de pierre : appentis de bois, établi dessous, meule, blocs à tailler, rondins, éclats au sol
    p.cyl(0.47, 0.48, 0.01, 12, 0, 0, 0, dark(C.dirt, 0.95));
    attach(['p_roof'], 0, 0.36, -0.22, -0.26, 0, toWood, 0.6);
    attach(['p_workbench'], 0, 0.24, 0.02, 0.04, 0, toWood);
    attach(['p_grind'], 0, 0.2, 0.28, -0.18, -0.7, toWood);
    attach(['p_stone'], 0, 0.12, 0.3, 0.24, 0.4);
    attach(['p_stone'], 0, 0.09, 0.16, 0.34, 1.2);
    attach(['p_logs'], 0, 0.26, -0.26, 0.28, 0.35);
    for (let i = 0; i < 8; i++) p.sphere(0.016, 0.05 + Math.cos(i * 2.3) * 0.12, 0.008, 0.26 + Math.sin(i * 2.3) * 0.06, i % 2 ? C.stone : C.darkstone, 0, 0.5);
    // peau étalée où sèchent les outils de silex taillés, haches emmanchées, billot du tailleur, lances, foyer
    p.add(new THREE.CircleGeometry(0.09, 7).rotateX(-Math.PI / 2).scale(1.3, 1, 0.9), -0.3, 0.012, 0.0, C.hide);
    for (let k = 0; k < 5; k++) p.add(new THREE.ConeGeometry(0.012, 0.035, 3).rotateZ(Math.PI / 2), -0.36 + k * 0.03, 0.02, -0.01 + (k % 2) * 0.03, k % 2 ? C.darkstone : 0x6a6660, k);
    for (const z of [-0.08, -0.13]) { p.add(new THREE.BoxGeometry(0.1, 0.008, 0.008), -0.22, 0.02, z, C.wood, 0.3); p.box(0.025, 0.02, 0.03, -0.18, 0.012, z - 0.012, C.darkstone, 0.3); }
    p.cyl(0.04, 0.045, 0.06, 7, -0.06, 0, -0.38, C.wood); p.cyl(0.038, 0.038, 0.004, 7, -0.06, 0.06, -0.38, 0xd8b88a);
    spears(p, 0.4, -0.05, 1.4, 3);
    hearth(p, 0.38, 0.4);
  } else if (age === 0) {
    p.cone(0.38, 0.5, 5, -0.12, 0, -0.1, C.hide);
    p.box(0.16, 0.1, 0.12, 0.28, 0, 0.2, C.darkstone); p.box(0.1, 0.06, 0.08, 0.28, 0.1, 0.2, C.stone);
    p.box(0.04, 0.34, 0.04, -0.34, 0, 0.3, C.wood); p.box(0.04, 0.34, 0.04, 0.0, 0, 0.3, C.wood); p.box(0.4, 0.03, 0.03, -0.17, 0.32, 0.3, C.wood);
    p.box(0.1, 0.1, 0.02, -0.12, 0, 0.12, C.win, 0, true);
  } else if (age === 1) {
    // atelier du potier : maison de terre au toit de tuiles et son auvent, étagères de pots qui sèchent, le potier à son tour,
    // fosse d'argile et auge, four en ruche qui rougeoie et son bois, amphores couchées et debout, tessons, étal des vases
    const clay = 0xb8704e, raw = 0xd9b48a, mud = 0xe6d2ae;
    p.cyl(0.47, 0.48, 0.01, 12, 0, 0, 0, dark(C.dirt, 0.95));
    for (const [x, z, r] of [[-0.3, 0.22, 0.12], [0.0, 0.08, 0.09], [0.3, -0.1, 0.08]]) p.add(new THREE.CircleGeometry(r, 8).rotateX(-Math.PI / 2), x, 0.011, z, dark(clay, 1.08));
    p.box(0.6, 0.22, 0.24, -0.14, 0.01, -0.33, mud);
    roof(p, -0.14, 0.23, -0.33, { w: 0.6, d: 0.24, h: 0.1, color: C.terracotta, wall: mud, tiles: true, ov: 0.03 });
    p.box(0.1, 0.15, 0.01, 0.06, 0.01, -0.206, 0x5a4434);
    tiledShed(p, -0.14, 0.205, -0.13, 0.6, 0.16, -0.3);
    for (const x of [-0.42, 0.14]) p.box(0.02, 0.18, 0.02, x, 0.01, -0.06, C.darkwood);
    // étagères sous l'auvent, chargées de pots crus et cuits
    for (const y of [0.06, 0.13]) {
      p.box(0.36, 0.01, 0.05, -0.21, y, -0.185, C.wood);
      for (let i = 0; i < 6; i++) {
        const x = -0.36 + i * 0.06, c = (i + y * 10) % 3 < 1 ? clay : raw;
        if (i % 2) p.cyl(0.014, 0.018, 0.034, 6, x, y + 0.01, -0.185, c);
        else { p.sphere(0.018, x, y + 0.028, -0.185, c, 0, 0.9); p.cyl(0.008, 0.01, 0.014, 6, x, y + 0.04, -0.185, c); }
      }
    }
    for (const x of [-0.39, -0.03]) p.box(0.012, 0.14, 0.04, x, 0.01, -0.185, C.darkwood);
    // le potier à son tour : il tourne un vase, la roue lancée du pied (dessiné à 1/1,6 d'un habitant, il est ramené à sa
    // taille avec sa roue, quand l'atelier grandit aussi)
    const wx = -0.02, wz = 0.06;
    lifeSize(p, wx, 0.01, wz + 0.04, () => {
      p.cyl(0.035, 0.04, 0.02, 8, wx, 0.01, wz, C.darkwood); p.cyl(0.006, 0.006, 0.03, 4, wx, 0.03, wz, C.darkwood);
      p.cyl(0.04, 0.04, 0.008, 10, wx, 0.055, wz, C.wood);
      p.cyl(0.016, 0.022, 0.036, 8, wx, 0.063, wz, raw); p.cyl(0.019, 0.016, 0.008, 8, wx, 0.099, wz, raw);
      p.cyl(0.02, 0.02, 0.04, 6, wx, 0.01, wz + 0.08, C.wood);
      p.box(0.034, 0.042, 0.024, wx, 0.05, wz + 0.082, 0xc8a070);
      p.box(0.02, 0.02, 0.02, wx, 0.092, wz + 0.08, 0xe8b894); p.box(0.022, 0.007, 0.022, wx, 0.112, wz + 0.08, 0x4a3426);
      for (const d of [-1, 1]) { p.box(0.008, 0.008, 0.045, wx + d * 0.016, 0.075, wz + 0.05, 0xe8b894); p.box(0.01, 0.022, 0.012, wx + d * 0.01, 0.03, wz + 0.05, 0x6a5440); }
    }, 1.6);
    // fosse d'argile, motte, pelle plantée, auge d'eau
    p.cyl(0.11, 0.1, 0.012, 9, -0.3, 0.005, 0.22, 0x8a5038);
    p.sphere(0.06, -0.33, 0.025, 0.2, clay, 0, 0.6); p.sphere(0.03, -0.24, 0.02, 0.25, dark(clay, 0.9), 0, 0.7);
    p.add(new THREE.BoxGeometry(0.008, 0.13, 0.008), -0.22, 0.075, 0.16, C.wood, 0, false, 0.35); p.box(0.03, 0.04, 0.006, -0.2, 0.01, 0.16, C.metal, 0, false, 0.35);
    p.box(0.14, 0.04, 0.06, -0.33, 0.01, 0.39, C.wood); p.box(0.12, 0.004, 0.045, -0.33, 0.046, 0.39, C.water);
    // le four en ruche : cerclage de brique, gueule qui rougeoie, cheminée qui fume ; le bois de chauffe à côté
    p.cyl(0.11, 0.12, 0.12, 10, 0.31, 0.01, -0.28, 0xb4624a);
    p.sphere(0.11, 0.31, 0.13, -0.28, 0xa8573f, 1, 0.75);
    for (const y of [0.05, 0.1]) p.add(new THREE.TorusGeometry(0.116, 0.007, 4, 12).rotateX(Math.PI / 2), 0.31, y, -0.28, dark(0xb4624a, 0.82));
    p.cyl(0.025, 0.03, 0.07, 6, 0.31, 0.19, -0.28, 0x8a4a38);
    p.box(0.08, 0.065, 0.015, 0.31, 0.01, -0.172, 0x5a3426); p.box(0.055, 0.045, 0.012, 0.31, 0.012, -0.166, C.flame, 0, true);
    smoke(0.31, 0.27, -0.28, 1);
    for (let k = 0; k < 7; k++) log(p, 0.16, 0.016, 0.31, 0.01 + (k > 3 ? 0.03 : 0), -0.11 + (k % 4) * 0.034 + (k > 3 ? 0.017 : 0));
    // planche où sèchent les pots crus, sur deux pierres
    for (const x of [0.06, 0.26]) p.box(0.04, 0.03, 0.05, x, 0.01, 0.22, C.stone);
    p.box(0.26, 0.012, 0.06, 0.16, 0.04, 0.22, C.wood);
    for (let i = 0; i < 5; i++) { const x = 0.06 + i * 0.05; if (i % 2) p.cyl(0.016, 0.01, 0.014, 7, x, 0.052, 0.22, raw); else p.cyl(0.012, 0.016, 0.03, 6, x, 0.052, 0.22, raw); }
    // amphores couchées en pile, d'autres debout ; tessons au rebut
    for (const [x, y, z] of [[0.34, 0.03, 0.06], [0.34, 0.03, 0.11], [0.34, 0.03, 0.16], [0.34, 0.068, 0.085], [0.34, 0.068, 0.135]]) {
      p.add(new THREE.CylinderGeometry(0.02, 0.012, 0.09, 7).rotateZ(Math.PI / 2), x, y, z, clay);
      p.add(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 6).rotateZ(Math.PI / 2), x - 0.058, y, z, clay);
    }
    attach(['a_amphora'], 0, 0.06, 0.42, 0.3);
    attach(['a_amphora'], 0, 0.055, 0.36, 0.38, 0.6);
    for (let i = 0; i < 9; i++) p.add(new THREE.TetrahedronGeometry(0.014, 0), -0.4 + Math.cos(i * 2.4) * 0.035, 0.016, -0.04 + Math.sin(i * 2.4) * 0.03, i % 2 ? clay : dark(clay, 0.85), i);
    // l'étal des vases au bord de la rue
    p.box(0.22, 0.012, 0.08, -0.02, 0.07, 0.4, C.wood); for (const d of [-0.09, 0.09]) p.box(0.012, 0.06, 0.06, -0.02 + d, 0.01, 0.4, C.darkwood);
    if (attach(['a_vases'], 0, 0.16, -0.02, 0.4)) lift(0.082);
    else for (let i = 0; i < 4; i++) p.cyl(0.014, 0.018, 0.05, 7, -0.09 + i * 0.045, 0.082, 0.4, i % 2 ? clay : 0x2f3a44);
    attach(['a_jug'], 0, 0.05, 0.12, 0.42);
  } else if (age === 2) {
    // forge : maison de pierre au toit d'ardoise et grande cheminée, appentis où rougeoie le foyer, enclume et tonneau devant
    p.box(0.58, 0.04, 0.44, 0.08, 0, -0.12, C.darkstone); p.box(0.56, 0.32, 0.42, 0.08, 0.04, -0.12, C.stone);
    roof(p, 0.08, 0.36, -0.12, { w: 0.56, d: 0.42, h: 0.28, color: C.slate, wall: C.stone, ov: 0.07 });
    p.box(0.13, 0.66, 0.13, 0.28, 0.04, -0.2, C.darkstone); p.box(0.15, 0.04, 0.15, 0.28, 0.7, -0.2, 0x7d7870);
    smoke(0.28, 0.76, -0.2, 1);
    p.box(0.12, 0.2, 0.02, 0.16, 0.04, 0.1, C.door); p.box(0.09, 0.08, 0.02, -0.06, 0.16, 0.1, C.win, 0, true);
    // l'appareil de pierre, les chaînages d'angle, les volets, l'enseigne au fer à cheval
    stones(p, 0.08, 0.09, 0.56, 0.04, 0.36, 0, dark(C.stone, 0.88), 0.5, 700);
    stones(p, 0.36, -0.12, 0.42, 0.04, 0.36, Math.PI / 2, dark(C.stone, 0.88), 0.5, 701);
    for (const x of [-0.2, 0.36]) quoins(p, x, 0.09, 0.04, 0.36, x < 0 ? -1 : 1, 1);
    for (const s of [-1, 1]) p.box(0.03, 0.08, 0.008, -0.06 + s * 0.06, 0.16, 0.112, 0x5a6a4a);
    p.box(0.008, 0.008, 0.08, 0.3, 0.3, 0.13, C.darkwood); p.box(0.004, 0.04, 0.004, 0.33, 0.27, 0.17, 0x3c3c40);
    p.add(new THREE.TorusGeometry(0.022, 0.006, 4, 10, Math.PI * 1.4), 0.33, 0.235, 0.17, 0x55595f, 0, false, Math.PI * 0.8);
    // appentis de planches sur deux poteaux
    for (const x of [-0.38, -0.04]) p.box(0.03, 0.3, 0.03, x, 0, 0.36, C.darkwood);
    p.add(new THREE.BoxGeometry(0.4, 0.02, 0.3), -0.21, 0.32, 0.24, C.wood, 0, false, 0, 0.22);
    // foyer maçonné, braises, hotte
    p.box(0.2, 0.12, 0.14, -0.22, 0, 0.17, C.darkstone); p.box(0.14, 0.02, 0.09, -0.22, 0.12, 0.17, C.flame, 0, true);
    p.pyramid(0.17, 0.13, 0.13, -0.22, 0.18, 0.15, 0x6f6a64);
    // enclume sur billot, tonneau d'eau
    p.cyl(0.04, 0.045, 0.07, 7, 0.08, 0, 0.32, C.darkwood); p.box(0.09, 0.03, 0.04, 0.08, 0.07, 0.32, 0x55595f); p.box(0.04, 0.02, 0.03, 0.135, 0.08, 0.32, 0x55595f);
    p.cyl(0.045, 0.04, 0.09, 8, 0.24, 0, 0.3, 0x9a6a44); p.cyl(0.04, 0.04, 0.005, 8, 0.24, 0.09, 0.3, C.water);
    // le râtelier d'outils contre le mur, les fers en tas, le soufflet
    p.box(0.012, 0.16, 0.012, -0.32, 0.04, 0.1, C.darkwood); p.box(0.12, 0.012, 0.012, -0.32, 0.16, 0.1, C.darkwood);
    for (let k = 0; k < 3; k++) p.box(0.006, 0.1, 0.006, -0.36 + k * 0.04, 0.06, 0.106, 0x55595f);
    for (let k = 0; k < 4; k++) p.box(0.05, 0.008, 0.012, 0.0 + (k % 2) * 0.012, 0.004 + k * 0.008, 0.42, 0x4a4a4e, k);
    p.box(0.08, 0.03, 0.05, -0.36, 0.06, 0.2, 0x6a4a30); p.cone(0.012, 0.05, 4, -0.36, 0.075, 0.25, 0x3c3c40);
  } else if (age === 3) {
    // usine de brique : grande halle aux toits en dents de scie vitrés, haute cheminée cerclée, bureaux à l'avant ; et sa cour
    sink(0.012);
    const brick = 0xa85e50, hx = -0.08, hz = -0.16, W = 0.62, D = 0.42, H = 0.24;
    p.box(W, H, D, hx, 0.012, hz, brick);
    stones(p, hx, hz + D / 2, W, 0.012, H, 0, dark(brick, 0.86), 0.45, 370);
    stones(p, hx - W / 2, hz, D, 0.012, H, -Math.PI / 2, dark(brick, 0.86), 0.45, 371);
    for (const x of [hx - W / 2, hx + W / 2]) quoins(p, x, hz + D / 2, 0.012, H, x < hx ? -1 : 1, 1, 0xd8d0c0);
    p.box(W + 0.02, 0.02, D + 0.02, hx, H, hz, 0xd8d0c0);
    for (let i = 0; i < 4; i++) {
      const x = hx - W / 2 + (i + 0.5) * (W / 4);
      p.add(new THREE.BoxGeometry(W / 4 + 0.01, 0.012, D + 0.02).translate(0, 0.045, 0), x, H + 0.01, hz, 0x5d6878, 0, false, 0.5);
      p.box(0.01, 0.085, D, x + W / 8 - 0.004, H + 0.012, hz, C.glass, 0, true);
      for (let k = 0; k < 4; k++) p.box(0.012, 0.085, 0.008, x + W / 8 - 0.002, H + 0.012, hz - D / 2 + (k + 0.5) * (D / 4), 0x3c4a54);
    }
    windows(p, [hx - 0.22, hx - 0.07, hx + 0.22], 0.08, hz + D / 2 + 0.01, 0.08, 0.1, 0xd8d0c0);
    p.box(0.13, 0.17, 0.016, hx + 0.08, 0.012, hz + D / 2 + 0.006, 0x4a5a64); for (let y = 0.04; y < 0.17; y += 0.03) p.box(0.13, 0.004, 0.018, hx + 0.08, y, hz + D / 2 + 0.008, 0x3a4a54);
    p.add(new THREE.BoxGeometry(0.18, 0.01, 0.08), hx + 0.08, 0.2, hz + D / 2 + 0.04, 0x5d6878, 0, false, 0, 0.25);
    // haute cheminée de brique cerclée de fer, qui fume
    p.cyl(0.035, 0.055, 0.86, 10, 0.3, 0.012, -0.34, brick);
    for (const y of [0.3, 0.55, 0.78]) p.cyl(0.046 - y * 0.012, 0.046 - y * 0.012, 0.014, 10, 0.3, y, -0.34, 0x3c3c40);
    p.cyl(0.045, 0.04, 0.03, 10, 0.3, 0.86, -0.34, 0xd8d0c0);
    smoke(0.3, 0.92, -0.34, 2);
    // bureaux sur deux niveaux, enseigne
    p.box(0.22, 0.3, 0.16, -0.3, 0.012, 0.12, 0xd8c8a8); p.box(0.24, 0.02, 0.18, -0.3, 0.31, 0.12, 0x5d6878);
    windows(p, [-0.35, -0.25], 0.06, 0.205, 0.05, 0.07, C.white); windows(p, [-0.35, -0.25], 0.19, 0.205, 0.05, 0.07, C.white);
    p.box(0.2, 0.045, 0.01, -0.3, 0.33, 0.12, C.cream); for (let k = 0; k < 5; k++) p.box(0.022, 0.025, 0.004, -0.37 + k * 0.035, 0.34, 0.127, 0x3c3530);
    const tx = 0.36, tz = -0.3;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.014, 0.32, 0.014).translate(0, 0.16, 0), tx + dx * 0.05, 0.012, tz + 0.18 + dz * 0.05, 0x4a5560, 0, false, -dx * 0.08, dz * 0.08);
    p.cyl(0.075, 0.075, 0.1, 10, tx, 0.32, tz + 0.18, 0x8a6a4a); for (const y of [0.34, 0.39]) p.cyl(0.077, 0.077, 0.008, 10, tx, y, tz + 0.18, 0x4a4a4a);
    p.cone(0.085, 0.05, 10, tx, 0.42, tz + 0.18, 0x5d6878);
    for (let i = 0; i < 9; i++) p.box(0.1, 0.008, 0.02, 0.4, 0.012, -0.05 + i * 0.06, C.darkwood);
    for (const s of [-1, 1]) p.box(0.006, 0.01, 0.52, 0.4 + s * 0.03, 0.02, 0.19, C.metal);
    p.box(0.08, 0.07, 0.17, 0.4, 0.04, 0.24, 0x8a3a2e); p.box(0.085, 0.01, 0.18, 0.4, 0.11, 0.24, 0x5a2a22);
    for (const d of [-0.05, 0.05]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateZ(Math.PI / 2), 0.4 + s * 0.035, 0.03, 0.24 + d, 0x2a2a2a);
    for (const [x, z, r] of [[0.15, 0.3, 0], [0.22, 0.34, 0.5], [0.17, 0.38, 1.1]]) p.box(0.06, 0.05, 0.06, x, 0.012, z, 0xb48a5e, r);
    for (const [x, z] of [[-0.05, 0.36], [0.02, 0.38]]) { p.cyl(0.026, 0.026, 0.06, 8, x, 0.012, z, 0x6a7a8a); p.cyl(0.027, 0.027, 0.006, 8, x, 0.04, z, 0x3c3c40); }
    p.cone(0.11, 0.09, 8, -0.36, 0.012, 0.3, 0x2a2826);
    p.box(0.012, 0.16, 0.012, -0.32, 0.012, 0.44, 0x3c4a44); p.box(0.012, 0.16, 0.012, -0.12, 0.012, 0.44, 0x3c4a44);
    p.box(0.22, 0.05, 0.01, -0.22, 0.14, 0.44, C.cream); for (let k = 0; k < 5; k++) p.box(0.022, 0.025, 0.004, -0.29 + k * 0.035, 0.152, 0.447, 0x3c3530);
    p.cyl(0.005, 0.007, 0.2, 5, 0.06, 0.012, 0.44, 0x3c4a44); p.box(0.025, 0.03, 0.025, 0.06, 0.21, 0.44, 0xffe2a0, 0, true);
  } else if (age === 3) {
    p.box(0.8, 0.36, 0.6, 0, 0, 0.02, C.brick);
    for (const x of [-0.27, 0, 0.27]) p.gable(0.27, 0.13, 0.62, x, 0.36, 0.02, C.slate);
    p.cyl(0.06, 0.08, 0.75, 8, 0.3, 0.3, -0.18, C.darkbrick); p.cyl(0.07, 0.07, 0.04, 8, 0.3, 1.0, -0.18, C.darkstone);
    smoke(0.3, 1.06, -0.18, 2);
    for (const x of [-0.26, 0, 0.26]) p.box(0.14, 0.12, 0.02, x, 0.12, 0.33, C.win, 0, true);
  } else modernOffice(p, o.v);
}

function gather(p: Parts, age: number, o: ModelOpts) {
  if (age === 0) {
    p.cyl(0.14, 0.15, 0.015, 8, 0, 0, 0, dark(C.dirt, 0.55));
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; p.sphere(0.055, Math.cos(a) * 0.19, 0.02, Math.sin(a) * 0.19, i % 2 ? C.darkstone : C.stone, 0, 0.7); }
    p.box(0.3, 0.05, 0.05, 0, 0.02, 0, C.darkwood, 0.6); p.box(0.3, 0.05, 0.05, 0, 0.02, 0, C.wood, -0.6);
    p.cone(0.1, 0.28, 5, 0, 0.05, 0, C.flame, true);
    smoke(0, 0.36, 0, 1);
    log(p, 0.32, 0.04, 0, 0, -0.38); log(p, 0.32, 0.04, -0.34, 0, 0.17, 1.1); log(p, 0.32, 0.04, 0.34, 0, 0.17, -1.1);
  } else if (age === 1 && attach(['a_plaza'], 0, 0.86, 0, -0.02)) {
    // agora : la place dallée à fontaine remplit la parcelle ; sur les dalles des coins du fond l'étal du marchand et ses
    // jarres, sur celles de devant deux bancs de marbre tournés vers la fontaine. Rien ne déborde sur la rue
    const top = 0.03;
    if (attach(['a_stall'], 0, 0.19, 0.33, -0.35, -0.78)) lift(top);
    if (attach(['a_pot'], 0, 0.06, -0.37, -0.3)) lift(top);
    if (attach(['a_jug'], 0, 0.045, -0.3, -0.38, 0.8)) lift(top);
    if (attach(['a_amphora'], 0, 0.05, -0.38, -0.39)) lift(top);
    for (const [x, r] of [[0.34, Math.PI / 4], [-0.34, -Math.PI / 4]]) {
      for (const d of [-0.055, 0.055]) p.box(0.03, 0.04, 0.06, x + Math.cos(r) * d, top, 0.31 - Math.sin(r) * d, C.stone, r);
      p.box(0.16, 0.018, 0.07, x, top + 0.04, 0.31, 0xf2ead8, r);
    }
    // des citoyens en toge discutent près de la fontaine ; un marchand derrière son étal
    for (const [x, z, c, r] of [[0.1, 0.4, 0xf2ead8, Math.PI], [-0.08, 0.42, 0xe9e2d4, 2.6], [0.38, 0.05, 0xc8a0d8, -1.6], [0.36, -0.24, 0xb8443a, Math.PI]] as number[][]) figure(p, x, z, c, r);
    // deux oliviers dans leurs bacs de pierre, et un brasero de bronze qui fume entre les bancs
    for (const [x, z] of [[-0.24, -0.21], [0.25, 0.245]]) {
      p.cyl(0.055, 0.05, 0.045, 10, x, top, z, 0xd8ccb4); p.cyl(0.048, 0.048, 0.006, 10, x, top + 0.045, z, 0x7a5a42);
      p.cyl(0.01, 0.016, 0.1, 5, x, top + 0.045, z, 0x7a6450);
      for (const [dx, dy, dz, r] of [[0, 0.16, 0, 0.06], [0.04, 0.13, 0.025, 0.045], [-0.035, 0.135, -0.02, 0.042]]) p.sphere(r, x + dx, top + dy, z + dz, 0x8aa070, 0, 0.7);
    }
    for (let k = 0; k < 3; k++) { const a = k * 2.094; p.box(0.006, 0.08, 0.006, -0.22 + Math.cos(a) * 0.02, top, 0.22 + Math.sin(a) * 0.02, 0xa8783a); }
    p.cyl(0.032, 0.018, 0.025, 8, -0.22, top + 0.08, 0.22, 0xb88a42); p.cone(0.02, 0.05, 5, -0.22, top + 0.1, 0.22, C.flame, true);
    smoke(-0.22, top + 0.16, 0.22, 1);
  } else if (age === 1) {
    p.cyl(0.46, 0.46, 0.04, 12, 0, 0, 0, 0xe6dccb);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; p.cyl(0.04, 0.045, 0.34, 6, Math.cos(a) * 0.34, 0.04, Math.sin(a) * 0.34, C.white); }
    p.box(0.14, 0.14, 0.14, 0, 0.04, 0, C.stone); p.sphere(0.07, 0, 0.2, 0, C.white, 1);
    p.box(0.3, 0.05, 0.1, 0, 0.04, 0.3, C.stone); p.box(0.3, 0.05, 0.1, 0, 0.04, -0.3, C.stone);
  } else if (age === 2) {
    // marché : étals de bois sous des auvents rayés à lambrequin, fruits, caisses et tonneaux
    const cols = [0xd8584e, 0x4f7fc4, 0x6fae6a];
    for (const [x, z] of [[0.38, 0.32], [-0.4, 0.3]]) { p.cyl(0.05, 0.045, 0.1, 8, x, 0, z, 0x9a6a44); p.cyl(0.052, 0.052, 0.008, 8, x, 0.04, z, C.darkwood); }
    [[-0.22, -0.2], [0.22, -0.2], [0, 0.2]].forEach(([x, z], i) => {
      p.box(0.3, 0.1, 0.16, x, 0, z, C.wood);
      for (const sx of [-0.14, 0.14]) { p.box(0.022, 0.32, 0.022, x + sx, 0, z - 0.08, C.darkwood); p.box(0.022, 0.25, 0.022, x + sx, 0, z + 0.08, C.darkwood); }
      for (let k = 0; k < 4; k++) {
        const sxk = x - 0.13 + k * 0.087, col = k % 2 ? 0xf4e8d0 : cols[i];
        p.add(new THREE.BoxGeometry(0.088, 0.012, 0.26), sxk, 0.29, z, col, 0, false, 0, 0.27);
        for (const t of [-0.022, 0.022]) p.add(new THREE.ConeGeometry(0.022, 0.04, 3).rotateZ(Math.PI), sxk + t, 0.21, z + 0.125, col);
      }
      for (const [fx, fc] of [[-0.08, C.red], [0, C.gold], [0.08, 0x7cc46a]] as [number, number][]) p.sphere(0.035, x + fx, 0.12, z + 0.02, fc, 0, 0.8);
      p.box(0.07, 0.06, 0.07, x + 0.18, 0, z + 0.12, 0xb48a5e, 0.4);
    });
  } else if (age === 3) {
    // le square : pelouse, allées de gravier en croix, bassin et son jet, quatre arbres ronds, bancs, réverbères, massifs, promeneurs
    p.box(0.92, 0.008, 0.92, 0, 0, 0, 0x8fc47e);
    p.box(0.12, 0.004, 0.92, 0, 0.008, 0, 0xe2d6bc); p.box(0.92, 0.004, 0.12, 0, 0.008, 0, 0xe2d6bc);
    p.cyl(0.17, 0.18, 0.05, 14, 0, 0.008, 0, C.stone); p.cyl(0.15, 0.15, 0.006, 14, 0, 0.052, 0, C.water);
    p.cyl(0.02, 0.03, 0.1, 6, 0, 0.05, 0, C.stone); p.cyl(0.05, 0.03, 0.02, 8, 0, 0.15, 0, C.stone); p.cyl(0.005, 0.012, 0.1, 5, 0, 0.17, 0, 0xcfeaf4);
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) tree(p, x, z, 1.15);
    for (const [x, z, r] of [[0, -0.36, 0], [0.36, 0.02, Math.PI / 2]] as number[][]) {
      p.box(0.18, 0.016, 0.06, x, 0.05, z, C.wood, r); p.box(0.18, 0.05, 0.012, x - (r ? 0.03 : 0), 0.066, z - (r ? 0 : 0.03), C.wood, r);
      for (const d of [-0.07, 0.07]) p.box(0.012, 0.05, 0.05, x + (r ? 0 : d), 0.008, z + (r ? d : 0), 0x3c4a44, r);
    }
    lampPost(p, -0.16, -0.16, 0.3); lampPost(p, 0.16, 0.16, 0.3);
    for (const [x, z] of [[-0.42, 0.14], [-0.14, 0.42], [0.42, -0.14], [0.14, -0.42]]) for (let k = 0; k < 3; k++) p.sphere(0.025, x + (Math.abs(x) > 0.3 ? 0 : (k - 1) * 0.05), 0.02, z + (Math.abs(z) > 0.3 ? 0 : (k - 1) * 0.05), [C.pink, C.butter, 0xd84a3e][k], 0, 0.7);
    figure(p, -0.06, 0.26, 0x3c3c48, Math.PI); figure(p, 0.2, -0.1, 0x8a3a3a, 2.2); seated(p, 0.02, 0.066, -0.36, 0, 0x5a4a6a);
  } else {
    // la place : dalles claires, bassin et ses jets, arbres en bacs, bancs, lampadaires, passants
    p.box(0.92, 0.01, 0.92, 0, 0, 0, 0xe2ded6);
    for (let i = 0; i < 7; i++) { p.box(0.92, 0.003, 0.006, 0, 0.01, -0.42 + i * 0.14, 0xc8c4bc); p.box(0.006, 0.003, 0.92, -0.42 + i * 0.14, 0.01, 0, 0xc8c4bc); }
    p.box(0.34, 0.04, 0.34, 0, 0.01, 0, 0xb8bcc4); p.box(0.3, 0.006, 0.3, 0, 0.046, 0, C.water);
    for (const [x, z] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08], [0, 0]]) p.cyl(0.004, 0.009, x || z ? 0.1 : 0.16, 4, x, 0.05, z, 0xcfeaf4);
    for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) { p.box(0.13, 0.06, 0.13, x, 0.01, z, 0x8a8a8a); tree(p, x, z, 1.05); }
    for (const [x, z, r] of [[0, 0.3, 0], [0, -0.3, Math.PI], [0.3, 0, Math.PI / 2]] as number[][]) { p.box(0.2, 0.02, 0.06, x, 0.05, z, C.white, r); for (const d of [-0.07, 0.07]) p.box(0.02, 0.04, 0.05, x + (r === Math.PI / 2 ? 0 : d), 0.01, z + (r === Math.PI / 2 ? d : 0), 0x6b7280, r); }
    for (const x of [-0.42, 0.42]) { p.cyl(0.007, 0.007, 0.34, 5, x, 0.01, 0, 0x8a9098); p.box(0.05, 0.01, 0.05, x, 0.35, 0, 0xfff1c9, 0, true); }
    figure(p, -0.2, 0.18, 0xd8786c, 2.8); figure(p, 0.18, 0.2, 0x3a6ab8, -2.4); seated(p, -0.04, 0.07, -0.3, Math.PI, 0x6a8a4a);
    // margelle blanche où l'on s'assoit, spots sous l'eau, couronne de petits jets ; fleurs au pied des arbres
    for (const s of [-1, 1]) { p.box(0.36, 0.012, 0.03, 0, 0.05, s * 0.17, 0xf4f2ee); p.box(0.03, 0.012, 0.31, s * 0.17, 0.05, 0, 0xf4f2ee); }
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) p.box(0.02, 0.004, 0.02, x, 0.05, z, 0xbfe8ff, 0, true);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.cyl(0.003, 0.006, 0.06, 4, Math.cos(a) * 0.11, 0.05, Math.sin(a) * 0.11, 0xcfeaf4); }
    for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) for (let k = 0; k < 4; k++) p.sphere(0.014, x + (k % 2 ? 0.045 : -0.045), 0.074, z + (k < 2 ? 0.045 : -0.045), [C.pink, C.butter, 0xd84a3e, C.lav][k]);
    // kiosque à café : chariot vert, comptoir, percolateur, parasol, ardoise ; le barista et son client
    p.box(0.15, 0.09, 0.09, -0.3, 0.02, -0.12, 0x3f7a5a); p.box(0.17, 0.01, 0.1, -0.3, 0.11, -0.12, 0xd8d6d0);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8).rotateX(Math.PI / 2), -0.3 + s * 0.05, 0.03, -0.07, 0x2a2a2e);
    p.box(0.04, 0.045, 0.035, -0.33, 0.12, -0.13, 0xc4cad2); p.cyl(0.008, 0.008, 0.02, 6, -0.27, 0.12, -0.11, C.white);
    p.cyl(0.005, 0.005, 0.26, 4, -0.24, 0.12, -0.12, C.metal); p.cone(0.12, 0.05, 8, -0.24, 0.36, -0.12, 0xf4ecd8);
    p.add(new THREE.BoxGeometry(0.05, 0.07, 0.006), -0.2, 0.01, -0.03, 0x2e3438, 0, false, 0, -0.2); p.box(0.03, 0.003, 0.004, -0.2, 0.05, -0.024, C.white);
    figure(p, -0.4, -0.14, 0x2a2a2e, Math.PI / 2, false, 0x4a3426);
    figure(p, -0.18, -0.15, 0xf2c23a, -Math.PI / 2, false, 0x8a5a3a);
    // borne d'information à écran, corbeille, pigeons qui picorent, musicien de rue et son étui ouvert
    p.box(0.06, 0.16, 0.025, 0.18, 0.01, -0.42, 0x2e3c48); p.box(0.045, 0.07, 0.004, 0.18, 0.09, -0.406, 0x9de0ff, 0, true);
    p.cyl(0.02, 0.018, 0.06, 8, 0.12, 0.01, 0.33, 0x5d6878);
    for (let k = 0; k < 5; k++) { const x = -0.14 + hash2(k, 1, 77) * 0.12, z = 0.36 + hash2(k, 2, 77) * 0.08, r = hash2(k, 3, 77) * 6; p.add(new THREE.IcosahedronGeometry(0.012, 0).scale(1, 0.8, 1.4), x, 0.022, z, k % 2 ? 0x8a8f9a : 0xa8acb4, r); p.sphere(0.007, x + Math.sin(r) * 0.014, 0.034, z + Math.cos(r) * 0.014, 0x6a6f7a); }
    figure(p, 0.24, 0.42, 0x8a3a6a, Math.PI + 0.4, false, 0x2a2420);
    p.add(new THREE.BoxGeometry(0.02, 0.07, 0.008), 0.26, 0.09, 0.4, 0x8a5a3a, -0.5, false, 0.9);
    p.box(0.08, 0.012, 0.04, 0.2, 0.01, 0.32, 0x2a2a2e); p.box(0.07, 0.004, 0.03, 0.2, 0.022, 0.32, 0xb8322c);
  }
}

function temple(p: Parts, age: number) {
  if (age === 1 && attach(['a_temple'], 0, 0.86, 0, -0.03, 0, toMarble, 1, /mat25/)) {
    // temple grec : marbre crème, toit de tuiles au-dessus des colonnes, cyprès aux angles du parvis
    tileRoof(p, 0.4, C.terracotta);
    p.box(0.94, 0.012, 0.86, 0, 0, 0, 0xd9cdb6);
    for (const x of [-0.42, 0.42]) cypress(p, x, 0.38);
    // l'escalier monte du parvis au soubassement ; deux trépieds de bronze y brûlent l'encens ; des offrandes au pied des
    // marches, un prêtre en toge et une fidèle qui apporte une amphore
    for (let k = 0; k < 4; k++) p.box(0.4 - k * 0.012, 0.1 - k * 0.022, 0.03, 0, 0.012, 0.332 + k * 0.026, k % 2 ? 0xece4d2 : 0xe2d8c4);
    for (const s of [-1, 1]) {
      const x = s * 0.29, z = 0.39;
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.13).rotateX(0.18).rotateY(a), x + Math.cos(a) * 0.016, 0.075, z + Math.sin(a) * 0.016, 0xa8783a); }
      p.cyl(0.038, 0.02, 0.03, 8, x, 0.13, z, 0xb88a42);
      p.cone(0.026, 0.06, 5, x, 0.155, z, C.flame, true);
      smoke(x, 0.22, z, 1);
    }
    for (const [x, c] of [[-0.12, C.terracotta], [0.13, 0xc8a070]] as [number, number][]) { p.cyl(0.016, 0.024, 0.045, 7, x, 0.012, 0.41, c); p.cyl(0.009, 0.014, 0.02, 6, x, 0.057, 0.41, c); }
    p.sphere(0.02, 0.06, 0.025, 0.415, 0xe8c050, 0, 0.7);
    figure(p, 0, 0.29, 0xf2ead8, 0, false, 0xd8d4cc, 'idle', 0.1); figure(p, 0.17, 0.41, 0xb8443a, Math.PI + 0.4);
  } else if (age === 1) {
    p.box(0.88, 0.06, 0.74, 0, 0, 0, C.stone); p.box(0.78, 0.06, 0.64, 0, 0.06, 0, 0xe6dccb);
    for (const [x, z] of [[-0.3, 0.22], [0.3, 0.22], [-0.3, -0.22], [0.3, -0.22], [0, 0.22], [0, -0.22]]) p.cyl(0.045, 0.05, 0.36, 7, x, 0.12, z, C.white);
    p.box(0.74, 0.04, 0.6, 0, 0.48, 0, C.white);
    p.gable(0.8, 0.2, 0.68, 0, 0.52, 0, C.terracotta, 0);
    p.box(0.16, 0.2, 0.2, 0, 0.12, -0.05, C.stone);
    p.box(0.08, 0.1, 0.02, 0, 0.14, 0.06, C.win, 0, true);
  } else if (age === 2) {
    villageChurch(p);
  } else if (age === 3) {
    // cathédrale gothique : façade à deux tours et rosace, nef et bas-côtés, arcs-boutants, transept, flèche à la croisée, abside
    const st = 0xd8d0c2, sl = 0x6f7c96, glass = 0x6a7ad8, rose = 0xb48ad8;
    sink(0.012);
    for (let i = 0; i < 18; i++) p.box(0.1, 0.004, 0.1, -0.42 + (i % 6) * 0.17, 0.012, 0.3 + Math.floor(i / 6) * 0.06, dark(0xd9d2c4, 0.9 + (i % 3) * 0.04));
    // nef et bas-côtés
    p.box(0.28, 0.36, 0.52, 0, 0.012, -0.1, st);
    for (const s of [-1, 1]) stones(p, s * 0.14, -0.1, 0.52, 0.22, 0.37, s * Math.PI / 2, st, 0.4, 310 + s);
    roof(p, 0, 0.372, -0.1, { w: 0.52, d: 0.28, h: 0.2, color: sl, wall: st, ry: Math.PI / 2, len: 0.56, ov: 0.03, courses: true });
    for (const s of [-1, 1]) {
      p.box(0.1, 0.2, 0.52, s * 0.19, 0.012, -0.1, st);
      p.add(new THREE.BoxGeometry(0.13, 0.015, 0.54), s * 0.2, 0.232, -0.1, sl, 0, false, -s * 0.35);
      for (const z of [-0.3, -0.06, 0.06]) {
        // fenêtres hautes et basses à vitraux, contrefort, arc-boutant et pinacle
        p.box(0.012, 0.075, 0.035, s * 0.141, 0.26, z, glass, 0, true); p.box(0.012, 0.06, 0.03, s * 0.241, 0.08, z, glass, 0, true);
        p.box(0.035, 0.28, 0.04, s * 0.3, 0.012, z, st); p.cone(0.024, 0.08, 4, s * 0.3, 0.29, z, st);
        p.add(new THREE.BoxGeometry(0.17, 0.02, 0.025), s * 0.22, 0.31, z, st, 0, false, -s * 0.36);
      }
    }
    // transept, rosaces des croisillons, tour et flèche de la croisée
    p.box(0.6, 0.36, 0.14, 0, 0.012, -0.2, st);
    roof(p, 0, 0.372, -0.2, { w: 0.6, d: 0.14, h: 0.1, color: sl, wall: st, len: 0.62, ov: 0.02, courses: true });
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12).rotateZ(Math.PI / 2), s * 0.301, 0.24, -0.2, rose, 0, true);
      p.add(new THREE.TorusGeometry(0.047, 0.008, 4, 12).rotateY(Math.PI / 2), s * 0.304, 0.24, -0.2, st);
    }
    p.box(0.13, 0.12, 0.13, 0, 0.5, -0.2, st);
    for (const [dx, dz, w, d] of [[0, 0.066, 0.05, 0.01], [0.066, 0, 0.01, 0.05]]) for (const s of [-1, 1]) p.box(w, 0.07, d, dx * s, 0.52, -0.2 + dz * s, 0x2a2622);
    p.cone(0.085, 0.36, 8, 0, 0.62, -0.2, sl);
    p.box(0.01, 0.07, 0.01, 0, 0.97, -0.2, C.gold); p.box(0.04, 0.01, 0.01, 0, 1.01, -0.2, C.gold);
    // abside au chevet
    p.cyl(0.14, 0.14, 0.36, 10, 0, 0.012, -0.36, st);
    p.cone(0.16, 0.16, 10, 0, 0.372, -0.36, sl);
    for (const a of [-0.9, 0, 0.9]) p.box(0.035, 0.075, 0.012, Math.sin(Math.PI + a) * 0.141, 0.22, -0.36 + Math.cos(Math.PI + a) * 0.141, glass, Math.PI + a, true);
    // façade : deux tours carrées à balustrade et pinacles, galerie des rois, rosace, portails
    for (const s of [-1, 1]) {
      const x = s * 0.17;
      p.box(0.13, 0.66, 0.13, x, 0.012, 0.2, st);
      stones(p, x, 0.265, 0.13, 0.03, 0.67, 0, st, 0.45, 320 + s);
      quoins(p, x + s * 0.065, 0.265, 0.03, 0.67, s, 1, 0xece4d4);
      for (const y of [0.3, 0.52]) p.box(0.14, 0.015, 0.14, x, y, 0.2, 0xece4d4);
      p.box(0.035, 0.12, 0.012, x - 0.025, 0.56, 0.266, 0x2a2622); p.box(0.035, 0.12, 0.012, x + 0.025, 0.56, 0.266, 0x2a2622);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.cone(0.012, 0.07, 4, x + dx * 0.058, 0.672, 0.2 + dz * 0.058, st);
      p.box(0.14, 0.02, 0.14, x, 0.672, 0.2, st);
      p.box(0.05, 0.1, 0.012, x, 0.012, 0.266, C.door); p.gable(0.014, 0.035, 0.06, x, 0.112, 0.266, st, Math.PI / 2);
    }
    p.box(0.21, 0.5, 0.08, 0, 0.012, 0.2, st); p.gable(0.21, 0.12, 0.08, 0, 0.512, 0.2, st);
    for (let i = 0; i < 7; i++) p.box(0.018, 0.035, 0.008, -0.075 + i * 0.025, 0.27, 0.242, 0x5a5048);
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14).rotateX(Math.PI / 2), 0, 0.38, 0.241, rose, 0, true);
    p.add(new THREE.TorusGeometry(0.062, 0.01, 4, 14), 0, 0.38, 0.246, st);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.11, 0.006, 0.006).rotateZ((k * Math.PI) / 4), 0, 0.38, 0.248, st);
    p.box(0.1, 0.16, 0.014, 0, 0.012, 0.241, C.door); p.gable(0.02, 0.07, 0.13, 0, 0.172, 0.243, st, Math.PI / 2);
    p.box(0.07, 0.04, 0.006, 0, 0.18, 0.252, C.gold);
    // parvis : réverbères, bancs, arbres
    for (const s of [-1, 1]) {
      p.cyl(0.006, 0.008, 0.2, 5, s * 0.32, 0.012, 0.36, 0x3c4a44); p.box(0.025, 0.03, 0.025, s * 0.32, 0.21, 0.36, 0xffe2a0, 0, true);
      p.box(0.1, 0.012, 0.03, s * 0.32, 0.03, 0.44, C.wood); for (const d of [-0.04, 0.04]) p.box(0.008, 0.03, 0.025, s * 0.32 + d, 0.012, 0.44, 0x3c4a44);
      tree(p, s * 0.42, 0.18, 0.8, 0x8fbf72);
    }
  } else {
    // église moderne : nef blanche à lames de béton sous un grand toit d'ardoise à joints debout, verrière de vitraux
    // colorés et grande croix en façade, auvent et perron, abside au chevet, chapelle basse, campanile ajouré (abat-sons,
    // horloge, deux cloches, croix dorée), parvis dallé entouré d'un muret fleuri, statue sur son socle, arbres, bancs,
    // réverbères, panneau d'affichage et vélos
    const white = 0xf2f0ea, roofC = 0x5d6878, glassC = [0xd84a5a, 0x3c7fd8, 0xe8c66a, 0x4fa860, 0x9a5ad8];
    sink(0.02);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) p.box(0.075, 0.003, 0.075, -0.24 + i * 0.09, 0.02, 0.27 + j * 0.08, (i + j) % 2 ? 0xd2ccc0 : 0xdcd6ca);
    // nef, lames de béton, toit à joints debout, abside
    p.box(0.42, 0.3, 0.6, -0.06, 0.02, -0.1, white);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) p.box(0.03, 0.3, 0.02, -0.06 + sx * 0.222, 0.02, -0.37 + k * 0.105, 0xe4e2dc);
    p.gable(0.66, 0.2, 0.48, -0.06, 0.32, -0.1, roofC, Math.PI / 2);
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.31, 0.008, 0.008).rotateZ(-sx * 0.695), -0.06 + sx * 0.12, 0.427, -0.4 + k * 0.1, 0x7d8a9a);
    p.box(0.02, 0.02, 0.66, -0.06, 0.515, -0.1, 0x7d8a9a);
    p.cyl(0.14, 0.14, 0.26, 10, -0.06, 0.02, -0.4, white);
    p.cone(0.15, 0.1, 10, -0.06, 0.28, -0.4, roofC);
    for (let i = 0; i < 3; i++) { const a = Math.PI + (i - 1) * 0.6; p.box(0.02, 0.12, 0.012, -0.06 + Math.sin(a) * 0.142, 0.1, -0.4 + Math.cos(a) * 0.142, glassC[i + 1], a, true); }
    // pignon de façade, verrière de vitraux, grande croix en relief, auvent, perron, portes
    p.gable(0.02, 0.2, 0.42, -0.06, 0.32, 0.205, white, Math.PI / 2);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      const x = -0.06 + (i - 2) * 0.05, y = 0.12 + j * 0.06, top = 0.32 + 0.2 * (1 - Math.abs(i - 2) / 2.6);
      if (y + 0.05 < top && !(i === 2)) p.box(0.042, 0.052, 0.012, x, y, 0.205, glassC[(i + j * 2) % glassC.length], 0, true);
    }
    for (let i = -3; i <= 3; i++) { const dx = i * 0.05 + (i > 0 ? -0.025 : i < 0 ? 0.025 : 0); p.box(0.006, 0.31 - Math.abs(dx) * 0.95, 0.016, -0.06 + dx, 0.1, 0.21, 0x5d6878); }
    p.box(0.03, 0.34, 0.02, -0.06, 0.12, 0.218, C.white); p.box(0.16, 0.03, 0.02, -0.06, 0.34, 0.218, C.white);
    p.box(0.12, 0.09, 0.016, -0.06, 0.02, 0.212, C.door); p.box(0.003, 0.09, 0.018, -0.06, 0.02, 0.214, 0x5a4232);
    for (const sx of [-1, 1]) p.box(0.006, 0.02, 0.008, -0.06 + sx * 0.012, 0.06, 0.222, C.gold);
    p.add(new THREE.BoxGeometry(0.22, 0.012, 0.1), -0.06, 0.12, 0.25, roofC, 0, false, 0, 0.08);
    for (const sx of [-1, 1]) p.box(0.008, 0.1, 0.008, -0.06 + sx * 0.1, 0.02, 0.29, 0x5d6878);
    for (let k = 0; k < 2; k++) p.box(0.26 + k * 0.04, 0.01, 0.04, -0.06, 0.02 - k * 0.0, 0.24 + k * 0.035, 0xd2ccc0);
    // fentes de lumière sur les côtés
    for (const sx of [-1, 1]) for (const z of [-0.32, -0.21, -0.1, 0.01, 0.12]) p.box(0.012, 0.2, 0.025, -0.06 + sx * 0.212, 0.06, z + 0.05, glassC[Math.abs(Math.round(z * 100)) % 5], 0, true);
    // chapelle basse
    p.box(0.16, 0.16, 0.24, -0.36, 0.02, -0.22, 0xe8e4dc); p.box(0.18, 0.02, 0.26, -0.36, 0.18, -0.22, roofC);
    p.box(0.012, 0.1, 0.05, -0.441, 0.05, -0.22, glassC[1], 0, true); p.box(0.05, 0.08, 0.012, -0.36, 0.02, -0.098, C.door);
    // campanile ajouré : fût, horloge, abat-sons, deux cloches, toit, croix
    const tx = 0.3, tz = -0.24;
    p.box(0.13, 0.5, 0.13, tx, 0.02, tz, white);
    for (const sx of [-1, 1]) p.box(0.012, 0.5, 0.135, tx + sx * 0.06, 0.02, tz, 0xe4e2dc);
    for (let y = 0.1; y < 0.36; y += 0.12) p.box(0.02, 0.07, 0.012, tx, y, tz + 0.066, glassC[1], 0, true);
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 14).rotateX(Math.PI / 2), tx, 0.44, tz + 0.068, C.white);
    p.box(0.004, 0.025, 0.004, tx, 0.445, tz + 0.074, 0x2a2a2a); p.box(0.018, 0.004, 0.004, tx + 0.006, 0.44, tz + 0.074, 0x2a2a2a);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.022, 0.16, 0.022, tx + dx * 0.054, 0.52, tz + dz * 0.054, white);
    for (const [ry, dx, dz] of [[0, 0, 1], [0, 0, -1], [Math.PI / 2, 1, 0], [Math.PI / 2, -1, 0]] as [number, number, number][]) for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.08, 0.008, 0.02), tx + dx * 0.058, 0.55 + k * 0.035, tz + dz * 0.058, 0x8a96a2, ry, false, 0, 0.5);
    p.sphere(0.03, tx - 0.02, 0.6, tz, C.gold, 1, 1.1); p.sphere(0.022, tx + 0.025, 0.59, tz, C.gold, 1, 1.1);
    p.box(0.1, 0.008, 0.008, tx, 0.65, tz, 0x5a4a3a);
    p.box(0.15, 0.025, 0.15, tx, 0.68, tz, roofC); p.pyramid(0.14, 0.06, 0.14, tx, 0.705, tz, roofC);
    p.box(0.012, 0.14, 0.012, tx, 0.765, tz, C.gold); p.box(0.07, 0.012, 0.012, tx, 0.85, tz, C.gold);
    // parvis : muret fleuri, statue sur son socle, arbres, bancs, réverbères, panneau d'affichage, vélos
    for (const sx of [-1, 1]) { p.box(0.3, 0.05, 0.03, -0.06 + sx * 0.3, 0.02, 0.46, 0xd2ccc0); for (let k = 0; k < 6; k++) p.sphere(0.02, -0.06 + sx * (0.18 + k * 0.045), 0.08, 0.46, [C.pink, C.butter, 0xd84a3e, C.lav, C.white, 0xe8a83c][k], 0, 0.8); }
    p.box(0.06, 0.08, 0.06, 0.22, 0.02, 0.32, 0xd2ccc0); p.box(0.03, 0.08, 0.025, 0.22, 0.1, 0.32, 0xf2f2f2); p.sphere(0.016, 0.22, 0.2, 0.32, 0xf2f2f2); p.cone(0.03, 0.06, 6, 0.22, 0.1, 0.32, 0x8fb8e4);
    for (const x of [-0.4, 0.38]) tree(p, x, 0.3, 0.7);
    for (const x of [-0.26, 0.08]) { p.box(0.1, 0.014, 0.035, x, 0.045, 0.4, C.wood); p.box(0.1, 0.035, 0.008, x, 0.06, 0.418, C.wood); for (const d of [-0.035, 0.035]) p.box(0.012, 0.025, 0.03, x + d, 0.02, 0.4, 0x5d6878); }
    for (const x of [-0.44, 0.44]) { p.cyl(0.006, 0.008, 0.2, 5, x, 0.02, 0.2, 0x5d6878); p.box(0.025, 0.025, 0.025, x, 0.22, 0.2, 0xffe2a0, 0, true); }
    p.box(0.01, 0.12, 0.01, -0.36, 0.02, 0.0, 0x5d6878); p.box(0.1, 0.07, 0.01, -0.36, 0.1, 0.0, 0x8a6a4a); p.box(0.08, 0.05, 0.004, -0.36, 0.11, 0.006, 0xf2ece0);
    for (let k = 0; k < 3; k++) { const x = 0.34 + k * 0.05; for (const d of [-0.025, 0.025]) p.add(new THREE.TorusGeometry(0.02, 0.004, 4, 10).rotateY(Math.PI / 2), x, 0.04, 0.0 + d, 0x3c3c40); p.box(0.004, 0.004, 0.05, x, 0.05, 0.0, [0xd8553c, 0x3c7fd8, 0x4fa860][k]); }
  }
}

function mill(p: Parts, age: number) {
  if (age === 2) {
    // moulin à vent : tour octogonale à colombages sur socle de pierre, chapeau conique de bardeaux, quatre ailes en treillis
    p.cyl(0.28, 0.3, 0.08, 8, 0, 0, 0, C.stone);
    p.cyl(0.2, 0.26, 0.64, 8, 0, 0.08, 0, C.cream);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.add(new THREE.BoxGeometry(0.024, 0.65, 0.02), Math.cos(a) * 0.232, 0.4, Math.sin(a) * 0.232, C.darkwood, -a, false, 0.094); }
    for (const [y, r] of [[0.3, 0.244], [0.56, 0.222]]) p.add(new THREE.CylinderGeometry(r, r, 0.028, 8, 1, true), 0, y, 0, C.darkwood);
    p.cyl(0.235, 0.235, 0.035, 8, 0, 0.72, 0, C.darkwood);
    p.cone(0.28, 0.32, 8, 0, 0.755, 0, 0x8a5a44);
    p.sphere(0.022, 0, 1.08, 0, C.darkwood);
    p.box(0.1, 0.16, 0.02, 0, 0.08, 0.262, C.door); p.box(0.07, 0.08, 0.02, 0, 0.42, 0.226, C.win, 0, true);
    // ailes : un longeron, une toile tendue d'un côté, un treillis
    const hub = [0, 0.64, 0.3];
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8).rotateX(Math.PI / 2), hub[0], hub[1], hub[2] - 0.04, C.darkwood);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      p.add(new THREE.BoxGeometry(0.022, 0.6, 0.02).translate(0, 0.33, 0), hub[0], hub[1], hub[2], C.wood, 0, false, a);
      p.add(new THREE.BoxGeometry(0.12, 0.42, 0.008).translate(0.07, 0.4, -0.006), hub[0], hub[1], hub[2], 0xf4ead8, 0, false, a);
      p.add(new THREE.BoxGeometry(0.012, 0.44, 0.012).translate(0.135, 0.4, 0), hub[0], hub[1], hub[2], C.wood, 0, false, a);
      for (let j = 0; j < 4; j++) p.add(new THREE.BoxGeometry(0.15, 0.01, 0.012).translate(0.065, 0.22 + j * 0.12, 0.004), hub[0], hub[1], hub[2], C.wood, 0, false, a);
    }
  } else if (age === 3) {
    // minoterie à vapeur : haut moulin de brique sur trois niveaux (bandeaux de pierre, fenêtres cintrées, lucarne et potence
    // du monte-sacs), salle des machines à grandes baies, haute cheminée cerclée de fer qui fume ; quai de chargement, sacs
    // de farine, tas de charbon, enseigne
    sink(0.012);
    const brick = 0xa85e50, band = 0xe2d8c4, mx = -0.1, mz = -0.1, W = 0.46, D = 0.36, H = 0.5;
    p.box(W, H, D, mx, 0.012, mz, brick);
    stones(p, mx, mz + D / 2, W, 0.012, H, 0, dark(brick, 0.86), 0.4, 380);
    stones(p, mx - W / 2, mz, D, 0.012, H, -Math.PI / 2, dark(brick, 0.86), 0.4, 381);
    for (const x of [mx - W / 2, mx + W / 2]) quoins(p, x, mz + D / 2, 0.012, H, x < mx ? -1 : 1, 1, band);
    for (const y of [0.18, 0.34]) p.box(W + 0.016, 0.018, D + 0.016, mx, y, mz, band);
    for (const [y, h] of [[0.06, 0.09], [0.215, 0.09], [0.37, 0.08]]) {
      for (const x of [mx - 0.15, mx + 0.15]) { p.box(0.07, h, 0.02, x, y, mz + D / 2 + 0.004, C.win, 0, true); archTop(p, x, y + h, mz + D / 2 + 0.006, 0.035, band); p.box(0.008, h, 0.006, x, y, mz + D / 2 + 0.016, C.darkwood); }
      for (const z of [mz - 0.1, mz + 0.06]) p.box(0.02, h, 0.06, mx - W / 2 - 0.004, y, z, C.win, 0, true);
    }
    // porte de chargement de chaque niveau au milieu de la façade, la potence et le sac qui monte
    for (const y of [0.04, 0.2, 0.36]) p.box(0.09, 0.12, 0.016, mx, y, mz + D / 2 + 0.004, 0x5a4636);
    p.box(0.012, 0.012, 0.14, mx, 0.5, mz + D / 2 + 0.06, C.darkwood); p.box(0.012, 0.08, 0.012, mx, 0.43, mz + D / 2 + 0.006, C.darkwood);
    p.box(0.003, 0.12, 0.003, mx, 0.38, mz + D / 2 + 0.12, 0x3a3030);
    p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 1.3, 0.9), mx, 0.35, mz + D / 2 + 0.12, 0xf0ead8);
    roof(p, mx, H + 0.012, mz, { w: W, d: D, h: 0.16, color: C.slate, wall: brick, len: W + 0.06, courses: true });
    p.box(0.1, 0.1, 0.1, mx, H + 0.03, mz + D / 2 - 0.06, brick); p.pyramid(0.12, 0.06, 0.12, mx, H + 0.13, mz + D / 2 - 0.06, C.slate);
    // salle des machines : brique, grandes baies cintrées, toit de zinc, lanterneau
    const ex = 0.25, ez = -0.12, EW = 0.2, ED = 0.3, EH = 0.26;
    p.box(EW, EH, ED, ex, 0.012, ez, brick);
    stones(p, ex, ez + ED / 2, EW, 0.012, EH, 0, dark(brick, 0.86), 0.4, 382);
    for (const z of [ez - 0.08, ez + 0.06]) { p.box(0.02, 0.15, 0.07, ex + EW / 2 + 0.004, 0.05, z, C.win, 0, true); archTop(p, ex + EW / 2 + 0.006, 0.2, z, 0.035, band); }
    p.box(0.08, 0.16, 0.02, ex, 0.05, ez + ED / 2 + 0.004, C.win, 0, true); archTop(p, ex, 0.21, ez + ED / 2 + 0.006, 0.04, band);
    roof(p, ex, EH + 0.012, ez, { w: ED, d: EW, h: 0.08, color: 0x7d8a96, wall: brick, ry: Math.PI / 2, len: ED + 0.04 });
    p.box(0.05, 0.03, 0.16, ex, EH + 0.09, ez, 0x7d8a96); p.box(0.052, 0.018, 0.14, ex, EH + 0.075, ez, C.glass, 0, true);
    // haute cheminée de brique, cerclée de fer, couronnée, qui fume
    p.box(0.1, 0.08, 0.1, 0.32, 0.012, -0.36, brick);
    p.cyl(0.032, 0.05, 0.9, 10, 0.32, 0.09, -0.36, brick);
    for (const y of [0.35, 0.6, 0.85]) p.cyl(0.05 - y * 0.017, 0.05 - y * 0.017, 0.012, 10, 0.32, y, -0.36, 0x3c3c40);
    p.cyl(0.044, 0.036, 0.04, 10, 0.32, 0.99, -0.36, band);
    smoke(0.32, 1.06, -0.36, 2);
    // quai de chargement : plancher, sacs de farine empilés, balance, enseigne de la minoterie
    p.box(0.42, 0.06, 0.12, mx, 0.012, mz + D / 2 + 0.07, C.darkwood);
    for (let i = 0; i < 7; i++) p.box(0.012, 0.062, 0.012, mx - 0.2 + i * 0.066, 0.012, mz + D / 2 + 0.128, dark(C.darkwood, 0.8));
    for (const [x, y, z, r] of [[-0.24, 0.075, 0.17, 0.2], [-0.18, 0.075, 0.18, -0.3], [-0.21, 0.11, 0.175, 0.1], [0.0, 0.075, 0.17, 1.4], [0.06, 0.075, 0.18, 0.4]])
      p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1.2, 0.75, 0.9), x, y, z, 0xf0ead8, r);
    p.box(0.26, 0.05, 0.012, mx, 0.42, mz + D / 2 + 0.024, 0x2c3e4a); for (let k = 0; k < 9; k++) p.box(0.016, 0.022, 0.004, mx - 0.1 + k * 0.025, 0.433, mz + D / 2 + 0.032, C.gold);
    // charbon de la chaudière, brouette, tonneaux ; pavés de la cour
    p.cone(0.09, 0.07, 7, 0.3, 0.012, 0.14, 0x2a2826); p.cone(0.05, 0.04, 6, 0.38, 0.012, 0.2, 0x34322f);
    p.box(0.07, 0.03, 0.05, 0.2, 0.04, 0.3, 0x6a5a4a, 0.4); p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateZ(Math.PI / 2), 0.24, 0.03, 0.33, 0x3c3c40);
    for (const [x, z] of [[0.42, -0.08], [0.42, 0.0]]) { p.cyl(0.03, 0.03, 0.07, 8, x, 0.012, z, 0x8a5a3a); p.cyl(0.031, 0.031, 0.006, 8, x, 0.05, z, 0x3c3c40); }
    cobbles(p, -0.46, 0.18, 0.46, 0.46, 0x9d9890, 0.012, 383);
    lampPost(p, 0.38, 0.4, 0.3);
  } else {
    // éolienne : socle de béton, mât blanc à brides et bande verte au pied, porte et son palier ; la nacelle se tourne face au
    // vent et le rotor à trois pales (bouts rouges) tourne devant, feu de balisage au sommet ; poste de livraison, aire de
    // grutage, chemin de gravier, camionnette du technicien casqué, moutons qui paissent au pied
    p.cyl(0.2, 0.22, 0.03, 8, 0, 0, 0, 0xc8c4bc);
    p.cyl(0.14, 0.17, 0.05, 10, 0, 0.03, 0, C.stone);
    p.cyl(0.03, 0.06, 1.0, 10, 0, 0.08, 0, C.white);
    p.cyl(0.061, 0.062, 0.03, 10, 0, 0.08, 0, 0x6fa85a); p.cyl(0.059, 0.061, 0.02, 10, 0, 0.11, 0, 0x9ccf92);
    for (const y of [0.42, 0.75]) { const r = 0.06 - ((y - 0.08) / 1.0) * 0.03 + 0.003; p.cyl(r, r, 0.012, 10, 0, y, 0, 0xd8dce2); }
    p.box(0.035, 0.065, 0.012, 0, 0.1, 0.058, 0x5d6878);
    p.box(0.08, 0.008, 0.05, 0, 0.096, 0.085, 0x8a8f96); p.box(0.03, 0.06, 0.03, 0, 0.03, 0.1, 0x8a8f96);
    for (const s of [-1, 1]) p.box(0.004, 0.04, 0.05, s * 0.04, 0.104, 0.085, 0xd8dce2);
    p.box(0.012, 0.012, 0.012, 0, 1.125, 0, 0xff3a3a, 0, true);
    // la nacelle et le cône du moyeu se tournent face au vent, le rotor devant
    const hd = vane(0, 0, 0);
    hd.box(0.1, 0.1, 0.24, 0, 1.02, 0.0, C.white); hd.box(0.102, 0.012, 0.242, 0, 1.06, 0.0, 0xd8dce2);
    hd.box(0.04, 0.02, 0.06, 0, 1.12, -0.07, 0xc4cad2); hd.cyl(0.004, 0.004, 0.05, 4, 0, 1.12, -0.11, 0x9aa3ad);
    hd.box(0.03, 0.015, 0.03, 0.02, 1.15, -0.11, 0x9aa3ad, 0.5);
    const r = spinner([0, 1.07, 0.15], [0, 0, 1], 1.4);
    r.add(new THREE.ConeGeometry(0.05, 0.1, 10).rotateX(Math.PI / 2), 0, 0, 0.04, C.white);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      r.add(new THREE.CylinderGeometry(0.008, 0.028, 0.52, 4).scale(1, 1, 0.3).rotateY(0.3).translate(0, 0.3, 0).rotateZ(a), 0, 0, 0, C.white);
      r.add(new THREE.CylinderGeometry(0.006, 0.009, 0.06, 4).scale(1, 1, 0.3).rotateY(0.3).translate(0, 0.54, 0).rotateZ(a), 0, 0, 0, 0xd84a3e);
    }
    // poste de livraison : caisson clair à ouïes, pancarte jaune ; câble enterré jusqu'au mât
    p.box(0.12, 0.08, 0.08, -0.26, 0.0, 0.16, 0xd8dcd4); p.box(0.13, 0.01, 0.09, -0.26, 0.08, 0.16, 0x8a8f96);
    for (let k = 0; k < 4; k++) p.box(0.016, 0.04, 0.004, -0.3 + k * 0.026, 0.02, 0.201, 0xa8aeb6);
    p.box(0.025, 0.025, 0.004, -0.22, 0.05, 0.202, 0xf2c23a);
    p.box(0.2, 0.004, 0.02, -0.15, 0.0, 0.1, 0x8a7a68, -0.5);
    // aire de grutage et chemin de gravier vers la route, la camionnette, le technicien
    p.box(0.3, 0.008, 0.22, 0.24, 0.0, 0.16, 0xb8b2a6);
    p.box(0.12, 0.006, 0.24, 0.24, 0.0, 0.39, 0xc4bcae);
    // (la camionnette et les moutons, comme le technicien, gardent la taille des habitants quand l'éolienne grandit)
    lifeSize(p, 0.26, 0.008, 0.16, () => { car(p, 0.26, 0.16, Math.PI / 2, C.white, 0.008); p.box(0.2, 0.016, 0.004, 0.26, 0.047, 0.226, 0x2c7a5a); });
    figure(p, 0.05, 0.27, 0xf28a3c, -2.4, false, 0xf2f2ee);
    // moutons qui paissent
    for (const [x, z, ry] of [[-0.3, -0.3, 0.6], [-0.18, -0.4, -0.4], [0.3, -0.28, 2.2]]) lifeSize(p, x, 0, z, () => {
      p.add(new THREE.IcosahedronGeometry(0.04, 0).scale(1, 0.75, 1.35), x, 0.05, z, 0xf2efe6, ry);
      p.box(0.025, 0.025, 0.035, x + Math.sin(ry) * 0.06, 0.04, z + Math.cos(ry) * 0.06, 0x3c3530, ry);
      for (const [u, w] of [[-0.02, -0.03], [0.02, -0.03], [-0.02, 0.03], [0.02, 0.03]]) p.box(0.008, 0.03, 0.008, x + u * Math.cos(ry) + w * Math.sin(ry), 0, z - u * Math.sin(ry) + w * Math.cos(ry), 0x3c3530);
    });
  }
}

/**
 * Le château, gardé à travers les âges : le château médiéval, restauré à l'âge industriel (bannières, jardin à la française,
 * allée de gravier, réverbères), château-musée à l'époque moderne (guichet, panneau d'information, projecteurs qui
 * l'illuminent la nuit, car de touristes, bancs)
 */
function landmark(p: Parts, age: number, v = 0) {
  if (age >= 3) {
    p.box(1.9, 0.012, 1.9, 0, 0, 0, C.green);
    landmark(p, 2);
    // allée de gravier jusqu'à la porte, parterres bordés de buis, bannières aux couleurs du village
    p.box(0.34, 0.014, 0.46, 0, 0.012, 0.72, 0xe2d6bc);
    for (const sx of [-1, 1]) {
      p.box(0.5, 0.014, 0.34, sx * 0.5, 0.012, 0.74, 0x8fcf7e);
      hedge(p, sx * 0.5, 0.58, 0.5, 0.04, 0.05, 0.026); hedge(p, sx * 0.5, 0.9, 0.5, 0.04, 0.05, 0.026);
      for (let k = 0; k < 4; k++) p.sphere(0.02, sx * (0.32 + k * 0.12), 0.04, 0.74, [C.pink, 0xd84a3e, C.butter, C.lav][k], 0, 0.8);
      p.cyl(0.007, 0.009, 0.7, 5, sx * 0.24, 0.012, 0.5, C.metal);
      p.box(0.005, 0.16, 0.1, sx * 0.24, 0.5, 0.55, 0x3a6ab8); p.box(0.006, 0.03, 0.1, sx * 0.24, 0.5, 0.55, C.gold);
    }
    if (age === 3) for (const sx of [-1, 1]) { p.cyl(0.012, 0.012, 0.38, 5, sx * 0.2, 0.012, 0.92, 0x3c4a44); p.box(0.04, 0.05, 0.04, sx * 0.2, 0.39, 0.92, 0xffe2a0, 0, true); p.box(0.05, 0.014, 0.05, sx * 0.2, 0.44, 0.92, 0x3c4a44); }
    else {
      // guichet, panneau d'information, projecteurs au pied des murs, car de touristes, bancs
      p.box(0.2, 0.16, 0.14, 0.62, 0.012, 0.5, 0xe8e4dc); p.box(0.22, 0.02, 0.16, 0.62, 0.17, 0.5, 0x3a6ab8); p.box(0.12, 0.06, 0.012, 0.62, 0.08, 0.572, C.glass, 0, true);
      p.box(0.1, 0.12, 0.012, -0.3, 0.06, 0.9, 0x3a5a4a); p.box(0.012, 0.06, 0.012, -0.3, 0.012, 0.9, 0x3c3c40);
      for (const [x, z] of [[-0.6, 0.34], [0.6, 0.3], [-0.2, 0.36], [0.2, 0.36]]) { p.box(0.04, 0.03, 0.04, x, 0.012, z, 0x3c3c40); p.box(0.03, 0.02, 0.012, x, 0.04, z - 0.02, 0xfff1c9, 0, true); }
      p.box(0.18, 0.13, 0.46, -0.72, 0.03, 0.5, 0xf2c23a); p.box(0.182, 0.05, 0.4, -0.72, 0.1, 0.5, 0xcfe2f0); p.box(0.184, 0.02, 0.46, -0.72, 0.06, 0.5, 0x3a6ab8);
      for (const z of [0.36, 0.64]) for (const s2 of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateZ(Math.PI / 2), -0.72 + s2 * 0.09, 0.03, z, 0x2e2a2c);
      for (const x of [0.3, 0.8]) { p.box(0.16, 0.02, 0.05, x, 0.06, 0.86, C.wood); for (const d2 of [-0.06, 0.06]) p.box(0.014, 0.04, 0.04, x + d2, 0.02, 0.86, C.metal); }
    }
    return;
  }
  if (age === 2) castle(p);
}

/** Gare centrale (2 × 2) : la grande gare de brique de l'âge industriel, la gare centrale à verrière de l'époque moderne */
function terminal(p: Parts, age: number) {
  if (age === 3) {
    // gare : bâtiment des voyageurs en brique à pavillon central et horloge, tour de l'horloge, quai sous marquise de fonte,
    // voie où s'arrêtent les trains des lignes, bancs, réverbères, chariot à bagages
    const brick = 0xb4685c, bz = -0.55, W = 1.36, D = 0.46, H = 0.46, zf = bz + D / 2;
    sink(0.03);
    p.box(W, H, D, -0.16, 0.03, bz, brick);
    stones(p, -0.16, zf, W, 0.03, H + 0.03, 0, dark(brick, 0.86), 0.45, 380);
    for (const x of [-0.16 - W / 2, -0.16 + W / 2]) quoins(p, x, zf, 0.03, H + 0.03, x < -0.16 ? -1 : 1, 1);
    for (const y of [0.03, 0.27, H + 0.02]) p.box(W + 0.02, 0.025, D + 0.02, -0.16, y, bz, C.cream);
    roof(p, -0.16, H + 0.03, bz, { w: W, d: D, h: 0.22, color: C.slate, wall: brick, courses: true });
    for (const x of [-0.7, -0.5, -0.3, 0.0, 0.2, 0.4]) { windows(p, [x], 0.08, zf + 0.01, 0.08, 0.14, C.cream); p.gable(0.014, 0.035, 0.1, x, 0.234, zf + 0.005, C.cream, Math.PI / 2); windows(p, [x], 0.32, zf + 0.01, 0.07, 0.09, C.cream); }
    // pavillon central : fronton, horloge, enseigne, grande porte
    p.box(0.3, 0.6, 0.08, -0.15, 0.03, zf + 0.03, C.cream); p.gable(0.32, 0.12, 0.1, -0.15, 0.63, zf + 0.03, C.slate);
    p.cyl(0.06, 0.06, 0.012, 14, -0.15, 0.52, zf + 0.075, C.white); p.add(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 14).rotateX(Math.PI / 2), -0.15, 0.52, zf + 0.078, C.white);
    p.box(0.005, 0.045, 0.004, -0.15, 0.52, zf + 0.087, 0x2a2a2a); p.box(0.035, 0.005, 0.004, -0.137, 0.52, zf + 0.087, 0x2a2a2a);
    p.box(0.22, 0.045, 0.01, -0.15, 0.42, zf + 0.075, 0x3f5a4a); for (let k = 0; k < 4; k++) p.box(0.03, 0.025, 0.004, -0.205 + k * 0.037, 0.43, zf + 0.081, C.gold);
    p.box(0.14, 0.26, 0.02, -0.15, 0.03, zf + 0.075, 0x4a3a2e); p.gable(0.02, 0.05, 0.16, -0.15, 0.29, zf + 0.075, C.cream, Math.PI / 2);
    // tour de l'horloge
    const tx = 0.66;
    p.box(0.26, 1.02, 0.26, tx, 0.03, bz, dark(brick, 0.9));
    stones(p, tx, bz + 0.13, 0.26, 0.03, 1.05, 0, dark(brick, 0.78), 0.45, 381);
    for (const y of [0.5, 0.95]) p.box(0.29, 0.025, 0.29, tx, y, bz, C.cream);
    for (const [dx, dz, ry] of [[0, 0.131, 0], [0.131, 0, Math.PI / 2]]) {
      p.add(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 14).rotateX(Math.PI / 2).rotateY(ry), tx + dx, 0.82, bz + dz, C.white);
      p.add(new THREE.BoxGeometry(0.006, 0.06, 0.004).rotateY(ry), tx + dx * 1.06, 0.84, bz + dz * 1.06, 0x2a2a2a);
    }
    p.pyramid(0.34, 0.26, 0.34, tx, 1.05, bz, C.slate); p.box(0.01, 0.1, 0.01, tx, 1.31, bz, C.gold);
    farPlatform(p, false);
    // quai et marquise de fonte, voie (les trains des lignes s'y arrêtent)
    p.box(1.9, 0.08, 0.36, 0, 0.03, -0.12, C.stone); p.box(1.9, 0.014, 0.04, 0, 0.11, 0.04, 0xece4d4);
    for (let i = 0; i < 6; i++) { const x = -0.8 + i * 0.32; p.cyl(0.012, 0.016, 0.34, 6, x, 0.11, 0.0, 0x3f6a4a); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.012), x, 0.43, 0.0, 0x3f6a4a, 0, false, 0.6); }
    p.add(new THREE.BoxGeometry(1.86, 0.016, 0.44), 0, 0.46, -0.12, C.slate, 0, false, 0, 0.12);
    for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(1.86, 0.006, 0.03).translate(0, 0.011, -0.19 + k * 0.075), 0, 0.46, -0.12, dark(C.slate, k % 2 ? 0.86 : 1.05), 0, false, 0, 0.12);
    for (let x = -0.92; x <= 0.92; x += 0.1) p.box(0.04, 0.016, 0.24, x, 0.03, 0.34, C.darkwood);
    for (const z of [0.28, 0.4]) p.box(1.9, 0.02, 0.014, 0, 0.046, z, C.metal);
    // bancs, réverbères, chariot à bagages, bacs de fleurs
    for (const x of [-0.6, 0.0]) { p.box(0.16, 0.02, 0.05, x, 0.15, -0.2, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, x + d, 0.11, -0.2, 0x3c4a44); }
    for (const x of [-0.85, -0.3, 0.3, 0.85]) { p.cyl(0.007, 0.009, 0.3, 5, x, 0.11, 0.0, 0x3c4a44); p.box(0.035, 0.04, 0.035, x, 0.41, 0.0, 0xffe2a0, 0, true); }
    p.box(0.12, 0.03, 0.07, 0.3, 0.15, -0.22, C.wood); for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateX(Math.PI / 2), 0.3 + s * 0.04, 0.13, -0.22 + s * 0.0, C.darkwood);
    for (const [x, c] of [[0.24, 0x8a5a3a], [0.32, 0x4a6aa8]] as [number, number][]) p.box(0.05, 0.035, 0.035, x, 0.18, -0.22, c);
    for (const x of [-0.9, 0.1]) { p.box(0.14, 0.04, 0.05, x, 0.03, zf + 0.12, C.wood); for (let k = 0; k < 4; k++) p.sphere(0.018, x - 0.045 + k * 0.03, 0.08, zf + 0.12, [C.pink, C.butter, 0xd84a3e, C.lav][k], 0, 0.8); }
  } else {
    // gare centrale moderne : grand hall de pierre claire sous une voûte de zinc, verrière en arc sur le quai, tour de
    // l'horloge effilée, quai sous un auvent ondulé porté par des piliers en arbre, voie devant (comme à la gare)
    const stone = 0xebe6dc, zinc = 0x7d8fa0, steel = 0x5d6878, glass = 0x9cc8dc;
    sink(0.03);
    platformTrack(p, 0.03, true);
    farPlatform(p, true);
    p.box(1.9, 0.08, 0.38, 0, 0.03, -0.03, 0xc8c4bc);
    p.box(1.9, 0.004, 0.03, 0, 0.11, 0.14, 0xf2c84b);
    // le hall : socle, pilastres, corniche, voûte et ses côtes
    const hz = -0.6, hd = 0.62, hw = 1.5, hh = 0.42;
    p.box(hw, hh, hd, -0.12, 0.03, hz, stone);
    p.box(hw + 0.04, 0.05, hd + 0.04, -0.12, 0.03, hz, dark(stone, 0.86));
    p.box(hw + 0.04, 0.035, hd + 0.04, -0.12, 0.03 + hh, hz, dark(stone, 0.92));
    for (let i = 0; i < 7; i++) p.box(0.04, hh - 0.05, 0.02, -0.82 + i * 0.233, 0.08, hz + hd / 2 + 0.01, dark(stone, 0.94));
    p.add(new THREE.CylinderGeometry(0.31, 0.31, hw, 10, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), -0.12, 0.03 + hh + 0.035, hz, zinc);
    for (let i = 0; i < 6; i++) p.add(new THREE.TorusGeometry(0.312, 0.012, 4, 12, Math.PI).rotateY(Math.PI / 2), -0.82 + i * 0.28, 0.03 + hh + 0.035, hz, steel);
    // verrière en arc au-dessus de l'entrée, côté quai, et ses meneaux
    p.add(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), -0.12, 0.2, hz + hd / 2 + 0.012, glass, 0, true);
    for (let k = -2; k <= 2; k++) p.box(0.012, 0.27 * Math.cos(Math.asin(Math.min(1, Math.abs(k) / 3))) + 0.0, 0.012, -0.12 + k * 0.09, 0.2, hz + hd / 2 + 0.026, steel);
    p.box(0.56, 0.17, 0.02, -0.12, 0.03, hz + hd / 2 + 0.012, glass, 0, true);
    for (let k = -2; k <= 2; k++) p.box(0.012, 0.17, 0.014, -0.12 + k * 0.13, 0.03, hz + hd / 2 + 0.026, steel);
    p.box(0.6, 0.012, 0.02, -0.12, 0.2, hz + hd / 2 + 0.026, steel);
    // fenêtres hautes des ailes, enseigne lumineuse
    for (const x of [-0.7, -0.52, 0.28, 0.46]) { p.box(0.1, 0.22, 0.012, x, 0.12, hz + hd / 2 + 0.012, glass, 0, true); p.box(0.11, 0.012, 0.016, x, 0.34, hz + hd / 2 + 0.014, steel); }
    p.box(0.42, 0.05, 0.012, -0.12, 0.5, hz + hd / 2 + 0.02, 0x2e3c48); p.box(0.36, 0.024, 0.004, -0.12, 0.513, hz + hd / 2 + 0.028, 0xfff0c0, 0, true);
    // façade arrière, côté parvis : hautes fenêtres, porte vitrée sous un auvent, pignons des ailes
    const bz = hz - hd / 2 - 0.012;
    for (const x of [-0.72, -0.5, 0.26, 0.48]) { p.box(0.1, 0.24, 0.012, x, 0.1, bz, glass, 0, true); p.box(0.11, 0.012, 0.016, x, 0.35, bz - 0.002, steel); }
    p.box(0.36, 0.22, 0.012, -0.12, 0.03, bz, glass, 0, true);
    for (let k = -1; k <= 1; k++) p.box(0.012, 0.22, 0.016, -0.12 + k * 0.12, 0.03, bz - 0.004, steel);
    p.add(new THREE.BoxGeometry(0.5, 0.014, 0.14), -0.12, 0.27, bz - 0.06, steel, 0, false, 0, 0.12);
    p.box(0.3, 0.04, 0.012, -0.12, 0.31, bz - 0.004, 0x2e3c48); p.box(0.25, 0.02, 0.004, -0.12, 0.32, bz - 0.012, 0xfff0c0, 0, true);
    for (const sx of [-1, 1]) p.box(0.012, hh - 0.05, 0.36, -0.12 + sx * (hw / 2 + 0.006), 0.08, hz, dark(stone, 0.94));
    for (const sx of [-1, 1]) for (const z of [-0.75, -0.6, -0.45]) p.box(0.012, 0.18, 0.08, -0.12 + sx * (hw / 2 + 0.008), 0.14, z, glass, 0, true);
    // tour de l'horloge, effilée, horloges sur deux faces, flèche
    const tx = 0.78, tz = -0.62;
    p.box(0.2, 1.15, 0.2, tx, 0.03, tz, stone);
    for (let y = 0.2; y < 0.95; y += 0.18) p.box(0.04, 0.1, 0.012, tx, y, tz + 0.106, glass, 0, true);
    p.box(0.24, 0.03, 0.24, tx, 1.0, tz, dark(stone, 0.9));
    for (const [dx, dz, ry] of [[0, 0.101, 0], [0.101, 0, Math.PI / 2]]) {
      p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 16).rotateX(Math.PI / 2).rotateY(ry), tx + dx, 1.08, tz + dz, C.white);
      p.add(new THREE.BoxGeometry(0.006, 0.05, 0.004).rotateY(ry), tx + dx * 1.07, 1.095, tz + dz * 1.07, 0x2a2a2a);
      p.add(new THREE.BoxGeometry(0.04, 0.006, 0.004).rotateY(ry), tx + dx * 1.07 + (ry ? 0 : 0.012), 1.08, tz + dz * 1.07 + (ry ? 0.012 : 0), 0x2a2a2a);
    }
    p.box(0.22, 0.02, 0.22, tx, 1.15, tz, dark(stone, 0.9));
    p.pyramid(0.2, 0.22, 0.2, tx, 1.17, tz, zinc);
    p.cyl(0.006, 0.006, 0.14, 4, tx, 1.39, tz, C.gold);
    // auvent ondulé du quai, porté par des piliers en arbre
    for (let i = 0; i < 4; i++) {
      const x = -0.72 + i * 0.48;
      p.cyl(0.016, 0.022, 0.24, 6, x, 0.11, -0.04, steel);
      for (const a of [-0.5, 0.5]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4).translate(0, 0.07, 0), x, 0.33, -0.04, steel, 0, false, a, 0);
      for (const a of [-0.5, 0.5]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4).translate(0, 0.06, 0), x, 0.33, -0.04, steel, 0, false, 0, a);
    }
    for (let k = 0; k < 8; k++) p.add(new THREE.BoxGeometry(0.24, 0.016, 0.44), -0.84 + k * 0.24, 0.45 + (k % 2 ? 0.02 : -0.01), -0.04, k % 2 ? 0xf2f2ee : 0xe2e6ea, 0, false, 0, (k % 2 ? 1 : -1) * 0.06);
    p.box(1.9, 0.015, 0.02, 0, 0.44, 0.18, 0xf2c84b);
    // sur le quai : écrans des départs, bancs, distributeur, réverbères, arbres en bac
    for (const x of [-0.45, 0.45]) { p.box(0.01, 0.12, 0.01, x, 0.31, -0.04, steel); p.box(0.18, 0.06, 0.014, x, 0.33, -0.04, 0x2e3c48); p.box(0.15, 0.035, 0.004, x, 0.343, -0.031, 0xffb84a, 0, true); }
    for (const x of [-0.7, -0.2, 0.2]) p.box(0.16, 0.02, 0.05, x, 0.15, -0.16, 0x8a96a2);
    p.box(0.07, 0.14, 0.05, 0.7, 0.11, -0.16, 0xd8553c); p.box(0.04, 0.03, 0.006, 0.7, 0.2, -0.132, 0x9de0ff, 0, true);
    for (const x of [-0.92, 0.92]) { p.box(0.1, 0.06, 0.1, x, 0.11, -0.12, 0x8a8a8a); p.cyl(0.01, 0.012, 0.08, 5, x, 0.17, -0.12, C.darkwood); p.sphere(0.06, x, 0.3, -0.12, C.darkgreen, 1); }
    // parvis derrière : bacs fleuris, drapeaux, vélos
    for (const x of [-0.6, 0.35]) { p.box(0.22, 0.05, 0.08, x, 0.03, -0.95, 0x8a8a8a); for (let k = 0; k < 5; k++) p.sphere(0.02, x - 0.08 + k * 0.04, 0.09, -0.95, [C.pink, C.butter, 0xd84a3e, C.lav, C.white][k], 0, 0.8); }
    for (let k = 0; k < 3; k++) { const x = -0.95 + k * 0.08; p.cyl(0.005, 0.005, 0.5, 4, x, 0.03, -0.28, 0xd8dde2); p.box(0.06, 0.04, 0.004, x + 0.03, 0.47, -0.28, [0x3c7fd8, C.white, 0xd8553c][k]); }
  }
}

/** Croix rouge sur fond blanc, face à +z, centrée en (x, y, z) */
function redCross(p: Parts, x: number, y: number, z: number, s = 1) {
  p.box(0.16 * s, 0.16 * s, 0.015, x, y - 0.08 * s, z, C.white);
  p.box(0.11 * s, 0.035 * s, 0.01, x, y - 0.0175 * s, z + 0.01, 0xd84a3e);
  p.box(0.035 * s, 0.11 * s, 0.01, x, y - 0.055 * s, z + 0.01, 0xd84a3e);
}

/** Rangée de fenêtres éclairées la nuit sur la façade z : encadrement, appui, croisée de bois qui partage les carreaux */
function windows(p: Parts, xs: number[], y: number, z: number, w = 0.08, h = 0.1, frame = 0xece4d4) {
  for (const x of xs) {
    p.box(w, h, 0.02, x, y, z, C.win, 0, true);
    p.box(w + 0.022, h + 0.022, 0.014, x, y - 0.011, z - 0.005, frame);
    p.box(w + 0.034, 0.014, 0.034, x, y - 0.016, z + 0.004, frame);
    p.box(0.008, h, 0.006, x, y, z + 0.012, C.darkwood);
    p.box(w, 0.008, 0.006, x, y + h * 0.55, z + 0.012, C.darkwood);
  }
}

/**
 * Moellons d'un mur : rangs décalés de pierres de longueurs et de teintes variées, en léger relief, sur la face de centre
 * (cx, cz) tournée selon ry (0 : vers +z), large de `len`, de y0 à y1 ; `fill` : part des pierres posées
 */
function stones(p: Parts, cx: number, cz: number, len: number, y0: number, y1: number, ry: number, color: number, fill = 0.6, seed = 0) {
  const c = Math.cos(ry), s = Math.sin(ry), rh = 0.042;
  for (let r = 0; y0 + r * rh + 0.02 < y1; r++) {
    const y = y0 + r * rh, hh = Math.min(rh, y1 - y) - 0.007;
    for (let u = -len / 2 + (r % 2 ? 0.035 : 0.004), i = 0; u < len / 2 - 0.02; i++) {
      const sw = Math.min(0.05 + hash2(r, i, seed) * 0.06, len / 2 - u), m = u + sw / 2;
      if (hash2(i, r, seed + 1) < fill) p.box(sw - 0.007, hh, 0.008, cx + m * c, y + 0.0035, cz - m * s, dark(color, 0.86 + hash2(r + 9, i, seed + 2) * 0.2), ry);
      u += sw;
    }
  }
}

/** Chaîne d'angle : pierres de taille alternées, longues sur une face puis sur l'autre ; (sx, sz) : côtés vers l'extérieur */
function quoins(p: Parts, x: number, z: number, y0: number, y1: number, sx: number, sz: number, color = 0xe9e2d4) {
  for (let i = 0, y = y0; y + 0.03 < y1; i++, y += 0.055) {
    const a = i % 2 ? 0.085 : 0.05, b = i % 2 ? 0.05 : 0.085;
    p.box(a, 0.047, b, x - sx * (a / 2 - 0.006), y + 0.004, z - sz * (b / 2 - 0.006), color);
  }
}

/**
 * Pans de bois sur une face (centre cx, cz, tournée selon ry) : poteaux, sablières, et dans les travées que `braced` retient
 * des décharges en croix de Saint-André
 */
function timbers(p: Parts, cx: number, cz: number, len: number, y0: number, y1: number, ry: number, n: number, braced: (i: number) => boolean = () => true, color = C.darkwood) {
  const c = Math.cos(ry), s = Math.sin(ry), h = y1 - y0, bay = len / n;
  for (let i = 0; i <= n; i++) { const u = -len / 2 + i * bay; p.box(0.024, h, 0.012, cx + u * c, y0, cz - u * s, color, ry); }
  for (const y of [y0, y1 - 0.022]) p.box(len, 0.022, 0.012, cx, y, cz, color, ry);
  const dl = Math.hypot(bay, h) * 0.94, ang = Math.atan2(h, bay);
  for (let i = 0; i < n; i++) {
    if (!braced(i)) continue;
    const u = -len / 2 + (i + 0.5) * bay;
    for (const sg of [1, -1]) p.add(new THREE.BoxGeometry(dl, 0.018, 0.01), cx + u * c, y0 + h / 2, cz - u * s, color, ry, false, sg * ang);
  }
}

/** Haie taillée : un bloc de buis bosselé de touffes un peu plus claires ou plus sombres */
function hedge(p: Parts, x: number, z: number, w: number, d: number, h = 0.07, y = 0.03) {
  p.box(w, h, d, x, y, z, C.darkgreen);
  const n = Math.max(1, Math.round(Math.max(w, d) / 0.07)), along = w >= d;
  for (let i = 0; i < n; i++) {
    const u = -0.5 + (i + 0.5) / n;
    p.sphere(Math.min(w, d) * 0.5 + 0.008, x + (along ? u * w : 0), y + h, z + (along ? 0 : u * d), dark(C.darkgreen, 0.9 + hash2(i, n, 41) * 0.2), 0, 0.55);
  }
}

/** Pavés en rangs décalés sur un rectangle (x0..x1, z0..z1) posé à la hauteur y, d'une teinte qui varie d'une pierre à l'autre */
function cobbles(p: Parts, x0: number, z0: number, x1: number, z1: number, color: number, y: number, seed: number, w = 0.1, d = 0.07) {
  for (let r = 0, z = z0 + d / 2; z < z1 - d / 2 + 0.001; r++, z += d + 0.012)
    for (let i = 0, x = x0 + w / 2 + (r % 2 ? w / 2 : 0); x < x1 - w / 2 + 0.001; i++, x += w + 0.012)
      p.box(w, 0.005, d, x, y, z, dark(color, 0.84 + hash2(i, r, seed) * 0.2));
}

/** Herbe au bord de la parcelle : touffes et fleurs semées le long des quatre bords, là où `ok` le permet */
function verge(p: Parts, n: number, seed: number, y: number, ok: (x: number, z: number) => boolean = () => true) {
  for (let i = 0; i < n; i++) {
    const u = -0.86 + hash2(i, 1, seed) * 1.72, v = 0.87 - hash2(i, 3, seed) * 0.06;
    const [x, z] = ([[u, v], [u, -v], [v, u], [-v, u]] as [number, number][])[Math.floor(hash2(i, 2, seed) * 4)];
    if (!ok(x, z)) continue;
    p.sphere(0.022 + hash2(i, 4, seed) * 0.016, x, y, z, hash2(i, 5, seed) < 0.5 ? 0x8ab86a : 0x9fc87a, 0, 0.5);
    if (hash2(i, 6, seed) < 0.35) p.sphere(0.01, x + 0.01, y + 0.02, z, [0xf2a6c8, 0xf2d24a, 0xffffff, 0xc8a0d8][i % 4]);
  }
}

/** Pieu, mât, poteau : cylindre fin incliné de (rx, rz) */
function pole(p: Parts, r: number, h: number, x: number, z: number, color: number, rx = 0, rz = 0, y = 0) {
  p.add(new THREE.CylinderGeometry(r, r * 1.2, h, 5).translate(0, h / 2, 0), x, y, z, color, 0, false, rz, rx);
}

/** Petit arbre rond sur son tronc */
function tree(p: Parts, x: number, z: number, s = 1, leaf = C.darkgreen) {
  p.cyl(0.018 * s, 0.024 * s, 0.14 * s, 5, x, 0, z, C.wood);
  p.sphere(0.1 * s, x, 0.2 * s, z, leaf, 0, 0.9);
}

/** Cercle de pierres et flammes d'un feu (avec sa fumée) */
function campfire(p: Parts, x: number, z: number, s = 1) {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; p.sphere(0.03 * s, x + Math.cos(a) * 0.085 * s, 0.01, z + Math.sin(a) * 0.085 * s, i % 2 ? C.darkstone : C.stone, 0, 0.7); }
  p.cone(0.045 * s, 0.12 * s, 5, x, 0.02, z, C.flame, true);
  smoke(x, 0.16 * s, z, 1);
}

/** Lieux de soins (2 × 2) : camp du guérisseur, asclépiéion, hôtel-Dieu, hôpital en U, centre hospitalier */
function health(p: Parts, age: number) {
  if (age === 0) {
    // deux huttes de peaux, un grand séchoir à herbes, la marmite sur le feu, nattes des malades, carrés de simples
    p.cyl(0.86, 0.88, 0.012, 14, 0, 0, 0, dark(C.dirt, 0.92));
    // tentes de peaux (Survival Kit de Kenney, toiles recolorées), sinon huttes coniques
    const tents = attach(['p_tent'], 0, 0.62, -0.44, -0.46, 0.25, unRed(C.hide)) && attach(['p_tent'], 0, 0.5, 0.46, -0.52, -0.4, unRed(0xc9a98a));
    if (!tents) {
      p.cone(0.36, 0.64, 7, -0.46, 0, -0.44, C.hide); p.add(new THREE.ConeGeometry(0.12, 0.28, 3), -0.46, 0.14, -0.1, C.darkwood);
      for (const a of [-0.25, 0.25]) pole(p, 0.008, 0.24, -0.46 + a * 0.1, -0.44, C.wood, 0, a, 0.58);
      p.cone(0.28, 0.5, 6, 0.46, 0, -0.52, 0xc9a98a); p.add(new THREE.ConeGeometry(0.09, 0.22, 3), 0.46, 0.11, -0.26, C.darkwood);
    }
    for (const x of [0.02, 0.4, 0.78]) p.box(0.03, 0.44, 0.03, x, 0, 0.1, C.wood);
    p.box(0.8, 0.025, 0.025, 0.4, 0.42, 0.1, C.wood);
    for (let i = 0; i < 9; i++) p.add(new THREE.ConeGeometry(0.03, 0.12, 5).rotateZ(Math.PI), 0.06 + i * 0.085, 0.35, 0.1, [0x8fbf6a, 0x6fa35a, C.lav][i % 3]);
    // le feu et sa marmite de tisanes (modèle de Kenney), la flamme luit la nuit et fume
    if (attach(['p_campfire'], 0, 0.3, -0.22, 0.32, 0, toWood)) {
      p.cone(0.035, 0.09, 5, -0.22, 0.015, 0.32, C.flame, true);
      smoke(-0.22, 0.2, 0.32, 1);
    } else {
      campfire(p, -0.22, 0.32);
      for (const a of [0, 2.1, 4.2]) pole(p, 0.007, 0.3, -0.22 + Math.cos(a) * 0.09, 0.32 + Math.sin(a) * 0.09, C.darkwood, -Math.sin(a) * 0.3, Math.cos(a) * 0.3);
      p.sphere(0.06, -0.22, 0.17, 0.32, 0x4a4440, 0, 0.8);
    }
    // couchages des malades, seau d'eau
    for (const [x, z] of [[-0.62, 0.02], [-0.66, 0.3]]) if (!attach(['p_bedroll'], 0, 0.28, x, z, Math.PI / 2, toFur)) { p.box(0.3, 0.015, 0.16, x + 0.04, 0, z, C.hide); p.box(0.07, 0.04, 0.12, x - 0.08, 0.015, z, 0xe8dcc0); }
    if (!attach(['p_bucket'], 0, 0.09, 0.12, 0.6)) { p.cyl(0.05, 0.04, 0.07, 7, 0.12, 0, 0.6, C.darkstone); pole(p, 0.008, 0.12, 0.13, 0.6, C.wood, 0, -0.4, 0.05); }
    for (const [x, z, c] of [[0.45, 0.55, 0x8fbf6a], [0.68, 0.55, C.lav], [0.45, 0.76, 0x6fa35a], [0.68, 0.76, 0xd8c060]] as [number, number, number][]) {
      p.box(0.18, 0.03, 0.16, x, 0, z, dark(C.dirt, 0.7));
      for (const d of [-0.05, 0.05]) p.sphere(0.035, x + d, 0.04, z + d * 0.6, c, 0, 0.7);
    }
    log(p, 0.36, 0.035, 0.05, 0, 0.4, 0.4);
  } else if (age === 1) {
    // sanctuaire d'Asclépios : temple à colonnes, portique, bassin de l'eau sacrée, cyprès et jardin des simples
    p.box(1.76, 0.05, 1.16, 0, 0, -0.36, C.stone); p.box(1.66, 0.05, 1.06, 0, 0.05, -0.36, 0xe6dccb);
    if (attach(['a_temple'], 0, 1.0, -0.4, -0.42, 0, toMarble, 1, /mat25/)) tileRoof(p, 0.46, C.terracotta);
    else {
      p.box(0.66, 0.4, 0.5, -0.38, 0.1, -0.56, C.white);
      for (let i = 0; i < 4; i++) p.cyl(0.035, 0.04, 0.4, 7, -0.62 + i * 0.16, 0.1, -0.2, C.white);
      p.box(0.74, 0.05, 0.84, -0.38, 0.5, -0.42, C.white);
      p.gable(0.86, 0.18, 0.76, -0.38, 0.55, -0.42, C.terracotta, Math.PI / 2);
      p.box(0.12, 0.2, 0.02, -0.38, 0.1, -0.305, C.door);
    }
    // portique couvert
    p.box(0.62, 0.32, 0.08, 0.48, 0.1, -0.82, 0xe6dccb);
    for (let i = 0; i < 4; i++) p.cyl(0.03, 0.034, 0.32, 7, 0.22 + i * 0.17, 0.1, -0.5, C.white);
    p.add(new THREE.BoxGeometry(0.7, 0.025, 0.42), 0.48, 0.44, -0.66, C.terracotta, 0, false, 0, -0.12);
    for (let i = 0; i <= 14; i++) p.add(new THREE.BoxGeometry(0.011, 0.011, 0.42), 0.15 + i * 0.0471, 0.459, -0.66, dark(C.terracotta, 0.84), 0, false, 0, -0.12);
    p.box(0.7, 0.016, 0.026, 0.48, 0.452 + 0.21 * Math.sin(0.12), -0.66 + 0.21, dark(C.terracotta, 0.74));
    for (const x of [0.32, 0.62]) p.box(0.2, 0.05, 0.08, x, 0.1, -0.72, C.stone);
    // bassin sacré
    p.box(0.96, 0.07, 0.36, -0.05, 0, 0.45, C.stone); p.box(0.86, 0.012, 0.26, -0.05, 0.062, 0.45, C.water);
    p.cyl(0.03, 0.04, 0.16, 6, -0.05, 0.07, 0.45, C.white); p.sphere(0.03, -0.05, 0.25, 0.45, C.white);
    for (const x of [-0.86, 0.86]) { p.cyl(0.02, 0.025, 0.1, 5, x, 0, 0.46, C.wood); p.cone(0.09, 0.42, 6, x, 0.08, 0.46, C.darkgreen); }
    for (const [x, c] of [[0.55, 0x8fbf6a], [0.72, C.lav]] as [number, number][]) { p.box(0.14, 0.04, 0.24, x, 0, 0.78, C.darkwood); p.sphere(0.04, x, 0.05, 0.72, c, 0, 0.7); p.sphere(0.04, x, 0.05, 0.84, c, 0, 0.7); }
    // bâton au serpent devant le temple
    p.box(0.08, 0.06, 0.08, -0.38, 0.1, 0.0, C.stone);
    p.cyl(0.01, 0.01, 0.32, 5, -0.38, 0.16, 0.0, C.gold);
    for (const y of [0.28, 0.36, 0.43]) p.add(new THREE.TorusGeometry(0.022, 0.006, 4, 8).rotateX(Math.PI / 2), -0.38, y, 0.0, 0x6fa35a);
  } else if (age === 2) {
    // hôtel-Dieu : grande salle des malades (pierre et colombages), chapelle et clocher, jardin clos de simples autour d'un puits
    sink(0.03);
    p.box(1.36, 0.3, 0.55, -0.18, 0.03, -0.6, C.stone);
    stones(p, -0.18, -0.325, 1.36, 0.03, 0.33, 0, C.stone, 0.55, 11);
    stones(p, -0.86, -0.6, 0.55, 0.03, 0.33, -Math.PI / 2, C.stone, 0.55, 12);
    quoins(p, -0.86, -0.325, 0.03, 0.33, -1, 1);
    // étage en encorbellement : pans de bois, une travée sur deux en croix, l'autre percée d'une fenêtre
    p.box(1.4, 0.26, 0.59, -0.18, 0.33, -0.6, C.cream);
    p.box(1.42, 0.02, 0.61, -0.18, 0.325, -0.6, C.darkwood);
    timbers(p, -0.18, -0.302, 1.4, 0.345, 0.59, 0, 8, (i) => i % 2 === 1);
    timbers(p, -0.882, -0.6, 0.59, 0.345, 0.59, -Math.PI / 2, 3, (i) => i !== 1);
    roof(p, -0.18, 0.59, -0.6, { w: 1.4, d: 0.59, h: 0.4, color: 0x8a5a44, wall: C.cream, courses: true });
    for (const x of [-0.56, 0.18]) {
      p.box(0.13, 0.18, 0.17, x, 0.62, -0.415, C.cream);
      roof(p, x, 0.8, -0.415, { w: 0.17, d: 0.13, h: 0.07, color: 0x8a5a44, wall: C.cream, ry: Math.PI / 2, len: 0.21, ov: 0.025 });
      windows(p, [x], 0.69, -0.325, 0.06, 0.07, C.darkwood);
    }
    p.box(0.09, 0.32, 0.09, -0.66, 0.78, -0.74, C.stone); p.box(0.11, 0.025, 0.11, -0.66, 1.1, -0.74, C.darkstone);
    smoke(-0.66, 1.16, -0.74, 0);
    p.box(0.14, 0.22, 0.02, -0.18, 0.03, -0.32, C.door);
    p.box(0.18, 0.025, 0.04, -0.18, 0.25, -0.31, C.darkwood);
    windows(p, [-0.72, -0.46, 0.1, 0.34], 0.12, -0.32, 0.07, 0.1); windows(p, [-0.7925, -0.4425, -0.0925, 0.2575], 0.39, -0.29, 0.06, 0.09, C.darkwood);
    // chapelle à contreforts et clocher de pierre
    p.box(0.36, 0.48, 0.66, 0.7, 0.03, -0.58, C.stone);
    stones(p, 0.88, -0.58, 0.66, 0.03, 0.51, Math.PI / 2, C.stone, 0.5, 13);
    for (const z of [-0.8, -0.5]) { p.box(0.05, 0.32, 0.06, 0.905, 0.03, z, C.darkstone); p.add(new THREE.BoxGeometry(0.05, 0.02, 0.085), 0.9, 0.36, z, C.darkstone, 0, false, 0.6); }
    roof(p, 0.7, 0.51, -0.58, { w: 0.66, d: 0.36, h: 0.26, color: C.slate, wall: C.stone, ry: Math.PI / 2, courses: true });
    p.box(0.18, 0.86, 0.18, 0.7, 0.03, -0.18, C.stone); p.pyramid(0.24, 0.34, 0.24, 0.7, 0.89, -0.18, C.slate);
    stones(p, 0.7, -0.09, 0.18, 0.03, 0.89, 0, C.stone, 0.5, 14);
    stones(p, 0.79, -0.18, 0.18, 0.03, 0.89, Math.PI / 2, C.stone, 0.5, 15);
    for (const x of [0.61, 0.79]) quoins(p, x, -0.09, 0.03, 0.89, x > 0.7 ? 1 : -1, 1);
    p.box(0.21, 0.025, 0.21, 0.7, 0.56, -0.18, C.darkstone);
    p.box(0.012, 0.09, 0.012, 0.7, 1.22, -0.18, C.gold); p.box(0.05, 0.012, 0.012, 0.7, 1.27, -0.18, C.gold);
    p.box(0.08, 0.1, 0.02, 0.7, 0.66, -0.085, 0x3c3530); p.sphere(0.03, 0.7, 0.66, -0.12, C.gold, 0, 1.2);
    p.box(0.08, 0.16, 0.02, 0.7, 0.2, -0.085, C.win, 0, true);
    p.box(0.1, 0.18, 0.012, 0.7, 0.19, -0.094, 0xece4d4); p.gable(0.014, 0.05, 0.1, 0.7, 0.37, -0.092, 0xece4d4, Math.PI / 2);
    p.box(0.008, 0.16, 0.006, 0.7, 0.2, -0.073, C.darkwood);
    // jardin clos : haies de buis, carrés de simples bordés de planches, allées de gravier, puits au milieu
    for (const [x, z, w, d] of [[-0.48, 0.86, 0.8, 0.05], [0.48, 0.86, 0.8, 0.05], [-0.86, 0.32, 0.05, 1.04], [0.86, 0.32, 0.05, 1.04]]) hedge(p, x, z, w, d, 0.08);
    p.box(0.08, 0.006, 1.0, 0, 0.03, 0.34, 0xe9dfca); p.box(1.6, 0.006, 0.08, 0, 0.03, 0.34, 0xe9dfca);
    for (const [x, z, c] of [[-0.5, 0.12, 0x8fbf6a], [0.5, 0.12, C.lav], [-0.5, 0.56, 0xd8c060], [0.5, 0.56, 0x6fa35a]] as [number, number, number][]) {
      p.box(0.42, 0.045, 0.3, x, 0.03, z, C.wood);
      p.box(0.39, 0.046, 0.27, x, 0.03, z, dark(C.dirt, 0.72));
      for (const dz of [-0.07, 0.07]) for (const d of [-0.14, -0.047, 0.047, 0.14]) p.sphere(0.034, x + d, 0.085, z + dz, dark(c, 0.92 + hash2(d * 100, dz * 100, 61) * 0.16), 0, 0.75);
    }
    p.cyl(0.11, 0.12, 0.12, 8, 0, 0.03, 0.34, C.stone); p.cyl(0.08, 0.08, 0.01, 8, 0, 0.15, 0.34, C.water);
    for (const x of [-0.1, 0.1]) p.box(0.025, 0.24, 0.025, x, 0.03, 0.34, C.wood);
    p.gable(0.26, 0.1, 0.2, 0, 0.27, 0.34, C.slate);
    // bannière à croix rouge
    p.cyl(0.009, 0.009, 0.6, 4, -0.7, 0.03, 0.62, C.darkwood);
    { const f = sway([-0.7, 0, 0.62], [0, 1, 0], 0.3, 0.9); f.box(0.12, 0.15, 0.006, 0.06, 0.45, 0, C.white); f.box(0.08, 0.025, 0.008, 0.06, 0.51, 0.002, 0xd84a3e); f.box(0.025, 0.08, 0.008, 0.06, 0.475, 0.002, 0xd84a3e); }
  } else if (age === 3) {
    // hôpital de brique en U : corps central à fronton et horloge, deux ailes, cour plantée et fontaine, grille et ambulances à cheval
    sink(0.025);
    p.box(0.92, 0.62, 0.44, 0, 0.03, -0.66, C.brick); p.box(0.94, 0.035, 0.46, 0, 0.33, -0.66, C.cream);
    roof(p, 0, 0.65, -0.66, { w: 0.92, d: 0.44, h: 0.22, color: C.slate, wall: C.brick, courses: true });
    stones(p, 0, -0.439, 0.92, 0.03, 0.65, 0, dark(C.brick, 0.86), 0.45, 350);
    for (const x of [-0.46, 0.46]) quoins(p, x, -0.44, 0.03, 0.65, x < 0 ? -1 : 1, 1);
    for (const x of [-0.3, 0.3]) { p.box(0.07, 0.22, 0.07, x, 0.75, -0.78, 0xa85e50); p.box(0.085, 0.025, 0.085, x, 0.97, -0.78, C.cream); smoke(x, 1.0, -0.78, 0); }
    // mât au drapeau à croix rouge, bancs et massifs de fleurs dans la cour, réverbères au portail
    p.cyl(0.008, 0.01, 0.7, 5, -0.24, 0.03, -0.36, C.metal); { const f = sway([-0.24, 0, -0.36], [0, 1, 0], 0.35, 1.1); f.box(0.006, 0.1, 0.15, 0, 0.6, 0.075, C.white); f.box(0.008, 0.025, 0.06, 0, 0.64, 0.075, 0xd84a3e); f.box(0.008, 0.07, 0.02, 0, 0.617, 0.075, 0xd84a3e); }
    for (const x of [-0.24, 0.24]) { p.box(0.16, 0.02, 0.05, x, 0.07, 0.1, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.045, 0.04, x + d, 0.025, 0.1, 0x3c4a44); }
    for (let i = 0; i < 14; i++) p.sphere(0.022, -0.46 + (i % 7) * 0.15, 0.05, i < 7 ? -0.3 : 0.15, [C.pink, C.butter, C.lav, 0xd84a3e][i % 4], 0, 0.8);
    for (const s of [-1, 1]) { p.cyl(0.007, 0.009, 0.3, 5, s * 0.26, 0.025, 0.86, 0x3c4a44); p.box(0.04, 0.045, 0.04, s * 0.26, 0.32, 0.86, 0xffe2a0, 0, true); }
    p.box(0.34, 0.78, 0.1, 0, 0.03, -0.41, C.cream); p.gable(0.36, 0.16, 0.12, 0, 0.81, -0.41, C.slate);
    p.cyl(0.055, 0.055, 0.012, 12, 0, 0.66, -0.355, C.white); p.box(0.005, 0.04, 0.004, 0, 0.675, -0.348, C.darkwood); p.box(0.03, 0.005, 0.004, 0.012, 0.66, -0.348, C.darkwood);
    p.box(0.14, 0.24, 0.02, 0, 0.03, -0.355, C.door); redCross(p, 0, 0.52, -0.352, 0.85);
    for (const s of [-1, 1]) {
      p.box(0.36, 0.52, 0.88, s * 0.72, 0.03, -0.3, C.brick); p.box(0.38, 0.035, 0.9, s * 0.72, 0.29, -0.3, C.cream);
      roof(p, s * 0.72, 0.55, -0.3, { w: 0.88, d: 0.36, h: 0.2, color: C.slate, wall: C.brick, ry: Math.PI / 2, courses: true });
      stones(p, s * 0.54, -0.3, 0.88, 0.03, 0.55, -s * Math.PI / 2, dark(C.brick, 0.86), 0.45, 352 + s);
      stones(p, s * 0.72, 0.14, 0.36, 0.03, 0.55, 0, dark(C.brick, 0.86), 0.45, 354 + s);
      quoins(p, s * 0.54, 0.14, 0.03, 0.55, -s, 1); quoins(p, s * 0.9, 0.14, 0.03, 0.55, s, 1);
      for (const y of [0.1, 0.36]) {
        for (const z of [-0.6, -0.36, -0.12]) p.box(0.02, 0.1, 0.07, s * 0.535, 0.03 + y, z, C.win, 0, true);
        p.box(0.07, 0.1, 0.02, s * 0.72, 0.03 + y, 0.145, C.win, 0, true);
      }
      for (const x of [0.3, 0.18]) windows(p, [s * x], 0.13 + (x === 0.3 ? 0 : 0.26), -0.43, 0.07, 0.1);
      windows(p, [s * 0.3], 0.39, -0.43, 0.07, 0.1);
    }
    p.box(1.0, 0.02, 0.5, 0, 0.025, -0.08, C.green);
    p.cyl(0.1, 0.11, 0.05, 10, 0, 0.03, -0.08, C.stone); p.cyl(0.08, 0.08, 0.01, 10, 0, 0.075, -0.08, C.water); p.cyl(0.015, 0.02, 0.12, 5, 0, 0.08, -0.08, C.stone);
    for (const x of [-0.36, 0.36]) tree(p, x, -0.08, 0.9);
    // grille et portail, deux charrettes d'ambulance
    for (let x = -0.9; x <= 0.9; x += 0.075) if (Math.abs(x) > 0.16) p.box(0.012, 0.1, 0.012, x, 0.025, 0.9, 0x3c4a44);
    for (const s of [-1, 1]) { p.box(0.74, 0.012, 0.012, s * 0.53, 0.1, 0.9, 0x3c4a44); p.box(0.05, 0.16, 0.05, s * 0.18, 0.025, 0.9, C.cream); }
    for (const x of [-0.5, 0.45]) {
      p.box(0.18, 0.11, 0.11, x, 0.07, 0.55, C.white); p.box(0.19, 0.02, 0.12, x, 0.18, 0.55, C.slate); p.box(0.05, 0.035, 0.005, x, 0.12, 0.608, 0xd84a3e);
      for (const d of [-0.07, 0.07]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 8).rotateX(Math.PI / 2), x + d, 0.045, 0.55, C.darkwood);
    }
  } else {
    // centre hospitalier : grand bloc blanc à bandeaux vitrés, tour, héliport sur le toit, auvent, parking et ambulances
    sink(0.03);
    p.box(1.4, 0.8, 0.72, -0.2, 0.03, -0.5, C.white);
    for (const y of [0.14, 0.36, 0.58]) p.box(1.34, 0.12, 0.02, -0.2, y, -0.135, 0x9fd0e4, 0, true);
    p.box(1.44, 0.04, 0.76, -0.2, 0.83, -0.5, 0xe4e2dc);
    p.box(0.42, 1.2, 0.56, 0.68, 0.03, -0.55, 0xe8eef2);
    for (const x of [0.56, 0.68, 0.8]) p.box(0.06, 1.0, 0.02, x, 0.12, -0.265, 0x9fd0e4, 0, true);
    p.box(0.46, 0.04, 0.6, 0.68, 1.23, -0.55, 0xe4e2dc);
    p.box(0.26, 0.26, 0.02, 0.68, 0.88, -0.255, C.white); p.box(0.18, 0.06, 0.012, 0.68, 0.98, -0.243, 0xd84a3e); p.box(0.06, 0.18, 0.012, 0.68, 0.92, -0.243, 0xd84a3e);
    p.cyl(0.3, 0.3, 0.015, 16, -0.45, 0.87, -0.5, 0x8a8f96);
    for (const dx of [-0.07, 0.07]) p.box(0.03, 0.006, 0.18, -0.45 + dx, 0.888, -0.5, C.white);
    p.box(0.14, 0.006, 0.03, -0.45, 0.888, -0.5, C.white);
    // auvent d'entrée et porte vitrée
    p.box(0.56, 0.03, 0.34, 0.1, 0.27, 0.0, C.white); for (const x of [-0.14, 0.34]) p.cyl(0.014, 0.014, 0.24, 5, x, 0.03, 0.15, C.metal);
    p.box(0.26, 0.2, 0.02, 0.1, 0.03, -0.135, 0x86c4d8);
    // parking et ambulances
    p.box(1.5, 0.012, 0.5, -0.15, 0.03, 0.58, 0x6f747a);
    for (let x = -0.8; x <= 0.5; x += 0.26) p.box(0.012, 0.004, 0.3, x, 0.043, 0.58, C.white);
    for (const x of [-0.67, -0.15]) {
      p.box(0.15, 0.11, 0.24, x, 0.045, 0.58, C.white); p.box(0.15, 0.08, 0.08, x, 0.045, 0.74, C.white);
      p.box(0.152, 0.02, 0.24, x, 0.105, 0.58, 0xd84a3e); p.box(0.04, 0.025, 0.04, x, 0.16, 0.66, 0x6aa8ff, 0, true);
      for (const z of [0.5, 0.72]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8).rotateZ(Math.PI / 2), x, 0.035, z, 0x3c3c40);
    }
    for (const x of [0.45, 0.8]) tree(p, x, 0.62, 0.9);
    tree(p, -0.86, 0.1, 0.8);
    // meneaux des bandeaux vitrés, fenêtres des côtés et de la tour
    for (let x = -0.86; x <= 0.46; x += 0.11) for (const y of [0.14, 0.36, 0.58]) p.box(0.012, 0.12, 0.024, x, y, -0.133, 0xd8dde2);
    for (const y of [0.14, 0.36, 0.58]) p.box(0.02, 0.12, 0.6, -0.905, y, -0.5, 0x9fd0e4, 0, true);
    for (let y = 0.14; y < 1.1; y += 0.16) p.box(0.02, 0.09, 0.4, 0.895, y, -0.55, 0x9fd0e4, 0, true);
    // toit : groupes de ventilation, cage d'escalier, balises de l'héliport, manche à air
    for (const [x, z] of [[0.05, -0.7], [0.22, -0.7], [0.05, -0.36]]) { p.box(0.12, 0.07, 0.1, x, 0.87, z, 0xb8bcc2); p.cyl(0.03, 0.03, 0.012, 8, x, 0.94, z, 0x5d6878); }
    p.box(0.16, 0.12, 0.14, 0.28, 0.87, -0.4, 0xe4e2dc);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.025, 0.012, 0.025, -0.45 + Math.cos(a) * 0.28, 0.885, -0.5 + Math.sin(a) * 0.28, i % 2 ? 0x8aff8a : 0xffe2a0, 0, true); }
    p.cyl(0.005, 0.005, 0.18, 4, -0.82, 0.87, -0.8, 0x9aa3ad);
    p.add(new THREE.ConeGeometry(0.025, 0.1, 6).rotateZ(Math.PI / 2), -0.77, 1.03, -0.8, 0xf28a3c);
    // enseigne des urgences au-dessus de l'auvent, bandeau rouge, bornes, mâts et drapeaux, banc
    p.box(0.46, 0.06, 0.02, 0.1, 0.32, 0.17, 0xd84a3e); p.box(0.38, 0.03, 0.006, 0.1, 0.335, 0.181, 0xfff4e0, 0, true);
    p.box(0.562, 0.02, 0.342, 0.1, 0.3, 0.0, 0xd84a3e);
    for (const x of [-0.24, -0.34, 0.5, 0.6]) p.cyl(0.012, 0.012, 0.06, 6, x, 0.03, 0.22, 0x5d6878);
    for (const [x, c] of [[-0.6, 0x3c7fd8], [-0.5, C.white], [-0.4, 0xd84a3e]] as [number, number][]) { p.cyl(0.005, 0.005, 0.5, 4, x, 0.03, 0.12, 0xd8dde2); p.box(0.07, 0.045, 0.004, x + 0.035, 0.47, 0.12, c); }
    p.box(0.16, 0.02, 0.05, 0.62, 0.07, 0.05, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, 0.62 + d, 0.03, 0.05, 0x5d6878);
    // haie du parking, passage piéton, voitures des visiteurs
    hedge(p, -0.15, 0.86, 1.5, 0.06, 0.06);
    for (let k = 0; k < 5; k++) p.box(0.04, 0.004, 0.14, 0.24 + k * 0.07, 0.036, 0.22, C.white);
    for (const [x, c] of [[0.27, 0x3c7fd8], [0.53, 0xe8c66a]] as [number, number][]) { p.box(0.14, 0.06, 0.22, x, 0.045, 0.58, c); p.box(0.12, 0.05, 0.12, x, 0.105, 0.56, 0xcfe2f0); }
    // les ambulanciers et leur brancard derrière l'ambulance, l'infirmière qui pousse un fauteuil roulant sous l'auvent, les
    // visiteurs, un patient sur le banc ; arceaux et vélos du personnel
    figure(p, -0.48, 0.4, 0xf28a3c, 1.4, false, 0x2a2420, 'idle', 0.03); figure(p, -0.28, 0.42, 0xf28a3c, -1.6, false, 0x8a5a3a, 'idle', 0.03);
    p.box(0.14, 0.012, 0.05, -0.38, 0.1, 0.41, C.white); p.box(0.1, 0.01, 0.04, -0.38, 0.112, 0.41, 0x6aa8ff);
    for (const d of [-0.05, 0.05]) p.box(0.008, 0.055, 0.04, -0.38 + d, 0.045, 0.41, C.metal);
    figure(p, 0.1, -0.02, C.white, 0, false, 0x4a3426, 'idle', 0.02);
    for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.03, 0.006, 4, 10).rotateY(Math.PI / 2), 0.1 + s * 0.035, 0.06, 0.07, 0x3c3c40);
    p.box(0.06, 0.012, 0.05, 0.1, 0.075, 0.07, 0x2c4a7a); p.box(0.06, 0.05, 0.008, 0.1, 0.087, 0.045, 0x2c4a7a);
    seated(p, 0.1, 0.087, 0.075, 0, 0x8ab8d8, 0xd8d4cc);
    figure(p, 0.4, 0.28, 0x8a3a6a, 2.6, false, 0x2a2420, 'idle', 0.02); figure(p, -0.02, 0.26, 0x4fa860, -2.9, false, 0xc8a070, 'idle', 0.02);
    seated(p, 0.6, 0.09, 0.05, 0, 0x8ab8d8, 0x8a8f96);
    for (let k = 0; k < 3; k++) bike(p, 0.72 + k * 0.07, 0.3, [0x3c7fd8, 0x4fa860, C.white][k], 0, 0.03);
  }
}

/** Écoles (2 × 2) : cercle des anciens, académie à portiques, école du monastère, école communale, université */
function school(p: Parts, age: number) {
  if (age === 0) {
    // grand cercle de rondins autour du feu, pierres levées peintes, totem, auvent de peau de l'ancien
    p.cyl(0.86, 0.88, 0.012, 14, 0, 0, 0, dark(C.dirt, 0.88));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; log(p, 0.3, 0.04, Math.cos(a) * 0.5, 0, 0.05 + Math.sin(a) * 0.5, -a + Math.PI / 2); }
    campfire(p, 0, 0.05, 1.2);
    for (const [x, z, h, r] of [[-0.48, -0.72, 0.42, 0.08], [0, -0.82, 0.55, -0.04], [0.48, -0.72, 0.38, 0.1]] as [number, number, number, number][]) {
      p.box(0.18, h, 0.08, x, 0, z, C.stone, -x * 0.5, false, r);
      for (const [dx, dy, c] of [[-0.04, 0.7, 0xb4553a], [0.03, 0.5, 0xc98a3c], [0.02, 0.82, 0x6b4a3a]] as [number, number, number][]) p.box(0.04, 0.03, 0.005, x + dx, h * dy, z + 0.045, c, -x * 0.5);
    }
    // totem : têtes peintes empilées, ailes
    for (const [y, c] of [[0, 0xa07050], [0.16, 0xc9853c], [0.32, 0x8a5a44]] as [number, number][]) p.cyl(0.055, 0.06, 0.16, 6, -0.72, y, 0.5, c);
    p.box(0.3, 0.04, 0.04, -0.72, 0.4, 0.5, 0xb4553a); p.cone(0.06, 0.08, 6, -0.72, 0.48, 0.5, 0xd8c060);
    for (const x of [0.5, 0.86]) p.box(0.03, 0.34, 0.03, x, 0, 0.5, C.wood);
    p.add(new THREE.BoxGeometry(0.44, 0.012, 0.3), 0.68, 0.33, 0.42, C.hide, 0, false, 0, -0.25);
    p.box(0.2, 0.015, 0.14, 0.68, 0, 0.4, 0xd9b99b);
  } else if (age === 1) {
    // académie : portiques en U autour d'une cour dallée, colonnes à chapiteaux et toits de tuiles, oliviers, statue,
    // bancs, cadran solaire
    p.box(1.84, 0.05, 1.84, 0, 0, 0, C.stone); p.box(1.74, 0.02, 1.74, 0, 0.05, 0, 0xe6dccb);
    for (let i = 0; i < 5; i++) for (let k = 0; k < 6; k++) if ((i + k) % 2) p.box(0.17, 0.004, 0.17, -0.36 + i * 0.18, 0.07, -0.36 + k * 0.2, 0xd7cab2);
    // portique du fond : mur, colonnade, architrave, toit de tuiles
    p.box(1.6, 0.36, 0.08, 0, 0.07, -0.8, 0xe6dccb);
    for (let i = 0; i < 7; i++) column(p, -0.66 + i * 0.22, -0.5, 0.34, 0.07);
    p.box(1.42, 0.035, 0.07, 0, 0.405, -0.5, 0xeee4d0);
    tiledShed(p, 0, 0.45, -0.66, 1.72, 0.42, 0.12);
    for (const s of [-1, 1]) {
      // portiques des côtés
      p.box(0.08, 0.36, 1.0, s * 0.8, 0.07, -0.2, 0xe6dccb);
      for (let i = 0; i < 4; i++) column(p, s * 0.5, -0.2 + i * 0.2, 0.34, 0.07);
      p.box(0.07, 0.035, 0.7, s * 0.5, 0.405, 0.1, 0xeee4d0);
      tiledShed(p, s * 0.66, 0.45, 0.06, 0.42, 1.04, -s * 0.12, true);
    }
    // cour : oliviers, statue sur son socle, bancs tournés vers elle, cadran solaire
    const olive = (c: THREE.Color) => { if (c.g > c.r * 1.15) c.setRGB(0.5, 0.58, 0.38); };
    for (const x of [-0.26, 0.26]) if (!attach(['tree_round'], 0, 0.3, x, -0.18, x * 4, olive)) { p.cyl(0.03, 0.045, 0.24, 5, x, 0.07, -0.18, C.darkwood); p.sphere(0.15, x, 0.38, -0.18, 0x9ab07a, 0, 0.75); }
    if (!attach(['a_statue'], 0, 0.2, 0, 0.42, Math.PI)) { p.box(0.12, 0.12, 0.12, 0, 0.07, 0.42, C.stone); p.cyl(0.035, 0.045, 0.2, 6, 0, 0.19, 0.42, C.white); p.sphere(0.04, 0, 0.43, 0.42, C.white); }
    // bancs de marbre : siège sur deux pieds
    for (const [x, z, r] of [[-0.3, 0.42, Math.PI / 2], [0.3, 0.42, Math.PI / 2], [0, 0.18, 0]] as number[][]) {
      for (const d of [-0.09, 0.09]) p.box(0.04, 0.05, 0.08, x + Math.cos(r) * d, 0.07, z - Math.sin(r) * d, C.stone, r);
      p.box(0.26, 0.022, 0.09, x, 0.12, z, 0xf2ead8, r);
    }
    p.cyl(0.06, 0.07, 0.1, 6, 0.42, 0.07, 0.68, C.stone); p.cyl(0.08, 0.08, 0.01, 8, 0.42, 0.17, 0.68, C.white); p.add(new THREE.ConeGeometry(0.02, 0.07, 3), 0.42, 0.2, 0.68, C.gold);
  } else if (age === 2) {
    // école du monastère : grande salle de pierre, haut clocher, galerie de cloître, jardin de buis et puits
    sink(0.03);
    p.box(1.24, 0.4, 0.52, -0.22, 0.03, -0.62, C.cream);
    stones(p, -0.22, -0.36, 1.24, 0.03, 0.43, 0, C.cream, 0.18, 21);
    for (const x of [-0.84, 0.4]) { p.box(0.05, 0.4, 0.54, x, 0.03, -0.62, C.stone); quoins(p, x + (x < 0 ? -0.025 : 0.025), -0.35, 0.03, 0.43, x < 0 ? -1 : 1, 1); }
    stones(p, -0.865, -0.62, 0.54, 0.03, 0.43, -Math.PI / 2, C.stone, 0.6, 22);
    roof(p, -0.22, 0.43, -0.62, { w: 1.24, d: 0.52, h: 0.42, color: 0x6b7f8f, wall: C.cream, courses: true });
    // fenêtres hautes à arc brisé au-dessus de la galerie, contreforts entre elles
    windows(p, [-0.62, -0.38, -0.06, 0.18], 0.2, -0.355, 0.06, 0.13);
    for (const x of [-0.62, -0.38, -0.06, 0.18]) p.gable(0.014, 0.045, 0.082, x, 0.341, -0.36, 0xece4d4, Math.PI / 2);
    for (const x of [-0.74, -0.5, -0.22, 0.06, 0.3]) p.box(0.04, 0.28, 0.045, x, 0.03, -0.338, C.stone);
    // clocher : pierres appareillées, chaînes d'angle, cordons, abat-sons, croix
    p.box(0.26, 1.1, 0.26, 0.66, 0.03, -0.66, C.stone);
    stones(p, 0.66, -0.53, 0.26, 0.03, 1.13, 0, C.stone, 0.5, 23);
    stones(p, 0.79, -0.66, 0.26, 0.03, 1.13, Math.PI / 2, C.stone, 0.5, 24);
    for (const x of [0.53, 0.79]) quoins(p, x, -0.53, 0.03, 1.13, x > 0.66 ? 1 : -1, 1);
    for (const y of [0.45, 0.76]) p.box(0.29, 0.025, 0.29, 0.66, y, -0.66, C.darkstone);
    for (const [dx, dz, w, d] of [[0, 0.135, 0.1, 0.02], [0.135, 0, 0.02, 0.1]]) {
      p.box(w, 0.14, d, 0.66 + dx, 0.82, -0.66 + dz, 0x3c3530);
      for (const y of [0.85, 0.89, 0.93]) p.box(w * 0.9 + 0.004, 0.008, d * 0.9 + 0.004, 0.66 + dx * 1.04, y, -0.66 + dz * 1.04, C.darkwood);
    }
    p.pyramid(0.34, 0.42, 0.34, 0.66, 1.13, -0.66, 0x6b7f8f); p.sphere(0.035, 0.66, 0.86, -0.58, C.gold, 0, 1.2);
    p.box(0.012, 0.1, 0.012, 0.66, 1.53, -0.66, C.gold); p.box(0.055, 0.012, 0.012, 0.66, 1.59, -0.66, C.gold);
    p.box(0.1, 0.18, 0.02, 0.66, 0.03, -0.525, C.door); p.gable(0.016, 0.05, 0.12, 0.66, 0.21, -0.522, C.darkstone, Math.PI / 2);
    // galerie de cloître : colonnettes à chapiteau, arcades, cordon de pierre, appentis d'ardoises
    for (let i = 0; i < 6; i++) {
      const x = -0.8 + i * 0.22;
      p.box(0.05, 0.02, 0.05, x, 0.03, -0.2, C.darkstone);
      p.cyl(0.02, 0.023, 0.13, 6, x, 0.05, -0.2, C.stone);
      p.box(0.05, 0.02, 0.05, x, 0.17, -0.2, C.stone);
      if (i < 5) p.add(new THREE.TorusGeometry(0.11, 0.014, 4, 9, Math.PI), x + 0.11, 0.19, -0.2, C.stone);
    }
    p.box(1.2, 0.03, 0.05, -0.25, 0.29, -0.2, C.stone);
    p.add(new THREE.BoxGeometry(1.24, 0.025, 0.27), -0.25, 0.335, -0.27, 0x6b7f8f, 0, false, 0, 0.2);
    for (let j = 0; j < 6; j++) {
      const l = -0.11 + j * 0.044;
      p.add(new THREE.BoxGeometry(1.24, 0.007, 0.04).translate(0, 0.016, l), -0.25, 0.335, -0.27, dark(0x6b7f8f, j % 2 ? 0.88 : 1.04), 0, false, 0, 0.2);
    }
    // jardin : quatre parterres bordés de buis, simples et fleurs, if taillé au milieu, allées de gravier, puits couvert
    p.box(0.08, 0.006, 0.76, -0.1, 0.03, 0.41, 0xe9dfca); p.box(1.0, 0.006, 0.08, -0.1, 0.03, 0.41, 0xe9dfca);
    for (const [x, z, fc] of [[-0.42, 0.2, C.lav], [0.22, 0.2, C.pink], [-0.42, 0.62, C.butter], [0.22, 0.62, C.lav]] as [number, number, number][]) {
      for (const [hx, hz, hw, hd] of [[x, z - 0.12, 0.4, 0.04], [x, z + 0.12, 0.4, 0.04], [x - 0.18, z, 0.04, 0.2], [x + 0.18, z, 0.04, 0.2]]) hedge(p, hx, hz, hw, hd, 0.05);
      p.box(0.32, 0.03, 0.2, x, 0.03, z, dark(C.dirt, 0.72));
      for (const dz of [-0.05, 0.05]) for (const d of [-0.11, -0.06, 0.06, 0.11]) p.sphere(0.026, x + d, 0.075, z + dz, Math.abs(d) > 0.08 ? fc : 0x8fbf6a, 0, 0.8);
      p.cone(0.035, 0.12, 6, x, 0.05, z, dark(C.darkgreen, 0.85));
    }
    p.cyl(0.08, 0.09, 0.1, 8, -0.1, 0.03, 0.41, C.stone); p.cyl(0.06, 0.06, 0.012, 8, -0.1, 0.122, 0.41, C.water);
    p.add(new THREE.TorusGeometry(0.075, 0.014, 4, 10).rotateX(Math.PI / 2), -0.1, 0.13, 0.41, C.darkstone);
    for (const x of [-0.17, -0.03]) p.box(0.02, 0.2, 0.02, x, 0.12, 0.41, C.wood);
    p.box(0.16, 0.012, 0.012, -0.1, 0.3, 0.41, C.wood);
    p.gable(0.2, 0.07, 0.18, -0.1, 0.31, 0.41, 0x6b7f8f);
    p.box(0.02, 0.13, 0.02, 0.66, 0.03, 0.3, C.darkwood); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.08), 0.66, 0.17, 0.3, 0x9a3a32, 0, false, 0, -0.4);
    tree(p, 0.68, 0.7, 1.1);
    // le sol : pelouse du jardin sous les parterres, cour pavée devant le clocher, herbe et fleurs le long des bords
    p.box(1.08, 0.004, 0.86, -0.1, 0.03, 0.41, 0x9cc888);
    cobbles(p, 0.46, -0.5, 0.88, 0.9, 0xcfc3aa, 0.03, 41);
    verge(p, 40, 42, 0.034, (x, z) => x < 0.44 || z < -0.5);
    // ruches de paille et banc du frère apiculteur, moines au travail et à la lecture
    for (const z of [0.12, 0.28]) skep(p, -0.8, 0.03, z, 0.05);
    p.box(0.06, 0.03, 0.2, -0.72, 0.06, -0.02, C.wood);
    figure(p, -0.68, 0.38, 0x6a4a34, Math.PI / 2); figure(p, 0.56, 0.42, 0x6a4a34, Math.PI); figure(p, -0.38, -0.1, 0x5a4030, 0.4);
    p.box(0.008, 0.008, 0.16, -0.62, 0.12, 0.42, C.wood, 0.5);
  } else if (age === 3) {
    // école communale : bâtiment de brique à clocheton et horloge, préau, cour fermée, marelle, mât au drapeau, platanes
    sink(0.025);
    p.box(1.3, 0.48, 0.5, -0.24, 0.025, -0.64, 0xc98a72); p.box(1.32, 0.03, 0.52, -0.24, 0.26, -0.64, C.cream);
    roof(p, -0.24, 0.505, -0.64, { w: 1.3, d: 0.5, h: 0.24, color: C.slate, wall: 0xc98a72, courses: true });
    // briques, chaînes d'angle et cordon de pierre, linteaux, cheminées qui fument
    stones(p, -0.24, -0.389, 1.3, 0.025, 0.505, 0, dark(0xc98a72, 0.86), 0.45, 340);
    stones(p, -0.89, -0.64, 0.5, 0.025, 0.505, -Math.PI / 2, dark(0xc98a72, 0.86), 0.45, 341);
    for (const x of [-0.89, 0.41]) quoins(p, x, -0.39, 0.025, 0.505, x < 0 ? -1 : 1, 1);
    for (const y of [0.08, 0.32]) for (const x of [-0.78, -0.62, -0.46, -0.02, 0.14, 0.3]) p.box(0.1, 0.018, 0.024, x, y + 0.135, -0.385, C.cream);
    for (const x of [-0.7, 0.22]) { p.box(0.07, 0.24, 0.07, x, 0.62, -0.72, 0xa85e50); p.box(0.085, 0.025, 0.085, x, 0.86, -0.72, C.cream); smoke(x, 0.9, -0.72, 0); }
    p.box(0.3, 0.6, 0.08, -0.24, 0.025, -0.37, 0xc98a72); p.gable(0.32, 0.14, 0.1, -0.24, 0.625, -0.37, C.slate);
    p.box(0.24, 0.05, 0.012, -0.24, 0.27, -0.325, C.cream); for (let k = 0; k < 5; k++) p.box(0.026, 0.028, 0.006, -0.31 + k * 0.035, 0.282, -0.318, 0x3c3530);
    p.cyl(0.055, 0.055, 0.012, 12, -0.24, 0.5, -0.325, C.white); p.box(0.005, 0.04, 0.004, -0.24, 0.515, -0.318, C.darkwood); p.box(0.03, 0.005, 0.004, -0.228, 0.5, -0.318, C.darkwood);
    p.box(0.12, 0.13, 0.12, -0.24, 0.72, -0.64, C.white); p.pyramid(0.16, 0.14, 0.16, -0.24, 0.85, -0.64, C.roofdark);
    p.box(0.12, 0.2, 0.02, -0.24, 0.025, -0.325, C.door);
    for (const y of [0.08, 0.32]) windows(p, [-0.78, -0.62, -0.46, -0.02, 0.14, 0.3], y, -0.385, 0.08, 0.12);
    // préau
    for (const [x, z] of [[0.5, -0.5], [0.86, -0.5], [0.5, 0.0], [0.86, 0.0]]) p.box(0.03, 0.3, 0.03, x, 0.025, z, C.darkwood);
    p.add(new THREE.BoxGeometry(0.48, 0.025, 0.66), 0.68, 0.34, -0.25, C.slate, 0, false, -0.1);
    for (let k = 0; k < 9; k++) p.add(new THREE.BoxGeometry(0.48, 0.007, 0.02).translate(0, 0.016, -0.3 + k * 0.075), 0.68, 0.34, -0.25, dark(C.slate, k % 2 ? 0.86 : 1.04), 0, false, -0.1);
    p.box(0.3, 0.05, 0.07, 0.68, 0.025, -0.25, C.wood);
    for (const z of [-0.45, -0.05]) { p.box(0.22, 0.02, 0.06, 0.68, 0.07, z, C.wood); for (const d of [-0.09, 0.09]) p.box(0.02, 0.05, 0.05, 0.68 + d, 0.025, z, 0x3c4a44); }
    for (const s of [-1, 1]) { p.cyl(0.007, 0.009, 0.3, 5, s * 0.16, 0.025, 0.86, 0x3c4a44); p.box(0.04, 0.045, 0.04, s * 0.16, 0.32, 0.86, 0xffe2a0, 0, true); }
    // cour : marelle, grille, mât, arbres
    for (let i = 0; i < 4; i++) p.box(0.07, 0.003, 0.07, -0.2, 0.027, 0.0 + i * 0.09, C.white);
    p.cyl(0.008, 0.008, 0.7, 5, -0.82, 0.025, 0.25, C.metal); p.box(0.14, 0.08, 0.005, -0.75, 0.62, 0.25, 0x4f7fc4); p.box(0.05, 0.08, 0.006, -0.77, 0.62, 0.25, C.white);
    for (let x = -0.9; x <= 0.9; x += 0.08) if (Math.abs(x - 0.0) > 0.12) p.box(0.012, 0.1, 0.012, x, 0.025, 0.9, C.white);
    for (const s of [-1, 1]) p.box(0.78, 0.012, 0.012, s * 0.51, 0.1, 0.9, C.white);
    for (const [x, z] of [[0.5, 0.5], [0.3, 0.75], [-0.6, 0.65]]) tree(p, x, z, 1.15, 0x8fbf72);
  } else {
    // université : grand portique à colonnes cannelées sur un perron, fronton sculpté et ses statues, bannières des
    // expositions, coupole de la bibliothèque sur un tambour à colonnade, ailes à pilastres et toits de cuivre, parvis avec
    // bassin à jets, allée bordée de sculptures, de bancs et de réverbères, pelouses, haies et massifs
    const stone = 0xf2eee6, trim = 0xe0dad0, copper = 0x6fa898, glassC = 0x9fd0e4;
    sink(0.04);
    // corps central : soubassement, murs, corniche, frise
    p.box(1.04, 0.06, 0.54, 0, 0.04, -0.62, trim);
    p.box(1.0, 0.5, 0.5, 0, 0.1, -0.62, stone);
    p.box(1.04, 0.035, 0.54, 0, 0.58, -0.62, trim);
    // perron et colonnade : bases, fûts cannelés, chapiteaux, architrave, frise à triglyphes, fronton sculpté
    for (let k = 0; k < 4; k++) p.box(0.9 - k * 0.04, 0.016, 0.1, 0, 0.04 + k * 0.016, -0.18 - k * 0.035, trim);
    for (let i = 0; i < 6; i++) {
      const x = -0.3 + i * 0.12;
      p.box(0.07, 0.02, 0.07, x, 0.1, -0.3, trim);
      p.cyl(0.03, 0.034, 0.42, 10, x, 0.12, -0.3, stone);
      for (let f = 0; f < 4; f++) p.box(0.006, 0.4, 0.004, x + Math.cos(f * 1.57 + 0.4) * 0.031, 0.13, -0.3 + Math.sin(f * 1.57 + 0.4) * 0.031, trim);
      p.box(0.075, 0.025, 0.075, x, 0.54, -0.3, trim);
    }
    p.box(0.8, 0.05, 0.16, 0, 0.565, -0.3, stone);
    for (let i = 0; i < 9; i++) p.box(0.022, 0.034, 0.006, -0.36 + i * 0.09, 0.573, -0.218, i % 2 ? trim : 0xd2cabe);
    p.gable(0.18, 0.16, 0.84, 0, 0.615, -0.3, trim, Math.PI / 2);
    p.gable(0.012, 0.11, 0.7, 0, 0.625, -0.205, 0xd8d0c4, Math.PI / 2);
    for (const [x, h] of [[-0.2, 0.04], [-0.1, 0.06], [0, 0.08], [0.1, 0.06], [0.2, 0.04]] as [number, number][]) p.box(0.04, h, 0.012, x, 0.63, -0.2, 0xc8c0b4);
    for (const sx of [-1, 1]) { p.box(0.04, 0.012, 0.04, sx * 0.41, 0.615, -0.3, trim); p.box(0.025, 0.07, 0.025, sx * 0.41, 0.627, -0.3, 0xb8b4ac); p.sphere(0.014, sx * 0.41, 0.705, -0.3, 0xb8b4ac); }
    p.box(0.03, 0.03, 0.03, 0, 0.775, -0.3, trim); p.box(0.02, 0.07, 0.02, 0, 0.805, -0.3, 0xb8b4ac);
    // portes et fenêtres derrière la colonnade, bannières des expositions
    p.box(0.14, 0.24, 0.02, 0, 0.1, -0.365, C.door); p.gable(0.02, 0.04, 0.16, 0, 0.34, -0.365, trim, Math.PI / 2);
    for (const x of [-0.3, -0.18, 0.18, 0.3]) { p.box(0.07, 0.16, 0.012, x, 0.16, -0.367, glassC, 0, true); p.box(0.08, 0.012, 0.016, x, 0.33, -0.367, trim); }
    for (const [x, c] of [[-0.24, 0xc8382e], [0.24, 0x3c5aa8], [-0.12, 0xe8a83c], [0.12, 0x4f8a5a]] as [number, number][]) {
      p.box(0.06, 0.24, 0.006, x, 0.26, -0.25, c); p.box(0.04, 0.03, 0.007, x, 0.4, -0.25, C.white); p.box(0.05, 0.004, 0.007, x, 0.31, -0.25, C.white);
      p.box(0.07, 0.008, 0.008, x, 0.5, -0.25, 0x8a8f96);
    }
    p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14).rotateX(Math.PI / 2), 0, 0.68, -0.205, C.white);
    p.box(0.004, 0.03, 0.004, 0, 0.685, -0.198, 0x2a2a2a); p.box(0.022, 0.004, 0.004, 0.008, 0.68, -0.198, 0x2a2a2a);
    // coupole : tambour à colonnade, dôme de cuivre à côtes, lanternon et sa flèche dorée
    p.cyl(0.24, 0.24, 0.05, 16, 0, 0.615, -0.66, trim);
    p.cyl(0.2, 0.2, 0.16, 16, 0, 0.665, -0.66, stone);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.cyl(0.014, 0.014, 0.15, 6, Math.cos(a) * 0.225, 0.665, -0.66 + Math.sin(a) * 0.225, stone); }
    for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * Math.PI * 2; p.box(0.03, 0.08, 0.012, Math.cos(a) * 0.202, 0.69, -0.66 + Math.sin(a) * 0.202, glassC, -a + Math.PI / 2, true); }
    p.cyl(0.245, 0.245, 0.03, 16, 0, 0.815, -0.66, trim);
    p.sphere(0.215, 0, 0.84, -0.66, copper, 1, 0.75);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.add(new THREE.TorusGeometry(0.217, 0.006, 3, 10, Math.PI / 2).rotateZ(Math.PI / 2).rotateY(a), 0, 0.84, -0.66, 0xe4e2dc); }
    p.cyl(0.045, 0.045, 0.07, 8, 0, 1.0, -0.66, stone); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.box(0.01, 0.05, 0.004, Math.cos(a) * 0.046, 1.01, -0.66 + Math.sin(a) * 0.046, glassC, -a + Math.PI / 2, true); }
    p.sphere(0.05, 0, 1.07, -0.66, copper, 1, 0.7); p.cone(0.02, 0.1, 5, 0, 1.1, -0.66, C.gold);
    // ailes : soubassement, pilastres, fenêtres encadrées sur deux niveaux, corniche, toit de cuivre en croupe, verrière
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.72;
      p.box(0.4, 0.05, 0.78, x0, 0.04, -0.48, trim);
      p.box(0.38, 0.42, 0.76, x0, 0.09, -0.48, 0xf0ece4);
      p.box(0.4, 0.03, 0.78, x0, 0.5, -0.48, trim);
      p.pyramid(0.4, 0.12, 0.78, x0, 0.53, -0.48, copper, 0);
      p.box(0.16, 0.012, 0.4, x0, 0.6, -0.48, glassC, 0, true);
      for (const x of [x0 - 0.17, x0 - 0.06, x0 + 0.06, x0 + 0.17]) p.box(0.022, 0.4, 0.014, x, 0.09, -0.095, trim);
      for (const y of [0.13, 0.31]) for (const x of [x0 - 0.115, x0, x0 + 0.115]) {
        p.box(0.07, 0.11, 0.012, x, y, -0.097, glassC, 0, true);
        p.box(0.085, 0.014, 0.018, x, y + 0.11, -0.097, trim); p.box(0.08, 0.01, 0.022, x, y - 0.01, -0.097, trim);
      }
      for (const y of [0.13, 0.31]) for (const z of [-0.75, -0.6, -0.45, -0.3, -0.18]) p.box(0.012, 0.11, 0.07, sx * 0.906, y, z, glassC, 0, true);
      for (let k = 0; k < 9; k++) p.box(0.014, 0.04, 0.014, x0 - 0.17 + k * 0.0425, 0.53, -0.1, C.white);
      p.box(0.38, 0.012, 0.02, x0, 0.57, -0.1, C.white);
      p.box(0.1, 0.2, 0.014, x0, 0.09, -0.098, C.door); p.gable(0.016, 0.04, 0.12, x0, 0.29, -0.098, trim, Math.PI / 2);
    }
    // parvis : pelouses, allée dallée, bassin à jets, sculptures sur socles, bancs, réverbères, haies, massifs, drapeaux, vélos
    for (const sx of [-1, 1]) p.box(0.58, 0.012, 0.74, sx * 0.4, 0.04, 0.5, C.green);
    p.box(0.22, 0.014, 0.8, 0, 0.043, 0.48, 0xd8d0c0);
    for (let k = 0; k < 8; k++) p.box(0.22, 0.003, 0.006, 0, 0.057, 0.12 + k * 0.1, 0xc8c0b0);
    p.cyl(0.13, 0.14, 0.05, 12, 0, 0.04, 0.5, trim); p.cyl(0.115, 0.115, 0.006, 12, 0, 0.085, 0.5, 0x6fb8d0);
    p.cyl(0.02, 0.03, 0.1, 8, 0, 0.08, 0.5, trim); p.cyl(0.005, 0.008, 0.08, 5, 0, 0.18, 0.5, 0xcdeef7); p.sphere(0.018, 0, 0.27, 0.5, 0xe4f6ff, 1);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.003, 0.006, 0.09, 4).translate(0, 0.045, 0).rotateZ(0.6).rotateY(-a), Math.cos(a) * 0.11, 0.09, 0.5 + Math.sin(a) * 0.11, 0xcdeef7); }
    for (const [x, z, kind] of [[-0.16, 0.22, 0], [0.16, 0.22, 1], [-0.16, 0.8, 1], [0.16, 0.8, 0]] as [number, number, number][]) {
      p.box(0.06, 0.08, 0.06, x, 0.04, z, trim);
      if (kind) { p.sphere(0.03, x, 0.15, z, 0xb8b4ac, 1, 1.2); p.box(0.02, 0.03, 0.02, x, 0.12, z, 0xb8b4ac); }
      else { p.add(new THREE.TorusKnotGeometry(0.022, 0.007, 24, 4), x, 0.16, z, 0x9aa3ad); }
    }
    for (const z of [0.35, 0.65]) for (const sx of [-1, 1]) { p.box(0.05, 0.014, 0.12, sx * 0.15, 0.06, z, C.wood); for (const d of [-0.04, 0.04]) p.box(0.04, 0.02, 0.012, sx * 0.15, 0.044, z + d, 0x5d6878); }
    for (const z of [0.15, 0.5, 0.85]) for (const sx of [-1, 1]) { p.cyl(0.006, 0.008, 0.24, 5, sx * 0.125, 0.04, z, 0x3c4a44); p.box(0.03, 0.035, 0.03, sx * 0.125, 0.28, z, 0xffe2a0, 0, true); }
    for (const sx of [-1, 1]) {
      hedge(p, sx * 0.62, 0.86, 0.6, 0.05, 0.06, 0.04); hedge(p, sx * 0.9, 0.5, 0.05, 0.7, 0.06, 0.04);
      for (let k = 0; k < 6; k++) p.sphere(0.028, sx * 0.3, 0.06, 0.18 + k * 0.12, [C.pink, C.butter, 0xd84a3e, C.lav, C.white, 0xe8a83c][k], 0, 0.8);
      for (const [x, z] of [[0.5, 0.32], [0.5, 0.68], [0.75, 0.5]]) tree(p, sx * x, z, x > 0.6 ? 0.9 : 1.05);
    }
    for (const [x, c] of [[-0.06, 0x3c4a8a], [0.06, 0xd8a83c]] as [number, number][]) { p.cyl(0.005, 0.005, 0.55, 4, x, 0.04, 0.9, 0xd8dde2); p.box(0.07, 0.045, 0.004, x + 0.035, 0.53, 0.9, c); }
    for (let k = 0; k < 4; k++) { const x = 0.62 + k * 0.07; for (const d of [-0.03, 0.03]) p.add(new THREE.TorusGeometry(0.025, 0.005, 4, 10).rotateY(Math.PI / 2), x, 0.07, 0.06 + d, 0x3c3c40); p.box(0.005, 0.005, 0.06, x, 0.08, 0.06, [0xd8553c, 0x3c7fd8, 0x4fa860, 0xe8c66a][k]); }
  }
}

/** Secours (2 × 2) : guetteurs, poste des vigiles, tour de guet et son hangar, caserne de pompiers, centre de secours */
function firehouse(p: Parts, age: number, v: number) {
  if (age === 0) {
    // haute plateforme de guet, hutte, bûcher du signal sur son cercle de pierres, outres d'eau, fosses de sable, tambour
    p.cyl(0.86, 0.88, 0.012, 14, 0, 0, 0, dark(C.dirt, 0.9));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pole(p, 0.022, 1.0, -0.42 + x * 0.14, -0.42 + z * 0.14, C.wood, z * 0.06, -x * 0.06);
    p.box(0.42, 0.03, 0.42, -0.42, 0.96, -0.42, C.wood);
    for (const [x, z, w, d] of [[0, 0.2, 0.42, 0.02], [0, -0.2, 0.42, 0.02], [0.2, 0, 0.02, 0.42], [-0.2, 0, 0.02, 0.42]]) p.box(w, 0.09, d, -0.42 + x, 0.99, -0.42 + z, C.darkwood);
    for (let y = 0.08; y < 0.94; y += 0.1) p.box(0.13, 0.012, 0.012, -0.42, y, -0.12, C.wood);
    for (const x of [-0.065, 0.065]) pole(p, 0.008, 0.98, -0.42 + x, -0.15, C.wood, 0.08, 0);
    p.add(new THREE.ConeGeometry(0.035, 0.14, 6).rotateZ(-Math.PI / 2), -0.28, 1.1, -0.3, 0xe8dcc0);
    p.cone(0.3, 0.52, 6, 0.5, 0, -0.5, C.hide); p.add(new THREE.ConeGeometry(0.09, 0.22, 3), 0.5, 0.11, -0.24, C.darkwood);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; p.sphere(0.04, 0.42 + Math.cos(a) * 0.16, 0.01, 0.32 + Math.sin(a) * 0.16, C.darkstone, 0, 0.7); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; pole(p, 0.018, 0.34, 0.42 + Math.cos(a) * 0.08, 0.32 + Math.sin(a) * 0.08, C.wood, -Math.sin(a) * 0.35, Math.cos(a) * 0.35); }
    for (const [x, z] of [[-0.62, 0.42], [-0.5, 0.52], [-0.66, 0.6]]) p.sphere(0.06, x, 0.05, z, C.hide, 0, 1.1);
    for (const x of [-0.25, 0.0]) p.cone(0.11, 0.08, 7, x, 0, 0.66, 0xd8c69a);
    p.cyl(0.07, 0.06, 0.1, 8, 0.1, 0, 0.32, 0x9a6a44); p.cyl(0.071, 0.071, 0.008, 8, 0.1, 0.1, 0.32, C.hide);
  } else if (age === 1) {
    // poste des vigiles : tour de guet de pierre au toit de tuiles, caserne tuilée, grande citerne, amphores d'eau,
    // râtelier de seaux, échelle, tonneaux
    sink(0.025);
    for (let i = 0; i < 9; i++) p.box(0.2, 0.004, 0.2, -0.7 + (i % 3) * 0.24, 0.025, 0.1 + Math.floor(i / 3) * 0.24, (i % 2) ? 0xd0c2a6 : 0xcabd9f);
    if (!attach(['a_tower'], 0, 0.66, -0.5, -0.46, Math.PI)) {
      p.cyl(0.24, 0.27, 0.92, 9, -0.5, 0.025, -0.46, C.stone);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; p.box(0.08, 0.08, 0.06, -0.5 + Math.cos(a) * 0.24, 0.94, -0.46 + Math.sin(a) * 0.24, C.stone, -a); }
      p.cone(0.3, 0.26, 9, -0.5, 1.0, -0.46, C.terracotta);
    }
    // échelle appuyée à la tour
    for (const x of [-0.07, 0.07]) p.box(0.016, 0.62, 0.016, -0.18 + x, 0.025, -0.2, C.wood, 0, false, 0);
    for (let k = 0; k < 7; k++) p.box(0.15, 0.012, 0.012, -0.18, 0.08 + k * 0.08, -0.2, C.wood);
    // caserne
    p.box(0.74, 0.32, 0.4, 0.42, 0.025, -0.58, C.cream);
    p.box(0.76, 0.04, 0.42, 0.42, 0.025, -0.58, 0xd9cdb8);
    roof(p, 0.42, 0.345, -0.58, { w: 0.74, d: 0.4, h: 0.2, color: C.terracotta, wall: C.cream, tiles: true });
    p.box(0.1, 0.17, 0.02, 0.42, 0.025, -0.375, C.door); windows(p, [0.2, 0.64], 0.15, -0.375, 0.07, 0.08);
    // citerne : margelle épaisse, eau, bec de bronze
    p.cyl(0.3, 0.32, 0.16, 14, 0.4, 0.025, 0.32, C.stone);
    p.add(new THREE.TorusGeometry(0.29, 0.03, 4, 18).rotateX(Math.PI / 2), 0.4, 0.19, 0.32, 0xe6dccb);
    p.cyl(0.27, 0.27, 0.012, 14, 0.4, 0.184, 0.32, C.water);
    p.box(0.04, 0.04, 0.12, 0.4, 0.14, 0.66, 0xb08a4a);
    // amphores d'eau
    for (const [x, z, r] of [[-0.72, 0.22, 0], [-0.6, 0.34, 1], [-0.76, 0.44, 2], [-0.62, 0.56, 3]] as number[][])
      if (!attach(['a_amphora'], 0, 0.08, x, z, r)) { p.cyl(0.055, 0.035, 0.16, 8, x, 0.025, z, C.terracotta); p.cyl(0.03, 0.03, 0.005, 8, x, 0.185, z, C.water); }
    // râtelier de seaux
    p.box(0.42, 0.02, 0.03, -0.12, 0.28, 0.7, C.wood); for (const x of [-0.32, 0.08]) p.box(0.02, 0.28, 0.02, x, 0.025, 0.7, C.wood);
    for (let i = 0; i < 4; i++) if (!attach(['p_bucket'], 0, 0.07, -0.26 + i * 0.09, 0.71)) p.cyl(0.028, 0.022, 0.06, 6, -0.26 + i * 0.09, 0.2, 0.72, 0x9a6a44);
    for (const [x, z] of [[0.86, -0.2], [0.78, -0.12]]) attach(['f_barrel'], 0, 0.1, x, z);
  } else if (age === 2) {
    // tour de guet de pierre, hangar à seaux et tonneaux, charrette à eau, échelle, tas de sable
    sink(0.025);
    {
      p.box(0.46, 1.0, 0.46, -0.44, 0.025, -0.42, C.stone); p.box(0.54, 0.05, 0.54, -0.44, 1.02, -0.42, C.wood); p.pyramid(0.58, 0.36, 0.58, -0.44, 1.07, -0.42, C.slate);
    }
    for (const [x, z] of [[0.18, -0.86], [0.86, -0.86], [0.18, -0.28], [0.86, -0.28]]) p.box(0.035, z < -0.5 ? 0.42 : 0.34, 0.035, x, 0.025, z, C.darkwood);
    p.box(0.72, 0.38, 0.03, 0.52, 0.025, -0.87, C.wood);
    p.add(new THREE.BoxGeometry(0.82, 0.03, 0.7), 0.52, 0.42, -0.57, 0x8a5a44, 0, false, 0, -0.12);
    for (const [x, z] of [[0.3, -0.7], [0.45, -0.72], [0.6, -0.68]]) { p.cyl(0.055, 0.05, 0.13, 8, x, 0.025, z, 0x9a6a44); p.cyl(0.056, 0.056, 0.01, 8, x, 0.07, z, 0x6f5640); }
    for (let i = 0; i < 5; i++) p.cyl(0.03, 0.024, 0.06, 6, 0.32 + i * 0.1, 0.22, -0.84, 0x9a6a44);
    // charrette à eau : tonneau couché sur deux roues, timon
    p.add(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 10).rotateZ(Math.PI / 2), 0.42, 0.17, 0.42, 0x9a6a44);
    p.box(0.3, 0.03, 0.2, 0.42, 0.07, 0.42, C.wood);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10).rotateZ(Math.PI / 2), 0.42 + s * 0.17, 0.08, 0.42, C.darkwood);
    p.box(0.02, 0.02, 0.3, 0.42, 0.08, 0.66, C.wood);
    p.add(new THREE.BoxGeometry(0.1, 0.6, 0.02), 0.08, 0.3, -0.12, C.wood, 0, false, 0, -0.35);
    p.cone(0.14, 0.1, 8, -0.4, 0.025, 0.5, 0xd8c69a);
    // la cour pavée, la citerne de pierre, le râtelier des crocs et des échelles, la cloche d'alarme, les guetteurs
    cobbles(p, -0.86, 0.1, 0.86, 0.86, 0xc8bba2, 0.025, 61);
    verge(p, 30, 62, 0.03, (x, z) => z > 0.06 || x > 0.9);
    p.box(0.22, 0.09, 0.15, -0.7, 0.025, 0.74, C.stone); p.box(0.18, 0.006, 0.11, -0.7, 0.112, 0.74, C.water);
    for (let k = 0; k < 4; k++) { p.add(new THREE.CylinderGeometry(0.005, 0.005, 0.5, 4), 0.06 + k * 0.035, 0.27, 0.12, C.wood, 0, false, 0.12); p.box(0.012, 0.04, 0.012, 0.09 + k * 0.035, 0.5, 0.12, C.metal); }
    p.box(0.02, 0.36, 0.02, 0.76, 0.025, 0.02, C.darkwood); p.box(0.14, 0.02, 0.02, 0.72, 0.38, 0.02, C.darkwood); sway([0.68, 0.37, 0.02], [0, 0, 1], 0.35, 0.6).cone(0.04, 0.06, 8, 0, -0.07, 0, C.gold);
    figure(p, -0.1, 0.62, 0x8a3a2a, 0.4); figure(p, 0.1, 0.3, 0x3a5a9a, -2.6);
  } else if (age === 3) {
    // caserne de brique : trois grandes portes rouges, tour de séchage des tuyaux et sa cloche, pompes à vapeur attelées
    sink(0.025);
    p.box(1.3, 0.56, 0.64, -0.22, 0.025, -0.52, C.brick); p.box(1.32, 0.04, 0.66, -0.22, 0.58, -0.52, C.cream);
    roof(p, -0.22, 0.62, -0.52, { w: 1.3, d: 0.64, h: 0.2, color: C.slate, wall: C.brick, courses: true });
    stones(p, -0.22, -0.199, 1.3, 0.025, 0.585, 0, dark(C.brick, 0.86), 0.45, 360);
    stones(p, -0.87, -0.52, 0.64, 0.025, 0.585, -Math.PI / 2, dark(C.brick, 0.86), 0.45, 361);
    for (const x of [-0.87, 0.43]) quoins(p, x, -0.2, 0.025, 0.585, x < 0 ? -1 : 1, 1);
    p.box(0.07, 0.2, 0.07, -0.66, 0.7, -0.66, 0xa85e50); p.box(0.085, 0.025, 0.085, -0.66, 0.9, -0.66, C.cream); smoke(-0.66, 0.94, -0.66, 0);
    // enseigne « POMPIERS », lanterne rouge, seaux accrochés au mur, dévidoir de tuyau
    for (let k = 0; k < 8; k++) p.box(0.028, 0.03, 0.006, -0.36 + k * 0.04, 0.535, -0.183, 0xb8342c);
    p.box(0.012, 0.012, 0.05, 0.38, 0.4, -0.18, 0x3c3c40); p.box(0.04, 0.05, 0.04, 0.38, 0.34, -0.16, 0xff5a3a, 0, true);
    for (let k = 0; k < 4; k++) { p.cyl(0.018, 0.014, 0.035, 7, -0.86 + k * 0.05, 0.2, -0.18, 0xd84a3e); p.box(0.004, 0.01, 0.004, -0.86 + k * 0.05, 0.24, -0.185, 0x3c3c40); }
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateZ(Math.PI / 2), 0.62, 0.09, 0.05, 0xb8342c); p.add(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 10).rotateZ(Math.PI / 2), 0.62, 0.09, 0.05, 0xd8d0c0);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8).rotateZ(Math.PI / 2), 0.62 + s * 0.05, 0.05, 0.05, C.darkwood);
    for (const x of [-0.64, -0.22, 0.2]) {
      p.box(0.3, 0.32, 0.02, x, 0.025, -0.195, 0xb8342c); p.box(0.006, 0.32, 0.022, x, 0.025, -0.194, 0x7a2420);
      p.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), x, 0.345, -0.195, 0xb8342c);
      windows(p, [x], 0.44, -0.195, 0.14, 0.06);
    }
    p.box(0.6, 0.06, 0.012, -0.22, 0.52, -0.19, C.cream);
    p.box(0.28, 1.24, 0.28, 0.68, 0.025, -0.62, C.darkbrick); p.box(0.32, 0.05, 0.32, 0.68, 1.27, -0.62, C.cream); p.pyramid(0.32, 0.16, 0.32, 0.68, 1.32, -0.62, C.slate);
    // tour de séchage : briques, cordons, tuyaux pendus à sécher sur le côté
    stones(p, 0.68, -0.479, 0.28, 0.025, 1.27, 0, dark(C.darkbrick, 0.86), 0.45, 362);
    stones(p, 0.821, -0.62, 0.28, 0.025, 1.27, Math.PI / 2, dark(C.darkbrick, 0.86), 0.45, 363);
    for (const y of [0.45, 0.8]) p.box(0.3, 0.025, 0.3, 0.68, y, -0.62, C.cream);
    p.box(0.012, 0.012, 0.22, 0.83, 1.15, -0.62, 0x3c3c40);
    for (const z of [-0.69, -0.62, -0.55]) p.box(0.012, 0.5, 0.025, 0.835, 0.64, z, 0xe8e0d0);
    windows(p, [0.68], 0.9, -0.475, 0.06, 0.16); p.add(new THREE.CylinderGeometry(0.045, 0.065, 0.06, 8), 0.68, 1.12, -0.46, C.gold);
    for (const x of [-0.5, 0.15]) {
      p.box(0.24, 0.1, 0.14, x, 0.06, 0.4, 0xb8342c); p.cyl(0.045, 0.045, 0.14, 8, x + 0.05, 0.16, 0.4, C.gold); p.cyl(0.012, 0.012, 0.1, 5, x + 0.05, 0.3, 0.4, 0x3c3c40);
      for (const d of [-0.08, 0.08]) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10).rotateX(Math.PI / 2), x + d, 0.06, 0.4, C.darkwood);
      p.box(0.02, 0.02, 0.26, x, 0.07, 0.6, C.wood);
    }
    p.cyl(0.03, 0.035, 0.1, 6, 0.75, 0.025, 0.3, 0xd84a3e); p.sphere(0.03, 0.75, 0.13, 0.3, 0xd84a3e);
  } else {
    // centre de secours : quatre portes rouges, bandeau rouge, tour d'entraînement, deux camions à échelle, marquages au sol
    sink(0.03);
    p.box(1.46, 0.56, 0.62, -0.18, 0.03, -0.54, C.white); p.box(1.48, 0.07, 0.64, -0.18, 0.44, -0.54, 0xd84a3e);
    p.box(1.5, 0.03, 0.66, -0.18, 0.59, -0.54, 0xe4e2dc);
    for (const x of [-0.72, -0.36, 0.0, 0.36]) { p.box(0.28, 0.34, 0.02, x, 0.03, -0.225, 0xc8382e); for (let y = 0.1; y < 0.36; y += 0.08) p.box(0.28, 0.006, 0.022, x, y, -0.224, 0xa82e26); }
    windows(p, [-0.72, -0.36, 0.0, 0.36], 0.5, -0.225, 0.2, 0.05);
    p.box(0.32, 1.3, 0.32, 0.72, 0.03, -0.62, 0xbfc4ca);
    for (let y = 0.25; y < 1.25; y += 0.24) p.box(0.14, 0.1, 0.02, 0.72, y, -0.455, 0x9fd0e4, 0, true);
    p.box(0.36, 0.04, 0.36, 0.72, 1.33, -0.62, 0xd84a3e);
    p.cyl(0.006, 0.006, 0.36, 4, -0.7, 0.62, -0.7, C.metal);
    for (const x of [-0.72, -0.36, 0.0, 0.36]) for (let z = 0.0; z < 0.5; z += 0.12) p.box(0.26, 0.004, 0.05, x, 0.032, z, (z / 0.12) % 2 < 1 ? 0xd84a3e : C.white);
    for (const x of [-0.54, 0.18]) {
      p.box(0.18, 0.13, 0.36, x, 0.045, 0.46, 0xd84a3e); p.box(0.18, 0.12, 0.12, x, 0.045, 0.7, 0xd84a3e);
      p.box(0.17, 0.05, 0.02, x, 0.12, 0.765, 0x9fd0e4);
      p.add(new THREE.BoxGeometry(0.06, 0.03, 0.42), x, 0.2, 0.44, C.metal, 0, false, 0, 0.12);
      for (let z = 0.28; z < 0.62; z += 0.06) p.box(0.07, 0.008, 0.008, x, 0.2 + (0.62 - z) * 0.12, z, C.metal);
      for (const z of [0.36, 0.56, 0.7]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).rotateZ(Math.PI / 2), x, 0.04, z, 0x3c3c40);
      p.box(0.03, 0.025, 0.03, x - 0.04, 0.18, 0.72, 0x6aa8ff, 0, true); p.box(0.03, 0.025, 0.03, x + 0.04, 0.18, 0.72, 0xff6a5a, 0, true);
    }
    // tour d'entraînement : fenêtres sur les côtés, balcons à garde-corps, tuyaux qui sèchent, sirène et antenne
    for (let y = 0.25; y < 1.25; y += 0.24) {
      for (const sx of [-1, 1]) p.box(0.02, 0.1, 0.14, 0.72 + sx * 0.161, y, -0.62, 0x9fd0e4, 0, true);
      p.box(0.3, 0.012, 0.1, 0.72, y - 0.04, -0.405, 0x8a96a2);
      for (let k = 0; k < 5; k++) p.box(0.008, 0.06, 0.008, 0.6 + k * 0.06, y - 0.03, -0.36, 0x8a96a2);
      p.box(0.3, 0.008, 0.008, 0.72, y + 0.03, -0.36, 0x8a96a2);
    }
    for (let k = 0; k < 3; k++) p.box(0.02, 0.36, 0.02, 0.64 + k * 0.08, 0.96, -0.79, [0xf2f2f2, 0xd84a3e, 0xf2f2f2][k]);
    p.cyl(0.03, 0.035, 0.05, 8, 0.66, 1.37, -0.68, 0x9aa3ad); p.cone(0.04, 0.04, 8, 0.66, 1.42, -0.68, 0xd84a3e);
    p.cyl(0.005, 0.005, 0.3, 4, 0.8, 1.37, -0.56, 0x9aa3ad);
    // toit : mât radio et parabole, panneaux solaires, groupes de ventilation
    p.cyl(0.008, 0.012, 0.42, 5, -0.7, 0.62, -0.7, 0x9aa3ad);
    p.add(new THREE.SphereGeometry(0.06, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-1.0), -0.55, 0.66, -0.68, C.white);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.2, 0.012, 0.14), -0.32 + k * 0.22, 0.65, -0.6, 0x2e3c5a, 0, false, 0, -0.35);
    for (const x of [-0.25, 0.15]) p.box(0.12, 0.06, 0.1, x, 0.62, -0.38, 0xb8bcc2);
    // emblème au-dessus des portes, numéros, bureau vitré à côté
    p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 16).rotateX(Math.PI / 2), -0.18, 0.475, -0.218, C.white); p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.016, 16).rotateX(Math.PI / 2), -0.18, 0.475, -0.212, 0xd84a3e);
    p.add(new THREE.ConeGeometry(0.03, 0.06, 5).rotateX(Math.PI / 2), -0.18, 0.475, -0.2, 0xffd84a);
    for (const x of [-0.72, -0.36, 0.0, 0.36]) p.box(0.05, 0.04, 0.004, x, 0.34, -0.223, C.white);
    // borne d'incendie, cônes, banc, mât et drapeau, voiture de commandement, haie
    p.cyl(0.02, 0.025, 0.08, 8, 0.86, 0.03, 0.2, 0xd84a3e); p.sphere(0.022, 0.86, 0.11, 0.2, 0xd84a3e, 1, 0.7);
    for (const [x, z] of [[-0.86, 0.1], [-0.86, 0.3], [-0.86, 0.5]]) { p.cone(0.025, 0.06, 6, x, 0.03, z, 0xf28a3c); p.cyl(0.02, 0.02, 0.008, 6, x, 0.05, z, C.white); }
    p.box(0.16, 0.02, 0.05, 0.62, 0.07, 0.86, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, 0.62 + d, 0.03, 0.86, 0x5d6878);
    p.cyl(0.005, 0.005, 0.55, 4, 0.9, 0.03, -0.1, 0xd8dde2); { const f = sway([0.9, 0, -0.1], [0, 1, 0], 0.4, 1.2); f.box(0.08, 0.05, 0.004, 0.04, 0.53, 0, 0xd84a3e); f.box(0.08, 0.016, 0.005, 0.04, 0.547, 0, C.white); }
    p.box(0.15, 0.08, 0.26, 0.72, 0.03, 0.35, 0xd84a3e); p.box(0.14, 0.06, 0.14, 0.72, 0.11, 0.33, 0x9fd0e4); p.box(0.1, 0.02, 0.04, 0.72, 0.17, 0.33, 0x6aa8ff, 0, true);
    for (const z of [0.26, 0.44]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8).rotateZ(Math.PI / 2), 0.72, 0.035, z, 0x3c3c40);
    hedge(p, 0.0, 0.9, 1.1, 0.05, 0.05, 0.03);
  }
}

/** Pièce qui tourne du modèle en cours (roues d'un chevalement, coupole, abeilles) : ses pièces, posées autour de son moyeu */
interface Spin { p: Parts; pivot: [number, number, number]; axis: [number, number, number]; speed: number }
let spinOut: Spin | null = null;
function spinner(pivot: [number, number, number], axis: [number, number, number], speed: number) {
  spinOut = { p: new Parts(), pivot, axis, speed };
  return spinOut.p;
}
/** Tête du modèle en cours qui se tourne face au vent autour de l'axe vertical (x, z), le rotor `face` (cap) en avant */
let vaneOut: { p: Parts; pivot: [number, number]; face: number } | null = null;
function vane(x: number, z: number, face: number) {
  vaneOut = { p: new Parts(), pivot: [x, z], face };
  return vaneOut.p;
}

/** Abeilles qui tournent autour des ruches, centrées en (x, y, z) */
function bees(x: number, y: number, z: number, n = 12) {
  const b = spinner([x, y, z], [0, 1, 0], 1.3);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39, r = 0.1 + (i % 4) * 0.06, h = Math.sin(i * 1.7) * 0.07;
    b.sphere(0.013, Math.cos(a) * r, h, Math.sin(a) * r, 0xf0c040);
    b.box(0.006, 0.014, 0.014, Math.cos(a) * r, h - 0.007, Math.sin(a) * r, 0x3c3028);
  }
}

/** Clôture de paddock : piquets et lisses entre deux points */
function rails(p: Parts, x0: number, z0: number, x1: number, z1: number, color: number, n = 2) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), k = Math.max(1, Math.round(len / 0.22));
  for (let i = 0; i <= k; i++) p.box(0.026, 0.16, 0.026, x0 + ((x1 - x0) * i) / k, 0, z0 + ((z1 - z0) * i) / k, color);
  for (let j = 0; j < n; j++) p.box(len, 0.018, 0.014, (x0 + x1) / 2, 0.06 + j * (0.08 / Math.max(1, n - 1)), (z0 + z1) / 2, color, ry);
}

/**
 * Écurie (2 × 2) : la longue bâtisse des stalles au fond, et devant le paddock où vivent les chevaux ramenés (voir PenView) :
 * auge, râtelier, selle sur la lisse, obstacles au centre équestre
 */
function stable(p: Parts, age: number) {
  const R = 0.88, grass = 0x8cbf6c, sand = age >= 4 ? 0xe8d6ad : dark(C.dirt, 0.96);
  p.box(1.84, 0.012, 1.84, 0, 0, 0, grass);
  p.box(1.7, 0.006, 1.1, 0, 0.012, 0.32, sand);
  for (let i = 0; i < 10; i++) {
    const r = 0.04 + hash2(i, 1, 71) * 0.06;
    p.cyl(r, r + 0.01, 0.003, 7, -0.72 + hash2(i, 2, 71) * 1.44, 0.018, -0.12 + hash2(i, 3, 71) * 0.86, dark(sand, 0.88 + hash2(i, 4, 71) * 0.16));
  }
  for (let i = 0; i < 22; i++) p.cone(0.016, 0.06, 4, -0.86 + i * 0.082, 0.012, -0.86 + (i % 3) * 0.02, dark(grass, 0.78));
  // paddock : lisses de bois, blanches au haras ; portail entrouvert
  const post = age >= 3 ? C.white : C.wood, nr = age === 1 ? 2 : 3;
  rails(p, -R, -0.26, -R, R, post, nr); rails(p, R, -0.26, R, R, post, nr);
  rails(p, -R, R, -0.24, R, post, nr); rails(p, 0.24, R, R, R, post, nr);
  for (const s of [-1, 1]) p.box(0.04, 0.24, 0.04, s * 0.24, 0, R, age >= 3 ? C.white : C.darkwood);
  // le battant, ouvert vers l'intérieur autour de son gond
  const ga = 1.2, gl = 0.44, gc = Math.cos(ga), gs = Math.sin(ga);
  for (const y of [0.06, 0.14]) p.box(gl, 0.018, 0.014, 0.24 - (gl / 2) * gc, y, R - (gl / 2) * gs, post, -ga);
  for (const t of [0.02, gl - 0.02]) p.box(0.02, 0.12, 0.02, 0.24 - t * gc, 0.04, R - t * gs, post);
  p.add(new THREE.BoxGeometry(Math.hypot(gl, 0.08) * 0.95, 0.014, 0.012), 0.24 - (gl / 2) * gc, 0.1, R - (gl / 2) * gs, post, -ga, false, 0.18);
  // la bâtisse : soubassement, murs selon l'âge, portes de stalles, toit
  const H = [0, 0.34, 0.42, 0.4, 0.38][age], bz = -0.56, W = 1.5, D = 0.5, zf = bz + D / 2;
  const wall = age === 1 ? C.wood : age === 2 ? C.cream : age === 3 ? C.brick : 0xc9a27a;
  const roofC = age === 1 ? C.thatch : age === 2 ? 0x8a5a44 : age === 3 ? C.slate : 0x5d6878;
  p.box(W + 0.04, 0.05, D + 0.04, 0, 0, bz, age >= 3 ? C.darkstone : C.stone);
  p.box(W, H - 0.05, D, 0, 0.05, bz, wall);
  if (age === 1 || age === 4) {
    // planches à couvre-joints
    for (let u = -W / 2 + 0.03; u < W / 2; u += 0.05) for (const s of [-1, 1]) p.box(0.012, H - 0.05, 0.008, u, 0.05, bz + s * (D / 2 + 0.003), dark(wall, 0.84));
  } else if (age === 2) {
    stones(p, 0, zf, W, 0.05, 0.27, 0, C.stone, 0.75, 81);
    p.box(W + 0.02, 0.02, D + 0.02, 0, 0.26, bz, C.darkwood);
    timbers(p, 0, zf + 0.002, W, 0.27, H, 0, 10, (i) => i % 3 !== 1);
    for (const s of [-1, 1]) timbers(p, s * (W / 2 + 0.002), bz, D, 0.27, H, s * Math.PI / 2, 3);
  } else {
    stones(p, 0, zf, W, 0.05, H, 0, dark(C.brick, 0.9), 0.4, 82);
    for (const s of [-1, 1]) quoins(p, s * W / 2, zf, 0.05, H, s, 1);
    p.box(W + 0.03, 0.025, D + 0.03, 0, H - 0.03, bz, C.white);
  }
  roof(p, 0, H, bz, { w: W, d: D, h: 0.26, color: roofC, wall, len: W + 0.12, ov: 0.08, courses: true });
  const door = age === 3 ? 0x3f7a5a : age === 4 ? 0x5a6470 : C.darkwood, frame = age >= 3 ? C.white : dark(C.wood, 0.75);
  for (const x of [-0.6, -0.3, 0.3, 0.6]) {
    // porte de stalle en deux : le bas fermé en croix, le haut ouvert sur la pénombre, une barre de fer
    p.box(0.19, 0.23, 0.012, x, 0.04, zf + 0.002, frame);
    p.box(0.16, 0.2, 0.012, x, 0.05, zf + 0.005, 0x2e2620);
    p.box(0.16, 0.1, 0.014, x, 0.05, zf + 0.009, door);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.17, 0.01, 0.006), x, 0.1, zf + 0.017, frame, 0, false, s * 0.55);
    for (const d of [-0.04, 0, 0.04]) p.box(0.006, 0.09, 0.006, x + d, 0.155, zf + 0.008, C.metal);
  }
  // porte de l'allée, fer à cheval, lanternes
  p.box(0.24, 0.29, 0.012, 0, 0.04, zf + 0.002, frame);
  p.box(0.21, 0.26, 0.016, 0, 0.05, zf + 0.006, door);
  p.box(0.006, 0.26, 0.02, 0, 0.05, zf + 0.008, frame);
  p.add(new THREE.TorusGeometry(0.026, 0.007, 4, 10, Math.PI * 1.5).rotateZ(Math.PI * 0.75), 0, 0.31, zf + 0.012, C.gold);
  for (const s of [-1, 1]) { p.box(0.012, 0.012, 0.04, s * 0.15, 0.27, zf + 0.02, C.darkwood); p.box(0.03, 0.04, 0.03, s * 0.15, 0.22, zf + 0.035, C.flame, 0, true); }
  if (age === 1) p.box(W + 0.14, 0.035, 0.07, 0, H + 0.26, bz, dark(C.thatch, 0.82));
  if (age >= 2 && age <= 3) {
    // lanternon d'aération sur le faîte, horloge au haras, girouette
    p.box(0.13, 0.12, 0.13, 0, H + 0.24, bz, age === 3 ? C.white : C.wood);
    for (const s of [-1, 1]) p.box(0.006, 0.08, 0.1, s * 0.068, H + 0.26, bz, 0x3c3530);
    p.pyramid(0.19, 0.11, 0.19, 0, H + 0.36, bz, roofC);
    if (age === 3) { p.cyl(0.04, 0.04, 0.01, 12, 0, H + 0.3, bz + 0.07, C.white); p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12).rotateX(Math.PI / 2), 0, H + 0.3, bz + 0.07, C.white); p.box(0.004, 0.025, 0.004, 0, H + 0.3, bz + 0.078, 0x3c3530); }
    p.box(0.008, 0.1, 0.008, 0, H + 0.47, bz, C.darkwood); p.box(0.09, 0.03, 0.006, 0, H + 0.53, bz, 0x3c3530);
  }
  if (age === 4) {
    // panneaux solaires sur le pan avant, bandeau de fenêtres hautes
    const a = Math.atan2(0.26, D / 2);
    for (const x of [-0.5, -0.25, 0.25, 0.5]) p.add(new THREE.BoxGeometry(0.2, 0.012, 0.16), x, H + 0.155, bz + 0.12, 0x2c3e66, 0, false, 0, a);
    windows(p, [-0.45, -0.15, 0.15, 0.45], 0.27, zf + 0.01, 0.09, 0.05, C.white);
  }
  // auge, râtelier à foin contre la lisse, selle sur la barrière, montoir, bottes
  const trough = age === 1 ? C.darkwood : age === 2 ? C.stone : C.metal;
  p.box(0.34, 0.07, 0.11, 0.6, 0.012, 0.66, trough); p.box(0.3, 0.01, 0.08, 0.6, 0.075, 0.66, C.water);
  for (const z of [0.14, 0.44]) p.box(0.022, 0.22, 0.022, -0.8, 0.012, z, C.darkwood);
  p.box(0.06, 0.02, 0.32, -0.8, 0.2, 0.29, C.darkwood);
  for (let i = 0; i < 6; i++) p.box(0.012, 0.13, 0.012, -0.78, 0.08, 0.16 + i * 0.05, C.wood, 0, false, -0.3);
  p.box(0.07, 0.1, 0.26, -0.79, 0.1, 0.29, C.gold);
  p.box(0.09, 0.035, 0.07, -0.55, 0.15, R, 0x7a4a2e); p.box(0.07, 0.012, 0.08, -0.55, 0.185, R, 0x5e3a24);
  for (const s of [-1, 1]) p.box(0.008, 0.06, 0.008, -0.55 + s * 0.035, 0.09, R + 0.03, C.metal);
  if (age >= 2) { p.box(0.1, 0.05, 0.1, 0.26, 0.012, zf + 0.09, C.stone); p.box(0.1, 0.05, 0.05, 0.26, 0.06, zf + 0.065, C.stone); }
  bale(p, -0.62, -0.2, 0.2); bale(p, 0.72, -0.2, 1.5);
  if (age === 4) {
    // obstacles du manège : chandeliers blancs, barres rayées, bacs de fleurs
    for (const [x, z, ry] of [[-0.42, 0.44, 0], [0.22, 0.1, 0.6]] as number[][]) {
      for (const s of [-1, 1]) p.box(0.03, 0.16, 0.03, x + Math.cos(ry) * s * 0.15, 0.012, z - Math.sin(ry) * s * 0.15, C.white, ry);
      for (let k = 0; k < 4; k++) p.box(0.075, 0.018, 0.018, x + Math.cos(ry) * (-0.11 + k * 0.075), 0.11, z - Math.sin(ry) * (-0.11 + k * 0.075), k % 2 ? C.white : 0xd84a3e, ry);
      for (const s of [-1, 1]) { p.box(0.06, 0.03, 0.04, x + Math.cos(ry) * s * 0.2, 0.012, z - Math.sin(ry) * s * 0.2, C.darkgreen, ry); p.sphere(0.014, x + Math.cos(ry) * s * 0.2, 0.05, z - Math.sin(ry) * s * 0.2, C.pink); }
    }
  }
}

/** Ruche de paille (panier tressé) posée en (x, y, z), son trou de vol vers +z */
function skep(p: Parts, x: number, y: number, z: number, r = 0.06) {
  p.add(new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), x, y, z, C.thatch);
  for (const h of [0.25, 0.5, 0.72]) p.add(new THREE.TorusGeometry(r * Math.sqrt(1 - h * h) + 0.002, 0.006, 3, 10).rotateX(Math.PI / 2), x, y + h * r * 1.3, z, dark(C.thatch, 0.78));
  p.box(0.024, 0.014, 0.01, x, y, z + r - 0.004, 0x2a2018);
}

/** Ruche à cadres : pieds, corps, hausse, toit de tôle, planche d'envol */
function boxHive(p: Parts, x: number, z: number, body: number, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
  for (const u of [-0.045, 0.045]) { const [a, b] = at(u, 0); p.box(0.02, 0.05, 0.14, a, 0, b, C.darkwood, ry); }
  p.box(0.13, 0.1, 0.15, x, 0.05, z, body, ry);
  p.box(0.13, 0.055, 0.15, x, 0.15, z, dark(body, 0.9), ry);
  p.box(0.15, 0.02, 0.17, x, 0.205, z, C.metal, ry);
  const [ex, ez] = at(0, 0.077), [lx, lz] = at(0, 0.09);
  p.box(0.08, 0.012, 0.006, ex, 0.06, ez, 0x2a2018, ry);
  p.box(0.1, 0.008, 0.03, lx, 0.052, lz, C.wood, ry);
}

/** Rucher (1 × 1) : des ruches dans un pré fleuri, et leurs abeilles qui tournent autour */
function apiary(p: Parts, age: number) {
  const grass = age === 0 ? 0x9cb86a : 0x8cbf6c, FL = [0xf2e27a, 0xffffff, 0xd88ab8, 0xb9a6e6, 0xf29a6a];
  p.cyl(0.46, 0.47, 0.012, 14, 0, 0, 0, grass);
  for (let i = 0; i < 30; i++) {
    const a = i * 2.4, r = 0.2 + (i % 7) * 0.035, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < 0.05 && Math.abs(x) < 0.34 && r < 0.36) continue;
    p.cone(0.012, 0.05, 4, x, 0.012, z, dark(grass, 0.8));
    p.sphere(0.014, x, 0.06, z, FL[i % 5]);
  }
  if (age === 0) {
    // troncs creux posés sur des pierres plates, couverts d'une lauze
    for (const [x, z] of [[-0.2, -0.12], [0.05, -0.22], [0.25, -0.06]]) {
      p.cyl(0.09, 0.1, 0.03, 7, x, 0, z, C.stone);
      p.cyl(0.065, 0.07, 0.22, 8, x, 0.03, z, C.darkwood);
      for (const y of [0.08, 0.17]) p.cyl(0.072, 0.072, 0.012, 8, x, y, z, dark(C.darkwood, 0.8));
      p.cyl(0.085, 0.08, 0.025, 7, x, 0.25, z, C.darkstone);
      p.box(0.025, 0.02, 0.01, x, 0.1, z + 0.066, 0x2a2018);
    }
    log(p, 0.3, 0.035, -0.12, 0, 0.22, 0.4);
    p.cyl(0.04, 0.035, 0.05, 7, 0.2, 0.012, 0.2, C.brown); p.cyl(0.03, 0.03, 0.006, 7, 0.2, 0.06, 0.2, C.gold);
    bees(0.03, 0.2, -0.12);
  } else if (age === 1) {
    // ruches d'argile couchées en pyramide sur un banc de terre, sous un auvent de roseaux
    p.box(0.62, 0.08, 0.24, 0, 0.012, -0.2, 0xc9a77c);
    for (const [x, y] of [[-0.11, 0.142], [0, 0.142], [0.11, 0.142], [-0.055, 0.236], [0.055, 0.236], [0, 0.33]]) {
      p.add(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 9).rotateX(Math.PI / 2), x, y, -0.2, C.terracotta);
      p.add(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 9).rotateX(Math.PI / 2), x, y, -0.085, dark(C.terracotta, 0.78));
      p.box(0.016, 0.012, 0.006, x, y - 0.02, -0.078, 0x2a2018);
    }
    for (const x of [-0.3, 0.3]) for (const z of [-0.34, -0.04]) p.box(0.022, z < -0.2 ? 0.48 : 0.42, 0.022, x, 0, z, C.wood);
    p.add(new THREE.BoxGeometry(0.7, 0.025, 0.4), 0, 0.44, -0.19, C.thatch, 0, false, 0, 0.15);
    for (let k = 0; k < 7; k++) p.add(new THREE.BoxGeometry(0.7, 0.008, 0.014).translate(0, 0.016, -0.17 + k * 0.055), 0, 0.44, -0.19, dark(C.thatch, k % 2 ? 0.86 : 0.94), 0, false, 0, 0.15);
    attach(['a_amphora'], 0, 0.07, 0.3, 0.18); attach(['a_pot'], 0, 0.06, 0.2, 0.26, 0.6);
    bees(0, 0.24, -0.05);
  } else if (age === 2) {
    // paniers de paille sur leur banc, à l'abri d'un auvent de chaume adossé à une palissade
    p.box(0.66, 0.36, 0.02, 0, 0.012, -0.34, C.wood);
    for (let u = -0.3; u < 0.33; u += 0.06) p.box(0.012, 0.36, 0.006, u, 0.012, -0.328, dark(C.wood, 0.85));
    p.add(new THREE.BoxGeometry(0.74, 0.03, 0.16), 0, 0.36, -0.29, C.thatch, 0, false, 0, 0.35);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.74, 0.008, 0.012), 0, 0.38 - k * 0.018, -0.34 + k * 0.04, dark(C.thatch, 0.82), 0, false, 0, 0.35);
    for (const x of [-0.33, 0.33]) p.box(0.022, 0.38, 0.03, x, 0.012, -0.32, C.darkwood);
    p.box(0.62, 0.02, 0.16, 0, 0.11, -0.2, C.wood);
    for (const x of [-0.27, 0.27]) p.box(0.02, 0.1, 0.12, x, 0.012, -0.2, C.darkwood);
    for (const x of [-0.21, -0.07, 0.07, 0.21]) skep(p, x, 0.13, -0.2);
    for (const [x, z] of [[-0.3, 0.22], [-0.2, 0.3], [0.32, 0.2]]) p.sphere(0.05, x, 0.05, z, C.lav, 0, 0.8);
    p.box(0.12, 0.06, 0.08, 0.18, 0.012, 0.22, C.wood); for (const d of [-0.03, 0.03]) p.cyl(0.018, 0.016, 0.035, 7, 0.18 + d, 0.072, 0.22, C.gold);
    bees(0, 0.22, -0.04);
  } else if (age === 3) {
    // ruches à cadres blanches en rang, enfumoir sur son tabouret, tournesols contre la clôture
    for (const x of [-0.27, 0, 0.27]) boxHive(p, x, -0.12, C.white);
    for (let i = 0; i < 9; i++) p.box(0.022, 0.16, 0.022, -0.4 + i * 0.1, 0.012, -0.4, C.white);
    p.box(0.84, 0.018, 0.014, 0, 0.12, -0.4, C.white);
    for (const x of [-0.32, -0.18, 0.2, 0.34]) { p.box(0.01, 0.3, 0.01, x, 0.012, -0.34, 0x6a9a4a); p.cyl(0.035, 0.035, 0.012, 9, x, 0.31, -0.33, 0xf2c84b); p.cyl(0.016, 0.016, 0.014, 7, x, 0.312, -0.326, 0x6a4a2e); }
    p.cyl(0.035, 0.035, 0.07, 6, 0.22, 0.012, 0.22, C.darkwood); p.cyl(0.022, 0.022, 0.06, 8, 0.22, 0.082, 0.22, C.metal); p.cone(0.022, 0.03, 8, 0.22, 0.142, 0.22, C.metal);
    smoke(0.22, 0.18, 0.22, 0);
    bees(0, 0.24, -0.1);
  } else {
    // ruches de toutes les couleurs dans la prairie, petite miellerie au bardage de bois et son enseigne
    [[-0.28, 0.06, 0xf2c84b, 0.3], [-0.06, 0.16, 0x8cc4e8, 0.1], [0.16, 0.2, 0x9fd8b8, -0.1], [0.32, 0.06, 0xf0a8b8, -0.3]].forEach(([x, z, c, r]) => boxHive(p, x, z, c, r));
    p.box(0.38, 0.26, 0.24, -0.04, 0.012, -0.3, C.white);
    for (let u = -0.17; u < 0.16; u += 0.04) p.box(0.012, 0.26, 0.006, -0.04 + u, 0.012, -0.177, C.wood);
    p.box(0.42, 0.025, 0.28, -0.04, 0.27, -0.3, 0x5d6878);
    p.box(0.08, 0.16, 0.012, 0.06, 0.012, -0.172, C.glass, 0, true);
    windows(p, [-0.13], 0.12, -0.172, 0.08, 0.07, C.white);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 6).rotateX(Math.PI / 2), -0.04, 0.225, -0.17, C.gold);
    bees(0.02, 0.22, 0.1);
    // la miellerie : toit végétalisé et son panneau solaire, store rayé au-dessus de la porte
    p.box(0.38, 0.012, 0.24, -0.04, 0.295, -0.3, 0x7aa85a); for (let k = 0; k < 5; k++) p.sphere(0.02, -0.18 + k * 0.07, 0.305, -0.3 + (k % 2 ? 0.05 : -0.04), k % 2 ? 0xd8c84a : 0x8ab86a, 0, 0.5);
    solar(p, 0.08, 0.307, -0.36, 1, 0.12, 0.09);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.03, 0.008, 0.08), 0.015 + k * 0.03, 0.2, -0.13, k % 2 ? C.white : 0xf2c84b, 0, false, 0, 0.45);
    // l'étal du miel : table, pots dorés à couvercle blanc, parasol jaune ; la cliente
    p.box(0.16, 0.012, 0.08, 0.32, 0.08, -0.22, C.wood); for (const d of [-0.065, 0.065]) p.box(0.012, 0.07, 0.07, 0.32 + d, 0.012, -0.22, C.darkwood);
    for (let k = 0; k < 6; k++) { const x = 0.26 + (k % 3) * 0.05, z = -0.24 + Math.floor(k / 3) * 0.04; p.cyl(0.012, 0.012, 0.024, 7, x, 0.092, z, 0xe8a83a); p.cyl(0.013, 0.013, 0.006, 7, x, 0.116, z, C.white); }
    p.cyl(0.004, 0.004, 0.28, 4, 0.4, 0.012, -0.26, C.metal); p.cone(0.11, 0.045, 8, 0.4, 0.29, -0.26, 0xf2c84b);
    figure(p, 0.32, -0.1, 0xb45ad8, Math.PI, false, 0x8a5a3a);
    // l'apiculteur en combinaison blanche et chapeau à voile sort un cadre de ruche, son enfumoir à ses pieds
    figure(p, -0.06, 0.32, C.white, Math.PI, false, 0xf2f2e8);
    p.box(0.05, 0.04, 0.006, -0.06, 0.1, 0.28, 0xd8a03a); p.box(0.056, 0.006, 0.008, -0.06, 0.14, 0.28, C.wood);
    p.cyl(0.014, 0.014, 0.04, 7, 0.02, 0.012, 0.34, C.metal); p.cone(0.014, 0.02, 7, 0.02, 0.052, 0.34, C.metal);
    // lavandes au fond, abreuvoir des abeilles, l'enseigne sur son poteau
    for (const [x, z] of [[-0.38, -0.08], [-0.36, -0.18], [-0.31, -0.27], [-0.4, 0.02]]) { p.sphere(0.035, x, 0.04, z, 0x8a9a6a, 0, 0.8); for (let k = 0; k < 5; k++) p.cone(0.006, 0.05, 4, x + Math.cos(k * 1.3) * 0.022, 0.05, z + Math.sin(k * 1.3) * 0.022, 0x9a7ad8); }
    p.cyl(0.04, 0.045, 0.03, 9, 0.22, 0.012, 0.36, C.stone); p.cyl(0.033, 0.033, 0.004, 9, 0.22, 0.04, 0.36, C.water);
    for (let k = 0; k < 3; k++) p.sphere(0.008, 0.21 + k * 0.012, 0.045, 0.35 + (k % 2) * 0.015, C.darkstone);
    p.box(0.012, 0.2, 0.012, -0.3, 0.012, 0.36, C.darkwood); p.box(0.13, 0.06, 0.012, -0.3, 0.16, 0.37, C.wood);
    for (let k = 0; k < 4; k++) p.box(0.02, 0.026, 0.004, -0.345 + k * 0.03, 0.177, 0.378, 0x8a5a2a);
  }
}

/**
 * Thermes (2 × 2) : bassin romain fumant entre deux portiques, caldarium à coupole ; étuves à colombages et cuves de bois ;
 * bains publics de brique à verrière et haute cheminée ; centre aquatique vitré, bassin à lignes et toboggan
 */
function baths(p: Parts, age: number) {
  if (age <= 1) {
    const marble = 0xf2ead8;
    sink(0.03);
    for (let i = 0; i < 16; i++) p.box(0.2, 0.004, 0.2, -0.75 + (i % 4) * 0.5 + (Math.floor(i / 4) % 2) * 0.25, 0.03, -0.1 + Math.floor(i / 4) * 0.3, dark(0xe9e2d4, 0.93));
    // natatio : margelle de marbre, fond de mosaïque, eau qui fume, marches
    const pz = 0.34, pw = 0.86, pd = 0.54;
    for (const s of [-1, 1]) { p.box(pw + 0.1, 0.07, 0.05, 0, 0.03, pz + s * (pd / 2 + 0.025), marble); p.box(0.05, 0.07, pd, s * (pw / 2 + 0.025), 0.03, pz, marble); }
    p.box(pw, 0.01, pd, 0, 0.03, pz, 0x4f9fb4);
    p.box(pw, 0.008, pd, 0, 0.085, pz, 0x7fd0dc);
    for (let k = 0; k < 2; k++) p.box(0.22, 0.02, 0.05, 0, 0.04 + k * 0.022, pz + pd / 2 - 0.03 - k * 0.04, marble);
    smoke(-0.2, 0.12, pz, 0); smoke(0.22, 0.12, pz - 0.1, 0);
    // portiques de part et d'autre, toits de tuiles penchés vers le bassin
    for (const s of [-1, 1]) {
      for (const z of [0.0, 0.25, 0.5, 0.75]) column(p, s * 0.62, z, 0.32, 0.03);
      tiledShed(p, s * 0.68, 0.37, 0.38, 0.3, 0.92, s * 0.25, true);
      p.box(0.24, 0.035, 0.07, s * 0.62, 0.03, 0.38, marble, Math.PI / 2);
    }
    // caldarium : murs de brique, corniche de marbre, toit de tuiles, coupole sur son tambour, porche à fronton
    const bz = -0.6;
    p.box(1.5, 0.42, 0.46, 0, 0.03, bz, C.brick);
    stones(p, 0, bz + 0.23, 1.5, 0.03, 0.45, 0, dark(C.brick, 0.88), 0.45, 91);
    p.box(1.54, 0.03, 0.5, 0, 0.42, bz, marble);
    roof(p, 0, 0.45, bz, { w: 1.5, d: 0.46, h: 0.16, color: C.terracotta, wall: C.brick, tiles: true });
    p.cyl(0.3, 0.3, 0.16, 16, 0, 0.45, bz, C.cream);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.05, 0.08, 0.012, Math.sin(a) * 0.302, 0.48, bz + Math.cos(a) * 0.302, C.win, a, true); }
    p.add(new THREE.SphereGeometry(0.3, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.61, bz, 0xeadcc0);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.add(new THREE.TorusGeometry(0.302, 0.008, 3, 8, Math.PI / 2).rotateY(a), 0, 0.61, bz, dark(0xeadcc0, 0.86)); }
    p.cyl(0.05, 0.05, 0.03, 8, 0, 0.9, bz, C.stone);
    windows(p, [-0.55, -0.32, 0.32, 0.55], 0.15, bz + 0.235, 0.07, 0.13, marble);
    for (const s of [-1, 1]) column(p, s * 0.13, bz + 0.3, 0.3, 0.03, 0.028);
    p.box(0.36, 0.035, 0.12, 0, 0.33, bz + 0.29, marble); p.gable(0.38, 0.08, 0.12, 0, 0.365, bz + 0.29, marble);
    p.box(0.14, 0.22, 0.02, 0, 0.03, bz + 0.235, 0x6a4a3a);
    p.box(0.08, 0.62, 0.08, 0.66, 0.03, -0.8, C.brick); smoke(0.66, 0.68, -0.8, 1);
    for (const s of [-1, 1]) { if (attach(['a_statue'], 0, 0.13, s * 0.44, 0.74, Math.PI)) lift(0.03); cypress(p, s * 0.82, 0.82, 0.3); }
    // bordure de mosaïque noire et blanche autour du bassin
    for (let i = 0; i < 21; i++) for (const s of [-1, 1]) p.box(0.034, 0.004, 0.034, -0.48 + i * 0.048, 0.032, pz + s * (pd / 2 + 0.085), i % 2 ? 0x2f3a44 : 0xf2ead8);
    // les baigneurs : têtes et épaules hors de l'eau, d'autres assis sur la margelle, les pieds dans le bassin
    const skin = 0xe8b894, hair = [0x4a3426, 0x2a2420, 0x8a5a3a, 0xc8a070];
    [[-0.25, 0.24], [0.06, 0.44], [0.28, 0.2], [-0.06, 0.16], [0.32, 0.46]].forEach(([x, z], i) => {
      p.box(0.075, 0.02, 0.036, x, 0.088, z, skin); p.box(0.022, 0.012, 0.022, x, 0.106, z, skin);
      p.sphere(0.02, x, 0.13, z, skin); p.sphere(0.02, x + 0.004, 0.141, z - 0.004, hair[i % 4], 0, 0.45);
    });
    for (const [x, c] of [[-0.3, C.white], [0.3, 0xd8a03a]] as [number, number][]) seated(p, x, 0.1, pz + pd / 2 + 0.01, Math.PI, c, hair[x > 0 ? 2 : 0]);
    // sous les portiques : bancs de marbre et baigneurs qui bavardent ; lauriers-roses en pot
    for (const s of [-1, 1]) {
      p.box(0.06, 0.04, 0.52, s * 0.79, 0.03, 0.38, marble);
      for (const [z, c, h] of [[0.2, C.white, 1], [0.48, s > 0 ? 0xc8a0d8 : 0x86c4b8, 3]] as [number, number, number][]) seated(p, s * 0.79, 0.07, z, -s * Math.PI / 2, c, hair[h]);
      p.cyl(0.03, 0.024, 0.05, 7, s * 0.55, 0.03, -0.1, C.terracotta); p.sphere(0.05, s * 0.55, 0.12, -0.1, C.darkgreen, 0, 0.9);
      for (let k = 0; k < 4; k++) p.sphere(0.012, s * 0.55 + Math.cos(k * 1.7) * 0.035, 0.14 + (k % 2) * 0.02, -0.1 + Math.sin(k * 1.7) * 0.035, 0xf2a6c8);
    }
    for (const [x, z, c, r] of [[0.16, 0.82, C.white, 2.6], [-0.2, 0.86, 0xd8786c, 0.4], [-0.4, -0.25, C.white, 1.2]] as number[][]) figure(p, x, z, c, r);
    // le serviteur porte une amphore d'huile vers la chaufferie
    figure(p, 0.5, -0.22, 0xb48a68, -1.2); p.sphere(0.026, 0.48, 0.22, -0.24, C.terracotta, 0, 1.4);
    // la vasque au milieu du parvis
    p.cyl(0.03, 0.04, 0.08, 8, 0, 0.03, 0.82, marble); p.cyl(0.1, 0.06, 0.03, 12, 0, 0.11, 0.82, marble); p.cyl(0.085, 0.085, 0.005, 12, 0, 0.136, 0.82, C.water);
    // la chaufferie : gueule du foyer qui rougeoie, bûches empilées ; amphores d'huile près de la porte
    p.box(0.07, 0.06, 0.014, 0.66, 0.03, -0.755, C.flame, 0, true);
    for (let k = 0; k < 7; k++) log(p, 0.18, 0.022, 0.8, 0.03 + (k > 3 ? 0.04 : 0), -0.64 + (k % 4) * 0.046 + (k > 3 ? 0.023 : 0));
    for (const x of [-0.32, -0.26]) { p.sphere(0.03, x, 0.08, bz + 0.29, C.terracotta, 0, 1.5); p.cyl(0.01, 0.016, 0.04, 6, x, 0.12, bz + 0.29, C.terracotta); }
  } else if (age === 2) {
    sink(0.03);
    // la maison des étuves : pierre au rez-de-chaussée, colombages, tuiles, cheminée qui fume
    const bz = -0.58, W = 1.2, zf = bz + 0.25;
    p.box(W, 0.26, 0.5, -0.2, 0.03, bz, C.stone);
    stones(p, -0.2, zf, W, 0.03, 0.29, 0, C.stone, 0.6, 92);
    p.box(W + 0.04, 0.24, 0.54, -0.2, 0.29, bz, C.cream);
    timbers(p, -0.2, zf + 0.022, W + 0.04, 0.3, 0.53, 0, 7, (i) => i % 2 === 0);
    roof(p, -0.2, 0.53, bz, { w: W + 0.04, d: 0.54, h: 0.32, color: 0x8a5a44, wall: C.cream, courses: true });
    p.box(0.1, 0.36, 0.1, 0.18, 0.62, bz - 0.12, C.stone); smoke(0.18, 1.0, bz - 0.12, 1);
    p.box(0.14, 0.2, 0.02, -0.2, 0.03, zf + 0.01, C.door);
    windows(p, [-0.62, 0.22], 0.12, zf + 0.01, 0.08, 0.09); windows(p, [-0.6, -0.35, -0.05, 0.22], 0.36, zf + 0.032, 0.06, 0.08, C.darkwood);
    // la cour : trois cuves de bois fumantes sous un auvent rayé
    for (const [x, z] of [[-0.45, 0.28], [0, 0.42], [0.42, 0.24]]) {
      p.cyl(0.13, 0.12, 0.1, 12, x, 0.03, z, C.wood);
      for (const y of [0.05, 0.11]) p.cyl(0.133, 0.133, 0.01, 12, x, y, z, C.darkwood);
      p.cyl(0.115, 0.115, 0.01, 12, x, 0.124, z, C.water);
      p.add(new THREE.TorusGeometry(0.122, 0.012, 4, 14).rotateX(Math.PI / 2), x, 0.135, z, C.wood);
      smoke(x, 0.16, z, 0);
    }
    for (const x of [-0.72, -0.2, 0.32]) p.box(0.022, 0.25, 0.022, x, 0.03, -0.1, C.darkwood);
    for (let k = 0; k < 8; k++) p.add(new THREE.BoxGeometry(0.135, 0.012, 0.26), -0.72 + 0.068 + k * 0.13, 0.29, -0.2, k % 2 ? C.white : 0xc85a4e, 0, false, 0, 0.3);
    for (let k = 0; k < 8; k++) for (const t of [-0.03, 0.03]) p.add(new THREE.ConeGeometry(0.03, 0.04, 3).rotateZ(Math.PI), -0.72 + 0.068 + k * 0.13 + t, 0.23, -0.07, k % 2 ? C.white : 0xc85a4e);
    p.box(0.4, 0.03, 0.08, -0.46, 0.08, -0.22, C.wood); for (const s of [-1, 1]) p.box(0.02, 0.05, 0.06, -0.46 + s * 0.16, 0.03, -0.22, C.darkwood);
    // bois de chauffe, seaux, linges qui sèchent
    for (let k = 0; k < 6; k++) log(p, 0.22, 0.026, 0.62, 0.03 + (k > 3 ? 0.048 : 0), -0.25 + (k % 4) * 0.055, Math.PI / 2);
    for (const x of [0.62, 0.76]) p.cyl(0.03, 0.025, 0.05, 7, x, 0.03, 0.82, C.wood);
    for (const x of [-0.82, -0.3]) p.box(0.016, 0.3, 0.016, x, 0.03, 0.84, C.darkwood);
    p.box(0.52, 0.006, 0.006, -0.56, 0.32, 0.84, 0xc9b48a);
    for (const [x, c] of [[-0.7, C.white], [-0.56, 0xa8c8e8], [-0.42, C.white]] as [number, number][]) sway([x, 0.32, 0.84], [1, 0, 0], 0.3, 1.2).box(0.09, 0.1, 0.008, 0, -0.1, 0, c);
    // la cour pavée, bordée d'herbe
    for (let i = 0; i < 36; i++) p.box(0.13, 0.004, 0.09, -0.78 + (i % 9) * 0.19 + (Math.floor(i / 9) % 2) * 0.09, 0.03, -0.02 + Math.floor(i / 9) * 0.2, dark(0xd9cdb8, 0.86 + hash2(i, 5, 93) * 0.12));
    for (let i = 0; i < 14; i++) p.sphere(0.02 + hash2(i, 1, 94) * 0.015, -0.86 + hash2(i, 2, 94) * 1.72, 0.03, i % 2 ? 0.88 : -0.86, i % 3 ? 0x8ab86a : 0x9fc87a, 0, 0.5);
    // les baigneurs dans les cuves, une planche en travers où l'on sert à boire et à manger
    const skin = 0xe8b894, hair = [0x4a3426, 0x8a5a3a, 0x2a2420, 0xc8a070];
    [[-0.47, 0.28], [-0.04, 0.4], [0.05, 0.46], [0.42, 0.24]].forEach(([x, z], i) => {
      p.box(0.06, 0.02, 0.035, x, 0.128, z, skin);
      p.sphere(0.02, x, 0.168, z, skin); p.sphere(0.02, x + 0.003, 0.18, z - 0.004, hair[i % 4], 0, 0.45);
    });
    p.box(0.26, 0.008, 0.05, 0, 0.142, 0.43, C.wood); p.cyl(0.012, 0.01, 0.025, 6, -0.06, 0.15, 0.43, 0x8a5a3a); p.sphere(0.02, 0.07, 0.158, 0.43, 0xc89a5a, 0, 0.6);
    // l'étuviste remplit une cuve, seau à la main
    figure(p, 0.22, 0.4, 0x8a6a4a, -1.2); p.cyl(0.022, 0.018, 0.035, 7, 0.17, 0.09, 0.38, C.wood);
    // la chaudière : four de pierre qui rougeoie, grand chaudron de cuivre qui fume
    p.box(0.2, 0.1, 0.18, 0.72, 0.03, 0.12, C.stone); p.box(0.07, 0.05, 0.012, 0.72, 0.035, 0.216, C.flame, 0, true);
    p.cyl(0.08, 0.07, 0.08, 10, 0.72, 0.13, 0.12, 0xc8743a); p.cyl(0.07, 0.07, 0.006, 10, 0.72, 0.205, 0.12, C.water); smoke(0.72, 0.24, 0.12, 0);
    // le puits et son treuil pour remplir les cuves
    p.cyl(0.07, 0.08, 0.07, 10, -0.76, 0.03, 0.5, C.stone); p.cyl(0.058, 0.058, 0.006, 10, -0.76, 0.09, 0.5, C.water);
    for (const d of [-1, 1]) p.box(0.016, 0.16, 0.016, -0.76 + d * 0.07, 0.1, 0.5, C.darkwood);
    p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.15, 6).rotateZ(Math.PI / 2), -0.76, 0.24, 0.5, C.wood); p.cyl(0.018, 0.015, 0.03, 6, -0.76, 0.17, 0.5, C.wood);
    // enseigne pendue au coin de la maison, lanterne près de la porte, jardinières fleuries sous les fenêtres
    p.box(0.012, 0.012, 0.12, -0.78, 0.44, zf + 0.06, C.darkwood); { const f = sway([-0.78, 0.44, zf + 0.1], [1, 0, 0], 0.2, 0.7); f.box(0.1, 0.07, 0.008, 0, -0.08, 0, 0xe8d6b0); f.cyl(0.02, 0.018, 0.02, 8, 0, -0.06, 0.006, C.wood); }
    p.box(0.03, 0.04, 0.03, -0.08, 0.2, zf + 0.03, 0xffe2a0, 0, true);
    for (const x of [-0.6, -0.35, -0.05, 0.22]) { p.box(0.08, 0.02, 0.025, x, 0.345, zf + 0.045, C.wood); for (const d of [-0.025, 0, 0.025]) p.sphere(0.012, x + d, 0.37, zf + 0.045, d ? 0xd84a3e : 0xf2d24a); }
    // ceux qui attendent leur tour sur le banc
    seated(p, -0.56, 0.11, -0.22, 0, 0xb8443a, 0x4a3426); seated(p, -0.38, 0.11, -0.22, 0, 0x3a5a9a, 0x8a5a3a);
  } else if (age === 3) {
    sink(0.025);
    // établissement de bains : brique, cordons blancs, hautes fenêtres, verrière sur le faîte, cheminée de la chaufferie
    const bz = -0.5, W = 1.56, D = 0.6, H = 0.52, zf = bz + D / 2, brick = 0xb86a58;
    p.box(W, H, D, 0, 0.025, bz, brick);
    stones(p, 0, zf, W, 0.025, H + 0.025, 0, dark(brick, 0.86), 0.45, 93);
    for (const y of [0.025, 0.28, H]) p.box(W + 0.02, 0.03, D + 0.02, 0, y, bz, C.cream);
    roof(p, 0, H + 0.025, bz, { w: W, d: D, h: 0.2, color: C.slate, wall: brick, courses: true });
    p.box(0.7, 0.07, 0.2, 0, H + 0.2, bz, C.glass, 0, true);
    for (let k = 0; k < 8; k++) p.box(0.012, 0.075, 0.21, -0.33 + k * 0.094, H + 0.2, bz, C.metal);
    p.box(0.72, 0.012, 0.012, 0, H + 0.275, bz, C.metal);
    for (const y of [0.08, 0.33]) windows(p, [-0.62, -0.4, -0.18, 0.18, 0.4, 0.62], y, zf + 0.01, 0.08, 0.15, C.cream);
    p.box(0.22, 0.26, 0.03, 0, 0.025, zf + 0.012, C.cream); p.box(0.16, 0.22, 0.02, 0, 0.025, zf + 0.025, 0x3f5a4a);
    p.box(0.42, 0.06, 0.012, 0, 0.42, zf + 0.012, C.cream); for (let k = 0; k < 7; k++) p.box(0.035, 0.03, 0.006, -0.15 + k * 0.05, 0.435, zf + 0.02, 0x3c3530);
    p.cyl(0.05, 0.05, 0.01, 12, 0, 0.54, zf + 0.01, C.white); p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12).rotateX(Math.PI / 2), 0, 0.5, zf + 0.012, C.white);
    p.cyl(0.06, 0.075, 1.1, 8, 0.66, 0.025, bz - 0.2, 0xa85e50); p.cyl(0.07, 0.07, 0.04, 8, 0.66, 1.1, bz - 0.2, C.darkstone); smoke(0.66, 1.16, bz - 0.2, 2);
    // la piscine de plein air : margelle carrelée, lignes d'eau, nageurs, plongeoir de béton à deux plateformes, cabines rayées
    const pz = 0.4, pw = 1.14, pd = 0.6, px = -0.06;
    for (const s of [-1, 1]) { p.box(pw + 0.08, 0.05, 0.04, px, 0.025, pz + s * (pd / 2 + 0.02), C.white); p.box(0.04, 0.05, pd, px + s * (pw / 2 + 0.02), 0.025, pz, C.white); }
    p.box(pw, 0.01, pd, px, 0.025, pz, 0x3f8fb8); p.box(pw, 0.008, pd, px, 0.06, pz, 0x6cc4e0);
    for (let k = 1; k < 4; k++) p.box(pw - 0.04, 0.006, 0.008, px, 0.066, pz - pd / 2 + (k * pd) / 4, k % 2 ? 0xd84a3e : C.white);
    for (const [x, z, cap] of [[-0.42, pz - 0.22, 0xd84a3e], [-0.02, pz - 0.08, 0xf2c23a], [0.22, pz + 0.08, 0x3a6ab8], [-0.24, pz + 0.22, C.white]] as number[][]) { p.sphere(0.016, x, 0.07, z, 0xe8b894); p.sphere(0.017, x, 0.078, z, cap, 0, 0.6); }
    for (const z of [pz - 0.08, pz + 0.08]) p.box(0.035, 0.46, 0.035, 0.7, 0.025, z, C.cream);
    p.box(0.22, 0.02, 0.1, 0.6, 0.22, pz, C.cream); p.box(0.3, 0.02, 0.1, 0.56, 0.44, pz, C.cream);
    for (const z of [pz - 0.045, pz + 0.045]) { p.box(0.006, 0.42, 0.006, 0.74, 0.025, z, C.metal); p.box(0.26, 0.006, 0.006, 0.6, 0.5, z, C.metal); }
    for (let k = 0; k < 7; k++) p.box(0.006, 0.006, 0.09, 0.74, 0.06 + k * 0.06, pz, C.metal);
    actor(p, 0.46, 0.46, pz, -Math.PI / 2, 0x3a6ab8);
    for (let k = 0; k < 5; k++) { const z = 0.12 + k * 0.14; p.box(0.1, 0.18, 0.1, -0.82, 0.025, z, k % 2 ? 0x3a6ab8 : C.white); p.box(0.006, 0.12, 0.06, -0.768, 0.025, z, k % 2 ? C.white : 0x3a6ab8); }
    for (const s of [-1, 1]) lampPost(p, s * 0.4, 0.86);
  } else {
    sink(0.025);
    // le centre aquatique : grande façade vitrée, auvent, enseigne bleue
    const bz = -0.56, W = 1.5, D = 0.52, H = 0.44, zf = bz + D / 2;
    p.box(W, H, D, 0, 0.025, bz, C.white);
    for (let k = 0; k < 9; k++) for (const y of [0.06, 0.25]) p.box(0.14, 0.16, 0.012, -0.6 + k * 0.15, y, zf + 0.004, C.glass, 0, true);
    for (let k = 0; k < 10; k++) p.box(0.012, 0.38, 0.016, -0.675 + k * 0.15, 0.045, zf + 0.01, C.metal);
    p.box(W + 0.1, 0.035, D + 0.14, 0, H + 0.025, bz + 0.04, C.white);
    p.box(0.5, 0.07, 0.012, -0.3, H - 0.06, zf + 0.08, 0x3f8fd8); for (let k = 0; k < 4; k++) p.box(0.06, 0.012, 0.006, -0.45 + k * 0.1, H - 0.03, zf + 0.088, C.white);
    // bassin extérieur : plage de dalles, lignes d'eau, échelle ; toboggan qui tourne en descendant depuis sa tour
    const pz = 0.32, pw = 1.1, pd = 0.66;
    for (const s of [-1, 1]) { p.box(pw + 0.08, 0.06, 0.04, 0, 0.025, pz + s * (pd / 2 + 0.02), C.white); p.box(0.04, 0.06, pd, s * (pw / 2 + 0.02), 0.025, pz, C.white); }
    p.box(pw, 0.01, pd, 0, 0.025, pz, 0x3fa8c8); p.box(pw, 0.008, pd, 0, 0.07, pz, 0x6cd0e8);
    for (let k = 1; k < 5; k++) p.box(0.012, 0.004, pd - 0.06, -pw / 2 + k * (pw / 5), 0.079, pz, 0x2a5aa0);
    for (const s of [-1, 1]) p.box(0.006, 0.08, 0.006, 0.4 + s * 0.03, 0.06, pz - pd / 2 + 0.01, C.metal);
    for (const [x, z] of [[0.72, -0.12], [0.86, -0.12], [0.72, 0.02], [0.86, 0.02]]) p.box(0.02, 0.5, 0.02, x, 0.025, z, 0xf2c84b);
    p.box(0.18, 0.02, 0.18, 0.79, 0.5, -0.05, 0xf2c84b);
    for (let k = 0; k < 3; k++) p.add(new THREE.TorusGeometry(0.15, 0.03, 6, 12, Math.PI).rotateX(Math.PI / 2).rotateY(k * 1.3), 0.7, 0.42 - k * 0.13, 0.12 + k * 0.06, k % 2 ? 0x4fa3e0 : 0xf2785a);
    // chaises longues, parasols, arbres
    for (const x of [-0.6, -0.42, -0.24]) { p.add(new THREE.BoxGeometry(0.08, 0.012, 0.16), x, 0.05, 0.8, C.white, 0, false, 0, 0); p.add(new THREE.BoxGeometry(0.08, 0.012, 0.07), x, 0.08, 0.7, C.white, 0, false, 0, -0.7); }
    for (const [x, c] of [[-0.51, 0xf2785a], [0.3, 0x4fa3e0]] as [number, number][]) { p.cyl(0.006, 0.006, 0.26, 4, x, 0.025, 0.8, C.metal); p.cone(0.13, 0.06, 8, x, 0.25, 0.8, c); }
    tree(p, -0.82, 0.82, 1.2); tree(p, 0.84, 0.82, 1.1);
    // le toit : panneaux solaires, centrales de traitement d'air ; l'entrée sous son auvent, porte tambour, vélos
    solar(p, -0.32, H + 0.06, -0.64, 5, 0.14, 0.12);
    hvac(p, 0.36, H + 0.06, -0.66, 0.16); hvac(p, 0.58, H + 0.06, -0.62, 0.12);
    p.box(0.32, 0.016, 0.16, 0.35, 0.235, zf + 0.08, C.white); for (const s of [-1, 1]) p.box(0.012, 0.21, 0.012, 0.35 + s * 0.14, 0.025, zf + 0.15, C.metal);
    p.cyl(0.06, 0.06, 0.17, 10, 0.35, 0.025, zf + 0.02, 0x9fc4dc, true); p.cyl(0.064, 0.064, 0.012, 10, 0.35, 0.195, zf + 0.02, C.metal);
    for (let k = 0; k < 4; k++) bike(p, -0.72 + k * 0.06, -0.16, [0xd8553c, 0x3c7fd8, 0x4fa860, 0xf2c23a][k], 0, 0.025);
    // plots de départ numérotés, nageurs dans leurs couloirs (bonnet de couleur, bras qui sortent de l'eau)
    for (let k = 0; k < 5; k++) { const x = -0.44 + k * 0.22; p.box(0.06, 0.05, 0.05, x, 0.025, pz - pd / 2 - 0.03, C.white); p.box(0.05, 0.006, 0.04, x, 0.075, pz - pd / 2 - 0.03, 0x3f8fd8); }
    for (const [x, z, c, d] of [[-0.44, 0.22, 0xd84a3e, 1], [-0.22, 0.46, 0xf2c23a, -1], [0, 0.12, C.white, 1], [0.22, 0.38, 0x4fa860, -1]]) {
      p.box(0.03, 0.008, 0.07, x, 0.068, z, 0x2a3a6a); p.sphere(0.014, x, 0.08, z + d * 0.045, c);
      p.add(new THREE.BoxGeometry(0.008, 0.008, 0.05), x + 0.02, 0.085, z + d * 0.06, 0xe8b894, 0, false, 0, d * 0.5);
    }
    // la chaise haute du maître-nageur, les douches, le kiosque à glaces ; les baigneurs
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.01, 0.2, 0.01, 0.66 + dx * 0.035, 0.025, 0.52 + dz * 0.035, C.white);
    for (let y = 0.07; y < 0.2; y += 0.05) p.box(0.08, 0.006, 0.006, 0.66, y, 0.56, C.white);
    p.box(0.09, 0.012, 0.09, 0.66, 0.225, 0.52, 0xd84a3e); seated(p, 0.66, 0.237, 0.52, -Math.PI / 2, 0xd84a3e, 0x8a5a3a);
    for (const x of [-0.7, -0.63]) { p.cyl(0.006, 0.006, 0.24, 4, x, 0.025, -0.03, C.metal); p.box(0.04, 0.006, 0.012, x, 0.255, -0.015, C.metal); p.cyl(0.02, 0.02, 0.004, 8, x, 0.025, -0.01, 0x8a8f96); }
    p.box(0.16, 0.14, 0.1, 0.58, 0.025, 0.78, C.white); p.box(0.14, 0.05, 0.006, 0.58, 0.075, 0.727, 0x9fc4dc, 0, true);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.04, 0.008, 0.08), 0.52 + k * 0.04, 0.17, 0.715, k % 2 ? C.white : 0xf28aa8, 0, false, 0, -0.4);
    p.add(new THREE.ConeGeometry(0.02, 0.06, 6).rotateX(Math.PI), 0.58, 0.195, 0.79, 0xd8a060); p.sphere(0.024, 0.58, 0.24, 0.79, 0xf2a6c8);
    seated(p, -0.6, 0.065, 0.79, 0, 0xf2c23a, 0x8a5a3a); seated(p, -0.24, 0.065, 0.79, 0, 0x3a6ab8);
    figure(p, 0.66, 0.66, 0xf2785a, -0.3, false, 0x4a3426); figure(p, -0.1, 0.73, 0x3fa8c8, 3.4, false, 0x2a2420);
    figure(p, 0.5, -0.12, 0xd84a3e, -2.6, false, 0xc8a070, 'cheer');
  }
}

/** Taverne (1 × 1) : la taverne à colombages de KayKit et sa terrasse ; brasserie de brique ; café vitré */
function tavern(p: Parts, age: number, o: ModelOpts) {
  sink(0.012);
  if (age <= 2) {
    {
      p.box(0.6, 0.26, 0.46, 0, 0.012, -0.12, C.stone); p.box(0.62, 0.22, 0.48, 0, 0.27, -0.12, C.cream);
      timbers(p, 0, 0.122, 0.62, 0.28, 0.49, 0, 4);
      roof(p, 0, 0.49, -0.12, { w: 0.62, d: 0.48, h: 0.26, color: 0x8a5a44, wall: C.cream, courses: true });
      windows(p, [-0.18, 0.18], 0.1, 0.112, 0.08, 0.09); p.box(0.12, 0.2, 0.02, 0, 0.012, 0.112, C.door);
    }
    // lanterne, tonneaux, table et bancs devant
    p.box(0.03, 0.04, 0.03, -0.22, 0.24, 0.33, C.flame, 0, true); p.box(0.012, 0.012, 0.05, -0.22, 0.29, 0.31, C.darkwood);
    for (const [x, z] of [[0.36, 0.28], [0.42, 0.38]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0.012, z, 0x9a6a44); for (const y of [0.03, 0.08]) p.cyl(0.042, 0.042, 0.008, 8, x, y, z, 0x6f5640); }
    p.box(0.22, 0.02, 0.1, -0.2, 0.08, 0.4, C.wood); for (const s of [-1, 1]) p.box(0.22, 0.02, 0.04, -0.2, 0.05, 0.4 + s * 0.09, C.darkwood);
    for (const s of [-1, 1]) p.box(0.02, 0.07, 0.08, -0.2 + s * 0.09, 0.012, 0.4, C.darkwood);
    p.cyl(0.012, 0.012, 0.025, 6, -0.25, 0.1, 0.39, C.gold); p.cyl(0.012, 0.012, 0.025, 6, -0.15, 0.1, 0.41, C.gold);
  } else if (age === 3) {
    // brasserie : brique sur deux niveaux, grandes vitrines, store rayé sur la terrasse, enseigne
    const brick = 0xb4685c;
    p.box(0.7, 0.5, 0.5, 0, 0.012, -0.16, brick);
    stones(p, 0, 0.09, 0.7, 0.012, 0.51, 0, dark(brick, 0.86), 0.45, 94);
    for (const y of [0.26, 0.5]) p.box(0.72, 0.025, 0.52, 0, y, -0.16, C.cream);
    roof(p, 0, 0.51, -0.16, { w: 0.7, d: 0.5, h: 0.18, color: C.slate, wall: brick, courses: true });
    p.box(0.07, 0.2, 0.07, 0.22, 0.62, -0.28, brick); smoke(0.22, 0.84, -0.28, 0);
    windows(p, [-0.2, 0.2], 0.05, 0.1, 0.18, 0.16, C.cream); windows(p, [-0.2, 0, 0.2], 0.31, 0.1, 0.08, 0.12, C.cream);
    p.box(0.1, 0.2, 0.02, 0, 0.012, 0.1, 0x3f5a4a);
    p.box(0.4, 0.05, 0.012, 0, 0.42, 0.1, C.cream); for (let k = 0; k < 6; k++) p.box(0.03, 0.025, 0.006, -0.125 + k * 0.05, 0.433, 0.108, 0x3c3530);
    for (let k = 0; k < 8; k++) {
      p.add(new THREE.BoxGeometry(0.09, 0.01, 0.14), -0.315 + k * 0.09, 0.27, 0.165, k % 2 ? C.white : 0xc85a4e, 0, false, 0, 0.45);
      for (const t of [-0.025, 0.025]) p.add(new THREE.ConeGeometry(0.022, 0.035, 3).rotateZ(Math.PI), -0.315 + k * 0.09 + t, 0.225, 0.23, k % 2 ? C.white : 0xc85a4e);
    }
    for (const x of [-0.24, 0.24]) { p.cyl(0.05, 0.05, 0.01, 10, x, 0.1, 0.34, C.white); p.cyl(0.008, 0.012, 0.09, 5, x, 0.012, 0.34, 0x3c4a44); for (const s of [-1, 1]) p.box(0.04, 0.06, 0.04, x + s * 0.08, 0.012, 0.34, 0x3c4a44); }
    for (const [x, z] of [[0.42, 0.04], [0.42, -0.06]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0.012, z, 0x9a6a44); p.cyl(0.042, 0.042, 0.008, 8, x, 0.05, z, 0x6f5640); }
  } else {
    // café au pied d'un immeuble : rez-de-chaussée vitré sous un store rayé, enseigne lumineuse, étage d'habitation à
    // balcon et jardinières, toit plat et sa corniche ; terrasse de tables rondes sous les parasols, guirlande de lampions,
    // ardoise du menu, pots de plantes, vélo
    const wall = 0xe8dccb, trim = 0xd2c4ae;
    p.box(0.66, 0.6, 0.46, 0, 0.012, -0.18, wall);
    p.box(0.68, 0.025, 0.48, 0, 0.3, -0.18, trim);
    p.box(0.7, 0.03, 0.5, 0, 0.612, -0.18, 0x5d6878);
    p.box(0.7, 0.02, 0.5, 0, 0.6, -0.18, trim);
    for (const x of [-0.22, 0, 0.22]) p.box(0.2, 0.22, 0.012, x, 0.04, 0.054, C.glass, 0, true);
    for (const x of [-0.33, -0.11, 0.11, 0.33]) p.box(0.016, 0.26, 0.018, x, 0.03, 0.058, C.darkwood);
    // enseigne et ses lettres qui s'éclairent
    p.box(0.42, 0.05, 0.016, 0, 0.265, 0.062, C.darkwood); for (let k = 0; k < 5; k++) p.box(0.04, 0.028, 0.006, -0.12 + k * 0.06, 0.276, 0.072, 0xffe8b0, 0, true);
    // store rayé vert et crème, lambrequin
    for (let k = 0; k < 8; k++) p.add(new THREE.BoxGeometry(0.083, 0.012, 0.15), -0.29 + k * 0.083, 0.27, 0.13, k % 2 ? 0xf4ecd8 : 0x3f7a5a, 0, false, 0, 0.42);
    for (let k = 0; k < 16; k++) p.add(new THREE.ConeGeometry(0.022, 0.03, 3).rotateX(Math.PI), -0.31 + k * 0.041, 0.225, 0.196, k % 2 ? 0xf4ecd8 : 0x3f7a5a);
    // étage : fenêtres à encadrement, porte-fenêtre et balcon à garde-corps, jardinières fleuries
    for (const x of [-0.22, 0.22]) { p.box(0.12, 0.15, 0.012, x, 0.38, 0.054, C.win, 0, true); p.box(0.14, 0.018, 0.02, x, 0.37, 0.058, trim); p.box(0.14, 0.012, 0.02, x, 0.535, 0.058, trim); p.box(0.13, 0.03, 0.03, x, 0.345, 0.075, C.terracotta); for (let k = 0; k < 4; k++) p.sphere(0.014, x - 0.045 + k * 0.03, 0.385, 0.08, [C.pink, 0xd84a3e, C.butter, C.lav][k], 0, 0.8); }
    p.box(0.13, 0.2, 0.012, 0, 0.33, 0.054, C.win, 0, true);
    p.box(0.2, 0.015, 0.08, 0, 0.33, 0.09, trim);
    for (let k = 0; k < 6; k++) p.box(0.006, 0.07, 0.006, -0.09 + k * 0.036, 0.345, 0.126, 0x3c4a44);
    p.box(0.2, 0.008, 0.008, 0, 0.415, 0.126, 0x3c4a44);
    // terrasse : tables rondes, chaises, parasols, guirlande de lampions entre deux poteaux
    for (const [x, z, c] of [[-0.26, 0.3, 0xf2c84b], [0.06, 0.36, 0xf2785a], [0.32, 0.28, 0x8cc4e8]] as [number, number, number][]) {
      p.cyl(0.04, 0.04, 0.008, 10, x, 0.08, z, C.white); p.cyl(0.006, 0.01, 0.07, 5, x, 0.012, z, C.metal);
      for (const sd of [-1, 1]) { p.box(0.035, 0.05, 0.035, x + sd * 0.065, 0.012, z, 0x3c4a44); p.box(0.035, 0.04, 0.006, x + sd * 0.08, 0.062, z, 0x3c4a44); }
      p.cyl(0.004, 0.004, 0.24, 4, x, 0.012, z, C.metal); p.cone(0.1, 0.05, 8, x, 0.24, z, c);
      p.sphere(0.008, x + 0.015, 0.09, z, C.white, 0); p.cyl(0.006, 0.006, 0.02, 5, x - 0.015, 0.088, z, 0xd84a3e);
    }
    for (const x of [-0.45, 0.45]) p.cyl(0.006, 0.006, 0.32, 4, x, 0.012, 0.44, 0x3c4a44);
    for (let k = 0; k < 9; k++) { const t = k / 8, x = -0.45 + t * 0.9, y = 0.32 - Math.sin(t * Math.PI) * 0.04; p.sphere(0.01, x, y, 0.44, [0xffe2a0, 0xff9a6a, 0xfff0c0][k % 3], 0); p.box(0.004, 0.004, 0.004, x, y, 0.44, 0xffe2a0, 0, true); }
    for (let k = 0; k < 8; k++) { const t = (k + 0.5) / 8; p.box(0.11, 0.003, 0.003, -0.45 + t * 0.9, 0.32 - Math.sin(t * Math.PI) * 0.04 + 0.005, 0.44, 0x2a2a2a); }
    // ardoise du menu, plantes, vélo
    p.add(new THREE.BoxGeometry(0.06, 0.09, 0.008), 0.18, 0.012, 0.14, 0x2e3438, 0, false, 0, -0.25); p.box(0.04, 0.003, 0.004, 0.18, 0.065, 0.143, C.white);
    for (const x of [-0.42, 0.42]) { p.cyl(0.035, 0.03, 0.06, 7, x, 0.012, 0.12, C.terracotta); p.sphere(0.045, x, 0.1, 0.12, C.darkgreen, 0, 0.9); }
    for (const d of [-0.04, 0.04]) p.add(new THREE.TorusGeometry(0.025, 0.005, 4, 10).rotateY(Math.PI / 2), -0.42, 0.04, -0.28 + d, 0x3c3c40);
    p.box(0.005, 0.005, 0.08, -0.42, 0.05, -0.28, 0x3c7fd8);
  }
}

/**
 * Mine (2 × 2) : l'entrée de KayKit dans sa butte, rails, wagonnet de minerai et tas de pierres ; chevalement d'acier dont
 * les molettes tournent, salle des machines et terril ; carrière moderne : tapis roulant, concasseur, tas de gravier, engins
 */
function mine(p: Parts, age: number) {
  const ore = (x: number, y: number, z: number, s = 1) => {
    for (let k = 0; k < 6; k++) p.sphere(0.03 * s, x + Math.sin(k * 2.1) * 0.035 * s, y + (k > 3 ? 0.03 * s : 0), z + Math.cos(k * 1.7) * 0.03 * s, k % 3 ? C.darkstone : 0xb87a4a, 0, 0.8);
  };
  const cart = (x: number, z: number, ry: number) => {
    p.box(0.12, 0.07, 0.09, x, 0.04, z, 0x6f5640, ry);
    for (const s of [-1, 1]) for (const t of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8).rotateX(Math.PI / 2), x + Math.cos(ry) * s * 0.04 + Math.sin(ry) * t * 0.05, 0.03, z - Math.sin(ry) * s * 0.04 + Math.cos(ry) * t * 0.05, C.metal);
    ore(x, 0.11, z, 0.9);
  };
  const track = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), n = Math.round(len / 0.07);
    for (let i = 0; i <= n; i++) p.box(0.03, 0.012, 0.12, x0 + ((x1 - x0) * i) / n, 0.012, z0 + ((z1 - z0) * i) / n, C.darkwood, ry);
    for (const s of [-1, 1]) p.box(len, 0.014, 0.012, (x0 + x1) / 2 - Math.sin(ry) * s * 0.04, 0.024, (z0 + z1) / 2 - Math.cos(ry) * s * 0.04, C.metal, ry);
  };
  if (age <= 2) {
    p.box(1.84, 0.012, 1.84, 0, 0, 0, 0xa89a80);
    {
      p.sphere(0.6, -0.12, 0, -0.4, C.darkstone, 1, 0.7);
      p.box(0.26, 0.3, 0.1, -0.12, 0, 0.12, 0x2a2018);
      for (const s of [-1, 1]) p.box(0.04, 0.32, 0.04, -0.12 + s * 0.14, 0, 0.14, C.wood);
      p.box(0.34, 0.04, 0.05, -0.12, 0.32, 0.14, C.wood);
    }
    track(-0.12, 0.3, 0.5, 0.75);
    cart(0.22, 0.53, -0.62);
    for (const [x, z, s] of [[0.62, 0.32, 1.6], [0.74, 0.12, 1.2]]) ore(x, 0.012, z, s);
    for (const [x, z] of [[-0.62, 0.52], [-0.5, 0.62]]) p.box(0.1, 0.08, 0.1, x, 0.012, z, 0xb48a5e, x * 3);
    for (const d of [0, 0.05]) { p.box(0.01, 0.2, 0.01, -0.72 + d, 0.012, 0.3, C.wood, 0, false, 0.15); p.box(0.07, 0.014, 0.014, -0.7 + d, 0.2, 0.3, C.metal); }
    for (const [x, z] of [[0.3, 0.86], [-0.42, 0.24]]) { p.box(0.016, 0.28, 0.016, x, 0.012, z, C.darkwood); p.box(0.034, 0.042, 0.034, x, 0.28, z, C.flame, 0, true); }
  } else if (age === 3) {
    p.box(1.84, 0.012, 1.84, 0, 0, 0, 0x8a8478);
    // chevalement : quatre montants d'acier entretoisés, plateforme, deux molettes qui tournent
    const hx = -0.3, hz = 0.0, top = 1.02;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.03, top, 0.03).translate(0, top / 2, 0), hx + sx * 0.14, 0.012, hz + sz * 0.14, 0x4a5560, 0, false, -sx * 0.05, sz * 0.05);
    for (let y = 0.2; y < top; y += 0.2) for (const s of [-1, 1]) { p.box(0.28, 0.016, 0.016, hx, y, hz + s * 0.14 * (1 - y / 3), 0x4a5560); p.box(0.016, 0.016, 0.28, hx + s * 0.14 * (1 - y / 3), y, hz, 0x4a5560); }
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, 0.6, 0.02), hx + s * 0.1, 0.5, hz + 0.3, 0x4a5560, 0, false, 0, -0.6);
    p.box(0.3, 0.025, 0.3, hx, top, hz, 0x3c4650);
    const w = spinner([hx, top + 0.11, hz], [1, 0, 0], 1.6);
    for (const dx of [-0.06, 0.06]) {
      w.add(new THREE.TorusGeometry(0.1, 0.012, 4, 16).rotateY(Math.PI / 2), dx, 0, 0, 0xc84a3e);
      for (let k = 0; k < 4; k++) w.add(new THREE.BoxGeometry(0.008, 0.2, 0.012).rotateX((k * Math.PI) / 4), dx, 0, 0, 0xc84a3e);
    }
    w.add(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6).rotateZ(Math.PI / 2), 0, 0, 0, C.metal);
    for (const s of [-1, 1]) p.box(0.02, 0.12, 0.02, hx + s * 0.1, top, hz, 0x3c4650);
    p.box(0.2, 0.2, 0.2, hx, 0.012, hz, 0x5a4a40);
    // salle des machines de brique, haute cheminée qui fume, câbles vers les molettes
    const brick = 0xa85e50;
    p.box(0.6, 0.38, 0.4, 0.42, 0.012, -0.5, brick);
    stones(p, 0.42, -0.3, 0.6, 0.012, 0.39, 0, dark(brick, 0.86), 0.45, 95);
    roof(p, 0.42, 0.39, -0.5, { w: 0.6, d: 0.4, h: 0.14, color: C.slate, wall: brick, courses: true });
    windows(p, [0.27, 0.57], 0.12, -0.29, 0.08, 0.14, C.cream);
    p.cyl(0.05, 0.065, 1.0, 8, 0.72, 0.012, -0.72, brick); smoke(0.72, 1.04, -0.72, 2);
    for (const dx of [-0.06, 0.06]) {
      const a = new THREE.Vector3(0.3 + dx, 0.4, -0.32), b = new THREE.Vector3(hx + dx, top + 0.11, hz + 0.1), d = b.clone().sub(a), L = d.length();
      p.add(new THREE.CylinderGeometry(0.004, 0.004, L, 4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0x2a2a2a);
    }
    // terril strié, wagonnets, rails
    p.cone(0.36, 0.44, 8, 0.5, 0.012, 0.48, 0x3a3634);
    for (const [y, r] of [[0.1, 0.285], [0.22, 0.19]]) p.cyl(r - 0.03, r + 0.005, 0.03, 8, 0.5, y, 0.48, 0x4a4440);
    track(-0.3, 0.18, -0.3, 0.86); cart(-0.3, 0.5, Math.PI / 2); cart(-0.3, 0.72, Math.PI / 2);
    for (const [x, z] of [[-0.75, -0.5], [0.0, 0.84]]) { p.cyl(0.012, 0.016, 0.42, 6, x, 0.012, z, 0x3c4a44); p.box(0.05, 0.06, 0.05, x, 0.43, z, 0xffe2a0, 0, true); }
  } else {
    p.box(1.84, 0.012, 1.84, 0, 0, 0, 0xb8b0a0);
    // carrière : gradins de roche taillée au fond, concasseur, tapis roulant vers le tas de gravier, pelleteuse et camion
    for (let k = 0; k < 3; k++) p.box(1.7 - k * 0.3, 0.16, 0.36 - k * 0.04, 0, 0.012 + k * 0.16, -0.72 + k * 0.04, dark(0xb0a898, 1 - k * 0.06));
    stones(p, 0, -0.54, 1.7, 0.012, 0.17, 0, 0xb0a898, 0.5, 96);
    p.box(0.3, 0.3, 0.26, -0.45, 0.012, -0.08, 0xd8b84a); p.box(0.18, 0.12, 0.18, -0.45, 0.31, -0.08, 0x8a8478);
    p.add(new THREE.BoxGeometry(0.7, 0.03, 0.08), -0.02, 0.26, 0.04, 0x3c3c3c, 0, false, -0.4);
    for (const x of [-0.2, 0.15]) p.box(0.02, x < 0 ? 0.24 : 0.12, 0.02, x, 0.012, 0.04, C.metal);
    p.cone(0.3, 0.3, 9, 0.42, 0.012, 0.2, 0xa8a090); p.cone(0.2, 0.2, 8, 0.66, 0.012, 0.66, 0xc89a6a);
    p.box(0.22, 0.08, 0.14, -0.3, 0.04, 0.6, 0xf2c84b); p.box(0.1, 0.08, 0.12, -0.36, 0.12, 0.6, 0x3c4a54);
    p.add(new THREE.BoxGeometry(0.24, 0.025, 0.03), -0.14, 0.2, 0.6, 0xf2c84b, 0, false, 0.5);
    p.box(0.07, 0.05, 0.06, -0.02, 0.2, 0.6, 0x5a5a5a);
    for (const s of [-1, 1]) p.box(0.24, 0.04, 0.03, -0.3, 0.012, 0.6 + s * 0.06, 0x2a2a2a);
    p.box(0.3, 0.1, 0.16, 0.2, 0.06, 0.82, 0xf2c84b); p.box(0.1, 0.1, 0.15, 0.4, 0.06, 0.82, 0xe8a83a);
    for (const x of [0.12, 0.3, 0.42]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8).rotateX(Math.PI / 2), x, 0.04, 0.82 + s * 0.08, 0x2a2a2a);
    ore(0.2, 0.16, 0.82, 1.3);
    p.box(0.32, 0.18, 0.16, 0.66, 0.012, -0.12, C.white); p.box(0.08, 0.06, 0.01, 0.6, 0.08, -0.039, C.glass, 0, true);
    // la base vie : deux bungalows empilés (porte, bandeau vitré, ventilation), escalier et palier, enseigne de la carrière
    p.box(0.05, 0.12, 0.006, 0.76, 0.012, -0.037, 0x5d6878);
    p.box(0.32, 0.15, 0.16, 0.66, 0.192, -0.12, 0x3a6ab8); p.box(0.33, 0.012, 0.17, 0.66, 0.342, -0.12, 0x2c4a7a);
    p.box(0.18, 0.06, 0.006, 0.61, 0.215, -0.038, C.glass, 0, true); p.box(0.05, 0.11, 0.006, 0.77, 0.192, -0.037, 0x5d6878);
    hvac(p, 0.6, 0.354, -0.14, 0.09);
    p.add(new THREE.BoxGeometry(0.24, 0.01, 0.05), 0.6, 0.1, 0.0, 0x8a8f96, 0, false, 0.72); p.add(new THREE.BoxGeometry(0.24, 0.006, 0.006), 0.6, 0.16, 0.024, 0xf2c23a, 0, false, 0.72);
    p.box(0.12, 0.008, 0.06, 0.76, 0.185, 0.0, 0x8a8f96);
    p.box(0.18, 0.045, 0.006, 0.61, 0.288, -0.032, 0xf4f2ee); for (let k = 0; k < 5; k++) p.box(0.022, 0.024, 0.004, 0.546 + k * 0.032, 0.298, -0.028, 0x2c4a7a);
    // foreuse sur le gradin du haut : chenilles, cabine, mât et sa tige
    for (const s of [-1, 1]) p.box(0.14, 0.03, 0.025, 0.3, 0.492, -0.66 + s * 0.04, 0x2a2a2a);
    p.box(0.12, 0.06, 0.08, 0.3, 0.522, -0.66, 0xf2c84b); p.box(0.05, 0.05, 0.06, 0.26, 0.582, -0.66, 0x3c4a54);
    p.add(new THREE.BoxGeometry(0.03, 0.34, 0.03).translate(0, 0.17, 0), 0.36, 0.53, -0.66, 0xe8a83a, 0, false, -0.15);
    p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4).translate(0, 0.18, 0), 0.38, 0.49, -0.66, C.metal, 0, false, -0.15);
    // projecteurs du chantier, pickup du chef, toilettes de chantier, blocs tombés des gradins
    floodlight(p, -0.88, -0.35, 0.7); floodlight(p, 0.88, 0.3, 0.7);
    car(p, 0.8, -0.38, Math.PI / 2, 0xe8e4dc); p.box(0.03, 0.012, 0.11, 0.78, 0.137, -0.38, 0xf28a3c, 0, true);
    p.box(0.08, 0.17, 0.08, -0.84, 0.012, 0.3, 0x4fa860); p.box(0.09, 0.012, 0.09, -0.84, 0.182, 0.3, C.white); p.box(0.04, 0.12, 0.004, -0.84, 0.03, 0.342, 0x3c8a50);
    for (const [x, z, s] of [[-0.7, -0.45, 0.06], [-0.58, -0.4, 0.04], [0.55, -0.47, 0.05], [0.05, -0.46, 0.035]]) p.add(new THREE.IcosahedronGeometry(s, 0).scale(1.2, 0.8, 1), x, 0.012 + s * 0.5, z, dark(0xb0a898, 0.9 + s), x * 4);
    // clôture grillagée sur la rue (le portail ouvert devant le camion), panneaux de danger
    for (const [x0, x1] of [[-0.92, -0.12], [0.62, 0.92]]) {
      const n = Math.round((x1 - x0) / 0.2);
      for (let k = 0; k <= n; k++) p.box(0.012, 0.16, 0.012, x0 + ((x1 - x0) * k) / n, 0.012, 0.92, 0x5d6878);
      p.box(x1 - x0, 0.13, 0.003, (x0 + x1) / 2, 0.025, 0.92, 0x9aa3ad); p.box(x1 - x0, 0.008, 0.008, (x0 + x1) / 2, 0.165, 0.92, 0x5d6878);
    }
    for (const [x, c] of [[-0.7, 0xf2c23a], [-0.5, 0xd84a3e], [0.75, 0xf2c23a]] as [number, number][]) { p.box(0.07, 0.07, 0.004, x, 0.06, 0.926, C.white); p.box(0.05, 0.05, 0.004, x, 0.07, 0.929, c); }
    // les ouvriers en gilet orange et casque
    for (const [x, z, r, h] of [[-0.05, 0.28, 2.6, 0xf2f2ee], [0.75, 0.38, -2.2, 0xf2c23a], [-0.6, 0.2, 0.8, 0xf2c23a], [0.1, 0.62, 0.3, 0xf2f2ee]]) figure(p, x, z, 0xf28a3c, r, false, h);
  }
}

/** Observatoire (1 × 1) : tour blanche à coupole d'argent qui tourne lentement, fente ouverte sur la lunette ; annexe et antenne */
/**
 * Avant-poste (2 × 2) devant une grotte ou une faille, d'où partent les troupes armées vers les profondeurs : palissade de
 * pieux, tour de guet, tentes, feu de camp, table aux plans, râtelier d'armes ; muraille de pierre, tour crénelée, caserne et
 * wagonnets à l'âge industriel ; clôture grillagée, conteneurs, préfabriqués et projecteurs ensuite
 */
function outpost(p: Parts, age: number) {
  const R = 0.82, y0 = 0.018;
  const crate = (x: number, z: number, s = 1, ry = 0, y = y0) => { p.box(0.1 * s, 0.09 * s, 0.1 * s, x, y, z, 0xb48a5e, ry); for (const d of [-0.035, 0.035]) p.box(0.104 * s, 0.09 * s + 0.002, 0.014, x + Math.sin(ry) * d * s, y - 0.001, z + Math.cos(ry) * d * s, dark(0xb48a5e, 0.75), ry); };
  const barrel = (x: number, z: number) => { p.cyl(0.035, 0.035, 0.09, 8, x, y0, z, 0x9a6a44); for (const y of [0.02, 0.065]) p.cyl(0.037, 0.037, 0.008, 8, x, y0 + y, z, 0x5a5050); };
  const torch = (x: number, z: number, h = 0.3) => { p.box(0.016, h, 0.016, x, y0, z, C.darkwood); p.cyl(0.022, 0.014, 0.025, 6, x, y0 + h, z, 0x4a3a2e); p.box(0.026, 0.04, 0.026, x, y0 + h + 0.022, z, C.flame, 0, true); };
  const flag = (x: number, y: number, z: number, h: number, c: number, pole = C.darkwood) => { p.cyl(0.007, 0.009, h, 5, x, y, z, pole); p.box(0.006, 0.09, 0.15, x, y + h - 0.1, z + 0.075, c); p.box(0.008, 0.022, 0.15, x, y + h - 0.06, z + 0.075, C.gold); p.sphere(0.012, x, y + h + 0.005, z, C.gold); };
  const lamp = (x: number, z: number, h: number) => { p.cyl(0.008, 0.012, h, 6, x, y0, z, 0x3c4a44); p.box(0.045, 0.05, 0.045, x, y0 + h, z, 0xffe2a0, 0, true); p.pyramid(0.06, 0.03, 0.06, x, y0 + h + 0.05, z, 0x3c4a44); };
  // herbe autour, sol battu dans l'enceinte, chemin vers la porte
  p.box(1.84, 0.012, 1.84, 0, 0, 0, age >= 4 ? 0x9cae84 : 0x9cb86c);
  p.box(2 * R, 0.006, 2 * R, 0, 0.012, 0, age >= 4 ? 0xb8b2a6 : 0xb49e7c);
  p.box(0.34, 0.006, 0.92 - R + 0.02, 0, 0.012, (R + 0.92) / 2, age >= 4 ? 0x8a8a88 : 0xb49e7c);
  for (let i = 0; i < 9; i++) { const r = 0.04 + hash2(i, 1, 91) * 0.05; p.cyl(r, r + 0.01, 0.003, 7, -0.7 + hash2(i, 2, 91) * 1.4, 0.018, -0.7 + hash2(i, 3, 91) * 1.4, dark(age >= 4 ? 0xb8b2a6 : 0xb49e7c, 0.88 + hash2(i, 4, 91) * 0.1)); }
  if (age <= 2) {
    // palissade de pieux appointés, traverses, porte entre deux grands poteaux ; les battants ouverts vers l'intérieur
    let n = 0;
    const stake = (x: number, z: number) => { const h = 0.28 + hash2(n, 7, 90) * 0.06, c = dark(C.wood, 0.78 + hash2(n++, 8, 90) * 0.2); p.cyl(0.03, 0.034, h, 6, x, y0, z, c); p.cone(0.03, 0.06, 6, x, y0 + h, z, dark(c, 0.8)); };
    for (let t = -R; t <= R + 1e-6; t += 0.066) { stake(t, -R); stake(-R, t); stake(R, t); if (Math.abs(t) > 0.2) stake(t, R); }
    for (const y of [0.08, 0.22]) {
      p.box(2 * R, 0.022, 0.02, 0, y, -R + 0.04, C.darkwood); for (const s of [-1, 1]) p.box(0.02, 0.022, 2 * R, s * (R - 0.04), y, 0, C.darkwood);
      for (const s of [-1, 1]) p.box(R - 0.2, 0.022, 0.02, s * (R + 0.2) / 2, y, R - 0.04, C.darkwood);
    }
    for (const s of [-1, 1]) { p.cyl(0.04, 0.045, 0.5, 7, s * 0.22, y0, R, C.darkwood); p.cone(0.042, 0.06, 7, s * 0.22, y0 + 0.5, R, dark(C.darkwood, 0.8)); }
    p.box(0.5, 0.04, 0.05, 0, 0.44, R, C.darkwood);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10).rotateX(Math.PI / 2), 0, 0.4, R + 0.03, 0xb8342c); p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 8).rotateX(Math.PI / 2), 0, 0.4, R + 0.032, C.gold);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) p.box(0.06, 0.28, 0.022, s * (0.2 - 0.04 - k * 0.06 * Math.cos(1.1)), y0, R - 0.03 - k * 0.06 * Math.sin(1.1), dark(C.wood, 0.85), s * 1.1);
    for (const s of [-1, 1]) torch(s * 0.3, R + 0.07, 0.32);
    // tour de guet : quatre poteaux, croisillons, plateforme à garde-corps, toit de bardeaux, échelle, brasero, bannière
    const tx = -0.46, tz = -0.46, th = 0.6, top = th + 0.24;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.032, top, 0.032).translate(0, top / 2, 0), tx + sx * 0.14, y0, tz + sz * 0.14, C.darkwood, 0, false, sx * 0.03, -sz * 0.03);
    for (const y of [0.18, 0.4]) for (const s of [-1, 1]) { p.box(0.3, 0.02, 0.02, tx, y, tz + s * 0.135, C.wood); p.box(0.02, 0.02, 0.3, tx + s * 0.135, y, tz, C.wood); }
    for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.36, 0.018, 0.016), tx, 0.29, tz + s * 0.137, C.wood, 0, false, s * 0.7); p.add(new THREE.BoxGeometry(0.016, 0.018, 0.36), tx + s * 0.137, 0.29, tz, C.wood, 0, false, 0, s * 0.7); }
    p.box(0.38, 0.03, 0.38, tx, th, tz, C.wood);
    for (const s of [-1, 1]) { p.box(0.38, 0.1, 0.014, tx, th + 0.03, tz + s * 0.183, dark(C.wood, 0.9)); p.box(0.014, 0.1, 0.38, tx + s * 0.183, th + 0.03, tz, dark(C.wood, 0.9)); }
    p.pyramid(0.46, 0.18, 0.46, tx, top, tz, 0x8a5a44);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.018, th + 0.05, 0.018).translate(0, (th + 0.05) / 2, 0), tx + s * 0.05, y0, tz + 0.2, C.wood, 0, false, 0, 0.12);
    for (let y = 0.08; y < th; y += 0.07) p.box(0.1, 0.012, 0.014, tx, y, tz + 0.2 + y * 0.12, C.wood);
    p.cyl(0.03, 0.022, 0.04, 7, tx + 0.11, th + 0.03, tz - 0.11, 0x3c3c40); p.box(0.03, 0.04, 0.03, tx + 0.11, th + 0.07, tz - 0.11, C.flame, 0, true);
    flag(tx, top + 0.17, tz, 0.26, 0xb8342c);
    // tentes de toile rayée, mât et piquets
    for (const [x, z] of [[0.42, -0.5], [0.56, -0.06]]) {
      p.gable(0.42, 0.24, 0.3, x, y0, z, 0xe8dcc0, Math.PI / 2);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.004, 0.17, 0.43).translate(0, 0, 0), x + s * 0.075, y0 + 0.12, z, 0xc8443a, 0, false, s * 0.89);
      p.box(0.012, 0.29, 0.012, x, y0, z + 0.21, C.darkwood);
      p.add(new THREE.BoxGeometry(0.09, 0.15, 0.004), x, y0 + 0.07, z + 0.212, 0x5a4a3a);
      for (const s of [-1, 1]) p.box(0.012, 0.03, 0.012, x + s * 0.2, y0, z + 0.2, C.darkwood);
    }
    // feu de camp cerclé de pierres, bûches pour s'asseoir ; table aux plans et tabouret ; râtelier de lances ; vivres
    const fx = 0.06, fz = 0.12;
    for (let k = 0; k < 8; k++) p.sphere(0.025, fx + Math.cos(k * 0.785) * 0.07, y0 + 0.01, fz + Math.sin(k * 0.785) * 0.07, C.darkstone, 0, 0.7);
    for (const r of [0.4, 1.9]) p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 6).rotateZ(Math.PI / 2), fx, y0 + 0.02, fz, C.darkwood, r);
    p.cone(0.035, 0.08, 6, fx, y0 + 0.02, fz, C.flame, true); smoke(fx, 0.16, fz, 0);
    for (const [x, z, r] of [[fx - 0.2, fz, 0], [fx + 0.2, fz + 0.04, 0.3], [fx, fz + 0.2, 1.4]]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 7).rotateZ(Math.PI / 2), x, y0 + 0.03, z, C.wood, Math.PI / 2 + r);
    const mx = -0.44, mz = 0.14;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.016, 0.12, 0.016, mx + dx * 0.1, y0, mz + dz * 0.06, C.darkwood);
    p.box(0.24, 0.02, 0.16, mx, y0 + 0.12, mz, C.wood); p.box(0.17, 0.004, 0.11, mx, y0 + 0.14, mz, C.cream, 0.15);
    for (const [dx, dz, c] of [[-0.04, 0.02, 0xb8342c], [0.03, -0.02, 0x3c3530], [0.05, 0.03, 0xb8342c]] as [number, number, number][]) p.box(0.012, 0.012, 0.012, mx + dx, y0 + 0.144, mz + dz, c);
    p.cyl(0.03, 0.03, 0.08, 7, mx, y0, mz + 0.14, C.darkwood);
    p.box(0.34, 0.02, 0.02, -0.06, 0.2, -0.66, C.darkwood); for (const s of [-1, 1]) p.box(0.02, 0.22, 0.02, -0.06 + s * 0.16, y0, -0.66, C.darkwood);
    for (let k = 0; k < 5; k++) { const x = -0.18 + k * 0.06; p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4).translate(0, 0.18, 0), x, y0, -0.7, C.wood, 0, false, 0, 0.2); p.cone(0.012, 0.04, 4, x, y0 + 0.35, -0.63, C.metal); }
    crate(0.52, 0.52, 1, 0.2); crate(0.62, 0.62, 0.9, -0.3); crate(0.56, 0.56, 0.8, 0.5, y0 + 0.09); barrel(0.4, 0.64); barrel(-0.6, 0.58); barrel(-0.68, 0.48);
    flag(0.3, y0, 0.5, 0.52, 0x3a6ab8);
  } else if (age === 3) {
    // muraille de pierre à couronnement, porte entre deux piliers de brique coiffés de lanternes, grille de fer ouverte
    const wall = 0xb8b2a4, H = 0.24;
    for (const s of [-1, 1]) { p.box(0.08, H, 2 * R, s * (R - 0.04), y0, 0, wall); stones(p, s * R, 0, 2 * R, y0, y0 + H, s * Math.PI / 2, dark(wall, 0.86), 0.5, 300 + s); }
    p.box(2 * R, H, 0.08, 0, y0, -R + 0.04, wall);
    for (const s of [-1, 1]) { p.box(R - 0.24, H, 0.08, s * (R + 0.24) / 2, y0, R - 0.04, wall); stones(p, s * (R + 0.24) / 2, R, R - 0.24, y0, y0 + H, 0, dark(wall, 0.86), 0.5, 303 + s); }
    for (const s of [-1, 1]) { p.box(0.1, 0.025, 2 * R + 0.02, s * (R - 0.04), y0 + H, 0, C.darkstone); p.box(R - 0.22, 0.025, 0.1, s * (R + 0.24) / 2, y0 + H, R - 0.04, C.darkstone); }
    p.box(2 * R + 0.02, 0.025, 0.1, 0, y0 + H, -R + 0.04, C.darkstone);
    for (const s of [-1, 1]) {
      p.box(0.11, 0.38, 0.11, s * 0.24, y0, R - 0.04, C.darkbrick); stones(p, s * 0.24, R + 0.016, 0.11, y0, y0 + 0.38, 0, dark(C.darkbrick, 0.84), 0.5, 306 + s);
      p.box(0.13, 0.025, 0.13, s * 0.24, y0 + 0.38, R - 0.04, C.cream); lamp(s * 0.24, R - 0.04, 0.41);
      for (let k = 0; k < 4; k++) p.box(0.008, 0.22, 0.008, s * (0.18 - k * 0.025 * Math.cos(1.2)) , y0, R - 0.04 - k * 0.04 * Math.sin(1.2), 0x3c3c40);
      p.box(0.006, 0.01, 0.16, s * 0.16, y0 + 0.2, R - 0.1, 0x3c3c40, s * 0.35);
    }
    // tour de guet crénelée, lanterne au sommet, fenêtres éclairées, drapeau
    const tx = -0.46, tz = -0.46, th = 0.74;
    p.box(0.3, th, 0.3, tx, y0, tz, wall);
    stones(p, tx, tz + 0.151, 0.3, y0, y0 + th, 0, dark(wall, 0.84), 0.5, 310); stones(p, tx + 0.151, tz, 0.3, y0, y0 + th, Math.PI / 2, dark(wall, 0.84), 0.5, 311);
    p.box(0.34, 0.03, 0.34, tx, y0 + th, tz, C.darkstone);
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { p.box(0.05, 0.06, 0.04, tx - 0.12 + k * 0.08, y0 + th + 0.03, tz + s * 0.15, wall); p.box(0.04, 0.06, 0.05, tx + s * 0.15, y0 + th + 0.03, tz - 0.12 + k * 0.08, wall); }
    for (const y of [0.22, 0.48]) p.box(0.05, 0.08, 0.01, tx, y, tz + 0.152, C.win, 0, true);
    p.box(0.1, 0.16, 0.012, tx, y0, tz + 0.152, 0x4a3a2e);
    p.box(0.05, 0.06, 0.05, tx + 0.1, y0 + th + 0.03, tz - 0.1, 0xffe2a0, 0, true);
    flag(tx, y0 + th + 0.03, tz, 0.34, 0xb8342c, 0x3c3c40);
    // caserne : longue bâtisse de brique, toit d'ardoise, fenêtres et porte, cheminée qui fume
    const bx = 0.36, bz = -0.5, W = 0.62, D = 0.3, BH = 0.26;
    p.box(W, BH, D, bx, y0, bz, C.brick);
    stones(p, bx, bz + D / 2, W, y0, y0 + BH, 0, dark(C.brick, 0.86), 0.45, 312);
    for (const s of [-1, 1]) quoins(p, bx + s * W / 2, bz + D / 2, y0, y0 + BH, s, 1);
    roof(p, bx, y0 + BH, bz, { w: W, d: D, h: 0.16, color: C.slate, wall: C.brick, courses: true });
    windows(p, [bx - 0.22, bx - 0.1, bx + 0.12, bx + 0.24], 0.1, bz + D / 2 + 0.006, 0.06, 0.08, C.cream);
    p.box(0.08, 0.17, 0.012, bx + 0.01, y0, bz + D / 2 + 0.004, 0x3f5a4a);
    p.box(0.06, 0.16, 0.06, bx + 0.2, y0 + BH + 0.06, bz - 0.06, 0xa85e50); smoke(bx + 0.2, y0 + BH + 0.25, bz - 0.06, 0);
    // voie de wagonnets de la porte vers la grotte, deux wagonnets de minerai, butoir
    for (let z = -0.28; z <= 0.92; z += 0.07) p.box(0.13, 0.01, 0.028, 0, y0, z, C.darkwood);
    for (const s of [-1, 1]) p.box(0.012, 0.014, 1.2, s * 0.045, y0 + 0.01, 0.32, C.metal);
    p.box(0.12, 0.06, 0.04, 0, y0, -0.3, 0xb8342c);
    for (const z of [0.0, 0.2]) {
      p.box(0.1, 0.07, 0.13, 0, y0 + 0.03, z, 0x6f5640);
      for (const s of [-1, 1]) for (const t of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8).rotateZ(Math.PI / 2), s * 0.053, y0 + 0.025, z + t * 0.045, C.metal);
      for (let k = 0; k < 5; k++) p.sphere(0.024, Math.sin(k * 2.1) * 0.03, y0 + 0.1 + (k > 2 ? 0.02 : 0), z + Math.cos(k * 1.7) * 0.04, k % 2 ? C.darkstone : 0xb87a4a, 0, 0.8);
    }
    // table aux plans sous un auvent de toile, réverbères, caisses et tonneaux
    const mx = -0.46, mz = 0.2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.012, 0.3, 0.012, mx + dx * 0.16, y0, mz + dz * 0.12, C.darkwood);
    p.add(new THREE.BoxGeometry(0.38, 0.008, 0.3), mx, y0 + 0.3, mz, 0xd8c8a0, 0, false, 0, 0.12);
    p.box(0.24, 0.02, 0.15, mx, y0 + 0.12, mz, C.wood); p.box(0.18, 0.004, 0.11, mx, y0 + 0.14, mz, C.cream, -0.1);
    for (const x of [mx - 0.08, mx + 0.08]) p.box(0.01, 0.12, 0.01, x, y0, mz, C.darkwood);
    lamp(0.5, 0.3, 0.38); lamp(-0.6, -0.12, 0.38);
    crate(0.52, 0.56, 1, 0.2); crate(0.64, 0.66, 0.9, -0.3); crate(0.58, 0.6, 0.8, 0.5, y0 + 0.09); barrel(0.36, 0.66); barrel(0.28, 0.6); barrel(-0.62, 0.62);
  } else {
    // clôture grillagée sur poteaux d'acier, barbelés ; portail coulissant ouvert, guérite et barrière levée
    const post = (x: number, z: number) => p.cyl(0.008, 0.01, 0.36, 5, x, y0, z, 0x6a7078);
    const mesh = (x: number, z: number, len: number, ry: number) => { p.box(len, 0.3, 0.004, x, y0 + 0.03, z, 0xc8ccd0, ry); for (const y of [0.35, 0.38]) p.box(len, 0.004, 0.006, x, y0 + y, z, 0x3c3c40, ry); };
    for (let t = -R; t <= R + 1e-6; t += 0.205) { post(t, -R); post(-R, t); post(R, t); if (Math.abs(t) > 0.25) post(t, R); }
    mesh(0, -R, 2 * R, 0); for (const s of [-1, 1]) { mesh(s * R, 0, 2 * R, Math.PI / 2); mesh(s * (R + 0.26) / 2, R, R - 0.26, 0); }
    p.box(0.5, 0.3, 0.006, 0.52, y0 + 0.03, R + 0.03, 0xb0b6bc); p.box(0.5, 0.02, 0.01, 0.52, y0 + 0.33, R + 0.03, 0x6a7078);
    p.box(0.16, 0.26, 0.16, -0.38, y0, R - 0.14, C.white); p.box(0.18, 0.025, 0.18, -0.38, y0 + 0.26, R - 0.14, 0x5d6878);
    p.box(0.12, 0.07, 0.006, -0.38, y0 + 0.15, R - 0.059, C.glass, 0, true);
    p.box(0.03, 0.12, 0.03, -0.26, y0, R + 0.02, 0x3c3c40);
    p.add(new THREE.BoxGeometry(0.02, 0.4, 0.02).translate(0, 0.2, 0), -0.26, y0 + 0.11, R + 0.02, 0xd84a3e, 0, false, -0.25);
    for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.022, 0.05, 0.022), -0.26 - Math.sin(0.25) * (0.06 + k * 0.13), y0 + 0.11 + Math.cos(0.25) * (0.06 + k * 0.13), R + 0.02, C.white, 0, false, -0.25);
    // sacs de sable devant la guérite
    for (let k = 0; k < 7; k++) p.sphere(0.04, -0.62 + (k % 4) * 0.075 + (k >= 4 ? 0.035 : 0), y0 + 0.02 + (k >= 4 ? 0.04 : 0), R - 0.3, 0xc8b48a, 0, 0.55);
    // conteneurs empilés, nervurés
    const box3 = (x: number, y: number, z: number, c: number, ry = 0) => {
      p.box(0.5, 0.2, 0.2, x, y, z, c, ry);
      for (let k = 0; k < 9; k++) { const u = -0.22 + k * 0.055; for (const s of [-1, 1]) p.box(0.012, 0.19, 0.008, x + Math.cos(ry) * u - Math.sin(ry) * s * 0.102, y + 0.005, z - Math.sin(ry) * u - Math.cos(ry) * s * 0.102, dark(c, 0.82), ry); }
    };
    box3(0.44, y0, -0.62, 0xd8743a); box3(0.44, y0, -0.38, 0x3a6ab8); box3(0.44, y0 + 0.2, -0.5, 0x4a8a5a, 0.1);
    // préfabriqués blancs à bandeau vitré, antenne au feu rouge
    for (const [x, z] of [[-0.42, -0.62], [-0.42, -0.3]]) {
      p.box(0.5, 0.2, 0.22, x, y0, z, 0xeceae4); p.box(0.52, 0.02, 0.24, x, y0 + 0.2, z, 0x8a9098);
      p.box(0.4, 0.05, 0.006, x, y0 + 0.11, z + 0.112, C.glass, 0, true); p.box(0.06, 0.15, 0.006, x + 0.18, y0, z + 0.113, 0x5a6470);
    }
    p.box(0.01, 0.7, 0.01, -0.74, y0, -0.74, 0x8a9098); for (let y = 0.1; y < 0.7; y += 0.1) p.box(0.06, 0.006, 0.006, -0.74, y0 + y, -0.74, 0x8a9098);
    p.sphere(0.018, -0.74, y0 + 0.72, -0.74, 0xff5a3a);
    p.box(0.022, 0.022, 0.022, -0.74, y0 + 0.71, -0.74, 0xff4a3a, 0, true);
    // projecteurs sur mâts, braqués vers l'entrée
    for (const [x, z, ry] of [[0.72, 0.3, -2.2], [-0.12, -0.72, 0.4]]) {
      p.cyl(0.012, 0.016, 0.8, 6, x, y0, z, 0x6a7078);
      p.box(0.14, 0.02, 0.03, x, y0 + 0.8, z, 0x3c3c40, ry);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.05, 0.04, 0.03), x + Math.cos(ry) * s * 0.045, y0 + 0.8, z - Math.sin(ry) * s * 0.045, 0xfff4d0, ry, true, 0, 0.5);
    }
    // jeep, table aux plans et caisses
    const jx = 0.3, jz = 0.36;
    p.box(0.28, 0.08, 0.15, jx, y0 + 0.04, jz, 0x5a6a44); p.box(0.12, 0.06, 0.14, jx - 0.03, y0 + 0.12, jz, 0x4a5a38);
    p.box(0.006, 0.05, 0.13, jx + 0.04, y0 + 0.13, jz, C.glass);
    for (const x of [-0.09, 0.09]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateX(Math.PI / 2), jx + x, y0 + 0.035, jz + s * 0.075, 0x2a2a2a);
    p.cyl(0.035, 0.035, 0.03, 10, jx - 0.15, y0 + 0.06, jz, 0x2a2a2a, false, 0);
    p.box(0.24, 0.02, 0.15, -0.3, y0 + 0.12, 0.2, 0x8a9098); for (const s of [-1, 1]) p.box(0.012, 0.12, 0.12, -0.3 + s * 0.1, y0, 0.2, 0x6a7078);
    p.box(0.18, 0.004, 0.11, -0.3, y0 + 0.14, 0.2, C.cream, 0.1);
    crate(0.6, 0.58, 1, 0.2); crate(0.7, 0.66, 0.9, -0.3); crate(-0.64, 0.24, 1, 0.1);
    flag(0.08, y0, -0.2, 0.62, 0x3a6ab8, 0xc8ccd0);
  }
}

/** Grumes empilées en pyramide (couchées le long de x), sections claires aux bouts */
function logPile(p: Parts, x: number, z: number, n: number, len: number, ry = 0) {
  const r = 0.035;
  let k = 0;
  for (let row = 0; row < n; row++)
    for (let i = 0; i < n - row; i++, k++) {
      const u = (i - (n - row - 1) / 2) * r * 2.05, y = r + row * r * 1.75;
      const ox = Math.sin(ry) * u, oz = Math.cos(ry) * u;
      p.add(new THREE.CylinderGeometry(r, r, len, 7).rotateZ(Math.PI / 2), x + ox, y, z + oz, dark(0x7a5636, 0.9 + hash2(k, 1, 77) * 0.2), ry);
      for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.004, 7).rotateZ(Math.PI / 2), x + ox + Math.cos(ry) * s * len / 2, y, z + oz - Math.sin(ry) * s * len / 2, 0xd8b88a, ry);
    }
}

/**
 * Bûcherons (en forêt) : abri de rondins et billot à la Préhistoire, camp et cabane de planches, scierie à colombages et
 * sa grande scie, scierie à vapeur de brique qui fume, scierie mécanique au toit de tôle ; toujours des grumes et du bois débité
 */
function lumber(p: Parts, age: number) {
  p.cyl(0.46, 0.47, 0.012, 14, 0, 0, 0, 0x9cae6c);
  for (let i = 0; i < 14; i++) p.cyl(0.012, 0.016, 0.004, 5, -0.4 + hash2(i, 2, 78) * 0.8, 0.012, -0.4 + hash2(i, 3, 78) * 0.8, 0xc8a878);
  // souches et billot à la hache
  for (const [x, z] of [[0.3, 0.3], [-0.34, 0.28], [0.36, -0.06]]) { p.cyl(0.05, 0.06, 0.06, 8, x, 0.012, z, 0x7a5636); p.cyl(0.046, 0.046, 0.004, 8, x, 0.072, z, 0xd8b88a); }
  p.cyl(0.06, 0.065, 0.1, 8, 0.12, 0.012, 0.28, 0x7a5636); p.cyl(0.056, 0.056, 0.004, 8, 0.12, 0.112, 0.28, 0xd8b88a);
  p.add(new THREE.BoxGeometry(0.012, 0.14, 0.012), 0.14, 0.17, 0.28, C.darkwood, 0, false, -0.5);
  p.add(new THREE.BoxGeometry(0.05, 0.035, 0.008), 0.11, 0.115, 0.28, C.metal, 0, false, -0.5);
  if (age <= 1) {
    // appentis de rondins couvert de branchages (puis de planches), grumes, fagots
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.022, 0.42, 6).translate(0, 0.21, 0), s * 0.2, 0.012, -0.24, C.darkwood, 0, false, 0, -0.35);
    p.add(new THREE.BoxGeometry(0.5, 0.02, 0.32), 0, 0.3, -0.18, age === 0 ? 0x6f8a4a : C.wood, 0, false, 0, -0.75);
    if (age === 1) for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(0.5, 0.006, 0.05).translate(0, 0.012, -0.12 + k * 0.05), 0, 0.3, -0.18, dark(C.wood, k % 2 ? 0.85 : 1), 0, false, 0, -0.75);
    logPile(p, -0.08, -0.22, 3, 0.36);
    for (let k = 0; k < 3; k++) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6).rotateZ(Math.PI / 2), -0.3, 0.04 + k * 0.035, 0.05 + (k % 2) * 0.03, 0x8a6a3a, 0.5);
  } else if (age === 2) {
    // scierie à colombages : grande scie de long sur son chevalet, planches empilées
    p.box(0.46, 0.26, 0.28, -0.1, 0.012, -0.24, C.cream);
    timbers(p, -0.1, -0.1, 0.46, 0.012, 0.272, 0, 5, (i) => i % 2 === 1);
    roof(p, -0.1, 0.272, -0.24, { w: 0.46, d: 0.28, h: 0.16, color: 0x8a5a44, wall: C.cream, courses: true });
    p.box(0.1, 0.16, 0.012, -0.1, 0.012, -0.096, C.darkwood);
    for (const s of [-1, 1]) p.box(0.02, 0.14, 0.02, 0.22 + s * 0.08, 0.012, 0.08, C.darkwood);
    p.box(0.2, 0.025, 0.06, 0.22, 0.15, 0.08, C.wood);
    p.box(0.006, 0.18, 0.05, 0.22, 0.12, 0.08, C.metal);
    for (let k = 0; k < 4; k++) p.box(0.26, 0.014, 0.08, -0.2, 0.012 + k * 0.016, 0.12, dark(0xd8b88a, k % 2 ? 0.9 : 1), 0.1);
    logPile(p, 0.26, -0.22, 3, 0.3, Math.PI / 2);
  } else if (age === 3) {
    // scierie à vapeur : halle de brique, cheminée qui fume, scie circulaire, rail de chariot
    p.box(0.48, 0.28, 0.3, -0.08, 0.012, -0.22, C.brick);
    stones(p, -0.08, -0.07, 0.48, 0.012, 0.29, 0, dark(C.brick, 0.86), 0.45, 401);
    roof(p, -0.08, 0.292, -0.22, { w: 0.48, d: 0.3, h: 0.14, color: C.slate, wall: C.brick, courses: true });
    windows(p, [-0.22, 0.06], 0.1, -0.065, 0.07, 0.08, C.cream);
    p.box(0.12, 0.17, 0.012, -0.08, 0.012, -0.066, 0x3f5a4a);
    p.cyl(0.035, 0.045, 0.5, 8, 0.12, 0.3, -0.3, C.darkbrick); smoke(0.12, 0.84, -0.3, 2);
    p.box(0.26, 0.08, 0.1, 0.18, 0.012, 0.12, C.darkwood);
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 12).rotateX(Math.PI / 2), 0.18, 0.11, 0.12, C.metal);
    logPile(p, -0.26, 0.14, 3, 0.3);
    for (let k = 0; k < 4; k++) p.box(0.24, 0.014, 0.08, 0.26, 0.012 + k * 0.016, -0.02, dark(0xd8b88a, k % 2 ? 0.9 : 1));
  } else {
    // scierie mécanique : hangar à toit de tôle ondulée, grue à grumes, empilements bien rangés
    p.box(0.5, 0.26, 0.3, -0.08, 0.012, -0.22, 0x8a9aa6);
    for (let k = 0; k < 9; k++) p.box(0.012, 0.26, 0.302, -0.32 + k * 0.06, 0.012, -0.22, 0x7a8a96);
    p.add(new THREE.BoxGeometry(0.56, 0.02, 0.38), -0.08, 0.3, -0.22, 0x5d6878, 0, false, 0, -0.12);
    p.box(0.2, 0.18, 0.012, -0.08, 0.012, -0.068, 0x3c4650);
    p.cyl(0.015, 0.02, 0.46, 6, 0.3, 0.012, 0.0, 0xd8b84a);
    p.add(new THREE.BoxGeometry(0.4, 0.02, 0.02), 0.16, 0.46, 0.0, 0xd8b84a, 0.6);
    p.box(0.004, 0.14, 0.004, 0.0, 0.32, 0.1, 0x2a2a2a);
    logPile(p, -0.24, 0.16, 4, 0.34);
    logPile(p, 0.2, 0.22, 3, 0.3, Math.PI / 2);
    // la grume pendue au crochet, la cabine du grutier ; l'enseigne au-dessus de la porte du hangar
    p.box(0.03, 0.02, 0.02, 0.0, 0.3, 0.1, 0x3c3c40); p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 7).rotateZ(Math.PI / 2), 0.0, 0.27, 0.1, 0x7a5636);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 7).rotateZ(Math.PI / 2), s * 0.13, 0.27, 0.1, 0xd8b88a);
    p.box(0.06, 0.06, 0.06, 0.3, 0.3, 0.0, 0xd8b84a); p.box(0.04, 0.035, 0.004, 0.3, 0.315, 0.031, 0x9fc4dc, 0, true);
    p.box(0.2, 0.035, 0.006, -0.08, 0.21, -0.066, 0x3c4650); for (let k = 0; k < 6; k++) p.box(0.02, 0.02, 0.004, -0.155 + k * 0.03, 0.218, -0.062, 0xf2c84b);
    // bois débité : piles de planches sur leurs cales, cerclées ; le chariot élévateur qui en emporte une
    for (const [x, z, n] of [[0.32, -0.28, 4], [0.32, -0.14, 3]]) for (let k = 0; k < n; k++) {
      p.box(0.18, 0.024, 0.1, x, 0.012 + k * 0.032, z, dark(0xe8c890, 0.92 + (k % 2) * 0.08));
      for (const d of [-0.06, 0.06]) p.box(0.012, 0.008, 0.1, x + d, 0.036 + k * 0.032, z, 0x8a6a4a);
    }
    for (const d of [-0.04, 0.04]) p.box(0.004, 0.1, 0.104, 0.32 + d, 0.012, -0.28, 0x3c3c40);
    p.box(0.08, 0.05, 0.1, 0.4, 0.03, 0.18, 0xe8a83a);
    for (const s of [-1, 1]) for (const d of [-0.035, 0.035]) p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8).rotateZ(Math.PI / 2), 0.4 + s * 0.042, 0.03, 0.18 + d, 0x2a2a2a);
    for (const s of [-1, 1]) for (const d of [-0.03, 0.04]) p.box(0.006, 0.12, 0.006, 0.4 + s * 0.034, 0.08, 0.18 + d, 0x3c4a54);
    p.box(0.08, 0.008, 0.08, 0.4, 0.2, 0.185, 0x3c4a54);
    p.box(0.07, 0.17, 0.01, 0.4, 0.03, 0.125, 0x5d6878); p.box(0.1, 0.03, 0.08, 0.4, 0.06, 0.075, 0xe8c890);
    seated(p, 0.4, 0.08, 0.19, Math.PI, 0xf28a3c, 0xf2c23a);
    // tas de sciure, et les bûcherons casqués
    p.cone(0.07, 0.07, 8, -0.38, 0.012, -0.2, 0xe0c48a);
    figure(p, -0.42, -0.02, 0xd84a3e, 1.2, false, 0xf28a3c); figure(p, 0.06, -0.01, 0xf28a3c, 0.3, false, 0xf2c23a);
  }
}

/**
 * Carrière (près des rochers, dans la montagne) : tas de pierres et pic à la Préhistoire ; front de taille en gradins,
 * blocs équarris et chèvre de levage ; treuil à vapeur, rails et wagonnet ; engins jaunes et tas de gravier ensuite
 */
function quarry(p: Parts, age: number) {
  const rock = 0xa8a296, cut = 0xc8c2b4;
  p.cyl(0.46, 0.47, 0.012, 14, 0, 0, 0, 0xb0a890);
  // front de taille : rochers anguleux au fond, entaillés de gradins aux arêtes nettes (plus nombreux avec les âges)
  for (let i = 0; i < 6; i++) {
    const h = (k: number) => hash2(i, k, 402);
    p.add(new THREE.DodecahedronGeometry(0.13 + h(1) * 0.05, 0).scale(1, 0.9 + h(2) * 0.5, 0.75), -0.36 + i * 0.145, 0.1 + h(3) * 0.06, -0.33 + h(4) * 0.05, dark(rock, 0.82 + h(5) * 0.16), h(6) * 3);
  }
  // gradins taillés bloc par bloc (pas une dalle d'un seul tenant), plus nombreux avec les âges
  const steps = age === 0 ? 1 : age <= 2 ? 2 : 3;
  for (let k = 0; k < steps; k++) {
    const wd = 0.56 - k * 0.14, n = Math.max(3, Math.round(wd / 0.09));
    for (let i = 0; i < n; i++) {
      const h = (q: number) => hash2(i, k * 7 + q, 403), bw = wd / n;
      p.box(bw - 0.006, 0.09 + h(1) * 0.025, 0.12 + h(2) * 0.04, -0.04 + k * 0.03 - wd / 2 + bw * (i + 0.5), 0.012 + k * 0.1, -0.2 - k * 0.05 + (h(3) - 0.5) * 0.02, dark(cut, 0.9 + h(4) * 0.12 - k * 0.04));
    }
  }
  // gravillons et poussière sur le carreau
  for (let i = 0; i < 16; i++) p.cyl(0.02 + hash2(i, 8, 79) * 0.03, 0.03 + hash2(i, 8, 79) * 0.03, 0.004, 6, -0.38 + hash2(i, 9, 79) * 0.76, 0.012, -0.05 + hash2(i, 10, 79) * 0.48, dark(0xb0a890, 0.82 + hash2(i, 11, 79) * 0.2));
  // blocs taillés, éclats
  for (const [x, z, s] of [[-0.28, 0.12, 1], [-0.16, 0.2, 0.8], [-0.22, 0.04, 0.7]]) p.box(0.1 * s, 0.07 * s, 0.08 * s, x, 0.012, z, cut, x * 3);
  if (age >= 1) p.box(0.09, 0.06, 0.07, -0.21, 0.08, 0.13, cut, 0.4);
  for (let i = 0; i < 10; i++) p.add(new THREE.IcosahedronGeometry(0.018 + hash2(i, 4, 79) * 0.015, 0), -0.4 + hash2(i, 5, 79) * 0.8, 0.02, -0.05 + hash2(i, 6, 79) * 0.45, dark(rock, 0.8 + hash2(i, 7, 79) * 0.2));
  if (age === 0) {
    p.add(new THREE.BoxGeometry(0.012, 0.16, 0.012), 0.2, 0.07, 0.2, C.darkwood, 0, false, 0.8);
    p.box(0.06, 0.02, 0.014, 0.25, 0.13, 0.2, C.darkstone, 0, false, 0.8);
    return;
  }
  if (age <= 2) {
    // chèvre de levage : trois perches, poulie, bloc suspendu
    for (const a of [0, 2.1, 4.2]) p.add(new THREE.CylinderGeometry(0.012, 0.014, 0.5, 5).translate(0, 0.25, 0), 0.2 + Math.cos(a) * 0.1, 0.012, 0.12 + Math.sin(a) * 0.1, C.darkwood, 0, false, Math.cos(a) * 0.2, -Math.sin(a) * 0.2);
    p.box(0.004, 0.2, 0.004, 0.2, 0.25, 0.12, 0x5a4a3a);
    p.box(0.08, 0.06, 0.07, 0.2, 0.2, 0.12, cut);
  } else if (age === 3) {
    // treuil à vapeur, rails et wagonnet de pierres
    p.box(0.14, 0.12, 0.1, 0.26, 0.012, 0.16, 0x3c3c40); p.cyl(0.03, 0.03, 0.14, 8, 0.3, 0.13, 0.16, 0x3c3c40); smoke(0.3, 0.3, 0.16, 0);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10).rotateX(Math.PI / 2), 0.2, 0.13, 0.16, 0xb83a2e);
    for (let z = -0.12; z <= 0.4; z += 0.07) p.box(0.14, 0.01, 0.024, 0.0, 0.012, z, C.darkwood);
    for (const s of [-1, 1]) p.box(0.01, 0.012, 0.54, s * 0.05, 0.02, 0.14, C.metal);
    p.box(0.1, 0.06, 0.12, 0.0, 0.035, 0.2, 0x6f5640);
    for (let k = 0; k < 4; k++) p.box(0.04, 0.03, 0.035, -0.02 + (k % 2) * 0.04, 0.095, 0.17 + (k > 1 ? 0.05 : 0), cut);
  } else {
    // engins jaunes : pelleteuse au pied du front, tombereau chargé, trémie et tapis sur pieds vers le tas de gravier,
    // baraque de chantier, cônes et barrière
    const yel = 0xf2c84b, dk = 0x2a2a2e;
    // pelleteuse : chenilles, tourelle, cabine vitrée, flèche, bras et godet tendus vers les gradins
    for (const s of [-1, 1]) p.box(0.17, 0.045, 0.045, 0.28, 0.012, -0.01 + s * 0.05, dk);
    p.box(0.12, 0.06, 0.11, 0.28, 0.057, -0.01, yel); p.box(0.05, 0.06, 0.05, 0.31, 0.117, 0.01, 0x9fd0e4);
    p.box(0.06, 0.03, 0.08, 0.24, 0.117, -0.01, 0x5d6878);
    p.add(new THREE.BoxGeometry(0.03, 0.03, 0.2).translate(0, 0, -0.1), 0.27, 0.12, -0.04, yel, 0, false, 0, 0.55);
    p.add(new THREE.BoxGeometry(0.024, 0.024, 0.13).translate(0, 0, -0.065), 0.27, 0.224, -0.21, yel, 0, false, 0, -0.95);
    p.box(0.07, 0.045, 0.05, 0.27, 0.11, -0.3, 0x5d6878);
    // tombereau : benne pleine, cabine, grosses roues
    p.box(0.22, 0.04, 0.11, 0.26, 0.04, 0.3, dk);
    p.box(0.14, 0.07, 0.12, 0.22, 0.08, 0.3, yel); p.sphere(0.06, 0.22, 0.14, 0.3, 0x9a9488, 0, 0.6);
    p.box(0.06, 0.08, 0.1, 0.35, 0.08, 0.3, yel); p.box(0.004, 0.04, 0.08, 0.382, 0.12, 0.3, 0x9fd0e4);
    for (const x of [0.18, 0.34]) for (const sd of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateX(Math.PI / 2), x, 0.04, 0.3 + sd * 0.065, dk);
    // trémie, tapis roulant sur ses pieds jusqu'au-dessus du tas de gravier
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.012, 0.08, 0.012, 0.04 + x * 0.04, 0.012, 0.3 + z * 0.04, 0x5d6878);
    p.add(new THREE.ConeGeometry(0.08, 0.08, 4).rotateX(Math.PI).rotateY(Math.PI / 4), 0.04, 0.13, 0.3, yel);
    p.box(0.115, 0.015, 0.115, 0.04, 0.165, 0.3, dark(yel, 0.85));
    p.add(new THREE.BoxGeometry(0.38, 0.022, 0.06), -0.15, 0.16, 0.3, 0x3c3c3c, 0, false, -0.4);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.38, 0.012, 0.008), -0.15, 0.175, 0.3 + s * 0.034, yel, 0, false, -0.4);
    for (const [x, h] of [[-0.06, 0.11], [-0.2, 0.17]] as [number, number][]) for (const s of [-1, 1]) p.box(0.01, h, 0.01, x, 0.012, 0.3 + s * 0.03, yel);
    p.cone(0.15, 0.15, 8, -0.33, 0.012, 0.3, 0xa8a090); p.cone(0.09, 0.08, 7, -0.38, 0.012, 0.14, 0x8a8478);
    // baraque de chantier, sa fenêtre éclairée et sa porte
    p.box(0.09, 0.075, 0.15, -0.39, 0.012, -0.06, C.white); p.box(0.1, 0.012, 0.16, -0.39, 0.087, -0.06, 0x5d6878);
    p.box(0.004, 0.03, 0.05, -0.344, 0.05, -0.09, 0xffe2a0, 0, true); p.box(0.004, 0.06, 0.03, -0.344, 0.012, -0.01, 0x3c4a8a);
    // cônes et barrière rouge et blanc
    for (const [x, z] of [[0.08, 0.06], [0.14, 0.12], [0.02, 0.14]]) { p.cone(0.018, 0.045, 6, x, 0.012, z, 0xf28a3c); p.cyl(0.014, 0.014, 0.006, 6, x, 0.027, z, C.white); }
    for (let k = 0; k < 4; k++) p.box(0.04, 0.02, 0.012, 0.32 + k * 0.035, 0.07, 0.44, k % 2 ? C.white : 0xd84a3e);
    for (const x of [0.31, 0.45]) p.box(0.01, 0.07, 0.01, x, 0.012, 0.44, 0x5d6878);
  }
}

/** Voie d'un quai (le long de x, en z = 0.34, comme à la gare) : ballast, traverses, rails ; `y` : dessus de la dalle */
function platformTrack(p: Parts, y: number, modern: boolean) {
  p.box(1.9, 0.012, 0.36, 0, y - 0.006, 0.34, 0xa39a8e);
  for (let x = -0.92; x <= 0.92; x += 0.1) p.box(0.04, 0.016, 0.24, x, y, 0.34, modern ? 0xb8b4ac : C.darkwood);
  for (const z of [0.28, 0.4]) p.box(1.9, 0.02, 0.014, 0, y + 0.016, z, C.metal);
}

/** Quai d'en face, de l'autre côté de la voie : bord peint, abri, bancs tournés vers la voie, réverbères */
function farPlatform(p: Parts, modern: boolean) {
  const steel = 0x5d6878;
  p.box(1.9, 0.08, 0.32, 0, 0.03, 0.74, modern ? 0xc8c4bc : C.stone);
  p.box(1.9, 0.004, 0.03, 0, 0.11, 0.6, modern ? 0xf2c84b : 0xece4d4);
  if (modern) {
    p.box(0.5, 0.012, 0.2, 0.3, 0.33, 0.78, 0xdde4ea);
    for (const x of [0.07, 0.53]) p.box(0.012, 0.22, 0.012, x, 0.11, 0.86, steel);
    p.box(0.46, 0.18, 0.006, 0.3, 0.13, 0.875, C.glass, 0, true);
  } else {
    for (const x of [0.08, 0.52]) p.cyl(0.01, 0.012, 0.22, 6, x, 0.11, 0.82, 0x3f6a4a);
    p.add(new THREE.BoxGeometry(0.54, 0.014, 0.22), 0.3, 0.34, 0.78, 0x8a5a44, 0, false, 0, -0.18);
  }
  for (const x of [0.2, 0.42]) { p.box(0.14, 0.02, 0.045, x, 0.15, 0.82, modern ? 0x8a96a2 : C.wood); p.box(0.14, 0.05, 0.01, x, 0.17, 0.845, modern ? 0x8a96a2 : C.wood); }
  for (const x of [-0.85, -0.3, 0.85]) { p.cyl(0.007, 0.009, 0.28, 5, x, 0.11, 0.8, modern ? steel : 0x3c4a44); p.box(0.035, 0.035, 0.035, x, 0.39, 0.8, 0xffe2a0, 0, true); }
  for (const x of [-0.65, -0.48]) { p.box(0.1, 0.06, 0.1, x, 0.11, 0.8, 0x8a8a8a); p.sphere(0.06, x, 0.22, 0.8, C.darkgreen, 1); }
  p.box(0.01, 0.2, 0.01, -0.1, 0.11, 0.86, steel); p.box(0.16, 0.05, 0.012, -0.1, 0.29, 0.86, modern ? 0x2e3c48 : C.white);
  if (modern) p.box(0.13, 0.026, 0.004, -0.1, 0.302, 0.853, 0xffb84a, 0, true); else p.box(0.12, 0.018, 0.014, -0.1, 0.305, 0.86, 0x3f5a4a);
}

/**
 * Petite gare : à l'âge industriel, bâtiment des voyageurs en brique au fond, quai sous un auvent de bois sur consoles de
 * fonte, horloge, enseigne, bancs, réverbères, chariot à bagages ; gare moderne ensuite : quai de béton bordé de jaune, abri
 * de verre et d'acier, écran des départs, distributeur, vélos. La voie passe devant le quai, comme à la gare
 */
function station(p: Parts, age: number) {
  const modern = age >= 4;
  sink(0.03);
  platformTrack(p, 0.03, modern);
  farPlatform(p, modern);
  // quai, bord peint
  p.box(1.9, 0.08, 0.38, 0, 0.03, -0.03, modern ? 0xc8c4bc : C.stone);
  p.box(1.9, 0.004, 0.04, 0, 0.11, 0.14, modern ? 0xf2c84b : 0xece4d4);
  if (!modern) {
    const brick = 0xb4685c, bz = -0.58, W = 1.1, D = 0.42, H = 0.4, zf = bz + D / 2;
    p.box(W, H, D, -0.2, 0.03, bz, brick);
    stones(p, -0.2, zf, W, 0.03, H + 0.03, 0, dark(brick, 0.86), 0.45, 390);
    for (const x of [-0.2 - W / 2, -0.2 + W / 2]) quoins(p, x, zf, 0.03, H + 0.03, x < -0.2 ? -1 : 1, 1);
    for (const y of [0.03, H + 0.02]) p.box(W + 0.02, 0.025, D + 0.02, -0.2, y, bz, C.cream);
    roof(p, -0.2, H + 0.03, bz, { w: W, d: D, h: 0.2, color: C.slate, wall: brick, courses: true });
    p.cyl(0.03, 0.035, 0.16, 6, 0.15, H + 0.12, bz - 0.08, C.darkbrick);
    for (const x of [-0.6, -0.42, 0.02, 0.2]) { windows(p, [x], 0.1, zf + 0.01, 0.08, 0.14, C.cream); p.gable(0.014, 0.035, 0.1, x, 0.254, zf + 0.005, C.cream, Math.PI / 2); }
    p.box(0.14, 0.24, 0.02, -0.2, 0.03, zf + 0.01, 0x3f5a4a); p.gable(0.02, 0.05, 0.16, -0.2, 0.27, zf + 0.01, C.cream, Math.PI / 2);
    // horloge et enseigne au-dessus de la porte
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).rotateX(Math.PI / 2), -0.2, 0.36, zf + 0.02, C.white);
    p.box(0.004, 0.035, 0.004, -0.2, 0.36, zf + 0.028, 0x2a2a2a); p.box(0.028, 0.004, 0.004, -0.19, 0.36, zf + 0.028, 0x2a2a2a);
    p.box(0.3, 0.05, 0.012, -0.2, 0.3, zf + 0.02, 0x3f5a4a); for (let k = 0; k < 5; k++) p.box(0.03, 0.022, 0.004, -0.28 + k * 0.04, 0.314, zf + 0.027, C.gold);
    // auvent de bois sur consoles de fonte, lambrequin découpé
    for (let i = 0; i < 4; i++) { const x = -0.72 + i * 0.48; p.cyl(0.012, 0.016, 0.3, 6, x, 0.11, -0.02, 0x3f6a4a); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.012), x, 0.39, 0.02, 0x3f6a4a, 0, false, 0.6); }
    p.add(new THREE.BoxGeometry(1.7, 0.016, 0.42), 0, 0.42, -0.06, 0x8a5a44, 0, false, 0, 0.14);
    for (let k = 0; k < 17; k++) p.add(new THREE.ConeGeometry(0.03, 0.05, 3).rotateX(Math.PI), -0.8 + k * 0.1, 0.38, 0.15, C.cream);
    // bancs, réverbères, chariot à bagages, bacs de fleurs, panneau du quai
    for (const x of [-0.45, 0.35]) { p.box(0.16, 0.02, 0.05, x, 0.15, -0.14, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, x + d, 0.11, -0.14, 0x3c4a44); }
    for (const x of [-0.9, 0.9]) { p.cyl(0.007, 0.009, 0.3, 5, x, 0.11, 0.02, 0x3c4a44); p.box(0.035, 0.04, 0.035, x, 0.41, 0.02, 0xffe2a0, 0, true); }
    p.box(0.12, 0.03, 0.07, 0.65, 0.15, -0.12, C.wood); for (const [x, c] of [[0.62, 0x8a5a3a], [0.69, 0x4a6aa8]] as [number, number][]) p.box(0.05, 0.035, 0.035, x, 0.18, -0.12, c);
    for (const x of [-0.85, 0.55]) { p.box(0.14, 0.04, 0.05, x, 0.03, zf + 0.1, C.wood); for (let k = 0; k < 4; k++) p.sphere(0.018, x - 0.045 + k * 0.03, 0.08, zf + 0.1, [C.pink, C.butter, 0xd84a3e, C.lav][k], 0, 0.8); }
    p.box(0.01, 0.2, 0.01, 0.55, 0.11, 0.05, 0x3c4a44); p.box(0.18, 0.06, 0.012, 0.55, 0.3, 0.05, C.white); p.box(0.14, 0.02, 0.014, 0.55, 0.32, 0.05, 0x3f5a4a);
    // clôture de l'arrière-cour
    for (let x = 0.45; x <= 0.9; x += 0.09) p.box(0.012, 0.1, 0.012, x, 0.03, -0.8, C.white);
    p.box(0.48, 0.012, 0.01, 0.67, 0.1, -0.8, C.white);
  } else {
    // bâtiment de verre et de béton, auvent d'acier sur poteaux, écran des départs, distributeur, vélos
    p.box(1.1, 0.34, 0.44, -0.25, 0.03, -0.6, 0xe6e4de);
    p.box(1.0, 0.22, 0.012, -0.25, 0.08, -0.375, C.glass, 0, true);
    for (let k = 0; k < 6; k++) p.box(0.012, 0.22, 0.016, -0.73 + k * 0.19, 0.08, -0.37, 0x5d6878);
    p.box(1.16, 0.03, 0.5, -0.25, 0.37, -0.6, 0x5d6878);
    p.box(0.3, 0.06, 0.014, -0.25, 0.3, -0.37, 0x2e3c48); p.box(0.24, 0.02, 0.004, -0.25, 0.32, -0.36, 0x9de0ff, 0, true);
    for (let i = 0; i < 5; i++) p.cyl(0.012, 0.012, 0.32, 6, -0.8 + i * 0.4, 0.11, -0.05, 0x8a96a2);
    p.box(1.8, 0.016, 0.36, 0, 0.43, -0.03, 0xdde4ea);
    p.box(1.8, 0.02, 0.02, 0, 0.42, 0.14, 0xf2c84b);
    p.box(0.012, 0.16, 0.012, 0.3, 0.27, -0.05, 0x5d6878); p.box(0.2, 0.07, 0.014, 0.3, 0.32, -0.05, 0x2e3c48); p.box(0.16, 0.04, 0.004, 0.3, 0.33, -0.04, 0xffb84a, 0, true);
    p.box(0.07, 0.16, 0.05, 0.62, 0.11, -0.14, 0xd8553c); p.box(0.04, 0.03, 0.006, 0.62, 0.21, -0.112, 0x9de0ff, 0, true);
    for (const x of [-0.5, 0.0]) { p.box(0.2, 0.02, 0.05, x, 0.15, -0.14, 0x8a96a2); p.box(0.2, 0.06, 0.012, x, 0.17, -0.165, 0x8a96a2); }
    for (let k = 0; k < 3; k++) { const x = 0.55 + k * 0.12; for (const d of [-0.04, 0.04]) p.add(new THREE.TorusGeometry(0.03, 0.006, 4, 10).rotateY(Math.PI / 2), x, 0.065, -0.78 + d, 0x3c3c40); p.box(0.006, 0.006, 0.08, x, 0.08, -0.78, [0xd8553c, 0x3c7fd8, 0x4fa860][k]); }
    // horloge à double cadran pendue sous l'auvent ; panneaux solaires et ventilation sur le toit, jardinières le long du bâtiment
    p.box(0.006, 0.04, 0.006, -0.2, 0.39, -0.05, 0x5d6878);
    p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14).rotateX(Math.PI / 2), -0.2, 0.345, -0.05, 0x2e3c48);
    for (const s of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 14).rotateX(Math.PI / 2), -0.2, 0.345, -0.05 + s * 0.016, C.white, 0, true); p.box(0.004, 0.03, 0.004, -0.2, 0.345, -0.05 + s * 0.019, 0x2a2a2a); p.box(0.022, 0.004, 0.004, -0.19, 0.345, -0.05 + s * 0.019, 0x2a2a2a); }
    solar(p, -0.35, 0.4, -0.66, 5, 0.14, 0.12); hvac(p, 0.15, 0.4, -0.5, 0.12);
    for (const x of [-0.62, 0.12]) planter(p, x, -0.3, 0.26, 0.06, 0.03);
    // les voyageurs sur les quais : valises à roulettes, sac à dos, un enfant qui fait signe au train
    const trav = (x: number, z: number, c: number, r: number, bag: number | null, pose: Pose = 'idle') => {
      figure(p, x, z, c, r, false, 0x4a3426, pose, 0.1);
      if (bag !== null) { p.box(0.04, 0.06, 0.025, x + 0.04 * Math.cos(r), 0.11, z - 0.04 * Math.sin(r), bag, r); p.box(0.004, 0.04, 0.004, x + 0.04 * Math.cos(r), 0.17, z - 0.04 * Math.sin(r), 0x3c3c40, r); }
    };
    trav(-0.68, 0.0, 0x3a6ab8, 0.2, 0xd84a3e); trav(-0.25, 0.06, 0x2a2a2e, 0, 0x3c3c40); trav(0.12, 0.02, 0xd8786c, 0.4, null);
    trav(0.45, 0.06, 0x4fa860, -0.3, 0xf2c23a); trav(0.2, 0.08, 0xf2c23a, 0, null, 'cheer');
    figure(p, -0.45, 0.68, 0x8a5a8a, Math.PI, false, 0xc8a070, 'idle', 0.1); figure(p, 0.62, 0.7, 0x3c3c48, Math.PI + 0.3, false, 0x2a2420, 'idle', 0.1);
  }
}

function observatory(p: Parts) {
  sink(0.012);
  p.cyl(0.3, 0.32, 0.06, 16, 0, 0.012, -0.08, C.stone);
  p.cyl(0.26, 0.26, 0.3, 16, 0, 0.07, -0.08, C.white);
  p.cyl(0.275, 0.275, 0.02, 16, 0, 0.36, -0.08, C.metal);
  windows(p, [0], 0.16, 0.18, 0.06, 0.08, C.metal);
  const d = spinner([0, 0.37, -0.08], [0, 1, 0], 0.08);
  d.add(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0xc8ced6);
  for (let k = 0; k < 6; k++) {
    const e = 0.12 + k * 0.25;
    d.add(new THREE.BoxGeometry(0.08, 0.075, 0.02).rotateX(-e), 0, 0.262 * Math.sin(e), 0.262 * Math.cos(e), 0x2a2e38);
  }
  d.add(new THREE.CylinderGeometry(0.032, 0.04, 0.42, 8).rotateX(Math.PI / 2 - 0.75), 0, 0.2 * Math.sin(0.75), 0.2 * Math.cos(0.75), C.white);
  d.add(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 8).rotateX(Math.PI / 2 - 0.75), 0, 0.41 * Math.sin(0.75), 0.41 * Math.cos(0.75), 0x2a2e38);
  // annexe, antenne parabolique, banc, allée
  p.box(0.3, 0.2, 0.22, 0.28, 0.012, 0.26, C.white); p.box(0.32, 0.02, 0.24, 0.28, 0.21, 0.26, C.metal);
  p.box(0.07, 0.14, 0.012, 0.2, 0.012, 0.372, 0x3f5a6a); windows(p, [0.34], 0.08, 0.372, 0.06, 0.06, C.metal);
  p.cyl(0.008, 0.01, 0.12, 5, 0.28, 0.23, 0.22, C.metal);
  p.add(new THREE.SphereGeometry(0.07, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-0.9), 0.28, 0.36, 0.24, C.white);
  p.box(0.12, 0.004, 0.36, -0.1, 0.014, 0.3, 0xd2ccc0);
  p.box(0.16, 0.025, 0.05, -0.32, 0.06, 0.3, C.wood); for (const s of [-1, 1]) p.box(0.02, 0.06, 0.05, -0.32 + s * 0.06, 0.012, 0.3, C.metal);
  tree(p, -0.36, -0.36, 0.9);
  // la lunette des curieux sur son trépied, le panneau des constellations, deux arbres, et un astronome qui y regarde
  p.add(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 8).rotateX(-0.9), -0.36, 0.2, -0.36, 0xd8d6d0);
  for (const a of [0, 2.1, 4.2]) p.add(new THREE.BoxGeometry(0.008, 0.18, 0.008), -0.36 + Math.sin(a) * 0.04, 0.09, -0.36 + Math.cos(a) * 0.04, 0x3c3c40, 0, false, Math.cos(a) * 0.25, Math.sin(a) * 0.25);
  figure(p, -0.3, -0.25, 0x3a5a9a, Math.PI + 0.7);
  p.box(0.12, 0.09, 0.008, 0.38, 0.1, -0.3, 0x1a2440); for (const [x, y] of [[0.35, 0.13], [0.38, 0.16], [0.41, 0.12], [0.37, 0.11]]) p.box(0.008, 0.008, 0.004, x, y, -0.295, 0xf2e2a0, 0, true);
  for (const d of [-0.05, 0.05]) p.box(0.008, 0.18, 0.008, 0.38 + d, 0.012, -0.3, 0x6b7280);
  tree(p, 0.42, -0.08, 0.9); tree(p, -0.42, 0.08, 0.85);
  // coursive au pied de la coupole et son garde-corps, hublots éclairés autour de la tour, échelle de service au dos
  p.cyl(0.31, 0.31, 0.012, 16, 0, 0.34, -0.08, 0x8a8f96);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; p.box(0.006, 0.05, 0.006, Math.sin(a) * 0.305, 0.352, -0.08 + Math.cos(a) * 0.305, 0xc4cad2); }
  p.add(new THREE.TorusGeometry(0.305, 0.004, 3, 24).rotateX(Math.PI / 2), 0, 0.4, -0.08, 0xc4cad2);
  for (const a of [0.9, 1.7, 2.5, -0.9, -1.7, -2.5]) {
    p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8).rotateX(Math.PI / 2), Math.sin(a) * 0.262, 0.24, -0.08 + Math.cos(a) * 0.262, C.win, a, true);
    p.add(new THREE.TorusGeometry(0.022, 0.005, 3, 10), Math.sin(a) * 0.264, 0.24, -0.08 + Math.cos(a) * 0.264, C.metal, a);
  }
  for (const s of [-1, 1]) p.box(0.006, 0.28, 0.006, s * 0.022, 0.07, -0.346, 0x8a8f96);
  for (let y = 0.1; y < 0.34; y += 0.035) p.box(0.044, 0.005, 0.005, 0, y, -0.346, 0x8a8f96);
  // l'annexe : bandeau et lettres lumineuses, anémomètre qui tourne sur le toit
  p.box(0.2, 0.03, 0.006, 0.3, 0.165, 0.374, 0x1a2440); for (let k = 0; k < 5; k++) p.box(0.022, 0.016, 0.004, 0.23 + k * 0.035, 0.172, 0.378, 0xcfe8ff, 0, true);
  p.cyl(0.004, 0.005, 0.13, 4, 0.4, 0.23, 0.33, C.metal);
  { const an = turning([0.4, 0.36, 0.33], [0, 1, 0], 0.9); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; an.box(0.05, 0.004, 0.004, Math.cos(a) * 0.025, 0, -Math.sin(a) * 0.025, C.metal, a); an.sphere(0.009, Math.cos(a) * 0.05, 0.0, -Math.sin(a) * 0.05, C.white); } }
  // bornes lumineuses le long de l'allée, massif au pied de la tour, la famille venue voir les étoiles
  for (const z of [0.2, 0.33, 0.46]) { p.cyl(0.01, 0.012, 0.06, 6, -0.025, 0.012, z, 0x5d6878); p.cyl(0.013, 0.013, 0.014, 6, -0.025, 0.07, z, 0xfff1c9, true); }
  [[-0.95, 0xb9a6e6], [-0.8, 0x5f9a4a], [-0.66, 0xf2a6c8], [0.12, 0xf2d24a], [0.26, 0x5f9a4a]].forEach(([a, c]) => p.sphere(0.022, Math.sin(a) * 0.34, 0.03, -0.08 + Math.cos(a) * 0.34, c, 0, 0.7));
  figure(p, -0.06, 0.36, 0x6a8a4a, Math.PI + 0.3, false, 0x2a2420);
  figure(p, -0.13, 0.44, 0xf2c23a, Math.PI - 0.2, false, 0x8a5a3a, 'cheer');
}

function lamp(p: Parts, age: number) {
  if (age === 0) { p.cyl(0.02, 0.03, 0.42, 5, 0, 0, 0, C.wood); p.cone(0.06, 0.14, 5, 0, 0.4, 0, C.flame, true); }
  else if (age === 1) { p.cyl(0.04, 0.06, 0.2, 6, 0, 0, 0, C.stone); p.cyl(0.1, 0.06, 0.06, 7, 0, 0.2, 0, C.darkstone); p.cone(0.07, 0.14, 5, 0, 0.26, 0, C.flame, true); }
  else if (age === 2) { p.cyl(0.02, 0.03, 0.5, 5, 0, 0, 0, C.darkwood); p.box(0.09, 0.1, 0.09, 0, 0.5, 0, 0xfff1c9, 0, true); p.pyramid(0.13, 0.07, 0.13, 0, 0.6, 0, C.darkwood); }
  else if (age === 3) { p.cyl(0.02, 0.035, 0.6, 6, 0, 0, 0, C.roofdark); p.cyl(0.05, 0.05, 0.12, 6, 0, 0.6, 0, 0xfff1c9, true); p.cone(0.08, 0.06, 6, 0, 0.72, 0, C.roofdark); }
  else {
    // lampadaire de la ville : socle, fût à manchon sombre, crosse et tête à LED ; bannière de la fête qui flotte à sa potence,
    // suspension fleurie, corbeille
    p.cyl(0.045, 0.05, 0.03, 8, 0, 0, 0, 0x5d6168);
    p.cyl(0.02, 0.03, 0.65, 6, 0, 0, 0, C.metal); p.cyl(0.032, 0.035, 0.16, 6, 0, 0.03, 0, 0x4a5058);
    p.box(0.18, 0.025, 0.04, 0.07, 0.65, 0, C.metal); p.box(0.1, 0.02, 0.05, 0.14, 0.64, 0, 0xfaf6e6, 0, true);
    p.box(0.12, 0.014, 0.06, 0.14, 0.66, 0, 0x5d6168);
    p.box(0.07, 0.008, 0.008, -0.035, 0.52, 0, 0x5d6168);
    { const f = sway([-0.045, 0.516, 0], [1, 0, 0], 0.14, 0.9); f.box(0.055, 0.16, 0.004, -0.014, -0.165, 0, 0x3a6ab8); f.box(0.055, 0.03, 0.005, -0.014, -0.12, 0, 0xf2c23a); f.box(0.055, 0.012, 0.005, -0.014, -0.165, 0, C.white); }
    p.box(0.008, 0.008, 0.07, 0, 0.42, 0.035, 0x5d6168); p.box(0.004, 0.04, 0.004, 0, 0.38, 0.07, 0x3c3c40);
    p.cyl(0.032, 0.02, 0.03, 8, 0, 0.35, 0.07, 0x3c4a44);
    for (let k = 0; k < 6; k++) p.sphere(0.014, Math.cos(k * 1.05) * 0.024, 0.385, 0.07 + Math.sin(k * 1.05) * 0.024, [0xf2a6c8, 0xd84a3e, 0xf2d24a][k % 3]);
    for (const a of [0.6, 2.6, 4.4]) p.box(0.006, 0.05, 0.006, Math.cos(a) * 0.03, 0.31, 0.07 + Math.sin(a) * 0.03, 0x5f9a4a);
    p.cyl(0.022, 0.019, 0.06, 8, 0, 0.06, -0.045, 0x3f6a4a); p.cyl(0.024, 0.024, 0.008, 8, 0, 0.12, -0.045, 0x2e4a38);
  }
}

/**
 * Ponton de pêche, petit et mignon : la façade (+z) donne sur l'eau. Préhistoire : radeau de rondins, séchoir à poissons,
 * pirogue tirée sur la berge et panier ; ensuite une cabane de pêcheur à fenêtre ronde au bout d'un petit ponton de planches,
 * avec lanterne, tonneau, filet et canne à pêche ; la conserverie a sa cheminée, le port moderne sa bouée
 */
function pier(p: Parts, age: number, o: ModelOpts) {
  // poisson pendu tête en haut : corps fuselé, queue en éventail en bas
  const fish = (x: number, y: number, z: number, c: number, ry = 0) => {
    p.add(new THREE.IcosahedronGeometry(0.026, 1).scale(0.4, 1.45, 0.85), x, y, z, c, ry);
    p.add(new THREE.ConeGeometry(0.022, 0.03, 4).scale(0.35, 1, 1).translate(0, -0.042, 0), x, y, z, c, ry);
  };
  if (age === 0) {
    // radeau de trois rondins qui s'avance sur l'eau
    for (const x of [-0.075, 0, 0.075]) p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.72, 7).rotateX(Math.PI / 2), x, 0.03, 0.5, x ? C.wood : dark(C.wood, 0.9));
    p.box(0.24, 0.025, 0.03, 0, 0.06, 0.24, C.darkwood); p.box(0.24, 0.025, 0.03, 0, 0.06, 0.76, C.darkwood);
    // séchoir en A : deux croisillons, une perche, des poissons pendus
    for (const x of [-0.2, 0.06]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.009, 0.011, 0.3, 5).translate(0, 0.15, 0), x, 0, -0.22 + s * 0.035, C.darkwood, 0, false, 0, -s * 0.22);
    p.add(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 5).rotateZ(Math.PI / 2), -0.07, 0.28, -0.22, C.darkwood);
    [0xc8d4dc, 0xe8925a, 0xc8d4dc, 0xd8b28c].forEach((c, k) => fish(-0.17 + k * 0.065, 0.225, -0.22, c));
    // canne à pêche plantée au bout du radeau, la ligne dans l'eau
    p.add(new THREE.CylinderGeometry(0.004, 0.006, 0.4, 4).translate(0, 0.2, 0), 0.09, 0.05, 0.8, C.darkwood, 0, false, 0, 0.55);
    p.add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.3, 3).translate(0, -0.15, 0), 0.09, 0.38, 1.02, 0xeeeeee);
    // pirogue tirée sur la berge, sa pagaie, un panier de pêche
    p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.065, 0.035, 0.2), 0.24, 0.035, -0.06, dark(C.wood, 0.75));
    p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.048, 0.012, 0.16), 0.24, 0.066, -0.06, dark(C.darkwood, 0.7));
    p.add(new THREE.BoxGeometry(0.012, 0.012, 0.24), 0.3, 0.02, 0.06, C.wood, 0.4); p.add(new THREE.BoxGeometry(0.05, 0.008, 0.07), 0.35, 0.02, 0.17, C.wood, 0.4);
    p.cyl(0.05, 0.038, 0.07, 8, -0.32, 0, 0.12, 0xc9a46a); p.cyl(0.052, 0.052, 0.012, 8, -0.32, 0.07, 0.12, 0x9a7452);
    fish(-0.32, 0.085, 0.12, 0xe8925a, 1.2);
    // pierres du foyer où l'on fume le poisson
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283; p.sphere(0.025, 0.06 + Math.cos(a) * 0.06, 0.01, -0.02 + Math.sin(a) * 0.06, k % 2 ? C.stone : C.darkstone, 0, 0.6); }
    smoke(0.06, 0.06, -0.02, 1);
    return;
  }
  // petit ponton de planches sur pilotis, qui s'avance au-delà de la case
  const plank = age >= 4 ? 0xd9d2c4 : age === 3 ? 0xa89a88 : C.wood, w = 0.3, z0 = 0.02, z1 = 0.78;
  for (let z = z0, k = 0; z < z1; z += 0.075, k++) p.box(w, 0.025, 0.065, 0, 0.0, z + 0.03, k % 3 === 1 ? dark(plank, 0.9) : plank);
  for (const z of [0.15, 0.45, 0.74]) for (const sx of [-1, 1]) p.cyl(0.02, 0.022, 0.62, 6, sx * (w / 2 - 0.01), -0.56, z, C.darkwood);
  // lanterne au bout du ponton (elle s'allume la nuit), bitte d'amarrage, tonneau et caisse
  p.cyl(0.012, 0.012, 0.26, 5, w / 2 - 0.03, 0.025, 0.74, C.darkwood);
  p.box(0.045, 0.05, 0.045, w / 2 - 0.03, 0.27, 0.74, 0xffd27a, 0, true);
  p.box(0.06, 0.012, 0.06, w / 2 - 0.03, 0.32, 0.74, C.darkwood);
  p.cyl(0.022, 0.026, 0.05, 6, -w / 2 + 0.035, 0.025, 0.72, C.darkwood);
  p.cyl(0.04, 0.045, 0.09, 8, -0.06, 0.025, 0.3, age >= 4 ? 0x4a8ce0 : 0x9a6a44); p.cyl(0.046, 0.046, 0.01, 8, -0.06, 0.07, 0.3, C.darkwood);
  p.box(0.07, 0.06, 0.07, 0.07, 0.025, 0.18, age >= 4 ? 0xf2c94c : C.wood, 0.3);
  // cabane du pêcheur, à l'arrière de la case
  const wall = age >= 4 ? C.white : age === 3 ? C.brick : [0xd9b98f, 0xc9a27a, 0xe0c9a0][o.v % 3];
  const roof = age >= 4 ? C.sky : age === 3 ? C.slate : [C.terracotta, C.teal, C.thatch, C.red][o.v % 4];
  const hw = age === 3 ? 0.42 : 0.32, hd = 0.28, hh = age === 3 ? 0.3 : 0.24, hz = -0.24;
  p.box(hw + 0.03, 0.03, hd + 0.03, 0, 0, hz, C.stone);
  p.box(hw, hh, hd, 0, 0.03, hz, wall);
  if (age >= 4) { p.box(hw + 0.06, 0.03, hd + 0.08, 0, hh + 0.03, hz, C.white); p.box(hw + 0.02, 0.012, 0.12, 0, hh - 0.02, hz + hd / 2 + 0.06, roof, 0, false, 0.25); }
  else p.gable(hw + 0.08, 0.17, hd + 0.08, 0, hh + 0.03, hz, roof);
  // porte, fenêtre ronde (éclairée la nuit) et son volet
  p.box(0.08, 0.15, 0.012, -0.07, 0.03, hz + hd / 2 + 0.004, C.door);
  p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10).rotateX(Math.PI / 2), 0.08, 0.15, hz + hd / 2 + 0.006, C.win, 0, true);
  p.add(new THREE.TorusGeometry(0.037, 0.008, 4, 12), 0.08, 0.15, hz + hd / 2 + 0.01, C.darkwood);
  if (age === 3) { p.cyl(0.035, 0.04, 0.32, 7, 0.14, hh + 0.03, hz - 0.04, C.darkbrick); smoke(0.14, hh + 0.37, hz - 0.04, 2); }
  else if (age <= 2) { p.box(0.05, 0.12, 0.05, -0.1, hh + 0.08, hz - 0.05, C.stone); smoke(-0.1, hh + 0.22, hz - 0.05, 0); }
  // corde tendue entre deux perches, à côté de la cabane : poissons qui sèchent et flotteurs de filet
  for (const z of [-0.36, -0.08]) p.cyl(0.008, 0.01, 0.28, 5, -0.33, 0, z, C.darkwood);
  p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 3).rotateX(Math.PI / 2), -0.33, 0.26, -0.22, 0xd8c8a8);
  [0xc8d4dc, 0xe8925a, 0xc8d4dc].forEach((c, k) => fish(-0.33, 0.21, -0.3 + k * 0.08, c, Math.PI / 2));
  for (let k = 0; k < 2; k++) p.sphere(0.014, -0.33, 0.24, -0.34 + k * 0.24, k ? 0xe8553c : 0xf2c94c);
  p.add(new THREE.CylinderGeometry(0.004, 0.006, 0.42, 4).translate(0, 0.21, 0), 0.2, 0.03, -0.08, C.darkwood, 0, false, -0.5);
  // bouée de sauvetage au port moderne, poisson qui sèche sinon
  if (age >= 4) p.add(new THREE.TorusGeometry(0.045, 0.014, 6, 14), 0.16, 0.14, hz + hd / 2 + 0.012, C.red);
  else for (let k = 0; k < 3; k++) fish(0.15 + k * 0.045, 0.2, hz + hd / 2 + 0.03, k === 1 ? 0xe8925a : 0xc8d4dc);
  if (age >= 4) {
    // la boutique d'appâts : enseigne en drapeau au poisson orange, panneau solaire ; râtelier de kayaks, vélo contre le mur
    p.box(0.012, 0.012, 0.05, -0.17, 0.215, hz + hd / 2 + 0.01, C.metal);
    p.box(0.008, 0.07, 0.07, -0.17, 0.13, hz + hd / 2 + 0.035, 0x2a5a8a); p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(0.3, 0.6, 1.2), -0.17, 0.165, hz + hd / 2 + 0.035, 0xf28a3c);
    solar(p, 0.06, hh + 0.06, hz - 0.02, 1, 0.12, 0.09);
    for (const z of [-0.36, -0.14]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.01, 0.2, 0.01).translate(0, 0.1, 0), 0.36 + s * 0.04, 0, z, C.darkwood, 0, false, -s * 0.2);
    for (const [y, c] of [[0.1, 0xf28a3c], [0.16, 0xf2c94c]] as [number, number][]) { p.box(0.1, 0.008, 0.008, 0.36, y - 0.008, -0.25, C.darkwood); p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.03, 0.018, 0.17), 0.36, y + 0.012, -0.25, c); }
    bike(p, 0.22, -0.02, 0x4fa860, Math.PI / 2, 0.0);
    // sur le platelage (les places des pêcheurs restent libres) : une canne calée dans son support, sa ligne, la glacière, le seau
    p.cyl(0.008, 0.008, 0.06, 5, 0.135, 0.025, 0.62, C.metal);
    p.add(new THREE.CylinderGeometry(0.003, 0.005, 0.36, 4).translate(0, 0.18, 0), 0.135, 0.05, 0.62, C.darkwood, 0, false, 0, 0.9);
    p.add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.3, 3).translate(0, -0.15, 0), 0.135, 0.27, 0.9, 0xeeeeee);
    p.box(0.06, 0.05, 0.05, 0.08, 0.025, 0.56, C.white); p.box(0.062, 0.014, 0.052, 0.08, 0.075, 0.56, 0x3c7fd8);
    p.cyl(0.022, 0.018, 0.04, 7, -0.09, 0.025, 0.54, 0xf2c94c);
    // l'enfant à l'épuisette sur la berge
    figure(p, 0.3, 0.04, 0xd84a3e, 2.6, false, 0xc8a070);
    p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 4).translate(0, 0.11, 0), 0.33, 0.08, 0.06, C.wood, 0, false, 0, 0.25);
    p.add(new THREE.TorusGeometry(0.024, 0.003, 3, 10), 0.33, 0.31, 0.12, 0x3c3c40); p.add(new THREE.ConeGeometry(0.022, 0.04, 6).rotateX(-Math.PI / 2), 0.33, 0.31, 0.1, 0xd8d0b8);
  }
}

const cache = new Map<string, Model>();

/** Poteau du barbier : rayures rouges et bleues en hélice sur fond blanc, qui tournent sur elles-mêmes ; coiffes dorées, potence au mur */
function barberPole(p: Parts, x: number, y: number, z: number, h: number) {
  p.cyl(0.026, 0.026, 0.018, 8, x, y - 0.018, z, C.gold);
  p.cyl(0.026, 0.026, 0.018, 8, x, y + h, z, C.gold);
  p.sphere(0.02, x, y + h + 0.03, z, C.gold);
  for (const t of [0.2, 0.8]) p.box(0.01, 0.01, 0.05, x, y + h * t, z - 0.03, C.metal);
  const sp = spinner([x, y, z], [0, 1, 0], 1.8), n = Math.round(h / 0.009), dh = h / n;
  sp.cyl(0.019, 0.019, h, 10, 0, 0, 0, C.white);
  for (let i = 0; i < n; i++) for (const [c, o] of [[0xd84a3e, 0], [0x3c6ab8, Math.PI]] as [number, number][]) {
    const a = i * 0.42 + o;
    sp.box(0.014, dh + 0.003, 0.006, Math.sin(a) * 0.0195, i * dh, Math.cos(a) * 0.0195, c, a);
  }
}

/** Petit personnage figé (client, barbier) : jambes, buste, tête et cheveux ; `sit` : assis ; `up` : posé plus haut (quai, estrade) */
function figure(p: Parts, x: number, z: number, body: number, ry = 0, sit = false, hair = 0x4a3426, pose: Pose = 'idle', up = 0) {
  // dans un modèle agrandi : à la taille des habitants
  if (lifeK !== 1 && !lifeIn) { lifeSize(p, x, up, z, () => figure(p, x, z, body, ry, sit, hair, pose, up)); return; }
  const c = Math.cos(ry), s = Math.sin(ry), P = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
  const y0 = (sit ? 0.07 : 0.012) + up;
  if (p !== mainParts) {
    if (!sit) for (const u of [-0.014, 0.014]) { const [px, pz] = P(u, 0); p.box(0.02, 0.07, 0.022, px, 0.012 + up, pz, 0x3c3c48, ry); }
    else { const [px, pz] = P(0, 0.03); p.box(0.05, 0.02, 0.06, px, 0.07 + up, pz, 0x3c3c48, ry); }
    { const [px, pz] = P(0, 0); p.box(0.055, 0.07, 0.035, px, y0 + (sit ? 0.01 : 0.07), pz, body, ry); }
    { const [px, pz] = P(0, 0); p.box(0.032, 0.032, 0.032, px, y0 + (sit ? 0.085 : 0.145), pz, 0xe8b894, ry); p.box(0.034, 0.012, 0.034, px, y0 + (sit ? 0.112 : 0.172), pz, hair, ry); }
    return;
  }
  // chacun à son rythme : il discute en gesticulant, lève le bras, ou se balance d'un pied sur l'autre
  const right: V3 = [c, 0, -s], fwd: V3 = [s, 0, c];
  const h = hash2(Math.round(x * 97 + 500), Math.round(z * 89 + 500), 23), ph = h * 6.28, f = 0.35 + h * 0.4;
  const run = pose === 'run', cheer = pose === 'cheer', fq = run ? 1.5 + h * 0.4 : cheer ? 1.2 + h * 0.6 : f, bob = run ? 0.012 : 0;
  // jambes
  if (!sit) for (const [i, u] of [[0, -0.014], [1, 0.014]]) {
    const [px, pz] = P(u, 0);
    const leg = (q: Parts) => q.box(0.02, 0.07, 0.022, px, 0.012 + up, pz, 0x3c3c48, ry);
    if (run) animPart(leg, [px, 0.082 + up, pz], right, 0.55, fq, ph + i * Math.PI, bob); else leg(p);
  } else { const [px, pz] = P(0, 0.03); p.box(0.05, 0.02, 0.06, px, 0.07 + up, pz, 0x3c3c48, ry); }
  // corps et tête : il se balance (de côté debout, d'avant en arrière assis)
  const [tx, tz] = P(0, 0), ysh = y0 + (sit ? 0.075 : 0.135);
  animPart((q) => {
    q.box(0.055, 0.07, 0.035, tx, y0 + (sit ? 0.01 : 0.07), tz, body, ry);
    q.box(0.032, 0.032, 0.032, tx, y0 + (sit ? 0.085 : 0.145), tz, 0xe8b894, ry);
    q.box(0.034, 0.012, 0.034, tx, y0 + (sit ? 0.112 : 0.172), tz, hair, ry);
  }, [tx, y0, tz], sit ? right : fwd, run ? 0.04 : sit ? 0.05 : 0.045, fq, ph, bob);
  // bras : pendants (ils gesticulent en parlant), levés pour acclamer ou saluer, ou qui battent la course
  const talk = !run && !cheer && h < 0.5, wave = !run && !cheer && !sit && h > 0.82;
  for (const [i, u] of [[0, -0.037], [1, 0.037]]) {
    const [ax, az] = P(u, 0), up = cheer || (wave && i === 1);
    animPart((q) => {
      if (up) { q.box(0.016, 0.06, 0.018, ax, ysh, az, body, ry); q.box(0.018, 0.018, 0.02, ax, ysh + 0.058, az, 0xe8b894, ry); }
      else { q.box(0.016, 0.055, 0.018, ax, ysh - 0.055, az, body, ry); q.box(0.018, 0.018, 0.02, ax, ysh - 0.07, az, 0xe8b894, ry); }
    }, [ax, ysh, az], up ? fwd : right, run ? 0.75 : up ? 0.35 : talk && i === 1 ? 0.45 : 0.07, run ? fq : up ? fq * 1.4 : talk ? 0.9 + h : f, ph + (run ? (i ? 0 : Math.PI) : i * 0.9), bob);
  }
}

/**
 * Coiffeur (1 case) : échoppe du barbier romain sous son auvent (le client assis sous son linge, le barbier au rasoir), boutique
 * du barbier-chirurgien à colombages et son bassin de cuivre pendu, salon de barbier en brique à vitrine et store rayé, salon
 * de coiffure vitré à l'enseigne de néon ; dès le Moyen Âge, le poteau rayé tourne à côté de la porte
 */
function barber(p: Parts, age: number) {
  sink(0.012);
  if (age <= 1) {
    p.box(0.62, 0.32, 0.42, 0, 0.012, -0.2, C.cream);
    roof(p, 0, 0.332, -0.2, { w: 0.62, d: 0.42, h: 0.15, color: C.terracotta, wall: C.cream, tiles: true });
    p.box(0.38, 0.24, 0.02, 0, 0.012, 0.012, 0x5a4434);
    for (const x of [-0.25, 0.25]) column(p, x, 0.2, 0.26, 0.012, 0.018);
    p.add(new THREE.BoxGeometry(0.58, 0.012, 0.24), 0, 0.27, 0.12, 0xd8c09a, 0, false, 0, 0.28);
    for (let k = 0; k < 7; k++) p.add(new THREE.BoxGeometry(0.08, 0.012, 0.02), -0.24 + k * 0.08, 0.238, 0.235, k % 2 ? 0xd8c09a : 0xb8322c);
    // sol de mosaïque en damier sous l'auvent
    for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) p.box(0.078, 0.003, 0.068, -0.24 + i * 0.08, 0.012, 0.05 + j * 0.07, (i + j) % 2 ? 0x2f3a44 : 0xf2ead8);
    // enseigne peinte au-dessus de l'entrée, miroir de bronze poli, étagère des rasoirs et des peignes
    p.box(0.3, 0.04, 0.008, 0, 0.255, 0.016, 0xf2e2b8); for (let k = 0; k < 9; k++) p.box(0.018, 0.02, 0.004, -0.11 + k * 0.028, 0.265, 0.021, 0x8a3a2a);
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 12).rotateX(Math.PI / 2), -0.25, 0.17, 0.016, C.gold); p.box(0.01, 0.05, 0.006, -0.25, 0.09, 0.016, dark(C.gold, 0.7));
    p.box(0.1, 0.008, 0.03, 0.25, 0.15, 0.026, C.wood);
    for (let k = 0; k < 4; k++) p.box(0.006, 0.03 + (k % 2) * 0.01, 0.01, 0.215 + k * 0.022, 0.158, 0.026, k % 2 ? C.metal : 0xe8dcc0);
    // le client assis sur son tabouret, drapé de blanc ; le barbier lui rase la joue ; des mèches tombées par terre
    p.cyl(0.03, 0.035, 0.07, 6, 0.04, 0.012, 0.13, C.wood);
    figure(p, 0.04, 0.13, C.white, 0, true);
    p.box(0.075, 0.06, 0.06, 0.04, 0.03, 0.15, C.white);
    figure(p, -0.06, 0.12, 0xb8322c, Math.PI / 2);
    p.box(0.028, 0.006, 0.008, -0.015, 0.16, 0.13, C.metal);
    for (let i = 0; i < 10; i++) p.box(0.012, 0.002, 0.004, 0.04 + Math.cos(i * 2.2) * 0.07, 0.016, 0.13 + Math.sin(i * 2.2) * 0.05, 0x4a3426, i);
    // brasero et chaudron d'eau chaude, bassin sur sa table
    p.cyl(0.028, 0.018, 0.05, 6, 0.16, 0.012, 0.05, 0x3c3c40); p.cyl(0.024, 0.024, 0.006, 6, 0.16, 0.062, 0.05, C.flame, true);
    p.cyl(0.02, 0.016, 0.028, 8, 0.16, 0.068, 0.05, dark(C.gold, 0.85));
    p.box(0.08, 0.06, 0.06, 0.2, 0.012, 0.17, C.wood); p.cyl(0.03, 0.022, 0.02, 8, 0.2, 0.072, 0.17, C.gold);
    // serviettes qui sèchent sur une corde tendue entre la colonne et le mur
    p.box(0.004, 0.004, 0.19, -0.25, 0.225, 0.105, 0x9a8a70);
    for (const [z, c] of [[0.06, C.white], [0.11, 0xd8c09a], [0.16, C.white]] as [number, number][]) p.box(0.008, 0.06, 0.04, -0.25, 0.165, z, c);
    p.sphere(0.04, -0.36, 0.06, 0.28, C.terracotta, 0, 1.4); p.cyl(0.012, 0.02, 0.04, 6, -0.36, 0.1, 0.28, C.terracotta);
    p.box(0.24, 0.02, 0.07, 0.3, 0.06, 0.36, C.stone); for (const d of [-0.09, 0.09]) p.box(0.04, 0.05, 0.06, 0.3 + d, 0.012, 0.36, C.darkstone);
    figure(p, 0.3, 0.36, 0x6a8ac8, Math.PI, true);
    // on attend son tour en refaisant le monde : un autre client assis, un voisin debout, le chien couché
    figure(p, 0.22, 0.36, 0xd8a03a, Math.PI, true, 0x8a5a3a);
    figure(p, 0.12, 0.42, 0x86c4b8, -Math.PI / 2);
    p.box(0.07, 0.025, 0.03, -0.02, 0.012, 0.4, 0xa87a50); p.box(0.03, 0.03, 0.028, 0.03, 0.02, 0.4, 0xa87a50); p.box(0.012, 0.012, 0.03, -0.065, 0.02, 0.4, 0xa87a50);
    // plantes en pot de part et d'autre de l'échoppe, cruche d'eau
    for (const x of [-0.42, 0.42]) { p.cyl(0.03, 0.022, 0.05, 7, x, 0.012, 0.06, C.terracotta); p.sphere(0.045, x, 0.1, 0.06, C.darkgreen, 0, 0.9); }
    p.cyl(0.018, 0.024, 0.05, 7, -0.3, 0.012, 0.32, C.terracotta); p.cyl(0.008, 0.012, 0.02, 6, -0.3, 0.062, 0.32, C.terracotta);
  } else if (age === 2) {
    p.box(0.6, 0.24, 0.44, 0, 0.012, -0.18, C.stone);
    stones(p, 0, 0.042, 0.6, 0.012, 0.25, 0, C.darkstone, 0.55, 203);
    p.box(0.64, 0.22, 0.48, 0, 0.252, -0.18, C.cream);
    timbers(p, 0, 0.062, 0.64, 0.262, 0.47, 0, 4);
    roof(p, 0, 0.472, -0.18, { w: 0.64, d: 0.48, h: 0.26, color: 0x7a5a4a, wall: C.cream, courses: true });
    windows(p, [-0.17], 0.08, 0.052, 0.12, 0.1); windows(p, [-0.18, 0.18], 0.31, 0.072, 0.07, 0.08);
    p.box(0.1, 0.19, 0.02, 0.13, 0.012, 0.052, C.door);
    // enseigne : le bassin de cuivre pendu à sa potence
    p.box(0.012, 0.012, 0.16, 0.26, 0.42, 0.13, C.darkwood);
    {
      const f = sway([0.26, 0.42, 0.19], [0, 0, 1], 0.22, 0.7);
      for (const d of [-0.03, 0.03]) f.box(0.003, 0.04, 0.003, d, -0.04, 0, 0x3c3c40);
      f.add(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12).rotateX(Math.PI / 2), 0, -0.08, 0, C.gold);
      f.add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 8).rotateX(Math.PI / 2), 0, -0.105, 0, dark(C.gold, 0.8));
    }
    barberPole(p, -0.3, 0.04, 0.1, 0.22);
    p.box(0.22, 0.02, 0.07, -0.05, 0.06, 0.32, C.wood); for (const d of [-0.08, 0.08]) p.box(0.02, 0.05, 0.06, -0.05 + d, 0.012, 0.32, C.darkwood);
    p.cyl(0.035, 0.03, 0.05, 8, 0.36, 0.012, 0.3, C.darkwood); p.cyl(0.031, 0.031, 0.004, 8, 0.36, 0.06, 0.3, C.water);
  } else if (age === 3) {
    const brick = 0xb4685c;
    p.box(0.66, 0.48, 0.46, 0, 0.012, -0.18, brick);
    stones(p, 0, 0.052, 0.66, 0.012, 0.49, 0, dark(brick, 0.86), 0.45, 204);
    for (const y of [0.26, 0.48]) p.box(0.68, 0.025, 0.48, 0, y, -0.18, C.cream);
    roof(p, 0, 0.49, -0.18, { w: 0.66, d: 0.46, h: 0.16, color: C.slate, wall: brick, courses: true });
    // devanture de bois peint : vitrine, porte vitrée, bandeau aux lettres d'or
    p.box(0.5, 0.24, 0.012, -0.03, 0.012, 0.056, 0x2f4a3e);
    p.box(0.3, 0.16, 0.012, -0.09, 0.05, 0.064, C.glass, 0, true);
    p.box(0.08, 0.19, 0.012, 0.15, 0.012, 0.064, C.glass, 0, true);
    p.box(0.52, 0.04, 0.016, -0.03, 0.225, 0.064, 0x2f4a3e); for (let k = 0; k < 7; k++) p.box(0.025, 0.02, 0.006, -0.18 + k * 0.045, 0.234, 0.074, C.gold);
    windows(p, [-0.18, 0.18], 0.31, 0.052, 0.08, 0.11, C.cream);
    for (let k = 0; k < 7; k++) p.add(new THREE.BoxGeometry(0.075, 0.01, 0.13), -0.255 + k * 0.075, 0.25, 0.12, k % 2 ? C.white : 0xc85a4e, 0, false, 0, 0.45);
    barberPole(p, 0.28, 0.05, 0.08, 0.18);
    p.box(0.22, 0.02, 0.07, -0.1, 0.06, 0.3, C.darkwood); for (const d of [-0.08, 0.08]) p.box(0.02, 0.05, 0.06, -0.1 + d, 0.012, 0.3, 0x3c3c40);
    figure(p, -0.1, 0.3, 0x5a6a8a, Math.PI, true, 0x2a2a2e);
    p.cyl(0.035, 0.03, 0.06, 7, 0.36, 0.012, 0.3, C.terracotta); p.sphere(0.045, 0.36, 0.1, 0.3, C.darkgreen, 0, 0.9);
  } else {
    const wall = 0xf1d4cc, trim = 0xffffff;
    p.box(0.66, 0.56, 0.46, 0, 0.012, -0.18, wall);
    p.box(0.68, 0.03, 0.48, 0, 0.572, -0.18, trim);
    p.box(0.68, 0.02, 0.48, 0, 0.3, -0.18, trim);
    // grande vitrine : miroirs et fauteuils éclairés derrière, montants fins, porte vitrée
    p.box(0.54, 0.24, 0.012, -0.03, 0.03, 0.056, C.glass, 0, true);
    for (const x of [-0.3, -0.12, 0.06, 0.24]) p.box(0.012, 0.25, 0.016, x, 0.025, 0.062, 0xd8d6d0);
    // enseigne de néon : les ciseaux (deux anneaux, deux lames croisées) et le bandeau
    p.box(0.46, 0.06, 0.012, -0.03, 0.31, 0.058, 0x3a3440);
    for (const x of [-0.2, -0.15]) p.add(new THREE.TorusGeometry(0.016, 0.004, 4, 10), x, 0.34, 0.068, 0xff7ab8, 0, true);
    for (const r of [0.6, -0.6]) p.add(new THREE.BoxGeometry(0.07, 0.006, 0.004), -0.12, 0.34, 0.068, 0xff7ab8, 0, true, r);
    for (let k = 0; k < 5; k++) p.box(0.03, 0.022, 0.004, -0.02 + k * 0.045, 0.325, 0.066, 0x9ae8ff, 0, true);
    windows(p, [-0.2, 0.0, 0.2], 0.38, 0.052, 0.1, 0.13, trim);
    barberPole(p, 0.3, 0.06, 0.08, 0.2);
    // banc, plantes, trottinette
    p.box(0.22, 0.02, 0.07, -0.12, 0.06, 0.3, C.white); for (const d of [-0.08, 0.08]) p.box(0.02, 0.05, 0.06, -0.12 + d, 0.012, 0.3, C.metal);
    for (const x of [-0.4, 0.4]) { p.cyl(0.035, 0.03, 0.07, 7, x, 0.012, 0.14, 0xe8e4dc); p.sphere(0.05, x, 0.12, 0.14, C.darkgreen, 0, 1.1); }
    p.box(0.012, 0.012, 0.12, 0.2, 0.02, 0.34, 0x3c7fd8); p.box(0.008, 0.12, 0.008, 0.2, 0.02, 0.4, 0x3c3c40); p.box(0.06, 0.008, 0.008, 0.2, 0.14, 0.4, 0x3c3c40);
    // porte vitrée et sa poignée, store droit au-dessus de la vitrine, lambrequin
    p.box(0.15, 0.235, 0.006, 0.15, 0.025, 0.065, 0x7a9aac); p.box(0.006, 0.05, 0.008, 0.09, 0.12, 0.07, C.metal);
    p.add(new THREE.BoxGeometry(0.58, 0.01, 0.12), -0.03, 0.282, 0.115, 0x3a3440, 0, false, 0, 0.25); p.box(0.58, 0.026, 0.006, -0.03, 0.255, 0.173, 0x3a3440);
    for (let k = 0; k < 8; k++) p.box(0.03, 0.004, 0.004, -0.27 + k * 0.07, 0.268, 0.177, 0xf1d4cc);
    // l'étage : garde-corps devant les fenêtres, jardinières fleuries ; climatiseur au flanc, parabole et ventilation sur le toit
    for (const x of [-0.2, 0.0, 0.2]) {
      p.box(0.14, 0.006, 0.006, x, 0.43, 0.082, 0x3c3c40); for (let k = 0; k < 5; k++) p.box(0.004, 0.05, 0.004, x - 0.06 + k * 0.03, 0.38, 0.082, 0x3c3c40);
      p.box(0.12, 0.02, 0.025, x, 0.432, 0.09, 0xe8e4dc); for (let k = 0; k < 4; k++) p.sphere(0.012, x - 0.045 + k * 0.03, 0.458, 0.09, [0xff7ab8, C.white, 0xd84a3e, 0xf2c23a][k], 0, 0.8);
    }
    p.box(0.04, 0.06, 0.09, 0.35, 0.36, -0.22, 0xe8eaee); p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 10).rotateZ(Math.PI / 2), 0.372, 0.39, -0.22, 0x5d6168);
    hvac(p, 0.14, 0.602, -0.3, 0.12);
    p.cyl(0.004, 0.006, 0.06, 4, -0.2, 0.602, -0.34, C.metal); p.add(new THREE.SphereGeometry(0.045, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(0.9), -0.2, 0.66, -0.33, C.white);
    // chevalet des tarifs sur le trottoir, la coiffeuse sur le pas de la porte, le client qui attend sur le banc
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.07, 0.1, 0.006).translate(0, 0.05, 0), 0.02, 0.012, 0.2 + s * 0.012, 0x2e3438, 0, false, 0, -s * 0.22);
    for (let k = 0; k < 3; k++) p.box(0.04, 0.004, 0.004, 0.02, 0.05 + k * 0.022, 0.228, C.white);
    figure(p, 0.15, 0.12, 0x2a2a2e, 0.4, false, 0xd8a03a);
    seated(p, -0.16, 0.08, 0.3, 0, 0x6a8a4a, 0x4a3426);
  }
  // devant l'échoppe : pavés (puis dalles, puis carrelage), clients qui attendent, pots de fleurs, un vélo à l'âge moderne
  if (age === 2) {
    cobbles(p, -0.46, 0.08, 0.46, 0.46, 0xc8bba2, 0.012, 201, 0.07, 0.05);
    figure(p, 0.3, 0.3, 0x6a8a4a, -2.4); figure(p, 0.18, 0.4, 0x8a5a8a, 2.6, false, 0xc8a070);
    for (const x of [-0.4, 0.42]) { p.cyl(0.03, 0.022, 0.05, 7, x, 0.012, 0.1, C.terracotta); p.sphere(0.04, x, 0.09, 0.1, C.darkgreen, 0, 0.9); }
  } else if (age >= 3) {
    cobbles(p, -0.46, 0.1, 0.46, 0.46, age >= 4 ? 0xd8d4cc : 0xc0bcb4, 0.012, 202, 0.14, 0.11);
    figure(p, 0.28, 0.36, age >= 4 ? 0xd8786c : 0x3c3c48, Math.PI, false, 0x4a3426);
    if (age === 3) lampPost(p, -0.4, 0.4, 0.32);
    else {
      for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.035, 0.006, 4, 12), -0.3 + s * 0.045, 0.047, 0.36, 0x2a2a2e, Math.PI / 2);
      p.box(0.1, 0.006, 0.006, -0.3, 0.07, 0.36, 0xd84a3e, Math.PI / 2);
    }
  }
}

/** Voiture de police garée : caisse blanche à bandeaux bleus, vitres, rampe de gyrophares (qui luit la nuit), roues */
function policeCar(p: Parts, x: number, z: number, ry: number) {
  const c = Math.cos(ry), s = Math.sin(ry), P = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
  const at = (u: number, w: number, fn: (px: number, pz: number) => void) => { const [px, pz] = P(u, w); fn(px, pz); };
  at(0, 0, (px, pz) => { p.box(0.15, 0.06, 0.28, px, 0.045, pz, 0xf4f2ee, ry); p.box(0.152, 0.02, 0.282, px, 0.06, pz, 0x2c4a9a, ry); });
  at(0, -0.02, (px, pz) => { p.box(0.13, 0.05, 0.14, px, 0.105, pz, 0x9fc4dc, ry); p.box(0.134, 0.01, 0.144, px, 0.155, pz, 0xf4f2ee, ry); });
  at(0.03, -0.02, (px, pz) => p.box(0.04, 0.018, 0.03, px, 0.165, pz, 0x3a7aff, ry, true));
  at(-0.03, -0.02, (px, pz) => p.box(0.04, 0.018, 0.03, px, 0.165, pz, 0xff3a3a, ry, true));
  for (const [u, w] of [[-0.075, 0.09], [0.075, 0.09], [-0.075, -0.09], [0.075, -0.09]]) at(u, w, (px, pz) => p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8).rotateZ(Math.PI / 2), px, 0.035, pz, 0x2e2a2c, ry));
}

/**
 * Police (2 × 2) : poste des gardes romain (portique, enseigne rouge, râtelier de lances et de boucliers, brasero, garde),
 * maison du guet au Moyen Âge (tour crénelée et sa lanterne, logis à colombages, pilori, hallebardes, guetteur), poste de
 * police de brique de l'âge industriel (lanterne bleue au-dessus de la porte, plaque, drapeau, fourgon et son cheval,
 * agent en képi), commissariat moderne (bandeau bleu, enseigne lumineuse, entrée vitrée, antenne, parking et voitures de
 * patrouille, barrière, guérite)
 */
function police(p: Parts, age: number) {
  sink(0.012);
  if (age <= 1) {
    p.box(1.1, 0.4, 0.6, -0.15, 0.012, -0.5, C.cream);
    stones(p, -0.15, -0.2, 1.1, 0.012, 0.12, 0, C.stone, 0.6, 221);
    roof(p, -0.15, 0.412, -0.5, { w: 1.1, d: 0.6, h: 0.2, color: C.terracotta, wall: C.cream, tiles: true });
    // portique : colonnes et toit de tuiles, porte, enseigne rouge à frange d'or
    for (const x of [-0.6, -0.3, 0.0, 0.3]) column(p, x, -0.05, 0.34, 0.012, 0.024);
    p.box(1.0, 0.04, 0.3, -0.15, 0.352, -0.12, C.cream);
    p.add(new THREE.BoxGeometry(1.06, 0.03, 0.34), -0.15, 0.4, -0.12, C.terracotta, 0, false, 0, 0.2);
    p.box(0.14, 0.24, 0.02, -0.15, 0.012, -0.195, C.door);
    p.cyl(0.008, 0.008, 0.62, 5, 0.6, 0.012, 0.05, C.wood); p.box(0.012, 0.012, 0.16, 0.6, 0.6, 0.05, C.wood);
    { const f = sway([0.6, 0.6, 0.05], [0, 0, 1], 0.18, 0.8); f.box(0.006, 0.16, 0.13, 0, -0.17, 0, 0xb8322c); f.box(0.007, 0.02, 0.13, 0, -0.17, 0, C.gold); }
    // râtelier : lances et boucliers rouges à l'umbo d'or
    p.box(0.4, 0.02, 0.02, -0.6, 0.25, 0.2, C.darkwood); for (const d of [-0.18, 0.18]) p.box(0.02, 0.26, 0.02, -0.6 + d, 0.012, 0.2, C.darkwood);
    for (let k = 0; k < 5; k++) { p.cyl(0.005, 0.005, 0.36, 4, -0.76 + k * 0.08, 0.012, 0.22, C.wood); p.cone(0.012, 0.04, 4, -0.76 + k * 0.08, 0.372, 0.22, C.metal); }
    for (const x of [-0.7, -0.5]) { p.box(0.08, 0.13, 0.014, x, 0.03, 0.25, 0xb8322c); p.sphere(0.014, x, 0.095, 0.26, C.gold); }
    // brasero, garde à la lance, banc
    p.cyl(0.04, 0.025, 0.1, 6, 0.25, 0.012, 0.12, 0x5a4a40); p.box(0.04, 0.04, 0.04, 0.25, 0.11, 0.12, C.flame, 0, true); smoke(0.25, 0.16, 0.12, 1);
    figure(p, 0.1, 0.05, 0xb8322c, 0);
    p.cyl(0.005, 0.005, 0.3, 4, 0.14, 0.012, 0.07, C.wood); p.cone(0.01, 0.035, 4, 0.14, 0.312, 0.07, C.metal);
    p.box(0.3, 0.02, 0.08, 0.45, 0.06, 0.5, C.stone); for (const d of [-0.12, 0.12]) p.box(0.04, 0.05, 0.07, 0.45 + d, 0.012, 0.5, C.darkstone);
  } else if (age === 2) {
    // tour du guet : moellons, créneaux, lanterne en haut, cloche sous son auvent
    p.box(0.42, 0.9, 0.42, 0.5, 0.012, -0.5, C.stone);
    stones(p, 0.5, -0.29, 0.42, 0.012, 0.91, 0, C.darkstone, 0.55, 222);
    for (let i = 0; i < 4; i++) for (const [dx, dz] of [[-0.18 + i * 0.12, -0.19], [-0.18 + i * 0.12, 0.19], [-0.19, -0.18 + i * 0.12], [0.19, -0.18 + i * 0.12]]) p.box(0.06, 0.07, 0.06, 0.5 + dx, 0.912, -0.5 + dz, C.stone);
    p.box(0.04, 0.05, 0.04, 0.5, 0.95, -0.5, C.flame, 0, true);
    windows(p, [0.5], 0.55, -0.288, 0.05, 0.1, C.stone);
    // logis à colombages, porte, fenêtres
    p.box(0.8, 0.26, 0.56, -0.25, 0.012, -0.48, C.stone);
    p.box(0.84, 0.24, 0.6, -0.25, 0.272, -0.48, C.cream);
    timbers(p, -0.25, -0.178, 0.84, 0.282, 0.51, 0, 5);
    roof(p, -0.25, 0.512, -0.48, { w: 0.84, d: 0.6, h: 0.28, color: C.slate, wall: C.cream, courses: true });
    p.box(0.12, 0.2, 0.02, -0.25, 0.012, -0.195, C.door);
    windows(p, [-0.5, 0.0], 0.08, -0.192, 0.08, 0.09); windows(p, [-0.5, -0.25, 0.0], 0.33, -0.172, 0.07, 0.08);
    p.box(0.012, 0.012, 0.1, -0.08, 0.24, -0.16, C.darkwood); p.box(0.03, 0.045, 0.03, -0.08, 0.19, -0.11, C.flame, 0, true);
    // pilori : poteau et planche percée, sur sa marche de pierre
    p.box(0.18, 0.03, 0.18, -0.45, 0.012, 0.35, C.darkstone);
    p.box(0.03, 0.3, 0.03, -0.45, 0.042, 0.35, C.darkwood);
    p.box(0.18, 0.05, 0.025, -0.45, 0.24, 0.35, C.wood);
    for (const x of [-0.06, 0, 0.06]) p.box(0.022, 0.022, 0.03, -0.45 + x, 0.254, 0.35, 0x3c3028);
    // râtelier de hallebardes, guetteur, tonneau
    p.box(0.3, 0.02, 0.02, 0.15, 0.25, 0.1, C.darkwood);
    for (let k = 0; k < 4; k++) { const x = 0.04 + k * 0.07; p.cyl(0.005, 0.005, 0.4, 4, x, 0.012, 0.12, C.wood); p.box(0.03, 0.04, 0.006, x + 0.01, 0.36, 0.12, C.metal); }
    figure(p, -0.05, 0.0, 0x3c4a6a, 0);
    p.cyl(0.005, 0.005, 0.32, 4, -0.02, 0.012, 0.02, C.wood); p.box(0.03, 0.035, 0.006, -0.01, 0.29, 0.02, C.metal);
    p.cyl(0.04, 0.04, 0.09, 8, 0.6, 0.012, 0.3, 0x9a6a44); for (const y of [0.03, 0.07]) p.cyl(0.042, 0.042, 0.008, 8, 0.6, y, 0.3, 0x6f5640);
    // la cour pavée, close d'un muret de pierre (portail sur la rue, deux lanternes), herbe au pied du muret
    cobbles(p, -0.84, -0.14, 0.84, 0.84, 0xc8bba2, 0.012, 51);
    for (const sd of [-1, 1]) {
      p.box(0.05, 0.1, 0.98, sd * 0.88, 0.012, 0.38, C.stone); p.box(0.07, 0.02, 1.0, sd * 0.88, 0.112, 0.38, C.darkstone);
      p.box(0.72, 0.1, 0.05, sd * 0.53, 0.012, 0.88, C.stone); p.box(0.74, 0.02, 0.07, sd * 0.53, 0.112, 0.88, C.darkstone);
      p.box(0.08, 0.2, 0.08, sd * 0.17, 0.012, 0.88, C.stone); p.box(0.04, 0.05, 0.04, sd * 0.17, 0.212, 0.88, 0xffe2a0, 0, true);
    }
    verge(p, 34, 52, 0.017, (x, z) => Math.abs(x) < 0.82 && z < 0.82 && z > -0.1);
    // abreuvoir et cheval du guet à l'attache, botte de paille, caisses, second garde à la porte
    p.box(0.24, 0.06, 0.1, 0.55, 0.012, 0.66, C.stone); p.box(0.2, 0.006, 0.07, 0.55, 0.068, 0.66, C.water);
    p.box(0.06, 0.07, 0.17, 0.55, 0.09, 0.52, 0x7a5a48); p.box(0.04, 0.07, 0.05, 0.55, 0.14, 0.62, 0x7a5a48);
    for (const [dx, dz] of [[-0.02, -0.06], [0.02, -0.06], [-0.02, 0.06], [0.02, 0.06]]) p.box(0.014, 0.08, 0.014, 0.55 + dx, 0.012, 0.52 + dz, 0x5a4234);
    p.cone(0.09, 0.1, 7, 0.76, 0.012, 0.1, 0xe0c060);
    for (const [x, z] of [[-0.74, 0.0], [-0.66, 0.06]]) p.box(0.08, 0.07, 0.08, x, 0.012, z, C.wood);
    figure(p, 0.08, 0.78, 0x3c4a6a, Math.PI); p.cyl(0.005, 0.005, 0.32, 4, 0.12, 0.012, 0.78, C.wood); p.box(0.03, 0.035, 0.006, 0.13, 0.29, 0.78, C.metal);
  } else if (age === 3) {
    // poste de police : brique sur deux niveaux, bandeaux de pierre, toit d'ardoise, perron, lanterne bleue, plaque
    const brick = 0xb4685c;
    p.box(1.2, 0.62, 0.62, -0.1, 0.012, -0.5, brick);
    stones(p, -0.1, -0.19, 1.2, 0.012, 0.63, 0, dark(brick, 0.86), 0.45, 223);
    for (const y of [0.31, 0.6]) p.box(1.22, 0.025, 0.64, -0.1, y, -0.5, C.cream);
    roof(p, -0.1, 0.632, -0.5, { w: 1.2, d: 0.62, h: 0.2, color: C.slate, wall: brick, courses: true });
    windows(p, [-0.55, -0.35, 0.15, 0.35], 0.1, -0.178, 0.08, 0.12, C.cream); windows(p, [-0.55, -0.35, -0.1, 0.15, 0.35], 0.38, -0.178, 0.08, 0.12, C.cream);
    p.box(0.16, 0.24, 0.02, -0.1, 0.05, -0.18, 0x2c3e6a);
    for (let k = 0; k < 3; k++) p.box(0.3 - k * 0.05, 0.02, 0.06 - k * 0.012, -0.1, 0.012 + k * 0.02, -0.15 + k * 0.006, C.stone);
    p.box(0.012, 0.012, 0.08, -0.1, 0.33, -0.15, 0x3c3c40); p.box(0.05, 0.06, 0.05, -0.1, 0.28, -0.11, 0x6aa8ff, 0, true); p.box(0.06, 0.012, 0.06, -0.1, 0.34, -0.11, 0x3c3c40);
    p.box(0.22, 0.05, 0.012, -0.1, 0.32, -0.172, 0x2c3e6a); for (let k = 0; k < 6; k++) p.box(0.022, 0.024, 0.006, -0.18 + k * 0.032, 0.333, -0.164, 0xf4f2ee);
    // drapeau tricolore, fourgon de police et son cheval, agent en képi, réverbère
    p.cyl(0.006, 0.008, 0.9, 5, 0.62, 0.012, -0.12, C.metal);
    { const f = sway([0.62, 0, -0.12], [0, 1, 0], 0.4, 1.1); [0x2c4a9a, 0xf4f2ee, 0xd84a3e].forEach((c, k) => f.box(0.004, 0.1, 0.05, 0, 0.78, 0.025 + k * 0.05, c)); }
    p.box(0.2, 0.16, 0.32, 0.5, 0.06, 0.4, 0x2c3e6a); p.box(0.21, 0.02, 0.33, 0.5, 0.22, 0.4, 0x1e2a48);
    for (const z of [0.3, 0.5]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateZ(Math.PI / 2), 0.5 + s * 0.11, 0.06, z, 0x7a6355);
    p.box(0.006, 0.04, 0.12, 0.6, 0.12, 0.4, 0xf4f2ee);
    p.box(0.06, 0.07, 0.15, 0.5, 0.1, 0.68, 0x5a3e2e); p.box(0.035, 0.07, 0.05, 0.5, 0.16, 0.76, 0x5a3e2e);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.018, 0.1, 0.018, 0.5 + sx * 0.02, 0.012, 0.68 + sz * 0.05, 0x3e2a20);
    figure(p, 0.15, -0.06, 0x2c3e6a, 0, false, 0x1e2a48);
    p.cyl(0.018, 0.016, 0.02, 8, 0.15, 0.185, -0.06, 0x1e2a48); p.cyl(0.0185, 0.0185, 0.006, 8, 0.15, 0.205, -0.06, 0xd84a3e);
    p.cyl(0.012, 0.012, 0.38, 5, -0.6, 0.012, 0.0, 0x3c4a44); p.box(0.04, 0.05, 0.04, -0.6, 0.39, 0.0, 0xffe2a0, 0, true); p.box(0.05, 0.014, 0.05, -0.6, 0.44, 0.0, 0x3c4a44);
  } else {
    // commissariat : bloc blanc à bandeaux vitrés, bandeau bleu, enseigne lumineuse, entrée vitrée sous auvent, antenne
    const wall = 0xeceae6, blue = 0x2c4a9a;
    p.box(1.3, 0.56, 0.62, -0.15, 0.012, -0.55, wall);
    for (const y of [0.1, 0.34]) p.box(1.24, 0.12, 0.012, -0.15, y, -0.237, C.glass, 0, true);
    for (let x = -0.76; x <= 0.46; x += 0.1) for (const y of [0.1, 0.34]) p.box(0.01, 0.12, 0.018, x, y, -0.234, 0xd8dde2);
    p.box(1.32, 0.06, 0.64, -0.15, 0.5, -0.55, blue);
    p.box(1.34, 0.02, 0.66, -0.15, 0.572, -0.55, 0xd8d6d0);
    p.box(0.5, 0.07, 0.012, -0.15, 0.505, -0.226, 0x1e3070); for (let k = 0; k < 6; k++) p.box(0.05, 0.04, 0.006, -0.3 + k * 0.06, 0.52, -0.218, 0xf4f8ff, 0, true);
    p.box(0.24, 0.22, 0.02, -0.15, 0.012, -0.226, 0x86c4d8, 0, true);
    p.box(0.4, 0.025, 0.24, -0.15, 0.25, -0.12, wall); for (const x of [-0.32, 0.02]) p.cyl(0.012, 0.012, 0.24, 5, x, 0.012, -0.02, C.metal);
    p.box(0.402, 0.02, 0.242, -0.15, 0.24, -0.12, blue);
    // toit : groupes de ventilation, antenne et ses haubans
    for (const x of [-0.6, -0.35]) { p.box(0.14, 0.07, 0.12, x, 0.59, -0.65, 0xb8bcc2); p.cyl(0.035, 0.035, 0.012, 8, x, 0.66, -0.65, 0x5d6878); }
    p.cyl(0.008, 0.012, 0.7, 5, 0.35, 0.59, -0.7, 0x9aa3ad); for (let y = 0.75; y < 1.25; y += 0.15) p.box(0.06, 0.006, 0.006, 0.35, y, -0.7, 0x9aa3ad);
    p.box(0.02, 0.02, 0.02, 0.35, 1.29, -0.7, 0xff4a3a, 0, true);
    // drapeau, parking et voitures de patrouille, barrière rouge et blanche, guérite, bornes, banc
    p.cyl(0.006, 0.008, 0.9, 5, 0.7, 0.012, -0.12, C.metal);
    { const f = sway([0.7, 0, -0.12], [0, 1, 0], 0.4, 1.1); [0x2c4a9a, 0xf4f2ee, 0xd84a3e].forEach((c, k) => f.box(0.004, 0.1, 0.05, 0, 0.78, 0.025 + k * 0.05, c)); }
    p.box(1.0, 0.012, 0.6, 0.25, 0.012, 0.42, 0x6f747a);
    for (let x = -0.15; x <= 0.7; x += 0.24) p.box(0.012, 0.004, 0.32, x, 0.025, 0.5, C.white);
    policeCar(p, -0.03, 0.5, 0); policeCar(p, 0.21, 0.5, 0); p.box(0.15, 0.08, 0.3, 0.45, 0.04, 0.5, 0x3c4a6a); p.box(0.13, 0.05, 0.14, 0.45, 0.12, 0.48, 0x9fc4dc);
    p.box(0.12, 0.2, 0.12, -0.55, 0.012, 0.6, wall); p.box(0.13, 0.02, 0.13, -0.55, 0.212, 0.6, blue); p.box(0.1, 0.06, 0.012, -0.55, 0.11, 0.66, C.glass, 0, true);
    p.box(0.03, 0.1, 0.03, -0.45, 0.012, 0.78, 0x3c3c40);
    for (let k = 0; k < 5; k++) p.box(0.06, 0.016, 0.016, -0.42 + k * 0.06, 0.09, 0.78, k % 2 ? 0xf4f2ee : 0xd84a3e);
    for (const x of [-0.85, -0.75, 0.82]) p.cyl(0.012, 0.012, 0.06, 6, x, 0.012, 0.0, 0x5d6878);
    p.box(0.2, 0.02, 0.06, -0.7, 0.07, -0.12, C.wood); for (const d of [-0.07, 0.07]) p.box(0.016, 0.04, 0.05, -0.7 + d, 0.03, -0.12, 0x5d6878);
    hedge(p, -0.75, 0.3, 0.3, 0.08, 0.06);
    // marches de l'entrée, jardinière sous les vitrages, panneaux solaires sur le toit, caméras aux angles
    for (let k = 0; k < 2; k++) p.box(0.34 - k * 0.06, 0.016, 0.07 - k * 0.025, -0.15, 0.012 + k * 0.016, -0.2 - k * 0.012, 0xd8d6d0);
    planter(p, 0.3, -0.19, 0.3, 0.06);
    solar(p, 0.0, 0.592, -0.45, 3, 0.14, 0.1);
    for (const x of [-0.79, 0.49]) { p.box(0.01, 0.01, 0.04, x, 0.47, -0.22, 0x5d6878); p.box(0.025, 0.02, 0.04, x, 0.455, -0.19, C.white, 0.4); }
    // l'agent à l'entrée, le planton près de la guérite, deux agents qui causent près des voitures, le maître-chien et son chien
    const cop = (x: number, z: number, r: number) => figure(p, x, z, 0x2c3e6a, r, false, 0x1e2a48);
    cop(-0.02, -0.06, 0.3); cop(-0.42, 0.66, 0.2); cop(0.1, 0.24, 2.6); cop(0.22, 0.2, -2.2); cop(-0.62, 0.16, 1.4);
    p.box(0.035, 0.035, 0.08, -0.54, 0.05, 0.16, 0x5a3e2e); p.box(0.025, 0.03, 0.04, -0.54, 0.075, 0.21, 0x3e2a20);
    for (const [dx, dz] of [[-0.01, -0.03], [0.01, -0.03], [-0.01, 0.03], [0.01, 0.03]]) p.box(0.008, 0.04, 0.008, -0.54 + dx, 0.012, 0.16 + dz, 0x3e2a20);
    p.add(new THREE.BoxGeometry(0.006, 0.006, 0.04), -0.54, 0.09, 0.11, 0x5a3e2e, 0, false, 0, 0.6);
    // la moto de patrouille, sa sacoche et son feu bleu
    for (const d of [-0.05, 0.05]) p.add(new THREE.TorusGeometry(0.026, 0.01, 4, 10).rotateY(Math.PI / 2), 0.64, 0.038, 0.5 + d, 0x1e1e22);
    p.box(0.04, 0.04, 0.1, 0.64, 0.05, 0.5, C.white); p.box(0.042, 0.016, 0.06, 0.64, 0.07, 0.49, 0x2c4a9a);
    p.add(new THREE.BoxGeometry(0.05, 0.04, 0.006), 0.64, 0.11, 0.545, 0x9fc4dc, 0, false, 0, -0.4); p.box(0.012, 0.012, 0.012, 0.64, 0.105, 0.44, 0x3a7aff, 0, true);
    // le totem lumineux sur la rue, un arbre au coin
    p.box(0.07, 0.32, 0.035, 0.86, 0.012, 0.8, 0x2c4a9a); for (let k = 0; k < 6; k++) p.box(0.04, 0.026, 0.004, 0.86, 0.29 - k * 0.04, 0.82, 0xf4f8ff, 0, true);
    tree(p, -0.86, 0.84, 0.9);
  }
  // abords : dalles de la cour, mannequin d'exercice et garde en ronde (Antiquité) ; trottoir, réverbères, colonne Morris et
  // passants devant le poste (âge industriel)
  if (age === 1) {
    cobbles(p, -0.86, 0.12, 0.86, 0.88, 0xd9cdb6, 0.012, 211, 0.16, 0.12);
    p.box(0.02, 0.3, 0.02, -0.25, 0.012, 0.62, C.darkwood); p.box(0.18, 0.02, 0.02, -0.25, 0.24, 0.62, C.darkwood);
    p.cyl(0.04, 0.045, 0.12, 7, -0.25, 0.12, 0.62, 0xd8c49a); p.sphere(0.03, -0.25, 0.27, 0.62, 0xd8c49a);
    figure(p, 0.05, 0.72, 0xb8322c, Math.PI / 2); p.cyl(0.005, 0.005, 0.3, 4, 0.09, 0.012, 0.74, C.wood); p.cone(0.01, 0.035, 4, 0.09, 0.312, 0.74, C.metal);
    for (const [x, z] of [[0.84, 0.84], [-0.84, 0.84]]) cypress(p, x, z, 0.28);
  } else if (age === 3) {
    cobbles(p, -0.86, 0.04, 0.86, 0.86, 0xc0bcb4, 0.012, 213, 0.18, 0.14);
    for (const x of [-0.7, 0.7]) lampPost(p, x, 0.8, 0.36);
    p.cyl(0.05, 0.05, 0.22, 10, -0.5, 0.012, 0.6, 0x3f6a4a); p.cyl(0.052, 0.052, 0.12, 10, -0.5, 0.06, 0.6, 0xf2e2b8); p.sphere(0.052, -0.5, 0.24, 0.6, 0x3f6a4a, 0, 0.6);
    figure(p, -0.2, 0.7, 0x5a4a3a, 0.4); figure(p, -0.3, 0.45, 0x3c3c48, 2.8);
  }
}

/** Anneau elliptique couché (lignes d'une piste, bordures) : demi-axes rx, rz, épaisseur w, à la hauteur y */
function ellipseRing(p: Parts, rx: number, rz: number, y: number, w: number, color: number, x = 0, z = 0) {
  p.add(new THREE.TorusGeometry(1, w, 3, 48).rotateX(Math.PI / 2).scale(rx, 1, rz), x, y, z, color);
}

/** Avion de ligne, nez vers +z, posé à y : fuselage blanc à bandeau bleu, hublots, ailes et réacteurs, empennage aux couleurs du village, feux */
export function airliner(p: Parts, x: number, y: number, z: number, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const A = (g: THREE.BufferGeometry, u: number, v: number, w: number, color: number, glow = false) => p.add(g, x + u * c + w * s, y + v, z - u * s + w * c, color, ry, glow);
  A(new THREE.CylinderGeometry(0.05, 0.05, 0.56, 8).rotateX(Math.PI / 2), 0, 0.1, 0, 0xf4f2ee);
  A(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 1, 1.7), 0, 0.1, 0.28, 0xf4f2ee);
  A(new THREE.ConeGeometry(0.05, 0.18, 8).rotateX(-Math.PI / 2), 0, 0.11, -0.37, 0xf4f2ee);
  A(new THREE.BoxGeometry(0.103, 0.014, 0.58), 0, 0.085, 0, 0x3a6ab8);
  A(new THREE.BoxGeometry(0.07, 0.02, 0.04), 0, 0.125, 0.33, 0x2a3440);
  for (let k = 0; k < 8; k++) A(new THREE.BoxGeometry(0.103, 0.012, 0.014), 0, 0.112, -0.2 + k * 0.055, 0xcfe2f0, true);
  A(new THREE.BoxGeometry(0.7, 0.014, 0.12), 0, 0.075, 0.02, 0xe4e2dc);
  for (const sd of [-1, 1]) {
    A(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 8).rotateX(Math.PI / 2), sd * 0.17, 0.05, 0.07, 0x8a8f96);
    A(new THREE.BoxGeometry(0.014, 0.01, 0.014), sd * 0.35, 0.078, 0.02, sd > 0 ? 0x3aff7a : 0xff4a3a, true);
    A(new THREE.BoxGeometry(0.012, 0.05, 0.012), sd * 0.06, 0.025, 0, 0x3c3c40);
  }
  A(new THREE.BoxGeometry(0.012, 0.05, 0.012), 0, 0.025, 0.24, 0x3c3c40);
  A(new THREE.BoxGeometry(0.012, 0.14, 0.1), 0, 0.18, -0.34, 0x3a6ab8);
  A(new THREE.BoxGeometry(0.013, 0.03, 0.1), 0, 0.22, -0.34, 0xe8c66a);
  A(new THREE.BoxGeometry(0.24, 0.012, 0.08), 0, 0.12, -0.36, 0xe4e2dc);
}

/**
 * Navire marchand de l'époque, proue vers +z, ligne de flottaison à y = 0 : cogue à voile carrée rayée et châteaux crénelés
 * (Moyen Âge), vapeur à coque noire, ligne de flottaison rouge, hublots, passerelle blanche, haute cheminée rayée, mâts de
 * charge, canots sur leurs bossoirs (âge industriel), porte-conteneurs à bulbe, château blanc à la poupe et ses piles de
 * conteneurs (époque moderne) ; renvoie le haut de sa cheminée
 */
export function freighter(p: Parts, age: number): [number, number, number] | null {
  /** coque effilée : pont de largeur w, profondeur d sous la flottaison, longueur L ; proue en pointe, poupe arrondie */
  const hull = (w: number, d: number, L: number, top: number, color: number, band: number | null, deck: number) => {
    // flancs droits au-dessus, carène plus étroite en dessous
    p.add(new THREE.BoxGeometry(w, top + d * 0.45, L), 0, (top - d * 0.45) / 2, 0, color);
    p.add(new THREE.BoxGeometry(w * 0.66, d * 0.6, L * 0.96), 0, -d * 0.7, 0, color);
    // la proue en coin, la poupe arrondie
    p.add(new THREE.ConeGeometry(w * 0.71, w, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, (d + top) / w, 1), 0, (top - d) / 2, L / 2 + w / 2 - 0.01, color);
    p.add(new THREE.CylinderGeometry(w / 2 * 0.7, w / 2 * 0.5, d + top, 10, 1, false, Math.PI / 2, Math.PI), 0, (top - d) / 2, -L / 2, color);
    if (band !== null) p.box(w * 1.01, 0.03, L, 0, -0.035, 0, band);
    p.box(w * 0.94, 0.012, L + w * 0.3, 0, top, 0, deck);
  };
  if (age <= 2) {
    // cogue : coque de bois ventrue, châteaux avant et arrière crénelés, mât, voile carrée rayée, hune, pavillon
    hull(0.26, 0.1, 0.42, 0.07, 0x7a5236, null, 0xa07850);
    for (let k = 0; k < 4; k++) p.box(0.27, 0.008, 0.46, 0, -0.06 + k * 0.035, 0, dark(0x7a5236, 0.8 - k * 0.04));
    p.box(0.24, 0.1, 0.12, 0, 0.07, -0.2, 0x8a6040); p.box(0.25, 0.012, 0.13, 0, 0.17, -0.2, 0x6a4430);
    p.box(0.2, 0.08, 0.09, 0, 0.07, 0.24, 0x8a6040); p.box(0.21, 0.012, 0.1, 0, 0.15, 0.24, 0x6a4430);
    for (const [z, n] of [[-0.2, 5], [0.24, 4]] as number[][]) for (let k = 0; k < n; k++) for (const s of [-1, 1]) p.box(0.02, 0.025, 0.02, s * 0.11, z > 0 ? 0.16 : 0.18, z - 0.05 + k * (0.1 / (n - 1)), 0x6a4430);
    p.cyl(0.011, 0.014, 0.66, 6, 0, 0.07, 0.01, 0x5a3e2e);
    const sail = [0xf2e6d0, 0xb8322c];
    for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(0.42, 0.055, 0.01), 0, 0.27 + k * 0.055, 0.03, sail[k % 2], 0, false, 0, -0.06);
    p.box(0.46, 0.012, 0.012, 0, 0.6, 0.03, 0x5a3e2e); p.box(0.4, 0.012, 0.012, 0, 0.26, 0.04, 0x5a3e2e);
    p.cyl(0.03, 0.025, 0.04, 6, 0, 0.66, 0.01, 0x6a4430);
    p.box(0.07, 0.04, 0.004, 0.035, 0.74, 0.01, 0x3a6ab8); p.box(0.07, 0.012, 0.005, 0.035, 0.75, 0.01, 0xe8c66a);
    for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.003, 0.003, 0.5), s * 0.1, 0.38, 0.0, 0x3a3030, 0, false, 0, s * 0.0); p.add(new THREE.BoxGeometry(0.003, 0.62, 0.003), s * 0.08, 0.38, -0.12, 0x3a3030, 0, false, s * 0.13); }
    for (const z of [-0.08, 0.06]) p.box(0.06, 0.05, 0.06, 0.05, 0.08, z, 0x9a6a44);
    return null;
  }
  if (age === 3) {
    // vapeur : coque noire, flottaison rouge, liston blanc, hublots ; passerelle et rouf blancs, cheminée rayée, mâts de
    // charge, canots, bastingage, panneaux de cale
    const L = 0.74;
    hull(0.26, 0.12, L, 0.06, 0x1e1e22, 0xb8322c, 0x9a7a5a);
    p.box(0.262, 0.012, L + 0.06, 0, 0.045, 0, C.white);
    for (let k = 0; k < 9; k++) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 6).rotateZ(Math.PI / 2), s * 0.131, 0.015, -0.3 + k * 0.075, 0xffe2a0, 0, true);
    p.box(0.17, 0.09, 0.22, 0, 0.066, -0.06, C.white); p.box(0.19, 0.012, 0.24, 0, 0.156, -0.06, 0x8a8f96);
    p.box(0.15, 0.06, 0.1, 0, 0.168, -0.02, C.white); p.box(0.17, 0.01, 0.12, 0, 0.228, -0.02, 0x8a8f96);
    for (let k = 0; k < 5; k++) p.box(0.022, 0.024, 0.004, -0.05 + k * 0.025, 0.19, 0.031, 0x86c4d8, 0, true);
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) p.box(0.004, 0.026, 0.026, s * 0.086, 0.09, -0.15 + k * 0.038, 0x86c4d8, 0, true);
    p.cyl(0.036, 0.042, 0.26, 10, 0, 0.16, -0.12, 0x1e1e22); p.cyl(0.0425, 0.0425, 0.05, 10, 0, 0.3, -0.12, 0xb8322c); p.cyl(0.043, 0.043, 0.012, 10, 0, 0.36, -0.12, 0x1e1e22);
    for (const s of [-1, 1]) { p.box(0.04, 0.025, 0.1, s * 0.12, 0.17, -0.1, C.white); p.box(0.004, 0.06, 0.004, s * 0.12, 0.15, -0.14, 0x8a8f96); p.box(0.004, 0.06, 0.004, s * 0.12, 0.15, -0.06, 0x8a8f96); }
    for (const z of [0.2, -0.3]) { p.cyl(0.007, 0.009, 0.42, 5, 0, 0.066, z, 0x6a4a34); p.add(new THREE.BoxGeometry(0.006, 0.006, 0.18), 0, 0.2, z + (z > 0 ? -0.07 : 0.07), 0x6a4a34, 0, false, 0, z > 0 ? 0.6 : -0.6); }
    p.box(0.002, 0.002, 0.52, 0, 0.47, -0.05, 0x3a3030);
    for (const [z, c] of [[0.17, 0x9a6a44], [0.28, 0x6a7a5a]] as number[][]) { p.box(0.14, 0.03, 0.08, 0, 0.066, z, 0x5a4a3a); p.box(0.1, 0.05, 0.06, 0, 0.096, z, c); }
    for (const s of [-1, 1]) for (let k = 0; k < 14; k++) p.box(0.004, 0.03, 0.004, s * 0.12, 0.066, -0.33 + k * 0.05, C.white);
    for (const s of [-1, 1]) p.box(0.004, 0.004, 0.68, s * 0.12, 0.096, 0, C.white);
    p.box(0.06, 0.04, 0.004, 0, 0.2, -0.36, 0x2c4a9a);
    return [0, 0.37, -0.12];
  }
  // porte-conteneurs : coque rouge et bleu nuit à bulbe, château blanc à la poupe, cheminée, piles de conteneurs, grue
  const L = 1.12;
  hull(0.32, 0.12, L, 0.08, 0x23305a, 0xb8322c, 0x5d6878);
  p.sphere(0.06, 0, -0.08, L / 2 + 0.17, 0x23305a, 1, 0.8);
  p.box(0.326, 0.02, L + 0.08, 0, 0.06, 0, C.white);
  p.box(0.28, 0.24, 0.16, 0, 0.085, -0.46, C.white); p.box(0.34, 0.03, 0.14, 0, 0.32, -0.46, C.white);
  for (let k = 0; k < 4; k++) p.box(0.26, 0.022, 0.004, 0, 0.13 + k * 0.045, -0.379, 0x2a3440, 0, true);
  p.box(0.3, 0.03, 0.02, 0, 0.3, -0.385, 0x2a3440, 0, true);
  p.cyl(0.03, 0.03, 0.12, 8, 0, 0.33, -0.52, 0x23305a); p.cyl(0.031, 0.031, 0.03, 8, 0, 0.42, -0.52, 0xb8322c);
  p.cyl(0.004, 0.004, 0.14, 4, 0, 0.35, -0.44, 0x9aa3ad);
  const cols = [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xf28a3c, 0x8a5ad8, 0xe8e4dc];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 2 + ((i + j) % 2); k++) {
    const x = (j - 1) * 0.09, y = 0.08 + k * 0.064, z = -0.3 + i * 0.12, c = cols[(i * 3 + j * 2 + k) % cols.length];
    p.box(0.084, 0.06, 0.112, x, y, z, c);
    for (const dz of [-0.04, 0, 0.04]) p.box(0.086, 0.06, 0.006, x, y, z + dz, dark(c, 0.85));
  }
  p.box(0.02, 0.2, 0.02, 0.13, 0.08, 0.5, 0xf2c23a); p.add(new THREE.BoxGeometry(0.016, 0.016, 0.24), 0.13, 0.28, 0.42, 0xf2c23a, 0, false, 0, 0.3);
  return [0, 0.45, -0.52];
}

/**
 * Port (2 × 2), le quai tourné vers l'eau (+z) : au Moyen Âge, quai de planches sur pilotis, entrepôt à colombages, grue à
 * roue de bois qui tourne, tonneaux et ballots ; port de commerce de l'âge industriel, quai de pierre, entrepôts de brique,
 * grue à vapeur qui pivote, caisses et sacs ; port à conteneurs ensuite, grand hangar, piles de conteneurs, portique et
 * grue mobile, capitainerie et son mât
 */
function harbor(p: Parts, age: number) {
  p.box(1.9, 0.02, 1.9, 0, 0, 0, age <= 2 ? 0xb8a890 : age === 3 ? 0xa8a39a : 0xb8b4ac);
  // bord du quai au-dessus de l'eau, bittes d'amarrage
  if (age <= 2) {
    p.box(1.9, 0.03, 0.34, 0, -0.01, 1.08, C.wood);
    for (let k = 0; k < 15; k++) p.box(0.006, 0.032, 0.34, -0.93 + k * 0.133, -0.009, 1.08, C.darkwood);
    for (let x = -0.85; x <= 0.86; x += 0.34) for (const z of [0.95, 1.22]) p.cyl(0.025, 0.025, 0.5, 6, x, -0.5, z, C.darkwood);
  } else {
    p.box(1.9, 0.1, 0.3, 0, -0.08, 1.07, C.stone);
    stones(p, 0, 1.22, 1.9, -0.3, 0.02, 0, C.darkstone, 0.55, 231);
    p.box(1.9, 0.4, 0.12, 0, -0.42, 1.16, C.darkstone);
  }
  for (let x = -0.8; x <= 0.81; x += 0.4) { p.cyl(0.026, 0.032, 0.05, 7, x, 0.02, 1.15, 0x3c3c40); p.cyl(0.034, 0.034, 0.012, 7, x, 0.07, 1.15, 0x3c3c40); }
  if (age <= 2) {
    // entrepôt à colombages, grande porte, poulie de levage
    p.box(1.0, 0.36, 0.6, -0.35, 0.02, -0.55, C.cream);
    timbers(p, -0.35, -0.25, 1.0, 0.03, 0.37, 0, 6);
    roof(p, -0.35, 0.38, -0.55, { w: 1.0, d: 0.6, h: 0.3, color: 0x8a5a44, wall: C.cream, courses: true });
    p.box(0.22, 0.24, 0.02, -0.35, 0.02, -0.245, C.door);
    p.box(0.012, 0.012, 0.12, -0.35, 0.56, -0.2, C.darkwood);
    // grue de bois à roue de marche : mât, flèche, la roue qui tourne
    p.box(0.06, 0.55, 0.06, 0.5, 0.02, 0.6, C.darkwood);
    p.add(new THREE.BoxGeometry(0.04, 0.04, 0.6), 0.5, 0.6, 0.78, C.darkwood, 0, false, 0, -0.5);
    p.box(0.004, 0.36, 0.004, 0.5, 0.4, 1.02, 0x5a4636);
    const wh = spinner([0.36, 0.2, 0.55], [1, 0, 0], 0.6);
    wh.add(new THREE.TorusGeometry(0.16, 0.02, 4, 16).rotateY(Math.PI / 2), 0, 0, 0, C.wood);
    for (let k = 0; k < 4; k++) wh.add(new THREE.BoxGeometry(0.012, 0.32, 0.012), 0, 0, 0, C.darkwood, 0, false, 0, (k * Math.PI) / 4);
    for (const [x, z] of [[0.1, 0.5], [0.2, 0.62], [0.16, 0.38], [-0.2, 0.4]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0.02, z, 0x9a6a44); for (const y of [0.04, 0.08]) p.cyl(0.042, 0.042, 0.008, 8, x, y, z, 0x6f5640); }
    for (const [x, z] of [[-0.55, 0.45], [-0.7, 0.55]]) p.sphere(0.06, x, 0.07, z, 0xd9c4a0, 0, 0.8);
  } else if (age === 3) {
    // deux entrepôts de brique à pignons, portes, rails du quai, grue à vapeur qui pivote
    const brick = 0xb4685c;
    for (const x of [-0.5, 0.35]) {
      p.box(0.7, 0.44, 0.6, x, 0.02, -0.55, brick);
      stones(p, x, -0.25, 0.7, 0.02, 0.45, 0, dark(brick, 0.86), 0.45, 232 + x * 10);
      roof(p, x, 0.46, -0.55, { w: 0.6, d: 0.7, h: 0.2, ry: Math.PI / 2, color: C.slate, wall: brick, courses: true });
      p.box(0.24, 0.3, 0.02, x, 0.02, -0.245, 0x3f5a4a);
      windows(p, [x - 0.22, x + 0.22], 0.28, -0.245, 0.06, 0.08, C.cream);
    }
    for (const z of [0.72, 0.82]) p.box(1.9, 0.01, 0.014, 0, 0.022, z, 0x8a8e96);
    p.box(0.26, 0.04, 0.26, 0.55, 0.02, 0.62, 0x3c3c40);
    const cr = spinner([0.55, 0.06, 0.62], [0, 1, 0], 0.22);
    cr.box(0.2, 0.18, 0.2, 0, 0, 0, 0x2c3e6a); cr.box(0.22, 0.02, 0.22, 0, 0.18, 0, 0x2a2a2e);
    cr.cyl(0.02, 0.025, 0.14, 6, -0.05, 0.2, -0.05, 0x2a2a2e);
    cr.add(new THREE.BoxGeometry(0.04, 0.04, 0.7), 0, 0.42, 0.32, 0xb8322c, 0, false, 0, -0.55);
    cr.box(0.004, 0.3, 0.004, 0, 0.38, 0.62, 0x2a2a2e); cr.box(0.06, 0.04, 0.06, 0, 0.34, 0.62, 0x9a6a44);
    for (const [x, z] of [[0.0, 0.5], [-0.12, 0.46], [-0.06, 0.6], [-0.6, 0.5], [-0.5, 0.62]]) p.box(0.09, 0.08, 0.09, x, 0.02, z, 0xb48a5e, x * 3);
    for (const [x, z] of [[0.15, 0.3], [0.25, 0.34]]) p.sphere(0.05, x, 0.06, z, 0xd9c4a0, 0, 0.8);
    p.cyl(0.012, 0.012, 0.38, 5, -0.85, 0.02, 0.3, 0x3c4a44); p.box(0.04, 0.05, 0.04, -0.85, 0.4, 0.3, 0xffe2a0, 0, true);
  } else {
    // grand hangar de tôle, capitainerie, piles de conteneurs, portique à conteneurs, grue mobile qui pivote
    p.box(0.9, 0.42, 0.62, -0.45, 0.02, -0.6, 0x8a9aaa);
    for (let x = -0.88; x < 0; x += 0.06) p.box(0.008, 0.42, 0.63, x, 0.02, -0.6, 0x7a8a9a);
    p.add(new THREE.BoxGeometry(0.94, 0.03, 0.66), -0.45, 0.47, -0.6, 0x6a7a8a, 0, false, 0, -0.08);
    p.box(0.3, 0.32, 0.02, -0.45, 0.02, -0.285, 0x5d6878);
    p.box(0.22, 0.3, 0.22, 0.72, 0.02, -0.72, 0xf4f2ee); p.box(0.24, 0.06, 0.24, 0.72, 0.32, -0.72, C.glass, 0, true); p.box(0.25, 0.02, 0.25, 0.72, 0.38, -0.72, 0x3a6ab8);
    p.cyl(0.006, 0.008, 0.6, 5, 0.86, 0.02, -0.55, C.metal); p.box(0.004, 0.08, 0.12, 0.86, 0.5, -0.5, 0x3a6ab8);
    const cols = [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xf28a3c, 0x8a5ad8, 0xe8e4dc];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 1 + ((i * 7 + j * 3) % 3); k++)
      p.box(0.24, 0.1, 0.1, 0.25 + j * 0.26 - 0.26, 0.02 + k * 0.102, -0.1 + i * 0.11, cols[(i * 5 + j * 3 + k) % cols.length]);
    // portique : deux jambes, la poutre qui avance au-dessus de l'eau, le chariot et son conteneur
    for (const x of [-0.75, -0.35]) for (const z of [0.55, 0.85]) p.box(0.03, 0.75, 0.03, x, 0.02, z, 0x3c7fd8);
    for (const x of [-0.75, -0.35]) p.box(0.04, 0.04, 0.9, x, 0.77, 0.9, 0x3c7fd8);
    p.box(0.44, 0.04, 0.04, -0.55, 0.77, 0.55, 0x3c7fd8);
    p.box(0.44, 0.05, 0.08, -0.55, 0.72, 1.15, 0xf2c23a); p.box(0.004, 0.2, 0.004, -0.55, 0.52, 1.15, 0x2a2a2e); p.box(0.24, 0.1, 0.1, -0.55, 0.42, 1.15, 0xd84a3e);
    const cr = spinner([0.6, 0.06, 0.6], [0, 1, 0], 0.25);
    cr.box(0.18, 0.14, 0.18, 0, 0, 0, 0xf2c23a); cr.box(0.08, 0.1, 0.08, 0.05, 0.14, -0.05, 0x9fc4dc);
    cr.add(new THREE.BoxGeometry(0.03, 0.03, 0.8), 0, 0.42, 0.34, 0xf2c23a, 0, false, 0, -0.7);
    cr.box(0.003, 0.25, 0.003, 0, 0.47, 0.66, 0x2a2a2e);
    p.box(0.3, 0.06, 0.3, 0.6, 0.02, 0.6, 0x3c3c40);
  }
}

/** Aéroport (3 × 3) : piste et ses marques, balisage lumineux, voie de circulation, aire de stationnement et son avion, aérogare vitrée et passerelle, tour de contrôle, hangar, manche à air, parking */
/**
 * Grand aéroport (4 × 4), façade vers +z : piste le long de x (seuils en touches de piano, numéros, zones de toucher,
 * marques de visée, axe, feux de bord), voies de circulation balisées de bleu jusqu'à l'aire de trafic, poste de l'avion qui
 * part ; un long-courrier à la passerelle de l'aérogare (façade vitrée, toit en vague, enseigne), chariots à bagages, tracteur,
 * camion-citerne et escalier ; tour de contrôle et sa vigie, hangar voûté, radar qui tourne, dépôt de carburant, caserne des
 * pompiers de l'aéroport, manche à air
 */
function airportBig(p: Parts) {
  const asphalt = 0x4f535a, taxi = 0x5d6169, apron = 0xb8b4ac, yel = 0xf2c23a, rz = 1.12;
  p.box(3.86, 0.012, 3.86, 0, 0, 0, 0x9ccf92);
  for (let k = 0; k < 8; k++) p.box(3.86, 0.003, 0.24, 0, 0.012, -1.8 + k * 0.48, k % 2 ? 0x94c88a : 0xa4d69a);
  // la piste et ses marques
  p.box(3.84, 0.014, 0.56, 0, 0.012, rz, asphalt);
  for (let x = -1.2; x <= 1.21; x += 0.24) p.box(0.12, 0.004, 0.014, x, 0.027, rz, C.white);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) p.box(0.14, 0.004, 0.028, sx * 1.74, 0.027, rz - 0.21 + k * 0.06, C.white);
    for (const dz of [-0.07, 0.07]) p.box(0.05, 0.004, 0.04, sx * 1.56, 0.027, rz + dz, C.white);
    for (const dz of [-0.14, 0.14]) { p.box(0.16, 0.004, 0.05, sx * 1.3, 0.027, rz + dz, C.white); for (const d2 of [-0.04, 0.04]) p.box(0.06, 0.004, 0.02, sx * 1.48, 0.027, rz + dz + d2, C.white); }
    p.box(0.02, 0.004, 0.54, sx * 1.9, 0.027, rz, C.white);
    for (let k = 0; k < 7; k++) p.box(0.016, 0.012, 0.016, sx * 1.9, 0.026, rz - 0.24 + k * 0.08, sx > 0 ? 0x3aff7a : 0xff4a3a, 0, true);
  }
  for (const z of [rz - 0.26, rz + 0.26]) p.box(3.8, 0.004, 0.012, 0, 0.027, z, C.white);
  for (let x = -1.8; x <= 1.81; x += 0.24) for (const z of [rz - 0.3, rz + 0.3]) p.box(0.016, 0.014, 0.016, x, 0.026, z, 0xfff1c9, 0, true);
  // les voies de circulation (axe jaune, feux bleus, marques d'attente) et l'aire de trafic
  for (const x of [-0.6, 1.72]) {
    p.box(0.22, 0.014, 1.5, x, 0.012, 0.15, taxi);
    p.box(0.012, 0.004, 1.5, x, 0.027, 0.15, yel);
    for (let z = -0.5; z < 0.8; z += 0.18) for (const s of [-1, 1]) p.box(0.012, 0.012, 0.012, x + s * 0.12, 0.026, z, 0x4a8aff, 0, true);
    for (const d of [0, 0.03]) p.box(0.22, 0.004, 0.01, x, 0.027, 0.76 + d, yel);
  }
  p.box(3.84, 0.014, 1.0, 0, 0.012, -0.7, apron);
  for (let x = -1.9; x < 1.9; x += 0.32) p.box(0.004, 0.003, 1.0, x, 0.027, -0.7, dark(apron, 0.9));
  p.box(2.4, 0.004, 0.012, 0.56, 0.027, -0.45, yel);
  p.box(0.012, 0.004, 0.34, 0.6, 0.027, -0.62, yel); p.box(0.12, 0.004, 0.012, 1.1, 0.027, -0.45, C.white);
  for (const x of [-1.3, -0.15]) { p.box(0.012, 0.004, 0.62, x, 0.027, -0.95, yel); p.box(0.16, 0.004, 0.012, x, 0.027, -0.66, yel); }
  // le long-courrier à la passerelle, l'autre poste libre
  airliner(p, -1.3, 0.012, -0.86, Math.PI);
  // l'aérogare : façade vitrée, montants, toit en vague, enseigne, passerelles télescopiques
  p.box(2.3, 0.36, 0.5, -0.72, 0.012, -1.62, 0xe8eaee);
  p.box(2.2, 0.26, 0.012, -0.72, 0.05, -1.366, C.glass, 0, true);
  for (let k = 0; k <= 16; k++) p.box(0.012, 0.27, 0.016, -1.82 + k * 0.1375, 0.045, -1.362, 0xd8dde2);
  p.box(2.3, 0.012, 0.02, -0.72, 0.18, -1.362, 0xd8dde2);
  for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(0.4, 0.025, 0.62), -1.72 + k * 0.4, 0.4, -1.6, 0xf4f2ee, 0, false, k % 2 ? 0.08 : -0.08);
  p.box(0.7, 0.06, 0.02, -0.72, 0.31, -1.355, 0x3a6ab8); for (let k = 0; k < 9; k++) p.box(0.04, 0.03, 0.006, -1.0 + k * 0.07, 0.325, -1.345, 0xfff1c9, 0, true);
  for (const x of [-1.3, -0.15]) {
    p.box(0.08, 0.08, 0.42, x + 0.16, 0.13, -1.12, 0xd8dde2); p.box(0.082, 0.02, 0.42, x + 0.16, 0.2, -1.12, 0x8a8f96);
    p.cyl(0.03, 0.03, 0.13, 8, x + 0.16, 0.012, -0.95, 0x8a8f96); p.box(0.1, 0.1, 0.1, x + 0.16, 0.12, -0.9, 0xe8eaee);
  }
  // la vie de l'aire : chariots à bagages et leur tracteur, camion-citerne, escalier, cônes
  for (let k = 0; k < 3; k++) { p.box(0.07, 0.03, 0.1, -1.76 + k * 0.09, 0.02, -0.36, 0x8a8f96); p.box(0.06, 0.04, 0.09, -1.76 + k * 0.09, 0.05, -0.36, [0xd84a3e, 0x3c7fd8, 0xf2c23a][k]); }
  p.box(0.08, 0.05, 0.1, -1.86, 0.02, -0.36, yel);
  p.box(0.1, 0.06, 0.3, 0.05, 0.02, -1.0, C.white); p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10).rotateX(Math.PI / 2), 0.05, 0.11, -1.04, 0xd8dde2); p.box(0.1, 0.07, 0.08, 0.05, 0.02, -0.82, 0xd84a3e);
  p.add(new THREE.BoxGeometry(0.06, 0.012, 0.22), -1.02, 0.08, -1.1, 0xd8dde2, 0, false, 0, -0.5); p.box(0.08, 0.04, 0.12, -1.02, 0.012, -1.01, yel);
  for (const [x, z] of [[-0.9, -0.42], [-1.3, -0.42], [0.95, -0.3]]) p.cone(0.012, 0.035, 6, x, 0.027, z, 0xf28a3c);
  // la tour de contrôle : fût, vigie vitrée en surplomb, toit, antennes, feu rouge
  p.box(0.3, 0.16, 0.3, 1.5, 0.012, -1.55, 0xd8d6d0);
  p.cyl(0.075, 0.095, 1.2, 10, 1.5, 0.17, -1.55, 0xe4e2dc);
  for (let y = 0.4; y < 1.3; y += 0.2) p.box(0.02, 0.04, 0.012, 1.5, y, -1.46, C.glass, 0, true);
  p.cyl(0.17, 0.12, 0.05, 10, 1.5, 1.36, -1.55, 0xd8d6d0);
  p.cyl(0.18, 0.16, 0.13, 10, 1.5, 1.41, -1.55, 0x6a9ac0, true);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; p.box(0.008, 0.13, 0.008, 1.5 + Math.sin(a) * 0.17, 1.41, -1.55 + Math.cos(a) * 0.17, 0x3a4048); }
  p.cyl(0.21, 0.2, 0.03, 10, 1.5, 1.54, -1.55, 0x5d6878);
  p.cyl(0.006, 0.006, 0.24, 4, 1.46, 1.57, -1.55, 0x9aa3ad); p.box(0.022, 0.022, 0.022, 1.46, 1.8, -1.55, 0xff4a3a, 0, true);
  p.box(0.1, 0.012, 0.012, 1.56, 1.66, -1.55, 0x9aa3ad); p.cyl(0.004, 0.004, 0.1, 4, 1.6, 1.57, -1.52, 0x9aa3ad);
  // le hangar voûté, sa grande porte, l'avion d'affaires qu'on y prépare
  p.add(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 14, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0.8, 0.012, -1.58, 0xb8c2cc);
  for (let k = 0; k < 6; k++) p.add(new THREE.TorusGeometry(0.345, 0.006, 3, 14, Math.PI), 0.8, 0.012, -1.86 + k * 0.115, 0x8a96a2);
  p.add(new THREE.CylinderGeometry(0.3, 0.3, 0.012, 14, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0.8, 0.012, -1.265, 0x2a3038);
  for (let k = 0; k < 5; k++) p.box(0.012, 0.2, 0.004, 0.6 + k * 0.1, 0.012, -1.258, 0xf2c23a);
  // le radar sur son pylône, qui tourne
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.012, 0.5, 0.012).translate(0, 0.25, 0), 1.05 + dx * 0.05, 0.012, 0.35 + dz * 0.05, 0x8a8f96, 0, false, -dx * 0.06, dz * 0.06);
  p.box(0.08, 0.03, 0.08, 1.05, 0.5, 0.35, 0x5d6878);
  const radar = turning([1.05, 0.54, 0.35], [0, 1, 0], 0.25);
  radar.add(new THREE.BoxGeometry(0.3, 0.07, 0.012).translate(0, 0.05, 0), 0, 0, 0.02, 0xe4e2dc, 0, false, 0, -0.25);
  radar.box(0.03, 0.04, 0.03, 0, 0, 0, 0x3c3c40);
  // le dépôt de carburant, la caserne des pompiers de l'aéroport et son engin, la manche à air, l'antenne d'alignement
  for (const [x, z] of [[-1.62, 0.32], [-1.4, 0.32], [-1.51, 0.12]]) { p.cyl(0.09, 0.09, 0.14, 12, x, 0.012, z, 0xe8eaee); p.cyl(0.092, 0.092, 0.012, 12, x, 0.15, z, 0xd84a3e); }
  p.box(0.5, 0.012, 0.03, -1.5, 0.012, 0.47, 0x8a8f96);
  p.box(0.42, 0.22, 0.28, 0.35, 0.012, 0.32, 0xe8e4dc); p.box(0.44, 0.03, 0.3, 0.35, 0.23, 0.32, 0xd84a3e);
  for (const x of [0.25, 0.45]) p.box(0.14, 0.15, 0.012, x, 0.012, 0.465, 0x6a7a8a);
  p.box(0.12, 0.08, 0.24, 0.25, 0.012, 0.62, 0xd84a3e); p.box(0.11, 0.04, 0.06, 0.25, 0.09, 0.72, 0x9fc4dc);
  p.cyl(0.006, 0.006, 0.4, 4, -0.05, 0.012, 0.7, 0x9aa3ad);
  const sock = sway([-0.05, 0.39, 0.7], [0, 1, 0], 0.5, 0.4);
  for (let k = 0; k < 4; k++) sock.add(new THREE.CylinderGeometry(0.026 - k * 0.004, 0.022 - k * 0.004, 0.035, 6).rotateZ(Math.PI / 2), 0.03 + k * 0.035, 0, 0, k % 2 ? C.white : 0xf28a3c);
  for (const [x, z] of [[-1.85, -0.05], [0.95, 0.66]]) tree(p, x, z, 0.8);
}

/** Les aires de l'héliport (repère du bâtiment : centre de l'emprise, façade vers +z) où se posent ses hélicoptères */
export const HELIPADS: [number, number, number][] = [[-0.45, 0.06, 0.35], [0.45, 0.06, 0.35]];

/**
 * Héliport (2 × 2, époque moderne) : deux aires surélevées cerclées de jaune, leur grand H blanc et leurs feux verts, filet
 * de sécurité ; hangar à porte relevée et l'hélicoptère qu'on y entretient ; salon des passagers vitré, sa terrasse sur le
 * toit et son parasol, enseigne ; manche à air, phare tournant sur son mât, camion d'avitaillement, chariot d'extincteur,
 * bancs et massifs
 */
function heliport(p: Parts) {
  const conc = 0xc4c0b8, pad = 0x4f535a, yel = 0xf2c23a;
  p.box(1.92, 0.012, 1.92, 0, 0, 0, 0x9ccf92);
  p.box(1.84, 0.014, 1.0, 0, 0.012, 0.38, conc);
  for (let x = -0.9; x < 0.92; x += 0.3) p.box(0.004, 0.003, 1.0, x, 0.027, 0.38, dark(conc, 0.9));
  // les aires : plots, plateau, anneau jaune, H, feux, filet
  for (const [x, , z] of HELIPADS) {
    p.cyl(0.36, 0.38, 0.04, 20, x, 0.012, z, 0x8a8f96);
    p.cyl(0.34, 0.34, 0.012, 20, x, 0.05, z, pad);
    p.add(new THREE.TorusGeometry(0.29, 0.016, 3, 24).rotateX(Math.PI / 2), x, 0.063, z, yel);
    for (const s of [-1, 1]) p.box(0.04, 0.004, 0.26, x + s * 0.08, 0.062, z, C.white);
    p.box(0.16, 0.004, 0.04, x, 0.062, z, C.white);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p.box(0.02, 0.014, 0.02, x + Math.cos(a) * 0.33, 0.058, z + Math.sin(a) * 0.33, 0x3aff7a, 0, true); }
    p.add(new THREE.TorusGeometry(0.38, 0.006, 3, 24).rotateX(Math.PI / 2), x, 0.05, z, 0x5d6168);
  }
  // le hangar : porte relevée, intérieur sombre, l'hélicoptère en entretien, l'établi
  p.box(0.8, 0.36, 0.56, 0.48, 0.012, -0.6, 0xd8dce2);
  p.add(new THREE.BoxGeometry(0.84, 0.03, 0.6), 0.48, 0.38, -0.6, 0x8a96a2, 0, false, 0, 0.08);
  for (let k = 0; k < 8; k++) p.box(0.004, 0.36, 0.565, 0.1 + k * 0.1, 0.012, -0.6, 0xc4c8ce);
  p.box(0.62, 0.26, 0.012, 0.48, 0.012, -0.315, 0x2a3038);
  p.box(0.66, 0.05, 0.03, 0.48, 0.3, -0.3, 0x5d6878);
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(1, 0.8, 1.5), 0.48, 0.09, -0.5, 0xf2c23a); p.box(0.03, 0.03, 0.22, 0.48, 0.09, -0.7, 0xf2c23a);
  p.box(0.12, 0.05, 0.05, 0.75, 0.012, -0.42, 0x6a4a34);
  // le salon des passagers : vitré, toit-terrasse, parasol, enseigne
  p.box(0.62, 0.26, 0.5, -0.5, 0.012, -0.62, 0xf4f2ee);
  p.box(0.58, 0.18, 0.012, -0.5, 0.05, -0.364, C.glass, 0, true);
  for (let k = 0; k <= 5; k++) p.box(0.012, 0.19, 0.016, -0.79 + k * 0.116, 0.045, -0.36, 0xd8dde2);
  p.box(0.66, 0.02, 0.54, -0.5, 0.27, -0.62, 0x5d6878);
  for (const s of [-1, 1]) p.box(0.66, 0.05, 0.006, -0.5, 0.29, -0.62 + s * 0.27, 0xbfe0ee);
  p.cyl(0.006, 0.006, 0.16, 4, -0.5, 0.29, -0.62, 0x8a8f96); p.cone(0.14, 0.05, 8, -0.5, 0.42, -0.62, 0xd84a3e);
  p.box(0.12, 0.012, 0.12, -0.5, 0.33, -0.62, 0xe8e4dc);
  p.box(0.36, 0.05, 0.012, -0.5, 0.2, -0.355, 0x3a6ab8); for (let k = 0; k < 6; k++) p.box(0.03, 0.025, 0.004, -0.62 + k * 0.045, 0.21, -0.347, 0xfff1c9, 0, true);
  // la manche à air, le phare tournant, le camion d'avitaillement, l'extincteur, bancs et massifs
  p.cyl(0.006, 0.006, 0.42, 4, 0.88, 0.012, 0.86, 0x9aa3ad);
  const sock = sway([0.88, 0.41, 0.86], [0, 1, 0], 0.5, 0.4);
  for (let k = 0; k < 4; k++) sock.add(new THREE.CylinderGeometry(0.024 - k * 0.004, 0.02 - k * 0.004, 0.032, 6).rotateZ(Math.PI / 2), -0.03 - k * 0.032, 0, 0, k % 2 ? C.white : 0xf28a3c);
  p.cyl(0.008, 0.01, 0.6, 5, -0.9, 0.012, -0.25, 0x8a8f96);
  const beacon = turning([-0.9, 0.62, -0.25], [0, 1, 0], 0.4);
  beacon.box(0.05, 0.035, 0.03, 0, 0, 0.012, 0x3aff7a, 0, true); beacon.box(0.05, 0.035, 0.03, 0, 0, -0.012, C.white, 0, true);
  p.box(0.12, 0.08, 0.26, 0.0, 0.012, -0.2, 0xd84a3e); p.box(0.11, 0.05, 0.07, 0.0, 0.09, -0.1, 0x9fc4dc); p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10).rotateX(Math.PI / 2), 0.0, 0.12, -0.25, 0xe8eaee);
  p.cyl(0.02, 0.02, 0.05, 6, 0.18, 0.012, 0.05, 0xd84a3e); p.box(0.04, 0.012, 0.03, 0.18, 0.012, 0.08, 0x3c3c40);
  for (const x of [-0.75, -0.25]) { p.box(0.16, 0.02, 0.05, x, 0.05, -0.28, C.wood); for (const d of [-0.06, 0.06]) p.box(0.012, 0.04, 0.04, x + d, 0.012, -0.28, C.metal); }
  for (const [x, z] of [[-0.88, 0.88], [-0.15, 0.9], [0.15, -0.92]]) p.sphere(0.06, x, 0.05, z, 0x6fa85a, 0, 0.8);
  p.box(1.84, 0.04, 0.012, 0, 0.012, 0.88, 0x8a8f96);
}

/**
 * Château d'eau : à l'âge industriel, cuve d'acier rivetée à toit conique et lanternon sur sa tour de brique à bandeaux de
 * pierre, échelle, garde-corps et conduite ; ensuite, château d'eau de béton en corolle sur son fût, bandeau aux couleurs du
 * village, antennes et feu ; à son pied, la maisonnette des pompes et sa clôture
 */
function watertower(p: Parts, age: number) {
  p.box(0.84, 0.012, 0.84, 0, 0, 0, 0x9ccf92);
  // la maisonnette des pompes, la clôture
  p.box(0.22, 0.16, 0.18, 0.26, 0.012, 0.24, age >= 4 ? 0xe8e4dc : 0xb4685c); p.box(0.24, 0.02, 0.2, 0.26, 0.17, 0.24, 0x5d6878);
  p.box(0.06, 0.11, 0.008, 0.26, 0.012, 0.334, C.door);
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) { p.box(0.008, 0.08, 0.008, -0.38 + k * 0.095, 0.012, s * 0.4, 0x8a8f96); p.box(0.008, 0.08, 0.008, s * 0.4, 0.012, -0.38 + k * 0.095, 0x8a8f96); }
  for (const s of [-1, 1]) { p.box(0.8, 0.008, 0.008, 0, 0.07, s * 0.4, 0x8a8f96); p.box(0.008, 0.008, 0.8, s * 0.4, 0.07, 0, 0x8a8f96); }
  if (age <= 3) {
    // la tour de brique, ses bandeaux, ses fenêtres
    const brick = 0xb4685c;
    p.cyl(0.15, 0.18, 0.72, 12, -0.08, 0.012, -0.08, brick);
    for (const y of [0.25, 0.5, 0.72]) p.cyl(0.165 - y * 0.03, 0.17 - y * 0.03, 0.03, 12, -0.08, y, -0.08, 0xd8d0c0);
    for (const y of [0.15, 0.4, 0.6]) p.box(0.04, 0.07, 0.012, -0.08, y, 0.09, 0x3a4048);
    p.box(0.07, 0.13, 0.012, -0.08, 0.012, 0.095, C.door);
    // la cuve rivetée, son toit, son lanternon, son garde-corps et son échelle
    p.cyl(0.24, 0.22, 0.26, 16, -0.08, 0.74, -0.08, 0x6a7a8a);
    for (const y of [0.8, 0.87, 0.94]) p.cyl(0.243, 0.243, 0.008, 16, -0.08, y, -0.08, 0x4a5560);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; p.box(0.008, 0.26, 0.008, -0.08 + Math.sin(a) * 0.242, 0.74, -0.08 + Math.cos(a) * 0.242, 0x5a6670); }
    p.cone(0.26, 0.14, 16, -0.08, 1.0, -0.08, 0x4a5560);
    p.cyl(0.04, 0.04, 0.05, 8, -0.08, 1.12, -0.08, 0x4a5560); p.cone(0.05, 0.05, 8, -0.08, 1.17, -0.08, 0x3a4048);
    p.add(new THREE.TorusGeometry(0.27, 0.006, 3, 20).rotateX(Math.PI / 2), -0.08, 0.8, -0.08, 0x3a4048);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p.box(0.005, 0.05, 0.005, -0.08 + Math.sin(a) * 0.27, 0.75, -0.08 + Math.cos(a) * 0.27, 0x3a4048); }
    p.box(0.04, 0.72, 0.006, 0.1, 0.03, -0.08, 0x3a4048); for (let k = 0; k < 12; k++) p.box(0.04, 0.005, 0.01, 0.1, 0.06 + k * 0.06, -0.08, 0x3a4048);
    p.cyl(0.02, 0.02, 0.6, 6, -0.25, 0.03, -0.08, 0x4a5560);
    p.box(0.1, 0.05, 0.004, -0.08, 0.84, 0.163, 0xe8e0c8); for (let k = 0; k < 4; k++) p.box(0.016, 0.02, 0.005, -0.11 + k * 0.022, 0.855, 0.166, 0x3a3030);
  } else {
    // le fût de béton cannelé, la corolle, son bandeau et sa frise, la coupole, les antennes et le feu
    p.cyl(0.07, 0.1, 0.7, 12, -0.08, 0.012, -0.08, 0xe8e4dc);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.box(0.02, 0.7, 0.02, -0.08 + Math.sin(a) * 0.085, 0.012, -0.08 + Math.cos(a) * 0.085, 0xd8d4cc, a); }
    p.cyl(0.3, 0.08, 0.24, 18, -0.08, 0.7, -0.08, 0xf0ece4);
    p.cyl(0.305, 0.3, 0.1, 18, -0.08, 0.94, -0.08, 0x3a6ab8);
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; p.box(0.03, 0.02, 0.006, -0.08 + Math.sin(a) * 0.305, 0.98, -0.08 + Math.cos(a) * 0.305, k % 2 ? 0xf2c23a : C.white, a); }
    p.sphere(0.3, -0.08, 1.04, -0.08, 0xf0ece4, 1, 0.25);
    for (const [dx, dz] of [[0.12, 0.05], [-0.1, -0.12]]) { p.cyl(0.005, 0.005, 0.18, 4, -0.08 + dx, 1.06, -0.08 + dz, 0x8a8f96); p.box(0.03, 0.05, 0.012, -0.08 + dx, 1.16, -0.08 + dz, 0xd8dce2); }
    p.box(0.022, 0.022, 0.022, -0.08, 1.15, -0.08, 0xff4a3a, 0, true);
    p.box(0.05, 0.16, 0.012, -0.08, 0.012, 0.022, 0x5d6878);
  }
}

/** Aéroport d'une ancienne partie, resté en 3 × 3 faute de place pour s'agrandir */
function airport(p: Parts) {
  p.box(2.84, 0.012, 2.84, 0, 0, 0, 0x9ccf92);
  p.box(2.84, 0.014, 0.52, 0, 0.012, 0.8, 0x5d6169);
  for (let x = -1.2; x <= 1.21; x += 0.24) p.box(0.12, 0.004, 0.016, x, 0.027, 0.8, C.white);
  for (const sx of [-1, 1]) { for (let k = 0; k < 6; k++) p.box(0.1, 0.004, 0.03, sx * 1.3, 0.027, 0.62 + k * 0.072, C.white); p.box(0.03, 0.004, 0.44, sx * 1.12, 0.027, 0.8, C.white); }
  for (let x = -1.38; x <= 1.39; x += 0.23) for (const z of [0.555, 1.045]) p.box(0.016, 0.012, 0.016, x, 0.026, z, 0xfff1c9, 0, true);
  p.box(0.18, 0.014, 0.6, 0.95, 0.012, 0.25, 0x5d6169); p.box(0.012, 0.004, 0.6, 0.95, 0.027, 0.25, 0xf2c23a);
  p.box(1.7, 0.014, 0.66, 0.4, 0.012, -0.22, 0xb8b4ac);
  for (const x of [-0.1, 0.5]) p.box(0.012, 0.004, 0.5, x, 0.027, -0.22, 0xf2c23a);
  airliner(p, 0.2, 0.012, -0.28, Math.PI / 2);
  // aérogare : longue façade vitrée, toit en vague, passerelle d'embarquement
  p.box(1.1, 0.3, 0.46, -0.78, 0.012, -1.0, 0xe8eaee);
  p.box(1.0, 0.2, 0.012, -0.78, 0.06, -0.765, C.glass, 0, true);
  for (let k = 0; k <= 8; k++) p.box(0.012, 0.21, 0.016, -1.28 + k * 0.125, 0.055, -0.762, 0xd8dde2);
  p.add(new THREE.BoxGeometry(1.2, 0.03, 0.56), -0.78, 0.33, -1.0, 0xf4f2ee, 0, false, 0, 0.1);
  p.box(0.5, 0.05, 0.02, -0.78, 0.25, -0.758, 0x3a6ab8); for (let k = 0; k < 8; k++) p.box(0.04, 0.026, 0.006, -0.95 + k * 0.05, 0.262, -0.748, 0xffe8b0, 0, true);
  p.box(0.08, 0.08, 0.36, -0.45, 0.12, -0.6, 0xd8dde2); p.box(0.04, 0.12, 0.04, -0.45, 0.012, -0.44, 0x8a8f96);
  // tour de contrôle, vigie vitrée, antenne et son feu
  p.cyl(0.07, 0.09, 0.85, 8, 1.15, 0.012, -1.1, 0xd8d6d0);
  p.cyl(0.14, 0.11, 0.12, 8, 1.15, 0.86, -1.1, C.glass, true);
  p.cyl(0.15, 0.15, 0.03, 8, 1.15, 0.98, -1.1, 0x5d6878);
  p.cyl(0.006, 0.006, 0.2, 4, 1.15, 1.01, -1.1, 0x9aa3ad); p.box(0.02, 0.02, 0.02, 1.15, 1.21, -1.1, 0xff4a3a, 0, true);
  // hangar, manche à air, parking et camion-citerne
  p.box(0.6, 0.34, 0.5, 0.45, 0.012, -1.05, 0xb8c2cc); p.add(new THREE.BoxGeometry(0.64, 0.03, 0.54), 0.45, 0.36, -1.05, 0x8a96a2, 0, false, 0, 0.06);
  p.box(0.46, 0.28, 0.02, 0.45, 0.012, -0.795, 0x6a7a8a);
  p.cyl(0.006, 0.006, 0.4, 4, -1.3, 0.012, 0.4, 0x9aa3ad); p.add(new THREE.ConeGeometry(0.028, 0.12, 6).rotateZ(Math.PI / 2), -1.24, 0.38, 0.4, 0xf28a3c);
  p.box(0.6, 0.012, 0.36, -0.9, 0.012, -0.5, 0x6f747a);
  for (const [x, c] of [[-1.1, 0xd84a3e], [-0.95, 0x3c7fd8], [-0.8, 0xf4f2ee]] as [number, number][]) { p.box(0.1, 0.05, 0.18, x, 0.024, -0.5, c); p.box(0.08, 0.04, 0.08, x, 0.074, -0.52, 0xcfe2f0); }
  p.box(0.12, 0.08, 0.26, 1.2, 0.024, -0.3, C.white); p.cyl(0.05, 0.05, 0.18, 8, 1.2, 0.08, -0.36, 0xd8dde2);
  for (const x of [-1.35, 1.35]) tree(p, x, -1.35, 0.9);
}

/** Petit sportif figé : jambes, maillot (couleur), tête */
function athlete(p: Parts, x: number, z: number, shirt: number, ry = 0) { figure(p, x, z, shirt, ry, false, 0x4a3426, 'run'); }

/** Projecteur d'éclairage sur son mât (époque moderne), la rampe tournée vers le centre */
function floodlight(p: Parts, x: number, z: number, h = 0.7) {
  p.cyl(0.012, 0.016, h, 5, x, 0.012, z, 0x9aa3ad);
  p.box(0.12, 0.06, 0.03, x, h, z, 0x5d6878, Math.atan2(-x, -z));
  p.box(0.1, 0.04, 0.012, x - Math.sin(Math.atan2(x, z)) * 0.018, h + 0.01, z - Math.cos(Math.atan2(x, z)) * 0.018, 0xfff4d8, Math.atan2(-x, -z), true);
}

/** Gradins en marches, sièges de couleur (toit à l'époque moderne), le long de x, face à +z */
function bleachers(p: Parts, x: number, z: number, w: number, rows: number, age: number) {
  const seat = age >= 4 ? [0x3a6ab8, 0xf2c23a] : [C.wood, C.darkwood];
  for (let r = 0; r < rows; r++) {
    p.box(w, 0.05 * (r + 1), 0.08, x, 0.012, z - r * 0.08, age >= 4 ? 0xd8d6d0 : 0x9a7452);
    p.box(w - 0.02, 0.012, 0.05, x, 0.012 + 0.05 * (r + 1), z - r * 0.08 + 0.01, seat[r % 2]);
  }
  if (age >= 4) { p.box(w + 0.04, 0.02, rows * 0.08 + 0.06, x, 0.05 * rows + 0.18, z - (rows - 1) * 0.04, C.white); for (const sx of [-1, 1]) p.box(0.02, 0.05 * rows + 0.18, 0.02, x + sx * (w / 2), 0.012, z - rows * 0.08, 0x9aa3ad); }
}

/** Stade (2 × 2) : piste d'athlétisme et ses couloirs (cendrée, puis tartan rouge), pelouse et terrain, sautoir, haies, tribune, coureurs, projecteurs */
function stadium(p: Parts, age: number) {
  p.box(1.9, 0.012, 1.9, 0, 0, 0, 0x8fc47e);
  p.add(new THREE.CylinderGeometry(1, 1, 0.01, 40).scale(0.9, 1, 0.66), 0, 0.017, 0.1, age >= 4 ? 0xc85a44 : 0xb88a6a);
  p.add(new THREE.CylinderGeometry(1, 1, 0.01, 40).scale(0.68, 1, 0.44), 0, 0.02, 0.1, 0x6fb85e);
  for (let k = 1; k < 6; k++) ellipseRing(p, 0.68 + k * 0.037, 0.44 + k * 0.037, 0.024, 0.003, 0xf4f2ee, 0, 0.1);
  // pelouse rayée, lignes du terrain, buts
  for (let k = 0; k < 6; k++) p.box(0.14, 0.004, 0.6, -0.42 + k * 0.17, 0.026, 0.1, k % 2 ? 0x64aa54 : 0x74bc62);
  p.box(0.006, 0.006, 0.6, 0, 0.028, 0.1, C.white); ellipseRing(p, 0.1, 0.1, 0.028, 0.004, C.white, 0, 0.1);
  for (const sx of [-1, 1]) { p.box(0.02, 0.06, 0.016, sx * 0.55, 0.026, 0.0, C.white); p.box(0.02, 0.06, 0.016, sx * 0.55, 0.026, 0.2, C.white); p.box(0.02, 0.016, 0.22, sx * 0.55, 0.08, 0.1, C.white); }
  // sautoir de sable, tapis de saut en hauteur, haies sur la ligne droite
  p.box(0.3, 0.01, 0.08, -0.25, 0.02, -0.6, 0xe8d8a8); p.box(0.14, 0.04, 0.1, 0.4, 0.02, -0.58, 0x3a6ab8);
  for (let k = 0; k < 4; k++) { p.box(0.004, 0.05, 0.004, -0.3 + k * 0.18, 0.02, 0.73, C.white); p.box(0.05, 0.012, 0.006, -0.3 + k * 0.18, 0.065, 0.73, C.white); }
  // coureurs dans les couloirs
  [[-0.5, 0.64, 0xd84a3e], [-0.4, 0.68, 0x3a6ab8], [-0.6, 0.72, 0xf2c23a]].forEach(([x, z, c]) => athlete(p, x, z, c, Math.PI / 2));
  bleachers(p, 0, -0.75, 1.3, 3, age);
  if (age >= 4) { for (const [x, z] of [[-0.88, -0.6], [0.88, -0.6], [-0.88, 0.8], [0.88, 0.8]]) floodlight(p, x, z, 0.8); p.box(0.3, 0.14, 0.02, 0, 0.62, -0.95, 0x2a2a2e); p.box(0.26, 0.1, 0.006, 0, 0.64, -0.938, 0xffd27a, 0, true); }
}

/** Terrain de football (2 × 2) : pelouse rayée, lignes, surfaces et rond central, buts et leurs filets, joueurs des deux équipes, ballon, bancs, petite tribune, projecteurs */
function football(p: Parts, age: number) {
  p.box(1.9, 0.012, 1.9, 0, 0, 0, 0x8fc47e);
  for (let k = 0; k < 8; k++) p.box(0.2, 0.006, 1.2, -0.7 + k * 0.2, 0.012, 0.05, k % 2 ? 0x5fa84e : 0x6dba5c);
  const L = (w: number, d: number, x: number, z: number) => p.box(w, 0.004, d, x, 0.019, z, C.white);
  L(1.62, 0.012, 0, -0.55); L(1.62, 0.012, 0, 0.65); L(0.012, 1.2, -0.81, 0.05); L(0.012, 1.2, 0.81, 0.05); L(0.012, 1.2, 0, 0.05);
  ellipseRing(p, 0.16, 0.16, 0.021, 0.004, C.white, 0, 0.05);
  for (const sx of [-1, 1]) {
    L(0.012, 0.5, sx * 0.6, 0.05); L(0.21, 0.012, sx * 0.705, -0.2); L(0.21, 0.012, sx * 0.705, 0.3);
    p.box(0.014, 0.1, 0.014, sx * 0.82, 0.012, -0.08, C.white); p.box(0.014, 0.1, 0.014, sx * 0.82, 0.012, 0.18, C.white); p.box(0.014, 0.014, 0.27, sx * 0.82, 0.11, 0.05, C.white);
    p.box(0.06, 0.1, 0.26, sx * 0.85, 0.012, 0.05, 0xdfe4ea);
  }
  [[-0.3, -0.1, 0xd84a3e], [-0.5, 0.25, 0xd84a3e], [-0.15, 0.35, 0xd84a3e], [0.25, 0.0, 0x3a6ab8], [0.45, 0.3, 0x3a6ab8], [0.1, -0.25, 0x3a6ab8], [-0.75, 0.05, 0x2a2a2e], [0.75, 0.05, 0x4fa860]]
    .forEach(([x, z, c], i) => athlete(p, x, z, c, i < 3 ? Math.PI / 2 : -Math.PI / 2));
  p.sphere(0.018, 0.05, 0.03, 0.1, C.white, 1);
  for (const x of [-0.35, 0.35]) { p.box(0.26, 0.04, 0.06, x, 0.012, 0.8, 0x3a6ab8); p.box(0.28, 0.1, 0.012, x, 0.012, 0.83, 0xcfe2f0); }
  bleachers(p, 0, -0.72, 1.0, 2, age);
  if (age >= 4) for (const [x, z] of [[-0.9, -0.62], [0.9, -0.62], [-0.9, 0.75], [0.9, 0.75]]) floodlight(p, x, z, 0.75);
  // supporters sur les gradins ; à l'âge industriel, la tribune a son toit de bois sur poteaux
  for (let r = 0; r < 2; r++) crowd(p, -0.45, 0.45, 0.012 + 0.05 * (r + 1) + 0.012, -0.72 - r * 0.08 + 0.01, 340 + r);
  if (age < 4) {
    for (const x of [-0.5, 0, 0.5]) p.box(0.02, 0.36, 0.02, x, 0.012, -0.66, C.darkwood);
    p.add(new THREE.BoxGeometry(1.08, 0.02, 0.32), 0, 0.38, -0.78, 0x8a5a44, 0, false, 0, -0.12);
  }
  // main courante blanche autour du terrain (panneaux publicitaires à l'époque moderne)
  for (const z of [-0.6, 0.71]) {
    if (age >= 4) for (let k = 0; k < 8; k++) p.box(0.19, 0.045, 0.012, -0.7 + k * 0.2, 0.012, z, [0x3a6ab8, 0xd84a3e, 0xf2c23a, 0x4fa860][k % 4]);
    else { p.box(1.7, 0.01, 0.01, 0, 0.06, z, C.white); for (let k = 0; k <= 8; k++) p.box(0.01, 0.06, 0.01, -0.85 + k * 0.2125, 0.012, z, C.white); }
  }
  // drapeaux de coin qui flottent
  for (const [x, z] of [[-0.81, -0.55], [0.81, -0.55], [-0.81, 0.65], [0.81, 0.65]]) { p.cyl(0.003, 0.003, 0.1, 4, x, 0.012, z, C.white); sway([x, 0.1, z], [0, 1, 0], 0.5, 1.3).box(0.03, 0.022, 0.003, 0.016, 0, 0, 0xf2c23a); }
  // tableau d'affichage, guichet et son drapeau
  for (const dz of [-0.12, 0.12]) p.box(0.02, 0.3, 0.02, -0.93, 0.012, 0.05 + dz, age >= 4 ? 0x9aa3ad : C.darkwood);
  p.box(0.03, 0.14, 0.3, -0.93, 0.25, 0.05, 0x2a2a2e);
  if (age >= 4) p.box(0.006, 0.1, 0.26, -0.913, 0.27, 0.05, 0xffd27a, 0, true); else for (let k = 0; k < 4; k++) p.box(0.006, 0.05, 0.05, -0.913, 0.29, -0.06 + k * 0.073, C.white);
  p.box(0.18, 0.16, 0.12, 0.8, 0.012, 0.88, age >= 4 ? 0xe8eaee : 0xd8c8a8); p.box(0.2, 0.02, 0.14, 0.8, 0.17, 0.88, age >= 4 ? 0x3a6ab8 : 0x8a5a44); p.box(0.06, 0.05, 0.006, 0.8, 0.08, 0.943, C.glass, 0, true);
  p.cyl(0.004, 0.004, 0.24, 4, 0.9, 0.19, 0.88, C.metal); sway([0.9, 0.19, 0.88], [0, 1, 0], 0.45, 1.2).box(0.07, 0.04, 0.003, 0.035, 0.2, 0, 0x3a6ab8);
}

/** Terrain de basket (1 case) : bitume peint, lignes et raquettes, deux paniers, grillage, joueurs, ballon */
function basket(p: Parts) {
  p.box(0.98, 0.012, 0.98, 0, 0, 0, 0x6f747a);
  p.box(0.84, 0.006, 0.56, 0, 0.012, 0, 0xd8743a);
  for (const sx of [-1, 1]) { p.box(0.2, 0.007, 0.2, sx * 0.32, 0.012, 0, 0x3a6ab8); ellipseRing(p, 0.18, 0.18, 0.02, 0.003, C.white, sx * 0.42, 0); }
  p.box(0.006, 0.006, 0.56, 0, 0.02, 0, C.white); ellipseRing(p, 0.07, 0.07, 0.02, 0.003, C.white);
  for (const sx of [-1, 1]) {
    p.box(0.014, 0.3, 0.014, sx * 0.47, 0.012, 0, 0x3c3c40); p.box(0.04, 0.012, 0.012, sx * 0.45, 0.3, 0, 0x3c3c40);
    p.box(0.008, 0.08, 0.12, sx * 0.43, 0.27, 0, C.white);
    p.add(new THREE.TorusGeometry(0.022, 0.004, 4, 10).rotateX(Math.PI / 2), sx * 0.4, 0.27, 0, 0xf2783a);
  }
  for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) p.box(0.01, 0.2, 0.01, x, 0.012, z, 0x5d6878);
  for (const z of [-0.48, 0.48]) p.box(0.96, 0.15, 0.004, 0, 0.05, z, 0x8a8f96);
  [[-0.15, 0.1, 0xf2c23a], [0.1, -0.12, 0xd84a3e], [0.25, 0.1, 0xf2c23a], [-0.3, -0.1, 0xd84a3e]].forEach(([x, z, c], i) => athlete(p, x, z, c, i % 2 ? -1.2 : 1.2));
  p.sphere(0.014, 0.12, 0.2, -0.1, 0xd8743a);
  // fresque de couleurs vives sur le grillage du fond, projecteurs aux angles
  [[-0.36, 0.1, 0.12, 0xf2c23a], [-0.2, 0.08, 0.16, 0x3c7fd8], [-0.02, 0.11, 0.1, 0xd84a3e], [0.14, 0.07, 0.18, 0x4fa860], [0.32, 0.1, 0.14, 0xb45ad8]].forEach(([x, y, w, c]) => p.box(w, 0.08, 0.006, x, y, -0.476, c));
  for (const [x, y] of [[-0.28, 0.12], [-0.1, 0.1], [0.06, 0.13], [0.24, 0.09]]) p.sphere(0.022, x, y, -0.473, C.white, 0, 0.4);
  floodlight(p, -0.47, -0.47, 0.42); floodlight(p, 0.47, 0.47, 0.42);
  // le long de la ligne de touche : banc des remplaçants, gourdes, sac de sport, ballon de rechange ; une petite foule assise
  bench(p, -0.18, 0.4, Math.PI); bench(p, 0.12, 0.4, Math.PI);
  seated(p, -0.22, 0.064, 0.4, Math.PI, 0xd84a3e); seated(p, -0.14, 0.064, 0.4, Math.PI, 0xd84a3e, 0x8a5a3a); seated(p, 0.12, 0.064, 0.4, Math.PI, 0xf2c23a, 0x2a2420);
  for (const x of [0.24, 0.27]) { p.cyl(0.008, 0.008, 0.035, 6, x, 0.012, 0.36, x < 0.26 ? 0x3c7fd8 : 0x4fa860); p.cyl(0.005, 0.005, 0.008, 6, x, 0.047, 0.36, C.white); }
  p.box(0.08, 0.04, 0.035, 0.36, 0.012, 0.4, 0x2a2a2e); p.box(0.08, 0.008, 0.008, 0.36, 0.052, 0.4, 0xd84a3e);
  p.sphere(0.014, 0.4, 0.026, 0.33, 0xd8743a);
}

/**
 * Court de tennis (1 case) : terre battue à l'âge industriel (abords de gazon, haie, spectateurs en canotier sous l'ombrelle),
 * court en dur bleu ensuite (projecteurs) ; lignes, filet et poteaux, chaise d'arbitre, grillage ajouré au fond, bancs,
 * joueurs et leurs raquettes, balle
 */
function tennis(p: Parts, age: number) {
  const modern = age >= 4;
  p.box(0.98, 0.012, 0.98, 0, 0, 0, modern ? 0x4fa860 : 0x8fc47e);
  p.box(0.92, 0.006, 0.62, 0, 0.012, 0, modern ? 0x4f9a5a : 0xc8784a);
  p.box(0.86, 0.006, 0.44, 0, 0.014, 0, modern ? 0x3a6ab8 : 0xd8845a);
  const L = (w: number, d: number, x: number, z: number) => p.box(w, 0.004, d, x, 0.02, z, C.white);
  L(0.86, 0.008, 0, -0.22); L(0.86, 0.008, 0, 0.22); L(0.86, 0.008, 0, -0.17); L(0.86, 0.008, 0, 0.17); L(0.008, 0.44, -0.43, 0); L(0.008, 0.44, 0.43, 0);
  L(0.008, 0.34, -0.22, 0); L(0.008, 0.34, 0.22, 0); L(0.44, 0.008, 0, 0);
  // filet : mailles sombres, bande blanche, poteaux
  p.box(0.006, 0.055, 0.5, 0, 0.018, 0, 0x2a2a2e); p.box(0.008, 0.01, 0.5, 0, 0.072, 0, C.white);
  for (const z of [-0.26, 0.26]) p.cyl(0.008, 0.008, 0.075, 5, 0, 0.012, z, 0x3c4a44);
  // chaise d'arbitre haute, et l'arbitre
  for (const [dx, dz] of [[-0.02, -0.02], [0.02, -0.02], [-0.02, 0.02], [0.02, 0.02]]) p.box(0.008, 0.16, 0.008, dx, 0.012, 0.34 + dz, modern ? 0x4a5560 : C.darkwood);
  p.box(0.06, 0.012, 0.06, 0, 0.17, 0.34, modern ? 0x3a6ab8 : C.wood); figure(p, 0, 0.34, modern ? 0x2a2a2e : C.white, Math.PI, true);
  // grillage ajouré au fond des deux côtés : poteaux, lisses, fils, toile brise-vent basse
  for (const x of [-0.47, 0.47]) {
    for (let k = 0; k <= 8; k++) p.box(0.01, 0.24, 0.01, x, 0.012, -0.46 + k * 0.115, 0x3c4a44);
    for (const y of [0.25, 0.17, 0.1]) p.box(0.006, 0.006, 0.93, x, y, 0, 0x5d6878);
    for (let k = 0; k < 24; k++) p.box(0.003, 0.24, 0.003, x, 0.012, -0.45 + k * 0.039, 0x7a8a96);
    p.box(0.004, 0.08, 0.92, x, 0.012, 0, modern ? 0x2e5a3e : 0x3e6a4a);
  }
  // le long des côtés : bancs, sac de balles, et à l'âge industriel une haie et deux spectateurs sous l'ombrelle
  for (const s of [-1, 1]) { p.box(0.16, 0.012, 0.04, s * 0.22, 0.05, 0.43, modern ? 0xf4f2ee : C.wood); for (const d of [-0.06, 0.06]) p.box(0.01, 0.04, 0.03, s * 0.22 + d, 0.012, 0.43, 0x3c3c40); }
  p.box(0.04, 0.03, 0.03, 0.12, 0.012, 0.43, 0xf2c23a);
  if (!modern) {
    hedge(p, 0, -0.45, 0.9, 0.04, 0.06, 0.012);
    figure(p, -0.3, -0.38, 0xe8e2d4, 0, true); figure(p, -0.22, -0.38, 0xc8a0d8, 0, true);
    p.cyl(0.003, 0.003, 0.2, 3, -0.26, 0.012, -0.36, 0x3a3030); p.cone(0.07, 0.04, 8, -0.26, 0.2, -0.36, 0xf2e6f0);
    for (const x of [-0.3, -0.22]) p.cyl(0.024, 0.024, 0.006, 8, x, 0.2, -0.38, 0xe8d8a0);
  } else for (const z of [-0.47, 0.47]) for (const x of [-0.45, 0.45]) floodlight(p, x, z, 0.36);
  // les joueurs, raquette en main, la balle en l'air
  const racket = (x: number, z: number, s: number) => { p.box(0.006, 0.006, 0.05, x + s * 0.03, 0.1, z, 0x5a4636); p.add(new THREE.TorusGeometry(0.018, 0.004, 3, 8).rotateY(Math.PI / 2), x + s * 0.03, 0.1, z + s * 0.04, modern ? 0x2a2a2e : 0xb08968); };
  figure(p, -0.32, -0.08, C.white, Math.PI / 2); racket(-0.32, -0.08, 1);
  figure(p, 0.3, 0.1, modern ? 0xf2c23a : C.white, -Math.PI / 2); racket(0.3, 0.1, -1);
  p.sphere(0.009, -0.1, 0.16, 0.0, 0xd8f040);
  if (modern) {
    // spectateurs sur les bancs, chariot à balles, glacière, serviette ; tableau des scores au grillage
    seated(p, -0.26, 0.062, 0.43, Math.PI, 0x3a6ab8); seated(p, -0.18, 0.062, 0.43, Math.PI, 0xf2a6c8, 0x8a5a3a); seated(p, 0.26, 0.062, 0.43, Math.PI, 0x4fa860, 0x2a2420);
    p.box(0.05, 0.05, 0.04, 0.38, 0.03, 0.4, 0x8a8f96); for (let k = 0; k < 6; k++) p.sphere(0.008, 0.365 + (k % 3) * 0.015, 0.08, 0.39 + Math.floor(k / 3) * 0.02, 0xd8f040);
    for (const d of [-0.02, 0.02]) p.box(0.004, 0.03, 0.004, 0.38 + d, 0.012, 0.4, 0x5d6878);
    p.box(0.05, 0.035, 0.035, -0.38, 0.012, 0.42, 0x3c7fd8); p.box(0.05, 0.008, 0.035, -0.38, 0.047, 0.42, C.white);
    p.box(0.06, 0.004, 0.03, 0.19, 0.063, 0.43, C.white, 0.3);
    p.box(0.012, 0.1, 0.16, -0.465, 0.17, -0.3, 0x2a2a2e); for (let k = 0; k < 4; k++) p.box(0.004, 0.03, 0.025, -0.457, 0.2, -0.36 + k * 0.04, k < 2 ? 0xffd27a : 0x9de0ff, 0, true);
  }
}

/**
 * Parc aquatique (2 × 2) : grand bassin, rivière à bouées, tour aux toboggans géants qui serpentent jusqu'à l'eau, bassin à
 * vagues et sa plage, transats et parasols, palmiers, baigneurs et bouées
 */
function waterpark(p: Parts) {
  p.box(1.9, 0.012, 1.9, 0, 0, 0, 0xe8e0d0);
  p.box(0.9, 0.03, 0.6, -0.35, 0.0, 0.4, 0x2a8ab8); p.box(0.86, 0.006, 0.56, -0.35, 0.028, 0.4, 0x5ac8e8);
  p.box(0.92, 0.04, 0.02, -0.35, 0.0, 0.1, C.white); p.box(0.92, 0.04, 0.02, -0.35, 0.0, 0.71, C.white);
  // rivière à bouées : un anneau d'eau entre deux margelles, et ses bouées
  ellipseRing(p, 0.62, 0.62, 0.0, 0.09, 0xd8d6d0, 0.45, -0.35); ellipseRing(p, 0.62, 0.62, 0.035, 0.07, 0x5ac8e8, 0.45, -0.35);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3, x = 0.45 + Math.cos(a) * 0.62, z = -0.35 + Math.sin(a) * 0.62; p.add(new THREE.TorusGeometry(0.035, 0.013, 4, 10).rotateX(Math.PI / 2), x, 0.105, z, [0xf2c23a, 0xd84a3e, 0x3c7fd8][k % 3]); p.sphere(0.016, x, 0.12, z, 0xe8b894); }
  // tour et toboggans en spirale, aux couleurs vives, jusqu'au bassin
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.02, 0.62, 0.02, -0.55 + dx * 0.08, 0.012, -0.55 + dz * 0.08, 0xd8d6d0);
  p.box(0.22, 0.03, 0.22, -0.55, 0.62, -0.55, 0xf2c23a); p.cone(0.16, 0.12, 4, -0.55, 0.65, -0.55, 0xd84a3e, false, Math.PI / 4);
  for (const [col, off, r] of [[0xd84a3e, 0, 0.22], [0x3c7fd8, Math.PI, 0.3]] as [number, number, number][]) {
    for (let k = 0; k < 22; k++) {
      const t = k / 22, a = off + t * Math.PI * 3, y = 0.6 * (1 - t) + 0.04, x = -0.55 + Math.cos(a) * r, z = -0.55 + Math.sin(a) * r + t * 0.75;
      p.add(new THREE.BoxGeometry(0.07, 0.035, 0.09), x, y, z, col, -a);
      if (k % 4 === 0) p.box(0.012, y, 0.012, x, 0.012, z, 0xd8d6d0);
    }
  }
  // baigneurs, bouées, transats, parasols, palmiers
  for (const [x, z, c] of [[-0.5, 0.3, 0xf2c23a], [-0.2, 0.5, 0xd84a3e], [-0.6, 0.55, 0x4fa860], [0.2, -0.0, 0xf28a3c], [0.8, -0.5, 0xb45ad8]] as [number, number, number][]) {
    p.add(new THREE.TorusGeometry(0.028, 0.01, 4, 10).rotateX(Math.PI / 2), x, 0.035, z, c); p.sphere(0.016, x, 0.05, z, 0xe8b894);
  }
  for (let k = 0; k < 5; k++) { const x = 0.2 + k * 0.15; p.add(new THREE.BoxGeometry(0.06, 0.012, 0.14), x, 0.05, 0.75, [0xd84a3e, 0x3c7fd8, 0xf2c23a][k % 3], 0, false, 0, -0.25); }
  for (const x of [0.3, 0.6]) { p.cyl(0.005, 0.005, 0.26, 4, x, 0.012, 0.6, C.metal); p.cone(0.11, 0.05, 8, x, 0.26, 0.6, x < 0.5 ? 0xf2785a : 0x8cc4e8); }
  for (const [x, z] of [[0.85, 0.85], [-0.88, 0.85], [0.85, 0.2]]) { p.cyl(0.015, 0.025, 0.4, 5, x, 0.012, z, 0x9a7452); for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.2, 0.01, 0.05).translate(0.1, 0, 0), x, 0.41, z, 0x5fa84a, (k / 5) * Math.PI * 2, false, -0.3); }
  // bassin à vagues : rouleaux d'écume au fond, crocodile gonflable ; tour du maître-nageur et son parasol rouge
  for (let k = 0; k < 3; k++) p.box(0.8, 0.008, 0.02, -0.35, 0.034, 0.15 + k * 0.05, k % 2 ? 0xe8f6fa : 0xf4fbfd);
  p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.03, 0.02, 0.12), -0.36, 0.04, 0.4, 0x6ac85a); p.add(new THREE.IcosahedronGeometry(1, 0).scale(0.022, 0.016, 0.04), -0.36, 0.05, 0.52, 0x6ac85a);
  for (const s of [-1, 1]) p.sphere(0.008, -0.36 + s * 0.012, 0.066, 0.54, C.white);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.01, 0.24, 0.01, 0.18 + dx * 0.04, 0.012, 0.35 + dz * 0.04, C.white);
  p.box(0.11, 0.012, 0.11, 0.18, 0.25, 0.35, 0xd84a3e); seated(p, 0.18, 0.262, 0.35, -Math.PI / 2, 0xd84a3e, 0x8a5a3a);
  p.cyl(0.004, 0.004, 0.2, 4, 0.21, 0.262, 0.33, C.metal); p.cone(0.08, 0.04, 8, 0.21, 0.46, 0.33, 0xd84a3e);
  for (let y = 0.06; y < 0.24; y += 0.05) p.box(0.006, 0.006, 0.08, 0.23, y, 0.35, C.white);
  // le snack et son store ; les douches ; l'arche d'entrée et ses tourniquets
  p.box(0.18, 0.14, 0.12, 0.78, 0.012, 0.42, 0xf2c23a); p.box(0.16, 0.05, 0.006, 0.78, 0.07, 0.357, 0xffe8b0, 0, true);
  for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.036, 0.008, 0.08), 0.708 + k * 0.036, 0.15, 0.34, k % 2 ? C.white : 0x3c7fd8, 0, false, 0, -0.4);
  p.box(0.2, 0.02, 0.14, 0.78, 0.152, 0.42, 0x3c7fd8);
  for (const x of [0.0, 0.08]) { p.cyl(0.005, 0.005, 0.24, 4, x, 0.012, 0.86, C.metal); p.box(0.03, 0.006, 0.012, x, 0.25, 0.84, C.metal); p.cyl(0.025, 0.025, 0.004, 8, x, 0.012, 0.84, 0x8a8f96); }
  for (const s of [-1, 1]) p.box(0.05, 0.36, 0.05, -0.4 + s * 0.2, 0.012, 0.9, 0x3c7fd8);
  p.box(0.48, 0.07, 0.06, -0.4, 0.37, 0.9, C.white); for (let k = 0; k < 5; k++) p.box(0.05, 0.035, 0.006, -0.52 + k * 0.06, 0.388, 0.932, [0x3c7fd8, 0x4fc8e8, 0x3c7fd8, 0x4fc8e8, 0x3c7fd8][k], 0, true);
  for (const x of [-0.48, -0.32]) { p.box(0.03, 0.08, 0.06, x, 0.012, 0.9, 0x8a8f96); p.box(0.05, 0.006, 0.006, x + 0.03, 0.07, 0.9, C.metal); }
  // les baigneurs en maillot sur les plages : au snack, aux douches, vers l'entrée ; un enfant qui court
  for (const [x, z, c, r] of [[0.72, 0.31, 0xf28aa8, 2.6], [0.86, 0.3, 0x3c7fd8, -2.8], [-0.18, 0.02, 0xf2c23a, 0.3], [0.04, 0.78, 0x4fa860, 2.8], [-0.4, 0.8, 0xd84a3e, Math.PI]] as number[][]) figure(p, x, z, c, r, false, 0x4a3426);
  figure(p, 0.42, 0.45, 0xb45ad8, 2.2, false, 0xc8a070, 'run');
}

/** Pied de la tour des toboggans du grand parc aquatique : les deux spirales s'enroulent autour */
const SLIDE_HUB: [number, number] = [-0.75, -1.0];

/**
 * Les toboggans du grand parc aquatique, du départ en haut à l'arrivée dans le bassin de réception (repère du bâtiment) :
 * le kamikaze, tout droit depuis sa tour (genre 0, on y descend à plat dos), la spirale aux bouées (1) et la grande spirale
 * aux radeaux (2), enroulées en sens contraire autour de la tour
 */
export function slidePaths(): { pts: THREE.Vector3[]; kind: number }[] {
  const [hx, hz] = SLIDE_HUB, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const helix = (r: number, a0: number, a1: number) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = a0 + (a1 - a0) * t; out.push(V(hx + Math.cos(a) * r, 0.9 - 0.78 * t, hz + Math.sin(a) * r)); }
    return out;
  };
  const run = (x: number) => [V(x, 0.1, -0.85), V(x, 0.076, -0.62), V(x, 0.07, -0.42)];
  return [
    { kind: 0, pts: [V(-1.38, 0.92, -0.87), V(-1.38, 0.88, -0.83), V(-1.38, 0.62, -0.72), V(-1.38, 0.32, -0.6), V(-1.38, 0.14, -0.5), V(-1.38, 0.08, -0.41), V(-1.38, 0.07, -0.3)] },
    { kind: 1, pts: [...helix(0.27, 2 * Math.PI, -Math.PI), ...run(hx - 0.27)] },
    { kind: 2, pts: [...helix(0.4, Math.PI, 4 * Math.PI), ...run(hx + 0.4)] },
  ];
}

/** Gouttière d'un toboggan le long d'une ligne brisée : fond, bords et leur liseré blanc */
function slideRun(p: Parts, pts: THREE.Vector3[], w: number, color: number) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], d = b.clone().sub(a), len = d.length(), yaw = Math.atan2(d.x, d.z), pitch = Math.asin(d.y / len);
    const put = (g: THREE.BufferGeometry, c: number) => p.add(g.rotateX(-pitch).rotateY(yaw), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, c);
    put(new THREE.BoxGeometry(w, 0.01, len + 0.012), color);
    for (const s of [-1, 1]) {
      put(new THREE.BoxGeometry(0.01, 0.035, len + 0.012).translate((s * w) / 2, 0.015, 0), color);
      put(new THREE.BoxGeometry(0.014, 0.006, len + 0.012).translate((s * w) / 2, 0.034, 0), C.white);
    }
  }
}

/** Palmier : stipe penché, cinq palmes ; dessiné en (x, z), haut de h */
function palmTree(p: Parts, x: number, z: number, h: number, y0 = 0.012) {
  p.add(new THREE.CylinderGeometry(0.015, 0.025, h, 5).translate(0, h / 2, 0), x, y0, z, 0x9a7452, 0, false, 0.08);
  const tx = x - h * 0.08;
  for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.2, 0.01, 0.05).translate(0.1, 0, 0), tx, y0 + h, z, 0x5fa84a, (k / 5) * Math.PI * 2 + x, false, -0.3);
  p.sphere(0.025, tx, y0 + h - 0.02, z, 0x7a5a32);
}

/**
 * Grand parc aquatique (3 × 3) : la tour aux toboggans — deux spirales enroulées en sens contraire autour d'elle, la spirale
 * aux bouées et la grande spirale aux radeaux, et le kamikaze qui plonge de sa propre tour reliée par une passerelle — où
 * descendent les baigneurs (animés à part), jusqu'au bassin de réception ; la piscine à vagues, sa machine, son écume qui
 * va et vient, ses nageurs, sa plage, ses transats et le maître-nageur ; la rivière à bouées qui fait le tour d'une île
 * de jeux d'eau (château aux mini-toboggans, grand seau qui bascule, champignon fontaine, palmiers) et ses deux
 * passerelles ; la vague de surf et son surfeur ; l'entrée en arc et ses tourniquets, les cabines, les douches, la paillote
 * et ses tables, palmiers, lampadaires, et la foule en maillot
 */
function waterparkBig(p: Parts) {
  sink(0.012);
  const y0 = 0.012, rim = 0xf4f2ee, sun = [0xd84a3e, 0xf2c23a, 0x4a5ad8, 0x4fa860, 0xb45ad8, 0xf28a3c];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0xe8e0d0);
  /** Bassin rectangulaire : l'eau, quatre margelles, des spots sous l'eau qui s'allument le soir */
  const pool = (x: number, z: number, w: number, d: number, water: number) => {
    p.box(w, 0.028, d, x, y0, z, water);
    for (const s of [-1, 1]) { p.box(w + 0.06, 0.042, 0.03, x, y0, z + s * (d / 2 + 0.015), rim); p.box(0.03, 0.042, d, x + s * (w / 2 + 0.015), y0, z, rim); }
    for (let k = 0; k < Math.floor(w / 0.3); k++) p.box(0.03, 0.01, 0.004, x - w / 2 + 0.15 + k * 0.3, y0 + 0.029, z - d / 2 + 0.002, 0x9ae8ff, 0, true);
  };

  // ---- la tour des toboggans, la tour du kamikaze et leur passerelle
  const [hx, hz] = SLIDE_HUB, levels = [y0, 0.24, 0.47, 0.7, 0.88];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.022, 1.12, 0.022, hx + sx * 0.11, y0, hz + sz * 0.11, rim);
  for (let i = 1; i < levels.length; i++) p.box(i === levels.length - 1 ? 0.3 : 0.25, 0.02, i === levels.length - 1 ? 0.3 : 0.25, hx, levels[i], hz, 0xf2c23a);
  for (let i = 0; i + 1 < levels.length; i++) {
    const rise = levels[i + 1] - levels[i], ang = Math.atan2(rise, 0.2), s = i % 2 ? 1 : -1;
    p.add(new THREE.BoxGeometry(0.07, 0.012, Math.hypot(rise, 0.2)).rotateX(s * ang), hx + s * 0.05, (levels[i] + levels[i + 1]) / 2 + 0.01, hz, 0xd8d6d0);
  }
  for (const [dx, dz, w, d] of [[0, -0.15, 0.3, 0.006], [0, 0.15, 0.3, 0.006], [-0.15, 0, 0.006, 0.3], [0.15, 0, 0.006, 0.3]]) p.box(w, 0.05, d, hx + dx, 0.9, hz + dz, rim);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.014, 0.22, 0.014, hx + sx * 0.13, 0.9, hz + sz * 0.13, rim);
  p.cone(0.25, 0.16, 4, hx, 1.12, hz, 0xd84a3e, false, Math.PI / 4);
  p.cyl(0.004, 0.004, 0.14, 3, hx, 1.28, hz, C.metal); p.box(0.07, 0.04, 0.004, hx + 0.035, 1.37, hz, 0xf2c23a);
  p.box(0.16, 0.02, 0.12, hx + 0.21, 0.88, hz, 0xf2c23a);
  const kx = -1.38, kz = -0.95;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.018, 1.05, 0.018, kx + sx * 0.06, y0, kz + sz * 0.06, rim);
  p.box(0.16, 0.02, 0.16, kx, 0.88, kz, 0xf2c23a); p.cone(0.13, 0.1, 4, kx, 1.06, kz, 0xf2c23a, false, Math.PI / 4);
  for (let y = 0.2; y < 0.88; y += 0.17) p.box(0.13, 0.008, 0.13, kx, y, kz, 0xd8d6d0);
  p.box(0.45, 0.02, 0.09, (kx + hx) / 2 - 0.02, 0.88, -0.98, 0xf2c23a);
  // garde-corps de la passerelle, ouvert là où part la grande spirale
  p.box(0.45, 0.04, 0.006, (kx + hx) / 2 - 0.02, 0.9, -0.935, rim);
  for (const [x0, x1] of [[-1.31, -1.24], [-1.08, -0.86]]) p.box(x1 - x0, 0.04, 0.006, (x0 + x1) / 2, 0.9, -1.025, rim);
  // les toboggans, leurs poteaux, et sous les spirales les bras tendus depuis la tour (là où ils ne croisent pas l'autre)
  const slides = slidePaths(), widths = [0.08, 0.085, 0.13], colors = [0xf2c23a, 0xd84a3e, 0x4a5ad8];
  slides.forEach((s, i) => slideRun(p, s.pts, widths[i], colors[i]));
  const near = (x: number, y: number, z: number, self: number) => slides.some((s, i) => i !== self && s.pts.some((q) => Math.hypot(q.x - x, q.z - z) < 0.09 && Math.abs(q.y - y) < 0.08));
  slides.forEach((s, i) => s.pts.forEach((q, k) => {
    const onHelix = i > 0 && k <= 40;
    if (!onHelix) { if (q.y > 0.09 && k % 2 === 0) p.box(0.016, q.y - y0 - 0.012, 0.016, q.x, y0, q.z, 0xd8d6d0); return; }
    if (k % 4 !== 2) return;
    const dx = q.x - hx, dz = q.z - hz, r = Math.hypot(dx, dz), y = q.y - 0.03;
    for (let t = 0.4; t < 1; t += 0.12) if (near(hx + (dx * t), y, hz + (dz * t), i)) return;
    p.add(new THREE.BoxGeometry(0.014, 0.014, r - 0.11).translate(0, 0, (r - 0.11) / 2 + 0.11), hx, y, hz, 0xd8d6d0, Math.atan2(dx, dz));
  }));
  // le bassin de réception, ses lignes d'eau, des baigneurs qui remontent
  pool(-0.82, -0.35, 1.22, 0.46, 0x3aa8d8);
  for (const x of [-1.2, -0.88, -0.55]) for (let k = 0; k < 7; k++) p.sphere(0.01, x, y0 + 0.03, -0.55 + k * 0.065, k % 2 ? C.white : 0xd84a3e);
  for (const [x, z, c] of [[-1.05, -0.2, 0xf2c23a], [-0.7, -0.22, 0xd84a3e], [-0.4, -0.25, 0x4fa860]] as number[][]) { p.add(new THREE.TorusGeometry(0.028, 0.01, 4, 10).rotateX(Math.PI / 2), x, y0 + 0.032, z, c); p.sphere(0.016, x, y0 + 0.05, z, 0xe8b894); }

  // ---- la piscine à vagues : sa machine, l'eau du plus profond au plus clair, l'écume et les nageurs qui vont et viennent, la plage
  const wx = -0.775;
  p.box(1.31, 0.17, 0.13, wx, y0, 0.005, rim);
  for (let k = 0; k < 6; k++) p.box(0.14, 0.05, 0.006, wx - 0.5 + k * 0.2, y0 + 0.02, 0.072, 0x3a4250);
  for (let k = 0; k < 13; k++) p.box(0.1, 0.03 + (k % 2) * 0.025, 0.006, wx - 0.6 + k * 0.1, y0 + 0.09, 0.072, k % 2 ? 0x3c7fd8 : 0x7ad8ee);
  p.box(1.33, 0.02, 0.15, wx, y0 + 0.17, 0.005, 0xf2c23a);
  for (const [z, d, c] of [[0.265, 0.37, 0x2a9ad0], [0.625, 0.35, 0x4ab8e0], [0.95, 0.3, 0x7ad8ee]] as number[][]) p.box(1.25, 0.028, d, wx, y0, z, c);
  for (const s of [-1, 1]) p.box(0.03, 0.042, 1.04, wx + s * 0.64, y0, 0.59, rim);
  p.box(1.31, 0.03, 0.36, wx, y0, 1.28, 0xead8b0);
  for (let k = 0; k < 4; k++) p.box(0.03, 0.01, 0.004, wx - 0.45 + k * 0.3, y0 + 0.029, 0.074, 0x9ae8ff, 0, true);
  const W = swing([wx, -4, 0.6], [1, 0, 0], 0.012, 0.22), wy = 4 + y0 + 0.031;
  for (const z of [-0.3, -0.05, 0.2]) { W.box(1.2, 0.005, 0.03, 0, wy, z, 0xf4fbfd); W.box(1.1, 0.004, 0.02, 0.03, wy, z + 0.04, 0xe8f6fa); }
  [[-0.42, -0.2], [-0.15, 0.02], [0.3, -0.25], [0.48, 0.15], [-0.28, 0.33], [0.1, 0.28], [-0.5, 0.12]].forEach(([x, z], k) => {
    W.add(new THREE.TorusGeometry(0.028, 0.01, 4, 10).rotateX(Math.PI / 2), x, wy + 0.002, z, sun[k % sun.length]); W.sphere(0.016, x, wy + 0.02, z, 0xe8b894);
  });
  W.add(new THREE.IcosahedronGeometry(1, 1).scale(0.03, 0.02, 0.12), -0.05, wy + 0.01, -0.15, 0x6ac85a); W.sphere(0.022, 0.25, wy + 0.016, 0.38, 0xf2c23a, 1);
  // le maître-nageur sur sa chaise haute, les transats, les parasols, des baigneurs au soleil
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.01, 0.24, 0.01, -0.2 + dx * 0.04, y0, 1.22 + dz * 0.04, C.white);
  p.box(0.11, 0.012, 0.11, -0.2, 0.25, 1.22, 0xd84a3e); seated(p, -0.2, 0.262, 1.22, Math.PI, 0xd84a3e, 0x8a5a3a);
  p.cyl(0.004, 0.004, 0.2, 4, -0.17, 0.262, 1.2, C.metal); p.cone(0.08, 0.04, 8, -0.17, 0.46, 1.2, 0xd84a3e);
  for (let k = 0; k < 7; k++) { const x = -1.36 + k * 0.15; p.add(new THREE.BoxGeometry(0.06, 0.012, 0.14), x, y0 + 0.05, 1.37, sun[k % sun.length], 0, false, 0, -0.25); if (k % 3 === 1) seated(p, x, y0 + 0.05, 1.36, Math.PI, sun[(k + 2) % sun.length]); }
  for (const [x, c] of [[-1.2, 0xf2785a], [-0.9, 0x8cc4e8], [-0.6, 0xf2c23a]] as number[][]) { p.cyl(0.005, 0.005, 0.26, 4, x, y0, 1.25, C.metal); p.cone(0.11, 0.05, 8, x, 0.27, 1.25, c); }

  // ---- la rivière à bouées autour de l'île, ses bouées qui tournent, ses passerelles
  const rx = 0.75, rz = -0.2;
  p.add(new THREE.RingGeometry(0.5, 0.66, 48).rotateX(-Math.PI / 2), rx, y0 + 0.026, rz, 0x4ab8e0);
  for (const r of [0.5, 0.66]) p.add(new THREE.TorusGeometry(r, 0.022, 4, 48).rotateX(Math.PI / 2), rx, y0 + 0.02, rz, rim);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; p.box(0.03, 0.01, 0.004, rx + Math.cos(a) * 0.69, y0 + 0.02, rz + Math.sin(a) * 0.69, 0x9ae8ff, -a + Math.PI / 2, true); }
  const R = turning([rx, y0 + 0.03, rz], [0, 1, 0], 0.02);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2, x = Math.cos(a) * 0.58, z = Math.sin(a) * 0.58;
    R.add(new THREE.TorusGeometry(0.036, 0.014, 4, 12).rotateX(Math.PI / 2), x, 0.006, z, sun[k % sun.length]);
    if (k % 4 === 3) continue;
    R.box(0.03, 0.03, 0.03, x, 0.008, z, sun[(k + 3) % sun.length], -a); R.sphere(0.016, x, 0.05, z, 0xe8b894);
  }
  /** Passerelle en dos d'âne au-dessus de la rivière, dans l'axe z : marches de part et d'autre, tablier, garde-corps */
  const footbridge = (z: number) => {
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) p.box(0.14, 0.04 + k * 0.045, 0.04, rx, y0, z + s * (0.17 - k * 0.04), C.white);
    p.box(0.14, 0.022, 0.2, rx, 0.15, z, 0xb08968);
    for (const sx of [-1, 1]) { p.box(0.008, 0.06, 0.2, rx + sx * 0.07, 0.172, z, C.white); for (const dz of [-0.09, 0.09]) p.box(0.012, 0.15, 0.012, rx + sx * 0.07, y0 + 0.02, z + dz, C.white); }
  };
  footbridge(rz + 0.58); footbridge(rz - 0.58);
  // l'île : pelouse, aire de jeux d'eau ; le château aux deux mini-toboggans et son grand seau qui bascule ; le champignon fontaine
  p.cyl(0.47, 0.47, 0.02, 40, rx, y0, rz, 0x8fcf7e);
  p.cyl(0.2, 0.2, 0.004, 24, rx, y0 + 0.02, rz, 0x7ad8ee);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.018, 0.62, 0.018, rx + sx * 0.12, y0, rz + sz * 0.12, 0xf2c23a);
  p.box(0.28, 0.02, 0.28, rx, 0.22, rz, 0x4fa860); p.box(0.28, 0.02, 0.28, rx, 0.42, rz, 0xd84a3e); p.box(0.28, 0.02, 0.28, rx, 0.62, rz, 0x4fa860);
  for (const y of [0.24, 0.44, 0.64]) for (const s of [-1, 1]) p.box(0.28, 0.04, 0.006, rx, y, rz + s * 0.14, 0xf4f2ee);
  for (const s of [-1, 1]) p.box(0.02, 0.24, 0.02, rx + s * 0.09, 0.64, rz, 0xd84a3e);
  p.box(0.22, 0.025, 0.025, rx, 0.86, rz, 0xd84a3e);
  p.cyl(0.006, 0.006, 0.08, 4, rx, 0.78, rz, C.metal);
  const B = swing([rx, 0.8, rz], [1, 0, 0], 0.55, 0.12);
  B.cyl(0.075, 0.055, 0.1, 10, 0, -0.1, 0, 0xf2c23a); B.cyl(0.077, 0.077, 0.012, 10, 0, -0.005, 0, 0xd84a3e); B.cyl(0.068, 0.068, 0.004, 10, 0, -0.012, 0, 0x5ac8e8);
  for (const s of [-1, 1]) B.box(0.006, 0.03, 0.006, s * 0.075, -0.02, 0, C.metal);
  slideRun(p, [V(rx + 0.14, 0.245, rz), V(rx + 0.2, 0.22, rz), V(rx + 0.36, 0.08, rz + 0.02), V(rx + 0.42, 0.045, rz + 0.03)], 0.06, 0x4fa860);
  slideRun(p, [V(rx - 0.13, 0.445, rz - 0.03), V(rx - 0.2, 0.39, rz - 0.07), V(rx - 0.28, 0.24, rz - 0.04), V(rx - 0.33, 0.12, rz + 0.04), V(rx - 0.35, 0.05, rz + 0.12)], 0.06, 0xf28a3c);
  for (let k = 0; k < 4; k++) p.box(0.06, 0.006, 0.012, rx, 0.04 + k * 0.045, rz + 0.155, 0xd8d6d0);
  const mx = rx - 0.25, mz = rz - 0.27;
  p.cyl(0.02, 0.03, 0.16, 8, mx, y0 + 0.02, mz, rim);
  p.add(new THREE.SphereGeometry(0.11, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), mx, 0.19, mz, 0xf28aa8);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.sphere(0.014, mx + Math.cos(a) * 0.065, 0.225, mz + Math.sin(a) * 0.065, C.white); }
  p.add(new THREE.CylinderGeometry(0.105, 0.12, 0.16, 16, 1, true), mx, y0 + 0.1, mz, 0x9ad8f0);
  palmTree(p, rx + 0.28, rz - 0.3, 0.38, y0 + 0.02); palmTree(p, rx - 0.3, rz + 0.25, 0.42, y0 + 0.02); palmTree(p, rx + 0.3, rz + 0.27, 0.34, y0 + 0.02);
  figure(p, rx + 0.42, rz + 0.12, 0xf2c23a, 0.4, false, 0xc8a070, 'run', 0.02);
  figure(p, rx - 0.12, rz + 0.3, 0xd84a3e, 2.4, false, 0x4a3426, 'cheer', 0.02);
  figure(p, rx + 0.06, rz - 0.2, 0x3a6ab8, 1.2, false, 0x2a2420, 'cheer', 0.02);
  figure(p, rx - 0.05, rz - 0.36, 0xb45ad8, -0.6, false, 0x8a5a3a, 'idle', 0.02);

  // ---- la vague de surf : sa rampe d'eau qui file, l'écume en haut, le surfeur qui taille sa courbe, les curieux
  const sx = 0.85, sz = -1.2;
  p.box(0.66, 0.17, 0.04, sx, y0, -1.4, rim);
  for (const s of [-1, 1]) p.box(0.04, 0.17, 0.4, sx + s * 0.31, y0, sz, rim);
  p.box(0.66, 0.045, 0.03, sx, y0, -0.995, rim);
  for (const [w, x, z, d] of [[0.68, sx, -1.4, 0.05], [0.05, sx - 0.31, sz, 0.42], [0.05, sx + 0.31, sz, 0.42]]) p.box(w, 0.015, d, x, y0 + 0.17, z, 0x3a4a9a);
  p.add(new THREE.BoxGeometry(0.58, 0.01, 0.4).rotateX(0.3), sx, y0 + 0.085, sz, 0x5ac8e8);
  p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.58, 8).rotateZ(Math.PI / 2), sx, y0 + 0.15, -1.37, 0xf4fbfd);
  for (let k = 0; k < 5; k++) { const zz = sz + 0.06 - (k % 3) * 0.05; p.box(0.1, 0.004, 0.012, sx - 0.24 + k * 0.12, y0 + 0.089 - (zz - sz) * 0.31, zz, 0xf4fbfd, 0.2 * (k - 2)); }
  const S = sway([sx + 0.04, y0 + 0.088, sz + 0.02], [0, 1, 0], 0.5, 0.35);
  S.box(0.04, 0.008, 0.12, 0, 0, 0, 0xf2c23a, 0.3); figure(S, 0, 0, 0x3a6ab8, 0.3 + Math.PI / 2, false, 0xc8a070);
  p.box(0.32, 0.07, 0.01, sx, y0 + 0.185, -1.4, 0x2a2a3a); for (let k = 0; k < 4; k++) p.box(0.05, 0.035, 0.004, sx - 0.105 + k * 0.07, y0 + 0.203, -1.394, 0x9ae8ff, 0, true);
  for (const [x, c] of [[0.6, 0xd84a3e], [0.75, 0x4fa860], [1.08, 0xf2c23a]] as number[][]) figure(p, x, -0.95, c, Math.PI, false, 0x4a3426, x > 1 ? 'cheer' : 'idle');

  // ---- l'allée et l'entrée : arc et vagues lumineuses, guichet, tourniquets ; les cabines, les douches ; la paillote
  p.box(0.24, 0.004, 0.94, rx, y0, 0.96, 0xd8cfc0);
  for (const s of [-1, 1]) { p.box(0.07, 0.5, 0.07, rx + s * 0.27, y0, 1.4, rim); p.sphere(0.045, rx + s * 0.27, 0.55, 1.4, 0x3c7fd8); }
  p.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), rx, 0.47, 1.4, 0x3c7fd8);
  for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); p.box(0.03, 0.03, 0.006, rx - Math.cos(a) * 0.25, 0.47 + Math.sin(a) * 0.25, 1.433, k % 2 ? 0x9ae8ff : C.white, 0, true); }
  for (let k = 0; k < 5; k++) p.box(0.05, 0.04, 0.006, rx - 0.12 + k * 0.06, 0.6, 1.432, [0x9ae8ff, 0xffe2a0][k % 2], 0, true);
  for (const x of [rx - 0.12, rx + 0.12]) { p.box(0.03, 0.08, 0.06, x, y0, 1.3, 0x8a8f96); p.box(0.05, 0.006, 0.006, x + 0.03, 0.07, 1.3, C.metal); }
  p.box(0.16, 0.16, 0.12, rx + 0.42, y0, 1.32, rim); p.box(0.18, 0.025, 0.14, rx + 0.42, 0.17, 1.32, 0xd84a3e); p.box(0.1, 0.06, 0.006, rx + 0.42, 0.09, 1.252, 0xffe8b0, 0, true);
  p.box(0.3, 0.16, 0.24, 0.3, y0, 0.75, rim); p.box(0.32, 0.02, 0.26, 0.3, 0.17, 0.75, 0xd8d6d0);
  for (let k = 0; k < 4; k++) p.box(0.05, 0.12, 0.006, 0.19 + k * 0.074, y0, 0.872, sun[k]);
  for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.11, 0.008, 0.08), 0.24 + k * 0.12, 0.195, 0.72, 0x2c3e5a, 0, false, 0, 0.3);
  for (const x of [0.1, 0.18]) { p.cyl(0.005, 0.005, 0.24, 4, x, y0, 1.1, C.metal); p.box(0.03, 0.006, 0.012, x, 0.25, 1.08, C.metal); p.cyl(0.025, 0.025, 0.004, 8, x, y0, 1.08, 0x8a8f96); }
  figure(p, 0.1, 1.08, 0xf28aa8, 0.2, false, 0x4a3426);
  p.box(0.32, 0.15, 0.2, 1.18, y0, 0.72, 0xb08968); p.box(0.28, 0.05, 0.006, 1.18, 0.09, 0.823, 0xffe8b0, 0, true);
  p.box(0.34, 0.03, 0.06, 1.18, 0.07, 0.85, 0x8a6448);
  p.pyramid(0.46, 0.16, 0.34, 1.18, 0.162, 0.72, 0xd8b86a);
  for (const [x, z, c] of [[0.98, 1.04, 0xd84a3e], [1.22, 1.1, 0x3c7fd8], [1.38, 0.96, 0xf2c23a]] as number[][]) {
    p.cyl(0.05, 0.05, 0.008, 10, x, 0.07, z, C.white); p.cyl(0.006, 0.006, 0.07, 4, x, y0, z, C.metal);
    p.cyl(0.004, 0.004, 0.26, 4, x, 0.078, z, C.metal); p.cone(0.1, 0.05, 8, x, 0.3, z, c);
    seated(p, x - 0.06, y0 + 0.03, z, Math.PI / 2, sun[Math.round(x * 10) % sun.length]); seated(p, x + 0.06, y0 + 0.03, z, -Math.PI / 2, sun[Math.round(z * 10) % sun.length], 0x8a5a3a);
  }
  for (const [x, z] of [[0.62, 0.62], [0.88, 1.18]]) lampPost(p, x, z, 0.3);
  palmTree(p, 1.4, 0.45, 0.42); palmTree(p, 0.03, 1.42, 0.4); palmTree(p, 1.42, 1.42, 0.36); palmTree(p, -0.05, -1.25, 0.44); palmTree(p, 1.4, -0.75, 0.38);
  for (const [x, z, c, r, pose] of [[0.68, 1.22, 0xf2c23a, Math.PI, 'idle'], [0.82, 1.18, 0x3a6ab8, Math.PI, 'idle'], [0.72, 0.62, 0xd84a3e, Math.PI, 'idle'], [0.84, 0.9, 0x4fa860, 0.3, 'idle'], [1.12, 0.88, 0xf28aa8, 0.2, 'cheer'], [-0.08, -0.3, 0xb45ad8, -Math.PI / 2, 'cheer'], [0.42, 1.2, 0xf2c23a, 2.6, 'run']] as [number, number, number, number, Pose][]) figure(p, x, z, c, r, false, 0x4a3426, pose);
  figure(p, hx + 0.05, hz - 0.02, 0xf28a3c, 0.4, false, 0x4a3426, 'idle', 0.25); figure(p, hx - 0.05, hz + 0.03, 0x4fa860, 2.2, false, 0x2a2420, 'idle', 0.48); figure(p, hx + 0.06, hz + 0.05, 0xd84a3e, -1.2, false, 0xc8a070, 'cheer', 0.9);
}

/**
 * Parc d'attractions (2 × 2) : fête foraine de l'âge industriel (carrousel qui tourne sous son chapiteau rayé, grande roue,
 * baraques à frites et à confiseries, guirlandes) ; parc d'attractions ensuite (grande roue qui tourne et ses nacelles,
 * montagnes russes et leur train, tour de chute, carrousel, porte d'entrée et ballons)
 */
function funfair(p: Parts, age: number) {
  sink(0.012);
  const wheel = (wp: Parts, r: number, n: number, ox: number, oy: number, oz: number) => {
    wp.add(new THREE.TorusGeometry(r, 0.012, 4, 24), ox, oy, oz, 0xf4f2ee);
    wp.add(new THREE.TorusGeometry(r * 0.3, 0.01, 4, 12), ox, oy, oz, 0xf4f2ee);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      wp.add(new THREE.BoxGeometry(0.008, r, 0.008).translate(0, r / 2, 0), ox, oy, oz, 0xd8d6d0, 0, false, a);
      wp.box(0.05, 0.05, 0.05, ox - Math.sin(a) * r, oy + Math.cos(a) * r - 0.025, oz, [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860][k % 4]);
    }
  };
  // grande roue : pieds en A, et la roue (qui tourne à l'époque moderne)
  const wx = -0.5, wz = -0.55, wy = 0.6, wr = 0.42;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, 0.66, 0.02).translate(0, 0.33, 0), wx + sx * 0.15, 0.012, wz + sz * 0.06, 0xd8d6d0, 0, false, sx * 0.24);
  if (age >= 4) wheel(spinner([wx, wy, wz], [0, 0, 1], 0.25), wr, 10, 0, 0, 0);
  else wheel(p, wr, 10, wx, wy, wz);
  // carrousel : plateau, chevaux de bois, chapiteau rayé (il tourne à la fête foraine)
  const cx = 0.45, cz = 0.4;
  const car = age < 4 ? spinner([cx, 0.012, cz], [0, 1, 0], 0.8) : p;
  const ox = age < 4 ? 0 : cx, oz = age < 4 ? 0 : cz;
  car.cyl(0.3, 0.3, 0.03, 16, ox, 0, oz, 0xe8c66a);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = ox + Math.cos(a) * 0.22, z = oz + Math.sin(a) * 0.22; car.cyl(0.004, 0.004, 0.24, 4, x, 0.03, z, C.gold); car.box(0.03, 0.05, 0.08, x, 0.08, z, [C.white, 0x8a5a3a, 0xd84a3e, 0x3c7fd8][k % 4], -a); }
  for (let k = 0; k < 12; k++) car.add(new THREE.ConeGeometry(0.34, 0.14, 12, 1, true, (k / 12) * Math.PI * 2, Math.PI / 6), ox, 0.34, oz, k % 2 ? 0xd84a3e : C.white);
  car.cyl(0.03, 0.03, 0.3, 6, ox, 0.03, oz, C.gold);
  // baraques : frites, confiserie, chamboule-tout, sous leurs auvents rayés ; guirlandes de lampions
  for (const [x, z, c] of [[0.6, -0.4, 0xd84a3e], [0.3, -0.75, 0x3c7fd8], [-0.15, 0.75, 0x4fa860]] as [number, number, number][]) {
    p.box(0.26, 0.18, 0.16, x, 0.012, z, C.cream);
    for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.055, 0.01, 0.12), x - 0.11 + k * 0.055, 0.2, z + 0.06, k % 2 ? C.white : c, 0, false, 0, 0.35);
    p.box(0.2, 0.06, 0.012, x, 0.1, z + 0.081, 0xffe2a0, 0, true);
  }
  for (let k = 0; k < 10; k++) { const t = k / 9, x = -0.9 + t * 1.8, y = 0.42 - Math.sin(t * Math.PI) * 0.06; p.box(0.012, 0.012, 0.012, x, y, 0.95, [0xffe2a0, 0xff9a6a, 0x9ae8ff][k % 3], 0, true); }
  for (const x of [-0.9, 0.9]) p.cyl(0.008, 0.008, 0.44, 4, x, 0.012, 0.95, 0x3c4a44);
  if (age >= 4) {
    // montagnes russes : la voie sur ses pylônes, une boucle, le train ; tour de chute ; porte d'entrée et ballons
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 40; k++) { const t = (k / 40) * Math.PI * 2; pts.push(new THREE.Vector3(-0.05 + Math.cos(t) * 0.75, 0.15 + 0.32 * Math.max(0, Math.sin(t * 2 + 0.6)) + 0.15 * Math.sin(t * 3), 0.25 + Math.sin(t) * 0.55)); }
    for (let k = 0; k < 40; k++) {
      const a = pts[k], b = pts[k + 1], d = b.clone().sub(a), len = d.length();
      const g = new THREE.BoxGeometry(0.05, 0.012, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
      p.add(g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0xd84a3e);
      if (k % 3 === 0) p.box(0.012, a.y, 0.012, a.x, 0.012, a.z, 0xd8d6d0);
    }
    for (let k = 0; k < 3; k++) { const a = pts[6 + k * 2]; p.box(0.06, 0.04, 0.08, a.x, a.y + 0.012, a.z, [0xf2c23a, 0x3c7fd8, 0x4fa860][k]); }
    p.box(0.04, 1.0, 0.04, 0.85, 0.012, -0.8, 0xd8d6d0); p.cyl(0.08, 0.08, 0.05, 10, 0.85, 0.6, -0.8, 0xf2c23a); p.box(0.03, 0.03, 0.03, 0.85, 1.01, -0.8, 0xff4a3a, 0, true);
    for (const sx of [-1, 1]) p.box(0.06, 0.42, 0.06, -0.55 + sx * 0.22, 0.012, 0.85, 0xb45ad8);
    p.box(0.52, 0.08, 0.08, -0.55, 0.43, 0.85, 0xf2c23a); for (let k = 0; k < 6; k++) p.box(0.04, 0.03, 0.006, -0.68 + k * 0.05, 0.455, 0.892, 0xffe8b0, 0, true);
    for (const [x, c] of [[-0.85, 0xd84a3e], [-0.8, 0xf2c23a], [-0.88, 0x3c7fd8]] as [number, number][]) { p.box(0.002, 0.3, 0.002, x, 0.1, 0.7, 0x2a2a2e); p.sphere(0.03, x, 0.42, 0.7, c, 1, 1.2); }
  }
  // à la fête foraine : chaises volantes, barbe à papa, guirlande de lampions, et la foule
  if (age === 3) {
    p.cyl(0.015, 0.02, 0.5, 6, -0.45, 0.012, 0.25, C.white); p.cone(0.16, 0.08, 10, -0.45, 0.48, 0.25, 0xd84a3e);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = -0.45 + Math.cos(a) * 0.2, z = 0.25 + Math.sin(a) * 0.2;
      p.add(new THREE.BoxGeometry(0.004, 0.2, 0.004), -0.45 + Math.cos(a) * 0.17, 0.4, 0.25 + Math.sin(a) * 0.17, 0x9aa3ad, 0, false, Math.cos(a) * 0.25, -Math.sin(a) * 0.25);
      p.box(0.03, 0.02, 0.03, x, 0.27, z, [0xf2c23a, 0x3c7fd8][k % 2], -a);
    }
    p.box(0.1, 0.07, 0.06, 0.05, 0.012, 0.05, C.white); p.sphere(0.03, 0.05, 0.12, 0.05, 0xf2a6c8, 0, 0.9);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateZ(Math.PI / 2), 0.05 + s * 0.05, 0.03, 0.05, 0x3c3c40);
    for (let k = 0; k <= 10; k++) { const x = -0.85 + k * 0.17; p.sphere(0.014, x, 0.42 - Math.sin((k / 10) * Math.PI) * 0.05, 0.88, [0xffd68a, 0xff8a7a, 0x8ac8ff][k % 3]); }
    for (const x of [-0.86, 0.86]) p.cyl(0.006, 0.008, 0.44, 4, x, 0.012, 0.88, C.darkwood);
    for (const [x, z, c, r] of [[0.15, 0.2, 0x8a3a3a, 2.4], [-0.1, -0.1, 0x3a5a9a, 0.6], [0.0, 0.55, 0xd8a03a, Math.PI], [-0.2, 0.6, 0x6a8a4a, 2.9]] as number[][]) figure(p, x, z, c, r);
  }
}

/** Gare du bas du télésiège sur la station de montagne (repère du bâtiment) : le moyeu de sa grande roue */
export const ALPINE_LIFT: [number, number, number] = [0.55, 0.36, 0.45];

/**
 * Club alpin (2 × 2, en montagne) : chalet de pierre et de bois, pignon en façade sous un grand toit débordant, balcon
 * fleuri de géraniums, cheminée qui fume, mât aux couleurs du club, râtelier de skis de bois, cordes et piolets, poteau
 * indicateur jaune, terrasse, luge et bois de chauffe. À l'époque moderne, station de montagne : chalet-restaurant vitré et
 * sa terrasse aux transats, gare du bas du télésiège dont la grande roue tourne, skis de toutes les couleurs, dameuse,
 * panneau des pistes, manche à air
 */
function alpine(p: Parts, age: number) {
  sink(0.012);
  for (let i = 0; i < 10; i++) p.sphere(0.03 + hash2(i, 5, 212) * 0.04, -0.9 + hash2(i, 6, 212) * 1.8, 0.012, -0.9 + hash2(i, 7, 212) * 0.3 + (i % 2) * 1.5, C.darkstone, 0, 0.6);
  // poteau indicateur jaune des sentiers, sa marque blanche et rouge
  p.cyl(0.012, 0.014, 0.4, 5, 0.78, 0.012, 0.66, C.metal);
  [[0.35, 0.4], [0.29, -0.6], [0.23, 2.2]].forEach(([y, r]) => {
    p.add(new THREE.BoxGeometry(0.16, 0.04, 0.008).translate(0.08, 0, 0), 0.78, y, 0.66, 0xf2c23a, r);
    p.add(new THREE.BoxGeometry(0.03, 0.012, 0.009).translate(0.13, 0, 0), 0.78, y + 0.004, 0.66, 0xd84a3e, r);
  });
  if (age <= 3) {
    const wood = 0xa0704a, roofC = 0x6a564a, bw = 0.94, bd = 0.64, cx = -0.2, cz = -0.4, fz = cz + bd / 2;
    p.box(bw, 0.22, bd, cx, 0.012, cz, C.stone);
    stones(p, cx, fz, bw, 0.012, 0.23, 0, C.darkstone, 0.55, 211);
    p.box(bw + 0.02, 0.3, bd + 0.02, cx, 0.232, cz, wood);
    for (let y = 0.26; y < 0.53; y += 0.045) p.box(bw + 0.026, 0.008, bd + 0.026, cx, y, cz, dark(wood, 0.82));
    roof(p, cx, 0.532, cz, { w: bd + 0.02, d: bw + 0.02, h: 0.34, ry: Math.PI / 2, color: roofC, wall: wood, ov: 0.13, len: bd + 0.26, courses: true });
    // pignon : fenêtres à volets verts, œil-de-bœuf, balcon de planches découpées et ses géraniums
    windows(p, [cx - 0.22, cx, cx + 0.22], 0.3, fz + 0.012, 0.08, 0.1, C.cream);
    for (const x of [cx - 0.22, cx, cx + 0.22]) for (const d of [-1, 1]) p.box(0.03, 0.11, 0.01, x + d * 0.06, 0.295, fz + 0.016, 0x3f7a5a);
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10).rotateX(Math.PI / 2), cx, 0.66, fz + 0.012, C.win, 0, true);
    p.box(bw - 0.06, 0.02, 0.14, cx, 0.255, fz + 0.07, wood);
    for (let k = 0; k <= 16; k++) p.box(0.018, 0.08, 0.008, cx - (bw - 0.08) / 2 + (k * (bw - 0.08)) / 16, 0.275, fz + 0.135, dark(wood, 0.9));
    p.box(bw - 0.06, 0.014, 0.012, cx, 0.355, fz + 0.135, dark(wood, 0.8));
    for (let k = 0; k < 3; k++) { const x = cx - 0.3 + k * 0.3; p.box(0.16, 0.03, 0.035, x, 0.37, fz + 0.14, C.terracotta); for (let j = 0; j < 4; j++) p.sphere(0.014, x - 0.055 + j * 0.037, 0.405, fz + 0.145, j % 2 ? 0xd84a3e : 0x5f9a4a, 0, 0.8); }
    // rez-de-chaussée : porte, fenêtres, cordes lovées et piolets au mur, cheminée
    p.box(0.12, 0.19, 0.02, cx, 0.012, fz + 0.002, C.door);
    windows(p, [cx - 0.3, cx + 0.3], 0.06, fz + 0.012, 0.08, 0.09, C.stone);
    for (const z of [cz - 0.15, cz + 0.05]) p.add(new THREE.TorusGeometry(0.035, 0.008, 4, 10).rotateY(Math.PI / 2), cx + bw / 2 + 0.012, 0.15, z, z > cz ? 0xd84a3e : 0x3c7fd8);
    for (const d of [-0.04, 0.04]) { p.box(0.008, 0.12, 0.008, cx + bw / 2 + 0.014, 0.05, cz + 0.2 + d, C.darkwood); p.box(0.008, 0.008, 0.04, cx + bw / 2 + 0.014, 0.165, cz + 0.2 + d, C.metal); }
    p.box(0.08, 0.24, 0.08, cx + 0.22, 0.6, cz - 0.15, C.stone); smoke(cx + 0.22, 0.86, cz - 0.15, 1);
    // mât du club (bleu et or), râtelier de skis de bois, luge, bois de chauffe, terrasse
    p.cyl(0.008, 0.01, 0.82, 5, 0.6, 0.012, -0.7, C.metal);
    p.box(0.004, 0.09, 0.15, 0.6, 0.72, -0.62, 0x3a6ab8); p.box(0.005, 0.025, 0.15, 0.6, 0.752, -0.62, 0xe8c66a);
    p.box(0.3, 0.014, 0.02, 0.4, 0.2, 0.02, C.darkwood); for (const d of [-0.14, 0.14]) p.box(0.016, 0.21, 0.016, 0.4 + d, 0.012, 0.02, C.darkwood);
    for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.018, 0.34, 0.006), 0.29 + k * 0.055, 0.17, 0.05, k % 2 ? C.wood : dark(C.wood, 0.85), 0, false, 0, -0.18);
    p.box(0.07, 0.02, 0.18, -0.62, 0.04, 0.3, C.wood); for (const d of [-0.03, 0.03]) p.box(0.008, 0.035, 0.2, -0.62 + d, 0.012, 0.3, C.darkwood);
    logPile(p, -0.78, -0.55, 3, 0.28, Math.PI / 2);
    p.box(0.6, 0.025, 0.36, 0.2, 0.012, 0.5, C.wood);
    p.box(0.2, 0.02, 0.1, 0.2, 0.1, 0.5, C.darkwood); for (const s of [-1, 1]) p.box(0.2, 0.02, 0.05, 0.2, 0.065, 0.5 + s * 0.1, C.wood);
    p.cyl(0.006, 0.006, 0.3, 4, 0.2, 0.037, 0.5, C.metal); p.cone(0.14, 0.06, 8, 0.2, 0.3, 0.5, 0xd84a3e);
  } else {
    // chalet-restaurant : socle de pierre, bardage, grande façade vitrée, toit à faible pente qui déborde, enseigne
    const cx = -0.3, cz = -0.42, bw = 1.0, bd = 0.7, fz = cz + bd / 2;
    p.box(bw, 0.16, bd, cx, 0.012, cz, C.stone);
    stones(p, cx, fz, bw, 0.012, 0.17, 0, C.darkstone, 0.55, 213);
    p.box(bw, 0.34, bd, cx, 0.172, cz, 0x8a6446);
    for (let x = -bw / 2 + 0.03; x < bw / 2; x += 0.06) p.box(0.008, 0.34, bd + 0.008, cx + x, 0.172, cz, dark(0x8a6446, 0.85));
    p.box(bw - 0.12, 0.26, 0.012, cx, 0.2, fz + 0.004, C.glass, 0, true);
    for (let k = 0; k <= 6; k++) p.box(0.012, 0.27, 0.018, cx - (bw - 0.12) / 2 + (k * (bw - 0.12)) / 6, 0.195, fz + 0.008, 0x3c3c40);
    p.add(new THREE.BoxGeometry(bw + 0.14, 0.035, bd + 0.16), cx, 0.54, cz, 0x9aa0a8, 0, false, 0, -0.12);
    p.add(new THREE.BoxGeometry(bw + 0.15, 0.012, 0.03), cx, 0.512, fz + 0.075, 0x6a6f78, 0, false, 0, -0.12);
    p.box(0.44, 0.05, 0.012, cx, 0.47, fz + 0.012, 0x3c3c40); for (let k = 0; k < 7; k++) p.box(0.04, 0.026, 0.006, cx - 0.15 + k * 0.05, 0.482, fz + 0.02, 0xffe8b0, 0, true);
    // terrasse de bois, transats rayés et parasols
    p.box(bw, 0.03, 0.34, cx, 0.012, fz + 0.2, C.wood);
    for (const [x, c] of [[-0.65, 0xd84a3e], [-0.45, 0x3c7fd8], [-0.25, 0xf2c23a], [-0.05, 0x4fa860]] as [number, number][]) {
      p.add(new THREE.BoxGeometry(0.07, 0.012, 0.16), x, 0.07, fz + 0.24, c, 0, false, 0, -0.25);
      p.add(new THREE.BoxGeometry(0.07, 0.012, 0.08), x, 0.1, fz + 0.14, c, 0, false, 0, 0.9);
      for (const d of [-0.03, 0.03]) p.box(0.006, 0.05, 0.006, x + d, 0.042, fz + 0.3, C.metal);
    }
    for (const x of [-0.55, -0.15]) { p.cyl(0.006, 0.006, 0.3, 4, x, 0.042, fz + 0.3, C.metal); p.cone(0.12, 0.05, 8, x, 0.33, fz + 0.3, x < -0.3 ? 0xf2785a : 0x8cc4e8); }
    // gare du bas du télésiège : dalle, piliers rouges, toit, moteur et grande roue horizontale qui tourne
    const [lx, ly, lz] = ALPINE_LIFT;
    p.box(0.52, 0.03, 0.52, lx, 0.012, lz, 0xb8b4ac);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) p.box(0.03, ly + 0.06, 0.03, lx + dx, 0.042, lz + dz, 0xd04a3e);
    p.box(0.48, 0.03, 0.48, lx, ly + 0.1, lz, 0xd04a3e);
    p.box(0.12, 0.06, 0.12, lx, ly + 0.04, lz, 0x5d6878);
    p.box(0.3, 0.012, 0.08, lx, 0.15, lz + 0.24, 0x8a8f96);
    const wh = spinner([lx, ly, lz], [0, 1, 0], 3.3);
    wh.add(new THREE.TorusGeometry(0.13, 0.012, 4, 20).rotateX(Math.PI / 2), 0, 0, 0, 0x3c3c40);
    for (let k = 0; k < 4; k++) wh.add(new THREE.BoxGeometry(0.26, 0.008, 0.008), 0, 0, 0, 0x8a8f96, (k * Math.PI) / 4);
    // skis de toutes les couleurs sur leur râtelier, dameuse rouge, panneau des pistes, manche à air
    p.box(0.34, 0.014, 0.02, 0.05, 0.2, 0.25, C.metal); for (const d of [-0.16, 0.16]) p.box(0.016, 0.21, 0.016, 0.05 + d, 0.012, 0.25, C.metal);
    [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xb45ad8, 0xff7ab8].forEach((c, k) => p.add(new THREE.BoxGeometry(0.018, 0.34, 0.006), -0.08 + k * 0.05, 0.17, 0.28, c, 0, false, 0, -0.18));
    p.box(0.22, 0.1, 0.34, -0.55, 0.05, 0.55, 0xd84a3e); p.box(0.18, 0.08, 0.14, -0.55, 0.15, 0.5, 0xcfe2f0);
    for (const s of [-1, 1]) p.box(0.06, 0.07, 0.4, -0.55 + s * 0.13, 0.012, 0.55, 0x3c3c40);
    p.box(0.34, 0.08, 0.03, -0.55, 0.02, 0.76, 0xe8e4dc);
    p.cyl(0.01, 0.01, 0.34, 5, 0.85, 0.012, 0.2, C.metal);
    [0x4fa860, 0x3c7fd8, 0xd84a3e, 0x2a2a2e].forEach((c, k) => p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 10).rotateX(Math.PI / 2), 0.85, 0.32 - k * 0.06, 0.212, c));
    p.cyl(0.005, 0.005, 0.5, 4, -0.85, 0.012, -0.1, 0x9aa3ad);
    p.add(new THREE.ConeGeometry(0.025, 0.1, 6).rotateZ(Math.PI / 2), -0.8, 0.48, -0.1, 0xf28a3c);
    // cheminée de pierre qui fume
    p.box(0.1, 0.2, 0.1, cx - 0.3, 0.46, cz - 0.15, C.stone); p.box(0.12, 0.02, 0.12, cx - 0.3, 0.66, cz - 0.15, C.darkstone); smoke(cx - 0.3, 0.7, cz - 0.15, 1);
    // le loueur de skis : chalet-kiosque, guichet éclairé et son comptoir, store orange, skis et planches contre le mur, un client
    p.box(0.18, 0.18, 0.3, 0.8, 0.012, -0.36, 0xa0704a); p.box(0.22, 0.02, 0.34, 0.8, 0.192, -0.36, 0x6a564a);
    p.box(0.006, 0.07, 0.14, 0.712, 0.1, -0.42, 0xffe8b0, 0, true); p.box(0.04, 0.012, 0.16, 0.69, 0.09, -0.42, C.wood);
    p.add(new THREE.BoxGeometry(0.08, 0.008, 0.18), 0.67, 0.18, -0.42, 0xf28a3c, 0, false, 0.4);
    [0x3c7fd8, 0xd84a3e, 0x2a2a2e, 0x4fa860].forEach((c, k) => p.add(new THREE.BoxGeometry(0.006, 0.2, k % 2 ? 0.04 : 0.018).translate(0, 0.1, 0), 0.69, 0.012, -0.3 + k * 0.026, c, 0, false, -0.08));
    figure(p, 0.6, -0.44, 0xf28a3c, Math.PI / 2, false, 0x2a2420);
    // la dameuse a sa motoneige ; les promeneurs qui attendent le télésiège, bâtons en main
    p.box(0.07, 0.04, 0.14, -0.28, 0.03, 0.62, 0xf2c23a); p.box(0.05, 0.03, 0.06, -0.28, 0.07, 0.6, 0x2a2a2e);
    p.add(new THREE.BoxGeometry(0.05, 0.04, 0.006), -0.28, 0.09, 0.68, 0x9fc4dc, 0, false, 0, -0.5);
    for (const s of [-1, 1]) p.box(0.008, 0.008, 0.16, -0.28 + s * 0.03, 0.012, 0.62, 0x3c3c40);
    for (const [x, z, c, r] of [[0.36, 0.8, 0xd84a3e, Math.PI], [0.5, 0.82, 0x3c7fd8, Math.PI - 0.2], [0.64, 0.8, 0xf2c23a, Math.PI + 0.2]]) {
      figure(p, x, z, c, r, false, 0xf2f2ee);
      for (const d of [-0.04, 0.04]) p.add(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 3).translate(0, 0.06, 0), x + d, 0.012, z + 0.01, 0x8a8f96, 0, false, -d * 3);
    }
    // les clients au soleil sur la terrasse, le serveur et son plateau
    for (const x of [-0.65, -0.25]) seated(p, x, 0.09, fz + 0.24, 0, [0xb45ad8, 0x4fa860][x < -0.4 ? 0 : 1], 0x8a5a3a);
    figure(p, -0.36, fz + 0.12, C.white, 0.6, false, 0x2a2420); p.box(0.06, 0.004, 0.06, -0.33, 0.13, fz + 0.14, C.metal);
  }
}

/** Personnage debout à la hauteur y (sur une scène, une tribune) : longue robe, tête ou masque */
function actor(p: Parts, x: number, y: number, z: number, ry: number, robe: number, head = 0xe8b894) {
  if (lifeK !== 1 && !lifeIn) { lifeSize(p, x, y, z, () => actor(p, x, y, z, ry, robe, head)); return; }
  const draw = (q: Parts) => { q.box(0.05, 0.1, 0.034, x, y, z, robe, ry); q.box(0.06, 0.012, 0.04, x, y + 0.085, z, dark(robe, 0.85), ry); q.box(0.032, 0.032, 0.032, x, y + 0.1, z, head, ry); };
  if (p !== mainParts) { draw(p); return; }
  // l'acteur se balance en déclamant, un bras qui accompagne la tirade
  const c = Math.cos(ry), s = Math.sin(ry), h = hash2(Math.round(x * 97 + 500), Math.round(z * 89 + 500), 29), ph = h * 6.28;
  animPart(draw, [x, y, z], [s, 0, c], 0.07, 0.45 + h * 0.3, ph);
  const ax = x + c * 0.034, az = z - s * 0.034;
  animPart((q) => { q.box(0.014, 0.05, 0.016, ax, y + 0.035, az, robe, ry); q.box(0.016, 0.016, 0.018, ax, y + 0.02, az, head, ry); }, [ax, y + 0.085, az], [c, 0, -s], 0.6, 0.6 + h * 0.4, ph + 1);
}

/** Spectateur assis à la hauteur y (gradin, banc) */
function seated(p: Parts, x: number, y: number, z: number, ry: number, body: number, hair = 0x4a3426) {
  if (lifeK !== 1 && !lifeIn) { lifeSize(p, x, y, z, () => seated(p, x, y, z, ry, body, hair)); return; }
  const draw = (q: Parts) => { q.box(0.042, 0.045, 0.03, x, y, z, body, ry); q.box(0.026, 0.026, 0.026, x, y + 0.045, z, 0xe8b894, ry); q.box(0.028, 0.01, 0.028, x, y + 0.071, z, hair, ry); };
  if (p !== mainParts) { draw(p); return; }
  // le spectateur se penche, rit, certains trépignent
  const h = hash2(Math.round(x * 97 + 500), Math.round(z * 89 + 500), 31);
  animPart(draw, [x, y, z], [Math.cos(ry), 0, -Math.sin(ry)], 0.06, 0.3 + h * 0.5, h * 6.28, h > 0.7 ? 0.008 : 0);
}

/** Arc en plein cintre tourné vers +z (baie éclairée, arcade) : un demi-disque posé sur le haut d'un rectangle */
function archTop(p: Parts, x: number, y: number, z: number, r: number, color: number, glow = false) {
  p.add(new THREE.CylinderGeometry(r, r, 0.012, 10, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), x, y, z, color, 0, glow);
}

/** Réverbère à globe : fût sombre, lanterne allumée la nuit */
function lampPost(p: Parts, x: number, z: number, h = 0.32) {
  p.cyl(0.01, 0.016, h, 6, x, 0.02, z, 0x3c4a44);
  p.sphere(0.03, x, h + 0.045, z, 0xffe2a0);
  p.add(new THREE.IcosahedronGeometry(0.026, 1), x, h + 0.045, z, 0xffe2a0, 0, true);
}

/**
 * Voiture moderne garée, l'avant vers +z une fois tournée de ry, posée à la hauteur y : caisse, habitacle vitré et son toit,
 * roues, phares (allumés la nuit) et feux arrière
 */
function car(p: Parts, x: number, z: number, ry: number, body: number, y = 0.012) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
  let [px, pz] = at(0, 0);
  p.box(0.13, 0.05, 0.26, px, y + 0.022, pz, body, ry);
  [px, pz] = at(0, -0.015);
  p.box(0.116, 0.045, 0.14, px, y + 0.072, pz, 0x9fc4dc, ry); p.box(0.12, 0.008, 0.12, px, y + 0.117, pz, body, ry);
  for (const [u, w] of [[-0.06, 0.08], [0.06, 0.08], [-0.06, -0.08], [0.06, -0.08]]) { [px, pz] = at(u, w); p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8).rotateZ(Math.PI / 2), px, y + 0.026, pz, 0x1e1e22, ry); }
  for (const u of [-0.042, 0.042]) {
    [px, pz] = at(u, 0.131); p.box(0.026, 0.012, 0.004, px, y + 0.052, pz, 0xfff1c9, ry, true);
    [px, pz] = at(u, -0.131); p.box(0.026, 0.012, 0.004, px, y + 0.052, pz, 0xc8302c, ry);
  }
}

/** Panneaux solaires en rangée le long de x sur un toit plat à la hauteur y, inclinés comme ceux de la villa : montants, cellules */
function solar(p: Parts, x: number, y: number, z: number, n: number, w = 0.14, d = 0.1) {
  for (let k = 0; k < n; k++) {
    const px = x + (k - (n - 1) / 2) * (w + 0.02);
    p.box(0.008, 0.03, 0.008, px, y, z, 0x8a8f96);
    p.add(new THREE.BoxGeometry(w, 0.008, d), px, y + 0.03, z, 0x2a3a6a, 0, false, 0, -0.3);
    for (let j = 1; j < 3; j++) p.add(new THREE.BoxGeometry(0.004, 0.009, d), px - w / 2 + (j * w) / 3, y + 0.03, z, 0x8a9ab8, 0, false, 0, -0.3);
  }
}

/** Groupe de ventilation posé sur un toit à la hauteur y : caisson à ouïes, grille ronde du ventilateur */
function hvac(p: Parts, x: number, y: number, z: number, w = 0.12) {
  p.box(w, 0.06, w * 0.8, x, y, z, 0xb8bcc2);
  for (let k = 1; k < 4; k++) p.box(0.004, 0.044, w * 0.8 + 0.004, x - w / 2 + (k * w) / 4, y + 0.008, z, 0x8a8f96);
  p.cyl(w * 0.3, w * 0.3, 0.01, 10, x, y + 0.06, z, 0x5d6168);
}

/** Banc public : lattes de bois sur pieds d'acier et dossier, le long de x une fois tourné de ry (dossier vers -z), à la hauteur y */
function bench(p: Parts, x: number, z: number, ry = 0, y = 0.012) {
  const c = Math.cos(ry), s = Math.sin(ry);
  p.box(0.16, 0.012, 0.05, x, y + 0.04, z, C.wood, ry);
  p.box(0.16, 0.04, 0.01, x - s * 0.022, y + 0.052, z - c * 0.022, C.wood, ry);
  for (const d of [-0.065, 0.065]) p.box(0.01, 0.04, 0.044, x + c * d, y, z - s * d, 0x5d6878, ry);
}

/** Vélo garé : roues, cadre de couleur, selle et guidon, dans l'axe z une fois tourné de ry, à la hauteur y */
function bike(p: Parts, x: number, z: number, color: number, ry = 0, y = 0.012) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const d of [-0.04, 0.04]) p.add(new THREE.TorusGeometry(0.028, 0.005, 4, 10).rotateY(Math.PI / 2), x + s * d, y + 0.03, z + c * d, 0x2a2a2e, ry);
  p.box(0.006, 0.006, 0.08, x, y + 0.042, z, color, ry);
  p.box(0.006, 0.035, 0.006, x - s * 0.015, y + 0.03, z - c * 0.015, color, ry);
  p.box(0.012, 0.006, 0.02, x - s * 0.015, y + 0.066, z - c * 0.015, 0x2a2a2e, ry);
  p.box(0.036, 0.005, 0.005, x + s * 0.035, y + 0.07, z + c * 0.035, 0x3c3c40, ry);
}

/** Jardinière de béton (w × d) posée à la hauteur y : sa terre et ses arbustes ronds */
function planter(p: Parts, x: number, z: number, w: number, d: number, y = 0.012) {
  p.box(w, 0.05, d, x, y, z, 0x9a968e); p.box(w - 0.016, 0.004, d - 0.016, x, y + 0.05, z, 0x6a5040);
  const n = Math.max(1, Math.round(Math.max(w, d) / 0.075)), along = w >= d;
  for (let i = 0; i < n; i++) {
    const u = -0.5 + (i + 0.5) / n;
    p.sphere(Math.min(w, d) * 0.42, x + (along ? u * w : 0), y + 0.07, z + (along ? 0 : u * d), dark(0x6fa85a, 0.88 + hash2(i, n, 43) * 0.22), 0, 0.8);
  }
}

/**
 * Temple grec de marbre posé à la hauteur y : soubassement à trois degrés, péristyle (nx colonnes sur les longs côtés, le long
 * de x ; nz en façade), cella, entablement à triglyphes, frontons et toit de tuiles ; faîtage le long de x
 */
function greekTemple(p: Parts, x: number, y: number, z: number, w: number, d: number, h: number, nx: number, nz: number) {
  const marble = 0xf2ead8, st = 0.025;
  for (let k = 0; k < 3; k++) p.box(w + 0.1 - k * 0.04, st, d + 0.1 - k * 0.04, x, y + k * st, z, k % 2 ? 0xe9e2d4 : marble);
  const y0 = y + 3 * st, r = Math.min(w / nx, d / nz) * 0.22, ix = w / 2 - r * 1.6, iz = d / 2 - r * 1.6;
  for (let i = 0; i < nx; i++) for (const s of [-1, 1]) column(p, x - ix + (2 * ix * i) / (nx - 1), z + s * iz, h, y0, r);
  for (let j = 1; j < nz - 1; j++) for (const s of [-1, 1]) column(p, x + s * ix, z - iz + (2 * iz * j) / (nz - 1), h, y0, r);
  p.box(w * 0.66, h * 0.92, d * 0.5, x, y0, z, 0xe2d8c4);
  p.box(w, 0.04, d, x, y0 + h, z, marble);
  p.box(w, 0.035, d, x, y0 + h + 0.04, z, 0xe6dccb);
  for (let i = 0; i < nx * 2; i++) for (const s of [-1, 1]) p.box(0.012, 0.03, 0.006, x - ix + (ix * i) / nx, y0 + h + 0.042, z + s * (d / 2 + 0.002), dark(0xe6dccb, 0.7));
  const ty = y0 + h + 0.075;
  roof(p, x, ty, z, { w, d, h: d * 0.26, color: C.terracotta, wall: marble, tiles: true, len: w + 0.04, ov: 0.03 });
  for (const s of [-1, 1]) p.cone(0.022, 0.05, 5, x + s * (w / 2 + 0.01), ty + d * 0.26, z, marble);
}

/**
 * Théâtre (2 × 2) : théâtre antique (gradins en demi-cercle, orchestre, scène à colonnes, acteurs masqués et public),
 * tréteaux du Moyen Âge sur la place (rideau rayé, bancs, roulotte de la troupe), opéra à coupole et statues dorées, puis
 * salle de spectacle moderne sous sa coque d'aluminium, foyer vitré et enseigne lumineuse
 */
function theater(p: Parts, age: number) {
  const marble = 0xf2ead8, crowd = [0xd8786c, 0x86c4b8, 0xf2ead8, 0xe8c66a, 0x8e9bb4, 0xb48a68];
  if (age <= 1) {
    // dallage de la parcelle, d'une pierre plus grise que le sable alentour
    sink(0.02);
    const cz = 0.1, T = 7, rowC = [0xebe2d0, 0xd3c7ae], stair = 0xf8f3e8, wall = 0xbcae90;
    // l'orchestre : cercle de marbre bordé de pierre sombre, l'autel de Dionysos et sa flamme au centre
    p.cyl(0.335, 0.335, 0.012, 28, 0, 0.02, cz, 0x9d927c);
    p.cyl(0.305, 0.305, 0.016, 28, 0, 0.02, cz, 0xf0e8d8);
    p.cyl(0.035, 0.04, 0.05, 8, 0, 0.036, cz, marble); p.cone(0.018, 0.035, 5, 0, 0.086, cz, C.flame, true);
    // les gradins : sept rangs en demi-cercle, une teinte par rang (deux rangs voisins alternent), trois escaliers en relief,
    // murs de soutènement aux deux bouts, et le public assis face à la scène
    for (let k = 0; k < T; k++) {
      const r = 0.38 + k * 0.07, n = Math.ceil((Math.PI * r) / 0.06), dphi = Math.PI / n, top = 0.032 * (k + 1);
      for (let i = 0; i < n; i++) {
        const f = Math.PI / 2 + (i + 0.5) * dphi;
        p.box(2 * r * Math.sin(dphi / 2) * 1.06, top, 0.074, Math.sin(f) * r, 0.02, cz + Math.cos(f) * r, rowC[k % 2], f);
      }
      for (const j of [1, 2, 3]) { const f = Math.PI / 2 + (j * Math.PI) / 4; p.box(0.05, 0.006, 0.074, Math.sin(f) * r, 0.02 + top, cz + Math.cos(f) * r, stair, f); }
      for (const sd of [-1, 1]) p.box(0.07, top + 0.01, 0.035, sd * r, 0.02, cz + 0.004, wall);
      for (let i = 0; i < 7; i++) {
        if (k === 0 || hash2(k, i, 51) < 0.4) continue;
        const f = Math.PI / 2 + Math.PI * (0.06 + 0.88 * ((i + 0.5 * hash2(i, k, 52)) / 7));
        if ([1, 2, 3].some((j) => Math.abs(f - Math.PI / 2 - (j * Math.PI) / 4) < 0.08)) continue;
        seated(p, Math.sin(f) * r, 0.02 + top, cz + Math.cos(f) * r, f + Math.PI, crowd[(i * 3 + k) % crowd.length]);
      }
    }
    // le mur d'enceinte qui ferme le haut des gradins
    { const r = 0.86, n = 30, dphi = Math.PI / n; for (let i = 0; i < n; i++) { const f = Math.PI / 2 + (i + 0.5) * dphi; p.box(2 * r * Math.sin(dphi / 2) * 1.05, 0.29, 0.03, Math.sin(f) * r, 0.02, cz + Math.cos(f) * r, wall, f); } }
    // la scène : bâtiment de scène à deux niveaux (colonnade en haut, trois portes), ailes à fronton, avant-scène à colonnes
    const st = 0xe9e2d4;
    p.box(1.26, 0.28, 0.18, 0, 0.02, 0.59, st);
    stones(p, 0, 0.68, 1.26, 0.02, 0.3, 0, 0xe2d8c4, 0.4, 61);
    roof(p, 0, 0.3, 0.59, { w: 1.28, d: 0.2, h: 0.05, color: C.terracotta, wall: marble, tiles: true, ov: 0.02 });
    for (const x of [-0.24, 0, 0.24]) { p.box(0.07, 0.12, 0.012, x, 0.14, 0.494, 0x4a3a2c); p.box(0.09, 0.014, 0.016, x, 0.26, 0.494, marble); }
    for (let i = 0; i < 8; i++) column(p, -0.42 + i * 0.12, 0.486, 0.15, 0.14, 0.011);
    for (const [x, c] of [[-0.36, 0xb8604a], [-0.12, 0x6a8ab8], [0.12, 0x6a8ab8], [0.36, 0xb8604a]] as [number, number][]) p.box(0.06, 0.08, 0.006, x, 0.16, 0.497, c);
    // les masques de la comédie et de la tragédie au-dessus de la porte du milieu
    for (const [x, c] of [[-0.024, C.white], [0.024, C.gold]] as [number, number][]) { p.add(new THREE.SphereGeometry(0.022, 8, 6).scale(0.85, 1, 0.35), x, 0.282, 0.492, c); p.box(0.006, 0.005, 0.004, x - 0.007, 0.286, 0.5, 0x2a2622); p.box(0.006, 0.005, 0.004, x + 0.007, 0.286, 0.5, 0x2a2622); }
    for (const sd of [-1, 1]) {
      p.box(0.16, 0.28, 0.14, sd * 0.56, 0.02, 0.43, st);
      roof(p, sd * 0.56, 0.3, 0.43, { w: 0.14, d: 0.16, h: 0.06, color: C.terracotta, wall: marble, tiles: true, ry: Math.PI / 2, ov: 0.02 });
      // les passages couverts entre les gradins et la scène
      for (const x of [0.66, 0.8]) p.box(0.035, 0.22, 0.04, sd * x, 0.02, 0.3, marble);
      p.box(0.2, 0.035, 0.06, sd * 0.73, 0.24, 0.3, marble);
    }
    p.box(0.96, 0.12, 0.12, 0, 0.02, 0.44, marble);
    p.box(0.94, 0.09, 0.006, 0, 0.025, 0.378, 0x8a7a64);
    for (let i = 0; i < 9; i++) column(p, -0.44 + i * 0.11, 0.372, 0.12, 0.02, 0.012);
    actor(p, -0.14, 0.14, 0.44, Math.PI, 0x8a4a8a, 0xf2ead8);
    actor(p, 0.16, 0.14, 0.45, Math.PI, 0xd8a03a, 0xe8c66a);
    // le chœur, en blanc, danse dans l'orchestre autour de l'autel
    for (let i = 0; i < 5; i++) { const t = Math.PI * (0.1 + i * 0.2); actor(p, Math.cos(t) * 0.18, 0.036, cz + Math.sin(t) * 0.12, t, 0xf2ead8, 0xf2ead8); }
    p.box(0.12, 0.16, 0.012, 0, 0.02, 0.686, C.door);
    for (const [x, z] of [[-0.86, -0.84], [0.86, -0.84], [-0.86, 0.84], [0.86, 0.84]]) cypress(p, x, z, 0.3);
  } else if (age === 2) {
    sink(0.02);
    // tréteaux : l'estrade de planches sur ses chevalets, le rideau rayé tendu entre deux mâts, l'enseigne de la troupe
    p.box(1.0, 0.14, 0.42, 0, 0.02, -0.45, C.wood);
    for (let k = 0; k < 9; k++) p.box(0.004, 0.003, 0.42, -0.45 + k * 0.112, 0.16, -0.45, C.darkwood);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.016, 0.17, 0.016), x, 0.09, -0.25, C.darkwood, 0, false, s * 0.45);
    for (const s of [-1, 1]) p.box(0.03, 0.62, 0.03, s * 0.5, 0.02, -0.64, C.darkwood);
    p.box(1.04, 0.03, 0.03, 0, 0.62, -0.64, C.darkwood);
    for (let k = 0; k < 8; k++) p.box(0.122, 0.44, 0.012, -0.427 + k * 0.122, 0.17, -0.63, k % 2 ? 0xe8c66a : 0xb8443a);
    for (const s of [-1, 1]) p.box(0.12, 0.42, 0.02, s * 0.44, 0.17, -0.27, 0xb8443a);
    p.box(1.0, 0.04, 0.03, 0, 0.58, -0.27, 0xb8443a);
    p.box(0.46, 0.1, 0.02, 0, 0.66, -0.64, 0x3a5a9a); p.box(0.5, 0.012, 0.024, 0, 0.66, -0.64, C.gold); p.box(0.5, 0.012, 0.024, 0, 0.75, -0.64, C.gold);
    actor(p, -0.15, 0.16, -0.42, 0, 0x6a8ad8);
    actor(p, 0.18, 0.16, -0.46, 0, 0xd8a03a, 0xe8b894);
    p.cone(0.02, 0.04, 4, 0.18, 0.302, -0.46, 0xd84a3e);
    // mâts à fanions, torches de part et d'autre de l'estrade
    for (const s of [-1, 1]) {
      p.cyl(0.008, 0.01, 0.78, 5, s * 0.66, 0.02, -0.3, C.darkwood);
      sway([s * 0.66, 0, -0.3], [0, 1, 0], 0.45, 1.3).box(0.012, 0.08, 0.1, 0, 0.68, 0.05, s > 0 ? 0x3a6ab8 : 0xd84a3e);
      p.cyl(0.008, 0.01, 0.3, 5, s * 0.55, 0.02, -0.18, C.darkwood);
      p.cone(0.02, 0.05, 5, s * 0.55, 0.32, -0.18, C.flame, true);
    }
    // bancs face à l'estrade, et leur public
    for (let row = 0; row < 4; row++)
      for (const x of [-0.34, 0.34]) {
        const z = 0.02 + row * 0.2;
        p.box(0.5, 0.02, 0.06, x, 0.07, z, C.wood);
        for (const d of [-0.2, 0.2]) p.box(0.02, 0.05, 0.05, x + d, 0.02, z, C.darkwood);
        for (let i = 0; i < 3; i++) if (hash2(row, i + (x > 0 ? 5 : 0), 53) < 0.65) seated(p, x - 0.16 + i * 0.16, 0.09, z, Math.PI, crowd[(row * 3 + i) % crowd.length]);
      }
    // la roulotte de la troupe, sa bâche rayée
    p.box(0.22, 0.12, 0.36, 0.72, 0.06, 0.52, C.wood);
    for (let k = 0; k < 4; k++) p.add(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 10, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0.72, 0.18, 0.39 + k * 0.088, k % 2 ? 0xe8d6b0 : 0xc8643a);
    for (const z of [0.4, 0.64]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8).rotateZ(Math.PI / 2), 0.72 + s * 0.12, 0.05, z, C.darkwood);
    tree(p, -0.82, 0.82, 1.1); tree(p, -0.84, -0.3, 1.0);
    // les pavés de la place
    for (let i = 0; i < 32; i++) p.box(0.14, 0.004, 0.1, -0.72 + (i % 8) * 0.19 + (Math.floor(i / 8) % 2) * 0.09, 0.02, -0.08 + Math.floor(i / 8) * 0.24, dark(0xcdbf9f, 0.86 + hash2(i, 4, 96) * 0.12));
    // décors peints sur l'estrade : un arbre, une tour de château, le trône du roi ; chandelles de la rampe
    p.cyl(0.006, 0.006, 0.2, 4, -0.38, 0.16, -0.58, C.darkwood); p.add(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 10).rotateX(Math.PI / 2), -0.38, 0.38, -0.575, 0x5a9a4a);
    p.box(0.12, 0.3, 0.012, 0.38, 0.16, -0.58, 0xa8a49c); for (let k = 0; k < 3; k++) p.box(0.03, 0.03, 0.012, 0.34 + k * 0.04, 0.46, -0.58, 0xa8a49c); p.box(0.04, 0.06, 0.004, 0.38, 0.26, -0.573, 0x2a2622);
    p.box(0.08, 0.05, 0.06, 0.02, 0.16, -0.58, C.gold); p.box(0.08, 0.12, 0.012, 0.02, 0.16, -0.61, C.gold); p.box(0.05, 0.02, 0.05, 0.02, 0.21, -0.58, 0xb8443a);
    for (let k = 0; k < 7; k++) { const x = -0.42 + k * 0.14; p.cyl(0.006, 0.006, 0.025, 5, x, 0.16, -0.25, C.white); p.cone(0.007, 0.018, 4, x, 0.185, -0.25, C.flame, true); }
    // le bouffon jongle
    for (let k = 0; k < 3; k++) p.sphere(0.012, 0.18 + (k - 1) * 0.035, 0.34 + (k % 2) * 0.04, -0.46, [0xd84a3e, 0x3a6ab8, 0xf2d24a][k]);
    // guirlande de lanternes entre les mâts
    for (let k = 0; k <= 8; k++) { const x = -0.6 + k * 0.15, y = 0.62 - Math.sin((k / 8) * Math.PI) * 0.08; p.box(0.025, 0.035, 0.025, x, y, -0.3, 0xffd68a, 0, true); }
    // les musiciens au pied de l'estrade : luth et tambourin
    figure(p, -0.62, -0.06, 0x6a8a4a, 0.3); p.sphere(0.03, -0.6, 0.11, -0.02, 0xa8784a, 0, 0.5); p.box(0.008, 0.008, 0.07, -0.6, 0.12, 0.03, C.darkwood);
    figure(p, 0.62, -0.06, 0x8a3a5a, -0.3); p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 10).rotateX(Math.PI / 2), 0.6, 0.12, -0.01, 0xe8d6b0);
    // le marchand de cervoise : tonneaux, comptoir, chopes
    for (const z of [0.42, 0.52]) { p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8).rotateZ(Math.PI / 2), -0.76, 0.06, z, C.wood); for (const d of [-0.03, 0.03]) p.add(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 8).rotateZ(Math.PI / 2), -0.76 + d, 0.06, z, C.darkwood); }
    p.box(0.1, 0.07, 0.24, -0.64, 0.02, 0.47, C.wood); for (let k = 0; k < 3; k++) p.cyl(0.01, 0.01, 0.02, 6, -0.64, 0.09, 0.4 + k * 0.06, 0x8a5a3a);
    figure(p, -0.7, 0.62, 0x7a5a48, Math.PI / 2);
    // bottes de paille où l'on s'assoit, et ceux qui regardent debout derrière les bancs
    for (const [x, z] of [[0.5, 0.86], [0.66, 0.84]]) { p.box(0.14, 0.06, 0.08, x, 0.02, z, 0xe0c060); p.box(0.14, 0.004, 0.08, x, 0.08, z, 0xc8a848); }
    for (const [x, c] of [[-0.42, 0x8a5a3a], [-0.22, 0x3a5a9a], [0.0, 0xb8443a], [0.22, 0x6a8a4a], [0.38, 0xd8a03a]] as [number, number][]) figure(p, x, 0.84, c, Math.PI);
  } else if (age === 3) {
    sink(0.02);
    const st = 0xe8dcc4, copper = 0x6fb39a, cream = 0xf4ead6;
    // la cage de scène au fond, son toit de cuivre et l'Apollon doré au faîte
    p.box(1.1, 0.85, 0.36, 0, 0.02, -0.66, st);
    roof(p, 0, 0.87, -0.66, { w: 1.12, d: 0.36, h: 0.16, color: copper, wall: st, ov: 0.03 });
    p.cyl(0.012, 0.02, 0.08, 5, 0, 1.02, -0.66, C.gold); p.sphere(0.024, 0, 1.12, -0.66, C.gold);
    // la salle, ronde sous sa coupole de cuivre et sa couronne d'or
    p.cyl(0.42, 0.42, 0.62, 18, 0, 0.02, -0.3, st);
    p.add(new THREE.SphereGeometry(0.44, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), 0, 0.64, -0.3, copper);
    p.cone(0.05, 0.08, 8, 0, 0.86, -0.3, C.gold);
    // la façade : arcades éclairées, loggia à colonnes jumelées, attique et ses groupes dorés
    p.box(1.5, 0.5, 0.5, 0, 0.02, 0.2, st);
    for (let i = 0; i < 7; i++) {
      const x = -0.6 + i * 0.2;
      p.box(0.11, 0.13, 0.012, x, 0.06, 0.452, 0xffe2a0, 0, true);
      archTop(p, x, 0.19, 0.452, 0.055, 0xffe2a0, true);
      p.box(0.06, 0.1, 0.012, x, 0.32, 0.452, 0xffe2a0, 0, true);
      if (i < 6) for (const d of [-0.02, 0.02]) column(p, x + 0.1 + d, 0.47, 0.2, 0.275, 0.012);
    }
    for (const y of [0.25, 0.48]) p.box(1.54, 0.025, 0.54, 0, y, 0.2, cream);
    p.box(1.5, 0.1, 0.48, 0, 0.505, 0.2, st);
    p.box(1.5, 0.03, 0.48, 0, 0.6, 0.2, copper);
    for (const s of [-1, 1]) { p.box(0.08, 0.05, 0.08, s * 0.7, 0.63, 0.4, cream); p.cyl(0.018, 0.028, 0.09, 6, s * 0.7, 0.68, 0.4, C.gold); p.sphere(0.022, s * 0.7, 0.79, 0.4, C.gold); }
    p.cone(0.06, 0.12, 6, 0, 0.63, 0.4, C.gold);
    // les marches, les réverbères, une colonne Morris et ses affiches
    for (let k = 0; k < 3; k++) p.box(1.3 + k * 0.04, 0.04 - k * 0.013, 0.05, 0, 0.02, 0.475 + k * 0.05, cream);
    for (const s of [-1, 1]) lampPost(p, s * 0.62, 0.74);
    p.cyl(0.05, 0.05, 0.22, 10, -0.82, 0.02, 0.8, 0x3f6a4a);
    p.cyl(0.052, 0.052, 0.12, 10, -0.82, 0.07, 0.8, 0xf2e2b8);
    p.sphere(0.052, -0.82, 0.25, 0.8, 0x3f6a4a, 0, 0.6);
    tree(p, 0.82, 0.8, 1.1);
    // Pégases dorés aux angles de la cage de scène
    for (const s of [-1, 1]) {
      p.box(0.06, 0.035, 0.1, s * 0.5, 0.88, -0.6, C.gold); p.add(new THREE.BoxGeometry(0.022, 0.07, 0.03), s * 0.5, 0.92, -0.55, C.gold, 0, false, 0, -0.5);
      for (const w of [-1, 1]) p.add(new THREE.BoxGeometry(0.1, 0.008, 0.05), s * 0.5 + w * 0.05, 0.94, -0.61, C.gold, 0, false, w * 0.6);
    }
    // médaillons dorés et bustes entre les arcades, œils-de-bœuf du tambour de la coupole
    for (let i = 0; i < 6; i++) { const x = -0.5 + i * 0.2; p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12).rotateX(Math.PI / 2), x, 0.43, 0.454, C.gold); p.sphere(0.016, x, 0.43, 0.46, 0xe8dcc0); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 10).rotateX(Math.PI / 2).rotateY(-a), Math.sin(a) * 0.42, 0.52, -0.3 + Math.cos(a) * 0.42, 0xffe2a0, 0, true); }
    // pavillons latéraux et leurs petites coupoles
    for (const s of [-1, 1]) {
      p.box(0.22, 0.46, 0.38, s * 0.87, 0.02, 0.06, st);
      for (const z of [-0.04, 0.12]) { p.box(0.012, 0.12, 0.06, s * 0.981, 0.08, z, 0xffe2a0, 0, true); archTop(p, s * 0.981, 0.2, z, 0.03, cream); }
      p.box(0.24, 0.025, 0.4, s * 0.87, 0.48, 0.06, cream);
      p.add(new THREE.SphereGeometry(0.1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), s * 0.87, 0.5, 0.06, copper); p.sphere(0.018, s * 0.87, 0.62, 0.06, C.gold);
    }
    // bannières rouges des représentations, statues de bronze au pied des marches
    for (const s of [-1, 1]) {
      const f = sway([s * 0.42, 0.47, 0.458], [1, 0, 0], 0.08, 0.5); f.box(0.07, 0.2, 0.006, 0, -0.1, 0, 0xb8322c); f.box(0.07, 0.02, 0.008, 0, -0.19, 0, C.gold); f.box(0.04, 0.04, 0.008, 0, -0.07, 0, C.gold);
      p.box(0.07, 0.08, 0.07, s * 0.7, 0.02, 0.56, cream); figure(p, s * 0.7, 0.56, 0x5a7a6a, s > 0 ? -2.6 : 2.6);
    }
    // le fiacre à la porte, et les spectateurs en tenue de soirée
    p.box(0.1, 0.08, 0.16, -0.42, 0.06, 0.86, 0x2c4a3e); p.box(0.11, 0.015, 0.17, -0.42, 0.14, 0.86, 0x1e1e22);
    for (const [dx, dz, r] of [[-0.06, -0.05, 0.035], [0.06, -0.05, 0.035], [-0.06, 0.06, 0.028], [0.06, 0.06, 0.028]]) p.add(new THREE.TorusGeometry(r, 0.006, 3, 10).rotateY(Math.PI / 2), -0.42 + dx, r + 0.02, 0.86 + dz, 0x2a2a2e);
    p.box(0.05, 0.06, 0.14, -0.42, 0.06, 1.0, 0x3e3434); p.box(0.03, 0.05, 0.04, -0.42, 0.11, 1.07, 0x3e3434);
    for (const [x, z, c, r] of [[-0.2, 0.68, 0x1e1e22, Math.PI], [-0.12, 0.72, 0xb8322c, 2.9], [0.18, 0.7, 0x1e1e22, 3.2], [0.26, 0.74, 0x6a3a8a, 3.0], [0.02, 0.84, 0x2a2a2e, 0.2]] as number[][]) figure(p, x, z, c, r);
  } else {
    sink(0.02);
    // la salle sous sa coque d'aluminium, posée en biais sur un socle blanc
    p.box(1.3, 0.42, 0.9, 0, 0.02, -0.3, C.white);
    p.add(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.55, 1), 0, 0.44, -0.3, 0xc8ccd2);
    for (let k = 0; k < 7; k++) p.add(new THREE.TorusGeometry(0.5, 0.006, 3, 18, Math.PI).rotateY(Math.PI / 2).scale(1, 0.55, 1), -0.6 + k * 0.2, 0.44, -0.3, 0xa8aeb6);
    // foyer vitré, auvent, enseigne lumineuse
    p.box(1.4, 0.3, 0.3, 0, 0.02, 0.32, C.glass, 0, true);
    for (let k = 0; k <= 10; k++) p.box(0.01, 0.3, 0.012, -0.7 + k * 0.14, 0.02, 0.475, C.metal);
    p.box(1.5, 0.025, 0.46, 0, 0.32, 0.36, C.white);
    p.box(0.62, 0.08, 0.02, 0, 0.35, 0.6, 0x2a2a2e);
    for (let k = 0; k < 7; k++) p.box(0.05, 0.04, 0.006, -0.2 + k * 0.066, 0.37, 0.612, 0xcfe8ff, 0, true);
    for (const [x, c] of [[-0.55, 0xd84a3e], [0.55, 0xf2c23a]] as [number, number][]) p.box(0.14, 0.26, 0.008, x, 0.04, 0.481, c);
    // parvis : arbres, bancs, passants qui entrent
    for (const s of [-1, 1]) { tree(p, s * 0.78, 0.78, 1.2); p.box(0.22, 0.03, 0.07, s * 0.5, 0.05, 0.8, C.wood); }
    for (const [x, z, c] of [[-0.2, 0.7, 0xd8786c], [0.05, 0.62, 0x3a6ab8], [0.25, 0.76, 0xf2c23a]] as [number, number, number][]) figure(p, x, z, c, Math.PI);
    // la cage de scène qui dépasse de la coque, son bardage sombre et sa ventilation
    p.box(0.6, 0.86, 0.3, 0, 0.02, -0.72, 0x5d6878);
    for (let k = 0; k < 9; k++) p.box(0.008, 0.86, 0.304, -0.26 + k * 0.065, 0.02, -0.72, 0x4a5462);
    p.box(0.62, 0.02, 0.32, 0, 0.88, -0.72, 0x3c4450); hvac(p, 0.12, 0.9, -0.74, 0.14);
    // spots sous l'auvent, mâts aux drapeaux qui flottent sur le côté, colonne d'affiches
    for (let k = 0; k < 8; k++) p.box(0.03, 0.006, 0.03, -0.63 + k * 0.18, 0.314, 0.54, 0xfff1c9, 0, true);
    [0xd84a3e, 0xf2c23a, 0x3a6ab8].forEach((c, k) => {
      const z = -0.3 + k * 0.2;
      p.cyl(0.006, 0.008, 0.72, 5, -0.86, 0.02, z, C.metal);
      sway([-0.86, 0, z], [0, 1, 0], 0.4, 1.1).box(0.004, 0.1, 0.14, 0, 0.6, 0.07, c);
    });
    p.cyl(0.05, 0.05, 0.24, 10, -0.86, 0.02, 0.48, 0x2e5a3e); p.cyl(0.052, 0.052, 0.13, 10, -0.86, 0.07, 0.48, 0xf2e2b8);
    for (const [a, c] of [[0.4, 0xd84a3e], [1.4, 0x3a6ab8], [-0.6, 0xf2c23a]]) p.box(0.04, 0.09, 0.004, -0.86 + Math.sin(a) * 0.053, 0.09, 0.48 + Math.cos(a) * 0.053, c, a);
    p.sphere(0.052, -0.86, 0.26, 0.48, 0x2e5a3e, 0, 0.6);
    // sculpture de l'anneau rouge sur son socle, le taxi qui dépose, les spectateurs qui arrivent
    p.box(0.1, 0.05, 0.1, -0.6, 0.02, 0.6, 0xd8d6d0); p.add(new THREE.TorusGeometry(0.07, 0.018, 6, 16), -0.6, 0.15, 0.6, 0xd84a3e, 0.6);
    car(p, 0.0, 0.88, Math.PI / 2, 0x2a2a2e, 0.02); p.box(0.04, 0.02, 0.06, 0.0, 0.145, 0.88, 0xfff4b0, 0, true);
    for (const [x, z, c, r] of [[-0.42, 0.66, 0x6a3a8a, 2.8], [-0.34, 0.72, 0x1e1e22, 3.3], [0.42, 0.64, 0xb8322c, -2.8], [0.2, 0.9, 0xf2ead8, 2.2]] as number[][]) figure(p, x, z, c, r);
  }
}

/**
 * Acropole (3 × 3) : le rocher calcaire et ses strates, buissons et éboulis au pied, oliviers ; le mur d'enceinte, l'escalier où
 * monte une procession, les propylées et leurs torches, le temple d'Athéna Niké sur son bastion ; le grand temple de marbre
 * (métopes peintes, frontons sculptés), l'Érechthéion et son portique des caryatides, l'olivier sacré, le grand autel et son
 * feu, Athéna Promachos, statues votives et visiteurs ; projecteurs la nuit à l'époque moderne
 */
function acropolis(p: Parts, age: number) {
  const rock = 0xc9b18a, rockDark = 0xa8906a, marble = 0xf2ead8, top = 0.34, cz = -0.05, bronze = 0x8a6a3a;
  const robes = [0xf2ead8, 0xd8786c, 0x86c4b8, 0xe8c66a, 0xc8a0d8];
  // tablier d'éboulis et de terre sèche au pied du rocher, cailloux, touffes et buissons
  p.cyl(1.4, 1.4, 0.012, 18, 0, 0, 0, 0xbfae8a);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hash2(i, 1, 72) * 0.2, r = 1.33 + hash2(i, 2, 72) * 0.05;
    if (Math.cos(a) > 0.86) continue;
    p.add(new THREE.DodecahedronGeometry(0.025 + hash2(i, 3, 72) * 0.03, 0), Math.sin(a) * r, 0.012, Math.cos(a) * r, dark(rock, 0.8 + hash2(i, 4, 72) * 0.2), a);
  }
  // le rocher : socle plus large, flancs abrupts, une strate plus sombre, blocs éboulés (sauf devant l'escalier)
  p.cyl(1.32, 1.38, 0.1, 13, 0, 0.012, cz, rockDark, false, 0.2);
  p.cyl(1.2, 1.32, top - 0.1, 11, 0, 0.11, cz, rock);
  p.cyl(1.285, 1.29, 0.03, 11, 0, 0.18, cz, dark(rock, 0.84));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.2, r = 1.3 + hash2(i, 3, 71) * 0.06;
    if (Math.cos(a) > 0.8) continue;
    p.add(new THREE.DodecahedronGeometry(0.1 + hash2(i, 5, 71) * 0.07, 0).scale(1, 0.75, 1), Math.sin(a) * r, 0.07, cz + Math.cos(a) * r, dark(rock, 0.86 + hash2(i, 7, 71) * 0.16), a);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.5, r = 1.27;
    if (Math.cos(a) > 0.75) continue;
    p.sphere(0.04 + hash2(i, 9, 73) * 0.03, Math.sin(a) * r, 0.22 + hash2(i, 8, 73) * 0.08, cz + Math.cos(a) * r, i % 2 ? 0x8aa86a : 0x9fb57a, 0, 0.75);
  }
  // oliviers et cyprès au pied du rocher
  for (const [x, z] of [[-1.28, 1.15], [1.3, -1.25], [-1.32, -0.95]]) { p.add(new THREE.CylinderGeometry(0.014, 0.022, 0.12, 5), x, 0.07, z, C.wood, 0, false, 0.25); p.sphere(0.1, x + 0.03, 0.17, z, 0x9fb58a, 0, 0.65); p.sphere(0.06, x - 0.06, 0.15, z + 0.04, 0x8aa87a, 0, 0.7); }
  for (const [x, z] of [[1.3, 1.25], [-1.3, -1.3], [-0.55, 1.33], [0.55, 1.33], [1.36, 0.3]]) cypress(p, x, z, 0.32);
  // le dessus : dallage et ses joints
  p.cyl(1.18, 1.18, 0.012, 11, 0, top + 0.012, cz, 0xe6dccb);
  const py = top + 0.024;
  for (let i = 0; i < 9; i++) { const z = -0.85 + i * 0.2, hw = Math.sqrt(Math.max(0, 1.08 * 1.08 - (z - cz) * (z - cz))); p.box(2 * hw, 0.003, 0.006, 0, py, z, 0xd6cab4); }
  // le mur d'enceinte, ouvert devant les propylées
  const ap = 1.18 * Math.cos(Math.PI / 11), len = 2 * 1.18 * Math.sin(Math.PI / 11);
  for (let i = 0; i < 11; i++) {
    const t = ((i + 0.5) / 11) * Math.PI * 2;
    if (Math.cos(t) > 0.8) continue;
    p.box(len * 1.02, 0.08, 0.05, Math.sin(t) * ap, top + 0.012, cz + Math.cos(t) * ap, 0xd8cdb8, t);
    p.box(len * 1.02, 0.012, 0.06, Math.sin(t) * ap, top + 0.092, cz + Math.cos(t) * ap, 0xe9e2d4, t);
  }
  // l'escalier monumental et sa procession (porteurs d'offrandes, un bœuf blanc)
  for (let k = 0; k < 8; k++) p.box(0.52, (k + 1) * 0.043, 0.06, 0, 0.012, 1.38 - k * 0.05, k % 2 ? 0xe0d6c4 : 0xe9e2d4);
  for (const sd of [-1, 1]) p.box(0.04, 0.36, 0.42, sd * 0.28, 0.012, 1.2, 0xd8cdb8);
  [[-0.1, 1], [0.08, 3], [-0.06, 5], [0.1, 6]].forEach(([x, k], i) => actor(p, x, 0.012 + (k + 1) * 0.043, 1.38 - k * 0.05, Math.PI, robes[i % robes.length]));
  p.box(0.05, 0.05, 0.1, 0.1, 0.012 + 3 * 0.043, 1.27, C.white); p.box(0.03, 0.03, 0.03, 0.1, 0.052 + 3 * 0.043, 1.2, C.white);
  // les propylées : six colonnes, fronton tourné vers la ville, deux ailes couvertes, torches de part et d'autre
  for (let i = 0; i < 6; i++) column(p, -0.3 + i * 0.12, 0.95, 0.26, py, 0.022);
  p.box(0.74, 0.04, 0.16, 0, py + 0.26, 0.92, marble);
  p.gable(0.16, 0.08, 0.76, 0, py + 0.3, 0.92, marble, Math.PI / 2);
  for (const sd of [-1, 1]) {
    p.box(0.26, 0.22, 0.2, sd * 0.52, py, 0.86, 0xe9e2d4);
    roof(p, sd * 0.52, py + 0.22, 0.86, { w: 0.26, d: 0.2, h: 0.06, color: C.terracotta, wall: marble, tiles: true, ov: 0.02 });
    p.cyl(0.008, 0.01, 0.16, 5, sd * 0.36, py, 1.02, C.darkwood); p.cone(0.018, 0.04, 5, sd * 0.36, py + 0.16, 1.02, C.flame, true);
  }
  // le temple d'Athéna Niké, sur son bastion à droite des propylées
  p.box(0.22, 0.03, 0.16, 0.7, py, 0.58, marble);
  for (const x of [0.62, 0.67, 0.73, 0.78]) column(p, x, 0.65, 0.14, py + 0.03, 0.011);
  p.box(0.16, 0.12, 0.1, 0.7, py + 0.03, 0.54, 0xe9e2d4);
  roof(p, 0.7, py + 0.17, 0.57, { w: 0.15, d: 0.22, h: 0.05, color: C.terracotta, wall: marble, tiles: true, ry: Math.PI / 2, ov: 0.02 });
  // le grand temple, long côté vers la ville : métopes peintes en bleu et rouge, frontons sculptés, porte de la cella
  greekTemple(p, -0.2, py, -0.35, 1.2, 0.6, 0.3, 13, 6);
  const fy = py + 0.075 + 0.3 + 0.042;
  for (let i = 0; i < 24; i++) for (const sd of [-1, 1]) p.box(0.022, 0.024, 0.004, -0.73 + i * 0.046, fy, -0.35 + sd * 0.302, i % 2 ? 0x3a5a9a : 0xb8443a);
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) {
    const zz = -0.35 + (i - 2) * 0.08, h = 0.06 - Math.abs(i - 2) * 0.017;
    p.box(0.012, h, 0.03, -0.2 + sd * 0.605, fy + 0.04, zz, i === 2 ? C.gold : 0xf8f4ea);
  }
  p.box(0.012, 0.14, 0.08, 0.205, py + 0.075, -0.35, 0x4a3a2c);
  // l'Érechthéion et son portique des caryatides
  p.box(0.36, 0.22, 0.26, 0.72, py, -0.52, 0xe9e2d4);
  roof(p, 0.72, py + 0.22, -0.52, { w: 0.38, d: 0.28, h: 0.07, color: C.terracotta, wall: marble, tiles: true, ov: 0.02 });
  for (let i = 0; i < 4; i++) column(p, 0.94, -0.62 + i * 0.065, 0.22, py, 0.014);
  p.box(0.2, 0.06, 0.1, 0.66, py, -0.33, marble);
  for (let i = 0; i < 4; i++) {
    const x = 0.6 + i * 0.04;
    p.cyl(0.011, 0.016, 0.11, 6, x, py + 0.06, -0.31, marble);
    p.sphere(0.012, x, py + 0.18, -0.31, marble);
    p.box(0.026, 0.012, 0.026, x, py + 0.19, -0.31, 0xe6dccb);
  }
  p.box(0.22, 0.025, 0.12, 0.66, py + 0.2, -0.33, marble);
  // l'olivier sacré, noueux
  p.add(new THREE.CylinderGeometry(0.014, 0.022, 0.12, 5), 0.62, py + 0.06, -0.14, C.wood, 0, false, 0.2);
  p.sphere(0.085, 0.64, py + 0.16, -0.14, 0x9fb58a, 0, 0.65); p.sphere(0.05, 0.57, py + 0.14, -0.1, 0x8aa87a, 0, 0.7);
  // le grand autel, son feu, deux prêtres
  p.box(0.16, 0.05, 0.1, 0.0, py, 0.22, marble); p.box(0.18, 0.012, 0.12, 0.0, py + 0.05, 0.22, 0xe6dccb);
  p.cone(0.03, 0.06, 5, 0.0, py + 0.062, 0.22, C.flame, true); smoke(0, py + 0.14, 0.22, 1);
  actor(p, -0.12, py, 0.24, Math.PI / 2, C.white, 0xe8b894); actor(p, 0.12, py, 0.2, -Math.PI / 2, 0xe8c66a, 0xe8b894);
  // Athéna Promachos : bouclier, lance à pointe dorée, cimier rouge
  p.box(0.1, 0.1, 0.1, 0.36, py, 0.4, marble);
  p.cyl(0.02, 0.032, 0.2, 6, 0.36, py + 0.1, 0.4, bronze);
  p.sphere(0.022, 0.36, py + 0.32, 0.4, bronze);
  p.cone(0.012, 0.04, 4, 0.36, py + 0.34, 0.4, 0xd84a3e);
  p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 10).rotateX(Math.PI / 2), 0.33, py + 0.2, 0.43, bronze);
  p.cyl(0.004, 0.004, 0.36, 4, 0.4, py + 0.1, 0.4, bronze); p.cone(0.008, 0.03, 4, 0.4, py + 0.46, 0.4, C.gold);
  // statues votives sur leurs socles, le long de la voie sacrée ; des visiteurs
  for (const [x, z, c] of [[-0.35, 0.55, marble], [-0.55, 0.42, bronze], [0.2, 0.6, marble], [-0.75, 0.22, bronze]] as number[][]) {
    p.box(0.06, 0.06, 0.06, x, py, z, 0xe6dccb); p.cyl(0.012, 0.018, 0.08, 6, x, py + 0.06, z, c); p.sphere(0.014, x, py + 0.155, z, c);
  }
  [[-0.1, 0.62, 0.3], [0.05, 0.45, 2.4], [-0.45, 0.15, 1.2], [0.5, 0.1, 3.6], [-0.95, 0.15, 0.8]].forEach(([x, z, r], i) => actor(p, x, py, z, r, robes[(i + 2) % robes.length]));
  if (age >= 4) for (const [x, z] of [[-1.25, 0.6], [1.25, 0.6], [0, -1.38]]) floodlight(p, x, z, 0.12);
}

/** Étal de marché : table sur tréteaux, denrées de couleur dessus, marchand derrière (face à +z) */
function stall(p: Parts, x: number, z: number, goods: number[], seller: number, w = 0.26) {
  p.box(w, 0.012, 0.12, x, 0.08, z, C.wood);
  for (const d of [-1, 1]) p.box(0.012, 0.06, 0.1, x + d * (w / 2 - 0.02), 0.02, z, C.darkwood);
  for (let i = 0; i < 6; i++) p.sphere(0.017, x - w / 2 + 0.03 + (i % 3) * ((w - 0.06) / 2), 0.106, z - 0.025 + Math.floor(i / 3) * 0.05, goods[i % goods.length], 0, 0.85);
  figure(p, x, z - 0.11, seller, 0);
}

/** Auvent de toile rayée, penché vers +z, sur deux perches */
function awning(p: Parts, x: number, z: number, w: number, a: number, b: number, y = 0.26) {
  for (const d of [-1, 1]) p.box(0.01, y, 0.01, x + d * (w / 2 - 0.01), 0.02, z + 0.08, C.darkwood);
  const n = Math.max(3, Math.round(w / 0.06));
  for (let i = 0; i < n; i++) p.add(new THREE.BoxGeometry(w / n, 0.008, 0.2), x - w / 2 + (i + 0.5) * (w / n), y + 0.02, z, i % 2 ? a : b, 0, false, 0, 0.3);
}

/**
 * Forum (2 × 2), qui devient le marché du village : forum romain (basilique, portiques et leurs boutiques, tribune aux
 * harangues et son public, fontaine, colonne triomphale, arc, statue équestre, charrette d'amphores) ; halle du marché à
 * charpente au Moyen Âge (étals sous le grand toit, croix du marché, auvents rayés) ; halles de fer et de verre à l'âge
 * industriel ; marché couvert sous une toiture en vagues à l'époque moderne (étals de cagettes, camion-restaurant, parasols)
 */
function forum(p: Parts, age: number) {
  const trav = 0xe6dccb, marble = 0xf2ead8, bronze = 0x8a6a3a;
  const fruit = [0xf2a03a, 0xd84a3e, 0x8ab84a, 0xf2d24a], folk = [0xb8443a, 0x3a5a9a, 0x6a8a4a, 0xd8a03a, 0x8a5a8a, 0xe8dcc0];
  if (age <= 1) {
    sink(0.02);
    for (let i = 0; i < 30; i++) p.box(0.25, 0.004, 0.17, -0.62 + (i % 6) * 0.25, 0.02, -0.12 + Math.floor(i / 6) * 0.18, dark(trav, 0.9 + hash2(i, 1, 81) * 0.1));
    // la basilique au fond : nef haute, colonnade, fronton au milieu, trois portes
    p.box(1.5, 0.3, 0.42, 0, 0.02, -0.62, 0xe9e2d4);
    p.box(1.5, 0.12, 0.22, 0, 0.32, -0.62, 0xe9e2d4);
    for (let k = 0; k < 8; k++) p.box(0.06, 0.05, 0.01, -0.63 + k * 0.18, 0.36, -0.506, 0x5a4a3a);
    roof(p, 0, 0.44, -0.62, { w: 1.52, d: 0.24, h: 0.08, color: C.terracotta, wall: marble, tiles: true, ov: 0.03 });
    for (const x of [-0.34, 0, 0.34]) p.box(0.08, 0.17, 0.01, x, 0.02, -0.405, 0x5a4a3a);
    for (let i = 0; i < 9; i++) column(p, -0.68 + i * 0.17, -0.38, 0.3, 0.02, 0.022);
    p.box(1.5, 0.04, 0.08, 0, 0.32, -0.38, marble);
    p.gable(0.08, 0.09, 0.42, 0, 0.36, -0.38, marble, Math.PI / 2);
    // portiques de part et d'autre : boutiques sous l'abri, tentures entre les colonnes, marchands derrière leurs comptoirs
    for (const s of [-1, 1]) {
      for (const z of [-0.2, 0.05, 0.3, 0.55]) column(p, s * 0.62, z, 0.32, 0.02, 0.025);
      p.box(0.04, 0.32, 0.92, s * 0.86, 0.02, 0.18, 0xe9e2d4);
      tiledShed(p, s * 0.72, 0.37, 0.18, 0.3, 0.94, s * 0.25, true);
      [-0.08, 0.18, 0.42].forEach((z, j) => {
        p.box(0.1, 0.06, 0.16, s * 0.74, 0.02, z, C.wood);
        for (let i = 0; i < 4; i++) p.sphere(0.017, s * 0.74 + (i % 2 ? 0.025 : -0.025), 0.095, z - 0.04 + Math.floor(i / 2) * 0.06, fruit[(i + j) % fruit.length], 0, 0.85);
        figure(p, s * 0.82, z, folk[(j + (s > 0 ? 3 : 0)) % folk.length], -s * Math.PI / 2);
      });
      for (const z of [0.075, 0.425]) p.box(0.006, 0.07, 0.2, s * 0.62, 0.24, z, s > 0 ? 0xb8443a : 0xd8a03a);
      p.cyl(0.02, 0.014, 0.06, 6, s * 0.76, 0.02, 0.62, 0xc8643a);
    }
    // la tribune aux harangues, ses éperons de navires, l'orateur et son public
    p.box(0.42, 0.1, 0.16, 0, 0.02, 0.12, marble);
    for (const x of [-0.15, -0.05, 0.05, 0.15]) p.add(new THREE.ConeGeometry(0.02, 0.06, 4).rotateX(Math.PI / 2), x, 0.07, 0.22, bronze);
    actor(p, 0, 0.12, 0.1, 0, 0xf2ead8);
    p.box(0.06, 0.012, 0.036, 0, 0.18, 0.1, 0xb8443a);
    for (const [x, z, c] of [[-0.2, 0.32, 0xf2ead8], [-0.07, 0.36, 0xe9e2d4], [0.07, 0.33, 0xf2ead8], [0.2, 0.37, 0xc8a0d8], [-0.13, 0.47, 0xf2ead8], [0.13, 0.48, 0xd8786c]] as number[][]) figure(p, x, z, c, Math.PI);
    // fontaine
    p.cyl(0.09, 0.1, 0.05, 12, 0.22, 0.02, -0.14, marble); p.cyl(0.078, 0.078, 0.005, 12, 0.22, 0.068, -0.14, C.water); p.cyl(0.012, 0.018, 0.1, 6, 0.22, 0.02, -0.14, marble);
    // colonne triomphale à frise en spirale, sa statue
    p.box(0.11, 0.08, 0.11, 0.45, 0.02, 0.72, marble);
    for (let k = 0; k < 8; k++) p.cyl(0.035, 0.035, 0.06, 8, 0.45, 0.1 + k * 0.06, 0.72, k % 2 ? 0xe9e2d4 : 0xdcd2bf, false, k * 0.4);
    p.box(0.09, 0.02, 0.09, 0.45, 0.58, 0.72, marble);
    p.cyl(0.014, 0.02, 0.07, 6, 0.45, 0.6, 0.72, bronze); p.sphere(0.016, 0.45, 0.69, 0.72, bronze);
    // arc de triomphe à l'entrée
    for (const s of [-1, 1]) p.box(0.1, 0.32, 0.12, -0.45 + s * 0.12, 0.02, 0.74, marble);
    p.box(0.36, 0.1, 0.12, -0.45, 0.32, 0.74, marble);
    p.add(new THREE.TorusGeometry(0.07, 0.014, 4, 10, Math.PI), -0.45, 0.25, 0.8, 0xe6dccb);
    for (let k = 0; k < 5; k++) p.box(0.03, 0.025, 0.006, -0.53 + k * 0.04, 0.36, 0.802, 0x5a4a3a);
    p.box(0.16, 0.05, 0.06, -0.45, 0.42, 0.74, bronze);
    // statue équestre
    p.box(0.12, 0.1, 0.2, -0.5, 0.02, 0.2, marble);
    p.box(0.05, 0.06, 0.15, -0.5, 0.18, 0.2, bronze);
    for (const [dx, dz] of [[-0.018, -0.05], [0.018, -0.05], [-0.018, 0.05], [0.018, 0.05]]) p.box(0.014, 0.06, 0.014, -0.5 + dx, 0.12, 0.2 + dz, bronze);
    p.box(0.03, 0.05, 0.035, -0.5, 0.22, 0.27, bronze);
    p.box(0.035, 0.07, 0.03, -0.5, 0.24, 0.19, bronze); p.sphere(0.016, -0.5, 0.33, 0.19, bronze);
    // la charrette d'amphores et son âne
    p.box(0.18, 0.05, 0.1, 0.12, 0.05, 0.8, C.wood);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.015, 8).rotateX(Math.PI / 2), 0.12, 0.04, 0.8 + s * 0.058, C.darkwood);
    for (let i = 0; i < 3; i++) p.add(new THREE.CylinderGeometry(0.018, 0.012, 0.08, 7).rotateZ(Math.PI / 2), 0.12, 0.12, 0.77 + i * 0.03, 0xc8643a);
    p.box(0.1, 0.05, 0.04, 0.3, 0.06, 0.8, 0x8a8278); for (const [dx, dz] of [[-0.03, -0.012], [-0.03, 0.012], [0.03, -0.012], [0.03, 0.012]]) p.box(0.01, 0.05, 0.01, 0.3 + dx, 0.012, 0.8 + dz, 0x6a645c);
    p.box(0.04, 0.04, 0.03, 0.37, 0.1, 0.8, 0x8a8278);
    for (const [x, z, c, r] of [[-0.2, -0.2, 0xf2ead8, 0], [0.32, 0.56, 0xe9e2d4, 2.6], [-0.15, 0.66, 0xd8a03a, 0.6]] as number[][]) figure(p, x, z, c, r);
    for (const s of [-1, 1]) cypress(p, s * 0.84, 0.84, 0.26);
  } else if (age === 2) {
    sink(0.02);
    for (let i = 0; i < 40; i++) p.box(0.14, 0.004, 0.1, -0.78 + (i % 8) * 0.22 + (Math.floor(i / 8) % 2) * 0.11, 0.02, 0.3 + Math.floor(i / 8) * 0.13, dark(0xcdbf9f, 0.88 + hash2(i, 3, 85) * 0.12));
    // la halle : poteaux de chêne sur dés de pierre, entraits et liens, grand toit de tuiles brunes
    const xs = [-0.66, -0.22, 0.22, 0.66], zs = [-0.72, -0.36, 0.0];
    for (const x of xs) for (const z of zs) {
      p.box(0.07, 0.05, 0.07, x, 0.02, z, C.stone);
      p.box(0.045, 0.3, 0.045, x, 0.07, z, C.darkwood);
      for (const d of [-1, 1]) p.add(new THREE.BoxGeometry(0.12, 0.016, 0.016), x + d * 0.05, 0.32, z, C.darkwood, 0, false, d * 0.7);
    }
    for (const z of zs) p.box(1.42, 0.03, 0.035, 0, 0.36, z, C.darkwood);
    for (const x of xs) p.box(0.035, 0.03, 0.78, x, 0.39, -0.36, C.darkwood);
    roof(p, 0, 0.42, -0.36, { w: 1.5, d: 0.92, h: 0.46, color: 0x9a5a44, wall: C.wood, courses: true, ov: 0.08 });
    // sous la halle : étals de blé, fromages, choux, pains, draps ; sacs empilés près des poteaux
    [[-0.44, -0.52, [0xf2e2a8, 0xe8d088]], [0, -0.52, [0xf2d24a, 0xe8c66a]], [0.44, -0.52, [0x8ab84a, 0x6a9a3a]], [-0.44, -0.16, [0xb8804a, 0xc8945a]], [0, -0.16, [0xb8443a, 0x3a5a9a, 0xe8dcc0]], [0.44, -0.16, [0xd84a3e, 0xf2a03a]]]
      .forEach(([x, z, g], i) => stall(p, x as number, z as number, g as number[], folk[i % folk.length]));
    for (const [x, z] of [[-0.6, -0.62], [0.6, -0.3], [-0.26, 0.04]]) for (let k = 0; k < 3; k++) p.sphere(0.03, x + (k % 2) * 0.04, 0.04 + (k > 1 ? 0.04 : 0), z + (k === 1 ? 0.03 : 0), 0xd8c49a, 0, 0.8);
    // fanions tendus devant la halle
    { const f = sway([0, 0.345, 0.02], [1, 0, 0], 0.3, 1.1); for (let i = 0; i < 12; i++) f.add(new THREE.ConeGeometry(0.018, 0.045, 3).rotateX(Math.PI), -0.62 + i * 0.113, -0.025, 0, [0xb8443a, 0xe8c66a, 0x3a5a9a][i % 3]); }
    // la place : croix du marché sur ses marches, étals sous auvents rayés, cageots de poules, tonneaux, chalands
    p.box(0.18, 0.03, 0.18, 0, 0.02, 0.55, C.stone); p.box(0.13, 0.03, 0.13, 0, 0.05, 0.55, C.stone);
    p.cyl(0.015, 0.02, 0.24, 6, 0, 0.08, 0.55, C.stone); p.box(0.08, 0.016, 0.016, 0, 0.28, 0.55, C.stone);
    for (const [x, a, b, g] of [[-0.55, 0xb8443a, 0xf2ead8, [0xd84a3e, 0x8ab84a]], [0.55, 0x3a6ab8, 0xf2d24a, [0x9aa8b8, 0xc8d4dc]]] as [number, number, number, number[]][]) { awning(p, x, 0.5, 0.32, a, b); stall(p, x, 0.52, g, folk[x > 0 ? 1 : 4], 0.28); }
    for (let i = 0; i < 2; i++) { p.box(0.1, 0.06, 0.07, -0.3 + i * 0.11, 0.02, 0.8, C.wood); for (let k = 0; k < 2; k++) p.sphere(0.016, -0.32 + i * 0.11 + k * 0.03, 0.09, 0.8, C.white, 0, 0.8); }
    for (const x of [0.62, 0.72]) { p.cyl(0.035, 0.035, 0.08, 8, x, 0.02, 0.8, C.wood); for (const y of [0.035, 0.085]) p.cyl(0.037, 0.037, 0.008, 8, x, y, 0.8, C.darkwood); }
    for (const [x, z, c, r] of [[-0.22, 0.38, 0xb8443a, 2.8], [0.2, 0.34, 0x6a8a4a, 3.4], [0.14, 0.72, 0x3a5a9a, 0.4], [-0.1, 0.66, 0xd8a03a, 2.0], [0.3, 0.12, 0x8a5a8a, 1.0]] as number[][]) figure(p, x, z, c, r);
  } else if (age === 3) {
    sink(0.02);
    const iron = 0x3f6a5a, zinc = 0x7f8ea8, brick = 0xa8604e;
    // le pavillon : soubassement de brique, colonnes de fonte, verrières, toit de zinc et lanterneau vitré
    for (const [w, d, x, z] of [[1.44, 0.03, 0, 0.18], [1.44, 0.03, 0, -0.78], [0.03, 0.96, -0.72, -0.3], [0.03, 0.96, 0.72, -0.3]]) p.box(w, 0.08, d, x, 0.02, z, brick);
    for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) for (const z of [-0.78, -0.3, 0.18]) p.cyl(0.014, 0.018, 0.42, 6, x, 0.02, z, iron);
    p.box(1.42, 0.32, 0.008, 0, 0.1, 0.18, C.glass, 0, true);
    for (const x of [-0.72, 0.72]) p.box(0.008, 0.32, 0.96, x, 0.1, -0.3, C.glass, 0, true);
    for (let i = 0; i <= 8; i++) p.box(0.01, 0.32, 0.012, -0.72 + i * 0.18, 0.1, 0.186, iron);
    p.box(1.46, 0.025, 1.0, 0, 0.42, -0.3, iron);
    roof(p, 0, 0.445, -0.3, { w: 1.5, d: 1.04, h: 0.16, color: zinc, wall: iron, ov: 0.04, tiles: true });
    p.box(1.3, 0.1, 0.26, 0, 0.56, -0.3, C.glass, 0, true);
    for (let i = 0; i <= 10; i++) p.box(0.008, 0.1, 0.27, -0.65 + i * 0.13, 0.56, -0.3, iron);
    roof(p, 0, 0.66, -0.3, { w: 1.34, d: 0.3, h: 0.07, color: zinc, wall: iron, ov: 0.03 });
    // l'entrée : grande verrière en éventail, horloge, marquise de fonte
    archTop(p, 0, 0.42, 0.19, 0.2, C.glass, true);
    for (let i = 0; i < 5; i++) p.add(new THREE.BoxGeometry(0.006, 0.2, 0.006), 0, 0.42 + 0.1 * Math.cos((i - 2) * 0.6), 0.196, iron, 0, false, (i - 2) * 0.6);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 14).rotateX(Math.PI / 2), 0, 0.5, 0.2, C.white);
    p.box(0.5, 0.012, 0.16, 0, 0.3, 0.27, iron); for (const s of [-1, 1]) p.cyl(0.008, 0.01, 0.28, 5, s * 0.23, 0.02, 0.34, iron);
    // devant : marchandes de fleurs, charrette de légumes et son cheval, réverbères, colonne Morris, chalands
    for (const [x, c] of [[-0.5, [0xf2a6c8, 0xf2d24a, 0xd84a3e]], [0.5, [0xf2ead8, 0xc8a0d8, 0xf2a03a]]] as [number, number[]][]) {
      for (let i = 0; i < 6; i++) { p.cyl(0.018, 0.014, 0.04, 6, x - 0.1 + (i % 3) * 0.1, 0.02, 0.42 + Math.floor(i / 3) * 0.08, C.terracotta); p.sphere(0.024, x - 0.1 + (i % 3) * 0.1, 0.075, 0.42 + Math.floor(i / 3) * 0.08, c[i % 3], 0, 0.8); }
      figure(p, x + 0.18, 0.46, x > 0 ? 0x3a5a9a : 0x8a3a3a, Math.PI);
    }
    p.box(0.2, 0.05, 0.1, -0.15, 0.06, 0.74, C.wood); for (let i = 0; i < 6; i++) p.sphere(0.02, -0.22 + (i % 3) * 0.07, 0.13, 0.72 + Math.floor(i / 3) * 0.04, [0x8ab84a, 0xf2a03a, 0xd84a3e][i % 3], 0, 0.85);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 8).rotateX(Math.PI / 2), -0.15, 0.045, 0.74 + s * 0.058, C.darkwood);
    p.box(0.06, 0.07, 0.16, 0.06, 0.08, 0.74, 0x7a5a48); p.box(0.04, 0.06, 0.05, 0.06, 0.13, 0.84, 0x7a5a48); for (const [dx, dz] of [[-0.02, -0.05], [0.02, -0.05], [-0.02, 0.05], [0.02, 0.05]]) p.box(0.012, 0.07, 0.012, 0.06 + dx, 0.012, 0.74 + dz, 0x5a4234);
    for (const s of [-1, 1]) lampPost(p, s * 0.8, 0.3);
    p.cyl(0.05, 0.05, 0.22, 10, 0.75, 0.02, 0.8, 0x3f6a4a); p.cyl(0.052, 0.052, 0.12, 10, 0.75, 0.07, 0.8, 0xf2e2b8); p.sphere(0.052, 0.75, 0.25, 0.8, 0x3f6a4a, 0, 0.6);
    for (const [x, z, c, r] of [[-0.3, 0.6, 0x3c3c48, 3.0], [0.28, 0.66, 0x8a3a3a, 0.4], [0.36, 0.3, 0x5a5a6a, 2.2]] as number[][]) figure(p, x, z, c, r);
    // crête de fonte et épis dorés au faîte du lanterneau, enseigne des halles au-dessus de la marquise
    for (let i = 0; i <= 12; i++) p.cone(0.008, 0.035, 4, -0.6 + i * 0.1, 0.735, -0.3, iron);
    for (const s of [-1, 1]) { p.cyl(0.006, 0.006, 0.08, 4, s * 0.67, 0.73, -0.3, iron); p.sphere(0.016, s * 0.67, 0.82, -0.3, C.gold); }
    p.box(0.34, 0.06, 0.012, 0, 0.345, 0.2, 0x2c4a3e); for (let k = 0; k < 6; k++) p.box(0.03, 0.03, 0.004, -0.125 + k * 0.05, 0.36, 0.208, C.gold);
    // de chaque côté, sous un auvent rayé : la poissonnière (glace et poissons), le fromager (meules), le boucher (jambons pendus)
    for (const s of [-1, 1]) {
      p.add(new THREE.BoxGeometry(0.16, 0.012, 0.8), s * 0.82, 0.3, -0.3, s > 0 ? 0xd84a3e : 0x3a6ab8, 0, false, s * 0.3);
      for (let k = 0; k < 8; k++) p.box(0.17, 0.014, 0.05, s * 0.82, 0.302, -0.65 + k * 0.1, k % 2 ? C.white : s > 0 ? 0xd84a3e : 0x3a6ab8, 0, false, s * 0.3);
      for (const z of [-0.68, 0.06]) p.cyl(0.006, 0.006, 0.28, 4, s * 0.9, 0.02, z, iron);
      p.box(0.12, 0.08, 0.66, s * 0.82, 0.02, -0.3, C.wood);
    }
    p.box(0.1, 0.012, 0.3, -0.82, 0.1, -0.5, 0xe8f2f6); for (let k = 0; k < 6; k++) p.add(new THREE.IcosahedronGeometry(0.016, 0).scale(2.2, 0.6, 1), -0.82, 0.115, -0.62 + k * 0.05, 0x9aa8b4);
    for (let k = 0; k < 4; k++) p.cyl(0.03, 0.03, 0.03, 10, -0.82, 0.1, -0.12 + k * 0.07, 0xf2d26a);
    for (let k = 0; k < 4; k++) { p.cyl(0.002, 0.002, 0.08, 3, 0.86, 0.2, -0.6 + k * 0.08, 0x3a3030); p.add(new THREE.IcosahedronGeometry(0.022, 0).scale(1, 1.6, 1), 0.86, 0.18, -0.6 + k * 0.08, 0xb8644a); }
    for (let k = 0; k < 3; k++) p.box(0.06, 0.04, 0.05, 0.8, 0.1, -0.15 + k * 0.08, [0xd84a3e, 0xf2a03a, 0x8ab84a][k]);
    figure(p, -0.62, -0.4, 0xe8e2d4, -Math.PI / 2); figure(p, 0.62, -0.3, 0xf4f2ee, Math.PI / 2);
    // fontaine Wallace de fonte verte, chalands au panier, diable chargé de cageots
    p.cyl(0.05, 0.06, 0.04, 8, -0.84, 0.02, 0.78, 0x2e5a44); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; p.cyl(0.008, 0.008, 0.12, 4, -0.84 + Math.cos(a) * 0.03, 0.06, 0.78 + Math.sin(a) * 0.03, 0x2e5a44); }
    p.add(new THREE.SphereGeometry(0.05, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), -0.84, 0.18, 0.78, 0x2e5a44); p.sphere(0.012, -0.84, 0.24, 0.78, 0x2e5a44);
    for (const [x, z, c, r] of [[-0.05, 0.42, 0x6a4a8a, 0.3], [0.12, 0.88, 0xd8a03a, 2.8], [-0.45, 0.9, 0x5a7a4a, 0]] as number[][]) { figure(p, x, z, c, r); p.cyl(0.02, 0.016, 0.03, 6, x + 0.035 * Math.cos(r), 0.08, z - 0.035 * Math.sin(r), 0xc8a060); }
    p.box(0.08, 0.1, 0.06, 0.55, 0.02, 0.42, 0xb48a5e); p.box(0.07, 0.06, 0.05, 0.55, 0.12, 0.42, 0xa07a50); for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 8).rotateZ(Math.PI / 2), 0.55 + s * 0.045, 0.04, 0.46, 0x3c3c40);
  } else {
    sink(0.02);
    const steel = 0x9aa3ad;
    // la toiture en vagues sur ses poteaux d'acier, l'enseigne lumineuse sur sa rive
    for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) for (const z of [-0.78, 0.2]) p.cyl(0.012, 0.014, 0.44, 6, x, 0.02, z, steel);
    for (let i = 0; i < 5; i++) p.add(new THREE.BoxGeometry(0.38, 0.02, 1.16), -0.72 + i * 0.36, 0.48 + (i % 2) * 0.04, -0.29, i % 2 ? 0xd8c8a8 : 0xf2f0ea, 0, false, (i % 2 ? 1 : -1) * 0.11);
    p.box(0.5, 0.06, 0.012, 0, 0.42, 0.29, 0x2a2a2e); for (let k = 0; k < 6; k++) p.box(0.05, 0.035, 0.005, -0.15 + k * 0.06, 0.432, 0.298, 0xcfe8ff, 0, true);
    // sous la toiture : étals de cagettes colorées et leurs marchands
    for (const z of [-0.6, -0.25, 0.05]) for (const x of [-0.45, 0.05, 0.5]) {
      p.box(0.3, 0.06, 0.14, x, 0.02, z, C.white);
      for (let i = 0; i < 4; i++) { p.box(0.065, 0.025, 0.11, x - 0.105 + i * 0.07, 0.08, z, C.wood); p.box(0.055, 0.008, 0.1, x - 0.105 + i * 0.07, 0.105, z, fruit[(i + Math.round(x * 10) + Math.round(z * 10)) & 3]); }
      figure(p, x + 0.18, z - 0.06, folk[(Math.abs(Math.round(x * 10) + Math.round(z * 10)) + 2) % folk.length], Math.PI / 2);
    }
    // devant : camion-restaurant, tables sous parasols, arbres en bac, vélos, chalands et leurs sacs
    p.box(0.3, 0.16, 0.13, -0.55, 0.05, 0.6, 0xf2c23a); p.box(0.1, 0.1, 0.13, -0.36, 0.05, 0.6, 0xf2c23a); p.box(0.07, 0.05, 0.12, -0.33, 0.1, 0.6, 0xcfe2f0);
    p.box(0.18, 0.06, 0.006, -0.57, 0.12, 0.667, 0x2a2a2e, 0, true); p.add(new THREE.BoxGeometry(0.22, 0.008, 0.08), -0.57, 0.2, 0.7, 0xd84a3e, 0, false, 0, 0.4);
    for (const s of [-1, 1]) for (const z of [0.55, 0.65]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 8).rotateX(Math.PI / 2), -0.55 + s * 0.11, 0.035, z, 0x2a2a2e);
    for (const [x, c] of [[0.15, 0xd84a3e], [0.5, 0x3a6ab8]] as [number, number][]) { p.cyl(0.05, 0.05, 0.008, 10, x, 0.08, 0.66, C.white); p.cyl(0.006, 0.006, 0.08, 4, x, 0.02, 0.66, steel); p.cyl(0.005, 0.005, 0.28, 4, x, 0.02, 0.66, steel); p.cone(0.15, 0.07, 8, x, 0.26, 0.66, c); for (const d of [-1, 1]) p.box(0.04, 0.05, 0.04, x + d * 0.08, 0.02, 0.66, C.wood); }
    for (const s of [-1, 1]) { p.box(0.12, 0.08, 0.12, s * 0.8, 0.02, 0.82, 0x8a8a8a); tree(p, s * 0.8, 0.82, 1.0); }
    for (let i = 0; i < 3; i++) { p.add(new THREE.TorusGeometry(0.025, 0.004, 4, 10), 0.75, 0.045, 0.4 + i * 0.07, 0x2a2a2e, Math.PI / 2); p.add(new THREE.TorusGeometry(0.025, 0.004, 4, 10), 0.75, 0.045, 0.45 + i * 0.07, 0x2a2a2e, Math.PI / 2); }
    for (const [x, z, c, r] of [[-0.1, 0.42, 0xd8786c, 2.8], [0.3, 0.38, 0x3a6ab8, 3.4], [0.02, 0.78, 0x6a8a4a, 0.3], [-0.25, 0.3, 0xf2c23a, 1.6]] as number[][]) { figure(p, x, z, c, r); p.box(0.03, 0.04, 0.012, x + 0.035, 0.05, z, 0xe8dcc0, r); }
  }
}

/**
 * Sénat (2 × 2) : curie romaine de brique à fronton, portes de bronze, Victoire dorée et enseignes à l'aigle ; palais communal
 * à arcades et son beffroi à horloge au Moyen Âge ; puis palais à coupole et péristyle, jardin à la française, drapeaux et
 * projecteurs à l'époque moderne
 */
function senate(p: Parts, age: number) {
  const marble = 0xf2ead8;
  if (age <= 1) {
    sink(0.02);
    for (let i = 0; i < 12; i++) p.box(0.26, 0.004, 0.18, -0.38 + (i % 4) * 0.25, 0.02, 0.32 + Math.floor(i / 4) * 0.2, dark(0xe0d6c4, 0.9 + hash2(i, 2, 82) * 0.1));
    // la curie : haute salle de brique, façade enduite, fronton de tuiles, trois grandes baies, portes de bronze
    const brick = 0xc98a6a, stucco = 0xf0e4cc;
    p.box(0.9, 0.62, 0.8, 0, 0.02, -0.25, brick);
    for (const s of [-1, 1]) stones(p, s * 0.45, -0.25, 0.8, 0.02, 0.64, s * Math.PI / 2, dark(brick, 0.9), 0.45, 83 + s);
    p.box(0.92, 0.62, 0.014, 0, 0.02, 0.155, stucco);
    roof(p, 0, 0.64, -0.25, { w: 0.82, d: 0.94, h: 0.22, color: C.terracotta, wall: stucco, tiles: true, ry: Math.PI / 2, ov: 0.04 });
    for (const x of [-0.22, 0, 0.22]) { p.box(0.1, 0.13, 0.012, x, 0.4, 0.164, 0x5a4a3a); archTop(p, x, 0.53, 0.164, 0.05, 0x5a4a3a); }
    p.box(0.94, 0.03, 0.03, 0, 0.36, 0.17, marble);
    for (let k = 0; k < 4; k++) p.box(0.035, 0.03, 0.006, -0.06 + k * 0.04, 0.6, 0.164, 0x8a6a3a);
    p.box(0.2, 0.26, 0.02, 0, 0.1, 0.163, marble); p.box(0.16, 0.24, 0.014, 0, 0.1, 0.172, 0x9a7a44);
    p.box(0.004, 0.24, 0.016, 0, 0.1, 0.18, 0x6a5430);
    for (let k = 0; k < 4; k++) p.box(0.5 + k * 0.04, 0.025 * (4 - k), 0.05, 0, 0.02, 0.19 + k * 0.05, marble);
    // la Victoire dorée au sommet du fronton
    p.cone(0.02, 0.07, 5, 0, 0.86, 0.15, C.gold); p.sphere(0.014, 0, 0.94, 0.15, C.gold);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.05, 0.006, 0.025), s * 0.03, 0.9, 0.14, C.gold, 0, false, s * 0.5);
    // enseignes à l'aigle de part et d'autre des marches
    for (const s of [-1, 1]) {
      const x = s * 0.38;
      p.cyl(0.006, 0.008, 0.5, 5, x, 0.02, 0.42, C.darkwood);
      { const f = sway([x, 0.46, 0.425], [1, 0, 0], 0.18, 0.8); f.box(0.08, 0.1, 0.006, 0, -0.1, 0, 0xb8443a); f.box(0.08, 0.012, 0.008, 0, -0.11, 0, C.gold); }
      p.box(0.02, 0.025, 0.02, x, 0.52, 0.42, C.gold); for (const t of [-1, 1]) p.add(new THREE.BoxGeometry(0.04, 0.006, 0.016), x + t * 0.022, 0.545, 0.42, C.gold, 0, false, t * 0.5);
    }
    for (const s of [-1, 1]) { cypress(p, s * 0.76, -0.72, 0.3); tree(p, s * 0.76, 0.76, 0.9, 0x6f9f6a); }
    for (const [x, z, c, r] of [[-0.3, 0.62, 0xf2ead8, 0.3], [-0.18, 0.7, 0xf2ead8, 2.8], [0.3, 0.58, 0xe9e2d4, 3.6], [0.48, 0.74, 0xf2ead8, 1.4]] as number[][]) figure(p, x, z, c, r);
  } else if (age === 2) {
    sink(0.02);
    // le palais communal : arcades au rez-de-chaussée, baies gothiques à l'étage, créneaux, toit d'ardoise
    const st = C.stone, W = 1.2, zf = -0.3 + 0.275;
    p.box(W, 0.5, 0.55, -0.15, 0.02, -0.3, st);
    stones(p, -0.15, zf + 0.002, W, 0.24, 0.5, 0, st, 0.5, 84);
    for (let i = 0; i < 5; i++) { const x = -0.63 + i * 0.24; p.box(0.14, 0.13, 0.014, x, 0.02, zf + 0.002, 0x4a4038); archTop(p, x, 0.15, zf + 0.002, 0.07, 0x4a4038); }
    p.box(W + 0.02, 0.025, 0.57, -0.15, 0.23, -0.3, 0xece4d4);
    for (let i = 0; i < 5; i++) { const x = -0.63 + i * 0.24; p.box(0.07, 0.12, 0.014, x, 0.29, zf + 0.004, C.win, 0, true); p.add(new THREE.ConeGeometry(0.036, 0.06, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3), x, 0.41, zf + 0.004, C.win, 0, true); }
    roof(p, -0.15, 0.52, -0.33, { w: W - 0.06, d: 0.48, h: 0.24, color: C.slate, wall: st, courses: true });
    for (const x of [-0.5, 0.2]) { p.box(0.07, 0.2, 0.006, x, 0.25, zf + 0.012, 0xb8443a); p.box(0.07, 0.025, 0.008, x, 0.43, zf + 0.012, C.gold); }
    // le beffroi : horloge, chambre des cloches, flèche et girouette dorée
    const bx = 0.6, bz = -0.36;
    p.box(0.26, 1.0, 0.26, bx, 0.02, bz, st);
    stones(p, bx, bz + 0.131, 0.26, 0.02, 1.0, 0, st, 0.5, 85);
    quoins(p, bx + 0.13, bz + 0.13, 0.02, 1.0, 1, 1, 0xece4d4); quoins(p, bx - 0.13, bz + 0.13, 0.02, 1.0, -1, 1, 0xece4d4);
    p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.014, 14).rotateX(Math.PI / 2), bx, 0.72, bz + 0.136, C.white);
    p.box(0.008, 0.05, 0.006, bx, 0.72, bz + 0.145, 0x2a2622); p.box(0.04, 0.008, 0.006, bx + 0.018, 0.72, bz + 0.145, 0x2a2622);
    for (const [dx, dz, w, d] of [[0, 0.131, 0.08, 0.01], [0.131, 0, 0.01, 0.08], [0, -0.131, 0.08, 0.01], [-0.131, 0, 0.01, 0.08]]) p.box(w, 0.12, d, bx + dx, 0.84, bz + dz, 0x2a2622);
    p.box(0.3, 0.03, 0.3, bx, 1.02, bz, 0xece4d4);
    p.pyramid(0.28, 0.42, 0.28, bx, 1.05, bz, C.slate);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.cone(0.02, 0.12, 4, bx + dx * 0.13, 1.05, bz + dz * 0.13, C.slate);
    p.box(0.008, 0.1, 0.008, bx, 1.47, bz, C.gold); p.box(0.06, 0.02, 0.006, bx + 0.02, 1.53, bz, C.gold);
    // la place : un puits, des échevins et le crieur
    p.cyl(0.08, 0.09, 0.08, 10, -0.5, 0.02, 0.5, C.stone); p.cyl(0.07, 0.07, 0.01, 10, -0.5, 0.09, 0.5, C.water);
    for (const s of [-1, 1]) p.box(0.012, 0.18, 0.012, -0.5 + s * 0.07, 0.1, 0.5, C.darkwood);
    p.box(0.16, 0.012, 0.012, -0.5, 0.28, 0.5, C.darkwood);
    for (const [x, z, c, r] of [[0.1, 0.35, 0x3a5a9a, 0.4], [0.22, 0.42, 0xb8443a, 2.8], [0.4, 0.62, 0x6a8a4a, 3.6], [-0.2, 0.7, 0xd8a03a, 0]] as number[][]) figure(p, x, z, c, r);
    tree(p, 0.78, 0.78, 1.1); tree(p, -0.82, -0.2, 1.0);
    // la place pavée et sa rose de pierre, bancs le long des arcades, bacs fleuris, panneau des proclamations, bannière de la commune
    cobbles(p, -0.86, 0.0, 0.86, 0.86, 0xc8bba2, 0.02, 71);
    p.cyl(0.18, 0.18, 0.006, 16, 0.12, 0.022, 0.42, 0x9d927c); p.cyl(0.15, 0.15, 0.008, 16, 0.12, 0.022, 0.42, 0xe6dccb);
    for (let k = 0; k < 8; k++) p.box(0.012, 0.004, 0.26, 0.12, 0.03, 0.42, 0x9d927c, (k * Math.PI) / 8);
    for (const x of [-0.6, -0.12]) { p.box(0.2, 0.025, 0.06, x, 0.05, 0.05, C.stone); for (const d of [-0.07, 0.07]) p.box(0.03, 0.03, 0.05, x + d, 0.02, 0.05, C.darkstone); }
    seated(p, -0.62, 0.075, 0.05, 0, 0x3a5a9a); seated(p, -0.1, 0.075, 0.05, 0, 0x8a3a3a);
    for (const x of [-0.84, 0.36]) { p.box(0.1, 0.06, 0.1, x, 0.02, 0.06, C.stone); p.sphere(0.05, x, 0.1, 0.06, C.darkgreen, 0, 0.8); for (let k = 0; k < 3; k++) p.sphere(0.014, x - 0.025 + k * 0.025, 0.14, 0.08, [0xd84a3e, 0xf2d24a, 0xf2a6c8][k]); }
    for (const d of [-0.08, 0.08]) p.box(0.016, 0.24, 0.016, 0.55 + d, 0.02, 0.2, C.darkwood);
    p.box(0.2, 0.12, 0.012, 0.55, 0.12, 0.2, C.wood); for (const [dx, c] of [[-0.05, 0xf2ead8], [0.04, 0xe8dcc0]] as [number, number][]) p.box(0.06, 0.08, 0.004, 0.55 + dx, 0.135, 0.208, c);
    p.cyl(0.008, 0.01, 0.62, 5, 0.42, 0.02, 0.66, C.darkwood); { const f = sway([0.42, 0, 0.67], [0, 1, 0], 0.4, 1); f.box(0.004, 0.16, 0.12, 0, 0.44, 0.06, 0xb8443a); f.box(0.005, 0.05, 0.05, 0, 0.5, 0.06, C.gold); }
    verge(p, 26, 72, 0.025, (x, z) => z > -0.02 && !(x > 0.6 && z > 0.6));
  } else {
    sink(0.02);
    const st = 0xe8dcc4, cream = 0xf4ead6, dome = age >= 4 ? 0x6fb39a : 0x6f8a9e;
    // jardin à la française : pelouses, massifs fleuris, bassin et son jet
    for (const s of [-1, 1]) {
      p.box(0.62, 0.012, 0.5, s * 0.5, 0.02, 0.56, 0x8fc47e);
      for (const z of [0.4, 0.72]) p.box(0.5, 0.02, 0.05, s * 0.5, 0.03, z, s > 0 ? 0xf2a6b8 : 0xf2d26a);
    }
    p.cyl(0.14, 0.15, 0.05, 14, 0, 0.02, 0.56, C.stone); p.cyl(0.12, 0.12, 0.01, 14, 0, 0.06, 0.56, C.water);
    p.cyl(0.006, 0.012, 0.12, 5, 0, 0.06, 0.56, 0xcfeaf4);
    // le palais : deux étages de hautes fenêtres, corniche et balustrade
    p.box(1.6, 0.42, 0.5, 0, 0.02, -0.4, st);
    for (const y of [0.2, 0.44]) p.box(1.64, 0.025, 0.54, 0, y, -0.4, cream);
    const xs = [-0.7, -0.58, -0.46, 0.46, 0.58, 0.7];
    windows(p, xs, 0.06, -0.142, 0.06, 0.1, cream); windows(p, xs, 0.26, -0.142, 0.06, 0.12, cream);
    for (let k = 0; k < 27; k++) p.box(0.012, 0.04, 0.012, -0.78 + k * 0.06, 0.465, -0.15, cream);
    p.box(1.62, 0.012, 0.02, 0, 0.505, -0.15, cream);
    // le péristyle et son fronton, les marches
    p.box(0.66, 0.06, 0.2, 0, 0.02, -0.07, cream);
    for (let i = 0; i < 6; i++) column(p, -0.25 + i * 0.1, -0.03, 0.38, 0.08, 0.022);
    p.box(0.66, 0.04, 0.2, 0, 0.46, -0.07, cream);
    p.gable(0.2, 0.12, 0.66, 0, 0.5, -0.07, cream, Math.PI / 2);
    for (let k = 0; k < 3; k++) p.box(0.5, 0.06 - k * 0.02, 0.05, 0, 0.02, 0.055 + k * 0.05, cream);
    // la coupole sur son tambour à colonnettes, la lanterne et le drapeau
    p.cyl(0.22, 0.22, 0.16, 16, 0, 0.45, -0.4, cream);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.cyl(0.008, 0.008, 0.14, 5, Math.sin(a) * 0.235, 0.46, -0.4 + Math.cos(a) * 0.235, C.white); }
    p.add(new THREE.SphereGeometry(0.24, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.61, -0.4, dome);
    for (let i = 0; i < 12; i++) p.add(new THREE.TorusGeometry(0.242, 0.006, 3, 8, Math.PI / 2).rotateY((i / 12) * Math.PI * 2), 0, 0.61, -0.4, dark(dome, 0.85));
    p.cyl(0.04, 0.04, 0.08, 8, 0, 0.84, -0.4, cream); p.cone(0.045, 0.06, 8, 0, 0.92, -0.4, dome);
    p.cyl(0.004, 0.004, 0.2, 4, 0, 0.98, -0.4, C.metal); { const f = sway([0, 0, -0.4], [0, 1, 0], 0.45, 1.2); f.box(0.09, 0.055, 0.004, 0.047, 1.12, 0, 0x3a6ab8); f.box(0.045, 0.055, 0.005, 0.07, 1.12, 0, 0xf2c23a); }
    for (const s of [-1, 1]) lampPost(p, s * 0.34, 0.2);
    if (age >= 4) {
      for (const s of [-1, 1]) { p.cyl(0.005, 0.005, 0.42, 4, s * 0.82, 0.02, 0.05, C.metal); sway([s * 0.82, 0, 0.05], [0, 1, 0], 0.4, 1.2).box(0.1, 0.06, 0.004, 0.05, 0.36, 0, s > 0 ? 0x3a6ab8 : 0xf2c23a); }
      for (const [x, z] of [[-0.75, 0.84], [0.75, 0.84]]) floodlight(p, x, z, 0.1);
    }
    for (const [x, z, c, r] of [[-0.12, 0.25, 0x3c3c48, 3.1], [0.16, 0.3, 0x5a5a6a, 2.9], [0.3, 0.86, 0xd8786c, 0.6]] as number[][]) figure(p, x, z, c, r);
    // allée de gravier jusqu'aux marches, buis taillés autour des pelouses, statues sur leurs socles aux angles du jardin
    p.box(0.22, 0.014, 0.82, 0, 0.022, 0.5, 0xe2d6bc);
    for (const s of [-1, 1]) {
      hedge(p, s * 0.5, 0.31, 0.62, 0.035, 0.05, 0.02); hedge(p, s * 0.5, 0.81, 0.62, 0.035, 0.05, 0.02);
      for (const z of [0.36, 0.76]) { p.box(0.06, 0.08, 0.06, s * 0.78, 0.02, z, cream); figure(p, s * 0.78, z, 0xe8e2d4, s > 0 ? -1.6 : 1.6); }
    }
    // grille de fer forgé aux pointes dorées, portail, guérites rayées et leurs gardes
    for (let i = 0; i <= 32; i++) { const x = -0.96 + i * 0.06; if (Math.abs(x) < 0.13) continue; p.box(0.008, 0.16, 0.008, x, 0.02, 0.93, 0x2a2a2e); p.cone(0.008, 0.02, 4, x, 0.18, 0.93, C.gold); }
    for (const y of [0.05, 0.16]) for (const s of [-1, 1]) p.box(0.82, 0.008, 0.01, s * 0.55, y, 0.93, 0x2a2a2e);
    for (const s of [-1, 1]) { p.box(0.04, 0.24, 0.04, s * 0.14, 0.02, 0.93, cream); p.sphere(0.024, s * 0.14, 0.28, 0.93, C.gold); p.box(0.1, 0.006, 0.01, s * 0.06, 0.2, 0.93, C.gold, 0, false, s * 0.2); }
    for (const s of [-1, 1]) {
      p.box(0.08, 0.2, 0.08, s * 0.24, 0.02, 0.98, C.white); for (const y of [0.06, 0.14]) p.box(0.082, 0.025, 0.082, s * 0.24, y, 0.98, s > 0 ? 0xd84a3e : 0x3a6ab8);
      p.pyramid(0.1, 0.06, 0.1, s * 0.24, 0.22, 0.98, 0x3a6ab8); figure(p, s * 0.34, 1.0, 0x2c3e6a, 0);
    }
    // horloge au fronton, statues sur la balustrade du palais
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 14).rotateX(Math.PI / 2), 0, 0.53, 0.035, C.white); p.box(0.004, 0.03, 0.004, 0, 0.54, 0.04, 0x2a2a2e);
    for (const x of [-0.75, -0.5, 0.5, 0.75]) { p.box(0.03, 0.06, 0.03, x, 0.52, -0.16, 0xe8e2d4); p.sphere(0.014, x, 0.6, -0.16, 0xe8e2d4); }
  }
}

/** Les Tours : quatre immeubles modernes, un par quart de la parcelle de 2 × 2, de hauteurs différentes */
/** Rangée de spectateurs assis (buste et tête) de x0 à x1, tournés vers +z (ou vers -z si `back`) ; quelques places vides */
function crowd(p: Parts, x0: number, x1: number, y: number, z: number, seed: number, back = false, gap = 0.065) {
  const shirts = [0xd84a3e, 0x3a6ab8, 0xf2c23a, 0xf4f2ee, 0x4fa860, 0x8a3a8a, 0x3c3c48, 0xe8885a];
  for (let x = x0, i = 0; x <= x1 + 1e-6; x += gap, i++) {
    if (hash2(i, seed, 71) < 0.16) continue;
    const draw = (q: Parts) => {
      q.box(0.034, 0.042, 0.024, x, y, z, shirts[Math.floor(hash2(i, seed, 72) * shirts.length)]);
      q.box(0.022, 0.022, 0.022, x, y + 0.048, z + (back ? 0.003 : -0.003), 0xe8b894);
      q.box(0.024, 0.008, 0.024, x, y + 0.068, z, hash2(i, seed, 73) < 0.5 ? 0x4a3426 : 0x2a2a2e);
    };
    // les supporters se lèvent l'un après l'autre : la ola fait le tour de la tribune
    if (p === mainParts) animPart(draw, [x, y, z], [1, 0, 0], 0.04, 0.3, -x * 3 + seed * 0.7, 0.016); else draw(p);
  }
}

/**
 * Grand stade (3 × 3) : piste d'athlétisme à six couloirs autour d'un terrain rayé et de ses buts, tribune d'honneur couverte
 * et pleine (charpente de bois à l'âge industriel, auvent d'acier ensuite), gradins de virage, tableau d'affichage, sautoir,
 * tapis de saut en hauteur, haies, coureurs dans les couloirs ; esplanade, porte d'entrée et guichets, drapeaux au vent,
 * pylônes d'éclairage à l'époque moderne
 */
function stadiumBig(p: Parts, age: number) {
  sink(0.012);
  const modern = age >= 4, y0 = 0.012, cz = -0.08;
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0x8fc47e);
  p.box(2.92, 0.008, 0.42, 0, y0, 1.25, modern ? 0xc8c4bc : 0xd8c8a8);
  // la piste et ses couloirs, la pelouse rayée et ses lignes
  p.add(new THREE.CylinderGeometry(1, 1, 0.01, 56).scale(1.24, 1, 0.84), 0, 0.017, cz, modern ? 0xc85a44 : 0xb88a6a);
  p.add(new THREE.CylinderGeometry(1, 1, 0.01, 56).scale(0.94, 1, 0.54), 0, 0.02, cz, 0x6fb85e);
  for (let k = 1; k < 7; k++) ellipseRing(p, 0.94 + k * 0.043, 0.54 + k * 0.043, 0.024, 0.003, 0xf4f2ee, 0, cz);
  for (let k = 0; k < 7; k++) p.box(0.2, 0.004, 0.6, -0.6 + k * 0.2, 0.026, cz, k % 2 ? 0x64aa54 : 0x74bc62);
  const L = (w: number, d: number, x: number, z: number) => p.box(w, 0.004, d, x, 0.029, z, C.white);
  L(1.4, 0.01, 0, cz - 0.3); L(1.4, 0.01, 0, cz + 0.3); L(0.01, 0.6, -0.7, cz); L(0.01, 0.6, 0.7, cz); L(0.01, 0.6, 0, cz);
  ellipseRing(p, 0.11, 0.11, 0.03, 0.004, C.white, 0, cz);
  for (const sx of [-1, 1]) {
    L(0.01, 0.34, sx * 0.52, cz); L(0.18, 0.01, sx * 0.61, cz - 0.17); L(0.18, 0.01, sx * 0.61, cz + 0.17);
    for (const dz of [-0.09, 0.09]) p.box(0.014, 0.08, 0.014, sx * 0.71, 0.026, cz + dz, C.white);
    p.box(0.014, 0.014, 0.2, sx * 0.71, 0.1, cz, C.white); p.box(0.05, 0.08, 0.19, sx * 0.735, 0.026, cz, 0xdfe4ea);
  }
  // ligne de départ, coureurs dans les couloirs de la ligne droite, haies sur l'autre
  for (let k = 0; k < 6; k++) p.box(0.012, 0.004, 0.04, 0.5, 0.026, cz + 0.565 + k * 0.043, C.white);
  [[0.2, 0, 0xd84a3e], [0.12, 1, 0x3a6ab8], [0.26, 2, 0xf2c23a], [0.08, 3, 0x4fa860]].forEach(([x, k, c]) => figure(p, x, cz + 0.585 + k * 0.043, c, -Math.PI / 2));
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const x = -0.45 + i * 0.3, z = cz - 0.585 - k * 0.043; p.box(0.004, 0.05, 0.004, x, 0.026, z - 0.015, C.white); p.box(0.004, 0.05, 0.004, x, 0.026, z + 0.015, C.white); p.box(0.006, 0.012, 0.036, x, 0.07, z, k % 2 ? C.white : 0x2a2a2e); }
  // sautoir de sable et sa piste d'élan (dans le virage gauche), tapis du saut en hauteur et sa barre (virage droit)
  p.box(0.06, 0.006, 0.34, -0.86, 0.026, cz + 0.05, modern ? 0xc85a44 : 0xb88a6a); p.box(0.1, 0.01, 0.16, -0.86, 0.026, cz - 0.2, 0xe8d8a8);
  p.box(0.16, 0.05, 0.1, 0.86, 0.026, cz, 0x3a6ab8); for (const s of [-1, 1]) p.box(0.008, 0.11, 0.008, 0.86 + s * 0.09, 0.026, cz + 0.06, C.white); p.box(0.18, 0.006, 0.006, 0.86, 0.13, cz + 0.06, 0xf2c23a);
  figure(p, 0.86, cz + 0.2, 0xd84a3e, Math.PI); figure(p, -0.86, cz + 0.22, 0x3a6ab8, Math.PI);
  // la tribune d'honneur, pleine, et son toit
  const sx0 = -1.05, sx1 = 1.05, sz = -1.0, rows = 6;
  for (let r = 0; r < rows; r++) {
    p.box(sx1 - sx0, 0.05 * (r + 1), 0.08, 0, y0, sz - r * 0.08, modern ? 0xd8d6d0 : 0x9a7452);
    p.box(sx1 - sx0 - 0.02, 0.012, 0.05, 0, y0 + 0.05 * (r + 1), sz - r * 0.08 + 0.01, modern ? (r % 2 ? 0x3a6ab8 : 0xf2c23a) : (r % 2 ? C.wood : C.darkwood));
    crowd(p, sx0 + 0.05, sx1 - 0.05, y0 + 0.05 * (r + 1) + 0.012, sz - r * 0.08 + 0.01, 300 + r);
  }
  p.box(sx1 - sx0 + 0.04, 0.42, 0.04, 0, y0, sz - rows * 0.08 - 0.01, modern ? 0xd8d6d0 : 0x8a6448);
  for (const s of [-1, 1]) p.box(0.04, 0.42, rows * 0.08 + 0.06, s * (sx1 + 0.02), y0, sz - (rows - 1) * 0.04, modern ? 0xd8d6d0 : 0x8a6448);
  if (modern) {
    // auvent d'acier en porte-à-faux, sa ferme triangulée, ses projecteurs
    p.add(new THREE.BoxGeometry(2.2, 0.025, 0.66), 0, 0.5, sz - 0.2, C.white, 0, false, 0, 0.12);
    for (let i = 0; i <= 6; i++) p.add(new THREE.BoxGeometry(0.014, 0.014, 0.66), -1.05 + i * 0.35, 0.53, sz - 0.2, 0x9aa3ad, 0, false, 0, 0.12);
    for (let i = 0; i < 8; i++) p.box(0.06, 0.02, 0.02, -0.9 + i * 0.26, 0.47, sz + 0.08, 0xfff4d8, 0, true);
  } else {
    // charpente de bois sur poteaux, toit à un pan, lambrequin peint
    for (let i = 0; i <= 6; i++) p.box(0.022, 0.5, 0.022, -1.02 + i * 0.34, y0, sz + 0.04, C.darkwood);
    p.add(new THREE.BoxGeometry(2.16, 0.025, 0.66), 0, 0.53, sz - 0.22, 0x8a5a44, 0, false, 0, -0.1);
    for (let i = 0; i < 27; i++) p.box(0.06, 0.04, 0.008, -1.04 + i * 0.08, 0.48, sz + 0.11, i % 2 ? C.white : 0x3a6ab8);
    for (const s of [-1, 0, 1]) { p.cyl(0.005, 0.005, 0.3, 4, s * 0.7, 0.55, sz - 0.2, C.metal); sway([s * 0.7, 0.55, sz - 0.2], [0, 1, 0], 0.4, 1.1).box(0.12, 0.07, 0.004, 0.06, 0.24, 0, [0x3a6ab8, 0xf4f2ee, 0xd84a3e][s + 1]); }
  }
  // gradins de virage, en face, plus bas
  for (let r = 0; r < 3; r++) {
    p.box(1.4, 0.04 * (r + 1), 0.07, 0, y0, 0.86 + r * 0.07, modern ? 0xd8d6d0 : 0x9a7452);
    crowd(p, -0.62, 0.62, y0 + 0.04 * (r + 1), 0.86 + r * 0.07, 330 + r, true, 0.08);
  }
  // tableau d'affichage, au bout du virage gauche
  for (const dz of [-0.2, 0.2]) p.box(0.03, 0.42, 0.03, -1.36, y0, cz + dz, modern ? 0x9aa3ad : C.darkwood);
  p.box(0.04, 0.22, 0.5, -1.36, 0.32, cz, modern ? 0x2a2a2e : 0x2c3a30);
  if (modern) p.box(0.006, 0.18, 0.44, -1.338, 0.34, cz, 0xffd27a, 0, true);
  else for (let k = 0; k < 4; k++) p.box(0.006, 0.06, 0.06, -1.338, 0.4, cz - 0.15 + k * 0.1, C.white);
  // l'entrée : porte et son fronton, guichets, réverbères ou pylônes
  for (const s of [-1, 1]) { p.box(0.1, 0.36, 0.1, s * 0.32, y0, 1.32, modern ? 0xd8d6d0 : 0xa85e50); p.box(0.3, 0.16, 0.14, s * 0.62, y0, 1.3, modern ? 0xe8eaee : 0xd8c8a8); p.box(0.1, 0.06, 0.01, s * 0.62, 0.08, 1.371, C.glass, 0, true); p.box(0.32, 0.02, 0.16, s * 0.62, 0.17, 1.3, modern ? 0x3a6ab8 : 0x8a5a44); }
  p.box(0.74, 0.08, 0.12, 0, 0.37, 1.32, modern ? 0x3a6ab8 : 0xe8dcc4);
  for (let k = 0; k < 6; k++) p.box(0.05, 0.035, 0.006, -0.15 + k * 0.06, 0.39, 1.382, modern ? 0xffe8b0 : C.gold, 0, modern);
  for (const [x, z, c, r] of [[-0.12, 1.18, 0xd84a3e, 0], [0.1, 1.12, 0x3a6ab8, 3], [0.5, 1.15, 0x4fa860, 2], [-0.6, 1.12, 0xf2c23a, 0.4]] as number[][]) figure(p, x, z, c, r);
  if (modern) for (const [x, z] of [[-1.38, -1.38], [1.38, -1.38], [-1.38, 1.05], [1.38, 1.05]]) floodlight(p, x, z, 1.1);
  else for (const s of [-1, 1]) lampPost(p, s * 1.1, 1.3, 0.32);
}

/** Voie des montagnes russes de la grande fête foraine (repère du bâtiment) : une boucle de collines, plus hautes à l'époque moderne ; le train la parcourt (`Fairground`) */
export function coasterPath(modern: boolean): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2;
    const y = 0.12 + (modern ? 0.66 : 0.46) * Math.max(0, Math.sin(t + 0.3)) ** 2 + 0.14 * Math.max(0, Math.sin(t * 3 + 1.2));
    pts.push(new THREE.Vector3(0.88 + Math.cos(t) * 0.5, y, -0.45 + Math.sin(t) * 0.82));
  }
  return pts;
}
/** Tour de chute de l'époque moderne (repère du bâtiment) : son pied, sa hauteur ; la nacelle y monte et tombe (`Fairground`) */
export const DROP_TOWER = { x: 0, z: -0.95, h: 1.55 };

/** Ampoule de guirlande, qui s'allume la nuit */
const bulb = (q: Parts, x: number, y: number, z: number, c: number, s = 0.018) => q.box(s, s, s, x, y, z, c, 0, true);
const BULBS = [0xffe2a0, 0xff9a6a, 0x9ae8ff, 0xfff4d0, 0xff8ad8];

/**
 * Grande fête foraine (3 × 3) : grande roue qui tourne, ses nacelles et ses ampoules ; carrousel aux chevaux de bois sous son
 * chapiteau rayé bordé de lumières ; chaises volantes (tour de chute à l'époque moderne) ; bateau pirate qui se balance ;
 * autos tamponneuses qui tournent sous leur auvent illuminé ; montagnes russes de bois sur leurs tréteaux (d'acier ensuite)
 * et leur gare, où le train file ; baraques de tir, de confiserie, de frites et de chamboule-tout ; porte illuminée et
 * guichet ; guirlandes d'ampoules le long de l'allée ; marchand de ballons, barbe à papa, et la foule qui s'amuse
 */
function funfairBig(p: Parts, age: number) {
  sink(0.012);
  const modern = age >= 4, y0 = 0.012;
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0x8fc47e);
  const alley = modern ? 0xb8b4ac : 0xd8c49a;
  p.box(0.42, 0.006, 2.9, 0, y0, 0.05, alley); p.box(2.9, 0.006, 0.3, 0, y0, -0.2, alley);
  for (let k = 0; k < 40; k++) p.box(0.03, 0.004, 0.02, -1.4 + hash2(k, 3, 81) * 2.8, y0 + 0.006, -1.4 + hash2(k, 4, 81) * 2.8, [0xd84a3e, 0xf2c23a, 0x3c7fd8, 0xf4f2ee][k % 4]);
  // grande roue : pieds en A, cabine du forain ; la roue, ses rayons, ses nacelles et ses ampoules tournent
  const wx = -0.85, wz = -0.95, wy = 0.76, wr = 0.56, frame = modern ? 0xf4f2ee : 0xd8d0c0;
  for (const dz of [-0.1, 0.1]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.82, 0.03).translate(0, 0.41, 0), wx + s * 0.32, y0, wz + dz, frame, 0, false, s * 0.4);
  p.box(0.3, 0.14, 0.16, wx, y0, wz + 0.24, modern ? 0x3a6ab8 : 0x8a3a3a); p.box(0.32, 0.02, 0.18, wx, 0.15, wz + 0.24, C.gold);
  const W = turning([wx, wy, wz], [0, 0, 1], 0.035);
  for (const dz of [-0.07, 0.07]) { W.add(new THREE.TorusGeometry(wr, 0.012, 4, 36), 0, 0, dz, frame); W.add(new THREE.TorusGeometry(wr * 0.35, 0.01, 4, 16), 0, 0, dz, frame); }
  W.add(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10).rotateX(Math.PI / 2), 0, 0, 0, 0x9aa3ad);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, gx = -Math.sin(a) * wr, gy = Math.cos(a) * wr;
    for (const dz of [-0.07, 0.07]) W.add(new THREE.BoxGeometry(0.01, wr, 0.01).translate(0, wr / 2, 0), 0, 0, dz, 0xd8d6d0, 0, false, a);
    W.box(0.08, 0.065, 0.11, gx, gy - 0.075, 0, [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xb45ad8, 0xf28a3c][k % 6]);
    W.box(0.09, 0.014, 0.12, gx, gy - 0.012, 0, C.white);
    W.box(0.022, 0.022, 0.022, gx, gy - 0.035, 0, 0xe8b894);
  }
  for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; for (const dz of [-0.075, 0.075]) bulb(W, -Math.sin(a) * wr, Math.cos(a) * wr, dz, BULBS[k % BULBS.length], 0.016); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + 0.26; bulb(W, -Math.sin(a) * wr * 0.6, Math.cos(a) * wr * 0.6, 0.075, BULBS[(k + 2) % BULBS.length], 0.014); }
  // carrousel : socle et marches, plateau tournant, chevaux de bois sur leurs barres, colonne à miroirs, chapiteau rayé
  // bordé d'ampoules, fanion au sommet
  const cx = 0.78, cz = 0.9;
  p.cyl(0.46, 0.48, 0.03, 24, cx, y0, cz, 0xb8a888);
  const R = turning([cx, y0 + 0.03, cz], [0, 1, 0], 0.11);
  R.cyl(0.43, 0.43, 0.03, 24, 0, 0, 0, 0xe8c66a);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, rr = k % 2 ? 0.33 : 0.24, x = Math.cos(a) * rr, z = Math.sin(a) * rr, col = [C.white, 0x8a5a3a, 0xd84a3e, 0x3c7fd8, 0x2a2a2e, 0xf2c23a][k % 6];
    R.cyl(0.005, 0.005, 0.38, 4, x, 0.03, z, C.gold);
    const hy = 0.1 + (k % 3) * 0.03;
    R.box(0.032, 0.045, 0.1, x, hy, z, col, -a); R.box(0.022, 0.045, 0.03, x + Math.cos(a + Math.PI / 2) * 0.05, hy + 0.035, z + Math.sin(a + Math.PI / 2) * 0.05, col, -a);
    for (const d of [-0.03, 0.03]) R.box(0.008, 0.05, 0.008, x + Math.cos(a + Math.PI / 2) * d, hy - 0.045, z + Math.sin(a + Math.PI / 2) * d, dark(col, 0.8), -a);
    if (k % 3 === 0) { R.box(0.03, 0.035, 0.025, x, hy + 0.045, z, [0x3a6ab8, 0xd84a3e, 0x4fa860][k % 3], -a); R.box(0.02, 0.02, 0.02, x, hy + 0.08, z, 0xe8b894, -a); }
  }
  R.cyl(0.07, 0.08, 0.4, 10, 0, 0.03, 0, 0xd84a3e); for (let k = 0; k < 10; k++) R.box(0.03, 0.06, 0.004, Math.cos((k / 10) * Math.PI * 2) * 0.072, 0.18, Math.sin((k / 10) * Math.PI * 2) * 0.072, 0xcfe2f0, -(k / 10) * Math.PI * 2 + Math.PI / 2);
  for (let k = 0; k < 16; k++) R.add(new THREE.ConeGeometry(0.47, 0.2, 16, 1, true, (k / 16) * Math.PI * 2, Math.PI / 8), 0, 0.53, 0, k % 2 ? 0xd84a3e : C.white);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; R.box(0.12, 0.05, 0.01, Math.cos(a) * 0.46, 0.4, Math.sin(a) * 0.46, k % 2 ? C.gold : 0xd84a3e, -a + Math.PI / 2); bulb(R, Math.cos(a) * 0.47, 0.44, Math.sin(a) * 0.47, BULBS[k % BULBS.length]); }
  R.cyl(0.006, 0.006, 0.14, 4, 0, 0.63, 0, C.gold); R.box(0.08, 0.05, 0.004, 0.04, 0.73, 0, 0xf2c23a);
  if (!modern) {
    // chaises volantes : mât fixe, couronne qui tourne, chaises lancées vers l'extérieur
    const kx = 0.0, kz = -0.95;
    p.cyl(0.03, 0.045, 0.62, 8, kx, y0, kz, C.white); p.cyl(0.13, 0.14, 0.04, 12, kx, y0, kz, 0xb8a888);
    const S = turning([kx, 0, kz], [0, 1, 0], 0.2);
    S.cyl(0.2, 0.2, 0.04, 14, 0, 0.62, 0, 0xd84a3e); S.cone(0.23, 0.13, 14, 0, 0.66, 0, 0xf2c23a);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; bulb(S, Math.cos(a) * 0.205, 0.64, Math.sin(a) * 0.205, BULBS[k % BULBS.length], 0.015); }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      S.add(new THREE.BoxGeometry(0.004, 0.27, 0.004), ca * 0.26, 0.49, sa * 0.26, 0x9aa3ad, 0, false, ca * 0.55, -sa * 0.55);
      S.box(0.04, 0.02, 0.04, ca * 0.33, 0.34, sa * 0.33, [0xf2c23a, 0x3c7fd8, 0x4fa860, 0xd84a3e][k % 4], -a);
      S.box(0.024, 0.035, 0.02, ca * 0.33, 0.36, sa * 0.33, [0x3a6ab8, 0x8a3a3a, 0xf4f2ee][k % 3], -a); S.box(0.018, 0.018, 0.018, ca * 0.33, 0.4, sa * 0.33, 0xe8b894, -a);
    }
  } else {
    // tour de chute : pylône, anneau de sièges qui monte et tombe (animé à part), feux au sommet
    const { x: tx, z: tz, h } = DROP_TOWER;
    p.box(0.08, h, 0.08, tx, y0, tz, 0xd8d6d0); for (let k = 0; k < 10; k++) p.box(0.09, 0.008, 0.09, tx, 0.1 + k * 0.15, tz, 0x9aa3ad);
    p.cyl(0.12, 0.14, 0.05, 10, tx, y0, tz, 0x3c3c40); p.cyl(0.07, 0.07, 0.06, 8, tx, h, tz, 0xf2c23a);
    for (let k = 0; k < 8; k++) bulb(p, tx + Math.cos(k) * 0.06, h + 0.02 + (k % 2) * 0.03, tz + Math.sin(k) * 0.06, k % 2 ? 0xff4a3a : 0xffe2a0, 0.02);
    for (let k = 0; k < 12; k++) bulb(p, tx + 0.042, 0.15 + k * 0.12, tz + 0.042, BULBS[k % BULBS.length], 0.014);
  }
  // bateau pirate qui se balance entre ses deux portiques en A
  const bx = -0.9, bz = 0.2, by = 0.62;
  for (const dz of [-0.13, 0.13]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.68, 0.03).translate(0, 0.34, 0), bx + s * 0.28, y0, bz + dz, 0x5a4a3a, 0, false, s * 0.42);
  p.box(0.04, 0.04, 0.3, bx, by - 0.02, bz, 0x5a4a3a);
  const B = swing([bx, by, bz], [0, 0, 1], 0.7, 0.2);
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.02, 0.44, 0.02).translate(0, -0.22, 0), 0, 0, 0, 0x8a8f96, 0, false, s * 0.55);
  B.box(0.66, 0.1, 0.18, 0, -0.48, 0, 0x8a5a3a); B.box(0.68, 0.025, 0.2, 0, -0.39, 0, 0xd8c09a);
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.12, 0.16, 0.18), s * 0.36, -0.42, 0, 0x8a5a3a, 0, false, s * 0.6);
  B.cyl(0.008, 0.008, 0.26, 4, 0, -0.39, 0, 0x5a4a3a); B.box(0.16, 0.12, 0.004, 0.0, -0.2, 0, 0x2a2a2e); B.box(0.04, 0.04, 0.006, 0, -0.18, 0, C.white);
  for (let k = 0; k < 7; k++) { B.box(0.026, 0.03, 0.02, -0.27 + k * 0.09, -0.37, -0.04, [0xd84a3e, 0x3a6ab8, 0xf2c23a, 0x4fa860][k % 4]); B.box(0.02, 0.02, 0.02, -0.27 + k * 0.09, -0.33, -0.04, 0xe8b894); }
  for (let k = 0; k < 8; k++) bulb(B, -0.3 + k * 0.086, -0.43, 0.095, BULBS[k % BULBS.length], 0.014);
  // autos tamponneuses : piste, bordure rayée, auvent sur ses poteaux et son plafond d'ampoules ; les autos tournent
  const rx = -0.62, rz = 0.95;
  p.box(0.74, 0.02, 0.52, rx, y0, rz, 0x3c3c44);
  for (let k = 0; k < 20; k++) { const t = k / 20, along = t < 0.5; p.box(along ? 0.074 : 0.03, 0.04, along ? 0.03 : 0.052, along ? rx - 0.37 + (k % 10) * 0.074 + 0.037 : rx + (k < 15 ? -0.37 : 0.37), y0 + 0.02, along ? rz + (k < 5 ? -0.26 : 0.26) : rz - 0.26 + (k % 5) * 0.104 + 0.052, k % 2 ? 0xf2c23a : 0x2a2a2e); }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.02, 0.32, 0.02, rx + dx * 0.36, y0, rz + dz * 0.25, 0x9aa3ad);
  p.box(0.8, 0.03, 0.58, rx, 0.33, rz, modern ? 0x3a6ab8 : 0xd84a3e); p.box(0.82, 0.05, 0.6, rx, 0.36, rz, C.white);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) bulb(p, rx - 0.3 + i * 0.12, 0.325, rz - 0.19 + j * 0.125, BULBS[(i + j) % BULBS.length], 0.014);
  for (let k = 0; k < 9; k++) p.box(0.06, 0.03, 0.005, rx - 0.24 + k * 0.06, 0.4, rz + 0.302, BULBS[k % BULBS.length], 0, true);
  const T = turning([rx, y0 + 0.02, rz], [0, 1, 0], 0.13);
  for (const [r, a, col] of [[0.1, 0, 0xd84a3e], [0.2, 1.3, 0x3c7fd8], [0.15, 2.6, 0xf2c23a], [0.21, 3.8, 0x4fa860], [0.08, 5.0, 0xb45ad8]] as number[][]) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85;
    T.box(0.07, 0.035, 0.09, x, 0.005, z, col, -a); T.add(new THREE.TorusGeometry(0.048, 0.008, 3, 10).rotateX(Math.PI / 2), x, 0.012, z, 0x2a2a2e);
    T.cyl(0.003, 0.003, 0.26, 3, x, 0.04, z - 0.03, 0x9aa3ad); T.box(0.026, 0.03, 0.022, x, 0.04, z, 0x3a3a48, -a); T.box(0.02, 0.02, 0.02, x, 0.075, z, 0xe8b894, -a);
  }
  // montagnes russes : la voie sur ses tréteaux de bois (sur ses piliers d'acier ensuite), sa gare à la descente
  const pts = coasterPath(modern), rail = modern ? 0xd84a3e : 0x6a4a34, prop = modern ? 0x3c6ab8 : 0x9a7452;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], d = b.clone().sub(a), len = d.length(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.012, len + 0.004).applyQuaternion(q), (a.x + b.x) / 2 + side.x * s * 0.028, (a.y + b.y) / 2 + 0.01, (a.z + b.z) / 2 + side.z * s * 0.028, rail);
    p.add(new THREE.BoxGeometry(0.075, 0.008, 0.016).applyQuaternion(q), a.x, a.y, a.z, modern ? 0x5d6878 : 0x5a4232);
    if (k % 2 === 0) {
      p.box(0.014, a.y, 0.014, a.x, y0, a.z, prop);
      if (!modern && a.y > 0.2) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.008, a.y * 0.9, 0.008), a.x + s * 0.04, y0, a.z, prop, 0, false, s * 0.25);
      if (k % 4 === 0) bulb(p, a.x, a.y + 0.03, a.z, BULBS[(k / 4) % BULBS.length], 0.014);
    }
  }
  let low = 0;
  for (let k = 1; k < pts.length; k++) if (pts[k].y < pts[low].y) low = k;
  { const a = pts[low], b = pts[(low + 1) % pts.length], ry = Math.atan2(b.x - a.x, b.z - a.z);
    p.box(0.18, a.y - 0.01, 0.34, a.x - Math.cos(ry) * 0.11, y0, a.z + Math.sin(ry) * 0.11, modern ? 0xe8eaee : 0xd8c8a8, ry);
    p.box(0.2, 0.02, 0.36, a.x - Math.cos(ry) * 0.11, 0.36, a.z + Math.sin(ry) * 0.11, rail, ry);
    for (const s of [-1, 1]) p.box(0.016, 0.36 - a.y, 0.016, a.x - Math.cos(ry) * 0.18, a.y, a.z + Math.sin(ry) * 0.18 + s * 0.15, 0x9aa3ad, ry); }
  // baraques le long de l'allée : tir, confiserie, frites, chamboule-tout
  const stall = (x: number, z: number, c: number, kind: number) => {
    p.box(0.36, 0.2, 0.2, x, y0, z, modern ? 0xf4f2ee : C.cream);
    for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(0.06, 0.01, 0.14), x - 0.15 + k * 0.06, 0.22, z + 0.12, k % 2 ? C.white : c, 0, false, 0, 0.35);
    p.box(0.36, 0.05, 0.03, x, y0, z + 0.1, 0x8a6448);
    p.box(0.3, 0.05, 0.01, x, 0.26, z + 0.06, 0xffe2a0, 0, true);
    for (let k = 0; k < 6; k++) bulb(p, x - 0.15 + k * 0.06, 0.205, z + 0.19, BULBS[(k + kind) % BULBS.length], 0.012);
    if (kind === 0) for (let k = 0; k < 4; k++) { p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.006, 10).rotateX(Math.PI / 2), x - 0.12 + k * 0.08, 0.15, z + 0.101, C.white); p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 8).rotateX(Math.PI / 2), x - 0.12 + k * 0.08, 0.15, z + 0.103, 0xd84a3e); }
    else if (kind === 1) for (let k = 0; k < 6; k++) p.sphere(0.022, x - 0.12 + (k % 3) * 0.12, 0.08 + Math.floor(k / 3) * 0.05, z + 0.11, [0xf2a6c8, 0xf8e05a, 0x9ae8ff][k % 3]);
    else if (kind === 2) for (let k = 0; k < 5; k++) p.add(new THREE.ConeGeometry(0.014, 0.04, 6).rotateX(Math.PI), x - 0.1 + k * 0.05, 0.09, z + 0.11, 0xf2d24a);
    else for (const [dx, dy] of [[-0.03, 0], [0, 0], [0.03, 0], [-0.015, 0.03], [0.015, 0.03], [0, 0.06]]) p.cyl(0.012, 0.012, 0.028, 6, x + dx, 0.07 + dy, z + 0.11, [0xd84a3e, 0xc4cad2, 0x3c7fd8][Math.round(dy * 33) % 3]);
    figure(p, x + 0.1, z + 0.3, [0x3a5a9a, 0x8a3a3a, 0x4a6a3a, 0x5a5a6a][kind], Math.PI, false, 0x4a3426, 'cheer');
  };
  stall(-0.42, -0.48, 0xd84a3e, 0); stall(0.18, -0.48, 0xf2a6c8, 1); stall(0.3, 0.3, 0xf2c23a, 2); stall(-0.32, 0.5, 0x4fa860, 3);
  // porte d'entrée illuminée, enseigne, guichet
  for (const s of [-1, 1]) { p.box(0.09, 0.56, 0.09, s * 0.3, y0, 1.38, modern ? 0xb45ad8 : 0x8a3a3a); p.sphere(0.05, s * 0.3, 0.6, 1.38, C.gold); }
  p.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0), 0, 0.5, 1.38, modern ? 0xf2c23a : 0xe8c66a);
  for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); bulb(p, -Math.cos(a) * 0.31, 0.5 + Math.sin(a) * 0.31, 1.42, BULBS[k % BULBS.length], 0.022); }
  for (let k = 0; k < 7; k++) p.box(0.05, 0.05, 0.006, -0.18 + k * 0.06, 0.6, 1.415, modern ? 0xb45ad8 : 0xd84a3e, 0, true);
  p.box(0.18, 0.18, 0.14, -0.45, y0, 1.32, modern ? 0xf4f2ee : 0xd8c8a8); p.box(0.2, 0.03, 0.16, -0.45, 0.19, 1.32, 0xd84a3e); p.box(0.1, 0.06, 0.006, -0.45, 0.1, 1.393, 0xffe2a0, 0, true);
  // guirlandes d'ampoules le long de l'allée, sur leurs mâts
  for (const s of [-1, 1]) {
    for (const z of [-0.05, 0.6, 1.25]) p.cyl(0.008, 0.01, 0.48, 4, s * 0.22, y0, z, C.darkwood);
    for (let k = 0; k <= 26; k++) { const t = k / 26, seg = Math.floor(t * 2 - 1e-6), u = t * 2 - seg; bulb(p, s * 0.22, 0.47 - Math.sin(u * Math.PI) * 0.07, -0.05 + t * 1.3, BULBS[k % BULBS.length], 0.016); }
  }
  for (let k = 0; k <= 10; k++) { const t = k / 10; bulb(p, -0.22 + t * 0.44, 0.47 - Math.sin(t * Math.PI) * 0.05, 0.6, BULBS[(k + 1) % BULBS.length], 0.016); }
  // marchand de ballons (les ballons se balancent au vent), barbe à papa, et la foule
  figure(p, 0.12, 1.05, 0x6a4a8a, Math.PI);
  { const f = sway([0.15, 0.16, 1.05], [1, 0, 0.3], 0.18, 0.5);
    for (const [dx, dz, c] of [[0, 0, 0xd84a3e], [0.05, 0.02, 0xf2c23a], [-0.04, 0.03, 0x3c7fd8], [0.02, -0.04, 0x4fa860], [-0.02, -0.02, 0xb45ad8]] as number[][]) { f.box(0.002, 0.26, 0.002, dx, 0, dz, 0x2a2a2e); f.sphere(0.032, dx, 0.28, dz, c, 1, 1.2); } }
  p.box(0.12, 0.08, 0.07, -0.12, y0, 0.78, C.white); p.sphere(0.035, -0.12, 0.13, 0.78, 0xf2a6c8, 0, 0.9); p.cyl(0.004, 0.004, 0.2, 3, -0.08, 0.09, 0.78, C.metal); p.cone(0.06, 0.04, 8, -0.08, 0.29, 0.78, 0xd84a3e);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateZ(Math.PI / 2), -0.12 + s * 0.06, 0.03, 0.78, 0x3c3c40);
  const folk: [number, number, number, number, Pose][] = [
    [0.08, 0.3, 0x8a3a3a, 2.4, 'idle'], [-0.1, 0.05, 0x3a5a9a, 0.6, 'idle'], [0.06, -0.22, 0xd8a03a, Math.PI, 'cheer'], [-0.08, 0.42, 0x6a8a4a, 2.9, 'idle'],
    [0.1, 0.62, 0xd84a3e, 0.3, 'idle'], [-0.06, 1.2, 0x3c3c48, 0, 'idle'], [-0.55, 0.42, 0x5a5a6a, Math.PI, 'cheer'], [-0.6, -0.12, 0xe8885a, Math.PI / 2, 'cheer'],
    [0.45, -0.18, 0xf2c23a, -Math.PI / 2, 'cheer'], [0.5, 0.62, 0x4fa860, 0.8, 'cheer'], [-0.05, 0.85, 0xb45ad8, 1.6, 'idle'], [0.1, -0.05, 0x3a6ab8, -2.6, 'idle'],
    [-0.25, 1.15, 0x8a5a3a, 0.4, 'idle'], [0.38, 1.12, 0xd8786c, -0.5, 'cheer'],
  ];
  for (const [x, z, c, r, pose] of folk) figure(p, x, z, c, r, false, 0x4a3426, pose);
}

/** Automobile ancienne (vers +z) : caisse ouverte, capot, radiateur de laiton, ailes, roues à rayons, chauffeur à casquette */
function oldCar(p: Parts, x: number, z: number, ry: number, body: number, driver = true) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
  const put = (w: number, h: number, d: number, u: number, y: number, v: number, col: number) => { const [px, pz] = at(u, v); p.box(w, h, d, px, y, pz, col, ry); };
  put(0.12, 0.045, 0.2, 0, 0.05, -0.02, body); put(0.1, 0.04, 0.08, 0, 0.07, 0.1, 0x2a2a2e);
  put(0.08, 0.05, 0.01, 0, 0.065, 0.145, 0xc8a050); put(0.11, 0.05, 0.025, 0, 0.09, -0.07, 0x5a3a2a);
  put(0.1, 0.045, 0.004, 0, 0.115, 0.05, 0xcfe2f0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [px, pz] = at(sx * 0.065, sz * 0.08 - 0.01);
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.014, 10).rotateZ(Math.PI / 2).rotateY(ry), px, 0.035, pz, 0x2a2a2e);
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 6).rotateZ(Math.PI / 2).rotateY(ry), px, 0.035, pz, 0xc8a050);
    put(0.024, 0.008, 0.07, sx * 0.065, 0.075, sz * 0.08 - 0.01, 0x1e1e22);
  }
  for (const sx of [-1, 1]) put(0.02, 0.02, 0.02, sx * 0.04, 0.085, 0.15, 0xffe8a0);
  if (driver) { put(0.05, 0.05, 0.035, 0, 0.1, -0.02, 0x5a4a3a); put(0.03, 0.03, 0.03, 0, 0.145, -0.02, 0xe8b894); put(0.034, 0.01, 0.04, 0, 0.165, -0.015, 0x3c3c40); }
}

/**
 * Usine automobile (2 × 2) : longue halle de brique aux toits en dents de scie vitrés et son enseigne, haute cheminée, porte
 * de la chaîne d'où sort une voiture, bureaux, autos neuves rangées dans la cour, piste d'essai où une voiture tourne ; à
 * l'époque moderne, grande usine blanche à bandeau bleu, camion porte-voitures et autos de toutes les couleurs
 */
function carworks(p: Parts, age: number) {
  sink(0.012);
  const modern = age >= 4, y0 = 0.012, brick = 0xa85e50, wall = modern ? 0xeceef0 : brick;
  // la halle de montage
  const hx = -0.2, hz = -0.6, W = 1.5, D = 0.7, H = 0.34;
  p.box(W, H, D, hx, y0, hz, wall);
  if (!modern) {
    stones(p, hx, hz + D / 2, W, y0, H, 0, dark(brick, 0.86), 0.4, 390);
    for (let i = 0; i < 6; i++) { const x = hx - W / 2 + (i + 0.5) * (W / 6); p.add(new THREE.BoxGeometry(W / 6 + 0.01, 0.012, D + 0.02).translate(0, 0.05, 0), x, H + y0, hz, 0x5d6878, 0, false, 0.5); p.box(0.01, 0.1, D, x + W / 12 - 0.004, H + y0, hz, C.glass, 0, true); }
    for (const x of [-0.85, -0.55, 0.15, 0.4]) { p.box(0.1, 0.16, 0.012, x, 0.08, hz + D / 2 + 0.004, C.win, 0, true); archTop(p, x, 0.24, hz + D / 2 + 0.006, 0.05, 0xe2d8c4); }
    p.box(0.5, 0.07, 0.012, hx, 0.27, hz + D / 2 + 0.01, 0x2c3e4a); for (let k = 0; k < 11; k++) p.box(0.03, 0.035, 0.004, hx - 0.2 + k * 0.04, 0.285, hz + D / 2 + 0.018, C.gold);
    // haute cheminée cerclée de fer
    p.cyl(0.04, 0.06, 0.95, 10, 0.75, y0, -0.82, brick); for (const y of [0.35, 0.65, 0.9]) p.cyl(0.054 - y * 0.02, 0.054 - y * 0.02, 0.014, 10, 0.75, y, -0.82, 0x3c3c40);
    smoke(0.75, 1.0, -0.82, 2);
  } else {
    p.box(W + 0.02, 0.04, D + 0.02, hx, H + y0, hz, 0xd8dde2); p.box(W, 0.05, 0.012, hx, 0.24, hz + D / 2 + 0.004, 0x3a6ab8);
    for (let k = 0; k < 6; k++) p.box(0.18, 0.012, 0.1, hx - 0.6 + k * 0.24, H + 0.05, hz - 0.15, 0x2c3e5a);
    for (let k = 0; k < 6; k++) p.box(0.18, 0.012, 0.1, hx - 0.6 + k * 0.24, H + 0.05, hz + 0.05, 0x2c3e5a);
    p.cyl(0.08, 0.08, 0.012, 16, 0.45, 0.25, hz + D / 2 + 0.01, C.white); p.box(0.1, 0.03, 0.006, 0.45, 0.25, hz + D / 2 + 0.018, 0x3a6ab8);
  }
  // porte de la chaîne, une voiture qui en sort
  p.box(0.26, 0.2, 0.012, -0.2, y0, hz + D / 2 + 0.004, 0x2a2a2e);
  oldCar(p, -0.2, -0.1, 0, modern ? 0xd84a3e : 0x1e2a24);
  // bureaux à l'avant gauche
  p.box(0.36, 0.3, 0.3, -0.72, y0, 0.1, modern ? 0xd8e4ec : 0xd8c8a8);
  windows(p, [-0.82, -0.72, -0.62], 0.08, 0.255, 0.05, 0.07, C.white); windows(p, [-0.82, -0.72, -0.62], 0.2, 0.255, 0.05, 0.07, C.white);
  if (modern) p.box(0.38, 0.03, 0.32, -0.72, 0.31, 0.1, 0x3a6ab8);
  else roof(p, -0.72, 0.31, 0.1, { w: 0.36, d: 0.3, h: 0.12, color: C.slate, wall: 0xd8c8a8, courses: true });
  // autos neuves rangées dans la cour
  const colors = modern ? [0xd84a3e, 0x3a6ab8, 0xf2c23a, 0xf4f2ee, 0x4fa860] : [0x1e1e22, 0x3a2a24, 0x1e2a24, 0x2a2a3e, 0x4a1e1e];
  for (let k = 0; k < 4; k++) oldCar(p, -0.9 + k * 0.17, 0.62, 0, colors[k], false);
  for (let k = 0; k < 4; k++) p.box(0.006, 0.004, 0.26, -0.985 + k * 0.17, y0 + 0.002, 0.6, C.white);
  // piste d'essai : anneau de cendrée (bitume ensuite), la voiture d'essai qui tourne
  const tx = 0.52, tz = 0.42, tr = 0.36;
  p.add(new THREE.RingGeometry(tr - 0.07, tr + 0.07, 32).rotateX(-Math.PI / 2), tx, y0 + 0.004, tz, modern ? 0x5d6169 : 0x8a7a6a);
  ellipseRing(p, tr, tr, y0 + 0.006, 0.003, C.white, tx, tz);
  const T = turning([tx, y0, tz], [0, 1, 0], 0.12);
  oldCar(T, tr, 0, Math.PI, modern ? 0xf2c23a : 0x6a1e1e);
  // pneus empilés, caisses, mécaniciens
  for (let k = 0; k < 4; k++) p.add(new THREE.TorusGeometry(0.032, 0.014, 4, 10).rotateX(Math.PI / 2), 0.88, y0 + 0.014 + k * 0.026, -0.2, 0x2a2a2e);
  for (const [x, z, r] of [[0.66, -0.18, 0], [0.74, -0.08, 0.4]]) p.box(0.08, 0.07, 0.08, x, y0, z, 0xb48a5e, r);
  for (const [x, z, c, r] of [[-0.05, -0.05, 0x3a5a8a, -1.4], [-0.38, 0.32, 0x5a5a6a, 0.4], [0.2, 0.0, 0x3a5a8a, 2.6]] as number[][]) figure(p, x, z, c, r);
  lampPost(p, -0.45, 0.9, 0.3);
}

/**
 * Laboratoire (1 case) : maison de brique à toit mansardé et serre de verre, bobine de Tesla sur son socle qui crépite,
 * paratonnerre, table aux fioles colorées et le savant en blouse ; centre de recherche vitré à l'époque moderne, son antenne
 * parabolique qui tourne, panneaux solaires
 */
function lab(p: Parts, age: number) {
  sink(0.012);
  const y0 = 0.012;
  if (age >= 4) {
    // centre de recherche : deux niveaux vitrés derrière des brise-soleil blancs, nez de plancher, aileron de couleur, auvent
    // d'entrée et son enseigne lumineuse ; sur le toit, panneaux solaires, cheminées d'extraction, ventilation et mât d'antenne
    // à feu rouge ; l'antenne parabolique qui tourne, la cuve d'azote givrée et sa conduite ; devant, le parvis dallé, la
    // double hélice de l'ADN, un arbre, un banc, des vélos, les chercheurs en blouse et un visiteur
    const wall = 0xe8eaee, fin = 0x2ab0b0;
    p.box(0.98, 0.006, 0.46, 0, 0.006, 0.25, 0xd8d4cc);
    for (let k = 0; k < 7; k++) p.box(0.004, 0.003, 0.46, -0.42 + k * 0.14, 0.012, 0.25, 0xc4c0b8);
    p.box(0.62, 0.4, 0.4, -0.1, y0, -0.18, wall);
    p.box(0.6, 0.3, 0.012, -0.1, 0.06, 0.024, C.glass, 0, true); for (let k = 0; k <= 6; k++) p.box(0.012, 0.3, 0.016, -0.4 + k * 0.1, 0.06, 0.026, 0xd8dde2);
    p.box(0.64, 0.05, 0.016, -0.1, y0, 0.024, 0x6a7078);
    p.box(0.64, 0.022, 0.04, -0.1, 0.2, 0.034, 0xf4f6f8);
    for (const y of [0.25, 0.285, 0.32]) p.box(0.6, 0.008, 0.045, -0.1, y, 0.058, C.white);
    p.box(0.035, 0.43, 0.05, 0.195, y0, 0.03, fin);
    // entrée : porte vitrée éclairée, auvent en porte-à-faux, enseigne et ses lettres
    p.box(0.1, 0.13, 0.008, -0.25, y0 + 0.04, 0.034, 0x9fc4dc, 0, true);
    p.box(0.24, 0.014, 0.13, -0.25, 0.175, 0.095, 0xf4f6f8);
    p.box(0.22, 0.035, 0.008, -0.25, 0.19, 0.162, 0x2a3a4a); for (let k = 0; k < 3; k++) p.box(0.03, 0.022, 0.004, -0.29 + k * 0.04, 0.197, 0.168, 0x9de0ff, 0, true);
    // toit : acrotère bleu, panneaux solaires, cheminées d'extraction, ventilation, antenne
    p.box(0.64, 0.025, 0.42, -0.1, 0.41, -0.18, 0x3a6ab8);
    for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.16, 0.012, 0.12), -0.3 + k * 0.18, 0.46, -0.2, 0x2c3e5a, 0, false, 0, 0.35);
    for (let k = 0; k < 3; k++) for (let j = 1; j < 4; j++) p.add(new THREE.BoxGeometry(0.004, 0.013, 0.12), -0.38 + k * 0.18 + j * 0.04, 0.46, -0.2, 0x8a9ab8, 0, false, 0, 0.35);
    for (const x of [-0.06, 0.04]) { p.cyl(0.014, 0.014, 0.16, 6, x, 0.435, -0.34, 0xc4cad2); p.cyl(0.022, 0.022, 0.012, 6, x, 0.595, -0.34, 0x5d6168); }
    hvac(p, -0.32, 0.435, -0.34, 0.1);
    p.cyl(0.004, 0.006, 0.22, 4, 0.15, 0.435, -0.04, 0x9aa3ad); p.box(0.012, 0.012, 0.012, 0.15, 0.655, -0.04, 0xff4a3a, 0, true);
    // antenne parabolique sur son fût, qui tourne lentement
    p.cyl(0.02, 0.03, 0.2, 6, 0.32, y0, -0.25, 0xd8dde2);
    p.cyl(0.075, 0.075, 0.02, 10, 0.32, 0.2, -0.25, 0x9aa3ad);
    const D = turning([0.32, 0.21, -0.25], [0, 1, 0], 0.05);
    D.add(new THREE.SphereGeometry(0.12, 12, 4, 0, Math.PI * 2, 0, 1.1).rotateX(-1.1), 0, 0.06, 0, C.white); D.cyl(0.006, 0.006, 0.12, 4, 0, 0.06, 0.06, 0x9aa3ad);
    // cuve d'azote givrée sur ses pieds, conduite jusqu'au mur
    for (const [dx, dz] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) p.box(0.008, 0.04, 0.008, 0.4 + dx, y0, 0.0 + dz, 0x8a8f96);
    p.cyl(0.045, 0.045, 0.2, 10, 0.4, y0 + 0.04, 0.0, 0xf4f6f8); p.sphere(0.045, 0.4, y0 + 0.24, 0.0, 0xf4f6f8, 1, 0.5);
    for (const y of [0.1, 0.18]) p.cyl(0.047, 0.047, 0.01, 10, 0.4, y, 0.0, 0xc4d4e0);
    p.box(0.19, 0.012, 0.012, 0.305, 0.17, 0.0, 0x9aa3ad); p.box(0.03, 0.03, 0.006, 0.4, 0.13, 0.046, 0xf2c23a);
    // la double hélice de l'ADN sur son socle : deux brins de perles, leurs barreaux blancs
    p.cyl(0.05, 0.055, 0.03, 10, 0.3, y0, 0.3, 0xb8bcc4);
    for (let k = 0; k < 9; k++) {
      const a = k * 0.7, y = y0 + 0.05 + k * 0.028, cx = Math.cos(a) * 0.032, cz = Math.sin(a) * 0.032;
      p.sphere(0.011, 0.3 + cx, y, 0.3 + cz, 0x3a8ad8); p.sphere(0.011, 0.3 - cx, y, 0.3 - cz, 0xd84a8a);
      p.box(0.064, 0.004, 0.004, 0.3, y, 0.3, C.white, -a);
    }
    // parvis : arbre, jardinière, banc, vélos ; les chercheurs en blouse (l'un tient son bloc-notes) et un visiteur qui entre
    tree(p, -0.4, 0.3, 0.8); planter(p, 0.0, 0.1, 0.2, 0.05);
    bench(p, -0.18, 0.42, 0);
    bike(p, 0.08, 0.38, 0xd8553c); bike(p, 0.15, 0.38, 0x3c7fd8);
    figure(p, 0.13, 0.22, C.white, 3); p.box(0.03, 0.04, 0.006, 0.12, 0.1, 0.19, 0x3c4a54);
    figure(p, 0.42, 0.18, C.white, -2.2, false, 0x8a5a3a);
    figure(p, -0.25, 0.2, 0x3a6ab8, Math.PI, false, 0x2a2420);
    return;
  }
  const brick = 0xa85e50;
  p.box(0.5, 0.3, 0.36, -0.12, y0, -0.2, brick);
  stones(p, -0.12, -0.02, 0.5, y0, 0.3, 0, dark(brick, 0.86), 0.4, 395);
  windows(p, [-0.3, -0.12, 0.06], 0.1, -0.012, 0.07, 0.12, 0xe2d8c4);
  p.box(0.08, 0.15, 0.012, -0.12, y0, -0.014, 0x4a3a30);
  // toit mansardé d'ardoise, ses lucarnes, le paratonnerre
  p.add(new THREE.CylinderGeometry(0.2, 0.3, 0.12, 4, 1).rotateY(Math.PI / 4).scale(1.18, 1, 0.85), -0.12, 0.37, -0.2, C.slate);
  for (const x of [-0.24, 0]) { p.box(0.06, 0.06, 0.04, x, 0.36, -0.03, 0xe2d8c4); p.box(0.04, 0.04, 0.004, x, 0.37, -0.01, C.win, 0, true); }
  p.cyl(0.004, 0.004, 0.18, 4, 0.0, 0.43, -0.25, 0x9aa3ad); p.sphere(0.012, 0.0, 0.61, -0.25, C.gold);
  // serre de verre accolée
  p.box(0.2, 0.2, 0.3, 0.27, y0, -0.24, C.glass, 0, true);
  for (let k = 0; k <= 4; k++) p.box(0.204, 0.204, 0.008, 0.27, y0, -0.39 + k * 0.075, 0x3c4a44);
  p.gable(0.2, 0.08, 0.3, 0.27, 0.212, -0.24, C.glass, Math.PI / 2);
  for (let k = 0; k < 4; k++) p.sphere(0.03, 0.22 + (k % 2) * 0.1, 0.06, -0.33 + k * 0.06, 0x4f8a44, 0, 0.9);
  // bobine de Tesla qui crépite (éclairs figés qui luisent) sur son socle de pierre
  p.box(0.12, 0.05, 0.12, 0.28, y0, 0.22, C.stone);
  p.cyl(0.028, 0.028, 0.2, 10, 0.28, 0.06, 0.22, 0xc87a3a); for (let k = 0; k < 8; k++) p.cyl(0.031, 0.031, 0.006, 10, 0.28, 0.07 + k * 0.022, 0.22, 0xe8a060);
  p.add(new THREE.TorusGeometry(0.045, 0.016, 6, 14).rotateX(Math.PI / 2), 0.28, 0.28, 0.22, 0xc4cad2);
  for (const [a, l] of [[0.4, 0.09], [2.4, 0.07], [4.2, 0.1]]) { p.add(new THREE.BoxGeometry(l, 0.006, 0.006), 0.28 + Math.cos(a) * 0.07, 0.29, 0.22 + Math.sin(a) * 0.07, 0xb8e0ff, -a, true, 0.4); }
  // table aux fioles colorées, le savant en blouse blanche, l'enseigne
  p.box(0.18, 0.012, 0.08, -0.2, 0.08, 0.22, C.wood); for (const s of [-1, 1]) p.box(0.012, 0.07, 0.06, -0.2 + s * 0.08, y0, 0.22, C.darkwood);
  for (const [dx, c] of [[-0.06, 0x7aff8a], [-0.02, 0xd86aff], [0.03, 0xffb84a], [0.07, 0x6ac8ff]] as number[][]) { p.cyl(0.012, 0.016, 0.03, 6, -0.2 + dx, 0.092, 0.22, c); p.cyl(0.004, 0.004, 0.02, 4, -0.2 + dx, 0.122, 0.22, 0xe8f2f6); }
  figure(p, -0.2, 0.33, C.white, Math.PI);
  p.box(0.22, 0.05, 0.01, -0.12, 0.25, -0.012, 0x2c3e4a); for (let k = 0; k < 6; k++) p.box(0.022, 0.025, 0.004, -0.2 + k * 0.032, 0.262, -0.005, C.gold);
}

/**
 * Aérodrome (3 × 3) : prairie et piste d'herbe tondue, balises, manche à air au vent, hangar de bois à voûte (de métal ensuite)
 * et son biplan à l'hélice qui tourne (avion de tourisme à l'époque moderne), mât d'amarrage du dirigeable, aire des
 * montgolfières, club-house et sa terrasse, fûts d'essence, curieux derrière la barrière
 */
function aerodrome(p: Parts, age: number) {
  sink(0.012);
  const modern = age >= 4, y0 = 0.012;
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0x8fc47e);
  // piste d'herbe tondue (bitume à l'époque moderne) et ses balises
  p.box(2.7, 0.006, 0.5, 0, y0, 0.75, modern ? 0x5d6169 : 0x7fbc6a);
  if (modern) for (let x = -1.2; x <= 1.21; x += 0.24) p.box(0.12, 0.004, 0.02, x, y0 + 0.006, 0.75, C.white);
  else for (let k = 0; k < 9; k++) p.box(0.3, 0.004, 0.5, -1.2 + k * 0.3, y0 + 0.003, 0.75, k % 2 ? 0x86c272 : 0x78b464);
  for (let x = -1.3; x <= 1.31; x += 0.26) for (const z of [0.48, 1.02]) p.box(0.04, 0.02, 0.04, x, y0, z, modern ? 0xfff1c9 : C.white, 0, modern);
  // manche à air au bout de son mât, qui flotte
  p.cyl(0.006, 0.006, 0.42, 4, 1.3, y0, 0.3, 0x9aa3ad);
  { const f = sway([1.3, 0.42, 0.3], [0, 1, 0], 0.5, 0.6); f.add(new THREE.ConeGeometry(0.035, 0.18, 8, 1, true).rotateZ(Math.PI / 2), 0.09, 0, 0, 0xf28a3c); for (const d of [0.05, 0.12]) f.add(new THREE.CylinderGeometry(0.03 - d * 0.1, 0.03 - d * 0.1, 0.02, 8, 1, true).rotateZ(Math.PI / 2), d, 0, 0, C.white); }
  // hangar à voûte, grand ouvert, et l'avion devant
  const gx = -0.75, gz = -0.85;
  p.add(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 16, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), gx, y0, gz, modern ? 0xb8c2cc : 0x8a6448);
  for (let k = 0; k <= 4; k++) p.add(new THREE.TorusGeometry(0.425, 0.01, 3, 16, Math.PI), gx, y0, gz - 0.44 + k * 0.22, modern ? 0x8a96a2 : 0x5a4232);
  p.add(new THREE.CircleGeometry(0.4, 16, 0, Math.PI), gx, y0, gz - 0.449, modern ? 0x9aa6b2 : 0x6a4c36);
  p.add(new THREE.CircleGeometry(0.36, 16, 0, Math.PI), gx, y0, gz + 0.452, 0x2a2622);
  const ax = -0.75, az = -0.15;
  if (!modern) {
    // biplan de toile : fuselage, deux ailes et leurs mâts, empennage, roues, hélice qui tourne
    p.box(0.07, 0.07, 0.42, ax, 0.1, az, 0xd8c8a0); p.box(0.05, 0.04, 0.1, ax, 0.16, az - 0.02, 0x5a4a3a);
    for (const y of [0.1, 0.24]) p.box(0.62, 0.012, 0.11, ax, y, az + 0.08, 0xc8b890);
    for (const s of [-1, 1]) for (const dz of [0.04, 0.12]) p.box(0.008, 0.14, 0.008, ax + s * 0.24, 0.1, az + dz, 0x5a4a3a);
    p.box(0.2, 0.01, 0.07, ax, 0.12, az - 0.2, 0xc8b890); p.box(0.01, 0.08, 0.07, ax, 0.12, az - 0.2, 0xd84a3e);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10).rotateZ(Math.PI / 2), ax + s * 0.06, 0.03, az + 0.12, 0x2a2a2e);
    p.box(0.1, 0.006, 0.006, ax, 0.04, az + 0.12, 0x5a4a3a);
    const pr = turning([ax, 0.1, az + 0.22], [0, 0, 1], 3);
    pr.box(0.2, 0.02, 0.008, 0, 0, 0, 0x6a4a34); pr.cyl(0.014, 0.014, 0.02, 6, 0, -0.01, 0, 0x9aa3ad);
    figure(p, ax + 0.2, az + 0.25, 0x6a4a34, Math.PI);
  } else {
    // avion de tourisme à aile haute
    p.box(0.08, 0.08, 0.36, ax, 0.08, az, C.white); p.box(0.06, 0.05, 0.1, ax, 0.14, az + 0.06, 0x86c4d8);
    p.box(0.64, 0.012, 0.1, ax, 0.17, az + 0.04, C.white); p.box(0.66, 0.008, 0.02, ax, 0.165, az + 0.06, 0xd84a3e);
    p.box(0.2, 0.01, 0.06, ax, 0.11, az - 0.18, C.white); p.box(0.01, 0.08, 0.07, ax, 0.11, az - 0.18, 0x3a6ab8);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10).rotateZ(Math.PI / 2), ax + s * 0.06, 0.025, az + 0.04, 0x2a2a2e);
    const pr = turning([ax, 0.09, az + 0.19], [0, 0, 1], 3);
    pr.box(0.16, 0.016, 0.006, 0, 0, 0, 0x2a2a2e);
  }
  // mât d'amarrage du dirigeable : treillis, plate-forme, cône d'amarrage, échelle
  const mx = 0.95, mz = -0.95;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.014, 1.0, 0.014).translate(0, 0.5, 0), mx + dx * 0.07, y0, mz + dz * 0.07, modern ? 0xd8dde2 : 0x5a5a62, 0, false, -dx * 0.05, dz * 0.05);
  for (let k = 1; k < 6; k++) p.box(0.16 - k * 0.01, 0.008, 0.16 - k * 0.01, mx, k * 0.17, mz, modern ? 0xd8dde2 : 0x5a5a62);
  p.box(0.12, 0.016, 0.12, mx, 1.0, mz, modern ? 0xd8dde2 : 0x5a5a62); p.cone(0.03, 0.06, 6, mx, 1.02, mz, modern ? 0xd84a3e : C.gold);
  // aire des montgolfières : rond de terre battue, nacelles et brûleurs au sol, enveloppe couchée qu'on déploie
  const bx = 0.75, bz = 0.05;
  p.cyl(0.36, 0.36, 0.006, 20, bx, y0, bz, 0xcdb890);
  for (const [dx, dz] of [[-0.18, 0.12], [0.16, -0.1]]) { p.box(0.08, 0.06, 0.08, bx + dx, y0, bz + dz, 0xb08a5a); p.box(0.084, 0.01, 0.084, bx + dx, y0 + 0.06, bz + dz, 0x6a4c36); }
  for (let k = 0; k < 6; k++) p.add(new THREE.IcosahedronGeometry(0.06, 0).scale(1.6, 0.25, 1), bx + 0.0 + k * 0.05, y0 + 0.01, bz + 0.18 - k * 0.04, [0xd84a3e, 0xf2c23a][k % 2], 0.6);
  for (const [x, z, c, r] of [[bx - 0.3, bz + 0.2, 0x8a3a3a, 1.2], [bx + 0.3, bz - 0.25, 0x3a5a8a, -2]] as number[][]) figure(p, x, z, c, r);
  // club-house, sa terrasse, son drapeau ; fûts d'essence
  p.box(0.5, 0.24, 0.3, -0.05, y0, -1.1, modern ? 0xe8eaee : 0xd8c8a8);
  windows(p, [-0.2, -0.05, 0.1], 0.08, -0.946, 0.07, 0.09, C.white);
  if (modern) p.box(0.52, 0.03, 0.32, -0.05, 0.25, -1.1, 0x3a6ab8); else roof(p, -0.05, 0.252, -1.1, { w: 0.5, d: 0.3, h: 0.12, color: 0xb8644a, wall: 0xd8c8a8, tiles: true });
  for (const x of [-0.2, 0.1]) { p.cyl(0.04, 0.04, 0.006, 8, x, 0.08, -0.82, C.white); p.cyl(0.005, 0.005, 0.07, 4, x, y0, -0.82, 0x3c3c40); p.cyl(0.003, 0.003, 0.18, 3, x, 0.08, -0.82, 0x3c3c40); p.cone(0.07, 0.04, 8, x, 0.25, -0.82, x < 0 ? 0xd84a3e : 0xf2c23a); }
  p.cyl(0.004, 0.004, 0.5, 4, 0.3, y0, -1.1, C.metal); sway([0.3, 0.5, -1.1], [0, 1, 0], 0.4, 1.1).box(0.1, 0.06, 0.004, 0.05, 0, 0, 0x3a6ab8);
  for (const [x, z] of [[-0.25, -0.45], [-0.18, -0.48], [-0.22, -0.38]]) { p.cyl(0.026, 0.026, 0.07, 8, x, y0, z, 0xb83a32); p.cyl(0.027, 0.027, 0.006, 8, x, y0 + 0.05, z, 0x3c3c40); }
  // barrière blanche et les curieux
  for (let k = 0; k <= 12; k++) p.box(0.01, 0.06, 0.01, -1.4 + k * 0.233, y0, 1.35, C.white);
  p.box(2.8, 0.01, 0.01, 0, y0 + 0.05, 1.35, C.white);
  for (const [x, c] of [[-0.6, 0xd84a3e], [-0.45, 0x3a6ab8], [0.2, 0xf2c23a], [0.35, 0x6a4a8a], [0.9, 0x4a6a3a]] as number[][]) figure(p, x, 1.42, c, Math.PI);
}

/**
 * Manoir (2 × 2) : logis de pierre à haut toit d'ardoise, tour ronde coiffée en poivrière, aile à colombages, cheminées qui
 * fument, jardin clos de buis et sa fontaine, portail ; hôtel particulier à l'âge industriel (façade de pierre blonde,
 * toit mansardé et ses lucarnes, fronton, perron, grille dorée, cour de gravier, parterres, fiacre) ; villa contemporaine à
 * l'époque moderne (étage bardé de bois en porte-à-faux, baies vitrées, toit végétalisé, garage, piscine à débordement,
 * cuisine d'été, jardin paysager)
 */
function manor(p: Parts, age: number) {
  sink(0.012);
  const y0 = 0.012;
  if (age >= 4) {
    // la villa contemporaine : rez-de-chaussée tout vitré sous un étage bardé de bois en porte-à-faux, toit végétalisé et
    // panneaux solaires, garage et borne de recharge ; piscine à débordement, plage de bois, transats, parasol, cuisine
    // d'été et brasero ; jardin paysager, clôture à lames et portail ; la famille au bord de l'eau
    const render = 0xf4f2ee, clad = 0x8a5a3a, dk = 0x2e3238, glass = 0x9fc4dc;
    p.box(1.9, 0.006, 1.9, 0, y0, 0, 0x8fc47e);
    for (let k = 0; k < 8; k++) p.box(1.9, 0.002, 0.12, 0, y0 + 0.006, 0.36 + k * 0.075, k % 2 ? 0x86bc76 : 0x96cc86);
    // le rez-de-chaussée : socle enduit, grandes baies et leurs montants, le salon qu'on voit dedans
    p.box(1.0, 0.3, 0.56, -0.25, y0, -0.5, render);
    p.box(0.92, 0.26, 0.012, -0.25, y0 + 0.02, -0.218, glass, 0, true);
    for (let k = 0; k <= 6; k++) p.box(0.008, 0.26, 0.016, -0.71 + k * 0.153, y0 + 0.02, -0.214, dk);
    p.box(0.3, 0.05, 0.12, -0.45, y0, -0.32, 0x6a7a8a); p.box(0.3, 0.06, 0.03, -0.45, y0 + 0.05, -0.37, 0x6a7a8a);
    p.cyl(0.004, 0.004, 0.16, 4, -0.15, y0, -0.32, dk); p.cone(0.03, 0.03, 8, -0.15, y0 + 0.16, -0.32, 0xf2e2b0, true);
    // l'étage en porte-à-faux, son bardage, son bandeau vitré, son balcon de verre
    p.box(0.82, 0.25, 0.64, 0.05, 0.31, -0.5, clad);
    for (let x = -0.35; x < 0.46; x += 0.035) p.box(0.006, 0.25, 0.004, x, 0.31, -0.178, dark(clad, 0.8));
    p.box(0.62, 0.11, 0.012, 0.05, 0.38, -0.175, dk); p.box(0.6, 0.09, 0.014, 0.05, 0.39, -0.174, glass, 0, true);
    p.box(0.5, 0.012, 0.2, -0.55, 0.31, -0.12, 0xd8d6d0); p.box(0.5, 0.07, 0.006, -0.55, 0.32, -0.02, 0xbfe0ee); p.box(0.5, 0.006, 0.008, -0.55, 0.39, -0.02, 0x8a8f96);
    // le toit végétalisé, ses panneaux solaires, le puits de lumière
    p.box(0.84, 0.02, 0.66, 0.05, 0.56, -0.5, 0xd8d6d0);
    p.box(0.74, 0.012, 0.56, 0.05, 0.58, -0.5, 0x6fa85a);
    for (let k = 0; k < 3; k++) { p.add(new THREE.BoxGeometry(0.2, 0.008, 0.14), -0.2 + k * 0.24, 0.62, -0.62, 0x2a3a6a, 0, false, 0, -0.3); for (let j = 0; j < 3; j++) p.add(new THREE.BoxGeometry(0.004, 0.009, 0.14), -0.27 + k * 0.24 + j * 0.07, 0.621, -0.62, 0x8a9ab8, 0, false, 0, -0.3); }
    p.box(0.14, 0.03, 0.14, 0.3, 0.59, -0.38, 0xbfe0ee, 0, true);
    // le garage, sa porte à lames de bois, la borne, la voiture, l'allée
    p.box(0.42, 0.26, 0.5, 0.62, y0, -0.52, 0xd8d6d0); p.box(0.44, 0.02, 0.52, 0.62, 0.27, -0.52, dk);
    p.box(0.34, 0.2, 0.012, 0.62, y0, -0.264, 0xa87a50); for (let k = 0; k < 7; k++) p.box(0.34, 0.004, 0.014, 0.62, y0 + 0.02 + k * 0.026, -0.263, 0x8a5a3a);
    p.box(0.03, 0.08, 0.02, 0.86, y0, -0.24, dk); p.box(0.02, 0.02, 0.004, 0.86, y0 + 0.05, -0.229, 0x3aff7a, 0, true);
    p.box(0.36, 0.006, 0.8, 0.62, y0, 0.15, 0xb8b4ac);
    p.box(0.15, 0.07, 0.28, 0.62, y0 + 0.03, 0.0, 0x2a2e34); p.box(0.13, 0.055, 0.16, 0.62, y0 + 0.1, -0.01, 0x9fc4dc);
    for (const z of [-0.09, 0.09]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateZ(Math.PI / 2), 0.62 + s * 0.075, y0 + 0.03, z, 0x1e1e22);
    for (const s of [-1, 1]) p.box(0.026, 0.012, 0.004, 0.62 + s * 0.05, y0 + 0.07, 0.141, 0xfff1c9, 0, true);
    // la piscine à débordement, sa margelle, ses spots, son échelle, la bouée flamant
    p.box(0.98, 0.03, 0.5, -0.3, y0, 0.3, 0xe8e2d4);
    p.box(0.88, 0.012, 0.4, -0.3, y0 + 0.025, 0.3, 0x5ac8e8);
    p.box(0.88, 0.02, 0.02, -0.3, y0, 0.56, 0x8ad4ee);
    for (let k = 0; k < 4; k++) p.box(0.03, 0.006, 0.006, -0.66 + k * 0.24, y0 + 0.02, 0.501, 0xe8f8ff, 0, true);
    for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.03, 0.004, 3, 8, Math.PI), 0.12, y0 + 0.04, 0.2 + s * 0.04, 0xc4cad2, Math.PI / 2);
    p.add(new THREE.TorusGeometry(0.04, 0.014, 5, 12).rotateX(Math.PI / 2), -0.45, y0 + 0.04, 0.32, 0xf28aa8);
    p.cyl(0.006, 0.006, 0.05, 4, -0.41, y0 + 0.04, 0.32, 0xf28aa8); p.sphere(0.012, -0.41, y0 + 0.09, 0.33, 0xf28aa8);
    // la plage de bois, les transats et leurs serviettes, le parasol
    p.box(0.98, 0.012, 0.18, -0.3, y0, 0.0, 0xb08968); for (let k = 0; k < 12; k++) p.box(0.004, 0.013, 0.18, -0.77 + k * 0.08, y0, 0.0, 0x8a6a4a);
    for (const [x, c] of [[-0.62, 0xf2c23a], [-0.42, 0x3a6ab8]] as number[][]) {
      p.box(0.07, 0.012, 0.14, x, y0 + 0.03, 0.01, C.white); p.add(new THREE.BoxGeometry(0.07, 0.012, 0.06), x, y0 + 0.06, -0.08, C.white, 0, false, 0, 0.7);
      p.box(0.05, 0.004, 0.1, x, y0 + 0.042, 0.02, c);
    }
    p.cyl(0.005, 0.005, 0.26, 4, -0.52, y0, 0.08, C.metal); p.cone(0.15, 0.05, 8, -0.52, y0 + 0.26, 0.08, 0xf4f2ee);
    // la cuisine d'été et sa table, le brasero
    p.box(0.26, 0.08, 0.07, 0.15, y0, -0.06, 0x5d6168); p.box(0.27, 0.01, 0.08, 0.15, y0 + 0.08, -0.06, 0xd8d6d0);
    p.box(0.06, 0.03, 0.05, 0.08, y0 + 0.09, -0.06, 0x2a2a2e);
    p.box(0.2, 0.012, 0.1, 0.15, y0 + 0.06, 0.12, 0xb08968); for (const s of [-1, 1]) for (const d of [-0.06, 0.06]) p.box(0.03, 0.04, 0.03, 0.15 + d, y0, 0.12 + s * 0.08, dk);
    p.cyl(0.04, 0.035, 0.03, 10, 0.32, y0, 0.32, 0x3c3c40); p.cone(0.025, 0.04, 6, 0.32, y0 + 0.03, 0.32, 0xff9a3a, true);
    // le jardin : haies, cyprès, oliviers en pots, graminées, pas japonais, massifs
    hedge(p, -0.3, 0.88, 1.2, 0.05, 0.08, y0);
    for (const x of [-0.9, 0.36]) { p.cyl(0.02, 0.03, 0.1, 5, x, y0, -0.9, C.darkwood); p.cone(0.07, 0.4, 7, x, y0 + 0.08, -0.9, 0x3f6a46); }
    for (const [x, z] of [[-0.88, 0.1], [0.38, 0.5]]) { p.cyl(0.05, 0.04, 0.06, 8, x, y0, z, 0xd8c8b0); p.cyl(0.008, 0.01, 0.1, 4, x, y0 + 0.06, z, 0x7a6355); p.sphere(0.07, x, y0 + 0.2, z, 0x9ab07a, 0, 0.75); }
    for (let k = 0; k < 6; k++) p.cone(0.03, 0.08, 5, -0.9 + k * 0.05, y0, 0.62 + (k % 2) * 0.04, 0xc8c47a);
    for (let k = 0; k < 4; k++) p.box(0.08, 0.006, 0.06, 0.36, y0, 0.66 + k * 0.08, 0xd8d0c0);
    for (const [x, z, c] of [[-0.2, 0.68, C.pink], [-0.05, 0.7, 0xd84a3e], [0.1, 0.68, C.lav]] as number[][]) p.sphere(0.035, x, y0 + 0.02, z, c, 0, 0.7);
    // la clôture à lames, le portail, la boîte aux lettres, les bornes lumineuses
    for (let k = 0; k < 26; k++) { const x = -0.94 + k * 0.05; if (Math.abs(x - 0.36) < 0.07 || Math.abs(x - 0.62) < 0.18) continue; p.box(0.03, 0.1, 0.008, x, y0, 0.94, 0x5a4a3a); }
    p.box(0.04, 0.06, 0.03, 0.85, y0 + 0.05, 0.92, dk);
    for (const x of [0.3, 0.42]) { p.box(0.016, 0.05, 0.016, x, y0, 0.92, dk); p.box(0.018, 0.01, 0.018, x, y0 + 0.05, 0.92, 0xfff1c9, 0, true); }
    tree(p, -0.86, -0.38, 0.7);
    // la famille : au transat, à la plancha, un enfant au bord de l'eau
    seated(p, -0.62, y0 + 0.03, 0.02, Math.PI, 0xd84a3e);
    figure(p, 0.15, -0.14, 0x3a6ab8, 0, false, 0x4a3426, 'idle');
    figure(p, -0.05, 0.08, 0xf2c23a, Math.PI, false, 0x8a5a3a, 'cheer');
    return;
  }
  if (age === 3) {
    // hôtel particulier : corps de logis à deux étages, toit mansardé, lucarnes, fronton et perron
    const st = 0xe8dcc4, cream = 0xf4ead6, x0 = 0, z0 = -0.45, W = 1.4, D = 0.5, H = 0.44;
    p.box(W, H, D, x0, y0, z0, st);
    for (const y of [0.2, H - 0.02]) p.box(W + 0.03, 0.025, D + 0.03, x0, y, z0, cream);
    const xs = [-0.55, -0.38, -0.21, 0.21, 0.38, 0.55];
    windows(p, xs, 0.05, z0 + D / 2 + 0.01, 0.07, 0.12, cream); windows(p, xs, 0.25, z0 + D / 2 + 0.01, 0.07, 0.12, cream);
    for (const x of xs) for (const s of [-1, 1]) p.box(0.02, 0.12, 0.006, x + s * 0.055, 0.25, z0 + D / 2 + 0.014, 0x5a7a8a);
    p.add(new THREE.CylinderGeometry(0.62, 0.78, 0.2, 4, 1).rotateY(Math.PI / 4).scale(1.27, 1, 0.42), x0, H + y0 + 0.1, z0, C.slate);
    p.box(1.0, 0.04, 0.18, x0, H + 0.21, z0, dark(C.slate, 0.85));
    for (const x of [-0.45, -0.15, 0.15, 0.45]) { p.box(0.08, 0.1, 0.06, x, H + 0.04, z0 + 0.23, cream); p.box(0.05, 0.06, 0.004, x, H + 0.05, z0 + 0.262, C.win, 0, true); p.gable(0.08, 0.04, 0.06, x, H + 0.14, z0 + 0.23, C.slate); }
    for (const s of [-1, 1]) { p.box(0.08, 0.16, 0.08, s * 0.55, H + 0.15, z0, st); p.box(0.1, 0.02, 0.1, s * 0.55, H + 0.31, z0, cream); smoke(s * 0.55, H + 0.36, z0, 1); }
    p.box(0.36, H + 0.04, 0.06, x0, y0, z0 + D / 2 + 0.02, cream);
    p.gable(0.4, 0.1, 0.08, x0, H + 0.05, z0 + D / 2 + 0.02, cream);
    p.box(0.12, 0.2, 0.012, x0, 0.04, z0 + D / 2 + 0.054, 0x4a3a30); archTop(p, x0, 0.24, z0 + D / 2 + 0.054, 0.06, C.glass, true);
    for (let k = 0; k < 3; k++) p.box(0.3 - k * 0.04, 0.03, 0.05, x0, y0 + k * 0.02, z0 + D / 2 + 0.08 + k * 0.04, cream);
    // cour de gravier, parterres bordés de buis, grille dorée et son portail, fiacre, réverbères
    p.box(0.5, 0.008, 0.9, 0, y0, 0.45, 0xe2d6bc);
    for (const s of [-1, 1]) {
      p.box(0.55, 0.012, 0.6, s * 0.62, y0, 0.45, 0x8fc47e);
      hedge(p, s * 0.62, 0.17, 0.55, 0.035, 0.05, 0.02); hedge(p, s * 0.62, 0.73, 0.55, 0.035, 0.05, 0.02);
      for (let k = 0; k < 5; k++) p.sphere(0.022, s * (0.42 + k * 0.1), 0.04, 0.45, [C.pink, 0xd84a3e, C.butter, C.lav, 0xf2a6c8][k], 0, 0.8);
      lampPost(p, s * 0.28, 0.85, 0.3);
    }
    for (let i = 0; i <= 30; i++) { const x = -0.95 + i * 0.0633; if (Math.abs(x) < 0.2) continue; p.box(0.008, 0.16, 0.008, x, y0, 0.95, 0x2a2a2e); p.cone(0.008, 0.02, 4, x, 0.17, 0.95, C.gold); }
    for (const s of [-1, 1]) { p.box(0.05, 0.22, 0.05, s * 0.22, y0, 0.95, st); p.sphere(0.03, s * 0.22, 0.26, 0.95, cream); p.box(0.4, 0.008, 0.01, s * 0.6, 0.06, 0.95, 0x2a2a2e); }
    p.box(0.1, 0.08, 0.16, 0.08, 0.06, 0.32, 0x2c4a3e); p.box(0.11, 0.015, 0.17, 0.08, 0.14, 0.32, 0x1e1e22);
    for (const [dx, dz] of [[-0.06, -0.05], [0.06, -0.05], [-0.06, 0.06], [0.06, 0.06]]) p.add(new THREE.TorusGeometry(0.03, 0.006, 3, 10).rotateY(Math.PI / 2), 0.08 + dx, 0.05, 0.32 + dz, 0x2a2a2e);
    p.box(0.05, 0.06, 0.14, 0.08, 0.06, 0.46, 0x3e3434); p.box(0.03, 0.05, 0.04, 0.08, 0.11, 0.53, 0x3e3434);
    for (const [x, z, c, r] of [[-0.12, 0.2, 0x2a2a2e, 0.2], [-0.05, 0.6, 0x8a3a5a, 3]] as number[][]) figure(p, x, z, c, r);
    return;
  }
  // manoir : logis de pierre à haut toit, tour ronde en poivrière, aile à colombages, jardin clos
  const stone = 0xd8d0c0, x0 = -0.15, z0 = -0.45;
  p.box(1.0, 0.36, 0.5, x0, y0, z0, stone);
  stones(p, x0, z0 + 0.25, 1.0, y0, 0.36, 0, dark(stone, 0.86), 0.45, 401);
  roof(p, x0, 0.372, z0, { w: 1.0, d: 0.5, h: 0.32, color: C.slate, wall: stone, courses: true });
  windows(p, [x0 - 0.3, x0 - 0.1, x0 + 0.1, x0 + 0.3], 0.18, z0 + 0.26, 0.06, 0.1, 0xece4d4);
  p.box(0.12, 0.18, 0.016, x0, y0, z0 + 0.255, 0x5a4434); archTop(p, x0, 0.19, z0 + 0.258, 0.06, 0x5a4434);
  for (const x of [x0 - 0.38, x0 + 0.38]) { p.box(0.09, 0.22, 0.09, x, 0.5, z0, stone); smoke(x, 0.74, z0, 1); }
  for (const x of [x0 - 0.2, x0 + 0.2]) { p.box(0.08, 0.1, 0.08, x, 0.42, z0 + 0.16, stone); p.box(0.05, 0.06, 0.004, x, 0.43, z0 + 0.201, C.win, 0, true); p.gable(0.08, 0.06, 0.08, x, 0.52, z0 + 0.16, C.slate); }
  // tour ronde en poivrière à l'angle, girouette
  p.cyl(0.16, 0.17, 0.6, 12, x0 + 0.55, y0, z0 + 0.2, stone);
  for (const y of [0.18, 0.4]) p.box(0.02, 0.07, 0.04, x0 + 0.55, y, z0 + 0.37, C.win, 0, true);
  p.cone(0.21, 0.42, 12, x0 + 0.55, 0.61, z0 + 0.2, C.slate);
  p.cyl(0.004, 0.004, 0.1, 4, x0 + 0.55, 1.02, z0 + 0.2, 0x3c3c40); p.box(0.06, 0.03, 0.004, x0 + 0.58, 1.1, z0 + 0.2, C.gold);
  // aile à colombages
  p.box(0.36, 0.28, 0.36, x0 - 0.62, y0, z0 + 0.05, C.cream);
  for (const x of [-0.14, 0, 0.14]) p.box(0.02, 0.28, 0.006, x0 - 0.62 + x, y0, z0 + 0.233, C.darkwood);
  p.box(0.36, 0.02, 0.006, x0 - 0.62, 0.14, z0 + 0.233, C.darkwood);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, 0.16, 0.006), x0 - 0.62 + s * 0.07, 0.14, z0 + 0.234, C.darkwood, 0, false, s * 0.6);
  roof(p, x0 - 0.62, 0.292, z0 + 0.05, { w: 0.36, d: 0.36, h: 0.2, color: 0x8a5a44, wall: C.cream, ry: Math.PI / 2, courses: true });
  // jardin clos : murets, allées, buis, fontaine, portail
  p.box(1.9, 0.006, 1.0, 0, y0, 0.45, 0x8fc47e);
  for (const [w, d, x, z] of [[1.9, 0.05, 0, 0.95], [0.05, 0.98, -0.95, 0.46], [0.05, 0.98, 0.95, 0.46]]) p.box(w, 0.1, d, x, y0, z, stone);
  p.box(0.2, 0.008, 0.9, 0, y0 + 0.006, 0.47, 0xe2d6bc); p.box(1.6, 0.008, 0.16, 0, y0 + 0.006, 0.5, 0xe2d6bc);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { hedge(p, sx * 0.5, 0.5 + sz * 0.25, 0.5, 0.2, 0.06, 0.02); p.sphere(0.04, sx * 0.5, 0.06, 0.5 + sz * 0.25, 0x5f9a4a, 0, 1.2); }
  p.cyl(0.13, 0.14, 0.05, 12, 0, y0, 0.5, stone); p.cyl(0.11, 0.11, 0.008, 12, 0, 0.06, 0.5, C.water); p.cyl(0.015, 0.02, 0.12, 6, 0, 0.06, 0.5, stone); p.cyl(0.04, 0.03, 0.02, 8, 0, 0.18, 0.5, stone);
  for (const s of [-1, 1]) { p.box(0.07, 0.2, 0.07, s * 0.14, y0, 0.95, stone); p.sphere(0.03, s * 0.14, 0.24, 0.95, stone); }
  p.box(0.2, 0.14, 0.012, 0, y0, 0.95, C.darkwood);
  tree(p, 0.75, 0.25, 0.8); figure(p, -0.3, 0.68, 0x8a3a5a, 2.6); figure(p, 0.3, 0.3, 0x5a6a3a, -0.6);
}

/**
 * Grand port (3 × 3), le quai tourné vers l'eau (+z) : terre-plein dallé, haut mur de quai en pierre de taille qui descend
 * dans le bassin (bittes, défenses, échelles), jetée qui s'avance dans l'eau jusqu'à son phare ; au Moyen Âge, quai de
 * planches, grand entrepôt à colombages, grue à roue de marche, tonneaux, ballots et filets qui sèchent ; port de commerce
 * de l'âge industriel, entrepôts de brique, douane et son drapeau, grue à vapeur qui pivote sur ses rails, wagons, charbon ;
 * port à conteneurs ensuite, portique de quai au-dessus de l'eau, piles de conteneurs, grue mobile, capitainerie, camions
 */
function harborBig(p: Parts, age: number) {
  const y0 = 0.02, med = age <= 2, ind = age === 3;
  const ground = med ? 0xb8a890 : ind ? 0xaaa49a : 0xb8b4ac, joint = dark(ground, 0.86);
  p.box(2.96, 0.02, 2.96, 0, 0, 0, ground);
  for (let k = 1; k < 12; k++) { p.box(2.96, 0.004, 0.01, 0, 0.02, -1.48 + k * 0.247, joint); p.box(0.01, 0.004, 2.96, -1.48 + k * 0.247, 0.02, 0, joint); }
  // le mur de quai, en pierre de taille, qui descend dans le bassin ; la margelle, les bittes, les défenses, les échelles
  const wall = med ? 0x9a8a72 : 0xb8b0a0;
  p.box(2.96, 1.3, 0.1, 0, -1.28, 1.45, wall);
  stones(p, 0, 1.502, 2.96, -0.68, 0.02, 0, dark(wall, 0.92), 0.7, 240);
  // murs de soutènement tout autour (côtés et arrière) : là où le terrain descend, on voit la pierre et non le talus
  for (const s of [-1, 1]) { p.box(0.08, 1.3, 2.96, s * 1.44, -1.28, 0, wall); stones(p, s * 1.482, 0, 2.96, -0.5, 0.02, s * Math.PI / 2, dark(wall, 0.92), 0.6, 243 + s); }
  p.box(2.96, 1.3, 0.08, 0, -1.28, -1.44, wall); stones(p, 0, -1.482, 2.96, -0.5, 0.02, Math.PI, dark(wall, 0.92), 0.6, 245);
  p.box(2.98, 0.04, 0.16, 0, y0, 1.42, med ? C.wood : 0xd8d0c0);
  if (med) for (let x = -1.35; x <= 1.36; x += 0.3) p.cyl(0.03, 0.03, 0.7, 6, x, -0.66, 1.53, C.darkwood);
  for (let x = -1.3; x <= 1.31; x += 0.52) { p.cyl(0.03, 0.036, 0.06, 7, x, y0 + 0.04, 1.4, 0x3c3c40); p.cyl(0.04, 0.04, 0.014, 7, x, y0 + 0.1, 1.4, 0x3c3c40); }
  for (let x = -1.05; x <= 1.06; x += 0.52) {
    if (age >= 4) p.add(new THREE.TorusGeometry(0.045, 0.02, 5, 10), x, -0.08, 1.525, 0x2a2a2e);
    else p.box(0.06, 0.3, 0.03, x, -0.3, 1.52, C.darkwood);
  }
  for (const x of [-0.78, 0.78]) { for (const s of [-1, 1]) p.box(0.008, 0.6, 0.008, x + s * 0.035, -0.58, 1.515, 0x3c4a44); for (let k = 0; k < 6; k++) p.box(0.07, 0.008, 0.008, x, -0.55 + k * 0.1, 1.515, 0x3c4a44); }
  // la jetée qui s'avance dans l'eau, et son phare
  const jx = 1.28, jz0 = 1.5, jz1 = 2.85;
  p.box(0.3, 1.32, jz1 - jz0, jx, -1.3, (jz0 + jz1) / 2, wall);
  stones(p, jx - 0.151, (jz0 + jz1) / 2, jz1 - jz0, -0.68, 0.02, -Math.PI / 2, dark(wall, 0.92), 0.7, 241);
  p.box(0.32, 0.03, jz1 - jz0, jx, y0, (jz0 + jz1) / 2, med ? C.wood : 0xd8d0c0);
  for (let z = jz0 + 0.3; z < jz1 - 0.2; z += 0.45) { p.cyl(0.024, 0.03, 0.05, 7, jx - 0.12, y0 + 0.03, z, 0x3c3c40); }
  if (med) {
    p.cyl(0.12, 0.14, 0.5, 10, jx, y0, jz1 - 0.12, C.stone); p.cyl(0.13, 0.13, 0.04, 10, jx, 0.52, jz1 - 0.12, C.darkstone);
    p.cone(0.06, 0.12, 6, jx, 0.56, jz1 - 0.12, C.flame, true);
  } else {
    p.cyl(0.09, 0.12, 0.7, 12, jx, y0, jz1 - 0.12, C.white);
    for (const y of [0.18, 0.46]) p.cyl(0.11 - y * 0.03, 0.115 - y * 0.03, 0.12, 12, jx, y, jz1 - 0.12, 0xd84a3e);
    p.cyl(0.1, 0.1, 0.02, 12, jx, 0.72, jz1 - 0.12, 0x2a2a2e); p.cyl(0.06, 0.06, 0.1, 10, jx, 0.74, jz1 - 0.12, 0xfff0b0, true); p.cone(0.08, 0.08, 10, jx, 0.84, jz1 - 0.12, 0xd84a3e);
  }
  if (med) {
    // grand entrepôt à colombages, poulie de levage ; grue de bois à roue de marche qui tourne
    p.box(1.5, 0.44, 0.8, -0.55, y0, -0.85, C.cream);
    timbers(p, -0.55, -0.45, 1.5, 0.03, 0.45, 0, 9);
    roof(p, -0.55, 0.46, -0.85, { w: 1.5, d: 0.8, h: 0.36, color: 0x8a5a44, wall: C.cream, courses: true });
    for (const x of [-0.95, -0.15]) p.box(0.24, 0.28, 0.02, x, y0, -0.445, C.door);
    p.box(0.012, 0.012, 0.16, -0.55, 0.7, -0.4, C.darkwood); p.box(0.004, 0.3, 0.004, -0.55, 0.4, -0.33, 0x5a4636);
    p.box(0.08, 0.7, 0.08, 0.75, y0, 1.05, C.darkwood);
    p.add(new THREE.BoxGeometry(0.05, 0.05, 0.8), 0.75, 0.76, 1.3, C.darkwood, 0, false, 0, -0.45);
    p.box(0.005, 0.5, 0.005, 0.75, 0.5, 1.62, 0x5a4636); p.box(0.08, 0.06, 0.08, 0.75, 0.44, 1.62, 0xd9c4a0);
    const wh = spinner([0.58, 0.24, 0.98], [1, 0, 0], 0.6);
    wh.add(new THREE.TorusGeometry(0.2, 0.024, 4, 16).rotateY(Math.PI / 2), 0, 0, 0, C.wood);
    for (let k = 0; k < 4; k++) wh.add(new THREE.BoxGeometry(0.014, 0.4, 0.014), 0, 0, 0, C.darkwood, 0, false, 0, (k * Math.PI) / 4);
    for (const [x, z] of [[0.1, 0.9], [0.22, 1.02], [0.16, 0.78], [-0.3, 0.85], [-0.42, 0.95]]) { p.cyl(0.045, 0.045, 0.1, 8, x, y0, z, 0x9a6a44); for (const y of [0.04, 0.09]) p.cyl(0.047, 0.047, 0.008, 8, x, y, z, 0x6f5640); }
    for (const [x, z] of [[-0.8, 0.95], [-0.95, 1.05], [-0.88, 0.8]]) p.sphere(0.07, x, 0.08, z, 0xd9c4a0, 0, 0.8);
    // filets qui sèchent sur leurs perches, barques tirées sur le quai
    for (const x of [0.55, 1.1]) { for (const s of [-1, 1]) p.box(0.012, 0.28, 0.012, x + s * 0.2, y0, -0.1, C.darkwood); p.box(0.42, 0.012, 0.012, x, 0.29, -0.1, C.darkwood); p.box(0.38, 0.22, 0.006, x, 0.07, -0.1, 0x6a7a5a); }
    p.box(0.16, 0.06, 0.4, 1.1, y0, 0.4, 0x9a7452, 0.3);
  } else if (ind) {
    // deux entrepôts de brique, la douane et son drapeau ; voie ferrée du quai et ses wagons, grue à vapeur qui pivote
    const brick = 0xb4685c;
    for (const x of [-0.95, 0.05]) {
      p.box(0.85, 0.52, 0.75, x, y0, -0.95, brick);
      stones(p, x, -0.574, 0.85, y0, 0.52, 0, dark(brick, 0.86), 0.45, 242 + x * 10);
      roof(p, x, 0.54, -0.95, { w: 0.75, d: 0.85, h: 0.24, ry: Math.PI / 2, color: C.slate, wall: brick, courses: true });
      p.box(0.28, 0.34, 0.02, x, y0, -0.566, 0x3f5a4a);
      windows(p, [x - 0.28, x + 0.28], 0.32, -0.566, 0.07, 0.1, C.cream);
      p.box(0.4, 0.06, 0.01, x, 0.42, -0.562, 0x2c3e4a); for (let k = 0; k < 7; k++) p.box(0.03, 0.03, 0.004, x - 0.15 + k * 0.05, 0.435, -0.555, C.gold);
    }
    p.box(0.5, 0.42, 0.4, 1.05, y0, -1.0, 0xe8dcc4); roof(p, 1.05, 0.44, -1.0, { w: 0.5, d: 0.4, h: 0.16, color: C.slate, wall: 0xe8dcc4 });
    windows(p, [0.92, 1.18], 0.2, -0.796, 0.06, 0.1, C.white);
    p.cyl(0.005, 0.005, 0.4, 4, 1.25, 0.6, -1.0, C.metal); sway([1.25, 0.6, -1.0], [0, 1, 0], 0.45, 1.1).box(0.12, 0.07, 0.004, 0.06, 0.32, 0, 0x3a6ab8);
    for (const z of [0.95, 1.08]) p.box(2.9, 0.01, 0.016, 0, y0 + 0.002, z, 0x8a8e96);
    for (let k = 0; k < 24; k++) p.box(0.03, 0.006, 0.2, -1.42 + k * 0.124, y0, 1.015, C.darkwood);
    for (const x of [-1.0, -0.62]) { p.box(0.32, 0.14, 0.16, x, 0.04, 1.015, 0x5a3a2e); p.box(0.3, 0.06, 0.14, x, 0.18, 1.015, x < -0.8 ? 0x2a2826 : 0xb48a5e); for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 8).rotateZ(Math.PI / 2), x + s * 0.1, 0.03, 1.015 + 0.07, 0x2a2a2e); }
    p.box(0.3, 0.05, 0.3, 0.55, y0, 1.0, 0x3c3c40);
    const cr = spinner([0.55, 0.07, 1.0], [0, 1, 0], 0.22);
    cr.box(0.24, 0.22, 0.24, 0, 0, 0, 0x2c3e6a); cr.box(0.26, 0.02, 0.26, 0, 0.22, 0, 0x2a2a2e);
    cr.cyl(0.025, 0.03, 0.18, 6, -0.06, 0.24, -0.06, 0x2a2a2e);
    cr.add(new THREE.BoxGeometry(0.05, 0.05, 0.9), 0, 0.5, 0.4, 0xb8322c, 0, false, 0, -0.55);
    cr.box(0.005, 0.36, 0.005, 0, 0.46, 0.78, 0x2a2a2e); cr.box(0.08, 0.06, 0.08, 0, 0.4, 0.78, 0x9a6a44);
    for (const [x, z, r] of [[0.0, 0.45, 0], [-0.14, 0.4, 0.4], [-0.07, 0.56, 1], [-0.9, 0.4, 0.2], [-0.78, 0.52, 0.7]]) p.box(0.1, 0.09, 0.1, x, y0, z, 0xb48a5e, r);
    p.cone(0.18, 0.14, 8, 1.05, y0, 0.3, 0x2a2826);
    for (const s of [-1, 1]) lampPost(p, s * 0.4, 0.2, 0.34);
  } else {
    // port à conteneurs : portique de quai au-dessus de l'eau et son chariot, piles de conteneurs, grue mobile, capitainerie
    const cols = [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xf28a3c, 0x8a5ad8, 0xe8e4dc];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 1 + ((i * 7 + j * 3) % 3); k++)
      p.box(0.32, 0.12, 0.13, -1.05 + j * 0.36, y0 + k * 0.122, -1.25 + i * 0.16, cols[(i * 5 + j * 3 + k) % cols.length]);
    for (const x of [-0.6, 0.0]) for (const z of [0.75, 1.3]) p.box(0.05, 1.1, 0.05, x, y0, z, 0x3c7fd8);
    for (const x of [-0.6, 0.0]) p.box(0.06, 0.06, 1.6, x, 1.1, 1.5, 0x3c7fd8);
    p.box(0.66, 0.06, 0.06, -0.3, 1.1, 0.75, 0x3c7fd8); p.box(0.66, 0.08, 0.1, -0.3, 1.05, 1.3, 0x3c7fd8);
    p.box(0.66, 0.08, 0.14, -0.3, 1.03, 1.95, 0xf2c23a); p.box(0.005, 0.4, 0.005, -0.3, 0.63, 1.95, 0x2a2a2e); p.box(0.32, 0.12, 0.13, -0.3, 0.52, 1.95, 0xd84a3e);
    p.box(0.66, 0.012, 0.012, -0.3, 0.6, 0.75, 0x3c7fd8);
    p.box(0.3, 0.38, 0.3, 1.05, y0, -1.05, 0xf4f2ee); p.box(0.32, 0.08, 0.32, 1.05, 0.4, -1.05, C.glass, 0, true); p.box(0.34, 0.02, 0.34, 1.05, 0.48, -1.05, 0x3a6ab8);
    p.cyl(0.008, 0.01, 0.7, 5, 1.25, y0, -0.8, C.metal); sway([1.25, 0.66, -0.8], [0, 1, 0], 0.4, 1.1).box(0.1, 0.06, 0.004, 0.05, 0, 0, 0x3a6ab8);
    p.box(0.36, 0.06, 0.36, 0.75, y0, 0.6, 0x3c3c40);
    const cr = spinner([0.75, 0.08, 0.6], [0, 1, 0], 0.25);
    cr.box(0.22, 0.16, 0.22, 0, 0, 0, 0xf2c23a); cr.box(0.1, 0.12, 0.1, 0.06, 0.16, -0.06, 0x9fc4dc);
    cr.add(new THREE.BoxGeometry(0.035, 0.035, 1.0), 0, 0.5, 0.42, 0xf2c23a, 0, false, 0, -0.7);
    cr.box(0.004, 0.3, 0.004, 0, 0.56, 0.82, 0x2a2a2e);
    for (const [x, z, c] of [[0.6, -0.3, 0x3a6ab8], [0.25, 0.15, 0xd84a3e]] as number[][]) { p.box(0.14, 0.12, 0.16, x, y0, z + 0.2, c); p.box(0.14, 0.14, 0.34, x, y0, z - 0.06, cols[(x * 10) & 3]); for (const s of [-1, 1]) for (const dz of [0.24, -0.12]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateZ(Math.PI / 2), x + s * 0.07, 0.03, z + dz, 0x2a2a2e); }
  }
  // le long du quai : cabestans, cordages lovés, réverbères (torches au Moyen Âge) ; mât de signaux et ses pavillons au pied de la jetée
  for (const x of [-1.15, 0.2]) { p.cyl(0.04, 0.05, 0.08, 8, x, y0, 1.28, 0x5a4a3a); p.cyl(0.05, 0.05, 0.012, 8, x, y0 + 0.08, 1.28, 0x3c3c40); for (let k = 0; k < 4; k++) p.box(0.14, 0.01, 0.01, x, y0 + 0.06, 1.28, C.darkwood, (k * Math.PI) / 4); }
  for (const x of [-0.52, 0.72]) p.add(new THREE.TorusGeometry(0.035, 0.012, 4, 10).rotateX(Math.PI / 2), x, y0 + 0.012, 1.3, 0xc8b48a);
  for (const x of [-0.92, 0.0, 0.92]) {
    if (med) { p.cyl(0.012, 0.014, 0.32, 5, x, y0, 1.36, C.darkwood); p.cone(0.03, 0.06, 5, x, 0.34, 1.36, C.flame, true); }
    else lampPost(p, x, 1.36, 0.34);
  }
  p.cyl(0.008, 0.01, 0.62, 5, jx, y0, 1.38, C.darkwood); p.box(0.18, 0.01, 0.01, jx, 0.52, 1.38, C.darkwood);
  for (const [dx, y, c] of [[-0.07, 0.44, 0xd84a3e], [0.07, 0.42, 0xf2c23a], [0.07, 0.34, 0x3a6ab8]] as number[][]) sway([jx + dx, y + 0.06, 1.38], [1, 0, 0], 0.25, 0.9).box(0.004, 0.06, 0.07, 0, -0.03, 0.035, c);
  if (ind) {
    // petite locomotive de manœuvre sur les rails du quai, escalier de coupée sur roues, potence et sa caisse au-dessus de la
    // porte de l'entrepôt, piles de bois, sacs sur palettes
    const lx = 0.05, lz = 1.015;
    p.box(0.26, 0.11, 0.13, lx, 0.035, lz, 0x2a3a2e); p.cyl(0.05, 0.05, 0.18, 10, lx + 0.03, 0.12, lz, 0x2a2a2e); p.box(0.08, 0.12, 0.13, lx - 0.1, 0.12, lz, 0x2a3a2e);
    p.box(0.1, 0.02, 0.15, lx - 0.1, 0.24, lz, 0x1e1e22); p.cyl(0.018, 0.024, 0.09, 8, lx + 0.1, 0.2, lz, 0x1e1e22); smoke(lx + 0.1, 0.31, lz, 2);
    for (const dx of [-0.08, 0.02, 0.1]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10).rotateX(Math.PI / 2), lx + dx, 0.035, lz + s * 0.068, 0xb8322c);
    p.add(new THREE.BoxGeometry(0.14, 0.012, 0.3), -0.72, 0.12, 1.25, 0x8a8f96, 0, false, 0, 0.35);
    for (let k = 0; k < 5; k++) p.box(0.14, 0.01, 0.04, -0.72, 0.03 + k * 0.025, 1.12 + k * 0.035, 0x6a6f76);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 8).rotateZ(Math.PI / 2), -0.72 + s * 0.08, 0.02, 1.08, 0x2a2a2e);
    p.box(0.012, 0.012, 0.16, 0.05, 0.4, -0.5, C.darkwood); p.box(0.003, 0.12, 0.003, 0.05, 0.28, -0.43, 0x3a3030);
    sway([0.05, 0.28, -0.43], [1, 0, 0], 0.15, 0.6).box(0.06, 0.05, 0.06, 0, -0.06, 0, 0xb48a5e);
    for (let k = 0; k < 4; k++) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6).rotateZ(Math.PI / 2), -0.3, y0 + 0.022 + (k % 2) * 0.04, -0.2 + Math.floor(k / 2) * 0.05 + (k % 2) * 0.025, 0x9a7452);
    for (const [x, z] of [[0.3, -0.25], [0.45, -0.22]]) { p.box(0.14, 0.02, 0.12, x, y0, z, 0x8a6448); for (let k = 0; k < 4; k++) p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1.2, 0.75, 1), x - 0.03 + (k % 2) * 0.06, y0 + 0.04 + Math.floor(k / 2) * 0.035, z, 0xd9c4a0, k); }
    figure(p, -0.72, 0.95, 0x2c3e6a, Math.PI); figure(p, 0.3, 1.25, 0x5a6a7a, -1.2);
  }
  // dockers au travail, sacs à l'épaule
  for (const [x, z, c, r] of [[-0.2, 1.15, 0x5a6a7a, 0], [0.3, 0.7, 0x8a5a3a, 2.4], [-0.6, 0.35, 0x3a5a8a, -1.2], [1.0, 1.25, 0x6a4a3a, Math.PI]] as number[][]) {
    figure(p, x, z, age >= 4 ? 0xf28a3c : c, r);
    p.add(new THREE.IcosahedronGeometry(0.025, 0).scale(1.2, 0.8, 1), x + 0.02 * Math.cos(r), 0.2, z - 0.02 * Math.sin(r), 0xd9c4a0);
  }
}

// ---------------- Âge futuriste ----------------

/** Blanc nacré, verre bleu-vert (sombre, pour que l'eau des toits ne s'y trompe pas), acier, végétation, néons */
const F = {
  white: 0xf4f6f8, pearl: 0xe2e8ec, glass: 0x6e9ab0, glass2: 0x8aa8a4, smoke: 0x2e3e50, steel: 0x8a929c, dark: 0x3a4250,
  leaf: 0x6fc87a, leaf2: 0x58b068, neon: 0x5af0ff, pink: 0xff5ad8, mint: 0x7affc0, gold: 0xffd25a, warm: 0xfff1c9,
};
const NEONS = [F.neon, F.pink, F.mint, F.gold];

/** Anneau lumineux couché, de rayon r, à la hauteur y */
function neonRing(p: Parts, r: number, y: number, x: number, z: number, color: number, tube = 0.006) {
  p.add(new THREE.TorusGeometry(r, tube, 4, 28).rotateX(Math.PI / 2), x, y, z, color, 0, 'neon');
}

/** Jardin suspendu posé à la hauteur y : pelouse, arbustes ronds et un arbre */
function skyGarden(p: Parts, x: number, y: number, z: number, r: number, seed: number) {
  p.cyl(r, r, 0.014, 10, x, y, z, F.leaf2);
  for (let k = 0; k < 4; k++) { const a = seed + k * 1.57; p.sphere(0.028 + (k % 2) * 0.012, x + Math.cos(a) * r * 0.65, y + 0.03, z + Math.sin(a) * r * 0.65, k % 2 ? F.leaf : F.leaf2, 0, 0.8); }
  p.cyl(0.008, 0.01, 0.07, 5, x, y + 0.014, z, C.wood);
  p.sphere(0.05, x, y + 0.1, z, F.leaf, 0, 1.1);
}

/** Petit drone (rotors, ventre lumineux), dessiné en (x, y, z), cap `ry` ; une caisse sous le ventre s'il livre */
function drone(p: Parts, x: number, y: number, z: number, ry = 0, crate = false) {
  p.box(0.05, 0.016, 0.05, x, y, z, F.dark, ry);
  p.box(0.03, 0.006, 0.03, x, y - 0.006, z, F.neon, ry, 'neon');
  for (let k = 0; k < 4; k++) {
    const a = ry + Math.PI / 4 + k * Math.PI / 2, rx = x + Math.sin(a) * 0.04, rz = z + Math.cos(a) * 0.04;
    p.box(0.03, 0.006, 0.006, (x + rx) / 2, y + 0.006, (z + rz) / 2, F.steel, a + Math.PI / 2);
    p.cyl(0.018, 0.018, 0.003, 8, rx, y + 0.014, rz, 0xd8dce2);
  }
  if (crate) { p.box(0.008, 0.03, 0.008, x, y - 0.03, z, F.steel); p.box(0.04, 0.03, 0.04, x, y - 0.06, z, 0xd8b04a, ry); }
}

/** Un drone qui tourne autour de (x, z) à la hauteur y, à `r` du centre, un tour toutes les 1 / speed secondes */
function circlingDrone(x: number, y: number, z: number, r: number, speed: number, crate = false) {
  drone(turning([x, y, z], [0, 1, 0], speed), r, 0, 0, Math.PI, crate);
}

/** Enseigne holographique qui tourne lentement au-dessus d'un toit : le projecteur, et son panneau et son anneau de lumière */
function holoSign(x: number, y: number, z: number, s: number, color: number) {
  const q = turning([x, y, z], [0, 1, 0], 0.08);
  q.cyl(0.05 * s, 0.07 * s, 0.014, 12, 0, -0.03 * s, 0, F.white);
  q.cyl(0.04 * s, 0.04 * s, 0.004, 12, 0, -0.03 * s + 0.014, 0, color, 'neon');
  q.box(0.2 * s, 0.09 * s, 0.004, 0, 0.02 * s, 0, color, 0, 'neon');
  q.box(0.16 * s, 0.012 * s, 0.006, 0, 0.06 * s, 0, F.white, 0, 'neon');
  q.add(new THREE.TorusGeometry(0.13 * s, 0.005, 4, 24), 0, 0.065 * s, 0, color, 0, 'neon');
}

/** Fenêtres allumées la nuit sur une façade plane (normale de cap `ry`), au hasard réglé par `seed` */
function lights(p: Parts, cx: number, cz: number, ry: number, half: number, y0: number, y1: number, step: number, seed: number) {
  const ux = Math.cos(ry), uz = -Math.sin(ry);
  for (let y = y0; y < y1; y += step) for (let u = -half + 0.04; u < half - 0.02; u += 0.07) {
    if (Math.abs(Math.round(u * 40) * 7 + Math.round(y * 30) * 3 + seed) % 5 > 1) continue;
    p.box(0.045, 0.055, 0.005, cx + ux * u, y, cz + uz * u, F.warm, ry, true);
  }
}

/**
 * Socle commun des tours d'habitation : boutiques vitrées sur toute la largeur (les tours accolées forment une rue), auvent
 * blanc, liseré lumineux, enseigne ; jardinet devant quand la tour ne donne pas sur une route
 */
function towerPodium(p: Parts, o: ModelOpts, x0: number, x1: number, cx: number, d: number, zc: number, accent: number) {
  const w = x1 - x0, zf = zc + d / 2;
  p.box(w + 0.02, 0.03, d + 0.08, cx, 0, zc, 0xd8dde2);
  p.box(w, 0.2, d, cx, 0.03, zc, F.pearl);
  p.box(w * 0.86, 0.13, 0.012, cx, 0.05, zf + 0.004, F.glass, 0, true);
  p.box(w + 0.02, 0.016, 0.1, cx, 0.2, zf + 0.04, F.white);
  p.box(w, 0.006, 0.006, cx, 0.196, zf + 0.09, accent, 0, 'neon');
  p.box(0.16, 0.03, 0.006, cx + w * 0.22, 0.215, zf + 0.004, accent, 0, 'neon');
  p.box(0.09, 0.16, 0.014, cx - w * 0.28, 0.03, zf + 0.006, F.smoke);
  if (!o.F) {
    p.box(w * 0.9, 0.006, 0.12, cx, 0.03, zf + 0.12, 0x8fcf7e);
    hedge(p, cx + w * 0.2, zf + 0.17, w * 0.4, 0.04, 0.05, 0.03);
    tree(p, cx - w * 0.3, zf + 0.16, 0.6, F.leaf);
  }
}

/**
 * Flèche d'un gratte-ciel : socle blanc, mât effilé cerclé d'anneaux lumineux de plus en plus petits, feu rouge à la pointe.
 * Les plus hautes tours se reconnaissent de loin, la nuit aussi
 */
function spire(p: Parts, x: number, y: number, z: number, h: number, accent: number) {
  p.cyl(0.07, 0.09, 0.06, 8, x, y, z, F.white);
  p.cyl(0.008, 0.04, h, 8, x, y + 0.06, z, F.pearl);
  for (let k = 0; k < 3; k++) neonRing(p, 0.06 - k * 0.014, y + 0.14 + k * h * 0.22, x, z, accent, 0.005);
  p.sphere(0.016, x, y + h + 0.07, z, 0xff4a3a);
}

/**
 * Tour d'habitation futuriste, trois allures : tour ronde aux balcons blancs en anneaux, plantés un étage sur trois, et son
 * jardin sur le toit ; tour en quinconce aux étages qui tournent l'un sur l'autre, terrasses plantées et aire des drones ;
 * tour à ailerons courbes et jardin suspendu à mi-hauteur. Toutes sur un socle de boutiques ; les gratte-ciel portent une flèche
 */
function futureHouse(p: Parts, o: ModelOpts) {
  const x0 = -0.36 - (o.L ? 0.14 : 0), x1 = 0.36 + (o.R ? 0.14 : 0);
  const w = x1 - x0, cx = (x0 + x1) / 2, d = 0.5, zc = -0.04;
  // la hauteur suit le rang de la tour dans la ligne d'horizon (immeuble bas, tour, grande tour, gratte-ciel), nuancée d'une
  // maison à l'autre : plus de rangées de clones à la même hauteur
  const tier = o.tier ?? 1, H = [1.3, 1.85, 2.55, 3.4][tier] + ((o.v >> 1) % 3) * 0.1;
  const kind = o.v % 3, accent = NEONS[(o.v >> 1) % 4], y0 = 0.23;
  towerPodium(p, o, x0, x1, cx, d, zc, accent);
  if (kind === 0) {
    // les gratte-ciel s'affinent en gradins vers le haut
    const r0 = 0.21, step = tier === 3 ? y0 + (H - y0) * 0.62 : Infinity, rAt = (y: number) => (y > step ? r0 * 0.78 : r0);
    p.cyl(r0, r0, Math.min(H, step) - y0, 12, cx, y0, zc, F.glass);
    if (step < H) { p.cyl(r0 + 0.04, r0 + 0.04, 0.03, 12, cx, step, zc, F.white); p.cyl(r0 * 0.78, r0 * 0.78, H - step, 12, cx, step, zc, F.glass); }
    for (let y = y0 + 0.14, i = 0; y < H - 0.05; y += 0.15, i++) {
      const r = rAt(y);
      p.cyl(r + 0.055, r + 0.055, 0.02, 12, cx, y, zc, F.white);
      if ((i + o.v) % 3 === 0) for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; p.sphere(0.026, cx + Math.cos(a) * (r + 0.035), y + 0.035, zc + Math.sin(a) * (r + 0.035), F.leaf, 0, 0.8); }
      for (let k = 0; k < 8; k++) if ((k * 3 + i * 5 + o.v) % 7 < 2) { const a = k * 0.785 + 0.4; p.box(0.05, 0.07, 0.006, cx + Math.cos(a) * (r + 0.002), y - 0.1, zc + Math.sin(a) * (r + 0.002), F.warm, Math.PI / 2 - a, true); }
    }
    const r = rAt(H);
    p.cyl(r + 0.05, r + 0.04, 0.05, 12, cx, H, zc, F.white);
    neonRing(p, r + 0.05, H + 0.025, cx, zc, accent);
    if (tier === 3) spire(p, cx, H + 0.05, zc, 0.8, accent);
    else {
      skyGarden(p, cx, H + 0.05, zc, r, o.v);
      p.cyl(0.006, 0.012, 0.32, 5, cx + r * 0.55, H + 0.05, zc - 0.06, F.steel); p.sphere(0.012, cx + r * 0.55, H + 0.38, zc - 0.06, 0xff4a3a);
    }
  } else if (kind === 1) {
    const fw = Math.min(0.5, w * 0.72), fd = 0.38, n = Math.max(6, Math.round((H - y0) / 0.15));
    let top = y0;
    for (let i = 0; i < n; i++) {
      const y = y0 + i * 0.15, ry = Math.sin(i * 0.8 + o.v) * 0.32, dx = Math.sin(i * 1.3 + o.v) * 0.025;
      p.box(fw, 0.12, fd, cx + dx, y, zc, F.glass, ry);
      p.box(fw + 0.04, 0.03, fd + 0.04, cx + dx, y + 0.12, zc, F.white, ry);
      lights(p, cx + dx + Math.sin(ry) * (fd / 2 + 0.003), zc + Math.cos(ry) * (fd / 2 + 0.003), ry, fw / 2, y + 0.03, y + 0.06, 0.1, i * 7 + o.v);
      if (i % 3 === 1) for (const s of [-1, 1]) p.sphere(0.03, cx + dx + Math.cos(ry) * s * fw * 0.42, y + 0.17, zc - Math.sin(ry) * s * fw * 0.42, F.leaf, 0, 0.8);
      top = y + 0.15;
    }
    p.cyl(0.15, 0.15, 0.02, 12, cx, top, zc, F.dark);
    neonRing(p, 0.13, top + 0.024, cx, zc, accent, 0.005);
    if (tier === 3) spire(p, cx, top + 0.02, zc, 0.75, accent);
    else {
      p.box(0.012, 0.004, 0.08, cx - 0.03, top + 0.021, zc, F.white); p.box(0.012, 0.004, 0.08, cx + 0.03, top + 0.021, zc, F.white); p.box(0.06, 0.004, 0.012, cx, top + 0.021, zc, F.white);
      drone(p, cx + 0.07, top + 0.035, zc + 0.06, 0.5);
    }
  } else {
    const tw = Math.min(0.44, w * 0.6), td = 0.34, mid = y0 + (H - y0) * 0.55;
    p.box(tw, mid - 0.1 - y0, td, cx, y0, zc, F.glass);
    p.box(tw, H - mid - 0.05, td, cx, mid + 0.05, zc, F.glass);
    for (let y = y0 + 0.13; y < H - 0.02; y += 0.13) if (Math.abs(y - mid) > 0.12) p.box(tw + 0.012, 0.014, td + 0.012, cx, y, zc, F.white);
    lights(p, cx, zc + td / 2 + 0.004, 0, tw / 2, y0 + 0.04, H - 0.06, 0.13, o.v);
    // le jardin suspendu : dalle, colonnes blanches, arbres
    p.box(tw + 0.08, 0.03, td + 0.08, cx, mid - 0.1, zc, F.white);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.01, 0.01, 0.15, 6, cx + sx * tw * 0.45, mid - 0.07, zc + sz * td * 0.42, F.white);
    skyGarden(p, cx, mid - 0.07, zc, Math.min(tw, td) * 0.45, o.v);
    // ailerons courbes de part et d'autre, toit blanc, panneaux solaires
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, H - y0, 8, 1, false, s > 0 ? 0 : Math.PI, Math.PI).translate(0, (H - y0) / 2, 0), cx + s * tw / 2, y0, zc, F.white);
    p.box(tw + 0.03, 0.035, td + 0.03, cx, H, zc, F.white);
    if (tier === 3) spire(p, cx, H + 0.035, zc, 0.7, accent);
    else for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(tw * 0.38, 0.008, 0.14), cx - tw * 0.2 + k * tw * 0.4, H + 0.06, zc, 0x2a3a6a, 0, false, 0, -0.3);
    p.box(tw + 0.034, 0.006, 0.006, cx, H + 0.015, zc + td / 2 + 0.015, accent, 0, 'neon');
  }
}

/**
 * Tour de bureaux futuriste (dessinée pour une case, agrandie sur ses quatre) : les étages de verre tournent un peu l'un sur
 * l'autre et la tour s'affine en vrillant, nez de dalle blancs ; hall vitré sous son auvent courbe, parvis planté ; au
 * sommet l'anneau lumineux, la flèche et son feu, l'enseigne holographique qui tourne, un drone qui fait sa ronde
 */
function futureOffice(p: Parts, v: number, tier = 1) {
  // le nombre d'étages suit le rang de la tour dans la ligne d'horizon
  const n = [10, 14, 18, 22][tier] + (v % 3), glass = [0x5a8aa8, 0x4a8a9a, 0x6a88a8][v % 3], accent = [F.neon, F.pink, F.mint][v % 3];
  p.box(0.94, 0.012, 0.86, 0, 0, 0.04, 0xd8dde2);
  p.box(0.6, 0.13, 0.5, 0, 0.012, -0.02, F.smoke); p.box(0.58, 0.11, 0.504, 0, 0.022, -0.02, F.glass2, 0, true);
  p.add(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 14, 1, false, -Math.PI / 2, Math.PI), 0, 0.15, 0.23, F.white);
  let y = 0.14;
  for (let i = 0; i < n; i++) {
    const s = 0.52 - (i / n) * 0.14, ry = i * 0.05;
    p.box(s, 0.1, s, 0, y, -0.02, glass, ry);
    p.box(s + 0.025, 0.018, s + 0.025, 0, y + 0.1, -0.02, F.white, ry);
    for (let k = 0; k < 4; k++) {
      const a = ry + k * Math.PI / 2;
      lights(p, Math.sin(a) * (s / 2 + 0.003), -0.02 + Math.cos(a) * (s / 2 + 0.003), a, s / 2, y + 0.025, y + 0.05, 0.1, i * 3 + k + v);
    }
    y += 0.118;
  }
  neonRing(p, 0.27, y + 0.01, 0, -0.02, accent, 0.008);
  p.cyl(0.2, 0.26, 0.06, 4, 0, y, -0.02, F.white, false, n * 0.05 + Math.PI / 4);
  p.cyl(0.006, 0.022, 0.42, 6, 0, y + 0.06, -0.02, F.steel); p.sphere(0.014, 0, y + 0.49, -0.02, 0xff4a3a);
  holoSign(0, y + 0.16, -0.02, 1.1, accent);
  circlingDrone(0, y * 0.62, -0.02, 0.44, 0.07);
  // parvis : jardinières, arbres, bancs, arceaux
  for (const s of [-1, 1]) { p.box(0.16, 0.05, 0.07, s * 0.33, 0.012, 0.36, F.pearl); p.sphere(0.05, s * 0.33, 0.08, 0.36, F.leaf, 0, 0.8); tree(p, s * 0.4, 0.2, 0.55, F.leaf); }
  p.box(0.16, 0.02, 0.04, 0, 0.04, 0.4, F.white);
}

/**
 * Ferme hydroponique : dôme de verre aux arceaux blancs, tour de cultures en étagères sous leurs lampes roses, cuve d'eau,
 * caisses de récolte et le drone épandeur qui tourne au-dessus
 */
function futureFarm(p: Parts) {
  p.cyl(0.3, 0.32, 0.04, 14, -0.1, 0, -0.06, F.pearl);
  p.add(new THREE.SphereGeometry(0.28, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), -0.1, 0.04, -0.06, 0xd0ece4);
  for (let k = 0; k < 3; k++) p.add(new THREE.TorusGeometry(0.283, 0.007, 3, 16, Math.PI), -0.1, 0.04, -0.06, F.white, k * Math.PI / 3);
  neonRing(p, 0.3, 0.045, -0.1, -0.06, F.pink, 0.005);
  p.box(0.08, 0.13, 0.012, -0.1, 0.04, 0.22, F.smoke);
  // la tour de cultures : quatre étagères vertes sous leurs lampes
  const tx = 0.27, tz = 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.012, 0.56, 0.012, tx + sx * 0.09, 0, tz + sz * 0.09, F.white);
  for (let k = 0; k < 4; k++) {
    const y = 0.06 + k * 0.13;
    p.box(0.19, 0.012, 0.19, tx, y, tz, F.white);
    for (let j = 0; j < 3; j++) p.box(0.17, 0.03, 0.04, tx, y + 0.012, tz - 0.06 + j * 0.06, j % 2 ? F.leaf : F.leaf2);
    p.box(0.17, 0.006, 0.17, tx, y + 0.1, tz, F.pink, 0, 'neon');
  }
  p.box(0.21, 0.02, 0.21, tx, 0.56, tz, F.white);
  // cuve, panneaux solaires, caisses
  p.cyl(0.06, 0.06, 0.18, 10, 0.3, 0, -0.3, 0xc4cad2); p.cyl(0.062, 0.062, 0.012, 10, 0.3, 0.18, -0.3, F.steel);
  for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.2, 0.008, 0.1), -0.25 + k * 0.22, 0.1, 0.36, 0x2a3a6a, 0, false, 0, 0.35);
  for (let k = 0; k < 2; k++) { p.box(0.08, 0.04, 0.08, 0.05 + k * 0.1, 0, 0.36, 0xc8a060); p.box(0.07, 0.012, 0.07, 0.05 + k * 0.1, 0.04, 0.36, F.leaf); }
  circlingDrone(0, 0.6, 0, 0.32, 0.1);
}

/** Capteur de brume : mât blanc et ses deux filets qui boivent le brouillard, bassin d'eau claire cerclé de lumière */
function futureWell(p: Parts) {
  p.cyl(0.24, 0.26, 0.06, 14, 0, 0, 0, F.pearl);
  p.cyl(0.2, 0.2, 0.012, 14, 0, 0.05, 0, C.water);
  neonRing(p, 0.245, 0.062, 0, 0, F.neon, 0.006);
  p.cyl(0.018, 0.026, 0.72, 8, 0, 0.05, 0, F.white);
  for (const s of [-1, 1]) {
    p.box(0.004, 0.34, 0.2, s * 0.06, 0.3, 0, 0xd8e4ea, 0, false, s * 0.08);
    for (const y of [0.3, 0.64]) p.box(0.012, 0.012, 0.21, s * (0.06 + (y - 0.47) * 0.08), y, 0, F.steel);
  }
  p.cyl(0.04, 0.03, 0.04, 8, 0, 0.77, 0, F.white); p.sphere(0.02, 0, 0.82, 0, F.neon);
  p.box(0.04, 0.03, 0.04, 0.17, 0.06, 0.1, F.white); p.sphere(0.012, 0.17, 0.1, 0.1, C.water);
}

/** Luminaire holographique : mât fin, anneau de lumière qui flotte et son globe, socle lumineux */
function futureLamp(p: Parts) {
  p.cyl(0.04, 0.05, 0.03, 8, 0, 0, 0, F.white);
  p.cyl(0.012, 0.018, 0.56, 6, 0, 0.03, 0, F.white);
  p.add(new THREE.TorusGeometry(0.07, 0.008, 4, 16).rotateX(Math.PI / 2), 0, 0.64, 0, F.neon, 0, 'neon');
  p.sphere(0.035, 0, 0.64, 0, 0xfaf6e6);
  p.add(new THREE.IcosahedronGeometry(0.03, 0), 0, 0.64, 0, 0xfaf6e6, 0, true);
  neonRing(p, 0.045, 0.031, 0, 0, F.neon, 0.004);
}

/**
 * Agora holographique : place ronde dallée de blanc, cercles lumineux, globe de lumière qui tourne sur son socle, bancs
 * courbes, arbres en bacs, habitants qui flânent et discutent
 */
function futureGather(p: Parts, o: ModelOpts) {
  p.cyl(0.44, 0.46, 0.02, 18, 0, 0, 0, F.pearl);
  for (const r of [0.2, 0.36]) neonRing(p, r, 0.022, 0, 0, NEONS[o.v % 4], 0.004);
  p.cyl(0.06, 0.08, 0.1, 10, 0, 0.02, 0, F.white);
  const g = turning([0, 0.3, 0], [0, 1, 0], 0.12);
  for (let k = 0; k < 4; k++) g.add(new THREE.TorusGeometry(0.12, 0.005, 4, 20), 0, 0, 0, F.neon, k * Math.PI / 4, 'neon');
  g.add(new THREE.TorusGeometry(0.12, 0.005, 4, 20).rotateX(Math.PI / 2), 0, 0, 0, F.neon, 0, 'neon');
  g.sphere(0.05, 0, 0, 0, F.mint);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.5;
    p.add(new THREE.TorusGeometry(0.3, 0.02, 4, 10, 0.7).rotateX(Math.PI / 2), 0, 0.05, 0, F.white, a);
    tree(p, Math.cos(a + 1) * 0.33, Math.sin(a + 1) * 0.33, 0.7, F.leaf);
    p.cyl(0.05, 0.05, 0.05, 8, Math.cos(a + 1) * 0.33, 0.02, Math.sin(a + 1) * 0.33, F.white);
  }
  for (const [x, z, c, r] of [[-0.18, 0.26, 0x9fe8f0, 0.4], [0.24, -0.12, 0xd8c8f4, 2.3], [0.06, 0.3, 0xf4f6f8, -0.3]] as number[][]) figure(p, x, z, c, r);
}

/**
 * Dôme des arts (dessiné pour une case, agrandi sur ses quatre) : trois coques blanches en éventail sur leur socle, verrières
 * fumées entre elles, liserés lumineux ; bassin miroir devant, arbres et parvis
 */
function futureTemple(p: Parts) {
  p.box(0.92, 0.04, 0.82, 0, 0, -0.04, F.pearl);
  for (const [x, z, r, a] of [[-0.2, -0.12, 0.3, 0.2], [0.08, -0.08, 0.25, -0.1], [0.3, -0.02, 0.18, -0.4]] as number[][]) {
    p.add(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI, 0, Math.PI / 2).scale(1, 1.5, 1.2), x, 0.04, z, F.white, a + Math.PI / 2);
    p.add(new THREE.CircleGeometry(r * 0.96, 10, 0, Math.PI).scale(1, 1.5, 1), x, 0.04, z, F.smoke, a + Math.PI * 1.5);
    p.add(new THREE.TorusGeometry(r, 0.006, 3, 14, Math.PI).scale(1, 1.5, 1), x, 0.04, z, F.neon, a + Math.PI / 2, 'neon');
  }
  p.box(0.6, 0.012, 0.2, 0, 0.04, 0.26, C.water);
  p.box(0.62, 0.02, 0.012, 0, 0.04, 0.36, F.white); p.box(0.62, 0.02, 0.012, 0, 0.04, 0.16, F.white);
  for (const s of [-1, 1]) tree(p, s * 0.4, 0.3, 0.6, F.leaf);
}

/**
 * Campus numérique : bâtiment en anneau blanc autour de sa cour plantée, bandeau de verre, tour de verre au grand écran
 * holographique, auvent solaire au-dessus de la pelouse, étudiants
 */
function futureSchool(p: Parts) {
  p.box(1.9, 0.012, 1.9, 0, 0, 0, 0xd8dde2);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = Math.cos(a) * 0.52, z = -0.12 + Math.sin(a) * 0.52;
    p.box(0.22, 0.32, 0.2, x, 0.012, z, k % 4 === 1 ? F.glass : F.white, Math.PI / 2 - a);
    p.box(0.226, 0.07, 0.21, x, 0.2, z, F.glass, Math.PI / 2 - a);
  }
  p.add(new THREE.RingGeometry(0.4, 0.64, 16).rotateX(-Math.PI / 2), 0, 0.332, -0.12, F.white);
  p.cyl(0.4, 0.4, 0.02, 16, 0, 0.012, -0.12, 0x8fcf7e);
  tree(p, -0.1, -0.15, 0.9, F.leaf); tree(p, 0.14, -0.02, 0.7, F.leaf2);
  neonRing(p, 0.62, 0.36, 0, -0.12, F.neon, 0.006);
  // la tour de verre et son écran
  p.box(0.3, 1.1, 0.3, 0.62, 0.012, 0.62, F.glass);
  for (let y = 0.15; y < 1.1; y += 0.15) p.box(0.31, 0.014, 0.31, 0.62, y, 0.62, F.white);
  p.box(0.34, 0.04, 0.34, 0.62, 1.11, 0.62, F.white);
  p.box(0.26, 0.16, 0.006, 0.62, 0.8, 0.775, F.neon, 0, 'neon'); p.box(0.18, 0.02, 0.008, 0.62, 0.88, 0.776, F.white, 0, 'neon');
  // auvent solaire et pelouse devant
  p.box(0.6, 0.006, 0.3, -0.45, 0.012, 0.72, 0x8fcf7e);
  for (const sx of [-1, 1]) p.cyl(0.012, 0.012, 0.32, 6, -0.45 + sx * 0.25, 0.012, 0.72, F.white);
  p.add(new THREE.BoxGeometry(0.62, 0.012, 0.32), -0.45, 0.33, 0.72, 0x2a3a6a, 0, false, 0, 0.12);
  for (const [x, z, c, r] of [[-0.55, 0.65, 0x9fe8f0, 0.2], [-0.35, 0.78, 0xd8c8f4, 2.5], [0.1, 0.75, 0xf4f6f8, 1]] as number[][]) figure(p, x, z, c, r);
}

/**
 * Arcologie (3 × 3) : trois gradins de verre en couronnes, chacun bordé de blanc et planté sur sa terrasse ; au centre la
 * grande tour aux nervures blanches, ses jardins suspendus, l'anneau lumineux et la flèche ; deux tours sœurs reliées par des
 * passerelles ; l'anneau du maglev à mi-hauteur sur ses pylônes, où file une rame ; des drones tout autour
 */
function arcology(p: Parts, v: number) {
  const accent = NEONS[v % 4];
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0xd8dde2);
  for (let i = 0; i < 3; i++) {
    const r = 1.3 - i * 0.27, y = 0.012 + i * 0.26;
    p.cyl(r, r, 0.22, 20, 0, y, 0, F.glass);
    for (let k = 0; k < 20; k++) if ((k + i * 3) % 4 === 0) { const a = (k / 20) * Math.PI * 2; p.box(0.08, 0.06, 0.006, Math.cos(a) * (r + 0.003), y + 0.08, Math.sin(a) * (r + 0.003), F.warm, Math.PI / 2 - a, true); }
    p.cyl(r + 0.03, r + 0.03, 0.04, 20, 0, y + 0.22, 0, F.white);
    p.cyl(r - 0.03, r - 0.03, 0.012, 20, 0, y + 0.26, 0, F.leaf2);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + i; p.sphere(0.05, Math.cos(a) * (r - 0.1), y + 0.3, Math.sin(a) * (r - 0.1), k % 2 ? F.leaf : F.leaf2, 0, 0.8); }
  }
  // la grande tour
  const H = 4.4, R = 0.4, y0 = 0.8;
  p.cyl(R * 0.82, R, H - y0, 14, 0, y0, 0, F.glass);
  for (let y = y0 + 0.2; y < H; y += 0.2) p.cyl(R - (y - y0) / (H - y0) * R * 0.18 + 0.012, R - (y - y0) / (H - y0) * R * 0.18 + 0.012, 0.016, 14, 0, y, 0, F.white);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.add(new THREE.BoxGeometry(0.05, H - y0, 0.1).translate(0, (H - y0) / 2, 0), Math.cos(a) * (R * 0.92), y0, Math.sin(a) * (R * 0.92), F.white, Math.PI / 2 - a); }
  for (let k = 0; k < 14; k++) for (let y = y0 + 0.1; y < H - 0.1; y += 0.2) if ((k * 5 + Math.round(y * 10) * 3 + v) % 6 < 2) { const a = (k / 14) * Math.PI * 2 + 0.2, rr = R - (y - y0) / (H - y0) * R * 0.18 + 0.002; p.box(0.06, 0.07, 0.005, Math.cos(a) * rr, y, Math.sin(a) * rr, F.warm, Math.PI / 2 - a, true); }
  for (const y of [2.0, 3.2]) {
    p.cyl(R + 0.12, R + 0.1, 0.04, 14, 0, y, 0, F.white);
    for (let k = 0; k < 8; k++) { const a = k * 0.785 + y; p.sphere(k % 3 ? 0.04 : 0.06, Math.cos(a) * (R + 0.04), y + 0.07, Math.sin(a) * (R + 0.04), k % 2 ? F.leaf : F.leaf2, 0, 1.1); }
  }
  p.cyl(0.18, R * 0.82 + 0.02, 0.18, 14, 0, H, 0, F.white);
  neonRing(p, R * 0.82 + 0.03, H + 0.02, 0, 0, accent, 0.012);
  p.cyl(0.01, 0.04, 0.8, 6, 0, H + 0.18, 0, F.steel); p.sphere(0.022, 0, H + 1.0, 0, 0xff4a3a);
  // les tours sœurs et leurs passerelles
  for (const [x, z, h] of [[-0.72, -0.45, 2.6], [0.66, 0.54, 2.1]]) {
    p.cyl(0.18, 0.2, h - 0.53, 10, x, 0.53, z, F.glass);
    for (let y = 0.72; y < h; y += 0.18) p.cyl(0.215, 0.215, 0.014, 10, x, y, z, F.white);
    p.cyl(0.22, 0.2, 0.08, 10, x, h, z, F.white); skyGarden(p, x, h + 0.08, z, 0.15, x);
    const yb = h * 0.62, len = Math.hypot(x, z) - R - 0.15, a = Math.atan2(x, z);
    p.add(new THREE.BoxGeometry(0.1, 0.08, len).translate(0, 0, len / 2), Math.sin(a) * R, yb, Math.cos(a) * R, F.white, a);
    p.add(new THREE.BoxGeometry(0.104, 0.04, len).translate(0, 0, len / 2), Math.sin(a) * R, yb + 0.02, Math.cos(a) * R, F.glass2, a, true);
  }
  // l'anneau du maglev, ses pylônes et sa rame
  const RM = 1.12, YM = 1.35;
  p.add(new THREE.TorusGeometry(RM, 0.03, 4, 40).rotateX(Math.PI / 2).scale(1, 0.6, 1), 0, YM, 0, F.white);
  neonRing(p, RM, YM - 0.02, 0, 0, F.neon, 0.006);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; p.cyl(0.025, 0.04, YM - 0.27, 6, Math.cos(a) * RM, 0.27, Math.sin(a) * RM, F.white); }
  const train = turning([0, YM + 0.04, 0], [0, 1, 0], 0.09);
  for (let k = 0; k < 3; k++) {
    const a = k * 0.13, x = Math.cos(a) * RM, z = Math.sin(a) * RM;
    train.add(new THREE.SphereGeometry(0.05, 8, 4).scale(1, 0.7, k === 0 ? 2.8 : 2.4), x, 0.02, z, F.white, -a);
    train.add(new THREE.BoxGeometry(0.09, 0.02, 0.18), x, 0.03, z, F.smoke, -a);
    train.add(new THREE.BoxGeometry(0.1, 0.006, 0.2), x, -0.005, z, F.neon, -a, 'neon');
  }
  circlingDrone(0, 2.95, 0, 1.2, 0.05, true);
  circlingDrone(0, 3.6, 0, 0.75, -0.07);
  holoSign(0.66, 2.42, 0.54, 1.3, accent);
  for (const [x, z, c, r] of [[1.25, 1.2, 0x9fe8f0, 0.4], [-1.2, 1.25, 0xd8c8f4, 2.3], [0.3, 1.38, 0xf4f6f8, -0.3], [-0.4, 1.36, 0xa8f0d0, 1.2]] as number[][]) figure(p, x, z, c, r);
}

/** Ferme verticale : tour de verre aux étages verts sous leurs lampes roses, éolienne et panneaux au sommet, drone de livraison */
function vfarm(p: Parts) {
  p.box(0.86, 0.012, 0.86, 0, 0, 0, 0xd8dde2);
  const n = 12, w = 0.5;
  for (let i = 0; i < n; i++) {
    const y = 0.012 + i * 0.16, ry = 0;
    p.box(w, 0.13, w, 0, y, -0.04, 0xa8c8b8, ry);
    for (const s of [-1, 1]) p.box(w * 0.86, 0.04, 0.03, 0, y + 0.02, -0.04 + s * (w / 2 - 0.005), i % 2 ? F.leaf : F.leaf2, ry);
    p.box(w * 0.9, 0.006, 0.01, 0, y + 0.1, -0.04 + w / 2 + 0.002, F.pink, ry, 'neon');
    p.box(w + 0.04, 0.03, w + 0.04, 0, y + 0.13, -0.04, F.white, ry);
  }
  const top = 0.012 + n * 0.16;
  const turbine = spinner([0, top + 0.2, -0.04], [0, 1, 0], 1.6);
  for (let k = 0; k < 3; k++) turbine.add(new THREE.BoxGeometry(0.012, 0.3, 0.06), Math.cos(k * 2.094) * 0.1, 0, Math.sin(k * 2.094) * 0.1, F.white, -k * 2.094, false, 0.25);
  p.cyl(0.012, 0.012, 0.36, 6, 0, top, -0.04, F.steel);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.18, 0.008, 0.36), s * 0.14, top + 0.04, -0.04, 0x2a3a6a, 0, false, s * 0.3);
  p.box(0.2, 0.12, 0.012, 0, 0.012, 0.215, F.smoke);
  for (let k = 0; k < 3; k++) { p.box(0.07, 0.05, 0.07, -0.28 + k * 0.09, 0.012, 0.34, 0xc8a060); p.box(0.06, 0.014, 0.06, -0.28 + k * 0.09, 0.062, 0.34, k % 2 ? 0xd84a3e : F.leaf); }
  circlingDrone(0, 1.2, -0.04, 0.42, 0.08, true);
}

/**
 * Centrale à fusion (3 × 3) : le tokamak dans sa halle ouverte, l'enceinte en anneau percée de hublots où brille le plasma,
 * les bobines aimantées qui l'enserrent ; deux tours de refroidissement qui fument, le poste de commande, les pylônes
 */
function fusion(p: Parts) {
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0xc8ccd0);
  const tx = -0.35, tz = -0.2, R = 0.62;
  // la halle : socle, colonnes, toit en anneau
  p.cyl(1.0, 1.04, 0.12, 20, tx, 0.012, tz, F.pearl);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; p.cyl(0.03, 0.03, 0.78, 6, tx + Math.cos(a) * 0.96, 0.13, tz + Math.sin(a) * 0.96, F.white); }
  p.add(new THREE.TorusGeometry(0.96, 0.07, 4, 24).rotateX(Math.PI / 2).scale(1, 0.6, 1), tx, 0.92, tz, F.white);
  neonRing(p, 0.96, 0.88, tx, tz, F.pink, 0.008);
  // l'enceinte en anneau, par tronçons, le plasma qui brille entre eux ; les bobines
  const ty = 0.42;
  p.add(new THREE.TorusGeometry(R, 0.07, 8, 40).rotateX(Math.PI / 2), tx, ty, tz, F.pink, 0, 'neon');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    p.add(new THREE.TorusGeometry(R, 0.15, 8, 6, (Math.PI * 2) / 8 * 0.72).rotateX(Math.PI / 2), tx, ty, tz, 0xd8dce2, -a);
    const b = a + (Math.PI * 2) / 8 * 0.86;
    p.add(new THREE.TorusGeometry(0.2, 0.03, 4, 12), tx + Math.cos(b) * R, ty, tz + Math.sin(b) * R, 0x3a6ab8, -b);
  }
  p.cyl(0.24, 0.3, 0.5, 12, tx, 0.13, tz, F.steel); p.cyl(0.12, 0.12, 0.08, 10, tx, 0.63, tz, F.dark);
  // tours de refroidissement et leur vapeur
  for (const [x, z] of [[1.05, -0.85], [1.05, 0.05]]) {
    p.cyl(0.22, 0.3, 0.9, 14, x, 0.012, z, 0xe8eaec);
    p.cyl(0.235, 0.22, 0.12, 14, x, 0.91, z, 0xd8dce0);
    p.cyl(0.302, 0.302, 0.03, 14, x, 0.1, z, 0xc4c8cc);
    smoke(x, 1.05, z, 0);
  }
  // poste de commande, transformateurs, pylônes et lignes
  p.box(0.8, 0.3, 0.36, -0.3, 0.012, 1.05, F.white); p.box(0.76, 0.12, 0.364, -0.3, 0.12, 1.05, F.glass, 0, true);
  p.box(0.82, 0.03, 0.38, -0.3, 0.31, 1.05, F.pearl); holoSign(-0.3, 0.42, 1.05, 1, F.pink);
  for (let k = 0; k < 3; k++) { p.box(0.14, 0.14, 0.12, 0.55 + k * 0.2, 0.012, 1.05, 0x8a929c); for (let j = 0; j < 3; j++) p.cyl(0.008, 0.008, 0.06, 5, 0.51 + k * 0.2 + j * 0.04, 0.15, 1.05, 0xd8c8a8); }
  for (const z of [0.55, 1.25]) { p.box(0.03, 0.9, 0.03, 1.35, 0.012, z, F.steel); p.box(0.3, 0.02, 0.02, 1.35, 0.85, z, F.steel); }
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 3).rotateX(Math.PI / 2), 1.35 + s * 0.14, 0.84, 0.9, 0x3c3c40);
  for (const [x, z, c, r] of [[0.2, 1.35, 0xf4f6f8, 0.5], [-0.7, 1.35, 0x9fe8f0, -0.4]] as number[][]) figure(p, x, z, c, r);
}

/** Où se dresse la fusée sur le pas de tir du cosmodrome (repère du modèle) : la scène de lancement l'y pose */
export const SPACEPAD: [number, number, number] = [-0.85, 0.13, -0.75];

/**
 * Cosmodrome (4 × 4) : le pas de tir octogonal et sa tranchée des flammes, la tour de lancement en treillis et ses bras,
 * les paratonnerres, les sphères d'ergols ; le grand hall d'assemblage où l'on devine la prochaine fusée par sa porte
 * ouverte ; une fusée-sonde sur le petit pas de tir ; le centre de contrôle et ses paraboles ; la route des convois
 */
function spaceport(p: Parts) {
  p.box(3.92, 0.012, 3.92, 0, 0, 0, 0xb8bcc0);
  p.box(0.42, 0.006, 2.6, 0.15, 0.012, 0.6, 0x5a5e64);
  p.box(1.8, 0.006, 0.42, -0.6, 0.012, -0.25, 0x5a5e64);
  for (let z = -0.6; z < 1.9; z += 0.25) p.box(0.02, 0.002, 0.1, 0.15, 0.019, z, 0xf2f2f2);
  // le pas de tir
  const [px, , pz] = SPACEPAD;
  p.cyl(0.62, 0.7, 0.13, 8, px, 0.012, pz, 0xd0d2d4, false, Math.PI / 8);
  p.box(0.3, 0.14, 0.9, px - 0.62, 0, pz, 0x4a4e54); p.box(0.22, 0.02, 0.86, px - 0.62, 0.13, pz, 0x2a2a2e);
  p.cyl(0.15, 0.15, 0.012, 10, px, 0.142, pz, 0x3a3a3e);
  neonRing(p, 0.62, 0.145, px, pz, F.gold, 0.006);
  // la tour de lancement : quatre montants, croisillons, bras ombilicaux, la grue au sommet
  const tx = px + 0.4, tz = pz - 0.04, TH = 2.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.022, TH, 0.022, tx + sx * 0.08, 0.14, tz + sz * 0.08, 0xc8443a);
  for (let y = 0.3; y < TH; y += 0.22) {
    for (const sz of [-1, 1]) p.box(0.18, 0.012, 0.012, tx, y, tz + sz * 0.08, 0xd8d8d8);
    for (const sx of [-1, 1]) p.box(0.012, 0.012, 0.18, tx + sx * 0.08, y, tz, 0xd8d8d8);
    p.add(new THREE.BoxGeometry(0.008, 0.25, 0.008), tx - 0.08, y + 0.1, tz, 0xd8d8d8, 0, false, 0, 0.6);
  }
  for (const [y, len] of [[0.9, 0.3], [1.35, 0.3], [1.75, 0.26]]) { p.box(len, 0.04, 0.05, tx - len / 2 - 0.06, y, tz, 0x9aa0a8); p.box(0.03, 0.06, 0.06, tx - len - 0.06, y - 0.01, tz, F.dark); }
  p.box(0.22, 0.05, 0.22, tx, TH + 0.14, tz, 0xc8443a); p.box(0.5, 0.03, 0.03, tx - 0.15, TH + 0.2, tz, 0xd8d8d8);
  p.sphere(0.02, tx, TH + 0.24, tz, 0xff4a3a);
  for (const [x, z] of [[px - 0.55, pz - 0.55], [px + 0.5, pz + 0.55], [px - 0.5, pz + 0.6]]) { p.cyl(0.008, 0.016, 2.0, 5, x, 0.012, z, 0xd8d8d8); p.sphere(0.014, x, 2.02, z, 0xff4a3a); }
  for (const [x, z] of [[px + 0.15, pz + 0.95], [px + 0.45, pz + 0.95]]) { p.sphere(0.13, x, 0.24, z, F.white, 1); for (const s of [-1, 1]) p.box(0.012, 0.13, 0.012, x + s * 0.08, 0.012, z, F.steel); }
  // le hall d'assemblage : porte ouverte sur la prochaine fusée
  const hx = 1.0, hz = -1.0;
  p.box(0.96, 0.006, 0.86, hx, 0.012, hz, 0x4a4e54);
  p.box(1.0, 1.7, 0.05, hx, 0.012, hz - 0.425, 0x8a929c);
  for (const s of [-1, 1]) p.box(0.05, 1.7, 0.9, hx + s * 0.475, 0.012, hz, F.white);
  p.box(0.27, 1.7, 0.05, hx - 0.385, 0.012, hz + 0.425, F.white); p.box(0.33, 1.7, 0.05, hx + 0.335, 0.012, hz + 0.425, F.white);
  p.box(0.42, 0.26, 0.05, hx - 0.04, 1.45, hz + 0.425, F.white);
  // l'étage sur son berceau, les passerelles de travail
  p.cyl(0.13, 0.13, 0.9, 14, hx - 0.04, 0.1, hz - 0.05, F.white);
  for (const y of [0.3, 0.75]) p.cyl(0.132, 0.132, 0.06, 14, hx - 0.04, y, hz - 0.05, 0x26262a);
  for (const [bx, bz] of [[0, 0], [0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) p.cyl(0.015, 0.04, 0.08, 8, hx - 0.04 + bx, 0.02, hz - 0.05 + bz, 0x3c3c40);
  for (const y of [0.55, 1.05]) for (const s of [-1, 1]) p.box(0.2, 0.02, 0.3, hx - 0.04 + s * 0.25, y, hz - 0.05, 0xf2c23a);
  for (let y = 0.25; y < 1.7; y += 0.25) for (const s of [-1, 1]) p.box(0.006, 0.012, 0.9, hx + s * 0.501, y, hz, F.pearl);
  p.box(0.3, 0.3, 0.006, hx + 0.32, 1.25, hz + 0.453, 0x3a6ab8); p.box(0.22, 0.05, 0.007, hx + 0.32, 1.38, hz + 0.454, F.white);
  p.box(1.02, 0.04, 0.92, hx, 1.71, hz, 0xd8dde2);
  p.box(0.24, 0.006, 0.006, hx + 0.32, 1.08, hz + 0.455, F.neon, 0, 'neon');
  // la fusée-sonde sur le petit pas de tir
  const sx = 1.35, sz = 0.95;
  p.cyl(0.2, 0.22, 0.06, 8, sx, 0.012, sz, 0xd0d2d4);
  drawRocket(p, 'probe', sx, 0.07, sz);
  for (const s of [-1, 1]) p.box(0.02, 0.9, 0.02, sx + s * 0.13, 0.07, sz, F.steel);
  // le centre de contrôle et ses paraboles
  const cx = -0.8, cz = 1.15;
  p.box(1.1, 0.34, 0.5, cx, 0.012, cz, F.white); p.box(1.06, 0.14, 0.504, cx, 0.15, cz, F.glass, 0, true);
  p.add(new THREE.CylinderGeometry(0.26, 0.26, 1.1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.3, 1), cx, 0.35, cz, F.pearl);
  for (const [x, a] of [[cx - 0.3, 0.6], [cx + 0.3, -0.5]]) {
    p.cyl(0.012, 0.02, 0.18, 6, x, 0.42, cz - 0.05, F.steel);
    p.add(new THREE.SphereGeometry(0.13, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(Math.PI).rotateX(-0.8), x, 0.72, cz - 0.05, F.white, a);
  }
  holoSign(cx, 0.6, cz + 0.3, 1.1, F.neon);
  for (const [x, z, c, r] of [[cx - 0.2, cz + 0.4, 0xf4f6f8, 0], [cx + 0.25, cz + 0.42, 0x9fe8f0, 0.5], [0.5, 0.3, 0xf2c23a, 1.8]] as number[][]) figure(p, x, z, c, r);
}

/**
 * Institut de recherche : anneau blanc des laboratoires autour d'une sphère de verre sur sa tige, où tourne l'ordinateur
 * quantique dans ses anneaux de lumière ; parabole, pelouse, chercheurs
 */
function research(p: Parts) {
  p.box(1.9, 0.012, 1.9, 0, 0, 0, 0xd8dde2);
  p.cyl(0.5, 0.5, 0.012, 16, 0, 0.012, 0, 0x8fcf7e);
  p.add(new THREE.TorusGeometry(0.62, 0.14, 6, 28).rotateX(Math.PI / 2).scale(1, 0.9, 1), 0, 0.16, 0, F.white);
  p.add(new THREE.TorusGeometry(0.62, 0.142, 6, 28, Math.PI * 2).rotateX(Math.PI / 2).scale(1, 0.32, 1), 0, 0.16, 0, F.glass, 0, true);
  neonRing(p, 0.62, 0.29, 0, 0, F.neon, 0.008);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; p.box(0.12, 0.012, 0.5, Math.cos(a) * 0.3, 0.012, Math.sin(a) * 0.3, F.pearl, Math.PI / 2 - a); }
  p.cyl(0.04, 0.07, 0.5, 8, 0, 0.012, 0, F.white);
  p.sphere(0.26, 0, 0.72, 0, 0xd0ece4, 1);
  const q = turning([0, 0.72, 0], [0, 1, 0], 0.15);
  q.add(new THREE.TorusGeometry(0.33, 0.008, 4, 28), 0, 0, 0, F.neon, 0, 'neon');
  q.add(new THREE.TorusGeometry(0.33, 0.008, 4, 28), 0, 0, 0, F.pink, Math.PI / 2, 'neon');
  q.add(new THREE.TorusGeometry(0.36, 0.006, 4, 28).rotateX(Math.PI / 2), 0, 0, 0, F.mint, 0, 'neon');
  for (let k = 0; k < 3; k++) q.sphere(0.025, Math.cos(k * 2.094) * 0.36, 0, Math.sin(k * 2.094) * 0.36, F.white);
  p.cyl(0.012, 0.02, 0.3, 6, 0.75, 0.012, -0.7, F.steel);
  p.add(new THREE.SphereGeometry(0.16, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(Math.PI).rotateX(-0.9), 0.75, 0.42, -0.7, F.white, 0.8);
  for (const s of [-1, 1]) tree(p, s * 0.75, 0.72, 0.7, F.leaf);
  for (const [x, z, c, r] of [[0.3, 0.8, 0xf4f6f8, 0.4], [-0.25, 0.85, 0xf4f6f8, 2.8]] as number[][]) figure(p, x, z, c, r);
}

/**
 * Voiture volante (vers +z) : coque en goutte, verrière fumée, aileron, ceinture lumineuse, réacteurs arrière, patins qui
 * brillent dessous ; `stage` 0 = châssis nu et sa batterie, 1 = coque brute, 2 = finie ; `rz` l'incline dans les virages
 */
function flyCar(p: Parts, x: number, y: number, z: number, ry: number, body: number, stage = 2, rz = 0) {
  const put = (g: THREE.BufferGeometry, color: number, glow: boolean | 'neon' = false) => p.add(g, x, y, z, color, ry, glow, rz);
  for (const s of [-1, 1]) {
    put(new THREE.BoxGeometry(0.03, 0.014, 0.2).translate(s * 0.05, 0.007, 0), F.dark);
    put(new THREE.BoxGeometry(0.026, 0.004, 0.18).translate(s * 0.05, -0.001, 0), 0x9ff8ff, 'neon');
  }
  if (stage === 0) {
    put(new THREE.BoxGeometry(0.12, 0.016, 0.24).translate(0, 0.022, 0), F.steel);
    put(new THREE.BoxGeometry(0.09, 0.03, 0.08).translate(0, 0.045, -0.04), F.dark);
    put(new THREE.BoxGeometry(0.06, 0.004, 0.05).translate(0, 0.062, -0.04), F.mint, 'neon');
    for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 8).rotateX(Math.PI / 2).translate(s * 0.07, 0.04, -0.09), F.steel);
    return;
  }
  put(new THREE.SphereGeometry(0.1, 10, 6).scale(0.78, 0.42, 1.45).translate(0, 0.05, 0), stage === 1 ? 0xc4c8cc : body);
  put(new THREE.BoxGeometry(0.162, 0.01, 0.17).translate(0, 0.036, 0), stage === 1 ? F.steel : F.neon, stage === 1 ? false : 'neon');
  for (const s of [-1, 1]) {
    put(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 8).rotateX(Math.PI / 2).translate(s * 0.085, 0.05, -0.09), F.white);
    put(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 8).rotateX(Math.PI / 2).translate(s * 0.085, 0.05, -0.121), F.neon, stage === 2 ? 'neon' : false);
  }
  if (stage === 1) return;
  put(new THREE.SphereGeometry(0.06, 8, 5).scale(1, 0.75, 1.5).translate(0, 0.085, -0.012), 0x2a3a4e);
  put(new THREE.BoxGeometry(0.004, 0.035, 0.06).translate(0, 0.1, -0.12), body === F.white ? 0xe8553c : F.white);
  for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.04, 0.012, 0.006).translate(s * 0.04, 0.05, 0.142), F.warm, true);
}

/**
 * Bras robot de la chaîne : socle à liseré lumineux, deux segments blancs, rotules sombres et la pince où crépitent les
 * étincelles ; il plonge vers +z (dir 1) ou vers -z (dir -1) et se balance au rythme du travail
 */
function robotArm(p: Parts, x: number, z: number, y0: number, dir: number, freq: number) {
  p.cyl(0.03, 0.04, 0.04, 8, x, y0, z, F.white);
  p.cyl(0.032, 0.032, 0.006, 8, x, y0 + 0.04, z, F.neon, 'neon');
  const A = swing([x, y0 + 0.05, z], [1, 0, 0], 0.2, freq), a1 = 0.45 * dir, a2 = 2.1 * dir;
  A.sphere(0.022, 0, 0, 0, F.dark);
  A.add(new THREE.BoxGeometry(0.026, 0.15, 0.026).translate(0, 0.075, 0), 0, 0, 0, F.white, 0, false, 0, a1);
  A.sphere(0.018, 0, 0.1355, 0.0652 * dir, F.dark);
  A.add(new THREE.BoxGeometry(0.02, 0.12, 0.02), 0, 0.1052, 0.117 * dir, F.white, 0, false, 0, a2);
  A.box(0.03, 0.02, 0.03, 0, 0.065, 0.1688 * dir, F.dark);
  A.add(new THREE.IcosahedronGeometry(0.012, 0), 0, 0.058, 0.178 * dir, F.gold, 0, 'neon');
}

/**
 * Usine de voitures volantes (2 × 2, âge futuriste) : la halle de montage sous sa voûte nacrée à nervures lumineuses, ouverte
 * sur la chaîne où les bras robots assemblent les voitures (châssis nu, coque brute, voiture finie) ; l'entrepôt des
 * batteries et son toit où se posent les drones de livraison ; la vitrine où une voiture tourne sur son plateau sous un
 * anneau suspendu ; les aires de stationnement lumineuses ; le circuit d'essai aérien, où deux voitures tournent en sens
 * contraire autour du pylône et passent dans leurs anneaux
 */
function skyCarworks(p: Parts) {
  p.box(1.94, 0.012, 1.94, 0, 0, 0, 0xd8dde2);
  const y0 = 0.012;
  // la halle : murs, sol, voûte et ses nervures, poutre de façade à liseré, piliers
  const hx = -0.3, hz = -0.625, W = 1.3, D = 0.65, H = 0.34;
  p.box(W, H, 0.06, hx, y0, -0.92, F.white);
  for (const x of [hx - W / 2 + 0.03, hx + W / 2 - 0.03]) p.box(0.06, H, D, x, y0, hz, F.white);
  p.box(W - 0.06, 0.006, D - 0.04, hx, y0, hz, 0xc4cad2);
  p.add(new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.02, W + 0.02, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.4, 1), hx, y0 + H, hz, F.pearl);
  for (let k = 0; k < 5; k++) p.add(new THREE.TorusGeometry(D / 2 + 0.021, 0.005, 3, 18, Math.PI).rotateY(Math.PI / 2).scale(1, 0.4, 1), hx - 0.52 + k * 0.26, y0 + H + 0.001, hz, F.neon, 0, 'neon');
  p.box(W, 0.035, 0.035, hx, y0 + H - 0.03, -0.3, F.white);
  p.box(W, 0.006, 0.006, hx, y0 + H - 0.02, -0.281, F.pink, 0, 'neon');
  for (const x of [-0.6, -0.17, 0.2]) p.cyl(0.012, 0.012, H - 0.03, 6, x, y0, -0.31, F.white);
  // au fond de la halle, les écrans de contrôle de chaque poste
  for (const x of [-0.75, -0.38, -0.01]) { p.box(0.18, 0.09, 0.006, x, 0.17, -0.886, F.dark); p.box(0.15, 0.05, 0.004, x, 0.19, -0.882, [F.neon, F.mint, F.gold][Math.round((x + 0.75) / 0.37)], 0, 'neon'); }
  // la chaîne : le tapis et ses liserés, les trois postes (châssis, coque, voiture finie) et leurs bras robots
  const cz = -0.6;
  p.box(1.15, 0.03, 0.12, hx - 0.02, y0, cz, F.dark);
  for (const s of [-1, 1]) p.box(1.15, 0.006, 0.006, hx - 0.02, y0 + 0.03, cz + s * 0.063, F.neon, 0, 'neon');
  const stations: [number, number, number][] = [[-0.75, 0, F.white], [-0.38, 1, F.white], [-0.01, 2, 0xff7ab8]];
  stations.forEach(([x, stage, c], i) => {
    flyCar(p, x, y0 + 0.032, cz, Math.PI / 2, c, stage);
    robotArm(p, x - 0.04, cz - 0.17, y0, 1, 0.4 + i * 0.13);
    if (i < 2) robotArm(p, x + 0.05, cz + 0.17, y0, -1, 0.55 + i * 0.11);
  });
  holoSign(hx, 0.62, hz, 1.2, F.pink);
  // l'entrepôt des batteries : bloc nacré à vitrage éclairé, toit-hélistation des drones, piles de batteries devant
  const ex = 0.68, ez = -0.68;
  p.box(0.5, 0.22, 0.5, ex, y0, ez, F.pearl);
  p.box(0.44, 0.1, 0.006, ex, 0.07, ez + 0.253, F.glass, 0, true);
  for (let k = 0; k <= 4; k++) p.box(0.008, 0.1, 0.01, ex - 0.22 + k * 0.11, 0.07, ez + 0.256, F.steel);
  p.box(0.52, 0.02, 0.52, ex, y0 + 0.22, ez, F.white);
  p.cyl(0.17, 0.17, 0.01, 16, ex, y0 + 0.24, ez, F.dark);
  neonRing(p, 0.17, y0 + 0.252, ex, ez, F.mint, 0.005);
  drone(p, ex - 0.04, y0 + 0.27, ez + 0.02, 0.5);
  circlingDrone(0.15, 0.78, -0.45, 0.55, 0.07, true);
  for (const [x, z, n] of [[0.5, -0.33, 3], [0.62, -0.33, 2], [0.86, -0.36, 3]] as number[][]) for (let k = 0; k < n; k++) {
    p.box(0.09, 0.045, 0.07, x, y0 + k * 0.046, z, F.white);
    p.box(0.091, 0.008, 0.071, x, y0 + k * 0.046 + 0.02, z, F.mint, 0, 'neon');
  }
  // la vitrine : socle rond et son liseré, le plateau qui tourne et sa voiture, l'anneau suspendu sur ses trois mâts
  const vx = -0.55, vz = 0.4;
  p.cyl(0.3, 0.32, 0.05, 20, vx, y0, vz, F.pearl);
  neonRing(p, 0.305, y0 + 0.052, vx, vz, F.neon, 0.005);
  const T = turning([vx, y0 + 0.05, vz], [0, 1, 0], 0.06);
  T.cyl(0.21, 0.21, 0.012, 20, 0, 0, 0, F.white);
  flyCar(T, 0, 0.04, 0, 0.6, 0xffd25a);
  for (const a of [0.6, 2.7, 4.8]) p.cyl(0.01, 0.012, 0.42, 6, vx + Math.cos(a) * 0.29, y0 + 0.05, vz + Math.sin(a) * 0.29, F.white);
  p.add(new THREE.TorusGeometry(0.3, 0.022, 4, 32).rotateX(Math.PI / 2), vx, y0 + 0.48, vz, F.white);
  neonRing(p, 0.3, y0 + 0.46, vx, vz, F.pink, 0.005);
  p.box(0.004, 0.08, 0.12, vx + 0.34, y0 + 0.08, vz + 0.12, F.neon, 0.4, 'neon');
  p.cyl(0.012, 0.012, 0.08, 6, vx + 0.34, y0, vz + 0.12, F.white);
  // les aires de stationnement : galettes sombres cerclées de lumière, une voiture posée, une autre qui attend son pilote
  for (const [z, c] of [[0.12, 0x7affc0], [0.62, F.white]] as number[][]) {
    p.cyl(0.13, 0.13, 0.006, 18, -0.05, y0, z, 0x4a5260);
    neonRing(p, 0.125, y0 + 0.008, -0.05, z, F.gold, 0.004);
    flyCar(p, -0.05, y0 + 0.035, z, 0, c);
  }
  // le circuit d'essai aérien : l'aire et ses repères, le pylône et ses bagues de lumière, les bras et leurs anneaux, les deux
  // voitures qui tournent en sens contraire et s'inclinent dans le virage
  const tx = 0.5, tz = 0.42, R1 = 0.34, R2 = 0.24, h1 = 0.42, h2 = 0.72;
  p.cyl(0.38, 0.38, 0.006, 28, tx, y0, tz, 0x4a5260);
  neonRing(p, 0.36, y0 + 0.008, tx, tz, F.neon, 0.004);
  for (const r of [0, Math.PI / 2]) p.box(0.5, 0.002, 0.016, tx, y0 + 0.006, tz, F.white, r);
  p.cyl(0.024, 0.05, 1.0, 8, tx, y0, tz, F.white);
  for (const y of [0.25, 0.55, 0.85]) neonRing(p, 0.04 - y * 0.015, y, tx, tz, F.neon, 0.005);
  p.cyl(0.07, 0.05, 0.05, 10, tx, 1.0, tz, F.pearl); p.add(new THREE.IcosahedronGeometry(0.02, 1), tx, 1.07, tz, 0xff4a3a, 0, true);
  for (const [r, h, a] of [[R1, h1, 0], [R2, h2, Math.PI]] as number[][]) {
    const hxr = tx + Math.cos(a) * r, len = r - 0.03;
    p.box(len, 0.014, 0.014, tx + Math.cos(a) * (0.03 + len / 2), h - 0.06, tz, F.white);
    p.add(new THREE.TorusGeometry(0.1, 0.009, 4, 24), hxr, h + 0.05, tz, F.white);
    p.add(new THREE.TorusGeometry(0.1, 0.004, 4, 24), hxr, h + 0.05, tz + 0.004, F.pink, 0, 'neon');
  }
  flyCar(turning([tx, h1, tz], [0, 1, 0], 0.16), R1, 0, 0, Math.PI, 0xff5a5a, 2, -0.3);
  flyCar(turning([tx, h2, tz], [0, 1, 0], -0.12), R2, 0, 0, 0, 0x5aa8ff, 2, 0.3);
  // les abords : arbres en bacs, ingénieurs en blanc, un client devant la vitrine, le pilote d'essai qui salue
  for (const [x, z] of [[-0.9, 0.9], [0.9, -0.15]]) { p.cyl(0.05, 0.05, 0.05, 8, x, y0, z, F.white); tree(p, x, z, 0.55, F.leaf); }
  figure(p, -0.2, -0.2, F.white, 0.4);
  figure(p, 0.3, -0.18, F.white, -2.4);
  figure(p, -0.22, 0.88, 0x8a5ad8, -2.2);
  figure(p, -0.62, 0.82, 0x3a6ab8, Math.PI, false, 0x2a2420);
  figure(p, 0.12, 0.62, 0xf2c23a, -Math.PI / 2, false, 0x4a3426, 'cheer');
}

/**
 * Gare maglev : une vraie gare où s'arrêtent les trains des lignes (voie devant le quai, comme les autres gares) — quai de
 * béton clair sous sa voûte blanche à nervures lumineuses, quai d'en face et son abri ; hall vitré au toit courbe, panneau des
 * départs et enseigne holographique ; au coin, l'anneau suspendu de la navette maglev qui y tourne sans bruit autour de sa tour
 * d'ascenseur de verre
 */
function maglev(p: Parts) {
  sink(0.03);
  platformTrack(p, 0.03, true);
  farPlatform(p, true);
  p.box(1.9, 0.006, 0.03, 0, 0.11, 0.6, F.neon, 0, 'neon');
  // le quai principal, son liseré, sa voûte blanche et ses nervures lumineuses
  p.box(1.9, 0.08, 0.38, 0, 0.03, -0.03, F.pearl);
  p.box(1.9, 0.006, 0.03, 0, 0.11, 0.14, F.neon, 0, 'neon');
  for (const x of [-0.7, -0.1, 0.5]) p.cyl(0.012, 0.016, 0.24, 6, x, 0.11, -0.12, F.white);
  p.add(new THREE.CylinderGeometry(0.2, 0.2, 1.7, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.5, 1), 0, 0.35, -0.03, F.white);
  for (let k = 0; k < 6; k++) p.add(new THREE.TorusGeometry(0.2, 0.004, 3, 14, Math.PI).rotateY(Math.PI / 2).scale(1, 0.5, 1), -0.75 + k * 0.3, 0.351, -0.03, F.neon, 0, 'neon');
  for (const [x, c, r] of [[-0.55, 0x9fe8f0, Math.PI], [0.2, 0xd8c8f4, 0.2], [0.65, 0xf4f6f8, Math.PI]] as number[][]) actor(p, x, 0.11, -0.05, r, c);
  // le hall vitré, son toit courbe, son entrée, le panneau des départs, l'enseigne
  p.box(1.0, 0.32, 0.42, -0.45, 0.03, -0.62, F.white);
  p.box(0.92, 0.22, 0.006, -0.45, 0.07, -0.407, F.glass2, 0, true);
  for (let k = 0; k <= 6; k++) p.box(0.008, 0.22, 0.01, -0.91 + k * 0.153, 0.07, -0.404, F.steel);
  p.add(new THREE.CylinderGeometry(0.24, 0.24, 1.04, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.35, 1), -0.45, 0.35, -0.62, F.pearl);
  p.box(0.18, 0.18, 0.012, -0.45, 0.03, -0.4, F.smoke);
  p.box(0.3, 0.09, 0.008, -0.1, 0.2, -0.402, F.dark); for (let k = 0; k < 3; k++) p.box(0.26, 0.012, 0.009, -0.1, 0.22 + k * 0.022, -0.4, [F.gold, F.neon, F.mint][k], 0, 'neon');
  holoSign(-0.45, 0.5, -0.62, 1, F.neon);
  // l'anneau de la navette : ses pylônes évasés, la tour d'ascenseur de verre, la navette qui tourne
  const cx = 0.48, cz = -0.56, R = 0.3, Y = 0.68;
  p.add(new THREE.TorusGeometry(R, 0.03, 4, 32).rotateX(Math.PI / 2).scale(1, 0.55, 1), cx, Y, cz, F.white);
  neonRing(p, R, Y - 0.018, cx, cz, F.neon, 0.004);
  for (const a of [0.5, 2.6, -0.5, -1.6, -2.7]) p.cyl(0.016, 0.04, Y - 0.04, 6, cx + Math.cos(a) * R, 0.03, cz + Math.sin(a) * R, F.white);
  p.cyl(0.07, 0.07, Y + 0.06, 12, cx, 0.03, cz, F.glass2);
  for (let y = 0.15; y < Y; y += 0.12) p.cyl(0.072, 0.072, 0.01, 12, cx, y, cz, F.white);
  p.cyl(0.09, 0.09, 0.03, 12, cx, Y + 0.09, cz, F.white); neonRing(p, 0.09, Y + 0.12, cx, cz, F.pink, 0.004);
  const shuttle = turning([cx, Y + 0.03, cz], [0, 1, 0], 0.13);
  for (let k = 0; k < 3; k++) {
    const a = k * 0.3, x = Math.cos(a) * R, z = Math.sin(a) * R;
    shuttle.add(new THREE.SphereGeometry(0.04, 8, 4).scale(1, 0.75, k === 0 ? 2.5 : 2.1), x, 0.01, z, F.white, -a);
    shuttle.add(new THREE.BoxGeometry(0.082, 0.02, 0.14), x, 0.02, z, F.smoke, -a);
    shuttle.add(new THREE.BoxGeometry(0.085, 0.005, 0.15), x, -0.01, z, F.neon, -a, 'neon');
  }
  // les abords : arbres en bacs, bancs lumineux
  for (const x of [0.82, -0.9]) { p.cyl(0.05, 0.05, 0.05, 8, x, 0.03, -0.92, F.white); tree(p, x, -0.92, 0.6, F.leaf); }
  for (const x of [0.05, 0.9]) { p.box(0.14, 0.02, 0.04, x, 0.06, -0.92, F.white); p.box(0.14, 0.004, 0.006, x, 0.055, -0.9, F.mint, 0, 'neon'); }
}

/**
 * À l'âge futuriste, un bâtiment sans modèle à lui garde celui de l'époque moderne, rehaussé : liseré lumineux autour de son
 * pied, enseigne holographique qui tourne au-dessus du toit, et sur les grands bâtiments un drone qui fait sa ronde
 */
function futureExtras(p: Parts, kind: KindId, size: number) {
  if (!p.body.length) return;
  const box = new THREE.Box3(), b = new THREE.Box3();
  for (const g of p.body) { g.computeBoundingBox(); b.copy(g.boundingBox!); box.union(b); }
  const lim = size / 2 - 0.03, x0 = Math.max(-lim, box.min.x), x1 = Math.min(lim, box.max.x), z0 = Math.max(-lim, box.min.z), z1 = Math.min(lim, box.max.z);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, top = box.max.y, h = (kind.charCodeAt(0) * 7 + kind.length * 3) % 4, color = NEONS[h];
  if (box.min.y > -0.03 && kind !== 'pier' && kind !== 'harbor') {
    p.box(x1 - x0, 0.006, 0.008, cx, 0.014, z1, color, 0, 'neon'); p.box(x1 - x0, 0.006, 0.008, cx, 0.014, z0, color, 0, 'neon');
    p.box(0.008, 0.006, z1 - z0, x0, 0.014, cz, color, 0, 'neon'); p.box(0.008, 0.006, z1 - z0, x1, 0.014, cz, color, 0, 'neon');
  }
  const s = Math.min(1.4, 0.6 + size * 0.3);
  holoSign(cx, top + 0.08 * s, cz, s, color);
  if (size >= 2) circlingDrone(cx, Math.max(0.5, top * 0.8), cz, Math.max(x1 - x0, z1 - z0) * 0.55, 0.06 + h * 0.01);
}

/** Les bâtiments qui ont, à l'âge futuriste, un modèle à eux (les autres prennent celui de l'époque moderne, rehaussé) ; vrai s'il est dessiné */
function futureModel(p: Parts, kind: KindId, o: ModelOpts, size: number): boolean {
  switch (kind) {
    case 'house': futureHouse(p, o); return true;
    case 'workshop': futureOffice(p, o.v, o.tier); return true;
    case 'farm': futureFarm(p); return true;
    case 'well': futureWell(p); return true;
    case 'lamp': futureLamp(p); return true;
    case 'gather': futureGather(p, o); return true;
    case 'temple': futureTemple(p); return true;
    case 'school': if (size < 2) return false; futureSchool(p); return true;
    case 'arcology': arcology(p, o.v); return true;
    case 'vfarm': vfarm(p); return true;
    case 'fusion': fusion(p); return true;
    case 'spaceport': spaceport(p); return true;
    case 'research': research(p); return true;
    case 'maglev': maglev(p); return true;
    case 'carworks': skyCarworks(p); return true;
  }
  return false;
}

/** Tuyau droit de rayon r tendu entre deux points */
function pipe(p: Parts, a: V3, b: V3, r: number, color: number) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length();
  if (L < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, L, 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  p.add(g, A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2, color);
}

/** Tuyauterie qui suit une ligne brisée, un coude arrondi à chaque angle */
function pipeRun(p: Parts, pts: V3[], r: number, color: number) {
  for (let i = 1; i < pts.length; i++) {
    pipe(p, pts[i - 1], pts[i], r, color);
    if (i < pts.length - 1) p.sphere(r * 1.15, ...pts[i], color);
  }
}

/**
 * Puits de pétrole (1 case) : chevalet de pompage sur son massif de béton, au-dessus d'une tache de brut. Le balancier jaune
 * hoche sa tête de cheval rouge, la manivelle et ses contrepoids tournent contre le réducteur et son moteur ; tête de puits et
 * ses vannes, conduite vers la petite citerne, fûts, lampadaire, et le pétrolier en casque jaune
 */
function oilwell(p: Parts) {
  sink(0.012);
  const y0 = 0.012, steel = 0x5d6878, beam = 0xf2b23a, head = 0xd84a3e, iron = 0x3c3c40;
  // la tache de brut autour de la tête de puits, le massif de béton et le longeron d'acier
  p.add(new THREE.CircleGeometry(0.17, 10).rotateX(-Math.PI / 2).scale(1.4, 1, 1), 0.3, y0 + 0.002, 0.1, 0x1c1814);
  p.box(0.84, 0.03, 0.32, -0.03, y0, 0, 0xbdb8ae);
  p.box(0.8, 0.026, 0.1, -0.03, y0 + 0.03, 0, steel);
  const base = y0 + 0.056;
  // chevalet : deux montants en A et une jambe de force, le palier du balancier au sommet
  const px = -0.02, legH = 0.46, top = base + legH * Math.cos(0.21);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.024, legH, 0.024).translate(0, legH / 2, 0), px, base, s * 0.095, steel, 0, false, 0, -s * 0.21);
  p.add(new THREE.BoxGeometry(0.02, 0.48, 0.02).translate(0, 0.24, 0), px - 0.2, base, 0, steel, 0, false, -0.42);
  p.box(0.05, 0.03, 0.07, px, top - 0.02, 0, iron);
  // balancier : la poutre, sa tête de cheval (la bride, la barre et la tige polie qui plonge dans le puits), les bielles qui
  // descendent vers la manivelle
  const hx = 0.35, rx = -0.29, rod = hx + 0.05;
  const B = swing([px, top + 0.012, 0], [0, 0, 1], 0.18, 0.32);
  B.box(0.68, 0.045, 0.04, 0.03, -0.022, 0, beam);
  B.box(0.66, 0.008, 0.044, 0.03, 0.02, 0, dark(beam, 0.8));
  B.box(0.06, 0.025, 0.06, 0, -0.04, 0, iron);
  B.add(new THREE.BoxGeometry(0.06, 0.24, 0.052), hx, -0.04, 0, head, 0, false, 0.12);
  B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.054, 10).rotateX(Math.PI / 2), hx + 0.028, -0.15, 0, head);
  for (const s of [-1, 1]) B.box(0.005, 0.08, 0.005, rod, -0.27, s * 0.012, 0x2a2a2e);
  B.box(0.05, 0.012, 0.034, rod, -0.282, 0, iron);
  B.box(0.009, 0.2, 0.009, rod, -0.482, 0, 0xd8dde2);
  B.box(0.08, 0.03, 0.1, rx, -0.03, 0, iron);
  for (const s of [-1, 1]) B.box(0.014, 0.27, 0.012, rx, -0.3, s * 0.06, dark(steel, 0.9));
  // réducteur (le carter rond de la grande roue) et son moteur électrique, carter de courroie, sur le longeron
  const cx = rx + px, cy = base + 0.16;
  p.box(0.12, 0.11, 0.1, cx, base, 0, steel);
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10).rotateX(Math.PI / 2), cx, cy, 0, dark(steel, 0.85));
  p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8).rotateZ(Math.PI / 2), cx - 0.13, base + 0.04, 0.06, 0x3a6ab8);
  p.box(0.1, 0.07, 0.02, cx - 0.07, base + 0.02, 0.1, 0x9aa3ad);
  // manivelle : deux bras et leurs contrepoids qui tournent (un tour par coup de balancier)
  const T = turning([cx, cy, 0], [0, 0, 1], 0.32);
  T.add(new THREE.CylinderGeometry(0.016, 0.016, 0.17, 8).rotateX(Math.PI / 2), 0, 0, 0, iron);
  for (const s of [-1, 1]) {
    T.box(0.04, 0.19, 0.014, 0, -0.1, s * 0.072, 0x8a8f96);
    T.box(0.1, 0.05, 0.026, 0, -0.1, s * 0.072, 0x2a2a2e);
    T.box(0.096, 0.012, 0.028, 0, -0.06, s * 0.072, beam);
  }
  // tête de puits : tubage, croix de vannes à volants rouges, manomètre ; conduite vers la citerne
  const wx = px + rod;
  p.cyl(0.03, 0.034, 0.04, 8, wx, base, 0, 0x8a8f96);
  p.cyl(0.016, 0.016, 0.06, 8, wx, base + 0.04, 0, 0x9aa3ad);
  p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6).rotateX(Math.PI / 2), wx, base + 0.075, 0, 0x9aa3ad);
  for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.016, 0.005, 4, 8), wx, base + 0.075, s * 0.052, 0xd84a3e);
  p.sphere(0.012, wx - 0.03, base + 0.09, 0, C.white);
  pipeRun(p, [[wx, base + 0.075, 0.05], [wx, base + 0.075, 0.2], [wx, y0 + 0.02, 0.24], [-0.15, y0 + 0.02, 0.24], [-0.24, y0 + 0.02, 0.33]], 0.01, 0x6a6e74);
  // petite citerne de brut, son échelle
  p.cyl(0.08, 0.08, 0.2, 12, -0.32, y0, 0.33, 0xeceae4);
  p.cyl(0.082, 0.082, 0.022, 12, -0.32, y0 + 0.13, 0.33, 0x3a6ab8);
  p.cyl(0.06, 0.082, 0.025, 12, -0.32, y0 + 0.2, 0.33, 0xd8d4cc);
  p.box(0.012, 0.2, 0.03, -0.235, y0, 0.33, iron);
  // fûts bleus et rouge, lampadaire, le pétrolier en combinaison orange et casque jaune
  for (const [x, z, c] of [[0.06, 0.36, 0x3a6ab8], [0.13, 0.4, 0xd84a3e], [0.1, 0.3, 0x3a6ab8]] as number[][]) { p.cyl(0.028, 0.028, 0.075, 8, x, y0, z, c); p.cyl(0.029, 0.029, 0.006, 8, x, y0 + 0.07, z, dark(c, 0.7)); }
  lampPost(p, 0.42, -0.4, 0.3);
  figure(p, 0.25, 0.38, 0xf28a3c, -0.5, false, 0xf2c23a);
}

/** Grand réservoir de stockage : cuve blanche cerclée de couleur, toit en cône aplati et son garde-corps, escalier qui tourne autour */
function oilTank(p: Parts, x: number, z: number, r: number, h: number, y0: number, band = 0x3a6ab8) {
  p.cyl(r, r, h, 18, x, y0, z, 0xeceae4);
  p.cyl(r * 1.01, r * 1.01, 0.03, 18, x, y0 + h * 0.66, z, band);
  p.cyl(r * 0.78, r * 1.01, 0.05, 18, x, y0 + h, z, 0xd8d4cc);
  p.add(new THREE.TorusGeometry(r * 0.98, 0.004, 3, 18).rotateX(Math.PI / 2), x, y0 + h + 0.03, z, 0x8a8f96);
  for (let k = 0; k < 7; k++) {
    const a = 0.4 + k * 0.32;
    p.box(0.05, 0.008, 0.026, x + Math.cos(a) * (r + 0.014), y0 + 0.03 + (k / 6) * (h - 0.04), z + Math.sin(a) * (r + 0.014), 0x5d6878, Math.PI / 2 - a);
  }
}

/** Sphère de gaz sur ses pieds, et sa ceinture bleue */
function gasSphere(p: Parts, x: number, z: number, r: number, y0: number) {
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.cyl(0.012, 0.014, r * 1.3, 5, x + Math.cos(a) * r * 0.82, y0, z + Math.sin(a) * r * 0.82, 0x8a8f96); }
  p.sphere(r, x, y0 + r * 1.35, z, 0xf4f2ee, 2);
  p.add(new THREE.TorusGeometry(r, 0.008, 3, 18).rotateX(Math.PI / 2), x, y0 + r * 1.35, z, 0x3a6ab8);
}

/** Colonne de distillation : fût d'acier clair sur son socle, passerelles à garde-corps jaune, échelle, dôme et feu rouge au sommet */
function distillColumn(p: Parts, x: number, z: number, r: number, h: number, y0: number) {
  p.cyl(r * 1.3, r * 1.35, 0.06, 10, x, y0, z, 0x9d9890);
  p.cyl(r, r, h, 12, x, y0 + 0.06, z, 0xdfe3e8);
  p.sphere(r, x, y0 + 0.06 + h, z, 0xdfe3e8, 1, 0.6);
  for (let y = 0.3; y < h - 0.05; y += 0.28) {
    p.cyl(r + 0.05, r + 0.05, 0.012, 12, x, y0 + 0.06 + y, z, 0x5d6878);
    p.add(new THREE.TorusGeometry(r + 0.05, 0.004, 3, 14).rotateX(Math.PI / 2), x, y0 + 0.06 + y + 0.045, z, 0xf2c23a);
  }
  p.box(0.03, h, 0.008, x, y0 + 0.06, z + r + 0.012, 0x5d6878);
  p.box(0.018, 0.018, 0.018, x, y0 + 0.06 + h + r * 0.55, z, 0xff4a3a, 0, true);
}

/** Camion-citerne le long de x, la cabine rouge vers +x */
function tanker(p: Parts, x: number, z: number, y0: number) {
  p.box(0.42, 0.02, 0.1, x, y0 + 0.03, z, 0x3c3c40);
  p.box(0.12, 0.1, 0.13, x + 0.2, y0 + 0.03, z, 0xd84a3e);
  p.box(0.012, 0.05, 0.11, x + 0.262, y0 + 0.08, z, C.glass, 0, true);
  p.add(new THREE.CylinderGeometry(0.065, 0.065, 0.3, 12).rotateZ(Math.PI / 2), x - 0.05, y0 + 0.115, z, 0xeceef0);
  p.add(new THREE.CylinderGeometry(0.067, 0.067, 0.03, 12).rotateZ(Math.PI / 2), x - 0.05, y0 + 0.115, z, 0x3a6ab8);
  for (const wx of [x + 0.2, x - 0.06, x - 0.15]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateX(Math.PI / 2), wx, y0 + 0.03, z + s * 0.065, 0x2a2a2e);
}

/**
 * Raffinerie (3 × 3) : parc de grands réservoirs blancs dans leur cuvette de rétention et sphère de gaz, au fond à gauche ;
 * colonnes de distillation et leurs passerelles reliées par des tuyaux, four et ses cheminées qui fument, échangeurs, au
 * fond à droite ; rack de tuyaux de couleur qui court d'un bout à l'autre ; haute torchère haubanée et sa flamme qui danse ;
 * salle de contrôle vitrée, poste de chargement où un camion-citerne fait le plein, ouvriers casqués, lampadaires
 */
function refinery(p: Parts) {
  sink(0.012);
  const y0 = 0.012, steel = 0x5d6878;
  p.box(2.92, 0.012, 2.92, 0, 0, 0, 0xbdb8ae);
  // voie d'accès bitumée devant, ses tirets
  p.box(2.9, 0.006, 0.34, 0, y0, 1.22, 0x5d6169);
  for (let x = -1.3; x <= 1.31; x += 0.26) p.box(0.12, 0.003, 0.02, x, y0 + 0.006, 1.22, C.white);
  // parc de stockage : cuvette de rétention (muret), trois grands réservoirs, une sphère de gaz
  const bx = -0.78, bz = -0.78, bw = 1.3;
  for (const s of [-1, 1]) { p.box(bw, 0.05, 0.03, bx, y0, bz + (s * bw) / 2, 0xa8a49c); p.box(0.03, 0.05, bw, bx + (s * bw) / 2, y0, bz, 0xa8a49c); }
  p.box(bw - 0.03, 0.004, bw - 0.03, bx, y0, bz, 0xa29a8a);
  oilTank(p, -1.1, -1.1, 0.27, 0.42, y0);
  oilTank(p, -0.48, -1.1, 0.27, 0.42, y0, 0xd84a3e);
  oilTank(p, -1.1, -0.48, 0.22, 0.32, y0);
  gasSphere(p, -0.46, -0.46, 0.17, y0);
  // colonnes de distillation, reliées en haut par des tuyaux
  distillColumn(p, 0.45, -1.0, 0.1, 1.45, y0);
  distillColumn(p, 0.85, -1.15, 0.075, 1.05, y0);
  distillColumn(p, 1.2, -0.95, 0.065, 0.8, y0);
  pipeRun(p, [[0.55, y0 + 1.2, -1.0], [0.7, y0 + 1.2, -1.0], [0.79, y0 + 0.95, -1.12]], 0.014, 0xc4cad2);
  pipeRun(p, [[0.92, y0 + 0.7, -1.12], [1.05, y0 + 0.7, -1.12], [1.15, y0 + 0.6, -0.98]], 0.012, 0xf2c23a);
  // four de chauffe : caisson et ses deux cheminées qui fument ; échangeurs couchés sur leurs berceaux
  p.box(0.4, 0.32, 0.28, 0.75, y0, -0.45, 0x8a8f96);
  p.box(0.42, 0.03, 0.3, 0.75, y0 + 0.32, -0.45, steel);
  for (const x of [0.65, 0.85]) { p.cyl(0.03, 0.035, 0.45, 8, x, y0 + 0.35, -0.45, 0xa85e50); p.cyl(0.036, 0.036, 0.02, 8, x, y0 + 0.78, -0.45, 0x3c3c40); smoke(x, y0 + 0.82, -0.45, 2); }
  for (const z of [-0.55, -0.38]) {
    for (const x of [1.12, 1.36]) p.box(0.04, 0.06, 0.1, x, y0, z, 0x9d9890);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 10).rotateZ(Math.PI / 2), 1.24, y0 + 0.1, z, 0xd8dde2);
  }
  // rack de tuyaux de couleur, d'un bout à l'autre, et ce qui en part vers les réservoirs et les colonnes
  const rz = 0.02, rh = 0.3;
  for (let x = -1.2; x <= 1.31; x += 0.3) {
    for (const dz of [-0.08, 0.08]) p.box(0.025, rh, 0.025, x, y0, rz + dz, steel);
    for (const y of [0.18, rh - 0.02]) p.box(0.025, 0.02, 0.2, x, y0 + y, rz, steel);
  }
  [0xf2c23a, 0x4fa860, 0xd84a3e, 0xc4cad2, 0x3a6ab8].forEach((c, k) => pipe(p, [-1.32, y0 + rh + 0.016, rz - 0.07 + k * 0.035], [1.42, y0 + rh + 0.016, rz - 0.07 + k * 0.035], 0.014, c));
  for (const k of [0, 1]) pipe(p, [-1.32, y0 + 0.216, rz - 0.04 + k * 0.08], [1.42, y0 + 0.216, rz - 0.04 + k * 0.08], 0.016, k ? 0x8a8f96 : 0xc4cad2);
  pipeRun(p, [[0.41, y0 + rh + 0.016, -0.05], [0.41, y0 + rh + 0.016, -0.88], [0.41, y0 + 0.95, -0.88]], 0.014, 0xf2c23a);
  pipeRun(p, [[1.2, y0 + rh + 0.016, 0.02], [1.2, y0 + 0.45, -0.2], [1.2, y0 + 0.45, -0.86]], 0.012, 0x4fa860);
  pipeRun(p, [[-0.48, y0 + 0.05, -0.82], [-0.48, y0 + 0.05, -0.1], [-0.48, y0 + 0.216, -0.06]], 0.016, 0xc4cad2);
  pipeRun(p, [[-0.85, y0 + 0.05, -0.48], [-0.85, y0 + 0.05, -0.1], [-0.85, y0 + 0.216, -0.06]], 0.016, 0x8a8f96);
  // torchère : haut fût cerclé de rouge sur son trépied de poutrelles ; la flamme danse au sommet et fume
  const fx = -1.18, fz = 0.62, fh = 1.9;
  p.cyl(0.03, 0.04, fh, 6, fx, y0, fz, 0xc4cad2);
  for (const y of [0.35, 0.75, 1.15, 1.55]) p.cyl(0.042, 0.042, 0.08, 6, fx, y0 + y, fz, 0xd84a3e);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    pipe(p, [fx + Math.cos(a) * 0.24, y0, fz + Math.sin(a) * 0.24], [fx + Math.cos(a) * 0.035, y0 + 1.15, fz + Math.sin(a) * 0.035], 0.008, steel);
  }
  for (const y of [0.4, 0.8]) p.add(new THREE.TorusGeometry(0.24 - (0.205 * y) / 1.15, 0.005, 3, 6).rotateX(Math.PI / 2), fx, y0 + y, fz, steel);
  p.cyl(0.05, 0.035, 0.06, 8, fx, y0 + fh, fz, 0x3c3c40);
  p.box(0.02, 0.02, 0.02, fx + 0.04, y0 + 1.0, fz, 0xff4a3a, 0, true);
  const F = sway([fx, y0 + fh + 0.06, fz], [1, 0, 0], 0.18, 1.3);
  F.cyl(0.032, 0.032, 0.012, 6, 0, -0.006, 0, 0x3c3c40);
  F.add(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.8, 1), 0, 0.07, 0, 0xff7a2a, 0, true);
  F.cone(0.11, 0.36, 7, 0, 0.02, 0, 0xff8a3a, true);
  F.cone(0.08, 0.5, 6, 0.02, 0.04, -0.01, 0xffa040, true);
  F.cone(0.055, 0.34, 6, -0.01, 0.06, 0.01, 0xffe27a, true);
  for (const [a, h] of [[0.5, 0.24], [2.6, 0.2], [4.4, 0.27]]) F.add(new THREE.ConeGeometry(0.04, h, 5).translate(0, h / 2, 0), Math.cos(a) * 0.06, 0.08, Math.sin(a) * 0.06, 0xff9a3a, 0, true, -Math.cos(a) * 0.5, Math.sin(a) * 0.5);
  smoke(fx, y0 + fh + 0.6, fz, 2);
  // salle de contrôle : bandeau vitré, toit bleu, porte, antenne, enseigne à la goutte de pétrole
  p.box(0.62, 0.26, 0.34, 0.9, y0, 0.6, 0xeceef0);
  p.box(0.58, 0.08, 0.012, 0.92, y0 + 0.13, 0.774, C.glass, 0, true);
  p.box(0.64, 0.03, 0.36, 0.9, y0 + 0.26, 0.6, 0x3a6ab8);
  p.box(0.08, 0.12, 0.012, 0.68, y0, 0.774, 0x2a2a2e);
  p.cyl(0.006, 0.006, 0.22, 4, 1.12, y0 + 0.29, 0.52, 0x9aa3ad);
  p.box(0.26, 0.1, 0.016, 0.95, y0 + 0.29, 0.66, C.white);
  p.sphere(0.028, 0.86, y0 + 0.34, 0.672, 0x1c1814, 0, 1.3);
  p.box(0.12, 0.02, 0.004, 0.99, y0 + 0.33, 0.67, 0x3a6ab8);
  // poste de chargement : auvent jaune sur ses poteaux, bras de chargement, le camion-citerne qui fait le plein
  const lx = -0.25, lz = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.025, 0.3, 0.025, lx + sx * 0.3, y0, lz + sz * 0.2, steel);
  p.box(0.7, 0.025, 0.48, lx, y0 + 0.3, lz, 0xf2c23a);
  for (const sx of [-0.15, 0.15]) p.box(0.1, 0.01, 0.03, lx + sx, y0 + 0.29, lz, 0xfff4d8, 0, true);
  pipeRun(p, [[lx + 0.05, y0 + 0.216, 0.1], [lx + 0.05, y0 + 0.26, 0.5], [lx + 0.05, y0 + 0.2, 0.6]], 0.012, 0x6a6e74);
  tanker(p, lx, lz, y0);
  // ouvriers en combinaison et casque, lampadaires
  for (const [x, z, c, r] of [[-0.62, 0.98, 0xf28a3c, 0.6], [0.2, -0.22, 0xf28a3c, 2.2], [0.42, 0.95, 0x3a5a8a, Math.PI], [-0.05, 0.4, 0xf28a3c, -1.2]] as number[][]) figure(p, x, z, c, r, false, 0xf2c23a);
  for (const [x, z] of [[-0.7, 1.0], [0.3, 1.0], [1.38, -0.12], [-0.05, -0.2]]) lampPost(p, x, z, 0.34);
}


export function getModel(kind: KindId, age: number, o: ModelOpts): Model {
  const size = o.small ? KINDS[kind].size - 1 : KINDS[kind].size;
  const imported = importedModel(kind, age, o.v, size);
  if (imported) return imported;
  // (le bloc ne compte qu'au Moyen Âge, pour la couleur des toits ; le rang dans la ligne d'horizon, à l'âge futuriste)
  const key = kind === 'house' ? `${kind}|${age}|${o.v}|${+o.L}${+o.R}${+o.F}|${age === 2 ? o.row ?? '' : ''}|${age >= 5 ? o.tier ?? '' : ''}`
    : `${kind}|${age}|${o.v % 3}|${size}${age >= 5 && kind === 'workshop' ? `|${o.tier ?? ''}` : ''}`;
  let m = cache.get(key);
  if (m) return m;
  const p = new Parts();
  smokeOut = [];
  attachOut = [];
  sinkOut = 0;
  swayOut = [];
  crowdOut = [];
  mainParts = p;
  spinOut = null;
  vaneOut = null;
  // un modèle qui sera agrandi dessine ses personnages d'autant plus petits (voir lifeSize)
  lifeK = size === 2 && UPSCALE.includes(kind) ? 1 / UP : 1;
  // à l'âge futuriste : le modèle dessiné pour lui, sinon celui de l'époque moderne, rehaussé (voir futureExtras)
  const future = age >= 5 && futureModel(p, kind, o, size), extras = age >= 5 && !future;
  if (extras) age = 4;
  if (!future) switch (kind) {
    case 'house': house(p, age, o); break;
    case 'farm': farm(p, age); break;
    case 'pen': pen(p, age); break;
    case 'well': well(p, age); break;
    case 'workshop': workshop(p, age, o); break;
    case 'gather': gather(p, age, o); break;
    case 'temple': temple(p, Math.max(1, age)); break;
    case 'mill': mill(p, Math.max(2, age)); break;
    case 'landmark': landmark(p, Math.max(2, age), o.v); break;
    case 'terminal': terminal(p, Math.max(3, age)); break;
    case 'station': station(p, Math.max(3, age)); break;
    case 'lamp': lamp(p, age); break;
    case 'pier': pier(p, age, o); break;
    case 'health': health(p, age); break;
    case 'school': school(p, age); break;
    case 'fire': firehouse(p, age, o.v); break;
    case 'stable': stable(p, Math.max(1, age)); break;
    case 'apiary': apiary(p, age); break;
    case 'baths': baths(p, Math.max(1, age)); break;
    case 'tavern': tavern(p, Math.max(2, age), o); break;
    case 'mine': mine(p, Math.max(2, age)); break;
    case 'observatory': observatory(p); break;
    case 'outpost': outpost(p, Math.max(2, age)); break;
    case 'lumber': lumber(p, age); break;
    case 'quarry': quarry(p, age); break;
    case 'barber': barber(p, Math.max(1, age)); break;
    case 'alpine': alpine(p, Math.max(3, age)); break;
    case 'police': police(p, Math.max(1, age)); break;
    case 'harbor': if (size === 3) harborBig(p, Math.max(2, age)); else harbor(p, Math.max(2, age)); break;
    case 'airport': if (size >= 4) airportBig(p); else airport(p); break;
    case 'heliport': heliport(p); break;
    case 'watertower': watertower(p, Math.max(3, age)); break;
    case 'carworks': carworks(p, Math.max(3, age)); break;
    case 'lab': lab(p, Math.max(3, age)); break;
    case 'aerodrome': aerodrome(p, Math.max(3, age)); break;
    case 'manor': manor(p, Math.max(2, age)); break;
    case 'stadium': if (size === 3) stadiumBig(p, Math.max(3, age)); else stadium(p, Math.max(3, age)); break;
    case 'football': football(p, Math.max(3, age)); break;
    case 'basket': basket(p); break;
    case 'tennis': tennis(p, Math.max(3, age)); break;
    case 'waterpark': if (size >= 3) waterparkBig(p); else waterpark(p); break;
    case 'funfair': if (size === 3) funfairBig(p, Math.max(3, age)); else funfair(p, Math.max(3, age)); break;
    case 'theater': theater(p, Math.max(1, age)); break;
    case 'acropolis': acropolis(p, age); break;
    case 'forum': forum(p, Math.max(1, age)); break;
    case 'senate': senate(p, Math.max(1, age)); break;
    case 'oilwell': oilwell(p); break;
    case 'refinery': refinery(p); break;
    case 'arcology': arcology(p, o.v); break;
    case 'vfarm': vfarm(p); break;
    case 'fusion': fusion(p); break;
    case 'spaceport': spaceport(p); break;
    case 'research': research(p); break;
    case 'maglev': maglev(p); break;
  }
  if (extras) futureExtras(p, kind, size);
  lifeK = 1;
  // un modèle fait seulement de pièces importées (le point d'eau préhistorique) n'a pas de partie procédurale
  if (!p.body.length && attachOut.length) m = { body: mergeGeometries(attachOut, false)!, glow: null, smoke: smokeOut };
  else {
    m = { ...p.build(), smoke: smokeOut };
    if (attachOut.length) m.body = mergeGeometries([m.body, ...attachOut], false)!;
  }
  // roues d'un chevalement, coupole d'un observatoire, abeilles d'un rucher
  const spin = spinOut as Spin | null;
  if (spin) m.rotor = { geo: spin.p.build(false).body, pivot: spin.pivot, axis: spin.axis, speed: spin.speed };
  if (swayOut.length) m.sways = swayOut.filter((sw) => sw.p.body.length).map((sw) => { const bb = sw.p.build(false); return { geo: bb.body, glow: bb.glow, pivot: [...sw.pivot] as [number, number, number], axis: sw.axis, amp: sw.amp, freq: sw.freq, spin: sw.spin, steady: sw.steady }; });
  mainParts = null;
  if (crowdOut.length) { m.crowd = mergeGeometries(crowdOut, false); for (const g of crowdOut) g.dispose(); crowdOut = []; }
  const vn = vaneOut as { p: Parts; pivot: [number, number]; face: number } | null;
  if (vn) m.vane = { pivot: vn.pivot, face: vn.face, whole: false, geo: vn.p.build(false).body };
  // plus de dalle : tout descend de son épaisseur (à un centimètre près, pour que les pavés ne se confondent pas avec le sol)
  if (sinkOut > 0.01) {
    const d = sinkOut - 0.01;
    m.body.translate(0, -d, 0);
    m.glow?.translate(0, -d, 0);
    m.smoke = m.smoke.map((v, i) => (i % 4 === 1 ? v - d : v));
    if (m.rotor) m.rotor.pivot[1] -= d;
    for (const sw of m.sways ?? []) sw.pivot[1] -= d;
    if (m.crowd) { m.crowd.translate(0, -d, 0); const pv = m.crowd.attributes.aPivot; for (let i = 0; i < pv.count; i++) pv.setY(i, pv.getY(i) - d); }
  }
  // dessiné pour une case, posé sur quatre : tout s'agrandit, cheminées comprises
  if (size === 2 && UPSCALE.includes(kind)) {
    m.body.scale(UP, UP, UP);
    m.glow?.scale(UP, UP, UP);
    m.smoke = m.smoke.map((v, i) => (i % 4 === 3 ? v : v * UP));
    for (const sw of m.sways ?? []) { sw.geo.scale(UP, UP, UP); sw.glow?.scale(UP, UP, UP); sw.pivot = sw.pivot.map((v) => v * UP) as [number, number, number]; }
    // le rotor et la tête face au vent de l'éolienne grandissent avec elle
    if (m.rotor) { m.rotor.geo.scale(UP, UP, UP); m.rotor.pivot = m.rotor.pivot.map((v) => v * UP) as [number, number, number]; }
    if (m.vane) { m.vane.geo?.scale(UP, UP, UP); m.vane.pivot = m.vane.pivot.map((v) => v * UP) as [number, number]; }
    if (m.crowd) {
      m.crowd.scale(UP, UP, UP);
      const pv = m.crowd.attributes.aPivot, an = m.crowd.attributes.aAnim;
      for (let i = 0; i < pv.count; i++) { pv.setXYZ(i, pv.getX(i) * UP, pv.getY(i) * UP, pv.getZ(i) * UP); an.setW(i, an.getW(i) * UP); }
    }
  }
  cache.set(key, m);
  return m;
}
