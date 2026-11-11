import * as THREE from 'three';
import { getModel } from './models';
import { mats } from './materials';
import type { KindId } from '../build/catalog';

/**
 * Vignettes 3D des bâtiments, pour la barre de construction : le vrai modèle du jeu (celui de l'âge), vu de trois quarts sur
 * fond transparent, rendu une fois par le moteur dans une cible hors écran puis gardé en image (data URL). Rendu à 2× puis
 * réduit (adoucit les bords sans anticrénelage). La file se vide d'une vignette par image (`pump`) : ouvrir un rayon ne fige
 * pas le jeu ; une vignette pas encore prête montre l'icône au trait en attendant
 */
const RT = 224, OUT = 112;

export class Thumbs {
  private cache = new Map<string, string>();
  private queue: string[] = [];
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  private rt: THREE.WebGLRenderTarget | null = null;
  private px = new Uint8Array(RT * RT * 4);
  private canvas = document.createElement('canvas');
  private small = document.createElement('canvas');

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x8d7d62, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(3, 6, 5);
    this.scene.add(sun);
    this.canvas.width = this.canvas.height = RT;
    this.small.width = this.small.height = OUT;
  }

  /** La vignette d'un bâtiment à cet âge (data URL), ou null si elle attend son tour (elle est alors mise dans la file) */
  get(kind: KindId, age: number): string | null {
    const key = `${kind}|${age}`, got = this.cache.get(key);
    if (got !== undefined) return got || null;
    if (!this.queue.includes(key)) this.queue.push(key);
    return null;
  }

  /** Rend la prochaine vignette de la file ; vrai si une vignette vient d'être prête */
  pump(): boolean {
    const key = this.queue.shift();
    if (!key) return false;
    const [kind, age] = key.split('|');
    let url = '';
    try { url = this.draw(kind as KindId, +age); } catch { /* modèle introuvable : l'icône au trait reste */ }
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
    // cadrage : la sphère qui englobe le modèle, vue de trois quarts (façade vers +z), un peu d'en haut
    const box = new THREE.Box3().setFromObject(group), sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!isFinite(sphere.radius) || sphere.radius <= 0) return '';
    const dir = new THREE.Vector3(0.95, 0.85, 1.3).normalize();
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2)) * 0.92;
    this.cam.position.copy(sphere.center).addScaledVector(dir, dist);
    this.cam.lookAt(sphere.center);
    this.cam.updateProjectionMatrix();
    this.scene.add(group);
    const r = this.renderer;
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
