import * as THREE from 'three';
import type { World } from '../world/world';
import { sizeOf } from '../build/catalog';
import type { IsleBattle } from '../sim/isleBattle';
import type { BuildingView } from './buildings';
import type { CombatFx } from './combatFx';
import { Parts } from './parts';
import { mats } from './materials';
import { hash2 } from '../core/rng';

/**
 * Les défenses abattues : une tour de garde ou une caserne de l'île du portail tombée pendant une incursion s'affaisse et laisse
 * place à ses ruines (pierres éboulées, poutres calcinées, un pan de mur debout) d'où monte une fumée sombre avec quelques
 * braises ; à la fin de la vague, elle resurgit (dans un nuage de poussière). La fumée sert aussi aux ruines de la base avancée
 * des Enfers (voir `RuinSmoke`)
 */

let smokeTex: THREE.Texture | null = null;
function puffTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

/** Bouffées par panache (elles montent en boucle) */
const PUFFS = 9;
/** Durée de vie d'une bouffée, hauteur et largeur du panache (pour une ruine de rayon 1) */
const LIFE = 3.2, RISE = 2.2;

/** Panaches de fumée au-dessus des ruines : quelques bouffées qui montent, grossissent et s'éclaircissent en boucle */
export class RuinSmoke {
  group = new THREE.Group();
  private plumes = new Map<number, { puffs: THREE.Sprite[]; x: number; y: number; z: number; r: number; t: number; fade: number }>();

  constructor(private color = 0x4a4644) {}

  /** Un panache (clé `id`) au-dessus d'une ruine de rayon `r` */
  start(id: number, x: number, y: number, z: number, r = 1) {
    if (this.plumes.has(id)) return;
    const puffs: THREE.Sprite[] = [];
    for (let i = 0; i < PUFFS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: this.color, transparent: true, depthWrite: false, opacity: 0 }));
      s.renderOrder = 5;
      this.group.add(s);
      puffs.push(s);
    }
    this.plumes.set(id, { puffs, x, y, z, r, t: Math.random() * LIFE, fade: 1 });
  }

  /** Le panache s'éteint (il finit de monter, puis disparaît) */
  stop(id: number) { const p = this.plumes.get(id); if (p) p.fade = Math.min(p.fade, 0.999); }

  has(id: number) { const p = this.plumes.get(id); return !!p && p.fade >= 1; }

  update(dt: number) {
    for (const [id, p] of this.plumes) {
      p.t += dt;
      if (p.fade < 1) p.fade -= dt / 1.5;
      if (p.fade <= 0) { for (const s of p.puffs) { this.group.remove(s); s.material.dispose(); } this.plumes.delete(id); continue; }
      p.puffs.forEach((s, i) => {
        const u = ((p.t / LIFE + i / PUFFS) % 1), sw = Math.sin(p.t * 0.7 + i * 1.9) * 0.25 * p.r;
        s.position.set(p.x + sw + u * 0.5 * p.r, p.y + 0.2 + u * RISE * (0.6 + p.r * 0.4), p.z + Math.cos(p.t * 0.6 + i) * 0.2 * p.r);
        s.scale.setScalar((0.5 + u * 1.5) * (0.6 + p.r * 0.4));
        s.material.opacity = Math.min(1, u * 5) * Math.pow(1 - u, 0.7) * 0.95 * Math.min(1, p.fade);
      });
    }
  }

  clear() { for (const id of [...this.plumes.keys()]) { const p = this.plumes.get(id)!; for (const s of p.puffs) { this.group.remove(s); s.material.dispose(); } this.plumes.delete(id); } }
}

const ruinCache = new Map<string, THREE.BufferGeometry>();
/** Ruines d'une défense de `s` cases : éboulis de pierres, un pan de mur ébréché, des poutres calcinées (repère du bâtiment) */
export function ruinGeo(s: number, tower: boolean, seed: number) {
  const key = `${s}|${+tower}|${seed % 4}`;
  let g = ruinCache.get(key);
  if (g) return g;
  const p = new Parts(), r = s * 0.45, STONE = [0x9a9288, 0x857e74, 0xa8a094], CHAR = 0x3a2e28, WOOD = 0x6a4a30;
  // la base des murs, rasée à hauteur de genou
  const wall = (x: number, z: number, w: number, d: number, h: number) => p.box(w, h, d, x, 0, z, STONE[0]);
  if (tower) {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; wall(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 0.12, 0.12, 0.08 + hash2(seed, i, 5) * 0.12); }
    // un pan de la tour encore debout, ébréché
    p.box(r * 0.7, r * 1.1, 0.1, -r * 0.2, 0, -r * 0.45, STONE[1]);
    p.box(r * 0.35, r * 0.35, 0.1, -r * 0.37, r * 1.1, -r * 0.45, STONE[1]);
  } else {
    wall(0, -r * 0.8, r * 1.7, 0.1, 0.14); wall(-r * 0.85, 0, 0.1, r * 1.5, 0.1); wall(r * 0.85, r * 0.1, 0.1, r * 1.2, 0.18);
    p.box(r * 0.5, r * 0.5, 0.1, r * 0.55, 0, -r * 0.8, STONE[1]);
  }
  // l'éboulis : des blocs de pierre en tas, plus serrés au milieu
  const n = Math.round(10 + s * 8);
  for (let i = 0; i < n; i++) {
    const a = hash2(seed, i, 1) * 6.28, d = Math.sqrt(hash2(seed, i, 2)) * r, b = 0.06 + hash2(seed, i, 3) * 0.1 * (tower ? 1 : 1.3);
    p.add(new THREE.BoxGeometry(b, b * 0.7, b * 1.2).translate(0, b * 0.3, 0), Math.cos(a) * d, 0, Math.sin(a) * d, STONE[i % 3], a, false, hash2(seed, i, 4) - 0.5);
  }
  // les poutres de la charpente, tombées et noircies
  for (let i = 0; i < 4; i++) {
    const a = hash2(seed, i, 6) * 6.28, d = hash2(seed, i, 7) * r * 0.6;
    p.add(new THREE.BoxGeometry(0.05, 0.05, r * 1.1).translate(0, 0.04, 0), Math.cos(a) * d, 0.02 + i * 0.02, Math.sin(a) * d, i % 2 ? CHAR : WOOD, a, false, 0, 0.25 * (i % 2 ? 1 : -1));
  }
  g = p.build(true).body;
  ruinCache.set(key, g);
  return g;
}

/** Ruines des défenses de l'île du portail */
export class IsleRuins {
  group = new THREE.Group();
  smoke = new RuinSmoke();
  private ruins = new Map<number, { mesh: THREE.Mesh; ember: number }>();

  constructor(private world: World, private view: BuildingView) {
    this.group.add(this.smoke.group);
  }

  /** Une image : les défenses tombées passent en ruines, celles relevées resurgissent ; fumée et braises (`fx` : dans la carte de l'île) */
  update(dt: number, isle: IsleBattle | null, fx: CombatFx | null) {
    const w = this.world, seen = new Set<number>();
    if (isle) for (const [id, hb] of isle.defs) {
      const b = w.buildings.get(id);
      if (!b) continue;
      seen.add(id);
      const r = this.ruins.get(id);
      if (hb.down && !r) {
        const s = sizeOf(b), x = b.x + s / 2, z = b.z + s / 2, y = w.hAt(x, z);
        const mesh = new THREE.Mesh(ruinGeo(s, b.kind === 'watchtower', id), mats.body);
        mesh.position.set(x, y, z);
        mesh.rotation.y = b.rot * Math.PI / 2;
        mesh.castShadow = mesh.receiveShadow = true;
        this.group.add(mesh);
        this.ruins.set(id, { mesh, ember: 0 });
        this.view.setRuined(id, true);
        this.smoke.start(id, x, y, z, s * 0.6);
      } else if (!hb.down && r) {
        // relevée : la ruine s'efface, le bâtiment resurgit dans la poussière
        this.drop(id);
        if (fx) for (let i = 0; i < 6; i++) fx.puff(hb.site.x + Math.sin(i * 1.05) * hb.site.r, w.hAt(b.x, b.z) + 0.15, hb.site.z + Math.cos(i * 1.05) * hb.site.r, 6);
      } else if (r && fx) {
        // des braises qui sautent de temps en temps
        r.ember -= dt;
        if (r.ember <= 0) { r.ember = 0.5 + Math.random() * 0.8; fx.chips(hb.site.x + (Math.random() - 0.5) * hb.site.r, r.mesh.position.y + 0.15, hb.site.z + (Math.random() - 0.5) * hb.site.r, 0xff8a2a, 3); }
      }
    }
    // (une défense rasée au bulldozer, une partie rechargée)
    for (const id of [...this.ruins.keys()]) if (!seen.has(id)) this.drop(id);
    this.smoke.update(dt);
  }

  private drop(id: number) {
    const r = this.ruins.get(id);
    if (!r) return;
    this.group.remove(r.mesh);
    this.ruins.delete(id);
    this.smoke.stop(id);
    if (this.world.buildings.has(id)) this.view.setRuined(id, false);
  }
}
