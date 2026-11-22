import * as THREE from 'three';
import { World, N } from '../world/world';
import { KINDS, KindId, sizeOf } from './catalog';
import { rangeOf } from '../sim/coverage';
import { guardReach } from '../sim/legacy';
import { drapeTiles } from './zones';

/**
 * La portée d'un bâtiment de sécurité (guetteurs et pompiers, gardes et police, tour de garde), montrée case par case sur le
 * relief : les cases à sa portée en bleu vif, celles que couvrent déjà les postes du même service en plus pâle. Elle suit le
 * bâtiment qu'on tient (retour de joueur, 22 nov. 2026 : « on voit les 14 cases ») et entoure celui qu'on a sélectionné.
 * La règle est celle de la jauge et des secours (`reaches`) : du centre du poste au centre de la case
 */
export class RangeView {
  private mine: THREE.Mesh;
  private others: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private key = '';
  private t = 0;

  constructor(scene: THREE.Scene) {
    const tile = (color: number, opacity: number, edge: number, order: number) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const l = new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.9, depthWrite: false });
      m.userData.base = opacity; l.userData.base = 0.9;
      this.mats.push(m, l);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), l);
      mesh.renderOrder = line.renderOrder = order; mesh.frustumCulled = line.frustumCulled = false;
      mesh.add(line);
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    };
    this.others = tile(0x6aa8ff, 0.12, 0x9cc4ff, 6);
    this.mine = tile(0x3d8bff, 0.3, 0xd8e8ff, 7);
  }

  /** La portée d'un genre (0 : il n'en a pas) */
  static range(w: World, kind: KindId, age: number) { return rangeOf({ kind, age: Math.max(age, KINDS[kind].minAge) }, guardReach(w)); }

  /**
   * Montre la portée de `kind` posé en (x, z) (son origine), ou rien (`kind` null, ou sans portée). `self` : l'identifiant du
   * poste montré, qu'on ne compte pas parmi les autres
   */
  show(w: World, kind: KindId | null, x = 0, z = 0, age = 0, self = -1) {
    const r = kind ? RangeView.range(w, kind, age) : 0;
    if (!kind || !r) { this.mine.visible = this.others.visible = false; this.key = ''; return; }
    const key = `${kind}|${x},${z}|${r}|${self}|${w.version}|${w.buildings.size}`;
    if (key === this.key) { this.mine.visible = this.others.visible = true; return; }
    this.key = key;
    const s = KINDS[kind].size / 2, cx = x + s, cz = z + s, R = Math.ceil(r);
    const near = (ox: number, oz: number, rr: number) => (px: number, pz: number) => Math.hypot(px + 0.5 - ox, pz + 0.5 - oz) <= rr;
    const inMine = near(cx, cz, r);
    this.set(this.mine, drapeTiles(w, Math.floor(cx) - R, Math.floor(cz) - R, Math.floor(cx) + R, Math.floor(cz) + R, inMine));
    // les postes du même service déjà bâtis (les gardes, la police et la tour de garde veillent ensemble)
    const fire = kind === 'fire', same = (k: string) => (fire ? k === 'fire' : k === 'police' || k === 'watchtower');
    const covered = new Uint8Array(N * N);
    let x0 = N, z0 = N, x1 = -1, z1 = -1;
    for (const b of w.buildings.values()) {
      if (b.id === self || !same(b.kind)) continue;
      const rr = rangeOf(b, guardReach(w)), h = sizeOf(b) / 2, bx = b.x + h, bz = b.z + h, rc = Math.ceil(rr);
      for (let pz = Math.max(0, Math.floor(bz) - rc); pz <= Math.min(N - 1, Math.floor(bz) + rc); pz++)
        for (let px = Math.max(0, Math.floor(bx) - rc); px <= Math.min(N - 1, Math.floor(bx) + rc); px++)
          if (Math.hypot(px + 0.5 - bx, pz + 0.5 - bz) <= rr && !inMine(px, pz)) {
            covered[pz * N + px] = 1;
            x0 = Math.min(x0, px); z0 = Math.min(z0, pz); x1 = Math.max(x1, px); z1 = Math.max(z1, pz);
          }
    }
    this.set(this.others, drapeTiles(w, x0, z0, x1, z1, (px, pz) => covered[pz * N + px] === 1));
  }

  private set(mesh: THREE.Mesh, t: ReturnType<typeof drapeTiles>) {
    mesh.geometry.dispose();
    mesh.geometry = t.tiles;
    const line = mesh.children[0] as THREE.LineSegments;
    line.geometry.dispose();
    line.geometry = t.edge;
    mesh.visible = t.n > 0;
  }

  /** La portée bat doucement, comme les emplacements */
  update(dt: number) {
    if (!this.mine.visible) return;
    this.t += dt;
    const p = 0.75 + 0.25 * Math.sin(this.t * 2.6);
    for (const m of this.mats) m.opacity = (m.userData.base as number) * p;
  }

  get visible() { return this.mine.visible; }
}
