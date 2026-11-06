import { Simplex } from './noise';
import { mulberry32, smoothstep, clamp, lerp } from '../core/rng';

/**
 * Versions du générateur du continent, sauvegardées avec la partie. Le relief est sauvegardé tel quel, mais le climat (donc
 * les biomes, et les zones du monde souterrain qui les suivent) se recalcule au chargement depuis la graine : chaque partie
 * garde la version qui l'a créée. 1 : agencement fixe, seuls les détails changent avec la graine (parties d'avant le plan) ;
 * 2 : agencement tiré de la graine (plan du continent) ; 3 : plan plus libre (contrées, côte, rivière, relief), tourné ou
 * retourné (huit orientations), lacs, forêts et bosquets en nombre variable
 */
export const GEN_FIXED = 1, GEN_PLAN = 2, GEN_VAR = 3;
/** Version des nouvelles parties */
export const GEN = GEN_VAR;

/**
 * Orientation du plan (version 3) : `o` de 0 à 7, bit 1 : miroir est-ouest, bit 2 : miroir nord-sud, bit 4 : échange des
 * axes. Passe des coordonnées du monde (sommets de 0 à n) à celles du plan ; le milieu de la carte reste le milieu
 */
export function toPlan(o: number, x: number, z: number, n: number): [number, number] {
  let a = o & 1 ? n - x : x, b = o & 2 ? n - z : z;
  if (o & 4) [a, b] = [b, a];
  return [a, b];
}
/** Inverse de `toPlan` : des coordonnées du plan à celles du monde */
export function fromPlan(o: number, a: number, b: number, n: number): [number, number] {
  if (o & 4) [a, b] = [b, a];
  return [o & 1 ? n - a : a, o & 2 ? n - b : b];
}

/** Relief de fond des versions 1 et 2 : finesse et amplitude du bruit, bombement vers le cœur du continent */
const RELIEF0 = { freq: 0.03, amp: 1.6, lift: 1.4 };

/** Crêtes : 1 sur les lignes de crête, 0 dans les creux */
const ridge = (s: Simplex, x: number, z: number, f: number) => 1 - Math.abs(s.noise2(x * f, z * f));

/**
 * Continent de la version 1 : plateaux en gradins au nord-ouest, montagnes enneigées et leur rivière, île volcanique au
 * sud-ouest, grand lac et son îlot, mesas du désert, archipel tropical ; contrées toujours à la même place
 */
export function fixedHeight(x: number, z: number, n: number, s: Simplex, s2: Simplex, phase: number) {
  const u = x / n, v = z / n;
  // coordonnées déformées : côtes, rives du lac et bords des contrées découpés
  const wu = u + s2.fbm(x * 0.012, z * 0.012, 3) * 0.13, wv = v + s2.fbm(x * 0.012 + 31, z * 0.012, 3) * 0.13;
  const ru = u + s.fbm(x * 0.03 + 17, z * 0.03, 2) * 0.035, rv = v + s.fbm(x * 0.03, z * 0.03 + 17, 2) * 0.035;
  /** 1 au cœur d'une contrée (centre cu, cv, rayon r en part de carte), 0 au-delà */
  const zone = (cu: number, cv: number, r: number) => smoothstep(1, 0.55, Math.hypot(ru - cu, rv - cv) / r);
  const d = Math.hypot((wu - 0.5) / 0.45, (wv - 0.47) / 0.43);
  let h = 0.9 + s.fbm(x * 0.03, z * 0.03, 4) * 1.6 + (1 - d) * 1.4;
  // montagnes enneigées au nord-est, où naît la rivière : massif plus haut en son cœur, grandes crêtes hérissées de pics
  const mnt = zone(0.7, 0.18, 0.26);
  if (mnt > 0) {
    const big = Math.pow(ridge(s2, x, z, 0.05), 1.5), peaks = Math.pow(ridge(s, x + 40, z, 0.13), 2) * (0.35 + 0.65 * big);
    h += mnt * (2.2 + mnt * 1.6 + 7.2 * big * (0.75 + 0.35 * s.fbm(x * 0.02 + 5, z * 0.02, 2)) + 3 * peaks);
  }
  // plateaux en gradins et falaises au nord-ouest
  const pla = zone(0.22, 0.26, 0.22);
  if (pla > 0) {
    const t = (1.4 + s.fbm(x * 0.045, z * 0.045, 3) * 1.6) * 1.5, f = t - Math.floor(t);
    h = lerp(h, Math.floor(t) * 1.1 + smoothstep(0.86, 1, f) * 1.1 + 0.4, pla);
  }
  // mesas du désert à l'est : tables à sommet plat, flancs abrupts
  const mes = zone(0.83, 0.55, 0.17);
  if (mes > 0) {
    const m = s2.fbm(x * 0.06 + 11, z * 0.06, 2);
    h = lerp(h, 0.9 + smoothstep(0.04, 0.12, m) * 2.6 + s.fbm(x * 0.1, z * 0.1, 2) * 0.15, mes);
  }
  // grand lac à l'ouest, avec un îlot boisé
  const lake = smoothstep(0.35, 0.85, zone(0.3, 0.55, 0.13)), islet = zone(0.285, 0.53, 0.028);
  h = lerp(h, lerp(-0.9, 1.1, islet), lake);
  // collines de l'île volcanique au sud-ouest (le volcan est ajouté ensuite)
  h += zone(0.22, 0.8, 0.16) * 0.8 * s.fbm(x * 0.07, z * 0.07, 3);
  // mer tout autour
  h = lerp(h, Math.min(h, -1), smoothstep(0.92, 1.08, d));
  // archipel au sud-est : îles semées dans la mer
  const arch = zone(0.84, 0.86, 0.15);
  if (arch > 0) {
    const a = s2.fbm(x * 0.09 + 70, z * 0.09, 3);
    h = Math.max(h, lerp(-1, smoothstep(0.1, 0.3, a) * (1.3 + a * 2) - 0.2, arch));
  }
  // rivière : des montagnes jusqu'à la côte sud, à travers les prairies
  if (v > 0.14) {
    const rx = n * (0.62 - (v - 0.16) * 0.12 + 0.05 * Math.sin(z * 0.045 + phase) + 0.02 * Math.sin(z * 0.11 + phase * 2));
    const dr = Math.abs(x - rx), w = smoothstep(0.14, 0.22, v);
    h = lerp(h, Math.min(h, 0.5), Math.exp(-(dr * dr) / (2 * 7 * 7)) * 0.7 * w);
    h = lerp(h, -0.9, Math.exp(-(dr * dr) / (2 * 2.1 * 2.1)) * w);
  }
  return h;
}

/** Contrée du plan : centre (u, v) et rayon r en part de carte, axe tourné de a (radians), étirée de e le long de cet axe (1 : ronde) */
export interface Zone { u: number; v: number; r: number; a: number; e: number }

/** Distance au centre d'une contrée, rapportée à son rayon (1 sur son pourtour), dans son repère tourné et étiré */
export function zoneDist(q: Zone, u: number, v: number) {
  const du = u - q.u, dv = v - q.v, c = Math.cos(q.a), s = Math.sin(q.a), k = Math.sqrt(q.e);
  return Math.hypot((du * c + dv * s) / k, (dv * c - du * s) * k) / q.r;
}

/** Plan du continent (version 2) : où se trouvent ses contrées, leur taille, leur forme et leur orientation, tirés de la graine */
export interface ContinentPlan {
  /** côte : ellipse (centre, demi-axes, rotation) déformée par un bruit (amplitude, finesse) ; caps (d > 0) et baies (d < 0) à l'angle t, larges de w */
  coast: { u: number; v: number; ru: number; rv: number; a: number; warp: number; freq: number; capes: { t: number; w: number; d: number }[] };
  /** montagnes enneigées : chaîne orientée selon son axe, et ses grands sommets (rayon r, hauteur h) */
  mountains: Zone & { peaks: { u: number; v: number; r: number; h: number }[] };
  /** plateaux en gradins : finesse du bruit des terrasses, nombre de niveaux et hauteur d'une marche */
  plateaus: Zone & { freq: number; levels: number; step: number };
  /** grand lac et son îlot */
  lake: Zone & { islet: Zone };
  /** île volcanique : largeur du détroit qui la sépare du continent (en part de son rayon) */
  volcano: Zone & { strait: number };
  /** mesas : finesse et seuil du bruit des tables, hauteur des tables */
  mesas: Zone & { freq: number; cut: number; top: number };
  /** archipel : finesse et seuil du bruit des îles */
  archipelago: Zone & { freq: number; cut: number };
  /** rivière : source (u, v), embouchure (u), méandres (amplitudes, nombres d'ondulations, phases) */
  river: { u: number; v: number; mouth: number; a1: number; k1: number; p1: number; a2: number; k2: number; p2: number };
  /** vent dominant (angle) : il oriente les dunes du désert */
  wind: number;
  /** orientation du plan sur la carte (`toPlan`), 0 avant la version 3 */
  orient: number;
  /** relief de fond (version 3 ; absent : celui des versions 1 et 2) */
  relief?: { freq: number; amp: number; lift: number };
}

/** Distance au centre du continent, rapportée à son rayon (côte vers 1) : ellipse tournée, qui s'avance en caps ou se creuse en baies selon l'angle */
function coastDist(c: ContinentPlan['coast'], u: number, v: number) {
  const du = u - c.u, dv = v - c.v, ca = Math.cos(c.a), sa = Math.sin(c.a), ang = Math.atan2(dv, du);
  let d = Math.hypot((du * ca + dv * sa) / c.ru, (dv * ca - du * sa) / c.rv);
  for (const k of c.capes) {
    const da = Math.atan2(Math.sin(ang - k.t), Math.cos(ang - k.t));
    d -= k.d * Math.exp(-(da * da) / (2 * k.w * k.w));
  }
  return d;
}

/** Abscisse (part de carte) de la rivière à la hauteur v : de la source vers l'embouchure, en méandres qui s'amorcent peu à peu */
export function riverU(r: ContinentPlan['river'], v: number) {
  const t = clamp((v - r.v) / (1 - r.v), 0, 1);
  return lerp(r.u, r.mouth, t) + smoothstep(0, 0.15, t) * (r.a1 * Math.sin(t * r.k1 + r.p1) + r.a2 * Math.sin(t * r.k2 + r.p2));
}

/** Point du pourtour d'une contrée à l'angle t (dans son repère), à la distance f rapportée au rayon */
function rim(q: Zone, t: number, f: number): [number, number] {
  const al = Math.cos(t) * f * q.r * Math.sqrt(q.e), ac = Math.sin(t) * f * q.r / Math.sqrt(q.e), c = Math.cos(q.a), s = Math.sin(q.a);
  return [q.u + al * c - ac * s, q.v + al * s + ac * c];
}

/** Portée du détroit de l'île volcanique (rapportée à son rayon) : irrégulier, il fait de 0,6 à 1,4 fois sa largeur moyenne */
const straitReach = (vo: ContinentPlan['volcano']) => 1.15 + vo.strait * 1.4;

/**
 * Le plan est jouable et lisible : le lac reste fermé (ses eaux loin de la côte et du détroit), le massif et les mesas dans
 * les terres (une baie ne les rogne pas), l'archipel au large, les mesas à l'écart de l'archipel, et la rivière ne frôle ni
 * le lac, ni les mesas, ni l'île, ni l'archipel, ni les plateaux
 */
function fits(p: ContinentPlan) {
  const { lake, volcano, mesas, archipelago, plateaus, mountains, river } = p, reach = straitReach(volcano);
  for (let k = 0; k < 16; k++) {
    const [u, v] = rim(lake, (k * Math.PI) / 8, 0.9);
    if (coastDist(p.coast, u, v) > 0.86 || zoneDist(volcano, u, v) < reach + 0.05) return false;
  }
  if (coastDist(p.coast, mountains.u, mountains.v) > 0.86 || coastDist(p.coast, mesas.u, mesas.v) > 0.82 || coastDist(p.coast, archipelago.u, archipelago.v) < 0.95) return false;
  if (Math.hypot(mesas.u - archipelago.u, mesas.v - archipelago.v) < (mesas.r + archipelago.r) * 0.85) return false;
  for (let v = river.v; v < 1; v += 0.01) {
    const u = riverU(river, v);
    if (zoneDist(lake, u, v) < 1.35 || zoneDist(mesas, u, v) < 1.15 || zoneDist(volcano, u, v) < reach + 0.25 || zoneDist(archipelago, u, v) < 1 || zoneDist(plateaus, u, v) < 0.9) return false;
  }
  return true;
}

/**
 * Tire le plan du continent de la graine. L'agencement reste celui du continent d'origine (plateaux au nord-ouest, montagnes
 * au nord, lac à l'ouest, île volcanique au sud-ouest, mesas à l'est, archipel au sud-est, rivière vers la côte sud), mais
 * chaque contrée bouge, grandit ou rapetisse, s'étire et tourne ; un tirage qui ne convient pas (`fits`) est refait. La
 * version 3 (`gen`) tire de plus larges écarts, un relief de fond propre à la partie et une orientation du plan sur la carte
 */
export function continentPlan(seed: number, gen = GEN): ContinentPlan {
  const v3 = gen >= GEN_VAR;
  const rnd = v3 ? mulberry32(seed * 991 + 7121) : mulberry32(seed * 977 + 4049);
  const R = (a: number, b: number) => lerp(a, b, rnd());
  /** bornes de la version 2, ou celles, plus larges, de la version 3 */
  const W = (a: number, b: number, a3: number, b3: number) => (v3 ? R(a3, b3) : R(a, b));
  const zone = (u0: number, u1: number, v0: number, v1: number, r0: number, r1: number, e1: number, sp = 0.03): Zone =>
    v3 ? { u: R(u0 - sp, u1 + sp), v: R(v0 - sp, v1 + sp), r: R(r0 * 0.9, r1 * 1.1), a: R(0, Math.PI), e: R(1, 1 + (e1 - 1) * 1.5) }
      : { u: R(u0, u1), v: R(v0, v1), r: R(r0, r1), a: R(0, Math.PI), e: R(1, e1) };
  for (let tries = 0; tries < 100; tries++) {
    const coast = {
      u: R(0.48, 0.52), v: R(0.45, 0.49), ru: W(0.43, 0.47, 0.42, 0.47), rv: W(0.41, 0.45, 0.4, 0.45), a: W(-0.2, 0.2, -0.35, 0.35), warp: W(0.1, 0.15, 0.09, 0.18), freq: W(0.01, 0.015, 0.009, 0.018),
      capes: Array.from({ length: 2 + Math.floor(rnd() * (v3 ? 6 : 4)) }, () => ({ t: R(-Math.PI, Math.PI), w: R(0.2, 0.5), d: (rnd() < 0.5 ? -1 : 1) * W(0.06, 0.16, 0.05, 0.2) })),
    };
    // la chaîne court d'ouest en est, plus ou moins de biais ; ses sommets s'égrènent le long de son axe
    const m = { ...zone(0.62, 0.76, 0.15, 0.22, 0.22, 0.27, 1.5, 0.02), peaks: [] as ContinentPlan['mountains']['peaks'] };
    m.a = W(-0.6, 0.6, -0.8, 0.8);
    for (let k = 2 + Math.floor(rnd() * (v3 ? 5 : 4)); k > 0; k--) {
      const al = R(-0.55, 0.55) * m.r * Math.sqrt(m.e), ac = R(-0.2, 0.2) * m.r / Math.sqrt(m.e);
      m.peaks.push({ u: m.u + al * Math.cos(m.a) - ac * Math.sin(m.a), v: m.v + al * Math.sin(m.a) + ac * Math.cos(m.a), r: R(0.025, 0.045), h: W(2.5, 4.5, 2, 5) });
    }
    const plateaus = { ...zone(0.17, 0.26, 0.21, 0.3, 0.19, 0.24, 1.35), freq: W(0.035, 0.055, 0.03, 0.065), levels: W(1.3, 1.75, 1.2, 1.95), step: W(0.95, 1.25, 0.9, 1.35) };
    // l'îlot, près du centre du lac, reste loin de ses rives même quand le lac est étroit
    const l = zone(0.26, 0.34, 0.46, 0.55, 0.11, 0.14, 1.4), ia = R(0, 2 * Math.PI), io = R(0, 0.22) * l.r / Math.sqrt(l.e);
    const lake = { ...l, islet: { u: l.u + io * Math.cos(ia), v: l.v + io * Math.sin(ia), r: R(0.026, 0.033), a: 0, e: 1 } };
    const volcano = { ...zone(0.15, 0.24, 0.79, 0.85, 0.11, 0.15, 1.3, 0.02), strait: R(0.07, 0.15) };
    const mesas = { ...zone(0.79, 0.86, 0.47, 0.6, 0.14, 0.18, 1.4, 0.02), freq: W(0.05, 0.075, 0.045, 0.085), cut: R(0.02, 0.08), top: W(2.2, 3, 2, 3.3) };
    const archipelago = { ...zone(0.8, 0.87, 0.83, 0.88, 0.13, 0.17, 1.4, 0.015), freq: W(0.085, 0.115, 0.075, 0.13), cut: R(0.1, 0.15) };
    // la rivière naît dans le flanc ouest du massif
    const river = {
      u: m.u + W(-0.1, 0, -0.14, 0.02), v: Math.max(0.1, m.v + R(-0.07, -0.02)), mouth: W(0.45, 0.62, 0.4, 0.66), a1: W(0.02, 0.055, 0.02, 0.075), k1: W(3.5, 8, 3, 9),
      p1: R(0, 2 * Math.PI), a2: R(0.006, 0.018), k2: R(12, 22), p2: R(0, 2 * Math.PI),
    };
    const p: ContinentPlan = { coast, mountains: m, plateaus, lake, volcano, mesas, archipelago, river, wind: R(0, Math.PI), orient: 0 };
    if (v3) {
      p.relief = { freq: R(0.022, 0.04), amp: R(1.2, 2.1), lift: R(1.1, 1.8) };
      p.orient = Math.floor(rnd() * 8);
    }
    if (fits(p)) return p;
  }
  return SAFE_PLAN;
}

/** Plan de secours, si aucun tirage ne convient (cela n'arrive pour ainsi dire jamais) : les contrées à peu près à la place de celles du continent d'origine */
const SAFE_PLAN: ContinentPlan = (() => {
  const z = (u: number, v: number, r: number): Zone => ({ u, v, r, a: 0, e: 1 });
  return {
    coast: { u: 0.5, v: 0.47, ru: 0.45, rv: 0.43, a: 0, warp: 0.13, freq: 0.012, capes: [] },
    mountains: { ...z(0.7, 0.18, 0.26), peaks: [{ u: 0.66, v: 0.17, r: 0.035, h: 3.5 }, { u: 0.76, v: 0.2, r: 0.035, h: 3 }] },
    plateaus: { ...z(0.22, 0.26, 0.22), freq: 0.045, levels: 1.5, step: 1.1 },
    lake: { ...z(0.3, 0.5, 0.125), islet: z(0.29, 0.49, 0.026) },
    volcano: { ...z(0.19, 0.82, 0.13), strait: 0.08 },
    mesas: { ...z(0.83, 0.55, 0.16), freq: 0.06, cut: 0.04, top: 2.6 },
    archipelago: { ...z(0.85, 0.87, 0.15), freq: 0.09, cut: 0.1 },
    river: { u: 0.62, v: 0.14, mouth: 0.54, a1: 0.035, k1: 6, p1: 0, a2: 0.012, k2: 16, p2: 0 },
    wind: 0.43,
    orient: 0,
  };
})();

/** Continent de la version 2 : mêmes contrées que la version 1, placées, taillées et orientées selon le plan */
export function plannedHeight(x: number, z: number, n: number, s: Simplex, s2: Simplex, p: ContinentPlan) {
  const u = x / n, v = z / n, c = p.coast;
  // coordonnées déformées : côtes, rives du lac et bords des contrées découpés
  const wu = u + s2.fbm(x * c.freq, z * c.freq, 3) * c.warp, wv = v + s2.fbm(x * c.freq + 31, z * c.freq, 3) * c.warp;
  const ru = u + s.fbm(x * 0.03 + 17, z * 0.03, 2) * 0.035, rv = v + s.fbm(x * 0.03, z * 0.03 + 17, 2) * 0.035;
  /** 1 au cœur d'une contrée, 0 au-delà de son pourtour */
  const zone = (q: Zone) => smoothstep(1, 0.55, zoneDist(q, ru, rv));
  const d = coastDist(c, wu, wv), rl = p.relief ?? RELIEF0;
  let h = 0.9 + s.fbm(x * rl.freq, z * rl.freq, 4) * rl.amp + (1 - d) * rl.lift;
  // montagnes enneigées au nord, où naît la rivière : grandes crêtes alignées sur la chaîne, hérissées de pics, et ses grands sommets
  const m = p.mountains, mnt = zone(m);
  if (mnt > 0) {
    const cm = Math.cos(m.a), sm = Math.sin(m.a), al = x * cm + z * sm, ac = z * cm - x * sm;
    const big = Math.pow(ridge(s2, al * 0.7, ac * 1.4, 0.05), 1.5), peaks = Math.pow(ridge(s, x + 40, z, 0.13), 2) * (0.35 + 0.65 * big);
    let top = 0;
    for (const pk of m.peaks) top = Math.max(top, pk.h * smoothstep(1, 0, Math.hypot(u - pk.u, v - pk.v) / pk.r));
    h += mnt * (2.2 + mnt * 1.6 + 6.4 * big * (0.75 + 0.35 * s.fbm(x * 0.02 + 5, z * 0.02, 2)) + 3 * peaks + top * (0.7 + 0.5 * peaks));
  }
  // plateaux en gradins et falaises au nord-ouest : terrasses étirées selon l'axe de la contrée
  const pl = p.plateaus, pla = zone(pl);
  if (pla > 0) {
    const cp = Math.cos(pl.a), sp = Math.sin(pl.a), al = x * cp + z * sp, ac = z * cp - x * sp;
    const t = (1.4 + s.fbm(al * pl.freq * 0.8, ac * pl.freq * 1.25, 3) * 1.6) * pl.levels, f = t - Math.floor(t);
    h = lerp(h, Math.floor(t) * pl.step + smoothstep(0.86, 1, f) * pl.step + 0.4, pla);
  }
  // mesas du désert à l'est : tables à sommet plat, flancs abrupts, alignées selon l'axe de la contrée
  const me = p.mesas, mes = zone(me);
  if (mes > 0) {
    const cm = Math.cos(me.a), sm = Math.sin(me.a), al = x * cm + z * sm, ac = z * cm - x * sm;
    const q = s2.fbm(al * me.freq * 0.8 + 11, ac * me.freq * 1.25, 2);
    h = lerp(h, 0.9 + smoothstep(me.cut, me.cut + 0.08, q) * me.top + s.fbm(x * 0.1, z * 0.1, 2) * 0.15, mes);
  }
  // grand lac à l'ouest, avec un îlot boisé (assez haut pour que les mares du marais ne le noient pas)
  const lake = smoothstep(0.35, 0.85, zone(p.lake)), islet = zone(p.lake.islet);
  h = lerp(h, lerp(-0.9, 1.6, islet), lake);
  // collines de l'île volcanique au sud-ouest (le volcan est ajouté ensuite)
  const vo = p.volcano, vd = zoneDist(vo, ru, rv) + s2.fbm(x * 0.06 + 23, z * 0.06, 2) * 0.12;
  h += smoothstep(1, 0.55, vd) * 0.8 * s.fbm(x * 0.07, z * 0.07, 3);
  // mer tout autour ; une rive de terre borde le grand lac, même au plus près de la côte, assez haute pour que les mares du
  // marais ne la percent pas (elles ne se creusent que sous 1,2)
  h = lerp(h, Math.min(h, -1), smoothstep(0.92, 1.08, d));
  const ld = zoneDist(p.lake, ru, rv);
  h = Math.max(h, lerp(h, 1.25, smoothstep(0.82, 0.92, ld) * smoothstep(1.3, 1.1, ld)));
  // un détroit peu profond, plus ou moins large, sépare l'île du continent ; l'île elle-même sort de la mer
  const sw = vo.strait * (0.6 + 0.8 * smoothstep(-0.35, 0.35, s.fbm(x * 0.04 + 9, z * 0.04, 2)));
  const strait = smoothstep(0.82, 0.88, vd) * (1 - smoothstep(0.97 + sw, 1.05 + sw, vd));
  h = lerp(h, Math.min(h, -0.7), strait);
  h = Math.max(h, lerp(-1.2, 0.9 + 0.5 * s.fbm(x * 0.07 + 3, z * 0.07, 3), smoothstep(0.88, 0.7, vd)));
  // archipel au sud-est : îles semées dans la mer, qui recouvre en son cœur la côte du continent (les îles ne s'y soudent pas)
  const ar = p.archipelago, arch = zone(ar);
  if (arch > 0) {
    const a = s2.fbm(x * ar.freq + 70, z * ar.freq, 3);
    h = lerp(h, Math.min(h, -0.8), arch * arch);
    h = Math.max(h, lerp(-1, smoothstep(ar.cut, ar.cut + 0.2, a) * (1.3 + a * 2) - 0.2, arch));
  }
  // rivière : des montagnes jusqu'à la côte sud, à travers les prairies, dans une vallée dont le fond descend vers la mer
  // (abaissée vers un fond en pente, puis un peu plus vers l'aval, même là où le pays est déjà bas)
  const r = p.river;
  if (v > r.v) {
    const dr = Math.abs(x - n * riverU(r, v)), w = smoothstep(r.v, r.v + 0.08, v), t = Math.min(1, ((v - r.v) / (1 - r.v)) * 1.15);
    const valley = Math.exp(-(dr * dr) / (2 * 7 * 7)) * w;
    h = lerp(h, Math.min(h, 0.2 + 2.4 * Math.pow(1 - t, 1.6)), valley * 0.85) - valley * t * 0.35;
    h = lerp(h, -0.9, Math.exp(-(dr * dr) / (2 * 2.1 * 2.1)) * w);
  }
  // la mer borde toute la carte
  return lerp(h, Math.min(h, -1), smoothstep(4, 1, Math.min(x, z, n - x, n - z)));
}

/**
 * Climat de fond (sans le relief) de chaque case : la température monte du nord au sud et vers l'est, l'humidité suit un
 * bruit. Avec le plan (version 2), le désert se resserre autour des mesas, les tropiques autour de l'archipel, et les rives
 * du grand lac s'humidifient (marais), pas son îlot
 */
export function fillClimate(gen: number, seed: number, n: number, temp: Float32Array, wet: Float32Array) {
  const st = new Simplex(seed * 13 + 5), sm = new Simplex(seed * 17 + 9), p = gen >= GEN_PLAN ? continentPlan(seed, gen) : null;
  for (let wz = 0; wz < n; wz++)
    for (let wx = 0; wx < n; wx++) {
      // le climat suit le plan, tourné ou retourné avec lui (version 3)
      let cx = wx, cz = wz;
      if (p?.orient) { const [a, b] = toPlan(p.orient, wx + 0.5, wz + 0.5, n); cx = a - 0.5; cz = b - 0.5; }
      const u = (cx + 0.5) / n - 0.5, v = (cz + 0.5) / n - 0.5;
      // froid au nord, chaud au sud et à l'est (mesas du désert, archipel tropical)
      const base = v * 1.5 + Math.max(0, u) * 1.1 - 0.05;
      let t = base + st.fbm(cx * 0.03, cz * 0.03, 3) * 0.45, m = sm.fbm(cx * 0.04 + 50, cz * 0.04, 3) * 0.8;
      if (p) {
        const dry = smoothstep(1.8, 0.7, zoneDist(p.mesas, u + 0.5, v + 0.5)), tropic = smoothstep(1.9, 0.8, zoneDist(p.archipelago, u + 0.5, v + 0.5));
        t += (dry + tropic) * 0.25;
        const ld = zoneDist(p.lake, u + 0.5, v + 0.5), islet = smoothstep(1.8, 1, zoneDist(p.lake.islet, u + 0.5, v + 0.5));
        m += tropic * 0.5 - dry * 0.5 + smoothstep(0.55, 0.85, ld) * smoothstep(1.3, 0.95, ld) * 0.25 - islet * 0.4;
      }
      temp[wz * n + wx] = t;
      wet[wz * n + wx] = m;
    }
}
