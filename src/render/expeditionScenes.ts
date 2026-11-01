import * as THREE from 'three';
import { World, SEA, VEG_FOREST } from '../world/world';
import { Agents } from '../sim/agents';
import { ActiveExpedition } from '../sim/expeditions';
import { HerdKind } from '../sim/missions';
import { makeActor, play, hasModel, Actor, ModelName } from './assets';
import { Parts } from './parts';
import { mats } from './materials';

/** Modèle et taille (longueur du corps) des bêtes des expéditions */
export const ANIMAL: Record<HerdKind | 'wolf', [ModelName, number]> = { sheep: ['sheep', 0.2], cow: ['cow', 0.3], pig: ['pig', 0.17], horse: ['horse', 0.34], wolf: ['wolf', 0.3] };

// ---------------- Accessoires (géométries partagées, faites à la première demande) ----------------
const cache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}
const tentGeo = () => geo('tent', (p) => {
  // toile rayée, entrée sombre, mâts qui dépassent
  p.gable(0.36, 0.3, 0.34, 0, 0, 0, 0xc8643a);
  p.gable(0.37, 0.12, 0.13, 0, 0.18, 0, 0xe8d6b0);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.181, 0, 0.07, 0.181, 0, -0.07, 0.181, 0.17, 0], 3)), 0, 0, 0, 0x3a2a22);
  p.box(0.014, 0.34, 0.014, 0.18, 0, 0, 0x7a6355);
  p.box(0.014, 0.34, 0.014, -0.18, 0, 0, 0x7a6355);
});
const fireGeo = () => geo('fire', (p) => {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; p.sphere(0.025, Math.cos(a) * 0.075, 0.012, Math.sin(a) * 0.075, 0x8a857c); }
  for (const r of [0, 1.05, 2.1]) p.box(0.022, 0.022, 0.13, 0, 0.01, 0, 0x6a4a34, r);
});
const boatGeo = () => geo('boat', (p) => {
  const side = 0x9a6a44, dark = 0x6f4a30;
  p.box(0.15, 0.012, 0.3, 0, 0, 0, dark);
  for (const s of [-1, 1]) { p.box(0.014, 0.05, 0.3, s * 0.07, 0, 0, side); p.box(0.008, 0.008, 0.28, s * 0.11, 0.035, 0.01, 0xb08458, s * 0.45); }
  p.box(0.15, 0.05, 0.014, 0, 0, -0.15, side);
  p.box(0.1, 0.05, 0.05, 0, 0, 0.17, side);
  p.box(0.05, 0.05, 0.04, 0, 0, 0.21, side);
  p.box(0.13, 0.01, 0.045, 0, 0.032, 0.06, 0xb08458);
  p.box(0.13, 0.01, 0.045, 0, 0.032, -0.08, 0xb08458);
});
const rodGeo = () => geo('rod', (p) => p.add(new THREE.CylinderGeometry(0.003, 0.006, 0.42, 4).translate(0, 0.21, 0), 0, 0, 0, 0x6a4a34));
const bobberGeo = () => geo('bobber', (p) => { p.sphere(0.014, 0, 0.004, 0, 0xffffff); p.sphere(0.0145, 0, 0.012, 0, 0xd8443a, 0, 0.6); });
const fishGeo = () => geo('fish', (p) => {
  p.sphere(0.03, 0, 0, 0, 0xc9cdd2, 0, 0.55);
  p.add(new THREE.ConeGeometry(0.02, 0.035, 3).rotateX(-Math.PI / 2), 0, 0, -0.04, 0xa8adb4);
});
const rocksGeo = () => geo('rocks', (p) => {
  for (const [x, z, r, c] of [[0, 0, 0.13, 0x8d8a84], [0.13, 0.05, 0.09, 0x7d7a74], [-0.1, 0.08, 0.08, 0x9a958c], [0.04, -0.12, 0.085, 0x86827b], [-0.07, -0.06, 0.07, 0x7a766f]] as number[][])
    p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1), x, r * 0.55, z, c);
  for (const [x, y, z, c] of [[0.05, 0.16, 0.03, 0xd8a64a], [-0.08, 0.1, 0.1, 0x8fb3c9], [0.14, 0.11, -0.02, 0xd8a64a], [-0.02, 0.13, -0.1, 0xb0574a]] as number[][])
    p.add(new THREE.IcosahedronGeometry(0.022, 0), x, y, z, c);
});
const cartGeo = () => geo('cart', (p) => {
  p.box(0.14, 0.06, 0.2, 0, 0.05, 0, 0x9a7452);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8).rotateZ(Math.PI / 2), s * 0.08, 0.04, 0, 0x5a3e2e);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.16, s * 0.05, 0.08, 0.15, 0x7a6355);
});
const bushGeo = () => geo('bush', (p) => {
  p.sphere(0.11, 0, 0.09, 0, 0x4f8a45, 1, 0.8);
  p.sphere(0.07, 0.07, 0.07, 0.04, 0x5c9a50, 1, 0.8);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4, y = 0.05 + (i % 4) * 0.03, r = 0.1 - Math.abs(y - 0.09) * 0.5;
    p.sphere(0.014, Math.cos(a) * r, y, Math.sin(a) * r, i % 3 ? 0xc8344a : 0x5a3a8a);
  }
});
const basketGeo = () => geo('basket', (p) => { p.cyl(0.06, 0.045, 0.06, 8, 0, 0, 0, 0xb08a5a); p.cyl(0.064, 0.064, 0.008, 8, 0, 0.056, 0, 0x8a6a44); });
const berriesGeo = () => geo('berries', (p) => { for (let i = 0; i < 9; i++) p.sphere(0.018, Math.cos(i * 2.1) * 0.03, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.03, i % 3 ? 0xc8344a : 0x5a3a8a); });
const postGeo = () => geo('post', (p) => { p.box(0.026, 0.17, 0.026, 0, 0, 0, 0x8a6a4a); p.box(0.03, 0.012, 0.03, 0, 0.17, 0, 0x6f5238); });
const railGeo = () => geo('rail', (p) => p.box(0.01, 0.01, 1, 0, 0, -0.5, 0x9a7a5a));
const stoneGeo = () => geo('stone', (p) => { p.box(0.1, 0.05, 0.06, 0, 0, 0, 0x9a958c); p.box(0.07, 0.04, 0.055, 0.01, 0.05, 0, 0x8a857c); });
const trackGeo = () => geo('track', (p) => {
  for (const z of [0.07, 0.22]) p.box(0.17, 0.014, 0.035, 0, 0, z, 0x5a4232);
  for (const s of [-1, 1]) p.box(0.012, 0.016, 0.3, s * 0.05, 0.014, 0.15, 0x8a8f96);
});
const puffGeo = () => geo('puff', (p) => p.sphere(0.03, 0, 0, 0, 0xb8b2a8, 0));
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const LINE = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.8 });
const RING = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });

interface Beast { obj: THREE.Object3D; actor: Actor | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; speed: number }
interface Rod { rod: THREE.Mesh; bob: THREE.Mesh; line: THREE.Line }
interface Fx { obj: THREE.Object3D; t: number; life: number; kind: 'puff' | 'fish' | 'ring'; x: number; y: number; z: number; vx: number; vz: number }

/**
 * Ce que fait une équipe sur place, joué sur la carte : elle approche une harde et la caresse, part en barque pêcher au large
 * ou lance ses lignes depuis la berge, pioche un éboulis de minerai, cueille de buisson en buisson, traque un loup, plante les
 * piquets d'un enclos ou pose une voie ferrée, ou monte le camp autour d'un feu
 */
export class ExpeditionScene {
  private props: THREE.Object3D[] = [];
  private beasts: Beast[] = [];
  private fx: Fx[] = [];
  private rods = new Map<number, Rod>();
  /** points de travail (buissons, éboulis, piquets…) et ce que chaque membre y fait */
  private spots: [number, number][] = [];
  private next = new Map<number, number>();
  private goal = new Map<number, number>();
  private flame: THREE.Mesh | null = null;
  private boat: { obj: THREE.Object3D; home: [number, number]; out: [number, number]; y: number; riders: number[] } | null = null;
  /** l'eau près de la destination : un point mouillé et un point de berge, et le niveau de l'eau */
  private water: { wet: [number, number]; bank: [number, number]; level: number } | null = null;
  private built: THREE.Object3D[] = [];
  private basket: THREE.Mesh | null = null;
  private t = 0;
  private fxTimer = 0;
  readonly kind: string;

  constructor(private world: World, private agents: Agents, private group: THREE.Group, a: ActiveExpedition) {
    const [cx, cz] = a.dest;
    let kind: string = a.c.scene;
    if (kind === 'boat' || kind === 'fish') { this.water = this.findWater(cx, cz); if (!this.water) kind = 'camp'; }
    this.kind = kind;
    if (kind === 'camp' || kind === 'hunt') this.camp(cx, cz);
    if (kind === 'herd') {
      // la harde sauvage compte plus de bêtes que celles qu'on ramènera
      const kinds = a.c.win.flatMap((e) => (e.t === 'herd' ? e.kinds : []));
      const base = kinds.length ? kinds : ['sheep' as HerdKind];
      for (let i = 0; i < Math.min(6, Math.max(4, base.length + 2)); i++) this.addBeast(base[i % base.length], cx, cz, 0.7 + (i % 3) * 0.35, i * 1.3);
    } else if (kind === 'hunt') this.addBeast('wolf', cx, cz, 2.4, 0.5);
    else if (kind === 'boat') this.launch(a);
    else if (kind === 'fish') this.spots = this.bankSpots(a.party.length);
    else if (kind === 'mine') {
      const [rx, rz] = this.near(cx + 0.55, cz + 0.1, cx, cz);
      this.put(rocksGeo(), rx, rz, 0);
      const [kx, kz] = this.near(cx - 0.4, cz + 0.45, cx, cz);
      this.put(cartGeo(), kx, kz, 0.6);
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + 0.6; this.spots.push([rx + Math.cos(ang) * 0.26, rz + Math.sin(ang) * 0.26]); }
    } else if (kind === 'gather') {
      // les buissons de baies poussent en lisière : dans la clairière la plus proche, où l'on voit les cueilleurs
      const w = this.world, open = (x: number, z: number) => this.free(x, z) && w.veg[w.ci(Math.floor(x), Math.floor(z))] !== VEG_FOREST;
      let gx = cx, gz = cz;
      for (let r = 0.5; r <= 2.5 && !open(gx, gz); r += 0.5)
        for (let k = 0; k < 8; k++) { const x = cx + Math.cos(k * 0.785) * r, z = cz + Math.sin(k * 0.785) * r; if (open(x, z)) { gx = x; gz = z; break; } }
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.256 + 0.3, r = 0.55 + (i % 2) * 0.3;
        const [bx, bz] = this.near(gx + Math.cos(ang) * r, gz + Math.sin(ang) * r, gx, gz);
        if (!this.free(bx, bz)) continue;
        this.put(bushGeo(), bx, bz, ang);
        this.spots.push([bx - Math.cos(ang) * 0.2, bz - Math.sin(ang) * 0.2]);
      }
      this.put(basketGeo(), gx, gz, 0);
      this.basket = this.put(berriesGeo(), gx, gz, 0);
      this.basket.scale.setScalar(0.001);
    } else if (kind === 'build') {
      // enclos : des piquets en cercle (pierres sèches à partir du Moyen Âge), plantés au fil du travail
      const stone = a.m.age >= 2, n = 12;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2, x = cx + Math.cos(ang) * 0.95, z = cz + Math.sin(ang) * 0.95;
        if (!this.free(x, z)) continue;
        // un piquet et les deux traverses qui le relient au précédent
        const o = new THREE.Group();
        o.position.set(x, this.world.surfaceAt(x, z), z);
        const post = new THREE.Mesh(stone ? stoneGeo() : postGeo(), mats.body);
        post.rotation.y = -ang;
        post.castShadow = true;
        o.add(post);
        if (!stone && i > 0) {
          const pa = ((i - 1) / n) * Math.PI * 2, px = cx + Math.cos(pa) * 0.95, pz = cz + Math.sin(pa) * 0.95;
          for (const y of [0.06, 0.12]) {
            const r = new THREE.Mesh(railGeo(), mats.body);
            r.position.y = y;
            r.scale.z = Math.hypot(px - x, pz - z);
            r.rotation.y = Math.atan2(x - px, z - pz);
            o.add(r);
          }
        }
        this.group.add(o);
        this.props.push(o);
        o.visible = false;
        this.built.push(o);
        this.spots.push([cx + Math.cos(ang) * 0.7, cz + Math.sin(ang) * 0.7]);
      }
    } else if (kind === 'rails') {
      // voie ferrée : des tronçons posés l'un après l'autre, dans la direction la plus dégagée
      let best = 0, bestN = -1;
      for (let d = 0; d < 8; d++) {
        const ang = (d / 8) * Math.PI * 2;
        let n = 0;
        while (n < 10 && this.free(cx + Math.sin(ang) * 0.3 * (n + 1), cz + Math.cos(ang) * 0.3 * (n + 1))) n++;
        if (n > bestN) { bestN = n; best = ang; }
      }
      for (let i = 0; i < Math.max(3, bestN); i++) {
        const x = cx + Math.sin(best) * 0.3 * i, z = cz + Math.cos(best) * 0.3 * i;
        const o = this.put(trackGeo(), x, z, best);
        o.visible = false;
        this.built.push(o);
        this.spots.push([x + Math.cos(best) * 0.22, z - Math.sin(best) * 0.22]);
      }
    }
  }

  // ---------------- Mise en place ----------------
  private free(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz) && !w.decor[w.ci(cx, cz)];
  }

  /** Le point voulu s'il est libre, sinon un point libre plus près du centre */
  private near(x: number, z: number, cx: number, cz: number): [number, number] {
    for (let k = 1; k >= 0; k -= 0.25) { const px = cx + (x - cx) * k, pz = cz + (z - cz) * k; if (this.free(px, pz)) return [px, pz]; }
    return [cx, cz];
  }

  private put(g: THREE.BufferGeometry, x: number, z: number, ry: number) {
    const m = new THREE.Mesh(g, mats.body);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, this.world.surfaceAt(x, z), z);
    m.rotation.y = ry;
    this.group.add(m);
    this.props.push(m);
    return m;
  }

  /** Tente et feu de camp ; l'équipe s'assied autour */
  private camp(cx: number, cz: number) {
    const [tx, tz] = this.near(cx + 0.7, cz - 0.35, cx, cz);
    this.put(tentGeo(), tx, tz, Math.atan2(cx - tx, cz - tz) + Math.PI / 2);
    const fire = this.put(fireGeo(), cx, cz, 0);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5).translate(0, 0.065, 0), FLAME);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5).translate(0, 0.04, 0), FLAME_IN);
    this.flame.add(inner);
    this.flame.position.y = 0.015;
    fire.add(this.flame);
  }

  private addBeast(k: HerdKind | 'wolf', cx: number, cz: number, r: number, ang: number) {
    const [name, len] = ANIMAL[k];
    const actor = hasModel(name) ? makeActor(name, len) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
    if (actor) actor.mixer.setTime(ang);
    const [x, z] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, cx, cz);
    this.group.add(obj);
    this.beasts.push({ obj, actor, x, z, tx: x, tz: z, heading: ang, wait: 1 + ang, speed: k === 'wolf' ? 0.55 : 0.16 });
  }

  /** L'eau la plus proche : un point assez profond pour une barque, et le dernier point sec avant lui */
  private findWater(cx: number, cz: number) {
    const w = this.world;
    let best: { wet: [number, number]; bank: [number, number]; level: number } | null = null, bd = 1e9;
    for (let dz = -3.5; dz <= 3.5; dz += 0.25)
      for (let dx = -3.5; dx <= 3.5; dx += 0.25) {
        const x = cx + dx, z = cz + dz, d = Math.hypot(dx, dz), level = this.depth(x, z);
        if (level === null || d >= bd) continue;
        // dernier point sec sur la ligne du centre à l'eau
        let bank: [number, number] = [cx, cz];
        for (let k = 0; k <= 1; k += 0.05) { const px = cx + dx * k, pz = cz + dz * k; if (this.depth(px, pz) === null && this.free(px, pz)) bank = [px, pz]; else if (k > 0.2) break; }
        bd = d; best = { wet: [x, z], bank, level };
      }
    return best;
  }

  /** Niveau de l'eau en (x, z) s'il y a assez de fond pour une barque, sinon null */
  private depth(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return null;
    const k = w.ci(cx, cz), level = w.lake[k] ? w.lakeLevel[k] : SEA;
    if (!w.lake[k] && !w.isWet(cx, cz)) return null;
    return level - w.hAt(x, z) > 0.07 ? level : null;
  }

  /** Points de berge, face à l'eau, pour les pêcheurs à la ligne */
  private bankSpots(n: number) {
    const wat = this.water!, out: [number, number][] = [];
    const [bx, bz] = wat.bank, [wx, wz] = wat.wet, ang = Math.atan2(wz - bz, wx - bx);
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.32, x = bx - Math.sin(ang) * off, z = bz + Math.cos(ang) * off;
      if (this.free(x, z)) out.push([x, z]);
    }
    return out.length ? out : [wat.bank];
  }

  /** La barque, amarrée au bord de l'eau ; deux membres y montent, les autres pêchent depuis la berge */
  private launch(a: ActiveExpedition) {
    const wat = this.water!, [wx, wz] = wat.wet, [bx, bz] = wat.bank;
    const dx = wx - bx, dz = wz - bz, d = Math.max(0.01, Math.hypot(dx, dz));
    let out: [number, number] = [wx, wz];
    for (let k = 0.4; k <= 2; k += 0.2) { const x = wx + (dx / d) * k, z = wz + (dz / d) * k; if (this.depth(x, z) === null) break; out = [x, z]; }
    const obj = new THREE.Group();
    const hull = new THREE.Mesh(boatGeo(), mats.body);
    hull.castShadow = true;
    obj.add(hull);
    this.group.add(obj);
    this.props.push(obj);
    const riders = a.party.slice(0, Math.min(2, a.party.length));
    this.boat = { obj, home: [wx, wz], out, y: wat.level, riders };
    this.spots = this.bankSpots(Math.max(1, a.party.length - riders.length));
  }

  // ---------------- Animation ----------------
  update(dt: number, a: ActiveExpedition) {
    this.t += dt;
    const k = Math.min(1, a.t / Math.max(1, a.c.work + a.extra));
    if (this.flame) { const f = 1 + Math.sin(this.t * 17) * 0.12 + Math.sin(this.t * 29) * 0.08; this.flame.scale.set(f, 1.1 + Math.sin(this.t * 13) * 0.2, f); }
    for (const b of this.beasts) this.stepBeast(b, dt, a);
    if (this.boat) this.stepBoat();
    // ouvrages qui avancent avec le travail, panier qui se remplit
    this.built.forEach((o, i) => (o.visible = k * this.built.length > i));
    if (this.basket) this.basket.scale.setScalar(Math.max(0.001, k));
    if (!a.wait) this.stepMembers(dt, a, k);
    this.stepRods(a);
    this.stepFx(dt, a);
  }

  private stepBeast(b: Beast, dt: number, a: ActiveExpedition) {
    const w = this.world, [cx, cz] = a.dest, pos = this.agents.partyPositions(a.party);
    // un membre tout près : la bête s'arrête et se laisse approcher (le loup, lui, détale)
    const close = pos.find(([x, z]) => Math.hypot(x - b.x, z - b.z) < 0.45);
    const wolf = b.speed > 0.3;
    if (close && wolf) {
      const ang = Math.atan2(b.x - close[0], b.z - close[1]) + (Math.random() - 0.5);
      [b.tx, b.tz] = this.near(b.x + Math.sin(ang) * 1.6, b.z + Math.cos(ang) * 1.6, cx, cz);
      b.wait = 0;
    }
    let moving = false;
    if (close && !wolf) {
      b.heading = Math.atan2(close[0] - b.x, close[1] - b.z);
      b.tx = b.x; b.tz = b.z;
    } else {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const s = Math.min(d, b.speed * dt);
        const nx = b.x + (dx / d) * s, nz = b.z + (dz / d) * s;
        if (this.free(nx, nz)) { b.x = nx; b.z = nz; b.heading = Math.atan2(dx, dz); moving = true; } else { b.tx = b.x; b.tz = b.z; }
      } else if ((b.wait -= dt) <= 0) {
        b.wait = wolf ? 1 + Math.random() * 2 : 2.5 + Math.random() * 4;
        const r = wolf ? 1.8 + Math.random() * 1.2 : 0.5 + Math.random() * 1.3, ang = Math.random() * Math.PI * 2;
        [b.tx, b.tz] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, cx, cz);
      }
    }
    b.obj.position.set(b.x, w.surfaceAt(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) {
      play(b.actor, moving ? (wolf ? ['Gallop', 'Run', 'Walk'] : ['Walk', 'WalkSlow', 'Idle']) : close ? ['Idle', 'Idle_Eating'] : ['Idle_Eating', 'Eating', 'Idle']);
      b.actor.mixer.update(dt);
    }
  }

  /** La barque va et vient entre la berge et le large, en tanguant ; ses passagers y sont assis */
  private stepBoat() {
    const bt = this.boat!;
    // aller-retour lent (une vingtaine de secondes), pause au large le temps de pêcher
    const ph = (this.t / 22) % 1, u = ph < 0.3 ? smooth(ph / 0.3) : ph < 0.75 ? 1 : 1 - smooth((ph - 0.75) / 0.25);
    const x = bt.home[0] + (bt.out[0] - bt.home[0]) * u, z = bt.home[1] + (bt.out[1] - bt.home[1]) * u;
    const sway = Math.sin(this.t * 0.4) * 0.12, dir = Math.atan2(bt.out[0] - bt.home[0], bt.out[1] - bt.home[1]);
    let px = x + Math.cos(dir) * sway, pz = z - Math.sin(dir) * sway;
    if (this.depth(px, pz) === null) { px = x; pz = z; }
    const heading = dir + (ph >= 0.75 ? Math.PI : 0) + Math.sin(this.t * 0.4) * 0.15;
    const y = bt.y + 0.005 + Math.sin(this.t * 1.7) * 0.006;
    bt.obj.position.set(px, y, pz);
    bt.obj.rotation.set(Math.sin(this.t * 1.3) * 0.03, heading, Math.sin(this.t * 1.1) * 0.04);
    bt.riders.forEach((id, i) => {
      const lz = i ? -0.08 : 0.06, sx = Math.sin(heading), cz = Math.cos(heading);
      // le pêcheur, à l'arrière, se tourne vers le bord pour lancer sa ligne
      this.agents.ride(id, { x: px + sx * lz, z: pz + cz * lz, y: y + 0.03, heading: heading + (i ? Math.PI / 2 : 0) });
    });
  }

  /** Chaque membre (hors barque) va d'un point de travail à l'autre, ou reste au camp */
  private stepMembers(dt: number, a: ActiveExpedition, k: number) {
    const riders = this.boat?.riders ?? [];
    a.party.forEach((id, i) => {
      if (riders.includes(id)) return;
      let left = (this.next.get(id) ?? i * 0.8) - dt;
      if (this.kind === 'camp' && left <= 0) {
        // au camp : chacun s'assied au feu ou s'affaire, à tour de rôle
        this.agents.partyAct([id], (i + Math.floor(this.t / 9)) % 3 ? 'sit' : 'work');
        left = 9;
      } else if (left <= 0) {
        const target = this.pick(id, i, a, k);
        if (target) this.agents.memberGo(id, target[0], target[1], target[2]);
        left = this.kind === 'hunt' ? 4 + Math.random() * 2 : this.kind === 'fish' || this.kind === 'boat' ? 1e9 : 5 + Math.random() * 3;
        this.goal.set(id, 1);
      } else if (this.goal.get(id) && this.agents.memberDone(id)) {
        this.goal.delete(id);
        this.agents.partyAct([id], this.kind === 'hunt' ? 'stroll' : 'work');
      }
      this.next.set(id, left);
    });
  }

  /** Prochain point de travail d'un membre, et la direction à regarder une fois arrivé */
  private pick(id: number, i: number, a: ActiveExpedition, k: number): [number, number, number | null] | null {
    const [cx, cz] = a.dest;
    if (this.kind === 'herd' && this.beasts.length) {
      const b = this.beasts[(i + Math.floor(this.t / 6)) % this.beasts.length];
      const ang = Math.atan2(cx - b.x, cz - b.z) + (i - 1) * 0.6;
      return [b.x + Math.sin(ang) * 0.24, b.z + Math.cos(ang) * 0.24, ang + Math.PI];
    }
    if (this.kind === 'hunt' && this.beasts.length) {
      const b = this.beasts[0], ang = Math.atan2(b.x - cx, b.z - cz) + (i - 1) * 0.35;
      const [x, z] = this.near(cx + Math.sin(ang) * 1.4, cz + Math.cos(ang) * 1.4, cx, cz);
      return [x, z, Math.atan2(b.x - x, b.z - z)];
    }
    if (this.kind === 'fish' || this.kind === 'boat') {
      const s = this.spots[i % this.spots.length], wat = this.water!;
      return [s[0], s[1], Math.atan2(wat.wet[0] - wat.bank[0], wat.wet[1] - wat.bank[1])];
    }
    if (!this.spots.length) return null;
    // les ouvrages : au prochain piquet ou tronçon à poser ; ailleurs, de point en point
    const n = this.spots.length;
    const j = this.built.length ? Math.min(n - 1, Math.floor(k * n) + (i % 2)) : (i + Math.floor(this.t / 6)) % n;
    const [x, z] = this.spots[j];
    const face = this.kind === 'mine' ? Math.atan2(this.props[0].position.x - x, this.props[0].position.z - z) : this.built.length ? Math.atan2(this.built[j].position.x - x, this.built[j].position.z - z) : null;
    void id;
    return [x, z, face];
  }

  /** Cannes à pêche : le pêcheur à l'arrière de la barque, ceux de la berge une fois en place */
  private stepRods(a: ActiveExpedition) {
    if (this.kind !== 'boat' && this.kind !== 'fish') return;
    const fishers = this.kind === 'boat' ? [this.boat!.riders[this.boat!.riders.length - 1], ...a.party.filter((id) => !this.boat!.riders.includes(id))] : a.party;
    const w = this.world, wat = this.water!;
    for (const id of a.party) {
      const p = fishers.includes(id) && (this.boat?.riders.includes(id) || this.agents.memberDone(id)) ? this.agents.partyPositions([id])[0] : undefined;
      let r = this.rods.get(id);
      if (!p) { if (r) r.rod.visible = r.bob.visible = r.line.visible = false; continue; }
      if (!r) {
        r = { rod: new THREE.Mesh(rodGeo(), mats.body), bob: new THREE.Mesh(bobberGeo(), mats.body), line: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), LINE) };
        this.group.add(r.rod, r.bob, r.line);
        this.props.push(r.rod, r.bob, r.line);
        this.rods.set(id, r);
      }
      r.rod.visible = r.bob.visible = r.line.visible = true;
      const [x, z, h] = p, inBoat = this.boat?.riders.includes(id);
      const base = new THREE.Vector3(x + Math.sin(h) * 0.06, (inBoat ? this.boat!.obj.position.y + 0.06 : w.surfaceAt(x, z)) + 0.1, z + Math.cos(h) * 0.06);
      r.rod.position.copy(base);
      r.rod.rotation.set(0.9, h, 0, 'YXZ');
      const tip = new THREE.Vector3(0, 0.42, 0).applyEuler(r.rod.rotation).add(base);
      const bx = tip.x + Math.sin(h) * 0.12, bz = tip.z + Math.cos(h) * 0.12;
      r.bob.position.set(bx, wat.level + 0.004 + Math.sin(this.t * 2.3 + id) * 0.004 - (Math.sin(this.t * 0.9 + id) > 0.93 ? 0.012 : 0), bz);
      const lp = r.line.geometry.attributes.position as THREE.BufferAttribute;
      lp.setXYZ(0, tip.x, tip.y, tip.z); lp.setXYZ(1, bx, r.bob.position.y + 0.01, bz); lp.needsUpdate = true;
      r.line.geometry.computeBoundingSphere();
    }
  }

  /** Poussière des pioches, poissons qui sautent hors de l'eau */
  private stepFx(dt: number, a: ActiveExpedition) {
    this.fxTimer -= dt;
    if (this.fxTimer <= 0 && !a.wait) {
      if (this.kind === 'mine' && this.props[0]) {
        this.fxTimer = 0.35 + Math.random() * 0.5;
        const p = this.props[0].position, o = new THREE.Mesh(puffGeo(), mats.body);
        this.group.add(o);
        this.fx.push({ obj: o, t: 0, life: 1.2, kind: 'puff', x: p.x + (Math.random() - 0.5) * 0.25, y: p.y + 0.08, z: p.z + (Math.random() - 0.5) * 0.25, vx: (Math.random() - 0.5) * 0.08, vz: (Math.random() - 0.5) * 0.08 });
      } else if ((this.kind === 'boat' || this.kind === 'fish') && this.water) {
        this.fxTimer = 2.5 + Math.random() * 3.5;
        const c = this.boat ? this.boat.obj.position : new THREE.Vector3(this.water.wet[0], 0, this.water.wet[1]);
        const ang = Math.random() * Math.PI * 2, x = c.x + Math.cos(ang) * 0.4, z = c.z + Math.sin(ang) * 0.4;
        if (this.depth(x, z) !== null) {
          const f = new THREE.Mesh(fishGeo(), mats.body), ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 12).rotateX(-Math.PI / 2), RING);
          this.group.add(f, ring);
          const vx = Math.cos(ang + 1.2) * 0.25, vz = Math.sin(ang + 1.2) * 0.25;
          this.fx.push({ obj: f, t: 0, life: 0.7, kind: 'fish', x, y: this.water.level, z, vx, vz });
          this.fx.push({ obj: ring, t: 0, life: 1.2, kind: 'ring', x: x + vx * 0.7, y: this.water.level + 0.005, z: z + vz * 0.7, vx: 0, vz: 0 });
        }
      } else this.fxTimer = 1;
    }
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.obj); if (f.kind === 'ring') (f.obj as THREE.Mesh).geometry.dispose(); return false; }
      if (f.kind === 'puff') { f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * 0.12, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI) * (1 + k)); }
      else if (f.kind === 'fish') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + Math.sin(k * Math.PI) * 0.16, f.z + f.vz * f.t);
        f.obj.rotation.set(-Math.cos(k * Math.PI) * 1.1, Math.atan2(f.vx, f.vz), 0, 'YXZ');
      } else { f.obj.position.set(f.x, f.y, f.z); f.obj.scale.setScalar(1 + k * 3); }
      return true;
    });
  }

  /** Fin du travail sur place : on range tout (les passagers de la barque reviennent sur la berge) */
  dispose(a: ActiveExpedition) {
    for (const id of this.boat?.riders ?? []) this.agents.ride(id, null);
    for (const b of this.beasts) { b.actor?.mixer.stopAllAction(); this.group.remove(b.obj); }
    for (const o of this.props) this.group.remove(o);
    for (const f of this.fx) this.group.remove(f.obj);
    for (const r of this.rods.values()) r.line.geometry.dispose();
    this.flame?.geometry.dispose();
    void a;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
