import * as THREE from 'three';
import { World } from '../world/world';
import { makeBeast, beastYaw, GESTURES, BeastKind } from './beasts';
import { play, Actor } from './assets';
import { ZOO_RESIDENTS, ZooResident } from './models';
import type { BuildingView } from './buildings';

/** Une bête du zoo : son acteur animé, où elle est (repère du bâtiment) et la place où elle va */
interface Beast { res: ZooResident; actor: Actor; x: number; z: number; heading: number; spot: number; wait: number; moving: boolean; phase: number; t: number }
interface Zoo { root: THREE.Group; beasts: Beast[]; age: number }

/** Vitesse de marche (par seconde) selon l'espèce : l'éléphant et la tortue traînent, l'ours et le lézard trottent */
const PACE: Record<ZooResident['kind'], number> = { elephant: 0.1, giraffe: 0.12, bear: 0.12, croc: 0.08, turtle: 0.04, lizard: 0.1 };
/** Les bêtes ne s'animent que près de la caméra ; plus loin, elles ne seraient que des points */
const NEAR = 55;

/**
 * Les pensionnaires du zoo : l'éléphant et son petit, les girafes, les ours, les crocodiles, les tortues et les lézards,
 * des bêtes articulées (voir `makeBeast`) posées dans leurs enclos, au pied du modèle du bâtiment (`ZOO_RESIDENTS` en donne
 * les places). Elles se reposent, joignent un geste de temps en temps (se dresser, barrir, siffler) et changent parfois de
 * place en marchant. Accrochées au bâtiment (son repère, son animation d'apparition)
 */
export class ZooView {
  private zoos = new Map<number, Zoo>();
  private rnd = 1;
  private t = 0;

  constructor(private world: World, private buildings: BuildingView) {}

  private rand() { this.rnd = (this.rnd * 16807) % 2147483647; return this.rnd / 2147483647; }

  update(dt: number, camera?: THREE.Camera) {
    this.t += dt;
    const live = new Set<number>();
    for (const b of this.world.buildings.values()) {
      if (b.kind !== 'zoo') continue;
      const g = this.buildings.entries.get(b.id)?.group;
      if (!g) continue;
      live.add(b.id);
      let z = this.zoos.get(b.id);
      if (z && z.root.parent !== g) { this.drop(z); z = undefined; }
      if (!z) { z = this.make(g, b.age); this.zoos.set(b.id, z); }
      const near = !camera || camera.position.distanceTo(g.position) < NEAR;
      z.root.visible = near;
      if (near) for (const s of z.beasts) this.step(s, dt);
    }
    for (const [id, z] of this.zoos) if (!live.has(id)) { this.drop(z); this.zoos.delete(id); }
  }

  private make(g: THREE.Group, age: number): Zoo {
    const root = new THREE.Group(), beasts: Beast[] = [];
    for (const res of ZOO_RESIDENTS) {
      const actor = makeBeast(res.kind as BeastKind, res.coat, res.size, 0.95 + this.rand() * 0.1), [x, z] = res.spots[0];
      actor.mixer.setTime(this.rand() * 3);
      root.add(actor.root);
      beasts.push({ res, actor, x, z, heading: res.face, spot: 0, wait: 2 + this.rand() * 8, moving: false, phase: this.rand() * 10, t: 0 });
    }
    g.add(root);
    return { root, beasts, age };
  }

  private drop(z: Zoo) {
    for (const s of z.beasts) s.actor.mixer.stopAllAction();
    z.root.removeFromParent();
  }

  private step(s: Beast, dt: number) {
    const { res, actor } = s, [tx, tz] = res.spots[s.spot], dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (d > 0.015) {
      const k = Math.min(d, PACE[res.kind] * dt);
      s.x += (dx / d) * k; s.z += (dz / d) * k;
      // tourne vers sa route sans à-coup
      let dh = Math.atan2(dx, dz) - s.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      s.heading += dh * Math.min(1, dt * 4);
      s.moving = true;
    } else {
      s.moving = false;
      // une fois arrivée, un temps de repos, puis une autre place (s'il y en a)
      if ((s.wait -= dt) <= 0) {
        s.wait = 8 + this.rand() * 14;
        if (res.spots.length > 1) s.spot = (s.spot + 1 + Math.floor(this.rand() * (res.spots.length - 1))) % res.spots.length;
      }
    }
    actor.root.position.set(s.x, res.y, s.z);
    actor.root.rotation.y = s.heading + beastYaw(res.kind);
    if (s.moving) play(actor, ['Walk', 'Idle']);
    else {
      // au repos : de temps en temps un geste joué une fois, qu'on laisse finir
      const cur = actor.current?.getClip().name ?? '';
      if (!(GESTURES.has(cur) && actor.current!.isRunning())) {
        const k = Math.floor(this.t / 7 + s.phase * 2.3), want = k % 4 === 2 ? 'Idle_2' : k % 4 === 3 ? 'Idle_3' : 'Idle';
        play(actor, want !== 'Idle' && want !== cur && actor.actions.has(want) ? [want] : ['Idle']);
      }
    }
    actor.mixer.update(dt);
  }
}
