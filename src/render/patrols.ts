import * as THREE from 'three';
import type { World } from '../world/world';
import { patrolRole, PatrolMember } from '../sim/patrols';
import { makeSoldier, soldierStep, Soldier } from './soldiers';
import { makeBeast } from './beasts';
import { Actor, play } from './assets';
import { hasPerk } from '../sim/legacy';

/**
 * Les patrouilles du village (et les sentinelles des remparts) habillées des soldats de l'époque (render/soldiers.ts : lancier
 * antique, chevalier, fusilier, fantassin, soldat futuriste), une torche à la main la nuit. Les soldats sont des maillages
 * articulés ; loin de la caméra (au-delà de FAR × detail, comme les habitants) ils ne sont plus dessinés. `source` donne les
 * soldats à montrer, `max` leur nombre au plus
 */
const FAR = 30;

export class PatrolView {
  group = new THREE.Group();
  camera: THREE.Camera | null = null;
  detail = 1;
  private rigs: Soldier[] = [];
  private key = '';

  constructor(private world: World, private source: () => PatrolMember[], private max: number, private seed = 0) {}

  /** `night` : les soldats portent une torche (dès que la nuit tombe) */
  update(age: number, night: boolean) {
    const members = this.source(), role = patrolRole(age), key = `${Math.min(5, age)}|${role}|${+night}`;
    // la tenue change avec l'âge, la torche avec la nuit : on refait les soldats (ils sont peu nombreux)
    if (key !== this.key) { this.key = key; for (const r of this.rigs) this.group.remove(r.root); this.rigs = []; }
    while (this.rigs.length < Math.min(members.length, this.max)) {
      const s = makeSoldier(age, this.rigs.length + this.seed, night, role);
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
      r.root.position.set(m.x, m.y ?? this.world.surfaceAt(m.x, m.z), m.z);
      r.root.rotation.y = m.heading;
      soldierStep(r, m.phase, m.mode === 'walk' ? 'walk' : 'guard');
    }
  }
}

/** Longueur d'un chien de garde (cases), et celle du loup dont il est tiré (`beasts.ts`) */
const HOUND_LEN = 0.14, WOLF_LEN = 0.34, HOUND_TROT = 2;

/**
 * Les chiens des gardes (savoir-faire de l'expédition « Le loup des bois », `hounds`) : un berger articulé au pied de chaque
 * patrouille (`Patrols.hound`), qui trotte quand elle marche, s'arrête et flaire le sol quand elle monte la garde. Rien
 * sans le savoir-faire ; loin de la caméra, comme les soldats, il n'est pas dessiné
 */
export class HoundView {
  group = new THREE.Group();
  camera: THREE.Camera | null = null;
  detail = 1;
  private dogs: { actor: Actor; sniff: number }[] = [];

  constructor(private world: World, private source: () => PatrolMember[], private max: number) {}

  update(dt: number) {
    const on = hasPerk(this.world, 'hounds'), members = on ? this.source() : [];
    while (this.dogs.length < Math.min(members.length, this.max)) {
      const actor = makeBeast('guarddog', this.dogs.length, HOUND_LEN / WOLF_LEN, 0.94 + (this.dogs.length % 3) * 0.04);
      // (au pas de la patrouille, ses petites pattes trottent deux fois plus vite que celles du loup)
      actor.actions.get('Walk')?.setEffectiveTimeScale(HOUND_TROT);
      this.group.add(actor.root);
      this.dogs.push({ actor, sniff: 2 + this.dogs.length * 1.3 });
    }
    const cam = this.camera?.position, farSq = (FAR * this.detail) ** 2;
    for (let i = 0; i < this.dogs.length; i++) {
      const d = this.dogs[i], m = members[i], o = d.actor.root;
      if (!m) { o.visible = false; continue; }
      const far = !!cam && (m.x - cam.x) ** 2 + (m.z - cam.z) ** 2 > farSq;
      o.visible = !far;
      if (far) continue;
      o.position.set(m.x, this.world.surfaceAt(m.x, m.z), m.z);
      o.rotation.y = m.heading;
      if (m.mode === 'walk') { play(d.actor, ['Walk', 'Idle']); d.sniff = 3 + Math.random() * 4; }
      else {
        // à l'arrêt : il attend, et de temps en temps baisse la truffe pour flairer
        d.sniff -= dt;
        if (d.sniff <= 0) { d.sniff = 6 + Math.random() * 6; const a = d.actor.actions.get('Idle_3'); if (a) { a.reset().play(); d.actor.current?.fadeOut(0.3); d.actor.current = a; } }
        else if (d.actor.current !== d.actor.actions.get('Idle_3') || !d.actor.current?.isRunning()) play(d.actor, ['Idle']);
      }
      d.actor.mixer.update(dt);
    }
  }
}
