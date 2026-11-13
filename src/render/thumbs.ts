import * as THREE from 'three';
import { getModel } from './models';
import { mats } from './materials';
import type { KindId } from '../build/catalog';

/**
 * Vignettes 3D des bâtiments, pour la barre de construction : le vrai modèle du jeu (celui de l'âge), vu de trois quarts sur
 * fond transparent, rendu une fois par le moteur dans une cible hors écran puis gardé en image (data URL). Rendu à 2× puis
 * réduit (adoucit les bords sans anticrénelage). La file se vide d'une vignette par image (`pump`) : ouvrir un rayon ne fige
 * pas le jeu ; une vignette pas encore prête montre l'icône au trait en attendant. Les mêmes vignettes servent aux cartes des
 * défenses de l'île ; d'autres modèles (la base des Enfers) passent par une source chargée à part (`addSource`, `getFrom`).
 * Un bâtiment est posé sur un petit îlot d'herbe à facettes, éclairé en haut à gauche, avec son ombre portée
 */
const RT = 384, OUT = 160;

/** Ce qu'une source fabrique pour une vignette : l'objet à rendre, et de quoi libérer ce qu'elle a créé pour lui */
export type ThumbModel = { obj: THREE.Object3D; done?: () => void } | null;
export type ThumbMaker = (id: string, age: number) => ThumbModel;

export class Thumbs {
  private cache = new Map<string, string>();
  private queue: string[] = [];
  /** les sources de modèles d'ailleurs, par espace (« hell ») : chargées à la première demande */
  private sources = new Map<string, { load: () => Promise<ThumbMaker>; make: ThumbMaker | null; loading: boolean }>();
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  private rt: THREE.WebGLRenderTarget | null = null;
  private px = new Uint8Array(RT * RT * 4);
  private canvas = document.createElement('canvas');
  private small = document.createElement('canvas');

  /** le soleil des vignettes : en haut à gauche de la vue, il porte l'ombre du bâtiment sur son îlot */
  private sun = new THREE.DirectionalLight(0xffe4bd, 2.7);
  private grassMat = new THREE.MeshStandardMaterial({ color: 0x88a75a, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  private earthMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1, flatShading: true });

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight(0xfff3df, 0x7f8a5c, 1.55));
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
    fill.position.set(1.6, 0.6, -0.4);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target, fill);
    this.canvas.width = this.canvas.height = RT;
    this.small.width = this.small.height = OUT;
  }

  /**
   * La vignette d'un bâtiment à cet âge (data URL), ou null si elle attend son tour (elle est alors mise dans la file ; `first` :
   * dans la file prioritaire, pour les cartes à l'écran pendant que la barre de construction, cachée, attend encore les siennes)
   */
  get(kind: KindId, age: number, first = false): string | null {
    return this.want(`${kind}|${age}`, first);
  }

  /** Déclare une source de modèles d'ailleurs (`load` : le module chargé à part, appelé à la première demande) */
  addSource(space: string, load: () => Promise<ThumbMaker>) {
    this.sources.set(space, { load, make: null, loading: false });
  }

  /** La vignette d'un modèle d'une source (`id` à cet âge), ou null tant qu'elle attend (la source, ou son tour dans la file) */
  getFrom(space: string, id: string, age: number): string | null {
    const s = this.sources.get(space);
    if (!s) return null;
    if (!s.make) {
      // (un échec de chargement n'est pas retenté : les cartes gardent leur picto)
      if (!s.loading) { s.loading = true; s.load().then((m) => { s.make = m; }, () => {}); }
      return null;
    }
    return this.want(`${space}:${id}|${age}`, true);
  }

  private want(key: string, first = false): string | null {
    const got = this.cache.get(key);
    if (got !== undefined) return got || null;
    if (this.soon.includes(key)) return null;
    const i = this.queue.indexOf(key);
    if (first) { if (i >= 0) this.queue.splice(i, 1); this.soon.push(key); }
    else if (i < 0) this.queue.push(key);
    return null;
  }
  /** la file prioritaire (`first`), vidée avant l'autre, dans l'ordre des demandes (les cartes de gauche à droite) */
  private soon: string[] = [];

  /** Rend la prochaine vignette de la file ; vrai si une vignette vient d'être prête */
  pump(): boolean {
    const key = this.soon.shift() ?? this.queue.shift();
    if (!key) return false;
    const [id, age] = key.split('|'), i = id.indexOf(':');
    let url = '';
    try {
      if (i < 0) url = this.draw(id as KindId, +age);
      else {
        const m = this.sources.get(id.slice(0, i))?.make?.(id.slice(i + 1), +age);
        if (m) { try { url = this.shoot(m.obj); } finally { m.done?.(); } }
      }
    } catch { /* modèle introuvable : l'icône au trait reste */ }
    this.cache.set(key, url);
    return !!url;
  }

  private draw(kind: KindId, age: number): string {
    const m = getModel(kind, age, { v: 0, L: false, R: false, F: false });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(m.body, mats.body));
    if (m.glow) group.add(new THREE.Mesh(m.glow, mats.glow));
    if (m.rotor) { const r = new THREE.Mesh(m.rotor.geo, mats.body); r.position.set(...m.rotor.pivot); group.add(r); }
    if (m.vane?.geo) { const v = new THREE.Mesh(m.vane.geo, mats.body); v.position.set(m.vane.pivot[0], 0, m.vane.pivot[1]); group.add(v); }
    for (const s of m.sways ?? []) { const w = new THREE.Mesh(s.geo, mats.body); w.position.set(...s.pivot); group.add(w); }
    group.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    const base = this.base(group);
    try { return this.shoot(group); } finally { base.geometry.dispose(); (base.userData.top as THREE.BufferGeometry).dispose(); }
  }

  /** L'îlot d'herbe sous un bâtiment : bas, un peu irrégulier, bord de terre ; un peu plus large que le modèle */
  private base(group: THREE.Group): THREE.Mesh {
    const box = new THREE.Box3().setFromObject(group);
    const rad = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.6 + 0.08, n = 22;
    const rnd = (i: number) => { const v = Math.sin(i * 127.1 + rad * 311.7) * 43758.5453; return v - Math.floor(v); };
    const shape = new THREE.Shape(Array.from({ length: n }, (_, i) => {
      const r = rad * (0.94 + rnd(i) * 0.1), a = (i / n) * Math.PI * 2;
      return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
    }));
    const th = rad * 0.07;
    const earth = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: true, bevelThickness: th * 0.5, bevelSize: rad * 0.035, bevelSegments: 1 }), this.earthMat);
    earth.rotation.x = Math.PI / 2;
    earth.position.set((box.max.x + box.min.x) / 2, Math.min(0, box.min.y) - th * 0.5 - 0.003, (box.max.z + box.min.z) / 2);
    const top = new THREE.ShapeGeometry(shape), grass = new THREE.Mesh(top, this.grassMat);
    grass.position.z = -th * 0.5 - 0.007;
    grass.receiveShadow = earth.receiveShadow = true;
    earth.add(grass);
    earth.userData.top = top;
    group.add(earth);
    return earth;
  }

  /** Photographie un objet (façade vers +z) dans la cible hors écran et rend l'image réduite (data URL ; vide s'il n'a pas de taille) */
  private shoot(group: THREE.Object3D): string {
    // cadrage : la sphère qui englobe le modèle, vue de trois quarts (façade vers +z), un peu d'en haut
    const box = new THREE.Box3().setFromObject(group), sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!isFinite(sphere.radius) || sphere.radius <= 0) return '';
    const dir = new THREE.Vector3(0.95, 0.85, 1.3).normalize();
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2)) * 0.92;
    this.cam.position.copy(sphere.center).addScaledVector(dir, dist);
    this.cam.lookAt(sphere.center);
    this.cam.updateProjectionMatrix();
    // soleil en haut à gauche de la vue, ombre portée vers l'arrière droit ; la carte d'ombre est refaite pour cette vignette
    const sun = this.sun, R = sphere.radius;
    sun.position.copy(sphere.center).add(new THREE.Vector3(-0.75, 2.3, 1.6).multiplyScalar(R * 2));
    sun.target.position.copy(sphere.center);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -R * 1.2; sc.right = sc.top = R * 1.2; sc.near = 0.1; sc.far = R * 8;
    sc.updateProjectionMatrix();
    this.scene.add(group);
    const r = this.renderer;
    r.shadowMap.needsUpdate = true;
    if (!this.rt) { this.rt = new THREE.WebGLRenderTarget(RT, RT); this.rt.texture.colorSpace = THREE.SRGBColorSpace; }
    const prevTarget = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, RT, RT, this.px);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    this.scene.remove(group);
    // l'image lue a le bas en haut : on la retourne
    const ctx = this.canvas.getContext('2d')!, img = ctx.createImageData(RT, RT), row = RT * 4;
    for (let y = 0; y < RT; y++) img.data.set(this.px.subarray((RT - 1 - y) * row, (RT - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    const sm = this.small.getContext('2d')!;
    sm.clearRect(0, 0, OUT, OUT);
    sm.imageSmoothingQuality = 'high';
    sm.drawImage(this.canvas, 0, 0, OUT, OUT);
    return this.small.toDataURL('image/png');
  }
}
