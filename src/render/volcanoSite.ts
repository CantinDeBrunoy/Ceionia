import * as THREE from 'three';
import type { World } from '../world/world';
import type { ActiveExpedition } from '../sim/expeditions';
import type { Act } from '../sim/agents';
import { makeFolk, folkStep, Folk, FolkPose } from './folk';
import { Parts } from './parts';
import { mats } from './materials';

/**
 * Le décor des expéditions du volcan, posé sur son flanc (voir `VOLCANIC`, `sim/volcano.ts`). L'équipe débarque sur la plage
 * de l'île (`land`, ou le pied du cône si elle est venue à pied), monte au lieu du travail (`gate`), s'y affaire, redescend :
 * - l'obsidienne : des éclats noirs et brillants qu'on ramasse un à un (les sacs se remplissent) ; la coulée tiède, une croûte
 *   fendue de lave et sa vapeur, de grands blocs qu'on taille ;
 * - la montée au cratère : la cordée sur la crête (une corde de l'un à l'autre), le soufre jaune qu'on gratte au bord, la
 *   fumée du cratère ; au bord du lac de lave, la chaleur, les étincelles ;
 * - le village sous le volcan : cases de pêcheurs, filets, villageois ; le cratère fume, une coulée descend vers les cases.
 *   On évacue (les villageois descendent à la plage et montent à bord) ou l'on creuse une tranchée (la coulée s'y arrête et
 *   file de côté ; à l'échec, elle la franchit)
 * Les places de l'équipe suivent l'avancement du travail, comme sur l'île du portail (`ISLE_*`)
 */

/** En part du travail : on aborde, on arrive au lieu du travail, on en repart, on remonte à bord (voir `ISLE_*`) */
const LAND = 0.22, UP = 0.34, DOWN = 0.7, BACK = 0.8;
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

const LAVA = new THREE.MeshBasicMaterial({ color: 0xff6a1e });
const LAVA_HOT = new THREE.MeshBasicMaterial({ color: 0xffc04a });
const CRUST = new THREE.MeshLambertMaterial({ color: 0x2a2222 });
const ROPE = new THREE.LineBasicMaterial({ color: 0x8a6a40 });

const cache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}

/** Un éclat d'obsidienne : une pierre noire à facettes, une arête claire qui accroche la lumière */
export const shardGeo = (big = false) => geo(`shard${big}`, (p) => {
  const s = big ? 1.8 : 1;
  p.add(new THREE.OctahedronGeometry(0.035 * s, 0).scale(1, 1.5, 0.7), 0, 0.03 * s, 0, 0x1d1b26, 0.4, false, 0.25);
  p.add(new THREE.OctahedronGeometry(0.024 * s, 0).scale(1, 1.2, 0.6), 0.03 * s, 0.018 * s, 0.012 * s, 0x2a2836, 1.3, false, -0.4);
  p.add(new THREE.BoxGeometry(0.006 * s, 0.03 * s, 0.006 * s), -0.004 * s, 0.045 * s, 0.022 * s, 0x9aa0b8, 0.4, false, 0.25);
});

/** Une croûte de soufre jaune, au bord du cratère */
const sulfurGeo = () => geo('sulfur', (p) => {
  p.add(new THREE.IcosahedronGeometry(0.05, 0).scale(1.3, 0.35, 1), 0, 0.01, 0, 0xe6cf3a);
  p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.5, 1), 0.04, 0.012, 0.03, 0xf2e070);
});

/** Un sac de toile, ventru */
const sackGeo = () => geo('vsack', (p) => {
  p.sphere(0.04, 0, 0.04, 0, 0xb89a6a, 0, 1.1);
  p.cyl(0.012, 0.018, 0.02, 6, 0, 0.085, 0, 0x8a6a40);
});

/** Une case de pêcheur : murs de pierre sèche ronds, toit de chaume conique, porte sombre */
const hutGeo = () => geo('vhut', (p) => {
  p.cyl(0.13, 0.14, 0.14, 8, 0, 0, 0, 0x8c8478);
  p.cone(0.18, 0.16, 8, 0, 0.14, 0, 0x9a7a44);
  p.box(0.05, 0.08, 0.02, 0, 0, 0.135, 0x3a2a20);
});

/** Un séchoir à filets : deux piquets et le filet tendu */
const netGeo = () => geo('vnet', (p) => {
  for (const s of [-1, 1]) p.cyl(0.006, 0.006, 0.16, 4, s * 0.12, 0, 0, 0x6a4a30);
  p.box(0.24, 0.1, 0.006, 0, 0.05, 0, 0x7a8a7a);
});

/** Un drapeau planté au bord du cratère */
const flagGeo = () => geo('vflag', (p) => {
  p.cyl(0.005, 0.006, 0.3, 4, 0, 0, 0, 0x6a4a30);
  p.box(0.11, 0.065, 0.004, 0.055, 0.23, 0, 0xc83a2a);
});

interface Villager { folk: Folk; home: [number, number]; x: number; z: number; face: number; pose: FolkPose; off: number }

export class VolcanoSite {
  /** où regarde la vue : entre la plage et le lieu du travail, puis le lieu du travail */
  focus: [number, number];
  private shards: THREE.Object3D[] = [];
  private sacks: THREE.Object3D[] = [];
  private flows: { segs: THREE.Mesh[]; from: number }[] = [];
  private trench: THREE.Mesh | null = null;
  private turn: THREE.Mesh[] = [];
  private folks: Villager[] = [];
  private rope: THREE.Line | null = null;
  private flag: THREE.Object3D | null = null;
  private crater: [number, number, number];
  private t = 0;
  private puffT = 0;
  private hot = false;
  /** l'équipe a mis pied sur l'île (les places de chacun sont prises) */
  private spots: [number, number][] = [];

  constructor(private world: World, private group: THREE.Group, private props: THREE.Object3D[], private a: ActiveExpedition,
    readonly land: [number, number], readonly gate: [number, number], private top: [number, number],
    private puff: (x: number, y: number, z: number, kind: 'puff' | 'smoke', vx?: number, vz?: number) => void) {
    const [gx, gz] = gate, [lx, lz] = land, w = world, story = a.c.scene, n = a.party.length;
    const ux = (lx - gx) / Math.max(0.01, Math.hypot(lx - gx, lz - gz)), uz = (lz - gz) / Math.max(0.01, Math.hypot(lx - gx, lz - gz));
    // (de côté : perpendiculaire au chemin)
    const px = -uz, pz = ux;
    this.crater = [top[0], w.surfaceAt(top[0], top[1]), top[1]];
    this.focus = [(gx * 2 + lx) / 3, (gz * 2 + lz) / 3];
    this.hot = a.c.variant === 'hot' || a.c.variant === 'lava';
    if (story === 'obsidian') {
      const big = a.c.variant === 'hot';
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + 0.3, r = 0.22 + (i % 3) * 0.12;
        this.shards.push(this.put(shardGeo(big), gx + Math.cos(ang) * r, gz + Math.sin(ang) * r, i * 1.7));
      }
      // la coulée tiède : une croûte noire fendue de lave, en amont du chantier
      if (big) this.flow(gx - ux * 0.55, gz - uz * 0.55, gx - ux * 1.6, gz - uz * 1.6, 5, 0.06);
      for (let i = 0; i < n; i++) this.spots.push([gx + Math.cos(Math.atan2(uz, ux) + (i - (n - 1) / 2) * 0.7) * 0.32, gz + Math.sin(Math.atan2(uz, ux) + (i - (n - 1) / 2) * 0.7) * 0.32]);
    } else if (story === 'ascent') {
      // le soufre au bord, le drapeau qu'on plantera ; au bord du lac de lave, plus près du feu
      for (let i = 0; i < 5; i++) this.shards.push(this.put(sulfurGeo(), gx + px * (i - 2) * 0.2 - ux * 0.12, gz + pz * (i - 2) * 0.2 - uz * 0.12, i));
      this.flag = this.put(flagGeo(), gx + ux * 0.25 + px * 0.35, gz + uz * 0.25 + pz * 0.35, Math.atan2(px, pz));
      this.flag.visible = false;
      for (let i = 0; i < n; i++) this.spots.push([gx + px * (i - (n - 1) / 2) * 0.22 + ux * 0.08, gz + pz * (i - (n - 1) / 2) * 0.22 + uz * 0.08]);
      if (a.c.variant !== 'lava') {
        // la cordée : une corde de l'un à l'autre, pendant la montée et la descente
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * Math.max(2, n)), 3));
        this.rope = new THREE.Line(g, ROPE);
        this.group.add(this.rope); this.props.push(this.rope);
      }
    } else {
      // le village de pêcheurs, au pied du cône ; la coulée qui descend du cratère vers ses cases
      const huts: [number, number][] = [[0, 0.1], [0.42, -0.12], [-0.4, -0.1], [0.2, 0.45], [-0.25, 0.42]];
      huts.forEach(([u, v], i) => {
        const x = gx + px * u + ux * v, z = gz + pz * u + uz * v;
        this.put(hutGeo(), x, z, Math.atan2(ux, uz) + (i - 2) * 0.3);
        // un villageois devant chaque case
        if (i < 4) {
          const fx = x + ux * 0.2, fz = z + uz * 0.2, folk = makeFolk({ age: Math.min(2, a.age), v: i * 37 + 11, role: i % 2 ? 'fisher' : 'villager' });
          folk.root.position.set(fx, w.surfaceAt(fx, fz), fz);
          this.group.add(folk.root); this.props.push(folk.root);
          this.folks.push({ folk, home: [fx, fz], x: fx, z: fz, face: Math.atan2(-ux, -uz), pose: 'idle', off: i * 1.3 });
        }
      });
      this.put(netGeo(), gx + px * 0.6 + ux * 0.4, gz + pz * 0.6 + uz * 0.4, Math.atan2(px, pz));
      // la coulée : du cratère vers le village (elle s'arrête au-dessus des cases)
      const [cx, cz] = top, d = Math.hypot(gx - cx, gz - cz), sx = cx + (gx - cx) * (1.6 / d), sz = cz + (gz - cz) * (1.6 / d);
      this.flow(sx, sz, gx - ux * 0.75, gz - uz * 0.75, 14, 0.09);
      if (a.c.variant === 'trench') {
        // la tranchée, en travers de la coulée, au-dessus des cases ; la lave qui s'y arrête file de côté, vers la mer
        const tx = gx - ux * 0.55, tz = gz - uz * 0.55;
        this.trench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.08), CRUST);
        this.trench.position.set(tx, w.surfaceAt(tx, tz) + 0.005, tz);
        this.trench.rotation.y = Math.atan2(px, pz) + Math.PI / 2;
        this.trench.scale.x = 0.001;
        this.group.add(this.trench); this.props.push(this.trench);
        for (let i = 0; i < 6; i++) {
          const x = tx - ux * 0.06 + px * (0.1 + i * 0.12), z = tz - uz * 0.06 + pz * (0.1 + i * 0.12);
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), LAVA);
          m.position.set(x, w.surfaceAt(x, z) + 0.015, z);
          m.rotation.y = Math.atan2(px, pz);
          m.visible = false;
          this.group.add(m); this.props.push(m); this.turn.push(m);
        }
        for (let i = 0; i < n; i++) this.spots.push([tx + ux * 0.1 + px * (i - (n - 1) / 2) * 0.2, tz + uz * 0.1 + pz * (i - (n - 1) / 2) * 0.2]);
      } else for (let i = 0; i < n; i++) this.spots.push([gx + ux * 0.25 + px * (i - (n - 1) / 2) * 0.24, gz + uz * 0.25 + pz * (i - (n - 1) / 2) * 0.24]);
    }
    // les sacs qui se remplissent, à côté de l'équipe
    if (story !== 'eruption') for (let i = 0; i < Math.min(3, n); i++) {
      const s = this.put(sackGeo(), gx + ux * 0.18 + px * (0.4 + i * 0.1), gz + uz * 0.18 + pz * (0.4 + i * 0.1), i);
      s.scale.setScalar(0.001);
      this.sacks.push(s);
    }
  }

  /** Un objet du décor, posé au sol */
  private put(g: THREE.BufferGeometry, x: number, z: number, ry = 0) {
    const m = new THREE.Mesh(g, mats.body);
    m.castShadow = true;
    m.position.set(x, this.world.surfaceAt(x, z), z);
    m.rotation.y = ry;
    this.group.add(m); this.props.push(m);
    return m;
  }

  /** Une coulée de lave de (x0, z0) à (x1, z1), en `n` tronçons posés sur la pente (qui s'allument un à un, voir `grow`) */
  private flow(x0: number, z0: number, x1: number, z1: number, n: number, wide: number) {
    const segs: THREE.Mesh[] = [], len = Math.hypot(x1 - x0, z1 - z0) / n, yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u + Math.sin(i * 1.7) * 0.04, z = z0 + (z1 - z0) * u + Math.cos(i * 1.3) * 0.04;
      const m = new THREE.Mesh(new THREE.BoxGeometry(wide * (1 + 0.3 * Math.sin(i)), 0.025, len * 1.25), i % 3 ? LAVA : LAVA_HOT);
      m.position.set(x, this.world.surfaceAt(x, z) + 0.012, z);
      m.rotation.y = yaw;
      this.group.add(m); this.props.push(m); segs.push(m);
    }
    this.flows.push({ segs, from: 0 });
  }

  /**
   * Chaque image : la place de chaque membre de l'équipe (de la plage au lieu du travail, l'ouvrage, le retour) ; `back` le
   * fait reculer vers la plage (un imprévu), `act` impose son geste
   */
  place(i: number, k: number, back: number, act: Act | null): { x: number; z: number; heading: number; act: Act } {
    const [lx, lz] = this.land, [sx, sz] = this.spots[i] ?? this.gate, n = this.spots.length || 1;
    const off = i - (n - 1) / 2, toBeach = Math.atan2(lz - sz, lx - sx);
    const bx = lx - Math.sin(toBeach) * off * 0.18, bz = lz + Math.cos(toBeach) * off * 0.18;
    const t = k < UP ? smooth((k - LAND) / (UP - LAND)) : k < DOWN ? 1 : 1 - smooth((k - DOWN) / (BACK - DOWN));
    const moving = k < UP || k >= DOWN;
    // la cordée monte en file : chacun un peu derrière le précédent
    const lag = this.rope && moving ? i * 0.05 : 0, tt = Math.max(0, t - lag);
    const x = bx + (sx - bx) * tt + Math.cos(toBeach) * back, z = bz + (sz - bz) * tt + Math.sin(toBeach) * back;
    const [gx, gz] = this.a.c.scene === 'ascent' ? this.top : this.gate;
    const heading = moving ? Math.atan2(k < UP ? sx - bx : bx - sx, k < UP ? sz - bz : bz - sz) : Math.atan2(gx - x, gz - z);
    const done = this.a.c.scene === 'ascent' && k > 0.62;
    return { x, z, heading, act: act ?? (moving ? 'stroll' : done ? 'cheer' : 'work') };
  }

  /** Le décor vit : le cratère fume, la lave avance, on ramasse, les sacs se remplissent, les villageois fuient ou attendent */
  update(dt: number, k: number, team: [number, number][], onSite: boolean, away: boolean, ok: boolean) {
    this.t += dt;
    const w = this.world, story = this.a.c.scene, u = smooth((k - UP) / (DOWN - UP)), [cx, cy, cz] = this.crater;
    // le cratère fume (à gros bouillons pendant l'éruption) ; la coulée tiède et le lac de lave dégagent de la vapeur
    if ((this.puffT -= dt) <= 0) {
      this.puffT = story === 'eruption' ? 0.18 : 0.5;
      this.puff(cx + (Math.random() - 0.5) * 0.6, cy + 0.2, cz + (Math.random() - 0.5) * 0.6, 'smoke', (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15);
      if (this.hot) { const [gx, gz] = this.gate; this.puff(gx + (Math.random() - 0.5) * 0.8, w.surfaceAt(gx, gz) + 0.08, gz + (Math.random() - 0.5) * 0.8, 'puff'); }
    }
    // l'ouvrage : les éclats et le soufre disparaissent un à un, les sacs se remplissent ; le drapeau planté au bord
    if (onSite || away) {
      this.shards.forEach((s, i) => { s.visible = u * this.shards.length < this.shards.length - i || (away && !ok); });
      this.sacks.forEach((s) => s.scale.setScalar(Math.max(0.001, onSite ? u : 0)));
      if (this.flag) this.flag.visible = k > 0.5 && (ok || !away);
    }
    // la lave : elle luit et ondule ; pendant l'éruption, la coulée descend vers le village
    for (const f of this.flows) f.segs.forEach((m, i) => {
      const lit = story !== 'eruption' || i < f.segs.length * Math.max(0.15, onSite || away ? Math.min(1, k * 1.4) : 0.15);
      m.visible = lit;
      m.scale.y = 1 + 0.3 * Math.sin(this.t * 3 + i);
    });
    if (this.trench) {
      // la tranchée se creuse ; la coulée, arrivée dessus, file de côté (à l'échec, elle la franchit vers les cases)
      this.trench.scale.x = Math.max(0.001, onSite || away ? u : 0);
      const front = k > 0.55, over = away && !ok;
      this.turn.forEach((m, i) => { m.visible = front && !over && i < (k - 0.55) * 30; });
      if (over) { const f = this.flows[0]; f.segs.forEach((m) => (m.visible = true)); }
    }
    // les villageois : ils regardent le cratère ; on évacue, ils descendent à la plage et montent à bord
    const leaving = story === 'eruption' && this.a.c.variant !== 'trench';
    this.folks.forEach((v, i) => {
      let tx = v.home[0], tz = v.home[1];
      if (leaving && k > 0.42) { const [lx, lz] = this.land; tx = lx + Math.cos(i * 1.7) * 0.25; tz = lz + Math.sin(i * 1.7) * 0.25; }
      const d = Math.hypot(tx - v.x, tz - v.z), step = Math.min(d, dt * 0.55);
      if (d > 0.02) { v.x += ((tx - v.x) / d) * step; v.z += ((tz - v.z) / d) * step; v.face = Math.atan2(tx - v.x, tz - v.z); v.pose = 'run'; }
      else { v.face = Math.atan2(cx - v.x, cz - v.z); v.pose = away && ok ? 'cheer' : 'idle'; }
      v.folk.root.position.set(v.x, w.surfaceAt(v.x, v.z), v.z);
      v.folk.root.rotation.y = v.face;
      // (à bord : ils partent avec la barque, puis suivent l'équipe au village)
      v.folk.root.visible = !(leaving && k >= BACK) && !(away && leaving);
      folkStep(v.folk, this.t * 1.6 + v.off, v.pose);
    });
    // la corde de la cordée, de l'un à l'autre
    if (this.rope) {
      const pos = this.rope.geometry.getAttribute('position') as THREE.BufferAttribute, roped = onSite && (k < UP + 0.02 || k > DOWN - 0.02) && k > LAND;
      this.rope.visible = roped && team.length > 1;
      // (un membre encore loin, qui rejoint la cordée en glissant, n'y est pas attaché : la corde aurait traversé la mer)
      let px = team[0]?.[0] ?? this.gate[0], pz = team[0]?.[1] ?? this.gate[1];
      for (let i = 0; i < pos.count; i++) {
        const p = team[i];
        if (p && Math.hypot(p[0] - px, p[1] - pz) < 1) { px = p[0]; pz = p[1]; }
        pos.setXYZ(i, px, w.surfaceAt(px, pz) + 0.12, pz);
      }
      pos.needsUpdate = true;
    }
    const [gx, gz] = this.gate, [lx, lz] = this.land;
    this.focus = k < UP || k > DOWN ? [(gx + lx) / 2, (gz + lz) / 2] : [gx, gz];
  }
}
