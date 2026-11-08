import * as THREE from 'three';
import type { World } from '../world/world';
import { Patrols, patrolRole, PATROL_MAX } from '../sim/patrols';
import { makeSoldier, soldierStep, Soldier } from './soldiers';

/**
 * Les patrouilles du village habillées des soldats de l'époque (render/soldiers.ts : lancier antique, chevalier, fusilier,
 * fantassin, soldat futuriste), une torche à la main la nuit. Les soldats sont des maillages articulés ; loin de la caméra
 * (au-delà de FAR × detail, comme les habitants) ils ne sont plus dessinés. Au plus PATROL_MAX × 3 soldats
 */
const FAR = 30;

export class PatrolView {
  group = new THREE.Group();
  camera: THREE.Camera | null = null;
  detail = 1;
  private rigs: Soldier[] = [];
  private key = '';

  constructor(private world: World, private patrols: Patrols) {}

  /** `night` : les soldats portent une torche (dès que la nuit tombe) */
  update(age: number, night: boolean) {
    const members = this.patrols.all(), role = patrolRole(age), key = `${Math.min(5, age)}|${role}|${+night}`;
    // la tenue change avec l'âge, la torche avec la nuit : on refait les soldats (ils sont peu nombreux)
    if (key !== this.key) { this.key = key; for (const r of this.rigs) this.group.remove(r.root); this.rigs = []; }
    while (this.rigs.length < Math.min(members.length, PATROL_MAX * 3)) {
      const s = makeSoldier(age, this.rigs.length, night, role);
      this.group.add(s.root);
      this.rigs.push(s);
    }
    const cam = this.camera?.position, farSq = (FAR * this.detail) ** 2;
    for (let i = 0; i < this.rigs.length; i++) {
      const r = this.rigs[i], m = members[i];
      if (!m) { r.root.visible = false; continue; }
      const far = !!cam && (m.x - cam.x) ** 2 + (m.z - cam.z) ** 2 > farSq;
      r.root.visible = !far;
      if (far) continue;
      r.root.position.set(m.x, this.world.surfaceAt(m.x, m.z), m.z);
      r.root.rotation.y = m.heading;
      soldierStep(r, m.phase, m.mode === 'walk' ? 'walk' : 'guard');
    }
  }
}
