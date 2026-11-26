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
  /** les habitations qu'aucun poste de ce service ne couvre (celui qu'on montre compris) : ce qui reste à protéger */
  private bare: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private key = '';
  private t = 0;

  constructor(scene: THREE.Scene) {
    const tile = (color: number, opacity: number, edge: number, grid: number, order: number) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const l = new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 1, depthWrite: false });
      const q = new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: grid, depthWrite: false });
      m.userData.base = opacity; l.userData.base = 1; q.userData.base = grid;
      this.mats.push(m, l, q);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), l), cells = new THREE.LineSegments(new THREE.BufferGeometry(), q);
      mesh.renderOrder = line.renderOrder = cells.renderOrder = order; mesh.frustumCulled = line.frustumCulled = cells.frustumCulled = false;
      mesh.add(line, cells);
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    };
    // (bleu franc, liseré blanc, et le quadrillage des cases à portée : on les compte)
    this.others = tile(0x6aa8ff, 0.14, 0xb8d4ff, 0, 6);
    this.mine = tile(0x1f6fff, 0.36, 0xffffff, 0.35, 7);
    // (rouge orangé, liseré clair : se voit sur l'herbe comme sur la neige, et ne se confond pas avec le bleu)
    this.bare = tile(0xff4a2a, 0.38, 0xffd2c4, 0, 8);
    // (vue au travers de la maison qui la couvre : la maison paraît teintée de rouge)
    for (const o of [this.bare, ...this.bare.children] as THREE.Mesh[]) (o.material as THREE.Material).depthTest = false;
  }

  /** La portée d'un genre (0 : il n'en a pas) */
  static range(w: World, kind: KindId, age: number) { return rangeOf({ kind, age: Math.max(age, KINDS[kind].minAge) }, guardReach(w)); }

  /**
   * Montre la portée de `kind` posé en (x, z) (son origine), ou rien (`kind` null, ou sans portée). `self` : l'identifiant du
   * poste montré, qu'on ne compte pas parmi les autres
   */
  show(w: World, kind: KindId | null, x = 0, z = 0, age = 0, self = -1) {
    const r = kind ? RangeView.range(w, kind, age) : 0;
    if (!kind || !r) { this.mine.visible = this.others.visible = this.bare.visible = false; this.key = ''; return; }
    const key = `${kind}|${x},${z}|${r}|${self}|${w.version}|${w.buildings.size}`;
    if (key === this.key) { this.mine.visible = this.others.visible = true; this.bare.visible = this.bareN > 0; return; }
    this.key = key;
    const s = KINDS[kind].size / 2, cx = x + s, cz = z + s, R = Math.ceil(r);
    const near = (ox: number, oz: number, rr: number) => (px: number, pz: number) => Math.hypot(px + 0.5 - ox, pz + 0.5 - oz) <= rr;
    const inMine = near(cx, cz, r);
    this.set(this.mine, drapeTiles(w, Math.floor(cx) - R, Math.floor(cz) - R, Math.floor(cx) + R, Math.floor(cz) + R, inMine, true));
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
    // les habitations hors de portée de tout poste du service, le montré compris (de centre à centre, comme `reaches`) :
    // leur emprise en rouge. Retour de l'auteur (26 nov. 2026) : on voyait la zone protégée, pas ce qui restait à protéger
    const posts: [number, number, number][] = [[cx, cz, r]];
    for (const b of w.buildings.values()) if (b.id !== self && same(b.kind)) { const h = sizeOf(b) / 2; posts.push([b.x + h, b.z + h, rangeOf(b, guardReach(w))]); }
    const bare = new Uint8Array(N * N);
    let bx0 = N, bz0 = N, bx1 = -1, bz1 = -1, nb = 0;
    for (const b of w.buildings.values()) {
      if ((KINDS[b.kind]?.housing?.[b.age] ?? 0) <= 0) continue;
      const sz = sizeOf(b), hx = b.x + sz / 2, hz = b.z + sz / 2;
      if (posts.some(([px, pz, pr]) => Math.hypot(px - hx, pz - hz) <= pr)) continue;
      nb++;
      for (let pz = b.z; pz < b.z + sz; pz++) for (let px = b.x; px < b.x + sz; px++) if (w.inCells(px, pz)) bare[pz * N + px] = 1;
      bx0 = Math.min(bx0, b.x); bz0 = Math.min(bz0, b.z); bx1 = Math.max(bx1, b.x + sz - 1); bz1 = Math.max(bz1, b.z + sz - 1);
    }
    this.bareN = nb;
    this.set(this.bare, drapeTiles(w, bx0, bz0, bx1, bz1, (px, pz) => bare[pz * N + px] === 1));
  }

  /** combien d'habitations restent hors de portée (0 : tout est couvert) */
  bareN = 0;

  private set(mesh: THREE.Mesh, t: ReturnType<typeof drapeTiles>) {
    mesh.geometry.dispose();
    mesh.geometry = t.tiles;
    const [line, cells] = mesh.children as THREE.LineSegments[];
    line.geometry.dispose();
    line.geometry = t.edge;
    cells.geometry.dispose();
    cells.geometry = t.inner;
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
