import * as THREE from 'three';
import { World, N } from '../world/world';
import { Building, KindId, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import type { Fires } from './fires';

/** Portée des secours (cases) : celle de la caserne pour les incendies, la même pour l'hôpital et la police */
const RANGE = 14;
/** Temps d'arrosage avant que le feu soit éteint, temps passé sur place par l'ambulance et la police */
const SPRAY = 4, STAY = 4.5;
const WATER = new THREE.Color(0.85, 0.93, 1);

type Service = 'fire' | 'health' | 'police';
const HOME: Record<Service, KindId> = { fire: 'fire', health: 'health', police: 'police' };

interface Unit {
  service: Service;
  station: Building;
  root: THREE.Group;
  /** feux du toit (bleus, et rouge pour la police), qui clignotent en intervention */
  flash: THREE.Mesh[];
  /** blessé allongé à côté de l'ambulance, le temps de le charger */
  extra: THREE.Mesh | null;
  path: number[];
  i: number;
  x: number;
  z: number;
  heading: number;
  state: 'go' | 'work' | 'back' | 'patrol';
  t: number;
  target: Building | null;
  /** cases de route au départ (devant la caserne) et à l'arrivée */
  home: number;
  speed: number;
}

const wheel = (p: Parts, x: number, z: number, r: number, c = 0x2e2a2c) => p.add(new THREE.CylinderGeometry(r, r, 0.026, 8).rotateZ(Math.PI / 2), x, r, z, c);

/** Cheval attelé devant une voiture (âge industriel), tourné vers +z */
function horse(p: Parts, z: number) {
  p.box(0.06, 0.07, 0.15, 0, 0.08, z, 0x5a3e2e);
  p.box(0.035, 0.07, 0.05, 0, 0.14, z + 0.08, 0x5a3e2e);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.018, 0.08, 0.018, sx * 0.02, 0, z + sz * 0.05, 0x3e2a20);
  for (const s of [-1, 1]) p.box(0.01, 0.01, 0.16, s * 0.045, 0.09, z - 0.12, 0x7a6355);
}

/**
 * Véhicule de secours de l'époque, tourné vers +z, et ses feux : pompe à vapeur rouge et sa chaudière de laiton, voiture
 * d'ambulance blanche à croix rouge, fourgon de police bleu (attelés, à l'âge industriel) ; camion de pompiers et son échelle,
 * ambulance, voiture de patrouille ensuite
 */
function unitGeo(service: Service, age: number): { body: THREE.BufferGeometry; lights: [number, number, number, number][] } {
  const p = new Parts(), lights: [number, number, number, number][] = [];
  if (age < 4) {
    if (service === 'fire') {
      p.box(0.15, 0.07, 0.22, 0, 0.06, -0.06, 0xc8382e);
      p.cyl(0.04, 0.04, 0.1, 8, 0, 0.13, -0.1, 0xe8c66a); p.sphere(0.04, 0, 0.23, -0.1, 0xe8c66a);
      p.cyl(0.01, 0.01, 0.07, 5, 0, 0.13, -0.02, 0x3c3c40);
      p.add(new THREE.TorusGeometry(0.03, 0.01, 4, 10).rotateX(Math.PI / 2), 0.05, 0.14, 0.02, 0x3c3c40);
    } else if (service === 'health') {
      p.box(0.15, 0.13, 0.24, 0, 0.06, -0.06, 0xf4f2ee);
      p.box(0.152, 0.02, 0.242, 0, 0.19, -0.06, 0xe4e2dc);
      for (const s of [-1, 1]) { p.box(0.004, 0.06, 0.02, s * 0.077, 0.1, -0.06, 0xd84a3e); p.box(0.004, 0.02, 0.06, s * 0.077, 0.12, -0.06, 0xd84a3e); }
    } else {
      p.box(0.15, 0.14, 0.24, 0, 0.06, -0.06, 0x2c3e6a);
      p.box(0.152, 0.02, 0.242, 0, 0.2, -0.06, 0x1e2a48);
      for (const s of [-1, 1]) p.box(0.004, 0.04, 0.12, s * 0.077, 0.13, -0.06, 0xf4f2ee);
    }
    for (const s of [-1, 1]) { wheel(p, s * 0.085, -0.14, 0.05, 0x7a6355); wheel(p, s * 0.085, 0.02, 0.04, 0x7a6355); }
    horse(p, 0.2);
    return { body: p.build(false).body, lights };
  }
  if (service === 'fire') {
    // camion de pompiers : cabine, caisse à rideaux, bandes blanches, grande échelle, gyrophares
    p.box(0.16, 0.1, 0.34, 0, 0.04, -0.02, 0xd8382e);
    p.box(0.15, 0.06, 0.1, 0, 0.14, 0.09, 0xd8382e); p.box(0.152, 0.04, 0.08, 0, 0.15, 0.1, 0x9fc4dc);
    p.box(0.162, 0.014, 0.34, 0, 0.08, -0.02, 0xf4f2ee);
    p.box(0.05, 0.02, 0.32, 0, 0.15, -0.06, 0xb8bcc2);
    for (let k = 0; k < 7; k++) p.box(0.05, 0.006, 0.008, 0, 0.17, -0.2 + k * 0.045, 0xd8dde2);
    for (const z of [-0.13, 0.11]) for (const s of [-1, 1]) wheel(p, s * 0.08, z, 0.036);
    lights.push([-0.045, 0.205, 0.12, 0], [0.045, 0.205, 0.12, 0]);
  } else if (service === 'health') {
    // ambulance : fourgon blanc, bandes jaune et rouge, croix, gyrophares
    p.box(0.15, 0.13, 0.3, 0, 0.04, -0.02, 0xf4f2ee);
    p.box(0.14, 0.05, 0.06, 0, 0.1, 0.15, 0x9fc4dc);
    p.box(0.152, 0.02, 0.3, 0, 0.08, -0.02, 0xf2c23a); p.box(0.152, 0.012, 0.3, 0, 0.1, -0.02, 0xd84a3e);
    for (const s of [-1, 1]) { p.box(0.004, 0.05, 0.016, s * 0.077, 0.115, -0.06, 0xd84a3e); p.box(0.004, 0.016, 0.05, s * 0.077, 0.132, -0.06, 0xd84a3e); }
    for (const z of [-0.11, 0.09]) for (const s of [-1, 1]) wheel(p, s * 0.075, z, 0.034);
    lights.push([-0.04, 0.175, 0.1, 0], [0.04, 0.175, 0.1, 0]);
  } else {
    // voiture de patrouille : caisse blanche, bandeaux bleus, rampe de gyrophares bleu et rouge
    p.box(0.15, 0.06, 0.28, 0, 0.045, 0, 0xf4f2ee); p.box(0.152, 0.02, 0.282, 0, 0.06, 0, 0x2c4a9a);
    p.box(0.13, 0.05, 0.14, 0, 0.105, -0.02, 0x9fc4dc); p.box(0.134, 0.01, 0.144, 0, 0.155, -0.02, 0xf4f2ee);
    for (const z of [-0.09, 0.09]) for (const s of [-1, 1]) wheel(p, s * 0.075, z, 0.035);
    lights.push([0.03, 0.165, -0.02, 0], [-0.03, 0.165, -0.02, 1]);
  }
  return { body: p.build(false).body, lights };
}

/**
 * Les secours en intervention : quand un bâtiment prend feu à portée d'une caserne, le camion (ou la pompe attelée) part
 * de la caserne par les routes, se gare devant et arrose jusqu'à ce que le feu soit éteint ; de temps en temps un habitant
 * fait un malaise près de chez lui et l'ambulance de l'hôpital vient le chercher ; un cambriolage est signalé et la police
 * accourt ; à l'époque moderne, la voiture de patrouille fait sa ronde entre deux appels. Feux bleus (et rouge pour la
 * police) qui clignotent en intervention. Il arrive aussi qu'un feu prenne par accident, toujours à portée d'une caserne
 */
export class Emergencies {
  group = new THREE.Group();
  /** messages à afficher (départ de l'ambulance, de la police) */
  news: string[] = [];
  /** met le feu à un bâtiment (donné par le jeu : alerte les habitants, joue le son) */
  ignite: ((b: Building) => void) | null = null;
  private units: Unit[] = [];
  private geos = new Map<string, ReturnType<typeof unitGeo>>();
  private blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.55, 2.2) });
  private red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.3, 0.25) });
  private flashG = new THREE.BoxGeometry(0.035, 0.02, 0.03);
  private patientG: THREE.BufferGeometry;
  private water = new Puffs(200, 0);
  private timers: Record<Service | 'blaze', number> = { fire: 0, health: 70, police: 110, blaze: 200 };
  private time = 0;
  private age = -1;

  constructor(private world: World, private fires: Fires, private avoid: Set<number>) {
    const p = new Parts();
    p.box(0.05, 0.02, 0.15, 0, 0, 0, 0xd8dde2); p.box(0.04, 0.03, 0.04, 0, 0.02, 0.06, 0xe8b894); p.box(0.05, 0.025, 0.08, 0, 0.02, -0.01, 0x3c7fd8);
    this.patientG = p.build(false).body;
    this.group.add(this.water.mesh);
  }

  /** Arrosage du feu de ce bâtiment par les pompiers : secondes passées à l'arroser, 0 en route, null sans camion */
  spraying(b: Building): number | null {
    const u = this.units.find((o) => o.service === 'fire' && o.target?.id === b.id);
    if (!u) return null;
    return u.state === 'work' ? u.t : 0;
  }

  private geo(service: Service, age: number) {
    const k = `${service}|${age}`;
    let g = this.geos.get(k);
    if (!g) { g = unitGeo(service, age); this.geos.set(k, g); }
    return g;
  }

  /** Case de route la plus proche du bâtiment (à trois cases au plus), de préférence devant lui */
  private roadNear(b: Building) {
    const w = this.world, s = sizeOf(b);
    let best = -1, bd = Infinity;
    for (let z = b.z - 3; z < b.z + s + 3; z++) for (let x = b.x - 3; x < b.x + s + 3; x++) {
      if (!w.inCells(x, z) || !w.road[w.ci(x, z)] || this.avoid.has(w.ci(x, z))) continue;
      const d = Math.hypot(x + 0.5 - (b.x + s / 2), z + 0.5 - (b.z + s / 2));
      if (d < bd) { bd = d; best = w.ci(x, z); }
    }
    return best;
  }

  /** Plus court chemin par les routes (largeur d'abord), sans passer sur l'îlot des ronds-points */
  private route(from: number, to: number): number[] | null {
    const w = this.world;
    if (from < 0 || to < 0) return null;
    if (from === to) return [to];
    const prev = new Map<number, number>([[from, -1]]), q = [from];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === to) {
        const out: number[] = [];
        for (let x = c; x !== -1; x = prev.get(x)!) out.push(x);
        return out.reverse();
      }
      const x = c % N, z = Math.floor(c / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (!w.inCells(nx, nz) || !w.road[k] || prev.has(k) || (this.avoid.has(k) && k !== to)) continue;
        prev.set(k, c); q.push(k);
      }
    }
    return null;
  }

  /** Le plus proche poste du service (à l'âge industriel au moins), à portée de la cible */
  private stationFor(service: Service, target: Building) {
    let best: Building | null = null, bd = RANGE;
    for (const o of this.world.buildings.values()) {
      if (o.kind !== HOME[service] || o.age < 3 || o.small) continue;
      const d = Math.hypot(o.x - target.x, o.z - target.z);
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Fait partir un véhicule du poste vers la cible ; faux si la route manque */
  private dispatch(service: Service, station: Building, target: Building) {
    const home = this.roadNear(station), goal = this.roadNear(target);
    let u: Unit | null | undefined = this.units.find((o) => o.service === service && o.station.id === station.id && (o.state === 'patrol' || o.state === 'back'));
    const start = u ? Math.floor(u.z) * N + Math.floor(u.x) : home, path = this.route(this.world.road[start] ? start : home, goal);
    if (!path) return false;
    if (!u) {
      u = this.make(service, station, home);
      if (!u) return false;
    }
    u.path = path; u.i = 0; u.state = 'go'; u.target = target; u.t = 0;
    return true;
  }

  private make(service: Service, station: Building, home: number): Unit | null {
    if (home < 0) return null;
    const g = this.geo(service, this.age), root = new THREE.Group(), body = new THREE.Mesh(g.body, mats.body);
    body.castShadow = true;
    root.add(body);
    const flash = g.lights.map(([x, y, z, c]) => { const m = new THREE.Mesh(this.flashG, c ? this.red : this.blue); m.position.set(x, y, z); root.add(m); return m; });
    this.group.add(root);
    const u: Unit = { service, station, root, flash, extra: null, path: [], i: 0, x: (home % N) + 0.5, z: Math.floor(home / N) + 0.5, heading: 0, state: 'patrol', t: 0, target: null, home, speed: this.age >= 4 ? 1.7 : 0.9 };
    this.units.push(u);
    return u;
  }

  private drop(u: Unit) {
    this.group.remove(u.root);
    this.units.splice(this.units.indexOf(u), 1);
  }

  update(dt: number, age: number) {
    const w = this.world;
    this.time += dt;
    if (age !== this.age) { for (const u of [...this.units]) this.drop(u); this.age = age; }
    if (age < 3) { this.water.update(dt); return; }
    // les postes démolis rappellent leurs véhicules
    for (const u of [...this.units]) if (!w.buildings.has(u.station.id) || u.station.age < 3) this.drop(u);
    // incendies : un camion pour chaque feu à portée d'une caserne
    for (const b of this.fires.burning) {
      if (this.units.some((u) => u.service === 'fire' && u.target?.id === b.id)) continue;
      const st = this.stationFor('fire', b);
      if (st) this.dispatch('fire', st, b);
    }
    // appels : malaise près d'une maison, cambriolage ; feu accidentel, toujours à portée d'une caserne
    const houses = [...w.buildings.values()].filter((b) => b.kind === 'house');
    for (const sv of ['health', 'police', 'blaze'] as const) {
      this.timers[sv] -= dt;
      if (this.timers[sv] > 0 || !houses.length) continue;
      this.timers[sv] = sv === 'health' ? 60 + Math.random() * 80 : sv === 'police' ? 80 + Math.random() * 100 : 150 + Math.random() * 150;
      const service: Service = sv === 'blaze' ? 'fire' : sv;
      if (this.units.some((u) => u.service === service && u.state !== 'patrol')) continue;
      const near = houses.filter((h) => !!this.stationFor(service, h));
      if (!near.length) continue;
      const h = near[Math.floor(Math.random() * near.length)];
      if (sv === 'blaze') { this.ignite?.(h); continue; }
      if (this.dispatch(service, this.stationFor(service, h)!, h)) this.news.push(service === 'health' ? '🚑 Un habitant a fait un malaise : l’ambulance arrive' : '🚓 Cambriolage signalé : la police arrive');
    }
    // à l'époque moderne, la voiture de patrouille fait sa ronde
    if (age >= 4) for (const st of w.buildings.values()) {
      if (st.kind !== 'police' || st.age < 4 || st.small || this.units.some((u) => u.service === 'police' && u.station.id === st.id)) continue;
      const u = this.make('police', st, this.roadNear(st));
      if (u) u.t = 2;
    }
    const blink = Math.floor(this.time * 6) % 2 === 0;
    for (const u of [...this.units]) {
      u.t += dt;
      if (u.state === 'go' && u.target && !w.buildings.has(u.target.id)) { u.state = 'back'; u.target = null; u.path = this.route(Math.floor(u.z) * N + Math.floor(u.x), u.home) ?? []; u.i = 0; }
      if (u.state === 'go' || u.state === 'back' || u.state === 'patrol') {
        if (this.drive(u, dt)) {
          if (u.state === 'go') { u.state = 'work'; u.t = 0; }
          else if (u.state === 'back') { if (u.service === 'police' && this.age >= 4) { u.state = 'patrol'; u.path = []; u.t = 0; } else { this.drop(u); continue; } }
          else if (u.state === 'patrol' && u.t > 2) {
            // ronde : une rue au hasard à portée du commissariat, puis une autre
            const roads: number[] = [];
            for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) { const x = u.station.x + dx, z = u.station.z + dz; if (w.inCells(x, z) && w.road[w.ci(x, z)] && !this.avoid.has(w.ci(x, z))) roads.push(w.ci(x, z)); }
            const goal = roads[Math.floor(Math.random() * roads.length)], p = goal !== undefined ? this.route(Math.floor(u.z) * N + Math.floor(u.x), goal) : null;
            u.path = p ?? []; u.i = 0; u.t = p ? 0 : 1;
          }
        }
      } else if (u.state === 'work') {
        const tb = u.target;
        if (u.service === 'fire' && tb) {
          // les pompiers arrosent : un jet d'eau du camion vers le feu
          const s = sizeOf(tb), tx = tb.x + s / 2, tz = tb.z + s / 2, y0 = w.surfaceAt(u.x, u.z) + 0.2, y1 = w.h(tb.x, tb.z) + 0.35;
          if (Math.random() < dt * 40) {
            const k = 0.9 + Math.random() * 0.3;
            this.water.spawn(u.x, y0, u.z, (tx - u.x) * k, (y1 - y0) * k + 0.3, (tz - u.z) * k, 0.03, 1, WATER, 0, { grow: 1.6, drag: 0, wind: 0.05, alpha: 0.7 });
          }
          if (!this.fires.burning.some((b) => b.id === tb.id) || u.t > SPRAY + 20) this.goHome(u);
        } else if (u.t > STAY) this.goHome(u);
        // le blessé attend à côté de l'ambulance qu'on l'emporte
        if (u.service === 'health') {
          if (!u.extra) { u.extra = new THREE.Mesh(this.patientG, mats.body); this.group.add(u.extra); }
          u.extra.visible = u.t < STAY * 0.7;
          u.extra.position.set(u.x + Math.cos(u.heading) * 0.16, w.surfaceAt(u.x, u.z) + 0.01, u.z - Math.sin(u.heading) * 0.16);
          u.extra.rotation.y = u.heading;
        }
      }
      if (u.extra && u.state !== 'work') { this.group.remove(u.extra); u.extra = null; }
      u.root.position.set(u.x, w.surfaceAt(u.x, u.z) + 0.01, u.z);
      u.root.rotation.y = u.heading;
      const on = u.state === 'go' || u.state === 'work';
      u.flash.forEach((m, i) => { m.visible = on && (i % 2 === 0 ? blink : !blink); });
    }
    this.water.update(dt);
  }

  private goHome(u: Unit) {
    u.state = 'back'; u.target = null;
    u.path = this.route(Math.floor(u.z) * N + Math.floor(u.x), u.home) ?? [];
    u.i = 0;
  }

  /** Avance le long du chemin en tenant sa droite ; vrai à l'arrivée */
  private drive(u: Unit, dt: number) {
    if (u.i >= u.path.length) return true;
    const [cx, cz] = this.world.passPoint(u.path, u.i);
    const hx = Math.sin(u.heading), hz = Math.cos(u.heading), tx = cx - hz * 0.14, tz = cz + hx * 0.14;
    const dx = tx - u.x, dz = tz - u.z, dist = Math.hypot(dx, dz), step = dt * u.speed;
    if (dist <= step) { u.x = tx; u.z = tz; u.i++; }
    else {
      u.x += (dx / dist) * step; u.z += (dz / dist) * step;
      let da = Math.atan2(dx, dz) - u.heading;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      u.heading += da * Math.min(1, dt * 7);
    }
    return u.i >= u.path.length;
  }
}
