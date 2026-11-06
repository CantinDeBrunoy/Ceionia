import * as THREE from 'three';
import { Building, sizeOf } from '../build/catalog';
import { World } from '../world/world';
import { Boosted, boostedBuildings } from '../sim/freight';
import { Puffs } from './particles';

/** Plafonds : bâtiments animés en même temps, et chariots en route */
const MAX_FX = 28, MAX_CARTS = 20;
const GOLD = new THREE.Color(1, 0.78, 0.2), SMOKE = new THREE.Color(0.62, 0.62, 0.64);

/** Un bâtiment boosté devant la caméra : son centre, le départ et l'arrivée de son chariot (bord du bâtiment, pied de la gare) */
export interface Fx { id: number; x: number; z: number; r: number; ax: number; az: number; bx: number; bz: number; freight: boolean; phase: number; cart: number; emit: number }

/**
 * Bâtiments boostés par le rail, rendus vivants : une flaque dorée qui pulse au sol, des étincelles qui montent, une
 * fumée plus dense, et (pour les ateliers) un petit chariot qui fait la navette jusqu'à la gare qui les sert. Tout est
 * mutualisé (une flaque instanciée, un jeu de bouffées, deux maillages de chariots), plafonné, et limité aux bâtiments
 * proches de la caméra ; le travail s'arrête la nuit
 */
export class RailBoost {
  group = new THREE.Group();
  /** bâtiments boostés (tous, hors champ compris), recalculés quelques fois par seconde */
  boosted: Boosted[] = [];
  /** ceux qu'on anime (près de la caméra, plafonnés) */
  active: Fx[] = [];
  private puffs = new Puffs(320, 0);
  private ring: THREE.InstancedMesh;
  private body: THREE.InstancedMesh;
  private load: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private ringMat: THREE.MeshBasicMaterial;
  private t = 0;
  private scan = 0;

  constructor(private world: World) {
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.18), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), this.ringMat, MAX_FX);
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.09, 0.13).translate(0, 0.09, 0), new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.9 }), MAX_CARTS);
    this.load = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.07, 0.1).translate(0, 0.17, 0), new THREE.MeshStandardMaterial({ color: 0xe0b030, roughness: 0.6, emissive: 0x4a3000 }), MAX_CARTS);
    for (const m of [this.ring, this.body, this.load]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    this.ring.renderOrder = 2;
    this.group.add(this.puffs.mesh, this.ring, this.body, this.load);
  }

  /**
   * Choisit, parmi les bâtiments boostés, ceux qu'on anime : les plus proches du point regardé, dans le rayon `reach`, au
   * plus `max` (fonction pure, testée)
   */
  static pick(list: Boosted[], cx: number, cz: number, reach: number, max: number): Boosted[] {
    const c = (b: Building) => { const s = sizeOf(b); return Math.hypot(b.x + s / 2 - cx, b.z + s / 2 - cz); };
    return list.map((e) => ({ e, d: c(e.b) })).filter((o) => o.d <= reach).sort((a, b) => a.d - b.d).slice(0, max).map((o) => o.e);
  }

  /** dt en secondes, (cx, cz, dist) le point regardé et la distance de la caméra, night 0 … 1, visible faux sous terre */
  update(dt: number, cx: number, cz: number, dist: number, night: number, visible = true) {
    this.group.visible = visible;
    if (!visible) return;
    this.t += dt;
    this.scan -= dt;
    if (this.scan <= 0) { this.scan = 0.6; this.boosted = boostedBuildings(this.world); this.refresh(cx, cz, dist); }
    this.puffs.update(dt);
    // le travail s'arrête en pleine nuit : plus d'étincelles ni de chariot, la flaque s'assoupit
    const work = 1 - Math.min(1, Math.max(0, (night - 0.5) / 0.3));
    const w = this.world, d = this.dummy;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    this.ringMat.opacity = (0.28 + 0.22 * pulse) * (0.3 + 0.7 * work);
    let n = 0, c = 0;
    for (const f of this.active) {
      const y = w.surfaceAt(f.x, f.z);
      d.position.set(f.x, y + 0.05, f.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f.r * (1 + 0.05 * Math.sin(this.t * 2.2 + f.phase)));
      d.updateMatrix();
      this.ring.setMatrixAt(n++, d.matrix);
      if (work <= 0) continue;
      // étincelles dorées qui montent du bâtiment, fumée plus dense au-dessus
      f.emit += dt * work;
      while (f.emit > 0.16) {
        f.emit -= 0.16;
        const a = Math.random() * Math.PI * 2, rr = f.r * 0.45 * Math.random();
        this.puffs.spawn(f.x + Math.cos(a) * rr, y + 0.5, f.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.12, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.03, 1.1 + Math.random() * 0.7, GOLD, 1, { grow: 0.2, drag: 0.5, wind: 0.1, alpha: 1, fade: 0.4 });
        if (f.freight && Math.random() < 0.5) this.puffs.spawn(f.x + (Math.random() - 0.5) * f.r * 0.5, y + 1.1, f.z + (Math.random() - 0.5) * f.r * 0.5, 0, 0.35, 0, 0.2, 2.6, SMOKE, 0, { grow: 2.4, drag: 0.3, wind: 0.5, alpha: 0.5, fade: 0.3 });
      }
      // le chariot : charge au bâtiment, roule jusqu'à la gare, décharge, revient à vide
      if (f.freight && c < MAX_CARTS) {
        f.cart = (f.cart + dt * work * 0.11) % 1;
        const k = f.cart, out = k < 0.5, leg = out ? k * 2 : (1 - k) * 2, lo = Math.min(1, Math.max(0, (leg - 0.12) / 0.76));
        const e = lo * lo * (3 - 2 * lo);
        const x = f.ax + (f.bx - f.ax) * e, z = f.az + (f.bz - f.az) * e;
        d.position.set(x, w.surfaceAt(x, z) + 0.02 + Math.abs(Math.sin(this.t * 14 + f.phase)) * 0.008, z);
        d.rotation.set(0, Math.atan2(-(f.bz - f.az), f.bx - f.ax) + (out ? 0 : Math.PI), 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.body.setMatrixAt(c, d.matrix);
        // la cargaison ne voyage que dans le sens de la gare ; au retour, on la réduit à un point
        if (!out) d.scale.setScalar(0.001), d.updateMatrix();
        this.load.setMatrixAt(c, d.matrix);
        c++;
      }
    }
    this.ring.count = n; this.body.count = c; this.load.count = c;
    for (const m of [this.ring, this.body, this.load]) m.instanceMatrix.needsUpdate = true;
  }

  /** Refait la liste de ceux qu'on anime, en gardant l'état (phase du chariot) de ceux qui restent */
  private refresh(cx: number, cz: number, dist: number) {
    const old = new Map(this.active.map((f) => [f.id, f]));
    const reach = Math.min(70, 14 + dist * 1.2);
    this.active = RailBoost.pick(this.boosted, cx, cz, reach, MAX_FX).map(({ b, station, freight }) => {
      const s = sizeOf(b), ss = sizeOf(station), x = b.x + s / 2, z = b.z + s / 2;
      // le chariot va du bord du bâtiment au pied de la gare, non d'un centre à l'autre
      const sx = station.x + ss / 2, sz = station.z + ss / 2, L = Math.hypot(sx - x, sz - z) || 1, ux = (sx - x) / L, uz = (sz - z) / L;
      const prev = old.get(b.id);
      return {
        id: b.id, x, z, r: s * 0.75 + 0.5, freight,
        ax: x + ux * (s / 2 + 0.3), az: z + uz * (s / 2 + 0.3), bx: sx - ux * (ss / 2 + 0.3), bz: sz - uz * (ss / 2 + 0.3),
        phase: prev?.phase ?? b.id * 1.7, cart: prev?.cart ?? (b.id * 0.37) % 1, emit: prev?.emit ?? 0,
      };
    });
  }
}
