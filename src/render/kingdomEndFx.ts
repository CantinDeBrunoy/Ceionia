import * as THREE from 'three';
import { makeFolk, folkStep, holdFolk, Folk } from './folk';

/**
 * Les effets de surface de la cinématique de fin du volet militaire : les démons restants qui se dissolvent en cendres et en
 * étincelles, les soldats du joueur qui lèvent leurs armes autour du portail, puis l'île qui reverdit sous des anneaux dorés
 * et une pluie de petites lueurs vertes. Un seul groupe, peu de pièces (deux nuages de points, trois anneaux, huit soldats),
 * qui se retire de lui-même ; aucune lumière
 */

const ASH = 160, GREEN = 220, SOLDIERS = 8;

const additive = (color: THREE.Color, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });

export class KingdomEndFx {
  group = new THREE.Group();
  private t = 0;
  private ash: THREE.Points;
  private ashVel = new Float32Array(ASH * 3);
  private ashN = 0;
  private green: THREE.Points;
  private greenVel = new Float32Array(GREEN);
  private greenOn = -1;
  private rings: THREE.Mesh[] = [];
  private ringAt = -1;
  private soldiers: { f: Folk; a: number; r: number; ph: number }[] = [];
  private soldiersOn = false;
  private spearGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5);
  private spearMat = new THREE.MeshBasicMaterial({ color: 0xe8d8a0 });

  /** (px, pz) : le portail ; radius : le rayon de l'île ; ground : la hauteur du sol ; age : l'âge du village (la tenue des soldats) */
  constructor(private px: number, private pz: number, private radius: number, private ground: (x: number, z: number) => number, private age: number) {
    const pts = (n: number, color: number, size: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-9999), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      p.frustumCulled = false; p.renderOrder = 12;
      this.group.add(p);
      return p;
    };
    this.ash = pts(ASH, new THREE.Color(1.5, 0.8, 0.35).getHex(), 0.22);
    this.green = pts(GREEN, new THREE.Color(0.55, 1.4, 0.5).getHex(), 0.2);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 96).rotateX(-Math.PI / 2), additive(i === 1 ? new THREE.Color(0.7, 1.4, 0.5) : new THREE.Color(1.4, 1, 0.3), 0));
      r.renderOrder = 12; r.visible = false;
      this.rings.push(r); this.group.add(r);
    }
  }

  /** Des démons qui se dissolvent : un nuage de cendres rougeoyantes qui monte et s'éparpille à chaque position */
  dissolve(spots: { x: number; z: number }[]) {
    const a = this.ash.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
    for (const s of spots) {
      for (let j = 0; j < 22; j++) {
        const i = this.ashN++ % ASH, an = Math.random() * Math.PI * 2, o = Math.random() * 0.9;
        arr[i * 3] = s.x + Math.cos(an) * o; arr[i * 3 + 1] = this.ground(s.x, s.z) + 0.3 + Math.random() * 1.1; arr[i * 3 + 2] = s.z + Math.sin(an) * o;
        this.ashVel.set([Math.cos(an) * (0.2 + Math.random() * 0.8), 0.8 + Math.random() * 2, Math.sin(an) * (0.2 + Math.random() * 0.8)], i * 3);
      }
    }
    a.needsUpdate = true;
  }

  /** Les soldats se rangent autour du portail, face à lui, et lèvent leurs armes */
  raiseSoldiers() {
    if (this.soldiersOn) return;
    this.soldiersOn = true;
    for (let i = 0; i < SOLDIERS; i++) {
      const f = makeFolk({ age: this.age, v: 40 + i * 11, role: 'villager' });
      const spear = new THREE.Mesh(this.spearGeo, this.spearMat);
      spear.position.y = 0.3;
      holdFolk(f, 0, spear, 'upright');
      const a = -Math.PI / 2 + ((i + 0.5) / SOLDIERS - 0.5) * 2.4 + 0.4, r = 5.2 + (i % 2) * 0.9;
      f.root.position.set(this.px + Math.sin(a) * r, 0, this.pz + Math.cos(a) * r);
      f.root.position.y = this.ground(f.root.position.x, f.root.position.z);
      f.root.rotation.y = Math.atan2(this.px - f.root.position.x, this.pz - f.root.position.z);
      this.soldiers.push({ f, a, r, ph: i * 0.9 });
      this.group.add(f.root);
    }
  }

  /** L'île reverdit : trois anneaux (or, vert, or) partent du portail jusqu'au bord de l'île, la pluie de lueurs vertes monte du sol */
  regreen() {
    if (this.ringAt >= 0) return;
    this.ringAt = this.t;
    const a = this.green.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
    for (let i = 0; i < GREEN; i++) {
      const an = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (this.radius + 2);
      const x = this.px + Math.cos(an) * d, z = this.pz + Math.sin(an) * d;
      arr[i * 3] = x; arr[i * 3 + 1] = this.ground(x, z) + 0.1; arr[i * 3 + 2] = z;
      this.greenVel[i] = 0.5 + Math.random() * 1.5;
    }
    a.needsUpdate = true;
    this.greenOn = 0;
  }

  update(dt: number) {
    this.t += dt;
    // la cendre monte, ralentit, retombe en s'éteignant
    if (this.ashN) {
      const a = this.ash.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array, v = this.ashVel;
      for (let i = 0; i < ASH; i++) {
        if (arr[i * 3] < -9000) continue;
        v[i * 3 + 1] -= 0.8 * dt; v[i * 3] *= 0.98; v[i * 3 + 2] *= 0.98;
        arr[i * 3] += v[i * 3] * dt; arr[i * 3 + 1] += v[i * 3 + 1] * dt; arr[i * 3 + 2] += v[i * 3 + 2] * dt;
      }
      a.needsUpdate = true;
      (this.ash.material as THREE.PointsMaterial).color.setRGB(1.5, 0.8, 0.35).lerp(new THREE.Color(0.35, 0.3, 0.3), Math.min(1, this.t * 0.15));
    }
    // les soldats : bras levés, petits sauts d'allégresse
    for (const s of this.soldiers) {
      folkStep(s.f, this.t * 6 + s.ph, 'cheer');
      s.f.root.position.y = this.ground(s.f.root.position.x, s.f.root.position.z) + Math.max(0, Math.sin(this.t * 6 + s.ph)) * 0.12;
    }
    // l'île qui reverdit
    if (this.ringAt >= 0) {
      const e = this.t - this.ringAt;
      this.rings.forEach((r, i) => {
        const k = (e - i * 0.9) / 3.6;
        r.visible = k > 0 && k < 1;
        if (!r.visible) return;
        r.position.set(this.px, this.ground(this.px, this.pz) + 0.25, this.pz);
        r.scale.setScalar(1 + k * (this.radius + 10));
        (r.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      });
      const a = this.green.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
      for (let i = 0; i < GREEN; i++) arr[i * 3 + 1] += this.greenVel[i] * dt;
      a.needsUpdate = true;
      (this.green.material as THREE.PointsMaterial).opacity = Math.max(0, 0.95 - Math.max(0, e - 4) * 0.25);
    }
  }

  dispose() {
    this.group.removeFromParent();
    // (les habitants partagent leurs matériaux avec le reste du jeu : on ne libère que ce qui est à nous)
    for (const o of [this.ash, this.green, ...this.rings]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    this.spearGeo.dispose();
    this.spearMat.dispose();
  }
}
