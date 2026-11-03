import * as THREE from 'three';
import { World, N } from '../world/world';
import { Building, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';

/** Vitesse de la cabine (cases par seconde le long des rails), arrêt en haut et en bas */
const SPEED = 0.32, PAUSE = 3.5;

/** Boîte tendue entre deux points (rails, montants, câbles) */
function bar(p: Parts, a: THREE.Vector3, b: THREE.Vector3, w: number, color: number, glow = false) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(w, w, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  p.add(g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, color, 0, glow);
}

interface Site {
  key: string;
  mesh: THREE.Mesh;
  cage: THREE.Group;
  ore: THREE.Mesh;
  cable: THREE.Mesh;
  beacon: THREE.Mesh | null;
  pts: THREE.Vector3[];
  cum: number[];
  len: number;
  pulley: THREE.Vector3;
  /** position le long des rails (0 en haut), sens, attente */
  s: number;
  dir: 1 | -1;
  wait: number;
}

/**
 * Monte-charge des avant-postes : quand l'entrée de la grotte ou de la faille est en contrebas, des rails descendent la paroi
 * du bord de l'avant-poste jusqu'à l'entrée ; une cabine y monte le wagonnet plein de minerai et le redescend vide, tirée
 * par le câble du treuil (chevalement et poulie au bord, cabane du treuil, quai de chargement et lanternes en bas). De bois
 * au Moyen Âge, de fer à l'âge industriel, d'acier peint en jaune et balisé ensuite
 */
export class Hoists {
  group = new THREE.Group();
  private sites = new Map<number, Site>();
  private beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.2) });
  private time = 0;

  constructor(private world: World) {}

  update(dt: number) {
    const w = this.world, live = new Set<number>();
    this.time += dt;
    for (const b of w.buildings.values()) {
      if (b.kind !== 'outpost' || b.age < 2) continue;
      const s = sizeOf(b), e = w.outpostEntrance(b.x, b.z, s);
      if (e < 0) continue;
      const key = `${b.x}|${b.z}|${b.rot}|${e}|${w.visVersion}|${Math.min(b.age, 4)}`;
      let site = this.sites.get(b.id);
      if (site && site.key !== key) { this.drop(site); site = undefined; this.sites.delete(b.id); }
      if (!site) { const made = this.build(b, e, key); if (!made) continue; site = made; this.sites.set(b.id, site); }
      live.add(b.id);
      this.step(site, dt);
    }
    for (const [id, s] of this.sites) if (!live.has(id)) { this.drop(s); this.sites.delete(id); }
  }

  private drop(s: Site) {
    this.group.remove(s.mesh, s.cage, s.cable);
    s.mesh.geometry.dispose();
    s.cage.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  private build(b: Building, e: number, key: string): Site | null {
    const w = this.world, s = sizeOf(b), age = Math.min(b.age, 4);
    const bx = (e % N) + 0.5, bz = Math.floor(e / N) + 0.5;
    // du bord de l'avant-poste le plus proche de l'entrée jusqu'à l'entrée
    const tx = Math.max(b.x + 0.05, Math.min(b.x + s - 0.05, bx)), tz = Math.max(b.z + 0.05, Math.min(b.z + s - 0.05, bz));
    const hs: number[] = [];
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(b.x + i, b.z + j));
    hs.sort((p, q) => p - q);
    const topY = hs[hs.length >> 1], botY = w.hAt(bx, bz);
    if (topY - botY < 0.6) return null;
    const L = Math.hypot(bx - tx, bz - tz);
    if (L < 0.1) return null;
    const ux = (bx - tx) / L, uz = (bz - tz) / L, lx = -uz, lz = ux;
    // les rails suivent la paroi, jamais dans la roche : en ligne droite, soulevés là où la falaise fait ventre
    const n = Math.max(6, Math.ceil(L / 0.12)), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, x = tx + ux * L * f, z = tz + uz * L * f;
      pts.push(new THREE.Vector3(x, Math.max(topY + (botY - topY) * f, w.hAt(x, z) + 0.06), z));
    }
    pts[0].y = topY + 0.02;
    for (let k = 0; k < 2; k++) for (let i = 1; i < n; i++) pts[i].y = Math.max(pts[i].y, (pts[i - 1].y + pts[i + 1].y) / 2);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const wood = 0x7a5a3e, iron = 0x4a5058, steel = 0x8a96a2, paint = 0xf2c23a;
    const rail = age <= 2 ? wood : age === 3 ? iron : steel, frame = age <= 2 ? wood : age === 3 ? iron : paint;
    const p = new Parts(), V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // rails et traverses, scellés dans la paroi
    for (const sd of [-1, 1]) for (let i = 0; i < n; i++) bar(p, V(pts[i].x + lx * sd * 0.07, pts[i].y, pts[i].z + lz * sd * 0.07), V(pts[i + 1].x + lx * sd * 0.07, pts[i + 1].y, pts[i + 1].z + lz * sd * 0.07), age <= 2 ? 0.022 : 0.016, rail);
    for (let i = 0; i <= n; i += 2) bar(p, V(pts[i].x - lx * 0.1, pts[i].y - 0.012, pts[i].z - lz * 0.1), V(pts[i].x + lx * 0.1, pts[i].y - 0.012, pts[i].z + lz * 0.1), 0.018, age <= 2 ? 0x5a4030 : 0x6a5a4a);
    // chevalement au bord : deux montants inclinés, traverse, poulie
    const top = pts[0], pulley = V(top.x + ux * 0.12, top.y + 0.5, top.z + uz * 0.12);
    for (const sd of [-1, 1]) {
      bar(p, V(top.x + lx * sd * 0.14 - ux * 0.12, top.y, top.z + lz * sd * 0.14 - uz * 0.12), V(pulley.x + lx * sd * 0.08, pulley.y + 0.02, pulley.z + lz * sd * 0.08), 0.03, frame);
      bar(p, V(top.x + lx * sd * 0.14 + ux * 0.1, top.y, top.z + lz * sd * 0.14 + uz * 0.1), V(pulley.x + lx * sd * 0.08, pulley.y + 0.02, pulley.z + lz * sd * 0.08), 0.022, frame);
    }
    bar(p, V(pulley.x - lx * 0.1, pulley.y + 0.03, pulley.z - lz * 0.1), V(pulley.x + lx * 0.1, pulley.y + 0.03, pulley.z + lz * 0.1), 0.026, frame);
    p.add(new THREE.TorusGeometry(0.05, 0.012, 4, 12).rotateY(Math.atan2(lx, lz) + Math.PI / 2), pulley.x, pulley.y, pulley.z, 0x3c3c40);
    // cabane du treuil, en retrait sur l'avant-poste, et son tambour ; câble jusqu'à la poulie
    const hx = top.x - ux * 0.42, hz = top.z - uz * 0.42, ry = Math.atan2(ux, uz);
    const hut = age <= 2 ? 0x9a7452 : age === 3 ? 0xb4685c : 0xd8d6d0, roof = age <= 2 ? 0x6a564a : age === 3 ? 0x8e9bb4 : 0x5d6878;
    p.add(new THREE.BoxGeometry(0.26, 0.2, 0.2).translate(0, 0.1, 0), hx, topY, hz, hut, ry);
    p.add(new THREE.BoxGeometry(0.3, 0.03, 0.24).translate(0, 0.215, 0), hx, topY, hz, roof, ry);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8).rotateZ(Math.PI / 2).translate(0, 0.07, 0.13), hx, topY, hz, 0x3c3c40, ry);
    if (age === 3) p.add(new THREE.CylinderGeometry(0.02, 0.025, 0.2, 6).translate(0.08, 0.32, -0.04), hx, topY, hz, 0x7a4a40, ry);
    bar(p, V(hx + ux * 0.13, topY + 0.07, hz + uz * 0.13), pulley, 0.006, 0x2a2a2e);
    // quai de chargement en bas, lanternes en haut et en bas
    const bot = pts[n];
    p.add(new THREE.BoxGeometry(0.4, 0.03, 0.34).translate(0, 0.015, 0), bot.x + ux * 0.1, w.hAt(bot.x, bot.z), bot.z + uz * 0.1, age <= 2 ? 0x9a7452 : 0xb8b4ac, ry);
    for (const [px, pz, py] of [[top.x + lx * 0.2, top.z + lz * 0.2, top.y], [bot.x + lx * 0.22 + ux * 0.1, bot.z + lz * 0.22 + uz * 0.1, w.hAt(bot.x, bot.z)]]) {
      p.add(new THREE.BoxGeometry(0.016, 0.28, 0.016).translate(0, 0.14, 0), px, py, pz, 0x3c3c40);
      p.add(new THREE.BoxGeometry(0.036, 0.045, 0.036), px, py + 0.3, pz, age >= 4 ? 0xfff1c9 : 0xffd27a, 0, true);
    }
    for (let k = 0; k < 3; k++) p.add(new THREE.IcosahedronGeometry(0.035, 0), bot.x + ux * 0.2 + lx * (k - 1) * 0.08, w.hAt(bot.x, bot.z) + 0.04, bot.z + uz * 0.2 + lz * (k - 1) * 0.08, 0x6a6660);
    const built = p.build(false), mesh = new THREE.Mesh(built.body, mats.body);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    if (built.glow) mesh.add(new THREE.Mesh(built.glow, mats.glow));
    // la cabine : plancher, garde-corps, montants et chapeau, wagonnet ; le minerai à part (plein en montant)
    const cp = new Parts();
    cp.box(0.2, 0.02, 0.2, 0, 0, 0, frame);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cp.box(0.014, 0.22, 0.014, sx * 0.09, 0.02, sz * 0.09, frame);
    cp.box(0.2, 0.014, 0.2, 0, 0.23, 0, frame);
    for (const s2 of [-1, 1]) { cp.box(0.2, 0.012, 0.012, 0, 0.1, s2 * 0.09, frame); cp.box(0.012, 0.012, 0.2, s2 * 0.09, 0.1, 0, frame); }
    cp.box(0.12, 0.07, 0.15, 0, 0.04, 0, 0x4a4a50);
    for (const s2 of [-1, 1]) cp.add(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8).rotateZ(Math.PI / 2), s2 * 0.065, 0.035, 0, 0x2a2a2e);
    const cage = new THREE.Group(), cm = new THREE.Mesh(cp.build(false).body, mats.body);
    cm.castShadow = true;
    cage.add(cm);
    const op = new Parts();
    for (let k = 0; k < 5; k++) op.add(new THREE.IcosahedronGeometry(0.03, 0), (k % 3 - 1) * 0.035, 0.115, (Math.floor(k / 3) - 0.5) * 0.05, [0x8a7a6a, 0x6a6660, 0xc8a050][k % 3]);
    const ore = new THREE.Mesh(op.build(false).body, mats.body);
    cage.add(ore);
    let beacon: THREE.Mesh | null = null;
    if (age >= 4) { beacon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.03), this.beaconMat); beacon.position.set(0, 0.255, 0); cage.add(beacon); }
    cage.rotation.y = ry;
    this.group.add(cage);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 1), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 }));
    this.group.add(cable);
    return { key, mesh, cage, ore, cable, beacon, pts, cum, len: cum[cum.length - 1], pulley, s: 0, dir: 1, wait: PAUSE };
  }

  private step(site: Site, dt: number) {
    if (site.wait > 0) site.wait -= dt;
    else {
      site.s += site.dir * SPEED * dt;
      if (site.s >= site.len) { site.s = site.len; site.dir = -1; site.wait = PAUSE; }
      else if (site.s <= 0) { site.s = 0; site.dir = 1; site.wait = PAUSE; }
    }
    let i = 1;
    while (i < site.cum.length - 1 && site.cum[i] < site.s) i++;
    const a = site.pts[i - 1], b = site.pts[i], f = (site.s - site.cum[i - 1]) / Math.max(1e-6, site.cum[i] - site.cum[i - 1]);
    site.cage.position.lerpVectors(a, b, f);
    // plein de minerai en remontant (et en haut, le temps de le décharger), vide en descendant
    site.ore.visible = site.dir === -1 ? site.wait > 0 && site.s >= site.len - 0.01 : site.s > 0.01 && site.s < site.len;
    if (site.beacon) site.beacon.visible = site.wait <= 0 && Math.floor(this.time * 3) % 2 === 0;
    const top = site.cage.position.clone().setY(site.cage.position.y + 0.24), d = top.distanceTo(site.pulley);
    site.cable.position.lerpVectors(top, site.pulley, 0.5);
    site.cable.scale.set(1, 1, Math.max(0.01, d));
    site.cable.lookAt(site.pulley);
  }
}
