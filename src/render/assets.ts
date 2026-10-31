import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Modèles Quaternius (CC0, via poly.pizza) servis depuis public/models ; chaque modèle absent retombe sur sa version procédurale */
const NAMES = ['birch', 'pines', 'bush', 'rocks', 'sheep', 'cow', 'chicken', 'pig', 'deer', 'stag',
  'adventurer', 'woman_dress', 'farmer', 'hooded', 'worker', 'woman', 'woman_casual', 'man'] as const;
export type ModelName = (typeof NAMES)[number];

const loaded = new Map<ModelName, GLTF>();

export async function loadModels(onProgress?: (done: number, total: number) => void) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(NAMES.map(async (n) => {
    try { loaded.set(n, await loader.loadAsync(`./models/${n}.glb`)); }
    catch (e) { console.warn(`Modèle « ${n} » indisponible : version procédurale`, e); }
    onProgress?.(++done, NAMES.length);
  }));
}

export const hasModel = (n: ModelName) => loaded.has(n);

export interface StaticModel {
  /** partie teintable (couleurs relatives ≈ 1, teinte donnée par le matériau : feuillage de saison, roche…) */
  tint: THREE.BufferGeometry | null;
  /** reste du modèle, couleurs d'origine (troncs, baies…) */
  rest: THREE.BufferGeometry | null;
  /** hauteur moyenne de la partie teintable (le feuillage rétrécit sur place en hiver) */
  tintY: number;
}

const _c = new THREE.Color(), _v = new THREE.Color();

/** Modèle statique ramené à `height`, posé à y = 0 et centré en x/z, couleurs des matériaux cuites en couleurs de sommets */
export function bakeStatic(name: ModelName, height: number, tintRe: RegExp): StaticModel | null {
  const gltf = loaded.get(name);
  if (!gltf) return null;
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s = height / Math.max(1e-6, box.max.y - box.min.y);
  const norm = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const tint: THREE.BufferGeometry[] = [], rest: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, m.matrixWorld));
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, vc = g.attributes.color;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _c.copy(mat.color ?? _v.setRGB(1, 1, 1));
      if (vc) _c.multiply(_v.setRGB(vc.getX(i), vc.getY(i), vc.getZ(i)));
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (tintRe.test(mat.name) ? tint : rest).push(out);
  });
  const t = tint.length ? mergeGeometries(tint, false) : null;
  let tintY = 0;
  if (t) {
    // couleurs relatives : on garde les nuances (vert clair / foncé) mais la teinte vient du matériau
    const c = t.attributes.color, p = t.attributes.position;
    const lum = (i: number) => c.getX(i) * 0.3 + c.getY(i) * 0.59 + c.getZ(i) * 0.11;
    let sum = 0;
    for (let i = 0; i < c.count; i++) { sum += lum(i); tintY += p.getY(i); }
    const avg = sum / c.count || 1;
    tintY /= c.count;
    for (let i = 0; i < c.count; i++) { const l = Math.min(1.4, lum(i) / avg); c.setXYZ(i, l, l, l); }
  }
  return { tint: t, rest: rest.length ? mergeGeometries(rest, false) : null, tintY };
}

/**
 * Sépare un bosquet en arbres individuels : un arbre par tronc (composante connexe de la partie non teintée),
 * le feuillage rejoint le tronc le plus proche ; chaque arbre est reposé à y = 0 et centré sur son tronc.
 * Posé d'un bloc sur une pente, un bosquet laisserait flotter les arbres côté aval.
 */
export function splitTrees(m: StaticModel): StaticModel[] {
  if (!m.rest || !m.tint) return [m];
  const rp = m.rest.attributes.position, tris = rp.count / 3;
  // union-find sur les sommets confondus
  const ids = new Map<string, number>(), parent: number[] = [];
  const vid = new Int32Array(rp.count);
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < rp.count; i++) {
    const k = `${Math.round(rp.getX(i) * 1e4)},${Math.round(rp.getY(i) * 1e4)},${Math.round(rp.getZ(i) * 1e4)}`;
    let v = ids.get(k);
    if (v === undefined) { v = parent.length; parent.push(v); ids.set(k, v); }
    vid[i] = v;
  }
  for (let t = 0; t < tris; t++) {
    const a = find(vid[t * 3]);
    parent[find(vid[t * 3 + 1])] = a;
    parent[find(vid[t * 3 + 2])] = a;
  }
  const comps = new Map<number, { tris: number[]; x: number; z: number; minY: number }>();
  for (let t = 0; t < tris; t++) {
    const r = find(vid[t * 3]);
    let c = comps.get(r);
    if (!c) { c = { tris: [], x: 0, z: 0, minY: Infinity }; comps.set(r, c); }
    c.tris.push(t);
    for (let j = 0; j < 3; j++) { const i = t * 3 + j; c.x += rp.getX(i); c.z += rp.getZ(i); c.minY = Math.min(c.minY, rp.getY(i)); }
  }
  // les petits morceaux détachés (branches) rejoignent le tronc le plus proche
  const all = [...comps.values()].map((c) => ({ ...c, x: c.x / (c.tris.length * 3), z: c.z / (c.tris.length * 3) }));
  const trunks = all.filter((c) => c.tris.length >= tris * 0.04);
  if (trunks.length < 2) return [m];
  const nearest = (x: number, z: number) => trunks.reduce((b, c) => (Math.hypot(c.x - x, c.z - z) < Math.hypot(b.x - x, b.z - z) ? c : b));
  const restOf = new Map(trunks.map((c) => [c, [] as number[]]));
  const tintOf = new Map(trunks.map((c) => [c, [] as number[]]));
  for (const c of all) { const owner = trunks.includes(c) ? c : nearest(c.x, c.z); restOf.get(owner)!.push(...c.tris); }
  const tp = m.tint.attributes.position;
  for (let t = 0; t < tp.count / 3; t++) {
    let x = 0, z = 0;
    for (let j = 0; j < 3; j++) { x += tp.getX(t * 3 + j); z += tp.getZ(t * 3 + j); }
    tintOf.get(nearest(x / 3, z / 3))!.push(t);
  }
  const sub = (g: THREE.BufferGeometry, list: number[], dx: number, dy: number, dz: number) => {
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const src = g.attributes[name], arr = new Float32Array(list.length * 9);
      list.forEach((t, n) => {
        for (let j = 0; j < 3; j++) {
          const i = t * 3 + j, o = n * 9 + j * 3;
          arr[o] = src.getX(i) + (name === 'position' ? dx : 0);
          arr[o + 1] = src.getY(i) + (name === 'position' ? dy : 0);
          arr[o + 2] = src.getZ(i) + (name === 'position' ? dz : 0);
        }
      });
      out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    return out;
  };
  return trunks.map((c) => {
    const tint = sub(m.tint!, tintOf.get(c)!, -c.x, -c.minY, -c.z);
    const p = tint.attributes.position;
    let y = 0;
    for (let i = 0; i < p.count; i++) y += p.getY(i);
    return { rest: sub(m.rest!, restOf.get(c)!, -c.x, -c.minY, -c.z), tint, tintY: p.count ? y / p.count : 0 };
  });
}

export interface Actor {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
}

/** Boîte englobante de chaque modèle animé, mesurée une fois (l'échelle dépend de la taille demandée) */
const boxes = new Map<ModelName, THREE.Box3>();

/** Personnage animé : clone indépendant (squelette compris) ramené à la taille voulue (longueur du corps ou hauteur), pieds à y = 0 */
export function makeActor(name: ModelName, size: number, fit: 'length' | 'height' = 'length'): Actor | null {
  const gltf = loaded.get(name);
  if (!gltf) return null;
  let box = boxes.get(name);
  if (!box) {
    gltf.scene.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(gltf.scene);
    boxes.set(name, box);
  }
  const scale = size / Math.max(1e-6, fit === 'height' ? box.max.y - box.min.y : Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
  const inner = cloneSkinned(gltf.scene);
  inner.scale.multiplyScalar(scale);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).multiplyScalar(scale);
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    // glTF sans metallicFactor = métal par défaut : sans carte d'environnement il paraît presque noir
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) { mat.metalness = 0; mat.roughness = 0.9; }
  });
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  // « AnimalArmature|Walk » et « Walk » désignent la même animation : on garde le nom court
  for (const clip of gltf.animations) {
    const short = clip.name.split('|').pop()!;
    if (!actions.has(short)) actions.set(short, mixer.clipAction(clip));
  }
  return { root, mixer, actions, current: null };
}

/** Enchaîne en fondu vers la première animation disponible de la liste */
export function play(a: Actor, names: string[], fade = 0.3) {
  const next = names.map((n) => a.actions.get(n)).find(Boolean) ?? null;
  if (!next || next === a.current) return;
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  a.current?.fadeOut(fade);
  a.current = next;
}
