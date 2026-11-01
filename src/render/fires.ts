import * as THREE from 'three';
import { World } from '../world/world';
import { Building, KINDS } from '../build/catalog';
import { Puffs } from './particles';

const MAX_FLAMES = 120, FLAMES_PER_FIRE = 7;
/** Délai avant que les habitants éteignent un feu (un point d'eau tout près), durée au bout de laquelle le bâtiment est perdu */
const PUT_OUT = 14, BURN_DOWN = 32;
/** Avec une caserne à portée : les secours arrivent vite, eau ou pas */
const CREW = 5, CREW_RANGE = 14;
const SMOKE = new THREE.Color(0.22, 0.2, 0.2);

interface Fire { b: Building; t: number; seed: number }

/**
 * Incendies : la foudre ou une bombe de lave enflamme un bâtiment. Les habitants accourent ; avec un puits ou de l'eau à
 * proximité ils l'éteignent, sinon (catastrophes activées) le bâtiment finit par brûler ; une caserne proche l'éteint très vite
 */
export class Fires {
  group = new THREE.Group();
  /** messages à afficher (incendie, feu éteint, bâtiment perdu) */
  news: string[] = [];
  private list: Fire[] = [];
  private flames: THREE.InstancedMesh;
  private smoke = new Puffs(160, 0);
  private dummy = new THREE.Object3D();
  private t = 0;

  constructor(private world: World) {
    // flammes : cônes d'un orange vif (ils rayonnent la nuit)
    this.flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.08, 0.32, 5).translate(0, 0.16, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.95, 0.2) }), MAX_FLAMES);
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.group.add(this.flames, this.smoke.mesh);
  }

  get burning() { return this.list.map((f) => f.b); }

  /** Met le feu au bâtiment (sans effet s'il brûle déjà) ; true s'il s'enflamme */
  ignite(b: Building) {
    if (b.kind === 'lamp' || this.list.some((f) => f.b.id === b.id)) return false;
    this.list.push({ b, t: 0, seed: Math.random() * 10 });
    this.news.push(`🔥 Incendie : ${KINDS[b.kind].names[b.age]}`);
    return true;
  }

  /** Feu le plus proche d'un point (0 loin … 1 tout près), pour le crépitement */
  nearness(x: number, z: number) {
    let d = Infinity;
    for (const f of this.list) d = Math.min(d, Math.hypot(f.b.x + 0.5 - x, f.b.z + 0.5 - z));
    return Math.max(0, 1 - d / 10);
  }

  update(dt: number) {
    const w = this.world, d = this.dummy;
    this.t += dt;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i], b = f.b;
      // bâtiment démoli entre-temps
      if (!w.buildings.has(b.id)) { this.list.splice(i, 1); continue; }
      f.t += dt;
      const crew = this.crewNear(b), water = crew || this.waterNear(b), out = crew ? CREW : PUT_OUT;
      if (crew && f.t > CREW) { this.news.push(`🚒 Les secours ont éteint l’incendie : ${KINDS[b.kind].names[b.age]}`); this.list.splice(i, 1); continue; }
      if (water && f.t > PUT_OUT) { this.news.push(`💧 Les habitants ont éteint l’incendie : ${KINDS[b.kind].names[b.age]}`); this.list.splice(i, 1); continue; }
      if (f.t > BURN_DOWN) {
        this.list.splice(i, 1);
        if (w.disasters) { this.news.push(`🔥 ${KINDS[b.kind].names[b.age]} a brûlé`); w.removeBuilding(b.id); }
        else this.news.push(`💧 L’incendie s’est éteint : ${KINDS[b.kind].names[b.age]}`);
        continue;
      }
      const s = KINDS[b.kind].size, base = w.h(b.x, b.z), k = Math.min(1, f.t / 3) * (water ? Math.max(0.3, 1 - f.t / out) : 1);
      for (let j = 0; j < FLAMES_PER_FIRE && n < MAX_FLAMES; j++) {
        const ph = f.seed + j * 2.3, flick = 0.65 + 0.35 * Math.sin(this.t * (9 + j) + ph);
        d.position.set(b.x + s / 2 + Math.sin(ph * 3.1) * 0.28 * s, base + 0.25 + (j % 3) * 0.12, b.z + s / 2 + Math.cos(ph * 2.3) * 0.28 * s);
        d.rotation.set(Math.sin(this.t * 3 + ph) * 0.15, ph, Math.cos(this.t * 2.6 + ph) * 0.15);
        d.scale.set(k * (0.8 + 0.3 * flick), k * (0.7 + 0.8 * flick), k * (0.8 + 0.3 * flick));
        d.updateMatrix();
        this.flames.setMatrixAt(n++, d.matrix);
      }
      if (Math.random() < dt * 6 * k)
        this.smoke.spawn(b.x + s / 2 + (Math.random() - 0.5) * 0.4 * s, base + 0.7, b.z + s / 2 + (Math.random() - 0.5) * 0.4 * s, 0, 0.6 + Math.random() * 0.4, 0, 0.22, 4, SMOKE, 0.3, { grow: 3.4, drag: 0.12, wind: 0.2, alpha: 0.75 });
    }
    this.flames.count = n;
    this.flames.instanceMatrix.needsUpdate = true;
    this.smoke.update(dt);
  }

  /** Une caserne (guetteur, tour de guet, pompiers…) à portée */
  private crewNear(b: Building) {
    for (const o of this.world.buildings.values()) if (o.kind === 'fire' && o.id !== b.id && Math.hypot(o.x - b.x, o.z - b.z) <= CREW_RANGE) return true;
    return false;
  }

  /** Un puits ou de l'eau à quelques cases : on fait la chaîne avec des seaux */
  private waterNear(b: Building) {
    const w = this.world;
    if (w.nearWater(b.x, b.z, 3)) return true;
    for (const o of w.buildings.values()) if (o.kind === 'well' && Math.hypot(o.x - b.x, o.z - b.z) <= 8) return true;
    return false;
  }
}
