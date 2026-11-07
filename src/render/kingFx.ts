import * as THREE from 'three';
import type { HellEvent } from '../sim/hell';
import { KingFight, FIREBALL_FALL, PATCH_WARM, PATCH_BURN } from '../sim/kingdom';
import type { CombatFx } from './combatFx';

/**
 * Les effets du combat du roi des Enfers, dans la vue infernale : le cercle rouge qui prévient d'une boule de feu et la boule
 * qui tombe du haut de la caverne, son explosion ; les plaques de sol qui rougeoient puis s'embrasent ; l'onde d'un cri ; la
 * fumée violette des diablotins invoqués. Quelques maillages réutilisés (pas de lumière en plus)
 */

const RINGS = 12, PATCHES = 16;
/** Hauteur d'où tombe une boule de feu */
const DROP = 7;

export class KingFx {
  group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private discs: THREE.Mesh[] = [];
  private orbs: THREE.Mesh[] = [];
  private patches: { fill: THREE.Mesh; rim: THREE.Mesh }[] = [];
  private wave: THREE.Mesh;
  private waveT = 9;
  private t = 0;
  private emberT = 0;

  constructor(private groundY: (x: number, z: number) => number, private fx: CombatFx) {
    const ringGeo = new THREE.RingGeometry(0.86, 1, 32).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    const orbGeo = new THREE.IcosahedronGeometry(0.32, 1);
    const flat = (color: number, opacity: number, add = false) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    for (let i = 0; i < RINGS; i++) {
      const ring = new THREE.Mesh(ringGeo, flat(0xff3a2a, 0.9)), disc = new THREE.Mesh(discGeo, flat(0xff2a1a, 0.18));
      const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.45, 0.08), fog: false }));
      for (const m of [ring, disc, orb]) { m.visible = false; m.renderOrder = 7; this.group.add(m); }
      this.rings.push(ring); this.discs.push(disc); this.orbs.push(orb);
    }
    for (let i = 0; i < PATCHES; i++) {
      const fill = new THREE.Mesh(discGeo, flat(0xff6a1a, 0.5)), rim = new THREE.Mesh(ringGeo, flat(0xffc040, 0.8));
      for (const m of [fill, rim]) { m.visible = false; m.renderOrder = 6; this.group.add(m); }
      this.patches.push({ fill, rim });
    }
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), flat(0xffb070, 0.7, true));
    this.wave.visible = false;
    this.group.add(this.wave);
  }

  /** Une image : l'état du combat (`fight`), et ce qui vient de s'y passer (sans consommer les événements) */
  update(dt: number, fight: KingFight | null, events: readonly HellEvent[]) {
    this.t += dt;
    const t = this.t, gy = this.groundY;
    for (const e of events) {
      if (e.type === 'blast') {
        const y = gy(e.x, e.z);
        this.fx.boom(e.x, y + 0.3, e.z);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; this.fx.puff(e.x + Math.sin(a) * e.r * 0.7, y + 0.2, e.z + Math.cos(a) * e.r * 0.7, 6); }
      } else if (e.type === 'roar') {
        this.waveT = 0;
        this.wave.position.set(e.x, gy(e.x, e.z) + 0.08, e.z);
      } else if (e.type === 'spawn' && fight?.fighting) {
        const y = gy(e.x, e.z) + 0.2;
        this.fx.chips(e.x, y, e.z, 0xb05aff, 10);
        this.fx.puff(e.x, y, e.z, 8);
      }
    }
    // les boules de feu : le cercle se resserre et rougit à mesure que la boule tombe
    const balls = fight?.fireballs ?? [];
    for (let i = 0; i < RINGS; i++) {
      const f = balls[i], ring = this.rings[i], disc = this.discs[i], orb = this.orbs[i];
      ring.visible = disc.visible = orb.visible = !!f;
      if (!f) continue;
      const k = 1 - Math.max(0, f.t) / FIREBALL_FALL, y = gy(f.x, f.z);
      ring.position.set(f.x, y + 0.05, f.z);
      ring.scale.setScalar(f.r * (1 + (1 - k) * 0.35));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * (6 + k * 10)));
      disc.position.set(f.x, y + 0.04, f.z);
      disc.scale.setScalar(f.r * k);
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.15 + k * 0.25;
      orb.position.set(f.x, y + 0.3 + (1 - k * k) * DROP, f.z);
      orb.rotation.set(t * 3, t * 2, 0);
    }
    // le sol qui s'embrase : il rougeoie en pulsant, puis brûle (et crache quelques braises)
    const ps = fight?.patches ?? [];
    this.emberT -= dt;
    const ember = this.emberT <= 0;
    if (ember) this.emberT = 0.12;
    for (let i = 0; i < PATCHES; i++) {
      const p = ps[i], { fill, rim } = this.patches[i];
      fill.visible = rim.visible = !!p;
      if (!p) continue;
      const y = gy(p.x, p.z), warm = p.age < PATCH_WARM, fade = Math.min(1, (PATCH_WARM + PATCH_BURN - p.age) / 0.6);
      fill.position.set(p.x, y + 0.03, p.z);
      rim.position.set(p.x, y + 0.035, p.z);
      rim.scale.setScalar(p.r);
      const fm = fill.material as THREE.MeshBasicMaterial, rm = rim.material as THREE.MeshBasicMaterial;
      if (warm) {
        const k = p.age / PATCH_WARM;
        fill.scale.setScalar(p.r * (0.3 + 0.7 * k));
        fm.color.setRGB(0.55, 0.08, 0.04);
        fm.opacity = 0.35 + 0.3 * Math.abs(Math.sin(t * 9));
        rm.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 9));
      } else {
        fill.scale.setScalar(p.r);
        const fl = 0.85 + Math.sin(t * 17 + i) * 0.1 + Math.sin(t * 7.3 + i * 3) * 0.08;
        fm.color.setRGB(1.25 * fl, 0.5 * fl, 0.06);
        fm.opacity = 0.9 * fade;
        rm.opacity = 0.9 * fade;
        if (ember && Math.random() < 0.6) { const a = Math.random() * 6.28, d = Math.random() * p.r; this.fx.chips(p.x + Math.sin(a) * d, y + 0.05, p.z + Math.cos(a) * d, 0xffa040, 2); }
      }
    }
    // l'onde du cri, qui s'élargit et s'efface
    this.waveT += dt;
    this.wave.visible = this.waveT < 1.1;
    if (this.wave.visible) {
      this.wave.scale.setScalar(0.8 + this.waveT * 9);
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - this.waveT / 1.1);
    }
  }
}
