import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Hell, HellEvent, DemonKind, DEMONS } from '../sim/hell';
import { caveLit } from './caveLight';
import { CombatFx } from './combatFx';
import { makeSoldier, soldierStep, Soldier, SoldierRole } from './soldiers';

/**
 * Les combattants d'une bataille (dans les Enfers ou sur l'île du portail) : démons en pièces animées (un maillage instancié
 * par pièce et par sorte), soldats du joueur, barres de vie, cercles de sélection et marque du dernier ordre, effets des coups.
 * Le tout dans un groupe, en coordonnées de la carte de la bataille (le groupe se place sur le monde)
 */

/** Échelle des modèles de démons (le modèle mesure 1 de haut) */
export const SCALE: Record<DemonKind, number> = { imp: 0.32, archer: 0.36, brute: 0.52, chief: 0.56, guardian: 0.95, king: 1.5, elite: 0.64 };
/** Instances au plus, par sorte de démon */
const CAP: Record<DemonKind, number> = { imp: 160, archer: 96, brute: 96, chief: 32, guardian: 12, king: 4, elite: 24 };
const KINDS = Object.keys(DEMONS) as DemonKind[];
const PARTS = ['body', 'glow', 'legL', 'legR', 'armL', 'armR', 'wingL', 'wingR'] as const;
type PartName = typeof PARTS[number];
interface Rig { parts: Partial<Record<PartName, { mesh: THREE.InstancedMesh; pivot: THREE.Vector3 }>> }

const BAR_M = new THREE.Matrix4(), BAR_S = new THREE.Matrix4();
const BAR_BG = new THREE.Color(0x1a0a0c), HELL_C = new THREE.Color(0xff4a3a), PLAYER_C = new THREE.Color(0x5adf6a), WEAK_C = new THREE.Color(0xffc040);
const BARS = 600, RINGS = 120;
/** Taille des soldats du joueur (au-dessus de celle des habitants : on les lit de loin) */
const TROOP_K: Record<string, number> = { soldier: 1.6, archer: 1.5, knight: 1.85 };
/** Le modèle de chaque troupe : lancier (lance et bouclier), archer (arc, carquois, capuchon), chevalier (armure, écu, épée) */
const TROOP_ROLE: Record<string, SoldierRole> = { soldier: 'spearman', archer: 'archer', knight: 'knight' };

export class BattleLayer {
  group = new THREE.Group();
  fx = new CombatFx();
  /** les unités choisies (cercle vert, barre de vie) */
  selected: Set<number> = new Set();
  /** la marque du dernier ordre au sol : point, sorte, âge (secondes) */
  mark: { x: number; z: number; kind: string; t: number } | null = null;
  /** âge des soldats du joueur (leur tenue) */
  age = 1;
  private uTime = 0;
  private rigs = {} as Record<DemonKind, Rig>;
  private troops = new Map<number, { s: Soldier; kind: string; age: number }>();
  private barBg: THREE.InstancedMesh;
  private barFill: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private markMesh: THREE.Mesh;
  private pin: THREE.Mesh;
  private m4 = new THREE.Matrix4();
  private m5 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private e2 = new THREE.Vector3();
  /** distance de la caméra au centre de la bataille (taille de la marque d'ordre) */
  private camDist = 14;
  private white = new THREE.Color(1, 1, 1);
  private flash = new THREE.Color(2.2, 1.7, 1.5);

  /** `groundY` : hauteur du sol où se tiennent les unités, en coordonnées de la bataille */
  constructor(public hell: Hell, private groundY: (x: number, z: number) => number, private onDestroyed?: (ev: Extract<HellEvent, { type: 'destroyed' }>) => void) {
    // barres de vie : un fond sombre, la jauge colorée (toujours par-dessus)
    const plane = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    const barMat = (o: number) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false });
    this.barBg = new THREE.InstancedMesh(plane, barMat(0.75), BARS);
    this.barFill = new THREE.InstancedMesh(plane, barMat(1), BARS);
    for (const b of [this.barBg, this.barFill]) { b.count = 0; b.frustumCulled = false; b.renderOrder = b === this.barFill ? 11 : 10; b.setColorAt(0, this.white); this.group.add(b); }
    // cercles de sélection, à plat sur le sol
    const ring = new THREE.RingGeometry(0.78, 1, 24).rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.85, depthWrite: false, fog: false }), RINGS);
    this.rings.count = 0; this.rings.frustumCulled = false; this.rings.renderOrder = 9;
    this.markMesh = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.markMesh.visible = false; this.markMesh.renderOrder = 9;
    // la flèche de l'ordre, pointe en bas (toujours visible, par-dessus le relief)
    this.pin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 4).rotateX(Math.PI).translate(0, 0.2, 0), new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    this.pin.visible = false; this.pin.renderOrder = 12;
    this.group.add(this.rings, this.markMesh, this.pin, this.fx.group);
    for (const k of KINDS) this.rigs[k] = this.makeRig(k);
  }

  /** Une image : les coups, les morts, les unités, les barres et les cercles */
  update(dt: number, camera: THREE.Camera, events: HellEvent[]) {
    this.uTime += dt;
    this.playEvents(events);
    this.drawDemons();
    this.drawTroops();
    this.drawBars(camera);
    this.drawRings();
    this.fx.update(dt);
  }

  /** Retire les soldats (on change de bataille) */
  dispose() {
    for (const t of this.troops.values()) this.group.remove(t.s.root);
    this.troops.clear();
  }

  /** Le modèle d'une sorte de démon, en pièces animées (corps, lueurs, jambes, bras, ailes) : un maillage instancié par pièce */
  private makeRig(kind: DemonKind): Rig {
    const def = demonParts(kind), rig: Rig = { parts: {} };
    const body = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }), 'hell-demon');
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (const name of PARTS) {
      const p = def[name];
      if (!p) continue;
      const mesh = new THREE.InstancedMesh(p.geo, name === 'glow' ? glow : body, CAP[kind]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      if (name === 'body') { for (let i = 0; i < CAP[kind]; i++) mesh.setColorAt(i, this.white); }
      this.group.add(mesh);
      rig.parts[name] = { mesh, pivot: p.pivot };
    }
    return rig;
  }

  /** Pose des démons : marche (jambes, bras, balancement), coup porté, ailes qui battent, chute à la mort */
  private drawDemons() {
    const t = this.uTime, counts = {} as Record<DemonKind, number>;
    for (const k of KINDS) counts[k] = 0;
    const root = this.m4, local = this.m5, q = this.q, v = this.v, s = this.s, e = this.e;
    for (const u of this.hell.units.values()) {
      if (u.side !== 'hell') continue;
      const kind = u.kind as DemonKind, rig = this.rigs[kind];
      if (!rig || counts[kind] >= CAP[kind]) continue;
      const i = counts[kind]++, sc = SCALE[kind];
      const dead = u.hp <= 0, fall = dead ? Math.min(1, u.hurt / 0.5) : 0;
      // les morts basculent, puis s'enfoncent dans un nuage de fumée violette
      const sink = dead ? Math.max(0, u.hurt - 1.2) * 0.6 : 0, shrink = dead ? Math.max(0.01, 1 - Math.max(0, u.hurt - 1.6)) : 1;
      const walk = u.moving ? u.walk : 0, bob = u.moving ? Math.abs(Math.sin(walk)) * 0.05 : Math.sin(t * 2 + u.id) * 0.012;
      const hover = kind === 'imp' ? 0.12 + Math.sin(t * 6 + u.id) * 0.04 : 0;
      v.set(u.x, this.groundY(u.x, u.z) + (bob + hover) * sc - sink, u.z);
      const atk = u.swing < 0.5 ? Math.sin((u.swing / 0.5) * Math.PI) : 0;
      e.set(-fall * 1.4 + atk * 0.18, u.heading, 0, 'YXZ');
      q.setFromEuler(e);
      s.setScalar(sc * shrink);
      root.compose(v, q, s);
      const pose = (name: PartName, rx: number, ry = 0, rz = 0) => {
        const p = rig.parts[name];
        if (!p) return;
        e.set(rx, ry, rz, 'XYZ');
        q.setFromEuler(e);
        s.setScalar(1);
        local.compose(p.pivot, q, s);
        local.premultiply(root);
        p.mesh.setMatrixAt(i, local);
      };
      const sw = Math.sin(walk), stride = kind === 'imp' ? 0.9 : kind === 'brute' || kind === 'guardian' ? 0.45 : 0.65;
      pose('body', 0);
      pose('glow', 0);
      pose('legL', sw * stride);
      pose('legR', -sw * stride);
      const archer = kind === 'archer';
      // l'archer tend son arc (bras gauche en avant) ; les autres frappent du bras droit, de haut en bas
      pose('armL', archer && u.state === 'attack' ? -1.45 : -sw * stride * 0.6);
      pose('armR', archer ? (u.state === 'attack' ? -1.3 + atk * 0.4 : sw * stride * 0.6) : u.swing < 0.5 ? -2.3 * atk + 0.4 * atk * atk : sw * stride * 0.6);
      const flap = kind === 'imp' ? Math.sin(t * 16 + u.id) * 0.55 : Math.sin(t * 2.2 + u.id) * 0.18 + (u.moving ? Math.sin(t * 7 + u.id) * 0.2 : 0);
      pose('wingL', 0, 0.5 + flap, 0);
      pose('wingR', 0, -0.5 - flap, 0);
      // touché : un éclair clair sur le corps
      rig.parts.body!.mesh.setColorAt(i, u.hurt < 0.12 && !dead ? this.flash : this.white);
    }
    for (const k of KINDS) {
      for (const p of Object.values(this.rigs[k].parts)) {
        p.mesh.count = counts[k];
        p.mesh.instanceMatrix.needsUpdate = true;
        if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Les unités du joueur : des soldats de l'époque (le chevalier, en armure du Moyen Âge au moins, un peu plus grand) */
  private drawTroops() {
    const seen = new Set<number>();
    for (const u of this.hell.units.values()) {
      if (u.side !== 'player') continue;
      seen.add(u.id);
      const age = u.kind === 'knight' ? Math.max(2, this.age) : this.age;
      let t = this.troops.get(u.id);
      if (t && (t.age !== age || t.kind !== u.kind)) { this.group.remove(t.s.root); t = undefined; }
      if (!t) { t = { s: makeSoldier(age, u.id, false, TROOP_ROLE[u.kind] ?? 'spearman'), kind: u.kind, age }; this.group.add(t.s.root); this.troops.set(u.id, t); }
      const s = t.s, dead = u.hp <= 0;
      s.root.position.set(u.x, this.groundY(u.x, u.z) - (dead ? Math.max(0, u.hurt - 1.2) * 0.3 : 0), u.z);
      s.root.rotation.set(dead ? -Math.min(1, u.hurt / 0.5) * 1.4 : 0, u.heading, 0, 'YXZ');
      s.root.scale.setScalar(TROOP_K[u.kind] ?? 1.6);
      soldierStep(s, u.moving ? u.walk : this.uTime, dead ? 'idle' : u.state === 'attack' ? 'fight' : u.moving ? (u.state === 'retreat' ? 'run' : 'walk') : 'guard');
      // touché : il recule d'un coup, le buste rejeté en arrière
      if (!dead && u.hurt < 0.18) s.body.rotation.x -= 0.4 * (1 - u.hurt / 0.18);
    }
    for (const [id, t] of this.troops) if (!seen.has(id)) { this.group.remove(t.s.root); this.troops.delete(id); }
  }

  /** Barres de vie : unités blessées, au combat ou choisies, les chefs toujours ; bâtiments entamés, la citadelle toujours */
  private drawBars(camera: THREE.Camera) {
    let n = 0;
    const q = camera.quaternion, m = this.m4, off = this.m5, v = this.v, s = this.s;
    // la caméra dans le repère de la bataille : de loin, les barres grossissent un peu (lisibles), de près elles restent fines
    const cam = this.e2.copy(camera.position);
    this.group.worldToLocal(cam);
    const put = (x: number, y: number, z: number, w0: number, frac: number, c: THREE.Color) => {
      if (n >= BARS) return;
      const k = Math.min(2.6, Math.max(0.75, Math.hypot(cam.x - x, cam.y - y, cam.z - z) / 14)), w = w0 * k;
      // la jauge part du bord gauche du fond (le plan va de 0 à 1 en x)
      v.set(x, y + 0.06 * (k - 1), z);
      s.set(1, 1, 1);
      m.compose(v, q, s);
      off.makeTranslation(-(w + 0.04 * k) / 2, 0, 0).multiply(BAR_S.makeScale(w + 0.04 * k, 0.1 * k, 1));
      this.barBg.setMatrixAt(n, BAR_M.multiplyMatrices(m, off));
      this.barBg.setColorAt(n, BAR_BG);
      off.makeTranslation(-w / 2, 0, 0.001).multiply(BAR_S.makeScale(Math.max(0.001, w * frac), 0.065 * k, 1));
      this.barFill.setMatrixAt(n, BAR_M.multiplyMatrices(m, off));
      this.barFill.setColorAt(n, c);
      n++;
    };
    for (const u of this.hell.units.values()) {
      if (u.hp <= 0) continue;
      const boss = u.kind === 'guardian' || u.kind === 'king' || u.kind === 'chief' || u.kind === 'elite';
      if (u.hp >= u.maxHp && !boss && u.state !== 'attack' && !this.selected.has(u.id)) continue;
      const sc = u.side === 'hell' ? SCALE[u.kind as DemonKind] ?? 0.4 : 0.45;
      const frac = u.hp / u.maxHp;
      put(u.x, this.groundY(u.x, u.z) + sc * 1.25 + 0.15, u.z, boss ? 0.9 : 0.5, frac, u.side === 'hell' ? HELL_C : frac > 0.35 ? PLAYER_C : WEAK_C);
    }
    for (const b of this.hell.buildings.values()) {
      if (b.down || (b.hp >= b.maxHp && b.kind !== 'kingdom')) continue;
      const h = b.kind === 'kingdom' ? 7.2 : b.kind === 'fortress' || b.kind === 'spire' ? 3.6 : b.kind === 'tower' ? 2.6 : b.kind === 'watchtower' ? 1.9 : b.kind === 'barracks' ? 1.5 : b.kind === 'palisade' || b.kind === 'brazier' ? 1.3 : 2.2;
      const frac = b.hp / b.maxHp;
      put(b.site.x, this.groundY(b.site.x, b.site.z) + h, b.site.z, b.kind === 'kingdom' ? 3 : 1.6, frac, b.side === 'hell' ? HELL_C : frac > 0.35 ? PLAYER_C : WEAK_C);
    }
    for (const b of [this.barBg, this.barFill]) {
      b.count = n;
      b.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
  }

  /** Cercles verts sous les unités choisies ; la marque de l'ordre, qui s'efface */
  private drawRings() {
    let n = 0;
    const m = this.m4, v = this.v, s = this.s, q = this.q.identity();
    for (const id of this.selected) {
      const u = this.hell.units.get(id);
      if (!u || u.hp <= 0 || n >= RINGS) continue;
      v.set(u.x, this.groundY(u.x, u.z) + 0.03, u.z);
      s.setScalar(u.stats.radius * 1.05 + 0.04);
      this.rings.setMatrixAt(n++, m.compose(v, q, s));
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    // la marque de l'ordre : un anneau qui s'élargit et une flèche qui se plante en rebondissant (verte : aller, tenir ; rouge :
    // attaquer ; ambre : se replier), à la taille de la vue
    const k = this.mark, LIFE = 1.2;
    if (k) k.t += 1 / 60;
    // (la caméra dans le repère de la bataille, relevée par `drawBars`)
    if (k) this.camDist = Math.hypot(this.e2.x - k.x, this.e2.y - this.groundY(k.x, k.z), this.e2.z - k.z);
    const on = !!k && k.t < LIFE;
    this.markMesh.visible = this.pin.visible = on;
    if (k && on) {
      const y = this.groundY(k.x, k.z), sz = Math.min(2.4, Math.max(0.8, this.camDist / 14)), fade = 1 - Math.max(0, k.t - 0.5) / (LIFE - 0.5);
      const col = k.kind === 'attack' ? 0xff5a4a : k.kind === 'retreat' ? 0xffc040 : 0x7dff8a;
      this.markMesh.position.set(k.x, y + 0.04, k.z);
      this.markMesh.scale.setScalar(sz * (1 + Math.min(1, k.t / 0.5) * 0.6));
      const mm = this.markMesh.material as THREE.MeshBasicMaterial, pm = this.pin.material as THREE.MeshBasicMaterial;
      mm.color.set(col); pm.color.set(col);
      mm.opacity = fade; pm.opacity = fade;
      const drop = Math.max(0, 1 - k.t / 0.25), bounce = k.t > 0.25 ? Math.abs(Math.sin((k.t - 0.25) * 9)) * 0.12 * Math.max(0, 1 - (k.t - 0.25) * 2) : 0;
      this.pin.position.set(k.x, y + (0.18 + drop * 0.9 + bounce) * sz, k.z);
      this.pin.scale.setScalar(sz);
      this.pin.rotation.y = k.t * 3;
    }
  }

  /** Ce que la simulation raconte : coups (étincelles), flèches, morts (fumée violette), bâtiments qui s'effondrent */
  private playEvents(events: HellEvent[]) {
    const h = this.hell;
    for (const ev of events.splice(0)) {
      if (ev.type === 'hit') {
        const t = h.units.get(ev.target), y = t ? this.groundY(ev.x, ev.z) + (t.side === 'hell' ? SCALE[t.kind as DemonKind] ?? 0.4 : 0.4) * 0.6 : this.groundY(ev.x, ev.z) + 1;
        if (!ev.ranged) this.fx.hit(ev.x, y, ev.z, t?.side === 'player' ? 0xff7a3a : 0xffd27a, 10, t?.side === 'player' ? 'bite' : 'blade');
      } else if (ev.type === 'shot') {
        // une vraie flèche qui vole en cloche (de feu pour les démons), plantée à mi-hauteur de sa cible
        const t = h.units.get(ev.target), th = t ? (t.side === 'hell' ? SCALE[t.kind as DemonKind] ?? 0.4 : 0.45) * 0.55 : 0.3;
        const y0 = this.groundY(ev.x0, ev.z0) + ev.y0, y1 = this.groundY(ev.x1, ev.z1) + th;
        this.fx.arrow(ev.x0, y0, ev.z0, ev.x1, y1, ev.z1, ev.fire);
      } else if (ev.type === 'death') {
        const y = this.groundY(ev.x, ev.z) + 0.2;
        if (ev.side === 'hell') { this.fx.hit(ev.x, y, ev.z, 0xb05aff, 18, 'bite'); this.fx.puff(ev.x, y, ev.z, 10); }
        else this.fx.puff(ev.x, y, ev.z, 6);
      } else if (ev.type === 'destroyed') {
        const y = this.groundY(ev.x, ev.z);
        this.fx.boom(ev.x, y + 1, ev.z);
        for (let i = 0; i < 4; i++) this.fx.puff(ev.x + Math.sin(i * 1.7) * 1.2, y + 0.5, ev.z + Math.cos(i * 1.7) * 1.2, 10);
        this.onDestroyed?.(ev);
      }
    }
  }
}

// ---------- Géométries ----------

/** Couleurs de sommet (facettes : sommets séparés, sans uv) ; `f` : nuance selon la hauteur relative */
export function paint(g: THREE.BufferGeometry, c: number | THREE.Color, f: (y: number) => number = () => 1) {
  const out = g.index ? g.toNonIndexed() : g;
  if (out.attributes.uv) out.deleteAttribute('uv');
  out.computeBoundingBox();
  const p = out.attributes.position, b = out.boundingBox!, h = Math.max(1e-6, b.max.y - b.min.y), col = new THREE.Color(c), arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = f((p.getY(i) - b.min.y) / h);
    arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  out.computeVertexNormals();
  return out;
}

export function merge(list: THREE.BufferGeometry[]) { return mergeGeometries(list)!; }

/**
 * Les pièces d'un démon (1 de haut, face à +z) : corps (buste, tête, cornes), lueurs (yeux, fissures de lave), jambes et bras
 * (pivot à la hanche, à l'épaule), ailes (pivot dans le dos) ; chacune peinte de ses couleurs
 */
export function demonParts(kind: DemonKind): Partial<Record<PartName, { geo: THREE.BufferGeometry; pivot: THREE.Vector3 }>> {
  const spec = {
    imp: { skin: 0xe8503a, dark: 0xa02a24, horn: 0xf4e4c8, eye: 0xfff04a, wing: 0x8a3ab0, belly: 0xf59a6a, hip: 0.36, sh: 0.64, w: 0.2, head: 0.21, torso: 0.2, limb: 0.055, wings: 0.5 },
    archer: { skin: 0xf0803a, dark: 0x5a2a4a, horn: 0xf4e4c8, eye: 0xfff04a, wing: 0, belly: 0xf8b070, hip: 0.4, sh: 0.68, w: 0.17, head: 0.17, torso: 0.17, limb: 0.045, wings: 0 },
    brute: { skin: 0x9a3a6a, dark: 0x5a1e40, horn: 0xeadcc0, eye: 0xffb030, wing: 0, belly: 0xc06a90, hip: 0.32, sh: 0.66, w: 0.3, head: 0.15, torso: 0.33, limb: 0.1, wings: 0 },
    chief: { skin: 0xc02a3a, dark: 0x6a1420, horn: 0xf4e4c8, eye: 0xfff04a, wing: 0x5a1a6a, belly: 0xe06a6a, hip: 0.4, sh: 0.7, w: 0.22, head: 0.17, torso: 0.24, limb: 0.07, wings: 0.45 },
    guardian: { skin: 0x4a3638, dark: 0x2a1e22, horn: 0xd8c8b0, eye: 0xffd030, wing: 0, belly: 0x5e4446, hip: 0.34, sh: 0.68, w: 0.3, head: 0.15, torso: 0.34, limb: 0.11, wings: 0 },
    king: { skin: 0xd02838, dark: 0x5a0e1e, horn: 0x2a1a20, eye: 0xfff4a0, wing: 0x3a1450, belly: 0xf07a5a, hip: 0.4, sh: 0.7, w: 0.24, head: 0.16, torso: 0.25, limb: 0.075, wings: 0.75 },
    // la garde d'élite : armure noire à liserés d'or, casque à cornes dorées, hallebarde
    elite: { skin: 0x7a2a52, dark: 0x2a1828, horn: 0xe8b84a, eye: 0xffe04a, wing: 0, belly: 0x3a2a3a, hip: 0.38, sh: 0.68, w: 0.26, head: 0.15, torso: 0.29, limb: 0.085, wings: 0 },
  }[kind];
  const out: Partial<Record<PartName, { geo: THREE.BufferGeometry; pivot: THREE.Vector3 }>> = {};
  const S = spec, headY = S.sh + S.head * 0.9;
  // le corps : buste, ventre, tête, cornes (et queue pour le diablotin)
  const body: THREE.BufferGeometry[] = [
    paint(new THREE.IcosahedronGeometry(1, 0).scale(S.torso, (S.sh - S.hip) * 0.75, S.torso * 0.8).translate(0, (S.sh + S.hip) / 2, 0), S.skin),
    paint(new THREE.IcosahedronGeometry(1, 0).scale(S.torso * 0.6, (S.sh - S.hip) * 0.45, S.torso * 0.3).translate(0, (S.sh + S.hip) / 2 - 0.02, S.torso * 0.55), S.belly),
    paint(new THREE.IcosahedronGeometry(S.head, 1).scale(1, 0.95, 0.95).translate(0, headY, kind === 'brute' || kind === 'guardian' ? 0.08 : 0.02), S.skin),
    paint(new THREE.BoxGeometry(S.w * 2.1, S.limb * 1.5, S.torso * 1.1).translate(0, S.hip, 0), S.dark),
  ];
  const hornL = kind === 'brute' || kind === 'guardian' || kind === 'king' ? 0.32 : 0.2;
  for (const sd of [-1, 1]) body.push(paint(new THREE.ConeGeometry(S.head * 0.28, hornL, 5).translate(0, hornL / 2, 0).rotateZ(-sd * (kind === 'brute' ? 1.1 : 0.45)).translate(sd * S.head * 0.6, headY + S.head * 0.55, 0), S.horn, (t) => 0.8 + t * 0.3));
  if (kind === 'imp' || kind === 'chief' || kind === 'king')
    body.push(paint(new THREE.CylinderGeometry(0.012, 0.03, 0.4, 4).rotateX(-1.1).translate(0, S.hip + 0.05, -S.torso - 0.16), S.dark), paint(new THREE.ConeGeometry(0.05, 0.08, 3).rotateX(-2.2).translate(0, S.hip + 0.22, -S.torso - 0.32), S.dark));
  if (kind === 'archer') body.push(paint(new THREE.ConeGeometry(S.head * 1.25, S.head * 1.6, 6).translate(0, headY + S.head * 0.35, -0.03), S.dark), paint(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 5).rotateX(0.4).translate(0.08, S.sh - 0.05, -S.torso), 0x5a3a24));
  if (kind === 'chief' || kind === 'king') {
    // armure d'or sur les épaules, cape
    for (const sd of [-1, 1]) body.push(paint(new THREE.IcosahedronGeometry(S.limb * 1.8, 0).translate(sd * S.w, S.sh + 0.02, 0), 0xe0b040));
    body.push(paint(new THREE.BoxGeometry(S.w * 2.2, S.sh * 0.85, 0.03).translate(0, S.sh * 0.5, -S.torso * 0.9), kind === 'king' ? 0x5a1a8a : 0x3a1030));
  }
  if (kind === 'king') for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; body.push(paint(new THREE.ConeGeometry(0.035, 0.12, 4).translate(Math.sin(a) * S.head * 0.75, headY + S.head * 0.95, Math.cos(a) * S.head * 0.75), 0xf0c040)); }
  if (kind === 'guardian') for (const sd of [-1, 1]) body.push(paint(new THREE.IcosahedronGeometry(S.limb * 1.6, 0).translate(sd * S.w * 1.05, S.sh + 0.03, 0), 0x3a2a2c));
  if (kind === 'elite') {
    // épaulières d'or, plastron sombre liseré d'or, casque
    for (const sd of [-1, 1]) body.push(paint(new THREE.IcosahedronGeometry(S.limb * 1.7, 0).translate(sd * S.w * 1.02, S.sh + 0.03, 0), 0xe0b040));
    body.push(paint(new THREE.BoxGeometry(S.w * 1.5, (S.sh - S.hip) * 0.7, 0.04).translate(0, (S.sh + S.hip) / 2 + 0.02, S.torso * 0.72), 0x2a1828));
    body.push(paint(new THREE.BoxGeometry(S.w * 1.55, 0.025, 0.05).translate(0, S.sh - 0.04, S.torso * 0.74), 0xe0b040));
    body.push(paint(new THREE.IcosahedronGeometry(S.head * 1.08, 1).scale(1, 0.7, 1).translate(0, headY + S.head * 0.3, 0), 0x2a1828));
  }
  out.body = { geo: merge(body), pivot: new THREE.Vector3() };
  // les lueurs : yeux, et pour le gardien des fissures de lave sur le torse
  const glow: THREE.BufferGeometry[] = [-1, 1].map((sd) => paint(new THREE.IcosahedronGeometry(S.head * 0.2, 0).scale(1.2, 0.8, 0.6).translate(sd * S.head * 0.38, headY + S.head * 0.12, S.head * 0.88 + (kind === 'brute' || kind === 'guardian' ? 0.08 : 0.02)), S.eye));
  if (kind === 'guardian') for (let i = 0; i < 5; i++) glow.push(paint(new THREE.BoxGeometry(0.03, 0.16, 0.02).rotateZ((i - 2) * 0.5).translate((i - 2) * 0.09, S.hip + 0.12 + (i % 2) * 0.12, S.torso * 0.8), 0xff7a1a));
  if (kind === 'king') glow.push(paint(new THREE.IcosahedronGeometry(0.035, 0).translate(0, headY + S.head * 0.95, S.head * 0.78), 0xff3a6a));
  out.glow = { geo: merge(glow), pivot: new THREE.Vector3() };
  // jambes : pivot à la hanche, vers le bas ; pieds griffus
  const leg = () => merge([
    paint(new THREE.CylinderGeometry(S.limb, S.limb * 0.8, S.hip, 5).translate(0, -S.hip / 2, 0), S.skin),
    paint(new THREE.BoxGeometry(S.limb * 2.2, S.limb * 0.9, S.limb * 3).translate(0, -S.hip + S.limb * 0.4, S.limb * 0.6), S.dark),
  ]);
  out.legL = { geo: leg(), pivot: new THREE.Vector3(-S.w * 0.55, S.hip, 0) };
  out.legR = { geo: leg(), pivot: new THREE.Vector3(S.w * 0.55, S.hip, 0) };
  // bras : pivot à l'épaule ; l'arme dans la main droite (arc dans la gauche pour l'archer)
  const armLen = S.sh - S.hip + (kind === 'brute' || kind === 'guardian' ? 0.12 : 0.02);
  const arm = (weapon: THREE.BufferGeometry[]) => merge([
    paint(new THREE.CylinderGeometry(S.limb * 0.9, S.limb * 0.75, armLen, 5).translate(0, -armLen / 2, 0), S.skin),
    paint(new THREE.IcosahedronGeometry(S.limb * (kind === 'guardian' || kind === 'brute' ? 1.7 : 1.2), 0).translate(0, -armLen, 0), S.dark),
    ...weapon,
  ]);
  const handY = -armLen;
  const weaponR: Record<DemonKind, THREE.BufferGeometry[]> = {
    // fourche du diablotin, massue cloutée de la brute, hache du chef, sceptre à orbe du roi ; le gardien frappe du poing
    imp: [paint(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4).rotateX(Math.PI / 2).translate(0, handY, 0.15), 0x5a3a24), ...[-0.04, 0, 0.04].map((x) => paint(new THREE.ConeGeometry(0.015, 0.09, 3).rotateX(Math.PI / 2).translate(x, handY, 0.46), 0xd0d0d8))],
    archer: [],
    brute: [paint(new THREE.CylinderGeometry(0.07, 0.035, 0.5, 6).rotateX(Math.PI / 2).translate(0, handY, 0.25), 0x6a4a30), ...[0, 1, 2, 3].map((i) => paint(new THREE.ConeGeometry(0.025, 0.07, 3).rotateZ(Math.PI / 2 + (i * Math.PI) / 2).translate(Math.cos(i * 1.57) * 0.07, handY + Math.sin(i * 1.57) * 0.07, 0.42), 0xd8d0c0))],
    chief: [paint(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 4).rotateX(Math.PI / 2).translate(0, handY, 0.2), 0x3a2a24), paint(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 3, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, handY + 0.05, 0.45), 0xd8d8e0)],
    guardian: [],
    king: [paint(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5).rotateX(Math.PI / 2).translate(0, handY, 0.25), 0xe0b040), paint(new THREE.IcosahedronGeometry(0.07, 1).translate(0, handY, 0.66), 0xff3a6a)],
    elite: [paint(new THREE.CylinderGeometry(0.016, 0.016, 0.75, 4).rotateX(Math.PI / 2).translate(0, handY, 0.22), 0x3a2a24), paint(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 3, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, handY + 0.04, 0.55), 0xe8c060), paint(new THREE.ConeGeometry(0.025, 0.12, 4).rotateX(Math.PI / 2).translate(0, handY, 0.64), 0xd8d8e0)],
  };
  const weaponL = kind === 'archer' ? [paint(new THREE.TorusGeometry(0.22, 0.014, 4, 10, Math.PI * 0.9).rotateY(Math.PI / 2).rotateX(Math.PI / 2).translate(0, handY, 0.06), 0x6a3a1e), paint(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 3).rotateX(Math.PI / 2).translate(0.02, handY, 0.12), 0xff8a2a)] : [];
  out.armL = { geo: arm(weaponL), pivot: new THREE.Vector3(-S.w - S.limb * 0.6, S.sh - 0.02, 0) };
  out.armR = { geo: arm(weaponR[kind]), pivot: new THREE.Vector3(S.w + S.limb * 0.6, S.sh - 0.02, 0) };
  // ailes de chauve-souris : membrane en éventail, pivot dans le dos
  if (S.wings) {
    const wing = (sd: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(sd * S.wings, S.wings * 0.55); shape.lineTo(sd * S.wings * 0.9, S.wings * 0.05);
      shape.lineTo(sd * S.wings * 0.65, S.wings * 0.15); shape.lineTo(sd * S.wings * 0.5, -S.wings * 0.15); shape.lineTo(sd * S.wings * 0.28, -S.wings * 0.02); shape.lineTo(0, -S.wings * 0.12);
      return paint(new THREE.ShapeGeometry(shape), S.wing);
    };
    out.wingL = { geo: wing(-1), pivot: new THREE.Vector3(-0.03, S.sh - 0.06, -S.torso * 0.7) };
    out.wingR = { geo: wing(1), pivot: new THREE.Vector3(0.03, S.sh - 0.06, -S.torso * 0.7) };
  }
  return out;
}
