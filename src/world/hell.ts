import { VR } from './world';
import { Simplex } from './noise';
import { hash2 } from '../core/rng';
import { UWALL, ROCK_ISO, FLOOR_ISO, POOL_LAVA } from './underground';

/**
 * Le monde des Enfers : une longue faille de cavernes qui mène du portail (où arrive le joueur, au nord) jusqu'au royaume
 * démoniaque (tout au fond, au sud), zone après zone. Même modèle de cases que le monde souterrain (galeries ouvertes, bassins,
 * relief affiché VR sommets par case, parois de hauteur UWALL) : la vue infernale en reprend le rendu
 */

/** Largeur (x) et longueur (z) de la carte, en cases */
export const HW = 64, HL = 184;
/** Sommets du relief affiché par côté */
export const HVW = HW * VR + 1, HVL = HL * VR + 1;
/** Bassins : lave (comme sous terre) et abîme (une falaise qui plonge sur une lave lointaine) */
export const HPOOL_LAVA = POOL_LAVA, HPOOL_CHASM = 3;
/** Niveau de la lave des bassins et du fond des abîmes */
export const HLAVA_Y = -0.16, HCHASM_Y = -1.45;
export { UWALL as HWALL };

/** Les zones, du portail au royaume : nom, et où elles commencent (z) ; la dernière finit au bout de la carte */
export const HELL_ZONES: { name: string; z0: number }[] = [
  { name: 'Seuil du portail', z0: 0 },
  { name: 'Grottes de braise', z0: 20 },
  { name: 'Rivière de lave', z0: 46 },
  { name: 'Falaises cendrées', z0: 72 },
  { name: 'Gorge des os', z0: 98 },
  { name: 'Forêt de cristaux', z0: 124 },
  { name: 'Royaume démoniaque', z0: 150 },
];
export const Z_PORTAL = 0, Z_EMBER = 1, Z_RIVER = 2, Z_CLIFFS = 3, Z_BONES = 4, Z_CRYSTAL = 5, Z_KINGDOM = 6;
export const HELL_ZONE_N = HELL_ZONES.length;
/** Zone d'une rangée de cases */
export function zoneOfZ(z: number) {
  let i = 0;
  while (i + 1 < HELL_ZONES.length && z >= HELL_ZONES[i + 1].z0) i++;
  return i;
}
export const zoneEnd = (i: number) => (i + 1 < HELL_ZONES.length ? HELL_ZONES[i + 1].z0 : HL);

/** Bâtiments démoniaques : avant-poste (tour de guet), forge (renforts), forteresse (une par zone), royaume (la citadelle) */
export type HellSiteKind = 'outpost' | 'forge' | 'fortress' | 'kingdom';
/** Un emplacement de bâtiment : centre, zone, rayon de son emprise (les cases couvertes sont bloquées) */
export interface HellSite { kind: HellSiteKind; x: number; z: number; zone: number; r: number }
export interface HellZoneInfo {
  id: number; name: string; z0: number; z1: number;
  sites: HellSite[];
  /** postes de garde de la garnison (autour des bâtiments) */
  posts: [number, number][];
  /** boucle de patrouille, le long de la faille */
  patrol: [number, number][];
}

const BORDER = 2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Rayon de la faille principale, par zone : large au seuil et au royaume, corniche sur les falaises, gorge étroite */
const SPINE_R = [5, 3.2, 3, 1.6, 1.4, 3, 4];
/** Seuil des cavernes annexes (« fromage »), par zone : plus il est haut, moins il y en a */
const CHEESE = [0.5, 0.1, 0.18, 0.6, 0.4, 0.12, 0.5];

export class HellMap {
  readonly W = HW;
  readonly L = HL;
  open = new Uint8Array(HW * HL);
  zone = new Uint8Array(HW * HL);
  pool = new Uint8Array(HW * HL);
  /** pont au-dessus de la lave (on y marche) */
  bridge = new Uint8Array(HW * HL);
  /** emprise d'un bâtiment (on n'y marche pas tant qu'il tient debout) */
  block = new Uint8Array(HW * HL);
  floor = new Float32Array(HW * HL);
  wallDist = new Uint8Array(HW * HL);
  vis = new Float32Array(HVW * HVL);
  vOpen = new Float32Array(HVW * HVL);
  vGround = new Float32Array(HVW * HVL);
  vBump0 = new Float32Array(HVW * HVL);
  vBump1 = new Float32Array(HVW * HVL);
  /** case d'arrivée du joueur (devant le portail) et le portail lui-même, un peu plus au nord */
  arrival: [number, number] = [HW / 2, 10];
  portal: [number, number] = [HW / 2, 6];
  /** ligne de la faille principale, une position par rangée */
  spine = new Float32Array(HL);
  zones: HellZoneInfo[] = [];
  /** incrémenté quand une emprise se libère (un bâtiment abattu) */
  version = 0;

  constructor(readonly seed: number) {
    this.generate();
  }

  inside(x: number, z: number) { return x >= 0 && z >= 0 && x < HW && z < HL; }
  cell(x: number, z: number) { return Math.floor(z) * HW + Math.floor(x); }

  /** Case où l'on marche : ouverte, hors des bassins (sauf sur un pont), hors des emprises de bâtiment */
  walkable(cx: number, cz: number) {
    if (cx < 0 || cz < 0 || cx >= HW || cz >= HL) return false;
    const k = cz * HW + cx;
    return this.open[k] === 1 && this.block[k] === 0 && (this.pool[k] === 0 || this.bridge[k] === 1);
  }
  walkableAt(x: number, z: number) { return this.walkable(Math.floor(x), Math.floor(z)); }

  zoneAt(z: number) { return zoneOfZ(Math.min(HL - 1, Math.max(0, Math.floor(z)))); }

  /** Hauteur affichée exacte (mêmes triangles que le maillage) */
  heightAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), HW - 1e-4) * VR, z = Math.min(Math.max(wz, 0), HL - 1e-4) * VR;
    const cx = Math.floor(x), cz = Math.floor(z), u = x - cx, v = z - cz;
    const i = cz * HVW + cx, vis = this.vis;
    const h00 = vis[i], h10 = vis[i + 1], h01 = vis[i + HVW], h11 = vis[i + HVW + 1];
    if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + u * (h11 - h01) + v * (h01 - h00);
  }

  /** Hauteur du sol où se tiennent les unités : sur un pont, le tablier ; jamais le haut des parois */
  groundY(x: number, z: number) {
    const k = this.cell(Math.min(HW - 1, Math.max(0, x)), Math.min(HL - 1, Math.max(0, z)));
    if (this.bridge[k]) return 0.14;
    return Math.min(0.4, Math.max(-0.1, this.heightAt(x, z)));
  }

  /** Distance en pas depuis une ou plusieurs cases, -1 hors d'atteinte */
  distances(from: number | number[]) {
    const d = new Int32Array(HW * HL).fill(-1), q = new Int32Array(HW * HL);
    let h = 0, t = 0;
    for (const f of typeof from === 'number' ? [from] : from) if (f >= 0 && f < HW * HL && d[f] < 0) { d[f] = 0; q[t++] = f; }
    while (h < t) {
      const k = q[h++], x = k % HW, z = (k - x) / HW;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, n = nz * HW + nx;
        if (!this.walkable(nx, nz) || d[n] >= 0) continue;
        d[n] = d[k] + 1; q[t++] = n;
      }
    }
    return d;
  }

  /** Chemin de case en case (bornes comprises), ou null ; `to` peut être une case bloquée (on s'arrête devant) */
  route(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const d = this.distances(to);
    // but sur une emprise (un bâtiment à attaquer) : on vise la case libre voisine la plus proche
    if (d[from] < 0) return null;
    const out = [from];
    for (let k = from, guard = 0; k !== to && guard < HW * HL; guard++) {
      const x = k % HW, z = (k - x) / HW;
      let next = -1;
      for (const [dx, dz] of DIRS) {
        const n = (z + dz) * HW + x + dx;
        if (x + dx < 0 || z + dz < 0 || x + dx >= HW || z + dz >= HL) continue;
        if ((this.walkable(x + dx, z + dz) || n === to) && d[n] === d[k] - 1) { next = n; break; }
      }
      if (next < 0) return null;
      out.push(next); k = next;
    }
    return out;
  }

  /** Case où l'on marche la plus proche d'un point (dans un rayon de `max` cases), -1 sinon */
  nearestWalkable(x: number, z: number, max = 6) {
    const cx = Math.floor(x), cz = Math.floor(z);
    let best = -1, bd = Infinity;
    for (let dz = -max; dz <= max; dz++)
      for (let dx = -max; dx <= max; dx++) {
        if (!this.walkable(cx + dx, cz + dz)) continue;
        const d = Math.hypot(cx + dx + 0.5 - x, cz + dz + 0.5 - z);
        if (d < bd) { bd = d; best = (cz + dz) * HW + cx + dx; }
      }
    return best;
  }

  /** Ligne droite praticable entre deux points (aucune case infranchissable traversée) */
  lineClear(x0: number, z0: number, x1: number, z1: number) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d * 3);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.walkableAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  /** Libère l'emprise d'un bâtiment abattu (ses ruines se traversent) */
  unblock(site: HellSite) {
    this.footprint(site, 0);
    this.version++;
  }

  /** Remet l'emprise d'un bâtiment (relevé, ou posé par le joueur) */
  reblock(site: { x: number; z: number; r: number }) {
    this.footprint(site, 1);
    this.version++;
  }

  /** Cases couvertes par une emprise */
  footprintCells(s: { x: number; z: number; r: number }) {
    const out: number[] = [];
    for (let z = Math.floor(s.z - s.r - 1); z <= s.z + s.r + 1; z++)
      for (let x = Math.floor(s.x - s.r - 1); x <= s.x + s.r + 1; x++)
        if (this.inside(x, z) && Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) <= s.r) out.push(z * HW + x);
    return out;
  }

  private footprint(s: { x: number; z: number; r: number }, v: number) {
    for (const k of this.footprintCells(s)) this.block[k] = v;
  }

  // ---------- Génération ----------

  private generate() {
    const seed = this.seed * 31 + 666;
    const s1 = new Simplex(seed + 1), s2 = new Simplex(seed + 2), s3 = new Simplex(seed + 3), s4 = new Simplex(seed + 4), s5 = new Simplex(seed + 5);
    const open = this.open, pool = this.pool, inb = (x: number, z: number) => x >= BORDER && z >= BORDER && x < HW - BORDER && z < HL - BORDER;
    const carve = (cx: number, cz: number, r: number) => {
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if (inb(x, z) && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r) { open[z * HW + x] = 1; pool[z * HW + x] = 0; }
    };
    for (let z = 0; z < HL; z++) for (let x = 0; x < HW; x++) this.zone[z * HW + x] = zoneOfZ(z);

    // la faille : elle serpente d'un bord à l'autre, revient au milieu au seuil et au royaume
    const kz = HL - 18;
    for (let z = 0; z < HL; z++) {
      const wander = s1.noise2(z * 0.028, 3.7) * 14 + s2.noise2(z * 0.09, 8.1) * 4;
      const calm = Math.min(1, Math.max(0, (z - 14) / 10)) * Math.min(1, Math.max(0, (kz - 12 - z) / 10));
      this.spine[z] = Math.min(HW - 11, Math.max(11, HW / 2 + wander * calm));
      // pente bornée : la corniche et la gorge restent d'un seul tenant d'une rangée à l'autre
      if (z > 0) this.spine[z] = Math.min(this.spine[z - 1] + 0.7, Math.max(this.spine[z - 1] - 0.7, this.spine[z]));
    }
    const sx = (z: number) => this.spine[Math.min(HL - 1, Math.max(0, Math.round(z)))];
    // cavernes annexes, d'abord : la faille et les salles se creusent par-dessus
    for (let z = BORDER; z < HL - BORDER; z++)
      for (let x = BORDER; x < HW - BORDER; x++) {
        const zi = zoneOfZ(z);
        if (s3.fbm(x * 0.07, z * 0.07, 3) > CHEESE[zi] && Math.abs(x - sx(z)) < 22) open[z * HW + x] = 1;
      }
    // automate cellulaire : bords adoucis
    const tmp = new Uint8Array(HW * HL);
    for (let pass = 0; pass < 2; pass++) {
      tmp.set(open);
      for (let z = BORDER; z < HL - BORDER; z++)
        for (let x = BORDER; x < HW - BORDER; x++) {
          let n = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) n += tmp[(z + dz) * HW + x + dx];
          if (n >= 5) open[z * HW + x] = 1;
          else if (n <= 2) open[z * HW + x] = 0;
        }
    }
    // la faille principale, d'un rayon propre à chaque zone
    for (let z = 4; z < HL - 6; z += 0.5) {
      const zi = zoneOfZ(z), r = SPINE_R[zi] + s4.noise2(z * 0.13, 1.1) * 0.5;
      carve(sx(z) + 0.5, z + 0.5, Math.max(1.3, r));
    }

    // zone 3 : la corniche au-dessus de l'abîme (tout le large de la salle est un gouffre, sauf la corniche)
    const c0 = HELL_ZONES[Z_CLIFFS].z0, c1 = zoneEnd(Z_CLIFFS);
    for (let z = c0 + 2; z < c1 - 2; z++)
      for (let x = BORDER; x < HW - BORDER; x++) {
        const k = z * HW + x, d = Math.abs(x + 0.5 - sx(z) - 0.5), edge = 11 + s5.noise2(x * 0.15, z * 0.15) * 3 - (z < c0 + 5 || z > c1 - 5 ? 4 : 0);
        if (d > edge) continue;
        open[k] = 1;
        if (d > SPINE_R[Z_CLIFFS] + 0.3 + s5.noise2(z * 0.3, 7) * 0.4) pool[k] = HPOOL_CHASM;
      }

    // zone 2 : la rivière de lave barre la faille de part en part ; deux ponts la franchissent
    const r0 = HELL_ZONES[Z_RIVER].z0 + 12;
    const riverZ = (x: number) => r0 + Math.sin(x * 0.16) * 2 + s5.noise2(x * 0.08, 40) * 1.5;
    for (let x = BORDER; x < HW - BORDER; x++) {
      const rz = riverZ(x + 0.5);
      for (let z = Math.floor(rz - 5); z <= rz + 5; z++) {
        if (!inb(x, z)) continue;
        const k = z * HW + x, d = Math.abs(z + 0.5 - rz);
        if (d < 3.6 && Math.abs(x - sx(z)) < 18) open[k] = 1;
        if (open[k] && d < 1.7) pool[k] = HPOOL_LAVA;
      }
    }

    // les salles : le seuil (le portail au nord), la place de chaque forteresse, la salle du royaume
    carve(this.portal[0], this.portal[1] + 3, 7);
    this.arrival = [sx(10) + 0.5, 10.5];
    this.portal = [sx(5) + 0.5, 5.5];
    const king: [number, number] = [HW / 2, kz];
    carve(king[0], king[1] - 1, 15);
    const sites: HellSite[] = [];
    const sideOf = (zi: number, salt: number) => (hash2(zi, this.seed, salt) < 0.5 ? -1 : 1);
    for (let zi = 1; zi < Z_KINGDOM; zi++) {
      const z0 = HELL_ZONES[zi].z0, z1 = zoneEnd(zi), zf = z1 - 8, side = sideOf(zi, 11);
      // la place de la forteresse (sur la corniche, une avancée de roche au-dessus de l'abîme)
      carve(sx(zf) + 0.5, zf + 0.5, 5.5);
      sites.push({ kind: 'fortress', x: sx(zf) + 0.5 + side * 3.2, z: zf + 0.5, zone: zi, r: 1.9 });
      // un avant-poste à l'entrée de la zone, dans une alcôve
      const zo = z0 + 6, so = sideOf(zi, 12);
      carve(sx(zo) + 0.5 + so * 2.6, zo + 0.5, 2.2);
      sites.push({ kind: 'outpost', x: sx(zo) + 0.5 + so * 2.6, z: zo + 0.5, zone: zi, r: 0.7 });
      // une forge au milieu, à l'écart de la faille
      // (dans la zone de la rivière, avant elle : la place de la forteresse est juste après)
      const zm = zi === Z_RIVER ? z0 + 3 : Math.round((z0 + z1) / 2), sm = -so;
      carve(sx(zm) + 0.5 + sm * 4.5, zm + 0.5, 2.8);
      carve(sx(zm) + 0.5 + sm * 2.2, zm + 0.5, 1.6);
      sites.push({ kind: 'forge', x: sx(zm) + 0.5 + sm * 4.6, z: zm + 0.5, zone: zi, r: 1.1 });
    }
    sites.push({ kind: 'kingdom', x: king[0], z: king[1] + 2, zone: Z_KINGDOM, r: 4.2 });
    // les douves de lave autour de la citadelle, deux ponts (au nord, face aux arrivants, et au sud)
    for (let z = Math.floor(king[1] - 12); z <= king[1] + 13; z++)
      for (let x = Math.floor(king[0] - 12); x <= king[0] + 12; x++) {
        if (!inb(x, z)) continue;
        const d = Math.hypot(x + 0.5 - king[0], z + 0.5 - king[1] - 2);
        if (d > 7.6 && d < 9.6) pool[z * HW + x] = HPOOL_LAVA;
      }

    // lacs de lave au cœur des grandes salles annexes, loin de la faille
    this.walls();
    for (let z = BORDER; z < HL - BORDER; z++)
      for (let x = BORDER; x < HW - BORDER; x++) {
        const k = z * HW + x, zi = this.zone[k];
        if (!open[k] || pool[k] || this.wallDist[k] < 3 || zi === Z_PORTAL || zi === Z_CLIFFS) continue;
        if (Math.abs(x + 0.5 - sx(z) - 0.5) < SPINE_R[zi] + 2.5) continue;
        if (zi === Z_KINGDOM && Math.hypot(x + 0.5 - king[0], z + 0.5 - king[1] - 2) < 12) continue;
        if (sites.some((s) => Math.hypot(s.x - x - 0.5, s.z - z - 0.5) < s.r + 3)) continue;
        if (s4.fbm(x * 0.09 + 50, z * 0.09, 2) > 0.12) pool[k] = HPOOL_LAVA;
      }
    // les ponts : sur la faille au-dessus de la rivière, un second plus loin ; sur les douves (nord et sud)
    const bridgeAt = (x: number, z: number) => { if (this.inside(x, z) && pool[z * HW + x] === HPOOL_LAVA) this.bridge[z * HW + x] = 1; };
    for (const bx of [Math.round(sx(r0)), Math.round(sx(r0)) + (sideOf(Z_RIVER, 13) * 10)])
      for (let z = Math.floor(r0 - 4); z <= r0 + 4; z++) for (let dx = -1; dx <= 0; dx++) bridgeAt(bx + dx, z);
    for (let z = Math.floor(king[1] - 10); z <= king[1] + 13; z++) for (let dx = -1; dx <= 0; dx++) bridgeAt(Math.round(king[0]) + dx, z);
    // un bassin de lave sur la faille même (hors des ponts) se comble : le chemin reste ouvert
    for (let z = 4; z < HL - 6; z++) {
      const x = Math.round(sx(z)), k = z * HW + x;
      if (pool[k] === HPOOL_LAVA && !this.bridge[k] && Math.abs(z - r0) > 4 && zoneOfZ(z) !== Z_KINGDOM) pool[k] = 0;
    }

    for (const s of sites) this.footprint(s, 1);
    // les poches qu'on n'atteint pas depuis le portail sont rebouchées (sauf les bassins, que l'on voit de loin)
    const start = this.nearestWalkable(this.arrival[0], this.arrival[1]);
    const reach = this.distances(start);
    for (let k = 0; k < HW * HL; k++) if (open[k] && !pool[k] && !this.block[k] && reach[k] < 0) open[k] = 0;
    this.walls();

    // le sol : ondulé ; les bassins se creusent
    for (let k = 0; k < HW * HL; k++) {
      const x = k % HW, z = (k - x) / HW;
      this.floor[k] = 0.1 + s5.fbm(x * 0.12, z * 0.12, 2) * 0.16;
    }

    // les zones de garnison : postes de garde autour des bâtiments, boucle de patrouille le long de la faille
    this.zones = HELL_ZONES.map((zd, id) => ({ id, name: zd.name, z0: zd.z0, z1: zoneEnd(id), sites: sites.filter((s) => s.zone === id), posts: [], patrol: [] }));
    for (const zn of this.zones) {
      for (const s of zn.sites) {
        const n = s.kind === 'kingdom' ? 10 : s.kind === 'fortress' ? 6 : 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + hash2(i, zn.id, 21), rr = s.r + 1.3 + hash2(i, zn.id, 22) * 1.2;
          const c = this.nearestWalkable(s.x + Math.sin(a) * rr, s.z + Math.cos(a) * rr, 3);
          if (c >= 0) zn.posts.push([(c % HW) + 0.5, Math.floor(c / HW) + 0.5]);
        }
      }
      const len = zn.z1 - zn.z0;
      for (const f of [0.25, 0.55, 0.85, 0.55]) {
        const z = Math.floor(zn.z0 + len * f), c = this.nearestWalkable(sx(z) + 0.5, z + 0.5, 4);
        if (c >= 0) zn.patrol.push([(c % HW) + 0.5, Math.floor(c / HW) + 0.5]);
      }
    }
    this.buildVis(s5);
  }

  /** Distance aux parois (parcours en largeur depuis la roche) */
  private walls() {
    const open = this.open, wd = this.wallDist, queue = new Int32Array(HW * HL);
    let head = 0, tail = 0;
    for (let k = 0; k < HW * HL; k++) if (!open[k]) { wd[k] = 0; queue[tail++] = k; } else wd[k] = 255;
    while (head < tail) {
      const k = queue[head++], x = k % HW, z = Math.floor(k / HW), d = wd[k];
      if (d >= 8) continue;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= HW || nz >= HL) continue;
        const nk = nz * HW + nx;
        if (wd[nk] > d + 1) { wd[nk] = d + 1; queue[tail++] = nk; }
      }
    }
  }

  /**
   * Relief affiché, comme sous terre : champ d'ouverture adouci (la paroi monte là où il passe son seuil), bassins de lave
   * en pente douce, abîmes profonds ; crêtes des parois bosselées, sol à petites bosses
   */
  private buildVis(noise: Simplex) {
    const W = HW, L = HL;
    const blur = (src: Float32Array) => {
      const out = new Float32Array(W * L);
      for (let z = 0; z < L; z++)
        for (let x = 0; x < W; x++) {
          let s = 0;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) s += src[Math.min(L - 1, Math.max(0, z + dz)) * W + Math.min(W - 1, Math.max(0, x + dx))] * (dx ? 1 : 2) * (dz ? 1 : 2);
          out[z * W + x] = s / 16;
        }
      return out;
    };
    const o0 = new Float32Array(W * L), l0 = new Float32Array(W * L), c0 = new Float32Array(W * L), fl = new Float32Array(W * L);
    for (let k = 0; k < W * L; k++) {
      o0[k] = this.open[k]; l0[k] = this.pool[k] === HPOOL_LAVA ? 1 : 0; c0[k] = this.pool[k] === HPOOL_CHASM ? 1 : 0;
      fl[k] = this.pool[k] ? 0.1 : this.floor[k];
    }
    const open = blur(blur(o0)), lava = blur(blur(l0)), chasm = blur(c0);
    const sample = (f: Float32Array, fx: number, fz: number) => {
      const x = Math.min(W - 1.001, Math.max(0, fx)), z = Math.min(L - 1.001, Math.max(0, fz)), ix = Math.floor(x), iz = Math.floor(z), u = x - ix, v = z - iz, i = iz * W + ix;
      return (f[i] * (1 - u) + f[i + 1] * u) * (1 - v) + (f[i + W] * (1 - u) + f[i + W + 1] * u) * v;
    };
    const step = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
    for (let z = 0; z < HVL; z++)
      for (let x = 0; x < HVW; x++) {
        const wx = noise.noise2(x * 0.11, z * 0.11) * 0.3, wz = noise.noise2(x * 0.11 + 31, z * 0.11 - 17) * 0.3;
        const fx = x / VR - 0.5 + wx, fz = z / VR - 0.5 + wz;
        const op = sample(open, fx, fz), rock = 1 - step(ROCK_ISO, FLOOR_ISO, op);
        const deep = step(0.25, 0.7, sample(lava, fx, fz)), abyss = step(0.3, 0.75, sample(chasm, x / VR - 0.5, z / VR - 0.5));
        const ground = sample(fl, x / VR - 0.5, z / VR - 0.5) - deep * 0.68 - abyss * 1.9;
        const i = z * HVW + x;
        const f = noise.fbm(x * 0.21, z * 0.21, 2), b0 = f * 0.03, b1 = f * 0.23 + noise.noise2(x * 0.7 + 40, z * 0.7) * 0.08;
        this.vis[i] = ground + (UWALL - ground) * rock + b0 + (b1 - b0) * rock;
        this.vOpen[i] = op; this.vGround[i] = ground; this.vBump0[i] = b0; this.vBump1[i] = b1;
      }
  }
}
