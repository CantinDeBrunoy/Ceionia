import type { World } from './world';
import type { DiploState } from '../sim/diplomacy';
import { rivalTownState } from '../sim/diplomacy';
import { inPoly, segDist, casemateSpots, type Lot, type TownPlan } from './rivalTown';
import { zoneOf } from './concession';
import { hash2 } from '../core/rng';

/**
 * Les villes des peuples qui suivent la campagne du nouveau monde (chantier D, plan partie 4). Des lots en plus du plan de
 * la ville (`TownPlan.lots` ne change pas : une carte sans campagne garde exactement sa ville), chacun avec son âge
 * d'apparition et une condition de la campagne (`when`) :
 * - chez le rival en guerre (`war`) : deux bastions devant la porte du port et une batterie sur le quai (Industriel), puis
 *   deux casemates aux tours près de la porte, deux canons côtiers, des barbelés et sacs de sable devant chaque porte, la tour
 *   du radar sur le palais (Moderne) ;
 * - chez le rival vaincu (`won`) : nos drapeaux sur le palais et le port ; la ville passe par la ruine puis la reconstruction
 *   (`townLotState`) ;
 * - chez l'allié (`ally`, les deux voies) : le poste de garde au passage et le ponton vers la concession (Médiéval), le pont
 *   sur le passage et un faubourg de maisons hors les murs vers la concession (Industriel), un quartier moderne (deux
 *   gratte-ciel) et l'avenue éclairée (Moderne) ; sur la voie de la paix (`allyPeace`), le mât aux trois drapeaux.
 * Places tirées d'un calcul pur (sans hasard partagé : rien d'autre ne bouge), mises en cache avec le plan
 */

export type TownWhen = 'war' | 'won' | 'ally' | 'allyPeace';
/** Les sortes des lots de campagne (modèles : `render/models/townWar.ts`), plus des maisons et des gratte-ciel de la ville */
export type CampKind = 'bastion' | 'quayBattery' | 'casemate' | 'coastGun' | 'wire' | 'radarMast' | 'pontoon' | 'guardPost' | 'bridge' | 'avenue' | 'mast3' | 'ourFlags' | 'house' | 'skyscraper';
export interface CampLot extends Omit<Lot, 'kind'> { kind: CampKind; when: TownWhen }

const cache = new WeakMap<TownPlan, CampLot[]>();

/** Les lots de campagne de cette ville (tous, quelle que soit la campagne : `campLotsAt` choisit) */
export function campaignLots(w: World, plan: TownPlan): CampLot[] {
  let out = cache.get(plan);
  if (!out) { out = drawCampaign(w, plan); cache.set(plan, out); }
  return out;
}

/** Le rôle de cette ville dans la campagne : ce qui est vrai pour elle (vide sans archipel ni allié) */
export function townRoles(d: Pick<DiploState, 'ally' | 'path' | 'conflict'>, people: TownPlan['people']): Set<TownWhen> {
  const s = new Set<TownWhen>();
  if (!d.ally) return s;
  if (d.ally === people) {
    s.add('ally');
    if (d.path === 'peace' || d.conflict === 'peace' || d.conflict === 'treaty') s.add('allyPeace');
  } else {
    if (d.path === 'war' && d.conflict === 'open') s.add('war');
    if (d.conflict === 'won') s.add('won');
  }
  return s;
}

/** Les lots de campagne présents à cet âge (des modèles), pour ces rôles */
export function campLotsAt(lots: CampLot[], age: number, roles: Set<TownWhen>) {
  return lots.filter((l) => l.from <= age && roles.has(l.when));
}

/**
 * L'état d'un lot de la ville rivale vaincue (null : intact, la ville n'est pas vaincue) : les quartiers du côté de l'assaut,
 * la porte, les tours voisines et la moitié des maisons passent par la ruine puis la reconstruction (`rivalTownState`) ; le
 * temple et les champs restent debout
 */
export function townLotState(plan: TownPlan, lot: Pick<Lot, 'kind' | 'x' | 'z'>, d: Pick<DiploState, 'conflict' | 'victors' | 'wonAt' | 'ally'>, clock: number, dayLen: number): 'ruin' | 'repair' | null {
  if (d.ally === plan.people || d.conflict !== 'won') return null;
  const st = rivalTownState(d, clock, dayLen);
  if (!st || st === 'intact') return null;
  if (lot.kind === 'temple' || lot.kind === 'field' || lot.kind === 'port') return null;
  const g = plan.points.portes[0] ?? [plan.x, plan.z], near = Math.hypot(lot.x - g[0], lot.z - g[1]) < plan.r * 0.9;
  const hit = lot.kind === 'gate' || lot.kind === 'palace' || near || hash2(Math.round(lot.x * 3), Math.round(lot.z * 3), 61) < 0.45;
  return hit ? st : null;
}

/** Les places : un calcul pur, du plan de la ville et de la zone de l'île */
function drawCampaign(w: World, plan: TownPlan): CampLot[] {
  const out: CampLot[] = [], cx = plan.x, cz = plan.z, wall = plan.wall, K = wall.length;
  const h = (x: number, z: number) => (w.inCells(Math.floor(x), Math.floor(z)) ? w.cellAvg(Math.floor(x), Math.floor(z)) : -9);
  const land = (x: number, z: number) => h(x, z) > 0.12;
  const flat = (x: number, z: number, r: number) => { const a = [h(x - r, z), h(x + r, z), h(x, z - r), h(x, z + r)]; return Math.max(...a) - Math.min(...a) < 0.9; };
  const zone = zoneOf(w, plan.people);
  const inZone = (x: number, z: number) => !!zone && w.inCells(Math.floor(x), Math.floor(z)) && zone.cells.has(w.ci(Math.floor(x), Math.floor(z)));
  const nearWall = (x: number, z: number, r: number) => wall.some((p, j) => segDist(x, z, p, wall[(j + 1) % K]) < r);
  /** le lot est-il libre (ni sur un lot de la ville, ni sur un lot de campagne déjà posé) ? */
  const free = (x: number, z: number, r: number) =>
    !plan.lots.some((l) => l.kind !== 'field' && Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d) * 0.5 + r) && !out.some((l) => Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d) * 0.5 + r);
  const add = (kind: CampKind, when: TownWhen, x: number, z: number, lw: number, ld: number, rot: number, from: number, v = 0) => {
    out.push({ kind, when, x, z, w: lw, d: ld, rot, from, v: v || Math.floor(hash2(Math.round(x * 5), Math.round(z * 5), 17) * 1000) });
  };
  /** la façade (+z) tournée vers (ux, uz) */
  const face = (ux: number, uz: number) => Math.atan2(ux, uz);
  const unit = (a: [number, number], b: [number, number]): [number, number] => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };

  // ---------- Chez le rival en guerre ----------
  const g0 = plan.points.portes[0] ?? wall[0], [ux, uz] = unit([cx, cz], g0);
  // (Industriel) deux bastions devant la porte du port, de part et d'autre de la route
  for (const s of [-1, 1]) for (const d of [2.6, 3.2, 3.8]) {
    const x = g0[0] + ux * d - uz * s * 2.1, z = g0[1] + uz * d + ux * s * 2.1;
    if (land(x, z) && flat(x, z, 0.9) && free(x, z, 1) && !inPoly(x, z, wall)) { add('bastion', 'war', x, z, 2, 1.8, face(ux, uz), 3); break; }
  }
  // (Industriel) la batterie du quai, à côté du port
  const q = plan.points.port, [qx, qz] = unit([cx, cz], q);
  for (const s of [1, -1]) {
    let ok = false;
    for (const d of [2.4, 3, 3.6]) {
      const x = q[0] - qz * s * d, z = q[1] + qx * s * d;
      if (land(x, z) && free(x, z, 0.8)) { add('quayBattery', 'war', x, z, 1.8, 1, face(qx, qz), 3); ok = true; break; }
    }
    if (ok) break;
  }
  // (Moderne) les casemates, au pied extérieur des tours près de la porte
  for (const t of casemateSpots(plan)) {
    const [tx, tz] = unit([cx, cz], t), x = t[0] + tx * 1.25, z = t[1] + tz * 1.25;
    if (land(x, z)) add('casemate', 'war', x, z, 1.3, 1.1, face(tx, tz), 4);
  }
  // (Moderne) deux canons côtiers sur le rivage, de part et d'autre du port
  let guns = 0;
  for (const s of [1, -1]) for (const d of [4.2, 5, 5.8, 6.6]) {
    const x = q[0] - qz * s * d - qx * 0.8, z = q[1] + qx * s * d - qz * 0.8;
    if (guns < 2 && land(x, z) && flat(x, z, 0.8) && free(x, z, 0.9)) { add('coastGun', 'war', x, z, 1.6, 1.6, face(qx, qz), 4); guns++; break; }
  }
  // (Moderne) les barbelés et les sacs de sable devant chaque porte
  for (const g of plan.points.portes) {
    const [gx, gz] = unit([cx, cz], g), x = g[0] + gx * 1.9, z = g[1] + gz * 1.9;
    if (land(x, z)) add('wire', 'war', x, z, 2.2, 0.6, face(gx, gz), 4);
  }
  // (Moderne) la tour du radar, sur le palais (son arrière)
  {
    const p = plan.points.palais, [px, pz] = unit([cx, cz], p);
    add('radarMast', 'war', p[0] + px * 1.6, p[1] + pz * 1.6, 0.8, 0.8, face(-px, -pz), 4);
  }
  // ---------- Chez le rival vaincu : nos drapeaux sur le palais et le port ----------
  {
    const p = plan.points.palais, [px, pz] = unit([cx, cz], p);
    add('ourFlags', 'won', p[0] - pz * 1.8, p[1] + px * 1.8, 0.4, 0.4, 0, 2);
    add('ourFlags', 'won', q[0] - qx * 1.4, q[1] - qz * 1.4, 0.4, 0.4, 0, 2);
  }

  // ---------- Chez l'allié : vers la concession ----------
  if (zone) {
    const gate: [number, number] = [zone.gate[0], zone.gate[1]], [vx, vz] = unit([cx, cz], gate), dist = Math.hypot(gate[0] - cx, gate[1] - cz);
    // (Médiéval) le poste de garde au passage, du côté de la ville
    for (const d of [1.6, 2.2, 2.8, 3.4]) {
      const x = gate[0] - vx * d - vz * 0.6, z = gate[1] - vz * d + vx * 0.6;
      if (land(x, z) && !inZone(x, z) && free(x, z, 0.6) && !inPoly(x, z, wall)) { add('guardPost', 'ally', x, z, 1.2, 1, face(vx, vz), 2); break; }
    }
    // (Médiéval) le ponton : sur la rive la plus proche du milieu entre la ville et la zone, vers l'eau
    {
      const mx = (cx + zone.x) / 2, mz = (cz + zone.z) / 2;
      let best: [number, number, number, number] | null = null, bd = Infinity;
      for (let dz = -14; dz <= 14; dz++) for (let dx = -14; dx <= 14; dx++) {
        const x = Math.floor(mx) + dx + 0.5, z = Math.floor(mz) + dz + 0.5;
        if (!land(x, z) || inZone(x, z) || inPoly(x, z, wall) || nearWall(x, z, 1.5)) continue;
        // (une rive : de l'eau assez profonde à deux cases d'un côté)
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (h(x + ax * 2, z + az * 2) > -0.3 || h(x + ax, z + az) > 0.2) continue;
          const sc = Math.hypot(x - mx, z - mz);
          if (sc < bd && free(x + ax, z + az, 0.8)) { bd = sc; best = [x + ax * 1.2, z + az * 1.2, ax, az]; }
        }
      }
      if (best) add('pontoon', 'ally', best[0], best[1], 0.8, 2.2, face(best[2], best[3]), 2);
    }
    // (Industriel) le pont sur le passage (la ria, le col, ou la porte dans le mur des anciennes cartes)
    {
      const [zx, zz] = unit(gate, [zone.x, zone.z]);
      add('bridge', 'ally', gate[0], gate[1], 3, 0.8, Math.atan2(-zz, zx), 3);
    }
    // (Industriel) le faubourg : des maisons hors les murs, le long du chemin de la ville au passage
    let n = 0;
    for (let d = plan.r + 2; d < dist - 2.5 && n < 6; d += 1.3)
      for (const s of [-1, 1]) {
        const x = cx + vx * d - vz * s * 1.5, z = cz + vz * d + vx * s * 1.5;
        if (n >= 6 || !land(x, z) || inZone(x, z) || inPoly(x, z, wall) || nearWall(x, z, 1.2) || !flat(x, z, 0.6) || !free(x, z, 0.75)) continue;
        add('house', 'ally', x, z, 1.2, 1.1, face(vz * s, -vx * s), 3, 100 + n * 7);
        n++;
      }
    // (Moderne) le quartier moderne : deux gratte-ciel, plus loin sur le chemin
    let k = 0;
    for (let d = plan.r + 3; d < dist - 3 && k < 2; d += 1)
      for (const s of [1, -1]) {
        const x = cx + vx * d - vz * s * 3.4, z = cz + vz * d + vx * s * 3.4;
        if (k >= 2 || !land(x, z) || inZone(x, z) || inPoly(x, z, wall) || nearWall(x, z, 2) || !flat(x, z, 1.1) || !free(x, z, 1.4)) continue;
        add('skyscraper', 'ally', x, z, 2.4, 2.4, face(vz * s, -vx * s), 4, 200 + k * 11);
        k++;
      }
    // (Moderne) l'avenue éclairée, de la sortie de la ville au passage
    {
      const a = plan.r + 1.2, b = Math.max(a + 2, dist - 1.6), mid = (a + b) / 2, len = Math.min(10, b - a);
      const x = cx + vx * mid, z = cz + vz * mid;
      if (len >= 2 && land(x, z)) add('avenue', 'ally', x, z, len, 0.9, Math.atan2(-vz, vx), 4);
    }
    // (Moderne, la paix) le mât aux trois drapeaux, devant le poste de garde
    for (const d of [3.6, 4.4, 5.2]) {
      const x = gate[0] - vx * d + vz * 1.2, z = gate[1] - vz * d - vx * 1.2;
      if (land(x, z) && !inZone(x, z) && free(x, z, 0.6) && !inPoly(x, z, wall)) { add('mast3', 'allyPeace', x, z, 1, 1, face(vx, vz), 4); break; }
    }
  }
  return out;
}
