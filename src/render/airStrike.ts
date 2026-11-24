import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { TEAM_A, TEAM_B } from './teamPaint';
import type { CombatFx } from './combatFx';

/**
 * L'appui aérien de la bataille des deux îles (chantier D ; l'auteur veut des avions « bien animés et détaillés », pas de
 * nouvelles troupes) : à chaque passe que la bataille annonce (`BattleNews` `air`), une patrouille de deux chasseurs-bombardiers
 * arrive de la tête de pont, pique sur la cible, largue ses bombes et remonte en virant, la postcombustion qui palpite et
 * deux traînées blanches derrière ; pendant tout l'appui, deux hélicoptères d'attaque tournent au-dessus des remparts, rotors
 * et rotor de queue en mouvement, et tirent leurs roquettes. Tout est dans le repère de la bataille (le groupe de la vue
 * `BattleLayer`), à nos couleurs (le blason). Décor seulement : la simulation (`RivalBattle`) règle les dégâts
 */

type V3 = [number, number, number];
/** Le chasseur-bombardier : fuselage effilé, verrière, ailes en flèche, empennages, tuyère, bombes sous les ailes (proue vers +z) */
function jet(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } {
  const p = new Parts(), grey = 0x7d8790, dark = 0x4a525a, light = 0xb4bcc4;
  // le fuselage : un fuseau en trois tronçons, le nez en cône, l'entrée d'air de chaque côté
  p.add(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 10).rotateX(Math.PI / 2), 0, 0, 0.05, grey);
  p.add(new THREE.CylinderGeometry(0.13, 0.1, 0.5, 10).rotateX(Math.PI / 2), 0, 0, -0.62, grey);
  p.add(new THREE.ConeGeometry(0.11, 0.42, 10).rotateX(Math.PI / 2), 0, 0, 0.71, light);
  p.add(new THREE.ConeGeometry(0.025, 0.12, 6).rotateX(Math.PI / 2), 0, 0, 0.97, dark);
  for (const s of [-1, 1]) {
    p.box(0.07, 0.13, 0.4, s * 0.14, -0.02, 0.05, dark);
    p.box(0.08, 0.14, 0.02, s * 0.14, -0.02, 0.26, 0x22262a);
  }
  // la verrière, son arceau, le pilote
  p.add(new THREE.SphereGeometry(0.09, 10, 6).scale(0.85, 0.75, 2.2), 0, 0.1, 0.35, 0x5f93b8, 0, true);
  p.box(0.012, 0.06, 0.012, 0, 0.16, 0.24, dark);
  p.sphere(0.035, 0, 0.12, 0.3, 0x2a2a30);
  // les ailes en flèche (un trapèze extrudé), leurs bords et la cocarde à nos couleurs
  const wing = new THREE.Shape([new THREE.Vector2(0, 0.28), new THREE.Vector2(0.78, -0.14), new THREE.Vector2(0.78, -0.3), new THREE.Vector2(0, -0.26)]);
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(wing, { depth: 0.025, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
    if (s < 0) g.scale(-1, 1, 1);
    p.add(g, s * 0.08, -0.04, -0.02, grey);
    p.box(0.06, 0.03, 0.2, s * 0.84, -0.035, -0.22, dark);
    p.cyl(0.075, 0.075, 0.008, 12, s * 0.5, -0.006, -0.12, TEAM_A);
    p.cyl(0.04, 0.04, 0.01, 12, s * 0.5, -0.004, -0.12, TEAM_B);
    // les pylônes et les bombes (fuseaux à ailettes)
    p.box(0.02, 0.05, 0.12, s * 0.38, -0.08, -0.04, dark);
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8).rotateX(Math.PI / 2), s * 0.38, -0.13, -0.04, 0x3e4a3a);
    p.add(new THREE.ConeGeometry(0.035, 0.07, 8).rotateX(Math.PI / 2), s * 0.38, -0.13, 0.12, 0x3e4a3a);
    for (const r of [0, Math.PI / 2]) p.box(0.1, 0.008, 0.04, s * 0.38, -0.13, -0.17, dark, 0, false, r);
    // le missile de bout d'aile
    p.add(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 6).rotateX(Math.PI / 2), s * 0.84, -0.06, -0.12, 0xe8e8e4);
  }
  // les empennages : deux dérives inclinées, deux plans horizontaux
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.02, 0.3, 0.24).rotateZ(s * 0.28), s * 0.12, 0.17, -0.72, grey);
    p.add(new THREE.BoxGeometry(0.34, 0.018, 0.18), s * 0.2, -0.01, -0.78, grey);
    p.box(0.022, 0.06, 0.08, s * 0.16, 0.3, -0.76, TEAM_A);
  }
  // la tuyère : l'anneau sombre, le cône de la postcombustion (lumineux)
  p.add(new THREE.CylinderGeometry(0.1, 0.09, 0.08, 10).rotateX(Math.PI / 2), 0, 0, -0.9, 0x2a2a2e);
  p.add(new THREE.ConeGeometry(0.075, 0.32, 10).rotateX(-Math.PI / 2), 0, 0, -1.08, 0xffa040, 0, true);
  p.add(new THREE.ConeGeometry(0.045, 0.2, 8).rotateX(-Math.PI / 2), 0, 0, -1.02, 0xfff0c0, 0, true);
  return p.build(false);
}

/** L'hélicoptère d'attaque : cellule étroite, deux cockpits en tandem, ailettes à roquettes, queue et sa dérive (proue vers +z) */
function heli(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } {
  const p = new Parts(), olive = 0x56614a, dark = 0x353b2e;
  p.add(new THREE.SphereGeometry(0.16, 10, 8).scale(0.8, 0.9, 2.1), 0, 0, 0.05, olive);
  p.add(new THREE.SphereGeometry(0.1, 10, 6).scale(0.9, 0.8, 1.9), 0, 0.12, 0.2, 0x5f8fb0, 0, true);
  p.box(0.01, 0.08, 0.01, 0, 0.18, 0.15, dark);
  p.add(new THREE.CylinderGeometry(0.03, 0.07, 0.9, 8).rotateX(Math.PI / 2), 0, 0.03, -0.62, olive);
  p.box(0.025, 0.24, 0.12, 0, 0.12, -1.04, olive);
  p.box(0.22, 0.015, 0.08, 0, 0.04, -0.98, olive);
  p.box(0.05, 0.04, 0.05, 0, 0.21, 0, dark);
  p.cyl(0.05, 0.05, 0.08, 8, 0, 0.17, 0, dark);
  // les moteurs de chaque côté, les ailettes et leurs paniers de roquettes, le canon sous le nez, les patins
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8).rotateX(Math.PI / 2), s * 0.13, 0.1, -0.06, dark);
    p.box(0.3, 0.02, 0.1, s * 0.25, -0.02, 0.02, olive);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8).rotateX(Math.PI / 2), s * 0.36, -0.07, 0.04, 0x2a2e26);
    p.cyl(0.03, 0.03, 0.006, 8, s * 0.36, -0.07, 0.14, 0x111111);
    p.box(0.015, 0.1, 0.015, s * 0.12, -0.17, 0.12, dark);
    p.box(0.015, 0.1, 0.015, s * 0.12, -0.17, -0.12, dark);
    p.box(0.02, 0.02, 0.5, s * 0.12, -0.22, 0, dark);
    p.cyl(0.04, 0.04, 0.006, 10, s * 0.1, 0.04, -0.4, TEAM_A);
  }
  p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6).rotateX(Math.PI / 2), 0, -0.12, 0.38, 0x222222);
  return p.build(false);
}
/** Un rotor : deux pales croisées (le grand) ; le rotor de queue, plus petit */
function rotor(r: number, w: number): THREE.BufferGeometry {
  const p = new Parts();
  for (const a of [0, Math.PI / 2]) p.box(r * 2, 0.012, w, 0, 0, 0, 0x2a2a2a, a);
  p.cyl(0.03, 0.03, 0.03, 8, 0, -0.015, 0, 0x3a3a3a);
  return p.build(false).body;
}
/** Le disque flou d'un rotor qui tourne vite (transparent) */
const blurMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });

let jetGeo: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } | null = null;
let heliGeo: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } | null = null;
let mainRotor: THREE.BufferGeometry | null = null, tailRotor: THREE.BufferGeometry | null = null;

interface Jet { root: THREE.Group; burner: THREE.Object3D | null; path: (t: number) => V3; t: number; dur: number; drop: number; dropped: boolean; tx: number; tz: number; side: number; trail: number }
interface Bomb { m: THREE.Mesh; x: number; y: number; z: number; vx: number; vy: number; vz: number; tx: number; tz: number }
interface Heli { root: THREE.Group; rotor: THREE.Object3D; tail: THREE.Object3D; ang: number; r: number; cx: number; cz: number; fire: number; side: number }

const bombGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).rotateX(Math.PI / 2);
const bombMat = new THREE.MeshLambertMaterial({ color: 0x3e4a3a });

export class AirStrike {
  readonly group = new THREE.Group();
  private jets: Jet[] = [];
  private bombs: Bomb[] = [];
  private helis: Heli[] = [];
  private t = 0;
  /** `ground` : hauteur du sol (repère de la bataille) ; `fx` : les effets de la vue ; `from` : d'où viennent les avions (la tête de pont) */
  constructor(private ground: (x: number, z: number) => number, private fx: CombatFx, private from: [number, number]) {
    jetGeo ??= jet(); heliGeo ??= heli(); mainRotor ??= rotor(0.62, 0.05); tailRotor ??= rotor(0.14, 0.03);
  }

  /** Une passe sur (x, z) : deux chasseurs, l'un un peu derrière l'autre */
  strike(x: number, z: number) {
    const dx = x - this.from[0], dz = z - this.from[1], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    for (const side of [-1, 1]) {
      const root = this.plane(jetGeo!, 0.95);
      const off = side * 1.6, lag = side > 0 ? 0.6 : 0;
      // (la route : on arrive de loin et haut, on pique sur la cible, on largue, on remonte en virant)
      const ox = -uz * off, oz = ux * off, g = this.ground(x, z);
      const path = (t: number): V3 => {
        const s = (t - 0.5) * 70, alt = g + 6.5 + Math.abs(t - 0.5) * 26 + (t > 0.5 ? (t - 0.5) * 20 : 0);
        const turn = t > 0.55 ? (t - 0.55) * (t - 0.55) * 60 * side : 0;
        return [x + ux * s + ox - uz * turn, alt, z + uz * s + oz + ux * turn];
      };
      this.jets.push({ root, burner: root.children[1] ?? null, path, t: -lag / 4.2, dur: 4.2, drop: 0.47, dropped: false, tx: x + ox * 0.3, tz: z + oz * 0.3, side, trail: 0 });
    }
  }

  /** Les hélicoptères d'attaque tournent au-dessus de (x, z) (null : ils rentrent) */
  hover(at: [number, number] | null) {
    if (!at) { for (const h of this.helis) h.r = -1; return; }
    if (this.helis.length) { for (const h of this.helis) { h.cx = at[0]; h.cz = at[1]; if (h.r < 0) h.r = 5; } return; }
    for (const side of [-1, 1]) {
      const root = this.plane(heliGeo!, 1.1);
      const rot = new THREE.Group(), blade = new THREE.Mesh(mainRotor!, mats.body), disc = new THREE.Mesh(new THREE.CircleGeometry(0.66, 18).rotateX(-Math.PI / 2), blurMat);
      rot.add(blade, disc); rot.position.set(0, 0.24, 0); root.add(rot);
      const tail = new THREE.Group(); tail.add(new THREE.Mesh(tailRotor!, mats.body)); tail.rotation.z = Math.PI / 2; tail.position.set(0.04, 0.14, -1.06); root.add(tail);
      // (ils arrivent de la tête de pont)
      root.position.set(this.from[0] + side * 3, this.ground(this.from[0], this.from[1]) + 8, this.from[1]);
      this.helis.push({ root, rotor: rot, tail, ang: side > 0 ? 0 : Math.PI, r: 5, cx: at[0], cz: at[1], fire: 1 + side, side });
    }
  }

  private plane(geo: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }, k: number) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo.body, mats.body));
    if (geo.glow) root.add(new THREE.Mesh(geo.glow, mats.glow));
    root.scale.setScalar(k);
    this.group.add(root);
    return root;
  }

  get busy() { return this.jets.length > 0 || this.bombs.length > 0 || this.helis.length > 0; }

  update(dt: number) {
    this.t += dt;
    const v = new THREE.Vector3(), look = new THREE.Vector3();
    for (const j of this.jets) {
      j.t += dt / j.dur;
      if (j.t < 0) { j.root.visible = false; continue; }
      j.root.visible = true;
      const [x, y, z] = j.path(j.t), [nx, ny, nz] = j.path(j.t + 0.01);
      j.root.position.set(x, y, z);
      look.set(nx, ny, nz);
      j.root.lookAt(look);
      // (lookAt oriente -z : nos modèles regardent +z)
      j.root.rotateY(Math.PI);
      // l'inclinaison : à plat en piqué, sur l'aile en virant
      j.root.rotateZ(j.t > 0.55 ? -j.side * Math.min(1.1, (j.t - 0.55) * 4) : Math.sin(this.t * 3 + j.side) * 0.05);
      // la postcombustion palpite (plus forte en remontant)
      if (j.burner) { const b = 0.8 + Math.sin(this.t * 40 + j.side) * 0.15 + (j.t > 0.5 ? 0.3 : 0); j.burner.scale.set(1, 1, b); }
      // les traînées blanches au bout des ailes
      j.trail -= dt;
      if (j.trail <= 0 && j.t > 0.05 && j.t < 0.95) {
        j.trail = 0.05;
        for (const s of [-1, 1]) { v.set(s * 0.8, -0.04, -0.2).applyMatrix4(j.root.matrixWorld); this.group.worldToLocal(v); this.fx.puff(v.x, v.y, v.z, 1); }
      }
      // le largage : deux bombes qui gardent l'élan de l'avion
      if (!j.dropped && j.t >= j.drop) {
        j.dropped = true;
        for (const s of [-1, 1]) {
          const m = new THREE.Mesh(bombGeo, bombMat);
          m.position.set(x + s * 0.35, y - 0.12, z);
          this.group.add(m);
          // (calées pour tomber sur la cible : la vitesse horizontale vise le point d'impact)
          const tFall = Math.sqrt((2 * Math.max(1, y - this.ground(j.tx, j.tz))) / 9.8);
          this.bombs.push({ m, x: x + s * 0.35, y: y - 0.12, z, vx: (j.tx + s * 0.6 - x) / tFall, vy: 0, vz: (j.tz - z) / tFall, tx: j.tx, tz: j.tz });
        }
      }
    }
    for (const j of this.jets.filter((q) => q.t >= 1)) this.group.remove(j.root);
    this.jets = this.jets.filter((q) => q.t < 1);
    for (const b of this.bombs) {
      b.vy -= 9.8 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.m.position.set(b.x, b.y, b.z);
      b.m.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      const g = this.ground(b.x, b.z);
      if (b.y <= g + 0.05) {
        this.group.remove(b.m);
        // l'explosion : l'éclair, la boule de feu, la fumée noire, les éclats
        this.fx.boom(b.x, g + 0.2, b.z);
        this.fx.blast(b.x, g + 0.3, b.z, b.vx, b.vz);
        this.fx.hit(b.x, g + 0.4, b.z, 0xffb040, 18, 'shot');
        this.fx.plume(b.x, g + 0.3, b.z);
        this.fx.chips(b.x, g + 0.2, b.z, 0x8a7a64, 8);
        b.y = -999;
      }
    }
    this.bombs = this.bombs.filter((b) => b.y > -999);
    // les hélicoptères : ils tournent au-dessus des remparts, rotors lancés, et tirent leurs roquettes
    for (const h of this.helis) {
      h.rotor.rotation.y += dt * 28;
      h.tail.rotation.x += dt * 40;
      const going = h.r < 0;
      h.ang += dt * 0.45 * h.side;
      const tx = going ? this.from[0] + h.side * 2 : h.cx + Math.cos(h.ang) * h.r, tz = going ? this.from[1] - 6 : h.cz + Math.sin(h.ang) * h.r;
      const ty = this.ground(tx, tz) + (going ? 12 : 5 + Math.sin(this.t * 1.3 + h.side) * 0.3);
      const p = h.root.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), sp = Math.min(d, dt * 7);
      if (d > 0.01) { p.x += (dx / d) * sp; p.z += (dz / d) * sp; }
      p.y += (ty - p.y) * Math.min(1, dt * 1.5);
      // le nez vers la cible (au-dessus des remparts), penché en avant en avançant
      const face = going ? Math.atan2(dx, dz) : Math.atan2(h.cx - p.x, h.cz - p.z);
      h.root.rotation.set(Math.min(0.3, sp / dt / 25), face, Math.sin(this.t * 0.9 + h.side) * 0.05, 'YXZ');
      h.fire -= dt;
      if (!going && h.fire <= 0) {
        h.fire = 1.8 + (h.side > 0 ? 0.6 : 0);
        for (const s of [-1, 1]) {
          v.set(s * 0.36, -0.07, 0.25).applyMatrix4(h.root.matrixWorld); this.group.worldToLocal(v);
          const gx = h.cx + (Math.sin(this.t * 7 + s) * 1.2), gz = h.cz + (Math.cos(this.t * 5 + s) * 1.2), gy = this.ground(gx, gz) + 0.3;
          this.fx.tracer(v.x, v.y, v.z, gx, gy, gz, 0xffc86a, 18);
          this.fx.flash(v.x, v.y, v.z, 0xffe0a0);
          setTimeout(() => { this.fx.hit(gx, gy, gz, 0xffb040, 10, 'shot'); this.fx.puff(gx, gy, gz, 4); }, 220);
        }
      }
    }
    for (const h of this.helis.filter((q) => q.r < 0 && q.root.position.y > this.ground(q.root.position.x, q.root.position.z) + 11)) this.group.remove(h.root);
    this.helis = this.helis.filter((q) => q.root.parent);
  }

  dispose() { this.group.clear(); this.jets = []; this.bombs = []; this.helis = []; }
}
