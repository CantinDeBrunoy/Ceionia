import * as THREE from 'three';
import { World } from '../world/world';
import { Building, KINDS, sizeOf } from '../build/catalog';
import { FIRE_RANGE } from '../sim/coverage';
import { Puffs } from './particles';

const MAX_FLAMES = 120, FLAMES_PER_FIRE = 7;
/** Délai avant que les habitants éteignent un feu (un point d'eau tout près), durée au bout de laquelle le bâtiment est perdu */
const PUT_OUT = 30, BURN_DOWN = 70;
/**
 * Avec une caserne à portée : les pompiers accourent avec leurs seaux (au plus tard, le feu est éteint au bout de CREW
 * secondes) ; le camion arrose SPRAY_OUT secondes. L'eau des seaux l'éteint aussi : DOUSE seaux × secondes en tout
 */
const CREW = 40, CREW_RANGE = FIRE_RANGE, SPRAY_OUT = 14, DOUSE = 18;
const WATER = new THREE.Color(0.78, 0.9, 1);
const SMOKE = new THREE.Color(0.22, 0.2, 0.2), STEAM = new THREE.Color(0.95, 0.96, 0.97);

interface Fire { b: Building; t: number; seed: number; /** eau jetée par les seaux (seaux × secondes) */ doused: number; /** prochain seau lancé */ throw: number }

/**
 * Incendies : la foudre, une bombe de lave ou un feu accidentel enflamme un bâtiment. Les habitants accourent ; avec un puits
 * ou de l'eau à proximité ils l'éteignent, sinon le bâtiment finit par brûler ; une caserne proche l'éteint très vite. Ce sont
 * des catastrophes : quand elles sont désactivées, aucun feu ne prend (et un feu déjà allumé s'éteint sans rien détruire)
 */
export class Fires {
  group = new THREE.Group();
  /** messages à afficher (incendie, feu éteint, bâtiment perdu) */
  news: string[] = [];
  /** les pompiers en camion (âge industriel et après) : temps d'arrosage d'un feu, 0 en route, null sans camion */
  responder: { spraying(b: Building): number | null } | null = null;
  /** où se tiennent les habitants qui jettent l'eau de leur seau sur ce bâtiment */
  pails: ((b: Building) => [number, number][]) | null = null;
  private list: Fire[] = [];
  private flames: THREE.InstancedMesh;
  private smoke = new Puffs(260, 0);
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

  /**
   * Les incendies en cours, pour leurs cartes : où, ce qui se passe (les secours arrivent, on fait la chaîne, le camion
   * arrose, ça brûle sans eau) et l'avancement de l'extinction (0 … 1)
   */
  incidents(): { key: string; icon: string; title: string; status: string; progress: number; x: number; z: number }[] {
    return this.list.map((f) => {
      const b = f.b, s = sizeOf(b), crew = this.crewNear(b), spray = crew ? this.responder?.spraying(b) ?? null : null, water = crew || this.waterNear(b);
      const pails = water ? this.pails?.(b).length ?? 0 : 0;
      const progress = Math.min(1, Math.max(spray !== null ? spray / SPRAY_OUT : 0, f.doused / DOUSE, water && spray === null ? f.t / (crew ? CREW : PUT_OUT) : 0));
      const status = spray !== null && spray > 0 ? 'Le camion des pompiers arrose' : pails ? `${pails} seau${pails > 1 ? 'x' : ''} jeté${pails > 1 ? 's' : ''} sur les flammes` : crew ? 'Les pompiers accourent' : water ? 'On fait la chaîne depuis le puits' : 'Ça brûle, pas d’eau à portée !';
      return { key: `fire:${b.id}`, icon: '🔥', title: `Incendie : ${KINDS[b.kind].names[b.age].toLowerCase()}`, status, progress, x: b.x + s / 2, z: b.z + s / 2 };
    });
  }

  /**
   * Met le feu au bâtiment (sans effet s'il brûle déjà, ni catastrophes désactivées) ; true s'il s'enflamme. Toutes les
   * sources passent par ici : foudre, bombes de lave, feux accidentels des secours
   */
  ignite(b: Building) {
    if (!this.world.disasters || b.kind === 'lamp' || this.list.some((f) => f.b.id === b.id)) return false;
    this.list.push({ b, t: 0, seed: Math.random() * 10, doused: 0, throw: 0 });
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
      // le camion des pompiers en route, le feu attend les secours (il finit par brûler si rien n'arrive)
      const crew = this.crewNear(b), spray = crew ? this.responder?.spraying(b) ?? null : null;
      const water = crew || this.waterNear(b), out = crew ? CREW : PUT_OUT;
      // ceux qui sont arrivés avec leur seau jettent l'eau sur les flammes, chacun à son tour
      const pails = water ? this.pails?.(b) ?? [] : [];
      // trois seaux à la fois au plus devant les flammes (les autres font la chaîne) : on en a pour un bon moment
      f.doused += dt * Math.min(3, pails.length) * 0.6;
      const s0 = sizeOf(b), cx = b.x + s0 / 2, cz = b.z + s0 / 2, ground = w.h(b.x, b.z);
      f.throw -= dt * pails.length * 0.9;
      if (pails.length && f.throw <= 0) {
        f.throw += 1;
        const [px, pz] = pails[Math.floor(Math.random() * pails.length)], y0 = w.surfaceAt(px, pz) + 0.16;
        for (let j = 0; j < 8; j++) {
          const k = 1.4 + Math.random() * 0.8;
          this.smoke.spawn(px, y0, pz, (cx - px) * k + (Math.random() - 0.5) * 0.4, (ground + 0.32 - y0) * k + 0.35 + Math.random() * 0.25, (cz - pz) * k + (Math.random() - 0.5) * 0.4, 0.035, 0.5, WATER, 0, { grow: 1.4, drag: 0.6, wind: 0.05, alpha: 0.8 });
        }
      }
      if (f.doused > DOUSE) { this.news.push(crew ? `🚒 Les pompiers ont éteint l’incendie : ${KINDS[b.kind].names[b.age]}` : `💧 Les habitants ont éteint l’incendie : ${KINDS[b.kind].names[b.age]}`); this.list.splice(i, 1); continue; }
      if (crew && (spray === null ? f.t > CREW : spray > SPRAY_OUT)) { this.news.push(`🚒 Les pompiers ont éteint l’incendie : ${KINDS[b.kind].names[b.age]}`); this.list.splice(i, 1); continue; }
      if (water && spray === null && f.t > PUT_OUT) { this.news.push(`💧 Les habitants ont éteint l’incendie : ${KINDS[b.kind].names[b.age]}`); this.list.splice(i, 1); continue; }
      if (f.t > (spray === null ? BURN_DOWN : BURN_DOWN * 2)) {
        this.list.splice(i, 1);
        if (w.disasters) { this.news.push(`🔥 ${KINDS[b.kind].names[b.age]} a brûlé`); w.removeBuilding(b.id); }
        else this.news.push(`💧 L’incendie s’est éteint : ${KINDS[b.kind].names[b.age]}`);
        continue;
      }
      // les flammes faiblissent sous la lance, sous les seaux, ou à mesure qu'on fait la chaîne depuis le puits
      const tamed = Math.max(spray !== null ? spray / SPRAY_OUT : 0, f.doused / DOUSE, water && spray === null ? f.t / out : 0);
      const s = s0, base = ground, k = Math.min(1, f.t / 3) * Math.max(0.25, 1 - tamed);
      for (let j = 0; j < FLAMES_PER_FIRE && n < MAX_FLAMES; j++) {
        const ph = f.seed + j * 2.3, flick = 0.65 + 0.35 * Math.sin(this.t * (9 + j) + ph);
        d.position.set(b.x + s / 2 + Math.sin(ph * 3.1) * 0.28 * s, base + 0.25 + (j % 3) * 0.12, b.z + s / 2 + Math.cos(ph * 2.3) * 0.28 * s);
        d.rotation.set(Math.sin(this.t * 3 + ph) * 0.15, ph, Math.cos(this.t * 2.6 + ph) * 0.15);
        d.scale.set(k * (0.8 + 0.3 * flick), k * (0.7 + 0.8 * flick), k * (0.8 + 0.3 * flick));
        d.updateMatrix();
        this.flames.setMatrixAt(n++, d.matrix);
      }
      // l'eau jetée sur le feu (seaux ou lance) : de la vapeur blanche monte des flammes qui faiblissent
      if ((water || spray !== null) && f.t > 2 && Math.random() < dt * 5)
        this.smoke.spawn(b.x + s / 2 + (Math.random() - 0.5) * 0.6 * s, base + 0.35, b.z + s / 2 + (Math.random() - 0.5) * 0.6 * s, 0, 0.9 + Math.random() * 0.4, 0, 0.14, 1.6, STEAM, 0.2, { grow: 2.4, drag: 0.15, wind: 0.25, alpha: 0.7 });
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
    for (const o of w.buildings.values()) if ((o.kind === 'well' || o.kind === 'watertower') && Math.hypot(o.x - b.x, o.z - b.z) <= 8) return true;
    return false;
  }
}
