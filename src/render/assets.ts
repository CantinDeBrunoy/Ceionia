import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Modèles Quaternius (CC0, via poly.pizza) servis depuis public/models ; chaque modèle absent retombe sur sa version procédurale */
const NAMES = ['birch', 'pines', 'bush', 'rocks', 'sheep', 'cow', 'chicken', 'pig', 'deer', 'stag',
  'adventurer', 'woman_dress', 'farmer', 'hooded', 'worker', 'woman', 'woman_casual', 'man',
  'ship_wreck', 'dolphin', 'whale', 'manta', 'clownfish', 'yellow_tang', 'fish', 'coral_set', 'seaweed',
  // biomes : essences, plantes d'eau et faune sauvage
  'palm', 'palm2', 'palm3', 'cactus', 'cactus2', 'cactus_flowers', 'willow', 'pine_snow', 'dead_tree', 'lilypad',
  'fox', 'wolf', 'horse', 'llama', 'frog',
  // sous-bois et détails des prairies
  'log', 'stump', 'fern', 'flowers', 'mushroom', 'skull', 'ribcage', 'bone',
  // monde souterrain : cristaux, toiles et créatures
  'crystal', 'crystal2', 'mineral', 'cobweb', 'zombie', 'skeleton', 'spider', 'slime', 'mushnub', 'ghost'] as const;
export type ModelName = (typeof NAMES)[number];

const loaded = new Map<ModelName, GLTF>();

export async function loadModels(onProgress?: (done: number, total: number) => void) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(NAMES.map(async (n) => {
    try { const g = await loader.loadAsync(`./models/${n}.glb`); retouch(n, g); loaded.set(n, g); }
    catch (e) { console.warn(`Modèle « ${n} » indisponible : version procédurale`, e); }
    onProgress?.(++done, NAMES.length);
  }));
}

export const hasModel = (n: ModelName) => loaded.has(n);

/** Retouches de modèles : la laine du mouton de l'atlas est gris foncé, on la blanchit et on assombrit tête et pattes */
function retouch(name: ModelName, gltf: GLTF) {
  if (name !== 'sheep') return;
  gltf.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m?.map?.image) return;
    m.map = recolor(m.map, (r, g, b) => {
      if (Math.max(r, g, b) - Math.min(r, g, b) > 25) return [r, g, b];
      const l = (r + g + b) / 3;
      // gris foncé : tête et pattes ; gris clair : laine
      return l < 110 ? [58, 52, 50] : l < 205 ? [242, 238, 230] : [r, g, b];
    });
  });
}

/** Copie d'une texture dont chaque pixel passe par `fn` (mêmes réglages : retournement, filtrage, espace colorimétrique) */
function recolor(tex: THREE.Texture, fn: (r: number, g: number, b: number) => [number, number, number]) {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) [d[i], d[i + 1], d[i + 2]] = fn(d[i], d[i + 1], d[i + 2]);
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(cv);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.magFilter = tex.magFilter; out.minFilter = tex.minFilter;
  return out;
}

export interface StaticModel {
  /** partie teintable (couleurs relatives ≈ 1, teinte donnée par le matériau : feuillage de saison, roche…) */
  tint: THREE.BufferGeometry | null;
  /** reste du modèle, couleurs d'origine (troncs, baies…) */
  rest: THREE.BufferGeometry | null;
  /** hauteur moyenne de la partie teintable (le feuillage rétrécit sur place en hiver) */
  tintY: number;
}

const _c = new THREE.Color(), _v = new THREE.Color();

/** Pixels d'une texture (lus une fois) pour cuire ses couleurs dans les sommets */
const texels = new Map<THREE.Texture, ImageData>();
function texelsOf(tex: THREE.Texture) {
  let d = texels.get(tex);
  if (!d) {
    const img = tex.image as CanvasImageSource & { width: number; height: number };
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    d = ctx.getImageData(0, 0, cv.width, cv.height);
    texels.set(tex, d);
  }
  return d;
}

/**
 * Modèle statique ramené à `height`, posé à y = 0 et centré en x/z, couleurs des matériaux (et de leur texture, lue au
 * point UV de chaque sommet : les atlas low-poly sont des palettes) cuites en couleurs de sommets ; `skip` écarte des matériaux (un pot…)
 */
export function bakeStatic(name: ModelName, height: number, tintRe: RegExp, skip?: RegExp): StaticModel | null {
  const gltf = loaded.get(name);
  if (!gltf) return null;
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s = height / Math.max(1e-6, box.max.y - box.min.y);
  const norm = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const tint: THREE.BufferGeometry[] = [], rest: THREE.BufferGeometry[] = [];
  // les maillages à plusieurs matériaux sont découpés en groupes : un matériau par groupe
  const meshes: { mat: THREE.MeshStandardMaterial; geo: THREE.BufferGeometry; world: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    if (list.length === 1 || !m.geometry.groups.length) { meshes.push({ mat: list[0] as THREE.MeshStandardMaterial, geo: m.geometry, world: m.matrixWorld }); return; }
    for (const gr of m.geometry.groups) {
      const sub = m.geometry.clone();
      sub.clearGroups();
      if (sub.index) sub.setIndex(Array.from(sub.index.array as ArrayLike<number>).slice(gr.start, gr.start + gr.count));
      meshes.push({ mat: list[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial, geo: sub, world: m.matrixWorld });
    }
  });
  for (const { mat, geo, world } of meshes) {
    if (skip?.test(mat.name)) continue;
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, world));
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, vc = g.attributes.color, uv = g.attributes.uv;
    const px = mat.map?.image && uv ? texelsOf(mat.map) : null;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _c.copy(mat.color ?? _v.setRGB(1, 1, 1));
      if (vc) _c.multiply(_v.setRGB(vc.getX(i), vc.getY(i), vc.getZ(i)));
      if (px) {
        // glTF : origine des UV en haut à gauche de l'image
        const u = uv.getX(i) - Math.floor(uv.getX(i)), v = uv.getY(i) - Math.floor(uv.getY(i));
        const o = (Math.min(px.height - 1, Math.floor(v * px.height)) * px.width + Math.min(px.width - 1, Math.floor(u * px.width))) * 4;
        _c.multiply(_v.setRGB(px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255, THREE.SRGBColorSpace));
      }
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (tintRe.test(mat.name) ? tint : rest).push(out);
  }
  const t = tint.length ? mergeGeometries(tint, false) : null;
  const r = rest.length ? mergeGeometries(rest, false) : null;
  if (skip) {
    // parties écartées : on repose et on remet à l'échelle ce qui reste
    const kb = new THREE.Box3();
    for (const g of [t, r]) if (g) { g.computeBoundingBox(); kb.union(g.boundingBox!); }
    const k = height / Math.max(1e-6, kb.max.y - kb.min.y);
    for (const g of [t, r]) g?.translate(-(kb.min.x + kb.max.x) / 2, -kb.min.y, -(kb.min.z + kb.max.z) / 2).scale(k, k, k);
  }
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
  return { tint: t, rest: r, tintY };
}

/** Morceaux connexes d'une géométrie non indexée (sommets confondus par position) : triangles, centre x/z et pied de chacun */
function pieces(g: THREE.BufferGeometry) {
  const p = g.attributes.position, tris = p.count / 3;
  const ids = new Map<string, number>(), parent: number[] = [];
  const vid = new Int32Array(p.count);
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
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
    for (let j = 0; j < 3; j++) { const i = t * 3 + j; c.x += p.getX(i); c.z += p.getZ(i); c.minY = Math.min(c.minY, p.getY(i)); }
  }
  return [...comps.values()].map((c) => ({ ...c, x: c.x / (c.tris.length * 3), z: c.z / (c.tris.length * 3) }));
}

/** Sous-géométrie formée des triangles listés, décalée de (dx, dy, dz) */
function pickTriangles(g: THREE.BufferGeometry, list: number[], dx: number, dy: number, dz: number) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const src = g.attributes[name], arr = new Float32Array(list.length * 9), pos = name === 'position';
    list.forEach((t, n) => {
      for (let j = 0; j < 3; j++) {
        const i = t * 3 + j, o = n * 9 + j * 3;
        arr[o] = src.getX(i) + (pos ? dx : 0);
        arr[o + 1] = src.getY(i) + (pos ? dy : 0);
        arr[o + 2] = src.getZ(i) + (pos ? dz : 0);
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

/**
 * Sépare un bosquet en arbres individuels : un arbre par tronc (composante connexe de la partie non teintée),
 * le feuillage rejoint le tronc le plus proche ; chaque arbre est reposé à y = 0 et centré sur son tronc.
 * Posé d'un bloc sur une pente, un bosquet laisserait flotter les arbres côté aval.
 */
export function splitTrees(m: StaticModel): StaticModel[] {
  if (!m.rest || !m.tint) return [m];
  const all = pieces(m.rest), tris = m.rest.attributes.position.count / 3;
  // les petits morceaux détachés (branches) rejoignent le tronc le plus proche
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
  return trunks.map((c) => {
    const tint = pickTriangles(m.tint!, tintOf.get(c)!, -c.x, -c.minY, -c.z);
    const p = tint.attributes.position;
    let y = 0;
    for (let i = 0; i < p.count; i++) y += p.getY(i);
    return { rest: pickTriangles(m.rest!, restOf.get(c)!, -c.x, -c.minY, -c.z), tint, tintY: p.count ? y / p.count : 0 };
  });
}

/**
 * Sépare un tas (de rochers…) en pièces individuelles, chacune reposée à y = 0 et centrée, avec son rayon au sol ;
 * les miettes (moins de 2 % des triangles) sont écartées
 */
export function splitPieces(g: THREE.BufferGeometry): { geometry: THREE.BufferGeometry; radius: number }[] {
  const tris = g.attributes.position.count / 3;
  return pieces(g).filter((c) => c.tris.length >= tris * 0.02).map((c) => {
    const geometry = pickTriangles(g, c.tris, -c.x, -c.minY, -c.z);
    const p = geometry.attributes.position;
    let radius = 0;
    for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
    return { geometry, radius };
  });
}

export interface MeshPart { geometry: THREE.BufferGeometry; material: THREE.Material }

/**
 * Modèle statique gardant ses matériaux (textures comprises), ramené à `height` pour l'ensemble ;
 * split : une variante par maillage (ex. un lot de coraux), chacune reposée à y = 0 et centrée
 */
export function meshVariants(name: ModelName, height: number, split: boolean): MeshPart[][] {
  const gltf = loaded.get(name);
  if (!gltf) return [];
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s = height / Math.max(1e-6, box.max.y - box.min.y);
  const parts: MeshPart[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geometry = m.geometry.clone().applyMatrix4(new THREE.Matrix4().makeScale(s, s, s).multiply(m.matrixWorld));
    const material = (Array.isArray(m.material) ? m.material[0] : m.material).clone() as THREE.MeshStandardMaterial;
    if ('metalness' in material) { material.metalness = 0; material.roughness = 0.9; }
    parts.push({ geometry, material });
  });
  const settle = (list: MeshPart[]) => {
    const b = new THREE.Box3();
    for (const p of list) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox!); }
    for (const p of list) p.geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    return list;
  };
  return split ? parts.map((p) => settle([p])) : [settle(parts)];
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
